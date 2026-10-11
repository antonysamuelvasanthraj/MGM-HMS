/** Patient messages desk: list, queue reminders, mark sent after WhatsApp, retry. Also backup status. */
import { Router } from 'express';
import { h, fail, all, get, update, emit, nowIso, money } from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { queueMessage, normaliseMobile, gatewayConfigured, sendQueued } from '../messages.js';
import { backupStatus, dailyBackup } from '../backup.js';
import { billScope } from './billing.js';

export const messages = Router();
const canSee = (u) => can(u, 'payment.collect') || can(u, 'finance.view') || can(u, 'admin.view');
const need = (ok) => (req, res, next) => (ok(req.user) ? next() : res.status(403).json({ error: 'forbidden' }));

messages.get('/messages', requireAuth, need(canSee), h((req) => {
  const status = ['queued', 'sent', 'failed'].includes(req.query.status) ? req.query.status : null;
  const scope = billScope(req.user);
  const where = [status ? 'm.status=?' : null,
    scope ? `(m.ref_type='bill_due' AND m.ref_id IN (SELECT b.id FROM bills b WHERE ${scope}))` : null].filter(Boolean);
  const rows = all(`SELECT m.*, p.name patient_name, p.uhid FROM patient_messages m JOIN patients p ON p.id=m.patient_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.status='queued' DESC, m.id DESC LIMIT 300`, ...(status ? [status] : []))
    .map((m) => ({ ...m, wa_number: normaliseMobile(m.mobile), ...(String(m.ref_type || '').startsWith('portal_') ? { body: 'Patient portal sign-in code (hidden)', private: true } : {}) }));
  return { rows, gateway: gatewayConfigured(),
    counts: Object.fromEntries(all('SELECT status, count(*) n FROM patient_messages GROUP BY status').map((r) => [r.status, r.n])) };
}));

/** Queue a message for a patient (free text), e.g. a follow-up or instructions. */
messages.post('/messages', requireAuth, need(canSee), h((req) => {
  const b = req.body || {};
  const body = String(b.body || '').trim();
  if (!body) fail(400, 'message_required');
  if (!get('SELECT 1 FROM patients WHERE id=?', +b.patient_id)) fail(404, 'patient_not_found');
  const id = queueMessage({ patient_id: +b.patient_id, body: body.slice(0, 900), ref_type: b.ref_type || 'manual', ref_id: b.ref_id || null });
  emit(req, { topics: ['messages'], event: 'message.queued', data: { id }, action: 'message.queue', entity: 'patient_messages', entityId: id, detail: { after: { body } } });
  sendQueued();
  return get('SELECT * FROM patient_messages WHERE id=?', id);
}));

/** Due reminder for an open bill. */
messages.post('/bills/:id/remind', requireAuth, need((u) => can(u, 'payment.collect') || can(u, 'finance.view') || can(u, 'admin.view')), h((req) => {
  const b = get(`SELECT b.*, p.name, p.mobile FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.id=?`, +req.params.id) || fail(404, 'bill_not_found');
  if (!(b.balance > 0.005) || b.status === 'cancelled') fail(409, 'nothing_outstanding');
  if (!b.mobile) fail(409, 'patient_has_no_mobile');
  const hosp = get("SELECT value FROM settings WHERE key='hospital_name'")?.value || 'the hospital';
  const phone = get("SELECT value FROM settings WHERE key='phone'")?.value;
  const body = `Dear ${b.name}, an amount of Rs ${money(b.balance).toFixed(2)} is due on bill ${b.bill_no} at ${hosp}. Please pay at the ${b.bill_type === 'PHARM' ? 'pharmacy' : 'reception'} counter${phone ? ` or call ${phone}` : ''}. Thank you.`;
  const id = queueMessage({ patient_id: b.patient_id, body, ref_type: 'bill_due', ref_id: b.id });
  emit(req, { topics: ['messages'], event: 'message.queued', data: { id }, action: 'message.due_reminder', entity: 'bills', entityId: b.id, detail: { after: { balance: b.balance } } });
  sendQueued();
  const queued = get('SELECT * FROM patient_messages WHERE id=?', id);
  return Object.assign(queued, { wa_number: normaliseMobile(b.mobile), gateway: gatewayConfigured() });
}));

/** Sent by hand (e.g. through WhatsApp). */
messages.post('/messages/:id/sent', requireAuth, need(canSee), h((req) => {
  const m = get('SELECT * FROM patient_messages WHERE id=?', +req.params.id) || fail(404, 'message_not_found');
  update('patient_messages', m.id, { status: 'sent', sent_at: nowIso(), sent_via: req.body?.via || 'whatsapp', sent_by: req.user.id, error: null });
  emit(req, { topics: ['messages'], event: 'message.sent', data: { id: m.id }, action: 'message.sent', entity: 'patient_messages', entityId: m.id,
    detail: { before: { status: m.status }, after: { status: 'sent', via: req.body?.via || 'whatsapp' } } });
  return { ok: true };
}));

messages.post('/messages/:id/retry', requireAuth, need(canSee), h((req) => {
  const m = get('SELECT * FROM patient_messages WHERE id=?', +req.params.id) || fail(404, 'message_not_found');
  update('patient_messages', m.id, { status: 'queued', attempts: 0, error: null });
  emit(req, { topics: ['billing'], event: 'message.updated', data: { id: m.id }, action: 'message.retry', entity: 'patient_messages', entityId: m.id,
    detail: { before: { status: m.status, error: m.error }, after: { status: 'queued' } } });
  sendQueued();
  return { ok: true };
}));

messages.get('/system/backups', requirePerm('admin.view'), h(() => backupStatus()));
messages.post('/system/backups/now', requirePerm('admin.write'), h((req) => {
  const f = dailyBackup();
  emit(req, { topics: ['system'], event: 'backup.made', data: {}, action: 'backup.daily', entity: 'system', detail: { after: { file: f } } });
  return { made: !!f, ...backupStatus() };
}));
