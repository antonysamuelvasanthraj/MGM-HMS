/**
 * Metrics — the one place hospital figures are calculated. Dashboards, the
 * report centre and day close all read from here, so they always agree.
 *
 *   Billing     what was charged on bills (gross − discount = net), by bill date
 *   Revenue     what the books recognised (journal income accounts)
 *   Collection  money actually received (cash, UPI, card, bank, cheque) less refunds
 *   Receivable  what is still owed — by the patient or by a payer
 *   Advance     money held ahead of charges — a liability, never revenue
 *
 * A payer settlement (insurance, Aarogyasri, corporate, trust, credit) moves a
 * bill into that payer's receivable; it is never counted as collection until
 * the payer's money is received.
 */
import { all, get, one, today, localStamp } from './db.js';
import { acct, SEGMENTS } from './accounting.js';
import { setting } from './lib.js';

export const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
export const MODE_GROUP = { cash: 'cash', upi: 'upi', debit_card: 'card', credit_card: 'card', card: 'card', bank_transfer: 'bank', cheque: 'bank' };   // cheques are banked: reconciled with bank transfers, never left out of every channel
export const MODE_GROUPS = ['cash', 'upi', 'card', 'bank', 'other'];
export const PAYERS = ['insurance', 'aarogyasri', 'corporate', 'credit', 'trust'];
export const CATEGORIES = ['self', 'free', 'aarogyasri', 'insurance', 'corporate', 'trust', 'credit'];
export const CATEGORY_LABEL = { self: 'Normal / cash', free: 'Free', aarogyasri: 'Aarogyasri', insurance: 'Insurance', corporate: 'Corporate', trust: 'Trust', credit: 'Credit', due: 'Due' };
export const SEGMENT_LABEL = { OP: 'OP consultation', IP: 'IP services', ER: 'Emergency', LAB: 'Laboratory', IMAGING: 'Imaging', PHARMACY: 'Pharmacy',
  PROCEDURE: 'Procedures', OT: 'OT', ICU: 'ICU', ROOM: 'Room charges', NURSING: 'Nursing', PACKAGE: 'Packages', OTHER: 'Other services' };

/* ------------------------------------------------------------------ dates */

