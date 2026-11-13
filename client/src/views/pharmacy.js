import {openSchemePatientPayment} from '../scheme-patient-pay.js';
import { collectBill } from '../collect.js';
import {printBill} from './bills.js';
import { printPatientPrescription } from '../patient-print.js';
/**
 * Pharmacy sales & dispensing (POS).
 *
 * Prescription → available batch/expiry selection → bill/payment → dispensing →
 * stock movement, all in one transaction so stock can never drift from the bill.
 */
import {
  page, eyebrow, liveChip, card, kpiRow, tableCard, live, mountPage, patientPicker,
  apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, moneyPlain, fmtDate, fmtTime, ago,
  kpi, spinner, emptyState, debounce, printDocument, todayISO, setting, headCount,
} from './_kit.js';
import { printReceipt, openNewPatient } from './op-registration.js';
import { confirmDialog } from '../ui.js';
import { showBillingContext } from '../billing-context.js';

const cart = [];
// Inpatients are served from the IP store and charged to their running IP bill;
// everyone else from the OP store on a pharmacy bill.
let ipMode = null;               // { admission_id, ip_no } while serving an inpatient
const store = () => (ipMode ? 'IP' : 'OP');
let patient = null;
let admissionLookupFailed=false;
let prescriptionId = null;
let rxCache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout({workspace:ctx.route==='/billing-desk'}));
  cart.length = 0; patient = null; prescriptionId = null; ipMode = null; admissionLookupFailed=false;

  async function load() {
    if(patient){
      const selectedId=patient.id;
      const latest=await api.get(`/patients/${selectedId}`);
      if(patient?.id===selectedId){patient=latest;showPatient(root);}
    }
    const d = await api.get('/pharmacy/dispense/queue');
    d.rows=(d.rows || []).filter(row=>String(row.created_at || '').slice(0,10)===todayISO());
    d.stats.pending=d.rows.length;
    rxCache = d.rows;
    headCount(root, manualRx() ? `${d.stats.sales_today} sales today` : `${d.stats.pending} prescriptions waiting · ${d.stats.sales_today} sales today`);
    const strip = $('[data-kpis]', root); strip.className = 'flex flex-wrap gap-2';
    strip.innerHTML = [
      // manual dispensing has no e-prescription queue to point at
      manualRx() ? null : { label: 'Prescriptions waiting', value: d.stats.pending },
      { label: 'Sales today', value: d.stats.sales_today },
      { label: 'Revenue today', value: money(d.stats.revenue_today) },
      { label: 'Cart', value: `${cart.length} · ${money(cartTotal())}` },
    ].filter(Boolean).map(miniStat).join('');
    if ($('[data-rx]', root)) renderRows($('[data-rx]', root), d.rows, rxRow, { empty: 'No prescriptions waiting to be dispensed.' });
    // opened from the dashboard queue: load that prescription straight into the cart
    if (ctx.query.rx) { $(`[data-rx] tr[data-id="${+ctx.query.rx}"] [data-load-rx]`, root)?.click(); ctx.query.rx = null; }
  }

  const offerSubstitutes = wireCounter(root, load);
  bind(root, 'click', '[data-print-rx]', (e,b) => {
    const r = rxCache.find(x => x.id === +b.closest('tr').dataset.id);
    if (r) printPatientPrescription(r.patient_id, r.id);
  });
  bind(root, 'click', '[data-load-rx]', async (e, b) => {
    const rx = rxCache.find((x) => x.id === +b.closest('tr').dataset.id);
    if (!rx) return;
    patient = await api.get(`/patients/${rx.patient_id}`);admissionLookupFailed=false;
    $('[data-pharmacy-notes]', root).value = '';
    prescriptionId = rx.id;
    ipMode = rx.admission_id ? { admission_id: rx.admission_id, ip_no: rx.ip_no || 'IP' } : null;
    cart.length = 0;
    const unlinked = [], nostock = [], short = [], substitutes = [];
    for (const item of rx.items) {
      if (!item.medicine_id) { unlinked.push(item.drug); continue; }
      if (item.dispensed_qty >= item.qty) continue;
      const batches = await api.get(`/pharmacy/batches?medicine_id=${item.medicine_id}&location=${store()}`);
      if (!batches.length) {
        const { rows: alts } = await api.get(`/pharmacy/medicines/${item.medicine_id}/alternatives${qs({ location: store() })}`).catch(() => ({ rows: [] }));
        if (alts.length) substitutes.push({ item, alts }); else nostock.push(item.medicine_name || item.drug);
        continue;
      }
      // earliest expiry first, never more than a batch holds; whatever is left stays pending on the prescription
      const wanted = Math.max(1, Math.round(item.qty - (item.dispensed_qty || 0)));
      let need = wanted;
      for (const batch of batches) {
        if (need <= 0) break;
        const take = Math.min(need, Math.floor(batch.qty));
        if (take <= 0) continue;
        cart.push({
          medicine_id: item.medicine_id, name: item.medicine_name || item.drug, qty: take,
          rate: batch.mrp || 0, batch_id: batch.id, batch_no: batch.batch_no || '—', expiry: batch.expiry, stock: batch.qty,
          prescription_item_id: item.id,
        });
        need -= take;
      }
      if (need > 0) short.push(`${item.medicine_name || item.drug} — ${wanted - need} of ${wanted} in stock`);
    }
    paintCart(root);
    showPatient(root);
    if (substitutes.length) offerSubstitutes(substitutes);
    toast(`${cart.length} line(s) loaded${ipMode ? ' — inpatient: IP store, charged to the IP bill' : ''}`, cart.length ? 'success' : 'warning', {
      title: [unlinked.length && `Not in the medicine master: ${unlinked.join(', ')} — print for outside purchase; substitutions require doctor approval`,
        nostock.length && `No stock in ${store()} store: ${nostock.join(', ')}`,
        short.length && `Part stock — the rest stays pending on the prescription: ${short.join('; ')}`].filter(Boolean).join(' · ') || undefined,
      timeout: unlinked.length || nostock.length || short.length ? 10000 : 4200,
    });
    load();
  });

  return live({ topics: ['pharmacy', 'clinical', 'billing', 'insurance', 'ipd'], events: ['prescription.saved', 'pharmacy.dispensed', 'stock.changed'], load });
}

