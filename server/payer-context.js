import {get} from './db.js';
/** Current category for the selected care episode; old visits keep their own category. */
export function visitBillingCategory(patientId,encounterId=null){
  let category;
  if(encounterId){
    category=get("SELECT financial_category FROM admissions WHERE encounter_id=? AND status<>'discharged' ORDER BY id DESC LIMIT 1",encounterId)?.financial_category
      || get("SELECT payer_type FROM insurance_claims WHERE encounter_id=? AND status<>'rejected' ORDER BY id DESC LIMIT 1",encounterId)?.payer_type
      || get("SELECT payer_type FROM bills WHERE encounter_id=? AND bill_type IN ('OP','ER') AND status<>'cancelled' ORDER BY id LIMIT 1",encounterId)?.payer_type;
  }
  // Outside an admission (OP, pharmacy, lab), scheme patients pay for what is not covered as self-pay: OP charges stay in OP.
  const admitted=encounterId&&get("SELECT 1 FROM admissions WHERE encounter_id=? AND status<>'discharged'",encounterId);
  if(!category || !admitted){
    if(!category) category=get('SELECT payer_type FROM patients WHERE id=?',patientId)?.payer_type || 'self';
    if(['aarogyasri','scheme'].includes(category)&&get("SELECT value FROM settings WHERE key='aarogyasri_ipd_only'")?.value!=='0')category='self';
  }
  return category==='scheme'?'aarogyasri':category;
}
