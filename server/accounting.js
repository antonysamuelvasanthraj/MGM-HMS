/**
 * Double-entry accounting.
 *
 * Every financial event in the hospital posts a balanced voucher through
 * `postVoucher`. Business code never writes journal lines directly; it calls
 * one of the posting rules below, which know which accounts move.
 *
 * Revenue follows the bill, not the cash: raising a charge debits the patient
 * receivable and credits the department's revenue; receiving money moves the
 * receivable into cash or bank; a payer taking over a balance moves it into
 * that payer's receivable. Free treatment is written off against a contra
 * revenue account, so it is visible at full value but is never counted as
 * money collected.
 */
import { all, get, one, insert, update, run, nextNo, today } from './db.js';
import { currentUser } from './context.js';

const round2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------ chart of accounts */

// [code, name, type, subtype, parent, system_key, is_group]
export const CHART = [
  ['1000', 'Assets', 'asset', null, null, null, 1],
  ['1100', 'Cash in Hand', 'asset', 'cash', '1000', 'cash', 0],
  ['1110', 'Petty Cash', 'asset', 'cash', '1000', 'petty_cash', 0],
  ['1200', 'Bank — Current Account', 'asset', 'bank', '1000', 'bank', 0],
  ['1210', 'UPI Settlement Clearing', 'asset', 'clearing', '1000', 'upi_clearing', 0],
  ['1220', 'Card Settlement Clearing', 'asset', 'clearing', '1000', 'card_clearing', 0],
  ['1230', 'Cheques in Hand', 'asset', 'clearing', '1000', 'cheque_clearing', 0],
  ['1300', 'Receivables', 'asset', null, '1000', null, 1],
  ['1310', 'Patient Receivable', 'asset', 'receivable', '1300', 'ar_patient', 0],
  ['1320', 'Insurance Receivable', 'asset', 'receivable', '1300', 'ar_insurance', 0],
  ['1330', 'Aarogyasri Receivable', 'asset', 'receivable', '1300', 'ar_aarogyasri', 0],
  ['1340', 'Corporate Receivable', 'asset', 'receivable', '1300', 'ar_corporate', 0],
  ['1350', 'Credit Patients Receivable', 'asset', 'receivable', '1300', 'ar_credit', 0],
  ['1360', 'Trust / Charity Receivable', 'asset', 'receivable', '1300', 'ar_trust', 0],
  ['1400', 'Inventory', 'asset', null, '1000', null, 1],
  ['1410', 'Pharmacy Inventory', 'asset', 'inventory', '1400', 'inventory_pharmacy', 0],
  ['1420', 'Consumables Inventory', 'asset', 'inventory', '1400', 'inventory_consumables', 0],
  ['1500', 'GST Input Credit', 'asset', null, '1000', null, 1],
  ['1510', 'Input CGST', 'asset', 'tax_input', '1500', 'gst_in_cgst', 0],
  ['1520', 'Input SGST', 'asset', 'tax_input', '1500', 'gst_in_sgst', 0],
  ['1530', 'Input IGST', 'asset', 'tax_input', '1500', 'gst_in_igst', 0],
  ['1600', 'Advances & Deposits', 'asset', null, '1000', null, 1],
  ['1610', 'Staff Advances', 'asset', 'advance', '1600', 'staff_advances', 0],
  ['1620', 'Supplier Advances', 'asset', 'advance', '1600', 'supplier_advances', 0],
  ['1630', 'Security Deposits', 'asset', 'advance', '1600', 'security_deposits', 0],
  ['1700', 'Fixed Assets', 'asset', null, '1000', null, 1],
  ['1710', 'Medical Equipment', 'asset', 'fixed_asset', '1700', 'fa_equipment', 0],
  ['1720', 'Furniture & Fixtures', 'asset', 'fixed_asset', '1700', 'fa_furniture', 0],
  ['1730', 'Computers & IT Equipment', 'asset', 'fixed_asset', '1700', 'fa_it', 0],
  ['1740', 'Vehicles & Ambulance', 'asset', 'fixed_asset', '1700', 'fa_vehicles', 0],
  ['1750', 'Building & Civil Works', 'asset', 'fixed_asset', '1700', 'fa_building', 0],

  ['2000', 'Liabilities', 'liability', null, null, null, 1],
  ['2100', 'Supplier Payables', 'liability', 'payable', '2000', 'ap_suppliers', 0],
  ['2200', 'Accrued Expenses', 'liability', 'accrual', '2000', 'accrued_expenses', 0],
  ['2300', 'Patient Advances & Deposits', 'liability', 'advance', '2000', 'patient_advances', 0],
  ['2400', 'GST Output', 'liability', null, '2000', null, 1],
  ['2410', 'Output CGST', 'liability', 'tax_output', '2400', 'gst_out_cgst', 0],
  ['2420', 'Output SGST', 'liability', 'tax_output', '2400', 'gst_out_sgst', 0],
  ['2430', 'Output IGST', 'liability', 'tax_output', '2400', 'gst_out_igst', 0],
  ['2500', 'Salaries Payable', 'liability', 'accrual', '2000', 'salaries_payable', 0],
  ['2600', 'TDS & Statutory Payables', 'liability', 'accrual', '2000', 'statutory_payable', 0],
  ['2700', 'Visiting Doctors Payable', 'liability', 'payable', '2000', 'visiting_payable', 0],

  ['3000', 'Equity', 'equity', null, null, null, 1],
  ['3100', 'Capital Account', 'equity', 'equity', '3000', 'capital', 0],
  ['3200', 'Retained Earnings', 'equity', 'equity', '3000', 'retained_earnings', 0],
  ['3300', 'Opening Balance Equity', 'equity', 'equity', '3000', 'opening_equity', 0],

  ['4000', 'Income', 'income', null, null, null, 1],
  ['4100', 'OP Consultation Revenue', 'income', 'revenue', '4000', 'rev_op', 0],
  ['4110', 'Emergency Revenue', 'income', 'revenue', '4000', 'rev_er', 0],
  ['4200', 'Inpatient Revenue', 'income', 'revenue', '4000', 'rev_ip', 0],
  ['4210', 'ICU Revenue', 'income', 'revenue', '4000', 'rev_icu', 0],
  ['4300', 'Laboratory Revenue', 'income', 'revenue', '4000', 'rev_lab', 0],
  ['4400', 'Imaging Revenue', 'income', 'revenue', '4000', 'rev_imaging', 0],
  ['4500', 'Pharmacy Sales', 'income', 'revenue', '4000', 'rev_pharmacy', 0],
  ['4600', 'Procedure Revenue', 'income', 'revenue', '4000', 'rev_procedure', 0],
  ['4610', 'Operation Theatre Revenue', 'income', 'revenue', '4000', 'rev_ot', 0],
  ['4700', 'Package Revenue', 'income', 'revenue', '4000', 'rev_package', 0],
  ['4620', 'Room / Bed Charges', 'income', 'revenue', '4000', 'rev_room', 0],
  ['4630', 'Nursing Charges', 'income', 'revenue', '4000', 'rev_nursing', 0],
  ['4900', 'Other Operating Income', 'income', 'revenue', '4000', 'rev_other', 0],
  ['4950', 'Less: Discounts Allowed', 'income', 'contra_revenue', '4000', 'discount_allowed', 0],
  ['4960', 'Less: Free Treatment (Charity)', 'income', 'contra_revenue', '4000', 'free_treatment', 0],
  ['4970', 'Less: Returns & Refunds', 'income', 'contra_revenue', '4000', 'sales_returns', 0],
  ['4975', 'Less: Package adjustments', 'income', 'contra_revenue', '4000', 'package_adjustment', 0],

  ['5000', 'Direct Costs', 'expense', null, null, null, 1],
  ['5100', 'Cost of Medicines Sold', 'expense', 'cogs', '5000', 'cogs_pharmacy', 0],
  ['5200', 'Consumables Used', 'expense', 'cogs', '5000', 'cogs_consumables', 0],

  ['6000', 'Operating Expenses', 'expense', null, null, null, 1],
  ['6100', 'Salaries & Wages', 'expense', 'expense', '6000', 'exp_salaries', 0],
  ['6110', 'Doctor Professional Fees', 'expense', 'expense', '6000', 'exp_doctor_fees', 0],
  ['6200', 'Electricity', 'expense', 'expense', '6000', 'exp_electricity', 0],
  ['6210', 'Water', 'expense', 'expense', '6000', 'exp_water', 0],
  ['6300', 'Rent', 'expense', 'expense', '6000', 'exp_rent', 0],
  ['6400', 'Medical Consumables', 'expense', 'expense', '6000', 'exp_consumables', 0],
  ['6500', 'Housekeeping', 'expense', 'expense', '6000', 'exp_housekeeping', 0],
  ['6510', 'Biomedical Waste Disposal', 'expense', 'expense', '6000', 'exp_biowaste', 0],
  ['6600', 'Equipment Maintenance & AMC', 'expense', 'expense', '6000', 'exp_maintenance', 0],
  ['6700', 'Marketing', 'expense', 'expense', '6000', 'exp_marketing', 0],
  ['6800', 'Fuel & Ambulance', 'expense', 'expense', '6000', 'exp_fuel', 0],
  ['6810', 'Internet & Telephone', 'expense', 'expense', '6000', 'exp_telecom', 0],
  ['6820', 'Linen & Laundry', 'expense', 'expense', '6000', 'exp_laundry', 0],
  ['6830', 'Security Services', 'expense', 'expense', '6000', 'exp_security', 0],
  ['6840', 'Statutory Fees & Licences', 'expense', 'expense', '6000', 'exp_statutory', 0],
  ['6850', 'Printing & Stationery', 'expense', 'expense', '6000', 'exp_stationery', 0],
  ['6410', 'Lab Consumables & Reagents', 'expense', 'expense', '6000', 'exp_lab_consumables', 0],
  ['6610', 'Equipment (non-capital)', 'expense', 'expense', '6000', 'exp_equipment', 0],
  ['6860', 'Administration & Office', 'expense', 'expense', '6000', 'exp_admin', 0],
  ['6870', 'Software & IT Services', 'expense', 'expense', '6000', 'exp_software', 0],
  ['6880', 'Professional & Consultancy Fees', 'expense', 'expense', '6000', 'exp_professional', 0],
  ['6900', 'General Expenses', 'expense', 'expense', '6000', 'exp_general', 0],
  ['6950', 'Claim Disallowances', 'expense', 'expense', '6000', 'claim_disallowance', 0],
  ['6960', 'Bank Charges', 'expense', 'expense', '6000', 'bank_charges', 0],
  ['6970', 'Stock Write-off & Adjustment', 'expense', 'expense', '6000', 'stock_writeoff', 0],
  ['6980', 'Cash Short / Over', 'expense', 'expense', '6000', 'cash_over_short', 0],
  ['6990', 'Round Off', 'expense', 'expense', '6000', 'round_off', 0],
];

