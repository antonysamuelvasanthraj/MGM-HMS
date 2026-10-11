/**
 * General / maintenance stores — everything that is not a medicine: electrical, plumbing, civil, biomedical
 * spares, housekeeping chemicals, linen, stationery, IT.
 *
 *   material master (code + QR label) → receipt from a supplier (Dr Consumables inventory + input GST, Cr supplier)
 *   → department request → issue (Dr the department's expense head, Cr inventory, at average cost)
 *   → department confirms receipt;  returns, store-to-store transfers and counted adjustments keep stock honest.
 * Stock is per store; value is at weighted average cost. Every movement is a store_moves row with its voucher.
 */
import { Router } from 'express';
import { requireAuth, can } from '../auth.js';
import { h, fail, all, get, one, insert, update, run, num, money, nowIso, tx, emit, nextNo, setting } from '../lib.js';
import { postVoucher } from '../accounting.js';
import os from 'node:os';

export const stores = Router();
export const STORES = { MAIN: 'Main / maintenance store', ELEC: 'Electrical store', BIOMED: 'Biomedical spares', HK: 'Housekeeping store', IT: 'IT store' };
export const CATEGORIES = {
  electrical: ['Electrical', 'exp_maintenance'], plumbing: ['Plumbing', 'exp_maintenance'], civil: ['Civil / carpentry', 'exp_maintenance'],
  biomedical: ['Biomedical spares', 'exp_maintenance'], hvac: ['AC / HVAC', 'exp_maintenance'], housekeeping: ['Housekeeping & cleaning', 'exp_housekeeping'],
  linen: ['Linen', 'exp_laundry'], stationery: ['Stationery & printing', 'exp_stationery'], it: ['IT consumables', 'exp_admin'], general: ['General', 'exp_general'],
};
const UNITS = ['nos', 'box', 'pack', 'pair', 'set', 'roll', 'metre', 'litre', 'kg', 'bottle', 'can', 'ream'];
const canView = (u) => can(u, 'stores.view') || can(u, 'stores.write') || can(u, 'admin.view');
const canWrite = (u) => can(u, 'stores.write') || can(u, 'admin.write');
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const qtyAt = (itemId, store) => one('SELECT coalesce(qty,0) FROM store_stock WHERE item_id=? AND store=?', itemId, store) || 0;
const store = (s) => (STORES[s] ? s : fail(400, 'store_invalid', { stores: Object.keys(STORES) }));
const deptOf = (u) => get('SELECT d.code, d.name FROM departments d WHERE d.id=?', u.department_id) || null;

function addStock(itemId, st, delta) {
  if (get('SELECT 1 FROM store_stock WHERE item_id=? AND store=?', itemId, st)) run('UPDATE store_stock SET qty=round(qty+?,3) WHERE item_id=? AND store=?', delta, itemId, st);
  else insert('store_stock', { item_id: itemId, store: st, qty: delta });
  if (qtyAt(itemId, st) < -0.0005) fail(409, 'not_enough_stock', { item_id: itemId, store: st, available: r2(qtyAt(itemId, st) - delta) });
}
function move(req, row) {
  const id = insert('store_moves', { move_no: nextNo('store_move'), created_by: req.user.id, created_at: nowIso(), ...row });
  return get('SELECT * FROM store_moves WHERE id=?', id);
}
function itemView(it) {
  const stock = all('SELECT store, qty FROM store_stock WHERE item_id=? AND abs(qty)>0.0005', it.id).map((s) => ({ ...s, store_name: STORES[s.store] || s.store }));
  const qty = stock.reduce((s, x) => s + x.qty, 0);
  return { ...it, category_name: CATEGORIES[it.category]?.[0] || it.category, stock, qty: r2(qty), value: r2(qty * it.avg_cost), low: it.reorder_level > 0 && qty <= it.reorder_level };
}

/* ---------------------------------------------------------------- masters */

