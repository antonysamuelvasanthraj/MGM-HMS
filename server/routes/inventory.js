/**
 * Pharmacy movement: Central store → sub-stores (transfers), ward indents,
 * returns in both directions, and supplier payables.
 *
 * All goods arrive in Central through the GRN (routes/pharmacy.js). Nothing
 * here creates stock from nothing: every quantity leaves one batch and lands
 * in another, and each step is a stock_moves row with the user who did it.
 */
import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, tx, emit, nowIso, nextNo, num, money, today, recalcBill,
} from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { postPurchaseReturn, postSupplierPayment, postVoucher, reverseSource } from '../accounting.js';
import { refund } from '../payments.js';
import { dispense } from './pharmacy.js';

export const inventory = Router();
export const LOCATIONS = ['Central', 'OP', 'IP', 'ICU', 'ER', 'OT', 'Ward'];
const topics = ['inventory', 'pharmacy', 'dashboard'];

const qtyOk = (v) => Number.isFinite(v) && v > 0;

function moveStock({ batch, qty, type, refType, refId, userId, reason }) {
  const after = money(batch.qty + qty);
  if (after < -0.0001) fail(409, 'insufficient_stock', { batch: batch.batch_no, available: batch.qty });
  update('medicine_batches', batch.id, { qty: after });
  return insert('stock_moves', { medicine_id: batch.medicine_id, batch_id: batch.id, location: batch.location,
    move_type: type, qty, balance_after: after, ref_type: refType, ref_id: refId, reason, created_by: userId });
}

/** The same physical batch at another location — created empty on first use. */
function batchAt(src, location) {
  let dest = get('SELECT * FROM medicine_batches WHERE medicine_id=? AND batch_no=? AND expiry=? AND location=?',
    src.medicine_id, src.batch_no, src.expiry, location);
  if (!dest) {
    const { id, qty, received_at, ...fields } = src;
    dest = get('SELECT * FROM medicine_batches WHERE id=?', insert('medicine_batches', { ...fields, location, qty: 0 }));
  }
  return dest;
}

/* ----------------------------------------------------------- locations */

inventory.get('/locations', requirePerm('inventory.view'), h(() => ({
  locations: LOCATIONS,
  stock: LOCATIONS.map((location) => ({
    location,
    ...get(`SELECT count(*) batches, coalesce(sum(qty),0) units, round(coalesce(sum(qty*purchase_rate),0),2) value,
                   round(coalesce(sum(qty*mrp),0),2) mrp_value,
                   sum(CASE WHEN expiry <= date('now','localtime','+90 day') THEN 1 ELSE 0 END) expiring
              FROM medicine_batches WHERE location=? AND qty>0`, location),
  })),
})));

/* ------------------------------------------------------- product masters */

inventory.get('/product-masters', requireAuth, h((req) => all(
  `SELECT * FROM product_masters ${req.query.kind ? 'WHERE kind=?' : ''} ORDER BY kind, name`,
  ...(req.query.kind ? [req.query.kind] : []))));

inventory.post('/product-masters', requirePerm('inventory.write'), h((req) => {
  const kind = req.body.kind, name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  if (!['brand', 'manufacturer', 'generic'].includes(kind) || !name) fail(400, 'master_invalid');
  const existing = get('SELECT * FROM product_masters WHERE kind=? AND lower(name)=lower(?)', kind, name);
  if (existing) fail(409, 'master_exists', { existing });
  const id = insert('product_masters', { kind, name });
  emit(req, { topics, event: 'master.created', action: 'master.create', entity: 'product_masters', entityId: id,
    detail: { after: { kind, name } } });
  return { id, kind, name };
}));

/* -------------------------------------------------------------- transfers */

const TRANSFER_SELECT = `SELECT t.*, ru.name requested_by_name, au.name approved_by_name, iu.name issued_by_name,
       rcu.name received_by_name, rtu.name ratified_by_name,
       (SELECT count(*) FROM stock_transfer_lines l WHERE l.transfer_id=t.id) line_count,
       (SELECT coalesce(sum(qty_requested),0) FROM stock_transfer_lines l WHERE l.transfer_id=t.id) qty_requested,
       (SELECT coalesce(sum(qty_issued),0) FROM stock_transfer_lines l WHERE l.transfer_id=t.id) qty_issued,
       (SELECT coalesce(sum(qty_received),0) FROM stock_transfer_lines l WHERE l.transfer_id=t.id) qty_received
  FROM stock_transfers t
  LEFT JOIN users ru ON ru.id=t.requested_by LEFT JOIN users au ON au.id=t.approved_by
  LEFT JOIN users iu ON iu.id=t.issued_by LEFT JOIN users rcu ON rcu.id=t.received_by LEFT JOIN users rtu ON rtu.id=t.ratified_by`;

