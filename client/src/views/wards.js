/**
 * Wards & beds set-up — general wards, special / private rooms, ICU, NICU,
 * maternity, OT / recovery, ER observation. Each bed carries its own daily
 * tariff, which is what the IP bill charges. Moving a patient between beds is
 * done from the admission (Transfer bed), which bills each bed for its days.
 */
import { page, eyebrow, card, live, mountPage, api, can, esc, bind, money, pill, modal, toast, busy, apiError, confirmDialog } from './_kit.js';

const KIND = { general: 'General ward', special: 'Special rooms', private: 'Private rooms', icu: 'ICU', nicu: 'NICU', maternity: 'Maternity',
  ot: 'OT / recovery', er: 'Emergency observation', daycare: 'Day care' };

export async function mount(ctx) {
  const edit = can('admin.write');
  const root = mountPage(ctx, page({
    wide: true, eyebrow: eyebrow('Administration', 'bed'), title: 'Wards & beds',
    subtitle: 'The wards, rooms and beds patients can be admitted to or moved between, with each bed’s daily charge.',
    actions: edit ? '<button class="btn-primary" data-new-ward><span class="material-symbols-outlined text-[18px]">add</span>New ward / room type</button>' : '',
    body: '<div data-list class="space-y-4"></div>',
  }));
  let data = { wards: [], kinds: [] };

  async function load() {
    data = await api.get('/ipd/wards');
    root.querySelector('[data-list]').innerHTML = data.wards.map((w) => card({
      title: `${w.name}`, subtitle: `${KIND[w.kind] || w.kind} · ${esc(w.floor || '')} · ${w.beds} bed(s), ${w.occupied} occupied`,
      actions: edit ? `<button class="btn-secondary btn-sm" data-add-beds="${w.id}">Add beds</button><button class="btn-ghost btn-sm" data-edit-ward="${w.id}">Edit</button>` : '', pad: false,
      body: `<table class="tbl"><thead><tr><th>Bed</th><th>Class</th><th class="num">Daily charge</th><th>State</th><th></th></tr></thead><tbody>
        ${w.bed_list.map((b) => `<tr><td class="font-data-mono">${esc(b.bed_no)}</td><td class="capitalize">${esc(b.class)}</td><td class="num">${money(b.tariff)}</td><td>${pill(b.status)}</td>
          <td class="text-right whitespace-nowrap">${edit ? `<button class="btn-ghost btn-xs" data-edit-bed="${b.id}">Edit</button>${b.status !== 'occupied' ? `<button class="btn-ghost btn-xs" data-block="${b.id}" data-state="${b.status === 'blocked' ? 'vacant' : 'blocked'}">${b.status === 'blocked' ? 'Unblock' : 'Block'}</button>` : ''}` : ''}</td></tr>`).join('')
          || '<tr><td colspan="5" class="text-center py-6 text-on-surface-variant">No beds yet</td></tr>'}</tbody></table>`,
    })).join('');
  }

  const findBed = (id) => data.wards.flatMap((w) => w.bed_list).find((b) => b.id === +id);
  bind(root, 'click', '[data-new-ward]', () => wardForm(null, data.kinds, load));
  bind(root, 'click', '[data-edit-ward]', (e, b) => wardForm(data.wards.find((w) => w.id === +b.dataset.editWard), data.kinds, load));
  bind(root, 'click', '[data-add-beds]', (e, b) => bedsForm(data.wards.find((w) => w.id === +b.dataset.addBeds), load));
  bind(root, 'click', '[data-edit-bed]', (e, b) => bedForm(findBed(b.dataset.editBed), load));
  bind(root, 'click', '[data-block]', async (e, b) => {
    try { await api.patch(`/ipd/beds/${b.dataset.block}`, { status: b.dataset.state }); load(); } catch (err) { apiError(err); }
  });
  return live({ topics: ['ipd'], events: ['bed.updated', 'admission.created', 'admission.discharged'], load });
}

