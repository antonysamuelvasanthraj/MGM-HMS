import { all, get } from './db.js';

const deferred = ['insurance', 'aarogyasri', 'corporate', 'trust'];
const round = v => Math.round(Math.max(0, Number(v) || 0) * 100) / 100;

/** Pending payer charges are not patient cash dues. Allocate a case's co-pay once. */
export function collectionPolicy(bill) {
  const balance = round(bill.balance);
  const finish=policy=>{
    const open=round(get("SELECT coalesce(sum(amount-settled_amount-written_off-transferred_to_patient),0) value FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' AND mode NOT IN ('free','due')",bill.id)?.value);
    return {...policy,payer_receivable:open,financial_status:bill.status==='cancelled'?'cancelled':policy.patient_due>0.005?'patient_collection_required':open+policy.payer_pending>0.005?'patient_cleared_payer_pending':'fully_settled'};
  };
  if (!deferred.includes(bill.payer_type)) return finish({ patient_due: balance, payer_pending: 0, deferred_collection: ['credit', 'due', 'free'].includes(bill.payer_type) });
  const claim = bill.claim_id ? get('SELECT * FROM insurance_claims WHERE id=?', bill.claim_id) : null;
  const rows = claim ? all("SELECT * FROM bills WHERE claim_id=? AND status<>'cancelled' ORDER BY bill_type='IP', id", claim.id) : [bill];
  let copay = round(claim?.copay_amount);
  // Money above exclusions already paid on any case bill meets the single case co-pay.
  const exclusions = b => round(get('SELECT coalesce(sum(coalesce(patient_pay_amount,amount)),0) v FROM bill_items WHERE bill_id=? AND patient_pays=1 AND amount>0', b.id)?.v);
  copay = round(copay - rows.reduce((sum, b) => sum + Math.max(0, b.paid - exclusions(b)), 0));
  let patientDue = 0;
  for (const b of rows) {
    const exclusionDue = Math.min(round(b.balance), round(exclusions(b) - b.paid));
    const share = Math.min(round(b.balance - exclusionDue), copay);
    copay = round(copay - share);
    if (b.id === bill.id) {
      const transferred = round(get("SELECT coalesce(sum(transferred_to_patient),0) v FROM bill_settlements WHERE bill_id=? AND status<>'cancelled'", b.id)?.v);
      patientDue = Math.min(balance, round(exclusionDue + share + Math.max(0, transferred - Math.max(0, b.paid - exclusions(b) - round(claim?.copay_amount)))));
    }
  }
  return finish({ patient_due: patientDue, payer_pending: round(balance - patientDue), deferred_collection: true });
}
