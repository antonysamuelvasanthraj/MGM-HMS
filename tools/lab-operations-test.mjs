/**
 * Phase 4 regression — accession numbers, labels and scan-to-open, the critical-result call log,
 * and test-wise lab consumables (GRN → Central → LAB → used per test), on a disposable copy:
 *   node tools/lab-operations-test.mjs   (needs DEMO-LOGINS.local.md)
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(import.meta.dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-labops-'));
{ const live = new DatabaseSync(path.join(root, 'data/surelyhms.db'), { readOnly: true }); live.exec(`VACUUM INTO '${path.join(S, 'surelyhms.db').split(path.sep).join('/')}'`); live.close(); }
const PORT = +(process.env.HMS_TEST_PORT || 4390), B = `http://127.0.0.1:${PORT}/api`;
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
const q1 = (sql, ...a) => { const d = db(); const r = d.prepare(sql).get(...a); d.close(); return r; };
const labQty = (code) => q1("SELECT coalesce(sum(b.qty),0) q FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id WHERE m.code=? AND b.location='LAB'", code).q;
const log = [];
try {
  const meta = await ok(api('reception', '/meta'), 'meta');
  const doctor = meta.doctors.find((d) => d.role === 'doctor');
  const med = (code) => q1('SELECT id FROM medicines WHERE code=?', code)?.id;
  await err(api('lab.tech', '/lab/store/standard-items', {}), 403, null, 'tech cannot add master items');
  const added = (await ok(api('lab.manager', '/lab/store/standard-items', {}), 'standard items')).added;
  assert.equal((await ok(api('lab.manager', '/lab/store/standard-items', {}), 'again')).added.length, 0, 'idempotent');
  for (const c of ['LC-EDTA3', 'LC-NEEDLE21', 'LC-TIPS', 'LC-PLAIN5']) assert.ok(med(c), `lab item ${c} in master`);
  log.push(`1 standard lab items added from Lab Store (${added.length}, no stock; tech 403; second time adds none)`);

  // 2 stock enters by GRN into Central, then a transfer to LAB
  const supplier = await ok(api('pharmacy.manager', '/pharmacy/suppliers', { name: 'Lab Supplies Distributor (test)', state: 'Andhra Pradesh' }), 'supplier');
  const exp = `${new Date().getFullYear() + 2}-12-31`;
  await ok(api('pharmacy.manager', '/pharmacy/purchases', { supplier_id: supplier.id, invoice_no: 'LABGRN-1', invoice_date: new Date().toISOString().slice(0, 10), items: [
    { medicine_id: med('LC-EDTA3'), batch_no: 'EDTA-B1', expiry: exp, qty: 1, rate: 800, mrp: 1200, gst_pct: 12, pack_size: 1, units_per_pack: 100 },
    { medicine_id: med('LC-NEEDLE21'), batch_no: 'NDL-B1', expiry: exp, qty: 1, rate: 600, mrp: 900, gst_pct: 12, pack_size: 1, units_per_pack: 100 },
    { medicine_id: med('LC-PLAIN5'), batch_no: 'PLN-B1', expiry: exp, qty: 1, rate: 700, mrp: 1000, gst_pct: 12, pack_size: 1, units_per_pack: 100 }] }), 'grn');
  assert.equal(labQty('LC-EDTA3'), 0, 'GRN goes to Central, not the lab');
  const t = await ok(api('pharmacy.manager', '/pharmacy/transfers', { destination: 'LAB', lines: [{ medicine_id: med('LC-EDTA3'), qty: 50 }, { medicine_id: med('LC-NEEDLE21'), qty: 50 }, { medicine_id: med('LC-PLAIN5'), qty: 20 }] }), 'transfer');
  await ok(api('hosp.admin', `/pharmacy/transfers/${t.id}/approve`, {}), 'approve');
  await ok(api('hosp.admin', `/pharmacy/transfers/${t.id}/issue`, {}), 'issue');
  const issued = await ok(api('hosp.admin', `/pharmacy/transfers/${t.id}`), 'transfer detail');
  await ok(api('hosp.admin', `/pharmacy/transfers/${t.id}/receive`, { issues: issued.lines.flatMap((l) => l.issues.map((i) => ({ id: i.id, qty: i.qty }))) }), 'receive');
  assert.equal(labQty('LC-EDTA3'), 50); assert.equal(labQty('LC-NEEDLE21'), 50);
  log.push(`2 GRN LABGRN-1 into Central (LAB still 0) → transfer ${t.transfer_no || t.id} to LAB: EDTA 50, needles 50, plain 20`);

  // 3 a test with a critical limit; its consumables
  const test = await ok(api('hosp.admin', '/services', { name: 'Serum potassium (ops test)', code: 'LAB-KOPS', price: 150, category: 'lab', department_id: meta.departments.find((d) => d.code === 'LAB').id,
    sample_type: 'Serum', tat_minutes: 60, parameters: [{ name: 'Potassium', unit: 'mmol/L', ref_low: 3.5, ref_high: 5.1, crit_low: 2.8, crit_high: 6.2 }] }), 'test');
  await err(api('lab.tech', `/lab/consumables/${test.id}`, { lines: [] }, 'PUT'), 403, null, 'tech cannot set');
  await err(api('lab.manager', `/lab/consumables/${test.id}`, { lines: [{ medicine_id: med('LC-EDTA3'), qty: 1, stage: 'collection' }, { medicine_id: med('LC-EDTA3'), qty: 1, stage: 'collection' }] }, 'PUT'), 400, 'item_listed_twice', 'twice');
  await ok(api('lab.manager', `/lab/consumables/${test.id}`, { lines: [{ medicine_id: med('LC-PLAIN5'), qty: 1, stage: 'collection' }, { medicine_id: med('LC-NEEDLE21'), qty: 1, stage: 'collection' }, { medicine_id: med('LC-TIPS'), qty: 2, stage: 'processing' }] }, 'PUT'), 'set consumables');
  log.push('3 test with critical limits created; consumables: plain tube + needle at collection, 2 tips at processing (tech 403, duplicate 400)');

  // 4 collect: accession + collection items
  const p = await ok(api('reception', '/patients', { name: 'Lab Ops ' + Date.now(), gender: 'Female', age_years: 61, mobile: '9000780123' }), 'patient');
  const e = (await ok(api('reception', '/encounters', { patient_id: p.id, doctor_id: doctor.id }), 'visit')).encounter;
  { const b = (await ok(api('reception', `/bills?encounter_id=${e.id}`), 'bills')).rows?.find((x) => x.balance > 0); if (b) await ok(api('reception', '/payments', { bill_id: b.id, amount: b.balance, mode: 'cash' }), 'fee'); }
  const o = (await ok(api('doctor', '/orders', { encounter_id: e.id, items: [{ service_id: test.id }] }), 'order')).orders[0];
  { const bid = q1('SELECT bill_id FROM bill_items WHERE order_id=?', o.id).bill_id; const b = await ok(api('reception', `/bills/${bid}`), 'b'); await ok(api('reception', '/payments', { bill_id: bid, amount: b.balance, mode: 'cash' }), 'pay'); }
  const c1 = await ok(api('lab.tech', `/lab/orders/${o.id}/collect`, {}), 'collect');
  assert.match(c1.accession_no, /^ACC-/); assert.equal(labQty('LC-PLAIN5'), 19); assert.equal(labQty('LC-NEEDLE21'), 49); assert.equal(labQty('LC-EDTA3'), 50, 'EDTA not set for this test');
  log.push(`4 collect: accession ${c1.accession_no}, plain tube 20→19, needle 50→49, EDTA untouched`);

  // 5 labels + scan-to-open
  const lbl = await ok(api('lab.tech', `/labels/order/${o.id}`), 'label');
  assert.equal(lbl.sample_id, c1.sample_id); assert.equal(lbl.accession_no, c1.accession_no);
  const wb = await ok(api('reception', `/labels/patient/${p.id}`), 'wristband'); assert.equal(wb.uhid, p.uhid);
  assert.equal((await ok(api('lab.tech', `/scan/${c1.sample_id}`), 'scan sample')).route, `/laboratory?order=${o.id}`);
  assert.equal((await ok(api('lab.tech', `/scan/${c1.accession_no}`), 'scan accession')).type, 'order');
  assert.equal((await ok(api('reception', `/scan/${p.uhid}`), 'scan uhid')).route, `/patient/${p.id}`);
  await err(api('reception', '/scan/NOPE-00000'), 404, 'nothing_matches_code', 'unknown');
  log.push('5 tube label + wristband data; scanning sample no., accession no. and UHID opens the right screen; unknown 404');

  // 6 recollection uses collection items again
  await err(api('lab.tech', `/lab/orders/${o.id}/recollect`, {}), 400, 'reason_required', 'reason');
  const rc = await ok(api('lab.tech', `/lab/orders/${o.id}/recollect`, { reason: 'Haemolysed' }), 'recollect');
  assert.equal(rc.status, 'ordered'); assert.notEqual(rc.sample_id, c1.sample_id); assert.equal(rc.recollect_count, 1);
  const c2 = await ok(api('lab.tech', `/lab/orders/${o.id}/collect`, {}), 'collect again');
  assert.equal(labQty('LC-PLAIN5'), 18); assert.notEqual(c2.accession_no, c1.accession_no);
  assert.equal(q1("SELECT count(*) n FROM lab_consumption WHERE order_id=? AND recollection=1", o.id).n, 2);
  log.push('6 recollect (reason required): new sample no., collected again → tube + needle used again, marked as recollection');

  // 7 results: processing items short (tips not in LAB) — the test still goes ahead; critical flagged
  const params = await ok(api('lab.manager', `/lab/params?service_id=${test.id}`), 'params');
  await ok(api('lab.manager', `/lab/orders/${o.id}/results`, { results: [{ param_id: params[0].id, value: '6.9' }] }), 'results');
  assert.equal(q1("SELECT count(*) n FROM lab_consumption WHERE order_id=? AND stage='processing' AND status='short'", o.id).n, 1);
  const store = await ok(api('lab.manager', '/lab/store'), 'store');
  assert.ok(store.short.some((s) => s.order_no === o.order_no)); assert.ok(store.stock.some((s) => s.code === 'LC-PLAIN5' && s.qty === 18));
  await ok(api('lab.manager', `/lab/orders/${o.id}/results`, { results: [{ param_id: params[0].id, value: '6.9' }] }), 'results again');
  assert.equal(q1("SELECT count(*) n FROM lab_consumption WHERE order_id=? AND stage='processing'", o.id).n, 1, 'processing items once only');
  log.push('7 results: tips not in the LAB store → shortfall recorded, test not held; editing results does not use reagents again');

  // 8 critical call log
  let cr = await ok(api('lab.manager', '/lab/critical'), 'critical');
  let row = cr.rows.find((r) => r.id === o.id); assert.equal(row.state, 'not_called');
  await err(api('lab.manager', `/lab/orders/${o.id}/critical-call`, { informed_user_id: o.ordered_by, mode: 'phone' }), 400, 'read_back_required', 'read back');
  await err(api('lab.manager', `/lab/orders/${o.id}/critical-call`, { informed_user_id: o.ordered_by, mode: 'fax', read_back: true }), 400, 'mode_invalid', 'mode');
  const call = await ok(api('lab.manager', `/lab/orders/${o.id}/critical-call`, { informed_user_id: o.ordered_by, mode: 'phone', read_back: true, notes: 'Read back K 6.9' }), 'call');
  assert.match(call.result_summary, /Potassium 6.9/);
  const mine = await ok(api('doctor', '/lab/critical'), 'doctor view');
  assert.ok(mine.rows.some((r) => r.id === o.id && r.state === 'called'));
  await err(api('doctor', `/critical-calls/${call.id}/ack`, {}), 400, 'action_required', 'action');
  await ok(api('doctor', `/critical-calls/${call.id}/ack`, { action_taken: 'ECG, insulin-dextrose, repeat K in 2 h' }), 'ack');
  await err(api('doctor', `/critical-calls/${call.id}/ack`, { action_taken: 'again' }), 409, 'already_acknowledged', 'twice');
  await err(api('reception', `/critical-calls/${call.id}/ack`, { action_taken: 'x' }), 403, null, 'not clinical');
  cr = await ok(api('lab.manager', '/lab/critical'), 'critical2'); assert.equal(cr.rows.find((r) => r.id === o.id).state, 'acknowledged');
  log.push('8 critical K 6.9: not yet told → call (read-back and mode enforced) → doctor sees it, acknowledges with action (required, once, clinical staff only)');

  // 9 outsourced test: collection items only
  const ctr = await ok(api('hosp.admin', '/diagnostic-providers', { name: 'Ref Lab Ops (test)', kind: 'lab', billing: 'hospital' }), 'centre');
  await ok(api('lab.manager', '/outsource/rates', { provider_id: ctr.id, service_id: test.id, cost_price: 60 }), 'rate');
  const p2 = await ok(api('reception', '/patients', { name: 'Lab Ops Out ' + Date.now(), gender: 'Male', age_years: 40, mobile: '9000780124' }), 'patient2');
  const e2 = (await ok(api('reception', '/encounters', { patient_id: p2.id, doctor_id: doctor.id }), 'visit2')).encounter;
  { const b = (await ok(api('reception', `/bills?encounter_id=${e2.id}`), 'bills2')).rows?.find((x) => x.balance > 0); if (b) await ok(api('reception', '/payments', { bill_id: b.id, amount: b.balance, mode: 'cash' }), 'fee2'); }
  const o2 = (await ok(api('doctor', '/orders', { encounter_id: e2.id, items: [{ service_id: test.id, provider_id: ctr.id }] }), 'out order')).orders[0];
  assert.equal(o2.order_dest, 'outsourced');
  { const bid = q1('SELECT bill_id FROM bill_items WHERE order_id=?', o2.id).bill_id; const b = await ok(api('reception', `/bills/${bid}`), 'b2'); await ok(api('reception', '/payments', { bill_id: bid, amount: b.balance, mode: 'cash' }), 'pay2'); }
  await ok(api('lab.tech', `/lab/orders/${o2.id}/collect`, {}), 'collect outsourced');
  assert.equal(labQty('LC-PLAIN5'), 17);
  assert.equal(q1("SELECT count(*) n FROM lab_consumption WHERE order_id=? AND stage='processing'", o2.id).n, 0, 'no reagents for an outside test');
  log.push('9 outsourced test: tube + needle used at collection here; no reagent deducted for work the outside lab does');

  // 10 reports, books
  const usage = await ok(api('lab.manager', '/reports/run/lab_consumable_usage?from=2026-01-01&to=2026-12-31'), 'usage');
  const tube = usage.rows.find((r) => r.item.startsWith('Plain') && r.test === 'Serum potassium (ops test)');
  assert.equal(tube.used, 3); assert.equal(tube.recollections, 1); assert.ok(tube.cost > 0);
  const clog = await ok(api('lab.manager', '/reports/run/critical_results_log?from=2026-01-01&to=2026-12-31'), 'crit log');
  assert.ok(clog.rows.some((r) => r.order_no === o.order_no && r.acknowledged_by));
  { const d = db(); const delta = d.prepare('SELECT round(sum(debit-credit),2) d FROM journal_lines').get().d;
    const lc = d.prepare("SELECT round(sum(l.debit),2) v FROM journal_lines l JOIN accounts a ON a.id=l.account_id JOIN journal_vouchers v ON v.id=l.voucher_id WHERE a.system_key='exp_lab_consumables' AND v.source='lab_consumption'").get().v;
    d.close(); assert.ok(Math.abs(delta) < 0.005, 'books balance'); assert.ok(lc > 0, 'consumable cost posted'); }
  log.push(`10 reports: plain tube used 3 (1 recollection, ₹${tube.cost}); critical log shows acknowledgement; consumable cost posted, books balance`);

  console.log(JSON.stringify({ ok: true, checks: log.length, log }, null, 1));
} catch (e) {
  console.error('FAIL', e.message); console.error(log.join('\n')); if (errOut) console.error(errOut.slice(-1500)); process.exitCode = 1;
} finally { srv.kill(); }
