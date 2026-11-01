/**
 * Payer change (OP / IP) regression on a disposable copy of the live database:
 *   node tools/payer-change-test.mjs        (needs DEMO-LOGINS.local.md and payers DEMO-STAR / DEMO-ARG / DEMO-CORP)
 * Money received → keep / refund guard, payer entries reversal, permissions, IP conversion,
 * patient-edit warning, audit before/after/reason and balanced books.
 */
import os from 'node:os'; import path from 'node:path';
import fs from 'node:fs'; import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-payer-'));
{ const source = process.env.HMS_TEST_DATA ? path.resolve(process.env.HMS_TEST_DATA, 'surelyhms.db') : path.resolve(import.meta.dirname, '../data/surelyhms.db'); const live = new DatabaseSync(source, { readOnly: true }); live.exec(`VACUUM INTO '${path.join(S, 'surelyhms.db').split(path.sep).join('/')}'`); live.close(); }
const P_ID = (code) => { const d = new DatabaseSync(path.join(S, 'surelyhms.db'), { readOnly: true }); const r = d.prepare('SELECT id FROM payers WHERE code=?').get(code)?.id; d.close(); return r; };
// This scenario explicitly tests an unprivileged requester, regardless of local custom grants.
{const fixture=new DatabaseSync(path.join(S,'surelyhms.db'));const row=fixture.prepare("SELECT perms FROM role_permissions WHERE role='reception'").get();if(row)fixture.prepare("UPDATE role_permissions SET perms=? WHERE role='reception'").run(JSON.stringify(JSON.parse(row.perms).filter(permission=>!['billing.*','billing.payer_approve','insurance.*','insurance.write','admin.*','admin.write','*'].includes(permission))));fixture.close();}
const PORT = +(process.env.HMS_TEST_PORT || 4393), B = `http://127.0.0.1:${PORT}/api`;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), SURELY_DATA: S, HMS_ENV: 'demo' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errOut = ''; srv.stderr.on('data', (d) => errOut += d);
for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise(r => setTimeout(r, 300)); } }
const md = fs.readFileSync(path.resolve(import.meta.dirname, '../DEMO-LOGINS.local.md'), 'utf8');
const pw = Object.fromEntries([...md.matchAll(/`([^`]+)`\s*\|\s*`([^`]+)`/g)].map(m => [m[1], m[2]]));
const tok = {}; const as = async (u) => tok[u] ||= (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw[u] }) })).json()).token;
async function api(u, path, body, method) { const r = await fetch(B + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', 'X-Session': await as(u) }, body: body === undefined ? undefined : JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { s: r.status, j }; }
const ok = async (p, msg) => { const r = await p; assert.equal(r.s, 200, `${msg}: ${r.s} ${JSON.stringify(r.j).slice(0, 300)}`); return r.j; };
const k = (t) => `pay-test-${t}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const db = () => new DatabaseSync(`${S}/surelyhms.db`, { readOnly: true });
const log = [];
try {
  const meta = (await api('reception', '/meta')).j; const doc = meta.doctors[0];
  const plist=[];
  for(let i=0;i<3;i++)plist.push(await ok(api('reception','/patients',{name:`Payer regression ${Date.now()} ${i}`,gender:'Female',age_years:30,payer_type:'self'}),'isolated test patient'));
  const P = { ARG: P_ID('DEMO-ARG'), CORP: P_ID('DEMO-CORP'), STAR: P_ID('DEMO-STAR') };
  const visit = async (pid) => { await api('hosp.admin', `/patients/${pid}`, { payer_type: 'self' }, 'PATCH'); return ok(api('reception', '/encounters', { patient_id: pid, doctor_id: doc.id, visit_type: 'new', priority: 'normal' }), 'register'); };
  const pay = (bill, amt) => ok(api('reception', `/bills/${bill}/settle`, { request_key: k('c'), lines: [{ mode: 'cash', amount: amt }] }), 'collect');

  await ok(api('hosp.admin', '/settings', { payer_change_requires_approval: '0' }, 'PATCH'), 'approval off');
  // 1. OP self-pay paid -> Aarogyasri: guard, then keep
  const v1 = await visit(plist[0].id); await pay(v1.bill.id, v1.bill.balance);
  let chk = await ok(api('reception', `/encounters/${v1.encounter.id}/payer-check`), 'check');
  assert.equal(chk.received, v1.bill.balance); assert.equal(chk.current.category, 'self');
  let r = await api('reception', `/encounters/${v1.encounter.id}/payer`, { category: 'aarogyasri', payer_id: P.ARG, reason: 'Card produced' });
  assert.equal(r.s, 409); assert.equal(r.j.error, 'money_received_choose_action');
  r = await api('reception', `/encounters/${v1.encounter.id}/payer`, { category: 'aarogyasri', payer_id: P.ARG, reason: 'Card produced', money_action: 'keep' });
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.equal(r.j.conversion.claim.status, 'preauth_pending');
  let bill = (await api('billing', `/bills/${v1.bill.id}`)).j; assert.equal(bill.payer_type, 'aarogyasri'); assert.equal(bill.paid, v1.bill.balance); assert.ok(bill.claim_id);
  assert.equal(r.j.stage, v1.encounter.stage, 'stage unchanged');
  log.push('1 OP self(paid) -> Aarogyasri: guard 409, keep OK, case preauth_pending, stage unchanged');

  // 2. OP self-pay paid -> insurance with refund (no credit note; charge stays)
  const v2 = await visit(plist[1].id); await pay(v2.bill.id, v2.bill.balance);
  r = await api('tpa.desk', `/encounters/${v2.encounter.id}/payer`, { category: 'insurance', payer_id: P.STAR, reason: 'Cashless', money_action: 'refund' });
  assert.equal(r.s, 403, 'insurance desk cannot hand out refunds: ' + r.s);
  r = await ok(api('reception', `/encounters/${v2.encounter.id}/payer`, { category: 'insurance', payer_id: P.STAR, policy_no: 'POL-1', reason: 'Cashless approved later', money_action: 'refund', refund_mode: 'cash' }), 'refund convert');
  assert.equal(r.conversion.refunds.length, 1);
  bill = (await api('billing', `/bills/${v2.bill.id}`)).j;
  assert.equal(bill.total, v2.bill.total, 'no credit note'); assert.equal(bill.paid, 0); assert.ok(bill.balance > 0); assert.equal(bill.payer_type, 'insurance');
  log.push('2 OP self(paid) -> insurance with refund: refunded ' + r.conversion.refunds[0].amount + ', total unchanged; insurance desk refund 403');

  // 3. OP unpaid -> corporate (auto-approved: balance moves to payer) -> back to self (reverse)
  const v3 = await visit(plist[2].id);
  r = await ok(api('tpa.desk', `/encounters/${v3.encounter.id}/payer`, { category: 'corporate', payer_id: P.CORP, reason: 'Employer letter' }), 'corp');
  bill = (await api('billing', `/bills/${v3.bill.id}`)).j; assert.ok(bill.balance < 0.01, 'corporate covered: balance ' + bill.balance);
  r = await api('reception', `/encounters/${v3.encounter.id}/payer`, { category: 'self', reason: 'Employer declined' });
  assert.equal(r.s, 409); assert.equal(r.j.error, 'payer_entries_to_reverse');
  r = await ok(api('reception', `/encounters/${v3.encounter.id}/payer`, { category: 'self', reason: 'Employer declined', reverse_payer_entries: true }), 'reverse');
  bill = (await api('billing', `/bills/${v3.bill.id}`)).j; assert.equal(bill.payer_type, 'self'); assert.equal(bill.balance, v3.bill.total); assert.ok(!bill.claim_id);
  const d0 = db(); const cs = d0.prepare('SELECT status FROM insurance_claims WHERE encounter_id=?').all(v3.encounter.id); d0.close(); assert.ok(cs.every(c => c.status === 'rejected'));
  log.push('3 OP -> corporate (auto-billed) -> self: guard 409, reversed, case rejected, balance back on patient');

  // 4. permissions + unchanged
  r = await api('lab.tech', `/encounters/${v3.encounter.id}/payer`, { category: 'credit', reason: 'x' }); assert.equal(r.s, 403);
  r = await api('reception', `/encounters/${v3.encounter.id}/payer`, { category: 'self', reason: 'x' }); assert.equal(r.s, 409); assert.equal(r.j.error, 'payer_unchanged');
  r = await api('reception', `/encounters/${v3.encounter.id}/payer`, { category: 'insurance', reason: 'x' }); assert.equal(r.s, 400);
  log.push('4 lab.tech 403, unchanged 409, payer missing 400');

  // 5. IP: admit self, deposit, convert to Aarogyasri (keep) and then credit
  const beds = (await api('reception', '/ipd/beds')).j; const bed = (beds.rows || beds.beds || beds).find(b => b.status === 'vacant' && !['icu', 'nicu', 'picu', 'hdu', 'labour', 'ot'].includes(b.ward_kind));
  await api('hosp.admin', `/patients/${plist[2].id}`, { payer_type: 'self' }, 'PATCH');
  if (!bed) throw new Error('no vacant ward bed'); const a = await ok(api('reception', '/ipd/admissions', { patient_id: plist[2].id, bed_id: bed.id, consultant_id: doc.id, financial_category: 'self', diagnosis: 'Test' }), 'admit');
  const adm = a.admission || a; const enc = adm.encounter_id; if (!bed || !enc) throw new Error('bed/adm ' + JSON.stringify({ bed: !!bed, keys: Object.keys(a).slice(0, 20) }));
  const encv = (await api('reception', `/encounters/${enc}`)).j; const ipb = encv.bills.find(b => b.bill_type === 'IP') || encv.bills[0];
  if (!ipb) throw new Error('no IP bill: ' + JSON.stringify({ adm: Object.keys(adm), enc, bills: encv.bills }).slice(0, 300));
  const dep = await api('reception', `/bills/${ipb.id}/settle`, { request_key: k('d'), lines: [{ mode: 'cash', amount: 2000 }], allow_advance: true });
  chk = await ok(api('reception', `/encounters/${enc}/payer-check`), 'ip check'); assert.ok(chk.admission_id);
  r = await api('reception', `/ipd/admissions/${adm.id}/payer`, { financial_category: 'aarogyasri', payer_id: P.ARG, reason: 'Scheme' }, 'PATCH');
  if (chk.received > 0) { assert.equal(r.s, 409, JSON.stringify({ r, adm: adm.id, enc })); assert.equal(r.j.error, 'money_received_choose_action'); r = await api('reception', `/ipd/admissions/${adm.id}/payer`, { financial_category: 'aarogyasri', payer_id: P.ARG, reason: 'Scheme', money_action: 'keep' }, 'PATCH'); }
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.equal(r.j.financial_category, 'aarogyasri');
  r = await ok(api('reception', `/encounters/${enc}/payer`, { category: 'credit', reason: 'Scheme not eligible', reverse_payer_entries: true }), 'ip -> credit via visit route');
  const d1 = db(); const af = d1.prepare('SELECT financial_category FROM admissions WHERE id=?').get(adm.id).financial_category; d1.close(); assert.equal(af, 'credit');
  log.push(`5 IP self (deposit status ${dep.s}, received ${chk.received}) -> Aarogyasri ${chk.received > 0 ? '(guard 409, keep)' : ''} -> credit OK`);

  // 6. patient edit reports open visits that keep the old payer
  const pe = await ok(api('reception', `/patients/${plist[0].id}`, { payer_type: 'corporate', payer_id: P.CORP }, 'PATCH'), 'patient edit');
  assert.ok(pe.payer_open_visits?.some(v => v.encounter_id === v1.encounter.id), 'open visit listed');
  log.push('6 patient payer edit returns ' + pe.payer_open_visits.length + ' open visit(s)');

  // 8. S2 request -> approve (setting on)
  await ok(api('hosp.admin', '/settings', { payer_change_requires_approval: '1' }, 'PATCH'), 'approval on');
  const v8 = await visit(plist[1].id); await pay(v8.bill.id, v8.bill.balance);
  r = await api('reception', `/encounters/${v8.encounter.id}/payer`, { category: 'insurance', payer_id: P.STAR, reason: 'x', money_action: 'keep' });
  assert.equal(r.s, 409); assert.equal(r.j.error, 'payer_change_needs_approval');
  r = await api('reception', `/encounters/${v8.encounter.id}/payer-request`, { category: 'insurance', payer_id: P.STAR, reason: 'Policy shown' });
  assert.equal(r.s, 409); assert.equal(r.j.error, 'money_received_choose_action', 'guard runs at request time');
  const q8 = await ok(api('reception', `/encounters/${v8.encounter.id}/payer-request`, { category: 'insurance', payer_id: P.STAR, policy_no: 'POL-8', reason: 'Policy shown', money_action: 'refund', refund_mode: 'upi' }), 'request');
  assert.equal(q8.status, 'pending'); assert.ok(q8.refund_allowed);
  bill = (await api('billing', `/bills/${v8.bill.id}`)).j; assert.equal(bill.payer_type, 'self', 'nothing moves before approval');
  r = await api('reception', `/encounters/${v8.encounter.id}/payer-request`, { category: 'credit', reason: 'dup' }); assert.equal(r.s, 409); assert.equal(r.j.error, 'payer_request_already_pending');
  r = await api('reception', `/payer-requests/${q8.id}/approve`, {}); assert.equal(r.s, 403, 'reception cannot approve');
  const list = await ok(api('tpa.desk', '/payer-requests?status=pending'), 'queue'); assert.ok(list.can_approve && list.rows.some((x) => x.id === q8.id));
  const a8 = await ok(api('tpa.desk', `/payer-requests/${q8.id}/approve`, { note: 'Verified with insurer' }), 'approve');
  assert.equal(a8.status, 'approved'); assert.equal(a8.result.refunds.length, 1, 'refund done on approval although the insurance desk holds no cash rights');
  bill = (await api('billing', `/bills/${v8.bill.id}`)).j; assert.equal(bill.payer_type, 'insurance'); assert.equal(bill.paid, 0);
  r = await api('tpa.desk', `/payer-requests/${q8.id}/approve`, {}); assert.equal(r.s, 409);
  // reject and withdraw
  const v9 = await visit(plist[0].id);
  const q9 = await ok(api('reception', `/encounters/${v9.encounter.id}/payer-request`, { category: 'corporate', payer_id: P.CORP, reason: 'Employer' }), 'req9');
  r = await api('tpa.desk', `/payer-requests/${q9.id}/reject`, {}); assert.equal(r.s, 400);
  r = await ok(api('tpa.desk', `/payer-requests/${q9.id}/reject`, { reason: 'No employer letter' }), 'reject'); assert.equal(r.status, 'rejected');
  const q9b = await ok(api('reception', `/encounters/${v9.encounter.id}/payer-request`, { category: 'credit', reason: 'Pays next week' }), 'req9b');
  r = await api('lab.tech', `/payer-requests/${q9b.id}/cancel`, {}); assert.equal(r.s, 403);
  r = await ok(api('reception', `/payer-requests/${q9b.id}/cancel`, {}), 'withdraw'); assert.equal(r.status, 'cancelled');
  bill = (await api('billing', `/bills/${v9.bill.id}`)).j; assert.equal(bill.payer_type, 'self');
  log.push('8 S2: direct 409 for reception, guard at request, pending blocks bills, dup 409, reception approve 403, TPA approves (refund via request), reject needs reason, withdraw');

  // 9. S5 Aarogyasri checklist blocks approval until complete
  const c1 = (await api('tpa.desk', `/insurance/claims?payer_type=aarogyasri`)).j.rows.find((c) => c.encounter_id === v1.encounter.id);
  assert.ok(c1?.checklist && !c1.checklist.complete, 'checklist shown');
  r = await api('tpa.desk', `/insurance/claims/${c1.id}`, { status: 'preauth_approved', approved: 500 }, 'PATCH');
  assert.equal(r.s, 409); assert.equal(r.j.error, 'scheme_checklist_incomplete'); assert.ok(r.j.missing.length >= 2);
  const pkgs = (await api('tpa.desk', '/packages')).j; const pkg = (pkgs.rows || pkgs).find((k) => k.active && (!k.payer_id || k.payer_id === P.ARG));
  r = await api('tpa.desk', `/insurance/claims/${c1.id}`, { scheme_card_no: 'ARG-CARD-1', eligibility_proof: 'White ration card', eligibility_verified: '1', preauth_no: 'PA-77', package_id: pkg?.id, status: 'preauth_approved', approved: 500 }, 'PATCH');
  assert.equal(r.s, 200, JSON.stringify(r.j).slice(0, 300)); assert.equal(r.j.status, 'preauth_approved');
  log.push('9 S5: Aarogyasri approval blocked (missing ' + 'items' + '), approved once card/eligibility/package/pre-auth recorded');

  // 10. S6 missed-conversion filter + discharge warning
  const v10 = await visit(plist[2].id === undefined ? plist[0].id : plist[0].id);
  await api('hosp.admin', `/patients/${plist[0].id}`, { payer_type: 'corporate', payer_id: P.CORP }, 'PATCH');
  const mm = (await api('billing', '/bills?payer_mismatch=1&limit=300')).j; assert.ok((mm.rows || mm).some((b) => b.id === v10.bill.id), 'mismatch filter lists the self-pay bill');
  const db10 = (await api('reception', '/ipd/discharge/board')).j; assert.ok(Array.isArray(db10.rows));
  log.push('10 S6: payer-mismatch bills filter works; discharge board returns payer_warning field');

  // 7. audit + books
  const d2 = db(); const aud = d2.prepare("SELECT count(*) n FROM audit_log WHERE action IN ('encounter.payer.convert','ipd.payer.convert') AND before_json IS NOT NULL AND reason IS NOT NULL").get().n;
  const bk = d2.prepare('SELECT round(sum(debit),2) d, round(sum(credit),2) c FROM journal_lines').get(); d2.close();
  assert.ok(aud >= 5, 'audit rows ' + aud);
  assert.ok(Math.abs(bk.d - bk.c) < 0.01, 'books ' + JSON.stringify(bk));
  const integ = (await api('hosp.admin', '/accounts/integrity')).j;
  log.push(`7 audit rows ${aud} with before/after/reason; books balanced ${bk.d}=${bk.c}; integrity ${JSON.stringify(integ).slice(0, 160)}`);
  console.log(log.join('\n')); console.log('ALL PAYER-CHANGE CHECKS PASSED');
} catch (e) { console.log(log.join('\n')); console.error('FAIL', e.message); process.exitCode = 1; } finally { srv.kill(); if (errOut.trim()) console.log('server stderr:', errOut.slice(0, 800)); }
