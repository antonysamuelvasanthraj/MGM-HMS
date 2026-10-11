/**
 * Role dashboards. Each role lands on its own board, drawn from
 * /api/dashboard/role; the server decides what each role may see. Owners and
 * administrators can switch between boards with the tabs.
 *
 * Pharmacy, reception and owner boards keep billing, collection, revenue,
 * receivables and advances apart — every figure says which one it is.
 */
import {
  page, eyebrow, liveChip, card, live, mountPage, api, qs, state, can, navigate, esc, bind, kpi, money,
  compactMoney, fmtTime, fmtDate, fmtDateTime, ago, pill, priorityPill, setting, emptyState, todayISO, toast, apiError, confirmDialog, doctors, billStatus, payerPill, isPayer, remindBill,
} from './_kit.js';
import { chart } from '../charts.js';
import { collectBill } from '../collect.js';
import { exportWorkbook } from '../excel.js';

const VIEW_LABEL = { work:'Staff workspace', owner: 'Owner', reception: 'Reception', doctor: 'Doctor', pharmacy: 'Pharmacy', lab: 'Laboratory', nurse: 'Nursing / IP', insurance: 'Insurance desk', quality: 'Quality' };
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This FY'], ['custom', 'Custom']];
const CATS = [['', 'All categories'], ['self', 'Normal / cash'], ['insurance', 'Insurance'], ['aarogyasri', 'Aarogyasri'], ['credit', 'Credit'], ['trust', 'Trust'], ['corporate', 'Corporate'], ['free', 'Free']];
const SEGS = [['', 'All departments'], ['OP', 'Outpatient'], ['IP', 'Inpatient'], ['ER', 'Emergency'], ['LAB', 'Laboratory'], ['IMAGING', 'Imaging'], ['PHARMACY', 'Pharmacy'], ['PROCEDURE', 'Procedures'], ['OT', 'OT'], ['ICU', 'ICU'], ['ROOM', 'Room charges'], ['NURSING', 'Nursing'], ['OTHER', 'Other']];
const MODES = [['', 'All payment modes'], ['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank', 'Bank / cheque']];
const n0 = (v) => Number(v || 0).toLocaleString('en-IN');
const m2 = (v) => money(v || 0, 2);
const MODE_NAME = { cash: 'Cash', upi: 'UPI', debit_card: 'Debit card', credit_card: 'Credit card', bank_transfer: 'Bank', cheque: 'Cheque' };
const DAY_VIEWS = ['pharmacy', 'reception', 'doctor', 'lab', 'nurse', 'insurance', 'quality'];

