/** Maternity & obstetric care — antenatal through labour to postnatal. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, patientPicker,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, fmtDateTime, ago, kpi, emptyState,
} from './_kit.js';

let f = { stage: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  bind(root, 'click', '[data-new]', () => newCase(load));
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/ipd/maternity${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Cases on file', value: d.counts.total, icon: 'pregnant_woman', sub: `${d.counts.antenatal} antenatal` },
      { label: 'In labour', value: d.counts.labour, icon: 'timer', tone: d.counts.labour ? 'warning' : 'success', sub: 'Latent, active or second stage' },
      { label: 'High risk', value: d.counts.high_risk, icon: 'priority_high', tone: d.counts.high_risk ? 'danger' : 'success', sub: 'Needs consultant review' },
      { label: 'Postnatal', value: d.counts.postnatal, icon: 'child_friendly', tone: 'info', sub: 'Mother and baby' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No maternity cases match this filter.' });
    $('[data-count]', root).textContent = `${d.rows.length} case(s)`;
  }

  bind(root, 'click', '[data-act]', (e, b) => {
    const id = +b.closest('tr').dataset.id;
    if (b.dataset.act === 'partograph') navigate(`/partograph?case=${id}`);
    if (b.dataset.act === 'update') updateCase(cache.find((x) => x.id === id), load);
    if (b.dataset.act === 'patient') navigate(`/patient/${cache.find((x) => x.id === id).patient_id}`);
  });

  return live({ topics: ['maternity', 'ipd'], events: ['maternity.updated', 'partograph.entry'], load, interval: 45000 });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Obstetrics', 'child_friendly')} ${liveChip()}`,
    title: 'Maternity & Obstetric Care',
    subtitle: 'Antenatal register, labour watch and postnatal records with the partograph one click away.',
    actions: `<a href="/partograph" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">show_chart</span> Partograph</a>
      ${can('maternity.write') ? '<button class="btn-primary" data-new>New maternity case</button>' : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'select', key: 'stage', label: 'Stage', value: f.stage, options: [
        { value: '', label: 'All stages' }, { value: 'antenatal', label: 'Antenatal' }, { value: 'latent', label: 'Latent phase' },
        { value: 'active_labour', label: 'Active labour' }, { value: 'second_stage', label: 'Second stage' },
        { value: 'postnatal', label: 'Postnatal' }] }])}
      ${tableCard({
        title: 'Maternity register', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Mother' }, { label: 'Obstetric history' }, { label: 'Gestation' },
          { label: 'Risk' }, { label: 'Stage' }, { label: 'Labour progress' },
          { label: 'Bed' }, { label: 'Outcome' }, { label: '', width: '200px' }],
      })}`,
  });
}

function rowHTML(r) {
  const inLabour = ['latent', 'active_labour', 'second_stage'].includes(r.stage);
  return `
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y${r.blood_group ? ` · ${esc(r.blood_group)}` : ''}</div></td>
    <td class="font-data-mono text-body-sm">G${r.gravida ?? '—'} P${r.para ?? '—'} L${r.living ?? '—'} A${r.abortions ?? 0}</td>
    <td><div class="font-data-mono text-body-md">${r.gestation_wks ?? '—'} wks</div>
      <div class="text-label-sm text-on-surface-variant">EDD ${r.edd ? fmtDate(r.edd) : '—'}</div></td>
    <td>${r.risk === 'high' ? '<span class="pill-danger pill-dot">High risk</span>'
      : r.risk === 'moderate' ? '<span class="pill-warning pill-dot">Moderate</span>'
      : '<span class="pill-success pill-dot">Low risk</span>'}</td>
    <td>${pill(r.stage)}</td>
    <td>${inLabour ? `<div class="font-data-mono text-body-md">Cervix ${r.cervix ?? '—'} cm</div>
      <div class="text-label-sm ${r.fhr && (r.fhr < 110 || r.fhr > 160) ? 'text-danger font-semibold' : 'text-on-surface-variant'}">
        FHR ${r.fhr ?? '—'} · ${r.entries} entries</div>` : '<span class="text-on-surface-variant">—</span>'}</td>
    <td><div class="text-body-md">${esc(r.ward_name || '—')}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.bed_no || '')}</div></td>
    <td>${r.delivery_type ? `<div class="text-body-md">${esc(r.delivery_type)}</div>
      <div class="text-label-sm text-on-surface-variant">${r.baby_sex || ''} ${r.baby_weight ? `${r.baby_weight} kg` : ''}
        ${r.apgar1 ? ` · Apgar ${r.apgar1}/${r.apgar5}` : ''}</div>` : '<span class="text-on-surface-variant">—</span>'}</td>
    <td class="text-right whitespace-nowrap">
      ${inLabour ? `<button class="btn-primary btn-xs" data-act="partograph">Partograph</button>` : ''}
      ${can('maternity.write') ? `<button class="btn-secondary btn-xs" data-act="update">Update</button>` : ''}
      <button class="btn-ghost btn-xs" data-act="patient" title="Patient record"><span class="material-symbols-outlined text-[15px]">folder_shared</span></button>
    </td>`;
}

function updateCase(r, after) {
  modal({
    title: `Update — ${r.patient_name}`, subtitle: `G${r.gravida} P${r.para} · ${r.gestation_wks} weeks`, size: 'md',
    body: `<form data-mf class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Stage</label><select class="field" name="stage">
          ${[['antenatal', 'Antenatal'], ['latent', 'Latent phase'], ['active_labour', 'Active labour'],
             ['second_stage', 'Second stage'], ['delivered', 'Delivered'], ['postnatal', 'Postnatal']]
            .map(([v, l]) => `<option value="${v}" ${v === r.stage ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-label">Risk</label><select class="field" name="risk">
          ${['low', 'moderate', 'high'].map((v) => `<option value="${v}" ${v === r.risk ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <fieldset class="border border-outline-variant rounded-lg p-3">
        <legend class="field-label px-1">Delivery outcome</legend>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Type</label><select class="field" name="delivery_type">
            <option value="">—</option>
            ${['Normal Vaginal Delivery', 'LSCS', 'Assisted (Forceps)', 'Assisted (Vacuum)']
              .map((v) => `<option ${v === r.delivery_type ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label class="field-label">Delivered at</label><input class="field" type="datetime-local" name="delivered_at"
            value="${r.delivered_at ? esc(r.delivered_at.replace(' ', 'T').slice(0, 16)) : ''}"></div>
          <div><label class="field-label">Baby weight (kg)</label><input class="field" type="number" step="0.01" name="baby_weight" value="${r.baby_weight ?? ''}"></div>
          <div><label class="field-label">Baby sex</label><select class="field" name="baby_sex">
            <option value="">—</option><option ${r.baby_sex === 'Male' ? 'selected' : ''}>Male</option>
            <option ${r.baby_sex === 'Female' ? 'selected' : ''}>Female</option></select></div>
          <div><label class="field-label">Apgar 1 min</label><input class="field" type="number" name="apgar1" value="${r.apgar1 ?? ''}"></div>
          <div><label class="field-label">Apgar 5 min</label><input class="field" type="number" name="apgar5" value="${r.apgar5 ?? ''}"></div>
        </div>
      </fieldset>
      <div><label class="field-label">Notes</label><textarea class="field" rows="3" name="notes">${esc(r.notes || '')}</textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const b = Object.fromEntries(new FormData(root.querySelector('[data-mf]')));
          if (b.delivered_at) b.delivered_at = b.delivered_at.replace('T', ' ');
          await api.patch(`/ipd/maternity/${r.id}`, b);
          close(); toast('Maternity record updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function newCase(after) {
  let patient = null;
  modal({
    title: 'New maternity case', size: 'md',
    body: `<form id="new-maternity" class="space-y-3">
      <div><label class="field-label">Patient *</label><div data-picker></div></div>
      <div class="grid grid-cols-2 gap-3">
        ${[['gravida','Gravida'],['para','Para'],['living','Living'],['abortions','Abortions']].map(([name,label]) => `<label class="field-label">${label}<input class="field" type="number" min="0" step="1" name="${name}"></label>`).join('')}
        <label class="field-label">Gestation (weeks)<input class="field" type="number" min="0" max="45" step="0.1" name="gestation_wks"></label>
        <label class="field-label">Expected delivery<input class="field" type="date" name="edd"></label>
        <label class="field-label">Risk<select class="field" name="risk"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label>
        <label class="field-label">Stage<select class="field" name="stage"><option value="antenatal">Antenatal</option><option value="latent">Latent phase</option><option value="active_labour">Active labour</option></select></label>
      </div>
      <label class="field-label">Notes<textarea class="field" name="notes" rows="3"></textarea></label>
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" type="submit" form="new-maternity" data-save>Create case</button>',
    onMount(root, close) {
      patientPicker(root.querySelector('[data-picker]'), p => { patient = p; });
      const form = root.querySelector('form');
      form.onsubmit = async event => {
        event.preventDefault();
        if (!patient) { toast('Choose the patient first', 'warning'); return; }
        const button = root.querySelector('[data-save]');
        busy(button, true);
        try {
          await api.post('/ipd/maternity', { ...Object.fromEntries(new FormData(form)), patient_id: patient.id });
          close(); toast('Maternity case created', 'success'); after();
        } catch (e) { apiError(e); } finally { busy(button, false); }
      };
    },
  });
}
