/**
 * Stores & Materials — the general / maintenance store (everything that is not a medicine).
 * Every member of staff can request materials for their department and confirm what they received.
 * The store keeps the material master with QR labels, receives from suppliers, issues against requests,
 * and keeps stock honest with returns, transfers and counts. Issues are booked to the department's expense head.
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, toast, apiError, busy, bind, kpiRow, kpi, emptyState,
  money, fmtDate, fmtDateTime, modal, confirmDialog, pill, $, $$, state, departments, printDocument } from './_kit.js';
import { qrSVG } from '../qr.js';

const canView = () => can('stores.view') || can('stores.write');
const canWrite = () => can('stores.write');
let META = null;
const meta = async () => (META ||= await api.get('/stores/meta'));
const qtyText = (q, unit) => `${+(+q).toFixed(3)} ${esc(unit || '')}`;
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;
/** Labels must open on a phone: when this screen runs on the server PC (localhost), print the LAN address instead. */
const labelOrigin = () => {
  if (!LOCAL.test(location.hostname) || !META?.lan_host) return location.origin;
  const host = META.lan_host.includes(':') ? META.lan_host : `${META.lan_host}${location.port ? `:${location.port}` : ''}`;
  return `${location.protocol}//${host}`;
};
export const scanUrl = (code) => `${labelOrigin()}/scan?c=${encodeURIComponent(code)}`;

