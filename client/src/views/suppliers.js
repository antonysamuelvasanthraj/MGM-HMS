/** Suppliers & vendor accounts. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  apiError, busy, api, qs, can, downloadCSV, compactMoney,
  $, $$, esc, bind, toast, modal, renderRows, money, fmtDate, kpi, card,
} from './_kit.js';

let f = { q: '' };
let cache = [];
let stockSummary = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const rows = await api.get(`/pharmacy/suppliers${qs(f)}`);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Suppliers', value: rows.length, icon: 'store', sub: `${rows.filter((r) => r.active).length} active` },
      { label: 'Total purchased', value: compactMoney(rows.reduce((s, r) => s + r.purchase_value, 0)), icon: 'local_shipping', sub: 'Lifetime' },
      { label: 'Outstanding payable', value: compactMoney(rows.reduce((s, r) => s + r.outstanding, 0)), icon: 'account_balance', tone: 'warning', sub: 'Across all vendors' },
      { label: 'Receipts recorded', value: rows.reduce((s, r) => s + r.grn_count, 0), icon: 'receipt', sub: 'Goods received notes' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No suppliers on file.' });
    $('[data-count]', root).textContent = `${rows.length} supplier(s)`;
    if (can('inventory.view')) {
      const summary = await api.get('/pharmacy/supplier-stock-summary');
      stockSummary = summary.filter(s => rows.some(r => r.id === s.id)).map((s, i) => ({
        'SL No': i + 1, 'Supplier Name': s.supplier_name, 'No. of Products': s.products,
        'Products in Stock': s.products_in_stock, 'No. of Batches': s.batches,
        'Stock Value @ Cost': s.cost_value, 'Stock Value @ Selling Price': s.selling_value,
        'Expected Profit': Math.round((s.selling_value - s.cost_value) * 100) / 100,
        'Margin %': s.selling_value ? Math.round((s.selling_value - s.cost_value) / s.selling_value * 10000) / 100 : 0,
        'Expired Stock @ Cost': s.expired_cost,
      }));
      const headings = ['SL No','Supplier Name','No. of Products','Products in Stock','No. of Batches','Stock Value @ Cost','Stock Value @ Selling Price','Expected Profit','Margin %','Expired Stock @ Cost'];
      root.querySelector('[data-supplier-stock]').innerHTML = `<table class="tbl"><thead><tr>${headings.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${stockSummary.map(s=>`<tr>${headings.map((h,i)=>`<td>${i===1 ? esc(s[h]) : i>=5 && i!==8 ? money(s[h],2) : esc(s[h])}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="10">No suppliers match this filter.</td></tr>'}</tbody></table>`;
    }
  }

  bind(root, 'click', '[data-act="edit"]', (e, b) => editSupplier(cache.find((x) => x.id === +b.closest('tr').dataset.id), load));
  bind(root, 'click', '[data-new]', () => editSupplier(null, load));
  bind(root, 'click', '[data-export]', () => downloadCSV('suppliers.csv', cache));
  bind(root, 'click', '[data-stock-export]', () => downloadCSV('supplier-stock-summary.csv', stockSummary));

  return live({ topics: ['inventory'], events: ['supplier.saved', 'purchase.received', 'stock.changed', 'pharmacy.dispensed'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Vendor accounts', 'store')} ${liveChip()}`,
    title: 'Suppliers & Vendors',
    subtitle: 'Vendor master with credit terms, statutory identifiers and the running payable.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('supplier.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> Add supplier</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'search', key: 'q', label: 'Find', placeholder: 'Supplier name or code' }])}
      ${can('inventory.view') ? card({ title: 'Supplier stock summary', subtitle: 'Remaining batches linked to each supplier. Margin = (selling value − inventory cost) / selling value. Includes expired stock; profit is an estimate before tax reconciliation.', actions: '<button class="btn-secondary" data-stock-export>Export stock summary</button>', body: '<div class="overflow-auto" data-supplier-stock></div>' }) : ''}
      ${tableCard({
        title: 'Vendor directory', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Code', width: '90px' }, { label: 'Supplier' }, { label: 'Contact' },
          { label: 'GSTIN / DL' }, { label: 'Credit', cls: 'text-right' },
          { label: 'Purchased', cls: 'text-right' }, { label: 'Outstanding', cls: 'text-right' },
          { label: 'Last supply' }, { label: '', width: '80px' }],
      })}`,
  });
}

function rowHTML(s) {
  return `
    <td class="font-data-mono text-body-sm">${esc(s.code)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(s.name)} ${!s.active?'<span class="pill-neutral">Inactive</span>':''}</div>
      <div class="text-label-sm text-on-surface-variant truncate max-w-[220px]">${esc(s.address || '')}</div></td>
    <td><div class="text-body-md">${esc(s.contact || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(s.mobile || '')}</div></td>
    <td><div class="font-data-mono text-label-sm">${esc(s.gstin || '—')}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(s.dl_no || '')}</div></td>
    <td class="num">${s.credit_days}d</td>
    <td class="num">${money(s.purchase_value)}</td>
    <td class="num ${s.outstanding > 0 ? 'text-warning font-semibold' : 'text-on-surface-variant'}">${money(s.outstanding)}</td>
    <td class="text-body-sm">${s.last_supply ? fmtDate(s.last_supply) : '—'}</td>
    <td class="text-right"><button class="btn-secondary btn-xs" data-act="edit">Edit</button></td>`;
}

function editSupplier(s, after) {
  modal({
    title: s ? `Edit ${s.name}` : 'Add a supplier', size: 'md',
    body: `<form data-sf class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="md:col-span-2"><label class="field-label">Name *</label><input class="field" name="name" required value="${esc(s?.name || '')}"></div>
      <div><label class="field-label">Code</label><input class="field" name="code" value="${esc(s?.code || '')}" ${s ? 'readonly' : ''}></div>
      <div><label class="field-label">Contact person</label><input class="field" name="contact" value="${esc(s?.contact || '')}"></div>
      <div><label class="field-label">Mobile</label><input class="field" name="mobile" value="${esc(s?.mobile || '')}"></div>
      <div><label class="field-label">Email</label><input class="field" name="email" value="${esc(s?.email || '')}"></div>
      <div><label class="field-label">GSTIN</label><input class="field" name="gstin" value="${esc(s?.gstin || '')}"></div>
      <div><label class="field-label">Drug licence</label><input class="field" name="dl_no" value="${esc(s?.dl_no || '')}"></div>
      <div class="md:col-span-2"><label class="field-label">Address</label><input class="field" name="address" value="${esc(s?.address || '')}"></div>
      <div><label class="field-label">Credit days</label><input class="field" type="number" name="credit_days" value="${s?.credit_days ?? 30}"></div>
      ${s ? `<label class="md:col-span-2 flex gap-2"><input type="checkbox" name="active" ${s.active?'checked':''}> Active supplier (available for new purchases)</label>` : ''}
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save supplier</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-sf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const body = Object.fromEntries(new FormData(form));
          if (s) { body.id = s.id; body.active = form.active.checked; }
          await api.post('/pharmacy/suppliers', body);
          close(); toast('Supplier saved', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
