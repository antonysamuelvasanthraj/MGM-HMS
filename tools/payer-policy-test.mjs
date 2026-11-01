/**
 * Phase 5 regression — insurance policy terms and paper clinical documents, on a disposable copy:
 *   node tools/payer-policy-test.mjs   (needs DEMO-LOGINS.local.md)
 * ₹50,000 bill → ₹40,000 payer / ₹10,000 patient via room-rent limit + proportional deduction +
 * pharmacy sub-limit; deductible + co-pay % through payer billing and the collection desk;
 * statements; validation; paper forms in Paperless (downtime reason) and Paper mode.
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(import.meta.dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'surelyhms-test-policy-'));
const fixture=spawnSync(process.execPath,['tools/fixtures/hospital.mjs'],{cwd:root,env:{...process.env,SURELY_DATA:S,NODE_ENV:'test'},encoding:'utf8',windowsHide:true});assert.equal(fixture.status,0,fixture.stderr);
const PORT = +(process.env.HMS_TEST_PORT || 4389), B = `http://127.0.0.1:${PORT}/api`;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), SURELY_DATA: S, HMS_ENV: 'demo' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errOut = ''; srv.stderr.on('data', (d) => errOut += d);
for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
const aliases={'hosp.admin':'admin','tpa.desk':'insurance','pharmacy.manager':'pharmacy'};
const tok = {}; const as = async (u) => tok[u] ||= (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: aliases[u]||u, password: 'surely' }) })).json()).token;
async function api(u, p, body, method) { const r = await fetch(B + p, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', 'X-Session': await as(u) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }
const ok = async (p, msg) => { const r = await p; assert.equal(r.s, 200, `${msg}: ${r.s} ${JSON.stringify(r.j).slice(0, 300)}`); return r.j; };
const err = async (p, status, code, msg) => { const r = await p; assert.equal(r.s, status, `${msg}: ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`); if (code) assert.equal(r.j.error, code, msg); return r.j; };
const db = () => new DatabaseSync(path.join(S, 'surelyhms.db'));
const log = [];
try {
  await ok(api('hosp.admin','/admin/users',{username:'insurance',name:'Isolated insurance reviewer',role:'insurance',password:'surely'}),'insurance test user');
  // 1 the ₹50,000 case
  const p = await ok(api('reception', '/patients', { name: 'Policy Split ' + Date.now(), gender: 'Male', age_years: 58, mobile: '9000781001' }), 'patient');
  const claim = await ok(api('tpa.desk', '/insurance/claims', { patient_id: p.id, tpa: 'Star Health (test)', policy_no: 'SH-TEST-1', estimate: 50000 }), 'claim');
  { const d = db();
    const bid = d.prepare("INSERT INTO bills (bill_no, patient_id, bill_type, status, payer_type, claim_id, created_by) VALUES (?, ?, 'IP', 'unpaid', 'insurance', ?, 1)").run(`BL-POLICY-${Date.now()}`, p.id, claim.id).lastInsertRowid;
    const ins = d.prepare('INSERT INTO bill_items (bill_id, description, category, qty, rate, amount) VALUES (?,?,?,?,?,?)');
    ins.run(bid, 'Private room — 4 days', 'bed', 4, 5000, 20000);
    ins.run(bid, 'Consultant visits', 'consultation', 1, 10000, 10000);
    ins.run(bid, 'Pharmacy — medicines', 'pharmacy', 1, 20000, 20000);
    d.prepare('UPDATE bills SET gross=50000, total=50000, balance=50000 WHERE id=?').run(bid);
    d.close(); }
  await err(api('tpa.desk', `/insurance/claims/${claim.id}`, { copay_pct: 150 }, 'PATCH'), 400, 'copay_pct_invalid', 'pct');
  await err(api('tpa.desk', `/insurance/claims/${claim.id}`, { sub_limits: { 'Phar macy': 10 } }, 'PATCH'), 400, 'sub_limits_invalid', 'bad sub-limit');
  await ok(api('tpa.desk', `/insurance/claims/${claim.id}`, { room_rent_limit: 4000, proportional_deduction: 1, sub_limits: { pharmacy: 16000 } }, 'PATCH'), 'terms');
  const st = await ok(api('tpa.desk', `/insurance/claims/${claim.id}/statement`), 'statement');
  const s = st.share;
  assert.equal(s.gross, 50000); assert.equal(s.room_excess, 4000); assert.equal(s.ratio, 0.8); assert.equal(s.proportional, 2000);
  assert.equal(s.sublimit_excess, 4000); assert.equal(s.patient_total, 10000); assert.equal(s.payer_total, 40000);
  assert.equal(s.lines.find((l) => l.category === 'pharmacy').claimed, 16000, 'pharmacy is not cut proportionally, only by its sub-limit');
  await err(api('nurse', `/insurance/claims/${claim.id}/statement`), 403, null, 'statement protected');
  log.push('1 ₹50,000 bill: room ₹5,000/day vs limit ₹4,000 → room ₹4,000 + proportional 20% of consultation ₹2,000 + pharmacy above ₹16,000 sub-limit ₹4,000 = patient ₹10,000; payer ₹40,000; pharmacy not cut proportionally');

  // 2 deductible + co-pay % through payer billing and the collection desk
  const p2 = await ok(api('reception', '/patients', { name: 'Policy Copay ' + Date.now(), gender: 'Female', age_years: 45, mobile: '9000781002' }), 'patient2');
  const c2 = await ok(api('tpa.desk', '/insurance/claims', { patient_id: p2.id, tpa: 'ICICI Lombard (test)', policy_no: 'IL-TEST-2', estimate: 10000 }), 'claim2');
  let bill2;
  { const d = db();
    bill2 = d.prepare("INSERT INTO bills (bill_no, patient_id, bill_type, status, payer_type, claim_id, created_by) VALUES (?, ?, 'LAB', 'unpaid', 'insurance', ?, 1)").run(`BL-COPAY-${Date.now()}`, p2.id, c2.id).lastInsertRowid;
    d.prepare('INSERT INTO bill_items (bill_id, description, category, qty, rate, amount) VALUES (?,?,?,?,?,?)').run(bill2, 'Investigations', 'lab', 1, 10000, 10000);
    d.prepare('UPDATE bills SET gross=10000, total=10000, balance=10000 WHERE id=?').run(bill2);
    d.close(); }
  await ok(api('tpa.desk', `/insurance/claims/${c2.id}`, { deductible_amount: 1000, copay_pct: 10 }, 'PATCH'), 'terms2');
  const st2 = (await ok(api('tpa.desk', `/insurance/claims/${c2.id}/statement`), 'statement2')).share;
  assert.equal(st2.deductible, 1000); assert.equal(st2.copay_pct_amount, 900); assert.equal(st2.patient_total, 1900); assert.equal(st2.payer_total, 8100);
  await ok(api('tpa.desk', `/insurance/claims/${c2.id}`, { approved: 10000 }, 'PATCH'), 'approve');
  { const d = db(); const b = d.prepare('SELECT balance, covered_amount FROM bills WHERE id=?').get(bill2);
    const payer = d.prepare("SELECT coalesce(sum(amount),0) v FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' AND mode='insurance'").get(bill2).v; d.close();
    assert.equal(payer, 8100, 'payer billed 8,100'); assert.equal(b.balance, 1900, 'patient owes 1,900'); }
  const billView = await ok(api('reception', `/bills/${bill2}`), 'bill view');
  assert.equal(billView.patient_due ?? billView.collection?.patient_due, 1900, 'collection desk sees the patient share');
  log.push('2 deductible ₹1,000 + co-pay 10% on ₹10,000: approval bills payer ₹8,100; ₹1,900 stays as the patient\'s balance and the desk sees it as patient due');

  // 3 terms cannot change after payer money arrives; changing them before reverses and recomputes
  await ok(api('tpa.desk', `/insurance/claims/${c2.id}`, { copay_pct: 20 }, 'PATCH'), 'change terms');
  { const d = db(); const payer = d.prepare("SELECT coalesce(sum(amount),0) v FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' AND mode='insurance'").get(bill2).v; d.close();
    assert.equal(payer, 7200, 'recomputed: (10,000 − 1,000) × 80%'); }
  log.push('3 co-pay changed 10% → 20% before any payer money: old payer entry reversed, payer now ₹7,200');

  // 4 paper documents: Paperless needs a downtime reason
  if ((await ok(api('hosp.admin', '/admin/operating-mode'), 'mode0')).mode !== 'paperless') await ok(api('hosp.admin', '/admin/operating-mode', { mode: 'paperless', reason: 'Test starts paperless', confirm: true }), 'to paperless');
  await err(api('pharmacy.manager', '/clinical-documents', { patient_id: p.id, form: 'vitals_chart' }), 403, null, 'pharmacy cannot');
  await err(api('nurse', '/clinical-documents', { patient_id: p.id, form: 'nope' }), 400, 'form_invalid', 'form');
  await err(api('nurse', '/clinical-documents', { patient_id: p.id, form: 'vitals_chart' }), 400, 'downtime_reason_required', 'paperless reason');
  const doc = await ok(api('nurse', '/clinical-documents', { patient_id: p.id, form: 'vitals_chart', documented_on: '2026-10-27', documented_by_name: 'Sr. Mary', notes: 'Network down 02:00–04:30' }), 'record doc');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await ok(api('nurse', `/attachments/clinical_document/${doc.id}`, { files: [{ name: 'tpr.png', type: 'image/png', data: png }] }), 'scan');
  await ok(api('hosp.admin', '/admin/operating-mode', { mode: 'paper', reason: 'Paper charts in wards', confirm: true }), 'paper mode');
  await ok(api('nurse', '/clinical-documents', { patient_id: p.id, form: 'ot_checklist' }), 'paper mode no reason');
  const list = await ok(api('doctor', `/patients/${p.id}/clinical-documents`), 'list');
  assert.equal(list.length, 2); assert.equal(list.find((x) => x.form === 'vitals_chart').notes, 'Network down 02:00–04:30');
  const files = await ok(api('doctor', `/attachments/clinical_document/${doc.id}`), 'doctor sees scan'); assert.equal(files.length, 1);
  log.push('4 paper forms: pharmacy 403, unknown form 400; Paperless needs a downtime reason; scan attached; Paper mode records without one; doctor sees both with the scan');

  // 5 books still balance
  { const d = db(); const delta = d.prepare('SELECT round(sum(debit-credit),2) d FROM journal_lines').get().d; d.close(); assert.ok(Math.abs(delta) < 0.005); }
  log.push('5 books balance');

  console.log(JSON.stringify({ ok: true, checks: log.length, log }, null, 1));
} catch (e) {
  console.error('FAIL', e.message); console.error(log.join('\n')); if (errOut) console.error(errOut.slice(-1500)); process.exitCode = 1;
} finally { srv.kill(); }

