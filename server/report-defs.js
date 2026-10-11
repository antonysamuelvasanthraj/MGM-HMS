/**
 * Department report catalogue — pharmacy, reception, executive, operational,
 * scheme / payer and revenue reports. Every report returns summary KPIs, an
 * optional chart and a detail table; all figures come from metrics.js or the
 * transaction tables, never from what a screen happened to show.
 */
import { all, get, one, today } from './db.js';
import * as M from './metrics.js';
import { can, STAFF_TEAMS } from './auth.js';

const r2 = M.r2;
const col = (key, label, type = 'text') => ({ key, label, type });
const money = (k, l) => col(k, l, 'money');
const num = (k, l) => col(k, l, 'number');
const date = (k, l) => col(k, l, 'date');
const kpi = (label, value, type = 'money') => ({ label, value, type });
const sum = (rows, k) => r2(rows.reduce((s, r) => s + (+r[k] || 0), 0));
const P = 'reports.pharmacy', R = 'reports.reception', V = 'reports.view', F = 'finance.view';
const MODE = { cash: 'Cash', upi: 'UPI', debit_card: 'Debit card', credit_card: 'Credit card', bank_transfer: 'Bank transfer', cheque: 'Cheque',
  insurance: 'Insurance', aarogyasri: 'Aarogyasri', corporate: 'Corporate', credit: 'Credit', trust: 'Trust', free: 'Free', due: 'Due' };

/* ---------------------------------------------------------------- pharmacy */

const PL = `FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN patients p ON p.id=b.patient_id
  LEFT JOIN medicine_batches mb ON mb.id=bi.batch_id LEFT JOIN medicines m ON m.id=mb.medicine_id
  WHERE bi.revenue_head='PHARMACY' AND b.status<>'cancelled' AND date(coalesce(bi.created_at, b.created_at)) BETWEEN ? AND ?`;
const sold = (q, extra = '') => all(`SELECT b.bill_no, b.bill_type, date(coalesce(bi.created_at, b.created_at)) d, p.uhid, p.name patient, coalesce(m.name, bi.description) item,
    m.generic, m.brand, mb.batch_no, mb.expiry, mb.location, bi.qty, bi.rate, bi.amount, bi.category, bi.unit_cost, bi.gst_pct
  ${PL} ${extra} ORDER BY bi.id`, q.from, q.to);
const grouped = (q, key, label) => {
  const rows = all(`SELECT coalesce(${key},'—') k, count(DISTINCT b.id) bills, sum(CASE WHEN bi.category<>'refund' THEN bi.qty ELSE 0 END) qty,
      round(sum(CASE WHEN bi.category<>'refund' THEN bi.amount ELSE 0 END),2) sales, round(sum(CASE WHEN bi.category='refund' THEN -bi.amount ELSE 0 END),2) returns
    ${PL} GROUP BY k ORDER BY sales DESC`, q.from, q.to).map((r) => ({ ...r, net: r2(r.sales - r.returns) }));
  return { kpis: [kpi('Sales', sum(rows, 'sales')), kpi('Returns', sum(rows, 'returns')), kpi('Net', sum(rows, 'net')), kpi(label + 's', rows.length, 'number')],
    columns: [col('k', label), num('bills', 'Bills'), num('qty', 'Qty'), money('sales', 'Sales'), money('returns', 'Returns'), money('net', 'Net')], rows, total: ['bills', 'qty', 'sales', 'returns', 'net'],
    chart: { type: 'hbar', x: 'k', series: [{ key: 'net', label: 'Net' }], top: 12 } };
};
const pharmBills = (q, where, extraCols = []) => {
  const rows = all(`SELECT b.bill_no, b.bill_date, p.uhid, p.name patient, p.mobile, b.total + b.discount gross, b.discount, b.total, b.paid, b.covered_amount covered, b.waived_amount free, b.balance, b.status,
      b.discount_reason, b.cancel_reason, (SELECT group_concat(DISTINCT mode) FROM payments x WHERE x.bill_id=b.id AND x.cancelled=0) modes
    FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.bill_type='PHARM' AND b.bill_date BETWEEN ? AND ? ${where} ORDER BY b.id DESC`, q.from, q.to);
  return { kpis: [kpi('Bills', rows.length, 'number'), kpi('Billed', sum(rows, 'total')), kpi('Paid', sum(rows, 'paid')), kpi('Due', sum(rows, 'balance'))],
    columns: [col('bill_no', 'Bill'), date('bill_date', 'Date'), col('uhid', 'UHID'), col('patient', 'Patient'), money('gross', 'Gross'), money('discount', 'Discount'), money('total', 'Net'), money('paid', 'Paid'), money('covered', 'Payer'), money('free', 'Free'), money('balance', 'Due'), col('status', 'Status'), ...extraCols],
    rows, total: ['gross', 'discount', 'total', 'paid', 'covered', 'free', 'balance'] };
};
const stockRows = () => all(`SELECT m.id, m.name, m.brand, m.generic, m.dispensing_unit unit, m.reorder_level min,
    sum(CASE WHEN b.expiry > date('now','localtime') THEN b.qty ELSE 0 END) qty, round(sum(b.qty*b.purchase_rate),2) cost_value, round(sum(b.qty*b.mrp),2) mrp_value,
    (SELECT max(sm.created_at) FROM stock_moves sm WHERE sm.medicine_id=m.id AND sm.move_type IN ('sale','transfer_out')) last_moved
  FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.id AND b.qty>0 WHERE m.active=1 GROUP BY m.id ORDER BY m.name`);
const payerPharm = (mode) => (q) => {
  const rows = all(`SELECT s.settlement_no, date(s.created_at) d, b.bill_no, p.uhid, p.name patient, s.payer_name, s.reference, s.amount, s.settled_amount received,
      round(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient,2) outstanding, s.status
    FROM bill_settlements s JOIN bills b ON b.id=s.bill_id JOIN patients p ON p.id=s.patient_id
    WHERE b.bill_type IN ('PHARM') AND s.mode IN (${mode.map(() => '?').join(',')}) AND s.status<>'cancelled' AND date(s.created_at) BETWEEN ? AND ?`, ...mode, q.from, q.to);
  return { kpis: [kpi('Cases', rows.length, 'number'), kpi('Value', sum(rows, 'amount')), kpi('Received', sum(rows, 'received')), kpi('Outstanding', sum(rows, 'outstanding'))],
    columns: [col('settlement_no', 'Ref'), date('d', 'Date'), col('bill_no', 'Bill'), col('patient', 'Patient'), col('payer_name', 'Payer'), col('reference', 'Pre-auth / ref'), money('amount', 'Value'), money('received', 'Received'), money('outstanding', 'Outstanding'), col('status', 'Status')],
    rows, total: ['amount', 'received', 'outstanding'] };
};

