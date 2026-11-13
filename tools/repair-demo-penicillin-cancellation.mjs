import {get,insert,tx,db} from '../server/db.js';
import {restoreCancelledBillStock} from '../server/cancel-bill-stock.js';
const bill=get("SELECT b.* FROM bills b WHERE b.bill_no='B000005' AND b.status='cancelled' AND EXISTS(SELECT 1 FROM bill_items i JOIN medicine_batches bt ON bt.id=i.batch_id JOIN medicines m ON m.id=bt.medicine_id WHERE i.bill_id=b.id AND m.code='DEMO-PENCIL')");
if(!bill)throw Error('Expected cancelled demo bill not found; no changes made');
const restored=tx(()=>{
 const rows=restoreCancelledBillStock(bill.id,bill.cancelled_by,'Repair missing stock reversal on cancelled demo penicillin bill');
 if(rows.length)insert('audit_log',{user_id:bill.cancelled_by,user_name:'System repair',action:'bill.cancel_stock_repair',entity:'bills',entity_id:bill.id,detail:JSON.stringify({restored:rows,reason:'User reported missing stock after cancellation'})});
 return rows;
});
console.log(JSON.stringify({bill:bill.bill_no,restored}));db.close();
