/**
 * One payment engine for every desk: OP, lab, imaging, pharmacy, IP, ER,
 * procedures, OT and discharge all settle bills through `settleBill`.
 *
 * A settlement is a list of split lines. Each line is one of:
 *   money   — cash, UPI, debit card, credit card, bank transfer, cheque  → a receipt
 *   payer   — insurance, Aarogyasri, corporate, credit, trust            → that payer's receivable
 *   free    — approved free treatment (reason required)                  → written off, never "collected"
 *   due     — approved due: services may proceed, the patient still owes
 *
 * Every line is stored separately with its reference, collector, counter and
 * time, and every line posts its own accounting voucher.
 */
import {
  fail, all, get, one, insert, update, run, nextNo, today, nowIso, tx, money,
  recalcBill, syncEncounterPayment, setting,
} from './lib.js';
import { can } from './auth.js';
import { collectionPolicy } from './collection-policy.js';
import { MONEY_MODES, PAYER_MODES, postPayment, postSettlement, postSettlementReceipt, reverseSource, isClosed } from './accounting.js';

/** Once accounts close today's books, no more money may land in them: reopen the day first. */
function openBooksGuard() {
  if (isClosed(today())) fail(409, 'books_closed_today', { date: today() });
}

export const MONEY = Object.keys(MONEY_MODES).filter((m) => m !== 'card');
export const PAYERS = Object.keys(PAYER_MODES);
export const CATEGORIES = ['self', 'free', 'aarogyasri', 'insurance', 'credit', 'trust', 'corporate', 'due'];
export const ALL_MODES = [...MONEY, ...PAYERS, 'free', 'due'];

export const MODE_LABEL = {
  cash: 'Cash', upi: 'UPI', debit_card: 'Debit card', credit_card: 'Credit card', card: 'Card',
  bank_transfer: 'Bank transfer', cheque: 'Cheque', insurance: 'Insurance', aarogyasri: 'Aarogyasri',
  corporate: 'Corporate', credit: 'Credit', trust: 'Trust / charity', free: 'Free', due: 'Due',
};

/** Services held for payment may proceed once the bill is clear or a due is approved. */
export function releaseOrders(billId) {
  const bill = get('SELECT * FROM bills WHERE id=?', billId);
  if (!bill) return;
  if (bill.balance <= 0.005 || bill.authorization_status === 'approved') {
    run(`UPDATE orders SET status='ordered', billed=1 WHERE status='awaiting_payment'
          AND id IN (SELECT order_id FROM bill_items WHERE bill_id=?)`, billId);
  }
}

/** Money received against a bill. Negative amounts are refunds. */
export function takePayment(req, { bill_id, amount, mode, reference, remarks, transaction_id, collection_group, allow_advance = false, patient_share_authorized = false }) {
  return tx(() => {
    const bill = get('SELECT * FROM bills WHERE id=?', bill_id);
    if (!bill) fail(404, 'bill_not_found');
    if (bill.status === 'cancelled') fail(409, 'bill_cancelled');
    const amt = money(amount);
    if (mode === 'card') mode = 'debit_card';
    if (!MONEY.includes(mode)) fail(400, 'payment_mode_invalid', { mode });
    if (!Number.isFinite(amt) || amt === 0) fail(400, 'amount_invalid');
    openBooksGuard();
    if (amt > 0 && amt > money(bill.balance) + 0.005 && !allow_advance) fail(400, 'amount_exceeds_balance', { balance: bill.balance });
    const policy = collectionPolicy(bill);
    if (amt > 0 && !patient_share_authorized && ['insurance','aarogyasri','corporate','trust'].includes(bill.payer_type) && amt > policy.patient_due + 0.005) {
      fail(400, 'payer_charges_not_patient_due', policy);
    }
    if (['upi', 'debit_card', 'credit_card', 'bank_transfer', 'cheque'].includes(mode) && amt > 0
        && setting('require_digital_reference', '0') === '1' && !String(reference || transaction_id || '').trim()) {
      fail(400, 'reference_required', { mode });
    }
    const counterId = req.user?.counter_id || bill.counter_id || null;
    const session = counterId
      ? get(`SELECT * FROM counter_sessions WHERE counter_id=? AND status='open' ORDER BY id DESC LIMIT 1`, counterId) : null;
    const pid = insert('payments', {
      receipt_no: nextNo('receipt'), bill_id, patient_id: bill.patient_id, encounter_id: bill.encounter_id,
      amount: amt, mode, reference: reference || null, transaction_id: transaction_id || null, collection_group,
      counter_id: counterId, session_id: session?.id || null, received_by: req.user?.id || null, remarks,
    });
    const payment = get('SELECT * FROM payments WHERE id=?', pid);
    postPayment(payment);
    const updated = recalcBill(bill_id);
    if (bill.encounter_id) syncEncounterPayment(bill.encounter_id);
    releaseOrders(bill_id);
    return { payment, bill: updated };
  });
}

