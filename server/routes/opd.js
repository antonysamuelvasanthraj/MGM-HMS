import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, nextNo, today, where, emit, num, money,
  patientCard, queueRows, callGate, recalcBill, syncEncounterPayment, setting, tx, nowIso,
} from '../lib.js';
import { billNewToPayer } from '../payer-billing.js';
import { takePayment } from '../payments.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { requestFree } from './approvals.js';
import { collectionPolicy } from '../collection-policy.js';

export const opd = Router();

const QUEUE_TOPICS = ['queue', 'opd', 'dashboard'];

function encounterView(id) {
  const e = get(
    `SELECT e.*, p.uhid, p.name AS patient_name, p.gender, p.age_years, p.mobile, p.blood_group,
            p.payer_type, p.payer_name, p.vip,
            u.name AS doctor_name, u.designation AS doctor_designation, u.op_fee,
            d.name AS dept_name, c.name AS counter_name
       FROM encounters e JOIN patients p ON p.id=e.patient_id
       LEFT JOIN users u ON u.id=e.doctor_id
       LEFT JOIN departments d ON d.id=e.department_id
       LEFT JOIN counters c ON c.id=e.counter_id
      WHERE e.id=?`, id);
  if (!e) return null;
  e.vitals = get('SELECT * FROM vitals WHERE encounter_id=? ORDER BY id DESC LIMIT 1', id);
  e.vitals_history = all('SELECT * FROM vitals WHERE encounter_id=? ORDER BY id DESC', id);
  e.bills = all('SELECT * FROM bills WHERE encounter_id=? ORDER BY id', id);
  for (const b of e.bills) {
    b.items = all('SELECT * FROM bill_items WHERE bill_id=?', b.id);
    Object.assign(b, collectionPolicy(b));
  }
  e.payments = all(`SELECT pm.*, u.name received_by_name FROM payments pm
                      LEFT JOIN users u ON u.id=pm.received_by
                     WHERE pm.encounter_id=? AND pm.cancelled=0 ORDER BY pm.id`, id);
  e.orders = all(`SELECT o.*, u.name ordered_by_name,
      (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id AND r.flag IS NOT NULL AND r.flag<>'') abnormal_count
    FROM orders o LEFT JOIN users u ON u.id=o.ordered_by
                   WHERE o.encounter_id=? ORDER BY o.id`, id);
  e.consultation = get('SELECT * FROM consultations WHERE encounter_id=? ORDER BY id DESC LIMIT 1', id);
  e.prescription = get('SELECT * FROM prescriptions WHERE encounter_id=? ORDER BY id DESC LIMIT 1', id);
  if (e.prescription) e.prescription.items = all('SELECT * FROM prescription_items WHERE prescription_id=?', e.prescription.id);
  e.patient = patientCard(e.patient_id);
  e.due = one(`SELECT coalesce(sum(balance),0) FROM bills WHERE encounter_id=? AND status IN ('unpaid','partial')`, id) || 0;
  e.patient_due = money(e.bills.filter(b => b.status !== 'cancelled').reduce((sum,b) => sum + b.patient_due,0));
  e.payer_pending = money(e.bills.filter(b => b.status !== 'cancelled').reduce((sum,b) => sum + b.payer_pending,0));
  e.gate = callGate(e);
  return e;
}
export { encounterView };

/* ------------------------------------------------------------------- queue */

opd.get('/queue', requirePerm('patient.view'), h((req) => {
  const date = req.query.date || today();
  const rows = queueRows({
    date,
    doctor_id: req.query.doctor_id ? +req.query.doctor_id : undefined,
    department_id: req.query.department_id ? +req.query.department_id : undefined,
    stage: req.query.stage,
    payment_status: req.query.payment_status,
  });
  const counts = {
    total: rows.length,
    registered: rows.filter((r) => r.stage === 'registered').length,
    vitals: rows.filter((r) => ['registered', 'vitals_pending'].includes(r.stage)).length,
    ready: rows.filter((r) => ['vitals_done', 'ready'].includes(r.stage)).length,
    in_consult: rows.filter((r) => r.stage === 'in_consult').length,
    consulted: rows.filter((r) => ['consulted', 'services_pending'].includes(r.stage)).length,
    closed: rows.filter((r) => r.stage === 'closed').length,
    payment_pending: rows.filter((r) => r.payment_status === 'pending').length,
    due_amount: money(rows.reduce((s, r) => s + (r.due || 0), 0)),
  };
  return { date, rows, counts };
}));

