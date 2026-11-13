import {DatabaseSync} from 'node:sqlite';
const dbPath=process.argv[2];
if(!dbPath)throw Error('Explicit database path required');
const db=new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
try{
 const admin=db.prepare("SELECT id,name FROM users WHERE username='admin'").get();
 if(!admin)throw Error('Admin required for audit');
 const patients=db.prepare('SELECT id,uhid FROM patients ORDER BY id').all();
 let changed=0;
 for(const p of patients){
  if(/^P\d+$/.test(p.uhid))continue;
  let n=p.id;
  let uhid;
  do{uhid='P'+String(n++).padStart(6,'0');}while(db.prepare('SELECT id FROM patients WHERE uhid=? AND id<>?').get(uhid,p.id));
  db.prepare('UPDATE patients SET uhid=? WHERE id=?').run(uhid,p.id);
  db.prepare('INSERT INTO audit_log(user_id,user_name,action,entity,entity_id,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?)').run(admin.id,admin.name,'patient.uhid_format','patients',p.id,JSON.stringify({uhid:p.uhid}),JSON.stringify({uhid}),'User requested P plus numeric UHIDs for existing demo patients');
  changed++;
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key validation failed');
 db.exec('COMMIT');
 console.log(JSON.stringify({changed,total:patients.length,invalid:db.prepare("SELECT count(*) n FROM patients WHERE uhid NOT GLOB 'P[0-9]*'").get().n}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
