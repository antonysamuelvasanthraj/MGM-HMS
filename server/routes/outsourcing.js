/**
 * Outsourced investigations — work a tie-up laboratory or imaging centre does for our patients.
 *
 *   order (in-house bill, as usual) → sample taken here / patient referred → dispatch to the centre
 *   → the centre's report comes back (kept exactly as sent, by version) → a lab / imaging signatory
 *   checks patient, test and sample and accepts it → the doctor and patient record get it
 *   → the centre's bill to the hospital is matched to those orders → payable → paid.
 *
 * The patient is billed once, by the hospital, through the normal bill. Nothing here creates or
 * changes a patient charge. A report accepted here is always shown as the outside centre's report,
 * with its own signatory; it is never printed as if this laboratory performed it.
 */
import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, emit, num, tx, nowIso, today, nextNo, requireOrderClearance, notifyResultPublished,
} from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { postOutsourceInvoice, postOutsourcePayment } from '../accounting.js';
import { closeEncounterIfDone } from './clinical.js';

export const outsourcing = Router();
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const TOPICS = ['lab', 'imaging', 'clinical', 'outsourcing'];
const canWork = (u, kind) => can(u, kind === 'imaging' ? 'imaging.schedule' : 'lab.collect');
const canSign = (u, kind) => can(u, kind === 'imaging' ? 'imaging.report' : 'lab.verify');
const canMaster = (u) => can(u, 'admin.view') || (can(u, 'staff.manage') && (can(u, 'lab.verify') || can(u, 'imaging.report')));
const addHours = (stamp, h) => { const d = new Date(String(stamp).replace(' ', 'T')); d.setHours(d.getHours() + (+h || 48)); return d.toLocaleString('sv-SE').slice(0, 19); };

/* ------------------------------------------------------------- test master */

outsourcing.get('/outsource/rates', requireAuth, h((req) => {
  if (!can(req.user, 'lab.view') && !can(req.user, 'imaging.view') && !can(req.user, 'admin.view') && !can(req.user, 'finance.view')) fail(403, 'forbidden');
  const w = ['1=1'], a = [];
  if (req.query.provider_id) { w.push('r.provider_id=?'); a.push(num(req.query.provider_id)); }
  if (req.query.service_id) { w.push('r.service_id=?'); a.push(num(req.query.service_id)); }
  return all(`SELECT r.*, s.code service_code, s.name service_name, s.category, s.price selling_price, s.sample_type, s.provider_id preferred_provider_id,
      p.name provider_name, p.billing, round(s.price - r.cost_price, 2) margin
    FROM outsource_rates r JOIN services s ON s.id=r.service_id JOIN diagnostic_providers p ON p.id=r.provider_id
    WHERE ${w.join(' AND ')} ORDER BY s.name, (s.provider_id=r.provider_id) DESC, r.cost_price`, ...a);
}));

outsourcing.post('/outsource/rates', requireAuth, h((req) => {
  if (!canMaster(req.user)) fail(403, 'forbidden');
  const b = req.body || {};
  const provider = get('SELECT * FROM diagnostic_providers WHERE id=?', num(b.provider_id)) || fail(404, 'provider_not_found');
  const svc = get('SELECT * FROM services WHERE id=?', num(b.service_id)) || fail(404, 'service_not_found');
  if (svc.category !== provider.kind) fail(400, 'provider_wrong_kind');
  if (/\bMRI\b/i.test(`${svc.name} ${svc.code}`)) fail(400, 'mri_not_offered');
  const cost = Number(b.cost_price);
  if (!Number.isFinite(cost) || cost < 0) fail(400, 'cost_invalid');
  const before = get('SELECT * FROM outsource_rates WHERE provider_id=? AND service_id=?', provider.id, svc.id) || null;
  const row = { provider_test_code: String(b.provider_test_code || '').trim() || null, cost_price: r2(cost), tat_hours: b.tat_hours ? num(b.tat_hours) : null,
    transport: String(b.transport || '').trim() || null, collection_notes: String(b.collection_notes || '').trim() || null,
    active: b.active === false || b.active === 0 ? 0 : 1, updated_by: req.user.id, updated_at: nowIso() };
  return tx(() => {
    const id = before ? (update('outsource_rates', before.id, row), before.id) : insert('outsource_rates', { ...row, provider_id: provider.id, service_id: svc.id });
    const svcBefore = svc.provider_id;
    if (b.preferred === true) update('services', svc.id, { provider_id: provider.id });
    if (b.preferred === false && svc.provider_id === provider.id) update('services', svc.id, { provider_id: null });
    const after = get('SELECT * FROM outsource_rates WHERE id=?', id);
    emit(req, { topics: ['admin', ...TOPICS], event: 'outsource.rate', data: after, action: 'outsource.rate.save', entity: 'outsource_rates', entityId: id,
      detail: { before: { rate: before, preferred_provider_id: svcBefore }, after: { rate: after, preferred_provider_id: get('SELECT provider_id FROM services WHERE id=?', svc.id).provider_id } } });
    return after;
  });
}));