/** A payer taking over part of a bill, an approved free treatment, or an approved due. */
export function addSettlement(req, { bill_id, mode, amount, payer_name, reference, reason, collection_group, claim_id, byApprovedCase = false }) {
  return tx(() => {
    const bill = get('SELECT * FROM bills WHERE id=?', bill_id);
    if (!bill) fail(404, 'bill_not_found');
    if (bill.status === 'cancelled') fail(409, 'bill_cancelled');
    if (![...PAYERS, 'free', 'due'].includes(mode)) fail(400, 'settlement_mode_invalid', { mode });
    const amt = money(amount);
    if (!(amt > 0)) fail(400, 'amount_invalid');
    if (amt > money(bill.balance) + 0.005) fail(400, 'amount_exceeds_balance', { balance: bill.balance });
    if(PAYERS.includes(mode)&&!byApprovedCase&&!can(req.user,'insurance.write')&&!can(req.user,'admin.write'))fail(403,'payer_allocation_requires_insurance');
    // byApprovedCase: the payer's approval on the case is the authority, whoever's action triggered it (doctor order, pharmacy sale …)
    if (!byApprovedCase && !can(req.user, 'payment.authorize') && !(mode === 'free' && can(req.user, 'payment.approve_free'))) fail(403, 'forbidden', { need: 'payment.authorize' });
    if (['free', 'due', 'trust'].includes(mode) && !String(reason || '').trim()) fail(400, 'reason_required', { mode });
    if (!byApprovedCase && mode === 'free' && setting('free_visit_requires_approval') === '1' && !can(req.user, 'admin.view')
        && !can(req.user, 'payment.approve_free')) fail(403, 'free_treatment_needs_approval');
    const id = insert('bill_settlements', {
      settlement_no: nextNo('settlement'), bill_id, patient_id: bill.patient_id, mode, amount: amt,
      payer_name: payer_name || defaultPayer(mode, bill), reference: reference || null, claim_id: claim_id || null,
      reason: reason || null, collection_group, status: mode === 'free' ? 'settled' : 'open',
      created_by: req.user.id, approved_by: req.user.id,
    });
    const s = get('SELECT * FROM bill_settlements WHERE id=?', id);
    postSettlement(s);
    if (mode === 'due') {
      update('bills', bill_id, { authorization_status: 'approved', authorized_by: req.user.id,
        authorized_at: nowIso(), authorization_reason: reason });
    }
    const updated = recalcBill(bill_id);
    if (bill.encounter_id) syncEncounterPayment(bill.encounter_id);
    releaseOrders(bill_id);
    return { settlement: s, bill: updated };
  });
}

function defaultPayer(mode, bill) {
  const p = get('SELECT payer_name FROM patients WHERE id=?', bill.patient_id);
  return p?.payer_name || MODE_LABEL[mode];
}

/**
 * Settle a bill with split lines. The lines must add up to what is entered;
 * if a Due line is present they must add up to the whole outstanding balance.
 * Repeating the same request key returns the first response, so a double
 * click never collects twice.
 */
