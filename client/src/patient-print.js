import {api,esc,money,fmtDateTime,printDocument,state,toast} from './views/_kit.js';
const payerLabels={self:"Self-pay",insurance:"Insurance / TPA",aarogyasri:"Aarogyasri",corporate:"Corporate credit",trust:"Trust",credit:"Patient credit",free:"Approved free treatment"};
const careLabels={IP:"IPD — Inpatient",OP:"OPD — Outpatient",ER:"ER — Emergency",LAB:"Laboratory",PHARM:"Pharmacy",IMG:"Imaging"};
const printStyle=`<style>body{font-family:Arial,sans-serif;color:#172b4d;line-height:1.45}h1{font-size:20px;font-weight:700;margin:10px 0 5px}h2{font-size:16px;font-weight:700;margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid #881d2c}h3{font-size:14px;font-weight:700;margin:14px 0 6px}p{margin:7px 0}thead{background:#f1f4f8}th{font-weight:700}section{margin:16px 0}table{margin:10px 0}td:nth-last-child(-n+3){font-variant-numeric:tabular-nums}.stay-summary{border:1px solid #cbd5e1;background:#f8fafc;padding:12px;margin:16px 0}</style>`;
const BANNER='/assets/mgm-estimation-logo.jpeg';
const header=(patient)=>`${printStyle}<img src="${BANNER}" alt="MGM Hospitals" style="width:100%;max-width:760px;height:auto"><p style="margin-top:4px">${esc(state.meta.settings.address||'')} · ${esc(state.meta.settings.phone||'')}</p><p>${esc(patient.patient_name)} · ${esc(patient.uhid)} · ${esc(patient.ip_no||'')}</p>`;
const PAYERS=['insurance','aarogyasri','corporate','trust'];
const HEADS=[['bed','Room & bed'],['consultation','Consultant visits'],['ipd','Nursing & ward services'],['nursing','Nursing & ward services'],['emergency','Emergency care'],['procedure','Procedures & OT'],['ot','Procedures & OT'],['lab','Laboratory'],['imaging','Imaging'],['pharmacy','Pharmacy'],['consumable','Consumables'],['package','Package']];
const headOf=(cat)=>(HEADS.find(([k])=>k===cat)||[null,'Other charges'])[1];
export async function printPatientPrescription(patientId,rxId){
 const rows=await api.get(`/prescriptions?patient_id=${patientId}`),r=rows.find(x=>x.id===+rxId);
 if(!r){toast('Prescription not found','warning');return;}
 printDocument(`Prescription — ${r.patient_name}`,header(r)+`<h2>Prescription</h2><p>${fmtDateTime(r.created_at)} · ${esc(r.doctor_name)} · ${esc(r.encounter_no||'')} · ${esc(r.status)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th>Medicine</th><th>Dose / route</th><th>Frequency</th><th>Days</th><th>Qty</th><th>Dispensed / Remaining</th><th>Instructions</th></tr></thead><tbody>${r.items.map(i=>`<tr><td>${esc(i.drug)}</td><td>${esc(i.dose||'')} ${esc(i.route||'')}</td><td>${esc(i.frequency||'')}</td><td>${i.duration_days||''}</td><td>${i.qty||''}</td><td>${i.dispensed_qty||0} / ${Math.max(0,(i.qty||0)-(i.dispensed_qty||0))}</td><td>${esc(i.instructions||'')}</td></tr>`).join('')}</tbody></table><p>${esc(r.notes||'')}</p><p>All prescribed medicines are listed. Remaining quantities may be purchased outside. Substitutions require doctor approval.</p><p>Doctor signature: __________________</p>`);
}
export async function printStay(id,includeClinical=true){
 const d=await api.get(`/ipd/admissions/${id}/print-pack`),a=d.admission;
 const visibleBills=d.bills.filter(b=>!(Number(b.total)===0 && b.items.length && b.items.every(i=>Number(i.amount)===0 && /^DEMO /i.test(i.description))));
 const items=visibleBills.flatMap(b=>b.items.filter(i=>Number(i.amount)!==0||!i.waiver_of).map(i=>({...i,bill_no:b.bill_no})));
 const gross=items.filter(i=>Number(i.amount)>0).reduce((t,i)=>t+Number(i.amount),0);
 const waived=-items.filter(i=>Number(i.amount)<0).reduce((t,i)=>t+Number(i.amount),0);
 const received=visibleBills.reduce((t,b)=>t+Number(b.paid||0),0);
 const covered=visibleBills.reduce((t,b)=>t+Number(b.covered_amount||0),0);
 // a payer stay: what is still open on payer bills is due from the payer (claimed later), not from the patient
 const payerOpen=visibleBills.filter(b=>PAYERS.includes(b.payer_type)).reduce((t,b)=>t+Math.max(0,Number(b.balance||0)),0);
 const patientDue=visibleBills.filter(b=>!PAYERS.includes(b.payer_type)).reduce((t,b)=>t+Number(b.balance||0),0);
 const payerName=a.claim?.tpa||payerLabels[a.financial_category]||'Payer';
 const groups=[...new Set(items.map(i=>headOf(i.category)))];
 const row=(l,v,st='')=>`<tr${st?` style="${st}"`:''}><td>${l}</td><td style="text-align:right">${v}</td></tr>`;
 const billHTML=`<table style="width:100%;border-collapse:collapse;margin:8px 0"><tr><td><b>Patient:</b> ${esc(a.patient_name)}</td><td><b>Age / Gender:</b> ${esc(a.age_years??'')} / ${esc(a.gender||'')}</td></tr>
   <tr><td><b>UHID:</b> ${esc(a.uhid)}</td><td><b>IP No:</b> ${esc(a.ip_no)}</td></tr>
   <tr><td><b>Ward / Bed:</b> ${esc(a.ward_name||'—')} / ${esc(a.bed_no||'—')}</td><td><b>Payer:</b> ${esc(PAYERS.includes(a.financial_category)?payerName:payerLabels[a.financial_category]||a.financial_category)}${a.claim?` · ${esc(a.claim.claim_no)}`:''}</td></tr>
   <tr><td><b>Admitted:</b> ${fmtDateTime(a.admitted_at)}</td><td><b>Discharged:</b> ${a.discharged_at?fmtDateTime(a.discharged_at):'Still admitted'}</td></tr>
   <tr><td colspan="2"><b>Consultant:</b> ${esc(a.consultant_name||'')}</td></tr></table>
  <h2>Final bill — complete stay</h2>
  <table style="width:100%;border-collapse:collapse"><thead><tr><th>Date</th><th>Particulars</th><th>Bill</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>
  ${groups.map(g=>{const rows=items.filter(i=>headOf(i.category)===g);const sub=rows.reduce((t,i)=>t+Number(i.amount),0);
    return `<tr><td colspan="6" style="background:#f1f4f8;font-weight:700">${esc(g)}</td></tr>${rows.map(i=>`<tr><td>${esc(String(i.created_at||'').slice(0,10).split('-').reverse().join('-'))}</td><td>${esc(i.description)}</td><td style="font-size:11px">${esc(i.bill_no)}</td><td style="text-align:right">${i.qty}</td><td style="text-align:right">${money(i.rate,2)}</td><td style="text-align:right">${money(i.amount,2)}</td></tr>`).join('')}
      <tr><td colspan="5" style="text-align:right;font-weight:600">${esc(g)} total</td><td style="text-align:right;font-weight:600">${money(sub,2)}</td></tr>`;}).join('')}
  </tbody></table>
  <table style="width:55%;margin-left:auto;border-collapse:collapse">
   ${row('Gross charges',money(gross,2))}${waived?row('Waived / concessions','− '+money(waived,2)):''}
   ${covered?row(`Settled by ${esc(payerName)}`,'− '+money(covered,2)):''}
   ${payerOpen?row(`<b>Payable by ${esc(payerName)}</b> (claimed by the hospital)`,`<b>${money(payerOpen,2)}</b>`):''}
   ${row('Received from patient','− '+money(received,2))}
   ${row(`<b>${patientDue<0?'Advance to return':'Patient balance'}</b>`,`<b>${money(Math.abs(patientDue),2)}</b>`,'border-top:2px solid #172b4d')}
  </table>
  ${visibleBills.some(b=>b.receipts.length)?`<h3>Receipts</h3><p>${visibleBills.flatMap(b=>b.receipts.map(r=>`${esc(r.receipt_no)} · ${esc(String(r.created_at||r.pay_date||'').slice(0,10))} · ${esc(r.mode)} · ${money(r.amount,2)}`)).join('<br>')}</p>`:''}
  <div style="display:flex;justify-content:space-between;margin-top:40px"><span>Patient / attendant signature</span><span>Billing / authorised signatory</span></div>`;
 const c=includeClinical?d.clinical:null;
 const diagnosticHTML=c?(c.diagnostics||[]).map(o=>`<section style="page-break-inside:avoid"><h3>${esc(o.order_no)} · ${esc(o.label)} · ${esc(o.status)}</h3>${o.results.length?`<table style="width:100%"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead><tbody>${o.results.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.value)}</td><td>${esc(r.unit||'')}</td><td>${esc(r.ref_range||'')}</td><td>${esc(r.flag||'')}</td></tr>`).join('')}</tbody></table>`:''}${o.reports.map(r=>`<p>${esc(r.status)} · ${r.signed_at?fmtDateTime(r.signed_at):'Not signed'}</p><p style="white-space:pre-wrap">${esc(r.technique||'')}\n${esc(r.findings||'')}\n${esc(r.impression||'')}\n${esc(r.advice||'')}</p>`).join('')}</section>`).join(''):'';
 printDocument(`Discharge documents — ${a.ip_no}`,`${printStyle}<img src="${BANNER}" alt="MGM Hospitals" style="width:100%;max-width:760px;height:auto"><p style="margin-top:4px">${esc(state.meta.settings.address||'')} · ${esc(state.meta.settings.phone||'')}</p>${billHTML}${c?`<section style="page-break-before:always"><h2>Current diagnosis & clinical discharge record</h2><p>Summary status: ${esc(c.summary_status||'Not signed')}</p><p><b>Diagnosis:</b> ${esc(c.diagnosis||'Not recorded')}</p><div style="white-space:pre-wrap">${esc(c.summary||'Clinical summary not yet written')}</div>${c.consultations.map(n=>`<h3>${fmtDateTime(n.created_at)} · ${esc(n.doctor_name)}</h3><p>${esc(n.diagnosis||'')}</p><p style="white-space:pre-wrap">${esc(n.plan||'')}\n${esc(n.advice||'')}</p>`).join('')}</section>`:''}`+diagnosticHTML);
}
