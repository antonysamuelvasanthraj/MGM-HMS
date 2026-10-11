/**
 * Pharmacy returns. A patient return puts the batch back on the shelf, takes
 * a credit note off the bill and refunds only what was overpaid. A return to
 * the supplier reduces Central stock, the payable and the input GST.
 */
import {
  page, eyebrow, card, mountPage, api, qs, can, esc, bind, money, fmtDate, modal, toast, busy, apiError, live,
} from './_kit.js';
import { MODES } from '../collect.js';

export async function mount(ctx) {
  const tabs = [['sales', 'Patient returns', 'pharmacy.view'], ['purchase', 'Supplier returns', 'purchase.view']].filter(([, , perm]) => can(perm));
  const f = { tab: tabs.some(([key]) => key === ctx.query.tab) ? ctx.query.tab : tabs[0]?.[0] };
  const root = mountPage(ctx, page({
    wide: true, eyebrow: eyebrow('Pharmacy', 'assignment_return'), title: 'Returns',
    subtitle: 'Patient returns and returns to suppliers, each with a reason and a full stock and accounts trail.',
    actions: `${can('pharmacy.dispense') ? '<button class="btn-secondary" data-new-sale>Patient return</button>' : ''}${can('purchase.write') ? '<button class="btn-secondary" data-new-pur>Return to supplier</button>' : ''}`,
    body: `<div class="inline-flex p-0.5 rounded bg-surface-container" role="tablist">${tabs.map(([v, l]) => `<button data-tab="${v}" role="tab" class="px-3 h-8 rounded font-label-md text-label-md">${l}</button>`).join('')}</div>
      <div data-list></div>`,
  }));

  async function load() {
    root.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === f.tab; b.setAttribute('aria-selected', on);
      b.className = `px-3 h-8 rounded font-label-md text-label-md ${on ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`; });
    const list = root.querySelector('[data-list]');
    if (f.tab === 'sales') {
      const rows = await api.get('/pharmacy/sales-returns');
      list.innerHTML = card({ title: `${rows.length} patient returns`, pad: false, body: `<div class="overflow-auto max-h-[66vh]"><table class="tbl"><thead><tr><th>Date</th><th>Return</th><th>Bill</th><th>Patient</th><th>Item</th><th class="num">Qty</th><th class="num">Credit</th><th>Refund</th><th>Reason</th><th>By</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td class="font-data-mono">${esc(r.return_no)}</td><td class="font-data-mono">${esc(r.bill_no)}</td><td>${esc(r.patient_name)}</td>
          <td class="max-w-[260px] truncate">${esc(r.description)}</td><td class="num">${r.qty}</td><td class="num">${money(r.amount, 2)}</td><td>${esc(MODES[r.refund_mode]?.label || r.refund_mode || '—')}</td><td class="text-body-sm">${esc(r.reason)}</td><td class="text-body-sm">${esc(r.created_by_name || '')}</td></tr>`).join('')
          || '<tr><td colspan="10" class="text-center py-8 text-on-surface-variant">No patient returns</td></tr>'}</tbody></table></div>` });
    } else {
      const rows = await api.get('/pharmacy/purchase-returns');
      list.innerHTML = card({ title: `${rows.length} supplier returns`, pad: false, body: `<div class="overflow-auto max-h-[66vh]"><table class="tbl"><thead><tr><th>Date</th><th>Return</th><th>Supplier</th><th>Item</th><th>Batch</th><th class="num">Qty</th><th class="num">Value</th><th class="num">GST</th><th>Reason</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td class="font-data-mono">${esc(r.return_no)}</td><td>${esc(r.supplier_name)}</td><td>${esc(r.medicine_name)}</td><td class="font-data-mono">${esc(r.batch_no)}</td>
          <td class="num">${r.qty}</td><td class="num">${money(r.value, 2)}</td><td class="num">${money(r.cgst + r.sgst + r.igst, 2)}</td><td class="text-body-sm">${esc(r.reason)}</td></tr>`).join('')
          || '<tr><td colspan="9" class="text-center py-8 text-on-surface-variant">No supplier returns</td></tr>'}</tbody></table></div>` });
    }
  }

  bind(root, 'click', '[data-tab]', (e, b) => { f.tab = b.dataset.tab; load(); });
  bind(root, 'click', '[data-new-sale]', () => salesReturn(() => { f.tab = 'sales'; load(); }));
  bind(root, 'click', '[data-new-pur]', () => purchaseReturn(() => { f.tab = 'purchase'; load(); }));
  return live({ topics: ['pharmacy', 'inventory'], events: ['sales_return.created', 'purchase_return.created'], load });
}

