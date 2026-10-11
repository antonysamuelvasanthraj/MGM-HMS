/**
 * Realistic demo activity, created the way staff create it: by signing in as each department login and
 * calling the same API the screens use. Every bill, receipt, stock movement, journal entry and audit row
 * is therefore genuine. All patients are fictional and marked "[DEMO RECORD]" in their notes.
 *
 *   node tools/seed-demo-workflows.mjs [--url http://127.0.0.1:4300] [--force]
 *
 * Needs: the HMS running, masters seeded (seed-demo-masters) and staff logins (seed-demo-staff →
 * DEMO-LOGINS.local.md). Refuses to run twice on the same data unless --force (run demo:reset first).
 * Prints a step-by-step report; a failed step is reported and the rest continue.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const BASE = `${arg('--url', process.env.HMS_URL || 'http://127.0.0.1:4300').replace(/\/$/, '')}/api`;
const sheet = fs.readFileSync(path.join(root, 'DEMO-LOGINS.local.md'), 'utf8');
const PW = Object.fromEntries([...sheet.matchAll(/^\| [^|]+ \| [^|]+ \| `([^`]+)` \| `([^`]+)` \|/gm)].map((m) => [m[1], m[2]]));

const tokens = {}, report = [];
let ok = 0, failed = 0;
async function login(user) {
  if (tokens[user]) return tokens[user];
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: PW[user] }) });
  if (!r.ok) throw new Error(`login ${user} ${r.status}`);
  return (tokens[user] = (await r.json()).token);
}
async function api(user, p, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-Session': await login(user) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = text ? JSON.parse(text) : null; } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
async function step(name, fn) {
  try { const v = await fn(); ok++; report.push(['ok', name]); console.log(`  ✓ ${name}`); return v; }
  catch (e) { failed++; report.push(['FAILED', name, e.message]); console.log(`  ✗ ${name}\n      ${e.message}`); return null; }
}
const key = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const day = (d = 0) => { const x = new Date(Date.now() + d * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

// ------------------------------------------------------------------ lookups
const meta = await api('reception', '/meta');
const svc = (code) => meta.services.find((s) => s.code === code) || (() => { throw new Error(`service ${code} missing`); })();
const users = Object.fromEntries((await api('hosp.admin', '/admin/users')).map((u) => [u.username, u]));
const uid = (u) => users[u]?.id || (() => { throw new Error(`user ${u} missing`); })();
const meds = (await api('pharmacy.manager', '/pharmacy/medicines?limit=1000')).rows;
const med = (code) => meds.find((m) => m.code === `DM-${code}`) || (() => { throw new Error(`medicine ${code} missing`); })();
const payers = await api('tpa.desk', '/payers');
const payer = (code) => payers.find((p) => p.code === code) || (() => { throw new Error(`payer ${code} missing`); })();
const sups = await api('purchase.manager', '/pharmacy/suppliers');
const already = (await api('reception', '/patients?q=DEMO%20RECORD').catch(() => ({ rows: [] })));
if ((already.rows || already).length && !process.argv.includes('--force')) {
  console.error('Demo workflows already exist in this database. Run `npm run demo:reset` first (or pass --force to add more).');
  process.exit(1);
}

// ------------------------------------------------------------------ helpers
async function patient(f) {
  return api('registration', '/patients', { state: 'Andhra Pradesh', city: 'Srikalahasti', pincode: '517644', notes: '[DEMO RECORD] fictional patient for demonstration', ...f });
}
async function pay(user, billId, mode = 'cash', ref) {
  const b = await api(user, `/bills/${billId}`);
  if (!(b.balance > 0.005)) return b;
  const line = { mode, amount: b.balance, ...(ref ? { reference: ref } : {}) };
  return api(user, `/bills/${billId}/settle`, { request_key: key('demo'), lines: [line] });
}
async function opVisit(p, doc, { mode = 'cash', ref, followup = false, payer: payerBill = false } = {}) {
  const r = await api('reception', '/encounters', { patient_id: p.id, doctor_id: uid(doc), ...(followup ? { visit_type: 'followup' } : {}), ...(payerBill ? { collect: false } : {}) });
  if (!payerBill && r.bill && r.bill.balance > 0) await pay('reception', r.bill.id, mode, ref);
  return r.encounter;
}
async function vitals(enc, v) { return api('nurse', '/vitals', { encounter_id: enc.id, bp_sys: 120, bp_dia: 80, pulse: 78, spo2: 98, temp_f: 98.6, resp_rate: 16, weight_kg: 62, ...v }); }
async function consult(doc, enc, c) { return api(doc, '/consultations', { encounter_id: enc.id, status: 'signed', ...c }); }
async function order(doc, enc, codes) { return api(doc, '/orders', { encounter_id: enc.id, items: codes.map((c) => ({ service_id: svc(c).id })) }); }
async function labWork(orders, values = {}) {
  for (const o of orders.filter((x) => x.category === 'lab')) {
    await api('lab.tech', `/lab/orders/${o.id}/collect`, {});
    const d = await api('lab.tech', `/lab/orders/${o.id}`);
    const results = d.params.map((p) => ({ param_id: p.id, value: String(values[p.name] ?? (p.result_type === 'option' ? (p.options || '').split('|')[0] : p.result_type === 'text' ? (p.ref_text || 'Within normal limits') : p.ref_low != null && p.ref_high != null ? +((p.ref_low + p.ref_high) / 2).toFixed(p.ref_high < 10 ? 1 : 0) : (p.ref_text || 'Normal'))) }));
    await api('lab.manager', `/lab/orders/${o.id}/results`, { results, verify: true });
  }
}
async function imagingWork(orders, impression = 'No significant abnormality.') {
  for (const o of orders.filter((x) => x.category === 'imaging')) {
    await api('radiology.tech', `/orders/${o.id}`, { status: 'in_progress' }, 'PATCH');
    await api('radiologist', `/imaging/orders/${o.id}/report`, { technique: 'Standard protocol.', findings: 'Findings recorded as per study protocol (demo).', impression, status: 'final' });
  }
}
async function rx(doc, enc, items) {
  return api(doc, '/prescriptions', { encounter_id: enc.id, replace: true, items: items.map(([code, frequency, days, qty, instructions = 'After food']) => {
    const m = med(code); return { drug: m.name, medicine_id: m.id, frequency, duration_days: days, qty, instructions, route: 'Oral' }; }) });
}
async function dispenseRx(p, enc, mode = 'cash', location = 'OP') {
  const list = await api('pharmacist', '/pharmacy/dispense/queue');
  const r = (list.rows || list).find((x) => x.encounter_id === enc.id);
  if (!r) throw new Error('prescription not in pharmacy queue');
  return api('pharmacist', '/pharmacy/dispense', { patient_id: p.id, prescription_id: r.id, location, mode, collect: true,
    items: r.items.filter((i) => i.medicine_id).map((i) => ({ medicine_id: i.medicine_id, qty: i.qty, prescription_item_id: i.id })) });
}
async function admit(p, doc, bedKind, f = {}) {
  const beds = (await api('reception', '/ipd/beds')).beds;
  const bed = beds.find((b) => b.status === 'vacant' && b.ward_kind === bedKind);
  if (!bed) throw new Error(`no vacant ${bedKind} bed`);
  const cat = await api('reception', '/ipd/charge-catalog');
  const applies = (c) => !c.ward_kinds || c.ward_kinds.split(',').includes(bedKind);
  const charges = cat.filter((c) => ['day', 'hour'].includes(c.billing_unit) && c.ipd_default && applies(c)).map((c) => c.id);
  return api('reception', '/ipd/admissions', { patient_id: p.id, bed_id: bed.id, consultant_id: uid(doc), financial_category: 'self', charges, ...f });
}
async function advance(adm, amount, mode = 'cash') {
  const full = await api('ip.billing', `/ipd/admissions/${adm.id}`);
  return api('ip.billing', `/bills/${full.ip_bill_id}/settle`, { request_key: key('adv'), allow_advance: true, lines: [{ mode, amount }] });
}

console.log(`Seeding demo workflows on ${BASE.replace(/\/api$/, '')}`);

/* ========================================================== 0. stock in */
console.log('\n0. Central pharmacy stock');
await step('GRN — pharmacy medicines (Sri Venkateswara Pharma)', async () => {
  const s = sups.find((x) => x.code === 'SUP-APL') || sups[0];
  const codes = ['PCM500', 'PCM650', 'PCM650B', 'IBU400', 'ACEC', 'AMOX500', 'AUG625', 'AZI500', 'CEF200', 'PAN40', 'PAN40B', 'ONDA4', 'CET10', 'LEVO5', 'MET500', 'AMLO5', 'TEL40', 'ATOR10', 'ASP75', 'FE100', 'CALD', 'PCMSYR', 'AMOXSUS', 'CETSYR', 'ORS', 'SALNEB', 'BUDNEB', 'CEFTRI1', 'PANINJ', 'ONDINJ', 'PCMINJ', 'DICINJ', 'OXY', 'MGSO4', 'TT', 'VITK', 'NS500', 'RL500', 'DNS500', 'D5', 'ISOP', 'MUP', 'CIPEYE', 'MISO200', 'LABET100', 'ENOX40', 'INSR'];
  const items = codes.map((c, i) => { const m = med(c); const pack = m.units_per_pack || 1; const rate = +(pack * (2 + (i % 7) * 3.5)).toFixed(2);
    return { medicine_id: m.id, batch_no: `DB${String(i + 1).padStart(3, '0')}${day().slice(5, 7)}`, expiry: `${new Date().getFullYear() + 2}-${String((i % 12) + 1).padStart(2, '0')}`, qty: pack >= 10 ? 40 : 200, free_qty: i % 9 === 0 ? 3 : 0,
      rate, mrp: +(rate * 1.4).toFixed(2), gst_pct: m.gst_pct || 12, units_per_pack: pack, pack_size: 1, purchase_unit: m.package_type || 'pack' }; });
  return api('purchase.manager', '/pharmacy/purchases', { supplier_id: s.id, invoice_no: `SVP/${day().replace(/-/g, '')}/101`, invoice_date: day(-1), received_date: day(), items, delivery_charge: 150 });
});
await step('GRN — surgical consumables (Medline Surgicals)', async () => {
  const s = sups.find((x) => x.code === 'SUP-MED') || sups[1];
  const cons = meds.filter((m) => m.kind === 'consumable');
  const items = cons.map((m, i) => ({ medicine_id: m.id, batch_no: `CS${String(i + 1).padStart(3, '0')}`, expiry: `${new Date().getFullYear() + 3}-06`, qty: 200, rate: +(4 + (i % 9) * 6).toFixed(2), mrp: +((4 + (i % 9) * 6) * 1.5).toFixed(2), gst_pct: 12, units_per_pack: 1, pack_size: 1, purchase_unit: 'piece' }));
  return api('purchase.manager', '/pharmacy/purchases', { supplier_id: s.id, invoice_no: `MSC/${day().replace(/-/g, '')}/77`, invoice_date: day(-1), received_date: day(), items });
});
async function transfer(dest, codes, qty) {
  const t = await api('central.pharmacy', '/pharmacy/transfers', { source: 'Central', destination: dest, reason: `${dest} stock top-up (demo)`, lines: codes.map((c) => ({ medicine_id: med(c).id, qty })) });
  await api('pharmacy.manager', `/pharmacy/transfers/${t.id}/approve`, {});
  const issued = await api('central.pharmacy', `/pharmacy/transfers/${t.id}/issue`, {});
  const receiver = dest === 'OP' ? 'pharmacist' : dest === 'ICU' ? 'icu.incharge' : dest === 'ER' ? 'er.incharge' : dest === 'OT' ? 'ot.incharge' : 'ward.incharge';
  return api(receiver, `/pharmacy/transfers/${t.id}/receive`, { issues: issued.lines.flatMap((l) => l.issues.map((i) => ({ id: i.id, qty: i.qty }))) }).catch(() => api('central.pharmacy', `/pharmacy/transfers/${t.id}/receive`, { issues: issued.lines.flatMap((l) => l.issues.map((i) => ({ id: i.id, qty: i.qty }))) }));
}
await step('Transfer Central → OP pharmacy', () => transfer('OP', ['PCM500', 'PCM650', 'IBU400', 'ACEC', 'AMOX500', 'AUG625', 'AZI500', 'CEF200', 'PAN40', 'ONDA4', 'CET10', 'LEVO5', 'MET500', 'AMLO5', 'TEL40', 'ATOR10', 'FE100', 'CALD', 'PCMSYR', 'AMOXSUS', 'CETSYR', 'ORS', 'MUP', 'CIPEYE'], 60));
await step('Transfer Central → IP pharmacy', () => transfer('IP', ['PCM650', 'PAN40', 'ONDA4', 'CEFTRI1', 'PANINJ', 'ONDINJ', 'PCMINJ', 'NS500', 'RL500', 'DNS500', 'ENOX40', 'INSR', 'AMOX500', 'AUG625'], 40));
await step('Transfer Central → ICU', () => transfer('ICU', ['CEFTRI1', 'PANINJ', 'ONDINJ', 'PCMINJ', 'NS500', 'RL500', 'ENOX40', 'INSR', 'SALNEB'], 20));
await step('Transfer Central → ER', () => transfer('ER', ['DICINJ', 'ONDINJ', 'PCMINJ', 'NS500', 'RL500', 'TT', 'SALNEB', 'BUDNEB'], 20));
await step('Transfer Central → OT', () => transfer('OT', ['CEFTRI1', 'PCMINJ', 'RL500', 'NS500', 'OXY', 'MGSO4'], 15));