const iso = (d) => localStamp(d).slice(0, 10);
const D = (s) => new Date(`${s}T00:00:00`);
export const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
export const monthStart = (s) => `${s.slice(0, 7)}-01`;
export function fyStart(s = today()) {
  const m0 = Math.min(12, Math.max(1, +setting('fy_start_month') || 4));
  const d = D(s);
  const y = d.getMonth() + 1 >= m0 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(m0).padStart(2, '0')}-01`;
}
export function daysBetween(a, b) { return Math.round((D(b) - D(a)) / 86400000); }
export function dayList(from, to, max = 400) {
  const out = [];
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}
export function range(preset, from, to) {
  const t = today();
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'yesterday': { const y = addDays(t, -1); return { from: y, to: y }; }
    case '7d': case 'week7': return { from: addDays(t, -6), to: t };
    case '30d': return { from: addDays(t, -29), to: t };
    case 'week': { const d = D(t); return { from: addDays(t, -((d.getDay() + 6) % 7)), to: t }; }
    case 'month': return { from: monthStart(t), to: t };
    case 'last_month': { const e = addDays(monthStart(t), -1); return { from: monthStart(e), to: e }; }
    case 'year': case 'fy': return { from: fyStart(t), to: t };
    default: return { from: from || monthStart(t), to: to || t };
  }
}

/* ---------------------------------------------------------------- revenue */

const incomeLines = `FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id`;
function jf(q, extra = []) {
  const w = ['v.voucher_date BETWEEN ? AND ?', ...extra], a = [q.from, q.to];
  if (q.segment) { w.push('l.segment=?'); a.push(q.segment); }
  if (q.category) { w.push('l.category=?'); a.push(q.category); }
  if (q.doctor_id) { w.push("v.source='bill' AND v.source_id IN (SELECT b.id FROM bills b LEFT JOIN encounters e ON e.id=b.encounter_id WHERE coalesce(b.doctor_id,e.doctor_id)=?)"); a.push(+q.doctor_id); }
  return { sql: w.join(' AND '), args: a };
}

/** Recognised revenue: gross by department, less discounts, free treatment and returns. */
export function revenue(q) {
  const f = jf(q, ["a.type='income'"]);
  const rows = all(`SELECT coalesce(l.segment,'OTHER') seg,
      sum(CASE WHEN a.subtype='revenue' THEN l.credit-l.debit ELSE 0 END) gross,
      sum(CASE WHEN a.system_key='discount_allowed' THEN l.debit-l.credit ELSE 0 END) discount,
      sum(CASE WHEN a.system_key='free_treatment' THEN l.debit-l.credit ELSE 0 END) free,
      sum(CASE WHEN a.system_key='sales_returns' THEN l.debit-l.credit ELSE 0 END) returns
    ${incomeLines} WHERE ${f.sql} GROUP BY seg`, ...f.args);
  const by = Object.fromEntries(rows.map((r) => [r.seg, r]));
  const departments = SEGMENTS.map((s) => {
    const r = by[s] || {};
    const d = { segment: s, label: SEGMENT_LABEL[s], gross: r2(r.gross || 0), discount: r2(r.discount || 0), free: r2(r.free || 0), returns: r2(r.returns || 0) };
    d.net = r2(d.gross - d.discount - d.free - d.returns);
    return d;
  }).filter((d) => d.gross || d.discount || d.free || d.returns);
  const t = (k) => r2(departments.reduce((s, d) => s + d[k], 0));
  return { gross: t('gross'), discount: t('discount'), free: t('free'), returns: t('returns'), net: t('net'), departments };
}

export function revenueByDay(q) {
  const f = jf(q, ["a.type='income'"]);
  const m = Object.fromEntries(all(`SELECT v.voucher_date d, sum(l.credit-l.debit) v ${incomeLines} WHERE ${f.sql} GROUP BY v.voucher_date`, ...f.args).map((r) => [r.d, r2(r.v)]));
  return dayList(q.from, q.to).map((d) => ({ d, revenue: m[d] || 0 }));
}

/* ------------------------------------------------------------ collections */

function pf(q) {
  const w = ['p.pay_date BETWEEN ? AND ?', 'p.cancelled=0'], a = [q.from, q.to];
  if (q.desk === 'pharmacy') w.push("b.bill_type='PHARM'");
  if (q.desk === 'reception') w.push("b.bill_type<>'PHARM'");
  if (q.mode) { w.push('p.mode=?'); a.push(q.mode); }
  if (q.category) { w.push('b.payer_type=?'); a.push(q.category); }
  if (q.doctor_id) { w.push('b.encounter_id IN (SELECT id FROM encounters WHERE doctor_id=?)'); a.push(+q.doctor_id); }
  if (q.segment) { w.push('EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id=b.id AND bi.revenue_head=?)'); a.push(q.segment); }
  return { sql: w.join(' AND '), args: a };
}

/** Money actually received — payments only. Payer settlements are not collection. */
export function collections(q) {
  const f = pf(q);
  const rows = all(`SELECT p.mode, sum(CASE WHEN p.amount>0 THEN p.amount ELSE 0 END) inflow, sum(CASE WHEN p.amount<0 THEN -p.amount ELSE 0 END) outflow, count(*) n
    FROM payments p JOIN bills b ON b.id=p.bill_id WHERE ${f.sql} GROUP BY p.mode`, ...f.args);
  const byMode = Object.fromEntries(MODE_GROUPS.map((g) => [g, 0]));
  let received = 0, refunded = 0, receipts = 0;
  for (const r of rows) {
    const g = MODE_GROUP[r.mode] || 'other';
    // money refunded by UPI / card leaves the bank (as the books post it), not the UPI app or card terminal
    const outTo = ['upi', 'card'].includes(g) ? 'bank' : g;
    byMode[g] = r2(byMode[g] + r.inflow);
    byMode[outTo] = r2(byMode[outTo] - r.outflow);
    received += r.inflow; refunded += r.outflow; receipts += r.n;
  }
  // payer money received in the period (insurance / scheme / corporate settlements) is collection too
  const payerIn = q.desk === 'pharmacy' ? [] : all(`SELECT r.mode, sum(r.amount) amount FROM settlement_receipts r JOIN bill_settlements s ON s.id=r.settlement_id
    JOIN bills b ON b.id=s.bill_id WHERE r.received_on BETWEEN ? AND ? ${q.desk === 'reception' ? "AND b.bill_type<>'PHARM'" : ''} GROUP BY r.mode`, q.from, q.to);
  let payer = 0;
  for (const r of payerIn) { const g = MODE_GROUP[r.mode] || 'other'; byMode[g] = r2(byMode[g] + r.amount); payer += r.amount; }
  return { byMode, received: r2(received), refunded: r2(refunded), payer_receipts: r2(payer), receipts, net: r2(received - refunded + payer) };
}

export function collectionsByDay(q) {
  const f = pf(q);
  const m = Object.fromEntries(all(`SELECT p.pay_date d, sum(p.amount) v FROM payments p JOIN bills b ON b.id=p.bill_id WHERE ${f.sql} GROUP BY p.pay_date`, ...f.args).map((r) => [r.d, r2(r.v)]));
  return dayList(q.from, q.to).map((d) => ({ d, collected: m[d] || 0 }));
}

/* ---------------------------------------------------------------- billing */

/** Bills by bill date: gross (before discount), discount, net, cancelled, refunds, still due. */
export function billing(q) {
  const w = ['b.bill_date BETWEEN ? AND ?'], a = [q.from, q.to];
  if (q.desk === 'pharmacy') w.push("b.bill_type='PHARM'");
  if (q.desk === 'reception') w.push("b.bill_type<>'PHARM'");
  if (q.category) { w.push('b.payer_type=?'); a.push(q.category); }
  if (q.types) { w.push(`b.bill_type IN (${q.types.map(() => '?').join(',')})`); a.push(...q.types); }
  const x = get(`SELECT count(*) bills,
      sum(CASE WHEN b.status<>'cancelled' THEN b.total + b.discount ELSE 0 END) gross,
      sum(CASE WHEN b.status<>'cancelled' THEN b.discount ELSE 0 END) discount,
      sum(CASE WHEN b.status<>'cancelled' THEN b.total ELSE 0 END) net,
      sum(CASE WHEN b.status='cancelled' THEN b.total + b.discount ELSE 0 END) cancelled,
      sum(CASE WHEN b.status='cancelled' THEN 1 ELSE 0 END) cancelled_bills,
      sum(CASE WHEN b.status<>'cancelled' THEN b.paid ELSE 0 END) paid,
      sum(CASE WHEN b.status<>'cancelled' THEN b.covered_amount ELSE 0 END) covered,
      sum(CASE WHEN b.status<>'cancelled' THEN b.waived_amount ELSE 0 END) waived,
      sum(CASE WHEN b.status<>'cancelled' AND b.balance>0 THEN b.balance ELSE 0 END) due
    FROM bills b WHERE ${w.join(' AND ')}`, ...a);
  const refunds = get(`SELECT count(*) n, coalesce(sum(r.amount),0) amount FROM refunds r JOIN bills b ON b.id=r.bill_id
    WHERE date(r.created_at) BETWEEN ? AND ? ${q.desk === 'pharmacy' ? "AND b.bill_type='PHARM'" : q.desk === 'reception' ? "AND b.bill_type<>'PHARM'" : ''}`, q.from, q.to);
  return { bills: x.bills || 0, cancelled_bills: x.cancelled_bills || 0, gross: r2(x.gross || 0), discount: r2(x.discount || 0), net: r2(x.net || 0), cancelled: r2(x.cancelled || 0),
    paid: r2(x.paid || 0), covered: r2(x.covered || 0), waived: r2(x.waived || 0), due: r2(x.due || 0), refunds: r2(refunds.amount), refund_count: refunds.n };
}

/* ------------------------------------------------------------ receivables */

const accBal = (key, asOf) => r2(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
  WHERE l.account_id=? AND v.voucher_date<=?`, acct(key).id, asOf) || 0);

