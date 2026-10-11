/**
 * Maintenance & assets — the hospital's equipment register and its repair tickets.
 *
 * Assets: beds, monitors, ventilators, ACs, refrigerators, lab / OT equipment, computers, printers,
 * UPS, generator, furniture, medical devices — with location, warranty, AMC, vendor and service dates.
 * Status: active · maintenance · out_of_service · retired.
 *
 * Tickets: any signed-in staff member can report a fault (maintenance.raise is given to everyone who
 * signs in); the maintenance team (maintenance.write) assigns, works and closes it:
 * open → assigned → in_progress → resolved → closed. While a ticket is open on an asset, the asset
 * shows "maintenance"; closing the last one puts it back to active. Every change is audited.
 */
import { Router } from 'express';
import { h, fail, all, get, insert, update, emit, nowIso, today, num } from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';

export const maintenance = Router();
const TOPICS = ['maintenance', 'dashboard'];
export const ASSET_TYPES = ['Bed', 'Monitor', 'Ventilator', 'AC', 'Refrigerator', 'Lab equipment', 'OT equipment', 'Computer', 'Printer', 'UPS', 'Generator', 'Furniture', 'Medical device', 'Other'];
const ASSET_STATUS = ['active', 'maintenance', 'out_of_service', 'retired'];
const TICKET_STATUS = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const PRIORITY = ['low', 'normal', 'high', 'critical'];
const mayManage = (u) => can(u, 'maintenance.write');

const assetView = (id) => get(`SELECT a.*, d.name department_name,
    (SELECT count(*) FROM maintenance_tickets t WHERE t.asset_id=a.id AND t.status NOT IN ('resolved','closed')) open_tickets
  FROM assets a LEFT JOIN departments d ON d.id=a.department_id WHERE a.id=?`, id);
const ticketView = (id) => get(`SELECT t.*, a.asset_code, a.name asset_name, a.location asset_location, d.name department_name,
    r.name raised_by_name, s.name assigned_to_name
  FROM maintenance_tickets t LEFT JOIN assets a ON a.id=t.asset_id LEFT JOIN departments d ON d.id=t.department_id
  LEFT JOIN users r ON r.id=t.raised_by LEFT JOIN users s ON s.id=t.assigned_to WHERE t.id=?`, id);

maintenance.get('/maintenance/summary', requireAuth, h(() => ({
  assets: get(`SELECT count(*) total, sum(status='active') active, sum(status='maintenance') maintenance, sum(status='out_of_service') out_of_service,
    sum(status='retired') retired, sum(next_service IS NOT NULL AND next_service <= date('now','localtime','+15 day') AND status<>'retired') service_due,
    sum(amc_until IS NOT NULL AND amc_until < date('now','localtime') AND status<>'retired') amc_expired FROM assets`),
  tickets: get(`SELECT sum(status='open') open, sum(status='assigned') assigned, sum(status='in_progress') in_progress,
    sum(status='resolved') resolved, sum(status NOT IN ('resolved','closed') AND priority='critical') critical FROM maintenance_tickets`),
  types: ASSET_TYPES,
})));

