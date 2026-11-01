import { get, nowIso } from './db.js';
import { fail, num } from './lib.js';

export const PROFESSIONAL_CATEGORIES = ['consultation', 'procedure', 'surgery', 'anaesthesia', 'professional'];
export function feeSnapshot(doctorId, serviceId, userId, role = 'consultant') {
  if (!doctorId) return { visiting_fee_type: null, visiting_fee_value: null, visiting_agreement: null, visiting_assigned_at: null, visiting_assigned_by: null };
  const doctor = get('SELECT * FROM visiting_doctors WHERE id=? AND active=1', doctorId) || fail(400, 'visiting_doctor_not_found');
  const rate = serviceId ? get('SELECT * FROM visiting_doctor_rates WHERE doctor_id=? AND service_id=?', doctorId, serviceId) : null;
  const fixed = role === 'session' ? doctor.session_fee : role === 'day' ? doctor.day_fee : 0;
  return { visiting_fee_type: fixed > 0 ? 'fixed' : rate?.share_type || doctor.share_type,
    visiting_fee_value: fixed > 0 ? fixed : num(rate?.share_value ?? doctor.share_value),
    visiting_agreement: doctor.agreement_reference || doctor.settlement_terms || null,
    visiting_assigned_at: nowIso(), visiting_assigned_by: userId };
}