/* ========================================================== 1. OPD */
console.log('\n1. Out-patient visits');
const P = {};
const op = [
  ['ramya', { name: 'Ramya Krishna', title: 'Mrs.', gender: 'Female', age_years: 34, dob: '1992-03-14', mobile: '9000100001', blood_group: 'B+', kin_name: 'Krishna Murthy', kin_relation: 'Husband', kin_mobile: '9000100101', address: '12-4, Gandhi Road' }, 'doctor', 'cash', null, { chief_complaint: 'Fever with body pains for 3 days', diagnosis: 'Acute febrile illness — viral fever', plan: 'Symptomatic treatment, CBC', advice: 'Plenty of oral fluids, rest' }, ['LAB-CBC'], [['PCM650', '1-0-1', 3, 6], ['CET10', '0-0-1', 3, 3]], 'cash', { Haemoglobin: 11.4 }],
  ['venkat', { name: 'Venkata Rao Chowdary', title: 'Mr.', gender: 'Male', age_years: 56, dob: '1970-08-02', mobile: '9000100002', blood_group: 'O+', kin_name: 'Sarada', kin_relation: 'Wife', kin_mobile: '9000100102', address: '7-1-22, Main Bazaar', allergy: 'Sulfa drugs' }, 'dr.cardio', 'upi', 'UPI-DEMO-889201', { chief_complaint: 'Headache, giddiness; known hypertensive', diagnosis: 'Essential hypertension — uncontrolled', plan: 'Lipid profile, ECG; start telmisartan', advice: 'Low salt diet, daily walk' }, ['LAB-LIPID', 'IMG-ECG'], [['TEL40', '1-0-0', 30, 30], ['ATOR10', '0-0-1', 30, 30]], 'upi', { 'Total cholesterol': 236, 'LDL cholesterol': 158 }],
  ['suma', { name: 'Suma Latha', title: 'Mrs.', gender: 'Female', age_years: 45, dob: '1981-11-20', mobile: '9000100003', blood_group: 'A+', kin_name: 'Ramesh', kin_relation: 'Husband', kin_mobile: '9000100103', address: '3-55, Temple Street' }, 'doctor', 'debit_card', 'APR-7781', { chief_complaint: 'Increased thirst and urination', diagnosis: 'Type 2 diabetes mellitus — new', plan: 'FBS, PPBS, HbA1c; metformin', advice: 'Diabetic diet, exercise' }, ['LAB-FBS', 'LAB-HBA1C'], [['MET500', '1-0-1', 30, 60]], 'card', { 'Glucose (fasting)': 168, HbA1c: 8.2 }],
  ['anvika', { name: 'Anvika Reddy', title: 'Baby', gender: 'Female', age_years: 6, dob: '2020-05-10', mobile: '9000100004', blood_group: 'B+', kin_name: 'Sravani Reddy', kin_relation: 'Mother', kin_mobile: '9000100004', address: '9-12, School Road' }, 'dr.peds', 'cash', null, { chief_complaint: 'Cough and cold for 4 days', diagnosis: 'Acute upper respiratory infection', plan: 'Supportive care', advice: 'Steam inhalation, warm fluids' }, ['LAB-CBC'], [['PCMSYR', '1-1-1', 3, 1, 'After food — 5 mL'], ['CETSYR', '0-0-1', 5, 1, 'At bedtime — 2.5 mL']], 'cash', { Haemoglobin: 11.8 }],
  ['raviteja', { name: 'Ravi Teja', title: 'Mr.', gender: 'Male', age_years: 41, dob: '1985-01-30', mobile: '9000100005', blood_group: 'AB+', kin_name: 'Lalitha', kin_relation: 'Wife', kin_mobile: '9000100105', address: '1-8, Railway Colony' }, 'dr.ortho', 'cash', null, { chief_complaint: 'Right knee pain after fall', diagnosis: 'Soft tissue injury right knee', plan: 'X-ray, analgesics, knee support', advice: 'Ice packs, limb elevation' }, ['IMG-XR-LIMB'], [['ACEC', '1-0-1', 5, 10]], 'cash'],
  ['swapna', { name: 'Swapna Priya', title: 'Mrs.', gender: 'Female', age_years: 26, dob: '2000-02-18', mobile: '9000100006', blood_group: 'O+', kin_name: 'Mahesh', kin_relation: 'Husband', kin_mobile: '9000100106', address: '4-77, Lake View Colony' }, 'consultant', 'upi', 'UPI-DEMO-55101', { chief_complaint: 'Routine antenatal visit, 24 weeks', diagnosis: 'G2P1L1 at 24 weeks — low risk', plan: 'Antenatal profile, obstetric scan', advice: 'Iron, calcium; diet and danger signs explained' }, ['LAB-BGRH', 'LAB-HIV', 'LAB-HBSAG', 'LAB-VDRL', 'LAB-TSH', 'IMG-USG-OBS'], [['FE100', '0-1-0', 30, 30], ['CALD', '1-0-1', 30, 60]], 'upi'],
  ['mohammed', { name: 'Mohammed Irfan', title: 'Mr.', gender: 'Male', age_years: 29, dob: '1997-07-07', mobile: '9000100007', blood_group: 'B-', kin_name: 'Asma', kin_relation: 'Wife', kin_mobile: '9000100107', address: '22, Masjid Street' }, 'doctor', 'cash', null, { chief_complaint: 'Acidity and burning epigastrium', diagnosis: 'Acid peptic disease', plan: 'PPI for 2 weeks', advice: 'Avoid spicy food, small frequent meals' }, [], [['PAN40', '1-0-0', 14, 14, 'Before food']], 'cash'],
];
for (const [k, pf, doc, mode, ref, c, orders, meds_, dmode, values] of op) {
  await step(`OP — ${pf.name} (${doc}, ${mode})`, async () => {
    const p = P[k] = await patient(pf);
    const enc = await opVisit(p, doc, { mode, ref });
    await vitals(enc, k === 'venkat' ? { bp_sys: 168, bp_dia: 102, pulse: 88 } : k === 'anvika' ? { weight_kg: 19, temp_f: 99.8 } : {});
    let ord = null;
    if (orders.length) {
      ord = await order(doc, enc, orders);
      if (ord.bill) await pay('op.billing', ord.bill.id, dmode === 'card' ? 'debit_card' : dmode, dmode === 'upi' ? 'UPI-DEMO-SVC' : dmode === 'card' ? 'APR-SVC' : undefined);
      await labWork(ord.orders, values || {});
      await imagingWork(ord.orders, k === 'raviteja' ? 'No fracture. Soft tissue swelling.' : k === 'venkat' ? 'Sinus rhythm, LVH voltage criteria.' : 'Single live intrauterine fetus of 24 weeks.');
    }
    await consult(doc, enc, c);
    if (meds_.length) { await rx(doc, enc, meds_); await dispenseRx(p, enc, dmode === 'card' ? 'debit_card' : dmode); }
    await api(doc, `/encounters/${enc.id}/stage`, { stage: 'closed' }).catch(() => {});
    return enc.encounter_no;
  });
}
await step('Follow-up visit — Mohammed Irfan (2 weeks later, follow-up fee)', async () => {
  const enc = await opVisit(P.mohammed, 'doctor', { followup: true });
  await vitals(enc, {});
  return consult('doctor', enc, { chief_complaint: 'Review — symptoms better', diagnosis: 'Acid peptic disease — improving', plan: 'Continue PPI 2 more weeks', follow_up_date: day(14) });
});
await step('OP credit patient — Lakshmi Devi (pays later)', async () => {
  const p = P.lakshmi = await patient({ name: 'Lakshmi Devi', title: 'Mrs.', gender: 'Female', age_years: 62, dob: '1964-04-04', mobile: '9000100008', blood_group: 'A-', kin_name: 'Suresh', kin_relation: 'Son', kin_mobile: '9000100108', address: '15-3, Old Town', payer_type: 'credit' });
  const r = await api('reception', '/encounters', { patient_id: p.id, doctor_id: uid('doctor'), collect: false });
  await vitals(r.encounter, { bp_sys: 142, bp_dia: 88 });
  return consult('doctor', r.encounter, { chief_complaint: 'Joint pains', diagnosis: 'Osteoarthritis both knees', plan: 'Analgesics, physiotherapy' });
});
await step('OP corporate patient — Kiran Kumar (Demo Infotech, billed to employer after approval)', async () => {
  const pc = payer('DEMO-CORP');
  const p = P.kiran = await patient({ name: 'Kiran Kumar', title: 'Mr.', gender: 'Male', age_years: 33, dob: '1993-09-09', mobile: '9000100009', blood_group: 'O+', kin_name: 'Divya', kin_relation: 'Wife', kin_mobile: '9000100109', address: 'Flat 302, Tech Residency', payer_type: 'corporate', payer_id: pc.id, payer_name: pc.name, policy_no: 'EMP-DEMO-4471' });
  const r = await api('reception', '/encounters', { patient_id: p.id, doctor_id: uid('doctor'), collect: false });
  await vitals(r.encounter, {});
  await consult('doctor', r.encounter, { chief_complaint: 'Annual health check', diagnosis: 'Healthy adult', plan: 'Routine labs' });
  const claim = (await api('tpa.desk', `/insurance/claims?patient_id=${p.id}`).catch(() => [])).find?.((c) => c.patient_id === p.id);
  if (claim) await api('tpa.desk', `/insurance/claims/${claim.id}`, { approved: r.bill?.total || 500, stage_note: 'Employer authorisation letter received (demo)' }, 'PATCH');
  return r.encounter.encounter_no;
});
await step('Patients waiting now — 3 OP registrations awaiting vitals / doctor', async () => {
  const names = [['Pavani', 'Female', 23, '9000100010'], ['Nagaraju', 'Male', 48, '9000100011'], ['Sowmya', 'Female', 31, '9000100012']];
  for (const [name, gender, age, mobile] of names) { const p = await patient({ name, gender, age_years: age, mobile, kin_name: 'Family member', kin_relation: 'Relative', kin_mobile: mobile }); await opVisit(p, name === 'Nagaraju' ? 'dr.cardio' : 'doctor', { mode: 'cash' }); }
  return names.length;
});
await step('Appointments — 4 booked for the coming days', async () => {
  const slots = [[P.venkat, 'dr.cardio', 7, '10:00'], [P.suma, 'doctor', 14, '11:00'], [P.swapna, 'consultant', 28, '10:30'], [P.raviteja, 'dr.ortho', 5, '12:00']];
  for (const [p, doc, d, t] of slots) await api('reception', '/appointments', { patient_id: p.id, doctor_id: uid(doc), slot_start: `${day(d)} ${t}:00` });
  return slots.length;
});

