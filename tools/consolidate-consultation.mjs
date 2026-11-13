import {DatabaseSync} from 'node:sqlite';
const file=process.argv[2];if(!file)throw Error('Database required');
const db=new DatabaseSync(file);db.exec('BEGIN IMMEDIATE');
try{
 const rows=db.prepare("SELECT id,price FROM services WHERE lower(trim(name))='consultation' ORDER BY CASE WHEN price=300 THEN 0 WHEN price>0 THEN 1 ELSE 2 END,id").all();
 if(!rows.length)throw Error('No consultation service');
 const keep=rows[0];
 db.prepare("UPDATE services SET active=0 WHERE lower(trim(name))='consultation' AND id<>?").run(keep.id);
 db.prepare('UPDATE services SET active=1 WHERE id=?').run(keep.id);
 db.exec('COMMIT');console.log(JSON.stringify({consultationPrice:keep.price,retired:rows.length-1}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
