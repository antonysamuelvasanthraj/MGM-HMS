/** Appointments & doctor scheduling. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, doctorOptions, doctorSetupNotice, patientPicker, downloadCSV,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, fmtTime, fmtDateTime,
  kpi, todayISO, shiftDate, emptyState, confirmDialog,
} from './_kit.js';

let f = { date: todayISO(), doctor_id: '', status: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/appointments${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Booked', value: d.counts.total, icon: 'calendar_month', sub: fmtDate(d.date) },
      { label: 'Arrived', value: d.counts.arrived + d.counts.converted, icon: 'login', tone: 'success',
        sub: `${d.counts.converted} converted to visits` },
      { label: 'Yet to arrive', value: d.counts.booked + d.counts.confirmed, icon: 'schedule', tone: 'info', sub: 'Confirmed or pending' },
      { label: 'No shows', value: d.counts.no_show, icon: 'person_off', tone: d.counts.no_show ? 'warning' : 'success',
        sub: d.counts.total ? `${Math.round((d.counts.no_show / d.counts.total) * 100)}% of the day` : '—' },
    ].map(kpi).join('');
    $('[data-day]', root).innerHTML = dayGrid(d);
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No appointments for this date.' });
    $('[data-count]', root).textContent = `${d.rows.length} appointment(s)`;
  }

  bind(root, 'click', '[data-new]', () => bookAppt(load));
  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    const a = cache.find((x) => x.id === id);
    if (b.dataset.act === 'reschedule') { rescheduleAppt(a, load); return; }
    if (b.dataset.act === 'arrived') { await api.patch(`/appointments/${id}`, { status: 'arrived' }); toast('Marked arrived', 'success'); load(); }
    if (b.dataset.act === 'noshow') { await api.patch(`/appointments/${id}`, { status: 'no_show' }); toast('Marked no-show', 'success'); load(); }
    if (b.dataset.act === 'register') navigate(`/op-registration?patient=${a.patient_id || ''}&appointment=${id}`);
    if (b.dataset.act === 'cancel') { await api.patch(`/appointments/${id}`, { status: 'cancelled' }); toast('Appointment cancelled', 'success'); load(); }
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`appointments-${f.date}.csv`, cache.map((a) => ({
    appt: a.appt_no, slot: a.slot_start, patient: a.patient_name, uhid: a.uhid, mobile: a.mobile,
    doctor: a.doctor_name, channel: a.channel, visit_type: a.visit_type, status: a.status,
  }))));

  return live({ topics: ['appointments', 'queue'], events: ['appointment.created', 'appointment.updated', 'encounter.created'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Scheduling', 'calendar_month')} ${liveChip()}`,
    title: 'Appointments & Doctor Scheduling',
    subtitle: 'Booked slots against the doctor’s clinic hours, and one click from arrival to a registered visit.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('appt.create') ? `<button class="btn-primary" data-new ${doctorOptions(false).length ? '' : 'disabled'}><span class="material-symbols-outlined text-[18px]">add</span> Book an appointment</button>` : ''}`,
    body: `
      ${doctorSetupNotice()}
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' },
        { type: 'select', key: 'doctor_id', label: 'Doctor', value: f.doctor_id, options: doctorOptions() },
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: '', label: 'All' }, { value: 'booked', label: 'Booked' }, { value: 'confirmed', label: 'Confirmed' },
          { value: 'arrived', label: 'Arrived' }, { value: 'converted', label: 'Registered' },
          { value: 'no_show', label: 'No show' }, { value: 'cancelled', label: 'Cancelled' }] },
      ])}
      ${card({ title: 'Clinic sessions today', body: `<div data-day></div>` })}
      ${tableCard({
        title: 'Appointments', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '54vh',
        columns: [{ label: 'Slot', width: '100px' }, { label: 'Patient' }, { label: 'Doctor' },
          { label: 'Channel' }, { label: 'Visit' }, { label: 'Status' }, { label: '', width: '200px' }],
      })}`,
  });
}

function dayGrid(d) {
  if (!d.slots.length) return emptyState('event_busy', 'No clinic sessions configured for this weekday', doctorOptions(false).length ? 'You can still book an appointment by choosing a doctor and a time.' : 'Clinic schedules will appear after doctors are configured.');
  const byDoctor = {};
  d.slots.forEach((s) => { (byDoctor[s.doctor_name] ??= []).push(s); });
  return `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
    ${Object.entries(byDoctor).map(([doc, sessions]) => {
      const booked = d.rows.filter((r) => r.doctor_name === doc);
      const cap = sessions.reduce((s, x) => s + x.max_tokens, 0);
      return `<div class="p-3 rounded-lg border border-outline-variant">
        <div class="flex items-center justify-between gap-2">
          <span class="font-title-md text-title-md truncate">${esc(doc)}</span>
          <span class="font-data-mono text-body-sm ${booked.length >= cap ? 'text-danger font-bold' : 'text-on-surface-variant'}">${booked.length}/${cap}</span></div>
        <div class="text-body-sm text-on-surface-variant mt-0.5">
          ${sessions.map((s) => `${s.start_time}–${s.end_time} · ${esc(s.room || '')}`).join(' | ')}</div>
        <div class="h-1.5 rounded-full bg-surface-container mt-2 overflow-hidden">
          <div class="h-full ${booked.length >= cap ? 'bg-danger' : 'bg-primary'}"
               style="width:${Math.min(100, Math.round((booked.length / Math.max(1, cap)) * 100))}%"></div></div>
      </div>`;
    }).join('')}</div>`;
}

function rowHTML(a) {
  return `
    <td class="font-data-mono">${fmtTime(a.slot_start)}
      <div class="text-label-sm text-on-surface-variant">${a.slot_minutes} min</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(a.patient_name || '—')}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(a.uhid || 'new patient')} · ${esc(a.mobile || '')}</div></td>
    <td><div class="text-body-md">${esc(a.doctor_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(a.dept_name || '')}</div></td>
    <td><span class="pill-neutral capitalize">${esc(a.channel)}</span></td>
    <td>${a.visit_type === 'followup' ? '<span class="pill-info">Follow-up</span>' : '<span class="pill-neutral">New</span>'}</td>
    <td>${pill(a.status)}</td>
    <td class="text-right whitespace-nowrap">
      ${['booked','confirmed','arrived'].includes(a.status) && can('appt.edit') ? '<button class="btn-secondary btn-xs" data-act="reschedule">Reschedule</button>' : ''}
      ${['booked', 'confirmed'].includes(a.status) ? `<button class="btn-secondary btn-xs" data-act="arrived">Arrived</button>
        <button class="btn-ghost btn-xs" data-act="noshow">No show</button>` : ''}
      ${['arrived', 'confirmed', 'booked'].includes(a.status) && can('op.register')
        ? `<button class="btn-primary btn-xs" data-act="register">Register</button>` : ''}
      ${a.status === 'converted' && a.encounter_id ? `<a class="btn-secondary btn-xs" href="/visit/${a.encounter_id}">Visit</a>` : ''}
    </td>`;
}

function rescheduleAppt(a,after) {
  modal({title:'Reschedule appointment',subtitle:`${a.patient_name || ''} · ${a.appt_no}`,size:'md',body:`<form data-reschedule-form class="space-y-3">
    <div><label class="field-label">Doctor</label><select class="field" name="doctor_id">${doctorOptions(false).map(d=>`<option value="${d.value}" ${String(d.value)===String(a.doctor_id)?'selected':''}>${esc(d.label)}</option>`).join('')}</select></div>
    <div><label class="field-label">New slot</label><input class="field" type="datetime-local" name="slot_start" value="${esc(a.slot_start.replace(' ','T').slice(0,16))}" required></div>
    <div><label class="field-label">Slot minutes</label><input class="field" type="number" name="slot_minutes" value="${a.slot_minutes||15}" min="5" max="120" required></div>
    <div><label class="field-label">Reason / notes</label><textarea class="field" name="notes" required></textarea></div></form>`,footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-reschedule>Save new slot</button>',onMount(root,close){root.querySelector('[data-save-reschedule]').onclick=async ev=>{
      const form=root.querySelector('[data-reschedule-form]');if(!form.reportValidity())return;busy(ev.currentTarget,true);
      try {await api.patch(`/appointments/${a.id}`,Object.fromEntries(new FormData(form)));close();toast('Appointment rescheduled','success');after();}catch(e){apiError(e,'Could not reschedule');busy(ev.currentTarget,false);}
    };}});
}

function bookAppt(after) {
  if (!doctorOptions(false).length) { toast('Add an active doctor in staff setup before booking an appointment.', 'warning'); return; }
  let picked = null;
  modal({
    title: 'Book an appointment', size: 'md',
    body: `<form data-af class="space-y-3">
      <div><label class="field-label">Existing patient</label><div data-picker></div>
        <p class="text-body-sm text-on-surface-variant mt-1">Leave blank and type the name below for a first-time caller.</p></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Name</label><input class="field" name="patient_name"></div>
        <div><label class="field-label">Mobile</label><input class="field" name="mobile"></div>
        <div><label class="field-label">Doctor *</label><select class="field" name="doctor_id" required>
          ${doctorOptions(false).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
        <div><label class="field-label">Slot *</label><input class="field" type="datetime-local" name="slot_start" required></div>
        <div><label class="field-label">Channel</label><select class="field" name="channel">
          <option value="phone">Phone</option><option value="online">Online</option>
          <option value="walkin">Walk-in</option><option value="referral">Referral</option></select></div>
        <div><label class="field-label">Visit type</label><select class="field" name="visit_type">
          <option value="new">New consultation</option><option value="followup">Follow-up</option></select></div>
      </div>
      <div><label class="field-label">Notes</label><input class="field" name="notes"></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Book</button>`,
    onMount(root, close) {
      const form = root.querySelector('[data-af]');
      patientPicker(root.querySelector('[data-picker]'), (p) => {
        picked = p; form.patient_name.value = p.name; form.mobile.value = p.mobile || '';
      }, { autofocus: true });
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Booking');
        try {
          const b = Object.fromEntries(new FormData(form));
          b.slot_start = b.slot_start.replace('T', ' ');
          if (picked) b.patient_id = picked.id;
          let a;
          try { a = await api.post('/appointments', b); }
          catch (err) {
            if (err?.payload?.error !== 'slot_taken') throw err;
            const ok = await confirmDialog({ title: 'That slot is already booked', message: `${esc(err.payload.patient || 'Another patient')} (${esc(err.payload.appt_no || '')}) has this doctor at this time. Book anyway as an extra patient?`, confirmLabel: 'Overbook this slot' });
            if (!ok) { busy(actionButton, false); return; }
            a = await api.post('/appointments', { ...b, overbook: true });
          }
          close(); toast(`${a.appt_no} booked for ${fmtDateTime(a.slot_start)}`, 'success'); after();
        } catch (e) { apiError(e, 'Could not book the appointment'); busy(actionButton, false); }
      };
    },
  });
}
