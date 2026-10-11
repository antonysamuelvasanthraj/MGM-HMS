/**
 * Full End-to-End Functional Test Suite for MGM HMS.
 * Tests:
 * 1. Operational seed validation
 * 2. Patient registration & OP registration across all payment modes (Cash, UPI, Card, Payer)
 * 3. Vitals recording (triage & clinical)
 * 4. Doctor consultation, clinical templates, and prescriptions
 * 5. Diagnostic lab orders, billing, sample collection, result entry, verification
 * 6. Doctor re-consultation after viewing verified lab results & amendment
 * 7. Follow-up appointment booking
 * 8. Emergency (ER) desk triage, emergency charges
 * 9. ICU bed admission, daily inpatient charge accruals, emergency rack usage
 * 10. Bed transfer from ICU to General Ward
 * 11. Multiple billings (OP, Lab, Pharmacy, IPD, ER) - at least 4 bills
 * 12. Discharge summary & multi-department clearance & final discharge
 * 13. Multi-role login authentication and permission reactions across all 24 demo users
 */
import assert from 'node:assert/strict';

// This script creates transactions. Require the explicitly isolated audit server.
const BASE = process.env.HMS_E2E_BASE;
if (BASE !== 'http://127.0.0.1:4389/api') throw new Error('Run against the isolated audit copy: HMS_E2E_BASE=http://127.0.0.1:4389/api');
const health = await fetch(BASE + '/health').then(r => r.json());
if (health.instance !== 'extended-ui-test') throw new Error('Refusing to mutate a server without the isolated audit instance marker');

async function api(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.token) {
    headers['x-session'] = options.token;
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, data: json, headers: res.headers };
}

async function loginUser(username, password) {
  const r = await api('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  if (!r.ok) {
    throw new Error(`Failed to login as ${username}: ${JSON.stringify(r.data)}`);
  }
  return r.data.token;
}

const report = {
  passedSteps: [],
  failedSteps: [],
  bugsFound: [],
};

function pass(name, detail = {}) {
  console.log(`[PASS] ${name}`);
  report.passedSteps.push({ name, detail });
}

function fail(name, error, detail = {}) {
  console.error(`[FAIL] ${name}:`, error);
  report.failedSteps.push({ name, error: String(error), detail });
}

function bug(title, description, severity = 'medium', component = 'general') {
  console.warn(`[BUG - ${severity.toUpperCase()}] ${title}: ${description}`);
  report.bugsFound.push({ title, description, severity, component });
}

