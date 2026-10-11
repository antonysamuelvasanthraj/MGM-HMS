/**
 * Accounts — the double-entry books. Everything here is read from journals the
 * hospital's own transactions posted; the only manual entries are journals
 * for what no screen covers, contra transfers, payer receipts and day close.
 */
import {
  page, eyebrow, liveChip, card, live, mountPage, api, qs, can, esc, bind, kpi, money, compactMoney, fmtDate,
  fmtDateTime, pill, modal, drawer, toast, busy, apiError, confirmDialog, downloadCSV, todayISO, navigate,
} from './_kit.js';
import { uid } from '../ui.js';

const TABS = [
  ['position', 'Position', 'finance.view'], ['journals', 'Journals', 'finance.view'], ['ledger', 'Ledger', 'finance.view'],
  ['receivables', 'Receivables', null], ['payables', 'Payables', null], ['close', 'Day close', 'finance.view'],
  ['reconcile', 'Reconciliation', 'finance.view'], ['chart', 'Chart of accounts', 'finance.view'],
];
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This FY']];
const MODE_LABEL = { cash: 'Cash', upi: 'UPI', debit_card: 'Debit card', credit_card: 'Credit card', bank_transfer: 'Bank transfer', cheque: 'Cheque',
  insurance: 'Insurance', aarogyasri: 'Aarogyasri', corporate: 'Corporate', credit: 'Credit', trust: 'Trust' };
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const amt = (v) => (Math.abs(+v || 0) < 0.005 ? '<span class="text-on-surface-variant">—</span>' : money(v, 2));

