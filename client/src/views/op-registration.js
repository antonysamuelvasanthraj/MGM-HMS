import { collectBill } from '../collect.js';
/**
 * OP Registration.
 *
 * Reception's single desk view: find (never duplicate) the patient, open today's
 * visit, show the doctor's tariff, and either take the fee now or leave it in
 * the collection queue. Registration always succeeds — payment is a separate axis.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  patientPicker, doctorOptions, doctorSetupNotice, deptOptions, counterOptions, apiError, busy,
  api, qs, state, can, navigate, on,
  $, $$, esc, el, bind, toast, modal, confirmDialog, renderRows, pill, priorityPill,
  money, fmtTime, todayISO, ago, spinner, emptyState, setting, kpi, payerFieldsHTML, wirePayerFields, printDocument, modeLabel,
} from './_kit.js';

let f = { date: todayISO(), doctor_id: '', stage: '', q: '' };
let picked = null;

export async function mount(ctx) {
  picked = null;
  const root = mountPage(ctx, layout());
  const selectPatient = wirePicker(root);
  let appointment = null;
  if (ctx.query.appointment) appointment = await api.get(`/appointments/${ctx.query.appointment}`);
  wireForm(root, appointment?.id);
  const patientId = appointment?.patient_id || ctx.query.patient;
  if (patientId) selectPatient(await api.get(`/patients/${patientId}`));
  if (appointment?.doctor_id) {
    const doctor = root.querySelector('[data-reg-form] [name="doctor_id"]');
    doctor.value = appointment.doctor_id; doctor.dispatchEvent(new Event('change'));
  }

  const filters = wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const { rows, counts, date } = await api.get(`/queue${qs(f)}`);
    paintKpis(root, counts);
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No visits registered for this filter yet.' });
    $('[data-count]', root).textContent = `${rows.length} visit(s) · ${date}`;
  }

  bind(root, 'click', '[data-act]', async (e, b) => {
    const tr = b.closest('tr');
    const id = tr?.dataset.id;
    if (b.dataset.act === 'collect') openCollect(id, load);
    if (b.dataset.act === 'open') navigate(`/visit/${id}`);
    if (b.dataset.act === 'vitals') navigate(`/vitals-queue?encounter=${id}`);
    if (b.dataset.act === 'cancel') {
      const r = await confirmDialog({ title: 'Cancel this visit?', message: 'The token is released and the visit is closed. Any unpaid consultation bill stays for review.', confirmLabel: 'Cancel visit', tone: 'danger', requireReason: true });
      if (!r) return;
      await api.post(`/encounters/${id}/stage`, { stage: 'cancelled', reason: r.reason });
      toast('Visit cancelled', 'success');
      load();
    }
  });

  return live({
    topics: ['queue', 'opd', 'billing'],
    events: ['encounter.created', 'encounter.stage', 'encounter.updated', 'payment.received', 'vitals.recorded'],
    load,
  });
}

/* ------------------------------------------------------------------ view */

function layout() {
  return page({
    eyebrow: `${eyebrow(setting('campus', 'Srikalahasthi · Multi-speciality'), 'apartment')}
      <span class="font-data-mono text-label-sm text-on-surface-variant">Counter ${esc(state.user.counter?.name || '—')}</span>
      ${liveChip()}`,
    title: 'OP Registration',
    subtitle: 'Reuse the existing UHID for a returning patient. A new consultation is not a new patient.',
    actions: `
      <button class="btn-secondary" data-new-patient>
        <span class="material-symbols-outlined text-[18px]">person_add</span> New patient</button>
      <a href="/op-fee-collection" class="btn-secondary">
        <span class="material-symbols-outlined text-[18px]">payments</span> Fee collection</a>`,
    body: `
      <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,420px)_1fr] gap-5 items-start">
        ${registrationForm()}
        <div class="space-y-4">
          ${kpiRow([], 4)}
          ${filterBar([
            { type: 'date', key: 'date', label: 'Visit date', value: f.date, width: 'w-[150px]' },
            { type: 'select', key: 'doctor_id', label: 'Doctor', options: doctorOptions(), value: f.doctor_id },
            { type: 'select', key: 'stage', label: 'Stage', value: f.stage, options: [
              { value: '', label: 'All stages' }, { value: 'registered', label: 'Registered' },
              { value: 'vitals_done', label: 'Vitals done' }, { value: 'ready', label: 'Ready' },
              { value: 'in_consult', label: 'In consultation' }, { value: 'consulted', label: 'Consulted' },
              { value: 'closed', label: 'Closed' }] },
          ])}
          ${tableCard({
            title: "Today's registrations",
            subtitle: 'Token order, with payment and vitals shown separately',
            actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
            id: 'reg-table', maxHeight: '58vh',
            columns: [
              { label: 'Token', width: '72px' }, { label: 'Patient' }, { label: 'Doctor / Dept' },
              { label: 'Visit' }, { label: 'Stage' }, { label: 'Payment' },
              { label: 'Due', cls: 'text-right' }, { label: 'Registered' }, { label: '', width: '150px' },
            ],
          })}
        </div>
      </div>`,
  });
}

