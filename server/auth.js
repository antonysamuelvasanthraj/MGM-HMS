import crypto from 'node:crypto';
import { get, run, all, insert } from './db.js';

/* ------------------------------------------------------- roles & permissions */

/**
 * Permissions are plain strings checked with `can(user,'op.collect')`.
 * A role holding '*' is unrestricted.
 */
export const DEFAULT_ROLE_PERMS = {
  admin: ['*'],
  // Owner: money and outcomes, not day-to-day pharmacy operations.
  owner: [
    'dash.owner', 'dash.ops', 'reports.*', 'finance.*', 'expense.*', 'audit.view', 'admin.view', 'payment.approve_free',
    'patient.view', 'billing.view', 'payment.view', 'ipd.view', 'quality.*', 'insurance.view',
    'inventory.view', 'inventory.approve', 'purchase.view', 'books.reopen', 'stores.view',
  ],
  reception: [
    'dash.reception', 'dash.work', 'patient.view', 'patient.create', 'patient.edit',
    'appt.*', 'op.register', 'op.collect', 'queue.view', 'queue.manage', 'ipd.view', 'ipd.admit', 'ipd.manage', 'ipd.discharge',
    'billing.view', 'billing.create', 'payment.collect', 'payment.authorize', 'payment.view',
    'certificate.view', 'reports.collection', 'reports.reception', 'order.view', 'lab.view', 'imaging.view', 'vitals.record',
  ],
  cashier: [
    'dash.reception', 'dash.work', 'patient.view', 'billing.*', 'payment.view', 'payment.collect', 'payment.authorize',
    'payment.cancel', 'payment.refund', 'op.collect', 'ipd.view',   // IP billing works from the admission and discharge board
    'queue.view', 'finance.counter', 'reports.collection', 'reports.reception',
  ],
  // Doctor: clinical only. No pharmacy stock, purchasing, bills or ledgers.
  doctor: [
    'dash.doctor', 'patient.view', 'patient.clinical', 'queue.view',
    'consult.*', 'order.*', 'rx.*', 'lab.view', 'imaging.view',
    'certificate.*', 'template.*', 'ipd.view', 'ipd.order', 'ipd.admit', 'ot.view',
    'emergency.view', 'emergency.treat', 'maternity.view', 'counsel.*',
  ],
  nurse: [
    'dash.nurse', 'dash.work', 'patient.view', 'patient.clinical', 'queue.view', 'queue.manage',
    'vitals.*', 'ipd.*', 'nursing.*', 'emar.*', 'emergency.view', 'emergency.triage',
    'maternity.*', 'order.view', 'lab.view', 'counsel.view', 'counsel.write',
  ],
  // Lab: its own queue and results. It sees payment status but cannot touch stock or accounts.
  lab: ['dash.lab', 'dash.work', 'patient.view', 'lab.*', 'order.view', 'order.update', 'billing.view'],
  radiology: ['dash.lab', 'dash.work', 'patient.view', 'imaging.*', 'usg.*', 'order.view', 'order.update', 'billing.view'],
  // Pharmacy: stock, GRN, transfers, sales. No P&L, salaries or owner analytics.
  // Transfer approval (inventory.approve) belongs to the store in-charge; give it to a role from Users & Roles.
  pharmacy: ['dash.pharmacy', 'dash.work', 'patient.view', 'pharmacy.*', 'inventory.view', 'inventory.write', 'purchase.*', 'supplier.*',
             'billing.create', 'billing.view', 'payment.collect', 'reports.collection', 'reports.pharmacy'],
  store: ['dash.pharmacy', 'dash.work', 'inventory.*', 'supplier.*', 'purchase.*', 'reports.pharmacy', 'stores.*'],
  accounts: ['dash.owner', 'dash.work', 'patient.view', 'finance.*', 'billing.view', 'payment.view',
             'expense.*', 'reports.*', 'insurance.*', 'purchase.view', 'inventory.view', 'audit.view', 'stores.view'],
  insurance: ['dash.work', 'patient.view', 'insurance.*', 'billing.view', 'ipd.view', 'finance.receivables'],
  quality: ['dash.work', 'quality.*', 'audit.view'],
};

