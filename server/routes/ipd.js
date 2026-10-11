import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, nextNo, today, where, emit, num, money,
  recalcBill, patientCard, tx, nowIso, priceFor, publish,
} from '../lib.js';
import { requireAuth, requirePerm, requireAnyPerm, can } from '../auth.js';
import { ensurePayerCase, isApprovedStage } from '../payer-cases.js';
import { billCaseToPayer, billNewToPayer } from '../payer-billing.js';
import { activeAssignment, applyPackage, assignPackage, markPayerPackageExclusions, packageUsage } from '../packages.js';
import { accrueAdmission, accrueAll, startBedCharge, addCharge, stopCharge, transferBed, endCharges, chargePlan, ipBill, wardChargePlan } from '../ipd-charges.js';

import { admissionForUser, canReadAdmissionClinical } from '../admission-access.js';
import { refund, takePayment } from '../payments.js';

export const ipd = Router();
const TOPICS = ['ipd', 'dashboard'];
ipd.get('/admissions/:id/form-defaults', requirePerm('ipd.view'), h(req=>{
 if(!can(req.user,'ipd.admit')&&!can(req.user,'ipd.discharge')&&!can(req.user,'admin.manage'))fail(403,'forbidden');
 const a=get(`SELECT a.*,p.name patient_name,p.kin_name,p.kin_relation,p.kin_mobile,p.mobile FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE a.id=?`,+req.params.id)||fail(404,'admission_not_found');
 // attendant recorded on the admission, else next of kin, else the patient signs for themself
 const who=a.attendant_name?{n:a.attendant_name,r:a.attendant_relation,m:a.attendant_mobile}:a.kin_name?{n:a.kin_name,r:a.kin_relation,m:a.kin_mobile}:{n:a.patient_name,r:'Self',m:a.mobile};
 return {attendant:who.n||'',relation:who.r||'',mobile:who.m||a.mobile||'',diagnosis:a.diagnosis||'',procedures:all("SELECT label FROM orders WHERE encounter_id=? AND category='procedure' AND status<>'cancelled'",a.encounter_id).map(o=>o.label).filter(Boolean).join('; ')};
}));
ipd.get('/admissions/:id/forms', requirePerm('ipd.view'), h(req=>{
 if(!can(req.user,'ipd.admit')&&!can(req.user,'ipd.discharge')&&!can(req.user,'admin.manage'))fail(403,'forbidden');
 if(!get('SELECT id FROM admissions WHERE id=?',+req.params.id))fail(404,'admission_not_found');
 return all('SELECT * FROM admission_forms WHERE admission_id=? ORDER BY id DESC',+req.params.id).map(r=>({...r,details:JSON.parse(r.details_json)}));
}));
ipd.post('/admissions/:id/forms', requirePerm('ipd.view'), h(req=>{
 if(!can(req.user,'ipd.admit')&&!can(req.user,'ipd.discharge')&&!can(req.user,'admin.manage'))fail(403,'forbidden');
 const a=get('SELECT * FROM admissions WHERE id=?',+req.params.id)||fail(404,'admission_not_found');
 const {form_type,details}=req.body||{};
 if(!['estimate','consent','feedback'].includes(form_type)||!details||typeof details!=='object'||Array.isArray(details))fail(400,'invalid_form');
 if(form_type==='feedback'&&(a.status!=='discharged'||!Number.isInteger(details.rating)||details.rating<1||details.rating>5))fail(400,'discharged_patient_and_rating_required');
 if(JSON.stringify(details).length>40000)fail(400,'form_too_large');
 if(form_type==='estimate'&&(!Array.isArray(details.lines)||!details.lines.length||details.lines.length>100||details.lines.some(l=>typeof l.description!=='string'||!l.description.trim()||!Number.isFinite(l.days)||l.days<=0||!Number.isFinite(l.rate)||l.rate<0)||!Number.isFinite(details.advance)||details.advance<0))fail(400,'invalid_estimate');
 const snapshot=get(`SELECT a.ip_no,a.financial_category,a.admitted_at,a.discharged_at,p.name patient_name,p.uhid,p.age_years,p.gender,w.name ward_name,b.bed_no,u.name consultant_name FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id LEFT JOIN users u ON u.id=a.consultant_id WHERE a.id=?`,a.id);
 details.patient_snapshot=snapshot;
 const id=insert('admission_forms',{admission_id:a.id,form_type,details_json:JSON.stringify(details),created_by:req.user.id,created_at:nowIso()});
 // what reception confirms on the form is recorded once, so later forms and the discharge fill themselves
 const t=(v)=>String(v||'').trim().slice(0,120);
 const attPatch={};
 if(t(details.attendant)&&!a.attendant_name&&t(details.relation).toLowerCase()!=='self')attPatch.attendant_name=t(details.attendant);
 if(t(details.relation)&&!a.attendant_relation&&t(details.relation).toLowerCase()!=='self')attPatch.attendant_relation=t(details.relation);
 if(/^[0-9+\- ]{8,15}$/.test(t(details.mobile))&&!a.attendant_mobile&&t(details.relation).toLowerCase()!=='self')attPatch.attendant_mobile=t(details.mobile);
 if(Object.keys(attPatch).length)update('admissions',a.id,attPatch);
 const pt=get('SELECT id,kin_name,kin_relation,kin_mobile FROM patients WHERE id=?',a.patient_id);
 const kinPatch=pt&&!pt.kin_name&&attPatch.attendant_name?{kin_name:attPatch.attendant_name,...(attPatch.attendant_relation?{kin_relation:attPatch.attendant_relation}:{}),...(attPatch.attendant_mobile?{kin_mobile:attPatch.attendant_mobile}:{})}:{};
 if(Object.keys(kinPatch).length)update('patients',pt.id,kinPatch);
 emit(req,{topics:TOPICS,event:'admission.updated',data:{id:a.id},action:'admission.form.saved',entity:'admission_forms',entityId:id,detail:{before:{attendant_name:a.attendant_name,attendant_relation:a.attendant_relation,attendant_mobile:a.attendant_mobile,kin:pt&&{kin_name:pt.kin_name,kin_relation:pt.kin_relation,kin_mobile:pt.kin_mobile}},after:{form_type,details,recorded_on_admission:attPatch,recorded_as_kin:kinPatch},reason:'Reception form saved for physical printing'}});
 return {id,details};
}));
ipd.get('/admissions/:id/print-pack', requirePerm('ipd.view'), h(req=>{
  if(!can(req.user,'billing.view'))fail(403,'forbidden');
  const a=get(`SELECT a.*,p.name patient_name,p.uhid,p.age_years,p.gender,p.mobile,u.name consultant_name,b.bed_no,w.name ward_name FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id WHERE a.id=?`,+req.params.id)||fail(404,'admission_not_found');
  a.claim=get('SELECT claim_no,tpa,status,approved,payer_type FROM insurance_claims WHERE admission_id=? ORDER BY id DESC LIMIT 1',a.id)||null;
  if(a.status!=='discharged')accrueAdmission(a.id);
  const er=a.emergency_id?get('SELECT encounter_id FROM emergency_cases WHERE id=?',a.emergency_id)?.encounter_id:-1;
  const bills=all("SELECT * FROM bills WHERE encounter_id IN (?,?) AND status<>'cancelled' ORDER BY created_at,id",a.encounter_id,er||-1);
  for(const b of bills){b.items=all('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id',b.id);b.receipts=all('SELECT receipt_no,pay_date,created_at,mode,amount FROM payments WHERE bill_id=? AND cancelled=0 ORDER BY id',b.id);}
  const clinical=canReadAdmissionClinical(req.user),released=a.summary_status==='final'&&can(req.user,'ipd.discharge');
  const diagnostics=clinical||released?all(`SELECT id,order_no,label,category,status,verified_at FROM orders WHERE encounter_id IN (?,?) AND status<>'cancelled' ${clinical?'':"AND status IN ('verified','completed')"} ORDER BY id`,a.encounter_id,er||-1):[];
  for(const o of diagnostics){o.results=all('SELECT name,value,unit,ref_range,flag FROM lab_results WHERE order_id=? ORDER BY id',o.id);o.reports=all(`SELECT technique,findings,impression,advice,status,signed_at FROM reports WHERE order_id=? ${clinical?'':"AND status IN ('final','amended')"} ORDER BY id`,o.id);}
  return {admission:{id:a.id,ip_no:a.ip_no,patient_name:a.patient_name,uhid:a.uhid,age_years:a.age_years,gender:a.gender,admitted_at:a.admitted_at,discharged_at:a.discharged_at,consultant_name:a.consultant_name,ward_name:a.ward_name,bed_no:a.bed_no,financial_category:a.financial_category,claim:a.claim,diagnosis:clinical||released?a.diagnosis:null},bills,clinical:clinical||released?{diagnosis:a.diagnosis,summary_status:a.summary_status,summary:a.discharge_summary,summary_json:a.summary_json,diagnostics,consultations:clinical?all('SELECT c.diagnosis,c.plan,c.advice,c.created_at,u.name doctor_name FROM consultations c LEFT JOIN users u ON u.id=c.doctor_id WHERE c.encounter_id IN (?,?) ORDER BY c.id',a.encounter_id,er||-1):[]}:null};
}));

/* ------------------------------------------------------------ bed board */

ipd.get('/beds', requirePerm('ipd.view'), h((req) => {
  const beds = all(
    `SELECT b.*, w.name ward_name, w.code ward_code, w.floor, w.kind ward_kind,
            a.id admission_id, a.ip_no, a.admitted_at, a.status admission_status,
            a.diagnosis, a.financial_category, a.running_total, a.deposit,
            p.id patient_id, p.uhid, p.name patient_name, p.gender, p.age_years, p.blood_group,
            u.name consultant_name,
            cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) los_days
       FROM beds b JOIN wards w ON w.id=b.ward_id
       LEFT JOIN admissions a ON a.bed_id=b.id AND a.status<>'discharged'
       LEFT JOIN patients p ON p.id=a.patient_id
       LEFT JOIN users u ON u.id=a.consultant_id
      ORDER BY w.name, b.bed_no`);
  const wards = {};
  for (let i = 0; i < beds.length; i++) beds[i] = admissionForUser(beds[i], req.user);
  for (const b of beds) {
    wards[b.ward_code] ??= { code: b.ward_code, name: b.ward_name, floor: b.floor, kind: b.ward_kind, beds: [], total: 0, occupied: 0 };
    wards[b.ward_code].beds.push(b);
    wards[b.ward_code].total++;
    if (b.status === 'occupied') wards[b.ward_code].occupied++;
  }
  const totals = get(`SELECT count(*) total, sum(status='occupied') occupied, sum(status='vacant') vacant,
                             sum(status='reserved') reserved, sum(status='cleaning') cleaning FROM beds`);
  return { beds, wards: Object.values(wards), totals, occupancy: totals.total ? Math.round(totals.occupied / totals.total * 100) : 0 };
}));

ipd.patch('/beds/:id', requirePerm('ipd.manage'), h((req) => {
  const before = get('SELECT * FROM beds WHERE id=?', +req.params.id);
  if (!before) fail(404, 'bed_not_found');
  const patch = {};
  if (req.body.status) {
    if (!['vacant', 'cleaning', 'reserved', 'blocked'].includes(req.body.status)) fail(400, 'status_invalid');
    if (before.status === 'occupied') fail(409, 'bed_occupied_use_transfer_or_discharge');
    patch.status = req.body.status;
  }
  // Tariff, class and number are set-up changes: administrators only. A new tariff applies to new bed charges.
  for (const k of ['tariff', 'class', 'bed_no']) if (k in req.body) {
    if (!can(req.user, 'admin.write')) fail(403, 'forbidden', { need: 'admin.write' });
    patch[k] = k === 'tariff' ? money(num(req.body.tariff)) : String(req.body[k]).trim();
  }
  update('beds', before.id, patch);
  const row = get('SELECT * FROM beds WHERE id=?', before.id);
  emit(req, { topics: TOPICS, event: 'bed.updated', data: row,
    action: 'bed.update', entity: 'beds', entityId: row.id, detail: { before, after: patch } });
  return row;
}));

/* ------------------------------------------------------------ ward set-up */

const WARD_KINDS = ['general', 'special', 'private', 'icu', 'nicu', 'maternity', 'ot', 'er', 'daycare'];

