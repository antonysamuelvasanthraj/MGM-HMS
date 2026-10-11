/**
 * Visit detail — the single place where one encounter's four state axes,
 * money, clinical record and service orders are all visible together.
 */
import {
  page, eyebrow, card, live, mountPage, patientBanner, apiError, busy,
  api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, confirmDialog, pill, priorityPill, flagPill, money,
  fmtDateTime, fmtTime, fmtDate, ago, spinner, emptyState, kpi, mins, billStatus,
 modeLabel,
} from './_kit.js';
import { openCollect, printReceipt } from './op-registration.js';
import { openVitals } from './vitals-queue.js';

export async function mount(ctx) {
  const id = ctx.params[0];
  if (!id) { mountPage(ctx, emptyState('badge', 'No visit selected', 'Open a visit from a queue or the patient record.')); return; }
  const root = mountPage(ctx, `<div class="p-6">${spinner('Loading visit')}</div>`);

  async function load() {
    const e = await api.get(`/encounters/${id}`);
    document.getElementById('page-title').textContent = `Visit ${e.encounter_no}`;
    root.innerHTML = view(e);
    wire(root, e, load);
  }

  return live({ topics: ['queue', `encounter:${id}`, 'billing', 'clinical', 'lab'],
    events: ['encounter.stage', 'encounter.updated', 'vitals.recorded', 'payment.received',
      'consultation.saved', 'orders.created', 'order.updated', 'lab.verified', 'prescription.saved'],
    load });
}

