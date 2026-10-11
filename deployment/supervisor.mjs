import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.mjs';

const c=readConfig(process.argv[2]);
const configFile=path.resolve(process.argv[2]);
const here=path.dirname(fileURLToPath(import.meta.url));
for (const d of [c.logDir,c.backupDir]) fs.mkdirSync(d,{recursive:true});
const logFile=path.join(c.logDir,'server.log');
function log(text) {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size>10*1024*1024) {
    for(let i=4;i>=1;i--) { const from=logFile+'.'+i; if(fs.existsSync(from)) fs.renameSync(from,logFile+'.'+(i+1)); }
    fs.renameSync(logFile,logFile+'.1');
  }
  fs.appendFileSync(logFile,`${new Date().toISOString()} ${String(text).trim()}\n`);
}
if (!fs.existsSync(path.join(c.dataDir,'surelyhms.db'))) throw new Error('Database missing. Initialize or restore explicitly before starting.');
for(const file of ['server/index.js','client/app.css','node_modules/express/package.json']) if(!fs.existsSync(path.join(c.appDir,file)))throw new Error(`Installation incomplete: ${file}`);
// Refuse conflicts without touching any unrelated process on the same machine.
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(c.port,c.host,()=>s.close(resolve));});
const lock=path.join(c.logDir,'supervisor.lock');
if(fs.existsSync(lock)) {
  const previous=JSON.parse(fs.readFileSync(lock,'utf8'));
  let alive=true;try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
  if(alive)throw new Error('Another supervisor may be running. Inspect the lock and process before restarting.');
  fs.unlinkSync(lock);
}
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
let child,backupChild,stopping=false,restartTimer,healthTimer,backupTimer,checking=false,failures=0,restarts=0,lastBackup=null,backupError=null;
const statusFile=path.join(c.logDir,'status.json');
function status(state,extra={}) { fs.writeFileSync(statusFile,JSON.stringify({state,supervisorPid:process.pid,serverPid:child?.pid,port:c.port,restarts,lastBackup,backupError,at:new Date().toISOString(),...extra},null,2)); }
function runBackup() {
  if(stopping||backupChild)return;
  let output='';
  backupChild=fork(path.join(here,'backup.mjs'),[configFile],{silent:true,windowsHide:true});
  const worker=backupChild;
  worker.stdout.on('data',d=>{output+=d;});worker.stderr.on('data',d=>log('[backup] '+d));
  worker.on('error',e=>log('[backup] '+e.message));
  const timeout=setTimeout(()=>{log('[backup] timed out after one hour');worker.kill();},3600000);
  worker.on('exit',code=>{clearTimeout(timeout);backupChild=null;if(code===0){lastBackup=new Date().toISOString();backupError=null;log('[backup] '+output);}else{backupError='Backup failed. Check server.log and disk space.';log(backupError);}status(child?'running':'restarting');});
}
function launch() {
  if(stopping)return;
  const instance=crypto.randomUUID();failures=0;const started=Date.now();
  child=fork(path.join(c.appDir,'server/index.js'),[],{cwd:c.appDir,silent:true,windowsHide:true,env:{...process.env,NODE_ENV:'production',SURELY_DATA:c.dataDir,PORT:String(c.port),HMS_HOST:c.host,HMS_INSTANCE:instance,HMS_REQUIRE_EXISTING_DB:'1'}});
  const worker=child;log(`[start] pid=${worker.pid}`);status('starting');
  worker.stdout.on('data',d=>log(d));worker.stderr.on('data',d=>log(d));worker.on('error',e=>log(e.message));
  healthTimer=setInterval(async()=>{
    if(checking||stopping||child!==worker)return;checking=true;
    try {
      const response=await fetch(`http://127.0.0.1:${c.port}/api/health`,{signal:AbortSignal.timeout(5000)});
      const health=await response.json();
      if(!response.ok||health.instance!==instance||health.status!=='ok')throw new Error('Health identity or database check failed');
      failures=0;if(Date.now()-started>300000)restarts=0;status('running');
    } catch(e) {
      log('[health] '+e.message);
      if(++failures>=3){log('[health] restarting owned server');worker.kill();}
    } finally {checking=false;}
  },15000);
  worker.on('exit',(code,signal)=>{
    clearInterval(healthTimer);child=null;log(`[exit] code=${code} signal=${signal}`);
    if(stopping)return finish();
    restarts++;const delay=Math.min(60000,2000*2**Math.min(restarts,5));status('restarting',{delayMs:delay});
    restartTimer=setTimeout(launch,delay);
  });
}
function finish(){try{fs.unlinkSync(lock);}catch{}status('stopped');process.exit(0);}
function shutdown(){if(stopping)return;stopping=true;clearTimeout(restartTimer);clearInterval(healthTimer);clearInterval(backupTimer);backupChild?.kill();log('[stop] requested');if(child?.connected){child.send('shutdown');setTimeout(()=>{child?.kill();},12000).unref();}else finish();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);process.on('message',m=>{if(m==='shutdown')shutdown();});
if(process.connected)process.on('disconnect',shutdown);
launch();runBackup();backupTimer=setInterval(runBackup,c.backupHours*3600000);