function registrationForm() {
  return `<section class="card 2xl:sticky 2xl:top-[88px]">
    <header class="px-4 h-12 flex items-center justify-between border-b border-outline-variant">
      <h2 class="panel-title">Open a visit</h2>
      <span class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Step 1 – 4</span>
    </header>
    <form class="p-4 space-y-4" data-reg-form>
      ${doctorSetupNotice()}
      <div>
        <label class="field-label">1 · Patient <span class="text-danger">*</span></label>
        <div data-picker></div>
        <div class="hidden mt-2" data-picked></div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="field-label">2 · Visit type</label>
          <select class="field" name="visit_type">
            <option value="new">New consultation</option>
            <option value="followup">Follow-up</option>
          </select>
        </div>
        <div>
          <label class="field-label">Priority</label>
          <select class="field" name="priority">
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div>
        <label class="field-label">3 · Doctor <span class="text-danger">*</span></label>
        <select class="field" name="doctor_id" required ${doctorOptions(false).length ? '' : 'disabled'}>
          <option value="">Select the attending doctor…</option>
          ${doctorOptions(false).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}
        </select>
        <p class="text-body-sm text-on-surface-variant mt-1" data-fee-hint>The consultation tariff appears once a doctor is chosen.</p>
      </div>

      <div class="rounded-lg border border-outline-variant overflow-hidden" data-fee-panel hidden>
        <div class="flex items-center justify-between px-3 h-11 bg-surface-container-low border-b border-outline-variant">
          <span class="font-label-lg text-label-lg">4 · Consultation fee</span>
          <span class="font-headline-md text-headline-md text-primary" data-fee-amount>₹0</span>
        </div>
        <div class="p-3 space-y-3">
          <div class="flex gap-2" data-pay-mode>
            ${[['pay', 'Collect now', 'payments'], ['later', 'Collect later', 'schedule'], ['free', can('payment.approve_free') ? 'Approved free' : 'Request free', 'volunteer_activism']]
              .map(([v, l, i], idx) => `<button type="button" data-v="${v}"
                class="flex-1 flex flex-col items-center gap-1 py-2 rounded border ${idx === 0 ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}">
                <span class="material-symbols-outlined text-[18px]">${i}</span>
                <span class="font-label-md text-label-md">${l}</span></button>`).join('')}
          </div>

          <div data-pay-fields>
            <label class="field-label">Payment method</label>
            <div class="grid grid-cols-3 gap-2" data-mode-group>
              ${[['cash', 'Cash', 'payments'], ['upi', 'UPI', 'qr_code_2'], ['card', 'Card', 'credit_card']]
                .map(([v, l, i], idx) => `<button type="button" data-v="${v}"
                  class="flex items-center justify-center gap-1.5 h-9 rounded border ${idx === 0 ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}">
                  <span class="material-symbols-outlined text-[16px]">${i}</span>
                  <span class="font-label-md text-label-md">${l}</span></button>`).join('')}
            </div>
            <input class="field mt-2 hidden" name="reference" placeholder="Transaction / approval reference">
          </div>

          <div data-free-fields hidden>
            <label class="field-label">Reason for the free visit <span class="text-danger">*</span></label>
            <select class="field" name="free_reason">
              <option value="">Select a reason…</option>
              <option>Revisit within the free follow-up window</option>
              <option>Hospital staff or dependant</option>
              <option>Camp referral — free consultation</option>
              <option>Charity / BPL card</option>
              <option>Administrative waiver</option>
            </select>
            <p class="text-body-sm text-warning mt-1.5 flex items-start gap-1">
              <span class="material-symbols-outlined text-[15px]">info</span>
              Recorded against your user and shown in the audit trail.
              ${can('payment.approve_free') ? '' : 'The visit is saved now with the fee open; an approver marks it free from Approvals. Until then the fee shows as pending.'}</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button class="btn-primary flex-1 !h-11" type="submit" data-submit ${doctorOptions(false).length ? '' : 'disabled'}>
          <span class="material-symbols-outlined text-[18px]">how_to_reg</span> Register visit & allot token</button>
        <button class="btn-secondary !h-11 !px-3" type="reset" title="Clear">
          <span class="material-symbols-outlined text-[18px]">restart_alt</span></button>
      </div>
    </form>
  </section>`;
}

