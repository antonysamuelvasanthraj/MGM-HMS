/**
 * Audit trail — who changed what, when, from which value to which, and why.
 * Covers billing, discounts, refunds, free and due approvals, stock, GRN,
 * transfers, prescriptions, lab results and accounting entries.
 */
import { page, eyebrow, card, live, mountPage, api, qs, esc, fmtDateTime, drawer, downloadCSV, todayISO, shiftDate, titleCase } from './_kit.js';

const GROUPS = [
  ['', 'All actions'], ['payment', 'Payments & refunds'], ['bill', 'Bills & discounts'], ['settlement', 'Free / due / payer'],
  ['grn', 'GRN'], ['transfer', 'Transfers'], ['stock', 'Stock adjustments'], ['lab', 'Lab results'], ['rx', 'Prescriptions'],
  ['journal', 'Accounting entries'], ['expense', 'Expenses'], ['day', 'Day close'],
];

export async function mount(ctx) {
  const f = { from: shiftDate(todayISO(), -6), to: todayISO(), action: ctx.query.action || '', entity: '', user_id: '', q: '' };
  const root = mountPage(ctx, page({
    wide: true, eyebrow: eyebrow('Governance', 'policy'), title: 'Audit trail',
    subtitle: 'Every change is recorded with the user, the time, the previous and new value, and the reason given.',
    body: `<div class="card p-3 flex flex-wrap items-end gap-2" data-f></div><div data-out></div>`,
  }));
  let data = { rows: [], entities: [], users: [] };

  function filters() {
    root.querySelector('[data-f]').innerHTML = `
      <div><label class="field-label">From</label><input type="date" class="field field-sm !h-9" data-k="from" value="${f.from}"></div>
      <div><label class="field-label">To</label><input type="date" class="field field-sm !h-9" data-k="to" value="${f.to}"></div>
      <div><label class="field-label">Action</label><select class="field field-sm !h-9" data-k="action">${GROUPS.map(([v, l]) => `<option value="${v}" ${v === f.action ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="field-label">Record type</label><select class="field field-sm !h-9" data-k="entity"><option value="">All</option>${data.entities.map((e) => `<option ${e === f.entity ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
      <div><label class="field-label">User</label><select class="field field-sm !h-9" data-k="user_id"><option value="">Everyone</option>${data.users.map((u) => `<option value="${u.id}" ${String(u.id) === String(f.user_id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="flex-1 min-w-[200px]"><label class="field-label">Search</label><input class="field field-sm !h-9" data-k="q" value="${esc(f.q)}" placeholder="Bill no., reason, user…"></div>
      <button class="btn-secondary btn-sm" data-csv>CSV</button>`;
  }

  async function load() {
    data = await api.get(`/audit${qs({ ...f, limit: 1000 })}`);
    filters();
    root.querySelector('[data-out]').innerHTML = card({
      title: `${data.rows.length} entries`, pad: false,
      body: `<div class="overflow-auto max-h-[68vh]"><table class="tbl"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Change</th><th>Reason</th></tr></thead><tbody>
        ${data.rows.map((r) => `<tr class="cursor-pointer" data-row="${r.id}"><td class="whitespace-nowrap text-body-sm">${fmtDateTime(r.at)}</td><td>${esc(r.user_name || 'System')}</td>
          <td><span class="font-data-mono text-body-sm">${esc(r.action)}</span></td><td class="text-body-sm">${esc(r.entity || '')}${r.entity_id ? ` #${r.entity_id}` : ''}</td>
          <td class="text-body-sm max-w-[360px] truncate">${esc(summary(r))}</td><td class="text-body-sm max-w-[240px] truncate">${esc(r.reason || '')}</td></tr>`).join('')
          || '<tr><td colspan="6" class="text-center py-10 text-on-surface-variant">No audit entries match</td></tr>'}</tbody></table></div>`,
    });
  }

  root.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) { f[k] = e.target.value; load(); } });
  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-row]');
    if (row) detail(data.rows.find((r) => r.id === +row.dataset.row));
    if (e.target.closest('[data-csv]')) downloadCSV(`audit_${f.from}_${f.to}.csv`, data.rows.map((r) => ({
      at: r.at, user: r.user_name, action: r.action, entity: r.entity, id: r.entity_id, before: JSON.stringify(r.before ?? ''), after: JSON.stringify(r.after ?? ''), reason: r.reason || '', ip: r.ip || '' })));
  });
  return live({ topics: ['audit'], load });
}

