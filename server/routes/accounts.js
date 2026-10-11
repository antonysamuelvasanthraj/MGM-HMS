/**
 * Accounts: chart, journals, books, statements, receivables, day closing and
 * the report centre. Everything here reads the double-entry journal; the only
 * writes are manual journals, contra entries (cash → bank, clearing → bank),
 * payer receipts and day closing — each through the posting engine.
 */
import { Router } from 'express';
import { h, fail, all, get, one, insert, update, tx, emit, nowIso, today, money, num } from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import {
  acct, postVoucher, reverseVoucher, voucherDetail, trialBalance, profitAndLoss, balanceSheet, cashFlow,
  accountLedger, lastClosedDate, MONEY_MODES, booksIntegrity, correctOrphanVoucher,
} from '../accounting.js';
import { receiveSettlement, cancelSettlement, PAYERS, MODE_LABEL } from '../payments.js';
import { catalog, runReport, receivableBalances, modeReconciliation, presetRange } from '../reports.js';
import * as M from '../metrics.js';
import {collectionPolicy} from '../collection-policy.js';

export const accounts = Router();
const TOPICS = ['accounts', 'finance', 'dashboard'];
const period = (req) => presetRange(req.query.preset, req.query.from, req.query.to);

/* ------------------------------------------------------ chart of accounts */

accounts.get('/accounts/chart', requirePerm('finance.view'), h((req) => {
  const { from, to } = period(req);
  const tb = new Map(trialBalance(from, to).map((r) => [r.id, r]));
  return all('SELECT * FROM accounts ORDER BY code').map((a) => {
    const t = tb.get(a.id);
    return { ...a, opening: t?.opening || 0, debit: t?.debit || 0, credit: t?.credit || 0, closing: t?.closing || 0 };
  });
}));

accounts.post('/accounts/chart', requirePerm('finance.write'), h((req) => {
  const b = req.body || {};
  const parent = get('SELECT * FROM accounts WHERE code=? AND is_group=1', String(b.parent_code || ''));
  if (!parent) fail(400, 'parent_group_required');
  const name = String(b.name || '').trim();
  if (!name) fail(400, 'name_required');
  if (get('SELECT id FROM accounts WHERE lower(name)=lower(?)', name)) fail(409, 'account_name_exists');
  const code = String(b.code || '').trim();
  if (!/^\d{3,6}$/.test(code)) fail(400, 'code_invalid');
  if (get('SELECT id FROM accounts WHERE code=?', code)) fail(409, 'account_code_exists');
  const subtype = b.subtype || (parent.type === 'expense' ? 'expense' : parent.type === 'income' ? 'revenue' : null);
  const id = insert('accounts', { code, name, type: parent.type, subtype, parent_code: parent.code, is_group: 0 });
  const row = get('SELECT * FROM accounts WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'account.created', data: row, action: 'account.create', entity: 'accounts', entityId: id,
    detail: { after: row } });
  return row;
}));

accounts.patch('/accounts/chart/:id', requirePerm('finance.write'), h((req) => {
  const before = get('SELECT * FROM accounts WHERE id=?', +req.params.id);
  if (!before) fail(404, 'account_not_found');
  const patch = {};
  if ('name' in req.body) {
    const name = String(req.body.name || '').trim();
    if (!name) fail(400, 'name_required');
    if (get('SELECT id FROM accounts WHERE lower(name)=lower(?) AND id<>?', name, before.id)) fail(409, 'account_name_exists');
    patch.name = name;
  }
  if ('active' in req.body) {
    if (before.system_key && !req.body.active) fail(409, 'system_account_cannot_be_disabled');
    patch.active = req.body.active ? 1 : 0;
  }
  update('accounts', before.id, patch);
  const row = get('SELECT * FROM accounts WHERE id=?', before.id);
  emit(req, { topics: TOPICS, event: 'account.updated', data: row, action: 'account.update', entity: 'accounts', entityId: row.id,
    detail: { before: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), after: patch } });
  return row;
}));

/* --------------------------------------------------------------- journals */