const PHARMACY = [
  ['pharm_daily', 'Daily pharmacy sales', (q) => {
    const rows = all(`SELECT date(coalesce(bi.created_at, b.created_at)) d, count(DISTINCT b.id) bills, round(sum(CASE WHEN b.bill_type='PHARM' AND bi.category<>'refund' THEN bi.amount ELSE 0 END),2) op,
        round(sum(CASE WHEN b.bill_type='IP' AND bi.category<>'refund' THEN bi.amount ELSE 0 END),2) ip, round(sum(CASE WHEN bi.category='refund' THEN -bi.amount ELSE 0 END),2) returns
      ${PL} GROUP BY d ORDER BY d`, q.from, q.to).map((r) => ({ ...r, net: r2(r.op + r.ip - r.returns) }));
    const c = M.collections({ ...q, desk: 'pharmacy' });
    return { kpis: [kpi('OP sales', sum(rows, 'op')), kpi('IP consumption', sum(rows, 'ip')), kpi('Returns', sum(rows, 'returns')), kpi('Collected', c.net)],
      columns: [date('d', 'Date'), num('bills', 'Bills'), money('op', 'OP sales'), money('ip', 'IP consumption'), money('returns', 'Returns'), money('net', 'Net')], rows, total: ['bills', 'op', 'ip', 'returns', 'net'],
      chart: { type: 'bar', x: 'd', stacked: true, series: [{ key: 'op', label: 'OP' }, { key: 'ip', label: 'IP' }] } };
  }],
  ['pharm_op_sales', 'OP pharmacy sales', (q) => { const rows = sold(q, "AND b.bill_type='PHARM' AND bi.category<>'refund'");
    return { kpis: [kpi('Lines', rows.length, 'number'), kpi('Value', sum(rows, 'amount'))], columns: [date('d', 'Date'), col('bill_no', 'Bill'), col('patient', 'Patient'), col('item', 'Item'), col('batch_no', 'Batch'), num('qty', 'Qty'), money('rate', 'Rate'), money('amount', 'Amount')], rows, total: ['qty', 'amount'] }; }],
  ['pharm_ip_consumption', 'IP pharmacy consumption', (q) => { const rows = all(`SELECT p.uhid, p.name patient, (SELECT ip_no FROM admissions a WHERE a.encounter_id=b.encounter_id) ip_no, count(*) lines, sum(bi.qty) qty, round(sum(bi.amount),2) amount
      ${PL} AND b.bill_type='IP' AND bi.category<>'refund' GROUP BY b.patient_id ORDER BY amount DESC`, q.from, q.to);
    return { kpis: [kpi('Patients', rows.length, 'number'), kpi('Value', sum(rows, 'amount'))], columns: [col('ip_no', 'IP no'), col('uhid', 'UHID'), col('patient', 'Patient'), num('lines', 'Lines'), num('qty', 'Qty'), money('amount', 'Value')], rows, total: ['lines', 'qty', 'amount'] }; }],
  ['pharm_medicine_sales', 'Medicine-wise sales', (q) => grouped(q, "coalesce(m.name, bi.description)", 'Medicine')],
  ['pharm_generic_sales', 'Generic-wise sales', (q) => grouped(q, 'm.generic', 'Generic')],
  ['pharm_brand_sales', 'Brand-wise sales', (q) => grouped(q, 'm.brand', 'Brand')],
  ['pharm_doctor_rx', 'Doctor-wise prescriptions', (q) => { const rows = all(`SELECT coalesce(u.name,'—') doctor, count(DISTINCT r.id) prescriptions, count(i.id) items, sum(i.dispensed_qty >= i.qty) dispensed_items,
      round(100.0 * sum(i.dispensed_qty >= i.qty) / max(count(i.id),1),1) fill_pct
    FROM prescriptions r JOIN prescription_items i ON i.prescription_id=r.id LEFT JOIN users u ON u.id=r.doctor_id WHERE date(r.created_at) BETWEEN ? AND ? GROUP BY u.id ORDER BY prescriptions DESC`, q.from, q.to);
    return { kpis: [kpi('Prescriptions', sum(rows, 'prescriptions'), 'number'), kpi('Items', sum(rows, 'items'), 'number')], columns: [col('doctor', 'Doctor'), num('prescriptions', 'Prescriptions'), num('items', 'Items'), num('dispensed_items', 'Dispensed'), num('fill_pct', 'Filled %')], rows, total: ['prescriptions', 'items', 'dispensed_items'] }; }],
  ['pharm_dept_sales', 'Department-wise pharmacy sales', (q) => grouped(q, "(SELECT d.name FROM encounters e JOIN departments d ON d.id=e.department_id WHERE e.id=b.encounter_id)", 'Department')],
  ['pharm_patient', 'Patient-wise dispensing', (q) => grouped(q, "p.name || ' · ' || p.uhid", 'Patient')],
  ['pharm_payment_mode', 'Pharmacy payment modes', (q) => { const c = M.collections({ ...q, desk: 'pharmacy' });
    const pay = all(`SELECT s.mode, sum(s.amount) v FROM bill_settlements s JOIN bills b ON b.id=s.bill_id WHERE b.bill_type='PHARM' AND s.status<>'cancelled' AND date(s.created_at) BETWEEN ? AND ? GROUP BY s.mode`, q.from, q.to);
    const due = r2(one("SELECT coalesce(sum(CASE WHEN balance>0 THEN balance END),0) FROM bills WHERE bill_type='PHARM' AND status<>'cancelled' AND bill_date BETWEEN ? AND ?", q.from, q.to) || 0);
    const rows = [...M.MODE_GROUPS.map((g) => ({ mode: g.toUpperCase() === 'UPI' ? 'UPI' : g[0].toUpperCase() + g.slice(1), kind: 'Money received', amount: c.byMode[g] })),
      ...pay.map((p) => ({ mode: MODE[p.mode] || p.mode, kind: 'Payer / approval', amount: r2(p.v) })), { mode: 'Due', kind: 'Still owed', amount: due }].filter((r) => r.amount);
    return { kpis: [kpi('Money received', c.net), kpi('Payer / free', sum(pay.map((p) => ({ v: p.v })), 'v')), kpi('Due', due)], columns: [col('mode', 'Mode'), col('kind', 'Type'), money('amount', 'Amount')], rows, total: ['amount'],
      chart: { type: 'donut', x: 'mode', series: [{ key: 'amount', label: 'Amount' }] } }; }],
  ['pharm_due', 'Pharmacy due report', (q) => pharmBills(q, 'AND b.balance > 0.005 AND b.status<>\'cancelled\'', [col('mobile', 'Mobile')])],
  ['pharm_returns', 'Pharmacy returns', (q) => { const rows = all(`SELECT r.return_no, date(r.created_at) d, b.bill_no, p.name patient, bi.description item, r.qty, r.amount, r.refund_mode, r.reason, u.name by_name
      FROM sales_returns r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id JOIN bill_items bi ON bi.id=r.bill_item_id LEFT JOIN users u ON u.id=r.created_by
      WHERE date(r.created_at) BETWEEN ? AND ? ORDER BY r.id DESC`, q.from, q.to);
    return { kpis: [kpi('Returns', rows.length, 'number'), kpi('Value', sum(rows, 'amount'))], columns: [col('return_no', 'Return'), date('d', 'Date'), col('bill_no', 'Bill'), col('patient', 'Patient'), col('item', 'Item'), num('qty', 'Qty'), money('amount', 'Value'), col('refund_mode', 'Refund'), col('reason', 'Reason'), col('by_name', 'By')], rows, total: ['qty', 'amount'] }; }],
  ['pharm_cancelled', 'Cancelled pharmacy bills', (q) => pharmBills(q, "AND b.status='cancelled'", [col('cancel_reason', 'Reason')])],
  ['pharm_discount', 'Pharmacy discounts', (q) => pharmBills(q, 'AND b.discount > 0', [col('discount_reason', 'Reason')])],
  ['pharm_free', 'Free medicines', (q) => pharmBills(q, 'AND b.waived_amount > 0')],
  ['pharm_insurance', 'Insurance pharmacy', payerPharm(['insurance', 'corporate'])],
  ['pharm_aarogyasri', 'Aarogyasri pharmacy', payerPharm(['aarogyasri'])],
  ['pharm_stock', 'Stock report', () => { const rows = stockRows();
    return { kpis: [kpi('Items', rows.length, 'number'), kpi('Value at cost', sum(rows, 'cost_value')), kpi('Value at MRP', sum(rows, 'mrp_value'))], columns: [col('name', 'Medicine'), col('brand', 'Brand'), col('generic', 'Composition'), num('qty', 'Usable qty'), col('unit', 'Unit'), num('min', 'Minimum'), money('cost_value', 'Cost value'), money('mrp_value', 'MRP value')], rows, total: ['cost_value', 'mrp_value'] }; }],
  ['pharm_location_stock', 'Location-wise stock', () => { const rows = all(`SELECT m.name, b.location, sum(b.qty) qty, round(sum(b.qty*b.purchase_rate),2) value, count(*) batches FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
      WHERE b.qty>0 GROUP BY m.id, b.location ORDER BY m.name, b.location`);
    return { kpis: [kpi('Value', sum(rows, 'value'))], columns: [col('name', 'Medicine'), col('location', 'Store'), num('qty', 'Qty'), num('batches', 'Batches'), money('value', 'Value at cost')], rows, total: ['value'] }; }],
  ['pharm_batch_stock', 'Batch-wise stock', () => { const rows = all(`SELECT m.name, b.batch_no, b.expiry, b.location, b.qty, b.purchase_rate, b.mrp, round(b.qty*b.purchase_rate,2) value, s.name supplier
      FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id LEFT JOIN suppliers s ON s.id=b.supplier_id WHERE b.qty>0 ORDER BY m.name, b.expiry`);
    return { kpis: [kpi('Batches', rows.length, 'number'), kpi('Value', sum(rows, 'value'))], columns: [col('name', 'Medicine'), col('batch_no', 'Batch'), date('expiry', 'Expiry'), col('location', 'Store'), num('qty', 'Qty'), money('purchase_rate', 'Cost / unit'), money('mrp', 'MRP / unit'), money('value', 'Value'), col('supplier', 'Supplier')], rows, total: ['value'] }; }],
  ['pharm_low_stock', 'Low stock', () => { const rows = stockRows().filter((r) => r.qty > 0 && r.qty <= r.min);
    return { kpis: [kpi('Items', rows.length, 'number')], columns: [col('name', 'Medicine'), col('brand', 'Brand'), num('qty', 'Qty'), num('min', 'Minimum'), col('unit', 'Unit')], rows }; }],
  ['pharm_out_of_stock', 'Out of stock', () => { const rows = stockRows().filter((r) => r.qty <= 0);
    return { kpis: [kpi('Items', rows.length, 'number')], columns: [col('name', 'Medicine'), col('brand', 'Brand'), num('min', 'Minimum'), date('last_moved', 'Last sold')], rows }; }],
  ['pharm_expiry', 'Expiry report', () => { const rows = all(`SELECT m.name, b.batch_no, b.expiry, b.location, b.qty, round(b.qty*b.purchase_rate,2) value, s.name supplier,
      cast(julianday(b.expiry) - julianday(date('now','localtime')) AS int) days FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id LEFT JOIN suppliers s ON s.id=b.supplier_id
      WHERE b.qty>0 AND b.expiry <= date('now','localtime','+90 day') ORDER BY b.expiry`).map((r) => ({ ...r, bucket: r.days < 0 ? 'Expired' : r.days <= 30 ? '≤ 30 days' : r.days <= 60 ? '31–60 days' : '61–90 days' }));
    return { kpis: [kpi('Batches', rows.length, 'number'), kpi('Value at risk', sum(rows, 'value'))], columns: [col('name', 'Medicine'), col('batch_no', 'Batch'), date('expiry', 'Expiry'), col('bucket', 'Window'), col('location', 'Store'), num('qty', 'Qty'), money('value', 'Value'), col('supplier', 'Supplier')], rows, total: ['value'] }; }],
  ['pharm_purchase', 'Purchase register (GRN lines)', (q) => { const rows = all(`SELECT p.grn_no, date(p.received_at) d, s.name supplier, p.invoice_no, m.name item, i.batch_no, i.qty, i.free_qty, i.rate, i.taxable_value, i.cgst_amount, i.sgst_amount, i.igst_amount, i.net_value
      FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id JOIN suppliers s ON s.id=p.supplier_id JOIN medicines m ON m.id=i.medicine_id WHERE date(p.received_at) BETWEEN ? AND ? ORDER BY p.id, i.id`, q.from, q.to);
    return { kpis: [kpi('Lines', rows.length, 'number'), kpi('Taxable', sum(rows, 'taxable_value')), kpi('GST', r2(sum(rows, 'cgst_amount') + sum(rows, 'sgst_amount') + sum(rows, 'igst_amount'))), kpi('Net', sum(rows, 'net_value'))],
      columns: [col('grn_no', 'GRN'), date('d', 'Date'), col('supplier', 'Supplier'), col('invoice_no', 'Invoice'), col('item', 'Item'), col('batch_no', 'Batch'), num('qty', 'Qty'), num('free_qty', 'Free'), money('rate', 'Rate'), money('taxable_value', 'Taxable'), money('cgst_amount', 'CGST'), money('sgst_amount', 'SGST'), money('igst_amount', 'IGST'), money('net_value', 'Net')],
      rows, total: ['taxable_value', 'cgst_amount', 'sgst_amount', 'igst_amount', 'net_value'] }; }],
  ['pharm_supplier_purchase', 'Supplier-wise purchase', (q) => { const rows = all(`SELECT s.name supplier, count(p.id) grns, round(sum(p.gross - p.discount),2) taxable, round(sum(p.cgst+p.sgst+p.igst),2) gst, round(sum(p.total),2) total, round(sum(p.paid),2) paid
      FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE date(p.received_at) BETWEEN ? AND ? GROUP BY s.id ORDER BY total DESC`, q.from, q.to).map((r) => ({ ...r, due: r2(r.total - r.paid) }));
    return { kpis: [kpi('Purchases', sum(rows, 'total')), kpi('Paid', sum(rows, 'paid')), kpi('Due', sum(rows, 'due'))], columns: [col('supplier', 'Supplier'), num('grns', 'GRNs'), money('taxable', 'Taxable'), money('gst', 'GST'), money('total', 'Total'), money('paid', 'Paid'), money('due', 'Due')], rows, total: ['grns', 'taxable', 'gst', 'total', 'paid', 'due'],
      chart: { type: 'hbar', x: 'supplier', series: [{ key: 'total', label: 'Purchases' }] } }; }],
  ['pharm_supplier_outstanding', 'Supplier outstanding', () => { const rows = all(`SELECT s.name supplier, s.credit_days, s.outstanding, (SELECT count(*) FROM purchases p WHERE p.supplier_id=s.id AND p.total-p.paid>0.005) open_grns,
      (SELECT min(date(received_at)) FROM purchases p WHERE p.supplier_id=s.id AND p.total-p.paid>0.005) oldest FROM suppliers s WHERE s.outstanding <> 0 ORDER BY s.outstanding DESC`);
    return { kpis: [kpi('Outstanding', sum(rows, 'outstanding'))], columns: [col('supplier', 'Supplier'), num('credit_days', 'Credit days'), num('open_grns', 'Open GRNs'), date('oldest', 'Oldest open'), money('outstanding', 'Outstanding')], rows, total: ['outstanding'] }; }],
  ['pharm_grn', 'GRN register', (q) => { const rows = all(`SELECT p.grn_no, date(p.received_at) d, s.name supplier, p.invoice_no, p.invoice_date, round(p.gross - p.discount,2) taxable, p.cgst, p.sgst, p.igst, p.discount, p.total, p.paid,
      round(p.total - p.paid,2) due, CASE WHEN p.verified_at IS NULL THEN 'Awaiting verification' ELSE 'Verified' END status FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE date(p.received_at) BETWEEN ? AND ? ORDER BY p.id DESC`, q.from, q.to);
    return { kpis: [kpi('GRNs', rows.length, 'number'), kpi('Net amount', sum(rows, 'total')), kpi('Due', sum(rows, 'due'))], columns: [col('grn_no', 'GRN'), date('d', 'Received'), col('supplier', 'Supplier'), col('invoice_no', 'Invoice'), date('invoice_date', 'Inv. date'), money('taxable', 'Taxable'), money('cgst', 'CGST'), money('sgst', 'SGST'), money('igst', 'IGST'), money('discount', 'Discount'), money('total', 'Net'), money('paid', 'Paid'), money('due', 'Due'), col('status', 'Status')],
      rows, total: ['taxable', 'cgst', 'sgst', 'igst', 'discount', 'total', 'paid', 'due'] }; }],
  ['pharm_purchase_return', 'Purchase returns', (q) => { const rows = all(`SELECT r.return_no, date(r.created_at) d, s.name supplier, m.name item, b.batch_no, r.qty, r.value, round(r.cgst+r.sgst+r.igst,2) gst, r.reason
      FROM purchase_returns r JOIN suppliers s ON s.id=r.supplier_id JOIN medicine_batches b ON b.id=r.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE date(r.created_at) BETWEEN ? AND ? ORDER BY r.id DESC`, q.from, q.to);
    return { kpis: [kpi('Returns', rows.length, 'number'), kpi('Value', r2(sum(rows, 'value') + sum(rows, 'gst')))], columns: [col('return_no', 'Return'), date('d', 'Date'), col('supplier', 'Supplier'), col('item', 'Item'), col('batch_no', 'Batch'), num('qty', 'Qty'), money('value', 'Value'), money('gst', 'GST'), col('reason', 'Reason')], rows, total: ['qty', 'value', 'gst'] }; }],
  ['pharm_transfers', 'Stock transfers', (q) => { const rows = all(`SELECT t.transfer_no, date(t.requested_at) d, t.source, t.destination, t.status, t.emergency, (SELECT sum(qty_issued) FROM stock_transfer_lines l WHERE l.transfer_id=t.id) issued,
      (SELECT sum(qty_received) FROM stock_transfer_lines l WHERE l.transfer_id=t.id) received, u.name requested_by, a.name approved_by FROM stock_transfers t LEFT JOIN users u ON u.id=t.requested_by LEFT JOIN users a ON a.id=coalesce(t.approved_by, t.ratified_by)
      WHERE date(t.requested_at) BETWEEN ? AND ? ORDER BY t.id DESC`, q.from, q.to).map((r) => ({ ...r, emergency: r.emergency ? 'Yes' : '' }));
    return { kpis: [kpi('Transfers', rows.length, 'number'), kpi('Emergency', rows.filter((r) => r.emergency).length, 'number')], columns: [col('transfer_no', 'Transfer'), date('d', 'Date'), col('source', 'From'), col('destination', 'To'), col('status', 'Status'), col('emergency', 'Emergency'), num('issued', 'Issued'), num('received', 'Received'), col('requested_by', 'Requested by'), col('approved_by', 'Approved by')], rows }; }],
  ['pharm_adjustments', 'Stock adjustments', (q) => { const rows = all(`SELECT date(sm.created_at) d, m.name item, b.batch_no, sm.location, sm.move_type, sm.qty, round(sm.qty * b.purchase_rate,2) value, sm.reason, u.name by_name
      FROM stock_moves sm JOIN medicines m ON m.id=sm.medicine_id LEFT JOIN medicine_batches b ON b.id=sm.batch_id LEFT JOIN users u ON u.id=sm.created_by
      WHERE sm.move_type IN ('adjust','expiry','damage','writeoff') AND date(sm.created_at) BETWEEN ? AND ? ORDER BY sm.id DESC`, q.from, q.to);
    return { kpis: [kpi('Adjustments', rows.length, 'number'), kpi('Value', sum(rows, 'value'))], columns: [date('d', 'Date'), col('item', 'Item'), col('batch_no', 'Batch'), col('location', 'Store'), col('move_type', 'Type'), num('qty', 'Qty'), money('value', 'Value'), col('reason', 'Reason'), col('by_name', 'By')], rows, total: ['qty', 'value'] }; }],
  ['pharm_fast', 'Fast-moving medicines', (q) => { const rows = all(`SELECT m.name, m.brand, sum(bi.qty) qty, round(sum(bi.amount),2) value, count(DISTINCT b.patient_id) patients
      ${PL} AND bi.category<>'refund' GROUP BY m.id ORDER BY qty DESC LIMIT 50`, q.from, q.to);
    return { columns: [col('name', 'Medicine'), col('brand', 'Brand'), num('qty', 'Qty dispensed'), num('patients', 'Patients'), money('value', 'Value')], rows, total: ['qty', 'value'], chart: { type: 'hbar', x: 'name', money: false, series: [{ key: 'qty', label: 'Qty' }], top: 12 } }; }],
  ['pharm_slow', 'Slow-moving stock (no sale 90 days)', () => { const rows = stockRows().filter((r) => r.qty > 0 && (!r.last_moved || M.daysBetween(r.last_moved.slice(0, 10), M.range('today').to) > 90));
    return { kpis: [kpi('Items', rows.length, 'number'), kpi('Value', sum(rows, 'cost_value'))], columns: [col('name', 'Medicine'), num('qty', 'Qty'), money('cost_value', 'Value at cost'), date('last_moved', 'Last moved')], rows, total: ['cost_value'] }; }],
  ['pharm_dead', 'Dead stock (no movement 180 days)', () => { const rows = stockRows().filter((r) => r.qty > 0 && (!r.last_moved || M.daysBetween(r.last_moved.slice(0, 10), M.range('today').to) > 180));
    return { kpis: [kpi('Items', rows.length, 'number'), kpi('Value', sum(rows, 'cost_value'))], columns: [col('name', 'Medicine'), num('qty', 'Qty'), money('cost_value', 'Value at cost'), date('last_moved', 'Last moved')], rows, total: ['cost_value'] }; }],
  ['pharm_valuation', 'Stock valuation', () => { const rows = all(`SELECT location, count(*) batches, sum(qty) units, round(sum(qty*purchase_rate),2) cost, round(sum(qty*mrp),2) mrp FROM medicine_batches WHERE qty>0 GROUP BY location ORDER BY cost DESC`);
    return { kpis: [kpi('At cost', sum(rows, 'cost')), kpi('At MRP', sum(rows, 'mrp'))], columns: [col('location', 'Store'), num('batches', 'Batches'), num('units', 'Units'), money('cost', 'Value at cost'), money('mrp', 'Value at MRP')], rows, total: ['batches', 'units', 'cost', 'mrp'],
      chart: { type: 'hbar', x: 'location', series: [{ key: 'cost', label: 'At cost' }] } }; }],
  ['pharm_margin', 'Profit / margin (at batch cost)', (q) => { const rows = all(`SELECT coalesce(m.name, bi.description) item, sum(bi.qty) qty,
      round(sum(bi.amount / (1 + coalesce(bi.gst_pct,0)/100.0)),2) net_sales, round(sum(bi.qty * bi.unit_cost),2) cost ${PL} GROUP BY item ORDER BY net_sales DESC`, q.from, q.to)
      .map((r) => ({ ...r, margin: r2(r.net_sales - r.cost), pct: r.net_sales ? Math.round(((r.net_sales - r.cost) / Math.abs(r.net_sales)) * 1000) / 10 : null }));
    const ns = sum(rows, 'net_sales'), c = sum(rows, 'cost');
    return { kpis: [kpi('Net sales (ex-GST)', ns), kpi('Cost of goods', c), kpi('Gross margin', r2(ns - c)), kpi('Margin %', ns ? Math.round(((ns - c) / ns) * 1000) / 10 : 0, 'number')],
      subtitle: 'Margin = net sales (excluding GST, after returns) − purchase cost of the batches actually dispensed; not MRP.',
      columns: [col('item', 'Item'), num('qty', 'Qty'), money('net_sales', 'Net sales'), money('cost', 'Cost'), money('margin', 'Margin'), num('pct', 'Margin %')], rows, total: ['qty', 'net_sales', 'cost', 'margin'] }; }],
];

