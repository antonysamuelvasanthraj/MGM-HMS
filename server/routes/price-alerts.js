/**
 * GRN price changes — every changed purchase cost, MRP or selling price on a GRN becomes an alert that the
 * store in-charge must acknowledge with what was done (accepted, selling price revised, queried with the
 * supplier, goods to be returned). A big increase is flagged to management at once; anything left
 * unacknowledged past the escalation window goes up to the owner / manager / administrator.
 */
import { Router } from 'express';
import { requireAuth, can } from '../auth.js';
import { h, fail, all, get, one, insert, update, nowIso, emit, setting } from '../lib.js';
import { notify, publish } from '../realtime.js';

export const priceAlerts = Router();
const ACTIONS = { accepted: 'Accepted the new price', selling_price_revised: 'Selling price revised', supplier_query: 'Queried with the supplier', return_goods: 'Goods to be returned' };
const MANAGEMENT = ['admin', 'owner', 'manager'];
const canSee = (u) => can(u, 'purchase.view') || can(u, 'inventory.approve') || can(u, 'finance.view') || can(u, 'admin.view');
const canAck = (u) => can(u, 'inventory.approve') || can(u, 'admin.write') || MANAGEMENT.includes(u.role) || u.role === 'pharmacy_admin';
const highPct = () => Number(setting('price_alert_high_pct', 10)) || 10;
const escalateHours = () => Number(setting('price_alert_escalate_hours', 24)) || 24;

function tell(users, level, title, body) {
  for (const u of users) {
    insert('notifications', { user_id: u.id, level, title, body, link: '/grn' });
    notify(level, title, body, { user_id: u.id, link: '/grn' });
  }
}
const inCharges = () => all('SELECT * FROM users WHERE active=1').filter((u) => [...MANAGEMENT, 'medical_superintendent', 'pharmacy_admin'].includes(u.role) || can(u, 'inventory.approve'));
const management = () => all(`SELECT * FROM users WHERE active=1 AND role IN (${MANAGEMENT.map(() => '?').join(',')})`, ...MANAGEMENT);
const line = (c) => `${c.medicine} ${c.price_type}: ${c.direction}, per unit ${(+c.previous_cost).toFixed(4)} → ${(+c.new_cost).toFixed(4)}${c.percent === null ? '' : ` (${c.percent}%)`}`;

/** Called inside the GRN transaction. */
export function recordPriceAlerts(grn, changes) {
  if (!changes.length) return [];
  const ids = changes.map((c) => insert('price_alerts', {
    purchase_id: grn.id, grn_no: grn.grn_no, medicine_id: c.medicine_id, medicine: c.medicine, price_type: c.price_type,
    previous_grn: c.previous_grn, previous_supplier: c.previous_supplier, previous_cost: c.previous_cost, new_cost: c.new_cost,
    direction: c.direction, percent: c.percent,
    severity: c.direction === 'increase' && (c.percent === null || c.percent >= highPct()) ? 'high' : 'normal',
    status: 'open', escalation_level: 0, created_at: nowIso(),
  }));
  const high = changes.filter((c) => c.direction === 'increase' && (c.percent === null || c.percent >= highPct()));
  tell(inCharges(), 'warning', `GRN price changes — ${grn.grn_no} (acknowledge)`, changes.map(line).join('; '));
  if (high.length) tell(management(), 'danger', `Price increase ≥ ${highPct()}% — ${grn.grn_no}`, high.map(line).join('; '));
  return ids;
}

/** Hourly (and on read): unacknowledged alerts past the window go up to management, once per window. */
export function escalatePriceAlerts() {
  const hours = escalateHours();
  const due = all(`SELECT * FROM price_alerts WHERE status IN ('open','escalated')
    AND (julianday('now','localtime') - julianday(coalesce(escalated_at, created_at))) * 24 >= ?`, hours);
  if (!due.length) return 0;
  for (const a of due) update('price_alerts', a.id, { status: 'escalated', escalated_at: nowIso(), escalation_level: a.escalation_level + 1 });
  const byGrn = Object.groupBy ? Object.groupBy(due, (a) => a.grn_no) : due.reduce((m, a) => ((m[a.grn_no] ||= []).push(a), m), {});
  for (const [grn, list] of Object.entries(byGrn)) tell(management(), 'danger', `Unacknowledged price changes — ${grn}`, `${list.length} change(s) not acknowledged in ${hours} h: ${list.map(line).join('; ')}`);
  publish(['inventory'], 'price_alert.updated', { count: due.length });
  return due.length;
}

