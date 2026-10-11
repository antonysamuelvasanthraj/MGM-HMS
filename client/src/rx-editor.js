/**
 * Prescription lines for the consultation screen.
 *
 * The drug box searches the pharmacy master from the first letter (names that
 * start with what was typed come first) and shows generic, brand, form, stock
 * and schedule, so two brands of the same drug are easy to tell apart. Picking
 * a drug links it to the pharmacy. Frequency is a ready list; quantity follows
 * frequency × days; instructions are a standard phrase plus an optional note.
 */
import { api, qs } from './api.js';
import { esc, debounce } from './ui.js';
import { compositionText } from './composition.js';

export const FREQUENCIES = [
  ['1-0-1', 'Twice a day (morning, night)', 2], ['1-1-1', 'Three times a day', 3], ['1-0-0', 'Once — morning', 1],
  ['0-0-1', 'Once — night', 1], ['0-1-0', 'Once — afternoon', 1], ['1-1-0', 'Morning & afternoon', 2], ['0-1-1', 'Afternoon & night', 2],
  ['1-1-1-1', 'Four times a day', 4], ['Every 6 hours', 'Every 6 hours', 4], ['Every 8 hours', 'Every 8 hours', 3],
  ['Alternate days', 'Alternate days', 0.5], ['Once a week', 'Once a week', 1 / 7], ['SOS', 'SOS — when needed', 0], ['STAT', 'STAT — once, now', 0],
];
export const INSTRUCTIONS = ['After food', 'Before food', 'With food', 'Empty stomach', 'At bedtime', 'In the morning',
  'With plenty of water', 'Do not crush or chew', 'Apply locally', 'As directed'];
const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhaled', 'PR', 'Eye', 'Ear', 'Nasal', 'SL'];
const LIQUID = /syrup|suspension|ointment|cream|gel|drops|lotion|powder|inhaler|spray/i;

const routeFor = (form = '') => (/inj/i.test(form) ? 'IV' : /ointment|cream|gel|lotion/i.test(form) ? 'Topical' : /drop/i.test(form) ? 'Eye'
  : /inhal|spray/i.test(form) ? 'Inhaled' : 'Oral');

function splitInstructions(text = '') {
  const preset = INSTRUCTIONS.find((p) => text.toLowerCase().startsWith(p.toLowerCase()));
  return preset ? { preset, note: text.slice(preset.length).replace(/^[;,.\s]+/, '') } : { preset: '', note: text };
}

export function scheduleTag(m) {
  if (!m) return '';
  if (m.narcotic) return '<span class="pill-danger">Narcotic</span>';
  if (m.schedule === 'X') return '<span class="pill-danger">Sch X</span>';
  if (m.schedule === 'H1') return '<span class="pill-warning">Sch H1</span>';
  if (m.schedule === 'H') return '<span class="pill-neutral">Sch H</span>';
  return m.schedule ? `<span class="pill-neutral">${esc(m.schedule)}</span>` : '';
}

