/**
 * Insurance policy terms on a payer case, beyond the fixed co-pay the case already had:
 *
 *   room-rent limit   room above the policy's daily limit is the patient's; and, when the policy
 *                     applies proportional deduction, consultation / procedure / IP service charges
 *                     are reduced in the same ratio (pharmacy, implants, consumables and diagnostics
 *                     are not, as IRDAI requires);
 *   sub-limits        the most the payer pays for a category (e.g. pharmacy ₹16,000);
 *   deductible        a fixed amount the patient pays before the policy pays;
 *   co-pay %          a share of what is left.
 *
 * The total is treated as part of the case co-pay: payer billing leaves it on the bills, and the
 * collection desk sees it as the patient's to pay. Exclusions (lines marked "patient pays") stay
 * separate, as before. Only an amount the policy terms allow is ever moved to the patient.
 */
import { all, get } from './db.js';
import {itemMoney} from './accounting.js';
import {patientLineAmount} from './payer-lines.js';

const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
/** Charges reduced in the room-rent ratio ("associated medical expenses"). */
export const PROPORTIONAL_CATEGORIES = ['consultation', 'ipd', 'procedure', 'nursing'];

function caseLines(c) {
  return all(`SELECT bi.id, bi.bill_id, bi.description, bi.category, bi.qty, bi.rate, bi.amount,bi.gst_pct,bi.tax_inclusive, bi.patient_pays,bi.patient_pay_amount,
      ac.unit charge_unit, b.bill_no, b.bill_type
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id LEFT JOIN admission_charges ac ON ac.id=bi.admission_charge_id
    WHERE b.claim_id=? AND b.status<>'cancelled' AND bi.amount>0 AND bi.waiver_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM bill_items w WHERE w.waiver_of=bi.id) ORDER BY b.id, bi.id`, c.id).map(l=>({...l,amount:itemMoney(l).total,patient_pay_amount:patientLineAmount(l)}));
}

/** Patient share from the policy terms, with the working shown. */
export function policyShare(c) {
  const lines = caseLines(c);
  const gross = r2(lines.reduce((s, l) => s + l.amount, 0));
  const exclusions = r2(lines.filter((l) => l.patient_pays).reduce((s, l) => s + Math.min(l.amount, l.patient_pay_amount), 0));
  const covered = lines.map(l=>({...l,amount:r2(l.amount-(l.patient_pays?l.patient_pay_amount:0))})).filter(l=>l.amount>0);
  const out = { gross, exclusions, room_excess: 0, proportional: 0, ratio: 1, sublimit_excess: 0, sublimits: [], deductible: 0, copay_pct_amount: 0, lines: [] };
  const lineShare = new Map(covered.map((l) => [l.id, 0]));

  // room-rent limit, per day
  const limit = +c.room_rent_limit || 0;
  if (limit > 0) {
    const rooms = covered.filter((l) => l.category === 'bed');
    let days = 0, roomTotal = 0;
    for (const l of rooms) {
      const perDay = l.charge_unit === 'hour' ? l.rate * 24 : l.rate;
      const d = l.charge_unit === 'hour' ? l.qty / 24 : l.qty;
      days += d; roomTotal += l.amount;
      const excess = r2(Math.min(l.amount,Math.max(0, perDay - limit) * d));
      if (excess > 0) lineShare.set(l.id, lineShare.get(l.id) + excess);
      out.room_excess += excess;
    }
    out.room_excess = r2(out.room_excess);
    const avgPerDay = days ? roomTotal / days : 0;
    if (avgPerDay > limit && c.proportional_deduction !== 0) {
      out.ratio = Math.round((limit / avgPerDay) * 10000) / 10000;
      for (const l of covered.filter((x) => PROPORTIONAL_CATEGORIES.includes(x.category))) {
        const cut = r2(l.amount * (1 - out.ratio));
        lineShare.set(l.id, lineShare.get(l.id) + cut);
        out.proportional += cut;
      }
      out.proportional = r2(out.proportional);
    }
  }

  // category sub-limits on what is left of each category after the room-rent cuts
  let limits = {};
  try { limits = JSON.parse(c.sub_limits || '{}') || {}; } catch { limits = {}; }
  for (const [cat, cap] of Object.entries(limits)) {
    if (!(+cap >= 0)) continue;
    const inCat = covered.filter((l) => l.category === cat);
    const after = r2(inCat.reduce((s, l) => s + l.amount - lineShare.get(l.id), 0));
    const excess = r2(Math.max(0, after - +cap));
    if (excess > 0) {
      out.sublimits.push({ category: cat, limit: +cap, claimed: after, excess });
      out.sublimit_excess = r2(out.sublimit_excess + excess);
      // spread over the category's lines for the statement
      let left = excess;
      for (const l of inCat) { const room = l.amount - lineShare.get(l.id); const take = r2(Math.min(left, room * (excess / after))); lineShare.set(l.id, lineShare.get(l.id) + take); left = r2(left - take); }
    }
  }

  const eligible = r2(gross - exclusions - out.room_excess - out.proportional - out.sublimit_excess);
  out.deductible = r2(Math.min(Math.max(0, eligible), +c.deductible_amount || 0));
  out.copay_pct_amount = r2(Math.max(0, eligible - out.deductible) * ((+c.copay_pct || 0) / 100));
  out.extra = r2(out.room_excess + out.proportional + out.sublimit_excess + out.deductible + out.copay_pct_amount);
  out.copay_fixed = r2(+c.copay_amount || 0);
  out.patient_total = r2(exclusions + out.extra + Math.min(out.copay_fixed, Math.max(0, eligible - out.deductible - out.copay_pct_amount)));
  out.payer_total = r2(Math.max(0, gross - out.patient_total));
  if (+c.approved > 0 && out.payer_total > +c.approved) { out.over_approval = r2(out.payer_total - c.approved); out.payer_total = r2(+c.approved); out.patient_total = r2(gross - out.payer_total); }
  out.lines = lines.map((l) => {
    const patient = r2(Math.min(l.amount,(l.patient_pays?l.patient_pay_amount:0)+(lineShare.get(l.id)||0)));
    return { bill_no: l.bill_no, description: l.description, category: l.category, amount: l.amount, patient: r2(patient), claimed: r2(l.amount - patient),
      reason: l.patient_pays ? 'Not covered (exclusion)' : patient > 0 ? (l.category === 'bed' ? 'Room above the daily limit' : PROPORTIONAL_CATEGORIES.includes(l.category) && out.ratio < 1 ? 'Proportional deduction (room rent)' : 'Above the sub-limit') : '' };
  });
  return out;
}

/** The case co-pay including the policy terms — what payer billing and the collection desk leave with the patient. */
export const effectiveCopay = (c) => (c ? r2((+c.copay_amount || 0) + (hasTerms(c) ? policyShare(c).extra : 0)) : 0);
const hasTerms = (c) => (+c.room_rent_limit > 0) || (+c.deductible_amount > 0) || (+c.copay_pct > 0) || (c.sub_limits && c.sub_limits !== '{}');
export { get };
