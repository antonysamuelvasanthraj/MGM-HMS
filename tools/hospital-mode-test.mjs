/**
 * Phase 1 regression — hospital operating mode, order source / destination / status axes,
 * department entry, duplicate-order guard, MRI retired. Runs on a disposable copy of the live DB:
 *   node tools/hospital-mode-test.mjs   (needs DEMO-LOGINS.local.md)
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(import.meta.dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-mode-'));
{ const live = new DatabaseSync(path.join(root, 'data/surelyhms.db'), { readOnly: true }); live.exec(`VACUUM INTO '${path.join(S, 'surelyhms.db').split(path.sep).join('/')}'`); live.close(); }
const PORT = +(process.env.HMS_TEST_PORT || 4393), B = `http://127.0.0.1:${PORT}/api`;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), SURELY_DATA: S, HMS_ENV: 'demo' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errOut = ''; srv.stderr.on('data', (d) => errOut += d);
for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
const md = fs.readFileSync(path.join(root, 'DEMO-LOGINS.local.md'), 'utf8');
const pw = Object.fromEntries([...md.matchAll(/`([^`]+)`\s*\|\s*`([^`]+)`/g)].map((m) => [m[1], m[2]]));
const tok = {}; const as = async (u) => tok[u] ||= (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw[u] }) })).json()).token;
async function api(u, p, body, method) { const r = await fetch(B + p, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', 'X-Session': await as(u) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }
const ok = async (p, msg) => { const r = await p; assert.equal(r.s, 200, `${msg}: ${r.s} ${JSON.stringify(r.j).slice(0, 300)}`); return r.j; };
const err = async (p, status, code, msg) => { const r = await p; assert.equal(r.s, status, `${msg}: ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`); if (code) assert.equal(r.j.error, code, msg); return r.j; };
const db = () => new DatabaseSync(path.join(S, 'surelyhms.db'));
const log = [];
try {
  const meta = await ok(api('reception', '/meta'), 'meta');
  const svc = (code) => meta.services.find((s) => s.code === code);
  const lab1 = svc('LAB-VITD'), lab2 = svc('LAB-B12');
  const img = meta.services.find((s) => s.category === 'imaging' && s.active !== 0 && s.price > 0);
  const counts = () => { const d = db(); const c = ['orders', 'bills', 'payments', 'attachments'].map((t) => d.prepare(`SELECT count(*) n FROM ${t}`).get().n); d.close(); return c; };

  await ok(api('hosp.admin', '/settings', { release_op_rule: 'payment' }, 'PATCH'), 'release after payment');
  // start Paperless whatever mode the live hospital is in today
  if ((await ok(api('hosp.admin', '/admin/operating-mode'), 'mode0')).mode !== 'paperless') await ok(api('hosp.admin', '/admin/operating-mode', { mode: 'paperless', reason: 'Test starts paperless', confirm: true }), 'to paperless');
  // 1 mode read + only the Hospital Admin may change it
  let m = await ok(api('reception', '/admin/operating-mode'), 'mode');
  assert.equal(m.mode, 'paperless'); assert.equal(m.can_change, false);
  await err(api('owner', '/admin/operating-mode', { mode: 'paper', reason: 'Trying as owner', confirm: true }), 403, null, 'owner cannot');
  await err(api('reception', '/admin/operating-mode', { mode: 'paper', reason: 'Trying as reception', confirm: true }), 403, null, 'reception cannot');
  await err(api('owner', '/settings', { workflow_lab: 'reception' }, 'PATCH'), 403, 'hospital_mode_admin_only', 'owner cannot flip a department switch');
  await err(api('hosp.admin', '/admin/operating-mode', { mode: 'paper', confirm: true }), 400, 'reason_required', 'reason needed');
  await err(api('hosp.admin', '/admin/operating-mode', { mode: 'paper', reason: 'Doctors on paper this week' }), 400, 'confirmation_required', 'confirm needed');
  await err(api('hosp.admin', '/admin/operating-mode', { mode: 'pencil', reason: 'xxxxx', confirm: true }), 400, 'mode_invalid', 'bad mode');
  log.push('1 operating mode: Paperless now; owner / reception 403; owner department switch 403; reason, confirmation and valid mode enforced');

  // 2 Paperless → Paper; existing records survive; history + audit
  const before = counts();
  await ok(api('hosp.admin', '/admin/operating-mode', { mode: 'paper', reason: 'Doctors on paper this week', confirm: true }), 'to paper');
  m = await ok(api('hosp.admin', '/admin/operating-mode'), 'mode2');
  assert.equal(m.mode, 'paper'); assert.equal(m.effective.lab.paper, true); assert.equal(m.effective.doctor.digital, false);
  assert.equal(m.history[0].to_mode, 'paper'); assert.equal(m.history[0].from_mode, 'paperless'); assert.equal(m.history[0].reason, 'Doctors on paper this week');
  const settings = await ok(api('reception', '/settings'), 'settings');
  assert.equal(settings.workflow_doctor, 'manual'); assert.equal(settings.workflow_pharmacy, 'manual'); assert.equal(settings.workflow_lab, 'reception');
  assert.deepEqual(counts(), before, 'no record added or removed by a mode change');
  { const d = db(); const a = d.prepare("SELECT detail FROM audit_log WHERE action='hospital_mode.change' ORDER BY id DESC LIMIT 1").get(); d.close();
    const det = JSON.parse(a.detail); assert.equal(det.before.mode, 'paperless'); assert.equal(det.after.mode, 'paper'); }
  log.push('2 Paperless → Paper: department switches follow, history + audit (before/after/reason), record counts unchanged');

  // 3 paper prescription at reception: source, statuses
  const p = await ok(api('reception', '/patients', { name: 'Mode Test ' + Date.now(), gender: 'Male', age_years: 44, mobile: '9000777101' }), 'patient');
  const dx = await ok(api('reception', '/reception/diagnostics', { patient_id: p.id, referred_by: 'Dr. Paper Slip', items: [{ service_id: lab1.id }] }), 'paper tests');
  const o1 = dx.orders[0];
  assert.equal(o1.order_source, 'paper_prescription'); assert.equal(o1.order_dest, 'internal'); assert.equal(o1.auth_status, 'not_required');
  assert.equal(o1.result_stage, 'pending'); assert.equal(o1.status, 'awaiting_payment');
  log.push(`3 paper prescription: ${o1.order_no} source=paper_prescription, dest=internal, auth=not_required, result=pending, held for payment`);

  // 4 duplicate guard
  let r = await err(api('reception', '/reception/diagnostics', { patient_id: p.id, encounter_id: dx.encounter.id, referred_by: 'Dr. Paper Slip', items: [{ service_id: lab1.id }] }), 409, 'duplicate_order', 'duplicate held');
  assert.equal(r.duplicates[0].order_no, o1.order_no);
  const again = await ok(api('reception', '/reception/diagnostics', { patient_id: p.id, encounter_id: dx.encounter.id, referred_by: 'Dr. Paper Slip', confirm_duplicate: true, items: [{ service_id: lab1.id }] }), 'duplicate confirmed');
  assert.equal(again.orders[0].duplicate_of, o1.id);
  log.push('4 duplicate guard: same open test → 409 with the existing order; confirmed second order linked via duplicate_of');

  // 5 department entry (Method C)
  const de = await ok(api('lab.tech', '/department/diagnostics', { patient_id: p.id, referred_by: 'Dr. Paper Slip', items: [{ service_id: lab2.id }] }), 'dept entry');
  assert.equal(de.orders[0].order_source, 'department_entry'); assert.equal(de.orders[0].encounter_id, dx.encounter.id);
  assert.ok(de.bill && de.bill.balance > 0, 'bill raised for reception');
  await err(api('lab.tech', '/payments', { bill_id: de.bill.id, amount: 10, mode: 'cash' }), 403, null, 'department cannot collect');
  await err(api('lab.tech', '/department/diagnostics', { patient_id: p.id, referred_by: 'x', items: [{ service_id: img.id }] }), 403, 'other_department_test', 'lab cannot enter imaging');
  const p2 = await ok(api('reception', '/patients', { name: 'Mode No Visit ' + Date.now(), gender: 'Female', age_years: 30, mobile: '9000777102' }), 'patient2');
  await err(api('lab.tech', '/department/diagnostics', { patient_id: p2.id, referred_by: 'x', items: [{ service_id: lab2.id }] }), 409, 'encounter_required', 'needs a visit');
  await err(api('lab.tech', '/department/diagnostics', { patient_id: p.id, items: [{ service_id: lab2.id }] }), 400, 'referred_by_required', 'needs doctor');
  const ri = await ok(api('radiology.tech', '/department/diagnostics', { patient_id: p.id, referred_by: 'Dr. Paper Slip', items: [{ service_id: img.id }] }), 'radiology entry');
  assert.equal(ri.orders[0].order_source, 'department_entry');
  log.push('5 department entry: lab + radiology record paper requests on the open visit, bill goes to reception, no collection (403), other-department test 403, no visit 409, doctor required');

  // 6 paper scan kept with the visit
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const att = await ok(api('reception', `/attachments/encounter/${dx.encounter.id}`, { note: 'Paper prescription', files: [{ name: 'rx.png', type: 'image/png', data: png }] }), 'scan');
  assert.equal(att.length, 1);
  await ok(api('lab.tech', `/attachments/encounter/${dx.encounter.id}`), 'lab sees scan');
  log.push('6 paper prescription scan attached to the visit and visible to the lab');

  // 7 Paper → Paperless: paper entry stops, doctor portal orders tagged
  await ok(api('hosp.admin', '/admin/operating-mode', { mode: 'paperless', reason: 'Portal live again', confirm: true }), 'to paperless');
  await err(api('reception', '/reception/diagnostics', { patient_id: p.id, referred_by: 'x', items: [{ service_id: lab2.id }] }), 409, 'reception_lab_billing_disabled', 'paper off');
  await err(api('lab.tech', '/department/diagnostics', { patient_id: p.id, referred_by: 'x', items: [{ service_id: lab2.id }] }), 409, 'paper_requests_disabled', 'dept entry off');
  const lab3 = meta.services.find((s) => s.category === 'lab' && s.active !== 0 && ![lab1.id, lab2.id].includes(s.id) && s.price > 0);
  const doc = await ok(api('doctor', '/orders', { encounter_id: dx.encounter.id, items: [{ service_id: lab3.id }] }), 'doctor order');
  assert.equal(doc.orders[0].order_source, 'doctor_portal');
  log.push('7 Paper → Paperless: reception and department paper entry refused (409); doctor order tagged doctor_portal; earlier orders untouched');

  // 8 Paperless → Hybrid: both paths; doctor + paper for the same test is caught
  await ok(api('hosp.admin', '/admin/operating-mode', { mode: 'hybrid', reason: 'Both during transition', confirm: true }), 'to hybrid');
  const s2 = await ok(api('reception', '/settings'), 'settings hybrid');
  assert.equal(s2.workflow_lab, 'both'); assert.equal(s2.workflow_doctor, 'both'); assert.equal(s2.workflow_pharmacy, 'both');
  r = await err(api('reception', '/reception/diagnostics', { patient_id: p.id, encounter_id: dx.encounter.id, referred_by: 'Dr. Paper Slip', items: [{ service_id: lab3.id }] }), 409, 'duplicate_order', 'hybrid duplicate');
  assert.equal(r.duplicates[0].order_source, 'doctor_portal');
  const lab4 = meta.services.find((s) => s.category === 'lab' && s.active !== 0 && ![lab1.id, lab2.id, lab3.id].includes(s.id) && s.price > 0);
  await ok(api('reception', '/reception/diagnostics', { patient_id: p.id, encounter_id: dx.encounter.id, referred_by: 'Dr. Paper Slip', items: [{ service_id: lab4.id }] }), 'hybrid paper ok');
  await ok(api('doctor', '/orders', { encounter_id: dx.encounter.id, items: [{ service_id: svc('LAB-THY').id }] }), 'hybrid portal ok');
  log.push('8 Paperless → Hybrid: all switches "both"; paper slip for a test the doctor already ordered → 409 naming the portal order; other tests accepted both ways');

  // 9 status axes follow the work (trigger) and financial status stays separate
  { const d = db();
    d.prepare("UPDATE orders SET status='reported' WHERE id=?").run(o1.id);
    assert.equal(d.prepare('SELECT result_stage FROM orders WHERE id=?').get(o1.id).result_stage, 'under_verification');
    d.prepare("UPDATE orders SET status='verified' WHERE id=?").run(o1.id);
    assert.equal(d.prepare('SELECT result_stage FROM orders WHERE id=?').get(o1.id).result_stage, 'released');
    const bill = d.prepare('SELECT b.status FROM bills b JOIN bill_items i ON i.bill_id=b.id WHERE i.order_id=?').get(o1.id);
    assert.equal(bill.status, 'unpaid', 'report status never changes money status');
    d.close(); }
  log.push('9 status axes: reported → under_verification, verified → released; bill stays unpaid (independent)');

  // 10 MRI retired
  { const d = db(); const act = d.prepare("SELECT count(*) n FROM services WHERE active=1 AND upper(name) LIKE '%MRI%'").get().n;
    const hist = d.prepare("SELECT count(*) n FROM services WHERE upper(name) LIKE '%MRI%'").get().n; d.close();
    assert.equal(act, 0); assert.ok(hist >= 2, 'MRI history kept'); }
  await err(api('hosp.admin', '/services', { code: 'IMG-MRI-KNEE', name: 'MRI Knee', category: 'imaging', price: 5000 }), 400, 'mri_not_offered', 'no new MRI');
  { const d = db(); const id = d.prepare("SELECT id FROM services WHERE upper(name) LIKE '%MRI%' LIMIT 1").get().id; d.close();
    await err(api('hosp.admin', `/services/${id}`, { active: 1 }, 'PATCH'), 400, 'mri_not_offered', 'no reactivation'); }
  log.push('10 MRI: no active MRI service, history kept, new MRI service and reactivation refused');

  console.log(JSON.stringify({ ok: true, checks: log.length, log }, null, 1));
} catch (e) {
  console.error('FAIL', e.message); console.error(log.join('\n')); if (errOut) console.error(errOut.slice(-1500)); process.exitCode = 1;
} finally { srv.kill(); }
