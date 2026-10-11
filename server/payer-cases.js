/**
 * Payer cases. Anything billed to someone other than the patient —
 * insurance, Aarogyasri, corporate or trust — belongs to one case on
 * the Insurance & Payer desk, whichever department raised the bill:
 *   - an admission's bills (and the ER bill of the case it came from) share the admission's case;
 *   - OP / ER / lab / imaging / pharmacy bills of one visit share that visit's case;
 *   - a bill with no visit (e.g. a counter pharmacy sale) gets a case of its own.
 * Each bill remembers its case (bills.claim_id) and the case's stage
 * (bills.claim_status), so every desk can show "Insurance · approval pending"
 * instead of a bare "Unpaid".
 */
import { all, get, insert, update, run, nextNo, nowIso } from './db.js';

export const PAYER_TYPES = ['insurance', 'aarogyasri', 'corporate', 'trust'];
/**
 * Credit is not a payer: the patient (or a staff member) owes the amount and pays later — an inpatient
 * at discharge, staff on a later date. A credit bill is marked "due approved" so care is never held,
 * and the balance stays a patient due. It never opens a case on the payer desk.
 */
export const CREDIT = 'credit';
const LABEL = { insurance: 'Insurance', aarogyasri: 'Aarogyasri', corporate: 'Corporate', credit: 'Credit', trust: 'Trust' };
const CLAIM_TYPE = { insurance: 'cashless', aarogyasri: 'scheme', corporate: 'corporate', credit: 'credit', trust: 'trust' };
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
/** Case stages at which the payer has agreed to pay: lab and imaging work on the case goes ahead without waiting for money. */
export const APPROVED_STAGES = ['preauth_approved', 'claim_submitted', 'settled'];
export const isApprovedStage = (s) => APPROVED_STAGES.includes(s);

/**
 * Release lab / imaging orders held for payment on an approved case (or one bill of it).
 * Only releases work; the amount stays owed until reception bills it to the payer or collects it.
 * Returns the released order ids.
 */
export function releaseApprovedOrders(claimId, billId = null) {
  const c = get('SELECT status FROM insurance_claims WHERE id=?', claimId);
  if (!c || !isApprovedStage(c.status)) return [];
  const ids = all(`SELECT DISTINCT o.id FROM orders o JOIN bill_items bi ON bi.order_id=o.id JOIN bills b ON b.id=bi.bill_id
      WHERE o.status='awaiting_payment' AND b.claim_id=? AND b.status<>'cancelled' ${billId ? 'AND b.id=?' : ''}`, ...(billId ? [claimId, billId] : [claimId])).map((r) => r.id);
  for (const id of ids) update('orders', id, { status: 'ordered', billed: 1 });
  return ids;
}
const norm = (c) => (c === 'scheme' ? 'aarogyasri' : c);

/** Payer types whose cases open already approved (no pre-authorisation). Setting payer_auto_approve, default corporate,trust. */
function autoApproved(category) {
  const v = get("SELECT value FROM settings WHERE key='payer_auto_approve'")?.value;
  return String(v ?? 'corporate,trust').split(',').map((x) => x.trim()).filter(Boolean).includes(category);
}

function openCase({ patient_id, encounter_id = null, admission_id = null, bill_id = null, category, note }) {
  const p = get('SELECT payer_name, policy_no, payer_id FROM patients WHERE id=?', patient_id) || {};
  const auto = autoApproved(category);
  const id = insert('insurance_claims', {
    claim_no: nextNo('claim'), patient_id, encounter_id, admission_id, bill_id, payer_type: category, payer_id: p.payer_id || null,
    tpa: p.payer_name || LABEL[category], policy_no: p.policy_no || null, claim_type: CLAIM_TYPE[category],
    estimate: 0, status: auto ? 'preauth_approved' : 'preauth_pending',
    stage_note: auto ? `${note} — approved automatically (${LABEL[category]} needs no pre-authorisation)` : note,
  });
  return get('SELECT * FROM insurance_claims WHERE id=?', id);
}

