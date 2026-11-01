/**
 * Go-live checklist for the administrator (Settings). Each item is checked against the
 * live data, says what is wrong in plain words and links to the screen that fixes it.
 * Read-only: nothing here changes data.
 */
import { all, one } from './db.js';
import { verifyPassword } from './auth.js';
import { backupStatus } from './backup.js';

const DEFAULT_PASSWORDS = ['surely', 'admin123'];
// password checks are deliberately slow (scrypt); keep the result for 10 minutes, keyed on the stored hashes
let weakCache = { key: '', at: 0, rows: [] };

export function goLiveCheck() {
  const s = Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
  const items = [];
  const add = (key, ok, title, detail, href = null, level = ok ? 'ok' : 'warn') => items.push({ key, ok, level, title, detail, href });

  // 1. who the hospital is, on every bill and report
  const missing = [['hospital_name', 'name'], ['address', 'address'], ['phone', 'phone'], ['gstin', 'GSTIN']].filter(([k]) => !String(s[k] || '').trim()).map(([, l]) => l);
  const gstOk = !s.gstin || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(s.gstin).trim().toUpperCase());
  add('identity', !missing.length && gstOk, 'Hospital details on bills and reports',
    missing.length ? `Missing: ${missing.join(', ')}` : gstOk ? 'Name, address, phone and GSTIN are set' : 'GSTIN does not look valid (15 characters)', '/settings');

  // 2. demo mode
  const demo = process.env.HMS_ENV === 'demo' || s.demo_mode === '1';
  add('environment', !demo, 'Real mode, not demo', demo ? 'Running as a DEMO copy (yellow badge). Start with start-live.cmd without HMS_ENV=demo on the real database.' : 'Running in real mode', null);

  // 3. default passwords
  const users = all("SELECT id, username, password_hash FROM users WHERE active=1");
  const cacheKey = users.map((u) => u.password_hash).join('|');
  if (weakCache.key !== cacheKey || Date.now() - weakCache.at > 600000) {
    weakCache = { key: cacheKey, at: Date.now(), rows: users.filter((u) => DEFAULT_PASSWORDS.some((p) => { try { return verifyPassword(p, u.password_hash); } catch { return false; } })) };
  }
  const weak = weakCache.rows;
  add('passwords', !weak.length, 'No logins with default passwords',
    weak.length ? `${weak.length} login(s) still use a default password: ${weak.slice(0, 6).map((u) => u.username).join(', ')}${weak.length > 6 ? '…' : ''}` : 'Every active login has its own password', '/users');

  // 4. prices
  const unpriced = one("SELECT count(*) FROM services WHERE active=1 AND category IN ('lab','imaging','procedure','consultation') AND coalesce(price,0)=0");
  add('prices', !unpriced, 'Every test and procedure has a price', unpriced ? `${unpriced} active service(s) still at ₹0` : 'All active services are priced', '/tariff');
  const noFee = one("SELECT count(*) FROM users WHERE role='doctor' AND active=1 AND coalesce(op_fee,0)=0");
  add('doctor_fees', !noFee, 'Doctors have a consultation fee', noFee ? `${noFee} doctor(s) with no OP fee — their visits register as free` : 'All doctors have an OP fee', '/users');

  // 5. lab reference ranges
  const noRange = all(`SELECT s.code, s.name, count(*) n FROM lab_params p JOIN services s ON s.id=p.service_id
      WHERE s.active=1 AND p.active=1 AND coalesce(p.result_type,'numeric')<>'text' AND p.ref_low IS NULL AND p.ref_high IS NULL
        AND coalesce(p.ref_low_m, p.ref_high_m, p.ref_low_f, p.ref_high_f, p.ref_low_child, p.ref_high_child) IS NULL
        AND coalesce(trim(p.ref_text),'')='' AND coalesce(p.reference_rules,'[]') IN ('[]','')
      GROUP BY s.id ORDER BY s.name`);
  add('lab_ranges', !noRange.length, 'Lab results have reference ranges',
    noRange.length ? `${noRange.length} test(s) have results without a range: ${noRange.slice(0, 6).map((r) => r.name).join(', ')}${noRange.length > 6 ? '…' : ''}` : 'Every numeric result has a range', '/laboratory');

  // 6. backups
  const b = backupStatus();
  const latest = b.latest?.at ? new Date(String(b.latest.at).replace(' ', 'T')) : null;
  const hours = latest ? (Date.now() - latest.getTime()) / 36e5 : Infinity;
  add('backup', hours < 26, 'Backup taken in the last day', latest ? `Latest: ${b.latest.name} (${b.latest.at})` : 'No backup found yet', '/settings');
  add('offsite', false, 'Backups copied off this computer', `Copy ${b.folder} to another drive or cloud storage at least weekly — a failed disk loses everything kept only here.`, null, 'info');

  // 7. leftover demonstration records
  const demoRows = one("SELECT count(*) FROM patients WHERE name LIKE '%[DEMO%' OR name LIKE 'Manual Test%' OR name LIKE 'Workflow %'");
  add('demo_data', !demoRows, 'No demonstration patients', demoRows ? `${demoRows} demonstration / test patient record(s) — clear them before go-live (npm run demo:reset is for demo copies only)` : 'No demonstration records found', '/patients');

  const done = items.filter((i) => i.ok).length;
  return { items, done, total: items.filter((i) => i.level !== 'info').length, ready: items.every((i) => i.ok || i.level === 'info') };
}
