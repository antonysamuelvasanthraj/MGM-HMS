import {DatabaseSync} from 'node:sqlite';
if(!process.argv[2])throw Error('Database required');
const db=new DatabaseSync(process.argv[2]);
db.exec('BEGIN IMMEDIATE');
try{
db.exec("UPDATE services SET active=1,price=CASE WHEN price>0 THEN price ELSE 250 END WHERE category='lab'; UPDATE lab_params SET active=1 WHERE service_id IN (SELECT id FROM services WHERE category='lab'); UPDATE packages SET active=1,price=CASE WHEN price>0 THEN price ELSE coalesce((SELECT sum(s.price*i.qty) FROM package_items i JOIN services s ON s.id=i.service_id WHERE i.package_id=packages.id),250) END WHERE category='Lab package';");
if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Invalid references');
db.exec('COMMIT');console.log(db.prepare("SELECT count(*) active_lab_tests FROM services WHERE category='lab' AND active=1").get());
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
