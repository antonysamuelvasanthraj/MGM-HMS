/** Stock ledger & batches — valuation, expiry risk and movement history. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  api, qs, can, downloadCSV, compactMoney, modal, apiError, printDocument,
  $, $$, esc, bind, toast, renderRows, money, fmtDate, fmtDateTime, kpi, emptyState, setting,
} from './_kit.js';

// single-batch corrections follow Settings → Pharmacy & stock; the Excel bulk count is always available
const canAdjust = () => can('inventory.write') && setting('manual_stock_adjust', '1') === '1';
import { pharmacyStockRow } from '../pharmacy-stock-columns.js';

let f = { q: '', filter: '', location: '' };
const LOCATIONS = ['Central', 'OP', 'IP', 'ER', 'ICU', 'OT', 'Ward', 'LAB'];
let cache = [];

export async function mount(ctx) {
  f={q:'',filter:'in_stock',location:LOCATIONS.includes(ctx.query?.location)?ctx.query.location:''};
  const root = mountPage(ctx, layout());
  let openAdjustment = ctx.query?.adjust === '1';
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [d, moves, locations] = await Promise.all([
      api.get(`/pharmacy/stock${qs(f)}`), api.get(`/pharmacy/stock/moves${qs({location:f.location})}`),api.get('/pharmacy/locations'),
    ]);
    cache = d.rows;
    root.querySelector('[data-location-stock]').innerHTML=['Central','OP','IP'].map(location=>{
      const s=locations.stock.find(item=>item.location===location) || {};
      return `<button class="card p-4 text-left" data-stock-location="${location}" aria-pressed="${f.location===location}" style="border:2px solid ${f.location===location?'#17649b':'#dbe4ef'}"><b>${location==='Central'?'Central pharmacy':location+' pharmacy'}</b><p>${s.units || 0} units · ${s.batches || 0} batches</p><p>Stock at cost: ${money(s.value || 0,2)}</p><p>${s.usable_units || 0} usable · ${s.expired_units || 0} expired units</p></button>`;
    }).join('');
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
    if (openAdjustment) {
      openAdjustment = false;
      root.querySelector('[data-adjust]')?.click();
    }
  }

  bind(root,'click','[data-stock-location]',(_event,button)=>{
    f.location=button.dataset.stockLocation;
    root.querySelector('[data-f="location"]').value=f.location;
    load();
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`stock-${f.location || 'all-locations'}.csv`, cache.map(pharmacyStockRow)));
  bind(root,'click','[data-print-stock]',()=>printDocument(`${f.location || 'All locations'} pharmacy stock`,
    `<h2>${esc(f.location || 'All locations')} pharmacy stock</h2><p>Generated ${esc(fmtDateTime(new Date()))} · ${cache.length} batch(es)${f.q?' · Search: '+esc(f.q):''}${f.filter?' · View: '+esc(f.filter):''}</p><table style="width:100%;border-collapse:collapse"><thead><tr>${['Medicine','Location','Batch','Expiry','Units','Cost/unit','MRP/unit','Stock value'].map(label=>`<th style="text-align:left;border-bottom:1px solid #ccc;padding:5px">${label}</th>`).join('')}</tr></thead><tbody>${cache.map(b=>`<tr>${[b.medicine_name,b.location,b.batch_no,fmtDate(b.expiry),b.qty,money(b.purchase_rate,2),money(b.mrp,2),money(b.stock_value,2)].map(value=>`<td style="padding:5px;border-bottom:1px solid #eee">${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`));
  bind(root, 'click', '[data-quick]', (e, b) => {
    f.filter = f.filter === b.dataset.quick ? '' : b.dataset.quick;
    $$('[data-f="filter"]', root).forEach((s) => { s.value = f.filter; });
    load();
  });
  bind(root, 'click', '[data-adjust]', (_event, trigger) => {
    const adjustmentBatches = cache.map(batch => ({...batch}));
    if (!adjustmentBatches.length) return toast('No batches available for the selected filters', 'warning');
    modal({ title: 'Manual stock adjustment', subtitle: 'Count one batch at its existing location. Inventory and accounts update together.',
      body: `<div class="p-5 space-y-4"><label class="block">Medicine / batch / location<select class="field" data-batch>${adjustmentBatches.map(b => `<option value="${b.id}">${esc(b.medicine_name)} · ${esc(b.batch_no)} · ${esc(b.location)} · current ${b.qty}</option>`).join('')}</select></label><label class="block">Physical quantity<input class="field" type="number" min="0" step="any" data-physical></label><label class="block">Reason<select class="field" data-reason><option value="">Select reason…</option><option>Shortage</option><option>Excess</option><option>Damage</option><option>Expiry</option><option>Correction</option></select></label><label class="block">Remarks<input class="field" data-remarks></label><p data-preview role="status"></p><p class="text-danger" data-error role="alert"></p></div>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-post>Post adjustment</button>',
      onMount(dialog, close) {
        const batchField = dialog.querySelector('[data-batch]'), count = dialog.querySelector('[data-physical]');
        if(trigger.dataset.batchId)batchField.value=trigger.dataset.batchId;
        const preview = () => { const b = adjustmentBatches.find(b => b.id === +batchField.value); const delta = Number(count.value) - b.qty; dialog.querySelector('[data-preview]').textContent = count.value === '' ? 'Enter the counted quantity.' : `Current ${b.qty} → Physical ${count.value} · Difference ${delta > 0 ? '+' : ''}${delta} · Cost impact ${money(delta * b.purchase_rate, 2)}`; };
        batchField.onchange = () => { count.value = ''; preview(); }; count.oninput = preview; preview();
        dialog.querySelector('[data-post]').onclick = async event => {
          const button = event.currentTarget, error = dialog.querySelector('[data-error]');
          const b = adjustmentBatches.find(b => b.id === +batchField.value), physical = Number(count.value), reason = dialog.querySelector('[data-reason]').value;
          if (count.value === '' || !Number.isFinite(physical) || physical < 0 || !reason || physical === b.qty) { error.textContent = 'Enter a changed, non-negative physical quantity and select a reason.'; return; }
          button.disabled = true;
          try { await api.post('/pharmacy/stock/adjust', { batch_id: b.id, qty: physical - b.qty, expected_qty: b.qty, move_type: reason === 'Damage' ? 'damage' : reason === 'Expiry' ? 'expiry' : reason === 'Shortage' ? 'loss' : 'adjust', reason: `${reason}: ${dialog.querySelector('[data-remarks]').value.trim()}` }); close(); toast('Stock adjustment posted'); await load(); }
          catch (err) { error.textContent = apiError(err); button.disabled = false; }
        };
      },
    });
  });

  return live({ topics: ['inventory', 'pharmacy'], events: ['stock.changed', 'pharmacy.dispensed', 'purchase.received'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Stores', 'inventory_2')} ${liveChip()}`,
    title: 'Stock Ledger & Batches',
    subtitle: 'Batch-level stock with expiry exposure and every movement that changed it.',
    actions: `${canAdjust() ? '<button class="btn-primary" data-adjust>Manual stock adjustment</button>' : ''}<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <button class="btn-secondary" data-print-stock>Print / Save PDF</button>${can('purchase.view')?'<a href="/grn" class="btn-primary"><span class="material-symbols-outlined text-[18px]">local_shipping</span> Receive goods</a>':''}`,
    body: `
      ${kpiRow([], 4)}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3" data-location-stock></div>
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
          { value: 'in_stock', label: 'In stock only' }, { value: '', label: 'All batches (including zero stock)' }, { value: 'expiring', label: 'Expiring in 90 days' },
          { value: 'expired', label: 'Expired' }, { value: 'zero', label: 'Zero stock' }] },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Batches', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '58vh',
          columns: [{ label: 'Medicine' }, { label: 'Location' }, { label: 'Batch' }, { label: 'Expiry' },
            { label: 'Qty', cls: 'text-right' }, { label: 'Cost', cls: 'text-right' },
            { label: 'MRP', cls: 'text-right' }, { label: 'Value', cls: 'text-right' }, { label: 'Supplier' }, ...(canAdjust()?[{label:'Action'}]:[])],
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
    <td class="text-body-md">${esc(b.supplier_name || '—')}</td>${canAdjust()?`<td><button class="btn-secondary btn-xs" data-adjust data-batch-id="${b.id}">Adjust stock</button></td>`:''}`;
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
