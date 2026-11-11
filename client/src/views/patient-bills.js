/** All of one patient's bills on their own page — dues banner, every bill, receipts. Each bill opens its own page. Route: /patient-bills/<patient id> */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, bind, money, fmtDate, fmtDateTime, billStatus, emptyState, apiError, navigate } from './_kit.js';
import { newBill, canRaiseReceptionBill, printBill } from './bills.js';
import { collectBill } from '../collect.js';
import { printReceipt } from './op-registration.js';

const TYPE = { IP: 'Inpatient', PHARM: 'Pharmacy', OP: 'Outpatient', LAB: 'Lab', IMAGING: 'Imaging', ER: 'Emergency', PKG: 'Package' };

export async function mount(ctx) {
  const id = +ctx.params[0];
  if (!id) { mountPage(ctx, emptyState('receipt_long', 'No patient selected', 'Open a patient record and choose Bills & receipts.')); return; }
  const root = mountPage(ctx, '<div class="p-6 text-on-surface-variant">Loading bills…</div>');
  let d, lastSig = '';
  async function load() {
    const fresh = await api.get(`/patients/${id}/timeline`), sig = JSON.stringify([fresh.bills, fresh.payments, fresh.patient?.name]);
    if (sig === lastSig && root.querySelector('table')) return;   // nothing changed: leave the page alone
    lastSig = sig; d = fresh;
    document.getElementById('page-title').textContent = `Bills — ${d.patient.name}`;
    root.innerHTML = view(d);
  }
  bind(root, 'click', '[data-collect]', (e, b) => collectBill(+b.dataset.collect, load));
  bind(root, 'click', '[data-print]', (e, b) => printBill(+b.dataset.print));
  bind(root, 'click', '[data-new-bill]', () => newBill(load, false, { patientId: id }));
  bind(root, 'click', '[data-rec]', async (e, b) => printReceipt(await api.get(`/payments/${b.dataset.rec}/receipt`)));
  return live({ topics: ['billing'], events: ['bill.created', 'bill.updated', 'payment.received', 'payment.cancelled', 'refund.created'], load });
}

function view(d) {
  if (!d.access?.financial) return emptyState('lock', 'Bills are not available for your role', '');
  const bills = d.bills || [], live = bills.filter((b) => b.status !== 'cancelled');
  const due = (b) => Math.max(0, Number(b.patient_due ?? b.balance) || 0);
  const hosp = live.filter((b) => b.bill_type !== 'PHARM').reduce((t, b) => t + due(b), 0), ph = live.filter((b) => b.bill_type === 'PHARM').reduce((t, b) => t + due(b), 0);
  return page({
    eyebrow: `${eyebrow('Patient bills', 'receipt_long')} ${liveChip()}`,
    title: `Bills — ${d.patient.name}`,
    subtitle: `${esc(d.patient.uhid || '')} · ${bills.length} bill(s). Open a bill to see every line, print it or collect payment.`,
    actions: `<a class="btn-secondary" href="/patient/${d.patient.id}">Patient record</a>${canRaiseReceptionBill() ? '<button class="btn-primary" data-new-bill>Raise new bill</button>' : ''}`,
    body: `<div class="rounded-lg px-4 py-2 text-body-lg font-semibold ${hosp + ph > 0.005 ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}">Hospital due: ${money(hosp, 2)} &nbsp;·&nbsp; Pharmacy due: ${money(ph, 2)} &nbsp;·&nbsp; Total: ${money(hosp + ph, 2)}</div>
      ${card({ title: 'Bills', pad: false, body: `<div class="overflow-auto"><table class="tbl"><thead><tr><th>Doctor</th><th>Visit / file ID</th><th>Invoice number</th><th>Bill date</th><th class="num">Discount</th><th class="num">Total</th><th class="num">Due</th><th>Categories</th><th>Bill status</th><th>Bill type</th><th>Action</th></tr></thead><tbody>
        ${bills.map((b) => `<tr><td>${esc(b.doctor_name || '—')}</td><td class="font-data-mono text-body-sm">${esc(b.encounter_no || '—')}</td>
          <td class="font-data-mono text-body-sm"><a class="text-primary underline" href="/bill/${b.id}">${esc(b.bill_no)}</a></td><td>${fmtDate(b.bill_date)}</td>
          <td class="num">${b.discount > 0 ? money(b.discount, 2) : '0.00'}</td><td class="num">${money(b.total, 2)}</td>
          <td class="num ${due(b) > 0.005 ? 'text-danger font-semibold' : ''}">${money(due(b), 2)}</td>
          <td class="text-body-sm capitalize">${esc(String(b.categories || '').replaceAll(',', ', '))}</td><td>${billStatus(b)}</td>
          <td><span class="pill-neutral">${esc(TYPE[b.bill_type] || b.bill_type)}</span></td>
          <td class="whitespace-nowrap">${can('payment.collect') && due(b) > 0.005 && b.status !== 'cancelled' && (b.bill_type !== 'PHARM' || can('pharmacy.dispense')) ? `<button class="btn-primary btn-xs" data-collect="${b.id}">Collect</button> ` : ''}<a class="btn-secondary btn-xs" href="/bill/${b.id}">Bill details</a> <button class="btn-ghost btn-xs" data-print="${b.id}" title="Print"><span class="material-symbols-outlined text-[15px]">print</span></button></td></tr>`).join('') || '<tr><td colspan="11" class="text-center py-8 text-on-surface-variant">No bills for this patient</td></tr>'}</tbody></table></div>` })}
      ${(d.payments || []).length ? card({ title: 'Receipts', pad: false, body: `<table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th class="num">Amount</th><th>Received by</th><th></th></tr></thead><tbody>${d.payments.map((p) => `<tr><td class="font-data-mono">${esc(p.receipt_no)}</td><td>${fmtDateTime(p.created_at)}</td><td>${esc(p.mode)}</td><td class="num ${p.amount < 0 ? 'text-danger' : 'text-success'} font-semibold">${money(p.amount, 2)}</td><td>${esc(p.received_by_name || '')}</td><td class="text-right"><button class="btn-ghost btn-xs" data-rec="${p.id}">Print receipt</button></td></tr>`).join('')}</tbody></table>` }) : ''}`,
  });
}
