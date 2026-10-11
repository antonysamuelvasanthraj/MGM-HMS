/**
 * Package utilisation — one engine for every package, self-pay or payer.
 *
 * A package is a fixed price for a stay or visit. Each charge of that stay is classified against the
 * package's rules, in the order it was incurred:
 *   excluded — marked "patient pays" (an exclusion the desk or insurer set)
 *   covered  — a listed service within its allowance; a covered category; bed / daily charges within the
 *              covered days; medicines and consumables within the pharmacy limit
 *   excess   — everything else, or the part of a line beyond an allowance → the patient pays it on top
 *
 * Self-pay: the patient owes the package price + excess + exclusions. The covered charges stay on the bill
 * (clinical and revenue record) and are offset by a "Package adjustment" entry posted to its own contra-revenue
 * account, so nothing is charged twice. Charges are never edited; adjustments are re-posted when usage changes.
 *   OP / day-care package: adjusted as soon as covered work is billed (covered lab work is released at once).
 *   Admission: the running IP bill is adjusted at discharge (or when the desk reconciles); the live view shows
 *   the position during the stay.
 * Payer package (insurance case with a package): at discharge, excess / excluded lines are marked "patient pays"
 * so the payer is billed only what the package covers (payer-billing.js then caps at the package price).
 *
 * A package with no coverage rules set is all-inclusive (every charge covered), as packages always were.
 */
import { all, get, one, insert, update, nowIso } from './db.js';
import { addSettlement, cancelSettlement, releaseOrders } from './payments.js';
import { recalcBill, fail } from './lib.js';

const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const PHARMACY = ['pharmacy', 'consumable', 'medicine'];
export const COVER_CATEGORIES = [
  ['bed', 'Room / bed'], ['ipd', 'Daily ward charges (nursing, monitor, diet …)'], ['consultation', 'Doctor visits / consultation'],
  ['lab', 'Laboratory'], ['imaging', 'Imaging'], ['procedure', 'Procedures, OT and surgeon fees'], ['emergency', 'Emergency charges'],
  ['pharmacy', 'Medicines and consumables'], ['other', 'Other charges'],
];

/** Coverage rules of a package (null categories = all-inclusive). */
export function packageRules(pkg) {
  let categories = null;
  try { const c = JSON.parse(pkg.cover_categories || 'null'); if (Array.isArray(c)) categories = c; } catch { categories = null; }
  return {
    allInclusive: categories === null,
    categories: categories || COVER_CATEGORIES.map(([k]) => k),
    days: pkg.los_days ? Number(pkg.los_days) : null,
    pharmacyLimit: pkg.pharmacy_limit === null || pkg.pharmacy_limit === undefined || pkg.pharmacy_limit === '' ? null : Number(pkg.pharmacy_limit),
    items: all('SELECT service_id, qty FROM package_items WHERE package_id=?', pkg.id),
  };
}

/** The encounters a stay covers: the visit / admission, and the ER visit it came from. */
function stayEncounters(a) {
  const ids = [a.encounter_id].filter(Boolean);
  const adm = a.admission_id ? get('SELECT * FROM admissions WHERE id=?', a.admission_id) : null;
  if (adm?.emergency_id) { const er = get('SELECT encounter_id FROM emergency_cases WHERE id=?', adm.emergency_id)?.encounter_id; if (er) ids.push(er); }
  return [...new Set(ids)];
}

/** Every charge line of the stay with its net amount (waivers and returns taken off), oldest first. */
function stayLines(a) {
  const encs = stayEncounters(a);
  if (!encs.length) return [];
  const rows = all(`SELECT i.*, b.bill_no, b.bill_type, b.status bill_status FROM bill_items i JOIN bills b ON b.id=i.bill_id
      WHERE b.encounter_id IN (${encs.map(() => '?').join(',')}) AND b.status<>'cancelled' AND i.waiver_of IS NULL AND i.amount>0
        AND i.category<>'package' ORDER BY coalesce(i.created_at, b.created_at), i.id`, ...encs);
  // OT cases billed on their own bill (day care) for this patient during the stay
  const ot = a.admission_id ? [] : all(`SELECT i.*, b.bill_no, b.bill_type, b.status bill_status FROM bill_items i JOIN bills b ON b.id=i.bill_id
      JOIN ot_bookings o ON o.bill_id=b.id WHERE o.patient_id=? AND b.encounter_id IS NULL AND b.status<>'cancelled' AND i.amount>0
        AND date(b.created_at) >= date(?)`, a.patient_id, a.assigned_at);
  return [...rows, ...ot].map((l) => {
    const waived = one('SELECT coalesce(sum(-amount),0) FROM bill_items WHERE waiver_of=?', l.id) || 0;
    const returned = l.qty > 0 && l.returned_qty ? (l.amount * l.returned_qty) / l.qty : 0;
    return Object.assign(l, { net: r2(Math.max(0, l.amount - waived - returned)) });
  }).filter((l) => l.net > 0.005);
}