/* ------------------------------------------------------------------ rows */

function rowHTML(r) {
  const due = r.due > 0;
  return `
    <td><span class="inline-grid place-items-center w-9 h-9 rounded-lg font-data-mono font-bold
      ${r.priority === 'urgent' ? 'bg-warning-bg text-warning' : 'bg-primary-fixed text-primary'}">${r.token_no ?? '—'}</span></td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(r.patient_name)}
        ${r.vip ? '<span class="pill-brand">VIP</span>' : ''}
        ${r.allergy_count ? '<span class="material-symbols-outlined text-[14px] text-danger" title="Allergies recorded">warning</span>' : ''}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}</div></td>
    <td><div class="text-body-md">${esc(r.doctor_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.dept_name || '')}</div></td>
    <td>${r.visit_type === 'followup' ? '<span class="pill-info">Follow-up</span>' : '<span class="pill-neutral">New</span>'}</td>
    <td>${pill(r.stage)}</td>
    <td>${pill(r.payment_status)}</td>
    <td class="num ${due ? 'text-danger font-semibold' : 'text-on-surface-variant'}">${due ? money(r.due) : '—'}</td>
    <td><div class="text-body-sm">${fmtTime(r.opened_at)}</div>
      <div class="text-label-sm text-on-surface-variant">${ago(r.opened_at)}</div></td>
    <td class="text-right whitespace-nowrap">
      ${due ? `<button class="btn-primary btn-xs" data-act="collect">Collect</button>` : ''}
      <button class="btn-secondary btn-xs" data-act="open">Open</button>
      ${['registered', 'vitals_pending'].includes(r.stage) ? `<button class="btn-ghost btn-xs" data-act="cancel" title="Cancel visit">
        <span class="material-symbols-outlined text-[15px]">close</span></button>` : ''}
    </td>`;
}

function paintKpis(root, c) {
  $('[data-kpis]', root).innerHTML = [
    { label: 'Registered today', value: c.total, icon: 'how_to_reg', sub: `${c.closed} completed` },
    { label: 'Waiting', value: c.vitals + c.ready, icon: 'hourglass_top', tone: 'info',
      sub: `${c.vitals} for vitals · ${c.ready} for doctor` },
    { label: 'Payment pending', value: c.payment_pending, icon: 'schedule',
      tone: c.payment_pending ? 'warning' : 'success', sub: `${money(c.due_amount)} outstanding` },
    { label: 'In consultation', value: c.in_consult, icon: 'stethoscope', tone: 'success',
      sub: `${c.consulted} consulted` },
  ].map(kpi).join('');
}

/* ------------------------------------------------------------- behaviour */

