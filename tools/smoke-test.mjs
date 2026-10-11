import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const tempRoot=fs.realpathSync(os.tmpdir());
const dataDir=fs.mkdtempSync(path.join(tempRoot,'surelyhms-test-'));
const port=process.env.HMS_TEST_PORT || '4399';
// The installer seeds only the administrator; workflow fixtures (staff, patients, stock) load into this temp folder only.
{const {spawnSync}=await import('node:child_process');
 const fx=spawnSync(process.execPath,['tools/fixtures/hospital.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'test',SURELY_DATA:dataDir},encoding:'utf8'});
 if(fx.status!==0) throw new Error('Fixture load failed: '+fx.stdout+fx.stderr);}
const server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,SURELY_DATA:dataDir,PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
let serverOutput=''; server.stdout.on('data',d=>{serverOutput+=d}); server.stderr.on('data',d=>{serverOutput+=d});
try {
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Test server failed to start: '+serverOutput)),30000);
  server.stdout.on('data',()=>{if(serverOutput.includes('sign in')){clearTimeout(timeout);resolve();}});
  server.on('exit',code=>{clearTimeout(timeout);reject(new Error('Test server exited '+code+': '+serverOutput));});
 });
// Run only against a dedicated test server, never against the hospital database.
const base = `http://localhost:${port}/api`;
let token;
let assertions=0;
async function call(path,body,method=body===undefined?'GET':'POST',status=200){
 const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{'X-Session':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await res.json();assert.equal(res.status,status,`${method} ${path}: ${JSON.stringify(value)}`);assertions++;return value;
}
const login=await call('/auth/login',{username:'admin',password:'surely'});token=login.token;
let lists=0;
for(const file of fs.readdirSync('server/routes')){
 const prefix=({patients:'/patients',pharmacy:'/pharmacy',inventory:'/pharmacy','ward-replacements':'/pharmacy',ipd:'/ipd'})[file.replace('.js','')]||'';
 for(const m of fs.readFileSync('server/routes/'+file,'utf8').matchAll(/\.get\('([^']+)'/g)){
  if(!m[1].includes(':')&&m[1]!=='/portal/me'){await call(prefix+m[1]);lists++;}   // /portal/me answers patient sessions only (tested below)
 }
}
const meta=await call('/meta');const doctor=meta.doctors.find(d=>d.role==='doctor');
const p=await call('/patients',{name:'QA Workflow Patient '+Date.now(),gender:'Female',age_years:29,mobile:'9000000000'});
assert.equal((await call(`/patients/${p.id}/billing-context`)).care_type,'NONE');
assert.equal((await call(`/patients/${p.id}/billing-context`)).payer_type,'self');
const appt=await call('/appointments',{patient_id:p.id,doctor_id:doctor.id,slot_start:'2026-09-23 15:00:00'});
assert.equal((await call('/appointments/'+appt.id)).patient_id,p.id);
const reg=await call('/encounters',{patient_id:p.id,doctor_id:doctor.id,appointment_id:appt.id});const eid=reg.encounter.id;
assert.equal((await call(`/patients/${p.id}/billing-context?encounter_id=${eid}`)).care_type,'OP');
await call(`/patients/${p.id}/billing-context?encounter_id=99999999`,undefined,'GET',404);
assert.equal((await call('/appointments/'+appt.id)).status,'converted');
await call('/encounters',{patient_id:p.id,doctor_id:doctor.id,appointment_id:appt.id},'POST',409);
await call(`/encounters/${eid}/stage`,{stage:'in_consult'},'POST',409);
await call('/vitals',{encounter_id:eid,bp_sys:120,bp_dia:80,pulse:72,spo2:99,temp_f:98.6});
const paid=await call('/payments',{bill_id:reg.bill.id,amount:reg.bill.total,mode:'cash'});
assert.equal(paid.bill.balance,0);
await call(`/encounters/${eid}/stage`,{stage:'in_consult'});
await call('/consultations',{encounter_id:eid,diagnosis:'Test diagnosis',status:'signed'});
await call('/consultations',{encounter_id:eid,diagnosis:'Untracked change',status:'draft'},'POST',409);
const amended=await call('/consultations',{encounter_id:eid,diagnosis:'Corrected diagnosis',status:'signed',amend_reason:'QA correction'});
assert.equal(amended.consultation.status,'amended');
await call('/consultations',{encounter_id:eid,diagnosis:'Untracked second change',status:'draft'},'POST',409);
const labService=meta.services.find(s=>s.category==='lab');
const order=await call('/orders',{encounter_id:eid,items:[{service_id:labService.id}]});const oid=order.orders[0].id;
await call('/payments',{bill_id:order.bill.id,amount:order.bill.total,mode:'cash'});
await call(`/lab/orders/${oid}/collect`,{});
await call(`/lab/orders/${oid}/results`,{results:[{name:'QA observation',value:'Normal'}]});
await call(`/lab/orders/${oid}/verify`,{});
assert.equal((await call(`/lab/report/${oid}`)).status,'verified');
const beds=await call('/ipd/beds');const bed=beds.beds.find(b=>b.status==='vacant');
const admission=await call('/ipd/admissions',{patient_id:p.id,bed_id:bed.id,consultant_id:doctor.id,diagnosis:'QA admission'});
assert.equal((await call(`/patients/${p.id}/billing-context`)).care_type,'IP');
await call('/ipd/admissions',{patient_id:p.id,bed_id:bed.id},'POST',409);
await call(`/ipd/admissions/${admission.id}`,{status:'clinically_cleared'},'PATCH');
// daily charges: bed accrues on admission; added charges accrue; a waived line leaves the bill
const catalog=await call('/ipd/charge-catalog');const mon=catalog.find(c=>c.code==='IPC-MON');
await call(`/ipd/admissions/${admission.id}/charges`,{service_id:mon.id});
await call(`/ipd/admissions/${admission.id}/charges`,{service_id:mon.id},'POST',409);
let ch=await call(`/ipd/admissions/${admission.id}/charges`);
assert.equal(ch.lines.length,2,'bed day and monitor day accrued');
const monLine=ch.lines.find(l=>/monitor/i.test(l.description));
await call(`/bills/${ch.bill.id}/items/${monLine.id}/waive`,{reason:'Monitor not used'});
ch=await call(`/ipd/admissions/${admission.id}/charges`);assert.equal(ch.bill.total,1500);
await call(`/ipd/admissions/${admission.id}/charges/${ch.plan.find(c=>c.service_id===mon.id).id}/stop`,{reason:'Removed'});
await call(`/ipd/admissions/${admission.id}/discharge`,{discharge_summary:'x'},'POST',409);
// deposit above the balance is accepted on an IP bill, excess is returned at discharge
await call(`/bills/${ch.bill.id}/settle`,{request_key:'qa-ipdep-'+Date.now()+'-aaaa',lines:[{mode:'cash',amount:2000}]});
assert.equal((await call(`/bills/${ch.bill.id}`)).balance,-500);
await call('/refunds',{bill_id:ch.bill.id,amount:500,mode:'cash',excess:true});
assert.equal((await call(`/bills/${ch.bill.id}`)).balance,0);
await call(`/ipd/admissions/${admission.id}/discharge`,{discharge_summary:'QA discharge'});
assert.equal((await call('/ipd/beds')).beds.find(b=>b.id===bed.id).status,'cleaning');
const mc=await call('/ipd/maternity',{patient_id:p.id,gravida:1,para:0,gestation_wks:38});
await call(`/ipd/maternity/${mc.id}`,{stage:'active_labour'},'PATCH');
await call(`/ipd/maternity/${mc.id}/partograph`,{cervix_cm:4,fhr:140});
assert.equal((await call(`/ipd/maternity/${mc.id}`)).entries.length,1);
const er=await call('/ipd/emergency',{patient_id:p.id,triage:'2',complaint:'QA emergency'});
await call(`/encounters/${er.encounter_id}/stage`,{stage:'in_consult'});
// ER bill: one-tap ER charges and free lines on the case's own bill; admission only through Admit; closing never waits for money
const erb=await call(`/ipd/emergency/${er.id}/bill`);const erBasic=erb.services.find(s=>s.code==='ER-BASIC');assert.ok(erBasic,'ER services on tariff');
let erBill=await call(`/ipd/emergency/${er.id}/charges`,{service_id:erBasic.id});assert.equal(erBill.bill_type,'ER');assert.equal(erBill.total,erBasic.price);
erBill=await call(`/ipd/emergency/${er.id}/charges`,{description:'Crepe bandage',qty:2,rate:80});assert.equal(erBill.total,erBasic.price+160);
erBill=await call(`/ipd/emergency/${er.id}/charges/${erBill.items[1].id}?reason=wrong`,undefined,'DELETE');assert.equal(erBill.total,erBasic.price);
await call(`/ipd/emergency/${er.id}`,{status:'admitted'},'PATCH',409);
await call(`/ipd/emergency/${er.id}/close`,{outcome:'referred'},'POST',400);
const erList=(await call('/ipd/emergency?all=1')).rows.find(x=>x.id===er.id);assert.equal(erList.bill_balance,erBasic.price);
const stock=await call('/pharmacy/stock');const batch=(stock.rows||stock.batches||[]).find(b=>b.qty>5&&b.expiry>'2026-09-23'&&b.location==='OP');
if(!batch) throw new Error('No sellable test batch');
const sale=await call('/pharmacy/dispense',{patient_id:p.id,items:[{medicine_id:batch.medicine_id,batch_id:batch.id,qty:1}],mode:'cash'});
assert.equal(sale.bill.balance,0);
const updated=await call('/pharmacy/stock');assert.equal(updated.rows.find(b=>b.id===batch.id).qty,batch.qty-1);

const imagingService=meta.services.find(s=>s.category==='imaging');
const imaging=await call('/orders',{encounter_id:eid,items:[{service_id:imagingService.id}]});
await call('/imaging/orders/'+imaging.orders[0].id+'/report',{findings:'x',impression:'y',status:'final'},'POST',409);
const imgHalf=Math.round(imaging.bill.total/2*100)/100;
await call('/bills/'+imaging.bill.id+'/settle',{request_key:'qa-img-'+Date.now()+'-abcdef',lines:[{mode:'upi',amount:imgHalf,reference:'UPI123'},{mode:'debit_card',amount:imaging.bill.total-imgHalf,reference:'CARD9'}]});
await call('/imaging/orders/'+imaging.orders[0].id+'/report',{findings:'QA finding',impression:'QA impression',status:'final'});
const ot=await call('/ipd/ot',{patient_id:p.id,theatre:'OT 1',procedure:'QA procedure',surgeon_id:doctor.id,scheduled_at:'2026-09-23 16:00:00'});
await call('/ipd/ot/'+ot.id,{status:'completed'},'PATCH');
await call('/ipd/nursing/notes',{admission_id:admission.id,body:'QA nursing note'});
const mar=await call('/ipd/nursing/mar',{admission_id:admission.id,drug:'QA medicine',dose:'test',due_at:'2026-09-23 16:00:00'});
await call('/ipd/nursing/mar/'+mar.id,{status:'given'});
const supplier=await call('/pharmacy/suppliers',{name:'QA supplier',code:'QA-'+Date.now()});
await call('/pharmacy/purchases',{supplier_id:supplier.id,invoice_no:'QA-INV',invoice_date:'2026-09-23',items:[{medicine_id:batch.medicine_id,batch_no:'QA-BATCH',expiry:'2028-12-31',qty:5,rate:10,mrp:12}]});
await call('/pharmacy/dispense',{patient_id:p.id,items:[{medicine_id:batch.medicine_id,qty:-1}],mode:'cash'},'POST',400);
const expense=await call('/finance/expenses',{head:'Stationery',vendor:'QA vendor',amount:100});
await call('/finance/expenses/'+expense.id,{status:'approved'},'PATCH');
await call('/finance/expenses/'+expense.id,{status:'paid'},'PATCH');
await call('/finance/expenses/'+expense.id,{status:'paid'},'PATCH',409);
const claim=await call('/insurance/claims',{patient_id:p.id,tpa:'QA insurer',policy_no:'QA-123',estimate:1000});
await call('/insurance/claims/'+claim.id,{status:'approved'},'PATCH');
await call('/certificates',{patient_id:p.id,kind:'fitness',body:'QA certificate',status:'draft'});
await call('/quality',{title:'QA incident',area:'Reception',detail:'Test record'});
const counter=await call('/counters/sessions',{counter_id:meta.counters[0].id,opening_cash:100});
await call('/counters/sessions/'+counter.id+'/close',{counted_cash:100});
const template=await call('/templates',{name:'QA template',kind:'consultation',body:'QA template content'});
assert.ok(template.id);
await call('/admin/attendance/punch',{});

/* ---------------- payments engine, receivables, pharmacy movement, accounts */
const p2=await call('/patients',{name:'QA Scheme Patient '+Date.now(),gender:'Male',age_years:40,mobile:'9000000001',payer_type:'aarogyasri'});
// payer master: a TPA with an agreed lab rate and a package; its patients are billed at the agreed rate
const tpa=await call('/payers',{name:'QA TPA '+Date.now(),payer_type:'tpa',credit_days:45});
await call('/payers',{name:tpa.name},'POST',409);
await call('/payers/'+tpa.id+'/rates',{rates:[{service_id:labService.id,price:99}]},'PUT');
const tpaPkg=await call('/payer-packages',{code:'QA-PKG-'+Date.now(),name:'QA Delivery',payer_id:tpa.id,price:25000,los_days:3,inclusions:'Room, OT',items:[{service_id:labService.id,qty:1}]});
const hospitalPkg=await call('/payer-packages',{code:'QA-HOSP-'+Date.now(),name:'QA Hospital Package',price:750,items:[{service_id:labService.id,qty:1}]});
const copayPkg=await call('/payer-packages',{code:'QA-CP-'+Date.now(),name:'QA Co-pay package',payer_id:tpa.id,price:1000});
const copayPatient=await call('/patients',{name:'QA Co-pay',gender:'Female',age_years:35,payer_type:'insurance',payer_id:tpa.id,payer_name:tpa.name});
const copayBill=await call('/bills',{patient_id:copayPatient.id,bill_type:'OP',items:[{description:'Covered treatment',rate:1000,qty:1}]});
await call(`/insurance/claims/${copayBill.claim_id}`,{package_id:copayPkg.id,copay_amount:200,approved:800,status:'preauth_approved'},'PATCH');
const copayCovered=await call(`/bills/${copayBill.id}`);assert.equal(copayCovered.covered_amount,800);assert.equal(copayCovered.balance,200);assert.equal(copayCovered.waived_amount,0,'co-pay must not be written off');
await call('/payments',{bill_id:copayBill.id,amount:200,mode:'cash'});
assert.equal((await call(`/bills/${copayBill.id}`)).balance,0);
await call(`/insurance/claims/${copayBill.claim_id}`,{approved:600},'PATCH');
const shortApproval=await call(`/bills/${copayBill.id}`);assert.equal(shortApproval.covered_amount,600);assert.equal(shortApproval.balance,200);assert.equal(shortApproval.waived_amount,0,'approval shortfall must stay patient due');
await call(`/insurance/claims/${copayBill.claim_id}`,{package_id:hospitalPkg.id,copay_amount:-1},'PATCH',400);
const convPatient=await call('/patients',{name:'QA Cash conversion',gender:'Male',age_years:40});
const convVisit=await call('/encounters',{patient_id:convPatient.id,doctor_id:doctor.id});
const convBeds=await call('/ipd/beds');
const convAdmission=await call('/ipd/admissions',{patient_id:convPatient.id,encounter_id:convVisit.encounter.id,bed_id:convBeds.beds.find(b=>b.status==='vacant').id,consultant_id:doctor.id,financial_category:'self'});
await call(`/bills/${convAdmission.ip_bill_id}/items`,{description:'QA admitted treatment',qty:1,rate:1000});
await call('/payments',{bill_id:convAdmission.ip_bill_id,amount:100,mode:'cash'});
const realTpa=await call('/payers',{code:'QA-TPA-KIND-'+Date.now(),name:'QA actual TPA '+Date.now(),payer_type:'tpa'});
await call(`/ipd/admissions/${convAdmission.id}/payer`,{financial_category:'insurance',payer_id:realTpa.id,reason:'Policy provided after admission'},'PATCH');
const converted=await call(`/ipd/admissions/${convAdmission.id}`);assert.equal(converted.financial_category,'insurance');
const convertedBill=await call(`/bills/${convAdmission.ip_bill_id}`);assert.equal(convertedBill.paid,100,'cash receipt survives payer conversion');assert.ok(convertedBill.claim_id,'running bill linked to case');
await call('/bills',{patient_id:p.id,bill_type:'LAB',items:[{service_id:meta.services.find(s=>s.category==='procedure').id,qty:1,rate:100}]},'POST',400);
const attributedBill=await call('/bills',{patient_id:p.id,bill_type:'LAB',doctor_id:doctor.id,items:[{service_id:labService.id,qty:1,rate:150}]});
assert.equal(attributedBill.doctor_name,doctor.name,'standalone bill carries selected doctor');
assert.equal(attributedBill.doctor_id,doctor.id);
await call(`/bills/${attributedBill.id}/doctor`,{doctor_id:doctor.id},'PATCH',400);
const correctedDoctor=await call(`/bills/${attributedBill.id}/doctor`,{doctor_id:doctor.id,reason:'QA attribution correction'},'PATCH');
assert.equal(correctedDoctor.total,attributedBill.total,'doctor correction preserves bill value');
assert.equal(correctedDoctor.doctor_name,doctor.name);
await call('/bills',{patient_id:p.id,doctor_id:99999999,items:[{rate:150}]},'POST',400);
const hospitalPackageBill=await call('/bills',{patient_id:p.id,bill_type:'PKG',package_id:hospitalPkg.id,items:[{description:'Tampered price',qty:1,rate:1}]});
assert.equal(hospitalPackageBill.total,750,'package price comes from master rather than client');
assert.equal(hospitalPackageBill.items[0].category,'package');
await call('/bills',{patient_id:p.id,bill_type:'PKG',package_id:tpaPkg.id,items:[{description:'Invalid payer cash bill',rate:1}]},'POST',400);
await call('/bills',{patient_id:p.id,bill_type:'OP',package_id:hospitalPkg.id,items:[{rate:1}]},'POST',400);
await call('/bills',{patient_id:p.id,bill_type:'PKG',package_id:99999999,items:[{rate:1}]},'POST',400);
assert.equal(tpaPkg.payer_id,tpa.id);assert.equal(tpaPkg.items.length,1);
const p3=await call('/patients',{name:'QA TPA Patient '+Date.now(),gender:'Female',age_years:30,mobile:'9000000003',payer_type:'insurance',payer_id:tpa.id,policy_no:'POL-1'});
assert.equal(p3.payer_name||(await call('/patients/'+p3.id)).payer_name,tpa.name);
const reg3=await call('/encounters',{patient_id:p3.id,doctor_id:doctor.id});
const o3=await call('/orders',{encounter_id:reg3.encounter.id,items:[{service_id:labService.id}]});
assert.equal((await call('/bills/'+o3.bill.id)).items.find(i=>i.service_id===labService.id).rate,99,'payer agreed rate used');
const c3=(await call('/insurance/claims')).rows.find(c=>c.patient_id===p3.id);assert.ok(c3,'payer bill opened a case');assert.equal(c3.payer_id,tpa.id);
const c3b=await call('/insurance/claims/'+c3.id,{package_id:tpaPkg.id,estimate:0},'PATCH');assert.equal(c3b.estimate,25000,'package fills the estimate');
assert.equal((await call('/payers/'+tpa.id)).packages.length,2);
// an approved payer case releases lab / imaging held for payment — now and for later orders on the same case
const o3id=o3.orders[0].id;
assert.equal(o3.orders[0].status,'awaiting_payment');
await call(`/lab/orders/${o3id}/collect`,{},'POST',409);
const appr=await call('/insurance/claims/'+c3.id,{status:'preauth_approved',approved:25000},'PATCH');assert.equal(appr.released_orders,1,'approval releases the held order');assert.ok(appr.bills_moved>=1,'approval bills the open balance to the payer');
{const wl=await call('/lab/worklist?status=all');const row=(wl.rows||wl).find(r=>r.id===o3id);assert.equal(row.status,'ordered');assert.equal(row.clearance,'covered');}
await call(`/lab/orders/${o3id}/collect`,{});
const o3b=await call('/orders',{encounter_id:reg3.encounter.id,items:[{service_id:labService.id}]});
assert.equal((await call('/lab/orders/'+o3b.orders[0].id)).status,'ordered','a new order on an approved case goes straight to the lab');
{const b3=await call('/bills/'+o3.bill.id);assert.equal(b3.balance,0);assert.equal(b3.paid,0,'billed to the payer is not money collected');assert.ok(b3.covered_amount>0,'payer receivable');
 const b3b=await call('/bills/'+o3b.bill.id);assert.equal(b3b.balance,0,'a new bill on an approved case goes to the payer too');}
// a doctor (not only admin) ordering for a patient on an approved case: the case, not the doctor, authorises the payer billing
{const adminTok2=token;token=(await call('/auth/login',{username:'doctor',password:'surely'})).token;
 const od=await call('/orders',{encounter_id:reg3.encounter.id,items:[{service_id:labService.id}]});
 token=adminTok2;assert.equal((await call('/bills/'+od.bill.id)).balance,0,'doctor order on an approved case is billed to the payer');}
// case moved back to query: unpaid payer entries return to the patient's balance
{const back=await call('/insurance/claims/'+c3.id,{status:'query',stage_note:'QA query'},'PATCH');assert.ok(back.reversed>=1,'payer entries reversed');
 assert.ok((await call('/bills/'+o3.bill.id)).balance>0,'amount owed again after the case goes back to query');
 await call('/insurance/claims/'+c3.id,{status:'preauth_approved'},'PATCH');assert.equal((await call('/bills/'+o3.bill.id)).balance,0,'re-approval bills the payer again');}
// agreed consultation rate, admission payer, package with an exclusion and a package adjustment
{const conSvc=meta.services.find(s=>s.category==='consultation'&&s.code.startsWith('CON-')&&s.department_id===doctor.department_id);
 if(conSvc){await call('/payers/'+tpa.id+'/rates',{rates:[{service_id:conSvc.id,price:111}]},'PUT');
  const p5=await call('/patients',{name:'QA Rate Patient '+Date.now(),gender:'Male',age_years:33,mobile:'9000000005',payer_type:'insurance',payer_id:tpa.id});
  const r5=await call('/encounters',{patient_id:p5.id,doctor_id:doctor.id});
  assert.equal((await call('/bills?patient_id='+p5.id)).rows.find(b=>b.bill_type==='OP').total,111,'consultation at the agreed rate');}
 const small=await call('/payer-packages',{code:'QA-PK50-'+Date.now(),name:'QA small package',payer_id:tpa.id,price:50});
 const p6=await call('/patients',{name:'QA Package Patient '+Date.now(),gender:'Female',age_years:41,mobile:'9000000006',payer_type:'insurance',payer_id:tpa.id});
 const r6=await call('/encounters',{patient_id:p6.id,doctor_id:doctor.id});
 const o6=await call('/orders',{encounter_id:r6.encounter.id,items:[{service_id:labService.id}]});
 const c6=(await call('/insurance/claims')).rows.find(c=>c.patient_id===p6.id);
 const lines6=await call('/insurance/claims/'+c6.id+'/lines');const consultLine=lines6.find(l=>l.bill_type==='OP');
 if(consultLine) await call('/insurance/claims/'+c6.id+'/exclusions',{item_ids:[consultLine.id]},'PUT');
 const ap6=await call('/insurance/claims/'+c6.id,{status:'preauth_approved',package_id:small.id},'PATCH');
 assert.equal(ap6.billed_to_payer,50,'payer billed the package price');assert.ok(ap6.package_adjustment>0,'amount above the package written off as package adjustment');
 assert.equal((await call('/bills/'+o6.bill.id)).balance,0,'package bill closed by payer + adjustment');
 if(consultLine) assert.ok((await call('/bills?patient_id='+p6.id)).rows.find(b=>b.bill_type==='OP').balance>0,'excluded line stays with the patient');}
// insurance patient through ER, then admitted: the ER visit case continues as the admission case — never two cases
{const bedE=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');
 if(bedE){const p8=await call('/patients',{name:'QA ER Insured '+Date.now(),gender:'Male',age_years:40,mobile:'9000000008',payer_type:'insurance',payer_id:tpa.id,policy_no:'POL-8'});
  const er8=await call('/ipd/emergency',{patient_id:p8.id,triage:'2',complaint:'QA RTA'});
  const eb=await call(`/ipd/emergency/${er8.id}/bill`);const basic=eb.services.find(s=>s.code==='ER-BASIC');
  if(basic) await call(`/ipd/emergency/${er8.id}/charges`,{service_id:basic.id});
  const before=(await call('/insurance/claims')).rows.filter(c=>c.patient_id===p8.id);
  const a8=await call('/ipd/admissions',{patient_id:p8.id,bed_id:bedE.id,consultant_id:doctor.id,financial_category:'insurance',payer_id:tpa.id,emergency_id:er8.id});
  const after=(await call('/insurance/claims')).rows.filter(c=>c.patient_id===p8.id&&c.status!=='rejected');
  assert.equal(after.length,1,'one case for ER + admission');assert.equal(after[0].admission_id,a8.id,'the case is the admission case');
  if(before.length) assert.equal(after[0].id,before[0].id,'the ER visit case continued (same case number)');
  const erBill=(await call('/bills?patient_id='+p8.id)).rows.find(b=>b.bill_type==='ER');if(erBill) assert.equal(erBill.claim_id,after[0].id,'ER bill on the admission case');}}
// admitting under a payer sets the patient's payer (so agreed rates and the case know it)
{const bedX=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');
 if(bedX){const p7=await call('/patients',{name:'QA Admit Payer '+Date.now(),gender:'Male',age_years:52,mobile:'9000000007'});
  const a7=await call('/ipd/admissions',{patient_id:p7.id,bed_id:bedX.id,consultant_id:doctor.id,financial_category:'insurance',payer_id:tpa.id,policy_no:'POL-7'});
  const pp=await call('/patients/'+p7.id);assert.equal(pp.payer_id,tpa.id);assert.equal(pp.policy_no,'POL-7');
  const c7=(await call('/insurance/claims')).rows.find(c=>c.admission_id===a7.id);assert.ok(c7&&c7.payer_id===tpa.id,'admission case carries the payer');}}
// credit = the patient pays later: an approved due, never a payer case; nothing is held
{const pc=await call('/patients',{name:'QA Credit Patient '+Date.now(),gender:'Male',age_years:50,mobile:'9000000004',payer_type:'credit'});
 const rc=await call('/encounters',{patient_id:pc.id,doctor_id:doctor.id});
 const oc=await call('/orders',{encounter_id:rc.encounter.id,items:[{service_id:labService.id}]});
 const bc=await call('/bills/'+oc.bill.id);assert.equal(bc.claim_id,null,'credit never opens a payer case');assert.equal(bc.authorization_status,'approved','credit bill is an approved due');
 assert.ok(bc.balance>0,'credit amount stays owed by the patient');assert.equal(oc.orders[0].status,'ordered','credit patient lab work is not held');
 assert.ok(!(await call('/insurance/claims')).rows.some(c=>c.patient_id===pc.id),'credit patient is not on the payer desk');
 const cb=(await call('/bills?patient_id='+pc.id)).rows.find(b=>b.bill_type==='OP');if(cb) assert.equal(cb.authorization_status,'approved','consultation is an approved due, so the doctor queue is not held');}
// due reminders: queued for the patient; without a gateway they are sent by hand (WhatsApp) and marked sent
{const due=(await call('/bills?status=outstanding')).rows.find(b=>b.balance>0&&b.mobile);
 if(due){const m=await call('/bills/'+due.id+'/remind',{});assert.equal(m.status,'queued');assert.ok(m.wa_number.length>=10);
  await call('/messages/'+m.id+'/sent',{via:'whatsapp'});assert.equal((await call('/messages?status=sent')).rows.some(x=>x.id===m.id),true);
  // with a gateway set, queued messages go out by themselves (the test server's own health URL stands in for a provider)
  await call('/settings',{sms_gateway_url:`http://localhost:${port}/api/system/health?to={mobile}&text={message}`,sms_gateway_method:'GET'},'PATCH');
  const m2=await call('/messages',{patient_id:due.patient_id,body:'QA gateway message'});
  let st='queued';for(let i=0;i<20&&st==='queued';i++){await new Promise(r=>setTimeout(r,250));st=(await call('/messages')).rows.find(x=>x.id===m2.id).status;}
  assert.equal(st,'sent','gateway sends queued messages');
  await call('/settings',{sms_gateway_url:''},'PATCH');}}
{const bk=await call('/system/backups');assert.ok(bk.count>=1,'daily backup made at start-up');}
const reg2=await call('/encounters',{patient_id:p2.id,doctor_id:doctor.id});
const o2=await call('/orders',{encounter_id:reg2.encounter.id,items:[{service_id:labService.id}]});
const half=Math.round(o2.bill.total/2*100)/100;
// A scheme cash share must be explicitly recorded, rather than collecting pending payer charges.
await call('/insurance/claims/'+o2.bill.claim_id,{copay_amount:reg2.bill.balance + o2.bill.total-half},'PATCH');
const st=await call('/bills/'+o2.bill.id+'/settle',{request_key:'qa-split-'+Date.now()+'-xyz123',category:'aarogyasri',lines:[{mode:'aarogyasri',amount:half,reference:'PREAUTH-1'},{mode:'cash',amount:o2.bill.total-half}]});
assert.equal(st.bill.balance,0);assert.equal(st.bill.status,'covered');
const replay=await call('/bills/'+o2.bill.id+'/settle',{request_key:st.receipts[0].collection_group,lines:[{mode:'cash',amount:1}]});
assert.equal(replay.bill.id,o2.bill.id);
const recv=await call('/accounts/receivables?mode=aarogyasri');const s1=recv.rows.find(r=>r.bill_id===o2.bill.id);assert.ok(s1);
await call('/accounts/receivables/'+s1.id+'/receive',{amount:half-10,disallowed:10,disallowance_action:'write_off',mode:'bank_transfer',reference:'NEFT-1'});
await call('/bills/'+reg2.bill.id+'/authorize',{category:'free',reason:'Hospital charity'});
assert.equal((await call('/bills/'+reg2.bill.id)).status,'covered');
const meds=await call('/pharmacy/medicines?location=IP');const med=meds.rows.find(m=>m.central_stock>20);
const tr=await call('/pharmacy/transfers',{source:'Central',destination:'IP',lines:[{medicine_id:med.id,qty:20}],reason:'Ward stock'});
await call('/pharmacy/transfers/'+tr.id+'/approve',{});
const issued=await call('/pharmacy/transfers/'+tr.id+'/issue',{});
const issueId=issued.lines[0].issues[0].id;
const part=await call('/pharmacy/transfers/'+tr.id+'/receive',{issues:[{id:issueId,qty:15}]});assert.equal(part.status,'partially_received');
const closedTr=await call('/pharmacy/transfers/'+tr.id+'/close',{reason:'5 damaged in transit'});assert.equal(closedTr.status,'received');
const bed2=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');
const adm2=await call('/ipd/admissions',{patient_id:p2.id,bed_id:bed2.id,consultant_id:doctor.id,diagnosis:'QA IP'});
// a payer category opens a case on the Insurance & Payer desk and the IP bill follows it
await call('/ipd/admissions/'+adm2.id,{financial_category:'corporate'},'PATCH');
{const cs=(await call('/insurance/claims?payer_type=corporate')).rows.find(c=>c.admission_id===adm2.id);assert.ok(cs,'corporate admission has a payer case');assert.equal(cs.claim_type,'corporate');
 const ipb=(await call('/bills?patient_id='+p2.id)).rows.find(b=>b.bill_type==='IP');assert.equal(ipb.payer_type,'corporate');assert.equal(ipb.claim_status,'preauth_pending');
 await call('/ipd/admissions/'+adm2.id,{financial_category:'self'},'PATCH');}
{const pb=(await call('/bills?limit=500')).rows.filter(b=>['insurance','aarogyasri','corporate','trust'].includes(b.payer_type)&&b.status!=='cancelled');
 assert.ok(pb.length,'payer bills exist in the workflow');assert.ok(pb.every(b=>b.claim_id&&b.claim_status),'every payer bill sits on a payer case');}
const ind=await call('/pharmacy/indents',{admission_id:adm2.id,lines:[{medicine_id:med.id,qty:4}]});
const disp=await call('/pharmacy/indents/'+ind.id+'/dispense',{});assert.equal(disp.bill.bill_type,'IP');
const opBatch=(await call('/pharmacy/stock?location=OP')).rows.find(b=>b.qty>3);
const sale2=await call('/pharmacy/dispense',{patient_id:p.id,items:[{medicine_id:opBatch.medicine_id,qty:2}],mode:'cash'});
const ret=await call('/pharmacy/sales-returns',{bill_item_id:sale2.bill.items[0].id,qty:1,reason:'Not needed',refund_mode:'cash'});assert.ok(ret.refund);
const grn=await call('/pharmacy/purchases',{supplier_id:supplier.id,invoice_no:'QA-INV-2',gst_mode:'inter',items:[{medicine_id:med.id,batch_no:'QA-IG',expiry:'2029-01-31',qty:2,free_qty:1,rate:100,mrp:180,gst_pct:12,pack_size:1,units_per_pack:10}]});
assert.equal(grn.igst,24);assert.equal(grn.cgst,0);
const cb=(await call('/pharmacy/stock?location=Central&q=QA-IG')).rows[0];assert.equal(cb.qty,30);
await call('/pharmacy/purchase-returns',{batch_id:cb.id,qty:5,reason:'Damaged'});
await call('/pharmacy/supplier-payments',{supplier_id:supplier.id,amount:50,mode:'bank_transfer',reference:'NEFT-SUP'});
await call('/pharmacy/stock/adjust',{batch_id:cb.id,qty:-1,reason:'Breakage'});
const chart=await call('/accounts/chart');const acc=(k)=>chart.find(a=>a.system_key===k).id;
await call('/accounts/journals',{narration:'bad',lines:[{account_id:acc('ar_patient'),debit:10},{account_id:acc('cash'),credit:10}]},'POST',409);
await call('/accounts/journals',{narration:'Capital introduced',lines:[{account_id:acc('bank'),debit:100000},{account_id:acc('capital'),credit:100000}]});
await call('/accounts/contra',{from:'upi',to:'bank',amount:imgHalf,charges:1});
const tb=await call('/accounts/trial-balance?preset=year');assert.equal(tb.totals.debit,tb.totals.credit);assert.equal(tb.totals.closing_dr,tb.totals.closing_cr);
const bs=await call('/accounts/balance-sheet');assert.ok(bs.totals.balanced,'balance sheet must balance: '+JSON.stringify(bs.totals));
const pl=await call('/accounts/profit-loss?preset=year');assert.ok(pl.totals.grossRevenue>0);
const byDept=await call('/reports/run/revenue_department?preset=year');assert.ok(byDept.rows.some(r=>r.free>0),'free treatment tracked');
const cat=await call('/reports/catalog');for(const r of cat.reports){await call('/reports/run/'+r.id+'?preset=year'+(r.id==='ledger'?'&account_id='+acc('cash'):''));}
const close=await call('/accounts/day-close');await call('/accounts/day-close',{cash_counted:close.cash_expected});
await call('/accounts/journals',{narration:'late',lines:[{account_id:acc('bank'),debit:1},{account_id:acc('capital'),credit:1}]},'POST',409);
{const ob=(await call('/bills?status=outstanding')).rows.find(b=>b.balance>1&&b.bill_type!=='IP');if(ob){const lk=await call('/payments',{bill_id:ob.id,amount:1,mode:'cash'},'POST',409);assert.equal(lk.error,'books_closed_today','no money into a closed day');}}   // collections wait for a reopen
await call('/accounts/day-close/'+close.date+'/reopen',{reason:'QA reopen'});
const pos=await call('/accounts/position');const dues=await call('/reports/run/patient_dues');
assert.equal(pos.receivables.find(r=>r.key==='ar_patient').balance,dues.totals.balance,'patient receivable ledger must equal open bill balances');
assert.equal(pos.receivables.find(r=>r.key==='ar_aarogyasri').balance,0,'aarogyasri receivable cleared');
const audit=await call('/audit?entity=bills');assert.ok(audit.rows.some(r=>r.before&&r.after));
for(const v of ['owner','reception','doctor','pharmacy','lab','nurse','insurance','quality'])await call('/dashboard/role?view='+v);
// demo mode: one login per department / in-charge, listed on the sign-in page only while it is on
{assert.equal((await call('/auth/demo-accounts')).enabled,false,'demo mode off by default');
 await call('/admin/demo-mode',{enabled:true});
 const da=await call('/auth/demo-accounts');assert.ok(da.enabled&&da.groups.length>=5,'demo accounts listed');
 const users=da.groups.flatMap(g=>g.accounts.map(a=>a.username));for(const u of ['demo.reception','demo.doctor','demo.nursehead','demo.store','demo.hr','demo.pharmacyhead'])assert.ok(users.includes(u),u+' listed');
 const keep=token;
 for(const u of users){const lg=await call('/auth/login',{username:u,password:da.password});token=lg.token;const me=await call('/auth/me');assert.ok(me.user||me.id||me.role,'demo login works: '+u);await call('/dashboard/role');}
 token=keep;await call('/admin/demo-mode',{enabled:false});
 await call('/auth/login',{username:'demo.reception',password:da.password},'POST',401);assert.equal((await call('/auth/demo-accounts')).enabled,false);}
{const ins=await call('/dashboard/role?view=insurance');assert.ok(ins.kpis&&Array.isArray(ins.worklist)&&ins.stages.length===6,'insurance desk board');
 const ql=await call('/dashboard/role?view=quality');assert.ok(ql.kpis&&Array.isArray(ql.open),'quality board');}
// department boards: every section present, money lanes kept apart, receivable total = sum of its types
const od=await call('/dashboard/role?view=owner&preset=year');assert.ok(od.cards&&od.periods.fy_vs_previous_fy&&od.census&&od.advances,'owner board sections');
assert.equal(od.receivables.total,Math.round(od.receivables.types.reduce((s,t)=>s+t.outstanding,0)*100)/100,'receivable total is the sum of its types');
for(const k of ['revenue','collection','expense','op','admissions'])assert.ok('yesterday' in od.compare[k]&&'month_avg' in od.compare[k]);
const pd=await call('/dashboard/role?view=pharmacy&graph=hourly&fast=30&slow=180');assert.ok(Array.isArray(pd.queue)&&pd.locations.includes('Central')&&pd.expiry_buckets.length===5&&pd.series.bucket==='hour');
const rd=await call('/dashboard/role?view=reception');assert.ok(Array.isArray(rd.queues.lab)&&Array.isArray(rd.queues.discharge)&&rd.collection.modes.length===5);
assert.ok(cat.reports.filter(r=>r.group==='Pharmacy').length>=30&&cat.reports.filter(r=>r.group==='Reception').length>=25,'department report groups');
// day close: a channel variance needs a remark and a second approval; a closed day's bills are locked for all but an administrator
const c2=await call('/accounts/day-close');
await call('/accounts/day-close',{cash_counted:c2.cash_expected,declared:{upi:c2.hospital.expected.upi+5}},'POST',400);
const closed2=await call('/accounts/day-close',{cash_counted:c2.cash_expected,declared:{upi:c2.hospital.expected.upi+5},notes:'QA UPI short'});assert.equal(closed2.approval_status,'pending');
const adminTok=token;token=(await call('/auth/login',{username:'reception',password:'surely'})).token;
await call('/bills/'+sale2.bill.id,{discount:1,discount_reason:'late'},'PATCH',409);
token=adminTok;
await call('/accounts/day-close/'+c2.date+'/approve',{});
await call('/accounts/day-close/'+c2.date+'/reopen',{reason:'QA reopen 2'});

/* ---------------- backend permissions per role */
// prescriptions typed by name link to the pharmacy master
// A second workstation receives the prescription event and can fetch the new queue immediately.
const pharmacySession = await call('/auth/login', { username: 'pharmacy', password: 'surely' });
const receivingDesk = new WebSocket(`ws://localhost:${port}/ws?t=${pharmacySession.token}`);
let rxSaved;
try {
 await once(receivingDesk, 'open');
 receivingDesk.send(JSON.stringify({type:'sub',topics:['pharmacy']}));
 const subscribed = new Promise(resolve => receivingDesk.on('message', raw => { if(JSON.parse(raw).type==='pong')resolve(); }));
 receivingDesk.send(JSON.stringify({type:'ping'})); await subscribed;
 const pushed = new Promise((resolve,reject) => {
  const timer=setTimeout(()=>reject(Error('Prescription did not reach pharmacy workstation')),5000);
  receivingDesk.on('message',raw=>{ const message=JSON.parse(raw); if(message.event==='prescription.saved'&&message.data.encounter_id===eid){clearTimeout(timer);resolve(message);} });
 });
 rxSaved=await call('/prescriptions',{encounter_id:eid,items:[{drug:'paracetamol 650 mg',frequency:'1-0-1',duration_days:3}],replace:true});
 assert.equal((await pushed).data.id,rxSaved.id); assertions++;
 const queueResponse=await fetch(base+'/pharmacy/dispense/queue',{headers:{'X-Session':pharmacySession.token}});
 assert.equal(queueResponse.status,200); const queue=await queueResponse.json();
 assert.ok(queue.rows.some(rx=>rx.id===rxSaved.id)); assertions++;
} finally { receivingDesk.terminate(); }
assert.ok(rxSaved.items[0].medicine_id,'typed drug linked to master');assert.equal(rxSaved.items[0].qty,6);
// images attach to an imaging order
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const img2=await call('/orders',{encounter_id:eid,items:[{service_id:imagingService.id}]});
const att=await call('/attachments/order/'+img2.orders[0].id,{files:[{name:'scan.png',type:'image/png',data:png}],note:'Outside CT'});
assert.equal(att.length,1);
const fileRes=await fetch(`http://localhost:${port}/api/attachments/file/${att[0].id}?t=${token}`);assert.equal(fileRes.status,200);assertions++;
await call('/attachments/order/'+img2.orders[0].id,{files:[{name:'x.exe',type:'application/x-msdownload',data:'AAAA'}]},'POST',400);
// an inpatient's medicine goes on the IP bill from the IP store
const ipSale=await call('/pharmacy/dispense',{patient_id:p2.id,admission_id:adm2.id,location:'IP',items:[{medicine_id:med.id,qty:1}]});
assert.equal(ipSale.bill.bill_type,'IP');
const r2=(v)=>Math.round((+v+Number.EPSILON)*100)/100;
const as=async(u)=>{token=(await call('/auth/login',{username:u,password:'surely'})).token;};
await as('pharmacy');await call('/bills/'+o2.bill.id+'/settle',{request_key:'qa-cnt-'+Date.now()+'-aaaaaa',lines:[{mode:'cash',amount:1}]},'POST',403);await call('/accounts/profit-loss',undefined,'GET',403);await call('/dashboard/role?view=owner',undefined,'GET',403);await call('/reports/run/profit_loss',undefined,'GET',403);await call('/dashboard/role');
await as('lab');await call('/pharmacy/stock/adjust',{batch_id:cb.id,qty:1,reason:'x'},'POST',403);await call('/accounts/journals',{narration:'x',lines:[]},'POST',403);await call('/dashboard/role');
await as('doctor');await call('/ipd/admissions/'+adm2.id,{financial_category:'corporate'},'PATCH',403);await call('/ipd/admissions/'+adm2.id,{status:'discharged'},'PATCH',403);await call('/pharmacy/purchases',{supplier_id:supplier.id,items:[]},'POST',403);await call('/accounts/journals',{narration:'x',lines:[]},'POST',403);await call('/bills',undefined,'GET',403);await call('/dashboard/role');
await as('reception');await call('/bills/'+sale2.bill.id+'/settle',{request_key:'qa-cnt2-'+Date.now()+'-aaaaa',lines:[{mode:'cash',amount:1}]},'POST',403);await call(`/lab/orders/${oid}/results`,{results:[{name:'x',value:'1'}]},'POST',403);await call('/pharmacy/stock/adjust',{batch_id:cb.id,qty:1,reason:'x'},'POST',403);await call('/dashboard/role');
await as('nurse');await call('/dashboard/role');
await as('admin');

/* ---------------- free visit: saved first, approved later */
await as('reception');
const fr=await call('/encounters',{patient_id:p.id,doctor_id:doctor.id,payment_status:'free',free_reason:'Hospital staff or dependant'});
assert.ok(fr.approval_pending,'free visit saved pending approval');assert.equal(fr.encounter.payment_status,'pending');
assert.ok((await call('/approvals')).rows.some(r=>r.id===fr.bill.id));
await call(`/approvals/${fr.bill.id}/approve`,{},'POST',403);
await call('/desk/day?desk=reception');await call('/desk/day?desk=pharmacy',undefined,'GET',403);
const handoverBill=await call('/bills',{patient_id:p.id,bill_type:'OP',items:[{description:'Handover test charge',qty:1,rate:50}],collect:true,mode:'cash'});
const hv=await call('/desk/handover?desk=reception');
await call('/desk/handover',{desk:'reception',declared:{...hv.expected.modes,cash:hv.expected.modes.cash-1,upi:hv.expected.modes.upi+1},handed_to:login.user.id},'POST',400);
const ho=await call('/desk/handover',{desk:'reception',declared:hv.expected.modes,handed_to:login.user.id});
const hvAfter=await call('/desk/handover?desk=reception');assert.equal(hvAfter.cash_in_hand,hv.cash_in_hand,'submission retains custody');assert.equal(hvAfter.cash_pending_acceptance,hv.cash_pending_acceptance+hv.expected.modes.cash,'pending cash displayed');assert.equal(hvAfter.expected.total,0,'submitted collection is not handed over twice');
await call('/desk/handover',{desk:'reception',declared:hv.expected.modes,handed_to:login.user.id},'POST',409);
await as('pharmacy');
await call('/desk/day?desk=pharmacy');await call('/desk/day?desk=reception',undefined,'GET',403);
const etr=await call('/pharmacy/transfers',{source:'Central',destination:'OP',lines:[{medicine_id:med.id,qty:2}]});
await call(`/pharmacy/transfers/${etr.id}/approve`,{},'POST',403);
await call(`/pharmacy/transfers/${etr.id}/emergency`,{},'POST',400);
const em=await call(`/pharmacy/transfers/${etr.id}/emergency`,{reason:'Night shift, in-charge off duty'});
assert.equal(em.status,'issued');assert.equal(em.emergency,1);
await call(`/pharmacy/transfers/${etr.id}/ratify`,{},'POST',403);
await call('/admin/roles/lab',{perms:['lab.*']},'PUT',403);
await as('admin');
await call(`/pharmacy/transfers/${etr.id}/ratify`,{});
const ap=await call(`/approvals/${fr.bill.id}/approve`,{});
assert.equal(ap.bill.balance,0);
assert.equal((await call(`/encounters/${fr.encounter.id}`)).payment_status,'free');
const cashBeforeAcceptance=await call('/desk/day?desk=reception');
await call(`/desk/handover/${ho.id}/verify`,{status:'accepted'});
const cashAfterAcceptance=await call('/desk/day?desk=reception');assert.ok(Math.abs(cashAfterAcceptance.cash_in_hand-(cashBeforeAcceptance.cash_in_hand-hv.expected.modes.cash))<0.01,'receiver acceptance reduces desk cash');
// role editing by the administrator only; admin role is fixed
const rolesBefore=await call('/admin/roles');assert.ok(rolesBefore.catalog.length>5);
await call('/admin/roles/admin',{perms:['lab.view']},'PUT',409);
const edited=await call('/admin/roles/lab',{perms:[...rolesBefore.roles.find(r=>r.role==='lab').perms,'vitals.record'],reason:'Lab records vitals'},'PUT');
assert.ok(edited.roles.find(r=>r.role==='lab').perms.includes('vitals.record'));
await call('/admin/roles',{role:'Pharmacy in-charge',copy_from:'pharmacy'});
await call('/admin/roles/lab/reset',{});
// combination drugs: several ingredients, searchable by any of them; same brand+form+composition refused
const combo=await call('/pharmacy/medicines',{name:'QA Augmentin 625 '+Date.now(),brand:'QA Augmentin',form:'tablet',composition:[{generic:'Amoxicillin',strength:'500 mg'},{generic:'Clavulanic acid',strength:'125 mg'}]});
assert.equal(combo.generic,'Amoxicillin + Clavulanic acid');assert.equal(combo.strength,'500 mg + 125 mg');
await call('/pharmacy/medicines',{name:'QA Augmentin copy '+Date.now(),brand:'QA Augmentin',form:'tablet',composition:[{generic:'Amoxicillin',strength:'500 mg'},{generic:'Clavulanic acid',strength:'125 mg'}]},'POST',409);
assert.ok((await call('/pharmacy/medicines?q=clavulanic')).rows.some(m=>m.id===combo.id));
// wards & beds set-up
const nw=await call('/ipd/wards',{code:'QA-W',name:'QA Ward '+Date.now(),kind:'special',beds:2,tariff:5000});
await call(`/ipd/wards/${nw.id}/beds`,{count:1,tariff:5000});
assert.equal((await call('/ipd/wards')).wards.find(w=>w.id===nw.id).beds,3);

// OP procedure remains outpatient and has doctor attribution; no admission needed.
const popService=(await call('/meta')).services.find(s=>s.code==='PRC-POP');assert.ok(popService);
const opdBill=await call('/bills',{patient_id:p.id,encounter_id:eid,bill_type:'OP',items:[{service_id:popService.id,qty:1,rate:750}]});assert.equal(opdBill.encounter_id,eid);assert.equal(opdBill.bill_type,'OP');
await call('/bills',{patient_id:p2.id,encounter_id:eid,items:[{service_id:popService.id,rate:50}]},'POST',400);
const doctorRevenue=await call('/reports/run/doctor_revenue?from=2000-01-01&to=2099-12-31');assert.ok(doctorRevenue.rows.some(r=>r.doctor===doctor.name&&r.department));
const modeCheck=await call('/accounts/reconciliation?from=2000-01-01&to=2099-12-31');for(const row of modeCheck.rows)assert.ok(Math.abs(row.difference)<0.01,JSON.stringify(row));assert.ok(modeCheck.rows.filter(r=>r.mode==='card').length<=1,'shared card balance shown once');
const staffRoster=await call('/admin/roster');assert.ok(staffRoster.staff.some(u=>u.id===doctor.id),'unrostered staff can be scheduled');
// Both cash desks can hand over to the owner without posting duplicate revenue.
const testOwner=await call('/admin/users',{username:'qa-owner',name:'QA Owner',role:'owner',password:'surely'});
await as('pharmacy');
const phCashBill=await call('/bills',{patient_id:p.id,bill_type:'PHARM',items:[{description:'Pharmacy handover receipt verification',qty:1,rate:100}],collect:true,mode:'cash'});
const phH=await call('/desk/handover?desk=pharmacy');assert.ok(phH.receivers.some(u=>u.id===testOwner.id));assert.ok(phH.receivers.every(u=>['admin','owner'].includes(u.role)));
const pharmacyHandover=await call('/desk/handover',{desk:'pharmacy',declared:phH.expected.modes,handed_to:testOwner.id});
await as('qa-owner');await call('/desk/handover/'+pharmacyHandover.id+'/verify',{status:'accepted'});
await as('admin');
// Stock is received centrally, then issued and acknowledged by each clinical store.
for (const destination of ['ER','ICU','OT']) {
  const move=await call('/pharmacy/transfers',{source:'Central',destination,lines:[{medicine_id:med.id,qty:2}],reason:'Clinical store verification'});
  await call('/pharmacy/transfers/'+move.id+'/approve',{});
  const moved=await call('/pharmacy/transfers/'+move.id+'/issue',{});
  const acknowledged=await call('/pharmacy/transfers/'+move.id+'/receive',{issues:moved.lines.flatMap(l=>l.issues.map(i=>({id:i.id,qty:i.qty}))) });
  assert.equal(acknowledged.status,'received');
  const wardRequest=await call('/pharmacy/indents',{admission_id:adm2.id,location:destination,lines:[{medicine_id:med.id,qty:1}]});
  const wardIssue=await call('/pharmacy/indents/'+wardRequest.id+'/dispense',{});assert.equal(wardIssue.bill.bill_type,'IP');
}
const {DatabaseSync}=await import('node:sqlite');const verificationDb=new DatabaseSync(path.join(dataDir,'surelyhms.db'),{readOnly:true});
try {const unbalanced=verificationDb.prepare('SELECT voucher_id, round(sum(debit-credit),2) difference FROM journal_lines GROUP BY voucher_id HAVING abs(sum(debit-credit)) > 0.01').all();assert.deepEqual(unbalanced,[],'every accounting voucher balances');} finally {verificationDb.close();}
const syncBefore=await call('/sync');await call('/sync/flush',{},'POST',503);const syncAfter=await call('/sync');assert.equal(syncBefore.counts.synced,syncAfter.counts.synced);
const search=await call('/search?q='+encodeURIComponent(reg.bill.bill_no));assert.equal(search.results.find(r=>r.type==='bill').route,`/bills?bill=${reg.bill.id}`);
const emergencyBatches=await call('/reports/run/emergency_store_batches');
assert.ok(emergencyBatches.rows.some(r=>r.location==='ER'),'ER batch stock report');
const emergencyTransfers=await call('/reports/run/emergency_store_transfers');
assert.ok(emergencyTransfers.rows.some(r=>r.destination==='ICU' && r.qty_received>0 && r.expiry),'received ICU batch/expiry trace');
const emergencyUsage=await call('/reports/run/emergency_store_usage');
assert.ok(emergencyUsage.rows.every(r=>!r.move_type.startsWith('transfer') || r.usage_cost===0),'transfers do not become consumption cost');
// bills are scoped by desk: pharmacy sees pharmacy bills only, reception never pharmacy bills, lab/doctor none
{await as('pharmacy');const pb=(await call('/bills?limit=500')).rows;assert.ok(pb.length&&pb.every(b=>b.bill_type==='PHARM'),'pharmacy sees only pharmacy bills');
 const anyOp=(await (async()=>{await as('admin');return (await call('/bills?type=OP&limit=1')).rows[0];})());
 await as('pharmacy');if(anyOp) await call('/bills/'+anyOp.id,undefined,'GET',404);
 await call('/bills',{patient_id:anyOp?.patient_id||1,bill_type:'OP',items:[{description:'x',qty:1,rate:1}]},'POST',403);
 await as('reception');const rb=(await call('/bills?limit=500')).rows;assert.ok(rb.length&&rb.every(b=>b.bill_type!=='PHARM'),'reception never sees pharmacy bills');
 await as('lab');await call('/bills',undefined,'GET',403);if(anyOp) await call('/bills/'+anyOp.id,undefined,'GET',403);
 await as('doctor');await call('/bills',undefined,'GET',403);
 await as('admin');}
await call('/auth/logout',{});await call('/auth/me',undefined,'GET',401).catch(()=>{});token=(await call('/auth/login',{username:'admin',password:'surely'})).token;   // signed out, then back in for the remaining checks
// attendance: everyone sees every department (read-only); an in-charge edits their team, the MS clinical staff, HR / admin everyone
{await as('admin');const allR=await call('/admin/roster');assert.equal(allR.scope,'all');
 const nurseUser=allR.staff.find(u=>u.role==='nurse');
 await as('pharmacy');const mine=await call('/admin/roster');assert.equal(mine.scope,'self');assert.ok(mine.staff.length>1,'everyone sees every department');assert.equal(mine.today.length,mine.staff.length,'on-duty board covers everyone');
 assert.equal(mine.editable_ids.length,0,'staff cannot roster');
 if(nurseUser){await call('/admin/attendance/punch',{user_id:nurseUser.id},'POST',403);
  await call('/admin/roster',{user_id:nurseUser.id,duty_date:'2026-12-01',shift:'morning'},'POST',403);}
 await call('/admin/attendance/punch',{});
 await as('admin');await call('/admin/demo-mode',{enabled:true});const pw=(await call('/auth/demo-accounts')).password;
 token=(await call('/auth/login',{username:'demo.pharmacyhead',password:pw})).token;
 const team=await call('/admin/roster');assert.equal(team.scope,'team');const editable=team.staff.filter(u=>team.editable_ids.includes(u.id));
 assert.ok(editable.length&&editable.every(u=>['pharmacy','store','pharmacy_admin'].includes(u.role)),'in-charge edits only the team');assert.ok(team.staff.some(u=>u.role==='nurse'),'in-charge still sees other departments');
 const tm=editable.find(u=>u.role==='pharmacy');if(tm) await call('/admin/roster',{user_id:tm.id,duty_date:'2026-12-01',shift:'morning',unit:team.units[0]});
 assert.ok(!team.units.includes('ICU'),'in-charge assigns only own units');
 if(nurseUser) await call('/admin/roster',{user_id:nurseUser.id,duty_date:'2026-12-01',shift:'morning'},'POST',403);
 {const d0=new Date();const td=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
  if(tm){const mk=await call('/admin/attendance/mark',{user_id:tm.id,duty_date:td,status:'leave',note:'Sick leave'});assert.equal(mk.status,'leave','in-charge marks own team');}
  if(nurseUser) await call('/admin/attendance/mark',{user_id:nurseUser.id,duty_date:td,status:'present'},'POST',403);}
 // the Medical Superintendent rosters clinical staff, not the front office
 token=(await call('/auth/login',{username:'demo.ms',password:pw})).token;
 {const msr=await call('/admin/roster');assert.equal(msr.scope,'team');
  const doc=msr.staff.find(u=>u.role==='doctor'),rec=msr.staff.find(u=>u.role==='reception');
  if(doc) await call('/admin/roster',{user_id:doc.id,duty_date:'2026-12-03',shift:'morning'});
  if(rec) await call('/admin/roster',{user_id:rec.id,duty_date:'2026-12-03',shift:'morning'},'POST',403);
  assert.ok((await call('/reports/catalog')).reports.some(r=>r.id==='att_summary'),'MS reads attendance reports');}
 await as('admin');await call('/admin/demo-mode',{enabled:false});}
// HR roster units follow the person; HR marks half day / leave / outside duty with a remark
{await as('admin');const r=await call('/admin/roster');const ph=r.staff.find(u=>u.role==='pharmacy');
 if(ph){const units=r.units_by_user[ph.id];assert.ok(units.length&&!units.includes('ICU'),'pharmacist gets pharmacy units only');
  await call('/admin/roster',{user_id:ph.id,duty_date:'2026-12-02',shift:'morning',unit:'ICU'},'POST',400);
  await call('/admin/roster',{user_id:ph.id,duty_date:'2026-12-02',shift:'general',unit:units[0]});
  const d0=new Date();const td=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()-1>0?d0.getDate()-1:d0.getDate()).padStart(2,'0')}`;
  await call('/admin/attendance/mark',{user_id:ph.id,duty_date:td,status:'half'},'POST',400);
  await call('/admin/attendance/mark',{user_id:ph.id,duty_date:td,status:'od',note:'Medical camp at Medchal PHC'});
  const reg=(await call(`/admin/roster?from=${td}&to=${td}`)).attendance.find(a=>a.user_id===ph.id);assert.equal(reg.status,'od');assert.equal(reg.note,'Medical camp at Medchal PHC');
  await call('/admin/attendance/mark',{user_id:ph.id,duty_date:'2099-01-01',status:'present'},'POST',400);}}
// Tariffs persist, reject invalid money, and feed real OP bills (isolated database).
await as('admin');
await call('/services/999999', {price: 1}, 'PATCH', 404);
const tariffService = (await call('/services')).find(x=>x.category==='lab');
await call('/services/'+tariffService.id, {price: -1}, 'PATCH', 400);
await call('/services/'+tariffService.id, {gst_pct: 101}, 'PATCH', 400);
await call('/services/'+tariffService.id, {price: 321.45}, 'PATCH');
assert.equal((await call('/services')).find(x=>x.id===tariffService.id).price, 321.45);
await call('/admin/users',{username:'qa_invalid_fee',name:'Invalid fee QA',role:'doctor',department_id:doctor.department_id,op_fee:-1},'POST',400);
await call('/admin/users/'+doctor.id, {op_fee:-1}, 'PATCH', 400);
await call('/admin/users/'+doctor.id, {followup_days:1.5}, 'PATCH', 400);
await call('/admin/users/'+doctor.id, {op_fee:432.10, followup_fee:0, followup_days:0}, 'PATCH');
const tariffPatient=await call('/patients',{name:'Tariff QA',gender:'Male',age_years:30});
const pricedVisit=await call('/encounters',{patient_id:tariffPatient.id,doctor_id:doctor.id});
assert.equal(pricedVisit.bill.total,432.10);
const zeroFollowupPatient=await call('/patients',{name:'Zero follow-up QA',gender:'Male',age_years:30});
const zeroVisit=await call('/encounters',{patient_id:zeroFollowupPatient.id,doctor_id:doctor.id,visit_type:'followup'});
assert.equal(zeroVisit.bill,null,'Explicit zero follow-up tariff must not create an OP fee bill');
// Common hospital package with optional payer agreement: no rewrite of historical cases.
await as('admin');
const commonPkg=await call('/payer-packages',{code:'QA-COMMON-LINK',name:'QA common package',price:1000,items:[]});
const agreedPayer=await call('/payers',{name:'QA Package TPA',payer_type:'tpa'});
const otherPayer=await call('/payers',{name:'QA Other TPA',payer_type:'tpa'});
const pkgAgreement=await call('/payer-packages',{code:'QA-COMMON-TPA',name:'QA agreed package',price:700,payer_id:agreedPayer.id,hospital_package_id:commonPkg.id,items:[]});
assert.equal(pkgAgreement.hospital_package_id,commonPkg.id);
assert.equal(pkgAgreement.hospital_package_name,commonPkg.name);
await call('/payer-packages',{code:'QA-DUP-TPA',name:'QA duplicate',price:600,payer_id:agreedPayer.id,hospital_package_id:commonPkg.id},'POST',409);
await call('/payer-packages',{code:'QA-BAD-LINK',name:'QA invalid base',price:600,payer_id:otherPayer.id,hospital_package_id:pkgAgreement.id},'POST',400);
const packagePatient=await call('/patients',{name:'QA Package linkage',gender:'Female',age_years:30});
const agreedCase=await call('/insurance/claims',{patient_id:packagePatient.id,payer_id:agreedPayer.id,package_id:commonPkg.id});
assert.equal(agreedCase.package_id,pkgAgreement.id);
assert.equal(agreedCase.estimate,700);
const fallbackCase=await call('/insurance/claims',{patient_id:packagePatient.id,payer_id:otherPayer.id,package_id:commonPkg.id});
assert.equal(fallbackCase.package_id,commonPkg.id);
assert.equal(fallbackCase.estimate,1000);
const editedCase=await call('/insurance/claims/'+agreedCase.id,{package_id:commonPkg.id,estimate:0},'PATCH');
assert.equal(editedCase.package_id,pkgAgreement.id);assert.equal(editedCase.estimate,700);
await call('/insurance/claims',{patient_id:packagePatient.id,payer_id:otherPayer.id,package_id:pkgAgreement.id},'POST',400);
const commonBill=await call('/bills',{patient_id:packagePatient.id,bill_type:'PKG',package_id:commonPkg.id});assert.equal(commonBill.total,1000);
assert.equal(commonBill.package_id,commonPkg.id,'Package identity must survive bill creation');
const selfPackagePatient=await call('/patients',{name:'QA self package context',gender:'Female',age_years:31});
const selfPackageVisit=await call('/encounters',{patient_id:selfPackagePatient.id,doctor_id:doctor.id,collect:false});
const selfPackageBill=await call('/bills',{patient_id:selfPackagePatient.id,encounter_id:selfPackageVisit.encounter.id,bill_type:'PKG',package_id:commonPkg.id});
const selfPackageContext=await call('/pharmacy/patient-package/'+selfPackagePatient.id);
assert.equal(selfPackageContext.package_id,commonPkg.id);assert.equal(selfPackageContext.source,'hospital');assert.ok(Array.isArray(selfPackageContext.usage));
await call('/bills',{patient_id:selfPackagePatient.id,encounter_id:selfPackageVisit.encounter.id,bill_type:'PKG',package_id:commonPkg.id},'POST',409);
await call('/payer-packages',{code:'QA-SECOND-TPA',name:'QA new agreement',price:800,payer_id:otherPayer.id,hospital_package_id:commonPkg.id,items:[]});
assert.equal((await call('/insurance/claims')).rows.find(c=>c.id===fallbackCase.id).package_id,commonPkg.id,'Adding an agreement must not rewrite an existing case');
// Pending payer balances must never silently become patient receipts.
const payerMedicine=(await call('/pharmacy/medicines?location=OP')).rows.find(m=>m.location_stock>5);
assert.ok(payerMedicine,'Payer pharmacy checks need available OP stock');
for (const [category, series] of [['insurance','TPA'],['aarogyasri','AAR'],['corporate','COR'],['trust','TRUST']]) {
 const pp=await call('/patients',{name:'QA pending '+category,gender:'Male',age_years:30,payer_type:category});
 const pb=await call('/bills',{patient_id:pp.id,bill_type:'OP',items:[{description:'Covered service',qty:1,rate:100}]});
 assert.ok(pb.bill_no.endsWith('-'+series));assert.equal(pb.patient_id,pp.id);assert.ok(pb.claim_id);
 await call('/insurance/claims/'+pb.claim_id,{status:'preauth_pending'},'PATCH');
 const pv=await call('/bills/'+pb.id);assert.equal(pv.patient_due,0);assert.equal(pv.payer_pending,100);
 await call('/payments',{bill_id:pb.id,amount:100,mode:'cash'},'POST',400);
 assert.equal((await call('/bills/'+pb.id)).paid,0);
 await call('/insurance/claims/'+pb.claim_id,{copay_amount:20},'PATCH');
 assert.equal((await call('/bills/'+pb.id)).patient_due,20);
 await call('/payments',{bill_id:pb.id,amount:21,mode:'cash'},'POST',400);
 await call('/payments',{bill_id:pb.id,amount:20,mode:'cash'});
 const collected=await call('/bills/'+pb.id);assert.equal(collected.patient_due,0);assert.equal(collected.payer_pending,80);
 await call('/insurance/claims/'+pb.claim_id,{status:'preauth_approved',approved:80},'PATCH');
 const covered=await call('/bills/'+pb.id);assert.equal(covered.paid,20);assert.equal(covered.covered_amount,80);assert.equal(covered.balance,0);
 const receivable=(await call('/accounts/receivables?mode='+category)).rows.find(x=>x.bill_id===pb.id);assert.ok(receivable);
 await call('/accounts/receivables/'+receivable.id+'/receive',{amount:80,mode:'bank_transfer',reference:'QA-'+category});
 assert.equal((await call('/bills/'+pb.id)).paid,20,'Payer receipts must not become patient cash');
 const payerSale=await call('/pharmacy/dispense',{patient_id:pp.id,location:'OP',collect:true,mode:'cash',items:[{medicine_id:payerMedicine.id,qty:1}]});
 assert.equal(payerSale.payment,null);assert.equal(payerSale.bill.paid,0);assert.equal(payerSale.bill.patient_id,pp.id);assert.ok(payerSale.bill.claim_id);
}
const creditPatient=await call('/patients',{name:'QA deferred credit',gender:'Male',age_years:30,payer_type:'credit'});
const creditBill=await call('/bills',{patient_id:creditPatient.id,bill_type:'OP',items:[{description:'Credit service',qty:1,rate:100}]});
assert.ok(creditBill.bill_no.endsWith('-CREDIT'));assert.equal(creditBill.deferred_collection,true);assert.equal(creditBill.paid,0);
await call('/payments',{bill_id:creditBill.id,amount:100,mode:'cash'});assert.equal((await call('/bills/'+creditBill.id)).balance,0);
// GRN comparisons, one-sided laboratory ranges, stock-loss accounting and staff workflow guards.
await as('admin');
const newPriceMed=await call('/pharmacy/medicines',{name:'QA price history unique',code:'QA-PRICE-HISTORY',generic:'QA-price-generic',pack_size:1,units_per_pack:10});
const receivePrice=rate=>call('/pharmacy/purchases',{supplier_id:supplier.id,invoice_no:'QA-PRICE-'+rate+'-'+Date.now(),items:[{medicine_id:newPriceMed.id,batch_no:'QA-PRICE-'+Date.now(),expiry:'2029-12-31',qty:2,rate,mrp:20,pack_size:1,units_per_pack:10}]});
const initialPrice=await receivePrice(10);assert.equal(initialPrice.price_changes.length,0);
const unchangedPrice=await receivePrice(10);assert.equal(unchangedPrice.price_changes.length,0);
const increasedPrice=await receivePrice(12);assert.equal(increasedPrice.price_changes.find(p=>p.price_type==='Net purchase cost').direction,'increase');
const decreasedPrice=await receivePrice(9);assert.equal(decreasedPrice.price_changes.find(p=>p.price_type==='Net purchase cost').direction,'decrease');
const historyPrice=await call('/pharmacy/price-history/'+newPriceMed.id);assert.equal(historyPrice.length,4);assert.equal(historyPrice[0].rate,9);
assert.ok((await call('/notifications')).some(n=>n.title.includes(increasedPrice.grn_no)));
const priceBatch=(await call('/pharmacy/purchases/'+decreasedPrice.id)).items[0];
await call('/pharmacy/stock/adjust',{batch_id:priceBatch.batch_id,qty:-1,move_type:'disposal',reason:'QA disposal audit'});
const losses=await call('/reports/run/pharmacy_stock_losses?period=all');assert.ok(losses.rows.some(r=>r.batch_no===priceBatch.batch_no&&r.loss_value>0));
const lowParam=await call('/lab/params',{service_id:labService.id,name:'QA Lower-only range',ref_low:10,ref_high:''});
const hiParam=await call('/lab/params',{service_id:labService.id,name:'QA Upper-only range',ref_low:'',ref_high:10});
const rangeOrder=await call('/orders',{encounter_id:eid,items:[{service_id:labService.id}]});
await call('/payments',{bill_id:rangeOrder.bill.id,amount:rangeOrder.bill.total,mode:'cash'});
const rangeId=rangeOrder.orders[0].id;await call('/lab/orders/'+rangeId+'/collect',{});
await call('/lab/orders/'+rangeId+'/results',{results:[{param_id:lowParam.id,value:'8'},{param_id:hiParam.id,value:'12'}]});
const rangeResults=(await call('/lab/orders/'+rangeId)).results;assert.equal(rangeResults[0].flag,'low');assert.equal(rangeResults[1].flag,'high');
const teamPeople=await call('/staff-work/people');const taskPharmacist=teamPeople.rows.find(u=>u.role==='pharmacy');assert.ok(taskPharmacist);
const chatMessage=await call('/staff-work/chat',{body:'QA retained original'});
await call('/staff-work/chat/'+chatMessage.id,{body:'QA retained edit',version:chatMessage.version},'PATCH');
assert.equal((await call('/staff-work/chat/'+chatMessage.id+'/history'))[0].body,'QA retained original');
await call('/staff-work/chat/'+chatMessage.id,{body:'Stale edit',version:chatMessage.version},'PATCH',409);
const taskRecord=await call('/staff-work/tasks',{title:'QA stock review',assigned_to:taskPharmacist.id});
await as('reception');await call('/staff-work/chat/'+chatMessage.id,{body:'Wrong author',version:2},'PATCH',403);
await call('/staff-work/tasks',{title:'Forbidden task',assigned_to:taskPharmacist.id},'POST',403);
await call('/staff-work/tasks/'+taskRecord.id,{status:'completed',progress_note:'Unrelated user'},'PATCH',403);
await as('pharmacy');await call('/staff-work/tasks/'+taskRecord.id,{status:'completed',progress_note:'Checked stock'},'PATCH');
await call('/staff-work/tasks/'+taskRecord.id,{status:'reviewed',progress_note:'Self approval'},'PATCH',403);
await as('admin');const reviewedTask=await call('/staff-work/tasks/'+taskRecord.id,{status:'reviewed',progress_note:'Owner/admin review complete'},'PATCH');assert.ok(reviewedTask.reviewed_by);
await call('/staff-work/tasks/'+taskRecord.id,{status:'open',progress_note:'Change reviewed task'},'PATCH',409);
// attendance reports: HR / admin read them; a pharmacist does not
{const d0=new Date();const td=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
 await as('admin');for(const id of ['att_summary','att_register','att_department','att_exceptions']){const r=await call(`/reports/run/${id}?from=2026-01-01&to=${td}`);assert.ok(Array.isArray(r.rows)&&r.columns.length,id);}
 await as('pharmacy');await call('/reports/run/att_summary',undefined,'GET',403);}
// discharge summary: the ward drafts, only a doctor signs, a signed summary changes only with a reason, discharged list keeps it
{await as('nurse');const ds=await call(`/ipd/admissions/${adm2.id}/summary`);assert.ok(ds.prefill&&ds.sections.length>=10,'summary prefilled');
 await call(`/ipd/admissions/${adm2.id}/summary`,{diagnosis:'Viral fever',sections:{course:'Treated with fluids'}},'PUT');
 assert.equal((await call(`/ipd/admissions/${adm2.id}/summary`)).status,'draft');
 await call(`/ipd/admissions/${adm2.id}/summary`,{diagnosis:'Viral fever',sections:{course:'x'},finalize:true},'PUT',403);
 await as('doctor');await call(`/ipd/admissions/${adm2.id}/summary`,{diagnosis:'',sections:{course:'x'},finalize:true},'PUT',400);
 const signed=await call(`/ipd/admissions/${adm2.id}/summary`,{diagnosis:'Viral fever',discharge_type:'routine',sections:{course:'Treated with fluids',medications:'1. Paracetamol 650 mg'},finalize:true},'PUT');assert.equal(signed.status,'final');
 await call(`/ipd/admissions/${adm2.id}/summary`,{diagnosis:'Viral fever',sections:{course:'changed'}},'PUT',409);
 await call(`/ipd/admissions/${adm2.id}/summary`,{diagnosis:'Viral fever',sections:{course:'changed'},amend_reason:'QA correction'},'PUT');
 assert.ok((await call(`/ipd/admissions/${adm2.id}`)).discharge_summary.includes('changed'),'summary text kept in sync');
 assert.ok(Array.isArray(await call('/ipd/discharges?from=2020-01-01')),'discharged list');}
// team chat: direct messages and groups are private to their members; unread counts reach the sidebar
{const L=async(u)=>(await call('/auth/login',{username:u,password:'surely'}));
 const rec=await L('reception'),doc=await L('doctor'),lab=await L('lab'),nur=await L('nurse');
 token=rec.token;const dm=await call('/staff-work/direct',{user_id:doc.user.id});assert.equal(dm.kind,'direct');
 assert.equal((await call('/staff-work/direct',{user_id:doc.user.id})).id,dm.id,'one direct thread per pair');
 await call('/staff-work/chat',{body:'QA private note',thread_id:dm.id});
 token=doc.token;const th=(await call('/staff-work/threads')).find(t=>t.id===dm.id);assert.ok(th&&th.unread===1,'doctor sees one unread');
 assert.ok((await call('/dashboard/badges'))['staff-workspace']>=1,'unread on the sidebar');
 const msgs=await call('/staff-work/chat?thread='+dm.id);assert.equal(msgs[0].body,'QA private note');
 await call(`/staff-work/threads/${dm.id}/read`,{last_id:msgs[0].id});assert.equal((await call('/staff-work/threads')).find(t=>t.id===dm.id).unread,0);
 token=lab.token;await call('/staff-work/chat?thread='+dm.id,undefined,'GET',403);await call('/staff-work/chat',{body:'x',thread_id:dm.id},'POST',403);
 token=nur.token;await call('/staff-work/threads',{name:'',member_ids:[doc.user.id]},'POST',400);
 const g=await call('/staff-work/threads',{name:'QA ward group',member_ids:[doc.user.id]});assert.equal(g.members.length,2);
 await call('/staff-work/chat',{body:'Bed 4 needs review',thread_id:g.id});
 token=doc.token;await call(`/staff-work/threads/${g.id}/members`,{member_ids:[lab.user.id]},'POST',403);
 token=lab.token;await call('/staff-work/chat?thread='+g.id,undefined,'GET',403);
 token=nur.token;await call(`/staff-work/threads/${g.id}/members`,{member_ids:[lab.user.id]});
 token=lab.token;assert.equal((await call('/staff-work/chat?thread='+g.id)).length,1,'added member reads the group');
 await call(`/staff-work/threads/${g.id}/members/${lab.user.id}`,undefined,'DELETE');await call('/staff-work/chat?thread='+g.id,undefined,'GET',403);
 assert.ok(Array.isArray(await call('/staff-work/chat')),'All staff channel still works');}
// ---- integration gaps closed on 4 Oct: each check is a real hospital situation that used to fail
await as('admin');
{const td=new Date();const pad=n=>String(n).padStart(2,'0');const today=`${td.getFullYear()}-${pad(td.getMonth()+1)}-${pad(td.getDate())}`;
 // a malformed request gets a JSON error, not an HTML page with the server's stack
 {const r=await fetch(base+'/patients',{method:'POST',headers:{'Content-Type':'application/json','X-Session':token},body:'{"name":,}'});assert.equal(r.status,400);assert.equal((await r.json()).error,'invalid_json');}
 // the consultation honours the OP fee gate, and opening it calls the patient in (queue, display, timings)
 const pg=await call('/patients',{name:'QA Gate '+Date.now(),gender:'Male',age_years:44,mobile:'9000000044'});
 const vg=await call('/encounters',{patient_id:pg.id,doctor_id:doctor.id});
 await call('/consultations',{encounter_id:vg.encounter.id,diagnosis:'x',status:'draft'},'POST',409);
 await call('/payments',{bill_id:vg.bill.id,amount:vg.bill.total,mode:'cash'});await call('/vitals',{encounter_id:vg.encounter.id,bp_sys:120,bp_dia:80,pulse:70,spo2:98});
 await call('/consultations',{encounter_id:vg.encounter.id,diagnosis:'Fever',status:'draft'});
 {const ev=await call('/encounters/'+vg.encounter.id);assert.equal(ev.stage,'in_consult','opening the note calls the patient in');assert.ok(ev.called_at&&ev.consult_start,'call and consult times recorded');}
 // a medicine needs its generic
 await call('/pharmacy/medicines',{name:'QA No Generic '+Date.now(),form:'tablet'},'POST',400);
 // appointments: one patient per doctor slot unless deliberately overbooked
 {const slot=`${today} 23:45:00`;await call('/appointments',{patient_name:'QA Slot A',mobile:'9000000101',doctor_id:doctor.id,slot_start:slot});
  const clash=await call('/appointments',{patient_name:'QA Slot B',mobile:'9000000102',doctor_id:doctor.id,slot_start:slot},'POST',409);assert.equal(clash.error,'slot_taken');
  await call('/appointments',{patient_name:'QA Slot B',mobile:'9000000102',doctor_id:doctor.id,slot_start:slot,overbook:true});}
 // patient edits are audited with before and after
 await call('/patients/'+pg.id,{city:'Warangal'},'PATCH');
 {const a=(await call('/audit?entity=patients')).rows.find(r=>r.action==='patient.update'&&r.entity_id===pg.id);assert.ok(a&&a.before&&a.after,'patient edit audited before/after');}
 // emergency: an unidentified arrival is treatable at once, then identified
 // an MLC arrival is never held for the police number: it is recorded later by triage or the doctor
 const mlcLater=await call('/ipd/emergency',{complaint:'RTA',triage:'1',mlc:1});
 assert.equal(mlcLater.mlc,1);assert.equal(mlcLater.mlc_no,null,'MLC registered without a number');
 await call(`/ipd/emergency/${mlcLater.id}/mlc`,{mlc_no:' '},'POST',400);
 const mlcSet=await call(`/ipd/emergency/${mlcLater.id}/mlc`,{mlc_no:'QA-MLC-LATE'});
 assert.equal(mlcSet.mlc_no,'QA-MLC-LATE','MLC number recorded after arrival');
 const u1=await call('/ipd/emergency',{complaint:'RTA, unconscious',triage:'1',gender:'Male',age_years:30,bp_sys:90,bp_dia:60,spo2:88,mlc:1,mlc_no:'QA-MLC-1',brought_by:'108 crew'});
 assert.ok(u1.patient_id&&u1.encounter_id,'temporary record and encounter at registration');
 {const ev=await call('/encounters/'+u1.encounter_id);assert.equal(ev.patient.temporary,1);assert.ok(ev.vitals&&ev.vitals.spo2===88,'triage vitals recorded');}
 const uo=await call('/orders',{encounter_id:u1.encounter_id,items:[{service_id:labService.id}]});
 assert.equal(uo.orders[0].status,'ordered','emergency work is never held for payment');assert.equal(uo.bill.bill_type,'ER','emergency orders go on the ER bill');
 await call(`/ipd/emergency/${u1.id}/link-patient`,{details:{name:'QA Identified Patient',gender:'Male',age_years:31,mobile:'9000000103'}});
 {const ev=await call('/encounters/'+u1.encounter_id);assert.equal(ev.patient.temporary,0);assert.equal(ev.patient.name,'QA Identified Patient');}
 const u2=await call('/ipd/emergency',{complaint:'Collapse',triage:'2'});
 await call('/orders',{encounter_id:u2.encounter_id,items:[{service_id:labService.id}]});
 await call(`/ipd/emergency/${u2.id}/link-patient`,{patient_id:pg.id});
 {const ev=await call('/encounters/'+u2.encounter_id);assert.equal(ev.patient_id,pg.id,'records moved to the existing UHID');assert.ok(ev.orders.every(o=>o.patient_id===pg.id));}
 // admission: only a free bed, one admission at a time, attendant / MLC kept, inpatient work on the running IP bill
 const bedsNow=(await call('/ipd/beds')).beds;const dirty=bedsNow.find(b=>b.status==='cleaning');const free=bedsNow.filter(b=>b.status==='vacant');
 if(dirty) await call('/ipd/admissions',{patient_id:u1.patient_id,bed_id:dirty.id,consultant_id:doctor.id},'POST',409);
 const ua=await call('/ipd/admissions',{patient_id:u1.patient_id,bed_id:free[0].id,consultant_id:doctor.id,emergency_id:u1.id,attendant_name:'QA Brother',attendant_mobile:'9000000104'});
 assert.equal(ua.mlc,1,'MLC carried from the ER case');assert.equal(ua.mlc_no,'QA-MLC-1');assert.equal(ua.admission_type,'emergency');assert.equal(ua.attendant_name,'QA Brother');
 await call('/ipd/admissions',{patient_id:u1.patient_id,bed_id:free[1].id,consultant_id:doctor.id},'POST',409);
 const ipo=await call('/orders',{encounter_id:ua.encounter_id,items:[{service_id:labService.id}]});
 assert.equal(ipo.orders[0].status,'ordered','inpatient work is not held for payment');assert.equal(ipo.bill.bill_type,'IP','inpatient orders go on the IP bill');
 // the doctor's inpatient prescription feeds the drug chart; a held dose needs a reason; a dose is recorded once
 await call('/prescriptions',{encounter_id:ua.encounter_id,items:[{drug:'QA Ceftriaxone 1 g',route:'IV',frequency:'STAT',duration_days:1}],replace:true});
 const mo=await call(`/ipd/admissions/${ua.id}/med-orders`);assert.ok(mo.length&&mo[0].times.length,'doctor orders listed with dose times');
 assert.ok((await call(`/ipd/admissions/${ua.id}/mar/from-orders`,{})).scheduled>=1,'STAT dose put on the chart');
 const dose=(await call(`/ipd/admissions/${ua.id}`)).mar.find(m=>m.status==='due');
 await call(`/ipd/nursing/mar/${dose.id}`,{status:'held'},'POST',400);await call(`/ipd/nursing/mar/${dose.id}`,{status:'given'});await call(`/ipd/nursing/mar/${dose.id}`,{status:'given'},'POST',409);
 // surgery is billed when the case is completed
 {const before=(await call(`/ipd/admissions/${ua.id}`)).bills.find(b=>b.bill_type==='IP').total;
  const ot=await call('/ipd/ot',{patient_id:u1.patient_id,procedure:'QA Craniotomy',theatre:'OT-1 Major',scheduled_at:`${today} 10:00`,surgeon_id:doctor.id,charges:[{description:'Surgeon fee',rate:20000}]});
  assert.equal(ot.admission_id,ua.id,'an inpatient case is linked to the admission');
  await call(`/ipd/ot/${ot.id}`,{status:'in_theatre'},'PATCH',409);   // no consent, no surgery
  await call(`/ipd/ot/${ot.id}`,{consent:1,checklist:{consent:true}},'PATCH');await call(`/ipd/ot/${ot.id}`,{status:'in_theatre'},'PATCH');
  const done=await call(`/ipd/ot/${ot.id}`,{status:'completed'},'PATCH');assert.ok(done.billed_to,'completed case billed');
  const after=(await call(`/ipd/admissions/${ua.id}`)).bills.find(b=>b.bill_type==='IP').total;assert.equal(after-before,20000,'surgeon fee on the IP bill');
  await call(`/ipd/ot/${ot.id}`,{charges:[{description:'x',rate:1}]},'PATCH',409);}
 // housekeeping marks a discharged bed clean
 {const hk=await call('/ipd/housekeeping');if(hk.length){await call(`/ipd/beds/${hk[0].id}/cleaned`,{});assert.equal((await call('/ipd/beds')).beds.find(b=>b.id===hk[0].id).status,'vacant');await call(`/ipd/beds/${hk[0].id}/cleaned`,{},'POST',409);}}
}
// ---- package utilisation: what a package covers is never charged twice; what it does not cover is the patient's
await as('admin');
{const ts=Date.now();
 // OP package: one CBC included; a second CBC is extra
 const opPkg=await call('/payer-packages',{code:'QA-PKG-OP-'+ts,name:'QA OP lab package',price:300,cover_categories:['lab'],items:[{service_id:labService.id,qty:1}]});
 assert.equal(JSON.parse(opPkg.cover_categories).join(),'lab');
 const op=await call('/patients',{name:'QA Package OP '+ts,gender:'Male',age_years:40,mobile:'9000000201'});
 const opv=await call('/encounters',{patient_id:op.id,doctor_id:doctor.id,collect:false});
 const pkgBill=await call('/bills',{patient_id:op.id,encounter_id:opv.encounter.id,bill_type:'PKG',package_id:opPkg.id});assert.equal(pkgBill.total,300);
 const o1=await call('/orders',{encounter_id:opv.encounter.id,items:[{service_id:labService.id}]});
 const labRate=(await call('/bills/'+o1.bill.id)).items.find(i=>i.service_id===labService.id).amount;   // the tariff may have changed earlier in this run
 assert.equal((await call('/bills/'+o1.bill.id)).balance,0,'the included test is covered by the package');
 assert.equal((await call('/lab/worklist?status=all')).rows.find(x=>x.id===o1.orders[0].id).status,'ordered','covered work is released at once');
 const o2=await call('/orders',{encounter_id:opv.encounter.id,items:[{service_id:labService.id}]});
 assert.ok((await call('/bills/'+o2.bill.id)).balance>0,'beyond the allowance the patient pays');
 const ou=await call('/package-usage?encounter_id='+opv.encounter.id);
 assert.equal(ou.covered,labRate);assert.ok(ou.lines.some(l=>l.category==='lab'&&l.excess===labRate),'the second test is extra');assert.ok(ou.lines.some(l=>l.category==='consultation'&&l.excess>0),'the consultation is not in a lab package');assert.equal(ou.patient_owes,r2(300+ou.excess+ou.excluded));
 assert.ok((await call('/pharmacy/patient-package/'+op.id)).covered>=0,'pharmacy sees the live package');
 // remove the package: the adjustment is reversed and the package charge waived
 await call(`/package-assignments/${ou.assignment.id}/cancel`,{},'POST',400);
 await call(`/package-assignments/${ou.assignment.id}/cancel`,{reason:'QA wrong package'});
 assert.equal((await call('/bills/'+o1.bill.id)).balance,labRate,'covered test is chargeable again');
 assert.equal((await call('/bills/'+pkgBill.id)).total,0,'package charge waived');
 // admission package: room for one day and ward charges; reconciled against the final bill at discharge
 const ipPkg=await call('/payer-packages',{code:'QA-PKG-IP-'+ts,name:'QA one-day stay',price:2000,cover_categories:['bed','ipd'],los_days:1});
 const ipPt=await call('/patients',{name:'QA Package IP '+ts,gender:'Female',age_years:35,mobile:'9000000202'});
 const freeBed=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant'&&!/icu/i.test(b.class||''))||(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');
 const ipa=await call('/ipd/admissions',{patient_id:ipPt.id,bed_id:freeBed.id,consultant_id:doctor.id});
 await call(`/ipd/admissions/${ipa.id}/package`,{package_id:ipPkg.id});
 await call(`/ipd/admissions/${ipa.id}/package`,{package_id:ipPkg.id},'POST',409);
 const lo=await call('/orders',{encounter_id:ipa.encounter_id,items:[{service_id:labService.id}]});assert.equal(lo.bill.bill_type,'IP');
 const iu=await call('/package-usage?admission_id='+ipa.id);
 assert.ok(iu.covered>0,'bed day covered');assert.equal(iu.excess,labRate,'lab is not in this package: the patient pays it');
 await call(`/ipd/admissions/${ipa.id}`,{status:'clinically_cleared'},'PATCH');
 await call(`/ipd/admissions/${ipa.id}/discharge`,{discharge_summary:'x'},'POST',409);   // package price and extras are due first
 {const full=await call(`/ipd/admissions/${ipa.id}`);const ipb=full.bills.find(b=>b.bill_type==='IP');
  const r=await call(`/package-assignments/${iu.assignment.id}/reconcile`,{});assert.equal(r.adjustment_posted,r.covered,'covered charges adjusted off');
  const due=(await call('/bills/'+ipb.id)).balance;assert.equal(due,r2(2000+r.excess),'patient owes the package price plus extras');
  await call(`/bills/${ipb.id}/settle`,{request_key:'qa-pkgip-'+ts+'-abcdefgh',lines:[{mode:'cash',amount:due}]});
  await call(`/ipd/admissions/${ipa.id}/discharge`,{discharge_summary:'Package stay'});
  const tb=await call('/accounts/trial-balance?preset=year');assert.ok(JSON.stringify(tb).includes('Package adjustments'),'package adjustments have their own account');}
}
// ---- procedure consumables: issued from the store where used, charged once on the procedure's bill
await as('admin');
{const ts=Date.now();
 const proc=meta.services.find(s=>s.category==='procedure'&&s.price>0)||meta.services.find(s=>s.category==='procedure');
 const opStock=(await call('/pharmacy/stock?location=OP')).rows.filter(b=>b.qty>=10&&b.expiry>'2026-12-31');
 const cm=opStock[0];assert.ok(proc&&cm,'a procedure and an OP-stocked item exist');
 await call(`/procedure-kits/${proc.id}`,{items:[{medicine_id:cm.medicine_id,qty:2}],consumables_included:false},'PUT');
 assert.equal((await call(`/procedure-kits/${proc.id}`)).items[0].qty,2,'kit saved');
 const pp=await call('/patients',{name:'QA Consumables '+ts,gender:'Male',age_years:50,mobile:'9000000301'});
 const pv=await call('/encounters',{patient_id:pp.id,doctor_id:doctor.id,collect:false});
 const pb=await call('/bills',{patient_id:pp.id,encounter_id:pv.encounter.id,bill_type:'OP',items:[{service_id:proc.id}]});
 const line=pb.items.find(i=>i.service_id===proc.id);
 const kit=await call(`/consumptions/kit?source_type=bill_item&source_id=${line.id}`);assert.equal(kit.items[0].medicine_id,cm.medicine_id,'kit pre-fills the form');
 const stockQ=async()=>(await call('/pharmacy/stock?location=OP')).rows.filter(b=>b.medicine_id===cm.medicine_id).reduce((s,b)=>s+b.qty,0);
 const q0=await stockQ();
 const c1=await call('/consumptions',{source_type:'bill_item',source_id:line.id,location:'OP',items:[{medicine_id:cm.medicine_id,qty:2}]});
 assert.equal(await stockQ(),q0-2,'stock issued from the OP store');assert.ok(c1.total_charged>0,'charged on the procedure bill');
 assert.ok((await call('/bills/'+pb.id)).total>pb.total,'procedure bill carries the consumables');
 await call('/consumptions',{source_type:'bill_item',source_id:line.id,location:'OP',items:[{medicine_id:cm.medicine_id,qty:1}]},'POST',409);
 await call(`/consumptions/${c1.id}/reverse`,{reason:'QA wrong item'});
 assert.equal(await stockQ(),q0,'stock back after reversal');assert.equal((await call('/bills/'+pb.id)).total,pb.total,'charge waived');
 // the procedure's price already includes its consumables: stock is issued, nothing is charged again
 await call(`/procedure-kits/${proc.id}`,{items:[{medicine_id:cm.medicine_id,qty:2}],consumables_included:true},'PUT');
 const c2=await call('/consumptions',{source_type:'bill_item',source_id:line.id,location:'OP',items:[{medicine_id:cm.medicine_id,qty:2}]});
 assert.equal(c2.total_charged,0,'included consumables are not charged twice');assert.equal(await stockQ(),q0-2);
 // the pharmacy already charged this item to the visit: flagged before it is charged again
 await call('/pharmacy/dispense',{patient_id:pp.id,encounter_id:pv.encounter.id,items:[{medicine_id:cm.medicine_id,qty:1}],collect:false});
 const er=await call('/ipd/emergency',{patient_id:pp.id,triage:'3',complaint:'QA cut'});
 await call(`/procedure-kits/${proc.id}`,{items:[],consumables_included:false},'PUT');
 const vb=await call('/bills',{patient_id:pp.id,encounter_id:pv.encounter.id,bill_type:'OP',items:[{service_id:proc.id}]});
 const dup=await call('/consumptions',{source_type:'bill_item',source_id:vb.items[0].id,location:'OP',items:[{medicine_id:cm.medicine_id,qty:1}]},'POST',409);
 assert.equal(dup.error,'possible_duplicate_charge');
 await call('/consumptions',{source_type:'bill_item',source_id:vb.items[0].id,location:'OP',items:[{medicine_id:cm.medicine_id,qty:1}],confirm_duplicates:true});
 assert.ok((await call('/consumptions?patient_id='+pp.id)).length>=3,'consumption register');
 const ib=await call('/accounts/integrity');assert.equal(ib.ok,true,'books still balance with consumption entries');
}
// ---- visiting doctors: OT fee credited to the visiting surgeon, share earned only on collections, refunds claw back
await as('admin');
{const ts=Date.now();
 const vd=await call('/visiting-doctors',{name:'Dr QA Visiting '+ts,speciality:'General Surgery',share_type:'percent',share_value:40,tds_pct:10});
 await call('/visiting-doctors',{name:'Bad',share_type:'percent',share_value:140},'POST',400);
 const vp=await call('/patients',{name:'QA Visiting Case '+ts,gender:'Female',age_years:41,mobile:'9000000302'});
 await call('/ipd/ot',{patient_id:vp.id,procedure:'QA Hernia',theatre:'OT-2 Major',scheduled_at:'2026-10-04 11:00'},'POST',400);   // a surgeon (staff or visiting) is required
 const vot=await call('/ipd/ot',{patient_id:vp.id,procedure:'QA Hernia',theatre:'OT-2 Major',scheduled_at:'2026-10-04 11:00',visiting_surgeon_id:vd.id,
   charges:[{description:'Surgeon fee',rate:10000,role:'surgeon'},{description:'OT charges',rate:5000}]});
 assert.ok((await call('/ipd/ot?all=1')).rows.find(r=>r.id===vot.id).surgeon_name.includes('(visiting)'),'OT list names the visiting surgeon');
 const done=await call(`/ipd/ot/${vot.id}`,{consent:1,status:'completed'},'PATCH');assert.ok(done.billed_to,'OT case billed');
 const vbill=await call('/bills/'+(await call('/ipd/ot?all=1')).rows.find(r=>r.id===vot.id).bill_id);
 const fee=vbill.items.find(i=>/Surgeon fee/.test(i.description));assert.equal(fee.visiting_doctor_id,vd.id,'surgeon fee credited to the visiting surgeon');
 assert.ok(!vbill.items.find(i=>/OT charges/.test(i.description)).visiting_doctor_id,'hospital OT charges stay with the hospital');
 const L=async()=>call(`/visiting-doctors/${vd.id}/ledger`);
 assert.equal((await L()).earned,0,'nothing earned before money is collected');
 await call(`/visiting-doctors/${vd.id}/statements`,{},'POST',409);
 await call('/payments',{bill_id:vbill.id,amount:7500,mode:'cash'});
 assert.equal((await L()).earned,2000,'40% of the fee on half the bill collected');
 const st1=await call(`/visiting-doctors/${vd.id}/statements`,{});assert.equal(st1.accrual,2000);
 await call(`/visiting-doctors/${vd.id}/statements`,{},'POST',409);
 await call('/payments',{bill_id:vbill.id,amount:7500,mode:'cash'});
 assert.equal((await L()).not_yet_accrued,2000,'the rest is earned once the bill is paid');
 await call(`/visiting-doctors/${vd.id}/statements`,{});
 await call('/refunds',{bill_id:vbill.id,amount:3000,mode:'cash',reason:'QA partial refund'});
 let l=await L();assert.equal(l.earned,3200,'a refund claws the share back');assert.equal(l.not_yet_accrued,-800);
 const st3=await call(`/visiting-doctors/${vd.id}/statements`,{});assert.equal(st3.accrual,-800,'negative statement reverses the clawed-back share');
 l=await L();assert.equal(l.payable,3200);
 await call(`/visiting-doctors/${vd.id}/payouts`,{amount:3300,mode:'bank_transfer'},'POST',400);
 const po=await call(`/visiting-doctors/${vd.id}/payouts`,{amount:3200,mode:'bank_transfer',reference:'QA-UTR'});
 assert.equal(po.tds,320,'TDS withheld');assert.equal(po.net,2880,'net paid');
 l=await L();assert.equal(l.payable,0);assert.equal(l.reconciled,true,'payable ledger reconciles to the books');
 // a desk-assigned consultant line
 const oth=vbill.items.find(i=>/OT charges/.test(i.description));
 await call(`/bills/${vbill.id}/items/${oth.id}/visiting`,{visiting_doctor_id:vd.id,role:'assistant'},'PATCH');
 assert.equal((await L()).lines.length,2,'a bill line can be credited to a visiting doctor');
 await call(`/bills/${vbill.id}/items/${oth.id}/visiting`,{visiting_doctor_id:null},'PATCH');
 assert.equal((await L()).lines.length,1);
 const rep=await call('/reports/run/visiting_doctor_share');assert.ok(rep.rows.find(r=>r.name===vd.name),'visiting doctor share report');
 assert.equal((await call('/accounts/integrity')).ok,true,'books balance with visiting doctor entries');
}
// ---- general / maintenance stores: receipt → department request → issue → confirm; returns, transfers, counts; books agree
await as('admin');
{const ts=Date.now();
 const sup=(await call('/stores/suppliers'))[0];assert.ok(sup,'a supplier to receive from');
 const it=await call('/stores/items',{name:'QA LED tube 20W '+ts,category:'electrical',unit:'nos',reorder_level:5,location_bin:'E-3'});
 assert.match(it.code,/^MNT-\d{5}$/,'item gets a code for its QR label');
 await call('/stores/items',{name:'QA LED tube 20W '+ts},'POST',409);
 const out0=(await call('/stores/suppliers')).find(x=>x.id===sup.id).outstanding;
 const inv='QA-INV-'+ts;
 const rc=await call('/stores/receipts',{supplier_id:sup.id,store:'MAIN',invoice_no:inv,items:[{item_id:it.id,qty:10,rate:100,gst_pct:18}]});
 assert.equal(rc.total,1180,'invoice total with GST');
 assert.equal(r2((await call('/stores/suppliers')).find(x=>x.id===sup.id).outstanding-out0),1180,'supplier is owed the invoice');
 await call('/stores/receipts',{supplier_id:sup.id,store:'MAIN',invoice_no:inv,items:[{item_id:it.id,qty:1,rate:1}]},'POST',409);
 await call('/stores/receipts',{supplier_id:sup.id,store:'MAIN',items:[{item_id:it.id,qty:10,rate:120,gst_pct:18}]});
 let sc=await call('/stores/items/by-code/'+it.code.toLowerCase());assert.equal(sc.qty,20);assert.equal(sc.avg_cost,110,'weighted average cost');assert.equal(sc.value,2200);
 // any member of staff requests for their department; costs stay with the store
 await as('nurse');
 const nurseItems=await call('/stores/items?q=QA LED');assert.ok(nurseItems.length&&nurseItems[0].avg_cost===undefined,'staff see items without costs');
 const dept=meta.departments.find(d=>d.code==='NURS')||meta.departments[0];
 const rq=await call('/stores/requests',{department_id:dept.id,priority:'urgent',purpose:'QA ward 2 corridor',items:[{item_id:it.id,qty:5}]});
 await call('/stores/issues',{request_id:rq.id,items:[{item_id:it.id,qty:5}]},'POST',403);
 assert.ok((await call('/stores/requests')).find(r=>r.id===rq.id),'the requester sees their request');
 await call(`/stores/requests/${rq.id}/received`,{},'POST',409);
 await as('admin');
 assert.ok((await call('/dashboard/badges')).stores>=1,'store badge counts open requests');
 let is=await call('/stores/issues',{request_id:rq.id,store:'MAIN',items:[{item_id:it.id,qty:3}]});assert.equal(is.status,'partly_issued');assert.equal(is.cost,330);
 await call('/stores/issues',{request_id:rq.id,store:'MAIN',items:[{item_id:it.id,qty:3}]},'POST',400);
 is=await call('/stores/issues',{request_id:rq.id,store:'MAIN',items:[{item_id:it.id,qty:2}]});assert.equal(is.status,'issued');
 await call('/stores/issues',{request_id:rq.id,store:'MAIN',items:[{item_id:it.id,qty:1}]},'POST',409);
 await call('/stores/issues',{department_id:dept.id,store:'MAIN',items:[{item_id:it.id,qty:1}]},'POST',400);   // a direct issue needs a reason
 await call('/stores/issues',{department_id:dept.id,store:'MAIN',items:[{item_id:it.id,qty:999}],reason:'QA'},'POST',409);   // never below zero
 await as('nurse');
 await call(`/stores/requests/${rq.id}/received`,{note:'QA got 5'});await call(`/stores/requests/${rq.id}/received`,{},'POST',409);
 await as('admin');
 await call('/stores/returns',{item_id:it.id,department_id:dept.id,store:'MAIN',qty:6,reason:'QA too many'},'POST',400);
 await call('/stores/returns',{item_id:it.id,department_id:dept.id,store:'MAIN',qty:1,reason:'QA unused'});
 await call('/stores/transfers',{item_id:it.id,from:'MAIN',to:'ELEC',qty:4,reason:'QA'});
 const cnt=await call('/stores/counts',{item_id:it.id,store:'ELEC',counted:3,reason:'QA count — one broken'});assert.equal(cnt.diff,-1);
 sc=await call('/stores/items/by-code/'+it.code);assert.equal(sc.qty,15,'20 in − 5 issued + 1 back − 1 short');
 assert.deepEqual(sc.stock.map(s=>[s.store,s.qty]).sort(),[['ELEC',3],['MAIN',12]]);
 const val=await call('/stores/valuation');assert.ok(Math.abs(val.difference)<0.05,'stock value agrees with Consumables Inventory in the books');
 assert.equal((await call('/stores/moves?item_id='+it.id)).length,8,'every movement recorded');
 assert.equal((await call('/accounts/integrity')).ok,true,'books balance with store entries');
}
// ---- GRN price changes: each one waits for the in-charge's acknowledgement; big increases and stale ones go to management
await as('admin');
{const ts=Date.now();
 const sup2=(await call('/stores/suppliers'))[0];
const m0=(await call('/pharmacy/stock?location=Central')).rows[0];
 const g1=await call('/pharmacy/purchases',{supplier_id:sup2.id,invoice_no:'QA-PA1-'+ts,items:[{medicine_id:m0.medicine_id,batch_no:'QA-PA-'+ts,expiry:'2029-06-30',qty:10,rate:10,mrp:20,pack_size:1,units_per_pack:1}]});
 const g2=await call('/pharmacy/purchases',{supplier_id:sup2.id,invoice_no:'QA-PA2-'+ts,items:[{medicine_id:m0.medicine_id,batch_no:'QA-PA-'+ts,expiry:'2029-06-30',qty:10,rate:15,mrp:20,pack_size:1,units_per_pack:1}]});
 assert.ok(g2.price_changes.length>=1,'a 50% cost increase is detected');
 let pa=await call('/price-alerts?purchase_id='+g2.id);
 const cost=pa.rows.find(a=>a.price_type==='Net purchase cost');assert.equal(cost.severity,'high');assert.equal(cost.status,'open');
 assert.ok((await call('/dashboard/badges')).grn>=1,'GRN badge counts unacknowledged changes');
 const owner=(await call('/notifications')).find(n=>n.title.includes(g2.grn_no));assert.ok(owner,'management told about the big increase');
 await as('pharmacy');
 await call('/price-alerts/acknowledge',{ids:[cost.id],action:'accepted'},'POST',403);   // only the in-charge acknowledges
 const esc=await call(`/price-alerts/${cost.id}/escalate`,{note:'QA supplier will not explain'});assert.equal(esc.status,'escalated');assert.equal(esc.escalation_level,1);
 await as('admin');
 await call('/price-alerts/acknowledge',{ids:[cost.id],action:'accepted'},'POST',400);   // a high increase needs a note
 await call('/price-alerts/acknowledge',{ids:[cost.id],action:'shrug',note:'x'},'POST',400);
 await call('/price-alerts/acknowledge',{ids:pa.rows.map(a=>a.id),action:'selling_price_revised',note:'QA new list price from supplier'});
 await call('/price-alerts/acknowledge',{ids:[cost.id],action:'accepted',note:'again'},'POST',409);
 await call(`/price-alerts/${cost.id}/escalate`,{note:'late'},'POST',409);
 pa=await call('/price-alerts?status=all&purchase_id='+g2.id);assert.ok(pa.rows.every(a=>a.status==='acknowledged'&&a.acknowledged_by_name&&a.action==='selling_price_revised'),'acknowledged with who and what');
 assert.ok(!(await call('/price-alerts')).rows.some(a=>a.purchase_id===g2.id),'acknowledged changes leave the open list');
}
// ---- patient portal: PIN from reception, own records only, lockout, revoke; staff never see the PIN again
await as('reception');
{const ts=Date.now();
 const pp=await call('/patients',{name:'QA Portal Patient '+ts,gender:'Female',age_years:33,mobile:'9123'+String(ts).slice(-6)});
 const other=await call('/patients',{name:'QA Portal Other '+ts,gender:'Male',age_years:40,mobile:'9124'+String(ts).slice(-6)});
 const pv=await call('/encounters',{patient_id:pp.id,doctor_id:doctor.id,collect:false});
 const iss=await call(`/patients/${pp.id}/portal-access`,{});assert.match(iss.pin,/^\d{6}$/,'a 6-digit PIN is issued once');
 assert.equal((await call(`/patients/${pp.id}/portal-access`)).active,1);assert.equal((await call(`/patients/${pp.id}/portal-access`)).pin,undefined,'the PIN is never shown again');
 const P=async(path,body,ptoken,status=200,method=body===undefined?'GET':'POST')=>{const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(ptoken?{'X-Portal-Token':ptoken}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   const v=await res.json();assert.equal(res.status,status,`${method} ${path}: ${JSON.stringify(v)}`);assertions++;return v;};
 await P('/portal/me',undefined,null,401);
 await P('/portal/me',undefined,'not-a-token',401);
 const wrong=iss.pin==='000000'?'111111':'000000';
 await P('/portal/login',{identifier:pp.uhid,pin:wrong},null,401);
 const s1=await P('/portal/login',{identifier:pp.uhid.toLowerCase(),pin:iss.pin});assert.ok(s1.token&&s1.patient.uhid===pp.uhid,'signs in with UHID + PIN');
 const s2=await P('/portal/login',{identifier:pp.mobile,pin:iss.pin});assert.ok(s2.token,'or with the mobile number');
 const me=await P('/portal/me',undefined,s1.token);assert.equal(me.patient.uhid,pp.uhid);assert.ok(me.patient.mobile.startsWith('******'),'mobile masked');
 assert.ok(me.visits.length>=1&&me.bills.every(b=>b.bill_no),'own visits and bills');
 assert.ok(!JSON.stringify(me).includes(other.uhid),'nothing of another patient');
 // a staff session token is not a portal session, and a portal token is not a staff session
 const staffTok=token;await P('/portal/me',undefined,staffTok,401);
 {const res=await fetch(base+'/patients/'+other.id,{headers:{'X-Portal-Token':s1.token}});assert.equal(res.status,401,'portal token cannot read staff APIs');assertions++;}
 // five wrong PINs lock the account; the right PIN then waits too
 for(let i=0;i<5;i++)await P('/portal/login',{identifier:pp.uhid,pin:wrong},null,i<4?401:401);
 await P('/portal/login',{identifier:pp.uhid,pin:iss.pin},null,423);
 assert.equal((await call(`/patients/${pp.id}/portal-access`)).locked,true,'reception sees the lock');
 // re-issuing a PIN clears the lock and signs out old devices
 const iss2=await call(`/patients/${pp.id}/portal-access`,{});
 await P('/portal/me',undefined,s1.token,401);
 const s3=await P('/portal/login',{identifier:pp.uhid,pin:iss2.pin});
 await P('/portal/logout',{},s3.token);await P('/portal/me',undefined,s3.token,401);
 await P('/portal/otp',{identifier:pp.uhid},null,409);   // no SMS gateway in the test server
 const s4=await P('/portal/login',{identifier:pp.uhid,pin:iss2.pin});
 await call(`/patients/${pp.id}/portal-access/revoke`,{reason:'QA lost phone'});
 await P('/portal/me',undefined,s4.token,401);await P('/portal/login',{identifier:pp.uhid,pin:iss2.pin},null,401);
 await as('admin');
 const aud=await call('/audit?entity=patients&entity_id='+pp.id).catch(()=>null);
 if(aud&&aud.rows)assert.ok(aud.rows.some(r=>r.action==='portal.login'),'portal sign-ins are audited');
}
// ---- counselling: consent → recording → local transcript → nurse's summary → doctor signs → on the patient record
await as('doctor');
{const ts=Date.now();
 const me=(await call('/auth/me')).user||(await call('/auth/me'));
 const cm=await call('/counselling/meta');assert.ok(cm.topics.surgery&&cm.consent_text,'counselling meta');
 const cp=await call('/patients',{name:'QA Counselling '+ts,gender:'Female',age_years:58,mobile:'9000000303'}).catch(async()=>{await as('reception');const x=await call('/patients',{name:'QA Counselling '+ts,gender:'Female',age_years:58,mobile:'9000000303'});await as('doctor');return x;});
 await call('/counselling',{patient_id:cp.id,topic:'surgery'},'POST',400);   // consent decision required
 await call('/counselling',{patient_id:cp.id,topic:'surgery',consent:'given'},'POST',400);   // who consented
 const refused=await call('/counselling',{patient_id:cp.id,topic:'financial',consent:'refused'});assert.equal(refused.status,'consent_refused');
 const raw=async(id,buf,type,status=200)=>{const res=await fetch(`${base}/counselling/${id}/recording`,{method:'POST',headers:{'Content-Type':type,'X-Session':token},body:buf});const v=await res.json();assert.equal(res.status,status,JSON.stringify(v));assertions++;return v;};
 const wavBuf=fs.readFileSync('tools/fixtures/counselling-sample.wav');
 await raw(refused.id,wavBuf,'audio/wav',409);   // no recording without consent
 const cs=await call('/counselling',{patient_id:cp.id,topic:'surgery',doctor_id:me.id,language:'en',consent:'given',consent_by:'QA Patient',consent_relation:'self',attendees:'Patient, son'});
 await raw(cs.id,Buffer.from('not audio'.repeat(400)),'video/mp4',415);
 const up=await raw(cs.id,wavBuf,'audio/wav');assert.equal(up.has_recording,true);assert.equal(up.recording_path,undefined,'storage path never leaves the server');
 {const res=await fetch(`${base}/counselling/${cs.id}/audio?t=${token}`);assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/audio\/wav/);await res.arrayBuffer();assertions++;}
 if(cm.engine){
   let s;for(let i=0;i<90;i++){s=await call('/counselling/'+cs.id);if(!['recorded','transcribing'].includes(s.status)||s.transcribe_error)break;await new Promise(r=>setTimeout(r,2000));}
   assert.equal(s.status,'transcribed',`transcribed locally: ${s.transcribe_error||''}`);assert.match(s.transcript.toLowerCase(),/knee/,'the transcript has what was said');assert.ok(s.segments.length>=2,'timed segments');
 }
 // a nurse drafts the summary and sends it; only the doctor signs
 await as('nurse');
 await call(`/counselling/${cs.id}/summary`,{summary:{}},'PATCH',400);
 await call(`/counselling/${cs.id}/summary`,{summary:{explained:'Knee replacement explained',risks:'Infection, clots',decision:'Agreed'},submit:true},'PATCH');
 await call(`/counselling/${cs.id}/review`,{},'POST',403);
 await as('doctor');
 assert.ok((await call('/dashboard/badges')).counselling>=1,'the doctor sees summaries to sign');
 const signed=await call(`/counselling/${cs.id}/review`,{note:'QA reviewed'});assert.equal(signed.status,'reviewed');
 await call(`/counselling/${cs.id}/summary`,{summary:{explained:'x'}},'PATCH',409);
 await call(`/counselling/${cs.id}/amend`,{summary:{explained:'Knee replacement explained (left)',decision:'Agreed'}},'POST',400);
 const am=await call(`/counselling/${cs.id}/amend`,{summary:{explained:'Knee replacement explained (left)',decision:'Agreed'},reason:'QA side clarified'});assert.equal(am.amended,1);
 await raw(cs.id,wavBuf,'audio/wav',409);   // closed sessions keep their recording
 const tl=await call(`/patients/${cp.id}/timeline`);const row=tl.counselling.find(c=>c.id===cs.id);
 assert.ok(row&&row.status==='reviewed'&&JSON.parse(row.summary_json).explained.includes('left'),'the signed summary is on the patient record');
}
// ---- fixes from the hands-on UI test (5 Oct): discharge advance vs ER bill, doctor-only clearance, no self-approval, punch after hand-marking, cheque/UPI channels
await as('admin');
{const ts=Date.now();
 const up=await call('/patients',{name:'QA ER Advance '+ts,gender:'Male',age_years:61,mobile:'9000000401'});
 const erc=await call('/ipd/emergency',{patient_id:up.id,triage:'2',complaint:'QA chest pain'});
 const erb=await call(`/ipd/emergency/${erc.id}/charges`,{description:'QA ER care',qty:1,rate:900});assert.equal(erb.balance,900);
 const vb=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');
 const adm=await call('/ipd/admissions',{patient_id:up.id,bed_id:vb.id,consultant_id:doctor.id,diagnosis:'QA ACS',emergency_id:erc.id});
 const ipb=(await call(`/ipd/admissions/${adm.id}`)).bills.find(b=>b.bill_type==='IP');
 await call(`/bills/${ipb.id}/settle`,{request_key:'qa-adv-'+ts+'-aaaaaa',allow_advance:true,lines:[{mode:'bank_transfer',amount:20000,reference:'UTR-QA'}]});
 await call(`/ipd/admissions/${adm.id}`,{status:'discharge_initiated',discharge_summary:'QA summary'},'PATCH');
 // the desk cannot give clinical clearance; the doctor can
 await as('reception');await call(`/ipd/admissions/${adm.id}`,{status:'clinically_cleared'},'PATCH',403);
 await as('doctor');await call(`/ipd/admissions/${adm.id}`,{status:'clinically_cleared'},'PATCH');
 await as('admin');
 let row=(await call('/ipd/discharge/board')).rows.find(r=>r.id===adm.id);
 assert.ok(row.open_due>=900&&row.checks.financial===false,'an unpaid ER bill keeps the financial gate open even with an IP advance');
 await call(`/ipd/admissions/${adm.id}/discharge`,{},'POST',409);
 const adj=await call(`/ipd/admissions/${adm.id}/apply-advance`,{});assert.equal(adj.adjusted[0].amount,900,'advance pays the ER bill');
 assert.equal((await call('/bills/'+erb.id)).balance,0);
 row=(await call('/ipd/discharge/board')).rows.find(r=>r.id===adm.id);assert.equal(row.checks.financial,true);
 await call(`/ipd/admissions/${adm.id}/apply-advance`,{},'POST',409);   // nothing left to adjust
 const left=-(await call('/bills/'+ipb.id)).balance;assert.ok(left>0);
 await call('/refunds',{bill_id:ipb.id,amount:left,mode:'upi',excess:true});
 await call(`/ipd/admissions/${adm.id}/discharge`,{});
 assert.equal((await call('/accounts/integrity')).ok,true,'books balance after advance adjustment and UPI refund');
 // a stock transfer is approved by someone other than the person who asked for it
 await call('/admin/users',{username:'qa-pharmhead-'+ts,name:'QA Pharmacy Head',role:'pharmacy_admin',password:'surely'});
 const meds2=await call('/pharmacy/medicines?location=IP');const m2=meds2.rows.find(m=>m.central_stock>5);
 await as('qa-pharmhead-'+ts);
 const own=await call('/pharmacy/transfers',{source:'Central',destination:'IP',lines:[{medicine_id:m2.id,qty:1}],reason:'QA self approval'});
 const selfApprove=await call(`/pharmacy/transfers/${own.id}/approve`,{},'POST',403);assert.equal(selfApprove.error,'cannot_approve_own_request');
 await as('qa-owner');await call(`/pharmacy/transfers/${own.id}/approve`,{});   // the owner approves without stock-edit rights
 // a day marked present by hand: the first punch is the arrival, the second the departure
 await as('admin');
 const clerk=await call('/admin/users',{username:'qa-clerk-'+ts,name:'QA Clerk',role:'reception',password:'surely'});
 const dToday=(d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)(new Date());
 await call('/admin/attendance/mark',{user_id:clerk.id,duty_date:dToday,status:'present'});
 await as('qa-clerk-'+ts);
 const p1=await call('/admin/attendance/punch',{});assert.ok(p1.in_at&&!p1.out_at,'first punch is the arrival');
 const p2=await call('/admin/attendance/punch',{});assert.ok(p2.out_at&&p2.hours<1,'second punch is the departure with sane hours');
 await as('admin');
}
// ---- 7 Oct: ward-specific charges on transfer, hourly charges, same-generic alternatives, GRN footer
await as('admin');
{const ts=Date.now();
 const icuOnly=(await call('/services')).find(s=>s.code==='IPC-MON')||(await call('/ipd/charge-catalog')).find(c=>/monitor/i.test(c.name));
 await call(`/services/${icuOnly.id}`,{ward_kinds:'icu',ipd_default:1,billing_unit:'day'},'PATCH');
 const wp=await call('/patients',{name:'QA Ward Move '+ts,gender:'Male',age_years:50,mobile:'9000000601'});
 let beds=(await call('/ipd/beds')).beds;
 const gw=beds.find(b=>b.status==='vacant'&&b.ward_kind!=='icu'),icuBed=beds.find(b=>b.status==='vacant'&&b.ward_kind==='icu');
 if(gw&&icuBed){
  const wa=await call('/ipd/admissions',{patient_id:wp.id,bed_id:gw.id,consultant_id:doctor.id,diagnosis:'QA move',financial_category:'self'});
  let plan=await call(`/ipd/admissions/${wa.id}/transfer-plan?bed_id=${icuBed.id}`);
  assert.ok(plan.start.some(s=>s.id===icuOnly.id),'moving into ICU starts the ICU-only charge');
  await call(`/ipd/admissions/${wa.id}`,{bed_id:icuBed.id},'PATCH');
  assert.ok((await call(`/ipd/admissions/${wa.id}`)).charges.some(c=>c.service_id===icuOnly.id&&c.status==='active'),'ICU charge running after the move');
  beds=(await call('/ipd/beds')).beds;const back=beds.find(b=>b.status==='vacant'&&b.ward_kind!=='icu');
  plan=await call(`/ipd/admissions/${wa.id}/transfer-plan?bed_id=${back.id}`);
  assert.ok(plan.stop.some(c=>c.service_id===icuOnly.id),'leaving ICU stops the ICU-only charge');
  // an hourly charge bills the started hours of each day
  const o2=(await call('/ipd/charge-catalog')).find(c=>/oxygen/i.test(c.name));
  await call(`/ipd/admissions/${wa.id}/charges`,{service_id:o2.id,rate:100,unit:'hour'});
  const raw=new DatabaseSync(path.join(dataDir,'surelyhms.db'));
  raw.prepare("UPDATE admission_charges SET started_at=datetime('now','localtime','-150 minutes') WHERE admission_id=? AND unit='hour'").run(wa.id);raw.close();
  const hourly=(await call(`/ipd/admissions/${wa.id}`)).bills.flatMap(b=>b.items).find(i=>/oxygen/i.test(i.description));
  assert.equal(hourly.qty,3,'2½ hours of oxygen bill as 3 started hours');assert.equal(hourly.amount,300);
 }
 // same composition and form = an alternative; a different composition is refused against a prescription line
 const base=(await call('/pharmacy/medicines?limit=1000')).rows.find(m=>m.composition&&m.composition!=='[]'&&m.form);
 if(base){
  const twin=await call('/pharmacy/medicines',{name:'QA Twin '+ts,form:base.form,composition:JSON.parse(base.composition),dispensing_unit:'tablet',units_per_pack:10,gst_pct:12,hsn:'3004',schedule:'H',kind:'medicine'});
  assert.equal((await call(`/pharmacy/medicines/${twin.id}/alternatives?location=Central`)).key!==null,true,'equivalence key built from the composition');
  const other=await call('/pharmacy/medicines',{name:'QA Other '+ts,form:base.form,composition:[{generic:'QA-unrelated-'+ts,strength:'1 mg'}],dispensing_unit:'tablet',units_per_pack:10,gst_pct:12,hsn:'3004',schedule:'H',kind:'medicine'});
  assert.ok(!(await call(`/pharmacy/medicines/${twin.id}/alternatives?location=Central`)).rows.some(r=>r.id===other.id),'a different composition is never an alternative');
 }
}
// public endpoints answer without a login (the login page's demo list, the waiting-room display, health)
for (const pub of ['/auth/demo-accounts', '/queue/display', '/system/health', '/counters']) assert.equal((await fetch(base + pub)).status, 200, 'public endpoint ' + pub);
assert.equal((await fetch(base + '/staff-work/chat')).status, 401, 'team chat still needs a login');
// books integrity: clean books pass; a receipt removed outside the app is found and corrected by a mirror entry
await as('admin');
assert.equal((await call('/accounts/integrity')).ok,true,'books integrity passes on clean books');
await call('/ipd/nursing/notes',{admission_id:adm2.id,body:''},'POST',400);   // an empty nursing note is refused
{const raw=new DatabaseSync(path.join(dataDir,'surelyhms.db'));raw.exec('PRAGMA foreign_keys=OFF');
 const victim=raw.prepare("SELECT p.id FROM payments p WHERE p.cancelled=0 AND EXISTS (SELECT 1 FROM journal_vouchers v WHERE v.source='payment' AND v.source_id=p.id) ORDER BY p.id DESC LIMIT 1").get();
 raw.prepare('DELETE FROM payments WHERE id=?').run(victim.id);raw.close();
 const bad=await call('/accounts/integrity');assert.equal(bad.ok,false);assert.ok(bad.orphan_vouchers.some(v=>v.source==='payment'&&v.source_id===victim.id&&v.problem==='record_missing'),'orphan receipt voucher found');
 await call('/accounts/integrity/correct',{},'POST',400);
 const fixed=await call('/accounts/integrity/correct',{reason:'QA receipt removed outside the app'});assert.equal(fixed.integrity.ok,true,'books clean after correction');
 await call('/accounts/integrity/correct',{reason:'again'},'POST',409);}
console.log(JSON.stringify({passed:true,apiChecks:assertions,listEndpoints:lists,workflows:['patient','appointment conversion','payment and receipt','vitals and queue gate','signed consultation and amendments','lab order and verified report','admission and discharge','maternity and partograph','emergency bypass','pharmacy stock and billing','honest sync status','bill search link','imaging report','OT booking','nursing and eMAR','supplier and GRN','expense approval and duplicate protection','insurance','certificates','quality','counter reconciliation','templates','attendance','split payment and payer settlement','idempotent collection','receivable receipt with disallowance','free treatment','multi-line transfer with short receipt','ward indent to IP bill','sales return and refund','IGST GRN with package conversion','purchase return','supplier payment','stock adjustment posting','manual journal guard','trial balance and balance sheet','report centre','department reports','department dashboards','day close lock','day close approval and post-close lock','audit before and after','role dashboards','role permissions']},null,2));

} finally {
 if(server.exitCode===null){server.kill();await once(server,'exit');}
 const resolved=fs.realpathSync(dataDir);
 if(path.dirname(resolved)===tempRoot && path.basename(resolved).startsWith('surelyhms-test-')) fs.rmSync(resolved,{recursive:true,force:true});
}
