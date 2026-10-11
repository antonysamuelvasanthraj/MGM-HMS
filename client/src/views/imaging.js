/** Imaging & Radiology — order → schedule → examination → report → sign-off. */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  apiError, busy, api, qs, state, can, navigate, downloadCSV,
  $, $$, esc, bind, toast, modal, confirmDialog, renderRows, pill, priorityPill,
  money, fmtDate, fmtDateTime, fmtTime, mins, kpi, spinner, emptyState, printDocument, todayISO,
  clearancePill,
} from './_kit.js';
import { mountAttachments, printableImages } from '../attachments.js';

let f = { status: 'open', modality: '', q: '', date: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  const linkedOrder=+(ctx.query.order || (ctx.params[0]==='order' ? ctx.params[1] : 0));
  if(linkedOrder>0)openReport(linkedOrder,()=>{});
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const { rows, counts, modalities } = await api.get(`/imaging/worklist${qs(f)}`);
    cache = rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Open studies', value: counts.total, icon: 'radiology', sub: `${counts.awaiting_payment} awaiting payment` },
      { label: 'Awaiting report', value: counts.in_progress + counts.ordered + counts.scheduled, icon: 'schedule', tone: 'info', sub: 'Acquired or booked' },
      { label: 'Draft reports', value: counts.reported, icon: 'edit_document', tone: counts.reported ? 'warning' : 'success', sub: 'Need radiologist sign-off' },
      { label: 'Signed today', value: counts.verified, icon: 'verified', tone: 'success', sub: 'Released to the doctor' },
    ].map(kpi).join('');
    $('[data-modalities]', root).innerHTML = modalities.length
      ? modalities.map((m) => `<button class="px-2.5 h-8 rounded border ${f.modality === m.modality ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}"
          data-mod="${esc(m.modality)}"><span class="font-label-md text-label-md">${esc(m.modality)}</span>
          <span class="font-data-mono text-label-sm ml-1 opacity-70">${m.n}</span></button>`).join('')
      : '<span class="text-body-sm text-on-surface-variant">No open studies.</span>';
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No imaging studies match this filter.' });
    $('[data-count]', root).textContent = `${rows.length} study(ies)`;
  }

  bind(root, 'click', '[data-mod]', (e, b) => { f.modality = f.modality === b.dataset.mod ? '' : b.dataset.mod; load(); });
  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    if (act === 'schedule') openSchedule(id, load);
    if (act === 'start') { await api.patch(`/orders/${id}`, { status: 'in_progress' }); toast('Patient in the scan room', 'success'); load(); }
    if (act === 'report') openReport(id, load);
    if (act === 'print') printImagingReport(id);
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`imaging-${todayISO()}.csv`, cache.map((r) => ({
    order: r.order_no, uhid: r.uhid, patient: r.patient_name, study: r.label, modality: r.modality,
    priority: r.priority, status: r.status, room: r.room, ordered: r.ordered_at, reported: r.completed_at,
  }))));

  return live({ topics: ['imaging', 'clinical'], events: ['orders.created', 'order.updated', 'imaging.reported', 'imaging.signed', 'payment.received', 'bill.authorized', 'claim.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Radiology & PACS', 'radiology')} ${liveChip()}`,
    title: 'Imaging & Radiology',
    subtitle: 'Scheduling, acquisition and reporting for X-ray, ultrasound, CT, MRI and cardiac studies.',
    actions: `<a href="/usg-reporting" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">pregnant_woman</span> USG reporting</a>
      <button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>`,
    body: `
      ${kpiRow([], 4)}
      ${card({ title: 'Modalities', body: `<div class="flex flex-wrap gap-2" data-modalities></div>` })}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Order, patient or UHID' },
        { type: 'select', key: 'status', label: 'Stage', value: f.status, options: [
          { value: 'open', label: 'All open' }, { value: 'all', label: 'Everything' },
          { value: 'awaiting_payment', label: 'Awaiting payment' }, { value: 'ordered', label: 'Ordered' },
          { value: 'scheduled', label: 'Scheduled' }, { value: 'in_progress', label: 'In scan room' },
          { value: 'reported', label: 'Draft report' }, { value: 'verified', label: 'Signed' }] },
        { type: 'date', key: 'date', label: 'Ordered on', value: f.date, width: 'w-[150px]' },
      ])}
      ${tableCard({
        title: 'Imaging worklist', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '58vh',
        columns: [{ label: 'Order', width: '150px' }, { label: 'Patient' }, { label: 'Study' },
          { label: 'Modality / room' }, { label: 'Priority' }, { label: 'Billing' },
          { label: 'Stage' }, { label: '', width: '180px' }],
      })}`,
  });
}

function rowHTML(r) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(r.order_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(r.ordered_at)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}</div></td>
    <td class="text-body-md">${esc(r.label)}</td>
    <td><span class="pill-neutral">${esc(r.modality || '—')}</span>
      <div class="text-label-sm text-on-surface-variant mt-0.5">${esc(r.room || 'unassigned')}
        ${r.scheduled_at ? ` · ${fmtDateTime(r.scheduled_at)}` : ''}</div></td>
    <td>${priorityPill(r.priority)}</td>
    <td>${clearancePill(r.clearance, r)}</td>
    <td>${pill(r.status)}${r.report_status && r.report_status !== 'final' ? ` ${pill(r.report_status)}` : ''}</td>
    <td class="text-right whitespace-nowrap">
      ${r.status === 'ordered' && can('imaging.schedule') ? `<button class="btn-secondary btn-xs" data-act="schedule">Schedule</button>` : ''}
      ${['ordered', 'scheduled'].includes(r.status) ? `<button class="btn-secondary btn-xs" data-act="start">Scan room</button>` : ''}
      ${['in_progress', 'scheduled', 'reported'].includes(r.status) && can('imaging.report') ? `<button class="btn-primary btn-xs" data-act="report">${r.status === 'reported' ? 'Edit / sign' : 'Report'}</button>` : ''}
      ${r.status === 'verified' ? `<button class="btn-secondary btn-xs" data-act="print">Report</button>` : ''}
    </td>`;
}