/* --------------------------------------------------------------- reception */

const VISITS = `FROM encounters e JOIN patients p ON p.id=e.patient_id LEFT JOIN users u ON u.id=e.doctor_id LEFT JOIN departments dp ON dp.id=e.department_id
  WHERE e.visit_date BETWEEN ? AND ?`;
const visitCols = [date('visit_date', 'Date'), col('token', 'Token'), col('encounter_no', 'Visit'), col('uhid', 'UHID'), col('patient', 'Patient'), col('agesex', 'Age / sex'),
  col('doctor', 'Doctor'), col('department', 'Department'), col('visit_type', 'Visit type'), col('category', 'Category'), col('payment_status', 'Payment'), col('stage', 'Stage'), money('billed', 'OP bill')];
const visits = (where = '') => (q) => {
  const rows = all(`SELECT e.visit_date, coalesce(e.token_prefix,'') || e.token_no token, e.encounter_no, p.uhid, p.name patient, p.age_years || 'y ' || substr(coalesce(p.gender,''),1,1) agesex,
      u.name doctor, dp.name department, e.visit_type, coalesce(p.payer_type,'self') category, e.payment_status, e.stage, e.kind,
      (SELECT round(coalesce(sum(b.total),0),2) FROM bills b WHERE b.encounter_id=e.id AND b.bill_type='OP' AND b.status<>'cancelled') billed
    ${VISITS} ${where} ORDER BY e.id DESC LIMIT 5000`, q.from, q.to);
  const by = (k) => rows.filter((r) => r.payment_status === k).length;
  return { kpis: [kpi('Visits', rows.length, 'number'), kpi('Paid', by('paid'), 'number'), kpi('Free', rows.filter((r) => ['free', 'waived'].includes(r.payment_status)).length, 'number'), kpi('OP billed', sum(rows, 'billed'))],
    columns: visitCols, rows, total: ['billed'] };
};
const countBy = (key, label) => (q) => {
  const rows = all(`SELECT coalesce(${key},'—') k, count(*) visits, sum(e.visit_type='new') new_visits, sum(e.visit_type<>'new') followups, sum(e.payment_status='paid') paid, sum(e.payment_status IN ('free','waived')) free
    ${VISITS} AND e.kind='OP' GROUP BY k ORDER BY visits DESC`, q.from, q.to);
  return { kpis: [kpi('Visits', sum(rows, 'visits'), 'number')], columns: [col('k', label), num('visits', 'Visits'), num('new_visits', 'New'), num('followups', 'Follow-up'), num('paid', 'Paid'), num('free', 'Free')], rows,
    total: ['visits', 'new_visits', 'followups', 'paid', 'free'], chart: { type: 'hbar', x: 'k', money: false, series: [{ key: 'visits', label: 'Visits' }] } };
};
const serviceBills = (cat) => (q) => {
  const rows = all(`SELECT b.bill_no, b.bill_date, p.uhid, p.name patient, u.name doctor, group_concat(o.label, ', ') tests, b.total + b.discount gross, b.discount, b.total payable, b.paid,
      b.covered_amount covered, b.waived_amount free, b.balance due, coalesce(b.payer_type,'self') category, CASE WHEN b.authorization_status='approved' THEN 'Due approved' ELSE '' END authorization,
      (SELECT group_concat(DISTINCT mode) FROM payments x WHERE x.bill_id=b.id AND x.cancelled=0) modes
    FROM orders o JOIN bill_items bi ON bi.order_id=o.id JOIN bills b ON b.id=bi.bill_id AND b.status<>'cancelled' JOIN patients p ON p.id=b.patient_id LEFT JOIN users u ON u.id=o.ordered_by
    WHERE o.category=? AND b.bill_date BETWEEN ? AND ? GROUP BY b.id ORDER BY b.id DESC`, cat, q.from, q.to);
  return { kpis: [kpi('Bills', rows.length, 'number'), kpi('Payable', sum(rows, 'payable')), kpi('Paid', sum(rows, 'paid')), kpi('Due', sum(rows, 'due'))],
    columns: [col('bill_no', 'Bill'), date('bill_date', 'Date'), col('patient', 'Patient'), col('doctor', 'Doctor'), col('tests', 'Tests'), money('gross', 'Total'), money('discount', 'Discount'), money('payable', 'Payable'), money('paid', 'Paid'), money('covered', 'Payer'), money('free', 'Free'), money('due', 'Due'), col('category', 'Category'), col('authorization', 'Authorisation'), col('modes', 'Paid by')],
    rows, total: ['gross', 'discount', 'payable', 'paid', 'covered', 'free', 'due'] };
};
const receptionBills = (where, extra = []) => (q) => {
  const rows = all(`SELECT b.bill_no, b.bill_type, b.bill_date, p.uhid, p.name patient, p.mobile, coalesce(b.payer_type,'self') category, b.total + b.discount gross, b.discount, b.total, b.paid,
      b.covered_amount covered, b.waived_amount free, b.balance, b.status, b.discount_reason, (SELECT group_concat(DISTINCT mode) FROM payments x WHERE x.bill_id=b.id AND x.cancelled=0) modes
    FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.bill_type<>'PHARM' AND b.bill_date BETWEEN ? AND ? ${where} ORDER BY b.id DESC`, q.from, q.to);
  return { kpis: [kpi('Bills', rows.length, 'number'), kpi('Net billed', sum(rows, 'total')), kpi('Paid', sum(rows, 'paid')), kpi('Payer / free', r2(sum(rows, 'covered') + sum(rows, 'free'))), kpi('Due', sum(rows, 'balance'))],
    columns: [col('bill_no', 'Bill'), col('bill_type', 'Type'), date('bill_date', 'Date'), col('uhid', 'UHID'), col('patient', 'Patient'), col('category', 'Category'), money('gross', 'Gross'), money('discount', 'Discount'), money('total', 'Net'), money('paid', 'Paid'), money('covered', 'Payer'), money('free', 'Free'), money('balance', 'Due'), col('status', 'Status'), ...extra],
    rows, total: ['gross', 'discount', 'total', 'paid', 'covered', 'free', 'balance'] };
};
const receipts = (desk) => (q) => {
  const rows = all(`SELECT p.pay_date d, p.created_at, p.receipt_no, pt.name patient, b.bill_no, b.bill_type, p.mode, coalesce(p.transaction_id, p.reference) ref, p.amount, u.name collected_by
    FROM payments p JOIN bills b ON b.id=p.bill_id JOIN patients pt ON pt.id=p.patient_id LEFT JOIN users u ON u.id=p.received_by
    WHERE p.cancelled=0 AND p.pay_date BETWEEN ? AND ? ${desk === 'reception' ? "AND b.bill_type<>'PHARM'" : desk === 'pharmacy' ? "AND b.bill_type='PHARM'" : ''} ORDER BY p.id DESC`, q.from, q.to)
    .map((r) => ({ ...r, mode: MODE[r.mode] || r.mode }));
  const c = M.collections({ ...q, desk });
  return { kpis: [kpi('Cash', c.byMode.cash), kpi('UPI', c.byMode.upi), kpi('Card', c.byMode.card), kpi('Bank / other', r2(c.byMode.bank + c.byMode.other)), kpi('Net collected', c.net)],
    columns: [date('d', 'Date'), col('receipt_no', 'Receipt'), col('patient', 'Patient'), col('bill_no', 'Bill'), col('bill_type', 'Type'), col('mode', 'Mode'), col('ref', 'Reference'), money('amount', 'Amount'), col('collected_by', 'Collected by')], rows, total: ['amount'] };
};
const modeReport = (desk) => (q) => {
  const c = M.collections({ ...q, desk });
  const rows = M.MODE_GROUPS.map((g) => ({ mode: g === 'upi' ? 'UPI' : g[0].toUpperCase() + g.slice(1), amount: c.byMode[g] })).filter((r) => r.amount);
  return { kpis: [kpi('Received', c.received), kpi('Refunded', c.refunded), kpi('Net', c.net)], columns: [col('mode', 'Mode'), money('amount', 'Net amount')], rows, total: ['amount'], chart: { type: 'donut', x: 'mode', series: [{ key: 'amount', label: 'Amount' }] } };
};
const refunds = (desk) => (q) => {
  const a = M.refundAnalysis(q);
  const rows = a.rows.filter((r) => (desk === 'reception' ? r.bill_type !== 'PHARM' : desk === 'pharmacy' ? r.bill_type === 'PHARM' : true))
    .map((r) => ({ ...r, refund_mode: MODE[r.refund_mode] || r.refund_mode, original_modes: (r.original_modes || '').split(',').map((m) => MODE[m] || m).join(', ') }));
  return { kpis: [kpi('Refunds', rows.length, 'number'), kpi('Amount', sum(rows, 'amount'))], columns: [col('refund_no', 'Refund'), date('created_at', 'Date'), col('bill_no', 'Bill'), col('bill_type', 'Dept'), col('patient_name', 'Patient'),
    money('amount', 'Amount'), col('original_modes', 'Original payment'), col('refund_mode', 'Refunded by'), col('reason', 'Reason'), col('approved_by', 'Approved by')], rows, total: ['amount'] };
};
const discounts = (q) => {
  const a = M.discountAnalysis(q);
  return { kpis: [kpi('Total discounts', a.total), ...Object.entries(a.by_kind).map(([k, v]) => kpi(k, v))],
    columns: [col('bill_no', 'Bill'), col('bill_type', 'Dept'), date('bill_date', 'Date'), col('patient_name', 'Patient'), col('doctor_name', 'Doctor'), money('gross', 'Gross'), money('discount', 'Discount'), num('pct', '%'), col('kind', 'Type'), col('reason', 'Reason'), col('given_by', 'Authorised by')],
    rows: a.rows, total: ['gross', 'discount'] };
};
const payerPatients = (cat) => (q) => {
  const rows = all(`SELECT p.uhid, p.name patient, p.payer_name, p.policy_no, count(b.id) bills, round(sum(b.total + b.discount),2) gross, round(sum(b.discount),2) discount,
      round(sum(b.covered_amount),2) approved, round(sum(b.waived_amount),2) free, round(sum(b.paid),2) collected, round(sum(CASE WHEN b.balance>0 THEN b.balance ELSE 0 END),2) patient_due,
      (SELECT round(coalesce(sum(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient),0),2) FROM bill_settlements s WHERE s.patient_id=p.id AND s.status IN ('open','partially_settled')) payer_outstanding
    FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.status<>'cancelled' AND coalesce(b.payer_type,'self')=? AND b.bill_date BETWEEN ? AND ? GROUP BY p.id ORDER BY gross DESC`, cat, q.from, q.to);
  return { kpis: [kpi('Patients', rows.length, 'number'), kpi('Gross', sum(rows, 'gross')), kpi(cat === 'free' ? 'Free value' : 'Approved / covered', cat === 'free' ? sum(rows, 'free') : sum(rows, 'approved')), kpi('Collected', sum(rows, 'collected')), kpi('Outstanding', r2(sum(rows, 'patient_due') + sum(rows, 'payer_outstanding')))],
    columns: [col('uhid', 'UHID'), col('patient', 'Patient'), col('payer_name', 'Payer'), col('policy_no', 'Policy / card'), num('bills', 'Bills'), money('gross', 'Gross'), money('discount', 'Discount'), money('approved', 'Approved'), money('free', 'Free'), money('collected', 'Collected'), money('patient_due', 'Patient due'), money('payer_outstanding', 'Payer outstanding')],
    rows, total: ['bills', 'gross', 'discount', 'approved', 'free', 'collected', 'patient_due', 'payer_outstanding'] };
};
const admissionsReport = (which) => (q) => {
  const w = which === 'discharge' ? 'date(a.discharged_at) BETWEEN ? AND ?' : "a.status<>'requested' AND date(a.admitted_at) BETWEEN ? AND ?";
  const rows = all(`SELECT a.ip_no, p.uhid, p.name patient, u.name consultant, w.name ward, bd.bed_no, a.admitted_at, a.discharged_at, a.discharge_type, a.financial_category category, a.status,
      round(julianday(coalesce(a.discharged_at, datetime('now','localtime'))) - julianday(a.admitted_at),1) los,
      (SELECT round(coalesce(sum(total),0),2) FROM bills x WHERE x.encounter_id=a.encounter_id AND x.status<>'cancelled') billed,
      (SELECT round(coalesce(sum(balance),0),2) FROM bills x WHERE x.encounter_id=a.encounter_id AND x.status<>'cancelled') balance
    FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.consultant_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id WHERE ${w} ORDER BY a.id DESC`, q.from, q.to);
  return { kpis: [kpi(which === 'discharge' ? 'Discharges' : 'Admissions', rows.length, 'number'), kpi('Billed', sum(rows, 'billed')), kpi('Balance', sum(rows, 'balance'))],
    columns: [col('ip_no', 'IP no'), col('uhid', 'UHID'), col('patient', 'Patient'), col('consultant', 'Consultant'), col('ward', 'Ward'), col('bed_no', 'Bed'), date('admitted_at', 'Admitted'), date('discharged_at', 'Discharged'), num('los', 'Days'), col('category', 'Category'), col('discharge_type', 'Outcome'), money('billed', 'Billed'), money('balance', 'Balance')],
    rows, total: ['billed', 'balance'] };
};

