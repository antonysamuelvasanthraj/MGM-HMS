/**
 * Approvals — free visits and free treatment requested at the desk. The visit
 * was already saved; the approver clears the balance as free or declines it
 * (the fee then stays payable). Both decisions go to the audit trail.
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, bind, money, pill, ago, toast, confirmDialog, apiError } from './_kit.js';

export async function mount(ctx) {
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Billing', 'approval')} ${liveChip()}`, title: 'Approvals',
    subtitle: 'Free visits and free treatment waiting for a decision. The patient is already registered; approving clears the bill as free, declining leaves the fee payable.',
    body: '<div data-list></div>',
  }));
  let mayApprove = false;

  async function load() {
    const d = await api.get('/approvals');
    mayApprove = d.can_approve;
    root.querySelector('[data-list]').innerHTML = card({
      title: `${d.rows.length} waiting`, subtitle: mayApprove ? '' : 'You can see the requests; an approver decides them.', pad: false,
      body: `<div class="overflow-auto max-h-[70vh]"><table class="tbl"><thead><tr><th>Patient</th><th>Bill</th><th>For</th><th class="num">Amount</th><th>Reason</th><th>Asked by</th><th></th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr>
          <td><div class="font-label-lg">${esc(r.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(r.uhid)}${r.token_no ? ` · token ${r.token_no}` : ''}${r.doctor_name ? ` · ${esc(r.doctor_name)}` : ''}${r.department_name ? ` · ${esc(r.department_name)}` : ''}</div></td>
          <td><span class="font-data-mono text-body-sm">${esc(r.bill_no)}</span><div class="text-body-sm text-on-surface-variant">${esc(r.bill_type)}${r.stage ? ` · ${pill(r.stage)}` : ''}</div></td>
          <td class="text-body-sm max-w-[240px] truncate" title="${esc(r.items || '')}">${esc(r.items || '')}</td>
          <td class="num font-semibold">${money(r.balance, 2)}</td>
          <td class="text-body-md max-w-[240px]">${esc(r.reason || '')}</td>
          <td class="text-body-sm">${esc(r.requested_by_name || '')}<div class="text-on-surface-variant">${ago(r.requested_at)}</div></td>
          <td class="text-right whitespace-nowrap">${mayApprove ? `<button class="btn-ghost btn-sm" data-reject="${r.id}">Decline</button>
            <button class="btn-primary btn-sm" data-approve="${r.id}">Approve free</button>` : '<span class="pill-warning pill-dot">Waiting</span>'}</td></tr>`).join('')
          || '<tr><td colspan="7" class="text-center py-10 text-on-surface-variant">Nothing is waiting for approval.</td></tr>'}</tbody></table></div>`,
    });
  }

  bind(root, 'click', '[data-approve]', async (e, b) => {
    const c = await confirmDialog({ title: 'Approve as free?', message: 'The outstanding amount is cleared as free treatment. It stays visible at full value in reports but is never counted as money collected.', confirmLabel: 'Approve', requireReason: false });
    if (!c) return;
    try { await api.post(`/approvals/${b.dataset.approve}/approve`, {}); toast('Approved — bill cleared as free', 'success'); load(); } catch (err) { apiError(err); }
  });
  bind(root, 'click', '[data-reject]', async (e, b) => {
    const c = await confirmDialog({ title: 'Decline the request?', message: 'The fee stays payable at the desk.', tone: 'danger', confirmLabel: 'Decline', requireReason: true });
    if (!c) return;
    try { await api.post(`/approvals/${b.dataset.reject}/reject`, { reason: c.reason }); toast('Request declined', 'success'); load(); } catch (err) { apiError(err); }
  });
  return live({ topics: ['approvals', 'billing'], events: ['approval.requested', 'approval.decided', 'payment.received'], load });
}

export { can };