export const STAFF_TEAMS = { reception_admin: ['reception', 'cashier'], pharmacy_admin: ['pharmacy', 'store'], lab_admin: ['lab', 'radiology'] };
for (const [role, base] of [['reception_admin','reception'],['pharmacy_admin','pharmacy'],['lab_admin','lab']]) DEFAULT_ROLE_PERMS[role] = [...DEFAULT_ROLE_PERMS[base], 'staff.manage', ...(role === 'pharmacy_admin' ? ['inventory.approve'] : [])];

DEFAULT_ROLE_PERMS.imaging_admin = [...DEFAULT_ROLE_PERMS.radiology, 'staff.manage'];
DEFAULT_ROLE_PERMS.nursing_incharge = [...DEFAULT_ROLE_PERMS.nurse, 'staff.manage'];
DEFAULT_ROLE_PERMS.cleaning = ['dash.work', 'beds.clean'];
DEFAULT_ROLE_PERMS.cleaning_incharge = ['dash.work', 'staff.manage', 'beds.clean'];
DEFAULT_ROLE_PERMS.hr_staff = ['dash.work'];
DEFAULT_ROLE_PERMS.hr = ['dash.work', 'staff.manage', 'roster.write'];
STAFF_TEAMS.lab_admin = ['lab'];
STAFF_TEAMS.imaging_admin = ['radiology'];
STAFF_TEAMS.nursing_incharge = ['nurse'];
STAFF_TEAMS.cleaning_incharge = ['cleaning'];
STAFF_TEAMS.hr = ['reception','cashier','pharmacy','store','lab','radiology','nurse','cleaning','hr_staff'];
// Medical Superintendent: heads the clinical and support services, so rosters doctors, nursing, diagnostics, pharmacy and housekeeping.
DEFAULT_ROLE_PERMS.medical_superintendent = [
  'dash.nurse', 'dash.work', 'patient.view', 'patient.clinical', 'queue.view', 'ipd.view', 'nursing.view', 'emergency.view',
  'lab.view', 'imaging.view', 'order.view', 'ot.view', 'maternity.view', 'quality.*', 'audit.view', 'staff.manage', 'reports.attendance', 'beds.clean', 'counsel.view',
];
STAFF_TEAMS.medical_superintendent = ['doctor', 'nurse', 'nursing_incharge', 'lab', 'lab_admin', 'radiology', 'imaging_admin',
  'pharmacy', 'pharmacy_admin', 'store', 'cleaning', 'cleaning_incharge'];
