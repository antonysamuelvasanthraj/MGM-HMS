/**
 * Packages. Hospital packages are open to every patient; payer packages are
 * agreed with one insurer, TPA, scheme, corporate or trust at a fixed price,
 * with the stay, inclusions and exclusions that price covers.
 */
import {
  page, eyebrow, liveChip, kpiRow, live, mountPage, card, compactMoney,
  apiError, busy, api, qs, state, can, navigate, patientPicker,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, kpi, emptyState,
} from './_kit.js';
import { openPackageUsage } from '../package-usage.js';

const COVER = [['bed', 'Room / bed'], ['ipd', 'Daily ward charges'], ['consultation', 'Doctor visits'], ['lab', 'Laboratory'], ['imaging', 'Imaging'],
  ['procedure', 'Procedures / OT / surgeon'], ['emergency', 'Emergency charges'], ['pharmacy', 'Medicines & consumables'], ['other', 'Other']];
let cache = [];
let filter = '';
const canEdit = () => can('admin.view') || can('insurance.write') || can('admin.write');

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  filter = ctx.query.payer || filter;

  async function load() {
    cache = await api.get('/packages');
    const shown = cache.filter((p) => filter === '' ? true : filter === 'hospital' ? !p.payer_id : String(p.payer_id) === filter);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Hospital packages', value: cache.filter((p) => !p.payer_id).length, icon: 'inventory', sub: `${cache.filter((p) => !p.payer_id && p.active).length} active` },
      { label: 'Payer packages', value: cache.filter((p) => p.payer_id).length, icon: 'handshake', tone: 'info', sub: `${new Set(cache.filter((p) => p.payer_id).map((p) => p.payer_id)).size} payer(s)` },
      { label: 'Services bundled', value: cache.reduce((s, p) => s + p.item_count, 0), icon: 'checklist', sub: 'Across all packages' },
      { label: 'Highest value', value: cache.length ? compactMoney(Math.max(...cache.map((p) => p.price))) : '—', icon: 'trending_up', sub: 'Single package' },
    ].map(kpi).join('');
    const payers = [...new Map(cache.filter((p) => p.payer_id).map((p) => [p.payer_id, p.payer_name])).entries()];
    $('[data-filter]', root).innerHTML = [['', 'All'], ['hospital', 'Hospital packages'], ...payers.map(([id, n]) => [String(id), n])]
      .map(([k, l]) => `<button type="button" data-f="${k}" class="px-3 h-8 rounded-full border text-body-md ${k === filter ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant hover:bg-surface-container-low'}">${esc(l)}</button>`).join('');
    // packages bought for visits and stays, with what they have covered so far
    const active = await api.get('/package-assignments?status=active').catch(() => []);
    $('[data-active]', root).innerHTML = active.length ? card({ title: 'Packages in use', subtitle: 'Bought for an open visit or admission — covered charges are adjusted, extras billed', pad: false,
      body: `<table class="tbl"><thead><tr><th>Patient</th><th>Package</th><th>Stay</th><th class="text-right">Price</th><th class="text-right">Covered</th><th class="text-right">Extras</th><th class="text-right">Owes in all</th><th></th></tr></thead><tbody>
        ${active.map((r) => `<tr><td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div><div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)}</div></td>
          <td class="text-body-md">${esc(r.package_name)}</td><td class="font-data-mono text-body-sm">${esc(r.ip_no || r.encounter_no || 'standalone')}</td>
          <td class="num">${money(r.price)}</td><td class="num text-success">${money(r.covered)}</td><td class="num ${r.excess + r.excluded > 0 ? 'text-warning' : ''}">${money(r.excess + r.excluded)}</td>
          <td class="num font-semibold">${money(r.patient_owes)}</td><td class="text-right"><button class="btn-secondary btn-xs" data-usage="${r.id}">Usage</button></td></tr>`).join('')}</tbody></table>` }) : '';
    $('[data-grid]', root).innerHTML = shown.length
      ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${shown.map(pkgCard).join('')}</div>`
      : emptyState('inventory', 'No packages here yet', 'Create a hospital package, or a package agreed with a payer / TPA.', canEdit() ? '<button class="btn-primary" data-new>New package</button>' : '');
  }

  bind(root, 'click', '[data-open]', (e, b) => openPackage(+b.dataset.open));
  bind(root, 'click', '[data-edit]', (e, b) => packageForm(+b.dataset.edit, load));
  bind(root, 'click', '[data-new]', () => packageForm(null, load, filter && filter !== 'hospital' ? { payer_id: +filter } : {}));
  bind(root, 'click', '[data-payers]', () => navigate('/payers'));
  bind(root, 'click', '[data-f]', (e, b) => { filter = b.dataset.f; load(); });
  bind(root, 'click', '[data-sell]', (e, b) => sellPackage(cache.find((p) => p.id === +b.dataset.sell), load));
  bind(root, 'click', '[data-usage]', (e, b) => openPackageUsage({ assignment_id: b.dataset.usage }, load));
  await load();
  return live({ topics: ['billing', 'admin', 'insurance'], events: ['package.created', 'bill.created', 'payer.saved'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Commercial', 'inventory')} ${liveChip()}`,
    title: 'Packages',
    subtitle: 'Common hospital packages are available to every patient. Optional payer agreements link to a common package and define that payer’s price, stay and coverage.',
    actions: `${can('insurance.view') || can('admin.view') ? '<button class="btn-secondary" data-payers>Payers & TPAs</button>' : ''}
      ${canEdit() ? '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New package</button>' : ''}`,
    body: `${kpiRow([], 4)}<div data-active></div><div class="flex flex-wrap gap-2" data-filter></div><div data-grid></div>`,
  });
}