/** Case estimate = everything billed on it so far (kept current until someone edits the estimate by hand). */
function refreshEstimate(claimId) {
  const c = get('SELECT * FROM insurance_claims WHERE id=?', claimId);
  if (!c || c.updated_at) return;
  const t = r2(get("SELECT coalesce(sum(total),0) t FROM bills WHERE claim_id=? AND status<>'cancelled'", claimId).t);
  if (Math.abs(t - c.estimate) > 0.005) update('insurance_claims', claimId, { estimate: t });
}

/** Open (or update) the case of an admission and link all its bills. */
export function ensurePayerCase(admission) {
  const cat = norm(admission.financial_category);
  let c = get('SELECT * FROM insurance_claims WHERE admission_id=? ORDER BY id DESC LIMIT 1', admission.id);
  if (!PAYER_TYPES.includes(cat)) return c || null;
  const er = admission.emergency_id ? get('SELECT encounter_id FROM emergency_cases WHERE id=?', admission.emergency_id)?.encounter_id : null;
  // Admitted from ER: the case opened at the ER visit becomes the admission case — one case, same number,
  // keeping its history, approval and any payer entries — instead of a second, empty one.
  if (!c && er) {
    const erCase = get(`SELECT * FROM insurance_claims WHERE encounter_id=? AND admission_id IS NULL AND status<>'rejected' ORDER BY id DESC LIMIT 1`, er);
    if (erCase) {
      update('insurance_claims', erCase.id, { admission_id: admission.id, encounter_id: admission.encounter_id, payer_type: cat, claim_type: CLAIM_TYPE[cat],
        stage_note: `${erCase.stage_note ? `${erCase.stage_note} · ` : ''}Continued as the admission case (admitted from ER)` });
      c = get('SELECT * FROM insurance_claims WHERE id=?', erCase.id);
    }
  }
  if (!c) c = openCase({ patient_id: admission.patient_id, encounter_id: admission.encounter_id, admission_id: admission.id, category: cat,
    note: `Opened automatically at admission (${LABEL[cat]})` });
  else if (c.payer_type !== cat) { update('insurance_claims', c.id, { payer_type: cat, claim_type: CLAIM_TYPE[cat] }); c = get('SELECT * FROM insurance_claims WHERE id=?', c.id); }
  run(`UPDATE bills SET claim_id=?, claim_status=? WHERE encounter_id IN (?, ?) AND payer_type NOT IN ('self','') AND status<>'cancelled'`,
    c.id, c.status, admission.encounter_id, er || -1);
  refreshEstimate(c.id);
  return c;
}