function view(e) {
  const stages = ['registered', 'vitals_done', 'ready', 'in_consult', 'consulted', 'closed'];
  const at = Math.max(0, stages.indexOf(e.stage === 'vitals_pending' ? 'registered' : e.stage === 'services_pending' ? 'consulted' : e.stage));
  return page({
    eyebrow: `${eyebrow(e.kind === 'OP' ? 'Outpatient visit' : e.kind === 'IP' ? 'Inpatient' : 'Emergency', 'badge')}
      <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(e.encounter_no)}</span>
      ${e.token_no ? `<span class="pill-brand">Token ${e.token_no}</span>` : ''}
      ${priorityPill(e.priority)}`,
    title: `${e.patient_name}`,
    subtitle: `${esc(e.doctor_name || 'No doctor assigned')} · ${esc(e.dept_name || '')} · registered ${fmtDateTime(e.opened_at)}`,
    actions: `
      <a href="/patient/${e.patient_id}" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">folder_shared</span> Full record</a>
      ${e.patient_due > 0 && can('payment.collect') ? `<button class="btn-primary" data-collect><span class="material-symbols-outlined text-[18px]">payments</span> Collect patient share ${money(e.patient_due)}</button>` : ''}
      ${can('consult.write') && ['ready', 'in_consult', 'vitals_done'].includes(e.stage)
        ? `<a href="/consultation?encounter=${e.id}" class="btn-primary"><span class="material-symbols-outlined text-[18px]">stethoscope</span> Consultation</a>` : ''}`,
    body: `
      ${patientBanner(e.patient)}

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="panel-title">Visit progress</h2>
          <div class="flex items-center gap-2">${pill(e.stage)} ${pill(e.payment_status)}</div>
        </div>
        <ol class="grid grid-cols-2 md:grid-cols-6 gap-2">
          ${['Registered', 'Vitals', 'Ready', 'In consultation', 'Consulted', 'Closed'].map((label, i) => `
            <li class="relative">
              <div class="h-1.5 rounded-full ${i <= at ? 'bg-primary' : 'bg-surface-container'}"></div>
              <div class="mt-1.5 font-label-md text-label-md uppercase tracking-wider ${i <= at ? 'text-on-surface' : 'text-on-surface-variant'}">${label}</div>
              <div class="text-label-sm text-on-surface-variant">${stageTime(e, i)}</div>
            </li>`).join('')}
        </ol>
        ${e.gate && !e.gate.ok && !['consulted', 'closed', 'services_pending'].includes(e.stage) ? `
          <div class="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-warning-bg border border-warning/25 text-warning">
            <span class="material-symbols-outlined text-[17px]">block</span>
            <div class="text-body-md"><strong>Held before the doctor:</strong> ${e.gate.reasons.map(esc).join(' · ')}.
              Emergency care would bypass this gate.</div></div>` : ''}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <div class="space-y-5">
          ${card({
            title: 'Vitals',
            actions: can('vitals.record') ? `<button class="btn-secondary btn-sm" data-vitals>
              <span class="material-symbols-outlined text-[15px]">add</span> Record</button>` : '',
            body: e.vitals ? vitalsGrid(e.vitals) :
              `<p class="text-body-md text-on-surface-variant">No vitals recorded for this visit yet.</p>`,
          })}
          ${card({
            title: 'Consultation',
            actions: e.consultation ? pill(e.consultation.status) : '',
            body: e.consultation ? consultBlock(e.consultation)
              : `<p class="text-body-md text-on-surface-variant">The doctor has not documented this visit yet.</p>`,
          })}
          ${card({
            title: 'Service orders',
            subtitle: 'Work state is tracked separately from billing',
            actions: `<span class="font-data-mono text-body-sm text-on-surface-variant">${e.orders.length} order(s)</span>`,
            pad: false,
            body: e.orders.length ? `<table class="tbl">
              <thead><tr><th>Order</th><th>Category</th><th>Priority</th><th>Work state</th><th>Ordered</th><th></th></tr></thead>
              <tbody>${e.orders.map((o) => `<tr>
                <td><div class="font-label-lg text-label-lg">${esc(o.label)}</div>
                  <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(o.order_no)}${o.sample_id ? ` · ${esc(o.sample_id)}` : ''}</div></td>
                <td class="capitalize text-body-md">${esc(o.category)}</td>
                <td>${priorityPill(o.priority)}</td>
                <td>${pill(o.status)}</td>
                <td class="text-body-sm">${fmtTime(o.ordered_at)}</td>
                <td class="text-right"><a class="btn-ghost btn-xs" href="${o.category === 'imaging' ? '/imaging' : o.category === 'lab' ? '/laboratory' : `/orders?encounter=${e.id}`}">Open</a></td>
              </tr>`).join('')}</tbody></table>`
              : `<p class="p-4 text-body-md text-on-surface-variant">No lab, imaging or procedure orders on this visit.</p>`,
          })}
          ${e.prescription ? card({
            title: 'Prescription', actions: pill(e.prescription.status), pad: false,
            body: `<table class="tbl"><thead><tr><th>Drug</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Days</th><th class="text-right">Qty</th></tr></thead>
              <tbody>${e.prescription.items.map((i) => `<tr>
                <td class="font-label-lg text-label-lg">${esc(i.drug)}</td><td>${esc(i.dose || '—')}</td>
                <td>${esc(i.route || '—')}</td><td class="font-data-mono">${esc(i.frequency || '—')}</td>
                <td class="font-data-mono">${i.duration_days ?? '—'}</td>
                <td class="num">${i.qty ?? '—'}${i.dispensed_qty ? ` <span class="text-success">(${i.dispensed_qty} given)</span>` : ''}</td></tr>`).join('')}
              </tbody></table>`,
          }) : ''}
        </div>

        <div class="space-y-5">
          ${card({
            title: 'Money', subtitle: 'Bills raised against this visit', pad: false,
            body: e.bills.length ? `<div class="divide-y divide-outline-variant">
              ${e.bills.map((b) => `<div class="p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-data-mono text-body-sm">${esc(b.bill_no)}</span>${billStatus(b)}</div>
                <ul class="mt-1.5 space-y-0.5">${b.items.map((i) => `<li class="flex justify-between text-body-md">
                  <span class="truncate pr-2">${esc(i.description)}</span>
                  <span class="font-data-mono shrink-0">${money(i.amount)}</span></li>`).join('')}</ul>
                <div class="flex justify-between mt-1.5 pt-1.5 border-t border-outline-variant text-body-md">
                  <span class="text-on-surface-variant">Total / paid / balance</span>
                  <span class="font-data-mono">${money(b.total)} · <span class="text-success">${money(b.paid)}</span> ·
                    <span class="${b.balance > 0 ? 'text-danger font-semibold' : ''}">${money(b.balance)}</span></span></div>
                ${b.payer_pending > 0 ? `<p class="text-body-sm text-on-surface-variant mt-2">Awaiting payer approval / settlement: ${money(b.payer_pending)}</p>` : ''}
                ${b.patient_due > 0 && can('payment.collect') ? `<button class="btn-primary btn-xs mt-2" data-collect-bill="${b.id}">Collect patient share ${money(b.patient_due)}</button>` : ''}
              </div>`).join('')}</div>`
              : `<p class="p-4 text-body-md text-on-surface-variant">No charges raised for this visit.</p>`,
          })}
          ${card({
            title: 'Receipts', pad: false,
            body: e.payments.length ? `<table class="tbl"><tbody>${e.payments.map((p) => `<tr>
                <td><div class="font-data-mono text-body-sm">${esc(p.receipt_no)}</div>
                  <div class="text-label-sm text-on-surface-variant">${fmtDateTime(p.created_at)} · ${esc(p.received_by_name || '')}</div></td>
                <td class="text-body-md">${esc(modeLabel(p.mode))}</td>
                <td class="num text-success font-semibold">${money(p.amount)}</td>
                <td class="text-right"><button class="btn-ghost btn-xs" data-print-receipt="${p.id}" title="Print">
                  <span class="material-symbols-outlined text-[15px]">print</span></button></td></tr>`).join('')}</tbody></table>`
              : `<p class="p-4 text-body-md text-on-surface-variant">No money received on this visit yet.</p>`,
          })}
          ${card({
            title: 'Visit actions',
            body: `<div class="flex flex-wrap gap-2">
              ${can('queue.manage') && ['vitals_done', 'ready'].includes(e.stage) ? `<button class="btn-secondary btn-sm" data-stage="in_consult">Call in</button>` : ''}
              ${can('consult.write') && e.stage === 'in_consult' ? `<button class="btn-secondary btn-sm" data-stage="consulted">Mark consulted</button>` : ''}
              ${(can('queue.manage') || can('consult.write')) && !['closed', 'cancelled'].includes(e.stage) ? `<button class="btn-secondary btn-sm" data-stage="closed">Close visit</button>` : ''}
              ${can('admin.view') && e.payment_status === 'pending' ? `<button class="btn-secondary btn-sm" data-free>Approve free visit</button>` : ''}
              ${can('order.create') ? `<a class="btn-secondary btn-sm" href="/orders?encounter=${e.id}">Place orders</a>` : ''}
            </div>
            <dl class="grid grid-cols-[130px_1fr] gap-y-1.5 mt-4 pt-3 border-t border-outline-variant text-body-md">
              <dt class="text-on-surface-variant">Visit type</dt><dd>${e.visit_type === 'followup' ? 'Follow-up' : 'New consultation'}</dd>
              <dt class="text-on-surface-variant">Counter</dt><dd>${esc(e.counter_name || '—')}</dd>
              <dt class="text-on-surface-variant">Door-to-doctor</dt><dd>${e.consult_start ? mins((new Date(e.consult_start.replace(' ', 'T')) - new Date(e.opened_at.replace(' ', 'T'))) / 60000) : '—'}</dd>
              ${e.free_reason ? `<dt class="text-on-surface-variant">Free reason</dt><dd>${esc(e.free_reason)}</dd>` : ''}
            </dl>`,
          })}
        </div>
      </div>`,
  });
}

