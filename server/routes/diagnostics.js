import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, today, where, emit, num, patientCard, tx,
  nowIso, requireOrderClearance, notifyResultPublished,
} from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { closeEncounterIfDone } from './clinical.js';

export const diagnostics = Router();
const LAB_TOPICS = ['lab', 'clinical', 'dashboard'];
const IMG_TOPICS = ['imaging', 'clinical', 'dashboard'];

/* -------------------------------------------------------------- worklists */

function worklist(category, req) {
  const extra = ['o.category = ?'];
  const args = [category];
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'open') extra.push("o.status NOT IN ('verified','cancelled')");
    else { extra.push('o.status = ?'); args.push(req.query.status); }
  } else extra.push("o.status <> 'cancelled'");
  if (req.query.date) { extra.push('date(o.ordered_at) = ?'); args.push(req.query.date); }
  if (req.query.priority && req.query.priority !== 'all') { extra.push('o.priority = ?'); args.push(req.query.priority); }
  if (req.query.modality && req.query.modality !== 'all') { extra.push('o.modality = ?'); args.push(req.query.modality); }
  if (req.query.q) {
    extra.push('(o.order_no LIKE ? OR o.label LIKE ? OR p.name LIKE ? OR p.uhid LIKE ? OR o.sample_id LIKE ?)');
    const l = `%${req.query.q}%`; args.push(l, l, l, l, l);
  }
  const rows = all(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.blood_group,
            s.name service_name, s.tat_minutes, s.sample_type, s.price,
            u.name ordered_by_name, v.name verified_by_name,
            e.token_no, e.encounter_no, e.kind encounter_kind, dep.name dept_name,
            (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id) result_count,
            (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id AND r.flag IN ('high','low')) abnormal_count,
            (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id AND r.flag='critical') critical_count,
            (SELECT rp.status FROM reports rp WHERE rp.order_id=o.id ORDER BY rp.id DESC LIMIT 1) report_status,
            (SELECT b.authorization_status FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) authorization_status,
            (SELECT b.payer_type FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) financial_category,
            (SELECT b.status FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) bill_status,
            (SELECT b.claim_status FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) claim_status,
            round((julianday('now','localtime') - julianday(o.ordered_at)) * 1440) age_minutes
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id
       LEFT JOIN users u ON u.id=o.ordered_by LEFT JOIN users v ON v.id=o.verified_by
       LEFT JOIN encounters e ON e.id=o.encounter_id
       LEFT JOIN departments dep ON dep.id=e.department_id
      WHERE ${extra.join(' AND ')}
      ORDER BY o.priority='stat' DESC, o.priority='urgent' DESC, o.id DESC LIMIT 400`, ...args);
  for (const r of rows) {
    r.tat_breached = r.tat_minutes && r.age_minutes > r.tat_minutes && !['verified'].includes(r.status);
    // What lets this order proceed — shown to the lab next to the status.
    r.clearance = r.encounter_kind === 'EMG' ? 'emergency' : r.encounter_kind === 'IP' ? 'ip_bill'
      : r.bill_status === 'paid' ? 'paid' : r.bill_status === 'covered' ? 'covered'
      : r.authorization_status === 'approved' ? 'due_approved'
      : ['preauth_approved', 'claim_submitted', 'settled'].includes(r.claim_status) ? 'payer_approved'
      : r.bill_status === 'partial' ? 'part_paid' : 'unpaid';
  }
  return rows;
}

diagnostics.get('/lab/worklist', requirePerm('lab.view'), h((req) => {
  const rows = worklist('lab', req);
  return {
    rows,
    counts: {
      total: rows.length,
      awaiting_payment: rows.filter((r) => r.status === 'awaiting_payment').length,
      ordered: rows.filter((r) => r.status === 'ordered').length,
      collected: rows.filter((r) => r.status === 'collected').length,
      in_progress: rows.filter((r) => r.status === 'in_progress').length,
      reported: rows.filter((r) => r.status === 'reported').length,
      verified: Math.max(rows.filter((r) => r.status === 'verified').length, one("SELECT count(*) FROM orders WHERE category='lab' AND date(verified_at)=date('now','localtime')") || 0),   // verified today, though they leave the open worklist
      critical: rows.filter((r) => r.critical_count > 0).length,
      tat_breached: rows.filter((r) => r.tat_breached).length,
      stat: rows.filter((r) => r.priority === 'stat').length,
    },
  };
}));

diagnostics.get('/imaging/worklist', requirePerm('imaging.view'), h((req) => {
  const rows = worklist('imaging', req);
  return {
    rows,
    counts: {
      total: rows.length,
      scheduled: rows.filter((r) => r.status === 'scheduled').length,
      ordered: rows.filter((r) => r.status === 'ordered').length,
      in_progress: rows.filter((r) => r.status === 'in_progress').length,
      reported: rows.filter((r) => r.status === 'reported').length,
      verified: Math.max(rows.filter((r) => r.status === 'verified').length, one("SELECT count(*) FROM orders WHERE category='imaging' AND date(verified_at)=date('now','localtime')") || 0),
      awaiting_payment: rows.filter((r) => r.status === 'awaiting_payment').length,
    },
    modalities: all(`SELECT modality, count(*) n FROM orders WHERE category='imaging' AND modality IS NOT NULL
                       AND status<>'cancelled' GROUP BY modality`),
  };
}));

/* ------------------------------------------------------------ lab results */

diagnostics.get('/lab/orders/:id', requirePerm('lab.view'), h((req) => {
  const id = +req.params.id;
  const o = get(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.blood_group,
            s.name service_name, s.sample_type, s.tat_minutes,
            u.name ordered_by_name, v.name verified_by_name, e.encounter_no, e.token_no
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id LEFT JOIN users u ON u.id=o.ordered_by
       LEFT JOIN users v ON v.id=o.verified_by LEFT JOIN encounters e ON e.id=o.encounter_id
      WHERE o.id=?`, id);
  if (!o) fail(404, 'order_not_found');
  o.params = all('SELECT * FROM lab_params WHERE service_id=? ORDER BY seq', o.service_id);
  o.results = all('SELECT * FROM lab_results WHERE order_id=? ORDER BY id', id);
  o.patient = patientCard(o.patient_id);
  o.settings = Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
  o.history = all(
    `SELECT r.name, r.value, r.unit, r.flag, o2.completed_at FROM lab_results r
       JOIN orders o2 ON o2.id=r.order_id
      WHERE o2.patient_id=? AND o2.service_id=? AND o2.id<>? AND o2.status='verified'
      ORDER BY o2.id DESC LIMIT 40`, o.patient_id, o.service_id, id);
  return o;
}));