maintenance.get('/maintenance/assets', requireAuth, h((req) => {
  const where = [], args = [];
  if (req.query.status && req.query.status !== 'all') { where.push('a.status=?'); args.push(req.query.status); }
  if (req.query.type) { where.push('a.asset_type=?'); args.push(req.query.type); }
  if (req.query.q) { where.push('(a.asset_code LIKE ? OR a.name LIKE ? OR a.location LIKE ? OR a.vendor LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l, l); }
  return all(`SELECT a.*, d.name department_name,
      (SELECT count(*) FROM maintenance_tickets t WHERE t.asset_id=a.id AND t.status NOT IN ('resolved','closed')) open_tickets
    FROM assets a LEFT JOIN departments d ON d.id=a.department_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.status='retired', a.asset_code LIMIT 1000`, ...args);
}));

function cleanAsset(b) {
  const f = {};
  for (const k of ['name', 'asset_type', 'location', 'make_model', 'serial_no', 'vendor', 'vendor_contact', 'notes']) if (k in b) f[k] = String(b[k] ?? '').trim() || null;
  for (const k of ['purchase_date', 'warranty_until', 'amc_until', 'last_service', 'next_service']) if (k in b) {
    if (b[k] && !/^\d{4}-\d{2}-\d{2}$/.test(b[k])) fail(400, `${k}_invalid`);
    f[k] = b[k] || null;
  }
  if ('department_id' in b) f.department_id = b.department_id ? num(b.department_id) : null;
  if ('purchase_cost' in b) { f.purchase_cost = b.purchase_cost === '' || b.purchase_cost == null ? null : num(b.purchase_cost); if (f.purchase_cost !== null && !(f.purchase_cost >= 0)) fail(400, 'purchase_cost_invalid'); }
  if ('status' in b && !ASSET_STATUS.includes(b.status)) fail(400, 'status_invalid');
  if ('status' in b) f.status = b.status;
  if ('asset_type' in f && f.asset_type && !ASSET_TYPES.includes(f.asset_type)) fail(400, 'asset_type_invalid');
  return f;
}

maintenance.post('/maintenance/assets', requirePerm('maintenance.write'), h((req) => {
  const b = req.body || {}, f = cleanAsset(b);
  if (!f.name || !f.asset_type) fail(400, 'name_and_type_required');
  const code = String(b.asset_code || '').trim() || `AST-${String((get('SELECT max(id) m FROM assets').m || 0) + 1).padStart(4, '0')}`;
  if (get('SELECT 1 FROM assets WHERE asset_code=?', code)) fail(409, 'asset_code_exists');
  const id = insert('assets', { asset_code: code, status: 'active', created_at: nowIso(), created_by: req.user.id, ...f });
  const row = assetView(id);
  emit(req, { topics: TOPICS, event: 'asset.created', data: row, action: 'asset.create', entity: 'assets', entityId: id, detail: { before: null, after: row } });
  return row;
}));

maintenance.patch('/maintenance/assets/:id', requirePerm('maintenance.write'), h((req) => {
  const before = get('SELECT * FROM assets WHERE id=?', +req.params.id) || fail(404, 'asset_not_found');
  const f = cleanAsset(req.body || {});
  if (f.status === 'retired' && get("SELECT 1 FROM maintenance_tickets WHERE asset_id=? AND status NOT IN ('resolved','closed')", before.id)) fail(409, 'asset_has_open_tickets');
  update('assets', before.id, { ...f, updated_at: nowIso() });
  const row = assetView(before.id);
  emit(req, { topics: TOPICS, event: 'asset.updated', data: row, action: 'asset.update', entity: 'assets', entityId: before.id,
    detail: { before: Object.fromEntries(Object.keys(f).map((k) => [k, before[k]])), after: f, reason: req.body?.reason } });
  return row;
}));

maintenance.get('/maintenance/tickets', requireAuth, h((req) => {
  const where = [], args = [];
  if (req.query.status === 'open') where.push("t.status NOT IN ('resolved','closed')");
  else if (req.query.status && req.query.status !== 'all') { where.push('t.status=?'); args.push(req.query.status); }
  if (req.query.asset_id) { where.push('t.asset_id=?'); args.push(num(req.query.asset_id)); }
  // staff without the maintenance role see the tickets they raised
  if (!mayManage(req.user) && !can(req.user, 'maintenance.view')) { where.push('t.raised_by=?'); args.push(req.user.id); }
  return all(`SELECT t.*, a.asset_code, a.name asset_name, a.location asset_location, d.name department_name, r.name raised_by_name, s.name assigned_to_name
    FROM maintenance_tickets t LEFT JOIN assets a ON a.id=t.asset_id LEFT JOIN departments d ON d.id=t.department_id
    LEFT JOIN users r ON r.id=t.raised_by LEFT JOIN users s ON s.id=t.assigned_to
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.status IN ('resolved','closed'), CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.id DESC LIMIT 500`, ...args);
}));

maintenance.post('/maintenance/tickets', requireAuth, h((req) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) fail(400, 'title_required');
  if (b.priority && !PRIORITY.includes(b.priority)) fail(400, 'priority_invalid');
  const asset = b.asset_id ? get('SELECT * FROM assets WHERE id=?', num(b.asset_id)) || fail(404, 'asset_not_found') : null;
  if (asset?.status === 'retired') fail(409, 'asset_retired');
  const id = insert('maintenance_tickets', {
    ticket_no: `MT-${today().replace(/-/g, '').slice(2)}-${String((get('SELECT count(*) n FROM maintenance_tickets WHERE date(raised_at)=date(?)', today()).n || 0) + 1).padStart(3, '0')}`,
    asset_id: asset?.id || null, department_id: b.department_id ? num(b.department_id) : asset?.department_id || req.user.department_id || null,
    location: String(b.location || asset?.location || '').trim() || null, title, description: String(b.description || '').trim() || null,
    priority: b.priority || 'normal', status: 'open', raised_by: req.user.id, raised_at: nowIso(),
  });
  if (asset && asset.status === 'active') update('assets', asset.id, { status: 'maintenance', updated_at: nowIso() });
  const row = ticketView(id);
  emit(req, { topics: TOPICS, event: 'maintenance.ticket', data: row, action: 'maintenance.ticket.raise', entity: 'maintenance_tickets', entityId: id, detail: { before: null, after: row } });
  return row;
}));

