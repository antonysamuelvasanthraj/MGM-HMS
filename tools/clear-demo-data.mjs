/** Offline, explicitly requested cleanup. Never called by server startup. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { createBackup } from '../deployment/backup.mjs';

export const KEEP_TABLES = new Set(['users','settings','departments','counters','services','lab_params','wards','beds','accounts','sequences','role_permissions']);
const quote = name => '"'+name.replaceAll('"','""')+'"';
export function inspect(database,keepTables=KEEP_TABLES) {
  const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const counts=Object.fromEntries(tables.map(t=>[t,database.prepare(`SELECT count(*) n FROM ${quote(t)}`).get().n]));
  const admin=database.prepare("SELECT id,username,role,active FROM users WHERE username='admin' AND role='admin'").get();
  if(!admin||!admin.active)throw new Error('An active admin login must already exist; no password will be reset.');
  return {admin,counts,preserved:tables.filter(t=>keepTables.has(t)),cleared:tables.filter(t=>!keepTables.has(t))};
}
export async function clearDemoData(dataDir,backupDir,{preserveLogins=false,preserveMasters=false}={}) {
  const keepTables=new Set(KEEP_TABLES);
  if(preserveMasters){if(!preserveLogins)throw new Error('Preserved templates require preserved login owners.');for(const table of ['templates','payers','packages','package_items','service_rates','doctor_schedules','medicine_generics','medicine_brands','medicine_manufacturers'])keepTables.add(table);}
  dataDir=fs.realpathSync(dataDir);backupDir=path.resolve(backupDir);
  if(backupDir===dataDir||backupDir.startsWith(dataDir+path.sep))throw new Error('Use a backup directory outside the active data directory.');
  const file=path.join(dataDir,'surelyhms.db');
  const source=new DatabaseSync(file,{readOnly:true});
  let before,usersBefore;try{before=inspect(source,keepTables);usersBefore=source.prepare('SELECT * FROM users ORDER BY id').all();}finally{source.close();}
  const backup=await createBackup({dataDir,backupDir,keepBackups:1000});
  const uploads=path.join(dataDir,'uploads');
  if(fs.existsSync(uploads)&&fs.realpathSync(uploads)!==uploads)throw new Error('Uploads is a linked directory; cleanup refused.');
  const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
  let moved=false;
  try {
    const current=inspect(db,keepTables);
    if(JSON.stringify(current.counts)!==JSON.stringify(before.counts))throw new Error('Database changed during backup. Stop the server and retry.');
    // Maintenance is explicitly authorised and offline. Restore identical triggers
    // within the same transaction, so operational immutability remains intact.
    const triggers=db.prepare("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL").all().filter(t=>before.cleared.includes(t.tbl_name));
    for(const trigger of triggers)db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
    for(const table of before.cleared)db.exec(`DELETE FROM ${quote(table)}`);
    for(const trigger of triggers)db.exec(trigger.sql);
    if(!preserveLogins)db.prepare('DELETE FROM users WHERE id<>?').run(before.admin.id);
    if(preserveLogins&&JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all())!==JSON.stringify(usersBefore))throw new Error('Login records changed; cleanup refused.');
    db.exec("UPDATE beds SET status='vacant'; UPDATE sequences SET next_val=1;");
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Cleanup would leave invalid references. Rolled back.');
    db.prepare('INSERT INTO audit_log (user_id,user_name,action,entity,detail,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?)').run(
      before.admin.id,'Hospital Administrator','system.demo_cleanup','database',JSON.stringify({backup}),
      JSON.stringify(before.counts),JSON.stringify({preservedLogins:preserveLogins?usersBefore.length:1,patients:0,transactions:0}),
      preserveLogins?'User requested removal of all demo data while preserving every login':'User confirmed all existing records were test data and requested admin-only setup');
    if(fs.existsSync(uploads)){fs.renameSync(uploads,path.join(backup,'archived-upload-directory'));moved=true;}
    db.exec('COMMIT; PRAGMA foreign_keys=ON; PRAGMA wal_checkpoint(TRUNCATE);');
    const after=inspect(db,keepTables);
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Post-cleanup integrity check failed; restore the saved backup.');
    const result={backup,admin:after.admin,counts:after.counts};
    fs.writeFileSync(path.join(backup,'cleanup-summary.json'),JSON.stringify(result,null,2));
    return result;
  } catch(e) {
    try{db.exec('ROLLBACK');if(moved)fs.renameSync(path.join(backup,'archived-upload-directory'),uploads);}catch{}
    throw e;
  } finally {db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const dataDir=path.resolve(process.argv[2]||'data');
  if(!process.argv.includes('--apply-confirmed-test-data')){
    const db=new DatabaseSync(path.join(dataDir,'surelyhms.db'),{readOnly:true});try{console.log(JSON.stringify(inspect(db),null,2));}finally{db.close();}
  }else{
    if(!process.argv.includes('--server-stopped'))throw new Error('Stop the hospital server before using this offline maintenance tool.');
    console.log(JSON.stringify(await clearDemoData(dataDir,path.resolve(process.argv[3]),{preserveLogins:process.argv.includes('--preserve-logins'),preserveMasters:process.argv.includes('--preserve-masters')}),null,2));
  }
}
