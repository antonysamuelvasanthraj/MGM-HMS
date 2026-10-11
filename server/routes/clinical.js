import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, nextNo, today, where, emit, num, money,
  recalcBill, patientCard, tx, setting, nowIso, requireOrderClearance,
priceFor, callGate, } from '../lib.js';
import { billNewToPayer } from '../payer-billing.js';
import { ipBill } from '../ipd-charges.js';
import { activeAssignment, applyPackage } from '../packages.js';
import { requireAuth, requirePerm, requireAnyPerm, can } from '../auth.js';
import { encounterView } from './opd.js';

export const clinical = Router();
const TOPICS = ['clinical', 'queue', 'dashboard'];

/* ---------------------------------------------------------- consultations */

clinical.get('/consultations', requirePerm('patient.clinical'), h((req) => {
  const w = where({
    'c.patient_id = ?': req.query.patient_id,
    'c.doctor_id = ?': req.query.doctor_id,
    'c.encounter_id = ?': req.query.encounter_id,
    'c.status = ?': req.query.status,
    'date(c.created_at) = ?': req.query.date,
  });
  return all(
    `SELECT c.*, p.uhid, p.name patient_name, p.gender, p.age_years, u.name doctor_name,
            e.encounter_no, e.token_no, e.visit_date, e.visit_type,
            (SELECT count(*) FROM consultation_amendments a WHERE a.consultation_id=c.id) amendments
       FROM consultations c JOIN patients p ON p.id=c.patient_id
       LEFT JOIN users u ON u.id=c.doctor_id LEFT JOIN encounters e ON e.id=c.encounter_id
       ${w.sql} ORDER BY c.id DESC LIMIT 300`, ...w.args);
}));

clinical.get('/consultations/:id', requirePerm('patient.clinical'), h((req) => {
  const c = get(
    `SELECT c.*, p.uhid, p.name patient_name, u.name doctor_name, e.encounter_no, e.token_no
       FROM consultations c JOIN patients p ON p.id=c.patient_id
       LEFT JOIN users u ON u.id=c.doctor_id LEFT JOIN encounters e ON e.id=c.encounter_id
      WHERE c.id=?`, +req.params.id);
  if (!c) fail(404, 'consultation_not_found');
  c.amendments = all(
    `SELECT a.*, u.name amended_by_name FROM consultation_amendments a
       LEFT JOIN users u ON u.id=a.amended_by WHERE a.consultation_id=? ORDER BY a.id DESC`, c.id);
  return c;
}));

