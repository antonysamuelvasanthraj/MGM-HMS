import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, today, where, emit, num, patientCard, tx,
  nowIso, requireOrderClearance, notifyResultPublished,
  REQUESTED_BY_SQL,
} from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { closeEncounterIfDone } from './clinical.js';
import { ensureAccession, consumeForOrder } from '../lab-ops.js';
import {resultGuidance} from '../lab-result-guidance.js';

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
            u.name ordered_by_name, ${REQUESTED_BY_SQL} requested_by_name, v.name verified_by_name,
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
    r.can_sign = category === 'imaging' && can(req.user, 'imaging.report');   // anyone who reports can Save: no separate sign-off
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
            s.name service_name, s.sample_type, s.tat_minutes, coalesce(o.lab_description,s.description,'') test_description, s.lab_section,
            u.name ordered_by_name, ${REQUESTED_BY_SQL} requested_by_name, v.name verified_by_name, e.encounter_no, e.token_no
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id LEFT JOIN users u ON u.id=o.ordered_by
       LEFT JOIN users v ON v.id=o.verified_by LEFT JOIN encounters e ON e.id=o.encounter_id
      WHERE o.id=?`, id);
  if (!o) fail(404, 'order_not_found');
  o.params = all('SELECT * FROM lab_params WHERE service_id=? AND active=1 ORDER BY seq', o.service_id);
  o.results = all('SELECT r.*,u.name technician,lp.result_type param_type FROM lab_results r LEFT JOIN users u ON u.id=r.entered_by LEFT JOIN lab_params lp ON lp.id=r.param_id WHERE r.order_id=? ORDER BY coalesce(lp.seq, 100000), r.id', id);
  o.patient = patientCard(o.patient_id);
  o.params = o.params.map(p => { const range = rangeFor(p, o.patient); return {...p, ref_low: range.low, ref_high: range.high, ref_text: range.text || p.ref_text}; });
  // report header and footer only — never gateway keys
  o.settings = Object.fromEntries(all("SELECT key,value FROM settings WHERE key NOT LIKE 'sms_gateway%' AND key NOT LIKE '%secret%' AND key NOT LIKE '%token%' AND key NOT LIKE '%password%'").map((r) => [r.key, r.value]));
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
  return tx(() => {
  update('orders', id, {
    status: 'collected',
    collected_at: nowIso(),
    sample_id: req.body.sample_id || o.sample_id,
  });
  const accession = ensureAccession(get('SELECT * FROM orders WHERE id=?', id));
  const used = consumeForOrder(req, get('SELECT * FROM orders WHERE id=?', id), 'collection', { recollection: o.recollect_count > 0 });
  const row = get('SELECT * FROM orders WHERE id=?', id);
  emit(req, { topics: [...LAB_TOPICS, 'pharmacy', `encounter:${o.encounter_id}`], event: 'order.updated', data: row,
    action: 'lab.collect', entity: 'orders', entityId: id, detail: { sample: row.sample_id, accession, consumables_cost: used.cost, short: used.short } });
  return { ...row, consumables_short: used.short };
  });
}));

/** The reference range for this patient: child range below the parameter's age limit, else the sex-specific range, else the general one. */
export function rangeFor(p, pt = {}) {
  const has = (a, b) => a !== null && a !== undefined || b !== null && b !== undefined;
  const sex = String(pt.gender || '')[0]?.toUpperCase();
  let low = p.ref_low, high = p.ref_high, who = '';
  const rules = JSON.parse(p.reference_rules || '[]');
  const matched = rules.find(r => (!r.sex || String(r.sex)[0].toUpperCase() === sex) &&
    (r.pregnant === undefined || !!Number(pt.pregnant) === r.pregnant) &&
    (r.min_age === undefined || (pt.age_years != null && pt.age_years >= r.min_age)) &&
    (r.max_age === undefined || (pt.age_years != null && pt.age_years < r.max_age)));
  if (matched) return { low: matched.low ?? null, high: matched.high ?? null,
    text: matched.text || `${matched.low ?? ''} - ${matched.high ?? ''}${p.unit ? ' ' + p.unit : ''}${matched.label ? ' (' + matched.label + ')' : ''}` };
  if (pt.age_years !== null && pt.age_years !== undefined && pt.age_years < (p.child_max_age ?? 12) && has(p.ref_low_child, p.ref_high_child)) { low = p.ref_low_child; high = p.ref_high_child; who = 'child'; }
  else if (sex === 'M' && has(p.ref_low_m, p.ref_high_m)) { low = p.ref_low_m; high = p.ref_high_m; who = 'male'; }
  else if (sex === 'F' && has(p.ref_low_f, p.ref_high_f)) { low = p.ref_low_f; high = p.ref_high_f; who = 'female'; }
  const text = (low != null || high != null) ? `${low ?? ''} - ${high ?? ''}${p.unit ? ' ' + p.unit : ''}${who ? ' ('+who+')' : ''}` : null;
  return { low: low ?? null, high: high ?? null, text };
}

diagnostics.post('/lab/orders/:id/results', requirePerm('lab.result'), h((req) => {
  req.body.verify = true;   // one step: saving results releases the report (no second check)
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
    const pt = get('SELECT gender, age_years, pregnant FROM patients WHERE id=?', o.patient_id) || {};
    for (const r of results) {
      const p = r.param_id ? get('SELECT * FROM lab_params WHERE id=?', num(r.param_id)) : null;
      if (r.param_id && (!p || p.service_id !== o.service_id)) fail(400,'lab_parameter_service_mismatch');
      // a sub-heading carries no value: it is stored only so the report keeps its place in the print order
      if (p?.result_type === 'heading') { insert('lab_results', { order_id: id, param_id: p.id, name: p.name, value: '', flag: '', entered_by: req.user.id }); continue; }
      let flag = r.flag ?? '';
      if (!['','low','high','critical'].includes(flag)) fail(400,'result_flag_invalid');
      const range = p ? rangeFor(p, pt) : null;
      if (!r.flag && p && p.result_type !== 'text' && String(r.value ?? '').trim() !== '' && Number.isFinite(+r.value)) {
        const v = +r.value;
        // explicit critical limits first; without them the old rough rule stands
        if ((p.crit_low !== null && p.crit_low !== undefined && v <= p.crit_low) || (p.crit_high !== null && p.crit_high !== undefined && v >= p.crit_high)) flag = 'critical';
        else if (range.low !== null && v < range.low) flag = 'low';
        else if (range.high !== null && v > range.high) flag = 'high';
      }
      if (flag === 'critical') critical++;
      insert('lab_results', {
        order_id: id, param_id: p?.id || null, name: r.name || p?.name,
        value: String(r.value ?? ''), unit: r.unit ?? p?.unit,
        ref_range: p ? (range?.text || p.ref_text) : r.ref_range, flag,
        entered_by: req.user.id,
        method: p?.method || null, interpretation: p?.interpretation || null,
      });
    }
    const status = req.body.verify ? 'verified' : 'reported';
    const processing = consumeForOrder(req, o, 'processing');
    update('orders', id, {
      status,
      lab_description: get('SELECT description FROM services WHERE id=?', o.service_id)?.description || '',
      // the interpretation printed with this report is the one current when it was resulted
      lab_comment: get('SELECT report_comment FROM services WHERE id=?', o.service_id)?.report_comment || '',
      lab_comment_title: get('SELECT report_comment_title FROM services WHERE id=?', o.service_id)?.report_comment_title || '',
      ...('remarks' in req.body ? { lab_remarks: String(req.body.remarks || '').trim().slice(0, 4000) || null } : {}),
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
      detail: { params: results.length, critical, reagents_cost: processing.cost, short: processing.short },
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
  if (o.category === 'lab' && o.status === 'verified') return o;   // results are released when saved; nothing more to check
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

/** The reported lab tests of one visit, for printing them together as one report. */
diagnostics.get('/lab/encounter/:id/reports', requirePerm('lab.view'), h((req) => all(
  `SELECT o.id, o.label, o.status, s.lab_section FROM orders o LEFT JOIN services s ON s.id=o.service_id
    WHERE o.encounter_id=? AND o.category='lab' AND o.status IN ('reported','verified','completed') ORDER BY o.id`, +req.params.id)));

/** Everything one lab report prints: patient, test, results in template order, comments and the hospital header. */
export function buildLabReport(id) {
  const o = get(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            s.name service_name, s.code service_code, s.sample_type, coalesce(o.lab_description,s.description,'') test_description, s.lab_section, u.name ordered_by_name, v.name verified_by_name,
            coalesce(nullif(o.lab_comment,''),s.report_comment,'') test_comment, coalesce(nullif(o.lab_comment_title,''),s.report_comment_title,'') test_comment_title,
            v.qualification verified_by_qual, v.reg_no verified_by_reg, e.encounter_no, ed.name visit_doctor_name, e.referred_by visit_referred_by,
            u.role ordered_by_role
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id LEFT JOIN users u ON u.id=o.ordered_by
       LEFT JOIN encounters e ON e.id=o.encounter_id LEFT JOIN users ed ON ed.id=e.doctor_id
       LEFT JOIN users v ON v.id=o.verified_by WHERE o.id=?`, id);
  if (!o) fail(404, 'order_not_found');
  o.results = all('SELECT r.*,u.name technician,lp.result_type param_type FROM lab_results r LEFT JOIN users u ON u.id=r.entered_by LEFT JOIN lab_params lp ON lp.id=r.param_id WHERE r.order_id=? ORDER BY coalesce(lp.seq, 100000), r.id', id);
  o.result_guidance=resultGuidance(o.results,o.service_code);
  // "Referred by": the paper prescription / outside doctor when reception ordered it, else the ordering doctor
  o.referred_by_name = o.referred_by || (o.ordered_by_role === 'doctor' ? o.ordered_by_name : o.visit_doctor_name || o.visit_referred_by || o.ordered_by_name);
  // only what a report needs — never gateway or other secrets
  o.settings = Object.fromEntries(all("SELECT key,value FROM settings WHERE key IN ('hospital_name','address','phone','email','nabh_no','gstin','website','lab_report_disclaimer','lab_head_name')").map((r) => [r.key, r.value]));
  return o;
}
diagnostics.get('/lab/report/:id', requirePerm('lab.view'), h((req) => buildLabReport(+req.params.id)));

