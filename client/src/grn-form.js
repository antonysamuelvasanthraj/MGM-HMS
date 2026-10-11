/**
 * Goods received note — entered the way the supplier's bill reads:
 * header (received date, invoice date, supplier, invoice no., invoice amount),
 * one row per product (received packs, free packs, units per pack, dealer price,
 * MRP, disc %, tax %, tax amount, line total, expiry MM/YYYY, batch), and the
 * bill footer (total tax, total discount, total, delivery charge, credit note,
 * payable). Everything lands in Central, converted to dispensing units.
 * HSN and GST class belong to the medicine master; the GRN only shows them.
 */
import { api, modal, esc, money, toast, busy, apiError, confirmDialog } from './views/_kit.js';
import { scheduleTag } from './rx-editor.js';
import { compositionEditor, wireComposition, compositionText } from './composition.js';

const UNITS = ['box', 'carton', 'strip', 'bottle', 'vial', 'ampoule', 'sachet', 'tube', 'pack', 'piece', 'tablet', 'capsule', 'ml', 'gram'];
const PACKS = ['strip', 'bottle', 'vial', 'ampoule', 'sachet', 'tube', 'blister', 'piece', 'box', 'pack'];
const TAX = [0, 5, 12, 18, 28];
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// one product row: label above each box on phones, a single row on wide screens
const C = (k, label, type = 'number', extra = '', cls = '') => `<div class="grn-cell ${cls}"><label class="field-label">${label}</label><input class="field field-sm !h-9 ${type === 'number' ? 'text-right font-data-mono' : ''}" data-key="${k}" type="${type}" ${type === 'number' ? 'step="0.01" min="0"' : ''} ${extra}></div>`;
const O = (k, label, value) => `<div class="grn-cell"><label class="field-label">${label}</label><output class="grn-out" data-out="${k}">${value}</output></div>`;

