import {DatabaseSync} from 'node:sqlite';
const file=process.argv[2];if(!file)throw Error('Database path required');
const db=new DatabaseSync(file);db.exec('BEGIN IMMEDIATE');
try{
 const rows=db.prepare('SELECT id,name,price,gst_pct,category,billing_unit FROM services WHERE active=1 ORDER BY id').all();
 const seen=new Map();let retired=0;
 for(const row of rows){
  const key=JSON.stringify([row.name.trim().replace(/\s+/g,' ').toLowerCase(),row.price,row.gst_pct,row.category,row.billing_unit]);
  if(seen.has(key)){db.prepare('UPDATE services SET active=0 WHERE id=?').run(row.id);retired++;}
  else seen.set(key,row.id);
 }
 db.exec('COMMIT');console.log(JSON.stringify({checked:rows.length,retired,remaining:rows.length-retired}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
