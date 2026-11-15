import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.argv[2],{readOnly:true});
for(const number of ['ORD-261113-00077','ORD-261113-00075','ORD-261113-00074']){
const o=db.prepare('SELECT id,order_no,encounter_id,status,billed,bill_item_id FROM orders WHERE order_no=?').get(number);
if(!o){console.log({number,missing:true});continue;}
const lines=db.prepare('SELECT i.id,b.id bill_id,b.bill_no,b.status,b.total,b.paid,b.balance,b.authorization_status FROM bill_items i JOIN bills b ON b.id=i.bill_id WHERE i.order_id=? OR i.id=?').all(o.id,o.bill_item_id||-1);
const bills=db.prepare('SELECT id,bill_no,status,total,paid,balance FROM bills WHERE encounter_id=?').all(o.encounter_id);
console.log(JSON.stringify({order:o,linked:lines,visitBills:bills}));
}db.close();
