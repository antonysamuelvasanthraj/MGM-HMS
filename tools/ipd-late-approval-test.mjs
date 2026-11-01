import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import crypto from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'surelyhms-test-payer-desks-'));const env={...process.env,SURELY_DATA:dir,NODE_ENV:'test',PORT:'4494'};const fx=spawnSync(process.execPath,['tools/fixtures/hospital.mjs'],{env,encoding:'utf8',windowsHide:true});assert.equal(fx.status,0,fx.stderr);const db=new DatabaseSync(path.join(dir,'surelyhms.db'));const server=spawn(process.execPath,['server/index.js'],{env,stdio:'ignore',windowsHide:true});let token;let checks=0;
async function call(route,body,method=body===undefined?'GET':'POST',status=200){const r=await fetch('http://localhost:4494/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{'X-Session':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,route+' '+JSON.stringify(d));checks++;return d;}
async function login(username){token=(await call('/auth/login',{username,password:'surely'})).token;}
try{for(let i=0;i<60;i++){try{if((await fetch('http://localhost:4494/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
await login('admin');await call('/settings',{aarogyasri_ipd_only:'1',scheme_checklist_required:'1'},'PATCH');
const meta=await call('/meta');const doctor=meta.doctors.find(d=>d.role==='doctor');const p=await call('/patients',{name:'Late approval admission test',gender:'Male',age_years:45});
const scheme=await call('/payers',{name:'Test government scheme',code:'QA-GOV',payer_type:'aarogyasri'});
const tpa=await call('/payers',{name:'Test TPA',code:'QA-TPA',payer_type:'insurance'});
const op=await call('/encounters',{patient_id:p.id,doctor_id:doctor.id});await call('/payments',{bill_id:op.bill.id,amount:op.bill.total,mode:'cash'});
await call('/encounters/'+op.encounter.id+'/payer',{category:'aarogyasri',payer_id:scheme.id,reason:'Invalid OP scheme'},'POST',400);
await call('/insurance/claims',{patient_id:p.id,encounter_id:op.encounter.id,payer_type:'aarogyasri',tpa:'No IP admission'},'POST',400);
const originalOp=await call('/bills/'+op.bill.id);
for(const [category,payer] of [['aarogyasri',scheme],['insurance',tpa]]){
 const bed=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');
 const a=await call('/ipd/admissions',{patient_id:p.id,bed_id:bed.id,consultant_id:doctor.id,financial_category:'self',diagnosis:'Synthetic late approval'});
 let detail=await call('/ipd/admissions/'+a.id);const ip=detail.bills.find(b=>b.bill_type==='IP');await call('/payments',{bill_id:ip.id,amount:50,mode:'cash'});
 await call('/ipd/admissions/'+a.id+'/payer',{financial_category:category,payer_id:payer.id,reason:'Approval letter received'},'PATCH',409);
 const changed=await call('/ipd/admissions/'+a.id+'/payer',{financial_category:category,payer_id:payer.id,reason:'Fictional approval letter received',money_action:'keep'},'PATCH');assert.equal(changed.financial_category,category);
 const claimId=changed.claim_id;assert.ok(claimId);let claim=(await call('/insurance/claims')).rows.find(c=>c.id===claimId);assert.equal(claim.status,'preauth_pending');
 assert.equal((await call('/bills/'+ip.id)).paid,50);assert.equal((await call('/bills/'+op.bill.id)).payer_type,originalOp.payer_type);assert.equal((await call('/bills/'+op.bill.id)).paid,originalOp.paid);
 const medicine=await call('/bills',{patient_id:p.id,encounter_id:a.encounter_id,bill_type:'PHARM',items:[{description:'Synthetic excluded medicine',category:'pharmacy',qty:1,rate:100}]});
 const lines=await call('/insurance/claims/'+claimId+'/lines');await call('/insurance/claims/'+claimId+'/exclusions',{allocations:lines.map(l=>({item_id:l.id,patient_amount:l.bill_type==='PHARM'?50:0})),reason:'Approved non-covered medicine share'},'PUT');
 let approval={status:'preauth_approved',approved:10000,copay_amount:category==='insurance'?50:0};
 if(category==='aarogyasri'){
  await call('/insurance/claims/'+claimId,approval,'PATCH',409);
  const pkg=await call('/packages',{code:'QA-GOV-PACK',name:'Synthetic government package',price:1500,cover_categories:['bed'],items:[]});
  approval={...approval,package_id:pkg.id,scheme_card_no:'TEST-CARD',eligibility_verified:1,preauth_no:'TEST-GOV-APPROVAL'};
 }
 await call('/insurance/claims/'+claimId,approval,'PATCH');
 await call('/ipd/admissions/'+a.id+'/summary',{diagnosis:'Synthetic late approval complete',sections:{course:'Self-pay admission converted after test approval',condition:'Fictional stable patient',advice:'Software test only'},finalize:true},'PUT');
 await call('/ipd/admissions/'+a.id,{status:'clinically_cleared'},'PATCH');
 let sum=await call('/insurance/claims/'+claimId+'/collection-summary');for(const b of sum.bills.filter(b=>b.patient_due>0))await call('/payments',{bill_id:b.id,amount:b.patient_due,mode:'upi',reference:'Test patient share'});
 await call('/ipd/admissions/'+a.id+'/discharge',{});
 sum=await call('/insurance/claims/'+claimId+'/collection-summary');assert.equal(sum.patient_due,0);
 const ars=(await call('/accounts/receivables?claim_id='+claimId+'&status=all')).rows;for(const ar of ars.filter(r=>r.open>0))await call('/accounts/receivables/'+ar.id+'/receive',{amount:ar.open,mode:'bank_transfer',reference:'Test payer bank settlement'});
 assert.equal((await call('/insurance/claims/'+claimId+'/collection-summary')).payer_outstanding,0);
 await call('/ipd/beds/'+bed.id+'/cleaned',{});
 console.log('PASS self-pay → '+category+'; deposit preserved, old OP unchanged, approval checklist, medicine exclusion, discharge, payer receipt');
}
assert.equal(db.prepare('SELECT count(*) n FROM (SELECT voucher_id FROM journal_lines GROUP BY voucher_id HAVING abs(sum(debit)-sum(credit))>0.01)').get().n,0);console.log(JSON.stringify({passed:true,checks,ipdOnly:true,lateApproval:true,oldOpPreserved:true,bankAndCashBalanced:true}));
}finally{server.kill();db.close();}

