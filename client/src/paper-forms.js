/**
 * Paper clinical forms — print a blank form with the patient's details already on it, fill it in
 * by hand, then record it here with the signed scan attached. Used routinely in Paper and Hybrid
 * mode, and in Paperless mode during a downtime (with its reason).
 */
import { api } from './api.js';
import { setting, can } from './store.js';
import { modal, esc, toast, fmtDateTime, printDocument } from './ui.js';
import { apiError, busy } from './views/_kit.js';
import { mountAttachments } from './attachments.js';

const grid = (cols, rows, h = 22) => `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>${cols.map((c) => `<th style="border:1px solid #555;padding:3px">${c}</th>`).join('')}</tr></thead>
  <tbody>${Array.from({ length: rows }, () => `<tr>${cols.map(() => `<td style="border:1px solid #999;height:${h}px"></td>`).join('')}</tr>`).join('')}</tbody></table>`;
const lines = (n) => Array.from({ length: n }, () => '<div style="border-bottom:1px solid #999;height:24px"></div>').join('');
const tick = (items) => items.map((i) => `<div style="padding:3px 0">☐ ${i}</div>`).join('');
const sign = (who) => `<table style="width:100%;margin-top:24px;font-size:12px"><tr>${who.map((w) => `<td>${w}: ______________________<br><span style="font-size:10px">Name / signature / date / time</span></td>`).join('')}</tr></table>`;

