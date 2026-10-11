/**
 * Maintenance & assets. Everyone can report a fault; the maintenance team keeps the equipment
 * register (warranty, AMC, service dates) and works the tickets: open → assigned → in progress →
 * resolved → closed. In-charges and management see the whole picture read-only.
 */
import {
  page, eyebrow, liveChip, kpiRow, kpi, card, mountPage, api, qs, can, state, esc, bind, fmtDate, fmtDateTime,
  money, modal, toast, busy, apiError, live, pill, emptyState,
} from './_kit.js';

const STATUS_LABEL = { active: 'Active', maintenance: 'Under maintenance', out_of_service: 'Out of service', retired: 'Retired',
  open: 'Open', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
const TONE = { active: 'pill-success', maintenance: 'pill-warning', out_of_service: 'pill-danger', retired: 'pill-neutral',
  open: 'pill-danger', assigned: 'pill-warning', in_progress: 'pill-info', resolved: 'pill-success', closed: 'pill-neutral',
  critical: 'pill-danger', high: 'pill-warning', normal: 'pill-info', low: 'pill-neutral' };
const tag = (s) => `<span class="${TONE[s] || 'pill-neutral'} pill-dot">${esc(STATUS_LABEL[s] || s)}</span>`;
const NEXT = { open: ['assigned', 'in_progress'], assigned: ['in_progress', 'resolved'], in_progress: ['resolved'], resolved: ['closed', 'in_progress'], closed: [] };

export async function mount(ctx) {
  const manage = can('maintenance.write'), viewAll = manage || can('maintenance.view');
  const tabs = [['tickets', viewAll ? 'Tickets' : 'My tickets'], ...(viewAll ? [['assets', 'Asset register']] : [])];
  const f = { tab: tabs.some(([k]) => k === ctx.query.tab) ? ctx.query.tab : 'tickets', status: 'open', q: '' };
  let summary = { assets: {}, tickets: {}, types: [] };
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Facilities', 'build')} ${liveChip()}`, title: 'Maintenance & Assets',
    subtitle: 'Report a fault from any department. The maintenance team assigns, repairs and closes it; the equipment register keeps warranty, AMC and service dates.',
    actions: `<button class="btn-primary" data-raise><span class="material-symbols-outlined text-[18px]">report</span>Report a fault</button>
      ${manage ? '<button class="btn-secondary" data-new-asset><span class="material-symbols-outlined text-[18px]">add</span>Add asset</button>' : ''}`,
    body: `${viewAll ? kpiRow([], 4) : ''}
      <div class="flex flex-wrap items-center gap-2"><div class="inline-flex p-0.5 rounded bg-surface-container" role="tablist">
        ${tabs.map(([k, l]) => `<button data-tab="${k}" role="tab" class="px-3 h-8 rounded font-label-md text-label-md">${l}</button>`).join('')}</div>
        <select class="field field-sm !h-8 w-auto" data-status></select>
        <input class="field field-sm !h-8 w-56" data-q placeholder="Search code, name, location, vendor"></div>
      <div data-list></div>`,
  }));

  async function load() {
    summary = await api.get('/maintenance/summary');
    if (viewAll) {
      const a = summary.assets || {}, t = summary.tickets || {};
      root.querySelector('[data-kpis]').innerHTML = [
        { label: 'Open tickets', value: (t.open || 0) + (t.assigned || 0) + (t.in_progress || 0), icon: 'build', tone: t.critical ? 'danger' : 'warning', sub: `${t.critical || 0} critical · ${t.in_progress || 0} in progress` },
        { label: 'Assets', value: a.total || 0, icon: 'inventory_2', tone: 'info', sub: `${a.active || 0} active · ${a.maintenance || 0} under maintenance` },
        { label: 'Out of service', value: a.out_of_service || 0, icon: 'block', tone: a.out_of_service ? 'danger' : 'success', sub: `${a.retired || 0} retired` },
        { label: 'Service due ≤ 15 days', value: a.service_due || 0, icon: 'event', tone: a.service_due ? 'warning' : 'success', sub: `${a.amc_expired || 0} AMC expired` },
      ].map(kpi).join('');
    }
    root.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === f.tab; b.setAttribute('aria-selected', on);
      b.className = `px-3 h-8 rounded font-label-md text-label-md ${on ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`; });
    const sel = root.querySelector('[data-status]');
    const opts = f.tab === 'tickets' ? [['open', 'Open (not resolved)'], ['all', 'All'], ['open', 'Open'], ['assigned', 'Assigned'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed']].filter((x, i) => i !== 2)
      : [['all', 'All statuses'], ['active', 'Active'], ['maintenance', 'Under maintenance'], ['out_of_service', 'Out of service'], ['retired', 'Retired']];
    if (!opts.some(([v]) => v === f.status)) f.status = opts[0][0];
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('');
    const list = root.querySelector('[data-list]');
    if (f.tab === 'tickets') {
      const rows = (await api.get(`/maintenance/tickets${qs({ status: f.status })}`)).filter((r) => !f.q || `${r.ticket_no} ${r.title} ${r.asset_name || ''} ${r.location || ''}`.toLowerCase().includes(f.q.toLowerCase()));
      list.innerHTML = card({ title: `${rows.length} ticket(s)`, pad: false, body: rows.length ? `<div class="overflow-auto max-h-[64vh]"><table class="tbl"><thead><tr>
        <th>Ticket</th><th>Fault</th><th>Asset / location</th><th>Priority</th><th>Status</th><th>Assigned to</th><th>Raised</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr data-id="${r.id}"><td class="font-data-mono text-body-sm">${esc(r.ticket_no)}</td>
          <td><div class="font-label-lg">${esc(r.title)}</div><div class="text-body-sm text-on-surface-variant max-w-[280px] truncate">${esc(r.description || '')}</div></td>
          <td><div>${esc(r.asset_name || '—')}${r.asset_code ? ` <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.asset_code)}</span>` : ''}</div><div class="text-body-sm text-on-surface-variant">${esc(r.location || r.asset_location || r.department_name || '')}</div></td>
          <td>${tag(r.priority)}</td><td>${tag(r.status)}</td><td class="text-body-md">${esc(r.assigned_to_name || '—')}</td>
          <td class="text-body-sm"><div>${fmtDateTime(r.raised_at)}</div><div class="text-on-surface-variant">${esc(r.raised_by_name || '')}</div></td>
          <td class="text-right whitespace-nowrap">${manage && r.status !== 'closed' ? '<button class="btn-secondary btn-xs" data-work>Update</button>' : ''}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="p-6">${emptyState('build', 'No tickets', viewAll ? 'Nothing matches this filter.' : 'Faults you report appear here with their progress.')}</div>` });
    } else {
      const rows = await api.get(`/maintenance/assets${qs({ status: f.status, q: f.q })}`);
      const soon = (d) => d && d <= new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
      list.innerHTML = card({ title: `${rows.length} asset(s)`, pad: false, body: rows.length ? `<div class="overflow-auto max-h-[64vh]"><table class="tbl"><thead><tr>
        <th>Asset ID</th><th>Asset</th><th>Department / location</th><th>Warranty / AMC</th><th>Vendor</th><th>Last / next service</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((a) => `<tr data-id="${a.id}"><td class="font-data-mono text-body-sm">${esc(a.asset_code)}</td>
          <td><div class="font-label-lg">${esc(a.name)}</div><div class="text-body-sm text-on-surface-variant">${esc(a.asset_type)}${a.make_model ? ` · ${esc(a.make_model)}` : ''}${a.serial_no ? ` · S/N ${esc(a.serial_no)}` : ''}</div></td>
          <td><div>${esc(a.department_name || '—')}</div><div class="text-body-sm text-on-surface-variant">${esc(a.location || '')}</div></td>
          <td class="text-body-sm"><div>Warranty ${a.warranty_until ? fmtDate(a.warranty_until) : '—'}</div><div class="${a.amc_until && a.amc_until < new Date().toISOString().slice(0, 10) ? 'text-danger font-semibold' : ''}">AMC ${a.amc_until ? fmtDate(a.amc_until) : '—'}</div></td>
          <td class="text-body-sm">${esc(a.vendor || '—')}</td>
          <td class="text-body-sm"><div>${a.last_service ? fmtDate(a.last_service) : '—'}</div><div class="${soon(a.next_service) ? 'text-warning font-semibold' : ''}">Next ${a.next_service ? fmtDate(a.next_service) : '—'}${soon(a.next_service) ? ' · due' : ''}</div></td>
          <td>${tag(a.status)}${a.open_tickets ? `<div class="text-label-sm text-on-surface-variant mt-1">${a.open_tickets} open ticket(s)</div>` : ''}</td>
          <td class="text-right whitespace-nowrap"><button class="btn-ghost btn-xs" data-raise-for="${a.id}" title="Report a fault on this asset">Report fault</button>
            ${manage ? '<button class="btn-secondary btn-xs" data-edit-asset>Edit</button>' : ''}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="p-6">${emptyState('inventory_2', 'No assets', 'Add equipment to the register.')}</div>` });
    }
    root._rows = f.tab;
  }

  const findTicket = async (id) => (await api.get('/maintenance/tickets?status=all')).find((t) => t.id === id);
  bind(root, 'click', '[data-tab]', (e, b) => { f.tab = b.dataset.tab; f.status = f.tab === 'tickets' ? 'open' : 'all'; load(); });
  root.querySelector('[data-status]').onchange = (e) => { f.status = e.target.value; load(); };
  let qt; root.querySelector('[data-q]').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 250); };
  bind(root, 'click', '[data-raise]', () => raiseTicket(null, summary, load));
  bind(root, 'click', '[data-raise-for]', (e, b) => raiseTicket(+b.dataset.raiseFor, summary, load));
  bind(root, 'click', '[data-new-asset]', () => assetForm(null, summary, load));
  bind(root, 'click', '[data-edit-asset]', async (e, b) => { const id = +b.closest('tr').dataset.id; const a = (await api.get('/maintenance/assets')).find((x) => x.id === id); assetForm(a, summary, load); });
  bind(root, 'click', '[data-work]', async (e, b) => workTicket(await findTicket(+b.closest('tr').dataset.id), load));
  return live({ topics: ['maintenance'], events: ['asset.created', 'asset.updated', 'maintenance.ticket'], load });
}

async function raiseTicket(assetId, summary, after) {
  const assets = await api.get('/maintenance/assets').catch(() => []);
  const live = assets.filter((a) => a.status !== 'retired');
  modal({
    title: 'Report a fault', subtitle: 'The maintenance team is notified and you can follow progress here.', size: 'md',
    body: `<form data-tf class="space-y-3">
      <div><label class="field-label">Equipment (if known)</label><select class="field" name="asset_id"><option value="">— not in the register / general —</option>
        ${live.map((a) => `<option value="${a.id}" ${a.id === assetId ? 'selected' : ''}>${esc(a.asset_code)} · ${esc(a.name)}${a.location ? ` — ${esc(a.location)}` : ''}</option>`).join('')}</select></div>
      <div><label class="field-label">What is wrong *</label><input class="field" name="title" required placeholder="e.g. Monitor display flickering, AC not cooling"></div>
      <div><label class="field-label">Details</label><textarea class="field" name="description" rows="3"></textarea></div>
      <div class="grid grid-cols-2 gap-3"><div><label class="field-label">Location</label><input class="field" name="location" placeholder="Ward / room / bed"></div>
        <div><label class="field-label">Priority</label><select class="field" name="priority">${['low', 'normal', 'high', 'critical'].map((p) => `<option value="${p}" ${p === 'normal' ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}${p === 'critical' ? ' — patient care affected' : ''}</option>`).join('')}</select></div></div>
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Report</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (ev) => {
        const form = el.querySelector('[data-tf]'); if (!form.reportValidity()) return;
        const btn = ev.currentTarget; busy(btn, true);
        try { const t = await api.post('/maintenance/tickets', Object.fromEntries(new FormData(form))); close(); toast(`${t.ticket_no} reported`, 'success'); after(); }
        catch (e) { apiError(e); busy(btn, false); }
      };
    },
  });
}

