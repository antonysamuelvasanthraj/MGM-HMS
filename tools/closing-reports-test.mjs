/**
 * Whole-visit pass and the month-closing reports: OP visit, tests billed at reception (CT, 2D echo, X-ray, CBC),
 * ambulance, admission → charge → deposit → discharge, expenses, refund, cash handover, then every closing report.
 * Runs against its own temporary server and database, never the hospital's.
 *   node tools/closing-reports-test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const dataDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'surelyhms-test-closing-'));
const port = String(Number(process.env.HMS_TEST_PORT || 4399) + 9);
const fx = spawnSync(process.execPath, ['tools/fixtures/hospital.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', SURELY_DATA: dataDir }, encoding: 'utf8' });
if (fx.status !== 0) throw new Error('Fixture load failed: ' + fx.stdout + fx.stderr);
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, SURELY_DATA: dataDir, PORT: port }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
let failed = 0;
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start: ' + log)), 30000);
    server.stdout.on('data', () => { if (log.includes('sign in')) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => { clearTimeout(t); reject(new Error('server exited ' + c + ': ' + log)); });
  });
  const B = `http://localhost:${port}/api`;
  const out = [];
  const ok = (name, pass, detail = '') => { out.push(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + detail : ''}`); };
  const login = async (u, p) => (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).token;
  const call = async (t, path, body, method) => { const r = await fetch(B + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'X-Session': t }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const key = () => 'e2e-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  const A = await login('admin', 'surely');
  await call(A, '/admin/operating-mode', { mode: 'hybrid', reason: 'Closing-reports test', confirm: true });   // reception may bill tests from a paper slip
  const recp = (await call(A, '/meta')).j.departments.find((d) => d.code === 'RECP');
  await call(A, '/admin/users', { username: 'e2e.desk', password: 'e2e-desk-1', name: 'E2E Desk', role: 'front_office', department_id: recp.id, designation: 'Desk' });
  const R = await login('e2e.desk', 'e2e-desk-1');
  ok('logins', !!A && !!R);
  const me = (await call(A, '/auth/me')).j; const adminId = me.user?.id || me.id || 1;
  const meta = (await call(A, '/meta')).j;
  const svc = (c) => meta.services.find((s) => s.code === c);
  const doc = meta.doctors.find((d) => d.role === 'doctor') || meta.doctors[0];
  const ts = String(Date.now()).slice(-7);

  // referral + patient + OP visit
  const ref = await call(A, '/referral-sources', { kind: 'hospital', name: 'E2E Lakshmi Dinesh Hospital ' + ts });
  ok('referral source created', ref.s === 200, ref.s !== 200 ? JSON.stringify(ref.j) : '');
  const pt = await call(R, '/patients', { name: 'E2E Patient ' + ts, gender: 'Male', age_years: 52, mobile: '97' + ts.padStart(8, '1'), address: 'Srikalahasti', referral_hospital_id: ref.j.id });
  ok('patient registered with referral', pt.s === 200, pt.s !== 200 ? JSON.stringify(pt.j) : pt.j.uhid);
  const visit = await call(R, '/encounters', { patient_id: pt.j.id, doctor_id: doc.id, visit_type: 'new' });
  ok('OP visit registered', visit.s === 200, visit.j.bill ? `fee bill ${visit.j.bill.total}` : `no fee set for this doctor (${visit.j.encounter?.free_reason || ''})`);
  if (visit.j.bill) { const payOp = await call(R, `/bills/${visit.j.bill.id}/settle`, { request_key: key(), lines: [{ mode: 'cash', amount: visit.j.bill.total }], category: 'self' });
    ok('OP fee paid cash', payOp.s === 200 && payOp.j.bill?.balance === 0, payOp.s !== 200 ? JSON.stringify(payOp.j) : ''); }

  // diagnostics from the paper slip: CT, 2D echo, X-ray, CBC
  const dx = await call(R, '/reception/diagnostics', { patient_id: pt.j.id, encounter_id: visit.j.encounter.id, doctor_id: doc.id, items: ['IMG-CTB', 'IMG-2DE', 'IMG-XCH', 'LAB-CBC'].map((c) => ({ service_id: svc(c).id, priority: 'routine' })) });
  ok('reception bills CT + echo + X-ray + CBC', dx.s === 200, dx.s !== 200 ? JSON.stringify(dx.j) : `bill ${dx.j.bill?.total}`);
  const payDx = await call(R, `/bills/${dx.j.bill.id}/settle`, { request_key: key(), lines: [{ mode: 'upi', amount: dx.j.bill.total, reference: 'UPI' + ts }], category: 'self' });
  ok('diagnostics paid UPI', payDx.s === 200 && payDx.j.bill?.balance === 0, payDx.s !== 200 ? JSON.stringify(payDx.j) : '');

  // ambulance bill
  const amb = await call(R, '/bills', { patient_id: pt.j.id, bill_type: 'OP', items: [{ service_id: svc('AMB-TPT').id, qty: 1 }] });
  ok('ambulance bill raised', amb.s === 200, amb.s !== 200 ? JSON.stringify(amb.j) : `total ${amb.j.total ?? amb.j.bill?.total}`);
  const ambBill = amb.j.bill || amb.j;
  if (amb.s === 200) { const p = await call(R, `/bills/${ambBill.id}/settle`, { request_key: key(), lines: [{ mode: 'cash', amount: ambBill.total }], category: 'self' }); ok('ambulance paid', p.s === 200, p.s !== 200 ? JSON.stringify(p.j) : ''); }

  // admission → charge → deposit → clear → discharge
  const beds = (await call(A, '/ipd/beds')).j; const bed = beds.beds.find((b) => b.status === 'vacant');
  const adm = await call(A, '/ipd/admissions', { patient_id: pt.j.id, bed_id: bed.id, consultant_id: doc.id, diagnosis: 'E2E tibia fracture' });
  ok('admission', adm.s === 200, adm.s !== 200 ? JSON.stringify(adm.j) : adm.j.ip_no);
  if (adm.s === 200) {
    const cat = (await call(A, '/ipd/charge-catalog')).j; const mon = cat.find((c) => c.code === 'IPC-MON');
    const chg = await call(A, `/ipd/admissions/${adm.j.id}/charges`, { service_id: mon.id });
    ok('IP charge added', chg.s === 200, chg.s !== 200 ? JSON.stringify(chg.j) : '');
    let ch = (await call(A, `/ipd/admissions/${adm.j.id}/charges`)).j;
    ok('running IP bill exists', ch.bill?.total > 0, `total ${ch.bill?.total}`);
    const list = (await call(A, '/reports/run/ip_patient_list')).j;
    ok('in-patient list shows the admission', list.rows?.some((r) => r.uhid === pt.j.uhid), `rows ${list.rows?.length}`);
    const dep = await call(R, `/bills/${ch.bill.id}/settle`, { request_key: key(), lines: [{ mode: 'cash', amount: ch.bill.total + 500 }] });
    ok('IP deposit above balance accepted', dep.s === 200, dep.s !== 200 ? JSON.stringify(dep.j) : '');
    const blocked = await call(A, `/ipd/admissions/${adm.j.id}/discharge`, { discharge_summary: 'x' });
    ok('discharge blocked until clearance / excess returned', blocked.s === 409, `${blocked.s} ${blocked.j.error || ''}`);
    const rf = await call(R, '/refunds', { bill_id: ch.bill.id, amount: 500, mode: 'cash', excess: true });
    ok('excess deposit refunded', rf.s === 200, rf.s !== 200 ? JSON.stringify(rf.j) : '');
    const clr = await call(A, `/ipd/admissions/${adm.j.id}`, { status: 'clinically_cleared' }, 'PATCH');
    ok('clinically cleared', clr.s === 200, clr.s !== 200 ? JSON.stringify(clr.j) : '');
    const dis = await call(A, `/ipd/admissions/${adm.j.id}/discharge`, { discharge_summary: 'E2E discharge summary' });
    ok('discharged', dis.s === 200, dis.s !== 200 ? JSON.stringify(dis.j) : '');
    const bedAfter = (await call(A, '/ipd/beds')).j.beds.find((b) => b.id === bed.id);
    ok('bed goes to cleaning', bedAfter.status === 'cleaning', bedAfter.status);
  }

  // expenses: a cut and fuel, approved and paid in cash
  for (const [head, remarks, amount] of [['Ambulance technician cuts', 'TPT trip ' + pt.j.uhid, 500], ['Diesel — ambulance', 'AP39TY3097', 3000], ['OT doctors tea', 'snacks', 60]]) {
    const e = await call(A, '/finance/expenses', { head, remarks, amount, mode: 'cash', vendor: 'E2E' });
    const a1 = await call(A, '/finance/expenses/' + e.j.id, { status: 'approved' }, 'PATCH'); const a2 = await call(A, '/finance/expenses/' + e.j.id, { status: 'paid' }, 'PATCH');
    ok(`expense "${head}" entered, approved, paid`, e.s === 200 && a1.s === 200 && a2.s === 200, [e, a1, a2].filter((x) => x.s !== 200).map((x) => JSON.stringify(x.j)).join(' '));
  }

  // handover: reception hands the day's collection to the administrator
  const hv = (await call(R, '/desk/handover')).j;
  const exp = hv.expected?.modes || hv.modes || hv.expected || {};
  const ho = await call(R, '/desk/handover', { handed_to: adminId, declared: exp, notes: 'E2E handover' });
  ok('cash handover to administrator', ho.s === 200, ho.s !== 200 ? JSON.stringify(ho.j).slice(0, 200) + ' expected=' + JSON.stringify(exp) : ho.j.handover_no);

  // reports
  const q = `from=${new Date().toISOString().slice(0, 4)}-01-01&to=2099-12-31`;
  for (const id of ['doctor_department_matrix', 'cash_closing_reception', 'cash_closing_pharmacy', 'cash_handover_register', 'expense_daybook', 'expense_head_summary', 'cuts_register', 'fuel_register', 'ambulance_register', 'due_list_month', 'ip_patient_list', 'referral_statement', 'revenue_today_departments']) {
    const r = await call(A, `/reports/run/${id}?${q}`);
    ok(`report ${id}`, r.s === 200, r.s !== 200 ? JSON.stringify(r.j) : `rows ${r.j.rows.length} | ${(r.j.kpis || []).map((k) => k.label + '=' + k.value).join(', ')}`);
  }
  const dept = (await call(A, `/reports/run/revenue_today_departments?${q}`)).j, mx = (await call(A, `/reports/run/doctor_department_matrix?${q}`)).j;
  ok('matrix total = department total', Math.abs(dept.kpis[3].value - mx.kpis[0].value) < 0.01, `${mx.kpis[0].value} vs ${dept.kpis[3].value}`);
  const integ = (await call(A, '/accounts/integrity')).j;
  ok('books balanced after the whole flow', integ.ok === true, JSON.stringify(integ).slice(0, 120));
  failed = out.filter((x) => x.startsWith('FAIL')).length;
  if (failed) console.log(out.filter((x) => x.startsWith('FAIL')).join('\n'));
  console.log(`${failed ? 'FAIL' : 'PASS'} closing reports and whole-visit flow: ${out.length - failed} of ${out.length} checks`);
} finally {
  server.kill();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp folder still locked */ }
}
if (failed) process.exit(1);