function openSchedule(id, after) {
  modal({
    title: 'Schedule the study', size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Date & time</label><input class="field" type="datetime-local" data-when></div>
      <div><label class="field-label">Room</label><select class="field" data-room>
        ${['USG-1', 'USG-2', 'XR-1', 'XR-2', 'CT-1', 'MRI-1', 'ECHO-1'].map((r) => `<option>${r}</option>`).join('')}</select></div>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Schedule</button>`,
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post(`/imaging/orders/${id}/schedule`, {
            scheduled_at: root.querySelector('[data-when]').value.replace('T', ' '),
            room: root.querySelector('[data-room]').value,
          });
          close(); toast('Study scheduled', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

export function openReport(orderId, after) {
  (async () => {
    const o = await api.get(`/imaging/orders/${orderId}`);
    const r = o.report || {};
    modal({
      title: o.label,
      subtitle: `${esc(o.patient_name)} · ${esc(o.uhid)} · ${o.age_years ?? '—'}y ${esc(o.gender || '')}`,
      size: 'lg',
      body: `
        <div class="flex flex-wrap items-center gap-2 mb-3">${pill(o.status)} ${priorityPill(o.priority)}
          <span class="text-body-sm text-on-surface-variant">Referred by ${esc(o.ordered_by_name || '—')}</span>
          ${o.templates.length ? `<select class="field field-sm w-auto ml-auto" data-tpl>
            <option value="">Insert a template…</option>
            ${o.templates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>` : ''}
        </div>
        ${o.prior.length ? `<div class="mb-3 p-2.5 rounded-lg bg-surface-container-low text-body-md">
          <strong>Prior studies:</strong> ${o.prior.slice(0, 3).map((p) => `${esc(p.label)} (${fmtDate(p.completed_at)})`).join(' · ')}</div>` : ''}
        <form data-rf class="space-y-3">
          <div><label class="field-label">Technique</label><textarea class="field" rows="2" name="technique">${esc(r.technique || '')}</textarea></div>
          <div><label class="field-label">Findings</label><textarea class="field" rows="9" name="findings">${esc(r.findings || '')}</textarea></div>
          <div><label class="field-label">Impression</label><textarea class="field" rows="3" name="impression">${esc(r.impression || '')}</textarea></div>
          <div><label class="field-label">Advice</label><input class="field" name="advice" value="${esc(r.advice || '')}"></div>
        </form>
        <div class="mt-4 pt-3 border-t border-outline-variant" data-attach></div>`,
      footer: `<button class="btn-secondary" data-close>Close</button>
               ${can('imaging.report') && o.status!=='verified' ? '<button class="btn-secondary" data-draft>Save draft</button><button class="btn-primary" data-sign><span class="material-symbols-outlined text-[16px]">draw</span> Sign & release</button>' : ''}`,
      onMount(root, close) {
        if(!can('imaging.report')||o.status==='verified')root.querySelectorAll('[data-rf] input,[data-rf] textarea,[data-tpl]').forEach(el=>el.disabled=true);
        mountAttachments(root.querySelector('[data-attach]'), 'order', orderId, { canEdit: can('imaging.report') && o.status !== 'verified' });
        root.querySelector('[data-tpl]')?.addEventListener('change', (e) => {
          const t = o.templates.find((x) => x.id === +e.target.value);
          if (!t) return;
          const fnd = root.querySelector('[name="findings"]');
          fnd.value = (fnd.value ? fnd.value + '\n' : '') + t.body;
          e.target.value = '';
        });
        const post = async (status, btn) => {
          busy(btn, true, 'Saving');
          try {
            const body = Object.fromEntries(new FormData(root.querySelector('[data-rf]')));
            await api.post(`/imaging/orders/${orderId}/report`, { ...body, status });
            close(); toast(status === 'final' ? 'Report signed and released' : 'Draft saved', 'success'); after?.();
          } catch (e) { apiError(e, 'Could not save the report'); busy(btn, false); }
        };
        root.querySelector('[data-draft]')?.addEventListener('click',e=>post('draft',e.currentTarget));
        root.querySelector('[data-sign]')?.addEventListener('click',e=>post('final',e.currentTarget));
      },
    });
  })().catch(e=>apiError(e,'Could not open imaging report'));
}

export async function printImagingReport(orderId) {
  const o = await api.get(`/imaging/orders/${orderId}`);
  const images = await printableImages('order', orderId);
  const s = o.settings || {}, r = o.report || {};
  printDocument(`${o.label} — ${o.patient_name}`, `
    <div style="max-width:740px;margin:0 auto;font-family:Inter,Segoe UI,sans-serif;color:#172B4D">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px">
        <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(s.hospital_name || '')}</div>
          <div style="font-size:11px;color:#526176">${esc(s.address || '')}${s.phone ? `<br>Phone: ${esc(s.phone)}` : ''}<br>Department of Radiology & Imaging</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.08em">IMAGING REPORT</div>
          <div style="font-size:11px;font-family:monospace">${esc(o.order_no)}</div></div>
      </div>
      <table style="width:100%;font-size:12px;margin-top:10px">
        <tr><td style="color:#526176;width:90px">Patient</td><td><b>${esc(o.patient_name)}</b> · ${o.age_years ?? ''}y ${esc(o.gender || '')}</td>
            <td style="color:#526176;width:80px">UHID</td><td style="font-family:monospace">${esc(o.uhid)}</td></tr>
        <tr><td style="color:#526176">Study</td><td>${esc(o.label)}</td>
            <td style="color:#526176">Date</td><td>${esc(o.completed_at || '')}</td></tr>
      </table>
      ${['technique', 'findings', 'impression', 'advice'].filter((k) => r[k]).map((k) => `
        <div style="margin-top:14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#526176">${k}</div>
          <div style="font-size:12px;white-space:pre-line;margin-top:3px">${esc(r[k])}</div></div>`).join('')}
      ${images}
      <div style="margin-top:44px;text-align:right;font-size:11px">
        _______________________<br><b>${esc(r.signed_by_name || '')}</b><br>
        <span style="color:#526176">${esc(r.signed_by_qual || '')}${r.signed_by_reg ? ` · Reg ${esc(r.signed_by_reg)}` : ''}</span></div>
    </div>`);
}
