/**
 * Staff roster & duty attendance. Every login sees every department — who is on duty today, where,
 * who has come in — so desks can coordinate. Editing is scoped: HR and administrators roster everyone,
 * the Medical Superintendent the clinical and support staff, an in-charge their own team; everyone
 * else is view-only and punches their own attendance.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, downloadCSV,
  $, $$, esc, bind, toast, modal, renderRows, pill, fmtDate, fmtDateTime, fmtTime,
  kpi, todayISO, shiftDate, titleCase, emptyState,
} from './_kit.js';

let f = { department_id: '', from: todayISO(), to: shiftDate(todayISO(), 6) };
let data = { rows: [], attendance: [], summary: {} };
let tab = 'today';

const SHIFTS = { morning: ['bg-info-bg text-info', 'M'], evening: ['bg-warning-bg text-warning', 'E'],
  night: ['bg-neutral-bg text-neutral', 'N'], general: ['bg-success-bg text-success', 'G'],
  off: ['bg-surface-container text-on-surface-variant', '—'], leave: ['bg-danger-bg text-danger', 'L'],
  od: ['bg-primary-fixed text-primary', 'OD'] };
const SHIFT_LABEL = { morning: 'Morning', evening: 'Evening', night: 'Night', general: 'General (full day)', off: 'Weekly off', leave: 'Leave', od: 'Outside duty (hospital work elsewhere)' };
/** How the day went — marked by punching, or by HR / admin by hand. */
const DAY = { present: ['success', 'Present (full day)', 'P'], half: ['warning', 'Half day', '½'], late: ['warning', 'Late', 'Lt'],
  absent: ['danger', 'Absent', 'A'], leave: ['neutral', 'On leave', 'Lv'], od: ['info', 'Outside duty', 'OD'] };

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    data = await api.get(`/admin/roster${qs(f)}`);
    const s = data.summary;
    // the heading, department list and editing follow what this login may see
    const h = root.querySelector('h1'); if (h) h.textContent = 'Roster & Attendance — all departments';
    const sub = root.querySelector('h1 + p'); if (sub) sub.textContent = {
      all: 'Everyone can see who is on duty in every department. You can roster and mark attendance for all staff.',
      team: 'Everyone can see who is on duty in every department. You roster and mark attendance for your own team (highlighted); other departments are view-only.',
      self: 'See who is on duty in every department to coordinate. Rosters are set by your in-charge, HR or the Medical Superintendent — punch in when you arrive and out when you leave.' }[data.scope] || '';
    const sel = root.querySelector('[data-f="department_id"]');
    if (sel) {
      sel.innerHTML = '<option value="">All departments</option>' + (data.departments || []).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
      sel.value = f.department_id;
    }
    root.querySelector('[data-att-report]')?.classList.toggle('hidden', !can('reports.attendance'));
    $('[data-kpis]', root).innerHTML = [
      { label: 'On duty today', value: s.on_duty, icon: 'badge', sub: `of ${s.staff} staff${f.department_id ? ' in this department' : ''}` },
      { label: 'In right now', value: s.in_now, icon: 'how_to_reg', tone: 'success', sub: `${s.present} present today · ${s.late} late` },
      { label: 'Absent / on leave', value: `${s.absent} / ${s.leave}`, icon: 'person_off', tone: s.absent ? 'danger' : 'neutral', sub: 'Marked today' },
      { label: 'Attendance rate', value: s.on_duty ? `${Math.round((s.present / s.on_duty) * 100)}%` : '—',
        icon: 'percent', tone: 'info', sub: 'Present against rostered' },
    ].map(kpi).join('');
    paint(root);
  }

  bind(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; paint(root); });
  bind(root, 'click', '[data-punch]', async (e, b) => {
    busy(b, true);
    try { const r = await api.post('/admin/attendance/punch', {}); toast(r.out_at ? 'Punched out' : 'Punched in', 'success'); load(); }
    catch (err) { apiError(err); } finally { busy(b, false); }
  });
  bind(root, 'click', '[data-cell]', (e, b) => {
    if (!(data.editable_ids || []).includes(+b.dataset.user)) return;   // only staff this login may roster
    const day = (data.attendance || []).find((a) => String(a.user_id) === String(b.dataset.user) && a.duty_date === b.dataset.date);
    const person = (data.staff || []).find((u) => String(u.id) === String(b.dataset.user));
    const unit = (data.rows || []).find((r) => String(r.user_id) === String(b.dataset.user) && r.duty_date === b.dataset.date)?.unit;
    editShift(b.dataset.user, b.dataset.date, b.dataset.shift, load, (data.units_by_user || {})[b.dataset.user] || [], { day, person, unit, canMark: true });   // editable here = HR / admin or this person's in-charge
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`${tab}-${f.from}-to-${f.to}.csv`,
    tab === 'today' ? data.today : tab === 'roster' ? data.rows : data.attendance));
  bind(root, 'click', '[data-att-report]', () => navigate('/reports?group=' + encodeURIComponent('Staff & HR')));

  return live({ topics: ['admin'], events: ['roster.saved', 'attendance.punch'], load });
}