/** The address printed in QR labels must be one a phone on the hospital network can open — never localhost. */
function lanHost() {
  const set = String(setting('lan_ip') || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (set) return set;
  return Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))?.address || '';
}
stores.get('/stores/meta', requireAuth, h(() => ({ stores: STORES, categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, [l]]) => [k, l])), units: UNITS, lan_host: lanHost() })));

stores.get('/stores/items', requireAuth, h((req) => {
  // every member of staff can look items up to request them; costs and values are for the store and admin
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = all(`SELECT * FROM store_items WHERE (name LIKE ? OR code LIKE ?) ${req.query.category ? 'AND category=?' : ''} ${req.query.all ? '' : 'AND active=1'} ORDER BY name LIMIT 500`,
    q, q, ...(req.query.category ? [req.query.category] : [])).map(itemView);
  const list = req.query.low ? rows.filter((r) => r.low) : rows;
  return canView(req.user) ? list : list.map(({ id, code, name, category, category_name, unit, qty }) => ({ id, code, name, category, category_name, unit, in_stock: qty > 0 }));
}));

/** The QR label opens /scan?c=<code>; this is what it shows. */
stores.get('/stores/items/by-code/:code', requireAuth, h((req) => {
  const it = get('SELECT * FROM store_items WHERE code=? COLLATE NOCASE', String(req.params.code).trim()) || fail(404, 'item_not_found');
  const v = itemView(it);
  const moves = canView(req.user) ? all(`SELECT m.*, u.name by_name FROM store_moves m LEFT JOIN users u ON u.id=m.created_by WHERE m.item_id=? ORDER BY m.id DESC LIMIT 15`, it.id) : [];
  const base = canView(req.user) ? v : { id: v.id, code: v.code, name: v.name, category_name: v.category_name, unit: v.unit, in_stock: v.qty > 0 };
  return { ...base, moves, can_write: canWrite(req.user), can_view: canView(req.user) };
}));

const ITEM_FIELDS = ['name', 'category', 'unit', 'reorder_level', 'spec', 'location_bin', 'active', 'notes'];
function cleanItem(b, partial) {
  const row = {};
  for (const k of ITEM_FIELDS) if (k in b) row[k] = typeof b[k] === 'string' ? b[k].trim() || null : b[k];
  if (!partial || 'name' in row) if (!row.name) fail(400, 'name_required');
  if ('category' in row && !CATEGORIES[row.category]) fail(400, 'category_invalid');
  if ('unit' in row && !row.unit) fail(400, 'unit_required');
  if ('reorder_level' in row) row.reorder_level = Math.max(0, num(row.reorder_level));
  if ('active' in row) row.active = row.active ? 1 : 0;
  return row;
}
stores.post('/stores/items', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const row = cleanItem(req.body || {}, false);
  if (get('SELECT 1 FROM store_items WHERE lower(name)=lower(?) AND active=1', row.name)) fail(409, 'item_exists');
  const code = `MNT-${String((one('SELECT coalesce(max(id),0) FROM store_items') || 0) + 1).padStart(5, '0')}`;
  const id = insert('store_items', { category: 'general', unit: 'nos', reorder_level: 0, active: 1, ...row, code, avg_cost: 0, created_by: req.user.id, created_at: nowIso() });
  emit(req, { topics: ['stores'], event: 'store.updated', data: { id }, action: 'store_item.create', entity: 'store_items', entityId: id, detail: { before: null, after: { code, ...row } } });
  return itemView(get('SELECT * FROM store_items WHERE id=?', id));
})));
stores.patch('/stores/items/:id', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const before = get('SELECT * FROM store_items WHERE id=?', +req.params.id) || fail(404, 'item_not_found');
  const row = cleanItem(req.body || {}, true);
  if (Object.keys(row).length) update('store_items', before.id, row);
  emit(req, { topics: ['stores'], event: 'store.updated', data: { id: before.id }, action: 'store_item.update', entity: 'store_items', entityId: before.id,
    detail: { before: Object.fromEntries(Object.keys(row).map((k) => [k, before[k]])), after: row, reason: req.body?.reason } });
  return itemView(get('SELECT * FROM store_items WHERE id=?', before.id));
})));