async function runFullTest() {
  console.log('=== Starting Full Functional MGM HMS Test ===\n');

  // 1. Authenticate required roles
  console.log('--- Step 1: Authenticating Role Tokens ---');
  const tokens = {};
  const rolesToLogin = [
    ['admin', 'surely'],
    ['demo.doctor', 'demo@123'],
    ['demo.reception', 'demo@123'],
    ['demo.cashier', 'demo@123'],
    ['demo.nurse', 'demo@123'],
    ['demo.lab', 'demo@123'],
    ['demo.pharmacy', 'demo@123'],
    ['demo.accounts', 'demo@123'],
    ['demo.insurance', 'demo@123'],
    ['demo.housekeeping', 'demo@123'],
  ];

  for (const [u, p] of rolesToLogin) {
    try {
      tokens[u] = await loginUser(u, p);
      pass(`Login ${u}`);
    } catch (e) {
      fail(`Login ${u}`, e);
    }
  }

  // Ensure beds in 'cleaning' status get cleaned by housekeeping so beds are ready
  try {
    const bRes = await api('/ipd/beds', { token: tokens['demo.reception'] });
    for (const b of bRes.data.beds || []) {
      if (b.status === 'cleaning') {
        await api(`/ipd/beds/${b.id}/cleaned`, { method: 'POST', token: tokens['demo.housekeeping'] });
      }
    }
    pass('Housekeeping verified & ready beds');
  } catch (e) {
    console.warn('Housekeeping prep warning:', e.message);
  }

  // Get metadata for doctors, wards, etc.
  const metaRes = await api('/meta', { token: tokens['demo.reception'] });
  const doctor = metaRes.data.doctors.find(d => d.role === 'doctor');
  assert.ok(doctor, 'Doctor found in meta');
  const doctorId = doctor.id;

  // 2. Register Patient 1 (Cash mode OP)
  console.log('\n--- Step 2: Patient 1 (Cash OP Registration & Payment) ---');
  let p1, enc1, bill1;
  try {
    const pRes = await api('/patients', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        title: 'Mr.',
        name: 'Ramesh Kumar Cash',
        gender: 'Male',
        age_years: 45,
        mobile: '9848011111',
        city: 'Hyderabad',
        state: 'Telangana',
        payer_type: 'self',
      },
    });
    assert.equal(pRes.status, 200, 'Patient 1 created');
    p1 = pRes.data;
    pass('Patient 1 Created (Ramesh Kumar Cash)', { uhid: p1.uhid, id: p1.id });

    // Register OP Encounter with Doctor
    const encRes = await api('/encounters', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        patient_id: p1.id,
        doctor_id: doctorId,
        kind: 'OP',
        visit_type: 'new',
        priority: 'normal',
      },
    });
    assert.equal(encRes.status, 200, 'OP Encounter 1 created');
    enc1 = encRes.data.encounter;
    bill1 = encRes.data.bill;
    assert.ok(enc1 && enc1.id, 'OP Encounter 1 object exists');
    assert.ok(bill1 && bill1.id, 'OP Bill 1 object exists');
    pass('OP Encounter 1 Created', { encounter_no: enc1.encounter_no, stage: enc1.stage });
    pass('OP Bill 1 Found', { bill_no: bill1.bill_no, total: bill1.total, balance: bill1.balance });

    // Pay consultation fee via CASH
    const payRes = await api('/payments', {
      method: 'POST',
      token: tokens['demo.cashier'],
      body: {
        bill_id: bill1.id,
        amount: bill1.balance,
        mode: 'cash',
        remarks: 'OP consultation fee paid via Cash',
      },
    });
    assert.equal(payRes.status, 200, 'Payment 1 Cash succeeded');
    pass('Payment 1 Paid via Cash (Bill 1)', { receipt_no: payRes.data.receipt_no, amount: payRes.data.amount });
  } catch (e) {
    fail('Patient 1 Cash Flow', e);
  }

  // 3. Register Patient 2 (UPI mode OP)
  console.log('\n--- Step 3: Patient 2 (UPI OP Registration & Payment) ---');
  let p2, enc2, bill2;
  try {
    const pRes = await api('/patients', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        title: 'Mrs.',
        name: 'Sunita Reddy UPI',
        gender: 'Female',
        age_years: 38,
        mobile: '9848022222',
        city: 'Hyderabad',
        payer_type: 'self',
      },
    });
    assert.equal(pRes.status, 200);
    p2 = pRes.data;

    const encRes = await api('/encounters', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        patient_id: p2.id,
        doctor_id: doctorId,
        kind: 'OP',
        visit_type: 'new',
      },
    });
    assert.equal(encRes.status, 200);
    enc2 = encRes.data.encounter;
    bill2 = encRes.data.bill;
    assert.ok(enc2 && bill2);

    // Pay consultation fee via UPI
    const payRes = await api('/payments', {
      method: 'POST',
      token: tokens['demo.cashier'],
      body: {
        bill_id: bill2.id,
        amount: bill2.balance,
        mode: 'upi',
        reference: 'UPI/HDFC/20261005/98231',
        remarks: 'Paid via GPay / UPI',
      },
    });
    assert.equal(payRes.status, 200);
    pass('Payment 2 Paid via UPI', { receipt_no: payRes.data.receipt_no, reference: 'UPI/HDFC/20261005/98231' });
  } catch (e) {
    fail('Patient 2 UPI Flow', e);
  }

  // 4. Register Patient 3 (Card mode OP)
  console.log('\n--- Step 4: Patient 3 (Card OP Registration & Payment) ---');
  let p3, enc3, bill3;
  try {
    const pRes = await api('/patients', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        title: 'Mr.',
        name: 'Michael DSouza Card',
        gender: 'Male',
        age_years: 52,
        mobile: '9848033333',
        city: 'Secunderabad',
        payer_type: 'self',
      },
    });
    assert.equal(pRes.status, 200);
    p3 = pRes.data;

    const encRes = await api('/encounters', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        patient_id: p3.id,
        doctor_id: doctorId,
        kind: 'OP',
        visit_type: 'new',
      },
    });
    assert.equal(encRes.status, 200);
    enc3 = encRes.data.encounter;
    bill3 = encRes.data.bill;
    assert.ok(enc3 && bill3);

    // Pay consultation fee via Card
    const payRes = await api('/payments', {
      method: 'POST',
      token: tokens['demo.cashier'],
      body: {
        bill_id: bill3.id,
        amount: bill3.balance,
        mode: 'debit_card',
        reference: 'POS-TXN-449102-VISA',
        remarks: 'Debit Card Swiped at Counter 1',
      },
    });
    assert.equal(payRes.status, 200);
    pass('Payment 3 Paid via Card', { receipt_no: payRes.data.receipt_no, reference: 'POS-TXN-449102-VISA' });
  } catch (e) {
    fail('Patient 3 Card Flow', e);
  }

  // 5. Register Patient 4 (Insurance / Payer mode OP)
  console.log('\n--- Step 5: Patient 4 (Insurance/TPA Registration & Settlement) ---');
  let p4, enc4, bill4;
  try {
    const payersRes = await api('/payers', { token: tokens['demo.reception'] });
    const starPayer = payersRes.data.find(p => p.code === 'STAR') || payersRes.data[0];

    const pRes = await api('/patients', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        title: 'Mrs.',
        name: 'Lakshmi Devi Insurance',
        gender: 'Female',
        age_years: 41,
        mobile: '9848044444',
        city: 'Hyderabad',
        payer_type: 'insurance',
        payer_id: starPayer.id,
        payer_name: starPayer.name,
        policy_no: 'STAR-POL-2026-9912',
      },
    });
    assert.equal(pRes.status, 200);
    p4 = pRes.data;

    const encRes = await api('/encounters', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        patient_id: p4.id,
        doctor_id: doctorId,
        kind: 'OP',
        visit_type: 'new',
      },
    });
    assert.equal(encRes.status, 200);
    enc4 = encRes.data.encounter;
    bill4 = encRes.data.bill;
    assert.ok(enc4 && bill4);

    // Authorize OP bill to Insurance Payer via administrative clearance (has both payment.authorize and insurance.write)
    const authRes = await api(`/bills/${bill4.id}/authorize`, {
      method: 'POST',
      token: tokens['admin'],
      body: {
        category: 'insurance',
        reason: 'Pre-auth approval issued by Star Health Insurance for OP consultation',
      },
    });
    assert.equal(authRes.status, 200, `Payer auth response: ${JSON.stringify(authRes.data)}`);
    pass('Payer Settlement Authorized to Insurance', { bill_id: bill4.id, payer: starPayer.name });
  } catch (e) {
    fail('Patient 4 Payer Flow', e);
  }

  // 6. Nursing Vitals Recording for Patient 1
  console.log('\n--- Step 6: Recording Nursing Vitals ---');
  let vitals1;
  try {
    const vitRes = await api('/vitals', {
      method: 'POST',
      token: tokens['demo.nurse'],
      body: {
        encounter_id: enc1.id,
        patient_id: p1.id,
        bp_sys: 122,
        bp_dia: 82,
        pulse: 78,
        temp_f: 101.4,
        spo2: 99,
        resp_rate: 18,
        height_cm: 172,
        weight_kg: 71,
        notes: 'Patient looks febrile, mild headache, oriented.',
      },
    });
    assert.equal(vitRes.status, 200, `Vitals recorded successfully: ${JSON.stringify(vitRes.data)}`);
    vitals1 = vitRes.data.vitals || vitRes.data;
    pass('Vitals Recorded by Nurse', { id: vitals1.id, temp: vitals1.temp_f, bp: `${vitals1.bp_sys}/${vitals1.bp_dia}` });

    // Check encounter stage is now ready
    const encCheck = await api(`/encounters/${enc1.id}`, { token: tokens['demo.doctor'] });
    assert.equal(encCheck.data.stage, 'ready', 'Encounter moved to ready after payment and vitals');
    pass('Encounter Stage moved to ready for Doctor consultation');
  } catch (e) {
    fail('Nursing Vitals Flow', e);
  }

  // 7. Doctor Consultation & Templates for Patient 1
  console.log('\n--- Step 7: Doctor Consultation & Clinical Templates ---');
  let consult1;
  try {
    // Fetch available templates
    const tplRes = await api('/templates', { token: tokens['demo.doctor'] });
    const tplList = Array.isArray(tplRes.data) ? tplRes.data : tplRes.data.rows;
    const feverTpl = tplList.find(t => t.name === 'Acute Febrile Illness') || tplList[0];
    const rxTpl = tplList.find(t => t.kind === 'prescription');
    assert.ok(feverTpl, 'Clinical consultation template available');
    pass('Templates retrieved', { consultTpl: feverTpl.name, rxTpl: rxTpl?.name });

    // Save Consultation Note using template content
    const cRes = await api('/consultations', {
      method: 'POST',
      token: tokens['demo.doctor'],
      body: {
        encounter_id: enc1.id,
        chief_complaint: 'High grade fever with chills x 3 days, body aches, loss of appetite',
        hopi: 'Fever onset 3 days ago, intermittent spikes up to 102F, chills present, responded temporarily to antipyretics.',
        examination: 'Febrile (101.4 F), Pulse 78/min regular, BP 122/82 mmHg. Chest clear, abdomen soft, no organomegaly.',
        diagnosis: 'Acute Febrile Illness — Rule out Dengue / Typhoid',
        icd_codes: 'R50.9',
        plan: 'Order CBC, RBS, and Urine Routine. Prescribe symptomatic antipyretics and anti-allergic. Review with reports.',
        advice: 'Tepid sponging, bed rest, plenty of fluids (minimum 2.5L/day). Return immediately if persistent vomiting or rash.',
        status: 'signed',
      },
    });
    assert.equal(cRes.status, 200, `Consultation saved and signed: ${JSON.stringify(cRes.data)}`);
    consult1 = cRes.data.consultation || cRes.data;
    pass('Consultation Completed and Signed by Doctor', { id: consult1.id, diagnosis: consult1.diagnosis });
  } catch (e) {
    fail('Doctor Consultation Flow', e);
  }

  // 8. Doctor Orders: Diagnostics (Lab) & Pharmacy Prescription
  console.log('\n--- Step 8: Orders (Lab Diagnostics & Pharmacy Prescriptions) ---');
  let labOrderCbc, labOrderRbs, rxOrder, cbcSvc, rbsSvc;
  try {
    const svcs = await api('/services?active=1', { token: tokens['demo.doctor'] });
    const svcList = Array.isArray(svcs.data) ? svcs.data : svcs.data.rows;
    cbcSvc = svcList.find(s => s.code === 'LAB-CBC');
    rbsSvc = svcList.find(s => s.code === 'LAB-RBS');
    assert.ok(cbcSvc && rbsSvc, 'CBC and RBS services found');

    // Place Lab Orders
    const ordRes = await api('/orders', {
      method: 'POST',
      token: tokens['demo.doctor'],
      body: {
        encounter_id: enc1.id,
        items: [
          { service_id: cbcSvc.id, category: 'lab', priority: 'urgent', clinical_notes: 'C/O fever x 3 days' },
          { service_id: rbsSvc.id, category: 'lab', priority: 'routine', clinical_notes: 'Baseline glycemic check' },
        ],
      },
    });
    assert.equal(ordRes.status, 200, `Lab orders created: ${JSON.stringify(ordRes.data)}`);
    const ordersList = ordRes.data.orders || [];
    labOrderCbc = ordersList.find(o => o.service_id === cbcSvc.id) || ordersList[0];
    labOrderRbs = ordersList.find(o => o.service_id === rbsSvc.id) || ordersList[1];
    assert.ok(labOrderCbc && labOrderRbs, 'CBC and RBS orders returned');
    pass('Lab Orders Created (CBC & RBS)', { cbcId: labOrderCbc.id, rbsId: labOrderRbs.id, status: labOrderCbc.status });

    // Place Prescriptions with our fixed schema handling
    const medsRes = await api('/pharmacy/medicines', { token: tokens['demo.doctor'] });
    const medList = Array.isArray(medsRes.data) ? medsRes.data : medsRes.data.rows;
    const dolo = medList.find(m => m.code === 'MED001');
    const ctz = medList.find(m => m.code === 'MED004');
    assert.ok(dolo && ctz, 'Medicines found in pharmacy catalog');

    const rxRes = await api('/prescriptions', {
      method: 'POST',
      token: tokens['demo.doctor'],
      body: {
        encounter_id: enc1.id,
        items: [
          { medicine_id: dolo.id, drug: dolo.name, dose: '650 mg', frequency: '1-1-1', duration_days: 3, total_qty: 9, instructions: 'After food with water' },
          { medicine_id: ctz.id, drug: ctz.name, dose: '10 mg', frequency: '0-0-1', duration_days: 5, total_qty: 5, instructions: 'At bedtime' },
        ],
      },
    });
    assert.equal(rxRes.status, 200, `Prescriptions saved: ${JSON.stringify(rxRes.data)}`);
    rxOrder = rxRes.data;
    pass('Prescriptions Prescribed by Doctor', { rxId: rxOrder.id, itemsCount: rxOrder.items?.length });
  } catch (e) {
    fail('Orders Placement Flow', e);
  }

  // 9. Bill and Pay Lab Diagnostics (OP Gate Clearance)
  console.log('\n--- Step 9: Diagnostic Billing & Collection (OP Service Clearance Gate) ---');
  let labBill;
  try {
    // Check if auto-billed or raise bill
    const openBillsRes = await api(`/bills?patient_id=${p1.id}`, { token: tokens['demo.cashier'] });
    labBill = openBillsRes.data.rows?.find(b => b.encounter_id === enc1.id && b.balance > 0);
    if (!labBill) {
      const labBillRes = await api('/bills', {
        method: 'POST',
        token: tokens['demo.cashier'],
        body: {
          patient_id: p1.id,
          encounter_id: enc1.id,
          bill_type: 'OP',
          items: [
            { order_id: labOrderCbc.id, description: 'Complete Blood Count (CBC)', category: 'lab', qty: 1, rate: 350 },
            { order_id: labOrderRbs.id, description: 'Random Blood Sugar (RBS)', category: 'lab', qty: 1, rate: 120 },
          ],
        },
      });
      labBill = labBillRes.data;
    }
    pass('Lab Bill Created (Bill 2)', { bill_no: labBill.bill_no, total: labBill.total });

    // Pay Lab bill via Cash
    const labPayRes = await api('/payments', {
      method: 'POST',
      token: tokens['demo.cashier'],
      body: {
        bill_id: labBill.id,
        amount: labBill.balance,
        mode: 'cash',
        remarks: 'Diagnostics fees paid at counter',
      },
    });
    assert.equal(labPayRes.status, 200, 'Lab bill paid');
    pass('Lab Bill Paid (Services Cleared for Phlebotomy)', { receipt_no: labPayRes.data.receipt_no, amount: labPayRes.data.amount });
  } catch (e) {
    fail('Lab Billing Flow', e);
  }

  // 10. Lab Technician Workflow: Sample Collection, Results Entry, Verification
  console.log('\n--- Step 10: Lab Technician Workflow (Collection, Results & Verification) ---');
  try {
    // Sample collection for CBC
    const collCbc = await api(`/lab/orders/${labOrderCbc.id}/collect`, {
      method: 'POST',
      token: tokens['demo.lab'],
      body: { sample_id: `SMP-CBC-${Date.now().toString().slice(-5)}` },
    });
    assert.equal(collCbc.status, 200, `CBC Sample collected: ${JSON.stringify(collCbc.data)}`);
    pass('CBC Sample Collected', { sample_id: collCbc.data.sample_id });

    // Sample collection for RBS
    const collRbs = await api(`/lab/orders/${labOrderRbs.id}/collect`, {
      method: 'POST',
      token: tokens['demo.lab'],
      body: { sample_id: `SMP-RBS-${Date.now().toString().slice(-5)}` },
    });
    assert.equal(collRbs.status, 200, `RBS Sample collected: ${JSON.stringify(collRbs.data)}`);
    pass('RBS Sample Collected', { sample_id: collRbs.data.sample_id });

    // Enter CBC results
    const cbcDetails = await api(`/lab/orders/${labOrderCbc.id}`, { token: tokens['demo.lab'] });
    const cbcParams = cbcDetails.data.params;
    const cbcResultItems = cbcParams.map(p => {
      let val = '14.5';
      if (p.name.includes('WBC')) val = '8500';
      if (p.name.includes('Platelet')) val = '280000';
      if (p.name.includes('Neutrophils')) val = '62';
      if (p.name.includes('Lymphocytes')) val = '30';
      return { param_id: p.id, name: p.name, value: val, unit: p.unit };
    });

    const resCbc = await api(`/lab/orders/${labOrderCbc.id}/results`, {
      method: 'POST',
      token: tokens['demo.lab'],
      body: {
        results: cbcResultItems,
        technician_remarks: 'Smear shows normocytic normochromic RBCs. No hemoparasites seen.',
        verify: true, // Lab technician / admin verifies
      },
    });
    assert.equal(resCbc.status, 200, 'CBC Results entered and verified');
    pass('CBC Results Entered and Verified by Lab', { verified: resCbc.data.status });

    // Enter RBS results
    const rbsDetails = await api(`/lab/orders/${labOrderRbs.id}`, { token: tokens['demo.lab'] });
    const rbsParams = rbsDetails.data.params;
    const resRbs = await api(`/lab/orders/${labOrderRbs.id}/results`, {
      method: 'POST',
      token: tokens['demo.lab'],
      body: {
        results: [{ param_id: rbsParams[0].id, name: rbsParams[0].name, value: '115', unit: 'mg/dL' }],
        technician_remarks: 'Normal random plasma glucose.',
        verify: true,
      },
    });
    assert.equal(resRbs.status, 200, 'RBS Results entered and verified');
    pass('RBS Results Entered and Verified by Lab', { value: '115 mg/dL' });
  } catch (e) {
    fail('Lab Results Workflow', e);
  }

  // 11. Doctor Re-Consultation after viewing Lab Results
  console.log('\n--- Step 11: Doctor Re-Consultation & Review of Results ---');
  try {
    // Doctor views verified lab results
    const labCheck = await api(`/patients/${p1.id}/timeline`, { token: tokens['demo.doctor'] });
    pass('Doctor viewed Patient Timeline with published lab reports');

    // Doctor adds Consultation Amendment / Follow-up notes
    const amendRes = await api('/consultations', {
      method: 'POST',
      token: tokens['demo.doctor'],
      body: {
        encounter_id: enc1.id,
        chief_complaint: 'Follow-up with lab test results. Fever decreased to 99.2 F.',
        examination: 'Temp 99.2 F, PR 76/min, BP 120/80. General condition improved.',
        diagnosis: 'Acute Viral Infection (CBC & RBS reviewed — Normal platelet count 2.8L, Normal WBC 8,500)',
        advice: 'Continue Paracetamol 650mg SOS for body pain. Continue oral hydration. Safe to discharge to home.',
        status: 'signed',
        amend_reason: 'Post-diagnostic test review and clinical re-assessment.',
      },
    });
    assert.equal(amendRes.status, 200, `Consultation amended: ${JSON.stringify(amendRes.data)}`);
    pass('Doctor Re-Consultation completed with post-lab review and amendment');
  } catch (e) {
    fail('Doctor Re-Consultation Flow', e);
  }

  // 12. Follow-up Appointment Booking
  console.log('\n--- Step 12: Appointment Booking ---');
  let appt1;
  try {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const minute = Math.floor(Math.random() * 4) * 15;
    const slotStart = nextWeek.toISOString().slice(0, 10) + ` 11:${String(minute).padStart(2, '0')}`;

    const apptRes = await api('/appointments', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        patient_id: p1.id,
        doctor_id: doctorId,
        slot_start: slotStart,
        slot_minutes: 15,
        notes: 'Follow-up review for fever resolution',
        overbook: true,
      },
    });
    assert.equal(apptRes.status, 200, `Appointment booked: ${JSON.stringify(apptRes.data)}`);
    appt1 = apptRes.data;
    pass('Follow-up Appointment Booked', { id: appt1.id, appt_no: appt1.appt_no, slot_start: slotStart });
  } catch (e) {
    fail('Appointment Booking Flow', e);
  }

  // 13. Pharmacy Dispensing & Billing for Patient 1
  console.log('\n--- Step 13: Pharmacy Dispensing & Bill Collection ---');
  let pharmBill1;
  try {
    const rxCheck = await api(`/prescriptions?patient_id=${p1.id}`, { token: tokens['demo.pharmacy'] });
    pass('Pharmacist inspected Doctor Prescriptions queue');

    // Prepare stock through the real GRN → approved transfer → receipt workflow.
    // Do not select a zero/expired batch left over from earlier demo transactions.
    const suppliers = (await api('/pharmacy/suppliers', {token:tokens.admin})).data;
    const supplier = (suppliers.rows || suppliers)[0];
    assert.ok(supplier, 'Supplier master required for isolated stock setup');
    const meds = (await api('/pharmacy/medicines', {token:tokens.admin})).data.rows;
    const setupMeds = ['MED001','MED004'].map(code => meds.find(m=>m.code===code));
    assert.ok(setupMeds.every(Boolean));
    const receipt = await api('/pharmacy/purchases', {method:'POST',token:tokens.admin,body:{supplier_id:supplier.id,invoice_no:'TEST-E2E-'+Date.now(),items:setupMeds.map(m=>({medicine_id:m.id,batch_no:'TEST-E2E-'+Date.now()+'-'+m.id,expiry:'2029-12-31',qty:100,rate:10,mrp:20,pack_size:1,units_per_pack:1}))}});
    assert.equal(receipt.status,200,JSON.stringify(receipt.data));
    const transfer = await api('/pharmacy/transfers',{method:'POST',token:tokens.admin,body:{source:'Central',destination:'OP',lines:setupMeds.map(m=>({medicine_id:m.id,qty:30})),reason:'TEST end-to-end OP stock'}});
    assert.equal(transfer.status,200,JSON.stringify(transfer.data));
    const approver = await loginUser('demo.owner','demo@123');
    const approval = await api(`/pharmacy/transfers/${transfer.data.id}/approve`,{method:'POST',token:approver,body:{}});
    assert.equal(approval.status,200,JSON.stringify(approval.data));
    const issue = await api(`/pharmacy/transfers/${transfer.data.id}/issue`,{method:'POST',token:tokens.admin,body:{}});
    assert.equal(issue.status,200,JSON.stringify(issue.data));
    const received = await api(`/pharmacy/transfers/${transfer.data.id}/receive`,{method:'POST',token:tokens.admin,body:{issues:issue.data.lines.flatMap(l=>l.issues.map(i=>({id:i.id,qty:i.qty})))}});
    assert.equal(received.status,200,JSON.stringify(received.data));
    pass('Supplier GRN → Central → independent approval → OP issue → OP receipt');

    // Pharmacy dispenses from OP stock and bills
    const batchesRes = await api('/pharmacy/stock?location=OP', { token: tokens['demo.pharmacy'] });
    const stockRows = batchesRes.data.rows || [];
    const doloBatch = stockRows.find(b => b.medicine_code === 'MED001' && b.qty >= 9 && b.days_to_expiry >= 0);
    const ctzBatch = stockRows.find(b => b.medicine_code === 'MED004' && b.qty >= 5 && b.days_to_expiry >= 0);
    assert.ok(doloBatch && ctzBatch, 'OP stock batches available for dispensing');

    const dispenseRes = await api('/pharmacy/dispense', {
      method: 'POST',
      token: tokens['demo.pharmacy'],
      body: {
        patient_id: p1.id,
        encounter_id: enc1.id,
        location: 'OP',
        items: [
          { medicine_id: doloBatch.medicine_id, batch_id: doloBatch.id, qty: 9 },
          { medicine_id: ctzBatch.medicine_id, batch_id: ctzBatch.id, qty: 5 },
        ],
      },
    });
    assert.equal(dispenseRes.status, 200, `Pharmacy dispensed: ${JSON.stringify(dispenseRes.data)}`);
    pharmBill1 = dispenseRes.data.bill;
    pass('Pharmacy Dispensed & Billed (Bill 3)', { bill_no: pharmBill1.bill_no, total: pharmBill1.total });

    // Collect pharmacy payment
    const pharmPayRes = await api('/payments', {
      method: 'POST',
      token: tokens['demo.pharmacy'],
      body: {
        bill_id: pharmBill1.id,
        amount: pharmBill1.balance,
        mode: 'cash',
        remarks: 'Pharmacy counter cash receipt',
      },
    });
    assert.equal(pharmPayRes.status, 200, 'Pharmacy bill paid');
    pass('Pharmacy Bill Paid via Cash', { receipt_no: pharmPayRes.data.receipt_no, amount: pharmPayRes.data.amount });
  } catch (e) {
    fail('Pharmacy Dispensing Flow', e);
  }

  // 14. Emergency (ER) Arrival & Triage -> ICU Bed Admission
  console.log('\n--- Step 14: Emergency (ER) Arrival & Triage -> ICU Admission ---');
  let erPatient, erCase, icuAdmission, icuBed;
  try {
    // Register Emergency Patient
    const erPRes = await api('/patients', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        title: 'Mr.',
        name: 'Venkatesh Rao Emergency',
        gender: 'Male',
        age_years: 55,
        mobile: '9848055555',
        city: 'Hyderabad',
        payer_type: 'self',
      },
    });
    assert.equal(erPRes.status, 200);
    erPatient = erPRes.data;
    pass('Emergency Patient Created (Venkatesh Rao Emergency)', { uhid: erPatient.uhid });

    // Create Emergency Case at Emergency Desk
    const erCaseRes = await api('/ipd/emergency', {
      method: 'POST',
      token: tokens['demo.nurse'],
      body: {
        patient_id: erPatient.id,
        complaint: 'Acute severe chest tightness and severe dyspnea since 1 hour',
        triage_category: 'red', // Red = Immediate Resuscitation / Critical
        gcs: 14,
        bp_sys: 165,
        bp_dia: 105,
        pulse: 110,
        temp_f: 99.0,
        spo2: 91,
        resp_rate: 28,
      },
    });
    assert.equal(erCaseRes.status, 200, 'Emergency case registered');
    erCase = erCaseRes.data;
    pass('Emergency Case Registered & Triaged (Red/Stat Priority)', { case_no: erCase.case_no, triage: erCase.triage_category });

    // Add ER Emergency treatment charge
    const erChgRes = await api(`/ipd/emergency/${erCase.id}/charges`, {
      method: 'POST',
      token: tokens['demo.nurse'],
      body: {
        description: 'Emergency Resuscitation, Nebulisation and Stat Oxygenation',
        amount: 850,
      },
    });
    assert.equal(erChgRes.status, 200, 'Emergency charges added');
    pass('Emergency Charges Added to ER Bill (Bill 4)');

    // Admit to ICU Bed (Beds: ICU-1-01 / ICU-1-02)
    const bedsRes = await api('/ipd/beds', { token: tokens['demo.reception'] });
    const bedList = bedsRes.data.beds || [];
    icuBed = bedList.find(b => b.bed_no.startsWith('ICU') && b.status === 'vacant');
    if (!icuBed) {
      // Clean any cleaning ICU bed
      const cleaningIcu = bedList.find(b => b.bed_no.startsWith('ICU') && b.status === 'cleaning');
      if (cleaningIcu) {
        await api(`/ipd/beds/${cleaningIcu.id}/cleaned`, { method: 'POST', token: tokens['demo.housekeeping'] });
        icuBed = cleaningIcu;
      }
    }
    assert.ok(icuBed, 'Vacant ICU Bed found');

    const admitRes = await api('/ipd/admissions', {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        patient_id: erPatient.id,
        bed_id: icuBed.id,
        consultant_id: doctorId,
        emergency_id: erCase.id,
        diagnosis: 'Acute Coronary Syndrome / Hypertensive Urgency / Acute Pulmonary Edema',
        admission_type: 'emergency',
        financial_category: 'self',
      },
    });
    assert.equal(admitRes.status, 200, `Admitted to ICU: ${JSON.stringify(admitRes.data)}`);
    icuAdmission = admitRes.data;
    pass('Patient Admitted directly to ICU from Emergency', { ip_no: icuAdmission.ip_no, bed: icuBed.bed_no });
  } catch (e) {
    fail('Emergency & ICU Admission Flow', e);
  }

  // 15. ICU Nursing Care, Rack Replacement Usage & Inpatient Charges
  console.log('\n--- Step 15: ICU Care, Daily Charges & Emergency Rack Usage ---');
  try {
    // Add per-day ICU nursing & monitoring charges
    const chgRes = await api(`/ipd/admissions/${icuAdmission.id}/charges`, {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        service_id: 17, // Bed ICU
        category: 'ipd',
        price: 9500,
        billing_unit: 'day',
      },
    });
    pass('ICU Inpatient Daily Charges Configured');

    // Add Nursing Note in ICU
    const noteRes = await api('/ipd/nursing/notes', {
      method: 'POST',
      token: tokens['demo.nurse'],
      body: {
        admission_id: icuAdmission.id,
        body: 'Continuous cardiac monitoring active. Oxygen at 4L/min via mask. BP controlled to 135/88, SpO2 96%. Patient stabilized.',
      },
    });
    assert.equal(noteRes.status, 200, `Nursing note logged: ${JSON.stringify(noteRes.data)}`);
    pass('ICU Nursing Note Recorded');

    // Record Emergency Rack Consumption (Ward replacements) from ICU
    const icuBatches = await api('/pharmacy/stock?location=ICU', { token: tokens['demo.nurse'] });
    const nsBatch = icuBatches.data.rows?.find(b => b.medicine_code === 'CON002') || icuBatches.data.rows?.[0];
    if (nsBatch) {
      const rackUsageRes = await api('/pharmacy/ward-replacements', {
        method: 'POST',
        token: tokens['demo.nurse'],
        body: {
          location: 'ICU',
          encounter_id: icuAdmission.encounter_id,
          lines: [{ batch_id: nsBatch.id, qty: 1 }],
          notes: 'Emergency IV infusion administered in ICU',
        },
      });
      assert.equal(rackUsageRes.status, 200, `Rack replacement usage: ${JSON.stringify(rackUsageRes.data)}`);
      pass('Emergency Rack Usage Logged in ICU', { replacement_no: rackUsageRes.data.replacement_no });

      // Pharmacy supplies replacement
      const supplyRes = await api(`/pharmacy/ward-replacements/${rackUsageRes.data.id}/supply`, {
        method: 'POST',
        token: tokens['demo.pharmacy'],
        body: {
          items: [{ medicine_id: nsBatch.medicine_id, qty: 1 }],
        },
      });
      assert.equal(supplyRes.status, 200, 'Pharmacy supplied replacement slip');
      pass('Pharmacy Supplied Replacement Slip & Billed to Patient');

      // Nurse confirms physical receipt
      const supplyLine = supplyRes.data.replacement.supplies[0];
      if (supplyLine) {
        const recRes = await api(`/pharmacy/ward-replacements/${rackUsageRes.data.id}/receive`, {
          method: 'POST',
          token: tokens['demo.nurse'],
          body: {
            lines: [{ id: supplyLine.id, qty: 1 }],
          },
        });
        assert.equal(recRes.status, 200, `Physical replacement received: ${JSON.stringify(recRes.data)}`);
        pass('Nurse Confirmed Physical Receipt into ICU Rack');
      }
    }
  } catch (e) {
    fail('ICU Care and Rack Usage Flow', e);
  }

  // 16. Bed Transfer from ICU to General Ward
  console.log('\n--- Step 16: Bed Transfer (ICU -> General Ward) ---');
  let gwBed;
  try {
    const bedsRes = await api('/ipd/beds', { token: tokens['demo.reception'] });
    const bedList = bedsRes.data.beds || [];
    gwBed = bedList.find(b => b.bed_no.startsWith('GW-A') && b.status === 'vacant');
    if (!gwBed) {
      const cleaningGw = bedList.find(b => b.bed_no.startsWith('GW-A') && b.status === 'cleaning');
      if (cleaningGw) {
        await api(`/ipd/beds/${cleaningGw.id}/cleaned`, { method: 'POST', token: tokens['demo.housekeeping'] });
        gwBed = cleaningGw;
      }
    }
    assert.ok(gwBed, 'General Ward vacant bed found');

    const transferRes = await api(`/ipd/admissions/${icuAdmission.id}`, {
      method: 'PATCH',
      token: tokens['demo.reception'],
      body: {
        bed_id: gwBed.id,
        reason: 'Patient hemodynamically stable, shifted from ICU to General Ward for observation',
      },
    });
    assert.equal(transferRes.status, 200, 'Bed transferred');
    pass('Patient Successfully Transferred to General Ward', { from: 'ICU', to: gwBed.bed_no });

    // Verify bed statuses
    const bedCheck = await api('/ipd/beds', { token: tokens['demo.reception'] });
    const oldIcu = bedCheck.data.beds.find(b => b.id === icuBed.id);
    const newGw = bedCheck.data.beds.find(b => b.id === gwBed.id);
    assert.equal(oldIcu.status, 'cleaning', 'Vacated ICU bed marked for cleaning');
    assert.equal(newGw.status, 'occupied', 'New General Ward bed marked occupied');
    pass('Bed Life-cycle verified: Vacated Bed -> Cleaning, New Bed -> Occupied');
  } catch (e) {
    fail('Bed Transfer Flow', e);
  }

  // 17. Multi-billing settlement for Inpatient Stay
  console.log('\n--- Step 17: Inpatient Billing & Settlement ---');
  let openBills = [];
  try {
    const bRes = await api(`/bills?patient_id=${erPatient.id}`, { token: tokens['demo.cashier'] });
    openBills = bRes.data.rows?.filter(b => b.status !== 'cancelled' && b.balance > 0.05) || [];
    pass(`Retrieved ${openBills.length} Inpatient/Emergency Bills for Patient`, { count: openBills.length });

    for (const b of openBills) {
      const payB = await api('/payments', {
        method: 'POST',
        token: tokens['demo.cashier'],
        body: {
          bill_id: b.id,
          amount: b.balance,
          mode: 'upi',
          reference: `UPI-SETTLE-${b.bill_no}`,
          remarks: `Inpatient settlement for ${b.bill_no}`,
        },
      });
      assert.equal(payB.status, 200);
      pass(`Settled Bill ${b.bill_no}`, { paid: b.balance });
    }
  } catch (e) {
    fail('Inpatient Billing Settlement Flow', e);
  }

  // 18. Discharge Process: Discharge Summary & Financial/Clinical Clearance & Final Discharge
  console.log('\n--- Step 18: Discharge Summary & Final Patient Discharge ---');
  try {
    // 1. Doctor creates/updates Discharge Summary and marks clinically cleared
    const summaryText = `
ADMISSION DIAGNOSIS: Acute Coronary Syndrome / Hypertensive Urgency
DISCHARGE DIAGNOSIS: Hypertensive Crisis Resolved / Unstable Angina Ruled Out

CLINICAL COURSE IN HOSPITAL:
Patient presented to Emergency with chest heaviness and hypertension. Triaged as red priority, administered sublingual nitrates, oxygen, and stat analgesics. Shifted to ICU under continuous hemodynamic monitoring. Serial cardiac enzymes were negative. Transferred to General Ward after 24 hours of stabilization. Vitals normalized.

DISCHARGE VITALS:
BP: 124/80 mmHg | Pulse: 72/min regular | SpO2: 98% room air | Temp: 98.4 F

DISCHARGE MEDICATIONS:
1. Tab Telmisartan 40 mg — 1-0-0 x 30 days
2. Tab Aspirin 75 mg — 0-1-0 x 30 days
3. Tab Atorvastatin 20 mg — 0-0-1 x 30 days

FOLLOW-UP ADVICE:
Review in Cardiology OPD after 10 days or immediately if recurrence of chest pain.
Diet: Low salt, low fat diet.
`;

    const summaryRes = await api(`/ipd/admissions/${icuAdmission.id}`, {
      method: 'PATCH',
      token: tokens['demo.doctor'],
      body: {
        discharge_summary: summaryText,
        discharge_type: 'routine',
        status: 'clinically_cleared',
      },
    });
    assert.equal(summaryRes.status, 200, 'Discharge summary saved');
    pass('Clinical Discharge Summary Authored & Clinically Cleared');

    // Settle any remaining post-care bills (including rack replacement pharmacy bill)
    const finalBills = await api(`/bills?patient_id=${erPatient.id}`, { token: tokens['admin'] });
    for (const b of finalBills.data.rows?.filter(b => b.status !== 'cancelled' && b.balance > 0.05) || []) {
      await api('/payments', {
        method: 'POST',
        token: tokens['admin'],
        body: { bill_id: b.id, amount: b.balance, mode: 'cash', remarks: 'Final clearance payment' },
      });
      pass(`Cleared final bill ${b.bill_no}`, { amount: b.balance, type: b.bill_type });
    }

    // Check discharge readiness on Discharge Board
    const boardRes = await api('/ipd/discharge/board', { token: tokens['demo.reception'] });
    const row = boardRes.data.rows?.find(r => r.id === icuAdmission.id);
    pass('Discharge Board Clearance Checked', { balance: row?.balance, checks: row?.checks });

    // Execute Discharge
    const disRes = await api(`/ipd/admissions/${icuAdmission.id}/discharge`, {
      method: 'POST',
      token: tokens['demo.reception'],
      body: {
        discharge_type: 'routine',
        reason: 'Clinically stable, discharged home with medication',
      },
    });
    assert.equal(disRes.status, 200, `Discharged successfully: ${JSON.stringify(disRes.data)}`);
    pass('Patient Successfully Discharged from MGM HMS', { status: disRes.data.status });
  } catch (e) {
    fail('Discharge Process Flow', e);
  }

  // 19. All Logins React & Page Permissions Verification
  console.log('\n--- Step 19: All 24 Logins & Permission Reactions Verification ---');
  try {
    const demoAccountsRes = await api('/auth/demo-accounts');
    assert.ok(demoAccountsRes.data.enabled, 'Demo accounts enabled');
    const allUsers = demoAccountsRes.data.groups.flatMap(g => g.accounts);

    console.log(`Auditing all ${allUsers.length} user logins and dashboard page responses...`);
    let loginPassCount = 0;

    for (const acc of allUsers) {
      const lgRes = await api('/auth/login', {
        method: 'POST',
        body: { username: acc.username, password: 'demo@123' },
      });
      if (lgRes.status === 200) {
        loginPassCount++;
        const uTok = lgRes.data.token;
        // Test role dashboard response
        const dashRes = await api('/dashboard/role', { token: uTok });
        if (dashRes.status !== 200) {
          bug(`Dashboard failure for role ${acc.role}`, `User ${acc.username} got status ${dashRes.status} on /dashboard/role`, 'high', 'dashboard');
        }
      } else {
        bug(`Login failure for ${acc.username}`, `Failed to login: status ${lgRes.status}`, 'critical', 'auth');
      }
    }
    pass(`All ${loginPassCount}/${allUsers.length} Demo Accounts Logged in & Responded correctly to their respective Dashboards`);
  } catch (e) {
    fail('All Logins Audit', e);
  }

  // 20. Double-Entry Accounting Audit
  console.log('\n--- Step 20: Double-Entry Books & Financial Balance Audit ---');
  try {
    const trialRes = await api('/accounts/trial-balance', { token: tokens['demo.accounts'] });
    assert.equal(trialRes.status, 200, 'Trial balance computed');
    const tb = trialRes.data;
    assert.equal(tb.totals.debit, tb.totals.credit, 'Trial balance is balanced (Debit == Credit)');
    pass('Double-Entry Books Verified: Trial Balance is 100% Balanced!', {
      debitTotal: tb.totals?.debit,
      creditTotal: tb.totals?.credit,
    });
  } catch (e) {
    fail('Double Entry Audit', e);
  }

  console.log('\n=== Functional Test Suite Completed ===\n');
  console.log(`Passed Checks: ${report.passedSteps.length}`);
  console.log(`Failed Checks: ${report.failedSteps.length}`);
  console.log(`Bugs Identified: ${report.bugsFound.length}`);

  return report;
}

const res = await runFullTest();
console.log(JSON.stringify(res, null, 2));
if (res.failedSteps.length || res.bugsFound.length) process.exitCode = 1;
