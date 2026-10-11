/**
 * Inpatient charge plan and accrual.
 *
 * At admission the desk ticks which recurring charges apply (bed, nursing,
 * consultant visit, monitor, oxygen …). Each is a row in admission_charges.
 * Every started 24-hour cycle of a charge becomes one line on the running IP
 * bill, so the bill is always current: three days in a ₹9,500 ICU bed shows
 * three ₹9,500 lines. Accrual is idempotent — it only adds cycles that are
 * missing — and runs whenever an admission or its bill is read, plus hourly.
 *
 * A charge can be stopped (monitor removed) or its lines waived later with a
 * reason; nothing is ever deleted.
 */
import { all, get, one, insert, update, run, nextNo, nowIso, tx } from './db.js';
import { recalcBill, priceFor } from './lib.js';
import { audit } from './auth.js';

const DAY = 86400000;
const t = (s) => new Date(String(s).replace(' ', 'T')).getTime();
const stamp = (ms) => {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** The admission's running IP bill (created if missing). */
export function ipBill(admission) {
  let bill = get(`SELECT * FROM bills WHERE encounter_id=? AND bill_type='IP' AND status<>'cancelled' ORDER BY id DESC LIMIT 1`, admission.encounter_id);
  if (!bill) {
    const p = get('SELECT payer_type FROM patients WHERE id=?', admission.patient_id);
    const id = insert('bills', { bill_no: nextNo('bill'), patient_id: admission.patient_id, encounter_id: admission.encounter_id,
      bill_type: 'IP', status: 'unpaid', payer_type: admission.financial_category || p?.payer_type || 'self', created_by: admission.created_by });
    bill = get('SELECT * FROM bills WHERE id=?', id);
  }
  return bill;
}

/** Number of started 24-hour cycles between two stamps (at least one). */
export function cycles(from, to) {
  const ms = t(to) - t(from);
  return Math.max(1, Math.ceil((ms - 60000) / DAY));   // a minute's grace so an exact 24h is one day
}

/** Add any missing daily lines for one admission. Returns the number of lines added. */
export function accrueAdmission(admissionId, asOf = nowIso()) {
  const a = get('SELECT * FROM admissions WHERE id=?', admissionId);
  if (!a || a.status === 'requested') return 0;
  const until = a.discharged_at || asOf;
  const charges = all("SELECT * FROM admission_charges WHERE admission_id=? AND status<>'cancelled'", a.id);
  if (!charges.length) return 0;
  return tx(() => {
    const bill = ipBill(a);
    let added = 0;
    for (const c of charges) {
      const end = c.ended_at && t(c.ended_at) < t(until) ? c.ended_at : until;
      if (t(end) < t(c.started_at)) continue;                 // starts in the future (a bed change at the next cycle)
      const due = c.unit === 'once' ? 1 : cycles(c.started_at, end);
      if (c.unit === 'hour') { added += accrueHourly(bill, c, end, due); continue; }
      const have = one('SELECT coalesce(max(charge_cycle),0) FROM bill_items WHERE admission_charge_id=? AND charge_cycle IS NOT NULL', c.id) || 0;
      for (let n = have + 1; n <= due; n++) {
        const day = stamp(t(c.started_at) + (n - 1) * DAY).slice(0, 10);
        insert('bill_items', {
          bill_id: bill.id, service_id: c.service_id, description: c.unit === 'once' ? c.description : `${c.description} — day ${n} (${day})`,
          category: c.category, qty: 1, rate: c.rate, amount: c.rate, admission_charge_id: c.id, charge_cycle: n,
          created_at: nowIso(),
        });
        added++;
      }
    }
    if (added) recalcBill(bill.id);
    return added;
  });
}

const HOUR = 3600000;
/**
 * Hourly charges (monitor, oxygen, ventilator by the hour): one line per 24-hour cycle
 * holding the started hours of that cycle (at most 24). The open cycle's line grows as
 * hours pass; a line that has been waived is never changed again.
 */
function accrueHourly(bill, c, end, dueCycles) {
  let changed = 0;
  for (let n = 1; n <= dueCycles; n++) {
    const from = t(c.started_at) + (n - 1) * DAY;
    const hours = Math.min(24, Math.max(1, Math.ceil((Math.min(t(end), from + DAY) - from - 60000) / HOUR)));
    const day = stamp(from).slice(0, 10);
    const description = `${c.description} — day ${n} (${day}) · ${hours} h`;
    const line = get('SELECT * FROM bill_items WHERE admission_charge_id=? AND charge_cycle=?', c.id, n);
    if (!line) {
      insert('bill_items', { bill_id: bill.id, service_id: c.service_id, description, category: c.category, qty: hours, rate: c.rate,
        amount: Math.round(hours * c.rate * 100) / 100, admission_charge_id: c.id, charge_cycle: n, created_at: nowIso() });
      changed++;
    } else if (line.qty !== hours && !get('SELECT 1 FROM bill_items WHERE waiver_of=?', line.id)) {
      update('bill_items', line.id, { qty: hours, amount: Math.round(hours * c.rate * 100) / 100, description });
      changed++;
    }
  }
  return changed;
}

export function accrueAll() {
  let n = 0;
  const per = [];
  for (const a of all("SELECT id, ip_no FROM admissions WHERE status NOT IN ('discharged','requested')")) {
    const added = accrueAdmission(a.id);
    if (added) per.push({ ip_no: a.ip_no, lines: added });
    n += added;
  }
  // daily charges added automatically are recorded like any other change
  if (n) audit(null, 'ipd.charges.accrued', 'admissions', null, { after: per, reason: 'Automatic daily charge accrual' });
  return n;
}

const serviceById = (id) => get('SELECT * FROM services WHERE id=?', id);

function bedService(bed) {
  const cls = bed.class || 'general';
  const code = /icu|nicu/.test(cls) ? 'BED-ICU' : /private/.test(cls) ? 'BED-PVT' : 'BED-GEN';
  return get('SELECT * FROM services WHERE code=?', code);
}

/** Start the bed charge for a bed, at the bed's own tariff. */
export function startBedCharge(admission, bedId, startedAt, userId) {
  const bed = get('SELECT b.*, w.name ward_name FROM beds b LEFT JOIN wards w ON w.id=b.ward_id WHERE b.id=?', bedId);
  if (!bed) return null;
  const svc = bedService(bed);
  return insert('admission_charges', {
    admission_id: admission.id, service_id: svc?.id || null, kind: 'bed', category: 'bed', unit: 'day', bed_id: bed.id,
    description: `${/icu/i.test(bed.class) ? 'ICU bed' : 'Bed'} ${bed.bed_no}${bed.ward_name ? ` · ${bed.ward_name}` : ''}`,
    rate: bed.tariff || svc?.price || 0, started_at: startedAt, added_by: userId,
  });
}

/** Add a recurring (or one-off) charge from the service master or free text. */
export function addCharge(admission, { service_id, description, rate, unit, started_at }, userId) {
  const svc = service_id ? serviceById(+service_id) : null;
  if (service_id && !svc) throw Object.assign(new Error('service_not_found'), { http: 404 });
  const r = rate !== undefined && rate !== '' ? +rate : svc ? priceFor(svc, admission.patient_id) : undefined;
  if (!Number.isFinite(r) || r < 0) throw Object.assign(new Error('rate_invalid'), { http: 400 });
  if (svc && all("SELECT 1 FROM admission_charges WHERE admission_id=? AND service_id=? AND status='active'", admission.id, svc.id).length) {
    throw Object.assign(new Error('charge_already_active'), { http: 409 });
  }
  return insert('admission_charges', {
    admission_id: admission.id, service_id: svc?.id || null, kind: 'service',
    category: svc?.category === 'consultation' ? 'consultation' : svc?.category || 'ipd',
    unit: unit || svc?.billing_unit || 'day', description: description || svc?.name || 'Charge', rate: r,
    started_at: started_at || nowIso(), added_by: userId,
  });
}

/** Stop a charge from now on. Cycles already started stay billed (waive them separately). */
export function stopCharge(chargeId, reason, userId, at = nowIso()) {
  const c = get('SELECT * FROM admission_charges WHERE id=?', chargeId);
  if (!c || c.status !== 'active') return null;
  update('admission_charges', c.id, { status: 'stopped', ended_at: at, stop_reason: reason, stopped_by: userId });
  return c;
}

/**
 * Move to another bed. The old bed is charged to the end of the day already
 * started; the new bed's charge begins at that boundary, so no day is billed twice.
 */
export function transferBed(admission, newBedId, userId, choice = null) {
  const now = nowIso();
  const cur = get("SELECT * FROM admission_charges WHERE admission_id=? AND kind='bed' AND status='active' ORDER BY id DESC LIMIT 1", admission.id);
  let boundary = now;
  if (cur) {
    boundary = stamp(t(cur.started_at) + cycles(cur.started_at, now) * DAY);
    update('admission_charges', cur.id, { status: 'ended', ended_at: boundary, stop_reason: 'Bed transfer' });
  }
  const bedCharge = startBedCharge(admission, newBedId, boundary, userId);
  // the old ward's own charges stop and the new ward's start (the desk may change the suggestion)
  const plan = wardChargePlan(admission, newBedId);
  const stopIds = choice?.stop_charge_ids ? choice.stop_charge_ids.map(Number) : plan.stop.map((c) => c.id);
  const startIds = choice?.start_service_ids ? choice.start_service_ids.map(Number) : plan.start.map((s) => s.id);
  const kind = plan.ward_kind;
  for (const c of all("SELECT * FROM admission_charges WHERE admission_id=? AND status='active' AND kind<>'bed'", admission.id)) {
    if (!stopIds.includes(c.id)) continue;
    // a daily charge runs to the end of the day already started (like the bed); an hourly one stops now
    const end = c.unit === 'hour' ? now : stamp(Math.max(t(c.started_at), t(c.started_at) + cycles(c.started_at, now) * DAY));
    update('admission_charges', c.id, { status: 'ended', ended_at: end, stop_reason: `Moved to ${kind || 'another'} ward` });
  }
  for (const sid of [...new Set(startIds)]) {
    const svc = serviceById(sid);
    if (!svc || all("SELECT 1 FROM admission_charges WHERE admission_id=? AND service_id=? AND status='active'", admission.id, sid).length) continue;
    addCharge(admission, { service_id: sid, unit: svc.billing_unit, started_at: svc.billing_unit === 'hour' ? now : boundary }, userId);
  }
  return bedCharge;
}

/** Ward kind of a bed (general / private / special / icu / ot). */
export function wardKindOfBed(bedId) {
  return get('SELECT w.kind FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id=?', bedId)?.kind || 'general';
}
const appliesIn = (svc, kind) => !svc.ward_kinds || String(svc.ward_kinds).split(',').includes(kind);

/**
 * What a move to this bed changes: running charges that belong to other kinds of ward stop,
 * and the new ward's automatic charges (Fees & Tariffs → "Add automatically", "Applies in") start.
 */
export function wardChargePlan(admission, bedId) {
  const kind = wardKindOfBed(bedId);
  const running = all(`SELECT c.*, s.ward_kinds, s.ipd_default FROM admission_charges c LEFT JOIN services s ON s.id=c.service_id
    WHERE c.admission_id=? AND c.status='active' AND c.kind<>'bed'`, admission.id);
  const stop = running.filter((c) => c.ward_kinds && !String(c.ward_kinds).split(',').includes(kind));
  const runningIds = new Set(running.filter((c) => !stop.includes(c)).map((c) => c.service_id));
  const start = all(`SELECT id, code, name, price, billing_unit, ward_kinds FROM services
    WHERE active=1 AND ipd_default=1 AND category<>'bed' AND billing_unit IN ('day','hour')`)
    .filter((s) => appliesIn(s, kind) && !runningIds.has(s.id));
  return { ward_kind: kind, stop, start, keep: running.filter((c) => !stop.includes(c)) };
}

/** Close every running charge at discharge time. */
export function endCharges(admissionId, at) {
  run("UPDATE admission_charges SET status='ended', ended_at=? WHERE admission_id=? AND status='active' AND started_at <= ?", at, admissionId, at);
  run("UPDATE admission_charges SET status='stopped', ended_at=?, stop_reason='Not started before discharge' WHERE admission_id=? AND status='active'", at, admissionId);
}

export function chargePlan(admissionId) {
  const rows = all(`SELECT c.*, u.name added_by_name, s.name stopped_by_name,
      (SELECT count(*) FROM bill_items bi WHERE bi.admission_charge_id=c.id AND bi.charge_cycle IS NOT NULL) days_billed,
      (SELECT coalesce(sum(bi.qty),0) FROM bill_items bi WHERE bi.admission_charge_id=c.id AND bi.charge_cycle IS NOT NULL) qty_billed,
      (SELECT coalesce(sum(bi.amount),0) FROM bill_items bi WHERE bi.admission_charge_id=c.id) amount
    FROM admission_charges c LEFT JOIN users u ON u.id=c.added_by LEFT JOIN users s ON s.id=c.stopped_by
    WHERE c.admission_id=? ORDER BY c.status='active' DESC, c.id`, admissionId);
  return rows;
}

export { stamp };