/* ========================================================== 2. IP */
console.log('\n2. In-patients');
await step('IP — Srinivasulu (pneumonia, general ward, advance, labs, X-ray, IP medicines, nursing) — stays admitted', async () => {
  const p = P.srinu = await patient({ name: 'Srinivasulu', title: 'Mr.', gender: 'Male', age_years: 50, dob: '1976-06-15', mobile: '9000100013', blood_group: 'B+', kin_name: 'Rani', kin_relation: 'Wife', kin_mobile: '9000100113', address: '6-90, Weavers Colony', allergy: '' });
  const adm = await admit(p, 'doctor', 'general', { diagnosis: 'Community acquired pneumonia', attendant_name: 'Rani', attendant_relation: 'Wife', attendant_mobile: '9000100113' });
  await advance(adm, 10000, 'cash');
  const enc = { id: adm.encounter_id };
  const ord = await order('doctor', enc, ['LAB-CBC', 'LAB-CRP', 'LAB-RFT', 'IMG-XR-CHEST']);
  await labWork(ord.orders, { 'Total WBC count': 15800, 'CRP (quantitative)': 48 });
  await imagingWork(ord.orders, 'Right lower zone consolidation.');
  await api('pharmacist', '/pharmacy/dispense', { patient_id: p.id, admission_id: adm.id, location: 'IP', items: [{ medicine_id: med('CEFTRI1').id, qty: 2 }, { medicine_id: med('PCMINJ').id, qty: 2 }, { medicine_id: med('NS500').id, qty: 3 }] });
  await api('nurse', '/ipd/nursing/mar', { admission_id: adm.id, drug: 'Inj Ceftriaxone 1 g IV', dose: '1 g', due_at: `${day()} 20:00:00` });
  await api('nurse', '/ipd/nursing/notes', { admission_id: adm.id, kind: 'note', shift: 'evening', body: 'General ward — nursing chart\nVitals: Temp 100.6 °F | Pulse 96 | RR 22 | BP 128/80 | SpO2 94% on 2 L O2\nIntake: oral 600 mL, IV 1000 mL | Output: urine 900 mL\nPatient condition: stable, febrile. Escalation: none.\nShift handover: given to night staff.' });
  await api('nurse', '/pharmacy/indents', { admission_id: adm.id, location: 'IP', lines: [{ medicine_id: med('PAN40').id, qty: 5 }] }).then((ind) => api('pharmacist', `/pharmacy/indents/${ind.id}/dispense`, {}));
  return adm.ip_no;
});
await step('IP — Padma (UTI, admitted → treated → discharged, bill settled)', async () => {
  const p = await patient({ name: 'Padma Kumari', title: 'Mrs.', gender: 'Female', age_years: 58, dob: '1968-12-01', mobile: '9000100014', blood_group: 'O+', kin_name: 'Venu', kin_relation: 'Son', kin_mobile: '9000100114', address: '2-14, Market Road' });
  const adm = await admit(p, 'doctor', 'general', { diagnosis: 'Urinary tract infection', attendant_name: 'Venu', attendant_relation: 'Son', attendant_mobile: '9000100114' });
  await advance(adm, 3000, 'upi');
  const ord = await order('doctor', { id: adm.encounter_id }, ['LAB-CUE', 'LAB-UCS']);
  await labWork(ord.orders, { 'Pus cells': 18 });
  await api('reception', `/ipd/admissions/${adm.id}`, { status: 'discharge_initiated' }, 'PATCH');
  await api('doctor', `/ipd/admissions/${adm.id}/summary`, { diagnosis: 'Urinary tract infection — resolved', finalize: true, sections: { complaints: 'Burning micturition, fever 2 days', course: 'Treated with IV antibiotics; afebrile for 24 h', condition: 'Stable at discharge', medications: 'Tab Cefixime 200 mg 1-0-1 x 5 days', advice: 'Plenty of oral fluids', follow_up_date: day(7) } }, 'PUT');
  await api('doctor', `/ipd/admissions/${adm.id}`, { status: 'clinically_cleared' }, 'PATCH');
  const full = await api('ip.billing', `/ipd/admissions/${adm.id}`);
  for (const b of full.bills.filter((x) => x.balance > 0.005)) await pay(b.bill_type === 'PHARM' ? 'pharmacist' : 'ip.billing', b.id, 'cash');
  const after = await api('ip.billing', `/ipd/admissions/${adm.id}`);
  if (after.balance < -0.5) await api('billing', '/refunds', { bill_id: after.ip_bill_id, amount: -after.balance, mode: 'upi', excess: true }).catch(() => {});
  await api('reception', `/ipd/admissions/${adm.id}/discharge`, { discharge_type: 'routine' });
  return adm.ip_no;
});

