/**
 * Month-closing reports in the shape the hospital keeps them on paper and in Excel:
 * doctor-wise revenue, daily cash closing (reception and pharmacy), cash handed over,
 * expenses by day and by head, cuts and payouts, fuel, ambulance, dues, the in-patient
 * list and the referral statement. Figures come from the ledger and transaction tables.
 */
import { all, today } from './db.js';

const r2 = (v) => Math.round((+v || 0) * 100) / 100;
const col = (key, label, type = 'text') => ({ key, label, type });
const money = (k, l) => col(k, l, 'money');
const num = (k, l) => col(k, l, 'number');
const date = (k, l) => col(k, l, 'date');
const kpi = (label, value, type = 'money') => ({ label, value, type });
const sum = (rows, k) => r2(rows.reduce((s, r) => s + (+r[k] || 0), 0));
const F = 'finance.view', R = 'reports.reception', P = 'reports.pharmacy';
const range = (q) => ({ from: q.from || today(), to: q.to || today() });
/** A handover stores what was expected and declared per mode as JSON; older rows may hold a plain number. */
const modes = (v) => { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : { cash: +o || 0 }; } catch { return { cash: +v || 0 }; } };
const allModes = (v) => r2(Object.values(modes(v)).reduce((s, x) => s + (+x || 0), 0));
const LIVE_EXPENSE = "coalesce(x.status,'') NOT IN ('cancelled','rejected','void')";

/** X-ray, CT and 2D echo are told apart by the test's name; anything else stays under other imaging. */
export function imagingGroup(name) {
  const n = String(name || '');
  if (/x-?\s?ray|radiograph/i.test(n)) return 'XRAY';
  if (/\bCT\b|computed tomography/i.test(n)) return 'CT';
  if (/echo/i.test(n)) return 'ECHO';
  return 'IMG_OTHER';
}

const MATRIX = [['OP', 'OP'], ['IP', 'IP'], ['AGS', 'AGS (Aarogyasri IP)'], ['LAB', 'LAB'], ['XRAY', 'X-RAY'], ['CT', 'CT'], ['ECHO', '2D ECHO'],
  ['IMG_OTHER', 'Other imaging'], ['PHAR', 'PHAR'], ['OTHER', 'ER / OT / other']];
const IP_SEGMENTS = ['IP', 'ICU', 'ROOM', 'NURSING', 'PACKAGE'];

/** Net income per treating doctor and department; imaging is shared out by the tests on each bill. */
export function doctorMatrix({ from, to }) {
  const lines = all(`SELECT coalesce(u.name,'Direct / unassigned') doctor, coalesce(l.segment,'OTHER') seg, b.id bill_id, b.payer_type,
      sum(CASE WHEN a.subtype='revenue' THEN l.credit-l.debit ELSE 0 END)
        - sum(CASE WHEN a.system_key IN ('discount_allowed','free_treatment','sales_returns','package_adjustment') THEN l.debit-l.credit ELSE 0 END) net
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
      LEFT JOIN bills b ON v.source='bill' AND b.id=v.source_id LEFT JOIN encounters e ON e.id=b.encounter_id
      LEFT JOIN users u ON u.id=coalesce(b.doctor_id,e.doctor_id)
    WHERE a.type='income' AND v.voucher_date BETWEEN ? AND ? GROUP BY doctor, seg, b.id`, from, to);
  const byDoctor = new Map();
  const add = (doctor, key, v) => {
    if (!byDoctor.has(doctor)) byDoctor.set(doctor, { doctor, total: 0, ...Object.fromEntries(MATRIX.map(([k]) => [k, 0])) });
    const row = byDoctor.get(doctor); row[key] += v; row.total += v;
  };
  for (const l of lines) {
    const net = l.net || 0;
    if (!net) continue;
    if (l.seg === 'IMAGING') {
      const items = l.bill_id ? all(`SELECT coalesce(s.name, bi.description) name, bi.amount FROM bill_items bi LEFT JOIN services s ON s.id=bi.service_id
        WHERE bi.bill_id=? AND bi.revenue_head='IMAGING' AND bi.amount>0`, l.bill_id) : [];
      const whole = items.reduce((s, i) => s + i.amount, 0);
      if (!whole) { add(l.doctor, 'IMG_OTHER', net); continue; }
      for (const i of items) add(l.doctor, imagingGroup(i.name), net * i.amount / whole);
    } else if (IP_SEGMENTS.includes(l.seg)) add(l.doctor, l.payer_type === 'aarogyasri' ? 'AGS' : 'IP', net);
    else add(l.doctor, { OP: 'OP', LAB: 'LAB', PHARMACY: 'PHAR' }[l.seg] || 'OTHER', net);
  }
  const rows = [...byDoctor.values()].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])))
    .sort((a, b) => b.total - a.total);
  return rows;
}

