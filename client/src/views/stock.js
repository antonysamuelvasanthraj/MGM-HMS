/** Stock ledger & batches — valuation, expiry risk and movement history. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  api, qs, can, downloadCSV, compactMoney,
  $, $$, esc, bind, toast, renderRows, money, fmtDate, fmtDateTime, kpi, emptyState,
} from './_kit.js';

let f = { q: '', filter: '', location: '' };
const LOCATIONS = ['Central', 'OP', 'IP', 'ER', 'ICU', 'OT', 'Ward'];
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [d, moves] = await Promise.all([
      api.get(`/pharmacy/stock${qs(f)}`), api.get('/pharmacy/stock/moves'),
    ]);
    cache = d.rows;
    const s = d.summary;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Stock value (cost)', value: compactMoney(s.value), icon: 'inventory_2', sub: `MRP ${compactMoney(s.mrp_value)}` },
      { label: 'Batches in stock', value: s.batches, icon: 'layers', sub: `${s.low_stock} item(s) below reorder` },
      { label: 'Expiring in 90 days', value: s.expiring_90, icon: 'schedule', tone: s.expiring_90 ? 'warning' : 'success', sub: `${compactMoney(s.expiry_value)} at risk` },
      { label: 'Already expired', value: s.expired, icon: 'dangerous', tone: s.expired ? 'danger' : 'success', sub: 'Write off and quarantine' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No batches match this filter.' });
    renderRows($('[data-moves]', root), moves.slice(0, 60), moveRow, { empty: 'No movement recorded.' });
    $('[data-count]', root).textContent = `${d.rows.length} batch(es)`;
  }

  bind(root, 'click', '[data-export]', () => downloadCSV('stock-ledger.csv', cache.map((b) => ({
    medicine: b.medicine_name, location: b.location, code: b.medicine_code, batch: b.batch_no, expiry: b.expiry,
    days_to_expiry: b.days_to_expiry, qty: b.qty, purchase_rate: b.purchase_rate, mrp: b.mrp,
    value: b.stock_value, supplier: b.supplier_name, rack: b.rack,
  }))));
  bind(root, 'click', '[data-quick]', (e, b) => {
    f.filter = f.filter === b.dataset.quick ? '' : b.dataset.quick;
    $$('[data-f="filter"]', root).forEach((s) => { s.value = f.filter; });
    load();
  });

  return live({ topics: ['inventory', 'pharmacy'], events: ['stock.changed', 'pharmacy.dispensed', 'purchase.received'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Stores', 'inventory_2')} ${liveChip()}`,
    title: 'Stock Ledger & Batches',
    subtitle: 'Batch-level stock with expiry exposure and every movement that changed it.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <a href="/grn" class="btn-primary"><span class="material-symbols-outlined text-[18px]">local_shipping</span> Receive goods</a>`,
    body: `
      ${kpiRow([], 4)}
      <div class="flex flex-wrap gap-2">
        ${[['expiring', 'Expiring in 90 days', 'schedule'], ['expired', 'Expired', 'dangerous'], ['zero', 'Zero stock', 'production_quantity_limits']]
          .map(([k, l, i]) => `<button class="btn-secondary btn-sm" data-quick="${k}">
            <span class="material-symbols-outlined text-[15px]">${i}</span> ${l}</button>`).join('')}
      </div>
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Medicine or batch number' },
        { type: 'select', key: 'location', label: 'Location', value: f.location, options: [
          { value: '', label: 'All locations' }, ...LOCATIONS.map((l) => ({ value: l, label: l }))] },
        { type: 'select', key: 'filter', label: 'View', value: f.filter, options: [
          { value: '', label: 'All batches' }, { value: 'expiring', label: 'Expiring in 90 days' },
          { value: 'expired', label: 'Expired' }, { value: 'zero', label: 'Zero stock' }] },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Batches', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '58vh',
          columns: [{ label: 'Medicine' }, { label: 'Location' }, { label: 'Batch' }, { label: 'Expiry' },
            { label: 'Qty', cls: 'text-right' }, { label: 'Cost', cls: 'text-right' },
            { label: 'MRP', cls: 'text-right' }, { label: 'Value', cls: 'text-right' }, { label: 'Supplier' }],
        })}
        ${card({ title: 'Stock movement', subtitle: 'Most recent first', pad: false,
          body: `<div class="overflow-auto" style="max-height:58vh"><table class="tbl">
            <thead><tr><th>When</th><th>Medicine</th><th>Type</th><th class="text-right">Qty</th><th>By</th></tr></thead>
            <tbody data-moves></tbody></table></div>` })}
      </div>`,
  });
}

function rowHTML(b) {
  const d = b.days_to_expiry;
  return `
    <td><div class="font-label-lg text-label-lg">${esc(b.medicine_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(b.medicine_code)}${b.rack ? ` · rack ${esc(b.rack)}` : ''}</div></td>
    <td><span class="pill-neutral">${esc(b.location || '—')}</span></td>
    <td class="font-data-mono text-body-sm">${esc(b.batch_no)}</td>
    <td><div class="text-body-md ${d < 0 ? 'text-danger font-bold' : d < 90 ? 'text-warning font-semibold' : ''}">${fmtDate(b.expiry)}</div>
      <div class="text-label-sm text-on-surface-variant">${d < 0 ? `expired ${-d}d ago` : `${d} days left`}</div></td>
    <td class="num ${b.qty <= 0 ? 'text-on-surface-variant' : ''}">${b.qty}</td>
    <td class="num">${money(b.purchase_rate, 2)}</td>
    <td class="num">${money(b.mrp, 2)}</td>
    <td class="num font-semibold">${money(b.stock_value, 2)}</td>
    <td class="text-body-md">${esc(b.supplier_name || '—')}</td>`;
}

function moveRow(s) {
  return `
    <td class="text-body-sm">${fmtDateTime(s.created_at)}</td>
    <td><div class="text-body-md truncate max-w-[150px]">${esc(s.medicine_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(s.batch_no || '')}</div></td>
    <td class="capitalize text-body-md">${esc(s.move_type)}</td>
    <td class="num ${s.qty < 0 ? 'text-danger' : 'text-success'}">${s.qty > 0 ? '+' : ''}${s.qty}</td>
    <td class="text-body-md">${esc(s.by_name || 'system')}</td>`;
}
