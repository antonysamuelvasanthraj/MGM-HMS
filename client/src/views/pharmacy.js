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
  kpi, spinner, emptyState, debounce, printDocument, todayISO,
} from './_kit.js';
import { printReceipt } from './op-registration.js';
import { showBillingContext } from '../billing-context.js';

const cart = [];
// Inpatients are served from the IP store and charged to their running IP bill;
// everyone else from the OP store on a pharmacy bill.
let ipMode = null;               // { admission_id, ip_no } while serving an inpatient
const store = () => (ipMode ? 'IP' : 'OP');
let patient = null;
let prescriptionId = null;
let rxCache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  cart.length = 0; patient = null; prescriptionId = null; ipMode = null;

  async function load() {
    const d = await api.get('/pharmacy/dispense/queue');
    rxCache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Prescriptions waiting', value: d.stats.pending, icon: 'prescriptions', tone: d.stats.pending ? 'warning' : 'success', sub: 'From today’s consultations' },
      { label: 'Sales today', value: d.stats.sales_today, icon: 'point_of_sale', sub: 'Counter bills raised' },
      { label: 'Revenue today', value: money(d.stats.revenue_today), icon: 'payments', tone: 'success', sub: 'Pharmacy counter' },
      { label: 'Cart', value: cart.length, icon: 'shopping_cart', tone: 'info', sub: money(cartTotal()) },
    ].map(kpi).join('');
    renderRows($('[data-rx]', root), d.rows, rxRow, { empty: 'No prescriptions waiting to be dispensed.' });
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
    patient = await api.get(`/patients/${rx.patient_id}`);
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