/* ========================================================== 3. maternity */
console.log('\n3. Maternity');
await step('Maternity — Bhavya (ANC → labour room → partograph → normal delivery)', async () => {
  const p = P.bhavya = await patient({ name: 'Bhavya Sri', title: 'Mrs.', gender: 'Female', age_years: 27, dob: '1999-04-22', mobile: '9000100015', blood_group: 'A+', kin_name: 'Naresh', kin_relation: 'Husband', kin_mobile: '9000100115', address: '11-2, Nehru Nagar' });
  const enc = await opVisit(p, 'consultant', { mode: 'cash' });
  await vitals(enc, { bp_sys: 118, bp_dia: 76, weight_kg: 68 });
  const ord = await order('consultant', enc, ['LAB-HB', 'LAB-BGRH', 'LAB-HIV', 'LAB-HBSAG']);
  if (ord.bill) await pay('op.billing', ord.bill.id, 'cash');
  await labWork(ord.orders, { Haemoglobin: 10.8 });
  await consult('consultant', enc, { chief_complaint: 'Labour pains since morning, 39 weeks', diagnosis: 'G2P1L1 at 39 weeks in early labour', plan: 'Admit to labour room, partograph' });
  const adm = await admit(p, 'consultant', 'labour', { diagnosis: 'Term pregnancy in labour', attendant_name: 'Naresh', attendant_relation: 'Husband', attendant_mobile: '9000100115' });
  await advance(adm, 8000, 'cash');
  const mc = await api('nurse', '/ipd/maternity', { patient_id: p.id, admission_id: adm.id, gravida: 2, para: 1, living: 1, abortions: 0, gestation_wks: 39, edd: day(3), risk: 'low', stage: 'active_labour' });
  for (const [cx, fhr, con] of [[5, 142, 3], [7, 138, 4], [9, 134, 5]]) await api('nurse', `/ipd/maternity/${mc.id}/partograph`, { cervix_cm: cx, descent: 6 - cx / 2, contractions_10min: con, contraction_strength: con > 3 ? 'strong' : 'moderate', fhr, liquor: 'C', moulding: '0', bp_sys: 120, bp_dia: 78, pulse: 92 });
  await api('nurse', `/ipd/maternity/${mc.id}`, { stage: 'delivered', delivery_type: 'Normal Vaginal Delivery', delivered_at: `${day()} 06:40`, baby_weight: 3.05, baby_sex: 'Male', apgar1: 8, apgar5: 9, notes: 'Uneventful delivery; baby with mother.' }, 'PATCH');
  return adm.ip_no;
});
await step('NICU — Baby of Bhavya Sri (mild jaundice, phototherapy)', async () => {
  const p = await patient({ name: 'Baby of Bhavya Sri', title: 'Baby', gender: 'Male', age_years: 0, age_months: 0, dob: day(), mobile: '9000100015', blood_group: 'A+', kin_name: 'Bhavya Sri', kin_relation: 'Mother', kin_mobile: '9000100015', address: '11-2, Nehru Nagar' });
  const adm = await admit(p, 'dr.peds', 'nicu', { diagnosis: 'Neonatal jaundice for phototherapy', attendant_name: 'Naresh', attendant_relation: 'Father', attendant_mobile: '9000100115' });
  await api('nicu.nurse', '/ipd/nursing/notes', { admission_id: adm.id, kind: 'observation', shift: 'morning', body: 'NICU — nursing chart\nWeight 3050 g | Temp 36.8 °C | HR 142 | RR 46 | SpO2 98%\nPhototherapy started. Feeds: breast milk 2-hourly, tolerating well.' });
  return adm.ip_no;
});

