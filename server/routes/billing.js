import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, nextNo, today, where, emit, num, money,
  recalcBill, syncEncounterPayment, tx, patientCard, nowIso, priceFor,
} from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import {
  takePayment, settleBill, cancelPayment, cancelSettlement, receiveSettlement, refund,
  billSettlements, collectionReceipt, CATEGORIES, PAYERS, MODE_LABEL,
} from '../payments.js';

import { accrueAdmission } from '../ipd-charges.js';
import { isClosed } from '../accounting.js';
import { billNewToPayer } from '../payer-billing.js';
import { activeAssignment, applyPackage, assignPackage, packageUsage } from '../packages.js';
import { collectionPolicy } from '../collection-policy.js';

/**
 * Once a day is closed its bills and receipts are locked. Only an
 * administrator may change them, always with a reason; the audit row is
 * flagged so post-close edits can be listed separately.
 */
function closedDayGuard(req, date, reason) {
  const d = String(date || '').slice(0, 10);
  if (!d || !isClosed(d)) return {};
  if (!can(req.user, 'admin.write')) fail(409, 'day_closed', { date: d, need: 'admin.write' });
  if (!String(reason || '').trim()) fail(400, 'reason_required');
  return { post_close_edit: true, closed_date: d };
}
/** The day a bill belongs to. A running IP bill spans many days and is locked only once the patient's discharge day is closed. */
function billDay(bill) {
  if (bill.bill_type !== 'IP') return bill.bill_date;
  return get("SELECT date(discharged_at) d FROM admissions WHERE encounter_id=? AND status='discharged'", bill.encounter_id)?.d || null;
}

export const billing = Router();

/**
 * Which bills a login may see. Management, accounts and the insurance desk see every bill. A pharmacy desk
 * sees pharmacy bills only; reception and cashiers see every bill except pharmacy bills (those are settled at
 * the pharmacy). Ward staff with IP rights see inpatient and ER bills. Anyone else (doctors, lab, imaging,
 * HR, housekeeping …) sees no bill lists. Returns null for no access, '' for all, or an SQL condition on `b`.
 */
export function billScope(user) {
  if (can(user, 'admin.view') || can(user, 'finance.view') || can(user, 'insurance.view') || can(user, 'dash.owner')) return '';
  const pharmacyDesk = ['pharmacy', 'store', 'pharmacy_admin'].includes(user.role) || (can(user, 'pharmacy.dispense') && !can(user, 'op.collect'));
  if (pharmacyDesk) return "b.bill_type='PHARM'";
  if (can(user, 'op.collect') || can(user, 'payment.collect') || can(user, 'billing.create')) return "b.bill_type<>'PHARM'";
  if (can(user, 'ipd.manage')) return "b.bill_type IN ('IP','ER')";
  return null;
}


/** An IP bill is always current: accrue the admission's daily charges before showing or settling it. */
function accrueFor(billId) {
  const b = get('SELECT bill_type, encounter_id FROM bills WHERE id=?', billId);
  if (b?.bill_type !== 'IP') return;
  const a = get('SELECT id FROM admissions WHERE encounter_id=?', b.encounter_id);
  if (a) accrueAdmission(a.id);
}

/**
 * Who settles what: pharmacy bills are collected at the pharmacy counter,
 * every other bill (OP, lab, imaging, IP, ER) at reception.
 */
function counterFor(req, bill) {
  if (!bill || can(req.user, 'admin.view') || req.user.role === 'cashier') return;
  const pharmacyDesk = ['pharmacy', 'store', 'pharmacy_admin'].includes(req.user.role);
  if (bill.bill_type === 'PHARM' && !pharmacyDesk) fail(403, 'pharmacy_bill_settled_at_pharmacy');
  if (bill.bill_type !== 'PHARM' && pharmacyDesk) fail(403, 'bill_settled_at_reception');
}
const TOPICS = ['billing', 'dashboard', 'queue', 'lab', 'imaging', 'accounts'];

/**
 * Settle a bill with split lines of any mode - the single payment endpoint
 * every desk uses. See server/payments.js for the rules.
 */
billing.post('/bills/:id/settle', requirePerm('payment.collect'), h((req) => {
  const b = req.body || {};
  accrueFor(+req.params.id);
  const before = get('SELECT * FROM bills WHERE id=?', +req.params.id);
  counterFor(req, before);
  const r = settleBill(req, { bill_id: +req.params.id, lines: b.lines, category: b.category, notes: b.notes,
    request_key: b.request_key, allow_advance: before?.bill_type === 'IP' });
  const view = billView(r.bill.id);
  emit(req, {
    topics: [...TOPICS, 'display', `patient:${view.patient_id}`, view.encounter_id ? `encounter:${view.encounter_id}` : 'billing'],
    event: 'payment.received', data: { ...r, bill: view },
    action: 'payment.settle', entity: 'bills', entityId: view.id,
    detail: { before: pickBill(before), after: pickBill(view), lines: r.summary, category: b.category, reason: b.notes },
  });
  return { ...r, bill: view };
}));

/** Kept for older screens: money-only split, mapped onto the same engine. */
billing.post('/payments/split', requirePerm('payment.collect'), h((req) => {
  const b = req.body || {};
  const r = settleBill(req, { bill_id: +b.bill_id, category: b.category, notes: b.notes,
    request_key: b.request_key || `split-${b.bill_id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    lines: (b.components || []).map((c) => ({ mode: c.mode, amount: c.amount, reference: c.reference, transaction_id: c.transaction_id })) });
  const view = billView(r.bill.id);
  emit(req, { topics: TOPICS, event: 'payment.received', data: { ...r, bill: view },
    action: 'payment.split', entity: 'bills', entityId: view.id, detail: { lines: r.summary } });
  return { ...r, payments: r.receipts, bill: view };
}));

/**
 * Approve services without money: a payer takes over the balance, the balance
 * is approved as due, or it is approved free. No receipt is created.
 */
billing.post('/bills/:id/authorize', requirePerm('payment.authorize'), h((req) => {
  const id = +req.params.id, b = req.body || {};
  const before = get('SELECT * FROM bills WHERE id=?', id);
  if (!before || before.status === 'cancelled') fail(409, 'bill_unavailable');
  if (!CATEGORIES.includes(b.category) || !String(b.reason || '').trim()) fail(400, 'category_and_reason_required');
  if (before.balance <= 0.005) fail(409, 'nothing_outstanding');
  const mode = PAYERS.includes(b.category) ? b.category : b.category === 'free' ? 'free' : 'due';
  settleBill(req, { bill_id: id, category: b.category, notes: b.reason,
    request_key: b.request_key || `auth-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    lines: [{ mode, amount: before.balance, payer_name: b.payer_name, reference: b.reference, reason: b.reason }] });
  const view = billView(id);
  emit(req, { topics: TOPICS, event: 'bill.authorized', data: view,
    action: 'bill.authorize', entity: 'bills', entityId: id,
    detail: { before: pickBill(before), after: pickBill(view), reason: b.reason, mode } });
  return view;
}));

