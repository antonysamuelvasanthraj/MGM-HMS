/**
 * Emergency & casualty desk.
 *
 * Arrival → triage → immediate assessment and care → orders → disposition.
 * Nothing on this pathway waits for money; billing is tracked separately.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, live, mountPage, card, patientPicker,
  apiError, busy, api, qs, state, can, navigate, doctorOptions,
  $, $$, esc, bind, toast, modal, renderRows, pill, triagePill, money, mins,
  fmtDateTime, fmtTime, ago, kpi, emptyState, drawer,
} from './_kit.js';

let showAll = false;
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());

  async function load() {
    const d = await api.get(`/ipd/emergency${qs({ all: showAll ? 1 : '' })}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'In the department', value: d.counts.active, icon: 'e911_emergency', tone: d.counts.active ? 'warning' : 'success', sub: 'Not yet dispositioned' },
      { label: 'P1 / P2', value: d.counts.red + d.counts.orange, icon: 'priority_high', tone: (d.counts.red + d.counts.orange) ? 'danger' : 'success', sub: 'Resuscitation and emergent' },
      { label: 'Medico-legal', value: d.counts.mlc, icon: 'gavel', tone: 'info', sub: 'MLC register entries' },
      { label: 'Average time in ED', value: mins(d.counts.avg_wait), icon: 'timer', sub: 'Arrival to now' },
    ].map(kpi).join('');
    $('[data-triage]', root).innerHTML = triageStrip(d.counts);
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'The emergency department is clear.' });
    $('[data-count]', root).textContent = `${d.rows.length} case(s)`;
  }

  bind(root, 'click', '[data-new]', () => newCase(load));
  bind(root, 'click', '[data-mlcno]', (e, b) => {
    e.stopPropagation();
    modal({
      title: 'MLC number', size: 'sm',
      body: `<label class="field-label">Police MLC number</label><input class="field" data-mlc-in autocomplete="off">`,
      footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-mlc>Save</button>`,
      onMount(m, close) {
        m.querySelector('[data-mlc-in]').focus();
        m.querySelector('[data-save-mlc]').onclick = async () => {
          const mlc_no = m.querySelector('[data-mlc-in]').value.trim();
          if (!mlc_no) { toast('Enter the MLC number', 'warning'); return; }
          try { await api.post(`/ipd/emergency/${b.dataset.mlcno}/mlc`, { mlc_no }); close(); toast('MLC number recorded', 'success'); load(); }
          catch (err) { apiError(err); }
        };
      },
    });
  });
  bind(root, 'click', '[data-toggle-all]', (e, b) => { showAll = !showAll; b.textContent = showAll ? 'Active only' : 'Include closed'; load(); });
  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    const row = cache.find((x) => x.id === id);
    if (b.dataset.act === 'edit') editCase(row, load);
    if (b.dataset.act === 'patient' && row.patient_id) navigate(`/patient/${row.patient_id}`);
    if (b.dataset.act === 'admit') {
      if (!row.patient_id) { toast('Link the patient to a UHID before admitting', 'warning'); return; }
      const { admitPatient } = await import('./admissions.js');
      admitPatient(load, null, { patientId: row.patient_id, emergencyId: row.id, er: row });
    }
    if (b.dataset.act === 'charges') erCharges(row, load);
    if (b.dataset.act === 'close') closeCase(row, load);
    if (b.dataset.act === 'link') linkPatient(row, load);
    if (b.dataset.act === 'vitals') { const { openVitals } = await import('./vitals-queue.js'); openVitals(row.encounter_id, load); }
    if (b.dataset.act === 'orders') { try { const enc = await api.get(`/encounters/${row.encounter_id}`); const { openOrderDialog } = await import('./consultation.js'); openOrderDialog(enc, load); } catch (err) { apiError(err); } }
    if (b.dataset.act === 'notes') navigate(`/consultation?encounter=${row.encounter_id}`);
    if (b.dataset.act === 'consumables') { const { openConsumables } = await import('../consumables.js'); openConsumables({ source_type: 'er', source_id: row.id, title: row.case_no, location: 'ER' }, load); }
    if (b.dataset.act === 'collect') { const { collectBill } = await import('../collect.js'); collectBill(row.bill_id, load); }
  });

  return live({ topics: ['emergency', 'dashboard', 'billing', 'ipd'], events: ['emergency.created', 'emergency.updated', 'bill.updated', 'payment.received', 'admission.created'], load, interval: 30000 });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Casualty', 'e911_emergency')} ${liveChip()}
      <span class="pill-danger pill-dot">Care is never gated on payment here</span>`,
    title: 'Emergency & Casualty Desk',
    subtitle: 'Triage on arrival, treat immediately, bill afterwards. Registration and charges follow the patient rather than blocking them.',
    actions: `${can('emergency.treat')?'<a class="btn-secondary" href="/indents">Rack usage & replacement</a>':''}<button class="btn-secondary" data-toggle-all>Include closed</button>
      ${can('emergency.triage') ? `<button class="btn-primary" data-new>
        <span class="material-symbols-outlined text-[18px]">add</span> Register an arrival</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${card({ title: 'Triage load', body: `<div data-triage></div>` })}
      ${tableCard({
        title: 'Emergency register', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '58vh',
        columns: [{ label: 'Case', width: '130px' }, { label: 'Patient' }, { label: 'Triage' },
          { label: 'Complaint' }, { label: 'Arrival' }, { label: 'Bay' },
          { label: 'Time in ED' }, { label: 'ER bill' }, { label: 'Status' }, { label: '', width: '260px' }],
      })}`,
  });
}

function triageStrip(c) {
  const rows = [['1', 'P1 Resuscitation', c.red, 'danger'], ['2', 'P2 Emergent', c.orange, 'danger'],
    ['3', 'P3 Urgent', c.yellow, 'warning'], ['4/5', 'P4–P5 Non-urgent', c.green, 'success']];
  const max = Math.max(1, ...rows.map((r) => r[2]));
  return `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    ${rows.map(([code, label, n, tone]) => `
      <div class="p-3 rounded-lg border border-outline-variant">
        <div class="flex items-center justify-between">
          <span class="pill-${tone} pill-dot">${label}</span>
          <span class="font-headline-lg text-headline-lg tnum">${n}</span></div>
        <div class="h-1.5 rounded-full bg-surface-container mt-2 overflow-hidden">
          <div class="h-full bg-${tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'success'}"
               style="width:${Math.round((n / max) * 100)}%"></div></div>
      </div>`).join('')}</div>`;
}

function rowHTML(r) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(r.case_no)}</div>
      ${r.mlc ? (r.mlc_no ? `<span class="pill-danger pill-dot">MLC ${esc(r.mlc_no)}</span>`
        : `<button type="button" class="pill-warning pill-dot" data-mlcno="${r.id}" title="Enter the police MLC number">MLC no. pending</button>`) : ''}</td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name || r.unknown_name || 'Unidentified')}</div>
      ${r.unknown_name && /^Unidentified/.test(r.patient_name || '') ? `<div class="text-body-sm text-on-surface-variant">${esc(r.unknown_name)}</div>` : ''}
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid || 'no UHID yet')}
        ${r.age_years ? ` · ${r.age_years}y ${esc((r.gender || '')[0] || '')}` : ''}${r.blood_group ? ` · ${esc(r.blood_group)}` : ''}</div></td>
    <td>${triagePill(r.triage)}</td>
    <td class="text-body-md max-w-[220px] truncate" title="${esc(r.complaint || '')}">${esc(r.complaint || '—')}</td>
    <td><div class="text-body-sm">${esc(r.arrival_mode || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(r.arrived_at)}</div></td>
    <td class="font-data-mono text-body-sm">${esc(r.bay || '—')}</td>
    <td class="font-data-mono ${r.wait_minutes > 240 ? 'text-warning font-semibold' : ''}">${mins(r.wait_minutes)}</td>
    <td class="num whitespace-nowrap">${r.bill_id ? `<div class="font-data-mono">${money(r.bill_total, 2)}</div>
      <div class="text-label-sm ${r.bill_balance > 0.005 ? 'text-danger' : 'text-success'}">${r.bill_balance > 0.005 ? `due ${money(r.bill_balance, 2)}` : 'paid'}</div>` : '<span class="text-on-surface-variant">—</span>'}</td>
    <td>${pill(r.status)}${r.admitted_to ? `<div class="text-label-sm text-on-surface-variant mt-0.5">${esc(r.admitted_to)}</div>` : ''}</td>
    <td class="text-right whitespace-nowrap">
      ${(!r.patient_id || r.temporary === 1) && can('emergency.triage') ? '<button class="btn-secondary btn-xs" data-act="link">Identify</button>' : ''}
      ${r.encounter_id && isOpen(r) && (can('vitals.record') || can('emergency.treat')) ? '<button class="btn-secondary btn-xs" data-act="vitals">Vitals</button>' : ''}
      ${r.encounter_id && isOpen(r) && can('order.create') ? '<button class="btn-secondary btn-xs" data-act="orders">Orders</button>' : ''}
      ${r.encounter_id && isOpen(r) && can('consult.write') ? '<button class="btn-secondary btn-xs" data-act="notes">Notes &amp; Rx</button>' : ''}
      ${r.encounter_id && isOpen(r) && (can('emergency.treat') || can('pharmacy.dispense')) ? '<button class="btn-secondary btn-xs" data-act="consumables">Consumables</button>' : ''}
      ${r.patient_id ? '<button class="btn-secondary btn-xs" data-act="charges">Charges</button>' : ''}
      ${r.bill_balance > 0.005 && can('payment.collect') ? '<button class="btn-primary btn-xs" data-act="collect">Collect</button>' : ''}
      ${isOpen(r) && r.patient_id && can('ipd.admit') ? '<button class="btn-secondary btn-xs" data-act="admit">Admit</button>' : ''}
      ${isOpen(r) && can('emergency.treat') ? '<button class="btn-secondary btn-xs" data-act="close">Discharge / refer</button>' : ''}
      ${isOpen(r) && can('emergency.treat') ? `<button class="btn-primary btn-xs" data-act="edit">Update</button>` : ''}
      ${r.patient_id ? `<button class="btn-ghost btn-xs" data-act="patient" title="Patient record">
        <span class="material-symbols-outlined text-[15px]">folder_shared</span></button>` : ''}
    </td>`;
}

const CLOSED = ['discharged', 'admitted', 'referred', 'lama', 'death'];
const isOpen = (r) => !CLOSED.includes(r.status);

/* ------------------------------------------------------------- ER billing */

