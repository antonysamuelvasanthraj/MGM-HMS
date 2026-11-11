import {esc,printLetterhead,fmtDateTime} from './ui.js';
import {setting} from './store.js';
const amount=value=>Number(value || 0).toFixed(2);
/** 207 -> "Two Hundred and Seven only" (Indian grouping) */
export function rupeesInWords(value){
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=n=>n<20?ones[n]:tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');
  const three=n=>(n>=100?ones[Math.floor(n/100)]+' Hundred'+(n%100?' and ':''):'')+(n%100?two(n%100):'');
  const total=Math.round(Math.abs(Number(value)||0)*100),rs=Math.floor(total/100),ps=total%100;
  const parts=[[Math.floor(rs/10000000),'Crore'],[Math.floor(rs/100000)%100,'Lakh'],[Math.floor(rs/1000)%100,'Thousand']].filter(([n])=>n).map(([n,u])=>two(n)+' '+u);
  if(rs%1000)parts.push(three(rs%1000));
  return `${parts.join(' ')||'Zero'}${ps?` and ${two(ps)} Paise`:''} only`;
}
export function pharmacyInvoice(b) {
  const payments=(b.payments || []).filter(payment=>!payment.cancelled);
  return `<div style="max-width:760px;margin:auto;color:#111;font-family:Arial,sans-serif;font-size:11px">${printLetterhead('PHARMACY TAX INVOICE')}
    <table style="width:100%;font-size:11px"><tr><td><b>Customer name:</b> ${esc(b.patient_name)}</td><td><b>Patient ID:</b> ${esc(b.uhid)}</td><td><b>Bill date:</b> ${esc(b.bill_date || b.created_at)}</td></tr><tr><td><b>Doctor:</b> ${esc(b.doctor_name || b.referred_by || '—')}</td><td><b>Visit:</b> ${esc(b.encounter_no || '—')}</td><td><b>Bill number:</b> ${esc(b.bill_no)}</td></tr></table>
    <style>.pharm-invoice{width:100%;border-collapse:collapse;font-size:10px}.pharm-invoice th,.pharm-invoice td{border:1px solid #444;padding:4px}.pharm-invoice .num{text-align:right}.pharm-invoice tr{break-inside:avoid}.pharm-invoice th{background:#f4f4f4}</style>
    <table class="pharm-invoice"><thead><tr><th rowspan="2">S.No</th><th rowspan="2">Product name</th><th rowspan="2">Batch No.</th><th rowspan="2">Expiry</th><th rowspan="2">Unit price</th><th rowspan="2">Qty</th><th colspan="2">CGST</th><th colspan="2">SGST</th><th colspan="2">IGST</th><th rowspan="2">Tax amt</th><th rowspan="2">Total</th></tr><tr>${['%','Amt','%','Amt','%','Amt'].map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>
    ${b.items.map((item,index)=>{const m=item.print_money || {};return `<tr><td>${index+1}</td><td>${esc(item.description)}${item.hsn?`<br><small>HSN ${esc(item.hsn)}</small>`:''}${Number(item.returned_qty)>0?`<br><small style="color:#b00">Returned qty ${Number(item.returned_qty)} — credited / refunded</small>`:''}</td><td>${esc(item.batch_no || '—')}</td><td>${esc(item.expiry || '—')}</td><td class="num">${amount(item.rate)}</td><td class="num">${item.qty}</td><td class="num">${Number(item.gst_pct || 0)/2}</td><td class="num">${amount(m.cgst)}</td><td class="num">${Number(item.gst_pct || 0)/2}</td><td class="num">${amount(m.sgst)}</td><td class="num">0</td><td class="num">${amount(m.igst)}</td><td class="num">${amount(m.tax)}</td><td class="num">${amount(m.total ?? item.amount)}</td></tr>`;}).join('')}
    ${[['Subtotal',b.gross],['Bill discount',b.discount],['Tax (included where applicable)',b.items.reduce((sum,item)=>sum+Number(item.print_money?.tax || 0),0)],['Grand total',b.total],['Paid amount (net)',b.paid],['Refund amount',payments.filter(p=>p.amount<0).reduce((sum,p)=>sum-p.amount,0)],['Balance',b.balance]].map(([label,value])=>`<tr><td colspan="13" class="num">${label}</td><td class="num"><b>${amount(value)}</b></td></tr>`).join('')}<tr><td colspan="13" class="num">Status</td><td>${esc(b.status)}</td></tr></tbody></table>
    <h3 style="margin:12px 0 4px">Payment information</h3><table class="pharm-invoice"><thead><tr><th>Receipt No.</th><th>Type</th><th>Mode</th><th>Date</th><th>Amount</th></tr></thead><tbody>${payments.map(p=>`<tr><td>${esc(p.receipt_no)}</td><td>${p.amount<0?'Refund':'Payment'}</td><td>${esc(p.mode)}</td><td>${esc(fmtDateTime(p.created_at))}</td><td class="num">${amount(p.amount)}</td></tr>`).join('') || '<tr><td colspan="5">No payments recorded</td></tr>'}</tbody></table><p>${esc(b.notes || '')}</p>
    <div style="margin-top:12px;border:1px solid #444;padding:8px;break-inside:avoid"><b>Terms &amp; Conditions</b><ol style="margin:4px 0 0 16px;padding:0"><li>Goods once sold will not be taken back or exchanged.</li><li>Bills not paid by the due date will attract 24% interest.</li><li>All disputes subject to jurisdiction only.</li><li>Prescribed Sales Tax declaration will be given.</li></ol>
      <p style="margin:8px 0 2px"><b>Remark:</b> ${esc(b.notes || '')}</p><p style="margin:2px 0"><b>Rs. ${esc(rupeesInWords(b.total))}</b></p></div>
    <p style="text-align:right;margin-top:26px">For ${esc(setting('hospital_name','MGM Superspeciality Hospitals'))}<br><br>Authorised signatory</p></div>`;
}