function pkgCard(p) {
  const saving = p.list_value && !p.payer_id ? Math.round((1 - p.price / p.list_value) * 100) : 0;
  return `<article class="card overflow-hidden flex flex-col ${p.active ? '' : 'opacity-60'}">
    <header class="px-4 py-3 border-b border-outline-variant bg-surface-container-low">
      <div class="flex items-center justify-between gap-2">
        ${p.payer_id ? `<span class="pill-info">${esc(p.payer_name)}</span>` : '<span class="pill-brand">Hospital package</span>'}
        ${saving > 0 ? `<span class="pill-success pill-dot">Save ${saving}%</span>` : p.active ? '' : `<span class="pill-neutral">${p.code?.startsWith('REF-PKG-')?'Draft — configure tariff':'Inactive'}</span>`}</div>
      ${p.hospital_package_name ? `<div class="text-body-sm mt-1">Agreement for ${esc(p.hospital_package_name)}</div>` : ''}
      <h3 class="font-title-md text-title-md mt-1.5">${esc(p.name)}</h3>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(p.code)}${p.payer_code ? ` · payer code ${esc(p.payer_code)}` : ''}${p.category ? ` · ${esc(p.category)}` : ''}</div>
    </header>
    <div class="p-4 flex-1">
      <div class="flex items-end gap-2">
        <span class="font-display-lg text-display-lg text-primary">${money(p.price)}</span>
        ${!p.payer_id && p.list_value > p.price ? `<span class="text-body-lg text-on-surface-variant line-through mb-1">${money(p.list_value)}</span>` : ''}
      </div>
      <p class="text-body-md text-on-surface-variant mt-1">${esc(p.description || p.inclusions || '')}</p>
      <div class="flex flex-wrap items-center gap-3 mt-3 text-body-sm text-on-surface-variant">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">checklist</span>${p.item_count} services</span>
        ${p.los_days ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">bed</span>${p.los_days}-day stay</span>` : ''}
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">schedule</span>valid ${p.validity_days || 0} days</span>
      </div>
    </div>
    <footer class="p-3 border-t border-outline-variant flex gap-2">
      <button class="btn-secondary btn-sm flex-1" data-open="${p.id}">What's included</button>
      ${canEdit() ? `<button class="btn-secondary btn-sm" data-edit="${p.id}">Edit</button>` : ''}
      ${!p.payer_id && p.active && can('billing.create') ? `<button class="btn-primary btn-sm flex-1" data-sell="${p.id}">Sell</button>` : ''}
    </footer>
  </article>`;
}

async function openPackage(id) {
  const p = await api.get(`/payer-packages/${id}`);
  const list = p.items.reduce((s, i) => s + i.price * i.qty, 0);
  modal({
    title: p.name, subtitle: `${esc(p.code)}${p.payer_name ? ` · ${esc(p.payer_name)}` : ' · hospital package'} · ${p.items.length} services${p.los_days ? ` · ${p.los_days}-day stay` : ''}`, size: 'md',
    body: `<table class="tbl"><thead><tr><th>Service</th><th>Category</th>
        <th class="text-right">Qty</th><th class="text-right">List price</th></tr></thead>
      <tbody>${p.items.map((i) => `<tr>
        <td class="font-label-lg text-label-lg">${esc(i.name)}</td>
        <td class="capitalize text-body-md">${esc(i.category)}</td>
        <td class="num">${i.qty}</td><td class="num">${money(i.price)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-on-surface-variant">No itemised services</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="3" class="text-right text-on-surface-variant py-1.5">If billed separately</td><td class="num">${money(list)}</td></tr>
        <tr><td colspan="3" class="text-right font-title-md py-1.5">Package price</td><td class="num font-headline-md text-primary">${money(p.price)}</td></tr>
      </tfoot></table>
      ${p.inclusions ? `<h4 class="panel-title mt-4">Included</h4><p class="text-body-md whitespace-pre-line">${esc(p.inclusions)}</p>` : ''}
      ${p.exclusions ? `<h4 class="panel-title mt-3">Not included (billed extra)</h4><p class="text-body-md whitespace-pre-line">${esc(p.exclusions)}</p>` : ''}`,
    footer: `<button class="btn-secondary" data-close>Close</button>`,
  });
}

