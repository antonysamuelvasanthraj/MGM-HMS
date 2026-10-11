/**
 * Daily collection & handover — reception and pharmacy each see their own day:
 * every bill and what it was for, receipts by mode (cash, UPI, card, bank,
 * cheque), credit and dues, and for the pharmacy what was sold by item and
 * batch plus every stock movement. Everything exports to one Excel workbook.
 * The Handover tab closes a shift: declare what you hold per mode against what
 * the system recorded, name who receives it, and the receiver accepts it.
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, qs, can, state, esc, bind, money, fmtDate, fmtTime, fmtDateTime, pill, toast, busy, apiError, todayISO, kpi, confirmDialog, billStatus,
} from './_kit.js';
import { exportWorkbook, sum } from '../excel.js';
import { collectBill } from '../collect.js';

const MODES = [['cash', 'Cash'], ['upi', 'UPI (PhonePe / GPay / Paytm)'], ['card', 'Card'], ['bank', 'Bank transfer'], ['cheque', 'Cheque']];
const MODE_NAME = { cash: 'Cash', upi: 'UPI', debit_card: 'Debit card', credit_card: 'Credit card', bank_transfer: 'Bank', cheque: 'Cheque',
  insurance: 'Insurance', aarogyasri: 'Aarogyasri', corporate: 'Corporate', credit: 'Credit', trust: 'Trust', free: 'Free', due: 'Due' };
const TABS = {
  reception: [['summary', 'Today'], ['range','Date & time report'], ['handover', 'Cash acceptance'], ['shifts','Shift handover'], ['receipts', 'Receipts'], ['bills', 'Bills'], ['items', 'What was billed'], ['inpatients', 'Inpatient bills']],
  pharmacy: [['summary', 'Today'], ['range','Date & time report'], ['handover', 'Cash acceptance'], ['shifts','Shift handover'], ['receipts', 'Receipts'], ['sales', 'Sales lines'], ['items', 'Item-wise'], ['batches', 'Batch-wise'], ['dues', 'Credit / dues'], ['moves', 'Stock movement']],
};
const T = (cls = '') => `<table class="tbl ${cls}">`;

export async function mount(ctx) {
  const canPharm = can('pharmacy.view') || can('finance.view');
  const canRecep = (can('billing.view') && !['pharmacy', 'store', 'pharmacy_admin'].includes(state.user.role)) || can('finance.view');
  const f = { desk: ctx.query.desk === 'pharmacy' || !canRecep ? 'pharmacy' : 'reception', date: todayISO(), user_id: '', tab: can('finance.view') ? 'handover' : 'summary' };
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Collections', 'summarize')} ${liveChip()}`, title: 'Daily collection & handover',
    subtitle: 'What your counter collected today, and handing that money to the next person at the end of your shift.',
    body: `<div class="card p-3 flex flex-wrap items-end gap-2 print:hidden" data-controls></div>
      <div class="inline-flex flex-wrap p-0.5 rounded bg-surface-container print:hidden" role="tablist" data-tabs></div>
      <div data-body class="space-y-4"></div>`,
  }));
  let d = null;

  function controls() {
    root.querySelector('[data-controls]').innerHTML = `
      ${canPharm && canRecep ? `<div><label class="field-label">Desk</label><select class="field field-sm !h-9" data-k="desk">
        <option value="reception" ${f.desk === 'reception' ? 'selected' : ''}>Reception (OP, IP, lab, imaging)</option>
        <option value="pharmacy" ${f.desk === 'pharmacy' ? 'selected' : ''}>Pharmacy</option></select></div>` : `<div class="font-title-md self-center">${f.desk === 'pharmacy' ? 'Pharmacy' : 'Reception'}</div>`}
      <div><label class="field-label">Date</label><input type="date" class="field field-sm !h-9" data-k="date" value="${f.date}" max="${todayISO()}"></div>
      <div><label class="field-label">Collected by</label><select class="field field-sm !h-9" data-k="user_id"><option value="">Everyone</option>
        ${(d?.collectors || []).map((u) => `<option value="${u.id}" ${String(u.id) === String(f.user_id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="flex-1"></div>
      <button class="btn-secondary btn-sm" data-xls><span class="material-symbols-outlined text-[16px]">table_view</span>Excel (all sheets)</button>
      <button class="btn-secondary btn-sm" data-print><span class="material-symbols-outlined text-[16px]">print</span>Print</button>`;
    root.querySelector('[data-tabs]').innerHTML = TABS[f.desk].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === f.tab}"
      class="px-3 h-8 rounded font-label-md text-label-md ${k === f.tab ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}">${l}</button>`).join('');
  }

  async function load() {
    d = await api.get(`/desk/day${qs({ desk: f.desk, date: f.date, user_id: f.user_id })}`);
    if (!TABS[f.desk].some(([k]) => k === f.tab)) f.tab = 'summary';
    controls();
    const body = root.querySelector('[data-body]');
    if (f.tab === 'range') { await rangePanel(body,f); return; }
    if (f.tab === 'shifts') { await shiftPanel(body,f); return; }
    if (f.tab === 'handover') { await handover(body, f, d); return; }
    body.innerHTML = cashTiles(d) + (f.desk === 'pharmacy' ? PHARM : RECEP)[f.tab](d);
  }

  root.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) { f[k] = e.target.value; if (k === 'desk') f.tab = 'summary'; load(); } });
  bind(root, 'click', '[data-tab]', (e, b) => { f.tab = b.dataset.tab; load(); });
  bind(root, 'click', '[data-goto]', (e, b) => { f.tab = b.dataset.goto; load(); });
  bind(root, 'click', '[data-xls]', () => exportDay(d));
  bind(root, 'click', '[data-print]', () => window.print());
  bind(root, 'click', '[data-collect]', (e, b) => collectBill(+b.dataset.collect, load));
  return live({ topics: ['billing', 'pharmacy', 'accounts'], events: ['shift.submitted','shift.accepted','payment.received', 'pharmacy.dispensed', 'handover.submitted', 'handover.verified'], load });
}

/* ---------------------------------------------------------------- summary */

