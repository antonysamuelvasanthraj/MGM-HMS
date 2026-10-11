/**
 * Patient portal preview.
 *
 * Staff-side preview of what a patient sees: their visits, reports, bills and
 * receipts. It reads the same records; nothing here is a separate copy.
 */
import {
  page, eyebrow, card, live, mountPage, patientPicker, kpiRow,
  api, qs, state, can, navigate,
  $, $$, esc, bind, toast, renderRows, pill, money, fmtDate, fmtDateTime, kpi, emptyState, spinner, billStatus,
} from './_kit.js';
import { printReport } from './laboratory.js';
import { printImagingReport } from './imaging.js';

let patientId = null;

export async function mount(ctx) {
  patientId = ctx.query.patient || null;
  document.getElementById('app-shell')?.classList.add('fullscreen');
  const root = mountPage(ctx, `<div class="p-6">${spinner()}</div>`);

  async function load() {
    if (!patientId) { root.innerHTML = chooser(); wireChooser(root, load); return; }
    const d = await api.get(`/patients/${patientId}/timeline`);
    root.innerHTML = portal(d);
    bind(root, 'click', '[data-lab]', (e, b) => printReport(+b.dataset.lab));
    bind(root, 'click', '[data-img]', (e, b) => printImagingReport(+b.dataset.img));
    bind(root, 'click', '[data-change]', () => { patientId = null; history.replaceState({}, '', '/portal'); load(); });
  }

  const dispose = live({ topics: patientId ? [`patient:${patientId}`] : [], events: ['lab.verified', 'payment.received'], load });
  return () => {
    dispose();
    document.getElementById('app-shell')?.classList.remove('fullscreen');
  };
}

function chooser() {
  return page({
    eyebrow: eyebrow('Patient-facing preview', 'lock'),
    title: 'Secure Patient Portal',
    subtitle: 'Choose a patient to see the portal exactly as they would: their visits, verified reports, bills and receipts — nothing clinical that has not been authorised.',
    body: card({ title: 'Open a patient portal', body: `<div class="max-w-md"><div data-picker></div></div>` }),
  });
}

function wireChooser(root, load) {
  patientPicker(root.querySelector('[data-picker]'), (p) => {
    patientId = p.id; history.replaceState({}, '', `/portal?patient=${p.id}`); load();
  }, { autofocus: true });
}

