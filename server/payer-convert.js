/**
 * Change who pays for a visit — OP or IP — in one place.
 *
 *   self ⇄ credit ⇄ insurance / Aarogyasri / corporate / trust
 *
 * The money engine already knows how to bill a payer (linkBillCase / ensurePayerCase /
 * settleBill). What a conversion adds is the guard around money that has already moved:
 *
 *   - Money received from the patient (receipts, not cancelled). Moving onto a payer, the
 *     desk must decide: keep it as the patient's share (it counts toward co-pay; the payer
 *     is billed only what is still open) or refund it (no credit note — the charge stays and
 *     the payer is billed for it). Nothing is refunded silently.
 *   - Payer entries not yet paid (insurance / scheme / corporate / trust / credit settlements,
 *     package adjustments) on the old arrangement: reversed only when the desk confirms, so the
 *     amount is open again for the new payer.
 *   - Payer money already received, free approvals and other settlements: the conversion is
 *     refused; they need review on the payer desk first.
 *
 * The visit stage never changes here (payment and stage are independent axes).
 */
import { all, get, update, run, tx } from './db.js';
import { fail, recalcBill, syncEncounterPayment, setting } from './lib.js';
import { can } from './auth.js';
import { cancelSettlement, refund, MONEY, PAYERS } from './payments.js';
import { ensurePayerCase, PAYER_TYPES } from './payer-cases.js';
import { billNewToPayer } from './payer-billing.js';
import {visitBillingCategory} from './payer-context.js';
import {requireSchemeAdmission} from './scheme-scope.js';

export const CATEGORIES = ['self', 'credit', 'insurance', 'aarogyasri', 'corporate', 'trust'];
const LABEL = { self: 'Self-pay', credit: 'Patient credit', insurance: 'Insurance / TPA', aarogyasri: 'Aarogyasri', corporate: 'Corporate', trust: 'Trust' };
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;

/** Who may change a payer: reception / billing desk, the insurance desk, admin. IP keeps ipd.manage for compatibility. */
export const mayChangePayer = (u, ip = false) => can(u,'admin.write') || can(u,'insurance.write') || (can(u,'billing.payer_change') && can(u,'op.collect'));
/** Who decides a payer-change request: the insurance desk, an administrator, or a role given billing.payer_approve. */
export const mayApprovePayer = (u) => can(u, 'insurance.write') || can(u, 'admin.write') || can(u, 'billing.payer_approve');
/** With the setting on (default), a desk that cannot approve sends a request instead of converting directly. */
export const needsApproval = (u) => setting('payer_change_requires_approval') !== '0' && !mayApprovePayer(u)
  && !(can(u,'billing.payer_change') && can(u,'op.collect'));

/** The visit's encounter ids: an admission also carries the ER visit it came from. */
function scope(encounterId) {
  const adm = get(`SELECT * FROM admissions WHERE encounter_id=? AND status<>'discharged' ORDER BY id DESC LIMIT 1`, encounterId);
  const er = adm?.emergency_id ? get('SELECT encounter_id FROM emergency_cases WHERE id=?', adm.emergency_id)?.encounter_id : null;
  return { adm, ids: [encounterId, ...(er ? [er] : [])] };
}

/** What stands in the way of a conversion, for the dialog and for the guard. */
export function payerCheck(encounterId) {
  const e = get('SELECT e.*, p.payer_type patient_payer_type, p.payer_id patient_payer_id, p.payer_name patient_payer_name, p.policy_no FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE e.id=?', encounterId);
  if (!e) fail(404, 'encounter_not_found');
  const { adm, ids } = scope(e.id);
  const ph = ids.map(() => '?').join(',');
  const bills = all(`SELECT id, bill_no, bill_type, payer_type, total, paid, balance, status, claim_id FROM bills WHERE encounter_id IN (${ph}) AND status<>'cancelled' ORDER BY id`, ...ids);
  const receipts = all(`SELECT py.id, py.receipt_no, py.amount, py.mode, py.created_at, b.bill_no, b.id bill_id FROM payments py JOIN bills b ON b.id=py.bill_id
      WHERE b.encounter_id IN (${ph}) AND b.status<>'cancelled' AND coalesce(py.cancelled,0)=0 ORDER BY py.id`, ...ids);
  const settlements = all(`SELECT s.id, s.mode, s.amount, s.payer_name, s.settled_amount, s.status, b.bill_no FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
      WHERE b.encounter_id IN (${ph}) AND b.status<>'cancelled' AND s.status<>'cancelled' ORDER BY s.id`, ...ids);
  const isPayerEntry = (s) => PAYERS.includes(s.mode) || s.payer_name === 'Package adjustment';
  const reversible = settlements.filter((s) => isPayerEntry(s) && !(+s.settled_amount > 0));
  const blocking = settlements.filter((s) => !reversible.includes(s)).map((s) => ({
    ...s, why: isPayerEntry(s) ? 'Payer money already received on this entry' : s.mode === 'free' ? 'Approved free / waiver' : 'Settlement needs review' }));
  const current = visitBillingCategory(e.patient_id,e.id);
  return {
    encounter_id: e.id, encounter_no: e.encounter_no, kind: e.kind, admission_id: adm?.id || null, ip_no: adm?.ip_no || null,
    current: { category: current === 'scheme' ? 'aarogyasri' : current, payer_id: e.patient_payer_id, payer_name: e.patient_payer_name, policy_no: e.policy_no },
    received: r2(receipts.reduce((s, p) => s + p.amount, 0)), receipts, bills, reversible, blocking,
  };
}

