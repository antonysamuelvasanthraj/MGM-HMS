/**
 * Discharge summary — one dialog used by the discharge board, the discharged list,
 * the admission record and the patient record. Sections start from what the stay
 * recorded (results, procedures, medicines given, discharge vitals, discharge
 * prescription). Anyone on the ward may save a draft; the treating doctor signs it.
 * A signed summary changes only with an amendment reason, and every version is audited.
 */
import { api, state, can, esc, modal, toast, apiError, busy, pill, fmtDate, fmtDateTime, printDocument } from './views/_kit.js';

const ROWS = { complaints: 3, history: 3, secondary_dx: 2, course: 6, procedures: 3, investigations: 6, treatment: 3, condition: 2, medications: 6, advice: 3, follow_up: 2, warning_signs: 2 };

export async function openDischargeSummary(admissionId, after = () => {}) {
  let d;
  try { d = await api.get(`/ipd/admissions/${admissionId}/summary`); } catch (e) { apiError(e); return; }
  const a = d.admission;
  const signed = d.status === 'final';
  const values = { ...d.prefill, ...(d.summary || {}) };
  const readOnly = !d.can_edit || (signed && !d.can_sign);
  const statusPill = signed ? pill('verified', `Signed${a.summary_by_name ? ` by ${a.summary_by_name}` : ''}`) : d.status === 'draft' ? pill('pending', 'Draft') : pill('neutral', 'Not written yet');

  const field = ([k, label]) => `<div><label class="field-label">${esc(label)}</label>
    ${k === 'follow_up' ? `<div class="flex gap-2"><input type="date" class="field w-[170px]" name="follow_up_date" value="${esc(values.follow_up_date || '')}" ${readOnly ? 'disabled' : ''}>
      <input class="field flex-1" name="follow_up" value="${esc(values.follow_up || '')}" ${readOnly ? 'disabled' : ''}></div>`
      : `<textarea class="field" rows="${ROWS[k] || 3}" name="${k}" ${readOnly ? 'disabled' : ''}>${esc(values[k] || '')}</textarea>`}</div>`;

  modal({
    title: 'Discharge summary', size: 'xl',
    subtitle: `${esc(a.patient_name)} · ${esc(a.uhid)} · ${esc(a.ip_no)} · admitted ${fmtDate(a.admitted_at)}${a.discharged_at ? ` · discharged ${fmtDate(a.discharged_at)}` : ''}`,
    body: `<div class="flex flex-wrap items-center gap-2 mb-3">${statusPill}
        ${a.summary_at ? `<span class="text-body-sm text-on-surface-variant">last saved ${fmtDateTime(a.summary_at)}</span>` : ''}
        ${!d.summary ? '<span class="text-body-sm text-on-surface-variant">Filled from this stay — check and complete each section.</span>' : ''}</div>
      <form data-ds class="space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="md:col-span-2"><label class="field-label">Final diagnosis *</label><input class="field" name="diagnosis" value="${esc(a.diagnosis || '')}" ${readOnly ? 'disabled' : ''}></div>
          <div><label class="field-label">Discharge type</label><select class="field" name="discharge_type" ${readOnly ? 'disabled' : ''}>
            ${Object.entries(d.discharge_types).map(([k, l]) => `<option value="${k}" ${(a.discharge_type || 'routine') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${d.sections.map(field).join('')}</div>
        ${signed && d.can_sign ? `<div><label class="field-label">Amendment reason (required to change a signed summary)</label><input class="field" name="amend_reason" placeholder="e.g. discharge medication dose corrected"></div>` : ''}
      </form>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      <button class="btn-secondary" data-print><span class="material-symbols-outlined text-[18px]">print</span> Print</button>
      ${!readOnly && !signed ? '<button class="btn-secondary" data-save>Save draft</button>' : ''}
      ${!readOnly && !signed && d.can_sign ? '<button class="btn-primary" data-sign>Sign &amp; finalise</button>' : ''}
      ${!readOnly && signed ? '<button class="btn-primary" data-save>Save amendment</button>' : ''}`,
    onMount(root, close) {
      const form = root.querySelector('[data-ds]');
      const collect = () => {
        const f = Object.fromEntries(new FormData(form));
        const sections = {};
        for (const [k] of d.sections) sections[k] = f[k] ?? values[k] ?? '';
        sections.follow_up_date = f.follow_up_date || '';
        return { diagnosis: f.diagnosis ?? a.diagnosis, discharge_type: f.discharge_type ?? a.discharge_type, sections, amend_reason: f.amend_reason };
      };
      const save = (finalize) => async (ev) => {
        const b = ev.currentTarget; busy(b, true);
        try {
          await api.put(`/ipd/admissions/${a.id}/summary`, { ...collect(), finalize });
          close(); toast(finalize ? 'Discharge summary signed' : signed ? 'Amendment saved' : 'Draft saved', 'success'); after();
        } catch (e) { apiError(e); busy(b, false); }
      };
      root.querySelector('[data-save]')?.addEventListener('click', save(false));
      root.querySelector('[data-sign]')?.addEventListener('click', save(true));
      root.querySelector('[data-print]').onclick = () => printSummary(d, collect());
    },
  });
}

/** The printable summary on the hospital letterhead. */
export function printSummary(d, v) {
  const a = d.admission, s = state.meta?.settings || {};
  const block = ([k, label]) => {
    const text = k === 'follow_up' ? [v.sections.follow_up_date ? `On ${fmtDate(v.sections.follow_up_date)}` : '', v.sections.follow_up].filter(Boolean).join(' — ') : v.sections[k];
    return String(text || '').trim() ? `<div style="margin-top:12px"><div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#881D2C">${esc(label)}</div>
      <div style="font-size:12px;white-space:pre-wrap;margin-top:3px">${esc(text)}</div></div>` : '';
  };
  printDocument(`Discharge summary — ${a.patient_name}`, `
    <div style="max-width:760px;margin:0 auto;font-family:Inter,Segoe UI,sans-serif;color:#172B4D">
      <div style="border-bottom:2px solid #881D2C;padding-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end">
        <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(s.hospital_name || '')}</div>
          <div style="font-size:11px;color:#526176">${esc(s.address || '')}${s.phone ? ` · ${esc(s.phone)}` : ''}</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.08em">DISCHARGE SUMMARY</div>
          <div style="font-size:11px;font-family:monospace">${esc(a.ip_no)}</div>
          ${d.status !== 'final' ? '<div style="font-size:10px;color:#B54708;font-weight:700">DRAFT — NOT SIGNED</div>' : ''}</div>
      </div>
      <table style="width:100%;font-size:12px;margin-top:10px;border-collapse:collapse">
        <tr><td style="color:#526176;width:95px">Patient</td><td><b>${esc(a.patient_name)}</b> · ${a.age_years ?? ''}y ${esc(a.gender || '')}</td>
            <td style="color:#526176;width:85px">UHID</td><td style="font-family:monospace">${esc(a.uhid)}</td></tr>
        <tr><td style="color:#526176">Admitted</td><td>${fmtDateTime(a.admitted_at)}</td>
            <td style="color:#526176">Discharged</td><td>${a.discharged_at ? fmtDateTime(a.discharged_at) : '—'}</td></tr>
        <tr><td style="color:#526176">Consultant</td><td>${esc(a.consultant_name || '')}</td>
            <td style="color:#526176">Ward / bed</td><td>${esc(a.ward_name || '')} ${esc(a.bed_no || '')}</td></tr>
        <tr><td style="color:#526176">Discharge</td><td colspan="3">${esc(d.discharge_types[v.discharge_type] || 'Routine')}</td></tr>
        ${a.attendant_name ? `<tr><td style="color:#526176">Attendant</td><td colspan="3">${esc(a.attendant_name)}${a.attendant_relation ? ` (${esc(a.attendant_relation)})` : ''}${a.attendant_mobile ? ` · ${esc(a.attendant_mobile)}` : ''}</td></tr>` : ''}
        ${a.mlc ? `<tr><td style="color:#526176">MLC</td><td colspan="3"><b>Medico-legal case${a.mlc_no ? ` · ${esc(a.mlc_no)}` : ''}</b></td></tr>` : ''}
      </table>
      <div style="margin-top:12px;padding:8px 10px;background:#F7F8FA;border-left:3px solid #881D2C">
        <div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#881D2C">Final diagnosis</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(v.diagnosis || '—')}</div></div>
      ${d.sections.map(block).join('')}
      <div style="margin-top:46px;display:flex;justify-content:space-between;font-size:11px">
        <div>Patient / attendant signature<br><br>_______________________</div>
        <div style="text-align:right">_______________________<br><b>${esc(a.consultant_name || '')}</b><br>${esc(a.consultant_qualification || '')}${a.consultant_reg_no ? ` · Reg. ${esc(a.consultant_reg_no)}` : ''}</div>
      </div>
    </div>`);
}
