import { printedReference } from '../lab-print.js';
import { openLabManual } from '../lab-manual.js';
import { printLetterhead } from '../ui.js';
/**
 * Laboratory & Diagnostics.
 *
 * Order received → billing status visible → specimen collection → processing →
 * result entry → authorised verification → report. Each step is a separate,
 * visible state; nothing is inferred.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  apiError, busy, api, qs, state, can, navigate, downloadCSV, setting,
  $, $$, esc, bind, toast, modal, drawer, confirmDialog, renderRows, pill, priorityPill, flagPill,
  money, fmtDate, fmtDateTime, fmtTime, ago, mins, kpi, spinner, emptyState, printDocument, todayISO,
  clearancePill, headCount,
} from './_kit.js';

import { canEditLabTemplates, openLabTemplates } from '../lab-templates.js';
import { departmentEntersTests, openDiagnosticsBilling } from '../reception-diagnostics.js';
import { mountAttachments } from '../attachments.js';
import { recordReportDialog } from '../outsource.js';
import { printTubeLabel } from '../labels.js';
import { autoPrintsSampleLabels } from '../store.js';
import { qrSVG } from '../qr.js';
let f = { status: 'open', priority: '', q: '', date: '' };
/** Settings → Investigation release → Straight away: tests start before reception collects. */
const startNow = () => setting('release_op_rule', 'payment') === 'immediate';
let cache = [];

