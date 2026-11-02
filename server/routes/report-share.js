/**
 * Lab report QR sharing.
 *
 * Every printed lab report carries a QR. The QR holds a random link to the report:
 *   - cloud connected (Settings → Lab reports): the link points at the cloud address;
 *   - otherwise: the link points at this server (works on the hospital network; reachable from outside
 *     only if the hospital publishes the server's address).
 * The page behind the link shows RELEASED (verified) results only, is read-only, needs no login, and
 * stops working `report_qr_retention_days` (default 90) after the report was released, or when the
 * hospital turns patient downloads off. Every open is counted.
 *
 *   POST /lab/shares            staff: get (or create) the share link for one or more of a patient's orders
 *   GET  /public/report/:token  anyone with the link: the report data
 *   GET  /r/:token              the page (client/report-view.html)
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { requirePerm } from '../auth.js';
import { h, fail, all, get, insert, update, setting } from '../lib.js';
import { buildLabReport } from './diagnostics.js';

export const reportShare = Router();

const days = () => Math.min(Math.max(parseInt(setting('report_qr_retention_days', '90'), 10) || 90, 1), 3650);
const addDays = (stamp, n) => { const d = new Date(String(stamp).replace(' ', 'T')); d.setDate(d.getDate() + n); return d; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Where the QR should point: the cloud when one is connected, else this server. */
function baseUrl(req) {
  const cloud = String(setting('cloud_base_url', '') || '').trim().replace(/\/+$/, '');
  if (setting('cloud_enabled', '0') === '1' && /^https?:\/\//i.test(cloud)) return { url: cloud, scope: 'cloud' };
  const lan = String(setting('lan_ip', '') || '').trim();
  const port = process.env.PORT || 4300;
  if (lan) return { url: /^https?:\/\//i.test(lan) ? lan.replace(/\/+$/, '') : `http://${lan}:${port}`, scope: 'hospital' };
  return { url: `${req.protocol}://${req.headers.host}`, scope: 'hospital' };
}

/** The date a share stops working: retention days after the LAST of its reports was released. */
function expiryOf(orders) {
  const released = orders.map((o) => o.verified_at).filter(Boolean).sort().pop();
  return released ? addDays(released, days()) : null;
}

reportShare.post('/lab/shares', requirePerm('lab.view'), h((req) => {
  const ids = [...new Set((req.body?.order_ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!ids.length || ids.length > 40) fail(400, 'order_ids_required');
  const orders = ids.map((id) => get("SELECT id, patient_id, verified_at FROM orders WHERE id=? AND category='lab'", id) || fail(404, 'order_not_found'));
  if (new Set(orders.map((o) => o.patient_id)).size !== 1) fail(400, 'one_patient_only');
  const key = JSON.stringify(ids);
  let share = get('SELECT * FROM report_shares WHERE order_ids=? AND revoked=0', key);
  if (!share) {
    const id = insert('report_shares', { token: crypto.randomBytes(18).toString('hex'), order_ids: key, patient_id: orders[0].patient_id, created_by: req.user.id,
      cloud_status: setting('cloud_enabled', '0') === '1' ? 'queued' : null });
    share = get('SELECT * FROM report_shares WHERE id=?', id);
    // with a cloud connected the share is queued for it (the sync queue is exported / delivered by the cloud connector)
    if (setting('cloud_enabled', '0') === '1' && setting('sync_queue_enabled', '0') === '1') { try { insert('sync_queue', { entity: 'report_share', entity_id: share.id, op: 'publish', status: 'queued' }); } catch { /* queue is best effort */ } }
  }
  const base = baseUrl(req), expires = expiryOf(orders);
  return { token: share.token, url: `${base.url}/r/${share.token}`, scope: base.scope, expires_at: expires ? iso(expires) : null, retention_days: days(),
    download_enabled: setting('report_qr_download', '1') === '1' };
}));

// light per-address limit: a link is unguessable, but nobody should be able to hammer the page
const hits = new Map();
const limited = (ip) => { const now = Date.now(); const h2 = (hits.get(ip) || []).filter((t) => now - t < 60000); h2.push(now); hits.set(ip, h2); return h2.length > 40; };

reportShare.get('/public/report/:token', h((req, res) => {
  if (limited(req.ip)) fail(429, 'too_many_requests');
  if (setting('report_qr_download', '1') !== '1') fail(403, 'downloads_switched_off');
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{36}$/.test(token)) fail(404, 'not_found');
  const share = get('SELECT * FROM report_shares WHERE token=? AND revoked=0', token) || fail(404, 'not_found');
  const ids = JSON.parse(share.order_ids);
  const orders = all(`SELECT id, status, verified_at FROM orders WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const released = orders.filter((o) => o.verified_at);
  if (!released.length) return { state: 'not_ready', message: 'This report has not been released yet. Please ask the laboratory.' };
  const expires = expiryOf(released);
  if (expires && expires < new Date()) fail(410, 'expired', { expired_on: iso(expires) });
  update('report_shares', share.id, { opens: share.opens + 1, last_opened: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  const reports = released.map((o) => buildLabReport(o.id)).map((r) => {
    // a public page needs the report and nothing else: no staff names beyond the signatory, no internal ids
    const { settings, results, result_guidance, patient_name, uhid, age_years, gender, service_name, lab_section, sample_type, completed_at, verified_at,
      verified_by_name, verified_by_qual, verified_by_reg, test_comment, test_comment_title, test_description, lab_remarks, order_no, referred_by_name } = r;
    return { settings, results: results.map((x) => ({ name: x.name, value: x.value, unit: x.unit, ref_range: x.ref_range, flag: x.flag, method: x.method, heading: x.param_type === 'heading' })), result_guidance,
      patient_name, uhid, age_years, gender, service_name, lab_section, sample_type, completed_at, verified_at, verified_by_name, verified_by_qual, verified_by_reg,
      test_comment, test_comment_title, test_description, lab_remarks, order_no, referred_by_name };
  });
  return { state: 'ready', expires_at: expires ? iso(expires) : null, reports };
}));
