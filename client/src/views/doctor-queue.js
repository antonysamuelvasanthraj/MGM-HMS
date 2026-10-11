/**
 * Doctor Queue — outpatient routing.
 *
 * Shows which patients are genuinely callable and, for those who are not, the
 * exact reason (fee pending, vitals missing). Emergency work never passes
 * through this gate.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  doctorOptions, deptOptions, vitalAlerts, apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, renderRows, pill, priorityPill, money, fmtTime, todayISO, ago, kpi,
  mins, emptyState,
} from './_kit.js';
import { openVitals } from './vitals-queue.js';
import { openCollect } from './op-registration.js';

let f = { date: todayISO(), doctor_id: '', department_id: '' };

export async function mount(ctx) {
  if (!f.doctor_id && state.user.role === 'doctor') f.doctor_id = String(state.user.id);
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const { rows, counts } = await api.get(`/queue${qs(f)}`);
    const live_ = rows.filter((r) => !['closed', 'cancelled'].includes(r.stage));
    const serving = live_.filter((r) => r.stage === 'in_consult');
    const ready = live_.filter((r) => ['vitals_done', 'ready'].includes(r.stage));
    const blocked = ready.filter((r) => blockReasons(r).length);
    const waitMins = live_.filter((r) => r.opened_at).map((r) => (Date.now() - new Date(r.opened_at.replace(' ', 'T'))) / 60000);

    $('[data-kpis]', root).innerHTML = [
      { label: 'In consultation', value: serving.length, icon: 'stethoscope', tone: 'success', sub: serving.map((s) => `Tok ${s.token_no}`).join(' · ') || 'No one called in' },
      { label: 'Ready to be called', value: ready.length - blocked.length, icon: 'groups', tone: 'info', sub: `${blocked.length} held back` },
      { label: 'Held back', value: blocked.length, icon: 'block', tone: blocked.length ? 'warning' : 'success', sub: 'Fee or vitals outstanding' },
      { label: 'Average wait', value: mins(waitMins.length ? waitMins.reduce((a, b) => a + b, 0) / waitMins.length : 0), icon: 'timer', sub: `${counts.consulted} consulted today` },
    ].map(kpi).join('');

    renderRows($('[data-rows]', root), ready.concat(live_.filter((r) => ['registered', 'vitals_pending'].includes(r.stage))), rowHTML,
      { empty: 'Nobody is waiting for this doctor right now.' });
    renderRows($('[data-serving]', root), serving, servingHTML, { empty: 'No patient is with the doctor.' });
    renderRows($('[data-done]', root), live_.filter((r) => ['consulted', 'services_pending'].includes(r.stage)).slice(0, 30), doneHTML,
      { empty: 'No consultations completed yet.' });
    $('[data-count]', root).textContent = `${ready.length} ready`;
  }

  bind(root, 'click', '[data-call-next]', async (e, b) => {
    if (!f.doctor_id && !can('consult.write')) { toast('Pick a doctor first', 'warning'); return; }
    busy(b, true, 'Calling');
    try {
      const r = await api.post('/queue/call-next', f.doctor_id ? { doctor_id: +f.doctor_id } : {});
      if (r.called) {
        toast(`Token ${r.called.token_no} — ${r.called.patient_name}`, 'success', { title: 'Called in' });
        if (can('consult.write') && r.called.id) { navigate(`/consultation?encounter=${r.called.id}`); return; }
      }
      else toast(r.message || 'No eligible patient waiting', 'warning');
      load();
    } catch (err) { apiError(err); } finally { busy(b, false); }
  });

  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    if (act === 'call') {
      try {
        await api.post(`/encounters/${id}/stage`, { stage: 'in_consult' }); toast('Patient called in', 'success');
        if (can('consult.write')) { navigate(`/consultation?encounter=${id}`); return; }
        load();
      }
      catch (err) { apiError(err, 'Cannot call this patient in yet'); }
    }
    if (act === 'consult') navigate(`/consultation?encounter=${id}`);
    if (act === 'vitals') openVitals(id, load);
    if (act === 'collect') openCollect(id, load);
    if (act === 'complete') { await api.post(`/encounters/${id}/stage`, { stage: 'consulted' }); load(); }
    if (act === 'close') { await api.post(`/encounters/${id}/stage`, { stage: 'closed' }); toast('Visit closed', 'success'); load(); }
    if (act === 'visit') navigate(`/visit/${id}`);
  });

  return live({
    topics: ['queue', 'opd', 'clinical'],
    events: ['encounter.created', 'encounter.stage', 'queue.called', 'vitals.recorded', 'payment.received', 'consultation.saved'],
    load, interval: 30000,
  });
}

function blockReasons(r) {
  const out = [];
  if (r.priority === 'emergency') return out;
  // an approved due / credit lets the patient through, exactly as the server's call gate does
  if (!['paid', 'free', 'waived'].includes(r.payment_status) && !r.fee_authorized) out.push('Fee pending');
  if (!r.vitals_count) out.push('Vitals not recorded');
  return out;
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Outpatient routing', 'groups')} ${liveChip()}`,
    title: 'Doctor Queue',
    subtitle: 'Ordinary OP calling waits for the consultation fee and required vitals. Emergency care is never gated on payment — use the Emergency Desk for that pathway.',
    actions: `${canCall() ? `<button class="btn-primary" data-call-next>
        <span class="material-symbols-outlined text-[18px]">campaign</span> Call next patient</button>` : ''}
      <a href="/display-queue" target="_blank" class="btn-secondary">
        <span class="material-symbols-outlined text-[18px]">tv</span> Waiting-room display</a>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'select', key: 'doctor_id', label: 'Doctor', options: doctorOptions(), value: f.doctor_id, width: 'min-w-[260px]' },
        { type: 'select', key: 'department_id', label: 'Department', options: deptOptions(true, { clinical: true }), value: f.department_id },
        { type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' },
      ])}
      ${card({ title: 'With the doctor now', pad: false, body: `<table class="tbl"><tbody data-serving></tbody></table>` })}
      <div class="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Waiting', subtitle: 'Token order; held-back patients show the exact reason',
          actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '54vh',
          columns: [{ label: 'Token', width: '66px' }, { label: 'Patient' }, { label: 'Vitals' },
            { label: 'Status' }, { label: 'Waiting' }, { label: '', width: '170px' }],
        })}
        ${card({ title: 'Consulted — services still open', pad: false,
          body: `<div class="overflow-auto" style="max-height:54vh"><table class="tbl">
            <thead><tr><th style="width:56px">Tok</th><th>Patient</th><th>Open orders</th><th>Due</th><th></th></tr></thead>
            <tbody data-done></tbody></table></div>` })}
      </div>`,
  });
}

function servingHTML(r) {
  return `<td class="!h-16">
      <div class="flex items-center gap-4">
        <span class="inline-grid place-items-center w-12 h-12 rounded-xl bg-primary text-white font-display-lg">${r.token_no}</span>
        <div>
          <div class="font-headline-md text-headline-md">${esc(r.patient_name)}</div>
          <div class="text-body-md text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc(r.gender || '')} ·
            called ${ago(r.called_at || r.consult_start)}</div>
        </div>
        ${r.allergy_count ? '<span class="pill-danger pill-dot">Allergies on file</span>' : ''}
      </div></td>
    <td class="text-right whitespace-nowrap">
      ${can('consult.write') ? `<button class="btn-primary btn-sm" data-act="consult">Open consultation</button>
      <button class="btn-secondary btn-sm" data-act="complete">Mark consulted</button>` : ''}
    </td>`;
}

/** Reception (queue.manage) or the doctor themself may call a patient in. */
const canCall = () => can('queue.manage') || can('consult.write');

