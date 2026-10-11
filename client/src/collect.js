/**
 * Universal payment dialog — the one place money and approvals are recorded,
 * for OP, lab, imaging, pharmacy, IP, ER, procedures, OT and discharge bills.
 *
 * A bill can be cleared by any mix of lines: money (cash, UPI, cards, bank,
 * cheque), a payer taking the balance over (insurance, Aarogyasri, corporate,
 * credit, trust), approved free treatment, or an approved due. Each line is
 * stored separately with its reference, the user and the counter. The server
 * enforces every rule shown here; this dialog only makes them visible.
 */
import { api } from './api.js';
import { modal, esc, money, toast, printDocument, uid, pill } from './ui.js';
import { busy, apiError } from './views/_kit.js';
import { can, setting } from './store.js';
import {showBillingContext} from './billing-context.js';

export const MODES = {
  cash: { label: 'Cash', group: 'money', ref: false },
  upi: { label: 'UPI', group: 'money', ref: true, refLabel: 'UPI transaction ID' },
  debit_card: { label: 'Debit card', group: 'money', ref: true, refLabel: 'Card approval code' },
  credit_card: { label: 'Credit card', group: 'money', ref: true, refLabel: 'Card approval code' },
  bank_transfer: { label: 'Bank transfer', group: 'money', ref: true, refLabel: 'UTR / NEFT reference' },
  cheque: { label: 'Cheque', group: 'money', ref: true, refLabel: 'Cheque no. & bank' },
  insurance: { label: 'Insurance', group: 'payer', ref: true, refLabel: 'Pre-auth / claim no.' },
  aarogyasri: { label: 'Aarogyasri', group: 'payer', ref: true, refLabel: 'Pre-auth no.' },
  corporate: { label: 'Corporate', group: 'payer', ref: true, refLabel: 'Authorisation letter' },
  // credit is the patient paying later: use "Due — credit / pay later" below (kept only for old records)
  credit: { label: 'Credit', group: 'hidden', ref: false },
  trust: { label: 'Trust', group: 'payer', ref: false, reason: true },
  free: { label: 'Free (approved)', group: 'approval', reason: true },
  due: { label: 'Due — credit / pay later (approved)', group: 'approval', reason: true },
};
export const CATEGORIES = [
  ['self', 'Normal / cash'], ['insurance', 'Insurance'], ['aarogyasri', 'Aarogyasri'], ['corporate', 'Corporate'],
  ['credit', 'Credit — pays later'], ['trust', 'Trust'], ['free', 'Free'], ['due', 'Due'],
];
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;

