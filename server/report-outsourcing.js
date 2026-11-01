/**
 * Outsourced investigation reports: what the patient was charged against what the centre charges
 * us, turnaround against the promised time, and what is owed to each centre.
 */
import { all } from './db.js';

const r2 = (v) => Math.round((+v || 0) * 100) / 100;
const col = (key, label, type = 'text') => ({ key, label, type });
const money = (k, l) => col(k, l, 'money');
const num = (k, l) => col(k, l, 'number');
const date = (k, l) => col(k, l, 'date');
const kpi = (label, value, type = 'money') => ({ label, value, type });
const sum = (rows, k) => r2(rows.reduce((s, r) => s + (+r[k] || 0), 0));
const F = 'finance.view', V = 'reports.view';
const hours = (a, b) => (a && b ? Math.round((new Date(String(b).replace(' ', 'T')) - new Date(String(a).replace(' ', 'T'))) / 36e5) : null);

export const OUTSOURCING_REPORTS = [
  { id: 'outsourced_margin', group: 'Finance', title: 'Outsourced tests — patient charge, centre cost and contribution', perm: F, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT o.order_no, date(o.ordered_at) d, o.label, o.category, o.status, p.name patient, p.uhid, pr.name provider, pr.billing,
          (SELECT coalesce(sum(bi.amount),0) FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id AND b.status<>'cancelled') charged,
          (SELECT coalesce(sum(-w.amount),0) FROM bill_items w JOIN bill_items bi ON bi.id=w.waiver_of WHERE bi.order_id=o.id) waived,
          (SELECT ii.cost FROM outsource_invoice_items ii WHERE ii.order_id=o.id) invoiced_cost,
          (SELECT r.cost_price FROM outsource_rates r WHERE r.provider_id=o.provider_id AND r.service_id=o.service_id) rate_cost,
          (SELECT i.invoice_no FROM outsource_invoice_items ii JOIN outsource_invoices i ON i.id=ii.invoice_id WHERE ii.order_id=o.id) invoice_no
        FROM orders o JOIN patients p ON p.id=o.patient_id JOIN diagnostic_providers pr ON pr.id=o.provider_id
        WHERE date(o.ordered_at) BETWEEN ? AND ? ORDER BY o.id`, q.from, q.to).map((r) => {
        const charged = r2(r.charged - r.waived);
        const cost = r.billing === 'outside' || r.status === 'cancelled' && r.invoiced_cost == null ? 0 : r2(r.invoiced_cost ?? r.rate_cost ?? 0);
        return { ...r, charged, cost, cost_basis: r.invoiced_cost != null ? 'Centre bill' : r.billing === 'outside' ? 'Patient paid centre' : r.rate_cost != null ? 'Rate (not yet billed)' : 'No rate',
          contribution: r2(charged - cost), margin_pct: charged ? Math.round(((charged - cost) / charged) * 1000) / 10 : 0 };
      });
      return {
        subtitle: 'Charged is what the hospital billed the patient (after waivers). Cost is the centre\'s bill line, or the agreed rate until the bill arrives. A patient-pays-the-centre referral has neither.',
        kpis: [kpi('Orders', rows.length, 'number'), kpi('Charged to patients', sum(rows, 'charged')), kpi('Centre cost', sum(rows, 'cost')), kpi('Contribution', sum(rows, 'contribution')),
          kpi('Cancelled', rows.filter((r) => r.status === 'cancelled').length, 'number')],
        columns: [col('order_no', 'Order'), date('d', 'Date'), col('patient', 'Patient'), col('uhid', 'UHID'), col('label', 'Test'), col('provider', 'Centre'), col('status', 'Status'),
          money('charged', 'Charged'), money('cost', 'Cost'), col('cost_basis', 'Cost from'), col('invoice_no', 'Centre bill'), money('contribution', 'Contribution'), num('margin_pct', 'Margin %')],
        rows, total: ['charged', 'cost', 'contribution'],
        chart: { type: 'hbar', x: 'provider', series: [{ key: 'contribution', label: 'Contribution' }], top: 10 },
      };
    } },

  { id: 'outsourced_tat', group: 'Operational', title: 'Outsourced tests — dispatch, turnaround and delays', perm: V, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT d.dispatch_no, d.dispatched_at, d.courier_name, d.acknowledged_at, pr.name provider, o.order_no, o.label, p.name patient, p.uhid,
          i.external_ref, i.expected_at, i.status, i.study_no,
          (SELECT min(x.received_at) FROM external_reports x WHERE x.order_id=o.id) report_received,
          (SELECT max(x.accepted_at) FROM external_reports x WHERE x.order_id=o.id AND x.status IN ('accepted','superseded')) accepted_at,
          (SELECT count(*) FROM external_reports x WHERE x.order_id=o.id) versions
        FROM outsource_items i JOIN outsource_dispatches d ON d.id=i.dispatch_id JOIN orders o ON o.id=i.order_id JOIN patients p ON p.id=o.patient_id
        JOIN diagnostic_providers pr ON pr.id=d.provider_id WHERE date(d.dispatched_at) BETWEEN ? AND ? ORDER BY d.id DESC, i.id`, q.from, q.to).map((r) => {
        const late = r.report_received ? r.report_received > r.expected_at : new Date() > new Date(String(r.expected_at).replace(' ', 'T'));
        return { ...r, tat_hours: hours(r.dispatched_at, r.report_received), late: late ? 'Late' : 'On time', open: r.report_received ? '' : 'Awaiting report' };
      });
      const done = rows.filter((r) => r.tat_hours !== null);
      return {
        kpis: [kpi('Sent', rows.length, 'number'), kpi('Reports back', done.length, 'number'), kpi('Late', rows.filter((r) => r.late === 'Late').length, 'number'),
          kpi('Average TAT (hours)', done.length ? Math.round(done.reduce((s, r) => s + r.tat_hours, 0) / done.length) : 0, 'number')],
        columns: [col('dispatch_no', 'Dispatch'), col('dispatched_at', 'Sent at'), col('provider', 'Centre'), col('courier_name', 'Courier'), col('acknowledged_at', 'Centre signed'),
          col('order_no', 'Order'), col('patient', 'Patient'), col('label', 'Test'), col('external_ref', 'Centre ref'), col('expected_at', 'Expected'), col('report_received', 'Report received'),
          col('accepted_at', 'Accepted'), num('tat_hours', 'TAT (h)'), col('late', 'On time?'), num('versions', 'Versions'), col('status', 'Item status')],
        rows,
      };
    } },

  { id: 'outsourced_payables', group: 'Finance', title: 'Outside lab & imaging centres — bills, payments and outstanding', perm: F, filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT 'Bill' kind, i.invoice_date d, i.ref_no, i.invoice_no reference, p.name provider, i.total debit, 0 credit, i.status
          FROM outsource_invoices i JOIN diagnostic_providers p ON p.id=i.provider_id WHERE i.invoice_date BETWEEN ? AND ? AND i.status<>'cancelled'
        UNION ALL SELECT 'Payment', x.paid_on, x.payment_no, coalesce(x.reference, x.mode), p.name, 0, x.amount, x.mode
          FROM outsource_payments x JOIN diagnostic_providers p ON p.id=x.provider_id WHERE x.paid_on BETWEEN ? AND ?
        ORDER BY 2, 3`, q.from, q.to, q.from, q.to);
      const owed = all(`SELECT p.name provider, round(coalesce(sum(i.total - i.paid),0),2) outstanding FROM diagnostic_providers p
        LEFT JOIN outsource_invoices i ON i.provider_id=p.id AND i.status<>'cancelled' WHERE p.billing='hospital' GROUP BY p.id`);
      return {
        subtitle: `Outstanding today: ${owed.filter((o) => o.outstanding > 0).map((o) => `${o.provider} ₹${o.outstanding}`).join(' · ') || 'nothing'}`,
        kpis: [kpi('Billed by centres', sum(rows, 'debit')), kpi('Paid', sum(rows, 'credit')), kpi('Outstanding (all time)', sum(owed, 'outstanding'))],
        columns: [date('d', 'Date'), col('kind', 'Entry'), col('ref_no', 'Our ref'), col('reference', 'Centre bill / payment ref'), col('provider', 'Centre'), money('debit', 'Billed'), money('credit', 'Paid'), col('status', 'Status')],
        rows, total: ['debit', 'credit'],
      };
    } },
];
