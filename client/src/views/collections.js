/** All collections — the cashier's day across every counter and payment mode. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, downloadCSV, counterOptions, donut, compactMoney, barChart,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, fmtDateTime, fmtTime, kpi, todayISO,
 modeLabel,
} from './_kit.js';
import { openCollect, printReceipt } from './op-registration.js';

let f = { date: todayISO(), mode: 'all', counter_id: '', q: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [pay, out] = await Promise.all([
      api.get(`/payments${qs({ ...f, limit: 400 })}`),
      api.get(`/bills${qs({ status: 'outstanding', limit: 120 })}`),
    ]);
    cache = pay.rows;
    const cash = pay.byMode.find((m) => m.mode === 'cash')?.total || 0;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Collected', value: compactMoney(pay.summary.total), icon: 'payments', tone: 'success', sub: `${pay.summary.count} receipts` },
      { label: 'Cash', value: compactMoney(cash), icon: 'account_balance_wallet', sub: 'Reconcile at shift close' },
      { label: 'Digital', value: compactMoney(pay.summary.total - cash), icon: 'qr_code_2', tone: 'info', sub: 'UPI, card, netbanking' },
      { label: 'Still outstanding', value: compactMoney(out.summary.balance), icon: 'schedule', tone: 'warning', sub: `${out.summary.n} open bills` },
    ].map(kpi).join('');

    const colours = { cash: '#166534', upi: '#1E40AF', card: '#881D2C', cheque: '#92400E', netbanking: '#8A6D1F', insurance: '#475569' };
    $('[data-mode]', root).innerHTML = pay.byMode.length ? `<div class="flex items-center gap-4">
        ${donut(pay.byMode.map((m) => ({ label: m.mode, value: m.total, color: colours[m.mode] || '#A9B4C4' })))}
        <ul class="flex-1 space-y-1.5">${pay.byMode.map((m) => `<li class="flex items-center gap-2 text-body-md">
          <span class="w-2.5 h-2.5 rounded-full" style="background:${colours[m.mode] || '#A9B4C4'}"></span>
          <span class="flex-1">${esc(modeLabel(m.mode))}</span><span class="font-data-mono">${money(m.total)}</span>
          <span class="font-data-mono text-label-sm text-on-surface-variant">${m.n}</span></li>`).join('')}</ul></div>`
      : '<p class="text-body-md text-on-surface-variant">No receipts for this filter.</p>';

    $('[data-counter]', root).innerHTML = pay.byCounter.length
      ? barChart(pay.byCounter.map((c) => ({ label: c.counter, value: c.total })), { height: 150 })
      : '<p class="text-body-md text-on-surface-variant">No counter activity.</p>';

    renderRows($('[data-rows]', root), pay.rows, rowHTML, { empty: 'No receipts for this filter.' });
    renderRows($('[data-out]', root), out.rows, outRow, { empty: 'Nothing outstanding.' });
    $('[data-count]', root).textContent = `${pay.rows.length} receipt(s) · ${money(pay.summary.total)}`;
  }

  bind(root, 'click', '[data-print]', async (e, b) => printReceipt(await api.get(`/payments/${b.dataset.print}/receipt`)));
  bind(root, 'click', '[data-collect]', (e, b) => openCollect(null, load, { billId: +b.dataset.collect }));
  bind(root, 'click', '[data-export]', () => downloadCSV(`collections-${f.date || 'all'}.csv`, cache.map((p) => ({
    receipt: p.receipt_no, date: p.created_at, uhid: p.uhid, patient: p.patient_name,
    bill: p.bill_no, type: p.bill_type, mode: p.mode, reference: p.reference,
    amount: p.amount, counter: p.counter_name, received_by: p.received_by_name,
  }))));

  return live({ topics: ['billing'], events: ['payment.received', 'payment.cancelled', 'refund.created', 'bill.created'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Cashier desk', 'point_of_sale')} ${liveChip()}`,
    title: 'All Collections',
    subtitle: 'Every receipt taken across the hospital today, by mode and by counter, with what is still to be collected beside it.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <a href="/counter-reconciliation" class="btn-primary"><span class="material-symbols-outlined text-[18px]">balance</span> Reconcile counters</a>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Receipt number, patient or UHID' },
        { type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' },
        { type: 'select', key: 'mode', label: 'Mode', value: f.mode, options: [
          { value: 'all', label: 'All modes' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' },
          { value: 'card', label: 'Card' }, { value: 'cheque', label: 'Cheque' }, { value: 'netbanking', label: 'Netbanking' }] },
        { type: 'select', key: 'counter_id', label: 'Counter', value: f.counter_id, options: counterOptions() },
      ])}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
        ${card({ title: 'By payment mode', body: `<div data-mode></div>` })}
        ${card({ title: 'By counter', body: `<div data-counter></div>` })}
      </div>
      <div class="grid grid-cols-1 2xl:grid-cols-[1.5fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Receipts', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '56vh',
          columns: [{ label: 'Receipt', width: '150px' }, { label: 'Patient' }, { label: 'Bill' },
            { label: 'Mode' }, { label: 'Amount', cls: 'text-right' }, { label: 'Counter / by' }, { label: '', width: '60px' }],
        })}
        ${card({ title: 'Still to collect', subtitle: 'Outstanding across all dates', pad: false,
          body: `<div class="overflow-auto" style="max-height:56vh"><table class="tbl">
            <thead><tr><th>Bill</th><th>Patient</th><th class="text-right">Balance</th><th></th></tr></thead>
            <tbody data-out></tbody></table></div>` })}
      </div>`,
  });
}

function rowHTML(p) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(p.receipt_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(p.created_at)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(p.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(p.uhid)}</div></td>
    <td><div class="font-data-mono text-body-sm">${esc(p.bill_no || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(p.bill_type || '')}</div></td>
    <td><span class="pill-neutral">${esc(modeLabel(p.mode))}</span>
      ${p.reference ? `<div class="font-data-mono text-label-sm text-on-surface-variant">${esc(p.reference)}</div>` : ''}</td>
    <td class="num font-semibold ${p.amount < 0 ? 'text-danger' : 'text-success'}">${money(p.amount, 2)}</td>
    <td><div class="text-body-md">${esc(p.counter_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(p.received_by_name || '')}</div></td>
    <td class="text-right"><button class="btn-ghost btn-xs" data-print="${p.id}" title="Print receipt">
      <span class="material-symbols-outlined text-[15px]">print</span></button></td>`;
}

function outRow(b) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(b.bill_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtDate(b.bill_date)} · ${esc(b.bill_type)}</div></td>
    <td><div class="text-body-md truncate max-w-[130px]">${esc(b.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(b.uhid)}</div></td>
    <td class="num text-danger font-semibold">${money(b.balance)}</td>
    <td class="text-right">${b.patient_due > 0 && can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${b.id}">Collect ${money(b.patient_due)}</button>` : b.payer_pending > 0 ? '<span class="pill-info">Awaiting payer settlement</span>' : '<span class="pill-neutral">No patient payment due</span>'}</td>`;
}
