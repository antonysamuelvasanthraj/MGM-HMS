/**
 * Clinical consultation workspace.
 *
 * Clinical screens lead with identity and allergies, then visit context, then
 * documentation and orders, then the save/sign action — per the brief's
 * clinical page order.
 */
import {
  page, eyebrow, card, live, mountPage, patientBanner, apiError, busy,
  api, qs, state, can, navigate, doctorOptions,
  $, $$, esc, bind, toast, modal, drawer, confirmDialog, pill, priorityPill, flagPill,
  money, fmtDate, fmtDateTime, fmtTime, ago, spinner, emptyState, todayISO, services, printDocument, ageText,
} from './_kit.js';
import { rxRow, readRx, wireRx } from '../rx-editor.js';

let encounterId = null;

export async function mount(ctx) {
  encounterId = ctx.query.encounter || null;
  const root = mountPage(ctx, `<div class="p-6">${spinner('Loading')}</div>`);
  let cleanWorkspace = () => {};
  let disposed = false;
  let generation = 0;

  async function load(context = {}) {
    // Live updates must never replace a clinician's unsaved text.
    if (context.live && root.querySelector('[data-cf]')) return;
    const version = ++generation;
    cleanWorkspace();
    if (!encounterId) {
      const html = await picker();
      if (disposed || version !== generation) return;
      root.innerHTML = html; cleanWorkspace = wirePicker(root, load); return;
    }
    const [e, templates] = await Promise.all([
      api.get(`/encounters/${encounterId}`),
      api.get('/templates?kind=consultation').catch(() => []),
    ]);
    if (disposed || version !== generation) return;
    // a live refresh of the same visit must not wipe what the doctor is typing
    const kept = keepTyping(root, e.id);
    root.innerHTML = workspace(e, templates);
    restoreTyping(root, kept);
    cleanWorkspace = wire(root, e, templates, load);
  }

  const stop = live({ topics: ['clinical', 'queue', encounterId ? `encounter:${encounterId}` : 'clinical'],
    events: ['vitals.recorded', 'orders.created', 'order.updated', 'lab.verified', 'queue.called'], load });
  return () => { disposed = true; cleanWorkspace(); stop(); };
}

/** Unsaved prescription lines and note text on screen for this visit (null when another visit was showing). */
function keepTyping(root, encounterId) {
  const rx = root.querySelector('[data-rx]');
  if (!rx || +rx.dataset.enc !== +encounterId) return null;
  const form = root.querySelector('form[data-cf]');
  return {
    rx: readRx(root, { preserveBlank: true }).map((i, n) => ({ ...i, form: root.querySelectorAll('[data-rx-row]')[n]?.dataset.form })),
    note: form ? Object.fromEntries([...form.elements].filter((el) => el.name).map((el) => [el.name, el.value])) : {},
  };
}
function restoreTyping(root, kept) {
  if (!kept) return;
  root.querySelector('[data-rx]').innerHTML = kept.rx.map(rxRow).join('');
  const form = root.querySelector('form[data-cf]');
  if (!form) return;
  for (const [name, value] of Object.entries(kept.note)) {
    const el = form.elements[name];
    if (!el || el.value === value) continue;
    el.value = value;
    queueMicrotask(() => el.dispatchEvent(new Event('input', { bubbles: true }))); // re-arm the draft autosave
  }
}

