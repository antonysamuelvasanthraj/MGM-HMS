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
import { can, setting, state } from './store.js';
import { openPayerChange, canChangePayer } from './payer-change.js';

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
  if (m.ref) {
    const need = setting('require_digital_reference', '0') === '1' && mode !== 'cash';
    h += `<input class="field field-sm !h-9" data-ref placeholder="${esc(m.refLabel)}${need ? ' — required' : ' (optional)'}" aria-label="${esc(m.refLabel)}${need ? '' : ', optional'}" ${need ? 'required' : ''}>`;
  }
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
  if (bill.balance <= 0.005 && !ip) { paidWindow(bill, null, after); return; }
  const due0 = ip&&bill.package_usage?0:Math.max(0, bill.payer_pending > 0 ? bill.patient_due : bill.balance);
  // Optional direct-to-doctor: offered on an OP visit still waiting for vitals, when Settings allows it.
  // Unticked (the default) keeps the usual registration → vitals → doctor flow.
  const directOffer = setting('op_direct_doctor_option', '1') !== '0' && bill.encounter_id && bill.encounter_kind === 'OP'
    && ['registered', 'vitals_pending'].includes(bill.encounter_stage) && !bill.direct_to_doctor;
  const key = `pay-${uid(12)}`;
  const patient = { payer_name: bill.payer_name };
  const prior = [...(bill.payments || []).filter((p) => !p.cancelled).map((p) => ({ label: MODES[p.mode]?.label || p.mode, amount: p.amount, ref: p.receipt_no })),
    ...(bill.settlements || []).filter((s) => s.status !== 'cancelled').map((s) => ({ label: MODES[s.mode]?.label || s.mode, amount: s.amount, ref: s.settlement_no }))];
  // This desk collects the confirmed patient share; assigning it to a payer is an explicit decision.
  const defaultMode = MODES[preferMode]?.group === 'money' ? preferMode : 'cash';

  modal({
    title: bill.payer_pending > 0 ? 'Collect patient co-pay / exclusions' : ip ? 'IP bill — collect deposit or dues' : 'Collect payment',
    subtitle: `${esc(bill.bill_no)} · ${esc(bill.patient_name || '')} · ${esc(bill.uhid || '')}`,
    size: 'lg',
    body: `
      <div class="rounded-lg border border-outline-variant p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span class="font-label-lg">${bill.encounter_kind==='IP'||ip?'IPD — inpatient':bill.encounter_kind==='EMG'||bill.bill_type==='ER'?'ER — emergency':bill.bill_type==='PHARM'?'Pharmacy':'OPD — outpatient'}</span>
        <label class="flex items-center gap-2"><span class="text-body-sm text-on-surface-variant">Who pays</span>
          <select class="field field-sm !w-auto" data-category title="Who pays this bill" ${(can('insurance.write')||can('admin.write')||canChangePayer(ip)) ? '' : 'disabled'}>${CATEGORIES.map(([v, l]) => `<option value="${v}" ${(bill.payer_type || 'self') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${bill.payer_name && !['self','credit'].includes(bill.payer_type) ? `<span class="text-body-sm">${esc(bill.payer_name)}</span>` : ''}
        ${bill.payer_pending > 0 ? `<span class="text-body-sm">Patient share ${money(bill.patient_due ?? bill.balance, 2)} · payer pending ${money(bill.payer_pending, 2)}</span>` : ''}
        <span class="text-body-sm text-on-surface-variant w-full">Choosing insurance, Aarogyasri, corporate or trust opens <b>Change payer</b> for this visit (approval and case); cash, credit, free or due apply to this payment only.</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        ${[[ip ? 'Charges so far' : 'Bill total', bill.total], ['Paid', bill.paid], ['Covered / free', r2((bill.covered_amount || 0) + (bill.waived_amount || 0))], [bill.balance < 0 ? 'Advance held' : 'Outstanding', Math.abs(bill.balance)]]
          .map(([l, v], i) => `<div class="rounded-lg ${i === 3 ? 'bg-primary-fixed' : 'bg-surface-container-low'} px-3 py-2">
            <div class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">${l}</div>
            <div class="font-data-mono text-title-md ${i === 3 ? 'text-primary' : ''}">${money(v, 2)}</div></div>`).join('')}
      </div>
      ${itemsBlock(bill)}
      ${packageOffer(bill) ? `<div class="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-outline-variant p-3"><div class="flex-1 min-w-[220px]"><label class="field-label">Apply a package (self-pay)</label>
        <select class="field" data-pkg><option value="">— no package —</option></select></div><button type="button" class="btn-secondary btn-sm" data-pkg-apply>Apply package</button>
        <p class="w-full text-body-sm text-on-surface-variant">The package price is added and the services it covers are adjusted off this bill.</p></div>` : ''}
      ${prior.length ? `<details class="mb-3"><summary class="text-body-md text-on-surface-variant cursor-pointer">Already recorded on this bill (${prior.length})</summary>
        <ul class="mt-2 text-body-md space-y-1">${prior.map((p) => `<li class="flex justify-between"><span>${esc(p.label)} · <span class="font-data-mono">${esc(p.ref)}</span></span><span class="font-data-mono">${money(p.amount, 2)}</span></li>`).join('')}</ul></details>` : ''}
      <div data-patient-billing-summary class="mb-3"></div>
      <div class="mb-3">
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
      <div class="space-y-2" data-lines>${lineHTML(defaultMode, due0 || '')}</div>
      <button type="button" class="btn-ghost btn-sm mt-2" data-add><span class="material-symbols-outlined text-[16px]">add</span>Add another mode</button>
      <div class="mt-3 rounded-lg border border-outline-variant p-3 grid grid-cols-3 gap-2 text-center" aria-live="polite">
        <div><div class="font-label-sm text-label-sm uppercase text-on-surface-variant">Money received</div><div class="font-data-mono text-title-md" data-sum-money>—</div></div>
        <div><div class="font-label-sm text-label-sm uppercase text-on-surface-variant">Payer / approved</div><div class="font-data-mono text-title-md" data-sum-other>—</div></div>
        <div><div class="font-label-sm text-label-sm uppercase text-on-surface-variant">Still due</div><div class="font-data-mono text-title-md" data-sum-left>—</div></div>
      </div>
      <p class="text-body-sm text-danger mt-2 hidden" data-error role="alert"></p>
      <label class="field-label mt-3">Notes</label>
      <input class="field" data-notes placeholder="Optional — printed on the receipt">
      ${directOffer ? `<label class="mt-3 flex items-start gap-2 rounded-lg border border-outline-variant p-3 text-body-md cursor-pointer">
        <input type="checkbox" data-direct class="mt-0.5">
        <span><strong>Send directly to the doctor</strong> — skip the vitals queue for this visit.
        <span class="block text-body-sm text-on-surface-variant">Leave unticked for the normal flow: vitals station first, then the doctor.</span></span></label>` : ''}
      <p class="text-body-sm text-on-surface-variant mt-2">Only money creates a receipt. Insurance, Aarogyasri, corporate and trust lines move the amount to that payer's receivable. Credit patients pay later: their bill is already an approved due, so take money when they pay. Free treatment is recorded at full value but is never counted as income collected. A due line must clear the whole remaining balance.</p>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save payment</button>`,
    onMount(root, close) {
      // only what matters at this counter: does the patient owe anything on other bills?
      api.get(`/bills?patient_id=${bill.patient_id}`).then((d) => {
        const other = (d.rows || d).filter((b) => b.id !== bill.id && b.status !== 'cancelled' && b.balance > 0.5 && b.bill_type !== 'IP' && ['unpaid', 'partial'].includes(b.status));
        const host = root.querySelector('[data-patient-billing-summary]');
        if (host && other.length) host.innerHTML = `<div class="rounded-lg bg-warning-bg px-3 py-2 text-body-md">This patient also owes <b>${money(other.reduce((t, b) => t + b.balance, 0), 2)}</b> on ${other.length} earlier bill${other.length > 1 ? 's' : ''}
          (${other.slice(0, 3).map((b) => `<a class="underline" href="/bills?bill=${b.id}">${esc(b.bill_no)}</a>`).join(', ')}) — collect it on that bill, not here.</div>`;
      }).catch(() => {});
      // who pays: a payer needs a case (and approval) — open Change payer; the rest apply to this payment
      const cat = root.querySelector('[data-category]');
      cat?.addEventListener('change', async () => {
        const v = cat.value;
        if (['insurance', 'aarogyasri', 'corporate', 'trust'].includes(v) && v !== bill.payer_type) {
          cat.value = bill.payer_type || 'self';
          if (!bill.encounter_id) { toast('This bill has no visit; change the payer from Insurance & Payers', 'warning'); return; }
          if (!canChangePayer(ip)) { toast('Ask the insurance desk to change the payer', 'warning'); return; }
          close(); openPayerChange(bill.encounter_id, () => collectBill(billId, after), { category: v });
        }
      });
      const reopen = () => { close(); collectBill(billId, after, { mode: preferMode, reference: preferRef }); };
      root.querySelectorAll('[data-line-disc]').forEach((b) => { b.onclick = () => discountWindow(bill, bill.items.find((i) => i.id === +b.dataset.lineDisc), reopen); });
      root.querySelector('[data-bill-disc]')?.addEventListener('click', () => discountWindow(bill, null, reopen));
      if (packageOffer(bill)) {
        api.get('/packages').then((list) => {
          const sel = root.querySelector('[data-pkg]'); if (!sel) return;
          sel.innerHTML += (list.rows || list).filter((k) => k.active && !k.payer_id).map((k) => `<option value="${k.id}">${esc(k.name)} — ${money(k.price)}</option>`).join('');
        }).catch(() => {});
        root.querySelector('[data-pkg-apply]').onclick = async (ev) => {
          const id = +root.querySelector('[data-pkg]').value; if (!id) { toast('Choose a package', 'warning'); return; }
          busy(ev.currentTarget, true, 'Applying');
          try { await api.post(`/bills/${bill.id}/package`, { package_id: id }); toast('Package applied — bill recalculated', 'success'); reopen(); }
          catch (err) { apiError(err, 'Package not applied'); busy(ev.currentTarget, false); }
        };
      }
      const q = (s) => root.querySelector(s);
      const host = q('[data-lines]');
      const setExtra = (line) => {
        const extra = line.querySelector('[data-extra]');
        // Changing the mode re-renders this cell, and modes like cash have no reference
        // field at all — so keep the typed values in a stash on the line, not in the DOM.
        const stash = line._extraStash || (line._extraStash = {});
        for (const k of ['ref', 'payer', 'reason']) {
          const el = extra.querySelector(`[data-${k}]`);
          if (el && el.value) stash[k] = el.value;
        }
        extra.innerHTML = extraFor(line.querySelector('[data-mode]').value, patient);
        for (const k of ['ref', 'payer', 'reason']) {
          const el = extra.querySelector(`[data-${k}]`);
          if (el && stash[k]) el.value = stash[k];
        }
      };
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
        else if (setting('require_digital_reference', '0') === '1' && lines.some((l) => MODES[l.mode]?.group === 'money' && l.mode !== 'cash' && !l.reference)) err = 'Enter the transaction ID / approval code / cheque number for every UPI, card, bank or cheque line.';
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
          if (directOffer && q('[data-direct]')?.checked) {
            try { await api.post(`/encounters/${bill.encounter_id}/direct-to-doctor`, {}); toast('Sent directly to the doctor’s queue — vitals skipped', 'info'); }
            catch (err) { apiError(err, 'Payment saved, but the visit could not be sent directly to the doctor'); }
          }
          close();
          if (r.bill.balance <= 0.005 && !ip) { paidWindow(bill, r, after); return; }
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

const canDiscount = () => can('billing.discount') || can('payment.authorize');
const isPharmacyLine = (i, bill) => bill.bill_type === 'PHARM' || !!i.batch_id || ['pharmacy', 'medicine', 'drug'].includes(String(i.category || '').toLowerCase());
/** Self-pay / credit OP bill with no package yet: the desk may apply one. */
const packageOffer = (bill) => canDiscount() && !['IP', 'PHARM'].includes(bill.bill_type) && ['self', 'credit', ''].includes(bill.payer_type || 'self') && !bill.package_id && bill.status !== 'cancelled';

/** What was billed, line by line, with the discounts — shown in the payment window. */
function itemsBlock(bill) {
  const items = (bill.items || []).filter((i) => !i.waiver_of || i.amount);
  if (!items.length) return '';
  const allow = canDiscount() && bill.status !== 'cancelled';
  return `<div class="mb-3 rounded-lg border border-outline-variant overflow-hidden"><table class="tbl"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Amount</th>${allow ? '<th></th>' : ''}</tr></thead><tbody>
    ${items.map((i) => `<tr><td class="text-body-md">${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${money(i.rate, 2)}</td>
      <td class="num ${i.discount > 0 ? 'text-success' : 'text-on-surface-variant'}">${i.discount > 0 ? `−${money(i.discount, 2)}` : '—'}</td><td class="num font-semibold">${money(i.amount, 2)}</td>
      ${allow ? `<td class="text-right">${i.amount > 0 && !i.waiver_of && !isPharmacyLine(i, bill) ? `<button type="button" class="btn-ghost btn-xs" data-line-disc="${i.id}">Discount</button>` : ''}</td>` : ''}</tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4" class="text-right text-on-surface-variant">Bill discount${bill.discount_reason ? ` — ${esc(bill.discount_reason)}` : ''}</td>
      <td class="num ${bill.discount > 0 ? 'text-success' : ''}">${bill.discount > 0 ? `−${money(bill.discount, 2)}` : '—'}</td>
      ${allow ? `<td class="text-right">${bill.bill_type !== 'PHARM' ? '<button type="button" class="btn-ghost btn-xs" data-bill-disc>Change</button>' : ''}</td>` : ''}</tr></tfoot></table></div>`;
}

/** Line discount (item set) or the overall bill discount (item null): raise, lower or remove it, with reason and approver. */
function discountWindow(bill, item, done) {
  const gross = item ? Math.round(item.qty * item.rate * 100) / 100 : null;
  const current = item ? (item.discount || 0) : (bill.discount || 0);
  const staff = (state.meta?.staff || []).map((s) => s.name).filter(Boolean);
  modal({ title: item ? `Discount — ${esc(item.description)}` : 'Overall bill discount', size: 'sm', stack: true,
    body: `<p class="text-body-sm text-on-surface-variant mb-2">${item ? `Line value ${money(gross, 2)} · current discount ${money(current, 2)}` : `Bill ${esc(bill.bill_no)} · current bill discount ${money(current, 2)} · outstanding ${money(bill.balance, 2)}`}. Enter 0 to remove it.</p>
      <div class="grid grid-cols-2 gap-2"><div><label class="field-label">Discount ₹</label><input class="field" type="number" min="0" step="0.01" data-d-amt value="${current || ''}"></div>
        ${item ? '<div><label class="field-label">or %</label><input class="field" type="number" min="0" max="100" step="0.01" data-d-pct></div>' : '<div></div>'}</div>
      <label class="field-label mt-2">Reason *</label><input class="field" data-d-reason value="${esc(item ? '' : bill.discount_reason || '')}" placeholder="e.g. senior citizen, staff family, doctor concession">
      <label class="field-label mt-2">Approved by *</label><input class="field" data-d-by list="disc-approvers" placeholder="Name of the person approving"><datalist id="disc-approvers">${staff.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-d-save>Save discount</button>',
    onMount(root, close) {
      const q = (s) => root.querySelector(s);
      q('[data-d-pct]')?.addEventListener('input', (e) => { const p = +e.target.value; if (p >= 0 && gross) q('[data-d-amt]').value = Math.round(gross * Math.min(100, p)) / 100; });
      q('[data-d-save]').onclick = async (ev) => {
        const amount = +q('[data-d-amt]').value || 0, reason = q('[data-d-reason]').value.trim(), by = q('[data-d-by]').value.trim();
        if (amount > 0 && (!reason || !by)) { toast('Reason and approver are required for a discount', 'warning'); return; }
        busy(ev.currentTarget, true, 'Saving');
        try {
          if (item) await api.patch(`/bills/${bill.id}/items/${item.id}/discount`, { discount: amount, reason, approved_by: by });
          else await api.patch(`/bills/${bill.id}`, { discount: amount, discount_reason: amount > 0 ? [reason, by && `approved by ${by}`].filter(Boolean).join(' — ') : (reason || 'Bill discount removed') });
          close(); toast(amount > 0 ? `Discount ${money(amount, 2)} saved` : 'Discount removed', 'success'); done?.();
        } catch (err) { apiError(err, 'Discount not saved'); busy(ev.currentTarget, false); }
      };
    } });
}

/** Bill cleared (or already paid): print the receipt and / or the bill. */
async function paidWindow(bill, r, after) {
  // the screen behind refreshes first (it may open its own window, e.g. the token slip); this one stacks on top
  if (r) { try { await after?.(r); } catch { /* the screen behind reloads itself */ } }
  modal({ title: r ? 'Payment saved — bill cleared' : 'Bill already paid', size: 'sm', stack: true,
    body: `<div class="text-center py-2"><span class="material-symbols-outlined text-[44px] text-success">task_alt</span>
      <p class="font-title-md mt-1">${esc(bill.bill_no)}</p><p class="text-body-md text-on-surface-variant">${esc(bill.patient_name || '')} · ${r?.received ? `${money(r.received, 2)} received now` : `total ${money(bill.total, 2)}, nothing outstanding`}</p></div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>${r ? '<button class="btn-secondary" data-p-receipt>Print receipt</button>' : ''}<button class="btn-primary" data-p-bill>Print bill</button>`,
    onMount(root, close) {
      root.querySelector('[data-p-receipt]')?.addEventListener('click', () => printReceipt(bill, r));
      root.querySelector('[data-p-bill]').onclick = async () => { const { printBill } = await import('./views/bills.js'); printBill(bill.id); };
    } });
}

export async function printReceipt(bill, r) {
  const money0 = (r.receipts || []).find((p) => p.id);
  if (money0) {
    try { const { printReceipt: full } = await import('./views/op-registration.js'); full(await api.get(`/payments/${money0.id}/receipt`)); return; }
    catch { /* fall back to the summary below */ }
  }
  const name = setting?.('hospital_name') || 'Hospital';
  let full = bill;
  try { full = await api.get(`/bills/${bill.id}`); } catch { /* print with what we have */ }
  const items = (full.items || []).filter((i) => i.amount || i.waiver_of);
  const adjustments = (full.settlements || []).filter((x) => x.status !== 'cancelled');
  const paidNow = [...(r.receipts || []).map((p) => ({ no: p.receipt_no, mode: MODES[p.mode]?.label || p.mode, ref: p.reference, amount: p.amount })),
    ...(r.settlements || []).map((x) => ({ no: x.settlement_no, mode: MODES[x.mode]?.label || x.mode, ref: x.reference || x.payer_name, amount: x.amount }))];
  const earlier = (full.payments || []).filter((p) => !p.cancelled && !(r.receipts || []).some((x) => x.receipt_no === p.receipt_no));
  const collector = r.receipts?.[0]?.received_by_name || state.user?.name || '';
  const row = (l, v, b) => `<tr><td>${b ? `<b>${l}</b>` : l}</td><td style="text-align:right">${b ? `<b>${money(v, 2)}</b>` : money(v, 2)}</td></tr>`;
  printDocument('Receipt', `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #881D2C;padding-bottom:8px">
      <div><div style="font-size:18px;font-weight:700">${esc(name)}</div><div>${esc(setting?.('address') || '')}</div></div>
      <div style="text-align:right"><div style="font-size:15px;font-weight:600">Payment receipt</div><div>${esc(new Date().toLocaleString('en-IN'))}</div></div>
    </div>
    <p style="margin:10px 0">${esc(bill.patient_name || '')} · ${esc(bill.uhid || '')} · Bill ${esc(bill.bill_no)}</p>
    <table class="tbl"><thead><tr><th>#</th><th>Service</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Discount</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description)}</td><td style="text-align:right">${i.qty}</td><td style="text-align:right">${money(i.rate, 2)}</td>
        <td style="text-align:right">${i.discount > 0 ? `−${money(i.discount, 2)}` : ''}</td><td style="text-align:right">${money(i.amount, 2)}</td></tr>`).join('')}</tbody></table>
    <table style="width:55%;margin:8px 0 0 auto">
      ${row('Services', items.reduce((t, i) => t + (+i.amount || 0), 0))}
      ${full.discount > 0 ? row(`Bill discount${full.discount_reason ? ` (${esc(full.discount_reason)})` : ''}`, -full.discount) : ''}
      ${row('Bill total', full.total, true)}
      ${adjustments.filter((x) => x.mode === 'free').map((x) => row(esc(x.payer_name === 'Package adjustment' ? 'Covered by the package' : `Free — ${x.reason || x.payer_name || 'approved'}`), -x.amount)).join('')}
      ${adjustments.filter((x) => !['free', 'due', 'credit'].includes(x.mode)).map((x) => row(`Payer — ${esc(x.payer_name || MODES[x.mode]?.label || x.mode)}`, -x.amount)).join('')}
      ${earlier.length ? row('Paid earlier', -earlier.reduce((t, p) => t + p.amount, 0)) : ''}
      ${row('Paid now', -(r.received || 0), true)}
      ${row('Balance due', r.bill?.balance ?? full.balance, true)}
    </table>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Receipt</th><th>Mode</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${paidNow.map((l) => `<tr><td>${esc(l.no)}</td><td>${esc(l.mode)}</td><td>${esc(l.ref || '—')}</td><td style="text-align:right">${money(l.amount, 2)}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:28px;color:#526176">Collected by ${esc(collector)}. This is a computer-generated receipt.</p>`);
}

export { pill };
