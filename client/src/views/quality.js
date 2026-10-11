/** Quality & audit workspace — incidents, CAPA and NABH clause tracking. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, downloadCSV, barChart,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, fmtDate, fmtDateTime, ago,
  kpi, todayISO, titleCase, emptyState,
} from './_kit.js';
import { summary as auditSummary } from './audit.js';

let f = { status: '', kind: '' };
let cache = [];

/** An audit row's detail in plain words, never raw JSON (same wording as the Audit Trail). */
function plainDetail(d) {
  let x = d;
  if (typeof d === 'string') { try { x = JSON.parse(d); } catch { return d; } }
  if (!x || typeof x !== 'object') return String(x ?? '');
  return auditSummary({ before: x.before, after: x.after, detail: x }) || '';
}

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [d, audit] = await Promise.all([
      api.get(`/quality${qs(f)}`), can('audit.view') ? api.get('/audit?limit=60').then(d => d.rows || []).catch(() => []) : Promise.resolve([]),
    ]);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Open items', value: d.counts.open, icon: 'verified', tone: d.counts.open ? 'warning' : 'success', sub: `${d.rows.length} shown` },
      { label: 'Major severity', value: d.counts.major, icon: 'priority_high', tone: d.counts.major ? 'danger' : 'success', sub: 'Needs executive review' },
      { label: 'Overdue', value: d.counts.overdue, icon: 'running_with_errors', tone: d.counts.overdue ? 'danger' : 'success', sub: 'Past the CAPA due date' },
      { label: 'Closed in 30 days', value: d.counts.closed30, icon: 'task_alt', tone: 'success', sub: 'Resolution rate' },
    ].map(kpi).join('');
    $('[data-areas]', root).innerHTML = d.byArea.length
      ? barChart(d.byArea.map((a) => ({ label: a.area || '—', value: a.n })), { height: 160, format: (v) => `${v}` })
      : emptyState('bar_chart', 'No incidents recorded', '');
    $('[data-clauses]', root).innerHTML = d.byClause.length
      ? `<div class="flex flex-wrap gap-2">${d.byClause.map((c) => `
          <span class="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full border border-outline-variant">
            <span class="font-data-mono text-label-md">${esc(c.nabh_clause || '—')}</span>
            <span class="font-data-mono text-label-sm text-on-surface-variant">${c.n}</span></span>`).join('')}</div>`
      : '<p class="text-body-md text-on-surface-variant">No clause mapping yet.</p>';
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'Nothing recorded for this filter.' });
    renderRows($('[data-audit]', root), audit.slice(0, 60), (a) => `
      <td class="text-body-sm">${fmtDateTime(a.at)}</td>
      <td class="text-body-md">${esc(a.user_name || 'system')}</td>
      <td><span class="pill-neutral">${esc(a.action)}</span></td>
      <td class="text-body-sm text-on-surface-variant truncate max-w-[220px]">${esc(plainDetail(a.detail))}</td>`,
      { empty: 'No audit entries.' });
    $('[data-count]', root).textContent = `${d.rows.length} item(s)`;
  }

  bind(root, 'click', '[data-new]', () => editIncident(null, load));
  bind(root, 'click', '[data-act="open"]', (e, b) => editIncident(cache.find((x) => x.id === +b.closest('tr').dataset.id), load));
  bind(root, 'click', '[data-export]', () => downloadCSV('quality-incidents.csv', cache));

  return live({ topics: ['quality', 'admin'], events: ['quality.created', 'quality.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Quality & NABH', 'verified')} ${liveChip()}`,
    title: 'Quality & Audit',
    subtitle: 'Incidents, near-misses, complaints and audit findings with corrective action and the NABH clause each one touches.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('quality.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> Report an event</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      <div class="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 items-start">
        ${card({ title: 'Events by area', body: `<div data-areas></div>` })}
        ${card({ title: 'NABH clauses touched', body: `<div data-clauses></div>` })}
      </div>
      ${filterBar([
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'investigating', label: 'Investigating' },
          { value: 'capa', label: 'CAPA in progress' }, { value: 'closed', label: 'Closed' }] },
        { type: 'select', key: 'kind', label: 'Kind', value: f.kind, options: [
          { value: '', label: 'All kinds' }, { value: 'incident', label: 'Incident' }, { value: 'near_miss', label: 'Near miss' },
          { value: 'complaint', label: 'Complaint' }, { value: 'audit_finding', label: 'Audit finding' }] },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Event register', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '56vh',
          columns: [{ label: 'Reference', width: '130px' }, { label: 'Event' }, { label: 'Area' },
            { label: 'Severity' }, { label: 'Clause' }, { label: 'Owner' },
            { label: 'Due' }, { label: 'Status' }, { label: '', width: '80px' }],
        })}
        ${card({ title: 'System audit trail', subtitle: 'Who did what, most recent first', pad: false,
          body: `<div class="overflow-auto" style="max-height:56vh"><table class="tbl">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody data-audit></tbody></table></div>` })}
      </div>`,
  });
}

