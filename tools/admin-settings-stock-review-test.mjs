import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-admin-review-')),filename=path.join(directory,'surelyhms.db');const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(source,filename);source.close();
const db=new DatabaseSync(filename);const admin=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();

const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4392',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:'ignore'});
let checks=0;
async function call(route,body,method=body===undefined?'GET':'POST',status=200){const response=await fetch('http://127.0.0.1:4392/api'+route,{method,headers:{'Content-Type':'application/json','X-Session':admin.token},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,status,route+': '+JSON.stringify(value));checks++;return value;}
try{
for(let i=0;i<60;i++){try{await call('/health');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,250));}}
const before=await call('/settings');const sourceText=fs.readFileSync('client/src/views/settings.js','utf8');
const keys=[...new Set([...sourceText.matchAll(/(?:text|toggle)\('([^']+)'/g)].map(m=>m[1]))].filter(k=>!k.includes('sms')&&!k.includes('whatsapp')&&!k.includes('token')&&!k.includes('secret'));
const roundtrip=Object.fromEntries(keys.filter(k=>before[k]!==undefined).map(k=>[k,before[k]]));await call('/settings',roundtrip,'PATCH');const after=await call('/settings');for(const [key,value]of Object.entries(roundtrip))assert.equal(after[key],value,key);
for(const theme of ['maroon','calm']){await call('/settings',{ui_theme:theme},'PATCH');assert.equal((await call('/meta')).settings.ui_theme,theme);}
const toggleKeys=[...new Set([...sourceText.matchAll(/toggle\('([^']+)'/g)].map(m=>m[1]))].filter(k=>k!=='reminders_enabled');
for(const key of toggleKeys){for(const value of ['0','1']){await call('/settings',{[key]:value},'PATCH');assert.equal((await call('/meta')).settings[key],value);}await call('/settings',{[key]:before[key]??'1'},'PATCH');}

const doctor=db.prepare("SELECT id FROM users WHERE role='doctor' AND active=1 LIMIT 1").get();
const first=await call('/patients',{name:'Token review old patient',gender:'Male',age_years:30});
const old=await call('/encounters',{patient_id:first.id,doctor_id:doctor.id,collect:false});db.prepare("UPDATE encounters SET visit_date='2024-01-01',token_no=99999 WHERE id=?").run(old.encounter.id);
await call('/settings',{token_reset:'never'},'PATCH');const second=await call('/patients',{name:'Token continuous review',gender:'Male',age_years:30});const continuing=await call('/encounters',{patient_id:second.id,doctor_id:doctor.id,collect:false});assert.equal(continuing.encounter.token_no,100000);
db.prepare("UPDATE encounters SET visit_date='2024-01-02' WHERE id=?").run(continuing.encounter.id);await call('/settings',{token_reset:'daily'},'PATCH');const expected=db.prepare("SELECT coalesce(max(token_no),0)+1 n FROM encounters WHERE doctor_id=? AND visit_date=date('now','localtime')").get(doctor.id).n;const third=await call('/patients',{name:'Token daily review',gender:'Male',age_years:30});const daily=await call('/encounters',{patient_id:third.id,doctor_id:doctor.id,collect:false});assert.equal(daily.encounter.token_no,expected);await call('/settings',{token_reset:'invalid'},'PATCH',400);
const discountedPatient=await call('/patients',{name:'Discount verification patient',gender:'Female',age_years:30});const discountedBill=await call('/bills',{patient_id:discountedPatient.id,bill_type:'OP',discount:20,discount_reason:'Verified service and overall concessions',items:[{description:'Reception service',category:'other',qty:1,rate:100,discount:10}],collect:true,mode:'cash',collect_amount:70});assert.equal(discountedBill.total,70);assert.equal(discountedBill.paid,70);assert.equal(discountedBill.balance,0);assert.equal(db.prepare('SELECT discount FROM bill_items WHERE bill_id=?').get(discountedBill.id).discount,10);assert.equal(db.prepare('SELECT discount FROM bills WHERE id=?').get(discountedBill.id).discount,20);
const batch=db.prepare('SELECT * FROM medicine_batches WHERE qty>2 AND purchase_rate>0 LIMIT 1').get();assert.ok(batch);
await call('/pharmacy/stock/adjust',{batch_id:batch.id,qty:-1,expected_qty:batch.qty,move_type:'damage',reason:'Isolated review damaged unit'});assert.equal(db.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batch.id).qty,batch.qty-1);
await call('/pharmacy/stock/adjust',{batch_id:batch.id,qty:1,expected_qty:batch.qty,reason:'Stale count rejected'},'POST',409);
await call('/pharmacy/stock/adjust',{batch_id:batch.id,qty:1,expected_qty:batch.qty-1,reason:'Isolated review count correction'});assert.equal(db.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batch.id).qty,batch.qty);
assert.equal(db.prepare('SELECT count(*) n FROM (SELECT voucher_id FROM journal_lines GROUP BY voucher_id HAVING abs(sum(debit)-sum(credit))>0.01)').get().n,0);
assert.ok(db.prepare("SELECT count(*) n FROM audit_log WHERE action='stock.adjust'").get().n>=2);
const owner=db.prepare("SELECT id FROM users WHERE role='owner' AND active=1 LIMIT 1").get();
if(owner){
  const original=admin.token;admin.token='settings-readonly-regression';
  db.prepare('INSERT INTO sessions(token,user_id) VALUES (?,?)').run(admin.token,owner.id);
  await call('/settings');
  await call('/settings',{hospital_name:'Must not change'},'PATCH',403);
  await call('/admin/clinic-sessions',{},'POST',403);
  await call('/admin/clinic-sessions/1',{},'PATCH',403);
  admin.token=original;
  assert.equal((await call('/settings')).hospital_name,before.hospital_name);
}
console.log(JSON.stringify({passed:true,checks,settingsRoundtrip:Object.keys(roundtrip).length,themes:true,policySwitches:toggleKeys.length,tokenNumberingModes:true,stockAdjustmentAccounting:true,combinedServiceAndOverallDiscount:true,staleCountBlocked:true,liveDataUntouched:true}));
}finally{server.kill();db.close();}
