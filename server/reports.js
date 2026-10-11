/**
 * Report centre. Each report is a named query with a permission, the filters
 * it understands and a column list, so the client renders, filters, prints
 * and exports every report the same way.
 *
 * Revenue comes from the journal (what was earned), collections from receipts
 * (what was received), and receivables from account balances (what is owed).
 * The three are never mixed in one number.
 */
import { all, get, one, today, localStamp } from './db.js';
import { can } from './auth.js';
import {
  trialBalance, profitAndLoss, balanceSheet, cashFlow, accountLedger, acct, SEGMENTS, naturalBalance,
} from './accounting.js';
import { range as mrange } from './metrics.js';
import { EXTRA_REPORTS } from './report-defs.js';

const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const MODE_LABEL = {
  cash: 'Cash', upi: 'UPI', debit_card: 'Debit card', credit_card: 'Credit card', card: 'Card',
  bank_transfer: 'Bank transfer', cheque: 'Cheque', insurance: 'Insurance', aarogyasri: 'Aarogyasri',
  corporate: 'Corporate', credit: 'Credit', trust: 'Trust', free: 'Free', due: 'Due', self: 'Normal / cash',
};
export const CATEGORY_LABEL = {
  self: 'Normal / cash', free: 'Free', aarogyasri: 'Aarogyasri', insurance: 'Insurance', credit: 'Credit',
  trust: 'Trust', corporate: 'Corporate', due: 'Due',
};
const SEGMENT_LABEL = {
  OP: 'Outpatient', IP: 'Inpatient', ER: 'Emergency', LAB: 'Laboratory', IMAGING: 'Imaging', PHARMACY: 'Pharmacy',
  PROCEDURE: 'Procedures', OT: 'Operation theatre', ICU: 'ICU', PACKAGE: 'Packages', OTHER: 'Other',
};

const col = (key, label, type = 'text') => ({ key, label, type });
const money = (key, label) => col(key, label, 'money');
const num = (key, label) => col(key, label, 'number');

/* ------------------------------------------------------------ filter SQL */

/** Journal-line filters shared by every revenue query. */
function jlFilter(q, alias = 'l', vAlias = 'v') {
  const w = [`${vAlias}.voucher_date BETWEEN ? AND ?`], a = [q.from, q.to];
  if (q.segment) { w.push(`${alias}.segment = ?`); a.push(q.segment); }
  if (q.category) { w.push(`${alias}.category = ?`); a.push(q.category); }
  if (q.doctor_id) {
    w.push(`${vAlias}.source = 'bill' AND ${vAlias}.source_id IN (SELECT b.id FROM bills b LEFT JOIN encounters e ON e.id=b.encounter_id WHERE coalesce(b.doctor_id,e.doctor_id) = ?)`);
    a.push(+q.doctor_id);
  }
  return { sql: w.join(' AND '), args: a };
}

function paymentFilter(q) {
  const w = ['p.pay_date BETWEEN ? AND ?', 'p.cancelled = 0'], a = [q.from, q.to];
  if (q.mode) { w.push('p.mode = ?'); a.push(q.mode); }
  if (q.category) { w.push('b.payer_type = ?'); a.push(q.category); }
  if (q.doctor_id) { w.push('e.doctor_id = ?'); a.push(+q.doctor_id); }
  if (q.segment) { w.push('EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id=b.id AND bi.revenue_head=?)'); a.push(q.segment); }
  return { sql: w.join(' AND '), args: a };
}
const PAYMENT_FROM = 'payments p LEFT JOIN bills b ON b.id=p.bill_id LEFT JOIN encounters e ON e.id=b.encounter_id';

/* --------------------------------------------------------- shared pieces */

export function revenueBySegment(q) {
  const f = jlFilter(q);
  const rows = all(`SELECT coalesce(l.segment,'OTHER') segment,
      round(sum(CASE WHEN a.subtype='revenue' THEN l.credit - l.debit ELSE 0 END),2) gross,
      round(sum(CASE WHEN a.system_key='discount_allowed' THEN l.debit - l.credit ELSE 0 END),2) discount,
      round(sum(CASE WHEN a.system_key='free_treatment' THEN l.debit - l.credit ELSE 0 END),2) free,
      round(sum(CASE WHEN a.system_key='sales_returns' THEN l.debit - l.credit ELSE 0 END),2) returns
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE a.type='income' AND ${f.sql} GROUP BY coalesce(l.segment,'OTHER')`, ...f.args);
  const by = Object.fromEntries(rows.map((r) => [r.segment, r]));
  return SEGMENTS.map((s) => {
    const r = by[s] || { gross: 0, discount: 0, free: 0, returns: 0 };
    return { segment: s, label: SEGMENT_LABEL[s], gross: r.gross, discount: r.discount, free: r.free, returns: r.returns,
      net: r2(r.gross - r.discount - r.free - r.returns) };
  }).filter((r) => r.gross || r.discount || r.free || r.returns);
}

