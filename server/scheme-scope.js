import {get} from './db.js';
import {setting,fail} from './lib.js';
export function requireSchemeAdmission(category,patientId,encounterId=null,admissionId=null){
 if(!['aarogyasri','scheme'].includes(category)||setting('aarogyasri_ipd_only','1')==='0')return;
 const admission=admissionId?get('SELECT * FROM admissions WHERE id=? AND patient_id=?',Number(admissionId),Number(patientId)):
   encounterId?get('SELECT * FROM admissions WHERE encounter_id=? AND patient_id=?',Number(encounterId),Number(patientId)):null;
 if(!admission)fail(400,'aarogyasri_requires_ipd',{hint:'Admit as self-pay first, then change this admission to Aarogyasri after government approval.'});
}