const pickBill = (b) => b && ({ bill_no: b.bill_no, status: b.status, payer_type: b.payer_type, total: b.total,
  discount: b.discount, paid: b.paid, covered: b.covered_amount, waived: b.waived_amount, balance: b.balance,
  authorization: b.authorization_status });

function billView(id) {
  const b = get(
    `SELECT b.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.payer_name,
            e.encounter_no, e.token_no, e.visit_date, e.kind AS encounter_kind,
            u.name created_by_name, c.name counter_name,
            d.name doctor_name
       FROM bills b JOIN patients p ON p.id=b.patient_id
       LEFT JOIN encounters e ON e.id=b.encounter_id
       LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
       LEFT JOIN users u ON u.id=b.created_by
       LEFT JOIN counters c ON c.id=b.counter_id
      WHERE b.id=?`, id);
  if (!b) return null;
  b.items = all('SELECT i.*, vd.name visiting_doctor_name FROM bill_items i LEFT JOIN visiting_doctors vd ON vd.id=i.visiting_doctor_id WHERE i.bill_id=? ORDER BY i.id', id);
  b.payments = all(`SELECT pm.*, u.name received_by_name FROM payments pm
                      LEFT JOIN users u ON u.id=pm.received_by
                     WHERE pm.bill_id=? ORDER BY pm.id`, id);
  b.settlements = billSettlements(id);
  Object.assign(b, collectionPolicy(b));
  return b;
}
export { billView };

/* ------------------------------------------------------------------- bills */

/**
 * Doctor orders waiting at reception: lab, imaging and procedures that cannot
 * start until paid, covered by a payer, or approved as due / free.
 */
billing.get('/service-queue', requirePerm('payment.collect'), h((req) => {
  const rows = all(`SELECT o.id order_id, o.order_no, o.category, o.label, o.priority, o.status, o.ordered_at,
      p.id patient_id, p.name patient_name, p.uhid, p.mobile, p.payer_type, p.payer_name, u.name doctor_name, e.kind encounter_kind,
      b.id bill_id, b.bill_no, b.total, b.paid, b.balance, b.status bill_status, b.authorization_status, b.payer_type bill_payer, b.claim_status
    FROM orders o JOIN patients p ON p.id=o.patient_id JOIN encounters e ON e.id=o.encounter_id
    LEFT JOIN users u ON u.id=o.ordered_by
    LEFT JOIN bill_items bi ON bi.order_id=o.id LEFT JOIN bills b ON b.id=bi.bill_id AND b.status<>'cancelled'
    WHERE o.category IN ('lab','imaging','procedure') AND o.status NOT IN ('cancelled','verified')
      AND ${req.query.show === 'cleared' ? "date(o.ordered_at)=date('now','localtime') AND o.status<>'awaiting_payment'" : "o.status='awaiting_payment'"}
    ORDER BY o.priority='stat' DESC, o.id LIMIT 300`);
  // one row per bill, listing its services
  const byBill = new Map();
  for (const r of rows) {
    const k = r.bill_id || `o${r.order_id}`;
    if (!byBill.has(k)) byBill.set(k, { ...r, services: [] });
    byBill.get(k).services.push({ order_no: r.order_no, label: r.label, category: r.category, priority: r.priority, status: r.status });
  }
  return [...byBill.values()];
}));

billing.get('/bills', requirePerm('billing.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.date) { extra.push('b.bill_date = ?'); args.push(req.query.date); }
  if (req.query.from) { extra.push('b.bill_date >= ?'); args.push(req.query.from); }
  if (req.query.to) { extra.push('b.bill_date <= ?'); args.push(req.query.to); }
  if (req.query.type && req.query.type !== 'all') { extra.push('b.bill_type = ?'); args.push(req.query.type); }
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'outstanding') extra.push("b.status IN ('unpaid','partial')");
    else { extra.push('b.status = ?'); args.push(req.query.status); }
  }
  if (req.query.patient_id) { extra.push('b.patient_id = ?'); args.push(+req.query.patient_id); }
  if (req.query.counter_id) { extra.push('b.counter_id = ?'); args.push(+req.query.counter_id); }
  if (req.query.q) {
    extra.push('(b.bill_no LIKE ? OR p.name LIKE ? OR p.uhid LIKE ? OR p.mobile LIKE ?)');
    const l = `%${req.query.q}%`; args.push(l, l, l, l);
  }
  const scope = billScope(req.user);
  if (scope === null) fail(403, 'forbidden', { need: 'billing desk' });
  if (scope) extra.push(scope);
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  const rows = all(
    `SELECT b.*, p.uhid, p.name patient_name, p.mobile,
            e.token_no, e.encounter_no, d.name doctor_name, c.name counter_name
       FROM bills b JOIN patients p ON p.id=b.patient_id
       LEFT JOIN encounters e ON e.id=b.encounter_id
       LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
       LEFT JOIN counters c ON c.id=b.counter_id
       ${w} ORDER BY b.id DESC LIMIT ?`, ...args, Math.min(num(req.query.limit, 200), 500));
  const agg = get(`SELECT count(*) n, coalesce(sum(total),0) total, coalesce(sum(paid),0) paid,
                          coalesce(sum(balance),0) balance FROM bills b JOIN patients p ON p.id=b.patient_id ${w}`, ...args);
  return { rows: rows.map(b => ({ ...b, ...collectionPolicy(b) })), summary: agg };
}));

billing.get('/bills/:id', requireAuth, h((req) => {
  // a bill is visible only to logins whose desk covers it (see billScope)
  const scope = billScope(req.user);
  if (scope === null) fail(403, 'forbidden', { need: 'billing desk' });
  if (scope && !get(`SELECT 1 FROM bills b WHERE b.id=? AND ${scope}`, +req.params.id)) fail(404, 'bill_not_found');
  accrueFor(+req.params.id);
  return billView(+req.params.id) || fail(404, 'bill_not_found');
}));

