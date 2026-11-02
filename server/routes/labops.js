/**
 * Lab operations: test-wise consumables, LAB store alerts, sample recollection, the critical-result
 * call log, label data and barcode scan-to-open.
 */
import { Router } from 'express';
import { h, fail, all, get, one, insert, update, run, emit, num, tx, nowIso, REQUESTED_BY_SQL } from '../lib.js';
import { requireAuth, can } from '../auth.js';
import { consumablesFor, labStockAlerts, LAB_STORE, addStandardLabItems } from '../lab-ops.js';
import { labManual, labNameKey, LAB_MANUAL_ALIAS } from '../lab-manual.js';

export const labops = Router();
labops.get('/lab/manual',requireAuth,h(req=>{
  if(!can(req.user,'lab.view'))fail(403,'forbidden');
  const services=all("SELECT id,name,code FROM services WHERE category='lab' AND active=1");
  return {...labManual,tests:labManual.tests.map(test=>{
    const key=labNameKey(test.name);
    const matches=services.filter(s=>labNameKey(s.name)===key||(LAB_MANUAL_ALIAS[key]&&s.code===LAB_MANUAL_ALIAS[key]));
    const service=matches.length===1?matches[0]:null;
    // what the HMS actually uses for this test: units and ranges from Lab templates
    const hms=service?all('SELECT name,unit,ref_text,ref_low,ref_high FROM lab_params WHERE service_id=? AND active=1 ORDER BY seq,id',service.id):[];
    return {...test,service,hms_parameters:hms};
  })};
}));
labops.post('/lab/manual/:number/interpretation',requireAuth,h(req=>{
  if(!can(req.user,'admin.write')&&!(can(req.user,'staff.manage')&&can(req.user,'lab.verify')))fail(403,'forbidden');
  const test=labManual.tests.find(t=>t.number===Number(req.params.number))||fail(404,'test_not_found');
  const service=get("SELECT * FROM services WHERE id=? AND category='lab'",num(req.body.service_id))||fail(404,'lab_test_not_found');
  const key=labNameKey(test.name);
  if(labNameKey(service.name)!==key&&!(LAB_MANUAL_ALIAS[key]&&service.code===LAB_MANUAL_ALIAS[key]))fail(409,'test_name_mismatch');
  if(!test.interpretation)fail(400,'no_interpretation');
  if(!req.body.confirm_replace)fail(400,'confirmation_required');
  return tx(()=>{
    update('services',service.id,{report_comment:test.interpretation,report_comment_title:'Interpretation'});
    emit(req,{topics:['lab','admin'],event:'service.updated',data:{id:service.id},action:'lab.manual_interpretation',entity:'services',entityId:service.id,detail:{before:{report_comment:service.report_comment},after:{report_comment:test.interpretation},reason:'Laboratory selected interpretation from supplied master manual'}});
    return {ok:true};
  });
}));
const canMasterLab = (u) => can(u, 'admin.view') || (can(u, 'staff.manage') && can(u, 'lab.verify'));

/* ---------------------------------------------------------- test-wise consumables */

labops.get('/lab/consumables/:serviceId', requireAuth, h((req) => {
  if (!can(req.user, 'lab.view') && !can(req.user, 'inventory.view')) fail(403, 'forbidden');
  return consumablesFor(+req.params.serviceId);
}));

labops.put('/lab/consumables/:serviceId', requireAuth, h((req) => {
  if (!canMasterLab(req.user)) fail(403, 'forbidden');
  const svc = get("SELECT * FROM services WHERE id=? AND category='lab'", +req.params.serviceId) || fail(404, 'lab_test_not_found');
  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => {
    const m = get("SELECT id, kind FROM medicines WHERE id=? AND active=1", num(l.medicine_id)) || fail(400, 'item_not_found');
    if (m.kind !== 'consumable') fail(400, 'consumables_only');
    const qty = Number(l.qty);
    if (!(qty > 0) || qty > 1000) fail(400, 'qty_invalid');
    if (!['collection', 'processing'].includes(l.stage)) fail(400, 'stage_invalid');
    return { medicine_id: m.id, qty, stage: l.stage };
  });
  if (new Set(lines.map((l) => `${l.medicine_id}:${l.stage}`)).size !== lines.length) fail(400, 'item_listed_twice');
  return tx(() => {
    const before = consumablesFor(svc.id);
    run('UPDATE lab_test_consumables SET active=0 WHERE service_id=?', svc.id);
    for (const l of lines) {
      const ex = get('SELECT id FROM lab_test_consumables WHERE service_id=? AND medicine_id=? AND stage=?', svc.id, l.medicine_id, l.stage);
      if (ex) update('lab_test_consumables', ex.id, { qty: l.qty, active: 1 });
      else insert('lab_test_consumables', { service_id: svc.id, ...l });
    }
    const after = consumablesFor(svc.id).filter((c) => c.active);
    emit(req, { topics: ['lab', 'admin'], event: 'lab.consumables', data: { service_id: svc.id }, action: 'lab.consumables.set', entity: 'services', entityId: svc.id,
      detail: { before: before.filter((c) => c.active).map((c) => ({ item: c.name, qty: c.qty, stage: c.stage })), after: after.map((c) => ({ item: c.name, qty: c.qty, stage: c.stage })) } });
    return after;
  });
}));

