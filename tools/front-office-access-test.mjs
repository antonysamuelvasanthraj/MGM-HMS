import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-front-office-')),filename=path.join(directory,'surelyhms.db');const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(source,filename);source.close();
const db=new DatabaseSync(filename);const admin=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const desks=['reception','registration','billing','op.billing','ip.billing'];for(const username of desks){const user=db.prepare('SELECT id FROM users WHERE username=?').get(username);db.prepare('INSERT INTO sessions(token,user_id) VALUES(?,?)').run('desk-test-'+username,user.id);}
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4391',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:'ignore'});
async function call(token,route,body,method=body===undefined?'GET':'POST',status=200){const response=await fetch('http://127.0.0.1:4391/api'+route,{method,headers:{'Content-Type':'application/json','X-Session':token},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,status,route+': '+JSON.stringify(value));return value;}
try{
 for(let i=0;i<60;i++){try{await call(admin.token,'/health');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,250));}}
 const setup=spawnSync(process.execPath,['tools/unify-front-office.mjs'],{env:{...process.env,FRONT_OFFICE_DB:filename,FRONT_OFFICE_URL:'http://127.0.0.1:4391/api'},windowsHide:true,encoding:'utf8'});if(setup.status!==0)throw Error(setup.stderr);console.log(setup.stdout.trim());
 const patient=await call(admin.token,'/patients',{name:'Desk readonly pharmacy QA '+Date.now(),gender:'Male',age_years:40});
 const pharmacy=await call(admin.token,'/bills',{patient_id:patient.id,bill_type:'PHARM',items:[{description:'Read-only pharmacy demo',category:'pharmacy',qty:1,rate:333}]});
 const reception=await call(admin.token,'/bills',{patient_id:patient.id,bill_type:'OP',items:[{description:'Desk test charge',category:'other',qty:1,rate:70}]});
 let expectedPerms;
 for(const username of desks){const token='desk-test-'+username;const me=await call(token,'/auth/me');const perms=[...me.user.perms].sort();if(expectedPerms)assert.deepEqual(perms,expectedPerms);else expectedPerms=perms;
  const overview=await call(token,'/pharmacy-bills-overview');assert.ok(overview.rows.some(row=>row.id===pharmacy.id&&row.view_only===true));
  const record=await call(token,`/patients/${patient.id}/timeline`);assert.equal(record.pharmacy_pending_bills.length,1);assert.equal(record.pharmacy_pending_bills[0].balance,333);assert.ok(record.bills.every(row=>row.bill_type!=='PHARM'));
  await call(token,'/finance/expenses');const expense=await call(token,'/finance/expenses',{head:'Desk QA only',amount:1,mode:'cash'});assert.equal(expense.status,'pending');await call(token,`/finance/expenses/${expense.id}`,{status:'approved'},'PATCH',403);
  await call(token,'/payments',{bill_id:pharmacy.id,amount:1,mode:'cash'},'POST',403);
  await call(token,'/payments/split',{bill_id:pharmacy.id,components:[{mode:'cash',amount:1}]},'POST',403);
  await call(token,`/bills/${pharmacy.id}/settle`,{lines:[{mode:'cash',amount:1}]},'POST',403);
  await call(token,`/bills/${pharmacy.id}`,{notes:'Must stay readonly'},'PATCH',403);
  await call(token,`/bills/${pharmacy.id}/cancel`,{reason:'Must stay readonly'},'POST',403);
  await call(token,'/payments',{bill_id:reception.id,amount:1,mode:'cash'});
 }
 assert.equal(db.prepare('SELECT paid FROM bills WHERE id=?').get(pharmacy.id).paid,0);
 assert.equal(db.prepare('SELECT paid FROM bills WHERE id=?').get(reception.id).paid,5);
 console.log('PASS: all five desks have equal access, see pending pharmacy bills read-only, can record expenses, cannot approve them or collect/edit/cancel pharmacy bills, and can collect reception bills.');
}finally{server.kill();db.close();console.log('Isolated copy: '+directory);}