/* ------------------------------------------------------------- worklist */

const ORDER_COLS = `o.id, o.order_no, o.label, o.category, o.priority, o.status, o.sample_id, o.ordered_at, o.collected_at, o.provider_id, o.result_stage,
  p.id patient_id, p.uhid, p.name patient_name, p.gender, p.age_years, e.encounter_no, e.kind encounter_kind,
  s.sample_type, pr.name provider_name, pr.billing,
  (SELECT r.cost_price FROM outsource_rates r WHERE r.provider_id=o.provider_id AND r.service_id=o.service_id AND r.active=1) cost_price,
  (SELECT r.provider_test_code FROM outsource_rates r WHERE r.provider_id=o.provider_id AND r.service_id=o.service_id) provider_test_code,
  (SELECT r.transport FROM outsource_rates r WHERE r.provider_id=o.provider_id AND r.service_id=o.service_id) transport`;
const ORDER_FROM = `FROM orders o JOIN patients p ON p.id=o.patient_id JOIN encounters e ON e.id=o.encounter_id
  LEFT JOIN services s ON s.id=o.service_id JOIN diagnostic_providers pr ON pr.id=o.provider_id`;

outsourcing.get('/outsource/worklist', requireAuth, h((req) => {
  if (!can(req.user, 'lab.view') && !can(req.user, 'imaging.view')) fail(403, 'forbidden');
  const kinds = [can(req.user, 'lab.view') && 'lab', can(req.user, 'imaging.view') && 'imaging'].filter(Boolean);
  const k = `o.category IN (${kinds.map(() => '?').join(',')})`;
  const toSend = all(`SELECT ${ORDER_COLS} ${ORDER_FROM} WHERE ${k} AND o.status NOT IN ('cancelled','verified')
      AND NOT EXISTS (SELECT 1 FROM outsource_items i WHERE i.order_id=o.id AND i.status NOT IN ('rejected','recalled'))
    ORDER BY CASE o.priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, o.id`, ...kinds)
    .map((r) => ({ ...r, ready: r.category === 'imaging' ? true : ['collected', 'in_progress'].includes(r.status) }));
  const sent = all(`SELECT ${ORDER_COLS}, i.id item_id, i.dispatch_id, d.dispatch_no, d.status dispatch_status, d.dispatched_at, i.external_ref, i.expected_at,
      i.appointment_at, i.study_no, i.image_link, i.status item_status,
      CASE WHEN i.status='sent' AND i.expected_at < datetime('now','localtime') THEN 1 ELSE 0 END overdue
    ${ORDER_FROM} JOIN outsource_items i ON i.order_id=o.id AND i.status IN ('sent','report_received') JOIN outsource_dispatches d ON d.id=i.dispatch_id
    WHERE ${k} ORDER BY overdue DESC, i.expected_at`, ...kinds);
  const toAccept = all(`SELECT x.*, o.order_no, o.label, o.category, p.name patient_name, p.uhid, p.gender, p.age_years, o.sample_id, pr.name provider_name, u.name received_by_name
    FROM external_reports x JOIN orders o ON o.id=x.order_id JOIN patients p ON p.id=o.patient_id LEFT JOIN diagnostic_providers pr ON pr.id=x.provider_id
    LEFT JOIN users u ON u.id=x.received_by WHERE x.status='received' AND ${k} ORDER BY x.id`, ...kinds);
  const dispatches = all(`SELECT d.*, p.name provider_name, (SELECT count(*) FROM outsource_items i WHERE i.dispatch_id=d.id) items
    FROM outsource_dispatches d JOIN diagnostic_providers p ON p.id=d.provider_id WHERE d.kind IN (${kinds.map(() => '?').join(',')})
    ORDER BY d.id DESC LIMIT 50`, ...kinds);
  return { to_send: toSend, sent, to_accept: toAccept, dispatches,
    summary: { to_send: toSend.length, sent: sent.length, overdue: sent.filter((s) => s.overdue).length, to_accept: toAccept.length } };
}));