/* ========================================================== 4. emergency */
console.log('\n4. Emergency');
await step('ER — Kishore (road traffic accident → ER care → ICU admission)', async () => {
  const p = await patient({ name: 'Kishore Kumar', title: 'Mr.', gender: 'Male', age_years: 38, dob: '1988-02-11', mobile: '9000100016', blood_group: 'O-', kin_name: 'Prasanthi', kin_relation: 'Wife', kin_mobile: '9000100116', address: 'Highway Road' });
  const er = await api('er.nurse', '/ipd/emergency', { patient_id: p.id, triage: '2', complaint: 'RTA — head injury, chest pain', bp_sys: 96, bp_dia: 62, pulse: 118, spo2: 93, gcs: 13, mlc: 1, brought_by: '108 ambulance crew', arrival_mode: 'Ambulance (108)' });
  for (const name of ['Emergency registration', 'Trauma care', 'IV cannulation', 'ECG', 'Suturing']) {
    const s = meta.services.find((x) => x.category === 'emergency' && x.name.startsWith(name));
    if (s) await api('duty.doctor', `/ipd/emergency/${er.id}/charges`, { service_id: s.id, qty: 1 });
  }
  await api('duty.doctor', `/ipd/emergency/${er.id}/mlc`, { mlc_no: 'MLC-DEMO-0412' });
  const adm = await admit(p, 'duty.doctor', 'icu', { diagnosis: 'Polytrauma — head injury (GCS 13), chest contusion', emergency_id: er.id, admission_type: 'emergency', attendant_name: 'Prasanthi', attendant_relation: 'Wife', attendant_mobile: '9000100116' });
  await api('icu.nurse', '/ipd/nursing/notes', { admission_id: adm.id, kind: 'observation', shift: 'morning', body: 'ICU — nursing chart\nGCS E3V4M6 = 13 | BP 104/66 | HR 110 | SpO2 95% on 4 L O2 | Urine 40 mL/h\nLines: right forearm 18G. Position change 2-hourly. Escalation: none.' });
  return adm.ip_no;
});
await step('ER — Gopal (chest discomfort → observation → discharged from ER)', async () => {
  const p = await patient({ name: 'Gopal Naidu', title: 'Mr.', gender: 'Male', age_years: 45, dob: '1981-10-10', mobile: '9000100017', blood_group: 'B+', kin_name: 'Usha', kin_relation: 'Wife', kin_mobile: '9000100117', address: '5-5, Bus Stand Road' });
  const er = await api('er.nurse', '/ipd/emergency', { patient_id: p.id, triage: '3', complaint: 'Chest discomfort after meal', bp_sys: 132, bp_dia: 84, pulse: 86, spo2: 98 });
  const ecg = meta.services.find((x) => x.category === 'emergency' && /ECG/.test(x.name));
  if (ecg) await api('duty.doctor', `/ipd/emergency/${er.id}/charges`, { service_id: ecg.id, qty: 1 });
  const bills = await api('billing', `/bills?q=${encodeURIComponent(p.uhid)}`);
  for (const b of (bills.rows || bills).filter((x) => x.bill_type === 'ER' && x.balance > 0)) await pay('billing', b.id, 'cash');
  return api('duty.doctor', `/ipd/emergency/${er.id}/close`, { outcome: 'discharged', note: 'ECG normal; gastritis — discharged with antacids' });
});

