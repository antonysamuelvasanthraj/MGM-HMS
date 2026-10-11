/**
 * Visiting (outside) doctors and their share of what their work earns.
 *
 *   visiting doctor (master: share % or fixed per case, per-procedure rates, TDS %)
 *     → attributed charges (OT surgeon / anaesthetist fee lines, or any bill line assigned at the desk)
 *     → share earned on money actually collected for that bill: patient receipts + payer money received,
 *       less refunds (a refund claws the share back); payer-billed but unpaid amounts earn nothing yet
 *     → statement: accrues the earned share not yet accrued (Dr Visiting doctor fees, Cr Visiting doctors payable)
 *     → payout: Dr payable, Cr cash / bank (net) and TDS payable; the payable ledger reconciles to the books.
 */
import { Router } from 'express';
import { requireAuth, can } from '../auth.js';
import { h, fail, all, get, one, insert, update, run, num, money, nowIso, today, tx, emit } from '../lib.js';
import { postVoucher, MONEY_MODES } from '../accounting.js';

export const visiting = Router();
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const canView = (u) => can(u, 'finance.view') || can(u, 'admin.view') || can(u, 'billing.view') || can(u, 'ot.schedule');
const canEdit = (u) => can(u, 'admin.view') || can(u, 'finance.write');
const canPay = (u) => can(u, 'finance.write') || can(u, 'admin.write');
const FIELDS = ['name', 'speciality', 'qualification', 'reg_no', 'mobile', 'email', 'pan', 'bank_details', 'share_type', 'share_value', 'tds_pct', 'active', 'notes'];

/** Share of one line under the doctor's rules (before collection). */
function lineShare(doc, line) {
  const rate = line.service_id ? get('SELECT * FROM visiting_doctor_rates WHERE doctor_id=? AND service_id=?', doc.id, line.service_id) : null;
  const type = rate?.share_type || doc.share_type, value = Number(rate?.share_value ?? doc.share_value) || 0;
  return { type, value, full: r2(type === 'fixed' ? value * Math.max(1, line.qty || 1) : (line.base * value) / 100) };
}

/** Collected part of a bill: receipts (refunds included) plus payer money received, as a fraction of the bill. */
function collectedFraction(bill) {
  // a refund's credit note lowers the total; add it back so the refund lowers the collected share instead
  const credited = -(one("SELECT coalesce(sum(amount),0) FROM bill_items WHERE bill_id=? AND category='refund'", bill.id) || 0);
  const billed = bill.total + credited;
  if (!(billed > 0)) return 0;
  const payer = one(`SELECT coalesce(sum(settled_amount),0) FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' AND mode NOT IN ('free','due')`, bill.id) || 0;
  return Math.max(0, Math.min(1, (bill.paid + payer) / billed));
}