/** Called whenever a bill changes (from recalcBill): make sure a payer bill sits on a case. */
export function linkBillCase(billId) {
  const b = get('SELECT id, patient_id, encounter_id, payer_type, claim_id, claim_status, status FROM bills WHERE id=?', billId);
  if (!b) return null;
  const cat = norm(b.payer_type);
  if (!PAYER_TYPES.includes(cat)) {
    if (b.claim_id) update('bills', b.id, { claim_id: null, claim_status: null });
    if (cat === CREDIT) approveCreditDue(b.id);
    return null;
  }
  let c = null;
  // 1. an admission's own bills, or the ER bill of the case the patient was admitted from
  const adm = b.encounter_id ? get(`SELECT a.* FROM admissions a WHERE a.encounter_id=?
      OR a.emergency_id IN (SELECT ec.id FROM emergency_cases ec WHERE ec.encounter_id=?) ORDER BY a.id DESC LIMIT 1`, b.encounter_id, b.encounter_id) : null;
  if (adm && PAYER_TYPES.includes(norm(adm.financial_category))) c = ensurePayerCase(adm);
  // 2. the visit's case (OP, ER, lab, imaging, pharmacy of one encounter)
  if (!c && b.encounter_id) {
    c = get('SELECT * FROM insurance_claims WHERE encounter_id=? AND admission_id IS NULL AND payer_type=? ORDER BY id DESC LIMIT 1', b.encounter_id, cat)
      || openCase({ patient_id: b.patient_id, encounter_id: b.encounter_id, category: cat, note: `Opened automatically for a ${LABEL[cat]} bill` });
  }
  // 3. a bill with no visit: the patient's open case of this payer (current admission first), else a case of its own
  if (!c) {
    c = (b.claim_id && get('SELECT * FROM insurance_claims WHERE id=?', b.claim_id))
      || get('SELECT * FROM insurance_claims WHERE bill_id=? ORDER BY id DESC LIMIT 1', b.id)
      || get(`SELECT c.* FROM insurance_claims c LEFT JOIN admissions a ON a.id=c.admission_id
          WHERE c.patient_id=? AND c.payer_type=? AND c.status NOT IN ('settled','rejected')
            AND (a.id IS NULL OR a.status<>'discharged') AND date(c.created_at) >= date('now','localtime','-30 day')
          ORDER BY (a.id IS NOT NULL AND a.status<>'discharged') DESC, c.id DESC LIMIT 1`, b.patient_id, cat)
      || openCase({ patient_id: b.patient_id, bill_id: b.id, category: cat, note: `Opened automatically for a ${LABEL[cat]} bill` });
  }
  if (b.claim_id !== c.id || b.claim_status !== c.status) update('bills', b.id, { claim_id: c.id, claim_status: c.status });
  refreshEstimate(c.id);
  releaseApprovedOrders(c.id, b.id);
  return c;
}

/**
 * Credit (pay later): the open balance is an approved due owed by the patient. Services go ahead;
 * the patient settles later (at discharge, or on the agreed date). Idempotent.
 */
export function approveCreditDue(billId) {
  const b = get('SELECT id, balance, status, authorization_status FROM bills WHERE id=?', billId);
  if (!b || b.status === 'cancelled' || !(b.balance > 0.005) || b.authorization_status === 'approved') return false;
  update('bills', b.id, { authorization_status: 'approved' });
  run(`UPDATE orders SET status='ordered', billed=1 WHERE status='awaiting_payment' AND id IN (SELECT order_id FROM bill_items WHERE bill_id=?)`, b.id);
  return true;
}

/** A case moved stage: every bill on it shows the new stage. */
export function syncClaimToBills(claimId) {
  const c = get('SELECT id, status FROM insurance_claims WHERE id=?', claimId);
  if (c) run('UPDATE bills SET claim_status=? WHERE claim_id=?', c.status, c.id);
}

/** On start-up: every payer admission and every payer bill sits on a case. */
export function backfillPayerCases() {
  const before = get('SELECT count(*) n FROM insurance_claims').n;
  const autoTypes = String(get("SELECT value FROM settings WHERE key='payer_auto_approve'")?.value ?? 'corporate,trust').split(',').map((x) => x.trim()).filter(Boolean);
  const approvedNow = [];
  for (const c of all(`SELECT id, claim_no, payer_type FROM insurance_claims WHERE status='preauth_pending'`)) {
    if (!autoTypes.includes(c.payer_type)) continue;
    update('insurance_claims', c.id, { status: 'preauth_approved', stage_note: `Approved automatically (${LABEL[c.payer_type] || c.payer_type} needs no pre-authorisation)` });
    approvedNow.push(c.claim_no);
  }
  backfillPayerCases.approved = approvedNow;
  for (const a of all(`SELECT * FROM admissions WHERE financial_category NOT IN ('self','') AND status<>'requested'`)) ensurePayerCase(a);
  for (const b of all(`SELECT id FROM bills WHERE payer_type NOT IN ('self','') AND status<>'cancelled' AND claim_id IS NULL`)) linkBillCase(b.id);
  for (const c of all('SELECT id FROM insurance_claims')) syncClaimToBills(c.id);
  return get('SELECT count(*) n FROM insurance_claims').n - before;
}