accounts.get('/accounts/journals', requirePerm('finance.view'), h((req) => {
  const { from, to } = period(req);
  const w = ['v.voucher_date BETWEEN ? AND ?'], a = [from, to];
  if (req.query.type && req.query.type !== 'all') { w.push('v.voucher_type=?'); a.push(req.query.type); }
  if (req.query.source && req.query.source !== 'all') { w.push('v.source=?'); a.push(req.query.source); }
  if (req.query.q) { w.push('(v.voucher_no LIKE ? OR v.narration LIKE ?)'); a.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const rows = all(`SELECT v.*, u.name created_by_name FROM journal_vouchers v LEFT JOIN users u ON u.id=v.created_by
                     WHERE ${w.join(' AND ')} ORDER BY v.voucher_date DESC, v.id DESC LIMIT 500`, ...a);
  return { from, to, rows, types: all('SELECT voucher_type, count(*) n FROM journal_vouchers GROUP BY voucher_type') };
}));

accounts.get('/accounts/journals/:id', requirePerm('finance.view'), h((req) => voucherDetail(+req.params.id) || fail(404, 'voucher_not_found')));

/**
 * Manual journal. Only for what no business screen covers (opening balances,
 * depreciation, accruals, corrections). Sales, receipts, purchases and
 * expenses post themselves, so they are refused here to prevent double posting.
 */
const BUSINESS_ONLY = ['ar_patient', 'ar_insurance', 'ar_aarogyasri', 'ar_corporate', 'ar_credit', 'ar_trust',
  'inventory_pharmacy', 'ap_suppliers', 'rev_op', 'rev_er', 'rev_ip', 'rev_icu', 'rev_lab', 'rev_imaging', 'rev_pharmacy',
  'rev_procedure', 'rev_ot', 'rev_package', 'gst_out_cgst', 'gst_out_sgst', 'gst_out_igst', 'cogs_pharmacy'];

accounts.post('/accounts/journals', requirePerm('finance.journal'), h((req) => tx(() => {
  const b = req.body || {};
  const narration = String(b.narration || '').trim();
  if (!narration) fail(400, 'narration_required');
  const lines = (b.lines || []).map((l) => ({ account: num(l.account_id), debit: money(num(l.debit, 0)), credit: money(num(l.credit, 0)),
    segment: l.segment || null, memo: l.memo || null }));
  if (lines.length < 2) fail(400, 'two_lines_required');
  const opening = !!b.opening;
  for (const l of lines) {
    const a = get('SELECT * FROM accounts WHERE id=?', l.account);
    if (!a || a.is_group || !a.active) fail(400, 'account_invalid', { account_id: l.account });
    if (!opening && a.system_key && BUSINESS_ONLY.includes(a.system_key)) fail(409, 'account_posts_automatically', { account: a.name });
    if ((l.debit && l.credit) || (!l.debit && !l.credit) || l.debit < 0 || l.credit < 0) fail(400, 'line_needs_debit_or_credit');
  }
  const dr = money(lines.reduce((s, l) => s + l.debit, 0)), cr = money(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) >= 0.005) fail(400, 'voucher_not_balanced', { debit: dr, credit: cr });
  if (opening && !can(req.user, 'admin.write')) fail(403, 'opening_balances_need_admin');
  const vid = postVoucher({ type: 'JV', date: b.date || today(), narration, source: opening ? 'opening' : 'manual',
    lines, reason: b.reason, manual: true, userId: req.user.id });
  const v = voucherDetail(vid);
  emit(req, { topics: TOPICS, event: 'journal.posted', data: v, action: 'journal.create', entity: 'journal_vouchers', entityId: vid,
    detail: { after: { voucher_no: v.voucher_no, total: v.total, lines: v.lines.map((l) => [l.account_name, l.debit, l.credit]) }, reason: b.reason } });
  return v;
})));

