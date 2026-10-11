/**
 * Department dashboards — pharmacy, reception and owner. Every figure comes
 * from metrics.js or from live transaction tables; nothing is sampled or
 * invented. Billing, collection, revenue, receivables and advances are kept
 * apart exactly as metrics.js defines them.
 */
import { all, get, one, today } from './db.js';
import { accrueAll } from './ipd-charges.js';
import * as M from './metrics.js';
import {collectionPolicy} from './collection-policy.js';
function sessionDues(desk,date){return all(`SELECT b.*,p.name patient_name,p.uhid,e.kind FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN encounters e ON e.id=b.encounter_id WHERE b.status<>'cancelled' AND b.balance>0.005 AND ${desk==='pharmacy'?"b.bill_type='PHARM'":"b.bill_type<>'PHARM'"} AND (b.bill_date=? OR e.visit_date=?) ORDER BY b.id DESC`,date,date).map(b=>({...b,...collectionPolicy(b)})).filter(b=>b.patient_due>0.005);}

const r2 = M.r2;
const PAYER_NAME = { insurance: 'Insurance', aarogyasri: 'Aarogyasri', scheme: 'Aarogyasri', corporate: 'Corporate', credit: 'Credit', trust: 'Trust' };
const CASE_TEXT = { preauth_pending: 'approval pending', preauth_approved: 'approved', query: 'query raised', claim_submitted: 'claim submitted', settled: 'settled', rejected: 'rejected' };
/** "insurance:preauth_pending" → "Insurance · approval pending" */
const payerText = (v) => { const [p, s] = String(v).split(':'); return `${PAYER_NAME[p] || p}${s ? ` · ${CASE_TEXT[s] || s}` : ''}`; };
const n = (sql, ...p) => one(sql, ...p) || 0;
const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', other: 'Other', credit: 'Credit', insurance: 'Insurance', aarogyasri: 'Aarogyasri',
  corporate: 'Corporate', trust: 'Trust', free: 'Free', due: 'Due' };

/* ======================================================================
   PHARMACY
   ====================================================================== */

const PHARM_LINES = `FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
  WHERE bi.revenue_head='PHARMACY' AND b.status<>'cancelled'`;

/** Pharmacy value by bucket (hour / day / month) for sales, collections, due and returns. */
function pharmSeries(g) {
  const t = today();
  let from = t, to = t, bucket = 'day';
  if (g.graph === 'hourly') bucket = 'hour';
  else if (g.graph === '7d') from = M.addDays(t, -6);
  else if (g.graph === 'monthly') { from = `${+t.slice(0, 4) - 1}${t.slice(4, 7)}-01`; bucket = 'month'; }
  else if (g.graph === 'custom' && g.gfrom && g.gto) { from = g.gfrom; to = g.gto; }
  else from = M.addDays(t, -29);
  const key = { hour: "strftime('%H', X)", day: 'date(X)', month: "strftime('%Y-%m', X)" }[bucket];
  const k = (col) => key.replace('X', col);
  const q = (sql, ...a) => Object.fromEntries(all(sql, ...a).map((r) => [r.k, r2(r.v)]));
  const sales = q(`SELECT ${k('coalesce(bi.created_at, b.created_at)')} k, sum(bi.amount) v ${PHARM_LINES} AND bi.category<>'refund' AND date(coalesce(bi.created_at, b.created_at)) BETWEEN ? AND ? GROUP BY k`, from, to);
  const returns = q(`SELECT ${k('bi.created_at')} k, sum(-bi.amount) v ${PHARM_LINES} AND bi.category='refund' AND date(bi.created_at) BETWEEN ? AND ? GROUP BY k`, from, to);
  const coll = q(`SELECT ${k('p.created_at')} k, sum(p.amount) v FROM payments p JOIN bills b ON b.id=p.bill_id WHERE b.bill_type='PHARM' AND p.cancelled=0 AND p.pay_date BETWEEN ? AND ? GROUP BY k`, from, to);
  const due = q(`SELECT ${k('b.created_at')} k, sum(CASE WHEN b.balance>0 THEN b.balance ELSE 0 END) v FROM bills b WHERE b.bill_type='PHARM' AND b.status<>'cancelled' AND b.bill_date BETWEEN ? AND ? GROUP BY k`, from, to);
  let keys;
  if (bucket === 'hour') keys = [...new Set([...Object.keys(sales), ...Object.keys(coll)])].sort();
  else if (bucket === 'month') { keys = []; for (let d = from; d <= to; d = M.addDays(`${d.slice(0, 7)}-28`, 5).slice(0, 7) + '-01') keys.push(d.slice(0, 7)); }
  else keys = M.dayList(from, to);
  const label = (x) => (bucket === 'hour' ? `${+x}:00` : bucket === 'month' ? x : x);
  return { from, to, bucket, rows: keys.map((x) => ({ d: label(x), sales: sales[x] || 0, collections: coll[x] || 0, due: due[x] || 0, returns: returns[x] || 0 })) };
}