const cartTotal = () => cart.reduce((s, i) => s + i.qty * i.rate, 0);
/** Settings → Department workflow → Pharmacy: manual dispensing from the paper prescription. */
const manualRx = () => setting('workflow_pharmacy', 'eprescription') === 'manual';            // queue hidden
const paperRx = () => ['manual', 'both'].includes(setting('workflow_pharmacy', 'eprescription')); // paper fields shown

function layout({workspace=false}={}) {
  return page({
    wide: true,
    eyebrow: `${eyebrow('Pharmacy counter', 'local_pharmacy')} ${liveChip()}`,
    title: 'Pharmacy Sales & Dispensing',
    subtitle: 'Sell and dispense medicines.',
    actions: workspace?'<a href="/reports?report=pharmacy_patient_register" class="btn-secondary">Sales register</a>':`<a href="/stock" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">inventory_2</span> Stock</a>
      <a href="/bills?type=PHARM" class="btn-secondary">Completed bills / reprint</a><a href="/reports?report=pharmacy_patient_register" class="btn-secondary">Sales register</a>
      <a href="/medicines" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">pill</span> Medicine master</a>`,
    body: `
      ${kpiRow([], 4)}
      <div class="grid grid-cols-1 gap-3 items-start">
        <div class="space-y-4">
          ${card({
            title: 'Create sales order', subtitle: 'Customer and doctor, then the medicines, then payment.',
            body: `<div class="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-3"><div><label class="field-label">Customer *</label><div data-picker></div><button type="button" class="btn-ghost btn-xs mt-1" data-quick-reg><span class="material-symbols-outlined text-[15px]">person_add</span> New patient</button></div>
              <div>
                <label class="field-label">Order items — add medicine</label>
                <div class="flex gap-2 items-start">
                  <div class="relative flex-1">
                    <input class="field" data-msearch placeholder="Search medicine (name, generic, code or HSN) — pick it, then enter the quantity" autocomplete="off">
                    <div class="hidden absolute left-0 right-0 top-11 z-30 card shadow-md max-h-80 overflow-y-auto" data-mlist></div>
                  </div>
                  <input class="field text-center" style="width:90px" type="number" min="1" placeholder="Qty" data-newqty aria-label="Quantity">
                  <button type="button" class="btn-primary" data-addline><span class="material-symbols-outlined text-[18px]">add</span> Add line</button>
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-body-md" data-linepreview aria-live="polite"><span class="text-on-surface-variant">Unit price, quantity and line total show here as you enter a line.</span></div>
              </div>
              
            </div>
            <div class="mt-2 text-body-sm" data-stock-source>Dispensing store: OP. GRN stock in Central must be transferred and received here first. <a href="/stock-transfers" class="text-primary underline">Open stock transfers</a></div><div class="mt-2 text-body-sm text-on-surface-variant" data-pat-name>No patient selected — a walk-in sale still needs a patient record.</div>
            ${paperRx() ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-outline-variant">
              <div><label class="field-label">Paper prescription by</label><select class="field" data-rx-doctor><option value="">— outside doctor / OTC —</option>${(state.meta?.doctors || []).filter((d) => d.role === 'doctor').map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
              <div><label class="field-label">Prescription reference / outside doctor</label><input class="field" data-rx-note placeholder="e.g. Rx dated today, Dr. K. Rao"></div></div>` : ''}`,
          })}
          ${manualRx() ? '' : tableCard({
            title: 'Prescriptions waiting', maxHeight: '38vh', id: 'rxq',
            columns: [{ label: 'Patient' }, { label: 'Doctor' }, { label: 'Items' }, { label: 'Status' }, { label: 'Raised' }, { label: '', width: '120px' }],
          }).replace('data-rows', 'data-rx')}
        </div>

        <section class="card">
          <header class="px-4 h-12 flex items-center justify-between border-b border-outline-variant">
            <h2 class="panel-title">Bill</h2>
            <div class="flex gap-1"><button class="btn-ghost btn-xs" data-held>Held bills</button><button class="btn-ghost btn-xs" data-hold>Hold</button><button class="btn-ghost btn-xs" data-cancel-bill title="Discard this unsaved bill. Nothing is billed or stock-moved." ${cart.length||patient?"":"disabled"}>Cancel bill</button><button class="btn-ghost btn-xs" data-clear>New bill</button></div>
          </header>
          <div class="max-h-[46vh] overflow-y-auto" data-cart></div>
          <div class="p-4 border-t border-outline-variant space-y-2.5">
            <div class="flex items-center justify-between text-body-lg">
              <span class="text-on-surface-variant">Sub-total</span><span class="font-data-mono" data-sub>₹0</span></div>
            <p class="text-body-sm text-on-surface-variant">Medicines are billed at the selling price. Pharmacy discounts are disabled.</p>
            <div class="flex items-center justify-between pt-2 border-t border-outline-variant">
              <span class="font-title-md text-title-md">Bill value</span>
              <span class="font-headline-lg text-headline-lg text-primary" data-total>₹0</span></div>
            <h3 class="panel-title pt-1">Payment details</h3>
            <div class="grid grid-cols-3 gap-2 pt-1" data-modes>
              ${[['cash', 'Cash', 'payments'], ['upi', 'UPI', 'qr_code_2'], ['card', 'Card', 'credit_card']]
                .map(([v, l, i], idx) => `<button type="button" data-v="${v}"
                  class="flex items-center justify-center gap-1.5 h-9 rounded border ${idx === 0 ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}">
                  <span class="material-symbols-outlined text-[16px]">${i}</span>
                  <span class="font-label-md text-label-md">${l}</span></button>`).join('')}
            </div>
            <p class="text-body-sm text-info hidden" data-collection-note></p>
            <div><label class="field-label">Pharmacy notes</label><textarea class="field" rows="2" data-pharmacy-notes placeholder="Instructions or issue notes — saved with the bill"></textarea></div>
            <button class="btn-primary w-full !h-11" data-dispense>
              <span class="material-symbols-outlined text-[18px]">medication</span> Dispense & bill</button>
          </div>
        </section>
      </div>`,
  });
}

function rxRow(r) {
  const short = r.items.filter((i) => i.stock !== null && i.stock < (i.qty || 0)).length;
  return `
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)}${r.token_no ? ` · Tok ${r.token_no}` : ''}</div></td>
    <td class="text-body-md">${esc(r.doctor_name || '—')}</td>
    <td><span class="font-data-mono">${r.done_count}/${r.item_count}</span>
      ${short ? `<span class="pill-warning pill-dot">${short} short</span>` : ''}</td>
    <td><span class="pill-neutral">${esc(r.admission_id ? 'IPD' : r.encounter_kind === 'EMG' ? 'ER' : 'OPD')}</span>
      <span class="pill-info">${esc(({self:'Self-pay',credit:'Credit · due',insurance:'Insurance / TPA',aarogyasri:'Aarogyasri',corporate:'Corporate',trust:'Trust',free:'Free'})[r.payer_type] || r.payer_type || 'Self-pay')}</span>
      <div>${r.status === 'partial' ? '<span class="pill-warning">Partially dispensed</span>' : pill(r.status)}</div></td>
    <td class="text-body-sm">${ago(r.created_at)}</td>
    <td class="text-right"><button class="btn-secondary btn-xs" data-print-rx>Print prescription</button> <button class="btn-primary btn-xs" data-load-rx>Load</button></td>`;
}

function wireCounter(root, reload) {
  // patient
  // quick registration: the new (or existing) patient is picked straight away, no codes to type
  const pickPatient = async (p) => {
    $('[data-pharmacy-notes]', root).value = '';
    patient = p; ipMode = null; admissionLookupFailed = false;
    const input = $('[data-pp-input]', root); if (input) input.value = `${p.name} — ${p.uhid}`;
    showPatient(root); paintCart(root);
  };
  $('[data-quick-reg]', root).onclick = () => openNewPatient(async (p) => pickPatient(await api.get(`/patients/${p.id}`)));
  patientPicker($('[data-picker]', root), async (p) => {
    $('[data-pharmacy-notes]', root).value = '';
    patient = p;
    ipMode = null;
    admissionLookupFailed=true;
    try {
      const adm = (await api.get(`/ipd/admissions${qs({ q: p.uhid })}`)).rows.find((a) => a.patient_id === p.id && a.status !== 'discharged');
      if(patient?.id!==p.id)return;
      if (adm) ipMode = { admission_id: adm.id, ip_no: adm.ip_no };
      admissionLookupFailed=false;
    } catch(error) { if(patient?.id!==p.id)return;apiError(error,'Could not verify OP / IP stock source. Select the patient again.'); }
    if (cart.length && ipMode) { cart.length = 0; paintCart(root); toast('Cart cleared — this patient is admitted, so medicines come from the IP store', 'info'); }
    showPatient(root);
  }, { placeholder: 'UHID, name or mobile — any patient' });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-ipmode]')) return;
    if (cart.length) { cart.length = 0; paintCart(root); }
    ipMode = JSON.parse(e.target.dataset.ipmode);
    e.target.checked = true;
    showPatient(root, JSON.parse(e.target.dataset.ipmode));
  });

  // medicine search
  const input = $('[data-msearch]', root);
  const list = $('[data-mlist]', root);
  const search = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { list.classList.add('hidden'); return; }
    const { rows } = await api.get(`/pharmacy/medicines${qs({ q, limit: 20, active: 1, location: store() })}`);
    for (const m of rows) m.stock = m.location_stock;
    list.innerHTML = rows.length ? rows.map((m) => `<div class="border-b border-outline-variant/60 last:border-0">
      <button type="button" class="w-full text-left px-3 py-2 hover:bg-surface-container-low
        ${m.stock <= 0 ? 'opacity-50' : ''}" data-m="${m.id}" ${m.stock <= 0 ? 'disabled' : ''}>
        <div class="flex items-center justify-between gap-2">
          <span class="font-label-lg text-label-lg truncate">${esc(m.name)}${['H', 'H1', 'X'].includes(String(m.schedule || '').toUpperCase()) ? ` <span class="pill-warning" title="Prescription required">Sch ${esc(m.schedule)} · Rx</span>` : ''}</span>
          <span class="font-data-mono text-body-sm" title="Price of the batch that will be dispensed (first expiry)">${money(m.next_price ?? m.mrp ?? 0, 2)}</span></div>
        <div class="text-body-sm text-on-surface-variant">${esc(m.generic || '')} · ${esc(m.form || '')} ·
          ${store()} stock <span class="${m.stock <= m.reorder_level ? 'text-danger font-semibold' : ''}">${m.stock}</span>
          ${m.next_expiry ? ` · exp ${fmtDate(m.next_expiry)}` : ''}</div>
      </button>${m.stock <= 0 ? `<div class="px-3 pb-2 text-body-sm" data-alt-for="${m.id}"></div>` : ''}</div>`).join('') : `<div class="px-3 py-3 text-body-md text-on-surface-variant">No medicine matches “${esc(q)}”.</div>`;
    list.classList.remove('hidden');
    // out of stock here: offer brands with the same composition that are on the shelf
    for (const m of rows.filter((x) => x.stock <= 0).slice(0, 5)) {
      api.get(`/pharmacy/medicines/${m.id}/alternatives${qs({ location: store() })}`).then(({ rows: alts }) => {
        const host = list.querySelector(`[data-alt-for="${m.id}"]`);
        if (!host) return;
        host.innerHTML = alts.length
          ? `<span class="text-on-surface-variant">Same generic in stock:</span> ${alts.slice(0, 4).map((x) => `<button type="button" class="pill-success !cursor-pointer" data-m="${x.id}" title="${esc(x.generic || '')} · ${esc(x.form || '')}">${esc(x.name)} · ${x.location_stock} · ${money(x.next_price ?? 0, 2)}</button>`).join(' ')}`
          : '<span class="text-on-surface-variant">No same-generic brand in stock here.</span>';
      }).catch(() => {});
    }
  }, 220);
  input.addEventListener('input', search);
  input.addEventListener('blur', () => setTimeout(() => { if (!list.contains(document.activeElement)) list.classList.add('hidden'); }, 180));
  list.addEventListener('focusout', () => setTimeout(() => { if (!list.contains(document.activeElement) && document.activeElement !== input) list.classList.add('hidden'); }, 180));
  // keyboard and barcode scanner: Enter takes the first in-stock match, ↓ moves into the list
  input.addEventListener('keydown', (e) => {
    const first = () => list.querySelector('[data-m]:not([disabled])');
    if (e.key === 'Escape') { list.classList.add('hidden'); return; }
    if (e.key === 'ArrowDown' && first()) { e.preventDefault(); list.classList.remove('hidden'); first().focus(); }
    if (e.key !== 'Enter' || input.value.trim().length < 2) return;
    e.preventDefault();
    let tries = 0;  // a scanner types faster than the search: wait for the results of this text
    const pick = () => { const b = !list.classList.contains('hidden') && first(); if (b) b.click(); else if (++tries < 10) setTimeout(pick, 120); };
    pick();
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.activeElement?.closest('[data-m]')?.click(); return; }
    if (e.key === 'Escape') { e.preventDefault(); list.classList.add('hidden'); input.focus(); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const all = [...list.querySelectorAll('[data-m]:not([disabled])')], i = all.indexOf(document.activeElement);
    e.preventDefault();
    (all[i + (e.key === 'ArrowDown' ? 1 : -1)] || (e.key === 'ArrowUp' ? input : all[i]))?.focus();
  });
  // the prescribed brand is out of stock: the pharmacist may give an equivalent (same composition and form)
  function offerSubstitutes(subs) {
    modal({
      title: 'Prescribed brand out of stock', subtitle: `Same-generic brands in the ${store()} store`, size: 'md',
      body: subs.map(({ item, alts }, i) => `<div class="mb-3"><div class="font-label-lg">${esc(item.medicine_name || item.drug)} × ${Math.max(1, Math.round(item.qty - (item.dispensed_qty || 0)))}</div>
        <div class="text-body-sm text-on-surface-variant mb-1">${esc(alts[0].generic || '')} · ${esc(alts[0].form || '')}</div>
        ${alts.map((x, j) => `<label class="flex items-center gap-2 py-1"><input type="radio" name="sub${i}" value="${x.id}" ${j === 0 ? 'checked' : ''}>
          <span class="flex-1">${esc(x.name)}${x.manufacturer ? ` <span class="text-body-sm text-on-surface-variant">${esc(x.manufacturer)}</span>` : ''}</span>
          <span class="font-data-mono text-body-sm">${x.location_stock} in stock · ${money(x.next_price ?? 0, 2)}</span></label>`).join('')}
        <label class="flex items-center gap-2 py-1 text-on-surface-variant"><input type="radio" name="sub${i}" value=""> Do not substitute (leave pending)</label></div>`).join(''),
      footer: '<button class="btn-secondary" data-close>Skip</button><button class="btn-primary" data-add-subs>Add substitutes</button>',
      onMount(el, close) {
        el.querySelector('[data-add-subs]').onclick = async () => {
          for (const [i, { item }] of subs.entries()) {
            const id = +el.querySelector(`[name="sub${i}"]:checked`)?.value;
            if (!id) continue;
            const batches = await api.get(`/pharmacy/batches?medicine_id=${id}&location=${store()}`);
            const m = await api.get(`/pharmacy/medicines/${id}`);
            let need = Math.max(1, Math.round(item.qty - (item.dispensed_qty || 0)));
            for (const batch of batches) {
              if (need <= 0) break;
              const take = Math.min(need, Math.floor(batch.qty));
              if (take <= 0) continue;
              cart.push({ medicine_id: id, name: `${m.name} (for ${item.medicine_name || item.drug})`, qty: take, rate: batch.mrp || 0, batch_id: batch.id,
                batch_no: batch.batch_no || '—', expiry: batch.expiry, stock: batch.qty, prescription_item_id: item.id });
              need -= take;
            }
          }
          close(); paintCart(root); toast('Substitutes added — the bill notes which brand each replaces', 'success');
        };
      },
    });
  }

  // mousedown keeps focus in the search box (so the list stays open); click also comes from Enter and scanners
  list.addEventListener('mousedown', (e) => { if (e.target.closest('[data-m]')) e.preventDefault(); });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const batches = await api.get(`/pharmacy/batches?medicine_id=${b.dataset.m}&location=${store()}`);
    if (!batches.length) { toast(`No sellable batch in the ${store()} store`, 'warning'); return; }
    const m = await api.get(`/pharmacy/medicines/${b.dataset.m}`);
    // the chosen medicine waits in the entry row until a quantity is typed; Enter or Add line puts it in the bill
    pending = { m, batches };
    input.value = m.name; list.classList.add('hidden');
    preview();
    const quantity=$('[data-newqty]', root);
    quantity.focus();quantity.select();
  });
  let pending = null;
  function preview() {
    const box = $('[data-linepreview]', root);
    if (!pending) { box.innerHTML = '<span class="text-on-surface-variant">Unit price, quantity and line total show here as you enter a line.</span>'; return; }
    const batch = pending.batches[0], rate = batch.selling_price ?? batch.mrp, qty = Math.max(0, Math.floor(+$('[data-newqty]', root).value || 0));
    box.innerHTML = `<span>Unit price <b class="font-data-mono">${money(rate, 2)}</b></span><span>Qty billed <b class="font-data-mono">${qty}</b></span><span>Line total <b class="font-data-mono">${money(qty * rate, 2)}</b></span><span class="text-on-surface-variant">Batch ${esc(batch.batch_no)} · ${batch.qty} in stock</span>`;
  }
  $('[data-newqty]', root).addEventListener('input', preview);
  const addLine = () => {
    if (!pending) { toast('Search and pick a medicine first', 'warning'); input.focus(); return; }
    const qty = Math.max(1, Math.floor(+$('[data-newqty]', root).value || 1)), { m, batches } = pending, batch = batches[0];
    cart.push({ medicine_id: m.id, name: m.name, qty, rate: batch.selling_price ?? batch.mrp, batch_id: batch.id,
      batch_no: batch.batch_no, expiry: batch.expiry, stock: batch.qty, batches });
    pending = null; input.value = ''; $('[data-newqty]', root).value = ''; preview();
    paintCart(root); input.focus();
  };
  bind(root, 'click', '[data-addline]', addLine);
  $('[data-newqty]', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } });
  input.addEventListener('input', () => { pending = null; preview(); });

  // cart interactions
  bind(root, 'input', '[data-qty]', (e, el) => {
    const i = +el.closest('[data-line]').dataset.line;
    cart[i].qty = Math.max(1, +el.value || 1);
    const amt = el.closest('tr')?.querySelector('[data-amt]'); if (amt) amt.textContent = money(cart[i].qty * cart[i].rate, 2);
    paintTotals(root);
  });
  bind(root, 'change', '[data-batch]', (e, el) => {
    const i = +el.closest('[data-line]').dataset.line;
    const b = cart[i].batches?.find((x) => x.id === +el.value);
    if (b) { cart[i].batch_id = b.id; cart[i].batch_no = b.batch_no; cart[i].expiry = b.expiry; cart[i].rate = b.selling_price ?? b.mrp; cart[i].stock = b.qty; }
    paintCart(root);
  });
  bind(root, 'click', '[data-rm]', (e, el) => { cart.splice(+el.closest('[data-line]').dataset.line, 1); paintCart(root); });
  $('[data-cancel-bill]', root).onclick = async () => {
    if (cart.length && !(await confirmDialog({ title: 'Cancel this bill?', message: `The ${cart.length} unsaved medicine line${cart.length > 1 ? 's' : ''} will be cleared. Nothing has been billed or taken from stock. Held bills are not affected.`, confirmLabel: 'Cancel bill', tone: 'danger' }))) return;
    cart.length = 0; prescriptionId = null; patient = null; ipMode = null; $('[data-pharmacy-notes]', root).value = ''; showPatient(root); $('[data-pp-input]', root).value = ''; paintCart(root);
  };
  $('[data-clear]', root).onclick = () => { cart.length = 0; prescriptionId = null;patient=null;ipMode=null; $('[data-pharmacy-notes]', root).value = '';showPatient(root);$('[data-pp-input]',root).value=''; paintCart(root); };
  $('[data-hold]', root).onclick = async () => {
    if (!patient || !cart.length) { toast('Choose a patient and add medicines before holding the bill', 'warning'); return; }
    try {
      await api.post('/pharmacy/held-bills', {patient_id:patient.id,items:cart,notes:$('[data-pharmacy-notes]',root).value, prescription_id:prescriptionId, admission_id:ipMode?.admission_id, ip_no:ipMode?.ip_no});
      cart.length=0; prescriptionId=null; patient=null; ipMode=null; $('[data-pharmacy-notes]',root).value=''; showPatient(root);paintCart(root);toast('Bill held. Stock is checked again when completed.','success');
    } catch(e) { apiError(e); }
  };
  $('[data-held]', root).onclick = async () => {
    try {
      const rows=await api.get('/pharmacy/held-bills');
      modal({title:'Held pharmacy bills',size:'lg',body:rows.length?`<table class="tbl"><thead><tr><th>Patient</th><th>Held at</th><th>Staff</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.patient_name)} · ${esc(r.uhid)}</td><td>${esc(r.created_at)}</td><td>${esc(r.held_by)}</td><td><button class="btn-primary btn-xs" data-resume="${r.id}">Resume</button></td></tr>`).join('')}</tbody></table>`:'<p>No held bills.</p>',footer:'<button class="btn-secondary" data-close>Close</button>',onMount(dialog,close){
        // one resume at a time: a second click on the same row (or a repeat event) must not resume the bill again
        let busy=false;
        dialog.addEventListener('click',async e=>{
          const button=e.target.closest('[data-resume]'); if(!button||busy)return;
          const id=button.dataset.resume;
          if(cart.length){toast('Hold or clear the current bill first','warning');return;}
          busy=true; button.disabled=true;
          try{
            const held=await api.post(`/pharmacy/held-bills/${id}/resume`,{});
            patient=held.patient;admissionLookupFailed=false;prescriptionId=held.prescription_id;ipMode=held.admission_id?{admission_id:held.admission_id,ip_no:held.ip_no}:null;
            cart.push(...held.items);$('[data-pharmacy-notes]',root).value=held.notes||'';showPatient(root);paintCart(root);
            close();toast('Bill resumed. Quantities and batches are rechecked at completion.','success');
          }catch(err){
            if(err.payload?.error==='held_bill_unavailable'){toast('This held bill was already resumed or removed','warning');button.closest('tr')?.remove();}
            else apiError(err);
          }finally{busy=false;if(button.isConnected)button.disabled=false;}
        });
      }});
    } catch(e){apiError(e);}
  };

  let mode = 'cash';
  $('[data-modes]', root).onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    mode = b.dataset.v;
    $$('[data-modes] [data-v]', root).forEach((x) => {
      const on = x === b;
      x.className = x.className.replace(/border-primary bg-primary-fixed text-primary|border-outline-variant text-on-surface-variant hover:bg-surface-container-low/,
        on ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low');
    });
  };

  $('[data-dispense]', root).onclick = async (ev) => {
    if (!patient) { toast('Select the patient first', 'warning'); return; }
    if(admissionLookupFailed){toast('Select the patient again so OP / IP stock can be verified','warning');return;}
    if (!cart.length) { toast('The bill is empty', 'warning'); return; }
    const actionButton = ev.currentTarget;
    busy(actionButton, true, 'Dispensing');
    try {
      const r = await api.post('/pharmacy/dispense', {
        patient_id: patient.id, prescription_id: prescriptionId, location: store(), admission_id: ipMode?.admission_id,
        discount: 0,
        notes: $('[data-pharmacy-notes]', root).value.trim(),
        ...(paperRx() ? { rx_doctor_id: +($('[data-rx-doctor]', root)?.value || 0) || undefined, rx_note: $('[data-rx-note]', root)?.value.trim() || undefined } : {}),
        mode, collect: false,
        items: cart.map((i) => ({ medicine_id: i.medicine_id, qty: i.qty, rate: i.rate, batch_id: i.batch_id, prescription_item_id: i.prescription_item_id })),
      });
      toast(`${r.bill.bill_no} · ${money(r.bill.total, 2)} dispensed`, 'success', {
        title: 'Sale complete',
        action: { label: 'Print bill', run: () => printBill(r.bill.id) },   // the GST tax invoice is the pharmacy document; no separate receipt
      });
      const schemePatientId=patient?.id;
      if(r.bill.payer_type==='aarogyasri'&&can('scheme.patient_pay'))toast('Aarogyasri: permit a patient share only when authorized','info',{action:{label:'Patient payment permitted',run:()=>openSchemePatientPayment(schemePatientId,r.bill.id,reload)}});
      if (ipMode) toast(`Charged to IP bill ${r.bill.bill_no} — settled at discharge by reception`, 'info');
      else if (r.bill.payer_type === 'self' && r.bill.balance > 0) collectBill(r.bill.id, reload, { mode: mode === 'card' ? 'debit_card' : mode }); // keep the counter's chosen mode
      else if (r.bill.deferred_collection) toast('Recorded against the patient and payer case / approved due. Collect only the patient share; payer settlement is recorded when received.', 'info');
      ipMode = null;
      $('[data-pharmacy-notes]', root).value = '';
      cart.length = 0; prescriptionId = null; patient = null;
      showPatient(root);
      $('[data-pat-name]', root).textContent = 'No patient selected.';
      $('[data-pp-input]', root).value = '';
      paintCart(root); reload();
    } catch (e) { apiError(e, 'Could not complete the sale'); }
    finally { busy(actionButton, false); }
  };

  paintCart(root);
  return offerSubstitutes;
}

