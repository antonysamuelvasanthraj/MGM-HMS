/**
 * Patient portal — patients sign in to see their own records (visits, verified reports, prescriptions,
 * bills and receipts, discharge summaries, appointments). Separate from staff sessions:
 *
 *   reception issues a 6-digit portal PIN (shown once, or sent by SMS)   POST /patients/:id/portal-access
 *   patient signs in with UHID or mobile + PIN                            POST /portal/login
 *   or with UHID + a one-time code sent to the registered mobile          POST /portal/otp, /portal/otp/verify
 *   the session token (X-Portal-Token) only ever reads that patient       GET  /portal/me
 *
 * Five wrong attempts lock the account for 15 minutes; an address hammering the login is slowed to a stop.
 * Every sign-in, PIN issue and revoke is audited. Nothing a patient can reach exposes another patient.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, can, hashPassword, verifyPassword, audit } from '../auth.js';
import { h, fail, all, get, insert, update, run, nowIso, emit, localStamp, setting } from '../lib.js';
import { queueMessage, gatewayConfigured, sendQueued } from '../messages.js';

export const portal = Router();
const SESSION_HOURS = 12, LOCK_MIN = 15, MAX_FAILS = 5, OTP_MIN = 10;
const stamp = (ms) => localStamp(new Date(ms));
const ipHits = new Map();   // ip → [timestamps of failures]
function ipGuard(req) {
  const now = Date.now(), list = (ipHits.get(req.ip) || []).filter((t) => now - t < 15 * 60e3);
  ipHits.set(req.ip, list);
  if (list.length >= 30) fail(429, 'too_many_attempts', { retry_minutes: 15 });
}
const ipFail = (req) => ipHits.set(req.ip, [...(ipHits.get(req.ip) || []), Date.now()]);
const actor = (req, p) => ({ ...req, user: { id: null, name: `Patient portal · ${p?.uhid || 'unknown'}` } });

/** Patients the identifier could mean: an exact UHID, or every patient on that mobile. */
function candidates(identifier) {
  const id = String(identifier || '').trim();
  if (!id) fail(400, 'identifier_required');
  const digits = id.replace(/\D/g, '');
  const rows = /^\d{10,12}$/.test(id) || (digits.length >= 10 && digits.length === id.replace(/[\s+-]/g, '').length)
    ? all("SELECT * FROM patients WHERE substr(replace(replace(mobile,' ',''),'-',''), -10)=? AND coalesce(merged_into,0)=0", digits.slice(-10))
    : all('SELECT * FROM patients WHERE uhid=? COLLATE NOCASE AND coalesce(merged_into,0)=0', id);
  return rows;
}
function startSession(req, p, method) {
  const token = crypto.randomBytes(24).toString('hex');
  insert('patient_sessions', { token, patient_id: p.id, created_at: nowIso(), expires_at: stamp(Date.now() + SESSION_HOURS * 3600e3), ip: req.ip || '', method });
  update('patient_portal', get('SELECT id FROM patient_portal WHERE patient_id=?', p.id).id, { failed_count: 0, locked_until: null, last_login_at: nowIso() });
  audit(actor(req, p), 'portal.login', 'patients', p.id, { after: { method }, reason: 'Patient portal sign-in' });
  return { token, expires_at: stamp(Date.now() + SESSION_HOURS * 3600e3), patient: { name: p.name, uhid: p.uhid } };
}
function failFor(req, access, p) {
  ipFail(req);
  if (!access) return;
  const fails = access.failed_count + 1;
  update('patient_portal', access.id, { failed_count: fails, ...(fails >= MAX_FAILS ? { locked_until: stamp(Date.now() + LOCK_MIN * 60e3), failed_count: 0 } : {}) });
  if (fails >= MAX_FAILS) audit(actor(req, p), 'portal.locked', 'patients', p.id, { after: { locked_minutes: LOCK_MIN }, reason: 'Too many wrong portal sign-in attempts' });
}
const locked = (a) => a?.locked_until && a.locked_until > nowIso();

