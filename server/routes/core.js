import { roleSummary, roleDashboard, defaultView, VIEWS, VIEW_PERM } from '../dashboards.js';
import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, today, setting, setSetting, emit, where, nowIso,
} from '../lib.js';
import { login, logout, publicUser, requireAuth, requirePerm, can, ROLE_PERMS } from '../auth.js';
import { demoBlocked } from './demo.js';
import { unreadTotal } from './staff-work.js';
import { billScope } from './billing.js';
import { clientCount } from '../realtime.js';

export const core = Router();

/* ------------------------------------------------------------------ session */

/* Wrong-password throttle: the server may be reachable from the internet (demo tunnel). */
const FAILS = new Map();            // key -> [timestamps]
const WINDOW = 10 * 60 * 1000, LIMIT = 8;
const recent = (k) => (FAILS.get(k) || []).filter((t) => Date.now() - t < WINDOW);
setInterval(() => { for (const [k] of FAILS) if (!recent(k).length) FAILS.delete(k); }, WINDOW).unref();

core.post('/auth/login', h((req, res) => {
  const { username, password, counter_id } = req.body || {};
  const keys = [`ip:${req.ip}`, `user:${String(username || '').toLowerCase()}`];
  if (keys.some((k) => recent(k).length >= LIMIT)) return res.status(429).json({ error: 'too_many_attempts', retry_after_minutes: 10 });
  const failed = () => { for (const k of keys) FAILS.set(k, [...recent(k), Date.now()]); return res.status(401).json({ error: 'invalid_credentials' }); };
  if (demoBlocked(username)) return failed();   // demo accounts only work in demo mode
  const r = login(username || '', password || '', {
    counter_id: counter_id || null,
    agent: req.headers['user-agent'] || '',
    ip: req.ip,
  });
  if (!r) return failed();
  for (const k of keys) FAILS.delete(k);
  // Sign-in and restored sessions expose the same selected cash desk.
  // Views render immediately after login, before /auth/me is called again.
  r.user.counter = counter_id ? get('SELECT * FROM counters WHERE id=?', counter_id) : null;
  insert('audit_log', { user_id: r.user.id, user_name: r.user.name, action: 'login', entity: 'session', ip: req.ip });
  res.cookie?.('surely_session', r.token, { httpOnly: false, sameSite: 'Lax' });
  res.setHeader('Set-Cookie', `surely_session=${r.token}; Path=/; SameSite=Lax; Max-Age=86400${req.secure ? '; Secure' : ''}`);
  res.json(r);
}));

core.post('/auth/logout', h((req) => { if (req.token) logout(req.token); return { ok: true }; }));

core.get('/auth/me', h((req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  const u = get('SELECT * FROM users WHERE id=?', req.user.id);
  const counter = req.user.counter_id ? get('SELECT * FROM counters WHERE id=?', req.user.counter_id) : null;
  res.json({ user: { ...publicUser(u), counter } });
}));

/* Public counter list — used on the login page before authentication. */
core.get('/counters', h(() => all('SELECT id, code, name FROM counters WHERE active=1 ORDER BY name')));


core.get('/auth/roles', h(() => ({ roles: Object.keys(ROLE_PERMS), perms: ROLE_PERMS })));

/* -------------------------------------------------------------------- meta */

core.get('/meta', requireAuth, h((req) => ({
  environment: process.env.HMS_ENV || 'local',   // 'demo' shows the DEMO ENVIRONMENT badge; never set it in production
  settings: Object.fromEntries(all('SELECT key,value FROM settings').filter(r => !r.key.startsWith('sms_gateway') || can(req.user,'admin.view')).map((r) => [r.key, r.value])),
  departments: all('SELECT * FROM departments WHERE active=1 ORDER BY name'),
  doctors: all(`SELECT u.id, u.name, u.role, u.designation, u.qualification, u.op_fee, u.followup_fee,
                       u.department_id, u.reg_no, u.staff_code, d.name AS dept_name, d.code AS dept_code
                  FROM users u LEFT JOIN departments d ON d.id=u.department_id
                 WHERE u.active=1 AND u.role IN ('doctor','radiology','admin') ORDER BY u.name`),
  staff: all(`SELECT id, name, role, designation, staff_code, department_id FROM users WHERE active=1 ORDER BY name`),
  counters: all('SELECT * FROM counters WHERE active=1'),
  wards: all('SELECT * FROM wards ORDER BY name'),
  services: all('SELECT * FROM services WHERE active=1 ORDER BY category, name'),
  packages: all('SELECT * FROM packages WHERE active=1'),
  payers: all('SELECT id, code, name, payer_type FROM payers WHERE active=1 ORDER BY name'),
  serverTime: nowIso(),
})));