function transferView(id) {
  const t = get(`${TRANSFER_SELECT} WHERE t.id=?`, id);
  if (!t) fail(404, 'transfer_not_found');
  t.lines = all(`SELECT l.*, m.name medicine_name, m.code medicine_code, m.dispensing_unit,
      coalesce((SELECT sum(b.qty) FROM medicine_batches b WHERE b.medicine_id=l.medicine_id AND b.location=? AND b.qty>0
                AND b.expiry > date('now','localtime')),0) source_stock
    FROM stock_transfer_lines l JOIN medicines m ON m.id=l.medicine_id WHERE l.transfer_id=? ORDER BY l.id`, t.source, id);
  for (const l of t.lines) {
    l.issues = all(`SELECT i.*, b.batch_no, b.expiry FROM stock_transfer_issues i JOIN medicine_batches b ON b.id=i.source_batch_id
                     WHERE i.line_id=? ORDER BY i.id`, l.id);
  }
  t.history = all(`SELECT a.action, a.at created_at, a.reason, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
                    WHERE a.entity='stock_transfers' AND a.entity_id=? ORDER BY a.id`, String(id));
  return t;
}

inventory.get('/transfers', requirePerm('inventory.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.status && req.query.status !== 'all') { extra.push('t.status=?'); args.push(req.query.status); }
  if (req.query.location) { extra.push('(t.source=? OR t.destination=?)'); args.push(req.query.location, req.query.location); }
  return all(`${TRANSFER_SELECT} ${extra.length ? `WHERE ${extra.join(' AND ')}` : ''} ORDER BY t.id DESC LIMIT 300`, ...args);
}));

inventory.get('/transfers/:id', requirePerm('inventory.view'), h((req) => transferView(+req.params.id)));

inventory.post('/transfers', requirePerm('inventory.write'), h((req) => tx(() => {
  const b = req.body || {};
  const source = b.source || 'Central';
  if (!LOCATIONS.includes(source) || !LOCATIONS.includes(b.destination) || source === b.destination) fail(400, 'transfer_locations_invalid');
  const lines = (b.lines || []).map((l) => ({ medicine_id: num(l.medicine_id), qty: Number(l.qty) }));
  if (!lines.length) fail(400, 'lines_required');
  const seen = new Set();
  for (const l of lines) {
    if (!get('SELECT id FROM medicines WHERE id=?', l.medicine_id) || !qtyOk(l.qty)) fail(400, 'transfer_line_invalid');
    if (seen.has(l.medicine_id)) fail(400, 'duplicate_medicine_line');
    seen.add(l.medicine_id);
  }
  const id = insert('stock_transfers', { transfer_no: nextNo('transfer'), source, destination: b.destination,
    requested_by: req.user.id, reason: b.reason, notes: b.notes });
  for (const l of lines) insert('stock_transfer_lines', { transfer_id: id, medicine_id: l.medicine_id, qty_requested: l.qty });
  const view = transferView(id);
  emit(req, { topics, event: 'transfer.updated', data: view, action: 'transfer.request', entity: 'stock_transfers', entityId: id,
    detail: { after: { transfer_no: view.transfer_no, source, destination: b.destination, lines } } });
  return view;
})));

/**
 * One endpoint per transition so the UI can show exactly what is allowed:
 * approve → issue (FEFO from source) → receive (full or partial) → close.
 */
