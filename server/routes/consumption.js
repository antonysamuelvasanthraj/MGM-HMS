/**
 * Procedure consumables — medicines and consumables used during a procedure, recorded where they were used.
 *
 *   procedure (OP procedure line, ER case, OT case, ward procedure)
 *     → items used, from that store (FEFO batches, never an expired batch)
 *     → stock falls and every batch movement is recorded
 *     → a charge line on the same bill as the procedure (or ₹0 when the procedure's price already includes
 *       its consumables) and the cost of the items to the books
 *
 * Duplicate-charge protection: a procedure line or OT case records its consumables once (reverse and record
 * again to correct); items the pharmacy already charged to the same visit in the last 6 hours are flagged;
 * a procedure whose tariff includes consumables never charges them a second time.
 * A standard kit per procedure pre-fills the list; staff change it to what was actually used.
 */
import { Router } from 'express';
import { requireAuth, can } from '../auth.js';
import { h, fail, all, get, one, insert, update, run, num, money, nowIso, today, tx, emit, recalcBill } from '../lib.js';
import { postVoucher, reverseSource } from '../accounting.js';
import { billNewToPayer } from '../payer-billing.js';
import { activeAssignment, applyPackage } from '../packages.js';
import { ipBill } from '../ipd-charges.js';

export const consumption = Router();
const STORES = ['OP', 'IP', 'ICU', 'ER', 'OT', 'Ward'];
const mayRecord = (u) => can(u, 'pharmacy.dispense') || can(u, 'emergency.treat') || can(u, 'ot.schedule') || can(u, 'nursing.write') || can(u, 'ipd.manage') || can(u, 'billing.create');
const TOPICS = ['pharmacy', 'inventory', 'billing', 'dashboard'];

/* ------------------------------------------------------------- standard kits */

consumption.get('/procedure-kits/:serviceId', requireAuth, h((req) => {
  const svc = get('SELECT id, code, name, price, category, consumables_included FROM services WHERE id=?', +req.params.serviceId) || fail(404, 'service_not_found');
  return { service: svc, items: all(`SELECT k.medicine_id, k.qty, m.name, m.kind, m.dispensing_unit FROM procedure_kits k JOIN medicines m ON m.id=k.medicine_id WHERE k.service_id=? ORDER BY m.name`, svc.id) };
}));

consumption.put('/procedure-kits/:serviceId', requireAuth, h((req) => tx(() => {
  if (!can(req.user, 'admin.view') && !can(req.user, 'inventory.approve')) fail(403, 'forbidden', { need: 'admin.view' });
  const svc = get('SELECT * FROM services WHERE id=?', +req.params.serviceId) || fail(404, 'service_not_found');
  const before = all('SELECT medicine_id, qty FROM procedure_kits WHERE service_id=?', svc.id);
  const items = (req.body?.items || []).map((i) => ({ medicine_id: num(i.medicine_id), qty: Number(i.qty) })).filter((i) => i.medicine_id && i.qty > 0);
  for (const i of items) if (!get('SELECT 1 FROM medicines WHERE id=?', i.medicine_id)) fail(400, 'medicine_not_found', { medicine_id: i.medicine_id });
  run('DELETE FROM procedure_kits WHERE service_id=?', svc.id);
  for (const i of items) insert('procedure_kits', { service_id: svc.id, medicine_id: i.medicine_id, qty: i.qty });
  if ('consumables_included' in (req.body || {})) update('services', svc.id, { consumables_included: req.body.consumables_included ? 1 : 0 });
  emit(req, { topics: ['admin'], event: 'service.updated', data: { id: svc.id }, action: 'procedure_kit.save', entity: 'services', entityId: svc.id,
    detail: { before: { items: before, consumables_included: svc.consumables_included }, after: { items, consumables_included: req.body?.consumables_included ? 1 : 0 } } });
  return { ok: true };
})));

/* ----------------------------------------------------------- what was used */