function wirePicker(root) {
  const selectPatient = (p) => {
    picked = p;
    $('[data-pp-input]', root).value = `${p.name} — ${p.uhid}`;
    const box = $('[data-picked]', root);
    box.hidden = false;
    box.classList.remove('hidden');
    box.innerHTML = `<div class="flex items-start gap-2 p-2.5 rounded-lg bg-surface-container-low border border-outline-variant">
      <span class="material-symbols-outlined text-[18px] text-primary">person_check</span>
      <div class="min-w-0 flex-1 text-body-md">
        <div class="font-label-lg text-label-lg">${esc(p.name)} · <span class="font-data-mono">${esc(p.uhid)}</span></div>
        <div class="text-on-surface-variant">${p.age_years ?? '—'}y ${esc(p.gender)} · ${esc(p.mobile || 'no mobile')} ·
          ${p.visits} previous visit(s)${p.last_visit ? ` · last ${p.last_visit}` : ''}</div>
        ${p.outstanding > 0 ? `<div class="text-danger mt-0.5">Outstanding balance ${money(p.outstanding)} from earlier bills</div>` : ''}
        ${(p.allergies || []).length ? `<div class="text-danger mt-0.5">Allergies: ${p.allergies.map((a) => esc(a.substance)).join(', ')}</div>` : ''}
      </div>
      <a href="/patient/${p.id}" class="btn-ghost btn-xs">Record</a>
    </div>`;
    // payer and credit patients: the fee goes to the payer case / patient credit, so nothing is taken at the desk now
    const PAYER = { insurance: 'Insurance / TPA', aarogyasri: 'Aarogyasri', corporate: 'Corporate', trust: 'Trust', credit: 'Credit (pays later)' }[p.payer_type];
    if (PAYER) {
      $('[data-pay-mode] [data-v="later"]', root)?.click();
      box.insertAdjacentHTML('beforeend', `<div class="mt-1.5 text-body-sm rounded bg-info-bg px-2 py-1">${esc(PAYER)} patient — fee set to <b>Collect later</b>; ${p.payer_type === 'credit' ? 'it stays a patient due' : 'the insurance desk approves it, the desk collects only co-pay'}.</div>`);
    }
  };
  patientPicker($('[data-picker]', root), selectPatient, { autofocus: true });

  $('[data-new-patient]', root).onclick = () => openNewPatient((p) => {
    toast(`${p.name} registered as ${p.uhid}`, 'success', { title: 'New UHID created' });
    selectPatient(p);
  });
  return selectPatient;
}