export async function mount(ctx) {
  const f = {
    view: ctx.query.view || '', preset: '', from: '', to: '', segment: '', category: '', doctor_id: '', mode: '', tab: 'overview',
    ptab: 'OP', rtab: 'registration', graph: '30d', gfrom: '', gto: '', fast: '7', slow: '90', stockq: '', expiry: 'all', low: new Set(),
  };
  const root = mountPage(ctx, shell());
  let disposers = [];
  let data = null;
  let ownerTab = 'overview';
  const opened = new Map();

  const clearCharts = () => { disposers.forEach((d) => d()); disposers = []; };
  const draw = (sel, spec) => disposers.push(chart(root.querySelector(sel), spec));

  async function load() {
    const day = DAY_VIEWS.includes(f.view) && f.preset === 'custom';
    let d;
    try {
      d = await api.get(`/dashboard/role${qs({ view: f.view, preset: f.preset || undefined, from: f.preset === 'custom' ? (day ? f.to : f.from) : undefined,
        to: f.preset === 'custom' ? f.to : undefined, segment: f.segment, category: f.category, doctor_id: f.doctor_id, mode: f.mode,
        graph: f.graph, gfrom: f.graph === 'custom' ? f.gfrom : undefined, gto: f.graph === 'custom' ? f.gto : undefined, fast: f.fast, slow: f.slow })}`);
    } catch (err) {
      clearCharts();
      root.querySelector('[data-body]').innerHTML = card({ title: err.payload?.error === 'no_dashboard_for_role' ? 'Your workspace' : 'Dashboard unavailable', body: `<p class="text-on-surface-variant">${err.payload?.error === 'no_dashboard_for_role' ? 'Use the sidebar to open the screens assigned to your role. Your administrator can assign a dashboard in Users & Roles.' : 'The dashboard could not load. Return to the dashboard to try again.'}</p>${go('/my-access', 'My access')}` });
      if (err.payload?.error !== 'no_dashboard_for_role') apiError(err, 'Could not load the dashboard');
      return;
    }
    data = d;
    f.view = d.view;
    if (!f.preset) f.preset = d.view === 'owner' ? 'month' : 'today';
    try {
      renderHeader(d);
      paint();
    } catch (err) {
      console.error('Dashboard rendering failed', err);
      root.querySelector('[data-body]').innerHTML = card({title:'Dashboard could not display',body:'<p>Please retry loading this dashboard.</p><button class="btn-secondary mt-3" data-retry-dashboard>Retry</button>'});
      apiError(err, 'Could not display the dashboard');
    }
  }
  function paint() {
    clearCharts();
    const body = root.querySelector('[data-body]');
    body.innerHTML = roleIntro(data) + ((data.pending_work||[]).length?card({title:'Pending work requiring attention',body:`<div class="flex flex-wrap gap-3">${data.pending_work.map(w=>`<a class="btn-secondary" href="${esc(w.href)}">${esc(w.label)} · ${w.count}</a>`).join('')}</div>`}):'') + ({ work, owner, reception, doctor, pharmacy, lab, nurse, insurance, quality })[data.view](data, f);
    body.classList.add('dashboard-board');
    body.querySelectorAll('details[data-sec]').forEach((el) => {
      if (opened.has(el.dataset.sec)) el.open = opened.get(el.dataset.sec);
      el.addEventListener('toggle', () => opened.set(el.dataset.sec, el.open));
    });
    applyOwnerTab();
    (DRAW[data.view] || (() => {}))(data, draw, f);
  }

  function applyOwnerTab() {
    const groups = {
      overview: ['Revenue', 'Collections'],
      finance: ['Receivables and ageing', 'Expenses', 'Cash position and operating result', 'Refunds and discounts', 'Advances, insurance and Aarogyasri'],
      patients: ['Patient categories', 'Outpatients', 'Inpatients and beds'],
      performance: ['Department summary', 'Period comparisons'],
    };
    root.querySelectorAll('[data-sec]').forEach((el) => { el.hidden = !groups[ownerTab].includes(el.dataset.sec); });
    root.querySelectorAll('[data-owner-tab]').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.ownerTab === ownerTab)));
  }
  bind(root, 'click', '[data-retry-dashboard]', () => load());
  bind(root, 'click', '[data-owner-tab]', (e, b) => { ownerTab = b.dataset.ownerTab; applyOwnerTab(); });

  function renderHeader(d) {
    const tabs = root.querySelector('[data-views]');
    tabs.innerHTML = (d.available || []).length > 1 ? d.available.map((v) => `<button type="button" data-view="${v}" role="tab"
      aria-selected="${v === d.view}" class="px-3 h-8 rounded font-label-md text-label-md ${v === d.view ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}">${VIEW_LABEL[v]}</button>`).join('') : '';
    tabs.classList.toggle('hidden', !((d.available || []).length > 1));
    const ctl = root.querySelector('[data-controls]');
    const isOwner = d.view === 'owner';
    const sel = (attr, opts, cur, label) => `<select class="field field-sm !h-9 !w-auto" ${attr} aria-label="${label}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    ctl.innerHTML = isOwner ? `
      ${sel('data-preset', PRESETS, f.preset, 'Period')}
      ${f.preset === 'custom' ? `<input type="date" class="field field-sm !h-9 !w-auto" data-from value="${esc(f.from || d.from)}" aria-label="From">
        <input type="date" class="field field-sm !h-9 !w-auto" data-to value="${esc(f.to || d.to)}" aria-label="To">` : ''}
      ${sel('data-segment', SEGS, f.segment, 'Department')}
      ${sel('data-doctor', [['', 'All doctors'], ...doctors().map((x) => [x.id, x.name])], f.doctor_id, 'Doctor')}
      ${sel('data-mode', MODES, f.mode, 'Payment mode')}
      ${sel('data-category', CATS, f.category, 'Patient category')}
      <span class="text-body-sm text-on-surface-variant">${d.from === d.to ? fmtDate(d.from) : `${fmtDate(d.from)} – ${fmtDate(d.to)}`}</span>`
      : `<label class="text-body-sm text-on-surface-variant flex items-center gap-2">Day
          <input type="date" class="field field-sm !h-9 !w-auto" data-day value="${esc(d.to)}" max="${todayISO()}" aria-label="Day"></label>
        ${d.to !== todayISO() ? '<button class="btn-ghost btn-sm" data-today>Back to today</button>' : ''}`;
    ctl.innerHTML += `
      <button class="btn-secondary btn-sm" data-export title="Download the figures on this board as Excel"><span class="material-symbols-outlined text-[16px]">table_view</span>Excel</button>
      <button class="btn-secondary btn-sm" data-print title="Print or save as PDF"><span class="material-symbols-outlined text-[16px]">print</span>PDF</button>`;
  }

  bind(root, 'click', '[data-view]', (e, b) => { f.view = b.dataset.view; f.preset = ''; f.tab = 'overview'; load(); });
  bind(root, 'click', '[data-go]', (e, b) => navigate(b.dataset.go));
  bind(root, 'click', '[data-collect]', (e, b) => collectBill(+b.dataset.collect, load));
  bind(root, 'click', '[data-remind]', (e, b) => remindBill(+b.dataset.remind));
  bind(root, 'click', '[data-print]', () => window.print());
  bind(root, 'click', '[data-export]', () => exportBoard(data));
  bind(root, 'click', '[data-today]', () => { f.preset = 'today'; load(); });
  bind(root, 'click', '[data-ptab]', (e, b) => { f.ptab = b.dataset.ptab; paint(); });
  bind(root, 'click', '[data-rtab]', (e, b) => { f.rtab = b.dataset.rtab; paint(); });
  bind(root, 'click', '[data-exp]', (e, b) => { f.expiry = b.dataset.exp; paint(); });
  bind(root, 'click', '[data-graph]', (e, b) => { f.graph = b.dataset.graph; if (f.graph !== 'custom') load(); else paint(); });
  bind(root, 'click', '[data-fast]', (e, b) => { f.fast = b.dataset.fast; load(); });
  bind(root, 'click', '[data-slow]', (e, b) => { f.slow = b.dataset.slow; load(); });

  // pharmacy queue actions: start, hold, resume, cancel — each audited on the server
  bind(root, 'click', '[data-rxs]', async (e, b) => {
    const [id, status] = b.dataset.rxs.split(':');
    let reason = '';
    if (status === 'hold' || status === 'cancelled') {
      const r = await confirmDialog({ title: status === 'hold' ? 'Put prescription on hold' : 'Cancel prescription', message: status === 'hold'
        ? 'The prescription stays in the queue marked Hold until someone resumes it.' : 'Nothing will be dispensed against it. This is recorded in the audit trail.',
      confirmLabel: status === 'hold' ? 'Hold' : 'Cancel prescription', tone: status === 'hold' ? 'primary' : 'danger', requireReason: true, reasonLabel: 'Reason' });
      if (!r) return;
      reason = typeof r === 'string' ? r : r.reason || '';
    }
    try { await api.post(`/pharmacy/prescriptions/${id}/status`, { status, reason }); toast('Queue updated', 'success'); load(); }
    catch (err) { apiError(err, 'Could not update the prescription'); }
  });
  // low stock → purchase request
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-lowpick]')) { t.checked ? f.low.add(+t.value) : f.low.delete(+t.value); const c = root.querySelector('[data-prcount]'); if (c) c.textContent = f.low.size; return; }
    if (t.matches('[data-lowall]')) { (data.low || []).forEach((m) => (t.checked ? f.low.add(m.id) : f.low.delete(m.id))); paint(); return; }
    if (t.matches('[data-preset]')) { f.preset = t.value; if (f.preset !== 'custom') load(); else { f.from = data.from; f.to = data.to; renderHeader(data); } }
    if (t.matches('[data-from]')) { f.from = t.value; if (f.to) load(); }
    if (t.matches('[data-to]')) { f.to = t.value; if (f.from) load(); }
    if (t.matches('[data-day]')) { f.preset = t.value === todayISO() ? 'today' : 'custom'; f.from = f.to = t.value; load(); }
    if (t.matches('[data-segment]')) { f.segment = t.value; load(); }
    if (t.matches('[data-category]')) { f.category = t.value; load(); }
    if (t.matches('[data-doctor]')) { f.doctor_id = t.value; load(); }
    if (t.matches('[data-mode]')) { f.mode = t.value; load(); }
    if (t.matches('[data-gfrom]')) { f.gfrom = t.value; if (f.gto) load(); }
    if (t.matches('[data-gto]')) { f.gto = t.value; if (f.gfrom) load(); }
  });
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-stockq]')) return;
    f.stockq = e.target.value;
    const host = root.querySelector('[data-stockrows]');
    if (host) host.innerHTML = stockRows(data, f);
  });
  bind(root, 'click', '[data-pr]', async (e, b) => {
    const ids = b.dataset.pr === 'selected' ? [...f.low] : [+b.dataset.pr];
    const lines = (data.low || []).filter((m) => ids.includes(m.id)).map((m) => ({ medicine_id: m.id, qty: m.suggest_units, unit: m.unit, rate: m.last_rate, supplier_id: m.supplier_id }));
    if (!lines.length) { toast('Tick the medicines to request first', 'warning'); return; }
    const suppliers = [...new Set(lines.map((l) => l.supplier_id).filter(Boolean))];
    try {
      const r = await api.post('/pharmacy/purchase-requests', { lines, supplier_id: suppliers.length === 1 ? suppliers[0] : null, notes: 'Raised from the pharmacy dashboard (low stock)' });
      toast(`Purchase request ${r.pr_no} created for ${lines.length} item(s)`, 'success');
      f.low.clear(); load();
    } catch (err) { apiError(err, 'Could not create the purchase request'); }
  });
  bind(root, 'click', '[data-verify]', async (e, b) => {
    const ok = await confirmDialog({ title: 'Verify GRN', message: 'Confirm the goods, batches, expiry dates and invoice amounts match the supplier bill.', confirmLabel: 'Verify' });
    if (!ok) return;
    try { await api.post(`/pharmacy/purchases/${b.dataset.verify}/verify`, {}); toast('GRN verified', 'success'); load(); }
    catch (err) { apiError(err, 'Could not verify the GRN'); }
  });

  const stop = live({
    topics: ['dashboard', 'queue', 'billing', 'lab', 'imaging', 'ipd', 'pharmacy', 'inventory', 'accounts', 'clinical'],
    events: ['encounter.created', 'encounter.stage', 'payment.received', 'bill.authorized', 'lab.verified', 'order.updated',
      'admission.created', 'admission.charges', 'admission.discharged', 'pharmacy.dispensed', 'purchase.received', 'purchase.verified', 'transfer.updated',
      'indent.created', 'expense.updated', 'queue.called', 'prescription.saved', 'purchase_request.created'],
    load, interval: 120000,
  });
  return () => { stop(); clearCharts(); };
}

function shell() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = state.user?.name || '';
  // Address people by name; a role-named account ("Hospital Administrator") gets no name.
  const first = /administrator|reception|pharmacy|laboratory|owner/i.test(name) ? '' : name.replace(/^(Dr|Sr|Mr|Ms|Mrs)\.?\s*/i, '').split(' ')[0];
  return page({
    wide: true,
    eyebrow: `${eyebrow(setting('hospital_name', 'Hospital'), 'apartment')} ${liveChip()}`,
    title: `${greet}${first ? `, ${first}` : ''}`,
    actions: `<div class="inline-flex p-0.5 rounded bg-surface-container hidden" role="tablist" data-views></div>`,
    meta: `<div class="flex flex-wrap items-center gap-2 print:hidden" data-controls></div>`,
    body: '<div class="space-y-4" data-body><div class="py-16 text-center text-on-surface-variant">Loading…</div></div>',
  });
}

/* ------------------------------------------------------------ building blocks */

function roleIntro(d) {
  const configs = {
    work: [(d.role || state.user?.role || '').startsWith('hr') ? 'Human resources' : (d.role || state.user?.role || '').startsWith('cleaning') ? 'Housekeeping workspace' : 'Staff workspace', 'Attendance, duty roster and your team', [['dash.work','/attendance','Roster & attendance'], ['staff.manage','/users','Team accounts']]],
    owner: ['Hospital overview', 'Financial performance and hospital operations', [['reports.view', '/reports', 'Report centre']]],
    reception: ['Reception desk', 'Registration, patient flow and collections', [['op.register', '/op-registration', 'Register visit'], ['op.collect', '/op-fee-collection', 'Collect fees']]],
    doctor: ['Clinical workspace', 'Consultations, results and patients under your care', [['queue.view', '/doctor-queue', 'Patient queue']]],
    pharmacy: ['Pharmacy workspace', 'Dispensing, purchases and stock availability', [['pharmacy.dispense', '/pharmacy', 'Dispensing counter']]],
    lab: [d.category === 'imaging' ? 'Imaging workspace' : 'Laboratory workspace', 'Pending tests, results and verification', d.category === 'imaging' ? [['imaging.view', '/imaging', 'Imaging worklist']] : [['lab.view', '/laboratory', 'Laboratory worklist']]],
    nurse: ['Nursing workspace', 'Ward occupancy and patient care', [['ipd.view', '/nursing', 'Nursing charts']]],
    insurance: ['Insurance & payer desk', 'Approvals to chase, claims to follow up and money owed by payers', [['insurance.view', '/insurance', 'Payer cases'], ['insurance.view', '/payers', 'Payers & TPAs']]],
    quality: ['Quality workspace', 'Incidents, overdue actions and sensitive changes', [['quality.view', '/quality', 'Quality register'], ['audit.view', '/audit', 'Audit trail']]],
  };
  const [title, subtitle, actions] = configs[d.view];
  return `<div class="dashboard-intro"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="flex flex-wrap gap-2">${actions.filter(([permission]) => can(permission)).map(([, route, label]) => go(route, label)).join('')}</div></div>`;
}

const tiles = (list, cols = 4) => `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-${cols} gap-3">${list.map(kpi).join('')}</div>`;
/** Compact figure tile for dense ERP-style strips. */
const mini = ({ label, value, sub = '', tone = '' , go: route = '' }) => `<div class="card dashboard-mini px-3 py-2.5 ${route ? 'cursor-pointer hover:bg-surface-container-low' : ''}" ${route ? `data-go="${route}"` : ''}>
  <div class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant truncate" title="${esc(label)}">${esc(label)}</div>
  <div class="text-title-lg font-semibold tabular-nums ${tone ? `text-${tone}` : ''}">${value}</div>
  ${sub ? `<div class="text-body-sm text-on-surface-variant truncate">${sub}</div>` : ''}</div>`;
const minis = (list, cls = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6') => `<div class="grid ${cls} gap-2.5">${list.map(mini).join('')}</div>`;
const chartCard = (title, sel, { sub = '', span = '', actions = '' } = {}) => card({ title, subtitle: sub, className: span, actions, body: `<div data-chart="${sel}" class="min-h-[200px]"></div>` });
const grid2 = (...cards) => `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">${cards.join('')}</div>`;
const grid3 = (...cards) => `<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">${cards.join('')}</div>`;
const listCard = (title, rows, render, { empty = 'Nothing here', action = '', sub = '' } = {}) => card({
  title, subtitle: sub, actions: action, pad: false,
  body: rows.length ? `<div class="overflow-auto max-h-[420px]"><table class="tbl"><tbody>${rows.map(render).join('')}</tbody></table></div>`
    : `<div class="p-6 text-center text-body-md text-on-surface-variant">${esc(empty)}</div>`,
});
const go = (route, label) => `<button class="btn-ghost btn-sm" data-go="${route}">${esc(label)}<span class="material-symbols-outlined text-[16px]">chevron_right</span></button>`;
/** A table with a header row; cols = [label, align?]. */
const tbl = (cols, rows, empty = 'Nothing to show', max = '460px') => `<div class="overflow-auto" style="max-height:${max}"><table class="tbl"><thead><tr>${cols.map(([l, a]) => `<th class="${a === 'r' ? 'num' : ''}">${l}</th>`).join('')}</tr></thead>
  <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${cols.length}" class="text-center py-8 text-on-surface-variant">${esc(empty)}</td></tr>`}</tbody></table></div>`;
const tabBar = (attr, list, cur) => `<div class="flex flex-wrap gap-1 px-3 pt-3 pb-2 border-b border-outline-variant" role="tablist">${list.map(([k, l, c]) => `<button type="button" role="tab" ${attr}="${k}" aria-selected="${k === cur}"
  class="px-3 h-8 rounded-full font-label-md text-label-md border ${k === cur ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}">${esc(l)}${c !== undefined ? ` <span class="tabular-nums opacity-80">${c}</span>` : ''}</button>`).join('')}</div>`;
const chips = (attr, list, cur) => `<div class="inline-flex p-0.5 rounded bg-surface-container print:hidden">${list.map(([k, l]) => `<button type="button" ${attr}="${k}" aria-pressed="${String(k) === String(cur)}"
  class="px-2.5 h-7 rounded font-label-md text-label-md ${String(k) === String(cur) ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}">${esc(l)}</button>`).join('')}</div>`;
const tone = (t, label) => `<span class="pill-${t} pill-dot">${esc(label)}</span>`;
const catLabel = (c) => ({ self: 'Normal', insurance: 'Insurance', aarogyasri: 'Aarogyasri', credit: 'Credit', trust: 'Trust', corporate: 'Corporate', free: 'Free' }[c || 'self'] || c);
const catPill = (c) => (!c || c === 'self' ? '<span class="pill-neutral">Normal</span>' : `<span class="pill-info">${esc(catLabel(c))}</span>`);
const who = (r) => `<div class="font-label-lg">${esc(r.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(r.uhid)}${r.age_years != null ? ` · ${r.age_years}y ${esc((r.gender || '')[0] || '')}` : ''}</div>`;
/** "▲ 12% vs yesterday" — no percentage when the earlier figure is zero. */
function delta(c, label, { good = 'up', isMoney = true } = {}) {
  if (!c) return '';
  const fmt = (v) => (isMoney ? compactMoney(Math.abs(v)) : n0(Math.abs(v)));
  if (!c.now && !c.before && !c.diff) return '';
  if (Math.abs(c.diff) < 0.005) return `<div class="text-body-sm text-on-surface-variant">= ${esc(label)}</div>`;
  const up = c.diff > 0, ok = good === 'up' ? up : !up;
  const txt = c.pct === null ? `${up ? '+' : '−'}${fmt(c.diff)}` : `${Math.abs(c.pct)}%`;
  return `<div class="text-body-sm ${ok ? 'text-success' : 'text-danger'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${up ? 'up' : 'down'} ${txt} <span class="text-on-surface-variant">vs ${esc(label)}</span></div>`;
}

/* --------------------------------------------------------------- pharmacy */

const RX_STATE = { waiting: ['warning', 'Waiting'], dispensing: ['info', 'Dispensing'], partial: ['warning', 'Partially dispensed'], completed: ['success', 'Completed'], hold: ['neutral', 'Hold'], cancelled: ['danger', 'Cancelled'] };
const rxPill = (s) => { const [t, l] = RX_STATE[s] || ['neutral', s]; return tone(t, l); };
const PAYT = { Paid: 'success', Covered: 'info', 'Part paid': 'warning', Unpaid: 'danger', 'On IP bill': 'neutral', 'Not billed': 'neutral' };
const OPEN = ['waiting', 'dispensing', 'partial', 'hold'];

function pharmQueue(d, f) {
  const q = d.queue;
  const sets = {
    OP: q.filter((r) => r.origin === 'OP' && OPEN.includes(r.state)), IP: q.filter((r) => r.origin === 'IP' && OPEN.includes(r.state)),
    ER: q.filter((r) => r.origin === 'ER' && OPEN.includes(r.state)), Pending: q.filter((r) => ['waiting', 'dispensing', 'hold'].includes(r.state)),
    Partial: q.filter((r) => r.state === 'partial'), Completed: q.filter((r) => r.state === 'completed'), Cancelled: q.filter((r) => r.state === 'cancelled'),
  };
  const rows = sets[f.ptab] || [];
  const act = (r) => {
    if (!can('pharmacy.dispense') || !OPEN.includes(r.state)) return '';
    const b = (s, l, cls = 'btn-ghost') => `<button class="${cls} btn-xs" data-rxs="${r.id}:${s}">${l}</button>`;
    return `<div class="flex justify-end gap-1 whitespace-nowrap">
      ${r.state !== 'hold' ? `<button class="btn-primary btn-xs" data-go="/pharmacy?rx=${r.id}">${r.state === 'partial' ? 'Dispense rest' : 'Dispense'}</button>` : ''}
      ${r.state === 'waiting' ? b('dispensing', 'Start') : ''}${r.state === 'hold' ? b('active', 'Resume', 'btn-secondary') : b('hold', 'Hold')}${b('cancelled', 'Cancel')}</div>`;
  };
  return card({ title: 'Dispensing queue', subtitle: 'Prescriptions from OP, IP and emergency — open items plus the last 7 days', pad: false, actions: go('/pharmacy', 'Counter'),
    body: `${tabBar('data-ptab', Object.keys(sets).map((k) => [k, k, sets[k].length]), f.ptab)}
    ${tbl([['Patient ID'], ['Patient'], ['Doctor'], ['Department'], ['Date / time'], ['Meds', 'r'], ['Payment'], ['Category'], ['Status'], ['', 'r']], rows.map((r) => `<tr>
      <td class="font-data-mono text-body-sm">${esc(r.uhid)}</td><td><div class="font-label-lg">${esc(r.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(r.origin)}${r.token_no ? ` · token ${r.token_no}` : ''}</div></td>
      <td class="text-body-sm">${esc(r.doctor_name || '—')}</td><td class="text-body-sm">${esc(r.department || '—')}</td>
      <td class="text-body-sm whitespace-nowrap">${fmtDateTime(r.created_at)}</td><td class="num">${r.done_items}/${r.items}</td>
      <td>${tone(PAYT[r.payment] || (r.payment.includes('·') ? 'info' : 'neutral'), r.payment)}</td><td>${catPill(r.category)}</td>
      <td>${rxPill(r.state)}${r.status_note ? `<div class="text-body-sm text-on-surface-variant max-w-[180px] truncate" title="${esc(r.status_note)}">${esc(r.status_note)}</div>` : ''}</td>
      <td>${act(r)}</td></tr>`), `No ${f.ptab.toLowerCase()} prescriptions.`)}` });
}

function stockRows(d, f) {
  const s = f.stockq.trim().toLowerCase();
  const rows = d.stock.filter((m) => !s || `${m.name} ${m.brand || ''}`.toLowerCase().includes(s)).slice(0, 150);
  return rows.map((m) => `<tr><td><div class="font-label-lg">${esc(m.name)}</div>${m.brand ? `<div class="text-body-sm text-on-surface-variant">${esc(m.brand)}</div>` : ''}</td>
    ${d.locations.map((l) => `<td class="num ${m[l] ? '' : 'text-on-surface-variant'}">${m[l] ? n0(m[l]) : '—'}</td>`).join('')}
    <td class="num font-semibold ${m.total <= 0 ? 'text-danger' : m.total <= m.min ? 'text-warning' : ''}">${n0(m.total)}</td><td class="text-body-sm text-on-surface-variant">${esc(m.unit || '')}</td></tr>`).join('')
    || `<tr><td colspan="${d.locations.length + 3}" class="text-center py-8 text-on-surface-variant">No medicine matches</td></tr>`;
}

function pharmacy(d, f) {
  const k = d.kpis, g = d.grn, s = d.series;
  const exp = f.expiry === 'all' ? d.expiry : d.expiry.filter((e) => e.bucket === f.expiry);
  return `${sessionDueCard(d)}
    ${minis([
      { label: 'Sales today (net)', value: m2(k.sales), sub: `${n0(k.bills)} bills · returns ${compactMoney(k.returns)}` },
      { label: 'OP sales', value: m2(k.op_sales), sub: 'Counter bills' },
      { label: 'IP consumption', value: m2(k.ip_consumption), sub: 'Charged to IP bills' },
      { label: 'Cash collected', value: m2(k.cash), tone: 'success' },
      { label: 'UPI collected', value: m2(k.upi), tone: 'success' },
      { label: 'Card collected', value: m2(k.card), tone: 'success' },
      { label: 'Due today', value: m2(k.due_today), tone: k.due_today ? 'danger' : '', sub: 'Billed, not yet paid' },
      { label: 'Insurance value', value: m2(k.insurance), sub: 'Receivable, not cash' },
      { label: 'Aarogyasri value', value: m2(k.aarogyasri), sub: 'Receivable, not cash' },
      { label: 'Medicines dispensed', value: n0(k.units), sub: 'Units today' },
      { label: 'Stock value', value: compactMoney(k.stock_value), sub: 'At cost, all stores', go: '/stock' },
      { label: 'Low stock', value: n0(k.low_stock), tone: k.low_stock ? 'warning' : '', sub: 'At or below minimum' },
      { label: 'Out of stock', value: n0(k.out_of_stock), tone: k.out_of_stock ? 'danger' : '' },
      { label: 'Near expiry', value: n0(k.near_expiry), tone: k.near_expiry ? 'warning' : '', sub: 'Batches ≤ 90 days' },
      { label: 'Expired', value: n0(k.expired), tone: k.expired ? 'danger' : '', sub: 'Batches still in stock' },
      { label: 'GRNs to verify', value: n0(k.pending_grn), tone: k.pending_grn ? 'warning' : '', go: '/grn' },
      { label: 'Supplier outstanding', value: compactMoney(k.supplier_outstanding), go: '/suppliers' },
      { label: 'Bills today', value: n0(k.bills), sub: 'Excluding cancelled' },
    ])}
    ${k.emergency_pending ? `<div class="rounded-lg border border-danger/40 bg-danger-bg px-4 py-3 text-body-md text-danger flex items-center gap-2"><span class="material-symbols-outlined">warning</span>
      ${k.emergency_pending} emergency stock move(s) are waiting for the in-charge's approval. <button class="btn-secondary btn-xs ml-auto" data-go="/stock-transfers">Open transfers</button></div>` : ''}
    ${pharmQueue(d, f)}
    ${card({ title: 'Sales, collections, due and returns', subtitle: `${s.from === s.to ? fmtDate(s.to) : `${fmtDate(s.from)} – ${fmtDate(s.to)}`} · cancelled bills excluded`,
      actions: `${chips('data-graph', [['hourly', 'Hourly'], ['7d', '7 days'], ['30d', '30 days'], ['monthly', 'Monthly'], ['custom', 'Custom']], f.graph)}
        ${f.graph === 'custom' ? `<input type="date" class="field field-sm !h-8 !w-auto" data-gfrom value="${esc(f.gfrom || s.from)}" aria-label="Graph from"><input type="date" class="field field-sm !h-8 !w-auto" data-gto value="${esc(f.gto || s.to)}" aria-label="Graph to">` : ''}`,
      body: '<div data-chart="psales" class="min-h-[240px]"></div>' })}
    ${grid3(
      chartCard('Payment mode', 'pmodes', { sub: 'Money received vs payer / due, same period as the graph' }),
      card({ title: 'Margin', subtitle: `${fmtDate(d.margin.from)} – ${fmtDate(d.margin.to)}`, body: `<dl class="grid grid-cols-2 gap-y-2 text-body-md">
        <dt class="text-on-surface-variant">Net sales (ex-GST)</dt><dd class="text-right tabular-nums">${m2(d.margin.net_sales)}</dd>
        <dt class="text-on-surface-variant">Cost of goods (batch cost)</dt><dd class="text-right tabular-nums">${m2(d.margin.cogs)}</dd>
        <dt class="font-semibold">Gross margin</dt><dd class="text-right tabular-nums font-semibold ${d.margin.gross_margin < 0 ? 'text-danger' : 'text-success'}">${m2(d.margin.gross_margin)}${d.margin.pct !== null ? ` · ${d.margin.pct}%` : ''}</dd></dl>
        <p class="text-body-sm text-on-surface-variant mt-3">${esc(d.margin.note)}</p>` }),
      card({ title: 'Purchases / GRN', actions: go('/grn', 'GRN'), body: `<dl class="grid grid-cols-2 gap-y-1.5 text-body-md">
        <dt class="text-on-surface-variant">GRNs today</dt><dd class="text-right tabular-nums">${n0(g.today)} · ${m2(g.value_today)}</dd>
        <dt class="text-on-surface-variant">Purchases this month</dt><dd class="text-right tabular-nums">${m2(g.value_month)}</dd>
        <dt class="text-on-surface-variant">Unpaid supplier bills</dt><dd class="text-right tabular-nums">${n0(g.pending_bills)} · ${m2(g.pending_amount)}</dd>
        <dt class="text-on-surface-variant">Awaiting verification</dt><dd class="text-right tabular-nums">${n0(g.pending_verification)}</dd>
        <dt class="text-on-surface-variant">Purchase returns (month)</dt><dd class="text-right tabular-nums">${m2(g.returns_month)}</dd>
        <dt class="text-on-surface-variant">Supplier credits held</dt><dd class="text-right tabular-nums">${m2(g.supplier_credits)}</dd></dl>` }),
    )}
    ${card({ title: 'Stock by location', subtitle: 'Usable (unexpired) quantity in dispensing units — each store counted separately', pad: false,
      actions: `<input type="search" class="field field-sm !h-8 !w-56" placeholder="Find a medicine…" data-stockq value="${esc(f.stockq)}" aria-label="Find a medicine">`,
      body: `<div class="overflow-auto max-h-[420px]"><table class="tbl"><thead><tr><th>Medicine</th>${d.locations.map((l) => `<th class="num">${esc(l)}</th>`).join('')}<th class="num">Total</th><th>Unit</th></tr></thead>
        <tbody data-stockrows>${stockRows(d, f)}</tbody></table></div>` })}
    ${card({ title: `Low and out of stock (${d.low.length})`, subtitle: 'Suggested order brings stock back to twice the minimum, in whole purchase packs', pad: false,
      actions: can('inventory.write') && d.low.length ? `<button class="btn-primary btn-sm" data-pr="selected"><span class="material-symbols-outlined text-[16px]">add_shopping_cart</span>Create purchase request (<span data-prcount>${f.low.size}</span>)</button>` : '',
      body: tbl([[can('inventory.write') ? `<input type="checkbox" data-lowall aria-label="Select all" ${d.low.length && d.low.every((m) => f.low.has(m.id)) ? 'checked' : ''}>` : ''], ['Medicine'], ['Stock', 'r'], ['Minimum', 'r'], ['Where'], ['Suggested order', 'r'], ['Last rate', 'r'], ['Supplier'], ['']],
        d.low.map((m) => `<tr><td>${can('inventory.write') ? `<input type="checkbox" data-lowpick value="${m.id}" ${f.low.has(m.id) ? 'checked' : ''} aria-label="Select ${esc(m.name)}">` : ''}</td>
          <td><div class="font-label-lg">${esc(m.name)}</div>${m.brand ? `<div class="text-body-sm text-on-surface-variant">${esc(m.brand)}</div>` : ''}</td>
          <td class="num">${m.qty <= 0 ? tone('danger', 'Out of stock') : `${n0(m.qty)} ${esc(m.unit || '')}`}</td><td class="num">${n0(m.min)}</td>
          <td class="text-body-sm text-on-surface-variant">${esc(m.locations)}</td><td class="num">${n0(m.suggest_units)} <span class="text-body-sm text-on-surface-variant">(${m.suggest_purchase} pack)</span></td>
          <td class="num">${m.last_rate !== null ? m2(m.last_rate) : '—'}</td><td class="text-body-sm">${esc(m.supplier || '—')}</td>
          <td class="text-right">${can('inventory.write') ? `<button class="btn-ghost btn-xs" data-pr="${m.id}">Request</button>` : ''}</td></tr>`), 'Every item is above its minimum level.') })}
    ${card({ title: 'Expiry', subtitle: 'Batches in stock by time to expiry — value at cost', pad: false,
      body: `<div class="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 border-b border-outline-variant">
        ${[{ key: 'all', label: 'All ≤ 90 days', batches: d.expiry.length, value: d.expiry.reduce((a, e) => a + e.value, 0) }, ...d.expiry_buckets].map((b) => `<button type="button" data-exp="${b.key}" aria-pressed="${f.expiry === b.key}"
          class="text-left rounded-lg border px-3 py-2 ${f.expiry === b.key ? 'border-primary bg-primary-fixed' : 'border-outline-variant hover:bg-surface-container-low'}">
          <div class="text-body-sm ${b.key === 'expired' ? 'text-danger' : 'text-on-surface-variant'}">${esc(b.label)}</div>
          <div class="font-semibold tabular-nums">${n0(b.batches)} <span class="text-body-sm font-normal">batches</span></div><div class="text-body-sm tabular-nums">${compactMoney(b.value)}</div></button>`).join('')}</div>
        ${tbl([['Medicine'], ['Batch'], ['Expiry'], ['Window'], ['Store'], ['Qty', 'r'], ['Value', 'r'], ['Supplier'], ['Return']],
          (f.expiry === 'later' ? [] : exp).map((e) => `<tr><td>${esc(e.name)}</td><td class="font-data-mono text-body-sm">${esc(e.batch_no)}</td><td class="text-body-sm">${fmtDate(e.expiry)}</td>
            <td>${e.days < 0 ? tone('danger', 'Expired') : tone(e.days <= 30 ? 'danger' : 'warning', `${e.days} days`)}</td><td class="text-body-sm">${esc(e.location)}</td>
            <td class="num">${n0(e.qty)}</td><td class="num">${m2(e.value)}</td><td class="text-body-sm">${esc(e.supplier || '—')}</td><td class="text-body-sm">${esc(e.return_eligibility)}</td></tr>`),
          f.expiry === 'later' ? 'Batches expiring after 90 days are counted above; open Stock for the list.' : 'Nothing in this window.', '380px')}` })}
    ${card({ title: 'GRN register', subtitle: 'Latest 40 goods receipts — all received into Central', pad: false, actions: go('/grn', 'All GRNs'),
      body: tbl([['GRN'], ['Supplier'], ['Invoice'], ['Taxable', 'r'], ['CGST', 'r'], ['SGST', 'r'], ['IGST', 'r'], ['Discount', 'r'], ['Net', 'r'], ['Paid', 'r'], ['Due', 'r'], ['Status'], ['']],
        g.rows.map((r) => `<tr><td class="font-data-mono text-body-sm">${esc(r.grn_no)}</td><td>${esc(r.supplier)}</td>
          <td class="text-body-sm">${esc(r.invoice_no || '—')}<div class="text-on-surface-variant">${r.invoice_date ? fmtDate(r.invoice_date) : ''}</div></td>
          <td class="num">${m2(r.taxable)}</td><td class="num">${m2(r.cgst)}</td><td class="num">${m2(r.sgst)}</td><td class="num">${m2(r.igst)}</td><td class="num">${m2(r.discount)}</td>
          <td class="num font-semibold">${m2(r.total)}</td><td class="num">${m2(r.paid)}</td><td class="num ${r.due > 0.005 ? 'text-danger' : ''}">${m2(r.due)}</td>
          <td>${tone(r.verified_at ? (r.due > 0.005 ? 'warning' : 'success') : 'info', r.state)}</td>
          <td class="text-right">${!r.verified_at && can('inventory.approve') ? `<button class="btn-secondary btn-xs" data-verify="${r.id}">Verify</button>` : ''}</td></tr>`), 'No goods received yet.') })}
    ${grid2(
      card({ title: 'Fast-moving medicines', subtitle: `${fmtDate(d.fast.from)} – ${fmtDate(d.fast.to)}`, pad: false, actions: chips('data-fast', [['today', 'Today'], ['7', '7 days'], ['30', '30 days']], f.fast),
        body: tbl([['Medicine'], ['Qty', 'r'], ['Patients', 'r'], ['Value', 'r']], d.fast.rows.map((m) => `<tr><td>${esc(m.name)}${m.brand ? ` <span class="text-body-sm text-on-surface-variant">${esc(m.brand)}</span>` : ''}</td>
          <td class="num">${n0(m.qty)}</td><td class="num">${n0(m.patients)}</td><td class="num">${m2(m.value)}</td></tr>`), 'No sales in this period.', '360px') }),
      card({ title: 'Slow-moving stock', subtitle: `No sale or issue in ${d.slow.days} days — value at cost`, pad: false, actions: chips('data-slow', [['30', '30'], ['60', '60'], ['90', '90'], ['180', '180 days']], f.slow),
        body: tbl([['Medicine'], ['Qty', 'r'], ['Value', 'r'], ['Last moved']], d.slow.rows.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${n0(m.qty)}</td><td class="num">${m2(m.value)}</td>
          <td class="text-body-sm">${m.last_moved ? fmtDate(m.last_moved) : 'Never'}</td></tr>`), 'Everything in stock has moved recently.', '360px') }),
    )}
    ${grid2(
      listCard(`Pharmacy dues to settle (${d.pending_bills.length})`, d.pending_bills, (b) => `<tr>
        <td><div class="font-label-lg">${esc(b.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(b.uhid)} · <span class="font-data-mono">${esc(b.bill_no)}</span> · ${fmtDate(b.bill_date)}</div></td>
        <td class="num">${m2(b.total)}</td><td class="num font-semibold text-danger">${m2(b.balance)}</td><td>${billStatus(b)}</td>
        <td class="text-right whitespace-nowrap"><button class="btn-ghost btn-xs" data-remind="${b.id}" title="Send a due reminder">Remind</button>${can('payment.collect') ? `<button class="btn-primary btn-sm" data-collect="${b.id}">Settle</button>` : ''}</td></tr>`, { empty: 'No pharmacy dues.', sub: 'Settled at the pharmacy counter, not at reception' }),
      listCard(`Open purchase requests (${d.purchase_requests.length})`, d.purchase_requests, (r) => `<tr><td class="font-data-mono">${esc(r.pr_no)}</td>
        <td>${tone(r.status === 'ordered' ? 'info' : 'warning', r.status === 'ordered' ? 'Ordered' : 'Requested')}</td><td class="text-body-sm text-on-surface-variant">${ago(r.created_at)}</td></tr>`,
        { empty: 'No open purchase requests.', action: can('reports.pharmacy') || can('reports.view') ? go('/reports?group=Pharmacy', 'Pharmacy reports') : '' }),
    )}`;
}

/* -------------------------------------------------------------- reception */

const STAGE_TONE = { registered: 'neutral', vitals_pending: 'warning', vitals_done: 'info', ready: 'info', in_consult: 'info', consulted: 'success', services_pending: 'warning', closed: 'success', cancelled: 'danger' };
const payState = (s) => ({ paid: ['success', 'Paid'], free: ['info', 'Free'], waived: ['info', 'Free'], pending: ['danger', 'Fee pending'], approval_pending: ['warning', 'Free — awaiting approval'], due: ['danger', 'Due'] }[s] || ['neutral', s || '—']);

function visitTable(rows, kind) {
  return tbl([['Token'], ['Patient'], ['Doctor'], ['Department'], ['Category'], ['Stage'], ['Payment'], ['Waiting', 'r'], ['', 'r']], rows.map((v) => {
    const [pt, pl] = payState(v.payment_status);
    const action = v.due_bill_id && can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${v.due_bill_id}">Collect</button>`
      : kind === 'vitals' && can('vitals.record') ? `<button class="btn-secondary btn-xs" data-go="/vitals-queue?encounter=${v.id}">Record vitals</button>` : '';
    return `<tr><td class="font-data-mono">${esc(v.token_prefix || '')}${v.token_no ?? ''}</td><td>${who(v)}</td><td class="text-body-sm">${esc(v.doctor_name || '—')}</td>
      <td class="text-body-sm">${esc(v.department || '—')}</td><td>${catPill(v.category)}</td>
      <td>${tone(STAGE_TONE[v.stage] || 'neutral', String(v.stage || '').replace(/_/g, ' '))}${v.priority && !['normal', 'routine'].includes(v.priority) ? ` ${priorityPill(v.priority)}` : ''}</td>
      <td>${tone(pt, pl)}</td><td class="num text-body-sm">${v.waiting_min != null && !['consulted', 'closed'].includes(v.stage) ? `${v.waiting_min} min` : '—'}</td><td class="text-right">${action}</td></tr>`;
  }), 'Nobody in this queue.');
}
function payTable(rows) {
  return tbl([['Patient'], ['Doctor'], ['Tests'], ['Total', 'r'], ['Discount', 'r'], ['Payable', 'r'], ['Paid', 'r'], ['Due', 'r'], ['Category'], ['Authorisation'], ['', 'r']], rows.map((o) => `<tr>
    <td>${who(o)}<div class="font-data-mono text-body-sm text-on-surface-variant">${esc(o.bill_no)}</div></td><td class="text-body-sm">${esc(o.doctor_name || '—')}</td>
    <td class="text-body-sm max-w-[240px]">${esc(o.tests)}${o.stat ? ` ${priorityPill('stat')}` : ''}</td>
    <td class="num">${m2(o.gross)}</td><td class="num">${o.discount ? m2(o.discount) : '—'}</td><td class="num">${m2(o.payable)}</td><td class="num">${o.paid ? m2(o.paid) : '—'}</td>
    <td class="num font-semibold text-danger">${m2(o.due)}</td><td>${catPill(o.category)}</td>
    <td>${o.authorization_status === 'approved' ? tone('info', 'Due approved') : isPayer(o.category) ? payerPill(o.category, o.claim_status) : o.approval_request ? tone('warning', 'Approval requested') : '<span class="text-on-surface-variant text-body-sm">—</span>'}</td>
    <td class="text-right">${can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${o.bill_id}">Collect</button>` : ''}</td></tr>`), 'Nothing waiting for payment.');
}

function sessionDueCard(d){const rows=d.session_dues||[];return card({title:`Patient dues for this day / session (${rows.length})`,subtitle:'Collectible patient share only. Pending TPA, Aarogyasri, corporate and trust amounts stay with the payer.',pad:false,body:tbl([['Patient / bill'],['Type'],['Patient due','r'],['Payer pending','r'],['']],rows.map(b=>`<tr><td>${esc(b.patient_name)} · ${esc(b.uhid)}<div>${esc(b.bill_no)}</div></td><td>${esc(b.kind||b.bill_type)} · ${esc(b.payer_type)}</td><td class="num">${m2(b.patient_due)}</td><td class="num">${m2((b.payer_pending||0)+(b.payer_receivable||0))}</td><td>${can('payment.collect')?`<button class="btn-primary btn-xs" data-collect="${b.id}">Collect patient share</button>`:''}</td></tr>`),'No patient amount is due for this day.')});}
function reception(d, f) {
  const k = d.kpis, c = d.collection, Q = d.queues;
  const tabs = [['registration', 'Registration', Q.registration.length], ['vitals', 'Vitals', Q.vitals.length], ['doctor', 'Doctor', Q.doctor.length],
    ['lab', 'Lab payment', Q.lab.length], ['imaging', 'Imaging payment', Q.imaging.length], ['admission', 'Admission', Q.admission.length],
    ['discharge', 'Discharge billing', Q.discharge.length], ['pending', 'Pending payments', Q.pending.length]];
  const ipRow = (a, bill) => `<tr><td class="font-data-mono text-body-sm">${esc(a.ip_no || '—')}</td><td>${who(a)}</td><td class="text-body-sm">${esc(a.doctor_name || '—')}</td>
    <td class="text-body-sm">${esc(a.ward || '')} ${esc(a.bed_no || '')}</td><td>${catPill(a.category)}</td><td>${pill(a.status)}</td>
    ${bill ? `<td class="num">${m2(a.total)}</td><td class="num">${m2(a.paid)}</td><td class="num font-semibold ${a.balance > 0 ? 'text-danger' : 'text-success'}">${a.balance < 0 ? `Adv ${m2(-a.balance)}` : m2(a.balance)}</td>` : ''}
    <td class="text-right whitespace-nowrap">${bill && a.bill_id && a.balance > 0.005 && can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${a.bill_id}">Collect</button> ` : ''}${go(bill ? '/discharge' : '/admissions', 'Open')}</td></tr>`;
  const panes = {
    registration: visitTable(Q.registration), vitals: visitTable(Q.vitals, 'vitals'), doctor: visitTable(Q.doctor),
    lab: payTable(Q.lab), imaging: payTable(Q.imaging),
    admission: tbl([['IP no'], ['Patient'], ['Consultant'], ['Bed'], ['Category'], ['Status'], ['', 'r']], Q.admission.map((a) => ipRow(a, false)), 'No admission requests or admissions today.'),
    discharge: tbl([['IP no'], ['Patient'], ['Consultant'], ['Bed'], ['Category'], ['Status'], ['Billed', 'r'], ['Paid', 'r'], ['Balance', 'r'], ['', 'r']], Q.discharge.map((a) => ipRow(a, true)), 'No discharge is waiting for billing.'),
    pending: tbl([['Bill'], ['Patient'], ['Type'], ['Date'], ['Total', 'r'], ['Paid', 'r'], ['Due', 'r'], ['Category'], ['Status'], ['', 'r']], Q.pending.map((b) => `<tr>
      <td class="font-data-mono text-body-sm">${esc(b.bill_no)}</td><td>${who(b)}</td><td>${esc(b.bill_type)}</td><td class="text-body-sm">${fmtDate(b.bill_date)}</td>
      <td class="num">${m2(b.total)}</td><td class="num">${b.paid ? m2(b.paid) : '—'}</td><td class="num font-semibold text-danger">${m2(b.balance)}</td><td>${catPill(b.category)}</td>
      <td>${b.authorization_status === 'approved' ? tone('info', 'Due approved') : isPayer(b.category) ? payerPill(b.category, b.claim_status, b.paid > 0 ? 'part paid' : 'not yet received') : tone(b.paid > 0 ? 'warning' : 'danger', b.paid > 0 ? 'Part paid' : 'Unpaid')}</td>
      <td class="text-right whitespace-nowrap"><button class="btn-ghost btn-xs" data-remind="${b.bill_id}" title="Send a due reminder">Remind</button>${can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${b.bill_id}">Collect</button>` : ''}</td></tr>`), 'No pending bills. Pharmacy bills are settled at the pharmacy counter; running IP bills appear under Discharge billing.'),
  };
  return `${sessionDueCard(d)}
    ${minis([
      { label: 'OP registrations', value: n0(k.op), go: '/visit-tracking' },
      { label: 'Paid OP', value: n0(k.paid_op), tone: 'success' },
      { label: 'Free OP', value: n0(k.free_op) },
      { label: 'Follow-ups', value: n0(k.followups) },
      { label: 'New patients', value: n0(k.new_patients) },
      { label: 'Returning patients', value: n0(k.returning) },
      { label: 'Admissions', value: n0(k.admissions), sub: `${n0(k.in_house)} in house` },
      { label: 'Discharges', value: n0(k.discharges) },
      { label: 'Pending admissions', value: n0(k.pending_admissions), tone: k.pending_admissions ? 'warning' : '' },
      { label: 'Vitals queue', value: n0(k.vitals_queue), tone: k.vitals_queue ? 'warning' : '' },
      { label: 'Doctor queue', value: n0(k.doctor_queue) },
      { label: 'Lab payment queue', value: n0(k.lab_queue), sub: m2(k.lab_queue_amount), tone: k.lab_queue ? 'warning' : '' },
      { label: 'Imaging payment queue', value: n0(k.imaging_queue), sub: m2(k.imaging_queue_amount), tone: k.imaging_queue ? 'warning' : '' },
      { label: 'Collected today', value: m2(k.collected), tone: 'success', sub: 'Money received' },
      { label: 'Due today', value: m2(k.due_today), tone: k.due_today ? 'danger' : '', sub: 'Billed today, unpaid' },
      { label: 'Patient receivables', value: m2(k.receivables), sub: 'All open patient dues', tone: k.receivables ? 'warning' : '' },
      { label: 'Free / due approvals', value: n0(k.approvals), go: can('payment.approve_free') ? '/approvals' : '' },
    ])}
    <div class="card p-3"><div class="flex flex-wrap items-center gap-2"><span class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mr-1">Patients today by category</span>
      ${d.categories.map((x) => `<span class="rounded-full border border-outline-variant px-3 py-1 text-body-md">${esc(x.label)} <b class="tabular-nums">${n0(x.value)}</b></span>`).join('')}</div></div>
    ${card({ title: 'Work queues', pad: false, body: `${tabBar('data-rtab', tabs, f.rtab)}${panes[f.rtab]}` })}
    ${grid3(
      card({ title: 'Collection today', subtitle: c.note, body: `<dl class="grid grid-cols-2 gap-y-1.5 text-body-md">
        <dt class="text-on-surface-variant">Gross billed</dt><dd class="text-right tabular-nums">${m2(c.gross)}</dd>
        <dt class="text-on-surface-variant">Discounts</dt><dd class="text-right tabular-nums">${m2(c.discounts)}</dd>
        <dt class="text-on-surface-variant">Net billed</dt><dd class="text-right tabular-nums">${m2(c.billed)}</dd>
        <dt class="font-semibold">Money collected</dt><dd class="text-right tabular-nums font-semibold text-success">${m2(c.collected)}</dd>
        <dt class="text-on-surface-variant">Refunds paid out</dt><dd class="text-right tabular-nums">${m2(c.refunds)}</dd>
        <dt class="text-on-surface-variant">Left as due today</dt><dd class="text-right tabular-nums text-danger">${m2(c.due)}</dd></dl>
        <div class="mt-3 pt-2 border-t border-outline-variant"><div class="font-label-md text-label-md uppercase text-on-surface-variant mb-1">Payer receivables (not cash)</div>
        ${c.receivables.map((r) => `<div class="flex justify-between text-body-md"><span>${esc(r.label)}</span><span class="tabular-nums">${m2(r.value)}</span></div>`).join('')}</div>` }),
      chartCard('Collected by mode', 'rmodes', { sub: 'Split payments counted in each mode' }),
      chartCard('Patient flow by hour', 'rflow', { sub: 'OP and ER registrations' }),
    )}
    ${grid2(
      card({ title: 'Doctor queues', subtitle: 'Listed by name — a live picture, not a ranking', pad: false,
        body: tbl([['Doctor'], ['Waiting', 'r'], ['Completed', 'r'], ['Now seeing'], ['Avg wait', 'r']], d.doctors.map((x) => `<tr><td>${esc(x.doctor)}</td>
          <td class="num">${n0(x.waiting)}</td><td class="num">${n0(x.completed)}</td><td class="font-data-mono">${x.current_token ?? '—'}</td><td class="num">${x.avg_wait != null ? `${x.avg_wait} min` : '—'}</td></tr>`), 'No OP visits today.') }),
      listCard(`Admitted patients (${d.inpatients.length}) — running IP bills`, d.inpatients, (a) => `<tr>
        <td><div class="font-label-lg">${esc(a.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(a.uhid)} · ${esc(a.ip_no)} · ${esc(a.ward || '')} ${esc(a.bed_no || '')} · day ${a.days}</div></td>
        <td class="num">${m2(a.total)}<div class="text-body-sm text-on-surface-variant">paid ${m2(a.paid)}</div></td>
        <td class="num font-semibold ${a.balance > 0 ? 'text-danger' : 'text-success'}">${a.balance < 0 ? `Adv ${m2(-a.balance)}` : m2(a.balance)}</td>
        <td class="text-right whitespace-nowrap">${a.bill_id && can('payment.collect') ? `<button class="btn-primary btn-sm" data-collect="${a.bill_id}">${a.balance > 0 ? 'Collect' : 'Deposit'}</button>` : ''}</td></tr>`,
        { empty: 'No patient is admitted.', sub: 'Bed and daily charges add every 24 hours; a deposit above the bill is an advance, not income', action: go('/admissions', 'Admissions') }),
    )}
    <div class="flex flex-wrap gap-2 print:hidden">${can('reports.reception') || can('reports.view') ? go('/reports?group=Reception', 'Reception reports') : ''}${can('reports.collection') ? go('/day-report', 'Daily collection & handover') : ''}</div>`;
}

/* ----------------------------------------------------------------- doctor */

function doctor(d) {
  const k = d.kpis;
  return `
    ${tiles([
      { label: 'Ready to see', value: n0(k.ready_after_vitals), sub: 'Vitals done', icon: 'hourglass_top', tone: k.ready_after_vitals ? 'warning' : 'success' },
      { label: 'Awaiting vitals', value: n0(k.waiting), icon: 'monitor_heart' },
      { label: 'In consultation', value: n0(k.in_consult), icon: 'stethoscope', tone: 'info' },
      { label: 'Seen today', value: n0(k.seen), icon: 'task_alt', tone: 'success' },
      { label: 'Reports ready', value: n0(k.reports_ready), sub: 'Last 48 hours', icon: 'fact_check', tone: k.reports_ready ? 'warning' : 'neutral' },
      { label: 'My inpatients', value: n0(k.ip_patients), icon: 'hotel' },
      { label: 'Follow-ups today', value: n0(k.follow_ups), icon: 'event_repeat' },
      { label: 'Prescriptions', value: n0(k.prescriptions), sub: `${n0(k.admission_requests)} admission requests`, icon: 'medication' },
    ])}
    ${grid2(
      listCard('My queue', d.queue, (e) => `<tr>
        <td class="font-data-mono w-16">${esc(e.token_prefix || '')}${e.token_no ?? ''}</td>
        <td><div class="font-label-lg">${esc(e.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(e.uhid)} · ${e.age_years ?? '—'}y ${esc((e.gender || '')[0] || '')} · ${esc(e.visit_type)}</div></td>
        <td>${pill(e.stage)} ${e.priority !== 'normal' ? priorityPill(e.priority) : ''}</td>
        <td class="text-right">${['vitals_done', 'ready', 'in_consult'].includes(e.stage) ? `<button class="btn-primary btn-sm" data-go="/consultation?encounter=${e.id}">Consult</button>` : `<span class="text-body-sm text-on-surface-variant">${ago(e.opened_at)}</span>`}</td></tr>`,
        { empty: 'Nobody is waiting for you right now.', action: go('/doctor-queue', 'Full queue') }),
      listCard('Reports ready', d.reports, (r) => `<tr><td><div class="font-label-lg">${esc(r.label)}</div><div class="text-body-sm text-on-surface-variant">${esc(r.patient_name)} · ${esc(r.uhid)}</div></td>
        <td>${r.critical ? '<span class="pill-danger pill-dot">Critical</span>' : pill('verified')}</td><td class="text-body-sm">${ago(r.verified_at)}</td>
        <td class="text-right">${go(`/patient/${r.patient_id}`, 'View')}</td></tr>`, { empty: 'No new results.' }),
    )}
    ${grid2(
      listCard('My inpatients', d.inpatients, (a) => `<tr><td><div class="font-label-lg">${esc(a.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(a.ip_no)} · ${esc(a.ward || '')} ${esc(a.bed_no || '')}</div></td>
        <td>${pill(a.status)}</td><td class="text-body-sm">Day ${(a.days || 0) + 1}</td><td class="text-right">${go(`/patient/${a.patient_id}`, 'Open')}</td></tr>`, { empty: 'No admitted patients under your care.' }),
      chartCard('My OP visits — last 14 days', 'visits'),
    )}`;
}

/* -------------------------------------------------------------------- lab */

const PAY = { paid: ['success', 'Paid'], approved: ['info', 'Due approved'], emergency: ['info', 'Emergency'], ip: ['neutral', 'On IP bill'], unpaid: ['danger', 'Not paid'], unbilled: ['neutral', 'Not billed'] };
const payPill = (p) => {
  if (String(p).startsWith('payer:')) { const [, t, s] = String(p).split(':'); return payerPill(t, s, ['preauth_approved', 'claim_submitted', 'settled'].includes(s) ? 'approved — released' : 'blocked until approved'); }
  const [t, l] = PAY[p] || PAY.unbilled; return `<span class="pill-${t} pill-dot">${l}</span>`;
};

function lab(d) {
  const k = d.kpis;
  return `
    ${tiles([
      { label: 'Awaiting payment', value: n0(k.awaiting_payment), sub: 'Blocked until paid or approved', icon: 'payments', tone: k.awaiting_payment ? 'warning' : 'neutral' },
      { label: 'Paid, not done', value: n0(k.paid), icon: 'verified', tone: 'success' },
      { label: 'Due approved', value: n0(k.due_approved), icon: 'approval', tone: 'info' },
      { label: 'Samples pending', value: n0(k.samples_pending), icon: 'colorize', tone: k.samples_pending ? 'warning' : 'success' },
      { label: 'Collected', value: n0(k.collected), icon: 'science' },
      { label: 'Processing', value: n0(k.processing), icon: 'progress_activity' },
      { label: 'To verify', value: n0(k.reports_pending), sub: `${n0(k.completed_today)} published today`, icon: 'fact_check', tone: k.reports_pending ? 'warning' : 'success' },
      { label: 'Critical values', value: n0(k.critical), sub: `Revenue today ${compactMoney(k.revenue_today)}`, icon: 'warning', tone: k.critical ? 'danger' : 'success' },
    ])}
    ${grid2(chartCard('Work by status', 'status', { sub: 'Open orders plus today’s published' }), chartCard('Orders — last 14 days', 'volume'))}
    ${listCard('Worklist', d.worklist, (o) => `<tr>
      <td class="font-data-mono">${esc(o.order_no)}</td>
      <td><div class="font-label-lg">${esc(o.label)}</div><div class="text-body-sm text-on-surface-variant">${esc(o.patient_name)} · ${esc(o.uhid)}</div></td>
      <td>${pill(o.status)} ${o.priority !== 'routine' ? priorityPill(o.priority) : ''}</td>
      <td>${payPill(o.pay)}</td><td class="text-body-sm text-on-surface-variant">${ago(o.ordered_at)}</td>
      <td class="text-right">${go(d.category === 'imaging' ? '/imaging' : '/laboratory', 'Open')}</td></tr>`, { empty: 'The worklist is clear.' })}`;
}

/* ------------------------------------------------------------------ nurse */

function nurse(d) {
  const k = d.kpis;
  return `
    ${tiles([
      { label: 'Admitted', value: n0(k.admitted), icon: 'hotel', tone: 'info' },
      { label: 'Beds', value: `${n0(k.beds_occupied)}/${n0(k.beds_total)}`, sub: `${k.occupancy}% occupied · ${n0(k.beds_vacant)} free`, icon: 'bed' },
      { label: 'Medicines due (2h)', value: n0(k.meds_due), sub: `${n0(k.meds_overdue)} overdue`, icon: 'medication', tone: k.meds_overdue ? 'danger' : k.meds_due ? 'warning' : 'success' },
      { label: 'Vitals due', value: n0(k.vitals_due), sub: 'None in 6 hours', icon: 'monitor_heart', tone: k.vitals_due ? 'warning' : 'success' },
      { label: 'Doctor orders', value: n0(k.doctor_orders), sub: 'Pending on IP patients', icon: 'assignment' },
      { label: 'Notes today', value: n0(k.notes_today), icon: 'edit_note' },
      { label: 'Indents open', value: n0(k.indents_open), sub: `${n0(k.consumables_today)} consumable requests today`, icon: 'inventory' },
      { label: 'Discharge requests', value: n0(k.discharge_requests), icon: 'logout', tone: k.discharge_requests ? 'warning' : 'neutral' },
    ])}
    ${listCard('Ward census', d.census, (a) => `<tr>
      <td class="font-data-mono">${esc(a.bed_no || '—')}</td>
      <td><div class="font-label-lg">${esc(a.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(a.ip_no)} · ${a.age_years ?? '—'}y · ${esc(a.consultant || '')}</div></td>
      <td>${pill(a.status)}</td><td class="text-body-sm">Day ${(a.days || 0) + 1}</td>
      <td>${a.meds_due ? `<span class="pill-warning pill-dot">${a.meds_due} meds due</span>` : ''}</td>
      <td class="text-body-sm ${!a.last_vitals ? 'text-danger' : 'text-on-surface-variant'}">${a.last_vitals ? `Vitals ${ago(a.last_vitals)}` : 'No vitals yet'}</td>
      <td class="text-right">${go('/nursing', 'Chart')}</td></tr>`, { empty: 'No patients are admitted.', action: go('/indents', 'Indents') })}
    ${grid2(
      listCard('Medicines due in the next two hours', d.meds, (m) => `<tr><td class="font-data-mono">${fmtTime(m.due_at)}</td><td>${esc(m.drug)} <span class="text-on-surface-variant">${esc(m.dose || '')} ${esc(m.route || '')}</span></td>
        <td>${esc(m.patient_name)} <span class="text-on-surface-variant">${esc(m.bed_no || '')}</span></td></tr>`, { empty: 'Nothing due.' }),
      chartCard('Ward occupancy', 'wards', { sub: 'Occupied beds per ward' }),
    )}`;
}

/* ------------------------------------------------------------------ owner */

const section = (title, sub, body, { open = true, id = title } = {}) => `<details class="card group" ${open ? 'open' : ''} ${id ? `data-sec="${id}"` : ''}>
  <summary class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
    <div><div class="text-title-md font-semibold">${esc(title)}</div>${sub ? `<div class="text-body-sm text-on-surface-variant">${sub}</div>` : ''}</div>
    <span class="material-symbols-outlined text-on-surface-variant group-open:rotate-180 transition-transform print:hidden">expand_more</span></summary>
  <div class="px-4 pb-4 space-y-4">${body}</div></details>`;
const dl = (pairs) => `<dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-body-md">${pairs.map(([l, v, cls = '']) => `<dt class="${cls.includes('font-semibold') ? 'font-semibold' : 'text-on-surface-variant'}">${l}</dt><dd class="text-right tabular-nums ${cls}">${v}</dd>`).join('')}</dl>`;
const METRIC_LABEL = { revenue: 'Revenue', collection: 'Collection', expense: 'Expense', op: 'OP visits', admissions: 'Admissions' };

function ownerCard(label, value, cmp, { isMoney = true, good = 'up', sub = '', route = '' } = {}) {
  const comparisons = cmp ? delta(cmp.yesterday, 'yesterday', { good, isMoney }) + delta(cmp.last_week, 'same day last week', { good, isMoney }) + delta(cmp.month_avg, 'last month’s daily average', { good, isMoney }) : '';
  return `<div class="card dashboard-primary p-3.5 ${route ? 'cursor-pointer hover:bg-surface-container-low' : ''}" ${route ? `data-go="${route}"` : ''}>
    <div class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">${esc(label)}</div>
    <div class="text-headline-sm font-semibold tabular-nums mt-0.5">${value}</div>
    ${sub ? `<div class="text-body-sm text-on-surface-variant">${sub}</div>` : ''}
    ${comparisons ? `<div class="mt-1.5 pt-1.5 border-t border-outline-variant/70 space-y-0.5">${comparisons}</div>` : ''}</div>`;
}

function owner(d) {
  const c = d.cards, cmp = d.compare, rv = d.revenue, col = d.collections, rec = d.receivables, res = d.results, cash = d.cash, t = d.todate;
  const period = d.from === d.to ? fmtDate(d.to) : `${fmtDate(d.from)} – ${fmtDate(d.to)}`;
  const B = rec.buckets;
  return `
    <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-title-lg font-semibold">Today · ${fmtDate(d.as_of)}</h2>
      <span class="text-body-sm text-on-surface-variant">Cards show the day; sections below use the selected period (${period}).</span></div>
    <div class="dashboard-primary-grid">
      ${ownerCard('Revenue (earned)', m2(c.revenue), cmp.revenue, { sub: 'Recognised income, net of discounts' })}
      ${ownerCard('Collection (received)', m2(c.collection), cmp.collection, { sub: 'Money in, all modes' })}
      ${ownerCard('Expense', m2(c.expense), cmp.expense, { good: 'down', sub: 'Booked today, incl. cost of medicines' })}
      ${ownerCard('OP visits', n0(c.op), cmp.op, { isMoney: false })}
      ${ownerCard('Admissions', n0(c.admissions), cmp.admissions, { isMoney: false, sub: `${n0(c.discharges)} discharged · ${n0(c.current_ip)} in house` })}
    </div>
    ${minis([
      { label: 'Net cash movement', value: m2(c.net_cash), tone: c.net_cash < 0 ? 'danger' : 'success', sub: 'Cash in hand: closing − opening' },
      { label: 'Total outstanding', value: m2(c.outstanding), tone: c.outstanding ? 'warning' : '', sub: 'All receivables' },
      { label: 'Current inpatients', value: n0(c.current_ip) },
      { label: 'Bed occupancy', value: `${c.occupancy}%`, sub: 'Blocked beds excluded' },
      { label: 'Insurance receivable', value: m2(c.insurance) },
      { label: 'Aarogyasri receivable', value: m2(c.aarogyasri) },
      { label: 'Corporate receivable', value: m2(c.corporate) },
      { label: 'Revenue MTD', value: compactMoney(t.mtd.revenue), sub: `FYTD ${compactMoney(t.fytd.revenue)}` },
      { label: 'Collection MTD', value: compactMoney(t.mtd.collection), sub: `FYTD ${compactMoney(t.fytd.collection)}` },
      { label: 'Expense MTD', value: compactMoney(t.mtd.expense), sub: `FYTD ${compactMoney(t.fytd.expense)}` },
      { label: 'Refunds MTD', value: compactMoney(t.mtd.refunds), sub: `FYTD ${compactMoney(t.fytd.refunds)}` },
      { label: 'Financial year from', value: fmtDate(t.fytd.from), sub: `Month from ${fmtDate(t.mtd.from)}` },
    ])}

<div class="dashboard-tabs" role="tablist" aria-label="Owner dashboard reports"><button type="button" role="tab" data-owner-tab="overview">Overview</button><button type="button" role="tab" data-owner-tab="finance">Finance &amp; dues</button><button type="button" role="tab" data-owner-tab="patients">Patients &amp; beds</button><button type="button" role="tab" data-owner-tab="performance">Performance</button></div>
    ${section('Revenue', `${period} · earned income by department, from the books (not cash received)`, `
      ${minis([{ label: 'Gross', value: m2(rv.gross) }, { label: 'Discounts', value: m2(rv.discount) }, { label: 'Free treatment', value: m2(rv.free) }, { label: 'Returns', value: m2(rv.returns) }, { label: 'Net revenue', value: m2(rv.net), tone: 'success' }], 'grid-cols-2 md:grid-cols-5')}
      ${grid2(`<div data-chart="odepts" class="min-h-[240px]"></div>`, tbl([['Department'], ['Gross', 'r'], ['Discount', 'r'], ['Free', 'r'], ['Returns', 'r'], ['Net', 'r']],
        rv.departments.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${m2(x.gross)}</td><td class="num">${m2(x.discount)}</td><td class="num">${m2(x.free)}</td><td class="num">${m2(x.returns)}</td><td class="num font-semibold">${m2(x.net)}</td></tr>`), 'No revenue in this period.'))}
      <div><div class="font-label-md text-label-md uppercase text-on-surface-variant mb-1">Revenue, collection and expense by day</div><div data-chart="otrend" class="min-h-[240px]"></div></div>`)}

    ${section('Collections', `${period} · money actually received — ${esc(col.note)}`, grid2(`<div data-chart="omodes" class="min-h-[220px]"></div>`, dl([
      ['Cash', m2(col.byMode.cash)], ['UPI', m2(col.byMode.upi)], ['Card', m2(col.byMode.card)], ['Bank / cheque', m2(col.byMode.bank)], ['Other', m2(col.byMode.other)],
      ['Received (all modes)', m2(col.received)], ['of which from payers (insurance, schemes)', m2(col.payer_receipts)], ['Refunds paid out', `− ${m2(col.refunded)}`],
      ['Net collection', m2(col.net), 'font-semibold text-success'], ['Receipts', n0(col.receipts)]])))}

    ${section('Receivables and ageing', `As of ${fmtDate(rec.asOf)} · what is still owed, by who owes it`, tbl(
      [['Type'], ['Items', 'r'], ...B.map((b) => [b.label, 'r']), ['Outstanding', 'r'], ['Recovered in period', 'r']],
      [...rec.types.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${n0(x.count)}</td>${B.map((b) => `<td class="num ${x[b.key] && b.key !== 'd0_7' ? 'text-danger' : ''}">${x[b.key] ? m2(x[b.key]) : '—'}</td>`).join('')}
        <td class="num font-semibold">${m2(x.outstanding)}</td><td class="num text-success">${x.recovered ? m2(x.recovered) : '—'}</td></tr>`),
      `<tr class="font-semibold border-t-2 border-outline"><td>Total</td><td></td>${B.map((b) => `<td class="num">${m2(rec.types.reduce((s, x) => s + (x[b.key] || 0), 0))}</td>`).join('')}<td class="num">${m2(rec.total)}</td>
        <td class="num">${m2(rec.types.reduce((s, x) => s + (x.recovered || 0), 0))}</td></tr>`]))}

    ${section('Patient categories', `${period} · each category kept separate`, tbl([['Category'], ['Patients', 'r'], ['Gross', 'r'], ['Discount', 'r'], ['Approved / claimed', 'r'], ['Free value', 'r'], ['Collected', 'r'], ['Outstanding', 'r']],
      d.categories.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${n0(x.patients)}</td><td class="num">${m2(x.gross)}</td><td class="num">${m2(x.discount)}</td><td class="num">${m2(x.approved_claim)}</td>
        <td class="num">${m2(x.free_value)}</td><td class="num text-success">${m2(x.collected)}</td><td class="num ${x.outstanding ? 'text-danger' : ''}">${m2(x.outstanding)}</td></tr>`)))}

    ${section('Expenses', 'Today, month to date and financial year to date — medicine purchases are stock, not expense, until used', `
      ${tbl([['Category'], ['Today', 'r'], ['Month to date', 'r'], ['FY to date', 'r']], [
        ...d.expenses.filter((x) => x.today || x.mtd || x.fytd).map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${x.today ? m2(x.today) : '—'}</td><td class="num">${x.mtd ? m2(x.mtd) : '—'}</td><td class="num">${x.fytd ? m2(x.fytd) : '—'}</td></tr>`),
        `<tr class="font-semibold border-t-2 border-outline"><td>Total expense</td><td class="num">${m2(d.expense_totals.today)}</td><td class="num">${m2(d.expense_totals.mtd)}</td><td class="num">${m2(d.expense_totals.fytd)}</td></tr>`,
        `<tr class="text-on-surface-variant"><td>Stock purchased (GRN) — for reference</td><td></td><td class="num">${m2(d.expense_totals.purchases_mtd)}</td><td class="num">${m2(d.expense_totals.purchases_fytd)}</td></tr>`], 'No expenses booked.')}`)}

    ${section('Cash position and operating result', 'Two different questions, shown separately: did cash go up, and did the hospital earn more than it spent?', grid3(
      card({ title: 'Daily cash summary', subtitle: `${fmtDate(d.as_of)} · cash in hand`, body: dl([
        ['Opening cash', m2(cash.opening)], ['+ Cash collections', m2(cash.collections)], ['− Cash refunds', m2(cash.refunds)], ['− Cash expenses', m2(cash.expenses)],
        ['− Deposited to bank', m2(cash.deposits)], ['+ Withdrawn from bank', m2(cash.withdrawals)], ['± Other cash entries', m2(cash.other)],
        ['Closing cash (books)', m2(cash.closing), 'font-semibold']]) + `<p class="text-body-sm text-on-surface-variant mt-2">Compare with the physical count at day close.</p>${can('finance.close') ? go('/accounts?tab=close', 'Day close') : ''}` }),
      card({ title: 'Cash surplus / deficit', subtitle: esc(res.cash.label), body: dl([['Money received', m2(res.cash.collections)], ['Money paid out', `− ${m2(res.cash.cash_expenses)}`],
        [res.cash.surplus >= 0 ? 'Cash surplus' : 'Cash deficit', m2(res.cash.surplus), `font-semibold ${res.cash.surplus < 0 ? 'text-danger' : 'text-success'}`]]) }),
      card({ title: 'Operating result', subtitle: esc(res.operating.label), body: dl([['Revenue (earned)', m2(res.operating.revenue)], ['Expenses (incurred)', `− ${m2(res.operating.expenses)}`],
        [res.operating.result >= 0 ? 'Operating profit' : 'Operating loss', m2(res.operating.result), `font-semibold ${res.operating.result < 0 ? 'text-danger' : 'text-success'}`]]) }),
    ))}

    ${section('Outpatients', `${period}`, `
      ${minis([{ label: 'OP visits', value: n0(d.op.totals.total) }, { label: 'New visits', value: n0(d.op.totals.new_visits) }, { label: 'Follow-ups', value: n0(d.op.totals.followups) },
        { label: 'Paid', value: n0(d.op.totals.paid) }, { label: 'Free', value: n0(d.op.totals.free) }, { label: 'New / returning patients', value: `${n0(d.op.totals.new_patients)} / ${n0(d.op.totals.returning_patients)}` }])}
      ${grid3(tbl([['Department'], ['Visits', 'r']], d.op.by_department.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${n0(x.value)}</td></tr>`), 'No visits', '300px'),
        tbl([['Doctor'], ['Visits', 'r']], d.op.by_doctor.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${n0(x.value)}</td></tr>`), 'No visits', '300px'),
        `<div data-chart="ophour" class="min-h-[200px]"></div>`)}
      <div><div class="font-label-md text-label-md uppercase text-on-surface-variant mb-1">Last 30 days</div><div data-chart="optrend" class="min-h-[220px]"></div></div>`)}

    ${section('Inpatients and beds', `Census for ${fmtDate(d.census.date)} · ${esc(d.census.note)}`, `
      ${minis([{ label: 'Opening census', value: n0(d.census.opening) }, { label: '+ Admissions', value: n0(d.census.admissions) }, { label: 'Ward transfers', value: n0(d.census.transfers), sub: 'Do not change the total' },
        { label: '− Discharges', value: n0(d.census.discharges) }, { label: '− Deaths', value: n0(d.census.deaths) }, { label: 'Closing census', value: n0(d.census.closing), tone: 'info' }])}
      ${grid2(tbl([['Ward'], ['Type'], ['Beds', 'r'], ['Blocked', 'r'], ['Available', 'r'], ['Occupied', 'r'], ['Occupancy', 'r']], [...d.occupancy.by_ward.map((w) => `<tr><td>${esc(w.ward)}</td><td class="text-body-sm">${esc(w.kind || '')}</td>
          <td class="num">${n0(w.beds)}</td><td class="num">${w.blocked ? n0(w.blocked) : '—'}</td><td class="num">${n0(w.available)}</td><td class="num">${n0(w.occupied)}</td><td class="num font-semibold">${w.pct}%</td></tr>`),
          `<tr class="font-semibold border-t-2 border-outline"><td>Hospital</td><td></td><td class="num">${n0(d.occupancy.hospital.beds)}</td><td class="num">${n0(d.occupancy.hospital.blocked)}</td><td class="num">${n0(d.occupancy.hospital.available)}</td>
          <td class="num">${n0(d.occupancy.hospital.occupied)}</td><td class="num">${d.occupancy.hospital.pct}%</td></tr>`], 'No wards set up.'),
        tbl([['Ward'], ['In', 'r'], ['Out', 'r'], ['Occupied', 'r']], d.census.wards.map((w) => `<tr><td>${esc(w.name)}</td><td class="num">${n0(w.transfers_in)}</td><td class="num">${n0(w.transfers_out)}</td><td class="num">${n0(w.occupied)}</td></tr>`), 'No wards set up.'))}
      ${card({ title: 'Average length of stay', subtitle: `${period} · inpatient days of discharged patients ÷ patients discharged`, body: `<div class="flex flex-wrap gap-6 items-baseline">
        <div><span class="text-headline-sm font-semibold tabular-nums">${d.alos.alos}</span> <span class="text-on-surface-variant">days</span></div><div class="text-on-surface-variant">${n0(d.alos.discharged)} discharged</div>
        ${d.alos.by_ward.map((w) => `<div class="text-body-md">${esc(w.ward)}: <b class="tabular-nums">${w.alos}</b> d (${n0(w.discharged)})</div>`).join('')}</div>` })}`)}

    ${section('Department summary', `${period} · billed, earned, collected and owed per department`, tbl([['Department'], ['Patients', 'r'], ['Gross bill', 'r'], ['Discount', 'r'], ['Net revenue', 'r'], ['Collection', 'r'], ['Due', 'r'], ['Refund', 'r'], ['Cancelled', 'r']],
      d.departments.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${n0(x.patients)}</td><td class="num">${m2(x.gross)}</td><td class="num">${m2(x.discount)}</td><td class="num font-semibold">${m2(x.net)}</td>
        <td class="num text-success">${m2(x.collection)}</td><td class="num ${x.due ? 'text-danger' : ''}">${m2(x.due)}</td><td class="num">${m2(x.refund)}</td><td class="num">${m2(x.cancelled)}</td></tr>`), 'No activity in this period.'))}

    ${section('Refunds and discounts', `${period}`, grid2(
      card({ title: `Refunds · ${m2(d.refunds.amount)} (${n0(d.refunds.count)})`, pad: false, body: tbl([['Refund'], ['Patient'], ['Dept'], ['Amount', 'r'], ['Paid by'], ['Refunded by'], ['Reason']],
        d.refunds.rows.map((r) => `<tr><td class="font-data-mono text-body-sm">${esc(r.refund_no)}<div class="text-on-surface-variant">${fmtDate(r.created_at)}</div></td><td>${esc(r.patient_name)}</td><td>${esc(r.bill_type)}</td>
          <td class="num">${m2(r.amount)}</td><td class="text-body-sm">${esc((r.original_modes || '').split(',').map((m) => MODE_NAME[m] || m).join(', '))}</td><td class="text-body-sm">${esc(MODE_NAME[r.refund_mode] || r.refund_mode)}</td>
          <td class="text-body-sm max-w-[200px] truncate" title="${esc(r.reason || '')}">${esc(r.reason || '—')}</td></tr>`), 'No refunds.', '360px') }),
      card({ title: `Discounts · ${m2(d.discounts.total)}`, subtitle: Object.entries(d.discounts.by_kind).map(([k, v]) => `${esc(k)} ${m2(v)}`).join(' · '), pad: false,
        body: tbl([['Bill'], ['Patient'], ['Gross', 'r'], ['Discount', 'r'], ['Type'], ['By'], ['Reason']], d.discounts.rows.map((r) => `<tr><td class="font-data-mono text-body-sm">${esc(r.bill_no)}</td><td>${esc(r.patient_name)}</td>
          <td class="num">${m2(r.gross)}</td><td class="num">${m2(r.discount)} <span class="text-body-sm text-on-surface-variant">${r.pct}%</span></td><td class="text-body-sm">${esc(r.kind)}</td>
          <td class="text-body-sm">${esc(r.given_by || '—')}</td><td class="text-body-sm max-w-[200px] truncate" title="${esc(r.reason || '')}">${esc(r.reason || '—')}</td></tr>`), 'No discounts.', '360px') }),
    ))}

    ${section('Advances, insurance and Aarogyasri', `${period}`, grid3(
      card({ title: 'Patient advances', subtitle: 'Money held for patients — a liability, never revenue', body: dl([['Opening balance', m2(d.advances.opening)], ['+ Received', m2(d.advances.received)],
        ['− Used against bills', m2(d.advances.adjusted)], ['− Refunded', m2(d.advances.refunded)], ['Closing balance', m2(d.advances.closing), 'font-semibold']]) }),
      ...['insurance', 'aarogyasri'].map((k) => { const p = d[k]; return card({ title: k === 'insurance' ? 'Insurance' : 'Aarogyasri', subtitle: `${n0(p.cases)} cases · ${n0(p.patients)} patients`, body: dl([
        ['Value billed to payer', m2(p.value)], ['Received', m2(p.received)], ['Disallowed', m2(p.disallowed)], ['Outstanding', m2(p.outstanding), 'font-semibold'],
        ['Settled / part / pending / rejected', `${n0(p.settled)} / ${n0(p.partial)} / ${n0(p.pending)} / ${n0(p.rejected)}`]]) }); }),
    ))}

    ${section('Period comparisons', 'Same number of days in each period, so the comparison is fair', tbl([['Measure'], ...Object.entries(d.periods).map(([k, p]) => [`${{ month_vs_last_month: 'This month vs last month', month_vs_last_year: 'vs same month last year', fy_vs_previous_fy: 'FY to date vs previous FY' }[k]}<div class="text-body-sm font-normal text-on-surface-variant normal-case">${fmtDate(p.previous.from)} – ${fmtDate(p.previous.to)}</div>`, 'r'])],
      Object.keys(METRIC_LABEL).map((m) => `<tr><td>${METRIC_LABEL[m]}</td>${Object.values(d.periods).map((p) => { const x = p.metrics[m], isM = !['op', 'admissions'].includes(m);
        return `<td class="num"><div class="tabular-nums">${isM ? m2(x.now) : n0(x.now)} <span class="text-on-surface-variant text-body-sm">vs ${isM ? m2(x.before) : n0(x.before)}</span></div>${delta(x, 'before', { good: m === 'expense' ? 'down' : 'up', isMoney: isM }).replace('vs before', '')}</td>`; }).join('')}</tr>`)), { open: false })}

    <div class="flex flex-wrap gap-2 print:hidden">${['Executive', 'Financial', 'Operational', 'Scheme / payer', 'Revenue'].map((g) => (can('reports.view') ? go(`/reports?group=${encodeURIComponent(g)}`, `${g} reports`) : '')).join('')}
      ${can('finance.view') ? go('/accounts', 'Accounts') : ''}${can('audit.view') ? go('/audit', 'Audit trail') : ''}</div>`;
}


function work(d) {
  return tiles([{label:'Team members',value:n0(d.kpis.team)}, {label:'On duty today',value:n0(d.kpis.rostered)}, {label:'Present today',value:n0(d.kpis.present)}],3) + grid2(
    listCard('Duty roster',d.roster,r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.duty_date)}</td><td>${esc(r.shift)}</td><td>${esc(r.unit || '—')}</td></tr>`,{empty:'No duties scheduled for this period.'}),
    listCard('Attendance today',d.attendance,r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.status)}</td><td>${esc(r.in_at || '—')}</td><td>${esc(r.out_at || 'On duty')}</td></tr>`,{empty:'No attendance recorded today.'})
  );
}

/* ------------------------------------------------------- insurance / payer desk */

const STAGE_LABEL = { preauth_pending: 'Approval pending', query: 'Query raised', preauth_approved: 'Approved', claim_submitted: 'Claim submitted', settled: 'Settled', rejected: 'Rejected' };

function insurance(d) {
  const k = d.kpis;
  const caseRow = (c) => `<tr>
    <td class="font-data-mono text-body-sm">${esc(c.claim_no)}</td>
    <td><div class="font-label-lg">${esc(c.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(c.uhid)}${c.ip_no ? ` · ${esc(c.ip_no)}` : ''}</div></td>
    <td>${payerPill(c.payer_type, c.status)}<div class="text-body-sm text-on-surface-variant">${esc(c.tpa || '')}${c.package_name ? ` · ${esc(c.package_name)}` : ''}</div></td>
    <td class="num">${m2(c.bill_total)}</td><td class="num ${c.age_days >= 3 ? 'text-warning font-semibold' : ''}">${c.age_days} d</td>
    <td class="text-right">${go('/insurance', 'Open')}</td></tr>`;
  return `
    ${minis([
      { label: 'Open cases', value: n0(k.open), go: '/insurance' },
      { label: 'Approval pending', value: n0(k.pending), tone: k.pending ? 'warning' : '' },
      { label: 'Query raised', value: n0(k.query), tone: k.query ? 'danger' : '' },
      { label: 'Waiting 3+ days', value: n0(k.waiting_over_3d), tone: k.waiting_over_3d ? 'danger' : '', sub: 'Pending or query' },
      { label: 'Approved', value: n0(k.approved), sub: 'Claim not yet submitted' },
      { label: 'Claim submitted', value: n0(k.submitted), sub: 'Awaiting payment' },
      { label: 'Payer inpatients', value: n0(k.inpatients), sub: 'Admitted now' },
      { label: 'Owed by payers', value: m2(k.payer_receivable), sub: 'All payer receivables', go: '/accounts?tab=receivables' },
      { label: 'Received today', value: m2(k.received_today), tone: 'success', sub: `Disallowed ${m2(k.disallowed_today)}` },
    ])}
    ${grid2(
      listCard(`Needs action — approval pending or query (${d.worklist.length})`, d.worklist, caseRow, { empty: 'No case is waiting for approval.', sub: 'Oldest first: chase these with the TPA / payer' }),
      card({ title: 'Cases by stage', body: '<div data-chart="istages" class="min-h-[220px]"></div>' }),
    )}
    ${grid2(
      listCard(`Approved / submitted — follow up for payment (${d.approved.length})`, d.approved, caseRow, { empty: 'Nothing approved and unpaid.' }),
      listCard(`Payer patients admitted now (${d.inpatients.length})`, d.inpatients, (a) => `<tr>
        <td><div class="font-label-lg">${esc(a.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(a.ip_no)} · ${esc(a.ward || '')} ${esc(a.bed_no || '')} · day ${a.days}</div></td>
        <td>${payerPill(a.financial_category, a.claim_status)}<div class="text-body-sm text-on-surface-variant">${esc(a.payer_name || '')}</div></td>
        <td class="num">${m2(a.running)}</td></tr>`, { empty: 'No payer patient is admitted.', sub: 'Running bill — watch it against the approval / package' }),
    )}
    ${card({ title: 'Owed by payers — ageing', subtitle: 'Bills moved to the payer and not yet paid', pad: false,
      body: `<div class="overflow-auto"><table class="tbl"><thead><tr><th>Payer type</th>${d.receivables.buckets.map((b) => `<th class="num">${esc(b.label)}</th>`).join('')}<th class="num">Outstanding</th></tr></thead><tbody>
        ${d.receivables.types.map((t) => `<tr><td>${esc(t.label)}</td>${d.receivables.buckets.map((b) => `<td class="num">${t[b.key] ? m2(t[b.key]) : '—'}</td>`).join('')}<td class="num font-semibold">${m2(t.outstanding)}</td></tr>`).join('')}
      </tbody></table></div>` })}`;
}

/* ------------------------------------------------------------------ quality */

function quality(d) {
  const k = d.kpis;
  return `
    ${minis([
      { label: 'Open incidents', value: n0(k.open), go: '/quality', tone: k.open ? 'warning' : '' },
      { label: 'Overdue', value: n0(k.overdue), tone: k.overdue ? 'danger' : '', sub: 'Past due date' },
      { label: 'Major / severe open', value: n0(k.major), tone: k.major ? 'danger' : '' },
      { label: 'Reported today', value: n0(k.reported_today) },
      { label: 'Closed (30 days)', value: n0(k.closed_30d), tone: 'success' },
      { label: 'Changes recorded today', value: n0(k.changes_today), go: '/audit', sub: 'Audit trail' },
      { label: 'Edits after day close (30 d)', value: n0(k.post_close_edits_30d), tone: k.post_close_edits_30d ? 'warning' : '' },
      { label: 'Cancellations / reopenings (30 d)', value: n0(k.overrides_30d) },
    ])}
    ${grid2(
      listCard(`Open incidents (${d.open.length})`, d.open, (i) => `<tr>
        <td class="font-data-mono text-body-sm">${esc(i.ref_no)}</td>
        <td><div class="font-label-lg">${esc(i.title)}</div><div class="text-body-sm text-on-surface-variant">${esc(i.kind.replace('_', ' '))} · ${esc(i.area || '')} · ${esc(i.owner_name || 'no owner')}</div></td>
        <td>${tone(['major', 'severe', 'critical', 'sentinel'].includes(String(i.severity).toLowerCase()) ? 'danger' : 'warning', i.severity)}</td>
        <td>${pill(i.status)}</td>
        <td class="text-body-sm ${i.due_date && i.due_date < d.to ? 'text-danger font-semibold' : 'text-on-surface-variant'}">${i.due_date ? `due ${fmtDate(i.due_date)}` : `${i.age_days} d old`}</td></tr>`,
        { empty: 'No open incidents.', action: go('/quality', 'Quality register') }),
      card({ title: 'Incidents by status', body: '<div data-chart="qstatus" class="min-h-[220px]"></div>' }),
    )}
    ${listCard('Sensitive changes — last 7 days', d.sensitive, (a) => `<tr>
      <td class="text-body-sm whitespace-nowrap">${fmtDateTime(a.at)}</td><td>${esc(a.action)} <span class="text-on-surface-variant">${esc(a.entity || '')} #${a.entity_id ?? ''}</span></td>
      <td class="text-body-sm">${esc(a.user_name || '')}</td><td class="text-body-sm">${esc(a.reason || '')}</td></tr>`,
      { empty: 'No cancellations, refunds, discounts, waivers or post-close edits this week.', sub: 'Cancellations, refunds, discounts, waivers, reopened days and edits after day close', action: go('/audit', 'Audit trail') })}`;
}

/* ------------------------------------------------------------- chart setup */

const DRAW = {
  insurance: (d, draw) => draw('[data-chart="istages"]', { type: 'hbar', data: d.stages.map((s) => ({ label: STAGE_LABEL[s.key], value: s.value })), money: false, empty: 'No cases yet' }),
  quality: (d, draw) => draw('[data-chart="qstatus"]', { type: 'hbar', data: d.by_status, money: false, empty: 'No incidents recorded' }),
  reception: (d, draw) => {
    draw('[data-chart="rmodes"]', { type: 'donut', data: d.collection.modes, label: 'Collections by mode', empty: 'No money received yet today' });
    draw('[data-chart="rflow"]', { type: 'bar', data: d.hourly, money: false, series: [{ key: 'value', label: 'Patients' }], label: 'Patients by hour', empty: 'No registrations yet today' });
  },
  doctor: (d, draw) => draw('[data-chart="visits"]', { type: 'bar', data: d.visits, x: 'd', series: [{ key: 'v', label: 'Visits' }], money: false, label: 'Visits per day' }),
  pharmacy: (d, draw) => {
    draw('[data-chart="psales"]', { type: d.series.rows.length > 16 ? 'line' : 'bar', data: d.series.rows, x: 'd', height: 240,
      series: [{ key: 'sales', label: 'Sales' }, { key: 'collections', label: 'Collections' }, { key: 'due', label: 'Due' }, { key: 'returns', label: 'Returns' }], empty: 'No pharmacy sales in this period' });
    draw('[data-chart="pmodes"]', { type: 'donut', data: d.modes, empty: 'Nothing billed in this period' });
  },
  lab: (d, draw) => {
    draw('[data-chart="status"]', { type: 'hbar', data: d.by_status, money: false, label: 'Orders by status' });
    draw('[data-chart="volume"]', { type: 'bar', data: d.volume, x: 'd', series: [{ key: 'v', label: 'Orders' }], money: false, label: 'Orders per day' });
  },
  nurse: (d, draw) => draw('[data-chart="wards"]', { type: 'hbar', data: d.wards.map((w) => ({ label: w.ward, value: w.occupied || 0 })), money: false, label: 'Occupied beds by ward', empty: 'No wards set up' }),
  owner: (d, draw) => {
    draw('[data-chart="odepts"]', { type: 'hbar', data: d.revenue.departments.map((x) => ({ label: x.label, value: x.net })), empty: 'No revenue in this period' });
    draw('[data-chart="otrend"]', { type: d.trend.length > 16 ? 'line' : 'bar', data: d.trend, x: 'd', height: 240, series: [{ key: 'revenue', label: 'Revenue' }, { key: 'collected', label: 'Collected' }, { key: 'expense', label: 'Expense' }] });
    draw('[data-chart="omodes"]', { type: 'donut', data: d.collections.modes, empty: 'No money received in this period' });
    draw('[data-chart="ophour"]', { type: 'bar', data: d.op.hourly, money: false, series: [{ key: 'value', label: 'Visits' }], empty: 'No visits' });
    draw('[data-chart="optrend"]', { type: 'bar', stacked: true, data: d.op_trend.map((r) => ({ d: r.d, new: r.visits - r.followups, followups: r.followups })), x: 'd', money: false,
      series: [{ key: 'new', label: 'New visits' }, { key: 'followups', label: 'Follow-ups' }] });
  },
};

/* ----------------------------------------------------------------- export */

/** Every figure on the board as an Excel workbook: a summary sheet, then one sheet per list. */
function exportBoard(d) {
  if (!d) return;
  const label = (k) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const summary = [];
  const flat = (obj, prefix) => { for (const [k, v] of Object.entries(obj || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, `${prefix}${label(k)} · `); else if (!Array.isArray(v)) summary.push({ item: `${prefix}${label(k)}`, value: v }); } };
  flat(d.kpis || d.cards || {}, '');
  const lists = [];
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object' && k !== 'available') lists.push([path ? `${path} ${k}` : k, v]);
      else if (v && typeof v === 'object' && !Array.isArray(v) && path.split(' ').length < 2) walk(v, path ? `${path} ${k}` : k);
    }
  };
  walk(d, '');
  const sheets = [{ name: 'Summary', title: `${VIEW_LABEL[d.view]} dashboard`, subtitle: `${d.from} to ${d.to}`, columns: [{ key: 'item', label: 'Measure' }, { key: 'value', label: 'Value', type: 'number' }], rows: summary }];
  const used = new Set(['Summary']);
  for (const [name, rows] of lists) {
    let nm = label(name).slice(0, 28);
    while (used.has(nm)) nm = `${nm.slice(0, 26)}_${used.size}`;
    used.add(nm);
    const keys = Object.keys(rows[0]).filter((k) => rows.some((r) => r[k] !== null && typeof r[k] !== 'object'));
    sheets.push({ name: nm, title: label(name), columns: keys.map((k) => ({ key: k, label: label(k), type: rows.every((r) => r[k] === null || r[k] === '' || typeof r[k] === 'number') ? 'number' : 'text' })), rows });
  }
  exportWorkbook(`${d.view}-dashboard-${d.from}${d.to !== d.from ? `_to_${d.to}` : ''}`, sheets);
}

export { todayISO, emptyState };