inventory.post('/transfers/:id/:action(approve|issue|receive|close|reject|cancel|emergency|ratify)', requireAuth, h((req) => tx(() => {
  const id = +req.params.id, body = req.body || {};
  let action = req.params.action;
  // the in-charge / owner / manager approve without needing stock-edit rights; moving stock still needs them
  if (!['approve', 'reject', 'ratify'].includes(action) && !can(req.user, 'inventory.write')) fail(403, 'forbidden', { need: 'inventory.write' });
  let t = get('SELECT * FROM stock_transfers WHERE id=?', id);
  if (!t) fail(404, 'transfer_not_found');
  // Approving belongs to the store in-charge. When nobody with that right is on duty, the move can be made
  // as an emergency (reason required) and the in-charge ratifies it afterwards.
  if (['approve', 'reject', 'ratify'].includes(action) && !can(req.user, 'inventory.approve')) fail(403, 'forbidden', { need: 'inventory.approve' });
  if (action === 'emergency') {
    if (t.status !== 'requested') fail(409, 'transfer_transition_invalid');
    if (!String(body.reason || '').trim()) fail(400, 'reason_required');
    run('UPDATE stock_transfer_lines SET qty_approved = qty_requested WHERE transfer_id=?', id);
    update('stock_transfers', id, { status: 'approved', emergency: 1, notes: `EMERGENCY: ${String(body.reason).trim()}` });
    t = get('SELECT * FROM stock_transfers WHERE id=?', id);
    action = 'issue';
  }
  if (action === 'ratify') {
    if (!t.emergency || t.ratified_by) fail(409, 'nothing_to_ratify');
    update('stock_transfers', id, { ratified_by: req.user.id, ratified_at: nowIso() });
    const view = transferView(id);
    emit(req, { topics, event: 'transfer.updated', data: view, action: 'transfer.ratify', entity: 'stock_transfers', entityId: id,
      detail: { before: { ratified: false }, after: { ratified: true }, reason: body.reason } });
    return view;
  }
  const lines = all('SELECT * FROM stock_transfer_lines WHERE transfer_id=?', id);
  const stamp = nowIso();
  const before = { status: t.status, lines: lines.map((l) => ({ id: l.id, requested: l.qty_requested, approved: l.qty_approved,
    issued: l.qty_issued, received: l.qty_received })) };
  const reason = String(body.reason || '').trim();

  if (action === 'approve') {
    if (t.status !== 'requested') fail(409, 'transfer_transition_invalid');
    // two people per transfer: whoever asked for the stock does not also approve it (the owner / manager / another in-charge does)
    if (t.requested_by === req.user.id && req.user.role !== 'admin') fail(403, 'cannot_approve_own_request');
    const given = new Map((body.lines || []).map((l) => [+l.id, Number(l.qty_approved)]));
    for (const l of lines) {
      const q = given.has(l.id) ? given.get(l.id) : l.qty_requested;
      if (!Number.isFinite(q) || q < 0 || q > l.qty_requested) fail(400, 'approved_qty_invalid');
      update('stock_transfer_lines', l.id, { qty_approved: q });
    }
    update('stock_transfers', id, { status: 'approved', approved_by: req.user.id, approved_at: stamp });
  } else if (action === 'issue') {
    if (t.status !== 'approved') fail(409, 'transfer_transition_invalid');
    let issuedAny = false;
    for (const l of lines) {
      let need = l.qty_approved ?? l.qty_requested;
      const batches = all(`SELECT * FROM medicine_batches WHERE medicine_id=? AND location=? AND qty>0
                             AND expiry > date('now','localtime') ORDER BY expiry, id`, l.medicine_id, t.source);
      for (const bt of batches) {
        if (need <= 0) break;
        const take = Math.min(need, bt.qty);
        moveStock({ batch: bt, qty: -take, type: 'transfer_out', refType: 'transfer', refId: id, userId: req.user.id });
        insert('stock_transfer_issues', { line_id: l.id, source_batch_id: bt.id, qty: take });
        need -= take;
      }
      const issued = (l.qty_approved ?? l.qty_requested) - need;
      if (need > 0 && !body.allow_short) {
        const med = get('SELECT name FROM medicines WHERE id=?', l.medicine_id);
        fail(409, 'insufficient_stock', { medicine: med?.name, short: need });
      }
      if (issued > 0) issuedAny = true;
      update('stock_transfer_lines', l.id, { qty_issued: issued });
    }
    if (!issuedAny) fail(409, 'nothing_to_issue');
    update('stock_transfers', id, { status: 'issued', issued_by: req.user.id, issued_at: stamp });
  } else if (action === 'receive') {
    if (!['issued', 'partially_received'].includes(t.status)) fail(409, 'transfer_transition_invalid');
    const issues = all(`SELECT i.* FROM stock_transfer_issues i JOIN stock_transfer_lines l ON l.id=i.line_id
                         WHERE l.transfer_id=? ORDER BY i.id`, id);
    const given = body.issues ? new Map(body.issues.map((x) => [+x.id, Number(x.qty)])) : null;
    let got = 0;
    for (const is of issues) {
      const open = is.qty - is.qty_received;
      const q = given ? (given.get(is.id) ?? 0) : open;
      if (!Number.isFinite(q) || q < 0 || q > open + 0.0001) fail(400, 'receipt_quantity_invalid');
      if (!q) continue;
      const src = get('SELECT * FROM medicine_batches WHERE id=?', is.source_batch_id);
      const dest = batchAt(src, t.destination);
      moveStock({ batch: dest, qty: q, type: 'transfer_in', refType: 'transfer', refId: id, userId: req.user.id });
      update('stock_transfer_issues', is.id, { qty_received: is.qty_received + q, dest_batch_id: dest.id });
      run('UPDATE stock_transfer_lines SET qty_received = qty_received + ? WHERE id=?', q, is.line_id);
      got += q;
    }
    if (!got) fail(400, 'nothing_received');
    const open = one(`SELECT coalesce(sum(i.qty - i.qty_received),0) FROM stock_transfer_issues i
                        JOIN stock_transfer_lines l ON l.id=i.line_id WHERE l.transfer_id=?`, id);
    update('stock_transfers', id, { status: open > 0.0001 ? 'partially_received' : 'received',
      received_by: req.user.id, received_at: stamp });
  } else if (action === 'close') {
    // Short receipt: what never arrived goes back to the source batch, with a reason.
    if (t.status !== 'partially_received') fail(409, 'transfer_transition_invalid');
    if (!reason) fail(400, 'reason_required');
    const issues = all(`SELECT i.* FROM stock_transfer_issues i JOIN stock_transfer_lines l ON l.id=i.line_id
                         WHERE l.transfer_id=? AND i.qty > i.qty_received`, id);
    for (const is of issues) {
      const src = get('SELECT * FROM medicine_batches WHERE id=?', is.source_batch_id);
      moveStock({ batch: src, qty: is.qty - is.qty_received, type: 'transfer_return', refType: 'transfer', refId: id,
        userId: req.user.id, reason });
    }
    update('stock_transfers', id, { status: 'received', closed_by: req.user.id, closed_at: stamp, notes: reason });
  } else {
    if (!['requested', 'approved'].includes(t.status)) fail(409, 'transfer_transition_invalid');
    if (!reason) fail(400, 'reason_required');
    update('stock_transfers', id, { status: action === 'reject' ? 'rejected' : 'cancelled', reason,
      closed_by: req.user.id, closed_at: stamp });
  }
  const view = transferView(id);
  emit(req, { topics, event: 'transfer.updated', data: view, action: `transfer.${req.params.action === 'emergency' ? 'emergency_issue' : action}`, entity: 'stock_transfers', entityId: id,
    detail: { before, after: { status: view.status, lines: view.lines.map((l) => ({ id: l.id, approved: l.qty_approved,
      issued: l.qty_issued, received: l.qty_received })) }, reason } });
  return view;
})));