/** Housekeeping: beds waiting to be cleaned after a discharge or transfer, oldest first. */
ipd.get('/housekeeping', requireAuth, h((req) => {
  if (!can(req.user, 'beds.clean') && !can(req.user, 'ipd.manage')) fail(403, 'forbidden', { need: 'beds.clean' });
  return all(`SELECT b.id, b.bed_no, b.class, b.status, b.status_at, w.name ward_name, w.floor, w.kind ward_kind,
      (SELECT p.name || ' · ' || a.ip_no FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE a.bed_id=b.id ORDER BY coalesce(a.discharged_at,a.admitted_at) DESC LIMIT 1) last_patient,
      (SELECT max(a.discharged_at) FROM admissions a WHERE a.bed_id=b.id) last_discharge,
      cast((julianday('now','localtime') - julianday(coalesce(b.status_at, (SELECT max(a.discharged_at) FROM admissions a WHERE a.bed_id=b.id)))) * 1440 AS int) waiting_minutes
    FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.status='cleaning' ORDER BY waiting_minutes DESC, w.name, b.bed_no`);
}));

ipd.post('/beds/:id/cleaned', requireAuth, h((req) => {
  if (!can(req.user, 'beds.clean') && !can(req.user, 'ipd.manage')) fail(403, 'forbidden', { need: 'beds.clean' });
  const bed = get('SELECT * FROM beds WHERE id=?', +req.params.id) || fail(404, 'bed_not_found');
  if (bed.status !== 'cleaning') fail(409, 'bed_not_awaiting_cleaning', { status: bed.status });
  update('beds', bed.id, { status: 'vacant' });
  emit(req, { topics: ['ipd', 'dashboard'], event: 'bed.updated', data: { id: bed.id }, action: 'bed.cleaned', entity: 'beds', entityId: bed.id,
    detail: { before: { status: 'cleaning' }, after: { status: 'vacant' }, reason: String(req.body?.note || '').trim() || 'Cleaned and made ready' } });
  return get('SELECT * FROM beds WHERE id=?', bed.id);
}));

ipd.get('/wards', requireAuth, h(() => {
  const wards = all(`SELECT w.*, (SELECT count(*) FROM beds b WHERE b.ward_id=w.id) beds,
      (SELECT count(*) FROM beds b WHERE b.ward_id=w.id AND b.status='occupied') occupied FROM wards w ORDER BY w.kind, w.name`);
  for (const w of wards) w.bed_list = all('SELECT * FROM beds WHERE ward_id=? ORDER BY bed_no', w.id);
  return { wards, kinds: WARD_KINDS };
}));

ipd.post('/wards', requirePerm('admin.write'), h((req) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase(), name = String(b.name || '').trim();
  if (!/^[A-Z0-9-]{2,12}$/.test(code) || !name) fail(400, 'code_and_name_required');
  if (!WARD_KINDS.includes(b.kind)) fail(400, 'ward_kind_invalid');
  if (get('SELECT 1 FROM wards WHERE upper(code)=? OR lower(name)=lower(?)', code, name)) fail(409, 'ward_exists');
  const id = insert('wards', { code, name, floor: b.floor || null, kind: b.kind });
  const count = Math.min(60, Math.max(0, num(b.beds, 0)));
  for (let i = 1; i <= count; i++) insert('beds', { ward_id: id, bed_no: `${code}-${String(i).padStart(2, '0')}`, class: b.class || b.kind, tariff: money(num(b.tariff, 0)), status: 'vacant' });
  emit(req, { topics: TOPICS, event: 'bed.updated', data: { ward_id: id }, action: 'ward.create', entity: 'wards', entityId: id, detail: { after: { code, name, kind: b.kind, beds: count, tariff: b.tariff } } });
  return get('SELECT * FROM wards WHERE id=?', id);
}));

ipd.patch('/wards/:id', requirePerm('admin.write'), h((req) => {
  const w = get('SELECT * FROM wards WHERE id=?', +req.params.id);
  if (!w) fail(404, 'ward_not_found');
  const patch = {};
  for (const k of ['name', 'floor', 'kind']) if (k in req.body) patch[k] = req.body[k];
  if (patch.kind && !WARD_KINDS.includes(patch.kind)) fail(400, 'ward_kind_invalid');
  update('wards', w.id, patch);
  emit(req, { topics: TOPICS, event: 'bed.updated', data: { ward_id: w.id }, action: 'ward.update', entity: 'wards', entityId: w.id, detail: { before: w, after: patch } });
  return get('SELECT * FROM wards WHERE id=?', w.id);
}));

ipd.post('/wards/:id/beds', requirePerm('admin.write'), h((req) => {
  const w = get('SELECT * FROM wards WHERE id=?', +req.params.id);
  if (!w) fail(404, 'ward_not_found');
  const count = Math.min(60, Math.max(1, num(req.body?.count, 1)));
  const existing = all('SELECT bed_no FROM beds WHERE ward_id=?', w.id).map((b) => b.bed_no);
  let n = existing.length, made = 0;
  while (made < count) {
    n++;
    const bed_no = `${w.code}-${String(n).padStart(2, '0')}`;
    if (existing.includes(bed_no)) continue;
    insert('beds', { ward_id: w.id, bed_no, class: req.body?.class || w.kind, tariff: money(num(req.body?.tariff, 0)), status: 'vacant' });
    made++;
  }
  emit(req, { topics: TOPICS, event: 'bed.updated', data: { ward_id: w.id }, action: 'bed.create', entity: 'wards', entityId: w.id, detail: { after: { beds: made, tariff: req.body?.tariff } } });
  return { ok: true, added: made };
}));

ipd.delete('/beds/:id', requirePerm('admin.write'), h((req) => {
  const b = get('SELECT * FROM beds WHERE id=?', +req.params.id);
  if (!b) fail(404, 'bed_not_found');
  if (b.status === 'occupied' || one('SELECT count(*) FROM admissions WHERE bed_id=?', b.id)) fail(409, 'bed_in_use_block_it_instead');
  run('DELETE FROM beds WHERE id=?', b.id);
  emit(req, { topics: TOPICS, event: 'bed.updated', data: { id: b.id }, action: 'bed.delete', entity: 'beds', entityId: b.id, detail: { before: b } });
  return { ok: true };
}));

/* ----------------------------------------------------------- admissions */

ipd.get('/admissions', requireAnyPerm('ipd.view','pharmacy.dispense'), h((req) => {
  accrueAll();
  const extra = [], args = [];
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'active') extra.push("a.status <> 'discharged'");
    else { extra.push('a.status = ?'); args.push(req.query.status); }
  } else extra.push("a.status <> 'discharged'");
  if (req.query.ward_id) { extra.push('w.id = ?'); args.push(+req.query.ward_id); }
  if (req.query.kind) { extra.push('w.kind = ?'); args.push(req.query.kind); }
  if (req.query.q) { extra.push('(p.name LIKE ? OR p.uhid LIKE ? OR a.ip_no LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l); }
  const rows = all(
    `SELECT a.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.blood_group, p.payer_type,
            b.bed_no, b.class bed_class, b.tariff, w.name ward_name, w.kind ward_kind,
            u.name consultant_name,
            cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) los_days,
            (SELECT coalesce(sum(balance),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)) AND bl.status<>'cancelled') balance,
            (SELECT coalesce(sum(total),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)) AND bl.status<>'cancelled') bill_total,
            (SELECT coalesce(sum(paid),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)) AND bl.status<>'cancelled') bill_paid,
            (SELECT id FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)) AND bl.bill_type='IP' AND bl.status<>'cancelled' ORDER BY id DESC LIMIT 1) ip_bill_id,
            (SELECT count(*) FROM allergies al WHERE al.patient_id=p.id) allergy_count,
            (SELECT count(*) FROM med_admin ma WHERE ma.admission_id=a.id AND ma.status='due') meds_due
       FROM admissions a JOIN patients p ON p.id=a.patient_id
       LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
       LEFT JOIN users u ON u.id=a.consultant_id
      WHERE ${extra.join(' AND ')} ORDER BY a.admitted_at DESC LIMIT 300`, ...args);
  return {
    rows: rows.map(row => admissionForUser(row, req.user)),
    counts: {
      total: rows.length,
      icu: rows.filter((r) => ['icu','nicu','picu','hdu'].includes(r.ward_kind)).length,
      discharge_ready: rows.filter((r) => ['discharge_initiated', 'clinically_cleared'].includes(r.status)).length,
      insurance: rows.filter((r) => r.financial_category !== 'self').length,
      avg_los: rows.length ? +(rows.reduce((s, r) => s + r.los_days, 0) / rows.length).toFixed(1) : 0,
    },
  };
}));

ipd.get('/admissions/:id', requirePerm('ipd.view'), h((req) => {
  accrueAdmission(+req.params.id);
  const id = +req.params.id;
  const a = get(
    `SELECT a.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.blood_group,
            b.bed_no, b.class bed_class, b.tariff, w.name ward_name, w.kind ward_kind,
            u.name consultant_name, u.designation consultant_designation
       FROM admissions a JOIN patients p ON p.id=a.patient_id
       LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
       LEFT JOIN users u ON u.id=a.consultant_id WHERE a.id=?`, id);
  if (!a) fail(404, 'admission_not_found');
  a.patient = patientCard(a.patient_id);
  a.notes = all(`SELECT n.*, u.name by_name FROM nursing_notes n LEFT JOIN users u ON u.id=n.recorded_by
                  WHERE n.admission_id=? ORDER BY n.id DESC LIMIT 80`, id);
  a.mar = all(`SELECT m.*, u.name given_by_name FROM med_admin m LEFT JOIN users u ON u.id=m.given_by
                WHERE m.admission_id=? ORDER BY m.due_at`, id);
  a.vitals = all('SELECT * FROM vitals WHERE encounter_id=? ORDER BY recorded_at DESC LIMIT 40', a.encounter_id);
  // orders placed in Emergency before admission belong to the same stay: the ward follows their results
  const erEncForOrders = a.emergency_id ? get('SELECT encounter_id FROM emergency_cases WHERE id=?', a.emergency_id)?.encounter_id : null;
  a.orders = all(`SELECT o.*, u.name ordered_by_name, CASE WHEN o.encounter_id=? THEN 'ER' ELSE NULL END placed_in FROM orders o LEFT JOIN users u ON u.id=o.ordered_by
                   WHERE o.encounter_id IN (?, ?) ORDER BY o.id DESC`, erEncForOrders || -1, a.encounter_id, erEncForOrders || -1);
  a.bills = all('SELECT * FROM bills WHERE encounter_id=? ORDER BY id', a.encounter_id);
  for (const b of a.bills) b.items = all('SELECT * FROM bill_items WHERE bill_id=?', b.id);
  a.payments = all(`SELECT pm.*, u.name received_by_name FROM payments pm LEFT JOIN users u ON u.id=pm.received_by
                     WHERE pm.encounter_id=? AND pm.cancelled=0`, a.encounter_id);
  a.claim = get('SELECT * FROM insurance_claims WHERE admission_id=?', id);
  const erEnc = a.emergency_id ? get('SELECT encounter_id FROM emergency_cases WHERE id=?', a.emergency_id)?.encounter_id : null;
  a.er_bill = erEnc ? get("SELECT id, bill_no, bill_type, total, paid, balance, status, authorization_status FROM bills WHERE encounter_id=? AND bill_type='ER' AND status<>'cancelled'", erEnc) : null;
  a.balance = one(`SELECT coalesce(sum(balance),0) FROM bills WHERE encounter_id IN (?, ?) AND status<>'cancelled'`, a.encounter_id, erEnc || -1) || 0;
  a.charges = chargePlan(id);
  a.ip_bill_id = a.bills.find((b) => b.bill_type === 'IP' && b.status !== 'cancelled')?.id || null;
  // the stay's package (live while admitted, final after discharge)
  const pkgA = get("SELECT * FROM package_assignments WHERE admission_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 1", id);
  a.package_usage = pkgA ? packageUsage(pkgA) : null;
  return admissionForUser(a, req.user);
}));

/* ------------------------------------------------------------ package on a stay */

