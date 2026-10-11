/**
 * Ward indents — nurses request medicines and consumables for an admitted
 * patient; the pharmacy issues them from the IP (or ICU / OT / ER) store and
 * the charge lands on the patient's running IP bill.
 */
import {
  page, eyebrow, liveChip, card, live, mountPage, api, qs, can, esc, bind, pill, modal, toast, busy, apiError, confirmDialog, fmtDateTime,
} from './_kit.js';
import {mountReplacementPanel} from '../ward-replacements.js';

const STATUS = [['requested', 'Requested'], ['partially_dispensed', 'Part issued'], ['dispensed', 'Issued'], ['cancelled', 'Cancelled'], ['all', 'All']];
const statusPill = (s) => ({ requested: pill('pending', 'Requested'), partially_dispensed: pill('partial', 'Part issued'), dispensed: pill('dispensed', 'Issued'), cancelled: pill('cancelled') })[s] || pill(s);

export async function mount(ctx) {
  const f = { status: 'requested' };
  const canRequest = can('ipd.indent') || can('nursing.write') || can('pharmacy.dispense');
  const canIssue = can('pharmacy.dispense');
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('IPD · Pharmacy', 'inventory')} ${liveChip()}`, title: 'Ward Stock & Indents',
    subtitle: 'Track emergency rack usage and patient replacements, or request medicines issued directly to an inpatient.',
    actions: canRequest ? '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span>Direct inpatient request</button>' : '',
    body: `<div class="card p-3"><strong>Emergency rack usage & replacement</strong><p class="text-body-sm">Used batch → pharmacy replacement bill → physical receipt into the ward.</p></div><div data-replacement-panel class="space-y-4"></div><h2 class="text-title-lg">Direct inpatient medicine requests</h2><div class="card p-3 flex flex-wrap items-end gap-2"><div><label class="field-label">Status</label>
      <select class="field field-sm !h-9" data-status>${STATUS.map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div data-list></div>`,
  }));

  const reloadReplacements=await mountReplacementPanel(root.querySelector('[data-replacement-panel]'));
  async function load() {
    await reloadReplacements();
    if(!canRequest&&!can('inventory.view')){root.querySelector('[data-list]').innerHTML='Direct inpatient requests require ward indent permission.';return;}
    const rows = await api.get(`/pharmacy/indents${qs({ status: f.status })}`);
    root.querySelector('[data-list]').innerHTML = rows.length ? `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">${rows.map((i) => card({
      title: `${i.indent_no} · ${i.patient_name}`, subtitle: `${esc(i.admission_no)} · bed ${esc(i.bed_code || '—')} · ${esc(i.location)} store · ${fmtDateTime(i.requested_at)} by ${esc(i.requested_by_name || '')}`,
      actions: statusPill(i.status), pad: false,
      body: `<table class="tbl"><thead><tr><th>Item</th><th class="num">Asked</th><th class="num">Issued</th><th class="num">In ${esc(i.location)}</th>${canIssue && ['requested', 'partially_dispensed'].includes(i.status) ? '<th class="num">Issue now</th>' : ''}</tr></thead><tbody>
        ${i.lines.map((l) => `<tr><td>${esc(l.medicine_name)}<div class="text-body-sm text-on-surface-variant">${esc(l.instructions || '')}</div></td><td class="num">${l.qty}</td><td class="num">${l.dispensed_qty}</td>
          <td class="num ${l.stock < l.qty - l.dispensed_qty ? 'text-danger' : ''}">${l.stock}</td>
          ${canIssue && ['requested', 'partially_dispensed'].includes(i.status) ? `<td class="num"><input class="field field-sm !h-8 !w-20 text-right" type="number" min="0" max="${l.qty - l.dispensed_qty}" value="${Math.min(l.qty - l.dispensed_qty, l.stock)}" data-line="${l.id}" aria-label="Quantity to issue"></td>` : ''}</tr>`).join('')}</tbody></table>
        ${['requested', 'partially_dispensed'].includes(i.status) ? `<div class="flex justify-end gap-2 p-3 border-t border-outline-variant">
          ${i.status === 'requested' && canRequest ? `<button class="btn-ghost btn-sm" data-cancel="${i.id}">Cancel</button>` : ''}
          ${canIssue ? `<button class="btn-primary btn-sm" data-issue="${i.id}">Issue to patient</button>` : ''}</div>` : ''}`,
    })).join('')}</div>` : card({ body: '<p class="text-center py-8 text-body-lg text-on-surface-variant">No indents here.</p>' });
  }

  root.querySelector('[data-status]').onchange = (e) => { f.status = e.target.value; load(); };
  bind(root, 'click', '[data-new]', () => newIndent(load));
  bind(root, 'click', '[data-issue]', async (e, b) => {
    const box = b.closest('section');
    const lines = [...box.querySelectorAll('[data-line]')].map((i) => ({ id: +i.dataset.line, qty: +i.value })).filter((l) => l.qty > 0);
    if (!lines.length) { toast('Enter a quantity to issue', 'warning'); return; }
    busy(b, true);
    try { const r = await api.post(`/pharmacy/indents/${b.dataset.issue}/dispense`, { lines }); toast(`Issued and charged to ${r.bill.bill_no}`, 'success'); load(); }
    catch (err) { apiError(err, 'Not issued'); busy(b, false); }
  });
  bind(root, 'click', '[data-cancel]', async (e, b) => {
    const c = await confirmDialog({ title: 'Cancel indent', message: 'The pharmacy will no longer see this request.', requireReason: true, tone: 'danger' });
    if (!c) return;
    try { await api.post(`/pharmacy/indents/${b.dataset.cancel}/cancel`, { reason: c.reason }); load(); } catch (err) { apiError(err); }
  });
  return live({ topics: ['pharmacy', 'ipd', 'inventory'], events: ['indent.created', 'indent.dispensed', 'indent.updated', 'transfer.updated'], load });
}

async function newIndent(after) {
  const [adm, meds] = await Promise.all([api.get('/ipd/admissions?status=active'), api.get('/pharmacy/medicines?limit=1000&location=IP')]);
  const admitted = adm.rows.filter((a) => a.status !== 'requested');
  if (!admitted.length) { toast('No patient is admitted', 'info'); return; }
  const line = () => `<div data-l class="grid gap-2 items-center" style="grid-template-columns:1fr 90px 1fr 32px">
    <select class="field field-sm !h-9" data-med>${meds.rows.map((m) => `<option value="${m.id}">${esc(m.name)} (${m.location_stock} in IP)</option>`).join('')}</select>
    <input class="field field-sm !h-9 text-right" type="number" min="1" step="1" data-qty placeholder="Qty">
    <input class="field field-sm !h-9" data-ins placeholder="Instructions (optional)">
    <button type="button" class="btn-ghost !h-9 !w-8 !px-0" data-rm aria-label="Remove">×</button></div>`;
  modal({
    title: 'New ward indent', size: 'lg',
    body: `<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <div class="md:col-span-2"><label class="field-label">Patient</label><select class="field" data-adm>${admitted.map((a) => `<option value="${a.id}">${esc(a.patient_name)} · ${esc(a.ip_no)} · ${esc(a.ward_name || '')} ${esc(a.bed_no || '')}</option>`).join('')}</select></div>
      <div><label class="field-label">Issue from</label><select class="field" data-loc>${['IP', 'ICU', 'OT', 'ER', 'Ward'].map((l) => `<option>${l}</option>`).join('')}</select></div>
      <div><label class="field-label">Type</label><select class="field" data-kind><option value="medicine">Medicines</option><option value="consumable">Consumables</option></select></div></div>
      <div class="space-y-2" data-lines>${line()}</div><button type="button" class="btn-ghost btn-sm mt-2" data-add>Add item</button>
      <label class="field-label mt-3">Notes</label><input class="field" data-notes>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Send to pharmacy</button>',
    onMount(el, close) {
      const host = el.querySelector('[data-lines]');
      el.querySelector('[data-add]').onclick = () => host.insertAdjacentHTML('beforeend', line());
      host.onclick = (e) => { if (e.target.closest('[data-rm]') && host.children.length > 1) e.target.closest('[data-l]').remove(); };
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          const lines = [...host.children].map((l) => ({ medicine_id: +l.querySelector('[data-med]').value, qty: +l.querySelector('[data-qty]').value, instructions: l.querySelector('[data-ins]').value.trim() })).filter((l) => l.qty > 0);
          const r = await api.post('/pharmacy/indents', { admission_id: +el.querySelector('[data-adm]').value, location: el.querySelector('[data-loc]').value, kind: el.querySelector('[data-kind]').value, notes: el.querySelector('[data-notes]').value.trim(), lines });
          close(); toast(`${r.indent_no} sent to pharmacy`, 'success'); after();
        } catch (err) { apiError(err, 'Indent not sent'); busy(btn, false); }
      };
    },
  });
}