function rowHTML(q) {
  const overdue = q.status !== 'closed' && q.due_date && q.due_date < todayISO();
  return `
    <td class="font-data-mono text-body-sm">${esc(q.ref_no)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(q.title)}</div>
      <div class="text-label-sm text-on-surface-variant capitalize">${esc(q.kind.replace('_', ' '))} · reported ${ago(q.reported_at)}</div></td>
    <td class="text-body-md">${esc(q.area || '—')}</td>
    <td>${q.severity === 'major' ? '<span class="pill-danger pill-dot">Major</span>'
      : q.severity === 'moderate' ? '<span class="pill-warning pill-dot">Moderate</span>'
      : '<span class="pill-neutral">Minor</span>'}</td>
    <td class="font-data-mono text-body-sm">${esc(q.nabh_clause || '—')}</td>
    <td class="text-body-md">${esc(q.owner_name || '—')}</td>
    <td class="text-body-sm ${overdue ? 'text-danger font-semibold' : ''}">${q.due_date ? fmtDate(q.due_date) : '—'}</td>
    <td>${pill(q.status)}</td>
    <td class="text-right"><button class="btn-secondary btn-xs" data-act="open">Open</button></td>`;
}

function editIncident(q, after) {
  const AREAS = ['OPD', 'ICU', 'Ward A', 'Ward B', 'Laboratory', 'Pharmacy', 'Operation Theatre', 'Emergency', 'Front Office', 'Radiology', 'Maternity'];
  const CLAUSES = ['AAC.1', 'AAC.3', 'COP.4', 'COP.7', 'MOM.5', 'PSQ.2', 'IPC.6', 'ROM.1', 'HRM.3', 'FMS.5'];
  modal({
    title: q ? q.ref_no : 'Report a quality event', subtitle: q ? esc(q.title) : '', size: 'md',
    body: `<form data-qf class="space-y-3">
      <div><label class="field-label">Title *</label><input class="field" name="title" required value="${esc(q?.title || '')}"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="field-label">Kind</label><select class="field" name="kind">
          ${['incident', 'near_miss', 'complaint', 'audit_finding'].map((k) => `<option value="${k}" ${k === q?.kind ? 'selected' : ''}>${titleCase(k)}</option>`).join('')}</select></div>
        <div><label class="field-label">Severity</label><select class="field" name="severity">
          ${['minor', 'moderate', 'major'].map((k) => `<option value="${k}" ${k === q?.severity ? 'selected' : ''}>${titleCase(k)}</option>`).join('')}</select></div>
        <div><label class="field-label">Area</label><select class="field" name="area">
          ${AREAS.map((a) => `<option ${a === q?.area ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="field-label">NABH clause</label><select class="field" name="nabh_clause">
          <option value="">—</option>${CLAUSES.map((c) => `<option ${c === q?.nabh_clause ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label class="field-label">Due date</label><input class="field" type="date" name="due_date" value="${esc(q?.due_date || '')}"></div>
        ${q ? `<div><label class="field-label">Status</label><select class="field" name="status">
          ${['open', 'investigating', 'capa', 'closed'].map((s) => `<option value="${s}" ${s === q.status ? 'selected' : ''}>${titleCase(s)}</option>`).join('')}</select></div>` : '<div></div>'}
      </div>
      <div><label class="field-label">Detail / corrective action</label>
        <textarea class="field" rows="6" name="detail">${esc(q?.detail || '')}</textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-qf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const b = Object.fromEntries(new FormData(form));
          if (q) await api.patch(`/quality/${q.id}`, b);
          else await api.post('/quality', b);
          close(); toast('Quality event saved', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
