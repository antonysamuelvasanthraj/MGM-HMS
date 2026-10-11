/**
 * Consumables used in a procedure — recorded from the procedure line, OT case, ER case or admission.
 * Stock is issued from the chosen store and charged on the procedure's bill once (₹0 when the procedure's
 * price already includes its consumables). Earlier records can be reversed (stock back, charge waived).
 */
import { api, esc, modal, toast, apiError, busy, money, confirmDialog, fmtDateTime } from './views/_kit.js';

const STORES = [['OP', 'OP pharmacy / procedure room'], ['ER', 'Emergency'], ['OT', 'Operation theatre'], ['ICU', 'ICU'], ['IP', 'IP pharmacy / ward'], ['Ward', 'Ward store']];

export async function openConsumables({ source_type, source_id, title, location = 'OP' }, after = () => {}) {
  let kit = { items: [], included: false }, records = [];
  try {
    [kit, records] = await Promise.all([
      ['bill_item', 'ot'].includes(source_type) ? api.get(`/consumptions/kit?source_type=${source_type}&source_id=${source_id}`) : Promise.resolve({ items: [], included: false }),
      api.get(`/consumptions?source_type=${source_type}&source_id=${source_id}`),
    ]);
  } catch (e) { apiError(e); return; }
  const live = records.filter((r) => r.status === 'recorded');
  const lockedOnce = ['bill_item', 'ot'].includes(source_type) && live.length;
  const rows = kit.items.map((k) => ({ medicine_id: k.medicine_id, name: k.name, qty: k.qty }));
  let store = location, found = [];
  const paint = (root) => {
    root.querySelector('[data-rows]').innerHTML = rows.length ? rows.map((r, i) => `<tr><td class="text-body-md">${esc(r.name)}</td>
      <td class="num"><input class="field field-sm !h-8 !w-20 text-right ml-auto" type="number" min="0" step="any" value="${r.qty}" data-q="${i}"></td>
      <td class="text-right"><button type="button" class="btn-ghost btn-xs" data-rm="${i}">Remove</button></td></tr>`).join('')
      : '<tr><td colspan="3" class="text-on-surface-variant text-body-sm py-3">Add what was used.</td></tr>';
  };
  modal({
    title: `Consumables used — ${title}`, subtitle: kit.included ? 'This procedure\'s price includes its consumables: stock is issued, nothing is charged again.' : 'Issued from the store and charged on the procedure\'s bill.', size: 'lg',
    body: `${live.length ? `<div class="mb-3 rounded-lg border border-outline-variant">${live.map((r) => `<div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/60">
        <div class="text-body-md"><b>${esc(r.consumption_no)}</b> · ${esc(r.location)} · ${fmtDateTime(r.recorded_at)} · ${esc(r.recorded_by_name || '')}
          <div class="text-body-sm text-on-surface-variant">${r.lines.map((l) => `${esc(l.description.split(' (B:')[0])} × ${l.qty}`).join(', ')} · charged ${money(r.total_charged)}</div></div>
        <button class="btn-secondary btn-xs" data-reverse="${r.id}">Reverse</button></div>`).join('')}</div>` : ''}
      ${lockedOnce ? '<p class="text-body-md text-warning">Consumables are already recorded for this procedure. Reverse the record above to correct it.</p>' : `
      <div class="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2 items-end">
        <div><label class="field-label">Store used</label><select class="field" data-store>${STORES.map(([k, l]) => `<option value="${k}" ${k === location ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-label">Add an item in stock at this store</label><input class="field" data-find list="cons-list" placeholder="Type to search"><datalist id="cons-list"></datalist></div>
        <button type="button" class="btn-secondary" data-add>Add</button></div>
      <table class="tbl mt-2"><thead><tr><th>Item</th><th class="text-right">Qty used</th><th></th></tr></thead><tbody data-rows></tbody></table>
      <input class="field mt-2" data-note placeholder="Note (optional)">`}`,
    footer: `<button class="btn-secondary" data-close>Close</button>${lockedOnce ? '' : '<button class="btn-primary" data-save>Record &amp; issue stock</button>'}`,
    onMount(root, close) {
      root.querySelectorAll('[data-reverse]').forEach((b) => (b.onclick = async () => {
        const r = await confirmDialog({ title: 'Reverse this record?', message: 'The stock goes back to the store and the charge is waived.', confirmLabel: 'Reverse', requireReason: true });
        if (!r) return;
        try { await api.post(`/consumptions/${b.dataset.reverse}/reverse`, { reason: r.reason }); toast('Reversed — stock returned', 'success'); close(); after(); } catch (e) { apiError(e); }
      }));
      if (lockedOnce) return;
      paint(root);
      const search = async () => {
        const q = root.querySelector('[data-find]').value.trim();
        found = await api.get(`/pharmacy/medicines?q=${encodeURIComponent(q)}&limit=20&active=1&location=${store}`).catch(() => []);
        const list = Array.isArray(found) ? found : found.rows || [];
        found = list;
        root.querySelector('#cons-list').innerHTML = list.map((m) => `<option value="${esc(m.name)}">${m.stock ?? m.qty ?? ''} in stock</option>`).join('');
      };
      root.querySelector('[data-store]').onchange = (e) => { store = e.target.value; search(); };
      root.querySelector('[data-find]').addEventListener('input', search);
      search();
      root.querySelector('[data-add]').onclick = () => {
        const name = root.querySelector('[data-find]').value.trim();
        const m = found.find((x) => x.name === name);
        if (!m) { toast('Pick an item from the list', 'warning'); return; }
        const have = rows.find((r) => r.medicine_id === m.id);
        if (have) have.qty += 1; else rows.push({ medicine_id: m.id, name: m.name, qty: 1 });
        root.querySelector('[data-find]').value = ''; paint(root);
      };
      root.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { rows.splice(+rm.dataset.rm, 1); paint(root); } });
      root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) rows[+e.target.dataset.q].qty = Number(e.target.value) || 0; });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const items = rows.filter((r) => r.qty > 0).map((r) => ({ medicine_id: r.medicine_id, qty: r.qty }));
        if (!items.length) { toast('Add what was used', 'warning'); return; }
        const body = { source_type, source_id, location: root.querySelector('[data-store]').value, items, notes: root.querySelector('[data-note]').value };
        busy(ev.currentTarget, true);
        try {
          let r;
          try { r = await api.post('/consumptions', body); }
          catch (err) {
            if (err?.payload?.error !== 'possible_duplicate_charge') throw err;
            const ok = await confirmDialog({ title: 'Already charged by the pharmacy?', message: `${err.payload.warnings.map(esc).join('<br>')}<br><br>Record these as used in the procedure as well?`, confirmLabel: 'Yes — record them too' });
            if (!ok) { busy(ev.currentTarget, false); return; }
            r = await api.post('/consumptions', { ...body, confirm_duplicates: true });
          }
          close(); toast(`${r.consumption_no} — stock issued${r.total_charged ? `, ${money(r.total_charged)} charged on ${r.bill_no}` : ' (included in the procedure price)'}`, 'success'); after();
        } catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

/** Kit editor for a procedure in Fees & Tariffs. */
export async function editProcedureKit(service, after = () => {}) {
  let kit;
  try { kit = await api.get(`/procedure-kits/${service.id}`); } catch (e) { apiError(e); return; }
  const rows = kit.items.map((k) => ({ medicine_id: k.medicine_id, name: k.name, qty: k.qty }));
  let all = [];
  try { const r = await api.get('/pharmacy/medicines?limit=1000&active=1'); all = Array.isArray(r) ? r : r.rows || []; } catch { all = []; }
  const paint = (root) => {
    root.querySelector('[data-rows]').innerHTML = rows.map((r, i) => `<tr><td>${esc(r.name)}</td><td class="num"><input class="field field-sm !h-8 !w-20 text-right ml-auto" type="number" min="0" step="any" value="${r.qty}" data-q="${i}"></td>
      <td class="text-right"><button type="button" class="btn-ghost btn-xs" data-rm="${i}">Remove</button></td></tr>`).join('') || '<tr><td colspan="3" class="text-on-surface-variant text-body-sm py-3">No standard items yet.</td></tr>';
  };
  modal({
    title: `Standard consumables — ${service.name}`, subtitle: 'Pre-filled whenever staff record what this procedure used.', size: 'md',
    body: `<label class="flex items-center gap-2 text-body-md mb-3"><input type="checkbox" data-incl ${kit.service.consumables_included ? 'checked' : ''}> The price of this procedure already includes its consumables (issue stock, do not charge them again)</label>
      <div class="flex gap-2 items-end"><div class="flex-1"><label class="field-label">Add an item</label><input class="field" data-find list="kit-list"><datalist id="kit-list">${all.map((m) => `<option value="${esc(m.name)}">`).join('')}</datalist></div>
        <button type="button" class="btn-secondary" data-add>Add</button></div>
      <table class="tbl mt-2"><tbody data-rows></tbody></table>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save kit</button>',
    onMount(root, close) {
      paint(root);
      root.querySelector('[data-add]').onclick = () => { const m = all.find((x) => x.name === root.querySelector('[data-find]').value.trim()); if (!m) { toast('Pick an item from the list', 'warning'); return; }
        if (!rows.find((r) => r.medicine_id === m.id)) rows.push({ medicine_id: m.id, name: m.name, qty: 1 }); root.querySelector('[data-find]').value = ''; paint(root); };
      root.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { rows.splice(+rm.dataset.rm, 1); paint(root); } });
      root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) rows[+e.target.dataset.q].qty = Number(e.target.value) || 0; });
      root.querySelector('[data-save]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.put(`/procedure-kits/${service.id}`, { items: rows.filter((r) => r.qty > 0), consumables_included: root.querySelector('[data-incl]').checked }); close(); toast('Kit saved', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}