export const AGE_BUCKETS = [['d0_7', '0–7 days', 0, 7], ['d8_15', '8–15', 8, 15], ['d16_30', '16–30', 16, 30], ['d31_60', '31–60', 31, 60], ['d61_90', '61–90', 61, 90], ['d90p', '90+', 91, 1e9]];
const bucketOf = (age) => AGE_BUCKETS.find(([, , lo, hi]) => age >= lo && age <= hi)[0];

/** Outstanding by type with ageing, as of a date; plus what was recovered in a period. */
export function receivables(asOf = today(), q = null) {
  const types = [{ key: 'patient', label: 'Patient due' }, ...PAYERS.map((p) => ({ key: p, label: `${CATEGORY_LABEL[p]}${p === 'credit' ? ' patients' : ''}` }))];
  for (const t of types) { t.outstanding = 0; for (const [b] of AGE_BUCKETS) t[b] = 0; t.count = 0; }
  const by = Object.fromEntries(types.map((t) => [t.key, t]));
  for (const b of all(`SELECT bill_date, balance FROM bills WHERE status<>'cancelled' AND balance > 0.005 AND bill_date<=?`, asOf)) {
    const t = by.patient; const k = bucketOf(daysBetween(b.bill_date, asOf));
    t[k] = r2(t[k] + b.balance); t.outstanding = r2(t.outstanding + b.balance); t.count++;
  }
  for (const s of all(`SELECT mode, date(created_at) d, amount - settled_amount - written_off - transferred_to_patient open FROM bill_settlements
      WHERE status IN ('open','partially_settled') AND mode IN (${PAYERS.map(() => '?').join(',')}) AND date(created_at)<=?`, ...PAYERS, asOf)) {
    const t = by[s.mode]; if (!t || s.open <= 0.005) continue;
    const k = bucketOf(daysBetween(s.d, asOf));
    t[k] = r2(t[k] + s.open); t.outstanding = r2(t.outstanding + s.open); t.count++;
  }
  if (q) {
    by.patient.recovered = r2(one(`SELECT coalesce(sum(p.amount),0) FROM payments p JOIN bills b ON b.id=p.bill_id
      WHERE p.cancelled=0 AND p.amount>0 AND p.pay_date BETWEEN ? AND ? AND b.bill_date < p.pay_date`, q.from, q.to) || 0);
    for (const r of all(`SELECT s.mode, sum(r.amount) amount FROM settlement_receipts r JOIN bill_settlements s ON s.id=r.settlement_id
        WHERE r.received_on BETWEEN ? AND ? GROUP BY s.mode`, q.from, q.to)) if (by[r.mode]) by[r.mode].recovered = r2(r.amount);
  }
  return { asOf, types, total: r2(types.reduce((s, t) => s + t.outstanding, 0)), ledger_patient: accBal('ar_patient', asOf) };
}

