/**
 * Report centre. One screen for every management, finance and patient report:
 * choose a report, set the period and filters, then read, chart, print (or
 * save as PDF) and export to Excel or CSV. Each report opens with its summary
 * figures, then a chart, then a searchable, sortable, paged detail table.
 */
import {
  page, eyebrow, card, live, mountPage, api, qs, esc, money, fmtDate, toast, downloadCSV, setting, apiError,
} from './_kit.js';
import { chart } from '../charts.js';

const PAGE = 50;
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This FY'], ['custom', 'Custom']];
const SEGS = [['', 'All departments'], ['OP', 'Outpatient'], ['IP', 'Inpatient'], ['ER', 'Emergency'], ['LAB', 'Laboratory'], ['IMAGING', 'Imaging'], ['PHARMACY', 'Pharmacy'], ['PROCEDURE', 'Procedures'], ['OT', 'OT'], ['ICU', 'ICU'], ['ROOM', 'Room charges'], ['NURSING', 'Nursing'], ['PACKAGE', 'Packages'], ['OTHER', 'Other']];
const CATS = [['', 'All categories'], ['self', 'Normal / cash'], ['insurance', 'Insurance'], ['aarogyasri', 'Aarogyasri'], ['credit', 'Credit'], ['trust', 'Trust'], ['corporate', 'Corporate'], ['free', 'Free'], ['due', 'Due']];
const MODES = [['', 'All modes'], ['cash', 'Cash'], ['upi', 'UPI'], ['debit_card', 'Debit card'], ['credit_card', 'Credit card'], ['bank_transfer', 'Bank transfer'], ['cheque', 'Cheque']];