async function picker() {
  const doctorId = state.user.role === 'doctor' ? state.user.id : '';
  const { rows } = await api.get(`/queue${qs({ date: todayISO(), doctor_id: doctorId })}`);
  const live_ = rows.filter((r) => !['closed', 'cancelled'].includes(r.stage));
  return page({
    eyebrow: eyebrow('Clinical workspace', 'stethoscope'),
    title: 'Consultation',
    subtitle: 'Pick the patient you are seeing. The workspace opens with their identity, allergies and today’s vitals already in view.',
    body: live_.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${live_.map((r) => `<button class="card p-3 text-left hover:border-primary/50 transition-colors" data-pick="${r.id}">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-grid place-items-center w-9 h-9 rounded-lg bg-primary-fixed text-primary font-data-mono font-bold">${r.token_no ?? '—'}</span>
            ${pill(r.stage)}
          </div>
          <div class="font-label-lg text-label-lg mt-2">${esc(r.patient_name)}</div>
          <div class="text-body-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc(r.gender || '')}</div>
          <div class="text-body-sm text-on-surface-variant mt-1">${esc(r.doctor_name || '')}</div>
          <div class="flex items-center gap-1.5 mt-2">${pill(r.payment_status)}
            ${r.vitals_count ? '<span class="pill-success pill-dot">Vitals</span>' : '<span class="pill-warning pill-dot">No vitals</span>'}
            ${r.allergy_count ? '<span class="pill-danger pill-dot">Allergy</span>' : ''}</div>
        </button>`).join('')}</div>`
      : emptyState('event_busy', 'No patients in your queue today', 'Registrations appear here as reception opens visits.',
        `<a href="/doctor-queue" class="btn-primary">Open the doctor queue</a>`),
  });
}

function wirePicker(root, load) {
  return bind(root, 'click', '[data-pick]', (e, b) => {
    encounterId = b.dataset.pick;
    history.replaceState({}, '', `/consultation?encounter=${encounterId}`);
    load();
  });
}

/* --------------------------------------------------------------- layout */

function workspace(e, templates) {
  const c = e.consultation || {};
  const isSigned = ['signed', 'amended'].includes(c.status);
  const v = e.vitals;
  return page({
    wide: true,
    eyebrow: `${eyebrow('Consultation', 'stethoscope')}
      <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(e.encounter_no)}</span>
      ${e.token_no ? `<span class="pill-brand">Token ${e.token_no}</span>` : ''}
      ${e.kind === 'IP' ? '<span class="pill-info">Inpatient</span>' : e.kind === 'EMG' ? '<span class="pill-danger">Emergency</span>' : `${pill(e.stage)} ${pill(e.payment_status)}`}`,
    title: e.patient_name,
    subtitle: `${ageText(e.patient || e)} ${esc(e.gender || '')} · ${esc(e.uhid)} · ${e.kind === 'IP' ? 'Ward round — inpatient' : e.kind === 'EMG' ? 'Emergency care' : e.visit_type === 'followup' ? 'Follow-up' : 'New consultation'} with ${esc(e.doctor_name || '—')}`,
    actions: `<button class="btn-secondary" data-templates><span class="material-symbols-outlined text-[18px]">article</span> Templates</button>
      <button class="btn-secondary" data-change><span class="material-symbols-outlined text-[18px]">swap_horiz</span> Change patient</button>
      <button class="btn-secondary" data-save-draft ${isSigned ? 'disabled' : ''}><span class="material-symbols-outlined text-[18px]">save</span> Save draft</button>
      <button class="btn-primary" data-sign><span class="material-symbols-outlined text-[18px]">draw</span> ${isSigned ? 'Save amendment' : 'Sign & complete'}</button>`,
    body: `
      ${patientBanner(e.patient)}
      <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div class="space-y-5">
          ${card({
            title: 'Documentation',
            subtitle: isSigned ? 'Signed — any change is recorded as an amendment with a reason' : 'Autosaves as a draft while you type',
            actions: c.status ? pill(c.status) : '',
            body: `<form data-cf class="space-y-3.5">
              <div><label class="field-label">Chief complaint</label>
                <textarea class="field" rows="2" name="chief_complaint" placeholder="Presenting complaint and duration">${esc(c.chief_complaint || '')}</textarea></div>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                <div><label class="field-label">History of present illness</label>
                  <textarea class="field" rows="4" name="hopi">${esc(c.hopi || '')}</textarea></div>
                <div><label class="field-label">Past history / comorbidities</label>
                  <textarea class="field" rows="4" name="past_history">${esc(c.past_history || '')}</textarea></div>
              </div>
              <div><label class="field-label">Examination</label>
                <textarea class="field" rows="4" name="examination" placeholder="General condition, systemic examination">${esc(c.examination || '')}</textarea></div>
              <div class="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-3.5">
                <div><label class="field-label">Diagnosis</label>
                  <input class="field" name="diagnosis" value="${esc(c.diagnosis || '')}" placeholder="Working or final diagnosis"></div>
                <div><label class="field-label">ICD-10 code</label>
                  <input class="field" name="icd_codes" value="${esc(c.icd_codes || '')}" placeholder="e.g. J06.9"></div>
              </div>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                <div><label class="field-label">Plan</label><textarea class="field" rows="3" name="plan">${esc(c.plan || '')}</textarea></div>
                <div><label class="field-label">Advice to patient</label><textarea class="field" rows="3" name="advice">${esc(c.advice || '')}</textarea></div>
              </div>
              <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3.5 items-end">
                <div><label class="field-label">Review on</label>
                  <input class="field" type="date" name="follow_up_date" value="${esc(c.follow_up_date || '')}"></div>
                <div class="text-body-sm text-on-surface-variant" data-autosave>${isSigned ? 'Signed consultation saved.' : c.id ? 'Draft saved.' : 'Draft not yet saved.'}</div>
              </div>
            </form>`,
          })}

          ${card({
            title: 'Prescription',
            actions: `<button class="btn-secondary btn-sm" data-add-drug><span class="material-symbols-outlined text-[15px]">add</span> Add drug</button>`,
            pad: false,
            body: `<div data-rx data-enc="${e.id}" class="divide-y divide-outline-variant">${(e.prescription?.items || []).map(rxRow).join('')}</div>
              <div class="p-3 border-t border-outline-variant flex items-center justify-between">
                <span class="text-body-sm text-on-surface-variant">Saved with the note; the pharmacy queue picks it up immediately.</span>
                <button class="btn-secondary btn-sm" data-save-rx>Save prescription</button>
              </div>`,
          })}

          ${card({
            title: 'Orders placed on this visit', pad: false,
            actions: `<button class="btn-secondary btn-sm" data-order><span class="material-symbols-outlined text-[15px]">add</span> Order investigations</button>`,
            body: e.orders.length ? `<table class="tbl">
              <thead><tr><th>Investigation</th><th>Priority</th><th>Work state</th><th>Result</th><th>Ordered</th></tr></thead>
              <tbody>${e.orders.map((o) => `<tr>
                <td><div class="font-label-lg text-label-lg">${esc(o.label)}</div>
                  <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(o.order_no)}</div></td>
                <td>${priorityPill(o.priority)}</td><td>${pill(o.status)}</td>
                <td class="whitespace-nowrap">${o.status === 'verified' ? `<button class="btn-ghost btn-xs" data-result="${o.id}" data-cat="${o.category}">View report</button>
                  ${o.abnormal_count ? `<span class="pill-danger pill-dot">${o.abnormal_count} abnormal</span>` : ''}` : '<span class="text-on-surface-variant">—</span>'}</td>
                <td class="text-body-sm">${fmtTime(o.ordered_at)}</td></tr>`).join('')}</tbody></table>`
              : `<p class="p-4 text-body-md text-on-surface-variant">No investigations ordered on this visit.</p>`,
          })}
        </div>

        <div class="space-y-5">
          ${card({
            title: "Today's vitals",
            actions: v ? `<span class="font-data-mono text-label-sm text-on-surface-variant">${fmtTime(v.recorded_at)}</span>` : '',
            body: v ? `<div class="grid grid-cols-2 gap-2">
                ${[['BP', v.bp_sys ? `${v.bp_sys}/${v.bp_dia}` : '—', 'mmHg', v.bp_sys > 140],
                   ['Pulse', v.pulse ?? '—', '/min', v.pulse > 100],
                   ['Temp', v.temp_f ?? '—', '°F', v.temp_f > 100.4],
                   ['SpO₂', v.spo2 ?? '—', '%', v.spo2 < 94],
                   ['Weight', v.weight_kg ?? '—', 'kg', false],
                   ['BMI', v.bmi ?? '—', '', v.bmi > 30],
                   ['GRBS', v.grbs ?? '—', 'mg/dL', v.grbs > 180],
                   ['Pain', v.pain_score ?? '—', '/10', v.pain_score >= 7]].map(([l, val, u, alert]) => `
                  <div class="p-2 rounded border ${alert ? 'border-danger/30 bg-danger-bg' : 'border-outline-variant'}">
                    <div class="font-label-sm text-label-sm uppercase tracking-wider ${alert ? 'text-danger' : 'text-on-surface-variant'}">${l}</div>
                    <div class="font-title-md text-title-md tnum ${alert ? 'text-danger' : ''}">${val}<span class="text-label-sm font-normal ml-0.5">${u}</span></div>
                  </div>`).join('')}</div>`
              : `<p class="text-body-md text-warning">No vitals recorded for this visit.</p>`,
          })}
          ${card({ title: 'Previous encounters', pad: false, body: `<div data-history>${spinner('Loading history')}</div>` })}
          ${card({
            title: 'Quick actions',
            body: `<div class="flex flex-col gap-2">
              <button class="btn-secondary btn-sm justify-start" data-order><span class="material-symbols-outlined text-[16px]">science</span> Order lab / imaging</button>
              <button class="btn-secondary btn-sm justify-start" data-certificate><span class="material-symbols-outlined text-[16px]">verified_user</span> Issue certificate</button>
              <button class="btn-secondary btn-sm justify-start" data-print-rx><span class="material-symbols-outlined text-[16px]">print</span> Print prescription</button>
              <a class="btn-secondary btn-sm justify-start" href="/visit/${e.id}"><span class="material-symbols-outlined text-[16px]">open_in_new</span> Full visit sheet</a>
            </div>`,
          })}
        </div>
      </div>`,
  });
}



/* ------------------------------------------------------------ behaviour */

function wire(root, e, templates, reload) {
  const form = $('[data-cf]', root);
  let draftTimer;
  const isSigned = ['signed', 'amended'].includes(e.consultation?.status);
  const unbind = [];

  wireRx($('[data-rx]', root));

  // previous encounters panel
  api.get(`/patients/${e.patient_id}/timeline`).then((d) => {
    if (!root.contains(form)) return;
    const prev = d.encounters.filter((x) => x.id !== e.id).slice(0, 8);
    $('[data-history]', root).innerHTML = prev.length
      ? `<ul class="divide-y divide-outline-variant">${prev.map((x) => `
          <li class="px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <span class="font-label-lg text-label-lg">${fmtDate(x.visit_date)}</span>
              <a class="btn-ghost btn-xs" href="/visit/${x.id}">Open</a></div>
            <div class="text-body-sm text-on-surface-variant">${esc(x.doctor_name || '')} · ${esc(x.dept_name || '')}</div>
            ${x.diagnosis ? `<div class="text-body-md mt-0.5">${esc(x.diagnosis)}</div>` : ''}
          </li>`).join('')}</ul>`
      : `<p class="p-3 text-body-md text-on-surface-variant">This is the patient's first recorded visit.</p>`;
  }).catch(() => {
    const panel = $('[data-history]', root);
    if (root.contains(form) && panel) panel.textContent = 'History could not be loaded.';
  });

  // autosave draft
  const mark = (txt) => { const n = $('[data-autosave]', root); if (n) n.textContent = txt; };
  form.addEventListener('input', () => {
    clearTimeout(draftTimer);
    if (isSigned) { mark('Use Save amendment to record changes with a reason.'); return; }
    mark('Saving draft…');
    draftTimer = setTimeout(() => save(false).then(() => mark(`Draft saved ${fmtTime(new Date())}`)).catch(() => mark('Draft not saved')), 1400);
  });

  async function save(sign) {
    clearTimeout(draftTimer);
    const body = Object.fromEntries(new FormData(form));
    body.encounter_id = e.id;
    if (sign) body.status = 'signed';
    if (sign && isSigned) {
      const r = await confirmDialog({
        title: 'Amend a signed note?',
        message: 'This consultation is already signed. Amendments keep the original text and record who changed what.',
        confirmLabel: 'Record amendment', requireReason: true, reasonLabel: 'Reason for the amendment',
      });
      if (!r) throw new Error('cancelled');
      body.amend_reason = r.reason;
    }
    return api.post('/consultations', body);
  }

  $('[data-save-draft]', root).onclick = async (ev) => {
    const actionButton = ev.currentTarget;
    busy(actionButton, true, 'Saving');
    try { await save(false); toast('Draft saved', 'success'); mark(`Draft saved ${fmtTime(new Date())}`); }
    catch (err) { apiError(err, 'Could not save the note'); }
    finally { busy(actionButton, false); }
  };

  $('[data-sign]', root).onclick = async (ev) => {
    if (!form.diagnosis.value.trim()) { toast('Record a diagnosis before signing', 'warning'); return; }
    const actionButton = ev.currentTarget;
    busy(actionButton, true, 'Signing');
    try {
      await saveRx(root, e, { silent: true });
      const r = await save(true);
      toast(`${e.patient_name} — consultation signed`, 'success', {
        title: 'Saved', action: { label: 'Next patient', run: () => { encounterId = null; history.replaceState({}, '', '/consultation'); reload(); } },
      });
      reload();
    } catch (err) { if (err.message !== 'cancelled') apiError(err, 'Could not sign the note'); busy(actionButton, false); }
  };

  $('[data-change]', root).onclick = () => { encounterId = null; history.replaceState({}, '', '/consultation'); reload(); };

  // prescription editor
  $('[data-add-drug]', root).onclick = () => {
    $('[data-rx]', root).insertAdjacentHTML('beforeend', rxRow());
    $('[data-rx]', root).lastElementChild.querySelector('[name="drug"]').focus();
  };
  unbind.push(bind(root, 'click', '[data-del-rx]', (ev, b) => b.closest('[data-rx-row]').remove()));
  $('[data-save-rx]', root).onclick = async (ev) => {
    const button = ev.currentTarget;
    busy(button, true);
    try { await saveRx(root, e); }
    catch (err) { apiError(err, 'Could not save the prescription'); }
    finally { busy(button, false); }
  };

  // templates
  $('[data-templates]', root).onclick = () => openTemplates(templates, (t) => {
    // a template written with headings ("Chief Complaints:", "Diagnosis:"…) fills the matching boxes
    const parts = splitTemplate(t.body);
    if (!parts.length) parts.push([form.examination.value ? 'plan' : 'examination', t.body]);
    for (const [target, text] of parts) {
      const field = form[target];
      const separator = field.tagName === 'INPUT' ? '; ' : '\n';
      const inserted = field.tagName === 'INPUT' ? text.replace(/\r?\n/g, '; ') : text;
      field.value = (field.value ? field.value + separator : '') + inserted;
      // count it as typing, so the draft autosaves before anything (an order, a reload) re-reads the note
      form[target].dispatchEvent(new Event('input', { bubbles: true }));
    }
    api.post(`/templates/${t.id}/use`).catch(() => {});
    toast(`Template “${t.name}” inserted`, 'success');
  });

  // orders
  // save the prescription before the order reloads the workspace
  $$('[data-order]', root).forEach((b) => (b.onclick = () => openOrderDialog(e, async () => { await saveRx(root, e, { silent: true }).catch(() => {}); reload(); })));
  unbind.push(bind(root, 'click', '[data-result]', (ev, b) => openResult(b.dataset.result, b.dataset.cat)));
  $('[data-certificate]', root).onclick = () => navigate(`/certificates?patient=${e.patient_id}&encounter=${e.id}`);
  $('[data-print-rx]', root).onclick = () => printPrescription(e, form);
  return () => { clearTimeout(draftTimer); unbind.forEach((off) => off()); };
}

