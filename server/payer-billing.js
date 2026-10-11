/**
 * Approved payer cases pay their bills.
 *
 * When a case is approved (pre-auth approved, claim submitted or settled), the
 * open balance of every bill on it moves to the payer as a receivable — the
 * same settlement reception makes with "Authorize → Insurance / …". The
 * payer's approval is the authority, so it works whoever's action triggered it
 * (a doctor's order, a pharmacy sale, an ER charge).
 *
 *   - Lines marked "patient pays" (package exclusions, non-payable items) stay with the patient.
 *   - The move is capped at the approved amount when one is entered; the rest stays with the patient.
 *   - A running IP bill moves only at discharge, when it is final.
 *   - A case with a package: the payer is billed the package price; the part of the itemised
 *     bill above it (other than exclusions) is written off as a package adjustment. For an
 *     admission this happens at discharge, when the bill is final.
 *   - If the case goes back to query / rejected, payer entries not yet paid are reversed and
 *     the amount returns to the patient's balance.
 *
 * Nothing here is collection: the payer's money arrives later as a receipt on Accounts → Receivables.
 */
import { all, get } from './db.js';
import { settleBill, cancelSettlement, PAYERS } from './payments.js';
import { isApprovedStage } from './payer-cases.js';

const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const key = (billId, tag = 'payer') => `${tag}-${billId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const modeOf = (c) => (c.payer_type === 'scheme' ? 'aarogyasri' : c.payer_type);

/** Amount on a bill the patient pays whatever the payer approves (lines marked patient_pays), limited to the open balance. */
function patientPays(bill) {
  const v = get('SELECT coalesce(sum(coalesce(patient_pay_amount,amount)),0) v FROM bill_items WHERE bill_id=? AND patient_pays=1 AND amount>0', bill.id).v || 0;
  return r2(Math.min(bill.balance, Math.max(0,v-bill.paid)));
}

/** What the payer has already been billed on this case (open or settled, not cancelled). */
const alreadyBilled = (c, mode) => r2(get(`SELECT coalesce(sum(s.amount),0) v FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
  WHERE b.claim_id=? AND s.status<>'cancelled' AND s.mode=?`, c.id, mode).v || 0);

/**
 * Move open balances of the bills on an approved case to the payer.
 * opts.billIds limits it to some bills; opts.includeIp also moves IP bills and applies the package (used at discharge).
 * Returns [{bill_id, bill_no, amount, kind}] where kind is 'payer' or 'package_adjustment'.
 */
export function billCaseToPayer(req, claimId, { billIds = null, includeIp = false } = {}) {
  const c = get('SELECT * FROM insurance_claims WHERE id=?', claimId);
  if (!c || !isApprovedStage(c.status)) return [];
  const mode = modeOf(c);
  if (!PAYERS.includes(mode)) return [];
  const pkg = c.package_id ? get('SELECT * FROM packages WHERE id=?', c.package_id) : null;
  const admissionOpen = c.admission_id && get("SELECT 1 FROM admissions WHERE id=? AND status<>'discharged'", c.admission_id);
  // a package on an admission is applied once, at discharge, against the final bill
  if (pkg && c.admission_id && !includeIp && admissionOpen) return [];

  let room = Infinity;
  const paidTowardCopay = all("SELECT b.paid, coalesce((SELECT sum(coalesce(patient_pay_amount,amount)) FROM bill_items WHERE bill_id=b.id AND patient_pays=1 AND amount>0),0) exclusions FROM bills b WHERE b.claim_id=? AND b.status<>'cancelled'",c.id).reduce((sum,b)=>sum+Math.max(0,b.paid-b.exclusions),0);
  let copayRoom = r2(Math.max(0,(c.copay_amount || 0)-paidTowardCopay));
  if (c.approved > 0) room = Math.min(room, r2(c.approved - alreadyBilled(c, mode)));
  if (pkg) room = Math.min(room, r2(Math.max(0,pkg.price-(c.copay_amount || 0)) - alreadyBilled(c, mode)));
  const bills = all(`SELECT b.* FROM bills b WHERE b.claim_id=? AND b.status<>'cancelled' AND b.balance>0.005
      ${billIds ? `AND b.id IN (${billIds.map(() => '?').join(',')})` : ''} ORDER BY b.bill_type='IP', b.id`, c.id, ...(billIds || []));
  const moved = [];
  let packageAdjustmentRoom = pkg ? Math.max(0,r2(get("SELECT coalesce(sum(b.total),0)-coalesce(sum((SELECT coalesce(sum(coalesce(patient_pay_amount,amount)),0) FROM bill_items WHERE bill_id=b.id AND patient_pays=1 AND amount>0)),0) value FROM bills b WHERE b.claim_id=? AND b.status<>'cancelled'",c.id).value-pkg.price-get("SELECT coalesce(sum(amount),0) value FROM bill_settlements WHERE claim_id=? AND status<>'cancelled' AND payer_name='Package adjustment'",c.id).value)) : 0;
  for (const b0 of bills) {
    if (b0.bill_type === 'IP' && !includeIp && get("SELECT 1 FROM admissions WHERE encounter_id=? AND status<>'discharged'", b0.encounter_id)) continue;
    const b = get('SELECT * FROM bills WHERE id=?', b0.id);
    const afterExclusions = r2(b.balance - patientPays(b));
    const copay = Math.min(afterExclusions,copayRoom);
    copayRoom = r2(copayRoom-copay);
    const payable = r2(afterExclusions-copay);
    if (payable <= 0.005) continue;
    const toPayer = r2(Math.max(0, Math.min(payable, room)));
    if (toPayer > 0.005) {
      settleBill(req, { bill_id: b.id, category: mode, request_key: key(b.id), byApprovedCase: true, claim_id: c.id,
        notes: `Billed to ${c.tpa} on approved case ${c.claim_no}${pkg ? ` (package ${pkg.name})` : ''}`,
        lines: [{ mode, amount: toPayer, payer_name: c.tpa, reference: c.policy_no || c.claim_no, reason: `Approved case ${c.claim_no}` }] });
      moved.push({ bill_id: b.id, bill_no: b.bill_no, amount: toPayer, kind: 'payer' });
      room = r2(room - toPayer);
    }
    // package: what the payer does not pay (and the patient does not owe as an exclusion) is the hospital's package adjustment
    const above = r2(Math.min(payable-toPayer,packageAdjustmentRoom));
    if (pkg && above > 0.005 && (includeIp || !c.admission_id || !admissionOpen)) {
      settleBill(req, { bill_id: b.id, request_key: key(b.id, 'pkgadj'), byApprovedCase: true, claim_id: c.id,
        notes: `Package adjustment — ${pkg.name} (${c.claim_no})`,
        lines: [{ mode: 'free', amount: above, payer_name: 'Package adjustment', reference: pkg.payer_code || pkg.code,
          reason: `Package adjustment: itemised bill above the ${pkg.name} package price, case ${c.claim_no}` }] });
      moved.push({ bill_id: b.id, bill_no: b.bill_no, amount: above, kind: 'package_adjustment' });
      packageAdjustmentRoom = r2(packageAdjustmentRoom-above);
    }
  }
  return moved;
}

/** After a desk raises or adds to bills: if they sit on an approved case, bill them to the payer too. */
export function billNewToPayer(req, billIds) {
  const out = [];
  const ids = [...new Set((billIds || []).filter(Boolean).map(Number))];
  for (const id of ids) {
    const b = get('SELECT claim_id, claim_status FROM bills WHERE id=?', id);
    if (b?.claim_id && isApprovedStage(b.claim_status)) out.push(...billCaseToPayer(req, b.claim_id, { billIds: [id] }));
  }
  return out;
}

/**
 * The case went back to query / rejected: reverse payer entries and package adjustments on it that
 * have not been paid, so the amount is owed again. Released lab / imaging work is not recalled.
 */
export function reversePayerBilling(req, claimId, reason) {
  const rows = all(`SELECT s.id, s.amount, s.mode, b.bill_no FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
      WHERE s.claim_id=? AND s.status<>'cancelled' AND coalesce(s.settled_amount,0)=0 AND (s.mode IN (${PAYERS.map(() => '?').join(',')}) OR s.payer_name='Package adjustment')`,
    claimId, ...PAYERS);
  for (const s of rows) cancelSettlement(req, s.id, reason);
  return rows.map((s) => ({ bill_no: s.bill_no, amount: s.amount, mode: s.mode }));
}