/** One line per day for a desk: what was collected by mode, cash paid out, and cash handed over. */
function cashClosing(desk) {
  return (q) => {
    const { from, to } = range(q), pharm = desk === 'pharmacy';
    const billSide = pharm ? "b.bill_type='PHARM'" : "b.bill_type<>'PHARM'";
    const pay = all(`SELECT p.pay_date d,
        sum(CASE WHEN b.bill_type='IP' THEN p.amount ELSE 0 END) ip, sum(CASE WHEN b.bill_type<>'IP' THEN p.amount ELSE 0 END) op, sum(p.amount) total,
        sum(CASE WHEN p.mode='upi' THEN p.amount ELSE 0 END) upi, sum(CASE WHEN p.mode IN ('debit_card','credit_card') THEN p.amount ELSE 0 END) card,
        sum(CASE WHEN p.mode IN ('bank_transfer','cheque') THEN p.amount ELSE 0 END) online, sum(CASE WHEN p.mode='cash' THEN p.amount ELSE 0 END) cash
      FROM payments p JOIN bills b ON b.id=p.bill_id WHERE p.cancelled=0 AND ${billSide} AND p.pay_date BETWEEN ? AND ? GROUP BY p.pay_date`, from, to);
    const refunds = all(`SELECT date(r.created_at) d, sum(r.amount) total, sum(CASE WHEN r.mode='cash' THEN r.amount ELSE 0 END) cash
      FROM refunds r JOIN bills b ON b.id=r.bill_id WHERE ${billSide} AND date(r.created_at) BETWEEN ? AND ? GROUP BY d`, from, to);
    const spent = pharm ? [] : all(`SELECT x.spent_on d, sum(x.amount) v FROM expenses x WHERE x.status='paid' AND x.mode='cash' AND x.spent_on BETWEEN ? AND ? GROUP BY x.spent_on`, from, to);
    const handed = all(`SELECT handover_date d, declared FROM cash_handovers WHERE desk=? AND status IN ('submitted','accepted') AND handover_date BETWEEN ? AND ?`, desk, from, to)
      .map((h) => ({ d: h.d, v: +modes(h.declared).cash || 0 }));
    const days = new Map();
    const day = (d) => days.get(d) || days.set(d, { d, op: 0, ip: 0, total: 0, upi: 0, card: 0, online: 0, cash: 0, returns: 0, expense: 0, handed: 0 }).get(d);
    for (const p of pay) Object.assign(day(p.d), { op: p.op, ip: p.ip, total: p.total, upi: p.upi, card: p.card, online: p.online, cash: p.cash });
    for (const r of refunds) { day(r.d).returns = r.total; day(r.d).refund_cash = r.cash; }
    for (const s of spent) day(s.d).expense = s.v;
    for (const h of handed) day(h.d).handed += h.v;
    // a handover can carry cash from earlier days, so what is still at the desk is a running balance, not a per-day figure
    let inHand = 0;
    const rows = [...days.values()].sort((a, b) => a.d.localeCompare(b.d)).map((r) => {
      const net = r2(r.cash - (r.refund_cash || 0) - r.expense);
      inHand = r2(inHand + net - r.handed);
      return { ...r, net_cash: net, in_hand: inHand };
    });
    const moneyCols = (cols) => cols.filter((c) => c.type === 'money' && c.key !== 'in_hand').map((c) => c.key);
    const columns = pharm
      ? [date('d', 'Date'), money('total', 'Total'), money('upi', 'UPI (PhonePe)'), money('card', 'Card'), money('returns', 'Sale return'), money('online', 'Online'), money('cash', 'Cash'), money('net_cash', 'Net cash'), money('handed', 'Handed over'), money('in_hand', 'Cash at desk (running)')]
      : [date('d', 'Date'), money('op', 'OP'), money('ip', 'IP'), money('total', 'Total'), money('upi', 'UPI (PhonePe)'), money('card', 'Card'), money('online', 'Online'), money('cash', 'Cash'), money('expense', 'Expenses (cash)'), money('returns', 'Refunds'), money('net_cash', 'Net cash'), money('handed', 'Handed over'), money('in_hand', 'Cash at desk (running)')];
    return { subtitle: 'Net cash = cash received − cash refunds − cash expenses paid. Handed over = cash in the handovers this desk submitted to the administrator. Cash at desk runs from the first day of the period.',
      kpis: [kpi('Collected', sum(rows, 'total')), kpi('Cash', sum(rows, 'cash')), kpi('Net cash', sum(rows, 'net_cash')), kpi('Handed over', sum(rows, 'handed')), kpi('Cash at desk at period end', rows.length ? rows[rows.length - 1].in_hand : 0)],
      columns, rows, total: moneyCols(columns) };
  };
}

