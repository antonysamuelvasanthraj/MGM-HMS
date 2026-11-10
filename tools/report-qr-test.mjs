/**
 * Lab report QR: share link, public page data, 90-day expiry, downloads switch, cloud address.
 * Runs against its own temporary server and database, never the hospital's.
 *   node tools/report-qr-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const dataDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'surelyhms-test-qr-'));
const port = String(Number(process.env.HMS_TEST_PORT || 4399) + 7);
const fx = spawnSync(process.execPath, ['tools/fixtures/hospital.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', SURELY_DATA: dataDir }, encoding: 'utf8' });
if (fx.status !== 0) throw new Error('Fixture load failed: ' + fx.stdout + fx.stderr);
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, SURELY_DATA: dataDir, PORT: port }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; server.stdout.on('data', (d) => { out += d; }); server.stderr.on('data', (d) => { out += d; });
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start: ' + out)), 30000);
    server.stdout.on('data', () => { if (out.includes('sign in')) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => { clearTimeout(t); reject(new Error('server exited ' + c + ': ' + out)); });
  });
  const B = `http://localhost:${port}`;
  let token;
  const call = async (p, body, method, auth = true) => {
    const r = await fetch(B + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(auth && token ? { 'X-Session': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { s: r.status, j: await r.json().catch(() => ({})) };
  };
  token = (await call('/api/auth/login', { username: 'admin', password: 'surely' }, 'POST', false)).j.token;
  await call('/api/admin/operating-mode', { mode: 'hybrid', reason: 'QR test setup', confirm: true });   // reception may bill lab tests
  const meta = (await call('/api/meta')).j;
  const svc = meta.services.find((s) => s.code === 'LAB-CBC') || meta.services.find((s) => s.category === 'lab');
  const pt = (await call('/api/patients', { name: 'QR Test Patient', gender: 'Female', age_years: 33, mobile: '9111111111' })).j;
  const billRes = await call('/api/reception/diagnostics', { patient_id: pt.id, referred_by: 'Dr. Test', items: [{ service_id: svc.id, priority: 'routine' }] });
  if (billRes.s !== 200) console.log('billing refused:', billRes.s, JSON.stringify(billRes.j));
  const bill = billRes.j.bill;
  await call('/api/payments', { bill_id: bill.id, amount: bill.balance, mode: 'cash' });
  const oid = (await call('/api/lab/worklist?stage=all&q=QR%20Test')).j.rows[0].id;
  await call(`/api/lab/orders/${oid}/collect`, {});
  const full = (await call(`/api/lab/orders/${oid}`)).j;
  const results = full.params.map((p) => ({ param_id: p.id, name: p.name, value: p.result_type === 'text' ? 'Normal' : String(((p.ref_low ?? 1) + (p.ref_high ?? 2)) / 2) }));

  // a printed report always gets a link, even before release and with no cloud
  const sh = await call('/api/lab/shares', { order_ids: [oid] });
  assert.equal(sh.s, 200);
  assert.match(sh.j.url, /\/r\/[a-f0-9]{36}$/);
  assert.equal(sh.j.scope, 'hospital');
  const tk = sh.j.token;
  assert.equal((await call('/api/public/report/' + tk, null, 'GET', false)).j.state, 'not_ready', 'unreleased results are never shown');
  await call(`/api/lab/orders/${oid}/results`, { results, verify: true });
  assert.equal((await call('/api/lab/shares', { order_ids: [oid] })).j.token, tk, 'the same report keeps the same link');

  // released: open without login, nothing internal leaks, expiry set
  const pub = await call('/api/public/report/' + tk, null, 'GET', false);
  assert.equal(pub.s, 200); assert.equal(pub.j.state, 'ready'); assert.ok(pub.j.reports[0].results.length > 0); assert.ok(pub.j.expires_at);
  assert.ok(!JSON.stringify(pub.j).includes('"mobile"') && !JSON.stringify(pub.j).includes('"patient_id"'), 'no internal fields on the public page');
  assert.equal((await fetch(B + '/r/' + tk)).status, 200, 'the report page is served');
  assert.equal((await call('/api/public/report/' + 'a'.repeat(36), null, 'GET', false)).s, 404);
  assert.equal((await call('/api/public/report/not-a-token', null, 'GET', false)).s, 404);

  // optional cloud: the QR points at the cloud address; off again → hospital network
  await call('/api/settings', { cloud_enabled: '1', cloud_base_url: 'https://reports.example.org' }, 'PATCH');
  const cl = await call('/api/lab/shares', { order_ids: [oid] });
  assert.equal(cl.j.scope, 'cloud'); assert.ok(cl.j.url.startsWith('https://reports.example.org/r/'));
  await call('/api/settings', { cloud_enabled: '0' }, 'PATCH');
  assert.equal((await call('/api/lab/shares', { order_ids: [oid] })).j.scope, 'hospital');

  // downloads switched off: QR still printed, public page refuses
  await call('/api/settings', { report_qr_download: '0' }, 'PATCH');
  assert.equal((await call('/api/public/report/' + tk, null, 'GET', false)).s, 403);
  assert.equal((await call('/api/lab/shares', { order_ids: [oid] })).j.download_enabled, false);
  await call('/api/settings', { report_qr_download: '1' }, 'PATCH');

  // three months after release the link stops working
  const db = new DatabaseSync(path.join(dataDir, 'surelyhms.db'));
  for(const status of ['reported','cancelled']){
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,oid);
    assert.equal((await call('/api/public/report/'+tk,null,'GET',false)).j.state,'not_ready','Unreleased or cancelled reports must not remain public because of an old verification timestamp');
  }
  db.prepare("UPDATE orders SET status='verified',verified_at=datetime('now','localtime','-100 days') WHERE id=?").run(oid); db.close();
  assert.equal((await call('/api/public/report/' + tk, null, 'GET', false)).s, 410, 'expired after the retention period');
  console.log('PASS report QR: link, public page, expiry, cloud address, downloads switch');
} finally {
  server.kill();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp folder still locked */ }
}
