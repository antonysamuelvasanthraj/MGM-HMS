/** Ultrasound reporting with structured templates. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, renderRows, pill, priorityPill, fmtDate, fmtDateTime, fmtTime,
  kpi, emptyState, todayISO,
} from './_kit.js';
import { openReport, printImagingReport } from './imaging.js';

let f = { status: 'open', q: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [w, templates] = await Promise.all([
      api.get(`/imaging/worklist${qs({ ...f, modality: 'USG' })}`),
      api.get('/templates?kind=usg').catch(() => []),
    ]);
    cache = w.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Ultrasound worklist', value: w.rows.length, icon: 'pregnant_woman', sub: 'Filtered to USG' },
      { label: 'Awaiting report', value: w.rows.filter((r) => ['ordered', 'scheduled', 'in_progress'].includes(r.status)).length,
        icon: 'schedule', tone: 'warning', sub: 'Scanned or booked' },
      { label: 'Draft reports', value: w.rows.filter((r) => r.status === 'reported').length, icon: 'edit_document',
        tone: 'info', sub: 'Need sign-off' },
      { label: 'Report templates', value: templates.length, icon: 'article', tone: 'success', sub: 'Available to insert' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), w.rows, rowHTML, { empty: 'No ultrasound studies in this filter.' });
    $('[data-templates]', root).innerHTML = templates.length
      ? `<ul class="divide-y divide-outline-variant">${templates.map((t) => `
          <li class="p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-label-lg text-label-lg">${esc(t.name)}</span>
              <span class="font-data-mono text-label-sm text-on-surface-variant">${t.uses} uses</span></div>
            <pre class="text-body-sm text-on-surface-variant mt-1 whitespace-pre-wrap font-sans max-h-16 overflow-hidden">${esc(t.body.slice(0, 180))}…</pre>
          </li>`).join('')}</ul>`
      : `<div class="p-4">${emptyState('article', 'No USG templates', can('template.write') ? 'Create them in My Templates.' : 'Ask a staff member with template access to create USG templates.')}</div>`;
    $('[data-count]', root).textContent = `${w.rows.length} study(ies)`;
  }

  bind(root, 'click', '[data-act]', (e, b) => {
    const id = +b.closest('tr').dataset.id;
    if (b.dataset.act === 'report') openReport(id, load);
    if (b.dataset.act === 'print') printImagingReport(id);
  });

  return live({ topics: ['imaging'], events: ['orders.created', 'order.updated', 'imaging.reported', 'imaging.signed', 'template.saved'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Ultrasound', 'pregnant_woman')} ${liveChip()}`,
    title: 'USG Reporting',
    subtitle: 'Structured ultrasound reporting with reusable templates; a signed report is released to the referring doctor immediately.',
    actions: `${can('template.write') ? '<a href="/templates" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">article</span> Manage templates</a>' : ''}
      <a href="/imaging" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">radiology</span> All imaging</a>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Patient, UHID or order' },
        { type: 'select', key: 'status', label: 'Stage', value: f.status, options: [
          { value: 'open', label: 'All open' }, { value: 'all', label: 'Everything' },
          { value: 'ordered', label: 'Ordered' }, { value: 'scheduled', label: 'Scheduled' },
          { value: 'in_progress', label: 'In the scan room' }, { value: 'reported', label: 'Draft report' },
          { value: 'verified', label: 'Signed' }] },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Ultrasound worklist', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '60vh',
          columns: [{ label: 'Order', width: '140px' }, { label: 'Patient' }, { label: 'Study' },
            { label: 'Priority' }, { label: 'Room' }, { label: 'Stage' }, { label: '', width: '150px' }],
        })}
        ${card({ title: 'Report templates', pad: false, body: `<div class="max-h-[60vh] overflow-y-auto" data-templates></div>` })}
      </div>`,
  });
}

function rowHTML(r) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(r.order_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(r.ordered_at)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}</div></td>
    <td class="text-body-md">${esc(r.label)}</td>
    <td>${priorityPill(r.priority)}</td>
    <td class="font-data-mono text-body-sm">${esc(r.room || '—')}</td>
    <td>${pill(r.status)}</td>
    <td class="text-right whitespace-nowrap">
      ${r.status !== 'verified' && can('imaging.report') ? `<button class="btn-primary btn-xs" data-act="report">${r.status === 'reported' ? 'Edit / sign' : 'Report'}</button>` : ''}
      ${r.status === 'verified' ? `<button class="btn-secondary btn-xs" data-act="print">Report</button>` : ''}
    </td>`;
}
