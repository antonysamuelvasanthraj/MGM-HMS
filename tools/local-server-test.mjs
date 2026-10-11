import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fork,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createBackup,verifyBackup} from '../deployment/backup.mjs';
import {readConfig} from '../deployment/config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hms-local-test-'));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const config={appDir:root,dataDir:path.join(temp,'data'),backupDir:path.join(temp,'backups'),logDir:path.join(temp,'logs'),port,host:'127.0.0.1',backupHours:6,keepBackups:2};
const configFile=path.join(temp,'config.json');fs.writeFileSync(configFile,JSON.stringify(config));
let supervisor,extra;let output='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await delay(200);}throw new Error('Timed out: '+output);}
const health=async()=>{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(2000)});return r.ok?await r.json():null;};
const launch=()=>{const c=fork(path.join(root,'deployment/supervisor.mjs'),[configFile],{silent:true,windowsHide:true});c.stdout.on('data',d=>output+=d);c.stderr.on('data',d=>output+=d);return c;};
try {
  assert.equal(readConfig(configFile).port,port);
  const missing=spawnSync(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,SURELY_DATA:config.dataDir,HMS_REQUIRE_EXISTING_DB:'1'},encoding:'utf8',windowsHide:true});
  assert.notEqual(missing.status,0);assert.equal(fs.existsSync(path.join(config.dataDir,'surelyhms.db')),false);
  const init=spawnSync(process.execPath,['--input-type=module','-e',"import {seed} from './server/seed.js';import {db} from './server/db.js';seed();db.close();"],{cwd:root,env:{...process.env,SURELY_DATA:config.dataDir},encoding:'utf8',windowsHide:true});
  assert.equal(init.status,0,init.stderr);
  fs.mkdirSync(path.join(config.dataDir,'uploads','order','1'),{recursive:true});
  fs.writeFileSync(path.join(config.dataDir,'uploads','order','1','test.pdf'),'test attachment bytes');
  const db=new DatabaseSync(path.join(config.dataDir,'surelyhms.db'));
  db.prepare("INSERT INTO attachments(entity,entity_id,file_name,mime,size,path) VALUES ('order',1,'test.pdf','application/pdf',21,?)").run(path.join('order','1','test.pdf'));db.close();
  supervisor=launch();const first=await until(health);assert.equal(first.service,'mgm-hms');
  const css=await fetch(`http://127.0.0.1:${port}/app.css`);assert.equal(css.status,200);assert.equal(css.headers.get('cache-control'),'no-cache');
  const login=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'surely'})});assert.equal(login.status,200);
  extra=launch();await until(()=>extra.exitCode!==null);assert.notEqual(extra.exitCode,0);assert.equal((await health()).instance,first.instance);
  await until(()=>JSON.parse(fs.readFileSync(path.join(config.logDir,'status.json'))).lastBackup);
  const before=JSON.parse(fs.readFileSync(path.join(config.logDir,'status.json')));
  process.kill(before.serverPid);const recovered=await until(async()=>{const h=await health();return h?.instance!==first.instance?h:null;});assert.notEqual(recovered.instance,first.instance);
  console.log('PASS: local startup, login/assets, missing-DB protection, port conflict, crash recovery');
  const b1=await createBackup(config);const manifest=await verifyBackup(b1);assert.equal(manifest.files.length,2);
  const restored=path.join(temp,'restored');
  const restore=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'deployment/Restore-Backup.ps1'),'-Backup',b1,'-Destination',restored],{encoding:'utf8',windowsHide:true});
  assert.equal(restore.status,0,restore.stderr);assert.equal(fs.readFileSync(path.join(restored,'uploads/order/1/test.pdf'),'utf8'),'test attachment bytes');
  const restoredDb=new DatabaseSync(path.join(restored,'surelyhms.db'),{readOnly:true});assert.ok(restoredDb.prepare('SELECT count(*) n FROM users').get().n);restoredDb.close();
  await createBackup(config);assert.equal(fs.readdirSync(config.backupDir).filter(n=>!n.endsWith('.partial')).length,2);
  fs.appendFileSync(path.join(b1,'uploads/order/1/test.pdf'),'corrupt');await assert.rejects(verifyBackup(b1),/checksum/);
  console.log('PASS: online backup, integrity/checksums, attachment restore, retention, corruption rejection');
  // Windows Task Scheduler may terminate the supervisor abruptly: IPC loss must
  // close its server so the next boot/retry can safely acquire the port.
  supervisor.kill();await until(()=>supervisor.exitCode!==null || supervisor.signalCode!==null);
  await until(async()=>{try{await health();return false;}catch{return true;}});
  supervisor=launch();await until(health);
  console.log('PASS: supervisor termination stops its child; stale-lock recovery');
  supervisor.send('shutdown');await until(()=>supervisor.exitCode!==null);assert.equal(supervisor.exitCode,0);
  assert.equal(fs.existsSync(path.join(config.logDir,'supervisor.lock')),false);
  console.log('PASS: graceful supervisor/server shutdown');
} finally {
  for(const c of [extra,supervisor])if(c&&c.exitCode===null&&c.signalCode===null){c.kill();await until(()=>c.exitCode!==null||c.signalCode!==null).catch(()=>{});}
  const resolved=path.resolve(temp);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('hms-local-test-'))fs.rmSync(resolved,{recursive:true,force:true});
}
