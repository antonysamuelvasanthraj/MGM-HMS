/**
 * Housekeeping — beds waiting to be cleaned after a discharge or transfer. Marking a bed clean makes it
 * vacant again on the bed board and the admission form at once, so the next patient can be admitted.
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, toast, apiError, busy, bind, kpiRow, kpi, emptyState, fmtDateTime, mins, $ } from './_kit.js';

export async function mount(ctx) {
  const root = mountPage(ctx, page({
    eyebrow: `${eyebrow('Housekeeping', 'cleaning_services')} ${liveChip()}`,
    title: 'Beds to clean',
    subtitle: 'A discharged or transferred patient leaves the bed for cleaning. Mark it clean when it is ready — it becomes available to admit at once.',
    body: `${kpiRow([], 3)}${card({ title: 'Waiting for cleaning', subtitle: 'Longest waiting first', pad: false, body: '<div data-list></div>' })}`,
  }));

  async function load() {
    const rows = await api.get('/ipd/housekeeping');
    const long = rows.filter((r) => r.waiting_minutes > 60).length;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Beds to clean', value: rows.length, icon: 'cleaning_services', tone: rows.length ? 'warning' : 'success', sub: rows.length ? 'Not available to admit' : 'Every bed is ready' },
      { label: 'Waiting over an hour', value: long, icon: 'timer', tone: long ? 'danger' : 'success', sub: 'Turn these round first' },
      { label: 'Longest wait', value: rows[0] ? mins(rows[0].waiting_minutes) : '—', icon: 'hourglass_top', tone: 'info', sub: rows[0] ? `${rows[0].ward_name} · ${rows[0].bed_no}` : '' },
    ].map(kpi).join('');
    $('[data-list]', root).innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Bed</th><th>Ward</th><th>Last patient</th><th>Waiting</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-bed="${r.id}">
        <td class="font-data-mono font-bold">${esc(r.bed_no)}<div class="text-label-sm text-on-surface-variant font-normal">${esc(r.class || '')}</div></td>
        <td class="text-body-md">${esc(r.ward_name)}${r.floor ? `<div class="text-label-sm text-on-surface-variant">${esc(r.floor)}</div>` : ''}</td>
        <td class="text-body-md">${esc(r.last_patient || '—')}${r.last_discharge ? `<div class="text-label-sm text-on-surface-variant">left ${fmtDateTime(r.last_discharge)}</div>` : ''}</td>
        <td class="${r.waiting_minutes > 60 ? 'text-danger font-semibold' : ''}">${r.waiting_minutes !== null ? mins(r.waiting_minutes) : '—'}</td>
        <td class="text-right"><button class="btn-primary btn-xs" data-clean>Mark clean</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="p-4">${emptyState('task_alt', 'All beds are clean', 'Nothing is waiting.')}</div>`;
  }

  bind(root, 'click', '[data-clean]', async (e, b) => {
    busy(b, true);
    try { const bed = await api.post(`/ipd/beds/${b.closest('tr').dataset.bed}/cleaned`, {}); toast(`Bed ${bed.bed_no} is ready`, 'success'); load(); }
    catch (err) { apiError(err); busy(b, false); }
  });

  return live({ topics: ['ipd', 'dashboard'], events: ['bed.updated', 'admission.discharged', 'admission.updated', 'admission.created'], load, interval: 60000 });
}