export function ensureChart() {
  for (const [code, name, type, subtype, parent, key, group] of CHART) {
    const ex = get('SELECT id FROM accounts WHERE code=?', code);
    if (!ex) insert('accounts', { code, name, type, subtype, parent_code: parent, system_key: key, is_group: group });
  }
  keyCache.clear();
}

const keyCache = new Map();
export function acct(key) {
  if (keyCache.has(key)) return keyCache.get(key);
  const a = get('SELECT * FROM accounts WHERE system_key=?', key);
  if (!a) throw new Error(`account ${key} missing from chart`);
  keyCache.set(key, a);
  return a;
}
export const accountId = (ref) => (typeof ref === 'number' ? ref : acct(ref).id);

/* -------------------------------------------------------------- vocabulary */

/** Money received: mode → the account that receives it. */
export const MONEY_MODES = {
  cash: 'cash', upi: 'upi_clearing', debit_card: 'card_clearing', credit_card: 'card_clearing',
  card: 'card_clearing', bank_transfer: 'bank', cheque: 'cheque_clearing',
};
/** A payer taking over a balance: mode → that payer's receivable. */
export const PAYER_MODES = {
  insurance: 'ar_insurance', aarogyasri: 'ar_aarogyasri', corporate: 'ar_corporate',
  credit: 'ar_credit', trust: 'ar_trust',
};
export const SEGMENTS = ['OP', 'IP', 'ER', 'LAB', 'IMAGING', 'PHARMACY', 'PROCEDURE', 'OT', 'ICU', 'ROOM', 'NURSING', 'PACKAGE', 'OTHER'];
export const HEAD_ACCOUNT = {
  OP: 'rev_op', ER: 'rev_er', IP: 'rev_ip', ICU: 'rev_icu', LAB: 'rev_lab', IMAGING: 'rev_imaging',
  PHARMACY: 'rev_pharmacy', PROCEDURE: 'rev_procedure', OT: 'rev_ot', PACKAGE: 'rev_package', OTHER: 'rev_other',
  ROOM: 'rev_room', NURSING: 'rev_nursing',
};