diagnostics.post('/lab/orders/:id/collect', requirePerm('lab.collect'), h((req) => {
  const id = +req.params.id;
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o) fail(404, 'order_not_found');
  requireOrderClearance(o);
  if (o.category !== 'lab' || !['ordered','scheduled'].includes(o.status)) fail(409, 'sample_state_invalid');
  update('orders', id, {
    status: 'collected',
    collected_at: nowIso(),
    sample_id: req.body.sample_id || o.sample_id,
  });
  const row = get('SELECT * FROM orders WHERE id=?', id);
  emit(req, { topics: [...LAB_TOPICS, `encounter:${o.encounter_id}`], event: 'order.updated', data: row,
    action: 'lab.collect', entity: 'orders', entityId: id, detail: { sample: row.sample_id } });
  return row;
}));

/** The reference range for this patient: child range below the parameter's age limit, else the sex-specific range, else the general one. */
export function rangeFor(p, pt = {}) {
  const has = (a, b) => a !== null && a !== undefined || b !== null && b !== undefined;
  const sex = String(pt.gender || '')[0]?.toUpperCase();
  let low = p.ref_low, high = p.ref_high, who = '';
  if (pt.age_years !== null && pt.age_years !== undefined && pt.age_years < (p.child_max_age ?? 12) && has(p.ref_low_child, p.ref_high_child)) { low = p.ref_low_child; high = p.ref_high_child; who = 'child'; }
  else if (sex === 'M' && has(p.ref_low_m, p.ref_high_m)) { low = p.ref_low_m; high = p.ref_high_m; who = 'male'; }
  else if (sex === 'F' && has(p.ref_low_f, p.ref_high_f)) { low = p.ref_low_f; high = p.ref_high_f; who = 'female'; }
  const text = who && (low !== null || high !== null) ? `${low ?? ''} - ${high ?? ''}${p.unit ? ' ' + p.unit : ''} (${who})` : null;
  return { low: low ?? null, high: high ?? null, text };
}