/** Create (id null) or edit a package. `defaults.payer_id` preselects the payer. */
export async function packageForm(id, after, defaults = {}) {
  const [p, payers, services, packageMaster] = await Promise.all([id ? api.get(`/payer-packages/${id}`) : null, api.get('/payers'), api.get('/services'), api.get('/packages')]);
  const items = (p?.items || []).map((i) => ({ service_id: i.service_id, qty: i.qty }));
  const v = (k, d = '') => esc(p?.[k] ?? d);
  const payerId = p ? p.payer_id : defaults.payer_id || '';
  const active = services.filter((s) => s.active);
  const paintItems = (root) => {
    root.querySelector('[data-items]').innerHTML = items.length ? items.map((it, n) => { const s = services.find((x) => x.id === it.service_id);
      return `<tr><td>${esc(s?.name || '?')}</td><td class="num"><input class="field field-sm !h-8 !w-16 text-right ml-auto" type="number" min="1" value="${it.qty}" data-qty="${n}"></td>
        <td class="num">${money((s?.price || 0) * it.qty)}</td><td class="text-right"><button type="button" class="btn-ghost btn-xs" data-rm="${n}">Remove</button></td></tr>`; }).join('')
      : '<tr><td colspan="4" class="text-on-surface-variant text-body-sm">Optional — list the services the package covers.</td></tr>';
    root.querySelector('[data-list]').textContent = money(items.reduce((s, it) => s + (services.find((x) => x.id === it.service_id)?.price || 0) * it.qty, 0));
  };
  modal({
    title: p ? `Edit ${p.name}` : 'New package', size: 'lg',
    body: `<form data-kf class="space-y-3">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="col-span-2"><label class="field-label">Package name *</label><input class="field" name="name" required value="${v('name')}" placeholder="e.g. Normal delivery, Cataract (one eye)"></div>
        <div class="col-span-2"><label class="field-label">Package scope / agreement with</label><select class="field" name="payer_id"><option value="">Common hospital package (all patients)</option>
          ${payers.map((x) => `<option value="${x.id}" ${String(x.id) === String(payerId) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="col-span-2" data-agreement-parent><label class="field-label">Common hospital package for this agreement</label><select class="field" name="hospital_package_id"><option value="">Independent payer package (existing option)</option>
          ${packageMaster.filter(k => !k.payer_id && (k.active || k.id === p?.hospital_package_id)).map(k => `<option value="${k.id}" ${k.id === p?.hospital_package_id ? 'selected' : ''}>${esc(k.name)} · ${money(k.price)}</option>`).join('')}</select>
          <p class="text-body-sm text-on-surface-variant">Set the agreed price and coverage below. Selecting this common package on a matching payer case uses this agreement. Creating an agreement does not change existing cases.</p></div>
        <div><label class="field-label">Our code *</label><input class="field" name="code" required value="${v('code')}" placeholder="PKG-DEL-N"></div>
        <div><label class="field-label">Payer's package code</label><input class="field" name="payer_code" value="${v('payer_code')}" placeholder="e.g. MG011A"></div>
        <div><label class="field-label">Category</label><input class="field" name="category" value="${v('category')}" list="pkg-cats" placeholder="surgery, maternity …">
          <datalist id="pkg-cats">${['surgery', 'maternity', 'medical', 'day care', 'health check', 'orthopaedics', 'cardiac', 'ophthalmology'].map((c) => `<option value="${c}">`).join('')}</datalist></div>
        <div><label class="field-label">Price ₹ *</label><input class="field text-right" type="number" min="0" step="0.01" name="price" required value="${v('price')}"></div>
        <div><label class="field-label">Stay covered (days)</label><input class="field text-right" type="number" min="0" name="los_days" value="${v('los_days')}"></div>
        <div><label class="field-label">Valid for (days)</label><input class="field text-right" type="number" min="0" name="validity_days" value="${v('validity_days', 30)}"></div>
        <div class="col-span-2 flex items-end">${p ? `<label class="flex items-center gap-2"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active</label>` : ''}</div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="field-label">Included</label><textarea class="field" rows="3" name="inclusions" placeholder="Room, surgeon & anaesthetist fees, OT, routine medicines and consumables…">${v('inclusions')}</textarea></div>
        <div><label class="field-label">Not included (billed extra)</label><textarea class="field" rows="3" name="exclusions" placeholder="Implants, blood, extra days, ICU…">${v('exclusions')}</textarea></div>
      </div>
      <fieldset class="rounded-lg border border-outline-variant p-3"><legend class="px-1 field-label !mb-0">What the price covers — used to bill extras automatically</legend>
        <p class="text-body-sm text-on-surface-variant mb-2">Tick the charge types the package pays for. Leave all unticked for an all-inclusive package. Bed and daily charges are covered for the stay days above; listed services below for their quantity; anything else is billed to the patient as an extra.</p>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-1.5">${COVER.map(([k, l]) => `<label class="flex items-center gap-2 text-body-md"><input type="checkbox" data-cover="${k}" ${(() => { try { return (JSON.parse(p?.cover_categories || '[]') || []).includes(k) ? 'checked' : ''; } catch { return ''; } })()}> ${l}</label>`).join('')}</div>
        <div class="mt-2 max-w-[260px]"><label class="field-label">Medicines covered up to ₹ <span class="normal-case tracking-normal text-on-surface-variant">(blank = no limit)</span></label><input class="field text-right" type="number" min="0" step="0.01" name="pharmacy_limit" value="${p?.pharmacy_limit ?? ''}"></div>
      </fieldset>
      <div><label class="field-label">Short description</label><input class="field" name="description" value="${v('description')}"></div>
      <div class="border border-outline-variant rounded-lg">
        <div class="flex flex-wrap items-end gap-2 p-3 border-b border-outline-variant">
          <div class="flex-1 min-w-[220px]"><label class="field-label">Add a service to the package</label><input class="field" list="pkg-svc" data-svc placeholder="Type to search the tariff">
            <datalist id="pkg-svc">${active.map((s) => `<option value="${esc(s.name)}">${esc(s.code)} · ${money(s.price)}</option>`).join('')}</datalist></div>
          <button type="button" class="btn-secondary" data-add>Add</button>
          <span class="text-body-sm text-on-surface-variant ml-auto">Separately: <b data-list></b></span></div>
        <table class="tbl"><tbody data-items></tbody></table></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>${p ? 'Save package' : 'Create package'}</button>`,
    onMount(root, close) {
      paintItems(root);
      const packageForm = root.querySelector('[data-kf]');
      const showAgreement = () => {
        const payerSelected = !!packageForm.payer_id.value;
        root.querySelector('[data-agreement-parent]').hidden = !payerSelected;
        packageForm.hospital_package_id.disabled = !payerSelected;
      };
      packageForm.payer_id.addEventListener('change', showAgreement);
      showAgreement();
      const addSvc = () => {
        const inp = root.querySelector('[data-svc]');
        const s = active.find((x) => x.name === inp.value.trim());
        if (!s) { toast('Pick a service from the list', 'warning'); return; }
        const have = items.find((i) => i.service_id === s.id);
        if (have) have.qty++; else items.push({ service_id: s.id, qty: 1 });
        inp.value = ''; paintItems(root);
      };
      root.querySelector('[data-add]').onclick = addSvc;
      root.querySelector('[data-svc]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSvc(); } });
      root.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { items.splice(+rm.dataset.rm, 1); paintItems(root); } });
      root.addEventListener('input', (e) => { if (e.target.matches('[data-qty]')) { items[+e.target.dataset.qty].qty = Math.max(1, +e.target.value || 1); root.querySelector('[data-list]').textContent = money(items.reduce((s, it) => s + (services.find((x) => x.id === it.service_id)?.price || 0) * it.qty, 0)); } });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const f = root.querySelector('[data-kf]');
        if (!f.reportValidity()) return;
        const body = { ...Object.fromEntries(new FormData(f)), items, hospital_package_id: f.payer_id.value ? (f.hospital_package_id.value || null) : null,
          cover_categories: [...root.querySelectorAll('[data-cover]:checked')].map((x) => x.dataset.cover) };
        if (p) body.active = f.active?.checked ? 1 : 0;
        busy(ev.currentTarget, true);
        try { const r = p ? await api.patch(`/payer-packages/${p.id}`, body) : await api.post('/payer-packages', body); close(); toast(`${r.name} saved`, 'success'); after?.(r); }
        catch (e) { apiError(e, 'Package not saved'); busy(ev.currentTarget, false); }
      };
    },
  });
}

function sellPackage(p, after) {
  let picked = null;
  modal({
    title: `Sell — ${p.name}`, subtitle: `${money(p.price)} · ${p.item_count} services`, size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Patient *</label><div data-picker></div></div>
      <div><label class="field-label">Link to visit / admission</label><select class="field" data-visit><option value="">Standalone package bill</option></select></div>
      <div><label class="field-label">Collect now?</label><select class="field" data-collect>
        <option value="1">Yes — take payment</option><option value="0">No — leave for the collection desk</option></select></div>
      <div><label class="field-label">Mode</label><select class="field" data-mode>
        <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></div>
      <p class="text-body-sm text-on-surface-variant">A single package bill is raised. The individual investigations
        are ordered from the consultation as the patient works through them.</p>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Raise package bill</button>`,
    onMount(root, close) {
      patientPicker(root.querySelector('[data-picker]'), async (x) => {
        picked = x;
        const select=root.querySelector('[data-visit]');
        select.innerHTML='<option value="">Standalone package bill</option>';
        try {
          const response=await api.get(`/encounters?patient_id=${x.id}`);
          if(picked?.id!==x.id || !root.isConnected)return;
          select.innerHTML+=(response.rows||[]).filter(v=>!['closed','cancelled'].includes(v.stage)).map(v=>`<option value="${v.id}">${esc(v.encounter_no)} · ${esc(v.kind)} · ${esc(v.doctor_name||'')}</option>`).join('');
        } catch(err){apiError(err);}
      }, { autofocus: true });
      root.querySelector('[data-ok]').onclick = async (ev) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Billing');
        try {
          const collect = root.querySelector('[data-collect]')?.value === '1';
          const b = await api.post('/bills', {
            patient_id: picked.id, bill_type: 'PKG', package_id:p.id,
            encounter_id:+root.querySelector('[data-visit]').value||null,
            items: [{ description: `${p.name} (package)`, category: 'package', qty: 1, rate: p.price }],
            collect, mode: root.querySelector('[data-mode]').value,
          });
          close(); toast(`${b.bill_no} raised for ${money(b.total)}`, 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
