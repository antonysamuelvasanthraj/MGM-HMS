/**
 * Stock transfers — Central store to OP, IP, ICU, ER, OT and ward stores.
 * requested → approved → issued (FEFO from source batches) → received, with
 * partial receipt and a reasoned close for anything short. Every step records
 * who did it and when.
 */
import {
  page, eyebrow, liveChip, card, live, mountPage, api, qs, can, esc, bind, pill, modal, drawer, toast, busy, apiError,
  confirmDialog, fmtDate, fmtDateTime, kpi, state,
} from './_kit.js';

const LOCS = ['Central', 'OP', 'IP', 'ICU', 'ER', 'OT', 'Ward'];
const STATUS = [['', 'All'], ['requested', 'Requested'], ['approved', 'Approved'], ['issued', 'Issued'], ['partially_received', 'Partly received'], ['received', 'Received'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']];
const statusPill = (s) => ({ requested: pill('pending', 'Requested'), approved: pill('approved'), issued: pill('in_progress', 'Issued — in transit'),
  partially_received: pill('partial', 'Partly received'), received: pill('received'), rejected: pill('rejected'), cancelled: pill('cancelled') })[s] || pill(s);

export async function mount(ctx) {
  const f = { status: '', location: '' };
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Pharmacy', 'swap_horiz')} ${liveChip()}`, title: 'Stock transfers',
    subtitle: 'All purchases land in Central. Sub-stores are stocked only by transfer, so every unit can be traced batch by batch.',
    actions: can('inventory.write') ? '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span>New transfer</button>' : '',
    body: `<div data-loc class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3"></div>
      <div class="card p-3 flex flex-wrap items-end gap-2">
        <div><label class="field-label">Status</label><select class="field field-sm !h-9" data-k="status">${STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div><label class="field-label">Location</label><select class="field field-sm !h-9" data-k="location"><option value="">All</option>${LOCS.map((l) => `<option>${l}</option>`).join('')}</select></div>
      </div><div data-list></div>`,
  }));

  async function load() {
    const [rows, locs] = await Promise.all([api.get(`/pharmacy/transfers${qs(f)}`), api.get('/pharmacy/locations')]);
    root.querySelector('[data-loc]').innerHTML = locs.stock.map((l) => kpi({ label: l.location, value: Number(l.units || 0).toLocaleString('en-IN'),
      sub: `${l.batches} batches · ₹${Number(l.value || 0).toLocaleString('en-IN')}`, icon: l.location === 'Central' ? 'warehouse' : 'storefront', tone: l.location === 'Central' ? 'info' : 'neutral' })).join('');
    root.querySelector('[data-list]').innerHTML = card({
      title: `${rows.length} transfers`, pad: false,
      body: `<div class="overflow-auto max-h-[62vh]"><table class="tbl"><thead><tr><th>Transfer</th><th>Route</th><th class="num">Lines</th><th class="num">Requested</th><th class="num">Issued</th><th class="num">Received</th><th>Status</th><th>Requested</th></tr></thead><tbody>
        ${rows.map((t) => `<tr class="cursor-pointer hover:bg-surface-container-low" data-open="${t.id}" title="Open to approve, issue or receive"><td class="font-data-mono"><span class="text-primary underline underline-offset-2">${esc(t.transfer_no)}</span></td><td>${esc(t.source)} → ${esc(t.destination)}</td>
          <td class="num">${t.line_count}</td><td class="num">${t.qty_requested}</td><td class="num">${t.qty_issued}</td><td class="num">${t.qty_received}</td>
          <td>${statusPill(t.status)}${t.emergency && !t.ratified_by ? ' <span class="pill-danger pill-dot">Emergency</span>' : ''}</td><td class="text-body-sm">${fmtDate(t.requested_at)} · ${esc(t.requested_by_name || '')}</td></tr>`).join('')
          || '<tr><td colspan="8" class="text-center py-10 text-on-surface-variant">No transfers yet</td></tr>'}</tbody></table></div>`,
    });
  }

  root.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) { f[k] = e.target.value; load(); } });
  bind(root, 'click', '[data-new]', () => newTransfer(load));
  bind(root, 'click', '[data-open]', (e, b) => openTransfer(+b.dataset.open, load));
  if (ctx.query.id) openTransfer(+ctx.query.id, load);
  return live({ topics: ['inventory', 'pharmacy'], events: ['transfer.updated', 'stock.changed', 'purchase.received'], load });
}

