/**
 * Billing & invoice management.
 *
 * Billing is charge creation. Collection is receiving money against a bill —
 * a separate act, on a separate screen, against the same records.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, downloadCSV, patientPicker, compactMoney,
  $, $$, esc, bind, toast, modal, drawer, confirmDialog, renderRows, pill, money,
  fmtDate, fmtDateTime, kpi, emptyState, todayISO, printDocument, billStatus, remindBill,
 modeLabel,
} from './_kit.js';
import { openCollect, printReceipt } from './op-registration.js';
import { showBillingContext } from '../billing-context.js';

let f = { date: '', type: 'all', status: 'all', q: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/bills${qs({ ...f, limit: 300 })}`);
    cache = d.rows;
    const s = d.summary;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Bills shown', value: s.n, icon: 'receipt_long', sub: f.date ? fmtDate(f.date) : 'All dates' },
      { label: 'Billed value', value: compactMoney(s.total), icon: 'request_quote', sub: 'Gross of discounts' },
      { label: 'Collected', value: compactMoney(s.paid), icon: 'paid', tone: 'success', sub: 'Against these bills' },
      { label: 'Outstanding', value: compactMoney(s.balance), icon: 'schedule', tone: s.balance > 0 ? 'warning' : 'success', sub: 'Patient dues and pending payer charges' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No bills match this filter.' });
    $('[data-count]', root).textContent = `${d.rows.length} bill(s)`;
  }

  bind(root, 'click', '[data-remind]', (e, b) => remindBill(+b.dataset.remind));
  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    if (b.dataset.act === 'open') openBill(id, load);
    if (b.dataset.act === 'collect') openCollect(null, load, { billId: id });
    if (b.dataset.act === 'print') printBill(id);
  });
  bind(root, 'click', '[data-new]', () => newBill(load, ctx.query.new === 'op'));
  if (ctx.query.new === 'op' && can('billing.create')) newBill(load, true);
  bind(root, 'click', '[data-export]', () => downloadCSV(`bills-${f.date || 'all'}.csv`, cache.map((b) => ({
    bill: b.bill_no, date: b.bill_date, type: b.bill_type, uhid: b.uhid, patient: b.patient_name,
    doctor: b.doctor_name, counter: b.counter_name, payer: b.payer_type,
    gross: b.gross, discount: b.discount, tax: b.tax, total: b.total, paid: b.paid, balance: b.balance, status: b.status,
  }))));

  if (ctx.query.bill) openBill(+ctx.query.bill, load).catch(apiError);
  return live({ topics: ['billing'], events: ['bill.created', 'bill.updated', 'payment.received', 'payment.cancelled', 'refund.created'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Charge management', 'receipt_long')} ${liveChip()}`,
    title: 'Billing & Invoice Management',
    subtitle: 'Create and review charges here. Receiving money happens at a collection desk — never raise a second consultation bill for a visit that already has one.',
    actions: `${can('op.collect') || can('finance.view') || can('admin.view') ? `<a href="/collections" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">point_of_sale</span> Collections</a>` : ''}
      <button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('op.collect') || can('admin.view') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New bill</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Bill number, patient, UHID or mobile' },
        { type: 'date', key: 'date', label: 'Bill date', value: f.date, width: 'w-[150px]' },
        { type: 'select', key: 'type', label: 'Type', value: f.type, options: [
          { value: 'all', label: 'All types' }, { value: 'OP', label: 'Outpatient' }, { value: 'IP', label: 'Inpatient' },
          { value: 'LAB', label: 'Laboratory' }, { value: 'IMAGING', label: 'Imaging' }, { value: 'PHARM', label: 'Pharmacy' }, { value: 'ER', label: 'Emergency' }, { value: 'PKG', label: 'Package' }] },
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: 'all', label: 'All' }, { value: 'outstanding', label: 'Outstanding' }, { value: 'unpaid', label: 'Unpaid' },
          { value: 'partial', label: 'Part paid' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }] },
      ])}
      ${tableCard({
        title: 'Bills', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '60vh',
        columns: [{ label: 'Bill', width: '150px' }, { label: 'Patient' }, { label: 'Type' },
          { label: 'Doctor / counter' }, { label: 'Gross', cls: 'text-right' },
          { label: 'Discount', cls: 'text-right' }, { label: 'Total', cls: 'text-right' },
          { label: 'Paid', cls: 'text-right' }, { label: 'Balance', cls: 'text-right' },
          { label: 'Status' }, { label: '', width: '150px' }],
      })}`,
  });
}

function rowHTML(b) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(b.bill_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtDate(b.bill_date)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(b.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(b.uhid)}${b.token_no ? ` · Tok ${b.token_no}` : ''}</div></td>
    <td><span class="pill-neutral">${esc(b.bill_type)}</span>
      ${b.payer_type !== 'self' ? `<span class="pill-info">${esc(b.payer_type)}</span>` : ''}</td>
    <td><div class="text-body-md">${esc(b.doctor_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(b.counter_name || '')}</div></td>
    <td class="num">${money(b.gross)}</td>
    <td class="num ${b.discount > 0 ? 'text-warning' : 'text-on-surface-variant'}">${b.discount > 0 ? money(b.discount) : '—'}</td>
    <td class="num font-semibold">${money(b.total)}</td>
    <td class="num text-success">${money(b.paid)}</td>
    <td class="num ${b.balance > 0 ? 'text-danger font-semibold' : 'text-on-surface-variant'}">${b.balance > 0 ? money(b.balance) : '—'}</td>
    <td>${billStatus(b)}</td>
    <td class="text-right whitespace-nowrap">
      ${(b.patient_due ?? b.balance) > 0 && b.status !== 'cancelled' && can('payment.collect') ? `<button class="btn-primary btn-xs" data-act="collect">${b.payer_pending > 0 ? 'Patient share' : 'Collect'}</button>` : ''}
      ${b.payer_pending > 0 ? '<span class="pill-neutral">Payer pending</span>' : ''}
      ${b.balance > 0 && !b.payer_pending && b.status !== 'cancelled' && (can('payment.collect') || can('finance.view') || can('admin.view')) ? `<button class="btn-ghost btn-xs" data-remind="${b.id}" title="Send a due reminder">Remind</button>` : ''}
      <button class="btn-secondary btn-xs" data-act="open">Open</button>
      <button class="btn-ghost btn-xs" data-act="print" title="Print"><span class="material-symbols-outlined text-[15px]">print</span></button>
    </td>`;
}

async function openBill(id, after) {
  const b = await api.get(`/bills/${id}`);
  drawer({
    title: b.bill_no, subtitle: `${esc(b.patient_name)} · ${esc(b.uhid)} · ${fmtDateTime(b.created_at)}`, width: 'max-w-3xl',
    body: `<div class="p-5 space-y-4">
      <div class="flex flex-wrap items-center gap-2">${billStatus(b)}<span class="pill-neutral">${esc(b.bill_type)}</span>
        ${b.encounter_no ? `<a href="/visit/${b.encounter_id}" class="btn-ghost btn-xs">Visit ${esc(b.encounter_no)}</a>` : ''}
        <a href="/patient/${b.patient_id}" class="btn-ghost btn-xs">Patient record</a></div>
      <p class="text-body-md">Billing doctor: <b>${esc(b.doctor_name || 'Unassigned')}</b></p>
      <table class="tbl"><thead><tr><th>Particulars</th><th>Category</th><th class="text-right">Qty</th>
        <th class="text-right">Rate</th><th class="text-right">Discount</th><th class="text-right">Amount</th>
        ${can('billing.create') && b.status !== 'cancelled' ? '<th style="width:44px"></th>' : ''}</tr></thead>
        <tbody>${b.items.map((i) => `<tr>
          <td>${esc(i.description)}${i.visiting_doctor_name ? `<div class="text-label-sm text-on-surface-variant">Visiting: ${esc(i.visiting_doctor_name)}${i.visiting_role ? ` (${esc(i.visiting_role)})` : ''}</div>` : ''}</td><td class="capitalize text-body-md">${esc(i.category || '')}</td>
          <td class="num">${i.qty}</td><td class="num">${money(i.rate, 2)}</td>
          <td class="num">${i.discount ? money(i.discount, 2) : '—'}</td>
          <td class="num font-semibold">${money(i.amount, 2)}</td>
          ${can('billing.create') && b.status !== 'cancelled' ? `<td class="text-right whitespace-nowrap">
            ${['procedure', 'emergency'].includes(i.category) && i.amount > 0 && !i.waiver_of ? `<button class="btn-ghost btn-xs" data-cons="${i.id}" title="Consumables used in this procedure">Consumables</button>` : ''}
            ${['procedure', 'consultation', 'emergency', 'ot'].includes(i.category) && i.amount > 0 && !i.waiver_of ? `<button class="btn-ghost btn-xs" data-vd="${i.id}" title="Credit this line to a visiting doctor">Visiting dr</button>` : ''}
            <button class="btn-ghost btn-xs" data-del="${i.id}"><span class="material-symbols-outlined text-[15px]">delete</span></button></td>` : ''}
        </tr>`).join('')}</tbody>
        <tfoot>
          <tr><td colspan="5" class="text-right text-on-surface-variant py-1.5">Gross</td><td class="num">${money(b.gross, 2)}</td></tr>
          ${b.discount ? `<tr><td colspan="5" class="text-right text-on-surface-variant py-1.5">Discount${b.discount_reason ? ` — ${esc(b.discount_reason)}` : ''}</td>
            <td class="num text-warning">− ${money(b.discount, 2)}</td></tr>` : ''}
          ${b.tax ? `<tr><td colspan="5" class="text-right text-on-surface-variant py-1.5">Tax</td><td class="num">${money(b.tax, 2)}</td></tr>` : ''}
          <tr><td colspan="5" class="text-right font-title-md py-1.5">Total</td><td class="num font-headline-md">${money(b.total, 2)}</td></tr>
          <tr><td colspan="5" class="text-right text-success py-1.5">Received</td><td class="num text-success">${money(b.paid, 2)}</td></tr>
          <tr><td colspan="5" class="text-right font-title-md py-1.5">Balance</td>
            <td class="num font-headline-md ${b.balance > 0 ? 'text-danger' : 'text-success'}">${money(b.balance, 2)}</td></tr>
        </tfoot></table>
      ${b.payments.length ? card({ title: 'Receipts', pad: false, body: `<table class="tbl">
        <tbody>${b.payments.map((p) => `<tr>
          <td><div class="font-data-mono text-body-sm">${esc(p.receipt_no)}</div>
            <div class="text-label-sm text-on-surface-variant">${fmtDateTime(p.created_at)} · ${esc(p.received_by_name || '')}</div></td>
          <td>${esc(modeLabel(p.mode))}</td>
          <td class="num ${p.amount < 0 ? 'text-danger' : 'text-success'} font-semibold">${money(p.amount, 2)}</td>
          <td class="text-right"><button class="btn-ghost btn-xs" data-rec="${p.id}">Print</button>
            ${can('payment.cancel') && !p.cancelled && p.amount > 0 ? `<button class="btn-ghost btn-xs" data-cancel-pay="${p.id}">Cancel</button>` : ''}</td>
        </tr>`).join('')}</tbody></table>` }) : ''}
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      <button class="btn-secondary" data-print>Print bill</button>
      ${can('billing.create') && b.status !== 'cancelled' ? `<button class="btn-secondary" data-add-item>Add charge</button>
        <button class="btn-secondary" data-discount>Discount</button><button class="btn-secondary" data-doctor>Change doctor</button>` : ''}
      ${can('billing.cancel') && b.status !== 'cancelled' ? `<button class="btn-danger" data-cancel>Cancel bill</button>` : ''}
      ${b.payer_pending > 0 ? `<span class="pill-neutral">Payer pending ${money(b.payer_pending)}</span>` : ''}
      ${(b.patient_due ?? b.balance) > 0 && b.status !== 'cancelled' && can('payment.collect') ? `<button class="btn-primary" data-pay>Collect ${b.payer_pending > 0 ? 'patient share ' : ''}${money(b.patient_due ?? b.balance)}</button>` : ''}`,
    onMount(root, close) {
      root.querySelector('[data-print]').onclick = () => printBill(id);
      root.querySelectorAll('[data-vd]').forEach((x) => (x.onclick = async () => {
        const line = b.items.find((i) => i.id === +x.dataset.vd);
        const docs = await api.get('/visiting-doctors?active=1').catch(() => []);
        if (!docs.length) { toast('No visiting doctors yet — add them under Finance → Visiting Doctors', 'warning'); return; }
        modal({ title: 'Visiting doctor for this line', subtitle: line.description, size: 'sm', stack: true,
          body: `<label class="field-label">Doctor</label><select class="field" data-doc><option value="">— none (hospital) —</option>${docs.map((d) => `<option value="${d.id}" ${d.id === line.visiting_doctor_id ? 'selected' : ''}>${esc(d.name)}${d.speciality ? ` · ${esc(d.speciality)}` : ''}</option>`).join('')}</select>
            <label class="field-label mt-3">Role</label><select class="field" data-role>${['surgeon', 'anaesthetist', 'consultant', 'assistant'].map((r) => `<option ${r === (line.visiting_role || 'consultant') ? 'selected' : ''}>${r}</option>`).join('')}</select>
            <p class="text-body-sm text-on-surface-variant mt-2">Their share is earned only on what this bill collects.</p>`,
          footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save</button>',
          onMount(r2, close2) { r2.querySelector('[data-ok]').onclick = async () => {
            try { await api.patch(`/bills/${id}/items/${line.id}/visiting`, { visiting_doctor_id: r2.querySelector('[data-doc]').value || null, role: r2.querySelector('[data-role]').value }); close2(); toast('Saved', 'success'); close(); openBill(id, after); }
            catch (e) { apiError(e); } }; } });
      }));
      root.querySelectorAll('[data-cons]').forEach((x) => (x.onclick = async () => {
        const { openConsumables } = await import('../consumables.js');
        const line = b.items.find((i) => i.id === +x.dataset.cons);
        openConsumables({ source_type: 'bill_item', source_id: line.id, title: line.description, location: b.bill_type === 'ER' ? 'ER' : 'OP' }, () => { close(); openBill(id, after); after?.(); });
      }));
      root.querySelector('[data-pay]')?.addEventListener('click', () => { close(); openCollect(null, after, { billId: id }); });
      root.querySelector('[data-add-item]')?.addEventListener('click', () => { close(); addCharge(id, after); });
      root.querySelector('[data-discount]')?.addEventListener('click', () => { close(); setDiscount(b, after); });
      root.querySelector('[data-doctor]')?.addEventListener('click', () => {
        close();
        modal({title:'Change billing doctor',subtitle:'Changes revenue attribution for this bill. Patient visits and collected amounts stay unchanged.',body:`<label class="field-label">Doctor</label><select class="field" data-doctor-id><option value="">Choose doctor</option>${(state.meta.doctors || []).filter(d=>d.role==='doctor').map(d=>`<option value="${d.id}" ${d.id===b.doctor_id?'selected':''}>${esc(d.name)} · ${esc(d.dept_name || '')}</option>`).join('')}</select><label class="field-label mt-3">Reason *</label><input class="field" data-doctor-reason>`,footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-doctor>Save doctor</button>',onMount(dialog,done){dialog.querySelector('[data-save-doctor]').onclick=async e=>{const button=e.currentTarget;busy(button,true);try{await api.patch(`/bills/${id}/doctor`,{doctor_id:+dialog.querySelector('[data-doctor-id]').value,reason:dialog.querySelector('[data-doctor-reason]').value});done();toast('Billing doctor updated','success');after();openBill(id,after);}catch(err){apiError(err);busy(button,false);}};}});
      });
      root.querySelector('[data-cancel]')?.addEventListener('click', async () => {
        const r = await confirmDialog({ title: 'Cancel this bill?', message: 'The charge is voided. Any receipt already issued must be refunded separately.', confirmLabel: 'Cancel bill', tone: 'danger', requireReason: true });
        if (!r) return;
        await api.post(`/bills/${id}/cancel`, { reason: r.reason });
        close(); toast('Bill cancelled', 'success'); after();
      });
      root.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        if (del) {
          const r = await confirmDialog({ title: 'Remove this charge?', message: 'Only possible before any money is collected on the bill and before the service is performed.', confirmLabel: 'Remove', tone: 'danger', requireReason: true });
          if (!r) return;
          await api.del(`/bills/${id}/items/${del.dataset.del}?reason=${encodeURIComponent(r.reason)}`); close(); openBill(id, after); after(); return;
        }
        const rec = e.target.closest('[data-rec]');
        if (rec) { printReceipt(await api.get(`/payments/${rec.dataset.rec}/receipt`)); return; }
        const cp = e.target.closest('[data-cancel-pay]');
        if (cp) {
          const r = await confirmDialog({ title: 'Cancel this receipt?', message: 'The money is removed from the day’s collection and the bill balance reopens.', confirmLabel: 'Cancel receipt', tone: 'danger', requireReason: true });
          if (!r) return;
          await api.post(`/payments/${cp.dataset.cancelPay}/cancel`, { reason: r.reason });
          close(); toast('Receipt cancelled', 'success'); after();
        }
      });
    },
  });
}

function addCharge(billId, after) {
  const svc = state.meta.services;
  modal({
    title: 'Add a charge', size: 'md',
    body: `<div class="space-y-3">
      <div><label class="field-label">Service</label>
        <select class="field" data-svc><option value="">Free-text charge…</option>
          ${svc.map((s) => `<option value="${s.id}" data-p="${s.price}">${esc(s.name)} — ${money(s.price)}</option>`).join('')}</select></div>
      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-3"><label class="field-label">Description</label><input class="field" data-desc></div>
        <div><label class="field-label">Quantity</label><input class="field" type="number" data-qty value="1"></div>
        <div><label class="field-label">Rate</label><input class="field" type="number" step="0.01" data-rate value="0"></div>
        <div><label class="field-label">Discount</label><input class="field" type="number" step="0.01" data-disc value="0"></div>
      </div>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Add charge</button>`,
    onMount(root, close) {
      const sel = root.querySelector('[data-svc]');
      sel.onchange = () => {
        const o = sel.selectedOptions[0];
        if (!o.value) return;
        root.querySelector('[data-desc]').value = o.textContent.split(' — ')[0];
        root.querySelector('[data-rate]').value = o.dataset.p;
      };
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post(`/bills/${billId}/items`, {
            service_id: sel.value || null,
            description: root.querySelector('[data-desc]').value,
            qty: +root.querySelector('[data-qty]').value,
            rate: +root.querySelector('[data-rate]').value,
            discount: +root.querySelector('[data-disc]').value,
          });
          close(); toast('Charge added', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function setDiscount(b, after) {
  modal({
    title: 'Apply a discount', subtitle: `${esc(b.bill_no)} · total ${money(b.total)}`, size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Discount amount</label><input class="field" type="number" step="0.01" data-d value="${b.discount || 0}"></div>
      <div><label class="field-label">Reason *</label><input class="field" data-r value="${esc(b.discount_reason || '')}" placeholder="Recorded in the audit trail"></div>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Apply</button>`,
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const reason = root.querySelector('[data-r]').value.trim();
        if (!reason) { toast('A reason is required for a discount', 'warning'); return; }
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.patch(`/bills/${b.id}`, { discount: +root.querySelector('[data-d]').value, discount_reason: reason });
          close(); toast('Discount applied', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

async function newBill(after, opd = false) {
  let packages;
  try { packages = (await api.get('/packages')).filter(p => p.active); }
  catch (e) { apiError(e, 'Could not load packages'); return; }
  let picked = null;
  const items = [];
  const servicesFor = type => state.meta.services.filter(s => type === 'LAB' ? s.category === 'lab' : type === 'IMAGING' ? s.category === 'imaging' : !opd || (['procedure','other'].includes(s.category) && s.billing_unit !== 'day'));
  let visits = [];
  modal({
    title: opd ? 'OPD procedures & basic charges' : 'Create a bill', subtitle: 'Outpatient procedures do not require admission. Select the OP visit to attribute revenue to its doctor.', size: 'lg',
    body: `<form data-nb class="space-y-3"><div data-billing-context></div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2"><label class="field-label">Patient *</label><div data-picker></div></div>
        <div><label class="field-label">Bill type</label><select class="field" name="bill_type">
          <option value="OP">Outpatient</option><option value="LAB">Laboratory</option>
          <option value="IMAGING">Imaging</option><option value="PKG">Package</option></select></div>
      </div>
      <div><label class="field-label">Patient visit (optional)</label><select class="field" name="encounter_id"><option value="">Choose the patient first</option></select><p class="text-body-sm text-on-surface-variant mt-1">Choose a visit for clinical context. The billing doctor is selected below.</p></div>
      <div><label class="field-label">Billing doctor</label><select class="field" name="doctor_id"><option value="">Choose billing doctor / unassigned</option>${(state.meta.doctors || []).filter(d => d.role === 'doctor').map(d => `<option value="${d.id}">${esc(d.name)}${d.dept_name ? ` · ${esc(d.dept_name)}` : ''}</option>`).join('')}</select><p class="text-body-sm text-on-surface-variant mt-1">Choose any active doctor to attribute this bill's revenue. This does not change the patient's consultation or visit.</p></div>
      <div class="hidden space-y-3" data-packages>
        <div><label class="field-label">Package category</label><select class="field" data-package-kind><option value="hospital">Hospital packages — patient billing</option><option value="payer">TPA / insurance / scheme packages</option></select></div>
        <div><label class="field-label">Choose package</label><select class="field" name="package_id"></select></div>
        <div class="text-body-md text-on-surface-variant" data-package-detail></div>
        ${can('insurance.view') ? '<button type="button" class="btn-secondary hidden" data-payer-case>Open Insurance & Payer Cases</button>' : ''}
        <p class="text-body-sm">Packages contain bundled services and are billed at the package price. They are separate from the service tariff.</p>
      </div>
      <div class="border border-outline-variant rounded-lg overflow-hidden" data-services>
        <table class="tbl"><thead><tr><th>Service</th><th style="width:80px">Qty</th>
          <th style="width:110px">Rate</th><th style="width:110px">Discount</th><th style="width:110px" class="text-right">Amount</th>
          <th style="width:44px"></th></tr></thead><tbody data-lines></tbody></table>
        <div class="p-2 border-t border-outline-variant"><button type="button" class="btn-secondary btn-sm" data-add>
          <span class="material-symbols-outlined text-[15px]">add</span> Add line</button></div>
      </div>
      <div class="flex items-center justify-end gap-4">
        <span class="text-body-lg">Total <strong class="font-headline-md text-primary" data-t>₹0.00</strong></span>
      </div>
      <label class="flex items-center gap-2 text-body-lg font-semibold cursor-pointer">
        <input type="checkbox" name="collect" checked> Collect payment / record settlement now
      </label>
      <div class="space-y-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant" data-pay>
        <div class="flex items-center gap-4 border-b border-outline-variant pb-2">
          <span class="text-body-sm font-medium text-on-surface-variant">Payment Method:</span>
          <label class="flex items-center gap-1.5 text-body-sm cursor-pointer font-medium">
            <input type="radio" name="pay_type" value="single" checked> Single mode
          </label>
          <label class="flex items-center gap-1.5 text-body-sm cursor-pointer font-medium">
            <input type="radio" name="pay_type" value="split"> Split payment
          </label>
          <label class="flex items-center gap-1.5 text-body-sm cursor-pointer font-medium">
            <input type="radio" name="pay_type" value="due"> Approved Due / Credit
          </label>
        </div>

        <!-- Single Mode -->
        <div class="space-y-3" data-single-wrap>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="field-label">Mode</label>
              <select class="field" name="single_mode">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="debit_card">Debit Card</option>
                <option value="credit_card">Credit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label class="field-label">Paying Now (₹)</label>
              <input class="field font-semibold" type="number" step="0.01" name="single_amount" value="0">
            </div>
            <div>
              <label class="field-label">Reference / Txn ID</label>
              <input class="field" name="single_ref" placeholder="Optional for Cash">
            </div>
          </div>
          <div class="hidden p-2 rounded-lg bg-warning-bg border border-warning/25 text-body-sm text-warning" data-single-due-box>
            <div class="flex items-center justify-between font-medium">
              <span>Partial payment detected</span>
              <span data-single-due-amt>Balance Due: ₹0.00</span>
            </div>
            <div class="mt-1.5 flex items-center gap-2">
              <label class="whitespace-nowrap text-on-surface-variant text-xs">Due reason:</label>
              <input class="field field-sm flex-1 text-xs" name="single_due_reason" placeholder="e.g. Balance to pay at next visit / discharge">
            </div>
          </div>
        </div>

        <!-- Split Mode -->
        <div class="hidden space-y-2.5" data-split-wrap>
          <div class="text-body-sm text-on-surface-variant flex items-center justify-between">
            <span>Split total across multiple payment modes:</span>
            <button type="button" class="btn-ghost btn-xs text-xs" data-fill-due>+ Add remaining as Due</button>
          </div>
          <div class="space-y-2" data-split-lines></div>
          <button type="button" class="btn-secondary btn-xs" data-add-split-line>
            <span class="material-symbols-outlined text-[15px]">add</span> Add payment mode
          </button>
        </div>

        <!-- Full Due / Credit Mode -->
        <div class="hidden space-y-2.5" data-due-wrap>
          <div class="p-2.5 rounded-lg bg-info-bg border border-info/25 text-body-sm text-info">
            Full bill amount will be recorded as <strong>Approved Due (Credit)</strong>. Patient or payer can settle at a later date.
          </div>
          <div>
            <label class="field-label">Due / Credit Reason *</label>
            <input class="field" name="full_due_reason" placeholder="e.g. Corporate employee / Family credit / Deferred payment">
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-body-sm text-on-surface-variant text-xs">Quick reasons:</span>
            <button type="button" class="btn-ghost btn-xs text-xs" data-quick-due="Patient will pay at next visit">Pay at next visit</button>
            <button type="button" class="btn-ghost btn-xs text-xs" data-quick-due="Doctor approved credit">Doctor approved</button>
            <button type="button" class="btn-ghost btn-xs text-xs" data-quick-due="Cash shortage — paying later">Cash shortage</button>
            <button type="button" class="btn-ghost btn-xs text-xs" data-quick-due="Corporate / TPA co-pay due">Corporate / TPA</button>
          </div>
        </div>

        <!-- Payment Live Summary -->
        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-outline-variant text-center font-data-mono text-body-sm">
          <div class="bg-surface rounded p-1.5">
            <div class="text-on-surface-variant text-[11px] font-sans uppercase">Bill Total</div>
            <div class="font-bold text-title-sm text-on-surface" data-sum-total>₹0.00</div>
          </div>
          <div class="bg-surface rounded p-1.5">
            <div class="text-on-surface-variant text-[11px] font-sans uppercase">Collecting Now</div>
            <div class="font-bold text-title-sm text-success" data-sum-paid>₹0.00</div>
          </div>
          <div class="bg-surface rounded p-1.5">
            <div class="text-on-surface-variant text-[11px] font-sans uppercase">Remaining Due</div>
            <div class="font-bold text-title-sm text-primary" data-sum-due>₹0.00</div>
          </div>
        </div>
      </div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Create bill</button>`,
    onMount(root, close) {
      const form = root.querySelector('[data-nb]');
      let currentBillTotal = 0;

      const calcPaymentSummary = () => {
        const payType = form.querySelector('input[name="pay_type"]:checked')?.value || 'single';
        let paid = 0;
        let due = 0;

        if (payType === 'due') {
          paid = 0;
          due = currentBillTotal;
        } else if (payType === 'single') {
          paid = Math.max(0, +form.single_amount.value || 0);
          due = Math.max(0, currentBillTotal - paid);
          const dueBox = root.querySelector('[data-single-due-box]');
          if (dueBox) {
            dueBox.classList.toggle('hidden', due <= 0.005);
            root.querySelector('[data-single-due-amt]').textContent = `Balance Due: ${money(due, 2)}`;
          }
        } else if (payType === 'split') {
          const lines = [...root.querySelectorAll('[data-split-row]')].map((r) => ({
            mode: r.querySelector('[data-split-mode]').value,
            amount: Math.max(0, +r.querySelector('[data-split-amt]').value || 0),
          }));
          paid = lines.filter(l => l.mode !== 'due').reduce((sum, l) => sum + l.amount, 0);
          const dueLine = lines.find(l => l.mode === 'due');
          due = dueLine ? dueLine.amount : Math.max(0, currentBillTotal - paid);
        }

        root.querySelector('[data-sum-total]').textContent = money(currentBillTotal, 2);
        root.querySelector('[data-sum-paid]').textContent = money(paid, 2);
        root.querySelector('[data-sum-due]').textContent = money(due, 2);
      };

      const syncBillTotalToPayment = (newTotal) => {
        currentBillTotal = newTotal;
        const payType = form.querySelector('input[name="pay_type"]:checked')?.value || 'single';
        if (payType === 'single') {
          form.single_amount.value = currentBillTotal;
        }
        calcPaymentSummary();
      };

      const packageDetail = () => {
        const p = packages.find(p => String(p.id) === form.package_id.value);
        const payer = root.querySelector('[data-package-kind]').value === 'payer';
        const payerMode = form.bill_type.value === 'PKG' && payer;
        root.querySelector('[data-payer-case]')?.classList.toggle('hidden', !payerMode);
        root.querySelector('[data-save]').disabled = payerMode;
        form.collect.disabled = payerMode;
        if (payerMode) { form.collect.checked = false; root.querySelector('[data-pay]').classList.add('hidden'); }
        root.querySelector('[data-package-detail]').textContent = payer
          ? `${p ? `${p.payer_name} · ${money(p.price)} · ${p.item_count} included services. ` : ''}TPA packages are assigned on Insurance & Payer Cases to the matching payer, with approval and patient-pay exclusions. This screen does not create a cash bill for a TPA contract.`
          : p ? `${money(p.price)} · ${p.item_count} included services${p.los_days ? ` · ${p.los_days}-day stay` : ''}. ${p.inclusions || p.description || ''}${p.exclusions ? ` Exclusions: ${p.exclusions}` : ''}` : 'Choose an active hospital package. Configure packages in the Packages screen.';
        const pkgAmt = !payer && p ? p.price : 0;
        if (form.bill_type.value === 'PKG') {
          root.querySelector('[data-t]').textContent = money(pkgAmt, 2);
          syncBillTotalToPayment(pkgAmt);
        }
      };

      const packageChoices = () => {
        const payer = root.querySelector('[data-package-kind]').value === 'payer';
        const choices = packages.filter(p => !!p.payer_id === payer);
        form.package_id.innerHTML = '<option value="">'+(choices.length ? 'Choose package…' : 'No active packages in this category')+'</option>' + choices.map(p => `<option value="${p.id}">${esc(p.name)} · ${esc(p.payer_name || 'Hospital')} · ${money(p.price)}</option>`).join('');
        packageDetail();
      };

      root.querySelector('[data-package-kind]').onchange = packageChoices;
      const payerCaseButton = root.querySelector('[data-payer-case]');
      if (payerCaseButton) payerCaseButton.onclick = () => { close(); navigate('/insurance'); };
      form.package_id.onchange = packageDetail;

      form.bill_type.onchange = () => {
        const pkg = form.bill_type.value === 'PKG';
        root.querySelector('[role="dialog"] h2').textContent = {LAB:'Laboratory bill',IMAGING:'Imaging bill',PKG:'Package bill',OP:opd?'OPD procedures & basic charges':'Create a bill'}[form.bill_type.value];
        root.querySelector('[data-packages]').classList.toggle('hidden', !pkg);
        root.querySelector('[data-services]').classList.toggle('hidden', pkg);
        form.collect.disabled = pkg && root.querySelector('[data-package-kind]').value === 'payer';
        packageDetail();
        body.replaceChildren(); if (!pkg) addLine(); if (!pkg) total();
      };
      packageChoices();

      patientPicker(root.querySelector('[data-picker]'), async (p) => {
        picked = p;
        showBillingContext(root.querySelector('[data-billing-context]'),p.id);
        form.encounter_id.innerHTML = '<option value="">Loading visits…</option>';
        try {
          const rows = await api.get('/encounters?patient_id=' + p.id);
          if (picked.id !== p.id) return;
          visits = rows.filter(e => e.kind === 'OP' && e.stage !== 'cancelled');
          form.encounter_id.innerHTML = '<option value="">Standalone bill — no visit link</option>' + visits.map(e => `<option value="${e.id}">${esc(e.encounter_no)} · ${fmtDate(e.visit_date)}</option>`).join('');
          if (visits.length) { form.encounter_id.value = visits[0].id; form.doctor_id.value = visits[0].doctor_id || ''; }
          showBillingContext(root.querySelector('[data-billing-context]'),p.id,form.encounter_id.value);
        } catch (err) { apiError(err, 'Could not load patient visits'); }
      }, { autofocus: true });

      form.encounter_id.onchange = () => { const visit = visits.find(v => String(v.id) === form.encounter_id.value); if (visit) form.doctor_id.value = visit.doctor_id || ''; if(picked)showBillingContext(root.querySelector('[data-billing-context]'),picked.id,form.encounter_id.value); };
      const body = root.querySelector('[data-lines]');
      const total = () => {
        let t = 0;
        [...body.children].forEach((tr) => {
          const q = +tr.querySelector('[data-q]').value || 0, r = +tr.querySelector('[data-r]').value || 0, d = +tr.querySelector('[data-d]').value || 0;
          const amt = q * r - d;
          tr.querySelector('[data-a]').textContent = money(amt, 2);
          t += amt;
        });
        root.querySelector('[data-t]').textContent = money(t, 2);
        syncBillTotalToPayment(t);
      };

      const addLine = () => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><select class="field field-sm" data-s><option value="">Select a service…</option>
            ${servicesFor(form.bill_type.value).map((s) => `<option value="${s.id}" data-p="${s.price}">${esc(s.name)}</option>`).join('')}</select></td>
          <td><input class="field field-sm text-center" type="number" data-q value="1"></td>
          <td><input class="field field-sm" type="number" step="0.01" data-r value="0"></td>
          <td><input class="field field-sm" type="number" step="0.01" data-d value="0"></td>
          <td class="num" data-a>₹0.00</td>
          <td class="text-right"><button type="button" class="btn-ghost btn-xs" data-rm><span class="material-symbols-outlined text-[15px]">close</span></button></td>`;
        body.append(tr);
        tr.querySelector('[data-s]').onchange = (e) => {
          tr.querySelector('[data-r]').value = e.target.selectedOptions[0].dataset.p || 0; total();
        };
      };
      root.querySelector('[data-add]').onclick = addLine;
      body.addEventListener('input', total);
      body.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { e.target.closest('tr').remove(); total(); } });

      // Payment Type Toggling
      form.collect.addEventListener('change', () => {
        root.querySelector('[data-pay]').classList.toggle('hidden', !form.collect.checked);
        if (form.collect.checked) calcPaymentSummary();
      });

      const updatePayTypeUI = () => {
        const type = form.querySelector('input[name="pay_type"]:checked')?.value || 'single';
        root.querySelector('[data-single-wrap]').classList.toggle('hidden', type !== 'single');
        root.querySelector('[data-split-wrap]').classList.toggle('hidden', type !== 'split');
        root.querySelector('[data-due-wrap]').classList.toggle('hidden', type !== 'due');
        if (type === 'split' && root.querySelector('[data-split-lines]').children.length === 0) {
          addSplitRow('cash', currentBillTotal);
        }
        calcPaymentSummary();
      };

      form.querySelectorAll('input[name="pay_type"]').forEach((radio) => {
        radio.addEventListener('change', updatePayTypeUI);
      });

      // Split lines logic
      const splitLinesHost = root.querySelector('[data-split-lines]');
      const addSplitRow = (mode = 'cash', amount = 0) => {
        const div = document.createElement('div');
        div.className = 'grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_36px] gap-2 items-center bg-surface p-2 rounded-lg border border-outline-variant';
        div.setAttribute('data-split-row', '');
        div.innerHTML = `
          <select class="field field-sm" data-split-mode>
            <option value="cash" ${mode === 'cash' ? 'selected' : ''}>Cash</option>
            <option value="upi" ${mode === 'upi' ? 'selected' : ''}>UPI</option>
            <option value="debit_card" ${mode === 'debit_card' ? 'selected' : ''}>Debit Card</option>
            <option value="credit_card" ${mode === 'credit_card' ? 'selected' : ''}>Credit Card</option>
            <option value="bank_transfer" ${mode === 'bank_transfer' ? 'selected' : ''}>Bank Transfer</option>
            <option value="cheque" ${mode === 'cheque' ? 'selected' : ''}>Cheque</option>
            <option value="due" ${mode === 'due' ? 'selected' : ''}>Approved Due</option>
          </select>
          <input class="field field-sm font-semibold" type="number" step="0.01" data-split-amt value="${amount}" placeholder="Amount ₹">
          <input class="field field-sm" data-split-ref placeholder="${mode === 'due' ? 'Due reason / note' : 'Reference / Txn ID'}">
          <button type="button" class="btn-ghost btn-xs text-danger" data-split-rm><span class="material-symbols-outlined text-[17px]">close</span></button>
        `;
        splitLinesHost.append(div);
        div.querySelector('[data-split-mode]').onchange = (e) => {
          if (e.target.value === 'due') div.querySelector('[data-split-ref]').placeholder = 'Due reason / note';
          else div.querySelector('[data-split-ref]').placeholder = 'Reference / Txn ID';
          calcPaymentSummary();
        };
        div.querySelector('[data-split-amt]').oninput = calcPaymentSummary;
        div.querySelector('[data-split-rm]').onclick = () => { div.remove(); calcPaymentSummary(); };
        calcPaymentSummary();
      };

      root.querySelector('[data-add-split-line]').onclick = () => {
        const rows = [...splitLinesHost.querySelectorAll('[data-split-row]')];
        const used = rows.reduce((s, r) => s + (+r.querySelector('[data-split-amt]').value || 0), 0);
        const rem = Math.max(0, currentBillTotal - used);
        addSplitRow('upi', rem);
      };

      root.querySelector('[data-fill-due]')?.addEventListener('click', () => {
        const rows = [...splitLinesHost.querySelectorAll('[data-split-row]')];
        const used = rows.reduce((s, r) => s + (+r.querySelector('[data-split-amt]').value || 0), 0);
        const rem = Math.max(0, currentBillTotal - used);
        if (rem <= 0) { toast('No remaining balance to mark as Due', 'info'); return; }
        addSplitRow('due', rem);
      });

      root.querySelectorAll('[data-quick-due]').forEach((btn) => {
        btn.onclick = () => { form.full_due_reason.value = btn.dataset.quickDue; };
      });

      form.single_amount.oninput = calcPaymentSummary;
      addLine();

      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        const pkg = form.bill_type.value === 'PKG' ? packages.find(p => String(p.id) === form.package_id.value) : null;
        if (form.bill_type.value === 'PKG' && root.querySelector('[data-package-kind]').value === 'payer') { toast('Assign this TPA package on the matching Insurance & Payer Case', 'warning'); return; }
        if (form.bill_type.value === 'PKG' && !pkg) { toast('Choose a hospital package', 'warning'); return; }
        const lines = pkg ? [{description: `${pkg.name} (package)`, category:'package',qty:1,rate:pkg.price}] : [...body.children].map((tr) => ({
          service_id: tr.querySelector('[data-s]').value || null,
          description: tr.querySelector('[data-s]').selectedOptions[0]?.textContent || 'Service',
          qty: +tr.querySelector('[data-q]').value, rate: +tr.querySelector('[data-r]').value,
          discount: +tr.querySelector('[data-d]').value,
        })).filter((l) => l.service_id || l.rate > 0);
        if (!lines.length) { toast('Add at least one charge', 'warning'); return; }
        if (opd && lines.some(l => l.rate <= 0 || l.qty <= 0)) { toast('Enter the procedure price and quantity. Request approved free treatment against the bill if needed.', 'warning'); return; }
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Creating');
        try {
          const payload = {
            patient_id: picked.id,
            encounter_id: +form.encounter_id.value || null,
            doctor_id: +form.doctor_id.value || null,
            bill_type: form.bill_type.value,
            package_id: pkg?.id,
            items: lines,
            collect: form.collect.checked,
          };

          if (form.collect.checked) {
            const payType = form.querySelector('input[name="pay_type"]:checked')?.value || 'single';
            if (payType === 'due') {
              payload.lines = [{
                mode: 'due',
                amount: currentBillTotal,
                reason: form.full_due_reason.value.trim() || 'Approved due',
              }];
            } else if (payType === 'split') {
              const splitRows = [...splitLinesHost.querySelectorAll('[data-split-row]')].map(r => ({
                mode: r.querySelector('[data-split-mode]').value,
                amount: Math.max(0, +r.querySelector('[data-split-amt]').value || 0),
                reference: r.querySelector('[data-split-ref]').value.trim() || undefined,
                reason: r.querySelector('[data-split-mode]').value === 'due' ? (r.querySelector('[data-split-ref]').value.trim() || 'Approved due balance') : undefined,
              })).filter(r => r.amount > 0);
              if (!splitRows.length) {
                toast('Add at least one payment mode with an amount', 'warning');
                busy(actionButton, false);
                return;
              }
              payload.lines = splitRows;
            } else {
              const sAmt = Math.max(0, +form.single_amount.value || 0);
              const sMode = form.single_mode.value;
              const sRef = form.single_ref.value.trim();
              const dueReason = form.single_due_reason?.value?.trim();
              if (sAmt < currentBillTotal && sAmt > 0) {
                payload.lines = [
                  { mode: sMode, amount: sAmt, reference: sRef || undefined },
                  { mode: 'due', amount: Math.max(0, currentBillTotal - sAmt), reason: dueReason || 'Balance due' },
                ];
              } else if (sAmt === 0) {
                payload.lines = [{ mode: 'due', amount: currentBillTotal, reason: dueReason || 'Approved due' }];
              } else {
                payload.mode = sMode;
                payload.collect_amount = sAmt;
                payload.reference = sRef || undefined;
              }
            }
          }

          const b = await api.post('/bills', payload);
          close();
          toast(`${b.bill_no} created · ${money(b.total)}`, 'success');
          after();
        } catch (e) { apiError(e, 'Could not create the bill'); busy(actionButton, false); }
      };
    },
  });
}

export async function printBill(id) {
  const b = await api.get(`/bills/${id}`);
  const s = state.meta.settings;
  printDocument(`${b.bill_no} — ${b.patient_name}`, `
    <div style="max-width:740px;margin:0 auto;font-family:Inter,Segoe UI,sans-serif;color:#172B4D">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px">
        <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(s.hospital_name)}</div>
          <div style="font-size:11px;color:#526176">${esc(s.address || '')}<br>GSTIN ${esc(s.gstin || '')} · ${esc(s.phone || '')}</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.08em">TAX INVOICE</div>
          <div style="font-size:12px;font-family:monospace">${esc(b.bill_no)}</div>
          <div style="font-size:11px;color:#526176">${esc(b.created_at)}</div></div>
      </div>
      <table style="width:100%;font-size:12px;margin-top:10px">
        <tr><td style="color:#526176;width:80px">Patient</td><td><b>${esc(b.patient_name)}</b> · ${b.age_years ?? ''}y ${esc(b.gender || '')}</td>
            <td style="color:#526176;width:70px">UHID</td><td style="font-family:monospace">${esc(b.uhid)}</td></tr>
        <tr><td style="color:#526176">Doctor</td><td>${esc(b.doctor_name || '—')}</td>
            <td style="color:#526176">Type</td><td>${esc(b.bill_type)}</td></tr><tr><td>Payer</td><td>${esc(b.payer_type||'self')}</td><td>Status</td><td>${esc(b.status)}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:14px">
        <thead><tr style="background:#F5F7FA">
          <th style="text-align:left;padding:7px;border-bottom:1px solid #D8DFE8">Particulars</th>
          <th style="text-align:right;padding:7px;border-bottom:1px solid #D8DFE8;width:50px">Qty</th>
          <th style="text-align:right;padding:7px;border-bottom:1px solid #D8DFE8;width:80px">Rate</th>
          <th style="text-align:right;padding:7px;border-bottom:1px solid #D8DFE8;width:90px">Amount</th></tr></thead>
        <tbody>${b.items.map((i) => `<tr>
          <td style="padding:7px;border-bottom:1px solid #EEF2F7">${esc(i.description)}</td>
          <td style="padding:7px;text-align:right;border-bottom:1px solid #EEF2F7">${i.qty}</td>
          <td style="padding:7px;text-align:right;border-bottom:1px solid #EEF2F7;font-family:monospace">${Number(i.rate).toFixed(2)}</td>
          <td style="padding:7px;text-align:right;border-bottom:1px solid #EEF2F7;font-family:monospace">${Number(i.amount).toFixed(2)}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="3" style="text-align:right;padding:5px 7px;color:#526176">Gross</td>
              <td style="text-align:right;padding:5px 7px;font-family:monospace">${Number(b.gross).toFixed(2)}</td></tr>
          ${b.discount ? `<tr><td colspan="3" style="text-align:right;padding:5px 7px;color:#526176">Discount</td>
              <td style="text-align:right;padding:5px 7px;font-family:monospace">− ${Number(b.discount).toFixed(2)}</td></tr>` : ''}
          ${b.tax ? `<tr><td colspan="3" style="text-align:right;padding:5px 7px;color:#526176">Tax</td>
              <td style="text-align:right;padding:5px 7px;font-family:monospace">${Number(b.tax).toFixed(2)}</td></tr>` : ''}
          <tr><td colspan="3" style="text-align:right;padding:7px;font-weight:700">Total</td>
              <td style="text-align:right;padding:7px;font-weight:700;font-family:monospace">${Number(b.total).toFixed(2)}</td></tr>
          <tr><td colspan="3" style="text-align:right;padding:5px 7px;color:#166534">Received</td>
              <td style="text-align:right;padding:5px 7px;font-family:monospace;color:#166534">${Number(b.paid).toFixed(2)}</td></tr>
          <tr><td colspan="3" style="text-align:right;padding:5px 7px;font-weight:700">Balance</td>
              <td style="text-align:right;padding:5px 7px;font-weight:700;font-family:monospace">${Number(b.balance).toFixed(2)}</td></tr>
        </tfoot></table>
      <div style="margin-top:36px;display:flex;justify-content:space-between;font-size:11px;color:#526176">
        <div>Computer generated invoice.</div><div style="text-align:center">_______________________<br>Authorised signatory</div></div>
    </div>`);
}