export async function mount(ctx) {
  // Template editing is restricted to the lab in-charge and administrators.
  const root = mountPage(ctx, layout());
  bind(root,'click','[data-lab-manual]',openLabManual);
  bind(root, 'click', '[data-lab-templates]', () => openLabTemplates());
  bind(root,'click','[data-completed-reports]',()=>{
    f.status='verified';
    $$('[data-f="status"]',root).forEach(select=>{select.value='verified';});
    load();
  });
  bind(root, 'click', '[data-paper-request]', () => openDiagnosticsBilling(() => load(), { department: 'lab' }));
  const linkedOrder = +(ctx.query.order || (ctx.params[0]==='order' ? ctx.params[1] : 0));
  if(linkedOrder>0)openResultEntry(linkedOrder,()=>{},true);
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [{ rows, counts }, stats] = await Promise.all([
      api.get(`/lab/worklist${qs(f)}`), api.get('/lab/stats'),
    ]);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Open workload', value: rows.filter(r => !['verified', 'cancelled'].includes(r.status)).length, icon: 'science', sub: `${rows.filter(r => r.priority === 'stat' && !['verified', 'cancelled'].includes(r.status)).length} STAT · ${counts.awaiting_payment} awaiting payment` },
      { label: 'Awaiting verification', value: counts.reported, icon: 'fact_check', tone: counts.reported ? 'warning' : 'success', sub: 'Results entered, not authorised' },
      { label: 'Critical values', value: counts.critical, icon: 'e911_emergency', tone: counts.critical ? 'danger' : 'success', sub: 'Flagged to the treating doctor' },
      { label: 'Average TAT (7 days)', value: mins(stats.avg_tat), icon: 'timer', tone: counts.tat_breached ? 'warning' : 'info', sub: `${counts.tat_breached} breaching now` },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'The laboratory worklist is clear.' });
    $('[data-count]', root).textContent = `${rows.length} order(s)`;
    headCount(root, `${rows.filter((r) => !['verified', 'cancelled'].includes(r.status)).length} open · ${counts.reported} to verify`);
    $('[data-stages]', root).innerHTML = stageStrip(counts);
  }

  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    if (act === 'collect') {
      try {
        const r = await api.post(`/lab/orders/${id}/collect`, {});
        toast(`Sample ${r.sample_id || ''} collected${r.accession_no ? ` · ${r.accession_no}` : ''}${r.consumables_short?.length ? ` — not in LAB store: ${r.consumables_short.map((x) => x.name).join(', ')}` : ''}`, r.consumables_short?.length ? 'warning' : 'success');
        load(); if (autoPrintsSampleLabels()) printTubeLabel(id).catch(() => {});
      } catch (err) { apiError(err, 'Cannot collect this sample yet'); }
    }
    if (act === 'label') printTubeLabel(id).catch((err) => apiError(err));
    if (act === 'visitreport') printVisitReports(+b.dataset.enc).catch((err) => apiError(err, 'Could not print the visit report'));
    if (act === 'recollect') {
      const r = await confirmDialog({ title: 'Collect the sample again?', message: 'The order goes back to "to collect" with a new sample number. The reason is kept in the audit trail.', confirmLabel: 'Recollect', requireReason: true, reasonLabel: 'Why (haemolysed, clotted, wrong tube, insufficient …)' });
      if (!r) return;
      try { await api.post(`/lab/orders/${id}/recollect`, { reason: r.reason }); toast('Sent back for recollection', 'info'); load(); } catch (err) { apiError(err); }
    }
    if (act === 'start') { await api.patch(`/orders/${id}`, { status: 'in_progress' }); load(); }
    if (act === 'enter') openResultEntry(id, load);
    if (act === 'verify') {
      const r = await confirmDialog({ title: 'Authorise this report?', message: 'Verification releases the report to the treating doctor and the patient record.', confirmLabel: 'Verify & release' });
      if (!r) return;
      try { await api.post(`/lab/orders/${id}/verify`, {}); toast('Report verified and released', 'success'); load(); openResultEntry(id,load,true); }
      catch (err) { apiError(err, 'Could not verify'); }
    }
    if (act === 'report') await printReport(id);
    if (act === 'view') openResultEntry(id, load, true);
  });
  bind(root, 'click', '[data-stage-filter]', (e, b) => {
    f.status = b.dataset.stageFilter;
    $$('[data-f="status"]', root).forEach((s) => { s.value = f.status; });
    load();
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`lab-worklist-${todayISO()}.csv`, cache.map((r) => ({
    order: r.order_no, sample: r.sample_id, uhid: r.uhid, patient: r.patient_name, test: r.label,
    priority: r.priority, status: r.status, bill: r.bill_status, ordered: r.ordered_at,
    age_minutes: r.age_minutes, tat_minutes: r.tat_minutes, critical: r.critical_count,
  }))));

  return live({ topics: ['lab', 'clinical'], events: ['orders.created', 'order.updated', 'lab.reported', 'lab.verified', 'lab.critical', 'payment.received', 'bill.authorized', 'claim.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Laboratory', 'science')} ${liveChip()}`,
    title: 'Laboratory & Diagnostics',
    subtitle: 'Test orders from doctors, reception and paper requests, with their status.',
    actions: `<button class="btn-secondary" data-lab-manual>Lab manual & specimen guide</button><button class="btn-primary" data-completed-reports>Completed reports / Print</button>${departmentEntersTests() ? '<button class="btn-secondary" data-paper-request title="A patient brought a paper test request straight here"><span class="material-symbols-outlined text-[18px]">note_add</span> Paper request</button>' : ''}${canEditLabTemplates() ? '<button class="btn-secondary" data-lab-templates>Manage templates</button>' : ''}<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export worklist</button>`,
    body: `
      ${kpiRow([], 4)}
      ${card({ title: 'Workflow', body: `<div data-stages></div>` })}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Order, sample id, patient or UHID' },
        { type: 'select', key: 'status', label: 'Stage', value: f.status, options: [
          { value: 'open', label: 'All open' }, { value: 'all', label: 'Everything' },
          { value: 'awaiting_payment', label: 'Awaiting payment' }, { value: 'ordered', label: 'Ordered' },
          { value: 'collected', label: 'Collected' }, { value: 'in_progress', label: 'In progress' },
          { value: 'reported', label: 'Reported' }, { value: 'verified', label: 'Verified' }] },
        { type: 'select', key: 'priority', label: 'Priority', value: f.priority, options: [
          { value: '', label: 'Any' }, { value: 'stat', label: 'STAT' }, { value: 'urgent', label: 'Urgent' }, { value: 'routine', label: 'Routine' }] },
        { type: 'date', key: 'date', label: 'Ordered on', value: f.date, width: 'w-[150px]' },
      ])}
      ${tableCard({
        title: 'Worklist', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '58vh',
        columns: [{ label: 'Order / sample', width: '170px' }, { label: 'Patient' }, { label: 'Test' },
          { label: 'Priority' }, { label: 'Billing' }, { label: 'Work state' },
          { label: 'Age / TAT' }, { label: '', width: '190px' }],
      })}`,
  });
}

function stageStrip(c) {
  const steps = [['awaiting_payment', 'Awaiting payment', c.awaiting_payment, 'payments'],
    ['ordered', 'Ordered', c.ordered, 'assignment'], ['collected', 'Collected', c.collected, 'science'],
    ['in_progress', 'Processing', c.in_progress, 'progress_activity'], ['reported', 'Reported', c.reported, 'description'],
    ['verified', 'Verified', c.verified, 'verified']];
  return `<div class="grid grid-cols-2 md:grid-cols-6 gap-2">
    ${steps.map(([k, label, n, icon]) => `
      <button class="text-left p-2.5 rounded-lg border border-outline-variant hover:border-primary/50 transition-colors"
              data-stage-filter="${k}">
        <div class="flex items-center gap-1.5 text-on-surface-variant">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
          <span class="font-label-md text-label-md uppercase tracking-wider">${label}</span></div>
        <div class="font-headline-lg text-headline-lg mt-0.5 tnum">${n}</div>
      </button>`).join('')}</div>`;
}

function rowHTML(r) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(r.order_no)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.sample_id || 'no sample id')}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}
        ${r.token_no ? ` · Tok ${r.token_no}` : ''}</div></td>
    <td><div class="text-body-md">${esc(r.label)}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.sample_type || '')}</div></td>
    <td>${priorityPill(r.priority)}</td>
    <td>${clearancePill(r.clearance, r)}</td>
    <td>${pill(r.status)}
      ${r.critical_count ? `<span class="pill-danger pill-dot">${r.critical_count} critical</span>` : ''}
      ${!r.critical_count && r.abnormal_count ? `<span class="pill-warning pill-dot">${r.abnormal_count} abnormal</span>` : ''}</td>
    <td><div class="font-data-mono text-body-sm ${r.tat_breached ? 'text-danger font-bold' : ''}">${mins(r.age_minutes)}</div>
      <div class="text-label-sm text-on-surface-variant">target ${r.tat_minutes ? mins(r.tat_minutes) : '—'}</div></td>
    <td class="text-right whitespace-nowrap">
      ${['unpaid', 'part_paid'].includes(r.clearance) && !['verified'].includes(r.status) ? `<span class="text-body-sm ${startNow() ? 'text-on-surface-variant' : 'text-danger'}">${startNow() ? 'Patient pays at reception' : 'Send to reception'}</span>` : ''}
      ${r.status === 'ordered' && can('lab.collect') && (startNow() || !['unpaid', 'part_paid'].includes(r.clearance)) ? `<button class="btn-primary btn-xs" data-act="collect">Collect</button>` : ''}
      ${['reported', 'verified', 'completed'].includes(r.status) && r.encounter_id ? `<button class="btn-ghost btn-xs" data-act="visitreport" data-enc="${r.encounter_id}" title="Print every reported test of this visit on one report, by category"><span class="material-symbols-outlined text-[15px]">print</span> Print all on one paper</button>` : ''}
      ${['ordered', 'collected', 'in_progress'].includes(r.status) && can('lab.collect') ? `<button class="btn-ghost btn-xs" data-act="label" title="Print the tube label"><span class="material-symbols-outlined text-[15px]">barcode</span></button>` : ''}
      ${['collected', 'in_progress'].includes(r.status) && can('lab.collect') ? `<button class="btn-ghost btn-xs" data-act="recollect" title="Sample rejected — collect again">Recollect</button>` : ''}
      ${r.status === 'collected' && can('lab.result') ? `<button class="btn-secondary btn-xs" data-act="start">Start</button>` : ''}
      ${['collected', 'in_progress'].includes(r.status) && can('lab.result') ? `<button class="btn-primary btn-xs" data-act="enter">Enter results</button>` : ''}
      ${r.status === 'reported' ? `<button class="btn-secondary btn-xs" data-act="enter">Edit</button>` : ''}
      ${r.status === 'verified' ? `<button class="btn-primary btn-xs" data-act="report">Report / Print</button>
        <button class="btn-ghost btn-xs" data-act="view"><span class="material-symbols-outlined text-[15px]">visibility</span></button>` : ''}
    </td>`;
}

