/** Follow-up & teleconsultation workspace. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, doctorOptions, downloadCSV,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, fmtDateTime, ago, kpi,
  todayISO, shiftDate, emptyState,
} from './_kit.js';

let f = { doctor_id: '', window: '14' };
let cache = [];

export async function mount(ctx) {
  if (!f.doctor_id && state.user.role === 'doctor') f.doctor_id = String(state.user.id);
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [ws, recent] = await Promise.all([
      api.get(`/doctor/workspace${qs({ doctor_id: f.doctor_id || state.user.id })}`),
      api.get(`/encounters${qs({ kind: 'OP' })}`),
    ]);
    const due = ws.followups_due || [];
    const overdue = due.filter((r) => r.follow_up_date < todayISO());
    const today = due.filter((r) => r.follow_up_date === todayISO());
    cache = due;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Reviews due', value: due.length, icon: 'event_repeat', sub: 'Next fortnight' },
      { label: 'Due today', value: today.length, icon: 'today', tone: today.length ? 'warning' : 'success', sub: 'Expect these patients' },
      { label: 'Overdue', value: overdue.length, icon: 'running_with_errors', tone: overdue.length ? 'danger' : 'success', sub: 'Call and reschedule' },
      { label: 'Follow-up visits today', value: recent.filter((e) => e.visit_type === 'followup' && e.visit_date === todayISO()).length,
        icon: 'how_to_reg', tone: 'info', sub: 'Already registered' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), due, rowHTML, { empty: 'No reviews are due in this window.' });
    renderRows($('[data-recent]', root), recent.filter((e) => e.visit_type === 'followup').slice(0, 25), (e) => `
      <td class="text-body-sm">${fmtDate(e.visit_date)}</td>
      <td class="text-body-md">${esc(e.patient_name)}</td>
      <td class="text-body-md">${esc(e.doctor_name || '—')}</td>
      <td>${pill(e.stage)}</td>`, { empty: 'No follow-up visits recorded.' });
    $('[data-count]', root).textContent = `${due.length} review(s) due`;
  }

  bind(root, 'click', '[data-act]', async (e, b) => {
    const pid = b.dataset.pid;
    if (b.dataset.act === 'record') navigate(`/patient/${pid}`);
    if (b.dataset.act === 'book') navigate(`/appointments`);
    if (b.dataset.act === 'register') navigate(`/op-registration?patient=${pid}`);
    if (b.dataset.act === 'tele') teleconsult(cache.find((x) => String(x.patient_id) === pid));
  });
  bind(root, 'click', '[data-export]', () => downloadCSV('followups-due.csv', cache));

  return live({ topics: ['clinical', 'queue'], events: ['consultation.saved', 'encounter.created'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Continuity of care', 'event_repeat')} ${liveChip()}`,
    title: 'Follow-up & Teleconsultation',
    subtitle: 'Patients the clinician asked to come back, with the review date the consultation recorded.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export call list</button>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'select', key: 'doctor_id', label: 'Doctor', value: f.doctor_id, options: doctorOptions(), width: 'min-w-[260px]' },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Reviews due', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '58vh',
          columns: [{ label: 'Review date', width: '130px' }, { label: 'Patient' }, { label: 'Diagnosis' },
            { label: 'Contact' }, { label: 'Status' }, { label: '', width: '230px' }],
        })}
        ${card({ title: 'Recent follow-up visits', pad: false,
          body: `<div class="overflow-auto" style="max-height:58vh"><table class="tbl">
            <thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Stage</th></tr></thead>
            <tbody data-recent></tbody></table></div>` })}
      </div>`,
  });
}

function rowHTML(r) {
  const overdue = r.follow_up_date < todayISO();
  const today = r.follow_up_date === todayISO();
  return `
    <td><div class="font-data-mono text-body-md ${overdue ? 'text-danger font-bold' : today ? 'text-warning font-semibold' : ''}">${fmtDate(r.follow_up_date)}</div>
      <div class="text-label-sm text-on-surface-variant">${overdue ? 'overdue' : today ? 'today' : inDays(r.follow_up_date)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)}</div></td>
    <td class="text-body-md max-w-[220px] truncate" title="${esc(r.diagnosis || '')}">${esc(r.diagnosis || '—')}</td>
    <td class="font-data-mono text-body-sm">${esc(r.mobile || '—')}</td>
    <td>${overdue ? '<span class="pill-danger pill-dot">Overdue</span>' : today ? '<span class="pill-warning pill-dot">Due today</span>' : '<span class="pill-info pill-dot">Scheduled</span>'}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="tele" data-pid="${r.patient_id}">Teleconsult</button>
      <button class="btn-secondary btn-xs" data-act="register" data-pid="${r.patient_id}">Register</button>
      <button class="btn-ghost btn-xs" data-act="record" data-pid="${r.patient_id}" title="Record">
        <span class="material-symbols-outlined text-[15px]">folder_shared</span></button>
    </td>`;
}

function teleconsult(r) {
  if (!r) return;
  modal({
    title: 'Teleconsultation call', subtitle: `${esc(r.patient_name)} · ${esc(r.uhid)}`, size: 'sm',
    body: `<div class="space-y-3">
      <div class="p-3 rounded-lg bg-surface-container-low">
        <div class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Call</div>
        <a class="font-headline-md text-headline-md text-primary" href="tel:${esc((r.mobile || '').replace(/\s/g, ''))}">${esc(r.mobile || '—')}</a>
        <div class="text-body-sm text-on-surface-variant mt-1">Review was advised for ${fmtDate(r.follow_up_date)}
          ${r.diagnosis ? ` · ${esc(r.diagnosis)}` : ''}</div>
      </div>
      <div><label class="field-label">Outcome</label><select class="field" data-o>
        <option value="advised">Advice given over the phone</option>
        <option value="asked_to_visit">Asked to come in</option>
        <option value="no_answer">No answer</option>
        <option value="rescheduled">Review rescheduled</option></select></div>
      <div><label class="field-label">Note</label><textarea class="field" rows="3" data-n
        placeholder="Recorded against the patient record"></textarea></div>
      <p class="text-body-sm text-on-surface-variant">A teleconsultation that results in a prescription should be
        registered as a visit so the record and any charge stay linked.</p>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      <a class="btn-secondary" href="/patient/${r.patient_id}" data-close>Open record</a>
      <button class="btn-primary" data-save>Save note</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post(`/patients/${r.patient_id}/problems`, {
            label: `Teleconsult (${root.querySelector('[data-o]').value.replace(/_/g, ' ')}): ${root.querySelector('[data-n]').value || 'no note'}`,
            status: 'active',
          });
          close(); toast('Teleconsultation noted on the patient record', 'success');
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

/** "tomorrow" / "in 7 days" for a future review date. */
function inDays(d) {
  const n = Math.round((new Date(`${d}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
  return n === 1 ? 'tomorrow' : `in ${n} days`;
}
