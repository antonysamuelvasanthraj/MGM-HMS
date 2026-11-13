import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.SURELY_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'hms-cancel-stock-'));
const {insert,one,db}=await import('../server/db.js');
const {restoreCancelledBillStock}=await import('../server/cancel-bill-stock.js');
const {ensureChart}=await import('../server/accounting.js');ensureChart();
const patient_id=insert('patients',{uhid:'TEST',name:'Synthetic stock test',gender:'Male'});
const medicine_id=insert('medicines',{code:'TEST',name:'Synthetic item'});
for(const location of ['Central','OP','IP']){
 const bill_id=insert('bills',{bill_no:'TEST-'+location,patient_id,status:'cancelled'});
 const batch_id=insert('medicine_batches',{medicine_id,batch_no:location,expiry:'2030-12-31',location,qty:0,purchase_rate:5,mrp:10});
 insert('bill_items',{bill_id,batch_id,description:'Test',category:'pharmacy',qty:3,returned_qty:1,unit_cost:5});
 assert.equal(restoreCancelledBillStock(bill_id,null,'Synthetic test')[0].qty,2);
 assert.equal(one('SELECT qty FROM medicine_batches WHERE id=?',batch_id),2);
 assert.equal(restoreCancelledBillStock(bill_id,null,'Retry').length,0);
 assert.equal(one('SELECT qty FROM medicine_batches WHERE id=?',batch_id),2);
}
assert.equal(one("SELECT count(*) FROM journal_vouchers WHERE source='bill_cancel_stock'"),3);
db.close();console.log('PASS: Central/OP/IP return to original batch; prior returns excluded; retries do not duplicate stock or accounting.');
