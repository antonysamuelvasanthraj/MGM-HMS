/**
 * Phase 2 regression — the reception investigation queue and release rules, on a disposable copy:
 *   node tools/investigation-queue-test.mjs   (needs DEMO-LOGINS.local.md)
 * Doctor order paid at reception, approved due, IPD ledger, ICU urgent before payment, ER deferred,
 * payer authorisation, generate-bill without double billing, destination change, cancel, release rule.
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(import.meta.dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-queue-'));
{ const live = new DatabaseSync(path.join(root, 'data/surelyhms.db'), { readOnly: true }); live.exec(`VACUUM INTO '${path.join(S, 'surelyhms.db').split(path.sep).join('/')}'`); live.close(); }
const PORT = +(process.env.HMS_TEST_PORT || 4392), B = `http://127.0.0.1:${PORT}/api`;
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
const queueRow = async (orderId, extra = '') => (await ok(api('reception', `/reception/investigations?work=all${extra}`), 'queue')).rows.find((r) => r.id === orderId);
const log = [];
try {
  const meta = await ok(api('reception', '/meta'), 'meta');
  const labs = meta.services.filter((s) => s.category === 'lab' && s.active !== 0 && s.price > 0);
  const doctor = meta.doctors.find((d) => d.role === 'doctor');
  let patSeq = 10;
  const newPatient = async (tag) => ok(api('reception', '/patients', { name: `Queue ${tag} ${Date.now()}_${++patSeq}`, gender: 'Female', age_years: 40, mobile: '97' + String(Date.now()).slice(-6) + String(patSeq).slice(-2) }), 'patient');
  const visit = async (p) => (await ok(api('reception', '/encounters', { patient_id: p.id, doctor_id: doctor.id }), 'visit')).encounter;
  const payVisit = async (enc) => { const bill = (await ok(api('reception', `/bills?encounter_id=${enc.id}`), 'bills')).rows?.find((b) => b.bill_type === 'OP' && b.balance > 0); if (bill) await ok(api('reception', '/payments', { bill_id: bill.id, amount: bill.balance, mode: 'cash' }), 'consult fee'); };

  await ok(api('hosp.admin', '/settings', { release_op_rule: 'payment' }, 'PATCH'), 'release after payment');
  // 1 doctor orders online; reception sees it unpaid and collects
  const p1 = await newPatient('Online'); const e1 = await visit(p1); await payVisit(e1);
  const o1 = (await ok(api('doctor', '/orders', { encounter_id: e1.id, items: [{ service_id: labs[0].id, priority: 'urgent' }] }), 'doctor order')).orders[0];
  let r = await queueRow(o1.id);
  assert.equal(r.money, 'unpaid'); assert.equal(r.source_label, 'Doctor portal'); assert.equal(r.status, 'awaiting_payment');
  await err(api('lab.tech', `/lab/orders/${o1.id}/collect`, {}), 409, null, 'held for money');
  await ok(api('reception', '/payments', { bill_id: r.bill_id, amount: r.bill_balance, mode: 'upi', reference: 'UPI-TEST-1' }), 'collect');
  r = await queueRow(o1.id); assert.equal(r.money, 'paid');
  await ok(api('lab.tech', `/lab/orders/${o1.id}/collect`, {}), 'released to lab');
  log.push(`1 doctor order ${o1.order_no}: queue shows Unpaid (portal), lab blocked 409, reception collects UPI → Paid, lab collects`);

  // 2 filters
  const fq = await ok(api('reception', `/reception/investigations?work=all&source=doctor_portal&q=${encodeURIComponent(p1.uhid)}`), 'filtered');
  assert.ok(fq.rows.length >= 1 && fq.rows.every((x) => x.uhid === p1.uhid && x.order_source === 'doctor_portal'));
  const fm = await ok(api('reception', '/reception/investigations?money=paid'), 'money filter');
  assert.ok(fm.rows.every((x) => x.money === 'paid'));
  log.push('2 filters: patient/UHID + source, money status');

  // 3 OPD approved due: released without money
  const p3 = await newPatient('Due'); const e3 = await visit(p3); await payVisit(e3);
  const o3 = (await ok(api('doctor', '/orders', { encounter_id: e3.id, items: [{ service_id: labs[1].id }] }), 'order3')).orders[0];
  r = await queueRow(o3.id);
  await ok(api('reception', `/bills/${r.bill_id}/settle`, { request_key: 'due-' + Date.now(), category: 'self', lines: [{ mode: 'due', amount: r.bill_balance, reason: 'Pays on Friday — approved by Admin' }] }), 'approved due');
  r = await queueRow(o3.id); assert.equal(r.money, 'due_credit', JSON.stringify(r));
  await ok(api('lab.tech', `/lab/orders/${o3.id}/collect`, {}), 'due released');
  { const d = db(); const b = d.prepare('SELECT paid, status FROM bills WHERE id=?').get(r.bill_id); d.close(); assert.equal(b.paid, 0, 'a due is not money received'); }
  log.push('3 approved due: queue Due / credit, lab may start, bill paid stays ₹0');

  // 4 IPD and 5 ICU: on the inpatient ledger, never held
  const beds = await ok(api('hosp.admin', '/ipd/beds'), 'beds');
  const wardBed = beds.beds.find((b) => b.status === 'vacant' && !['icu', 'nicu', 'picu', 'hdu'].includes(b.ward_kind));
  const icuBed = beds.beds.find((b) => b.status === 'vacant' && ['icu', 'hdu'].includes(b.ward_kind));
  const p4 = await newPatient('IPD');
  const a4 = await ok(api('hosp.admin', '/ipd/admissions', { patient_id: p4.id, bed_id: wardBed.id, consultant_id: doctor.id, diagnosis: 'Queue IPD test' }), 'admit');
  const o4 = (await ok(api('doctor', '/orders', { encounter_id: a4.encounter_id, items: [{ service_id: labs[2].id }] }), 'ip order')).orders[0];
  assert.equal(o4.status, 'ordered');
  r = await queueRow(o4.id); assert.equal(r.money, 'ip_ledger'); assert.equal(r.bill_type, 'IP');
  log.push(`4 IPD: order on the running IP bill (${r.bill_no}), money = On IP bill, released`);
  if (icuBed) {
    const p5 = await newPatient('ICU');
    const a5 = await ok(api('hosp.admin', '/ipd/admissions', { patient_id: p5.id, bed_id: icuBed.id, consultant_id: doctor.id, diagnosis: 'Queue ICU test' }), 'admit icu');
    const o5 = (await ok(api('doctor', '/orders', { encounter_id: a5.encounter_id, items: [{ service_id: labs[0].id, priority: 'stat' }] }), 'icu order')).orders[0];
    assert.equal(o5.status, 'ordered'); await ok(api('lab.tech', `/lab/orders/${o5.id}/collect`, {}), 'icu collected before payment');
    const iq = await ok(api('reception', '/reception/investigations?kind=ICU'), 'icu filter');
    assert.ok(iq.rows.some((x) => x.id === o5.id));
    log.push('5 ICU: STAT test collected before any payment; ICU filter finds it');
  } else log.push('5 ICU: no vacant ICU bed in this database — skipped');

  // 6 Emergency: immediate, billed later
  const p6 = await newPatient('ER');
  const er = await ok(api('hosp.admin', '/ipd/emergency', { patient_id: p6.id, complaint: 'Chest pain — queue test', triage: '2' }), 'er');
  const o6 = (await ok(api('doctor', '/orders', { encounter_id: er.encounter_id, items: [{ service_id: labs[1].id, priority: 'stat' }] }), 'er order')).orders[0];
  assert.equal(o6.status, 'ordered'); assert.equal(o6.auth_status, 'emergency_override');
  await ok(api('lab.tech', `/lab/orders/${o6.id}/collect`, {}), 'er collected');
  r = await queueRow(o6.id); assert.equal(r.money, 'er_deferred');
  log.push('6 Emergency: STAT test released at once (emergency override), collected, money = ER — bill later');

  // 7 payer authorisation follows the bill
  const p7 = await newPatient('TPA'); const e7 = await visit(p7); await payVisit(e7);
  { const d = db(); d.prepare("UPDATE patients SET payer_type='insurance' WHERE id=?").run(p7.id); d.close(); }
  const o7 = (await ok(api('doctor', '/orders', { encounter_id: e7.id, items: [{ service_id: labs[2].id }] }), 'tpa order')).orders[0];
  assert.equal(o7.auth_status, 'pending');
  { const d = db(); const bid = d.prepare('SELECT bill_id FROM bill_items WHERE order_id=?').get(o7.id).bill_id;
    d.prepare("UPDATE bills SET authorization_status='approved' WHERE id=?").run(bid);
    assert.equal(d.prepare('SELECT auth_status FROM orders WHERE id=?').get(o7.id).auth_status, 'approved'); d.close(); }
  log.push('7 insurance patient: order authorisation Pending; payer approval on the bill → Approved (separate from money)');

  // 8 generate bill for an unbilled order — once only
  const p8 = await newPatient('Unbilled'); const e8 = await visit(p8); await payVisit(e8);
  const o8 = (await ok(api('doctor', '/orders', { encounter_id: e8.id, bill: false, items: [{ service_id: labs[0].id }, { service_id: labs[1].id }] }), 'unbilled')).orders;
  r = await queueRow(o8[0].id); assert.equal(r.money, 'unbilled');
  const gb = await ok(api('reception', '/reception/investigations/bill', { order_ids: o8.map((o) => o.id) }), 'generate bill');
  assert.equal(gb.bill.total, labs[0].price + labs[1].price);
  await err(api('reception', '/reception/investigations/bill', { order_ids: [o8[0].id] }), 409, 'already_billed', 'no double billing');
  await err(api('lab.tech', '/reception/investigations/bill', { order_ids: [o8[0].id] }), 403, null, 'lab cannot bill');
  log.push(`8 generate bill: one bill ${gb.bill.bill_no} for two unbilled orders; second attempt 409 already_billed; lab 403`);

  // 9 destination and cancel
  const prov = await ok(api('hosp.admin', '/diagnostic-providers', { name: 'Queue Tie-up Lab', kind: 'lab', billing: 'hospital' }), 'provider');
  await err(api('reception', `/orders/${o8[1].id}/destination`, { provider_id: prov.id }), 400, 'reason_required', 'reason');
  const d9 = await ok(api('reception', `/orders/${o8[1].id}/destination`, { provider_id: prov.id, reason: 'Analyser down' }), 'send out');
  assert.equal(d9.order_dest, 'outsourced');
  await ok(api('reception', `/orders/${o8[1].id}/destination`, { provider_id: null, reason: 'Analyser fixed' }), 'back in house');
  const c9 = await ok(api('reception', `/reception/investigations/${o8[0].id}/cancel`, { reason: 'Patient declined' }), 'cancel');
  assert.equal(c9.status, 'cancelled'); assert.equal(c9.billing_review[0].bill_no, gb.bill.bill_no);
  await err(api('reception', `/reception/investigations/${o1.id}/cancel`, { reason: 'Too late' }), 409, 'work_already_started', 'started work');
  log.push('9 destination: reason required, out to tie-up lab and back (dest follows); cancel with reason returns the bill to review; started work cannot be cancelled');

  // 10 release rule: OP immediate
  await ok(api('hosp.admin', '/settings', { release_op_rule: 'immediate' }, 'PATCH'), 'release immediate');
  const p10 = await newPatient('Immediate'); const e10 = await visit(p10); await payVisit(e10);
  const o10 = (await ok(api('doctor', '/orders', { encounter_id: e10.id, items: [{ service_id: labs[0].id }] }), 'immediate order')).orders[0];
  assert.equal(o10.status, 'ordered');
  await ok(api('lab.tech', `/lab/orders/${o10.id}/collect`, {}), 'collected before payment');
  r = await queueRow(o10.id); assert.equal(r.money, 'unpaid', 'still owed at reception');
  await ok(api('hosp.admin', '/settings', { release_op_rule: 'payment' }, 'PATCH'), 'release back');
  log.push('10 release rule Straight away: OP test starts unpaid, reception still sees Unpaid; rule restored');

  console.log(JSON.stringify({ ok: true, checks: log.length, log }, null, 1));
} catch (e) {
  console.error('FAIL', e.message); console.error(log.join('\n')); if (errOut) console.error(errOut.slice(-1500)); process.exitCode = 1;
} finally { srv.kill(); }