/** Full movement history for any batch / medicine / location. */
inventory.get('/movements', requirePerm('inventory.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.medicine_id) { extra.push('sm.medicine_id=?'); args.push(+req.query.medicine_id); }
  if (req.query.batch_id) { extra.push('sm.batch_id=?'); args.push(+req.query.batch_id); }
  if (req.query.location) { extra.push('sm.location=?'); args.push(req.query.location); }
  if (req.query.type) { extra.push('sm.move_type=?'); args.push(req.query.type); }
  if (req.query.from) { extra.push('date(sm.created_at) >= ?'); args.push(req.query.from); }
  if (req.query.to) { extra.push('date(sm.created_at) <= ?'); args.push(req.query.to); }
  return all(`SELECT sm.*, m.name medicine_name, b.batch_no, b.expiry, u.name by_name
      FROM stock_moves sm JOIN medicines m ON m.id=sm.medicine_id LEFT JOIN medicine_batches b ON b.id=sm.batch_id
      LEFT JOIN users u ON u.id=sm.created_by ${extra.length ? `WHERE ${extra.join(' AND ')}` : ''}
     ORDER BY sm.id DESC LIMIT 500`, ...args);
}));

/* ------------------------------------------------------------ ward indents */

const mayIndent = (u) => can(u, 'ipd.indent') || can(u, 'nursing.write') || can(u, 'pharmacy.dispense') || can(u, 'emergency.treat');   // matches the Ward Stock & Indents menu (ER doctors request rack replacements)

