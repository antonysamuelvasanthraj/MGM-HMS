import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, nextNo, today, where, emit, patientCard, num,
  nowIso,
} from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { collectionPolicy } from '../collection-policy.js';
import { admissionForUser } from '../admission-access.js';
import { billScope } from './billing.js';

/** A payer picked from the master sets the patient's payer name and category; self pay clears it. */
function payerFields(b) {
  const type = b.payer_type || 'self';
  if (type === 'self') return { payer_type: 'self', payer_id: null, payer_name: null };
  const py = b.payer_id ? get('SELECT * FROM payers WHERE id=?', num(b.payer_id)) : null;
  if (b.payer_id && !py) fail(400, 'payer_not_found');
  return { payer_type: type, payer_id: py?.id || null, payer_name: py?.name || b.payer_name || null };
}

export const patients = Router();

patients.get('/', requirePerm('patient.view'), h((req) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(num(req.query.limit, 50), 300);
  const like = `%${q}%`;
  const extra = [];
  const args = [];
  if (q) { extra.push('(uhid LIKE ? OR name LIKE ? OR mobile LIKE ? OR abha LIKE ?)'); args.push(like, like, like, like); }
  if (req.query.gender) { extra.push('gender = ?'); args.push(req.query.gender); }
  if (req.query.payer) { extra.push('payer_type = ?'); args.push(req.query.payer); }
  if (req.query.created === 'today') extra.push(`date(created_at) = date('now','localtime')`);
  const sql = `SELECT p.*,
      (SELECT max(visit_date) FROM encounters e WHERE e.patient_id=p.id) AS last_visit,
      (SELECT count(*) FROM encounters e WHERE e.patient_id=p.id) AS visit_count,
      (SELECT coalesce(sum(balance),0) FROM bills b WHERE b.patient_id=p.id AND b.status IN ('unpaid','partial')) AS outstanding,
      (SELECT count(*) FROM allergies a WHERE a.patient_id=p.id) AS allergy_count
    FROM patients p ${extra.length ? 'WHERE ' + extra.join(' AND ') : ''}
    ORDER BY ${q ? 'p.name' : 'p.id DESC'} LIMIT ?`;
  return { rows: all(sql, ...args, limit), total: one(`SELECT count(*) FROM patients p ${extra.length ? 'WHERE ' + extra.join(' AND ') : ''}`, ...args) };
}));

patients.get('/stats', requirePerm('patient.view'), h(() => ({
  total: one('SELECT count(*) FROM patients') || 0,
  today: one(`SELECT count(*) FROM patients WHERE date(created_at)=date('now','localtime')`) || 0,
  month: one(`SELECT count(*) FROM patients WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`) || 0,
  insured: one("SELECT count(*) FROM patients WHERE payer_type<>'self'") || 0,
  with_abha: one('SELECT count(*) FROM patients WHERE abha IS NOT NULL') || 0,
})));