const OT_CODES = new Set(['PRC-LSC', 'PRC-LSCS', 'PRC-TKR', 'PRC-NVD', 'PRC-APP', 'PRC-HRN']);

/** Which revenue segment a bill line belongs to. */
export function revenueHead(item, bill, encounter) {
  const svc = item.service_id ? get('SELECT code, category FROM services WHERE id=?', item.service_id) : null;
  if (svc?.code === 'IPC-NUR' || /nursing/i.test(item.description || '') && item.category === 'ipd') return 'NURSING';
  switch (item.category) {
    case 'lab': return 'LAB';
    case 'imaging': return 'IMAGING';
    case 'pharmacy': case 'consumable': return bill.bill_type === 'IP' ? 'PHARMACY' : 'PHARMACY';
    case 'package': return 'PACKAGE';
    case 'ot': return 'OT';
    case 'procedure':
      return (svc && OT_CODES.has(svc.code)) || bill.source === 'OT' ? 'OT' : 'PROCEDURE';
    case 'bed': return /icu|nicu/i.test(item.description || '') ? 'ICU' : 'ROOM';
    case 'consultation':
      if (encounter?.kind === 'EMG' || bill.bill_type === 'ER') return 'ER';
      if (encounter?.kind === 'IP' || bill.bill_type === 'IP') return 'IP';
      return 'OP';
    default:
      if (bill.bill_type === 'IP') return 'IP';
      if (bill.bill_type === 'ER' || encounter?.kind === 'EMG') return 'ER';
      if (bill.bill_type === 'LAB') return 'LAB';
      if (bill.bill_type === 'IMAGING') return 'IMAGING';
      if (bill.bill_type === 'PHARM') return 'PHARMACY';
      if (bill.bill_type === 'PKG') return 'PACKAGE';
      return 'OTHER';
  }
}

/** Taxable value, tax and line total of a bill line (pharmacy MRP is tax-inclusive). */
export function itemMoney(item) {
  const amt = round2(item.amount || 0);
  const g = +item.gst_pct || 0;
  if (!g) return { taxable: amt, tax: 0, total: amt };
  if (item.tax_inclusive) {
    const taxable = round2(amt / (1 + g / 100));
    return { taxable, tax: round2(amt - taxable), total: amt };
  }
  const tax = round2(amt * g / 100);
  return { taxable: amt, tax, total: round2(amt + tax) };
}

/* ------------------------------------------------------------ period lock */

export function lastClosedDate() {
  return one("SELECT max(close_date) FROM day_closings WHERE status='closed'") || null;
}
export function isClosed(date) {
  const c = lastClosedDate();
  return !!c && date <= c;
}

/* ---------------------------------------------------------------- posting */

class AccountingError extends Error {
  constructor(message, extra) { super(message); this.http = 400; this.extra = extra || {}; }
}

/**
 * Post a balanced voucher. Lines reference accounts by system key or id.
 * Returns the voucher id, or null when every line nets to zero.
 */
export function postVoucher({ type, date, narration, source, sourceId, lines, reason, manual = false, userId }) {
  const clean = [];
  for (const l of lines) {
    let dr = round2(l.debit || 0), cr = round2(l.credit || 0);
    if (dr < 0) { cr = round2(cr - dr); dr = 0; }
    if (cr < 0) { dr = round2(dr - cr); cr = 0; }
    const net = round2(dr - cr);
    if (Math.abs(net) < 0.005) continue;
    const a = typeof l.account === 'number' ? get('SELECT * FROM accounts WHERE id=?', l.account) : acct(l.account);
    if (!a) throw new AccountingError('account_not_found', { account: l.account });
    if (a.is_group) throw new AccountingError('cannot_post_to_group_account', { account: a.name });
    if (!a.active) throw new AccountingError('account_inactive', { account: a.name });
    clean.push({ account_id: a.id, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0,
      party_type: l.party_type || null, party_id: l.party_id || null,
      segment: l.segment || null, category: l.category || null, memo: l.memo || null });
  }
  if (!clean.length) return null;
  const dr = round2(clean.reduce((s, l) => s + l.debit, 0));
  const cr = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) >= 0.005) throw new AccountingError('voucher_not_balanced', { debit: dr, credit: cr });
  if (clean.length < 2) throw new AccountingError('voucher_needs_two_lines');
  const vdate = date || today();
  if (manual && isClosed(vdate)) {
    const e = new AccountingError('period_closed', { closed_through: lastClosedDate() }); e.http = 409; throw e;
  }
  const vid = insert('journal_vouchers', {
    voucher_no: nextNo(`vch_${type}`), voucher_type: type, voucher_date: vdate,
    narration, source, source_id: sourceId ?? null, total: dr, reason,
    created_by: userId ?? currentUser()?.id ?? null,
  });
  for (const l of clean) insert('journal_lines', { voucher_id: vid, ...l });
  return vid;
}