function layout() {
  return page({
    wide: true,
    eyebrow: `${eyebrow('Pharmacy counter', 'local_pharmacy')} ${liveChip()}`,
    title: 'Pharmacy Sales & Dispensing',
    subtitle: 'Batches are picked first-expiry-first. Dispensing posts the bill, the stock movement and the receipt together.',
    actions: `<a href="/stock" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">inventory_2</span> Stock</a>
      <a href="/medicines" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">pill</span> Medicine master</a>`,
    body: `
      ${kpiRow([], 4)}
      <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_460px] gap-5 items-start">
        <div class="space-y-4">
          ${card({
            title: 'Counter', subtitle: 'Search a medicine and add it to the bill',
            body: `<div class="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-3">
              <div>
                <label class="field-label">Medicine</label>
                <div class="relative">
                  <input class="field" data-msearch placeholder="Name, generic or code — type at least 2 letters" autocomplete="off">
                  <div class="hidden absolute left-0 right-0 top-11 z-30 card shadow-md max-h-80 overflow-y-auto" data-mlist></div>
                </div>
              </div>
              <div><label class="field-label">Patient</label><div data-picker></div></div>
            </div>
            <div class="mt-2 text-body-sm text-on-surface-variant" data-pat-name>No patient selected — a walk-in sale still needs a patient record.</div>`,
          })}
          ${tableCard({
            title: 'Prescriptions waiting', maxHeight: '38vh', id: 'rxq',
            columns: [{ label: 'Patient' }, { label: 'Doctor' }, { label: 'Items' }, { label: 'Status' }, { label: 'Raised' }, { label: '', width: '120px' }],
          }).replace('data-rows', 'data-rx')}
        </div>

        <section class="card 2xl:sticky 2xl:top-[88px]">
          <header class="px-4 h-12 flex items-center justify-between border-b border-outline-variant">
            <h2 class="panel-title">Bill</h2>
            <button class="btn-ghost btn-xs" data-clear><span class="material-symbols-outlined text-[15px]">delete_sweep</span> Clear</button>
          </header>
          <div class="max-h-[46vh] overflow-y-auto" data-cart></div>
          <div class="p-4 border-t border-outline-variant space-y-2.5">
            <div class="flex items-center justify-between text-body-lg">
              <span class="text-on-surface-variant">Sub-total</span><span class="font-data-mono" data-sub>₹0</span></div>
            <div class="flex items-center justify-between text-body-lg">
              <label class="text-on-surface-variant" for="ph-disc">Discount</label>
              <input id="ph-disc" class="field field-sm w-28 text-right" type="number" value="0" data-disc></div>
            <div class="flex items-center justify-between pt-2 border-t border-outline-variant">
              <span class="font-title-md text-title-md">Bill value</span>
              <span class="font-headline-lg text-headline-lg text-primary" data-total>₹0</span></div>
            <div class="grid grid-cols-3 gap-2 pt-1" data-modes>
              ${[['cash', 'Cash', 'payments'], ['upi', 'UPI', 'qr_code_2'], ['card', 'Card', 'credit_card']]
                .map(([v, l, i], idx) => `<button type="button" data-v="${v}"
                  class="flex items-center justify-center gap-1.5 h-9 rounded border ${idx === 0 ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}">
                  <span class="material-symbols-outlined text-[16px]">${i}</span>
                  <span class="font-label-md text-label-md">${l}</span></button>`).join('')}
            </div>
            <p class="text-body-sm text-info hidden" data-collection-note></p>
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
  patientPicker($('[data-picker]', root), async (p) => {
    patient = p;
    ipMode = null;
    try {
      const adm = (await api.get(`/ipd/admissions${qs({ q: p.uhid })}`)).rows.find((a) => a.patient_id === p.id && a.status !== 'discharged');
      if (adm) ipMode = { admission_id: adm.id, ip_no: adm.ip_no };
    } catch {}
    if (cart.length && ipMode) { cart.length = 0; paintCart(root); toast('Cart cleared — this patient is admitted, so medicines come from the IP store', 'info'); }
    showPatient(root);
  }, { placeholder: 'UHID, name or mobile' });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-ipmode]')) return;
    if (cart.length) { cart.length = 0; paintCart(root); }
    ipMode = e.target.checked ? JSON.parse(e.target.dataset.ipmode) : null;
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
          <span class="font-label-lg text-label-lg truncate">${esc(m.name)}</span>
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
  input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 180));
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

  list.addEventListener('mousedown', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const batches = await api.get(`/pharmacy/batches?medicine_id=${b.dataset.m}&location=${store()}`);
    if (!batches.length) { toast(`No sellable batch in the ${store()} store`, 'warning'); return; }
    const m = await api.get(`/pharmacy/medicines/${b.dataset.m}`);
    const batch = batches[0];
    cart.push({ medicine_id: m.id, name: m.name, qty: 1, rate: batch.mrp, batch_id: batch.id,
      batch_no: batch.batch_no, expiry: batch.expiry, stock: batch.qty, batches });
    input.value = ''; list.classList.add('hidden');
    paintCart(root); input.focus();
  });

  // cart interactions
  bind(root, 'input', '[data-qty]', (e, el) => {
    const i = +el.closest('[data-line]').dataset.line;
    cart[i].qty = Math.max(1, +el.value || 1);
    paintTotals(root);
  });
  bind(root, 'change', '[data-batch]', (e, el) => {
    const i = +el.closest('[data-line]').dataset.line;
    const b = cart[i].batches?.find((x) => x.id === +el.value);
    if (b) { cart[i].batch_id = b.id; cart[i].batch_no = b.batch_no; cart[i].expiry = b.expiry; cart[i].rate = b.mrp; }
    paintCart(root);
  });
  bind(root, 'click', '[data-rm]', (e, el) => { cart.splice(+el.closest('[data-line]').dataset.line, 1); paintCart(root); });
  $('[data-clear]', root).onclick = () => { cart.length = 0; prescriptionId = null; paintCart(root); };
  $('[data-disc]', root).addEventListener('input', () => paintTotals(root));

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
    if (!cart.length) { toast('The bill is empty', 'warning'); return; }
    const actionButton = ev.currentTarget;
    busy(actionButton, true, 'Dispensing');
    try {
      const r = await api.post('/pharmacy/dispense', {
        patient_id: patient.id, prescription_id: prescriptionId, location: store(), admission_id: ipMode?.admission_id,
        discount: +$('[data-disc]', root).value || 0,
        mode, collect: false,
        items: cart.map((i) => ({ medicine_id: i.medicine_id, qty: i.qty, rate: i.rate, batch_id: i.batch_id, prescription_item_id: i.prescription_item_id })),
      });
      toast(`${r.bill.bill_no} · ${money(r.bill.total, 2)} dispensed`, 'success', {
        title: 'Sale complete',
        action: r.payment ? { label: 'Print receipt', run: async () => printReceipt(await api.get(`/payments/${r.payment.id}/receipt`)) } : {label:'Print bill',run:()=>printBill(r.bill.id)},
      });
      if (ipMode) toast(`Charged to IP bill ${r.bill.bill_no} — settled at discharge by reception`, 'info');
      else if (r.bill.payer_type === 'self' && r.bill.balance > 0) collectBill(r.bill.id, reload, { mode: mode === 'card' ? 'debit_card' : mode }); // keep the counter's chosen mode
      else if (r.bill.deferred_collection) toast('Recorded against the patient and payer case / approved due. Collect only the patient share; payer settlement is recorded when received.', 'info');
      ipMode = null;
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

function paintCart(root) {
  const box = $('[data-cart]', root);
  box.innerHTML = cart.length ? cart.map((i, idx) => `
    <div class="p-3 border-b border-outline-variant/70" data-line="${idx}">
      <div class="flex items-start justify-between gap-2">
        <span class="font-label-lg text-label-lg min-w-0 truncate">${esc(i.name)}</span>
        <button class="btn-ghost btn-xs shrink-0" data-rm><span class="material-symbols-outlined text-[15px]">close</span></button>
      </div>
      <div class="grid grid-cols-[70px_1fr_90px] gap-2 mt-1.5 items-center">
        <input class="field field-sm text-center" type="number" min="1" value="${i.qty}" data-qty>
        ${i.batches?.length > 1
          ? `<select class="field field-sm" data-batch>${i.batches.map((b) => `<option value="${b.id}" ${b.id === i.batch_id ? 'selected' : ''}>
              ${esc(b.batch_no)} · exp ${fmtDate(b.expiry)} · ${b.qty} left</option>`).join('')}</select>`
          : `<span class="text-body-sm text-on-surface-variant truncate">Batch ${esc(i.batch_no)}${i.expiry ? ` · exp ${fmtDate(i.expiry)}` : ''}</span>`}
        <span class="font-data-mono text-body-md text-right">${money(i.qty * i.rate, 2)}</span>
      </div>
      <div class="text-label-sm text-on-surface-variant mt-1">@ ${money(i.rate, 2)} each${i.stock !== undefined ? ` · ${i.stock} in this batch` : ''}</div>
    </div>`).join('')
    : `<div class="p-6 text-center text-body-md text-on-surface-variant">
        <span class="material-symbols-outlined text-[30px] opacity-40 block mb-1">shopping_cart</span>
        Scan or search a medicine, or load a prescription.</div>`;
  paintTotals(root);
}

function paintTotals(root) {
  const sub = cartTotal();
  const disc = +$('[data-disc]', root)?.value || 0;
  $('[data-sub]', root).textContent = money(sub, 2);
  $('[data-total]', root).textContent = money(Math.max(0, sub - disc), 2);
}

/** Patient line under the counter, with the IP / OP store switch for admitted patients. */
function showPatient(root, adm = ipMode) {
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
    ${adm ? `<label class="ml-3 inline-flex items-center gap-1.5 font-medium text-info"><input type="checkbox" data-ipmode='${esc(JSON.stringify(adm))}' ${ipMode ? 'checked' : ''}>
      Inpatient ${esc(adm.ip_no)} — issue from IP store to the IP bill</label>` : '<span class="ml-2 pill-neutral">OP store · pharmacy bill</span>'}`;
}