/** Only the modes actually used today; cash, UPI and card always show. */
const usedModes = (d) => MODES.filter(([k]) => ['cash', 'upi', 'card'].includes(k) || Math.abs(d.modes[k] || 0) > 0.005);
const MODE_ICON = { cash: 'payments', upi: 'qr_code_2', card: 'credit_card', bank: 'account_balance', cheque: 'receipt' };

/** The three steps of a shift, so nobody has to guess what this screen is for. */
const steps = () => `<div class="grid grid-cols-1 md:grid-cols-3 gap-3 print:hidden">${[
  ['1', 'Collect', 'Take payments during your shift. Every receipt is counted here automatically.'],
  ['2', 'Count and hand over', 'Open “Cash acceptance”, count your drawer and choose the Admin or Owner receiving your collection. Record pending work separately in “Shift handover”.'],
  ['3', 'Receiver accepts', 'The receiving Admin or Owner checks and accepts the collection. Cash stays at the desk until acceptance. Incoming staff accept their shift record separately.'],
].map(([n, t, x]) => `<div class="card p-3 flex gap-3"><div class="w-8 h-8 shrink-0 rounded-full bg-primary text-on-primary grid place-items-center font-semibold">${n}</div>
  <div><div class="font-label-lg">${t}</div><div class="text-body-sm text-on-surface-variant">${x}</div></div></div>`).join('')}</div>`;

