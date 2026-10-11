/**
 * Visit Tracking — the reception board.
 *
 * Every visit for the day with its four independent states side by side:
 * stage, payment, diagnostics and dues. "Consulted" never implies "paid".
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  doctorOptions, deptOptions, api, qs, state, can, navigate, downloadCSV,
  $, $$, esc, bind, toast, renderRows, pill, priorityPill, money, fmtTime, todayISO, ago, kpi, mins,
} from './_kit.js';
import { openCollect } from './op-registration.js';
import { openVitals } from './vitals-queue.js';

let f = { date: todayISO(), doctor_id: '', department_id: '', stage: '', payment_status: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const { rows, counts } = await api.get(`/queue${qs(f)}`);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Visits today', value: counts.total, icon: 'timeline', sub: `${counts.closed} completed` },
      { label: 'In the building', value: counts.total - counts.closed, icon: 'groups', tone: 'info',
        sub: `${counts.vitals} vitals · ${counts.ready} ready · ${counts.in_consult} in room` },
      { label: 'Money outstanding', value: money(counts.due_amount), icon: 'payments',
        tone: counts.due_amount ? 'warning' : 'success', sub: `${counts.payment_pending} visit(s) unpaid` },
      { label: 'Services open', value: rows.reduce((s, r) => s + (r.orders_open || 0), 0), icon: 'science', tone: 'info',
        sub: 'Lab / imaging still running' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No visits match these filters.' });
    $('[data-count]', root).textContent = `${rows.length} visit(s)`;
    paintFunnel(root, counts);
  }

  bind(root, 'click', '[data-act]', (e, b) => {
    const id = b.closest('tr').dataset.id;
    if (b.dataset.act === 'open') navigate(`/visit/${id}`);
    if (b.dataset.act === 'collect') openCollect(id, load);
    if (b.dataset.act === 'vitals') openVitals(id, load);
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`visits-${f.date}.csv`, cache.map((r) => ({
    token: r.token_no, uhid: r.uhid, patient: r.patient_name, age: r.age_years, gender: r.gender,
    doctor: r.doctor_name, department: r.dept_name, visit_type: r.visit_type,
    stage: r.stage, payment: r.payment_status, due: r.due, orders_open: r.orders_open,
    registered: r.opened_at, consulted: r.consult_end,
  }))));

  return live({
    topics: ['queue', 'opd', 'billing', 'clinical'],
    events: ['encounter.created', 'encounter.stage', 'encounter.updated', 'vitals.recorded',
      'payment.received', 'consultation.saved', 'orders.created', 'order.updated'],
    load,
  });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Reception board', 'timeline')} ${liveChip()}`,
    title: 'Visit Tracking',
    subtitle: 'One row per visit, four independent states. A completed consultation does not mean the reports are ready or the bill is settled.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export day</button>
      <a href="/op-registration" class="btn-primary"><span class="material-symbols-outlined text-[18px]">how_to_reg</span> New registration</a>`,
    body: `
      ${kpiRow([], 4)}
      ${card({ title: 'Movement through the day', body: `<div data-funnel></div>` })}
      ${filterBar([
        { type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' },
        { type: 'select', key: 'doctor_id', label: 'Doctor', options: doctorOptions(), value: f.doctor_id },
        { type: 'select', key: 'department_id', label: 'Department', options: deptOptions(), value: f.department_id },
        { type: 'select', key: 'stage', label: 'Stage', value: f.stage, options: [
          { value: '', label: 'Any stage' }, { value: 'registered', label: 'Registered' },
          { value: 'vitals_done', label: 'Vitals done' }, { value: 'ready', label: 'Ready' },
          { value: 'in_consult', label: 'In consultation' }, { value: 'consulted', label: 'Consulted' },
          { value: 'services_pending', label: 'Services pending' }, { value: 'closed', label: 'Closed' }] },
        { type: 'select', key: 'payment_status', label: 'Payment', value: f.payment_status, options: [
          { value: '', label: 'Any payment' }, { value: 'pending', label: 'Pending' },
          { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Part paid' }, { value: 'free', label: 'Approved free' }] },
      ])}
      ${tableCard({
        title: 'Visits', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '60vh',
        columns: [{ label: 'Token', width: '66px' }, { label: 'Patient' }, { label: 'Doctor / Dept' },
          { label: 'Visit stage' }, { label: 'Payment' }, { label: 'Diagnostics' },
          { label: 'Due', cls: 'text-right' }, { label: 'In / out' }, { label: '', width: '130px' }],
      })}`,
  });
}

function paintFunnel(root, c) {
  const steps = [
    ['Registered', c.total, 'how_to_reg'],
    ['Vitals', c.total - c.vitals, 'monitor_heart'],
    ['Ready', c.ready + c.in_consult + c.consulted + c.closed, 'hourglass_top'],
    ['Consulted', c.consulted + c.closed, 'stethoscope'],
    ['Closed', c.closed, 'done_all'],
  ];
  const max = Math.max(1, ...steps.map((s) => s[1]));
  $('[data-funnel]', root).innerHTML = `<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
    ${steps.map(([label, n, icon], i) => `
      <div class="relative">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[17px] text-on-surface-variant">${icon}</span>
          <span class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">${label}</span>
        </div>
        <div class="font-headline-lg text-headline-lg mt-0.5 tnum">${n}</div>
        <div class="h-1.5 rounded-full bg-surface-container mt-1.5 overflow-hidden">
          <div class="h-full bg-primary transition-all" style="width:${Math.round((n / max) * 100)}%"></div></div>
        ${i < steps.length - 1 ? `<span class="hidden md:block material-symbols-outlined absolute -right-2.5 top-7 text-[16px] text-outline">chevron_right</span>` : ''}
      </div>`).join('')}</div>`;
}

function rowHTML(r) {
  const outTime = r.closed_at || r.consult_end;
  return `
    <td><span class="inline-grid place-items-center w-9 h-9 rounded-lg font-data-mono font-bold
      ${r.priority !== 'normal' ? 'bg-danger-bg text-danger' : 'bg-primary-fixed text-primary'}">${r.token_no ?? '—'}</span></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}</div></td>
    <td><div class="text-body-md">${esc(r.doctor_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.dept_name || '')} · ${r.visit_type === 'followup' ? 'follow-up' : 'new'}</div></td>
    <td>${pill(r.stage)}</td>
    <td>${pill(r.payment_status)}</td>
    <td>${r.order_count
      ? (r.orders_open ? `<span class="pill-info pill-dot">${r.orders_open} of ${r.order_count} open</span>`
        : `<span class="pill-success pill-dot">${r.order_count} complete</span>`)
      : '<span class="text-on-surface-variant">—</span>'}</td>
    <td class="num ${r.due > 0 ? 'text-danger font-semibold' : 'text-on-surface-variant'}">${r.due > 0 ? money(r.due) : '—'}</td>
    <td><div class="font-data-mono text-body-sm">${fmtTime(r.opened_at)}${outTime ? ` → ${fmtTime(outTime)}` : ''}</div>
      <div class="text-label-sm text-on-surface-variant">${ago(r.opened_at)}</div></td>
    <td class="text-right whitespace-nowrap">
      ${r.due > 0 && can('payment.collect') ? `<button class="btn-secondary btn-xs" data-act="collect">Collect</button>` : ''}
      ${!r.vitals_count && can('vitals.record') && !['closed', 'cancelled'].includes(r.stage)
        ? `<button class="btn-secondary btn-xs" data-act="vitals">Vitals</button>` : ''}
      <button class="btn-ghost btn-xs" data-act="open" title="Open visit"><span class="material-symbols-outlined text-[15px]">open_in_new</span></button>
    </td>`;
}
