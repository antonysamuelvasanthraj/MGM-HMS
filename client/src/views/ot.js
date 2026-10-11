/** Operation theatre suite — booking, pre-op checks, live status and recovery. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, patientPicker, doctorOptions,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, fmtDateTime, fmtTime,
  kpi, emptyState, todayISO, mins,
} from './_kit.js';

let f = { date: todayISO() };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/ipd/ot${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Cases listed', value: d.counts.total, icon: 'surgical', sub: `${d.counts.completed} completed` },
      { label: 'In theatre now', value: d.counts.in_theatre, icon: 'personal_injury', tone: d.counts.in_theatre ? 'info' : 'neutral', sub: 'Knife-to-skin recorded' },
      { label: 'Consent pending', value: d.counts.consent_pending, icon: 'assignment_late', tone: d.counts.consent_pending ? 'danger' : 'success', sub: 'Blocks the case' },
      { label: 'Theatres in use', value: new Set(d.rows.filter((r) => r.status === 'in_theatre').map((r) => r.theatre)).size, icon: 'meeting_room', tone: 'info', sub: `${d.theatres.length} listed ${f.date === todayISO() ? 'today' : 'on ' + fmtDate(f.date)}` },
    ].map(kpi).join('');
    $('[data-board]', root).innerHTML = board(d);
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'Nothing scheduled for this date.' });
    $('[data-count]', root).textContent = `${d.rows.length} case(s)`;
  }

  // after booking, show the day the case was listed for
  bind(root, 'click', '[data-new]', () => bookCase((day) => {
    if (day && day !== f.date) { f.date = day; const i = root.querySelector('[data-f="date"]'); if (i) i.value = day; }
    load();
  }));
  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    const row = cache.find((x) => x.id === id);
    if (b.dataset.act === 'status') {
      try {
        const r = await api.patch(`/ipd/ot/${id}`, { status: b.dataset.to });
        if (r.billed_to) toast(`Case completed — charges added to ${r.billed_to}`, 'success');
        else if (r.nothing_to_bill) toast('Case completed, but it has no charges — the surgery is not billed. Add them in Bills or on the IP bill.', 'warning', { timeout: 10000 });
        else toast('Theatre status updated', 'success');
        load();
      } catch (err) { apiError(err); }
    }
    if (b.dataset.act === 'checklist') openChecklist(row, load);
    if (b.dataset.act === 'consumables') { const { openConsumables } = await import('../consumables.js'); openConsumables({ source_type: 'ot', source_id: row.id, title: `${row.procedure} (${row.booking_no})`, location: 'OT' }, load); }
  });

  return live({ topics: ['ot', 'ipd'], events: ['ot.created', 'ot.updated'], load, interval: 45000 });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Operation theatre', 'surgical')} ${liveChip()}`,
    title: 'Operation Theatre Suite',
    subtitle: 'Request → booking → pre-operative checks and consent → procedure → recovery, with the linked charges following the case.',
    actions: can('ot.schedule') ? `<button class="btn-primary" data-new>
      <span class="material-symbols-outlined text-[18px]">add</span> Book a case</button>` : '',
    body: `
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'date', key: 'date', label: 'Theatre date', value: f.date, width: 'w-[150px]' }])}
      ${card({ title: 'Theatre board', body: `<div data-board></div>` })}
      ${tableCard({
        title: 'Case list', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '52vh',
        columns: [{ label: 'Time', width: '110px' }, { label: 'Patient' }, { label: 'Procedure' },
          { label: 'Surgeon / anaesthetist' }, { label: 'Theatre' }, { label: 'Consent' },
          { label: 'Status' }, { label: '', width: '210px' }],
      })}`,
  });
}

function board(d) {
  if (!d.rows.length) return emptyState('event_available', 'No cases listed', 'Book a case to see the theatre board.');
  const theatres = [...new Set(d.rows.map((r) => r.theatre))];
  return `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    ${theatres.map((t) => {
      const cases = d.rows.filter((r) => r.theatre === t).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      const live_ = cases.find((c) => c.status === 'in_theatre');
      return `<div class="rounded-lg border ${live_ ? 'border-primary/40 bg-primary-fixed/30' : 'border-outline-variant'} overflow-hidden">
        <div class="px-3 h-10 flex items-center justify-between border-b border-outline-variant bg-surface-container-low">
          <span class="font-title-md text-title-md">${esc(t)}</span>
          ${live_ ? '<span class="pill-brand pill-dot">In use</span>' : '<span class="pill-success pill-dot">Free</span>'}
        </div>
        <ul class="divide-y divide-outline-variant/70">
          ${cases.map((c) => `<li class="p-2.5 ${c.status === 'in_theatre' ? 'bg-white' : ''}">
            <div class="flex items-center justify-between gap-2">
              <span class="font-data-mono text-body-sm">${fmtTime(c.scheduled_at)}</span>${pill(c.status)}</div>
            <div class="font-label-lg text-label-lg mt-0.5 truncate">${esc(c.patient_name || '—')}</div>
            <div class="text-body-sm text-on-surface-variant truncate">${esc(c.procedure)}</div>
            <div class="text-label-sm text-on-surface-variant truncate">${esc(c.surgeon_name || '')}</div>
          </li>`).join('')}
        </ul></div>`;
    }).join('')}</div>`;
}

function rowHTML(r) {
  return `
    <td><div class="font-data-mono">${fmtTime(r.scheduled_at)}</div>
      <div class="text-label-sm text-on-surface-variant">${r.duration_min} min</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name || '—')}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid || '')}
        ${r.ip_no ? ` · ${esc(r.ip_no)}` : ''}${r.blood_group ? ` · ${esc(r.blood_group)}` : ''}</div></td>
    <td class="text-body-md">${esc(r.procedure)}
      <div class="text-label-sm text-on-surface-variant">${esc(r.anaesthesia || '')} anaesthesia</div></td>
    <td><div class="text-body-md">${esc(r.surgeon_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.anaesthetist_name || '')}</div></td>
    <td class="text-body-md">${esc(r.theatre)}</td>
    <td>${r.consent ? '<span class="pill-success pill-dot">Signed</span>' : '<span class="pill-danger pill-dot">Pending</span>'}</td>
    <td>${pill(r.status)}${r.billed_at ? '<div class="text-label-sm text-success mt-0.5">Billed</div>' : (JSON.parse(r.charges || '[]').length ? '' : '<div class="text-label-sm text-warning mt-0.5">No charges</div>')}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="checklist">Checklist</button>
      ${r.status !== 'cancelled' && (can('ot.schedule') || can('pharmacy.dispense')) ? '<button class="btn-secondary btn-xs" data-act="consumables">Consumables</button>' : ''}
      ${can('ot.schedule') ? nextAction(r) : ''}
    </td>`;
}

function nextAction(r) {
  const next = { booked: ['pre_op', 'Pre-op'], pre_op: ['in_theatre', 'Knife to skin'],
    in_theatre: ['recovery', 'To recovery'], recovery: ['completed', 'Complete'] }[r.status];
  return next ? `<button class="btn-primary btn-xs" data-act="status" data-to="${next[0]}">${next[1]}</button>` : '';
}

function openChecklist(r, after) {
  const c = r.checklist || {};
  const items = [['consent', 'Informed consent signed'], ['site_marked', 'Surgical site marked'],
    ['fasting', 'Fasting confirmed'], ['allergy', 'Allergies reviewed'], ['implants', 'Implants / prostheses available'],
    ['blood', 'Blood products arranged'], ['antibiotic', 'Prophylactic antibiotic given'], ['count', 'Instrument & swab count agreed']];
  modal({
    title: 'Pre-operative checklist',
    subtitle: `${esc(r.patient_name || '')} · ${esc(r.procedure)} · ${esc(r.theatre)}`,
    size: 'sm',
    body: `<form data-cl class="space-y-2">${items.map(([k, label]) => `
      <label class="flex items-center gap-2.5 p-2 rounded hover:bg-surface-container-low text-body-lg">
        <input type="checkbox" name="${k}" ${c[k] ? 'checked' : ''}> ${label}</label>`).join('')}
      <div class="pt-2"><label class="field-label">Notes</label>
        <textarea class="field" rows="2" name="notes">${esc(r.notes || '')}</textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save checklist</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const form = root.querySelector('[data-cl]');
          const checklist = {};
          items.forEach(([k]) => { checklist[k] = form[k].checked; });
          await api.patch(`/ipd/ot/${r.id}`, { checklist, consent: checklist.consent ? 1 : 0, notes: form.notes.value });
          close(); toast('Checklist saved', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

async function bookCase(after) {
  let picked = null;
  const visiting = await api.get('/visiting-doctors?active=1').catch(() => []);
  modal({
    title: 'Book a theatre case', size: 'md',
    body: `<form data-bf class="space-y-3">
      <div><label class="field-label">Patient *</label><div data-picker></div></div>
      <div><label class="field-label">Procedure *</label><input class="field" name="procedure" required list="ot-procs">
        <datalist id="ot-procs">${['Laparoscopic Cholecystectomy', 'Appendicectomy', 'LSCS', 'Normal Delivery',
          'Hernia Repair (Open Mesh)', 'Total Knee Replacement', 'ORIF', 'Tonsillectomy', 'D&C', 'Cataract Surgery']
          .map((p) => `<option value="${p}">`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Theatre *</label><select class="field" name="theatre" required>
          ${['OT-1 Major', 'OT-2 Major', 'OT-3 Minor', 'OT-4 Obstetric'].map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div><label class="field-label">Scheduled at *</label><input class="field" type="datetime-local" name="scheduled_at" required></div>
        <div><label class="field-label">Surgeon (staff)</label><select class="field" name="surgeon_id">
          <option value="">${visiting.length ? "— or a visiting surgeon below —" : "— choose —"}</option>${doctorOptions(false).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
        <div><label class="field-label">Anaesthetist</label><select class="field" name="anaesthetist_id">
          <option value="">—</option>${doctorOptions(false).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
        <div><label class="field-label">Anaesthesia</label><select class="field" name="anaesthesia">
          ${['General', 'Spinal', 'Regional Block', 'Local', 'Sedation'].map((a) => `<option>${a}</option>`).join('')}</select></div>
        <div><label class="field-label">Duration (min)</label><input class="field" type="number" name="duration_min" value="60"></div>
        ${visiting.length ? `<div><label class="field-label">Visiting surgeon</label><select class="field" name="visiting_surgeon_id"><option value="">—</option>${visiting.map((v) => `<option value="${v.id}">${esc(v.name)}${v.speciality ? ` · ${esc(v.speciality)}` : ''}</option>`).join('')}</select></div>
        <div><label class="field-label">Visiting anaesthetist</label><select class="field" name="visiting_anaesthetist_id"><option value="">—</option>${visiting.map((v) => `<option value="${v.id}">${esc(v.name)}${v.speciality ? ` · ${esc(v.speciality)}` : ''}</option>`).join('')}</select></div>
        <p class="col-span-2 text-label-sm text-on-surface-variant -mt-1">A visiting doctor's fee line (surgeon / anaesthetist fee below) is credited to them; their share is paid on what the bill collects.</p>` : ''}
      </div>
      <div><label class="field-label">Notes</label><textarea class="field" rows="2" name="notes"></textarea></div>
      <fieldset class="rounded-lg border border-outline-variant p-3"><legend class="px-1 field-label !mb-0">Charges — billed when the case is completed</legend>
        ${(() => { const svcs = (state.meta?.services || []).filter((s) => ['procedure', 'ot', 'surgery', 'anaesthesia'].includes(s.category) && s.price > 0);
          return svcs.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">${svcs.map((s) => `<label class="flex items-center gap-2 text-body-md"><input type="checkbox" data-svc="${s.id}"> <span class="flex-1">${esc(s.name)}</span><span class="font-data-mono text-body-sm">${money(s.price)}</span></label>`).join('')}</div>`
            : '<p class="text-body-sm text-warning mb-2">No surgery / OT / anaesthesia services are priced in Fees &amp; Tariffs yet — add them there, or enter the charges below.</p>'; })()}
        ${[1, 2, 3].map((i) => `<div class="grid grid-cols-[1fr_120px] gap-2 mb-1.5"><input class="field field-sm" data-cdesc="${i}" placeholder="${['Surgeon fee', 'Anaesthetist fee', 'OT charges / implant'][i - 1]}"><input class="field field-sm" type="number" min="0" data-camt="${i}" placeholder="₹"></div>`).join('')}
      </fieldset>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Book case</button>`,
    onMount(root, close) {
      patientPicker(root.querySelector('[data-picker]'), (p) => { picked = p; }, { autofocus: true });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-bf]');
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Booking');
        try {
          const b = Object.fromEntries(new FormData(form));
          b.scheduled_at = b.scheduled_at.replace('T', ' ');
          if (!b.surgeon_id && !b.visiting_surgeon_id) { toast('Choose the surgeon (staff or visiting)', 'warning'); busy(actionButton, false); return; }
          const roles = { 1: 'surgeon', 2: 'anaesthetist' };
          const charges = [...root.querySelectorAll('[data-svc]:checked')].map((x) => ({ service_id: +x.dataset.svc }))
            .concat([1, 2, 3].map((i) => ({ description: root.querySelector(`[data-cdesc="${i}"]`).value.trim(), rate: +root.querySelector(`[data-camt="${i}"]`).value || 0, ...(roles[i] ? { role: roles[i] } : {}) })).filter((x) => x.description && x.rate > 0));
          const c = await api.post('/ipd/ot', { patient_id: picked.id, ...b, charges });
          close(); toast(`${c.booking_no} booked in ${c.theatre}`, 'success'); after(String(c.scheduled_at || b.scheduled_at).slice(0, 10));
        } catch (e) { apiError(e, 'Could not book the case'); busy(actionButton, false); }
      };
    },
  });
}