function wardForm(w, kinds, after) {
  modal({
    title: w ? `Edit ${w.name}` : 'New ward / room type', size: 'md',
    body: `<div class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Code</label><input class="field" data-f="code" value="${esc(w?.code || '')}" ${w ? 'readonly' : ''} placeholder="e.g. ICU-2"></div>
      <div><label class="field-label">Type</label><select class="field" data-f="kind">${kinds.map((k) => `<option value="${k}" ${k === w?.kind ? 'selected' : ''}>${esc(KIND[k] || k)}</option>`).join('')}</select></div>
      <div class="col-span-2"><label class="field-label">Name</label><input class="field" data-f="name" value="${esc(w?.name || '')}" placeholder="e.g. Surgical ICU"></div>
      <div><label class="field-label">Floor</label><input class="field" data-f="floor" value="${esc(w?.floor || '')}"></div>
      ${w ? '' : `<div><label class="field-label">Beds to create</label><input class="field" type="number" min="0" max="60" data-f="beds" value="4"></div>
      <div><label class="field-label">Bed class</label><input class="field" data-f="class" placeholder="general / deluxe / icu"></div>
      <div><label class="field-label">Daily charge per bed</label><input class="field" type="number" min="0" data-f="tariff" value="0"></div>`}</div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        const v = Object.fromEntries([...el.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.value.trim()]));
        busy(e.currentTarget, true);
        try {
          if (w) await api.patch(`/ipd/wards/${w.id}`, { name: v.name, floor: v.floor, kind: v.kind });
          else await api.post('/ipd/wards', { ...v, class: v.class || v.kind, beds: +v.beds || 0, tariff: +v.tariff || 0 });
          close(); toast('Ward saved', 'success'); after();
        } catch (err) { apiError(err, 'Ward not saved'); busy(e.currentTarget, false); }
      };
    },
  });
}

function bedsForm(w, after) {
  modal({
    title: `Add beds to ${w.name}`, size: 'sm',
    body: `<label class="field-label">How many</label><input class="field" type="number" min="1" max="60" data-count value="1">
      <label class="field-label mt-3">Class</label><input class="field" data-class value="${esc(w.bed_list[0]?.class || w.kind)}">
      <label class="field-label mt-3">Daily charge</label><input class="field" type="number" min="0" data-tariff value="${w.bed_list[0]?.tariff || 0}">`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Add beds</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        busy(e.currentTarget, true);
        try { await api.post(`/ipd/wards/${w.id}/beds`, { count: +el.querySelector('[data-count]').value, class: el.querySelector('[data-class]').value, tariff: +el.querySelector('[data-tariff]').value });
          close(); toast('Beds added', 'success'); after(); } catch (err) { apiError(err); busy(e.currentTarget, false); }
      };
    },
  });
}

function bedForm(b, after) {
  modal({
    title: `Bed ${b.bed_no}`, size: 'sm',
    body: `<label class="field-label">Bed number</label><input class="field" data-no value="${esc(b.bed_no)}">
      <label class="field-label mt-3">Class</label><input class="field" data-class value="${esc(b.class)}">
      <label class="field-label mt-3">Daily charge</label><input class="field" type="number" min="0" data-tariff value="${b.tariff}">
      <p class="text-body-sm text-on-surface-variant mt-2">A new charge applies to patients admitted or moved to this bed from now on.</p>`,
    footer: `${b.status !== 'occupied' ? '<button class="btn-ghost text-danger mr-auto" data-del>Remove bed</button>' : ''}<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>`,
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        busy(e.currentTarget, true);
        try { await api.patch(`/ipd/beds/${b.id}`, { bed_no: el.querySelector('[data-no]').value, class: el.querySelector('[data-class]').value, tariff: +el.querySelector('[data-tariff]').value });
          close(); toast('Bed saved', 'success'); after(); } catch (err) { apiError(err); busy(e.currentTarget, false); }
      };
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        const c = await confirmDialog({ title: `Remove ${b.bed_no}?`, message: 'Only a bed that has never had a patient can be removed; otherwise block it.', tone: 'danger', confirmLabel: 'Remove' });
        if (!c) return;
        try { await api.del(`/ipd/beds/${b.id}`); close(); toast('Bed removed', 'success'); after(); } catch (err) { apiError(err, 'Bed not removed'); }
      });
    },
  });
}