priceAlerts.get('/price-alerts', requireAuth, h((req) => {
  if (!canSee(req.user)) fail(403, 'forbidden', { need: 'purchase.view' });
  escalatePriceAlerts();
  const where = [], args = [];
  if (req.query.purchase_id) { where.push('a.purchase_id=?'); args.push(+req.query.purchase_id); }
  if (req.query.status === 'all') { /* everything */ } else if (req.query.status) { where.push('a.status=?'); args.push(req.query.status); } else where.push("a.status IN ('open','escalated')");
  const rows = all(`SELECT a.*, u.name acknowledged_by_name, p.supplier_id, s.name supplier_name FROM price_alerts a LEFT JOIN users u ON u.id=a.acknowledged_by
      LEFT JOIN purchases p ON p.id=a.purchase_id LEFT JOIN suppliers s ON s.id=p.supplier_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE a.status WHEN 'escalated' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, a.severity='high' DESC, a.id DESC LIMIT 500`, ...args);
  return { rows, actions: ACTIONS, can_acknowledge: canAck(req.user), high_pct: highPct(), escalate_hours: escalateHours() };
}));

priceAlerts.post('/price-alerts/acknowledge', requireAuth, h((req) => {
  if (!canAck(req.user)) fail(403, 'forbidden', { need: 'inventory.approve' });
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  if (!ids.length) fail(400, 'ids_required');
  const action = req.body?.action;
  if (!ACTIONS[action]) fail(400, 'action_invalid', { actions: Object.keys(ACTIONS) });
  const note = String(req.body?.note || '').trim();
  const rows = ids.map((id) => get('SELECT * FROM price_alerts WHERE id=?', id) || fail(404, 'alert_not_found', { id }));
  if (rows.some((r) => r.status === 'acknowledged')) fail(409, 'already_acknowledged');
  // a big increase, a supplier query or a return needs the reason written down
  if (!note && (action !== 'accepted' || rows.some((r) => r.severity === 'high'))) fail(400, 'note_required');
  for (const r of rows) update('price_alerts', r.id, { status: 'acknowledged', acknowledged_by: req.user.id, acknowledged_at: nowIso(), action, ack_note: note || null });
  emit(req, { topics: ['inventory'], event: 'price_alert.updated', data: { ids }, action: 'price_alert.acknowledge', entity: 'price_alerts', entityId: ids[0],
    detail: { before: rows.map((r) => ({ id: r.id, status: r.status })), after: { status: 'acknowledged', action: ACTIONS[action], count: ids.length }, reason: note || ACTIONS[action] } });
  return { acknowledged: ids.length };
}));

/** Anyone who can see purchases can push an alert up to management (e.g. a supplier refusing to explain). */
priceAlerts.post('/price-alerts/:id/escalate', requireAuth, h((req) => {
  if (!canSee(req.user)) fail(403, 'forbidden', { need: 'purchase.view' });
  const a = get('SELECT * FROM price_alerts WHERE id=?', +req.params.id) || fail(404, 'alert_not_found');
  if (a.status === 'acknowledged') fail(409, 'already_acknowledged');
  const note = String(req.body?.note || '').trim() || fail(400, 'note_required');
  update('price_alerts', a.id, { status: 'escalated', escalated_at: nowIso(), escalation_level: a.escalation_level + 1, escalation_note: note });
  tell(management(), 'danger', `Price change escalated — ${a.grn_no}`, `${line(a)} · ${note} (by ${req.user.name})`);
  emit(req, { topics: ['inventory'], event: 'price_alert.updated', data: { ids: [a.id] }, action: 'price_alert.escalate', entity: 'price_alerts', entityId: a.id,
    detail: { before: { status: a.status }, after: { status: 'escalated', level: a.escalation_level + 1 }, reason: note } });
  return get('SELECT * FROM price_alerts WHERE id=?', a.id);
}));

export const openPriceAlerts = () => one("SELECT count(*) FROM price_alerts WHERE status IN ('open','escalated')") || 0;