/* ---------------------------------------------------------------- advances */

/** Patient advance ledger: opening + received − adjusted − refunded = closing. */
export function advances(q) {
  const id = acct('patient_advances').id;
  const opening = r2(-(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.account_id=? AND v.voucher_date < ?`, id, q.from) || 0));
  const mv = get(`SELECT coalesce(sum(l.credit),0) up, coalesce(sum(l.debit),0) down FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
    WHERE l.account_id=? AND v.voucher_date BETWEEN ? AND ?`, id, q.from, q.to);
  const refunded = r2(one(`SELECT coalesce(sum(r.amount),0) FROM refunds r JOIN payments p ON p.id=r.payment_id
    WHERE date(r.created_at) BETWEEN ? AND ? AND r.reason LIKE 'Unused advance%'`, q.from, q.to) || 0);
  const down = r2(mv.down);
  return { opening, received: r2(mv.up), adjusted: r2(Math.max(0, down - refunded)), refunded: r2(Math.min(refunded, down)), closing: r2(opening + mv.up - mv.down) };
}

/* ---------------------------------------------------------------- expenses */

export const EXPENSE_GROUPS = [
  ['Salaries', ['exp_salaries']], ['Pharmacy purchases (cost of medicines sold)', ['cogs_pharmacy']], ['Lab consumables', ['exp_lab_consumables']],
  ['Medical supplies', ['exp_consumables', 'cogs_consumables']], ['Electricity', ['exp_electricity']], ['Rent', ['exp_rent']],
  ['Maintenance', ['exp_maintenance']], ['Equipment', ['exp_equipment']], ['Housekeeping', ['exp_housekeeping', 'exp_biowaste', 'exp_laundry']],
  ['Security', ['exp_security']], ['Administration', ['exp_admin', 'exp_stationery', 'exp_statutory']], ['Marketing', ['exp_marketing']],
  ['Software', ['exp_software']], ['Professional fees', ['exp_professional', 'exp_doctor_fees']], ['Utilities', ['exp_water', 'exp_telecom', 'exp_fuel']],
  ['Miscellaneous', ['exp_general', 'bank_charges', 'round_off', 'cash_over_short', 'stock_writeoff', 'claim_disallowance']],
];

/** Recognised expenses by category (journal), for a period. */
export function expenses(q) {
  const rows = all(`SELECT a.id, a.system_key, sum(l.debit-l.credit) v ${incomeLines}
    WHERE a.type='expense' AND v.voucher_date BETWEEN ? AND ? GROUP BY a.id`, q.from, q.to);
  const byKey = Object.fromEntries(rows.map((r) => [r.system_key || `id${r.id}`, r2(r.v)]));
  const known = new Set(EXPENSE_GROUPS.flatMap(([, k]) => k));
  const groups = EXPENSE_GROUPS.map(([label, keys]) => ({ label, amount: r2(keys.reduce((s, k) => s + (byKey[k] || 0), 0)) }));
  const other = r2(Object.entries(byKey).filter(([k]) => !known.has(k)).reduce((s, [, v]) => s + v, 0));
  if (other) groups.find((g) => g.label === 'Miscellaneous').amount = r2(groups.find((g) => g.label === 'Miscellaneous').amount + other);
  const total = r2(groups.reduce((s, g) => s + g.amount, 0));
  const cogs = r2((byKey.cogs_pharmacy || 0) + (byKey.cogs_consumables || 0));
  // how expenses were paid in the period (cash vs bank), from the payment vouchers
  const paid = get(`SELECT coalesce(sum(CASE WHEN a.system_key IN ('cash','petty_cash') THEN l.credit ELSE 0 END),0) cash,
      coalesce(sum(CASE WHEN a.subtype IN ('bank','clearing') THEN l.credit ELSE 0 END),0) bank
    ${incomeLines} WHERE v.source='expense_payment' AND v.voucher_date BETWEEN ? AND ?`, q.from, q.to);
  const purchases = r2(one(`SELECT coalesce(sum(total),0) FROM purchases WHERE date(received_at) BETWEEN ? AND ?`, q.from, q.to) || 0);
  return { groups, total, cogs, operating: r2(total - cogs), paid_cash: r2(paid.cash), paid_bank: r2(paid.bank), inventory_purchases: purchases };
}

/* -------------------------------------------------------------- cash book */

/** Cash drawer for a day (or period): opening, in, out, deposits, withdrawals, closing. */
export function cashPosition(q) {
  const cash = [acct('cash').id, acct('petty_cash').id].join(',');
  const bank = all("SELECT id FROM accounts WHERE subtype IN ('bank','clearing')").map((r) => r.id).join(',') || '0';
  const opening = r2(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.account_id IN (${cash}) AND v.voucher_date < ?`, q.from) || 0);
  const lines = all(`SELECT v.id, v.source, l.account_id, l.debit, l.credit FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
    WHERE v.voucher_date BETWEEN ? AND ? AND v.id IN (SELECT voucher_id FROM journal_lines WHERE account_id IN (${cash}))`, q.from, q.to);
  const cashIds = new Set(cash.split(',').map(Number)), bankIds = new Set(bank.split(',').map(Number));
  const byV = new Map();
  for (const l of lines) { const v = byV.get(l.id) || { source: l.source, cash: 0, bank: 0 }; if (cashIds.has(l.account_id)) v.cash += l.debit - l.credit; if (bankIds.has(l.account_id)) v.bank += l.debit - l.credit; byV.set(l.id, v); }
  const o = { collections: 0, refunds: 0, expenses: 0, deposits: 0, withdrawals: 0, other: 0 };
  for (const v of byV.values()) {
    if (['contra', 'clearing'].includes(v.source) || (v.bank && Math.abs(v.bank + v.cash) < 0.01)) { if (v.cash < 0) o.deposits -= v.cash; else o.withdrawals += v.cash; continue; }
    if (['payment', 'settlement_receipt'].includes(v.source)) { if (v.cash >= 0) o.collections += v.cash; else o.refunds -= v.cash; continue; }
    if (['expense_payment', 'supplier_payment'].includes(v.source)) { o.expenses -= v.cash; continue; }
    o.other += v.cash;
  }
  for (const k of Object.keys(o)) o[k] = r2(o[k]);
  return { opening, ...o, closing: r2(opening + o.collections + o.withdrawals + o.other - o.refunds - o.expenses - o.deposits) };
}