export async function newGRN(after) {
  const [suppliers, med, masters] = await Promise.all([api.get('/pharmacy/suppliers'), api.get('/pharmacy/medicines?limit=1000'), api.get('/pharmacy/product-masters')]);
  const meds = med.rows;
  const list = (kind) => [...new Set([...masters.filter((m) => m.kind === kind).map((m) => m.name), ...meds.map((m) => m[kind]).filter(Boolean)])];
  modal({
    title: 'Create GRN', size: 'full',
    subtitle: 'Enter the supplier bill as printed. Stock is received into Central and converted to dispensing units.',
    body: `<datalist id="dl-brand">${list('brand').map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <datalist id="dl-manufacturer">${list('manufacturer').map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <datalist id="dl-generic">${list('generic').map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <form data-form class="grn-form">
      <section class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <div><label class="field-label">Received date</label><input class="field" name="received_date" type="date" required max="${todayStr()}" value="${todayStr()}"></div>
        <div><label class="field-label">Invoice date</label><input class="field" name="invoice_date" type="date" required max="${todayStr()}" value="${todayStr()}"></div>
        <div class="col-span-2"><label class="field-label">Supplier *</label><div class="flex gap-1"><select class="field" name="supplier_id" required><option value="">Select supplier…</option>${suppliers.map((s) => `<option value="${s.id}" data-state="${esc(s.state || '')}" data-credit="${s.credit_days ?? ''}">${esc(s.name)}</option>`).join('')}</select>
          <button type="button" class="btn-secondary !px-2" data-master="supplier" title="Add supplier" aria-label="Add supplier">+</button></div></div>
        <div><label class="field-label">Invoice number *</label><input class="field" name="invoice_no" required autocomplete="off"></div>
        <div><label class="field-label">Invoice amount</label><input class="field text-right font-data-mono" name="invoice_amount" type="number" step="0.01" min="0" placeholder="as printed"></div>
        <div><label class="field-label">Payment due</label><input class="field" name="due_date" type="date"></div>
        <div><label class="field-label">GST</label><select class="field" name="gst_mode"><option value="intra">Same state — CGST + SGST</option><option value="inter">Other state — IGST</option></select></div>
      </section>
      <div class="flex flex-wrap items-center justify-between gap-2 mt-4 mb-2">
        <h3 class="font-title-md text-title-md">Received items</h3>
        <div class="flex flex-wrap gap-1">${['medicine', 'brand', 'manufacturer', 'generic'].map((k) => `<button type="button" class="btn-ghost btn-sm" data-master="${k}"><span class="material-symbols-outlined text-[16px]">add</span>New ${k}</button>`).join('')}</div>
      </div>
      <div class="grn-head" aria-hidden="true"><span>#</span><span>Product</span><span>Rec. qty (packs)</span><span>Free (packs)</span><span>Pack qty</span><span>DP</span><span>MRP</span><span>Disc %</span><span>Tax %</span><span>Tax amt</span><span>Total</span><span>Expiry</span><span>Batch no.</span><span></span></div>
      <div data-lines></div>
      <button class="btn-secondary mt-2" type="button" data-add><span class="material-symbols-outlined text-[16px]">add</span>Add item <span class="text-label-sm text-on-surface-variant">(Alt+A)</span></button>
      <section class="grn-foot mt-4">
        <div class="space-y-2">
          <div data-tally class="text-body-md" aria-live="polite"></div>
          <label class="flex items-center gap-2 text-body-md"><input type="checkbox" name="round_off" value="1"> Round the payable to the nearest rupee</label>
          <div><label class="field-label">Remarks</label><input class="field" name="remarks" placeholder="Optional"></div>
        </div>
        <dl class="grn-sum" data-total></dl>
      </section></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-secondary" data-save-next>Create & next invoice</button><button class="btn-primary" data-save>Create GRN</button>',
    onMount(root, close) {
      const form = root.querySelector('form'), host = root.querySelector('[data-lines]');
      const inter = () => form.gst_mode.value === 'inter';
      const footer = { delivery: 0, credit: 0 };

      function addLine() {
        const el = document.createElement('div');
        el.className = 'grn-row';
        el.innerHTML = `<span class="grn-no" data-no></span>
          <div class="grn-cell grn-product"><label class="field-label">Product</label><select class="field field-sm !h-9" data-key="medicine_id" required><option value="">Select brand / item…</option>${meds.map((m) => `<option value="${m.id}">${esc(m.name)}${m.narcotic ? ' — NARCOTIC' : m.schedule && m.schedule !== 'OTC' ? ` — Sch ${esc(m.schedule)}` : ''}</option>`).join('')}</select></div>
          ${C('qty', 'Rec. qty (packs)', 'number', 'required step="1" min="1"')}${C('free_qty', 'Free (packs)', 'number', 'value="0" step="1"')}
          ${C('units_per_pack', 'Pack qty', 'number', 'required value="1" step="1" min="1" title="Dispensing units in one pack, e.g. 15 tablets in a strip"')}
          ${C('rate', 'DP', 'number', 'required title="Dealer price per pack, before tax"')}${C('mrp', 'MRP', 'number', 'required title="MRP per pack, as printed"')}
          ${C('discount_pct', 'Disc %', 'number', 'value="0" max="100"')}
          <div class="grn-cell"><label class="field-label">Tax %</label><select class="field field-sm !h-9" data-key="gst_pct">${TAX.map((t) => `<option value="${t}">${t}</option>`).join('')}</select></div>
          ${O('tax', 'Tax amt', '—')}${O('total', 'Total', '—')}
          ${C('expiry', 'Expiry (MM/YYYY)', 'month', 'required')}${C('batch_no', 'Batch no.', 'text', 'required autocomplete="off"')}
          <button class="btn-ghost !h-9 !w-8 !px-0 grn-remove" type="button" data-remove aria-label="Remove item" title="Remove item"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          <div class="grn-info">
            <div data-title class="text-body-sm text-on-surface-variant">Choose the product to see HSN, composition and last purchase price.</div>
            <div data-calc class="text-body-sm font-data-mono"></div>
            <div data-price-history class="text-body-sm" aria-live="polite"></div>
            <details class="grn-details"><summary>More: pack type, manufacturer, rack, mfg date, selling price</summary>
              <div class="grn-product-grid mt-2">
                <div><label class="field-label">Pack type</label><select class="field field-sm !h-9" data-key="package_type">${PACKS.map((o) => `<option>${o}</option>`).join('')}</select></div>
                <div><label class="field-label">Dispensing unit</label><select class="field field-sm !h-9" data-key="dispensing_unit">${UNITS.map((o) => `<option>${o}</option>`).join('')}</select></div>
                <div><label class="field-label">Manufacturer</label><input class="field field-sm !h-9" data-key="manufacturer" list="dl-manufacturer" autocomplete="off"></div>
                <div><label class="field-label">Rack</label><input class="field field-sm !h-9" data-key="rack"></div>
                <div><label class="field-label">Mfg date</label><input class="field field-sm !h-9" data-key="manufacturing_date" type="date"></div>
                <div><label class="field-label">Selling price / pack</label><input class="field field-sm !h-9 text-right" data-key="selling_price" type="number" step="0.01" min="0" placeholder="= MRP"></div>
              </div></details>
          </div>`;
        host.append(el);
        renumber();
        el.querySelector('[data-remove]').onclick = () => { if (host.children.length > 1) { el.remove(); renumber(); totals(); } };
        const pick = () => {
          const m = meds.find((x) => x.id === +el.querySelector('[data-key="medicine_id"]').value);
          el.priceHistory = null;
          if (!m) { totals(); return; }
          el.querySelector('[data-price-history]').textContent = 'Loading previous prices…';
          api.get(`/pharmacy/price-history/${m.id}`).then((history) => {
            if (+el.querySelector('[data-key="medicine_id"]').value !== m.id) return;
            el.priceHistory = history; totals();
          }).catch(() => { el.querySelector('[data-price-history]').textContent = 'Previous prices could not be loaded.'; });
          const set = (k, v) => { const i = el.querySelector(`[data-key="${k}"]`); if (i && v !== null && v !== undefined && v !== '') i.value = v; };
          // a pack holds pack_size × units_per_pack dispensing units in the master's terms
          set('units_per_pack', (m.pack_size || 1) * (m.units_per_pack || 1));
          ['manufacturer', 'rack', 'dispensing_unit', 'package_type'].forEach((k) => set(k, m[k]));
          set('gst_pct', TAX.includes(+m.gst_pct) ? +m.gst_pct : 12);
          el.querySelector('[data-title]').innerHTML = `<b class="text-on-surface">${esc(m.name)}</b> ${scheduleTag(m) || '<span class="pill-neutral">OTC</span>'}
            · HSN <b class="font-data-mono text-on-surface">${esc(m.hsn || '—')}</b> <span class="text-label-sm">(from medicine master)</span>
            ${compositionText(m) ? ` · ${esc(compositionText(m))}` : ''}${m.form ? ` · ${esc(m.form)}` : ''}
            ${m.narcotic || ['X', 'H1'].includes(m.schedule) ? '<span class="text-danger"> — record in the scheduled-drug register</span>' : ''}`;
          totals();
        };
        el.querySelector('[data-key="medicine_id"]').onchange = pick;
        pick();
        return el;
      }
      const renumber = () => [...host.children].forEach((el, i) => { el.querySelector('[data-no]').textContent = i + 1; });

      const read = () => [...host.children].map((el) => Object.fromEntries([...el.querySelectorAll('[data-key]')].map((i) => [i.dataset.key,
        i.type === 'number' || ['medicine_id', 'gst_pct'].includes(i.dataset.key) ? (i.value === '' ? undefined : +i.value) : i.value.trim() || undefined])));

      function lineMoney(i) {
        const gross = r2((i.qty || 0) * (i.rate || 0));
        const disc = r2(gross * (i.discount_pct || 0) / 100);
        const taxable = r2(gross - disc);
        const pct = i.gst_pct || 0;
        const cg = inter() ? 0 : r2(taxable * pct / 200), sg = inter() ? 0 : r2(taxable * pct / 200), ig = inter() ? r2(taxable * pct / 100) : 0;
        const units = i.medicine_id ? ((i.qty || 0) + (i.free_qty || 0)) * (i.units_per_pack || 1) : 0;
        return { gross, disc, taxable, cg, sg, ig, tax: r2(cg + sg + ig), net: r2(taxable + cg + sg + ig), units };
      }

      function totals() {
        const t = { disc: 0, taxable: 0, cg: 0, sg: 0, ig: 0, tax: 0, net: 0 };
        const rows = read(), lines = rows.map(lineMoney);
        lines.forEach((m) => { for (const k of Object.keys(t)) t[k] = r2(t[k] + m[k]); });
        const adjust = footer.delivery - footer.credit;
        rows.forEach((i, n) => {
          const m = lines[n], el = host.children[n];
          el.querySelector('[data-out="tax"]').textContent = m.taxable ? money(m.tax, 2) : '—';
          el.querySelector('[data-out="total"]').textContent = m.taxable ? money(m.net, 2) : '—';
          // freight and credit note spread by value, as the server does
          const cost = m.units ? Math.max(0, m.taxable + (t.taxable ? adjust * m.taxable / t.taxable : 0)) / m.units : 0;
          const unit = esc(i.dispensing_unit || 'unit');
          el.querySelector('[data-calc]').textContent = i.medicine_id && m.units
            ? `Stock in ${m.units.toLocaleString('en-IN')} ${unit}${m.units === 1 ? '' : 's'} · cost / ${unit} ${money(cost, 4)} · MRP / ${unit} ${money((i.mrp || 0) / (i.units_per_pack || 1), 2)}`
            : '';
          if (el.priceHistory) {
            const old = el.priceHistory[0];
            el.querySelector('[data-price-history]').innerHTML = old
              ? (() => {
                const oldUnits = (old.pack_size || 1) * (old.units_per_pack || 1);
                const ch = [['Cost', old.unit_cost, cost], ['MRP', old.mrp / oldUnits, (i.mrp || 0) / (i.units_per_pack || 1)]]
                  .filter(([, a, b]) => b && Math.abs(b - a) > 0.0001);
                return `Last bought on ${esc(old.grn_no)} from ${esc(old.supplier_name)} at ${money(old.unit_cost, 4)} / ${unit}, MRP ${money(old.mrp / oldUnits, 2)} / ${unit}.
                  ${ch.length ? `<b class="text-warning">${ch.map(([l, a, b]) => `${l} ${b > a ? '↑ up' : '↓ down'} ${money(a, 2)} → ${money(b, 2)}`).join(' · ')} — management is told when received.</b>` : '<span class="text-success">No price change.</span>'}`;
              })()
              : 'First purchase of this product — no earlier price.';
          }
        });
        const payableExact = r2(t.net + adjust);
        const payable = form.round_off?.checked ? Math.round(payableExact) : payableExact;
        const round = r2(payable - payableExact);
        const row = (l, v, cls = '') => `<div class="${cls}"><dt>${l}</dt><dd class="font-data-mono">${v}</dd></div>`;
        root.querySelector('[data-total]').innerHTML = [
          row('Taxable value', money(t.taxable, 2)),
          row('Total discount', money(t.disc, 2)),
          row(inter() ? 'Total tax (IGST)' : `Total tax (CGST ${money(t.cg, 2)} + SGST ${money(t.sg, 2)})`, money(t.tax, 2)),
          row('Total amount', money(t.net, 2), 'font-semibold'),
          `<div><dt><label for="grn-del">Delivery charge</label></dt><dd><input id="grn-del" class="field field-sm !h-8 w-28 text-right font-data-mono" type="number" step="0.01" min="0" data-foot="delivery" value="${footer.delivery || ''}" placeholder="0.00"></dd></div>`,
          `<div><dt><label for="grn-cn">Credit note amount</label></dt><dd><input id="grn-cn" class="field field-sm !h-8 w-28 text-right font-data-mono" type="number" step="0.01" min="0" data-foot="credit" value="${footer.credit || ''}" placeholder="0.00"></dd></div>`,
          round ? row('Round off', money(round, 2)) : '',
          row('Payable amount', money(payable, 2), 'grn-payable'),
        ].join('');
        root.querySelectorAll('[data-foot]').forEach((x) => {
          x.oninput = () => { footer[x.dataset.foot] = Math.max(0, +x.value || 0); const pos = x.selectionStart; totals(); const again = root.querySelector(`[data-foot="${x.dataset.foot}"]`); again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* number inputs */ } };
        });
        // tally against the amount printed on the supplier's bill
        const printed = form.invoice_amount.value === '' ? null : +form.invoice_amount.value;
        const diff = printed === null ? null : r2(payable - printed);
        root.querySelector('[data-tally]').innerHTML = printed === null
          ? '<span class="text-on-surface-variant">Enter the invoice amount printed on the bill to tally it.</span>'
          : Math.abs(diff) < 1 ? `<span class="pill-success pill-dot">Tallies with the invoice amount ${money(printed, 2)}</span>`
            : `<span class="pill-warning pill-dot">Does not tally — entered ${money(payable, 2)}, bill says ${money(printed, 2)} (difference ${money(Math.abs(diff), 2)} ${diff > 0 ? 'more' : 'less'})</span>`;
        return { payable, printed, diff };
      }

      form.gst_mode.onchange = totals;
      form.round_off.onchange = totals;
      form.invoice_amount.oninput = totals;
      form.supplier_id.onchange = () => {
        const o = form.supplier_id.selectedOptions[0];
        if (o?.dataset.state) form.gst_mode.value = /telangana/i.test(o.dataset.state) ? 'intra' : 'inter';
        if (o?.dataset.credit && form.invoice_date.value && !form.due_date.value) {
          const d = new Date(`${form.invoice_date.value}T00:00:00`); d.setDate(d.getDate() + +o.dataset.credit);
          form.due_date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        totals();
      };
      root.querySelector('[data-add]').onclick = () => addLine().querySelector('select').focus();
      root.addEventListener('keydown', (e) => { if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); addLine().querySelector('select').focus(); } });
      host.oninput = totals;
      host.onchange = totals;
      addLine();

      root.querySelectorAll('[data-master]').forEach((b) => (b.onclick = () => masterForm(b.dataset.master, (kind, row) => {
        if (kind === 'supplier') { form.supplier_id.add(new Option(row.name, row.id)); form.supplier_id.value = row.id; }
        else if (kind === 'medicine') { meds.push(row); host.querySelectorAll('[data-key="medicine_id"]').forEach((s) => s.add(new Option(row.name, row.id))); const last = host.lastElementChild?.querySelector('[data-key="medicine_id"]'); if (last) { last.value = row.id; last.onchange(); } }
        else { root.querySelector(`#dl-${kind}`).insertAdjacentHTML('beforeend', `<option value="${esc(row.name)}">`); const last = host.lastElementChild?.querySelector(`[data-key="${kind}"]`); if (last) last.value = row.name; }
      })));

      const save = async (e) => {
        form.classList.add('was-validated');
        if (!form.reportValidity()) return;
        const btn = e.currentTarget;
        const tally = totals();
        if (tally.printed !== null && Math.abs(tally.diff) >= 1) {
          const ok = await confirmDialog({ title: 'Invoice amount does not tally', message: `The items add up to <b>${money(tally.payable, 2)}</b> but the bill says <b>${money(tally.printed, 2)}</b>. Check quantities, rates and tax. Save anyway?`, confirmLabel: 'Save anyway', tone: 'danger' });
          if (!ok) return;
        }
        busy(btn, true);
        try {
          // a pack is the purchase unit: pack_size 1, pack qty = dispensing units per pack
          const items = read().map((i) => ({ ...i, pack_size: 1, purchase_unit: i.package_type || 'pack', selling_price: i.selling_price ?? i.mrp }));
          const fd = Object.fromEntries(new FormData(form));
          const r = await api.post('/pharmacy/purchases', {
            ...fd, supplier_id: +fd.supplier_id, round_off: !!form.round_off.checked, items,
            delivery_charge: footer.delivery, credit_note: footer.credit,
            invoice_amount: fd.invoice_amount === '' ? undefined : +fd.invoice_amount,
          });
          close(); toast(`${r.grn_no} received into Central — payable ${money(r.total, 2)}`, 'success'); after?.();
          if (btn.hasAttribute('data-save-next')) await newGRN(after);
        } catch (err) { apiError(err, 'GRN not saved'); busy(btn, false); }
      };
      root.querySelector('[data-save]').onclick = save;
      root.querySelector('[data-save-next]').onclick = save;
    },
  });
}

