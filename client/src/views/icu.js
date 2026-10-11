/** ICU & critical care — bedside cards with vital trends and standing alerts. */
import {
  page, eyebrow, liveChip, kpiRow, live, mountPage, card,
  api, qs, can, navigate, sparkline,
  $, $$, esc, bind, toast, kpi, pill, fmtDateTime, ago, emptyState, money, vitalAlerts,
} from './_kit.js';

/** One set of vital-sign limits for the whole hospital (ui.js vitalAlerts) — same as OPD, ward and ER. */
const icuAlerts = (v) => vitalAlerts(v).map((a) => ({ level: a.critical ? 'danger' : 'warn', text: a.label }));

export async function mount(ctx) {
  const root = mountPage(ctx, layout());

  async function load() {
    const d = await api.get('/ipd/icu');
    for (const r of d.rows) r.alerts = icuAlerts(r.vitals);
    const alerting = d.rows.filter((r) => r.alerts.length);
    $('[data-kpis]', root).innerHTML = [
      { label: 'ICU occupancy', value: `${d.occupancy}%`, icon: 'ecg_heart', tone: d.occupancy > 85 ? 'warning' : 'success',
        sub: `${d.beds.occupied} of ${d.beds.total} beds` },
      { label: 'Patients under alert', value: alerting.length, icon: 'e911_emergency', tone: alerting.length ? 'danger' : 'success',
        sub: 'Vital sign outside range' },
      { label: 'Medication due', value: d.rows.reduce((s, r) => s + r.meds_due, 0), icon: 'medication', tone: 'warning', sub: 'Across the unit' },
      { label: 'Mean length of stay', value: d.rows.length ? `${(d.rows.reduce((s, r) => s + r.los_days, 0) / d.rows.length).toFixed(1)} d` : '—',
        icon: 'schedule', tone: 'info', sub: `${d.rows.length} patient(s)` },
    ].map(kpi).join('');
    $('[data-beds]', root).innerHTML = d.rows.length
      ? `<div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">${d.rows.map(bedCard).join('')}</div>`
      : emptyState('ecg_heart', 'No ICU patients', 'Every critical-care bed is free.');
  }

  bind(root, 'click', '[data-open]', (e, b) => navigate(`/patient/${b.dataset.open}`));

  return live({ topics: ['ipd'], events: ['vitals.recorded', 'admission.updated', 'mar.updated', 'nursing.note'], load, interval: 30000 });
}

function layout() {
  return page({
    wide: true,
    eyebrow: `${eyebrow('Critical care', 'ecg_heart')} ${liveChip()}`,
    title: 'ICU & Critical Care',
    subtitle: 'Bedside overview with the last twelve observations per patient and standing physiological alerts.',
    actions: `<a href="/nursing" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">vaccines</span> Nursing board</a>`,
    body: `${kpiRow([], 4)}<div data-beds></div>`,
  });
}

function bedCard(r) {
  const v = r.vitals || {};
  const critical = r.alerts.some((a) => a.level === 'danger');
  return `<article class="card overflow-hidden ${critical ? 'border-danger/40' : ''}">
    <header class="flex items-center justify-between gap-2 px-4 h-12 border-b border-outline-variant
      ${critical ? 'bg-danger-bg' : 'bg-surface-container-low'}">
      <div class="min-w-0">
        <div class="font-title-md text-title-md truncate">${esc(r.patient_name)}</div>
        <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.bed_no)} · ${esc(r.uhid)} · day ${r.los_days}</div>
      </div>
      ${r.meds_due ? `<span class="pill-warning pill-dot">${r.meds_due} meds due</span>` : ''}
    </header>
    <div class="p-4 space-y-3">
      ${r.alerts.length ? `<div class="flex flex-wrap gap-1.5">${r.alerts.map((a) =>
        `<span class="pill-${a.level === 'danger' ? 'danger' : 'warning'} pill-dot">${esc(a.text)}</span>`).join('')}</div>` : ''}
      <div class="grid grid-cols-4 gap-2">
        ${[['BP', v.bp_sys ? `${v.bp_sys}/${v.bp_dia}` : '—', r.alerts.some((a) => a.text.startsWith('BP'))],
           ['Pulse', v.pulse ?? '—', r.alerts.some((a) => a.text.startsWith('Pulse'))],
           ['SpO₂', v.spo2 ?? '—', r.alerts.some((a) => a.text.startsWith('SpO'))],
           ['Temp', v.temp_f ?? '—', r.alerts.some((a) => a.text.startsWith('Temp'))]].map(([l, val, alert]) => `
          <div class="p-2 rounded border ${alert ? 'border-danger/40 bg-danger-bg text-danger' : 'border-outline-variant'}">
            <div class="font-label-sm text-label-sm uppercase tracking-wider ${alert ? '' : 'text-on-surface-variant'}">${l}</div>
            <div class="font-title-md text-title-md tnum">${val}</div></div>`).join('')}
      </div>
      <div class="flex items-end justify-between gap-3">
        <div>
          <div class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Pulse trend</div>
          ${sparkline(r.trend.map((t) => t.pulse).filter(Boolean), { width: 150, height: 34 })}
        </div>
        <div>
          <div class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">SpO₂ trend</div>
          ${sparkline(r.trend.map((t) => t.spo2).filter(Boolean), { width: 150, height: 34, stroke: '#1E40AF', fill: 'rgba(30,64,175,.10)' })}
        </div>
      </div>
      <div class="text-body-sm text-on-surface-variant">${esc(r.diagnosis || 'No diagnosis recorded')} ·
        ${esc(r.consultant_name || '')} · last obs ${v.recorded_at ? ago(v.recorded_at) : 'never'}</div>
      <div class="flex gap-2">
        <button class="btn-secondary btn-sm flex-1" data-open="${r.patient_id}">Patient record</button>
        <a class="btn-secondary btn-sm flex-1 justify-center" href="/nursing">Nursing board</a>
      </div>
    </div>
  </article>`;
}