/* ------------------------------------------------------------- operating */

/** The two different "profit" views, clearly separated. */
export function results(q) {
  const rev = revenue(q), exp = expenses(q), col = collections(q);
  const cashOut = r2(exp.paid_cash + exp.paid_bank + r2(one(`SELECT coalesce(sum(amount),0) FROM supplier_payments WHERE paid_on BETWEEN ? AND ?`, q.from, q.to) || 0));
  return {
    cash: { collections: col.net, cash_expenses: cashOut, surplus: r2(col.net - cashOut), label: 'Cash surplus / deficit = money received − money paid out' },
    operating: { revenue: rev.net, expenses: exp.total, result: r2(rev.net - exp.total), label: 'Operating result = recognised revenue − recognised expenses' },
  };
}

/* -------------------------------------------------------------- comparison */

/** Change vs a prior value; no percentage when the prior value is zero (it would mislead). */
export function change(now, before) {
  const diff = r2(now - before);
  return { now: r2(now), before: r2(before), diff, pct: Math.abs(before) < 0.005 ? null : Math.round((diff / Math.abs(before)) * 1000) / 10 };
}

export function dayMetrics(from, to = from) {
  const q = { from, to };
  return {
    revenue: revenue(q).net, collection: collections(q).net, expense: expenses(q).total,
    op: one("SELECT count(*) FROM encounters WHERE kind='OP' AND visit_date BETWEEN ? AND ?", from, to) || 0,
    admissions: one("SELECT count(*) FROM admissions WHERE status<>'requested' AND date(admitted_at) BETWEEN ? AND ?", from, to) || 0,
  };
}

/** Today vs yesterday, vs same day last week, vs previous month's daily average. */
export function dayComparisons(d = today()) {
  const now = dayMetrics(d), y = dayMetrics(addDays(d, -1)), w = dayMetrics(addDays(d, -7));
  const pmEnd = addDays(monthStart(d), -1), pmStart = monthStart(pmEnd), pmDays = daysBetween(pmStart, pmEnd) + 1;
  const pm = dayMetrics(pmStart, pmEnd);
  const out = {};
  for (const k of Object.keys(now)) out[k] = { yesterday: change(now[k], y[k]), last_week: change(now[k], w[k]), month_avg: change(now[k], pm[k] / pmDays) };
  return out;
}

/** Period comparisons: month vs last month, vs same month last year, FY vs previous FY (to the same day). */
export function periodComparisons(d = today()) {
  const ms = monthStart(d), dom = daysBetween(ms, d);
  const lmStart = monthStart(addDays(ms, -1));
  const lyStart = `${+ms.slice(0, 4) - 1}${ms.slice(4)}`;
  const fs = fyStart(d), pfs = `${+fs.slice(0, 4) - 1}${fs.slice(4)}`, fyDay = daysBetween(fs, d);
  const pairs = {
    month_vs_last_month: [[ms, d], [lmStart, addDays(lmStart, Math.min(dom, daysBetween(lmStart, addDays(ms, -1))))]],
    month_vs_last_year: [[ms, d], [lyStart, addDays(lyStart, dom)]],
    fy_vs_previous_fy: [[fs, d], [pfs, addDays(pfs, fyDay)]],
  };
  const out = {};
  for (const [k, [[a1, a2], [b1, b2]]] of Object.entries(pairs)) {
    const A = dayMetrics(a1, a2), B = dayMetrics(b1, b2);
    out[k] = { current: { from: a1, to: a2 }, previous: { from: b1, to: b2 }, metrics: Object.fromEntries(Object.keys(A).map((m) => [m, change(A[m], B[m])])) };
  }
  return out;
}

