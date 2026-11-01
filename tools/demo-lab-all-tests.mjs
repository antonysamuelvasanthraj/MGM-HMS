/** Explicitly invoked demo billing only; never fabricates results or payments. */
import {DatabaseSync} from 'node:sqlite';
const base='http://127.0.0.1:4300/api';
const health=await fetch(base+'/health').then(r=>r.json());
if(health.environment!=='demo')throw Error('This helper is restricted to the demo environment.');
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
if(!session)throw Error('Administrator session required.');
const name='DEMO LAB - All Tests';
let patient=db.prepare('SELECT id,uhid FROM patients WHERE name=? AND notes=?').get(name,'Fictional demonstration patient: all active laboratory tests. Not a clinical record.');
const tests=db.prepare("SELECT id,name,price FROM services WHERE category='lab' AND active=1 ORDER BY name,id").all();
async function call(route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Session':session.token},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value;}
if(!patient)patient=await call('/patients',{name,gender:'Female',age_years:30,payer_type:'self',notes:'Fictional demonstration patient: all active laboratory tests. Not a clinical record.'});
const bills=db.prepare("SELECT id,bill_no FROM bills WHERE patient_id=? AND notes='DEMO: all active lab services; no patient results or payments entered.' AND status<>'cancelled' ORDER BY id DESC").all(patient.id);
let bill=bills[0];
if(!bill)bill=await call('/bills',{patient_id:patient.id,bill_type:'LAB',payer_type:'self',notes:'DEMO: all active lab services; no patient results or payments entered.',items:tests.map(test=>({service_id:test.id,qty:1,rate:test.price}))});
else {
  const existing=new Set(db.prepare('SELECT service_id FROM bill_items WHERE bill_id=?').all(bill.id).map(row=>row.service_id));
  for(const test of tests)if(!existing.has(test.id))await call(`/bills/${bill.id}/items`,{service_id:test.id,qty:1,rate:test.price});
}
const coverage=db.prepare('SELECT count(DISTINCT service_id) count,sum(CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END) linked FROM bill_items WHERE bill_id=?').get(bill.id);
if(coverage.count!==tests.length || coverage.linked!==tests.length)throw Error('Incomplete demo lab order coverage');
console.log(JSON.stringify({patient:name,uhid:patient.uhid,bill_id:bill.id,bill_no:bill.bill_no,tests:tests.length,linked_lab_orders:coverage.linked,payment:'Unpaid demo bill; no collection or results fabricated.'}));
db.close();