/** Where a procedure's consumables are charged, and the visit they belong to. */
function resolveSource(b, userId) {
  if (b.source_type === 'bill_item') {
    const it = get('SELECT * FROM bill_items WHERE id=?', num(b.source_id)) || fail(404, 'procedure_line_not_found');
    if (it.amount <= 0 || it.waiver_of) fail(409, 'procedure_line_not_chargeable');
    const bill = get('SELECT * FROM bills WHERE id=?', it.bill_id);
    if (bill.status === 'cancelled') fail(409, 'bill_cancelled');
    return { bill, encounterId: bill.encounter_id, patientId: bill.patient_id, serviceId: it.service_id, label: it.description, unique: { bill_item_id: it.id } };
  }
  if (b.source_type === 'ot') {
    const o = get('SELECT * FROM ot_bookings WHERE id=?', num(b.source_id)) || fail(404, 'ot_booking_not_found');
    if (o.status === 'cancelled') fail(409, 'ot_case_cancelled');
    const adm = o.admission_id ? get("SELECT * FROM admissions WHERE id=? AND status<>'discharged'", o.admission_id) : null;
    let bill = adm ? ipBill(adm) : o.bill_id ? get('SELECT * FROM bills WHERE id=?', o.bill_id) : null;
    if (!bill) {
      const bid = insert('bills', { bill_no: `OT-${o.booking_no}`, patient_id: o.patient_id, encounter_id: null, bill_type: 'OP', status: 'unpaid',
        payer_type: get('SELECT payer_type FROM patients WHERE id=?', o.patient_id)?.payer_type || 'self', source: 'ot', source_id: o.id, created_by: userId });
      update('ot_bookings', o.id, { bill_id: bid });
      bill = get('SELECT * FROM bills WHERE id=?', bid);
    }
    const charges = JSON.parse(o.charges || '[]');
    return { bill, encounterId: bill.encounter_id, patientId: o.patient_id, serviceId: charges.find((c) => c.service_id)?.service_id || null, label: `${o.procedure} (${o.booking_no})`, unique: { ot_booking_id: o.id } };
  }
  if (b.source_type === 'er') {
    const c = get('SELECT * FROM emergency_cases WHERE id=?', num(b.source_id)) || fail(404, 'emergency_case_not_found');
    if (!c.encounter_id) fail(409, 'register_patient_first');
    let bill = get("SELECT * FROM bills WHERE encounter_id=? AND bill_type='ER' AND status<>'cancelled' ORDER BY id DESC LIMIT 1", c.encounter_id);
    if (!bill) {
      const bid = insert('bills', { bill_no: `ER-${c.case_no}`, patient_id: c.patient_id, encounter_id: c.encounter_id, bill_type: 'ER', status: 'unpaid',
        payer_type: get('SELECT payer_type FROM patients WHERE id=?', c.patient_id)?.payer_type || 'self', source: 'emergency', source_id: c.id, created_by: userId });
      bill = get('SELECT * FROM bills WHERE id=?', bid);
    }
    return { bill, encounterId: c.encounter_id, patientId: c.patient_id, serviceId: null, label: `Emergency care ${c.case_no}`, unique: null };
  }
  if (b.source_type === 'admission') {
    const a = get("SELECT * FROM admissions WHERE id=? AND status<>'discharged'", num(b.source_id)) || fail(404, 'admission_not_found');
    const bill = ipBill(a);
    return { bill, encounterId: a.encounter_id, patientId: a.patient_id, serviceId: null, label: `Ward procedure — ${a.ip_no}`, unique: null };
  }
  fail(400, 'source_type_invalid');
}

/** The standard kit for a procedure line / OT case, to pre-fill the form. */
consumption.get('/consumptions/kit', requireAuth, h((req) => {
  let serviceIds = [];
  if (req.query.source_type === 'bill_item') serviceIds = [get('SELECT service_id FROM bill_items WHERE id=?', num(req.query.source_id))?.service_id].filter(Boolean);
  if (req.query.source_type === 'ot') serviceIds = JSON.parse(get('SELECT charges FROM ot_bookings WHERE id=?', num(req.query.source_id))?.charges || '[]').map((c) => c.service_id).filter(Boolean);
  const items = serviceIds.length ? all(`SELECT k.medicine_id, sum(k.qty) qty, m.name, m.kind FROM procedure_kits k JOIN medicines m ON m.id=k.medicine_id
    WHERE k.service_id IN (${serviceIds.map(() => '?').join(',')}) GROUP BY k.medicine_id ORDER BY m.name`, ...serviceIds) : [];
  const included = serviceIds.some((id) => get('SELECT consumables_included FROM services WHERE id=?', id)?.consumables_included);
  return { items, included };
}));

