/**
 * Role dashboards. Each role sees what it acts on and nothing else: the doctor
 * dashboard carries no money, the pharmacy one no P&L, the owner one no
 * dispensing queue. The route checks `dash.<view>` before calling in here.
 */
import { can, STAFF_TEAMS } from './auth.js';
import { all, get, one, today } from './db.js';
import { SEGMENT_LABEL, range as mrange } from './metrics.js';
import { pharmacyDash, receptionDash, ownerDash } from './dash-desk.js';
import { insuranceDash, qualityDash } from './dash-more.js';

const n = (sql, ...p) => one(sql, ...p) || 0;
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;

function lastDays(days, to = today()) {
  const out = [];
  const end = new Date(`${to}T00:00:00`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}
const series = (days, rows, key = 'n') => { const m = Object.fromEntries(rows.map((r) => [r.d, r[key]])); return days.map((d) => ({ d, v: m[d] || 0 })); };

/* ------------------------------------------------------------------- doctor */

function doctor(q, user) {
  const d = q.to;
  const me = q.doctor_id || user.id;
  const days = lastDays(14, d);
  return {
    kpis: {
      waiting: n("SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=? AND stage IN ('registered','vitals_pending')", d, me),
      ready_after_vitals: n("SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=? AND stage IN ('vitals_done','ready')", d, me),
      in_consult: n("SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=? AND stage='in_consult'", d, me),
      seen: n("SELECT count(*) FROM encounters WHERE visit_date=? AND doctor_id=? AND stage IN ('consulted','services_pending','closed')", d, me),
      reports_ready: n(`SELECT count(*) FROM orders o JOIN encounters e ON e.id=o.encounter_id
                          WHERE e.doctor_id=? AND o.status='verified' AND date(o.verified_at) >= date(?, '-2 day')`, me, d),
      ip_patients: n("SELECT count(*) FROM admissions WHERE consultant_id=? AND status NOT IN ('discharged','requested')", me),
      follow_ups: n(`SELECT count(*) FROM appointments WHERE doctor_id=? AND date(slot_start)=? AND visit_type<>'new' AND status IN ('booked','confirmed','arrived')`, me, d)
        + n("SELECT count(*) FROM encounters WHERE doctor_id=? AND visit_date=? AND visit_type='followup'", me, d),
      prescriptions: n('SELECT count(*) FROM prescriptions WHERE doctor_id=? AND date(created_at)=?', me, d),
      admission_requests: n("SELECT count(*) FROM admissions WHERE consultant_id=? AND status='requested'", me),
    },
    queue: all(`SELECT e.id, e.encounter_no, e.token_prefix, e.token_no, e.stage, e.priority, e.visit_type, e.opened_at,
        p.id patient_id, p.name patient_name, p.uhid, p.gender, p.age_years,
        (SELECT count(*) FROM vitals v WHERE v.encounter_id=e.id) has_vitals
      FROM encounters e JOIN patients p ON p.id=e.patient_id
      WHERE e.visit_date=? AND e.doctor_id=? AND e.stage IN ('registered','vitals_pending','vitals_done','ready','in_consult')
      ORDER BY e.priority='emergency' DESC, e.priority='urgent' DESC, e.stage IN ('vitals_done','ready') DESC, e.token_no LIMIT 50`, d, me),
    reports: all(`SELECT o.id, o.order_no, o.category, o.label, o.verified_at, p.id patient_id, p.name patient_name, p.uhid,
        (SELECT count(*) FROM lab_results r WHERE r.order_id=o.id AND r.flag='critical') critical
      FROM orders o JOIN encounters e ON e.id=o.encounter_id JOIN patients p ON p.id=o.patient_id
      WHERE e.doctor_id=? AND o.status='verified' AND date(o.verified_at) >= date(?, '-2 day') ORDER BY o.verified_at DESC LIMIT 20`, me, d),
    inpatients: all(`SELECT a.id, a.ip_no, a.admitted_at, a.status, a.diagnosis, p.id patient_id, p.name patient_name, p.uhid, bd.bed_no, w.name ward,
        cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) days
      FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
      WHERE a.consultant_id=? AND a.status NOT IN ('discharged') ORDER BY a.admitted_at LIMIT 30`, me),
    visits: series(days, all(`SELECT visit_date d, count(*) n FROM encounters WHERE doctor_id=? AND visit_date BETWEEN ? AND ? GROUP BY visit_date`, me, days[0], d)),
  };
}

/* ---------------------------------------------------------------------- lab */

function lab(q, user) {
  const d = q.to;
  const category = ['radiology','imaging_admin'].includes(user.role) || q.category === 'imaging' ? 'imaging' : 'lab';
  const pay = `coalesce((SELECT CASE WHEN e.kind='EMG' THEN 'emergency' WHEN e.kind='IP' THEN 'ip' WHEN b.status IN ('paid','covered') THEN 'paid'
                 WHEN b.authorization_status='approved' THEN 'approved'
                 WHEN b.claim_status IN ('preauth_approved','claim_submitted','settled') THEN 'payer:' || b.payer_type || ':' || b.claim_status
                 WHEN b.payer_type IN ('insurance','aarogyasri','scheme','corporate','trust') THEN 'payer:' || b.payer_type || ':' || coalesce(b.claim_status,'')
                 ELSE 'unpaid' END
                 FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id AND b.status<>'cancelled' LIMIT 1), 'unbilled')`;
  const rows = all(`SELECT o.status, ${pay} pay, count(*) n FROM orders o JOIN encounters e ON e.id=o.encounter_id
                     WHERE o.category=? AND o.status NOT IN ('cancelled') AND (o.status<>'verified' OR date(o.verified_at)=?)
                     GROUP BY o.status, pay`, category, d);
  const c = (fn) => rows.filter(fn).reduce((s, r) => s + r.n, 0);
  const days = lastDays(14, d);
  return {
    category,
    kpis: {
      ordered: c((r) => r.status !== 'verified'),
      awaiting_payment: c((r) => r.status === 'awaiting_payment'),
      paid: c((r) => r.pay === 'paid' && r.status !== 'verified'),
      due_approved: c((r) => r.pay === 'approved' && r.status !== 'verified'),
      samples_pending: c((r) => ['ordered', 'scheduled'].includes(r.status)),
      collected: c((r) => r.status === 'collected'),
      processing: c((r) => r.status === 'in_progress'),
      reports_pending: c((r) => r.status === 'reported'),
      completed_today: c((r) => r.status === 'verified'),
      critical: n(`SELECT count(DISTINCT o.id) FROM orders o JOIN lab_results r ON r.order_id=o.id
                    WHERE o.category=? AND r.flag='critical' AND (o.status<>'verified' OR date(o.verified_at)=?)`, category, d),
      revenue_today: r2(n(`SELECT coalesce(sum(l.credit-l.debit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id
          JOIN accounts a ON a.id=l.account_id WHERE a.type='income' AND l.segment=? AND v.voucher_date=?`, category === 'lab' ? 'LAB' : 'IMAGING', d)),
    },
    by_status: ['awaiting_payment', 'ordered', 'scheduled', 'collected', 'in_progress', 'reported', 'verified']
      .map((s) => ({ label: s.replace('_', ' '), value: c((r) => r.status === s) })),
    worklist: all(`SELECT o.id, o.order_no, o.label, o.status, o.priority, o.ordered_at, o.sample_id, p.name patient_name, p.uhid,
        e.kind encounter_kind, ${pay} pay
      FROM orders o JOIN patients p ON p.id=o.patient_id JOIN encounters e ON e.id=o.encounter_id
      WHERE o.category=? AND o.status NOT IN ('verified','cancelled') ORDER BY o.priority='stat' DESC, o.id LIMIT 40`, category),
    volume: series(days, all(`SELECT date(ordered_at) d, count(*) n FROM orders WHERE category=? AND status<>'cancelled'
                                AND date(ordered_at) BETWEEN ? AND ? GROUP BY d`, category, days[0], d)),
  };
}

/* --------------------------------------------------------------- nurse / IP */

function nurse(q) {
  const d = q.to;
  const beds = get(`SELECT count(*) total, sum(status='occupied') occupied, sum(status='vacant') vacant,
                           sum(status='cleaning') cleaning, sum(status='reserved') reserved, sum(status='blocked') blocked FROM beds`);
  return {
    kpis: {
      admitted: n("SELECT count(*) FROM admissions WHERE status NOT IN ('discharged','requested')"),
      beds_occupied: beds.occupied || 0, beds_vacant: beds.vacant || 0, beds_total: beds.total || 0,
      occupancy: beds.total ? Math.round((beds.occupied / beds.total) * 100) : 0,
      meds_due: n("SELECT count(*) FROM med_admin WHERE status='due' AND due_at <= datetime('now','localtime','+2 hour')"),
      meds_overdue: n("SELECT count(*) FROM med_admin WHERE status='due' AND due_at < datetime('now','localtime','-30 minute')"),
      vitals_due: n(`SELECT count(*) FROM admissions a WHERE a.status NOT IN ('discharged','requested') AND NOT EXISTS
                      (SELECT 1 FROM vitals v WHERE v.encounter_id=a.encounter_id AND v.recorded_at >= datetime('now','localtime','-6 hour'))`),
      doctor_orders: n(`SELECT count(*) FROM orders o JOIN encounters e ON e.id=o.encounter_id
                         WHERE e.kind='IP' AND o.status IN ('ordered','scheduled') AND o.category NOT IN ('admission')`),
      notes_today: n('SELECT count(*) FROM nursing_notes WHERE date(recorded_at)=?', d),
      indents_open: n("SELECT count(*) FROM ward_indents WHERE status IN ('requested','partially_dispensed')"),
      consumables_today: n("SELECT count(*) FROM ward_indents WHERE kind='consumable' AND date(requested_at)=?", d),
      discharge_requests: n("SELECT count(*) FROM admissions WHERE status IN ('discharge_initiated','clinically_cleared','financially_cleared')"),
    },
    beds,
    census: all(`SELECT a.id, a.ip_no, a.status, a.admitted_at, a.diagnosis, p.id patient_id, p.name patient_name, p.uhid, p.gender, p.age_years,
        bd.bed_no, w.name ward, u.name consultant,
        cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) days,
        (SELECT count(*) FROM med_admin m WHERE m.admission_id=a.id AND m.status='due' AND m.due_at <= datetime('now','localtime','+2 hour')) meds_due,
        (SELECT max(recorded_at) FROM vitals v WHERE v.encounter_id=a.encounter_id) last_vitals
      FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
      LEFT JOIN users u ON u.id=a.consultant_id WHERE a.status NOT IN ('discharged','requested') ORDER BY w.name, bd.bed_no LIMIT 80`),
    meds: all(`SELECT m.id, m.drug, m.dose, m.route, m.due_at, p.name patient_name, bd.bed_no FROM med_admin m
        JOIN admissions a ON a.id=m.admission_id JOIN patients p ON p.id=a.patient_id LEFT JOIN beds bd ON bd.id=a.bed_id
       WHERE m.status='due' AND m.due_at <= datetime('now','localtime','+2 hour') ORDER BY m.due_at LIMIT 25`),
    wards: all(`SELECT w.name ward, count(b.id) total, sum(b.status='occupied') occupied FROM wards w LEFT JOIN beds b ON b.ward_id=w.id
                 GROUP BY w.id ORDER BY w.name`),
  };
}

const reception = (q) => receptionDash(q);
const pharmacy = (q, user, query) => pharmacyDash(q, query || {});
const owner = (q) => ownerDash(q);

const insurance = (q) => insuranceDash(q);
const quality = (q) => qualityDash(q);

function work(q, user) {
  const teamRoles = can(user,'staff.manage') ? STAFF_TEAMS[user.role] || [] : [];
  const team = all('SELECT id,name,role FROM users WHERE active=1').filter(u => u.id === user.id || teamRoles.includes(u.role));
  const ids = new Set(team.map(u => u.id));
  const roster = all(`SELECT r.*,u.name FROM roster r JOIN users u ON u.id=r.user_id WHERE r.duty_date>=? AND r.duty_date<=? ORDER BY r.duty_date,u.name`,q.from,q.to).filter(r => ids.has(r.user_id));
  const attendance = all(`SELECT a.*,u.name FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.duty_date=? ORDER BY u.name`,today()).filter(a => ids.has(a.user_id));
  return {name:user.name, role:user.role, kpis:{team:team.length, rostered:roster.filter(r=>r.duty_date===today() && !['off','leave'].includes(r.shift)).length, present:attendance.filter(a=>['present','late'].includes(a.status)).length}, roster, attendance};
}

export const VIEWS = { reception, doctor, pharmacy, lab, nurse, owner, insurance, quality, work };
export const VIEW_PERM = { work: 'dash.work', reception: 'dash.reception', doctor: 'dash.doctor', pharmacy: 'dash.pharmacy', lab: 'dash.lab', nurse: 'dash.nurse', owner: 'dash.owner',
  insurance: 'insurance.view', quality: 'quality.view' };

/** Which dashboard a role lands on. */
export function defaultView(role) {
  return ({ cleaning:'work', cleaning_incharge:'work', hr_staff:'work', hr:'work', imaging_admin: 'lab', nursing_incharge: 'nurse', reception_admin: 'reception', pharmacy_admin: 'pharmacy', lab_admin: 'lab', admin: 'owner', owner: 'owner', accounts: 'owner', reception: 'reception', cashier: 'reception', doctor: 'doctor',
    pharmacy: 'pharmacy', store: 'pharmacy', lab: 'lab', radiology: 'lab', nurse: 'nurse', insurance: 'insurance', quality: 'quality' })[role] || null;
}

export function roleDashboard(view, user, query = {}) {
  const range = mrange(query.preset || (view === 'owner' ? 'month' : 'today'), query.from, query.to);
  const q = { ...range, doctor_id: query.doctor_id ? +query.doctor_id : null, category: query.category || null,
    segment: query.segment || null, mode: query.mode || null };
  const out = VIEWS[view](q, user, query);
  out.pending_work=[];
  const add=(label,count,href)=>{if(count)out.pending_work.push({label,count,href});};
  add('Cash handovers addressed to you',n("SELECT count(*) FROM cash_handovers WHERE handed_to=? AND status='submitted'",user.id),'/day-report');
  add('Shift handovers addressed to you',n("SELECT count(*) FROM shift_handovers WHERE to_user=? AND status='submitted'",user.id),'/day-report');
  if(can(user,'pharmacy.dispense')||can(user,'ipd.indent'))add('Ward replacements outstanding',n("SELECT count(*) FROM ward_replacements WHERE status NOT IN ('replaced','reversed')"),'/indents');
  if(can(user,'finance.view'))add('Disputed cash handovers',n("SELECT count(*) FROM cash_handovers WHERE status='disputed'"),'/counter-reconciliation');
  return { view, ...range, ...out };
}

/* Kept for the older summary endpoint. */
export function roleSummary(user, date = today()) {
  const v = defaultView(user.role);
  if (!v || v === 'owner' || v === 'reception') return null;
  return { date, ...roleDashboard(v, user, { from: date, to: date, preset: 'custom' }).kpis };
}

export { SEGMENT_LABEL };
