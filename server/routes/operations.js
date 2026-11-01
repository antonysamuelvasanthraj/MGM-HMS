/**
 * Hospital-wide operating mode and the department entry of paper investigation requests.
 */
import { Router } from 'express';
import { h, fail, get, all, update, emit, num, tx, setting, nowIso } from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { MODES, MODE_LABEL, currentMode, applyMode, modeHistory, paperAllowed, digitalAllowed } from '../operating-mode.js';
import { placeOrders, billOrderRows, closeEncounterIfDone } from './clinical.js';
import { SOURCE_LABEL } from '../operating-mode.js';

export const operations = Router();

/* ------------------------------------------------------------------ operating mode */

operations.get('/admin/operating-mode', requireAuth, h((req) => ({
  mode: currentMode(),
  label: MODE_LABEL[currentMode()],
  since: setting('hospital_mode_since') || null,
  effective: {
    doctor: { paper: paperAllowed('doctor'), digital: digitalAllowed('doctor') },
    pharmacy: { paper: paperAllowed('pharmacy'), digital: digitalAllowed('pharmacy') },
    lab: { paper: paperAllowed('lab'), digital: digitalAllowed('lab') },
  },
  dept_entry: setting('dept_entry_enabled') !== '0',
  duplicate_guard: setting('duplicate_order_guard') !== '0',
  can_change: can(req.user, 'hospital_mode.manage'),
  history: can(req.user, 'admin.view') ? modeHistory() : [],
})));

/** Only the Hospital Admin: explicit confirmation and a reason, recorded with before / after. */
operations.post('/admin/operating-mode', requirePerm('hospital_mode.manage'), h((req) => {
  const b = req.body || {};
  if (!MODES[b.mode]) fail(400, 'mode_invalid');
  const reason = String(b.reason || '').trim();
  if (reason.length < 5) fail(400, 'reason_required');
  if (b.confirm !== true) fail(400, 'confirmation_required');
  if (b.mode === currentMode() && setting('hospital_mode') === b.mode) fail(409, 'mode_unchanged');
  return tx(() => {
    const { before, after } = applyMode(b.mode, req.user.id, reason);
    emit(req, { topics: ['system', 'admin'], event: 'settings.changed', data: { hospital_mode: b.mode },
      action: 'hospital_mode.change', entity: 'settings', entityId: null, detail: { before, after, reason } });
    return { ok: true, mode: b.mode, label: MODE_LABEL[b.mode] };
  });
}));

/* ------------------------------------------------- department entry (Method C) */

/**
 * Lab or radiology staff record a paper request brought straight to the department. The patient
 * must already have an open visit or admission; the tests go on that visit's bill exactly as if
 * reception had entered them, so reception (never the department) collects. Routine OP work then
 * waits for payment like any other order; inpatient and emergency work goes ahead.
 */