diagnostics.post('/lab/orders/:id/results', requirePerm('lab.result'), h((req) => {
  if (req.body.verify && !can(req.user, 'lab.verify')) fail(403, 'forbidden');
  const id = +req.params.id;
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o) fail(404, 'order_not_found');
  requireOrderClearance(o);
  if (o.category !== 'lab' || !['collected','in_progress','reported'].includes(o.status)) fail(409, 'lab_result_state_invalid');
  const results = req.body.results || [];
  if (!results.length) fail(400, 'results_required');
  return tx(() => {
    run('DELETE FROM lab_results WHERE order_id=?', id);
    let critical = 0;
    const pt = get('SELECT gender, age_years FROM patients WHERE id=?', o.patient_id) || {};
    for (const r of results) {
      const p = r.param_id ? get('SELECT * FROM lab_params WHERE id=?', num(r.param_id)) : null;
      if (r.param_id && (!p || p.service_id !== o.service_id)) fail(400,'lab_parameter_service_mismatch');
      let flag = r.flag ?? '';
      const range = p ? rangeFor(p, pt) : null;
      if (!r.flag && p && String(r.value ?? '').trim() !== '' && Number.isFinite(+r.value)) {
        const v = +r.value;
        // explicit critical limits first; without them the old rough rule stands
        if ((p.crit_low !== null && p.crit_low !== undefined && v <= p.crit_low) || (p.crit_high !== null && p.crit_high !== undefined && v >= p.crit_high)) flag = 'critical';
        else if (range.low !== null && v < range.low) flag = p.crit_low == null && v < range.low * 0.5 ? 'critical' : 'low';
        else if (range.high !== null && v > range.high) flag = p.crit_high == null && v > range.high * 1.8 ? 'critical' : 'high';
      }
      if (flag === 'critical') critical++;
      insert('lab_results', {
        order_id: id, param_id: p?.id || null, name: r.name || p?.name,
        value: String(r.value ?? ''), unit: r.unit ?? p?.unit,
        ref_range: r.ref_range ?? (range?.text || p?.ref_text), flag,
        entered_by: req.user.id,
      });
    }
    const status = req.body.verify ? 'verified' : 'reported';
    update('orders', id, {
      status,
      completed_at: nowIso(),
      ...(req.body.verify ? { verified_by: req.user.id, verified_at: nowIso() } : {}),
    });
    closeEncounterIfDone(o.encounter_id);
    const row = get('SELECT * FROM orders WHERE id=?', id);
    if (req.body.verify) notifyResultPublished(row, 'lab');
    row.results = all('SELECT * FROM lab_results WHERE order_id=?', id);
    emit(req, {
      topics: [...LAB_TOPICS, `encounter:${o.encounter_id}`, `patient:${o.patient_id}`],
      event: critical ? 'lab.critical' : 'lab.reported',
      data: { order: row, critical },
      action: req.body.verify ? 'lab.verify' : 'lab.result', entity: 'orders', entityId: id,
      detail: { params: results.length, critical },
    });
    if (critical) {
      // one alert per doctor, so a colleague reading theirs never clears the ordering doctor's;
      // the ordering doctor and the admitting consultant first, every doctor when neither is known
      const consultant = get("SELECT consultant_id FROM admissions WHERE encounter_id=? AND status<>'discharged'", o.encounter_id)?.consultant_id;
      const named = [...new Set([o.ordered_by, consultant].filter(Boolean))].filter((uid) => get('SELECT id FROM users WHERE id=? AND active=1', uid));
      const to = named.length ? named : all("SELECT id FROM users WHERE role='doctor' AND active=1").map((u) => u.id);
      const patientName = get('SELECT name FROM patients WHERE id=?', o.patient_id).name;
      for (const uid of to) insert('notifications', {
        user_id: uid, level: 'danger',
        title: `Critical lab value — ${row.label}`,
        body: `${patientName} · ${row.order_no}`,
        link: `/laboratory/order/${id}`,
      });
    }
    return row;
  });
}));