/** One editable prescription line. */
export function rxRow(i = {}) {
  const freq = FREQUENCIES.some(([v]) => v === i.frequency) || !i.frequency ? FREQUENCIES : [[i.frequency, i.frequency, 0], ...FREQUENCIES];
  const { preset, note } = splitInstructions(i.instructions || '');
  return `<div data-rx-row data-med="${i.medicine_id || ''}" data-form="${esc(i.form || '')}" class="p-3 space-y-2">
  <div class="grid gap-2" style="grid-template-columns:minmax(0,1fr) 110px 32px">
    <div class="relative min-w-0">
      <label class="field-label">Drug</label>
      <input class="field field-sm" name="drug" value="${esc(i.drug || '')}" placeholder="Type a letter to search the pharmacy…" autocomplete="off" aria-autocomplete="list">
      <input type="hidden" name="dose" value="${esc(i.dose || '')}">
      <div data-meta class="text-label-sm text-on-surface-variant mt-0.5 truncate">${i.drug && !i.medicine_id ? 'Not linked to pharmacy stock' : ''}</div>
      <div data-sugg class="hidden absolute left-0 top-[62px] z-40 w-[460px] max-w-[85vw] card shadow-md max-h-80 overflow-y-auto" role="listbox"></div>
    </div>
    <div><label class="field-label">Route</label><select class="field field-sm" name="route">${ROUTES.map((r) => `<option ${r === (i.route || 'Oral') ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div class="pt-5"><button type="button" class="btn-ghost btn-xs !h-8" data-del-rx aria-label="Remove drug"><span class="material-symbols-outlined text-[16px]">delete</span></button></div>
  </div>
  <div class="grid gap-2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr))">
    <div><label class="field-label">Frequency</label><select class="field field-sm" name="frequency"><option value="">Choose…</option>${freq.map(([v, l]) => `<option value="${esc(v)}" ${v === i.frequency ? 'selected' : ''}>${esc(v === l ? v : `${v} · ${l}`)}</option>`).join('')}</select></div>
    <div><label class="field-label">Days</label><input class="field field-sm" name="duration_days" type="number" min="1" value="${i.duration_days ?? ''}"></div>
    <div><label class="field-label">Qty</label><input class="field field-sm" name="qty" type="number" min="0" value="${i.qty ?? ''}" title="Frequency × days — you can change it"></div>
    <div><label class="field-label">Instruction</label><select class="field field-sm" name="ins_preset"><option value="">—</option>${INSTRUCTIONS.map((p) => `<option ${p === preset ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div><label class="field-label">Note</label><input class="field field-sm" name="ins_note" value="${esc(note)}" placeholder="Extra instruction"></div>
  </div>
</div>`;
}

/** Quantity from frequency and days; liquids and creams default to one pack. */
export function autoQty(frequency, days, form) {
  const f = FREQUENCIES.find(([v]) => v === frequency);
  if (!f || !days) return '';
  if (frequency === 'STAT') return 1;
  if (!f[2]) return '';
  if (LIQUID.test(form || '')) return 1;
  return Math.ceil(f[2] * days);
}

/** Read the lines back for saving and printing. */
export function readRx(root, { preserveBlank = false } = {}) {
  return [...root.querySelectorAll('[data-rx-row]')].map((tr) => {
    const g = (n) => tr.querySelector(`[name="${n}"]`)?.value ?? '';
    const ins = [g('ins_preset'), g('ins_note').trim()].filter(Boolean).join('; ');
    return { drug: g('drug').trim(), medicine_id: tr.dataset.med ? +tr.dataset.med : undefined, dose: g('dose'), route: g('route'),
      frequency: g('frequency'), duration_days: g('duration_days'), qty: g('qty'), instructions: ins };
  }).filter((i) => preserveBlank || i.drug);
}

/** Wire search, quantity and keyboard behaviour on a tbody of lines. */
export function wireRx(tbody) {
  const recalc = (tr) => {
    const q = autoQty(tr.querySelector('[name="frequency"]').value, +tr.querySelector('[name="duration_days"]').value, tr.dataset.form);
    if (q !== '') tr.querySelector('[name="qty"]').value = q;
  };
  const pick = (tr, m) => {
    tr.dataset.med = m.id;
    tr.dataset.form = m.form || '';
    tr.querySelector('[name="drug"]').value = m.name;
    tr.querySelector('[name="dose"]').value = m.strength || '';
    tr.querySelector('[name="route"]').value = routeFor(m.form);
    tr.querySelector('[data-meta]').innerHTML = `${esc([compositionText(m), m.brand, m.form].filter(Boolean).join(' · '))} ${scheduleTag(m)}
      <span class="${m.location_stock > 0 ? 'text-success' : 'text-danger'}">· ${m.location_stock > 0 ? `${m.location_stock} in stock` : 'out of stock'}</span>`;
    tr.querySelector('[data-sugg]').classList.add('hidden');
    recalc(tr);
    tr.querySelector('[name="frequency"]').focus();
  };
  const search = debounce(async (tr) => {
    const input = tr.querySelector('[name="drug"]');
    const box = tr.querySelector('[data-sugg]');
    const q = input.value.trim();
    if (!q) { box.classList.add('hidden'); return; }
    let rows = [];
    try { rows = (await api.get(`/pharmacy/medicines${qs({ q, limit: 12, active: 1, location: 'OP' })}`)).rows; } catch { return; }
    tr._results = rows;
    tr._active = 0;
    box.innerHTML = rows.length ? rows.map((m, n) => `<button type="button" role="option" data-pick="${n}" class="w-full text-left px-3 py-2 border-b border-outline-variant/60 last:border-0 ${n === 0 ? 'bg-primary-fixed/50' : ''} hover:bg-surface-container-low">
        <div class="flex items-center justify-between gap-2"><span class="font-label-lg">${esc(m.name)}</span>${scheduleTag(m)}</div>
        <div class="text-body-sm text-on-surface-variant">${esc([compositionText(m), m.brand, m.form, m.manufacturer].filter(Boolean).join(' · '))}
          · <span class="${m.location_stock > 0 ? 'text-success' : 'text-danger'}">${m.location_stock > 0 ? `${m.location_stock} in stock` : 'out of stock'}</span></div></button>`).join('')
      : `<div class="px-3 py-2 text-body-md text-on-surface-variant">Not in the pharmacy master — it will print as typed.</div>`;
    box.classList.remove('hidden');
  }, 150);
  const highlight = (tr) => [...tr.querySelectorAll('[data-pick]')].forEach((b, n) => b.classList.toggle('bg-primary-fixed/50', n === tr._active));

  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('[data-rx-row]');
    if (!tr) return;
    if (e.target.name === 'drug') { tr.dataset.med = ''; tr.querySelector('[data-meta]').textContent = ''; search(tr); }
    if (e.target.name === 'duration_days') recalc(tr);
  });
  tbody.addEventListener('change', (e) => { const tr = e.target.closest('[data-rx-row]'); if (tr && e.target.name === 'frequency') recalc(tr); });
  tbody.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    e.preventDefault();
    const tr = b.closest('[data-rx-row]');
    pick(tr, tr._results[+b.dataset.pick]);
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.target.name !== 'drug') return;
    const tr = e.target.closest('[data-rx-row]');
    const box = tr.querySelector('[data-sugg]');
    if (box.classList.contains('hidden') || !tr._results?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); tr._active = Math.min(tr._results.length - 1, tr._active + 1); highlight(tr); }
    if (e.key === 'ArrowUp') { e.preventDefault(); tr._active = Math.max(0, tr._active - 1); highlight(tr); }
    if (e.key === 'Enter') { e.preventDefault(); pick(tr, tr._results[tr._active]); }
    if (e.key === 'Escape') box.classList.add('hidden');
  });
  tbody.addEventListener('focusout', (e) => {
    if (e.target.name !== 'drug') return;
    const tr = e.target.closest('[data-rx-row]');
    setTimeout(() => tr?.querySelector('[data-sugg]')?.classList.add('hidden'), 150);
  });
}