/* --------------------------------------------------------------- receipts */

/** Goods received from a supplier into a store. Updates the average cost; the supplier is owed the total. */
stores.post('/stores/receipts', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const b = req.body || {};
  const st = store(b.store || 'MAIN');
  const sup = get('SELECT * FROM suppliers WHERE id=? AND active=1', num(b.supplier_id)) || fail(400, 'supplier_required');
  const lines = (Array.isArray(b.items) ? b.items : []).map((l) => {
    const it = get('SELECT * FROM store_items WHERE id=? AND active=1', num(l.item_id)) || fail(400, 'item_not_found', { item_id: l.item_id });
    const qty = num(l.qty), rate = money(num(l.rate)), gst = num(l.gst_pct);
    if (!(qty > 0) || !(rate >= 0)) fail(400, 'qty_or_rate_invalid', { item: it.name });
    if (![0, 5, 12, 18, 28].includes(gst)) fail(400, 'gst_invalid');
    return { it, qty, rate, gst, value: money(qty * rate), tax: money((qty * rate * gst) / 100) };
  });
  if (!lines.length) fail(400, 'items_required');
  if (b.invoice_no && get('SELECT 1 FROM store_receipts WHERE supplier_id=? AND invoice_no=?', sup.id, String(b.invoice_no).trim())) fail(409, 'invoice_already_received');
  const value = money(lines.reduce((s, l) => s + l.value, 0)), tax = money(lines.reduce((s, l) => s + l.tax, 0)), total = money(value + tax);
  const rid = insert('store_receipts', { receipt_no: nextNo('store_receipt'), supplier_id: sup.id, store: st, invoice_no: b.invoice_no ? String(b.invoice_no).trim() : null,
    invoice_date: b.invoice_date || null, value, tax, total, notes: b.notes || null, received_by: req.user.id, received_at: nowIso() });
  const rec = get('SELECT * FROM store_receipts WHERE id=?', rid);
  for (const l of lines) {
    const onHand = one('SELECT coalesce(sum(qty),0) FROM store_stock WHERE item_id=?', l.it.id) || 0;
    const avg = Math.round(((Math.max(0, onHand) * l.it.avg_cost + l.value) / (Math.max(0, onHand) + l.qty)) * 10000) / 10000;
    update('store_items', l.it.id, { avg_cost: avg, last_rate: l.rate });
    addStock(l.it.id, st, l.qty);
    move(req, { item_id: l.it.id, store: st, qty: l.qty, rate: l.rate, value: l.value, move_type: 'receipt', receipt_id: rid, supplier_id: sup.id, reference: rec.receipt_no });
  }
  postVoucher({ type: 'PUR', source: 'store_receipt', sourceId: rid, narration: `Store receipt ${rec.receipt_no}${rec.invoice_no ? ` · invoice ${rec.invoice_no}` : ''} — ${sup.name}`,
    lines: [{ account: 'inventory_consumables', debit: value }, { account: 'gst_in_cgst', debit: money(tax / 2) }, { account: 'gst_in_sgst', debit: money(tax - money(tax / 2)) },
      { account: 'ap_suppliers', credit: total, party_type: 'supplier', party_id: sup.id }] });
  run('UPDATE suppliers SET outstanding = round(outstanding + ?, 2) WHERE id=?', total, sup.id);
  emit(req, { topics: ['stores', 'inventory', 'finance'], event: 'store.updated', data: { id: rid }, action: 'store.receipt', entity: 'store_receipts', entityId: rid,
    detail: { before: null, after: { receipt_no: rec.receipt_no, supplier: sup.name, store: st, total, lines: lines.map((l) => ({ item: l.it.name, qty: l.qty, rate: l.rate })) } } });
  return rec;
})));