export async function mount(ctx) {
  const cat = await api.get('/reports/catalog');
  if (!cat.reports.length) {
    mountPage(ctx, page({ title: 'Reports', body: card({ body: '<p class="text-body-lg text-on-surface-variant">Your role has no reports assigned.</p>' }) }));
    return;
  }
  const inGroup = ctx.query.group ? cat.reports.find((r) => r.group.toLowerCase() === String(ctx.query.group).toLowerCase()) : null;
  const f = { id: cat.reports.some((r) => r.id === ctx.query.report) ? ctx.query.report : (inGroup || cat.reports[0]).id, preset: 'month', from: '', to: '', segment: '', category: '', mode: '', doctor_id: '', account_id: '' };
  const groups = [...new Set(cat.reports.map((r) => r.group))];
  const root = mountPage(ctx, page({
    wide: true,
    eyebrow: eyebrow('Reports', 'summarize'),
    title: 'Report centre',
    subtitle: 'Revenue is what was billed, collection is money received, receivables are what is still owed — each report says which it shows.',
    body: `<div class="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4 items-start">
      <nav class="card p-2 lg:sticky lg:top-4 print:hidden lg:max-h-[calc(100vh-2rem)] overflow-auto" aria-label="Reports">
        <input type="search" class="field field-sm !h-9 mb-1" placeholder="Find a report…" data-find aria-label="Find a report">
        ${groups.map((g) => `<details data-group="${esc(g)}" ${cat.reports.find((r) => r.id === f.id)?.group === g ? 'open' : ''}>
        <summary class="cursor-pointer px-2 pt-2 pb-1 font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">${esc(g)}
          <span class="normal-case tracking-normal">(${cat.reports.filter((r) => r.group === g).length})</span></summary>
        ${cat.reports.filter((r) => r.group === g).map((r) => `<button data-report="${r.id}" data-title="${esc(r.title.toLowerCase())}" class="w-full text-left px-2.5 py-1.5 rounded text-body-md">${esc(r.title)}</button>`).join('')}</details>`).join('')}
      </nav>
      <div class="space-y-4 min-w-0">
        <div class="card p-3 flex flex-wrap items-end gap-2 print:hidden" data-filters></div>
        <div data-out></div>
      </div></div>`,
  }));

  let result = null, disposeChart = () => {};
  const view = { search: '', sort: null, dir: 1, page: 0 };

  function filters() {
    const r = cat.reports.find((x) => x.id === f.id);
    const has = (k) => r.filters.includes(k);
    const sel = (key, label, opts) => `<div><label class="field-label">${label}</label><select class="field field-sm !h-9" data-k="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    root.querySelector('[data-filters]').innerHTML = `
      ${has('range') ? sel('preset', 'Period', PRESETS) : ''}
      ${has('asof') ? `<div><label class="field-label">As of</label><input type="date" class="field field-sm !h-9" data-k="to" value="${esc(f.to || result?.to || '')}"></div>` : ''}
      ${has('range') && f.preset === 'custom' ? `<div><label class="field-label">From</label><input type="date" class="field field-sm !h-9" data-k="from" value="${esc(f.from)}"></div>
        <div><label class="field-label">To</label><input type="date" class="field field-sm !h-9" data-k="to" value="${esc(f.to)}"></div>` : ''}
      ${has('segment') ? sel('segment', 'Department', SEGS) : ''}
      ${has('category') ? sel('category', 'Patient category', CATS) : ''}
      ${has('mode') ? sel('mode', 'Payment mode', MODES) : ''}
      ${has('doctor') ? sel('doctor_id', 'Doctor', [['', 'All doctors'], ...cat.doctors.map((d) => [d.id, d.name])]) : ''}
      ${has('account') ? sel('account_id', 'Account', [['', 'Choose account'], ...cat.accounts.map((a) => [a.id, `${a.code} · ${a.name}`])]) : ''}
      <div class="flex-1"></div>
      <button class="btn-secondary btn-sm" data-xls><span class="material-symbols-outlined text-[16px]">table_view</span>Excel</button>
      <button class="btn-secondary btn-sm" data-csv>CSV</button>
      <button class="btn-secondary btn-sm" data-pdf><span class="material-symbols-outlined text-[16px]">print</span>Print / PDF</button>`;
  }

  let generation = 0, disposed = false;
  async function run(context = {}) {
    const version = ++generation;
    root.querySelectorAll('[data-report]').forEach((b) => {
      b.className = `w-full text-left px-2.5 py-1.5 rounded text-body-md ${b.dataset.report === f.id ? 'bg-primary-fixed text-primary font-semibold' : 'hover:bg-surface-container-low'}`;
      b.setAttribute('aria-current', b.dataset.report === f.id ? 'page' : 'false');
    });
    if (!context.live) filters();
    const out = root.querySelector('[data-out]');
    if (!context.live) out.innerHTML = '<div class="card p-10 text-center text-on-surface-variant">Running report…</div>';
    try {
      const r = cat.reports.find((x) => x.id === f.id);
      const preset = r.filters.includes('asof') ? 'custom' : f.preset;
      const nextResult = await api.get(`/reports/run/${f.id}${qs({ preset, from: preset === 'custom' ? (f.from || f.to) : undefined, to: preset === 'custom' ? f.to : undefined,
        segment: f.segment, category: f.category, mode: f.mode, doctor_id: f.doctor_id, account_id: f.account_id })}`);
      if (disposed || version !== generation) return;
      result = nextResult;
    } catch (err) { if (disposed || version !== generation) return; apiError(err, 'Report failed'); if (!context.live) out.innerHTML = ''; return; }
    disposeChart();
    if (!context.live) Object.assign(view, { search: '', sort: null, dir: 1, page: 0 });
    out.innerHTML = render(result);
    if (context.live && out.querySelector('[data-search]')) out.querySelector('[data-search]').value = view.search;
    drawTable();
    const top = result.chart?.top, key = result.chart?.series?.[0]?.key;
    const data = top ? [...result.rows].sort((a, b) => (+b[key] || 0) - (+a[key] || 0)).slice(0, top) : result.rows;
    disposeChart = result.chart && result.rows.length ? chart(out.querySelector('[data-chart]'), { ...result.chart, data, height: 230 }) : () => {};
    history.replaceState({}, '', `/reports?report=${f.id}`);
  }

  /** Search, sort and paging work on the rows already fetched; totals stay those of the whole report. */
  function visibleRows() {
    let rows = result.rows;
    const s = view.search.trim().toLowerCase();
    if (s) rows = rows.filter((row) => result.columns.some((c) => String(row[c.key] ?? '').toLowerCase().includes(s)));
    if (view.sort) {
      const c = result.columns.find((x) => x.key === view.sort);
      rows = [...rows].sort((a, b) => {
        const x = a[view.sort], y = b[view.sort];
        if (isNum(c)) return ((+x || 0) - (+y || 0)) * view.dir;
        return String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true }) * view.dir;
      });
    }
    return rows;
  }
  function drawTable() {
    const host = root.querySelector('[data-table]');
    if (!host || !result) return;
    const rows = visibleRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    view.page = Math.min(view.page, pages - 1);
    host.innerHTML = table(result, rows.slice(view.page * PAGE, (view.page + 1) * PAGE), view);
    root.querySelector('[data-count]').textContent = `${rows.length === result.rows.length ? rows.length : `${rows.length} of ${result.rows.length}`} rows`;
    root.querySelector('[data-pager]').innerHTML = pages > 1 ? `<span class="text-body-sm text-on-surface-variant">Page ${view.page + 1} of ${pages}</span>
      <button class="btn-secondary btn-sm" data-pg="-1" ${view.page ? '' : 'disabled'}>Previous</button>
      <button class="btn-secondary btn-sm" data-pg="1" ${view.page < pages - 1 ? '' : 'disabled'}>Next</button>` : '';
  }
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-search]')) { view.search = e.target.value; view.page = 0; drawTable(); }
    if (e.target.matches('[data-find]')) {
      const s = e.target.value.trim().toLowerCase();
      root.querySelectorAll('[data-report]').forEach((b) => { b.hidden = !!s && !b.dataset.title.includes(s); });
      root.querySelectorAll('[data-group]').forEach((d) => {
        const any = [...d.querySelectorAll('[data-report]')].some((b) => !b.hidden);
        if (s) d.open = any;
        d.hidden = !!s && !any;
      });
    }
  });

  root.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (th) { view.dir = view.sort === th.dataset.sort ? -view.dir : 1; view.sort = th.dataset.sort; drawTable(); return; }
    const pg = e.target.closest('[data-pg]');
    if (pg) { view.page += +pg.dataset.pg; drawTable(); return; }
    const b = e.target.closest('[data-report]');
    if (b) { f.id = b.dataset.report; run(); return; }
    if (e.target.closest('[data-csv]') && result) downloadCSV(`${result.id}_${result.from}_${result.to}.csv`, plainRows(result));
    if (e.target.closest('[data-xls]') && result) exportExcel(result);
    if (e.target.closest('[data-pdf]') && result) printReport(result);
  });
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    f[k] = e.target.value;
    if (k === 'preset' && f.preset === 'custom') { f.from = result?.from || ''; f.to = result?.to || ''; filters(); return; }
    if ((k === 'from' || k === 'to') && f.preset === 'custom' && !(f.from && f.to)) return;
    run();
  });
  const stop = live({ topics: ['audit', 'billing', 'accounts', 'inventory', 'pharmacy', 'clinical', 'ipd', 'lab', 'imaging', 'admin', 'stores'], load: run });
  return () => { disposed = true; generation++; stop(); disposeChart(); };
}

/* ------------------------------------------------------------------ render */

function cell(c, v) {
  if (v === null || v === undefined || v === '') return '<span class="text-on-surface-variant">—</span>';
  if (c.type === 'money') return Math.abs(+v) < 0.005 ? '<span class="text-on-surface-variant">—</span>' : money(v, 2);
  if (c.type === 'number') return Number(v).toLocaleString('en-IN');
  if (c.type === 'date') return fmtDate(v);
  return esc(v);
}
const isNum = (c) => c.type === 'money' || c.type === 'number';

function render(r) {
  if (r.note) return card({ title: r.title, body: `<p class="text-body-lg text-on-surface-variant">${esc(r.note)}</p>` });
  const period = r.from === r.to ? fmtDate(r.to) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  const filters = [r.segment && `Department ${r.segment}`, r.category && `Category ${r.category}`, r.mode && `Mode ${r.mode}`, r.doctor_id && 'One doctor'].filter(Boolean).join(' · ');
  const kpis = (r.kpis || []).length ? `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">${r.kpis.map((k) => `<div class="card p-3">
      <div class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">${esc(k.label)}</div>
      <div class="text-headline-sm font-semibold tabular-nums mt-0.5">${kpiValue(k)}</div></div>`).join('')}</div>` : '';
  const tools = `<div class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-outline-variant print:hidden">
      <input type="search" class="field field-sm !h-8 max-w-xs" placeholder="Search in this report…" data-search aria-label="Search rows">
      <span class="text-body-sm text-on-surface-variant" data-count></span><div class="flex-1"></div><div class="flex items-center gap-2" data-pager></div></div>`;
  return `<div class="space-y-4">${kpis}
    ${r.chart && r.rows.length ? card({ title: r.title, subtitle: period, body: '<div data-chart class="min-h-[230px]"></div>' }) : ''}
    ${card({ title: r.chart || kpis ? `${r.title} — detail` : r.title, subtitle: `${period}${r.subtitle ? ` · ${esc(r.subtitle)}` : ''}${filters ? ` · ${esc(filters)}` : ''}`, pad: false, body: `${tools}<div data-table></div>` })}</div>`;
}

const kpiValue = (k) => (k.type === 'money' ? money(k.value, 2)
  : k.type === 'pct' ? (k.value === null || k.value === undefined ? '—' : `${Number(k.value).toLocaleString('en-IN')}%`)
  : Number(k.value || 0).toLocaleString('en-IN'));

function table(r, rows, view) {
  const arrow = (c) => (view.sort === c.key ? (view.dir > 0 ? ' ▲' : ' ▼') : '');
  return `<div class="overflow-auto max-h-[62vh]"><table class="tbl"><thead><tr>${r.columns.map((c) => `<th class="${isNum(c) ? 'num' : ''} cursor-pointer select-none" data-sort="${c.key}"
      aria-sort="${view.sort === c.key ? (view.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(c.label)}${arrow(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((row) => `<tr class="${row.bold ? 'font-semibold bg-surface-container-low' : ''}">${r.columns.map((c) => `<td class="${isNum(c) ? 'num' : ''}">${cell(c, row[c.key])}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${r.columns.length}" class="text-center py-10 text-on-surface-variant">No records for this period</td></tr>`}
    ${Object.keys(r.totals || {}).length && r.rows.length ? `<tr class="font-semibold border-t-2 border-outline">${r.columns.map((c, i) => `<td class="${isNum(c) ? 'num' : ''}">${i === 0 ? 'Total (all rows)' : r.totals[c.key] !== undefined ? cell(c, r.totals[c.key]) : ''}</td>`).join('')}</tr>` : ''}
  </tbody></table></div>`;
}

/* ------------------------------------------------------------------ export */

function plainRows(r) {
  const rows = r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c.label || c.key, row[c.key] ?? ''])));
  if (Object.keys(r.totals || {}).length) rows.push(Object.fromEntries(r.columns.map((c, i) => [c.label || c.key, i === 0 ? 'Total' : r.totals[c.key] ?? ''])));
  return rows;
}

