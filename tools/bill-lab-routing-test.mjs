import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-bill-lab-'));const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(source,path.join(directory,'surelyhms.db'));source.close();
const db=new DatabaseSync(path.join(directory,'surelyhms.db'));const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4396',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:'ignore'});
async function call(route,body){const r=await fetch('http://127.0.0.1:4396/api'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Session':session.token},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;}
try{
  for(let i=0;i<60;i++){try{await call('/pharmacy/suppliers');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,250));}}
  const before=db.prepare('SELECT total,paid FROM bills WHERE id=37').get();
  const linkedBefore=db.prepare('SELECT order_id FROM bill_items WHERE bill_id=37 LIMIT 1').get().order_id;
  const repaired=await call('/bills/37/route-diagnostics',{});assert.equal(repaired.order_ids.length,linkedBefore?0:1);
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(linkedBefore || repaired.order_ids[0]);assert.ok(['ordered','verified'].includes(order.status));assert.equal(order.category,'lab');assert.equal(order.service_id,84);
  assert.deepEqual(db.prepare('SELECT total,paid FROM bills WHERE id=37').get(),before);
  assert.equal((await call('/bills/37/route-diagnostics',{})).order_ids.length,0);
  const bill=await call('/bills',{patient_id:15,encounter_id:16,bill_type:'LAB',items:[{service_id:84,qty:1,rate:150}]});
  assert.ok(db.prepare('SELECT order_id FROM bill_items WHERE bill_id=?').get(bill.id).order_id);
  await call(`/bills/${bill.id}/items`,{service_id:79,qty:1,rate:120});
  assert.equal(db.prepare('SELECT count(*) n FROM bill_items WHERE bill_id=? AND order_id IS NOT NULL').get(bill.id).n,2);
  const walkin=await call('/bills',{patient_id:15,bill_type:'LAB',items:[{service_id:84,qty:1,rate:150}]});
  assert.ok(db.prepare('SELECT encounter_id FROM bills WHERE id=?').get(walkin.id).encounter_id);
  assert.equal(db.prepare('SELECT count(*) n FROM bill_items WHERE bill_id=?').get(walkin.id).n,1);
  console.log('PASS: existing paid bill routed once without changing money; new bills and added diagnostic lines create linked orders.');
}finally{server.kill();db.close();console.log('Isolated copy: '+directory);}
