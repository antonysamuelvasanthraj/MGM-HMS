import { all, get, run, insert, update, one, tx, nextNo, today, nowIso, localStamp } from './db.js';
import { publish } from './realtime.js';
import { audit } from './auth.js';
import { requestContext } from './context.js';
import { syncBillAccounting, syncAdvance, itemMoney, revenueHead } from './accounting.js';
import { linkBillCase, isApprovedStage } from './payer-cases.js';

/** Wrap an async/sync handler so thrown errors become clean JSON. */
export const h = (fn) => (req, res) => {
  try {
    const out = requestContext.run({ req, user: req.user }, () => fn(req, res));
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    if (e && e.http) return res.status(e.http).json({ error: e.message, ...e.extra });
    console.error('[api]', req.method, req.originalUrl, e);
    res.status(500).json({ error: 'server_error', detail: String(e.message || e) });
  }
};

export function fail(http, message, extra) {
  const e = new Error(message); e.http = http; e.extra = extra || {}; throw e;
}

export function requireOrderClearance(order) {
  if (!order) fail(404, 'order_not_found');
  if (order.status === 'cancelled') fail(409, 'order_cancelled');
  const encounter = get('SELECT kind,priority FROM encounters WHERE id=?', order.encounter_id);
  if (encounter?.kind === 'EMG' || encounter?.priority === 'emergency') return;
  // Inpatient services go on the running IP bill and are settled at discharge.
  if (encounter?.kind === 'IP') return;
  const bills = all(`SELECT b.* FROM bills b JOIN bill_items i ON i.bill_id=b.id WHERE i.order_id=?`, order.id);
  if (bills.some(b => b.status === 'cancelled' || (b.balance > 0 && b.authorization_status !== 'approved' && !isApprovedStage(b.claim_status))) ||
      (!bills.length && order.status === 'awaiting_payment')) fail(409, 'payment_or_authorization_required');
}

/**
 * A result was published: tell the ordering doctor in-app and queue a message
 * for the patient (sent once an SMS / WhatsApp gateway is configured).
 */
export function notifyResultPublished(order, what = 'report') {
  const p = get('SELECT id, name, mobile FROM patients WHERE id=?', order.patient_id);
  if (order.ordered_by) insert('notifications', {
    user_id: order.ordered_by, level: 'info', title: `${what === 'imaging' ? 'Imaging report' : 'Lab report'} ready — ${order.label}`,
    body: `${p?.name || ''} · ${order.order_no}`, link: what === 'imaging' ? `/imaging?order=${order.id}` : `/laboratory?order=${order.id}`,
  });
  if (p) insert('patient_messages', {
    patient_id: p.id, channel: 'sms', mobile: p.mobile, ref_type: 'order', ref_id: order.id,
    body: `Dear ${p.name}, your ${order.label} report (${order.order_no}) is ready. Please collect it or consult your doctor.`,
  });
}

export const num = (v, d = 0) => (v === '' || v === null || v === undefined || isNaN(+v) ? d : +v);
export const money = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';