/* ----------------------------------------------------------------- staff */

/** Issue (or re-issue) a portal PIN. Shown once; stored only as a hash. Optionally sent by SMS. */
portal.post('/patients/:id/portal-access', requireAuth, h((req) => {
  if (!['patient.edit', 'patient.create', 'op.register'].some((p) => can(req.user, p))) fail(403, 'forbidden', { need: 'patient.edit' });
  const p = get('SELECT * FROM patients WHERE id=?', +req.params.id) || fail(404, 'patient_not_found');
  if (p.merged_into) fail(409, 'patient_merged');
  const pin = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const ex = get('SELECT * FROM patient_portal WHERE patient_id=?', p.id);
  const row = { pin_hash: hashPassword(pin), active: 1, issued_by: req.user.id, issued_at: nowIso(), failed_count: 0, locked_until: null };
  if (ex) update('patient_portal', ex.id, row); else insert('patient_portal', { patient_id: p.id, ...row });
  run('DELETE FROM patient_sessions WHERE patient_id=?', p.id);   // a new PIN signs out old devices
  let sms = false;
  if (req.body?.send_sms && p.mobile && gatewayConfigured()) {
    queueMessage({ patient_id: p.id, body: `${setting('hospital_name', 'MGM HMS')}: your patient portal PIN is ${pin}. Sign in with UHID ${p.uhid} at the hospital's patient portal.`, ref_type: 'portal_pin', ref_id: p.id });
    sendQueued().catch(() => {}); sms = true;
  }
  emit(req, { topics: [`patient:${p.id}`], event: 'patient.updated', data: { id: p.id }, action: ex ? 'portal.pin_reissued' : 'portal.pin_issued', entity: 'patients', entityId: p.id,
    detail: { before: { portal: ex ? (ex.active ? 'active' : 'revoked') : 'none' }, after: { portal: 'active', sent_by_sms: sms }, reason: req.body?.reason || 'Portal access for the patient' } });
  return { pin, uhid: p.uhid, sent_by_sms: sms, path: '/my-health' };
}));

portal.post('/patients/:id/portal-access/revoke', requireAuth, h((req) => {
  if (!['patient.edit', 'op.register'].some((p) => can(req.user, p))) fail(403, 'forbidden', { need: 'patient.edit' });
  const ex = get('SELECT * FROM patient_portal WHERE patient_id=?', +req.params.id) || fail(404, 'no_portal_access');
  update('patient_portal', ex.id, { active: 0 });
  run('DELETE FROM patient_sessions WHERE patient_id=?', ex.patient_id);
  emit(req, { topics: [`patient:${ex.patient_id}`], event: 'patient.updated', data: { id: ex.patient_id }, action: 'portal.revoked', entity: 'patients', entityId: ex.patient_id,
    detail: { before: { portal: 'active' }, after: { portal: 'revoked' }, reason: req.body?.reason || null } });
  return { revoked: true };
}));

portal.get('/patients/:id/portal-access', requireAuth, h((req) => {
  if (!can(req.user, 'patient.view')) fail(403, 'forbidden');
  const a = get('SELECT p.active, p.issued_at, p.last_login_at, p.locked_until, u.name issued_by_name FROM patient_portal p LEFT JOIN users u ON u.id=p.issued_by WHERE p.patient_id=?', +req.params.id);
  return a ? { ...a, locked: locked(a), sms_available: gatewayConfigured() } : { active: 0, sms_available: gatewayConfigured() };
}));

/* --------------------------------------------------------------- patients */

portal.get('/portal/config', h(() => ({ hospital: setting('hospital_name', 'MGM HMS'), otp: gatewayConfigured() })));