operations.post('/department/diagnostics', requireAuth, h((req) => {
  if (!paperAllowed('lab')) fail(409, 'paper_requests_disabled');
  if (setting('dept_entry_enabled') === '0') fail(409, 'department_entry_disabled');
  const canLab = can(req.user, 'lab.collect'), canImg = can(req.user, 'imaging.schedule');
  if (!canLab && !canImg) fail(403, 'forbidden', { need: 'lab.collect' });
  const b = req.body || {};
  const patient = get('SELECT * FROM patients WHERE id=?', num(b.patient_id)) || fail(400, 'patient_required');
  const referredBy = String(b.referred_by || '').trim() || (b.doctor_id ? get("SELECT name FROM users WHERE id=? AND role='doctor'", num(b.doctor_id))?.name : '');
  if (!referredBy) fail(400, 'referred_by_required');
  const items = (Array.isArray(b.items) ? b.items : []).map((it) => {
    const svc = get('SELECT * FROM services WHERE id=? AND active=1', num(it.service_id));
    if (!svc || !['lab', 'imaging'].includes(svc.category)) fail(400, 'lab_or_imaging_only');
    if ((svc.category === 'lab' && !canLab) || (svc.category === 'imaging' && !canImg)) fail(403, 'other_department_test', { test: svc.name });
    return { service_id: svc.id, priority: ['urgent', 'stat'].includes(it.priority) ? it.priority : 'routine', clinical_note: b.clinical_note || null, confirm_duplicate: !!b.confirm_duplicate };
  });
  if (!items.length) fail(400, 'items_required');
  let e = b.encounter_id ? get("SELECT * FROM encounters WHERE id=? AND patient_id=? AND stage NOT IN ('closed','cancelled')", num(b.encounter_id), patient.id) : null;
  if (b.encounter_id && !e) fail(404, 'encounter_not_found');
  if (!e) e = get(`SELECT e.* FROM admissions a JOIN encounters e ON e.id=a.encounter_id WHERE a.patient_id=? AND a.status<>'discharged' ORDER BY a.id DESC LIMIT 1`, patient.id)
    || get(`SELECT e.* FROM emergency_cases c JOIN encounters e ON e.id=c.encounter_id WHERE c.patient_id=? AND c.closed_at IS NULL AND e.stage NOT IN ('closed','cancelled') ORDER BY c.id DESC LIMIT 1`, patient.id)
    || get(`SELECT * FROM encounters WHERE patient_id=? AND kind='OP' AND visit_date=date('now','localtime') AND stage NOT IN ('closed','cancelled') ORDER BY id DESC LIMIT 1`, patient.id);
  if (!e) fail(409, 'encounter_required');
  return placeOrders(req, e, { items, bill: true }, { referredBy, source: 'department_entry' });
}));

/* --------------------------------------------- reception investigation queue (Phase 2) */

const canQueue = (u) => can(u, 'billing.create') || can(u, 'payment.collect') || can(u, 'op.register');
/** One money word per order, from its bill — never stored, so it can never disagree with the bill. */
const MONEY_SQL = `CASE
    WHEN o.status='cancelled' THEN 'cancelled'
    WHEN pr.billing='outside' THEN 'paid_outside'
    WHEN bi.id IS NULL THEN 'unbilled'
    WHEN EXISTS (SELECT 1 FROM bill_items w WHERE w.waiver_of=bi.id) THEN 'waived'
    WHEN b.status='cancelled' THEN 'bill_cancelled'
    WHEN e.kind='IP' AND b.bill_type='IP' AND b.balance > 0.5 THEN 'ip_ledger'
    WHEN b.balance <= 0.5 AND b.covered_amount > 0.5 AND b.paid < 0.5 THEN 'covered'
    WHEN EXISTS (SELECT 1 FROM bill_settlements s WHERE s.bill_id=b.id AND s.status='open' AND s.mode IN ('due','credit')) THEN 'due_credit'
    WHEN EXISTS (SELECT 1 FROM bill_settlements s WHERE s.bill_id=b.id AND s.status='open' AND s.mode NOT IN ('due','credit','free')) THEN 'payer_pending'
    WHEN b.balance <= 0.5 THEN 'paid'
    WHEN b.paid > 0.5 THEN 'partial'
    WHEN e.kind='EMG' OR e.priority='emergency' THEN 'er_deferred'
    ELSE 'unpaid' END`;

