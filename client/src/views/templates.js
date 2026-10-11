/** My Templates — the full-screen template editor the brief proposes. */
import {
  page, eyebrow, liveChip, kpiRow, card, live, mountPage, filterBar, wireFilters,
  apiError, busy, api, qs, state, can,
  $, $$, esc, bind, toast, modal, confirmDialog, renderRows, pill, fmtDate, kpi, emptyState,
} from './_kit.js';

let f = { kind: '' };
let cache = [];
let selected = null;

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    cache = await api.get(`/templates${qs(f)}`);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Templates available', value: cache.length, icon: 'article', sub: `${cache.filter((t) => t.owner_id === state.user.id).length} of them yours` },
      { label: 'Shared hospital-wide', value: cache.filter((t) => t.scope === 'hospital').length, icon: 'public', tone: 'info', sub: 'Everyone can use these' },
      { label: 'Most used', value: cache.length ? Math.max(...cache.map((t) => t.uses)) : 0, icon: 'trending_up', tone: 'success',
        sub: cache.length ? esc([...cache].sort((a, b) => b.uses - a.uses)[0].name) : '—' },
      { label: 'Total insertions', value: cache.reduce((s, t) => s + t.uses, 0), icon: 'content_paste', sub: 'Across all templates' },
    ].map(kpi).join('');
    paintList(root);
    if (selected && !cache.find((t) => t.id === selected.id)) selected = null;
    paintEditor(root, load);
  }

  bind(root, 'click', '[data-t]', (e, b) => { selected = cache.find((t) => t.id === +b.dataset.t); paintList(root); paintEditor(root, load); });
  bind(root, 'click', '[data-new]', () => { selected = { kind: 'consultation', scope: 'private', name: '', body: '' }; paintList(root); paintEditor(root, load); });

  return live({ topics: ['clinical'], events: ['template.saved', 'template.deleted'], load });
}

function layout() {
  return page({
    wide: true,
    eyebrow: `${eyebrow('Clinical authoring', 'article')} ${liveChip()}`,
    title: 'My Templates',
    subtitle: 'Reusable text for consultations, prescriptions, ultrasound reports and certificates. Keep a template private, share it with your department or publish it hospital-wide.',
    actions: can('template.write') ? `<button class="btn-primary" data-new>
      <span class="material-symbols-outlined text-[18px]">add</span> New template</button>` : '',
    body: `
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'select', key: 'kind', label: 'Kind', value: f.kind, options: [
        { value: '', label: 'All kinds' }, { value: 'consultation', label: 'Consultation' },
        { value: 'procedure', label: 'Procedure & OT' }, { value: 'lab', label: 'Laboratory report' },
        { value: 'prescription', label: 'Prescription' }, { value: 'usg', label: 'Ultrasound report' },
        { value: 'imaging', label: 'Imaging report (X-ray / CT / MRI / ECG / Echo)' }, { value: 'nursing', label: 'Nursing chart / note' },
        { value: 'certificate', label: 'Certificate' }] }])}
      <div class="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5 items-start">
        ${card({ title: 'Library', pad: false, body: `<div class="max-h-[62vh] overflow-y-auto" data-list></div>` })}
        <div data-editor></div>
      </div>`,
  });
}

function paintList(root) {
  const byKind = {};
  cache.forEach((t) => { (byKind[t.kind] ??= []).push(t); });
  $('[data-list]', root).innerHTML = cache.length ? Object.entries(byKind).map(([kind, list]) => `
    <div>
      <div class="px-3 py-1.5 bg-surface-container-low font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">${esc(kind)}</div>
      ${list.map((t) => `<button class="w-full text-left px-3 py-2.5 border-b border-outline-variant/60
        hover:bg-surface-container-low ${selected?.id === t.id ? 'bg-primary-fixed/50' : ''}" data-t="${t.id}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-label-lg text-label-lg truncate">${esc(t.name)}</span>
          <span class="font-data-mono text-label-sm text-on-surface-variant">${t.uses}</span></div>
        <div class="flex items-center gap-1.5 mt-0.5">
          ${t.scope === 'private' ? '<span class="pill-neutral">Private</span>' : `<span class="pill-info">${esc(t.scope)}</span>`}
          <span class="text-label-sm text-on-surface-variant truncate">${esc(t.owner_name || '')}</span></div>
      </button>`).join('')}
    </div>`).join('')
    : `<div class="p-4">${emptyState('article', 'No templates yet', 'Create one to speed up routine documentation.')}</div>`;
}