consumption.post('/consumptions', requireAuth, h((req) => {
  if (!mayRecord(req.user)) fail(403, 'forbidden', { need: 'pharmacy.dispense' });
  const b = req.body || {};
  const location = STORES.includes(b.location) ? b.location : fail(400, 'store_required');
  const items = (b.items || []).map((i) => ({ medicine_id: num(i.medicine_id), qty: Number(i.qty) })).filter((i) => i.medicine_id && i.qty > 0);
  if (!items.length) fail(400, 'items_required');
  return tx(() => {
    const src = resolveSource(b, req.user.id);
    // once per procedure line / OT case — correct a mistake by reversing and recording again
    if (src.unique) {
      const [k, v] = Object.entries(src.unique)[0];
      const dup = get(`SELECT consumption_no FROM procedure_consumptions WHERE ${k}=? AND status='recorded'`, v);
      if (dup) fail(409, 'consumables_already_recorded', { consumption_no: dup.consumption_no });
    }
    const included = !!(src.serviceId && get('SELECT consumables_included FROM services WHERE id=?', src.serviceId)?.consumables_included) || (b.source_type === 'ot' && JSON.parse(get('SELECT charges FROM ot_bookings WHERE id=?', num(b.source_id))?.charges || '[]').some((c) => c.service_id && get('SELECT consumables_included FROM services WHERE id=?', c.service_id)?.consumables_included));
    // items the pharmacy already charged to this visit recently are probably the same items
    const warnings = src.encounterId ? items.map((i) => get(`SELECT m.name, sum(bi.qty) q FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id JOIN medicine_batches mb ON mb.id=bi.batch_id JOIN medicines m ON m.id=mb.medicine_id
        WHERE bl.encounter_id=? AND bl.bill_type IN ('PHARM','IP') AND mb.medicine_id=? AND bi.consumption_id IS NULL AND bi.amount>0 AND bi.created_at >= datetime('now','localtime','-6 hours')`, src.encounterId, i.medicine_id))
      .filter((w) => w?.name).map((w) => `${w.name}: ${w.q} already charged by the pharmacy to this visit today`) : [];
    if (warnings.length && !b.confirm_duplicates) fail(409, 'possible_duplicate_charge', { warnings });
    const no = `CON-${Date.now().toString(36).toUpperCase()}`;
    const cid = insert('procedure_consumptions', { consumption_no: no, patient_id: src.patientId, encounter_id: src.encounterId, bill_id: src.bill.id, location,
      source_type: b.source_type, source_id: num(b.source_id), bill_item_id: src.unique?.bill_item_id || null, ot_booking_id: src.unique?.ot_booking_id || null,
      included: included ? 1 : 0, status: 'recorded', notes: b.notes || null, recorded_by: req.user.id, recorded_at: nowIso() });
    let cost = 0, charged = 0;
    for (const i of items) {
      const med = get('SELECT * FROM medicines WHERE id=?', i.medicine_id);
      const batches = all(`SELECT * FROM medicine_batches WHERE medicine_id=? AND location=? AND qty>0 AND expiry > date('now','localtime') ORDER BY expiry`, med.id, location);
      let need = i.qty;
      for (const bt of batches) {
        if (need <= 0) break;
        const take = Math.min(need, bt.qty);
        update('medicine_batches', bt.id, { qty: bt.qty - take });
        insert('stock_moves', { medicine_id: med.id, batch_id: bt.id, move_type: 'consumption', qty: -take, location, balance_after: bt.qty - take,
          ref_type: 'consumption', ref_id: cid, reason: src.label, created_by: req.user.id });
        const rate = included ? 0 : money(bt.selling_price || bt.mrp);
        cost += take * (bt.purchase_rate || 0);
        charged += take * rate;
        insert('bill_items', { bill_id: src.bill.id, batch_id: bt.id, description: `${med.name} (B:${bt.batch_no})${included ? ' — included in the procedure' : ''} · used in ${src.label}`,
          category: med.kind === 'consumable' ? 'consumable' : 'pharmacy', qty: take, rate, gst_pct: med.gst_pct, amount: money(take * rate), tax_inclusive: 1,
          unit_cost: bt.purchase_rate, revenue_head: 'PHARMACY', consumption_id: cid, created_by: req.user.id, created_at: nowIso() });
        need -= take;
      }
      if (need > 0) fail(409, 'insufficient_stock', { medicine: med.name, short: need, store: location });
    }
    update('procedure_consumptions', cid, { total_cost: money(cost), total_charged: money(charged) });
    if (cost > 0) postVoucher({ type: 'COGS', source: 'consumption', sourceId: cid, narration: `Consumables used · ${src.label} @ ${location}`,
      lines: [{ account: 'cogs_consumables', debit: money(cost), segment: 'PHARMACY' }, { account: 'inventory_pharmacy', credit: money(cost), segment: 'PHARMACY' }] });
    recalcBill(src.bill.id);
    billNewToPayer(req, [src.bill.id]);
    if (src.encounterId) applyPackage(req, activeAssignment({ encounterId: src.encounterId }));
    const row = get('SELECT * FROM procedure_consumptions WHERE id=?', cid);
    emit(req, { topics: [...TOPICS, `patient:${src.patientId}`], event: 'stock.changed', data: { id: cid }, action: 'consumption.record', entity: 'procedure_consumptions', entityId: cid,
      detail: { before: null, after: { items, location, charged: row.total_charged, cost: row.total_cost, bill: src.bill.bill_no }, reason: src.label } });
    return Object.assign(row, { bill_no: src.bill.bill_no, warnings });
  });
}));