inventory.get('/indents', requireAuth, h((req) => {
  if (!mayIndent(req.user) && !can(req.user, 'inventory.view')) fail(403, 'forbidden');
  const rows = all(`SELECT i.*, p.name patient_name, p.uhid, a.ip_no admission_no, bd.bed_no bed_code, u.name requested_by_name
      FROM ward_indents i JOIN patients p ON p.id=i.patient_id JOIN admissions a ON a.id=i.admission_id
      LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN users u ON u.id=i.requested_by
     ${req.query.status && req.query.status !== 'all' ? 'WHERE i.status=?' : ''} ORDER BY i.id DESC LIMIT 200`,
    ...(req.query.status && req.query.status !== 'all' ? [req.query.status] : []));
  for (const r of rows) r.lines = all(`SELECT l.*, m.name medicine_name, m.dispensing_unit,
      coalesce((SELECT sum(qty) FROM medicine_batches b WHERE b.medicine_id=l.medicine_id AND b.location=? AND b.qty>0),0) stock
    FROM ward_indent_lines l JOIN medicines m ON m.id=l.medicine_id WHERE l.indent_id=?`, r.location, r.id);
  return rows;
}));

inventory.post('/indents', requireAuth, h((req) => tx(() => {
  if (!mayIndent(req.user)) fail(403, 'forbidden', { need: 'ipd.indent' });
  const b = req.body || {};
  const adm = get("SELECT * FROM admissions WHERE id=? AND status<>'discharged'", num(b.admission_id));
  if (!adm) fail(409, 'admission_not_active');
  const lines = (b.lines || []).filter((l) => qtyOk(Number(l.qty)));
  if (!lines.length) fail(400, 'lines_required');
  const location = LOCATIONS.includes(b.location) && b.location !== 'Central' ? b.location : 'IP';
  const id = insert('ward_indents', { indent_no: nextNo('indent'), admission_id: adm.id, patient_id: adm.patient_id,
    location, kind: b.kind === 'consumable' ? 'consumable' : 'medicine', requested_by: req.user.id, notes: b.notes });
  for (const l of lines) {
    if (!get('SELECT id FROM medicines WHERE id=?', num(l.medicine_id))) fail(400, 'unknown_medicine');
    insert('ward_indent_lines', { indent_id: id, medicine_id: num(l.medicine_id), qty: Number(l.qty), instructions: l.instructions });
  }
  const row = get('SELECT * FROM ward_indents WHERE id=?', id);
  emit(req, { topics: [...topics, 'ipd'], event: 'indent.created', data: row, action: 'indent.create', entity: 'ward_indents',
    entityId: id, detail: { after: { indent_no: row.indent_no, admission: adm.ip_no, lines } } });
  return row;
})));

/** Dispense an indent onto the patient's running IP bill. */
inventory.post('/indents/:id/dispense', requirePerm('pharmacy.dispense'), h((req) => tx(() => {
  const ind = get('SELECT * FROM ward_indents WHERE id=?', +req.params.id);
  if (!ind || !['requested', 'partially_dispensed'].includes(ind.status)) fail(409, 'indent_not_open');
  const lines = all('SELECT * FROM ward_indent_lines WHERE indent_id=?', ind.id);
  const want = new Map((req.body?.lines || []).map((l) => [+l.id, Number(l.qty)]));
  const items = [];
  for (const l of lines) {
    const open = l.qty - l.dispensed_qty;
    const q = want.size ? (want.get(l.id) || 0) : open;
    if (!Number.isFinite(q) || q < 0 || q > open + 0.0001) fail(400, 'dispense_qty_invalid');
    if (q > 0) items.push({ medicine_id: l.medicine_id, qty: q, _line: l });
  }
  if (!items.length) fail(400, 'nothing_to_dispense');
  const r = dispense(req, { patient_id: ind.patient_id, admission_id: ind.admission_id, location: ind.location,
    items: items.map(({ _line, ...it }) => it), notes: `Indent ${ind.indent_no}` });
  for (const it of items) run('UPDATE ward_indent_lines SET dispensed_qty = dispensed_qty + ? WHERE id=?', it.qty, it._line.id);
  const open = one('SELECT coalesce(sum(qty - dispensed_qty),0) FROM ward_indent_lines WHERE indent_id=?', ind.id);
  update('ward_indents', ind.id, { status: open > 0.0001 ? 'partially_dispensed' : 'dispensed',
    dispensed_by: req.user.id, dispensed_at: nowIso() });
  emit(req, { topics: [...topics, 'ipd', 'billing'], event: 'indent.dispensed', data: { indent_id: ind.id, bill: r.bill },
    action: 'indent.dispense', entity: 'ward_indents', entityId: ind.id,
    detail: { after: { bill_no: r.bill.bill_no, lines: items.map((i) => ({ medicine_id: i.medicine_id, qty: i.qty })) } } });
  return { indent: get('SELECT * FROM ward_indents WHERE id=?', ind.id), bill: r.bill };
})));