function wireForm(root, appointmentId = null) {
  const form = $('[data-reg-form]', root);
  const feePanel = $('[data-fee-panel]', root);
  let payMode = 'pay';
  let mode = 'cash';
  let fee = 0;

  form.doctor_id.onchange = () => {
    const d = (state.meta.doctors || []).find((x) => x.id === +form.doctor_id.value);
    if (!d) { feePanel.hidden = true; $('[data-fee-hint]', root).textContent = 'The consultation tariff appears once a doctor is chosen.'; return; }
    fee = form.visit_type.value === 'followup' ? (d.followup_fee ?? d.op_fee ?? 0) : d.op_fee;
    $('[data-fee-hint]', root).innerHTML = d.op_fee > 0
      ? `${esc(d.designation || '')} · standard ${money(d.op_fee)} · follow-up ${money(d.followup_fee ?? 0)} · free within ${d.followup_days ?? 7} days`
      : `<span class="text-warning">No OP fee is configured for this doctor — the visit will open as a free consultation.</span>`;
    feePanel.hidden = fee <= 0;
    $('[data-fee-amount]', root).textContent = money(fee);
  };
  form.visit_type.onchange = () => form.doctor_id.onchange();

  $('[data-pay-mode]', root).onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    payMode = b.dataset.v;
    $$('[data-pay-mode] [data-v]', root).forEach((x) => {
      const on = x === b;
      x.className = x.className.replace(/border-\S+ bg-\S+ text-\S+|border-outline-variant text-on-surface-variant hover:bg-surface-container-low/,
        on ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low');
    });
    $('[data-pay-fields]', root).hidden = payMode !== 'pay';
    $('[data-free-fields]', root).hidden = payMode !== 'free';
  };

  $('[data-mode-group]', root).onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    mode = b.dataset.v;
    $$('[data-mode-group] [data-v]', root).forEach((x) => {
      const on = x === b;
      x.className = x.className.replace(/border-primary bg-primary-fixed text-primary|border-outline-variant text-on-surface-variant hover:bg-surface-container-low/,
        on ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low');
    });
    form.reference.classList.toggle('hidden', mode === 'cash');
  };

  form.onreset = () => { picked = null; $('[data-picked]', root).innerHTML = ''; feePanel.hidden = true; };

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!picked) { toast('Find or create the patient first', 'warning'); return; }
    if (!form.doctor_id.value) { toast('Choose the attending doctor', 'warning'); return; }
    if (payMode === 'free' && !form.free_reason.value) { toast('A free visit needs a reason', 'warning'); return; }
    const btn = $('[data-submit]', root);
    busy(btn, true, 'Registering');
    try {
      const body = {
        patient_id: picked.id,
        doctor_id: +form.doctor_id.value,
        visit_type: form.visit_type.value,
        priority: form.priority.value,
        appointment_id: appointmentId,
      };
      if (payMode === 'pay') body.collect = false;
      if (payMode === 'free') { body.payment_status = 'free'; body.free_reason = form.free_reason.value; }
      const r = await api.post('/encounters', body);
      appointmentId = null;
      const chosen = { mode: mode === 'card' ? 'debit_card' : mode, reference: form.reference.value.trim() };
      const e2 = r.encounter;
      toast(r.approval_pending ? `Free visit sent for approval — the fee stays open until it is approved` : `Token ${e2.token_no} · ${e2.doctor_name}`, 'success', {
        title: `${e2.patient_name} registered${r.approval_pending ? ` · token ${e2.token_no}` : ''}`,
        action: { label: 'Open visit', run: () => navigate(`/visit/${e2.id}`) },
      });
      form.reset();
      $('[data-pp-input]', root)?.focus();
      // after the fee is taken the slip must show it paid: read the visit again, not the pre-payment copy
      if (payMode === 'pay' && r.bill?.balance > 0) collectBill(r.bill.id, async () => {
        try { const v = await api.get(`/encounters/${e2.id}`); showSlip({ ...r, encounter: { ...e2, ...v }, bill: v.bills?.find((b) => b.id === r.bill.id) || r.bill }); }
        catch { showSlip(r); }
      }, chosen);
      else showSlip(r);
    } catch (err) { apiError(err, 'Registration failed'); }
    finally { busy(btn, false); }
  };
}

function showSlip(r) {
  const e = r.encounter;
  modal({
    title: `Token ${e.token_no} — ${e.patient_name}`,
    subtitle: `${esc(e.encounter_no)} · ${esc(e.doctor_name || '')}`,
    size: 'sm',
    body: `<div class="text-center py-3">
        <div class="font-display-lg text-[56px] leading-none text-primary font-bold tnum">${e.token_no}</div>
        <div class="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mt-1">Token number</div>
      </div>
      <dl class="grid grid-cols-[110px_1fr] gap-y-1.5 text-body-lg border-t border-outline-variant pt-3">
        <dt class="text-on-surface-variant">UHID</dt><dd class="font-data-mono">${esc(e.uhid)}</dd>
        <dt class="text-on-surface-variant">Doctor</dt><dd>${esc(e.doctor_name || '—')}</dd>
        <dt class="text-on-surface-variant">Department</dt><dd>${esc(e.dept_name || '—')}</dd>
        <dt class="text-on-surface-variant">Visit</dt><dd>${e.visit_type === 'followup' ? 'Follow-up' : 'New consultation'}</dd>
        <dt class="text-on-surface-variant">Payment</dt><dd>${pill(e.payment_status)}</dd>
        ${r.bill ? `<dt class="text-on-surface-variant">Bill</dt><dd class="font-data-mono">${esc(r.bill.bill_no)} · ${money(r.bill.total)}</dd>` : ''}
      </dl>
      <p class="mt-3 text-body-md text-on-surface-variant">
        ${e.payment_status === 'pending'
          ? (['insurance', 'aarogyasri', 'corporate', 'trust'].includes(e.payer_type)
            ? 'Payer approval is pending. The insurance team confirms coverage and any patient co-pay; the collection desk collects only the patient share. Record vitals and check visit readiness.'
            : 'Send the patient to the collection desk; check payment approval and record vitals before calling the token.')
          : 'Send the patient to the vitals station.'}</p>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      <button class="btn-secondary" data-print>Print slip</button>
      <button class="btn-primary" data-goto>Open visit</button>`,
    onMount(rootEl, close) {
      rootEl.querySelector('[data-goto]').onclick = () => { close(); navigate(`/visit/${e.id}`); };
      rootEl.querySelector('[data-print]').onclick = () => printToken(e, r.bill);
    },
  });
}