accounts.post('/accounts/journals/:id/reverse', requirePerm('finance.journal'), h((req) => tx(() => {
  const v = get('SELECT * FROM journal_vouchers WHERE id=?', +req.params.id);
  if (!v) fail(404, 'voucher_not_found');
  if (!['manual', 'opening', 'contra', 'clearing'].includes(v.source)) fail(409, 'reverse_from_source_document', { source: v.source });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const rid = reverseVoucher(v.id, reason, { manual: true });
  emit(req, { topics: TOPICS, event: 'journal.reversed', data: { id: v.id, reversal: rid }, action: 'journal.reverse',
    entity: 'journal_vouchers', entityId: v.id, detail: { before: { status: v.status }, after: { status: 'reversed', reversal_id: rid }, reason } });
  return voucherDetail(v.id);
})));

/* ------------------------------------------------------------------ books */

accounts.get('/accounts/ledger', requirePerm('finance.view'), h((req) => {
  const { from, to } = period(req);
  const ref = req.query.account_id ? +req.query.account_id : req.query.key || 'cash';
  return accountLedger(ref, from, to, req.query.party_type ? { partyType: req.query.party_type, partyId: +req.query.party_id } : {});
}));

accounts.get('/accounts/trial-balance', requirePerm('finance.view'), h((req) => {
  const { from, to } = period(req);
  const rows = trialBalance(from, to).filter((r) => r.opening || r.debit || r.credit);
  const t = (k) => money(rows.reduce((s, r) => s + r[k], 0));
  return { from, to, rows, totals: { debit: t('debit'), credit: t('credit'), closing_dr: t('closing_dr'), closing_cr: t('closing_cr') } };
}));

accounts.get('/accounts/profit-loss', requirePerm('finance.pl'), h((req) => { const { from, to } = period(req); return profitAndLoss(from, to); }));
accounts.get('/accounts/balance-sheet', requirePerm('finance.pl'), h((req) => balanceSheet(req.query.as_of || req.query.to || today())));
accounts.get('/accounts/cash-flow', requirePerm('finance.pl'), h((req) => { const { from, to } = period(req); return cashFlow(from, to); }));

/** Balances that every finance screen shows at the top. */
/** Books integrity: unbalanced vouchers, trial balance, and vouchers whose record was removed outside the app. */
accounts.get('/accounts/integrity', requirePerm('finance.view'), h(() => booksIntegrity()));

/** Post corrections for vouchers whose record no longer exists (mirror entries; nothing is edited or deleted). */
accounts.post('/accounts/integrity/correct', requirePerm('books.reopen'), h((req) => tx(() => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const wanted = new Set((req.body?.voucher_ids || []).map(Number));
  const targets = booksIntegrity().orphan_vouchers.filter((v) => !wanted.size || wanted.has(v.id));
  if (!targets.length) fail(409, 'nothing_to_correct');
  const done = targets.map((v) => {
    const r = correctOrphanVoucher(v.id, reason, req.user.id);
    emit(req, { topics: ['accounts', 'finance'], event: 'journal.reversed', data: { id: v.id }, action: 'journal.correct_orphan',
      entity: 'journal_vouchers', entityId: v.id, detail: { before: { voucher: v.voucher_no, record: `${v.source} #${v.source_id}`, amount: v.total, status: 'posted' },
        after: { status: 'reversed', correction: r.correction }, reason } });
    return r;
  });
  return { corrected: done, integrity: booksIntegrity() };
})));