inventory.post('/indents/:id/cancel', requireAuth, h((req) => {
  if (!mayIndent(req.user)) fail(403, 'forbidden');
  const ind = get('SELECT * FROM ward_indents WHERE id=?', +req.params.id);
  if (!ind || ind.status !== 'requested') fail(409, 'indent_not_cancellable');
  if (!String(req.body?.reason || '').trim()) fail(400, 'reason_required');
  update('ward_indents', ind.id, { status: 'cancelled', notes: `${ind.notes || ''} · cancelled: ${req.body.reason}` });
  emit(req, { topics: [...topics, 'ipd'], event: 'indent.updated', data: { id: ind.id }, action: 'indent.cancel',
    entity: 'ward_indents', entityId: ind.id, detail: { before: { status: ind.status }, after: { status: 'cancelled' }, reason: req.body.reason } });
  return { ok: true };
}));

/* ---------------------------------------------------------- sales returns */

inventory.get('/sales-returns', requirePerm('pharmacy.view'), h(() => all(
  `SELECT r.*, b.bill_no, p.name patient_name, bi.description, u.name created_by_name FROM sales_returns r
     JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id JOIN bill_items bi ON bi.id=r.bill_item_id
     LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 200`)));

/**
 * Patient returns medicine: stock goes back to its batch, a credit note comes
 * off the bill (revenue and output GST reverse), cost of sale reverses, and
 * money is refunded only if the patient had paid more than the new total.
 */
inventory.post('/sales-returns', requirePerm('pharmacy.dispense'), h((req) => tx(() => {
  const b = req.body || {};
  const item = get('SELECT * FROM bill_items WHERE id=?', num(b.bill_item_id));
  if(item&&get('SELECT id FROM ward_replacement_supply WHERE bill_item_id=?',item.id))fail(409,'replacement_requires_ward_review');
  if (!item || !item.batch_id || !['pharmacy', 'consumable'].includes(item.category)) fail(404, 'returnable_line_not_found');
  const bill = get('SELECT * FROM bills WHERE id=?', item.bill_id);
  if (bill.status === 'cancelled') fail(409, 'bill_cancelled');
  const qty = Number(b.qty), reason = String(b.reason || '').trim();
  if (!qtyOk(qty) || qty > item.qty - item.returned_qty + 0.0001) fail(400, 'return_qty_invalid', { returnable: item.qty - item.returned_qty });
  if (!reason) fail(400, 'reason_required');
  const batch = get('SELECT * FROM medicine_batches WHERE id=?', item.batch_id);
  const amount = money(qty * item.rate);
  const rid = insert('sales_returns', { return_no: nextNo('sales_return'), bill_id: bill.id, bill_item_id: item.id,
    batch_id: batch.id, qty, amount, refund_mode: b.refund_mode || null, reason, created_by: req.user.id });
  moveStock({ batch, qty, type: 'return', refType: 'sales_return', refId: rid, userId: req.user.id, reason });
  run('UPDATE bill_items SET returned_qty = returned_qty + ? WHERE id=?', qty, item.id);
  insert('bill_items', { bill_id: bill.id, batch_id: batch.id, description: `Return — ${item.description}`, category: 'refund',
    revenue_head: 'PHARMACY', qty: -qty, rate: item.rate, gst_pct: item.gst_pct, tax_inclusive: item.tax_inclusive,
    amount: -amount, created_by: req.user.id, created_at: nowIso() });
  const cost = money(qty * (item.unit_cost || batch.purchase_rate));
  if (cost > 0) postVoucher({ type: 'COGS', source: 'sales_return', sourceId: rid, narration: `Stock back from return on ${bill.bill_no}`,
    lines: [{ account: 'inventory_pharmacy', debit: cost, segment: 'PHARMACY' },
            { account: 'cogs_pharmacy', credit: cost, segment: 'PHARMACY' }] });
  let after = recalcBill(bill.id);
  let refunded = null;
  if (after.balance < -0.005) {
    // Overpaid now. Refund the excess (a pure money-out; the credit note is already on the bill).
    refunded = refund(req, { bill_id: bill.id, amount: -after.balance, mode: b.refund_mode || 'cash',
      reason: `Return ${reason}`, noCreditNote: true });
    after = refunded.bill;
  }
  const row = get('SELECT * FROM sales_returns WHERE id=?', rid);
  emit(req, { topics: [...topics, 'billing', 'accounts'], event: 'sales_return.created', data: row, action: 'sales_return.create',
    entity: 'sales_returns', entityId: rid, detail: { before: { bill_total: bill.total, paid: bill.paid },
      after: { bill_total: after.total, refund: refunded?.refund?.amount || 0 }, reason } });
  return { return: row, bill: after, refund: refunded?.refund || null };
})));

