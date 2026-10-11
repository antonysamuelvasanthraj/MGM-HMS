/**
 * Patient messages: report-ready notices, due reminders and anything else
 * queued in patient_messages. If an SMS / WhatsApp gateway is configured in
 * Hospital Settings, queued messages are sent automatically every minute;
 * otherwise staff send them from the Patient Messages screen with one click
 * (opens WhatsApp with the text filled in) and mark them sent.
 *
 * Gateway settings (all optional):
 *   sms_gateway_url     — URL with {mobile} and {message} placeholders (URL-encoded on use)
 *   sms_gateway_method  — GET (default) or POST (sends JSON {mobile, message})
 *   sms_gateway_header  — one extra header, e.g. "Authorization: Bearer abc123"
 */
import { all, get, insert, update, nowIso } from './db.js';

const s = (k) => get('SELECT value FROM settings WHERE key=?', k)?.value || '';

/** 10-digit Indian mobiles get the 91 country code; anything else is sent as typed (digits only). */
export function normaliseMobile(m) {
  const d = String(m || '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d;
}

export function queueMessage({ patient_id, body, ref_type = null, ref_id = null, channel = 'sms' }) {
  const p = get('SELECT mobile FROM patients WHERE id=?', patient_id);
  if (!p) return null;
  return insert('patient_messages', { patient_id, channel, mobile: p.mobile, body, ref_type, ref_id });
}

export const gatewayConfigured = () => !!s('sms_gateway_url').trim();

let sending = false;
/** Send up to 20 queued messages through the configured gateway. */
export async function sendQueued() {
  if (sending || !gatewayConfigured()) return 0;
  sending = true;
  let sent = 0;
  try {
    const url = s('sms_gateway_url').trim(), method = (s('sms_gateway_method') || 'GET').toUpperCase(), hdr = s('sms_gateway_header');
    const headers = {};
    if (hdr.includes(':')) headers[hdr.slice(0, hdr.indexOf(':')).trim()] = hdr.slice(hdr.indexOf(':') + 1).trim();
    for (const m of all("SELECT * FROM patient_messages WHERE status='queued' AND coalesce(attempts,0) < 3 ORDER BY id LIMIT 20")) {
      const mobile = normaliseMobile(m.mobile);
      if (mobile.length < 10) { update('patient_messages', m.id, { status: 'failed', error: 'No valid mobile number', attempts: 3 }); continue; }
      try {
        const target = url.replace(/\{mobile\}/g, encodeURIComponent(mobile)).replace(/\{message\}/g, encodeURIComponent(m.body));
        const res = await fetch(target, method === 'POST'
          ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ mobile, message: m.body }), signal: AbortSignal.timeout(15000) }
          : { headers, signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Gateway replied ${res.status}`);
        update('patient_messages', m.id, { status: 'sent', sent_at: nowIso(), error: null, attempts: (m.attempts || 0) + 1, sent_via: 'gateway',
          ...(String(m.ref_type || '').startsWith('portal_') ? { body: 'Patient portal sign-in code (removed after sending)' } : {}) });
        sent++;
      } catch (e) {
        const attempts = (m.attempts || 0) + 1;
        update('patient_messages', m.id, { attempts, error: String(e.message || e).slice(0, 200), status: attempts >= 3 ? 'failed' : 'queued' });
      }
    }
  } finally { sending = false; }
  return sent;
}