/* ------------------------------------------------------- imaging reports */

diagnostics.get('/imaging/orders/:id', requirePerm('imaging.view'), h((req) => {
  const id = +req.params.id;
  const o = get(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            s.name service_name, u.name ordered_by_name, ${REQUESTED_BY_SQL} requested_by_name, e.encounter_no
       FROM orders o JOIN patients p ON p.id=o.patient_id
       LEFT JOIN services s ON s.id=o.service_id LEFT JOIN users u ON u.id=o.ordered_by
       LEFT JOIN encounters e ON e.id=o.encounter_id WHERE o.id=?`, id);
  if (!o) fail(404, 'order_not_found');
  o.report = get('SELECT r.*, a.name author_name, sg.name signed_by_name, sg.qualification signed_by_qual, sg.reg_no signed_by_reg FROM reports r LEFT JOIN users a ON a.id=r.author_id LEFT JOIN users sg ON sg.id=r.signed_by WHERE r.order_id=? ORDER BY r.id DESC LIMIT 1', id);
  o.report_history = o.report ? all(`SELECT v.*, sg.name signed_by_name, su.name superseded_by_name
    FROM report_versions v LEFT JOIN users sg ON sg.id=v.signed_by LEFT JOIN users su ON su.id=v.superseded_by
    WHERE v.report_id=? ORDER BY v.version_no DESC`, o.report.id) : [];
  o.can_sign = can(req.user, 'imaging.report');
  o.patient = patientCard(o.patient_id);
  o.templates = all("SELECT * FROM templates WHERE kind IN ('usg','imaging') ORDER BY name");
  // report header and footer only — never gateway keys
  o.settings = Object.fromEntries(all("SELECT key,value FROM settings WHERE key NOT LIKE 'sms_gateway%' AND key NOT LIKE '%secret%' AND key NOT LIKE '%token%' AND key NOT LIKE '%password%'").map((r) => [r.key, r.value]));
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
  const sign = b.status === 'final';
  // Save is one step: the saved report is the released report (no draft, no second signature)
  return tx(() => {
    const rep = get('SELECT * FROM reports WHERE order_id=? ORDER BY id DESC LIMIT 1', id);
    const signed = ['final', 'amended'].includes(rep?.status);
    const reason = String(b.reason || '').trim();
    if (signed && !sign) fail(409, 'signed_report_immutable');
    if (signed && sign && !reason) fail(400, 'amendment_reason_required');
    const at = nowIso();
    if (signed) insert('report_versions', {
      report_id: rep.id, version_no: rep.version_no || 1, kind: rep.kind,
      technique: rep.technique, findings: rep.findings, impression: rep.impression, advice: rep.advice,
      status: 'superseded', author_id: rep.author_id, signed_by: rep.signed_by, signed_at: rep.signed_at,
      amendment_reason: rep.amendment_reason, created_at: rep.created_at, updated_at: rep.updated_at,
      superseded_by: req.user.id, superseded_at: at,
    });
    const fields = {
      technique: b.technique, findings: b.findings, impression: b.impression, advice: b.advice,
      status: sign ? (signed ? 'amended' : 'final') : 'draft', updated_at: at,
      version_no: sign && signed ? (rep.version_no || 1) + 1 : (rep?.version_no || 1),
      amendment_reason: signed ? reason : null,
      ...(sign ? { signed_by: req.user.id, signed_at: at } : {}),
    };
    const rid = rep ? (update('reports', rep.id, fields), rep.id)
      : insert('reports', { order_id: id, kind: b.kind || 'imaging', author_id: req.user.id, ...fields });
    update('orders', id, {
      status: sign ? 'verified' : 'reported', completed_at: at,
      ...(sign ? { verified_by: req.user.id, verified_at: at } : {}),
    });
    closeEncounterIfDone(o.encounter_id);
    const row = get('SELECT * FROM orders WHERE id=?', id);
    row.report = get('SELECT * FROM reports WHERE id=?', rid);
    if (sign) notifyResultPublished(row, 'imaging');
    emit(req, {
      topics: [...IMG_TOPICS, `encounter:${o.encounter_id}`, `patient:${o.patient_id}`],
      event: sign ? 'imaging.signed' : 'imaging.reported', data: row,
      action: sign ? (signed ? 'imaging.amend' : 'imaging.sign') : 'imaging.report', entity: 'reports', entityId: rid,
      detail: { order_no: row.order_no, before: rep || null, after: row.report, reason: signed ? reason : null },
    });
    return row;
  });
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

diagnostics.get('/lab/units', requireAuth, h(()=>all("SELECT unit FROM lab_params WHERE unit IS NOT NULL AND trim(unit)<>'' UNION SELECT unit FROM lab_results WHERE unit IS NOT NULL AND trim(unit)<>'' ORDER BY unit").map(row=>row.unit)));

diagnostics.get('/lab/params', requireAuth, h((req) => all(
  `SELECT lp.*, s.name service_name, s.code service_code FROM lab_params lp
     JOIN services s ON s.id=lp.service_id ${req.query.service_id ? 'WHERE lp.service_id=?' : ''}
    ORDER BY s.name, lp.seq`, ...(req.query.service_id ? [+req.query.service_id] : []))));

function templatePermission(req) {
  if (!can(req.user, 'admin.write') && !(can(req.user, 'staff.manage') && can(req.user, 'lab.verify'))) fail(403, 'lab_incharge_required');
}
diagnostics.patch('/lab/tests/:id', requireAuth, h(req => {
  templatePermission(req);
  const before = get("SELECT * FROM services WHERE id=? AND category='lab'", +req.params.id);
  if (!before) fail(404, 'lab_service_not_found');
  const patch = {};
  const LIMIT = { description: 5000, lab_section: 100, report_comment: 10000, report_comment_title: 80 };
  for (const key of Object.keys(LIMIT)) if (key in req.body) {
    if (typeof req.body[key] !== 'string' || req.body[key].length > LIMIT[key]) fail(400, key + '_invalid');
    patch[key] = req.body[key].trim();
  }
  update('services', before.id, { ...patch, updated_at: nowIso() });
  const row = get('SELECT * FROM services WHERE id=?', before.id);
  emit(req, { topics: ['lab', 'admin'], event: 'service.updated', data: row, action: 'lab.test.info', entity: 'services', entityId: row.id, detail: { before, after: row } });
  return row;
}));
function parameterFields(b, before = {}) {
  const row = {};
  if ('result_type' in b) {
    if (!['numeric', 'text', 'heading'].includes(b.result_type)) fail(400, 'result_type_invalid');
    row.result_type = b.result_type;
  }
  for (const k of ['name','unit','ref_text','method','interpretation']) if (k in b) row[k] = String(b[k] || '').trim() || null;
  if ('name' in row && !row.name) fail(400, 'name_required');
  for (const k of ['ref_low','ref_high','ref_low_m','ref_high_m','ref_low_f','ref_high_f','ref_low_child','ref_high_child','child_max_age','crit_low','crit_high','seq']) {
    if (!(k in b)) continue;
    row[k] = b[k] === '' || b[k] === null ? null : Number(b[k]);
    if (k === 'seq' && row[k] === null) { delete row[k]; continue; }
    if (row[k] !== null && !Number.isFinite(row[k])) fail(400, 'range_invalid');
  }
  const merged = { ...before, ...row };
  for (const [lo, hi] of [['ref_low','ref_high'],['ref_low_m','ref_high_m'],['ref_low_f','ref_high_f'],['ref_low_child','ref_high_child'],['crit_low','crit_high']]) if (merged[lo] != null && merged[hi] != null && merged[lo] > merged[hi]) fail(400, 'range_invalid');
  if ('reference_rules' in b) {
    let rules; try { rules = typeof b.reference_rules === 'string' ? JSON.parse(b.reference_rules || '[]') : b.reference_rules; } catch { fail(400, 'reference_rules_invalid'); }
    if (!Array.isArray(rules) || rules.length > 50) fail(400, 'reference_rules_invalid');
    for (const r of rules) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) fail(400, 'reference_rules_invalid');
      for (const k of ['low','high','min_age','max_age']) if (r[k] !== undefined && (!Number.isFinite(r[k]) || (k.includes('age') && r[k] < 0))) fail(400, 'reference_rules_invalid');
      if ((r.low != null && r.high != null && r.low > r.high) || (r.min_age != null && r.max_age != null && r.min_age >= r.max_age) || (r.pregnant !== undefined && typeof r.pregnant !== 'boolean') || (r.sex && !['Male','Female','Other'].includes(r.sex))) fail(400, 'reference_rules_invalid');
    }
    row.reference_rules = JSON.stringify(rules);
  }
  if ('active' in b) row.active = b.active === false || b.active === 0 || b.active === '0' ? 0 : 1;
  return row;
}

diagnostics.post('/lab/params', requireAuth, h((req) => {
  templatePermission(req);
  const b = req.body || {};
  if (!b.service_id || !b.name) fail(400, 'service_id_and_name_required');
  if (!get("SELECT id FROM services WHERE id=? AND category='lab'", +b.service_id)) fail(400, 'lab_service_required');
  // a blank display order puts the new parameter after the existing ones
  const seq = b.seq !== undefined && b.seq !== null && b.seq !== '' && Number.isFinite(+b.seq) ? +b.seq : ((one('SELECT max(seq) FROM lab_params WHERE service_id=?', +b.service_id) || 0) + 1);
  const id = insert('lab_params', {
    service_id: +b.service_id,
    name: b.name.trim(),
    unit: b.unit || null,
    ref_low: b.ref_low !== undefined && b.ref_low !== '' ? num(b.ref_low) : null,
    ref_high: b.ref_high !== undefined && b.ref_high !== '' ? num(b.ref_high) : null,
    ref_text: b.ref_text || (b.ref_low && b.ref_high ? `${b.ref_low} - ${b.ref_high}` : null),
    seq,
    ...parameterFields(b),
  });
  const row = get('SELECT * FROM lab_params WHERE id=?', id);
  // reference ranges decide how results are flagged, so every change is audited
  emit(req, { topics: ['lab'], event: 'lab.params', data: { id }, action: 'lab.param.add', entity: 'lab_params', entityId: id, detail: { before: null, after: row } });
  return row;
}));

/** Print order of a test's parameters, set by drag and drop in Lab templates. */
diagnostics.post('/lab/params/reorder', requireAuth, h((req) => tx(() => {
  templatePermission(req);
  const serviceId = num(req.body?.service_id), ids = (req.body?.ids || []).map(Number);
  const current = all('SELECT id, name, seq FROM lab_params WHERE service_id=? ORDER BY seq, id', serviceId);
  if (!current.length || ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !current.find((p) => p.id === id))) fail(400, 'param_order_invalid');
  ids.forEach((id, i) => run('UPDATE lab_params SET seq=? WHERE id=?', i + 1, id));
  emit(req, { topics: ['lab'], event: 'lab.params', data: { service_id: serviceId }, action: 'lab.param.reorder', entity: 'services', entityId: serviceId,
    detail: { before: current.map((p) => p.name), after: ids.map((id) => current.find((p) => p.id === id).name), reason: 'Report print order changed' } });
  return all('SELECT * FROM lab_params WHERE service_id=? ORDER BY seq, id', serviceId);
})));

diagnostics.patch('/lab/params/:id', requireAuth, h(req => {
  templatePermission(req);
  const before = get('SELECT * FROM lab_params WHERE id=?', +req.params.id) || fail(404, 'lab_param_not_found');
  const row = parameterFields(req.body || {}, before);
  update('lab_params', before.id, row);
  emit(req, { topics: ['lab'], event: 'lab.params', data: { id: before.id }, action: 'lab.param.edit', entity: 'lab_params', entityId: before.id, detail: { before, after: row, reason: req.body?.reason || 'Validated lab template updated' } });
  return get('SELECT * FROM lab_params WHERE id=?', before.id);
}));

diagnostics.delete('/lab/params/:id', requireAuth, h((req) => {
  templatePermission(req);
  const before = get('SELECT * FROM lab_params WHERE id=?', +req.params.id);
  if (!before) fail(404, 'lab_param_not_found');
  update('lab_params', before.id, { active: 0 });
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

/* ------------------------------------------- outside labs and scan centres */

/**
 * Where work the hospital does not do itself is sent. Two arrangements:
 *   billing='hospital'  a tie-up lab — reception bills the patient as usual and
 *                       the hospital settles with the lab separately. The sample
 *                       is collected here and a report comes back.
 *   billing='outside'   the patient pays the centre directly (an MRI the
 *                       hospital has no machine for). Nothing is billed here.
 * Anyone who can order or act on diagnostics may read the list; only an
 * administrator may change who the hospital deals with.
 */
diagnostics.get('/diagnostic-providers', requireAuth, h((req) => {
  const w = ['1=1'], a = [];
  if (req.query.kind) { w.push('kind=?'); a.push(req.query.kind); }
  if (req.query.active !== 'all') w.push('active=1');
  return all(`SELECT * FROM diagnostic_providers WHERE ${w.join(' AND ')} ORDER BY kind, name`, ...a);
}));

diagnostics.post('/diagnostic-providers', requirePerm('admin.view'), h((req) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) fail(400, 'name_required');
  if (!['lab', 'imaging'].includes(b.kind)) fail(400, 'kind_invalid');
  if (!['hospital', 'outside'].includes(b.billing)) fail(400, 'billing_invalid');
  const id = insert('diagnostic_providers', { name, kind: b.kind, billing: b.billing,
    contact_person: b.contact_person || null, phone: b.phone || null, address: b.address || null,
    notes: b.notes || null, code: b.code || null, email: b.email || null, gstin: b.gstin || null,
    default_tat_hours: b.default_tat_hours ? num(b.default_tat_hours) : null, credit_days: b.credit_days ? num(b.credit_days) : null, active: 1, created_by: req.user.id });
  const row = get('SELECT * FROM diagnostic_providers WHERE id=?', id);
  emit(req, { topics: ['admin', 'lab', 'imaging'], event: 'diagnostic.provider', data: row,
    action: 'diagnostic.provider.add', entity: 'diagnostic_providers', entityId: id, detail: { before: null, after: row } });
  return row;
}));

diagnostics.patch('/diagnostic-providers/:id', requirePerm('admin.view'), h((req) => {
  const before = get('SELECT * FROM diagnostic_providers WHERE id=?', +req.params.id) || fail(404, 'provider_not_found');
  const b = req.body || {}, patch = {};
  for (const k of ['name', 'contact_person', 'phone', 'address', 'notes']) if (k in b) patch[k] = String(b[k] || '').trim() || null;
  for (const k of ['code', 'email', 'gstin']) if (k in b) patch[k] = String(b[k] || '').trim() || null;
  for (const k of ['default_tat_hours', 'credit_days']) if (k in b) patch[k] = b[k] === '' || b[k] === null ? null : num(b[k]);
  if ('active' in b) patch.active = b.active ? 1 : 0;
  // Changing who pays would silently change what past and future orders charge, so it is set once.
  if (('billing' in b && b.billing !== before.billing) || ('kind' in b && b.kind !== before.kind)) fail(400, 'billing_and_kind_are_fixed');
  if (patch.name === null) fail(400, 'name_required');
  update('diagnostic_providers', before.id, patch);
  const after = get('SELECT * FROM diagnostic_providers WHERE id=?', before.id);
  emit(req, { topics: ['admin', 'lab', 'imaging'], event: 'diagnostic.provider', data: after,
    action: 'diagnostic.provider.edit', entity: 'diagnostic_providers', entityId: before.id, detail: { before, after } });
  return after;
}));

/**
 * File the report for work done outside and publish it.
 *
 * Outside work has no results to type: a tie-up lab or scan centre sends back a
 * report, which is attached to the order first. This closes the order against
 * that attachment so the doctor sees it exactly where in-house results appear.
 *
 * It refuses to publish an order with nothing attached — an order marked
 * verified with no report is worse than one still open, because it reads as
 * done. Payment clearance is unchanged: a tie-up test the hospital billed is
 * held like any other, while a scan the patient paid for outside has no bill to
 * clear and passes.
 */
diagnostics.post('/diagnostics/orders/:id/outside-report', requireAuth, h((req) => {
  const id = +req.params.id;
  const o = get('SELECT * FROM orders WHERE id=?', id) || fail(404, 'order_not_found');
  if (!['lab', 'imaging'].includes(o.category)) fail(409, 'lab_or_imaging_order_required');
  if (!can(req.user, o.category === 'lab' ? 'lab.result' : 'imaging.report')) fail(403, 'forbidden');
  if (!o.provider_id) fail(409, 'not_an_outside_order');
  if (o.status === 'verified') fail(409, 'already_published');
  requireOrderClearance(o);
  const files = one("SELECT count(*) FROM attachments WHERE entity='order' AND entity_id=? AND deleted_at IS NULL", id);
  if (!files) fail(409, 'attach_the_report_first');
  const provider = get('SELECT name FROM diagnostic_providers WHERE id=?', o.provider_id);
  // one-step publish keeps the same version history as the outsourcing desk's receive → accept
  const usedFiles = new Set(all('SELECT attachment_ids FROM external_reports WHERE order_id=?', id).flatMap((r) => JSON.parse(r.attachment_ids || '[]')));
  const newFiles = all("SELECT id FROM attachments WHERE entity='order' AND entity_id=? AND deleted_at IS NULL", id).map((a) => a.id).filter((f) => !usedFiles.has(f));
  insert('external_reports', { order_id: id, provider_id: o.provider_id, version: (one('SELECT max(version) FROM external_reports WHERE order_id=?', id) || 0) + 1,
    external_report_no: String(req.body?.reference || '').trim() || null, reporting_lab: provider?.name || 'Outside centre',
    signatory_name: String(req.body?.signatory_name || '').trim() || 'As signed on the attached report', attachment_ids: JSON.stringify(newFiles),
    status: 'accepted', received_by: req.user.id, accepted_by: req.user.id, accepted_at: nowIso(), checks: JSON.stringify({ one_step_publish: true }) });
  run("UPDATE outsource_items SET status='accepted' WHERE order_id=? AND status IN ('sent','report_received')", id);
  update('orders', id, { status: 'verified', verified_by: req.user.id, verified_at: nowIso(), completed_at: o.completed_at || nowIso() });
  closeEncounterIfDone(o.encounter_id);
  const row = get('SELECT * FROM orders WHERE id=?', id);
  notifyResultPublished(row, o.category);
  emit(req, {
    topics: [o.category === 'lab' ? 'lab' : 'imaging', 'clinical', 'dashboard', `encounter:${o.encounter_id}`, `patient:${o.patient_id}`, 'notifications'],
    event: o.category === 'lab' ? 'lab.verified' : 'imaging.signed', data: row,
    action: 'diagnostic.outside.publish', entity: 'orders', entityId: id,
    detail: { order_no: row.order_no, provider: provider?.name || null, files, reference: String(req.body?.reference || '').trim() || null },
  });
  return row;
}));
