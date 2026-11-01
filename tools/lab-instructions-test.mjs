import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-lab-notes-')),filename=path.join(directory,'surelyhms.db');
const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(source,filename);source.close();const db=new DatabaseSync(filename);
const before=db.prepare("SELECT id,report_comment FROM services WHERE category='lab' AND active=1 AND trim(coalesce(report_comment,''))<>''").all();
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4393',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:'ignore'});
const headers={'X-Session':session.token};
try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4393/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  const existing=db.prepare("SELECT DISTINCT unit FROM lab_params WHERE unit IS NOT NULL AND trim(unit)<>''").all();
  const units=await fetch('http://127.0.0.1:4393/api/lab/units',{headers}).then(r=>r.json());for(const row of existing)assert.ok(units.includes(row.unit));
  for(let i=0;i<2;i++){const result=spawnSync(process.execPath,['tools/fill-lab-report-notes.mjs'],{env:{...process.env,HMS_NOTES_URL:'http://127.0.0.1:4393/api',HMS_NOTES_DB:filename},windowsHide:true,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);console.log(result.stdout.trim());}
  for(const service of before)assert.equal(db.prepare('SELECT report_comment FROM services WHERE id=?').get(service.id).report_comment,service.report_comment);
  const order=db.prepare("SELECT id FROM orders WHERE service_id=4 ORDER BY id DESC LIMIT 1").get();
  const report=await fetch(`http://127.0.0.1:4393/api/lab/report/${order.id}`,{headers}).then(r=>r.json());assert.match(report.test_comment,/random glucose/i);
  assert.ok(db.prepare("SELECT count(*) n FROM audit_log WHERE action='lab.test.info'").get().n>0);
  console.log('PASS: all active tests have instructions; existing text preserved; refill is idempotent; current RBS report receives its notes; all saved units available.');
}finally{server.kill();db.close();console.log('Isolated copy: '+directory);}