/** Every attributed line with what it has earned so far. */
export function doctorLedger(docId) {
  const doc = get('SELECT * FROM visiting_doctors WHERE id=?', docId);
  if (!doc) return null;
  const lines = all(`SELECT i.id, i.bill_id, i.service_id, i.description, i.qty, i.amount, i.visiting_role, b.bill_no, b.bill_date, b.status bill_status, p.name patient, p.uhid,
      (SELECT coalesce(sum(-w.amount),0) FROM bill_items w WHERE w.waiver_of=i.id) waived
    FROM bill_items i JOIN bills b ON b.id=i.bill_id JOIN patients p ON p.id=b.patient_id
    WHERE i.visiting_doctor_id=? AND i.waiver_of IS NULL AND i.amount>0 ORDER BY b.bill_date DESC, i.id DESC`, doc.id).map((l) => {
    const bill = get('SELECT * FROM bills WHERE id=?', l.bill_id);
    const base = l.bill_status === 'cancelled' ? 0 : r2(l.amount - l.waived);
    const s = lineShare(doc, { ...l, base });
    const fraction = l.bill_status === 'cancelled' ? 0 : collectedFraction(bill);
    return { ...l, base, rule: s.type === 'fixed' ? `₹${s.value} per case` : `${s.value}%`, share_full: base > 0 ? s.full : 0, collected_pct: Math.round(fraction * 100), earned: base > 0 ? r2(s.full * fraction) : 0 };
  });
  const earned = r2(lines.reduce((s, l) => s + l.earned, 0));
  const accrued = r2(one('SELECT coalesce(sum(accrual),0) FROM visiting_statements WHERE doctor_id=?', doc.id) || 0);
  const paid = r2(one("SELECT coalesce(sum(gross),0) FROM visiting_payouts WHERE doctor_id=? AND status='paid'", doc.id) || 0);
  return { doctor: doc, lines, earned, accrued, not_yet_accrued: r2(earned - accrued), paid, payable: r2(accrued - paid),
    statements: all('SELECT s.*, u.name by_name FROM visiting_statements s LEFT JOIN users u ON u.id=s.created_by WHERE s.doctor_id=? ORDER BY s.id DESC', doc.id),
    payouts: all('SELECT p.*, u.name by_name FROM visiting_payouts p LEFT JOIN users u ON u.id=p.paid_by WHERE p.doctor_id=? ORDER BY p.id DESC', doc.id) };
}

function clean(b, partial) {
  const row = {};
  for (const k of FIELDS) if (k in b) row[k] = typeof b[k] === 'string' ? b[k].trim() || null : b[k];
  if (!partial || 'name' in row) if (!row.name) fail(400, 'name_required');
  if ('share_type' in row && !['percent', 'fixed'].includes(row.share_type)) fail(400, 'share_type_invalid');
  if ('share_value' in row) { row.share_value = Number(row.share_value); if (!(row.share_value >= 0) || (row.share_type === 'percent' && row.share_value > 100)) fail(400, 'share_value_invalid'); }
  if ('tds_pct' in row) { row.tds_pct = Number(row.tds_pct || 0); if (!(row.tds_pct >= 0 && row.tds_pct <= 30)) fail(400, 'tds_invalid'); }
  if ('active' in row) row.active = row.active ? 1 : 0;
  return row;
}
function saveRates(id, rates) {
  if (!Array.isArray(rates)) return;
  run('DELETE FROM visiting_doctor_rates WHERE doctor_id=?', id);
  for (const r of rates) {
    if (!get('SELECT 1 FROM services WHERE id=?', num(r.service_id))) fail(400, 'service_not_found');
    if (!['percent', 'fixed'].includes(r.share_type)) fail(400, 'share_type_invalid');
    insert('visiting_doctor_rates', { doctor_id: id, service_id: num(r.service_id), share_type: r.share_type, share_value: Number(r.share_value) || 0 });
  }
}

visiting.get('/visiting-doctors', requireAuth, h((req) => {
  if (!canView(req.user)) fail(403, 'forbidden');
  const rows = all(`SELECT * FROM visiting_doctors ${req.query.active ? 'WHERE active=1' : ''} ORDER BY active DESC, name`);
  // the OT desk and billing only need to pick a doctor; shares, PAN and bank details stay with finance / admin
  if (!can(req.user, 'finance.view') && !can(req.user, 'admin.view')) return rows.map(({ id, name, speciality, active }) => ({ id, name, speciality, active }));
  return rows.map((d) => { const l = can(req.user, 'finance.view') || can(req.user, 'admin.view') ? doctorLedger(d.id) : null;
    return Object.assign(d, l ? { earned: l.earned, accrued: l.accrued, paid: l.paid, payable: l.payable, not_yet_accrued: l.not_yet_accrued, cases: l.lines.length } : {},
      { rates: all('SELECT r.*, s.name service_name FROM visiting_doctor_rates r JOIN services s ON s.id=r.service_id WHERE r.doctor_id=?', d.id) }); });
}));

