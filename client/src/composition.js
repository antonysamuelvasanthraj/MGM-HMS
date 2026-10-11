/**
 * Composition of a medicine — one ingredient for a plain drug, several for a
 * combination (e.g. Amoxicillin 500 mg + Clavulanic acid 125 mg). Used by the
 * medicine master and by "New medicine" inside the GRN.
 */
import { esc } from './ui.js';

/** Parse a medicine's composition (stored JSON, or the joined generic / strength text). */
export function ingredients(m = {}) {
  try { const list = JSON.parse(m.composition || 'null'); if (Array.isArray(list) && list.length) return list; } catch {}
  const g = String(m.generic || '').split('+').map((x) => x.trim()).filter(Boolean);
  const s = String(m.strength || '').split('+').map((x) => x.trim());
  return g.map((generic, i) => ({ generic, strength: s[i] || '' }));
}

/** "Amoxicillin 500 mg + Clavulanic acid 125 mg" */
export const compositionText = (m) => ingredients(m).map((x) => `${x.generic}${x.strength ? ` ${x.strength}` : ''}`).join(' + ');

const row = (x = {}, listId = '') => `<div data-ing class="grid gap-2 items-end" style="grid-template-columns:minmax(0,1fr) 130px 32px">
  <div><label class="field-label">Generic / salt</label><input class="field field-sm !h-9" data-ing-g value="${esc(x.generic || '')}" ${listId ? `list="${listId}"` : ''} placeholder="e.g. Amoxicillin" autocomplete="off"></div>
  <div><label class="field-label">Strength</label><input class="field field-sm !h-9" data-ing-s value="${esc(x.strength || '')}" placeholder="500 mg"></div>
  <button type="button" class="btn-ghost !h-9 !w-8 !px-0" data-ing-rm aria-label="Remove ingredient">×</button></div>`;

/** Markup for the editor. `listId` points at a <datalist> of known generics. */
export function compositionEditor(m = {}, listId = '') {
  const list = ingredients(m);
  return `<fieldset class="rounded-lg border border-outline-variant p-3" data-composition>
    <legend class="px-1 field-label !mb-0">Composition</legend>
    <p class="text-body-sm text-on-surface-variant mb-2">One line per ingredient. A combination drug (e.g. Augmentin) has two or more.</p>
    <div class="space-y-2" data-ings>${(list.length ? list : [{}]).map((x) => row(x, listId)).join('')}</div>
    <button type="button" class="btn-ghost btn-sm mt-2" data-ing-add><span class="material-symbols-outlined text-[16px]">add</span>Add ingredient (combination)</button>
    <div class="text-body-sm mt-2" data-ing-preview></div>
  </fieldset>`;
}

/** Wire add / remove / preview; returns read() → [{generic, strength}]. */
export function wireComposition(root, listId = '') {
  const box = root.querySelector('[data-composition]');
  const host = box.querySelector('[data-ings]');
  const read = () => [...host.querySelectorAll('[data-ing]')].map((r) => ({ generic: r.querySelector('[data-ing-g]').value.trim(), strength: r.querySelector('[data-ing-s]').value.trim() })).filter((x) => x.generic);
  const preview = () => {
    const list = read();
    box.querySelector('[data-ing-preview]').innerHTML = list.length > 1
      ? `<span class="pill-info">Combination</span> ${esc(list.map((x) => `${x.generic} ${x.strength}`.trim()).join(' + '))}`
      : list.length ? esc(`${list[0].generic} ${list[0].strength}`.trim()) : '';
  };
  box.querySelector('[data-ing-add]').onclick = () => { host.insertAdjacentHTML('beforeend', row({}, listId)); host.lastElementChild.querySelector('[data-ing-g]').focus(); preview(); };
  host.addEventListener('click', (e) => { if (e.target.closest('[data-ing-rm]') && host.children.length > 1) { e.target.closest('[data-ing]').remove(); preview(); } });
  host.addEventListener('input', preview);
  preview();
  return read;
}