maintenance.patch('/maintenance/tickets/:id', requirePerm('maintenance.write'), h((req) => {
  const before = get('SELECT * FROM maintenance_tickets WHERE id=?', +req.params.id) || fail(404, 'ticket_not_found');
  const b = req.body || {}, f = {};
  if ('status' in b) {
    if (!TICKET_STATUS.includes(b.status)) fail(400, 'status_invalid');
    if (before.status === 'closed') fail(409, 'ticket_closed');
    f.status = b.status;
    if (b.status === 'assigned' && !(b.assigned_to || before.assigned_to)) fail(400, 'assignee_required');
    if (['resolved', 'closed'].includes(b.status) && !String(b.resolution || before.resolution || '').trim()) fail(400, 'resolution_required');
    if (b.status === 'resolved') f.resolved_at = nowIso();
    if (b.status === 'closed') f.closed_at = nowIso();
  }
  if ('assigned_to' in b) f.assigned_to = b.assigned_to ? num(b.assigned_to) : null;
  if ('priority' in b) { if (!PRIORITY.includes(b.priority)) fail(400, 'priority_invalid'); f.priority = b.priority; }
  for (const k of ['resolution', 'vendor_reference']) if (k in b) f[k] = String(b[k] || '').trim() || null;
  if ('cost' in b) f.cost = b.cost === '' || b.cost == null ? null : num(b.cost);
  if (f.status === 'assigned' && f.assigned_to === undefined && b.assigned_to === undefined && before.assigned_to) f.assigned_to = before.assigned_to;
  update('maintenance_tickets', before.id, { ...f, updated_at: nowIso() });
  // the asset follows its tickets: back to active (and serviced today) when nothing is left open
  if (before.asset_id && ['resolved', 'closed'].includes(f.status)
      && !get("SELECT 1 FROM maintenance_tickets WHERE asset_id=? AND status NOT IN ('resolved','closed')", before.asset_id)) {
    const a = get('SELECT status FROM assets WHERE id=?', before.asset_id);
    if (a?.status === 'maintenance') update('assets', before.asset_id, { status: 'active', last_service: today(), updated_at: nowIso() });
  }
  const row = ticketView(before.id);
  emit(req, { topics: TOPICS, event: 'maintenance.ticket', data: row, action: 'maintenance.ticket.update', entity: 'maintenance_tickets', entityId: before.id,
    detail: { before: Object.fromEntries(Object.keys(f).map((k) => [k, before[k]])), after: f, reason: b.resolution || b.reason } });
  return row;
}));