function printToken(e, bill) {
  const html = `<div style="max-width:320px;margin:0 auto;text-align:center">
    <div style="font-weight:700;font-size:16px">${esc(setting('hospital_name', 'Hospital'))}</div>
    <div style="font-size:11px;color:#526176">${esc(setting('campus', ''))}</div>
    <hr style="margin:10px 0;border:0;border-top:1px dashed #D8DFE8">
    <div style="font-size:11px;letter-spacing:.1em;color:#526176">OP TOKEN</div>
    <div style="font-size:56px;font-weight:800;color:#881D2C;line-height:1">${e.token_no}</div>
    <div style="margin-top:10px;text-align:left;font-size:12px">
      <div><b>${esc(e.patient_name)}</b> · ${e.age_years ?? ''}y ${esc(e.gender || '')}</div>
      <div>UHID ${esc(e.uhid)}</div>
      <div>${esc(e.doctor_name || '')} — ${esc(e.dept_name || '')}</div>
      <div>${new Date().toLocaleString('en-IN')}</div>
      ${bill ? `<div>Bill ${esc(bill.bill_no)} · ₹${bill.total} · ${bill.status}</div>` : ''}
    </div>
    <hr style="margin:10px 0;border:0;border-top:1px dashed #D8DFE8">
    <div style="font-size:10px;color:#526176">Please wait for your token to be displayed.</div>
  </div>`;
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Token ${e.token_no}</title><style>body{font-family:Inter,Segoe UI,sans-serif;padding:16px}</style></head><body>${html}</body></html>`);
  w.document.close();
  w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 250);
}

/* --------------------------------------------------------- new patient */

export function openNewPatient(onCreated) {
  modal({
    title: 'Register a new patient',
    subtitle: 'Only create a UHID when the person has never been seen here before.',
    size: 'lg',
    body: `<form data-np class="space-y-4">
      <div class="p-2.5 rounded-lg bg-info-bg text-info text-body-md flex items-start gap-2">
        <span class="material-symbols-outlined text-[17px]">info</span>
        A returning patient keeps the same UHID for life. Search first — a new visit is not a new patient.</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2"><label class="field-label">Full name *</label><input class="field" name="name" required></div>
        <div><label class="field-label">Title</label><select class="field" name="title">
          ${['', 'Mr.', 'Mrs.', 'Ms.', 'Master', 'Baby', 'Dr.'].map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div><label class="field-label">Gender *</label><select class="field" name="gender" required>
          <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div><label class="field-label">Age (years) *</label><input class="field" name="age_years" type="number" min="0" max="120" required>
          <p class="text-body-sm text-on-surface-variant mt-1">0 for a baby under one year — add months</p></div>
        <div><label class="field-label">Months</label><input class="field" name="age_months" type="number" min="0" max="11" placeholder="infants"></div>
        <div><label class="field-label">Date of birth</label><input class="field" name="dob" type="date" max="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label class="field-label">Blood group</label><select class="field" name="blood_group">
          ${['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div><label class="field-label">Mobile *</label><input class="field" name="mobile" required placeholder="+91 …"></div>
        <div><label class="field-label">Alternate mobile</label><input class="field" name="alt_mobile"></div>
        <div><label class="field-label">ABHA number</label><input class="field" name="abha" placeholder="14 digit"></div>
        <div class="md:col-span-2"><label class="field-label">Address</label><input class="field" name="address"></div>
        <div><label class="field-label">City</label><input class="field" name="city" value="Hyderabad"></div>
        <div><label class="field-label">State</label><input class="field" name="state" value="Telangana"></div>
        <div><label class="field-label">PIN code</label><input class="field" name="pincode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}"></div>
        <div><label class="field-label">Email</label><input class="field" name="email" type="email"></div>
        <div><label class="field-label">Attendant name</label><input class="field" name="kin_name"></div>
        <div><label class="field-label">Relationship</label><input class="field" name="kin_relation"></div>
        <div><label class="field-label">Attendant mobile</label><input class="field" name="kin_mobile"></div>
        ${payerFieldsHTML({})}
        <div class="md:col-span-3"><label class="field-label">Known allergies</label>
          <input class="field" name="allergy" placeholder="e.g. Penicillin — urticaria (severe). Leave blank if none known.">
          <p class="text-body-sm text-on-surface-variant mt-1">Recorded on the patient record and shown on every clinical screen.</p></div>
      </div>
      <div data-dupes></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>
             <button class="btn-primary" data-save><span class="material-symbols-outlined text-[17px]">person_add</span> Create UHID</button>`,
    onMount(rootEl, close) {
      wirePayerFields(rootEl);
      const form = rootEl.querySelector('[data-np]');
      // a date of birth fills the age (years and, for infants, months)
      form.dob.addEventListener('change', () => {
        if (!form.dob.value) return;
        const b = new Date(form.dob.value), n = new Date();
        let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0);
        months = Math.max(0, months);
        form.age_years.value = Math.floor(months / 12);
        form.age_months.value = Math.floor(months / 12) < 2 ? months % 12 : '';
      });
      const dupes = rootEl.querySelector('[data-dupes]');
      const checkDupes = async () => {
        if (!form.name.value && !form.mobile.value) { dupes.innerHTML = ''; return; }
        const { matches } = await api.get(`/patients/check/duplicate${qs({ name: form.name.value, mobile: form.mobile.value, age: form.age_years.value })}`);
        dupes.innerHTML = matches.length ? `
          <div class="p-3 rounded-lg bg-warning-bg border border-warning/25">
            <div class="font-label-lg text-label-lg text-warning flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">warning</span>
              ${matches.length} existing record(s) look similar — reuse one instead of creating a duplicate</div>
            <div class="mt-2 space-y-1">${matches.map((m) => `
              <div class="flex items-center justify-between gap-2 text-body-md bg-white rounded px-2.5 py-1.5">
                <span>${esc(m.name)} · ${m.age_years ?? '—'}y ${esc(m.gender)} · <span class="font-data-mono">${esc(m.uhid)}</span>
                  <span class="text-on-surface-variant">${m.mobile ? '· ' + esc(m.mobile) : ''}${m.last_visit ? ' · last visit ' + m.last_visit : ''}</span></span>
                <button type="button" class="btn-secondary btn-xs" data-use="${m.id}">Use this patient</button>
              </div>`).join('')}</div>
          </div>` : '';
      };
      form.name.addEventListener('blur', checkDupes);
      form.mobile.addEventListener('blur', checkDupes);
      dupes.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-use]');
        if (!b) return;
        const p = await api.get(`/patients/${b.dataset.use}`);
        close(); onCreated?.(p);
      });
      rootEl.querySelector('[data-save]').onclick = async (ev) => {
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Creating');
        try {
          const fd = Object.fromEntries(new FormData(form));
          if (fd.allergy?.trim()) fd.allergies = [{ substance: fd.allergy.trim(), severity: 'moderate' }];
          delete fd.allergy;
          const p = await api.post('/patients', fd);
          close(); onCreated?.(p);
        } catch (err) { apiError(err, 'Could not create the patient'); busy(actionButton, false); }
      };
    },
  });
}

/* ------------------------------------------------------- collect a fee */

export async function openCollect(encounterOrBillId, after, { billId = null } = {}) {
  try {
    if (!billId) {
      const enc = await api.get('/encounters/' + encounterOrBillId);
      billId = enc.bills.find(b => b.balance > 0 && b.status !== 'cancelled')?.id;
    }
    if (!billId) return toast('Nothing outstanding on this visit', 'info');
    return collectBill(billId, after);
  } catch (err) { apiError(err, 'Could not open collection'); }
}

export function printReceipt(rc) {
  const s = rc.settings || {};
  const html = `
  <div style="max-width:700px;margin:0 auto;font-family:Inter,Segoe UI,sans-serif;color:#172B4D">
    <img src="/assets/mgm-estimation-logo.jpeg" alt="MGM Hospitals" style="width:100%;height:auto;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #881D2C;padding-bottom:10px">
      <div><div style="font-size:19px;font-weight:700;color:#881D2C">${esc(s.hospital_name || '')}</div>
        <div style="font-size:11px;color:#526176">${esc(s.address || '')}<br>${esc(s.phone || '')} · GSTIN ${esc(s.gstin || '')}</div></div>
      <div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.08em">PAYMENT RECEIPT</div>
        <div style="font-size:12px;font-family:monospace">${esc(rc.receipt_no)}</div>
        <div style="font-size:11px;color:#526176">${esc(rc.created_at)}</div></div>
    </div>
    <table style="width:100%;font-size:12px;margin-top:12px">
      <tr><td style="color:#526176;width:110px">Patient</td><td><b>${esc(rc.patient_name)}</b> · ${rc.age_years ?? ''}y ${esc(rc.gender || '')}</td>
          <td style="color:#526176;width:90px">UHID</td><td style="font-family:monospace">${esc(rc.uhid)}</td></tr>
      <tr><td style="color:#526176">Bill</td><td style="font-family:monospace">${esc(rc.bill_no || '—')}</td>
          <td style="color:#526176">Doctor</td><td>${esc(rc.doctor_name || '—')}</td></tr>
      <tr><td style="color:#526176">Counter</td><td>${esc(rc.counter_name || '—')}</td>
          <td style="color:#526176">Received by</td><td>${esc(rc.received_by_name || '')}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:12px">
      <thead><tr style="background:#F5F7FA">
        <th style="text-align:left;padding:7px;border-bottom:1px solid #D8DFE8">Particulars</th>
        <th style="text-align:right;padding:7px;border-bottom:1px solid #D8DFE8;width:60px">Qty</th>
        <th style="text-align:right;padding:7px;border-bottom:1px solid #D8DFE8;width:100px">Amount</th></tr></thead>
      <tbody>${(rc.items || []).map((i) => `<tr>
        <td style="padding:7px;border-bottom:1px solid #EEF2F7">${esc(i.description)}</td>
        <td style="padding:7px;text-align:right;border-bottom:1px solid #EEF2F7">${i.qty}</td>
        <td style="padding:7px;text-align:right;border-bottom:1px solid #EEF2F7;font-family:monospace">${Number(i.amount).toFixed(2)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:7px;text-align:right;color:#526176">Bill total</td>
            <td style="padding:7px;text-align:right;font-family:monospace">${Number(rc.bill_total || 0).toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:7px;text-align:right;font-weight:700">Received (${esc(modeLabel(rc.mode))})</td>
            <td style="padding:7px;text-align:right;font-weight:700;font-family:monospace;color:#166534">${Number(rc.amount).toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:7px;text-align:right;color:#526176">Balance</td>
            <td style="padding:7px;text-align:right;font-family:monospace">${Number(rc.bill_balance || 0).toFixed(2)}</td></tr>
      </tfoot>
    </table>
    ${rc.reference ? `<div style="font-size:11px;color:#526176;margin-top:6px">Reference: ${esc(rc.reference)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:11px;color:#526176">
      <div>Computer generated receipt — valid without signature.</div>
      <div style="text-align:center">_______________________<br>Authorised signatory</div>
    </div>
  </div>`;
  printDocument(rc.receipt_no, html);
}