/**
 * The case's ER bill: one tap adds a standard ER charge (basic charges,
 * trauma care, dressing, bandaging, suturing …), or type any other line.
 * Reception collects it; care is never held for it.
 */
async function erCharges(r, after) {
  let d;
  try { d = await api.get(`/ipd/emergency/${r.id}/bill`); } catch (e) { apiError(e); return; }
  const canEdit = can('emergency.treat') || can('emergency.triage') || can('billing.create');
  const paint = (root) => {
    const b = d.bill;
    root.querySelector('[data-lines]').innerHTML = b?.items?.length ? `<table class="tbl"><thead><tr><th>Charge</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${b.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${money(i.rate, 2)}</td><td class="num">${money(i.amount, 2)}</td>
        <td class="text-right">${canEdit && !(b.paid > 0.005) && i.amount > 0 ? `<button class="btn-ghost btn-xs" data-rm="${i.id}" title="Remove this line">Remove</button>` : ''}</td></tr>`).join('')}
      <tr class="font-semibold border-t-2 border-outline"><td colspan="3">Total · ${esc(b.bill_no)}</td><td class="num">${money(b.total, 2)}</td><td></td></tr>
      <tr><td colspan="3">Paid</td><td class="num">${money(b.paid, 2)}</td><td></td></tr>
      <tr class="${b.balance > 0.005 ? 'text-danger font-semibold' : 'text-success'}"><td colspan="3">${b.balance > 0.005 ? 'Due — collected at reception' : 'Settled'}</td><td class="num">${money(Math.max(0, b.balance), 2)}</td><td></td></tr></tbody></table>`
      : '<p class="p-4 text-center text-on-surface-variant">No ER charges yet. Tap a charge above to add it.</p>';
    const collect = root.parentElement.querySelector('[data-collect-er]');
    if (collect) collect.classList.toggle('hidden', !(b && b.balance > 0.005));
  };
  drawer({
    title: `ER charges — ${r.case_no}`, subtitle: `${esc(r.patient_name || r.unknown_name || '')} · ${esc(r.uhid || '')}`, width: 'max-w-2xl',
    body: `<div class="p-5 space-y-4">
      ${canEdit ? `<div><div class="field-label mb-1.5">Tap to add</div><div class="flex flex-wrap gap-1.5">${d.services.filter((s) => s.category === 'emergency').map((s) => `
        <button class="px-3 py-1.5 rounded-full border border-outline-variant text-body-md hover:bg-primary-fixed" data-add="${s.id}">${esc(s.name)} <span class="text-on-surface-variant tabular-nums">${money(s.price)}</span></button>`).join('')
        || '<span class="text-body-sm text-on-surface-variant">No emergency charges on the tariff yet — add them in Fees & Tariffs (category Emergency).</span>'}</div></div>
      <form data-custom class="grid grid-cols-[1fr_80px_110px_auto] gap-2 items-end">
        <div><label class="field-label">Other charge</label><input class="field" name="description" list="er-svc" placeholder="e.g. Plaster, procedure, consumables" required>
          <datalist id="er-svc">${d.services.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist></div>
        <div><label class="field-label">Qty</label><input class="field text-right" type="number" name="qty" value="1" min="1" step="1"></div>
        <div><label class="field-label">Rate ₹</label><input class="field text-right" type="number" name="rate" min="0" step="0.01" required></div>
        <button class="btn-secondary">Add</button></form>` : ''}
      <div class="card" data-lines></div>
      <p class="text-body-sm text-on-surface-variant">If the patient is admitted, this ER bill stays separate and must be cleared before discharge. Medicines given in ER are billed by the pharmacy.</p>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>${can('payment.collect') ? '<button class="btn-primary hidden" data-collect-er>Collect at reception</button>' : ''}`,
    onMount(root, close) {
      const body = root.querySelector('[data-drawer-body]');
      paint(body);
      const add = async (payload) => {
        try { d.bill = await api.post(`/ipd/emergency/${r.id}/charges`, payload); paint(body); after(); toast('Charge added', 'success'); }
        catch (e) { apiError(e, 'Charge not added'); }
      };
      body.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-add]');
        if (a) { add({ service_id: +a.dataset.add, qty: 1 }); return; }
        const rm = e.target.closest('[data-rm]');
        if (rm) {
          const reason = prompt('Why remove this charge?');
          if (!reason) return;
          try { d.bill = await api.del(`/ipd/emergency/${r.id}/charges/${rm.dataset.rm}?reason=${encodeURIComponent(reason)}`); paint(body); after(); }
          catch (err) { apiError(err); }
        }
      });
      const form = body.querySelector('[data-custom]');
      if (form) {
        form.description.addEventListener('change', () => { const s = d.services.find((x) => x.name === form.description.value); if (s) form.rate.value = s.price; });
        form.onsubmit = (e) => {
          e.preventDefault();
          const s = d.services.find((x) => x.name === form.description.value);
          add({ service_id: s?.id, description: form.description.value, qty: form.qty.value, rate: form.rate.value }).then(() => form.reset());
        };
      }
      root.querySelector('[data-collect-er]')?.addEventListener('click', async () => {
        const { collectBill } = await import('../collect.js');
        close(); collectBill(d.bill.id, after);
      });
    },
  });
}

/* --------------------------------------------------------- close / link */

function closeCase(r, after) {
  modal({
    title: `Close ${r.case_no}`, subtitle: `${esc(r.patient_name || r.unknown_name || '')} — to admit, use Admit and choose a ward or ICU bed`, size: 'sm',
    body: `<form data-cf class="space-y-3">
      <div class="grid grid-cols-2 gap-2">${[['discharged', 'Discharged home', 'home'], ['referred', 'Referred out', 'local_hospital'], ['lama', 'Left against advice', 'directions_walk'], ['death', 'Death', 'heart_broken']]
        .map(([v, l, i], n) => `<label class="flex items-center gap-2 rounded-lg border border-outline-variant p-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary-fixed">
          <input type="radio" name="outcome" value="${v}" ${n === 0 ? 'checked' : ''}><span class="material-symbols-outlined text-[18px]">${i}</span>${l}</label>`).join('')}</div>
      <div><label class="field-label">Note (required unless discharged home)</label><input class="field" name="note" placeholder="Referred to / reason / time of death"></div>
      ${r.bill_balance > 0.005 ? `<p class="text-body-md text-warning">ER bill due ${money(r.bill_balance, 2)} — reception collects it; closing the case does not wait for payment.</p>` : ''}
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Close case</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const f = root.querySelector('[data-cf]');
        busy(ev.currentTarget, true);
        try { await api.post(`/ipd/emergency/${r.id}/close`, { outcome: f.outcome.value, note: f.note.value }); close(); toast('Case closed', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

/**
 * Identify an unidentified arrival. Care has already started on a temporary record: either the patient is new
 * (fill their details into it), or they already have a UHID (everything moves onto it).
 */
function linkPatient(r, after) {
  let picked = null, mode = 'existing';
  modal({
    title: `Identify ${r.case_no}`, subtitle: esc(r.unknown_name || r.patient_name || 'Unidentified arrival'), size: 'md',
    body: `<div class="flex gap-2 mb-3"><button type="button" class="btn-secondary btn-sm" data-mode="existing">Has a UHID already</button>
        <button type="button" class="btn-secondary btn-sm" data-mode="new">New to this hospital</button></div>
      <div data-existing><div data-picker></div><p class="text-body-sm text-on-surface-variant mt-2">Vitals, orders, medicines and charges recorded so far move to this UHID.</p></div>
      <form data-new class="hidden grid grid-cols-2 gap-3">
        <div class="col-span-2"><label class="field-label">Full name *</label><input class="field" name="name"></div>
        <div><label class="field-label">Gender *</label><select class="field" name="gender"><option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div><label class="field-label">Age (years)</label><input class="field" type="number" name="age_years" min="0" max="120"></div>
        <div><label class="field-label">Mobile</label><input class="field" name="mobile"></div>
        <div><label class="field-label">Address</label><input class="field" name="address"></div>
        <div><label class="field-label">Attendant</label><input class="field" name="kin_name"></div>
        <div><label class="field-label">Attendant mobile</label><input class="field" name="kin_mobile"></div>
      </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save identity</button>`,
    onMount(root, close) {
      const setMode = (m) => { mode = m; root.querySelector('[data-existing]').classList.toggle('hidden', m !== 'existing'); root.querySelector('[data-new]').classList.toggle('hidden', m !== 'new');
        root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('!bg-primary-fixed', b.dataset.mode === m)); };
      root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
      setMode(r.temporary === 1 ? 'existing' : 'existing');
      if (r.temporary !== 1) root.querySelector('[data-mode="new"]').classList.add('hidden');
      patientPicker(root.querySelector('[data-picker]'), (p) => { picked = p; });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const b = ev.currentTarget;
        let body;
        if (mode === 'existing') { if (!picked) { toast('Pick the patient', 'warning'); return; } body = { patient_id: picked.id }; }
        else {
          const d = Object.fromEntries(new FormData(root.querySelector('[data-new]')));
          if (!d.name || !d.gender) { toast('Name and gender are needed', 'warning'); return; }
          body = { details: d };
        }
        busy(b, true);
        try { await api.post(`/ipd/emergency/${r.id}/link-patient`, body); close(); toast(mode === 'existing' ? 'Records moved to the patient\'s UHID' : 'Patient identified', 'success'); after(); }
        catch (e) { apiError(e); busy(b, false); }
      };
    },
  });
}