/** Build a WHERE clause from {col: value} pairs, skipping empty values. */
export function where(map, extra = []) {
  const parts = [...extra], args = [];
  for (const [sql, val] of Object.entries(map)) {
    if (val === undefined || val === null || val === '' || val === 'all') continue;
    parts.push(sql); args.push(val);
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', args };
}

/** Patient summary used by every clinical header banner. */
export function patientCard(id) {
  const p = get('SELECT * FROM patients WHERE id=?', id);
  if (!p) return null;
  p.allergies = all('SELECT * FROM allergies WHERE patient_id=? ORDER BY severity DESC', id);
  p.problems = all("SELECT * FROM problems WHERE patient_id=? AND status<>'resolved'", id);
  p.outstanding = one(
    `SELECT coalesce(sum(balance),0) FROM bills WHERE patient_id=? AND status IN ('unpaid','partial')`, id) || 0;
  p.visits = one('SELECT count(*) FROM encounters WHERE patient_id=?', id) || 0;
  p.last_visit = one('SELECT max(visit_date) FROM encounters WHERE patient_id=?', id);
  return p;
}

/**
 * Recompute a bill from its lines and everything that has cleared it.
 *
 *   total   = Σ line totals − discount        (pharmacy MRP lines are tax-inclusive)
 *   paid    = money actually received         (payments)
 *   covered = taken over by a payer           (insurance, Aarogyasri, corporate, credit, trust)
 *   waived  = approved free treatment
 *   balance = what the patient still owes
 *
 * The ledger is then brought in line with the bill, so every route that
 * changes a bill accounts for it by calling this.
 */
/** Price of a service for a patient: the agreed rate of the patient's payer if one exists, else the hospital tariff. */
export function priceFor(svc, patientId) {
  if (!svc) return 0;
  const p = patientId ? get('SELECT payer_id, payer_type FROM patients WHERE id=?', patientId) : null;
  if (p?.payer_id && p.payer_type && p.payer_type !== 'self') {
    const r = get('SELECT price FROM service_rates WHERE payer_id=? AND service_id=?', p.payer_id, svc.id);
    if (r) return r.price;
  }
  return svc.price || 0;
}

export function recalcBill(billId) {
  const b = get('SELECT * FROM bills WHERE id=?', billId);
  if (!b) return null;
  const enc = b.encounter_id ? get('SELECT kind FROM encounters WHERE id=?', b.encounter_id) : null;
  const items = all('SELECT * FROM bill_items WHERE bill_id=?', billId);
  let gross = 0, tax = 0, lineTotal = 0;
  for (const it of items) {
    const m = itemMoney(it);
    gross += m.taxable; tax += m.tax; lineTotal += m.total;
    const head = it.revenue_head || revenueHead(it, b, enc);
    if (head !== it.revenue_head) update('bill_items', it.id, { revenue_head: head });
  }
  gross = money(gross); tax = money(tax);
  const discount = money(b.discount || 0);
  const total = money(lineTotal - discount);
  const paid = money(one('SELECT coalesce(sum(amount),0) FROM payments WHERE bill_id=? AND cancelled=0', billId) || 0);
  const covered = money(one(`SELECT coalesce(sum(amount - transferred_to_patient),0) FROM bill_settlements
    WHERE bill_id=? AND status<>'cancelled' AND mode NOT IN ('free','due')`, billId) || 0);
  const waived = money(one(`SELECT coalesce(sum(amount),0) FROM bill_settlements
    WHERE bill_id=? AND status<>'cancelled' AND mode='free'`, billId) || 0);
  const balance = money(total - paid - covered - waived);
  let status = b.status;
  if (status !== 'cancelled') {
    if (balance <= 0.005) status = total <= 0 ? 'paid' : paid >= total - 0.005 ? 'paid' : 'covered';
    else status = paid > 0 || covered > 0 || waived > 0 ? 'partial' : 'unpaid';
  }
  update('bills', billId, { gross, tax, total, paid, balance, status,
    covered_amount: covered, waived_amount: waived, free_treatment_value: waived });
  syncBillAccounting(billId);
  syncAdvance(billId);
  linkBillCase(billId);
  const linked=get('SELECT claim_id FROM bills WHERE id=?',billId);
  if(linked?.claim_id){
    const sums=get(`SELECT coalesce(sum(r.amount),0) received,coalesce(sum(r.disallowed),0) disallowed FROM settlement_receipts r JOIN bill_settlements s ON s.id=r.settlement_id WHERE s.claim_id=? AND s.status<>'cancelled'`,linked.claim_id);
    const open=get(`SELECT coalesce(sum(amount-settled_amount-written_off-transferred_to_patient),0) value FROM bill_settlements WHERE claim_id=? AND status<>'cancelled' AND mode NOT IN ('free','due')`,linked.claim_id).value;
    const patient=get("SELECT coalesce(sum(max(balance,0)),0) value FROM bills WHERE claim_id=? AND status<>'cancelled'",linked.claim_id).value;
    const c=get('SELECT status FROM insurance_claims WHERE id=?',linked.claim_id);
    const closed=sums.received>0&&open<0.005&&patient<0.005;
    update('insurance_claims',linked.claim_id,{settled:money(sums.received),disallowed:money(sums.disallowed),...(closed?{status:'settled',settled_at:nowIso()}:c?.status==='settled'?{status:'claim_submitted',settled_at:null}:{})});
  }
  return get('SELECT * FROM bills WHERE id=?', billId);
}

/** Keep encounter.payment_status in step with its OP, IP or emergency bill. */
export function syncEncounterPayment(encounterId) {
  const enc = get('SELECT * FROM encounters WHERE id=?', encounterId);
  if (!enc || enc.payment_status === 'free' || enc.payment_status === 'waived') return enc;
  const consultBill = get(
    `SELECT * FROM bills WHERE encounter_id=? AND bill_type=? AND status<>'cancelled'
      ORDER BY id LIMIT 1`, encounterId, enc.kind === 'EMG' ? 'ER' : enc.kind === 'IP' ? 'IP' : 'OP');
  if (!consultBill) return enc;
  const settled = ['paid', 'covered'].includes(consultBill.status);
  const ps = settled ? 'paid' : consultBill.paid > 0 || consultBill.covered_amount > 0 ? 'partial' : 'pending';
  if (ps !== enc.payment_status) {
    update('encounters', encounterId, { payment_status: ps });
    return get('SELECT * FROM encounters WHERE id=?', encounterId);
  }
  return enc;
}

/** Queue rows shared by OP registration, vitals, doctor queue and display boards. */
export function queueRows(filter = {}) {
  const date = filter.date || today();
  const w = where({
    'e.doctor_id = ?': filter.doctor_id,
    'e.department_id = ?': filter.department_id,
    'e.stage = ?': filter.stage,
    'e.payment_status = ?': filter.payment_status,
  }, ['e.visit_date = ?', "e.kind = 'OP'"]);
  const rows = all(
    `SELECT e.*, p.uhid, p.name AS patient_name, p.gender, p.age_years, p.mobile, p.vip,
            p.payer_type, p.blood_group,
            d.name AS doctor_name, dep.name AS dept_name, dep.code AS dept_code,
            (SELECT count(*) FROM vitals v WHERE v.encounter_id = e.id) AS vitals_count,
            (SELECT json_object('id',v.id,'bp_sys',v.bp_sys,'bp_dia',v.bp_dia,'pulse',v.pulse,'spo2',v.spo2,'temp_f',v.temp_f,'grbs',v.grbs,'resp_rate',v.resp_rate,'pain_score',v.pain_score)
               FROM vitals v WHERE v.encounter_id = e.id ORDER BY v.id DESC LIMIT 1) AS last_vitals,
            (SELECT count(*) FROM orders o WHERE o.encounter_id = e.id) AS order_count,
            (SELECT count(*) FROM orders o WHERE o.encounter_id = e.id
               AND o.status NOT IN ('verified','dispensed','cancelled')) AS orders_open,
            (SELECT coalesce(sum(balance),0) FROM bills b
               WHERE b.encounter_id = e.id AND b.status IN ('unpaid','partial')) AS due,
            (SELECT b.bill_no FROM bills b WHERE b.encounter_id = e.id
               AND b.status IN ('unpaid','partial') ORDER BY b.id LIMIT 1) AS due_bill_no,
            (SELECT b.id FROM bills b WHERE b.encounter_id = e.id
               AND b.status IN ('unpaid','partial') ORDER BY b.id LIMIT 1) AS due_bill_id,
            (SELECT count(*) FROM allergies a WHERE a.patient_id = p.id) AS allergy_count,
            (SELECT count(*) FROM bills b WHERE b.encounter_id = e.id AND b.bill_type IN ('OP','IP')
               AND b.status <> 'cancelled' AND b.authorization_status = 'approved') AS fee_authorized
       FROM encounters e
       JOIN patients p  ON p.id = e.patient_id
       LEFT JOIN users d ON d.id = e.doctor_id
       LEFT JOIN departments dep ON dep.id = e.department_id
       ${w.sql}
      ORDER BY e.priority='emergency' DESC, e.priority='urgent' DESC, e.token_no ASC, e.id ASC`,
    date, ...w.args);
  for (const r of rows) { try { r.last_vitals = r.last_vitals ? JSON.parse(r.last_vitals) : null; } catch { r.last_vitals = null; } }
  return rows;
}

/**
 * Gate used before a patient may be called in to the doctor.
 * Emergency encounters are never gated on money — that is a deliberate rule.
 */
export function callGate(enc) {
  const reasons = [];
  if (enc.kind === 'EMG' || enc.priority === 'emergency') return { ok: true, reasons };
  const gatePay = setting('gate_doctor_on_payment') === '1';
  const gateVit = setting('gate_doctor_on_vitals') === '1';
  if (gatePay && !['paid', 'free', 'waived'].includes(enc.payment_status)
      && !one(`SELECT count(*) FROM bills WHERE encounter_id=? AND bill_type IN ('OP','IP') AND status<>'cancelled' AND authorization_status='approved'`, enc.id)) {
    reasons.push('Payment pending');
  }
  if (gateVit) {
    const v = one('SELECT count(*) FROM vitals WHERE encounter_id=?', enc.id);
    if (!v) reasons.push('Vitals not recorded');
  }
  return { ok: reasons.length === 0, reasons };
}

const settingsCache = new Map();
export function setting(key, fallback = null) {
  if (settingsCache.has(key)) return settingsCache.get(key);
  const v = one('SELECT value FROM settings WHERE key=?', key) ?? fallback;
  settingsCache.set(key, v);
  return v;
}
export function setSetting(key, value) {
  if (get('SELECT 1 FROM settings WHERE key=?', key)) run('UPDATE settings SET value=? WHERE key=?', String(value), key);
  else insert('settings', { key, value: String(value) });
  settingsCache.set(key, String(value));
}

/** Everything that changes state goes through here: audit + realtime in one place. */
export function emit(req, { topics, event, data, action, entity, entityId, detail }) {
  if (action) audit(req, action, entity, entityId, detail);
  queueSync(entity, entityId, action);
  publish([...new Set([].concat(topics || [], 'audit'))], event, data);
}

function queueSync(entity, entityId, op) {
  if (!entity) return;
  try { insert('sync_queue', { entity, entity_id: entityId, op: op || 'update', status: 'queued' }); } catch {}
}

/** ISO date `n` days before today (negative n = future). */
export const dateAgo = (n) => localStamp(new Date(Date.now() - n * 864e5)).slice(0, 10);

export { all, get, run, insert, update, one, tx, nextNo, today, nowIso, localStamp, publish };