/* ========================================================== 5. payers */
console.log('\n5. TPA / insurance / Aarogyasri');
await step('TPA — Harika (Demo Star Health; admitted private room; pre-auth approved)', async () => {
  const py = payer('DEMO-STAR');
  const p = await patient({ name: 'Harika Devi', title: 'Mrs.', gender: 'Female', age_years: 40, dob: '1986-07-19', mobile: '9000100018', blood_group: 'AB+', kin_name: 'Sudheer', kin_relation: 'Husband', kin_mobile: '9000100118', address: 'Plot 8, Green Park', payer_type: 'insurance', payer_id: py.id, payer_name: py.name, policy_no: 'STAR-DEMO-778812' });
  const adm = await admit(p, 'doctor', 'private', { diagnosis: 'Acute gastroenteritis with dehydration', financial_category: 'insurance', payer_id: py.id, policy_no: 'STAR-DEMO-778812', attendant_name: 'Sudheer', attendant_relation: 'Husband', attendant_mobile: '9000100118' });
  const full = await api('tpa.desk', `/ipd/admissions/${adm.id}`);
  if (full.claim) await api('tpa.desk', `/insurance/claims/${full.claim.id}`, { estimate: 40000, approved: 30000, policy_no: 'STAR-DEMO-778812', stage_note: 'Initial pre-auth approved ₹30,000; enhancement to be requested with final bill' }, 'PATCH');
  return adm.ip_no;
});
await step('TPA — Ramesh Babu (Demo MD India TPA; treated, discharged, claim submitted, short-settled)', async () => {
  const py = payer('DEMO-MDI');
  const p = await patient({ name: 'Ramesh Babu', title: 'Mr.', gender: 'Male', age_years: 52, dob: '1974-03-03', mobile: '9000100019', blood_group: 'A+', kin_name: 'Vani', kin_relation: 'Wife', kin_mobile: '9000100119', address: '3-3, Canal Road', payer_type: 'insurance', payer_id: py.id, payer_name: py.name, policy_no: 'MDI-DEMO-55021' });
  const adm = await admit(p, 'doctor', 'semi_private', { diagnosis: 'Dengue fever with thrombocytopenia', financial_category: 'insurance', payer_id: py.id, policy_no: 'MDI-DEMO-55021' });
  const ord = await order('doctor', { id: adm.encounter_id }, ['LAB-CBC', 'LAB-DENGUE']);
  await labWork(ord.orders, { 'Platelet count': 62000, 'NS1 antigen': 'Positive' });
  let full = await api('tpa.desk', `/ipd/admissions/${adm.id}`);
  await api('tpa.desk', `/insurance/claims/${full.claim.id}`, { estimate: 25000, approved: 25000, stage_note: 'Pre-auth approved' }, 'PATCH');
  await api('reception', `/ipd/admissions/${adm.id}`, { status: 'discharge_initiated' }, 'PATCH');
  await api('doctor', `/ipd/admissions/${adm.id}/summary`, { diagnosis: 'Dengue fever — recovered', finalize: true, sections: { complaints: 'Fever, myalgia 4 days', course: 'Supportive care; platelets recovered to 1.4 lakh', condition: 'Stable', advice: 'Oral fluids, avoid NSAIDs', follow_up_date: day(5) } }, 'PUT');
  await api('doctor', `/ipd/admissions/${adm.id}`, { status: 'clinically_cleared' }, 'PATCH');
  await api('reception', `/ipd/admissions/${adm.id}/discharge`, { discharge_type: 'routine' });
  await api('tpa.desk', `/insurance/claims/${full.claim.id}`, { status: 'claim_submitted', stage_note: 'Final bill and discharge summary submitted to TPA' }, 'PATCH');
  const recv = await api('accounts', `/accounts/receivables?claim_id=${full.claim.id}&status=all`);
  const r = (recv.rows || []).find((x) => x.open > 0);
  if (r) await api('finance.manager', `/accounts/receivables/${r.id}/receive`, { amount: Math.max(1, r.open - 750), disallowed: 750, disallowance_action: 'write_off', mode: 'bank_transfer', reference: 'NEFT-DEMO-90311' });
  return adm.ip_no;
});
await step('Aarogyasri — Yellamma (admitted general ward; pre-auth pending with the Insurance desk)', async () => {
  const py = payer('DEMO-ARG');
  const p = await patient({ name: 'Yellamma', title: 'Mrs.', gender: 'Female', age_years: 48, dob: '1978-01-01', mobile: '9000100020', blood_group: 'O+', kin_name: 'Chinna', kin_relation: 'Son', kin_mobile: '9000100120', address: 'Kothapalli village', payer_type: 'aarogyasri', payer_id: py.id, payer_name: py.name, policy_no: 'ARG-DEMO-WHITE-0098' });
  const adm = await admit(p, 'senior.doctor', 'general', { diagnosis: 'Symptomatic gallstones — planned laparoscopic cholecystectomy', financial_category: 'aarogyasri', payer_id: py.id, policy_no: 'ARG-DEMO-WHITE-0098' });
  return adm.ip_no;
});