export async function mount(ctx) {
  await meta();
  let tab = ctx.query?.tab || 'requests', items = [], requests = [];
  const root = mountPage(ctx, page({
    eyebrow: `${eyebrow('Stores', 'handyman')} ${liveChip()}`,
    title: 'Stores & materials',
    subtitle: canView() ? 'Material master with QR labels, receipts from suppliers, issues to departments, and stock you can count.'
      : 'Ask the store for what your department needs, and confirm when it arrives.',
    actions: `<button class="btn-secondary" data-scan><span class="material-symbols-outlined text-[18px]">qr_code_scanner</span>Scan a label</button>
      <button class="btn-${canWrite() ? 'secondary' : 'primary'}" data-request><span class="material-symbols-outlined text-[18px]">add_shopping_cart</span>Request materials</button>
      ${canWrite() ? `<button class="btn-secondary" data-receive><span class="material-symbols-outlined text-[18px]">move_to_inbox</span>Receive goods</button>
        <button class="btn-primary" data-add><span class="material-symbols-outlined text-[18px]">add</span>New item</button>` : ''}`,
    body: `${canView() ? kpiRow([], 4) : ''}
      ${canView() ? `<div class="flex gap-1 mb-3" role="tablist">${[['requests', 'Requests'], ['items', 'Items & stock'], ['moves', 'Movements']]
        .map(([k, l]) => `<button class="btn-${k === tab ? 'primary' : 'secondary'} btn-sm" role="tab" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}
      <div data-body></div>`,
  }));

  async function load() {
    const jobs = [api.get('/stores/requests'), canView() ? api.get('/stores/items?all=1') : Promise.resolve([])];
    if (canView()) jobs.push(api.get('/stores/valuation'));
    const [rq, it, val] = await Promise.all(jobs);
    requests = rq; items = it;
    if (canView()) {
      const open = requests.filter((r) => ['pending', 'partly_issued'].includes(r.status)).length;
      $('[data-kpis]', root).innerHTML = [
        { label: 'Open requests', value: open, icon: 'pending_actions', tone: open ? 'warning' : 'success', sub: `${requests.filter((r) => r.priority === 'urgent' && r.status === 'pending').length} urgent` },
        { label: 'Items', value: val.items, icon: 'inventory_2', tone: 'info', sub: 'In the material master' },
        { label: 'Low stock', value: val.low_stock, icon: 'production_quantity_limits', tone: val.low_stock ? 'danger' : 'success', sub: 'At or below reorder level' },
        { label: 'Stock value', value: money(val.stock_value), icon: 'account_balance', tone: Math.abs(val.difference) > 1 ? 'warning' : 'neutral', sub: Math.abs(val.difference) > 1 ? `Books differ by ${money(val.difference, 2)}` : 'Matches the books' },
      ].map(kpi).join('');
    }
    paint();
  }

  function paint() {
    $$('[data-tab]', root).forEach((b) => { b.className = `btn-${b.dataset.tab === tab ? 'primary' : 'secondary'} btn-sm`; });
    const body = $('[data-body]', root);
    if (tab === 'items' && canView()) body.innerHTML = itemsCard(items);
    else if (tab === 'moves' && canView()) { body.innerHTML = card({ title: 'Movements', subtitle: 'Last 500', pad: false, body: '<div data-moves class="p-4 text-body-sm">Loading…</div>' }); loadMoves(); }
    else body.innerHTML = requestsCard(requests);
  }
  async function loadMoves() {
    const rows = await api.get('/stores/moves');
    const el = $('[data-moves]', root); if (!el) return;
    el.outerHTML = rows.length ? `<div class="overflow-auto max-h-[62vh]"><table class="tbl"><thead><tr><th>When</th><th>Ref</th><th>Item</th><th>Store</th><th>Type</th><th class="text-right">Qty</th><th class="text-right">Value</th><th>To / from</th><th>By</th></tr></thead><tbody>
      ${rows.map((m) => `<tr><td class="text-body-sm">${fmtDateTime(m.created_at)}</td><td class="font-data-mono text-body-sm">${esc(m.move_no)}${m.reference ? `<div class="text-label-sm text-on-surface-variant">${esc(m.reference)}</div>` : ''}</td>
        <td class="text-body-md">${esc(m.name)}<div class="text-label-sm text-on-surface-variant">${esc(m.code)}</div></td><td>${esc(m.store)}</td><td>${pill(m.move_type, m.move_type.replace('_', ' '))}</td>
        <td class="num ${m.qty < 0 ? 'text-danger' : 'text-success'}">${m.qty > 0 ? '+' : ''}${qtyText(m.qty, m.unit)}</td><td class="num">${money(m.value, 2)}</td>
        <td class="text-body-sm">${esc(m.department_name || m.supplier_name || '')}${m.reason ? `<div class="text-label-sm text-on-surface-variant">${esc(m.reason)}</div>` : ''}</td><td class="text-body-sm">${esc(m.by_name || '')}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="p-4">${emptyState('swap_vert', 'No movements yet', 'Receive goods to start.')}</div>`;
  }

  bind(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; paint(); });
  bind(root, 'click', '[data-request]', () => requestMaterials(null, load));
  bind(root, 'click', '[data-add]', () => editItem(null, load));
  bind(root, 'click', '[data-receive]', () => receiveGoods(load));
  bind(root, 'click', '[data-scan]', () => import('../router.js').then(({ navigate }) => navigate('/scan')));
  bind(root, 'click', '[data-item-act]', (e, b) => {
    const it = items.find((x) => x.id === +b.closest('tr').dataset.id);
    const act = b.dataset.itemAct;
    if (act === 'edit') editItem(it, load);
    if (act === 'label') printLabels([it]);
    if (act === 'count') countItem(it, load);
    if (act === 'transfer') transferItem(it, load);
    if (act === 'return') returnItem(it, load);
  });
  bind(root, 'click', '[data-labels-all]', () => {
    const picked = $$('[data-pick]:checked', root).map((x) => items.find((i) => i.id === +x.value));
    printLabels(picked.length ? picked : items.filter((i) => i.active));
  });
  bind(root, 'click', '[data-req-act]', async (e, b) => {
    const r = requests.find((x) => x.id === +b.closest('[data-rid]').dataset.rid);
    const act = b.dataset.reqAct;
    try {
      if (act === 'issue') issueRequest(r, load);
      if (act === 'reject') { const c = await confirmDialog({ title: `Reject ${r.request_no}?`, message: 'The department is told why.', confirmLabel: 'Reject', tone: 'danger', requireReason: true }); if (c) { await api.post(`/stores/requests/${r.id}/reject`, { reason: c.reason }); toast('Rejected', 'success'); load(); } }
      if (act === 'cancel') { const c = await confirmDialog({ title: `Cancel ${r.request_no}?`, confirmLabel: 'Cancel request' }); if (c) { await api.post(`/stores/requests/${r.id}/cancel`, {}); toast('Cancelled', 'success'); load(); } }
      if (act === 'received') { await api.post(`/stores/requests/${r.id}/received`, {}); toast('Receipt confirmed', 'success'); load(); }
    } catch (err) { apiError(err); }
  });

  return live({ topics: ['stores'], events: ['store.updated', 'store.request'], load, interval: 120000 });
}

function requestsCard(rows) {
  const mineOnly = !canView();
  return card({ title: mineOnly ? 'Your department\'s requests' : 'Material requests', subtitle: 'Open first', pad: false,
    body: rows.length ? `<div class="overflow-auto max-h-[62vh]"><table class="tbl"><thead><tr><th>Request</th><th>Department</th><th>Items (issued / asked)</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-rid="${r.id}"><td class="font-data-mono">${esc(r.request_no)}${r.priority === 'urgent' ? ' <span class="pill-danger">Urgent</span>' : ''}
          <div class="text-label-sm text-on-surface-variant font-sans">${fmtDateTime(r.requested_at)} · ${esc(r.requested_by_name || '')}</div></td>
        <td class="text-body-md">${esc(r.department_name || '')}${r.purpose ? `<div class="text-label-sm text-on-surface-variant">${esc(r.purpose)}</div>` : ''}</td>
        <td class="text-body-sm">${r.lines.map((l) => `${esc(l.name)} <span class="font-data-mono">${+l.issued_qty}/${+l.qty}</span> ${esc(l.unit)}`).join('<br>')}</td>
        <td>${pill(r.status, r.status.replace('_', ' '))}${r.received_at ? `<div class="text-label-sm text-success mt-0.5">Received ${fmtDate(r.received_at)}</div>` : ''}
          ${r.decision_note ? `<div class="text-label-sm text-on-surface-variant">${esc(r.decision_note)}</div>` : ''}</td>
        <td class="text-right whitespace-nowrap">
          ${canWrite() && ['pending', 'partly_issued'].includes(r.status) ? '<button class="btn-primary btn-xs" data-req-act="issue">Issue</button>' : ''}
          ${canWrite() && r.status === 'pending' ? '<button class="btn-ghost btn-xs" data-req-act="reject">Reject</button>' : ''}
          ${r.status === 'pending' && r.requested_by === state.user?.id ? '<button class="btn-ghost btn-xs" data-req-act="cancel">Cancel</button>' : ''}
          ${['issued', 'partly_issued'].includes(r.status) && !r.received_at && (r.requested_by === state.user?.id || r.department_id === state.user?.department_id) ? '<button class="btn-secondary btn-xs" data-req-act="received">Confirm received</button>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="p-4">${emptyState('handyman', 'No requests', mineOnly ? 'Use “Request materials” to ask the store.' : 'Department requests appear here as they are raised.')}</div>` });
}

function itemsCard(rows) {
  return card({ title: 'Items & stock', subtitle: 'Stock per store at average cost. Tick items to print their labels.', pad: false,
    actions: '<button class="btn-secondary btn-xs" data-labels-all><span class="material-symbols-outlined text-[16px]">qr_code_2</span>Print labels</button>',
    body: rows.length ? `<div class="overflow-auto max-h-[62vh]"><table class="tbl"><thead><tr><th></th><th>Code</th><th>Item</th><th>Stock by store</th><th class="text-right">Total</th><th class="text-right">Avg cost</th><th class="text-right">Value</th><th></th></tr></thead><tbody>
      ${rows.map((i) => `<tr data-id="${i.id}" class="${i.active ? '' : 'opacity-60'}"><td><input type="checkbox" data-pick value="${i.id}" aria-label="Select ${esc(i.name)}"></td>
        <td class="font-data-mono">${esc(i.code)}</td>
        <td class="text-body-md">${esc(i.name)} ${i.low ? '<span class="pill-danger">Low</span>' : ''}${i.active ? '' : ' <span class="pill-neutral">Inactive</span>'}
          <div class="text-label-sm text-on-surface-variant">${esc(i.category_name)}${i.location_bin ? ` · bin ${esc(i.location_bin)}` : ''}${i.reorder_level ? ` · reorder at ${i.reorder_level}` : ''}</div></td>
        <td class="text-body-sm">${i.stock.map((s) => `${esc(s.store)} <span class="font-data-mono">${+(+s.qty).toFixed(3)}</span>`).join(' · ') || '—'}</td>
        <td class="num">${qtyText(i.qty, i.unit)}</td><td class="num">${money(i.avg_cost, 2)}</td><td class="num">${money(i.value, 2)}</td>
        <td class="text-right whitespace-nowrap"><button class="btn-ghost btn-xs" data-item-act="label">Label</button>
          ${canWrite() ? `<button class="btn-ghost btn-xs" data-item-act="count">Count</button><button class="btn-ghost btn-xs" data-item-act="transfer">Transfer</button>
            <button class="btn-ghost btn-xs" data-item-act="return">Return</button><button class="btn-ghost btn-xs" data-item-act="edit">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="p-4">${emptyState('inventory_2', 'No items yet', 'Add the materials the store keeps — each gets a code and a QR label.')}</div>` });
}

/* ------------------------------------------------------------------ dialogs */

const storeSelect = (name = 'store', sel = 'MAIN') => `<select class="field" name="${name}">${Object.entries(META.stores).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const deptSelect = (sel) => `<select class="field" name="department_id" required><option value="">Choose…</option>${departments().map((d) => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;

/** A line editor: pick items from a datalist, set qty (and rate / GST for receipts). */
function lineEditor(root, list, { withRate = false } = {}) {
  const rows = [];
  const paint = () => {
    root.querySelector('[data-lines]').innerHTML = rows.map((r, i) => `<tr><td class="text-body-md">${esc(r.name)} <span class="text-label-sm text-on-surface-variant">${esc(r.code)}</span></td>
      <td><input class="field field-sm !w-24 text-right" type="number" min="0" step="any" value="${r.qty}" data-lq="${i}" aria-label="Quantity"></td>
      ${withRate ? `<td><input class="field field-sm !w-28 text-right" type="number" min="0" step="0.01" value="${r.rate}" data-lr="${i}" aria-label="Rate"></td>
        <td><select class="field field-sm" data-lg="${i}" aria-label="GST">${[0, 5, 12, 18, 28].map((g) => `<option ${g === r.gst_pct ? 'selected' : ''}>${g}</option>`).join('')}</select></td>` : ''}
      <td class="text-right"><button type="button" class="btn-ghost btn-xs" data-lrm="${i}">Remove</button></td></tr>`).join('')
      || `<tr><td colspan="5" class="text-body-sm text-on-surface-variant py-2">Add the items.</td></tr>`;
  };
  rows.add = (it) => { if (!rows.find((r) => r.item_id === it.id)) rows.push({ item_id: it.id, name: it.name, code: it.code, qty: 1, rate: it.last_rate || 0, gst_pct: 18 }); paint(); };
  root.querySelector('[data-ladd]').onclick = () => {
    const v = root.querySelector('[data-lfind]').value.trim();
    const it = list.find((x) => `${x.name} (${x.code})` === v || x.code === v.toUpperCase());
    if (!it) { toast('Pick an item from the list', 'warning'); return; }
    root.querySelector('[data-lfind]').value = ''; rows.add(it);
  };
  root.addEventListener('click', (e) => { const rm = e.target.closest('[data-lrm]'); if (rm) { rows.splice(+rm.dataset.lrm, 1); paint(); } });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-lq]')) rows[+t.dataset.lq].qty = Number(t.value) || 0;
    if (t.matches('[data-lr]')) rows[+t.dataset.lr].rate = Number(t.value) || 0;
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-lg]')) rows[+e.target.dataset.lg].gst_pct = +e.target.value; });
  paint();
  return rows;
}
const lineFinder = (list) => `<div class="flex gap-2 items-end"><div class="flex-1"><label class="field-label">Add an item</label>
  <input class="field" data-lfind list="st-items" placeholder="Type a name or code"><datalist id="st-items">${list.map((i) => `<option value="${esc(i.name)} (${esc(i.code)})">`).join('')}</datalist></div>
  <button type="button" class="btn-secondary" data-ladd>Add</button></div>`;

export async function requestMaterials(preset, after = () => {}) {
  await meta();
  let list;
  try { list = await api.get('/stores/items'); } catch (e) { apiError(e); return; }
  modal({
    title: 'Request materials', subtitle: 'The store is notified at once; you confirm when it arrives.', size: 'lg',
    body: `<form data-f class="space-y-3"><div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label class="field-label">For department *</label>${deptSelect(state.user?.department_id)}</div>
        <div><label class="field-label">Priority</label><select class="field" name="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
        <div><label class="field-label">Purpose / location</label><input class="field" name="purpose" placeholder="e.g. Ward 2 corridor light"></div></div>
      ${lineFinder(list)}<table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th></th></tr></thead><tbody data-lines></tbody></table></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Send request</button>',
    onMount(root, close) {
      const rows = lineEditor(root, list);
      const pre = preset && list.find((x) => x.id === preset.id);
      if (pre) rows.add(pre);
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        const items = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item_id, qty: r.qty }));
        if (!items.length) { toast('Add what you need', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { const r = await api.post('/stores/requests', { ...Object.fromEntries(new FormData(form)), items }); close(); toast(`${r.request_no} sent to the store`, 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

function editItem(it, after) {
  it = it || { category: 'general', unit: 'nos', reorder_level: 0, active: 1 };
  const f = (name, label, type = 'text', extra = '') => `<div><label class="field-label">${label}</label><input class="field" name="${name}" type="${type}" value="${esc(it[name] ?? '')}" ${extra}></div>`;
  modal({
    title: it.id ? `Edit ${it.code}` : 'New store item', subtitle: it.id ? '' : 'A code and QR label are created for it.', size: 'md',
    body: `<form data-f class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="md:col-span-2">${f('name', 'Name *', 'text', 'required')}</div>
      <div><label class="field-label">Category</label><select class="field" name="category">${Object.entries(META.categories).map(([k, l]) => `<option value="${k}" ${k === it.category ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div><label class="field-label">Unit</label><select class="field" name="unit">${META.units.map((u) => `<option ${u === it.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      ${f('reorder_level', 'Reorder level', 'number', 'min="0" step="any"')}${f('location_bin', 'Rack / bin')}
      <div class="md:col-span-2">${f('spec', 'Specification (size, rating, make)')}</div>
      ${it.id ? `<label class="flex items-center gap-2 text-body-md md:col-span-2"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> Active</label>` : ''}
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        const b = Object.fromEntries(new FormData(form));
        if (it.id) b.active = form.active.checked;
        busy(ev.currentTarget, true);
        try { const r = it.id ? await api.patch(`/stores/items/${it.id}`, b) : await api.post('/stores/items', b); close(); toast(`${r.code} saved`, 'success'); after(); if (!it.id) printLabels([r]); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

async function receiveGoods(after) {
  let list, sups;
  try { [list, sups] = await Promise.all([api.get('/stores/items'), api.get('/stores/suppliers')]); } catch (e) { apiError(e); return; }
  if (!sups.length) { toast('Add the supplier first (Pharmacy → Suppliers)', 'warning'); return; }
  modal({
    title: 'Receive goods into a store', subtitle: 'Stock and average cost update; the supplier is owed the invoice total.', size: 'xl',
    body: `<form data-f class="space-y-3"><div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div><label class="field-label">Supplier *</label><select class="field" name="supplier_id" required>${sups.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div><label class="field-label">Into store</label>${storeSelect()}</div>
        <div><label class="field-label">Invoice no.</label><input class="field" name="invoice_no"></div>
        <div><label class="field-label">Invoice date</label><input class="field" type="date" name="invoice_date"></div></div>
      ${lineFinder(list)}<table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Rate (₹, before GST)</th><th>GST %</th><th></th></tr></thead><tbody data-lines></tbody></table>
      <div class="text-body-md text-right" data-total></div></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Receive</button>',
    onMount(root, close) {
      const rows = lineEditor(root, list, { withRate: true });
      const total = () => { const v = rows.reduce((s, r) => s + r.qty * r.rate * (1 + r.gst_pct / 100), 0); root.querySelector('[data-total]').textContent = `Invoice total ${money(v, 2)}`; };
      root.addEventListener('input', total); root.addEventListener('change', total); root.addEventListener('click', () => setTimeout(total));
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        const items = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item_id, qty: r.qty, rate: r.rate, gst_pct: r.gst_pct }));
        if (!items.length) { toast('Add the items received', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { const r = await api.post('/stores/receipts', { ...Object.fromEntries(new FormData(form)), items }); close(); toast(`${r.receipt_no} — ${money(r.total, 2)} received`, 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

async function issueRequest(r, after) {
  let list;
  try { list = await api.get('/stores/items?all=1'); } catch (e) { apiError(e); return; }
  const avail = (id, st) => list.find((i) => i.id === id)?.stock.find((s) => s.store === st)?.qty || 0;
  modal({
    title: `Issue ${r.request_no}`, subtitle: `${r.department_name}${r.purpose ? ` · ${r.purpose}` : ''}`, size: 'lg',
    body: `<form data-f class="space-y-3"><div class="grid grid-cols-2 gap-3"><div><label class="field-label">From store</label>${storeSelect('store', r.store)}</div>
        <div><label class="field-label">Handed to</label><input class="field" name="issued_to" placeholder="Name of the person collecting"></div></div>
      <table class="tbl"><thead><tr><th>Item</th><th class="text-right">Pending</th><th class="text-right">In this store</th><th>Issue now</th></tr></thead><tbody data-ilines></tbody></table></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Issue</button>',
    onMount(root, close) {
      const form = root.querySelector('[data-f]');
      const paint = () => {
        const st = form.store.value;
        root.querySelector('[data-ilines]').innerHTML = r.lines.map((l) => { const pend = +(l.qty - l.issued_qty).toFixed(3), have = avail(l.item_id, st);
          return `<tr><td class="text-body-md">${esc(l.name)} <span class="text-label-sm text-on-surface-variant">${esc(l.code)}</span></td><td class="num">${pend} ${esc(l.unit)}</td>
            <td class="num ${have < pend ? 'text-danger' : ''}">${+(+have).toFixed(3)}</td>
            <td><input class="field field-sm !w-24 text-right" type="number" min="0" step="any" max="${pend}" value="${Math.max(0, Math.min(pend, have))}" data-iq="${l.item_id}" aria-label="Issue quantity"></td></tr>`; }).join('');
      };
      paint(); form.store.onchange = paint;
      root.querySelector('[data-save]').onclick = async (ev) => {
        const items = $$('[data-iq]', root).map((x) => ({ item_id: +x.dataset.iq, qty: Number(x.value) || 0 })).filter((x) => x.qty > 0);
        if (!items.length) { toast('Nothing to issue', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { const res = await api.post('/stores/issues', { request_id: r.id, store: form.store.value, issued_to: form.issued_to.value, items }); close(); toast(`Issued — ${res.status === 'issued' ? 'request complete' : 'part issued'}`, 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

/** Direct issue (no request): from the scan page. */
export function directIssue(it, after = () => {}) {
  modal({
    title: `Issue ${it.name}`, subtitle: `${it.code} · a direct issue needs a reason`, size: 'md',
    body: `<form data-f class="grid grid-cols-2 gap-3"><div><label class="field-label">From store</label>${storeSelect('store', it.stock?.[0]?.store || 'MAIN')}</div>
      <div><label class="field-label">Quantity *</label><input class="field" type="number" name="qty" min="0.001" step="any" value="1" required></div>
      <div class="col-span-2"><label class="field-label">To department *</label>${deptSelect(null)}</div>
      <div class="col-span-2"><label class="field-label">Reason / job *</label><input class="field" name="reason" required placeholder="e.g. Breakdown repair, OT-2 light"></div>
      <div class="col-span-2"><label class="field-label">Handed to</label><input class="field" name="issued_to"></div></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Issue</button>',
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        const b = Object.fromEntries(new FormData(form));
        busy(ev.currentTarget, true);
        try { await api.post('/stores/issues', { store: b.store, department_id: b.department_id, reason: b.reason, issued_to: b.issued_to, items: [{ item_id: it.id, qty: Number(b.qty) }] }); close(); toast('Issued', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

export function countItem(it, after = () => {}) {
  modal({
    title: `Count ${it.name}`, subtitle: `${it.code} · differences are written off (or found) at average cost`, size: 'sm',
    body: `<form data-f class="space-y-3"><div><label class="field-label">Store</label>${storeSelect('store', it.stock?.[0]?.store || 'MAIN')}</div>
      <div><label class="field-label">Counted quantity *</label><input class="field" type="number" name="counted" min="0" step="any" required></div>
      <div><label class="field-label">Reason *</label><input class="field" name="reason" required placeholder="Monthly count / damaged / found"></div>
      <p class="text-body-sm text-on-surface-variant" data-was></p></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save count</button>',
    onMount(root, close) {
      const form = root.querySelector('[data-f]');
      const was = () => { root.querySelector('[data-was]').textContent = `System quantity: ${+(it.stock?.find((s) => s.store === form.store.value)?.qty || 0).toFixed(3)} ${it.unit}`; };
      was(); form.store.onchange = was;
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!form.reportValidity()) return;
        busy(ev.currentTarget, true);
        try { const r = await api.post('/stores/counts', { ...Object.fromEntries(new FormData(form)), item_id: it.id }); close(); toast(r.diff ? `Adjusted by ${r.diff}` : 'Count matches', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

function transferItem(it, after) {
  modal({
    title: `Move ${it.name} between stores`, size: 'sm',
    body: `<form data-f class="space-y-3"><div class="grid grid-cols-2 gap-3"><div><label class="field-label">From</label>${storeSelect('from', it.stock?.[0]?.store || 'MAIN')}</div><div><label class="field-label">To</label>${storeSelect('to', 'ELEC')}</div></div>
      <div><label class="field-label">Quantity *</label><input class="field" type="number" name="qty" min="0.001" step="any" required></div>
      <div><label class="field-label">Reason</label><input class="field" name="reason"></div></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Move</button>',
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        busy(ev.currentTarget, true);
        try { const r = await api.post('/stores/transfers', { ...Object.fromEntries(new FormData(form)), item_id: it.id }); close(); toast(`${r.reference} — moved`, 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

function returnItem(it, after) {
  modal({
    title: `Return ${it.name} from a department`, subtitle: 'Back into stock; the department\'s expense is reduced.', size: 'sm',
    body: `<form data-f class="space-y-3"><div><label class="field-label">From department *</label>${deptSelect(null)}</div>
      <div class="grid grid-cols-2 gap-3"><div><label class="field-label">Into store</label>${storeSelect()}</div><div><label class="field-label">Quantity *</label><input class="field" type="number" name="qty" min="0.001" step="any" required></div></div>
      <div><label class="field-label">Reason *</label><input class="field" name="reason" required placeholder="Unused / wrong size"></div></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Take back</button>',
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        busy(ev.currentTarget, true);
        try { await api.post('/stores/returns', { ...Object.fromEntries(new FormData(form)), item_id: it.id }); close(); toast('Returned to stock', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

/** QR labels: 3 per row, each opens /scan for that item on any phone camera. */
export async function printLabels(list) {
  if (!list.length) { toast('No items to label', 'warning'); return; }
  await meta();
  if (LOCAL.test(new URL(labelOrigin()).hostname)) toast('These labels point at localhost, which phones cannot open. Set the LAN address in Hospital Settings, or print from another computer.', 'warning', { timeout: 10000 });
  const hospital = state.meta?.settings?.hospital_name || 'MGM HMS';
  printDocument('Store labels', `<style>.lbls{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.lbl{border:1px dashed #999;padding:8px;display:flex;gap:8px;align-items:center;break-inside:avoid}
      .lbl b{font-size:13px;display:block}.lbl small{font-size:10px;color:#444;display:block}.lbl code{font-size:12px;font-weight:700}</style>
    <div class="lbls">${list.map((i) => `<div class="lbl">${qrSVG(scanUrl(i.code), { size: 96 })}<div><code>${esc(i.code)}</code><b>${esc(i.name)}</b>
      <small>${esc(i.spec || i.category_name || '')}</small>${i.location_bin ? `<small>Bin ${esc(i.location_bin)}</small>` : ''}<small>${esc(hospital)} · scan to view / request</small></div></div>`).join('')}</div>`);
}