core.get('/settings', requireAuth, h((req) =>
  Object.fromEntries(all('SELECT key,value FROM settings').filter((r) => !r.key.startsWith('sms_gateway') || can(req.user, 'admin.view'))
    .map((r) => [r.key, r.value]))));

core.patch('/settings', requirePerm('admin.view'), h((req) => {
  for (const [k, v] of Object.entries(req.body || {})) setSetting(k, v);
  emit(req, { topics: ['system'], event: 'settings.changed', data: req.body,
    action: 'settings.update', entity: 'settings', detail: req.body });
  return { ok: true };
}));

/* ------------------------------------------------------------ global search */

core.get('/search', requireAuth, h((req) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return { results: [] };
  const like = `%${q}%`;
  const results = [];
  if (can(req.user,'patient.view')) for (const p of all(
    `SELECT id, uhid, name, mobile, gender, age_years FROM patients
      WHERE uhid LIKE ? OR name LIKE ? OR mobile LIKE ? ORDER BY name LIMIT 8`, like, like, like))
    results.push({ type: 'patient', id: p.id, title: p.name, sub: `${p.uhid} · ${p.gender} ${p.age_years}y · ${p.mobile || '—'}`, route: `/patient/${p.id}`, icon: 'person' });
  const scope = billScope(req.user);
  if (scope !== null) for (const b of all(
    `SELECT b.id, b.bill_no, b.total, b.balance, b.status, p.name FROM bills b JOIN patients p ON p.id=b.patient_id
      WHERE b.bill_no LIKE ? ${scope ? `AND (${scope})` : ''} ORDER BY b.id DESC LIMIT 5`, like))
    results.push({ type: 'bill', id: b.id, title: b.bill_no, sub: `${b.name} · ₹${b.total} · ${b.status}`, route: `/bills?bill=${b.id}`, icon: 'receipt_long' });
  if (can(req.user,'patient.view')) for (const e of all(
    `SELECT e.id, e.encounter_no, e.token_no, p.name FROM encounters e JOIN patients p ON p.id=e.patient_id
      WHERE e.encounter_no LIKE ? ORDER BY e.id DESC LIMIT 5`, like))
    results.push({ type: 'encounter', id: e.id, title: e.encounter_no, sub: `${e.name} · Token ${e.token_no ?? '—'}`, route: `/visit/${e.id}`, icon: 'badge' });
  if (can(req.user,'patient.view') && /^\d+$/.test(q)) {
    for (const e of all(
      `SELECT e.id, e.token_no, p.name, u.name doctor FROM encounters e JOIN patients p ON p.id=e.patient_id
         LEFT JOIN users u ON u.id=e.doctor_id
        WHERE e.visit_date=? AND e.token_no=? LIMIT 5`, today(), +q))
      results.push({ type: 'token', id: e.id, title: `Token ${e.token_no}`, sub: `${e.name} · ${e.doctor || '—'}`, route: `/visit/${e.id}`, icon: 'confirmation_number' });
  }
  return { results };
}));

/* --------------------------------------------------------------- dashboards */

