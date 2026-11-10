/** Patient Record — find any patient (old or new) and open their full record, or register someone new. */
import { page, eyebrow, liveChip, card, mountPage, patientPicker, api, can, navigate, $, esc, toast, money, fmtDate } from './_kit.js';
import { openNewPatient } from './op-registration.js';

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  patientPicker($('[data-record-picker]', root), (p) => { navigate(`/patient/${p.id}`); }, { placeholder: 'UHID, name or mobile — any patient, old or new', autofocus: true });
  $('[data-new]', root)?.addEventListener('click', () => openNewPatient((p) => { toast(`${p.name} · ${p.uhid}`, 'success'); navigate(`/patient/${p.id}`); }));
  const recent = await api.get('/patients?limit=12').catch(() => ({ rows: [] }));
  $('[data-recent]', root).innerHTML = recent.rows.length
    ? `<table class="tbl"><thead><tr><th>UHID</th><th>Patient</th><th>Age / sex</th><th>Mobile</th><th class="num">Due</th><th></th></tr></thead><tbody>${recent.rows.map((p) => `<tr>
        <td class="font-data-mono">${esc(p.uhid)}</td><td class="font-label-lg">${esc(p.name)}</td><td>${p.age_years ?? '—'}y · ${esc(p.gender || '')}</td><td>${esc(p.mobile || '—')}</td>
        <td class="num ${p.outstanding > 0 ? 'text-danger font-semibold' : ''}">${p.outstanding > 0 ? money(p.outstanding) : '—'}</td>
        <td class="text-right"><a class="btn-secondary btn-xs" href="/patient/${p.id}">Open record</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="p-4 text-body-md text-on-surface-variant">No patients yet.</p>';
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Reception', 'folder_shared')} ${liveChip()}`,
    title: 'Patient Record',
    subtitle: 'Search any patient to see their visits, bills, documents and pharmacy orders in one place.',
    actions: can('patient.create') ? '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">person_add</span> New patient</button>' : '',
    body: `${card({ title: 'Find a patient', body: '<div class="max-w-xl" data-record-picker></div><p class="text-body-sm text-on-surface-variant mt-2">Type at least two letters or digits. Pick the patient to open the record.</p>' })}
      ${card({ title: 'Recently registered', pad: false, body: '<div data-recent><p class="p-4 text-body-md text-on-surface-variant">Loading…</p></div>' })}`,
  });
}