// OT in-charge: the theatre's nursing lead who books and runs the OT list; ER in-charge: the casualty lead.
DEFAULT_ROLE_PERMS.ot_incharge = [...DEFAULT_ROLE_PERMS.nursing_incharge, 'ot.*'];
DEFAULT_ROLE_PERMS.er_incharge = [...DEFAULT_ROLE_PERMS.nursing_incharge, 'emergency.*'];
// Maintenance / biomedical engineer: the equipment register and repair tickets only.
DEFAULT_ROLE_PERMS.maintenance = ['dash.work', 'maintenance.view', 'maintenance.write'];
for (const r of ['owner', 'medical_superintendent', 'nursing_incharge', 'ot_incharge', 'er_incharge', 'lab_admin', 'imaging_admin', 'pharmacy_admin', 'store']) DEFAULT_ROLE_PERMS[r].push('maintenance.view');
STAFF_TEAMS.ot_incharge = ['nurse'];
STAFF_TEAMS.er_incharge = ['nurse'];
DEFAULT_ROLE_PERMS.manager = ['dash.work', 'staff.manage', 'reports.attendance', 'audit.view', 'inventory.view', 'purchase.view', 'quality.view', 'stores.view'];
STAFF_TEAMS.manager = ['reception','reception_admin','cashier','pharmacy','pharmacy_admin','store','lab','lab_admin','radiology','imaging_admin','nurse','nursing_incharge','cleaning','cleaning_incharge','hr','hr_staff','medical_superintendent','quality','insurance','accounts','doctor'];
// in-charges and HR read the attendance reports of the staff they roster
for (const r of ['hr', 'reception_admin', 'pharmacy_admin', 'lab_admin', 'imaging_admin', 'nursing_incharge', 'cleaning_incharge']) DEFAULT_ROLE_PERMS[r].push('reports.attendance');
export const ROLE_DEPARTMENTS = {
 reception:['RECP'], reception_admin:['RECP'], cashier:['RECP'], pharmacy:['PHAR'], pharmacy_admin:['PHAR'], store:['PHAR'],
 lab:['LAB'], lab_admin:['LAB'], radiology:['RAD'], imaging_admin:['RAD'], nurse:['NURS'], nursing_incharge:['NURS'],
 cleaning:['HK'], cleaning_incharge:['HK'], hr:['HR'], hr_staff:['HR'], manager:['ADMIN'], medical_superintendent:['ADMIN'], accounts:['ACC'], insurance:['INS'], quality:['QUAL'], admin:['ADMIN'], owner:['ADMIN'],
};
const DEFAULT_ROLE_LABELS = {maintenance:'Maintenance / Biomedical',ot_incharge:'OT In-charge',er_incharge:'ER In-charge',reception:'Reception Staff',pharmacy:'Pharmacy Staff',lab:'Laboratory Staff',radiology:'Imaging Staff',nurse:'Nursing Staff',store:'Store Staff',lab_admin:'Laboratory Admin',imaging_admin:'Imaging Admin',nursing_incharge:'Nursing In-charge',cleaning:'Cleaning Staff',cleaning_incharge:'Cleaning In-charge',hr:'HR In-charge',hr_staff:'HR Staff',medical_superintendent:'Medical Superintendent'};

/**
 * Live permissions. Defaults come from DEFAULT_ROLE_PERMS; the administrator
 * can change any role (except admin) or add new roles from Users & Roles, and
 * those changes are stored in role_permissions and take effect immediately.
 */
export const ROLE_PERMS = {};
export const ROLE_LABELS = {...DEFAULT_ROLE_LABELS};
export function loadRolePermissions() {
  for (const k of Object.keys(ROLE_PERMS)) delete ROLE_PERMS[k];
  for (const [r, p] of Object.entries(DEFAULT_ROLE_PERMS)) ROLE_PERMS[r] = [...p];
  try {
    for (const row of all('SELECT * FROM role_permissions')) {
      if (row.role === 'admin') continue;
      ROLE_PERMS[row.role] = JSON.parse(row.perms || '[]');
      if (row.label) ROLE_LABELS[row.role] = row.label;
    }
  } catch { /* table appears with the migration */ }
  ROLE_PERMS.admin = ['*'];
}
loadRolePermissions();

