/**
 * Counter reconciliation — the dedicated view the brief proposes.
 *
 * What the system says a desk took, what the cashier counted, and the variance
 * between them, shift by shift.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, downloadCSV, compactMoney,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, fmtDateTime, fmtTime,
  kpi, todayISO, emptyState,
} from './_kit.js';

let f = { date: todayISO() };
let cache = { rows: [], deskTotals: [] };

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/counters/sessions${qs(f)}`);
    cache = d;
    if(can('finance.view')){
    const audit=await api.get('/accounts/integration-reconciliation'+qs({from:f.date,to:f.date}));
    $('[data-integration]',root).innerHTML=`<p class="text-body-sm mb-3">${audit.mismatches.length} bill mismatch(es) · Books ${audit.integrity.ok?'balanced':'need review'}. Amounts refer to bills raised on the selected date, including later payments.</p><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Bill / patient</th><th>Desk</th><th>Billed</th><th>Receipts</th><th>Refunds</th><th>Payer received</th><th>Patient due</th><th>Payer due</th><th>Status</th></tr></thead><tbody>${audit.rows.map(b=>`<tr><td><a href="/bills?q=${encodeURIComponent(b.bill_no)}">${esc(b.bill_no)}</a><div>${esc(b.patient_name)}</div></td><td>${esc(b.desk)}</td><td>${money(b.total)}</td><td>${money(b.receipts)}</td><td>${money(b.refunds)}</td><td>${money(b.payer_received)}</td><td>${money(b.patient_due)}</td><td>${money(b.payer_pending+b.payer_receivable)}</td><td>${esc(b.financial_status.replaceAll('_',' '))}</td></tr>`).join('')||'<tr><td colspan="9">No bills in this period.</td></tr>'}</tbody></table></div><p class="text-body-sm mt-3">Handovers: ${audit.handovers.length} · Awaiting acceptance: ${audit.handovers.filter(h=>h.status==='submitted').length} · <a href="/day-report">Open cash acceptance inbox</a></p>`;
    }
    const open = d.rows.filter((r) => r.status === 'open');
    const variance = d.rows.reduce((s, r) => s + (r.variance || 0), 0);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Desk collections', value: compactMoney(d.deskTotals.reduce((s, c) => s + c.total, 0)), icon: 'point_of_sale',
        sub: `${d.deskTotals.reduce((s, c) => s + c.receipts, 0)} receipts` },
      { label: 'Cash to account for', value: compactMoney(d.deskTotals.reduce((s, c) => s + c.cash, 0)), icon: 'account_balance_wallet',
        tone: 'warning', sub: 'Physical notes at the desks' },
      { label: 'Shifts still open', value: open.length, icon: 'lock_open', tone: open.length ? 'info' : 'success',
        sub: `${d.rows.length - open.length} closed` },
      { label: 'Net variance', value: money(variance), icon: 'balance',
        tone: Math.abs(variance) > 1 ? 'danger' : 'success', sub: Math.abs(variance) > 1 ? 'Investigate before sign-off' : 'Desks balance' },
    ].map(kpi).join('');

    $('[data-desks]', root).innerHTML = d.deskTotals.length ? `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${d.deskTotals.map((c) => {
          const session = d.rows.find((r) => r.counter_id === c.counter_id && r.status === 'open');
          return `<div class="rounded-lg border border-outline-variant overflow-hidden">
            <div class="px-3 h-10 flex items-center justify-between bg-surface-container-low border-b border-outline-variant">
              <span class="font-title-md text-title-md">${esc(c.counter_name)}</span>
              ${session ? '<span class="pill-info pill-dot">Shift open</span>' : '<span class="pill-neutral">Closed</span>'}</div>
            <div class="p-3 space-y-1.5 text-body-md">
              <div class="flex justify-between"><span class="text-on-surface-variant">Cash</span>
                <span class="font-data-mono">${money(c.cash, 2)}</span></div>
              <div class="flex justify-between"><span class="text-on-surface-variant">Digital</span>
                <span class="font-data-mono">${money(c.digital, 2)}</span></div>
              <div class="flex justify-between pt-1.5 border-t border-outline-variant">
                <span class="font-label-lg">Total · ${c.receipts} receipts</span>
                <span class="font-title-md text-primary">${money(c.total, 2)}</span></div>
              ${session ? `<button class="btn-primary btn-sm w-full mt-2" data-close-shift="${session.id}"
                  data-expected="${(session.system_cash || 0) + (session.opening_cash || 0)}">Close and reconcile</button>`
                : can('finance.counter') ? `<button class="btn-secondary btn-sm w-full mt-2" data-open-shift="${c.counter_id}">Open a shift</button>` : ''}
            </div></div>`;
        }).join('')}</div>`
      : emptyState('point_of_sale', 'No counters configured', '');

    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No shifts recorded for this date.' });
  }

  bind(root, 'click', '[data-close-shift]', (e, b) => closeShift(+b.dataset.closeShift, +b.dataset.expected, load));
  bind(root, 'click', '[data-open-shift]', (e, b) => openShift(+b.dataset.openShift, load));
  bind(root, 'click', '[data-export]', () => downloadCSV(`counter-reconciliation-${f.date}.csv`, cache.rows.map((r) => ({
    counter: r.counter_name, user: r.user_name, opened: r.opened_at, closed: r.closed_at,
    opening_cash: r.opening_cash, system_cash: r.system_cash, system_total: r.system_total,
    counted_cash: r.counted_cash, variance: r.variance, receipts: r.receipts, status: r.status, remarks: r.remarks,
  }))));

  return live({ topics: ['finance', 'billing'], events: ['payment.received', 'counter.opened', 'counter.closed'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Finance', 'balance')} ${liveChip()}`,
    title: 'Counter Reconciliation',
    subtitle: 'What the system recorded against what the cashier counted. A variance over ₹1 marks the shift disputed until it is explained.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <a href="/collections" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">point_of_sale</span> Collections</a>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([{ type: 'date', key: 'date', label: 'Date', value: f.date, width: 'w-[150px]' }])}
      ${can('finance.view')?card({title:'Bills, receipts, refunds and payer reconciliation',body:'<div data-integration></div>'}):''}
      ${card({ title: 'Desks today', body: `<div data-desks></div>` })}
      ${tableCard({
        title: 'Shift register', maxHeight: '50vh',
        columns: [{ label: 'Counter' }, { label: 'Cashier' }, { label: 'Opened' }, { label: 'Closed' },
          { label: 'Opening', cls: 'text-right' }, { label: 'System cash', cls: 'text-right' },
          { label: 'Counted', cls: 'text-right' }, { label: 'Variance', cls: 'text-right' },
          { label: 'Receipts', cls: 'text-right' }, { label: 'Status' }],
      })}`,
  });
}

function rowHTML(r) {
  const v = r.variance ?? null;
  return `
    <td class="font-label-lg text-label-lg">${esc(r.counter_name)}</td>
    <td class="text-body-md">${esc(r.user_name)}</td>
    <td class="text-body-sm">${fmtTime(r.opened_at)}</td>
    <td class="text-body-sm">${r.closed_at ? fmtTime(r.closed_at) : '—'}</td>
    <td class="num">${money(r.opening_cash, 2)}</td>
    <td class="num">${money(r.system_cash, 2)}</td>
    <td class="num">${r.counted_cash !== null && r.counted_cash !== undefined ? money(r.counted_cash, 2) : '—'}</td>
    <td class="num ${v === null ? '' : Math.abs(v) > 1 ? 'text-danger font-bold' : 'text-success'}">${v === null ? '—' : money(v, 2)}</td>
    <td class="num">${r.receipts}</td>
    <td>${pill(r.status)}</td>`;
}

function openShift(counterId, after) {
  modal({
    title: 'Open a counter shift', size: 'sm',
    body: `<label class="field-label">Opening cash float</label>
      <input class="field" type="number" step="0.01" data-c value="2000">
      <p class="text-body-sm text-on-surface-variant mt-2">Every receipt you take from now on is attributed to this shift.</p>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Open shift</button>`,
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post('/counters/sessions', { counter_id: counterId, opening_cash: +root.querySelector('[data-c]').value });
          close(); toast('Shift opened', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function closeShift(sessionId, expected, after) {
  modal({
    title: 'Close and reconcile', subtitle: `System expects ${money(expected, 2)} in cash`, size: 'sm',
    body: `<div class="space-y-3">
      <div><label class="field-label">Cash counted</label>
        <input class="field !h-12 !text-[20px] font-data-mono" type="number" step="0.01" data-c value="${expected}"></div>
      <div class="p-3 rounded-lg bg-surface-container-low">
        <div class="flex justify-between text-body-md"><span class="text-on-surface-variant">Expected</span>
          <span class="font-data-mono">${money(expected, 2)}</span></div>
        <div class="flex justify-between text-body-md mt-1"><span class="text-on-surface-variant">Counted</span>
          <span class="font-data-mono" data-counted>${money(expected, 2)}</span></div>
        <div class="flex justify-between pt-1.5 mt-1.5 border-t border-outline-variant">
          <span class="font-label-lg">Variance</span>
          <span class="font-title-md" data-var>₹0.00</span></div>
      </div>
      <div><label class="field-label">Remarks</label><textarea class="field" rows="2" data-r
        placeholder="Explain any difference — this is kept with the shift record"></textarea></div>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Close shift</button>`,
    onMount(root, close) {
      const inp = root.querySelector('[data-c]');
      const paint = () => {
        const v = (+inp.value || 0) - expected;
        root.querySelector('[data-counted]').textContent = money(+inp.value || 0, 2);
        const el = root.querySelector('[data-var]');
        el.textContent = money(v, 2);
        el.className = `font-title-md ${Math.abs(v) > 1 ? (v < 0 ? 'text-danger' : 'text-warning') : 'text-success'}`;
      };
      inp.addEventListener('input', paint); paint();
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const r = await api.post(`/counters/sessions/${sessionId}/close`, {
            counted_cash: +inp.value, remarks: root.querySelector('[data-r]').value,
          });
          close();
          toast(Math.abs(r.variance) > 1 ? `Shift closed with a variance of ${money(r.variance, 2)}` : 'Shift closed and balanced',
            Math.abs(r.variance) > 1 ? 'warning' : 'success');
          after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
