import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-stock-locations-'));const source=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(source,path.join(directory,'surelyhms.db'));source.close();
const db=new DatabaseSync(path.join(directory,'surelyhms.db'));
const users=['pharmacy','pharmacy_admin','store'].map(role=>db.prepare('SELECT id,role FROM users WHERE role=? AND active=1 LIMIT 1').get(role));
for(const user of users){assert.ok(user);db.prepare('INSERT INTO sessions(token,user_id) VALUES(?,?)').run('location-test-'+user.role,user.id);}
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4395',HMS_HOST:'127.0.0.1',HMS_ENV:'test'},windowsHide:true,stdio:'ignore'});
async function call(route,role='pharmacy'){const r=await fetch('http://127.0.0.1:4395/api/pharmacy'+route,{headers:{'X-Session':'location-test-'+role}});assert.equal(r.status,200);return r.json();}
try{
  for(let i=0;i<60;i++){try{await call('/locations');break;}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,250));}}
  for(const user of users)for(const location of ['Central','OP','IP']){
    const stock=await call('/stock?location='+location,user.role),moves=await call('/stock/moves?location='+location,user.role);
    assert.ok(stock.rows.every(row=>row.location===location));assert.ok(moves.every(row=>row.location===location));
    const expected=db.prepare('SELECT round(coalesce(sum(qty*purchase_rate),0),2) value FROM medicine_batches WHERE qty>0 AND location=?').get(location).value;
    assert.equal(stock.summary.value,expected);
  }
  console.log('PASS: pharmacy, pharmacy in-charge and store roles can view Central/OP/IP stock; location totals and movements match the database.');
}finally{server.kill();db.close();console.log('Isolated copy: '+directory);}
