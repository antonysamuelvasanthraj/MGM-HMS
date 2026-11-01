/**
 * Payer-case statements (TPA claim statement and patient-payable statement) and paper clinical
 * documents (nursing, ICU, OT, consent, transfer, discharge) recorded against the patient.
 */
import { Router } from 'express';
import { h, fail, all, get, insert, emit, num, tx, nowIso, setting } from '../lib.js';
import { requireAuth, can } from '../auth.js';
import { policyShare } from '../payer-policy.js';
import { currentMode } from '../operating-mode.js';

export const casedocs = Router();

/* ------------------------------------------------------------ payer case statements */

casedocs.get('/insurance/claims/:id/statement', requireAuth, h((req) => {
  if (!can(req.user, 'insurance.view') && !can(req.user, 'billing.view')) fail(403, 'forbidden');
  const c = get(`SELECT c.*, p.name patient_name, p.uhid, p.gender, p.age_years, a.ip_no, a.admitted_at, a.discharged_at
    FROM insurance_claims c JOIN patients p ON p.id=c.patient_id LEFT JOIN admissions a ON a.id=c.admission_id WHERE c.id=?`, +req.params.id) || fail(404, 'claim_not_found');
  const share = policyShare(c);
  const received = get("SELECT coalesce(sum(settled_amount),0) v FROM bill_settlements WHERE claim_id=? AND status<>'cancelled'", c.id).v;
  const patientPaid = get("SELECT coalesce(sum(b.paid),0) v FROM bills b WHERE b.claim_id=? AND b.status<>'cancelled'", c.id).v;
  return { claim: c, share, payer_received: received, patient_paid: patientPaid, patient_balance: Math.max(0, Math.round((share.patient_total - patientPaid) * 100) / 100),
    hospital: { name: setting('hospital_name') || '', address: setting('address') || '', phone: setting('phone') || '', gstin: setting('gstin') || '' } };
}));

/* ------------------------------------------------------------ paper clinical documents */

export const FORMS = {
  consultation_sheet: ['Doctor', 'OP / IP consultation sheet'], prescription: ['Doctor', 'Prescription (paper)'],
  nursing_assessment: ['Nursing', 'Nursing admission assessment'], vitals_chart: ['Nursing', 'Vitals / TPR chart'], mar: ['Nursing', 'Medication administration record'],
  intake_output: ['Nursing', 'Intake / output chart'], icu_flow: ['ICU', 'ICU flow sheet'], ventilator_chart: ['ICU', 'Ventilator chart'],
  ot_checklist: ['OT', 'WHO surgical safety checklist'], anaesthesia_record: ['OT', 'Anaesthesia record'], operation_notes: ['OT', 'Operation notes'],
  consent: ['Consent', 'Signed consent form'], transfer_note: ['Ward', 'Transfer note'], discharge_summary: ['Doctor', 'Discharge summary (paper)'], other: ['Other', 'Other document'],
};
const canDocs = (u) => can(u, 'patient.clinical') || can(u, 'nursing.write') || can(u, 'ipd.manage');

casedocs.get('/clinical-documents/forms', requireAuth, h(() => ({ mode: currentMode(), forms: Object.entries(FORMS).map(([key, [area, title]]) => ({ key, area, title })) })));

casedocs.get('/patients/:id/clinical-documents', requireAuth, h((req) => {
  if (!canDocs(req.user) && !can(req.user, 'patient.view')) fail(403, 'forbidden');
  return all(`SELECT d.*, u.name recorded_by_name, a.ip_no FROM clinical_documents d LEFT JOIN users u ON u.id=d.recorded_by
    LEFT JOIN admissions a ON a.id=d.admission_id WHERE d.patient_id=? ORDER BY d.id DESC`, +req.params.id);
}));

/**
 * Record a paper document (the scan is attached to it afterwards). In Paperless mode this is the
 * downtime / legacy exception and needs its reason; Paper and Hybrid mode use it routinely.
 */
casedocs.post('/clinical-documents', requireAuth, h((req) => {
  if (!canDocs(req.user)) fail(403, 'forbidden');
  const b = req.body || {};
  const p = get('SELECT id FROM patients WHERE id=?', num(b.patient_id)) || fail(400, 'patient_required');
  if (!FORMS[b.form]) fail(400, 'form_invalid');
  const admission = b.admission_id ? get('SELECT id, encounter_id FROM admissions WHERE id=? AND patient_id=?', num(b.admission_id), p.id) || fail(404, 'admission_not_found') : null;
  const encounter = b.encounter_id ? get('SELECT id FROM encounters WHERE id=? AND patient_id=?', num(b.encounter_id), p.id) || fail(404, 'encounter_not_found') : null;
  const notes = String(b.notes || '').trim();
  if (currentMode() === 'paperless' && notes.length < 5) fail(400, 'downtime_reason_required');
  return tx(() => {
    const id = insert('clinical_documents', { patient_id: p.id, encounter_id: encounter?.id || admission?.encounter_id || null, admission_id: admission?.id || null,
      form: b.form, area: FORMS[b.form][0], title: String(b.title || '').trim() || FORMS[b.form][1], documented_on: b.documented_on || null,
      documented_by_name: String(b.documented_by_name || '').trim() || null, method: 'paper', notes: notes || null, recorded_by: req.user.id, recorded_at: nowIso() });
    const row = get('SELECT * FROM clinical_documents WHERE id=?', id);
    emit(req, { topics: ['clinical', `patient:${p.id}`], event: 'clinical.document', data: row, action: 'clinical.document.add', entity: 'clinical_documents', entityId: id,
      detail: { before: null, after: { form: row.form, title: row.title, documented_on: row.documented_on, mode: currentMode() }, reason: notes || null } });
    return row;
  });
}));