const RECEPTION = [
  ['rec_registrations', 'Daily registration report', visits()],
  ['rec_new_patients', 'New patient report', visits('AND date(p.created_at)=e.visit_date')],
  ['rec_returning', 'Returning patient report', visits('AND date(p.created_at)<e.visit_date')],
  ['rec_op', 'OP report', visits("AND e.kind='OP'")],
  ['rec_paid_op', 'Paid OP report', visits("AND e.kind='OP' AND e.payment_status='paid'")],
  ['rec_free_op', 'Free OP report', visits("AND e.kind='OP' AND e.payment_status IN ('free','waived')")],
  ['rec_followup', 'Follow-up report', visits("AND e.kind='OP' AND e.visit_type<>'new'")],
  ['rec_doctor_op', 'Doctor-wise OP report', countBy('u.name', 'Doctor')],
  ['rec_dept_op', 'Department-wise OP report', countBy('dp.name', 'Department')],
  ['rec_category', 'Patient category report', countBy("CASE WHEN e.payment_status IN ('free','waived') THEN 'Free' ELSE coalesce(p.payer_type,'self') END", 'Category')],
  ['rec_cancelled', 'Registration cancellation report', visits("AND e.stage='cancelled'")],
  ['rec_admissions', 'Admission report', admissionsReport('admission')],
  ['rec_discharges', 'Discharge report', admissionsReport('discharge')],
  ['rec_lab_payment', 'Lab payment report', serviceBills('lab')],
  ['rec_imaging_payment', 'Imaging payment report', serviceBills('imaging')],
  ['rec_collection', 'Collection report', receipts('reception')],
  ['rec_payment_mode', 'Payment mode report', modeReport('reception')],
  ['rec_due', 'Due report', receptionBills('AND b.balance > 0.005 AND b.status<>\'cancelled\'', [col('mobile', 'Mobile')])],
  ['rec_discount', 'Discount report', discounts],
  ['rec_refund', 'Refund report', refunds('reception')],
  ['rec_insurance', 'Insurance patient report', payerPatients('insurance')],
  ['rec_aarogyasri', 'Aarogyasri patient report', payerPatients('aarogyasri')],
  ['rec_corporate', 'Corporate patient report', payerPatients('corporate')],
  ['rec_trust', 'Trust patient report', payerPatients('trust')],
  ['rec_credit', 'Credit patient report', payerPatients('credit')],
];