/** Wrong items: stock goes back to the same batches, the charges are waived, the cost is reversed. */
consumption.post('/consumptions/:id/reverse', requireAuth, h((req) => tx(() => {
  if (!mayRecord(req.user)) fail(403, 'forbidden');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const c = get('SELECT * FROM procedure_consumptions WHERE id=?', +req.params.id) || fail(404, 'consumption_not_found');
  if (c.status !== 'recorded') fail(409, 'already_reversed');
  const bill = get('SELECT * FROM bills WHERE id=?', c.bill_id);
  for (const l of all('SELECT * FROM bill_items WHERE consumption_id=? AND amount>=0 AND waiver_of IS NULL', c.id)) {
    const bt = get('SELECT * FROM medicine_batches WHERE id=?', l.batch_id);
    update('medicine_batches', bt.id, { qty: bt.qty + l.qty });
    insert('stock_moves', { medicine_id: bt.medicine_id, batch_id: bt.id, move_type: 'consumption_return', qty: l.qty, location: c.location, balance_after: bt.qty + l.qty,
      ref_type: 'consumption', ref_id: c.id, reason, created_by: req.user.id });
    if (l.amount > 0 && bill.status !== 'cancelled') insert('bill_items', { bill_id: c.bill_id, batch_id: l.batch_id, description: `Waived — ${l.description}`, category: l.category, revenue_head: l.revenue_head,
      qty: -l.qty, rate: l.rate, amount: -l.amount, tax_inclusive: 1, waiver_of: l.id, consumption_id: c.id, created_by: req.user.id, created_at: nowIso() });
  }
  reverseSource('consumption', c.id, reason);
  update('procedure_consumptions', c.id, { status: 'reversed', reversed_by: req.user.id, reversed_at: nowIso(), reverse_reason: reason });
  recalcBill(c.bill_id);
  emit(req, { topics: TOPICS, event: 'stock.changed', data: { id: c.id }, action: 'consumption.reverse', entity: 'procedure_consumptions', entityId: c.id,
    detail: { before: { status: 'recorded' }, after: { status: 'reversed' }, reason } });
  return { ok: true };
})));

/** Consumables recorded for a procedure line / OT case / ER case / admission. */
consumption.get('/consumptions', requireAuth, h((req) => {
  const w = [], a = [];
  for (const k of ['source_type', 'bill_id', 'encounter_id', 'patient_id']) if (req.query[k]) { w.push(`c.${k}=?`); a.push(k === 'source_type' ? req.query[k] : num(req.query[k])); }
  if (req.query.source_id) { w.push('c.source_id=?'); a.push(num(req.query.source_id)); }
  return all(`SELECT c.*, u.name recorded_by_name, p.name patient_name, p.uhid FROM procedure_consumptions c LEFT JOIN users u ON u.id=c.recorded_by JOIN patients p ON p.id=c.patient_id
     ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY c.id DESC LIMIT 300`, ...a)
    .map((c) => Object.assign(c, { lines: all('SELECT description, qty, rate, amount, unit_cost FROM bill_items WHERE consumption_id=? AND waiver_of IS NULL', c.id) }));
}));