export async function mount(ctx) {
  const visible = TABS.filter(([k, , p]) => (p ? can(p) : k === 'receivables' ? (can('finance.receivables') || can('insurance.write') || can('finance.view')) : (can('finance.payables') || can('purchase.view'))));
  const f = { tab: visible.some(([k]) => k === ctx.query.tab) ? ctx.query.tab : visible[0]?.[0], preset: 'month', account_id: ctx.query.account_id || '' };
  const root = mountPage(ctx, page({
    wide: true,
    eyebrow: `${eyebrow('Finance', 'account_balance')} ${liveChip()}`,
    title: 'Accounts',
    subtitle: 'Double-entry books posted automatically by billing, pharmacy, purchases and expenses.',
    actions: `${can('finance.journal') ? '<button class="btn-secondary" data-new-jv><span class="material-symbols-outlined text-[18px]">post_add</span>Journal entry</button>' : ''}
      ${can('finance.write') ? '<button class="btn-secondary" data-contra><span class="material-symbols-outlined text-[18px]">swap_horiz</span>Bank deposit / settlement</button>' : ''}`,
    body: `<div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex flex-wrap p-0.5 rounded bg-surface-container" role="tablist">${visible.map(([k, l]) => `<button role="tab" data-tab="${k}"
          class="px-3 h-8 rounded font-label-md text-label-md">${l}</button>`).join('')}</div>
        <div class="flex-1"></div>
        <select class="field field-sm !h-9 !w-auto" data-preset aria-label="Period">${PRESETS.map(([v, l]) => `<option value="${v}" ${v === f.preset ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div data-pane class="space-y-4"></div>`,
  }));
  const pane = root.querySelector('[data-pane]');

  const paintTabs = () => root.querySelectorAll('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === f.tab;
    b.setAttribute('aria-selected', on);
    b.className = `px-3 h-8 rounded font-label-md text-label-md ${on ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`;
  });

  async function load() {
    paintTabs();
    root.querySelector('[data-preset]').classList.toggle('invisible', ['position', 'receivables', 'payables', 'chart', 'close'].includes(f.tab));
    await ({ position, journals, ledger, receivables, payables, close: dayClose, reconcile, chart: chartOfAccounts })[f.tab](pane, f, load);
  }

  bind(root, 'click', '[data-tab]', (e, b) => { f.tab = b.dataset.tab; history.replaceState({}, '', `/accounts?tab=${f.tab}`); load(); });
  root.querySelector('[data-preset]').onchange = (e) => { f.preset = e.target.value; load(); };
  bind(root, 'click', '[data-new-jv]', () => journalForm(load));
  bind(root, 'click', '[data-contra]', () => contraForm(load));
  bind(root, 'click', '[data-voucher]', (e, b) => voucherDrawer(+b.dataset.voucher));
  bind(root, 'click', '[data-ledger]', (e, b) => { f.tab = 'ledger'; f.account_id = b.dataset.ledger; load(); });

  return live({ topics: ['accounts', 'finance', 'billing'], events: ['journal.posted', 'journal.reversed', 'payment.received', 'settlement.received', 'expense.updated', 'supplier.paid', 'day.closed'], load });
}

/* ---------------------------------------------------------------- position */

async function position(pane) {
  const [p, chk] = await Promise.all([api.get('/accounts/position'), api.get('/accounts/integrity').catch(() => null)]);
  const recv = p.receivables;
  pane.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">${[
      { label: 'Cash in hand', value: money(p.cash, 2), icon: 'payments', tone: 'success' },
      { label: 'Bank', value: money(p.bank, 2), icon: 'account_balance' },
      { label: 'UPI / card awaiting bank', value: money(p.upi_pending + p.card_pending, 2), sub: `UPI ${compactMoney(p.upi_pending)} · Card ${compactMoney(p.card_pending)}`, icon: 'hourglass_top', tone: 'warning' },
      { label: 'Supplier payables', value: money(p.payables, 2), icon: 'local_shipping', tone: p.payables ? 'danger' : 'neutral' },
    ].map(kpi).join('')}</div>
    ${card({ title: 'Receivables by type', subtitle: 'What patients and payers owe the hospital', pad: false, body: `<table class="tbl"><tbody>
      ${recv.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${amt(r.balance)}</td></tr>`).join('')}
      <tr class="font-semibold"><td>Total</td><td class="num">${money(r2(recv.reduce((s, r) => s + r.balance, 0)), 2)}</td></tr></tbody></table>` })}
    <p class="text-body-sm text-on-surface-variant">Books closed through ${p.last_closed ? fmtDate(p.last_closed) : '— (no day closed yet)'}. Patient advances held: ${money(p.advances, 2)}.</p>
    ${chk ? booksCheck(chk) : ''}`;
  pane.querySelector('[data-correct-books]')?.addEventListener('click', () => {
    modal({
      title: 'Correct the books', subtitle: `${chk.orphan_vouchers.length} voucher(s) whose record no longer exists`, size: 'sm',
      body: `<p class="text-body-md mb-3">A correction entry reverses each voucher below. Nothing is edited or deleted; both entries stay in the journal.</p>
        <ul class="text-body-sm mb-3">${chk.orphan_vouchers.map((v) => `<li>${esc(v.voucher_no)} · ${money(v.total, 2)} · ${esc(v.narration || '')}</li>`).join('')}</ul>
        <label class="field-label">Reason *</label><input class="field" data-reason placeholder="e.g. Test receipts removed from the database">`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Post corrections</button>',
      onMount(root, close) {
        root.querySelector('[data-ok]').onclick = async (ev) => {
          const b = ev.currentTarget; busy(b, true);
          try { await api.post('/accounts/integrity/correct', { reason: root.querySelector('[data-reason]').value }); close(); toast('Corrections posted', 'success'); position(pane); }
          catch (e) { apiError(e); busy(b, false); }
        };
      },
    });
  });
}

/** Books integrity: a green line when all is well, otherwise what is wrong and how to correct it. */
function booksCheck(c) {
  if (c.ok) return `<p class="text-body-sm">${pill('verified', 'Books check passed')} <span class="text-on-surface-variant">Every voucher balances, the trial balance is level and every entry has its record.</span></p>`;
  return card({ title: 'Books check needs attention', subtitle: 'Found by the automatic integrity check', body: `
    ${c.unbalanced.length ? `<p class="text-body-md">${pill('rejected', 'Unbalanced')} ${c.unbalanced.map((v) => esc(v.voucher_no)).join(', ')}</p>` : ''}
    ${Math.abs(c.trial_balance_difference) >= 0.01 ? `<p class="text-body-md">${pill('rejected', 'Trial balance')} differs by ${money(c.trial_balance_difference, 2)}</p>` : ''}
    ${c.orphan_vouchers.length ? `<p class="text-body-md">${pill('pending', 'Entries without a record')} ${c.orphan_vouchers.length} voucher(s), ${money(c.orphan_vouchers.reduce((s, v) => s + v.total, 0), 2)}:
      their bill, receipt or other record was removed outside the app, so cash and receivables are misstated.</p>
      <ul class="text-body-sm mt-2">${c.orphan_vouchers.map((v) => `<li>${esc(v.voucher_no)} · ${money(v.total, 2)} · ${esc(v.narration || '')}</li>`).join('')}</ul>
      ${can('books.reopen') ? '<button class="btn-primary mt-3" data-correct-books>Post corrections</button>' : '<p class="text-body-sm text-on-surface-variant mt-2">Ask the owner or administrator to post the corrections.</p>'}` : ''}` });
}

/* ---------------------------------------------------------------- journals */

async function journals(pane, f) {
  const d = await api.get(`/accounts/journals${qs({ preset: f.preset, type: f.jtype, q: f.jq })}`);
  pane.innerHTML = card({
    title: 'Journal vouchers', subtitle: `${d.rows.length} vouchers · ${fmtDate(d.from)} – ${fmtDate(d.to)}`, pad: false,
    actions: `<input class="field field-sm !h-8 !w-48" placeholder="Search voucher / narration" data-jq value="${esc(f.jq || '')}">
      <select class="field field-sm !h-8 !w-auto" data-jtype><option value="">All types</option>${d.types.map((t) => `<option ${t.voucher_type === f.jtype ? 'selected' : ''}>${esc(t.voucher_type)}</option>`).join('')}</select>
      <button class="btn-ghost btn-sm" data-csv>CSV</button>`,
    body: `<div class="overflow-auto max-h-[64vh]"><table class="tbl"><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th>Source</th><th class="num">Amount</th><th>Status</th><th>By</th></tr></thead>
      <tbody>${d.rows.map((v) => `<tr class="cursor-pointer" data-voucher="${v.id}"><td>${fmtDate(v.voucher_date)}</td><td class="font-data-mono">${esc(v.voucher_no)}</td>
        <td>${esc(v.voucher_type)}</td><td class="max-w-[420px] truncate">${esc(v.narration || '')}</td><td class="text-body-sm text-on-surface-variant">${esc(v.source || '')}</td>
        <td class="num">${money(v.total, 2)}</td><td>${v.status === 'reversed' ? pill('cancelled', 'Reversed') : v.reversal_of ? pill('amended', 'Reversal') : pill('verified', 'Posted')}</td>
        <td class="text-body-sm">${esc(v.created_by_name || 'System')}</td></tr>`).join('') || '<tr><td colspan="8" class="text-center py-8 text-on-surface-variant">No vouchers in this period</td></tr>'}</tbody></table></div>`,
  });
  pane.querySelector('[data-jtype]').onchange = (e) => { f.jtype = e.target.value; journals(pane, f); };
  pane.querySelector('[data-jq]').onchange = (e) => { f.jq = e.target.value; journals(pane, f); };
  pane.querySelector('[data-csv]').onclick = () => downloadCSV('journals.csv', d.rows.map((v) => ({ date: v.voucher_date, voucher: v.voucher_no, type: v.voucher_type, narration: v.narration, source: v.source, amount: v.total, status: v.status })));
}

async function voucherDrawer(id) {
  const v = await api.get(`/accounts/journals/${id}`);
  const manual = ['manual', 'opening', 'contra', 'clearing'].includes(v.source);
  drawer({
    title: v.voucher_no, subtitle: `${esc(v.voucher_type)} · ${fmtDate(v.voucher_date)} · by ${esc(v.created_by_name || 'System')}`, width: 'max-w-2xl',
    body: `<div class="p-5 space-y-3"><p class="text-body-lg">${esc(v.narration || '')}</p>
      ${v.reason ? `<p class="text-body-md text-on-surface-variant">Reason: ${esc(v.reason)}</p>` : ''}
      <table class="tbl"><thead><tr><th>Account</th><th>Segment</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${v.lines.map((l) => `<tr><td><span class="font-data-mono text-on-surface-variant">${esc(l.code)}</span> ${esc(l.account_name)}${l.party_type ? `<div class="text-body-sm text-on-surface-variant">${esc(l.party_type)} #${l.party_id}${l.category ? ` · ${esc(l.category)}` : ''}</div>` : ''}</td>
        <td class="text-body-sm">${esc(l.segment || '')}</td><td class="num">${amt(l.debit)}</td><td class="num">${amt(l.credit)}</td></tr>`).join('')}
      <tr class="font-semibold"><td colspan="2">Total</td><td class="num">${money(v.lines.reduce((s, l) => s + l.debit, 0), 2)}</td><td class="num">${money(v.lines.reduce((s, l) => s + l.credit, 0), 2)}</td></tr></tbody></table>
      ${!manual ? '<p class="text-body-sm text-on-surface-variant">Posted automatically. To change it, cancel or correct the source document (bill, receipt, GRN or expense); the books follow.</p>' : ''}</div>`,
    footer: manual && v.status !== 'reversed' && !v.reversal_of && can('finance.journal') ? '<button class="btn-danger" data-reverse>Reverse voucher</button>' : '',
    onMount(el, close) {
      el.querySelector('[data-reverse]')?.addEventListener('click', async () => {
        const c = await confirmDialog({ title: 'Reverse voucher', message: 'A mirror entry will be posted; the original stays on record.', tone: 'danger', requireReason: true, confirmLabel: 'Reverse' });
        if (!c) return;
        try { await api.post(`/accounts/journals/${v.id}/reverse`, { reason: c.reason }); toast('Voucher reversed', 'success'); close(); } catch (err) { apiError(err); }
      });
    },
  });
}

async function journalForm(after) {
  const accounts = (await api.get('/accounts/chart')).filter((a) => !a.is_group && a.active);
  const opt = accounts.map((a) => `<option value="${a.id}">${esc(a.code)} · ${esc(a.name)}</option>`).join('');
  const line = () => `<div data-l class="grid gap-2" style="grid-template-columns:1fr 120px 120px 32px">
    <select class="field field-sm !h-9" data-acc>${opt}</select><input class="field field-sm !h-9 text-right" type="number" step="0.01" min="0" data-dr placeholder="Debit">
    <input class="field field-sm !h-9 text-right" type="number" step="0.01" min="0" data-cr placeholder="Credit"><button type="button" class="btn-ghost !h-9 !w-8 !px-0" data-rm aria-label="Remove">×</button></div>`;
  modal({
    title: 'Journal entry', size: 'lg',
    subtitle: 'For opening balances, depreciation, accruals and corrections. Sales, receipts, purchases and expenses post themselves and are refused here.',
    body: `<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3"><div><label class="field-label">Date</label><input type="date" class="field" data-date value="${todayISO()}"></div>
      <div class="md:col-span-2"><label class="field-label">Narration</label><input class="field" data-narr required></div></div>
      <div class="space-y-2" data-lines>${line()}${line()}</div><button type="button" class="btn-ghost btn-sm mt-2" data-add>Add line</button>
      <p class="mt-3 font-data-mono" data-bal aria-live="polite"></p>
      <label class="field-label mt-2">Reason</label><input class="field" data-reason placeholder="Why this entry is needed">
      ${can('admin.write') ? '<label class="flex items-center gap-2 mt-3 text-body-md"><input type="checkbox" data-opening> Opening balance (may use system accounts)</label>' : ''}`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Post journal</button>',
    onMount(el, close) {
      const host = el.querySelector('[data-lines]');
      const read = () => [...host.children].map((l) => ({ account_id: +l.querySelector('[data-acc]').value, debit: +l.querySelector('[data-dr]').value || 0, credit: +l.querySelector('[data-cr]').value || 0 })).filter((l) => l.debit || l.credit);
      const bal = () => { const ls = read(); const dr = r2(ls.reduce((s, l) => s + l.debit, 0)), cr = r2(ls.reduce((s, l) => s + l.credit, 0));
        el.querySelector('[data-bal]').innerHTML = `Debit ${money(dr, 2)} · Credit ${money(cr, 2)} · ${Math.abs(dr - cr) < 0.005 && dr > 0 ? '<span class="text-success">Balanced</span>' : `<span class="text-danger">Difference ${money(Math.abs(dr - cr), 2)}</span>`}`;
        el.querySelector('[data-save]').disabled = !(Math.abs(dr - cr) < 0.005 && dr > 0); };
      el.querySelector('[data-add]').onclick = () => { host.insertAdjacentHTML('beforeend', line()); bal(); };
      host.oninput = bal;
      host.onclick = (e) => { if (e.target.closest('[data-rm]') && host.children.length > 2) { e.target.closest('[data-l]').remove(); bal(); } };
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          await api.post('/accounts/journals', { date: el.querySelector('[data-date]').value, narration: el.querySelector('[data-narr]').value.trim(), reason: el.querySelector('[data-reason]').value.trim(),
            opening: el.querySelector('[data-opening]')?.checked, lines: read() });
          close(); toast('Journal posted', 'success'); after();
        } catch (err) { apiError(err, 'Journal not posted'); busy(btn, false); }
      };
      bal();
    },
  });
}

function contraForm(after) {
  const opts = [['cash', 'Cash in hand'], ['upi', 'UPI settlement clearing'], ['card', 'Card settlement clearing'], ['cheque', 'Cheques in hand'], ['bank', 'Bank'], ['petty_cash', 'Petty cash']];
  modal({
    title: 'Bank deposit / settlement', size: 'md',
    subtitle: 'Move money between the hospital’s own accounts — a cash deposit, or the UPI / card provider crediting the bank.',
    body: `<div class="grid grid-cols-2 gap-3"><div><label class="field-label">From</label><select class="field" data-from>${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <div><label class="field-label">To</label><select class="field" data-to>${opts.map(([v, l]) => `<option value="${v}" ${v === 'bank' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="field-label">Amount moved</label><input class="field" type="number" step="0.01" min="0" data-amount></div>
      <div><label class="field-label">Charges deducted</label><input class="field" type="number" step="0.01" min="0" value="0" data-charges></div>
      <div><label class="field-label">Date</label><input type="date" class="field" data-date value="${todayISO()}"></div>
      <div><label class="field-label">Reference</label><input class="field" data-ref placeholder="Deposit slip / settlement ID"></div></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          await api.post('/accounts/contra', { from: el.querySelector('[data-from]').value, to: el.querySelector('[data-to]').value, amount: +el.querySelector('[data-amount]').value,
            charges: +el.querySelector('[data-charges]').value || 0, date: el.querySelector('[data-date]').value, reference: el.querySelector('[data-ref]').value.trim() });
          close(); toast('Recorded', 'success'); after();
        } catch (err) { apiError(err); busy(btn, false); }
      };
    },
  });
}

