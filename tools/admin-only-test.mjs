/** A new hospital has only its administrator and editable structural masters. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Exercise the actual browser header with each role's API payload: missing role
// on clinical/financial responses previously crashed all dashboard rendering.
const dashboardSource = fs.readFileSync(path.join(root,'client/src/views/dashboard.js'),'utf8');
const introStart = dashboardSource.indexOf('function roleIntro(d) {');
const introEnd = dashboardSource.indexOf('const tiles =',introStart);
const storeSource = fs.readFileSync(path.join(root,'client/src/store.js'),'utf8');
const canSource = storeSource.slice(storeSource.indexOf('export function can('),storeSource.indexOf('export async function loadSession')).replace('export function','function');
const nav = vm.runInNewContext(fs.readFileSync(path.join(root,'client/src/shell/nav.js'),'utf8').split('export function')[0].replaceAll('export const','const')+'; NAV');
function clientCan(perms) { return vm.runInNewContext(canSource+'; can',{state:{user:{perms}}}); }
const renderIntro = vm.runInNewContext(dashboardSource.slice(introStart,introEnd)+'; roleIntro', {
  state:{user:{role:'admin'}}, can:()=>true, esc:String, go:(route,label)=>label,
});

const tempRoot = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tempRoot, 'surelyhms-test-empty-'));
const probe = net.createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test', SURELY_DATA: dataDir, PORT: String(port), HMS_HOST: '127.0.0.1', HMS_REQUIRE_EXISTING_DB: '0' },
});
let output = '';
server.stdout.on('data', data => { output += data; });
server.stderr.on('data', data => { output += data; });
let token;
let apiChecks = 0;
async function call(route, body, method = body === undefined ? 'GET' : 'POST', status = 200) {
  const response = await fetch(`http://127.0.0.1:${port}/api${route}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(data)}`);
  apiChecks++;
  return data;
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server start timed out: ' + output)), 30000);
    server.stdout.on('data', () => {
      if (output.includes('sign in')) { clearTimeout(timer); resolve(); }
    });
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  const database = new DatabaseSync(path.join(dataDir, 'surelyhms.db'), { readOnly: true });
  let emptyTables = 0;
  try {
    assert.deepEqual(database.prepare('SELECT username, role FROM users').all().map(row => ({ ...row })), [{ username: 'admin', role: 'admin' }]);
    const structural = new Set(['settings', 'departments', 'users', 'counters', 'services', 'lab_params', 'wards', 'beds', 'accounts', 'sequences']);
    for (const { name } of database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      if (structural.has(name)) continue;
      assert.equal(database.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n, 0, `${name} must have no first-run records`);
      emptyTables++;
    }
    assert.equal(database.prepare("SELECT count(*) n FROM beds WHERE status <> 'vacant'").get().n, 0);
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { database.close(); }

  token = (await call('/auth/login', { username: 'admin', password: 'surely' })).token;
  assert.equal((await call('/admin/users')).length, 1);
  for (const username of ['doctor', 'reception', 'nurse', 'lab', 'pharmacy', 'owner', 'anand']) {
    await call('/auth/login', { username, password: 'surely' }, 'POST', 401);
  }
  let listEndpoints = 0;
  const routes = new Set();
  for (const filename of fs.readdirSync(path.join(root, 'server/routes'))) {
    const prefix = ({ patients: '/patients', pharmacy: '/pharmacy', inventory: '/pharmacy', 'ward-replacements': '/pharmacy', ipd: '/ipd' })[filename.replace('.js', '')] || '';
    for (const match of fs.readFileSync(path.join(root, 'server/routes', filename), 'utf8').matchAll(/\.get\('([^']+)'/g)) {
      if (match[1].startsWith('/') && !match[1].includes(':') && match[1] !== '/portal/me') routes.add(prefix + match[1]);   // /portal/me answers patient sessions only
    }
  }
  for (const route of routes) { await call(route); listEndpoints++; }
  const reportCatalog = await call('/reports/catalog');
  for (const report of reportCatalog.reports) await call('/reports/run/' + report.id);
  const dashboards = await call('/dashboard/role');
  for (const view of dashboards.available) await call('/dashboard/role?view=' + encodeURIComponent(view));
  const initial = await call('/dashboard/summary');
  for (const field of ['opd_today', 'new_patients', 'collections', 'cash', 'outstanding', 'payment_pending']) assert.equal(initial[field], 0, `empty dashboard ${field}`);

  // Every built-in staff login must resolve to its own authorised dashboard.
  const adminToken = token;
  const staffDepartment = (await call('/meta')).departments.find(d => d.kind === 'clinical');
  const expected = { cleaning:'work', cleaning_incharge:'work', hr_staff:'work', hr:'work', reception_admin: 'reception', pharmacy_admin: 'pharmacy', lab_admin: 'lab', owner: 'owner', accounts: 'owner', reception: 'reception', cashier: 'reception', doctor: 'doctor', nurse: 'nurse', lab: 'lab', radiology: 'lab', pharmacy: 'pharmacy', store: 'pharmacy', insurance: 'insurance', quality: 'quality' };
  for (const [role, view] of Object.entries(expected)) {
    token = adminToken;
    await call('/admin/users', { username: 'audit-' + role, name: 'Audit ' + role, role, department_id: role === 'doctor' ? staffDepartment.id : null, password: 'Local-test-pass-1' });
    token = (await call('/auth/login', { username: 'audit-' + role, password: 'Local-test-pass-1' })).token;
    const board = await call('/dashboard/role');
    assert.equal(board.view, view, role + ' default dashboard');
    assert.ok(renderIntro(board).includes('dashboard-intro'),role+' browser header renders');
    const session = await call('/auth/me');
    const roleCan = clientCan(session.user.perms);
    for (const item of nav.flatMap(g=>g.items)) assert.equal(roleCan(item.perm || []), Array.isArray(item.perm) ? item.perm.some(p=>roleCan(p)) : item.perm ? roleCan(item.perm) : false);
    { const att=nav.flatMap(g=>g.items).find(i=>i.route==='/attendance'); assert.ok(att && (!att.perm || roleCan(att.perm)), role+' attendance route is reachable'); }   // every login sees who is on duty

    assert.ok(board.available.includes(view));
    if (view === 'work') { assert.equal(board.role,role); assert.ok(board.attendance.every(a => a.name.startsWith('Audit'))); }
    if (role === 'radiology') assert.equal(board.category, 'imaging');
    if (role.endsWith('_admin')) {
      const base = {reception_admin:'reception', pharmacy_admin:'pharmacy', lab_admin:'lab'}[role];
      for (let i=1; i<=2; i++) await call('/admin/users', {username: role+'-staff-'+i, name:'Team member '+i, role:base, password:'Local-test-pass-1'});
      const directory = await call('/admin/users');
      assert.equal(directory.filter(u => u.username.startsWith(role+'-staff-')).length, 2);
      assert.ok(directory.every(u => u.role === role || [base, {reception_admin:'cashier',pharmacy_admin:'store',lab_admin:'radiology'}[role]].includes(u.role)));
      await call('/admin/users', {username:role+'-escalate',name:'Invalid',role:'admin'}, 'POST',403);
      await call('/admin/users/1', {password:'Forbidden'}, 'PATCH',403);
      const member = directory.find(u => u.username === role+'-staff-1');
      await call('/admin/users/'+member.id, {name:'Updated team member'}, 'PATCH');
      await call('/admin/users/'+member.id, {role:'doctor',department_id:staffDepartment.id}, 'PATCH',403);
      const assignable = await call('/admin/roles');
      assert.ok(!assignable.roles.some(r => r.role === 'admin'));
    }
    for (const denied of dashboards.available.filter(v => !board.available.includes(v))) await call('/dashboard/role?view=' + denied, undefined, 'GET', 403);
  }
  for (const [role, base] of [['imaging_admin','radiology'],['nursing_incharge','nurse'],['cleaning_incharge','cleaning'],['hr','hr_staff']]) {
    token = adminToken;
    if (!(role in expected)) await call('/admin/users', {username:'audit-'+role,name:role,role,password:'Local-test-pass-1'});
    token = (await call('/auth/login',{username:'audit-'+role,password:'Local-test-pass-1'})).token;
    const member = await call('/admin/users',{username:role+'-member',name:'Member',role:base,password:'Local-test-pass-1'});
    const allowedRoles = await call('/admin/roles');
    assert.ok(allowedRoles.roles.some(r => r.role === base));
    await call('/admin/users/1',{name:'Forbidden'},'PATCH',403);
    await call('/admin/users',{username:role+'-wrongdept',name:'Wrong',role:base,department_id:staffDepartment.id},'POST',400);
    if (role === 'imaging_admin') assert.equal((await call('/dashboard/role')).category,'imaging');
    if (role === 'nursing_incharge') assert.equal((await call('/dashboard/role')).view,'nurse');
    if (role === 'hr') await call('/admin/roster',{user_id:member.id,duty_date:new Date().toLocaleDateString('en-CA'),shift:'morning'});
  }
  token = adminToken;
  await call('/admin/roles', { role: 'audit-custom', copy_from: 'lab' });
  await call('/admin/users', { username: 'audit-custom', name: 'Custom lab', role: 'audit_custom', password: 'Local-test-pass-1' });
  token = (await call('/auth/login', { username: 'audit-custom', password: 'Local-test-pass-1' })).token;
  assert.equal((await call('/dashboard/role')).view, 'lab', 'custom role inherits authorised dashboard');
  token = adminToken;

  // Actual setup and the first OP visit work without sample doctor/patient rows.
  const meta = await call('/meta');
  const department = meta.departments.find(row => row.code === 'GEN');
  const doctor = await call('/admin/users', { username: 'first-doctor', name: 'First Doctor', role: 'doctor', password: 'Local-test-pass-1', department_id: department.id, op_fee: 500 });
  const patient = await call('/patients', { name: 'First Patient', gender: 'Female', age_years: 29, mobile: '9000000000' });
  const visit = await call('/encounters', { patient_id: patient.id, doctor_id: doctor.id });
  assert.equal(visit.bill.total, 500);
  await call(`/encounters/${visit.encounter.id}/stage`, { stage: 'in_consult' }, 'POST', 409);
  await call('/vitals', { encounter_id: visit.encounter.id, bp_sys: 120, bp_dia: 80, pulse: 72, spo2: 99, temp_f: 98.6 });
  const paid = await call('/payments', { bill_id: visit.bill.id, amount: 500, mode: 'cash' });
  assert.equal(paid.bill.balance, 0);
  token = (await call('/auth/login', { username: 'first-doctor', password: 'Local-test-pass-1' })).token;
  await call(`/encounters/${visit.encounter.id}/stage`, { stage: 'in_consult' });
  await call('/consultations', { encounter_id: visit.encounter.id, diagnosis: 'New installation verification', status: 'signed' });
  assert.equal((await call('/encounters/' + visit.encounter.id)).consultation.status, 'signed');
  await call('/admin/users', undefined, 'GET', 403);
  token = adminToken;
  const shiftUsers=await call('/admin/users');
  const incoming=shiftUsers.find(u=>u.username==='audit-cashier');
  token=(await call('/auth/login',{username:'audit-reception',password:'Local-test-pass-1'})).token;
  await call('/desk/shifts',{desk:'reception',to_user:incoming.id,from_shift:'morning',to_shift:'evening',cash_count:100,notes:''},'POST',400);
  await call('/desk/shifts',{desk:'reception',to_user:incoming.id,from_shift:'morning',to_shift:'evening',cash_count:100,notes:'Cash not collected at this desk'},'POST',400);
  const shift=await call('/desk/shifts',{desk:'reception',to_user:incoming.id,from_shift:'morning',to_shift:'evening',cash_count:0,notes:'Pending OP bills, empty drawer counted'});
  await call('/desk/shifts/'+shift.id+'/accept',{},'POST',403);
  token=(await call('/auth/login',{username:'audit-cashier',password:'Local-test-pass-1'})).token;
  assert.ok((await call('/desk/shifts?desk=reception')).list.some(s=>s.id===shift.id));
  await call('/desk/shifts/'+shift.id+'/accept',{});
  await call('/desk/shifts/'+shift.id+'/accept',{},'POST',409);
  console.log(JSON.stringify({ passed: true, apiChecks, emptyTables, listEndpoints, reportEndpoints: reportCatalog.reports.length, dashboards: dashboards.available.length, firstVisit: 'new doctor → new patient → OP registration → vitals → receipt → signed consultation' }, null, 2));
} finally {
  if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
  const resolved = fs.realpathSync(dataDir);
  if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith('surelyhms-test-empty-')) fs.rmSync(resolved, { recursive: true, force: true });
}

