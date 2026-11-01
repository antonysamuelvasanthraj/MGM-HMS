import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-grn-delete-'));
const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});
await backup(source,path.join(directory,'surelyhms.db'));source.close();
const db=new DatabaseSync(path.join(directory,'surelyhms.db'));
const users=db.prepare('SELECT id FROM users ORDER BY id LIMIT 3').all();assert.equal(users.length,3);
for(const [index,role] of ['admin','pharmacy_admin','manager'].entries()){
  db.prepare('UPDATE users SET role=?,active=1 WHERE id=?').run(role,users[index].id);
  db.prepare('INSERT INTO sessions(token,user_id) VALUES(?,?)').run('grn-delete-test-'+index,users[index].id);
}
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4397',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
let token='grn-delete-test-0';
async function call(route,body,status=200){const response=await fetch('http://127.0.0.1:4397/api/pharmacy'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Session':token},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;}
try{
  for(let i=0;i<60;i++){try{await call('/suppliers');break;}catch(error){if(i===59)throw Error(output+error);await new Promise(r=>setTimeout(r,250));}}
  const supplier=(await call('/suppliers'))[0],med=(await call('/medicines?limit=1')).rows[0];
  const initial=db.prepare('SELECT outstanding FROM suppliers WHERE id=?').get(supplier.id).outstanding;
  const purchase=await call('/purchases',{supplier_id:supplier.id,invoice_no:'DELETE-TEST-'+Date.now(),invoice_date:'2026-10-30',items:[{medicine_id:med.id,batch_no:'DELETE-TEST-'+Date.now(),expiry:'2029-12',qty:2,free_qty:0,pack_size:1,units_per_pack:10,rate:20,mrp:30,gst_pct:5}]});
  token='grn-delete-test-1';
  await call(`/purchases/${purchase.id}/request-deletion`,{reason:'Wrong supplier invoice'});
  await call(`/purchases/${purchase.id}/request-deletion`,{reason:'Duplicate request'},409);
  await call(`/purchases/${purchase.id}/review-deletion`,{decision:'approved',reason:'Not permitted'},403);
  assert.equal(db.prepare('SELECT status FROM purchases WHERE id=?').get(purchase.id).status,'received');
  token='grn-delete-test-2';
  await call(`/purchases/${purchase.id}/review-deletion`,{decision:'approved',reason:'Invoice verified as entered in error'});
  await call(`/purchases/${purchase.id}/review-deletion`,{decision:'approved',reason:'Repeat'},409);
  assert.equal(db.prepare('SELECT status FROM purchases WHERE id=?').get(purchase.id).status,'corrected');
  assert.equal(db.prepare('SELECT qty FROM medicine_batches WHERE purchase_id=?').get(purchase.id).qty,0);
  assert.ok(Math.abs(db.prepare('SELECT outstanding FROM suppliers WHERE id=?').get(supplier.id).outstanding-initial)<.01);
  assert.equal(db.prepare('SELECT status FROM grn_deletion_requests WHERE purchase_id=?').get(purchase.id).status,'approved');
  assert.ok(db.prepare("SELECT count(*) n FROM journal_vouchers WHERE reversal_of IN (SELECT id FROM journal_vouchers WHERE source='purchase' AND source_id=?)").get(purchase.id).n>0);
  token='grn-delete-test-0';
  const another=await call('/purchases',{supplier_id:supplier.id,invoice_no:'DELETE-REJECT-'+Date.now(),invoice_date:'2026-10-30',items:[{medicine_id:med.id,batch_no:'REJECT-'+Date.now(),expiry:'2029-12',qty:1,free_qty:0,pack_size:1,units_per_pack:10,rate:20,mrp:30,gst_pct:5}]});
  await call(`/purchases/${another.id}/request-deletion`,{reason:'Test self approval'});
  await call(`/purchases/${another.id}/review-deletion`,{decision:'approved',reason:'Self approval'},403);
  token='grn-delete-test-2';
  await call(`/purchases/${another.id}/review-deletion`,{decision:'rejected',reason:'Receipt is valid'});
  assert.equal(db.prepare('SELECT status FROM purchases WHERE id=?').get(another.id).status,'received');
  assert.equal(db.prepare('SELECT qty FROM medicine_batches WHERE purchase_id=?').get(another.id).qty,10);
  token='grn-delete-test-1';await call(`/purchases/${another.id}/request-deletion`,{reason:'Retry after rejection'});
  db.prepare('UPDATE medicine_batches SET qty=9 WHERE purchase_id=?').run(another.id);
  token='grn-delete-test-2';await call(`/purchases/${another.id}/review-deletion`,{decision:'approved',reason:'Used stock must block reversal'},409);
  assert.equal(db.prepare('SELECT status FROM grn_deletion_requests WHERE purchase_id=? ORDER BY id DESC LIMIT 1').get(another.id).status,'pending');
  console.log('PASS: in-charge requests; manager approves; duplicates and unauthorized approval blocked; stock and supplier balance reversed on isolated database.');
}finally{child.kill();db.close();console.log('Test copy retained at '+directory);}
