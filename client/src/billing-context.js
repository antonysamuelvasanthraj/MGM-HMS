import {can} from './store.js';
import {openSchemePatientPayment} from './scheme-patient-pay.js';
import { api, qs } from './api.js';
import { esc, money } from './ui.js';
import { canChangePayer,openPayerChange } from './payer-change.js';
const names={self:'Self-pay',insurance:'Insurance / TPA',aarogyasri:'Aarogyasri',corporate:'Corporate credit',trust:'Trust',credit:'Credit',due:'Approved due',free:'Free treatment'};
export async function showBillingContext(el,id,visit=null,options={}){
 if(!el)return;clearTimeout(el._billingRefresh);const token=Symbol();el._context=token;el.textContent='Loading patient billing details…';
 try{const d=await api.get(`/patients/${id}/billing-context`+qs({encounter_id:visit}));if(el._context!==token||!el.isConnected)return;
 const care={IP:'IPD — inpatient',OP:'OPD — outpatient',EMG:'ER — emergency',NONE:'No active visit selected'}[d.care_type]||d.care_type;
 const note=d.care_type==='IP'?'Running inpatient account: pharmacy issues go to the IP bill. Collect only confirmed patient dues at the collection desk.':d.payer_type==='self'?'Self-pay: collect the payable patient amount by cash, UPI or card.':d.payer_type==='free'?'Verify free-treatment approval before waiving charges.':'Payer / credit account: collect only confirmed patient share, co-pay or exclusions. Covered amounts remain payer dues until settlement.';
 el.innerHTML=`<div class="rounded border border-outline-variant p-3 space-y-2" role="status"><div class="flex flex-wrap gap-2"><strong>${esc(care)}</strong><span>${esc(d.visit_no||'')}</span><span class="pill-info">${esc(names[d.payer_type]||d.payer_type)}</span></div><div class="text-body-sm"><strong>Payer:</strong> ${esc(d.payer_name||(d.payer_type==='self'?'Patient':'Not configured — verify details'))} · <strong>Package:</strong> ${esc(d.package_name||'None')}</div><div class="text-body-sm">Patient due: <strong>${money(d.patient_due)}</strong> · Payer due: <strong>${money(d.payer_due)}</strong> · Patient received (net): ${money(d.patient_received)} · Payer received: ${money(d.payer_received)}</div><div class="text-body-sm">Approval: ${esc(d.approval_status.replaceAll('_',' '))} · Treatment: ${esc(d.treatment_status.replaceAll('_',' '))}</div><p class="text-body-sm">${esc(note)}</p></div>`;
 if(d.payer_type==='aarogyasri'&&can('scheme.patient_pay')){
  const label=document.createElement('label');label.className='flex items-center gap-2 text-body-sm mt-2';
  const checkbox=document.createElement('input');checkbox.type='checkbox';
  checkbox.addEventListener('change',()=>{if(checkbox.checked){checkbox.checked=false;openSchemePatientPayment(id,null,()=>showBillingContext(el,id,visit,options));}});
  label.append(checkbox,document.createTextNode('Patient payable — select billed items and authorized amount'));
  el.append(label);
 }
 if(options.editable){
   const label=el.querySelector('.pill-info'), wrapper=document.createElement('label');
   wrapper.className='flex items-center gap-2 text-body-sm';
   const choices=['self','credit','insurance','aarogyasri','corporate','trust'];
   if(!choices.includes(d.payer_type))choices.push(d.payer_type);
   wrapper.innerHTML=`Billing category <select aria-label="Billing category" data-billing-category class="field field-sm" style="background:#dbeafe;color:#174ea6;border-color:#93b8e8;max-width:230px" ${!d.encounter_id || !canChangePayer(d.care_type==='IP')?'disabled':''}>${choices.map(category=>`<option value="${esc(category)}" ${category===d.payer_type?'selected':''}>${esc(names[category] || category)}</option>`).join('')}</select>`;
   label.replaceWith(wrapper);
   if(!d.encounter_id)wrapper.title='Choose a patient visit to change its billing category.';
   wrapper.querySelector('select').onchange=async event=>{
     const category=event.target.value;event.target.value=d.payer_type;
     if(category===d.payer_type)return;
     await openPayerChange(d.encounter_id,async result=>{
       await showBillingContext(el,id,visit,options);
       await options.onChanged?.(result);
     },{category,stack:true});
   };
 }
 await options.onLoaded?.(d);
 if(options.editable)el._billingRefresh=setTimeout(()=>{if(el.isConnected)showBillingContext(el,id,visit,options);},15000);
 return d;
 }catch{if(el._context===token)el.textContent='Could not load billing details. Verify visit and payer before billing.';}
}