export function settleBill(req, { bill_id, lines, category, notes, request_key, allow_advance = false, byApprovedCase = false, claim_id = null }) {
  return tx(() => {
    const key = String(request_key || '');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) fail(400, 'request_key_required');
    const prior = get('SELECT * FROM collection_requests WHERE request_key=?', key);
    if (prior) {
      if (prior.bill_id !== +bill_id) fail(409, 'request_key_reused');
      return JSON.parse(prior.response);
    }
    const bill = get('SELECT * FROM bills WHERE id=?', +bill_id);
    if (!bill || bill.status === 'cancelled') fail(409, 'bill_unavailable');
    if (!Array.isArray(lines) || !lines.length || lines.length > 12) fail(400, 'payment_lines_required');
    const parts = lines.map((l) => ({ ...l, mode: l.mode === 'card' ? 'debit_card' : l.mode, amount: money(Number(l.amount)) }));
    for (const p of parts) {
      if (!ALL_MODES.includes(p.mode)) fail(400, 'payment_mode_invalid', { mode: p.mode });
      if (!Number.isFinite(p.amount) || p.amount <= 0) fail(400, 'split_amount_invalid');
    }
    // A payer takes over a balance only on a case the Insurance desk has approved — never by a desk
    // choosing "Corporate" / "Insurance" in the payment window.
    if (parts.some((p) => PAYERS.includes(p.mode)) && !byApprovedCase) {
      const caseRow = bill.claim_id ? get('SELECT status FROM insurance_claims WHERE id=?', bill.claim_id) : null;
      const approved = caseRow && ['preauth_approved', 'claim_submitted', 'settled'].includes(caseRow.status);
      // administrators keep full rights; the Insurance desk may allocate on an approved case; reception never does
      if (!can(req.user, 'admin.write') && (!approved || !can(req.user, 'insurance.write'))) fail(409, 'payer_needs_approved_case', { claim_status: caseRow?.status || null });
    }
    if (parts.some((p) => MONEY.includes(p.mode))) openBooksGuard();
    const total = money(parts.reduce((s, p) => s + p.amount, 0));
    const balance = money(bill.balance);
    const moneyTotal = money(parts.filter((p) => MONEY.includes(p.mode)).reduce((s, p) => s + p.amount, 0));
    const nonMoney = money(total - moneyTotal);
    const policy = collectionPolicy(bill);
    if (moneyTotal > 0 && ['insurance','aarogyasri','corporate','trust'].includes(bill.payer_type) && moneyTotal > policy.patient_due + 0.005) {
      fail(400, 'payer_charges_not_patient_due', policy);
    }
    if (!allow_advance && total > balance + 0.005) fail(400, 'split_exceeds_balance', { balance, total });
    if (allow_advance && nonMoney > balance + 0.005) fail(400, 'split_exceeds_balance', { balance, total });
    if (parts.some((p) => p.mode === 'due') && Math.abs(total - balance) > 0.005) {
      fail(400, 'split_must_equal_balance_when_due', { balance, total });
    }
    if (category) {
      if (!CATEGORIES.includes(category)) fail(400, 'category_invalid');
      if(category!==bill.payer_type&&(PAYERS.includes(category)||PAYERS.includes(bill.payer_type))&&!byApprovedCase&&!can(req.user,'insurance.write')&&!can(req.user,'admin.write'))fail(403,'payer_allocation_requires_insurance');
      if (category !== bill.payer_type) update('bills', bill.id, { payer_type: category });
    }
    // Settlements first (they reduce the balance the receipts are measured against).
    const settlements = [];
    for (const p of parts.filter((x) => !MONEY.includes(x.mode))) {
      settlements.push(addSettlement(req, { bill_id: bill.id, mode: p.mode, amount: p.amount, claim_id,
        payer_name: p.payer_name, reference: p.reference, reason: p.reason || notes, collection_group: key, byApprovedCase }).settlement);
    }
    const receipts = [];
    for (const p of parts.filter((x) => MONEY.includes(x.mode))) {
      receipts.push(takePayment(req, { bill_id: bill.id, amount: p.amount, mode: p.mode, reference: p.reference,
        transaction_id: p.transaction_id || p.reference, remarks: p.notes || notes, collection_group: key,
        allow_advance, patient_share_authorized: bill.payer_type === 'self' && nonMoney > 0 && can(req.user, 'payment.authorize') }).payment);
    }
    const after = recalcBill(bill.id);
    const response = {
      bill: after, receipts, settlements, amount: total, received: moneyTotal,
      summary: parts.map((p) => ({ mode: p.mode, label: MODE_LABEL[p.mode], amount: p.amount })),
    };
    insert('collection_requests', { request_key: key, bill_id: bill.id, response: JSON.stringify(response) });
    return response;
  });
}