/** MTD and FYTD: revenue, collection and expense kept separate. */
export function toDate(d = today()) {
  const m = { from: monthStart(d), to: d }, y = { from: fyStart(d), to: d };
  return {
    mtd: { from: m.from, revenue: revenue(m).net, collection: collections(m).net, expense: expenses(m).total, refunds: billing(m).refunds },
    fytd: { from: y.from, revenue: revenue(y).net, collection: collections(y).net, expense: expenses(y).total, refunds: billing(y).refunds, receivables: receivables(d).total },
  };
}

/* ---------------------------------------------------------- per-department */

/** For each department: patients, gross, discount, net revenue, collection, due, refunds, cancelled. */
export function departmentSummary(q) {
  const rev = Object.fromEntries(revenue(q).departments.map((d) => [d.segment, d]));
  const lines = all(`SELECT bi.bill_id, coalesce(bi.revenue_head,'OTHER') seg, sum(bi.amount) amt, b.patient_id, b.status, b.total, b.paid, b.balance, b.discount
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE b.bill_date BETWEEN ? AND ? AND bi.category<>'refund' GROUP BY bi.bill_id, seg`, q.from, q.to);
  const billSum = {};
  for (const l of lines) billSum[l.bill_id] = (billSum[l.bill_id] || 0) + l.amt;
  const out = {};
  const row = (s) => (out[s] ||= { segment: s, label: SEGMENT_LABEL[s] || s, patients: new Set(), gross: 0, discount: 0, net: 0, collection: 0, due: 0, refund: 0, cancelled: 0 });
  for (const l of lines) {
    const r = row(l.seg), share = billSum[l.bill_id] ? l.amt / billSum[l.bill_id] : 0;
    if (l.status === 'cancelled') { r.cancelled += l.amt; continue; }
    r.patients.add(l.patient_id);
    r.gross += l.amt; r.discount += (l.discount || 0) * share;
    r.collection += (l.paid || 0) * share; r.due += Math.max(0, l.balance) * share;
  }
  for (const x of all(`SELECT coalesce(bi.revenue_head,'OTHER') seg, sum(-bi.amount) v FROM bill_items bi WHERE bi.category='refund' AND date(bi.created_at) BETWEEN ? AND ? GROUP BY seg`, q.from, q.to)) row(x.seg).refund += x.v;
  return Object.values(out).map((r) => ({ ...r, patients: r.patients.size, gross: r2(r.gross), discount: r2(r.discount), net: rev[r.segment]?.net ?? 0,
    collection: r2(r.collection), due: r2(r.due), refund: r2(r.refund), cancelled: r2(r.cancelled) })).sort((a, b) => b.gross - a.gross);
}

/* --------------------------------------------------------- category view */

export function categoryAnalysis(q) {
  const rows = all(`SELECT coalesce(b.payer_type,'self') cat, count(DISTINCT b.patient_id) patients, sum(b.total + b.discount) gross, sum(b.discount) discount,
      sum(b.covered_amount) approved, sum(b.waived_amount) free, sum(b.paid) collected, sum(CASE WHEN b.balance>0 THEN b.balance ELSE 0 END) outstanding
    FROM bills b WHERE b.status<>'cancelled' AND b.bill_date BETWEEN ? AND ? GROUP BY cat`, q.from, q.to);
  const by = Object.fromEntries(rows.map((r) => [r.cat, r]));
  const payerOpen = Object.fromEntries(all(`SELECT s.mode, sum(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient) v FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
    WHERE s.status IN ('open','partially_settled') AND b.bill_date BETWEEN ? AND ? GROUP BY s.mode`, q.from, q.to).map((r) => [r.mode, r.v]));
  return CATEGORIES.map((c) => {
    const r = by[c] || {};
    return { category: c, label: CATEGORY_LABEL[c], patients: r.patients || 0, gross: r2(r.gross || 0), discount: r2(r.discount || 0),
      approved_claim: r2(r.approved || 0), free_value: r2(r.free || 0), collected: r2(r.collected || 0), outstanding: r2((r.outstanding || 0) + (payerOpen[c] || 0)) };
  });
}

/* ------------------------------------------------------------- inpatients */

