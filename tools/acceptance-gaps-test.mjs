import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'surelyhms-test-acceptance-gaps-'));
const env={...process.env,SURELY_DATA:dir,NODE_ENV:'test',PORT:'4504'};
const fixture=spawnSync(process.execPath,['tools/fixtures/hospital.mjs'],{env,encoding:'utf8',windowsHide:true});assert.equal(fixture.status,0,fixture.stderr);
const server=spawn(process.execPath,['server/index.js'],{env,stdio:'ignore',windowsHide:true});const origin='http://localhost:4504';let token,checks=0;
async function call(url,body,method=body===undefined?'GET':'POST',expected=200,portalToken){const r=await fetch(origin+'/api'+url,{method,headers:{'Content-Type':'application/json',...(portalToken?{'X-Portal-Token':portalToken}:token?{'X-Session':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,url+': '+JSON.stringify(data));checks++;return data;}
try{
 for(let i=0;i<300;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 token=(await call('/auth/login',{username:'admin',password:'surely'})).token;
 const meta=await call('/meta'),doctor=meta.doctors.find(d=>d.role==='doctor');
 const p=await call('/patients',{name:'Isolated OT safety acceptance',gender:'Female',age_years:30});
 const ot=await call('/ipd/ot',{patient_id:p.id,procedure:'Synthetic safety workflow',theatre:'OT-1 Major',surgeon_id:doctor.id,scheduled_at:new Date().toISOString().slice(0,16).replace('T',' '),charges:[{description:'Synthetic theatre fee',rate:1000}]});
 for(const status of ['in_theatre','recovery','completed'])await call('/ipd/ot/'+ot.id,{status},'PATCH',409);
 await call('/ipd/ot/'+ot.id,{consent:1,checklist:{consent:true}},'PATCH');
 for(const status of ['in_theatre','recovery','completed'])await call('/ipd/ot/'+ot.id,{status},'PATCH',409);
 await call('/ipd/ot/'+ot.id,{checklist:{consent:'not_applicable'}},'PATCH',400);
 await call('/ipd/ot/'+ot.id,{checklist:{consent:true,fasting:'yes'}},'PATCH',400);
 await call('/ipd/ot/'+ot.id,{status:'imaginary'},'PATCH',400);
 const checklist={consent:true,site_marked:true,fasting:true,allergy:true,implants:'not_applicable',blood:'not_applicable',antibiotic:true,count:true};
 await call('/ipd/ot/'+ot.id,{checklist,notes:''},'PATCH');
 await call('/ipd/ot/'+ot.id,{status:'in_theatre'},'PATCH',409);
 await call('/ipd/ot/'+ot.id,{notes:'Synthetic test case: implants and blood products not applicable'},'PATCH');
 const started=await call('/ipd/ot/'+ot.id,{status:'in_theatre'},'PATCH');
 const retry=await call('/ipd/ot/'+ot.id,{status:'in_theatre'},'PATCH');assert.equal(retry.started_at,started.started_at);
 const done=await call('/ipd/ot/'+ot.id,{status:'completed'},'PATCH');assert.ok(done.billed_to);
 const completeAgain=await call('/ipd/ot/'+ot.id,{status:'completed'},'PATCH');assert.equal(completeAgain.ended_at,done.ended_at);
 const bills=await call('/bills?q='+encodeURIComponent(done.billed_to));const bill=(bills.rows||bills).find(b=>b.bill_no===done.billed_to);assert.equal(bill.total,1000);
 await call('/ipd/ot/'+ot.id,{status:'pre_op'},'PATCH',409);
 const adminToken=token;token=(await call('/auth/login',{username:'pharmacy',password:'surely'})).token;await call('/ipd/ot/'+ot.id,{status:'in_theatre'},'PATCH',403);token=adminToken;
 const second=await call('/patients',{name:'Isolated other portal patient',gender:'Male',age_years:40});
 const access=await call('/patients/'+p.id+'/portal-access',{}),otherAccess=await call('/patients/'+second.id+'/portal-access',{});
 const a=await call('/portal/login',{identifier:access.uhid,pin:access.pin}),b=await call('/portal/login',{identifier:otherAccess.uhid,pin:otherAccess.pin});
 const own=await call('/portal/me?patient_id='+second.id,undefined,'GET',200,a.token);assert.equal(own.patient.uhid,p.uhid);assert.notEqual(own.patient.uhid,second.uhid);
 const other=await call('/portal/me?patient_id='+p.id,undefined,'GET',200,b.token);assert.equal(other.patient.uhid,second.uhid);
 await call('/patients/'+second.id,undefined,'GET',401,a.token);
 await call('/portal/me',undefined,'GET',401,'invalid-test-token');
 await call('/patients/'+p.id+'/portal-access/revoke',{reason:'Synthetic acceptance revoke'});
 await call('/portal/me',undefined,'GET',401,a.token);
 const otherStillActive=await call('/portal/me',undefined,'GET',200,b.token);assert.equal(otherStillActive.patient.uhid,second.uhid);
 const report={passed:true,checks,isolated:true,ot:{missingConsentBlocked:true,incompleteChecklistCannotSkipToCompletion:true,invalidValuesRejected:true,notApplicableRequiresReason:true,completeWithReasonAccepted:true,timestampsStable:true,billedOnce:true,closedCaseCannotReopen:true,pharmacyCannotManage:true},portal:{patientIsolation:true,portalTokenCannotReadStaffEndpoints:true,invalidTokenRejected:true,revocationImmediate:true,otherPatientUnaffected:true}};
 fs.writeFileSync('data/logs/acceptance-gaps-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{server.kill();}