/** Public waiting-room board: now serving + next, per doctor. */
opd.get('/queue/display', h((req) => {
  const date = today();
  const rows = queueRows({ date });
  const byDoctor = {};
  for (const r of rows) {
    if (!r.doctor_id) continue;
    const k = r.doctor_id;
    byDoctor[k] ??= {
      doctor_id: k, doctor: r.doctor_name, dept: r.dept_name, room: null,
      serving: null, next: [], waiting: 0, completed: 0,
    };
    const g = byDoctor[k];
    if (r.stage === 'in_consult') g.serving = { token: r.token_no, name: maskName(r.patient_name) };
    else if (['vitals_done', 'ready'].includes(r.stage)) { g.next.push({ token: r.token_no, name: maskName(r.patient_name) }); g.waiting++; }
    else if (['consulted', 'services_pending', 'closed'].includes(r.stage)) g.completed++;
  }
  const rooms = all(`SELECT doctor_id, room FROM doctor_schedules GROUP BY doctor_id`);
  for (const r of rooms) if (byDoctor[r.doctor_id]) byDoctor[r.doctor_id].room = r.room;
  const list = Object.values(byDoctor).sort((a, b) => a.doctor.localeCompare(b.doctor));
  for (const g of list) g.next = g.next.slice(0, 4);
  return {
    date, serverTime: nowIso(),
    hospital: setting('hospital_name'), campus: setting('campus'),
    counters: list,
    announcements: all(`SELECT title, body FROM notifications WHERE role IS NULL ORDER BY id DESC LIMIT 3`),
  };
}));

const maskName = (n) => (n || '').split(' ').map((w, i) => (i === 0 ? w : w[0] + '.')).join(' ');

/* ------------------------------------------------------------- registration */

/**
 * Register today's OP visit. Creates the encounter, allots the token and — unless
 * an explicitly approved free visit — raises the consultation bill. Payment may be
 * taken now or left for the collection desk; the visit is created either way.
 */
