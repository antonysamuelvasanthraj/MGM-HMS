import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.env.HMS_TEST_DATA || path.join(root, 'acceptance-backups', 'qa-20261027'));
const port = +(process.env.HMS_TEST_PORT || 4398);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surelyhms-qa-fixes-'));
for (const suffix of ['', '-wal', '-shm']) {
  const file = path.join(source, `surelyhms.db${suffix}`);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dataDir, `surelyhms.db${suffix}`));
}
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root, windowsHide: true,
  env: { ...process.env, SURELY_DATA: dataDir, PORT: String(port), HMS_HOST: '127.0.0.1', HMS_ENV: 'demo', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '', checks = 0;
child.stdout.on('data', (d) => { output += d; });
child.stderr.on('data', (d) => { output += d; });
const evidence = [];
const resultFile = path.join(root, 'reports', 'qa-fix-regression-results-20261030.json');

async function api(token, url, method = 'GET', body, expected = 200, error) {
  const response = await fetch(`http://127.0.0.1:${port}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  checks++;
  assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(value)}`);
  if (error) assert.equal(value.error, error, `${method} ${url}: wrong error`);
  return value;
}

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(output)), 30000);
    child.stdout.on('data', () => { if (output.includes('sign in')) { clearTimeout(timer); resolve(); } });
    child.on('exit', () => { clearTimeout(timer); reject(Error(output)); });
  });
  const logins = Object.fromEntries([...fs.readFileSync(path.join(root, 'DEMO-LOGINS.local.md'), 'utf8').matchAll(/`([^`]+)`\s*\|\s*`([^`]+)`/g)].map((m) => [m[1], m[2]]));
  const login = async (username) => (await api(null, '/auth/login', 'POST', { username, password: username === 'admin' ? 'surely' : logins[username] })).token;
  const admin = await login('admin');
  const radiologist = await login('radiologist');
  const technician = await login('radiology.tech');
  const reception = await login('reception');

  // Reproduce the original signed-USG overwrite attempt on a disposable copy.
  const before = await api(radiologist, '/imaging/orders/13');
  assert.ok(['final', 'amended'].includes(before.report?.status), 'signed imaging fixture');
  const oldVersion = before.report.version_no || 1;
  const oldImpression = before.report.impression;
  assert.equal(before.can_sign, true);
  assert.equal((await api(technician, '/imaging/orders/13')).can_sign, false);
  await api(technician, '/imaging/orders/13/report', 'POST', { findings: 'Technician final overwrite', impression: 'Invalid', status: 'final' }, 403, 'radiologist_sign_required');
  await api(technician, '/imaging/orders/13/report', 'POST', { findings: 'Technician draft overwrite', impression: 'Invalid', status: 'draft' }, 409, 'signed_report_immutable');
  await api(radiologist, '/imaging/orders/13/report', 'POST', { ...before.report, findings: 'QA amended findings', impression: 'QA amended impression', status: 'final' }, 400, 'amendment_reason_required');
  const amended = await api(radiologist, '/imaging/orders/13/report', 'POST', {
    kind: before.report.kind, technique: before.report.technique, findings: 'QA amended findings', impression: 'QA amended impression', advice: before.report.advice,
    status: 'final', reason: 'QA correction with preserved prior signed version',
  });
  assert.equal(amended.report.status, 'amended');
  assert.equal(amended.report.version_no, oldVersion + 1);
  const after = await api(radiologist, '/imaging/orders/13');
  const previous = after.report_history.find((v) => v.version_no === oldVersion);
  assert.ok(previous, 'previous signed report retained');
  assert.equal(previous.impression, oldImpression);
  assert.equal(previous.status, 'superseded');
  assert.equal(after.report.amendment_reason, 'QA correction with preserved prior signed version');
  assert.ok((await api(technician, '/imaging/worklist')).rows.every((r) => r.can_sign === false));
  assert.ok((await api(radiologist, '/imaging/worklist')).rows.every((r) => r.can_sign === true));
  const imagingAudits = await api(admin, '/audit?entity=reports');
  const amendmentAudit = imagingAudits.rows.find((r) => r.action === 'imaging.amend' && r.entity_id === before.report.id && r.reason === 'QA correction with preserved prior signed version');
  assert.ok(amendmentAudit?.before && amendmentAudit?.after, 'amendment audit includes before and after');
  evidence.push('USG: technician final 403, draft-over-signed 409, missing reason 400; radiologist amendment increments version, retains prior signed content and records before/after/reason audit.');

  // Chat is an immutable communication record for every role.
  const users = await api(admin, '/admin/users');
  const nurse = users.find((u) => u.username === 'nurse' && u.active);
  assert.ok(nurse, 'active nurse fixture');
  const thread = await api(admin, '/staff-work/direct', 'POST', { user_id: nurse.id });
  const message = await api(admin, '/staff-work/chat', 'POST', { thread_id: thread.id, body: 'QA immutable coordination message' });
  await api(admin, `/staff-work/chat/${message.id}`, 'PATCH', { body: 'Attempted replacement', version: message.version }, 409, 'chat_immutable');
  const messages = await api(admin, `/staff-work/chat?thread=${thread.id}`);
  assert.equal(messages.find((m) => m.id === message.id).body, message.body);
  assert.ok(Array.isArray(await api(admin, `/staff-work/chat/${message.id}/history`)));
  evidence.push('Chat: PATCH returns 409 chat_immutable, message body remains unchanged, and legacy history remains readable to management.');

  // Preventive maintenance: plan, reject duplicates and blank evidence, complete, then cancel another plan.
  const assets = await api(admin, '/maintenance/assets');
  const asset = assets.find((a) => a.status !== 'retired');
  assert.ok(asset, 'active asset fixture');
  const scheduledDate = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const serviceDate = new Date().toISOString().slice(0, 10);
  const plan = { asset_id: asset.id, title: `QA preventive service ${Date.now()}`, scheduled_date: scheduledDate, interval_days: 30, checklist: 'Inspect, clean, test and record safety checks' };
  await api(reception, '/maintenance/pm', 'POST', plan, 403);
  const pm = await api(admin, '/maintenance/pm', 'POST', plan);
  assert.equal(pm.status, 'scheduled');
  await api(admin, '/maintenance/pm', 'POST', plan, 409, 'pm_already_scheduled');
  await api(admin, `/maintenance/pm/${pm.id}/complete`, 'POST', { service_date: serviceDate, work_done: '   ' }, 400, 'work_done_required');
  const completed = await api(admin, `/maintenance/pm/${pm.id}/complete`, 'POST', { service_date: serviceDate, work_done: 'Completed inspection, cleaning, function and electrical-safety checks', vendor_reference: 'QA-PM-1', cost: 125 });
  const expectedNext = new Date(`${serviceDate}T00:00:00Z`).getTime() + 30 * 864e5;
  assert.equal(completed.status, 'completed');
  assert.equal(completed.next_service_date, new Date(expectedNext).toISOString().slice(0, 10));
  const servicedAsset = (await api(admin, '/maintenance/assets')).find((a) => a.id === asset.id);
  assert.equal(servicedAsset.last_service, serviceDate);
  assert.equal(servicedAsset.next_service, completed.next_service_date);
  assert.ok((await api(admin, '/maintenance/pm?status=completed')).some((p) => p.id === pm.id && p.work_done));
  const second = await api(admin, '/maintenance/pm', 'POST', { ...plan, title: `${plan.title} cancellation`, interval_days: '' });
  await api(admin, `/maintenance/pm/${second.id}/cancel`, 'POST', { reason: ' ' }, 400, 'reason_required');
  const cancelled = await api(admin, `/maintenance/pm/${second.id}/cancel`, 'POST', { reason: 'QA equipment withdrawn from service plan' });
  assert.equal(cancelled.status, 'cancelled');
  const pmAudits = await api(admin, '/audit?entity=preventive_maintenance');
  assert.ok(pmAudits.rows.some((r) => r.action === 'maintenance.pm.complete' && r.entity_id === pm.id && r.before && r.after && r.reason));
  evidence.push('Preventive maintenance: role denial, schedule, duplicate 409, blank completion 400, completion with recurring next date and asset dates, history, cancellation reason and before/after/reason audit all pass.');

  const result = { passed: true, checkedAt: new Date().toISOString(), apiChecks: checks, evidence, scope: 'Disposable copy of QA data; no live database or port 4300 changes' };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  fs.writeFileSync(resultFile, JSON.stringify({ passed: false, checkedAt: new Date().toISOString(), apiChecks: checks, evidence, error: error.message }, null, 2));
  throw error;
} finally {
  if (child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  const resolved = fs.realpathSync(dataDir);
  if (path.dirname(resolved) === fs.realpathSync(os.tmpdir()) && path.basename(resolved).startsWith('surelyhms-qa-fixes-')) fs.rmSync(resolved, { recursive: true, force: true });
}
