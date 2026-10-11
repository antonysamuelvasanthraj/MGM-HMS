import { newGRN } from '../grn-form.js';
/** Goods Receipt (GRN) — receiving stock against a supplier invoice. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, can, downloadCSV, compactMoney, debounce,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, money, fmtDate, fmtDateTime, kpi, emptyState, confirmDialog,
} from './_kit.js';

let f = { status: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/pharmacy/purchases${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Receipts shown', value: d.summary.count, icon: 'local_shipping', sub: 'Goods received notes' },
      { label: 'Purchase value', value: compactMoney(d.summary.value), icon: 'receipt', sub: 'Including tax' },
      { label: 'Unpaid to suppliers', value: compactMoney(d.summary.unpaid), icon: 'schedule', tone: 'warning', sub: 'On the shown receipts' },
      { label: 'Total payable', value: compactMoney(d.summary.payable), icon: 'account_balance', tone: 'info', sub: 'Across all suppliers' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No goods receipts recorded.' });
    $('[data-count]', root).textContent = `${d.rows.length} GRN(s)`;
    loadAlerts(root, load);
  }

  bind(root, 'click', '[data-act="open"]', (e, b) => openGRN(b.closest('tr').dataset.id));
  bind(root, 'click', '[data-new]', () => newGRN(load));
  bind(root, 'click', '[data-export]', () => downloadCSV('grn.csv', cache.map((g) => ({
    grn: g.grn_no, supplier: g.supplier_name, invoice: g.invoice_no, invoice_date: g.invoice_date,
    received: g.received_at, lines: g.line_count, gross: g.gross, tax: g.tax, total: g.total,
    paid: g.paid, status: g.status,
  }))));

  return live({ topics: ['inventory'], events: ['purchase.received', 'supplier.saved', 'price_alert.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Stores & purchasing', 'local_shipping')} ${liveChip()}`,
    title: 'Goods Receipt (GRN)',
    subtitle: 'Receiving against a supplier invoice creates the batch, posts the stock-in movement and the payable in one step.',
    actions: `<a href="/suppliers" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">store</span> Suppliers</a>
      <button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('purchase.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New GRN</button>` : ''}`,
    body: `
      <div data-alerts></div>
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'select', key: 'status', label: 'Status', value: f.status, options: [
        { value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'received', label: 'Received' },
        { value: 'verified', label: 'Verified' }, { value: 'paid', label: 'Paid' }] }])}
      ${tableCard({
        title: 'Goods received notes', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '60vh',
        columns: [{ label: 'GRN', width: '140px' }, { label: 'Supplier' }, { label: 'Invoice' },
          { label: 'Received' }, { label: 'Lines', cls: 'text-right' },
          { label: 'Gross', cls: 'text-right' }, { label: 'Tax', cls: 'text-right' },
          { label: 'Total', cls: 'text-right' }, { label: 'Status' }, { label: '', width: '80px' }],
      })}`,
  });
}

/** Price changes on received GRNs: acknowledge with what was done, or escalate to management. */
async function loadAlerts(root, reload) {
  const box = $('[data-alerts]', root);
  let d;
  try { d = await api.get('/price-alerts'); } catch { box.innerHTML = ''; return; }
  if (!d.rows.length) { box.innerHTML = ''; return; }
  const fmt = (v) => (v === null || v === undefined ? '—' : (+v).toFixed(4));
  box.innerHTML = `<div class="mb-4">${card({ title: `Price changes to acknowledge (${d.rows.length})`,
    subtitle: `Increases of ${d.high_pct}% or more go to management at once; anything not acknowledged in ${d.escalate_hours} h is escalated.`,
    actions: d.can_acknowledge ? '<button class="btn-primary btn-xs" data-ack-sel>Acknowledge selected</button>' : '', pad: false,
    body: `<div class="overflow-auto max-h-[40vh]"><table class="tbl"><thead><tr><th></th><th>GRN</th><th>Medicine</th><th>Price</th><th class="text-right">Was / unit</th><th class="text-right">Now / unit</th><th class="text-right">Change</th><th>Status</th><th></th></tr></thead><tbody>
      ${d.rows.map((a) => `<tr data-aid="${a.id}"><td>${d.can_acknowledge ? `<input type="checkbox" data-asel value="${a.id}" aria-label="Select">` : ''}</td>
        <td class="font-data-mono text-body-sm">${esc(a.grn_no)}<div class="text-label-sm text-on-surface-variant font-sans">${esc(a.supplier_name || '')}</div></td>
        <td class="text-body-md">${esc(a.medicine)}<div class="text-label-sm text-on-surface-variant">was ${esc(a.previous_grn || '')}${a.previous_supplier ? ` · ${esc(a.previous_supplier)}` : ''}</div></td>
        <td class="text-body-sm">${esc(a.price_type)}</td><td class="num">${fmt(a.previous_cost)}</td><td class="num">${fmt(a.new_cost)}</td>
        <td class="num ${a.direction === 'increase' ? 'text-danger' : 'text-success'}">${a.direction === 'increase' ? '▲' : '▼'} ${a.percent === null ? 'new' : `${Math.abs(a.percent)}%`}</td>
        <td>${a.severity === 'high' ? '<span class="pill-danger">High</span> ' : ''}${pill(a.status, a.status === 'escalated' ? `Escalated${a.escalation_level > 1 ? ` ×${a.escalation_level}` : ''}` : 'Open')}</td>
        <td class="text-right whitespace-nowrap">${d.can_acknowledge ? '<button class="btn-secondary btn-xs" data-ack-one>Acknowledge</button>' : ''}
          ${a.status !== 'escalated' ? '<button class="btn-ghost btn-xs" data-esc>Escalate</button>' : ''}</td></tr>`).join('')}</tbody></table></div>` })}</div>`;
  const ack = (ids) => {
    const rows = d.rows.filter((a) => ids.includes(a.id));
    modal({ title: `Acknowledge ${ids.length} price change${ids.length > 1 ? 's' : ''}`, subtitle: rows.map((a) => `${a.medicine} · ${a.price_type}`).join(', '), size: 'md', stack: true,
      body: `<label class="field-label">What was done</label><select class="field" data-action>${Object.entries(d.actions).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <label class="field-label mt-3">Note ${rows.some((a) => a.severity === 'high') ? '*' : '(required unless simply accepted)'}</label><textarea class="field" rows="2" data-note placeholder="e.g. Supplier revised the list price from 1 Oct; selling price updated"></textarea>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Acknowledge</button>',
      onMount(r2, close) { r2.querySelector('[data-ok]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.post('/price-alerts/acknowledge', { ids, action: r2.querySelector('[data-action]').value, note: r2.querySelector('[data-note]').value }); close(); toast('Acknowledged', 'success'); reload(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); } }; } });
  };
  box.querySelector('[data-ack-sel]')?.addEventListener('click', () => { const ids = $$('[data-asel]:checked', box).map((x) => +x.value); if (!ids.length) { toast('Tick the changes to acknowledge', 'warning'); return; } ack(ids); });
  box.querySelectorAll('[data-ack-one]').forEach((b) => (b.onclick = () => ack([+b.closest('tr').dataset.aid])));
  box.querySelectorAll('[data-esc]').forEach((b) => (b.onclick = async () => {
    const c = await confirmDialog({ title: 'Escalate to management?', message: 'The owner, manager and administrator are notified.', confirmLabel: 'Escalate', requireReason: true });
    if (!c) return;
    try { await api.post(`/price-alerts/${b.closest('tr').dataset.aid}/escalate`, { note: c.reason }); toast('Escalated', 'success'); reload(); } catch (e) { apiError(e); }
  }));
}

function rowHTML(g) {
  return `
    <td class="font-data-mono text-body-sm">${esc(g.grn_no)}</td>
    <td class="font-label-lg text-label-lg">${esc(g.supplier_name)}</td>
    <td><div class="font-data-mono text-body-sm">${esc(g.invoice_no || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${g.invoice_date ? fmtDate(g.invoice_date) : ''}</div></td>
    <td class="text-body-sm">${fmtDate(g.received_at)}</td>
    <td class="num">${g.line_count}</td>
    <td class="num">${money(g.gross, 2)}</td>
    <td class="num">${money(g.tax, 2)}</td>
    <td class="num font-semibold">${money(g.total, 2)}</td>
    <td>${pill(g.status)}</td>
    <td class="text-right"><button class="btn-secondary btn-xs" data-act="open">View</button></td>`;
}

async function openGRN(id) {
  const g = await api.get(`/pharmacy/purchases/${id}`);
  drawer({
    title: g.grn_no, subtitle: `${esc(g.supplier_name)} · invoice ${esc(g.invoice_no || '—')}`, width: 'max-w-3xl',
    body: `<div class="p-5 space-y-4">
      <dl class="grid grid-cols-2 md:grid-cols-4 gap-3 text-body-lg">
        ${[['Received', fmtDateTime(g.received_at)], ['Invoice date', g.invoice_date ? fmtDate(g.invoice_date) : '—'],
           ['GSTIN', g.gstin || '—'], ['Status', g.status]].map(([k, v]) => `
          <div class="p-2.5 rounded-lg bg-surface-container-low">
            <dt class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">${k}</dt>
            <dd class="font-title-md text-title-md mt-0.5">${esc(String(v))}</dd></div>`).join('')}
      </dl>
      <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th>
        <th class="text-right">Rec. packs</th><th class="text-right">Free</th><th class="text-right">Pack qty</th><th class="text-right">DP</th>
        <th class="text-right">MRP</th><th class="text-right">Disc %</th><th class="text-right">Tax %</th><th class="text-right">Tax amt</th><th class="text-right">Total</th></tr></thead>
        <tbody>${g.items.map((i) => `<tr>
          <td><div class="font-label-lg text-label-lg">${esc(i.medicine_name)}</div>
            <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(i.medicine_code)}${i.hsn ? ` · HSN ${esc(i.hsn)}` : ''}</div></td>
          <td class="font-data-mono">${esc(i.batch_no)}</td><td class="whitespace-nowrap">${esc(String(i.expiry || '').slice(5, 7))}/${esc(String(i.expiry || '').slice(0, 4))}</td>
          <td class="num">${i.qty}</td><td class="num">${i.free_qty || 0}</td><td class="num">${(i.pack_size || 1) * (i.units_per_pack || 1)}</td>
          <td class="num">${money(i.rate, 2)}</td><td class="num">${money(i.mrp, 2)}</td><td class="num">${+i.discount_pct || 0}</td>
          <td class="num">${i.gst_pct}%</td><td class="num">${money((i.cgst_amount || 0) + (i.sgst_amount || 0) + (i.igst_amount || 0), 2)}</td>
          <td class="num font-semibold">${money(i.net_value ?? i.amount, 2)}</td></tr>`).join('')}
        </tbody></table></div>
      ${(() => {
        const disc = g.items.reduce((t, i) => t + i.qty * i.rate * (i.discount_pct || 0) / 100, 0);
        const row = (l, v, cls = '') => `<div class="flex justify-between gap-4 ${cls}"><dt class="text-on-surface-variant">${l}</dt><dd class="font-data-mono">${v}</dd></div>`;
        const diff = g.invoice_amount === null || g.invoice_amount === undefined ? null : g.total - g.invoice_amount;
        return `<dl class="ml-auto max-w-sm space-y-1.5 p-3 rounded-lg bg-surface-container-low text-body-md">
          ${row('Taxable value', money(g.gross, 2))}${row('Total discount', money(disc, 2))}${row('Total tax', money(g.tax, 2))}
          ${row('Total amount', money(g.gross + g.tax, 2), 'font-semibold')}
          ${row('Delivery charge', money(g.delivery_charge || 0, 2))}${row('Credit note amount', money(g.credit_note || 0, 2))}
          ${g.round_off ? row('Round off', money(g.round_off, 2)) : ''}
          ${row('Payable amount', money(g.total, 2), 'pt-2 border-t border-outline-variant font-semibold text-title-md')}
          ${diff === null ? '' : Math.abs(diff) < 1 ? `<div class="pt-1"><span class="pill-success pill-dot">Tallies with invoice ${money(g.invoice_amount, 2)}</span></div>`
            : `<div class="pt-1"><span class="pill-warning pill-dot">Invoice says ${money(g.invoice_amount, 2)} — differs by ${money(Math.abs(diff), 2)}</span></div>`}</dl>`;
      })()}
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>`,
  });
}
