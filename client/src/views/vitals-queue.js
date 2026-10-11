/**
 * Vitals Queue — the nursing station between reception and the doctor.
 *
 * A purpose-specific view of the same encounter/token data, per section 4 of
 * the brief: no separate queue store, just a nursing lens on it.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  doctorOptions, apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, money, fmtTime, todayISO, ago, kpi,
  patientBanner, emptyState, vitalAlerts,
} from './_kit.js';

let f = { date: todayISO(), doctor_id: '' };

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const { rows, counts } = await api.get(`/queue${qs(f)}`);
    const pending = rows.filter((r) => ['registered', 'vitals_pending'].includes(r.stage));
    const done = rows.filter((r) => r.last_vitals)
      .sort((x, y) => (y.last_vitals.id || 0) - (x.last_vitals.id || 0));
    $('[data-kpis]', root).innerHTML = [
      { label: 'Awaiting vitals', value: pending.length, icon: 'monitor_heart', tone: pending.length ? 'warning' : 'success', sub: 'Nursing station queue' },
      { label: 'Vitals recorded', value: done.length, icon: 'check_circle', tone: 'success', sub: 'Ready or already with the doctor' },
      { label: 'Payment pending', value: pending.filter((r) => r.payment_status === 'pending').length, icon: 'schedule', tone: 'info', sub: 'Vitals may still be taken' },
      { label: 'Urgent', value: rows.filter((r) => r.priority !== 'normal').length, icon: 'priority_high', tone: 'danger', sub: 'See these first' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), pending, rowHTML, { empty: 'Every registered patient has had their vitals taken.' });
    renderRows($('[data-done]', root), done.slice(0, 40), doneRowHTML, { empty: 'No vitals recorded yet today.' });
    $('[data-count]', root).textContent = `${pending.length} waiting`;
  }

  bind(root, 'click', '[data-act="record"]', (e, b) => openVitals(b.closest('tr').dataset.id, load));
  bind(root, 'click', '[data-act="view"]', (e, b) => navigate(`/visit/${b.closest('tr').dataset.id}`));

  if (ctx.query.encounter && can('vitals.record')) openVitals(ctx.query.encounter, load);

  return live({
    topics: ['queue', 'opd'],
    events: ['encounter.created', 'encounter.stage', 'vitals.recorded'],
    load,
  });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Nursing station', 'vital_signs')} ${liveChip()}`,
    title: 'Vitals Queue',
    subtitle: 'Record observations before the patient enters the doctor’s ready queue. Vitals do not depend on payment — take them, and the desk can settle the fee in parallel.',
    actions: `<a href="/doctor-queue" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">groups</span> Doctor queue</a>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' },
        { type: 'select', key: 'doctor_id', label: 'Doctor', options: doctorOptions(), value: f.doctor_id },
      ])}
      <div class="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Awaiting vitals',
          actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '58vh',
          columns: [{ label: 'Token', width: '66px' }, { label: 'Patient' }, { label: 'Doctor' },
            { label: 'Payment' }, { label: 'Waiting' }, { label: '', width: '130px' }],
        })}
        ${card({
          title: 'Recently recorded', pad: false,
          body: `<div class="overflow-auto" style="max-height:58vh"><table class="tbl">
            <thead><tr><th style="width:60px">Tok</th><th>Patient</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Temp</th><th>Stage</th></tr></thead>
            <tbody data-done></tbody></table></div>`,
        })}
      </div>`,
  });
}

function rowHTML(r) {
  return `
    <td><span class="inline-grid place-items-center w-9 h-9 rounded-lg font-data-mono font-bold
      ${r.priority !== 'normal' ? 'bg-danger-bg text-danger' : 'bg-primary-fixed text-primary'}">${r.token_no ?? '—'}</span></td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(r.patient_name)}
        ${r.allergy_count ? '<span class="material-symbols-outlined text-[14px] text-danger" title="Allergies recorded">warning</span>' : ''}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}</div></td>
    <td class="text-body-md">${esc(r.doctor_name || '—')}</td>
    <td>${r.fee_authorized && r.payment_status !== 'paid' ? pill('approved', r.payer_type === 'credit' ? 'Credit approved' : 'Due approved') : pill(r.payment_status)}</td>
    <td><div class="text-body-sm">${ago(r.opened_at)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(r.opened_at)}</div></td>
    <td class="text-right whitespace-nowrap">
      ${can('vitals.record') ? `<button class="btn-primary btn-xs" data-act="record">Record vitals</button>` : ''}
      <button class="btn-ghost btn-xs" data-act="view" title="Open visit"><span class="material-symbols-outlined text-[15px]">open_in_new</span></button>
    </td>`;
}

function doneRowHTML(r) {
  const v = r.last_vitals || {};
  const bpBad = v.bp_sys && (v.bp_sys >= 140 || v.bp_sys < 90 || v.bp_dia >= 90 || v.bp_dia < 60);
  return `
    <td class="font-data-mono">${r.token_no ?? '—'}</td>
    <td><div class="text-body-md truncate max-w-[150px]">${esc(r.patient_name)}</div></td>
    <td class="font-data-mono ${bpBad ? 'text-danger font-bold' : ''}">${v.bp_sys ? `${v.bp_sys}/${v.bp_dia}${bpBad ? ' ⚠' : ''}` : '—'}</td>
    <td class="font-data-mono ${v.pulse && (v.pulse > 100 || v.pulse < 50) ? 'text-danger font-bold' : ''}">${v.pulse ?? '—'}</td>
    <td class="font-data-mono ${v.spo2 && v.spo2 < 94 ? 'text-danger font-bold' : ''}">${v.spo2 ?? '—'}</td>
    <td class="font-data-mono ${v.temp_f && v.temp_f > 100.4 ? 'text-warning font-bold' : ''}">${v.temp_f ?? '—'}</td>
    <td>${pill(r.stage)}</td>`;
}

/* ------------------------------------------------------------- recorder */