/* ========================================================== 6. OT */
console.log('\n6. Operation theatre');
await step('OT — Satish (inguinal hernia: admit → OT → recovery → post-op ward)', async () => {
  const p = await patient({ name: 'Satish Chandra', title: 'Mr.', gender: 'Male', age_years: 47, dob: '1979-05-05', mobile: '9000100021', blood_group: 'B+', kin_name: 'Geetha', kin_relation: 'Wife', kin_mobile: '9000100121', address: '8-21, Bank Street' });
  const adm = await admit(p, 'senior.doctor', 'general', { diagnosis: 'Right inguinal hernia', attendant_name: 'Geetha', attendant_relation: 'Wife', attendant_mobile: '9000100121' });
  await advance(adm, 20000, 'debit_card');
  const ot = await api('ot.incharge', '/ipd/ot', { patient_id: p.id, admission_id: adm.id, procedure: 'Open mesh hernioplasty (right)', theatre: 'OT-1 Major', scheduled_at: `${day()} 09:00`, surgeon_id: uid('senior.doctor'), anaesthetist_id: uid('doctor'), anaesthesia: 'Spinal', duration_min: 75,
    charges: [{ description: 'Surgeon fee', rate: 15000, role: 'surgeon' }, { description: 'Anaesthetist fee', rate: 5000, role: 'anaesthetist' }, { service_id: svc('OT-MAJOR').id }] });
  await api('ot.incharge', `/ipd/ot/${ot.id}`, { consent: 1, checklist: { consent: true, site_marked: true, fasting: true, allergy: true, antibiotic: true, count: true }, notes: 'WHO checklist complete' }, 'PATCH');
  for (const s of ['pre_op', 'in_theatre', 'recovery', 'completed']) await api('ot.incharge', `/ipd/ot/${ot.id}`, { status: s }, 'PATCH');
  const beds = (await api('reception', '/ipd/beds')).beds;
  const pow = beds.find((b) => b.status === 'vacant' && b.ward_kind === 'postop');
  if (pow) await api('nursing.supervisor', `/ipd/admissions/${adm.id}`, { bed_id: pow.id }, 'PATCH');
  return adm.ip_no;
});
await step('OT — Rajeshwari (laparoscopic cholecystectomy booked for tomorrow)', async () => {
  const p = await patient({ name: 'Rajeshwari', title: 'Mrs.', gender: 'Female', age_years: 55, dob: '1971-09-09', mobile: '9000100022', blood_group: 'A+', kin_name: 'Mohan', kin_relation: 'Husband', kin_mobile: '9000100122', address: '1-1, Fort Road' });
  return api('ot.incharge', '/ipd/ot', { patient_id: p.id, procedure: 'Laparoscopic cholecystectomy', theatre: 'OT-2 Major', scheduled_at: `${day(1)} 10:00`, surgeon_id: uid('senior.doctor'), anaesthetist_id: uid('doctor'), anaesthesia: 'General', duration_min: 90 });
});
await step('PICU — Charan (4 y, bronchiolitis, nebulisation)', async () => {
  const p = await patient({ name: 'Charan Tej', title: 'Master', gender: 'Male', age_years: 4, dob: '2022-03-12', mobile: '9000100023', blood_group: 'O+', kin_name: 'Anusha', kin_relation: 'Mother', kin_mobile: '9000100023', address: '6-6, Teachers Colony' });
  const adm = await admit(p, 'dr.peds', 'picu', { diagnosis: 'Acute bronchiolitis with respiratory distress', attendant_name: 'Anusha', attendant_relation: 'Mother', attendant_mobile: '9000100023' });
  await api('picu.nurse', '/ipd/nursing/notes', { admission_id: adm.id, kind: 'observation', shift: 'night', body: 'PICU — nursing chart\nWeight 15 kg | HR 128 | RR 42 | SpO2 95% on 1 L O2 | Temp 99.4 °F\nNebulisation with salbutamol given 6-hourly. Parent informed.' });
  return adm.ip_no;
});