core.get('/dashboard/summary', requireAuth, h((req) => {
  const scoped=roleSummary(req.user,req.query.date); if(scoped)return scoped;
  const d = req.query.date || today();
  const opd = one('SELECT count(*) FROM encounters WHERE visit_date=? AND kind=?', d, 'OP') || 0;
  const pending = one("SELECT count(*) FROM encounters WHERE visit_date=? AND payment_status='pending'", d) || 0;
  const collections = one('SELECT coalesce(sum(amount),0) FROM payments WHERE pay_date=? AND cancelled=0', d) || 0;
  const cash = one("SELECT coalesce(sum(amount),0) FROM payments WHERE pay_date=? AND cancelled=0 AND mode='cash'", d) || 0;
  const digital = collections - cash;
  const outstanding = one("SELECT coalesce(sum(balance),0) FROM bills WHERE status IN ('unpaid','partial')") || 0;
  const beds = get(`SELECT count(*) total,
                           sum(status='occupied') occupied,
                           sum(status='vacant') vacant,
                           sum(status='reserved') reserved,
                           sum(status='cleaning') cleaning FROM beds`);
  return {
    date: d,
    opd_today: opd,
    new_patients: one('SELECT count(*) FROM patients WHERE date(created_at)=?', d) || 0,
    payment_pending: pending,
    waiting: one("SELECT count(*) FROM encounters WHERE visit_date=? AND stage IN ('registered','vitals_pending','vitals_done','ready')", d) || 0,
    in_consult: one("SELECT count(*) FROM encounters WHERE visit_date=? AND stage='in_consult'", d) || 0,
    completed: one("SELECT count(*) FROM encounters WHERE visit_date=? AND stage IN ('consulted','services_pending','closed')", d) || 0,
    collections, cash, digital, outstanding,
    bills_today: one('SELECT count(*) FROM bills WHERE bill_date=?', d) || 0,
    admitted: one("SELECT count(*) FROM admissions WHERE status NOT IN ('discharged')") || 0,
    discharges_today: one('SELECT count(*) FROM admissions WHERE date(discharged_at)=?', d) || 0,
    beds,
    occupancy: beds.total ? Math.round((beds.occupied / beds.total) * 100) : 0,
    lab_pending: one("SELECT count(*) FROM orders WHERE category='lab' AND status NOT IN ('verified','cancelled')") || 0,
    lab_critical: one("SELECT count(DISTINCT o.id) FROM orders o JOIN lab_results r ON r.order_id=o.id WHERE r.flag='critical' AND o.status<>'verified'") || 0,
    imaging_pending: one("SELECT count(*) FROM orders WHERE category='imaging' AND status NOT IN ('verified','cancelled')") || 0,
    emergency_active: one("SELECT count(*) FROM emergency_cases WHERE status NOT IN ('discharged','admitted','referred','lama','death')") || 0,
    emergency_red: one("SELECT count(*) FROM emergency_cases WHERE triage IN ('1','2') AND status NOT IN ('discharged','admitted','referred','lama','death')") || 0,
    ot_today: one('SELECT count(*) FROM ot_bookings WHERE date(scheduled_at)=?', d) || 0,
    rx_pending: one("SELECT count(*) FROM prescriptions WHERE status='active'") || 0,
    expiring_batches: one("SELECT count(*) FROM medicine_batches WHERE qty>0 AND expiry <= date('now','localtime','+90 day')") || 0,
    low_stock: one(`SELECT count(*) FROM (SELECT m.id FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.id
                      GROUP BY m.id HAVING coalesce(sum(b.qty),0) <= m.reorder_level)`) || 0,
    sync_queued: one("SELECT count(*) FROM sync_queue WHERE status='queued'") || 0,
    sync_failed: one("SELECT count(*) FROM sync_queue WHERE status='failed'") || 0,
    claims_open: one("SELECT count(*) FROM insurance_claims WHERE status NOT IN ('settled','rejected')") || 0,
    stations_online: clientCount(),
  };
}));

/** Role dashboard. `view` defaults to the caller's own; others need that dashboard's permission. */
core.get('/dashboard/role', requireAuth, h((req) => {
  const available = Object.keys(VIEWS).filter((v) => can(req.user, VIEW_PERM[v]));
  const preferred = defaultView(req.user.role);
  const view = req.query.view || (available.includes(preferred) ? preferred : available[0]);
  if (!view || !VIEWS[view]) fail(404, 'no_dashboard_for_role');
  if (!can(req.user, VIEW_PERM[view])) fail(403, 'forbidden', { need: VIEW_PERM[view] });
  const query = { ...req.query };
  if (req.user.role === 'doctor') delete query.doctor_id;   // a doctor sees only their own queue
  return {
    ...roleDashboard(view, req.user, query),
    available,
  };
}));