/** Every permission the server checks, grouped for the role editor. */
export const PERMISSION_CATALOG = [
  ['Dashboards', [['dash.owner', 'Owner / finance dashboard'], ['dash.reception', 'Reception dashboard'], ['dash.doctor', 'Doctor dashboard'],
    ['dash.nurse', 'Nursing dashboard'], ['dash.lab', 'Lab / imaging dashboard'], ['dash.pharmacy', 'Pharmacy dashboard'], ['dash.work', 'Work dashboard'], ['dash.ops', 'Operations overview']]],
  ['Patients & OPD', [['patient.view', 'View patients'], ['patient.create', 'Register patients'], ['patient.edit', 'Edit patient details'],
    ['patient.clinical', 'Clinical record'], ['appt.view', 'View appointments'], ['appt.create', 'Book appointments'], ['appt.edit', 'Change appointments'],
    ['op.register', 'OP registration'], ['op.collect', 'OP fee collection'], ['queue.view', 'View queues'], ['queue.manage', 'Manage queues'],
    ['vitals.record', 'Record vitals']]],
  ['Clinical', [['consult.write', 'Write consultations'], ['order.view', 'View orders'], ['order.create', 'Place orders'], ['order.update', 'Update order status'],
    ['rx.write', 'Write prescriptions'], ['certificate.view', 'View certificates'], ['certificate.write', 'Issue certificates'], ['template.write', 'Templates'],
    ['counsel.view', 'View counselling records'], ['counsel.write', 'Counsel, record and draft summaries'], ['counsel.review', 'Review & sign counselling summaries']]],
  ['Emergency, IPD & OT', [['emergency.view', 'Emergency desk'], ['emergency.triage', 'Triage'], ['emergency.treat', 'Treat / dispose'],
    ['ipd.view', 'View inpatients'], ['ipd.admit', 'Admit'], ['ipd.manage', 'Bed changes & IP charges'], ['ipd.discharge', 'Discharge'], ['ipd.order', 'IP orders'],
    ['ipd.indent', 'Ward indents'], ['nursing.write', 'Nursing notes'], ['emar.write', 'Medication administration'], ['ot.view', 'View OT'], ['ot.schedule', 'Schedule OT'],
    ['maternity.view', 'View maternity'], ['maternity.write', 'Maternity records']]],
  ['Diagnostics', [['lab.view', 'View lab'], ['lab.collect', 'Collect samples'], ['lab.result', 'Enter results'], ['lab.verify', 'Verify & publish results'],
    ['imaging.view', 'View imaging'], ['imaging.schedule', 'Schedule imaging'], ['imaging.report', 'Write & sign imaging reports']]],
  ['Billing & payments', [['billing.view', 'View bills'], ['billing.create', 'Create bills / add charges'], ['billing.discount', 'Give discounts'],
    ['billing.cancel', 'Cancel bills'], ['payment.view', 'View receipts'], ['payment.collect', 'Collect payments'],
    ['payment.authorize', 'Bill to payer / approve due'], ['payment.approve_free', 'Approve free visits & treatment'], ['payment.cancel', 'Cancel receipts'],
    ['payment.refund', 'Refunds'], ['insurance.view', 'View insurance claims'], ['insurance.write', 'Manage insurance claims']]],
  ['Pharmacy & stores', [['pharmacy.view', 'View pharmacy'], ['pharmacy.dispense', 'Dispense & sell'], ['inventory.view', 'View stock'],
    ['inventory.write', 'Stock changes & transfers'], ['inventory.approve', 'Approve stock transfers (in-charge)'], ['purchase.view', 'View purchases'],
    ['purchase.write', 'Receive goods (GRN) & returns'], ['supplier.view', 'View suppliers'], ['supplier.write', 'Manage suppliers'],
    ['stores.view', 'View general / maintenance stores'], ['stores.write', 'Run general stores (receive, issue, count, labels)']]],
  ['Finance & reports', [['finance.view', 'View accounts'], ['finance.write', 'Accounts entries'], ['finance.journal', 'Manual journals'],
    ['finance.pl', 'Profit & loss, balance sheet'], ['finance.close', 'Day closing'], ['books.reopen', 'Reopen a closed day; correct the books'], ['reports.attendance', 'Attendance reports'], ['beds.clean', 'Mark beds cleaned (housekeeping)'], ['finance.counter', 'Counter sessions'],
    ['finance.receivables', 'Payer receivables'], ['finance.payables', 'Pay suppliers'], ['expense.view', 'View expenses'], ['expense.write', 'Record expenses'],
    ['expense.approve', 'Approve expenses'], ['reports.view', 'Report centre (management)'], ['reports.collection', 'Daily collection reports'],
    ['reports.pharmacy', 'Pharmacy reports'], ['reports.reception', 'Reception reports']]],
  ['Administration', [['staff.manage', 'Manage team staff'], ['roster.write', 'Manage staff rosters'], ['admin.view', 'Administration screens'], ['admin.write', 'Change users, roles & settings'], ['audit.view', 'Audit trail'],
    ['quality.view', 'View quality'], ['quality.write', 'Quality records']]],
  ['Maintenance & assets', [['maintenance.view', 'View assets & all tickets'], ['maintenance.write', 'Manage assets & work tickets']]],
];