/** Reverse a voucher with its mirror image. The original is never edited. */
export function reverseVoucher(voucherId, reason, { manual = false } = {}) {
  const v = get('SELECT * FROM journal_vouchers WHERE id=?', voucherId);
  if (!v) throw new AccountingError('voucher_not_found');
  if (v.status === 'reversed') throw new AccountingError('voucher_already_reversed');
  const lines = all('SELECT * FROM journal_lines WHERE voucher_id=?', voucherId);
  const rid = postVoucher({
    type: v.voucher_type, narration: `Reversal of ${v.voucher_no}${reason ? ` — ${reason}` : ''}`,
    source: v.source, sourceId: v.source_id, reason, manual,
    lines: lines.map((l) => ({ account: l.account_id, debit: l.credit, credit: l.debit,
      party_type: l.party_type, party_id: l.party_id, segment: l.segment, category: l.category, memo: l.memo })),
  });
  update('journal_vouchers', voucherId, { status: 'reversed', reversed_by: rid });
  if (rid) update('journal_vouchers', rid, { reversal_of: voucherId });
  return rid;
}

/* ---------------------------------------------------------- books integrity */

/** The record each voucher source points at. */
const SOURCE_TABLE = {
  bill: 'bills', advance: 'bills', dispense: 'bills', payment: 'payments', settlement: 'bill_settlements',
  settlement_receipt: 'settlement_receipts', purchase: 'purchases', purchase_return: 'purchase_returns',
  sales_return: 'sales_returns', supplier_payment: 'supplier_payments', stock: 'stock_moves',
  expense: 'expenses', expense_payment: 'expenses', consumption: 'procedure_consumptions',
  visiting_statement: 'visiting_statements', visiting_payout: 'visiting_payouts',
  store_receipt: 'store_receipts', store_issue: 'store_moves',
  ward_usage:'ward_replacements',ward_replacement_receipt:'ward_replacement_receipts',
};
/** The document number a voucher's narration carries, read from its record (a reused id shows a different number). */
const SOURCE_DOC = {
  payment: 'SELECT receipt_no FROM payments WHERE id=?',
  bill: 'SELECT bill_no FROM bills WHERE id=?', advance: 'SELECT bill_no FROM bills WHERE id=?', dispense: 'SELECT bill_no FROM bills WHERE id=?',
  settlement: 'SELECT b.bill_no FROM bill_settlements s JOIN bills b ON b.id=s.bill_id WHERE s.id=?',
  purchase: 'SELECT grn_no FROM purchases WHERE id=?',
};
/** Why a posted voucher no longer matches its record: missing, or the id now belongs to another document. */
function voucherMismatch(v) {
  const table = SOURCE_TABLE[v.source];
  if (!table || v.source_id == null) return null;
  if (!get(`SELECT id FROM ${table} WHERE id=?`, v.source_id)) return 'record_missing';
  const sql = SOURCE_DOC[v.source];
  if (!sql) return null;
  const doc = Object.values(get(sql, v.source_id) || {})[0];
  return doc && !String(v.narration || '').includes(doc) ? 'record_reused' : null;
}

/**
 * Read-only check of the books: every voucher balances, the trial balance is level, and every
 * posted voucher still has the record it was raised for. A voucher without its record means rows
 * were removed outside the app (the app itself never deletes a posted document).
 */
export function booksIntegrity() {
  const unbalanced = all(`SELECT v.id, v.voucher_no, round(sum(l.debit-l.credit),2) diff FROM journal_lines l
    JOIN journal_vouchers v ON v.id=l.voucher_id GROUP BY l.voucher_id HAVING abs(sum(l.debit-l.credit))>0.01`);
  const tb = round2(one('SELECT coalesce(sum(debit)-sum(credit),0) FROM journal_lines') || 0);
  const orphans = all(`SELECT id, voucher_no, voucher_date, source, source_id, total, narration FROM journal_vouchers
      WHERE status='posted' AND reversal_of IS NULL AND source_id IS NOT NULL AND source IN (${Object.keys(SOURCE_TABLE).map(() => '?').join(',')})
      ORDER BY id`, ...Object.keys(SOURCE_TABLE))
    .map((v) => ({ ...v, problem: voucherMismatch(v) })).filter((v) => v.problem);
  return { ok: !unbalanced.length && Math.abs(tb) < 0.01 && !orphans.length, unbalanced, trial_balance_difference: tb, orphan_vouchers: orphans };
}

/**
 * Correct a voucher whose record was removed outside the app: post its mirror image as a
 * correction (amounts are never edited) and detach both from the old record id, so a new record
 * that reuses the id is never mistaken for it.
 */