export function revenueByCategory(q) {
  const f = jlFilter(q);
  return all(`SELECT coalesce(l.category,'self') category,
      round(sum(CASE WHEN a.subtype='revenue' THEN l.credit - l.debit ELSE 0 END),2) gross,
      round(sum(CASE WHEN a.subtype='contra_revenue' THEN l.debit - l.credit ELSE 0 END),2) deductions
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE a.type='income' AND ${f.sql} GROUP BY coalesce(l.category,'self') ORDER BY gross DESC`, ...f.args)
    .map((r) => ({ ...r, label: CATEGORY_LABEL[r.category] || r.category, net: r2(r.gross - r.deductions) }));
}

export function collectionsByMode(q) {
  const f = paymentFilter(q);
  return all(`SELECT p.mode, count(*) receipts, round(sum(CASE WHEN p.amount>0 THEN p.amount ELSE 0 END),2) received,
      round(sum(CASE WHEN p.amount<0 THEN -p.amount ELSE 0 END),2) refunded, round(sum(p.amount),2) net
    FROM ${PAYMENT_FROM} WHERE ${f.sql} GROUP BY p.mode ORDER BY net DESC`, ...f.args)
    .map((r) => ({ ...r, label: MODE_LABEL[r.mode] || r.mode }));
}

const RECEIVABLE_KEYS = [
  ['ar_patient', 'Patient dues'], ['ar_insurance', 'Insurance'], ['ar_aarogyasri', 'Aarogyasri'],
  ['ar_corporate', 'Corporate'], ['ar_credit', 'Credit patients'], ['ar_trust', 'Trust / charity'],
];
export function receivableBalances(asOf = today()) {
  return RECEIVABLE_KEYS.map(([key, label]) => ({
    key, label,
    balance: r2(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
                      WHERE l.account_id=? AND v.voucher_date<=?`, acct(key).id, asOf) || 0),
  }));
}

export function dailyTrend(q) {
  const f = jlFilter(q);
  const rev = all(`SELECT v.voucher_date d, round(sum(l.credit-l.debit),2) revenue
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE a.type='income' AND ${f.sql} GROUP BY v.voucher_date`, ...f.args);
  const exp = all(`SELECT v.voucher_date d, round(sum(l.debit-l.credit),2) expense
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE a.type='expense' AND v.voucher_date BETWEEN ? AND ? GROUP BY v.voucher_date`, q.from, q.to);
  const pf = paymentFilter(q);
  const col_ = all(`SELECT p.pay_date d, round(sum(p.amount),2) collected FROM ${PAYMENT_FROM} WHERE ${pf.sql} GROUP BY p.pay_date`, ...pf.args);
  const days = [];
  for (let d = new Date(`${q.from}T00:00:00`); d <= new Date(`${q.to}T00:00:00`) && days.length < 400; d.setDate(d.getDate() + 1)) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const m = (rows, k) => Object.fromEntries(rows.map((r) => [r.d, r[k]]));
  const R = m(rev, 'revenue'), E = m(exp, 'expense'), C = m(col_, 'collected');
  return days.map((d) => ({ d, revenue: R[d] || 0, expense: E[d] || 0, collected: C[d] || 0, net: r2((R[d] || 0) - (E[d] || 0)) }));
}

function ageBucket(days) {
  return days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
}

/* ---------------------------------------------------------------- catalog */

const FIN = 'finance.view';
const MGMT = 'reports.view';

export const REPORTS = [
  /* management */
  { id: 'revenue_department', group: 'Management', title: 'Revenue by department', perm: MGMT,
    filters: ['range', 'category', 'doctor'],
    run: (q) => {
      const rows = revenueBySegment(q);
      return { columns: [col('label', 'Department'), money('gross', 'Gross'), money('discount', 'Discount'), money('free', 'Free treatment'),
        money('returns', 'Returns'), money('net', 'Net revenue')], rows, total: ['gross', 'discount', 'free', 'returns', 'net'],
        chart: { type: 'bar', x: 'label', series: [{ key: 'net', label: 'Net revenue' }] } };
    } },
  { id: 'revenue_category', group: 'Management', title: 'Revenue by patient category', perm: MGMT,
    filters: ['range', 'segment', 'doctor'],
    run: (q) => ({ columns: [col('label', 'Category'), money('gross', 'Gross'), money('deductions', 'Discount / free / returns'), money('net', 'Net')],
      rows: revenueByCategory(q), total: ['gross', 'deductions', 'net'],
      chart: { type: 'donut', x: 'label', series: [{ key: 'gross', label: 'Gross' }] } }) },
  { id: 'collections_mode', group: 'Management', title: 'Collections by payment mode', perm: MGMT,
    filters: ['range', 'segment', 'category', 'mode', 'doctor'],
    run: (q) => ({ columns: [col('label', 'Mode'), num('receipts', 'Receipts'), money('received', 'Received'), money('refunded', 'Refunded'), money('net', 'Net')],
      rows: collectionsByMode(q), total: ['receipts', 'received', 'refunded', 'net'],
      chart: { type: 'donut', x: 'label', series: [{ key: 'net', label: 'Net' }] } }) },
  { id: 'doctor_revenue', group: 'Management', title: 'Doctor-wise revenue', perm: MGMT,
    filters: ['range', 'segment', 'category'],
    run: (q) => {
      const w = ["v.voucher_date BETWEEN ? AND ?", "a.subtype='revenue'", "v.source='bill'"], args = [q.from, q.to];
      if (q.segment) { w.push('l.segment=?'); args.push(q.segment); }
      if (q.category) { w.push('l.category=?'); args.push(q.category); }
      const rows = all(`SELECT coalesce(u.name,'Unassigned') doctor, coalesce(d.name,'Unassigned') department, count(DISTINCT b.encounter_id) visits,
          round(sum(l.credit - l.debit),2) revenue,
          round(sum(CASE WHEN l.segment IN ('OP','ER') THEN l.credit - l.debit ELSE 0 END),2) consultation,
          round(sum(CASE WHEN l.segment IN ('LAB','IMAGING') THEN l.credit - l.debit ELSE 0 END),2) diagnostics
        FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
        JOIN bills b ON b.id=v.source_id LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN users u ON u.id=coalesce(b.doctor_id,e.doctor_id) LEFT JOIN departments d ON d.id=u.department_id
        WHERE ${w.join(' AND ')} GROUP BY u.id ORDER BY revenue DESC`, ...args);
      return { columns: [col('doctor', 'Doctor'), col('department', 'Department'), num('visits', 'Visits'), money('consultation', 'Consultation'), money('diagnostics', 'Diagnostics'),
        money('revenue', 'Total revenue')], rows, total: ['visits', 'consultation', 'diagnostics', 'revenue'],
        chart: { type: 'bar', x: 'doctor', series: [{ key: 'revenue', label: 'Revenue' }] } };
    } },
  { id: 'daily_trend', group: 'Management', title: 'Daily revenue, collection & expense', perm: MGMT,
    filters: ['range', 'segment', 'category'],
    run: (q) => ({ columns: [col('d', 'Date', 'date'), money('revenue', 'Revenue'), money('collected', 'Collected'), money('expense', 'Expense'), money('net', 'Revenue − expense')],
      rows: dailyTrend(q), total: ['revenue', 'collected', 'expense', 'net'],
      chart: { type: 'line', x: 'd', series: [{ key: 'revenue', label: 'Revenue' }, { key: 'collected', label: 'Collected' }, { key: 'expense', label: 'Expense' }] } }) },
  { id: 'expense_category', group: 'Management', title: 'Expenses by category', perm: MGMT,
    filters: ['range', 'segment'],
    run: (q) => {
      const w = ["v.voucher_date BETWEEN ? AND ?", "a.type='expense'"], args = [q.from, q.to];
      if (q.segment) { w.push('l.segment=?'); args.push(q.segment); }
      const rows = all(`SELECT a.code, a.name, a.subtype, round(sum(l.debit-l.credit),2) amount
        FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
        WHERE ${w.join(' AND ')} GROUP BY a.id HAVING abs(amount) >= 0.01 ORDER BY amount DESC`, ...args);
      return { columns: [col('code', 'Code'), col('name', 'Expense head'), money('amount', 'Amount')], rows, total: ['amount'],
        chart: { type: 'bar', x: 'name', series: [{ key: 'amount', label: 'Amount' }] } };
    } },
  { id: 'receivables_summary', group: 'Management', title: 'Receivables by type', perm: MGMT, filters: ['asof'],
    run: (q) => ({ columns: [col('label', 'Receivable'), money('balance', 'Outstanding')], rows: receivableBalances(q.to), total: ['balance'],
      chart: { type: 'bar', x: 'label', series: [{ key: 'balance', label: 'Outstanding' }] } }) },
  { id: 'op_ip_stats', group: 'Patients', title: 'OP / IP / ER statistics', perm: MGMT, filters: ['range', 'doctor'],
    run: (q) => {
      const w = ['visit_date BETWEEN ? AND ?'], args = [q.from, q.to];
      if (q.doctor_id) { w.push('doctor_id=?'); args.push(+q.doctor_id); }
      const rows = all(`SELECT visit_date d, sum(kind='OP') op, sum(kind='OP' AND visit_type='new') op_new,
          sum(kind='OP' AND visit_type<>'new') op_followup, sum(kind='EMG') er,
          (SELECT count(*) FROM admissions a WHERE date(a.admitted_at)=visit_date) admissions,
          (SELECT count(*) FROM admissions a WHERE date(a.discharged_at)=visit_date) discharges
        FROM encounters WHERE ${w.join(' AND ')} GROUP BY visit_date ORDER BY visit_date`, ...args);
      return { columns: [col('d', 'Date', 'date'), num('op', 'OP'), num('op_new', 'New'), num('op_followup', 'Follow-up'), num('er', 'ER'),
        num('admissions', 'Admissions'), num('discharges', 'Discharges')], rows,
        total: ['op', 'op_new', 'op_followup', 'er', 'admissions', 'discharges'],
        chart: { type: 'bar', x: 'd', stacked: true, series: [{ key: 'op', label: 'OP' }, { key: 'er', label: 'ER' }, { key: 'admissions', label: 'Admissions' }] } };
    } },
  { id: 'patient_category', group: 'Patients', title: 'Patients by financial category', perm: MGMT, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT coalesce(b.payer_type,'self') category, count(DISTINCT b.patient_id) patients, count(*) bills,
          round(sum(b.total),2) billed, round(sum(b.paid),2) collected, round(sum(b.covered_amount),2) covered,
          round(sum(b.waived_amount),2) free, round(sum(b.balance),2) due
        FROM bills b WHERE b.bill_date BETWEEN ? AND ? AND b.status<>'cancelled' GROUP BY coalesce(b.payer_type,'self')
        ORDER BY billed DESC`, q.from, q.to).map((r) => ({ ...r, label: CATEGORY_LABEL[r.category] || r.category }));
      return { columns: [col('label', 'Category'), num('patients', 'Patients'), num('bills', 'Bills'), money('billed', 'Billed'),
        money('collected', 'Collected'), money('covered', 'Payer covered'), money('free', 'Free'), money('due', 'Due')], rows,
        total: ['patients', 'bills', 'billed', 'collected', 'covered', 'free', 'due'],
        chart: { type: 'donut', x: 'label', series: [{ key: 'patients', label: 'Patients' }] } };
    } },
  { id: 'op_register', group: 'Patients', title: 'OP register', perm: MGMT, filters: ['range', 'doctor', 'category'],
    run: (q) => {
      const w = ["e.visit_date BETWEEN ? AND ?", "e.kind IN ('OP','EMG')"], args = [q.from, q.to];
      if (q.doctor_id) { w.push('e.doctor_id=?'); args.push(+q.doctor_id); }
      if (q.category) { w.push('p.payer_type=?'); args.push(q.category); }
      const rows = all(`SELECT e.visit_date d, e.encounter_no, p.uhid, p.name patient, e.kind, e.visit_type, u.name doctor,
          e.stage, e.payment_status, p.payer_type category,
          (SELECT round(coalesce(sum(total),0),2) FROM bills b WHERE b.encounter_id=e.id AND b.status<>'cancelled') billed
        FROM encounters e JOIN patients p ON p.id=e.patient_id LEFT JOIN users u ON u.id=e.doctor_id
        WHERE ${w.join(' AND ')} ORDER BY e.id DESC LIMIT 2000`, ...args);
      return { columns: [col('d', 'Date', 'date'), col('encounter_no', 'Visit'), col('uhid', 'UHID'), col('patient', 'Patient'), col('kind', 'Type'),
        col('visit_type', 'Visit'), col('doctor', 'Doctor'), col('stage', 'Stage'), col('payment_status', 'Payment'), col('category', 'Category'),
        money('billed', 'Billed')], rows, total: ['billed'] };
    } },
  { id: 'ip_register', group: 'Patients', title: 'IP register', perm: MGMT, filters: ['range', 'doctor', 'category'],
    run: (q) => {
      const w = ['date(a.admitted_at) <= ?', "(a.discharged_at IS NULL OR date(a.discharged_at) >= ?)"], args = [q.to, q.from];
      if (q.doctor_id) { w.push('a.consultant_id=?'); args.push(+q.doctor_id); }
      if (q.category) { w.push('a.financial_category=?'); args.push(q.category); }
      const rows = all(`SELECT a.ip_no, p.uhid, p.name patient, u.name consultant, date(a.admitted_at) admitted, date(a.discharged_at) discharged,
          a.status, a.financial_category category, bd.bed_no bed,
          round(julianday(coalesce(a.discharged_at, datetime('now','localtime'))) - julianday(a.admitted_at),1) los,
          (SELECT round(coalesce(sum(total),0),2) FROM bills b WHERE b.encounter_id=a.encounter_id AND b.status<>'cancelled') billed,
          (SELECT round(coalesce(sum(balance),0),2) FROM bills b WHERE b.encounter_id=a.encounter_id AND b.status<>'cancelled') balance
        FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id LEFT JOIN beds bd ON bd.id=a.bed_id
        WHERE ${w.join(' AND ')} ORDER BY a.id DESC`, ...args);
      return { columns: [col('ip_no', 'IP no'), col('uhid', 'UHID'), col('patient', 'Patient'), col('consultant', 'Consultant'), col('bed', 'Bed'),
        col('admitted', 'Admitted', 'date'), col('discharged', 'Discharged', 'date'), num('los', 'LOS (days)'), col('category', 'Category'),
        col('status', 'Status'), money('billed', 'Billed'), money('balance', 'Balance')], rows, total: ['billed', 'balance'] };
    } },
  { id: 'free_treatment', group: 'Patients', title: 'Free treatment register', perm: MGMT, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT date(s.created_at) d, s.settlement_no, b.bill_no, p.uhid, p.name patient, s.amount, s.reason, u.name approved_by
        FROM bill_settlements s JOIN bills b ON b.id=s.bill_id JOIN patients p ON p.id=s.patient_id LEFT JOIN users u ON u.id=s.created_by
        WHERE s.mode='free' AND s.status<>'cancelled' AND date(s.created_at) BETWEEN ? AND ? ORDER BY s.id DESC`, q.from, q.to);
      return { columns: [col('d', 'Date', 'date'), col('settlement_no', 'Ref'), col('bill_no', 'Bill'), col('uhid', 'UHID'), col('patient', 'Patient'),
        money('amount', 'Value of free treatment'), col('reason', 'Reason'), col('approved_by', 'Approved by')], rows, total: ['amount'] };
    } },

  /* finance */
  { id: 'day_book', group: 'Finance', title: 'Day book', perm: FIN, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT v.voucher_date d, v.voucher_no, v.voucher_type type, a.name account, l.debit, l.credit,
          coalesce(l.memo, v.narration) narration, v.status
        FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
        WHERE v.voucher_date BETWEEN ? AND ? ORDER BY v.voucher_date, v.id, l.debit DESC LIMIT 5000`, q.from, q.to);
      return { columns: [col('d', 'Date', 'date'), col('voucher_no', 'Voucher'), col('type', 'Type'), col('account', 'Account'),
        money('debit', 'Debit'), money('credit', 'Credit'), col('narration', 'Narration')], rows, total: ['debit', 'credit'] };
    } },
  { id: 'cash_book', group: 'Finance', title: 'Cash book', perm: FIN, filters: ['range'],
    run: (q) => bookReport('cash', q) },
  { id: 'bank_book', group: 'Finance', title: 'Bank book', perm: FIN, filters: ['range'],
    run: (q) => bookReport('bank', q) },
  { id: 'ledger', group: 'Finance', title: 'Account ledger', perm: FIN, filters: ['range', 'account'],
    run: (q) => {
      if (!q.account_id) return { columns: [], rows: [], note: 'Choose an account to see its ledger.' };
      const L = accountLedger(+q.account_id, q.from, q.to);
      return { subtitle: `${L.account.code} · ${L.account.name} · opening ${L.opening.toFixed(2)} · closing ${L.closing.toFixed(2)}`,
        columns: [col('voucher_date', 'Date', 'date'), col('voucher_no', 'Voucher'), col('narration', 'Narration'), col('segment', 'Segment'),
          money('debit', 'Debit'), money('credit', 'Credit'), money('balance', 'Balance')], rows: L.lines, total: ['debit', 'credit'] };
    } },
  { id: 'trial_balance', group: 'Finance', title: 'Trial balance', perm: FIN, filters: ['range'],
    run: (q) => {
      const rows = trialBalance(q.from, q.to).filter((r) => r.opening || r.debit || r.credit);
      return { columns: [col('code', 'Code'), col('name', 'Account'), col('type', 'Type'), money('opening', 'Opening'), money('debit', 'Debit'),
        money('credit', 'Credit'), money('closing_dr', 'Closing Dr'), money('closing_cr', 'Closing Cr')], rows,
        total: ['debit', 'credit', 'closing_dr', 'closing_cr'] };
    } },
  { id: 'profit_loss', group: 'Finance', title: 'Profit & loss', perm: FIN, filters: ['range'],
    run: (q) => {
      const p = profitAndLoss(q.from, q.to);
      const rows = [
        { section: 'Revenue', name: 'Gross revenue', amount: p.totals.grossRevenue, bold: 1 },
        ...p.income.map((r) => ({ section: '', name: r.name, amount: r.amount })),
        { section: 'Less', name: 'Discounts, free treatment, returns', amount: -p.totals.deductions, bold: 1 },
        ...p.deductions.map((r) => ({ section: '', name: r.name, amount: -r.amount })),
        { section: '', name: 'Net revenue', amount: p.totals.netRevenue, bold: 1 },
        { section: 'Direct costs', name: 'Cost of sales', amount: -p.totals.directCost, bold: 1 },
        ...p.cogs.map((r) => ({ section: '', name: r.name, amount: -r.amount })),
        { section: '', name: 'Gross profit', amount: p.totals.grossProfit, bold: 1 },
        { section: 'Expenses', name: 'Operating expenses', amount: -p.totals.opex, bold: 1 },
        ...p.expenses.filter((r) => r.amount).map((r) => ({ section: '', name: r.name, amount: -r.amount })),
        { section: 'Result', name: p.totals.netResult >= 0 ? 'Net profit' : 'Net loss', amount: p.totals.netResult, bold: 1 },
      ];
      return { columns: [col('section', ''), col('name', 'Particulars'), money('amount', 'Amount')], rows, statement: true };
    } },
  { id: 'balance_sheet', group: 'Finance', title: 'Balance sheet', perm: FIN, filters: ['asof'],
    run: (q) => {
      const b = balanceSheet(q.to);
      const rows = [
        { section: 'Assets', name: 'Total assets', amount: b.totals.assets, bold: 1 }, ...b.assets.map((r) => ({ section: '', ...r })),
        { section: 'Liabilities', name: 'Total liabilities', amount: b.totals.liabilities, bold: 1 }, ...b.liabilities.map((r) => ({ section: '', ...r })),
        { section: 'Equity', name: 'Total equity', amount: b.totals.equity, bold: 1 }, ...b.equity.map((r) => ({ section: '', ...r })),
        { section: '', name: 'Profit to date (unappropriated)', amount: b.currentProfit },
        { section: 'Check', name: b.totals.balanced ? 'Assets = Liabilities + Equity' : 'NOT BALANCED — check postings', amount: b.totals.liabilitiesAndEquity, bold: 1 },
      ];
      return { subtitle: `As of ${b.asOf}`, columns: [col('section', ''), col('name', 'Particulars'), money('amount', 'Amount')], rows, statement: true };
    } },
  { id: 'cash_flow', group: 'Finance', title: 'Cash flow statement', perm: FIN, filters: ['range'],
    run: (q) => {
      const c = cashFlow(q.from, q.to);
      const rows = [{ section: 'Opening', name: 'Cash, bank & clearing at start', amount: c.opening, bold: 1 }];
      for (const g of c.groups) {
        rows.push({ section: g.group, name: `Net ${g.group.toLowerCase()} cash flow`, amount: g.net, bold: 1 });
        for (const i of g.items) rows.push({ section: '', name: i.label, amount: i.amount });
      }
      rows.push({ section: 'Closing', name: 'Cash, bank & clearing at end', amount: c.closing, bold: 1 });
      return { columns: [col('section', ''), col('name', 'Particulars'), money('amount', 'Amount')], rows, statement: true };
    } },
  { id: 'ar_ageing', group: 'Finance', title: 'Receivables ageing', perm: FIN, filters: ['asof', 'category'],
    run: (q) => {
      const payer = all(`SELECT s.mode category, s.payer_name party, s.settlement_no ref, b.bill_no, p.name patient,
          date(s.created_at) since, round(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient,2) open
        FROM bill_settlements s JOIN bills b ON b.id=s.bill_id JOIN patients p ON p.id=s.patient_id
        WHERE s.mode NOT IN ('free','due') AND s.status IN ('open','partially_settled') AND date(s.created_at) <= ?
          ${q.category ? 'AND s.mode=?' : ''}`, q.to, ...(q.category ? [q.category] : []));
      const dues = (!q.category || q.category === 'due' || q.category === 'self') ? all(`SELECT 'patient' category, p.name party, b.bill_no ref,
          b.bill_no, p.name patient, b.bill_date since, b.balance open
        FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.balance > 0.005 AND b.status NOT IN ('cancelled') AND b.bill_date <= ?`, q.to) : [];
      const rows = [...payer, ...dues].map((r) => {
        const age = Math.max(0, Math.floor((new Date(q.to) - new Date(r.since)) / 86400000));
        const b = ageBucket(age);
        return { ...r, label: CATEGORY_LABEL[r.category] || (r.category === 'patient' ? 'Patient due' : r.category), age,
          d0_30: b === 'd0_30' ? r.open : 0, d31_60: b === 'd31_60' ? r.open : 0, d61_90: b === 'd61_90' ? r.open : 0, d90_plus: b === 'd90_plus' ? r.open : 0 };
      }).sort((a, b) => b.age - a.age);
      return { columns: [col('label', 'Type'), col('party', 'Payer / patient'), col('ref', 'Ref'), col('patient', 'Patient'), col('since', 'Since', 'date'),
        num('age', 'Days'), money('d0_30', '0–30'), money('d31_60', '31–60'), money('d61_90', '61–90'), money('d90_plus', '90+'), money('open', 'Outstanding')],
        rows, total: ['d0_30', 'd31_60', 'd61_90', 'd90_plus', 'open'] };
    } },
  { id: 'ap_ageing', group: 'Finance', title: 'Payables ageing (suppliers)', perm: FIN, filters: ['asof'],
    run: (q) => {
      const rows = all(`SELECT s.name supplier, p.grn_no, p.invoice_no, date(p.received_at) received, round(p.total - p.paid,2) open
        FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.total - p.paid > 0.005 AND date(p.received_at) <= ?
        ORDER BY p.received_at`, q.to).map((r) => {
        const age = Math.max(0, Math.floor((new Date(q.to) - new Date(r.received)) / 86400000));
        const b = ageBucket(age);
        return { ...r, age, d0_30: b === 'd0_30' ? r.open : 0, d31_60: b === 'd31_60' ? r.open : 0, d61_90: b === 'd61_90' ? r.open : 0, d90_plus: b === 'd90_plus' ? r.open : 0 };
      });
      return { columns: [col('supplier', 'Supplier'), col('grn_no', 'GRN'), col('invoice_no', 'Invoice'), col('received', 'Received', 'date'), num('age', 'Days'),
        money('d0_30', '0–30'), money('d31_60', '31–60'), money('d61_90', '61–90'), money('d90_plus', '90+'), money('open', 'Outstanding')],
        rows, total: ['d0_30', 'd31_60', 'd61_90', 'd90_plus', 'open'] };
    } },
  { id: 'mode_reconciliation', group: 'Finance', title: 'Payment-mode reconciliation', perm: FIN, filters: ['range'],
    run: (q) => ({ columns: [col('label', 'Mode'), col('account', 'Books account'), money('collected', 'Collected (receipts)'),
      money('posted', 'Posted to account'), money('difference', 'Difference'), money('settled', 'Moved to bank'), money('pending', 'Awaiting bank credit')],
      rows: modeReconciliation(q), total: ['collected', 'posted', 'difference', 'settled', 'pending'] }) },
  { id: 'gst_summary', group: 'Finance', title: 'GST summary (input vs output)', perm: FIN, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT a.name, a.subtype, round(sum(l.debit),2) debit, round(sum(l.credit),2) credit
        FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
        WHERE a.subtype IN ('tax_input','tax_output') AND v.voucher_date BETWEEN ? AND ? GROUP BY a.id ORDER BY a.code`, q.from, q.to)
        .map((r) => ({ ...r, net: r.subtype === 'tax_input' ? r2(r.debit - r.credit) : r2(r.credit - r.debit) }));
      const input = r2(rows.filter((r) => r.subtype === 'tax_input').reduce((s, r) => s + r.net, 0));
      const output = r2(rows.filter((r) => r.subtype === 'tax_output').reduce((s, r) => s + r.net, 0));
      rows.push({ name: output >= input ? 'Net GST payable' : 'Net input credit carried', subtype: '', debit: 0, credit: 0, net: r2(Math.abs(output - input)), bold: 1 });
      return { columns: [col('name', 'Account'), money('debit', 'Debit'), money('credit', 'Credit'), money('net', 'Net')], rows };
    } },
  { id: 'patient_dues', group: 'Finance', title: 'Outstanding patient dues', perm: FIN, filters: ['asof', 'category'],
    run: (q) => {
      const rows = all(`SELECT b.bill_no, b.bill_date, b.bill_type, p.uhid, p.name patient, p.mobile, b.payer_type category, b.total, b.paid,
          b.covered_amount covered, b.balance, b.authorization_status auth
        FROM bills b JOIN patients p ON p.id=b.patient_id
        WHERE b.balance > 0.005 AND b.status<>'cancelled' AND b.bill_date <= ? ${q.category ? 'AND b.payer_type=?' : ''}
        ORDER BY b.bill_date`, q.to, ...(q.category ? [q.category] : []));
      return { columns: [col('bill_no', 'Bill'), col('bill_date', 'Date', 'date'), col('bill_type', 'Type'), col('uhid', 'UHID'), col('patient', 'Patient'),
        col('mobile', 'Mobile'), col('category', 'Category'), money('total', 'Total'), money('paid', 'Paid'), money('covered', 'Covered'),
        money('balance', 'Due'), col('auth', 'Approval')], rows, total: ['total', 'paid', 'covered', 'balance'] };
    } },
];

function bookReport(kind, q) {
  const keys = kind === 'cash' ? ['cash', 'petty_cash'] : ['bank', 'upi_clearing', 'card_clearing', 'cheque_clearing'];
  const ids = keys.map((k) => acct(k).id);
  const opening = r2(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
                           WHERE l.account_id IN (${ids.join(',')}) AND v.voucher_date < ?`, q.from) || 0);
  const lines = all(`SELECT v.voucher_date d, v.voucher_no, a.name account, v.narration, l.debit receipt, l.credit payment
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE l.account_id IN (${ids.join(',')}) AND v.voucher_date BETWEEN ? AND ? ORDER BY v.voucher_date, v.id`, q.from, q.to);
  let bal = opening;
  const rows = lines.map((r) => { bal = r2(bal + r.receipt - r.payment); return { ...r, balance: bal }; });
  return { subtitle: `Opening ${opening.toFixed(2)} · closing ${bal.toFixed(2)}`,
    columns: [col('d', 'Date', 'date'), col('voucher_no', 'Voucher'), col('account', 'Account'), col('narration', 'Narration'),
      money('receipt', 'Receipt'), money('payment', 'Payment'), money('balance', 'Balance')], rows, total: ['receipt', 'payment'] };
}