opd.post('/encounters', requirePerm('op.register'), h((req) => {
  const b = req.body || {};
  const patient = get('SELECT * FROM patients WHERE id=?', num(b.patient_id));
  if (!patient) fail(400, 'patient_required');
  const doctor = b.doctor_id ? get('SELECT * FROM users WHERE id=?', num(b.doctor_id)) : null;
  if (!doctor) fail(400, 'doctor_required');
  if (b.appointment_id) {
    const appointment = get('SELECT * FROM appointments WHERE id=?', num(b.appointment_id));
    if (!appointment) fail(404, 'appointment_not_found');
    if (appointment.encounter_id || ['converted', 'cancelled', 'no_show'].includes(appointment.status)) fail(409, 'appointment_not_available');
    if (appointment.patient_id && appointment.patient_id !== patient.id) fail(400, 'appointment_patient_mismatch');
  }

  const visit_type = b.visit_type === 'followup' ? 'followup' : 'new';
  let freeRequested = b.payment_status === 'free';
  if (freeRequested && !String(b.free_reason || '').trim()) fail(400, 'free_reason_required');
  // Without approval rights the visit is saved with its bill and a free request; an approver decides later.
  const freePending = freeRequested && setting('free_visit_requires_approval') === '1' && !can(req.user, 'payment.approve_free');
  if (freePending) freeRequested = false;

  // Fee: explicit override > follow-up tariff inside the window > standard OP fee
  let fee = b.fee !== undefined && b.fee !== '' ? money(num(b.fee)) : null;
  if (fee === null) {
    if (visit_type === 'followup') {
      const last = get(
        `SELECT * FROM encounters WHERE patient_id=? AND doctor_id=? AND id<>0
          ORDER BY opened_at DESC LIMIT 1`, patient.id, doctor.id);
      const withinWindow = last && daysBetween(last.visit_date, today()) <= (doctor.followup_days ?? 7);
      fee = withinWindow ? 0 : money(doctor.followup_fee ?? doctor.op_fee ?? 0);
    } else fee = money(doctor.op_fee || 0);
  }

  return tx(() => {
    const token_no = nextToken(doctor.id);
    const encounter_no = nextNo('encounter');
    const eid = insert('encounters', {
      encounter_no, patient_id: patient.id, kind: b.kind || 'OP', visit_type,
      department_id: doctor.department_id, doctor_id: doctor.id,
      referred_by: b.referred_by,
      stage: 'registered',
      payment_status: freeRequested ? 'free' : fee > 0 ? 'pending' : 'free',
      free_reason: freeRequested ? b.free_reason : fee > 0 ? null : 'No consultation fee configured',
      free_approved_by: freeRequested ? req.user.id : null,
      token_no, token_prefix: b.token_prefix || 'A',
      priority: b.priority || 'normal',
      counter_id: b.counter_id || req.user.counter_id || null,
      created_by: req.user.id,
      remarks: b.remarks,
    });

    let bill = null;
    if (fee > 0 && !freeRequested && (setting('op_auto_bill') === '1' || freePending)) {
      const bill_no = nextNo('bill');
      const bid = insert('bills', {
        bill_no, patient_id: patient.id, encounter_id: eid, bill_type: 'OP',
        status: 'unpaid', payer_type: patient.payer_type,
        counter_id: b.counter_id || req.user.counter_id || null,
        created_by: req.user.id,
      });
      const svc = get(
        `SELECT * FROM services WHERE category='consultation' AND department_id=? AND active=1
           ORDER BY coalesce(billing_unit,'once')='day', code NOT LIKE 'CON-%', id LIMIT 1`,
        doctor.department_id);   // the OP consultation, never an inpatient per-day visit charge
      const agreed = svc && patient.payer_id && patient.payer_type !== 'self'
        ? get('SELECT price FROM service_rates WHERE payer_id=? AND service_id=?', patient.payer_id, svc.id) : null;
      const rate = agreed ? agreed.price : fee;
      insert('bill_items', {
        bill_id: bid, service_id: svc?.id || null,
        description: `${visit_type === 'followup' ? 'Follow-up c' : 'C'}onsultation — ${doctor.name}${agreed ? ' (agreed rate)' : ''}`,
        category: 'consultation', qty: 1, rate, amount: rate,
      });
      bill = recalcBill(bid);

      // Optional collect-at-registration
      if (b.collect && b.mode) {
        takePayment(req, { bill_id: bid, amount: get('SELECT balance FROM bills WHERE id=?', bid).balance, mode: b.mode, reference: b.reference });
        bill = get('SELECT * FROM bills WHERE id=?', bid);
      } else if (billNewToPayer(req, [bid]).length) {
        bill = get('SELECT * FROM bills WHERE id=?', bid);
      }
    }
    syncEncounterPayment(eid);
    if (freePending && bill) bill = requestFree(req, bill.id, b.free_reason);

    if (b.appointment_id) update('appointments', num(b.appointment_id), { status: 'converted', encounter_id: eid });

    const view = encounterView(eid);
    emit(req, {
      topics: [...QUEUE_TOPICS, 'billing', `patient:${patient.id}`],
      event: 'encounter.created', data: view,
      action: 'op.register', entity: 'encounters', entityId: eid,
      detail: { uhid: patient.uhid, doctor: doctor.name, token: token_no, fee, free_request: freePending ? b.free_reason : undefined },
    });
    return { encounter: view, bill, approval_pending: freePending && !!bill };
  });
}));