export function correctOrphanVoucher(voucherId, reason, userId = null) {
  const v = get('SELECT * FROM journal_vouchers WHERE id=?', voucherId);
  if (!v || v.status !== 'posted' || v.reversal_of) throw new AccountingError('voucher_not_correctable');
  if (!voucherMismatch(v)) throw new AccountingError('voucher_matches_its_record');
  const lines = all('SELECT * FROM journal_lines WHERE voucher_id=?', v.id);
  const rid = postVoucher({
    type: 'JV', narration: `Correction of ${v.voucher_no}: its ${v.source} record #${v.source_id} no longer exists${reason ? ` (${reason})` : ''}`,
    source: 'correction', sourceId: v.id, reason, userId,
    lines: lines.map((l) => ({ account: l.account_id, debit: l.credit, credit: l.debit,
      party_type: l.party_type, party_id: l.party_id, segment: l.segment, category: l.category, memo: l.memo })),
  });
  update('journal_vouchers', v.id, { status: 'reversed', reversed_by: rid, source: `${v.source}_removed` });
  if (rid) update('journal_vouchers', rid, { reversal_of: v.id });
  return { voucher: v.voucher_no, correction: rid ? get('SELECT voucher_no FROM journal_vouchers WHERE id=?', rid).voucher_no : null, amount: v.total };
}

/** Reverse every live voucher raised for a source record. */
export function reverseSource(source, sourceId, reason) {
  for (const v of all("SELECT id FROM journal_vouchers WHERE source=? AND source_id=? AND status='posted' AND reversal_of IS NULL",
    source, sourceId)) reverseVoucher(v.id, reason);
}

/* ------------------------------------------------------------ bill revenue */

/**
 * Bring the ledger in line with a bill. Computes what the bill should have
 * posted (revenue by segment, output GST, discount, receivable) and posts only
 * the difference from what is already posted — so adding a line, discounting
 * or cancelling a bill all account correctly without each route knowing how.
 */
export function syncBillAccounting(billId) {
  const bill = get('SELECT * FROM bills WHERE id=?', billId);
  if (!bill) return null;
  const enc = bill.encounter_id ? get('SELECT kind FROM encounters WHERE id=?', bill.encounter_id) : null;
  const party = { party_type: 'patient', party_id: bill.patient_id, category: bill.payer_type || 'self' };
  const target = new Map();
  const add = (account, net, extra = {}) => {
    if (Math.abs(net) < 0.005) return;
    const a = accountId(account);
    const row = { account_id: a, party_type: extra.party_type || null, party_id: extra.party_id || null,
      segment: extra.segment || null, category: extra.category || null };
    const key = [a, row.party_type, row.party_id, row.segment, row.category].join('|');
    const cur = target.get(key) || { ...row, net: 0 };
    cur.net = round2(cur.net + net);
    target.set(key, cur);
  };

  if (bill.status !== 'cancelled') {
    const items = all('SELECT * FROM bill_items WHERE bill_id=?', billId);
    let primary = null;
    for (const it of items) {
      const head = it.revenue_head || revenueHead(it, bill, enc);
      primary = primary || head;
      const m = itemMoney(it);
      const revAcct = it.category === 'refund' ? 'sales_returns' : HEAD_ACCOUNT[head] || 'rev_other';
      add(revAcct, -m.taxable, { segment: head, category: party.category });
      if (m.tax) {
        const cg = round2(m.tax / 2);
        add('gst_out_cgst', -cg, { segment: head });
        add('gst_out_sgst', -round2(m.tax - cg), { segment: head });
      }
      add('ar_patient', m.total, { ...party, segment: head });
    }
    if (bill.discount > 0) {
      add('discount_allowed', bill.discount, { segment: primary || 'OTHER', category: party.category });
      add('ar_patient', -bill.discount, { ...party, segment: primary || 'OTHER' });
    }
  }

  const posted = all(
    `SELECT l.account_id, l.party_type, l.party_id, l.segment, l.category, round(sum(l.debit - l.credit), 2) net
       FROM journal_lines l JOIN journal_vouchers v ON v.id = l.voucher_id
      WHERE v.source = 'bill' AND v.source_id = ?
      GROUP BY l.account_id, l.party_type, l.party_id, l.segment, l.category`, billId);
  const postedMap = new Map(posted.map((p) => [[p.account_id, p.party_type, p.party_id, p.segment, p.category].join('|'), p]));
  const keys = new Set([...target.keys(), ...postedMap.keys()]);
  const lines = [];
  for (const k of keys) {
    const t = target.get(k), p = postedMap.get(k);
    const delta = round2((t?.net || 0) - (p?.net || 0));
    if (Math.abs(delta) < 0.005) continue;
    const src = t || p;
    lines.push({ account: src.account_id, debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0,
      party_type: src.party_type, party_id: src.party_id, segment: src.segment, category: src.category });
  }
  if (!lines.length) return null;
  return postVoucher({
    type: 'SV', source: 'bill', sourceId: billId,
    narration: bill.status === 'cancelled' ? `Bill ${bill.bill_no} cancelled` : `Charges on bill ${bill.bill_no}`,
    lines,
  });
}

/**
 * Advances. Money paid ahead of charges (an IP deposit, an overpayment) is a
 * liability, never revenue: whenever a bill's balance is below zero the credit
 * sits in Patient Advances; as charges accrue it moves back against the bill.
 * Posts only the difference from what is already recorded for the bill.
 */
export function syncAdvance(billId) {
  const bill = get('SELECT * FROM bills WHERE id=?', billId);
  if (!bill) return null;
  const target = bill.status === 'cancelled' ? 0 : round2(Math.max(0, -bill.balance));
  const posted = round2(one(`SELECT coalesce(sum(l.credit - l.debit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
    WHERE v.source='advance' AND v.source_id=? AND l.account_id=?`, billId, acct('patient_advances').id) || 0);
  const delta = round2(target - posted);
  if (Math.abs(delta) < 0.005) return null;
  const party = { party_type: 'patient', party_id: bill.patient_id, category: bill.payer_type || 'self' };
  return postVoucher({
    type: 'JV', source: 'advance', sourceId: billId,
    narration: delta > 0 ? `Advance held on ${bill.bill_no}` : `Advance adjusted against ${bill.bill_no}`,
    lines: [
      { account: 'ar_patient', debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0, ...party },
      { account: 'patient_advances', credit: delta > 0 ? delta : 0, debit: delta < 0 ? -delta : 0, ...party },
    ],
  });
}