portal.post('/portal/login', h((req) => {
  ipGuard(req);
  const pin = String(req.body?.pin || '').trim();
  if (!/^\d{6}$/.test(pin)) { ipFail(req); fail(400, 'pin_invalid'); }
  const list = candidates(req.body?.identifier).map((p) => ({ p, a: get('SELECT * FROM patient_portal WHERE patient_id=? AND active=1', p.id) })).filter((x) => x.a);
  if (list.some((x) => locked(x.a)) && list.every((x) => locked(x.a))) fail(423, 'account_locked', { minutes: LOCK_MIN });
  const hit = list.filter((x) => !locked(x.a)).find((x) => verifyPassword(pin, x.a.pin_hash));
  if (!hit) {
    for (const x of list) failFor(req, x.a, x.p);
    if (!list.length) ipFail(req);
    audit(actor(req, list[0]?.p), 'portal.login_failed', 'patients', list[0]?.p.id ?? null, { after: { method: 'pin', matched_accounts: list.length }, reason: 'Wrong portal PIN or unknown identifier' });
    fail(401, 'sign_in_failed');
  }
  return startSession(req, hit.p, 'pin');
}));

/** One-time code to the registered mobile. Always answers the same way, so it never reveals who is registered. */
portal.post('/portal/otp', h((req) => {
  ipGuard(req);
  if (!gatewayConfigured()) fail(409, 'sms_not_configured');
  // a mobile shared by a family must name one patient with portal access; otherwise use the UHID
  const withAccess = candidates(req.body?.identifier).filter((x) => get('SELECT 1 FROM patient_portal WHERE patient_id=? AND active=1', x.id));
  const p = withAccess.length === 1 ? withAccess[0] : null;
  const access = p && get('SELECT * FROM patient_portal WHERE patient_id=? AND active=1', p.id);
  if (p && access && !locked(access) && p.mobile) {
    const recent = get("SELECT count(*) n FROM portal_otps WHERE patient_id=? AND created_at > ?", p.id, stamp(Date.now() - 15 * 60e3)).n;
    if (recent < 3) {
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      run('UPDATE portal_otps SET used_at=? WHERE patient_id=? AND used_at IS NULL', nowIso(), p.id);
      insert('portal_otps', { patient_id: p.id, code_hash: hashPassword(code), expires_at: stamp(Date.now() + OTP_MIN * 60e3), attempts: 0, created_at: nowIso() });
      audit(actor(req, p), 'portal.otp_requested', 'patients', p.id, { after: { expires_minutes: OTP_MIN }, reason: 'Portal sign-in code sent to the registered mobile' });
      queueMessage({ patient_id: p.id, body: `${setting('hospital_name', 'MGM HMS')}: ${code} is your patient portal sign-in code. It expires in ${OTP_MIN} minutes. Do not share it.`, ref_type: 'portal_otp', ref_id: p.id });
      sendQueued().catch(() => {});
    }
  } else ipFail(req);
  return { sent: true, minutes: OTP_MIN };
}));

portal.post('/portal/otp/verify', h((req) => {
  ipGuard(req);
  const code = String(req.body?.code || '').trim();
  const list = candidates(req.body?.identifier);
  for (const p of list) {
    const access = get('SELECT * FROM patient_portal WHERE patient_id=? AND active=1', p.id);
    if (!access) continue;
    if (locked(access)) fail(423, 'account_locked', { minutes: LOCK_MIN });
    const otp = get('SELECT * FROM portal_otps WHERE patient_id=? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1', p.id, nowIso());
    if (!otp) continue;
    if (/^\d{6}$/.test(code) && verifyPassword(code, otp.code_hash)) { update('portal_otps', otp.id, { used_at: nowIso() }); return startSession(req, p, 'otp'); }
    update('portal_otps', otp.id, { attempts: otp.attempts + 1, ...(otp.attempts + 1 >= 3 ? { used_at: nowIso() } : {}) });
    failFor(req, access, p);
  }
  ipFail(req);
  audit(actor(req, list[0]), 'portal.login_failed', 'patients', list[0]?.id ?? null, { after: { method: 'otp' }, reason: 'Wrong or expired portal sign-in code' });
  fail(401, 'sign_in_failed');
}));