core.get('/dashboard/badges', requireAuth, h((req) => {
  const d = today();
  return {
    'op-registration': one('SELECT count(*) FROM encounters WHERE visit_date=? AND kind=?', d, 'OP') || 0,
    'op-fee-collection': one("SELECT count(*) FROM encounters WHERE visit_date=? AND payment_status='pending'", d) || 0,
    'vitals-queue': one("SELECT count(*) FROM encounters WHERE visit_date=? AND stage IN ('registered','vitals_pending')", d) || 0,
    'doctor-queue': one("SELECT count(*) FROM encounters WHERE visit_date=? AND stage IN ('vitals_done','ready')", d) || 0,
    'visit-tracking': one("SELECT count(*) FROM encounters WHERE visit_date=? AND stage NOT IN ('closed','cancelled')", d) || 0,
    'laboratory': one("SELECT count(*) FROM orders WHERE category='lab' AND status NOT IN ('verified','cancelled')") || 0,
    'imaging': one("SELECT count(*) FROM orders WHERE category='imaging' AND status NOT IN ('verified','cancelled')") || 0,
    'pharmacy-sales': one("SELECT count(*) FROM prescriptions WHERE status='active'") || 0,
    'emergency': one("SELECT count(*) FROM emergency_cases WHERE status NOT IN ('discharged','admitted','referred','lama','death')") || 0,
    'admissions': one("SELECT count(*) FROM admissions WHERE status NOT IN ('discharged')") || 0,
    'discharge': one("SELECT count(*) FROM admissions WHERE status IN ('discharge_initiated','clinically_cleared')") || 0,
    'icu': one(`SELECT count(*) FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id
                 WHERE w.kind IN ('icu','nicu','picu','hdu') AND a.status<>'discharged'`) || 0,
    'nursing': one("SELECT count(*) FROM med_admin WHERE status='due'") || 0,
    'bills': (() => { const sc = billScope(req.user); return sc === null ? 0 : one(`SELECT count(*) FROM bills b WHERE b.status IN ('unpaid','partial')${sc ? ` AND ${sc}` : ''}`) || 0; })(),
    'insurance': one("SELECT count(*) FROM insurance_claims WHERE status NOT IN ('settled','rejected')") || 0,
    'ot-schedule': one('SELECT count(*) FROM ot_bookings WHERE date(scheduled_at)=?', d) || 0,
    'maternity': one("SELECT count(*) FROM maternity_cases WHERE stage<>'postnatal'") || 0,
    'appointments': one('SELECT count(*) FROM appointments WHERE date(slot_start)=?', d) || 0,
    'local-sync': one("SELECT count(*) FROM sync_queue WHERE status IN ('queued','failed')") || 0,
    'quality': one("SELECT count(*) FROM quality_incidents WHERE status<>'closed'") || 0,
    'stock': one("SELECT count(*) FROM medicine_batches WHERE qty>0 AND expiry <= date('now','localtime','+90 day')") || 0,
    'service-payments': one("SELECT count(DISTINCT coalesce(bi.bill_id, -o.id)) FROM orders o LEFT JOIN bill_items bi ON bi.order_id=o.id WHERE o.status='awaiting_payment'") || 0,
    'approvals': one("SELECT count(*) FROM bills WHERE approval_request IS NOT NULL AND status<>'cancelled'") || 0,
    'indents': (one("SELECT count(*) FROM ward_indents WHERE status IN ('requested','partially_dispensed')") || 0)+(one("SELECT count(*) FROM ward_replacements WHERE status NOT IN ('replaced','reversed')")||0),
    'transfers': one("SELECT count(*) FROM stock_transfers WHERE status IN ('requested','approved','issued','partially_received')") || 0,
    'staff-workspace': unreadTotal(req.user.id),
    'housekeeping': one("SELECT count(*) FROM beds WHERE status='cleaning'") || 0,
    // reviewers: summaries waiting for their signature; counsellors: transcripts waiting for a summary
    'counselling': can(req.user, 'counsel.review') ? one("SELECT count(*) FROM counselling_sessions WHERE status='summary_draft' AND doctor_id=?", req.user.id) || 0
      : can(req.user, 'counsel.write') ? one("SELECT count(*) FROM counselling_sessions WHERE status='transcribed' AND counsellor_id=?", req.user.id) || 0 : 0,
    'grn': can(req.user, 'inventory.approve') || can(req.user, 'purchase.view') ? one("SELECT count(*) FROM price_alerts WHERE status IN ('open','escalated')") || 0 : 0,
    // the store sees requests to act on; everyone else sees their department's issued requests still to confirm
    'stores': can(req.user, 'stores.view') || can(req.user, 'stores.write')
      ? one("SELECT count(*) FROM store_requests WHERE status IN ('pending','partly_issued')") || 0
      : one("SELECT count(*) FROM store_requests WHERE status IN ('issued','partly_issued') AND received_at IS NULL AND (requested_by=? OR department_id=?)", req.user.id, req.user.department_id || -1) || 0,
  };
}));