function salesReturn(after) {
  modal({
    title: 'Patient return', size: 'lg', subtitle: 'Find the pharmacy bill, then choose what comes back.',
    body: `<div class="flex gap-2"><input class="field" data-q placeholder="Bill number, patient name, UHID or mobile"><button class="btn-secondary" data-find>Find</button></div><div class="mt-3" data-res></div>`,
    footer: '<button class="btn-secondary" data-close>Close</button>',
    onMount(el, close) {
      const res = el.querySelector('[data-res]');
      const find = async () => {
        const q = el.querySelector('[data-q]').value.trim();
        if (q.length < 2) return;
        const { rows } = await api.get(`/bills${qs({ q, limit: 20 })}`);
        const bills = rows.filter((b) => ['PHARM', 'IP'].includes(b.bill_type) && b.status !== 'cancelled');
        res.innerHTML = bills.length ? bills.map((b) => `<button class="w-full text-left px-3 py-2 border-b border-outline-variant hover:bg-surface-container-low" data-bill="${b.id}">
          <span class="font-data-mono">${esc(b.bill_no)}</span> · ${esc(b.patient_name)} · ${fmtDate(b.bill_date)} · ${money(b.total, 2)}</button>`).join('') : '<p class="text-body-md text-on-surface-variant">No pharmacy bill found.</p>';
      };
      el.querySelector('[data-find]').onclick = find;
      el.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') find(); };
      res.onclick = async (e) => {
        const b = e.target.closest('[data-bill]');
        if (b) {
          const bill = await api.get(`/bills/${b.dataset.bill}`);
          const originalMode = bill.payments.find((p) => p.amount > 0 && !p.cancelled && MODES[p.mode]?.group === 'money')?.mode || 'cash';
          const items = bill.items.filter((i) => ['pharmacy', 'consumable'].includes(i.category) && i.batch_id && i.qty - (i.returned_qty || 0) > 0);
          res.innerHTML = items.length ? `<p class="text-body-md mb-2">${esc(bill.bill_no)} · ${esc(bill.patient_name)} · paid ${money(bill.paid, 2)}</p>
            <table class="tbl"><thead><tr><th>Item</th><th class="num">Sold</th><th class="num">Returned</th><th class="num">Rate</th><th class="num">Return qty</th></tr></thead><tbody>
            ${items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${i.returned_qty || 0}</td><td class="num">${money(i.rate, 2)}</td>
              <td class="num"><input class="field field-sm !h-8 !w-20 text-right" type="number" min="0" max="${i.qty - (i.returned_qty || 0)}" value="0" data-item="${i.id}" aria-label="Return quantity"></td></tr>`).join('')}</tbody></table>
            <div class="grid grid-cols-2 gap-3 mt-3"><div><label class="field-label">Reason</label><input class="field" data-reason required></div>
            <div><label class="field-label">Refund excess by</label><select class="field" data-mode>${Object.entries(MODES).filter(([, m]) => m.group === 'money').map(([mode, m]) => `<option value="${mode}" ${mode === originalMode ? 'selected' : ''}>${m.label}</option>`).join('')}</select><p class="text-body-sm text-on-surface-variant">Defaults to the original receipt mode. For split receipts, review the mode before refunding.</p></div></div>
            <button class="btn-primary mt-3" data-save>Accept return</button>` : '<p class="text-body-md text-on-surface-variant">Nothing returnable on this bill.</p>';
          return;
        }
        if (e.target.closest('[data-save]')) {
          const btn = e.target.closest('[data-save]');
          const lines = [...res.querySelectorAll('[data-item]')].map((i) => ({ id: +i.dataset.item, qty: +i.value })).filter((l) => l.qty > 0);
          const reason = res.querySelector('[data-reason]').value.trim();
          if (!lines.length || !reason) { toast('Enter a quantity and a reason', 'warning'); return; }
          busy(btn, true);
          try {
            let refunded = 0;
            for (const l of lines) {
              const r = await api.post('/pharmacy/sales-returns', { bill_item_id: l.id, qty: l.qty, reason, refund_mode: res.querySelector('[data-mode]').value });
              refunded += r.refund?.amount || 0;
            }
            close(); toast(refunded ? `Refund ${money(refunded, 2)} to the patient` : 'Return credited to the bill', 'success'); after();
          } catch (err) { apiError(err, 'Return not saved'); busy(btn, false); }
        }
      };
    },
  });
}

async function purchaseReturn(after) {
  const { rows } = await api.get('/pharmacy/stock?location=Central');
  const batches = rows.filter((b) => b.qty > 0);
  modal({
    title: 'Return to supplier', size: 'md', subtitle: 'Only Central-store stock can go back to a supplier.',
    body: `<label class="field-label">Batch</label><select class="field" data-batch>${batches.map((b) => `<option value="${b.id}">${esc(b.medicine_name)} · ${esc(b.batch_no)} · exp ${esc(b.expiry.slice(0, 7))} · ${b.qty} in stock · ${esc(b.supplier_name || '')}</option>`).join('')}</select>
      <div class="grid grid-cols-2 gap-3 mt-3"><div><label class="field-label">Quantity (units)</label><input class="field text-right" type="number" min="1" data-qty></div>
      <div><label class="field-label">Reason</label><select class="field" data-reason><option>Expired</option><option>Near expiry</option><option>Damaged</option><option>Wrong item supplied</option><option>Quality complaint</option></select></div></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Return</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          const r = await api.post('/pharmacy/purchase-returns', { batch_id: +el.querySelector('[data-batch]').value, qty: +el.querySelector('[data-qty]').value, reason: el.querySelector('[data-reason]').value });
          close(); toast(`${r.return_no} — supplier credited ${money(r.value + r.cgst + r.sgst + r.igst, 2)}`, 'success'); after();
        } catch (err) { apiError(err, 'Return not saved'); busy(btn, false); }
      };
    },
  });
}
