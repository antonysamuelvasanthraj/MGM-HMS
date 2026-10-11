/**
 * Laboratory & Diagnostics.
 *
 * Order received → billing status visible → specimen collection → processing →
 * result entry → authorised verification → report. Each step is a separate,
 * visible state; nothing is inferred.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  apiError, busy, api, qs, state, can, navigate, downloadCSV,
  $, $$, esc, bind, toast, modal, drawer, confirmDialog, renderRows, pill, priorityPill, flagPill,
  money, fmtDate, fmtDateTime, fmtTime, ago, mins, kpi, spinner, emptyState, printDocument, todayISO,
  clearancePill,
} from './_kit.js';

let f = { status: 'open', priority: '', q: '', date: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  const linkedOrder = +(ctx.query.order || (ctx.params[0]==='order' ? ctx.params[1] : 0));
  if(linkedOrder>0)openResultEntry(linkedOrder,()=>{},true);
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [{ rows, counts }, stats] = await Promise.all([
      api.get(`/lab/worklist${qs(f)}`), api.get('/lab/stats'),
    ]);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Open workload', value: counts.total, icon: 'science', sub: `${counts.stat} STAT · ${counts.awaiting_payment} awaiting payment` },
      { label: 'Awaiting verification', value: counts.reported, icon: 'fact_check', tone: counts.reported ? 'warning' : 'success', sub: 'Results entered, not authorised' },
      { label: 'Critical values', value: counts.critical, icon: 'e911_emergency', tone: counts.critical ? 'danger' : 'success', sub: 'Flagged to the treating doctor' },
      { label: 'Average TAT (7 days)', value: mins(stats.avg_tat), icon: 'timer', tone: counts.tat_breached ? 'warning' : 'info', sub: `${counts.tat_breached} breaching now` },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'The laboratory worklist is clear.' });
    $('[data-count]', root).textContent = `${rows.length} order(s)`;
    $('[data-stages]', root).innerHTML = stageStrip(counts);
  }

  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    if (act === 'collect') {
      try { await api.post(`/lab/orders/${id}/collect`, {}); toast('Sample marked collected', 'success'); load(); }
      catch (err) { apiError(err, 'Cannot collect this sample yet'); }
    }
    if (act === 'start') { await api.patch(`/orders/${id}`, { status: 'in_progress' }); load(); }
    if (act === 'enter') openResultEntry(id, load);
    if (act === 'verify') {
      const r = await confirmDialog({ title: 'Authorise this report?', message: 'Verification releases the report to the treating doctor and the patient record.', confirmLabel: 'Verify & release' });
      if (!r) return;
      try { await api.post(`/lab/orders/${id}/verify`, {}); toast('Report verified and released', 'success'); load(); }
      catch (err) { apiError(err, 'Could not verify'); }
    }
    if (act === 'report') printReport(id);
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
    subtitle: 'Billing status is visible but never blocks clinical visibility — a held order shows exactly why it is waiting.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export worklist</button>`,
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
      ${['unpaid', 'part_paid'].includes(r.clearance) && !['verified'].includes(r.status) ? `<span class="text-body-sm text-danger">Send to reception</span>` : ''}
      ${r.status === 'ordered' && can('lab.collect') && !['unpaid', 'part_paid'].includes(r.clearance) ? `<button class="btn-primary btn-xs" data-act="collect">Collect</button>` : ''}
      ${r.status === 'collected' && can('lab.result') ? `<button class="btn-secondary btn-xs" data-act="start">Start</button>` : ''}
      ${['collected', 'in_progress'].includes(r.status) && can('lab.result') ? `<button class="btn-primary btn-xs" data-act="enter">Enter results</button>` : ''}
      ${r.status === 'reported' && can('lab.verify') ? `<button class="btn-primary btn-xs" data-act="verify">Verify</button>` : ''}
      ${r.status === 'reported' ? `<button class="btn-secondary btn-xs" data-act="enter">Edit</button>` : ''}
      ${r.status === 'verified' ? `<button class="btn-secondary btn-xs" data-act="report">Report</button>
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
          <span class="text-body-sm text-on-surface-variant">Ordered by ${esc(o.ordered_by_name || '—')} · ${fmtDateTime(o.ordered_at)}</span>
        </div>
        ${(o.patient?.allergies || []).length ? `<div class="mb-3 p-2 rounded bg-danger-bg text-danger text-body-md">
          Allergies: ${o.patient.allergies.map((a) => esc(a.substance)).join(', ')}</div>` : ''}
        <table class="tbl" data-rt>
          <thead><tr><th>Parameter</th><th style="width:150px">Result</th><th style="width:90px">Unit</th>
            <th style="width:140px">Reference</th><th style="width:110px">Flag</th><th style="width:130px">Previous</th></tr></thead>
          <tbody>${params.map((p) => {
            const r = byParam.get(p.id ?? p.name) || {};
            const prior = priorFor(p.name);
            return `<tr data-p="${p.id ?? ''}" data-name="${esc(p.name)}">
              <td class="font-label-lg text-label-lg">${esc(p.name)}</td>
              <td><input class="field field-sm min-w-[5.5rem]" data-v value="${esc(r.value ?? '')}" ${readOnly ? 'readonly' : ''}
                    data-lo="${p.ref_low ?? ''}" data-hi="${p.ref_high ?? ''}"></td>
              <td class="text-body-sm text-on-surface-variant">${esc(p.unit || '')}</td>
              <td class="text-body-sm text-on-surface-variant">${esc(p.ref_text || '')}</td>
              <td data-flag>${flagPill(r.flag)}</td>
              <td class="font-data-mono text-label-sm text-on-surface-variant">${prior.map((h) => esc(h.value)).join(' · ') || '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        <p class="text-body-sm text-on-surface-variant mt-3">Values outside the reference range are flagged automatically;
          a grossly abnormal value is flagged <strong>critical</strong> and pushed to the treating doctor.</p>`,
      footer: readOnly
        ? `<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-print>Print report</button>`
        : `<button class="btn-secondary" data-close>Cancel</button>
           <button class="btn-secondary" data-save>Save as reported</button>
           ${can('lab.verify') ? `<button class="btn-primary" data-save-verify>Save & verify</button>` : ''}`,
      onMount(root, close) {
        // live flagging
        root.querySelectorAll('[data-v]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const lo = parseFloat(inp.dataset.lo), hi = parseFloat(inp.dataset.hi), v = parseFloat(inp.value);
            let flag = '';
            if (!isNaN(v)) {
              if (!isNaN(lo) && v < lo) flag = v < lo * 0.5 ? 'critical' : 'low';
              else if (!isNaN(hi) && v > hi) flag = v > hi * 1.8 ? 'critical' : 'high';
            }
            inp.closest('tr').querySelector('[data-flag]').innerHTML = flagPill(flag);
            inp.classList.toggle('field-error', flag === 'critical');
          });
        });
        const collect = () => [...root.querySelectorAll('[data-rt] tbody tr')].map((tr) => ({
          param_id: tr.dataset.p || null, name: tr.dataset.name,
          value: tr.querySelector('[data-v]').value,
        })).filter((r) => r.value !== '');
        const post = async (verify, btn) => {
          busy(btn, true, 'Saving');
          try {
            await api.post(`/lab/orders/${orderId}/results`, { results: collect(), verify });
            close(); toast(verify ? 'Results saved and verified' : 'Results saved — awaiting verification', 'success');
            after?.();
          } catch (e) { apiError(e, 'Could not save results'); busy(btn, false); }
        };
        root.querySelector('[data-save]')?.addEventListener('click', (e) => post(false, e.currentTarget));
        root.querySelector('[data-save-verify]')?.addEventListener('click', (e) => post(true, e.currentTarget));
        root.querySelector('[data-print]')?.addEventListener('click', () => printReport(orderId));
      },
    });
  })().catch(e=>apiError(e,'Could not open lab result'));
}

export async function printReport(orderId) {
  const d = await api.get(`/lab/report/${orderId}`);
  const s = d.settings || {};
  printDocument(`${d.label} — ${d.patient_name}`, `
    <div style="max-width:740px;margin:0 auto;font-family:Inter,Segoe UI,sans-serif;color:#172B4D">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px">
        <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(s.hospital_name || '')}</div>
          <div style="font-size:11px;color:#526176">${esc(s.address || '')}${s.phone ? `<br>Phone: ${esc(s.phone)}` : ''}${s.nabh_no ? `<br>NABH ${esc(s.nabh_no)}` : ''}</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.08em">LABORATORY REPORT</div>
          <div style="font-size:11px;font-family:monospace">${esc(d.order_no)}</div></div>
      </div>
      <table style="width:100%;font-size:12px;margin-top:10px">
        <tr><td style="color:#526176;width:90px">Patient</td><td><b>${esc(d.patient_name)}</b></td>
            <td style="color:#526176;width:90px">UHID</td><td style="font-family:monospace">${esc(d.uhid)}</td></tr>
        <tr><td style="color:#526176">Age / sex</td><td>${d.age_years ?? '—'} / ${esc(d.gender || '')}</td>
            <td style="color:#526176">Sample</td><td style="font-family:monospace">${esc(d.sample_id || '—')}</td></tr>
        <tr><td style="color:#526176">Referred by</td><td>${esc(d.ordered_by_name || '—')}</td>
            <td style="color:#526176">Reported</td><td>${esc(d.completed_at || '')}</td></tr>
      </table>
      <div style="margin-top:14px;font-size:13px;font-weight:700;border-bottom:1px solid #D8DFE8;padding-bottom:4px">${esc(d.service_name || d.label)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
        <thead><tr style="background:#F5F7FA">
          <th style="text-align:left;padding:6px;border-bottom:1px solid #D8DFE8">Parameter</th>
          <th style="text-align:right;padding:6px;border-bottom:1px solid #D8DFE8">Result</th>
          <th style="text-align:left;padding:6px;border-bottom:1px solid #D8DFE8">Unit</th>
          <th style="text-align:left;padding:6px;border-bottom:1px solid #D8DFE8">Biological reference</th></tr></thead>
        <tbody>${d.results.map((r) => `<tr>
          <td style="padding:6px;border-bottom:1px solid #EEF2F7">${esc(r.name)}</td>
          <td style="padding:6px;text-align:right;border-bottom:1px solid #EEF2F7;font-family:monospace;
            ${r.flag === 'critical' ? 'color:#B91C1C;font-weight:700' : r.flag ? 'font-weight:700' : ''}">
            ${esc(r.value)}${r.flag ? ` ${r.flag === 'high' ? '↑ HIGH' : r.flag === 'low' ? '↓ LOW' : '‼ CRITICAL'}` : ''}</td>
          <td style="padding:6px;border-bottom:1px solid #EEF2F7">${esc(r.unit || '')}</td>
          <td style="padding:6px;border-bottom:1px solid #EEF2F7;color:#526176">${esc(r.ref_range || '')}</td></tr>`).join('')}
        </tbody></table>
      <div style="margin-top:44px;display:flex;justify-content:flex-end;font-size:11px;text-align:center">
        <div>_______________________<br><b>${esc(d.verified_by_name || '')}</b><br>
          <span style="color:#526176">${esc(d.verified_by_qual || '')}${d.verified_by_reg ? ` · Reg ${esc(d.verified_by_reg)}` : ''}</span></div>
      </div>
      <div style="margin-top:16px;font-size:10px;color:#526176;border-top:1px solid #EEF2F7;padding-top:6px">
        Results relate only to the sample tested. Please correlate clinically. — End of report —</div>
    </div>`);
}