diagnostics.post('/lab/orders/:id/verify', requirePerm('lab.verify'), h((req) => {
  const id = +req.params.id;
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o) fail(404, 'order_not_found');
  requireOrderClearance(o);
  if (o.category !== 'lab' || o.status !== 'reported') fail(409, 'report_not_ready');
  if (!one('SELECT count(*) FROM lab_results WHERE order_id=?', id)) fail(409, 'no_results');
  update('orders', id, {
    status: 'verified', verified_by: req.user.id,
    verified_at: nowIso(),
    completed_at: o.completed_at || nowIso(),
  });
  closeEncounterIfDone(o.encounter_id);
  const row = get('SELECT * FROM orders WHERE id=?', id);
  notifyResultPublished(row, 'lab');
  emit(req, {
    topics: [...LAB_TOPICS, `encounter:${o.encounter_id}`, `patient:${o.patient_id}`, 'notifications'],
    event: 'lab.verified', data: row,
    action: 'lab.verify', entity: 'orders', entityId: id, detail: { order_no: row.order_no },
  });
  return row;
}));

diagnostics.get('/lab/report/:id', requirePerm('lab.view'), h((req) => {
  const id = +req.params.id;
  const o = get(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            s.name service_name, s.sample_type, u.name ordered_by_name, v.name verified_by_name,
            v.qualification verified_by_qual, v.reg_no verified_by_reg
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id LEFT JOIN users u ON u.id=o.ordered_by
       LEFT JOIN users v ON v.id=o.verified_by WHERE o.id=?`, id);
  if (!o) fail(404, 'order_not_found');
  o.results = all('SELECT * FROM lab_results WHERE order_id=? ORDER BY id', id);
  o.settings = Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
  return o;
}));

/* ------------------------------------------------------- imaging reports */

diagnostics.get('/imaging/orders/:id', requirePerm('imaging.view'), h((req) => {
  const id = +req.params.id;
  const o = get(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            s.name service_name, u.name ordered_by_name, e.encounter_no
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id LEFT JOIN users u ON u.id=o.ordered_by
       LEFT JOIN encounters e ON e.id=o.encounter_id WHERE o.id=?`, id);
  if (!o) fail(404, 'order_not_found');
  o.report = get('SELECT r.*, a.name author_name, sg.name signed_by_name, sg.qualification signed_by_qual, sg.reg_no signed_by_reg FROM reports r LEFT JOIN users a ON a.id=r.author_id LEFT JOIN users sg ON sg.id=r.signed_by WHERE r.order_id=? ORDER BY r.id DESC LIMIT 1', id);
  o.patient = patientCard(o.patient_id);
  o.templates = all("SELECT * FROM templates WHERE kind IN ('usg','imaging') ORDER BY name");
  o.settings = Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
  o.prior = all(
    `SELECT o2.id, o2.label, o2.completed_at, r.impression FROM orders o2
       LEFT JOIN reports r ON r.order_id=o2.id
      WHERE o2.patient_id=? AND o2.category='imaging' AND o2.id<>? ORDER BY o2.id DESC LIMIT 10`,
    o.patient_id, id);
  return o;
}));

diagnostics.post('/imaging/orders/:id/report', requirePerm('imaging.report'), h((req) => {
  const id = +req.params.id;
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o) fail(404, 'order_not_found');
  requireOrderClearance(o);
  if (o.category !== 'imaging') fail(409, 'imaging_order_required');
  const b = req.body || {};
  let rep = get('SELECT * FROM reports WHERE order_id=? ORDER BY id DESC LIMIT 1', id);
  const sign = b.status === 'final';
  const fields = {
    technique: b.technique, findings: b.findings, impression: b.impression, advice: b.advice,
    status: sign ? (rep?.status === 'final' ? 'amended' : 'final') : 'draft',
    updated_at: nowIso(),
    ...(sign ? { signed_by: req.user.id, signed_at: nowIso() } : {}),
  };
  const rid = rep ? (update('reports', rep.id, fields), rep.id)
    : insert('reports', { order_id: id, kind: b.kind || 'imaging', author_id: req.user.id, ...fields });
  update('orders', id, {
    status: sign ? 'verified' : 'reported',
    completed_at: nowIso(),
    ...(sign ? { verified_by: req.user.id, verified_at: nowIso() } : {}),
  });
  closeEncounterIfDone(o.encounter_id);
  const row = get('SELECT * FROM orders WHERE id=?', id);
  row.report = get('SELECT * FROM reports WHERE id=?', rid);
  if (sign) notifyResultPublished(row, 'imaging');
  emit(req, {
    topics: [...IMG_TOPICS, `encounter:${o.encounter_id}`, `patient:${o.patient_id}`],
    event: sign ? 'imaging.signed' : 'imaging.reported', data: row,
    action: sign ? 'imaging.sign' : 'imaging.report', entity: 'reports', entityId: rid,
    detail: { order_no: row.order_no },
  });
  return row;
}));

