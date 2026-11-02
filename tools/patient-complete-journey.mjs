/** Synthetic patient only. Default URL must be an isolated test server; --live authorizes retained demo records. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const live=process.argv.includes('--live');
const base=process.env.JOURNEY_URL || (live?'http://localhost:4300':'http://localhost:4495');
if(!live&&base.includes(':4300'))throw Error('Explicit --live required');
const tag='QA COMPLETE '+new Date().toISOString().slice(0,10)+' '+crypto.randomBytes(2).toString('hex');
const report={tag,base,steps:[],records:{},paymentModes:[],settingsRestored:false};
const file=live?'data/complete-patient-journey.json':'data/isolated-patient-journey.json';
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
let token=process.env.JOURNEY_TOKEN;
async function call(route,body,method=body===undefined?'GET':'POST',expected=200){
 const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{'X-Session':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();
 assert.equal(r.status,expected,method+' '+route+': '+JSON.stringify(d));return d;
}
const step=name=>{report.steps.push(name);save();console.log('PASS '+name);};
try{
 if(!token)token=(await call('/auth/login',{username:'admin',password:'surely'})).token;
 const meta=await call('/meta'),users=await call('/admin/users');
 let doctor=users.find(u=>u.role==='doctor'&&u.active);
 if(!doctor)doctor=await call('/admin/users',{username:'qa.clinician.'+Date.now(),name:tag+' Clinician',role:'doctor',department_id:meta.departments.find(d=>d.code==='GEN').id,password:crypto.randomBytes(20).toString('hex'),op_fee:300});
 report.records.doctor=doctor.id;
 const patient=await call('/patients',{name:tag+' TEST PATIENT',gender:'Male',age_years:40,city:'Fictional QA record',remarks:'User-authorized synthetic workflow; no actual treatment or money received.'});report.records.patient=patient;save();
 const old=await call('/bills',{patient_id:patient.id,bill_type:'OP',notes:'Fictional brought-forward old due from 2024; entered today for workflow testing',items:[{description:'TEST ONLY — old due brought forward from 2024',category:'other',qty:1,rate:1000}]});
 await call('/payments',{bill_id:old.id,amount:400,mode:'cash',reference:tag+' historical partial'});report.records.oldDueBill=old.id;step('Old due 1000; partial receipt 400; remaining 600');
 const visit=await call('/encounters',{patient_id:patient.id,doctor_id:doctor.id,collect:false});report.records.encounter=visit.encounter.id;
 if(visit.bill?.balance>0)await call('/payments',{bill_id:visit.bill.id,amount:visit.bill.balance,mode:'cash',reference:tag+' OP'});
 await call('/vitals',{encounter_id:visit.encounter.id,bp_sys:120,bp_dia:80,pulse:76,temp_f:98.6,spo2:99});
 await call(`/encounters/${visit.encounter.id}/stage`,{stage:'in_consult'});
 await call('/consultations',{encounter_id:visit.encounter.id,chief_complaint:'SYNTHETIC QA ONLY',diagnosis:'Fictional workflow verification',plan:'No treatment advice; software test only',status:'signed'});step('OP registration, fee, vitals and signed consultation');
 for(const mode of ['cash','upi','debit_card','credit_card','card','bank_transfer','cheque']){
  const b=await call('/bills',{patient_id:patient.id,encounter_id:visit.encounter.id,bill_type:'OP',items:[{description:'TEST payment mode '+mode,category:'other',qty:1,rate:100}]});
  await call('/payments',{bill_id:b.id,amount:100,mode,reference:tag+' '+mode});assert.equal((await call('/bills/'+b.id)).balance,0);report.paymentModes.push(mode);
 }
 const split=await call('/bills',{patient_id:patient.id,bill_type:'OP',items:[{description:'TEST split service',category:'other',qty:1,rate:300}]});
 await call(`/bills/${split.id}/settle`,{request_key:crypto.randomUUID(),lines:[{mode:'cash',amount:100},{mode:'upi',amount:200,reference:tag+' split UPI'}]});assert.equal((await call('/bills/'+split.id)).balance,0);step('All seven monetary mode values and cash/UPI split settled');
 const supplier=await call('/pharmacy/suppliers',{name:tag+' Fictional supplier'});report.records.supplier=supplier.id;
 const medicines=[];for(const [i,name] of ['Test Paracetamol','Test Vitamin C','Test dressing material'].entries())medicines.push(await call('/pharmacy/medicines',{name:tag+' '+name,code:tag.replaceAll(' ','')+'-'+i,form:i===2?'other':'tablet',kind:i===2?'consumable':'drug',generic:'Fictional QA '+tag+' '+name,units_per_pack:1,pack_size:1,gst_pct:0}));
 report.records.medicines=medicines.map(m=>({id:m.id,name:m.name}));
 const grn=await call('/pharmacy/purchases',{supplier_id:supplier.id,invoice_no:tag.replaceAll(' ','-'),invoice_date:new Date().toLocaleDateString('en-CA'),remarks:'TEST ONLY — fictional supplier liability',items:medicines.map((m,i)=>({medicine_id:m.id,batch_no:'QA-'+i,expiry:'2028-12-31',qty:100,rate:5,mrp:10,selling_price:10,gst_pct:0}))});
 await call(`/pharmacy/purchases/${grn.id}/verify`,{});report.records.grn=grn.id;
 for(const destination of ['OP','IP']){const transfer=await call('/pharmacy/transfers',{source:'Central',destination,lines:medicines.map(m=>({medicine_id:m.id,qty:20})),reason:'Synthetic QA rack stock'});for(const action of ['approve','issue','receive'])await call(`/pharmacy/transfers/${transfer.id}/${action}`,{});}
 const rx=await call('/prescriptions',{encounter_id:visit.encounter.id,notes:'TEST ONLY — not a treatment instruction',items:[{medicine_id:medicines[0].id,drug:medicines[0].name,dose:'QA only',frequency:'QA only',duration_days:1,qty:2}]});
 const sale=await call('/pharmacy/dispense',{patient_id:patient.id,encounter_id:visit.encounter.id,prescription_id:rx.id,location:'OP',items:[{medicine_id:medicines[0].id,qty:2}],collect:false});
 await call('/payments',{bill_id:sale.bill.id,amount:sale.bill.balance,mode:'upi',reference:tag+' pharmacy'});step('Three medicines, verified GRN, Central→OP/IP transfers, prescription and paid dispensing');
 const lab=meta.services.find(s=>s.category==='lab'&&s.active&&s.price>0);
 if(lab){const order=await call('/orders',{encounter_id:visit.encounter.id,confirm_duplicate:true,items:[{service_id:lab.id}]});const oid=order.orders[0].id;
 if(order.bill?.balance>0)await call('/payments',{bill_id:order.bill.id,amount:order.bill.balance,mode:'debit_card',reference:tag+' lab'});
 await call(`/lab/orders/${oid}/collect`,{});const detail=await call('/lab/orders/'+oid);
 await call(`/lab/orders/${oid}/results`,{results:detail.params.length?detail.params.map(p=>({param_id:p.id,name:p.name,value:p.result_type==='text'?'QA synthetic result':String(p.ref_low!=null&&p.ref_high!=null?(p.ref_low+p.ref_high)/2:1)})):[{name:'QA observation',value:'Synthetic result'}]});
 await call(`/lab/orders/${oid}/verify`,{});await call('/lab/report/'+oid);report.records.labOrder=oid;step('Lab bill, payment, collection, result entry, verification and report');}
 const bed=(await call('/ipd/beds')).beds.find(b=>b.status==='vacant');assert.ok(bed,'Vacant bed required');
 const admission=await call('/ipd/admissions',{patient_id:patient.id,bed_id:bed.id,consultant_id:doctor.id,diagnosis:'SYNTHETIC observation only',financial_category:'self'});report.records.admission=admission.id;report.records.ipNumber=admission.ip_no;save();
 await call('/ipd/nursing/notes',{admission_id:admission.id,body:'Fictional nursing observation; patient stable; software test'});
 await call('/pharmacy/dispense',{patient_id:patient.id,encounter_id:admission.encounter_id,admission_id:admission.id,location:'IP',items:[{medicine_id:medicines[1].id,qty:3}],collect:false});
 const charges=await call('/ipd/charge-catalog');const oxygen=charges.find(c=>c.code==='IPC-OXY');if(oxygen){await call(`/ipd/admissions/${admission.id}/charges`,{service_id:oxygen.id,unit:'hour',rate:100,request_key:crypto.randomUUID()});const plan=await call(`/ipd/admissions/${admission.id}/charges`);const running=plan.plan.find(c=>c.service_id===oxygen.id);if(running)await call(`/ipd/admissions/${admission.id}/charges/${running.id}/stop`,{reason:'QA simulated equipment stopped'});}
 await call(`/ipd/admissions/${admission.id}/summary`,{finalize:true,diagnosis:'Fictional workflow verification complete',sections:{complaints:'TEST ONLY',course:'OP consultation, pharmacy, lab and inpatient workflow tested',condition:'Synthetic stable patient',advice:'No clinical advice — software QA',follow_up:'Not applicable'}},'PUT');
 await call(`/ipd/admissions/${admission.id}`,{status:'clinically_cleared'},'PATCH');
 const packet=await call(`/ipd/admissions/${admission.id}/print-pack`);for(const bill of packet.bills.filter(b=>b.balance>0))await call('/payments',{bill_id:bill.id,amount:bill.balance,mode:'bank_transfer',reference:tag+' discharge'});
 await call('/payments',{bill_id:old.id,amount:600,mode:'cash',reference:tag+' old balance cleared'});
 await call(`/ipd/admissions/${admission.id}/discharge`,{});assert.equal((await call('/ipd/admissions/'+admission.id)).status,'discharged');await call(`/ipd/beds/${bed.id}/cleaned`,{notes:'QA housekeeping complete'});step('Nursing, IP medicines, signed summary, financial clearance, discharge and bed cleaning');
 const timeline=await call(`/patients/${patient.id}/timeline`);assert.ok(timeline.bills.every(b=>Math.abs(b.balance)<0.01),'Patient has unsettled bills');report.finalBalance=timeline.bills.reduce((a,b)=>a+b.balance,0);report.records.billCount=timeline.bills.length;
 const original=await call('/settings');const changed={ui_theme:original.ui_theme==='calm'?'maroon':'calm',token_reset:original.token_reset==='daily'?'never':'daily'};
 try{await call('/settings',changed,'PATCH');const check=await call('/settings');for(const [k,v]of Object.entries(changed))assert.equal(check[k],v);}finally{await call('/settings',Object.fromEntries(Object.keys(changed).map(k=>[k,original[k]])),'PATCH');}
 const restored=await call('/settings');for(const k of Object.keys(changed))assert.equal(restored[k],original[k]);report.settingsRestored=true;step('Theme and token settings changed, verified and restored');
 report.passed=true;save();console.log(JSON.stringify(report));
}catch(e){report.error=e.message;save();throw e;}