function portalPatient(req) {
  const token = req.headers['x-portal-token'];
  const s = token && get('SELECT s.*, a.active FROM patient_sessions s JOIN patient_portal a ON a.patient_id=s.patient_id WHERE s.token=?', String(token));
  if (!s || !s.active || s.expires_at <= nowIso()) fail(401, 'portal_session_expired');
  return get('SELECT * FROM patients WHERE id=?', s.patient_id);
}

portal.post('/portal/logout', h((req) => { run('DELETE FROM patient_sessions WHERE token=?', String(req.headers['x-portal-token'] || '')); return { ok: true }; }));

/** Everything the signed-in patient may see about themselves — final, verified information only. */
portal.get('/portal/me', h((req) => {
  const p = portalPatient(req);
  const id = p.id;
  const lab = all(`SELECT o.id, o.order_no, o.label, o.verified_at, o.ordered_at FROM orders o WHERE o.patient_id=? AND o.category='lab' AND o.status='verified' ORDER BY o.id DESC LIMIT 60`, id)
    .map((o) => ({ ...o, results: all('SELECT name, value, unit, ref_range, flag FROM lab_results WHERE order_id=? ORDER BY id', o.id) }));
  const imaging = all(`SELECT o.id, o.order_no, o.label, r.findings, r.impression, r.advice, r.signed_at FROM orders o JOIN reports r ON r.order_id=o.id
    WHERE o.patient_id=? AND o.category='imaging' AND r.status IN ('final','amended') ORDER BY o.id DESC LIMIT 40`, id);
  const prescriptions = all(`SELECT r.id, r.created_at, u.name doctor FROM prescriptions r LEFT JOIN users u ON u.id=r.doctor_id WHERE r.patient_id=? ORDER BY r.id DESC LIMIT 20`, id)
    .map((r) => ({ ...r, items: all('SELECT drug, dose, route, frequency, duration_days, instructions FROM prescription_items WHERE prescription_id=?', r.id) }));
  const summaries = all(`SELECT id, ip_no, admitted_at, discharged_at, summary_json, summary_at FROM admissions WHERE patient_id=? AND summary_status='final' ORDER BY id DESC`, id)
    .map(({ summary_json, ...a }) => { let s = {}; try { s = JSON.parse(summary_json || '{}'); } catch { /* ignore */ } return { ...a, summary: s }; });
  audit(actor(req, p), 'portal.view', 'patients', id, { after: { viewed: 'own records' } });
  return {
    patient: { name: p.name, uhid: p.uhid, gender: p.gender, age_years: p.age_years, blood_group: p.blood_group, mobile: p.mobile ? `******${String(p.mobile).slice(-4)}` : null },
    visits: all(`SELECT e.visit_date, e.kind, u.name doctor, d.name department FROM encounters e LEFT JOIN users u ON u.id=e.doctor_id LEFT JOIN departments d ON d.id=e.department_id
      WHERE e.patient_id=? AND e.stage<>'cancelled' ORDER BY e.id DESC LIMIT 50`, id),
    appointments: all(`SELECT a.appt_no, a.slot_start, a.status, u.name doctor FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id
      WHERE a.patient_id=? AND date(a.slot_start)>=date('now','localtime') AND a.status IN ('booked','confirmed') ORDER BY a.slot_start`, id),
    lab, imaging, prescriptions, summaries,
    bills: all(`SELECT bill_no, bill_date, bill_type, total, paid, balance, status FROM bills WHERE patient_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 40`, id),
    receipts: all(`SELECT receipt_no, created_at received_at, amount, mode FROM payments WHERE patient_id=? AND cancelled=0 ORDER BY id DESC LIMIT 40`, id),
  };
}));
