/**
 * Payers & TPAs: the master list of everyone who pays for patients other than
 * the patients themselves — insurers, TPAs, Aarogyasri, corporates, trusts and
 * credit accounts — with each payer's packages and agreed service rates.
 */
import {
  page, eyebrow, liveChip, card, live, mountPage, api, can, esc, bind, toast, modal, drawer, money, compactMoney,
  fmtDate, kpi, pill, apiError, busy, emptyState,
} from './_kit.js';
import { packageForm } from './packages.js';

export const PAYER_KINDS = [['insurance', 'Insurance company'], ['tpa', 'TPA'], ['aarogyasri', 'Aarogyasri / govt scheme'],
  ['corporate', 'Corporate'], ['trust', 'Trust / charity']];
const KIND = Object.fromEntries(PAYER_KINDS);
const canEdit = () => can('insurance.write') || can('admin.write');
let showAll = false;

export async function mount(ctx) {
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Payer desk', 'handshake')} ${liveChip()}`, title: 'Payers & TPAs',
    subtitle: 'Maintain insurers, TPAs, Aarogyasri schemes, company credit accounts and trusts, with their agreed packages and rates. Company/trust dues belong to the payer; patient credit remains a patient due.',
    actions: `<button class="btn-secondary" data-all>${showAll ? 'Active only' : 'Include inactive'}</button>
      ${canEdit() ? '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> Add payer / TPA</button>' : ''}`,
    body: '<div data-kpis class="grid grid-cols-2 md:grid-cols-4 gap-3"></div><div data-list></div>',
  }));
  let rows = [];
  async function load() {
    rows = await api.get(`/payers${showAll ? '?all=1' : ''}`);
    root.querySelector('[data-kpis]').innerHTML = [
      { label: 'Payers', value: rows.filter((r) => r.active).length, icon: 'handshake', sub: PAYER_KINDS.map(([k, l]) => { const n = rows.filter((r) => r.payer_type === k && r.active).length; return n ? `${l.split(' ')[0]} ${n}` : ''; }).filter(Boolean).join(' · ') || 'None yet' },
      { label: 'Open cases', value: rows.reduce((s, r) => s + r.open_cases, 0), icon: 'health_and_safety', tone: 'warning', sub: compactMoney(rows.reduce((s, r) => s + r.open_value, 0)) + ' pending' },
      { label: 'Payer packages', value: rows.reduce((s, r) => s + r.packages, 0), icon: 'inventory', tone: 'info', sub: 'Across all payers' },
      { label: 'Agreed rates', value: rows.reduce((s, r) => s + r.rates, 0), icon: 'price_change', sub: 'Service rate overrides' },
    ].map(kpi).join('');
    root.querySelector('[data-list]').innerHTML = rows.length ? card({ title: `${rows.length} payer(s)`, pad: false, body: `<div class="overflow-auto"><table class="tbl">
      <thead><tr><th>Payer</th><th>Type</th><th>Contact</th><th class="num">Credit days</th><th>Empanelled</th><th class="num">Patients</th><th class="num">Open cases</th><th class="num">Packages</th><th class="num">Rates</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.active ? '' : 'opacity-60'}"><td><div class="font-label-lg">${esc(r.name)}</div><div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.code || '')}</div></td>
        <td><span class="pill-info">${esc(KIND[r.payer_type] || r.payer_type)}</span>${r.active ? '' : ' <span class="pill-neutral">Inactive</span>'}</td>
        <td class="text-body-sm">${esc(r.contact_person || '')}<div class="text-on-surface-variant">${esc(r.phone || '')} ${esc(r.email || '')}</div></td>
        <td class="num">${r.credit_days}</td><td class="text-body-sm">${r.empanelled_from ? fmtDate(r.empanelled_from) : '—'}${r.empanelled_to ? ` → ${fmtDate(r.empanelled_to)}` : ''}</td>
        <td class="num">${r.patients}</td><td class="num">${r.open_cases ? `${r.open_cases} · ${compactMoney(r.open_value)}` : '—'}</td><td class="num">${r.packages}</td><td class="num">${r.rates}</td>
        <td class="text-right whitespace-nowrap"><button class="btn-primary btn-xs" data-open="${r.id}">Open</button></td></tr>`).join('')}</tbody></table></div>` })
      : emptyState('handshake', 'No payers yet', 'Add each insurer, TPA, scheme, corporate or trust you work with.', canEdit() ? '<button class="btn-primary" data-new>Add payer / TPA</button>' : '');
  }
  bind(root, 'click', '[data-new]', () => payerForm(null, load));
  bind(root, 'click', '[data-open]', (e, b) => openPayer(+b.dataset.open, load));
  bind(root, 'click', '[data-all]', (e, b) => { showAll = !showAll; b.textContent = showAll ? 'Active only' : 'Include inactive'; load(); });
  await load();
  return live({ topics: ['insurance', 'admin'], events: ['payer.saved', 'package.created', 'claim.created', 'claim.updated'], load });
}

export function payerForm(p, after) {
  const v = (k, d = '') => esc(p?.[k] ?? d);
  modal({
    title: p ? `Edit ${p.name}` : 'Add payer / TPA', size: 'md',
    body: `<form data-pf class="grid grid-cols-2 gap-3">
      <div class="col-span-2 md:col-span-1"><label class="field-label">Name *</label><input class="field" name="name" required value="${v('name')}" placeholder="e.g. Star Health, MediAssist TPA, Infosys Ltd"></div>
      <div><label class="field-label">Type *</label><select class="field" name="payer_type">${PAYER_KINDS.map(([k, l]) => `<option value="${k}" ${k === (p?.payer_type || 'insurance') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="field-label">Short code</label><input class="field" name="code" value="${v('code')}" placeholder="e.g. STAR"></div>
      <div><label class="field-label">Credit days</label><input class="field" type="number" min="0" name="credit_days" value="${v('credit_days', 30)}"></div>
      <div><label class="field-label">Contact person</label><input class="field" name="contact_person" value="${v('contact_person')}"></div>
      <div><label class="field-label">Phone</label><input class="field" name="phone" value="${v('phone')}"></div>
      <div><label class="field-label">Email</label><input class="field" type="email" name="email" value="${v('email')}"></div>
      <div><label class="field-label">GSTIN</label><input class="field" name="gstin" value="${v('gstin')}"></div>
      <div><label class="field-label">Empanelled from</label><input class="field" type="date" name="empanelled_from" value="${v('empanelled_from')}"></div>
      <div><label class="field-label">Empanelled until</label><input class="field" type="date" name="empanelled_to" value="${v('empanelled_to')}"></div>
      <div class="col-span-2"><label class="field-label">Address</label><input class="field" name="address" value="${v('address')}"></div>
      <div class="col-span-2"><label class="field-label">Notes (MoU terms, portal, documents needed)</label><textarea class="field" rows="2" name="notes">${v('notes')}</textarea></div>
      ${p ? `<label class="col-span-2 flex items-center gap-2"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active</label>` : ''}
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>${p ? 'Save' : 'Add payer'}</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const f = root.querySelector('[data-pf]');
        if (!f.reportValidity()) return;
        const body = Object.fromEntries(new FormData(f));
        if (p) body.active = f.active?.checked ? 1 : 0;
        busy(ev.currentTarget, true);
        try { const r = p ? await api.patch(`/payers/${p.id}`, body) : await api.post('/payers', body); close(); toast(`${r.name} saved`, 'success'); after?.(r); }
        catch (e) { apiError(e, 'Payer not saved'); busy(ev.currentTarget, false); }
      };
    },
  });
}

async function openPayer(id, after) {
  let p;
  try { p = await api.get(`/payers/${id}`); } catch (e) { apiError(e); return; }
  let tab = 'packages';
  const refresh = async () => { p = await api.get(`/payers/${id}`); paint(); after(); };
  let body;
  const paint = () => {
    body.innerHTML = `<div class="p-5 space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-body-md">
        <div><div class="text-on-surface-variant text-body-sm">Type</div>${esc(KIND[p.payer_type] || p.payer_type)}</div>
        <div><div class="text-on-surface-variant text-body-sm">Contact</div>${esc(p.contact_person || '—')}<div class="text-body-sm">${esc(p.phone || '')}</div></div>
        <div><div class="text-on-surface-variant text-body-sm">Credit days</div>${p.credit_days}</div>
        <div><div class="text-on-surface-variant text-body-sm">Empanelled</div>${p.empanelled_from ? fmtDate(p.empanelled_from) : '—'}${p.empanelled_to ? ` → ${fmtDate(p.empanelled_to)}` : ''}</div></div>
      ${p.notes ? `<p class="text-body-md text-on-surface-variant">${esc(p.notes)}</p>` : ''}
      <div class="inline-flex p-0.5 rounded bg-surface-container">${[['packages', `Packages (${p.packages.length})`], ['rates', `Agreed rates (${p.rates.length})`], ['cases', `Cases (${p.cases.length})`]].map(([k, l]) => `<button type="button" data-tab="${k}"
        class="px-3 h-8 rounded font-label-md text-label-md ${k === tab ? 'bg-white shadow-sm' : 'text-on-surface-variant'}">${l}</button>`).join('')}</div>
      ${tab === 'packages' ? `
        ${canEdit() ? '<button class="btn-primary btn-sm" data-newpkg><span class="material-symbols-outlined text-[16px]">add</span>Add package for this payer</button>' : ''}
        ${p.packages.length ? `<table class="tbl"><thead><tr><th>Package</th><th>Payer code</th><th class="num">Price</th><th class="num">Stay</th><th class="num">Services</th><th></th></tr></thead><tbody>
          ${p.packages.map((k) => `<tr class="${k.active ? '' : 'opacity-60'}"><td><div class="font-label-lg">${esc(k.name)}</div><div class="text-body-sm text-on-surface-variant">${esc(k.code)} · ${esc(k.category || '')}</div></td>
            <td class="font-data-mono text-body-sm">${esc(k.payer_code || '—')}</td><td class="num font-semibold">${money(k.price)}</td><td class="num">${k.los_days ? `${k.los_days} d` : '—'}</td><td class="num">${k.item_count}</td>
            <td class="text-right">${canEdit() ? `<button class="btn-secondary btn-xs" data-editpkg="${k.id}">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table>`
          : '<p class="text-on-surface-variant">No packages for this payer yet. Add each procedure package agreed with them (e.g. normal delivery, cataract, appendectomy) with its price and stay.</p>'}` : ''}
      ${tab === 'rates' ? `<p class="text-body-sm text-on-surface-variant">Leave a rate empty to bill the hospital tariff. A rate set here is used automatically when this payer's patients are billed for that service.</p>
        <input type="search" class="field field-sm !h-8 max-w-xs" placeholder="Find a service…" data-rq>
        <div class="overflow-auto max-h-[50vh] border border-outline-variant rounded"><table class="tbl"><thead><tr><th>Service</th><th>Category</th><th class="num">Hospital tariff</th><th class="num">Agreed rate</th></tr></thead><tbody data-rates></tbody></table></div>
        ${canEdit() ? '<button class="btn-primary btn-sm" data-saverates>Save rates</button>' : ''}` : ''}
      ${tab === 'cases' ? (p.cases.length ? `<table class="tbl"><thead><tr><th>Case</th><th>Patient</th><th class="num">Estimate</th><th class="num">Approved</th><th class="num">Settled</th><th>Stage</th></tr></thead><tbody>
        ${p.cases.map((c) => `<tr><td class="font-data-mono text-body-sm">${esc(c.claim_no)}</td><td>${esc(c.patient_name)} <span class="text-on-surface-variant text-body-sm">${esc(c.uhid)}</span></td>
          <td class="num">${money(c.estimate)}</td><td class="num">${c.approved ? money(c.approved) : '—'}</td><td class="num">${c.settled ? money(c.settled) : '—'}</td><td>${pill(c.status)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="text-on-surface-variant">No cases for this payer yet.</p>') : ''}
    </div>`;
    if (tab === 'rates') paintRates();
  };
  let services = null;
  const draft = new Map();
  const paintRates = async () => {
    services ||= await api.get('/services');
    const have = new Map(p.rates.map((r) => [r.service_id, r.price]));
    const q = (body.querySelector('[data-rq]')?.value || '').trim().toLowerCase();
    body.querySelector('[data-rates]').innerHTML = services.filter((s) => s.active && (!q || `${s.name} ${s.code}`.toLowerCase().includes(q)))
      .sort((a, b) => (have.has(b.id) - have.has(a.id)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).slice(0, 300)
      .map((s) => { const cur = draft.has(s.id) ? draft.get(s.id) : have.get(s.id) ?? '';
        return `<tr><td>${esc(s.name)} <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(s.code)}</span></td><td class="text-body-sm capitalize">${esc(s.category)}</td>
          <td class="num">${money(s.price)}</td><td class="num"><input class="field field-sm !h-8 !w-28 text-right ml-auto" type="number" min="0" step="0.01" data-rate="${s.id}" value="${cur}" ${canEdit() ? '' : 'disabled'} aria-label="Agreed rate for ${esc(s.name)}"></td></tr>`; }).join('');
  };
  drawer({
    title: p.name, subtitle: esc(KIND[p.payer_type] || p.payer_type), width: 'max-w-3xl',
    body: '', footer: `<button class="btn-secondary" data-close>Close</button>${canEdit() ? '<button class="btn-secondary" data-editpayer>Edit details</button>' : ''}`,
    onMount(root, close) {
      body = root.querySelector('[data-drawer-body]');
      paint();
      root.querySelector('[data-editpayer]')?.addEventListener('click', () => { close(); payerForm(p, () => { after(); openPayer(id, after); }); });
      body.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; paint(); return; }
        if (e.target.closest('[data-newpkg]')) { packageForm(null, refresh, { payer_id: p.id }); return; }
        const ed = e.target.closest('[data-editpkg]'); if (ed) { packageForm(+ed.dataset.editpkg, refresh); return; }
        const sv = e.target.closest('[data-saverates]');
        if (sv) {
          if (!draft.size) { toast('No rate changed', 'info'); return; }
          busy(sv, true);
          try { p.rates = await api.put(`/payers/${p.id}/rates`, { rates: [...draft].map(([service_id, price]) => ({ service_id, price })) }); draft.clear(); toast('Rates saved', 'success'); paint(); after(); }
          catch (err) { apiError(err, 'Rates not saved'); busy(sv, false); }
        }
      });
      body.addEventListener('input', (e) => {
        if (e.target.matches('[data-rq]')) paintRates();
        if (e.target.matches('[data-rate]')) draft.set(+e.target.dataset.rate, e.target.value);
      });
    },
  });
}