/** Cancel a receipt (not a refund — the money was never really taken). */
export function cancelPayment(req, paymentId, reason) {
  return tx(() => {
    const p = get('SELECT * FROM payments WHERE id=?', paymentId);
    if (!p) fail(404, 'payment_not_found');
    if (p.cancelled) fail(409, 'payment_already_cancelled');
    if (!String(reason || '').trim()) fail(400, 'reason_required');
    update('payments', paymentId, { cancelled: 1, cancelled_by: req.user.id, cancelled_at: nowIso(),
      remarks: `${p.remarks ? p.remarks + ' · ' : ''}CANCELLED: ${reason}` });
    reverseSource('payment', paymentId, reason);
    const bill = p.bill_id ? recalcBill(p.bill_id) : null;
    if (p.encounter_id) syncEncounterPayment(p.encounter_id);
    return { payment: get('SELECT * FROM payments WHERE id=?', paymentId), before: p, bill };
  });
}

export function cancelSettlement(req, settlementId, reason) {
  return tx(() => {
    const s = get('SELECT * FROM bill_settlements WHERE id=?', settlementId);
    if (!s) fail(404, 'settlement_not_found');
    if (s.status === 'cancelled') fail(409, 'settlement_already_cancelled');
    if (s.settled_amount > 0) fail(409, 'settlement_has_receipts');
    if (!String(reason || '').trim()) fail(400, 'reason_required');
    update('bill_settlements', settlementId, { status: 'cancelled', cancelled_by: req.user.id,
      cancelled_at: nowIso(), cancel_reason: reason });
    reverseSource('settlement', settlementId, reason);
    if (s.mode === 'due' && !one(`SELECT count(*) FROM bill_settlements WHERE bill_id=? AND mode='due' AND status<>'cancelled'`, s.bill_id)) {
      update('bills', s.bill_id, { authorization_status: 'pending' });
    }
    return { settlement: get('SELECT * FROM bill_settlements WHERE id=?', settlementId), before: s, bill: recalcBill(s.bill_id) };
  });
}

/**
 * Money arriving from an insurer, the Aarogyasri scheme, a corporate or a trust.
 * Any disallowed amount is either written off or handed back to the patient.
 */
export function receiveSettlement(req, { settlement_id, amount, disallowed = 0, disallowance_action = 'write_off', mode = 'bank_transfer', reference, notes }) {
  return tx(() => {
    const s = get('SELECT * FROM bill_settlements WHERE id=?', settlement_id);
    if (!s) fail(404, 'settlement_not_found');
    if (!PAYERS.includes(s.mode)) fail(409, 'settlement_not_receivable');
    if (['cancelled', 'settled', 'written_off'].includes(s.status)) fail(409, 'settlement_closed');
    const amt = money(amount), dis = money(disallowed);
    if (amt < 0 || dis < 0 || amt + dis <= 0) fail(400, 'amount_invalid');
    if (amt > 0) openBooksGuard();
    const open = money(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient);
    if (amt + dis > open + 0.005) fail(400, 'amount_exceeds_open', { open });
    if (!MONEY.includes(mode)) fail(400, 'payment_mode_invalid');
    if (dis > 0 && !['write_off', 'transfer_to_patient'].includes(disallowance_action)) fail(400, 'disallowance_action_invalid');
    const rid = insert('settlement_receipts', {
      receipt_no: nextNo('settlement_receipt'), settlement_id, amount: amt, disallowed: dis,
      disallowance_action: dis > 0 ? disallowance_action : null, mode, reference, notes, received_by: req.user.id,
    });
    const r = get('SELECT * FROM settlement_receipts WHERE id=?', rid);
    postSettlementReceipt(r, s);
    const settled = money(s.settled_amount + amt);
    const written = money(s.written_off + (disallowance_action === 'write_off' ? dis : 0));
    const transferred = money(s.transferred_to_patient + (disallowance_action === 'transfer_to_patient' ? dis : 0));
    const remaining = money(s.amount - settled - written - transferred);
    update('bill_settlements', s.id, {
      settled_amount: settled, written_off: written, transferred_to_patient: transferred,
      status: remaining <= 0.005 ? (settled > 0 ? 'settled' : 'written_off') : 'partially_settled',
      closed_at: remaining <= 0.005 ? nowIso() : null,
    });
    const bill = recalcBill(s.bill_id);
    return { receipt: r, settlement: get('SELECT * FROM bill_settlements WHERE id=?', s.id), before: s, bill };
  });
}