/* ------------------------------------------------------------- money in/out */

/** A payment row (money received, or negative for money refunded). */
export function postPayment(payment) {
  const bill = payment.bill_id ? get('SELECT * FROM bills WHERE id=?', payment.bill_id) : null;
  const amt = round2(payment.amount);
  // money paid back by UPI / card / cheque leaves the bank account; only receipts sit in a clearing account awaiting settlement
  const moneyAcct = amt < 0 && ['upi', 'debit_card', 'credit_card', 'card', 'cheque'].includes(payment.mode) ? 'bank' : MONEY_MODES[payment.mode];
  if (!moneyAcct) throw new AccountingError('payment_mode_has_no_account', { mode: payment.mode });
  const party = { party_type: 'patient', party_id: payment.patient_id, category: bill?.payer_type || 'self' };
  return postVoucher({
    type: amt >= 0 ? 'RV' : 'PV', source: 'payment', sourceId: payment.id,
    narration: `${amt >= 0 ? 'Receipt' : 'Refund'} ${payment.receipt_no}${bill ? ` on ${bill.bill_no}` : ''} · ${payment.mode}`,
    lines: [
      { account: moneyAcct, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0 },
      { account: 'ar_patient', debit: amt < 0 ? -amt : 0, credit: amt > 0 ? amt : 0, ...party },
    ],
  });
}

/** A payer taking over part of a bill, an approved free treatment, or a due. */
export function postSettlement(s) {
  if (s.mode === 'due') return null;                 // stays with the patient
  const bill = get('SELECT * FROM bills WHERE id=?', s.bill_id);
  // Free treatment reduces the revenue of the department that earned it.
  const segment = one(`SELECT revenue_head FROM bill_items WHERE bill_id=? AND revenue_head IS NOT NULL
                        GROUP BY revenue_head ORDER BY sum(amount) DESC LIMIT 1`, s.bill_id) || 'OTHER';
  const debitAcct = s.mode === 'free' ? (s.payer_name === 'Package adjustment' ? 'package_adjustment' : 'free_treatment') : PAYER_MODES[s.mode];
  if (!debitAcct) throw new AccountingError('settlement_mode_invalid', { mode: s.mode });
  return postVoucher({
    type: 'STL', source: 'settlement', sourceId: s.id,
    narration: s.mode === 'free'
      ? `${s.payer_name === 'Package adjustment' ? 'Package adjustment' : 'Free treatment approved'} on ${bill.bill_no}${s.reason ? ` — ${s.reason}` : ''}`
      : `${bill.bill_no} transferred to ${s.payer_name || s.mode}`,
    lines: [
      { account: debitAcct, debit: s.amount, party_type: s.mode === 'free' ? null : 'settlement',
        party_id: s.mode === 'free' ? null : s.id, category: s.mode, segment },
      { account: 'ar_patient', credit: s.amount, party_type: 'patient', party_id: s.patient_id, category: bill.payer_type, segment },
    ],
  });
}

/** Money from an insurer / scheme / trust / corporate against a settlement. */
export function postSettlementReceipt(r, s) {
  const payerAcct = PAYER_MODES[s.mode];
  const moneyAcct = MONEY_MODES[r.mode];
  const lines = [];
  if (r.amount > 0) lines.push({ account: moneyAcct, debit: r.amount });
  if (r.disallowed > 0) {
    if (r.disallowance_action === 'transfer_to_patient') {
      lines.push({ account: 'ar_patient', debit: r.disallowed, party_type: 'patient', party_id: s.patient_id, category: s.mode });
    } else {
      lines.push({ account: 'claim_disallowance', debit: r.disallowed });
    }
  }
  lines.push({ account: payerAcct, credit: round2(r.amount + r.disallowed), party_type: 'settlement', party_id: s.id, category: s.mode });
  return postVoucher({
    type: 'RV', source: 'settlement_receipt', sourceId: r.id,
    narration: `${s.payer_name || s.mode} settlement ${r.receipt_no} against ${s.settlement_no}`, lines,
  });
}

/* --------------------------------------------------------------- pharmacy */

/** Goods received: inventory and input GST against the supplier. */
export function postPurchase(p) {
  const round = round2(p.round_off || 0);
  return postVoucher({
    type: 'PUR', source: 'purchase', sourceId: p.id,
    narration: `GRN ${p.grn_no}${p.invoice_no ? ` · invoice ${p.invoice_no}` : ''}`,
    lines: [
      // freight in adds to stock value; a supplier credit note on the bill reduces it
      { account: 'inventory_pharmacy', debit: round2(p.gross - (p.discount || 0) + (p.delivery_charge || 0) - (p.credit_note || 0)), segment: 'PHARMACY' },
      { account: 'gst_in_cgst', debit: p.cgst },
      { account: 'gst_in_sgst', debit: p.sgst },
      { account: 'gst_in_igst', debit: p.igst },
      { account: 'round_off', debit: round },
      { account: 'ap_suppliers', credit: p.total, party_type: 'supplier', party_id: p.supplier_id },
    ],
  });
}

export function postPurchaseReturn(r, supplierId) {
  return postVoucher({
    type: 'PUR', source: 'purchase_return', sourceId: r.id,
    narration: `Purchase return ${r.return_no}`,
    lines: [
      { account: 'ap_suppliers', debit: round2(r.value + r.cgst + r.sgst + r.igst), party_type: 'supplier', party_id: supplierId },
      { account: 'inventory_pharmacy', credit: r.value, segment: 'PHARMACY' },
      { account: 'gst_in_cgst', credit: r.cgst },
      { account: 'gst_in_sgst', credit: r.sgst },
      { account: 'gst_in_igst', credit: r.igst },
    ],
  });
}