function layout() {
  return page({
    wide: true,
    eyebrow: `${eyebrow('Workforce', 'badge')} ${liveChip()}`,
    title: 'Roster & Attendance',
    subtitle: 'Duty roster by shift and the attendance record against it.',
    actions: `<button class="btn-secondary hidden" data-att-report><span class="material-symbols-outlined text-[18px]">summarize</span> Attendance reports</button>
      <button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <button class="btn-primary" data-punch><span class="material-symbols-outlined text-[18px]">fingerprint</span> Punch in / out</button>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'select', key: 'department_id', label: 'Department', value: f.department_id, options: [{ value: '', label: 'All departments' }] },
        { type: 'date', key: 'from', label: 'From', value: f.from, width: 'w-[150px]' },
        { type: 'date', key: 'to', label: 'To', value: f.to, width: 'w-[150px]' },
      ])}
      <div class="card">
        <nav class="flex items-center gap-1 px-2 border-b border-outline-variant">
          ${[['today', 'On duty today'], ['roster', 'Duty roster'], ['attendance', 'Attendance register']].map(([k, l]) => `
            <button data-tab="${k}" class="h-11 px-3 font-label-lg text-label-lg border-b-2
              ${tab === k ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">${l}</button>`).join('')}
        </nav>
        <div class="overflow-auto" style="max-height:62vh" data-panel></div>
      </div>`,
  });
}

function paint(root) {
  $$('[data-tab]', root).forEach((b) => {
    const on = b.dataset.tab === tab;
    b.className = b.className.replace(/border-primary text-primary|border-transparent text-on-surface-variant hover:text-on-surface/,
      on ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface');
  });
  const panel = $('[data-panel]', root);

  if (tab === 'today') {
    // who is on duty in each department right now — for every login, read-only
    const groups = {};
    for (const p of data.today || []) (groups[p.dept_name] ??= []).push(p);
    const state_ = (p) => p.status === 'absent' ? pill('rejected', 'Absent')
      : p.status === 'leave' || p.shift === 'leave' ? pill('neutral', 'On leave')
      : p.status === 'od' || p.shift === 'od' ? pill('info', 'Outside duty')
      : p.in_at && !p.out_at ? pill('verified', `In since ${fmtTime(p.in_at)}`)
      : p.in_at && p.out_at ? pill('neutral', `Left ${fmtTime(p.out_at)}`)
      : p.status === 'present' || p.status === 'late' || p.status === 'half' ? pill('verified', DAY[p.status][1])
      : p.shift && p.shift !== 'off' ? pill('pending', 'Not in yet') : '<span class="text-body-sm text-on-surface-variant">Off today</span>';
    const mine = new Set(data.my_team_ids || []);
    panel.innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([dept, people]) => {
      const on = people.filter((p) => p.shift && !['off', 'leave'].includes(p.shift)).length;
      const inNow = people.filter((p) => p.in_at && !p.out_at).length;
      return `<div class="border-b border-outline-variant">
        <div class="flex items-center justify-between px-4 py-2 bg-surface-container-low"><span class="font-label-lg text-label-lg">${esc(dept)}</span>
          <span class="text-body-sm text-on-surface-variant">${on} rostered · ${inNow} in now · ${people.length} staff</span></div>
        <table class="tbl"><tbody>${people.map((p) => `<tr class="${mine.has(p.id) ? 'bg-info-bg' : ''}">
          <td style="width:32%"><div class="font-label-lg text-label-lg">${esc(p.name)}</div><div class="text-label-sm text-on-surface-variant">${esc(p.designation || titleCase(p.role))}</div></td>
          <td style="width:26%">${p.shift ? `<span class="inline-flex items-center gap-1.5"><span class="w-6 h-5 rounded grid place-items-center font-label-sm ${(SHIFTS[p.shift] || SHIFTS.off)[0]}">${(SHIFTS[p.shift] || SHIFTS.off)[1]}</span>${esc(SHIFT_LABEL[p.shift] || p.shift)}</span>` : '<span class="text-body-sm text-on-surface-variant">Not rostered</span>'}
            ${p.unit ? `<div class="text-label-sm text-on-surface-variant">${esc(p.unit)}</div>` : ''}</td>
          <td>${state_(p)}${p.note ? `<div class="text-label-sm text-on-surface-variant mt-0.5">${esc(p.note)}</div>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
    }).join('') : `<div class="p-4">${emptyState('badge', 'No staff', '')}</div>`;
    return;
  }

  if (tab === 'roster') {
    const dates = [];
    for (let date = f.from; date <= f.to && dates.length < 31; date = shiftDate(date, 1)) dates.push(date);
    const byUser = {};
    (data.staff || []).filter(u => !f.department_id || String(u.department_id) === String(f.department_id)).forEach(u => { byUser[u.id] = {name: u.name, role: u.role, dept: u.dept_name, cells: {}}; });
    data.rows.filter(r => byUser[r.user_id]).forEach((r) => { (byUser[r.user_id] ??= { name: r.name, role: r.role, dept: r.dept_name, cells: {} }).cells[r.duty_date] = r; });
    const users = Object.entries(byUser);
    panel.innerHTML = users.length ? `<table class="tbl">
      <thead><tr><th style="min-width:200px">Staff</th>
        ${dates.map((d) => `<th class="text-center">${fmtDate(d).slice(0, 6)}</th>`).join('')}</tr></thead>
      <tbody>${users.map(([uid, u]) => `<tr>
        <td><div class="font-label-lg text-label-lg">${esc(u.name)}</div>
          <div class="text-label-sm text-on-surface-variant capitalize">${esc(u.role)}${u.dept ? ` · ${esc(u.dept)}` : ''}</div></td>
        ${dates.map((d) => {
          const c = u.cells[d];
          const [cls, letter] = SHIFTS[c?.shift] || SHIFTS.off;
          const editable = (data.editable_ids || []).includes(+uid);
          const day = (data.attendance || []).find((a) => String(a.user_id) === String(uid) && a.duty_date === d);
          const mark = day ? DAY[day.status] : null;
          return `<td class="text-center"><button class="w-9 h-8 rounded font-label-md ${cls} ${editable ? 'hover:ring-1 hover:ring-primary' : 'cursor-default'}"
            data-cell data-user="${uid}" data-date="${d}" data-shift="${c?.shift || 'off'}" ${editable ? '' : 'aria-disabled="true"'}
            title="${esc(SHIFT_LABEL[c?.shift || 'off'])}${c?.unit ? ` · ${esc(c.unit)}` : ''}${mark ? ` · ${esc(mark[1])}${day.note ? ` — ${esc(day.note)}` : ''}` : ''}${editable ? '' : ' (view only)'}">${letter}</button>
            ${mark ? `<div class="mt-0.5"><span class="pill-${mark[0]} !px-1.5 !py-0 text-[10px]">${mark[2]}</span></div>` : ''}</td>`;
        }).join('')}
      </tr>`).join('')}</tbody></table>
      <div class="p-3 flex flex-wrap gap-3 text-body-sm border-t border-outline-variant">
        ${Object.entries(SHIFTS).map(([k, [cls, l]]) => `<span class="flex items-center gap-1.5">
          <span class="w-6 h-5 rounded grid place-items-center font-label-sm ${cls}">${l}</span>${SHIFT_LABEL[k]}</span>`).join('')}
        <span class="text-on-surface-variant">· Day:</span>${Object.values(DAY).map(([t, l, x]) => `<span class="flex items-center gap-1"><span class="pill-${t} !px-1.5 !py-0 text-[10px]">${x}</span>${l}</span>`).join('')}</div>`
      : `<div class="p-4">${emptyState('badge', 'No roster in this window', '')}</div>`;
  } else {
    panel.innerHTML = `<table class="tbl">
      <thead><tr><th>Date</th><th>Staff</th><th>Department</th><th>In</th><th>Out</th>
        <th class="text-right">Hours</th><th>Status</th><th>Remark</th></tr></thead>
      <tbody>${data.attendance.map((a) => `<tr>
        <td class="text-body-sm">${fmtDate(a.duty_date)}</td>
        <td class="font-label-lg text-label-lg">${esc(a.name)}</td>
        <td class="text-body-md">${esc(a.dept_name || titleCase(a.role))}</td>
        <td class="font-data-mono text-body-sm">${a.in_at ? fmtTime(a.in_at) : '—'}</td>
        <td class="font-data-mono text-body-sm">${a.out_at ? fmtTime(a.out_at) : '—'}</td>
        <td class="num">${a.hours ? a.hours.toFixed(1) : '—'}</td>
        <td>${DAY[a.status] ? `<span class="pill-${DAY[a.status][0]} pill-dot">${DAY[a.status][1]}</span>` : `<span class="pill-neutral">${esc(a.status)}</span>`}</td>
        <td class="text-body-sm">${esc(a.note || '')}${a.marked_by ? ' <span class="text-on-surface-variant">(marked by hand)</span>' : ''}</td>
      </tr>`).join('') || `<tr><td colspan="8" class="py-10 text-center text-on-surface-variant">No attendance recorded.</td></tr>`}
      </tbody></table>`;
  }
}

function editShift(userId, date, current, after, units, { day = null, person = null, unit = null, canMark = false } = {}) {
  const markable = canMark && date <= todayISO();
  modal({
    title: person ? `${person.name}` : 'Set the shift', subtitle: `${fmtDate(date)}${person ? ` · ${esc(titleCase(person.role))}${person.dept_name ? ` · ${esc(person.dept_name)}` : ''}` : ''}`, size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Shift</label><select class="field" data-s>
        ${Object.keys(SHIFTS).map((k) => `<option value="${k}" ${k === current ? 'selected' : ''}>${SHIFT_LABEL[k]}</option>`).join('')}</select></div>
      <div data-unit-wrap><label class="field-label">Unit <span class="normal-case tracking-normal text-on-surface-variant">(this person's department only)</span></label><select class="field" data-u>
        ${(units || []).map((u) => `<option ${u === unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      ${markable ? `<div class="pt-3 border-t border-outline-variant">
        <label class="field-label">Mark the day</label>
        <select class="field" data-st>
          <option value="">${day ? 'Keep as recorded' : 'Not marked'}</option>
          ${Object.entries(DAY).map(([k, [, l]]) => `<option value="${k}" ${day?.status === k ? 'selected' : ''}>${l}</option>`).join('')}
          ${day && !day.in_at ? '<option value="clear">Clear the mark</option>' : ''}</select>
        <input class="field mt-2" data-note placeholder="Remark — required for half day, leave and outside duty (e.g. medical camp at Medchal)" value="${esc(day?.note || '')}">
        ${day?.in_at ? `<p class="text-body-sm text-on-surface-variant mt-1">Punched in ${fmtTime(day.in_at)}${day.out_at ? `, out ${fmtTime(day.out_at)}` : ''} — punch times are kept.</p>` : ''}
      </div>` : ''}
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save</button>`,
    onMount(root, close) {
      const s = root.querySelector('[data-s]'), wrap = root.querySelector('[data-unit-wrap]');
      const toggle = () => wrap.classList.toggle('hidden', ['off', 'leave'].includes(s.value));
      s.addEventListener('change', toggle); toggle();
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const shift = s.value;
          await api.post('/admin/roster', { user_id: +userId, duty_date: date, shift, unit: ['off', 'leave'].includes(shift) ? null : root.querySelector('[data-u]').value });
          const st = root.querySelector('[data-st]')?.value;
          if (st) await api.post('/admin/attendance/mark', { user_id: +userId, duty_date: date, status: st, note: root.querySelector('[data-note]').value });
          close(); toast(st ? 'Shift and attendance saved' : 'Roster updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