function pharmacyDash(q, query) {
  const d = q.to;
  const t = { from: d, to: d };
  const lines = get(`SELECT coalesce(sum(CASE WHEN bi.category<>'refund' THEN bi.amount END),0) sales,
      coalesce(sum(CASE WHEN bi.category<>'refund' AND b.bill_type='PHARM' THEN bi.amount END),0) op_sales,
      coalesce(sum(CASE WHEN bi.category<>'refund' AND b.bill_type='IP' THEN bi.amount END),0) ip_sales,
      coalesce(sum(CASE WHEN bi.category<>'refund' THEN bi.qty END),0) units,
      coalesce(sum(CASE WHEN bi.category='refund' THEN -bi.amount END),0) returns
    ${PHARM_LINES} AND date(coalesce(bi.created_at, b.created_at))=?`, d);
  const col = M.collections({ ...t, desk: 'pharmacy' });
  const bill = M.billing({ ...t, desk: 'pharmacy' });
  const payerToday = Object.fromEntries(all(`SELECT s.mode, sum(s.amount) v FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
    WHERE b.bill_type='PHARM' AND s.status<>'cancelled' AND date(s.created_at)=? GROUP BY s.mode`, d).map((r) => [r.mode, r2(r.v)]));
  const stock = all(`SELECT m.id, m.name, m.brand, m.generic, m.reorder_level, m.dispensing_unit, m.pack_size, m.units_per_pack,
      coalesce(sum(CASE WHEN b.expiry > date('now','localtime') THEN b.qty END),0) qty
    FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.id AND b.qty>0 WHERE m.active=1 GROUP BY m.id`);
  const kpis = {
    sales: r2(lines.sales - lines.returns), op_sales: r2(lines.op_sales), ip_consumption: r2(lines.ip_sales),
    cash: col.byMode.cash, upi: col.byMode.upi, card: col.byMode.card, due_today: bill.due,
    insurance: r2((payerToday.insurance || 0) + (payerToday.corporate || 0)), aarogyasri: r2(payerToday.aarogyasri || 0),
    bills: bill.bills - bill.cancelled_bills, units: r2(lines.units), returns: r2(lines.returns),
    stock_value: r2(n('SELECT coalesce(sum(qty*purchase_rate),0) FROM medicine_batches WHERE qty>0')),
    low_stock: stock.filter((s) => s.qty > 0 && s.qty <= s.reorder_level).length, out_of_stock: stock.filter((s) => s.qty <= 0).length,
    near_expiry: n("SELECT count(*) FROM medicine_batches WHERE qty>0 AND expiry BETWEEN date('now','localtime') AND date('now','localtime','+90 day')"),
    expired: n("SELECT count(*) FROM medicine_batches WHERE qty>0 AND expiry < date('now','localtime')"),
    pending_grn: n("SELECT count(*) FROM purchases WHERE verified_at IS NULL AND status<>'returned'"),
    supplier_outstanding: r2(n('SELECT coalesce(sum(outstanding),0) FROM suppliers WHERE outstanding>0')),
    emergency_pending: n('SELECT count(*) FROM stock_transfers WHERE emergency=1 AND ratified_by IS NULL'),
  };

  // queue: every prescription of the last 7 days (and anything still open), with its OP / IP / ER origin
  const queue = all(`SELECT r.id, r.status, r.status_note, r.created_at, p.id patient_id, p.uhid, p.name patient_name, p.payer_type category,
      u.name doctor_name, dp.name department, e.kind, e.token_no,
      (SELECT count(*) FROM prescription_items i WHERE i.prescription_id=r.id) items,
      (SELECT count(*) FROM prescription_items i WHERE i.prescription_id=r.id AND i.dispensed_qty >= i.qty) done_items,
      (SELECT b.status FROM bills b WHERE b.source='prescription' AND b.source_id=r.id AND b.status<>'cancelled' ORDER BY b.id DESC LIMIT 1) bill_status,
      (SELECT b.payer_type || ':' || coalesce(b.claim_status,'') FROM bills b WHERE b.source='prescription' AND b.source_id=r.id AND b.status<>'cancelled'
         AND b.payer_type IN ('insurance','aarogyasri','scheme','corporate','trust') AND b.balance>0.005 ORDER BY b.id DESC LIMIT 1) bill_payer,
      (SELECT a.id FROM admissions a WHERE a.encounter_id=r.encounter_id) admission_id
    FROM prescriptions r JOIN patients p ON p.id=r.patient_id LEFT JOIN users u ON u.id=r.doctor_id
    LEFT JOIN encounters e ON e.id=r.encounter_id LEFT JOIN departments dp ON dp.id=e.department_id
    WHERE r.status IN ('active','partial','dispensing','hold') OR date(r.created_at) >= date('now','localtime','-7 day')
    ORDER BY r.status IN ('active','dispensing','partial','hold') DESC, r.id DESC LIMIT 300`)
    .map((r) => ({ ...r, origin: r.kind === 'EMG' ? 'ER' : r.admission_id || r.kind === 'IP' ? 'IP' : 'OP',
      state: { active: 'waiting', dispensing: 'dispensing', partial: 'partial', dispensed: 'completed', hold: 'hold', cancelled: 'cancelled' }[r.status] || r.status,
      payment: r.bill_payer ? payerText(r.bill_payer) : r.admission_id ? 'On IP bill' : r.bill_status ? ({ paid: 'Paid', covered: 'Covered', partial: 'Part paid', unpaid: 'Unpaid' }[r.bill_status] || r.bill_status) : 'Not billed' }));

  // stock by location — never one combined number
  const LOCS = ['Central', 'OP', 'IP', 'ICU', 'ER', 'OT', 'Ward'];
  const locRows = all(`SELECT medicine_id, location, sum(qty) qty FROM medicine_batches WHERE qty>0 AND expiry > date('now','localtime') GROUP BY medicine_id, location`);
  const byMed = {};
  for (const r of locRows) (byMed[r.medicine_id] ||= {})[r.location] = r2(r.qty);
  const stockMatrix = stock.map((s) => ({ id: s.id, name: s.name, brand: s.brand, unit: s.dispensing_unit, min: s.reorder_level,
    ...Object.fromEntries(LOCS.map((l) => [l, byMed[s.id]?.[l] || 0])), total: r2(s.qty) })).sort((a, b) => a.name.localeCompare(b.name));

  // low stock with a sensible reorder suggestion: bring stock back to twice the minimum, rounded up to whole purchase units
  const lastBuy = Object.fromEntries(all(`SELECT pi.medicine_id, pi.rate, pi.pack_size, pi.units_per_pack, s.name supplier, s.id supplier_id FROM purchase_items pi
      JOIN purchases p ON p.id=pi.purchase_id JOIN suppliers s ON s.id=p.supplier_id
     WHERE pi.id IN (SELECT max(id) FROM purchase_items GROUP BY medicine_id)`).map((r) => [r.medicine_id, r]));
  const low = stock.filter((s) => s.qty <= s.reorder_level).map((s) => {
    const lb = lastBuy[s.id];
    const perUnit = (lb?.pack_size || s.pack_size || 1) * (lb?.units_per_pack || s.units_per_pack || 1);
    const need = Math.max(s.reorder_level * 2 - s.qty, s.reorder_level);
    const units = Math.ceil(need / perUnit);
    const where = byMed[s.id] ? Object.entries(byMed[s.id]).map(([l, v]) => `${l} ${v}`).join(' · ') : 'none';
    return { id: s.id, name: s.name, brand: s.brand, locations: where, qty: r2(s.qty), min: s.reorder_level, unit: s.dispensing_unit,
      suggest_units: units * perUnit, suggest_purchase: units, last_rate: lb?.rate ?? null, supplier: lb?.supplier || null, supplier_id: lb?.supplier_id || null };
  }).sort((a, b) => a.qty - b.qty);

  // expiry
  const expiry = all(`SELECT b.id, m.name, m.brand, b.batch_no, b.expiry, b.qty, b.location, r2 value, s.name supplier,
      cast(julianday(b.expiry) - julianday(date('now','localtime')) AS int) days
    FROM (SELECT *, round(qty*purchase_rate,2) r2 FROM medicine_batches) b JOIN medicines m ON m.id=b.medicine_id LEFT JOIN suppliers s ON s.id=b.supplier_id
    WHERE b.qty>0 ORDER BY b.expiry`).map((b) => ({ ...b,
    bucket: b.days < 0 ? 'expired' : b.days <= 30 ? 'd30' : b.days <= 60 ? 'd60' : b.days <= 90 ? 'd90' : 'later',
    return_eligibility: b.location !== 'Central' ? 'Move back to Central first' : b.days < 0 ? 'Expired — per supplier policy' : b.days <= 90 ? 'Eligible for supplier return' : 'Not yet' }));
  const expiryBuckets = ['expired', 'd30', 'd60', 'd90', 'later'].map((k) => {
    const list = expiry.filter((e) => e.bucket === k);
    return { key: k, label: { expired: 'Expired', d30: 'Within 30 days', d60: '31–60 days', d90: '61–90 days', later: 'Above 90 days' }[k], batches: list.length, value: r2(list.reduce((s, e) => s + e.value, 0)) };
  });

  // purchases / GRN
  const month = M.monthStart(d);
  const grn = {
    today: n('SELECT count(*) FROM purchases WHERE date(received_at)=?', d),
    value_today: r2(n('SELECT coalesce(sum(total),0) FROM purchases WHERE date(received_at)=?', d)),
    value_month: r2(n('SELECT coalesce(sum(total),0) FROM purchases WHERE date(received_at) BETWEEN ? AND ?', month, d)),
    pending_bills: n('SELECT count(*) FROM purchases WHERE total - paid > 0.005'),
    pending_amount: r2(n('SELECT coalesce(sum(total - paid),0) FROM purchases WHERE total - paid > 0.005')),
    pending_verification: kpis.pending_grn,
    returns_month: r2(n('SELECT coalesce(sum(value + cgst + sgst + igst),0) FROM purchase_returns WHERE date(created_at) BETWEEN ? AND ?', month, d)),
    supplier_credits: r2(-n('SELECT coalesce(sum(outstanding),0) FROM suppliers WHERE outstanding<0')),
    rows: all(`SELECT p.id, p.grn_no, s.name supplier, p.invoice_no, p.invoice_date, p.gross, p.discount, p.cgst, p.sgst, p.igst, p.round_off, p.total, p.paid,
        round(p.total - p.paid, 2) due, p.status, p.verified_at FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC LIMIT 40`)
      .map((g) => ({ ...g, taxable: r2(g.gross - (g.discount || 0)), state: g.verified_at ? (g.due > 0.005 ? 'Verified · due' : 'Verified · paid') : 'Awaiting verification' })),
  };

  // sales graph, payment mix, movers, margin
  const series = pharmSeries(query);
  const gq = { from: series.from, to: series.to };
  const gcol = M.collections({ ...gq, desk: 'pharmacy' });
  const gpay = Object.fromEntries(all(`SELECT s.mode, sum(s.amount) v FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
    WHERE b.bill_type='PHARM' AND s.status<>'cancelled' AND date(s.created_at) BETWEEN ? AND ? GROUP BY s.mode`, gq.from, gq.to).map((r) => [r.mode, r2(r.v)]));
  const gdue = r2(n("SELECT coalesce(sum(CASE WHEN balance>0 THEN balance END),0) FROM bills WHERE bill_type='PHARM' AND status<>'cancelled' AND bill_date BETWEEN ? AND ?", gq.from, gq.to));
  const modes = [['Cash', gcol.byMode.cash], ['UPI', gcol.byMode.upi], ['Card', gcol.byMode.card], ['Bank', gcol.byMode.bank],
    ['Credit', gpay.credit || 0], ['Insurance', (gpay.insurance || 0) + (gpay.corporate || 0)], ['Aarogyasri', gpay.aarogyasri || 0], ['Due', gdue]]
    .map(([label, value]) => ({ label, value: r2(value) }));

  const fastFrom = { today: d, '7': M.addDays(d, -6), '30': M.addDays(d, -29) }[query.fast || '7'] || (query.ffrom || M.addDays(d, -6));
  const fastTo = query.fast === 'custom' && query.fto ? query.fto : d;
  const fast = all(`SELECT m.name, m.brand, sum(bi.qty) qty, round(sum(bi.amount),2) value, count(DISTINCT b.patient_id) patients
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN medicine_batches mb ON mb.id=bi.batch_id JOIN medicines m ON m.id=mb.medicine_id
    WHERE bi.revenue_head='PHARMACY' AND bi.category<>'refund' AND b.status<>'cancelled' AND date(coalesce(bi.created_at, b.created_at)) BETWEEN ? AND ?
    GROUP BY m.id ORDER BY qty DESC LIMIT 15`, fastFrom, fastTo);
  const slowDays = [30, 60, 90, 180].includes(+query.slow) ? +query.slow : 90;
  const slow = all(`SELECT m.name, m.brand, sum(b.qty) qty, round(sum(b.qty*b.purchase_rate),2) value,
      (SELECT max(sm.created_at) FROM stock_moves sm WHERE sm.medicine_id=m.id AND sm.move_type IN ('sale','transfer_out','indent')) last_moved
    FROM medicines m JOIN medicine_batches b ON b.medicine_id=m.id AND b.qty>0 WHERE m.active=1 GROUP BY m.id
    HAVING last_moved IS NULL OR date(last_moved) < date('now','localtime', ?) ORDER BY value DESC LIMIT 30`, `-${slowDays} day`);

  const rev = M.revenue({ ...gq, segment: 'PHARMACY' });
  const cogs = r2(n(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE a.system_key IN ('cogs_pharmacy','cogs_consumables') AND v.voucher_date BETWEEN ? AND ?`, gq.from, gq.to));
  const margin = { from: gq.from, to: gq.to, net_sales: rev.net, cogs, gross_margin: r2(rev.net - cogs),
    pct: rev.net ? Math.round(((rev.net - cogs) / rev.net) * 1000) / 10 : null,
    note: 'Net sales (excluding GST, after returns and discounts) less the purchase cost of the batches actually dispensed.' };

  return {
    session_dues:sessionDues('pharmacy',d),kpis, queue, stock: stockMatrix, locations: LOCS, low, expiry: expiry.filter((e) => e.bucket !== 'later').slice(0, 200), expiry_buckets: expiryBuckets,
    grn, series, modes, fast: { from: fastFrom, to: fastTo, rows: fast }, slow: { days: slowDays, rows: slow }, margin,
    pending_bills: all(`SELECT b.id, b.bill_no, b.bill_date, b.total, b.paid, b.balance, b.payer_type, b.claim_status, p.name patient_name, p.uhid FROM bills b JOIN patients p ON p.id=b.patient_id
      WHERE b.bill_type='PHARM' AND b.status<>'cancelled' AND b.balance>0.005 ORDER BY b.id DESC LIMIT 40`),
    purchase_requests: all("SELECT id, pr_no, status, created_at FROM purchase_requests WHERE status IN ('requested','ordered') ORDER BY id DESC LIMIT 20"),
  };
}

/* ======================================================================
   RECEPTION
   ====================================================================== */

function receptionDash(q) {
  const d = q.to;
  accrueAll();
  const enc = get(`SELECT count(*) op, sum(e.payment_status='paid') paid, sum(e.payment_status IN ('free','waived')) free,
      sum(e.visit_type<>'new') followups, sum(date(p.created_at)=e.visit_date) new_patients, sum(date(p.created_at)<e.visit_date) returning_patients
    FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE e.kind='OP' AND e.visit_date=?`, d);
  const col = M.collections({ from: d, to: d, desk: 'reception' });
  const bill = M.billing({ from: d, to: d, desk: 'reception' });
  const rec = M.receivables(d);
  const payQueue = (cat) => all(`SELECT b.id bill_id, b.bill_no, b.total + b.discount gross, b.discount, b.total payable, b.paid, b.balance due, b.payer_type category, b.claim_status,
      b.authorization_status, b.approval_request, b.claim_status, p.id patient_id, p.uhid, p.name patient_name, p.age_years, p.gender, u.name doctor_name,
      group_concat(o.label, ', ') tests, min(o.ordered_at) ordered_at, max(o.priority='stat') stat
    FROM orders o JOIN bill_items bi ON bi.order_id=o.id JOIN bills b ON b.id=bi.bill_id AND b.status<>'cancelled'
    JOIN patients p ON p.id=o.patient_id LEFT JOIN users u ON u.id=o.ordered_by
    WHERE o.category=? AND o.status='awaiting_payment' GROUP BY b.id ORDER BY stat DESC, ordered_at`, cat);
  const labQ = payQueue('lab'), imgQ = [...payQueue('imaging'), ...payQueue('procedure')];
  const visitRow = `SELECT e.id, e.token_prefix, e.token_no, e.stage, e.payment_status, e.visit_type, e.priority, e.opened_at,
      p.id patient_id, p.uhid, p.name patient_name, p.age_years, p.gender, p.payer_type category, u.name doctor_name, dp.name department,
      cast((julianday('now','localtime') - julianday(e.opened_at))*1440 AS int) waiting_min,
      (SELECT b.id FROM bills b WHERE b.encounter_id=e.id AND b.bill_type='OP' AND b.status<>'cancelled' AND b.balance>0.005 LIMIT 1) due_bill_id
    FROM encounters e JOIN patients p ON p.id=e.patient_id LEFT JOIN users u ON u.id=e.doctor_id LEFT JOIN departments dp ON dp.id=e.department_id`;
  const queues = {
    registration: all(`${visitRow} WHERE e.visit_date=? AND e.kind IN ('OP','EMG') ORDER BY e.id DESC LIMIT 100`, d),
    vitals: all(`${visitRow} WHERE e.visit_date=? AND e.stage IN ('registered','vitals_pending') ORDER BY e.priority='emergency' DESC, e.id`, d),
    doctor: all(`${visitRow} WHERE e.visit_date=? AND e.stage IN ('vitals_done','ready','in_consult') ORDER BY e.stage='in_consult' DESC, e.id`, d),
    lab: labQ, imaging: imgQ,
    admission: all(`SELECT a.id, a.ip_no, a.status, a.admitted_at, a.financial_category category, p.id patient_id, p.uhid, p.name patient_name, p.age_years, p.gender,
        u.name doctor_name, bd.bed_no, w.name ward FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id
        LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
       WHERE a.status='requested' OR date(a.admitted_at)=? ORDER BY a.status='requested' DESC, a.id DESC`, d),
    discharge: all(`SELECT a.id, a.ip_no, a.status, a.admitted_at, a.financial_category category, p.id patient_id, p.uhid, p.name patient_name, p.age_years, p.gender,
        u.name doctor_name, bd.bed_no, w.name ward, bl.id bill_id, bl.total, bl.paid, bl.balance
       FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
       LEFT JOIN bills bl ON bl.id=(SELECT id FROM bills x WHERE x.encounter_id=a.encounter_id AND x.bill_type='IP' AND x.status<>'cancelled' ORDER BY id DESC LIMIT 1)
      WHERE a.status IN ('discharge_initiated','clinically_cleared','financially_cleared') OR (a.status='discharged' AND coalesce(bl.balance,0) > 0.5)`),
    pending: all(`SELECT b.id bill_id, b.bill_no, b.bill_type, b.bill_date, b.total, b.paid, b.balance, b.payer_type category, b.authorization_status, b.claim_status,
        p.id patient_id, p.uhid, p.name patient_name, p.age_years, p.gender
       FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.bill_type<>'PHARM' AND b.status<>'cancelled' AND b.balance>0.005
         AND NOT (b.bill_type='IP' AND EXISTS (SELECT 1 FROM admissions a WHERE a.encounter_id=b.encounter_id AND a.status NOT IN ('discharged','requested') AND a.status NOT IN ('discharge_initiated','clinically_cleared','financially_cleared')))
       ORDER BY b.bill_date DESC LIMIT 100`),
  };
  const cats = Object.fromEntries(all(`SELECT CASE WHEN e.payment_status IN ('free','waived') THEN 'free' ELSE coalesce(p.payer_type,'self') END c, count(DISTINCT e.patient_id) n
    FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE e.visit_date=? GROUP BY c`, d).map((r) => [r.c, r.n]));
  const inHouse = all(`SELECT a.id, a.ip_no, p.name patient_name, p.uhid, bd.bed_no, w.name ward, bl.id bill_id, bl.total, bl.paid, bl.balance,
      cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) + 1 days
    FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
    LEFT JOIN bills bl ON bl.id=(SELECT id FROM bills x WHERE x.encounter_id=a.encounter_id AND x.bill_type='IP' AND x.status<>'cancelled' ORDER BY id DESC LIMIT 1)
    WHERE a.status NOT IN ('discharged','requested') ORDER BY a.admitted_at`);
  const doctors = all(`SELECT u.id, u.name doctor, sum(e.stage IN ('registered','vitals_pending','vitals_done','ready')) waiting,
      sum(e.stage IN ('consulted','services_pending','closed')) completed,
      round(avg(CASE WHEN e.consult_start IS NOT NULL THEN (julianday(e.consult_start)-julianday(e.opened_at))*1440 END)) avg_wait,
      (SELECT x.token_no FROM encounters x WHERE x.doctor_id=u.id AND x.visit_date=? AND x.stage='in_consult' ORDER BY x.consult_start DESC LIMIT 1) current_token
    FROM encounters e JOIN users u ON u.id=e.doctor_id WHERE e.visit_date=? AND e.kind='OP' GROUP BY u.id ORDER BY u.name`, d, d);
  return {
    session_dues:sessionDues('reception',d),
    kpis: {
      op: enc.op || 0, paid_op: enc.paid || 0, free_op: enc.free || 0, followups: enc.followups || 0, new_patients: enc.new_patients || 0, returning: enc.returning_patients || 0,
      admissions: n("SELECT count(*) FROM admissions WHERE status<>'requested' AND date(admitted_at)=?", d),
      discharges: n('SELECT count(*) FROM admissions WHERE date(discharged_at)=?', d),
      pending_admissions: n("SELECT count(*) FROM admissions WHERE status='requested'"),
      doctor_queue: queues.doctor.length, vitals_queue: queues.vitals.length, lab_queue: labQ.length, imaging_queue: imgQ.length,
      lab_queue_amount: r2(labQ.reduce((s, x) => s + x.due, 0)), imaging_queue_amount: r2(imgQ.reduce((s, x) => s + x.due, 0)),
      collected: col.net, due_today: bill.due,
      receivables: r2(rec.types.find((t) => t.key === 'patient').outstanding - n("SELECT coalesce(sum(balance),0) FROM bills WHERE bill_type='PHARM' AND status<>'cancelled' AND balance>0.005")),
      in_house: inHouse.length, approvals: n("SELECT count(*) FROM bills WHERE approval_request IS NOT NULL AND status<>'cancelled'"),
    },
    categories: M.CATEGORIES.map((c) => ({ key: c, label: M.CATEGORY_LABEL[c], value: cats[c] || 0 })),
    queues, inpatients: inHouse,
    collection: {
      billed: bill.net, gross: bill.gross, collected: col.net, received: col.received, due: bill.due, discounts: bill.discount, refunds: col.refunded,
      modes: M.MODE_GROUPS.map((g) => ({ label: MODE_LABEL[g], value: col.byMode[g] || 0 })),
      receivables: rec.types.filter((t) => t.key !== 'patient' && t.key !== 'trust').map((t) => ({ label: t.label, value: t.outstanding })),
      note: 'Collected = money actually received today. Amounts billed to a payer or left as due are not collection.',
    },
    hourly: all(`SELECT strftime('%H', opened_at) h, count(*) n FROM encounters WHERE visit_date=? AND kind IN ('OP','EMG') GROUP BY h ORDER BY h`, d)
      .map((r) => ({ label: `${+r.h}–${+r.h + 1}`, value: r.n })),
    doctors,
  };
}

/* ======================================================================
   OWNER
   ====================================================================== */

function ownerDash(q) {
  const d = today() < q.to ? today() : q.to;
  const day = { from: d, to: d };
  const f = { ...q };                 // selected period for the analysis sections
  accrueAll();
  const rec = M.receivables(d, f);
  const occ = M.occupancy();
  const res = M.results(f);
  const cash = M.cashPosition(day);
  const cards = {
    revenue: M.revenue(day).net, collection: M.collections(day).net, expense: M.expenses(day).total, net_cash: r2(cash.closing - cash.opening),
    outstanding: rec.total, op: n("SELECT count(*) FROM encounters WHERE kind='OP' AND visit_date=?", d),
    admissions: n("SELECT count(*) FROM admissions WHERE status<>'requested' AND date(admitted_at)=?", d),
    current_ip: n("SELECT count(*) FROM admissions WHERE status NOT IN ('discharged','requested')"),
    discharges: n('SELECT count(*) FROM admissions WHERE date(discharged_at)=?', d), occupancy: occ.hospital.pct,
    insurance: rec.types.find((t) => t.key === 'insurance').outstanding, aarogyasri: rec.types.find((t) => t.key === 'aarogyasri').outstanding,
    corporate: rec.types.find((t) => t.key === 'corporate').outstanding,
  };
  const pcol = M.collections(f);
  const byDay = M.revenueByDay(f), colDay = M.collectionsByDay(f);
  const expDayRows = Object.fromEntries(all(`SELECT v.voucher_date d, sum(l.debit-l.credit) v FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
    WHERE a.type='expense' AND v.voucher_date BETWEEN ? AND ? GROUP BY v.voucher_date`, f.from, f.to).map((r) => [r.d, r2(r.v)]));
  const cm = Object.fromEntries(colDay.map((r) => [r.d, r.collected]));
  const exToday = M.expenses(day), exMonth = M.expenses({ from: M.monthStart(d), to: d }), exFy = M.expenses({ from: M.fyStart(d), to: d });
  return {
    as_of: d, cards, compare: M.dayComparisons(d), periods: M.periodComparisons(d), todate: M.toDate(d),
    revenue: M.revenue(f),
    trend: byDay.map((r) => ({ d: r.d, revenue: r.revenue, collected: cm[r.d] || 0, expense: expDayRows[r.d] || 0 })),
    collections: { ...pcol, modes: M.MODE_GROUPS.map((g) => ({ label: MODE_LABEL[g], value: pcol.byMode[g] || 0 })),
      note: 'Only money received. Insurance, Aarogyasri, corporate and patient dues are receivables until paid.' },
    receivables: { ...rec, buckets: M.AGE_BUCKETS.map(([k, l]) => ({ key: k, label: l })) },
    categories: M.categoryAnalysis(f),
    expenses: M.EXPENSE_GROUPS.map(([label], i) => ({ label, today: exToday.groups[i].amount, mtd: exMonth.groups[i].amount, fytd: exFy.groups[i].amount })),
    expense_totals: { today: exToday.total, mtd: exMonth.total, fytd: exFy.total, purchases_mtd: exMonth.inventory_purchases, purchases_fytd: exFy.inventory_purchases },
    results: res, cash,
    op: M.opAnalysis(f), op_trend: M.opTrend(d, 30),
    census: M.census(d), occupancy: occ, alos: M.alos(f),
    departments: M.departmentSummary(f),
    refunds: M.refundAnalysis(f), discounts: M.discountAnalysis(f), advances: M.advances(f),
    insurance: M.payerAnalysis(f, 'insurance'), aarogyasri: M.payerAnalysis(f, 'aarogyasri'),
  };
}

export { pharmacyDash, receptionDash, ownerDash };
