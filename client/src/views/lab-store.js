/**
 * LAB store — tubes, needles, containers and reagents held in the laboratory. Stock arrives only by
 * GRN into Central and a stock transfer to LAB; tests use it up as samples are taken and results
 * entered (set per test in Lab templates → Consumables).
 */
import { page, eyebrow, liveChip, kpiRow, live, mountPage, card, api, can, esc, bind, toast, apiError, money, fmtDate, fmtDateTime, kpi, headCount } from './_kit.js';

export async function mount(ctx) {
  const root = mountPage(ctx, page({
    eyebrow: `${eyebrow('Laboratory', 'inventory_2')} ${liveChip()}`, title: 'Lab Store',
    subtitle: 'Consumables in the laboratory, what is running low or expiring, and tests done without the set items.',
    actions: `${can('inventory.write') ? '<a class="btn-primary" href="/stock-transfers">Transfer from Central</a>' : ''}
      <a class="btn-secondary" href="/reports?report=lab_consumable_usage">Usage & cost report</a>
      ${can('inventory.write') || (can('staff.manage') && can('lab.verify')) || can('admin.view') ? '<button class="btn-ghost" data-standard title="EDTA, plain, fluoride and citrate tubes, needles, containers, swabs, slides, tips">Add standard lab items</button>' : ''}`,
    body: `${kpiRow([], 4)}<div data-body class="space-y-5"></div>`,
  }));
  async function load() {
    const d = await api.get('/lab/store');
    headCount(root, `${d.low.length} low · ${d.expiring.length} expiring`);
    root.querySelector('[data-kpis]').innerHTML = [
      { label: 'Items in the lab', value: d.stock.filter((s) => s.qty > 0).length, icon: 'inventory_2', sub: `${d.stock.length} lab items set up` },
      { label: 'Stock value', value: money(d.stock.reduce((s, x) => s + x.value, 0)), icon: 'payments', sub: 'At purchase cost' },
      { label: 'Low — reorder', value: d.low.length, icon: 'trending_down', tone: d.low.length ? 'warning' : 'success', sub: 'At or below reorder level' },
      { label: 'Short at use (14 days)', value: d.short.length, icon: 'report', tone: d.short.length ? 'danger' : 'success', sub: 'Test done, item not in stock' },
    ].map(kpi).join('');
    const tbl = (cols, rows, empty) => `<div class="overflow-auto"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${cols.length}" class="text-center py-6 text-on-surface-variant">${empty}</td></tr>`}</tbody></table></div>`;
    root.querySelector('[data-body]').innerHTML = `
      ${card({ title: 'Stock in the LAB store', pad: false, body: tbl(['Item', 'In stock', 'Reorder at', 'Nearest expiry', 'Value', 'Used by'], d.stock.map((s) => `<tr>
        <td><b>${esc(s.name)}</b><div class="text-body-sm font-data-mono">${esc(s.code)}</div></td>
        <td class="num ${s.qty <= s.reorder_level ? 'text-warning font-semibold' : ''}">${s.qty} ${esc(s.unit || '')}</td><td class="num">${s.reorder_level}</td>
        <td>${s.nearest_expiry ? esc(fmtDate(s.nearest_expiry)) : '—'}</td><td class="num">${money(s.value)}</td><td>${s.tests_using ? `${s.tests_using} test(s)` : '<span class="text-on-surface-variant">Not set on any test</span>'}</td></tr>`), 'No lab items yet.') })}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
        ${card({ title: 'Expiring within 60 days', pad: false, body: tbl(['Item', 'Batch', 'Expiry', 'Qty'], d.expiring.map((x) => `<tr><td>${esc(x.name)}</td><td class="font-data-mono">${esc(x.batch_no)}</td><td>${esc(fmtDate(x.expiry))}</td><td class="num">${x.qty}</td></tr>`), 'Nothing expiring soon.') })}
        ${card({ title: 'Used without stock (last 14 days)', subtitle: 'The test went ahead; restock and correct the count.', pad: false, body: tbl(['When', 'Item', 'Short', 'Order'], d.short.map((x) => `<tr><td>${esc(fmtDateTime(x.created_at))}</td><td>${esc(x.name)}</td><td class="num">${x.qty}</td><td>${esc(x.order_no)} · ${esc(x.label)}</td></tr>`), 'None.') })}
      </div>`;
  }
  bind(root, 'click', '[data-standard]', async () => {
    try { const r = await api.post('/lab/store/standard-items', {}); toast(r.added.length ? `${r.added.length} lab item(s) added to the master — stock them by GRN and transfer to LAB` : 'All standard lab items are already in the master', 'success'); load(); }
    catch (err) { apiError(err); }
  });
  return live({ topics: ['lab', 'pharmacy', 'inventory'], events: ['order.updated', 'lab.reported', 'stock.changed', 'transfer.updated'], load });
}
