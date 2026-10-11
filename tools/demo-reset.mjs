/**
 * Repeatable demo reset:  npm run demo:reset -- --confirm
 *
 *  1. refuses while the HMS is running on its port (stop it first) — the reset works offline
 *  2. backup of the whole database (outside the data folder: ../MGM HMS-backups by default)
 *  3. clears every patient / transaction table (visits, admissions, ER, bills, receipts, stock, GRNs,
 *     claims, nursing, OT, maternity, notifications, audit…) — keeps the schema, settings, departments,
 *     services & tariff, lab parameters, wards & beds, accounts chart, role permissions, all logins
 *     (the primary admin untouched) and the reference masters
 *  4. all beds back to vacant
 *  5. demo masters (seed-demo-masters) and department logins (seed-demo-staff, same passwords as the sheet)
 *  6. starts a private temporary server, drives the realistic demo workflows through the real API
 *     (seed-demo-workflows), stops it
 * Safe to repeat: every run ends in the same known demo state.
 *
 * Options: --data <dir> (default ./data or SURELY_DATA)   --backups <dir>   --skip-workflows
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { clearDemoData } from './clear-demo-data.mjs';

const root = path.resolve(import.meta.dirname, '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
if (!process.argv.includes('--confirm')) {
  console.error('This clears all patients and transactions (logins, settings and masters are kept). Re-run with --confirm.');
  process.exit(1);
}
const dataDir = path.resolve(arg('--data', process.env.SURELY_DATA || path.join(root, 'data')));
const backups = path.resolve(arg('--backups', path.join(root, '..', 'MGM HMS-backups')));
const port = Number(process.env.PORT || 4300);
const env = { ...process.env, SURELY_DATA: dataDir };

const listening = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
if (dataDir === path.join(root, 'data') && await listening(port)) {
  console.error(`The HMS is running on port ${port}. Stop it (close the server window), then run the reset again.`);
  process.exit(1);
}
const run = (script, extra = []) => {
  const r = spawnSync(process.execPath, [path.join(root, 'tools', script), ...extra], { cwd: root, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${script} failed (${r.status})`);
};

console.log(`1/5  backup + clear transactions in ${dataDir}`);
const result = await clearDemoData(dataDir, backups, { preserveLogins: true, preserveMasters: true });
console.log(`     backup: ${result.backup?.file || result.backup || 'created'}`);
const db = new DatabaseSync(path.join(dataDir, 'surelyhms.db'));
db.exec("UPDATE beds SET status='vacant', status_at=datetime('now','localtime')");
db.close();

console.log('2/5  demo masters'); run('seed-demo-masters.mjs');
console.log('3/5  department logins'); run('seed-demo-staff.mjs');

if (!process.argv.includes('--skip-workflows')) {
  console.log('4/5  demo workflows on a private temporary server');
  const tmpPort = 4390 + Math.floor(Math.random() * 8);
  const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...env, PORT: String(tmpPort), HMS_HOST: '127.0.0.1', HMS_ENV: 'demo' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${tmpPort}/api/health`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 1000)); }
    const r = spawnSync(process.execPath, [path.join(root, 'tools', 'seed-demo-workflows.mjs'), '--url', `http://127.0.0.1:${tmpPort}`], { cwd: root, env, stdio: 'inherit' });
    if (r.status === 2) console.warn('     some workflow steps failed — see reports/DEMO-WORKFLOW-SEED-*.json');
    else if (r.status !== 0) throw new Error('workflow seeding failed');
  } finally { server.kill(); }
}
console.log('5/5  done. Start the HMS (npm run demo, or start-live.cmd) — logins are in DEMO-LOGINS.local.md.');