/* ------------------------------------------------------------- dispatch */

/**
 * Hand samples (lab) or referrals (imaging) to one centre. Lab samples must already be taken here;
 * routine OP work must be paid or approved first (the usual release rule).
 */
outsourcing.post('/outsource/dispatches', requireAuth, h((req) => {
  const b = req.body || {};
  const provider = get('SELECT * FROM diagnostic_providers WHERE id=? AND active=1', num(b.provider_id)) || fail(404, 'provider_not_found');
  if (!canWork(req.user, provider.kind)) fail(403, 'forbidden');
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) fail(400, 'orders_required');
  if (provider.kind === 'lab' && !String(b.courier_name || '').trim()) fail(400, 'courier_required');
  const orders = items.map((it) => {
    const o = get('SELECT * FROM orders WHERE id=?', num(it.order_id)) || fail(404, 'order_not_found');
    if (o.provider_id !== provider.id) fail(409, 'order_not_for_this_centre', { order_no: o.order_no });
    if (o.status === 'cancelled' || o.status === 'verified') fail(409, 'order_closed', { order_no: o.order_no });
    if (provider.kind === 'lab' && !['collected', 'in_progress'].includes(o.status)) fail(409, 'sample_not_collected', { order_no: o.order_no });
    if (get("SELECT 1 FROM outsource_items WHERE order_id=? AND status NOT IN ('rejected','recalled')", o.id)) fail(409, 'already_dispatched', { order_no: o.order_no });
    if (provider.billing === 'hospital') requireOrderClearance(o);
    return { o, it };
  });
  return tx(() => {
    const dispatchedAt = nowIso();
    const id = insert('outsource_dispatches', { dispatch_no: nextNo('outsource_dispatch'), provider_id: provider.id, kind: provider.kind,
      courier_name: String(b.courier_name || '').trim() || null, courier_phone: String(b.courier_phone || '').trim() || null,
      temperature: b.temperature || null, sample_condition: b.sample_condition || null, notes: b.notes || null, dispatched_at: dispatchedAt, dispatched_by: req.user.id });
    for (const { o, it } of orders) {
      const rate = get('SELECT * FROM outsource_rates WHERE provider_id=? AND service_id=? AND active=1', provider.id, o.service_id);
      insert('outsource_items', { dispatch_id: id, order_id: o.id, sample_id: o.sample_id, specimen: it.specimen || get('SELECT sample_type FROM services WHERE id=?', o.service_id)?.sample_type || null,
        qty: it.qty || null, condition: it.condition || b.sample_condition || null, external_ref: it.external_ref || null,
        appointment_at: it.appointment_at || null, expected_at: it.expected_at || addHours(dispatchedAt, rate?.tat_hours || provider.default_tat_hours || 48),
        expected_cost: rate?.cost_price ?? null });
      if (['ordered', 'collected', 'scheduled'].includes(o.status)) update('orders', o.id, { status: 'in_progress' });
    }
    const row = get('SELECT * FROM outsource_dispatches WHERE id=?', id);
    emit(req, { topics: TOPICS, event: 'outsource.dispatched', data: row, action: 'outsource.dispatch', entity: 'outsource_dispatches', entityId: id,
      detail: { before: null, after: { dispatch_no: row.dispatch_no, provider: provider.name, orders: orders.map(({ o }) => o.order_no), courier: row.courier_name } } });
    return { ...row, items: orders.length };
  });
}));