/* --------------------------------------------------------------- requests */

stores.get('/stores/requests', requireAuth, h((req) => {
  const mine = !canView(req.user);
  const where = [], args = [];
  if (mine) { where.push('(r.requested_by=? OR r.department_id=?)'); args.push(req.user.id, req.user.department_id || -1); }
  if (req.query.status === 'open') where.push("r.status IN ('pending','partly_issued')");
  else if (req.query.status) { where.push('r.status=?'); args.push(req.query.status); }
  return all(`SELECT r.*, d.name department_name, u.name requested_by_name, x.name decided_by_name FROM store_requests r
      LEFT JOIN departments d ON d.id=r.department_id LEFT JOIN users u ON u.id=r.requested_by LEFT JOIN users x ON x.id=r.decided_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE WHEN r.status IN ('pending','partly_issued') THEN 0 ELSE 1 END, r.id DESC LIMIT 300`, ...args)
    .map((r) => ({ ...r, lines: all('SELECT l.*, i.code, i.name, i.unit FROM store_request_lines l JOIN store_items i ON i.id=l.item_id WHERE l.request_id=?', r.id) }));
}));

/** Any member of staff asks the store for materials for their department. */
stores.post('/stores/requests', requireAuth, h((req) => tx(() => {
  const b = req.body || {};
  const deptId = num(b.department_id, null) || req.user.department_id || fail(400, 'department_required');
  if (!get('SELECT 1 FROM departments WHERE id=?', deptId)) fail(400, 'department_required');
  const lines = (Array.isArray(b.items) ? b.items : []).map((l) => {
    const it = get('SELECT * FROM store_items WHERE id=? AND active=1', num(l.item_id)) || fail(400, 'item_not_found');
    if (!(num(l.qty) > 0)) fail(400, 'qty_invalid', { item: it.name });
    return { it, qty: num(l.qty) };
  });
  if (!lines.length) fail(400, 'items_required');
  const id = insert('store_requests', { request_no: nextNo('store_request'), department_id: deptId, requested_by: req.user.id, requested_at: nowIso(), status: 'pending',
    priority: b.priority === 'urgent' ? 'urgent' : 'normal', purpose: b.purpose || null, store: STORES[b.store] ? b.store : 'MAIN' });
  for (const l of lines) insert('store_request_lines', { request_id: id, item_id: l.it.id, qty: l.qty, issued_qty: 0 });
  const r = get('SELECT * FROM store_requests WHERE id=?', id);
  emit(req, { topics: ['stores'], event: 'store.request', data: { id }, action: 'store.request', entity: 'store_requests', entityId: id,
    detail: { before: null, after: { request_no: r.request_no, lines: lines.map((l) => ({ item: l.it.name, qty: l.qty })), priority: r.priority } } });
  return r;
})));