accounts.get('/accounts/position', requirePerm('finance.view'), h(() => {
  const bal = (key) => money(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l WHERE l.account_id=?`, acct(key).id) || 0);
  return {
    cash: bal('cash'), bank: bal('bank'), upi_pending: bal('upi_clearing'), card_pending: bal('card_clearing'),
    cheques: bal('cheque_clearing'), receivables: receivableBalances(), payables: money(-bal('ap_suppliers')),
    advances: money(-bal('patient_advances')), last_closed: lastClosedDate(),
  };
}));

/* --------------------------------------------------- contra & clearing */

/**
 * Money moving between the hospital's own accounts: a cash deposit into the
 * bank, or the UPI / card aggregator crediting the bank (less its charges).
 */
accounts.post('/accounts/contra', requirePerm('finance.write'), h((req) => tx(() => {
  const b = req.body || {};
  const FROM = { cash: 'cash', petty_cash: 'petty_cash', upi: 'upi_clearing', card: 'card_clearing', cheque: 'cheque_clearing', bank: 'bank' };
  const src = FROM[b.from], dst = FROM[b.to];
  if (!src || !dst || src === dst) fail(400, 'contra_accounts_invalid');
  const amount = money(num(b.amount)), charges = money(num(b.charges, 0));
  if (!(amount > 0) || charges < 0 || charges >= amount) fail(400, 'amount_invalid');
  const available = money(one('SELECT coalesce(sum(debit-credit),0) FROM journal_lines WHERE account_id=?', acct(src).id) || 0);
  if (amount > available + 0.005) fail(400, 'amount_exceeds_balance', { available });
  const vid = postVoucher({
    type: 'CV', date: b.date || today(), source: src.endsWith('clearing') ? 'clearing' : 'contra',
    narration: `${b.from} → ${b.to}${b.reference ? ` · ${b.reference}` : ''}`,
    lines: [{ account: dst, debit: money(amount - charges) }, { account: 'bank_charges', debit: charges }, { account: src, credit: amount }],
    manual: true, userId: req.user.id,
  });
  const v = voucherDetail(vid);
  emit(req, { topics: TOPICS, event: 'journal.posted', data: v, action: 'contra.create', entity: 'journal_vouchers', entityId: vid,
    detail: { after: { from: b.from, to: b.to, amount, charges, reference: b.reference } } });
  return v;
})));

accounts.get('/accounts/reconciliation', requirePerm('finance.view'), h((req) => {
  const { from, to } = period(req);
  return { from, to, rows: modeReconciliation({ from, to }) };
}));

accounts.get('/accounts/integration-reconciliation',requirePerm('finance.view'),h(req=>{
 const {from,to}=period(req);
 const rows=all("SELECT b.*,p.name patient_name,p.uhid FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.bill_date BETWEEN ? AND ? AND b.status<>'cancelled' ORDER BY b.id DESC",from,to).map(b=>{
 const policy=collectionPolicy(b),receipts=one('SELECT coalesce(sum(amount),0) FROM payments WHERE bill_id=? AND cancelled=0 AND amount>0',b.id)||0;
 const refunds=one('SELECT coalesce(sum(amount),0) FROM refunds WHERE bill_id=?',b.id)||0;
 const payerReceived=one("SELECT coalesce(sum(settled_amount),0) FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' AND mode NOT IN ('free','due')",b.id)||0;
 return {...b,...policy,desk:b.bill_type==='PHARM'?'pharmacy':'reception',receipts,refunds,payer_received:payerReceived,receipt_difference:money(b.paid-(receipts-refunds)),balance_difference:money(b.total-b.paid-b.covered_amount-b.waived_amount-b.balance)};
 });
 const handovers=all(`SELECT h.*,u.name sender,t.name receiver FROM cash_handovers h JOIN users u ON u.id=h.user_id LEFT JOIN users t ON t.id=h.handed_to WHERE h.handover_date BETWEEN ? AND ? ORDER BY h.id DESC`,from,to).map(h=>({...h,expected:JSON.parse(h.expected),declared:JSON.parse(h.declared)}));
 return {from,to,rows,handovers,integrity:booksIntegrity(),mismatches:rows.filter(b=>Math.abs(b.receipt_difference)>.01||Math.abs(b.balance_difference)>.01)};
}));

/* ------------------------------------------------------------ receivables */

const mayReceive = (u) => can(u, 'finance.receivables') || can(u, 'insurance.write');

accounts.get('/accounts/receivables', requireAuth, h((req) => {
  if (!mayReceive(req.user) && !can(req.user, 'finance.view')) fail(403, 'forbidden');
  const w = ["s.mode NOT IN ('due')"], a = [];
  if(req.query.claim_id){w.push('s.claim_id=?');a.push(num(req.query.claim_id));}
  if (req.query.mode && req.query.mode !== 'all') { w.push('s.mode=?'); a.push(req.query.mode); }
  if (req.query.status === 'open' || !req.query.status) w.push("s.status IN ('open','partially_settled')");
  else if (req.query.status !== 'all') { w.push('s.status=?'); a.push(req.query.status); }
  if (req.query.q) { w.push('(p.name LIKE ? OR p.uhid LIKE ? OR b.bill_no LIKE ? OR s.payer_name LIKE ?)'); const l = `%${req.query.q}%`; a.push(l, l, l, l); }
  const rows = all(`SELECT s.*, b.bill_no, b.bill_type, p.name patient_name, p.uhid, u.name created_by_name,
      CASE WHEN s.status='cancelled' THEN 0 ELSE round(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient, 2) END open,
      cast(julianday('now','localtime') - julianday(s.created_at) AS int) age_days
    FROM bill_settlements s JOIN bills b ON b.id=s.bill_id JOIN patients p ON p.id=s.patient_id LEFT JOIN users u ON u.id=s.created_by
    WHERE ${w.join(' AND ')} ORDER BY s.id DESC LIMIT 500`, ...a);
  for (const r of rows) r.receipts = all('SELECT * FROM settlement_receipts WHERE settlement_id=? ORDER BY id', r.id);
  const summary = all(`SELECT mode, count(*) n, round(sum(amount - settled_amount - written_off - transferred_to_patient),2) open
      FROM bill_settlements WHERE status IN ('open','partially_settled') AND mode NOT IN ('free','due') GROUP BY mode`)
    .map((r) => ({ ...r, label: MODE_LABEL[r.mode] || r.mode }));
  return { rows, summary, balances: receivableBalances() };
}));

accounts.post('/accounts/receivables/:id/receive', requireAuth, h((req) => {
  if (!mayReceive(req.user)) fail(403, 'forbidden', { need: 'finance.receivables' });
  const b = req.body || {};
  const r = receiveSettlement(req, { settlement_id: +req.params.id, amount: num(b.amount, 0), disallowed: num(b.disallowed, 0),
    disallowance_action: b.disallowance_action, mode: b.mode || 'bank_transfer', reference: b.reference, notes: b.notes });
  emit(req, { topics: [...TOPICS, 'billing', 'insurance'], event: 'settlement.received', data: r, action: 'settlement.receive',
    entity: 'bill_settlements', entityId: r.settlement.id,
    detail: { before: { status: r.before.status, settled: r.before.settled_amount }, after: { status: r.settlement.status,
      settled: r.settlement.settled_amount, receipt: r.receipt.receipt_no, amount: r.receipt.amount, disallowed: r.receipt.disallowed }, reason: b.notes } });
  return r;
}));

accounts.post('/accounts/receivables/:id/cancel', requirePerm('payment.authorize'), h((req) => {
  const r = cancelSettlement(req, +req.params.id, req.body?.reason);
  emit(req, { topics: [...TOPICS, 'billing'], event: 'settlement.cancelled', data: r, action: 'settlement.cancel',
    entity: 'bill_settlements', entityId: r.settlement.id, detail: { before: r.before, after: { status: 'cancelled' }, reason: req.body?.reason } });
  return r;
}));

/* ------------------------------------------------------------ day closing */

function dayPreview(date) {
  const byMode = all(`SELECT mode, count(*) n, round(sum(amount),2) total FROM payments WHERE pay_date=? AND cancelled=0 GROUP BY mode`, date);
  const cashId = acct('cash').id;
  const opening = money(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
                              WHERE l.account_id=? AND v.voucher_date < ?`, cashId, date) || 0);
  const movement = get(`SELECT round(coalesce(sum(l.debit),0),2) cash_in, round(coalesce(sum(l.credit),0),2) cash_out
      FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.account_id=? AND v.voucher_date=?`, cashId, date);
  const closing = get('SELECT * FROM day_closings WHERE close_date=?', date);
  // the whole hospital's day, each figure in its own lane (billing ≠ collection ≠ revenue ≠ receivable ≠ advance)
  const day = { from: date, to: date };
  const bill = M.billing(day), col = M.collections(day), exp = M.expenses(day), rec = M.receivables(date), adv = M.advances(day);
  const hospital = {
    billing: { bills: bill.bills - bill.cancelled_bills, gross: bill.gross, discount: bill.discount, net: bill.net, cancelled: bill.cancelled, due: bill.due, covered: bill.covered, free: bill.waived },
    revenue: M.revenue(day).net,
    collections: { ...col.byMode, received: col.received, refunded: col.refunded, net: col.net },
    receivables: { total: rec.total, types: rec.types.map((t) => ({ label: t.label, outstanding: t.outstanding })) },
    advances: adv,
    expenses: { total: exp.total, paid_cash: exp.paid_cash, paid_bank: exp.paid_bank },
    cash: M.cashPosition(day),
    // money that should have reached each channel today: compare with the drawer, UPI app, card terminal settlement and bank statement
    expected: { cash: col.byMode.cash, upi: col.byMode.upi, card: col.byMode.card, bank: col.byMode.bank },
    post_close_edits: all(`SELECT a.at, a.action, a.entity, a.entity_id, a.user_name, a.detail FROM audit_log a
        WHERE a.detail LIKE '%"post_close_edit":true%' AND a.detail LIKE ? ORDER BY a.id DESC LIMIT 50`, `%"closed_date":"${date}"%`)
      .map((r) => { let d = {}; try { d = JSON.parse(r.detail || '{}'); } catch { /* keep empty */ } return { ...r, reason: d.reason || null, detail: undefined }; }),
  };
  return {
    date, hospital, opening, ...movement, cash_expected: money(opening + movement.cash_in - movement.cash_out),
    receipts: money(byMode.reduce((s, r) => s + r.total, 0)),
    by_mode: byMode.map((r) => ({ ...r, label: MODE_LABEL[r.mode] || r.mode })),
    settlements: all(`SELECT mode, count(*) n, round(sum(amount),2) total FROM bill_settlements WHERE date(created_at)=? AND status<>'cancelled' GROUP BY mode`, date)
      .map((r) => ({ ...r, label: MODE_LABEL[r.mode] || r.mode })),
    vouchers: one('SELECT count(*) FROM journal_vouchers WHERE voucher_date=?', date) || 0,
    open_counters: all(`SELECT cs.id, c.name counter_name, u.name user_name, cs.opened_at FROM counter_sessions cs
        LEFT JOIN counters c ON c.id=cs.counter_id LEFT JOIN users u ON u.id=cs.user_id WHERE cs.closed_at IS NULL`),
    closing, last_closed: lastClosedDate(),
  };
}

accounts.get('/accounts/day-close', requirePerm('finance.view'), h((req) => dayPreview(req.query.date || today())));
accounts.get('/accounts/day-closings', requirePerm('finance.view'), h(() => all(
  `SELECT d.*, u.name closed_by_name, r.name reopened_by_name, a.name approved_by_name FROM day_closings d LEFT JOIN users u ON u.id=d.closed_by
     LEFT JOIN users r ON r.id=d.reopened_by LEFT JOIN users a ON a.id=d.approved_by ORDER BY d.close_date DESC LIMIT 120`)));

accounts.post('/accounts/day-close', requirePerm('finance.close'), h((req) => tx(() => {
  const b = req.body || {};
  const date = b.date || today();
  if (date > today()) fail(400, 'cannot_close_future_day');
  const existing = get('SELECT * FROM day_closings WHERE close_date=?', date);
  if (existing?.status === 'closed') fail(409, 'day_already_closed');
  const last = lastClosedDate();
  const p = dayPreview(date);
  const counted = b.cash_counted === '' || b.cash_counted == null ? null : money(num(b.cash_counted));
  const variance = counted == null ? null : money(counted - p.cash_expected);
  if (variance && Math.abs(variance) >= 0.01) {
    if (!String(b.notes || '').trim()) fail(400, 'variance_needs_explanation', { variance });
    postVoucher({ type: 'JV', date, source: 'day_close', narration: `Cash ${variance > 0 ? 'over' : 'short'} at day close ${date}`,
      lines: variance > 0
        ? [{ account: 'cash', debit: variance }, { account: 'cash_over_short', credit: variance }]
        : [{ account: 'cash_over_short', debit: -variance }, { account: 'cash', credit: -variance }],
      userId: req.user.id, reason: b.notes });
  }
  // UPI, card and bank are checked against the app, terminal settlement and bank statement; a difference is recorded, not posted
  const declared = { cash: counted };
  const variances = { cash: variance || 0 };
  for (const k of ['upi', 'card', 'bank']) {
    const v = b.declared?.[k];
    if (v === '' || v == null) continue;
    declared[k] = money(num(v));
    variances[k] = money(declared[k] - p.hospital.expected[k]);
  }
  const anyVariance = Object.values(variances).some((v) => Math.abs(v) >= 0.01);
  if (anyVariance && !String(b.notes || '').trim()) fail(400, 'variance_needs_explanation', { variances });
  const row = { close_date: date, status: 'closed', cash_expected: p.cash_expected, cash_counted: counted, variance,
    receipts: p.receipts, by_mode: JSON.stringify(Object.fromEntries(p.by_mode.map((m) => [m.mode, m.total]))),
    declared: JSON.stringify({ declared, expected: p.hospital.expected, variances }), summary: JSON.stringify(p.hospital),
    approval_status: anyVariance ? 'pending' : 'not_needed', approved_by: null, approved_at: null,
    notes: b.notes, closed_by: req.user.id, closed_at: nowIso() };
  if (existing) update('day_closings', existing.id, row); else insert('day_closings', row);
  const saved = get('SELECT * FROM day_closings WHERE close_date=?', date);
  emit(req, { topics: TOPICS, event: 'day.closed', data: saved, action: 'day.close', entity: 'day_closings', entityId: saved.id,
    detail: { before: existing ? { status: existing.status } : null, after: { expected: p.cash_expected, counted, variance, declared, variances, approval: row.approval_status },
      reason: b.notes, previous_close: last } });
  return saved;
})));

/** A close with any variance needs a second person's approval (or an administrator's). */
accounts.post('/accounts/day-close/:date/approve', requirePerm('finance.close'), h((req) => {
  const d = get('SELECT * FROM day_closings WHERE close_date=?', req.params.date);
  if (!d || d.status !== 'closed') fail(404, 'closed_day_not_found');
  if (d.approval_status !== 'pending') fail(409, 'nothing_to_approve');
  if (d.closed_by === req.user.id && !can(req.user, 'admin.write')) fail(403, 'closer_cannot_approve_own_variance');
  update('day_closings', d.id, { approval_status: 'approved', approved_by: req.user.id, approved_at: nowIso() });
  emit(req, { topics: TOPICS, event: 'day.closed', data: { date: d.close_date }, action: 'day.approve', entity: 'day_closings', entityId: d.id,
    detail: { before: { approval: 'pending' }, after: { approval: 'approved' }, reason: req.body?.note || null } });
  return get('SELECT * FROM day_closings WHERE id=?', d.id);
}));

accounts.post('/accounts/day-close/:date/reopen', requirePerm('books.reopen'), h((req) => {
  const d = get('SELECT * FROM day_closings WHERE close_date=?', req.params.date);
  if (!d || d.status !== 'closed') fail(404, 'closed_day_not_found');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  update('day_closings', d.id, { status: 'reopened', reopened_by: req.user.id, reopened_at: nowIso(), reopen_reason: reason });
  emit(req, { topics: TOPICS, event: 'day.reopened', data: { date: d.close_date }, action: 'day.reopen', entity: 'day_closings',
    entityId: d.id, detail: { before: { status: 'closed' }, after: { status: 'reopened' }, reason } });
  return { ok: true };
}));

/* ---------------------------------------------------------------- reports */

accounts.get('/reports/catalog', requireAuth, h((req) => ({
  reports: catalog(req.user),
  doctors: all("SELECT id, name FROM users WHERE role='doctor' AND active=1 ORDER BY name"),
  accounts: can(req.user, 'finance.view') ? all('SELECT id, code, name FROM accounts WHERE is_group=0 AND active=1 ORDER BY code') : [],
})));

accounts.get('/reports/run/:id', requireAuth, h((req) => {
  const out = runReport(req.user, req.params.id, req.query);
  if (out.error) fail(out.status, out.error);
  return out;
}));

export { MONEY_MODES, PAYERS };