const stageTime = (e, i) => {
  const t = [e.opened_at, e.vitals?.recorded_at, e.called_at, e.consult_start, e.consult_end, e.closed_at][i];
  return t ? fmtTime(t) : '—';
};

function vitalsGrid(v) {
  const items = [
    ['Blood pressure', v.bp_sys && v.bp_dia ? `${v.bp_sys}/${v.bp_dia}` : null, 'mmHg', v.bp_sys > 140 || v.bp_dia > 90],
    ['Pulse', v.pulse, '/min', v.pulse > 100 || v.pulse < 55],
    ['Temperature', v.temp_f, '°F', v.temp_f > 100.4],
    ['SpO₂', v.spo2, '%', v.spo2 < 94],
    ['Respiratory rate', v.resp_rate, '/min', v.resp_rate > 22],
    ['Weight', v.weight_kg, 'kg', false],
    ['Height', v.height_cm, 'cm', false],
    ['BMI', v.bmi, '', v.bmi > 30],
    ['GRBS', v.grbs, 'mg/dL', v.grbs > 180],
    ['Pain score', v.pain_score, '/10', v.pain_score >= 7],
  ].filter((x) => x[1] !== null && x[1] !== undefined && x[1] !== '');
  return `<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
    ${items.map(([label, val, unit, alert]) => `
      <div class="p-2.5 rounded-lg border ${alert ? 'border-danger/30 bg-danger-bg' : 'border-outline-variant bg-surface-container-low'}">
        <div class="font-label-sm text-label-sm uppercase tracking-wider ${alert ? 'text-danger' : 'text-on-surface-variant'}">${label}</div>
        <div class="font-headline-md text-headline-md tnum ${alert ? 'text-danger' : ''}">${val}<span class="text-body-sm font-normal ml-0.5">${unit}</span></div>
      </div>`).join('')}
  </div>
  <p class="text-body-sm text-on-surface-variant mt-2.5">Recorded ${fmtDateTime(v.recorded_at)}</p>`;
}

