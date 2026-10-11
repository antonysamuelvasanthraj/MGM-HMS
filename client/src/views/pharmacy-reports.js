/** Pharmacy & inventory reports — valuation, margin, movement and expiry exposure. */
import {
  page, eyebrow, liveChip, kpiRow, filterBar, wireFilters, live, mountPage, card,
  api, qs, downloadCSV, compactMoney, barChart, donut, sparkline,
  $, $$, esc, bind, renderRows, money, fmtDate, kpi, todayISO, shiftDate, emptyState,
} from './_kit.js';

let f = { from: shiftDate(todayISO(), -29), to: todayISO() };
let data = null;

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    data = await api.get(`/pharmacy/analytics${qs(f)}`);
    const margin = data.sales.revenue - data.cogs;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Pharmacy revenue', value: compactMoney(data.sales.revenue), icon: 'payments', tone: 'success', sub: `${data.sales.bills} bills` },
      { label: 'Cost of goods sold', value: compactMoney(data.cogs), icon: 'inventory', sub: 'At purchase rate' },
      { label: 'Gross margin', value: compactMoney(margin), icon: 'trending_up', tone: margin > 0 ? 'success' : 'danger',
        sub: data.sales.revenue ? `${Math.round((margin / data.sales.revenue) * 100)}% of revenue` : '—' },
      { label: 'Closing stock value', value: compactMoney(data.stock_value), icon: 'inventory_2', tone: 'info', sub: 'At purchase rate' },
    ].map(kpi).join('');

    $('[data-daily]', root).innerHTML = data.daily.length
      ? barChart(data.daily.map((d) => ({ label: fmtDate(d.d).slice(0, 6), value: d.revenue })), { height: 180 })
      : emptyState('bar_chart', 'No sales in this period', '');

    renderRows($('[data-top]', root), data.top_sellers, (r) => `
      <td class="text-body-md truncate max-w-[280px]">${esc(r.description)}</td>
      <td class="num">${r.qty}</td><td class="num">${r.lines}</td>
      <td class="num font-semibold">${money(r.value, 2)}</td>`, { empty: 'No sales recorded.' });

    renderRows($('[data-expiry]', root), data.expiry_risk, (r) => `
      <td class="text-body-md">${esc(r.name)}</td>
      <td class="font-data-mono text-body-sm">${esc(r.batch_no)}</td>
      <td class="${r.days < 0 ? 'text-danger font-bold' : 'text-warning'}">${fmtDate(r.expiry)}
        <span class="text-label-sm">${r.days < 0 ? 'expired' : `${r.days}d`}</span></td>
      <td class="num">${r.qty}</td><td class="num font-semibold">${money(r.value, 2)}</td>`,
      { empty: 'No batch is close to expiry.' });

    renderRows($('[data-suppliers]', root), data.supplier_spend, (r) => `
      <td class="text-body-md">${esc(r.name)}</td><td class="num">${r.grns}</td>
      <td class="num font-semibold">${money(r.value)}</td>`, { empty: 'No purchases in this period.' });
  }

  bind(root, 'click', '[data-export]', () => downloadCSV(`pharmacy-${f.from}-to-${f.to}.csv`, data.top_sellers));
  return live({ topics: ['pharmacy', 'inventory'], events: ['pharmacy.dispensed', 'purchase.received', 'stock.changed'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Commercial reporting', 'analytics')} ${liveChip()}`,
    title: 'Pharmacy & Inventory Reports',
    subtitle: 'Revenue, margin, fast movers, supplier spend and the value tied up in stock that is about to expire.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>`,
    body: `
      ${card({title:'Pharmacy audit reports',subtitle:'Separate registers with search, Excel/CSV and Print/PDF',body:'<div class="flex flex-wrap gap-3"><a class="btn-secondary" href="/reports?report=ward_indent_audit">Direct indent audit</a><a class="btn-secondary" href="/reports?report=ward_replacement_audit">Ward replacement audit</a><a class="btn-secondary" href="/reports?report=pharmacy_expiry_removals">Expiry removal audit</a><a class="btn-secondary" href="/reports?report=pharmacy_stock_losses">All stock losses</a><a class="btn-secondary" href="/reports?report=emergency_store_batches">ER / ICU / OT batches & expiry</a></div>'})}
      ${filterBar([
        { type: 'date', key: 'from', label: 'From', value: f.from, width: 'w-[150px]' },
        { type: 'date', key: 'to', label: 'To', value: f.to, width: 'w-[150px]' },
      ])}
      ${kpiRow([], 4)}
      ${card({ title: 'Daily pharmacy revenue', body: `<div data-daily></div>` })}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        ${card({ title: 'Fast movers', subtitle: 'By value in the period', pad: false,
          body: `<div class="overflow-auto max-h-[46vh]"><table class="tbl">
            <thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Lines</th><th class="text-right">Value</th></tr></thead>
            <tbody data-top></tbody></table></div>` })}
        ${card({ title: 'Expiry exposure', subtitle: 'Batches expiring within 120 days', pad: false,
          body: `<div class="overflow-auto max-h-[46vh]"><table class="tbl">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th class="text-right">Qty</th><th class="text-right">Value</th></tr></thead>
            <tbody data-expiry></tbody></table></div>` })}
      </div>
      ${card({ title: 'Supplier spend', pad: false,
        body: `<div class="overflow-auto max-h-[40vh]"><table class="tbl">
          <thead><tr><th>Supplier</th><th class="text-right">GRNs</th><th class="text-right">Value</th></tr></thead>
          <tbody data-suppliers></tbody></table></div>` })}`,
  });
}
