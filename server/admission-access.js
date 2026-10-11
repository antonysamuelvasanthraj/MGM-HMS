import { can } from './auth.js';

// Admission desks need bed and billing information without receiving clinical notes.
export const canReadAdmissionClinical = user => can(user, 'patient.clinical') || can(user, 'nursing.view');

export function admissionForUser(admission, user) {
  if (!admission) return admission;
  const clinical = canReadAdmissionClinical(user);
  const result = { ...admission, access: { clinical } };
  if (!clinical) {
    for (const key of ['diagnosis', 'discharge_summary', 'summary_json', 'allergy_count', 'meds_due']) delete result[key];
    for (const key of ['notes', 'mar']) if (key in result) result[key] = [];
    if (result.patient) result.patient = { ...result.patient, allergies: [], problems: [], notes: null };
  }
  if ('vitals' in result && !clinical && !can(user, 'vitals.view') && !can(user, 'vitals.record')) result.vitals = [];
  if (result.orders && !can(user, 'order.view')) result.orders = result.orders.filter(order =>
    (order.category === 'lab' && can(user, 'lab.view')) || (order.category === 'imaging' && can(user, 'imaging.view')));
  return result;
}