/** Put a self-pay package on an admission: its price goes on the running IP bill; usage is reconciled at discharge. */
ipd.post('/admissions/:id/package', requireAuth, h((req) => tx(() => {
  if (!can(req.user, 'ipd.manage') && !can(req.user, 'payment.authorize')) fail(403, 'forbidden', { need: 'ipd.manage' });
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id) || fail(404, 'admission_not_found');
  if (a.status === 'discharged') fail(409, 'already_discharged');
  if (get("SELECT 1 FROM insurance_claims WHERE admission_id=? AND status<>'rejected' AND package_id IS NOT NULL", a.id)) fail(409, 'payer_case_has_package');
  const pkg = get('SELECT * FROM packages WHERE id=? AND active=1 AND payer_id IS NULL', num(req.body?.package_id)) || fail(400, 'package_unavailable');
  const bill = ipBill(a);
  const pa = assignPackage(req, { packageId: pkg.id, patientId: a.patient_id, encounterId: a.encounter_id, admissionId: a.id, billId: bill.id, notes: req.body?.notes || null });
  insert('bill_items', { bill_id: bill.id, description: `Package — ${pkg.name}`, category: 'package', revenue_head: 'PACKAGE', qty: 1, rate: pkg.price, amount: pkg.price,
    created_by: req.user.id, created_at: nowIso() });
  update('bills', bill.id, { package_id: pkg.id });
  recalcBill(bill.id);
  emit(req, { topics: [...TOPICS, 'billing', `admission:${a.id}`], event: 'admission.updated', data: { id: a.id }, action: 'package.assign', entity: 'package_assignments', entityId: pa.id,
    detail: { before: null, after: { package: pkg.name, price: pkg.price, ip_no: a.ip_no }, reason: req.body?.notes || 'Package chosen' } });
  return pa;
})));

/* ------------------------------------------------------- discharge summary */

/** Sections of the structured discharge summary, in print order. */
const SUMMARY_SECTIONS = [
  ['complaints', 'Presenting complaints / reason for admission'], ['history', 'Relevant history & examination'],
  ['secondary_dx', 'Other diagnoses / co-morbidities'], ['course', 'Course in hospital'], ['procedures', 'Procedures / surgery'],
  ['investigations', 'Key investigations'], ['treatment', 'Treatment given'], ['condition', 'Condition at discharge'],
  ['medications', 'Medication on discharge'], ['advice', 'Advice — diet, activity, wound care'], ['follow_up', 'Follow-up'],
  ['warning_signs', 'Return to hospital at once if'],
];
const DISCHARGE_TYPES = { routine: 'Routine (on advice)', lama: 'Left against medical advice', referred: 'Referred to another hospital', expired: 'Expired', dama: 'Discharged at request' };

function summaryText(diagnosis, type, sec) {
  const parts = [`FINAL DIAGNOSIS: ${diagnosis || '—'}`, `DISCHARGE TYPE: ${DISCHARGE_TYPES[type] || type || 'Routine'}`];
  for (const [k, label] of SUMMARY_SECTIONS) {
    const v = String(sec[k] || '').trim();
    if (k === 'follow_up' && sec.follow_up_date) parts.push(`${label.toUpperCase()}:\nOn ${sec.follow_up_date}${v ? ` — ${v}` : ''}`);
    else if (v) parts.push(`${label.toUpperCase()}:\n${v}`);
  }
  return parts.join('\n\n');
}

/** What the stay already recorded, offered as a starting point for each section. */
function summaryPrefill(a) {
  const erCase = a.emergency_id ? get('SELECT * FROM emergency_cases WHERE id=?', a.emergency_id) : null;
  const encs = [a.encounter_id, erCase?.encounter_id].filter(Boolean);
  const inEnc = `(${encs.map(() => '?').join(',')})`;
  const lab = all(`SELECT o.id, o.label, date(coalesce(o.verified_at,o.completed_at,o.ordered_at)) d FROM orders o
    WHERE o.encounter_id IN ${inEnc} AND o.category='lab' AND o.status IN ('verified','completed','reported') ORDER BY o.id`, ...encs)
    .map((o) => {
      const res = all('SELECT name, value, unit, flag FROM lab_results WHERE order_id=? ORDER BY id', o.id)
        .map((r) => `${r.name} ${r.value ?? ''}${r.unit ? ` ${r.unit}` : ''}${r.flag ? ` (${r.flag})` : ''}`).join(', ');
      return `${o.d} ${o.label}${res ? `: ${res}` : ''}`;
    });
  const imaging = all(`SELECT o.label, date(coalesce(r.signed_at,r.created_at)) d, r.impression FROM orders o JOIN reports r ON r.order_id=o.id
    WHERE o.encounter_id IN ${inEnc} AND o.category='imaging' ORDER BY o.id`, ...encs).map((r) => `${r.d} ${r.label}: ${r.impression || 'reported'}`);
  const procedures = all(`SELECT b.procedure, date(b.scheduled_at) d, b.anaesthesia, u.name surgeon FROM ot_bookings b LEFT JOIN users u ON u.id=b.surgeon_id
    WHERE b.admission_id=? AND b.status<>'cancelled' ORDER BY b.scheduled_at`, a.id)
    .map((b) => `${b.d} ${b.procedure}${b.surgeon ? ` — ${b.surgeon}` : ''}${b.anaesthesia ? ` (${b.anaesthesia} anaesthesia)` : ''}`);
  const given = all("SELECT drug, dose, route, count(*) n FROM med_admin WHERE admission_id=? AND status='given' GROUP BY drug, dose, route ORDER BY drug", a.id)
    .map((m) => `${m.drug}${m.dose ? ` ${m.dose}` : ''}${m.route ? ` ${m.route}` : ''}`);
  const rx = all(`SELECT i.drug, i.dose, i.route, i.frequency, i.duration_days, i.instructions FROM prescription_items i JOIN prescriptions p ON p.id=i.prescription_id
    WHERE p.encounter_id=? AND p.status<>'cancelled' ORDER BY p.id DESC, i.id`, a.encounter_id)
    .map((i, n) => `${n + 1}. ${i.drug}${i.dose ? ` ${i.dose}` : ''}${i.route ? ` ${i.route}` : ''}${i.frequency ? ` — ${i.frequency}` : ''}${i.duration_days ? ` × ${i.duration_days} days` : ''}${i.instructions ? ` (${i.instructions})` : ''}`);
  const v = get('SELECT * FROM vitals WHERE encounter_id=? ORDER BY recorded_at DESC LIMIT 1', a.encounter_id);
  const vit = v ? [v.bp_sys && `BP ${v.bp_sys}/${v.bp_dia}`, v.pulse && `pulse ${v.pulse}/min`, v.spo2 && `SpO₂ ${v.spo2}%`, v.temp_f && `temp ${v.temp_f}°F`, v.resp_rate && `RR ${v.resp_rate}/min`].filter(Boolean).join(', ') : '';
  return {
    complaints: erCase?.complaint ? `Brought to Emergency: ${erCase.complaint}` : '',
    history: '', secondary_dx: '',
    course: 'Admitted and managed with the treatment below. ',
    procedures: procedures.join('\n'),
    investigations: [...lab, ...imaging].join('\n'),
    treatment: given.join(', '),
    condition: `Stable at discharge${vit ? `; ${vit}` : ''}.`,
    medications: rx.join('\n'),
    advice: '', follow_up: 'Review in OPD with this summary', follow_up_date: '',
    warning_signs: 'Fever, breathlessness, chest pain, bleeding, severe pain, vomiting, or any new worrying symptom.',
  };
}

/** The structured summary (saved, or prefilled from the stay) with the admission it belongs to. */
ipd.get('/admissions/:id/summary', requirePerm('ipd.view'), h((req) => {
  if (!canReadAdmissionClinical(req.user)) fail(403, 'forbidden', { need: 'patient.clinical or nursing.view' });
  const a = get(`SELECT a.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.address, b.bed_no, w.name ward_name,
      u.name consultant_name, u.designation consultant_designation, u.qualification consultant_qualification, u.reg_no consultant_reg_no, s.name summary_by_name
    FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
    LEFT JOIN users u ON u.id=a.consultant_id LEFT JOIN users s ON s.id=a.summary_by WHERE a.id=?`, +req.params.id);
  if (!a) fail(404, 'admission_not_found');
  let saved = null;
  try { saved = a.summary_json ? JSON.parse(a.summary_json) : null; } catch { saved = null; }
  // an older free-text summary is kept as the course in hospital
  if (!saved && a.discharge_summary) saved = { course: a.discharge_summary };
  return {
    admission: Object.assign({}, a, { summary_json: undefined }),
    sections: SUMMARY_SECTIONS, discharge_types: DISCHARGE_TYPES,
    summary: saved, prefill: summaryPrefill(a), status: a.summary_status || (a.discharge_summary ? 'draft' : null),
    can_edit: can(req.user, 'ipd.manage') || can(req.user, 'ipd.order'),
    can_sign: can(req.user, 'consult.write') || can(req.user, 'admin.write'),
  };
}));

/** Save the summary as a draft, or sign it (the treating doctor). A signed summary changes only with an amendment reason. */
ipd.put('/admissions/:id/summary', requireAuth, h((req) => tx(() => {
  if (!canReadAdmissionClinical(req.user)) fail(403, 'forbidden', { need: 'patient.clinical or nursing.view' });
  if (!can(req.user, 'ipd.manage') && !can(req.user, 'ipd.order')) fail(403, 'forbidden', { need: 'ipd.order' });
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id);
  if (!a) fail(404, 'admission_not_found');
  const b = req.body || {};
  const sign = !!b.finalize;
  const canSign = can(req.user, 'consult.write') || can(req.user, 'admin.write');
  if (sign && !canSign) fail(403, 'doctor_must_sign_summary');
  const amend = String(b.amend_reason || '').trim();
  if (a.summary_status === 'final') {
    if (!canSign) fail(403, 'doctor_must_sign_summary');
    if (!amend) fail(409, 'signed_summary_needs_amend_reason');
  }
  const sec = {};
  for (const [k] of SUMMARY_SECTIONS) sec[k] = String(b.sections?.[k] ?? '').slice(0, 8000);
  sec.follow_up_date = /^\d{4}-\d{2}-\d{2}$/.test(b.sections?.follow_up_date || '') ? b.sections.follow_up_date : '';
  const diagnosis = String(b.diagnosis ?? a.diagnosis ?? '').trim();
  const type = DISCHARGE_TYPES[b.discharge_type] ? b.discharge_type : (a.discharge_type || 'routine');
  if (sign && !diagnosis) fail(400, 'final_diagnosis_required');
  if (sign && !sec.course.trim()) fail(400, 'course_in_hospital_required');
  const status = sign || a.summary_status === 'final' ? 'final' : 'draft';
  const patch = { summary_json: JSON.stringify(sec), discharge_summary: summaryText(diagnosis, type, sec), diagnosis, discharge_type: type,
    summary_status: status, summary_by: req.user.id, summary_at: nowIso() };
  update('admissions', a.id, patch);
  const action = a.summary_status === 'final' ? 'ipd.summary.amend' : sign ? 'ipd.summary.sign' : 'ipd.summary.save';
  emit(req, { topics: TOPICS, event: 'admission.updated', data: { id: a.id }, action, entity: 'admissions', entityId: a.id,
    detail: { before: { status: a.summary_status || null, diagnosis: a.diagnosis, discharge_type: a.discharge_type },
      after: { status, diagnosis, discharge_type: type }, reason: amend || (sign ? 'Discharge summary signed' : 'Discharge summary draft saved') } });
  return { ok: true, status, admission_id: a.id };
})));

