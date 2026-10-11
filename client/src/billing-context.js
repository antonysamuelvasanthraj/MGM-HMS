import { api, qs } from './api.js';
import { esc, money } from './ui.js';
const names={self:'Self-pay',insurance:'Insurance / TPA',aarogyasri:'Aarogyasri',corporate:'Corporate credit',trust:'Trust',credit:'Credit',due:'Approved due',free:'Free treatment'};
export async function showBillingContext(el,id,visit=null){
 if(!el)return;const token=Symbol();el._context=token;el.textContent='Loading patient billing details…';
 try{const d=await api.get(`/patients/${id}/billing-context`+qs({encounter_id:visit}));if(el._context!==token||!el.isConnected)return;
 const care={IP:'IPD — inpatient',OP:'OPD — outpatient',EMG:'ER — emergency',NONE:'No active visit selected'}[d.care_type]||d.care_type;
 const note=d.care_type==='IP'?'Running inpatient account: pharmacy issues go to the IP bill. Collect only confirmed patient dues at the collection desk.':d.payer_type==='self'?'Self-pay: collect the payable patient amount by cash, UPI or card.':d.payer_type==='free'?'Verify free-treatment approval before waiving charges.':'Payer / credit account: collect only confirmed patient share, co-pay or exclusions. Covered amounts remain payer dues until settlement.';
 el.innerHTML=`<div class="rounded border border-outline-variant p-3 space-y-2" role="status"><div class="flex flex-wrap gap-2"><strong>${esc(care)}</strong><span>${esc(d.visit_no||'')}</span><span class="pill-info">${esc(names[d.payer_type]||d.payer_type)}</span></div><div class="text-body-sm"><strong>Payer:</strong> ${esc(d.payer_name||(d.payer_type==='self'?'Patient':'Not configured — verify details'))} · <strong>Package:</strong> ${esc(d.package_name||'None')}</div><div class="text-body-sm">Patient due: <strong>${money(d.patient_due)}</strong> · Payer due: <strong>${money(d.payer_due)}</strong> · Patient received (net): ${money(d.patient_received)} · Payer received: ${money(d.payer_received)}</div><div class="text-body-sm">Approval: ${esc(d.approval_status.replaceAll('_',' '))} · Treatment: ${esc(d.treatment_status.replaceAll('_',' '))}</div><p class="text-body-sm">${esc(note)}</p></div>`;
 }catch{if(el._context===token)el.textContent='Could not load billing details. Verify visit and payer before billing.';}
}
