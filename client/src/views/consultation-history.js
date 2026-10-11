/** Consultation history & amendments — the clinical audit view. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, doctorOptions, downloadCSV,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, money, fmtDate, fmtDateTime,
  kpi, todayISO, emptyState,
} from './_kit.js';

let f = { doctor_id: '', status: '', date: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const rows = await api.get(`/consultations${qs(f)}`);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Notes shown', value: rows.length, icon: 'description', sub: f.date ? fmtDate(f.date) : 'Most recent first' },
      { label: 'Signed', value: rows.filter((r) => r.status === 'signed').length, icon: 'draw', tone: 'success', sub: 'Locked for amendment' },
      { label: 'Still draft', value: rows.filter((r) => r.status === 'draft').length, icon: 'edit_note',
        tone: rows.filter((r) => r.status === 'draft').length ? 'warning' : 'success', sub: 'Not yet signed off' },
      { label: 'Amended', value: rows.filter((r) => r.amendments > 0).length, icon: 'history',
        tone: 'info', sub: 'Every change carries a reason' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No consultation notes match this filter.' });
    $('[data-count]', root).textContent = `${rows.length} note(s)`;
  }

  bind(root, 'click', '[data-act="open"]', (e, b) => openNote(+b.closest('tr').dataset.id));
  bind(root, 'click', '[data-act="visit"]', (e, b) => navigate(`/visit/${b.dataset.enc}`));
  bind(root, 'click', '[data-export]', () => downloadCSV('consultations.csv', cache.map((c) => ({
    date: c.created_at, uhid: c.uhid, patient: c.patient_name, doctor: c.doctor_name,
    complaint: c.chief_complaint, diagnosis: c.diagnosis, status: c.status, amendments: c.amendments,
    follow_up: c.follow_up_date,
  }))));

  return live({ topics: ['clinical'], events: ['consultation.saved'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Clinical records', 'history')} ${liveChip()}`,
    title: 'Consultation History & Amendments',
    subtitle: 'A signed note is never overwritten. Any later change is stored as an amendment with the original text, the reason and who made it.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'select', key: 'doctor_id', label: 'Doctor', value: f.doctor_id, options: doctorOptions(), width: 'min-w-[240px]' },
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'signed', label: 'Signed' }, { value: 'amended', label: 'Amended' }] },
        { type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' },
      ])}
      ${tableCard({
        title: 'Consultation notes', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Date', width: '130px' }, { label: 'Patient' }, { label: 'Doctor' },
          { label: 'Complaint' }, { label: 'Diagnosis' }, { label: 'Review' },
          { label: 'Status' }, { label: '', width: '130px' }],
      })}`,
  });
}

function rowHTML(c) {
  return `
    <td><div class="text-body-sm">${fmtDate(c.created_at)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.encounter_no || '')}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(c.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.uhid)} · ${c.age_years ?? '—'}y ${esc((c.gender || '')[0] || '')}</div></td>
    <td class="text-body-md">${esc(c.doctor_name || '—')}</td>
    <td class="text-body-md max-w-[180px] truncate" title="${esc(c.chief_complaint || '')}">${esc(c.chief_complaint || '—')}</td>
    <td class="text-body-md max-w-[180px] truncate" title="${esc(c.diagnosis || '')}">${esc(c.diagnosis || '—')}</td>
    <td class="text-body-sm">${c.follow_up_date ? fmtDate(c.follow_up_date) : '—'}</td>
    <td>${pill(c.status)}${c.amendments ? `<span class="pill-warning pill-dot">${c.amendments} amendment(s)</span>` : ''}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="open">Read</button>
      ${c.encounter_id ? `<button class="btn-ghost btn-xs" data-act="visit" data-enc="${c.encounter_id}" title="Visit">
        <span class="material-symbols-outlined text-[15px]">open_in_new</span></button>` : ''}
    </td>`;
}

async function openNote(id) {
  const c = await api.get(`/consultations/${id}`);
  const fld = (label, v) => v ? `<div class="mb-3">
    <div class="field-label">${label}</div><div class="text-body-lg whitespace-pre-line">${esc(v)}</div></div>` : '';
  drawer({
    title: `${c.patient_name} — ${fmtDate(c.created_at)}`,
    subtitle: `${esc(c.uhid)} · ${esc(c.doctor_name || '')} · ${esc(c.encounter_no || '')}`,
    width: 'max-w-2xl',
    body: `<div class="p-5">
      <div class="flex items-center gap-2 mb-4">${pill(c.status)}
        ${c.signed_at ? `<span class="text-body-sm text-on-surface-variant">Signed ${fmtDateTime(c.signed_at)}</span>` : ''}</div>
      ${fld('Chief complaint', c.chief_complaint)}${fld('History of present illness', c.hopi)}
      ${fld('Past history', c.past_history)}${fld('Examination', c.examination)}
      ${c.diagnosis ? `<div class="mb-3 p-3 rounded-lg bg-primary-fixed/60">
        <div class="field-label !text-primary">Diagnosis</div>
        <div class="font-title-md text-title-md">${esc(c.diagnosis)}${c.icd_codes ? ` <span class="font-data-mono text-body-sm">(${esc(c.icd_codes)})</span>` : ''}</div></div>` : ''}
      ${fld('Plan', c.plan)}${fld('Advice', c.advice)}
      ${c.follow_up_date ? `<div class="text-body-md">Review on <strong>${fmtDate(c.follow_up_date)}</strong></div>` : ''}
      ${c.amendments.length ? `<div class="mt-5">
        <h3 class="panel-title mb-2">Amendment trail</h3>
        <ol class="space-y-2">${c.amendments.map((a) => `
          <li class="p-3 rounded-lg border border-warning/30 bg-warning-bg/40">
            <div class="flex items-center justify-between gap-2">
              <span class="font-label-lg text-label-lg capitalize">${esc(a.field.replace(/_/g, ' '))}</span>
              <span class="text-label-sm text-on-surface-variant">${fmtDateTime(a.amended_at)} · ${esc(a.amended_by_name || '')}</span></div>
            <div class="text-body-md mt-1"><span class="text-on-surface-variant line-through">${esc((a.old_value || '—').slice(0, 220))}</span></div>
            <div class="text-body-md">${esc((a.new_value || '').slice(0, 220))}</div>
            <div class="text-body-sm text-warning mt-1">Reason: ${esc(a.reason)}</div>
          </li>`).join('')}</ol></div>` : ''}
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      ${c.encounter_id ? `<a class="btn-primary" href="/visit/${c.encounter_id}" data-close>Open visit</a>` : ''}`,
  });
}
