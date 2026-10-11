/**
 * Service payments — the reception queue between the doctor's order and the
 * lab / imaging desk. Reception decides: paid, part-paid, payer, free or due.
 * Nothing reaches the lab until one of those is recorded (emergency excepted).
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, qs, can, esc, bind, pill, priorityPill, money, ago, isPayer, payerPill,
} from './_kit.js';
import { collectBill } from '../collect.js';

const CAT = { self: 'Normal', insurance: 'Insurance', aarogyasri: 'Aarogyasri', corporate: 'Corporate', credit: 'Credit', trust: 'Trust', free: 'Free', due: 'Due' };

export async function mount(ctx) {
  const f = { show: 'waiting', q: '' };
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Reception', 'point_of_sale')} ${liveChip()}`, title: 'Service payments',
    subtitle: 'Lab, imaging and procedure orders waiting for payment or approval. Split across modes, bill to a payer, or approve free / due with a reason.',
    actions: can('billing.create') ? '<a class="btn-primary" href="/bills?new=op">Bill OPD procedure</a>' : '',
    body: `<div class="card p-3 flex flex-wrap items-end gap-2">
        <div class="inline-flex p-0.5 rounded bg-surface-container" role="tablist">${[['waiting', 'Waiting'], ['cleared', 'Cleared today']].map(([v, l]) => `<button data-show="${v}" role="tab" class="px-3 h-8 rounded font-label-md text-label-md">${l}</button>`).join('')}</div>
        <div class="flex-1 min-w-[220px] max-w-md"><input class="field field-sm !h-9" data-q placeholder="Filter by patient, UHID or bill"></div></div>
      <div data-list></div>`,
  }));
  let rows = [];

  const paint = () => {
    root.querySelectorAll('[data-show]').forEach((b) => { const on = b.dataset.show === f.show; b.setAttribute('aria-selected', on);
      b.className = `px-3 h-8 rounded font-label-md text-label-md ${on ? 'bg-white shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`; });
    const q = f.q.toLowerCase();
    const list = rows.filter((r) => !q || [r.patient_name, r.uhid, r.bill_no, r.mobile].some((v) => String(v || '').toLowerCase().includes(q)));
    root.querySelector('[data-list]').innerHTML = card({
      title: `${list.length} ${f.show === 'waiting' ? 'bills waiting' : 'bills cleared today'}`, pad: false,
      body: `<div class="overflow-auto max-h-[68vh]"><table class="tbl"><thead><tr><th>Patient</th><th>Services</th><th>Ordered by</th><th>Category</th><th class="num">Bill</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((r) => `<tr>
          <td><div class="font-label-lg">${esc(r.patient_name)}</div><div class="text-body-sm text-on-surface-variant">${esc(r.uhid)} · ${esc(r.mobile || '')}</div></td>
          <td>${r.services.map((s) => `<div class="flex items-center gap-1.5">${esc(s.label)} <span class="text-body-sm text-on-surface-variant">${esc(s.category)}</span> ${s.priority !== 'routine' ? priorityPill(s.priority) : ''}</div>`).join('')}</td>
          <td class="text-body-sm">${esc(r.doctor_name || '')}<div class="text-on-surface-variant">${ago(r.ordered_at)}</div></td>
          <td>${r.payer_type && r.payer_type !== 'self' ? `<span class="pill-info">${esc(CAT[r.payer_type] || r.payer_type)}</span>` : '<span class="pill-neutral">Normal</span>'}</td>
          <td class="num">${r.bill_no ? `<span class="font-data-mono text-body-sm">${esc(r.bill_no)}</span><div>${money(r.total || 0, 2)}</div>` : '—'}</td>
          <td class="num font-semibold">${money(r.balance || 0, 2)}</td>
          <td>${isPayer(r.bill_payer) && r.bill_status && !['paid', 'cancelled'].includes(r.bill_status) ? payerPill(r.bill_payer, r.claim_status, 'released once the payer case is approved, or authorise now') : r.bill_status ? pill(r.bill_status) : pill('awaiting_payment')} ${r.authorization_status === 'approved' ? pill('approved', 'Due approved') : ''}</td>
          <td class="text-right">${r.bill_id && r.balance > 0.005 ? `<button class="btn-primary btn-sm" data-pay="${r.bill_id}">Collect / approve</button>` : ''}</td></tr>`).join('')
          || `<tr><td colspan="8" class="text-center py-10 text-on-surface-variant">${f.show === 'waiting' ? 'Nothing is waiting — every ordered service is paid or approved.' : 'Nothing cleared yet today.'}</td></tr>`}</tbody></table></div>`,
    });
  };

  async function load() { rows = await api.get(`/service-queue${qs({ show: f.show === 'cleared' ? 'cleared' : '' })}`); paint(); }
  bind(root, 'click', '[data-show]', (e, b) => { f.show = b.dataset.show; load(); });
  bind(root, 'click', '[data-pay]', (e, b) => collectBill(+b.dataset.pay, load));
  root.querySelector('[data-q]').oninput = (e) => { f.q = e.target.value; paint(); };
  return live({ topics: ['billing', 'lab', 'imaging', 'queue'], events: ['orders.created', 'payment.received', 'bill.authorized', 'order.updated'], load });
}