outsourcing.get('/outsource/dispatches/:id', requireAuth, h((req) => {
  const d = get(`SELECT d.*, p.name provider_name, p.phone provider_phone, p.address provider_address, u.name dispatched_by_name
    FROM outsource_dispatches d JOIN diagnostic_providers p ON p.id=d.provider_id LEFT JOIN users u ON u.id=d.dispatched_by WHERE d.id=?`, +req.params.id) || fail(404, 'dispatch_not_found');
  if (!can(req.user, d.kind === 'imaging' ? 'imaging.view' : 'lab.view')) fail(403, 'forbidden');
  d.items = all(`SELECT i.*, o.order_no, o.label, o.priority, p.name patient_name, p.uhid, p.gender, p.age_years,
      (SELECT r.provider_test_code FROM outsource_rates r WHERE r.provider_id=? AND r.service_id=o.service_id) provider_test_code
    FROM outsource_items i JOIN orders o ON o.id=i.order_id JOIN patients p ON p.id=o.patient_id WHERE i.dispatch_id=? ORDER BY i.id`, d.provider_id, d.id);
  return d;
}));

/** The centre signed for the samples (or confirmed the appointments). */
outsourcing.post('/outsource/dispatches/:id/acknowledge', requireAuth, h((req) => {
  const d = get('SELECT * FROM outsource_dispatches WHERE id=?', +req.params.id) || fail(404, 'dispatch_not_found');
  if (!canWork(req.user, d.kind)) fail(403, 'forbidden');
  if (d.status !== 'dispatched') fail(409, 'already_acknowledged');
  const name = String(req.body?.received_by || '').trim();
  if (!name) fail(400, 'receiver_required');
  return tx(() => {
    update('outsource_dispatches', d.id, { status: 'acknowledged', acknowledged_at: req.body?.received_at || nowIso(), acknowledged_name: name, acknowledged_by: req.user.id });
    for (const [orderId, ref] of Object.entries(req.body?.external_refs || {})) if (String(ref).trim()) run('UPDATE outsource_items SET external_ref=? WHERE dispatch_id=? AND order_id=?', String(ref).trim(), d.id, num(orderId));
    const after = get('SELECT * FROM outsource_dispatches WHERE id=?', d.id);
    emit(req, { topics: TOPICS, event: 'outsource.acknowledged', data: after, action: 'outsource.acknowledge', entity: 'outsource_dispatches', entityId: d.id,
      detail: { before: { status: d.status }, after: { status: after.status, received_by: name } } });
    return after;
  });
}));

/** Reference numbers, expected date, imaging appointment / study number / image link. */
outsourcing.patch('/outsource/items/:id', requireAuth, h((req) => {
  const before = get('SELECT i.*, d.kind FROM outsource_items i JOIN outsource_dispatches d ON d.id=i.dispatch_id WHERE i.id=?', +req.params.id) || fail(404, 'item_not_found');
  if (!canWork(req.user, before.kind)) fail(403, 'forbidden');
  const patch = {};
  for (const k of ['external_ref', 'expected_at', 'appointment_at', 'study_no', 'image_link']) if (k in (req.body || {})) patch[k] = String(req.body[k] ?? '').trim() || null;
  if (patch.image_link && !/^(https?:\/\/|dicom:|pacs:)/i.test(patch.image_link)) fail(400, 'image_link_invalid');
  if (!Object.keys(patch).length) fail(400, 'nothing_to_change');
  update('outsource_items', before.id, patch);
  const after = get('SELECT * FROM outsource_items WHERE id=?', before.id);
  emit(req, { topics: TOPICS, event: 'outsource.updated', data: after, action: 'outsource.item.update', entity: 'outsource_items', entityId: before.id, detail: { before, after } });
  return after;
}));