async function saveRx(root, e, { silent = false } = {}) {
  const items = readRx(root);
  if (!items.length && silent) return;
  await api.post('/prescriptions', { encounter_id: e.id, items, replace: true });
  if (!silent) toast(`${items.length} drug(s) saved to the prescription`, 'success');
}

/** Template headings → note fields. Order matters: "Plan & Advice" goes to plan only via the plan rule. */
const TEMPLATE_HEADINGS = [
  [/complaint|presenting/i, 'chief_complaint'],
  [/history of present|hopi|present illness/i, 'hopi'],
  [/past|comorbid/i, 'past_history'],
  [/exam|findings/i, 'examination'],
  [/diagnos|impression|assessment/i, 'diagnosis'],
  [/plan|investigation|treatment|management/i, 'plan'],
  [/advice|instruction/i, 'advice'],
];
function splitTemplate(body) {
  const out = new Map();
  let field = null;
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z /&-]{2,40}):\s*(.*)$/);
    const hit = m && TEMPLATE_HEADINGS.find(([re]) => re.test(m[1]));
    if (hit) { field = hit[1]; if (m[2]) out.set(field, [...(out.get(field) || []), m[2]]); continue; }
    if (!field) { if (line.trim()) return []; continue; } // text before any heading: not a sectioned template
    if (line.trim()) out.set(field, [...(out.get(field) || []), line.replace(/^\s*[-•]\s*/, '')]);
  }
  return [...out].map(([f, lines]) => [f, lines.join('\n')]);
}

