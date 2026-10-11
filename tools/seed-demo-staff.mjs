/**
 * Department logins for the hospital demonstration.
 *
 *   node tools/seed-demo-staff.mjs                    create missing accounts, keep existing passwords
 *   node tools/seed-demo-staff.mjs --new-passwords    issue fresh passwords to every demo staff account
 *
 * - The primary `admin` login is never touched, nor any account not listed here.
 * - The old one-click `demo.*` logins are switched off (demo mode off) — they are replaced by these.
 * - Each account gets its own random password, stored only as a hash in the database. The plain
 *   passwords are written once to DEMO-LOGINS.local.md in the project folder (never served to browsers);
 *   hand that sheet out privately. Re-running without --new-passwords never changes a password.
 * - Safe to repeat: matched by login ID, updated in place, never duplicated.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, insert, update, run } from '../server/db.js';
import { hashPassword, DEFAULT_ROLE_PERMS } from '../server/auth.js';

const root = path.resolve(import.meta.dirname, '..');
const sheet = path.join(root, 'DEMO-LOGINS.local.md');
const fresh = process.argv.includes('--new-passwords');

// [login ID, name, role, department code, designation, access summary, doctor fields]
export const STAFF = [
  ['owner', 'Mr. Raghava Reddy', 'owner', 'ADMIN', 'Owner / Managing Director', 'Revenue, expenses, profitability, OP/IP statistics, occupancy, receivables, analytics'],
  ['hosp.admin', 'Mrs. Lakshmi Prasanna', 'admin', 'ADMIN', 'Hospital Administrator', 'Full system administration'],
  ['med.supdt', 'Dr. Venkata Ramana', 'medical_superintendent', 'ADMIN', 'Medical Superintendent', 'Clinical activity, census, ICU/ER/OT, occupancy, quality, incidents, audit'],
  ['reception', 'Ms. Kavya Sree', 'reception', 'RECP', 'Front Office Executive', 'Registration, search, appointments, OP queue & collection, admission'],
  ['registration', 'Mr. Sai Teja', 'reception', 'RECP', 'Registration Executive', 'Patient registration, search, appointments, OP queue'],
  ['billing', 'Mr. Naveen Kumar', 'cashier', 'RECP', 'Billing Executive', 'Bills, collections, receipts, refunds, counter handover'],
  ['op.billing', 'Ms. Divya Bharathi', 'cashier', 'RECP', 'OP Billing Executive', 'OP fee & service collections, receipts'],
  ['ip.billing', 'Mr. Harish Babu', 'cashier', 'RECP', 'IP Billing Executive', 'IP deposits, running bills, final settlement'],
  ['doctor', 'Dr. Suresh Babu', 'doctor', 'GEN', 'Consultant Physician', 'Queue, consultation, prescription, orders, admission, follow-up', { qualification: 'MBBS, MD (General Medicine)', op_fee: 500, followup_fee: 300, followup_days: 7, reg_no: 'APMC-DEMO-1001' }],
  ['consultant', 'Dr. Anitha Reddy', 'doctor', 'OBG', 'Consultant Obstetrician & Gynaecologist', 'Antenatal, maternity, gynaecology consultations', { qualification: 'MBBS, MS (OBG)', op_fee: 600, followup_fee: 300, followup_days: 10, reg_no: 'APMC-DEMO-1002' }],
  ['duty.doctor', 'Dr. Pavan Kalyan', 'doctor', 'EMER', 'Duty Medical Officer (Casualty)', 'Emergency assessment, ER treatment, admissions', { qualification: 'MBBS', op_fee: 300, followup_fee: 200, followup_days: 5, reg_no: 'APMC-DEMO-1003' }],
  ['senior.doctor', 'Dr. Srinivasa Rao', 'doctor', 'SURG', 'Senior Consultant Surgeon', 'Surgery, OT cases, IP rounds', { qualification: 'MBBS, MS (General Surgery)', op_fee: 700, followup_fee: 400, followup_days: 10, reg_no: 'APMC-DEMO-1004' }],
  ['dr.peds', 'Dr. Haritha Devi', 'doctor', 'PED', 'Consultant Paediatrician', 'Paediatric OP / IP, NICU / PICU rounds', { qualification: 'MBBS, MD (Paediatrics)', op_fee: 500, followup_fee: 300, followup_days: 7, reg_no: 'APMC-DEMO-1005' }],
  ['dr.ortho', 'Dr. Mahesh Chandra', 'doctor', 'ORTHO', 'Consultant Orthopaedic Surgeon', 'Orthopaedic OP, procedures, OT', { qualification: 'MBBS, MS (Ortho)', op_fee: 600, followup_fee: 300, followup_days: 10, reg_no: 'APMC-DEMO-1006' }],
  ['dr.cardio', 'Dr. Prakash Varma', 'doctor', 'CARD', 'Consultant Cardiologist', 'Cardiology OP, ICU consults, ECG / Echo', { qualification: 'MBBS, MD, DM (Cardiology)', op_fee: 800, followup_fee: 400, followup_days: 15, reg_no: 'APMC-DEMO-1007' }],
  ['nurse', 'Ms. Swathi', 'nurse', 'NURS', 'Staff Nurse (General Ward)', 'Assigned patients, vitals, eMAR, nursing notes, intake/output, handover'],
  ['nursing.supervisor', 'Mrs. Mary Grace', 'nursing_incharge', 'NURS', 'Nursing Supervisor', 'All wards nursing, rosters, indents, handover review'],
  ['icu.nurse', 'Ms. Priyanka', 'nurse', 'ICU', 'ICU Staff Nurse', 'ICU charting, vitals, eMAR, alerts'],
  ['nicu.nurse', 'Ms. Sirisha', 'nurse', 'PED', 'NICU Staff Nurse', 'NICU charting, feeds, vitals'],
  ['picu.nurse', 'Ms. Bhavani', 'nurse', 'PED', 'PICU Staff Nurse', 'PICU charting, vitals, eMAR'],
  ['ot.nurse', 'Ms. Jyothi', 'nurse', 'OT', 'OT Staff Nurse', 'OT checklist, consumables, recovery'],
  ['er.nurse', 'Mr. Kiran', 'nurse', 'EMER', 'ER Staff Nurse', 'Triage, ER vitals, rack usage'],
  ['lab.tech', 'Mr. Ramesh', 'lab', 'LAB', 'Laboratory Technician', 'Test queue, sample collection, result entry'],
  ['lab.manager', 'Mrs. Padmavathi', 'lab_admin', 'LAB', 'Laboratory Manager', 'Verification, reports, lab staff'],
  ['radiology.tech', 'Mr. Vamsi', 'radiology', 'RAD', 'Radiographer', 'Imaging worklist, scans, USG / X-ray reports'],
  ['radiologist', 'Dr. Lavanya', 'imaging_admin', 'RAD', 'Consultant Radiologist', 'Imaging reports, sign-off, imaging team'],
  ['pharmacist', 'Mr. Gopi Krishna', 'pharmacy', 'PHAR', 'Pharmacist (OP / IP)', 'Prescription queue, OP & IP dispensing, returns, indents'],
  ['pharmacy.manager', 'Mr. Chandra Sekhar', 'pharmacy_admin', 'PHAR', 'Pharmacy Manager', 'Pharmacy, GRN, transfers approval, expiry, pharmacy staff'],
  ['central.pharmacy', 'Mr. Anil', 'store', 'PHAR', 'Central Pharmacy Store Keeper', 'Central store stock, GRN, transfers, indents'],
  ['purchase.manager', 'Mr. Murali', 'store', 'PHAR', 'Purchase Manager', 'Suppliers, purchase / GRN, price alerts'],
  ['store.manager', 'Mr. Subrahmanyam', 'store', 'PHAR', 'Store Manager', 'General stores, materials, QR labels'],
  ['inventory.manager', 'Mrs. Rajeswari', 'store', 'PHAR', 'Inventory Manager', 'Stock levels, transfers, expiry, counts'],
  ['accounts', 'Mr. Venkatesh', 'accounts', 'ACC', 'Accounts Officer', 'Collections, expenses, receivables, payables, day closing'],
  ['finance.manager', 'Mrs. Sujatha', 'accounts', 'ACC', 'Finance Manager', 'Finance reports, receivables, payables, books'],
  ['tpa.desk', 'Mr. Rajesh', 'insurance', 'INS', 'TPA / Insurance Coordinator', 'Payer cases, pre-auth, approvals, claims, settlements'],
  ['ward.incharge', 'Mrs. Annapurna', 'nursing_incharge', 'NURS', 'Ward In-charge', 'Ward nursing, indents, handover'],
  ['icu.incharge', 'Mrs. Shobha', 'nursing_incharge', 'ICU', 'ICU In-charge', 'ICU nursing, indents, alerts'],
  ['ot.incharge', 'Mrs. Vijaya', 'ot_incharge', 'OT', 'OT In-charge', 'OT schedule, checklists, OT stock'],
  ['er.incharge', 'Mr. Prasad', 'er_incharge', 'EMER', 'ER In-charge', 'Emergency desk, triage, ER stock'],
  ['hr', 'Mrs. Madhavi', 'hr', 'HR', 'HR Manager', 'Staff, rosters, attendance'],
  ['maintenance', 'Mr. Suresh Naidu', 'maintenance', 'ADMIN', 'Biomedical & Maintenance Engineer', 'Asset register, maintenance tickets, AMC / service schedule'],
];

const pw = () => `Mgm@${crypto.randomBytes(3).toString('hex').toUpperCase()}${crypto.randomInt(10, 99)}`;
const known = fs.existsSync(sheet) ? Object.fromEntries([...fs.readFileSync(sheet, 'utf8').matchAll(/^\| [^|]+ \| [^|]+ \| `([^`]+)` \| `([^`]+)` \|/gm)].map((m) => [m[1], m[2]])) : {};

const out = [];
let n = 0;
for (const [username, name, role, dept, designation, access, doc = {}] of STAFF) {
  n++;
  if (!DEFAULT_ROLE_PERMS[role] && role !== 'admin') throw new Error(`Unknown role ${role}`);
  const department_id = get('SELECT id FROM departments WHERE code=?', dept)?.id || null;
  const staff_code = `MGM-EMP-${String(n).padStart(3, '0')}`;
  const existing = get('SELECT * FROM users WHERE username=?', username);
  if (username === 'admin') continue;                       // never
  let password = known[username];
  const fields = { name, role, designation, department_id, active: 1, staff_code, ...doc };
  if (!existing) { if (fresh || !password) password = pw(); insert('users', { username, password_hash: hashPassword(password), ...fields }); }
  else {
    if (fresh || !password) password = pw();
    // the sheet is the single source: an account always ends up with the password written on it
    update('users', existing.id, { ...fields, password_hash: hashPassword(password) });
    if (fresh) run('DELETE FROM sessions WHERE user_id=?', existing.id);
  }
  const deptName = get('SELECT name FROM departments WHERE code=?', dept)?.name || dept;
  out.push([designation, name, staff_code, username, password, deptName, role, access]);
}

// the old one-click demo logins are replaced: demo mode off, those accounts disabled and signed out
run("INSERT INTO settings(key,value) VALUES('demo_mode','0') ON CONFLICT(key) DO UPDATE SET value='0'");
run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'demo.%')");
run("UPDATE users SET active=0 WHERE username LIKE 'demo.%'");

const md = `# MGM HMS — demo department logins (PRIVATE)

Generated ${new Date().toLocaleString('en-IN')}. Hand out privately; never post on the login page or in chat groups.
Every account is fictional demo staff. Passwords are stored only as hashes in the database — this sheet is the only copy.
Re-issue all passwords with: \`node tools/seed-demo-staff.mjs --new-passwords\`.
The primary \`admin\` login is unchanged and not listed.

| Role / designation | Employee name | \`Login ID\` | \`Password\` | Employee ID | Department | System role | Access |
|---|---|---|---|---|---|---|---|
` + out.map(([des, name, code, user, pass, dept, role, access]) => `| ${des} | ${name} | \`${user}\` | \`${pass}\` | ${code} | ${dept} | ${role} | ${access} |`).join('\n') + '\n';
// keep the table layout the parser above expects: | role | name | `login` | `password` |
fs.writeFileSync(sheet, md.replace(/\| ([^|\n]+) \| ([^|\n]+) \| `([^`]+)` \| `([^`]+)` \| ([^|\n]+) \|/g, '| $1 | $2 | `$3` | `$4` | $5 |'));
console.log(JSON.stringify({ accounts: out.length, sheet: path.relative(root, sheet), demo_logins_disabled: all("SELECT count(*) n FROM users WHERE username LIKE 'demo.%' AND active=0")[0].n }, null, 2));
