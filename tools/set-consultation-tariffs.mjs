import {DatabaseSync} from 'node:sqlite';
if(!process.argv[2])throw Error('Database path required');
const db=new DatabaseSync(process.argv[2]);db.exec('BEGIN IMMEDIATE');
try{
 const rows=db.prepare("SELECT id,code,name,price FROM services WHERE lower(name) LIKE '%consult%' ORDER BY id").all();
 const ip=rows.find(r=>/^ip\s*consult/i.test(r.name)&&r.price===500)||rows.find(r=>/^ip\s*consult/i.test(r.name));
 const op=rows.find(r=>/^(op\s*)?consultation$/i.test(r.name.trim())&&r.price===300)||rows.find(r=>/^consultation$/i.test(r.name.trim()));
 if(!ip||!op||ip.id===op.id)throw Error('Separate OP and IP consultation masters required');
 db.prepare("UPDATE services SET active=0 WHERE lower(name) LIKE '%consult%'").run();
 db.prepare("UPDATE services SET name='OP Consultation',price=300,active=1,category='consultation' WHERE id=?").run(op.id);
 db.prepare("UPDATE services SET name='IP Consultation',price=500,active=1,category='consultation' WHERE id=?").run(ip.id);
 db.exec('COMMIT');console.log(JSON.stringify({activeConsultations:db.prepare("SELECT name,price FROM services WHERE active=1 AND lower(name) LIKE '%consult%'").all(),historicalBillsPreserved:true}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