/** Quick master creation inside the GRN. Duplicates are refused by the server. */
function masterForm(kind, done) {
  const body = kind === 'supplier'
    ? `<div class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="field-label">Name</label><input class="field" data-f="name" required></div>
       <div><label class="field-label">GSTIN</label><input class="field" data-f="gstin"></div><div><label class="field-label">State</label><input class="field" data-f="state" value="Telangana"></div>
       <div><label class="field-label">Mobile</label><input class="field" data-f="mobile"></div><div><label class="field-label">Drug licence</label><input class="field" data-f="dl_no"></div>
       <div><label class="field-label">Credit days</label><input class="field" type="number" data-f="credit_days" value="30"></div></div>`
    : kind === 'medicine'
      ? `<div class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="field-label">Name as sold (brand + strength)</label><input class="field" data-f="name" required placeholder="e.g. Augmentin 625 Duo"></div>
         <div><label class="field-label">Brand</label><input class="field" data-f="brand" list="dl-brand" placeholder="e.g. Augmentin"></div>
         <div><label class="field-label">Form</label><select class="field" data-f="form">${['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'ointment', 'cream', 'drops', 'inhaler', 'powder', 'consumable'].map((o) => `<option>${o}</option>`).join('')}</select></div>
         <div class="col-span-2">${compositionEditor({}, 'dl-generic')}</div>
         <div><label class="field-label">Dispensing unit</label><select class="field" data-f="dispensing_unit">${UNITS.map((o) => `<option>${o}</option>`).join('')}</select></div>
         <div><label class="field-label">Units per pack</label><input class="field" type="number" data-f="units_per_pack" value="10"></div>
         <div><label class="field-label">GST %</label><input class="field" type="number" data-f="gst_pct" value="12"></div><div><label class="field-label">HSN</label><input class="field" data-f="hsn" value="3004"></div>
         <div><label class="field-label">Reorder level</label><input class="field" type="number" data-f="reorder_level" value="20"></div>
         <div><label class="field-label">Category / schedule</label><select class="field" data-f="schedule">${[['H', 'Schedule H'], ['H1', 'Schedule H1'], ['X', 'Schedule X'], ['G', 'Schedule G'], ['OTC', 'OTC']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
         <label class="col-span-2 flex items-center gap-2 text-body-md"><input type="checkbox" data-f="narcotic" value="1"> Narcotic / psychotropic (NDPS)</label></div>`
      : `<label class="field-label">Name</label><input class="field" data-f="name" required>`;
  modal({
    stack: true, title: `New ${kind}`, size: kind === 'medicine' || kind === 'supplier' ? 'md' : 'sm', body,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-create>Save</button>',
    onMount(el, close) {
      const readComp = kind === 'medicine' ? wireComposition(el, 'dl-generic') : null;
      el.querySelector('[data-create]').onclick = async (e) => {
        const btn = e.currentTarget;
        const v = Object.fromEntries([...el.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.type === 'checkbox' ? i.checked : i.type === 'number' ? +i.value : i.value.trim()]));
        if (!v.name) { toast('Name is required', 'warning'); return; }
        if (readComp) {
          v.composition = readComp();
          if (!v.composition.length && v.form !== 'consumable') { toast('Add at least one ingredient', 'warning'); return; }
        }
        busy(btn, true);
        try {
          const url = kind === 'supplier' ? '/pharmacy/suppliers' : kind === 'medicine' ? '/pharmacy/medicines' : '/pharmacy/product-masters';
          const row = await api.post(url, kind === 'medicine' ? { ...v, kind: v.form === 'consumable' ? 'consumable' : 'medicine' } : kind === 'supplier' ? v : { kind, name: v.name });
          close(); toast(`${kind[0].toUpperCase()}${kind.slice(1)} added — your GRN is kept`, 'success'); done(kind, row);
        } catch (err) {
          apiError(err, err?.payload?.error === 'same_composition_exists' ? `Same brand, form and composition already exists as “${err.payload.existing}”`
            : err?.payload?.error?.endsWith('_exists') ? `That ${kind} already exists` : `Could not add ${kind}`);
          busy(btn, false);
        }
      };
    },
  });
}