/** Issue to a department (against a request, or directly with a reason). Expense booked at average cost. */
stores.post('/stores/issues', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const b = req.body || {};
  const st = store(b.store || 'MAIN');
  const rq = b.request_id ? get('SELECT * FROM store_requests WHERE id=?', num(b.request_id)) || fail(404, 'request_not_found') : null;
  if (rq && !['pending', 'partly_issued'].includes(rq.status)) fail(409, 'request_closed', { status: rq.status });
  const deptId = rq?.department_id || num(b.department_id, null) || fail(400, 'department_required');
  if (!rq && !String(b.reason || '').trim()) fail(400, 'reason_required');
  const dept = get('SELECT * FROM departments WHERE id=?', deptId) || fail(400, 'department_required');
  const issued = [];
  let cost = 0;
  const byHead = {};
  for (const l of Array.isArray(b.items) ? b.items : []) {
    const qty = num(l.qty);
    if (!(qty > 0)) continue;
    const it = get('SELECT * FROM store_items WHERE id=?', num(l.item_id)) || fail(400, 'item_not_found');
    const line = rq ? get('SELECT * FROM store_request_lines WHERE request_id=? AND item_id=?', rq.id, it.id) || fail(400, 'item_not_in_request', { item: it.name }) : null;
    if (line && qty > line.qty - line.issued_qty + 0.0005) fail(400, 'more_than_requested', { item: it.name, pending: r2(line.qty - line.issued_qty) });
    addStock(it.id, st, -qty);
    const value = money(qty * it.avg_cost);
    move(req, { item_id: it.id, store: st, qty: -qty, rate: it.avg_cost, value: -value, move_type: 'issue', department_id: dept.id, request_id: rq?.id || null,
      reference: rq?.request_no || null, reason: b.reason || null, issued_to: b.issued_to || null });
    if (line) run('UPDATE store_request_lines SET issued_qty=round(issued_qty+?,3) WHERE id=?', qty, line.id);
    const head = CATEGORIES[it.category]?.[1] || 'exp_general';
    byHead[head] = money((byHead[head] || 0) + value); cost = money(cost + value);
    issued.push({ item: it.name, qty, value });
  }
  if (!issued.length) fail(400, 'items_required');
  let status = null;
  if (rq) {
    const left = one('SELECT count(*) FROM store_request_lines WHERE request_id=? AND issued_qty < qty - 0.0005', rq.id);
    status = left ? 'partly_issued' : 'issued';
    update('store_requests', rq.id, { status, decided_by: req.user.id, decided_at: nowIso() });
  }
  const ref = rq?.request_no || `direct issue to ${dept.name}`;
  if (cost > 0) postVoucher({ type: 'JV', source: 'store_issue', sourceId: one('SELECT max(id) FROM store_moves'), narration: `Store issue ${ref} — ${dept.name}`,
    lines: [...Object.entries(byHead).map(([account, debit]) => ({ account, debit, segment: null, memo: dept.code })), { account: 'inventory_consumables', credit: cost }] });
  emit(req, { topics: ['stores', 'finance'], event: 'store.updated', data: { id: rq?.id || null }, action: 'store.issue', entity: rq ? 'store_requests' : 'store_moves', entityId: rq?.id || one('SELECT max(id) FROM store_moves'),
    detail: { before: rq ? { status: rq.status } : null, after: { status, department: dept.name, store: st, items: issued, cost }, reason: b.reason || null } });
  return { status, department: dept.name, items: issued, cost };
})));

stores.post('/stores/requests/:id/reject', requireAuth, h((req) => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const rq = get('SELECT * FROM store_requests WHERE id=?', +req.params.id) || fail(404, 'request_not_found');
  if (rq.status !== 'pending') fail(409, 'request_closed', { status: rq.status });
  const reason = String(req.body?.reason || '').trim() || fail(400, 'reason_required');
  update('store_requests', rq.id, { status: 'rejected', decided_by: req.user.id, decided_at: nowIso(), decision_note: reason });
  emit(req, { topics: ['stores'], event: 'store.request', data: { id: rq.id }, action: 'store.request.reject', entity: 'store_requests', entityId: rq.id, detail: { before: { status: rq.status }, after: { status: 'rejected' }, reason } });
  return get('SELECT * FROM store_requests WHERE id=?', rq.id);
}));
stores.post('/stores/requests/:id/cancel', requireAuth, h((req) => {
  const rq = get('SELECT * FROM store_requests WHERE id=?', +req.params.id) || fail(404, 'request_not_found');
  if (rq.requested_by !== req.user.id && !canWrite(req.user)) fail(403, 'forbidden');
  if (rq.status !== 'pending') fail(409, 'request_closed', { status: rq.status });
  update('store_requests', rq.id, { status: 'cancelled', decided_by: req.user.id, decided_at: nowIso(), decision_note: req.body?.reason || null });
  emit(req, { topics: ['stores'], event: 'store.request', data: { id: rq.id }, action: 'store.request.cancel', entity: 'store_requests', entityId: rq.id, detail: { before: { status: rq.status }, after: { status: 'cancelled' }, reason: req.body?.reason } });
  return get('SELECT * FROM store_requests WHERE id=?', rq.id);
}));
/** The department confirms it got what the store issued (closes the loop for the audit). */
stores.post('/stores/requests/:id/received', requireAuth, h((req) => {
  const rq = get('SELECT * FROM store_requests WHERE id=?', +req.params.id) || fail(404, 'request_not_found');
  if (rq.requested_by !== req.user.id && rq.department_id !== req.user.department_id && !canWrite(req.user)) fail(403, 'forbidden');
  if (!['issued', 'partly_issued'].includes(rq.status)) fail(409, 'nothing_issued_yet');
  if (rq.received_at) fail(409, 'already_confirmed');
  update('store_requests', rq.id, { received_by: req.user.id, received_at: nowIso(), received_note: req.body?.note || null });
  emit(req, { topics: ['stores'], event: 'store.request', data: { id: rq.id }, action: 'store.request.received', entity: 'store_requests', entityId: rq.id, detail: { before: { received_at: null }, after: { received_at: nowIso() }, reason: req.body?.note } });
  return get('SELECT * FROM store_requests WHERE id=?', rq.id);
}));