const BODY = {
  vitals_chart: () => grid(['Date / time', 'Temp °F', 'Pulse', 'Resp', 'BP', 'SpO₂ %', 'Pain 0–10', 'GCS', 'Sign'], 26),
  mar: () => `<div style="font-size:11px;margin-bottom:4px">Write each drug once; initial the box when given, R = refused, H = held (reason on the back).</div>${grid(['Drug · dose · route · frequency', 'Start', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7', 'Stop / sign'], 16, 30)}`,
  intake_output: () => grid(['Time', 'Oral', 'IV fluid', 'Blood / other', 'Urine', 'Drain', 'Vomit / NG', 'Stool', 'Balance', 'Sign'], 26),
  icu_flow: () => grid(['Hour', 'HR', 'BP / MAP', 'RR', 'SpO₂', 'Temp', 'FiO₂ / mode', 'CVP', 'GCS / RASS', 'Infusions', 'Urine', 'Sign'], 24),
  ventilator_chart: () => grid(['Time', 'Mode', 'FiO₂', 'PEEP', 'Vt / Pi', 'RR set/total', 'Ppeak', 'SpO₂', 'ETCO₂', 'ABG', 'Sign'], 24),
  ot_checklist: () => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px">
      <div><b>SIGN IN</b> (before anaesthesia)${tick(['Patient identity, site, procedure and consent confirmed', 'Site marked', 'Anaesthesia machine and medication check complete', 'Pulse oximeter on and working', 'Known allergy?', 'Difficult airway / aspiration risk?', 'Risk of >500 mL blood loss (7 mL/kg in children)?'])}</div>
      <div><b>TIME OUT</b> (before skin incision)${tick(['All team members introduced by name and role', 'Patient, site and procedure confirmed', 'Antibiotic prophylaxis given in the last 60 minutes', 'Critical events reviewed — surgeon, anaesthetist, nursing', 'Essential imaging displayed', 'Sterility confirmed; equipment issues?'])}</div>
      <div><b>SIGN OUT</b> (before the patient leaves theatre)${tick(['Name of the procedure recorded', 'Instrument, sponge and needle counts correct', 'Specimen labelled (with patient name)', 'Equipment problems to address', 'Key concerns for recovery and management'])}</div></div>
    ${sign(['Surgeon', 'Anaesthetist', 'Scrub / circulating nurse'])}`,
  anaesthesia_record: () => `${grid(['Time', 'HR', 'BP', 'SpO₂', 'ETCO₂', 'Agent / %', 'Drugs given', 'Fluids', 'Events'], 22)}${sign(['Anaesthetist'])}`,
  operation_notes: () => `<div style="font-size:12px">Procedure: ${lines(1)}Surgeon / assistants: ${lines(1)}Anaesthesia: ${lines(1)}Findings: ${lines(4)}Procedure details: ${lines(8)}Implants (sticker): ${lines(2)}Blood loss / drains / specimens: ${lines(2)}Post-operative orders: ${lines(4)}</div>${sign(['Surgeon'])}`,
  nursing_assessment: () => `<div style="font-size:12px">${['Presenting complaint', 'Allergies', 'Mobility / fall risk (Morse)', 'Pressure injury risk (Braden)', 'Nutrition', 'Skin / wounds / lines', 'Pain', 'Elimination', 'Psychosocial / language', 'Valuables handed over'].map((s) => `<div style="margin-top:6px"><b>${s}</b>${lines(2)}</div>`).join('')}</div>${sign(['Nurse'])}`,
  consent: () => `<div style="font-size:12px;line-height:1.7">I, ______________________________ (patient / relationship: ______________), consent to <b>______________________________</b>
    to be performed by Dr. ______________________ and team. The nature, purpose, benefits, risks (including ______________________________), alternatives and the risk of not having it
    have been explained to me in ______________ (language), which I understand. I have been able to ask questions. I agree to anaesthesia / sedation / blood transfusion as needed: ☐ Yes ☐ No.</div>
    ${sign(['Patient / guardian', 'Witness', 'Doctor explaining'])}`,
  transfer_note: () => `<div style="font-size:12px">From ________ To ________ Time ________ Reason ${lines(1)}Diagnosis / condition ${lines(2)}Vitals at transfer ${lines(1)}Lines, drains, infusions ${lines(2)}Pending tests / plan ${lines(3)}</div>${sign(['Handing over', 'Receiving'])}`,
  consultation_sheet: () => `<div style="font-size:12px">Complaints ${lines(3)}History ${lines(3)}Examination ${lines(4)}Diagnosis ${lines(2)}Plan / investigations ${lines(4)}</div>${sign(['Doctor'])}`,
  prescription: () => `<div style="font-size:26px;color:#881D2C">℞</div>${lines(14)}${sign(['Doctor'])}`,
  discharge_summary: () => `<div style="font-size:12px">${['Diagnosis', 'Presenting complaints', 'Course in hospital', 'Procedures', 'Condition at discharge', 'Medicines on discharge', 'Advice / follow-up'].map((s) => `<div style="margin-top:6px"><b>${s}</b>${lines(3)}</div>`).join('')}</div>${sign(['Consultant'])}`,
  other: () => lines(24),
};

function header(title, p) {
  const a = p.admission;
  return `<div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:6px">
      <div><div style="font-size:16px;font-weight:700;color:#881D2C">${esc(setting('hospital_name', ''))}</div><div style="font-size:10px">${esc(setting('address', ''))}</div></div>
      <div style="text-align:right;font-weight:700;font-size:14px">${esc(title.toUpperCase())}</div></div>
    <table style="width:100%;font-size:11px;margin:6px 0 8px;border:1px solid #555"><tr>
      <td style="padding:3px"><b>Name</b> ${esc(p.name)}</td><td><b>UHID</b> ${esc(p.uhid)}</td><td><b>Age / sex</b> ${p.age_years ?? ''} / ${esc(p.gender || '')}</td>
      <td><b>IP no.</b> ${esc(a?.ip_no || '—')}</td><td><b>Ward / bed</b> ${esc([a?.ward, a?.bed_no].filter(Boolean).join(' ') || '—')}</td><td><b>Consultant</b> ${esc(a?.consultant || '—')}</td></tr></table>`;
}

export async function printBlankForm(patientId, form, title) {
  const p = await api.get(`/labels/patient/${patientId}`);
  printDocument(`${title} — ${p.name}`, `${header(title, p)}${(BODY[form] || BODY.other)()}`, { paper: ['vitals_chart', 'mar', 'intake_output', 'icu_flow', 'ventilator_chart', 'anaesthesia_record', 'ot_checklist'].includes(form) ? 'A4 landscape' : 'A4' });
}

/** The patient's paper forms: print blank, record the signed copy, see what is on file. */
export async function openPaperForms(patient, { admissionId = null } = {}) {
  const [{ forms, mode }, docs] = await Promise.all([api.get('/clinical-documents/forms'), api.get(`/patients/${patient.id}/clinical-documents`)]);
  const areas = [...new Set(forms.map((f) => f.area))];
  const canRecord = can('patient.clinical') || can('nursing.write') || can('ipd.manage');
  modal({ title: `Paper forms — ${patient.name}`, size: 'xl',
    subtitle: mode === 'paperless' ? 'The hospital is in Paperless mode: use paper only during a downtime, and give the reason when you record it.' : 'Print a blank form with the patient\'s details, fill it in, then record the signed copy with its scan.',
    body: `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>${areas.map((a) => `<div class="mt-2"><div class="text-label-sm uppercase tracking-wide text-on-surface-variant">${esc(a)}</div>
        ${forms.filter((f) => f.area === a).map((f) => `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-outline-variant/60">
          <span>${esc(f.title)}</span><span class="flex gap-1"><button class="btn-ghost btn-xs" data-blank="${f.key}" data-title="${esc(f.title)}">Print blank</button>
          ${canRecord ? `<button class="btn-secondary btn-xs" data-record="${f.key}" data-title="${esc(f.title)}">Record signed copy</button>` : ''}</span></div>`).join('')}</div>`).join('')}</div>
      <div><div class="font-label-lg">On file (${docs.length})</div><div class="mt-2 space-y-2 max-h-[55vh] overflow-auto">${docs.map((d) => `<div class="rounded border border-outline-variant p-2">
        <div class="flex justify-between gap-2"><b>${esc(d.title)}</b><span class="text-body-sm font-data-mono">${esc(d.documented_on || '')}</span></div>
        <div class="text-body-sm text-on-surface-variant">${esc(d.area)}${d.ip_no ? ` · ${esc(d.ip_no)}` : ''} · recorded by ${esc(d.recorded_by_name || '')} ${esc(fmtDateTime(d.recorded_at))}${d.notes ? ` · ${esc(d.notes)}` : ''}</div>
        <div data-doc-files="${d.id}" class="mt-1"></div></div>`).join('') || '<p class="text-body-md text-on-surface-variant">No paper document recorded yet.</p>'}</div></div></div>`,
    footer: '<button class="btn-secondary" data-close>Close</button>',
    onMount(root, close) {
      root.querySelectorAll('[data-doc-files]').forEach((h) => mountAttachments(h, 'clinical_document', +h.dataset.docFiles, { canEdit: false }));
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-blank]');
        if (b) printBlankForm(patient.id, b.dataset.blank, b.dataset.title).catch(apiError);
        const r = e.target.closest('[data-record]');
        if (r) { close(); recordDocument(patient, r.dataset.record, r.dataset.title, mode, admissionId); }
      });
    } });
}

function recordDocument(patient, form, title, mode, admissionId) {
  let doc = null;
  modal({ title: `Record — ${title}`, size: 'md', stack: true,
    body: `<div class="space-y-3" data-step1>
      <div class="grid grid-cols-2 gap-3"><div><label class="field-label">Written on</label><input class="field" type="date" data-on value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label class="field-label">Written by</label><input class="field" data-by placeholder="Name on the form"></div></div>
      <div><label class="field-label">${mode === 'paperless' ? 'Downtime reason *' : 'Notes'}</label><input class="field" data-notes placeholder="${mode === 'paperless' ? 'e.g. Network down 02:00–04:30' : ''}"></div></div>
      <div data-step2 class="hidden"><p class="text-body-md mb-2">Now attach the scan or photo of the signed form.</p><div data-att></div></div>`,
    footer: '<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-save>Save & attach scan</button>',
    onMount(root) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (doc) return;
        busy(ev.currentTarget, true);
        try {
          doc = await api.post('/clinical-documents', { patient_id: patient.id, admission_id: admissionId || undefined, form, title,
            documented_on: root.querySelector('[data-on]').value, documented_by_name: root.querySelector('[data-by]').value.trim(), notes: root.querySelector('[data-notes]').value.trim() });
          root.querySelector('[data-step1]').classList.add('hidden'); root.querySelector('[data-step2]').classList.remove('hidden');
          mountAttachments(root.querySelector('[data-att]'), 'clinical_document', doc.id, { canEdit: true });
          ev.currentTarget.classList.add('hidden'); toast('Recorded — attach the scan', 'success');
        } catch (err) { apiError(err); busy(ev.currentTarget, false); }
      };
    } });
}