function openTemplates(templates, onPick) {
  drawer({
    title: 'My templates', subtitle: 'Insert reusable text into the note', width: 'max-w-lg',
    body: templates.length ? `<ul class="divide-y divide-outline-variant">${templates.map((t) => `
      <li class="p-4 hover:bg-surface-container-low cursor-pointer" data-t="${t.id}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-label-lg text-label-lg">${esc(t.name)}</span>
          <span class="font-data-mono text-label-sm text-on-surface-variant">${t.uses} uses</span></div>
        <pre class="text-body-sm text-on-surface-variant mt-1 whitespace-pre-wrap font-sans line-clamp-3">${esc(t.body.slice(0, 220))}</pre>
      </li>`).join('')}</ul>`
      : `<div class="p-6">${emptyState('article', 'No templates yet', 'Create reusable text in My Templates.')}</div>`,
    footer: `<a href="/templates" class="btn-secondary" data-close>Manage templates</a><button class="btn-secondary" data-close>Close</button>`,
    onMount(root, close) {
      root.addEventListener('click', (e) => {
        const li = e.target.closest('[data-t]');
        if (!li) return;
        close(); onPick(templates.find((t) => t.id === +li.dataset.t));
      });
    },
  });
}

/* --------------------------------------------------------------- orders */

export async function openOrderDialog(e, after) {
  let agreed = { rates: {}, payer_name: null };
  try { agreed = await api.get(`/payer-rates/patient/${e.patient_id}`); } catch { /* tariff prices */ }
  const all = state.meta.services.filter((s) => ['lab', 'imaging', 'procedure'].includes(s.category))
    .map((s) => (agreed.rates[s.id] !== undefined ? { ...s, price: agreed.rates[s.id], agreed: true } : s));
  const chosen = new Map();
  modal({
    title: 'Order investigations & procedures',
    subtitle: `${esc(e.patient_name)} · ${esc(e.uhid)}${agreed.payer_name ? ` · prices at ${esc(agreed.payer_name)} agreed rates where set` : ''}`,
    size: 'lg',
    body: `
      <div class="flex flex-wrap gap-2 mb-3">
        <input class="field flex-1 min-w-[12rem]" data-osearch placeholder="Search tests, scans or procedures…" autofocus>
        <select class="field w-40" data-ocat>
          <option value="">All categories</option><option value="lab">Laboratory</option>
          <option value="imaging">Imaging</option><option value="procedure">Procedure</option></select>
        <select class="field w-36" data-opri>
          <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="border border-outline-variant rounded-lg overflow-hidden">
          <div class="px-3 h-9 flex items-center bg-surface-container-low border-b border-outline-variant
            font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Catalogue</div>
          <div class="max-h-72 overflow-y-auto" data-olist></div>
        </div>
        <div class="border border-outline-variant rounded-lg overflow-hidden">
          <div class="px-3 h-9 flex items-center justify-between bg-surface-container-low border-b border-outline-variant">
            <span class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Selected</span>
            <span class="font-data-mono text-label-sm" data-ototal>₹0</span></div>
          <div class="max-h-72 overflow-y-auto" data-osel>
            <p class="p-3 text-body-md text-on-surface-variant">Nothing selected yet.</p></div>
        </div>
      </div>
      <label class="flex items-center gap-2 mt-3 text-body-md">
        <input type="checkbox" data-obill checked> Raise the charges now (unticked holds the order until the desk collects)
      </label>
      <div class="mt-2"><label class="field-label">Clinical note to the department</label>
        <input class="field" data-onote placeholder="e.g. fasting sample, rule out dengue"></div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>
             <button class="btn-primary" data-place>Place orders</button>`,
    onMount(root, close) {
      const list = root.querySelector('[data-olist]');
      const sel = root.querySelector('[data-osel]');
      const paint = () => {
        const q = root.querySelector('[data-osearch]').value.toLowerCase();
        const cat = root.querySelector('[data-ocat]').value;
        const rows = all.filter((s) => (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))).slice(0, 80);
        list.innerHTML = rows.map((s) => `
          <button type="button" class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left
            hover:bg-surface-container-low border-b border-outline-variant/60" data-add="${s.id}">
            <span class="min-w-0"><span class="block font-label-lg text-label-lg truncate">${esc(s.name)}</span>
              <span class="block text-label-sm text-on-surface-variant capitalize">${esc(s.category)}${s.tat_minutes ? ` · TAT ${s.tat_minutes}m` : ''}</span></span>
            <span class="font-data-mono text-body-sm shrink-0">${money(s.price)}</span></button>`).join('')
          || `<p class="p-3 text-body-md text-on-surface-variant">Nothing matches.</p>`;
      };
      const paintSel = () => {
        sel.innerHTML = chosen.size ? [...chosen.values()].map((s) => `
          <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/60">
            <span class="min-w-0 truncate">${esc(s.name)}</span>
            <span class="flex items-center gap-2 shrink-0"><span class="font-data-mono text-body-sm">${money(s.price)}</span>
              <button type="button" class="btn-ghost btn-xs" data-rm="${s.id}"><span class="material-symbols-outlined text-[15px]">close</span></button></span>
          </div>`).join('') : `<p class="p-3 text-body-md text-on-surface-variant">Nothing selected yet.</p>`;
        root.querySelector('[data-ototal]').textContent = money([...chosen.values()].reduce((t, s) => t + s.price, 0));
      };
      root.querySelector('[data-osearch]').addEventListener('input', paint);
      root.querySelector('[data-ocat]').addEventListener('change', paint);
      list.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-add]'); if (!b) return;
        const s = all.find((x) => x.id === +b.dataset.add);
        chosen.set(s.id, s); paintSel();
      });
      sel.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-rm]'); if (!b) return;
        chosen.delete(+b.dataset.rm); paintSel();
      });
      paint(); paintSel();

      root.querySelector('[data-place]').onclick = async (ev) => {
        if (!chosen.size) { toast('Select at least one investigation', 'warning'); return; }
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Placing');
        try {
          const r = await api.post('/orders', {
            encounter_id: e.id,
            bill: root.querySelector('[data-obill]').checked,
            items: [...chosen.values()].map((s) => ({
              service_id: s.id, category: s.category, label: s.name,
              priority: root.querySelector('[data-opri]').value,
              clinical_note: root.querySelector('[data-onote]').value,
            })),
          });
          close();
          toast(`${chosen.size} order(s) placed${r.bill ? (['IP', 'ER'].includes(r.bill.bill_type) ? ` · added to the running ${r.bill.bill_type} bill ${r.bill.bill_no}` : ` · bill ${r.bill.bill_no} for ${money(r.bill.total)}`) : ' · held for payment'}`, 'success');
          after?.();
        } catch (err) { apiError(err, 'Could not place the orders'); busy(actionButton, false); }
      };
    },
  });
}

