import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.SURELY_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'hms-separate-collections-'));
const {insert,db}=await import('../server/db.js');
const {EXTRA_REPORTS}=await import('../server/report-defs.js');
const patient_id=insert('patients',{uhid:'TEST1',name:'Synthetic collections test',gender:'Male'});
const encounter_id=insert('encounters',{encounter_no:'TEST-IP',patient_id,kind:'IP'});
const q={from:'2026-11-01',to:'2026-11-30'};
function payment(bill_id,amount,receipt_no,extra={}){insert('payments',{bill_id,patient_id,amount,receipt_no,mode:'cash',pay_date:'2026-11-14',...extra});}
for(const [i,category] of ['self','insurance','aarogyasri'].entries()){
 const bill_id=insert('bills',{bill_no:'TEST'+i,patient_id,encounter_id,bill_type:i===2?'PHARM':'IP',payer_type:category});
 payment(bill_id,100,'P'+i);payment(bill_id,-10,'R'+i);
 payment(bill_id,999,'C'+i,{cancelled:1});payment(bill_id,999,'D'+i,{pay_date:'2026-10-01'});
 if(category!=='self'){
  const settlement_id=insert('bill_settlements',{settlement_no:'S'+i,bill_id,patient_id,mode:category,amount:1000});
  insert('settlement_receipts',{receipt_no:'SR'+i,settlement_id,amount:400,disallowed:50,mode:'bank_transfer',received_on:'2026-11-14'});
 }
}
const op=insert('bills',{bill_no:'OP',patient_id,bill_type:'OP'});payment(op,999,'OPPAY');
const patient=EXTRA_REPORTS.find(r=>r.id==='ip_patient_collections').run(q);
const payer=EXTRA_REPORTS.find(r=>r.id==='tpa_aarogyasri_payer_collections').run(q);
assert.equal(patient.rows.length,6);assert.equal(patient.rows.reduce((s,r)=>s+r.net,0),270);
assert.equal(payer.rows.length,2);assert.equal(payer.rows.reduce((s,r)=>s+r.received,0),800);
assert.ok(patient.rows.some(r=>r.category==='aarogyasri'&&r.desk==='pharmacy'));
assert.ok(!payer.rows.some(r=>r.receipt_no.startsWith('P')));
db.close();
console.log('PASS: patient 300 minus refunds 30 = 270; payer receipts 800, disallowances excluded; cancelled/out-of-range/OP excluded; IP pharmacy included.');