export function modeReconciliation(q) {
  const modes = [['cash', 'Cash', 'cash', ['cash']], ['upi', 'UPI', 'upi_clearing', ['upi']], ['card', 'Cards', 'card_clearing', ['card', 'debit_card', 'credit_card']], ['bank_transfer', 'Bank transfer', 'bank', ['bank_transfer']], ['cheque', 'Cheque', 'cheque_clearing', ['cheque']]];
  return modes.map(([mode, label, key, values]) => {
    const placeholders = values.map(() => '?').join(',');
    const patient = r2(one('SELECT coalesce(sum(amount),0) FROM payments WHERE mode IN (' + placeholders + ') AND cancelled=0 AND pay_date BETWEEN ? AND ?', ...values, q.from, q.to) || 0);
    const payer = r2(one('SELECT coalesce(sum(amount),0) FROM settlement_receipts WHERE mode IN (' + placeholders + ') AND received_on BETWEEN ? AND ?', ...values, q.from, q.to) || 0);
    const collected = r2(patient + payer), a = acct(key);
    const posted = r2(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.account_id=? AND ((v.source='payment' AND v.source_id IN (SELECT id FROM payments WHERE mode IN (${placeholders}) AND pay_date BETWEEN ? AND ?)) OR (v.source='settlement_receipt' AND v.source_id IN (SELECT id FROM settlement_receipts WHERE mode IN (${placeholders}) AND received_on BETWEEN ? AND ?)))`, a.id, ...values, q.from, q.to, ...values, q.from, q.to) || 0);
    const clearing = key.endsWith('clearing');
    const settled = clearing ? r2(one("SELECT coalesce(sum(l.credit-l.debit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.account_id=? AND v.source='clearing' AND v.voucher_date BETWEEN ? AND ?", a.id, q.from, q.to) || 0) : 0;
    const pending = clearing ? r2(one('SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.account_id=? AND v.voucher_date <= ?', a.id, q.to) || 0) : 0;
    return { mode, label, account: a.name, patient, payer, collected, posted, difference: r2(collected - posted), settled, pending };
  }).filter(r => r.collected || r.posted || r.pending);
}

/* ---------------------------------------------------------------- running */

export function presetRange(preset, from, to) {
  if (['7d', '30d', 'fy', 'custom'].includes(preset)) return mrange(preset, from, to);
  const d = new Date();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const t = iso(d);
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'yesterday': { const y = new Date(d); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    case 'week': { const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return { from: iso(s), to: t }; }
    case 'month': return { from: `${t.slice(0, 8)}01`, to: t };
    case 'last_month': { const s = new Date(d.getFullYear(), d.getMonth() - 1, 1), e = new Date(d.getFullYear(), d.getMonth(), 0); return { from: iso(s), to: iso(e) }; }
    case 'year': { const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return { from: `${fyStart}-04-01`, to: t }; }
    default: return { from: from || `${t.slice(0, 8)}01`, to: to || t };
  }
}

REPORTS.push(...EXTRA_REPORTS);

export function catalog(user) {
  return REPORTS.filter((r) => can(user, r.perm)).map(({ id, group, title, filters }) => ({ id, group, title, filters }));
}

export function runReport(user, id, query) {
  const r = REPORTS.find((x) => x.id === id);
  if (!r) return { error: 'report_not_found', status: 404 };
  if (!can(user, r.perm)) return { error: 'forbidden', status: 403 };
  const range = presetRange(query.preset, query.from, query.to);
  const q = {
    ...range,
    segment: SEGMENTS.includes(query.segment) ? query.segment : null,
    category: query.category && query.category !== 'all' ? String(query.category) : null,
    mode: query.mode && query.mode !== 'all' ? String(query.mode) : null,
    doctor_id: query.doctor_id && query.doctor_id !== 'all' ? +query.doctor_id : null,
    account_id: query.account_id ? +query.account_id : null,
  };
  if (query.department) q.department = String(query.department);
  const out = r.run(q, user);
  const totals = {};
  for (const k of out.total || []) totals[k] = r2(out.rows.reduce((s, row) => s + (+row[k] || 0), 0));
  return { id, title: r.title, group: r.group, filters: r.filters, ...q, generated_at: localStamp(), ...out, totals };
}

export { naturalBalance, SEGMENT_LABEL, MODE_LABEL };