async function openResult(orderId, category) {
  const d = category === 'imaging'
    ? await api.get(`/imaging/orders/${orderId}`)
    : await api.get(`/lab/report/${orderId}`);
  modal({
    title: d.label || d.service_name, subtitle: `${esc(d.patient_name)} · ${esc(d.uhid)}`, size: 'lg',
    body: category === 'imaging'
      ? `<div class="space-y-3 text-body-lg">
          ${['technique', 'findings', 'impression', 'advice'].filter((k) => d.report?.[k]).map((k) => `
            <div><div class="field-label">${k}</div><div class="whitespace-pre-line">${esc(d.report[k])}</div></div>`).join('')}
          <div class="text-body-sm text-on-surface-variant">Signed by ${esc(d.report?.signed_by_name || '—')} ${d.report?.signed_at ? `on ${fmtDateTime(d.report.signed_at)}` : ''}</div>
        </div>`
      : `<table class="tbl"><thead><tr><th>Parameter</th><th class="text-right">Result</th><th>Reference</th></tr></thead>
        <tbody>${d.results.map((r) => `<tr class="${r.flag ? 'bg-danger-bg/40' : ''}"><td>${esc(r.name)}</td>
          <td class="num whitespace-nowrap ${r.flag ? 'font-bold text-danger' : ''}">${esc(r.value)} <span class="font-normal text-label-sm text-on-surface-variant">${esc(r.unit || '')}</span>
            ${r.flag ? `<div>${flagPill(r.flag)}</div>` : ''}</td>
          <td class="text-body-sm text-on-surface-variant">${esc(r.ref_range || '')}</td></tr>`).join('')}</tbody></table>
        <p class="text-body-sm text-on-surface-variant mt-3">Verified by ${esc(d.verified_by_name || '—')} ${d.verified_at ? `on ${fmtDateTime(d.verified_at)}` : ''}</p>`,
    footer: `<button class="btn-secondary" data-close>Close</button>`,
  });
}