patients.get('/:id/billing-context', requirePerm('patient.view'), h((req) => {
 const p=patientCard(+req.params.id);if(!p)fail(404,'patient_not_found');
 const a=get("SELECT id,ip_no,encounter_id,financial_category FROM admissions WHERE patient_id=? AND status<>'discharged' ORDER BY id DESC LIMIT 1",p.id);
 const e=req.query.encounter_id?get('SELECT id,kind,encounter_no FROM encounters WHERE id=? AND patient_id=?',+req.query.encounter_id,p.id):a?get('SELECT id,kind,encounter_no FROM encounters WHERE id=?',a.encounter_id):get("SELECT id,kind,encounter_no FROM encounters WHERE patient_id=? AND date(visit_date)=date('now','localtime') AND stage<>'cancelled' ORDER BY id DESC LIMIT 1",p.id);
 if(req.query.encounter_id&&!e)fail(404,'visit_not_found');
 const c=req.query.encounter_id?e:a||e||p,claim=e?get("SELECT payer_type,payer_id FROM insurance_claims WHERE patient_id=? AND encounter_id=? AND status<>'rejected' ORDER BY id DESC LIMIT 1",p.id,e.id):null;
 const py=(claim?.payer_id||p.payer_id)?get('SELECT name FROM payers WHERE id=?',claim?.payer_id||p.payer_id):null;
 const bills=all("SELECT * FROM bills WHERE patient_id=? AND status<>'cancelled'",p.id).map(b=>({...b,...collectionPolicy(b)}));
 const summary={billed:0,patient_due:0,payer_due:0,patient_received:0,payer_received:0,waived:0};
 for(const b of bills){summary.billed+=b.total;summary.patient_due+=b.patient_due;summary.payer_due+=b.payer_pending+b.payer_receivable;summary.patient_received+=b.paid;summary.waived+=b.waived_amount;}
 summary.payer_received=one("SELECT coalesce(sum(s.settled_amount),0) FROM bill_settlements s JOIN bills b ON b.id=s.bill_id WHERE b.patient_id=? AND b.status<>'cancelled' AND s.status<>'cancelled' AND s.mode NOT IN ('free','due')",p.id)||0;
 const currentClaim=e?get("SELECT c.id,c.status approval_status,pk.name package_name FROM insurance_claims c LEFT JOIN packages pk ON pk.id=c.package_id WHERE c.patient_id=? AND c.encounter_id=? AND c.status<>'rejected' ORDER BY c.id DESC LIMIT 1",p.id,e.id):null;
 const assigned=e?get("SELECT pk.name package_name FROM package_assignments pa JOIN packages pk ON pk.id=pa.package_id WHERE pa.encounter_id=? AND pa.status='active' ORDER BY pa.id DESC LIMIT 1",e.id):null;
 const result={patient_id:p.id,care_type:c===a?'IP':e?.kind||'NONE',visit_no:c===a?a.ip_no:e?.encounter_no||null,payer_type:claim?.payer_type||(c===a?a.financial_category:null)||p.payer_type||'self',payer_name:py?.name||p.payer_name||null,outstanding:p.outstanding||0,...summary,package_name:currentClaim?.package_name||assigned?.package_name||null,approval_status:currentClaim?.approval_status||'not_applicable',treatment_status:e?get('SELECT stage FROM encounters WHERE id=?',e.id)?.stage:'no_active_visit'}; if(billScope(req.user)===null)for(const key of [...Object.keys(summary),'outstanding'])delete result[key];return result;
}));

patients.get('/:id', requirePerm('patient.view'), h((req) => {
  const p = patientCard(+req.params.id);
  if (!p) fail(404, 'patient_not_found');
  return p;
}));

