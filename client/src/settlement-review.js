import {api,esc,money,modal,printDocument,apiError} from './views/_kit.js';
export async function openSettlementReview(admissionId){
 try{
 const admission=await api.get(`/ipd/admissions/${admissionId}`);
 const references=[...(admission.bills||[])];
 if(admission.er_bill&&!references.some(b=>b.id===admission.er_bill.id))references.push(admission.er_bill);
 const bills=(await Promise.all(references.map(b=>api.get(`/bills/${b.id}`)))).filter(b=>b.status!=='cancelled');
 const total=key=>bills.reduce((sum,b)=>sum+Number(b[key]||0),0);
 const html=`<h2>Final settlement review</h2><p>${esc(admission.patient_name)} · ${esc(admission.uhid)} · ${esc(admission.ip_no)}</p><table class="tbl" style="width:100%;font-size:11px"><thead><tr><th>Bill / services</th><th>Charges</th><th>Discount</th><th>Free</th><th>Covered</th><th>Received</th><th>Due</th></tr></thead><tbody>${bills.map(b=>`<tr><td>${esc(b.bill_no)}<br>${esc((b.items||[]).map(i=>i.description).join('; '))}</td>${['gross','discount','free_treatment_value','covered_amount','paid','balance'].map(key=>`<td>${money(b[key]||0,2)}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>Total</th>${['gross','discount','free_treatment_value','covered_amount','paid','balance'].map(key=>`<th>${money(total(key),2)}</th>`).join('')}</tr></tfoot></table><p><b>Outstanding / credit balance: ${money(total('balance'),2)}</b></p><div style="display:flex;justify-content:space-between;margin-top:30px"><span>Patient / attendant signature</span><span>Billing / authorised signatory</span></div>`;
 modal({title:'View / print final settlement',size:'xl',stack:true,body:html,footer:'<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-print-review>Print settlement review</button>',onMount(root){root.querySelector('[data-print-review]').onclick=()=>printDocument('Final settlement review',html,{paper:'A4'});}});
 }catch(error){apiError(error,'Could not prepare settlement review');}
}