/** Create or update the consultation note for an encounter (upsert per encounter). */
clinical.post('/consultations', requirePerm('consult.write'), h((req) => {
  const b = req.body || {};
  const e = get('SELECT * FROM encounters WHERE id=?', num(b.encounter_id));
  if (!e) fail(400, 'encounter_required');
  // An OP patient still in the queue is seen only once the desk has cleared them (fee / vitals) — the same
  // gate as calling from the queue. Emergency and inpatient care is never gated.
  const waiting = ['registered', 'vitals_pending', 'vitals_done', 'ready'].includes(e.stage);
  if (e.kind === 'OP' && waiting) {
    const gate = callGate(e);
    if (!gate.ok) fail(409, 'call_blocked', { reasons: gate.reasons });
  }
  const fields = {
    chief_complaint: b.chief_complaint, hopi: b.hopi, past_history: b.past_history,
    examination: b.examination, diagnosis: b.diagnosis, icd_codes: b.icd_codes,
    plan: b.plan, advice: b.advice, follow_up_date: b.follow_up_date || null,
  };
  let existing = get('SELECT * FROM consultations WHERE encounter_id=? ORDER BY id DESC LIMIT 1', e.id);
  let id;
  if (existing) {
    // A signed note may only change through a reasoned amendment.
    const locked = ['signed', 'amended'].includes(existing.status);
    if (locked && !String(b.amend_reason || '').trim()) {
      const changed = Object.entries(fields).filter(([k, v]) => v !== undefined && String(v ?? '') !== String(existing[k] ?? ''));
      if (changed.length) fail(409, 'amendment_reason_required', { fields: changed.map((c) => c[0]) });
    }
    if (locked && String(b.amend_reason || '').trim()) {
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || String(v ?? '') === String(existing[k] ?? '')) continue;
        insert('consultation_amendments', {
          consultation_id: existing.id, field: k, old_value: existing[k], new_value: v,
          reason: b.amend_reason, amended_by: req.user.id,
        });
      }
      fields.status = 'amended';
    }
    update('consultations', existing.id, { ...fields, updated_at: nowIso(), ...(b.status === 'signed' ? { status: locked ? 'amended' : 'signed', signed_at: existing.signed_at || nowIso() } : {}) });
    id = existing.id;
  } else {
    id = insert('consultations', {
      encounter_id: e.id, patient_id: e.patient_id, doctor_id: req.user.id,
      ...fields,
      status: b.status === 'signed' ? 'signed' : 'draft',
      signed_at: b.status === 'signed' ? nowIso() : null,
    });
  }
  // Opening the note is the doctor seeing the patient: the queue, the waiting-room display and the
  // consultation timings follow, exactly as if the token had been called from the queue.
  let called = false;
  if (e.kind === 'OP' && waiting) {
    update('encounters', e.id, { stage: 'in_consult', called_at: e.called_at || nowIso(), consult_start: e.consult_start || nowIso() });
    called = true;
  }
  if (b.status === 'signed' && ['in_consult', 'ready', 'vitals_done'].includes(get('SELECT stage FROM encounters WHERE id=?', e.id).stage)) {
    const hasOpenOrders = one(
      `SELECT count(*) FROM orders WHERE encounter_id=? AND status NOT IN ('verified','dispensed','cancelled')`, e.id);
    update('encounters', e.id, {
      stage: hasOpenOrders ? 'services_pending' : 'consulted',
      consult_end: nowIso(),
    });
  }
  if (called) emit(req, { topics: ['queue', 'opd', 'dashboard', 'display', `encounter:${e.id}`], event: 'encounter.stage', data: { id: e.id },
    action: 'encounter.in_consult', entity: 'encounters', entityId: e.id, detail: { before: { stage: e.stage }, after: { stage: 'in_consult' }, reason: 'Consultation opened' } });
  const view = encounterView(e.id);
  emit(req, {
    topics: [...TOPICS, `encounter:${e.id}`, `patient:${e.patient_id}`],
    event: 'consultation.saved', data: view,
    action: b.status === 'signed' ? 'consultation.sign' : 'consultation.save',
    entity: 'consultations', entityId: id, detail: { encounter: e.encounter_no },
  });
  return { consultation: get('SELECT * FROM consultations WHERE id=?', id), encounter: view };
}));

/* ----------------------------------------------------------------- orders */

