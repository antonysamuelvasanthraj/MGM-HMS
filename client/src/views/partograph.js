/**
 * Intrapartum partograph.
 *
 * WHO-style labour chart: cervical dilatation against the alert and action
 * lines, descent, contractions, fetal heart rate and maternal observations.
 */
import {
  page, eyebrow, liveChip, live, mountPage, card, kpiRow,
  apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, renderRows, pill, fmtDateTime, fmtTime, ago, kpi, emptyState, spinner,
} from './_kit.js';

let caseId = null;

export async function mount(ctx) {
  caseId = ctx.query.case || null;
  const root = mountPage(ctx, `<div class="p-6">${spinner('Loading')}</div>`);

  async function load() {
    if (!caseId) {
      const d = await api.get('/ipd/maternity');
      const labour = d.rows.filter((r) => ['latent', 'active_labour', 'second_stage'].includes(r.stage));
      root.innerHTML = page({
        eyebrow: `${eyebrow('Labour watch', 'show_chart')} ${liveChip()}`,
        title: 'Intrapartum Partograph',
        subtitle: 'Choose the mother in labour to open her chart.',
        body: labour.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          ${labour.map((r) => `<button class="card p-4 text-left hover:border-primary/50 transition-colors" data-pick="${r.id}">
            <div class="flex items-center justify-between">${pill(r.stage)}
              ${r.risk === 'high' ? '<span class="pill-danger pill-dot">High risk</span>' : ''}</div>
            <div class="font-title-md text-title-md mt-2">${esc(r.patient_name)}</div>
            <div class="text-body-sm text-on-surface-variant">${esc(r.uhid)} · G${r.gravida} P${r.para} · ${r.gestation_wks} wks</div>
            <div class="font-data-mono text-body-md mt-2">Cervix ${r.cervix ?? '—'} cm · FHR ${r.fhr ?? '—'} · ${r.entries} entries</div>
          </button>`).join('')}</div>`
          : emptyState('pregnant_woman', 'Nobody is in labour', 'Cases appear here once the stage is set to latent or active labour.',
            `<a href="/maternity" class="btn-primary">Maternity register</a>`),
      });
      bind(root, 'click', '[data-pick]', (e, b) => { caseId = b.dataset.pick; history.replaceState({}, '', `/partograph?case=${caseId}`); load(); });
      return;
    }
    const c = await api.get(`/ipd/maternity/${caseId}`);
    root.innerHTML = chart(c);
    wire(root, c, load);
  }

  return live({ topics: ['maternity', caseId ? `maternity:${caseId}` : 'maternity'],
    events: ['partograph.entry', 'maternity.updated'], load, interval: 60000 });
}

function chart(c) {
  const e = c.entries;
  const last = e[e.length - 1] || {};
  const start = e.length ? new Date(e[0].recorded_at.replace(' ', 'T')) : new Date();
  const hours = e.length ? Math.max(4, Math.ceil((new Date(e[e.length - 1].recorded_at.replace(' ', 'T')) - start) / 36e5) + 2) : 12;

  return page({
    wide: true,
    eyebrow: `${eyebrow('Labour watch', 'show_chart')} ${liveChip()}
      <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.uhid)}</span>
      ${pill(c.stage)} ${c.risk === 'high' ? '<span class="pill-danger pill-dot">High risk</span>' : ''}`,
    title: c.patient_name,
    subtitle: `G${c.gravida} P${c.para} L${c.living} A${c.abortions ?? 0} · ${c.gestation_wks} weeks · EDD ${c.edd || '—'} · ${e.length} observation(s)`,
    actions: `<button class="btn-secondary" data-change><span class="material-symbols-outlined text-[18px]">swap_horiz</span> Change case</button>
      ${can('maternity.write') ? `<button class="btn-primary" data-add>
        <span class="material-symbols-outlined text-[18px]">add</span> Record observation</button>` : ''}`,
    body: `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[{ label: 'Cervical dilatation', value: `${last.cervix_cm ?? '—'} cm`, icon: 'expand', tone: last.cervix_cm >= 10 ? 'success' : 'info' },
           { label: 'Fetal heart rate', value: `${last.fhr ?? '—'}`, icon: 'monitor_heart',
             tone: last.fhr && (last.fhr < 110 || last.fhr > 160) ? 'danger' : 'success',
             // words, not only colour: bradycardia / tachycardia must read as an alarm
             sub: last.fhr && last.fhr < 110 ? 'LOW — fetal bradycardia, inform obstetrician (normal 110–160)'
               : last.fhr > 160 ? 'HIGH — fetal tachycardia, inform obstetrician (normal 110–160)' : 'Normal 110–160' },
           { label: 'Contractions', value: `${last.contractions_10min ?? '—'}/10 min`, icon: 'graphic_eq', sub: last.contraction_strength || '' },
           { label: 'Maternal BP', value: last.bp_sys ? `${last.bp_sys}/${last.bp_dia}` : '—', icon: 'favorite',
             tone: last.bp_sys > 140 ? 'warning' : 'success', sub: `Pulse ${last.pulse ?? '—'}` }].map(kpi).join('')}
      </div>
      ${card({ title: 'Cervicograph', subtitle: 'Dilatation against the alert and action lines; descent of the head below',
        body: svgChart(e, hours, start) })}
      ${card({ title: 'Observation record', pad: false, body: e.length ? `
        <div class="overflow-auto"><table class="tbl">
          <thead><tr><th>Time</th><th>Cervix</th><th>Descent</th><th>Contractions</th><th>FHR</th>
            <th>Liquor</th><th>Moulding</th><th>BP</th><th>Pulse</th><th>Temp</th><th>Oxytocin</th><th>Recorded by</th></tr></thead>
          <tbody>${e.slice().reverse().map((r) => `<tr>
            <td class="font-data-mono text-body-sm">${fmtTime(r.recorded_at)}</td>
            <td class="font-data-mono">${r.cervix_cm ?? '—'}</td><td class="font-data-mono">${r.descent ?? '—'}/5</td>
            <td class="font-data-mono">${r.contractions_10min ?? '—'} ${esc(r.contraction_strength || '')}</td>
            <td class="font-data-mono ${r.fhr && (r.fhr < 110 || r.fhr > 160) ? 'text-danger font-bold' : ''}">${r.fhr ?? '—'}${r.fhr && r.fhr < 110 ? ' ↓ low' : r.fhr > 160 ? ' ↑ high' : ''}</td>
            <td>${esc(r.liquor || '—')}</td><td>${esc(r.moulding || '—')}</td>
            <td class="font-data-mono">${r.bp_sys ? `${r.bp_sys}/${r.bp_dia}` : '—'}</td>
            <td class="font-data-mono">${r.pulse ?? '—'}</td><td class="font-data-mono">${r.temp_f ?? '—'}</td>
            <td class="text-body-sm">${esc(r.oxytocin || '—')}</td>
            <td class="text-body-sm">${esc(r.by_name || '')}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="p-4 text-body-md text-on-surface-variant">No observations recorded yet.</p>` })}`,
  });
}

function svgChart(entries, hours, start) {
  const W = 900, H = 340, padL = 44, padB = 120, padT = 14, padR = 14;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (t) => padL + Math.min(1, ((new Date(t.replace(' ', 'T')) - start) / 36e5) / hours) * plotW;
  const yCx = (cm) => padT + plotH - ((cm - 0) / 10) * plotH;

  const cervix = entries.filter((e) => e.cervix_cm !== null && e.cervix_cm !== undefined);
  const path = cervix.map((e, i) => `${i ? 'L' : 'M'}${x(e.recorded_at).toFixed(1)},${yCx(e.cervix_cm).toFixed(1)}`).join(' ');

  // WHO alert line: 1 cm/hour from 4 cm; action line 4 hours to its right.
  const alertStartH = cervix.length ? Math.max(0, ((new Date(cervix[0].recorded_at.replace(' ', 'T')) - start) / 36e5)) : 0;
  const lineAt = (offsetH) => {
    const x1 = padL + ((alertStartH + offsetH) / hours) * plotW, y1 = yCx(4);
    const x2 = padL + ((alertStartH + offsetH + 6) / hours) * plotW, y2 = yCx(10);
    return `M${x1},${y1} L${Math.min(x2, W - padR)},${y2}`;
  };

  return `<div class="overflow-x-auto"><svg viewBox="0 0 ${W} ${H}" class="min-w-[760px] w-full" role="img" aria-label="Partograph">
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#fff" stroke="#D8DFE8"/>
    ${[...Array(11).keys()].map((cm) => `
      <line x1="${padL}" y1="${yCx(cm)}" x2="${W - padR}" y2="${yCx(cm)}" stroke="#EEF2F7"/>
      <text x="${padL - 8}" y="${yCx(cm) + 4}" text-anchor="end" font-size="10" fill="#526176">${cm}</text>`).join('')}
    ${[...Array(hours + 1).keys()].map((h) => `
      <line x1="${padL + (h / hours) * plotW}" y1="${padT}" x2="${padL + (h / hours) * plotW}" y2="${padT + plotH}" stroke="#EEF2F7"/>
      <text x="${padL + (h / hours) * plotW}" y="${padT + plotH + 14}" text-anchor="middle" font-size="10" fill="#526176">${h}h</text>`).join('')}
    <path d="${lineAt(0)}" stroke="#92400E" stroke-width="1.6" fill="none" stroke-dasharray="5 3"/>
    <path d="${lineAt(4)}" stroke="#B91C1C" stroke-width="1.6" fill="none"/>
    <text x="${W - padR - 4}" y="${yCx(9.4)}" text-anchor="end" font-size="10" fill="#92400E">Alert line</text>
    <text x="${W - padR - 4}" y="${yCx(8.6)}" text-anchor="end" font-size="10" fill="#B91C1C">Action line</text>
    ${path ? `<path d="${path}" stroke="#881D2C" stroke-width="2.2" fill="none" stroke-linejoin="round"/>` : ''}
    ${cervix.map((e) => `<circle cx="${x(e.recorded_at)}" cy="${yCx(e.cervix_cm)}" r="4" fill="#881D2C">
      <title>${fmtTime(e.recorded_at)} — ${e.cervix_cm} cm</title></circle>`).join('')}
    <text x="10" y="${padT + 10}" font-size="10" fill="#526176" transform="rotate(-90 10 ${padT + 60})">Cervix (cm)</text>

    <g transform="translate(0,${padT + plotH + 26})">
      <text x="${padL}" y="10" font-size="10" fill="#526176" font-weight="600">FETAL HEART RATE</text>
      ${entries.filter((e) => e.fhr).map((e) => {
        const cy = 18 + (1 - (Math.min(180, Math.max(90, e.fhr)) - 90) / 90) * 30;
        const bad = e.fhr < 110 || e.fhr > 160;
        return `<circle cx="${x(e.recorded_at)}" cy="${cy}" r="3" fill="${bad ? '#B91C1C' : '#1E40AF'}">
          <title>${fmtTime(e.recorded_at)} — ${e.fhr} bpm</title></circle>`;
      }).join('')}
      <text x="${padL}" y="70" font-size="10" fill="#526176" font-weight="600">CONTRACTIONS / 10 MIN</text>
      ${entries.filter((e) => e.contractions_10min).map((e) => {
        const h = e.contractions_10min * 4;
        return `<rect x="${x(e.recorded_at) - 4}" y="${96 - h}" width="8" height="${h}"
          fill="${e.contraction_strength === 'strong' ? '#881D2C' : e.contraction_strength === 'moderate' ? '#A8555F' : '#D4A2A9'}">
          <title>${fmtTime(e.recorded_at)} — ${e.contractions_10min}/10 min (${e.contraction_strength || ''})</title></rect>`;
      }).join('')}
    </g>
  </svg></div>`;
}

function wire(root, c, reload) {
  root.querySelector('[data-change]').onclick = () => { caseId = null; history.replaceState({}, '', '/partograph'); reload(); };
  root.querySelector('[data-add]')?.addEventListener('click', () => {
    modal({
      title: 'Record a partograph observation', subtitle: esc(c.patient_name), size: 'md',
      body: `<form data-pf class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div><label class="field-label">Cervix (cm)</label><input class="field" type="number" step="0.5" min="0" max="10" name="cervix_cm"></div>
        <div><label class="field-label">Descent (/5)</label><input class="field" type="number" min="0" max="5" name="descent"></div>
        <div><label class="field-label">Contractions / 10 min</label><input class="field" type="number" min="0" max="7" name="contractions_10min"></div>
        <div><label class="field-label">Strength</label><select class="field" name="contraction_strength">
          <option value="mild">Mild (&lt;20s)</option><option value="moderate" selected>Moderate (20–40s)</option>
          <option value="strong">Strong (&gt;40s)</option></select></div>
        <div><label class="field-label">Fetal heart rate</label><input class="field" type="number" name="fhr" placeholder="110–160"></div>
        <div><label class="field-label">Liquor</label><select class="field" name="liquor">
          <option value="I">I — intact</option><option value="C">C — clear</option>
          <option value="M">M — meconium</option><option value="B">B — blood stained</option><option value="A">A — absent</option></select></div>
        <div><label class="field-label">Moulding</label><select class="field" name="moulding">
          <option value="0">0</option><option value="+">+</option><option value="++">++</option><option value="+++">+++</option></select></div>
        <div><label class="field-label">BP systolic</label><input class="field" type="number" name="bp_sys"></div>
        <div><label class="field-label">BP diastolic</label><input class="field" type="number" name="bp_dia"></div>
        <div><label class="field-label">Pulse</label><input class="field" type="number" name="pulse"></div>
        <div><label class="field-label">Temperature (°F)</label><input class="field" type="number" step="0.1" name="temp_f"></div>
        <div><label class="field-label">Oxytocin</label><input class="field" name="oxytocin" placeholder="e.g. 8 mU/min"></div>
        <div class="col-span-2 md:col-span-3"><label class="field-label">Drugs / urine / notes</label>
          <input class="field" name="drugs"></div>
      </form>`,
      footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record</button>`,
      onMount(m, close) {
        m.querySelector('[data-save]').onclick = async (ev) => {
          const actionButton = ev.currentTarget;
          busy(actionButton, true);
          try {
            await api.post(`/ipd/maternity/${c.id}/partograph`, Object.fromEntries(new FormData(m.querySelector('[data-pf]'))));
            close(); toast('Observation recorded', 'success'); reload();
          } catch (e) { apiError(e); busy(actionButton, false); }
        };
      },
    });
  });
}