export function openVitals(encounterId, after) {
  (async () => {
    const e = await api.get(`/encounters/${encounterId}`);
    const last = e.vitals;
    modal({
      title: 'Record vitals',
      subtitle: `Token ${e.token_no ?? '—'} · ${esc(e.patient_name)} · ${esc(e.uhid)}`,
      size: 'lg',
      body: `
        ${patientBanner(e.patient)}
        <form data-vf class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          ${[
            ['bp_sys', 'Systolic BP', 'mmHg', last?.bp_sys, 'number'],
            ['bp_dia', 'Diastolic BP', 'mmHg', last?.bp_dia, 'number'],
            ['pulse', 'Pulse', '/min', last?.pulse, 'number'],
            ['temp_f', 'Temperature', '°F', last?.temp_f, 'number'],
            ['spo2', 'SpO₂', '%', last?.spo2, 'number'],
            ['resp_rate', 'Respiratory rate', '/min', last?.resp_rate, 'number'],
            ['weight_kg', 'Weight', 'kg', last?.weight_kg, 'number'],
            ['height_cm', 'Height', 'cm', last?.height_cm, 'number'],
            ['grbs', 'GRBS', 'mg/dL', last?.grbs, 'number'],
            ['pain_score', 'Pain score', '0–10', last?.pain_score, 'number'],
          ].map(([name, label, unit, v, type]) => `
            <div>
              <label class="field-label">${label}</label>
              <div class="relative">
                <input class="field !pr-12" name="${name}" type="${type}" step="any" value="${v ?? ''}" inputmode="decimal">
                <span class="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-surface-container
                  font-label-sm text-label-sm text-on-surface-variant pointer-events-none">${unit}</span>
              </div>
            </div>`).join('')}
          <div class="col-span-2 md:col-span-4 hidden" data-valert></div>
          <div class="col-span-2 md:col-span-4">
            <label class="field-label">Nursing note</label>
            <textarea class="field" rows="2" name="notes" placeholder="Anything the doctor should see first"></textarea>
          </div>
          <div class="col-span-2 md:col-span-4 flex items-center gap-2 p-2.5 rounded-lg bg-info-bg text-info text-body-md">
            <span class="material-symbols-outlined text-[17px] shrink-0">info</span>
            <span>BMI is calculated automatically. Saving moves the patient to
            ${['paid', 'free', 'waived'].includes(e.payment_status) ? '<strong>the doctor’s ready queue</strong>' : '<strong>vitals-done</strong> — the fee is still pending at the desk'}.</span>
          </div>
        </form>`,
      footer: `<button class="btn-secondary" data-close>Cancel</button>
               <button class="btn-primary" data-save><span class="material-symbols-outlined text-[17px]">save</span> Save vitals</button>`,
      onMount(root, close) {
        const form = root.querySelector('[data-vf]'), box = root.querySelector('[data-valert]');
        const check = () => {
          const al = vitalAlerts(Object.fromEntries(new FormData(form)));
          box.classList.toggle('hidden', !al.length);
          const crit = al.some((a) => a.critical);
          box.innerHTML = al.length ? `<div class="flex items-start gap-2 p-2.5 rounded-lg ${crit ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'} text-body-md">
            <span class="material-symbols-outlined text-[17px]">${crit ? 'emergency' : 'warning'}</span>
            <span><b>${crit ? 'Critical — inform the doctor now' : 'Out of range'}:</b> ${esc(al.map((a) => a.label).join(' · '))}. Re-check the reading before saving.</span></div>` : '';
        };
        form.addEventListener('input', check); check();
        root.querySelector('[data-save]').onclick = async (ev) => {
          const actionButton = ev.currentTarget;
          busy(actionButton, true, 'Saving');
          try {
            const fd = Object.fromEntries(new FormData(root.querySelector('[data-vf]')));
            const r = await api.post('/vitals', { encounter_id: e.id, ...fd });
            close();
            toast(`${r.patient_name} — ${r.stage === 'ready' ? 'ready for the doctor' : 'vitals recorded'}`, 'success');
            after?.();
          } catch (err) { apiError(err, 'Could not save vitals'); busy(actionButton, false); }
        };
      },
    });
  })();
}