/** Classify the stay's charges against the package. */
export function packageUsage(a) {
  const pkg = get('SELECT * FROM packages WHERE id=?', a.package_id);
  const rules = packageRules(pkg);
  const left = new Map(rules.items.map((i) => [i.service_id, i.qty]));
  const daysUsed = new Map();        // daily charge plan → days counted
  let pharmacyLeft = rules.pharmacyLimit;
  const lines = stayLines(a).map((l) => {
    const out = { bill_item_id: l.id, bill_id: l.bill_id, bill_no: l.bill_no, description: l.description, category: l.category, qty: l.qty, amount: l.net, covered: 0, excess: 0, excluded: 0, rule: '' };
    if (l.patient_pays) { out.excluded = l.net; out.rule = 'Excluded — patient pays'; return out; }
    if (rules.allInclusive) { out.covered = l.net; out.rule = 'Included'; return out; }
    // a listed service, within its allowance
    if (l.service_id && left.has(l.service_id)) {
      const can = Math.min(left.get(l.service_id), l.qty || 1);
      left.set(l.service_id, left.get(l.service_id) - can);
      const part = r2((l.net * can) / (l.qty || 1));
      out.covered = part; out.excess = r2(l.net - part);
      out.rule = out.excess > 0 ? 'Listed service — beyond the allowance' : 'Listed service';
      return out;
    }
    const cat = PHARMACY.includes(l.category) ? 'pharmacy' : l.category;
    if (!rules.categories.includes(cat)) { out.excess = l.net; out.rule = 'Not covered by the package'; return out; }
    // bed and daily charges: within the covered days
    if ((cat === 'bed' || l.admission_charge_id) && rules.days !== null) {
      const k = l.admission_charge_id || `${cat}`;
      const n = (daysUsed.get(k) || 0) + 1; daysUsed.set(k, n);
      if (n > rules.days) { out.excess = l.net; out.rule = `Day ${n} — beyond the ${rules.days} covered day(s)`; return out; }
      out.covered = l.net; out.rule = `Day ${n} of ${rules.days}`; return out;
    }
    if (cat === 'pharmacy' && pharmacyLeft !== null) {
      const part = r2(Math.min(l.net, Math.max(0, pharmacyLeft)));
      pharmacyLeft = r2(pharmacyLeft - part);
      out.covered = part; out.excess = r2(l.net - part);
      out.rule = out.excess > 0 ? 'Medicines beyond the package limit' : 'Medicines within the package limit';
      return out;
    }
    out.covered = l.net; out.rule = 'Covered category';
    return out;
  });
  const sum = (k) => r2(lines.reduce((s, l) => s + l[k], 0));
  const posted = r2(one(`SELECT coalesce(sum(amount),0) FROM bill_settlements WHERE status<>'cancelled' AND payer_name='Package adjustment' AND reference=?`, `PKGA-${a.id}`) || 0);
  return {
    assignment: a, package: pkg, rules: { all_inclusive: rules.allInclusive, categories: rules.categories, days: rules.days, pharmacy_limit: rules.pharmacyLimit },
    lines, covered: sum('covered'), excess: sum('excess'), excluded: sum('excluded'), price: a.price,
    allowances: rules.items.map((i) => ({ service_id: i.service_id, name: get('SELECT name FROM services WHERE id=?', i.service_id)?.name, allowed: i.qty, used: i.qty - (left.get(i.service_id) ?? 0) })),
    pharmacy: { limit: rules.pharmacyLimit, used: r2(lines.filter((l) => PHARMACY.includes(l.category) || l.category === 'pharmacy').reduce((s, l) => s + l.covered, 0)) },
    days_used: Math.max(0, ...[...daysUsed.values(), 0]),
    patient_owes: r2(a.price + sum('excess') + sum('excluded')),
    margin: r2(a.price - sum('covered')),
    adjustment_posted: posted,
  };
}

/** The active package of a patient's open stay or visit, if any. */
export function activeAssignment({ encounterId = null, admissionId = null, patientId = null } = {}) {
  if (admissionId) return get("SELECT * FROM package_assignments WHERE admission_id=? AND status='active' ORDER BY id DESC LIMIT 1", admissionId);
  if (encounterId) {
    const direct = get("SELECT * FROM package_assignments WHERE encounter_id=? AND status='active' ORDER BY id DESC LIMIT 1", encounterId);
    if (direct) return direct;
    const adm = get('SELECT a.id FROM admissions a JOIN emergency_cases e ON e.id=a.emergency_id WHERE e.encounter_id=?', encounterId);
    return adm ? get("SELECT * FROM package_assignments WHERE admission_id=? AND status='active' ORDER BY id DESC LIMIT 1", adm.id) : null;
  }
  if (patientId) return get(`SELECT pa.* FROM package_assignments pa LEFT JOIN admissions ad ON ad.id=pa.admission_id
    WHERE pa.patient_id=? AND pa.status='active' AND (ad.id IS NULL OR ad.status<>'discharged') ORDER BY pa.id DESC LIMIT 1`, patientId);
  return null;
}