clinical.get('/orders', requirePerm('order.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.category && req.query.category !== 'all') { extra.push('o.category = ?'); args.push(req.query.category); }
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'open') extra.push("o.status NOT IN ('verified','dispensed','cancelled')");
    else { extra.push('o.status = ?'); args.push(req.query.status); }
  }
  if (req.query.encounter_id) { extra.push('o.encounter_id = ?'); args.push(+req.query.encounter_id); }
  if (req.query.patient_id) { extra.push('o.patient_id = ?'); args.push(+req.query.patient_id); }
  if (req.query.priority && req.query.priority !== 'all') { extra.push('o.priority = ?'); args.push(req.query.priority); }
  if (req.query.date) { extra.push('date(o.ordered_at) = ?'); args.push(req.query.date); }
  if (req.query.q) { extra.push('(o.order_no LIKE ? OR o.label LIKE ? OR p.name LIKE ? OR p.uhid LIKE ? OR o.sample_id LIKE ?)');
    const l = `%${req.query.q}%`; args.push(l, l, l, l, l); }
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  return all(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            u.name ordered_by_name, v.name verified_by_name, s.name service_name, s.price, s.tat_minutes, s.sample_type,
            e.token_no, e.encounter_no, e.kind encounter_kind,
            (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id) result_count,
            (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id AND r.flag='critical') critical_count,
            (SELECT b.status FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) bill_status,
            (SELECT b.payer_type FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) bill_payer,
            (SELECT b.claim_status FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) claim_status
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN users u ON u.id=o.ordered_by LEFT JOIN users v ON v.id=o.verified_by
       LEFT JOIN services s ON s.id=o.service_id
       LEFT JOIN encounters e ON e.id=o.encounter_id
       ${w} ORDER BY o.priority='stat' DESC, o.priority='urgent' DESC, o.id DESC LIMIT ?`,
    ...args, Math.min(num(req.query.limit, 250), 800));
}));

/** Place one or more clinical orders; optionally bill them straight away. */
clinical.post('/orders', requirePerm('order.create'), h((req) => {
  const b = req.body || {};
  const e = get('SELECT * FROM encounters WHERE id=?', num(b.encounter_id));
  if (!e) fail(400, 'encounter_required');
  const items = Array.isArray(b.items) ? b.items : [b];
  if (!items.length) fail(400, 'items_required');

  return tx(() => {
    const created = [];
    const billable = [];
    for (const it of items) {
      const svc = it.service_id ? get('SELECT * FROM services WHERE id=?', num(it.service_id)) : null;
      const category = it.category || svc?.category || 'procedure';
      const oid = insert('orders', {
        order_no: nextNo('order'), encounter_id: e.id, patient_id: e.patient_id,
        service_id: svc?.id || null, category,
        label: it.label || svc?.name || 'Service',
        priority: it.priority || 'routine', clinical_note: it.clinical_note,
        // inpatient and emergency work is never held for money: it goes on the running IP / ER bill
        status: ['lab','imaging'].includes(category) && !['EMG', 'IP'].includes(e.kind) && e.priority !== 'emergency' && (!svc || svc.price > 0) ? 'awaiting_payment' : 'ordered',
        ordered_by: req.user.id,
        sample_id: category === 'lab' ? `S${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}` : null,
        modality: category === 'imaging' ? (svc?.name || '').match(/USG|CT|MRI|ECG|Echo/i)?.[0]?.toUpperCase() || 'XR' : null,
      });
      created.push(oid);
      if (svc) billable.push({ order_id: oid, service: svc });
    }

    let bill = null;
    if (b.bill !== false && billable.length) {
      const admission = e.kind === 'IP' ? get("SELECT * FROM admissions WHERE encounter_id=? AND status<>'discharged'", e.id) : null;
      const running = admission ? ipBill(admission)
        : e.kind === 'EMG' ? get("SELECT * FROM bills WHERE encounter_id=? AND bill_type='ER' AND status<>'cancelled' ORDER BY id DESC LIMIT 1", e.id) : null;
      const bid = running ? running.id : insert('bills', {
        bill_no: nextNo('bill'), patient_id: e.patient_id, encounter_id: e.id,
        bill_type: e.kind === 'EMG' ? 'ER' : billable[0].service.category === 'lab' ? 'LAB'
                 : billable[0].service.category === 'imaging' ? 'IMAGING' : 'OP',
        status: 'unpaid', payer_type: get('SELECT payer_type FROM patients WHERE id=?', e.patient_id).payer_type,
        created_by: req.user.id, ...(e.kind === 'EMG' ? { source: 'emergency', source_id: get('SELECT id FROM emergency_cases WHERE encounter_id=?', e.id)?.id || null } : {}),
      });
      for (const { order_id, service } of billable) {
        insert('bill_items', {
          bill_id: bid, service_id: service.id, order_id,
          description: service.name, category: service.category,
          qty: 1, rate: priceFor(service, e.patient_id), gst_pct: service.gst_pct, amount: priceFor(service, e.patient_id),
        });
        update('orders', order_id, { billed: 1 });
      }
      bill = recalcBill(bid);
    }

    if (e.stage === 'consulted') update('encounters', e.id, { stage: 'services_pending' });
    const view = encounterView(e.id);
    emit(req, {
      topics: [...TOPICS, 'lab', 'imaging', 'billing', `encounter:${e.id}`, `patient:${e.patient_id}`],
      event: 'orders.created', data: { encounter: view, order_ids: created, bill },
      action: 'order.create', entity: 'orders', entityId: created[0],
      detail: { count: created.length, labels: items.map((i) => i.label || i.service_id) },
    });
    if (bill?.id && billNewToPayer(req, [bill.id]).length) bill = get('SELECT * FROM bills WHERE id=?', bill.id);
    if (bill?.id && applyPackage(req, activeAssignment({ encounterId: e.id }))) bill = get('SELECT * FROM bills WHERE id=?', bill.id);
    return { encounter: view, orders: created.map((id) => get('SELECT * FROM orders WHERE id=?', id)), bill };
  });
}));

clinical.patch('/orders/:id', requirePerm('order.update'), h((req) => {
  const id = +req.params.id;
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o) fail(404, 'order_not_found');
  const patch = {};
  for (const k of ['status', 'priority', 'scheduled_at', 'room', 'modality', 'clinical_note', 'sample_id']) if (k in req.body) patch[k] = req.body[k];
  if (patch.status && ['lab','imaging'].includes(o.category)) {
    requireOrderClearance(o);
    if (['reported','verified'].includes(patch.status)) fail(409, 'use_report_workflow');
    if (!can(req.user, o.category === 'lab' ? 'lab.collect' : 'imaging.schedule')) fail(403, 'forbidden');
    if (o.status === 'verified') fail(409, 'verified_order_locked');
  }
  const nowStamp = nowIso();
  if (patch.status === 'collected') patch.collected_at = nowStamp;
  if (['reported', 'verified'].includes(patch.status)) patch.completed_at = o.completed_at || nowStamp;
  if (patch.status === 'verified') { patch.verified_by = req.user.id; patch.verified_at = nowStamp; }
  update('orders', id, patch);
  const row = get('SELECT * FROM orders WHERE id=?', id);
  closeEncounterIfDone(o.encounter_id);
  emit(req, {
    topics: [...TOPICS, 'lab', 'imaging', `encounter:${o.encounter_id}`, `patient:${o.patient_id}`],
    event: 'order.updated', data: row,
    action: 'order.update', entity: 'orders', entityId: id, detail: patch,
  });
  return row;
}));

clinical.post('/orders/:id/cancel', requirePerm('order.update'), h((req) => {
  const id = +req.params.id;
  const before = get('SELECT * FROM orders WHERE id=?', id) || fail(404, 'order_not_found');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  update('orders', id, { status: 'cancelled', clinical_note: reason });
  closeEncounterIfDone(before.encounter_id);
  const row = get('SELECT * FROM orders WHERE id=?', id);
  const billing_review = all(`SELECT DISTINCT b.id, b.bill_no, b.status FROM bills b JOIN bill_items i ON i.bill_id=b.id
    WHERE i.order_id=? AND b.status<>'cancelled' AND i.amount>0 AND NOT EXISTS (SELECT 1 FROM bill_items w WHERE w.waiver_of=i.id)`, id);
  emit(req, { topics: [...TOPICS, 'lab', 'imaging', 'billing'], event: 'order.updated', data: row,
    action: 'order.cancel', entity: 'orders', entityId: id, detail: {before,after:row,reason,billing_review} });
  return {...row,billing_review};
}));

export function closeEncounterIfDone(encounterId) {
  if (!encounterId) return;
  const e = get('SELECT * FROM encounters WHERE id=?', encounterId);
  if (!e || e.stage !== 'services_pending') return;
  const open = one(
    `SELECT count(*) FROM orders WHERE encounter_id=? AND status NOT IN ('verified','dispensed','cancelled')`, encounterId);
  if (!open) update('encounters', encounterId, { stage: 'consulted' });
}

/* ---------------------------------------------------------- prescriptions */

clinical.get('/prescriptions', requirePerm('patient.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.status && req.query.status !== 'all') { extra.push('r.status = ?'); args.push(req.query.status); }
  if (req.query.patient_id) { extra.push('r.patient_id = ?'); args.push(+req.query.patient_id); }
  if (req.query.encounter_id) { extra.push('r.encounter_id = ?'); args.push(+req.query.encounter_id); }
  if (req.query.date) { extra.push('date(r.created_at) = ?'); args.push(req.query.date); }
  if (req.query.q) { extra.push('(p.name LIKE ? OR p.uhid LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l); }
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  const rows = all(
    `SELECT r.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, u.name doctor_name,
            e.token_no, e.encounter_no,
            (SELECT count(*) FROM prescription_items i WHERE i.prescription_id=r.id) item_count
       FROM prescriptions r JOIN patients p ON p.id=r.patient_id
       LEFT JOIN users u ON u.id=r.doctor_id LEFT JOIN encounters e ON e.id=r.encounter_id
       ${w} ORDER BY r.id DESC LIMIT 200`, ...args);
  for (const r of rows) r.items = all('SELECT * FROM prescription_items WHERE prescription_id=?', r.id);
  return rows;
}));

clinical.post('/prescriptions', requirePerm('rx.write'), h((req) => {
  const b = req.body || {};
  const e = get('SELECT * FROM encounters WHERE id=?', num(b.encounter_id));
  if (!e) fail(400, 'encounter_required');
  let rx = get("SELECT * FROM prescriptions WHERE encounter_id=? AND status='active' ORDER BY id DESC LIMIT 1", e.id);
  const id = rx ? rx.id : insert('prescriptions', {
    encounter_id: e.id, patient_id: e.patient_id, doctor_id: req.user.id, notes: b.notes,
  });
  if (b.replace) run('DELETE FROM prescription_items WHERE prescription_id=?', id);
  for (const it of b.items || []) {
    const perDay = (String(it.frequency || '').match(/[1-9]/g) || ['1']).reduce((s, n) => s + +n, 0);
    // A typed name that matches the pharmacy master is linked, so the pharmacy can dispense it.
    const med = it.medicine_id ? get('SELECT id, name FROM medicines WHERE id=?', num(it.medicine_id))
      : get('SELECT id, name FROM medicines WHERE lower(trim(name))=lower(trim(?)) AND active=1', it.drug || '');
    insert('prescription_items', {
      prescription_id: id, medicine_id: med?.id || null, drug: it.drug || med?.name || 'Medicine',
      dose: it.dose, route: it.route || 'Oral', frequency: it.frequency,
      duration_days: num(it.duration_days, null),
      qty: it.qty !== undefined ? num(it.qty) : perDay * num(it.duration_days, 1),
      instructions: it.instructions,
    });
  }
  if (b.notes !== undefined) update('prescriptions', id, { notes: b.notes });
  const row = get('SELECT * FROM prescriptions WHERE id=?', id);
  row.items = all('SELECT * FROM prescription_items WHERE prescription_id=?', id);
  emit(req, {
    topics: [...TOPICS, 'pharmacy', `encounter:${e.id}`, `patient:${e.patient_id}`],
    event: 'prescription.saved', data: row,
    action: 'prescription.save', entity: 'prescriptions', entityId: id, detail: { items: (b.items || []).length },
  });
  return row;
}));

/* -------------------------------------------------------------- templates */

clinical.get('/templates', requireAuth, h((req) => all(
  `SELECT t.*, u.name owner_name FROM templates t LEFT JOIN users u ON u.id=t.owner_id
    WHERE (t.owner_id=? OR t.scope<>'private') ${req.query.kind ? 'AND t.kind=?' : ''}
    ORDER BY t.kind, t.name`, req.user.id, ...(req.query.kind ? [req.query.kind] : []))));

clinical.post('/templates', requirePerm('template.write'), h((req) => {
  const b = req.body;
  const id = b.id ? (update('templates', b.id, { name: b.name, body: b.body, kind: b.kind, scope: b.scope, updated_at: nowIso() }), b.id)
    : insert('templates', { owner_id: req.user.id, kind: b.kind || 'consultation', name: b.name, body: b.body, scope: b.scope || 'private' });
  const row = get('SELECT * FROM templates WHERE id=?', id);
  emit(req, { topics: ['clinical'], event: 'template.saved', data: row,
    action: 'template.save', entity: 'templates', entityId: id, detail: { name: b.name } });
  return row;
}));

clinical.delete('/templates/:id', requirePerm('template.write'), h((req) => {
  run('DELETE FROM templates WHERE id=? AND (owner_id=? OR ?=1)', +req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  emit(req, { topics: ['clinical'], event: 'template.deleted', data: { id: +req.params.id },
    action: 'template.delete', entity: 'templates', entityId: +req.params.id });
  return { ok: true };
}));

clinical.post('/templates/:id/use', requireAuth, h((req) => {
  run('UPDATE templates SET uses = uses + 1 WHERE id=?', +req.params.id);
  return get('SELECT * FROM templates WHERE id=?', +req.params.id);
}));

/* ----------------------------------------------------------- certificates */

clinical.get('/certificates', requirePerm('certificate.view'), h((req) => {
  const w = where({ 'c.patient_id = ?': req.query.patient_id, 'c.kind = ?': req.query.kind, 'c.status = ?': req.query.status });
  return all(
    `SELECT c.*, p.uhid, p.name patient_name, p.gender, p.age_years, u.name issued_by_name
       FROM certificates c JOIN patients p ON p.id=c.patient_id
       LEFT JOIN users u ON u.id=c.issued_by ${w.sql} ORDER BY c.id DESC LIMIT 200`, ...w.args);
}));

clinical.post('/certificates', requirePerm('certificate.write'), h((req) => {
  const b = req.body;
  const id = insert('certificates', {
    cert_no: nextNo('cert'), patient_id: num(b.patient_id), encounter_id: b.encounter_id || null,
    kind: b.kind, from_date: b.from_date, to_date: b.to_date, body: b.body,
    status: b.status === 'issued' ? 'issued' : 'draft',
    issued_by: req.user.id, issued_at: b.status === 'issued' ? nowIso() : null,
  });
  const row = get('SELECT * FROM certificates WHERE id=?', id);
  emit(req, { topics: ['clinical', `patient:${b.patient_id}`], event: 'certificate.saved', data: row,
    action: 'certificate.create', entity: 'certificates', entityId: id, detail: { kind: b.kind } });
  return row;
}));

clinical.patch('/certificates/:id', requirePerm('certificate.write'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['body', 'from_date', 'to_date', 'status', 'kind']) if (k in req.body) patch[k] = req.body[k];
  if (patch.status === 'issued') { patch.issued_at = nowIso(); patch.issued_by = req.user.id; }
  update('certificates', id, patch);
  const row = get('SELECT * FROM certificates WHERE id=?', id);
  emit(req, { topics: ['clinical'], event: 'certificate.saved', data: row,
    action: 'certificate.update', entity: 'certificates', entityId: id, detail: patch });
  return row;
}));

/* ------------------------------------------------------- doctor workspace */

clinical.get('/doctor/workspace', requireAnyPerm('queue.view','consult.write'), h((req) => {
  const doctorId = req.user.role === 'doctor' ? req.user.id : num(req.query.doctor_id, req.user.id);
  const date = req.query.date || today();
  const queue = all(
    `SELECT e.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.blood_group, p.vip,
            (SELECT count(*) FROM allergies a WHERE a.patient_id=p.id) allergy_count,
            (SELECT count(*) FROM vitals v WHERE v.encounter_id=e.id) vitals_count,
            (SELECT count(*) FROM orders o WHERE o.encounter_id=e.id AND o.status='verified') results_ready
       FROM encounters e JOIN patients p ON p.id=e.patient_id
      WHERE e.visit_date=? AND e.doctor_id=? AND e.stage NOT IN ('closed','cancelled')
      ORDER BY e.stage='in_consult' DESC, e.token_no`, date, doctorId);
  return {
    date, doctor: get('SELECT id,name,designation,qualification,reg_no,op_fee FROM users WHERE id=?', doctorId),
    queue,
    stats: {
      total: one('SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=?', date, doctorId) || 0,
      seen: one("SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=? AND stage IN ('consulted','services_pending','closed')", date, doctorId) || 0,
      waiting: queue.filter((q) => ['registered', 'vitals_pending', 'vitals_done', 'ready'].includes(q.stage)).length,
      in_consult: queue.filter((q) => q.stage === 'in_consult').length,
      followups: one("SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=? AND visit_type='followup'", date, doctorId) || 0,
      revenue: one(`SELECT coalesce(sum(b.total),0) FROM bills b JOIN encounters e ON e.id=b.encounter_id
                     WHERE e.visit_date=? AND e.doctor_id=? AND b.status<>'cancelled'`, date, doctorId) || 0,
      avg_consult_min: (() => {
        const v = one(`SELECT avg((julianday(consult_end)-julianday(consult_start))*1440) FROM encounters
                        WHERE visit_date=? AND doctor_id=? AND consult_end IS NOT NULL`, date, doctorId);
        return v === null || v === undefined ? null : Math.round(v);
      })(),
      pending_reports: one(`SELECT count(*) FROM orders o JOIN encounters e ON e.id=o.encounter_id
                             WHERE e.doctor_id=? AND o.status NOT IN ('verified','cancelled','dispensed')`, doctorId) || 0,
    },
    followups_due: all(
      `SELECT c.follow_up_date, p.id patient_id, p.uhid, p.name patient_name, p.mobile, c.diagnosis
         FROM consultations c JOIN patients p ON p.id=c.patient_id
        WHERE c.doctor_id=? AND c.follow_up_date BETWEEN date('now','localtime') AND date('now','localtime','+14 day')
        ORDER BY c.follow_up_date LIMIT 40`, doctorId),
    recent: all(
      `SELECT c.id, c.diagnosis, c.created_at, p.name patient_name, p.uhid
         FROM consultations c JOIN patients p ON p.id=c.patient_id
        WHERE c.doctor_id=? ORDER BY c.id DESC LIMIT 10`, doctorId),
  };
}));
