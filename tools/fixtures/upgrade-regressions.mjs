import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export async function upgradeRegressions({api,request,login,check,dataDir,stream}) {
  await login('admin');
  const db=new DatabaseSync(path.join(dataDir,'surelyhms.db'));
  const day=new Date().toLocaleDateString('en-CA');
  const assertRejected=async(label,url,body,method='POST',status=400)=>{const r=await request(url,body,method);check(label,()=>assert.equal(r.status,status,JSON.stringify(r.body)));};
  try {
    const source=await api('/referral-sources',{kind:'doctor',name:'Upgrade referral doctor',hospital:'Outside hospital',speciality:'Medicine',mobile:'9000000456'});
    const hospital=await api('/referral-sources',{kind:'hospital',name:'Upgrade outside hospital'});
    const patient=await api('/patients',{name:'Upgrade integrated patient',gender:'Female',age_years:30,pregnant:1,referral_doctor_id:source.id,referral_hospital_id:hospital.id,referral_reason:'Specialist care'});
    check('patient stores both referral sources independently',()=>{assert.equal(patient.referral_doctor_id,source.id);assert.equal(patient.referral_hospital_id,hospital.id);});
    await assertRejected('wrong referral kind rejected','/patients',{name:'Invalid referral',gender:'Male',referral_doctor_id:hospital.id});
    const file=await api(`/attachments/patient/${patient.id}`,{files:[{name:'outside-report.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4\nSynthetic test report').toString('base64')}],note:'Outside investigation'});
    check('patient outside records upload and list',()=>assert.ok(file.some(f=>f.file_name==='outside-report.pdf')));
    await login('pharmacy');await assertRejected('outside clinical attachments protected',`/attachments/patient/${patient.id}`,undefined,'GET',403);await login('admin');
    const referralReport=await api(`/reports/run/referral_analytics?preset=custom&from=${day}&to=${day}`);
    check('referral analytics counts registration without payment',()=>assert.equal(referralReport.rows.find(r=>r.id===source.id).patients,1));
    check('referral creates no fee attribution',()=>assert.equal(db.prepare('SELECT count(*) n FROM bill_items WHERE visiting_doctor_id=?').get(source.id).n,0));
    const mixed=await api('/bills',{patient_id:patient.id,bill_type:'IP',items:[{description:'Clinical service',category:'consultation',qty:1,rate:100},{description:'Medicine protected',category:'pharmacy',qty:1,rate:200}]});
    await assertRejected('IP discount cannot consume medicine value',`/bills/${mixed.id}`,{discount:101,discount_reason:'Test eligibility'},'PATCH');
    const discounted=await api(`/bills/${mixed.id}`,{discount:100,discount_reason:'Approved clinical service discount'},'PATCH');
    check('mixed IP bill preserves full medicine amount',()=>{assert.equal(discounted.total,200);assert.equal(discounted.items.find(i=>i.category==='pharmacy').amount,200);});
    const pharmacyDiscount=db.prepare(`SELECT coalesce(sum(l.debit-l.credit),0) value FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id WHERE v.source='bill' AND v.source_id=? AND a.system_key='discount_allowed' AND l.segment='PHARMACY'`).get(mixed.id).value;
    check('mixed bill discount posts only to clinical segment',()=>assert.equal(pharmacyDiscount,0));
    await assertRejected('cannot remove charge backing bill discount',`/bills/${mixed.id}/items/${mixed.items[0].id}?reason=Test`,undefined,'DELETE',409);
    await assertRejected('pharmacy bill create discounts rejected','/bills',{patient_id:patient.id,bill_type:'PHARM',discount:1,discount_reason:'Forbidden',items:[{category:'pharmacy',description:'Medicine',qty:1,rate:100}]});
    await assertRejected('pharmacy line discounts rejected','/bills',{patient_id:patient.id,discount_reason:'Forbidden',items:[{category:'pharmacy',description:'Medicine',qty:1,rate:100,discount:1}]});
    await assertRejected('line discount reason required','/bills',{patient_id:patient.id,items:[{category:'consultation',description:'Service',qty:1,rate:100,discount:1}]});
    const lineDiscount=await api('/bills',{patient_id:patient.id,discount_reason:'Approved clinical adjustment',items:[{category:'consultation',description:'Discounted service',qty:1,rate:100,discount:10}]});
    const waivedMixed=await api('/bills',{patient_id:patient.id,items:[{description:'Waivable clinical fee',category:'consultation',qty:1,rate:100},{description:'Protected medicine fee',category:'pharmacy',qty:1,rate:200}]});
    await api(`/bills/${waivedMixed.id}/items/${waivedMixed.items[0].id}/waive`,{reason:'Cancelled unperformed consultation'});
    await assertRejected('waived hospital charges cannot discount remaining medicines',`/bills/${waivedMixed.id}`,{discount:1,discount_reason:'Forbidden duplicate deduction'},'PATCH');
    check('approved service line discount works',()=>assert.equal(lineDiscount.total,90));
    await login('pharmacy');await assertRejected('unapproved service discount blocked','/bills',{patient_id:patient.id,bill_type:'PHARM',items:[{category:'other',description:'Invalid',qty:1,rate:100,discount:1}],discount_reason:'Forbidden'});await login('admin');
    const med=db.prepare('SELECT * FROM medicines WHERE active=1 LIMIT 1').get();
    const batch=Number(db.prepare('INSERT INTO medicine_batches(medicine_id,batch_no,expiry,qty,location,mrp,selling_price,purchase_rate) VALUES(?,?,?,?,?,?,?,?)').run(med.id,'UPGRADE-POS','2099-01-01',20,'OP',100,100,50).lastInsertRowid);
    const pos={rx_note:'Regression paper Rx',patient_id:patient.id,items:[{medicine_id:med.id,batch_id:batch,qty:1,rate:100}],collect:false};
    await assertRejected('POS bill discount rejected','/pharmacy/dispense',{...pos,discount:1});
    await assertRejected('POS medicine discount rejected','/pharmacy/dispense',{...pos,items:[{...pos.items[0],discount_pct:10}]});
    await assertRejected('price override cannot bypass discount ban','/pharmacy/dispense',{...pos,items:[{...pos.items[0],rate:99}]});
    const held=await api('/pharmacy/held-bills',{...pos,notes:'Hold regression'});
    check('hold does not deduct stock or create sales',()=>assert.equal(db.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batch).qty,20));
    const heldList=await api('/pharmacy/held-bills');check('held bill listed',()=>assert.ok(heldList.some(h=>h.id===held.id)));
    const resumed=await api(`/pharmacy/held-bills/${held.id}/resume`,{});check('resume restores patient and exact cart',()=>{assert.equal(resumed.patient.id,patient.id);assert.equal(resumed.items[0].batch_id,batch);assert.equal(resumed.notes,'Hold regression');});
    await assertRejected('held bill cannot be resumed twice',`/pharmacy/held-bills/${held.id}/resume`,{},'POST',409);
    const sale=await api('/pharmacy/dispense',pos);check('sale deducts stock once with zero discount',()=>{assert.equal(sale.bill.discount,0);assert.equal(db.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batch).qty,19);});
    await assertRejected('pharmacy invoice discount patch blocked',`/bills/${sale.bill.id}`,{discount:1,discount_reason:'Forbidden'},'PATCH');
    const saleBill=await api(`/bills/${sale.bill.id}`);check('pharmacy print data includes batch expiry and MRP',()=>{assert.equal(saleBill.items[0].batch_no,'UPGRADE-POS');assert.equal(saleBill.items[0].mrp,100);assert.equal(saleBill.items[0].expiry,'2099-01-01');});
    const register=await api(`/reports/run/pharmacy_patient_register?preset=custom&from=${day}&to=${day}&patient=${encodeURIComponent(patient.uhid)}`);
    check('patient pharmacy report filters actual sales',()=>{assert.ok(register.rows.some(r=>r.bill_no===sale.bill.bill_no));assert.ok(register.rows.every(r=>r.uhid===patient.uhid));});
    const doc=await api('/visiting-doctors',{name:'Upgrade clinical doctor',share_type:'percent',share_value:50,tds_pct:10,hospital:'Partner hospital',doctor_type:'visiting',schedule:'Monday',settlement_terms:'Monthly clinical fees',agreement_reference:'CLINICAL-AGREEMENT',session_fee:1000,day_fee:2000});
    const clinical=await api('/bills',{patient_id:patient.id,items:[{description:'Consultation actually provided',category:'consultation',qty:1,rate:1000}]});
    await api(`/bills/${clinical.id}/items/${clinical.items[0].id}/visiting`,{visiting_doctor_id:doc.id,role:'consultant'},'PATCH');
    await api('/payments',{bill_id:clinical.id,amount:1000,mode:'cash'});
    let ledger=await api(`/visiting-doctors/${doc.id}/ledger`);check('clinical fee earned on collected service',()=>assert.equal(ledger.earned,500));
    await api(`/visiting-doctors/${doc.id}`,{share_value:90},'PATCH');ledger=await api(`/visiting-doctors/${doc.id}/ledger`);
    check('historical clinical earnings frozen after master edit',()=>{assert.equal(ledger.earned,500);assert.equal(ledger.lines[0].visiting_agreement,'CLINICAL-AGREEMENT');});
    await assertRejected('partial percent edit validated',`/visiting-doctors/${doc.id}`,{share_value:101},'PATCH');
    await assertRejected('medicines cannot earn doctor fees',`/bills/${sale.bill.id}/items/${saleBill.items[0].id}/visiting`,{visiting_doctor_id:doc.id,role:'consultant'},'PATCH');
    await api(`/visiting-doctors/${doc.id}/statements`,{});
    await login('reception');await assertRejected('reception cannot release doctor payments',`/visiting-doctors/${doc.id}/payouts`,{amount:500,mode:'cash'},'POST',403);await login('admin');
    const payout=await api(`/visiting-doctors/${doc.id}/payouts`,{amount:500,mode:'bank_transfer',reference:'UPGRADE-UTR'});check('doctor payment deducts TDS and closes payable',()=>{assert.equal(payout.net,450);assert.equal(payout.tds,50);});
    ledger=await api(`/visiting-doctors/${doc.id}/ledger`);check('doctor payable reconciles with financial books',()=>{assert.equal(ledger.payable,0);assert.equal(ledger.reconciled,true);});
    await api(`/visiting-doctors/${doc.id}/adjustments`,{amount:100,reason:'Approved clinical agreement correction',reference:'CLINICAL-AGREEMENT'});
    ledger=await api(`/visiting-doctors/${doc.id}/ledger`);check('approved adjustment appears as pending accrual',()=>{assert.equal(ledger.adjustment_total,100);assert.equal(ledger.not_yet_accrued,100);});
    await api(`/visiting-doctors/${doc.id}/statements`,{});ledger=await api(`/visiting-doctors/${doc.id}/ledger`);check('fee adjustment reconciles after statement',()=>{assert.equal(ledger.payable,100);assert.equal(ledger.reconciled,true);});
    const surgeon=await api('/visiting-doctors',{name:'Upgrade fixed surgeon',share_type:'fixed',share_value:30000,tds_pct:0,agreement_reference:'SURGERY-FIXED'});
    const anaesthetist=await api('/visiting-doctors',{name:'Upgrade fixed anaesthetist',share_type:'fixed',share_value:10000,tds_pct:0,agreement_reference:'ANAESTHESIA-FIXED'});
    const freeBed=db.prepare("SELECT id FROM beds WHERE status='vacant' LIMIT 1").get();db.prepare('UPDATE beds SET tariff=0 WHERE id=?').run(freeBed.id);db.prepare("UPDATE services SET price=0 WHERE code IN ('BED-GEN','BED-PVT','BED-ICU')").run();
    const admission=await api('/ipd/admissions',{patient_id:patient.id,bed_id:freeBed.id,diagnosis:'Synthetic integrated surgery'});
    const ot=await api('/ipd/ot',{patient_id:patient.id,admission_id:admission.id,procedure:'Upgrade complete surgery',scheduled_at:`${day} 10:00:00`,theatre:'OT-1',visiting_surgeon_id:surgeon.id,visiting_anaesthetist_id:anaesthetist.id,
      charges:[{description:'OT room fee',rate:25000,category:'ot'},{description:'Surgeon professional fee',rate:30000,role:'surgeon'},{description:'Anaesthetist professional fee',rate:10000,role:'anaesthetist'},{description:'Other hospital charges',rate:5000,category:'other'}]});
    await api(`/ipd/ot/${ot.id}`,{consent:1,status:'completed'},'PATCH');
    const ipBatch=Number(db.prepare('INSERT INTO medicine_batches(medicine_id,batch_no,expiry,qty,location,mrp,selling_price,purchase_rate) VALUES(?,?,?,?,?,?,?,?)').run(med.id,'UPGRADE-IP-SURGERY','2099-01-01',10,'IP',1000,1000,500).lastInsertRowid);
    const ipSale=await api('/pharmacy/dispense',{patient_id:patient.id,admission_id:admission.id,items:[{medicine_id:med.id,batch_id:ipBatch,qty:10}],collect:false});
    check('80000 surgery consolidates hospital doctor and medicine components once',()=>assert.equal(ipSale.bill.total,80000));
    await api(`/ipd/ot/${ot.id}`,{status:'completed'},'PATCH');
    check('repeated OT completion never duplicates charges',()=>assert.equal(db.prepare('SELECT total FROM bills WHERE id=?').get(ipSale.bill.id).total,80000));
    await api('/payments',{bill_id:ipSale.bill.id,amount:80000,mode:'bank_transfer',reference:'UPGRADE-IP-80000'});
    const surgeonLedger=await api(`/visiting-doctors/${surgeon.id}/ledger`),anaesthesiaLedger=await api(`/visiting-doctors/${anaesthetist.id}/ledger`);
    check('80000 surgery assigns only separate 30000 and 10000 clinical fees',()=>{assert.equal(surgeonLedger.earned,30000);assert.equal(anaesthesiaLedger.earned,10000);assert.equal(surgeonLedger.lines.length,1);assert.equal(anaesthesiaLedger.lines.length,1);assert.equal(surgeonLedger.lines[0].ip_no,admission.ip_no);});
    await api('/reports/export/pharmacy_patient_register',{format:'csv',query:{preset:'custom',from:day,to:day,patient:patient.uhid}});
    check('pharmacy report exports are audited',()=>assert.ok(db.prepare("SELECT id FROM audit_log WHERE action='report.export' AND entity_id='pharmacy_patient_register'").get()));
    const labService=db.prepare("SELECT id FROM services WHERE category='lab' AND active=1 LIMIT 1").get();
    const parameter=await api('/lab/params',{service_id:labService.id,name:'Upgrade validated parameter',unit:'g/dL',method:'Validated method',interpretation:'Validated interpretation',ref_low:12,ref_high:16,crit_low:5,crit_high:30,reference_rules:[{sex:'Female',pregnant:true,min_age:18,max_age:50,low:10,high:14,label:'Pregnancy'}]});
    await api(`/lab/params/${parameter.id}`,{ref_high:17},'PATCH');
    await assertRejected('invalid general range rejected',`/lab/params/${parameter.id}`,{ref_low:20},'PATCH');
    await assertRejected('invalid age rule rejected',`/lab/params/${parameter.id}`,{reference_rules:[{min_age:50,max_age:18,low:10,high:14}]},'PATCH');
    await login('lab');await assertRejected('lab technician cannot edit incharge templates',`/lab/params/${parameter.id}`,{method:'Unauthorised'},'PATCH',403);await login('admin');
    const staff=db.prepare("SELECT id FROM users WHERE role='doctor' AND active=1 LIMIT 1").get();
    const visit=await api('/encounters',{patient_id:patient.id,doctor_id:staff.id,kind:'EMG'});
    const orders=await api('/orders',{encounter_id:visit.encounter.id,items:[{service_id:labService.id}]});const orderId=orders.orders[0].id;
    await api(`/lab/orders/${orderId}/collect`,{});
    const order=await api(`/lab/orders/${orderId}`);check('lab entry uses matched pregnancy range',()=>{const param=order.params.find(p=>p.id===parameter.id);assert.equal(param.ref_low,10);assert.equal(param.ref_high,14);});
    const reported=await api(`/lab/orders/${orderId}/results`,{results:[{param_id:parameter.id,value:'15',ref_range:'Incorrect override'}]});
    check('validated range flags high without guessing critical',()=>{assert.equal(reported.results[0].flag,'high');assert.ok(reported.results[0].ref_range.includes('Pregnancy'));assert.equal(reported.results[0].method,'Validated method');});
    await api(`/lab/orders/${orderId}/verify`,{});await api(`/lab/params/${parameter.id}`,{method:'New method'},'PATCH');
    const report=await api(`/lab/report/${orderId}`);check('authorised report preserves method snapshot',()=>assert.equal(report.results[0].method,'Validated method'));
    await api(`/lab/params/${parameter.id}`,undefined,'DELETE');check('parameter archive preserves prior reports',()=>{assert.equal(db.prepare('SELECT active FROM lab_params WHERE id=?').get(parameter.id).active,0);assert.ok(db.prepare('SELECT id FROM lab_results WHERE param_id=?').get(parameter.id));});
    // An inpatient moved to credit at the collection desk used to change only the bill, so the ward card,
    // the IP census and the IP register (all reading admissions.financial_category) still said self-pay.
    const creditPatient=await api('/patients',{name:'Collection desk credit patient',gender:'Male',age_years:44});
    const creditBed=db.prepare("SELECT id FROM beds WHERE status='vacant' LIMIT 1").get();
    const creditAdmission=await api('/ipd/admissions',{patient_id:creditPatient.id,bed_id:creditBed.id,diagnosis:'Category sync regression'});
    const creditBill=await api('/bills',{patient_id:creditPatient.id,bill_type:'IP',encounter_id:creditAdmission.encounter_id,items:[{description:'Ward charge',category:'other',qty:1,rate:500}]});
    const admissionCategory=()=>db.prepare('SELECT financial_category FROM admissions WHERE id=?').get(creditAdmission.id).financial_category;
    check('admission starts self-pay',()=>assert.equal(admissionCategory(),'self'));
    await api(`/bills/${creditBill.id}/settle`,{request_key:`credit-sync-${creditBill.id}-regression`,category:'credit',lines:[{mode:'cash',amount:500}]});
    check('collection desk credit reaches the admission',()=>assert.equal(admissionCategory(),'credit'));
    check('bill and admission agree after the change',()=>assert.equal(db.prepare('SELECT payer_type FROM bills WHERE id=?').get(creditBill.id).payer_type,'credit'));
    const ctx=await api(`/patients/${creditPatient.id}/billing-context?encounter_id=${creditAdmission.encounter_id}`,undefined,'GET');
    check('billing context no longer contradicts the bill',()=>assert.equal(ctx.payer_type,'credit'));
    // A payer admission is the insurance desk's to move: a payment window must not silently unlink it.
    const payerBed=db.prepare("SELECT id FROM beds WHERE status='vacant' LIMIT 1").get();
    const payerPatient=await api('/patients',{name:'Payer admission guard patient',gender:'Female',age_years:51});
    const payerAdmission=await api('/ipd/admissions',{patient_id:payerPatient.id,bed_id:payerBed.id,diagnosis:'Payer guard regression'});
    db.prepare("UPDATE admissions SET financial_category='corporate' WHERE id=?").run(payerAdmission.id);
    const payerBill=await api('/bills',{patient_id:payerPatient.id,bill_type:'IP',encounter_id:payerAdmission.encounter_id,items:[{description:'Ward charge',category:'other',qty:1,rate:400}]});
    await assertRejected('payer charge cannot be collected as patient cash',`/bills/${payerBill.id}/settle`,{request_key:`payer-guard-${payerBill.id}-regression`,category:'credit',lines:[{mode:'cash',amount:400}]});
    check('payer admission is not unlinked by a payment window',()=>assert.equal(db.prepare('SELECT financial_category FROM admissions WHERE id=?').get(payerAdmission.id).financial_category,'corporate'));
    // An inpatient admitted self-pay who later brings a scheme card: the conversion must carry the
    // admission, the patient and every running bill together, and open the case for approval.
    const schemePayer=db.prepare("SELECT id,name FROM payers WHERE payer_type='aarogyasri' AND active=1 LIMIT 1").get()
      ||{id:Number(db.prepare("INSERT INTO payers(code,name,payer_type,active) VALUES('ARGREG','Aarogyasri regression','aarogyasri',1)").run().lastInsertRowid),name:'Aarogyasri regression'};
    const schemeBed=db.prepare("SELECT id FROM beds WHERE status='vacant' LIMIT 1").get();
    const schemePatient=await api('/patients',{name:'Mid-stay scheme patient',gender:'Male',age_years:60});
    const schemeAdmission=await api('/ipd/admissions',{patient_id:schemePatient.id,bed_id:schemeBed.id,diagnosis:'Scheme conversion regression'});
    const schemeBill=await api('/bills',{patient_id:schemePatient.id,bill_type:'IP',encounter_id:schemeAdmission.encounter_id,items:[{description:'Ward charge',category:'other',qty:1,rate:900}]});
    await api(`/ipd/admissions/${schemeAdmission.id}/payer`,{financial_category:'aarogyasri',payer_id:schemePayer.id,policy_no:'ARG-REG-001',reason:'Patient produced scheme card after admission'},'PATCH');
    check('mid-stay scheme conversion moves the admission',()=>assert.equal(db.prepare('SELECT financial_category FROM admissions WHERE id=?').get(schemeAdmission.id).financial_category,'aarogyasri'));
    check('mid-stay scheme conversion moves the running bill',()=>assert.equal(db.prepare('SELECT payer_type FROM bills WHERE id=?').get(schemeBill.id).payer_type,'aarogyasri'));
    check('mid-stay scheme conversion opens a payer case',()=>assert.ok(db.prepare("SELECT id FROM insurance_claims WHERE admission_id=? AND payer_type='aarogyasri'").get(schemeAdmission.id)));
    const schemeCtx=await api(`/patients/${schemePatient.id}/billing-context?encounter_id=${schemeAdmission.encounter_id}`,undefined,'GET');
    check('scheme conversion shows on the billing context',()=>assert.equal(schemeCtx.payer_type,'aarogyasri'));
    // Downloads outside the report centre used to leave no trace of who took patient or money data off
    // the system. Both shared download helpers now post here, so every export screen is covered at once.
    const exportsBefore=db.prepare("SELECT count(*) n FROM audit_log WHERE action='data.export'").get().n;
    await api('/audit/export',{filename:'bills-2026-10-12.csv',rows:42,format:'csv'});
    const exported=db.prepare("SELECT user_id,entity,detail FROM audit_log WHERE action='data.export' ORDER BY id DESC LIMIT 1").get();
    check('an export leaves an audit entry',()=>assert.equal(db.prepare("SELECT count(*) n FROM audit_log WHERE action='data.export'").get().n,exportsBefore+1));
    check('the export entry records who, what and how many',()=>{const d=JSON.parse(exported.detail);assert.equal(d.filename,'bills-2026-10-12.csv');assert.equal(d.rows,42);assert.equal(d.format,'csv');assert.ok(exported.user_id);});
    // Work sent outside. A tie-up lab still bills here; a scan the hospital has no machine for is paid
    // by the patient at the outside centre, so it must raise no charge at all.
    const tieUp=await api('/diagnostic-providers',{name:'Thyrocare (tie-up)',kind:'lab',billing:'hospital'});
    const scanCentre=await api('/diagnostic-providers',{name:'City MRI centre',kind:'imaging',billing:'outside'});
    await assertRejected('provider billing cannot be rewritten later',`/diagnostic-providers/${tieUp.id}`,{billing:'outside'},'PATCH');
    const outsidePatient=await api('/patients',{name:'Outside diagnostics patient',gender:'Male',age_years:38});
    const outsideVisit=(await api('/encounters',{patient_id:outsidePatient.id,doctor_id:staff.id,kind:'OP'})).encounter;
    const outLabService=db.prepare("SELECT id,price FROM services WHERE category='lab' AND price>0 LIMIT 1").get();
    const imgService=db.prepare("SELECT id,price FROM services WHERE category='imaging' AND price>0 LIMIT 1").get();
    db.prepare('UPDATE services SET provider_id=? WHERE id=?').run(scanCentre.id,imgService.id);
    const sentOut=await api('/orders',{encounter_id:outsideVisit.id,items:[{service_id:outLabService.id,provider_id:tieUp.id},{service_id:imgService.id}]});
    const outOrders=db.prepare("SELECT o.id,o.category,o.status,o.billed,o.provider_id FROM orders o WHERE o.encounter_id=? ORDER BY o.id").all(outsideVisit.id);
    const labOrder=outOrders.find(o=>o.category==='lab'),imgOrder=outOrders.find(o=>o.category==='imaging');
    check('a tie-up lab test is still billed by the hospital',()=>{assert.equal(labOrder.billed,1);assert.equal(labOrder.provider_id,tieUp.id);});
    check('a scan paid outside raises no charge',()=>{assert.ok(!imgOrder.billed);assert.equal(db.prepare('SELECT count(*) n FROM bill_items WHERE order_id=?').get(imgOrder.id).n,0);});
    check('a scan paid outside is never held for payment',()=>assert.equal(imgOrder.status,'ordered'));
    check('the outside scan carries its centre for the doctor',()=>assert.equal(imgOrder.provider_id,scanCentre.id));
    // A CT cine loop is a video, not a still. It streams to disk rather than going through the base64
    // route, so the server never holds the clip in memory.
    const inHouseImg=db.prepare("SELECT id FROM services WHERE category='imaging' AND provider_id IS NULL AND id<>? LIMIT 1").get(imgService.id);
    const ctOrder=(await api(`/orders`,{encounter_id:outsideVisit.id,items:[{service_id:inHouseImg.id}],bill:false})).orders[0];
    const clip=Buffer.alloc(2*1024*1024,7);
    const streamed=await stream(`/attachments/order/${ctOrder.id}/stream`,clip,{'X-File-Name':'ct-cine-loop.mp4','X-File-Type':'video/mp4'});
    const streamedList=await streamed.json();
    check('a CT video streams onto the order',()=>{assert.equal(streamed.status,200);assert.ok(streamedList.some(f=>f.file_name==='ct-cine-loop.mp4'&&f.size===clip.length));});
    check('the stored video is on disk at its full size',()=>{const row=db.prepare("SELECT path,size FROM attachments WHERE entity='order' AND entity_id=? AND mime='video/mp4'").get(ctOrder.id);assert.equal(row.size,clip.length);assert.equal(fs.statSync(path.join(dataDir,'uploads',row.path)).size,clip.length);});
    check('no half-written part file is left behind',()=>{const row=db.prepare("SELECT path FROM attachments WHERE entity='order' AND entity_id=? AND mime='video/mp4'").get(ctOrder.id);assert.ok(!fs.existsSync(path.join(dataDir,'uploads',row.path)+'.part'));});
    const badType=await stream(`/attachments/order/${ctOrder.id}/stream`,Buffer.alloc(16),{'X-File-Name':'notes.exe','X-File-Type':'application/x-msdownload'});
    check('an unsupported streamed type is refused',()=>assert.equal(badType.status,400));
    // Outside work has no results to type: the report that comes back is attached, then published. An
    // order published with nothing attached would read as done while holding no report at all.
    await assertRejected('an outside order will not publish with nothing attached',`/diagnostics/orders/${imgOrder.id}/outside-report`,{},'POST',409);
    await api(`/attachments/order/${imgOrder.id}`,{files:[{name:'mri-brain.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4 outside MRI report').toString('base64')}],note:'Report from City MRI centre'});
    const published=await api(`/diagnostics/orders/${imgOrder.id}/outside-report`,{reference:'MRI-2026-55'});
    check('an outside report publishes to the doctor',()=>assert.equal(published.status,'verified'));
    check('publishing an outside report is audited with its centre',()=>{const d=JSON.parse(db.prepare("SELECT detail FROM audit_log WHERE action='diagnostic.outside.publish' ORDER BY id DESC LIMIT 1").get().detail);assert.equal(d.provider,'City MRI centre');assert.equal(d.files,1);assert.equal(d.reference,'MRI-2026-55');});
    await assertRejected('an outside report is not published twice',`/diagnostics/orders/${imgOrder.id}/outside-report`,{},'POST',409);
    await assertRejected('an in-house order cannot use the outside route',`/diagnostics/orders/${ctOrder.id}/outside-report`,{},'POST',409);
    check('upgrade does not introduce referral payments',()=>assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%referral%payout%'").get().n,0));
    check('all accounting stays balanced',()=>assert.ok(Math.abs(db.prepare('SELECT round(sum(debit-credit),2) delta FROM journal_lines').get().delta)<0.005));
    check('foreign keys intact after upgrade workflows',()=>assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0));
  } finally { db.close(); }
}