/**
 * Waive a charge line at final billing (e.g. a monitor day not used, a doctor
 * visit not made). A negative line cancels it, with the reason and approver
 * in the audit trail; the original line stays on record.
 */
billing.post('/bills/:id/items/:itemId/waive', requireAuth, h((req) => {
  if (!can(req.user, 'payment.authorize') && !can(req.user, 'billing.discount')) fail(403, 'forbidden', { need: 'payment.authorize' });
  const bid = +req.params.id;
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const item = get('SELECT * FROM bill_items WHERE id=? AND bill_id=?', +req.params.itemId, bid);
  if (!item || item.amount <= 0 || item.waiver_of) fail(404, 'item_not_waivable');
  if (get('SELECT 1 FROM bill_items WHERE waiver_of=?', item.id)) fail(409, 'already_waived');
  const before = get('SELECT * FROM bills WHERE id=?', bid);
  if (!before || before.status === 'cancelled') fail(409, 'bill_unavailable');
  const lock = closedDayGuard(req, billDay(before), reason);
  tx(() => {
    insert('bill_items', { bill_id: bid, service_id: item.service_id, description: `Waived — ${item.description}`, category: item.category,
      revenue_head: item.revenue_head, qty: -item.qty, rate: item.rate, gst_pct: item.gst_pct, tax_inclusive: item.tax_inclusive,
      amount: -item.amount, waiver_of: item.id, admission_charge_id: item.admission_charge_id, created_by: req.user.id, created_at: nowIso() });
    recalcBill(bid);
  });
  const view = billView(bid);
  emit(req, { topics: TOPICS, event: 'bill.updated', data: view, action: 'bill.item.waive', entity: 'bills', entityId: bid,
    detail: { before: { ...pickBill(before), item: item.description, amount: item.amount }, after: pickBill(view), reason, ...lock } });
  return view;
}));