visiting.post('/visiting-doctors', requireAuth, h((req) => tx(() => {
  if (!canEdit(req.user)) fail(403, 'forbidden', { need: 'admin.view' });
  const row = clean(req.body || {}, false);
  const id = insert('visiting_doctors', { share_type: 'percent', share_value: 0, tds_pct: 10, active: 1, ...row, created_by: req.user.id, created_at: nowIso() });
  saveRates(id, req.body?.rates);
  emit(req, { topics: ['admin', 'finance'], event: 'master.created', data: { id }, action: 'visiting_doctor.create', entity: 'visiting_doctors', entityId: id, detail: { before: null, after: row } });
  return get('SELECT * FROM visiting_doctors WHERE id=?', id);
})));

visiting.patch('/visiting-doctors/:id', requireAuth, h((req) => tx(() => {
  if (!canEdit(req.user)) fail(403, 'forbidden', { need: 'admin.view' });
  const before = get('SELECT * FROM visiting_doctors WHERE id=?', +req.params.id) || fail(404, 'visiting_doctor_not_found');
  const row = clean(req.body || {}, true);
  if (Object.keys(row).length) update('visiting_doctors', before.id, row);
  saveRates(before.id, req.body?.rates);
  emit(req, { topics: ['admin', 'finance'], event: 'master.created', data: { id: before.id }, action: 'visiting_doctor.update', entity: 'visiting_doctors', entityId: before.id,
    detail: { before: Object.fromEntries(Object.keys(row).map((k) => [k, before[k]])), after: row, reason: req.body?.reason } });
  return get('SELECT * FROM visiting_doctors WHERE id=?', before.id);
})));

visiting.get('/visiting-doctors/:id/ledger', requireAuth, h((req) => {
  if (!can(req.user, 'finance.view') && !can(req.user, 'admin.view')) fail(403, 'forbidden', { need: 'finance.view' });
  const l = doctorLedger(+req.params.id) || fail(404, 'visiting_doctor_not_found');
  // the payable in the books must equal accrued − paid for all visiting doctors together
  const books = r2(one(`SELECT coalesce(sum(jl.credit-jl.debit),0) FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.system_key='visiting_payable'`) || 0);
  const owed = r2(one('SELECT coalesce(sum(accrual),0) FROM visiting_statements') || 0) - r2(one("SELECT coalesce(sum(gross),0) FROM visiting_payouts WHERE status='paid'") || 0);
  return Object.assign(l, { books_payable_all: books, ledger_payable_all: r2(owed), reconciled: Math.abs(books - owed) < 0.01 });
}));

/** Attribute (or clear) a bill line to a visiting doctor. */
visiting.patch('/bills/:id/items/:itemId/visiting', requireAuth, h((req) => {
  if (!can(req.user, 'billing.create') && !canEdit(req.user)) fail(403, 'forbidden', { need: 'billing.create' });
  const it = get('SELECT * FROM bill_items WHERE id=? AND bill_id=?', +req.params.itemId, +req.params.id) || fail(404, 'item_not_found');
  if (it.amount <= 0 || it.waiver_of) fail(409, 'line_not_attributable');
  const docId = req.body?.visiting_doctor_id ? num(req.body.visiting_doctor_id) : null;
  if (docId && !get('SELECT 1 FROM visiting_doctors WHERE id=? AND active=1', docId)) fail(400, 'visiting_doctor_not_found');
  update('bill_items', it.id, { visiting_doctor_id: docId, visiting_role: docId ? (req.body?.role || it.visiting_role || 'consultant') : null });
  emit(req, { topics: ['billing', 'finance'], event: 'bill.updated', data: { id: it.bill_id }, action: 'bill.item.visiting', entity: 'bill_items', entityId: it.id,
    detail: { before: { visiting_doctor_id: it.visiting_doctor_id }, after: { visiting_doctor_id: docId }, reason: req.body?.reason || 'Visiting doctor attribution' } });
  return get('SELECT * FROM bill_items WHERE id=?', it.id);
}));