export function can(user, perm) {
  if (!user) return false;
  const perms = ROLE_PERMS[user.role] || [];
  if (perms.includes('*')) return true;
  if (perms.includes(perm)) return true;
  const ns = perm.split('.')[0];
  return perms.includes(`${ns}.*`);
}

export function permsFor(role) {
  return ROLE_PERMS[role] || [];
}

/* ------------------------------------------------------------------ passwords */

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(pw, stored) {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, salt, key] = stored.split('$');
  const test = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(test, 'hex'));
}

/* ------------------------------------------------------------------- sessions */

export function login(username, password, meta = {}) {
  const u = get('SELECT * FROM users WHERE lower(username)=lower(?) AND active=1', username);
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  const token = crypto.randomBytes(24).toString('hex');
  insert('sessions', {
    token, user_id: u.id, counter_id: meta.counter_id || null,
    agent: meta.agent || '', ip: meta.ip || '',
  });
  return { token, user: publicUser(u) };
}

export function sessionForToken(token) {
  if (!token) return null;
  const row = get(
    `SELECT s.token, s.user_id, s.counter_id, u.name, u.role, u.staff_code, u.designation,
            u.department_id, u.op_fee, u.avatar, u.qualification, u.reg_no
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.active = 1`, token);
  if (row) run(`UPDATE sessions SET last_seen = datetime('now','localtime') WHERE token=?`, token);
  return row;
}

export function logout(token) { run('DELETE FROM sessions WHERE token=?', token); }

export function publicUser(u) {
  return {
    id: u.id, name: u.name, role: u.role, staff_code: u.staff_code,
    designation: u.designation, qualification: u.qualification, reg_no: u.reg_no,
    department_id: u.department_id, op_fee: u.op_fee, avatar: u.avatar,
    perms: permsFor(u.role),
  };
}

/* -------------------------------------------------------------- express glue */

export function authMiddleware(req, res, next) {
  const token = req.headers['x-session'] ||
    (req.headers.cookie || '').match(/surely_session=([^;]+)/)?.[1] ||
    req.query.t;
  const s = token ? sessionForToken(token) : null;
  if (s) {
    req.token = token;
    req.user = {
      id: s.user_id, name: s.name, role: s.role, staff_code: s.staff_code,
      designation: s.designation, department_id: s.department_id,
      op_fee: s.op_fee, counter_id: s.counter_id, qualification: s.qualification,
      reg_no: s.reg_no, avatar: s.avatar,
    };
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

export function requireAnyPerm(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
    if (!perms.some(perm => can(req.user, perm))) return res.status(403).json({ error: 'forbidden', need: perms });
    next();
  };
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
    if (!can(req.user, perm)) return res.status(403).json({ error: 'forbidden', need: perm });
    next();
  };
}

/**
 * Audit trail. `detail` may carry { before, after, reason }: those are kept in
 * their own columns so a change can be shown as old value → new value.
 */
export function audit(req, action, entity, entityId, detail) {
  const obj = detail && typeof detail === 'object' ? detail : null;
  const pickJSON = (v) => (v === undefined ? null : JSON.stringify(v));
  insert('audit_log', {
    user_id: req?.user?.id || null,
    user_name: req?.user?.name || 'system',
    action, entity, entity_id: entityId ?? null,
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? null),
    before_json: obj ? pickJSON(obj.before) : null,
    after_json: obj ? pickJSON(obj.after) : null,
    reason: obj?.reason ?? null,
    ip: req?.ip || '',
  });
}