function nextToken(doctorId) {
  const max = one('SELECT max(token_no) FROM encounters WHERE visit_date=? AND doctor_id=?', today(), doctorId);
  return (max || 0) + 1;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

opd.get('/encounters/:id', requirePerm('patient.view'), h((req) => {
  const v = encounterView(+req.params.id);
  if (!v) fail(404, 'encounter_not_found');
  if(!can(req.user,'patient.clinical'))v.consultation=null;
  if(!can(req.user,'patient.clinical')&&!can(req.user,'pharmacy.view'))v.prescription=null;
  return v;
}));

opd.get('/encounters', requirePerm('patient.view'), h((req) => {
  const w = where({
    'e.visit_date = ?': req.query.date,
    'e.patient_id = ?': req.query.patient_id,
    'e.doctor_id = ?': req.query.doctor_id,
    'e.kind = ?': req.query.kind,
    'e.stage = ?': req.query.stage,
  });
  return all(
    `SELECT e.*, p.uhid, p.name patient_name, p.gender, p.age_years, u.name doctor_name, d.name dept_name
       FROM encounters e JOIN patients p ON p.id=e.patient_id
       LEFT JOIN users u ON u.id=e.doctor_id LEFT JOIN departments d ON d.id=e.department_id
       ${w.sql} ORDER BY e.id DESC LIMIT 400`, ...w.args);
}));

/* ------------------------------------------------------- stage transitions */

const STAGE_ORDER = ['registered', 'vitals_pending', 'vitals_done', 'ready', 'in_consult', 'consulted', 'services_pending', 'closed'];

opd.post('/encounters/:id/stage', requireAuth, h((req) => {
  if (!can(req.user,'queue.manage') && !can(req.user,'consult.write')) fail(403,'visit_stage_permission_required');
  if (req.body.force && !can(req.user,'admin.write')) fail(403,'admin_override_required');
  const id = +req.params.id;
  const e = get('SELECT * FROM encounters WHERE id=?', id);
  if (!e) fail(404, 'encounter_not_found');
  const to = req.body.stage;
  if (!STAGE_ORDER.includes(to) && to !== 'cancelled') fail(400, 'bad_stage');

  // The money/vitals gate applies only when calling a patient in to the doctor.
  if (to === 'in_consult' && !req.body.force) {
    const g = callGate(e);
    if (!g.ok) fail(409, 'call_blocked', { reasons: g.reasons });
  }

  const patch = { stage: to };
  const nowStamp = nowIso();
  if (to === 'ready') patch.called_at = nowStamp;
  if (to === 'in_consult') { patch.called_at = e.called_at || nowStamp; patch.consult_start = nowStamp; }
  if (to === 'consulted') patch.consult_end = nowStamp;
  if (to === 'closed') patch.closed_at = nowStamp;
  if (to === 'cancelled') { patch.closed_at = nowStamp; patch.remarks = req.body.reason || e.remarks; }
  update('encounters', id, patch);

  const view = encounterView(id);
  emit(req, {
    topics: [...QUEUE_TOPICS, 'display', `encounter:${id}`, `patient:${e.patient_id}`],
    event: 'encounter.stage', data: view,
    action: `encounter.${to}`, entity: 'encounters', entityId: id, detail: { from: e.stage, to },
  });
  return view;
}));

/** Call the next waiting patient for a doctor (doctor queue "Call next"). */
opd.post('/queue/call-next', requireAuth, h((req) => {
  const doctorId = num(req.body.doctor_id, req.user.id);
  const current = get(
    `SELECT * FROM encounters WHERE visit_date=? AND doctor_id=? AND stage='in_consult' LIMIT 1`, today(), doctorId);
  if (current && req.body.complete_current !== false) {
    update('encounters', current.id, { stage: 'consulted', consult_end: nowIso() });
  }
  const rows = queueRows({ date: today(), doctor_id: doctorId })
    .filter((r) => ['vitals_done', 'ready'].includes(r.stage))
    .filter((r) => callGate(r).ok);
  if (!rows.length) {
    emit(req, { topics: QUEUE_TOPICS, event: 'queue.changed', data: { doctor_id: doctorId } });
    return { called: null, message: 'No eligible patient waiting' };
  }
  const next = rows[0];
  update('encounters', next.id, {
    stage: 'in_consult',
    called_at: nowIso(),
    consult_start: nowIso(),
  });
  const view = encounterView(next.id);
  emit(req, {
    topics: [...QUEUE_TOPICS, 'display', `encounter:${next.id}`],
    event: 'queue.called', data: { encounter: view, doctor_id: doctorId },
    action: 'queue.call', entity: 'encounters', entityId: next.id,
    detail: { token: next.token_no },
  });
  return { called: view };
}));

opd.post('/encounters/:id/free', requirePerm('admin.view'), h((req) => {
  const id = +req.params.id;
  if (!req.body.reason) fail(400, 'reason_required');
  update('encounters', id, {
    payment_status: 'free', free_reason: req.body.reason, free_approved_by: req.user.id,
  });
  // cancel the outstanding consultation bill
  for (const b of all(`SELECT * FROM bills WHERE encounter_id=? AND bill_type='OP' AND status IN ('unpaid','partial')`, id))
    update('bills', b.id, { status: 'cancelled', cancelled_at: nowIso(), cancel_reason: `Approved free visit: ${req.body.reason}` });
  const view = encounterView(id);
  emit(req, {
    topics: [...QUEUE_TOPICS, 'billing', `encounter:${id}`], event: 'encounter.stage', data: view,
    action: 'encounter.free_approved', entity: 'encounters', entityId: id, detail: req.body,
  });
  return view;
}));

opd.patch('/encounters/:id', requireAuth, h((req) => {
  if (!can(req.user,'queue.manage') && !can(req.user,'op.register')) fail(403,'visit_update_permission_required');
  const id = +req.params.id;
  const allowed = ['doctor_id', 'department_id', 'visit_type', 'priority', 'remarks', 'referred_by', 'counter_id'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  update('encounters', id, patch);
  const view = encounterView(id);
  emit(req, { topics: [...QUEUE_TOPICS, `encounter:${id}`], event: 'encounter.updated', data: view,
    action: 'encounter.update', entity: 'encounters', entityId: id, detail: patch });
  return view;
}));

/* ------------------------------------------------------------------ vitals */

opd.post('/vitals', requirePerm('vitals.record'), h((req) => {
  const b = req.body || {};
  const e = get('SELECT * FROM encounters WHERE id=?', num(b.encounter_id));
  if (!e) fail(400, 'encounter_required');
  const w = num(b.weight_kg, null), ht = num(b.height_cm, null);
  const id = insert('vitals', {
    encounter_id: e.id, patient_id: e.patient_id,
    bp_sys: num(b.bp_sys, null), bp_dia: num(b.bp_dia, null), pulse: num(b.pulse, null),
    temp_f: num(b.temp_f, null), spo2: num(b.spo2, null), resp_rate: num(b.resp_rate, null),
    weight_kg: w, height_cm: ht,
    bmi: w && ht ? +(w / ((ht / 100) ** 2)).toFixed(1) : null,
    grbs: num(b.grbs, null), pain_score: num(b.pain_score, null),
    notes: b.notes, recorded_by: req.user.id,
  });
  if (['registered', 'vitals_pending'].includes(e.stage)) {
    const gate = callGate({ ...e, id: e.id });
    update('encounters', e.id, { stage: ['paid', 'free', 'waived'].includes(e.payment_status) ? 'ready' : 'vitals_done' });
  }
  const view = encounterView(e.id);
  emit(req, {
    topics: [...QUEUE_TOPICS, `encounter:${e.id}`, `patient:${e.patient_id}`],
    event: 'vitals.recorded', data: view,
    action: 'vitals.record', entity: 'vitals', entityId: id, detail: { encounter: e.encounter_no },
  });
  return view;
}));

/* ------------------------------------------------------------ appointments */

opd.get('/appointments', requireAuth, h((req) => {
  const date = req.query.date || today();
  const w = where({ 'a.doctor_id = ?': req.query.doctor_id, 'a.status = ?': req.query.status },
    ['date(a.slot_start) = ?']);
  const rows = all(
    `SELECT a.*, u.name doctor_name, d.name dept_name, p.uhid
       FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id
       LEFT JOIN departments d ON d.id=a.department_id
       LEFT JOIN patients p ON p.id=a.patient_id
       ${w.sql} ORDER BY a.slot_start`, date, ...w.args);
  return {
    date, rows,
    counts: {
      total: rows.length,
      booked: rows.filter((r) => r.status === 'booked').length,
      confirmed: rows.filter((r) => r.status === 'confirmed').length,
      arrived: rows.filter((r) => r.status === 'arrived').length,
      converted: rows.filter((r) => r.status === 'converted').length,
      no_show: rows.filter((r) => r.status === 'no_show').length,
    },
    slots: all(`SELECT s.*, u.name doctor_name FROM doctor_schedules s JOIN users u ON u.id=s.doctor_id
                 WHERE s.weekday = ?`, new Date(date).getDay()),
  };
}));

opd.get('/appointments/:id', requirePerm('appt.view'), h((req) => {
  const row = get('SELECT * FROM appointments WHERE id=?', +req.params.id);
  if (!row) fail(404, 'appointment_not_found');
  return row;
}));

opd.post('/appointments', requirePerm('appt.create'), h((req) => {
  const b = req.body || {};
  if (!b.doctor_id || !b.slot_start) fail(400, 'doctor_and_slot_required');
  const doctor = get("SELECT * FROM users WHERE id=? AND active=1", num(b.doctor_id));
  if (!doctor) fail(400, 'doctor_required');
  const slotMin = num(b.slot_minutes, 15);
  const start = String(b.slot_start).replace('T', ' ').slice(0, 16);
  const clash = get(`SELECT appt_no, patient_name FROM appointments WHERE doctor_id=? AND status NOT IN ('cancelled','no_show')
      AND datetime(replace(slot_start,'T',' ')) < datetime(?, '+' || ? || ' minutes')
      AND datetime(?) < datetime(replace(slot_start,'T',' '), '+' || coalesce(slot_minutes,15) || ' minutes')`, doctor.id, start, slotMin, start);
  if (clash && !b.overbook) fail(409, 'slot_taken', { appt_no: clash.appt_no, patient: clash.patient_name });
  const id = insert('appointments', {
    appt_no: nextNo('appt'),
    patient_id: b.patient_id || null,
    patient_name: b.patient_name || (b.patient_id ? get('SELECT name FROM patients WHERE id=?', b.patient_id).name : ''),
    mobile: b.mobile,
    doctor_id: doctor.id, department_id: doctor.department_id,
    slot_start: b.slot_start, slot_minutes: num(b.slot_minutes, 15),
    channel: b.channel || 'phone', visit_type: b.visit_type || 'new',
    status: 'booked', notes: b.notes,
  });
  const row = get('SELECT a.*, u.name doctor_name FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id WHERE a.id=?', id);
  emit(req, { topics: ['appointments', 'dashboard'], event: 'appointment.created', data: row,
    action: 'appointment.create', entity: 'appointments', entityId: id, detail: row });
  return row;
}));

opd.patch('/appointments/:id', requirePerm('appt.edit'), h((req) => {
  const id = +req.params.id;
  const before=get('SELECT * FROM appointments WHERE id=?',id)||fail(404,'appointment_not_found');
  const patch = {};
  for (const k of ['status', 'slot_start', 'slot_minutes', 'doctor_id', 'notes', 'visit_type']) if (k in req.body) patch[k] = req.body[k];
  if('status' in patch&&!['booked','confirmed','arrived','no_show','cancelled'].includes(patch.status)) fail(400,'appointment_status_invalid');
  if(before.status==='converted') fail(409,'converted_appointment_locked');
  if(['slot_start','slot_minutes','doctor_id'].some(k=>k in patch)) {
    const next={...before,...patch},start=String(next.slot_start).replace('T',' ').slice(0,16),mins=+next.slot_minutes;
    const date=new Date(start.replace(' ','T'));
    const pad=n=>String(n).padStart(2,'0');
    const actual=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(start)||!Number.isFinite(date.getTime())||actual!==start||!Number.isInteger(mins)||mins<5||mins>120) fail(400,'valid_appointment_slot_required');
    const doctor=get("SELECT * FROM users WHERE id=? AND active=1 AND role='doctor'",+next.doctor_id)||fail(400,'doctor_required');
    const clash=get("SELECT id FROM appointments WHERE doctor_id=? AND id<>? AND status NOT IN ('cancelled','no_show') AND datetime(replace(slot_start,'T',' ')) < datetime(?, '+' || ? || ' minutes') AND datetime(?) < datetime(replace(slot_start,'T',' '), '+' || coalesce(slot_minutes,15) || ' minutes')",doctor.id,id,start,mins,start);
    if(clash) fail(409,'slot_taken');
    patch.slot_start=start;patch.slot_minutes=mins;patch.doctor_id=doctor.id;patch.department_id=doctor.department_id;
  }
  update('appointments', id, patch);
  const row = get('SELECT a.*, u.name doctor_name FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id WHERE a.id=?', id);
  emit(req, { topics: ['appointments'], event: 'appointment.updated', data: row,
    action: 'appointment.update', entity: 'appointments', entityId: id, detail: {before,after:row,reason:patch.notes} });
  return row;
}));

/* -------------------------------------------------- payment helper (shared) */

export { takePayment };