/** Statement: accrue the share earned on collections that is not yet in the books (negative when refunds clawed it back). */
visiting.post('/visiting-doctors/:id/statements', requireAuth, h((req) => tx(() => {
  if (!canPay(req.user) && !can(req.user, 'finance.view')) fail(403, 'forbidden', { need: 'finance.write' });
  const l = doctorLedger(+req.params.id) || fail(404, 'visiting_doctor_not_found');
  const delta = l.not_yet_accrued;
  if (Math.abs(delta) < 0.01) fail(409, 'nothing_new_to_accrue');
  const sid = insert('visiting_statements', { statement_no: `VDS-${Date.now().toString(36).toUpperCase()}`, doctor_id: l.doctor.id, as_of: today(), earned_total: l.earned,
    accrual: delta, cases: l.lines.length, created_by: req.user.id, created_at: nowIso(), notes: req.body?.notes || null });
  postVoucher({ type: 'JV', source: 'visiting_statement', sourceId: sid, narration: `Visiting doctor share — ${l.doctor.name} (statement ${sid})`,
    lines: [{ account: 'exp_doctor_fees', debit: delta }, { account: 'visiting_payable', credit: delta, party_type: 'visiting_doctor', party_id: l.doctor.id }] });
  const row = get('SELECT * FROM visiting_statements WHERE id=?', sid);
  emit(req, { topics: ['finance', 'accounts'], event: 'journal.posted', data: { id: sid }, action: 'visiting.statement', entity: 'visiting_statements', entityId: sid,
    detail: { before: { accrued: l.accrued }, after: { accrued: r2(l.accrued + delta), earned: l.earned }, reason: delta < 0 ? 'Share clawed back after refunds' : 'Share earned on collections' } });
  return row;
})));

/** Payout: gross from the payable, TDS withheld, net paid by cash / bank / UPI / cheque. */
visiting.post('/visiting-doctors/:id/payouts', requireAuth, h((req) => tx(() => {
  if (!canPay(req.user)) fail(403, 'forbidden', { need: 'finance.write' });
  const l = doctorLedger(+req.params.id) || fail(404, 'visiting_doctor_not_found');
  const gross = money(num(req.body?.amount));
  if (!(gross > 0)) fail(400, 'amount_invalid');
  if (gross > l.payable + 0.005) fail(400, 'more_than_payable', { payable: l.payable });
  const mode = req.body?.mode === 'card' ? 'bank_transfer' : req.body?.mode;
  if (!['cash', 'bank_transfer', 'upi', 'cheque'].includes(mode) || !MONEY_MODES[mode]) fail(400, 'payment_mode_invalid');
  const tds = money((gross * (Number(l.doctor.tds_pct) || 0)) / 100);
  const net = money(gross - tds);
  const pid = insert('visiting_payouts', { payout_no: `VDP-${Date.now().toString(36).toUpperCase()}`, doctor_id: l.doctor.id, gross, tds, net, mode, reference: req.body?.reference || null,
    status: 'paid', paid_by: req.user.id, paid_at: nowIso(), notes: req.body?.notes || null });
  postVoucher({ type: 'PV', source: 'visiting_payout', sourceId: pid, narration: `Payout to ${l.doctor.name}${tds ? ` (TDS ${l.doctor.tds_pct}% withheld)` : ''}`,
    lines: [{ account: 'visiting_payable', debit: gross, party_type: 'visiting_doctor', party_id: l.doctor.id }, { account: MONEY_MODES[mode], credit: net },
      ...(tds > 0 ? [{ account: 'statutory_payable', credit: tds }] : [])] });
  const row = get('SELECT * FROM visiting_payouts WHERE id=?', pid);
  emit(req, { topics: ['finance', 'accounts'], event: 'journal.posted', data: { id: pid }, action: 'visiting.payout', entity: 'visiting_payouts', entityId: pid,
    detail: { before: { payable: l.payable }, after: { payable: r2(l.payable - gross), gross, tds, net, mode } } });
  return row;
})));