function portal(d) {
  const p = d.patient;
  const verified = d.orders.filter((o) => o.status === 'verified');
  const outstanding = d.bills.filter((b) => b.balance > 0 && b.status !== 'cancelled');
  return `
  <div class="min-h-screen bg-surface-container-low">
    <header class="bg-brand-dark text-white">
      <div class="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <img src="/assets/logo.svg" class="h-10 w-10" alt="">
          <div><div class="font-headline-md text-headline-md">${esc(state.meta.settings.hospital_name)}</div>
            <div class="font-label-sm text-label-sm uppercase tracking-widest text-white/50">Patient portal</div></div>
        </div>
        <button class="btn-secondary btn-sm !bg-white/10 !text-white !border-white/20" data-change>Switch patient</button>
      </div>
    </header>

    <div class="max-w-4xl mx-auto px-6 py-6 space-y-5">
      <div class="p-3 rounded-lg bg-info-bg text-info text-body-md flex items-start gap-2">
        <span class="material-symbols-outlined text-[17px]">visibility</span>
        Staff preview — this is the view the patient is given. Only verified reports and issued documents appear.
      </div>

      ${card({ body: `<div class="flex items-center gap-4">
        <span class="w-14 h-14 rounded-full bg-primary text-white grid place-items-center font-headline-lg">
          ${esc((p.name || '?').slice(0, 1))}</span>
        <div><div class="font-headline-md text-headline-md">${esc(p.name)}</div>
          <div class="text-body-lg text-on-surface-variant">${esc(p.uhid)} · ${p.age_years ?? '—'}y ${esc(p.gender)}
            ${p.blood_group ? ` · ${esc(p.blood_group)}` : ''}</div></div></div>` })}

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[{ label: 'Visits', value: d.encounters.length, icon: 'timeline' },
           { label: 'Reports ready', value: verified.length, icon: 'lab_profile', tone: 'success' },
           { label: 'Prescriptions', value: d.prescriptions.length, icon: 'prescriptions', tone: 'info' },
           { label: 'Amount due', value: money(p.outstanding), icon: 'payments', tone: p.outstanding > 0 ? 'danger' : 'success' }].map(kpi).join('')}
      </div>

      ${outstanding.length ? `<div class="card p-4 border-danger/30 bg-danger-bg">
        <div class="flex items-center gap-2 text-danger">
          <span class="material-symbols-outlined text-[18px]">error</span>
          <span class="font-title-md text-title-md">Payment outstanding</span></div>
        <ul class="mt-2 space-y-1">${outstanding.map((b) => `<li class="flex justify-between text-body-lg text-danger">
          <span>${esc(b.bill_no)} · ${fmtDate(b.bill_date)}</span><span class="font-data-mono">${money(b.balance)}</span></li>`).join('')}</ul>
        <p class="text-body-md text-danger mt-2">Please settle at any collection counter before your next visit.</p></div>` : ''}

      ${card({ title: 'My visits', pad: false, body: d.encounters.length ? `<ul class="divide-y divide-outline-variant">
        ${d.encounters.slice(0, 10).map((e) => `<li class="p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-label-lg text-label-lg">${fmtDate(e.visit_date)} · ${esc(e.doctor_name || '')}</span>
            ${pill(e.stage)}</div>
          <div class="text-body-md text-on-surface-variant">${esc(e.dept_name || '')}</div>
          ${e.diagnosis ? `<div class="text-body-lg mt-1">${esc(e.diagnosis)}</div>` : ''}
        </li>`).join('')}</ul>` : `<p class="p-4 text-body-md text-on-surface-variant">No visits recorded.</p>` })}

      ${card({ title: 'My reports', subtitle: 'Only reports authorised by the hospital appear here', pad: false,
        body: verified.length ? `<ul class="divide-y divide-outline-variant">
          ${verified.slice(0, 15).map((o) => `<li class="p-4 flex items-center justify-between gap-3">
            <div><div class="font-label-lg text-label-lg">${esc(o.label)}</div>
              <div class="text-body-sm text-on-surface-variant">${fmtDateTime(o.completed_at)} · ${esc(o.category)}</div></div>
            <button class="btn-secondary btn-sm" data-${o.category === 'imaging' ? 'img' : 'lab'}="${o.id}">
              <span class="material-symbols-outlined text-[15px]">download</span> Report</button>
          </li>`).join('')}</ul>`
          : `<p class="p-4 text-body-md text-on-surface-variant">No authorised reports yet.</p>` })}

      ${card({ title: 'My bills & receipts', pad: false, body: `<table class="tbl">
        <thead><tr><th>Document</th><th>Date</th><th class="text-right">Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${d.bills.slice(0, 10).map((b) => `<tr>
            <td class="font-data-mono text-body-sm">${esc(b.bill_no)}</td><td>${fmtDate(b.bill_date)}</td>
            <td class="num">${money(b.total)}</td><td>${billStatus(b)}</td></tr>`).join('')}
          ${d.payments.slice(0, 10).map((r) => `<tr>
            <td class="font-data-mono text-body-sm">${esc(r.receipt_no)}</td><td>${fmtDate(r.created_at)}</td>
            <td class="num text-success">${money(r.amount)}</td><td><span class="pill-success pill-dot">Receipt</span></td></tr>`).join('')}
        </tbody></table>` })}

      <p class="text-center text-body-sm text-on-surface-variant py-4">
        ${esc(state.meta.settings.hospital_name)} · ${esc(state.meta.settings.phone || '')}<br>
        For anything clinical, please speak to your treating doctor.</p>
    </div>
  </div>`;
}