function consultBlock(c) {
  const f = (label, value) => value ? `<div class="mb-2.5"><div class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">${label}</div>
    <div class="text-body-lg whitespace-pre-line">${esc(value)}</div></div>` : '';
  return `${f('Chief complaint', c.chief_complaint)}${f('History', c.hopi)}${f('Examination', c.examination)}
    ${c.diagnosis ? `<div class="mb-2.5 p-2.5 rounded-lg bg-primary-fixed/60">
      <div class="font-label-md text-label-md uppercase tracking-wider text-primary">Diagnosis</div>
      <div class="font-title-md text-title-md">${esc(c.diagnosis)}</div></div>` : ''}
    ${f('Plan', c.plan)}${f('Advice', c.advice)}
    ${c.follow_up_date ? `<div class="text-body-md text-on-surface-variant">Review on <strong class="text-on-surface">${fmtDate(c.follow_up_date)}</strong></div>` : ''}`;
}

function wire(root, e, reload) {
  root.querySelector('[data-collect]')?.addEventListener('click', () => openCollect(e.id, reload));
  root.querySelector('[data-vitals]')?.addEventListener('click', () => openVitals(e.id, reload));
  bind(root, 'click', '[data-collect-bill]', (ev, b) => openCollect(null, reload, { billId: +b.dataset.collectBill }));
  bind(root, 'click', '[data-print-receipt]', async (ev, b) => {
    printReceipt(await api.get(`/payments/${b.dataset.printReceipt}/receipt`));
  });
  bind(root, 'click', '[data-stage]', async (ev, b) => {
    busy(b, true);
    try { await api.post(`/encounters/${e.id}/stage`, { stage: b.dataset.stage }); reload(); }
    catch (err) { apiError(err, 'Could not change the visit stage'); busy(b, false); }
  });
  root.querySelector('[data-free]')?.addEventListener('click', async () => {
    const r = await confirmDialog({
      title: 'Approve a free visit?',
      message: 'The outstanding consultation bill is cancelled and your approval is recorded against this visit.',
      confirmLabel: 'Approve free visit', requireReason: true, reasonLabel: 'Reason for waiving the fee',
    });
    if (!r) return;
    try { await api.post(`/encounters/${e.id}/free`, { reason: r.reason }); toast('Free visit approved', 'success'); reload(); }
    catch (err) { apiError(err); }
  });
}