/** LAB store: consumable stock, low and near-expiry items. */
labops.get('/lab/store', requireAuth, h((req) => {
  if (!can(req.user, 'lab.view') && !can(req.user, 'inventory.view')) fail(403, 'forbidden');
  const stock = all(`SELECT m.id, m.code, m.name, m.dispensing_unit unit, m.reorder_level, coalesce(sum(CASE WHEN b.expiry >= date('now','localtime') THEN b.qty END),0) qty,
      min(CASE WHEN b.qty>0 THEN b.expiry END) nearest_expiry, round(coalesce(sum(b.qty*b.purchase_rate),0),2) value,
      (SELECT count(*) FROM lab_test_consumables c WHERE c.medicine_id=m.id AND c.active=1) tests_using
    FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.id AND b.location=? AND b.qty>0
    WHERE m.kind='consumable' AND m.active=1 AND (m.code LIKE 'LC-%' OR EXISTS (SELECT 1 FROM lab_test_consumables c WHERE c.medicine_id=m.id) OR EXISTS (SELECT 1 FROM medicine_batches x WHERE x.medicine_id=m.id AND x.location=? AND x.qty>0))
    GROUP BY m.id ORDER BY m.name`, LAB_STORE, LAB_STORE);
  const short = all(`SELECT lc.created_at, m.name, lc.qty, o.order_no, o.label FROM lab_consumption lc JOIN medicines m ON m.id=lc.medicine_id JOIN orders o ON o.id=lc.order_id
    WHERE lc.status='short' AND lc.created_at >= datetime('now','localtime','-14 days') ORDER BY lc.id DESC LIMIT 50`);
  return { stock, ...labStockAlerts(), short };
}));

/** Add the standard lab items (EDTA, plain, fluoride, citrate tubes, needles, containers …) to the master. */
labops.post('/lab/store/standard-items', requireAuth, h((req) => {
  if (!canMasterLab(req.user) && !can(req.user, 'inventory.write')) fail(403, 'forbidden');
  return tx(() => {
    const added = addStandardLabItems();
    emit(req, { topics: ['lab', 'pharmacy', 'inventory'], event: 'stock.changed', data: { added }, action: 'lab.items.standard', entity: 'medicines', entityId: null,
      detail: { before: null, after: { added } } });
    return { added };
  });
}));

/* ---------------------------------------------------------- recollection */

