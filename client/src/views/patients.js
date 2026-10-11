/** Patient Search & Registration — one permanent record per person. */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  api, qs, state, can, navigate, downloadCSV,
  $, $$, esc, bind, toast, renderRows, pill, money, fmtDate, ago, kpi, optionList,
} from './_kit.js';
import { openNewPatient } from './op-registration.js';

let f = { q: '', gender: '', payer: '', created: '' };
let cache = [];

export async function mount(ctx) {
  if (ctx.query.q) f.q = ctx.query.q;
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [{ rows, total }, stats] = await Promise.all([
      api.get(`/patients${qs({ ...f, limit: 200 })}`),
      api.get('/patients/stats'),
    ]);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Patients on file', value: total.toLocaleString('en-IN'), icon: 'groups', sub: `${stats.total.toLocaleString('en-IN')} total UHIDs` },
      { label: 'Registered today', value: stats.today, icon: 'person_add', tone: 'success', sub: `${stats.month} this month` },
      { label: 'Non self-pay', value: stats.insured, icon: 'health_and_safety', tone: 'info', sub: 'Insurance, corporate or scheme' },
      { label: 'ABHA linked', value: stats.with_abha, icon: 'qr_code', sub: `${Math.round((stats.with_abha / Math.max(1, stats.total)) * 100)}% of records` },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: f.q ? `No patient matches “${f.q}”.` : 'No patients yet.' });
    $('[data-count]', root).textContent = `${rows.length} shown${total > rows.length ? ` of ${total}` : ''}`;
  }

  bind(root, 'click', '[data-act="open"]', (e, b) => navigate(`/patient/${b.closest('tr').dataset.id}`));
  bind(root, 'click', '[data-act="register"]', (e, b) => navigate(`/op-registration?patient=${b.closest('tr').dataset.id}`));
  bind(root, 'click', '[data-new]', () => openNewPatient((p) => { toast(`${p.name} created as ${p.uhid}`, 'success'); navigate(`/patient/${p.id}`); }));
  bind(root, 'click', '[data-export]', () => downloadCSV('patients.csv', cache.map((p) => ({
    uhid: p.uhid, name: p.name, gender: p.gender, age: p.age_years, mobile: p.mobile,
    blood_group: p.blood_group, city: p.city, payer: p.payer_type, visits: p.visit_count,
    last_visit: p.last_visit, outstanding: p.outstanding,
  }))));

  return live({ topics: ['patients'], events: ['patient.created', 'patient.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Master patient index', 'folder_shared')} ${liveChip()}`,
    title: 'Patient Search & Registration',
    subtitle: 'Search before you register. A returning patient keeps the same UHID for life — a new visit is not a new patient.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('patient.create') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">person_add</span> New patient</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Search', placeholder: 'UHID, name, mobile or ABHA', value: f.q },
        { type: 'select', key: 'gender', label: 'Gender', value: f.gender, options: optionList([{ value: '', label: 'Any' }, 'Male', 'Female', 'Other']) },
        { type: 'select', key: 'payer', label: 'Payer', value: f.payer, options: [
          { value: '', label: 'Any payer' }, { value: 'self', label: 'Self pay' }, { value: 'insurance', label: 'Insurance' },
          { value: 'corporate', label: 'Corporate' }, { value: 'aarogyasri', label: 'Aarogyasri / scheme' }, { value: 'credit', label: 'Credit' }, { value: 'trust', label: 'Trust' }] },
        { type: 'select', key: 'created', label: 'Registered', value: f.created, options: [
          { value: '', label: 'Any time' }, { value: 'today', label: 'Today' }] },
      ])}
      ${tableCard({
        title: 'Patients', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'UHID', width: '140px' }, { label: 'Patient' }, { label: 'Contact' },
          { label: 'Payer' }, { label: 'Visits' }, { label: 'Last visit' },
          { label: 'Outstanding', cls: 'text-right' }, { label: '', width: '150px' }],
      })}`,
  });
}

function rowHTML(p) {
  return `
    <td class="font-data-mono text-body-sm">${esc(p.uhid)}</td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(p.name)}
        ${p.vip ? '<span class="pill-brand">VIP</span>' : ''}
        ${p.allergy_count ? '<span class="material-symbols-outlined text-[14px] text-danger" title="Allergies recorded">warning</span>' : ''}</div>
      <div class="text-label-sm text-on-surface-variant">${p.age_years ?? '—'}y · ${esc(p.gender)}${p.blood_group ? ` · ${esc(p.blood_group)}` : ''}</div></td>
    <td><div class="text-body-md">${esc(p.mobile || '—')}</div>
      <div class="text-label-sm text-on-surface-variant truncate max-w-[180px]">${esc(p.city || '')}</div></td>
    <td>${p.payer_type === 'self' ? '<span class="pill-neutral">Self pay</span>'
      : `<span class="pill-info">${esc(p.payer_name || p.payer_type)}</span>`}</td>
    <td class="num">${p.visit_count || 0}</td>
    <td class="text-body-md">${p.last_visit ? fmtDate(p.last_visit) : '—'}</td>
    <td class="num ${p.outstanding > 0 ? 'text-danger font-semibold' : 'text-on-surface-variant'}">${p.outstanding > 0 ? money(p.outstanding) : '—'}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="open">Record</button>
      ${can('op.register') ? `<button class="btn-primary btn-xs" data-act="register">New visit</button>` : ''}
    </td>`;
}
