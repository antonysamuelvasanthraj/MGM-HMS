/** Explicit 2024 demonstration history for A Mohan Rao only. No clinical results or stock changes. */
import assert from 'node:assert/strict';
import {db} from '../server/db.js';
import {get,all,insert,update,tx,recalcBill,syncEncounterPayment,emit} from '../server/lib.js';
import {syncBillAccounting,postPayment,booksIntegrity,isClosed} from '../server/accounting.js';
import {requestContext} from '../server/context.js';
if(process.env.HMS_ENV!=='demo')throw Error('Explicit demo environment required.');
const patient=get('SELECT id,name,uhid,payer_type FROM patients WHERE id=27');
assert.equal(patient?.uhid,'SHMS-2627-0027');assert.equal(patient.name,'A Mohan Rao');
const user=get("SELECT * FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1");assert.ok(user);
const req={user,ip:'local-demo-import'};
const note='DEMO 2024 HISTORY — fictional bills and simulated receipts added for viewing only; not actual clinical services or cash received.';
const entries=[
 ['2024-01-15','Demo consultation',600,600],
 ['2024-03-12','Demo outpatient procedure',1200,1200],
 ['2024-06-20','Demo follow-up consultation',800,300],
 ['2024-08-17','Demo outpatient procedure',1500,500],
 ['2024-10-11','Demo consultation',500,0],
 ['2024-12-05','Demo outpatient procedure',1800,0],
];
const otherBills=all('SELECT * FROM bills WHERE patient_id<>? ORDER BY id',patient.id);
const otherPayments=all('SELECT * FROM payments WHERE patient_id<>? ORDER BY id',patient.id);
const existingBills=all("SELECT * FROM bills WHERE patient_id=? AND bill_no NOT LIKE 'DEMO-2024-MR27-%' ORDER BY id",patient.id);
const report=requestContext.run({req,user},()=>tx(()=>{
 for(const [index,[date,description,total,paid]] of entries.entries()){
  const number=`DEMO-2024-MR27-${String(index+1).padStart(3,'0')}`;
  if(get('SELECT id FROM bills WHERE bill_no=?',number))continue;
  if(isClosed(date))throw Error('Historical accounting date is closed: '+date);
  const stamp=date+' 10:00:00';
  const encounterId=insert('encounters',{encounter_no:`DEMO-2024-ENC-MR27-${index+1}`,patient_id:patient.id,kind:'OP',visit_type:index?'followup':'new',stage:'closed',payment_status:'pending',opened_at:stamp,closed_at:date+' 11:00:00',visit_date:date,created_by:user.id,remarks:note});
  const billId=insert('bills',{bill_no:number,patient_id:patient.id,encounter_id:encounterId,bill_type:'OP',payer_type:'self',status:'unpaid',created_by:user.id,bill_date:date,created_at:stamp,notes:note,source:'demo_history',source_id:patient.id});
  // The normal insert helper allocates today's series; label this imported demo before posting.
  update('bills',billId,{bill_no:number});
  insert('bill_items',{bill_id:billId,description,category:'other',qty:1,rate:total,amount:total,gst_pct:0,revenue_head:'OP',created_by:user.id,created_at:stamp});
  // Post at the historical date before recalculation; subsequent recalcs see no delta.
  syncBillAccounting(billId,{date});recalcBill(billId);
  if(paid){const paymentId=insert('payments',{receipt_no:`DEMO-2024-RC-MR27-${index+1}`,bill_id:billId,patient_id:patient.id,encounter_id:encounterId,amount:paid,mode:'cash',reference:'DEMO ONLY — simulated historical cash receipt',transaction_id:`demo-history-mr27-${index+1}`,received_by:user.id,created_at:date+' 10:30:00',pay_date:date,remarks:note});postPayment(get('SELECT * FROM payments WHERE id=?',paymentId),{date});}
  const bill=recalcBill(billId);syncEncounterPayment(encounterId);
  emit(req,{topics:['billing','patients',`patient:${patient.id}`],event:'bill.created',action:'demo.history.bill',entity:'bills',entityId:billId,detail:{before:null,after:bill,reason:note}});
 }
 assert.deepEqual(all('SELECT * FROM bills WHERE patient_id<>? ORDER BY id',patient.id),otherBills);
 assert.deepEqual(all('SELECT * FROM payments WHERE patient_id<>? ORDER BY id',patient.id),otherPayments);
 assert.deepEqual(all("SELECT * FROM bills WHERE patient_id=? AND bill_no NOT LIKE 'DEMO-2024-MR27-%' ORDER BY id",patient.id),existingBills);
 const rows=all("SELECT id,bill_no,bill_date,total,paid,balance,status FROM bills WHERE patient_id=? AND bill_no LIKE 'DEMO-2024-MR27-%' ORDER BY bill_date",patient.id);
 assert.equal(rows.length,6);assert.equal(rows.filter(row=>row.status==='paid').length,2);assert.equal(rows.filter(row=>row.status==='partial').length,2);assert.equal(rows.filter(row=>row.status==='unpaid').length,2);
 const vouchers=all("SELECT v.voucher_date,b.bill_date FROM journal_vouchers v JOIN bills b ON v.source='bill' AND v.source_id=b.id WHERE b.bill_no LIKE 'DEMO-2024-MR27-%'");assert.ok(vouchers.every(row=>row.voucher_date===row.bill_date));
 const receiptVouchers=all("SELECT v.voucher_date,p.pay_date FROM journal_vouchers v JOIN payments p ON v.source='payment' AND v.source_id=p.id WHERE p.receipt_no LIKE 'DEMO-2024-RC-MR27-%'");assert.equal(receiptVouchers.length,4);assert.ok(receiptVouchers.every(row=>row.voucher_date===row.pay_date));
 const integrity=booksIntegrity();assert.equal(integrity.ok,true,JSON.stringify(integrity));
 return {patient:patient.name,uhid:patient.uhid,bills:rows,billed:rows.reduce((sum,row)=>sum+row.total,0),paid:rows.reduce((sum,row)=>sum+row.paid,0),due:rows.reduce((sum,row)=>sum+row.balance,0),other_patients_unchanged:true,existing_bills_unchanged:true,books_balanced:true};
}));
console.log(JSON.stringify(report));db.close();