billing.post('/bills', requirePerm('billing.create'), h((req) => {
  const b = req.body || {};
  // a desk raises only its own kind of bill: pharmacy raises pharmacy bills (through dispensing), reception the rest
  const scope = billScope(req.user);
  if (scope === "b.bill_type='PHARM'" && (b.bill_type || 'OP') !== 'PHARM') fail(403, 'bill_raised_at_reception');
  const patient = get('SELECT * FROM patients WHERE id=?', num(b.patient_id));
  if (!patient) fail(400, 'patient_required');
  const billingDoctor = b.doctor_id ? get("SELECT id FROM users WHERE id=? AND role='doctor' AND active=1", num(b.doctor_id)) : null;
  if (b.doctor_id && !billingDoctor) fail(400, 'active_doctor_required');
  let items = Array.isArray(b.items) ? b.items : [];
  if (b.package_id) {
    const pkg = get('SELECT * FROM packages WHERE id=? AND active=1', num(b.package_id));
    if (!pkg) fail(400, 'package_unavailable');
    if (b.bill_type !== 'PKG') fail(400, 'package_bill_type_required');
    if (pkg.payer_id) fail(400, 'payer_package_requires_case');
    items = [{ description: `${pkg.name} (package)`, category: 'package', qty: 1, rate: pkg.price }];
  }
  if (!items.length) fail(400, 'items_required');
  if (b.encounter_id) {
    const encounter = get('SELECT patient_id FROM encounters WHERE id=?', num(b.encounter_id));
    if (!encounter || encounter.patient_id !== patient.id) fail(400, 'encounter_patient_mismatch');
    // an admitted patient's package goes on the running IP bill (Admission → Package), so deposits and usage stay on one bill
    if (b.package_id && get("SELECT 1 FROM admissions WHERE encounter_id=? AND status<>'discharged'", num(b.encounter_id))) fail(409, 'use_admission_package');
  }
  return tx(() => {
    if (b.package_id && b.encounter_id && get("SELECT id FROM bills WHERE encounter_id=? AND package_id IS NOT NULL AND status<>'cancelled'",num(b.encounter_id))) fail(409,'visit_already_has_package');
    const bid = insert('bills', {
      bill_no: nextNo('bill'), patient_id: patient.id, encounter_id: b.encounter_id || null,
      bill_type: b.bill_type || 'OP', status: 'unpaid',
      payer_type: b.payer_type || patient.payer_type,
      discount: money(num(b.discount, 0)), discount_reason: b.discount_reason,
      counter_id: req.user.counter_id || b.counter_id || null,
      created_by: req.user.id, notes: b.notes,
      doctor_id: billingDoctor?.id || null,
      package_id: b.package_id ? num(b.package_id) : null,
    });
    for (const it of items) {
      const svc = it.service_id ? get('SELECT * FROM services WHERE id=?', num(it.service_id)) : null;
      if (it.service_id && !svc) fail(400, 'service_unavailable');
      if (svc && ((b.bill_type==='LAB' && svc.category!=='lab') || (b.bill_type==='IMAGING' && svc.category!=='imaging'))) fail(400,'service_bill_type_mismatch');
      const qty = num(it.qty, 1);
      const rate = money(it.rate !== undefined ? num(it.rate) : priceFor(svc, patient.id));
      const disc = money(num(it.discount, 0));
      insert('bill_items', {
        bill_id: bid, service_id: svc?.id || null, order_id: it.order_id || null,
        description: it.description || svc?.name || 'Service',
        category: it.category || svc?.category || 'other',
        qty, rate, discount: disc, gst_pct: num(it.gst_pct, svc?.gst_pct || 0),
        amount: money(qty * rate - disc),
      });
      if (it.order_id) update('orders', num(it.order_id), { billed: 1 });
    }
    const bill = recalcBill(bid);
    if (b.package_id) assignPackage(req, { packageId: num(b.package_id), patientId: patient.id, encounterId: b.encounter_id ? num(b.encounter_id) : null, billId: bid });
    if (b.collect && Array.isArray(b.lines) && b.lines.length > 0) {
      const reqKey = b.request_key || `bill-${bid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      settleBill(req, {
        bill_id: bid,
        lines: b.lines,
        category: b.category || b.payer_type || 'self',
        notes: b.notes || b.reference,
        request_key: reqKey,
      });
    } else if (b.collect && b.mode) {
      const payAmt = b.collect_amount !== undefined ? num(b.collect_amount) : bill.total;
      if (payAmt > 0) {
        takePayment(req, { bill_id: bid, amount: payAmt, mode: b.mode, reference: b.reference });
      }
    } else {
      billNewToPayer(req, [bid]);
    }
    // charges on a visit that has a package: what the package covers is adjusted off straight away
    if (b.encounter_id) applyPackage(req, activeAssignment({ encounterId: num(b.encounter_id) }));
    const view = billView(bid);
    emit(req, {
      topics: [...TOPICS, `patient:${patient.id}`], event: 'bill.created', data: view,
      action: 'bill.create', entity: 'bills', entityId: bid,
      detail: { bill_no: view.bill_no, total: view.total, ...(b.package_id ? {package_id:num(b.package_id)} : {}) },
    });
    return view;
  });
}));

billing.patch('/bills/:id/doctor', requirePerm('billing.create'), h(req => {
  const before = get('SELECT * FROM bills WHERE id=?', +req.params.id);
  if (!before || before.status === 'cancelled') fail(409, 'bill_unavailable');
  counterFor(req, before);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const lock = closedDayGuard(req, billDay(before), reason);
  const doctor = get("SELECT id FROM users WHERE id=? AND role='doctor' AND active=1", num(req.body.doctor_id));
  if (!doctor) fail(400, 'active_doctor_required');
  update('bills', before.id, {doctor_id:doctor.id});
  const view = billView(before.id);
  emit(req,{topics:TOPICS,event:'bill.updated',action:'bill.doctor',entity:'bills',entityId:before.id,detail:{before:{doctor_id:before.doctor_id},after:{doctor_id:doctor.id},reason,...lock}});
  return view;
}));

billing.post('/bills/:id/items', requirePerm('billing.create'), h((req) => {
  const bid = +req.params.id;
  const before = get('SELECT * FROM bills WHERE id=?', bid);
  if (!before || before.status === 'cancelled') fail(409, 'bill_unavailable');
  const it = req.body || {};
  const svc = it.service_id ? get('SELECT * FROM services WHERE id=?', num(it.service_id)) : null;
  const qty = num(it.qty, 1);
  const rate = money(it.rate !== undefined ? num(it.rate) : priceFor(svc, before.patient_id));
  insert('bill_items', {
    bill_id: bid, service_id: svc?.id || null, order_id: it.order_id || null,
    description: it.description || svc?.name, category: it.category || svc?.category || 'other',
    qty, rate, discount: money(num(it.discount, 0)), gst_pct: num(it.gst_pct, svc?.gst_pct || 0),
    amount: money(qty * rate - num(it.discount, 0)), created_by: req.user.id, created_at: nowIso(),
  });
  recalcBill(bid);
  const view = billView(bid);
  emit(req, { topics: TOPICS, event: 'bill.updated', data: view,
    action: 'bill.item.add', entity: 'bills', entityId: bid,
    detail: { before: pickBill(before), after: pickBill(view), item: it } });
  return view;
}));

billing.delete('/bills/:id/items/:itemId', requirePerm('billing.create'), h((req) => {
  const bid = +req.params.id;
  const before = get('SELECT * FROM bills WHERE id=?', bid);
  const item = get('SELECT * FROM bill_items WHERE id=? AND bill_id=?', +req.params.itemId, bid);
  if (!item) fail(404, 'item_not_found');
  if(get('SELECT id FROM ward_replacement_supply WHERE bill_item_id=?',item.id))fail(409,'replacement_requires_ward_review');
  if (before.paid > 0 || before.covered_amount > 0) fail(409, 'bill_has_collections_use_credit_note');
  const lock = closedDayGuard(req, billDay(before), req.query.reason || req.body?.reason);
  if (item.order_id && get("SELECT 1 FROM orders WHERE id=? AND status IN ('collected','in_progress','reported','verified')", item.order_id)) {
    fail(409, 'service_already_performed');
  }
  const reason = String(req.query.reason || req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  run('DELETE FROM bill_items WHERE id=? AND bill_id=?', item.id, bid);
  recalcBill(bid);
  const view = billView(bid);
  emit(req, { topics: TOPICS, event: 'bill.updated', data: view,
    action: 'bill.item.remove', entity: 'bills', entityId: bid,
    detail: { before: { ...pickBill(before), item }, after: pickBill(view), reason, ...lock } });
  return view;
}));

billing.patch('/bills/:id', requirePerm('billing.create'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['discount', 'discount_reason', 'notes', 'payer_type']) if (k in req.body) patch[k] = req.body[k];
  const before = get('SELECT * FROM bills WHERE id=?', id);
  if (!before || before.status === 'cancelled') fail(409, 'bill_unavailable');
  const lock = 'discount' in patch || 'payer_type' in patch ? closedDayGuard(req, billDay(before), patch.discount_reason || req.body.reason) : {};
  if ('discount' in patch) {
    patch.discount = money(num(patch.discount, 0));
    if (patch.discount < 0) fail(400, 'discount_invalid');
    if (patch.discount > 0 && !String(patch.discount_reason || before.discount_reason || '').trim()) fail(400, 'discount_reason_required');
    if (!can(req.user, 'billing.discount') && !can(req.user, 'payment.authorize')) fail(403, 'forbidden', { need: 'billing.discount' });
    const room = money(before.balance + before.discount);
    if (patch.discount > room + 0.005) fail(400, 'discount_exceeds_balance', { max: room });
  }
  if ('payer_type' in patch && !CATEGORIES.includes(patch.payer_type)) fail(400, 'category_invalid');
  update('bills', id, patch);
  recalcBill(id);
  const view = billView(id);
  emit(req, { topics: TOPICS, event: 'bill.updated', data: view,
    action: 'discount' in patch ? 'bill.discount' : 'bill.update', entity: 'bills', entityId: id,
    detail: { before: pickBill(before), after: pickBill(view), reason: patch.discount_reason, ...lock } });
  return view;
}));

billing.post('/bills/:id/cancel', requirePerm('billing.cancel'), h((req) => {
  const id = +req.params.id;
  if (!req.body.reason) fail(400, 'reason_required');
  const before = get('SELECT * FROM bills WHERE id=?', id);
  if (!before || before.status === 'cancelled') fail(409, 'bill_unavailable');
  if (before.paid > 0.005) fail(409, 'refund_before_cancel', { paid: before.paid });
  if(get('SELECT s.id FROM ward_replacement_supply s JOIN bill_items i ON i.id=s.bill_item_id WHERE i.bill_id=?',id))fail(409,'replacement_requires_ward_review');
  const lock = closedDayGuard(req, billDay(before), req.body.reason);
  tx(() => {
    for (const s2 of all("SELECT id FROM bill_settlements WHERE bill_id=? AND status<>'cancelled'", id)) {
      cancelSettlement(req, s2.id, `Bill cancelled: ${req.body.reason}`);
    }
    update('bills', id, { status: 'cancelled', cancelled_at: nowIso(), cancel_reason: req.body.reason, cancelled_by: req.user.id });
    recalcBill(id);
    run("UPDATE orders SET status='cancelled' WHERE status IN ('awaiting_payment','ordered') AND id IN (SELECT order_id FROM bill_items WHERE bill_id=?)", id);
  });
  const view = billView(id);
  if (view.encounter_id) syncEncounterPayment(view.encounter_id);
  emit(req, { topics: TOPICS, event: 'bill.updated', data: view,
    action: 'bill.cancel', entity: 'bills', entityId: id,
    detail: { before: pickBill(before), after: pickBill(view), reason: req.body.reason, ...lock } });
  return view;
}));

/* ---------------------------------------------------------------- payments */

/** Collection desk: receive money against an existing bill. */
billing.post('/payments', requirePerm('payment.collect'), h((req) => {
  const b = req.body || {};
  counterFor(req, get('SELECT * FROM bills WHERE id=?', num(b.bill_id)));
  const r = takePayment(req, {
    bill_id: num(b.bill_id), amount: num(b.amount), mode: b.mode || 'cash',
    reference: b.reference, transaction_id: b.transaction_id, remarks: b.remarks,
  });
  const view = billView(r.bill.id);
  emit(req, {
    topics: [...TOPICS, 'display', `patient:${r.bill.patient_id}`,
             r.bill.encounter_id ? `encounter:${r.bill.encounter_id}` : 'billing'],
    event: 'payment.received', data: { payment: r.payment, bill: view },
    action: 'payment.collect', entity: 'payments', entityId: r.payment.id,
    detail: { receipt: r.payment.receipt_no, amount: r.payment.amount, mode: r.payment.mode },
  });
  return { payment: r.payment, bill: view, receipt: receiptView(r.payment.id) };
}));

billing.get('/payments', requirePerm('billing.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.date) { extra.push('pm.pay_date = ?'); args.push(req.query.date); }
  if (req.query.from) { extra.push('pm.pay_date >= ?'); args.push(req.query.from); }
  if (req.query.to) { extra.push('pm.pay_date <= ?'); args.push(req.query.to); }
  if (req.query.mode === 'card') extra.push("pm.mode IN ('card','debit_card','credit_card')"); // the filter's Card covers both
  else if (req.query.mode && req.query.mode !== 'all') { extra.push('pm.mode = ?'); args.push(req.query.mode); }
  if (req.query.counter_id && req.query.counter_id !== 'all') { extra.push('pm.counter_id = ?'); args.push(+req.query.counter_id); }
  if (req.query.user_id) { extra.push('pm.received_by = ?'); args.push(+req.query.user_id); }
  if (req.query.q) { extra.push('(pm.receipt_no LIKE ? OR p.name LIKE ? OR p.uhid LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l); }
  // cancelled receipts stay on the ledger when asked for (struck through); totals never count them
  const wAll = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  extra.push('pm.cancelled = 0');
  const w = `WHERE ${extra.join(' AND ')}`;
  const rows = all(
    `SELECT pm.*, p.uhid, p.name patient_name, b.bill_no, b.bill_type, u.name received_by_name, c.name counter_name,
            cu.name cancelled_by_name
       FROM payments pm JOIN patients p ON p.id=pm.patient_id
       LEFT JOIN bills b ON b.id=pm.bill_id
       LEFT JOIN users u ON u.id=pm.received_by
       LEFT JOIN users cu ON cu.id=pm.cancelled_by
       LEFT JOIN counters c ON c.id=pm.counter_id
       ${req.query.include_cancelled === '1' ? wAll : w} ORDER BY pm.id DESC LIMIT ?`, ...args, Math.min(num(req.query.limit, 300), 1000));
  const byMode = all(
    `SELECT pm.mode, count(*) n, coalesce(sum(pm.amount),0) total FROM payments pm
       JOIN patients p ON p.id=pm.patient_id ${w} GROUP BY pm.mode`, ...args);
  const byCounter = all(
    `SELECT coalesce(c.name,'—') counter, count(*) n, coalesce(sum(pm.amount),0) total
       FROM payments pm JOIN patients p ON p.id=pm.patient_id
       LEFT JOIN counters c ON c.id=pm.counter_id ${w} GROUP BY c.name`, ...args);
  const total = rows.filter((r) => !r.cancelled).reduce((s, r) => s + r.amount, 0);
  return { rows, byMode, byCounter, summary: { count: rows.length, total: money(total) } };
}));

billing.get('/payments/:id/receipt', requireAuth, h((req) => receiptView(+req.params.id)));

function receiptView(id) {
  const p = get(
    `SELECT pm.*, pt.uhid, pt.name patient_name, pt.gender, pt.age_years, pt.mobile, pt.address,
            b.bill_no, b.total bill_total, b.balance bill_balance, b.bill_type,
            u.name received_by_name, c.name counter_name, e.encounter_no, e.token_no,
            d.name doctor_name
       FROM payments pm JOIN patients pt ON pt.id=pm.patient_id
       LEFT JOIN bills b ON b.id=pm.bill_id
       LEFT JOIN users u ON u.id=pm.received_by
       LEFT JOIN counters c ON c.id=pm.counter_id
       LEFT JOIN encounters e ON e.id=pm.encounter_id
       LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
      WHERE pm.id=?`, id);
  if (!p) fail(404, 'receipt_not_found');
  p.items = p.bill_id ? all('SELECT * FROM bill_items WHERE bill_id=?', p.bill_id) : [];
  p.settings = Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
  return p;
}

billing.post('/payments/:id/cancel', requirePerm('payment.cancel'), h((req) => {
  const lock = closedDayGuard(req, get('SELECT pay_date FROM payments WHERE id=?', +req.params.id)?.pay_date, req.body?.reason);
  const r = cancelPayment(req, +req.params.id, req.body?.reason);
  emit(req, { topics: TOPICS, event: 'payment.cancelled', data: { id: r.payment.id, bill_id: r.payment.bill_id },
    action: 'payment.cancel', entity: 'payments', entityId: r.payment.id,
    detail: { before: r.before, after: r.payment, reason: req.body?.reason, ...lock } });
  return { ok: true, bill: r.bill ? billView(r.bill.id) : null };
}));

/* ----------------------------------------------------------------- refunds */

billing.post('/refunds', requirePerm('payment.collect'), h((req) => {
  const b = req.body || {};
  const bill = get('SELECT * FROM bills WHERE id=?', num(b.bill_id));
  if (!bill) fail(404, 'bill_not_found');
  // Returning an unused deposit is a desk task; refunding a charge (credit note) needs refund rights.
  const excess = !!b.excess;
  if (excess && !(bill.balance < -0.005 && num(b.amount) <= -bill.balance + 0.005)) fail(400, 'no_excess_to_refund', { excess: Math.max(0, -bill.balance) });
  if (!excess && !can(req.user, 'payment.refund')) fail(403, 'forbidden', { need: 'payment.refund' });
  counterFor(req, bill);
  const r = refund(req, { bill_id: bill.id, amount: num(b.amount), mode: b.mode || 'cash',
    reason: b.reason || (excess ? 'Unused advance returned' : ''), bill_item_id: b.bill_item_id, noCreditNote: excess });
  const view = billView(r.bill.id);
  emit(req, { topics: TOPICS, event: 'refund.created', data: view,
    action: 'refund.create', entity: 'refunds', entityId: r.refund.id,
    detail: { before: pickBill(r.before), after: pickBill(view), amount: r.refund.amount, reason: b.reason } });
  return view;
}));

billing.get('/refunds', requireAuth, h((req) => all(
  `SELECT r.*, p.name patient_name, p.uhid, b.bill_no, u.name created_by_name
     FROM refunds r JOIN patients p ON p.id=r.patient_id
     LEFT JOIN bills b ON b.id=r.bill_id LEFT JOIN users u ON u.id=r.created_by
    ORDER BY r.id DESC LIMIT 200`)));

/* -------------------------------------------------- OP fee collection desk */

/**
 * The OP collection view. This is the SAME engine as /payments — a reception-facing
 * projection of outstanding consultation bills, not a separate payments store.
 */
billing.get('/collection/op', requireAuth, h((req) => {
  const date = req.query.date || today();
  const q = req.query.q ? `%${req.query.q}%` : null;
  const extra = ["b.status IN ('unpaid','partial')", "b.bill_type IN ('OP','LAB','IMAGING','PKG')"];
  const args = [];
  if (!req.query.all_dates) { extra.push('b.bill_date = ?'); args.push(date); }
  if (q) { extra.push('(b.bill_no LIKE ? OR p.name LIKE ? OR p.uhid LIKE ? OR p.mobile LIKE ? OR cast(e.token_no as text)=?)');
    args.push(q, q, q, q, String(req.query.q)); }
  if (req.query.counter_id && req.query.counter_id !== 'all') { extra.push('b.counter_id = ?'); args.push(+req.query.counter_id); }
  const rows = all(
    `SELECT b.*, p.uhid, p.name patient_name, p.mobile, p.gender, p.age_years, p.vip,
            e.token_no, e.encounter_no, e.stage, e.payment_status, e.visit_type,
            d.name doctor_name, dep.name dept_name, c.name counter_name,
            (SELECT group_concat(description, ' · ') FROM bill_items i WHERE i.bill_id=b.id) AS item_summary
       FROM bills b JOIN patients p ON p.id=b.patient_id
       LEFT JOIN encounters e ON e.id=b.encounter_id
       LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
       LEFT JOIN departments dep ON dep.id=e.department_id
       LEFT JOIN counters c ON c.id=b.counter_id
      WHERE ${extra.join(' AND ')}
      ORDER BY e.token_no IS NULL, e.token_no, b.id DESC LIMIT 300`, ...args);

  const paid = get(
    `SELECT coalesce(sum(amount),0) total, count(*) n FROM payments WHERE pay_date=? AND cancelled=0`, date);
  const byMode = all(
    `SELECT mode, coalesce(sum(amount),0) total, count(*) n FROM payments
      WHERE pay_date=? AND cancelled=0 GROUP BY mode`, date);
  const byCounter = all(
    `SELECT coalesce(c.name,'Unassigned') counter, c.id counter_id, coalesce(sum(pm.amount),0) total, count(*) n
       FROM payments pm LEFT JOIN counters c ON c.id=pm.counter_id
      WHERE pm.pay_date=? AND pm.cancelled=0 GROUP BY c.id`, date);
  return {
    date, rows,
    summary: {
      collected_today: money(paid.total), receipts_today: paid.n,
      pending_count: rows.length,
      pending_amount: money(rows.reduce((s, r) => s + r.balance, 0)),
      cash: money(byMode.find((m) => m.mode === 'cash')?.total || 0),
      digital: money(byMode.filter((m) => m.mode !== 'cash').reduce((s, m) => s + m.total, 0)),
      free_visits: one("SELECT count(*) FROM encounters WHERE visit_date=? AND payment_status='free'", date) || 0,
    },
    byMode, byCounter,
  };
}));

/* -------------------------------------------------- counter reconciliation */

billing.get('/counters/sessions', requireAuth, h((req) => {
  const date = req.query.date || today();
  const rows = all(
    `SELECT s.*, c.name counter_name, c.code counter_code, u.name user_name,
            (SELECT coalesce(sum(amount),0) FROM payments p WHERE p.session_id=s.id AND p.cancelled=0) system_total,
            (SELECT coalesce(sum(amount),0) FROM payments p WHERE p.session_id=s.id AND p.cancelled=0 AND p.mode='cash') system_cash,
            (SELECT count(*) FROM payments p WHERE p.session_id=s.id AND p.cancelled=0) receipts
       FROM counter_sessions s JOIN counters c ON c.id=s.counter_id JOIN users u ON u.id=s.user_id
      WHERE date(s.opened_at)=? ORDER BY s.id DESC`, date);
  // sessions that predate payments still show desk totals for the date
  const deskTotals = all(
    `SELECT c.id counter_id, c.name counter_name,
            coalesce(sum(CASE WHEN p.mode='cash' THEN p.amount END),0) cash,
            coalesce(sum(CASE WHEN p.mode<>'cash' THEN p.amount END),0) digital,
            coalesce(sum(p.amount),0) total, count(p.id) receipts
       FROM counters c LEFT JOIN payments p ON p.counter_id=c.id AND p.pay_date=? AND p.cancelled=0
      GROUP BY c.id ORDER BY c.id`, date);
  return { date, rows, deskTotals };
}));

billing.post('/counters/sessions', requirePerm('finance.counter'), h((req) => {
  const id = insert('counter_sessions', {
    counter_id: num(req.body.counter_id), user_id: req.user.id,
    opening_cash: money(num(req.body.opening_cash, 0)), status: 'open',
  });
  emit(req, { topics: ['finance'], event: 'counter.opened', data: { id },
    action: 'counter.open', entity: 'counter_sessions', entityId: id, detail: req.body });
  return get('SELECT * FROM counter_sessions WHERE id=?', id);
}));

billing.post('/counters/sessions/:id/close', requirePerm('finance.counter'), h((req) => {
  const id = +req.params.id;
  const s = get('SELECT * FROM counter_sessions WHERE id=?', id);
  if (!s) fail(404, 'session_not_found');
  const systemCash = one(
    `SELECT coalesce(sum(amount),0) FROM payments WHERE session_id=? AND cancelled=0 AND mode='cash'`, id) || 0;
  const counted = money(num(req.body.counted_cash, 0));
  const expected = money(systemCash + s.opening_cash);
  update('counter_sessions', id, {
    closed_at: nowIso(), counted_cash: counted,
    declared_cash: expected, variance: money(counted - expected),
    status: Math.abs(counted - expected) > 1 ? 'disputed' : 'closed',
    remarks: req.body.remarks,
  });
  const row = get('SELECT * FROM counter_sessions WHERE id=?', id);
  emit(req, { topics: ['finance', 'dashboard'], event: 'counter.closed', data: row,
    action: 'counter.close', entity: 'counter_sessions', entityId: id, detail: row });
  return row;
}));

/* ------------------------------------------------------- package utilisation */

/** Live package position for a visit, admission or patient: covered / excess / excluded, allowances, what is owed. */
billing.get('/package-usage', requireAuth, h((req) => {
  if (!can(req.user, 'billing.view') && !can(req.user, 'ipd.view') && !can(req.user, 'pharmacy.view') && !can(req.user, 'insurance.view')) fail(403, 'forbidden');
  const a = activeAssignment({ admissionId: num(req.query.admission_id, null), encounterId: num(req.query.encounter_id, null), patientId: num(req.query.patient_id, null) })
    || (req.query.assignment_id ? get('SELECT * FROM package_assignments WHERE id=?', num(req.query.assignment_id)) : null);
  return a ? packageUsage(a) : null;
}));

/** Packages bought for visits and stays, with their live position. */
billing.get('/package-assignments', requireAuth, h((req) => {
  if (!can(req.user, 'billing.view') && !can(req.user, 'ipd.view') && !can(req.user, 'insurance.view')) fail(403, 'forbidden');
  const status = ['active', 'closed', 'cancelled'].includes(req.query.status) ? req.query.status : 'active';
  return all(`SELECT pa.*, p.uhid, p.name patient_name, k.name package_name, a.ip_no, e.encounter_no
      FROM package_assignments pa JOIN patients p ON p.id=pa.patient_id JOIN packages k ON k.id=pa.package_id
      LEFT JOIN admissions a ON a.id=pa.admission_id LEFT JOIN encounters e ON e.id=pa.encounter_id
     WHERE pa.status=? ORDER BY pa.id DESC LIMIT 200`, status)
    .map((r) => { const u = packageUsage(r); return Object.assign(r, { covered: u.covered, excess: u.excess, excluded: u.excluded, patient_owes: u.patient_owes, margin: u.margin, adjustment_posted: u.adjustment_posted }); });
}));

/** Post the package adjustments now (also adjusts a running IP bill; it is reconciled again at discharge). */
billing.post('/package-assignments/:id/reconcile', requireAuth, h((req) => tx(() => {
  if (!can(req.user, 'payment.authorize') && !can(req.user, 'ipd.manage')) fail(403, 'forbidden', { need: 'payment.authorize' });
  const a = get('SELECT * FROM package_assignments WHERE id=?', +req.params.id) || fail(404, 'package_assignment_not_found');
  if (a.status !== 'active') fail(409, 'package_not_active');
  const u = applyPackage(req, a, { final: true });
  emit(req, { topics: [...TOPICS, 'ipd'], event: 'bill.updated', data: { id: a.bill_id }, action: 'package.reconcile', entity: 'package_assignments', entityId: a.id,
    detail: { before: null, after: { covered: u.covered, excess: u.excess, excluded: u.excluded, adjustment: u.adjustment_posted }, reason: 'Package reconciled' } });
  return u;
})));

/** Take a package off a visit / admission: adjustments are reversed and the package charge is waived (nothing paid on it). */
billing.post('/package-assignments/:id/cancel', requireAuth, h((req) => tx(() => {
  if (!can(req.user, 'payment.authorize')) fail(403, 'forbidden', { need: 'payment.authorize' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const a = get('SELECT * FROM package_assignments WHERE id=?', +req.params.id) || fail(404, 'package_assignment_not_found');
  if (a.status !== 'active') fail(409, 'package_not_active');
  for (const s of all(`SELECT id FROM bill_settlements WHERE status<>'cancelled' AND payer_name='Package adjustment' AND reference=?`, `PKGA-${a.id}`)) cancelSettlement(req, s.id, `Package removed: ${reason}`);
  const line = a.bill_id ? get("SELECT * FROM bill_items WHERE bill_id=? AND category='package' AND amount>0 AND waiver_of IS NULL AND NOT EXISTS (SELECT 1 FROM bill_items w WHERE w.waiver_of=bill_items.id) ORDER BY id DESC LIMIT 1", a.bill_id) : null;
  if (line) {
    const bill = get('SELECT * FROM bills WHERE id=?', a.bill_id);
    if (bill.bill_type === 'PKG' && bill.paid > 0.005) fail(409, 'package_paid_refund_first');
    insert('bill_items', { bill_id: a.bill_id, service_id: null, description: `Waived — ${line.description}`, category: 'package', revenue_head: line.revenue_head,
      qty: -line.qty, rate: line.rate, amount: -line.amount, waiver_of: line.id, created_by: req.user.id, created_at: nowIso() });
    recalcBill(a.bill_id);
  }
  update('package_assignments', a.id, { status: 'cancelled', closed_at: nowIso(), cancel_reason: reason });
  if (a.bill_id) update('bills', a.bill_id, { package_id: null });
  emit(req, { topics: [...TOPICS, 'ipd'], event: 'bill.updated', data: { id: a.bill_id }, action: 'package.cancel', entity: 'package_assignments', entityId: a.id,
    detail: { before: { status: 'active' }, after: { status: 'cancelled' }, reason } });
  return { ok: true };
})));

/* ---------------------------------------------------------------- packages */

billing.get('/packages', requireAuth, h(() => all(
  `SELECT pk.*, (SELECT name FROM packages WHERE id=pk.hospital_package_id) hospital_package_name, py.name payer_name, py.payer_type, (SELECT count(*) FROM package_items i WHERE i.package_id=pk.id) item_count,
          (SELECT coalesce(sum(s.price*i.qty),0) FROM package_items i JOIN services s ON s.id=i.service_id
            WHERE i.package_id=pk.id) list_value
     FROM packages pk LEFT JOIN payers py ON py.id=pk.payer_id ORDER BY pk.payer_id IS NOT NULL, py.name, pk.category, pk.name`)));

billing.get('/packages/:id', requireAuth, h((req) => {
  const p = get('SELECT * FROM packages WHERE id=?', +req.params.id);
  if (!p) fail(404, 'package_not_found');
  p.items = all(`SELECT i.*, s.name, s.code, s.price, s.category FROM package_items i
                   JOIN services s ON s.id=i.service_id WHERE i.package_id=?`, p.id);
  return p;
}));

billing.post('/packages', requirePerm('admin.view'), h((req) => {
  const b = req.body;
  const id = insert('packages', {
    code: b.code, name: b.name, category: b.category, price: money(num(b.price)),
    mrp: money(num(b.mrp)), validity_days: num(b.validity_days, 30), description: b.description,
  });
  for (const it of b.items || []) insert('package_items', { package_id: id, service_id: num(it.service_id), qty: num(it.qty, 1) });
  emit(req, { topics: ['admin'], event: 'package.created', data: { id },
    action: 'package.create', entity: 'packages', entityId: id, detail: b });
  return get('SELECT * FROM packages WHERE id=?', id);
}));

/* ------------------------------------------------------------------ tariff */

billing.get('/services', requireAuth, h((req) => {
  const w = where({ 'category = ?': req.query.category, 'department_id = ?': req.query.department_id });
  const q = req.query.q ? `%${req.query.q}%` : null;
  const extra = q ? [(w.sql ? 'AND' : 'WHERE') + ' (name LIKE ? OR code LIKE ?)'] : [];
  return all(
    `SELECT s.*, d.name dept_name FROM services s LEFT JOIN departments d ON d.id=s.department_id
      ${w.sql} ${extra.join('')} ORDER BY s.category, s.name`,
    ...w.args, ...(q ? [q, q] : []));
}));

function validateTariff(b) {
  for (const k of ['price', 'gst_pct', 'tat_minutes']) if (k in b && b[k] !== null && b[k] !== undefined) {
    const v = Number(b[k]);
    if (b[k] === '' || !Number.isFinite(v) || v < 0 || (k === 'gst_pct' && v > 100) || (k === 'tat_minutes' && !Number.isInteger(v))) fail(400, k + '_invalid');
    b[k] = k === 'price' ? money(v) : v;
  }
  if ('category' in b && !['consultation','lab','imaging','procedure','emergency','ipd','bed','package','other'].includes(b.category)) fail(400, 'category_invalid');
  if ('billing_unit' in b && !['day','hour','once'].includes(b.billing_unit)) fail(400, 'billing_unit_invalid');
  if ('ward_kinds' in b && String(b.ward_kinds || '').split(',').filter(Boolean).some((k) => !['general','semi_private','private','special','deluxe','icu','nicu','picu','hdu','labour','postop','er_obs','ot'].includes(k))) fail(400, 'ward_kinds_invalid');
  for (const k of ['name','code']) if (k in b && !String(b[k] ?? '').trim()) fail(400, k + '_required');
  if (b.department_id && !get('SELECT id FROM departments WHERE id=?', b.department_id)) fail(400, 'department_invalid');
}

billing.post('/services', requirePerm('admin.view'), h((req) => {
  const b = req.body;
  validateTariff(b);
  const id = insert('services', {
    code: b.code, name: b.name, category: b.category, department_id: b.department_id || null,
    price: money(num(b.price)), gst_pct: num(b.gst_pct, 0), tat_minutes: num(b.tat_minutes, null),
    sample_type: b.sample_type, billing_unit: b.billing_unit || 'once', ipd_default: b.ipd_default ? 1 : 0, ward_kinds: b.ward_kinds || null,
  });
  emit(req, { topics: ['admin'], event: 'service.created', data: get('SELECT * FROM services WHERE id=?', id),
    action: 'service.create', entity: 'services', entityId: id, detail: b });
  return get('SELECT * FROM services WHERE id=?', id);
}));

billing.patch('/services/:id', requirePerm('admin.view'), h((req) => {
  const id = +req.params.id;
  const before = get('SELECT * FROM services WHERE id=?', id);
  if (!before) fail(404, 'service_not_found');
  validateTariff(req.body);
  const patch = {};
  for (const k of ['name', 'price', 'gst_pct', 'active', 'tat_minutes', 'sample_type', 'category', 'department_id', 'billing_unit', 'ipd_default', 'ward_kinds']) if (k in req.body) patch[k] = req.body[k] === '' && k === 'ward_kinds' ? null : req.body[k];
  patch.updated_at = nowIso();
  update('services', id, patch);
  const row = get('SELECT * FROM services WHERE id=?', id);
  emit(req, { topics: ['admin', 'billing'], event: 'service.updated', data: row,
    action: 'service.update', entity: 'services', entityId: id, detail: { before, after: row } });
  return row;
}));