/** Sample lost / rejected by the centre: the order can be sent again (to the same or another centre). */
outsourcing.post('/outsource/items/:id/recall', requireAuth, h((req) => {
  const it = get('SELECT i.*, d.kind FROM outsource_items i JOIN outsource_dispatches d ON d.id=i.dispatch_id WHERE i.id=?', +req.params.id) || fail(404, 'item_not_found');
  if (!canWork(req.user, it.kind)) fail(403, 'forbidden');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  if (!['sent', 'report_received'].includes(it.status)) fail(409, 'item_closed');
  update('outsource_items', it.id, { status: 'recalled' });
  emit(req, { topics: TOPICS, event: 'outsource.updated', data: { id: it.id }, action: 'outsource.item.recall', entity: 'outsource_items', entityId: it.id,
    detail: { before: { status: it.status }, after: { status: 'recalled' }, reason } });
  return { ok: true };
}));

/* ------------------------------------------------------------- external reports */

function liveItem(orderId) { return get("SELECT * FROM outsource_items WHERE order_id=? AND status NOT IN ('rejected','recalled') ORDER BY id DESC LIMIT 1", orderId); }

/** Record the report a centre sent (file already attached to the order). Not yet visible to the doctor. */
export function recordExternalReport(req, o, b) {
  const provider = o.provider_id ? get('SELECT * FROM diagnostic_providers WHERE id=?', o.provider_id) : null;
  if (!provider) fail(409, 'not_an_outside_order');
  const used = new Set(all('SELECT attachment_ids FROM external_reports WHERE order_id=?', o.id).flatMap((r) => JSON.parse(r.attachment_ids || '[]')));
  const files = all("SELECT id FROM attachments WHERE entity='order' AND entity_id=? AND deleted_at IS NULL ORDER BY id", o.id).map((a) => a.id).filter((id) => !used.has(id));
  if (!files.length) fail(409, 'attach_the_report_first');
  const reportingLab = String(b.reporting_lab || provider.name).trim();
  const signatory = String(b.signatory_name || '').trim();
  if (!signatory) fail(400, 'signatory_required');
  const prior = get("SELECT * FROM external_reports WHERE order_id=? AND status='accepted' ORDER BY version DESC LIMIT 1", o.id);
  const version = (one('SELECT max(version) FROM external_reports WHERE order_id=?', o.id) || 0) + 1;
  const id = insert('external_reports', { order_id: o.id, provider_id: provider.id, version, external_report_no: String(b.external_report_no || '').trim() || null,
    reporting_lab: reportingLab, signatory_name: signatory, signatory_reg_no: String(b.signatory_reg_no || '').trim() || null,
    reported_at: b.reported_at || null, image_link: String(b.image_link || '').trim() || null, attachment_ids: JSON.stringify(files),
    is_correction: prior ? 1 : 0, received_by: req.user.id, notes: b.notes || null });
  const item = liveItem(o.id);
  if (item) update('outsource_items', item.id, { status: 'report_received', ...(b.image_link ? { image_link: String(b.image_link).trim() } : {}) });
  update('orders', o.id, { result_stage: 'under_verification' });
  return get('SELECT * FROM external_reports WHERE id=?', id);
}

outsourcing.post('/outsource/orders/:id/report', requireAuth, h((req) => {
  const o = get('SELECT * FROM orders WHERE id=?', +req.params.id) || fail(404, 'order_not_found');
  if (!can(req.user, o.category === 'imaging' ? 'imaging.report' : 'lab.result')) fail(403, 'forbidden');
  return tx(() => {
    const row = recordExternalReport(req, o, req.body || {});
    emit(req, { topics: TOPICS, event: 'outsource.report', data: row, action: 'outsource.report.receive', entity: 'external_reports', entityId: row.id,
      detail: { before: null, after: { order_no: o.order_no, version: row.version, report_no: row.external_report_no, lab: row.reporting_lab, signatory: row.signatory_name } } });
    return row;
  });
}));