patients.get('/:id/timeline', requirePerm('patient.view'), h((req) => {
  const id = +req.params.id;
  const patient = patientCard(id);
  if (!patient) fail(404,'patient_not_found');
  const scope=billScope(req.user), clinical=can(req.user,'patient.clinical');
  const access={counselling:can(req.user,'counsel.view')||can(req.user,'counsel.write')||can(req.user,'counsel.review'),clinical,financial:scope!==null,orders:can(req.user,'order.view')||can(req.user,'lab.view')||can(req.user,'imaging.view'),prescriptions:clinical||can(req.user,'pharmacy.view')||can(req.user,'op.register'),vitals:clinical||can(req.user,'vitals.view')||can(req.user,'vitals.record'),admissions:can(req.user,'ipd.view')||can(req.user,'pharmacy.dispense'),certificates:can(req.user,'certificate.view'),claims:can(req.user,'insurance.view')};
  const encounters = all(
    `SELECT e.*, u.name AS doctor_name, d.name AS dept_name,
            (SELECT diagnosis FROM consultations c WHERE c.encounter_id=e.id ORDER BY c.id DESC LIMIT 1) AS diagnosis
       FROM encounters e LEFT JOIN users u ON u.id=e.doctor_id
       LEFT JOIN departments d ON d.id=e.department_id
      WHERE e.patient_id=? ORDER BY e.opened_at DESC LIMIT 100`, id);
  const result = {
    patient,
    ward_replacements:clinical||can(req.user,'pharmacy.view')?all(`SELECT r.id,r.replacement_no,r.location,r.status,r.recorded_at,
      (SELECT group_concat(m.name||' / batch '||b.batch_no||' / expiry '||b.expiry||' / used '||u.qty,'; ') FROM ward_replacement_usage u JOIN medicine_batches b ON b.id=u.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE u.replacement_id=r.id) used,
      (SELECT group_concat(bl.bill_no||' / batch '||b.batch_no||' / expiry '||b.expiry||' / supplied '||s.qty||' / received '||s.received_qty,'; ') FROM ward_replacement_supply s JOIN bill_items i ON i.id=s.bill_item_id JOIN bills bl ON bl.id=i.bill_id JOIN medicine_batches b ON b.id=i.batch_id WHERE s.replacement_id=r.id) replacement
      FROM ward_replacements r WHERE r.patient_id=? ORDER BY r.id DESC`,id):[],
    encounters,
    admissions: all(`SELECT a.*, b.bed_no, w.name ward_name, u.name consultant
                       FROM admissions a LEFT JOIN beds b ON b.id=a.bed_id
                       LEFT JOIN wards w ON w.id=b.ward_id LEFT JOIN users u ON u.id=a.consultant_id
                      WHERE a.patient_id=? ORDER BY a.admitted_at DESC`, id),
    bills: all(`SELECT * FROM bills WHERE patient_id=? ORDER BY id DESC LIMIT 60`, id).map(b => ({...b,...collectionPolicy(b)})),
    payments: all(`SELECT p.*, u.name AS received_by_name FROM payments p LEFT JOIN users u ON u.id=p.received_by
                    WHERE p.patient_id=? ORDER BY p.id DESC LIMIT 60`, id),
    orders: all(`SELECT o.*, u.name AS ordered_by_name FROM orders o LEFT JOIN users u ON u.id=o.ordered_by
                  WHERE o.patient_id=? ORDER BY o.id DESC LIMIT 80`, id),
    consultations: all(`SELECT c.*, u.name AS doctor_name FROM consultations c LEFT JOIN users u ON u.id=c.doctor_id
                         WHERE c.patient_id=? ORDER BY c.id DESC LIMIT 40`, id),
    prescriptions: all(`SELECT r.*, u.name AS doctor_name,
                          (SELECT count(*) FROM prescription_items i WHERE i.prescription_id=r.id) AS item_count
                          FROM prescriptions r LEFT JOIN users u ON u.id=r.doctor_id
                         WHERE r.patient_id=? ORDER BY r.id DESC LIMIT 40`, id),
    vitals: all(`SELECT * FROM vitals WHERE patient_id=? ORDER BY recorded_at DESC LIMIT 40`, id),
    certificates: all('SELECT * FROM certificates WHERE patient_id=? ORDER BY id DESC', id),
    claims: all('SELECT * FROM insurance_claims WHERE patient_id=? ORDER BY id DESC', id),
    counselling: can(req.user, 'counsel.view') || can(req.user, 'counsel.write') || can(req.user, 'counsel.review')
      ? all(`SELECT c.id, c.session_no, c.topic, c.status, c.consent_given, c.consent_by, c.consent_relation, c.created_at, c.summary_json, c.reviewed_at, c.amended,
          c.recording_path IS NOT NULL has_recording, d.name doctor_name, r.name reviewed_by_name FROM counselling_sessions c LEFT JOIN users d ON d.id=c.doctor_id
          LEFT JOIN users r ON r.id=c.reviewed_by WHERE c.patient_id=? ORDER BY c.id DESC`, id) : [],
  };
  result.access=access;
  if(!clinical){result.consultations=[];for(const encounter of encounters)delete encounter.diagnosis;}
  if(!access.financial){result.bills=[];result.payments=[];delete result.patient.outstanding;}
  else if(scope){
    const allowed=new Set(all(`SELECT b.id FROM bills b WHERE b.patient_id=? AND (${scope})`,id).map(b=>b.id));
    result.bills=result.bills.filter(b=>allowed.has(b.id));result.payments=result.payments.filter(p=>allowed.has(p.bill_id));
  }
  if(!access.orders)result.orders=[];
  else if(!can(req.user,'order.view'))result.orders=result.orders.filter(o=>(o.category==='lab'&&can(req.user,'lab.view'))||(o.category==='imaging'&&can(req.user,'imaging.view')));
  if(!access.prescriptions)result.prescriptions=[];
  if(!access.vitals)result.vitals=[];
  if(!access.admissions)result.admissions=[];
  else result.admissions=result.admissions.map(admission => admissionForUser(admission, req.user));
  if(!access.certificates)result.certificates=[];
  if(!access.claims)result.claims=[];
  return result;
}));

/** Duplicate guard — reception must reuse a UHID rather than mint a new one. */
patients.get('/check/duplicate', requirePerm('patient.view'), h((req) => {
  const { name = '', mobile = '', age } = req.query;
  const rows = all(
    `SELECT id, uhid, name, gender, age_years, mobile, city,
            (SELECT max(visit_date) FROM encounters e WHERE e.patient_id=patients.id) last_visit
       FROM patients
      WHERE (mobile <> '' AND mobile = ?) OR (name LIKE ? AND abs(coalesce(age_years,0) - ?) <= 3)
      LIMIT 10`, mobile, `%${name}%`, num(age, 0));
  return { matches: rows };
}));

