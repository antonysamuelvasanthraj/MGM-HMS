/** Explicit offline factory reset. Keeps only the existing Admin credentials. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';

if (!process.argv.includes('--confirm-full-reset-keep-admin')) throw new Error('Explicit full-reset confirmation required');
const dataDir=path.resolve(process.env.SURELY_DATA || 'data');
const listening=await new Promise(resolve=>{
  const socket=net.connect(Number(process.env.PORT || 4300),'127.0.0.1');
  socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));
});
if(listening)throw new Error('Stop the HMS server and its restart launcher before resetting');
const source=new DatabaseSync(path.join(dataDir,'surelyhms.db'),{readOnly:true});
const admin=source.prepare("SELECT * FROM users WHERE username='admin' AND role='admin' AND active=1").get();
source.close();
if(!admin)throw new Error('Existing active Admin required; no password will be reset');
process.env.SURELY_DATA=dataDir;
const {db}=await import('../server/db.js');
const {seed}=await import('../server/seed.js');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL").all();
db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
try {
  for(const t of triggers)db.exec(`DROP TRIGGER ${quote(t.name)}`);
  for(const t of tables)db.exec(`DELETE FROM ${quote(t.name)}`);
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get())db.exec('DELETE FROM sqlite_sequence');
  seed();
  const fresh=db.prepare("SELECT id FROM users WHERE username='admin'").get();
  db.prepare('UPDATE users SET username=?,password_hash=?,name=?,active=1 WHERE id=?').run(admin.username,admin.password_hash,admin.name,fresh.id);
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('demo_mode','0')").run();
  for(const t of triggers)db.exec(t.sql);
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Reset leaves invalid references');
  if(db.prepare('SELECT count(*) n FROM users').get().n!==1)throw new Error('Only Admin may remain');
  if(db.prepare('SELECT password_hash FROM users').get().password_hash!==admin.password_hash)throw new Error('Admin credential mismatch');
  db.prepare('INSERT INTO audit_log(user_id,user_name,action,entity,reason) VALUES (?,?,?,?,?)').run(fresh.id,admin.name,'system.full_reset','database','User explicitly requested full reset including masters/settings; keep only Admin login');
  db.exec('COMMIT; PRAGMA foreign_keys=ON; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integrity check failed');
  const counts={};for(const table of ['users','patients','bills','payments','medicine_batches','medicines','suppliers','templates'])counts[table]=db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  console.log(JSON.stringify({reset:true,adminCredentialsPreserved:true,counts,defaults:'Fresh installation defaults; previous masters/settings removed'}));
} catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