/* ------------------------------------------------- returns, transfers, counts */

stores.post('/stores/returns', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const b = req.body || {};
  const st = store(b.store || 'MAIN');
  const it = get('SELECT * FROM store_items WHERE id=?', num(b.item_id)) || fail(400, 'item_not_found');
  const dept = get('SELECT * FROM departments WHERE id=?', num(b.department_id)) || fail(400, 'department_required');
  const qty = num(b.qty);
  if (!(qty > 0)) fail(400, 'qty_invalid');
  const out = -(one("SELECT coalesce(sum(qty),0) FROM store_moves WHERE item_id=? AND department_id=? AND move_type IN ('issue','return')", it.id, dept.id) || 0);
  if (qty > out + 0.0005) fail(400, 'more_than_issued', { issued_net: r2(out) });
  const reason = String(b.reason || '').trim() || fail(400, 'reason_required');
  // returned at the average cost it went out at (approximately: current average)
  const value = money(qty * it.avg_cost);
  addStock(it.id, st, qty);
  const m = move(req, { item_id: it.id, store: st, qty, rate: it.avg_cost, value, move_type: 'return', department_id: dept.id, reason });
  postVoucher({ type: 'JV', source: 'store_issue', sourceId: m.id, narration: `Store return ${m.move_no} — ${dept.name}`,
    lines: [{ account: 'inventory_consumables', debit: value }, { account: CATEGORIES[it.category]?.[1] || 'exp_general', credit: value, memo: dept.code }] });
  emit(req, { topics: ['stores', 'finance'], event: 'store.updated', data: { id: m.id }, action: 'store.return', entity: 'store_moves', entityId: m.id, detail: { before: { issued_net: r2(out) }, after: { issued_net: r2(out - qty) }, reason } });
  return m;
})));

stores.post('/stores/transfers', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const b = req.body || {};
  const from = store(b.from), to = store(b.to);
  if (from === to) fail(400, 'same_store');
  const it = get('SELECT * FROM store_items WHERE id=?', num(b.item_id)) || fail(400, 'item_not_found');
  const qty = num(b.qty);
  if (!(qty > 0)) fail(400, 'qty_invalid');
  addStock(it.id, from, -qty); addStock(it.id, to, qty);
  const ref = nextNo('store_transfer');
  move(req, { item_id: it.id, store: from, qty: -qty, rate: it.avg_cost, value: 0, move_type: 'transfer_out', reference: ref, reason: b.reason || null });
  const m = move(req, { item_id: it.id, store: to, qty, rate: it.avg_cost, value: 0, move_type: 'transfer_in', reference: ref, reason: b.reason || null });
  emit(req, { topics: ['stores'], event: 'store.updated', data: { id: m.id }, action: 'store.transfer', entity: 'store_moves', entityId: m.id,
    detail: { before: { [from]: r2(qtyAt(it.id, from) + qty), [to]: r2(qtyAt(it.id, to) - qty) }, after: { [from]: qtyAt(it.id, from), [to]: qtyAt(it.id, to) }, reason: b.reason } });
  return { reference: ref, item: it.name, qty, from, to };
})));