function rowHTML(r) {
  const reasons = blockReasons(r);
  return `
    <td><span class="inline-grid place-items-center w-9 h-9 rounded-lg font-data-mono font-bold
      ${r.priority !== 'normal' ? 'bg-danger-bg text-danger' : reasons.length ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}">${r.token_no ?? '—'}</span></td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(r.patient_name)}
        ${r.priority !== 'normal' ? priorityPill(r.priority) : ''}
        ${r.allergy_count ? '<span class="material-symbols-outlined text-[14px] text-danger" title="Allergies">warning</span>' : ''}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}
        ${r.visit_type === 'followup' ? ' · follow-up' : ''}</div></td>
    <td>${!r.vitals_count ? '<span class="pill-warning pill-dot">Pending</span>' : (() => {
      const al = vitalAlerts(r.last_vitals);
      return al.length ? `<span class="${al.some((a) => a.critical) ? 'pill-danger' : 'pill-warning'} pill-dot" title="Out of range">${esc(al.map((a) => a.label).join(' · '))}</span>`
        : '<span class="pill-success pill-dot">Recorded</span>';
    })()}</td>
    <td>${reasons.length
      ? `<div class="flex flex-col gap-1">${reasons.map((x) => `<span class="pill-warning pill-dot">${esc(x)}</span>`).join('')}</div>`
      : '<span class="pill-success pill-dot">Callable</span>'}</td>
    <td><div class="text-body-sm">${ago(r.opened_at)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(r.opened_at)}</div></td>
    <td class="text-right whitespace-nowrap">
      ${reasons.includes('Fee pending') && can('payment.collect') ? `<button class="btn-secondary btn-xs" data-act="collect">Collect fee</button>` : ''}
      ${reasons.includes('Vitals not recorded') && can('vitals.record') ? `<button class="btn-secondary btn-xs" data-act="vitals">Vitals</button>` : ''}
      ${!reasons.length && canCall() ? `<button class="btn-primary btn-xs" data-act="call">Call in</button>` : ''}
      <button class="btn-ghost btn-xs" data-act="visit" title="Open visit"><span class="material-symbols-outlined text-[15px]">open_in_new</span></button>
    </td>`;
}

function doneHTML(r) {
  return `
    <td class="font-data-mono">${r.token_no ?? '—'}</td>
    <td class="text-body-md truncate max-w-[150px]">${esc(r.patient_name)}</td>
    <td>${r.orders_open ? `<span class="pill-info pill-dot">${r.orders_open} open</span>` : '<span class="pill-success pill-dot">All done</span>'}</td>
    <td class="num ${r.due > 0 ? 'text-danger' : 'text-on-surface-variant'}">${r.due > 0 ? money(r.due) : '—'}</td>
    <td class="text-right"><button class="btn-ghost btn-xs" data-act="close" title="Finish visit">
      <span class="material-symbols-outlined text-[15px]">done_all</span></button></td>`;
}