const billedWith = (where, args) => all(`SELECT b.bill_date d, p.uhid, p.name patient, bi.description item, bi.qty, round(bi.amount,2) amount, b.bill_no, b.status
  FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN patients p ON p.id=b.patient_id LEFT JOIN services s ON s.id=bi.service_id
  WHERE b.status<>'cancelled' AND ${where} ORDER BY b.bill_date, b.id`, ...args);

export const MGM_REPORTS = [
  { id: 'doctor_department_matrix', group: 'Revenue', title: 'Doctors revenue — OP, IP, AGS, lab, X-ray, CT, 2D echo, pharmacy', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q); const rows = doctorMatrix({ from, to });
      return { subtitle: 'Net income by treating doctor. AGS = inpatient income billed to Aarogyasri. X-ray, CT and 2D echo are recognised from the test name.',
        kpis: [kpi('Net revenue', sum(rows, 'total')), kpi('Doctors', rows.length, 'number')],
        columns: [col('doctor', 'Doctor'), ...MATRIX.map(([k, l]) => money(k, l)), money('total', 'Total')], rows, total: [...MATRIX.map(([k]) => k), 'total'] }; } },

  { id: 'cash_closing_reception', group: 'Finance', title: 'Reception daily cash closing — OP, IP, modes, expenses, handed over', perm: F, filters: ['range'], run: cashClosing('reception') },
  { id: 'cash_closing_pharmacy', group: 'Finance', title: 'Pharmacy daily cash closing — modes, sale returns, handed over', perm: F, filters: ['range'], run: cashClosing('pharmacy') },

  { id: 'cash_handover_register', group: 'Finance', title: 'Cash handed over to the administrator — by desk and day', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = all(`SELECT h.handover_date d, h.handover_no, h.desk, u.name by_user, coalesce(t.name,'Administrator') handed_to, h.expected, h.declared, h.retained_cash, h.variance, h.status, h.notes
        FROM cash_handovers h JOIN users u ON u.id=h.user_id LEFT JOIN users t ON t.id=h.handed_to WHERE h.handover_date BETWEEN ? AND ? ORDER BY h.handover_date, h.id`, from, to)
        .map((h) => ({ ...h, expected: allModes(h.expected), cash: r2(modes(h.declared).cash), other: r2(allModes(h.declared) - (+modes(h.declared).cash || 0)) }));
      const live = rows.filter((r) => ['submitted', 'accepted'].includes(r.status));
      return { subtitle: 'Cash given = notes and coins handed to the administrator. Non-cash = UPI, card and bank slips declared with the handover.',
        kpis: [kpi('Cash handed over', sum(live, 'cash')), kpi('Non-cash declared', sum(live, 'other')), kpi('Variance', sum(live, 'variance'))],
        columns: [date('d', 'Date'), col('handover_no', 'Handover no'), col('desk', 'Desk'), col('by_user', 'Handed by'), col('handed_to', 'Handed to'), money('expected', 'Expected (all modes)'), money('cash', 'Cash given'), money('other', 'Non-cash declared'), money('retained_cash', 'Cash kept as float'), money('variance', 'Variance'), col('status', 'Status'), col('notes', 'Notes')],
        rows, total: ['expected', 'cash', 'other', 'retained_cash', 'variance'] }; } },

  { id: 'expense_daybook', group: 'Finance', title: 'Expenses — day by day', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = all(`SELECT x.spent_on d, x.voucher_no, x.head, coalesce(x.remarks, x.vendor, '') particulars, x.vendor, x.mode, x.amount FROM expenses x
        WHERE ${LIVE_EXPENSE} AND x.spent_on BETWEEN ? AND ? ORDER BY x.spent_on, x.id`, from, to);
      return { kpis: [kpi('Total expenses', sum(rows, 'amount')), kpi('Paid in cash', sum(rows.filter((r) => r.mode === 'cash'), 'amount')), kpi('Entries', rows.length, 'number')],
        columns: [date('d', 'Date'), col('voucher_no', 'Voucher'), col('head', 'Head'), col('particulars', 'Particulars'), col('vendor', 'Paid to'), col('mode', 'Mode'), money('amount', 'Amount')], rows, total: ['amount'] }; } },

  { id: 'expense_head_summary', group: 'Finance', title: 'Expenses — by head (month summary)', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = all(`SELECT x.head, count(*) entries, round(sum(x.amount),2) amount FROM expenses x WHERE ${LIVE_EXPENSE} AND x.spent_on BETWEEN ? AND ? GROUP BY x.head ORDER BY amount DESC`, from, to);
      return { kpis: [kpi('Total expenses', sum(rows, 'amount'))], columns: [col('head', 'Expense head'), num('entries', 'Entries'), money('amount', 'Amount')], rows, total: ['entries', 'amount'],
        chart: { type: 'hbar', x: 'head', series: [{ key: 'amount', label: 'Amount' }], top: 15 } }; } },

  { id: 'cuts_register', group: 'Finance', title: 'Cuts and payouts — refunds, doctor cuts, other cuts', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = [
        ...all(`SELECT date(r.created_at) d, 'Refund to patient' kind, p.name || ' (' || p.uhid || ') — ' || coalesce(r.reason,'') particulars, r.amount FROM refunds r JOIN patients p ON p.id=r.patient_id WHERE date(r.created_at) BETWEEN ? AND ?`, from, to),
        ...all(`SELECT date(v.paid_at) d, 'Doctor cut / payout' kind, d.name || coalesce(' — ' || v.notes,'') particulars, v.net amount FROM visiting_payouts v JOIN visiting_doctors d ON d.id=v.doctor_id WHERE v.status='paid' AND date(v.paid_at) BETWEEN ? AND ?`, from, to),
        ...all(`SELECT x.spent_on d, 'Cut (expense)' kind, x.head || coalesce(' — ' || x.remarks,'') particulars, x.amount FROM expenses x WHERE ${LIVE_EXPENSE} AND (x.head LIKE '%cut%' OR x.remarks LIKE '%cut%') AND x.spent_on BETWEEN ? AND ?`, from, to),
      ].sort((a, b) => String(a.d).localeCompare(String(b.d)));
      return { subtitle: 'Refunds, treating-doctor payouts, and expenses whose head or remark says "cut" (ambulance technician cuts, outside doctor cuts).',
        kpis: [kpi('Total cuts', sum(rows, 'amount')), ...['Refund to patient', 'Doctor cut / payout', 'Cut (expense)'].map((k) => kpi(k, sum(rows.filter((r) => r.kind === k), 'amount')))],
        columns: [date('d', 'Date'), col('kind', 'Type'), col('particulars', 'Particulars'), money('amount', 'Amount')], rows, total: ['amount'] }; } },

  { id: 'fuel_register', group: 'Finance', title: 'Fuel — diesel and petrol expenses', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = all(`SELECT x.spent_on d, x.voucher_no, x.head, coalesce(x.remarks,'') particulars, x.vendor, x.reference, x.mode, x.amount FROM expenses x
        WHERE ${LIVE_EXPENSE} AND (x.head LIKE '%fuel%' OR x.head LIKE '%petrol%' OR x.head LIKE '%diesel%' OR x.remarks LIKE '%fuel%' OR x.remarks LIKE '%petrol%' OR x.remarks LIKE '%diesel%') AND x.spent_on BETWEEN ? AND ? ORDER BY x.spent_on, x.id`, from, to);
      return { subtitle: 'Expenses entered under a fuel, petrol or diesel head. Enter the vehicle number in the remark and the bunk bill number in the reference.',
        kpis: [kpi('Fuel total', sum(rows, 'amount'))], columns: [date('d', 'Date'), col('voucher_no', 'Voucher'), col('head', 'Head'), col('particulars', 'Vehicle / particulars'), col('vendor', 'Bunk'), col('reference', 'Bill / indent no'), col('mode', 'Mode'), money('amount', 'Amount')], rows, total: ['amount'] }; } },

  { id: 'ambulance_register', group: 'Reception', title: 'Ambulance services — patient, trip and amount', perm: R, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = billedWith("(s.code LIKE 'AMB-%' OR bi.description LIKE '%ambulance%') AND b.bill_date BETWEEN ? AND ?", [from, to]);
      return { kpis: [kpi('Trips', rows.length, 'number'), kpi('Amount', sum(rows, 'amount'))],
        columns: [date('d', 'Date'), col('uhid', 'UHID'), col('patient', 'Name'), col('item', 'Trip (from — to)'), col('bill_no', 'Bill'), money('amount', 'Amount')], rows, total: ['amount'] }; } },

  { id: 'due_list_month', group: 'Finance', title: 'Due list — patients, staff and insurance, with remarks', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = all(`SELECT b.bill_date d, CASE WHEN b.bill_type='PHARM' THEN 'Pharmacy' ELSE 'Reception' END desk, p.uhid, p.name patient, b.bill_no,
          CASE WHEN b.payer_type IN ('insurance','aarogyasri','corporate','trust') THEN upper(substr(b.payer_type,1,1)) || substr(b.payer_type,2) || ' due' ELSE 'Patient due' END kind,
          round(b.balance,2) due, coalesce(nullif(b.authorization_reason,''), nullif(b.notes,''), p.payer_name, '') remarks
        FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.status<>'cancelled' AND b.balance>0.005 AND b.bill_date BETWEEN ? AND ? ORDER BY desk, kind DESC, b.bill_date`, from, to);
      return { kpis: [kpi('Total due', sum(rows, 'due')), kpi('Patient due', sum(rows.filter((r) => r.kind === 'Patient due'), 'due')), kpi('Payer due', sum(rows.filter((r) => r.kind !== 'Patient due'), 'due'))],
        columns: [date('d', 'Date'), col('desk', 'Desk'), col('uhid', 'Patient ID'), col('patient', 'Patient name'), col('bill_no', 'Bill'), col('kind', 'Type'), money('due', 'Due'), col('remarks', 'Remarks')], rows, total: ['due'] }; } },

  { id: 'ip_patient_list', group: 'Reception', title: 'In-patient list — who is admitted now, days, bill and paid', perm: R, filters: [],
    run: () => {
      const rows = all(`SELECT p.uhid, p.name patient, coalesce(a.diagnosis,'') diagnosis, coalesce(u.name,'') consultant, a.admitted_at, coalesce(w.name,'') ward, coalesce(bd.bed_no,'') bed_no, a.ip_no,
          CAST(julianday(date('now','localtime')) - julianday(date(a.admitted_at)) AS INTEGER) + 1 days, a.financial_category category,
          (SELECT round(coalesce(sum(total),0),2) FROM bills x WHERE x.encounter_id=a.encounter_id AND x.status<>'cancelled') total,
          (SELECT round(coalesce(sum(paid),0),2) FROM bills x WHERE x.encounter_id=a.encounter_id AND x.status<>'cancelled') paid
        FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
        WHERE a.status NOT IN ('discharged','requested','cancelled') ORDER BY u.name, a.admitted_at`).map((r, i) => ({ sno: i + 1, ...r }));
      return { subtitle: `Patients in the hospital now (${today()}). Days count the admission day as day 1.`,
        kpis: [kpi('In-patients', rows.length, 'number'), kpi('Total billed', sum(rows, 'total')), kpi('Paid', sum(rows, 'paid'))],
        columns: [num('sno', 'S.No'), col('uhid', 'Patient ID'), col('patient', "Patient's name"), col('diagnosis', 'Diagnosis'), col('consultant', 'Consultant'), date('admitted_at', 'Admission date & time'), col('ward', 'Ward'), col('category', 'Category'), num('days', 'No. of days'), money('total', 'Total amt'), money('paid', 'Paid amt')],
        rows, total: ['total', 'paid'] }; } },

  { id: 'referral_statement', group: 'Finance', title: 'Referral statement — patient, referred by, final, discount, proceeds', perm: F, filters: ['range'],
    run: (q) => { const { from, to } = range(q);
      const rows = all(`SELECT min(b.bill_date) d, p.uhid, p.name patient, coalesce(rd.name, rh.name) referred_by, CASE WHEN rd.id IS NOT NULL THEN rd.kind ELSE rh.kind END source_kind,
          round(sum(b.gross + b.tax),2) final, round(sum(b.discount),2) disc, round(sum(b.total),2) proceeds, round(sum(b.paid),2) paid,
          group_concat(DISTINCT b.bill_type || CASE WHEN b.payer_type IN ('self','credit') THEN '' ELSE ' ' || upper(b.payer_type) END) remarks
        FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN referral_sources rd ON rd.id=p.referral_doctor_id LEFT JOIN referral_sources rh ON rh.id=p.referral_hospital_id
        WHERE b.status<>'cancelled' AND (rd.id IS NOT NULL OR rh.id IS NOT NULL) AND b.bill_date BETWEEN ? AND ? GROUP BY p.id ORDER BY d, p.id`, from, to).map((r, i) => ({ sno: i + 1, ...r }));
      return { subtitle: 'One line per referred patient billed in the period. Proceeds = final − discount. The amount paid to the referrer is not stored in the HMS; enter it under Expenses with a "cut" head so it shows in Cuts and payouts.',
        kpis: [kpi('Patients', rows.length, 'number'), kpi('Final', sum(rows, 'final')), kpi('Discount', sum(rows, 'disc')), kpi('Proceeds', sum(rows, 'proceeds'))],
        columns: [num('sno', 'S.No'), date('d', 'Date'), col('uhid', 'UHID'), col('patient', 'Patient name'), col('referred_by', 'Doctor / referred by'), money('final', 'Final'), money('disc', 'Disc'), money('proceeds', 'Proce'), col('remarks', 'Remarks'), money('paid', 'Paid by patient')],
        rows, total: ['final', 'disc', 'proceeds', 'paid'] }; } },
];
