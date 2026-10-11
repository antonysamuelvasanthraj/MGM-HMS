import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import {spawnSync} from 'node:child_process';import {clearDemoData} from './clear-demo-data.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'hms-reference-cleanup-')),dir=path.join(base,'data');fs.mkdirSync(dir);
const src=new DatabaseSync('data/surelyhms.db',{readOnly:true});const before=JSON.stringify(src.prepare('SELECT * FROM users ORDER BY id').all());await backup(src,path.join(dir,'surelyhms.db'));src.close();
try{
 const cleaned=await clearDemoData(dir,path.join(base,'backups'),{preserveLogins:true,preserveMasters:true});
 const seed=()=>{const r=spawnSync(process.execPath,['tools/seed-reference-masters.mjs'],{env:{...process.env,SURELY_DATA:dir},encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const added=seed();const again=seed();assert.ok(Object.values(again).every(n=>n===0),'Reference seed must be idempotent');
 const d=new DatabaseSync(path.join(dir,'surelyhms.db'),{readOnly:true});assert.equal(JSON.stringify(d.prepare('SELECT * FROM users ORDER BY id').all()),before);for(const table of ['patients','encounters','bills','payments','medicine_batches','ward_replacements','cash_handovers','shift_handovers','lab_results','admissions'])assert.equal(d.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(d.prepare('PRAGMA foreign_key_check').all().length,0);d.close();
 console.log(JSON.stringify({passed:true,loginsPreserved:true,transactionsCleared:true,referenceSeedIdempotent:true,added},null,2));
}finally{const actual=fs.realpathSync(base);if(path.dirname(actual)===fs.realpathSync(os.tmpdir())&&path.basename(actual).startsWith('hms-reference-cleanup-'))fs.rmSync(actual,{recursive:true,force:true});}