function cashTiles(d) {
  return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${[
    {label:'Desk sales today',value:money(d.sales_today,2),sub:'Bills raised today, including unpaid bills'},
    {label:'Cash collected today',value:money(d.modes.cash || 0,2),sub:'Net of cash refunds'},
    {label:d.personal ? 'My cash in hand' : 'Cash in hand at desk',value:money(d.cash_in_hand,2),sub:'Includes earlier days; deducted when receiver accepts'},
    {label:'Awaiting handover acceptance',value:money(d.cash_pending_acceptance,2),sub:'Still included in desk cash until accepted'},
  ].map(kpi).join('')}</div>`;
}

function modeTiles(d) {
  const modes = usedModes(d);
  return card({ title: 'Money collected today', subtitle: 'By how the patient paid',
    actions: '<button class="btn-primary btn-sm print:hidden" data-goto="handover"><span class="material-symbols-outlined text-[16px]">handshake</span>Hand over cash</button>',
    body: `<div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-center">
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${modes.map(([k, l]) => `<div class="rounded-lg border border-outline-variant p-3">
        <div class="flex items-center gap-1.5 text-body-sm text-on-surface-variant"><span class="material-symbols-outlined text-[18px]">${MODE_ICON[k]}</span>${esc(l)}</div>
        <div class="text-headline-sm font-semibold tabular-nums mt-1">${money(d.modes[k] || 0, 2)}</div></div>`).join('')}</div>
      <div class="rounded-lg bg-surface-container-low p-3 text-body-md">
        <div class="flex justify-between"><span>Received</span><span class="tabular-nums">${money(d.received, 2)}</span></div>
        <div class="flex justify-between ${d.refunded ? 'text-danger' : 'text-on-surface-variant'}"><span>Given back (refunds)</span><span class="tabular-nums">− ${money(d.refunded, 2)}</span></div>
        <div class="flex justify-between font-semibold text-title-md border-t border-outline-variant mt-1.5 pt-1.5"><span>Net collected</span><span class="tabular-nums">${money(d.net, 2)}</span></div></div>
    </div>` });
}

const RECEP = {
  summary(d) {
    const r2 = (v) => Math.round(v * 100) / 100;
    const billed = sum(d.bills, 'total'), paid = sum(d.bills, 'paid');
    const payer = r2(d.bills.reduce((x, b) => x + (b.covered_amount || 0) + (b.waived_amount || 0), 0));
    const due = r2(d.bills.reduce((x, b) => x + Math.max(0, b.balance), 0));
    const types = [...new Set(d.bills.map((b) => b.bill_type))].join(', ');
    return `${steps()}${modeTiles(d)}
      ${card({ title: `Bills today (${d.bills.length})`, subtitle: types ? `Types: ${esc(types)} — open the Bills tab to see each bill` : 'No bills raised or paid today',
        body: `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">${[
          ['Billed', billed, ''], ['Paid by patients', paid, 'text-success'], ['Payer / free (no money)', payer, 'text-info'], ['Still due', due, due > 0.005 ? 'text-danger' : ''],
        ].map(([l, v, c]) => `<div><div class="text-body-sm text-on-surface-variant">${l}</div><div class="text-title-lg font-semibold tabular-nums ${c}">${money(v, 2)}</div></div>`).join('')}</div>
        ${d.settlements.length ? `<div class="text-body-sm text-on-surface-variant mt-3">Payer / free today: ${d.settlements.map((x) => `${esc(MODE_NAME[x.mode] || x.mode)} ${money(x.amount, 2)} (${x.n})`).join(' · ')}</div>` : ''}` })}
      ${d.refunds.length ? card({ title: `Money given back (${d.refunds.length})`, pad: false, body: `${T()}<thead><tr><th>Refund</th><th>Patient</th><th>Bill</th><th>Paid back by</th><th class="num">Amount</th><th>Why</th><th>By</th></tr></thead><tbody>${d.refunds.map((r) => `<tr><td class="font-data-mono">${esc(r.refund_no)}</td><td>${esc(r.patient_name)}</td><td>${esc(r.bill_no)}</td><td>${esc(MODE_NAME[r.mode] || r.mode)}</td><td class="num">${money(r.amount, 2)}</td><td class="text-body-sm">${esc(r.reason)}</td><td class="text-body-sm">${esc(r.by_name || '')}</td></tr>`).join('')}</tbody></table>` }) : ''}`;
  },
  bills(d) {
    return card({ title: `${d.bills.length} bills`, subtitle: 'Each bill with what it was for and how it was paid', pad: false, body: `<div class="divide-y divide-outline-variant">${d.bills.map((b) => `
      <details class="p-3"><summary class="cursor-pointer flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="font-data-mono">${esc(b.bill_no)}</span><span class="pill-neutral">${esc(b.bill_type)}</span>
        <span class="font-label-lg">${esc(b.patient_name)}</span><span class="text-body-sm text-on-surface-variant">${esc(b.uhid)}${b.ip_no ? ` · ${esc(b.ip_no)}` : ''}${b.doctor_name ? ` · ${esc(b.doctor_name)}` : ''}</span>
        <span class="flex-1"></span><span class="font-data-mono">${money(b.total, 2)}</span>${billStatus(b)}
        ${b.balance > 0.005 ? `<span class="text-danger font-data-mono">due ${money(b.balance, 2)}</span>${can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${b.id}">Collect</button>` : ''}` : ''}</summary>
        <table class="tbl mt-2"><tbody>${b.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="num">${l.qty}</td><td class="num">${money(l.rate, 2)}</td><td class="num">${money(l.amount, 2)}</td></tr>`).join('')}</tbody></table>
        <div class="text-body-sm mt-2 text-on-surface-variant">Paid: ${b.modes.map((m) => `${esc(MODE_NAME[m.mode] || m.mode)} ${money(m.amount, 2)}`).join(' · ') || '—'}${b.settled_by.length ? ` · Settled: ${b.settled_by.map((m) => `${esc(MODE_NAME[m.mode] || m.mode)} ${money(m.amount, 2)}`).join(' · ')}` : ''}</div>
      </details>`).join('') || '<p class="p-6 text-center text-on-surface-variant">No bills for this day.</p>'}</div>` });
  },
  items(d) {
    return card({ title: 'What was billed', subtitle: 'Per-day inpatient charges are grouped — e.g. cardiac monitor × days', pad: false, body: `${T()}<thead><tr><th>Item / service</th><th>Bill type</th><th>Category</th><th class="num">Times</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>
      ${d.items.map((i) => `<tr><td>${esc(i.item)}</td><td>${esc(i.bill_type)}</td><td class="text-body-sm">${esc(i.category || '')}</td><td class="num">${i.lines}</td><td class="num">${i.qty}</td><td class="num">${money(i.amount, 2)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center py-6 text-on-surface-variant">Nothing billed</td></tr>'}
      <tr class="font-semibold"><td colspan="5">Total</td><td class="num">${money(sum(d.items, 'amount'), 2)}</td></tr></tbody></table>` });
  },
  inpatients(d) {
    return d.inpatients.map((a) => card({ title: `${a.patient_name} · ${a.ip_no}`, subtitle: `${esc(a.ward || '')} ${esc(a.bed_no || '')} · admitted ${fmtDateTime(a.admitted_at)}${a.discharged_at ? ` · discharged ${fmtDateTime(a.discharged_at)}` : ''}`,
      actions: `${pill(a.status)} ${a.balance > 0.005 && can('payment.collect') ? `<button class="btn-primary btn-sm" data-collect="${a.bill_id}">Collect ${money(a.balance)}</button>` : ''}`, pad: false,
      body: `${T()}<thead><tr><th>Charge</th><th class="num">Rate</th><th class="num">Days</th><th class="num">Amount</th><th>State</th></tr></thead><tbody>
        ${a.charges.map((c) => `<tr><td>${esc(c.description)}</td><td class="num">${money(c.rate)}${c.unit === 'day' ? '/day' : ''}</td><td class="num">${c.days}</td><td class="num">${money(c.amount, 2)}</td><td class="text-body-sm">${esc(c.status)}</td></tr>`).join('')}
        <tr class="font-semibold"><td colspan="3">Bill ${esc(a.bill_no || '')} · total</td><td class="num">${money(a.total || 0, 2)}</td><td></td></tr>
        <tr><td colspan="3">Paid · payer / free</td><td class="num">${money(a.paid || 0, 2)} · ${money((a.covered_amount || 0) + (a.waived_amount || 0), 2)}</td><td></td></tr>
        <tr class="${a.balance > 0 ? 'text-danger font-semibold' : 'text-success'}"><td colspan="3">${a.balance < 0 ? 'Advance held' : 'Balance due'}</td><td class="num">${money(Math.abs(a.balance || 0), 2)}</td><td></td></tr></tbody></table>` })).join('') || card({ body: '<p class="text-center py-6 text-on-surface-variant">No inpatients.</p>' });
  },
  receipts: (d) => receiptsCard(d),
};

const PHARM = {
  summary(d) {
    return `${steps()}${modeTiles(d)}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">${[
        { label: 'Bills today', value: d.bills.length, sub: money(sum(d.bills, 'total'), 2), icon: 'receipt_long' },
        { label: 'Items sold', value: d.items.length, sub: `${sum(d.items, 'qty')} units`, icon: 'medication' },
        { label: 'Credit / dues open', value: money(sum(d.dues, 'balance'), 2), sub: `${d.dues.length} bill(s)`, icon: 'account_balance_wallet', tone: d.dues.length ? 'danger' : 'success' },
        { label: 'Returns today', value: d.returns.length, sub: money(sum(d.returns, 'amount'), 2), icon: 'assignment_return' },
      ].map(kpi).join('')}</div>
      ${card({ title: 'Top items today', pad: false, body: `${T()}<tbody>${d.items.slice(0, 10).map((i) => `<tr><td>${esc(i.item)}</td><td class="num">${i.qty}</td><td class="num">${money(i.amount, 2)}</td></tr>`).join('') || '<tr><td class="text-center py-6 text-on-surface-variant">No sales</td></tr>'}</tbody></table>` })}`;
  },
  sales: (d) => card({ title: `${d.sales.length} lines sold`, pad: false, body: `<div class="overflow-auto max-h-[68vh]">${T()}<thead><tr><th>Time</th><th>Bill</th><th>Patient</th><th>Item</th><th>Batch</th><th>Expiry</th><th>Store</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th>Paid by</th></tr></thead><tbody>
    ${d.sales.map((s) => `<tr><td class="text-body-sm">${fmtTime(s.created_at)}</td><td class="font-data-mono text-body-sm">${esc(s.bill_no)}${s.bill_type === 'IP' ? ' <span class="pill-info">IP</span>' : ''}</td><td>${esc(s.patient_name)}</td><td>${esc(s.item)}</td>
      <td class="font-data-mono">${esc(s.batch_no || '')}</td><td class="text-body-sm">${s.expiry ? fmtDate(s.expiry) : ''}</td><td>${esc(s.location || '')}</td><td class="num">${s.qty}</td><td class="num">${money(s.rate, 2)}</td><td class="num">${money(s.amount, 2)}</td>
      <td class="text-body-sm">${s.bill_type === 'IP' ? 'IP bill' : s.modes ? esc(s.modes.split(',').map((m) => MODE_NAME[m] || m).join(', ')) : s.balance > 0 ? '<span class="text-danger">Unpaid</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="11" class="text-center py-6 text-on-surface-variant">No sales</td></tr>'}
    <tr class="font-semibold"><td colspan="7">Total</td><td class="num">${sum(d.sales, 'qty')}</td><td></td><td class="num">${money(sum(d.sales, 'amount'), 2)}</td><td></td></tr></tbody></table></div>` }),
  items: (d) => card({ title: 'Item-wise sales', pad: false, body: `${T()}<thead><tr><th>Item</th><th>Code</th><th class="num">OP qty</th><th class="num">IP qty</th><th class="num">Total qty</th><th class="num">Value</th><th>Batches</th></tr></thead><tbody>
    ${d.items.map((i) => `<tr><td>${esc(i.item)}</td><td class="font-data-mono">${esc(i.code || '')}</td><td class="num">${i.op_qty}</td><td class="num">${i.ip_qty}</td><td class="num font-semibold">${i.qty}</td><td class="num">${money(i.amount, 2)}</td><td class="font-data-mono text-body-sm">${esc(i.batches)}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center py-6 text-on-surface-variant">No sales</td></tr>'}</tbody></table>` }),
  batches: (d) => card({ title: 'Batch-wise sales', pad: false, body: `${T()}<thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th>Store</th><th class="num">Qty</th><th class="num">Value</th></tr></thead><tbody>
    ${d.batches.map((b) => `<tr><td>${esc(b.item)}</td><td class="font-data-mono">${esc(b.batch_no || '')}</td><td>${b.expiry ? fmtDate(b.expiry) : ''}</td><td>${esc(b.location || '')}</td><td class="num">${b.qty}</td><td class="num">${money(b.amount, 2)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center py-6 text-on-surface-variant">No sales</td></tr>'}</tbody></table>` }),
  receipts: (d) => receiptsCard(d),
  dues: (d) => card({ title: 'Credit / unpaid pharmacy bills', subtitle: 'All dates — settled here at the pharmacy', pad: false, body: `${T()}<thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th>Mobile</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th></th></tr></thead><tbody>
    ${d.dues.map((b) => `<tr><td class="font-data-mono">${esc(b.bill_no)}</td><td>${fmtDate(b.bill_date)}</td><td>${esc(b.patient_name)} <span class="text-on-surface-variant">${esc(b.uhid)}</span></td><td>${esc(b.mobile || '')}</td>
      <td class="num">${money(b.total, 2)}</td><td class="num">${money(b.paid, 2)}</td><td class="num text-danger font-semibold">${money(b.balance, 2)}</td>
      <td class="text-right">${can('payment.collect') ? `<button class="btn-primary btn-xs" data-collect="${b.id}">Settle</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="text-center py-6 text-on-surface-variant">No pharmacy dues</td></tr>'}</tbody></table>` }),
  moves: (d) => `${card({ title: 'Stock movement', subtitle: 'Every quantity in or out of any store today', pad: false, body: `<div class="overflow-auto max-h-[60vh]">${T()}<thead><tr><th>Time</th><th>Type</th><th>Item</th><th>Batch</th><th>Store</th><th class="num">Qty</th><th class="num">Balance</th><th>Ref</th><th>By</th></tr></thead><tbody>
    ${d.moves.map((m) => `<tr><td class="text-body-sm">${fmtTime(m.created_at)}</td><td>${esc(m.move_type.replace(/_/g, ' '))}</td><td>${esc(m.item)}</td><td class="font-data-mono">${esc(m.batch_no || '')}</td><td>${esc(m.location || '')}</td>
      <td class="num ${m.qty < 0 ? 'text-danger' : 'text-success'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="num">${m.balance_after ?? ''}</td><td class="text-body-sm">${esc(m.ref_type || '')} ${m.ref_id || ''}${m.reason ? ` · ${esc(m.reason)}` : ''}</td><td class="text-body-sm">${esc(m.by_name || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="text-center py-6 text-on-surface-variant">No movement</td></tr>'}</tbody></table></div>` })}
    ${d.transfers.length ? card({ title: 'Transfers', pad: false, body: `${T()}<tbody>${d.transfers.map((t) => `<tr><td class="font-data-mono">${esc(t.transfer_no)}</td><td>${esc(t.source)} → ${esc(t.destination)}</td><td>${pill(t.status)}</td><td>${t.emergency ? (t.ratified_by ? '<span class="pill-success">Emergency · approved</span>' : '<span class="pill-danger pill-dot">Emergency · awaiting in-charge</span>') : ''}</td><td class="text-body-sm">${esc(t.requested_by_name || '')}</td></tr>`).join('')}</tbody></table>` }) : ''}`,
};

function receiptsCard(d) {
  return card({ title: `${d.receipts.length} receipts`, pad: false, body: `<div class="overflow-auto max-h-[68vh]">${T()}<thead><tr><th>Time</th><th>Receipt</th><th>Patient</th><th>Bill</th><th>Mode</th><th>Reference / txn</th><th class="num">Amount</th><th>Collected by</th></tr></thead><tbody>
    ${d.receipts.map((r) => `<tr><td class="text-body-sm">${fmtTime(r.created_at)}</td><td class="font-data-mono text-body-sm">${esc(r.receipt_no)}</td><td>${esc(r.patient_name)}</td><td class="font-data-mono text-body-sm">${esc(r.bill_no)} <span class="text-on-surface-variant">${esc(r.bill_type)}</span></td>
      <td>${esc(MODE_NAME[r.mode] || r.mode)}</td><td class="text-body-sm">${esc(r.transaction_id || r.reference || '')}</td><td class="num ${r.amount < 0 ? 'text-danger' : ''}">${money(r.amount, 2)}</td><td class="text-body-sm">${esc(r.collected_by || '')}</td></tr>`).join('') || '<tr><td colspan="8" class="text-center py-6 text-on-surface-variant">No receipts</td></tr>'}
    <tr class="font-semibold"><td colspan="6">Net</td><td class="num">${money(d.net, 2)}</td><td></td></tr></tbody></table></div>` });
}

/* --------------------------------------------------------------- handover */

async function handover(body, f, dayData) {
  const h = await api.get(`/desk/handover${qs({ desk: f.desk, date: f.date })}`);
  const exp = h.expected.modes;
  const shown = MODES.filter(([k]) => ['cash', 'upi', 'card'].includes(k) || Math.abs(exp[k] || 0) > 0.005);
  body.innerHTML = (dayData ? cashTiles({...dayData, ...h, personal:true, cash_in_hand:h.cash_in_hand}) : `<div class="card p-3">My cash in hand: ${money(h.cash_in_hand,2)} · Awaiting acceptance: ${money(h.cash_pending_acceptance,2)}</div>`) + `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
    ${card({ title: 'Hand over my collection', subtitle: `${esc(state.user.name)} · ${fmtDate(f.date)} · ${h.expected.receipts} receipt(s) in the system`,
      body: `<ol class="list-decimal ml-5 mb-3 text-body-md space-y-0.5"><li>Count the cash in your drawer and type it below.</li>
          <li>Check UPI and card totals on the UPI app / card machine slip.</li><li>Choose who you give the money to and press <b>Submit handover</b>.</li></ol>
        <label class="field-label">Cash retained in drawer for change</label><input class="field mb-3" type="number" min="0" step="0.01" value="0" data-retained><p class="text-body-sm mb-3">Enter the amount handed over below. Handed cash plus retained change must match the system cash. Retained cash remains at this desk; it is not additional revenue.</p>
        <table class="tbl"><thead><tr><th>Mode</th><th class="num">System says</th><th class="num">Handed over / confirmed</th><th class="num">Difference</th></tr></thead><tbody>
        ${shown.map(([k, l]) => `<tr><td>${l}</td><td class="num">${money(exp[k] || 0, 2)}</td>
          <td class="num"><input class="field field-sm !h-8 !w-32 text-right ml-auto" type="number" step="0.01" data-decl="${k}" value="${exp[k] || 0}" aria-label="${l} declared"></td>
          <td class="num" data-diff="${k}">—</td></tr>`).join('')}
        <tr class="font-semibold"><td>Total</td><td class="num">${money(h.expected.total, 2)}</td><td class="num" data-decl-total></td><td class="num" data-diff-total></td></tr></tbody></table>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div><label class="field-label">Handing over to Admin / Owner</label><select class="field" data-to required><option value="">Choose…</option>${h.receivers.map((u) => `<option value="${u.id}">${esc(u.name)} — ${esc(u.role)}</option>`).join('')}</select></div>
          <div><label class="field-label">Notes (required if there is a difference)</label><input class="field" data-notes></div></div>
        <button class="btn-primary mt-3" data-submit>Submit handover</button>` })}
    ${card({ title: 'Pending acceptance & selected-day handovers', pad: false, body: h.handovers.length ? `<div class="divide-y divide-outline-variant">${h.handovers.map((x) => `
      <div class="p-3"><div class="flex flex-wrap items-center gap-2"><span class="font-data-mono">${esc(x.handover_no)} · ${esc(x.desk)}</span><span class="font-label-lg">${esc(x.user_name)}</span>
        → <span>${esc(x.handed_to_name || '—')}</span><span class="flex-1"></span>${x.status === 'accepted' ? pill('verified', 'Accepted') : x.status === 'disputed' ? pill('rejected', 'Disputed') : pill('pending', 'Waiting')}</div>
        <table class="tbl mt-2"><thead><tr><th>Mode</th><th class="num">System</th><th class="num">Declared</th></tr></thead><tbody>${MODES.filter(([k]) => ['cash', 'upi', 'card'].includes(k) || x.expected[k] || x.declared[k]).map(([k, l]) => `<tr><td>${l}</td><td class="num">${money(x.expected[k] || 0, 2)}</td><td class="num ${Math.abs((x.declared[k] || 0) + (k==='cash'?x.retained_cash||0:0) - (x.expected[k] || 0)) > 0.005 ? 'text-danger font-semibold' : ''}">${money(x.declared[k] || 0, 2)}</td></tr>`).join('')}</tbody></table>
        <div class="text-body-sm mt-1 ${x.variance ? 'text-danger' : 'text-on-surface-variant'}">Retained for change ${money(x.retained_cash||0,2)} · Difference ${money(x.variance, 2)}${x.notes ? ` · ${esc(x.notes)}` : ''} · ${fmtDateTime(x.created_at)}${x.verified_by_name ? ` · checked by ${esc(x.verified_by_name)}${x.verify_note ? ` (${esc(x.verify_note)})` : ''}` : ''}</div>
        ${x.status === 'submitted' && x.user_id !== state.user.id && (x.handed_to === state.user.id || h.can_verify) ? `<div class="mt-2 flex gap-2"><button class="btn-primary btn-xs" data-accept="${x.id}">Accept</button><button class="btn-ghost btn-xs" data-dispute="${x.id}">Dispute</button></div>` : ''}
      </div>`).join('')}</div>` : '<p class="p-6 text-center text-on-surface-variant">No handover yet today.</p>' })}
  </div>`;
  const recalc = () => {
    let dt = 0, df = 0;
    for (const [k] of shown) {
      const v = +body.querySelector(`[data-decl="${k}"]`).value || 0;
      const diff = Math.round((v + (k === 'cash' ? +body.querySelector('[data-retained]').value || 0 : 0) - (exp[k] || 0)) * 100) / 100;
      dt += v; df += diff;
      body.querySelector(`[data-diff="${k}"]`).innerHTML = Math.abs(diff) < 0.005 ? '<span class="text-success">OK</span>' : `<span class="text-danger">${money(diff, 2)}</span>`;
    }
    body.querySelector('[data-decl-total]').textContent = money(dt, 2);
    body.querySelector('[data-diff-total]').innerHTML = Math.abs(df) < 0.005 ? '<span class="text-success">Matched</span>' : `<span class="text-danger">${money(df, 2)}</span>`;
  };
  body.querySelectorAll('[data-decl]').forEach((i) => (i.oninput = recalc));
  body.querySelector('[data-retained]').oninput = ()=>{body.querySelector('[data-decl="cash"]').value=Math.max(0,(exp.cash||0)-(+body.querySelector('[data-retained]').value||0));recalc();};
  recalc();
  body.querySelector('[data-submit]').onclick = async (e) => {
    if (!body.querySelector('[data-to]').reportValidity()) return;
    const btn = e.currentTarget; busy(btn, true);
    try {
      await api.post('/desk/handover', { desk: f.desk, date: f.date, retained_cash: +body.querySelector('[data-retained]').value || 0, handed_to: body.querySelector('[data-to]').value || undefined, notes: body.querySelector('[data-notes]').value.trim(),
        declared: Object.fromEntries(MODES.map(([k]) => [k, +(body.querySelector(`[data-decl="${k}"]`)?.value ?? exp[k] ?? 0) || 0])) });
      toast('Handover submitted', 'success'); handover(body, f);
    } catch (err) { apiError(err, err?.payload?.error === 'variance_needs_explanation' ? 'Explain the difference in the notes' : 'Handover not saved'); busy(btn, false); }
  };
  body.querySelectorAll('[data-accept],[data-dispute]').forEach((b) => (b.onclick = async () => {
    const dispute = !!b.dataset.dispute;
    const c = await confirmDialog({ title: dispute ? 'Dispute this handover' : 'Accept this handover', message: dispute ? 'Say what does not match.' : 'You confirm you received the amounts declared.',
      requireReason: dispute || Math.abs(h.handovers.find(x=>x.id===+(b.dataset.accept||b.dataset.dispute))?.variance||0)>.005, reasonLabel: dispute?'What does not match':'Explain acceptance of the difference', tone: dispute ? 'danger' : 'primary', confirmLabel: dispute ? 'Dispute' : 'Accept' });
    if (!c) return;
    const note = c.reason || '';
    try { await api.post(`/desk/handover/${b.dataset.accept || b.dataset.dispute}/verify`, { status: dispute ? 'disputed' : 'accepted', note }); toast(dispute ? 'Marked disputed' : 'Handover accepted', 'success'); handover(body, f); }
    catch (err) { apiError(err); }
  }));
}

/* ----------------------------------------------------------------- Excel */

function exportDay(d) {
  if (!d) return;
  const t = `${d.desk === 'pharmacy' ? 'Pharmacy' : 'Reception'} — ${d.date}`;
  const m = (k, l) => ({ key: k, label: l, type: 'money' });
  const n = (k, l) => ({ key: k, label: l, type: 'number' });
  const c = (k, l, value) => ({ key: k, label: l, value });
  const modes = { name: 'Summary', title: `Collection summary — ${t}`, columns: [c('mode', 'Mode'), m('amount', 'Amount')],
    rows: [...MODES.map(([k, l]) => ({ mode: l, amount: d.modes[k] || 0 })), { mode: 'Received', amount: d.received }, { mode: 'Refunded', amount: -d.refunded }, { mode: 'Net collected', amount: d.net }] };
  const receipts = { name: 'Receipts', title: `Receipts — ${t}`, columns: [c('created_at', 'Time'), c('receipt_no', 'Receipt'), c('patient_name', 'Patient'), c('uhid', 'UHID'), c('bill_no', 'Bill'), c('bill_type', 'Type'),
    c('mode', 'Mode', (r) => MODE_NAME[r.mode] || r.mode), c('ref', 'Reference / txn', (r) => r.transaction_id || r.reference || ''), m('amount', 'Amount'), c('collected_by', 'Collected by')], rows: d.receipts, totals: { amount: sum(d.receipts, 'amount') } };
  const sheets = [modes];
  if (d.desk === 'pharmacy') {
    sheets.push({ name: 'Sales lines', title: `Sales — ${t}`, columns: [c('created_at', 'Time'), c('bill_no', 'Bill'), c('bill_type', 'Type'), c('patient_name', 'Patient'), c('item', 'Item'), c('batch_no', 'Batch'), c('expiry', 'Expiry'), c('location', 'Store'), n('qty', 'Qty'), m('rate', 'Rate'), m('amount', 'Amount'), c('modes', 'Paid by')], rows: d.sales, totals: { qty: sum(d.sales, 'qty'), amount: sum(d.sales, 'amount') } },
      { name: 'Item-wise', title: `Items sold — ${t}`, columns: [c('item', 'Item'), c('code', 'Code'), n('op_qty', 'OP qty'), n('ip_qty', 'IP qty'), n('qty', 'Total qty'), m('amount', 'Value'), c('batches', 'Batches')], rows: d.items, totals: { qty: sum(d.items, 'qty'), amount: sum(d.items, 'amount') } },
      { name: 'Batch-wise', title: `Batches sold — ${t}`, columns: [c('item', 'Item'), c('batch_no', 'Batch'), c('expiry', 'Expiry'), c('location', 'Store'), n('qty', 'Qty'), m('amount', 'Value')], rows: d.batches },
      receipts,
      { name: 'Dues', title: 'Unpaid pharmacy bills', columns: [c('bill_no', 'Bill'), c('bill_date', 'Date'), c('patient_name', 'Patient'), c('mobile', 'Mobile'), m('total', 'Total'), m('paid', 'Paid'), m('balance', 'Due')], rows: d.dues, totals: { balance: sum(d.dues, 'balance') } },
      { name: 'Stock movement', title: `Stock movement — ${t}`, columns: [c('created_at', 'Time'), c('move_type', 'Type'), c('item', 'Item'), c('batch_no', 'Batch'), c('location', 'Store'), n('qty', 'Qty'), n('balance_after', 'Balance'), c('ref_type', 'Ref'), c('reason', 'Reason'), c('by_name', 'By')], rows: d.moves });
  } else {
    const lines = d.bills.flatMap((b) => b.lines.map((l) => ({ bill_no: b.bill_no, bill_type: b.bill_type, patient: b.patient_name, uhid: b.uhid, ip_no: b.ip_no || '', ...l })));
    sheets.push({ name: 'Bills', title: `Bills — ${t}`, columns: [c('bill_no', 'Bill'), c('bill_type', 'Type'), c('patient_name', 'Patient'), c('uhid', 'UHID'), c('ip_no', 'IP no'), c('doctor_name', 'Doctor'), m('total', 'Total'), m('paid', 'Paid'),
      { key: 'covered', label: 'Payer / free', type: 'money', value: (b) => (b.covered_amount || 0) + (b.waived_amount || 0) }, m('balance', 'Balance'), c('status', 'Status'),
      c('paid_by', 'Paid by', (b) => b.modes.map((x) => `${MODE_NAME[x.mode] || x.mode} ${x.amount}`).join('; '))], rows: d.bills, totals: { total: sum(d.bills, 'total'), paid: sum(d.bills, 'paid'), balance: sum(d.bills, 'balance') } },
      { name: 'Bill lines', title: `Bill lines — ${t}`, columns: [c('bill_no', 'Bill'), c('bill_type', 'Type'), c('patient', 'Patient'), c('ip_no', 'IP no'), c('description', 'Particulars'), c('category', 'Category'), n('qty', 'Qty'), m('rate', 'Rate'), m('amount', 'Amount')], rows: lines, totals: { amount: sum(lines, 'amount') } },
      { name: 'Billed items', title: `What was billed — ${t}`, columns: [c('item', 'Item / service'), c('bill_type', 'Bill type'), c('category', 'Category'), n('lines', 'Times'), n('qty', 'Qty'), m('amount', 'Amount')], rows: d.items, totals: { amount: sum(d.items, 'amount') } },
      { name: 'Inpatients', title: 'Inpatient bills', columns: [c('ip_no', 'IP no'), c('patient_name', 'Patient'), c('ward', 'Ward'), c('bed_no', 'Bed'), c('status', 'Status'), c('charges', 'Charges', (a) => a.charges.map((x) => `${x.description} ${x.days}d = ${x.amount}`).join('; ')), m('total', 'Total'), m('paid', 'Paid'), m('balance', 'Balance')], rows: d.inpatients },
      receipts,
      { name: 'Payer & free', title: 'Billed to payers, free and due', columns: [c('mode', 'Type', (s) => MODE_NAME[s.mode] || s.mode), n('n', 'Cases'), m('amount', 'Amount')], rows: d.settlements });
  }
  exportWorkbook(`${d.desk}-collection-${d.date}`, sheets);
}

async function rangePanel(body,f) {
  f.from ||= `${f.date}T08:00`;
  f.to ||= `${new Date(new Date(`${f.date}T12:00:00`).getTime()+86400000).toLocaleDateString('en-CA')}T08:00`;
  body.innerHTML=card({title:'Collections and sales by date & time',subtitle:'Hospital local time. Start included; end excluded. Collector filter applies to receipts; sales include every bill raised by the selected desk.',body:`<div class="flex flex-wrap gap-3 items-end"><div><label class="field-label">From</label><input type="datetime-local" class="field" data-range-from value="${esc(f.from)}"></div><div><label class="field-label">Until</label><input type="datetime-local" class="field" data-range-to value="${esc(f.to)}"></div><button class="btn-primary" data-range-run>View report</button><button class="btn-secondary" data-range-export>Export Excel</button></div><div data-range-result class="mt-4"></div>`});
  let result;
  const run=async()=>{f.from=body.querySelector('[data-range-from]').value;f.to=body.querySelector('[data-range-to]').value;try{result=await api.get(`/desk/range${qs({desk:f.desk,from:f.from,to:f.to,user_id:f.user_id})}`);body.querySelector('[data-range-result]').innerHTML=`<p class="font-semibold mb-3">Billed ${money(result.billed,2)} · Net collection ${money(result.net,2)} · ${Object.entries(result.modes).map(([k,v])=>`${esc(k)} ${money(v,2)}`).join(' · ')}</p>`+card({title:'Receipts',body:`<table class="tbl"><thead><tr><th>Time</th><th>Patient / bill</th><th>Collector</th><th>Mode</th><th>Amount</th></tr></thead><tbody>${result.receipts.map(r=>`<tr><td>${fmtDateTime(r.created_at)}</td><td>${esc(r.patient_name)} · ${esc(r.bill_no)}</td><td>${esc(r.collected_by)}</td><td>${esc(r.mode)}</td><td>${money(r.amount,2)}</td></tr>`).join('')||'<tr><td colspan="5">No receipts in this range.</td></tr>'}</tbody></table>`})+card({title:'All billed lines',body:`<table class="tbl"><thead><tr><th>Time</th><th>Patient / bill</th><th>Charge / batch</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${result.sales.map(r=>`<tr><td>${fmtDateTime(r.created_at)}</td><td>${esc(r.patient_name)} · ${esc(r.bill_no)}</td><td>${esc(r.description)} ${esc(r.batch_no||'')}</td><td>${r.qty}</td><td>${money(r.amount,2)}</td></tr>`).join('')||'<tr><td colspan="5">No billed lines in this range.</td></tr>'}</tbody></table>`});}catch(e){apiError(e,'Could not load time range');}};
  body.querySelector('[data-range-run]').onclick=run;
  body.querySelector('[data-range-export]').onclick=()=>{if(result)exportWorkbook(`${f.desk}-time-range`,[['Receipts',result.receipts,['created_at','receipt_no','patient_name','uhid','bill_no','collected_by','mode','amount']],['Billed lines',result.sales,['created_at','patient_name','bill_no','description','category','batch_no','expiry','qty','rate','amount']]].map(([name,rows,keys])=>({name,rows,title:`${f.from} – ${f.to}`,columns:keys.map(key=>({key,label:key.replaceAll('_',' '),type:['amount','rate','qty'].includes(key)?'number':undefined}))})));};
  await run();
}
async function shiftPanel(body,f) {
 const h=await api.get(`/desk/shifts${qs({desk:f.desk})}`);
 body.innerHTML=card({title:'Shift change — outgoing to incoming staff',subtitle:'Accepted shift handover transfers custody of the drawer cash to incoming staff. Original receipts keep their collector. This is not new revenue; Admin / Owner cash acceptance remains separate.',body:`<p class="mb-3">System drawer cash ${money(h.cash_in_hand,2)} · Reserved for Admin / Owner acceptance ${money(h.cash_pending_acceptance,2)} · Available for incoming shift ${money(Math.max(0,h.cash_in_hand-h.cash_pending_acceptance),2)}</p><div class="grid grid-cols-2 gap-3"><div><label class="field-label">Outgoing shift</label><select class="field" data-shift-from><option>morning</option><option>evening</option><option>night</option></select></div><div><label class="field-label">Incoming shift</label><select class="field" data-shift-to><option>evening</option><option>night</option><option>morning</option></select></div><div><label class="field-label">Incoming staff</label><select class="field" data-shift-user><option value="">Choose</option>${h.receivers.map(u=>`<option value="${u.id}">${esc(u.name)} — ${esc(u.role)}</option>`).join('')}</select></div><div><label class="field-label">Counted drawer cash</label><input class="field" type="number" min="0" value="${Math.max(0,h.cash_in_hand-h.cash_pending_acceptance)}" data-shift-cash></div></div><label class="field-label mt-3">Pending work / stock / keys / discrepancies</label><textarea class="field" data-shift-notes></textarea><button class="btn-primary mt-3" data-shift-submit>Submit shift handover</button>`})+card({title:'Shift handover history',body:h.list.map(s=>`<div class="border-b py-3"><b>${esc(s.from_name)} → ${esc(s.to_name)}</b> · ${esc(s.from_shift)} → ${esc(s.to_shift)} · ${esc(s.shift_date)} · ${esc(s.status)}<p>Counted cash ${money(s.cash_count,2)} · ${esc(s.notes)}</p>${s.status==='submitted'&&s.to_user===state.user.id?`<button class="btn-secondary" data-shift-accept="${s.id}">Accept incoming shift</button>`:''}</div>`).join('')||'No shift handovers yet.'});
 body.querySelector('[data-shift-submit]').onclick=async e=>{busy(e.currentTarget,true);try{await api.post('/desk/shifts',{desk:f.desk,from_shift:body.querySelector('[data-shift-from]').value,to_shift:body.querySelector('[data-shift-to]').value,to_user:body.querySelector('[data-shift-user]').value,cash_count:body.querySelector('[data-shift-cash]').value,notes:body.querySelector('[data-shift-notes]').value});toast('Shift handover submitted','success');await shiftPanel(body,f);}catch(err){apiError(err,'Could not submit shift');busy(e.currentTarget,false);}};
 body.querySelectorAll('[data-shift-accept]').forEach(b=>b.onclick=async()=>{try{await api.post(`/desk/shifts/${b.dataset.shiftAccept}/accept`,{});await shiftPanel(body,f);}catch(e){apiError(e);}});
}