/* ========================================================== 7. back office */
console.log('\n7. Accounts & maintenance');
await step('Expenses — 3 vouchers', async () => {
  for (const [head, amount, mode, vendor] of [['Electricity', 48500, 'bank_transfer', 'APSPDCL (demo)'], ['Housekeeping supplies', 6200, 'cash', 'Clean Care Agencies (demo)'], ['Diesel for DG set', 12800, 'upi', 'Highway Fuels (demo)']])
    await api('accounts', '/finance/expenses', { head, amount, mode, vendor, spent_on: day(), remarks: 'Demo expense' });
  return 3;
});
await step('Maintenance tickets — 3 reported, 1 assigned, 1 resolved', async () => {
  const assets = await api('maintenance', '/maintenance/assets');
  const a = (code) => assets.find((x) => x.asset_code === code)?.id;
  const t1 = await api('icu.nurse', '/maintenance/tickets', { asset_id: a('AST-0002'), title: 'Monitor SpO2 module showing intermittent error', priority: 'high', location: 'ICU bed 02' });
  const t2 = await api('ward.incharge', '/maintenance/tickets', { asset_id: a('AST-0016'), title: 'AC not cooling in male ward', priority: 'normal' });
  const t3 = await api('lab.manager', '/maintenance/tickets', { asset_id: a('AST-0013'), title: 'Analyser calibration overdue', priority: 'normal' });
  await api('maintenance', `/maintenance/tickets/${t1.id}`, { status: 'assigned', assigned_to: uid('maintenance') }, 'PATCH');
  await api('maintenance', `/maintenance/tickets/${t3.id}`, { status: 'resolved', resolution: 'Calibrated with control material; QC passed (demo).', assigned_to: uid('maintenance') }, 'PATCH');
  return [t1.ticket_no, t2.ticket_no, t3.ticket_no].join(', ');
});

console.log(`\nDone: ${ok} steps ok, ${failed} failed.`);
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', `DEMO-WORKFLOW-SEED-${day()}.json`), JSON.stringify({ base: BASE, ok, failed, steps: report }, null, 2));
process.exit(failed ? 2 : 0);
