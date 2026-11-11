/** One bill on its own page — every line visible, with totals, receipts and print. Route: /bill/<id> */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, bind, money, fmtDate, fmtDateTime, billStatus, emptyState, apiError, navigate, $ } from './_kit.js';
import { printBill, openBill } from './bills.js';
import { rupeesInWords } from '../pharmacy-invoice.js';
import { collectBill } from '../collect.js';
import { printReceipt } from './op-registration.js';

export async function mount(ctx) {
  const id = +ctx.params[0];
  if (!id) { mountPage(ctx, emptyState('receipt_long', 'No bill selected', 'Open a bill from the patient record or the bills list.')); return; }
  const root = mountPage(ctx, '<div class="p-6 text-on-surface-variant">Loading bill…</div>');
  let b;
  async function load() {
    b = await api.get(`/bills/${id}`);
    document.getElementById('page-title').textContent = b.bill_no;
    root.innerHTML = view(b);
  }
  bind(root, 'click', '[data-print]', () => printBill(id));
  bind(root, 'click', '[data-manage]', () => openBill(id, load));
  bind(root, 'click', '[data-collect]', () => collectBill(id, load));
  bind(root, 'click', '[data-rec]', async (e, el) => printReceipt(await api.get(`/payments/${el.dataset.rec}/receipt`)));
  bind(root, 'click', '[data-back]', () => history.length > 1 ? history.back() : navigate(`/patient/${b.patient_id}`));
  return live({ topics: ['billing'], events: ['bill.created', 'bill.updated', 'payment.received', 'payment.cancelled', 'refund.created'], load });
}

function view(b) {
  const due = Number(b.patient_due ?? b.balance) || 0, items = b.items || [];
  const cell = (l, v) => `<div><span class="text-on-surface-variant">${l}</span> <b>${v}</b></div>`;
  return page({
    eyebrow: `${eyebrow('Bill', 'receipt_long')} ${liveChip()}`,
    title: b.bill_no,
    subtitle: `${esc(b.patient_name)} · ${esc(b.uhid)} · ${fmtDate(b.bill_date || b.created_at)}`,
    actions: `<button class="btn-secondary" data-back>Back</button><a class="btn-secondary" href="/patient/${b.patient_id}">Patient record</a>
      ${can('payment.collect') && due > 0.005 && b.status !== 'cancelled' ? `<button class="btn-primary" data-collect>Collect ${money(due, 2)}</button>` : ''}
      <button class="btn-secondary" data-manage title="Add charge, discount, change doctor, cancel">More actions</button><button class="btn-primary" data-print>Print</button>`,
    body: `${card({ body: `<div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-body-md">
        ${cell('Invoice no.', esc(b.bill_no))}${cell('Doctor', esc(b.doctor_name || '—'))}${cell('Bill type', esc(b.bill_type))}${cell('Status', billStatus(b))}
        ${cell('Patient', esc(b.patient_name))}${cell('Patient ID', esc(b.uhid))}${cell('Gender / age', `${esc(b.gender || '—')} / ${b.age_years ?? '—'}`)}${cell('Mobile', esc(b.mobile || '—'))}
        ${cell('Date', fmtDate(b.bill_date || b.created_at))}${cell('Visit', b.encounter_no ? `<a class="text-primary underline" href="/visit/${b.encounter_id}">${esc(b.encounter_no)}</a>` : '—')}${cell('Payer', esc(b.payer_type || 'self'))}${cell('Lines', items.length)}</div>` })}
      ${card({ title: `Services & charges (${items.length})`, pad: false, body: `<div class="overflow-auto"><table class="tbl"><thead><tr><th style="width:48px">S.No</th><th>Service / particulars</th><th>Category</th><th>Date</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Amount</th></tr></thead><tbody>
        ${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description)}${i.batch_no ? `<div class="text-label-sm text-on-surface-variant">Batch ${esc(i.batch_no)}${i.expiry ? ` · exp ${esc(i.expiry)}` : ''}</div>` : ''}${i.visiting_doctor_name ? `<div class="text-label-sm text-on-surface-variant">${esc(i.visiting_doctor_name)}</div>` : ''}</td>
          <td class="capitalize text-body-md">${esc(i.category || '')}</td><td>${fmtDate(i.created_at || b.bill_date)}</td><td class="num">${i.qty}</td><td class="num">${money(i.rate, 2)}</td><td class="num">${Number(i.discount) > 0 ? money(i.discount, 2) : '—'}</td><td class="num font-semibold">${money(i.amount, 2)}</td></tr>`).join('') || '<tr><td colspan="8" class="text-center py-6 text-on-surface-variant">No lines on this bill</td></tr>'}</tbody></table></div>
        <div class="flex justify-end p-4"><table class="text-body-lg" style="min-width:300px">
          <tr><td class="text-on-surface-variant pr-6">Total amount</td><td class="num">${money(b.gross, 2)}</td></tr>
          ${b.discount ? `<tr><td class="text-on-surface-variant pr-6">Discount</td><td class="num">− ${money(b.discount, 2)}</td></tr>` : ''}
          <tr><td class="text-on-surface-variant pr-6">Tax amount</td><td class="num">${money(b.tax || 0, 2)}</td></tr>
          <tr><td class="font-semibold pr-6">Grand total</td><td class="num font-semibold">${money(b.total, 2)}</td></tr>
          <tr><td class="text-on-surface-variant pr-6">Paid amount</td><td class="num text-success">${money(b.paid, 2)}</td></tr>
          <tr><td class="font-semibold pr-6">Payment due</td><td class="num font-semibold ${due > 0.005 ? 'text-danger' : ''}">${money(Math.max(0, due), 2)}</td></tr></table></div>
        <p class="px-4 pb-4 text-body-md">Paid amount (Rs.): <b>${esc(rupeesInWords(b.paid))}</b></p>` })}
      ${(b.payments || []).length ? card({ title: 'Payment history', pad: false, body: `<table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th class="num">Amount</th><th>Received by</th><th></th></tr></thead><tbody>${b.payments.map((p) => `<tr><td class="font-data-mono">${esc(p.receipt_no)}</td><td>${fmtDateTime(p.created_at)}</td><td>${esc(p.mode)}</td><td class="num ${p.amount < 0 ? 'text-danger' : 'text-success'} font-semibold">${money(p.amount, 2)}</td><td>${esc(p.received_by_name || '')}</td><td class="text-right"><button class="btn-ghost btn-xs" data-rec="${p.id}">Print receipt</button></td></tr>`).join('')}</tbody></table>` }) : ''}`,
  });
}
