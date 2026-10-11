/**
 * Demo logins — one account for every department and in-charge, for
 * demonstrations and training. Off by default. An administrator switches
 * demo mode on in Hospital Settings; while it is on, the sign-in page lists
 * these accounts and fills them in with one click. Switching it off disables
 * every demo account and signs them out. Real staff accounts are never touched:
 * demo usernames all start with "demo.".
 *
 * The shared demo password is recorded here (and shown on the sign-in page only
 * while demo mode is on). Never use demo mode with real patient data you need to
 * protect, and never give a demo account to real staff.
 */
import { Router } from 'express';
import { h, fail, all, get, insert, update, run, emit } from '../lib.js';
import { requirePerm, hashPassword, ROLE_LABELS, ROLE_PERMS } from '../auth.js';

export const demo = Router();
export const DEMO_PASSWORD = 'demo@123';

/** [username suffix, role, name, designation, department code, extra] — grouped as they appear on the sign-in page. */
export const DEMO_ACCOUNTS = [
  ['Management', [
    ['owner', 'owner', 'Demo Owner', 'Owner / Director', 'ADMIN'],
    ['accounts', 'accounts', 'Demo Accountant', 'Accounts Officer', 'ACC'],
    ['quality', 'quality', 'Demo Quality Officer', 'Quality & NABH Coordinator', 'QUAL'],
    ['ms', 'medical_superintendent', 'Dr. Demo Superintendent', 'Medical Superintendent', 'ADMIN'],
  ]],
  ['Front office', [
    ['reception', 'reception', 'Demo Receptionist', 'Front Office Executive', 'RECP'],
    ['receptionhead', 'reception_admin', 'Demo Front Office In-charge', 'Front Office In-charge', 'RECP'],
    ['cashier', 'cashier', 'Demo Cashier', 'Cashier', 'RECP'],
    ['insurance', 'insurance', 'Demo Insurance Desk', 'Insurance / TPA Coordinator', 'INS'],
  ]],
  ['Clinical', [
    ['doctor', 'doctor', 'Dr. Demo Physician', 'Consultant Physician', 'GEN', { qualification: 'MBBS, MD (demo)', op_fee: 500, followup_fee: 300, followup_days: 7, reg_no: 'DEMO-REG-001' }],
    ['nurse', 'nurse', 'Demo Staff Nurse', 'Staff Nurse', 'NURS'],
    ['nursehead', 'nursing_incharge', 'Demo Nursing In-charge', 'Nursing Superintendent', 'NURS'],
  ]],
  ['Diagnostics', [
    ['lab', 'lab', 'Demo Lab Technician', 'Lab Technician', 'LAB'],
    ['labhead', 'lab_admin', 'Demo Lab In-charge', 'Laboratory In-charge', 'LAB'],
    ['radiology', 'radiology', 'Demo Radiographer', 'Radiographer', 'RAD'],
    ['imaginghead', 'imaging_admin', 'Demo Imaging In-charge', 'Imaging In-charge', 'RAD'],
  ]],
  ['Pharmacy & stores', [
    ['pharmacy', 'pharmacy', 'Demo Pharmacist', 'Pharmacist', 'PHAR'],
    ['pharmacyhead', 'pharmacy_admin', 'Demo Pharmacy In-charge', 'Pharmacy & Store In-charge', 'PHAR'],
    ['store', 'store', 'Demo Store Keeper', 'Store Keeper', 'PHAR'],
  ]],
  ['HR & support', [
    ['hr', 'hr', 'Demo HR In-charge', 'HR In-charge', 'HR'],
    ['hrstaff', 'hr_staff', 'Demo HR Executive', 'HR Executive', 'HR'],
    ['housekeeping', 'cleaning', 'Demo Housekeeping Staff', 'Housekeeping Staff', 'HK'],
    ['housekeepinghead', 'cleaning_incharge', 'Demo Housekeeping In-charge', 'Housekeeping In-charge', 'HK'],
  ]],
];