function paintEditor(root, reload) {
  const host = $('[data-editor]', root);
  if (!selected) {
    host.innerHTML = card({ body: emptyState('edit_note', 'Pick a template',
      'Choose one on the left to read or edit it, or create a new one.') });
    return;
  }
  const mine = !selected.id || selected.owner_id === state.user.id || state.user.role === 'admin';
  host.innerHTML = card({
    title: selected.id ? selected.name : 'New template',
    subtitle: selected.id ? `${selected.uses} insertions · last updated ${fmtDate(selected.updated_at)}` : 'Not saved yet',
    actions: selected.id && mine ? `<button class="btn-ghost btn-sm" data-del>
      <span class="material-symbols-outlined text-[15px]">delete</span> Delete</button>` : '',
    body: `<form data-tf class="space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-1"><label class="field-label">Name</label>
          <input class="field" name="name" value="${esc(selected.name || '')}" ${mine ? '' : 'readonly'}></div>
        <div><label class="field-label">Kind</label><select class="field" name="kind" ${mine ? '' : 'disabled'}>
          ${['consultation', 'procedure', 'lab', 'prescription', 'usg', 'certificate'].map((k) => `<option value="${k}" ${k === selected.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div><label class="field-label">Visibility</label><select class="field" name="scope" ${mine ? '' : 'disabled'}>
          <option value="private" ${selected.scope === 'private' ? 'selected' : ''}>Private to me</option>
          <option value="department" ${selected.scope === 'department' ? 'selected' : ''}>My department</option>
          <option value="hospital" ${selected.scope === 'hospital' ? 'selected' : ''}>Whole hospital</option></select></div>
      </div>
      <div><label class="field-label">Body — use __ where the clinician fills in a value</label>
        <textarea class="field font-data-mono !text-[13px] !leading-5" rows="18" name="body" ${mine ? '' : 'readonly'}>${esc(selected.body || '')}</textarea></div>
      ${mine ? `<div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" data-preview>Preview</button>
        <button type="button" class="btn-primary" data-save>
          <span class="material-symbols-outlined text-[17px]">save</span> Save template</button></div>`
        : `<p class="text-body-sm text-on-surface-variant">This template belongs to ${esc(selected.owner_name || 'another user')} — you can use it but not edit it.</p>`}
    </form>`,
  });

  const form = host.querySelector('[data-tf]');
  host.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
    if (!form.name.value.trim()) { toast('Give the template a name', 'warning'); return; }
    const actionButton = ev.currentTarget;
    busy(actionButton, true);
    try {
      const saved = await api.post('/templates', { id: selected.id, ...Object.fromEntries(new FormData(form)) });
      selected = saved; toast('Template saved', 'success'); reload();
    } catch (e) { apiError(e); busy(actionButton, false); }
  });
  host.querySelector('[data-preview]')?.addEventListener('click', () => {
    modal({ title: form.name.value || 'Preview', size: 'md',
      body: `<pre class="whitespace-pre-wrap font-sans text-body-lg">${esc(form.body.value)}</pre>`,
      footer: `<button class="btn-secondary" data-close>Close</button>` });
  });
  host.querySelector('[data-del]')?.addEventListener('click', async () => {
    const r = await confirmDialog({ title: `Delete “${selected.name}”?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' });
    if (!r) return;
    await api.del(`/templates/${selected.id}`);
    selected = null; toast('Template deleted', 'success'); reload();
  });
}