function modeOptions(selected) {
  const allowAuth = can('payment.authorize');
  const groups = [['money', 'Money received'], ['payer', 'Billed to a payer'], ['approval', 'Approval (no money)']];
  return groups.filter(([g]) => g === 'money' || (g==='payer'?(can('insurance.write')||can('admin.write')):(allowAuth || can('payment.collect')))).map(([g, label]) => `<optgroup label="${label}">${
    Object.entries(MODES).filter(([k, m]) => m.group === g && (g !== 'approval' || allowAuth || k === 'free')).map(([k, m]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${k === 'free' && !can('payment.approve_free') ? 'Request free approval' : m.label}</option>`).join('')
  }</optgroup>`).join('');
}

function lineHTML(mode = 'cash', amount = '') {
  // phone: mode · amount · remove on one row, reference below; wider screens: one row
  return `<div data-line class="grid gap-2 items-start p-2.5 rounded-lg border border-outline-variant bg-white
      grid-cols-[minmax(0,1fr)_96px_32px] md:grid-cols-[minmax(150px,1.1fr)_120px_minmax(160px,1.6fr)_32px]">
    <select class="field field-sm !h-9" data-mode aria-label="Payment mode">${modeOptions(mode)}</select>
    <input class="field field-sm !h-9 text-right font-data-mono" data-amount type="number" min="0.01" step="0.01" value="${amount}" aria-label="Amount">
    <div class="space-y-1.5 col-span-3 order-4 md:col-span-1 md:order-none empty:hidden" data-extra></div>
    <button type="button" class="btn-ghost !h-9 !w-8 !px-0 order-3 md:order-none" data-remove aria-label="Remove line" title="Remove line">
      <span class="material-symbols-outlined text-[18px]">close</span></button>
  </div>`;
}

function extraFor(mode, patient) {
  const m = MODES[mode];
  let h = '';
  if (m.ref) h += `<input class="field field-sm !h-9" data-ref placeholder="${esc(m.refLabel)} (optional)" aria-label="${esc(m.refLabel)}, optional">`;
  if (m.group === 'payer') h += `<input class="field field-sm !h-9" data-payer placeholder="Payer name" value="${esc(patient?.payer_name || '')}" aria-label="Payer name">`;
  if (m.reason) h += `<input class="field field-sm !h-9" data-reason placeholder="Reason (recorded in audit)" aria-label="Reason">`;
  if (!h) h = '<div class="h-9 flex items-center text-body-sm text-on-surface-variant">No reference needed</div>';
  return h;
}

/** Open the payment dialog for a bill. `after(result)` runs once it is saved. */
export async function collectBill(billId, after, { mode: preferMode = null, reference: preferRef = '' } = {}) {
  let bill;
  try { bill = await api.get(`/bills/${billId}`); } catch (err) { apiError(err, 'Could not open the bill'); return; }
  if (bill.status === 'cancelled') { toast('This bill is cancelled', 'warning'); return; }
  if (['insurance','aarogyasri','corporate','trust'].includes(bill.payer_type) && !(bill.patient_due > 0)) {
    toast('This balance is pending with the payer. Use Insurance & Payer Cases for approval and Payer Receivables when money is received.', 'info'); return;
  }
  // An inpatient bill takes deposits: money may exceed what has accrued so far.
  const ip = bill.bill_type === 'IP';
  if (bill.balance <= 0.005 && !ip) { toast('Nothing outstanding on this bill', 'info'); return; }
  const due0 = Math.max(0, bill.payer_pending > 0 ? bill.patient_due : bill.balance);
  const key = `pay-${uid(12)}`;
  const patient = { payer_name: bill.payer_name };
  const prior = [...(bill.payments || []).filter((p) => !p.cancelled).map((p) => ({ label: MODES[p.mode]?.label || p.mode, amount: p.amount, ref: p.receipt_no })),
    ...(bill.settlements || []).filter((s) => s.status !== 'cancelled').map((s) => ({ label: MODES[s.mode]?.label || s.mode, amount: s.amount, ref: s.settlement_no }))];
  const defaultMode = bill.payer_pending > 0 ? null : { insurance: 'insurance', aarogyasri: 'aarogyasri', corporate: 'corporate', trust: 'trust' }[bill.payer_type];

  modal({
    title: bill.payer_pending > 0 ? 'Collect patient co-pay / exclusions' : ip ? 'IP bill — collect deposit or dues' : 'Collect payment',
    subtitle: `${esc(bill.bill_no)} · ${esc(bill.patient_name || '')} · ${esc(bill.uhid || '')}`,
    size: 'lg',
    body: `
      <div class="rounded border border-outline-variant p-3 mb-4 text-body-sm"><strong>${bill.encounter_kind==='IP'||ip?'IPD — inpatient':bill.encounter_kind==='EMG'||bill.bill_type==='ER'?'ER — emergency':bill.bill_type==='PHARM'?'Pharmacy':'OPD / outpatient services'}</strong> · <strong>${esc(({self:'Self-pay',insurance:'Insurance / TPA',aarogyasri:'Aarogyasri',corporate:'Corporate credit',trust:'Trust',credit:'Credit',free:'Free treatment',due:'Approved due'})[bill.payer_type]||bill.payer_type)}</strong><br>Payer: ${esc(bill.payer_name||(['self','credit'].includes(bill.payer_type)?(bill.payer_type==='credit'?'Patient (credit — pays later)':'Patient'):'Verify payer details'))}<br>Patient share: ${money(bill.patient_due??bill.balance,2)} · Payer pending: ${money(bill.payer_pending||0,2)}</div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        ${[[ip ? 'Charges so far' : 'Bill total', bill.total], ['Paid', bill.paid], ['Covered / free', r2((bill.covered_amount || 0) + (bill.waived_amount || 0))], [bill.balance < 0 ? 'Advance held' : 'Outstanding', Math.abs(bill.balance)]]
          .map(([l, v], i) => `<div class="rounded-lg ${i === 3 ? 'bg-primary-fixed' : 'bg-surface-container-low'} px-3 py-2">
            <div class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">${l}</div>
            <div class="font-data-mono text-title-md ${i === 3 ? 'text-primary' : ''}">${money(v, 2)}</div></div>`).join('')}
      </div>
      ${prior.length ? `<details class="mb-3"><summary class="text-body-md text-on-surface-variant cursor-pointer">Already recorded on this bill (${prior.length})</summary>
        <ul class="mt-2 text-body-md space-y-1">${prior.map((p) => `<li class="flex justify-between"><span>${esc(p.label)} · <span class="font-data-mono">${esc(p.ref)}</span></span><span class="font-data-mono">${money(p.amount, 2)}</span></li>`).join('')}</ul></details>` : ''}
      <div data-patient-billing-summary class="mb-3"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div><label class="field-label">Patient financial category</label>
          <select class="field" data-category ${(can('insurance.write')||can('admin.write')) ? '' : 'disabled'}>${CATEGORIES.map(([v, l]) => `<option value="${v}" ${bill.payer_type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${(can('insurance.write')||can('admin.write')) ? '' : '<p class="text-body-sm text-on-surface-variant mt-1">Self-pay turning to TPA / Aarogyasri / corporate / trust: use “Change payer” on the admission or ask the Insurance desk — the payer pays once they approve the case.</p>'}</div>
        <div class="flex items-end gap-2 flex-wrap">
          <button type="button" class="btn-secondary btn-sm" data-quick="cash">Full balance in cash</button>
          <button type="button" class="btn-secondary btn-sm" data-quick="upi">Full balance by UPI</button>
        </div>
      </div>
      <div class="flex items-center justify-between mb-1.5">
        <label class="field-label !mb-0">Payment lines</label>
        <span class="text-body-sm text-on-surface-variant">Alt+A adds a line · Ctrl+Enter saves</span>
      </div>
      ${ip ? `<p class="text-body-md mb-2 rounded-lg bg-info-bg px-3 py-2">Inpatient running bill — daily bed and ward charges keep adding every 24 hours. You can take an advance deposit larger than today's charges; any unused amount is returned at discharge.</p>` : ''}
      <div class="space-y-2" data-lines>${lineHTML(defaultMode && can('payment.authorize') ? defaultMode : MODES[preferMode]?.group === 'money' ? preferMode : 'cash', due0 || '')}</div>
      <button type="button" class="btn-ghost btn-sm mt-2" data-add><span class="material-symbols-outlined text-[16px]">add</span>Add another mode</button>
      <div class="mt-3 rounded-lg border border-outline-variant p-3 grid grid-cols-3 gap-2 text-center" aria-live="polite">
        <div><div class="font-label-sm text-label-sm uppercase text-on-surface-variant">Money received</div><div class="font-data-mono text-title-md" data-sum-money>—</div></div>
        <div><div class="font-label-sm text-label-sm uppercase text-on-surface-variant">Payer / approved</div><div class="font-data-mono text-title-md" data-sum-other>—</div></div>
        <div><div class="font-label-sm text-label-sm uppercase text-on-surface-variant">Still due</div><div class="font-data-mono text-title-md" data-sum-left>—</div></div>
      </div>
      <p class="text-body-sm text-danger mt-2 hidden" data-error role="alert"></p>
      <label class="field-label mt-3">Notes</label>
      <input class="field" data-notes placeholder="Optional — printed on the receipt">
      <p class="text-body-sm text-on-surface-variant mt-2">Only money creates a receipt. Insurance, Aarogyasri, corporate and trust lines move the amount to that payer's receivable. Credit patients pay later: their bill is already an approved due, so take money when they pay. Free treatment is recorded at full value but is never counted as income collected. A due line must clear the whole remaining balance.</p>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save payment</button>`,
    onMount(root, close) {
      showBillingContext(root.querySelector('[data-patient-billing-summary]'),bill.patient_id,bill.encounter_id);
      const q = (s) => root.querySelector(s);
      const host = q('[data-lines]');
      const setExtra = (line) => { line.querySelector('[data-extra]').innerHTML = extraFor(line.querySelector('[data-mode]').value, patient); };
      [...host.children].forEach(setExtra);
      // the mode and reference chosen on the desk's own form carry into the first line
      if (preferRef) { const ref = host.querySelector('[data-ref]'); if (ref) ref.value = preferRef; }
      const read = () => [...host.querySelectorAll('[data-line]')].map((l) => ({
        mode: l.querySelector('[data-mode]').value,
        amount: r2(+l.querySelector('[data-amount]').value || 0),
        reference: l.querySelector('[data-ref]')?.value.trim() || undefined,
        transaction_id: l.querySelector('[data-ref]')?.value.trim() || undefined,
        payer_name: l.querySelector('[data-payer]')?.value.trim() || undefined,
        reason: l.querySelector('[data-reason]')?.value.trim() || undefined,
      }));
      const validate = () => {
        const lines = read();
        const sumMoney = r2(lines.filter((l) => MODES[l.mode].group === 'money').reduce((s, l) => s + l.amount, 0));
        const sumOther = r2(lines.filter((l) => MODES[l.mode].group !== 'money').reduce((s, l) => s + l.amount, 0));
        const left = r2(due0 - sumMoney - sumOther);
        q('[data-sum-money]').textContent = money(sumMoney, 2);
        q('[data-sum-other]').textContent = money(sumOther, 2);
        q('[data-sum-left]').textContent = ip && left < -0.005 ? `Advance ${money(-left, 2)}` : money(left, 2);
        q('[data-sum-left]').className = `font-data-mono text-title-md ${left < -0.005 ? (ip ? 'text-info' : 'text-danger') : left > 0.005 ? 'text-warning' : 'text-success'}`;
        let err = '';
        if (lines.some((l) => !(l.amount > 0))) err = 'Every line needs an amount above zero.';
        else if (left < -0.005 && !(ip && sumOther <= due0 + 0.005)) err = `Lines exceed the outstanding balance by ${money(-left, 2)}.`;
        else if (lines.some((l) => l.mode === 'due') && Math.abs(left) > 0.005) err = 'A due line must clear the whole remaining balance.';
        else if (lines.some((l) => MODES[l.mode].reason && !l.reason)) err = 'Free, due and trust lines need a reason.';
        q('[data-error]').textContent = err;
        q('[data-error]').classList.toggle('hidden', !err);
        q('[data-save]').disabled = !!err;
        return !err;
      };
      const add = (mode = 'cash', amount = '') => {
        if (host.children.length >= 12) return;
        host.insertAdjacentHTML('beforeend', lineHTML(mode, amount));
        setExtra(host.lastElementChild);
        host.lastElementChild.querySelector('[data-amount]').focus();
        validate();
      };
      q('[data-add]').onclick = () => {
        const left = r2(due0 - read().reduce((s, l) => s + l.amount, 0));
        add('cash', left > 0 ? left : '');
      };
      host.addEventListener('change', (e) => { if (e.target.matches('[data-mode]')) setExtra(e.target.closest('[data-line]')); validate(); });
      host.addEventListener('input', validate);
      host.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove]') && host.children.length > 1) { e.target.closest('[data-line]').remove(); validate(); }
      });
      root.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = () => {
        host.innerHTML = lineHTML(b.dataset.quick, due0 || '');
        setExtra(host.firstElementChild);
        validate();
      }));
      const save = async () => {
        if (!validate()) return;
        const btn = q('[data-save]');
        busy(btn, true, 'Saving');
        try {
          // Without approval rights a free line becomes a request; the rest is recorded now.
          const all = read();
          const freeAsk = can('payment.approve_free') ? [] : all.filter((l) => l.mode === 'free');
          const lines = all.filter((l) => !freeAsk.includes(l));
          let r = { bill, received: 0, receipts: [], settlements: [] };
          if (lines.length) {
            r = await api.post(`/bills/${bill.id}/settle`, {
              request_key: key, lines, category: q('[data-category]').value, notes: q('[data-notes]').value.trim() || undefined,
            });
          }
          if (freeAsk.length) {
            await api.post('/approvals/request', { bill_id: bill.id, reason: freeAsk.map((l) => l.reason).join('; ') });
            close();
            toast('Sent for free approval — an approver will clear the remaining balance', 'success', { title: r.received ? `${money(r.received, 2)} received` : 'Request saved' });
            after?.(r);
            return;
          }
          close();
          toast(r.received ? `${money(r.received, 2)} received` : 'Approval recorded', 'success', {
            title: r.bill.balance > 0.005 ? `Still due ${money(r.bill.balance, 2)}` : 'Bill cleared',
            action: { label: 'Print receipt', run: () => printReceipt(bill, r) },
          });
          after?.(r);
        } catch (err) { apiError(err, 'Payment not saved'); busy(btn, false); }
      };
      q('[data-save]').onclick = save;
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
        if (e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); q('[data-add]').click(); }
      });
      validate();
    },
  });
}
export const openPayment = collectBill;