outsourcing.get('/outsource/orders/:id/reports', requireAuth, h((req) => {
  const o = get('SELECT * FROM orders WHERE id=?', +req.params.id) || fail(404, 'order_not_found');
  if (!can(req.user, o.category === 'imaging' ? 'imaging.view' : 'lab.view') && !can(req.user, 'patient.clinical')) fail(403, 'forbidden');
  return all(`SELECT x.*, a.name accepted_by_name, r.name received_by_name FROM external_reports x LEFT JOIN users a ON a.id=x.accepted_by
    LEFT JOIN users r ON r.id=x.received_by WHERE x.order_id=? ORDER BY x.version DESC`, o.id);
}));

/**
 * A signatory checks the report belongs to this patient, this test and this sample, then accepts it.
 * The first accepted version publishes the result; a later one is a corrected report ('amended').
 */
export function acceptExternalReport(req, x, checks) {
  const o = get('SELECT * FROM orders WHERE id=?', x.order_id);
  if (!canSign(req.user, o.category)) fail(403, 'forbidden');
  if (x.status !== 'received') fail(409, 'report_not_pending');
  if (!(checks?.patient && checks?.test && checks?.sample)) fail(400, 'identity_checks_required');
  if (o.status === 'cancelled') fail(409, 'order_cancelled');
  requireOrderClearance(o);
  const prior = get("SELECT * FROM external_reports WHERE order_id=? AND status='accepted' ORDER BY version DESC LIMIT 1", o.id);
  if (prior) update('external_reports', prior.id, { status: 'superseded' });
  update('external_reports', x.id, { status: 'accepted', accepted_by: req.user.id, accepted_at: nowIso(), checks: JSON.stringify(checks) });
  const item = liveItem(o.id);
  if (item) update('outsource_items', item.id, { status: 'accepted' });
  if (o.status !== 'verified') update('orders', o.id, { status: 'verified', verified_by: req.user.id, verified_at: nowIso(), completed_at: o.completed_at || nowIso() });
  update('orders', o.id, { result_stage: prior ? 'amended' : 'released' });
  closeEncounterIfDone(o.encounter_id);
  const row = get('SELECT * FROM orders WHERE id=?', o.id);
  notifyResultPublished(row, o.category);
  return { order: row, report: get('SELECT * FROM external_reports WHERE id=?', x.id), corrected: !!prior };
}

outsourcing.post('/outsource/reports/:id/accept', requireAuth, h((req) => {
  const x = get('SELECT * FROM external_reports WHERE id=?', +req.params.id) || fail(404, 'report_not_found');
  return tx(() => {
    const out = acceptExternalReport(req, x, req.body?.checks || {});
    emit(req, { topics: [...TOPICS, 'dashboard', 'notifications', `patient:${out.order.patient_id}`, `encounter:${out.order.encounter_id}`],
      event: out.order.category === 'lab' ? 'lab.verified' : 'imaging.signed', data: out.order,
      action: out.corrected ? 'outsource.report.correct' : 'outsource.report.accept', entity: 'external_reports', entityId: x.id,
      detail: { before: { status: 'received' }, after: { status: 'accepted', version: x.version, signatory: x.signatory_name, lab: x.reporting_lab }, checks: req.body?.checks } });
    return out;
  });
}));

outsourcing.post('/outsource/reports/:id/reject', requireAuth, h((req) => {
  const x = get('SELECT * FROM external_reports WHERE id=?', +req.params.id) || fail(404, 'report_not_found');
  const o = get('SELECT * FROM orders WHERE id=?', x.order_id);
  if (!canSign(req.user, o.category)) fail(403, 'forbidden');
  if (x.status !== 'received') fail(409, 'report_not_pending');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  return tx(() => {
    update('external_reports', x.id, { status: 'rejected', rejected_reason: reason });
    const item = liveItem(o.id);
    if (item && item.status === 'report_received') update('outsource_items', item.id, { status: 'sent' });
    if (!get("SELECT 1 FROM external_reports WHERE order_id=? AND status='accepted'", o.id)) update('orders', o.id, { result_stage: 'pending' });
    emit(req, { topics: TOPICS, event: 'outsource.report', data: { id: x.id }, action: 'outsource.report.reject', entity: 'external_reports', entityId: x.id,
      detail: { before: { status: 'received' }, after: { status: 'rejected' }, reason } });
    return { ok: true };
  });
}));