/** Daily census for a date; ward transfers move patients between wards but never change the hospital total. */
export function census(d = today()) {
  const start = `${d} 00:00:00`, end = `${d} 23:59:59`;
  const opening = one(`SELECT count(*) FROM admissions WHERE status<>'requested' AND admitted_at < ? AND (discharged_at IS NULL OR discharged_at >= ?)`, start, start) || 0;
  const admissions = one(`SELECT count(*) FROM admissions WHERE status<>'requested' AND admitted_at BETWEEN ? AND ?`, start, end) || 0;
  const discharges = one('SELECT count(*) FROM admissions WHERE discharged_at BETWEEN ? AND ?', start, end) || 0;
  const deaths = one("SELECT count(*) FROM admissions WHERE discharged_at BETWEEN ? AND ? AND discharge_type IN ('death','expired')", start, end) || 0;
  // a bed charge that starts after the admission's first bed is a transfer
  // a bed charge that starts after the admission's first bed is a transfer: out of the previous ward, into the new one
  const transfers = all(`SELECT c.admission_id, c.started_at, wn.name to_ward,
      (SELECT wp.name FROM admission_charges pc LEFT JOIN beds bp ON bp.id=pc.bed_id LEFT JOIN wards wp ON wp.id=bp.ward_id
        WHERE pc.admission_id=c.admission_id AND pc.kind='bed' AND pc.id < c.id ORDER BY pc.id DESC LIMIT 1) from_ward
    FROM admission_charges c LEFT JOIN beds bn ON bn.id=c.bed_id LEFT JOIN wards wn ON wn.id=bn.ward_id
    WHERE c.kind='bed' AND c.started_at BETWEEN ? AND ? AND c.id <> (SELECT min(id) FROM admission_charges x WHERE x.admission_id=c.admission_id AND x.kind='bed')`, start, end);
  const closing = opening + admissions - discharges;
  const wardMove = {};
  for (const t of transfers) {
    if (t.to_ward) (wardMove[t.to_ward] ||= { in: 0, out: 0 }).in++;
    if (t.from_ward) (wardMove[t.from_ward] ||= { in: 0, out: 0 }).out++;
  }
  const wards = all(`SELECT w.id, w.name, w.kind, count(b.id) beds, sum(b.status='occupied') occupied, sum(b.status='blocked') blocked FROM wards w LEFT JOIN beds b ON b.ward_id=w.id GROUP BY w.id ORDER BY w.kind, w.name`)
    .map((w) => ({ ...w, transfers_in: wardMove[w.name]?.in || 0, transfers_out: wardMove[w.name]?.out || 0 }));
  return { date: d, opening, admissions, transfers: transfers.length, discharges, deaths, closing,
    note: 'Ward transfers move a patient between wards (one out, one in) and never change the hospital total.', wards };
}

/** Occupancy = occupied ÷ available; blocked beds are not available. */
export function occupancy() {
  const rows = all(`SELECT w.kind, w.name, count(b.id) total, sum(b.status='occupied') occupied, sum(b.status='blocked') blocked
    FROM wards w LEFT JOIN beds b ON b.ward_id=w.id GROUP BY w.id`);
  const agg = (list) => { const t = list.reduce((s, r) => s + (r.total || 0), 0), bl = list.reduce((s, r) => s + (r.blocked || 0), 0), o = list.reduce((s, r) => s + (r.occupied || 0), 0);
    const avail = t - bl; return { beds: t, blocked: bl, available: avail, occupied: o, pct: avail ? Math.round((o / avail) * 1000) / 10 : 0 }; };
  const kinds = {};
  for (const r of rows) (kinds[r.kind] ||= []).push(r);
  return { hospital: agg(rows), by_kind: Object.entries(kinds).map(([k, list]) => ({ kind: k, ...agg(list) })), by_ward: rows.map((r) => ({ ward: r.name, kind: r.kind, ...agg([r]) })) };
}

/** Average length of stay of patients discharged in the period, overall and by ward. */
export function alos(q) {
  const rows = all(`SELECT a.id, julianday(a.discharged_at) - julianday(a.admitted_at) days, w.name ward, w.kind
    FROM admissions a LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=b.ward_id
    WHERE a.discharged_at IS NOT NULL AND date(a.discharged_at) BETWEEN ? AND ?`, q.from, q.to);
  const avg = (list) => (list.length ? Math.round((list.reduce((s, r) => s + Math.max(r.days, 0), 0) / list.length) * 10) / 10 : 0);
  const wards = {};
  for (const r of rows) (wards[r.ward || 'Unassigned'] ||= []).push(r);
  return { discharged: rows.length, alos: avg(rows), by_ward: Object.entries(wards).map(([ward, list]) => ({ ward, discharged: list.length, alos: avg(list) })) };
}

/* ----------------------------------------------------------- OP analysis */