/* ------------------------------------------------------------------ ledger */

async function ledger(pane, f) {
  const accounts = (await api.get('/accounts/chart')).filter((a) => !a.is_group);
  if (!f.account_id) f.account_id = String(accounts.find((a) => a.system_key === 'cash')?.id || accounts[0]?.id);
  const L = await api.get(`/accounts/ledger${qs({ account_id: f.account_id, preset: f.preset })}`);
  pane.innerHTML = card({
    title: `${L.account.code} · ${L.account.name}`, subtitle: `${fmtDate(L.from)} – ${fmtDate(L.to)} · opening ${money(L.opening, 2)} · closing ${money(L.closing, 2)}`, pad: false,
    actions: `<select class="field field-sm !h-8 !w-72" data-acc aria-label="Account">${accounts.map((a) => `<option value="${a.id}" ${String(a.id) === String(f.account_id) ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select>
      <button class="btn-ghost btn-sm" data-csv>CSV</button>`,
    body: `<div class="overflow-auto max-h-[64vh]"><table class="tbl"><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th>Segment</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>
      <tr class="bg-surface-container-low"><td colspan="6">Opening balance</td><td class="num">${money(L.opening, 2)}</td></tr>
      ${L.lines.map((l) => `<tr class="cursor-pointer" data-voucher="${l.voucher_id}"><td>${fmtDate(l.voucher_date)}</td><td class="font-data-mono">${esc(l.voucher_no)}</td><td class="max-w-[420px] truncate">${esc(l.memo || l.narration || '')}</td>
        <td class="text-body-sm">${esc(l.segment || '')}</td><td class="num">${amt(l.debit)}</td><td class="num">${amt(l.credit)}</td><td class="num">${money(l.balance, 2)}</td></tr>`).join('')}
      <tr class="font-semibold"><td colspan="4">Period total</td><td class="num">${money(L.debit, 2)}</td><td class="num">${money(L.credit, 2)}</td><td class="num">${money(L.closing, 2)}</td></tr></tbody></table></div>`,
  });
  pane.querySelector('[data-acc]').onchange = (e) => { f.account_id = e.target.value; ledger(pane, f); };
  pane.querySelector('[data-csv]').onclick = () => downloadCSV(`ledger-${L.account.code}.csv`, L.lines.map((l) => ({ date: l.voucher_date, voucher: l.voucher_no, narration: l.memo || l.narration, debit: l.debit, credit: l.credit, balance: l.balance })));
}

/* ------------------------------------------------------------- receivables */

async function receivables(pane, f, reload) {
  const d = await api.get(`/accounts/receivables${qs({ mode: f.rmode, status: f.rstatus || 'open', q: f.rq })}`);
  const mayReceive = can('finance.receivables') || can('insurance.write');
  pane.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">${d.balances.map((b) => kpi({ label: b.label, value: compactMoney(b.balance), icon: 'account_balance_wallet', tone: b.balance > 0 ? 'warning' : 'neutral' })).join('')}</div>
    ${card({
      title: 'Payer settlements', subtitle: 'Insurance, Aarogyasri, corporate, credit and trust balances taken over from patient bills', pad: false,
      actions: `<input class="field field-sm !h-8 !w-44" placeholder="Patient / bill / payer" data-rq value="${esc(f.rq || '')}">
        <select class="field field-sm !h-8 !w-auto" data-rmode><option value="">All payers</option>${['insurance', 'aarogyasri', 'corporate', 'credit', 'trust', 'free'].map((m) => `<option value="${m}" ${f.rmode === m ? 'selected' : ''}>${MODE_LABEL[m] || 'Free'}</option>`).join('')}</select>
        <select class="field field-sm !h-8 !w-auto" data-rstatus>${[['open', 'Open'], ['settled', 'Settled'], ['written_off', 'Written off'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([v, l]) => `<option value="${v}" ${(f.rstatus || 'open') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
      body: `<div class="overflow-auto max-h-[60vh]"><table class="tbl"><thead><tr><th>Ref</th><th>Patient</th><th>Payer</th><th>Bill</th><th class="num">Amount</th><th class="num">Received</th><th class="num">Open</th><th>Age</th><th>Status</th><th></th></tr></thead><tbody>
        ${d.rows.map((s) => `<tr><td class="font-data-mono">${esc(s.settlement_no)}</td><td><div>${esc(s.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(s.uhid)}</div></td>
          <td>${esc(MODE_LABEL[s.mode] || s.mode)}<div class="text-body-sm text-on-surface-variant">${esc(s.payer_name || '')} ${esc(s.reference || '')}</div></td>
          <td class="font-data-mono">${esc(s.bill_no)}</td><td class="num">${money(s.amount, 2)}</td><td class="num">${amt(s.settled_amount)}</td><td class="num font-semibold">${amt(s.open)}</td>
          <td class="text-body-sm">${s.age_days} d</td><td>${pill(s.status === 'partially_settled' ? 'partial' : s.status)}</td>
          <td class="text-right whitespace-nowrap">${mayReceive && s.open > 0 && s.mode !== 'free' ? `<button class="btn-primary btn-sm" data-receive="${s.id}">Receive</button>` : ''}
            ${can('payment.authorize') && s.settled_amount === 0 && s.status !== 'cancelled' ? `<button class="btn-ghost btn-sm" data-cancel-s="${s.id}">Cancel</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="10" class="text-center py-8 text-on-surface-variant">Nothing outstanding</td></tr>'}</tbody></table></div>`,
    })}`;
  pane.querySelector('[data-rmode]').onchange = (e) => { f.rmode = e.target.value; receivables(pane, f, reload); };
  pane.querySelector('[data-rstatus]').onchange = (e) => { f.rstatus = e.target.value; receivables(pane, f, reload); };
  pane.querySelector('[data-rq]').onchange = (e) => { f.rq = e.target.value; receivables(pane, f, reload); };
  pane.querySelectorAll('[data-receive]').forEach((b) => (b.onclick = () => receiveForm(d.rows.find((s) => s.id === +b.dataset.receive), () => receivables(pane, f, reload))));
  pane.querySelectorAll('[data-cancel-s]').forEach((b) => (b.onclick = async () => {
    const c = await confirmDialog({ title: 'Cancel settlement', message: 'The amount goes back to the patient’s balance.', tone: 'danger', requireReason: true });
    if (!c) return;
    try { await api.post(`/accounts/receivables/${b.dataset.cancelS}/cancel`, { reason: c.reason }); toast('Settlement cancelled', 'success'); receivables(pane, f, reload); } catch (err) { apiError(err); }
  }));
}

export function receiveForm(s, after) {
  modal({
    title: `Receive from ${MODE_LABEL[s.mode] || s.mode}`, subtitle: `${esc(s.settlement_no)} · ${esc(s.patient_name)} · open ${money(s.open, 2)}`, size: 'md',
    body: `<div class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Amount received</label><input class="field text-right" type="number" step="0.01" min="0" data-amount value="${s.open}"></div>
      <div><label class="field-label">Mode</label><select class="field" data-mode>${['bank_transfer', 'cheque', 'upi', 'cash'].map((m) => `<option value="${m}">${MODE_LABEL[m]}</option>`).join('')}</select></div>
      <div><label class="field-label">Disallowed / short-paid</label><input class="field text-right" type="number" step="0.01" min="0" value="0" data-dis></div>
      <div><label class="field-label">Disallowed amount goes to</label><select class="field" data-action><option value="write_off">Write off (claim disallowance)</option><option value="transfer_to_patient">Patient to pay</option></select></div>
      <div class="col-span-2"><label class="field-label">UTR / cheque / reference</label><input class="field" data-ref></div>
      <div class="col-span-2"><label class="field-label">Notes</label><input class="field" data-notes></div></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record receipt</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          await api.post(`/accounts/receivables/${s.id}/receive`, { amount: +el.querySelector('[data-amount]').value || 0, disallowed: +el.querySelector('[data-dis]').value || 0,
            disallowance_action: el.querySelector('[data-action]').value, mode: el.querySelector('[data-mode]').value, reference: el.querySelector('[data-ref]').value.trim(), notes: el.querySelector('[data-notes]').value.trim() });
          close(); toast('Settlement recorded', 'success'); after();
        } catch (err) { apiError(err); busy(btn, false); }
      };
    },
  });
}