export function postSupplierPayment(sp) {
  return postVoucher({
    type: 'PV', source: 'supplier_payment', sourceId: sp.id,
    narration: `Payment ${sp.payment_no} to ${get('SELECT name FROM suppliers WHERE id=?', sp.supplier_id)?.name || 'supplier'}`,
    lines: [
      { account: 'ap_suppliers', debit: sp.amount, party_type: 'supplier', party_id: sp.supplier_id },
      { account: MONEY_MODES[sp.mode] || 'bank', credit: sp.amount },
    ],
  });
}

/** Cost of what was dispensed, at batch purchase cost. */
export function postCostOfSale({ billId, cost, narration, consumable = false }) {
  if (!(cost > 0)) return null;
  return postVoucher({
    type: 'COGS', source: 'dispense', sourceId: billId, narration,
    lines: [
      { account: consumable ? 'cogs_consumables' : 'cogs_pharmacy', debit: cost, segment: 'PHARMACY' },
      { account: 'inventory_pharmacy', credit: cost, segment: 'PHARMACY' },
    ],
  });
}

export function postStockAdjustment({ moveId, value, narration }) {
  if (!value) return null;
  return postVoucher({
    type: 'STK', source: 'stock', sourceId: moveId, narration,
    lines: [
      { account: 'inventory_pharmacy', debit: value > 0 ? value : 0, credit: value < 0 ? -value : 0, segment: 'PHARMACY' },
      { account: 'stock_writeoff', debit: value < 0 ? -value : 0, credit: value > 0 ? value : 0 },
    ],
  });
}

/* ---------------------------------------------------------------- expenses */

export function expenseAccount(expense) {
  if (expense.account_id) return expense.account_id;
  const byName = get("SELECT id FROM accounts WHERE lower(name)=lower(?) AND type IN ('expense','asset') AND is_group=0", expense.head);
  return byName ? byName.id : acct('exp_general').id;
}

export function postExpenseAccrual(e) {
  return postVoucher({
    type: 'EXP', source: 'expense', sourceId: e.id,
    narration: `${e.voucher_no} · ${e.head}${e.vendor ? ` · ${e.vendor}` : ''}`,
    lines: [
      { account: expenseAccount(e), debit: e.amount, segment: e.department || null },
      { account: 'accrued_expenses', credit: e.amount },
    ],
  });
}

export function postExpensePayment(e) {
  return postVoucher({
    type: 'PV', source: 'expense_payment', sourceId: e.id,
    narration: `Paid ${e.voucher_no} · ${e.vendor || e.head}`,
    lines: [
      { account: 'accrued_expenses', debit: e.amount },
      { account: MONEY_MODES[e.mode] || (e.mode === 'bank' ? 'bank' : 'cash'), credit: e.amount },
    ],
  });
}

/* ================================================================ READING */

const NATURE = { asset: 1, expense: 1, liability: -1, equity: -1, income: -1 };

/** Balances by account for a period (opening, movement, closing). */
export function trialBalance(from, to) {
  const rows = all(
    `SELECT a.id, a.code, a.name, a.type, a.subtype, a.parent_code,
            coalesce(sum(CASE WHEN v.voucher_date < ? THEN l.debit - l.credit END), 0) opening,
            coalesce(sum(CASE WHEN v.voucher_date BETWEEN ? AND ? THEN l.debit END), 0) debit,
            coalesce(sum(CASE WHEN v.voucher_date BETWEEN ? AND ? THEN l.credit END), 0) credit
       FROM accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       LEFT JOIN journal_vouchers v ON v.id = l.voucher_id AND v.voucher_date <= ?
      WHERE a.is_group = 0
      GROUP BY a.id ORDER BY a.code`, from, from, to, from, to, to);
  return rows.map((r) => {
    const closing = round2(r.opening + r.debit - r.credit);
    return { ...r, opening: round2(r.opening), debit: round2(r.debit), credit: round2(r.credit), closing,
      closing_dr: closing > 0 ? closing : 0, closing_cr: closing < 0 ? -closing : 0 };
  });
}

/** Signed balance in the account's natural direction. */
export function naturalBalance(row) {
  return round2(row.closing * (NATURE[row.type] || 1));
}

export function profitAndLoss(from, to) {
  const tb = trialBalance(from, to).map((r) => ({ ...r, amount: round2((r.debit - r.credit) * -1) }));
  const income = tb.filter((r) => r.type === 'income' && r.subtype === 'revenue');
  const contra = tb.filter((r) => r.type === 'income' && r.subtype === 'contra_revenue');
  const cogs = tb.filter((r) => r.type === 'expense' && r.subtype === 'cogs');
  const expenses = tb.filter((r) => r.type === 'expense' && r.subtype !== 'cogs');
  const sum = (a) => round2(a.reduce((s, r) => s + r.amount, 0));
  const grossRevenue = sum(income);
  const deductions = -sum(contra);                    // debit-natured, shown positive
  const netRevenue = round2(grossRevenue - deductions);
  const directCost = -sum(cogs);
  const grossProfit = round2(netRevenue - directCost);
  const opex = -sum(expenses);
  return {
    from, to,
    income: income.map((r) => ({ code: r.code, name: r.name, amount: r.amount })),
    deductions: contra.map((r) => ({ code: r.code, name: r.name, amount: -r.amount })),
    cogs: cogs.map((r) => ({ code: r.code, name: r.name, amount: -r.amount })),
    expenses: expenses.map((r) => ({ code: r.code, name: r.name, amount: -r.amount })),
    totals: { grossRevenue, deductions, netRevenue, directCost, grossProfit, opex, netResult: round2(grossProfit - opex) },
  };
}