/** A small figure chip — the pharmacy counter needs the numbers, not big cards. */
const miniStat = ({ label, value }) => `<div class="inline-flex items-baseline gap-2 px-3 py-1 rounded-lg border border-outline-variant bg-white"><span class="text-label-sm uppercase tracking-wider text-on-surface-variant">${esc(label)}</span><b class="text-body-lg tnum">${value}</b></div>`;

function paintCart(root) {
  const cartCard = $('[data-kpis]', root)?.lastElementChild;
  if (cartCard) cartCard.outerHTML = miniStat({ label: 'Cart', value: `${cart.length} · ${money(cartTotal())}` });
  const box = $('[data-cart]', root);
  box.innerHTML = `<table class="tbl w-full"><thead><tr><th>S.No</th><th>Product</th><th>Batch · Expiry</th><th class="num">Unit price</th><th class="num">Stock</th><th class="num" style="width:90px">Qty</th><th class="num">Amount</th><th></th></tr></thead><tbody>${cart.map((i, idx) => `
    <tr data-line="${idx}"><td>${idx + 1}</td><td class="font-label-lg min-w-0">${esc(i.name)}</td>
      <td>${i.batches?.length > 1
          ? `<select class="field field-sm" data-batch>${i.batches.map((b) => `<option value="${b.id}" ${b.id === i.batch_id ? 'selected' : ''}>${esc(b.batch_no)} · exp ${fmtDate(b.expiry)} · ${b.qty} left</option>`).join('')}</select>`
          : `<span class="text-body-sm text-on-surface-variant">${esc(i.batch_no)}${i.expiry ? ` · ${fmtDate(i.expiry)}` : ''}</span>`}</td>
      <td class="num">${money(i.rate, 2)}</td><td class="num">${i.stock ?? '—'}</td>
      <td class="num"><input class="field field-sm text-center" type="number" min="1" value="${i.qty}" data-qty></td>
      <td class="num font-data-mono" data-amt>${money(i.qty * i.rate, 2)}</td>
      <td><button class="btn-ghost btn-xs" data-rm aria-label="Remove"><span class="material-symbols-outlined text-[15px]">close</span></button></td></tr>`).join('') || '<tr><td colspan="8" class="text-center py-8 text-on-surface-variant">No items yet — search a medicine above, or load a prescription.</td></tr>'}</tbody></table>`;
  paintTotals(root);
}

