/** Medical certificates workspace. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, patientPicker, printDocument,
  $, $$, esc, bind, toast, modal, renderRows, pill, fmtDate, fmtDateTime, kpi, todayISO, emptyState,
} from './_kit.js';

let f = { kind: '', status: '' };
let cache = [];

const KINDS = [['fitness', 'Fitness to resume duty'], ['sickness', 'Sickness / rest'], ['medical', 'Medical certificate'],
  ['insurance', 'Insurance certificate'], ['birth', 'Birth certificate'], ['death', 'Death certificate']];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    cache = await api.get(`/certificates${qs(f)}`);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Certificates on record', value: cache.length, icon: 'verified_user', sub: 'All types' },
      { label: 'Issued', value: cache.filter((c) => c.status === 'issued').length, icon: 'task_alt', tone: 'success', sub: 'Signed and handed over' },
      { label: 'Draft', value: cache.filter((c) => c.status === 'draft').length, icon: 'edit_note',
        tone: cache.filter((c) => c.status === 'draft').length ? 'warning' : 'success', sub: 'Awaiting signature' },
      { label: 'Issued this month', value: cache.filter((c) => (c.issued_at || '').slice(0, 7) === todayISO().slice(0, 7)).length,
        icon: 'calendar_month', tone: 'info', sub: 'Current month' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), cache, rowHTML, { empty: 'No certificates match this filter.' });
    $('[data-count]', root).textContent = `${cache.length} certificate(s)`;
  }

  bind(root, 'click', '[data-new]', () => editCert(null, load, ctx.query));
  bind(root, 'click', '[data-act]', (e, b) => {
    const c = cache.find((x) => x.id === +b.closest('tr').dataset.id);
    if (b.dataset.act === 'open') editCert(c, load);
    if (b.dataset.act === 'print') printCert(c);
  });

  if (ctx.query.patient) editCert(null, load, ctx.query);
  return live({ topics: ['clinical'], events: ['certificate.saved'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Documents', 'verified_user')} ${liveChip()}`,
    title: 'Medical Certificates',
    subtitle: 'Fitness, sickness, insurance and statutory certificates, issued against the patient record and kept with it.',
    actions: can('certificate.write') ? `<button class="btn-primary" data-new>
      <span class="material-symbols-outlined text-[18px]">add</span> Issue a certificate</button>` : '',
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'select', key: 'kind', label: 'Type', value: f.kind, options: [{ value: '', label: 'All types' }, ...KINDS.map(([v, l]) => ({ value: v, label: l }))] },
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'issued', label: 'Issued' }, { value: 'cancelled', label: 'Cancelled' }] },
      ])}
      ${tableCard({
        title: 'Certificate register', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Number', width: '150px' }, { label: 'Patient' }, { label: 'Type' },
          { label: 'Period' }, { label: 'Issued by' }, { label: 'Status' }, { label: '', width: '140px' }],
      })}`,
  });
}

function rowHTML(c) {
  return `
    <td class="font-data-mono text-body-sm">${esc(c.cert_no)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(c.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.uhid)} · ${c.age_years ?? '—'}y ${esc((c.gender || '')[0] || '')}</div></td>
    <td><span class="pill-neutral capitalize">${esc(c.kind)}</span></td>
    <td class="text-body-sm">${c.from_date ? `${fmtDate(c.from_date)} → ${fmtDate(c.to_date || c.from_date)}` : '—'}</td>
    <td><div class="text-body-md">${esc(c.issued_by_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${c.issued_at ? fmtDate(c.issued_at) : ''}</div></td>
    <td>${pill(c.status)}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="open">Open</button>
      <button class="btn-ghost btn-xs" data-act="print" title="Print"><span class="material-symbols-outlined text-[15px]">print</span></button>
    </td>`;
}

function bodyTemplate(kind, name, from = '', to = '') {
  const who = name || '______________________';
  // the From / To dates fill the date blanks, so the doctor types them once
  const d1 = from ? fmtDate(from) : '______', d2 = to ? fmtDate(to) : '______';
  return {
    fitness: `This is to certify that ${who} was examined by me and is found medically fit to resume normal duties with effect from ${d1}.`,
    sickness: `This is to certify that ${who} is suffering from ______ and is advised rest from ${d1} to ${d2} inclusive. The patient is unfit for duty during this period.`,
    medical: `This is to certify that ${who} was under my treatment for ______ from ${d1} to ${d2}. The patient has responded to treatment and is progressing satisfactorily.`,
    insurance: `This is to certify that ${who} was treated at this hospital for ______. Diagnosis: ______. Treatment given: ______. This certificate is issued at the request of the patient for insurance purposes.`,
    birth: `This is to certify that a ______ child was born to ______ at this hospital on ______ at ______ hours. Weight at birth: ______ kg.`,
    death: `This is to certify that ${who} expired at this hospital on ______ at ______ hours. Immediate cause of death: ______. Antecedent cause: ______.`,
  }[kind] || '';
}

function editCert(c, after, prefill = {}) {
  let picked = c ? { id: c.patient_id, name: c.patient_name, uhid: c.uhid } : null;
  modal({
    title: c ? `Certificate ${c.cert_no}` : 'Issue a certificate', size: 'lg',
    body: `<form data-cf class="space-y-3">
      ${c ? `<div class="p-2.5 rounded-lg bg-surface-container-low text-body-md">
        <strong>${esc(c.patient_name)}</strong> · ${esc(c.uhid)} · ${pill(c.status)}</div>`
        : `<div><label class="field-label">Patient *</label><div data-picker></div></div>`}
      <div class="grid grid-cols-3 gap-3">
        <div><label class="field-label">Type</label><select class="field" name="kind">
          ${KINDS.map(([v, l]) => `<option value="${v}" ${v === c?.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-label">From</label><input class="field" type="date" name="from_date" value="${esc(c?.from_date || todayISO())}"></div>
        <div><label class="field-label">To</label><input class="field" type="date" name="to_date" value="${esc(c?.to_date || todayISO())}"></div>
      </div>
      <div><label class="field-label">Certificate text</label>
        <textarea class="field" rows="10" name="body">${esc(c?.body || bodyTemplate('fitness', ''))}</textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>
      <button class="btn-secondary" data-draft>Save draft</button>
      <button class="btn-primary" data-issue><span class="material-symbols-outlined text-[17px]">draw</span> Sign & issue</button>`,
    onMount(root, close) {
      const form = root.querySelector('[data-cf]');
      let auto = form.body.value;
      const refill = () => {
        if (form.body.value.trim() && form.body.value !== auto) return; // the doctor has written their own text
        auto = form.body.value = bodyTemplate(form.kind.value, picked?.name, form.from_date.value, form.to_date.value);
      };
      if (!c) {
        const pk = patientPicker(root.querySelector('[data-picker]'), (p) => {
          picked = p;
          refill();
        }, { autofocus: true });
        if (prefill.patient) api.get(`/patients/${prefill.patient}`).then((p) => {
          picked = p; pk.input.value = `${p.name} — ${p.uhid}`;
          refill();
        });
      }
      form.kind.addEventListener('change', () => { auto = form.body.value; refill(); });
      form.from_date.addEventListener('change', refill);
      form.to_date.addEventListener('change', refill);
      const save = async (status, btn) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        busy(btn, true);
        try {
          const b = { ...Object.fromEntries(new FormData(form)), status, patient_id: picked.id };
          if (prefill.encounter) b.encounter_id = prefill.encounter;
          if (c) await api.patch(`/certificates/${c.id}`, b);
          else await api.post('/certificates', b);
          close(); toast(status === 'issued' ? 'Certificate issued' : 'Draft saved', 'success'); after();
        } catch (e) { apiError(e); busy(btn, false); }
      };
      root.querySelector('[data-draft]').onclick = (e) => save('draft', e.currentTarget);
      root.querySelector('[data-issue]').onclick = (e) => save('issued', e.currentTarget);
    },
  });
}

function printCert(c) {
  const s = state.meta.settings;
  printDocument(`${c.cert_no} — ${c.patient_name}`, `
    <div style="max-width:700px;margin:0 auto;font-family:Inter,Segoe UI,sans-serif;color:#172B4D">
      <div style="text-align:center;border-bottom:2px solid #881D2C;padding-bottom:10px">
        <div style="font-size:20px;font-weight:700;color:#881D2C">${esc(s.hospital_name)}</div>
        <div style="font-size:11px;color:#526176">${esc(s.address || '')} · ${esc(s.phone || '')}</div>
      </div>
      <div style="text-align:center;margin-top:22px;font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">
        ${esc(c.kind)} certificate</div>
      <table style="width:100%;font-size:12px;margin-top:16px">
        <tr><td style="color:#526176;width:90px">Certificate</td><td style="font-family:monospace">${esc(c.cert_no)}</td>
            <td style="color:#526176;width:60px">Date</td><td>${fmtDate(c.issued_at || c.created_at)}</td></tr>
        <tr><td style="color:#526176">Patient</td><td><b>${esc(c.patient_name)}</b> · ${c.age_years ?? ''}y ${esc(c.gender || '')}</td>
            <td style="color:#526176">UHID</td><td style="font-family:monospace">${esc(c.uhid)}</td></tr>
      </table>
      <div style="margin-top:22px;font-size:13px;line-height:1.85;white-space:pre-line">${esc(c.body || '')}</div>
      ${c.from_date ? `<div style="margin-top:14px;font-size:12px"><b>Period:</b> ${fmtDate(c.from_date)} to ${fmtDate(c.to_date || c.from_date)}</div>` : ''}
      <div style="margin-top:70px;text-align:right;font-size:12px">
        _______________________<br><b>${esc(c.issued_by_name || '')}</b><br>
        <span style="color:#526176">${esc(s.hospital_name)}</span></div>
    </div>`);
}