export function printReceipt(bill, r) {
  const name = setting?.('hospital_name') || 'Hospital';
  const lines = [...(r.receipts || []).map((p) => ({ no: p.receipt_no, mode: MODES[p.mode]?.label || p.mode, ref: p.reference, amount: p.amount })),
    ...(r.settlements || []).map((s) => ({ no: s.settlement_no, mode: MODES[s.mode]?.label || s.mode, ref: s.reference || s.payer_name, amount: s.amount }))];
  printDocument('Receipt', `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #881D2C;padding-bottom:8px">
      <div><div style="font-size:18px;font-weight:700">${esc(name)}</div><div>${esc(setting?.('address') || '')}</div></div>
      <div style="text-align:right"><div style="font-size:15px;font-weight:600">Payment receipt</div><div>${esc(new Date().toLocaleString('en-IN'))}</div></div>
    </div>
    <p style="margin:10px 0">${esc(bill.patient_name || '')} · ${esc(bill.uhid || '')} · Bill ${esc(bill.bill_no)}</p>
    <table class="tbl"><thead><tr><th>Ref</th><th>Mode</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${lines.map((l) => `<tr><td>${esc(l.no)}</td><td>${esc(l.mode)}</td><td>${esc(l.ref || '—')}</td><td style="text-align:right">${money(l.amount, 2)}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:10px">Money received <b>${money(r.received || 0, 2)}</b> · Balance due <b>${money(r.bill.balance, 2)}</b></p>
    <p style="margin-top:28px;color:#526176">Collected by ${esc(r.receipts?.[0]?.received_by_name || '')}. This is a computer-generated receipt.</p>`);
}

export { pill };