/**
 * Refund money to a patient: a credit note on the bill (revenue comes down)
 * plus a negative receipt (money goes out).
 */
export function refund(req, { bill_id, amount, mode = 'cash', reason, bill_item_id, noCreditNote = false }) {
  return tx(() => {
    const bill = get('SELECT * FROM bills WHERE id=?', bill_id);
    if (!bill) fail(404, 'bill_not_found');
    if (!String(reason || '').trim()) fail(400, 'reason_required');
    const amt = money(amount);
    if (!(amt > 0) || amt > money(bill.paid) + 0.005) fail(400, 'amount_invalid', { refundable: bill.paid });
    if (!MONEY.includes(mode)) fail(400, 'payment_mode_invalid');
    openBooksGuard();
    const item = bill_item_id ? get('SELECT * FROM bill_items WHERE id=? AND bill_id=?', bill_item_id, bill_id) : null;
    const head = item?.revenue_head || get('SELECT revenue_head FROM bill_items WHERE bill_id=? ORDER BY id LIMIT 1', bill_id)?.revenue_head;
    if (!noCreditNote) insert('bill_items', { bill_id, description: `Credit note — ${reason}`, category: 'refund', revenue_head: head || 'OTHER',
      qty: 1, rate: -amt, amount: -amt, created_by: req.user.id, created_at: nowIso() });
    const refundNo = nextNo('refund');
    const pid = insert('payments', {
      receipt_no: nextNo('receipt'), bill_id, patient_id: bill.patient_id, encounter_id: bill.encounter_id,
      amount: -amt, mode, reference: refundNo, received_by: req.user.id, counter_id: req.user.counter_id || null,
      remarks: `Refund: ${reason}`,
    });
    postPayment(get('SELECT * FROM payments WHERE id=?', pid));
    const rid = insert('refunds', { refund_no: refundNo, payment_id: pid, bill_id, patient_id: bill.patient_id,
      amount: amt, mode, reason, approved_by: req.user.id, created_by: req.user.id });
    const updated = recalcBill(bill_id);
    return { refund: get('SELECT * FROM refunds WHERE id=?', rid), bill: updated, before: bill };
  });
}

/** Everything that has cleared a bill, for the bill view and receipts. */
export function billSettlements(billId) {
  return all(`SELECT s.*, u.name created_by_name FROM bill_settlements s LEFT JOIN users u ON u.id=s.created_by
               WHERE s.bill_id=? ORDER BY s.id`, billId);
}

/** Printable receipt for one collection (all split lines of one request). */
export function collectionReceipt(group) {
  const receipts = all(`SELECT p.*, u.name received_by_name, c.name counter_name FROM payments p
    LEFT JOIN users u ON u.id=p.received_by LEFT JOIN counters c ON c.id=p.counter_id
    WHERE p.collection_group=? ORDER BY p.id`, group);
  const settlements = all('SELECT * FROM bill_settlements WHERE collection_group=? ORDER BY id', group);
  return { receipts, settlements };
}

export { today };