/* ------------------------------------------------------------- executive */

const dailySummaryRows = (q) => M.dayList(q.from, q.to, 120).map((d) => {
  const x = { from: d, to: d }, rv = M.revenue(x), c = M.collections(x), e = M.expenses(x), b = M.billing(x);
  return { d, billed: b.net, revenue: rv.net, collected: c.net, refunds: c.refunded, expense: e.total, due: b.due,
    op: one("SELECT count(*) FROM encounters WHERE kind='OP' AND visit_date=?", d) || 0, admissions: one("SELECT count(*) FROM admissions WHERE status<>'requested' AND date(admitted_at)=?", d) || 0 };
});
const EXECUTIVE = [
  ['exe_daily_summary', 'Daily hospital summary', (q) => { const rows = dailySummaryRows(q);
    return { kpis: [kpi('Net billed', sum(rows, 'billed')), kpi('Revenue', sum(rows, 'revenue')), kpi('Collected', sum(rows, 'collected')), kpi('Expense', sum(rows, 'expense')), kpi('OP visits', sum(rows, 'op'), 'number')],
      subtitle: 'Billing, revenue, collection and expense are separate figures and are never added together.',
      columns: [date('d', 'Date'), money('billed', 'Net billed'), money('revenue', 'Revenue'), money('collected', 'Collected'), money('refunds', 'Refunds'), money('expense', 'Expense'), money('due', 'New due'), num('op', 'OP'), num('admissions', 'Admissions')],
      rows, total: ['billed', 'revenue', 'collected', 'refunds', 'expense', 'due', 'op', 'admissions'],
      chart: { type: 'line', x: 'd', series: [{ key: 'revenue', label: 'Revenue' }, { key: 'collected', label: 'Collected' }, { key: 'expense', label: 'Expense' }] } }; }],
  ['exe_revenue', 'Daily revenue summary', (q) => { const r = M.revenue(q);
    return { kpis: [kpi('Gross', r.gross), kpi('Discount', r.discount), kpi('Free', r.free), kpi('Returns', r.returns), kpi('Net revenue', r.net)],
      columns: [col('label', 'Department'), money('gross', 'Gross'), money('discount', 'Discount'), money('free', 'Free'), money('returns', 'Returns'), money('net', 'Net')], rows: r.departments, total: ['gross', 'discount', 'free', 'returns', 'net'],
      chart: { type: 'hbar', x: 'label', series: [{ key: 'net', label: 'Net' }] } }; }],
  ['exe_collection', 'Daily collection summary', (q) => { const rows = M.dayList(q.from, q.to, 120).map((d) => { const c = M.collections({ from: d, to: d }); return { d, ...c.byMode, refunded: c.refunded, net: c.net }; });
    return { kpis: M.MODE_GROUPS.map((g) => kpi(g === 'upi' ? 'UPI' : g[0].toUpperCase() + g.slice(1), sum(rows, g))), columns: [date('d', 'Date'), ...M.MODE_GROUPS.map((g) => money(g, g === 'upi' ? 'UPI' : g[0].toUpperCase() + g.slice(1))), money('refunded', 'Refunds'), money('net', 'Net collected')],
      rows, total: [...M.MODE_GROUPS, 'refunded', 'net'], chart: { type: 'bar', x: 'd', stacked: true, series: M.MODE_GROUPS.map((g) => ({ key: g, label: g.toUpperCase() })) } }; }],
  ['exe_expense', 'Daily expense summary', (q) => { const e = M.expenses(q);
    return { kpis: [kpi('Total expense', e.total), kpi('Cost of goods', e.cogs), kpi('Operating', e.operating), kpi('Paid in cash', e.paid_cash), kpi('Paid by bank', e.paid_bank)],
      columns: [col('label', 'Category'), money('amount', 'Amount')], rows: e.groups.filter((g) => g.amount), total: ['amount'], chart: { type: 'hbar', x: 'label', series: [{ key: 'amount', label: 'Amount' }] } }; }],
  ['exe_outstanding', 'Daily outstanding summary', (q) => { const r = M.receivables(q.to, q);
    return { kpis: [kpi('Total outstanding', r.total), ...r.types.map((t) => kpi(t.label, t.outstanding))],
      columns: [col('label', 'Type'), num('count', 'Items'), ...M.AGE_BUCKETS.map(([k, l]) => money(k, l)), money('outstanding', 'Outstanding'), money('recovered', 'Recovered in period')], rows: r.types, total: [...M.AGE_BUCKETS.map(([k]) => k), 'outstanding', 'recovered'] }; }],
  ['exe_monthly', 'Monthly hospital summary', (q) => { const months = []; for (let m = M.monthStart(q.from); m <= q.to; m = M.addDays(`${m.slice(0, 7)}-28`, 5).slice(0, 7) + '-01') months.push(m);
    const rows = months.map((m) => { const to = M.addDays(M.monthStart(M.addDays(`${m.slice(0, 7)}-28`, 5)), -1); const x = { from: m, to: to > q.to ? q.to : to };
      return { month: m.slice(0, 7), billed: M.billing(x).net, revenue: M.revenue(x).net, collected: M.collections(x).net, expense: M.expenses(x).total, op: one("SELECT count(*) FROM encounters WHERE kind='OP' AND visit_date BETWEEN ? AND ?", x.from, x.to) || 0,
        admissions: one("SELECT count(*) FROM admissions WHERE status<>'requested' AND date(admitted_at) BETWEEN ? AND ?", x.from, x.to) || 0 }; });
    return { kpis: [kpi('Revenue', sum(rows, 'revenue')), kpi('Collected', sum(rows, 'collected')), kpi('Expense', sum(rows, 'expense'))], columns: [col('month', 'Month'), money('billed', 'Net billed'), money('revenue', 'Revenue'), money('collected', 'Collected'), money('expense', 'Expense'), num('op', 'OP'), num('admissions', 'Admissions')],
      rows, total: ['billed', 'revenue', 'collected', 'expense', 'op', 'admissions'], chart: { type: 'bar', x: 'month', series: [{ key: 'revenue', label: 'Revenue' }, { key: 'collected', label: 'Collected' }] } }; }],
  ['exe_mis', 'Management MIS', (q) => { const t = M.toDate(q.to), res = M.results(q), adv = M.advances(q), rec = M.receivables(q.to);
    const rows = [
      { metric: 'Revenue', period: M.revenue(q).net, mtd: t.mtd.revenue, fytd: t.fytd.revenue },
      { metric: 'Collections', period: M.collections(q).net, mtd: t.mtd.collection, fytd: t.fytd.collection },
      { metric: 'Expenses', period: M.expenses(q).total, mtd: t.mtd.expense, fytd: t.fytd.expense },
      { metric: 'Refunds', period: M.billing(q).refunds, mtd: t.mtd.refunds, fytd: t.fytd.refunds },
      { metric: 'Operating result (revenue − expenses)', period: res.operating.result, mtd: r2(t.mtd.revenue - t.mtd.expense), fytd: r2(t.fytd.revenue - t.fytd.expense) },
      { metric: 'Cash surplus (collections − payments out)', period: res.cash.surplus, mtd: null, fytd: null },
      { metric: 'Receivables outstanding (as of end date)', period: rec.total, mtd: null, fytd: t.fytd.receivables },
      { metric: 'Patient advances held', period: adv.closing, mtd: null, fytd: null },
    ];
    return { subtitle: `Period ${q.from} to ${q.to} · MTD from ${t.mtd.from} · FY from ${t.fytd.from}`, columns: [col('metric', 'Measure'), money('period', 'Selected period'), money('mtd', 'Month to date'), money('fytd', 'FY to date')], rows }; }],
  ['exe_departments', 'Department performance', (q) => { const rows = M.departmentSummary(q);
    return { kpis: [kpi('Gross', sum(rows, 'gross')), kpi('Net revenue', sum(rows, 'net')), kpi('Collection', sum(rows, 'collection')), kpi('Due', sum(rows, 'due'))],
      columns: [col('label', 'Department'), num('patients', 'Patients'), money('gross', 'Gross bill'), money('discount', 'Discount'), money('net', 'Net revenue'), money('collection', 'Collection'), money('due', 'Due'), money('refund', 'Refund'), money('cancelled', 'Cancelled')],
      rows, total: ['patients', 'gross', 'discount', 'net', 'collection', 'due', 'refund', 'cancelled'], chart: { type: 'hbar', x: 'label', series: [{ key: 'net', label: 'Net revenue' }] } }; }],
];

/* ------------------------------------------------------------- financial+ */

const FINANCIAL = [
  ['fin_revenue', 'Revenue report', EXECUTIVE[1][2]],
  ['fin_collection', 'Collection report', receipts(null)],
  ['fin_expense', 'Expense report', (q) => { const rows = all(`SELECT e.voucher_no, e.spent_on, e.head, a.name account, e.vendor, e.department, e.amount, e.mode, e.status, e.reference FROM expenses e LEFT JOIN accounts a ON a.id=e.account_id
      WHERE e.spent_on BETWEEN ? AND ? ORDER BY e.spent_on DESC`, q.from, q.to);
    return { kpis: [kpi('Recorded', sum(rows, 'amount')), kpi('Paid', sum(rows.filter((r) => r.status === 'paid'), 'amount')), kpi('Pending', sum(rows.filter((r) => r.status === 'pending'), 'amount'))],
      columns: [col('voucher_no', 'Voucher'), date('spent_on', 'Date'), col('head', 'Head'), col('account', 'Account'), col('vendor', 'Vendor'), col('department', 'Dept'), money('amount', 'Amount'), col('mode', 'Mode'), col('status', 'Status'), col('reference', 'Reference')], rows, total: ['amount'] }; }],
  ['fin_journal_register', 'Journal register', (q) => { const rows = all(`SELECT v.voucher_date d, v.voucher_no, v.voucher_type type, v.source, v.narration, v.total, v.status, u.name by_name FROM journal_vouchers v LEFT JOIN users u ON u.id=v.created_by
      WHERE v.voucher_date BETWEEN ? AND ? ORDER BY v.id`, q.from, q.to);
    return { kpis: [kpi('Vouchers', rows.length, 'number'), kpi('Value', sum(rows, 'total'))], columns: [date('d', 'Date'), col('voucher_no', 'Voucher'), col('type', 'Type'), col('source', 'Source'), col('narration', 'Narration'), money('total', 'Amount'), col('status', 'Status'), col('by_name', 'By')], rows, total: ['total'] }; }],
  ['fin_receivables', 'Receivable report (ageing)', EXECUTIVE[4][2]],
  ['fin_advances', 'Advance report', (q) => { const a = M.advances(q);
    const rows = all(`SELECT p.uhid, p.name patient, b.bill_no, b.bill_type, round(-b.balance,2) advance FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.balance < -0.005 AND b.status<>'cancelled' ORDER BY advance DESC`);
    return { kpis: [kpi('Opening', a.opening), kpi('Received', a.received), kpi('Adjusted', a.adjusted), kpi('Refunded', a.refunded), kpi('Closing', a.closing)],
      subtitle: 'An advance is a liability until it is used against a bill; it is never revenue.', columns: [col('uhid', 'UHID'), col('patient', 'Patient'), col('bill_no', 'Bill'), col('bill_type', 'Type'), money('advance', 'Advance held')], rows, total: ['advance'] }; }],
  ['fin_refunds', 'Refund report', refunds(null)],
  ['fin_discounts', 'Discount report', discounts],
];

