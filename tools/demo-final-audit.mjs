/** Read-only audit of the running demo's database and application files. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const db = new DatabaseSync(path.resolve('data/surelyhms.db'), { readOnly: true });
const failures = [];
const count = sql => db.prepare(sql).get().n;
const checks = {
  integrity: db.prepare('PRAGMA integrity_check').all().every(x => x.integrity_check === 'ok'),
  foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length,
  unbalancedVouchers: count('SELECT count(*) n FROM (SELECT voucher_id FROM journal_lines GROUP BY voucher_id HAVING abs(sum(debit)-sum(credit))>0.01)'),
  negativeStockBatches: count('SELECT count(*) n FROM medicine_batches WHERE qty < -0.00001'),
  paymentTotalMismatches: count(`SELECT count(*) n FROM bills b WHERE abs(b.paid-coalesce((SELECT sum(p.amount) FROM payments p WHERE p.bill_id=b.id AND p.cancelled=0),0))>0.01`),
  billBalanceMismatches: count(`SELECT count(*) n FROM bills WHERE abs(balance-(total-paid-coalesce(covered_amount,0)-coalesce(waived_amount,0)))>0.01`),
  orphanPaymentBills: count('SELECT count(*) n FROM payments p WHERE p.bill_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bills b WHERE b.id=p.bill_id)'),
};
for (const [key,value] of Object.entries(checks)) if (key==='integrity' ? !value : value!==0) failures.push(key);
const users=db.prepare('SELECT * FROM users ORDER BY id').all();
const userHash=createHash('sha256').update(JSON.stringify(users)).digest('hex');
const baselinePath=process.argv.find(arg=>arg.startsWith('--login-baseline='))?.slice('--login-baseline='.length)||'data/demo-login-audit.json';
const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
checks.loginRecordsUnchanged=userHash===baseline.hash;
if (!checks.loginRecordsUnchanged) failures.push('loginRecordsUnchanged');
let syntaxFiles=0;
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
for(const file of ['server','client/src','tools','deployment'].flatMap(walk).filter(f=>/\.(js|mjs|cjs)$/.test(f))) {
  syntaxFiles++;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0) failures.push(`syntax:${file}`);
}
let importLinks=0;
for(const file of ['server','client/src'].flatMap(walk).filter(f=>f.endsWith('.js'))) {
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"`]+)\1/g)) {
    importLinks++;
    if(!fs.existsSync(path.resolve(path.dirname(file),match[2]))) failures.push(`import:${file}:${match[2]}`);
  }
}
const result={checkedAt:new Date().toISOString(),passed:failures.length===0,checks,users:users.length,rolesInUse:count('SELECT count(DISTINCT role) n FROM users'),departments:count('SELECT count(*) n FROM departments'),syntaxFiles,importLinks,failures};
fs.writeFileSync('data/demo-final-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
db.close();
if(failures.length) process.exitCode=1;