/* ------------------------------------------------------- purchase returns */

inventory.get('/purchase-returns', requirePerm('purchase.view'), h(() => all(
  `SELECT r.*, s.name supplier_name, m.name medicine_name, b.batch_no, u.name created_by_name FROM purchase_returns r
     JOIN suppliers s ON s.id=r.supplier_id JOIN medicine_batches b ON b.id=r.batch_id JOIN medicines m ON m.id=b.medicine_id
     LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 200`)));

inventory.post('/purchase-returns', requirePerm('purchase.write'), h((req) => tx(() => {
  const b = req.body || {};
  const batch = get('SELECT * FROM medicine_batches WHERE id=?', num(b.batch_id));
  if (!batch) fail(404, 'batch_not_found');
  if (batch.location !== 'Central') fail(409, 'return_from_central_only');
  const qty = Number(b.qty), reason = String(b.reason || '').trim();
  if (!qtyOk(qty) || qty > batch.qty) fail(400, 'return_qty_invalid', { available: batch.qty });
  if (!reason) fail(400, 'reason_required');
  const pi = batch.purchase_id ? get('SELECT * FROM purchase_items WHERE batch_id=? ORDER BY id DESC LIMIT 1', batch.id) : null;
  const supplierId = num(b.supplier_id, batch.supplier_id);
  if (!supplierId) fail(400, 'supplier_required');
  const value = money(qty * batch.purchase_rate);
  const cg = money(value * (pi?.cgst_pct || 0) / 100), sg = money(value * (pi?.sgst_pct || 0) / 100),
    ig = money(value * (pi?.igst_pct || 0) / 100);
  const rid = insert('purchase_returns', { return_no: nextNo('purchase_return'), supplier_id: supplierId, purchase_id: batch.purchase_id,
    batch_id: batch.id, qty, value, cgst: cg, sgst: sg, igst: ig, reason, created_by: req.user.id });
  moveStock({ batch, qty: -qty, type: 'purchase_return', refType: 'purchase_return', refId: rid, userId: req.user.id, reason });
  const row = get('SELECT * FROM purchase_returns WHERE id=?', rid);
  postPurchaseReturn(row, supplierId);
  run('UPDATE suppliers SET outstanding = outstanding - ? WHERE id=?', money(value + cg + sg + ig), supplierId);
  emit(req, { topics: [...topics, 'accounts'], event: 'purchase_return.created', data: row, action: 'purchase_return.create',
    entity: 'purchase_returns', entityId: rid, detail: { after: row, reason } });
  return row;
})));

/* ------------------------------------------------------ supplier payables */

inventory.get('/payables', requireAuth, h((req) => {
  if (!can(req.user, 'finance.payables') && !can(req.user, 'purchase.view')) fail(403, 'forbidden');
  const asOf = req.query.as_of || today();
  const suppliers = all(`SELECT s.id, s.name, s.gstin, s.credit_days, s.outstanding FROM suppliers s WHERE s.active=1 ORDER BY s.outstanding DESC`);
  for (const s of suppliers) {
    const grns = all(`SELECT p.id, p.grn_no, p.invoice_no, p.invoice_date, date(p.received_at) received_on, p.total, p.paid,
        round(p.total - p.paid, 2) open, coalesce(p.due_date, date(p.received_at, '+' || ? || ' day')) due_date
        FROM purchases p WHERE p.supplier_id=? AND p.total - p.paid > 0.005 ORDER BY p.id`, s.credit_days, s.id);
    const b = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    for (const g of grns) {
      const age = Math.floor((new Date(asOf) - new Date(g.received_on)) / 86400000);
      g.age = age;
      b[age <= 30 ? (g.due_date >= asOf ? 'current' : 'd30') : age <= 60 ? 'd60' : age <= 90 ? 'd90' : 'over90'] += g.open;
    }
    Object.assign(s, Object.fromEntries(Object.entries(b).map(([k, v]) => [k, money(v)])), { grns });
  }
  return { as_of: asOf, suppliers: suppliers.filter((s) => s.outstanding > 0.005 || s.grns.length),
    total: money(suppliers.reduce((t, s) => t + s.outstanding, 0)) };
}));