/* ------------------------------------------------------------ operational */

const OPERATIONAL = [
  ['ops_op', 'OP report', visits("AND e.kind='OP'")],
  ['ops_ip', 'IP report', admissionsReport('admission')],
  ['ops_er', 'ER report', (q) => { const rows = all(`SELECT c.case_no, c.arrived_at, coalesce(p.name, c.unknown_name) patient, c.triage, c.complaint, c.status, c.disposition, u.name doctor FROM emergency_cases c LEFT JOIN patients p ON p.id=c.patient_id LEFT JOIN users u ON u.id=c.attending_id
      WHERE date(c.arrived_at) BETWEEN ? AND ? ORDER BY c.id DESC`, q.from, q.to);
    return { kpis: [kpi('Cases', rows.length, 'number'), kpi('Admitted', rows.filter((r) => r.status === 'admitted').length, 'number')], columns: [col('case_no', 'Case'), date('arrived_at', 'Arrived'), col('patient', 'Patient'), col('triage', 'Triage'), col('complaint', 'Complaint'), col('status', 'Status'), col('disposition', 'Disposition'), col('doctor', 'Doctor')], rows }; }],
  ['ops_admissions', 'Admission report', admissionsReport('admission')],
  ['ops_discharges', 'Discharge report', admissionsReport('discharge')],
  ['ops_occupancy', 'Bed occupancy', () => { const o = M.occupancy();
    return { kpis: [kpi('Hospital occupancy %', o.hospital.pct, 'number'), kpi('Occupied', o.hospital.occupied, 'number'), kpi('Available', o.hospital.available, 'number')],
      subtitle: 'Occupancy = occupied ÷ available beds; blocked beds are not available.', columns: [col('ward', 'Ward'), col('kind', 'Type'), num('beds', 'Beds'), num('blocked', 'Blocked'), num('available', 'Available'), num('occupied', 'Occupied'), num('pct', 'Occupancy %')], rows: o.by_ward, total: ['beds', 'blocked', 'available', 'occupied'] }; }],
  ['ops_los', 'Length of stay', (q) => { const a = M.alos(q);
    return { kpis: [kpi('Discharged', a.discharged, 'number'), kpi('Average stay (days)', a.alos, 'number')], subtitle: 'ALOS = inpatient days of discharged patients ÷ number discharged.',
      columns: [col('ward', 'Ward'), num('discharged', 'Discharged'), num('alos', 'Average days')], rows: a.by_ward }; }],
  ['ops_doctor_activity', 'Doctor activity', (q) => { const rows = all(`SELECT u.name doctor,
      (SELECT count(*) FROM encounters e WHERE e.doctor_id=u.id AND e.kind='OP' AND e.visit_date BETWEEN ? AND ?) op,
      (SELECT count(*) FROM consultations c JOIN encounters e ON e.id=c.encounter_id WHERE e.doctor_id=u.id AND e.visit_date BETWEEN ? AND ?) consultations,
      (SELECT count(*) FROM orders o WHERE o.ordered_by=u.id AND date(o.ordered_at) BETWEEN ? AND ?) orders,
      (SELECT count(*) FROM prescriptions r WHERE r.doctor_id=u.id AND date(r.created_at) BETWEEN ? AND ?) prescriptions,
      (SELECT count(*) FROM admissions a WHERE a.consultant_id=u.id AND a.status<>'requested' AND date(a.admitted_at) BETWEEN ? AND ?) admissions
      FROM users u WHERE u.role='doctor' AND u.active=1 ORDER BY u.name`, q.from, q.to, q.from, q.to, q.from, q.to, q.from, q.to, q.from, q.to);
    return { columns: [col('doctor', 'Doctor'), num('op', 'OP visits'), num('consultations', 'Consultations'), num('orders', 'Orders'), num('prescriptions', 'Prescriptions'), num('admissions', 'Admissions')], rows, total: ['op', 'consultations', 'orders', 'prescriptions', 'admissions'] }; }],
  ['ops_dept_patients', 'Department patient count', countBy('dp.name', 'Department')],
];

/* ------------------------------------------------------------- payers */

const PAYER = [
  ['pay_cash', 'Cash patients', payerPatients('self')], ['pay_free', 'Free patients', payerPatients('free')], ['pay_insurance', 'Insurance patients', payerPatients('insurance')],
  ['pay_aarogyasri', 'Aarogyasri patients', payerPatients('aarogyasri')], ['pay_corporate', 'Corporate patients', payerPatients('corporate')],
  ['pay_trust', 'Trust patients', payerPatients('trust')], ['pay_credit', 'Credit patients', payerPatients('credit')],
];

/* ------------------------------------------------------------- revenue */

const segRevenue = (seg) => (q) => {
  const rows = all(`SELECT v.voucher_date d, b.bill_no, b.bill_type, p.name patient, round(sum(CASE WHEN a.subtype='revenue' THEN l.credit-l.debit ELSE 0 END),2) gross,
      round(sum(CASE WHEN a.subtype='contra_revenue' THEN l.debit-l.credit ELSE 0 END),2) deductions
    FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id LEFT JOIN bills b ON v.source IN ('bill','settlement') AND b.id=(CASE WHEN v.source='bill' THEN v.source_id ELSE (SELECT bill_id FROM bill_settlements s WHERE s.id=v.source_id) END)
    LEFT JOIN patients p ON p.id=b.patient_id WHERE a.type='income' AND l.segment=? AND v.voucher_date BETWEEN ? AND ? GROUP BY v.voucher_date, b.id ORDER BY v.voucher_date`, seg, q.from, q.to)
    .map((r) => ({ ...r, net: r2(r.gross - r.deductions) }));
  return { kpis: [kpi('Gross', sum(rows, 'gross')), kpi('Deductions', sum(rows, 'deductions')), kpi('Net revenue', sum(rows, 'net'))],
    subtitle: 'Recognised revenue from the books (net of GST); deductions are discounts, free treatment and returns.',
    columns: [date('d', 'Date'), col('bill_no', 'Bill'), col('bill_type', 'Bill type'), col('patient', 'Patient'), money('gross', 'Gross'), money('deductions', 'Deductions'), money('net', 'Net')], rows, total: ['gross', 'deductions', 'net'] };
};
const REVENUE = [['rev_op', 'OP revenue', 'OP'], ['rev_ip', 'IP revenue', 'IP'], ['rev_lab', 'Lab revenue', 'LAB'], ['rev_imaging', 'Imaging revenue', 'IMAGING'], ['rev_pharmacy', 'Pharmacy revenue', 'PHARMACY'],
  ['rev_ot', 'OT revenue', 'OT'], ['rev_icu', 'ICU revenue', 'ICU'], ['rev_procedure', 'Procedure revenue', 'PROCEDURE'], ['rev_room', 'Room charges revenue', 'ROOM'], ['rev_nursing', 'Nursing revenue', 'NURSING']]
  .map(([id, title, seg]) => [id, title, segRevenue(seg)]);

/* ------------------------------------------------------- staff attendance */

/** Whose attendance a login may report on: HR, administrators and management everyone; an in-charge their team; others themselves. */
function staffIds(user) {
  if (!user || can(user, 'roster.write') || can(user, 'admin.view') || can(user, 'dash.owner')) return null;
  const team = can(user, 'staff.manage') ? (STAFF_TEAMS[user.role] || []) : [];
  return [user.id, ...(team.length ? all(`SELECT id FROM users WHERE role IN (${team.map(() => '?').join(',')})`, ...team).map((u) => u.id) : [])];
}
const inStaff = (ids, colName) => (ids ? `AND ${colName} IN (${ids.map(() => '?').join(',') || 'NULL'})` : '');
const DAY_LABEL = { present: 'Present', half: 'Half day', late: 'Late', absent: 'Absent', leave: 'Leave', od: 'Outside duty' };
const SHIFT_NAME = { morning: 'Morning', evening: 'Evening', night: 'Night', general: 'General', off: 'Weekly off', leave: 'Leave', od: 'Outside duty' };

/** Day-by-day register: rostered shift against what happened (punches or a hand mark). */
function attendanceRegister(q, user, filter = '') {
  const ids = staffIds(user);
  return all(`WITH days AS (
      SELECT user_id, duty_date FROM roster WHERE duty_date BETWEEN ? AND ? ${inStaff(ids, 'user_id')}
      UNION SELECT user_id, duty_date FROM attendance WHERE duty_date BETWEEN ? AND ? ${inStaff(ids, 'user_id')})
    SELECT d.duty_date, u.name staff, u.role, u.designation, coalesce(dp.name,'—') department, r.shift, r.unit,
           a.in_at, a.out_at, a.hours, a.status, a.note, mb.name marked_by
      FROM days d JOIN users u ON u.id=d.user_id LEFT JOIN departments dp ON dp.id=u.department_id
      LEFT JOIN roster r ON r.user_id=d.user_id AND r.duty_date=d.duty_date
      LEFT JOIN attendance a ON a.user_id=d.user_id AND a.duty_date=d.duty_date
      LEFT JOIN users mb ON mb.id=a.marked_by
     WHERE 1=1 ${filter} ORDER BY d.duty_date DESC, department, u.name`,
  q.from, q.to, ...(ids || []), q.from, q.to, ...(ids || []))
    .map((r) => Object.assign(r, {
      shift: r.shift ? SHIFT_NAME[r.shift] || r.shift : 'Not rostered',
      status: r.status ? DAY_LABEL[r.status] || r.status
        : (r.shift && !['off', 'leave'].includes(r.shift) && r.duty_date < today() ? 'Not recorded' : (r.shift === 'leave' ? 'Leave (rostered)' : '—')),
    }));
}