/* ------------------------------------------------------------- the centre's bills */

outsourcing.get('/outsource/payables', requirePerm('finance.view'), h(() => {
  const providers = all(`SELECT p.id, p.name, p.kind, p.billing, p.credit_days,
      (SELECT coalesce(sum(total),0) FROM outsource_invoices i WHERE i.provider_id=p.id AND i.status<>'cancelled') billed,
      (SELECT coalesce(sum(amount),0) FROM outsource_payments x WHERE x.provider_id=p.id) paid,
      (SELECT count(*) FROM orders o WHERE o.provider_id=p.id AND o.status='verified' AND p.billing='hospital'
         AND NOT EXISTS (SELECT 1 FROM outsource_invoice_items ii WHERE ii.order_id=o.id)) uninvoiced,
      (SELECT coalesce(sum(r.cost_price),0) FROM orders o JOIN outsource_rates r ON r.provider_id=o.provider_id AND r.service_id=o.service_id
        WHERE o.provider_id=p.id AND o.status='verified' AND NOT EXISTS (SELECT 1 FROM outsource_invoice_items ii WHERE ii.order_id=o.id)) uninvoiced_cost
    FROM diagnostic_providers p WHERE p.billing='hospital' ORDER BY p.name`).map((r) => ({ ...r, outstanding: r2(r.billed - r.paid) }));
  const invoices = all(`SELECT i.*, p.name provider_name, (SELECT count(*) FROM outsource_invoice_items x WHERE x.invoice_id=i.id) lines
    FROM outsource_invoices i JOIN diagnostic_providers p ON p.id=i.provider_id ORDER BY i.id DESC LIMIT 100`);
  return { providers, invoices };
}));

/** Orders a centre has done for us that are not yet on one of its bills (to match a new bill against). */
outsourcing.get('/outsource/providers/:id/uninvoiced', requirePerm('finance.view'), h((req) => all(`SELECT o.id, o.order_no, o.label, o.verified_at, p.name patient_name, p.uhid,
    (SELECT r.cost_price FROM outsource_rates r WHERE r.provider_id=o.provider_id AND r.service_id=o.service_id) expected_cost,
    (SELECT coalesce(sum(bi.amount),0) FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id AND b.status<>'cancelled') patient_charge
  FROM orders o JOIN patients p ON p.id=o.patient_id WHERE o.provider_id=? AND o.status IN ('verified','in_progress')
    AND NOT EXISTS (SELECT 1 FROM outsource_invoice_items ii WHERE ii.order_id=o.id) ORDER BY o.id`, +req.params.id)));