export function opAnalysis(q) {
  const w = "e.kind='OP' AND e.visit_date BETWEEN ? AND ?";
  const t = get(`SELECT count(*) total, sum(e.visit_type='new') new_visits, sum(e.visit_type<>'new') followups,
      sum(e.payment_status='paid') paid, sum(e.payment_status IN ('free','waived')) free,
      sum(date(p.created_at)=e.visit_date) new_patients, sum(date(p.created_at)<e.visit_date) returning_patients
    FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE ${w}`, q.from, q.to);
  return {
    totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v || 0])),
    by_department: all(`SELECT coalesce(d.name,'Unassigned') label, count(*) value FROM encounters e LEFT JOIN departments d ON d.id=e.department_id WHERE ${w} GROUP BY d.id ORDER BY value DESC`, q.from, q.to),
    by_doctor: all(`SELECT coalesce(u.name,'Unassigned') label, count(*) value FROM encounters e LEFT JOIN users u ON u.id=e.doctor_id WHERE ${w} GROUP BY u.id ORDER BY value DESC`, q.from, q.to),
    hourly: all(`SELECT strftime('%H', e.opened_at) h, count(*) value FROM encounters e WHERE ${w} GROUP BY h ORDER BY h`, q.from, q.to)
      .map((r) => ({ label: `${+r.h}–${+r.h + 1}`, value: r.value })),
  };
}

export function opTrend(to = today(), days = 30) {
  const from = addDays(to, -(days - 1));
  const m = Object.fromEntries(all("SELECT visit_date d, count(*) n, sum(visit_type<>'new') f FROM encounters WHERE kind='OP' AND visit_date BETWEEN ? AND ? GROUP BY visit_date", from, to).map((r) => [r.d, r]));
  return dayList(from, to).map((d) => ({ d, visits: m[d]?.n || 0, followups: m[d]?.f || 0 }));
}

/* -------------------------------------------------- refunds & discounts */

export function refundAnalysis(q) {
  const rows = all(`SELECT r.refund_no, r.created_at, r.amount, r.mode refund_mode, r.reason, b.bill_no, b.bill_type, p.name patient_name,
      (SELECT group_concat(DISTINCT x.mode) FROM payments x WHERE x.bill_id=r.bill_id AND x.amount>0 AND x.cancelled=0) original_modes, u.name approved_by
    FROM refunds r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=r.patient_id LEFT JOIN users u ON u.id=r.approved_by
    WHERE date(r.created_at) BETWEEN ? AND ? ORDER BY r.id DESC`, q.from, q.to);
  return { count: rows.length, amount: r2(rows.reduce((s, r) => s + r.amount, 0)), rows };
}

export function discountAnalysis(q) {
  const rows = all(`SELECT b.bill_no, b.bill_type, b.bill_date, b.total + b.discount gross, b.discount, b.discount_reason reason, p.name patient_name, d.name doctor_name,
      (SELECT a.user_name FROM audit_log a WHERE a.entity='bills' AND a.entity_id=b.id AND a.action='bill.discount' ORDER BY a.id DESC LIMIT 1) given_by,
      (SELECT u.role FROM audit_log a JOIN users u ON u.id=a.user_id WHERE a.entity='bills' AND a.entity_id=b.id AND a.action='bill.discount' ORDER BY a.id DESC LIMIT 1) given_role
    FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
    WHERE b.discount > 0 AND b.status<>'cancelled' AND b.bill_date BETWEEN ? AND ? ORDER BY b.bill_date DESC`, q.from, q.to)
    .map((r) => ({ ...r, pct: r.gross ? Math.round((r.discount / r.gross) * 1000) / 10 : 0,
      kind: /scheme|package|camp/i.test(r.reason || '') ? 'Automatic / scheme' : ['admin', 'owner'].includes(r.given_role) ? 'Management' : 'Manual' }));
  const insurance = r2(one(`SELECT coalesce(sum(disallowed),0) FROM settlement_receipts WHERE disallowance_action='write_off' AND received_on BETWEEN ? AND ?`, q.from, q.to) || 0);
  const by = {};
  for (const r of rows) by[r.kind] = r2((by[r.kind] || 0) + r.discount);
  return { total: r2(rows.reduce((s, r) => s + r.discount, 0)), insurance_adjustment: insurance, by_kind: { ...by, 'Insurance adjustment': insurance }, rows };
}

/* ----------------------------------------------------- payers & schemes */

export function payerAnalysis(q, mode) {
  const s = get(`SELECT count(*) cases, count(DISTINCT patient_id) patients, coalesce(sum(amount),0) value, coalesce(sum(settled_amount),0) received,
      coalesce(sum(written_off),0) disallowed, coalesce(sum(CASE WHEN status IN ('open','partially_settled') THEN amount - settled_amount - written_off - transferred_to_patient ELSE 0 END),0) outstanding,
      sum(status='settled') settled, sum(status='partially_settled') partial, sum(status='open') pending, sum(status='written_off') rejected
    FROM bill_settlements WHERE mode=? AND status<>'cancelled' AND date(created_at) BETWEEN ? AND ?`, mode, q.from, q.to);
  const claims = all(`SELECT status, count(*) n, coalesce(sum(estimate),0) estimate, coalesce(sum(approved),0) approved, coalesce(sum(settled),0) settled, coalesce(sum(disallowed),0) disallowed
    FROM insurance_claims WHERE date(created_at) BETWEEN ? AND ? AND coalesce(payer_type,'insurance')=?
    GROUP BY status`, q.from, q.to, mode);
  return { mode, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v || 0])), claims };
}
