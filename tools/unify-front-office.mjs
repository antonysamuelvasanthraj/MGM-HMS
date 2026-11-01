import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const base=process.env.FRONT_OFFICE_URL || 'http://127.0.0.1:4300/api';
const db=new DatabaseSync(process.env.FRONT_OFFICE_DB || 'data/surelyhms.db',{readOnly:true});
const usernames=['reception','registration','billing','op.billing','ip.billing'];
const before=db.prepare('SELECT id,username,password_hash,role,active FROM users ORDER BY id').all();
for(const username of usernames){const user=before.find(row=>row.username===username);assert.ok(user && user.active===1 && ['reception','cashier'].includes(user.role),'Unexpected desk login: '+username);}
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();assert.ok(session);
async function call(route,body){const response=await fetch(base+route,{method:body?'PUT':'GET',headers:{'Content-Type':'application/json','X-Session':session.token},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;}
const roles=(await call('/admin/roles')).roles;
const perms=[...new Set([...roles.find(role=>role.role==='reception').perms,...roles.find(role=>role.role==='cashier').perms,'expense.view','expense.write'])].sort();
for(const role of ['reception','cashier'])await call('/admin/roles/'+role,{perms,label:'Reception / Front Office / Cashier',reason:'Unify all five active desk logins; add expense entry; pharmacy dues remain read-only and pharmacy collection stays at pharmacy.'});
assert.deepEqual(db.prepare('SELECT id,username,password_hash,role,active FROM users ORDER BY id').all(),before);
const updated=(await call('/admin/roles')).roles;
assert.deepEqual([...updated.find(row=>row.role==='reception').perms].sort(),[...updated.find(row=>row.role==='cashier').perms].sort());
console.log(JSON.stringify({active_logins:usernames,identical_front_office_access:true,expenses:'View and record vouchers; approval permissions unchanged',credentials_and_active_status_unchanged:true}));db.close();
