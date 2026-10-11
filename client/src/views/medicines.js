/** Medicine master catalogue. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, can, downloadCSV,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, money, fmtDate, kpi, optionList, emptyState,
} from './_kit.js';
import { compositionEditor, wireComposition, compositionText } from '../composition.js';

let f = { q: '', form: '', schedule: '', low: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const { rows } = await api.get(`/pharmacy/medicines${qs({ ...f, limit: 400 })}`);
    cache = f.low === '1' ? rows.filter((r) => r.low) : rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Items in catalogue', value: rows.length, icon: 'pill', sub: `${rows.filter((r) => r.active).length} active` },
      { label: 'Below reorder level', value: rows.filter((r) => r.low).length, icon: 'trending_down', tone: 'warning', sub: 'Raise a purchase order' },
      { label: 'Out of stock', value: rows.filter((r) => r.stock <= 0).length, icon: 'production_quantity_limits', tone: 'danger', sub: 'Nothing sellable' },
      { label: 'Scheduled drugs', value: rows.filter((r) => ['H', 'H1', 'X'].includes(r.schedule)).length, icon: 'gavel', tone: 'info', sub: 'Prescription only' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), cache, rowHTML, { empty: 'No medicine matches this filter.' });
    $('[data-count]', root).textContent = `${cache.length} item(s)`;
  }

  bind(root, 'click', '[data-act="open"]', (e, b) => openMedicine(b.closest('tr').dataset.id, load));
  bind(root, 'click', '[data-new]', () => editMedicine(null, load));
  bind(root, 'click', '[data-export]', () => downloadCSV('medicine-master.csv', cache.map((m) => ({
    code: m.code, name: m.name, generic: m.generic, form: m.form, strength: m.strength,
    manufacturer: m.manufacturer, schedule: m.schedule, gst: m.gst_pct, rack: m.rack,
    stock: m.stock, reorder_level: m.reorder_level, mrp: m.mrp, next_expiry: m.next_expiry,
  }))));

  return live({ topics: ['inventory', 'pharmacy'], events: ['medicine.saved', 'stock.changed', 'pharmacy.dispensed', 'purchase.received'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Formulary', 'pill')} ${liveChip()}`,
    title: 'Medicine Master Catalog',
    subtitle: 'The single formulary behind prescriptions, dispensing, stock and purchasing.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('inventory.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> Add medicine</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Brand, generic or code' },
        { type: 'select', key: 'form', label: 'Form', value: f.form, options: optionList([{ value: '', label: 'Any form' }, 'tablet', 'capsule', 'syrup', 'injection', 'ointment']) },
        { type: 'select', key: 'schedule', label: 'Schedule', value: f.schedule, options: optionList([{ value: '', label: 'Any' }, 'OTC', 'H', 'H1', 'X']) },
        { type: 'select', key: 'low', label: 'Stock', value: f.low, options: [{ value: '', label: 'All items' }, { value: '1', label: 'Below reorder only' }] },
      ])}
      ${tableCard({
        title: 'Formulary', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Code', width: '90px' }, { label: 'Medicine' }, { label: 'Form / strength' },
          { label: 'Manufacturer' }, { label: 'Schedule' }, { label: 'Rack' },
          { label: 'Stock', cls: 'text-right' }, { label: 'MRP', cls: 'text-right' },
          { label: 'Next expiry' }, { label: '', width: '90px' }],
      })}`,
  });
}

function rowHTML(m) {
  const soon = m.next_expiry && (new Date(m.next_expiry) - Date.now()) / 864e5 < 90;
  return `
    <td class="font-data-mono text-body-sm">${esc(m.code)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(m.name)}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(compositionText(m))}${/\+/.test(m.generic || '') ? ' <span class="pill-info">Combination</span>' : ''}</div></td>
    <td class="text-body-md capitalize">${esc(m.form || '—')} ${esc(m.strength || '')}</td>
    <td class="text-body-md">${esc(m.manufacturer || '—')}</td>
    <td>${m.schedule === 'OTC' ? '<span class="pill-neutral">OTC</span>' : `<span class="pill-info">Schedule ${esc(m.schedule)}</span>`}
      ${m.narcotic ? '<span class="pill-danger pill-dot">Narcotic</span>' : ''}</td>
    <td class="font-data-mono text-body-sm">${esc(m.rack || '—')}</td>
    <td class="num ${m.stock <= 0 ? 'text-danger font-bold' : m.low ? 'text-warning font-semibold' : ''}">${m.stock}
      <span class="text-label-sm text-on-surface-variant">/${m.reorder_level}</span></td>
    <td class="num">${m.mrp ? money(m.mrp, 2) : '—'}</td>
    <td class="text-body-sm ${soon ? 'text-warning font-semibold' : ''}">${m.next_expiry ? fmtDate(m.next_expiry) : '—'}</td>
    <td class="text-right"><button class="btn-secondary btn-xs" data-act="open">Open</button></td>`;
}

async function openMedicine(id, after) {
  const m = await api.get(`/pharmacy/medicines/${id}`);
  drawer({
    title: m.name, subtitle: `${esc(m.code)} · ${esc(compositionText(m))} · ${esc(m.form || '')}`,
    width: 'max-w-3xl',
    body: `<div class="p-5 space-y-5">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[{ label: 'Stock on hand', value: m.stock, icon: 'inventory_2', tone: m.stock <= m.reorder_level ? 'warning' : 'success' },
           { label: 'Batches', value: m.batches.length, icon: 'layers' },
           { label: 'Reorder level', value: m.reorder_level, icon: 'trending_down' },
           { label: 'GST', value: `${m.gst_pct}%`, icon: 'percent' }].map(kpi).join('')}
      </div>
      ${card({ title: 'Batches', pad: false, body: m.batches.length ? `<table class="tbl">
        <thead><tr><th>Batch</th><th>Expiry</th><th class="text-right">Qty</th><th class="text-right">Purchase</th>
          <th class="text-right">MRP</th><th>Supplier</th><th></th></tr></thead>
        <tbody>${m.batches.map((b) => {
          const days = Math.round((new Date(b.expiry) - Date.now()) / 864e5);
          return `<tr><td class="font-data-mono">${esc(b.batch_no)}</td>
            <td class="${days < 0 ? 'text-danger font-bold' : days < 90 ? 'text-warning font-semibold' : ''}">${fmtDate(b.expiry)}
              <span class="text-label-sm text-on-surface-variant">${days < 0 ? 'expired' : `${days}d`}</span></td>
            <td class="num">${b.qty}</td><td class="num">${money(b.purchase_rate, 2)}</td>
            <td class="num">${money(b.mrp, 2)}</td><td class="text-body-md">${esc(b.supplier_name || '—')}</td>
            <td class="text-right">${can('inventory.write') ? `<button class="btn-ghost btn-xs" data-adj="${b.id}">Adjust</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : `<p class="p-4 text-body-md text-on-surface-variant">No batches on record.</p>` })}
      ${card({ title: 'Recent stock movement', pad: false, body: m.moves.length ? `<table class="tbl">
        <thead><tr><th>When</th><th>Type</th><th class="text-right">Qty</th><th class="text-right">Balance</th><th>By</th><th>Reason</th></tr></thead>
        <tbody>${m.moves.slice(0, 25).map((s) => `<tr>
          <td class="text-body-sm">${esc(s.created_at)}</td><td class="capitalize">${esc(s.move_type)}</td>
          <td class="num ${s.qty < 0 ? 'text-danger' : 'text-success'}">${s.qty > 0 ? '+' : ''}${s.qty}</td>
          <td class="num">${s.balance_after ?? '—'}</td><td class="text-body-md">${esc(s.by_name || 'system')}</td>
          <td class="text-body-sm text-on-surface-variant">${esc(s.reason || s.ref_type || '')}</td></tr>`).join('')}
        </tbody></table>` : `<p class="p-4 text-body-md text-on-surface-variant">No movement recorded.</p>` })}
    </div>`,
    footer: can('inventory.write') ? `<button class="btn-secondary" data-close>Close</button>
      <button class="btn-primary" data-edit>Edit details</button>` : `<button class="btn-secondary" data-close>Close</button>`,
    onMount(root, close) {
      root.querySelector('[data-edit]')?.addEventListener('click', () => { close(); editMedicine(m, after); });
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-adj]');
        if (!b) return;
        const batch = m.batches.find((x) => x.id === +b.dataset.adj);
        adjustStock(batch, () => { close(); after(); });
      });
    },
  });
}

function adjustStock(batch, after) {
  modal({
    title: 'Adjust stock', subtitle: `Batch ${esc(batch.batch_no)} · current ${batch.qty}`, size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Change (negative to remove)</label><input class="field" type="number" data-q value="0"></div>
      <div><label class="field-label">Type</label><select class="field" data-t>
        <option value="adjust">Adjustment</option><option value="return">Return to supplier</option>
        <option value="expiry">Expiry write-off</option><option value="transfer">Transfer</option></select></div>
      <div><label class="field-label">Reason *</label><input class="field" data-r placeholder="Recorded in the stock ledger" required></div>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Post adjustment</button>`,
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const reason = root.querySelector('[data-r]').value.trim();
        if (!reason) { toast('A reason is required', 'warning'); return; }
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post('/pharmacy/stock/adjust', {
            batch_id: batch.id, qty: +root.querySelector('[data-q]').value,
            move_type: root.querySelector('[data-t]').value, reason,
          });
          close(); toast('Stock adjusted', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function editMedicine(m, after) {
  modal({
    title: m ? `Edit ${m.name}` : 'Add a medicine', size: 'lg',
    body: `<form data-mf class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="md:col-span-2"><label class="field-label">Brand name *</label><input class="field" name="name" required value="${esc(m?.name || '')}"></div>
      <div><label class="field-label">Code</label><input class="field" name="code" value="${esc(m?.code || '')}" ${m ? 'readonly' : ''}></div>
      <div><label class="field-label">Brand</label><input class="field" name="brand" value="${esc(m?.brand || '')}"></div>
      <div class="md:col-span-3">${compositionEditor(m || {})}</div>
      <div><label class="field-label">Form</label><select class="field" name="form">
        ${['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'ointment', 'cream', 'drops', 'inhaler', 'powder', 'consumable'].map((x) => `<option ${x === m?.form ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><label class="field-label">Schedule</label><select class="field" name="schedule">
        ${['OTC', 'H', 'H1', 'X'].map((x) => `<option ${x === m?.schedule ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><label class="field-label">Manufacturer</label><input class="field" name="manufacturer" value="${esc(m?.manufacturer || '')}"></div>
      <div><label class="field-label">HSN</label><input class="field" name="hsn" value="${esc(m?.hsn || '3004')}"></div>
      <div><label class="field-label">GST %</label><input class="field" name="gst_pct" type="number" value="${m?.gst_pct ?? 12}"></div>
      <div><label class="field-label">Rack</label><input class="field" name="rack" value="${esc(m?.rack || '')}"></div>
      <div><label class="field-label">Reorder level</label><input class="field" name="reorder_level" type="number" value="${m?.reorder_level ?? 50}"></div>
      <label class="flex items-center gap-2 text-body-lg md:col-span-2 mt-5">
        <input type="checkbox" name="narcotic" ${m?.narcotic ? 'checked' : ''}> Narcotic / controlled substance</label>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      const readComp = wireComposition(root);
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-mf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const body = Object.fromEntries(new FormData(form));
          body.narcotic = form.narcotic.checked ? 1 : 0;
          body.composition = readComp();
          if (m) await api.patch(`/pharmacy/medicines/${m.id}`, body);
          else await api.post('/pharmacy/medicines', body);
          close(); toast('Medicine saved', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