operations.get('/reception/investigations', requireAuth, h((req) => {
  if (!canQueue(req.user)) fail(403, 'forbidden', { need: 'billing.create' });
  const q = req.query, w = ["o.category IN ('lab','imaging')"], a = [];
  const from = q.from || new Date(Date.now() - 6 * 864e5).toLocaleString('sv-SE').slice(0, 10), to = q.to || '9999-12-31';
  w.push('date(o.ordered_at) BETWEEN ? AND ?'); a.push(from, to);
  if (q.q) { w.push('(p.name LIKE ? OR p.uhid LIKE ? OR p.mobile LIKE ? OR o.order_no LIKE ? OR e.encounter_no LIKE ? OR o.label LIKE ?)'); const l = `%${q.q}%`; a.push(l, l, l, l, l, l); }
  if (q.category) { w.push('o.category=?'); a.push(q.category); }
  if (q.kind) { w.push(q.kind === 'ICU' ? "EXISTS (SELECT 1 FROM admissions ad JOIN beds bd ON bd.id=ad.bed_id JOIN wards wd ON wd.id=bd.ward_id WHERE ad.encounter_id=e.id AND wd.kind IN ('icu','nicu','picu','hdu'))" : 'e.kind=?'); if (q.kind !== 'ICU') a.push(q.kind); }
  if (q.priority) { w.push('o.priority=?'); a.push(q.priority); }
  if (q.source) { w.push('o.order_source=?'); a.push(q.source); }
  if (q.dest) { w.push('o.order_dest=?'); a.push(q.dest); }
  if (q.doctor_id) { w.push("CASE WHEN ou.role='doctor' THEN ou.id ELSE e.doctor_id END=?"); a.push(num(q.doctor_id)); }
  if (q.work !== 'all') w.push("o.status NOT IN ('verified','cancelled','dispensed')");
  const rows = all(`SELECT o.id, o.order_no, o.label, o.category, o.priority, o.status, o.order_source, o.order_dest, o.auth_status, o.result_stage,
      o.ordered_at, o.referred_by, o.provider_id, o.duplicate_of, pr.name provider_name, pr.billing provider_billing,
      p.id patient_id, p.uhid, p.name patient_name, p.mobile, p.payer_type,
      e.id encounter_id, e.encounter_no, e.kind encounter_kind, e.priority encounter_priority,
      coalesce(du.name, eu.name) doctor_name, ou.name ordered_by_name, ou.role ordered_by_role,
      bi.id bill_item_id, bi.amount, b.id bill_id, b.bill_no, b.bill_type, b.status bill_status, b.balance bill_balance, b.paid bill_paid, ${MONEY_SQL} money
    FROM orders o JOIN patients p ON p.id=o.patient_id JOIN encounters e ON e.id=o.encounter_id
    LEFT JOIN diagnostic_providers pr ON pr.id=o.provider_id
    LEFT JOIN users ou ON ou.id=o.ordered_by LEFT JOIN users eu ON eu.id=e.doctor_id
    LEFT JOIN users du ON du.id = CASE WHEN ou.role='doctor' THEN ou.id END
    LEFT JOIN bill_items bi ON bi.id = (SELECT max(x.id) FROM bill_items x WHERE x.order_id=o.id AND x.amount > 0)
    LEFT JOIN bills b ON b.id=bi.bill_id
    WHERE ${w.join(' AND ')} ORDER BY CASE o.priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, o.id DESC LIMIT 600`, ...a)
    .map((r) => ({ ...r, source_label: SOURCE_LABEL[r.order_source] || r.order_source }));
  const money = q.money ? rows.filter((r) => q.money.split(',').includes(r.money)) : rows;
  const count = (k) => rows.filter((r) => r.money === k).length;
  return { from, to, rows: money, summary: {
    total: rows.length, unbilled: count('unbilled'), unpaid: count('unpaid') + count('partial'), due_credit: count('due_credit'),
    payer_pending: count('payer_pending') + rows.filter((r) => r.auth_status === 'pending').length, er_deferred: count('er_deferred'),
    ip_ledger: count('ip_ledger'), outsourced: rows.filter((r) => r.order_dest === 'outsourced').length,
    paper: rows.filter((r) => r.order_source !== 'doctor_portal').length,
  } };
}));