async function newTransfer(after) {
  const meds = (await api.get('/pharmacy/medicines?limit=1000')).rows.filter((m) => m.active !== 0);
  const line = () => `<div data-l class="grid gap-2 items-center grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] md:grid-cols-[minmax(0,1fr)_110px_120px_32px]">
    <select class="field field-sm !h-9 col-span-3 md:col-span-1 min-w-0" data-med>${meds.map((m) => `<option value="${m.id}" data-central="${m.central_stock}">${esc(m.name)}</option>`).join('')}</select>
    <input class="field field-sm !h-9 text-right" type="number" min="1" step="1" data-qty placeholder="Qty">
    <span class="text-body-sm text-on-surface-variant" data-avail></span>
    <button type="button" class="btn-ghost !h-9 !w-8 !px-0" data-rm aria-label="Remove">×</button></div>`;
  modal({
    title: 'New stock transfer', size: 'lg', subtitle: 'Quantities are in dispensing units (tablets, ml, vials…).',
    body: `<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="field-label">From</label><select class="field" data-src>${LOCS.map((l) => `<option ${l === 'Central' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="field-label">To</label><select class="field" data-dst>${LOCS.filter((l) => l !== 'Central').map((l) => `<option>${l}</option>`).join('')}</select></div></div>
      <div class="space-y-2" data-lines>${line()}</div><button type="button" class="btn-ghost btn-sm mt-2" data-add>Add medicine</button>
      <label class="field-label mt-3">Reason / notes</label><input class="field" data-reason placeholder="e.g. weekly ward top-up">`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Request transfer</button>',
    async onMount(el, close) {
      const host = el.querySelector('[data-lines]');
      const avail = async () => {
        const src = el.querySelector('[data-src]').value;
        const stock = src === 'Central' ? null : (await api.get(`/pharmacy/medicines?limit=1000&location=${src}`)).rows;
        host.querySelectorAll('[data-l]').forEach((l) => {
          const id = +l.querySelector('[data-med]').value;
          const q = src === 'Central' ? meds.find((m) => m.id === id)?.central_stock : stock.find((m) => m.id === id)?.location_stock;
          l.querySelector('[data-avail]').textContent = `${Number(q || 0).toLocaleString('en-IN')} in ${src}`;
        });
      };
      el.querySelector('[data-add]').onclick = () => { host.insertAdjacentHTML('beforeend', line()); avail(); };
      host.onchange = avail;
      el.querySelector('[data-src]').onchange = avail;
      host.onclick = (e) => { if (e.target.closest('[data-rm]') && host.children.length > 1) e.target.closest('[data-l]').remove(); };
      avail();
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          const lines = [...host.children].map((l) => ({ medicine_id: +l.querySelector('[data-med]').value, qty: +l.querySelector('[data-qty]').value })).filter((l) => l.qty > 0);
          const t = await api.post('/pharmacy/transfers', { source: el.querySelector('[data-src]').value, destination: el.querySelector('[data-dst]').value, lines, reason: el.querySelector('[data-reason]').value.trim() });
          close(); toast(`${t.transfer_no} requested`, 'success'); after(); openTransfer(t.id, after);
        } catch (err) { apiError(err, 'Transfer not saved'); busy(btn, false); }
      };
    },
  });
}

async function openTransfer(id, after) {
  const t = await api.get(`/pharmacy/transfers/${id}`);
  const w = can('inventory.write');
  const actions = [];
  const incharge = can('inventory.approve');
  if ((w || incharge) && t.status === 'requested') actions.push(`${incharge ? '<button class="btn-secondary" data-act="reject">Reject</button>' : ''}${w ? `<button class="btn-secondary" data-act="cancel">Cancel</button>
    <button class="btn-secondary" data-act="emergency" title="Issue now without the in-charge; they approve it later">Emergency issue</button>` : ''}
    ${incharge && t.requested_by !== state.user?.id ? '<button class="btn-primary" data-act="approve">Approve</button>' : incharge ? '<span class="text-body-sm text-on-surface-variant">You raised this request — another in-charge, the manager or the owner approves it.</span>' : ''}`);
  if (t.emergency && !t.ratified_by && incharge) actions.push('<button class="btn-primary" data-act="ratify">Approve emergency move</button>');
  if (w && t.status === 'approved') actions.push('<button class="btn-secondary" data-act="cancel">Cancel</button><button class="btn-primary" data-act="issue">Issue stock</button>');
  if (w && ['issued', 'partially_received'].includes(t.status)) actions.push(`${t.status === 'partially_received' ? '<button class="btn-secondary" data-act="close">Close short</button>' : ''}<button class="btn-primary" data-act="receive">Receive</button>`);
  const editable = t.status === 'requested', receiving = ['issued', 'partially_received'].includes(t.status);
  drawer({
    title: t.transfer_no, subtitle: `${esc(t.source)} → ${esc(t.destination)} · ${fmtDate(t.requested_at)}`, width: 'max-w-3xl',
    body: `<div class="p-5 space-y-4">
      <div class="flex flex-wrap gap-2 items-center">${statusPill(t.status)}${t.emergency ? (t.ratified_by ? `<span class="pill-success">Emergency · approved by ${esc(t.ratified_by_name || '')}</span>` : '<span class="pill-danger pill-dot">Emergency move · awaiting in-charge approval</span>') : ''}${t.reason ? `<span class="text-body-md text-on-surface-variant">${esc(t.reason)}</span>` : ''}${t.status === 'requested' && !can('inventory.approve') ? '<span class="text-body-sm text-on-surface-variant">Waiting for the store in-charge to approve. If it cannot wait, use Emergency issue.</span>' : ''}</div>
      <table class="tbl"><thead><tr><th>Medicine</th><th class="num">Requested</th><th class="num">Approved</th><th class="num">Issued</th><th class="num">Received</th><th class="num">At source</th></tr></thead><tbody>
      ${t.lines.map((l) => `<tr><td>${esc(l.medicine_name)} <span class="text-on-surface-variant text-body-sm">${esc(l.dispensing_unit || '')}</span>
          ${l.issues.length ? `<div class="mt-1 space-y-1">${l.issues.map((i) => `<div class="flex items-center gap-2 text-body-sm text-on-surface-variant">Batch ${esc(i.batch_no)} · exp ${esc(i.expiry.slice(0, 7))} · ${i.qty}
            ${receiving && i.qty > i.qty_received ? `<input class="field field-sm !h-7 !w-20 text-right" type="number" min="0" max="${i.qty - i.qty_received}" value="${i.qty - i.qty_received}" data-issue="${i.id}" aria-label="Quantity received">` : `· got ${i.qty_received}`}</div>`).join('')}</div>` : ''}</td>
        <td class="num">${l.qty_requested}</td>
        <td class="num">${editable ? `<input class="field field-sm !h-8 !w-20 text-right" type="number" min="0" max="${l.qty_requested}" value="${l.qty_requested}" data-approve="${l.id}" aria-label="Approved quantity">` : (l.qty_approved ?? '—')}</td>
        <td class="num">${l.qty_issued}</td><td class="num">${l.qty_received}</td><td class="num ${l.source_stock < (l.qty_approved ?? l.qty_requested) && ['requested', 'approved'].includes(t.status) ? 'text-danger' : ''}">${l.source_stock}</td></tr>`).join('')}</tbody></table>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-body-sm">${[['Requested', t.requested_by_name, t.requested_at], ['Approved', t.approved_by_name, t.approved_at], ['Issued', t.issued_by_name, t.issued_at], ['Received', t.received_by_name, t.received_at]]
        .map(([l, u, at]) => `<div class="rounded-lg bg-surface-container-low px-3 py-2"><div class="font-label-sm uppercase text-on-surface-variant">${l}</div><div>${esc(u || '—')}</div><div class="text-on-surface-variant">${at ? fmtDateTime(at) : ''}</div></div>`).join('')}</div>
      <div><h3 class="panel-title mb-1">History</h3><ul class="text-body-sm space-y-1">${t.history.map((h) => `<li>${fmtDateTime(h.created_at)} · <b>${esc(h.action.replace('transfer.', ''))}</b> by ${esc(h.user_name || '')}${h.reason ? ` — ${esc(h.reason)}` : ''}</li>`).join('')}</ul></div>
    </div>`,
    footer: actions.join(''),
    onMount(el, close) {
      el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
        const act = b.dataset.act;
        let body = {};
        if (['reject', 'cancel', 'close', 'emergency'].includes(act)) {
          const c = await confirmDialog({ title: act === 'emergency' ? 'Emergency issue' : `${act === 'close' ? 'Close with shortfall' : act[0].toUpperCase() + act.slice(1)} transfer`,
            message: act === 'emergency' ? 'Stock is issued now, before the in-charge approves. The move is flagged and the in-charge must approve it afterwards.'
              : act === 'close' ? 'Anything not received goes back to the source batch.' : 'This cannot be undone.', tone: 'danger', requireReason: true,
            reasonLabel: act === 'emergency' ? 'Why it cannot wait' : 'Reason', confirmLabel: act === 'emergency' ? 'Issue now' : 'Confirm' });
          if (!c) return;
          body.reason = c.reason;
        }
        if (act === 'approve') body.lines = [...el.querySelectorAll('[data-approve]')].map((i) => ({ id: +i.dataset.approve, qty_approved: +i.value }));
        if (act === 'receive') body.issues = [...el.querySelectorAll('[data-issue]')].map((i) => ({ id: +i.dataset.issue, qty: +i.value }));
        busy(b, true);
        try { await api.post(`/pharmacy/transfers/${t.id}/${act}`, body); toast(`Transfer ${({ approve: 'approved', issue: 'issued', receive: 'received', close: 'closed', reject: 'rejected', cancel: 'cancelled', emergency: 'issued (emergency)', ratify: 'approved' })[act]}`, 'success'); close(); after(); openTransfer(t.id, after); }
        catch (err) { apiError(err); busy(b, false); }
      }));
    },
  });
}