export function summary(r) {
  if (r.before && r.after && typeof r.before === 'object' && typeof r.after === 'object') {
    const keys = [...new Set([...Object.keys(r.before), ...Object.keys(r.after)])].filter((k) => JSON.stringify(r.before[k]) !== JSON.stringify(r.after[k]));
    return keys.slice(0, 4).map((k) => `${titleCase(k)}: ${fmt(r.before[k])} → ${fmt(r.after[k])}`).join(' · ');
  }
  if (Array.isArray(r.after)) return `${r.after.length} change(s): ${r.after.slice(0, 3).map(fmt).join(' · ')}`;
  if (r.after) return typeof r.after === 'object' ? Object.entries(r.after).slice(0, 4).map(([k, v]) => `${titleCase(k)} ${fmt(v)}`).join(' · ') : String(r.after);
  if (r.detail && typeof r.detail === 'object') return Object.entries(r.detail).filter(([k]) => !['before', 'after'].includes(k)).slice(0, 4).map(([k, v]) => `${titleCase(k)} ${fmt(v)}`).join(' · ');
  return '';
}
/** A value in plain words: lists and records are spelled out ("Service id 1: — → 400"), never raw JSON. */
const fmt = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.slice(0, 3).map(fmt).join('; ') + (v.length > 3 ? ` … (+${v.length - 3})` : '') : '—';
  if (typeof v === 'object') {
    if ('before' in v && 'after' in v) return `${Object.entries(v).filter(([k]) => !['before', 'after'].includes(k)).map(([k, x]) => `${titleCase(k)} ${fmt(x)}`).join(' ')}: ${fmt(v.before)} → ${fmt(v.after)}`.replace(/^: /, '');
    return Object.entries(v).slice(0, 4).map(([k, x]) => `${titleCase(k)} ${typeof x === 'object' && x !== null ? '…' : fmt(x)}`).join(', ');
  }
  return String(v);
};

function table(obj) {
  if (!obj || typeof obj !== 'object') return `<p class="text-body-md">${esc(fmt(obj))}</p>`;
  return `<table class="tbl"><tbody>${Object.entries(obj).map(([k, v]) => `<tr><td class="text-body-sm text-on-surface-variant w-40">${esc(titleCase(k))}</td><td class="text-body-md break-all">${esc(fmt(v))}</td></tr>`).join('')}</tbody></table>`;
}

function detail(r) {
  const keys = [...new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})])];
  const diff = r.before && r.after && typeof r.before === 'object' && typeof r.after === 'object';
  drawer({
    title: r.action, subtitle: `${esc(r.user_name || 'System')} · ${fmtDateTime(r.at)}${r.ip ? ` · ${esc(r.ip)}` : ''}`, width: 'max-w-2xl',
    body: `<div class="p-5 space-y-4">
      <div class="text-body-md">${esc(r.entity || '')}${r.entity_id ? ` #${r.entity_id}` : ''}</div>
      ${r.reason ? `<div class="rounded-lg bg-warning-bg px-3 py-2 text-body-md"><strong>Reason:</strong> ${esc(r.reason)}</div>` : ''}
      ${diff ? `<table class="tbl"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${keys.map((k) => {
        const changed = JSON.stringify(r.before[k]) !== JSON.stringify(r.after[k]);
        return `<tr class="${changed ? 'bg-primary-fixed/40' : ''}"><td class="text-body-sm">${esc(titleCase(k))}</td><td class="text-body-md break-all">${esc(fmt(r.before[k]))}</td><td class="text-body-md break-all ${changed ? 'font-semibold' : ''}">${esc(fmt(r.after[k]))}</td></tr>`;
      }).join('')}</tbody></table>`
        : `${r.before ? `<h3 class="panel-title">Before</h3>${table(r.before)}` : ''}${r.after ? `<h3 class="panel-title">After</h3>${table(r.after)}` : ''}`}
      ${r.detail && typeof r.detail === 'object' ? `<details><summary class="text-body-md text-on-surface-variant cursor-pointer">Full detail</summary><pre class="text-body-sm whitespace-pre-wrap mt-2">${esc(JSON.stringify(r.detail, null, 2))}</pre></details>` : ''}
    </div>`,
  });
}
