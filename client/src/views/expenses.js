/** Operational expense register. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, downloadCSV, compactMoney, barChart,
  $, $$, esc, bind, toast, modal, confirmDialog, renderRows, pill, money, fmtDate,
  kpi, todayISO, shiftDate, emptyState,
 modeLabel,
} from './_kit.js';

let f = { from: shiftDate(todayISO(), -29), to: todayISO(), status: 'all', head: 'all', q: '' };
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/finance/expenses${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Spend in period', value: compactMoney(d.summary.total), icon: 'payments', sub: `${d.summary.count} vouchers` },
      { label: 'Paid', value: compactMoney(d.summary.paid), icon: 'task_alt', tone: 'success', sub: 'Settled and posted to the ledger' },
      { label: 'Awaiting approval', value: compactMoney(d.summary.pending), icon: 'pending_actions',
        tone: d.summary.pending ? 'warning' : 'success', sub: `${d.rows.filter((r) => r.status === 'pending').length} voucher(s)` },
      { label: 'Largest head', value: d.byHead[0] ? compactMoney(d.byHead[0].total) : '—', icon: 'category',
        tone: 'info', sub: d.byHead[0]?.head || '—' },
    ].map(kpi).join('');

    const sel = $('[data-f="head"]', root);
    if (sel && sel.options.length <= 1) {
      sel.innerHTML = `<option value="all">All heads</option>` + d.byHead.map((h) => `<option>${esc(h.head)}</option>`).join('');
      sel.value = f.head;
    }
    $('[data-heads]', root).innerHTML = d.byHead.length
      ? barChart(d.byHead.slice(0, 12).map((h) => ({ label: h.head.slice(0, 14), value: h.total })), { height: 170 })
      : emptyState('bar_chart', 'No spend in this period', '');

    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No expenses in this period.' });
    $('[data-count]', root).textContent = `${d.rows.length} voucher(s)`;
  }

  bind(root, 'click', '[data-new]', () => newExpense(load));
  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    if (b.dataset.act === 'approve') { await api.patch(`/finance/expenses/${id}`, { status: 'approved' }); toast('Expense approved', 'success'); load(); }
    if (b.dataset.act === 'pay') { await api.patch(`/finance/expenses/${id}`, { status: 'paid' }); toast('Paid — expense and payment posted to the books', 'success'); load(); }
    if (b.dataset.act === 'reject') {
      const r = await confirmDialog({ title: 'Reject this voucher?', message: 'It stays on record as rejected.', confirmLabel: 'Reject', tone: 'danger', requireReason: true });
      if (!r) return;
      await api.patch(`/finance/expenses/${id}`, { status: 'rejected', reason: r.reason, remarks: r.reason });
      toast('Voucher rejected', 'success'); load();
    }
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`expenses-${f.from}-to-${f.to}.csv`, cache));

  return live({ topics: ['finance'], events: ['expense.created', 'expense.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Finance', 'payments')} ${liveChip()}`,
    title: 'Operational Expenses',
    subtitle: 'Vouchers by head with an approval trail; marking one paid posts both sides of the entry to the ledger.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('expense.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New voucher</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Vendor, head or voucher' },
        { type: 'date', key: 'from', label: 'From', value: f.from, width: 'w-[150px]' },
        { type: 'date', key: 'to', label: 'To', value: f.to, width: 'w-[150px]' },
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
          { value: 'paid', label: 'Paid' }, { value: 'rejected', label: 'Rejected' }] },
        { type: 'select', key: 'head', label: 'Head', value: f.head, options: [{ value: 'all', label: 'All heads' }] },
      ])}
      ${card({ title: 'Spend by head', body: `<div data-heads></div>` })}
      ${tableCard({
        title: 'Vouchers', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '56vh',
        columns: [{ label: 'Voucher', width: '150px' }, { label: 'Head' }, { label: 'Vendor' },
          { label: 'Date' }, { label: 'Mode' }, { label: 'Amount', cls: 'text-right' },
          { label: 'Status' }, { label: 'Raised by' }, { label: '', width: '170px' }],
      })}`,
  });
}

function rowHTML(e) {
  return `
    <td class="font-data-mono text-body-sm">${esc(e.voucher_no)}</td>
    <td class="font-label-lg text-label-lg">${esc(e.head)}</td>
    <td class="text-body-md">${esc(e.vendor || '—')}</td>
    <td class="text-body-sm">${fmtDate(e.spent_on)}</td>
    <td><span class="pill-neutral">${esc(modeLabel(e.mode))}</span></td>
    <td class="num font-semibold">${money(e.amount, 2)}</td>
    <td>${pill(e.status)}</td>
    <td><div class="text-body-md">${esc(e.created_by_name || '—')}</div>
      ${e.approved_by_name ? `<div class="text-label-sm text-on-surface-variant">appr. ${esc(e.approved_by_name)}</div>` : ''}</td>
    <td class="text-right whitespace-nowrap">
      ${can('expense.write') && e.status === 'pending' ? `<button class="btn-secondary btn-xs" data-act="approve">Approve</button>
        <button class="btn-ghost btn-xs" data-act="reject">Reject</button>` : ''}
      ${can('expense.write') && e.status === 'approved' ? `<button class="btn-primary btn-xs" data-act="pay">Mark paid</button>` : ''}
    </td>`;
}

function newExpense(after) {
  modal({
    title: 'New expense voucher', size: 'md',
    body: `<form data-ef class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Head *</label><input class="field" name="head" required list="exp-heads">
        <datalist id="exp-heads">${['Salaries & Wages', 'Electricity', 'Water', 'Medical Consumables', 'Housekeeping',
          'Biomedical Waste', 'Equipment AMC', 'Rent', 'Marketing', 'Fuel — Ambulance', 'Internet & Telephony',
          'Linen & Laundry', 'Security Services', 'Statutory & Licences'].map((h) => `<option value="${h}">`).join('')}</datalist></div>
      <div><label class="field-label">Vendor</label><input class="field" name="vendor"></div>
      <div><label class="field-label">Amount *</label><input class="field" type="number" step="0.01" name="amount" required></div>
      <div><label class="field-label">Mode</label><select class="field" name="mode">
        <option value="cash">Cash</option><option value="bank">Bank transfer</option>
        <option value="upi">UPI</option><option value="cheque">Cheque</option></select></div>
      <div><label class="field-label">Spent on</label><input class="field" type="date" name="spent_on" value="${todayISO()}"></div>
      <div><label class="field-label">Vendor bill / invoice no.</label><input class="field" name="reference" placeholder="as on the paper bill"></div>
      <div><label class="field-label">Department (cost centre)</label><select class="field" name="department"><option value="">—</option>
        ${(state.meta?.departments || []).map((d) => `<option>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="col-span-2"><label class="field-label">Remarks</label><input class="field" name="remarks"></div>
      <p class="col-span-2 text-body-sm text-on-surface-variant">Saved as <b>pending</b>. An approver approves it and records the payment — the person who raises a voucher does not approve it.</p>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Create voucher</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-ef]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const e2 = await api.post('/finance/expenses', Object.fromEntries(new FormData(form)));
          close(); toast(`${e2.voucher_no} raised`, 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
