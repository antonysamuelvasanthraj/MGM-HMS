import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const args=process.argv.slice(2);
const source=JSON.parse(fs.readFileSync('data/hsp-workbook.local.json','utf8').replace(/^\uFEFF/,''));
const clean=v=>String(v??'').trim();
const rows=source.sheets.find(s=>s.name==='PRODUCT').rows.slice(1).filter(r=>clean(r[0]));
const seen=new Set();
const products=rows.map((r,i)=>{
 const sourceCode=clean(r[1]);
 let code=sourceCode||`HSP-${i+1}`;
 if(seen.has(code))code=`${code}-HSP-ROW-${i+2}`;
 seen.add(code);
 const price=Number(r[6]); if(!Number.isFinite(price)||price<0)throw Error(`Invalid price: ${code}`);
 return {code,sourceCode,sourceRow:i+2,provider:clean(r[2]),name:clean(r[0]),price,tax:Number(r[5]||0),category:clean(r[3]),type:clean(r[4]),active:/available/i.test(clean(r[7]))?1:0};
});
console.log(JSON.stringify({sourceHash:source.sha256,products:products.length,roomCharges:products.filter(p=>/room|bed|ward/i.test(p.name+' '+p.category)),packageCharges:products.filter(p=>/package/i.test(p.name+' '+p.category))},null,2));
if(!args.includes('--apply'))process.exit(0);
const dbPath=args[args.indexOf('--db')+1];
if(!args.includes('--db')||!dbPath)throw Error('Explicit --db required');
const db=new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
try{
 db.exec('UPDATE services SET active=0');
 const providerRows=source.sheets.find(s=>s.name==='PROVIDER').rows.slice(1).filter(r=>clean(r[0]));
 db.prepare("UPDATE users SET active=0 WHERE role='doctor'").run();
 for(const [i,r] of providerRows.entries()){
  const staff=`HSP-DOC-${i+1}`;
  const department=clean(r[2])||'General Medicine';
  let dep=db.prepare('SELECT id FROM departments WHERE name=?').get(department);
  if(!dep){const added=db.prepare('INSERT INTO departments(code,name,kind,active) VALUES (?,?,?,1)').run(`HSP-DEP-${i+1}`,department,'clinical');dep={id:Number(added.lastInsertRowid)};}
  const old=db.prepare('SELECT id FROM users WHERE staff_code=?').get(staff);
  if(old)db.prepare('UPDATE users SET name=?,department_id=?,designation=?,mobile=?,active=1 WHERE id=?').run(clean(r[0]),dep.id,clean(r[3]),clean(r[1]),old.id);
  else db.prepare('INSERT INTO users(staff_code,username,password_hash,name,role,department_id,designation,mobile,active) VALUES (?,?,?,?,?,?,?,?,1)').run(staff,`hsp.doctor.${i+1}`,crypto.randomBytes(64).toString('hex'),clean(r[0]),'doctor',dep.id,clean(r[3]),clean(r[1]));
 }
 const find=db.prepare('SELECT id FROM services WHERE code=?');
 const add=db.prepare('INSERT INTO services(code,name,category,price,gst_pct,active,description) VALUES (?,?,?,?,?,?,?)');
 const update=db.prepare('UPDATE services SET name=?,category=?,price=?,gst_pct=?,active=?,description=? WHERE id=?');
 for(const p of products){
  const category=/lab|pathology|biochem|haemat|microbio/i.test(p.category)?'lab':/echo|scan|x.ray|radiol|ultra/i.test(p.category)?'imaging':/room|bed|ward/i.test(p.category)?'bed':/consult/i.test(p.category)?'consultation':'procedure';
  const description=JSON.stringify({source:'HSP Master Data.xlsx',sourceCode:p.sourceCode,sourceRow:p.sourceRow,provider:p.provider,sourceCategory:p.category,productType:p.type,sourceHash:source.sha256});
  const old=find.get(p.code);
  if(old)update.run(p.name,category,p.price,p.tax,p.active,description,old.id);
  else add.run(p.code,p.name,category,p.price,p.tax,p.active,description);
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign-key validation failed');
 db.exec('COMMIT');
 console.log('Tariffs imported; previous catalog archived to preserve historical bill references.');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