function assetForm(a, summary, after) {
  const f = (k, l, type = 'text', extra = '') => `<div><label class="field-label">${l}</label><input class="field" name="${k}" type="${type}" value="${esc(a?.[k] ?? '')}" ${extra}></div>`;
  modal({
    title: a ? `Edit ${a.asset_code}` : 'Add asset', size: 'lg',
    body: `<form data-af class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${f('name', 'Asset name *', 'text', 'required')}
      <div><label class="field-label">Type *</label><select class="field" name="asset_type" required>${(summary.types || []).map((t) => `<option ${a?.asset_type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${a ? '' : f('asset_code', 'Asset ID (leave blank to number automatically)')}
      <div><label class="field-label">Department</label><select class="field" name="department_id"><option value="">—</option>${(state.meta.departments || []).map((d) => `<option value="${d.id}" ${a?.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      ${f('location', 'Location (block / floor / room / bed)')}${f('make_model', 'Make / model')}${f('serial_no', 'Serial no.')}
      ${f('purchase_date', 'Purchase date', 'date')}${f('purchase_cost', 'Purchase cost (₹)', 'number', 'min="0" step="1"')}
      ${f('warranty_until', 'Warranty until', 'date')}${f('amc_until', 'AMC until', 'date')}${f('vendor', 'Vendor')}${f('vendor_contact', 'Vendor contact')}
      ${f('last_service', 'Last service', 'date')}${f('next_service', 'Next service due', 'date')}
      ${a ? `<div><label class="field-label">Status</label><select class="field" name="status">${['active', 'maintenance', 'out_of_service', 'retired'].map((s) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></div>` : ''}
      <div class="md:col-span-2"><label class="field-label">Notes</label><textarea class="field" name="notes" rows="2">${esc(a?.notes || '')}</textarea></div>
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (ev) => {
        const form = el.querySelector('[data-af]'); if (!form.reportValidity()) return;
        const btn = ev.currentTarget; busy(btn, true);
        const body = Object.fromEntries(new FormData(form));
        try { a ? await api.patch(`/maintenance/assets/${a.id}`, body) : await api.post('/maintenance/assets', body); close(); toast('Asset saved', 'success'); after(); }
        catch (e) { apiError(e); busy(btn, false); }
      };
    },
  });
}

function workTicket(t, after) {
  if (!t) return;
  const staff = (state.meta.staff || []).filter((s) => ['maintenance', 'admin', 'store'].includes(s.role));
  modal({
    title: `${t.ticket_no} — ${t.title}`, subtitle: `${t.asset_name || 'General'}${t.location ? ` · ${t.location}` : ''} · raised by ${t.raised_by_name || '—'}`, size: 'md',
    body: `<form data-wf class="space-y-3">
      <div class="flex flex-wrap gap-2 items-center">${tag(t.status)} ${tag(t.priority)}</div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Move to</label><select class="field" name="status"><option value="">— keep ${esc(STATUS_LABEL[t.status])} —</option>
          ${NEXT[t.status].map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('')}</select></div>
        <div><label class="field-label">Assigned to</label><select class="field" name="assigned_to"><option value="">—</option>
          ${staff.map((s) => `<option value="${s.id}" ${t.assigned_to === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div><label class="field-label">Priority</label><select class="field" name="priority">${['low', 'normal', 'high', 'critical'].map((p) => `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div><label class="field-label">Cost (₹)</label><input class="field" type="number" min="0" name="cost" value="${t.cost ?? ''}"></div>
      </div>
      <div><label class="field-label">Work done / resolution ${['resolved', 'closed'].some((s) => NEXT[t.status].includes(s)) ? '(required to resolve or close)' : ''}</label><textarea class="field" name="resolution" rows="3">${esc(t.resolution || '')}</textarea></div>
      <div><label class="field-label">Vendor / service reference</label><input class="field" name="vendor_reference" value="${esc(t.vendor_reference || '')}"></div>
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (ev) => {
        const body = Object.fromEntries(new FormData(el.querySelector('[data-wf]')));
        if (!body.status) delete body.status;
        const btn = ev.currentTarget; busy(btn, true);
        try { await api.patch(`/maintenance/tickets/${t.id}`, body); close(); toast('Ticket updated', 'success'); after(); }
        catch (e) { apiError(e); busy(btn, false); }
      };
    },
  });
}