/** Sample rejected (haemolysed, clotted, wrong tube, insufficient): back to "to collect", reason kept. */
labops.post('/lab/orders/:id/recollect', requireAuth, h((req) => {
  if (!can(req.user, 'lab.collect')) fail(403, 'forbidden');
  const o = get('SELECT * FROM orders WHERE id=?', +req.params.id) || fail(404, 'order_not_found');
  if (o.category !== 'lab' || !['collected', 'in_progress'].includes(o.status)) fail(409, 'sample_state_invalid');
  if (o.order_dest === 'outsourced' && get("SELECT 1 FROM outsource_items WHERE order_id=? AND status IN ('sent','report_received')", o.id)) fail(409, 'sample_at_outside_lab');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  return tx(() => {
    const sample = `S${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    update('orders', o.id, { status: 'ordered', collected_at: null, sample_id: sample, accession_no: null, recollect_count: (o.recollect_count || 0) + 1 });
    const after = get('SELECT * FROM orders WHERE id=?', o.id);
    emit(req, { topics: ['lab', 'clinical', `encounter:${o.encounter_id}`], event: 'order.updated', data: after, action: 'lab.recollect', entity: 'orders', entityId: o.id,
      detail: { before: { status: o.status, sample_id: o.sample_id, accession_no: o.accession_no }, after: { status: after.status, sample_id: sample }, reason } });
    return after;
  });
}));

/* ---------------------------------------------------------- critical results */

const criticalScope = (u) => (can(u, 'lab.view') ? { w: '1=1', a: [] }
  : { w: `(o.ordered_by=? OR EXISTS (SELECT 1 FROM admissions ad WHERE ad.encounter_id=o.encounter_id AND ad.consultant_id=?))`, a: [u.id, u.id] });

labops.get('/lab/critical', requireAuth, h((req) => {
  if (!can(req.user, 'lab.view') && !can(req.user, 'patient.clinical')) fail(403, 'forbidden');
  const s = criticalScope(req.user);
  const days = Math.min(num(req.query.days, 7), 90);
  const rows = all(`SELECT o.id, o.order_no, o.label, o.status, o.completed_at, o.ordered_by, p.name patient_name, p.uhid, p.mobile, e.encounter_no, e.kind,
      u.name ordered_by_name, ${REQUESTED_BY_SQL} requested_by_name, (SELECT group_concat(r.name || ' ' || r.value || coalesce(' ' || r.unit, ''), '; ') FROM lab_results r WHERE r.order_id=o.id AND r.flag='critical') results,
      (SELECT max(r.entered_at) FROM lab_results r WHERE r.order_id=o.id AND r.flag='critical') resulted_at
    FROM orders o JOIN patients p ON p.id=o.patient_id JOIN encounters e ON e.id=o.encounter_id LEFT JOIN users u ON u.id=o.ordered_by
    WHERE EXISTS (SELECT 1 FROM lab_results r WHERE r.order_id=o.id AND r.flag='critical') AND o.completed_at >= datetime('now','localtime', ?) AND ${s.w}
    ORDER BY o.completed_at DESC`, `-${days} days`, ...s.a)
    .map((r) => ({ ...r, calls: all(`SELECT c.*, cb.name called_by_name, ab.name acknowledged_by_name FROM critical_calls c LEFT JOIN users cb ON cb.id=c.called_by
      LEFT JOIN users ab ON ab.id=c.acknowledged_by WHERE c.order_id=? ORDER BY c.id`, r.id) }))
    .map((r) => ({ ...r, state: !r.calls.length ? 'not_called' : r.calls.some((c) => c.acknowledged_at) ? 'acknowledged'
      // an outside doctor has no login to acknowledge in: the read-back call is the record
      : r.calls.some((c) => !c.informed_user_id) ? 'told_outside' : 'called' }));
  return { rows, summary: { not_called: rows.filter((r) => r.state === 'not_called').length, called: rows.filter((r) => r.state === 'called').length } };
}));

/** The lab records that it told the clinical team, by name, and that the result was read back. */
labops.post('/lab/orders/:id/critical-call', requireAuth, h((req) => {
  if (!can(req.user, 'lab.result')) fail(403, 'forbidden');
  const o = get('SELECT * FROM orders WHERE id=?', +req.params.id) || fail(404, 'order_not_found');
  const crit = all("SELECT name, value, unit, entered_at created_at FROM lab_results WHERE order_id=? AND flag='critical'", o.id);
  if (!crit.length) fail(409, 'no_critical_result');
  const b = req.body || {};
  const informedUser = b.informed_user_id ? get('SELECT id, name FROM users WHERE id=? AND active=1', num(b.informed_user_id)) : null;
  const name = String(b.informed_name || informedUser?.name || '').trim();
  if (!name) fail(400, 'informed_name_required');
  if (!['phone', 'in_person', 'intercom', 'video'].includes(b.mode)) fail(400, 'mode_invalid');
  if (b.read_back !== true) fail(400, 'read_back_required');
  const resultedAt = crit.map((c) => c.created_at).sort()[0];
  const minutes = resultedAt ? Math.max(0, Math.round((Date.now() - new Date(String(resultedAt).replace(' ', 'T'))) / 60000)) : null;
  return tx(() => {
    const id = insert('critical_calls', { order_id: o.id, result_summary: crit.map((c) => `${c.name} ${c.value}${c.unit ? ` ${c.unit}` : ''}`).join('; '),
      informed_user_id: informedUser?.id || null, informed_name: name, mode: b.mode, read_back: 1, called_by: req.user.id, called_at: nowIso(),
      minutes_from_result: minutes, notes: String(b.notes || '').trim() || null });
    if (informedUser) insert('notifications', { user_id: informedUser.id, level: 'danger', title: `Critical result — please acknowledge`,
      body: `${o.label} · ${get('SELECT name FROM patients WHERE id=?', o.patient_id)?.name || ''}`, link: '/critical-results' });
    const row = get('SELECT * FROM critical_calls WHERE id=?', id);
    emit(req, { topics: ['lab', 'clinical', 'notifications'], event: 'lab.critical.called', data: row, action: 'lab.critical.call', entity: 'critical_calls', entityId: id,
      detail: { before: null, after: { order_no: o.order_no, informed: name, mode: b.mode, read_back: true, minutes_from_result: minutes } } });
    return row;
  });
}));

/** The doctor confirms they received the critical result and what was done. */
labops.post('/critical-calls/:id/ack', requireAuth, h((req) => {
  if (!can(req.user, 'patient.clinical')) fail(403, 'forbidden');
  const c = get('SELECT * FROM critical_calls WHERE id=?', +req.params.id) || fail(404, 'call_not_found');
  if (c.acknowledged_at) fail(409, 'already_acknowledged');
  const action = String(req.body?.action_taken || '').trim();
  if (!action) fail(400, 'action_required');
  return tx(() => {
    update('critical_calls', c.id, { acknowledged_by: req.user.id, acknowledged_at: nowIso(), action_taken: action });
    const after = get('SELECT * FROM critical_calls WHERE id=?', c.id);
    emit(req, { topics: ['lab', 'clinical'], event: 'lab.critical.called', data: after, action: 'lab.critical.ack', entity: 'critical_calls', entityId: c.id,
      detail: { before: { acknowledged_at: null }, after: { acknowledged_at: after.acknowledged_at, action_taken: action } } });
    return after;
  });
}));

/* ---------------------------------------------------------- labels and scanning */

/** What a scanned barcode is: a sample / accession, an order, a patient, an admission or a bill. */
labops.get('/scan/:code', requireAuth, h((req) => {
  const code = String(req.params.code || '').trim();
  if (code.length < 3) fail(400, 'code_too_short');
  const o = get('SELECT id, category, order_no, label, patient_id FROM orders WHERE sample_id=? OR accession_no=? OR order_no=? ORDER BY id DESC LIMIT 1', code, code, code);
  if (o && (can(req.user, 'lab.view') || can(req.user, 'imaging.view') || can(req.user, 'patient.clinical')))
    return { type: 'order', id: o.id, category: o.category, label: `${o.order_no} · ${o.label}`, route: o.category === 'imaging' ? `/imaging?order=${o.id}` : `/laboratory?order=${o.id}` };
  const p = can(req.user, 'patient.view') ? get('SELECT id, uhid, name FROM patients WHERE uhid=? AND merged_into IS NULL', code) : null;
  if (p) return { type: 'patient', id: p.id, label: `${p.uhid} · ${p.name}`, route: `/patient/${p.id}` };
  const a = can(req.user, 'ipd.view') ? get('SELECT id, ip_no, patient_id FROM admissions WHERE ip_no=?', code) : null;
  if (a) return { type: 'admission', id: a.id, label: a.ip_no, route: `/patient/${a.patient_id}` };
  const b = can(req.user, 'billing.view') ? get('SELECT id, bill_no FROM bills WHERE bill_no=?', code) : null;
  if (b) return { type: 'bill', id: b.id, label: b.bill_no, route: `/bills?bill=${b.id}` };
  fail(404, 'nothing_matches_code');
}));

/** Data for a tube label (order) or a wristband / file sticker (patient). */
labops.get('/labels/order/:id', requireAuth, h((req) => {
  if (!can(req.user, 'lab.view') && !can(req.user, 'imaging.view') && !can(req.user, 'nursing.view')) fail(403, 'forbidden');
  const o = get(`SELECT o.id, o.category, o.order_no, o.label, o.sample_id, o.accession_no, o.collected_at, o.priority, s.sample_type, s.container,
      p.name, p.uhid, p.gender, p.age_years, e.kind, (SELECT ip_no FROM admissions a WHERE a.encounter_id=o.encounter_id) ip_no
    FROM orders o JOIN patients p ON p.id=o.patient_id JOIN encounters e ON e.id=o.encounter_id LEFT JOIN services s ON s.id=o.service_id WHERE o.id=?`, +req.params.id) || fail(404, 'order_not_found');
  // every test going into the same container (same visit, same sample type) so one label can tick them all
  o.tests = o.category === 'lab' ? all(`SELECT x.id, x.label, x.order_no FROM orders x LEFT JOIN services sx ON sx.id=x.service_id
      WHERE x.encounter_id=(SELECT encounter_id FROM orders WHERE id=?) AND x.category='lab' AND x.status IN ('ordered','collected','in_progress')
        AND coalesce(sx.sample_type,'')=coalesce(?,'') ORDER BY x.id`, o.id, o.sample_type) : [];
  if (!o.tests.some((t) => t.id === o.id)) o.tests.unshift({ id: o.id, label: o.label, order_no: o.order_no });
  return o;
}));
labops.get('/labels/patient/:id', requireAuth, h((req) => {
  if (!can(req.user, 'patient.view')) fail(403, 'forbidden');
  const p = get('SELECT id, uhid, name, gender, age_years, dob, blood_group, mobile FROM patients WHERE id=?', +req.params.id) || fail(404, 'patient_not_found');
  const a = get(`SELECT a.ip_no, a.admitted_at, u.name consultant, w.name ward, bd.bed_no FROM admissions a LEFT JOIN users u ON u.id=a.consultant_id
    LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id WHERE a.patient_id=? AND a.status<>'discharged' ORDER BY a.id DESC LIMIT 1`, p.id);
  const allergies = all('SELECT substance FROM allergies WHERE patient_id=?', p.id).map((x) => x.substance);
  return { ...p, admission: a || null, allergies };
}));