/**
 * Convert. b = { category, payer_id, policy_no, reason, money_action: 'keep'|'refund', refund_mode, reverse_payer_entries }.
 * opts.refundAuthorized: an approved request whose requester could refund (the approver need not hold a cash desk).
 * Runs inside the caller's transaction. Returns what changed, for the audit entry.
 */
export function convertPayer(req, encounterId, b = {}, opts = {}) {
  const reason = String(b.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  const category = b.category === 'scheme' ? 'aarogyasri' : b.category;
  if (!CATEGORIES.includes(category)) fail(400, 'category_invalid');
  const payer = b.payer_id ? get('SELECT * FROM payers WHERE id=? AND active=1', +b.payer_id) : null;
  if (b.payer_id && !payer) fail(400, 'payer_not_found');
  const normalized = payer?.payer_type === 'tpa' ? 'insurance' : payer?.payer_type;
  if (PAYER_TYPES.includes(category) && (!payer || normalized !== category)) fail(400, 'payer_category_mismatch');

  const chk = payerCheck(encounterId);
  const e = get('SELECT * FROM encounters WHERE id=?', encounterId);
  requireSchemeAdmission(category,e.patient_id,e.id,chk.admission_id);
  if (['closed', 'cancelled'].includes(e.stage) && !chk.admission_id) fail(409, 'visit_closed');
  if (chk.current.category === category && (chk.current.payer_id || null) === (payer?.id || null)) fail(409, 'payer_unchanged');
  if (chk.blocking.length) fail(409, 'existing_settlements_need_review', { settlements: chk.blocking });
  if (chk.reversible.length && !b.reverse_payer_entries) fail(409, 'payer_entries_to_reverse', { settlements: chk.reversible });
  const toPayer = PAYER_TYPES.includes(category);
  // money already received: moving onto a payer needs an explicit decision about it
  if (toPayer && chk.received > 0.005 && !['keep', 'refund'].includes(b.money_action)) fail(409, 'money_received_choose_action', { received: chk.received, receipts: chk.receipts });
  const refundMode = b.refund_mode || 'cash';
  if (toPayer && b.money_action === 'refund' && chk.received > 0.005) {
    if (!MONEY.includes(refundMode)) fail(400, 'payment_mode_invalid');
    if (!opts.refundAuthorized && !can(req.user, 'payment.collect') && !can(req.user, 'payment.refund')) fail(403, 'forbidden', { need: 'payment.collect' });
  }

  const note = `Payer changed to ${payer?.name || LABEL[category]}: ${reason}`;
  // 1. the old arrangement's unpaid payer entries go back to open balance
  const reversed = chk.reversible.map((s) => { cancelSettlement(req, s.id, note); return { settlement_id: s.id, bill_no: s.bill_no, mode: s.mode, amount: s.amount }; });
  // 2. money back to the patient when a payer now covers it (the charge stays; no credit note)
  const refunds = [];
  if (toPayer && b.money_action === 'refund') {
    for (const bill of chk.bills) {
      const paid = r2(get('SELECT paid FROM bills WHERE id=?', bill.id).paid);
      if (paid > 0.005) { const r = refund(req, { bill_id: bill.id, amount: paid, mode: refundMode, reason: note, noCreditNote: true }); refunds.push({ bill_no: bill.bill_no, amount: paid, mode: refundMode, refund_no: r.refund.refund_no }); }
    }
  }
  // 3. the patient, the admission and the open bills now name the new payer
  const patient = get('SELECT id, payer_type, payer_id, payer_name, policy_no FROM patients WHERE id=?', e.patient_id);
  update('patients', e.patient_id, { payer_type: category, payer_id: payer?.id || null, payer_name: payer?.name || null, policy_no: toPayer ? (b.policy_no || patient.policy_no || null) : (b.policy_no || null) });
  if (chk.admission_id) update('admissions', chk.admission_id, { financial_category: category });
  for (const bill of chk.bills) run('UPDATE bills SET payer_type=? WHERE id=?', category, bill.id);
  for (const bill of chk.bills) recalcBill(bill.id);   // links each bill to its payer case (or unlinks it)
  // 4. the payer case
  let claim = null;
  if (chk.admission_id) {
    claim = ensurePayerCase(get('SELECT * FROM admissions WHERE id=?', chk.admission_id));
    if (claim && payer) update('insurance_claims', claim.id, { payer_id: payer.id, tpa: payer.name, policy_no: b.policy_no || null,
      ...(claim.payer_id && claim.payer_id !== payer.id ? { status: 'preauth_pending' } : {}) });
    if (claim && !toPayer) update('insurance_claims', claim.id, { status: 'rejected', stage_note: note });
  } else {
    claim = toPayer ? get('SELECT * FROM insurance_claims WHERE encounter_id=? AND admission_id IS NULL AND payer_type=? ORDER BY id DESC LIMIT 1', encounterId, category) : null;
    if (claim && payer) update('insurance_claims', claim.id, { payer_id: payer.id, tpa: payer.name, policy_no: b.policy_no || claim.policy_no || null,
      ...(claim.payer_id && claim.payer_id !== payer.id && claim.status !== 'preauth_pending' ? { status: 'preauth_pending', stage_note: note } : {}) });
    // an OP visit's case of another payer is closed with the reason
    run(`UPDATE insurance_claims SET status='rejected', stage_note=? WHERE encounter_id=? AND admission_id IS NULL AND status NOT IN ('settled','rejected')${claim ? ' AND id<>?' : ''}`,
      note, encounterId, ...(claim ? [claim.id] : []));
    for (const bill of chk.bills) recalcBill(bill.id);   // bills carry the case's current stage
    if (claim) billNewToPayer(req, chk.bills.map((x) => x.id));   // an approved (e.g. corporate) case takes the open balance now
  }
  for (const id of scope(encounterId).ids) {
    syncEncounterPayment(id);
    const visit=get('SELECT kind,priority FROM encounters WHERE id=?',id);
    const authorization=visit.kind==='EMG' || visit.priority==='emergency'?'emergency_override':!toPayer?'not_required':claim && ['preauth_approved','claim_submitted','settled'].includes(claim.status)?'approved':'pending';
    run("UPDATE orders SET auth_status=? WHERE encounter_id=? AND category IN ('lab','imaging') AND status NOT IN ('verified','cancelled')",authorization,id);
  }
  claim = claim ? get('SELECT id, claim_no, status, payer_type, tpa FROM insurance_claims WHERE id=?', claim.id) : null;
  return {
    before: { category: chk.current.category, payer_id: chk.current.payer_id || null, payer_name: chk.current.payer_name || null, received: chk.received },
    after: { category, payer_id: payer?.id || null, payer_name: payer?.name || null, policy_no: b.policy_no || null,
      money_action: toPayer && chk.received > 0.005 ? b.money_action : null, refunds, reversed, claim },
    reason, claim, admission_id: chk.admission_id,
  };
}

/**
 * Validate a conversion without keeping it: runs it in a savepoint and rolls back.
 * Used when a request is raised, so the desk sees guard errors (money, payer entries) at once.
 */
const DRY = Symbol('dry-run');
export function dryRunConvert(req, encounterId, b, opts) {
  let preview = null;
  try { tx(() => { preview = convertPayer(req, encounterId, b, opts); throw DRY; }); }
  catch (e) { if (e !== DRY) throw e; }
  return preview;
}

/** Open visits / admission of a patient whose payer would not follow a patient-record edit. */
export function openVisitsForPayer(patientId) {
  return all(`SELECT e.id encounter_id, e.encounter_no, e.kind, e.visit_date, a.id admission_id, a.ip_no,
      (SELECT count(*) FROM bills b WHERE b.encounter_id=e.id AND b.status<>'cancelled') bills
    FROM encounters e LEFT JOIN admissions a ON a.encounter_id=e.id AND a.status<>'discharged'
    WHERE e.patient_id=? AND (a.id IS NOT NULL OR (e.kind<>'IP' AND e.stage NOT IN ('closed','cancelled') AND e.visit_date >= date('now','localtime','-1 day')))
    ORDER BY e.id DESC`, patientId).filter((v) => v.bills > 0);
}