const xml = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** SpreadsheetML — opens in Excel with real numbers and a header, no library needed. */
function exportExcel(r) {
  const head = r.columns.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xml(c.label || c.key)}</Data></Cell>`).join('');
  const rowXml = (row, bold) => `<Row>${r.columns.map((c) => {
    const v = row[c.key];
    const style = isNum(c) ? (bold ? ' ss:StyleID="nb"' : ' ss:StyleID="n"') : bold ? ' ss:StyleID="b"' : '';
    if (isNum(c) && v !== '' && v !== null && v !== undefined && !isNaN(+v)) return `<Cell${style}><Data ss:Type="Number">${+v}</Data></Cell>`;
    return `<Cell${style}><Data ss:Type="String">${xml(v)}</Data></Cell>`;
  }).join('')}</Row>`;
  const totals = Object.keys(r.totals || {}).length ? rowXml(Object.fromEntries(r.columns.map((c, i) => [c.key, i === 0 ? 'Total' : r.totals[c.key] ?? ''])), true) : '';
  const doc = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#F1C6CC" ss:Pattern="Solid"/></Style><Style ss:ID="b"><Font ss:Bold="1"/></Style>
<Style ss:ID="n"><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="nb"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="t"><Font ss:Bold="1" ss:Size="13"/></Style></Styles>
<Worksheet ss:Name="${xml(r.title.slice(0, 30))}"><Table>
<Row><Cell ss:StyleID="t"><Data ss:Type="String">${xml(setting('hospital_name', ''))} — ${xml(r.title)}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">${xml(r.from)} to ${xml(r.to)}${r.subtitle ? ` · ${xml(r.subtitle)}` : ''}</Data></Cell></Row>
${(r.kpis || []).map((k) => `<Row><Cell ss:StyleID="b"><Data ss:Type="String">${xml(k.label)}</Data></Cell><Cell ss:StyleID="n"><Data ss:Type="Number">${+k.value || 0}</Data></Cell></Row>`).join('')}<Row/>
<Row>${head}</Row>${r.rows.map((row) => rowXml(row, !!row.bold)).join('')}${totals}</Table></Worksheet></Workbook>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([doc], { type: 'application/vnd.ms-excel' }));
  a.download = `${r.id}_${r.from}_${r.to}.xls`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Excel file downloaded', 'success');
}

function printReport(r) {
  const w = window.open('', '_blank', 'width=1000,height=900');
  if (!w) { toast('Allow pop-ups to print', 'warning'); return; }
  const rows = r.rows.map((row) => `<tr${row.bold ? ' style="font-weight:600;background:#F5F7FA"' : ''}>${r.columns.map((c) => `<td${isNum(c) ? ' style="text-align:right"' : ''}>${cell(c, row[c.key]).replace(/<[^>]+>/g, '')}</td>`).join('')}</tr>`).join('');
  const totals = Object.keys(r.totals || {}).length && r.rows.length
    ? `<tr style="font-weight:700;border-top:2px solid #172B4D">${r.columns.map((c, i) => `<td${isNum(c) ? ' style="text-align:right"' : ''}>${i === 0 ? 'Total' : r.totals[c.key] !== undefined ? cell(c, r.totals[c.key]).replace(/<[^>]+>/g, '') : ''}</td>`).join('')}</tr>` : '';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
    body{font:12px/1.4 Inter,system-ui,sans-serif;color:#172B4D;padding:20px} h1{font-size:17px;margin:0} .sub{color:#526176;margin:2px 0 14px}
    table{width:100%;border-collapse:collapse} th,td{padding:5px 8px;border-bottom:1px solid #D8DFE8;text-align:left} th{background:#F5F7FA;font-size:11px;text-transform:uppercase}
    @page{margin:12mm} thead{display:table-header-group}</style></head><body>
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px;margin-bottom:10px">
      <div><h1>${esc(setting('hospital_name', ''))}</h1><div class="sub" style="margin:0">${esc(r.title)}</div></div>
      <div style="text-align:right" class="sub">${esc(r.from)} to ${esc(r.to)}<br>Printed ${esc(new Date().toLocaleString('en-IN'))}</div></div>
    ${r.subtitle ? `<p class="sub">${esc(r.subtitle)}</p>` : ''}
    ${(r.kpis || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">${r.kpis.map((k) => `<div style="border:1px solid #D8DFE8;border-radius:6px;padding:6px 10px">
      <div style="font-size:10px;text-transform:uppercase;color:#526176">${esc(k.label)}</div><b>${kpiValue(k)}</b></div>`).join('')}</div>` : ''}
    <table><thead><tr>${r.columns.map((c) => `<th${isNum(c) ? ' style="text-align:right"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows}${totals}</tbody></table>
    </body></html>`);
  w.document.close();
  w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 250);
}