export function balanceSheet(asOf) {
  const tb = trialBalance('0000-01-01', asOf);
  const pick = (type) => tb.filter((r) => r.type === type && Math.abs(r.closing) >= 0.005)
    .map((r) => ({ code: r.code, name: r.name, subtype: r.subtype, amount: naturalBalance(r) }));
  const assets = pick('asset'), liabilities = pick('liability'), equity = pick('equity');
  const pl = tb.filter((r) => r.type === 'income' || r.type === 'expense')
    .reduce((s, r) => s - r.closing, 0);             // income credit (-) → profit (+)
  const sum = (a) => round2(a.reduce((s, r) => s + r.amount, 0));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = round2(sum(equity) + round2(pl));
  return {
    asOf, assets, liabilities, equity, currentProfit: round2(pl),
    totals: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity,
      liabilitiesAndEquity: round2(totalLiabilities + totalEquity),
      balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.05 },
  };
}

/** Statement of one account with running balance. */
export function accountLedger(accountRef, from, to, { partyType, partyId } = {}) {
  const a = typeof accountRef === 'number' ? get('SELECT * FROM accounts WHERE id=?', accountRef) : acct(accountRef);
  const extra = partyType ? ' AND l.party_type=? AND l.party_id=?' : '';
  const args = partyType ? [partyType, partyId] : [];
  const opening = round2(one(
    `SELECT coalesce(sum(l.debit - l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
      WHERE l.account_id=? AND v.voucher_date < ?${extra}`, a.id, from, ...args) || 0);
  const rows = all(
    `SELECT v.id voucher_id, v.voucher_no, v.voucher_type, v.voucher_date, v.narration, v.source, v.source_id,
            l.debit, l.credit, l.party_type, l.party_id, l.segment, l.category, l.memo
       FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
      WHERE l.account_id=? AND v.voucher_date BETWEEN ? AND ?${extra}
      ORDER BY v.voucher_date, v.id`, a.id, from, to, ...args);
  let bal = opening;
  const lines = rows.map((r) => { bal = round2(bal + r.debit - r.credit); return { ...r, balance: bal }; });
  return { account: a, from, to, opening, closing: bal,
    debit: round2(rows.reduce((s, r) => s + r.debit, 0)), credit: round2(rows.reduce((s, r) => s + r.credit, 0)), lines };
}

/**
 * Direct-method cash flow: every movement in cash, bank and clearing accounts,
 * classified by what the other side of the voucher was.
 */
export function cashFlow(from, to) {
  const cashIds = all("SELECT id FROM accounts WHERE subtype IN ('cash','bank','clearing')").map((r) => r.id);
  const idList = cashIds.join(',') || '0';
  const vouchers = all(
    `SELECT DISTINCT v.id FROM journal_vouchers v JOIN journal_lines l ON l.voucher_id=v.id
      WHERE l.account_id IN (${idList}) AND v.voucher_date BETWEEN ? AND ?`, from, to);
  const buckets = {};
  const put = (group, label, amt) => {
    buckets[group] ??= {};
    buckets[group][label] = round2((buckets[group][label] || 0) + amt);
  };
  for (const { id } of vouchers) {
    const lines = all(
      `SELECT l.*, a.type, a.subtype, a.system_key, a.name FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.voucher_id=?`, id);
    const cashNet = round2(lines.filter((l) => cashIds.includes(l.account_id)).reduce((s, l) => s + l.debit - l.credit, 0));
    if (Math.abs(cashNet) < 0.005) continue;                  // contra between cash accounts
    const other = lines.filter((l) => !cashIds.includes(l.account_id));
    const o = other.sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit))[0];
    let group = 'Operating', label = 'Other operating';
    if (!o) label = 'Transfers';
    else if (o.system_key === 'ar_patient') label = cashNet > 0 ? 'Collections from patients' : 'Refunds to patients';
    else if (o.subtype === 'receivable') label = `Settlements from ${o.name.replace(' Receivable', '')}`;
    else if (o.system_key === 'ap_suppliers') label = 'Payments to suppliers';
    else if (o.subtype === 'accrual' || o.type === 'expense') label = 'Operating expenses paid';
    else if (o.subtype === 'fixed_asset') { group = 'Investing'; label = 'Purchase of fixed assets'; }
    else if (o.type === 'equity') { group = 'Financing'; label = cashNet > 0 ? 'Capital introduced' : 'Drawings'; }
    else if (o.subtype === 'advance') label = 'Advances';
    else if (o.type === 'income') label = 'Other income received';
    put(group, label, cashNet);
  }
  const opening = round2(one(
    `SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
      WHERE l.account_id IN (${idList}) AND v.voucher_date < ?`, from) || 0);
  const groups = ['Operating', 'Investing', 'Financing'].map((g) => {
    const items = Object.entries(buckets[g] || {}).map(([label, amount]) => ({ label, amount }));
    return { group: g, items, net: round2(items.reduce((s, i) => s + i.amount, 0)) };
  });
  const net = round2(groups.reduce((s, g) => s + g.net, 0));
  return { from, to, opening, groups, net, closing: round2(opening + net) };
}

export function voucherDetail(id) {
  const v = get(`SELECT v.*, u.name created_by_name FROM journal_vouchers v LEFT JOIN users u ON u.id=v.created_by WHERE v.id=?`, id);
  if (!v) return null;
  v.lines = all(`SELECT l.*, a.code, a.name account_name FROM journal_lines l JOIN accounts a ON a.id=l.account_id
                  WHERE l.voucher_id=? ORDER BY l.debit DESC, l.id`, id);
  return v;
}