function paintTotals(root) {
  const sub = cartTotal();
  $('[data-sub]', root).textContent = money(sub, 2);
  $('[data-total]', root).textContent = money(sub, 2);
}

/** Patient line under the counter, with the IP / OP store switch for admitted patients. */
function showPatient(root, adm = ipMode) {
  const source=root.querySelector('[data-stock-source]');if(source)source.innerHTML=`<b>Dispensing store: ${store()}</b>. Receive transfers from Central into this store before billing. <a href="/stock-transfers" class="text-primary underline">Open stock transfers</a>`;
  const deferred = ipMode || (patient && patient.payer_type !== 'self');
  $('[data-modes]', root)?.classList.toggle('hidden', !!deferred);
  const note = $('[data-collection-note]', root);
  if (note) {
    note.classList.toggle('hidden', !deferred);
    note.textContent = ipMode ? 'Added to the running IP bill. No payment is collected here.' : 'Recorded as payer / approved due. Only self-pay is collected immediately; co-pay and exclusions are collected separately.';
  }
  const el = $('[data-pat-name]', root);
  root.querySelector('[data-package-summary]')?.remove();
  root.querySelector('[data-billing-context]')?.remove();
  if (!patient) { el.textContent = 'No patient selected.'; return; }
  const currentPatient = patient.id;
  const contextBox=document.createElement('div');contextBox.dataset.billingContext='';contextBox.className='mt-3';el.after(contextBox);showBillingContext(contextBox,currentPatient);
  api.get(`/pharmacy/patient-package/${currentPatient}`).then(p => {
    if (!p || patient?.id !== currentPatient || !root.isConnected) return;
    const box = document.createElement('div');
    box.dataset.packageSummary = '';
    box.className = 'mt-3 rounded border border-outline-variant p-3 text-body-sm';
    box.innerHTML = `<strong>${esc(p.package_name)}</strong> · ${esc(p.claim_no)} · ${esc(p.status)}<br>
      Package ${money(p.package_price,2)} · Running charges ${money(p.billed,2)} · Medicines / consumables ${money(p.pharmacy_billed,2)} · Patient exclusions ${money(p.patient_exclusions,2)}<br>
      <strong>Includes:</strong> ${esc(p.inclusions || 'See approved package service lines')}<br><strong>Excludes:</strong> ${esc(p.exclusions || 'Review case exclusions')}<br>
      ${(p.usage||[]).map(u=>`<div>${esc(u.name)}: ${u.used} / ${u.allowance} used${u.excess?` · ${u.excess} above allowance`:''}</div>`).join('')}
      <span>${esc(p.coverage_note||'Charges remain itemised until discharge. Coverage and co-pay follow the approved case; this display does not approve unlisted items.')}</span>
      <a class="ml-2 underline" href="${p.source==='hospital'?'/packages':'/insurance'}">${p.source==='hospital'?'Review hospital package':'Review payer case'}</a>`;
    el.after(box);
  }).catch(()=>{});
  el.innerHTML = `${esc(patient.name)} · ${esc(patient.uhid)}${patient.outstanding > 0 ? ` · outstanding ${money(patient.outstanding)}` : ''}
    ${adm ? `<span class="ml-3 inline-flex items-center gap-1.5 font-medium text-info">Inpatient ${esc(adm.ip_no)} — IP store · charged to this admission</span>` : '<span class="ml-2 pill-neutral">OP store · pharmacy bill</span>'}`;
}