/** Per person: rostered shifts and how each one went. */
function attendanceByStaff(q, user) {
  const ids = staffIds(user);
  const rows = all(`SELECT u.id, u.name staff, u.role, u.designation, coalesce(dp.name,'—') department,
      (SELECT count(*) FROM roster r WHERE r.user_id=u.id AND r.duty_date BETWEEN ? AND ? AND r.shift NOT IN ('off','leave')) rostered,
      (SELECT count(*) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ? AND a.status='present') present,
      (SELECT count(*) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ? AND a.status='late') late,
      (SELECT count(*) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ? AND a.status='half') half,
      (SELECT count(*) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ? AND a.status='od') od,
      (SELECT count(*) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ? AND a.status='absent') absent,
      (SELECT count(*) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ? AND a.status='leave')
        + (SELECT count(*) FROM roster r WHERE r.user_id=u.id AND r.duty_date BETWEEN ? AND ? AND r.shift='leave'
             AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.user_id=u.id AND a.duty_date=r.duty_date)) leave,
      round(coalesce((SELECT sum(hours) FROM attendance a WHERE a.user_id=u.id AND a.duty_date BETWEEN ? AND ?),0),1) hours
    FROM users u LEFT JOIN departments dp ON dp.id=u.department_id WHERE u.active=1 ${inStaff(ids, 'u.id')} ORDER BY department, u.name`,
  ...Array(9).fill([q.from, q.to]).flat(), ...(ids || []));
  for (const r of rows) {
    const worked = r.present + r.late + r.od + r.half * 0.5;
    r.attendance_pct = r.rostered ? r2(Math.min(100, (worked / r.rostered) * 100)) : null;
    delete r.id;
  }
  return rows;
}

const ATT_COLS = [col('staff', 'Staff'), col('designation', 'Designation'), col('department', 'Department'), num('rostered', 'Rostered shifts'),
  num('present', 'Present'), num('late', 'Late'), num('half', 'Half days'), num('od', 'Outside duty'), num('absent', 'Absent'),
  num('leave', 'Leave'), num('hours', 'Hours'), num('attendance_pct', 'Attendance %')];
const REG_COLS = [date('duty_date', 'Date'), col('staff', 'Staff'), col('department', 'Department'), col('shift', 'Shift'), col('unit', 'Unit'),
  col('in_at', 'In'), col('out_at', 'Out'), num('hours', 'Hours'), col('status', 'Status'), col('note', 'Remark'), col('marked_by', 'Marked by')];
const attKpis = (rows) => {
  const t = (k) => rows.reduce((s, r) => s + (+r[k] || 0), 0);
  const worked = t('present') + t('late') + t('od') + t('half') * 0.5;
  return [kpi('Staff', rows.length, 'number'), kpi('Rostered shifts', t('rostered'), 'number'), kpi('Present (incl. late, OD)', t('present') + t('late') + t('od'), 'number'),
    kpi('Absent', t('absent'), 'number'), kpi('Leave', t('leave'), 'number'), kpi('Attendance rate', t('rostered') ? r2(Math.min(100, (worked / t('rostered')) * 100)) : null, 'pct')];
};
const ATTENDANCE = [
  ['att_summary', 'Attendance summary by staff — rostered, present, late, absent, leave', (q, user) => {
    const rows = attendanceByStaff(q, user);
    return { kpis: attKpis(rows), columns: ATT_COLS, rows, total: ['rostered', 'present', 'late', 'half', 'od', 'absent', 'leave', 'hours'] };
  }],
  ['att_register', 'Daily attendance register — shift, punch in / out, status, remark', (q, user) => {
    const rows = attendanceRegister(q, user);
    return { kpis: [kpi('Entries', rows.length, 'number'), kpi('Hours', sum(rows, 'hours'), 'number')], columns: REG_COLS, rows, total: ['hours'] };
  }],
  ['att_department', 'Department attendance — staff, present, absent, leave, rate', (q, user) => {
    const by = {};
    for (const r of attendanceByStaff(q, user)) {
      const d = (by[r.department] ??= { department: r.department, staff: 0, rostered: 0, present: 0, late: 0, half: 0, od: 0, absent: 0, leave: 0, hours: 0 });
      d.staff++; for (const k of ['rostered', 'present', 'late', 'half', 'od', 'absent', 'leave', 'hours']) d[k] = r2(d[k] + (+r[k] || 0));
    }
    const rows = Object.values(by).map((d) => Object.assign(d, { attendance_pct: d.rostered ? r2(Math.min(100, ((d.present + d.late + d.od + d.half * 0.5) / d.rostered) * 100)) : null }));
    return { kpis: attKpis(rows.map((d) => ({ ...d }))).slice(1), chart: { type: 'bar', x: 'department', series: [{ key: 'attendance_pct', label: 'Attendance %' }] },
      columns: [col('department', 'Department'), num('staff', 'Staff'), ...ATT_COLS.slice(3)], rows, total: ['staff', 'rostered', 'present', 'late', 'half', 'od', 'absent', 'leave', 'hours'] };
  }],
  ['att_exceptions', 'Absent, late, half day, leave and outside duty — with remarks', (q, user) => {
    const rows = attendanceRegister(q, user, "AND a.status IN ('absent','late','half','leave','od')");
    return { kpis: [kpi('Entries', rows.length, 'number')], columns: REG_COLS, rows };
  }],
];

/* ------------------------------------------------------- package utilisation */

const PACKAGE_REPORTS = [
  ['pkg_utilisation', 'Package utilisation — price, charges covered, extras, margin', (q) => {
    const rows = all(`SELECT pa.*, p.uhid, p.name patient, k.name package, a.ip_no, date(pa.assigned_at) d FROM package_assignments pa
        JOIN patients p ON p.id=pa.patient_id JOIN packages k ON k.id=pa.package_id LEFT JOIN admissions a ON a.id=pa.admission_id
       WHERE pa.status<>'cancelled' AND date(pa.assigned_at) BETWEEN ? AND ? ORDER BY pa.id DESC`, q.from, q.to)
      .map((r) => { const u = packageUsageFor(r); return { d: r.d, patient: r.patient, uhid: r.uhid, package: r.package, stay: r.ip_no || 'OP / day care', status: r.status,
        price: r.price, covered: u.covered, excess: u.excess, excluded: u.excluded, adjustment: u.adjustment_posted, margin: u.margin }; });
    return { kpis: [kpi('Packages', rows.length, 'number'), kpi('Package value', sum(rows, 'price')), kpi('Charges covered', sum(rows, 'covered')), kpi('Extras billed', sum(rows, 'excess')), kpi('Margin', sum(rows, 'margin'))],
      columns: [date('d', 'Date'), col('patient', 'Patient'), col('uhid', 'UHID'), col('package', 'Package'), col('stay', 'Stay'), col('status', 'Status'), money('price', 'Price'), money('covered', 'Charges covered'),
        money('excess', 'Extras'), money('excluded', 'Exclusions'), money('adjustment', 'Adjustment posted'), money('margin', 'Margin')],
      rows, total: ['price', 'covered', 'excess', 'excluded', 'adjustment', 'margin'] };
  }],
];
let packageUsageFor = () => ({ covered: 0, excess: 0, excluded: 0, adjustment_posted: 0, margin: 0 });
export function usePackageEngine(fn) { packageUsageFor = fn; }

/* ------------------------------------------------------------- export */

const mk = (group, perm, filters) => ([id, title, run]) => ({ id, group, title, perm, filters, run });
export const EXTRA_REPORTS = [
 {id:'pharmacy_stock_losses',group:'Pharmacy',title:'All stock losses — expiry, damage and disposal',perm:P,filters:['range'],run:q=>{
   const rows=all(`SELECT sm.id,sm.created_at,sm.location,m.name,b.batch_no,b.expiry,-sm.qty removed_qty,sm.move_type,sm.reason,u.name removed_by,
     coalesce((SELECT sum(jl.debit-jl.credit) FROM journal_vouchers j JOIN journal_lines jl ON jl.voucher_id=j.id JOIN accounts a ON a.id=jl.account_id
       WHERE j.source='stock' AND j.source_id=sm.id AND a.system_key='stock_writeoff'),0) loss_value
     FROM stock_moves sm JOIN medicine_batches b ON b.id=sm.batch_id JOIN medicines m ON m.id=sm.medicine_id LEFT JOIN users u ON u.id=sm.created_by
     WHERE sm.qty<0 AND sm.move_type IN ('adjust','expiry','damage','disposal','loss') AND date(sm.created_at) BETWEEN ? AND ? ORDER BY sm.id DESC`,q.from,q.to);
   return {kpis:[kpi('Recorded stock loss',sum(rows,'loss_value')),kpi('Removals',rows.length,'number')],
     columns:[col('created_at','Removed at'),col('location','Store'),col('name','Item'),col('batch_no','Batch'),date('expiry','Expiry'),num('removed_qty','Qty'),money('loss_value','Posted loss'),col('move_type','Type'),col('reason','Reason'),col('removed_by','Staff')],rows,total:['removed_qty','loss_value']};
 }},
  ...PHARMACY.map(mk('Pharmacy', P, ['range'])),
  ...RECEPTION.map(mk('Reception', R, ['range'])),
  ...EXECUTIVE.map(mk('Executive', V, ['range'])),
  ...FINANCIAL.map(mk('Financial', F, ['range'])),
  ...OPERATIONAL.map(mk('Operational', V, ['range'])),
  ...PAYER.map(mk('Scheme / payer', V, ['range'])),
  ...REVENUE.map(mk('Revenue', V, ['range'])),
  ...ATTENDANCE.map(mk('Staff & HR', 'reports.attendance', ['range'])),
  ...PACKAGE_REPORTS.map(mk('Revenue', V, ['range'])),
];
export { get };

EXTRA_REPORTS.push(
 {id:'emergency_store_batches',group:'Pharmacy',title:'ER / ICU / OT emergency stock — batches & expiry',perm:P,filters:[],run:()=>({columns:[col('location','Store'),col('name','Medicine'),col('batch_no','Batch'),date('expiry','Expiry'),num('qty','Available'),money('purchase_rate','Unit cost'),money('stock_value','Stock value'),col('expiry_status','Expiry status')],rows:all(`SELECT b.location,m.name,b.batch_no,b.expiry,b.qty,b.purchase_rate,round(b.qty*b.purchase_rate,2) stock_value,CASE WHEN b.expiry<date('now','localtime') THEN 'Expired' WHEN b.expiry<=date('now','localtime','+90 days') THEN 'Near expiry' ELSE 'Valid' END expiry_status FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.location IN ('ER','ICU','OT') ORDER BY b.location,b.expiry,m.name`),total:['stock_value']})},
 {id:'emergency_store_transfers',group:'Pharmacy',title:'ER / ICU / OT received batches — transfer history',perm:P,filters:['range'],run:q=>({columns:[col('transfer_no','Transfer'),col('source','From'),col('destination','To'),col('status','Status'),col('name','Medicine'),col('batch_no','Batch'),date('expiry','Expiry'),num('qty','Issued'),num('qty_received','Received'),col('received_at','Received at')],rows:all(`SELECT t.transfer_no,t.source,t.destination,t.status,m.name,b.batch_no,b.expiry,i.qty,i.qty_received,t.received_at FROM stock_transfers t JOIN stock_transfer_lines l ON l.transfer_id=t.id JOIN stock_transfer_issues i ON i.line_id=l.id JOIN medicine_batches b ON b.id=i.source_batch_id JOIN medicines m ON m.id=b.medicine_id WHERE t.destination IN ('ER','ICU','OT') AND date(t.requested_at) BETWEEN ? AND ? ORDER BY t.id DESC`,q.from,q.to)})},
 {id:'emergency_store_usage',group:'Pharmacy',title:'ER / ICU / OT stock usage & cost',perm:P,filters:['range'],run:q=>({columns:[col('created_at','Time'),col('location','Store'),col('name','Medicine'),col('batch_no','Batch'),date('expiry','Expiry'),col('move_type','Movement'),num('qty','Quantity change'),money('usage_cost','Usage cost'),col('ref_type','Source'),num('ref_id','Record'),col('reason','Reason')],rows:all(`SELECT sm.*,m.name,b.batch_no,b.expiry,CASE WHEN sm.qty<0 AND sm.move_type NOT LIKE 'transfer%' AND sm.move_type<>'purchase_return' THEN round(-sm.qty*b.purchase_rate,2) ELSE 0 END usage_cost FROM stock_moves sm JOIN medicines m ON m.id=sm.medicine_id LEFT JOIN medicine_batches b ON b.id=sm.batch_id WHERE sm.location IN ('ER','ICU','OT') AND date(sm.created_at) BETWEEN ? AND ? ORDER BY sm.id DESC`,q.from,q.to),total:['usage_cost']})}
);

