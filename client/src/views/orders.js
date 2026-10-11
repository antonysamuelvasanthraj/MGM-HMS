/** Clinical Orders & Requisitions — every requisition across the hospital. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, downloadCSV,
  $, $$, esc, bind, toast, confirmDialog, renderRows, pill, priorityPill,
  money, fmtDateTime, fmtTime, mins, kpi, todayISO, isPayer, payerPill,
} from './_kit.js';
import { openOrderDialog } from './consultation.js';

let f = { category: '', status: 'open', priority: '', q: '', date: '' };
let cache = [];

export async function mount(ctx) {
  if (ctx.query.encounter) {
    const e = await api.get(`/encounters/${ctx.query.encounter}`);
    openOrderDialog(e, () => load());
  }
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const rows = await api.get(`/orders${qs({ ...f, limit: 400 })}`);
    cache = rows;
    const open = rows.filter((r) => !['verified', 'dispensed', 'cancelled'].includes(r.status));
    $('[data-kpis]', root).innerHTML = [
      { label: 'Open requisitions', value: open.length, icon: 'assignment', sub: `${rows.length} shown` },
      { label: 'STAT / urgent', value: rows.filter((r) => r.priority !== 'routine').length, icon: 'priority_high', tone: 'danger', sub: 'Escalated to the department' },
      { label: 'Held for payment', value: rows.filter((r) => r.status === 'awaiting_payment').length, icon: 'payments', tone: 'warning', sub: 'Desk needs to collect' },
      { label: 'Critical results', value: rows.reduce((s, r) => s + (r.critical_count || 0), 0), icon: 'e911_emergency', tone: 'danger', sub: 'Across the shown orders' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No orders match this filter.' });
    $('[data-count]', root).textContent = `${rows.length} order(s)`;
  }

  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = b.closest('tr').dataset.id;
    if (b.dataset.act === 'open') {
      const cat = b.dataset.cat;
      navigate(cat === 'imaging' ? '/imaging' : cat === 'pharmacy' ? '/pharmacy' : '/laboratory');
    }
    if (b.dataset.act === 'cancel') {
      const r = await confirmDialog({ title: 'Cancel this order?', message: 'The department stops work on it. Any charge already raised stays on the bill for review.', confirmLabel: 'Cancel order', tone: 'danger', requireReason: true });
      if (!r) return;
      const cancelled = await api.post(`/orders/${id}/cancel`, { reason: r.reason });
      toast(cancelled.billing_review?.length ? `Order cancelled. Billing must review ${cancelled.billing_review.map(b=>b.bill_no).join(', ')} for cancellation, credit or refund.` : 'Order cancelled', cancelled.billing_review?.length ? 'warning' : 'success'); load();
    }
    if (b.dataset.act === 'visit') navigate(`/visit/${b.dataset.enc}`);
  });
  bind(root, 'click', '[data-export]', () => downloadCSV(`orders-${todayISO()}.csv`, cache.map((r) => ({
    order: r.order_no, category: r.category, label: r.label, uhid: r.uhid, patient: r.patient_name,
    priority: r.priority, status: r.status, billed: r.billed, bill_status: r.bill_status,
    ordered_by: r.ordered_by_name, ordered_at: r.ordered_at, completed_at: r.completed_at,
  }))));

  return live({ topics: ['clinical', 'lab', 'imaging', 'pharmacy'],
    events: ['orders.created', 'order.updated', 'lab.verified', 'imaging.signed', 'payment.received'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Requisitions', 'assignment')} ${liveChip()}`,
    title: 'Clinical Orders & Requisitions',
    subtitle: 'Every lab, imaging, procedure and pharmacy requisition with its work state and billing state side by side.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Order number, test, patient or UHID' },
        { type: 'select', key: 'category', label: 'Category', value: f.category, options: [
          { value: '', label: 'All categories' }, { value: 'lab', label: 'Laboratory' }, { value: 'imaging', label: 'Imaging' },
          { value: 'procedure', label: 'Procedure' }, { value: 'pharmacy', label: 'Pharmacy' }] },
        { type: 'select', key: 'status', label: 'State', value: f.status, options: [
          { value: 'open', label: 'Open only' }, { value: 'all', label: 'Everything' },
          { value: 'awaiting_payment', label: 'Awaiting payment' }, { value: 'ordered', label: 'Ordered' },
          { value: 'collected', label: 'Collected' }, { value: 'in_progress', label: 'In progress' },
          { value: 'reported', label: 'Reported' }, { value: 'verified', label: 'Verified' },
          { value: 'cancelled', label: 'Cancelled' }] },
        { type: 'select', key: 'priority', label: 'Priority', value: f.priority, options: [
          { value: '', label: 'Any' }, { value: 'stat', label: 'STAT' }, { value: 'urgent', label: 'Urgent' }, { value: 'routine', label: 'Routine' }] },
        { type: 'date', key: 'date', label: 'Ordered on', value: f.date, width: 'w-[150px]' },
      ])}
      ${tableCard({
        title: 'Orders', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'Order', width: '150px' }, { label: 'Patient' }, { label: 'Requisition' },
          { label: 'Priority' }, { label: 'Work state' }, { label: 'Billing' },
          { label: 'Ordered by' }, { label: '', width: '140px' }],
      })}`,
  });
}

function rowHTML(r) {
  return `
    <td><div class="font-data-mono text-body-sm">${esc(r.order_no)}</div>
      <div class="text-label-sm text-on-surface-variant">${fmtTime(r.ordered_at)}</div></td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)}${r.token_no ? ` · Tok ${r.token_no}` : ''}</div></td>
    <td><div class="text-body-md">${esc(r.label)}</div>
      <div class="text-label-sm text-on-surface-variant capitalize">${esc(r.category)}${r.price ? ` · ${money(r.price)}` : ''}</div></td>
    <td>${priorityPill(r.priority)}</td>
    <td>${pill(r.status)}
      ${r.critical_count ? `<span class="pill-danger pill-dot">${r.critical_count} critical</span>` : ''}</td>
    <td>${r.bill_status ? (isPayer(r.bill_payer) && !['paid', 'cancelled'].includes(r.bill_status) ? payerPill(r.bill_payer, r.claim_status) : pill(r.bill_status)) : '<span class="pill-neutral">Not billed</span>'}</td>
    <td><div class="text-body-md">${esc(r.ordered_by_name || '—')}</div>
      ${r.verified_by_name ? `<div class="text-label-sm text-on-surface-variant">verified ${esc(r.verified_by_name)}</div>` : ''}</td>
    <td class="text-right whitespace-nowrap">
      <button class="btn-secondary btn-xs" data-act="open" data-cat="${esc(r.category)}">Department</button>
      ${r.encounter_id ? `<button class="btn-ghost btn-xs" data-act="visit" data-enc="${r.encounter_id}" title="Open visit">
        <span class="material-symbols-outlined text-[15px]">open_in_new</span></button>` : ''}
      ${!['verified', 'cancelled', 'dispensed'].includes(r.status) && can('order.update')
        ? `<button class="btn-ghost btn-xs" data-act="cancel" title="Cancel"><span class="material-symbols-outlined text-[15px]">close</span></button>` : ''}
    </td>`;
}
