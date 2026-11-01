import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import path from 'node:path';
const base=process.env.HMS_DEMO_URL || 'http://127.0.0.1:4300/api';
const health=await fetch(base+'/health').then(r=>r.json());if(health.environment!=='demo')throw Error('Demo environment required');
const db=new DatabaseSync(path.join(process.env.HMS_DEMO_DATA || 'data','surelyhms.db'),{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const patient=db.prepare("SELECT id FROM patients WHERE name='DEMO LAB - All Tests' AND notes LIKE 'Fictional demonstration patient:%'").get();assert.ok(patient);
const bill=db.prepare("SELECT * FROM bills WHERE patient_id=? AND bill_type='LAB' AND status<>'cancelled' ORDER BY id DESC LIMIT 1").get(patient.id);assert.ok(bill);
async function call(route,body,method='POST'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Session':session.token},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(route+': '+JSON.stringify(value));return value;}
const lines=db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY description,id').all(bill.id);
assert.ok([40,47].includes(lines.length),'Expected the original 47-line demo or already prepared 40-line demo');
if(lines.length===47){assert.equal(bill.paid,0,'Cannot remove tests after collection');for(const line of lines.slice(40))await call(`/bills/${bill.id}/items/${line.id}`,{reason:'DEMO setup: keep this test ordered but unbilled; 40 paid and collected, 7 unbilled'},'DELETE');}
const current=db.prepare('SELECT * FROM bills WHERE id=?').get(bill.id);
if(current.balance>0)await call('/payments',{bill_id:bill.id,amount:current.balance,mode:'cash',transaction_id:`DEMO-LAB-40-${bill.id}`,reference:'DEMO ONLY — simulated cash collection',remarks:'Fictional software demonstration. No actual cash received.'});
const billed=db.prepare('SELECT o.* FROM orders o JOIN bill_items i ON i.order_id=o.id WHERE i.bill_id=?').all(bill.id);assert.equal(billed.length,40);
for(const order of billed){if(order.status==='ordered' || order.status==='scheduled')await call(`/lab/orders/${order.id}/collect`,{sample_id:`DEMO-${order.order_no}`});else assert.equal(order.status,'collected','Demo contains unexpected performed work');}
const counts=db.prepare('SELECT billed,status,count(*) n FROM orders WHERE patient_id=? GROUP BY billed,status').all(patient.id);
assert.equal(counts.find(r=>r.billed===1 && r.status==='collected')?.n,40);
assert.equal(db.prepare('SELECT count(*) n FROM orders WHERE patient_id=? AND billed=0 AND bill_item_id IS NULL').get(patient.id).n,7);
const final=db.prepare('SELECT bill_no,total,paid,balance,status FROM bills WHERE id=?').get(bill.id);assert.equal(final.balance,0);assert.equal(final.status,'paid');
console.log(JSON.stringify({patient:'DEMO LAB - All Tests',bill:final,orders:counts,mode:'Demo cash; no actual cash received; no results entered.'}));db.close();