function printPrescription(e, form) {
  const rows = readRx(document);
  const s = state.meta.settings;
  printDocument(`Prescription — ${e.patient_name}`, `
    <div style="max-width:720px;margin:0 auto">
      <div style="border-bottom:2px solid #881D2C;padding-bottom:8px;display:flex;justify-content:space-between">
        <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(s.hospital_name)}</div>
          <div style="font-size:11px;color:#526176">${esc(s.address || '')} · ${esc(s.phone || '')}</div></div>
        <div style="text-align:right;font-size:11px">
          <div style="font-weight:700">${esc(e.doctor_name || '')}</div>
          <div style="color:#526176">${esc(e.doctor_designation || '')}</div></div>
      </div>
      <table style="width:100%;font-size:12px;margin-top:10px">
        <tr><td><b>${esc(e.patient_name)}</b> · ${e.age_years ?? ''}y ${esc(e.gender || '')}</td>
            <td style="text-align:right;font-family:monospace">${esc(e.uhid)}</td></tr>
        <tr><td style="color:#526176">${esc(e.dept_name || '')}</td>
            <td style="text-align:right;color:#526176">${new Date().toLocaleDateString('en-IN')}</td></tr>
      </table>
      ${form.diagnosis.value ? `<div style="margin-top:10px;font-size:12px;white-space:pre-line"><b>Diagnosis:</b> ${esc(form.diagnosis.value)}</div>` : ''}
      <div style="font-size:26px;color:#881D2C;margin-top:14px">℞</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        ${rows.map((r, i) => `<tr>
          <td style="padding:6px 0;border-bottom:1px solid #EEF2F7;width:22px">${i + 1}.</td>
          <td style="padding:6px 0;border-bottom:1px solid #EEF2F7"><b>${esc(r.drug)}</b>${r.qty ? ` <span style="color:#526176">× ${esc(r.qty)}</span>` : ''}
            <div style="color:#526176">${esc(r.route || '')} · ${esc(r.frequency || '')} · ${r.duration_days || '—'} day(s) · ${esc(r.instructions || '')}</div></td>
        </tr>`).join('')}
      </table>
      ${(e.orders || []).filter((o) => o.status !== 'cancelled').length ? `<div style="margin-top:12px;font-size:12px"><b>Investigations advised:</b>
        ${e.orders.filter((o) => o.status !== 'cancelled').map((o) => esc(o.label)).join(', ')}</div>` : ''}
      ${form.advice.value ? `<div style="margin-top:12px;font-size:12px;white-space:pre-line"><b>Advice:</b> ${esc(form.advice.value)}</div>` : ''}
      ${form.follow_up_date.value ? `<div style="font-size:12px"><b>Review on:</b> ${fmtDate(form.follow_up_date.value)}</div>` : ''}
      <div style="margin-top:50px;text-align:right;font-size:11px">
        _______________________<br>${esc(e.doctor_name || '')}<br>
        <span style="color:#526176">Reg. ${esc(state.user.reg_no || '')}</span></div>
    </div>`);
}
