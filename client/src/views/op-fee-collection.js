/**
 * OP Fee Collection desk.
 *
 * The brief's key point: this is NOT a second payments database. It is a
 * reception/cashier projection of the same collection engine — outstanding
 * bills on one side, today's takings reconciled by mode and counter on the other.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, filterBar, wireFilters, live, mountPage,
  counterOptions, apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtTime, todayISO, ago, kpi,
  setting, downloadCSV, donut,
 modeLabel,
} from './_kit.js';
import { openCollect, printReceipt } from './op-registration.js';

let f = { date: todayISO(), q: '', counter_id: '' };

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const d = await api.get(`/collection/op${qs(f)}`);
    paint(root, d);
  }

  bind(root, 'click', '[data-act="collect"]', (e, b) => {
    openCollect(null, load, { billId: +b.closest('tr').dataset.id });
  });
  bind(root, 'click', '[data-act="visit"]', (e, b) => {
    const enc = b.dataset.enc;
    if (enc) navigate(`/visit/${enc}`);
  });
  bind(root, 'click', '[data-receipt]', async (e, b) => {
    const rc = await api.get(`/payments/${b.dataset.receipt}/receipt`);
    printReceipt(rc);
  });
  bind(root, 'click', '[data-export]', async () => {
    const d = await api.get(`/collection/op${qs(f)}`);
    downloadCSV(`op-outstanding-${f.date}.csv`, d.rows.map((r) => ({
      bill: r.bill_no, uhid: r.uhid, patient: r.patient_name, mobile: r.mobile,
      token: r.token_no, doctor: r.doctor_name, items: r.item_summary,
      total: r.total, paid: r.paid, balance: r.balance, status: r.status,
    })));
  });

  return live({
    topics: ['billing', 'queue', 'opd'],
    events: ['payment.received', 'bill.created', 'bill.updated', 'encounter.created', 'encounter.stage', 'payment.cancelled'],
    load,
  });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Reception / cashier view', 'point_of_sale')}
      <span class="font-data-mono text-label-sm text-on-surface-variant">Desk ${esc(state.user.counter?.name || 'unassigned')}</span>
      ${liveChip()}`,
    title: 'OP Fee Collection',
    subtitle: 'Outstanding consultation and service bills for the day. Collecting here posts to the same receipts ledger as every other counter.',
    actions: `<a href="/op-registration" class="btn-secondary">
        <span class="material-symbols-outlined text-[18px]">how_to_reg</span> Registration</a>
      <button class="btn-secondary" data-export>
        <span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <a href="/counter-reconciliation" class="btn-primary">
        <span class="material-symbols-outlined text-[18px]">balance</span> Close my counter</a>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Patient, UHID, mobile, token or bill number' },
        { type: 'date', key: 'date', label: 'Bill date', value: f.date, width: 'w-[150px]' },
        { type: 'select', key: 'counter_id', label: 'Counter', options: counterOptions(), value: f.counter_id },
      ], { right: `<span class="text-body-sm text-on-surface-variant max-w-xs">The counter filter narrows physical desk
          collections; it does not change the revenue department of a charge.</span>` })}
      <div class="grid grid-cols-1 2xl:grid-cols-[1fr_340px] gap-5 items-start">
        ${tableCard({
          title: 'Awaiting collection',
          subtitle: 'Consultation, lab, imaging and package charges that are still open',
          actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '60vh',
          columns: [
            { label: 'Token', width: '66px' }, { label: 'Patient' }, { label: 'Bill' },
            { label: 'Charges' }, { label: 'Doctor' }, { label: 'Status' },
            { label: 'Total', cls: 'text-right' }, { label: 'Balance', cls: 'text-right' },
            { label: '', width: '120px' },
          ],
        })}
        <div class="space-y-4" data-side></div>
      </div>`,
  });
}

function paint(root, d) {
  const s = d.summary;
  $('[data-kpis]', root).innerHTML = [
    { label: "Today's OP collections", value: money(s.collected_today), icon: 'payments', tone: 'success', sub: `${s.receipts_today} receipts issued` },
    { label: 'Pending collection', value: money(s.pending_amount), icon: 'schedule', tone: s.pending_amount ? 'warning' : 'success', sub: `${s.pending_count} bill(s) open` },
    { label: 'Cash in drawer', value: money(s.cash), icon: 'account_balance_wallet', sub: `Digital ${money(s.digital)}` },
    { label: 'Approved free visits', value: s.free_visits, icon: 'volunteer_activism', tone: 'info', sub: 'Reason recorded on each visit' },
  ].map(kpi).join('');

  renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'Nothing is awaiting collection — every bill for this filter is settled.' });
  $('[data-count]', root).textContent = `${d.rows.length} open · ${money(s.pending_amount)}`;

  const modeColours = { cash: '#166534', upi: '#1E40AF', card: '#881D2C', cheque: '#92400E', netbanking: '#8A6D1F', insurance: '#475569' };
  $('[data-side]', root).innerHTML = `
    ${card({
      title: 'Collected today by mode',
      body: d.byMode.length ? `
        <div class="flex items-center gap-4">
          ${donut(d.byMode.map((m) => ({ label: m.mode, value: m.total, color: modeColours[m.mode] || '#A9B4C4' })))}
          <ul class="flex-1 space-y-1.5">${d.byMode.map((m) => `
            <li class="flex items-center gap-2 text-body-md">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${modeColours[m.mode] || '#A9B4C4'}"></span>
              <span class="flex-1">${esc(modeLabel(m.mode))}</span>
              <span class="font-data-mono">${money(m.total)}</span>
              <span class="font-data-mono text-on-surface-variant text-label-sm">${m.n}</span>
            </li>`).join('')}</ul>
        </div>` : `<p class="text-body-md text-on-surface-variant">No receipts yet today.</p>`,
    })}
    ${card({
      title: 'By counter',
      body: d.byCounter.length ? `<ul class="space-y-2">${d.byCounter.map((c) => `
        <li>
          <div class="flex items-center justify-between text-body-md">
            <span>${esc(c.counter)}</span>
            <span class="font-data-mono">${money(c.total)}</span>
          </div>
          <div class="h-1.5 rounded-full bg-surface-container mt-1 overflow-hidden">
            <div class="h-full bg-primary" style="width:${Math.round((c.total / Math.max(1, Math.max(...d.byCounter.map((x) => x.total)))) * 100)}%"></div>
          </div>
        </li>`).join('')}</ul>` : `<p class="text-body-md text-on-surface-variant">No counter activity yet.</p>`,
    })}
    ${card({
      title: 'How OP fees work here',
      body: `<ol class="space-y-2 text-body-md text-on-surface-variant list-decimal pl-4">
        <li>A doctor's tariff is set in <a href="/tariff" class="text-primary underline underline-offset-2">Doctor Fees & Tariffs</a>.</li>
        <li>Registration raises one consultation bill for the visit.</li>
        <li>This desk receives money against that bill — it never creates a second consultation charge.</li>
        <li>A lab or imaging order on the same visit is a separate service charge, not another OP fee.</li>
        <li>An approved free visit cancels the bill and records who approved it and why.</li>
      </ol>`,
    })}`;
}

function rowHTML(r) {
  return `
    <td>${r.token_no ? `<span class="inline-grid place-items-center w-9 h-9 rounded-lg bg-primary-fixed text-primary font-data-mono font-bold">${r.token_no}</span>`
      : '<span class="text-on-surface-variant">—</span>'}</td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(r.patient_name)}
        ${r.vip ? '<span class="pill-brand">VIP</span>' : ''}
        ${r.payer_type !== 'self' ? `<span class="pill-info">${esc(r.payer_type)}</span>` : ''}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${esc(r.mobile || '')}</div></td>
    <td><div class="font-data-mono text-body-sm">${esc(r.bill_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.bill_type)} · ${fmtTime(r.created_at)}</div></td>
    <td class="max-w-[260px]"><div class="text-body-md truncate" title="${esc(r.item_summary || '')}">${esc(r.item_summary || '—')}</div></td>
    <td><div class="text-body-md">${esc(r.doctor_name || '—')}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(r.dept_name || '')}</div></td>
    <td>${pill(r.status)}${r.stage ? ` ${pill(r.stage)}` : ''}</td>
    <td class="num">${money(r.total)}</td>
    <td class="num text-danger font-semibold">${money(r.balance)}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-primary btn-xs" data-act="collect">Collect</button>
      ${r.encounter_id ? `<button class="btn-ghost btn-xs" data-act="visit" data-enc="${r.encounter_id}" title="Open visit">
        <span class="material-symbols-outlined text-[15px]">open_in_new</span></button>` : ''}
    </td>`;
}