/* ------------------------------------------------------------ notifications */

core.get('/notifications', requireAuth, h((req) => all(
  `SELECT * FROM notifications WHERE (user_id=? OR user_id IS NULL) AND (role IS NULL OR role=?)
    ORDER BY id DESC LIMIT 50`, req.user.id, req.user.role)));

core.post('/notifications/:id/read', requireAuth, h((req) => {
  if (!get('SELECT id FROM notifications WHERE id=? AND (user_id=? OR user_id IS NULL) AND (role IS NULL OR role=?)', +req.params.id,req.user.id,req.user.role)) fail(404,'notification_not_found');
  update('notifications', +req.params.id, { read_at: nowIso() });
  return { ok: true };
}));

/* ------------------------------------------------------------------- audit */

core.get('/audit', requirePerm('audit.view'), h((req) => {
  const w = [], a = [];
  if (req.query.from) { w.push('date(l.at) >= ?'); a.push(req.query.from); }
  if (req.query.to) { w.push('date(l.at) <= ?'); a.push(req.query.to); }
  if (req.query.user_id && req.query.user_id !== 'all') { w.push('l.user_id = ?'); a.push(+req.query.user_id); }
  if (req.query.entity && req.query.entity !== 'all') { w.push('l.entity = ?'); a.push(req.query.entity); }
  if (req.query.action) { w.push('l.action LIKE ?'); a.push(`%${req.query.action}%`); }
  if (req.query.entity_id) { w.push('l.entity_id = ?'); a.push(+req.query.entity_id); }
  if (req.query.q) { w.push('(l.detail LIKE ? OR l.reason LIKE ? OR l.user_name LIKE ?)'); const q = `%${req.query.q}%`; a.push(q, q, q); }
  const rows = all(`SELECT l.* FROM audit_log l ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY l.id DESC LIMIT ?`,
    ...a, Math.min(+req.query.limit || 300, 2000));
  const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return t; } };
  for (const r of rows) { r.before = parse(r.before_json); r.after = parse(r.after_json); r.detail = parse(r.detail); delete r.before_json; delete r.after_json; }
  return {
    rows,
    entities: all('SELECT entity, count(*) n FROM audit_log WHERE entity IS NOT NULL GROUP BY entity ORDER BY n DESC').map((r) => r.entity),
    users: all('SELECT DISTINCT u.id, u.name FROM audit_log l JOIN users u ON u.id=l.user_id ORDER BY u.name'),
  };
}));

/* ------------------------------------------------------------- system info */

core.get('/system/health', h(() => ({
  ok: true,
  stations_online: clientCount(),
  db: 'sqlite (local)',
  lan_ip: setting('lan_ip'),
  cloud_endpoint: setting('cloud_endpoint'),
  sync_queued: one("SELECT count(*) FROM sync_queue WHERE status='queued'") || 0,
  sync_failed: one("SELECT count(*) FROM sync_queue WHERE status='failed'") || 0,
  uptime_s: Math.round(process.uptime()),
  serverTime: nowIso(),
})));