outsourcing.post('/outsource/invoices', requirePerm('finance.payables'), h((req) => {
  const b = req.body || {};
  const provider = get('SELECT * FROM diagnostic_providers WHERE id=?', num(b.provider_id)) || fail(404, 'provider_not_found');
  if (provider.billing !== 'hospital') fail(409, 'patient_pays_this_centre');
  const invoiceNo = String(b.invoice_no || '').trim();
  if (!invoiceNo) fail(400, 'invoice_no_required');
  if (get('SELECT 1 FROM outsource_invoices WHERE provider_id=? AND invoice_no=?', provider.id, invoiceNo)) fail(409, 'invoice_already_entered');
  const lines = (Array.isArray(b.items) ? b.items : []).map((it) => {
    const o = get('SELECT * FROM orders WHERE id=?', num(it.order_id)) || fail(404, 'order_not_found');
    if (o.provider_id !== provider.id) fail(409, 'order_not_for_this_centre', { order_no: o.order_no });
    if (get('SELECT 1 FROM outsource_invoice_items WHERE order_id=?', o.id)) fail(409, 'order_already_invoiced', { order_no: o.order_no });
    const cost = Number(it.cost);
    if (!Number.isFinite(cost) || cost < 0) fail(400, 'cost_invalid', { order_no: o.order_no });
    return { order_id: o.id, cost: r2(cost) };
  });
  if (!lines.length) fail(400, 'items_required');
  if (new Set(lines.map((l) => l.order_id)).size !== lines.length) fail(400, 'order_listed_twice');
  const total = r2(lines.reduce((s, l) => s + l.cost, 0));
  return tx(() => {
    const id = insert('outsource_invoices', { ref_no: nextNo('outsource_invoice'), provider_id: provider.id, invoice_no: invoiceNo, invoice_date: b.invoice_date || today(),
      total, notes: b.notes || null, created_by: req.user.id });
    for (const l of lines) insert('outsource_invoice_items', { invoice_id: id, ...l });
    const inv = get('SELECT * FROM outsource_invoices WHERE id=?', id);
    postOutsourceInvoice(inv);
    emit(req, { topics: ['accounts', 'outsourcing', 'dashboard'], event: 'outsource.invoice', data: inv, action: 'outsource.invoice.create', entity: 'outsource_invoices', entityId: id,
      detail: { before: null, after: { ref_no: inv.ref_no, provider: provider.name, invoice_no: invoiceNo, total, orders: lines.length } } });
    return inv;
  });
}));

outsourcing.post('/outsource/payments', requirePerm('finance.payables'), h((req) => {
  const b = req.body || {};
  const provider = get('SELECT * FROM diagnostic_providers WHERE id=?', num(b.provider_id)) || fail(404, 'provider_not_found');
  const amount = r2(Number(b.amount));
  const outstanding = r2(one("SELECT coalesce(sum(total - paid),0) FROM outsource_invoices WHERE provider_id=? AND status<>'cancelled'", provider.id) || 0);
  if (!(amount > 0) || amount > outstanding + 0.005) fail(400, 'amount_invalid', { outstanding });
  if (!['cash', 'bank_transfer', 'cheque', 'upi'].includes(b.mode)) fail(400, 'payment_mode_invalid');
  if (b.mode !== 'cash' && !String(b.reference || '').trim()) fail(400, 'reference_required');
  return tx(() => {
    const id = insert('outsource_payments', { payment_no: nextNo('outsource_payment'), provider_id: provider.id, invoice_id: b.invoice_id ? num(b.invoice_id) : null,
      amount, mode: b.mode, reference: b.reference || null, paid_on: b.paid_on || today(), notes: b.notes || null, created_by: req.user.id });
    let left = amount;
    const invs = b.invoice_id ? all("SELECT * FROM outsource_invoices WHERE id=? AND provider_id=? AND status<>'cancelled'", num(b.invoice_id), provider.id)
      : all("SELECT * FROM outsource_invoices WHERE provider_id=? AND status IN ('open','part_paid') ORDER BY id", provider.id);
    for (const inv of invs) {
      if (left <= 0) break;
      const take = Math.min(left, r2(inv.total - inv.paid));
      if (take <= 0) continue;
      update('outsource_invoices', inv.id, { paid: r2(inv.paid + take), status: inv.paid + take >= inv.total - 0.005 ? 'paid' : 'part_paid' });
      left = r2(left - take);
    }
    if (left > 0.005) fail(400, 'amount_exceeds_invoice', { left });
    const row = get('SELECT * FROM outsource_payments WHERE id=?', id);
    postOutsourcePayment(row);
    emit(req, { topics: ['accounts', 'outsourcing', 'dashboard'], event: 'outsource.paid', data: row, action: 'outsource.payment', entity: 'outsource_payments', entityId: id,
      detail: { before: { outstanding }, after: { outstanding: r2(outstanding - amount) }, mode: b.mode, reference: b.reference } });
    return row;
  });
}));