/** Generate the bill for orders placed without one (e.g. the doctor unticked "bill now"). */
operations.post('/reception/investigations/bill', requirePerm('billing.create'), h((req) => {
  const ids = (Array.isArray(req.body?.order_ids) ? req.body.order_ids : []).map(Number).filter(Boolean);
  if (!ids.length) fail(400, 'orders_required');
  const orders = ids.map((id) => get('SELECT * FROM orders WHERE id=?', id) || fail(404, 'order_not_found'));
  if (new Set(orders.map((o) => o.encounter_id)).size !== 1) fail(400, 'one_visit_at_a_time');
  for (const o of orders) {
    if (o.status === 'cancelled') fail(409, 'order_cancelled');
    if (get('SELECT 1 FROM bill_items WHERE order_id=? AND amount > 0', o.id)) fail(409, 'already_billed', { order_no: o.order_no });
    if (o.provider_id && get("SELECT 1 FROM diagnostic_providers WHERE id=? AND billing='outside'", o.provider_id)) fail(409, 'paid_at_outside_centre', { order_no: o.order_no });
  }
  const e = get('SELECT * FROM encounters WHERE id=?', orders[0].encounter_id);
  return tx(() => {
    const billable = orders.map((o) => ({ order_id: o.id, service: get('SELECT * FROM services WHERE id=?', o.service_id) || fail(400, 'service_missing') }));
    const bill = billOrderRows(req, e, billable);
    emit(req, { topics: ['billing', 'lab', 'imaging', `encounter:${e.id}`, `patient:${e.patient_id}`], event: 'bill.created', data: { id: bill.id },
      action: 'investigation.bill', entity: 'bills', entityId: bill.id, detail: { before: null, after: { bill_no: bill.bill_no, orders: orders.map((o) => o.order_no), total: bill.total } } });
    return { bill };
  });
}));

/**
 * Send an order somewhere else: in-house, or a tie-up lab / imaging centre. Only before the sample is
 * taken. A centre the patient pays directly cannot take an order this hospital has already billed.
 */
operations.post('/orders/:id/destination', requireAuth, h((req) => {
  if (!can(req.user, 'billing.create') && !can(req.user, 'lab.verify') && !can(req.user, 'imaging.report')) fail(403, 'forbidden');
  const before = get('SELECT * FROM orders WHERE id=?', +req.params.id) || fail(404, 'order_not_found');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  if (!['ordered', 'awaiting_payment', 'scheduled'].includes(before.status)) fail(409, 'work_already_started');
  const providerId = req.body?.provider_id ? num(req.body.provider_id) : null;
  const provider = providerId ? get('SELECT * FROM diagnostic_providers WHERE id=? AND active=1', providerId) || fail(404, 'provider_not_found') : null;
  if (provider && provider.kind !== before.category) fail(400, 'provider_wrong_kind');
  if (provider?.billing === 'outside' && get('SELECT 1 FROM bill_items WHERE order_id=? AND amount > 0', before.id)) fail(409, 'already_billed_here');
  update('orders', before.id, { provider_id: provider?.id || null });
  const after = get('SELECT * FROM orders WHERE id=?', before.id);
  emit(req, { topics: ['lab', 'imaging', 'billing', `encounter:${before.encounter_id}`], event: 'order.updated', data: after,
    action: 'order.destination', entity: 'orders', entityId: before.id,
    detail: { before: { provider_id: before.provider_id, order_dest: before.order_dest }, after: { provider_id: after.provider_id, order_dest: after.order_dest }, reason } });
  return after;
}));

/** Reception cancels a test that has not started (wrong test, patient declined), with a reason. */
operations.post('/reception/investigations/:id/cancel', requirePerm('payment.authorize'), h((req) => {
  const before = get('SELECT * FROM orders WHERE id=?', +req.params.id) || fail(404, 'order_not_found');
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) fail(400, 'reason_required');
  if (!['ordered', 'awaiting_payment', 'scheduled'].includes(before.status)) fail(409, 'work_already_started');
  update('orders', before.id, { status: 'cancelled', clinical_note: [before.clinical_note, `Cancelled at reception: ${reason}`].filter(Boolean).join(' · ') });
  closeEncounterIfDone(before.encounter_id);
  const after = get('SELECT * FROM orders WHERE id=?', before.id);
  const billing_review = all(`SELECT DISTINCT b.id, b.bill_no, b.status, b.paid FROM bills b JOIN bill_items i ON i.bill_id=b.id
    WHERE i.order_id=? AND b.status<>'cancelled' AND i.amount>0 AND NOT EXISTS (SELECT 1 FROM bill_items w WHERE w.waiver_of=i.id)`, before.id);
  emit(req, { topics: ['lab', 'imaging', 'billing', `encounter:${before.encounter_id}`], event: 'order.updated', data: after,
    action: 'order.cancel', entity: 'orders', entityId: before.id, detail: { before, after, reason, billing_review } });
  return { ...after, billing_review };
}));