inventory.get('/supplier-payments', requireAuth, h((req) => {
  if (!can(req.user, 'finance.payables') && !can(req.user, 'purchase.view')) fail(403, 'forbidden');
  return all(`SELECT sp.*, s.name supplier_name, p.grn_no, u.name created_by_name FROM supplier_payments sp
      JOIN suppliers s ON s.id=sp.supplier_id LEFT JOIN purchases p ON p.id=sp.purchase_id LEFT JOIN users u ON u.id=sp.created_by
     ORDER BY sp.id DESC LIMIT 300`);
}));

/** Paying a supplier is a finance act, not a pharmacy one. */
inventory.post('/supplier-payments', requirePerm('finance.payables'), h((req) => tx(() => {
  const b = req.body || {};
  const s = get('SELECT * FROM suppliers WHERE id=?', num(b.supplier_id));
  if (!s) fail(404, 'supplier_not_found');
  const amount = money(Number(b.amount));
  if (!(amount > 0) || amount > s.outstanding + 0.005) fail(400, 'amount_invalid', { outstanding: s.outstanding });
  if (!['cash', 'bank_transfer', 'cheque', 'upi'].includes(b.mode)) fail(400, 'payment_mode_invalid');
  if (b.mode !== 'cash' && !String(b.reference || '').trim()) fail(400, 'reference_required');
  const id = insert('supplier_payments', { payment_no: nextNo('supplier_payment'), supplier_id: s.id,
    purchase_id: b.purchase_id ? num(b.purchase_id) : null, amount, mode: b.mode, reference: b.reference,
    paid_on: b.paid_on || today(), notes: b.notes, created_by: req.user.id });
  // Allocate to the named GRN, else oldest first.
  let left = amount;
  const grns = b.purchase_id ? all('SELECT * FROM purchases WHERE id=? AND supplier_id=?', num(b.purchase_id), s.id)
    : all('SELECT * FROM purchases WHERE supplier_id=? AND total - paid > 0.005 ORDER BY id', s.id);
  for (const g of grns) {
    if (left <= 0) break;
    const take = Math.min(left, money(g.total - g.paid));
    if (take <= 0) continue;
    update('purchases', g.id, { paid: money(g.paid + take), status: g.paid + take >= g.total - 0.005 ? 'paid' : g.status });
    left = money(left - take);
  }
  run('UPDATE suppliers SET outstanding = round(outstanding - ?, 2) WHERE id=?', amount, s.id);
  const row = get('SELECT * FROM supplier_payments WHERE id=?', id);
  postSupplierPayment(row);
  emit(req, { topics: ['accounts', 'pharmacy', 'dashboard'], event: 'supplier.paid', data: row, action: 'supplier.payment',
    entity: 'supplier_payments', entityId: id, detail: { before: { outstanding: s.outstanding },
      after: { outstanding: money(s.outstanding - amount) }, mode: b.mode, reference: b.reference } });
  return row;
})));

inventory.post('/supplier-payments/:id/cancel', requirePerm('finance.payables'), h((req) => tx(() => {
  const sp = get('SELECT * FROM supplier_payments WHERE id=?', +req.params.id);
  if (!sp) fail(404, 'payment_not_found');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  if (get("SELECT 1 FROM journal_vouchers WHERE source='supplier_payment' AND source_id=? AND status='reversed'", sp.id)) fail(409, 'already_cancelled');
  reverseSource('supplier_payment', sp.id, reason);
  let left = sp.amount;
  for (const g of all('SELECT * FROM purchases WHERE supplier_id=? AND paid > 0 ORDER BY id DESC', sp.supplier_id)) {
    if (left <= 0) break;
    const take = Math.min(left, g.paid);
    update('purchases', g.id, { paid: money(g.paid - take), status: 'received' });
    left = money(left - take);
  }
  run('UPDATE suppliers SET outstanding = round(outstanding + ?, 2) WHERE id=?', sp.amount, sp.supplier_id);
  emit(req, { topics: ['accounts', 'pharmacy'], event: 'supplier.paid', data: { id: sp.id }, action: 'supplier.payment.cancel',
    entity: 'supplier_payments', entityId: sp.id, detail: { before: sp, reason } });
  return { ok: true };
})));