diagnostics.post('/imaging/orders/:id/schedule', requirePerm('imaging.schedule'), h((req) => {
  const id = +req.params.id;
  requireOrderClearance(get('SELECT * FROM orders WHERE id=?', id));
  update('orders', id, { status: 'scheduled', scheduled_at: req.body.scheduled_at, room: req.body.room });
  const row = get('SELECT * FROM orders WHERE id=?', id);
  emit(req, { topics: IMG_TOPICS, event: 'order.updated', data: row,
    action: 'imaging.schedule', entity: 'orders', entityId: id, detail: req.body });
  return row;
}));

/* ------------------------------------------------------------- lab master */

diagnostics.get('/lab/params', requireAuth, h((req) => all(
  `SELECT lp.*, s.name service_name, s.code service_code FROM lab_params lp
     JOIN services s ON s.id=lp.service_id ${req.query.service_id ? 'WHERE lp.service_id=?' : ''}
    ORDER BY s.name, lp.seq`, ...(req.query.service_id ? [+req.query.service_id] : []))));

diagnostics.post('/lab/params', requirePerm('admin.view'), h((req) => {
  const b = req.body || {};
  if (!b.service_id || !b.name) fail(400, 'service_id_and_name_required');
  const seq = b.seq !== undefined ? +b.seq : ((one('SELECT max(seq) FROM lab_params WHERE service_id=?', +b.service_id) || 0) + 1);
  const id = insert('lab_params', {
    service_id: +b.service_id,
    name: b.name.trim(),
    unit: b.unit || null,
    ref_low: b.ref_low !== undefined && b.ref_low !== '' ? num(b.ref_low) : null,
    ref_high: b.ref_high !== undefined && b.ref_high !== '' ? num(b.ref_high) : null,
    ref_text: b.ref_text || (b.ref_low && b.ref_high ? `${b.ref_low} - ${b.ref_high}` : null),
    seq,
  });
  const row = get('SELECT * FROM lab_params WHERE id=?', id);
  // reference ranges decide how results are flagged, so every change is audited
  emit(req, { topics: ['lab'], event: 'lab.params', data: { id }, action: 'lab.param.add', entity: 'lab_params', entityId: id, detail: { before: null, after: row } });
  return row;
}));

diagnostics.delete('/lab/params/:id', requirePerm('admin.view'), h((req) => {
  const before = get('SELECT * FROM lab_params WHERE id=?', +req.params.id);
  if (!before) fail(404, 'lab_param_not_found');
  run('DELETE FROM lab_params WHERE id=?', before.id);
  emit(req, { topics: ['lab'], event: 'lab.params', data: { id: before.id }, action: 'lab.param.delete', entity: 'lab_params', entityId: before.id, detail: { before, after: null } });
  return { ok: true };
}));

diagnostics.get('/lab/stats', requirePerm('lab.view'), h((req) => {
  const date = req.query.date || today();
  return {
    ordered: one("SELECT count(*) FROM orders WHERE category='lab' AND date(ordered_at)=?", date) || 0,
    verified: one("SELECT count(*) FROM orders WHERE category='lab' AND date(verified_at)=?", date) || 0,
    pending: one("SELECT count(*) FROM orders WHERE category='lab' AND status NOT IN ('verified','cancelled')") || 0,
    critical: one(`SELECT count(DISTINCT o.id) FROM orders o JOIN lab_results r ON r.order_id=o.id
                    WHERE r.flag='critical' AND o.status<>'cancelled' AND date(o.ordered_at)>=date('now','localtime','-2 day')`) || 0,
    avg_tat: (() => {
      const v = one(`SELECT avg((julianday(verified_at)-julianday(ordered_at))*1440) FROM orders
                      WHERE category='lab' AND verified_at IS NOT NULL AND date(ordered_at)>=date('now','localtime','-7 day')`);
      return v === null || v === undefined ? null : Math.round(v);
    })(),
    by_test: all(`SELECT label, count(*) n FROM orders WHERE category='lab' AND date(ordered_at)>=date('now','localtime','-7 day')
                   GROUP BY label ORDER BY n DESC LIMIT 10`),
    revenue: one(`SELECT coalesce(sum(bi.amount),0) FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
                   WHERE bi.category='lab' AND b.bill_date=? AND b.status<>'cancelled'`, date) || 0,
  };
}));