patients.post('/', requirePerm('patient.create'), h((req) => {
  const b = req.body || {};
  if (!b.name) fail(400, 'name_required');
  if (!b.gender) fail(400, 'gender_required');
  const uhid = b.uhid || nextNo('uhid');
  const id = insert('patients', {
    uhid, title: b.title, name: b.name.trim(), gender: b.gender,
    dob: b.dob || null, age_years: num(b.age_years, null), age_months: num(b.age_months, 0),
    mobile: b.mobile, alt_mobile: b.alt_mobile, email: b.email,
    blood_group: b.blood_group, marital: b.marital, occupation: b.occupation,
    address: b.address, city: b.city || 'Hyderabad', district: b.district,
    state: b.state || 'Telangana', pincode: b.pincode,
    aadhaar_last4: b.aadhaar_last4, abha: b.abha,
    kin_name: b.kin_name, kin_relation: b.kin_relation, kin_mobile: b.kin_mobile,
    ...payerFields(b), policy_no: b.policy_no,
    vip: b.vip ? 1 : 0, notes: b.notes,
    created_by: req.user.id,
  });
  if (Array.isArray(b.allergies)) {
    for (const a of b.allergies) insert('allergies', {
      patient_id: id, substance: a.substance, reaction: a.reaction,
      severity: a.severity || 'moderate', recorded_by: req.user.id,
    });
  }
  const p = patientCard(id);
  emit(req, {
    topics: ['patients'], event: 'patient.created', data: p,
    action: 'patient.create', entity: 'patients', entityId: id, detail: { uhid, name: p.name },
  });
  return p;
}));

patients.patch('/:id', requirePerm('patient.edit'), h((req) => {
  const id = +req.params.id;
  const allowed = ['title', 'name', 'gender', 'dob', 'age_years', 'age_months', 'mobile', 'alt_mobile',
    'email', 'blood_group', 'marital', 'occupation', 'address', 'city', 'district', 'state',
    'pincode', 'aadhaar_last4', 'abha', 'kin_name', 'kin_relation', 'kin_mobile',
    'payer_type', 'payer_name', 'policy_no', 'vip', 'notes'];
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  if ('payer_id' in (req.body || {}) || 'payer_type' in (req.body || {})) {
    const current = get('SELECT payer_type, payer_name, payer_id FROM patients WHERE id=?', id);
    Object.assign(patch, payerFields(Object.assign({}, current, req.body)));
  }
  const old = get('SELECT * FROM patients WHERE id=?', id);
  if (!old) fail(404, 'patient_not_found');
  // a temporary ER record given its real name is no longer temporary
  if (old.temporary === 1 && patch.name && !/^Unidentified/i.test(String(patch.name))) patch.temporary = 0;
  patch.updated_at = nowIso();
  update('patients', id, patch);
  const p = patientCard(id);
  const changed = Object.keys(patch).filter((k) => k !== 'updated_at' && String(old[k] ?? '') !== String(patch[k] ?? ''));
  emit(req, {
    topics: ['patients', `patient:${id}`], event: 'patient.updated', data: { id },
    action: 'patient.update', entity: 'patients', entityId: id,
    detail: { before: Object.fromEntries(changed.map((k) => [k, old[k]])), after: Object.fromEntries(changed.map((k) => [k, patch[k]])), reason: req.body?.reason || 'Patient details updated' },
  });
  return p;
}));

patients.post('/:id/allergies', requirePerm('patient.clinical'), h((req) => {
  const id = +req.params.id;
  const b = req.body || {};
  if (!b.substance) fail(400, 'substance_required');
  insert('allergies', {
    patient_id: id, substance: b.substance, reaction: b.reaction,
    severity: b.severity || 'moderate', recorded_by: req.user.id,
  });
  const p = patientCard(id);
  emit(req, {
    topics: ['patients', `patient:${id}`], event: 'patient.updated', data: p,
    action: 'allergy.add', entity: 'allergies', entityId: id, detail: b,
  });
  return p;
}));

patients.delete('/:id/allergies/:aid', requirePerm('patient.clinical'), h((req) => {
  const id = +req.params.id;
  get('DELETE FROM allergies WHERE id=? AND patient_id=?', +req.params.aid, id);
  const p = patientCard(id);
  emit(req, { topics: ['patients', `patient:${id}`], event: 'patient.updated', data: p,
    action: 'allergy.remove', entity: 'allergies', entityId: +req.params.aid });
  return p;
}));

patients.post('/:id/problems', requirePerm('patient.clinical'), h((req) => {
  const id = +req.params.id;
  insert('problems', {
    patient_id: id, label: req.body.label, code: req.body.code,
    status: req.body.status || 'active', onset: req.body.onset,
  });
  const p = patientCard(id);
  emit(req, { topics: [`patient:${id}`], event: 'patient.updated', data: p,
    action: 'problem.add', entity: 'problems', entityId: id, detail: req.body });
  return p;
}));
