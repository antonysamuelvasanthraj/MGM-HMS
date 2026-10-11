/** Payments & receipts ledger, including refunds. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, downloadCSV, counterOptions, compactMoney,
  $, $$, esc, bind, toast, modal, confirmDialog, renderRows, pill, money,
  fmtDate, fmtDateTime, fmtTime, kpi, todayISO, shiftDate,
 modeLabel,
} from './_kit.js';
import { printReceipt } from './op-registration.js';

let f = { from: shiftDate(todayISO(), -6), to: todayISO(), mode: 'all', counter_id: '', q: '', include_cancelled: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [pay, refunds] = await Promise.all([
      api.get(`/payments${qs({ ...f, limit: 500 })}`), api.get('/refunds'),
    ]);
    cache = pay.rows;
    const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Receipts in period', value: pay.summary.count, icon: 'receipt', sub: `${f.from} → ${f.to}` },
      { label: 'Gross received', value: compactMoney(pay.summary.total), icon: 'payments', tone: 'success', sub: 'Net of cancellations' },
      { label: 'Refunds issued', value: compactMoney(refundTotal), icon: 'undo', tone: refundTotal ? 'warning' : 'success', sub: `${refunds.length} refund(s)` },
      { label: 'Net collection', value: compactMoney(pay.summary.total - refundTotal), icon: 'account_balance', tone: 'info', sub: 'After refunds' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), pay.rows, rowHTML, { empty: 'No receipts in this period.' });
    renderRows($('[data-refunds]', root), refunds, refundRow, { empty: 'No refunds issued.' });
    $('[data-count]', root).textContent = `${pay.rows.length} receipt(s) · ${money(pay.summary.total)}`;
  }

  bind(root, 'click', '[data-print]', async (e, b) => printReceipt(await api.get(`/payments/${b.dataset.print}/receipt`)));
  bind(root, 'click', '[data-cancel]', async (e, b) => {
    const r = await confirmDialog({ title: 'Cancel this receipt?', message: 'The amount leaves the day’s collection and the bill balance reopens.', confirmLabel: 'Cancel receipt', tone: 'danger', requireReason: true });
    if (!r) return;
    await api.post(`/payments/${b.dataset.cancel}/cancel`, { reason: r.reason });
    toast('Receipt cancelled', 'success'); load();
  });
  bind(root, 'click', '[data-refund]', (e, b) => openRefund(cache.find((x) => x.id === +b.dataset.refund), load));
  bind(root, 'click', '[data-export]', () => downloadCSV(`receipts-${f.from}-to-${f.to}.csv`, cache));

  return live({ topics: ['billing'], events: ['payment.received', 'payment.cancelled', 'refund.created'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Money ledger', 'paid')} ${liveChip()}`,
    title: 'Payments & Receipts',
    subtitle: 'Every receipt and refund with the counter, the staff member and the bill it settled.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Receipt, patient or UHID' },
        { type: 'date', key: 'from', label: 'From', value: f.from, width: 'w-[150px]' },
        { type: 'date', key: 'to', label: 'To', value: f.to, width: 'w-[150px]' },
        { type: 'select', key: 'mode', label: 'Mode', value: f.mode, options: [
          { value: 'all', label: 'All modes' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' },
          { value: 'card', label: 'Card' }, { value: 'cheque', label: 'Cheque' }] },
        { type: 'select', key: 'counter_id', label: 'Counter', value: f.counter_id, options: counterOptions() },
        { type: 'select', key: 'include_cancelled', label: 'Show', value: f.include_cancelled, options: [
          { value: '', label: 'Active receipts' }, { value: '1', label: 'Include cancelled' }] },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Receipts', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '60vh',
          columns: [{ label: 'Receipt', width: '150px' }, { label: 'Patient' }, { label: 'Bill' },
            { label: 'Mode' }, { label: 'Amount', cls: 'text-right' }, { label: 'Counter / by' }, { label: '', width: '110px' }],
        })}
        ${card({ title: 'Refunds', pad: false,
          body: `<div class="overflow-auto" style="max-height:60vh"><table class="tbl">
            <thead><tr><th>Refund</th><th>Patient</th><th class="text-right">Amount</th><th>Reason</th></tr></thead>
            <tbody data-refunds></tbody></table></div>` })}
      </div>`,
  });
}

function rowHTML(p) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(p.receipt_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtDateTime(p.created_at)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(p.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(p.uhid)}</div></td>
    <td class="font-data-mono text-body-sm">${esc(p.bill_no || '—')}</td>
    <td><span class="pill-neutral">${esc(modeLabel(p.mode))}</span>
      ${p.cancelled ? `<div class="mt-1"><span class="pill-danger">Cancelled</span></div>
        <div class="text-label-sm text-on-surface-variant">${esc(p.cancelled_by_name || '')}${p.cancelled_at ? ` · ${fmtDateTime(p.cancelled_at)}` : ''}</div>` : ''}</td>
    <td class="num font-semibold ${p.cancelled ? 'line-through text-on-surface-variant' : p.amount < 0 ? 'text-danger' : 'text-success'}">${money(p.amount, 2)}</td>
    <td><div class="text-body-md">${esc(p.counter_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(p.received_by_name || '')}</div></td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-ghost btn-xs" data-print="${p.id}" title="Print"><span class="material-symbols-outlined text-[15px]">print</span></button>
      ${can('payment.refund') && p.amount > 0 && !p.cancelled ? `<button class="btn-ghost btn-xs" data-refund="${p.id}" title="Refund">
        <span class="material-symbols-outlined text-[15px]">undo</span></button>` : ''}
      ${can('payment.cancel') && p.amount > 0 && !p.cancelled ? `<button class="btn-ghost btn-xs" data-cancel="${p.id}" title="Cancel">
        <span class="material-symbols-outlined text-[15px]">close</span></button>` : ''}
    </td>`;
}

function refundRow(r) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(r.refund_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtDate(r.created_at)} · ${esc(r.bill_no || '')}</div></td>
    <td class="text-body-md truncate max-w-[130px]">${esc(r.patient_name)}</td>
    <td class="num text-danger font-semibold">${money(r.amount, 2)}</td>
    <td class="text-body-sm text-on-surface-variant max-w-[160px] truncate" title="${esc(r.reason)}">${esc(r.reason)}</td>`;
}

function openRefund(p, after) {
  modal({
    title: 'Issue a refund', subtitle: `${esc(p.receipt_no)} · ${esc(p.patient_name)} · received ${money(p.amount)}`, size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Refund amount</label><input class="field" type="number" step="0.01" data-a value="${p.amount}"></div>
      <div><label class="field-label">Mode</label><select class="field" data-m>
        ${(() => {
          // money goes back the way it came: UPI to UPI, card to a card reversal
          const back = ['debit_card', 'credit_card', 'card'].includes(p.mode) ? 'card' : ['upi', 'cheque'].includes(p.mode) ? p.mode : 'cash';
          return [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card reversal'], ['cheque', 'Cheque']]
            .map(([v, l]) => `<option value="${v}" ${v === back ? 'selected' : ''}>${l}</option>`).join('');
        })()}</select></div>
      <div><label class="field-label">Reason *</label><textarea class="field" rows="3" data-r placeholder="Recorded in the audit trail"></textarea></div>
      <p class="text-body-sm text-on-surface-variant">A negative receipt is posted against the same bill, so the day's
        collection and the ledger both stay correct.</p>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-danger" data-ok>Issue refund</button>`,
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const reason = root.querySelector('[data-r]').value.trim();
        if (!reason) { toast('A reason is required', 'warning'); return; }
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post('/refunds', { bill_id: p.bill_id, payment_id: p.id,
            amount: +root.querySelector('[data-a]').value, mode: root.querySelector('[data-m]').value, reason });
          close(); toast('Refund issued', 'success'); after();
        } catch (e) { apiError(e, 'Could not issue the refund'); busy(actionButton, false); }
      };
    },
  });
}
