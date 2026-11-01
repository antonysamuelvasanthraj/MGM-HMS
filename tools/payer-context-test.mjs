import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-payer-context-'));const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(source,path.join(directory,'surelyhms.db'));source.close();
const db=new DatabaseSync(path.join(directory,'surelyhms.db'));
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const payer=db.prepare("SELECT id FROM payers WHERE active=1 AND payer_type IN ('insurance','tpa') ORDER BY id LIMIT 1").get();assert.ok(payer);
const lab=db.prepare("SELECT id FROM services WHERE category='lab' AND active=1 LIMIT 1").get();
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4392',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:'ignore'});
async function call(route,body,method=body===undefined?'GET':'POST'){const response=await fetch('http://127.0.0.1:4392/api'+route,{method,headers:{'Content-Type':'application/json','X-Session':session.token},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
try{
 for(let i=0;i<60;i++){try{await call('/health');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,250));}}
 const patient=await call('/patients',{name:'Payer context QA '+Date.now(),gender:'Female',age_years:30,payer_type:'self'});
 const first=await call('/bills',{patient_id:patient.id,bill_type:'LAB',items:[{service_id:lab.id,qty:1,rate:100}]});
 const encounter=db.prepare('SELECT encounter_id FROM bills WHERE id=?').get(first.id).encounter_id;
 for(const type of ['OP','PHARM'])await call('/bills',{patient_id:patient.id,encounter_id:encounter,bill_type:type,items:[{description:'Test '+type,category:'other',qty:1,rate:20}]});
 await call(`/encounters/${encounter}/payer`,{category:'insurance',payer_id:payer.id,reason:'Test consistent payer across departments'});
 let context=await call(`/patients/${patient.id}/billing-context?encounter_id=${encounter}`);assert.equal(context.encounter_id,encounter);assert.equal(context.payer_type,'insurance');
 assert.ok(db.prepare("SELECT payer_type FROM bills WHERE encounter_id=?").all(encounter).every(row=>row.payer_type==='insurance'));
 const queue=await call(`/lab/worklist?q=${encodeURIComponent(patient.name)}`);assert.ok(queue.rows.every(row=>row.financial_category==='insurance' && row.auth_status==='pending'));
 for(const type of ['OP','LAB','PHARM']){const created=await call('/bills',{patient_id:patient.id,encounter_id:encounter,bill_type:type,items:type==='LAB'?[{service_id:lab.id,qty:1,rate:100}]:[{description:'Next '+type,category:'other',qty:1,rate:20}]});assert.equal(created.payer_type,'insurance');}
 await call(`/encounters/${encounter}/payer`,{category:'self',reason:'Return to self-pay',reverse_payer_entries:true});
 context=await call(`/patients/${patient.id}/billing-context?encounter_id=${encounter}`);assert.equal(context.payer_type,'self');
 assert.ok(db.prepare("SELECT auth_status FROM orders WHERE encounter_id=?").all(encounter).every(row=>row.auth_status==='not_required'));
 const books=db.prepare('SELECT sum(debit) debit,sum(credit) credit FROM journal_lines').get();assert.ok(Math.abs(books.debit-books.credit)<.01);
 console.log('PASS: selected category, existing and new OP/LAB/PHARM bills, lab authorization and return to self-pay stay consistent; books balanced.');
}finally{server.kill();db.close();console.log('Isolated copy: '+directory);}
