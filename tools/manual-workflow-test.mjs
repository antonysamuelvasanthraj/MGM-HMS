/**
 * Manual workflow + billing window regression on a disposable copy of the live database:
 *   node tools/manual-workflow-test.mjs   (needs DEMO-LOGINS.local.md)
 * Reception lab billing (walk-in and on a visit), paper-prescription pharmacy sale, line and bill
 * discounts (raise / lower / limits / permissions), self-pay OP package, lab report fields, settings off.
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(import.meta.dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-manual-'));
{ const live = new DatabaseSync(path.join(root, 'data/surelyhms.db'), { readOnly: true }); live.exec(`VACUUM INTO '${path.join(S, 'surelyhms.db').split(path.sep).join('/')}'`); live.close(); }
const PORT = +(process.env.HMS_TEST_PORT || 4394), B = `http://127.0.0.1:${PORT}/api`;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), SURELY_DATA: S, HMS_ENV: 'demo' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errOut = ''; srv.stderr.on('data', (d) => errOut += d);
for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
const md = fs.readFileSync(path.join(root, 'DEMO-LOGINS.local.md'), 'utf8');
const pw = Object.fromEntries([...md.matchAll(/`([^`]+)`\s*\|\s*`([^`]+)`/g)].map((m) => [m[1], m[2]]));
const tok = {}; const as = async (u) => tok[u] ||= (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw[u] }) })).json()).token;
async function api(u, p, body, method) { const r = await fetch(B + p, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', 'X-Session': await as(u) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }
const ok = async (p, msg) => { const r = await p; assert.equal(r.s, 200, `${msg}: ${r.s} ${JSON.stringify(r.j).slice(0, 300)}`); return r.j; };
const log = [];
try {
  const meta = await ok(api('reception', '/meta'), 'meta');
  const svc = (code) => meta.services.find((s) => s.code === code);
  for (const c of ['LAB-VITD', 'LAB-B12', 'LAB-THY', 'LAB-IRON', 'LAB-CA125']) assert.ok(svc(c), `catalogue has ${c}`);
  assert.ok(svc('LAB-TSH').report_comment && svc('LAB-THY').report_comment_title, 'interpretation text filled');
  log.push('1 catalogue: new tests present with interpretation comments');

  // start from the portal workflow whatever mode the live hospital is in today
  await ok(api('hosp.admin', '/settings', { workflow_lab: 'doctor', workflow_pharmacy: 'eprescription', workflow_doctor: 'portal' }, 'PATCH'), 'portal mode');
  // reception billing of tests is off in portal mode
  let r =await api('reception', '/reception/diagnostics', { patient_id: 1, referred_by: 'x', items: [{ service_id: svc('LAB-VITD').id }] });
  assert.equal(r.s, 409); assert.equal(r.j.error, 'reception_lab_billing_disabled');
  await ok(api('hosp.admin', '/settings', { workflow_lab: 'reception', workflow_pharmacy: 'manual', workflow_doctor: 'manual' }, 'PATCH'), 'manual on');

  // walk-in: new patient, no visit today -> diagnostics-only visit
  const p = await ok(api('reception', '/patients', { name: 'Workflow Walkin ' + Date.now(), gender: 'Female', age_years: 31, mobile: '9000777001' }), 'patient');
  r = await api('reception', '/reception/diagnostics', { patient_id: p.id, items: [{ service_id: svc('LAB-VITD').id }] });
  assert.equal(r.s, 400); assert.equal(r.j.error, 'referred_by_required');
  r = await api('reception', '/reception/diagnostics', { patient_id: p.id, referred_by: 'Dr. Outside', items: [{ service_id: meta.services.find((s) => s.category === 'consultation').id }] });
  assert.equal(r.s, 400); assert.equal(r.j.error, 'lab_or_imaging_only');
  const dx = await ok(api('reception', '/reception/diagnostics', { patient_id: p.id, referred_by: 'Dr. Outside, City Clinic', items: [{ service_id: svc('LAB-VITD').id, priority: 'urgent' }, { service_id: svc('LAB-THY').id }] }), 'walk-in tests');
  assert.ok(dx.created_visit); assert.equal(dx.orders.length, 2); assert.equal(dx.orders[0].referred_by, 'Dr. Outside, City Clinic'); assert.equal(dx.orders[0].priority, 'urgent');
  assert.equal(dx.bill.total, svc('LAB-VITD').price + svc('LAB-THY').price);
  r = await api('lab.tech', '/reception/diagnostics', { patient_id: p.id, referred_by: 'x', items: [{ service_id: svc('LAB-VITD').id }] }); assert.equal(r.s, 403);
  log.push(`2 walk-in tests: visit ${dx.encounter.encounter_no} created, 2 orders (referred by outside doctor), bill ₹${dx.bill.total}; guards 400/400/403`);

  // line + bill discount on that bill
  const bill = dx.bill.id; const items = (await ok(api('billing', `/bills/${bill}`), 'bill')).items;
  const vit = items.find((i) => /Vitamin D/.test(i.description));
  r = await api('billing', `/bills/${bill}/items/${vit.id}/discount`, { discount: 150 }, 'PATCH'); assert.equal(r.s, 400, 'reason needed ' + JSON.stringify(r.j));
  await ok(api('billing', `/bills/${bill}/items/${vit.id}/discount`, { discount_pct: 10, reason: 'Senior citizen', approved_by: 'Dr. Suresh Babu' }, 'PATCH'), 'line discount');
  let b = await ok(api('billing', `/bills/${bill}`), 'bill2'); assert.equal(b.items.find((i) => i.id === vit.id).amount, vit.amount - 150);
  r = await api('billing', `/bills/${bill}/items/${vit.id}/discount`, { discount: 999999, reason: 'x' }, 'PATCH'); assert.equal(r.s, 400, 'above line value');
  await ok(api('billing', `/bills/${bill}`, { discount: 100, discount_reason: 'Staff family — approved by Admin' }, 'PATCH'), 'bill discount');
  await ok(api('billing', `/bills/${bill}`, { discount: 40, discount_reason: 'Reduced — approved by Admin' }, 'PATCH'), 'bill discount lowered');
  b = await ok(api('billing', `/bills/${bill}`), 'bill3'); assert.equal(b.discount, 40); assert.equal(b.balance, dx.bill.total - 150 - 40);
  r = await api('lab.tech', `/bills/${bill}/items/${vit.id}/discount`, { discount: 10, reason: 'x' }, 'PATCH'); assert.equal(r.s, 403);
  await ok(api('billing', `/bills/${bill}/items/${vit.id}/discount`, { discount: 0, reason: 'Removed' }, 'PATCH'), 'line discount removed');
  b = await ok(api('billing', `/bills/${bill}`), 'bill4'); assert.equal(b.items.find((i) => i.id === vit.id).amount, vit.amount);
  log.push('3 discounts: line 10% (reason+approver), over-limit 400, bill ₹100 then lowered to ₹40, lab 403, line removed');

  // pay, then a further discount cannot go below what is paid
  await ok(api('billing', `/bills/${bill}/settle`, { request_key: 'pay-mw-' + Date.now(), lines: [{ mode: 'cash', amount: b.balance }] }), 'pay');
  r = await api('billing', `/bills/${bill}/items/${vit.id}/discount`, { discount: 100, reason: 'late', approved_by: 'x' }, 'PATCH'); assert.equal(r.s, 409); assert.equal(r.j.error, 'discount_exceeds_balance');
  log.push('4 paid bill: further discount refused (refund instead)');

  // self-pay OP package from the payment window
  const v = await ok(api('reception', '/encounters', { patient_id: p.id, doctor_id: meta.doctors[0].id }), 'visit');
  const pk = (await ok(api('billing', '/packages'), 'packages')); const pkg = (pk.rows || pk).find((k) => k.active && !k.payer_id && /Fever|check/i.test(k.name));
  const pr = await ok(api('billing', `/bills/${v.bill.id}/package`, { package_id: pkg.id }), 'package');
  assert.ok(pr.bill.items.some((i) => /Package —/.test(i.description))); assert.ok(pr.bill.package_id);
  r = await api('billing', `/bills/${v.bill.id}/package`, { package_id: pkg.id }); assert.equal(r.s, 409);
  log.push(`5 OP package "${pkg.name}" applied to self-pay bill; second package 409`);

  // pharmacy: paper prescription
  const st = await ok(api('pharmacist', '/pharmacy/stock?location=OP'), 'stock'); const batch = (st.rows || st).find((x) => x.qty > 5);
  const sale = await ok(api('pharmacist', '/pharmacy/dispense', { patient_id: p.id, location: 'OP', rx_doctor_id: meta.doctors[0].id, rx_note: 'Rx dated today', collect: false,
    items: [{ medicine_id: batch.medicine_id, batch_id: batch.batch_id || batch.id, qty: 1, rate: batch.mrp || batch.rate || 10 }] }), 'paper rx sale');
  assert.match(sale.bill.rx_note, /Paper Rx: .* · Rx dated today/); assert.equal(sale.bill.doctor_id, meta.doctors[0].id); assert.ok(sale.bill.encounter_id, 'filed under today\'s visit');
  log.push(`6 pharmacy paper-Rx sale ${sale.bill.bill_no}: "${sale.bill.rx_note}", linked to visit`);

  // lab report payload
  const o = dx.orders.find((x) => /Thyroid/.test(x.label));
  await ok(api('lab.manager', `/orders/${o.id}`, { status: 'collected' }, 'PATCH'), 'collect');
  const params = await ok(api('lab.manager', `/lab/params?service_id=${svc('LAB-THY').id}`), 'params');
  await ok(api('lab.manager', `/lab/orders/${o.id}/results`, { results: params.map((x, i) => ({ param_id: x.id, value: ['1.37', '9.41', '3.73'][i] })), verify: true, remarks: 'Non-fasting sample' }), 'results');
  const rep = await ok(api('lab.manager', `/lab/report/${o.id}`), 'report');
  assert.equal(rep.lab_remarks, 'Non-fasting sample'); assert.ok(rep.test_comment.includes('TSH')); assert.equal(rep.referred_by_name, 'Dr. Outside, City Clinic');
  assert.ok(rep.settings.lab_report_disclaimer && !('sms_gateway_url' in rep.settings), 'report settings limited');
  log.push('7 lab report: remarks, interpretation, referred-by, disclaimer; no other settings exposed');

  // a walk-in's tests-only visit closes once its last test is done
  const vit2 = dx.orders.find((x) => /Vitamin D/.test(x.label));
  await ok(api('lab.manager', `/orders/${vit2.id}`, { status: 'collected' }, 'PATCH'), 'collect vit');
  const vp = await ok(api('lab.manager', `/lab/params?service_id=${svc('LAB-VITD').id}`), 'vit params');
  await ok(api('lab.manager', `/lab/orders/${vit2.id}/results`, { results: vp.map((x) => ({ param_id: x.id, value: '20.1' })), verify: true }), 'vit results');
  const ev = await ok(api('reception', `/encounters/${dx.encounter.id}`), 'walk-in visit');
  assert.equal(ev.stage, 'closed', 'tests-only visit closes'); log.push('7b tests-only visit closed once both reports were verified');

  // an admitted patient's tests go on the running IP bill, not a new OP bill
  const beds = await ok(api('reception', '/ipd/beds'), 'beds'); const bed = beds.beds.find((x) => x.status === 'vacant' && x.ward_kind === 'general');
  const ip = await ok(api('reception', '/patients', { name: 'Workflow Inpatient ' + Date.now(), gender: 'Male', age_years: 55, mobile: '9000777002' }), 'ip patient');
  const adm = await ok(api('reception', '/ipd/admissions', { patient_id: ip.id, bed_id: bed.id, consultant_id: meta.doctors[0].id, financial_category: 'self', diagnosis: 'Observation' }), 'admit');
  const ipx = await ok(api('reception', '/reception/diagnostics', { patient_id: ip.id, doctor_id: meta.doctors[0].id, items: [{ service_id: svc('LAB-B12').id }] }), 'ip tests');
  assert.equal(ipx.encounter.id, adm.encounter_id, 'tests filed on the admission');
  assert.equal(ipx.bill.bill_type, 'IP', 'running IP bill'); assert.equal(ipx.orders[0].status, 'ordered', 'not held for payment');
  assert.ok(!ipx.created_visit);
  log.push('7c admitted patient: tests on the running IP bill, released to the lab at once');

  // books
  const d = new DatabaseSync(path.join(S, 'surelyhms.db'), { readOnly: true }); const bk = d.prepare('SELECT round(sum(debit),2) d, round(sum(credit),2) c FROM journal_lines').get(); d.close();
  assert.ok(Math.abs(bk.d - bk.c) < 0.01, 'books balanced');
  const integ = await ok(api('hosp.admin', '/accounts/integrity'), 'integrity'); assert.ok(integ.ok, JSON.stringify(integ).slice(0, 200));
  log.push(`8 books balanced ${bk.d}=${bk.c}; integrity ok`);
  console.log(log.join('\n')); console.log('ALL MANUAL-WORKFLOW CHECKS PASSED');
} catch (e) { console.log(log.join('\n')); console.error('FAIL', e.message); process.exitCode = 1; } finally { srv.kill(); if (errOut.trim()) console.log('server stderr:', errOut.slice(0, 800)); }
