/**
 * Read-only integrity audit of the live database.
 *
 * Two different questions, deliberately reported apart:
 *
 *   integrity    absolute invariants — the books balance, no orphan rows, no
 *                negative stock. These never legitimately fail, so they alone
 *                decide the exit code.
 *   preservation drift against a recorded baseline (credential digest, patient
 *                count). This answers "did an upgrade quietly lose anything",
 *                which only means something next to a baseline someone took on
 *                purpose. Clearing demo data moves these numbers legitimately.
 *
 * They used to be one pass/fail. After demo data was cleared the patient count
 * moved 41 -> 27 and the credential digest changed, so the audit reported
 * passed:false on every run with the books in perfect order — a permanently red
 * check that hides the real ones. Drift is now reported, not failed on, and the
 * baseline is re-recorded deliberately:
 *
 *   node tools/extended-db-audit.mjs --rebaseline
 */
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASELINE = 'data/extended-ui-test-20261005/baseline.json';
const db = new DatabaseSync('data/surelyhms.db', {readOnly: true});
const n = (sql) => db.prepare(sql).get().n;
const hash = createHash('sha256').update(JSON.stringify(db.prepare('SELECT id,username,password_hash,role,active FROM users ORDER BY id').all())).digest('hex');
const patients = n('SELECT count(*) n FROM patients');

const integrity = {
  integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
  foreignKeys: db.prepare('PRAGMA foreign_key_check').all().length,
  unbalancedVouchers: n('SELECT count(*) n FROM (SELECT voucher_id FROM journal_lines GROUP BY voucher_id HAVING abs(sum(debit-credit))>0.01)'),
  negativeBatches: n('SELECT count(*) n FROM medicine_batches WHERE qty < -0.00001'),
  receiptMismatch: n('SELECT count(*) n FROM bills b WHERE abs(b.paid-coalesce((SELECT sum(amount) FROM payments p WHERE p.bill_id=b.id AND cancelled=0),0))>0.01'),
  balanceMismatch: n('SELECT count(*) n FROM bills WHERE abs(balance-(total-paid-coalesce(covered_amount,0)-coalesce(waived_amount,0)))>0.01'),
};
const passed = integrity.integrity === 'ok' && integrity.foreignKeys === 0 && integrity.unbalancedVouchers === 0
  && integrity.negativeBatches === 0 && integrity.receiptMismatch === 0 && integrity.balanceMismatch === 0;

if (process.argv.includes('--rebaseline')) {
  fs.mkdirSync(path.dirname(BASELINE), {recursive: true});
  fs.writeFileSync(BASELINE, JSON.stringify({recordedAt: new Date().toISOString(), credentialHash: hash, patients}, null, 2));
  console.log(`Baseline re-recorded: ${patients} patients, credential digest ${hash.slice(0, 12)}…`);
}

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
const preservation = base ? {
  baselineRecordedAt: base.recordedAt || 'unknown (pre-dates recordedAt)',
  credentialsUnchanged: hash === base.credentialHash,
  livePatients: patients,
  baselinePatients: base.patients,
  // Drift is a question for a person, not a build failure: clearing demo data moves both of these.
  drifted: hash !== base.credentialHash || patients !== base.patients,
} : {note: 'No baseline recorded. Run with --rebaseline to record one.'};

const result = {checkedAt: new Date().toISOString(), readOnly: true, passed, integrity, preservation};
db.close();
fs.mkdirSync('data/logs',{recursive:true});
fs.writeFileSync('data/logs/extended-live-integrity.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (preservation.drifted) console.log('\nPreservation drift against the recorded baseline. Expected after clearing demo data or changing logins;\nif it is not expected, investigate before re-baselining. Accept it with: node tools/extended-db-audit.mjs --rebaseline');
if (!passed) process.exitCode = 1;
