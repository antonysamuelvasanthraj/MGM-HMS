/** Ward nursing workspace — assigned patients, due medication and observations. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDateTime, fmtTime, ago, kpi, emptyState, confirmDialog,
} from './_kit.js';

let f = { kind: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/ipd/nursing/board${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Patients on the ward', value: d.counts.patients, icon: 'groups', sub: `${d.counts.critical} in critical units` },
      { label: 'Medication due', value: d.counts.meds_due, icon: 'medication', tone: d.counts.meds_due ? 'warning' : 'success', sub: 'This shift' },
      { label: 'Missed doses', value: d.counts.meds_missed, icon: 'error', tone: d.counts.meds_missed ? 'danger' : 'success', sub: 'Needs an explanation' },
      { label: 'No observations yet', value: d.rows.filter((r) => !r.vitals).length, icon: 'monitor_heart', tone: 'info', sub: 'Nothing recorded on this admission' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), d.rows, rowHTML, { key: 'admission_id', empty: 'No patients assigned.' });   // rows are admissions: the buttons need the admission id
    $('[data-count]', root).textContent = `${d.rows.length} patient(s)`;
  }

  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    const row = cache.find((x) => x.admission_id === id);
    if (b.dataset.act === 'mar') openMAR(id, load);
    if (b.dataset.act === 'note') openNote(id, row, load);
    if (b.dataset.act === 'obs') openObs(row, load);
  });

  return live({ topics: ['ipd'], events: ['nursing.note', 'mar.updated', 'admission.updated', 'vitals.recorded'], load, interval: 60000 });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Nursing station', 'vaccines')} ${liveChip()}`,
    title: 'Ward Nursing Workspace',
    subtitle: 'Assigned patients with their latest observations, due medication and the last note on record.',
    body: `
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'select', key: 'kind', label: 'Unit', value: f.kind, options: [
        { value: '', label: 'All units' }, { value: 'general', label: 'General wards' }, { value: 'private', label: 'Private rooms' },
        { value: 'icu', label: 'ICU' }, { value: 'maternity', label: 'Maternity' }, { value: 'nicu', label: 'NICU' }] }])}
      ${tableCard({
        title: 'My patients', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Bed', width: '110px' }, { label: 'Patient' }, { label: 'Diagnosis' },
          { label: 'Latest vitals' }, { label: 'Medication' }, { label: 'Last note' }, { label: '', width: '230px' }],
      })}`,
  });
}

function rowHTML(r) {
  const v = r.vitals;
  const alert = v && (v.spo2 < 94 || v.bp_sys < 90 || v.pulse > 120 || v.temp_f > 101);
  return `
    <td><div class="font-data-mono font-bold">${esc(r.bed_no || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.ward_name || '')}</div></td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(r.patient_name)}
        ${r.allergy_count ? '<span class="material-symbols-outlined text-[14px] text-danger" title="Allergies">warning</span>' : ''}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')} · day ${r.los_days}</div></td>
    <td class="text-body-md max-w-[180px] truncate" title="${esc(r.diagnosis || '')}">${esc(r.diagnosis || '—')}</td>
    <td>${v ? `<div class="font-data-mono text-body-sm ${alert ? 'text-danger font-bold' : ''}">
        ${v.bp_sys ? `${v.bp_sys}/${v.bp_dia}` : '—'} · ${v.pulse ?? '—'}bpm · ${v.spo2 ?? '—'}%</div>
      <div class="text-label-sm text-on-surface-variant">${ago(v.recorded_at)}${v.from_before_admission ? ` · from ${esc(v.from_before_admission)}` : ''}</div>`
      : '<span class="pill-warning pill-dot">None recorded</span>'}</td>
    <td>${r.meds_due ? `<span class="pill-warning pill-dot">${r.meds_due} due</span>` : '<span class="pill-success pill-dot">Up to date</span>'}
      ${r.meds_missed ? `<span class="pill-danger pill-dot">${r.meds_missed} missed</span>` : ''}</td>
    <td class="text-body-sm max-w-[180px] truncate">${r.last_note ? esc(r.last_note.body || '') : '—'}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="obs">Observations</button>
      <button class="btn-secondary btn-xs" data-act="mar">eMAR</button>
      <button class="btn-primary btn-xs" data-act="note">Note</button></td>`;
}

async function openMAR(admissionId, after) {
  const [a, orders] = await Promise.all([api.get(`/ipd/admissions/${admissionId}`), api.get(`/ipd/admissions/${admissionId}/med-orders`).catch(() => [])]);
  const orderBox = orders.length ? `<div class="mb-4 rounded-lg border border-outline-variant">
      <div class="flex items-center justify-between px-3 py-2 border-b border-outline-variant"><span class="font-label-lg text-label-lg">Doctor's medication orders</span>
        ${can('emar.write') ? '<button class="btn-primary btn-xs" data-from-orders>Put today\'s doses on the chart</button>' : ''}</div>
      <table class="tbl"><tbody>${orders.map((o) => `<tr><td class="font-label-lg text-label-lg">${esc(o.drug)}</td><td class="text-body-md">${esc(o.dose || '')} ${esc(o.route || '')}</td>
        <td class="text-body-md">${esc(o.frequency || '')}${o.duration_days ? ` × ${o.duration_days}d` : ''}</td>
        <td class="text-body-sm text-on-surface-variant">${o.times.length ? o.times.join(', ') : 'when needed (SOS)'}${o.scheduled_today ? ` · ${o.scheduled_today} on today's chart` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  modal({
    title: 'Medication administration record',
    subtitle: `${esc(a.patient_name)} · ${esc(a.ip_no)} · ${esc(a.bed_no || '')}`,
    size: 'lg',
    body: orderBox + (a.mar.length ? `<table class="tbl">
      <thead><tr><th>Drug</th><th>Dose / route</th><th>Due</th><th>State</th><th>Given by</th><th></th></tr></thead>
      <tbody>${a.mar.map((m) => `<tr>
        <td class="font-label-lg text-label-lg">${esc(m.drug)}</td>
        <td class="text-body-md">${esc(m.dose || '')} ${esc(m.route || '')}</td>
        <td class="font-data-mono text-body-sm">${fmtDateTime(m.due_at)}</td>
        <td>${pill(m.status)}</td>
        <td class="text-body-md">${esc(m.given_by_name || '—')}${m.given_at ? `<div class="text-label-sm text-on-surface-variant">${fmtTime(m.given_at)}</div>` : ''}</td>
        <td class="text-right whitespace-nowrap">${m.status === 'due' ? `
          <button class="btn-primary btn-xs" data-give="${m.id}" data-s="given">Given</button>
          <button class="btn-secondary btn-xs" data-give="${m.id}" data-s="held">Held</button>
          <button class="btn-secondary btn-xs" data-give="${m.id}" data-s="refused">Refused</button>` : m.remarks ? `<span class="text-body-sm text-on-surface-variant">${esc(m.remarks)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table>` : emptyState('medication', 'Nothing scheduled', orders.length ? "Use \"Put today's doses on the chart\" above." : 'No medication orders on this admission.')),
    footer: `<button class="btn-secondary" data-close>Close</button>
      ${can('emar.write') ? `<button class="btn-primary" data-add>Schedule a dose</button>` : ''}`,
    onMount(root, close) {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-give]');
        if (!b) return;
        let remarks = '';
        if (b.dataset.s !== 'given') {
          const r = await confirmDialog({ title: b.dataset.s === 'held' ? 'Hold this dose' : 'Patient refused the dose', message: 'Record why — the doctor and the next shift see it on the drug chart.',
            confirmLabel: 'Record', requireReason: true, reasonLabel: 'Reason (e.g. BP 90/60 — held as per protocol, NPO for surgery)' });
          if (!r) return;
          remarks = r.reason;
        }
        try { await api.post(`/ipd/nursing/mar/${b.dataset.give}`, { status: b.dataset.s, remarks }); } catch (err) { apiError(err); return; }
        toast('eMAR updated', 'success');
        close(); after(); openMAR(admissionId, after);
      });
      root.querySelector('[data-add]')?.addEventListener('click', () => { close(); scheduleDose(admissionId, after); });
      root.querySelector('[data-from-orders]')?.addEventListener('click', async (ev) => {
        busy(ev.currentTarget, true);
        try { const r = await api.post(`/ipd/admissions/${admissionId}/mar/from-orders`, {}); toast(r.scheduled ? `${r.scheduled} dose(s) put on today's chart` : 'Today\'s doses are already on the chart', 'success'); close(); after(); openMAR(admissionId, after); }
        catch (err) { apiError(err); busy(ev.currentTarget, false); }
      });
    },
  });
}

function scheduleDose(admissionId, after) {
  modal({
    title: 'Schedule a dose', size: 'sm',
    body: `<form data-df class="space-y-3">
      <div><label class="field-label">Drug *</label><input class="field" name="drug" required></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Dose</label><input class="field" name="dose"></div>
        <div><label class="field-label">Route</label><select class="field" name="route">
          ${['PO', 'IV', 'IM', 'SC', 'Topical', 'Inhaled'].map((r) => `<option>${r}</option>`).join('')}</select></div>
      </div>
      <div><label class="field-label">Due at *</label><input class="field" type="datetime-local" name="due_at" required></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Schedule</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-df]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const b = Object.fromEntries(new FormData(form));
          b.due_at = b.due_at.replace('T', ' ');
          await api.post('/ipd/nursing/mar', { admission_id: admissionId, ...b });
          close(); toast('Dose scheduled', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

async function openNote(admissionId, row, after) {
  // ward-type nursing templates (General ward, ICU, NICU, Labour room…) — editable in My Templates
  const templates = await api.get('/templates?kind=nursing').catch(() => []);
  const h = new Date().getHours();
  const shift = h >= 7 && h < 14 ? 'morning' : h >= 14 && h < 21 ? 'evening' : 'night';
  modal({
    title: 'Nursing note', subtitle: `${esc(row?.patient_name || '')} · ${esc(row?.bed_no || '')}`, size: 'md',
    body: `<form data-nf class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Kind</label><select class="field" name="kind">
        <option value="note">General note</option><option value="observation">Observation</option>
        <option value="intake">Intake</option><option value="output">Output</option><option value="handover">Shift handover</option></select></div>
      <div><label class="field-label">Shift</label><select class="field" name="shift">
        ${['morning', 'evening', 'night'].map((x) => `<option value="${x}" ${x === shift ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div></div>
      ${templates.length ? `<div><label class="field-label">Template</label><select class="field" data-ntpl><option value="">— none —</option>${templates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>` : ''}
      <div><label class="field-label">Note *</label><textarea class="field font-data-mono text-body-sm" rows="12" name="body" required></textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      root.querySelector('[data-ntpl]')?.addEventListener('change', (e) => {
        const t = templates.find((x) => x.id === +e.target.value);
        if (t) { const b = root.querySelector('[name=body]'); b.value = (b.value ? `${b.value}
` : '') + t.body; }
      });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-nf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post('/ipd/nursing/notes', { admission_id: admissionId, ...Object.fromEntries(new FormData(form)) });
          close(); toast('Note recorded', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function openObs(row, after) {
  modal({
    title: 'Record observations', subtitle: `${esc(row.patient_name)} · ${esc(row.bed_no || '')}`, size: 'md',
    body: `<form data-of class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${[['bp_sys', 'Systolic', 'mmHg'], ['bp_dia', 'Diastolic', 'mmHg'], ['pulse', 'Pulse', '/min'],
         ['temp_f', 'Temp', '°F'], ['spo2', 'SpO₂', '%'], ['resp_rate', 'Resp rate', '/min'],
         ['grbs', 'GRBS', 'mg/dL'], ['pain_score', 'Pain', '/10']].map(([n, l, u]) => `
        <div><label class="field-label">${l}</label>
          <div class="relative"><input class="field !pr-12" name="${n}" type="number" step="any">
            <span class="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-surface-container
              font-label-sm text-label-sm text-on-surface-variant">${u}</span></div></div>`).join('')}
      <div class="col-span-2 md:col-span-4"><label class="field-label">Note</label>
        <textarea class="field" rows="2" name="notes"></textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save observations</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const a = await api.get(`/ipd/admissions/${row.admission_id}`);
          await api.post('/vitals', { encounter_id: a.encounter_id, ...Object.fromEntries(new FormData(root.querySelector('[data-of]'))) });
          close(); toast('Observations recorded', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