/** Physical count: the difference is written off (or found) at average cost. */
stores.post('/stores/counts', requireAuth, h((req) => tx(() => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  const b = req.body || {};
  const st = store(b.store || 'MAIN');
  const it = get('SELECT * FROM store_items WHERE id=?', num(b.item_id)) || fail(400, 'item_not_found');
  const counted = num(b.counted, NaN);
  if (!(counted >= 0)) fail(400, 'count_invalid');
  const reason = String(b.reason || '').trim() || fail(400, 'reason_required');
  const was = qtyAt(it.id, st), diff = r2(counted - was);
  if (Math.abs(diff) < 0.0005) return { diff: 0, qty: was };
  addStock(it.id, st, diff);
  const value = money(diff * it.avg_cost);
  const m = move(req, { item_id: it.id, store: st, qty: diff, rate: it.avg_cost, value, move_type: 'adjust', reason });
  if (Math.abs(value) >= 0.01) postVoucher({ type: 'JV', source: 'store_issue', sourceId: m.id, narration: `Store count ${m.move_no} — ${it.name} (${diff > 0 ? 'found' : 'short'})`,
    lines: [{ account: 'inventory_consumables', debit: value }, { account: 'stock_writeoff', credit: value }] });
  emit(req, { topics: ['stores', 'finance'], event: 'store.updated', data: { id: m.id }, action: 'store.count', entity: 'store_moves', entityId: m.id, detail: { before: { qty: was }, after: { qty: counted }, reason } });
  return { diff, qty: counted, value };
})));

stores.get('/stores/moves', requireAuth, h((req) => {
  if (!canView(req.user)) fail(403, 'forbidden', { need: 'stores.view' });
  const args = [], where = [];
  if (req.query.item_id) { where.push('m.item_id=?'); args.push(num(req.query.item_id)); }
  if (req.query.from) { where.push('date(m.created_at)>=?'); args.push(req.query.from); }
  if (req.query.to) { where.push('date(m.created_at)<=?'); args.push(req.query.to); }
  return all(`SELECT m.*, i.code, i.name, i.unit, d.name department_name, u.name by_name, s.name supplier_name FROM store_moves m JOIN store_items i ON i.id=m.item_id
      LEFT JOIN departments d ON d.id=m.department_id LEFT JOIN users u ON u.id=m.created_by LEFT JOIN suppliers s ON s.id=m.supplier_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 500`, ...args);
}));

/** Books check: stock value at average cost against the Consumables Inventory account. */
stores.get('/stores/valuation', requireAuth, h((req) => {
  if (!canView(req.user)) fail(403, 'forbidden', { need: 'stores.view' });
  const items = all('SELECT * FROM store_items').map(itemView);
  const stockValue = r2(items.reduce((s, i) => s + i.value, 0));
  const books = r2(one(`SELECT coalesce(sum(jl.debit-jl.credit),0) FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.system_key='inventory_consumables'`) || 0);
  return { stock_value: stockValue, books_value: books, difference: r2(books - stockValue), low_stock: items.filter((i) => i.low).length, items: items.length };
}));

/** Suppliers to receive from (the store may not have pharmacy purchase rights). */
stores.get('/stores/suppliers', requireAuth, h((req) => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'stores.write' });
  return all('SELECT id, name, gstin, outstanding FROM suppliers WHERE active=1 ORDER BY name');
}));
