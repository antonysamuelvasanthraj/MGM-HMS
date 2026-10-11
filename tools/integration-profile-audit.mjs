/** Role/menu/API integration review on a disposable copy of the actual demo database. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { NAV, HIDDEN_ROUTES } from '../client/src/shell/nav.js';

const root=path.resolve(import.meta.dirname,'..');
process.chdir(root);
const dataDir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'surelyhms-test-profile-'));
const live=new DatabaseSync(path.join(root,'data/surelyhms.db'),{readOnly:true});
await backup(live,path.join(dataDir,'surelyhms.db')); live.close();
const probe=net.createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server/index.js'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),SURELY_DATA:dataDir,NODE_ENV:'test',HMS_INSTANCE:'isolated-profile-audit'},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
const endpoints={
 maintenance:['/maintenance/summary','/maintenance/tickets'],stores:['/stores/meta','/stores/items','/stores/requests'],counselling:['/counselling/meta','/counselling'],'visiting-doctors':['/visiting-doctors'],housekeeping:['/ipd/housekeeping'],
 dashboard:['/dashboard/role'], 'staff-workspace':['/staff-work/people','/staff-work/chat','/staff-work/tasks'],
 patients:['/patients','/patients/stats'],appointments:['/appointments'],'op-registration':['/queue'],
 'op-fee-collection':['/collection/op'],bills:['/bills'],'service-payments':['/service-queue'],
 'visit-tracking':['/queue'],'vitals-queue':['/queue'],'doctor-queue':['/queue'],'follow-up':['/doctor/workspace','/encounters?kind=OP'],
 'display-queue':['/queue/display'],consultation:['/queue'],'consultation-history':['/consultations'],orders:['/orders'],templates:['/templates'],certificates:['/certificates'],
 emergency:['/ipd/emergency'],admissions:['/ipd/beds','/ipd/admissions'],nursing:['/ipd/nursing/board'],indents:['/pharmacy/indents'],icu:['/ipd/icu'],discharge:['/ipd/discharge/board'],
 laboratory:['/lab/worklist','/lab/stats'],imaging:['/imaging/worklist'],'usg-reporting':['/imaging/worklist?modality=USG'],
 pharmacy:['/pharmacy/dispense/queue'],stock:['/pharmacy/stock','/pharmacy/stock/moves'],'stock-transfers':['/pharmacy/transfers','/pharmacy/locations'],
 grn:['/pharmacy/purchases'],medicines:['/pharmacy/medicines'],suppliers:['/pharmacy/suppliers'],'pharmacy-reports':['/pharmacy/analytics'],
 ot:['/ipd/ot'],maternity:['/ipd/maternity'],partograph:['/ipd/maternity'],approvals:['/approvals'],'day-report':['/desk/day','/desk/handover','/desk/shifts'],
 receipts:['/payments'],insurance:['/insurance/claims','/payers','/packages'],payers:['/payers'],messages:['/messages'],packages:['/packages'],
 accounts:['/accounts/position'],expenses:['/finance/expenses','/finance/expense-accounts'],'counter-reconciliation':['/counters/sessions'],reports:['/reports/catalog'],
 users:['/admin/users','/admin/roles'],settings:['/settings','/system/backups'],tariff:['/services','/admin/users'],wards:['/ipd/wards'],attendance:['/admin/roster'],audit:['/audit'],quality:['/quality'],
 'local-sync':['/sync','/system/health'],'my-access':['/admin/access/me','/system/health'],
};
const denyChecks=[['/patients','patient.view'],['/patients/stats','patient.view'],['/encounters','patient.view'],['/queue','patient.view'],['/lab/worklist','lab.view'],['/imaging/worklist','imaging.view'],['/orders','order.view'],['/certificates','certificate.view'],['/ipd/beds','ipd.view'],['/ipd/emergency','emergency.view'],['/ipd/ot','ot.view'],['/ipd/maternity','maternity.view'],['/admin/users',['admin.view','staff.manage']],['/audit','audit.view'],['/finance/expenses','expense.view'],['/accounts/position','finance.view']];
let token,checks=0;const failures=[],profiles=[],screens=[];
const can=(perms,perm)=>!perm||perms.includes('*')||(Array.isArray(perm)?perm.some(p=>can(perms,p)):perms.includes(perm)||perms.includes(perm.split('.')[0]+'.*'));
async function call(url,body,expected=200){const res=await fetch(`http://127.0.0.1:${port}/api${url}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-Session':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});checks++;const value=await res.json();if(res.status!==expected)failures.push({role:currentRole,url,status:res.status,expected,error:value.error});return value;}
let currentRole='admin';
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout: '+output)),30000);server.stdout.on('data',()=>{if(output.includes('sign in')){clearTimeout(timer);resolve();}});server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+output));});});
 token=(await call('/auth/login',{username:'admin',password:'surely'})).token; if(!token)throw Error('Admin login unavailable on test copy');
 const adminToken=token, meta=await call('/meta'), roles=(await call('/auth/roles')).roles;
 const department=meta.departments.find(d=>d.kind==='clinical');
 const patientRows=await call('/patients');
 const samplePatient=(patientRows.rows||patientRows.patients||[])[0];
 for(const group of NAV)for(const item of group.items){const name=item.route.split('?')[0].slice(1);const file=`client/src/views/${name}.js`;screens.push({section:group.section,label:item.label,route:item.route,permission:item.perm||'authenticated',controller:fs.existsSync(file),apis:endpoints[name]||[]});if(!fs.existsSync(file))failures.push({route:item.route,error:'missing_controller'});}
 for(const role of roles){
  currentRole=role;token=adminToken;
  if(role!=='admin'){const username='profile-check-'+role;await call('/admin/users',{username,name:'Isolated profile '+role,role,department_id:role==='doctor'?department.id:null,password:'Profile-test-only-1'});token=(await call('/auth/login',{username,password:'Profile-test-only-1'})).token;}
  const user=(await call('/auth/me')).user, perms=user.perms||[], board=await call('/dashboard/role');
  const menu=NAV.flatMap(g=>g.items.map(i=>({...i,section:g.section}))).filter(i=>can(perms,i.perm)&&(!i.hideIf||!can(perms,i.hideIf)));
  const profile={role,dashboard:board.view,availableDashboards:board.available,visibleMenu:menu.map(i=>i.route),reportCount:0};
  if(!board.view)failures.push({role,error:'missing_default_dashboard'});
  for(const view of board.available||[])await call('/dashboard/role?view='+view);
  const seen=new Set();
  for(const item of menu){const name=item.route.split('?')[0].slice(1);let urls=endpoints[name];
   if(name==='returns')urls=[...(can(perms,'pharmacy.view')?['/pharmacy/sales-returns']:[]),...(can(perms,'purchase.view')?['/pharmacy/purchase-returns']:[])];
   if(name==='accounts'&&item.route.includes('receivables'))urls=['/accounts/receivables'];
   if(name==='reports'&&item.route.includes('report='))urls=[...urls,'/reports/run/'+new URLSearchParams(item.route.split('?')[1]).get('report')];
   if(!urls?.length)failures.push({role,route:item.route,error:'missing_api_mapping'});
   for(const url of urls||[])if(!seen.has(url)){seen.add(url);await call(url);}
  }
  for(const [url,perm]of denyChecks)if(!can(perms,perm))await call(url,undefined,403);
  await call('/staff-work/chat?before=invalid',undefined,400);
  await call('/staff-work/chat?before=1');
  const taskPeople=await call('/staff-work/people');
  if(taskPeople.can_assign){
   await call('/staff-work/tasks',{title:'Invalid calendar date',assigned_to:user.id,due_at:'2026-02-30T12:00'},400);
   const blocked=taskPeople.rows.find(p=>!p.can_assign);
   if(blocked)await call('/staff-work/tasks',{title:'Blocked cross-department task',assigned_to:blocked.id},403);
  }
  if(samplePatient&&can(perms,'patient.view')){
   const profileData=await call('/patients/'+samplePatient.id+'/timeline');
   if(!can(perms,'patient.clinical')&&profileData.consultations?.length)failures.push({role,error:'clinical_profile_leak'});
   if(!can(perms,'insurance.view')&&profileData.claims?.length)failures.push({role,error:'claim_profile_leak'});
  }
  if(!can(perms,'patient.view')){const search=await call('/search?q=Samuel');if(search.results?.length)failures.push({role,error:'restricted_role_patient_search'});}
  const catalog=await call('/reports/catalog');profile.reportCount=catalog.reports.length;
  for(const report of catalog.reports)await call('/reports/run/'+report.id);
  profiles.push(profile);
 }
 const result={checkedLocal:new Date().toLocaleString('en-IN',{timeZone:'Asia/Calcutta'}),passed:!failures.length,apiChecks:checks,source:'isolated copy of actual demo database; temporary audit accounts only in the copy',sections:NAV.length,menuEntries:screens.length,uniqueControllers:new Set(screens.map(s=>s.route.split('?')[0])).size,hiddenRoutes:HIDDEN_ROUTES,screens,profiles,failures};
 fs.writeFileSync('data/integration-profile-audit.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:result.passed,apiChecks:checks,roles:profiles.length,menuEntries:screens.length,failures},null,2));
 if(failures.length)process.exitCode=1;
}finally{
 server.kill(); await once(server,'exit').catch(()=>{});
 // Do not delete any directory except the independently verified isolated copy.
 const actual=fs.realpathSync(dataDir);if(path.dirname(actual)===fs.realpathSync(os.tmpdir())&&path.basename(actual).startsWith('surelyhms-test-profile-'))fs.rmSync(actual,{recursive:true,force:true});
}