/* -------------------------------------------------------- result entry */

function openResultEntry(orderId, after, readOnly = false) {
  (async () => {
    const o = await api.get(`/lab/orders/${orderId}`);
    const byParam = new Map(o.results.map((r) => [r.param_id ?? r.name, r]));
    const params = o.params.length ? o.params
      : o.results.map((r) => ({ id: r.param_id, name: r.name, unit: r.unit, ref_text: r.ref_range }));
    const priorFor = (name) => o.history.filter((h) => h.name === name).slice(0, 3);

    modal({
      title: o.label,
      subtitle: `${esc(o.patient_name)} · ${esc(o.uhid)} · ${o.age_years ?? '—'}y ${esc(o.gender || '')} · sample ${esc(o.sample_id || '—')}`,
      size: 'lg',
      body: `
        <div class="flex flex-wrap items-center gap-2 mb-3">
          ${pill(o.status)} ${priorityPill(o.priority)}
          <span class="text-body-sm text-on-surface-variant">Requested by ${esc(o.requested_by_name || o.ordered_by_name || '—')}${o.requested_by_name && o.requested_by_name !== o.ordered_by_name && o.ordered_by_name ? ` · entered by ${esc(o.ordered_by_name)}` : ''} · ${fmtDateTime(o.ordered_at)}</span>
        </div>
        ${(o.patient?.allergies || []).length ? `<div class="mb-3 p-2 rounded bg-danger-bg text-danger text-body-md">
          Allergies: ${o.patient.allergies.map((a) => esc(a.substance)).join(', ')}</div>` : ''}
        <table class="tbl" data-rt>
          <thead><tr><th>Parameter</th><th style="width:150px">Result</th><th style="width:90px">Unit</th>
            <th style="width:140px">Reference</th><th style="width:110px">Flag</th><th style="width:130px">Previous</th></tr></thead>
          <tbody>${params.map((p) => {
            if (p.result_type === 'heading') return `<tr data-p="${p.id}" data-name="${esc(p.name)}" data-heading="1"><td colspan="6" class="bg-surface-container-low font-label-lg text-label-lg uppercase tracking-wide">${esc(p.name)}</td></tr>`;
            const r = byParam.get(p.id ?? p.name) || {};
            const prior = priorFor(p.name);
            return `<tr data-p="${p.id ?? ''}" data-name="${esc(p.name)}">
              <td class="font-label-lg text-label-lg">${esc(p.name)}</td>
              <td><input class="field field-sm min-w-[5.5rem]" data-v value="${esc(r.value ?? '')}" ${readOnly ? 'readonly' : ''}
                    data-result-type="${esc(p.result_type || 'numeric')}" data-lo="${p.ref_low ?? ''}" data-hi="${p.ref_high ?? ''}" data-critical-lo="${p.crit_low ?? ''}" data-critical-hi="${p.crit_high ?? ''}"></td>
              <td class="text-body-sm text-on-surface-variant">${esc(p.unit || '')}</td>
              <td class="text-body-sm text-on-surface-variant">${esc(p.ref_text || '')}</td>
              <td data-flag>${flagPill(r.flag)}</td>
              <td class="font-data-mono text-label-sm text-on-surface-variant">${prior.map((h) => esc(h.value)).join(' · ') || '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        <p class="text-body-sm text-on-surface-variant mt-3">Values outside the reference range are flagged automatically;
          configured critical limits trigger an alert to the treating doctor.</p>
        ${o.provider_id ? '' : `<label class="field-label mt-3">Remarks for this report (optional)</label>
        <textarea class="field" rows="3" maxlength="4000" data-remarks ${readOnly ? 'readonly' : ''} placeholder="e.g. RBCs: normocytic normochromic. WBCs: lymphocytic predominance. Platelets: adequate, clumps seen.">${esc(o.lab_remarks || '')}</textarea>
        <p class="text-body-sm text-on-surface-variant mt-1">Prints on this patient's report only. The test's standard interpretation is set in Lab templates.</p>`}
        ${o.provider_id ? '<div class="mt-3 p-2 rounded bg-info-bg text-body-md">Sent to an outside laboratory. The sample was collected here, so there are no results to type — attach the report they send back and record it. A signatory then checks and accepts it on the Outsourcing desk; it is always shown as their report.</div>' : ''}
        <div class="mt-4 pt-3 border-t border-outline-variant" data-attach></div>`,
      footer: readOnly
        ? `<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-print>Print report</button>`
        : o.provider_id
          ? `<button class="btn-secondary" data-close>Close</button>
             ${can('lab.result') ? '<button class="btn-primary" data-record-outside>Record outside report</button>' : ''}`
        : `<button class="btn-secondary" data-close>Cancel</button>
           <button class="btn-primary" data-save-verify>Save & release report</button>`,
      onMount(root, close) {
        mountAttachments(root.querySelector('[data-attach]'), 'order', orderId, { canEdit: !readOnly && can('lab.result') });
        root.querySelector('[data-record-outside]')?.addEventListener('click', () => {
          close(); recordReportDialog({ ...o, id: orderId, provider_name: o.provider_name || '' }, () => after?.());
        });
        // live flagging
        root.querySelectorAll('[data-v]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const lo = parseFloat(inp.dataset.lo), hi = parseFloat(inp.dataset.hi), v = parseFloat(inp.value);
            let flag = '';
            if (inp.dataset.resultType !== 'text' && !isNaN(v)) {
              const criticalLo=parseFloat(inp.dataset.criticalLo),criticalHi=parseFloat(inp.dataset.criticalHi);
              if ((!isNaN(criticalLo) && v<=criticalLo) || (!isNaN(criticalHi) && v>=criticalHi)) flag='critical';
              else if (!isNaN(lo) && v < lo) flag = 'low';
              else if (!isNaN(hi) && v > hi) flag = 'high';
            }
            inp.closest('tr').querySelector('[data-flag]').innerHTML = flagPill(flag);
            inp.classList.toggle('field-error', flag === 'critical');
          });
        });
        const collect = () => [...root.querySelectorAll('[data-rt] tbody tr')].map((tr) => ({
          param_id: tr.dataset.p || null, name: tr.dataset.name, heading: !!tr.dataset.heading,
          value: tr.dataset.heading ? '' : tr.querySelector('[data-v]').value,
        })).filter((r) => r.heading || r.value !== '');
        const post = async (verify, btn) => {
          busy(btn, true, 'Saving');
          try {
            await api.post(`/lab/orders/${orderId}/results`, { results: collect(), verify, remarks: root.querySelector('[data-remarks]')?.value ?? '' });
            close(); toast('Results saved and report released', 'success');
            after?.();
            if(verify) openResultEntry(orderId,after,true);
          } catch (e) { apiError(e, 'Could not save results'); busy(btn, false); }
        };
        root.querySelector('[data-save]')?.addEventListener('click', (e) => post(false, e.currentTarget));
        root.querySelector('[data-save-verify]')?.addEventListener('click', (e) => post(true, e.currentTarget));
        root.querySelector('[data-print]')?.addEventListener('click', () => printReport(orderId));
      },
    });
  })().catch(e=>apiError(e,'Could not open lab result'));
}


/** Report categories in print order (same list as server/lab-catalog-data.js SECTION_ORDER). */
const LAB_SECTION_ORDER = ['Haematology', 'Biochemistry', 'Serology & Immunology', 'Clinical Pathology', 'Cytology',
  'Microbiology', 'Endocrinology', 'Histopathology', 'Others', 'Miscellaneous'];
const sectionRank = (s) => { const i = LAB_SECTION_ORDER.indexOf(s || ''); return i < 0 ? LAB_SECTION_ORDER.length : i; };

export async function printReport(orderId) { return printReports([orderId]); }

/** Every reported test of a visit on one report, grouped by category in print order. */
export async function printVisitReports(encounterId) {
  const rows = await api.get(`/lab/encounter/${encounterId}/reports`);
  if (!rows.length) { toast('No reported tests on this visit yet', 'info'); return; }
  return printReports(rows.map((r) => r.id));
}

/**
 * One printed report for one or more tests of the same patient: a single letterhead and patient
 * strip, the tests grouped under their category (Haematology → Biochemistry → … → Miscellaneous)
 * and, within a category, in the order they were requested; one signature block at the end.
 */
export async function printReports(orderIds) {
  const all = await Promise.all(orderIds.map((id) => api.get(`/lab/report/${id}`)));
  const tests = all.map((d, i) => ({ d, i })).sort((a, b) => sectionRank(a.d.lab_section) - sectionRank(b.d.lab_section) || a.i - b.i).map((x) => x.d);
  const d = tests[0], s = d.settings || {};
  // QR on every printed report: a random link to the released report (hospital network, or the cloud when one is connected)
  let qr = '';
  try {
    const share = await api.post('/lab/shares', { order_ids: orderIds.map(Number) });
    const when = share.expires_at ? new Date(`${share.expires_at}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    qr = `<td rowspan="3" style="border:0;padding:0 0 0 8px;width:92px;text-align:center;vertical-align:top">${qrSVG(share.url, { size: 84 })}
      <div style="font-size:8px;color:#526176;line-height:1.25">${share.download_enabled ? 'Scan to view / download' : 'Scan to verify'}${share.scope === 'cloud' ? '' : '<br>(hospital network)'}${when && share.download_enabled ? `<br>valid until ${when}` : ''}</div></td>`;
  } catch { /* the report prints without it */ }
  const cell = 'padding:6px;border-bottom:1px solid #EEF2F7';
  // the unit has its own column: drop a trailing unit from the reference text
  const refOnly = (r) => { const ref = String(r.ref_range || '').trim(), u = String(r.unit || '').trim(); return u && ref.endsWith(u) ? ref.slice(0, -u.length).trim() : ref; };
  const flagStyle = (r) => (r.flag ? 'font-weight:700' : '');   // out of range = bold only; no flag column, no colour
  const para = (title, text) => text ? `<div style="margin-top:10px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;page-break-inside:auto"><b style="font-size:12px">${esc(title)}</b><br>${esc(text)}</div>` : '';
  const block = (t) => `
    <div style="margin-top:12px;page-break-inside:auto">
      <div style="font-size:13px;font-weight:700">${esc(t.service_name || t.label)}<span style="font-weight:400;color:#526176;font-size:11px"> · ${esc(t.order_no)}</span></div>
      ${t.sample_type ? `<div style="margin-top:3px;font-size:11px"><b>Sample type:</b> ${esc(t.sample_type)}</div>` : ''}
      <table class="lab-res" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px">
        <thead><tr style="background:#F5F7FA">
          <th style="text-align:left;padding:6px;border-bottom:1px solid #D8DFE8">Test / parameter</th>
          <th style="text-align:right;padding:6px;border-bottom:1px solid #D8DFE8">Result</th>
          <th style="text-align:left;padding:6px;border-bottom:1px solid #D8DFE8">Unit</th>
          <th style="text-align:left;padding:6px;border-bottom:1px solid #D8DFE8">Bio. ref. interval</th></tr></thead>
        <tbody>${t.results.map((r) => r.param_type === 'heading' ? `<tr><td colspan="4" style="${cell};font-weight:700;padding-top:9px">${esc(r.name)}</td></tr>` : `<tr>
          <td style="${cell}">${esc(r.name)}${r.method ? `<div style="font-size:10px;color:#526176">Method: ${esc(r.method)}</div>` : ''}${r.interpretation ? `<div style="font-size:10px">${esc(r.interpretation)}</div>` : ''}</td>
          <td style="${cell};text-align:right;${flagStyle(r)}">${esc(r.value)}</td>
          <td style="${cell};color:#526176">${esc(r.unit || '')}</td>
          <td style="${cell};color:#526176">${esc(refOnly(r))}</td></tr>`).join('')}
        </tbody></table>
      ${para('Remarks', t.lab_remarks)}
      ${para(t.test_comment_title || 'Interpretation', t.test_comment)}
      ${tests.length === 1 ? para('Test information', t.test_description) : ''}
    </div>`;
  // category banners in print order
  let body = '', last = null;
  for (const t of tests) {
    const sec = t.lab_section || 'Others';
    if (sec !== last) { body += `<div style="margin-top:16px;padding:4px 8px;background:#EEF2F7;text-align:center;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${esc(sec)}</div>`; last = sec; }
    body += block(t);
  }
  const verifiers = [...new Map(tests.filter((t) => t.verified_by_name).map((t) => [t.verified_by_name, t])).values()];
  const pending = tests.some((t) => !t.verified_at);
  const latest = tests.map((t) => t.completed_at).filter(Boolean).sort().pop();
  const title = tests.length === 1 ? `${d.label} — ${d.patient_name}` : `Laboratory report — ${d.patient_name}`;
  // The <thead> / <tfoot> of the outer table repeat on every printed page, so each page carries
  // the hospital banner, address, patient strip and the report footer.
  printDocument(title, `
    <style>
      .lab-page{width:100%;border-collapse:collapse;font-family:Inter,Segoe UI,sans-serif;color:#172B4D}
      .lab-page>thead>tr>td,.lab-page>tfoot>tr>td,.lab-page>tbody>tr>td{border:0;padding:0}
      .lab-page>thead{display:table-header-group}.lab-page>tfoot{display:table-footer-group}
      .lab-res tr{page-break-inside:avoid}
      @media print{body{padding:0!important}}
    </style>
    <table class="lab-page" style="max-width:760px;margin:0 auto">
      <thead><tr><td>
        ${printLetterhead('LABORATORY REPORT', tests.length === 1 ? d.order_no : d.encounter_no || d.order_no)}
        <table style="width:100%;font-size:11px;margin:6px 0 4px;border-collapse:collapse">
          <tr><td style="border:0;padding:1px 4px;color:#526176;width:80px">Patient</td><td style="border:0;padding:1px 4px"><b>${esc(d.patient_name)}</b></td>
              <td style="border:0;padding:1px 4px;color:#526176;width:80px">UHID</td><td style="border:0;padding:1px 4px">${esc(d.uhid)}</td>${qr}</tr>
          <tr><td style="border:0;padding:1px 4px;color:#526176">Age / sex</td><td style="border:0;padding:1px 4px">${d.age_years ?? '—'} / ${esc(d.gender || '')}</td>
              <td style="border:0;padding:1px 4px;color:#526176">Sample</td><td style="border:0;padding:1px 4px">${esc([...new Set(tests.map((t) => t.sample_id).filter(Boolean))].join(', ') || '—')}</td></tr>
          <tr><td style="border:0;padding:1px 4px;color:#526176">Referred by</td><td style="border:0;padding:1px 4px">${esc(d.referred_by_name || '—')}</td>
              <td style="border:0;padding:1px 4px;color:#526176">Reported</td><td style="border:0;padding:1px 4px">${esc(latest ? fmtDateTime(latest) : '')}${pending ? ' · Provisional' : ' · Final'}</td></tr>
        </table>
        <div style="border-bottom:1px solid #D8DFE8"></div>
      </td></tr></thead>
      <tfoot><tr><td>
        <div style="margin-top:10px;border-top:1px solid #D8DFE8;padding-top:4px;font-size:9px;color:#526176;display:flex;justify-content:space-between">
          <span>${esc(s.hospital_name || '')} · ${esc(tests.length === 1 ? d.order_no : `${tests.length} tests`)} · ${esc(d.patient_name)} (${esc(d.uhid)})</span><span>Computer-generated report</span></div>
      </td></tr></tfoot>
      <tbody><tr><td>
        ${body}
        <div style="margin-top:36px;display:flex;justify-content:space-between;gap:16px;font-size:11px;page-break-inside:avoid">
          <div>Technician: ${esc([...new Set(tests.flatMap((t) => t.results.map((r) => r.technician)).filter(Boolean))].join(', ') || '—')}<br>
            ${pending ? 'Some results are pending authorisation' : `Verified ${esc(fmtDateTime(tests.map((t) => t.verified_at).sort().pop()))}`}</div>
          ${(verifiers.length ? verifiers : [d]).map((v) => `<div style="text-align:center">_______________________<br><b>${esc(v.verified_by_name || '')}</b><br>
            <span style="color:#526176">${esc(v.verified_by_qual || '')}${v.verified_by_reg ? ` · Reg ${esc(v.verified_by_reg)}` : ''}</span></div>`).join('')}
        </div>
        <div style="margin-top:14px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.05em">*** End of report ***</div>
        ${s.lab_report_disclaimer ? `<div style="margin-top:8px;border:1px solid #526176;padding:6px 10px;font-size:9.5px;line-height:1.5;page-break-inside:avoid"><b>Disclaimer</b><ol style="margin:3px 0 0 16px;padding:0">${String(s.lab_report_disclaimer).split(/\s*\d+\)\s*/).map((x) => x.trim()).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
      </td></tr></tbody>
    </table>`);
}
