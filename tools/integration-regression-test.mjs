import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tempRoot, 'surelyhms-test-'));
const port = process.env.HMS_TEST_PORT || '4396';
let server, token, output = '', checks = 0;
const failures = [];
const check = (label, fn) => { checks++; try { fn(); } catch (e) { failures.push(`${label}: ${e.message}`); } };
try {
  const fixture = spawnSync(process.execPath, ['tools/fixtures/hospital.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', SURELY_DATA: dataDir }, windowsHide: true, encoding: 'utf8' });
  assert.equal(fixture.status, 0, fixture.stderr);
  server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, SURELY_DATA: dataDir, PORT: port }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => { output += d; });
  server.stderr.on('data', d => { output += d; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Test server startup timeout: ' + output)), 30000);
    server.stdout.on('data', () => { if (output.includes('sign in')) { clearTimeout(timer); resolve(); } });
    server.on('exit', code => { clearTimeout(timer); reject(Error('Test server exited: ' + code)); });
  });
  async function request(p, body, method = body === undefined ? 'GET' : 'POST') {
    const r = await fetch(`http://127.0.0.1:${port}/api${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session': token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  }
  async function api(...args) { const r = await request(...args); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
  async function login(username) { token = (await api('/auth/login', { username, password: 'surely' })).token; }
  await login('admin'); const admin = token;
  const p = await api('/patients', { name: 'Regression patient A', gender: 'Female', age_years: 40 });
  const other = await api('/patients', { name: 'Regression patient B', gender: 'Male', age_years: 35 });
  const bed = (await api('/ipd/beds')).beds.find(b => b.status === 'vacant');
  const a = await api('/ipd/admissions', { patient_id: p.id, bed_id: bed.id, diagnosis: 'PRIVATE-DIAGNOSIS' });
  await api('/ipd/nursing/notes', { admission_id: a.id, body: 'PRIVATE-NURSING-NOTE' });
  await api('/ipd/nursing/mar', { admission_id: a.id, drug: 'PRIVATE-MEDICATION', dose: 'test', due_at: '2026-10-05 10:00:00' });
  await api(`/ipd/admissions/${a.id}`, { status: 'clinically_cleared', discharge_summary: 'PRIVATE-SUMMARY' }, 'PATCH');
  for (const role of ['reception', 'nurse', 'doctor']) {
    await login(role);
    const d = await api(`/ipd/admissions/${a.id}`);
    if (role === 'reception') {
      check('reception detail redacted', () => assert.ok(!JSON.stringify(d).includes('PRIVATE-')));
      check('reception financial view retained', () => assert.ok(d.bills.length && d.ip_no && 'balance' in d));
      for (const url of ['/ipd/admissions', '/ipd/beds', '/ipd/discharge/board', `/patients/${p.id}/timeline`]) {
        const result = await api(url);
        check('reception redacted ' + url, () => assert.ok(!JSON.stringify(result).includes('PRIVATE-')));
      }
      const summary = await request(`/ipd/admissions/${a.id}/summary`);
      check('reception summary forbidden', () => assert.equal(summary.status, 403));
      const mutation = await api(`/ipd/admissions/${a.id}`, {}, 'PATCH');
      check('reception mutation response redacted', () => assert.ok(!JSON.stringify(mutation).includes('PRIVATE-')));
    } else {
      check(role + ' clinical records retained', () => assert.ok(d.notes.some(n => n.body === 'PRIVATE-NURSING-NOTE') && d.mar.some(m => m.drug === 'PRIVATE-MEDICATION') && d.diagnosis === 'PRIVATE-DIAGNOSIS'));
      await api(`/ipd/admissions/${a.id}/summary`);
    }
  }
  token = admin;
  const er = await api('/ipd/emergency', { complaint: 'Synthetic identity merge test', triage: '3' });
  const cs = await api('/counselling', { patient_id: er.patient_id, encounter_id: er.encounter_id, topic: 'high_risk', consent: 'refused' });
  await api(`/counselling/${cs.id}/summary`, { summary: { explained: 'Counselling content preserved across merge' } }, 'PATCH');
  const before = await api(`/counselling/${cs.id}`);
  // Related billing/stock history must follow the same identity, too. Only this disposable fixture is written.
  const fixtureDb = new DatabaseSync(path.join(dataDir, 'surelyhms.db'));
  try {
    const packageId = fixtureDb.prepare("INSERT INTO packages(code,name,price) VALUES('REG-MERGE','Synthetic merge package',0)").run().lastInsertRowid;
    fixtureDb.prepare("INSERT INTO procedure_consumptions(consumption_no,patient_id,encounter_id,location,source_type) VALUES('REG-MERGE',?,?,'ER','emergency')").run(er.patient_id, er.encounter_id);
    fixtureDb.prepare("INSERT INTO package_assignments(assignment_no,package_id,patient_id,encounter_id,price) VALUES('REG-MERGE',?,?,?,0)").run(packageId, er.patient_id, er.encounter_id);
  } finally { fixtureDb.close(); }
  await api(`/ipd/emergency/${er.id}/link-patient`, { patient_id: p.id });
  const after = await api(`/counselling/${cs.id}`);
  check('merge counselling owner', () => assert.equal(after.patient_id, p.id));
  check('merge preserves session and summary', () => { assert.equal(after.id, before.id); assert.equal(after.summary_json, before.summary_json); assert.equal(after.encounter_id, er.encounter_id); });
  const timeline = await api(`/patients/${p.id}/timeline`);
  check('merge timeline visibility', () => assert.ok(timeline.counselling.some(c => c.id === cs.id)));
  const mergedDb = new DatabaseSync(path.join(dataDir, 'surelyhms.db'), { readOnly: true });
  try {
    for (const table of ['procedure_consumptions', 'package_assignments']) check('merge ' + table, () => assert.equal(mergedDb.prepare(`SELECT patient_id FROM ${table} WHERE ${table === 'package_assignments' ? 'assignment_no' : 'consumption_no'}='REG-MERGE'`).get().patient_id, p.id));
  } finally { mergedDb.close(); }
  const payload = { patient_id: p.id, topic: 'diagnosis', consent: 'refused' };
  const invalid = [
    { patient_id: other.id, encounter_id: a.encounter_id },
    { patient_id: other.id, admission_id: a.id },
    { encounter_id: er.encounter_id, admission_id: a.id },
    { encounter_id: 99999999 }, { admission_id: 99999999 },
    { encounter_id: 'bad' }, { admission_id: -1 }, { encounter_id: 1.5 }, { admission_id: 0 },
    { encounter_id: true }, { admission_id: [a.id] }
  ];
  const countBefore = (await api('/counselling')).length;
  for (const values of invalid) {
    const r = await request('/counselling', { ...payload, ...values });
    check('reject invalid counselling ' + JSON.stringify(values), () => assert.equal(r.status, 400));
  }
  const countAfter = (await api('/counselling')).length;
  check('invalid requests insert nothing', () => assert.equal(countAfter, countBefore));
  const stale = await request('/counselling', { ...payload, patient_id: er.patient_id });
  check('merged patient cannot receive new counselling', () => assert.equal(stale.status, 409));
  for (const values of [{}, { encounter_id: a.encounter_id }, { admission_id: a.id }, { admission_id: a.id, encounter_id: a.encounter_id }, { admission_id: '', encounter_id: null }]) {
    const r = await api('/counselling', { ...payload, ...values });
    check('valid counselling references', () => { assert.equal(r.patient_id, p.id); if (values.admission_id) assert.equal(r.encounter_id, a.encounter_id); });
  }
  await api(`/ipd/admissions/${a.id}/discharge`, { force: true, reason: 'Synthetic regression test' });
  await login('reception');
  const past = await api('/ipd/discharges');
  check('discharged list redacted', () => assert.ok(!JSON.stringify(past).includes('PRIVATE-')));
  assert.equal(failures.length, 0, failures.join('\n'));
  await login('admin');await api('/admin/users',{username:'allocation-insurance',name:'Allocation insurance',role:'insurance',password:'surely'});
  for(const category of ['insurance','aarogyasri','corporate','trust']){
    await login('admin');
    const patient=await api('/patients',{name:'Allocation '+category,gender:'Male',age_years:40,payer_type:category});
    const claim=await api('/insurance/claims',{patient_id:patient.id,tpa:'Regression '+category,payer_type:category});
    const receptionBill=await api('/bills',{patient_id:patient.id,bill_type:'OP',items:[{description:'Bed allocation example',category:'procedure',qty:1,rate:5000}]});
    const pharmacyBill=await api('/bills',{patient_id:patient.id,bill_type:'PHARM',items:[{description:'IV cannula',category:'pharmacy',qty:1,rate:300}]});
    const fixtureDb=new DatabaseSync(path.join(dataDir,'surelyhms.db'));
    fixtureDb.prepare("UPDATE bills SET claim_id=?,payer_type=?,claim_status='preauth_pending' WHERE id IN (?,?)").run(claim.id,category,receptionBill.id,pharmacyBill.id);fixtureDb.close();
    await login('allocation-insurance');
    const lines=await api(`/insurance/claims/${claim.id}/lines`);
    const allocations=lines.map(l=>({item_id:l.id,patient_amount:l.amount===5000?1500:300}));
    await api(`/insurance/claims/${claim.id}/exclusions`,{allocations,reason:'Approved coverage / sponsorship decision'},'PUT');

    const invalid=await request(`/insurance/claims/${claim.id}/exclusions`,{allocations:[{item_id:lines[0].id,patient_amount:999999}],reason:'Invalid'},'PUT');check(category+' rejects over-allocation',()=>assert.equal(invalid.status,400));
    await api(`/insurance/claims/${claim.id}`,{status:'preauth_approved',approved:3500},'PATCH');
    let summary=await api(`/insurance/claims/${claim.id}/collection-summary`);
    check(category+' patient allocation',()=>assert.equal(summary.patient_due,1800));
    check(category+' payer allocation',()=>assert.equal(summary.payer_outstanding,3500));
    const fake=await request(`/insurance/claims/${claim.id}`,{status:'settled'},'PATCH');check(category+' prevents manual clearance',()=>assert.equal(fake.status,409));
    await login('reception');
    const override=await request(`/bills/${receptionBill.id}/settle`,{category:'self',request_key:'blocked-payer-override-'+category,lines:[{mode:'cash',amount:1500}]});check(category+' counter cannot override payer',()=>assert.equal(override.status,403));
    const blocked=await request('/payments',{bill_id:pharmacyBill.id,amount:300,mode:'cash'});check(category+' desk separation',()=>assert.equal(blocked.status,403));
    await api('/payments',{bill_id:receptionBill.id,amount:1500,mode:'cash'});
    await login('pharmacy');await api('/payments',{bill_id:pharmacyBill.id,amount:300,mode:'cash'});
    await login('allocation-insurance');summary=await api(`/insurance/claims/${claim.id}/collection-summary`);
    check(category+' patient cleared independently',()=>assert.equal(summary.patient_due,0));
    const listedCase=(await api('/insurance/claims')).rows.find(c=>c.id===claim.id);
    check(category+' worklist distinguishes patient from payer due',()=>{assert.equal(listedCase.patient_due,0);assert.equal(listedCase.payer_outstanding,summary.payer_outstanding);});
    const receivables=await api(`/accounts/receivables?claim_id=${claim.id}&status=all`);
    const settlement=receivables.rows.find(s=>s.open>0);
    await api(`/accounts/receivables/${settlement.id}/receive`,{amount:1000,mode:'bank_transfer',reference:'PART-'+category});
    summary=await api(`/insurance/claims/${claim.id}/collection-summary`);check(category+' partial payer remains pending',()=>assert.equal(summary.payer_outstanding,2500));
    await api(`/accounts/receivables/${settlement.id}/receive`,{amount:0,disallowed:500,disallowance_action:'transfer_to_patient',notes:'Additional documented rejection',mode:'bank_transfer'});
    summary=await api(`/insurance/claims/${claim.id}/collection-summary`);check(category+' rejection returns to patient',()=>assert.equal(summary.patient_due,500));
    await login('reception');await api('/payments',{bill_id:receptionBill.id,amount:500,mode:'cash'});await login('allocation-insurance');
    await api(`/accounts/receivables/${settlement.id}/receive`,{amount:2000,mode:'bank_transfer',reference:'FINAL-'+category});
    summary=await api(`/insurance/claims/${claim.id}/collection-summary`);
    check(category+' automatically settles case',()=>assert.equal(summary.claim.status,'settled'));
    check(category+' automatically settles both bills',()=>assert.ok(summary.bills.every(b=>b.financial_status==='fully_settled')));
  }
  await login('admin');
  {
  const rackPatient=await api('/patients',{name:'Emergency rack regression',gender:'Male',age_years:30});
  const fixtureDb=new DatabaseSync(path.join(dataDir,'surelyhms.db'));
  try {
  const rackDoctor=fixtureDb.prepare("SELECT id FROM users WHERE role='doctor' LIMIT 1").get().id;
  const rackVisit=await api('/encounters',{patient_id:rackPatient.id,doctor_id:rackDoctor,kind:'EMG'});
  const medicine=fixtureDb.prepare("SELECT id FROM medicines LIMIT 1").get().id;
  const addBatch=fixtureDb.prepare('INSERT INTO medicine_batches(medicine_id,batch_no,expiry,mrp,purchase_rate,qty,location) VALUES(?,?,?,?,?,?,?)');
  const batchA=Number(addBatch.run(medicine,'RACK-A','2028-06-30',10,4,3,'ER').lastInsertRowid);
  const batchB=Number(addBatch.run(medicine,'RACK-B','2028-12-31',10,4,2,'ER').lastInsertRowid);
  const batchC=Number(addBatch.run(medicine,'REPLACE-C','2029-06-30',10,4,10,'OP').lastInsertRowid);
  const visitId=rackVisit.encounter?.id||rackVisit.id;
  await login('nurse');
  const wr=await api('/pharmacy/ward-replacements',{encounter_id:visitId,location:'ER',lines:[{batch_id:batchA,qty:2},{batch_id:batchB,qty:1}]});
  check('rack usage preserves both original batches',()=>assert.equal(wr.usage.length,2));
  check('rack usage does not create patient charge',()=>assert.equal(wr.supplies.length,0));
  check('rack A remaining one',()=>assert.equal(fixtureDb.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batchA).qty,1));
  check('rack B remaining one',()=>assert.equal(fixtureDb.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batchB).qty,1));
  const forbiddenSupply=await request(`/pharmacy/ward-replacements/${wr.id}/supply`,{items:[{medicine_id:medicine,qty:3}]});
  check('ward cannot supply pharmacy medicines',()=>assert.equal(forbiddenSupply.status,403));
  await login('pharmacy');
  const supplied=await api(`/pharmacy/ward-replacements/${wr.id}/supply`,{items:[{medicine_id:medicine,batch_id:batchC,qty:3}]});
  check('replacement has one pharmacy bill',()=>assert.equal(supplied.bill.bill_type,'PHARM'));
  check('replacement awaits physical ward receipt',()=>assert.equal(supplied.replacement.status,'pharmacy_supplied'));
  check('replacement stock not yet in ER',()=>assert.equal(fixtureDb.prepare("SELECT count(*) n FROM medicine_batches WHERE batch_no='REPLACE-C' AND location='ER'").get().n,0));
  check('replacement supplied batch differs from consumed',()=>assert.ok(supplied.replacement.supplies.every(s=>s.batch_no==='REPLACE-C')));
  const duplicateSupply=await request(`/pharmacy/ward-replacements/${wr.id}/supply`,{items:[{medicine_id:medicine,qty:3}]});
  check('cannot supply same usage twice',()=>assert.equal(duplicateSupply.status,400));
  await api('/payments',{bill_id:supplied.bill.id,amount:supplied.bill.total,mode:'cash'});
  await login('nurse');
  const partialReceipt=await api(`/pharmacy/ward-replacements/${wr.id}/receive`,{lines:[{id:supplied.replacement.supplies[0].id,qty:1}]});
  check('partial physical receipt stays pending',()=>assert.equal(partialReceipt.status,'partially_replaced'));
  check('partial receipt adds only checked quantity',()=>assert.equal(fixtureDb.prepare("SELECT qty FROM medicine_batches WHERE batch_no='REPLACE-C' AND location='ER'").get().qty,1));
  const received=await api(`/pharmacy/ward-replacements/${wr.id}/receive`,{lines:partialReceipt.supplies.filter(s=>s.qty>s.received_qty).map(s=>({id:s.id,qty:s.qty-s.received_qty}))});
  check('ward confirms completed replacement',()=>assert.equal(received.status,'replaced'));
  check('new batch appears with three in rack',()=>assert.equal(fixtureDb.prepare("SELECT qty FROM medicine_batches WHERE batch_no='REPLACE-C' AND location='ER'").get().qty,3));
  check('original usage batches remain immutable',()=>assert.deepEqual(received.usage.map(u=>u.batch_no).sort(),['RACK-A','RACK-B']));
  const duplicateReceive=await request(`/pharmacy/ward-replacements/${wr.id}/receive`,{lines:received.supplies.map(s=>({id:s.id,qty:s.qty}))});
  check('cannot confirm same replacement twice',()=>assert.equal(duplicateReceive.status,400));
  const ledger=await api('/pharmacy/ward-replacements/ledger?location=ER');
  check('ward ledger includes usage and receipt',()=>assert.ok(ledger.moves.some(m=>m.move_type==='ward_usage')&&ledger.moves.some(m=>m.move_type==='ward_replacement_received')));
  const patientTrace=await api(`/patients/${rackPatient.id}/timeline`);
  check('patient record shows original and replacement batch history',()=>assert.ok(JSON.stringify(patientTrace.ward_replacements).includes('RACK-A')&&JSON.stringify(patientTrace.ward_replacements).includes('REPLACE-C')));
  await login('admin');
  const consultationBill=fixtureDb.prepare("SELECT id,balance FROM bills WHERE encounter_id=? AND bill_type='OP'").get(visitId);
  if(consultationBill?.balance>0)await api('/payments',{bill_id:consultationBill.id,amount:consultationBill.balance,mode:'cash'});
  const context=await api(`/patients/${rackPatient.id}/billing-context`);
  check('shared summary has no patient due after payment',()=>assert.equal(context.patient_due,0));
  check('shared summary separates treatment and approval',()=>assert.ok(context.treatment_status&&context.approval_status));
  const recon=await api('/accounts/integration-reconciliation');
  check('integration reconciliation bill identities balance',()=>assert.equal(recon.mismatches.length,0));
  check('books remain balanced after physical replacement',()=>assert.equal(recon.integrity.ok,true));
  await login('nurse');
  const mistaken=await api('/pharmacy/ward-replacements',{encounter_id:visitId,location:'ER',lines:[{batch_id:batchA,qty:1}]});
  await api(`/pharmacy/ward-replacements/${mistaken.id}/reverse`,{reason:'Wrong patient selected; correction test'});
  check('mistaken usage reversal restores original batch',()=>assert.equal(fixtureDb.prepare('SELECT qty FROM medicine_batches WHERE id=?').get(batchA).qty,1));
  await login('pharmacy');
  const reversedSupply=await request(`/pharmacy/ward-replacements/${mistaken.id}/supply`,{items:[{medicine_id:medicine,qty:1}]});
  check('reversed replacement rejects supply',()=>assert.equal(reversedSupply.status,409));
  const cashBefore=await api('/desk/handover?desk=pharmacy');
  const target=cashBefore.receivers.find(u=>u.role==='admin');
  const handover=await api('/desk/handover',{desk:'pharmacy',handed_to:target.id,declared:cashBefore.expected.modes});
  const pending=await api('/desk/handover?desk=pharmacy');
  check('pending handover retains physical cash custody',()=>assert.equal(pending.cash_in_hand,cashBefore.cash_in_hand));
  await login('admin');const inbox=await api('/desk/handover?desk=reception');
  check('receiver inbox includes pharmacy handover',()=>assert.ok(inbox.handovers.some(h=>h.id===handover.id)));
  await api(`/desk/handover/${handover.id}/verify`,{status:'accepted'});
  await login('pharmacy');const afterAcceptance=await api('/desk/handover?desk=pharmacy');
  check('cash leaves desk only on acceptance',()=>assert.equal(afterAcceptance.cash_in_hand,cashBefore.cash_in_hand-cashBefore.expected.modes.cash));
  const changeBill=await api('/bills',{patient_id:rackPatient.id,bill_type:'PHARM',items:[{description:'Drawer retention test',category:'pharmacy',qty:1,rate:5000}]});
  const changeReceipt=await api('/payments',{bill_id:changeBill.id,amount:5000,mode:'cash'});
  const changePosition=await api('/desk/handover?desk=pharmacy');
  const partial=await api('/desk/handover',{desk:'pharmacy',handed_to:target.id,retained_cash:500,declared:{...changePosition.expected.modes,cash:4500}});
  check('retained change is not a shortage',()=>assert.equal(partial.variance,0));
  check('retained change persists on handover',()=>assert.equal(partial.retained_cash,500));
  const retainedPosition=await api('/desk/handover?desk=pharmacy');check('retained change stays available for later handover',()=>assert.equal(retainedPosition.expected.modes.cash,500));
  await login('admin');await api(`/desk/handover/${partial.id}/verify`,{status:'accepted'});
  const adminDrawer=(await api('/desk/handover?desk=pharmacy')).cash_in_hand;
  await login('pharmacy');const remainingDrawer=await api('/desk/handover?desk=pharmacy');check('4500 acceptance leaves 500 in drawer',()=>assert.equal(remainingDrawer.cash_in_hand,500));
  const shift=await api('/desk/shifts',{desk:'pharmacy',to_user:target.id,from_shift:'morning',to_shift:'evening',cash_count:500,notes:'Change float passed to incoming staff'});
  await login('admin');await api(`/desk/shifts/${shift.id}/accept`,{});
  const incomingDrawer=await api('/desk/handover?desk=pharmacy');check('incoming staff receives drawer custody',()=>assert.equal(incomingDrawer.cash_in_hand,adminDrawer+500));
  await login('pharmacy');const outgoingDrawer=await api('/desk/handover?desk=pharmacy');check('outgoing shift no longer holds change float',()=>assert.equal(outgoingDrawer.cash_in_hand,0));
  const day=await api('/desk/day?desk=pharmacy');check('handover does not add or remove collection revenue',()=>assert.ok(day.modes.cash>=5000));
  fixtureDb.prepare("UPDATE payments SET created_at='2030-10-05 08:00:00' WHERE bill_id=?").run(changeBill.id);
  const ranged=await api('/desk/range?desk=pharmacy&from=2030-10-05T08:00&to=2030-10-06T08:00');
  check('time-range includes start boundary',()=>assert.equal(ranged.net,5000));
  fixtureDb.prepare("UPDATE payments SET created_at='2030-10-06 08:00:00' WHERE bill_id=?").run(changeBill.id);
  const endRange=await api('/desk/range?desk=pharmacy&from=2030-10-05T08:00&to=2030-10-06T08:00');check('time-range excludes end boundary',()=>assert.equal(endRange.net,0));
  const invalidRange=await request('/desk/range?desk=pharmacy&from=bad&to=bad');check('invalid range rejected',()=>assert.equal(invalidRange.status,400));
  await login('nurse');
  const immediate=await api('/pharmacy/ward-replacements',{encounter_id:visitId,location:'ER',lines:[{batch_id:batchA,qty:1}]});
  const invalidRack=await request('/pharmacy/ward-replacements',{encounter_id:visitId,location:'Ward',lines:[{batch_id:batchB,qty:1}]});check('general ward emergency rack rejected',()=>assert.equal(invalidRack.status,400));
  await login('pharmacy');const completed=await api(`/pharmacy/ward-replacements/${immediate.id}/supply`,{receive_now:true,items:[{medicine_id:medicine,batch_id:batchC,qty:1}]});
  check('confirmed delivery completes rack replacement during billing',()=>assert.equal(completed.replacement.status,'replaced'));
  check('immediate receipt moves replacement batch into ER once',()=>assert.equal(fixtureDb.prepare("SELECT qty FROM medicine_batches WHERE batch_no='REPLACE-C' AND location='ER'").get().qty,4));
  await login('admin');
  await api('/bills',{patient_id:p.id,encounter_id:a.encounter_id,bill_type:'LAB',items:[{description:'Discharge lab test',category:'lab',qty:1,rate:100}]});
  await api('/bills',{patient_id:p.id,encounter_id:a.encounter_id,bill_type:'PHARM',items:[{description:'Discharge medicine',category:'pharmacy',qty:1,rate:50}]});
  const pack=await api(`/ipd/admissions/${a.id}/print-pack`);
  check('discharge print pack includes lab and pharmacy',()=>assert.ok(pack.bills.some(b=>b.bill_type==='LAB')&&pack.bills.some(b=>b.bill_type==='PHARM')));
  check('discharge print pack includes current diagnosis for clinical role',()=>assert.equal(pack.clinical.diagnosis,'PRIVATE-DIAGNOSIS'));
  await login('reception');const receptionPack=await api(`/ipd/admissions/${a.id}/print-pack`);check('discharge print pack hides clinical data from reception',()=>assert.equal(receptionPack.clinical,null));
  fixtureDb.prepare("UPDATE admissions SET summary_status='final',discharge_summary='Signed final summary' WHERE id=?").run(a.id);
  const releasedPack=await api(`/ipd/admissions/${a.id}/print-pack`);check('reception can print the released final discharge summary',()=>assert.equal(releasedPack.clinical.summary,'Signed final summary'));
  check('released packet does not expose draft consultation notes',()=>assert.deepEqual(releasedPack.clinical.consultations,[]));
  await login('doctor');const privateContext=await api(`/patients/${rackPatient.id}/billing-context`);
  check('clinical login does not receive financial totals',()=>assert.ok(!('patient_due' in privateContext)));
  await login('admin');
  const auditReport=await api('/reports/run/ward_replacement_audit?preset=year');
  check('replacement report links original and new batches',()=>assert.ok(JSON.stringify(auditReport).includes('REPLACE-C')&&JSON.stringify(auditReport).includes('RACK-A')));
  const doctorReport=await api('/reports/run/doctor_collection_reconciliation?preset=year');
  check('doctor reconciliation report runs',()=>assert.ok(doctorReport.rows));
  }finally{fixtureDb.close();}
  }

  await login('admin');
  const cancelPatient=await api('/patients',{name:'Cancellation financial review regression',gender:'Male',age_years:30});
  const cancelDoctor=(await api('/meta')).doctors.find(d=>d.role==='doctor');
  const cancelVisit=await api('/encounters',{patient_id:cancelPatient.id,doctor_id:cancelDoctor.id});
  const cancelService=(await api('/services')).find(s=>s.category==='lab'&&s.active);
  const cancelOrders=await api('/orders',{encounter_id:cancelVisit.encounter.id,items:[{service_id:cancelService.id}]});
  const cancelId=cancelOrders.orders[0].id;
  const withoutReason=await request('/orders/'+cancelId+'/cancel',{});
  check('empty cancellation reason rejected',()=>assert.equal(withoutReason.status,400));
  const cancelledOrder=await api('/orders/'+cancelId+'/cancel',{reason:'No longer clinically required'});
  check('cancelled order identifies its active bill for financial review',()=>assert.ok(cancelledOrder.billing_review.some(b=>b.id===cancelOrders.bill.id)));
  check('clinical cancellation does not erase financial charge',()=>assert.ok((cancelledOrder.billing_review||[]).length));
  const closedRows=(await api('/accounts/receivables?status=all')).rows;
  check('cancelled payer allocations have zero payable outstanding',()=>assert.ok(closedRows.filter(r=>r.status==='cancelled').every(r=>r.open===0)));
  const erPaymentVisit=await api('/encounters',{patient_id:cancelPatient.id,doctor_id:cancelDoctor.id,kind:'EMG'});
  const erPaymentBill=await api('/bills',{patient_id:cancelPatient.id,encounter_id:erPaymentVisit.encounter.id,bill_type:'ER',items:[{description:'ER payment status regression',category:'emergency',qty:1,rate:100}]});
  await api('/payments',{bill_id:erPaymentBill.id,amount:100,mode:'cash'});
  const erPaymentState=await api('/encounters/'+erPaymentVisit.encounter.id);
  check('ER receipt updates encounter payment status',()=>assert.equal(erPaymentState.payment_status,'paid'));
  await login('reception');
  const automaticForm=await api(`/ipd/admissions/${a.id}/form-defaults`);
  check('reception form uses admission diagnosis without exposing clinical notes',()=>{assert.equal(automaticForm.diagnosis,'PRIVATE-DIAGNOSIS');assert.ok(!('notes' in automaticForm));});
  const formBefore=await api(`/ipd/admissions/${a.id}/forms`);
  const savedEstimate=await api(`/ipd/admissions/${a.id}/forms`,{form_type:'estimate',details:{advance:500,lines:[{description:'Ward estimate',days:3,rate:1000}],attendant:'Test attendant'}});
  const formAfter=await api(`/ipd/admissions/${a.id}/forms`);
  check('reception estimate saved for admission',()=>assert.equal(formAfter.length,formBefore.length+1));
  check('estimate snapshot reprints exact rates',()=>assert.equal(formAfter.find(f=>f.id===savedEstimate.id).details.lines[0].rate,1000));
  const invalidEstimate=await request(`/ipd/admissions/${a.id}/forms`,{form_type:'estimate',details:{advance:0,lines:[{description:'Invalid',days:-1,rate:100}]}});
  check('invalid estimate quantities rejected',()=>assert.equal(invalidEstimate.status,400));
  const consent=await api(`/ipd/admissions/${a.id}/forms`,{form_type:'consent',details:{attendant:'Test',relation:'Parent',procedures:'Specified procedure',language:'Telugu / English'}});
  check('reception consent snapshot saved without signed status',()=>assert.ok(consent.id));
  const formDb=new DatabaseSync(path.join(dataDir,'surelyhms.db'));
  const originalStatus=formDb.prepare('SELECT status FROM admissions WHERE id=?').get(a.id).status;
  formDb.prepare("UPDATE admissions SET status='admitted' WHERE id=?").run(a.id);
  const earlyFeedback=await request(`/ipd/admissions/${a.id}/forms`,{form_type:'feedback',details:{rating:5}});
  check('feedback blocked before discharge',()=>assert.equal(earlyFeedback.status,400));
  formDb.prepare("UPDATE admissions SET status='discharged' WHERE id=?").run(a.id);
  const badRating=await request(`/ipd/admissions/${a.id}/forms`,{form_type:'feedback',details:{rating:6}});
  check('feedback requires one to five rating',()=>assert.equal(badRating.status,400));
  const feedback=await api(`/ipd/admissions/${a.id}/forms`,{form_type:'feedback',details:{rating:4,remarks:'Good'}});
  check('discharged patient feedback saved',()=>assert.ok(feedback.id));
  formDb.prepare('UPDATE admissions SET status=? WHERE id=?').run(originalStatus,a.id); formDb.close();
  await login('lab');const forbiddenForms=await request(`/ipd/admissions/${a.id}/forms`);
  check('reception form data restricted by role',()=>assert.equal(forbiddenForms.status,403));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(JSON.stringify({ passed: true, checks, workflows: ['admission clinical privacy', 'emergency counselling merge', 'counselling identity validation','four payer line allocations, desk collection, partial payment, rejection and automatic settlement','mixed-batch emergency rack usage, pharmacy replacement billing, partial physical receipt and reversal','shared billing summary, reconciliation, handover inbox and patient batch history'] }, null, 2));
} finally {
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
  const actual = fs.realpathSync(dataDir);
  if (path.dirname(actual) === tempRoot && path.basename(actual).startsWith('surelyhms-test-')) fs.rmSync(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