/**
 * Post the package adjustments a self-pay package needs, bill by bill (idempotent).
 * `final` also adjusts a running IP bill (discharge / desk reconciliation). Returns the usage.
 */
export function applyPackage(req, a, { final = false } = {}) {
  if (!a || a.status !== 'active' || a.claim_id) return a ? packageUsage(a) : null;
  const u = packageUsage(a);
  const admissionOpen = a.admission_id && get("SELECT 1 FROM admissions WHERE id=? AND status<>'discharged'", a.admission_id);
  const byBill = new Map();
  for (const l of u.lines) byBill.set(l.bill_id, r2((byBill.get(l.bill_id) || 0) + l.covered));
  // bills that no longer carry covered lines lose any earlier adjustment
  for (const s of all(`SELECT s.bill_id FROM bill_settlements s WHERE s.status<>'cancelled' AND s.payer_name='Package adjustment' AND s.reference=?`, `PKGA-${a.id}`)) if (!byBill.has(s.bill_id)) byBill.set(s.bill_id, 0);
  for (const [billId, want] of byBill) {
    const bill = get('SELECT * FROM bills WHERE id=?', billId);
    if (!bill || bill.status === 'cancelled') continue;
    if (bill.bill_type === 'IP' && admissionOpen && !final) continue;     // the running bill is settled at discharge
    const existing = all(`SELECT * FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' AND payer_name='Package adjustment' AND reference=?`, billId, `PKGA-${a.id}`);
    const have = r2(existing.reduce((s, x) => s + x.amount, 0));
    if (Math.abs(have - want) < 0.01) continue;
    for (const x of existing) cancelSettlement(req, x.id, 'Package usage recalculated');
    const fresh = get('SELECT * FROM bills WHERE id=?', billId);
    const amount = r2(Math.min(want, Math.max(0, fresh.balance)));       // never more than is still owed on that bill
    if (amount > 0.005) {
      addSettlement(req, { bill_id: billId, mode: 'free', amount, payer_name: 'Package adjustment', reference: `PKGA-${a.id}`, byApprovedCase: true,
        reason: `Covered by package ${u.package.name} (${a.assignment_no})` });
    }
    recalcBill(billId);
    releaseOrders(billId);
  }
  return packageUsage(a);
}

/** Payer package at discharge: what the package does not cover is the patient's to pay. */
export function markPayerPackageExclusions(claimId) {
  const c = get('SELECT * FROM insurance_claims WHERE id=?', claimId);
  if (!c?.package_id) return 0;
  const pkg = get('SELECT * FROM packages WHERE id=?', c.package_id);
  if (packageRules(pkg).allInclusive) return 0;
  const u = packageUsage({ id: 0, package_id: pkg.id, price: pkg.price, patient_id: c.patient_id, encounter_id: c.encounter_id, admission_id: c.admission_id, assigned_at: c.created_at });
  let n = 0;
  for (const l of u.lines) if (l.excess > 0.005 && l.covered < 0.005) { update('bill_items', l.bill_item_id, { patient_pays: 1 }); n++; }
  for (const b of new Set(u.lines.filter((l) => l.excess > 0).map((l) => l.bill_id))) recalcBill(b);
  return n;
}

/** Create a self-pay package on a visit or admission. The price goes on the bill the patient settles. */
export function assignPackage(req, { packageId, patientId, encounterId = null, admissionId = null, billId = null, notes = null }) {
  const pkg = get('SELECT * FROM packages WHERE id=? AND active=1', packageId);
  if (!pkg) fail(400, 'package_unavailable');
  if (pkg.payer_id) fail(400, 'payer_package_requires_case');
  if (activeAssignment({ encounterId, admissionId })) fail(409, 'visit_already_has_package');
  const id = insert('package_assignments', {
    assignment_no: `PKGA-${Date.now().toString(36).toUpperCase()}`, package_id: pkg.id, patient_id: patientId, encounter_id: encounterId,
    admission_id: admissionId, bill_id: billId, price: pkg.price, status: 'active', assigned_by: req.user.id, assigned_at: nowIso(), notes,
  });
  return get('SELECT * FROM package_assignments WHERE id=?', id);
}
