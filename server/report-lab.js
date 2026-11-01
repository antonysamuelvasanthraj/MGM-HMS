/** Laboratory reports: consumables used per test and their cost, and the critical-result call log. */
import { all } from './db.js';

const r2 = (v) => Math.round((+v || 0) * 100) / 100;
const col = (key, label, type = 'text') => ({ key, label, type });
const money = (k, l) => col(k, l, 'money');
const num = (k, l) => col(k, l, 'number');
const kpi = (label, value, type = 'money') => ({ label, value, type });
const sum = (rows, k) => r2(rows.reduce((s, r) => s + (+r[k] || 0), 0));

export const LAB_REPORTS = [
  { id: 'lab_consumable_usage', group: 'Operational', title: 'Lab consumables — used per test, cost, recollections and shortfalls', perm: 'lab.view', filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT s.name test, m.name item, lc.stage,
          count(DISTINCT lc.order_id) orders, round(sum(CASE WHEN lc.status='used' THEN lc.qty ELSE 0 END),2) used,
          round(sum(CASE WHEN lc.status='short' THEN lc.qty ELSE 0 END),2) short, round(sum(lc.cost),2) cost,
          count(DISTINCT CASE WHEN lc.recollection=1 THEN lc.order_id END) recollections
        FROM lab_consumption lc JOIN medicines m ON m.id=lc.medicine_id LEFT JOIN services s ON s.id=lc.service_id
        WHERE date(lc.created_at) BETWEEN ? AND ? GROUP BY lc.service_id, lc.medicine_id, lc.stage ORDER BY s.name, lc.stage, m.name`, q.from, q.to)
        .map((r) => ({ ...r, stage: r.stage === 'collection' ? 'Collection' : 'Processing', per_order: r.orders ? r2(r.cost / r.orders) : 0 }));
      return {
        subtitle: 'Cost at batch purchase rate. Collection items are used for outside-lab tests too; reagents only for tests done here.',
        kpis: [kpi('Consumable cost', sum(rows, 'cost')), kpi('Items short at use', rows.filter((r) => r.short > 0).length, 'number'), kpi('Recollections', sum(rows, 'recollections'), 'number')],
        columns: [col('test', 'Test'), col('item', 'Item'), col('stage', 'When'), num('orders', 'Orders'), num('used', 'Qty used'), num('short', 'Qty short'), num('recollections', 'Recollections'), money('cost', 'Cost'), money('per_order', 'Cost per order')],
        rows, total: ['used', 'short', 'cost'],
        chart: { type: 'hbar', x: 'test', series: [{ key: 'cost', label: 'Cost' }], top: 12 },
      };
    } },
  { id: 'critical_results_log', group: 'Operational', title: 'Critical results — who was told, how fast, and acknowledgement', perm: 'lab.view', filters: ['range'],
    run: (q) => {
      const rows = all(`SELECT c.called_at, o.order_no, o.label, p.name patient, p.uhid, c.result_summary, c.informed_name, c.mode, c.minutes_from_result,
          cb.name called_by, c.acknowledged_at, ab.name acknowledged_by, c.action_taken
        FROM critical_calls c JOIN orders o ON o.id=c.order_id JOIN patients p ON p.id=o.patient_id LEFT JOIN users cb ON cb.id=c.called_by LEFT JOIN users ab ON ab.id=c.acknowledged_by
        WHERE date(c.called_at) BETWEEN ? AND ? ORDER BY c.id DESC`, q.from, q.to).map((r) => ({ ...r, mode: r.mode.replace('_', ' '), read_back: 'Yes' }));
      const uncalled = all(`SELECT count(DISTINCT o.id) n FROM orders o JOIN lab_results r ON r.order_id=o.id AND r.flag='critical'
        WHERE date(r.entered_at) BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM critical_calls c WHERE c.order_id=o.id)`, q.from, q.to)[0]?.n || 0;
      const timed = rows.filter((r) => r.minutes_from_result != null);
      return {
        kpis: [kpi('Calls', rows.length, 'number'), kpi('Critical results never called', uncalled, 'number'),
          kpi('Median minutes to call', timed.length ? timed.map((r) => r.minutes_from_result).sort((a, b) => a - b)[Math.floor(timed.length / 2)] : 0, 'number'),
          kpi('Not yet acknowledged', rows.filter((r) => !r.acknowledged_at).length, 'number')],
        columns: [col('called_at', 'Called at'), col('order_no', 'Order'), col('patient', 'Patient'), col('uhid', 'UHID'), col('label', 'Test'), col('result_summary', 'Critical value'),
          col('called_by', 'Called by'), col('informed_name', 'Told'), col('mode', 'How'), col('read_back', 'Read back'), num('minutes_from_result', 'Minutes'),
          col('acknowledged_by', 'Acknowledged by'), col('acknowledged_at', 'Acknowledged at'), col('action_taken', 'Action taken')],
        rows,
      };
    } },
];
