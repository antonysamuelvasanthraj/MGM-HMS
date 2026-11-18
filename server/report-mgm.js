/**
 * Month-closing reports in the shape the hospital keeps them on paper and in Excel:
 * doctor-wise revenue, daily cash closing (reception and pharmacy), cash handed over,
 * expenses by day and by head, cuts and payouts, fuel, ambulance, dues, the in-patient
 * list and the referral statement. Figures come from the ledger and transaction tables.
 */
import { all, today } from './db.js';
import {receiptDeskSql} from './receipt-desk.js';
import {collectionPolicy} from './collection-policy.js';

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

/** The old system's category master: what a line on a bill is called in the category-wise report. */
export const SERVICE_CATEGORIES = ['Consultation', 'Investigation', 'X RAY', 'CT SCAN', '2D ECHO', 'Other imaging', 'Procedure Charges', 'ER Charges', 'Package', 'Bed & ward charges', 'Pharmacy', 'Ambulance', 'Charges'];
export function serviceCategory(item) {
  const n = String(item.description || ''), c = String(item.category || '');
  if (/ambulance/i.test(n)) return 'Ambulance';
  if (c === 'pharmacy' || item.batch_id) return 'Pharmacy';
  if (c === 'consultation') return 'Consultation';
  if (c === 'imaging') return { XRAY: 'X RAY', CT: 'CT SCAN', ECHO: '2D ECHO' }[imagingGroup(n)] || 'Other imaging';
  if (c === 'lab') return 'Investigation';
  if (c === 'package') return 'Package';
  if (c === 'emergency') return 'ER Charges';
  if (['procedure', 'ot', 'surgery', 'anaesthesia', 'professional'].includes(c)) return 'Procedure Charges';
  if (['bed', 'room', 'nursing', 'ipd', 'icu'].includes(c)) return 'Bed & ward charges';
  return 'Charges';
}
/** OP or IP follows the bill's visit, never the service name. */
const VISIT_SQL = "CASE WHEN b.bill_type='IP' OR e.kind='IP' THEN 'IP' ELSE 'OP' END";
const dmy = (d) => String(d || '').split('-').reverse().join('-');

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
    const receiptSide = `${receiptDeskSql()}='${desk}'`;
    // Positive receipts are gross collections; negative payment rows are refunds, counted once.
    const pay = all(`SELECT p.pay_date d,
        sum(CASE WHEN p.amount>0 AND b.bill_type='IP' THEN p.amount ELSE 0 END) ip,
        sum(CASE WHEN p.amount>0 AND b.bill_type<>'IP' THEN p.amount ELSE 0 END) op,
        sum(CASE WHEN p.amount>0 THEN p.amount ELSE 0 END) total,
        sum(CASE WHEN p.amount>0 AND p.mode='upi' THEN p.amount ELSE 0 END) upi,
        sum(CASE WHEN p.amount>0 AND p.mode IN ('debit_card','credit_card') THEN p.amount ELSE 0 END) card,
        sum(CASE WHEN p.amount>0 AND p.mode IN ('bank_transfer','cheque') THEN p.amount ELSE 0 END) online,
        sum(CASE WHEN p.amount>0 AND p.mode='cash' THEN p.amount ELSE 0 END) cash,
        sum(CASE WHEN p.amount<0 THEN -p.amount ELSE 0 END) returns,
        sum(CASE WHEN p.amount<0 AND p.mode='cash' THEN -p.amount ELSE 0 END) refund_cash
      FROM payments p JOIN bills b ON b.id=p.bill_id
      WHERE p.cancelled=0 AND ${receiptSide} AND p.pay_date<=? GROUP BY p.pay_date`, to);
    // Cash leaves on the payment voucher date, which may differ from the expense date.
    const spent = pharm ? [] : all(`SELECT v.voucher_date d, sum(l.credit-l.debit) v
      FROM journal_vouchers v JOIN journal_lines l ON l.voucher_id=v.id JOIN accounts a ON a.id=l.account_id
      WHERE v.source='expense_payment' AND a.system_key='cash' AND v.voucher_date<=? GROUP BY v.voucher_date`, to);
    const handed = all(`SELECT handover_date d, declared FROM cash_handovers
      WHERE desk=? AND status IN ('submitted','accepted') AND handover_date<=?`, desk, to)
      .map(h=>({d:h.d,v:+modes(h.declared).cash||0}));
    const days = new Map();
    const day = d=>days.get(d)||days.set(d,{d,op:0,ip:0,total:0,upi:0,card:0,online:0,cash:0,returns:0,refund_cash:0,expense:0,handed:0}).get(d);
    for(const p of pay)Object.assign(day(p.d),p);
    for(const e of spent)day(e.d).expense=e.v;
    for(const h of handed)day(h.d).handed+=h.v;
    let inHand=0,opening=0;
    const rows=[];
    for(const r of [...days.values()].sort((a,b)=>a.d.localeCompare(b.d))){
      const net=r2(r.cash-r.refund_cash-r.expense);
      inHand=r2(inHand+net-r.handed);
      if(r.d<from){opening=inHand;continue;}
      rows.push({...r,net_cash:net,in_hand:inHand});
    }
    const moneyCols = (cols) => cols.filter((c) => c.type === 'money' && c.key !== 'in_hand').map((c) => c.key);
    const columns = pharm
      ? [date('d', 'Date'), money('total', 'Total'), money('upi', 'UPI (PhonePe)'), money('card', 'Card'), money('returns', 'Sale return'), money('online', 'Online'), money('cash', 'Cash'), money('net_cash', 'Net cash'), money('handed', 'Handed over'), money('in_hand', 'Cash at desk (running)')]
      : [date('d', 'Date'), money('op', 'OP'), money('ip', 'IP'), money('total', 'Total'), money('upi', 'UPI (PhonePe)'), money('card', 'Card'), money('online', 'Online'), money('cash', 'Cash'), money('expense', 'Expenses (cash)'), money('returns', 'Refunds'), money('net_cash', 'Net cash'), money('handed', 'Handed over'), money('in_hand', 'Cash at desk (running)')];
    return { subtitle: 'Net cash = cash received − cash refunds − cash expenses paid. Handed over = cash in the handovers this desk submitted to the administrator. Cash at desk includes earlier cash carried forward; expenses use their payment date.',
      kpis: [kpi('Opening cash', opening), kpi('Collected', sum(rows, 'total')), kpi('Cash', sum(rows, 'cash')), kpi('Net cash', sum(rows, 'net_cash')), kpi('Handed over', sum(rows, 'handed')), kpi('Cash at desk at period end', inHand)],
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
      const bills=all(`SELECT b.*,p.uhid,p.name patient,
        coalesce(nullif(b.authorization_reason,''),nullif(b.notes,''),p.payer_name,'') remarks
        FROM bills b JOIN patients p ON p.id=b.patient_id
        WHERE b.status<>'cancelled' AND b.bill_date BETWEEN ? AND ? ORDER BY b.bill_date,b.id`,from,to);
      const rows=bills.flatMap(b=>{
        const policy=collectionPolicy(b),deferred=['insurance','aarogyasri','corporate','trust'].includes(b.payer_type);
        const shared={d:b.bill_date,desk:b.bill_type==='PHARM'?'Pharmacy':'Reception',uhid:b.uhid,patient:b.patient,bill_no:b.bill_no,remarks:b.remarks};
        const patient=r2(policy.patient_due+(deferred?0:policy.payer_receivable));
        const payer=deferred?r2(policy.payer_pending+policy.payer_receivable):0;
        const result=[];
        if(patient>0.005)result.push({...shared,kind:'Patient due',due:patient});
        if(payer>0.005)result.push({...shared,kind:b.payer_type.charAt(0).toUpperCase()+b.payer_type.slice(1)+' due',due:payer});
        return result;
      });
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

  { id: 'collection_op_ip', group: 'Reception', title: 'Collection report — OP and IP, with summary', perm: R, filters: ['range', 'encounter_type', 'mode', 'doctor', 'cashier', 'referral'],
    run: (q) => {
      const { from, to } = range(q), w = ['p.cancelled=0', 'p.pay_date BETWEEN ? AND ?'], args = [from, to];
      if (q.mode) { w.push('p.mode=?'); args.push(q.mode); }
      if (q.doctor_id) { w.push('coalesce(b.doctor_id,e.doctor_id)=?'); args.push(q.doctor_id); }
      if (q.user_id) { w.push('p.received_by=?'); args.push(q.user_id); }
      if (q.referral_id) { w.push('pt.referral_doctor_id=?'); args.push(q.referral_id); }
      if (q.encounter_type) { w.push(`${VISIT_SQL}=?`); args.push(q.encounter_type); }
      const rows = all(`SELECT p.id pid, p.receipt_no, substr(p.created_at,1,16) at, b.bill_no, b.bill_date, b.total bill_total, b.discount bill_disc, pt.uhid, pt.name patient,
          coalesce(d.name,'') doctor, coalesce(rf.name,'') referral, ${VISIT_SQL} visit, coalesce(a.ip_no,'') ip_no,
          a.status adm_status, a.discharged_at, p.created_at paid_at,
          b.total - (SELECT coalesce(sum(x.amount),0) FROM payments x WHERE x.bill_id=p.bill_id AND x.cancelled=0 AND (x.created_at < p.created_at OR (x.created_at=p.created_at AND x.id<=p.id))) bill_balance,
          p.mode, p.amount, coalesce(u.name,'') cashier,
          coalesce((SELECT group_concat(substr(i.description,1,38), '; ') FROM bill_items i WHERE i.bill_id=b.id AND i.amount>0),'') particulars
        FROM payments p JOIN bills b ON b.id=p.bill_id JOIN patients pt ON pt.id=p.patient_id
        LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN admissions a ON a.encounter_id=b.encounter_id
        LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id) LEFT JOIN users u ON u.id=p.received_by
        LEFT JOIN referral_sources rf ON rf.id=pt.referral_doctor_id
        WHERE ${w.join(' AND ')} ORDER BY p.created_at, p.id`, ...args);
      // IP receipts: advance while admitted, part / final settlement after the discharge, refunds negative
      const stage = (r) => r.visit !== 'IP' ? '' : r.amount < 0 ? 'Refund'
        : (r.adm_status !== 'discharged' || !r.discharged_at || r.paid_at <= r.discharged_at) ? 'Advance' : (r.bill_balance <= 0.005 ? 'Final settlement' : 'Part payment');
      const MODE = (m) => (m === 'cash' ? 'Cash' : /card/.test(m) ? 'Card' : ['upi', 'bank_transfer', 'wallet', 'online'].includes(m) ? 'Online' : 'Others');
      const line = (r) => ({ section: r.visit === 'IP' ? 'B · IP' : 'A · OP', at: r.at, uhid: r.uhid, patient: r.patient, receipt_no: r.receipt_no, bill_no: r.bill_no, bill_date: r.bill_date,
        doctor: r.doctor, referral: r.referral, ip_no: r.ip_no, stage: stage(r), particulars: r.particulars, bill_total: r2(r.bill_total), bill_disc: r2(r.bill_disc),
        amount: r2(r.amount), pending: r2(Math.max(0, r.bill_balance)), mode: r.mode, cashier: r.cashier });
      const op = rows.filter((r) => r.visit === 'OP'), ip = rows.filter((r) => r.visit === 'IP');
      const total = (list) => r2(list.reduce((s, r) => s + r.amount, 0));
      const received = (list) => r2(list.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0));
      const refunds = (list) => r2(-list.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0));
      const out = [];
      const block = (label, list) => { out.push(...list.map(line)); out.push({ section: label, receipt_no: `${label} total`, amount: total(list), bold: true }); };
      if (!q.encounter_type || q.encounter_type === 'OP') block('A · OP', op);
      if (!q.encounter_type || q.encounter_type === 'IP') block('B · IP', ip);
      const sumRow = (label, v, bold) => out.push({ section: 'Summary', receipt_no: label, amount: v, ...(bold ? { bold: true } : {}) });
      sumRow('GRAND TOTAL (OP + IP)', total(rows), true);
      for (const m of ['Cash', 'Card', 'Online', 'Others']) { const v = total(rows.filter((r) => MODE(r.mode) === m)); if (v || m !== 'Others') sumRow(`Amount collected in ${m} (OP ${total(op.filter((r) => MODE(r.mode) === m))} · IP ${total(ip.filter((r) => MODE(r.mode) === m))})`, v); }
      sumRow('Total amount collected', received(rows), true);
      sumRow('Total refund', -refunds(rows));
      sumRow('Total collected (minus refund)', total(rows), true);
      const byMode = new Map(); for (const r of rows) byMode.set(r.mode, r2((byMode.get(r.mode) || 0) + r.amount));
      for (const [m, v] of [...byMode].sort()) sumRow(`Payments — ${m}`, v);
      const discount = r2(all(`SELECT coalesce(sum(discount),0) d FROM bills WHERE status<>'cancelled' AND bill_date BETWEEN ? AND ?`, from, to)[0]?.d);
      return { subtitle: `Receipts from ${dmy(from)} to ${dmy(to)}${q.encounter_type ? ` · ${q.encounter_type} only` : ''}. OP or IP follows the bill's visit. Advances are listed once as received and not counted again against the final IP bill. Discounts (₹${discount}) are separate and not part of collection.`,
        kpis: [kpi('OP collection', total(op)), kpi('IP collection', total(ip)), kpi('Grand total', total(rows)), kpi('Refunds', refunds(rows)), kpi('Net collection', total(rows)), kpi('Discounts given', discount)],
        columns: [col('section', 'Section'), col('at', 'Paid date'), col('uhid', 'Patient Id'), col('patient', 'Patient name'), col('receipt_no', 'Receipt no.'), col('bill_no', 'Bill no'), date('bill_date', 'Bill date'),
          col('doctor', 'Doctor'), col('referral', 'Referral doctor'), col('ip_no', 'IP no'), col('stage', 'IP receipt'), col('particulars', 'Particulars'), money('bill_total', 'Bill amount'), money('bill_disc', 'Discount'),
          money('amount', 'Paid amount'), money('pending', 'Pending amount'), col('mode', 'Payment type'), col('cashier', 'Created by')],
        rows: out };
    } },

  { id: 'due_report', group: 'Reception', title: 'Due report — pending and excess by bill', perm: R, filters: ['range', 'encounter_type', 'dueexcess'],
    run: (q) => {
      const { from, to } = range(q), w = ["b.status<>'cancelled'", 'b.bill_date BETWEEN ? AND ?'], args = [from, to];
      if (q.encounter_type) { w.push(`${VISIT_SQL}=?`); args.push(q.encounter_type); }
      const bills = all(`SELECT b.*, pt.uhid, pt.name patient, coalesce(pt.mobile,'') mobile,
          (SELECT group_concat(s.reason,'; ') FROM bill_settlements s WHERE s.bill_id=b.id AND s.mode IN ('due','credit') AND s.status<>'cancelled' AND s.reason IS NOT NULL AND s.reason<>'') due_reason
        FROM bills b JOIN patients pt ON pt.id=b.patient_id LEFT JOIN encounters e ON e.id=b.encounter_id
        WHERE ${w.join(' AND ')} ORDER BY b.bill_date, b.id`, ...args);
      let n = 0;
      const rows = bills.flatMap((b) => {
        const policy = collectionPolicy(b), deferred = ['insurance', 'aarogyasri', 'corporate', 'trust'].includes(b.payer_type);
        const due = r2(policy.patient_due + (deferred ? 0 : policy.payer_receivable)), excess = b.balance < -0.5 ? r2(-b.balance) : 0;
        if (q.dueexcess === 'due' ? due <= 0.5 : q.dueexcess === 'excess' ? excess <= 0.5 : (due <= 0.5 && excess <= 0.5)) return [];
        return [{ sno: ++n, d: b.bill_date, uhid: b.uhid, patient: b.patient, bill_no: b.bill_no, mobile: b.mobile,
          status: excess > 0.5 ? 'Excess' : b.paid > 0 ? 'Part paid' : 'Pending', total: r2(b.total), paid: r2(b.paid), due, excess,
          remarks: b.due_reason || b.authorization_reason || b.notes || '' }];
      });
      return { subtitle: `Due report from ${dmy(from)} to ${dmy(to)}${q.encounter_type ? ` · ${q.encounter_type}` : ''}. Due is what the patient still owes; excess is money held beyond the bill.`,
        kpis: [kpi('Bills listed', rows.length, 'number'), kpi('Total due', sum(rows, 'due')), kpi('Total excess', sum(rows, 'excess'))],
        columns: [num('sno', 'S.No.'), date('d', 'Date'), col('uhid', 'Patient Id'), col('patient', 'Patient name'), col('bill_no', 'Bill number'), col('mobile', 'Mobile number'), col('status', 'Payment status'),
          money('total', 'Bill amount'), money('paid', 'Paid amount'), money('due', 'Due'), money('excess', 'Excess'), col('remarks', 'Remarks')],
        rows, total: ['total', 'paid', 'due', 'excess'] };
    } },

  { id: 'category_wise', group: 'Reception', title: 'Category-wise report — summary, detailed, toggle down, doctor-wise', perm: R, filters: ['range', 'svc_category', 'report_type', 'encounter_type'],
    run: (q) => {
      const { from, to } = range(q), w = ["b.status<>'cancelled'", "b.bill_type<>'PHARM'", 'b.bill_date BETWEEN ? AND ?', 'i.amount<>0'], args = [from, to];
      if (q.encounter_type) { w.push(`${VISIT_SQL}=?`); args.push(q.encounter_type); }
      const raw = all(`SELECT b.id bid, b.bill_no, substr(b.created_at,1,16) at, pt.uhid, pt.name patient, coalesce(d.name,'Direct / unassigned') doctor,
          i.category icat, i.description, i.qty, i.amount, i.batch_id, i.discount line_disc, b.discount bill_disc
        FROM bill_items i JOIN bills b ON b.id=i.bill_id JOIN patients pt ON pt.id=b.patient_id
        LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
        WHERE ${w.join(' AND ')} ORDER BY b.created_at, b.id, i.id`, ...args);
      // one line per bill and category, the way the old report listed them
      const per = new Map();
      for (const r of raw) {
        const category = serviceCategory({ category: r.icat, description: r.description, batch_id: r.batch_id });
        if (q.svc_category && category !== q.svc_category) continue;
        const key = `${r.bid}|${category}`, cur = per.get(key) || { at: r.at, uhid: r.uhid, patient: r.patient, bill_no: r.bill_no, category, doctor: r.doctor, qty: 0, amount: 0, disc: 'No' };
        cur.qty += +r.qty || 0; cur.amount = r2(cur.amount + r.amount);
        if (+r.line_disc > 0 || +r.bill_disc > 0) cur.disc = 'YES';
        per.set(key, cur);
      }
      const detail = [...per.values()];
      const type = ['summary', 'detailed', 'toggle', 'doctor'].includes(q.report_type) ? q.report_type : 'summary';
      const grand = r2(detail.reduce((s, r) => s + r.amount, 0));
      const byCat = new Map(); for (const r of detail) { const c = byCat.get(r.category) || { name: r.category, qty: 0, amount: 0 }; c.qty += r.qty; c.amount = r2(c.amount + r.amount); byCat.set(r.category, c); }
      const cats = [...byCat.values()].sort((a, b) => a.name.localeCompare(b.name));
      const TITLE = { summary: 'SUMMARY', detailed: 'DETAILED', toggle: 'TOGGLE DOWN', doctor: 'DOCTOR WISE' }[type];
      const subtitle = `Category wise report ${TITLE} from ${dmy(from)} to ${dmy(to)}${q.encounter_type ? ` in '${q.encounter_type}'` : ''}${q.svc_category ? ` · ${q.svc_category}` : ''}. Pharmacy counter sales are not included.`;
      const kpis = [kpi('Total amount', grand), kpi('Categories', cats.length, 'number'), kpi('Lines', detail.length, 'number')];
      if (type === 'summary') {
        const rows = cats.map((c, i) => ({ sno: i + 1, name: c.name, qty: c.qty, amount: c.amount }));
        rows.push({ name: 'Total', qty: sum(rows, 'qty'), amount: grand, bold: true });
        return { subtitle, kpis, columns: [num('sno', 'S.No.'), col('name', 'Name'), num('qty', 'Quantity'), money('amount', 'Total amount')], rows };
      }
      const columns = [num('sno', 'Sl.No'), col('at', 'Bill date'), col('uhid', 'Patient Id'), col('patient', 'Patient name'), col('bill_no', 'Order no'), col('category', 'Category'),
        col('doctor', 'Consultant name'), col('disc', 'Is discount bill'), money('amount', 'Total')];
      const rows = []; let n = 0;
      const lines = (list) => list.forEach((r) => rows.push({ sno: ++n, ...r }));
      if (type === 'detailed') lines([...detail].sort((a, b) => a.category.localeCompare(b.category) || a.at.localeCompare(b.at)));
      else if (type === 'toggle') for (const c of cats) { rows.push({ category: c.name, bill_no: `${c.qty} item(s)`, amount: c.amount, bold: true }); lines(detail.filter((r) => r.category === c.name)); }
      else { const docs = [...new Set(detail.map((r) => r.doctor))].sort(); for (const dname of docs) { const list = detail.filter((r) => r.doctor === dname); rows.push({ doctor: dname, bill_no: `${list.length} line(s)`, amount: r2(list.reduce((s, r) => s + r.amount, 0)), bold: true }); lines(list.sort((a, b) => a.category.localeCompare(b.category) || a.at.localeCompare(b.at))); } }
      rows.push({ category: 'Total', amount: grand, bold: true });
      return { subtitle, kpis, columns, rows };
    } },

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