const enabled = () => get("SELECT value FROM settings WHERE key='demo_mode'")?.value === '1';
const label = (role) => ROLE_LABELS[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** Only roles this installation knows (an administrator may have removed one). */
const flat = () => DEMO_ACCOUNTS.flatMap(([group, rows]) => rows.filter(([, role]) => ROLE_PERMS[role]).map((r) => ({ group, row: r })));

/** Create (or re-enable) every demo account with the shared demo password. Returns the usernames. */
export function enableDemoAccounts() {
  const hash = hashPassword(DEMO_PASSWORD);
  const out = [];
  for (const { row: [suffix, role, name, designation, dept, extra = {}] } of flat()) {
    const username = `demo.${suffix}`;
    const department_id = get('SELECT id FROM departments WHERE code=?', dept)?.id || null;
    const existing = get('SELECT * FROM users WHERE username=?', username);
    const fields = { password_hash: hash, name, role, designation, department_id, active: 1, ...extra };
    if (existing) update('users', existing.id, fields);
    else insert('users', { staff_code: `DEMO-${suffix.toUpperCase()}`, username, ...fields });
    out.push(username);
  }
  return out;
}

/** While demo mode is on, create demo accounts added since it was switched on. Existing accounts are left exactly as they are. */
export function addMissingDemoAccounts() {
  if (!enabled()) return [];
  const hash = hashPassword(DEMO_PASSWORD);
  const out = [];
  for (const { row: [suffix, role, name, designation, dept, extra = {}] } of flat()) {
    const username = `demo.${suffix}`;
    if (get('SELECT id FROM users WHERE username=?', username)) continue;
    const department_id = get('SELECT id FROM departments WHERE code=?', dept)?.id || null;
    insert('users', { staff_code: `DEMO-${suffix.toUpperCase()}`, username, password_hash: hash, name, role, designation, department_id, active: 1, ...extra });
    out.push(username);
  }
  return out;
}

/** Disable every demo account and end its sessions. Their history stays in the audit trail. */
export function disableDemoAccounts() {
  run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'demo.%')");
  run("UPDATE users SET active=0 WHERE username LIKE 'demo.%'");
}

/** Sign-in page: the demo accounts, only while demo mode is on. Public (no session yet). */
demo.get('/auth/demo-accounts', h(() => {
  if (!enabled()) return { enabled: false };
  const active = new Set(all("SELECT username FROM users WHERE username LIKE 'demo.%' AND active=1").map((u) => u.username));
  const groups = [];
  for (const { group, row: [suffix, role, name, designation] } of flat()) {
    const username = `demo.${suffix}`;
    if (!active.has(username)) continue;
    let g = groups.find((x) => x.group === group);
    if (!g) groups.push(g = { group, accounts: [] });
    g.accounts.push({ username, name, designation, role, role_label: label(role) });
  }
  return { enabled: true, password: DEMO_PASSWORD, groups };
}));

/** Hospital Settings: is demo mode on, and which demo accounts exist. */
demo.get('/admin/demo-mode', requirePerm('admin.view'), h(() => ({
  enabled: enabled(),
  accounts: all("SELECT username, name, role, active FROM users WHERE username LIKE 'demo.%' ORDER BY id").map((u) => ({ ...u, role_label: label(u.role) })),
})));

demo.post('/admin/demo-mode', requirePerm('admin.write'), h((req) => {
  const on = !!req.body?.enabled;
  const before = enabled();
  let accounts = [];
  if (on) accounts = enableDemoAccounts(); else disableDemoAccounts();
  const exists = get("SELECT 1 FROM settings WHERE key='demo_mode'");
  if (exists) run("UPDATE settings SET value=? WHERE key='demo_mode'", on ? '1' : '0');
  else insert('settings', { key: 'demo_mode', value: on ? '1' : '0' });
  emit(req, { topics: ['system', 'admin'], event: 'settings.changed', data: { demo_mode: on }, action: on ? 'demo.enable' : 'demo.disable',
    entity: 'users', detail: { before: { demo_mode: before }, after: { demo_mode: on, accounts }, reason: req.body?.reason || null } });
  return { enabled: on, accounts };
}));

/** Guard used by the server: a demo account cannot sign in while demo mode is off (belt and braces). */
export function demoBlocked(username) {
  return String(username || '').toLowerCase().startsWith('demo.') && !enabled();
}
