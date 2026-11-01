/**
 * Phase 3 regression — outsourced lab and imaging, on a disposable copy of the live database:
 *   node tools/outsourcing-test.mjs   (needs DEMO-LOGINS.local.md)
 * Rates + preferred centre, dispatch manifest, acknowledgement, report versions, identity-checked
 * acceptance, corrected report, imaging referral with study / image link, rejection, centre bill,
 * payable and payment through the books, no second patient charge, reports.
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(import.meta.dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-out-'));
{ const live = new DatabaseSync(path.join(root, 'data/surelyhms.db'), { readOnly: true }); live.exec(`VACUUM INTO '${path.join(S, 'surelyhms.db').split(path.sep).join('/')}'`); live.close(); }
const PORT = +(process.env.HMS_TEST_PORT || 4391), B = `http://127.0.0.1:${PORT}/api`;
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
const pdf = (t) => ({ name: `${t}.pdf`, type: 'application/pdf', data: Buffer.from(`%PDF-1.4 ${t}`).toString('base64') });
const log = [];
try {
  const meta = await ok(api('reception', '/meta'), 'meta');
  const doctor = meta.doctors.find((d) => d.role === 'doctor');
  const labTest = meta.services.find((s) => s.category === 'lab' && s.active !== 0 && s.price > 300 && !s.provider_id);
  const imgTest = meta.services.find((s) => s.category === 'imaging' && s.active !== 0 && s.price > 300 && !s.provider_id && !/MRI/i.test(s.name));
  const newPatient = async (tag) => ok(api('reception', '/patients', { name: `Outsource ${tag} ${Date.now()}`, gender: 'Male', age_years: 52, mobile: '9000779' + String(Math.floor(Math.random() * 900 + 100)) }), 'patient');
  const visit = async (p) => { const e = (await ok(api('reception', '/encounters', { patient_id: p.id, doctor_id: doctor.id }), 'visit')).encounter;
    const b = (await ok(api('reception', `/bills?encounter_id=${e.id}`), 'bills')).rows?.find((x) => x.balance > 0); if (b) await ok(api('reception', '/payments', { bill_id: b.id, amount: b.balance, mode: 'cash' }), 'fee'); return e; };
  const payOrder = async (o) => { const d = db(); const bid = d.prepare('SELECT bill_id FROM bill_items WHERE order_id=?').get(o.id).bill_id; d.close();
    const b = await ok(api('reception', `/bills/${bid}`), 'bill'); await ok(api('reception', '/payments', { bill_id: bid, amount: b.balance, mode: 'upi', reference: 'UPI-O-' + o.id }), 'pay order'); return bid; };

  // 1 centres and rates
  const lab = await ok(api('hosp.admin', '/diagnostic-providers', { name: 'Reference Lab (test)', kind: 'lab', billing: 'hospital', default_tat_hours: 24, credit_days: 30, gstin: '37ABCDE1234F1Z5' }), 'lab centre');
  const ctr = await ok(api('hosp.admin', '/diagnostic-providers', { name: 'Scan Centre (test)', kind: 'imaging', billing: 'hospital', default_tat_hours: 48 }), 'imaging centre');
  await err(api('lab.tech', '/outsource/rates', { provider_id: lab.id, service_id: labTest.id, cost_price: 200 }), 403, null, 'tech cannot set rates');
  await err(api('hosp.admin', '/outsource/rates', { provider_id: ctr.id, service_id: labTest.id, cost_price: 200 }), 400, 'provider_wrong_kind', 'kind');
  const rate = await ok(api('lab.manager', '/outsource/rates', { provider_id: lab.id, service_id: labTest.id, provider_test_code: 'RL-0091', cost_price: 200, tat_hours: 30, transport: '2–8 °C (cold box)', preferred: true }), 'rate');
  await ok(api('hosp.admin', '/outsource/rates', { provider_id: ctr.id, service_id: imgTest.id, cost_price: 400, tat_hours: 24, transport: 'Patient goes to centre', preferred: true }), 'img rate');
  const rows = await ok(api('lab.tech', `/outsource/rates?service_id=${labTest.id}`), 'rates');
  assert.equal(rows[0].margin, Math.round((labTest.price - 200) * 100) / 100); assert.equal(rows[0].preferred_provider_id, lab.id);
  log.push(`1 centres + rates: lab manager sets cost ₹200 (code RL-0091, 30 h, cold box), preferred; tech 403; wrong kind 400; margin ₹${rows[0].margin}`);

  // 2 order goes to the preferred centre; paid; sample taken
  const p = await newPatient('Lab'); const e = await visit(p);
  const o = (await ok(api('doctor', '/orders', { encounter_id: e.id, items: [{ service_id: labTest.id }] }), 'order')).orders[0];
  assert.equal(o.provider_id, lab.id); assert.equal(o.order_dest, 'outsourced');
  const billId = await payOrder(o);
  const billBefore = (await ok(api('reception', `/bills/${billId}`), 'bill')).total;
  let wl = await ok(api('lab.tech', '/outsource/worklist'), 'worklist');
  assert.equal(wl.to_send.find((r) => r.id === o.id).ready, false, 'sample not yet taken');
  await ok(api('lab.tech', `/lab/orders/${o.id}/collect`, {}), 'collect');
  wl = await ok(api('lab.tech', '/outsource/worklist'), 'worklist2');
  assert.equal(wl.to_send.find((r) => r.id === o.id).ready, true);
  log.push(`2 doctor order ${o.order_no} routed to preferred centre (outsourced), paid, sample taken → ready to send`);

  // 3 dispatch + acknowledge
  await err(api('lab.tech', '/outsource/dispatches', { provider_id: lab.id, items: [{ order_id: o.id }] }), 400, 'courier_required', 'courier');
  await err(api('lab.tech', '/outsource/dispatches', { provider_id: ctr.id, courier_name: 'Ravi', items: [{ order_id: o.id }] }), 403, null, 'lab cannot dispatch to an imaging centre');
  const lab2 = await ok(api('hosp.admin', '/diagnostic-providers', { name: 'Second Lab (test)', kind: 'lab', billing: 'hospital' }), 'lab2');
  await err(api('lab.tech', '/outsource/dispatches', { provider_id: lab2.id, courier_name: 'Ravi', items: [{ order_id: o.id }] }), 409, 'order_not_for_this_centre', 'wrong centre');
  const d = await ok(api('lab.tech', '/outsource/dispatches', { provider_id: lab.id, courier_name: 'Ravi (runner)', courier_phone: '9000000001', temperature: '2–8 °C (cold box)', sample_condition: 'Good', items: [{ order_id: o.id }] }), 'dispatch');
  await err(api('lab.tech', '/outsource/dispatches', { provider_id: lab.id, courier_name: 'Ravi', items: [{ order_id: o.id }] }), 409, 'already_dispatched', 'twice');
  const man = await ok(api('lab.tech', `/outsource/dispatches/${d.id}`), 'manifest');
  assert.equal(man.items[0].provider_test_code, 'RL-0091'); assert.ok(man.items[0].expected_at > man.dispatched_at);
  await ok(api('lab.tech', `/outsource/dispatches/${d.id}/acknowledge`, { received_by: 'Suma (front desk)', external_refs: { [o.id]: 'RL-ACC-7781' } }), 'ack');
  wl = await ok(api('lab.tech', '/outsource/worklist'), 'worklist3');
  const sent = wl.sent.find((r) => r.id === o.id); assert.equal(sent.external_ref, 'RL-ACC-7781'); assert.equal(sent.status, 'in_progress');
  log.push(`3 dispatch ${d.dispatch_no}: courier required, wrong centre 409, manifest with their code + expected time (+30 h), centre signed, their ref stored, no double dispatch`);

  // 4 report v1: needs a file and a signatory; doctor does not see it until accepted
  await err(api('lab.tech', `/outsource/orders/${o.id}/report`, { signatory_name: 'Dr. X' }), 409, 'attach_the_report_first', 'file first');
  await ok(api('lab.tech', `/attachments/order/${o.id}`, { files: [pdf('report-v1')], note: 'Reference Lab report' }), 'attach v1');
  await err(api('lab.tech', `/outsource/orders/${o.id}/report`, {}), 400, 'signatory_required', 'signatory');
  const v1 = await ok(api('lab.tech', `/outsource/orders/${o.id}/report`, { external_report_no: 'RL/26/5521', signatory_name: 'Dr. K. Rao, MD Pathology', signatory_reg_no: 'APMC 44120', reported_at: '2026-10-27 09:30:00' }), 'record v1');
  assert.equal(v1.version, 1); assert.equal(v1.status, 'received'); assert.equal(v1.reporting_lab, 'Reference Lab (test)');
  { const x = db(); const st = x.prepare('SELECT status, result_stage FROM orders WHERE id=?').get(o.id); x.close(); assert.equal(st.status, 'in_progress'); assert.equal(st.result_stage, 'under_verification'); }
  log.push('4 report v1: no file 409, no signatory 400; recorded as received (their report no., signatory, reg. no.); order not yet published');

  // 5 acceptance with identity checks
  await err(api('lab.tech', `/outsource/reports/${v1.id}/accept`, { checks: { patient: true, test: true, sample: true } }), 403, null, 'technician cannot accept');
  await err(api('lab.manager', `/outsource/reports/${v1.id}/accept`, { checks: { patient: true, test: true } }), 400, 'identity_checks_required', 'all checks');
  const acc = await ok(api('lab.manager', `/outsource/reports/${v1.id}/accept`, { checks: { patient: true, test: true, sample: true } }), 'accept');
  assert.equal(acc.order.status, 'verified'); assert.equal(acc.order.result_stage, 'released');
  { const x = db(); const n = x.prepare("SELECT count(*) n FROM notifications WHERE user_id=? AND link LIKE ?").get(o.ordered_by, `%order=${o.id}%`).n; x.close(); assert.ok(n >= 1, 'doctor told'); }
  log.push('5 accept: technician 403, missing check 400; lab manager accepts → verified / released, ordering doctor notified');

  // 6 corrected report: v2 supersedes v1, order marked amended
  await ok(api('lab.tech', `/attachments/order/${o.id}`, { files: [pdf('report-v2-corrected')], note: 'Corrected report' }), 'attach v2');
  const v2 = await ok(api('lab.tech', `/outsource/orders/${o.id}/report`, { external_report_no: 'RL/26/5521-A', signatory_name: 'Dr. K. Rao, MD Pathology' }), 'record v2');
  assert.equal(v2.version, 2); assert.equal(v2.is_correction, 1); assert.equal(JSON.parse(v2.attachment_ids).length, 1, 'only the new file');
  const acc2 = await ok(api('lab.manager', `/outsource/reports/${v2.id}/accept`, { checks: { patient: true, test: true, sample: true } }), 'accept v2');
  assert.equal(acc2.corrected, true); assert.equal(acc2.order.result_stage, 'amended');
  const hist = await ok(api('doctor', `/outsource/orders/${o.id}/reports`), 'history');
  assert.deepEqual(hist.map((h) => h.status), ['accepted', 'superseded']);
  log.push('6 corrected report v2: only the new file, accepted → v1 superseded, order Amended; doctor sees both versions');

  // 7 imaging referral: study no + image link, reject then accept
  const p2 = await newPatient('Scan'); const e2 = await visit(p2);
  const io = (await ok(api('doctor', '/orders', { encounter_id: e2.id, items: [{ service_id: imgTest.id }] }), 'img order')).orders[0];
  assert.equal(io.provider_id, ctr.id); await payOrder(io);
  const d2 = await ok(api('radiology.tech', '/outsource/dispatches', { provider_id: ctr.id, items: [{ order_id: io.id, appointment_at: '2026-10-28 10:00:00' }] }), 'referral');
  wl = await ok(api('radiology.tech', '/outsource/worklist'), 'img wl');
  const it = wl.sent.find((r) => r.id === io.id);
  await err(api('radiology.tech', `/outsource/items/${it.item_id}`, { image_link: 'javascript:alert(1)' }, 'PATCH'), 400, 'image_link_invalid', 'bad link');
  await ok(api('radiology.tech', `/outsource/items/${it.item_id}`, { study_no: 'SC-CT-9912', image_link: 'https://pacs.example.test/study/9912' }, 'PATCH'), 'study');
  await ok(api('radiology.tech', `/attachments/order/${io.id}`, { files: [pdf('ct-report')] }), 'attach ct');
  const iv1 = await ok(api('radiologist', `/outsource/orders/${io.id}/report`, { signatory_name: 'Dr. S. Menon, MD Radiology', image_link: 'https://pacs.example.test/study/9912' }), 'img report');
  await err(api('radiologist', `/outsource/reports/${iv1.id}/reject`, {}), 400, 'reason_required', 'reject reason');
  await ok(api('radiologist', `/outsource/reports/${iv1.id}/reject`, { reason: 'Wrong age on report' }), 'reject');
  await ok(api('radiology.tech', `/attachments/order/${io.id}`, { files: [pdf('ct-report-fixed')] }), 'attach fixed');
  const iv2 = await ok(api('radiologist', `/outsource/orders/${io.id}/report`, { signatory_name: 'Dr. S. Menon, MD Radiology' }), 'img report 2');
  assert.equal(iv2.is_correction, 0, 'a rejected version is not a correction');
  await ok(api('radiologist', `/outsource/reports/${iv2.id}/accept`, { checks: { patient: true, test: true, sample: true } }), 'img accept');
  log.push(`7 imaging referral ${d2.dispatch_no}: appointment, study no + PACS link (unsafe link 400), report rejected with reason, re-sent and accepted`);

  // 8 centre's bill → payable → payment, through the books; patient bill untouched
  await err(api('lab.tech', '/outsource/invoices', { provider_id: lab.id, invoice_no: 'RL-INV-1', items: [{ order_id: o.id, cost: 210 }] }), 403, null, 'lab cannot enter bills');
  const unb = await ok(api('accounts', `/outsource/providers/${lab.id}/uninvoiced`), 'uninvoiced');
  assert.ok(unb.some((r) => r.id === o.id && r.expected_cost === 200));
  const inv = await ok(api('accounts', '/outsource/invoices', { provider_id: lab.id, invoice_no: 'RL-INV-1', invoice_date: '2026-10-27', items: [{ order_id: o.id, cost: 210 }] }), 'invoice');
  await err(api('accounts', '/outsource/invoices', { provider_id: lab.id, invoice_no: 'RL-INV-2', items: [{ order_id: o.id, cost: 210 }] }), 409, 'order_already_invoiced', 'once');
  await err(api('accounts', '/outsource/invoices', { provider_id: lab.id, invoice_no: 'RL-INV-1', items: [] }), 409, 'invoice_already_entered', 'same bill no');
  let pay = await ok(api('accounts', '/outsource/payables'), 'payables');
  assert.equal(pay.providers.find((x) => x.id === lab.id).outstanding, 210);
  await err(api('accounts', '/outsource/payments', { provider_id: lab.id, amount: 210, mode: 'bank_transfer' }), 400, 'reference_required', 'ref');
  await err(api('accounts', '/outsource/payments', { provider_id: lab.id, amount: 500, mode: 'bank_transfer', reference: 'UTR1' }), 400, 'amount_invalid', 'over');
  await ok(api('accounts', '/outsource/payments', { provider_id: lab.id, amount: 210, mode: 'bank_transfer', reference: 'UTR-778812' }), 'pay centre');
  pay = await ok(api('accounts', '/outsource/payables'), 'payables2');
  assert.equal(pay.providers.find((x) => x.id === lab.id).outstanding, 0); assert.equal(pay.invoices.find((x) => x.id === inv.id).status, 'paid');
  { const x = db();
    const exp = x.prepare("SELECT round(sum(l.debit-l.credit),2) v FROM journal_lines l JOIN accounts a ON a.id=l.account_id JOIN journal_vouchers v ON v.id=l.voucher_id WHERE a.system_key='exp_outsourced_tests' AND v.source='outsource_invoice' AND v.source_id=?").get(inv.id).v;
    const ap = x.prepare("SELECT round(sum(l.credit-l.debit),2) v FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE a.system_key='ap_diagnostic' AND l.party_id=?").get(lab.id).v;
    const delta = x.prepare('SELECT round(sum(debit-credit),2) d FROM journal_lines').get().d;
    x.close(); assert.equal(exp, 210); assert.equal(ap, 0); assert.ok(Math.abs(delta) < 0.005, 'books balance'); }
  assert.equal((await ok(api('reception', `/bills/${billId}`), 'bill after')).total, billBefore, 'no second patient charge');
  log.push(`8 centre bill ${inv.ref_no}: lab 403, matched to the order (rate ₹200, billed ₹210), once only, same bill no. refused; payable ₹210 → paid by bank (ref needed, no overpay); books balance; patient bill unchanged ₹${billBefore}`);

  // 9 reports
  const day = '2026-01-01', to = '2026-12-31';
  const mg = await ok(api('accounts', `/reports/run/outsourced_margin?from=${day}&to=${to}`), 'margin');
  const mr = mg.rows.find((r) => r.order_no === o.order_no);
  assert.equal(mr.cost, 210); assert.equal(mr.contribution, Math.round((mr.charged - 210) * 100) / 100); assert.equal(mr.cost_basis, 'Centre bill');
  const tat = await ok(api('hosp.admin', `/reports/run/outsourced_tat?from=${day}&to=${to}`), 'tat');
  assert.ok(tat.rows.some((r) => r.order_no === o.order_no && r.versions === 2));
  await ok(api('accounts', `/reports/run/outsourced_payables?from=${day}&to=${to}`), 'payables report');
  log.push(`9 reports: margin (charged ₹${mr.charged} − centre ₹210 = ₹${mr.contribution}), turnaround with 2 versions, payables statement`);

  // 10 MRI never outsourced either
  { const x = db(); const mri = x.prepare("SELECT id FROM services WHERE upper(name) LIKE '%MRI%' LIMIT 1").get(); x.close();
    if (mri) await err(api('hosp.admin', '/outsource/rates', { provider_id: ctr.id, service_id: mri.id, cost_price: 3000 }), 400, 'mri_not_offered', 'no MRI'); }
  log.push('10 MRI: cannot be given an outsourced rate');

  console.log(JSON.stringify({ ok: true, checks: log.length, log }, null, 1));
} catch (e) {
  console.error('FAIL', e.message); console.error(log.join('\n')); if (errOut) console.error(errOut.slice(-1500)); process.exitCode = 1;
} finally { srv.kill(); }