/** Patients discharged in a period, with their summary — to view, sign late, or reprint. */
ipd.get('/discharges', requirePerm('ipd.view'), h((req) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null;
  const q = String(req.query.q || '').trim();
  const w = ["a.status='discharged'"], args = [];
  if (from) { w.push('date(a.discharged_at) >= ?'); args.push(from); } else w.push("date(a.discharged_at) >= date('now','localtime','-30 day')");
  if (to) { w.push('date(a.discharged_at) <= ?'); args.push(to); }
  if (q) { w.push('(p.name LIKE ? OR p.uhid LIKE ? OR a.ip_no LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  return all(`SELECT a.id, a.ip_no, a.admitted_at, a.discharged_at, a.discharge_type, a.diagnosis, a.summary_status, a.summary_at,
      (coalesce(a.discharge_summary,'')<>'') has_summary, p.uhid, p.name patient_name, p.age_years, p.gender,
      u.name consultant_name, w.name ward_name, bd.bed_no, s.name summary_by_name
    FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id
    LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id LEFT JOIN users s ON s.id=a.summary_by
    WHERE ${w.join(' AND ')} ORDER BY a.discharged_at DESC LIMIT 300`, ...args).map(row => admissionForUser(row, req.user));
}));

ipd.post('/admissions', requirePerm('ipd.admit'), h((req) => {
  const b = req.body || {};
  const patient = get('SELECT * FROM patients WHERE id=?', num(b.patient_id));
  if (!patient) fail(400, 'patient_required');
  const bed = get('SELECT * FROM beds WHERE id=?', num(b.bed_id));
  if (!bed) fail(400, 'bed_required');
  if (bed.status === 'occupied') fail(409, 'bed_occupied');
  // a bed being cleaned, blocked for maintenance or held for someone else is not offered to a new patient
  if (!['vacant', 'reserved'].includes(bed.status)) fail(409, 'bed_unavailable', { status: bed.status });
  const already = get("SELECT ip_no FROM admissions WHERE patient_id=? AND status NOT IN ('discharged','requested')", patient.id);
  if (already) fail(409, 'already_admitted', { ip_no: already.ip_no });
  const er = b.emergency_id ? get('SELECT * FROM emergency_cases WHERE id=?', num(b.emergency_id)) : null;
  return tx(() => {
    const encId = insert('encounters', {
      encounter_no: nextNo('encounter'), patient_id: patient.id, kind: 'IP', visit_type: 'new',
      doctor_id: num(b.consultant_id, null), stage: 'services_pending', payment_status: 'pending',
      created_by: req.user.id,
    });
    const category = b.financial_category === 'scheme' ? 'aarogyasri' : (b.financial_category || patient.payer_type || 'self');
    if (category !== 'self' && (b.payer_id || b.policy_no)) {
      const py = b.payer_id ? get('SELECT * FROM payers WHERE id=?', num(b.payer_id)) : null;
      if (b.payer_id && !py) fail(400, 'payer_not_found');
      update('patients', patient.id, { payer_type: category, payer_id: py?.id ?? patient.payer_id, payer_name: py?.name ?? patient.payer_name,
        policy_no: b.policy_no || patient.policy_no, updated_at: nowIso() });
    }
    const aid = insert('admissions', {
      ip_no: nextNo('ip'), patient_id: patient.id, encounter_id: encId, bed_id: bed.id,
      consultant_id: num(b.consultant_id, null), status: 'admitted',
      diagnosis: b.diagnosis, financial_category: category,
      deposit: 0, created_by: req.user.id, emergency_id: b.emergency_id ? num(b.emergency_id) : null,
      admission_type: ['emergency', 'planned', 'daycare', 'transfer_in'].includes(b.admission_type) ? b.admission_type : (er ? 'emergency' : 'planned'),
      attendant_name: b.attendant_name || patient.kin_name || er?.brought_by || null,
      attendant_relation: b.attendant_relation || patient.kin_relation || null,
      attendant_mobile: b.attendant_mobile || patient.kin_mobile || er?.brought_by_mobile || null,
      // a medico-legal ER case stays medico-legal on the ward
      mlc: b.mlc ? 1 : er?.mlc ? 1 : 0, mlc_no: b.mlc_no || er?.mlc_no || null,
    });
    update('beds', bed.id, { status: 'occupied' });
    const adm = get('SELECT * FROM admissions WHERE id=?', aid);
    const bill = ipBill(adm);
    update('bills', bill.id, { payer_type: category });
    // Charge plan: the bed at its tariff, plus every recurring charge ticked on the admission form.
    startBedCharge(adm, bed.id, adm.admitted_at, req.user.id);
    const picked = Array.isArray(b.charges) ? b.charges : b.charges ? String(b.charges).split(',') : [];
    for (const sid of [...new Set(picked.map(Number).filter(Boolean))]) addCharge(adm, { service_id: sid }, req.user.id);
    accrueAdmission(aid);
    ensurePayerCase(get('SELECT * FROM admissions WHERE id=?', aid));
    if (b.emergency_id) {
      const w = get('SELECT w.name, w.kind FROM wards w WHERE w.id=?', bed.ward_id);
      run("UPDATE emergency_cases SET status='admitted', closed_at=?, disposition=coalesce(disposition, ?) WHERE id=?",
        nowIso(), `Admitted to ${w?.name || 'ward'} · bed ${bed.bed_no}`, num(b.emergency_id));
    }
    const row = get('SELECT * FROM admissions WHERE id=?', aid);
    row.ip_bill_id = bill.id;
    emit(req, {
      topics: [...TOPICS, 'billing', `patient:${patient.id}`], event: 'admission.created', data: row,
      action: 'ipd.admit', entity: 'admissions', entityId: aid,
      detail: { ip_no: row.ip_no, bed: bed.bed_no, uhid: patient.uhid },
    });
    return admissionForUser(row, req.user);
  });
}));

ipd.patch('/admissions/:id/payer', requirePerm('ipd.manage'), h(req => tx(() => {
  const a=get('SELECT * FROM admissions WHERE id=?',+req.params.id) || fail(404,'admission_not_found');
  if(a.status==='discharged')fail(409,'already_discharged');
  const b=req.body || {}, reason=String(b.reason || '').trim();
  if(!reason)fail(400,'reason_required');
  const category=b.financial_category;
  if(!['self','credit','insurance','aarogyasri','corporate','trust'].includes(category))fail(400,'category_invalid');
  const payer=b.payer_id?get('SELECT * FROM payers WHERE id=? AND active=1',num(b.payer_id)):null;
  const normalized=payer?.payer_type==='tpa'?'insurance':payer?.payer_type;
  if(!['self','credit'].includes(category) && (!payer || normalized!==category))fail(400,'payer_category_mismatch');
  if(get("SELECT 1 FROM bill_settlements s JOIN bills bl ON bl.id=s.bill_id WHERE bl.encounter_id=? AND s.status<>'cancelled'",a.encounter_id))fail(409,'existing_settlements_need_review');
  update('patients',a.patient_id,{payer_type:category,payer_id:payer?.id || null,payer_name:payer?.name || null,policy_no:b.policy_no || null});
  update('admissions',a.id,{financial_category:category});
  run("UPDATE bills SET payer_type=? WHERE encounter_id=? AND status<>'cancelled'",category,a.encounter_id);
  for(const bill of all("SELECT id FROM bills WHERE encounter_id=? AND status<>'cancelled'",a.encounter_id))recalcBill(bill.id);
  const c=ensurePayerCase(get('SELECT * FROM admissions WHERE id=?',a.id));
  if(c && payer)update('insurance_claims',c.id,{payer_id:payer.id,tpa:payer.name,policy_no:b.policy_no || null,...(c.payer_id && c.payer_id!==payer.id?{status:'preauth_pending'}:{})});
  if(c && ['self','credit'].includes(category))update('insurance_claims',c.id,{status:'rejected',stage_note:reason});
  emit(req,{topics:[...TOPICS,'insurance','billing','accounts'],event:'admission.updated',action:'ipd.payer.convert',entity:'admissions',entityId:a.id,detail:{before:{financial_category:a.financial_category},after:{financial_category:category,payer_id:payer?.id || null},reason}});
  const updatedAdmission=get('SELECT * FROM admissions WHERE id=?',a.id);
  return admissionForUser({...updatedAdmission,claim_id:payer?c?.id || null:null}, req.user);
})));

ipd.patch('/admissions/:id', requireAuth, h((req) => {
  if (!can(req.user, 'ipd.manage') && !can(req.user, 'ipd.order')) fail(403, 'forbidden', { need: 'ipd.manage' });
  const id = +req.params.id;
  const a = get('SELECT * FROM admissions WHERE id=?', id);
  if (!a) fail(404, 'admission_not_found');
  if (a.status === 'discharged' && 'status' in (req.body || {})) fail(409, 'already_discharged');
  // the treating doctor gives clinical clearance and writes the summary; everything else is the ward's to change
  // clinical clearance is a doctor's decision, never the desk's
  if (req.body?.status === 'clinically_cleared' && !can(req.user, 'ipd.order') && req.user.role !== 'admin') fail(403, 'forbidden', { need: 'ipd.order', hint: 'clinical_clearance_by_doctor' });
  if (!can(req.user, 'ipd.manage')) {
    const keys = Object.keys(req.body || {});
    if (keys.some((k) => !['status', 'discharge_summary', 'diagnosis', 'discharge_type'].includes(k))
        || ('status' in req.body && !['discharge_initiated', 'clinically_cleared'].includes(req.body.status))) fail(403, 'forbidden', { need: 'ipd.manage' });
  }
  const patch = {};
  for (const k of ['status', 'diagnosis', 'financial_category', 'consultant_id', 'discharge_summary', 'discharge_type']) if (k in req.body) patch[k] = req.body[k];
  if (req.body.bed_id && +req.body.bed_id !== a.bed_id) {
    const nb = get('SELECT * FROM beds WHERE id=?', +req.body.bed_id);
    if (!nb || nb.status === 'occupied') fail(409, 'bed_unavailable');
    update('beds', a.bed_id, { status: 'cleaning' });
    update('beds', nb.id, { status: 'occupied' });
    patch.bed_id = nb.id;
    accrueAdmission(a.id);
    const choice = Array.isArray(req.body.stop_charge_ids) || Array.isArray(req.body.start_service_ids)
      ? { stop_charge_ids: req.body.stop_charge_ids || [], start_service_ids: req.body.start_service_ids || [] } : null;
    transferBed(a, nb.id, req.user.id, choice);
  }
  update('admissions', id, patch);
  if ('financial_category' in patch && patch.financial_category !== a.financial_category) {
    run("UPDATE bills SET payer_type=? WHERE encounter_id=? AND bill_type='IP' AND status<>'cancelled'", patch.financial_category, a.encounter_id);
    ensurePayerCase(get('SELECT * FROM admissions WHERE id=?', id));
  }
  const row = get('SELECT * FROM admissions WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'admission.updated', data: row,
    action: 'ipd.update', entity: 'admissions', entityId: id, detail: patch });
  return admissionForUser(row, req.user);
}));

/** Use the unused IP advance to pay the stay's other open bills (e.g. the ER bill) — a refund out of the IP bill and a receipt into each due bill. */
ipd.post('/admissions/:id/apply-advance', requirePerm('payment.collect'), h((req) => tx(() => {
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id) || fail(404, 'admission_not_found');
  const erEnc = a.emergency_id ? get('SELECT encounter_id FROM emergency_cases WHERE id=?', a.emergency_id)?.encounter_id : null;
  const bills = all("SELECT * FROM bills WHERE encounter_id IN (?, ?) AND status<>'cancelled' ORDER BY id", a.encounter_id, erEnc || -1);
  const donor = bills.find((bl) => bl.bill_type === 'IP' && bl.balance < -0.005) || fail(409, 'no_unused_advance');
  let left = money(-donor.balance);
  const moved = [];
  for (const due of bills.filter((bl) => bl.id !== donor.id && bl.balance > 0.005)) {
    const amt = money(Math.min(left, due.balance));
    if (amt <= 0) break;
    refund(req, { bill_id: donor.id, amount: amt, mode: 'cash', reason: `Advance adjusted to ${due.bill_no}`, noCreditNote: true });
    takePayment(req, { bill_id: due.id, amount: amt, mode: 'cash', reference: `ADV ${donor.bill_no}`, remarks: `Adjusted from IP advance on ${donor.bill_no}` });
    moved.push({ bill_no: due.bill_no, amount: amt });
    left = money(left - amt);
  }
  if (!moved.length) fail(409, 'nothing_to_adjust');
  emit(req, { topics: [...TOPICS, 'billing'], event: 'admission.updated', data: { id: a.id }, action: 'ipd.advance_adjusted', entity: 'admissions', entityId: a.id,
    detail: { before: { advance: money(-donor.balance) }, after: { advance: left, adjusted: moved }, reason: 'Unused IP advance applied to the other bills of the stay' } });
  return { adjusted: moved, advance_left: left };
})));

/** Financial clearance then bed release — clinical and financial gates are separate. */
ipd.post('/admissions/:id/discharge', requirePerm('ipd.discharge'), h((req) => {
  const id = +req.params.id;
  const a = get('SELECT * FROM admissions WHERE id=?', id);
  if (!a) fail(404, 'admission_not_found');
  if (a.status === 'discharged') fail(409, 'already_discharged');
  const at = nowIso();
  accrueAdmission(id, at);
  const payerCase = get('SELECT id FROM insurance_claims WHERE admission_id=? ORDER BY id DESC LIMIT 1', id);
  // packages are settled against the final bill: a self-pay package adjusts what it covers; a payer package
  // leaves what it does not cover with the patient before the payer is billed
  const selfPackage = activeAssignment({ admissionId: id });
  if (selfPackage) applyPackage(req, selfPackage, { final: true });
  if (payerCase) markPayerPackageExclusions(payerCase.id);
  const billedToPayer = payerCase ? billCaseToPayer(req, payerCase.id, { includeIp: true }) : [];
  // Dues must be collected, billed to a payer, or approved as due. Overriding needs an administrator and a reason.
  const erEnc = a.emergency_id ? get('SELECT encounter_id FROM emergency_cases WHERE id=?', a.emergency_id)?.encounter_id : null;
  const open = all(`SELECT id, bill_no, balance, authorization_status FROM bills WHERE encounter_id IN (?, ?) AND status<>'cancelled' AND balance > 0.5`, a.encounter_id, erEnc || -1);
  const unapproved = open.filter((bl) => bl.authorization_status !== 'approved');
  const balance = money(open.reduce((s2, bl) => s2 + bl.balance, 0));
  if (unapproved.length) {
    if (!req.body.force) fail(409, 'financial_clearance_pending', { balance, bills: unapproved.map((bl) => bl.bill_no) });
    if (!can(req.user, 'admin.write')) fail(403, 'override_needs_administrator');
    if (!String(req.body.reason || '').trim()) fail(400, 'reason_required');
  }
  return tx(() => {
    endCharges(id, at);
    if (selfPackage) update('package_assignments', selfPackage.id, { status: 'closed', closed_at: at });
    update('admissions', id, {
      status: 'discharged', discharged_at: at,
      discharge_type: req.body.discharge_type || 'routine',
      discharge_summary: req.body.discharge_summary || a.discharge_summary,
    });
    if (a.bed_id) update('beds', a.bed_id, { status: 'cleaning' });
    update('encounters', a.encounter_id, { stage: 'closed', closed_at: nowIso() });
    const row = get('SELECT * FROM admissions WHERE id=?', id);
    emit(req, {
      topics: [...TOPICS, 'billing', `patient:${a.patient_id}`], event: 'admission.discharged', data: row,
      action: 'ipd.discharge', entity: 'admissions', entityId: id,
      detail: { before: { status: a.status }, after: { status: 'discharged', balance_due: balance }, reason: req.body.reason, forced: !!unapproved.length },
    });
    return admissionForUser(row, req.user);
  });
}));

/* ------------------------------------------------------ inpatient charges */

/** Recurring charges the desk can tick at admission (and add later). */
ipd.get('/charge-catalog', requireAuth, h(() => all(
  `SELECT id, code, name, category, price, billing_unit, ipd_default, ward_kinds FROM services
    WHERE active=1 AND (billing_unit IN ('day','hour') OR category IN ('ipd','procedure','other','consultation')) AND category<>'bed'
    ORDER BY billing_unit IN ('day','hour') DESC, ipd_default DESC, name`)));

/** Preview of a bed move: which running charges stop and which of the new ward's charges start. */
ipd.get('/admissions/:id/transfer-plan', requirePerm('ipd.manage'), h((req) => {
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id) || fail(404, 'admission_not_found');
  if (!get('SELECT 1 FROM beds WHERE id=?', num(req.query.bed_id))) fail(400, 'bed_required');
  return wardChargePlan(a, num(req.query.bed_id));
}));

ipd.get('/admissions/:id/charges', requirePerm('ipd.view'), h((req) => {
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id);
  if (!a) fail(404, 'admission_not_found');
  accrueAdmission(a.id);
  const bill = ipBill(a);
  return { plan: chargePlan(a.id), bill: get('SELECT * FROM bills WHERE id=?', bill.id),
    lines: all('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id', bill.id) };
}));

const mayCharge = (u) => can(u, 'ipd.manage') || can(u, 'billing.create');

ipd.post('/admissions/:id/charges', requireAuth, h((req) => {
  if (!mayCharge(req.user)) fail(403, 'forbidden', { need: 'billing.create' });
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id);
  if (!a || a.status === 'discharged') fail(409, 'admission_not_active');
  const b = req.body || {};
  const cid = tx(() => {
    try { return addCharge(a, b, req.user.id); } catch (e) { fail(e.http || 400, e.message); }
  });
  accrueAdmission(a.id);
  const row = get('SELECT * FROM admission_charges WHERE id=?', cid);
  emit(req, { topics: [...TOPICS, 'billing'], event: 'admission.charges', data: { admission_id: a.id },
    action: 'ipd.charge.add', entity: 'admission_charges', entityId: cid, detail: { after: row } });
  return chargePlan(a.id);
}));

ipd.post('/admissions/:id/charges/:cid/stop', requireAuth, h((req) => {
  if (!mayCharge(req.user)) fail(403, 'forbidden', { need: 'billing.create' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const c = get('SELECT * FROM admission_charges WHERE id=? AND admission_id=?', +req.params.cid, +req.params.id);
  if (!c || c.status !== 'active') fail(409, 'charge_not_active');
  accrueAdmission(c.admission_id);
  stopCharge(c.id, reason, req.user.id);
  emit(req, { topics: [...TOPICS, 'billing'], event: 'admission.charges', data: { admission_id: c.admission_id },
    action: 'ipd.charge.stop', entity: 'admission_charges', entityId: c.id,
    detail: { before: { status: c.status }, after: { status: 'stopped' }, reason } });
  return chargePlan(c.admission_id);
}));

ipd.get('/discharge/board', requirePerm('ipd.view'), h((req) => {
  accrueAll();
  const rows = all(
    `SELECT a.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            b.bed_no, w.name ward_name, u.name consultant_name,
            cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) los_days,
            (SELECT coalesce(sum(balance),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id))) balance,
            (SELECT coalesce(sum(total),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)) AND bl.status<>'cancelled') total,
            (SELECT coalesce(sum(balance),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id))
               AND bl.status<>'cancelled' AND bl.balance>0.5 AND bl.authorization_status<>'approved') open_due,
            (SELECT coalesce(-sum(balance),0) FROM bills bl WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id))
               AND bl.status<>'cancelled' AND bl.balance<-0.005) advance,
            (SELECT CASE WHEN count(*)=0 THEN 0 ELSE min(authorization_status='approved') END FROM bills bl
              WHERE bl.encounter_id IN (a.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)) AND bl.status<>'cancelled' AND bl.balance>0.5) due_approved,
            (SELECT count(*) FROM orders o WHERE o.encounter_id=a.encounter_id
               AND o.status NOT IN ('verified','dispensed','cancelled')) pending_orders,
            (SELECT status FROM insurance_claims c WHERE c.admission_id=a.id) claim_status
       FROM admissions a JOIN patients p ON p.id=a.patient_id
       LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
       LEFT JOIN users u ON u.id=a.consultant_id
      WHERE a.status IN ('discharge_initiated','clinically_cleared','financially_cleared')
         OR (a.status='admitted' AND cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) >= 5)
      ORDER BY a.status DESC, a.admitted_at`);
  for (const r of rows) {
    r.checks = {
      clinical: ['clinically_cleared', 'financially_cleared'].includes(r.status),
      orders_closed: r.pending_orders === 0,
      summary: !!r.discharge_summary,
      // judged bill by bill, exactly as the discharge itself is: an advance on the IP bill does not pay the ER bill until it is adjusted
      financial: r.open_due <= 0.5 || isApprovedStage(r.claim_status),
      insurance: ['self', 'credit'].includes(r.financial_category) || isApprovedStage(r.claim_status),
    };
    r.ready = Object.values(r.checks).every(Boolean);
  }
  return { rows: rows.map(row => admissionForUser(row, req.user)), counts: { total: rows.length, ready: rows.filter((r) => r.ready).length } };
}));

/* -------------------------------------------------------------- nursing */

ipd.get('/nursing/board', requireAnyPerm('nursing.view','patient.clinical'), h((req) => {
  const kind = req.query.kind;
  const rows = all(
    `SELECT a.id admission_id, a.ip_no, a.diagnosis, a.admitted_at, a.status,
            p.id patient_id, p.uhid, p.name patient_name, p.gender, p.age_years, p.blood_group,
            b.bed_no, w.name ward_name, w.kind ward_kind, u.name consultant_name,
            (SELECT count(*) FROM med_admin m WHERE m.admission_id=a.id AND m.status='due') meds_due,
            (SELECT count(*) FROM med_admin m WHERE m.admission_id=a.id AND m.status='missed') meds_missed,
            (SELECT count(*) FROM allergies al WHERE al.patient_id=p.id) allergy_count,
            cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) los_days
       FROM admissions a JOIN patients p ON p.id=a.patient_id
       LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
       LEFT JOIN users u ON u.id=a.consultant_id
      WHERE a.status<>'discharged' ${kind ? 'AND w.kind=?' : ''}
      ORDER BY w.name, b.bed_no`, ...(kind ? [kind] : []));
  for (const r of rows) {
    r.vitals = get(`SELECT * FROM vitals WHERE encounter_id=(SELECT encounter_id FROM admissions WHERE id=?)
                     ORDER BY id DESC LIMIT 1`, r.admission_id);
    if (!r.vitals) {
      r.vitals = get(`SELECT v.*, e.kind source_kind FROM vitals v JOIN encounters e ON e.id=v.encounter_id
        WHERE v.patient_id=? AND v.recorded_at >= datetime('now','localtime','-24 hours') ORDER BY v.id DESC LIMIT 1`, r.patient_id);
      if (r.vitals) r.vitals.from_before_admission = r.vitals.source_kind === 'EMG' ? 'Emergency' : 'OPD';
    }
    r.last_note = get('SELECT * FROM nursing_notes WHERE admission_id=? ORDER BY id DESC LIMIT 1', r.admission_id);
  }
  return {
    rows,
    counts: {
      patients: rows.length,
      meds_due: rows.reduce((s, r) => s + r.meds_due, 0),
      meds_missed: rows.reduce((s, r) => s + r.meds_missed, 0),
      critical: rows.filter((r) => ['icu','nicu','picu','hdu'].includes(r.ward_kind)).length,
    },
  };
}));

ipd.post('/nursing/notes', requirePerm('nursing.write'), h((req) => {
  const b = req.body || {};
  const a = get('SELECT * FROM admissions WHERE id=?', num(b.admission_id));
  if (!a) fail(400, 'admission_required');
  if (!String(b.body ?? '').trim() && (b.value === undefined || b.value === null || String(b.value).trim() === '')) fail(400, 'note_required');
  const id = insert('nursing_notes', {
    admission_id: a.id, encounter_id: a.encounter_id, patient_id: a.patient_id,
    kind: b.kind || 'note', body: b.body, value: b.value, shift: b.shift,
    recorded_by: req.user.id,
  });
  const row = get('SELECT * FROM nursing_notes WHERE id=?', id);
  emit(req, { topics: [...TOPICS, `admission:${a.id}`], event: 'nursing.note', data: row,
    action: 'nursing.note', entity: 'nursing_notes', entityId: id, detail: { admission: a.ip_no } });
  return row;
}));

/** Times a frequency is given in a day (24-hour clock). SOS has none — it is given when needed. */
const DOSE_TIMES = {
  '1-0-0': ['08:00'], '0-1-0': ['14:00'], '0-0-1': ['20:00'], '1-0-1': ['08:00', '20:00'], '1-1-0': ['08:00', '14:00'], '0-1-1': ['14:00', '20:00'],
  '1-1-1': ['08:00', '14:00', '20:00'], '1-1-1-1': ['06:00', '12:00', '18:00', '22:00'], 'Every 6 hours': ['00:00', '06:00', '12:00', '18:00'],
  'Every 8 hours': ['06:00', '14:00', '22:00'], 'STAT': ['now'], 'Once a week': ['08:00'], 'Alternate days': ['08:00'],
};

/** The doctor's medication orders for this admission, with what is already on today's drug chart. */
ipd.get('/admissions/:id/med-orders', requirePerm('ipd.view'), h((req) => {
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id) || fail(404, 'admission_not_found');
  return all(`SELECT i.*, p.created_at ordered_at, u.name doctor_name,
      (SELECT count(*) FROM med_admin m WHERE m.prescription_item_id=i.id AND date(m.due_at)=date('now','localtime')) scheduled_today
    FROM prescription_items i JOIN prescriptions p ON p.id=i.prescription_id LEFT JOIN users u ON u.id=p.doctor_id
    WHERE p.encounter_id=? AND p.status<>'cancelled' ORDER BY p.id DESC, i.id`, a.encounter_id)
    .map((i) => Object.assign(i, { times: DOSE_TIMES[i.frequency] || [] }));
}));

/** Put today's doses of the doctor's orders on the drug chart (remaining times only, no duplicates). */
ipd.post('/admissions/:id/mar/from-orders', requirePerm('emar.write'), h((req) => tx(() => {
  const a = get('SELECT * FROM admissions WHERE id=?', +req.params.id) || fail(404, 'admission_not_found');
  if (a.status === 'discharged') fail(409, 'already_discharged');
  const wanted = new Set((req.body?.item_ids || []).map(Number));
  const items = all(`SELECT i.* FROM prescription_items i JOIN prescriptions p ON p.id=i.prescription_id WHERE p.encounter_id=? AND p.status<>'cancelled'`, a.encounter_id)
    .filter((i) => !wanted.size || wanted.has(i.id));
  const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let made = 0;
  for (const i of items) {
    for (const t of DOSE_TIMES[i.frequency] || []) {
      const due = t === 'now' ? `${day} ${nowHM}:00` : `${day} ${t}:00`;
      if (t !== 'now' && t < nowHM.slice(0, 2) + ':00' && t !== '00:00') continue;   // times already past today are not back-filled
      if (get('SELECT 1 FROM med_admin WHERE admission_id=? AND prescription_item_id=? AND due_at=?', a.id, i.id, due)) continue;
      insert('med_admin', { admission_id: a.id, drug: i.drug, dose: i.dose, route: i.route, due_at: due, status: 'due', prescription_item_id: i.id });
      made++;
    }
  }
  emit(req, { topics: [...TOPICS, `admission:${a.id}`], event: 'mar.updated', data: { id: a.id }, action: 'emar.schedule_from_orders', entity: 'admissions', entityId: a.id,
    detail: { before: null, after: { doses: made, orders: items.length }, reason: "Today's doses from the doctor's orders" } });
  return { scheduled: made };
})));

ipd.post('/nursing/mar/:id', requirePerm('emar.write'), h((req) => {
  const id = +req.params.id;
  const m = get('SELECT * FROM med_admin WHERE id=?', id);
  if (!m) fail(404, 'mar_not_found');
  const status = req.body.status || 'given';
  if (!['given', 'held', 'refused', 'missed'].includes(status)) fail(400, 'status_invalid');
  if (m.status !== 'due') fail(409, 'dose_already_recorded', { status: m.status });
  const remarks = String(req.body.remarks || req.body.reason || '').trim() || null;
  if (status !== 'given' && !remarks) fail(400, 'reason_required');
  update('med_admin', id, { status, given_at: nowIso(), given_by: req.user.id, remarks });
  const row = get('SELECT * FROM med_admin WHERE id=?', id);
  emit(req, { topics: [...TOPICS, `admission:${m.admission_id}`], event: 'mar.updated', data: { id },
    action: 'emar.administer', entity: 'med_admin', entityId: id,
    detail: { before: { status: m.status }, after: { status, drug: m.drug, dose: m.dose }, reason: remarks } });
  return row;
}));

ipd.post('/nursing/mar', requirePerm('emar.write'), h((req) => {
  const b = req.body;
  const id = insert('med_admin', {
    admission_id: num(b.admission_id), drug: b.drug, dose: b.dose, route: b.route || 'PO',
    due_at: b.due_at, status: 'due',
  });
  const row = get('SELECT * FROM med_admin WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'mar.updated', data: row,
    action: 'emar.schedule', entity: 'med_admin', entityId: id, detail: b });
  return row;
}));

/* ------------------------------------------------------------------ ICU */

ipd.get('/icu', requireAnyPerm('nursing.view','patient.clinical'), h(() => {
  const rows = all(
    `SELECT a.id admission_id, a.ip_no, a.diagnosis, a.admitted_at,
            p.id patient_id, p.uhid, p.name patient_name, p.gender, p.age_years, p.blood_group,
            b.bed_no, w.name ward_name, u.name consultant_name,
            cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) los_days
       FROM admissions a JOIN patients p ON p.id=a.patient_id
       JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id
       LEFT JOIN users u ON u.id=a.consultant_id
      WHERE w.kind IN ('icu','nicu','picu','hdu') AND a.status<>'discharged' ORDER BY b.bed_no`);
  for (const r of rows) {
    r.vitals = get(`SELECT * FROM vitals WHERE encounter_id=(SELECT encounter_id FROM admissions WHERE id=?)
                     ORDER BY id DESC LIMIT 1`, r.admission_id);
    if (!r.vitals) {
      r.vitals = get(`SELECT v.*, e.kind source_kind FROM vitals v JOIN encounters e ON e.id=v.encounter_id
        WHERE v.patient_id=? AND v.recorded_at >= datetime('now','localtime','-24 hours') ORDER BY v.id DESC LIMIT 1`, r.patient_id);
      if (r.vitals) r.vitals.from_before_admission = r.vitals.source_kind === 'EMG' ? 'Emergency' : 'OPD';
    }
    r.trend = all(`SELECT recorded_at, bp_sys, bp_dia, pulse, spo2, temp_f FROM vitals
                    WHERE encounter_id=(SELECT encounter_id FROM admissions WHERE id=?)
                    ORDER BY id DESC LIMIT 12`, r.admission_id).reverse();
    r.meds_due = one("SELECT count(*) FROM med_admin WHERE admission_id=? AND status='due'", r.admission_id) || 0;
    const v = r.vitals;
    r.alerts = [];
    if (v) {
      // same limits as client ui.js vitalAlerts (OPD, ward, ER)
      if (v.spo2 && v.spo2 < 94) r.alerts.push({ level: v.spo2 < 90 ? 'danger' : 'warn', text: `SpO₂ ${v.spo2}%` });
      if (v.bp_sys && (v.bp_sys < 90 || v.bp_sys >= 140)) r.alerts.push({ level: v.bp_sys < 80 || v.bp_sys >= 180 ? 'danger' : 'warn', text: `BP ${v.bp_sys}/${v.bp_dia ?? '—'}` });
      if (v.pulse && (v.pulse > 100 || v.pulse < 50)) r.alerts.push({ level: v.pulse > 130 || v.pulse < 40 ? 'danger' : 'warn', text: `Pulse ${v.pulse}` });
      if (v.temp_f && (v.temp_f > 100.4 || v.temp_f < 96)) r.alerts.push({ level: v.temp_f >= 104 || v.temp_f < 95 ? 'danger' : 'warn', text: `Temp ${v.temp_f}°F` });
    }
  }
  const beds = get(`SELECT count(*) total, sum(b.status='occupied') occupied FROM beds b
                      JOIN wards w ON w.id=b.ward_id WHERE w.kind IN ('icu','nicu','picu','hdu')`);
  return { rows, beds, occupancy: beds.total ? Math.round(beds.occupied / beds.total * 100) : 0 };
}));

/* ------------------------------------------------------------ emergency */

ipd.get('/emergency', requirePerm('emergency.view'), h((req) => {
  const rows = all(
    `SELECT ec.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile, p.blood_group, p.temporary,
            u.name attending_name,
            cast((julianday(coalesce(ec.closed_at, datetime('now','localtime'))) - julianday(ec.arrived_at)) * 1440 AS int) wait_minutes,
            bl.id bill_id, bl.bill_no, bl.total bill_total, bl.paid bill_paid, bl.balance bill_balance,
            (SELECT a.ip_no || ' · ' || w.name || ' ' || bd.bed_no FROM admissions a LEFT JOIN beds bd ON bd.id=a.bed_id
               LEFT JOIN wards w ON w.id=bd.ward_id WHERE a.emergency_id=ec.id ORDER BY a.id DESC LIMIT 1) admitted_to,
            (SELECT count(*) FROM orders o WHERE o.encounter_id=ec.encounter_id) orders
       FROM emergency_cases ec LEFT JOIN patients p ON p.id=ec.patient_id
       LEFT JOIN users u ON u.id=ec.attending_id
       LEFT JOIN bills bl ON bl.id=(SELECT x.id FROM bills x WHERE x.encounter_id=ec.encounter_id AND x.bill_type='ER' AND x.status<>'cancelled' ORDER BY x.id DESC LIMIT 1)
      WHERE ${req.query.all ? '1=1' : "ec.status NOT IN ('discharged','admitted','referred','lama','death')"}
      ORDER BY ec.triage, ec.arrived_at DESC LIMIT 200`);
  return {
    rows,
    counts: {
      active: rows.filter((r) => !['discharged', 'admitted', 'referred', 'lama', 'death'].includes(r.status)).length,
      red: rows.filter((r) => r.triage === '1').length,
      orange: rows.filter((r) => r.triage === '2').length,
      yellow: rows.filter((r) => r.triage === '3').length,
      green: rows.filter((r) => ['4', '5'].includes(r.triage)).length,
      mlc: rows.filter((r) => r.mlc).length,
      avg_wait: rows.length ? Math.round(rows.reduce((s, r) => s + r.wait_minutes, 0) / rows.length) : 0,
    },
  };
}));

ipd.post('/emergency', requirePerm('emergency.triage'), h((req) => {
  const b = req.body || {};
  if (!String(b.complaint || '').trim()) fail(400, 'complaint_required');
  // an MLC number often arrives later from the police: registration is never held for it (POST /emergency/:id/mlc)
  return tx(() => {
  const caseNo = nextNo('emergency');
  // Care never waits for identity: an unidentified arrival gets a temporary patient record now, so vitals,
  // orders, medicines and charges can start. It is completed, or merged into the real UHID, once known.
  let patientId = b.patient_id ? num(b.patient_id) : null;
  if (!patientId) {
    patientId = insert('patients', {
      uhid: nextNo('uhid'), name: `Unidentified — ${caseNo}`, gender: ['Male', 'Female', 'Other'].includes(b.gender) ? b.gender : 'Other',
      age_years: b.age_years !== undefined && b.age_years !== '' ? num(b.age_years, null) : null,
      notes: [b.unknown_name, 'Temporary record created at the Emergency desk'].filter(Boolean).join(' · '),
      temporary: 1, payer_type: 'self', created_by: req.user.id,
    });
  }
  const encId = insert('encounters', {
    encounter_no: nextNo('encounter'), patient_id: patientId, kind: 'EMG',
    visit_type: 'new', stage: 'registered', payment_status: 'pending',
    priority: 'emergency', doctor_id: b.attending_id || null, created_by: req.user.id,
  });
  // triage vitals taken at the door
  const vit = {};
  for (const k of ['bp_sys', 'bp_dia', 'pulse', 'temp_f', 'spo2', 'resp_rate', 'grbs', 'pain_score']) if (b[k] !== undefined && b[k] !== '') vit[k] = num(b[k], null);
  if (Object.values(vit).some((v) => v !== null)) insert('vitals', { encounter_id: encId, patient_id: patientId, ...vit, notes: b.gcs ? `GCS ${b.gcs}` : 'Triage', recorded_by: req.user.id });
  const id = insert('emergency_cases', {
    case_no: caseNo, patient_id: patientId, encounter_id: encId,
    unknown_name: b.unknown_name, arrival_mode: b.arrival_mode, triage: b.triage || '3',
    complaint: b.complaint, bay: b.bay, status: 'triage',
    mlc: b.mlc ? 1 : 0, mlc_no: b.mlc_no, attending_id: b.attending_id || req.user.id,
    brought_by: b.brought_by || null, brought_by_mobile: b.brought_by_mobile || null, police_station: b.police_station || null,
  });
  const row = get('SELECT * FROM emergency_cases WHERE id=?', id);
  emit(req, { topics: ['emergency', 'dashboard', 'queue'], event: 'emergency.created', data: row,
    action: 'emergency.triage', entity: 'emergency_cases', entityId: id, detail: { before: null, after: row } });
  return row;
  });
}));

/** Record the police MLC number after arrival — triage nurses and doctors both may. */
ipd.post('/emergency/:id/mlc', requireAnyPerm('emergency.triage', 'emergency.treat'), h((req) => {
  const id = +req.params.id;
  const before = get('SELECT mlc, mlc_no FROM emergency_cases WHERE id=?', id);
  if (!before) fail(404, 'case_not_found');
  const mlcNo = String(req.body.mlc_no || '').trim();
  if (!mlcNo) fail(400, 'mlc_number_required');
  update('emergency_cases', id, { mlc: 1, mlc_no: mlcNo });
  const row = get('SELECT * FROM emergency_cases WHERE id=?', id);
  emit(req, { topics: ['emergency', 'dashboard'], event: 'emergency.updated', data: row,
    action: 'emergency.mlc', entity: 'emergency_cases', entityId: id, detail: { before, after: { mlc: 1, mlc_no: mlcNo } } });
  return row;
}));

ipd.patch('/emergency/:id', requirePerm('emergency.treat'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['triage', 'status', 'bay', 'complaint', 'disposition', 'attending_id', 'mlc', 'mlc_no']) if (k in req.body) patch[k] = req.body[k];
  if (patch.status === 'admitted' && !get('SELECT 1 FROM admissions WHERE emergency_id=?', id)) fail(409, 'admit_through_admission');
  if (['discharged', 'admitted', 'referred', 'lama', 'death'].includes(patch.status)) patch.closed_at = nowIso();
  update('emergency_cases', id, patch);
  const row = get('SELECT * FROM emergency_cases WHERE id=?', id);
  emit(req, { topics: ['emergency', 'dashboard'], event: 'emergency.updated', data: row,
    action: 'emergency.update', entity: 'emergency_cases', entityId: id, detail: patch });
  return row;
}));

/* ------------------------------------------------------- emergency billing */

/**
 * ER charges (basic emergency charge, trauma care, dressing, bandaging …) go on
 * the case's own ER bill, entered by ER staff and collected at reception. If
 * the patient is admitted, the ER bill stays separate and is part of the
 * discharge clearance; care is never held for it.
 */
const ER_TOPICS = ['emergency', 'dashboard', 'billing'];
const canErBill = (req) => can(req.user, 'emergency.treat') || can(req.user, 'emergency.triage') || can(req.user, 'billing.create');
const erCase = (id) => get('SELECT * FROM emergency_cases WHERE id=?', id) || fail(404, 'emergency_case_not_found');

function erBill(c, userId, create = true) {
  if (!c.encounter_id) return null;
  let bill = get("SELECT * FROM bills WHERE encounter_id=? AND bill_type='ER' AND status<>'cancelled' ORDER BY id DESC LIMIT 1", c.encounter_id);
  if (!bill && create) {
    const p = get('SELECT payer_type FROM patients WHERE id=?', c.patient_id);
    const id = insert('bills', { bill_no: nextNo('bill'), patient_id: c.patient_id, encounter_id: c.encounter_id, bill_type: 'ER',
      status: 'unpaid', payer_type: p?.payer_type || 'self', source: 'emergency', source_id: c.id, created_by: userId });
    bill = get('SELECT * FROM bills WHERE id=?', id);
  }
  return bill;
}
const erBillView = (bill) => bill && { ...bill, items: all('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id', bill.id) };

ipd.get('/emergency/:id/bill', requirePerm('emergency.view'), h((req) => {
  const c = erCase(+req.params.id);
  return {
    case: c, bill: erBillView(erBill(c, req.user.id, false)),
    services: all("SELECT id, code, name, price, category FROM services WHERE active=1 AND category IN ('emergency','procedure') ORDER BY category='emergency' DESC, name"),
  };
}));

ipd.post('/emergency/:id/charges', requireAuth, h((req) => {
  if (!canErBill(req)) fail(403, 'forbidden', { need: 'emergency.treat' });
  const c = erCase(+req.params.id);
  if (!c.patient_id) fail(409, 'register_patient_first');
  const it = req.body || {};
  const svc = it.service_id ? get('SELECT * FROM services WHERE id=?', num(it.service_id)) : null;
  if (it.service_id && !svc) fail(404, 'service_not_found');
  const description = String(it.description || svc?.name || '').trim();
  if (!description) fail(400, 'description_required');
  const qty = num(it.qty, 1), rate = money(it.rate !== undefined && it.rate !== '' ? num(it.rate) : priceFor(svc, c.patient_id));
  if (!(qty > 0) || rate < 0) fail(400, 'qty_or_rate_invalid');
  return tx(() => {
    const bill = erBill(c, req.user.id);
    const before = { ...bill };
    insert('bill_items', { bill_id: bill.id, service_id: svc?.id || null, description, category: svc?.category === 'procedure' ? 'procedure' : 'emergency',
      qty, rate, gst_pct: svc?.gst_pct || 0, amount: money(qty * rate), created_by: req.user.id, created_at: nowIso() });
    recalcBill(bill.id);
    billNewToPayer(req, [bill.id]);
    const view = erBillView(get('SELECT * FROM bills WHERE id=?', bill.id));
    emit(req, { topics: ER_TOPICS, event: 'bill.updated', data: view, action: 'emergency.charge.add', entity: 'bills', entityId: bill.id,
      detail: { before: { total: before.total }, after: { total: view.total }, item: { description, qty, rate }, case_no: c.case_no } });
    return view;
  });
}));

/** A wrong line can be removed while nothing is paid on the ER bill; after that reception waives it with a reason. */
ipd.delete('/emergency/:id/charges/:itemId', requireAuth, h((req) => {
  if (!canErBill(req)) fail(403, 'forbidden', { need: 'emergency.treat' });
  const c = erCase(+req.params.id);
  const bill = erBill(c, req.user.id, false) || fail(404, 'bill_not_found');
  const item = get('SELECT * FROM bill_items WHERE id=? AND bill_id=?', +req.params.itemId, bill.id) || fail(404, 'item_not_found');
  if (bill.paid > 0.005 || bill.covered_amount > 0.005) fail(409, 'bill_has_collections_use_credit_note');
  const reason = String(req.query.reason || req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  run('DELETE FROM bill_items WHERE id=?', item.id);
  recalcBill(bill.id);
  const view = erBillView(get('SELECT * FROM bills WHERE id=?', bill.id));
  emit(req, { topics: ER_TOPICS, event: 'bill.updated', data: view, action: 'emergency.charge.remove', entity: 'bills', entityId: bill.id,
    detail: { before: { total: bill.total, item: item.description, amount: item.amount }, after: { total: view.total }, reason } });
  return view;
}));

/** An unidentified arrival is matched to a registered patient (UHID) once known. */
/** Clinical and financial tables that point at a patient — moved together when a temporary ER record is merged into the real UHID. */
const PATIENT_TABLES = ['allergies', 'problems', 'encounters', 'vitals', 'consultations', 'orders', 'prescriptions', 'bills', 'payments', 'refunds',
  'insurance_claims', 'admissions', 'nursing_notes', 'ot_bookings', 'maternity_cases', 'emergency_cases', 'appointments', 'certificates',
  'bill_settlements', 'ward_indents', 'ward_replacements', 'patient_messages', 'counselling_sessions', 'procedure_consumptions', 'package_assignments'];

ipd.post('/emergency/:id/link-patient', requirePerm('emergency.triage'), h((req) => {
  const c = erCase(+req.params.id);
  const temp = c.patient_id ? get('SELECT * FROM patients WHERE id=?', c.patient_id) : null;
  // the patient has never been here: the temporary record simply becomes theirs
  if (temp?.temporary && req.body?.details) {
    const d = req.body.details;
    if (!String(d.name || '').trim() || !d.gender) fail(400, 'name_and_gender_required');
    return tx(() => {
      const patch = { temporary: 0, updated_at: nowIso() };
      for (const k of ['name', 'gender', 'age_years', 'age_months', 'mobile', 'address', 'city', 'kin_name', 'kin_relation', 'kin_mobile']) if (d[k] !== undefined && d[k] !== '') patch[k] = typeof d[k] === 'string' ? d[k].trim() : d[k];
      update('patients', temp.id, patch);
      const p = get('SELECT * FROM patients WHERE id=?', temp.id);
      emit(req, { topics: ['emergency', 'dashboard', 'patients'], event: 'emergency.updated', data: { id: c.id }, action: 'emergency.identify', entity: 'patients', entityId: temp.id,
        detail: { before: { name: temp.name, gender: temp.gender, age_years: temp.age_years }, after: { name: p.name, gender: p.gender, age_years: p.age_years, uhid: p.uhid }, reason: `Identified at ${c.case_no}` } });
      return get('SELECT * FROM emergency_cases WHERE id=?', c.id);
    });
  }
  const p = get('SELECT * FROM patients WHERE id=?', num(req.body?.patient_id)) || fail(400, 'patient_required');
  // a returning patient: everything recorded on the temporary record moves to their own UHID
  if (temp?.temporary && temp.id !== p.id) {
    if (p.temporary) fail(409, 'merge_into_a_registered_patient');
    return tx(() => {
      const moved = {};
      for (const t of PATIENT_TABLES) { const r = run(`UPDATE ${t} SET patient_id=? WHERE patient_id=?`, p.id, temp.id); moved[t] = r?.changes ?? null; }
      run("UPDATE journal_lines SET party_id=? WHERE party_type='patient' AND party_id=?", p.id, temp.id);   // the patient's receivable follows them
      update('patients', temp.id, { temporary: 2, merged_into: p.id, name: `${temp.name} (merged into ${p.uhid})`, updated_at: nowIso() });
      emit(req, { topics: ['emergency', 'dashboard', 'patients'], event: 'emergency.updated', data: { id: c.id }, action: 'emergency.merge_patient', entity: 'patients', entityId: temp.id,
        detail: { before: { uhid: temp.uhid, name: temp.name }, after: { uhid: p.uhid, name: p.name, moved }, reason: `Identified at ${c.case_no}: records moved to the existing UHID` } });
      if (moved.counselling_sessions) publish(['counselling', `patient:${temp.id}`, `patient:${p.id}`], 'counselling.updated', { patient_id: p.id });
      return get('SELECT * FROM emergency_cases WHERE id=?', c.id);
    });
  }
  if (c.patient_id && c.patient_id !== p.id) fail(409, 'case_already_linked');
  return tx(() => {
    const encId = c.encounter_id || insert('encounters', { encounter_no: nextNo('encounter'), patient_id: p.id, kind: 'EMG', visit_type: 'new',
      stage: 'registered', payment_status: 'pending', priority: 'emergency', doctor_id: c.attending_id || null, created_by: req.user.id });
    update('emergency_cases', c.id, { patient_id: p.id, encounter_id: encId });
    const row = get('SELECT * FROM emergency_cases WHERE id=?', c.id);
    emit(req, { topics: ['emergency', 'dashboard'], event: 'emergency.updated', data: row, action: 'emergency.link_patient', entity: 'emergency_cases', entityId: c.id,
      detail: { before: { patient: c.unknown_name || null }, after: { uhid: p.uhid } } });
    return row;
  });
}));

/** Send the patient out of the ER: home, referred, left against advice, or death. Admission goes through Admit. */
ipd.post('/emergency/:id/close', requirePerm('emergency.treat'), h((req) => {
  const c = erCase(+req.params.id);
  const outcome = req.body?.outcome;
  if (!['discharged', 'referred', 'lama', 'death'].includes(outcome)) fail(400, 'outcome_invalid');
  if (['discharged', 'admitted', 'referred', 'lama', 'death'].includes(c.status)) fail(409, 'case_already_closed');
  const note = String(req.body?.note || '').trim();
  if (outcome !== 'discharged' && !note) fail(400, 'reason_required');
  update('emergency_cases', c.id, { status: outcome, disposition: note || 'Discharged home from ER', closed_at: nowIso() });
  if (c.encounter_id) update('encounters', c.encounter_id, { stage: 'closed' });
  const bill = erBill(c, req.user.id, false);
  const row = get('SELECT * FROM emergency_cases WHERE id=?', c.id);
  emit(req, { topics: ['emergency', 'dashboard', 'queue'], event: 'emergency.updated', data: row, action: `emergency.${outcome}`, entity: 'emergency_cases', entityId: c.id,
    detail: { before: { status: c.status }, after: { status: outcome, er_bill_due: bill?.balance || 0 }, reason: note } });
  return { ...row, bill_balance: bill?.balance || 0, bill_id: bill?.id || null };
}));

/* ------------------------------------------------------------------- OT */

ipd.get('/ot', requirePerm('ot.view'), h((req) => {
  const date = req.query.date || today();
  const rows = all(
    `SELECT o.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.blood_group,
            coalesce(s.name, vs.name || ' (visiting)') surgeon_name, coalesce(an.name, va.name || ' (visiting)') anaesthetist_name,
            vs.name visiting_surgeon_name, va.name visiting_anaesthetist_name, a.ip_no, b.bed_no, w.name ward_name
       FROM ot_bookings o LEFT JOIN patients p ON p.id=o.patient_id
       LEFT JOIN visiting_doctors vs ON vs.id=o.visiting_surgeon_id LEFT JOIN visiting_doctors va ON va.id=o.visiting_anaesthetist_id
       LEFT JOIN users s ON s.id=o.surgeon_id LEFT JOIN users an ON an.id=o.anaesthetist_id
       LEFT JOIN admissions a ON a.id=o.admission_id
       LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
      WHERE ${req.query.all ? '1=1' : 'date(o.scheduled_at)=?'} ORDER BY o.scheduled_at`,
    ...(req.query.all ? [] : [date]));
  for (const r of rows) { try { r.checklist = JSON.parse(r.checklist || '{}'); } catch { r.checklist = {}; } }
  return {
    date, rows,
    theatres: [...new Set(rows.map((r) => r.theatre))],
    counts: {
      total: rows.length,
      booked: rows.filter((r) => r.status === 'booked').length,
      in_theatre: rows.filter((r) => r.status === 'in_theatre').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      consent_pending: rows.filter((r) => !r.consent).length,
    },
  };
}));

const visitingId = (v) => { const id = num(v, null); if (id && !get('SELECT 1 FROM visiting_doctors WHERE id=? AND active=1', id)) fail(400, 'visiting_doctor_not_found'); return id || null; };

/** Charge lines picked on an OT case: tariff services and / or described lines (surgeon fee, implant …). */
function otCharges(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((c) => {
    const svc = c.service_id ? get('SELECT * FROM services WHERE id=? AND active=1', num(c.service_id)) : null;
    if (c.service_id && !svc) fail(400, 'service_not_found');
    const description = String(c.description || svc?.name || '').trim();
    const rate = money(c.rate !== undefined && c.rate !== '' && c.rate !== null ? num(c.rate) : svc?.price || 0);
    if (!description || !(rate > 0)) return null;
    const role = ['surgeon', 'anaesthetist'].includes(c.role) ? c.role : svc?.category === 'anaesthesia' ? 'anaesthetist' : svc?.category === 'surgery' ? 'surgeon' : null;
    return { service_id: svc?.id || null, description, rate, qty: Math.max(1, num(c.qty, 1)), ...(role ? { role } : {}) };
  }).filter(Boolean);
}

/** Bill an OT case: on the running IP bill when the patient is admitted, else a bill of its own (day care). */
function billOtCase(req, booking) {
  const lines = JSON.parse(booking.charges || '[]');
  if (!lines.length || booking.billed_at) return null;
  const adm = booking.admission_id ? get("SELECT * FROM admissions WHERE id=? AND status<>'discharged'", booking.admission_id) : null;
  const bill = adm ? ipBill(adm) : get('SELECT * FROM bills WHERE id=?', insert('bills', {
    bill_no: nextNo('bill'), patient_id: booking.patient_id, encounter_id: null, bill_type: 'OP', status: 'unpaid',
    payer_type: get('SELECT payer_type FROM patients WHERE id=?', booking.patient_id)?.payer_type || 'self', source: 'ot', source_id: booking.id, created_by: req.user.id }));
  const visitor = (role) => (role === 'surgeon' ? booking.visiting_surgeon_id : role === 'anaesthetist' ? booking.visiting_anaesthetist_id : null) || null;
  for (const l of lines) insert('bill_items', { bill_id: bill.id, service_id: l.service_id, description: `${l.description} — ${booking.booking_no}`,
    category: 'procedure', qty: l.qty || 1, rate: l.rate, amount: money((l.qty || 1) * l.rate), created_by: req.user.id, created_at: nowIso(),
    visiting_doctor_id: visitor(l.role), visiting_role: visitor(l.role) ? l.role : null });
  recalcBill(bill.id);
  update('ot_bookings', booking.id, { bill_id: bill.id, billed_at: nowIso() });
  return get('SELECT * FROM bills WHERE id=?', bill.id);
}

ipd.post('/ot', requirePerm('ot.schedule'), h((req) => {
  const b = req.body;
  if (!get('SELECT id FROM patients WHERE id=?', num(b.patient_id))) fail(400, 'patient_required');
  if (!String(b.procedure || '').trim() || !b.scheduled_at) fail(400, 'procedure_and_time_required');
  if (!num(b.surgeon_id, null) && !num(b.visiting_surgeon_id, null)) fail(400, 'surgeon_required');
  // an inpatient's surgery belongs to their admission (bill, discharge summary)
  const admissionId = b.admission_id ? num(b.admission_id) : get("SELECT id FROM admissions WHERE patient_id=? AND status NOT IN ('discharged','requested') ORDER BY id DESC LIMIT 1", num(b.patient_id))?.id || null;
  const id = insert('ot_bookings', {
    booking_no: nextNo('ot'), patient_id: num(b.patient_id), admission_id: admissionId, charges: JSON.stringify(otCharges(b.charges)),
    theatre: b.theatre, procedure: b.procedure, surgeon_id: num(b.surgeon_id, null),
    anaesthetist_id: num(b.anaesthetist_id, null), anaesthesia: b.anaesthesia,
    visiting_surgeon_id: visitingId(b.visiting_surgeon_id), visiting_anaesthetist_id: visitingId(b.visiting_anaesthetist_id),
    scheduled_at: b.scheduled_at, duration_min: num(b.duration_min, 60),
    status: 'booked', notes: b.notes, checklist: JSON.stringify(b.checklist || {}),
  });
  const row = get('SELECT * FROM ot_bookings WHERE id=?', id);
  emit(req, { topics: ['ot', 'dashboard'], event: 'ot.created', data: { id },
    action: 'ot.book', entity: 'ot_bookings', entityId: id, detail: { before: null, after: row } });
  return row;
}));

ipd.patch('/ot/:id', requirePerm('ot.schedule'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  const before = get('SELECT * FROM ot_bookings WHERE id=?', id) || fail(404, 'ot_booking_not_found');
  for (const k of ['status', 'theatre', 'scheduled_at', 'duration_min', 'consent', 'notes', 'procedure', 'surgeon_id', 'anaesthetist_id', 'anaesthesia']) if (k in req.body) patch[k] = req.body[k];
  for (const k of ['visiting_surgeon_id', 'visiting_anaesthetist_id']) if (k in req.body) { if (before.billed_at) fail(409, 'ot_case_already_billed'); patch[k] = visitingId(req.body[k]); }
  if (req.body.checklist) patch.checklist = JSON.stringify(req.body.checklist);
  if ('charges' in req.body) { if (before.billed_at) fail(409, 'ot_case_already_billed'); patch.charges = JSON.stringify(otCharges(req.body.charges)); }
  // no knife to skin without signed informed consent (the WHO checklist's first item)
  if (patch.status === 'in_theatre' && !Number(patch.consent ?? before.consent)) fail(409, 'consent_required');
  if (patch.status === 'in_theatre') patch.started_at = nowIso();
  if (patch.status === 'completed') patch.ended_at = nowIso();
  const row = tx(() => {
    update('ot_bookings', id, patch);
    // the surgery is billed when it is completed (charges can be corrected until then)
    const bill = patch.status === 'completed' ? billOtCase(req, get('SELECT * FROM ot_bookings WHERE id=?', id)) : null;
    const r = get('SELECT * FROM ot_bookings WHERE id=?', id);
    emit(req, { topics: ['ot', 'dashboard', ...(bill ? ['billing', 'ipd'] : [])], event: 'ot.updated', data: { id },
      action: bill ? 'ot.complete_billed' : 'ot.update', entity: 'ot_bookings', entityId: id,
      detail: { before: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), after: patch, ...(bill ? { billed_to: bill.bill_no, amount: JSON.parse(r.charges || '[]').reduce((s, l) => s + l.rate * (l.qty || 1), 0) } : {}) } });
    return Object.assign(r, { billed_to: bill?.bill_no || null, nothing_to_bill: patch.status === 'completed' && !bill && !before.billed_at });
  });
  return row;
}));

/* ------------------------------------------------------------- maternity */

ipd.get('/maternity', requirePerm('maternity.view'), h((req) => {
  const rows = all(
    `SELECT mc.*, p.uhid, p.name patient_name, p.age_years, p.mobile, p.blood_group,
            a.ip_no, b.bed_no, w.name ward_name,
            (SELECT count(*) FROM partograph_entries pe WHERE pe.case_id=mc.id) entries,
            (SELECT max(cervix_cm) FROM partograph_entries pe WHERE pe.case_id=mc.id) cervix,
            (SELECT fhr FROM partograph_entries pe WHERE pe.case_id=mc.id ORDER BY pe.id DESC LIMIT 1) fhr
       FROM maternity_cases mc JOIN patients p ON p.id=mc.patient_id
       LEFT JOIN admissions a ON a.id=mc.admission_id
       LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
      ${req.query.stage ? 'WHERE mc.stage=?' : ''} ORDER BY mc.stage, mc.id DESC`,
    ...(req.query.stage ? [req.query.stage] : []));
  return {
    rows,
    counts: {
      total: rows.length,
      labour: rows.filter((r) => ['latent', 'active_labour', 'second_stage'].includes(r.stage)).length,
      antenatal: rows.filter((r) => r.stage === 'antenatal').length,
      postnatal: rows.filter((r) => r.stage === 'postnatal').length,
      high_risk: rows.filter((r) => r.risk === 'high').length,
    },
  };
}));

ipd.post('/maternity', requirePerm('maternity.write'), h((req) => {
  const b = req.body || {};
  const patient = get('SELECT id FROM patients WHERE id=?', num(b.patient_id));
  if (!patient) fail(400, 'patient_required');
  if (!['low', 'moderate', 'high'].includes(b.risk || 'low')) fail(400, 'invalid_risk');
  if (!['antenatal', 'latent', 'active_labour', 'second_stage', 'delivered', 'postnatal'].includes(b.stage || 'antenatal')) fail(400, 'invalid_stage');
  for (const field of ['gravida', 'para', 'abortions', 'living', 'gestation_wks']) {
    if (b[field] !== undefined && b[field] !== '' && (!Number.isFinite(Number(b[field])) || Number(b[field]) < 0)) fail(400, 'invalid_' + field);
  }
  if (Number(b.gestation_wks) > 45) fail(400, 'invalid_gestation_wks');
  const admission = b.admission_id ? get('SELECT * FROM admissions WHERE id=? AND patient_id=?', num(b.admission_id), patient.id) : null;
  if (b.admission_id && !admission) fail(400, 'admission_patient_mismatch');
  const id = insert('maternity_cases', {
    patient_id: patient.id, admission_id: admission?.id || null,
    gravida: num(b.gravida, null), para: num(b.para, null), abortions: num(b.abortions, 0), living: num(b.living, null),
    lmp: b.lmp || null, edd: b.edd || null, gestation_wks: num(b.gestation_wks, null),
    risk: b.risk || 'low', stage: b.stage || 'antenatal', notes: b.notes || null,
  });
  const row = get('SELECT * FROM maternity_cases WHERE id=?', id);
  emit(req, { topics: ['maternity', 'ipd', `patient:${patient.id}`], event: 'maternity.updated', data: row,
    action: 'maternity.create', entity: 'maternity_cases', entityId: id });
  return row;
}));

ipd.get('/maternity/:id', requirePerm('maternity.view'), h((req) => {
  const id = +req.params.id;
  const c = get(`SELECT mc.*, p.uhid, p.name patient_name, p.age_years, p.blood_group, p.mobile
                   FROM maternity_cases mc JOIN patients p ON p.id=mc.patient_id WHERE mc.id=?`, id);
  if (!c) fail(404, 'case_not_found');
  c.entries = all(`SELECT pe.*, u.name by_name FROM partograph_entries pe
                     LEFT JOIN users u ON u.id=pe.recorded_by WHERE pe.case_id=? ORDER BY pe.recorded_at`, id);
  c.patient = patientCard(c.patient_id);
  return c;
}));

ipd.post('/maternity/:id/partograph', requirePerm('maternity.write'), h((req) => {
  const id = +req.params.id;
  const b = req.body;
  const eid = insert('partograph_entries', {
    case_id: id, cervix_cm: num(b.cervix_cm, null), descent: num(b.descent, null),
    contractions_10min: num(b.contractions_10min, null), contraction_strength: b.contraction_strength,
    fhr: num(b.fhr, null), liquor: b.liquor, moulding: b.moulding,
    bp_sys: num(b.bp_sys, null), bp_dia: num(b.bp_dia, null), pulse: num(b.pulse, null),
    temp_f: num(b.temp_f, null), oxytocin: b.oxytocin, drugs: b.drugs, urine: b.urine,
    recorded_by: req.user.id,
  });
  const row = get('SELECT * FROM partograph_entries WHERE id=?', eid);
  emit(req, { topics: ['maternity', `maternity:${id}`], event: 'partograph.entry', data: row,
    action: 'partograph.add', entity: 'partograph_entries', entityId: eid, detail: { case_id: id } });
  return row;
}));

ipd.patch('/maternity/:id', requirePerm('maternity.write'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['stage', 'risk', 'delivery_type', 'delivered_at', 'baby_weight', 'baby_sex', 'apgar1', 'apgar5', 'notes', 'gestation_wks']) if (k in req.body) patch[k] = req.body[k];
  update('maternity_cases', id, patch);
  const row = get('SELECT * FROM maternity_cases WHERE id=?', id);
  emit(req, { topics: ['maternity'], event: 'maternity.updated', data: row,
    action: 'maternity.update', entity: 'maternity_cases', entityId: id, detail: patch });
  return row;
}));
