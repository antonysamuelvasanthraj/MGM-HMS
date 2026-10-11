/**
 * Package usage — what a patient's package has covered so far, what is extra, and what they owe.
 * Shared by the admission record, the Packages page and anywhere a desk needs the live position.
 */
import { api, can, esc, modal, toast, apiError, busy, money, pill, confirmDialog } from './views/_kit.js';

/** A compact block for an admission / visit: package, covered, extras, owed, with actions. */
export function packageBlock(u) {
  if (!u) return '';
  return `<div class="rounded-lg border border-outline-variant p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div><span class="font-label-lg text-label-lg">${esc(u.package.name)}</span> ${pill('verified', 'Package')}
        <div class="text-body-sm text-on-surface-variant">${u.rules.all_inclusive ? 'All-inclusive' : `Covers ${esc(u.rules.categories.join(', '))}${u.rules.days !== null ? ` · ${u.rules.days} day(s)` : ''}${u.rules.pharmacy_limit !== null ? ` · medicines up to ${money(u.rules.pharmacy_limit)}` : ''}`}</div></div>
      <div class="flex gap-2"><button class="btn-secondary btn-xs" data-pkg-view="${u.assignment.id}">Usage</button></div></div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-body-md">
      <div>Price<div class="font-semibold">${money(u.price)}</div></div>
      <div>Charges covered<div class="font-semibold text-success">${money(u.covered)}</div></div>
      <div>Extras / exclusions<div class="font-semibold ${u.excess + u.excluded > 0 ? 'text-warning' : ''}">${money(u.excess + u.excluded)}</div></div>
      <div>Patient owes in all<div class="font-semibold">${money(u.patient_owes)}</div></div></div></div>`;
}

/** Full usage: every charge with how the package treats it; reconcile or remove from here. */
export async function openPackageUsage(query, after = () => {}) {
  let u;
  try { u = await api.get(`/package-usage?${new URLSearchParams(query)}`); } catch (e) { apiError(e); return; }
  if (!u) { toast('No package on this visit / stay', 'info'); return; }
  const a = u.assignment;
  modal({
    title: `${u.package.name}`, subtitle: `${esc(a.assignment_no)} · ${money(u.price)} · ${a.status}`, size: 'xl',
    body: `${packageBlock(u)}
      ${u.allowances.length ? `<div class="mt-3"><div class="field-label">Listed services</div><div class="flex flex-wrap gap-2">${u.allowances.map((x) => `<span class="${x.used > x.allowed ? 'pill-warning' : 'pill-neutral'}">${esc(x.name)} ${x.used}/${x.allowed}</span>`).join('')}</div></div>` : ''}
      ${u.pharmacy.limit !== null ? `<p class="text-body-md mt-2">Medicines and consumables: ${money(u.pharmacy.used)} of ${money(u.pharmacy.limit)} used.</p>` : ''}
      <div class="mt-3 overflow-auto max-h-[45vh]"><table class="tbl"><thead><tr><th>Bill</th><th>Charge</th><th class="text-right">Amount</th><th class="text-right">Covered</th><th class="text-right">Extra</th><th>Rule</th></tr></thead>
      <tbody>${u.lines.map((l) => `<tr><td class="font-data-mono text-body-sm">${esc(l.bill_no)}</td><td class="text-body-md">${esc(l.description)}</td>
        <td class="num">${money(l.amount)}</td><td class="num text-success">${l.covered ? money(l.covered) : '—'}</td>
        <td class="num ${l.excess || l.excluded ? 'text-warning font-semibold' : ''}">${l.excess || l.excluded ? money(l.excess + l.excluded) : '—'}</td>
        <td class="text-body-sm text-on-surface-variant">${esc(l.rule)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center py-6 text-on-surface-variant">No charges yet.</td></tr>'}</tbody></table></div>
      <p class="text-body-sm text-on-surface-variant mt-2">Covered charges stay on the bill and are offset by a package adjustment (posted ${money(u.adjustment_posted)} so far). ${a.admission_id ? 'The running IP bill is reconciled at discharge; reconcile now to see the final position.' : 'Covered work is adjusted as soon as it is billed.'}</p>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      ${a.status === 'active' && can('payment.authorize') ? '<button class="btn-secondary" data-pkg-cancel>Remove package</button>' : ''}
      ${a.status === 'active' && (can('payment.authorize') || can('ipd.manage')) ? '<button class="btn-primary" data-pkg-reconcile>Reconcile now</button>' : ''}`,
    onMount(root, close) {
      root.querySelector('[data-pkg-reconcile]')?.addEventListener('click', async (ev) => {
        busy(ev.currentTarget, true);
        try { const r = await api.post(`/package-assignments/${a.id}/reconcile`, {}); toast(`Package reconciled — ${money(r.adjustment_posted)} adjusted, patient owes ${money(r.patient_owes)} in all`, 'success'); close(); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      });
      root.querySelector('[data-pkg-cancel]')?.addEventListener('click', async () => {
        const r = await confirmDialog({ title: 'Remove this package?', message: 'Covered charges become chargeable again and the package charge is waived. A paid package must be refunded first.', confirmLabel: 'Remove package', tone: 'danger', requireReason: true });
        if (!r) return;
        try { await api.post(`/package-assignments/${a.id}/cancel`, { reason: r.reason }); toast('Package removed', 'success'); close(); after(); } catch (e) { apiError(e); }
      });
    },
  });
}