/* ---------------------------------------------------------------- payables */

async function payables(pane, f) {
  const [d, pays] = await Promise.all([api.get('/pharmacy/payables'), api.get('/pharmacy/supplier-payments')]);
  const mayPay = can('finance.payables');
  pane.innerHTML = `${card({
    title: 'Supplier payables', subtitle: `Total outstanding ${money(d.total, 2)}`, pad: false,
    body: `<div class="overflow-auto max-h-[52vh]"><table class="tbl"><thead><tr><th>Supplier</th><th class="num">Current</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">90+</th><th class="num">Outstanding</th><th></th></tr></thead><tbody>
      ${d.suppliers.map((s) => `<tr><td><div>${esc(s.name)}</div><div class="text-body-sm text-on-surface-variant">${s.grns.length} open GRN · ${s.credit_days} day terms</div></td>
        <td class="num">${amt(s.current + s.d30)}</td><td class="num">${amt(s.d60)}</td><td class="num">${amt(s.d90)}</td><td class="num">${amt(s.over90)}</td>
        <td class="num font-semibold">${money(s.outstanding, 2)}</td><td class="text-right">${mayPay && s.outstanding > 0 ? `<button class="btn-primary btn-sm" data-pay="${s.id}">Pay</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="7" class="text-center py-8 text-on-surface-variant">No supplier dues</td></tr>'}</tbody></table></div>`,
  })}
  ${card({ title: 'Supplier payments', pad: false, body: `<div class="overflow-auto max-h-[40vh]"><table class="tbl"><thead><tr><th>Date</th><th>No.</th><th>Supplier</th><th>Mode</th><th>Reference</th><th class="num">Amount</th><th>By</th></tr></thead><tbody>
    ${pays.map((p) => `<tr><td>${fmtDate(p.paid_on)}</td><td class="font-data-mono">${esc(p.payment_no)}</td><td>${esc(p.supplier_name)}</td><td>${esc(MODE_LABEL[p.mode] || p.mode)}</td>
      <td>${esc(p.reference || '')}</td><td class="num">${money(p.amount, 2)}</td><td class="text-body-sm">${esc(p.created_by_name || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center py-6 text-on-surface-variant">No payments yet</td></tr>'}</tbody></table></div>` })}`;
  pane.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => {
    const s = d.suppliers.find((x) => x.id === +b.dataset.pay);
    modal({
      title: `Pay ${s.name}`, subtitle: `Outstanding ${money(s.outstanding, 2)}`, size: 'md',
      body: `<div class="grid grid-cols-2 gap-3"><div><label class="field-label">Amount</label><input class="field text-right" type="number" step="0.01" min="0" data-amount value="${s.outstanding}"></div>
        <div><label class="field-label">Mode</label><select class="field" data-mode>${['bank_transfer', 'cheque', 'upi', 'cash'].map((m) => `<option value="${m}">${MODE_LABEL[m]}</option>`).join('')}</select></div>
        <div class="col-span-2"><label class="field-label">Against GRN (optional — oldest first otherwise)</label><select class="field" data-grn><option value="">Oldest first</option>${s.grns.map((g) => `<option value="${g.id}">${esc(g.grn_no)} · ${esc(g.invoice_no || '')} · open ${money(g.open, 2)}</option>`).join('')}</select></div>
        <div><label class="field-label">Date</label><input type="date" class="field" data-date value="${todayISO()}"></div>
        <div><label class="field-label">Reference</label><input class="field" data-ref placeholder="UTR / cheque no."></div></div>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record payment</button>',
      onMount(el, close) {
        el.querySelector('[data-save]').onclick = async (e) => {
          const btn = e.currentTarget; busy(btn, true);
          try {
            await api.post('/pharmacy/supplier-payments', { supplier_id: s.id, amount: +el.querySelector('[data-amount]').value, mode: el.querySelector('[data-mode]').value,
              purchase_id: el.querySelector('[data-grn]').value || undefined, paid_on: el.querySelector('[data-date]').value, reference: el.querySelector('[data-ref]').value.trim() });
            close(); toast('Supplier payment recorded', 'success'); payables(pane, f);
          } catch (err) { apiError(err); busy(btn, false); }
        };
      },
    });
  }));
}

/* --------------------------------------------------------------- day close */

/**
 * Day close: the whole hospital's day in separate lanes (billing, revenue,
 * collection, receivables, advances, expenses, cash), then the cashier counts
 * cash and checks UPI / card / bank against their statements. Any difference
 * needs a remark and a second person's approval; once closed, the day's bills
 * and receipts change only by an administrator, with a reason, in the audit.
 */
async function dayClose(pane, f) {
  const date = f.closeDate || todayISO();
  const [p, history] = await Promise.all([api.get(`/accounts/day-close?date=${date}`), api.get('/accounts/day-closings')]);
  const closed = p.closing?.status === 'closed';
  const H = p.hospital, m2 = (v) => money(v || 0, 2);
  const rows = (pairs) => `<table class="tbl"><tbody>${pairs.map(([l, v, cls = '']) => `<tr class="${cls}"><td>${l}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>`;
  let dec = {};
  try { dec = JSON.parse(p.closing?.declared || '{}'); } catch { dec = {}; }
  const hist = history.find((h) => h.close_date === date);
  const approval = p.closing?.approval_status;
  const MODES4 = [['cash', 'Cash in drawer'], ['upi', 'UPI (app / QR report)'], ['card', 'Card (terminal settlement)'], ['bank', 'Bank transfer / cheque']];
  pane.innerHTML = `<div class="space-y-4">
    ${card({ title: `Daily hospital summary — ${fmtDate(date)}`, subtitle: 'Billing, revenue, collection, receivables and advances are separate figures; none is added to another',
      actions: `<input type="date" class="field field-sm !h-8 !w-auto" data-date value="${date}" max="${todayISO()}" aria-label="Day">`,
      body: `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div><h3 class="panel-title mb-1">Billing</h3>${rows([['Bills raised', H.billing.bills], ['Gross', m2(H.billing.gross)], ['Discounts', m2(H.billing.discount)], ['Net billed', m2(H.billing.net), 'font-semibold'],
          ['Payer / scheme covered', m2(H.billing.covered)], ['Free', m2(H.billing.free)], ['Left as due', m2(H.billing.due)], ['Cancelled', m2(H.billing.cancelled)]])}
          <p class="text-body-sm text-on-surface-variant mt-1">Revenue earned (books): <b>${m2(H.revenue)}</b></p></div>
        <div><h3 class="panel-title mb-1">Collection (money in)</h3>${rows([['Cash', m2(H.collections.cash)], ['UPI', m2(H.collections.upi)], ['Card', m2(H.collections.card)], ['Bank / cheque', m2(H.collections.bank)],
          ['Other', m2(H.collections.other)], ['Received', m2(H.collections.received)], ['Refunded', `− ${m2(H.collections.refunded)}`], ['Net collection', m2(H.collections.net), 'font-semibold']])}</div>
        <div><h3 class="panel-title mb-1">Receivables and advances</h3>${rows([...H.receivables.types.map((t) => [t.label, m2(t.outstanding)]), ['Total receivable', m2(H.receivables.total), 'font-semibold'],
          ['Advances held (liability)', m2(H.advances.closing)]])}</div>
        <div><h3 class="panel-title mb-1">Cash in hand</h3>${rows([['Opening cash', m2(H.cash.opening)], ['+ Cash collections', m2(H.cash.collections)], ['− Cash refunds', m2(H.cash.refunds)],
          ['− Cash expenses', m2(H.cash.expenses)], ['− Deposited to bank', m2(H.cash.deposits)], ['+ Withdrawn from bank', m2(H.cash.withdrawals)], ['± Other', m2(H.cash.other)],
          ['Expected in drawer', m2(p.cash_expected), 'font-semibold']])}
          <p class="text-body-sm text-on-surface-variant mt-1">Expenses booked today ${m2(H.expenses.total)}${H.expenses.cogs ? ` (includes cost of medicines / consumables ${m2(H.expenses.cogs)})` : ""} · paid today: cash ${m2(H.expenses.paid_cash)} · bank ${m2(H.expenses.paid_bank)}</p></div>
      </div>
      ${p.settlements.length ? `<h3 class="panel-title mt-4 mb-1">Approvals and payer settlements (no money)</h3><table class="tbl"><tbody>${p.settlements.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${m.n}</td><td class="num">${m2(m.total)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.open_counters.length ? `<p class="mt-3 text-body-md text-warning">${p.open_counters.length} counter session(s) still open: ${p.open_counters.map((c) => esc(`${c.counter_name} (${c.user_name})`)).join(', ')}</p>` : ''}` })}

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
    ${card({ title: 'Reconciliation and close', subtitle: closed ? `Closed by ${esc(hist?.closed_by_name || '')} · ${fmtDateTime(p.closing.closed_at)}` : 'Count cash, check each channel against its statement, explain any difference, then lock the day',
      body: closed ? `
        <table class="tbl"><thead><tr><th>Channel</th><th class="num">Expected</th><th class="num">Declared</th><th class="num">Difference</th></tr></thead><tbody>
          ${MODES4.map(([k, l]) => { const e = dec.expected?.[k] ?? (k === 'cash' ? p.closing.cash_expected : null), d = dec.declared?.[k] ?? (k === 'cash' ? p.closing.cash_counted : null), v = dec.variances?.[k];
            return `<tr><td>${l}</td><td class="num">${e != null ? m2(e) : '—'}</td><td class="num">${d != null ? m2(d) : 'not checked'}</td><td class="num ${v ? 'text-danger font-semibold' : ''}">${v ? m2(v) : '—'}</td></tr>`; }).join('')}</tbody></table>
        ${p.closing.notes ? `<p class="mt-2 text-body-md"><b>Remark:</b> ${esc(p.closing.notes)}</p>` : ''}
        <p class="mt-3">${pill('verified', 'Day closed')} ${approval === 'pending' ? pill('pending', 'Variance awaiting approval') : approval === 'approved' ? pill('approved', `Variance approved by ${hist?.approved_by_name || ''}`) : ''}</p>
        <div class="flex flex-wrap gap-2 mt-3">
          ${approval === 'pending' && can('finance.close') ? '<button class="btn-primary" data-approve>Approve variance</button>' : ''}
          ${can('books.reopen') ? '<button class="btn-secondary" data-reopen>Reopen day</button>' : ''}</div>`
        : can('finance.close') ? `
        <table class="tbl"><thead><tr><th>Channel</th><th class="num">Expected</th><th class="num">Counted / statement</th></tr></thead><tbody>
          ${MODES4.map(([k, l]) => `<tr><td>${l}</td><td class="num">${m2(k === 'cash' ? p.cash_expected : H.expected[k])}</td>
            <td class="num"><input class="field field-sm text-right !w-36 ml-auto" type="number" step="0.01" data-dec="${k}" value="${k === 'cash' ? p.cash_expected : ''}" placeholder="${k === 'cash' ? '' : 'leave blank if not checked'}" aria-label="${l} declared"></td></tr>`).join('')}</tbody></table>
        <div class="mt-3"><label class="field-label">Remark (required when anything differs)</label><input class="field" data-notes></div>
        <p class="text-body-sm text-on-surface-variant mt-2">A cash difference is posted to Cash over / short. Any difference sends the close for approval by a second person.</p>
        <button class="btn-primary mt-3" data-close-day>Close day</button>` : '<p class="text-on-surface-variant">You can view the day; closing needs the day-closing permission.</p>' })}
    ${card({ title: 'Changes after close', subtitle: 'Edits made by an administrator to this day after it was closed', pad: false,
      body: H.post_close_edits.length ? `<table class="tbl"><thead><tr><th>When</th><th>Change</th><th>By</th><th>Reason</th></tr></thead><tbody>${H.post_close_edits.map((e) => `<tr>
        <td class="text-body-sm whitespace-nowrap">${fmtDateTime(e.at)}</td><td>${esc(e.action)} <span class="text-on-surface-variant">#${e.entity_id}</span></td><td>${esc(e.user_name || '')}</td><td class="text-body-sm">${esc(e.reason || '')}</td></tr>`).join('')}</tbody></table>`
        : '<p class="p-4 text-on-surface-variant text-body-md">None.</p>' })}
    </div>
    ${card({ title: 'Closed days', pad: false, body: `<div class="overflow-auto max-h-[50vh]"><table class="tbl"><thead><tr><th>Date</th><th>Status</th><th class="num">Receipts</th><th class="num">Cash variance</th><th>Approval</th><th>Closed by</th></tr></thead><tbody>
      ${history.map((h) => `<tr><td>${fmtDate(h.close_date)}</td><td>${h.status === 'closed' ? pill('verified', 'Closed') : pill('amended', 'Reopened')}</td><td class="num">${m2(h.receipts)}</td>
        <td class="num">${h.variance ? m2(h.variance) : '—'}</td><td>${h.approval_status === 'pending' ? pill('pending', 'Pending') : h.approval_status === 'approved' ? pill('approved', `Approved · ${esc(h.approved_by_name || '')}`) : '—'}</td>
        <td class="text-body-sm">${esc(h.closed_by_name || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center py-6 text-on-surface-variant">No day has been closed yet</td></tr>'}</tbody></table></div>` })}
  </div>`;
  pane.querySelector('[data-date]').onchange = (e) => { f.closeDate = e.target.value; dayClose(pane, f); };
  pane.querySelector('[data-close-day]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const v = (k) => pane.querySelector(`[data-dec="${k}"]`).value;
    busy(btn, true);
    try {
      await api.post('/accounts/day-close', { date, cash_counted: v('cash'), declared: { upi: v('upi'), card: v('card'), bank: v('bank') }, notes: pane.querySelector('[data-notes]').value.trim() });
      toast('Day closed', 'success'); dayClose(pane, f);
    } catch (err) { apiError(err, 'Day not closed'); busy(btn, false); }
  });
  pane.querySelector('[data-approve]')?.addEventListener('click', async () => {
    const c = await confirmDialog({ title: 'Approve day-close variance', message: 'Confirm you have reviewed the difference and the remark.', confirmLabel: 'Approve' });
    if (!c) return;
    try { await api.post(`/accounts/day-close/${date}/approve`, {}); toast('Variance approved', 'success'); dayClose(pane, f); } catch (err) { apiError(err); }
  });
  pane.querySelector('[data-reopen]')?.addEventListener('click', async () => {
    const c = await confirmDialog({ title: 'Reopen day', message: 'Bills, receipts and manual journals of this day can be changed again.', requireReason: true });
    if (!c) return;
    try { await api.post(`/accounts/day-close/${date}/reopen`, { reason: c.reason }); toast('Day reopened', 'success'); dayClose(pane, f); } catch (err) { apiError(err); }
  });
}

/* ---------------------------------------------------------- reconciliation */

async function reconcile(pane, f) {
  const d = await api.get(`/accounts/reconciliation${qs({ preset: f.preset })}`);
  pane.innerHTML = card({
    title: 'Payment-mode reconciliation', subtitle: `${fmtDate(d.from)} – ${fmtDate(d.to)} · receipts against what the books received, and what is still waiting for the bank`, pad: false,
    actions: can('finance.write') ? '<button class="btn-secondary btn-sm" data-contra>Record bank credit</button>' : '',
    body: `<table class="tbl"><thead><tr><th>Mode</th><th>Books account</th><th class="num">Collected</th><th class="num">Posted</th><th class="num">Difference</th><th class="num">Moved to bank</th><th class="num">Awaiting bank</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="text-body-sm">${esc(r.account)}</td><td class="num">${money(r.collected, 2)}</td><td class="num">${money(r.posted, 2)}</td>
        <td class="num ${Math.abs(r.difference) > 0.005 ? 'text-danger font-semibold' : ''}">${Math.abs(r.difference) > 0.005 ? money(r.difference, 2) : '<span class="pill-success">Matched</span>'}</td>
        <td class="num">${amt(r.settled)}</td><td class="num">${amt(r.pending)}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center py-8 text-on-surface-variant">No collections in this period</td></tr>'}</tbody></table>`,
  });
}

/* ------------------------------------------------------------ chart of accounts */

async function chartOfAccounts(pane, f, reload) {
  const rows = await api.get(`/accounts/chart${qs({ preset: 'year' })}`);
  pane.innerHTML = card({
    title: 'Chart of accounts', subtitle: 'Balances for this financial year. System accounts are used by automatic postings.', pad: false,
    actions: can('finance.write') ? '<button class="btn-secondary btn-sm" data-add-acc>Add account</button>' : '',
    body: `<div class="overflow-auto max-h-[66vh]"><table class="tbl"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Closing</th><th></th></tr></thead><tbody>
      ${rows.map((a) => `<tr class="${a.is_group ? 'bg-surface-container-low font-semibold' : ''}"><td class="font-data-mono">${esc(a.code)}</td>
        <td class="${a.parent_code && !a.is_group ? 'pl-8' : ''}">${esc(a.name)} ${a.system_key ? '<span class="pill-neutral">system</span>' : ''} ${a.active ? '' : '<span class="pill-neutral">inactive</span>'}</td>
        <td class="text-body-sm">${esc(a.type)}</td><td class="num">${a.is_group ? '' : amt(a.debit)}</td><td class="num">${a.is_group ? '' : amt(a.credit)}</td>
        <td class="num">${a.is_group ? '' : amt(a.closing)}</td><td class="text-right">${a.is_group ? '' : `<button class="btn-ghost btn-sm" data-ledger="${a.id}">Ledger</button>`}</td></tr>`).join('')}</tbody></table></div>`,
  });
  pane.querySelector('[data-add-acc]')?.addEventListener('click', () => {
    const groups = rows.filter((a) => a.is_group);
    modal({
      title: 'Add account', size: 'sm',
      body: `<label class="field-label">Under group</label><select class="field" data-parent>${groups.map((g) => `<option value="${g.code}">${esc(g.code)} · ${esc(g.name)}</option>`).join('')}</select>
        <label class="field-label mt-3">Code</label><input class="field" data-code placeholder="e.g. 6915">
        <label class="field-label mt-3">Name</label><input class="field" data-name>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Add</button>',
      onMount(el, close) {
        el.querySelector('[data-save]').onclick = async () => {
          try { await api.post('/accounts/chart', { parent_code: el.querySelector('[data-parent]').value, code: el.querySelector('[data-code]').value.trim(), name: el.querySelector('[data-name]').value.trim() });
            close(); toast('Account added', 'success'); chartOfAccounts(pane, f, reload); } catch (err) { apiError(err); }
        };
      },
    });
  });
}

export { uid, navigate, fmtDateTime };