function newCase(after) {
  let picked = null;
  modal({
    title: 'Register an emergency arrival',
    subtitle: 'Triage first. An unidentified patient can be registered now and matched to a UHID later.',
    size: 'md',
    body: `<form data-ef class="space-y-3">
      <div><label class="field-label">Known patient</label><div data-picker></div>
        <p class="text-body-sm text-on-surface-variant mt-1">Leave blank for an unidentified arrival.</p></div>
      <div><label class="field-label">Description if unidentified</label>
        <input class="field" name="unknown_name" placeholder="e.g. Unknown male ~45y, brought by 108"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Triage category *</label><select class="field" name="triage" required>
          <option value="1">P1 — Resuscitation (immediate)</option>
          <option value="2">P2 — Emergent (10 min)</option>
          <option value="3" selected>P3 — Urgent (30 min)</option>
          <option value="4">P4 — Less urgent (60 min)</option>
          <option value="5">P5 — Non-urgent (120 min)</option></select></div>
        <div><label class="field-label">Arrival mode</label><select class="field" name="arrival_mode">
          ${['Ambulance (108)', 'Hospital ambulance', 'Walk-in', 'Private vehicle', 'Police escort', 'Referral']
            .map((m) => `<option>${m}</option>`).join('')}</select></div>
      </div>
      <div><label class="field-label">Presenting complaint *</label><input class="field" name="complaint" required></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Bay</label><select class="field" name="bay">
          ${['RESUS-1', 'RESUS-2', 'ACUTE-1', 'ACUTE-2', 'ACUTE-3', 'OBS-1', 'OBS-2', 'MINOR-1', 'MINOR-2']
            .map((b) => `<option>${b}</option>`).join('')}</select></div>
        <div><label class="field-label">Attending</label><select class="field" name="attending_id">
          ${doctorOptions(false).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
      </div>
      <div data-unknown-extra class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Gender (if unidentified)</label><select class="field" name="gender"><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div><label class="field-label">Approx. age</label><input class="field" type="number" name="age_years" min="0" max="120"></div>
      </div>
      <fieldset class="rounded-lg border border-outline-variant p-3"><legend class="px-1 field-label !mb-0">Triage vitals</legend>
        <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
          ${[['bp_sys', 'BP sys'], ['bp_dia', 'BP dia'], ['pulse', 'Pulse'], ['spo2', 'SpO₂ %'], ['resp_rate', 'RR'], ['gcs', 'GCS']].map(([n, l]) => `<div><label class="field-label">${l}</label><input class="field field-sm" type="number" step="any" name="${n}"></div>`).join('')}
        </div></fieldset>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Brought by</label><input class="field" name="brought_by" placeholder="name / 108 crew / police"></div>
        <div><label class="field-label">Their mobile</label><input class="field" name="brought_by_mobile"></div>
      </div>
      <label class="flex items-center gap-2 text-body-lg"><input type="checkbox" name="mlc"> Medico-legal case</label>
      <div class="hidden grid grid-cols-2 gap-3" data-mlc><div><label class="field-label">MLC number <span class="text-on-surface-variant normal-case">(can be added later)</span></label><input class="field" name="mlc_no"></div>
        <div><label class="field-label">Police station</label><input class="field" name="police_station"></div></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>
             <button class="btn-primary" data-save>Register & triage</button>`,
    onMount(root, close) {
      const form = root.querySelector('[data-ef]');
      patientPicker(root.querySelector('[data-picker]'), (p) => { picked = p; }, { placeholder: 'UHID, name or mobile (optional)' });
      form.mlc.addEventListener('change', () => root.querySelector('[data-mlc]').classList.toggle('hidden', !form.mlc.checked));
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Registering');
        try {
          const body = Object.fromEntries(new FormData(form));
          body.mlc = form.mlc.checked ? 1 : 0;
          if (picked) body.patient_id = picked.id;
          const c = await api.post('/ipd/emergency', body);
          close(); toast(`${c.case_no} triaged as P${c.triage}${picked ? '' : ' — temporary record created; identify the patient when known'}`, 'success'); after();
        } catch (e) { apiError(e, 'Could not register the arrival'); busy(actionButton, false); }
      };
    },
  });
}