EXTRA_REPORTS.push(
 {id:'ward_indent_audit',group:'Pharmacy',title:'Ward indent audit — requests, issues & pending',perm:P,filters:['range'],run:q=>({columns:[col('indent_no','Indent'),col('requested_at','Requested at'),col('location','Store'),col('ip_no','IP number'),col('patient_name','Patient'),col('name','Medicine'),num('qty','Requested'),num('dispensed_qty','Issued'),num('pending_qty','Pending'),col('status','Status'),col('requested_by_name','Requested by'),col('dispensed_by_name','Dispensed by'),col('dispensed_at','Last issue'),col('notes','Notes')],rows:all(`SELECT i.indent_no,i.requested_at,i.location,i.status,i.notes,i.dispensed_at,a.ip_no,p.name patient_name,m.name,l.qty,l.dispensed_qty,max(0,l.qty-l.dispensed_qty) pending_qty,u.name requested_by_name,d.name dispensed_by_name FROM ward_indents i JOIN ward_indent_lines l ON l.indent_id=i.id JOIN medicines m ON m.id=l.medicine_id JOIN patients p ON p.id=i.patient_id JOIN admissions a ON a.id=i.admission_id LEFT JOIN users u ON u.id=i.requested_by LEFT JOIN users d ON d.id=i.dispensed_by WHERE date(i.requested_at) BETWEEN ? AND ? ORDER BY i.id DESC,l.id`,q.from,q.to)})},
 {id:'pharmacy_expiry_removals',group:'Pharmacy',title:'Expiry removal audit — batches & write-off cost',perm:P,filters:['range'],run:q=>({columns:[col('created_at','Removed at'),col('location','Store'),col('name','Medicine'),col('batch_no','Batch'),date('expiry','Expiry'),num('removed_qty','Removed quantity'),money('purchase_rate','Unit cost'),money('writeoff_cost','Write-off cost'),num('balance_after','Balance after'),col('removed_by','Removed by'),col('reason','Reason'),col('classification','Classification'),num('id','Movement ID')],rows:all(`SELECT sm.id,sm.created_at,sm.location,m.name,b.batch_no,b.expiry,-sm.qty removed_qty,b.purchase_rate,round(-sm.qty*b.purchase_rate,2) writeoff_cost,sm.balance_after,u.name removed_by,sm.reason,CASE WHEN sm.move_type='expiry' THEN 'Expiry removal' ELSE 'Expired batch adjustment — review reason' END classification FROM stock_moves sm JOIN medicine_batches b ON b.id=sm.batch_id JOIN medicines m ON m.id=sm.medicine_id LEFT JOIN users u ON u.id=sm.created_by WHERE sm.qty<0 AND (sm.move_type='expiry' OR (sm.move_type='adjust' AND b.expiry<date(sm.created_at))) AND date(sm.created_at) BETWEEN ? AND ? ORDER BY sm.id DESC`,q.from,q.to),total:['removed_qty','writeoff_cost']})}
);

// Visiting doctors: attributed work, what it collected, share earned, accrued, paid and still payable
let visitingLedger = null;
export function useVisitingLedger(fn) { visitingLedger = fn; }
EXTRA_REPORTS.push(
 {id:'visiting_doctor_share',group:'Revenue',title:'Visiting doctors — share earned, accrued and paid',perm:'finance.view',filters:[],run:()=>{
   const rows=all('SELECT id FROM visiting_doctors ORDER BY name').map(d=>{const l=visitingLedger(d.id);return {name:l.doctor.name,speciality:l.doctor.speciality,rule:l.doctor.share_type==='fixed'?'₹'+l.doctor.share_value+' per case':l.doctor.share_value+'%',
     cases:l.lines.length,billed:l.lines.reduce((s,x)=>s+x.base,0),earned:l.earned,accrued:l.accrued,paid:l.paid,payable:l.payable,pending:l.not_yet_accrued};});
   return {kpis:[kpi('Doctors',rows.length,'number'),kpi('Share earned',sum(rows,'earned')),kpi('Paid',sum(rows,'paid')),kpi('Payable',sum(rows,'payable'))],
     columns:[col('name','Doctor'),col('speciality','Speciality'),col('rule','Share'),num('cases','Lines'),money('billed','Billed'),money('earned','Earned on collections'),money('accrued','Accrued'),money('paid','Paid (gross)'),money('payable','Payable'),money('pending','Not yet accrued')],
     rows,total:['billed','earned','accrued','paid','payable','pending']};
 }},
);

// Consumables used in procedures: what was issued where, for whom, its cost and what was charged
EXTRA_REPORTS.push({id:'doctor_collection_reconciliation',group:'Finance',title:'Doctor-wise billing, receipts and refunds reconciliation',perm:F,filters:['range'],run:q=>{
 const rows=all(`SELECT coalesce(u.name,'Unassigned') doctor,coalesce(d.name,'Unassigned') department,count(*) bills,round(sum(b.total),2) billed,
 round(sum((SELECT coalesce(sum(pm.amount),0) FROM payments pm WHERE pm.bill_id=b.id AND pm.cancelled=0 AND pm.amount>0)),2) patient_receipts,
 round(sum((SELECT coalesce(sum(r.amount),0) FROM refunds r WHERE r.bill_id=b.id)),2) refunded,
 round(sum((SELECT coalesce(sum(s.settled_amount),0) FROM bill_settlements s WHERE s.bill_id=b.id AND s.status<>'cancelled' AND s.mode NOT IN ('free','due'))),2) payer_received,
 round(sum(b.balance),2) patient_balance
 FROM bills b LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN users u ON u.id=coalesce(b.doctor_id,e.doctor_id) LEFT JOIN departments d ON d.id=u.department_id WHERE b.bill_date BETWEEN ? AND ? AND b.status<>'cancelled' GROUP BY u.id ORDER BY billed DESC`,q.from,q.to).map(r=>({...r,net_collected:r2(r.patient_receipts-r.refunded+r.payer_received)}));
 return {columns:[col('doctor','Doctor'),col('department','Department'),num('bills','Bills'),money('billed','Billed'),money('patient_receipts','Patient receipts'),money('refunded','Refunded'),money('payer_received','Payer received'),money('net_collected','Net collected'),money('patient_balance','Unallocated / patient balance')],rows,total:['billed','patient_receipts','refunded','payer_received','net_collected','patient_balance']};
}});

// Consumables used in procedures: what was issued where, for whom, its cost and what was charged
EXTRA_REPORTS.push({id:'ward_replacement_audit',group:'Pharmacy',title:'Ward emergency stock — consumption and replacement audit',perm:P,filters:['range'],run:q=>{
 const rows=all(`SELECT r.replacement_no,r.recorded_at,r.location,r.status,p.name patient,p.uhid,m.name medicine,b.batch_no used_batch,b.expiry used_expiry,u.qty used,
 (SELECT coalesce(sum(s.qty),0) FROM ward_replacement_supply s JOIN bill_items i ON i.id=s.bill_item_id JOIN medicine_batches bt ON bt.id=i.batch_id WHERE s.replacement_id=r.id AND bt.medicine_id=b.medicine_id) supplied,
 (SELECT coalesce(sum(s.received_qty),0) FROM ward_replacement_supply s JOIN bill_items i ON i.id=s.bill_item_id JOIN medicine_batches bt ON bt.id=i.batch_id WHERE s.replacement_id=r.id AND bt.medicine_id=b.medicine_id) received,
 (SELECT group_concat(bl.bill_no||' / '||bt.batch_no||' / exp '||bt.expiry||' / supplied '||s.qty||' / received '||s.received_qty,'; ') FROM ward_replacement_supply s JOIN bill_items i ON i.id=s.bill_item_id JOIN bills bl ON bl.id=i.bill_id JOIN medicine_batches bt ON bt.id=i.batch_id WHERE s.replacement_id=r.id AND bt.medicine_id=b.medicine_id) replacement_details
 FROM ward_replacements r JOIN patients p ON p.id=r.patient_id JOIN ward_replacement_usage u ON u.replacement_id=r.id JOIN medicine_batches b ON b.id=u.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE date(r.recorded_at) BETWEEN ? AND ? ORDER BY r.id DESC,u.id`,q.from,q.to);
 return {columns:[col('replacement_no','Slip'),date('recorded_at','Recorded'),col('location','Ward'),col('patient','Patient'),col('uhid','UHID'),col('medicine','Medicine'),col('used_batch','Consumed batch'),date('used_expiry','Consumed expiry'),num('used','Used from this batch'),num('supplied','Supplied total for medicine'),num('received','Received total for medicine'),col('replacement_details','Replacement bills, batches and expiry'),col('status','Status')],rows};
}});

// Consumables used in procedures: what was issued where, for whom, its cost and what was charged
EXTRA_REPORTS.push(
 {id:'procedure_consumables',group:'Pharmacy',title:'Procedure consumables — issued, cost and charged',perm:P,filters:['range'],run:q=>{
   const rows=all(`SELECT c.consumption_no,c.recorded_at,c.location,c.source_type,c.status,c.total_cost,c.total_charged,c.included,p.name patient,p.uhid,u.name recorded_by,
       (SELECT group_concat(substr(bi.description,1,instr(bi.description||' (','(')-1)||' × '||bi.qty,', ') FROM bill_items bi WHERE bi.consumption_id=c.id AND bi.waiver_of IS NULL AND bi.qty>0) items
     FROM procedure_consumptions c JOIN patients p ON p.id=c.patient_id LEFT JOIN users u ON u.id=c.recorded_by
     WHERE date(c.recorded_at) BETWEEN ? AND ? ORDER BY c.id DESC`,q.from,q.to).map(r=>({...r,charged:r.status==='reversed'?0:r.total_charged,cost:r.status==='reversed'?0:r.total_cost,basis:r.included?'Included in procedure':'Charged'}));
   return {kpis:[kpi('Records',rows.length,'number'),kpi('Cost of items',sum(rows,'cost')),kpi('Charged to patients',sum(rows,'charged'))],
     columns:[col('recorded_at','Recorded'),col('consumption_no','Record'),col('patient','Patient'),col('uhid','UHID'),col('source_type','Used in'),col('location','Store'),col('items','Items'),money('cost','Cost'),money('charged','Charged'),col('basis','Basis'),col('status','Status'),col('recorded_by','By')],
     rows,total:['cost','charged']};
 }},
);