function editCase(r, after) {
  modal({
    title: r.case_no, subtitle: `${esc(r.patient_name || r.unknown_name || 'Unidentified')} · in ED ${mins(r.wait_minutes)}`, size: 'md',
    body: `<form data-uf class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Triage</label><select class="field" name="triage">
          ${[1, 2, 3, 4, 5].map((t) => `<option value="${t}" ${String(t) === r.triage ? 'selected' : ''}>P${t}</option>`).join('')}</select></div>
        <div><label class="field-label">Bay</label><input class="field" name="bay" value="${esc(r.bay || '')}"></div>
      </div>
      <div><label class="field-label">Status</label><select class="field" name="status">
        ${[['triage', 'Triage'], ['in_treatment', 'In treatment'], ['observation', 'Under observation'],
           ['awaiting_admission', 'Awaiting admission']]
          .map(([v, l]) => `<option value="${v}" ${v === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="field-label">Complaint / working impression</label>
        <textarea class="field" rows="3" name="complaint">${esc(r.complaint || '')}</textarea></div>
      <div><label class="field-label">Disposition note</label><input class="field" name="disposition" value="${esc(r.disposition || '')}"></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>
      ${r.patient_id ? `<a class="btn-secondary" href="/patient/${r.patient_id}" data-close>Patient record</a>` : ''}
      <button class="btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.patch(`/ipd/emergency/${r.id}`, Object.fromEntries(new FormData(root.querySelector('[data-uf]'))));
          close(); toast('Emergency case updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
