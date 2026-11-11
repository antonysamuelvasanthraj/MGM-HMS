/**
 * Goods received note — entered the way the supplier's bill reads:
 * header (received date, invoice date, supplier, invoice no., invoice amount),
 * one row per product (received packs, free packs, units per pack, dealer price,
 * MRP, disc %, tax %, tax amount, line total, expiry MM/YYYY, batch), and the
 * bill footer (total tax, total discount, total, delivery charge, credit note,
 * payable). Everything lands in Central, converted to dispensing units.
 * HSN and GST class belong to the medicine master; the GRN only shows them.
 */
import { api, modal, esc, money, toast, busy, apiError, confirmDialog, state } from './views/_kit.js';
import { scheduleTag } from './rx-editor.js';
import { compositionEditor, wireComposition, compositionText } from './composition.js';
import { invoiceLines } from './invoice-lines.js';
import { matchInvoiceMedicine, invoiceDate, scannedSelectionValues } from './invoice-review.js';

const UNITS = ['box', 'carton', 'strip', 'bottle', 'vial', 'ampoule', 'sachet', 'tube', 'pack', 'piece', 'tablet', 'capsule', 'ml', 'gram'];
const PACKS = ['strip', 'bottle', 'vial', 'ampoule', 'sachet', 'tube', 'blister', 'piece', 'box', 'pack'];
const TAX = [0, 5, 12, 18, 28];
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// one product row: label above each box on phones, a single row on wide screens
const C = (k, label, type = 'number', extra = '', cls = '') => `<div class="grn-cell ${cls}"><label class="field-label">${label}</label><input class="field field-sm !h-9 ${type === 'number' ? 'text-right font-data-mono' : ''}" data-key="${k}" type="${type}" ${type === 'number' ? 'step="0.01" min="0"' : ''} ${extra}></div>`;
const O = (k, label, value) => `<div class="grn-cell"><label class="field-label">${label}</label><output class="grn-out" data-out="${k}">${value}</output></div>`;

export async function newGRN(after, existing = null, scanned = null) {
  const [suppliers, med, masters] = await Promise.all([api.get('/pharmacy/suppliers'), api.get('/pharmacy/medicines?limit=1000'), api.get('/pharmacy/product-masters')]);
  const meds = med.rows;
  const list = (kind) => [...new Set([...masters.filter((m) => m.kind === kind).map((m) => m.name), ...meds.map((m) => m[kind]).filter(Boolean)])];
  modal({
    title: existing ? `Correct ${existing.grn_no}` : scanned ? 'Review scanned invoice as GRN' : 'Create GRN', size: 'full',
    subtitle: existing ? 'A replacement receipt will be created and the original retained. Stock must still be untouched in Central and the receipt unpaid; otherwise use Returns.' : 'Enter the supplier bill as printed. Stock is received into Central and converted to dispensing units.',
    body: `${scanned ? `<details class="card p-3" open><summary>Original scan and recognized invoice text — check every field</summary>${scanned.image ? `<img src="${esc(scanned.image)}" alt="Scanned supplier invoice" style="max-width:100%;max-height:400px;object-fit:contain">` : ''}<pre class="whitespace-pre-wrap p-3">${esc(scanned.text)}</pre><p>Only explicitly labelled header values are transferred. Enter and verify all medicine rows, quantities, batch, expiry and GST against this source before creating a receipt.</p></details>` : ''}<datalist id="dl-brand">${list('brand').map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
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
      <details class="card p-3 mt-4" open><summary class="font-semibold">GRN items &amp; costing — paid and free packs</summary><p class="text-body-sm my-2">Added items are listed here and can be changed here. Pack follows the product type. Landing cost spreads cost over paid + free packs; inventory ACP includes allocated delivery/credit adjustments. Margin is before GST.</p><div class="overflow-auto" data-cost-preview></div></details>
      <section class="grn-foot mt-4">
        <div class="space-y-2">
          <div data-tally class="text-body-md" aria-live="polite"></div>
          <label class="flex items-center gap-2 text-body-md"><input type="checkbox" name="round_off" value="1"> Round the payable to the nearest rupee</label>
          <div><label class="field-label">Remarks</label><input class="field" name="remarks" placeholder="Optional"></div>
          ${existing ? '<div><label class="field-label">Correction reason *</label><textarea class="field" name="reason" required></textarea></div>' : ''}
        </div>
        <dl class="grn-sum" data-total></dl>
      </section></form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>${existing ? '' : '<button class="btn-secondary" data-save-next>Create & next invoice</button>'}<button class="btn-primary" data-save>${existing ? 'Save correction' : 'Create GRN'}</button>`,
    onMount(root, close) {
      const form = root.querySelector('form'), host = root.querySelector('[data-lines]');
      const inter = () => form.gst_mode.value === 'inter';
      const footer = { delivery: 0, credit: 0 };
      // a new GRN has one entry line; Add item moves it into the costing table below, where it stays editable
      const single = !existing && !scanned;
      const active = () => host.querySelector('.grn-row:not([data-committed])');

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
                ${C('discount', 'Additional discount amount', 'number', 'value="0"')}
                ${C('cgst_pct','CGST % override','number','max="100" placeholder="Auto"')}
                ${C('sgst_pct','SGST % override','number','max="100" placeholder="Auto"')}
                ${C('igst_pct','IGST % override','number','max="100" placeholder="Auto"')}
              </div></details>
          </div>`;
        host.append(el);
        renumber();
        el.querySelector('[data-remove]').onclick = () => {
          if (single) { el.remove(); if (!active()) addLine(); }
          else if (host.children.length > 1) el.remove();
          else return;
          renumber(); totals();
        };
        const pick = () => {
          const invoiceValues = scannedSelectionValues(el);
          const m = meds.find((x) => x.id === +el.querySelector('[data-key="medicine_id"]').value);
          el.priceHistory = null;
          if (!m) { totals(); return; }
          el.querySelector('[data-create-scanned-medicine]')?.remove();
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
          Object.entries(invoiceValues).forEach(([key,value])=>set(key,value));
          el.querySelector('[data-pack-warning]')?.remove();
          const pack=+el.querySelector('[data-key="units_per_pack"]').value, masterPack=(m.pack_size || 1)*(m.units_per_pack || 1);
          if(el.scannedInvoice && pack!==masterPack) {
            const warning=document.createElement('p');warning.dataset.packWarning='';warning.className='text-warning';
            warning.textContent=`Invoice pack: ${pack} units; medicine master: ${masterPack}. Invoice value retained. Confirm the actual pack before saving.`;
            el.querySelector('.grn-info').append(warning);
          }
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
        const disc = r2(gross * (i.discount_pct || 0) / 100 + (i.discount || 0));
        const taxable = r2(gross - disc);
        const pct = i.gst_pct || 0;
        const cg = inter() ? 0 : r2(taxable * (i.cgst_pct ?? pct/2) / 100), sg = inter() ? 0 : r2(taxable * (i.sgst_pct ?? pct/2) / 100), ig = inter() ? r2(taxable * (i.igst_pct ?? pct) / 100) : 0;
        const units = i.medicine_id ? ((i.qty || 0) + (i.free_qty || 0)) * (i.units_per_pack || 1) : 0;
        return { gross, disc, taxable, cg, sg, ig, tax: r2(cg + sg + ig), net: r2(taxable + cg + sg + ig), units };
      }

      function totals() {
        const t = { disc: 0, taxable: 0, cg: 0, sg: 0, ig: 0, tax: 0, net: 0 };
        const rows = read(), lines = rows.map(lineMoney);
        lines.forEach((m) => { for (const k of Object.keys(t)) t[k] = r2(t[k] + m[k]); });
        const adjust = footer.delivery - footer.credit;
        const previewHeaders = ['SL No','Item Name','Pack','HSN Code','Mfg','Batch No','Expiry','Qty (Packs)','Free (Packs)','Rate / Pack (excl. GST)','Disc %','MRP / Pack','GST %','Amount (Taxable)','GST Amount','Total (incl. GST)','Total Packs Received','Cost / Pack (incl. GST, no free)','Landing Cost / Pack (incl. GST & free)','Patient Price / Pack','Patient Price / Unit','Margin / Pack','Margin %','Stock Register ACP / Pack (excl. GST)'];
        // new GRN: the table lists the lines added so far, and the main figures are edited right here
        const ed = (idx, key, val, type = 'number', w = 74) => ({ html: `<input class="field field-sm !h-8 ${type === 'number' ? 'text-right' : ''}" style="width:${w}px" type="${type}" ${type === 'number' ? 'step="any" min="0"' : ''} data-pv="${idx}" data-k="${key}" value="${esc(val ?? '')}">` });
        const shown = rows.map((i, idx) => ({ i, idx })).filter((x) => x.i.medicine_id && (!single || host.children[x.idx].dataset.committed));
        root.querySelector('[data-cost-preview]').innerHTML = shown.length || !single ? `<table class="tbl"><thead><tr>${previewHeaders.map(h => `<th>${esc(h)}</th>`).join('')}${single ? '<th></th>' : ''}</tr></thead><tbody>${shown.map(({ i, idx }, n) => {
          const m = lineMoney(i), medicine = meds.find(x => x.id === +i.medicine_id) || {};
          const packs = (+i.qty || 0) + (+i.free_qty || 0), upp = +i.units_per_pack || 1;
          const allocated = t.taxable ? adjust * m.taxable / t.taxable : 0;
          const landing = packs ? m.net / packs : 0;
          const costEx = packs ? Math.max(0, m.taxable + allocated) / packs : 0;
          const priceEx = (+i.mrp || 0) / (1 + (+i.gst_pct || 0) / 100);
          const margin = priceEx - costEx;
          const cells = [n + 1, i.brand || medicine.name, single ? { html: `${esc(i.package_type || 'pack')} of ${ed(idx, 'units_per_pack', i.units_per_pack, 'number', 56).html}` } : `${i.package_type || i.purchase_unit || 'pack'} (${upp} units)`, i.hsn || medicine.hsn, i.manufacturer || medicine.manufacturer,
            single ? ed(idx, 'batch_no', i.batch_no, 'text', 100) : i.batch_no, single ? ed(idx, 'expiry', i.expiry, 'month', 130) : i.expiry,
            single ? ed(idx, 'qty', i.qty) : i.qty || 0, single ? ed(idx, 'free_qty', i.free_qty ?? 0) : i.free_qty || 0, single ? ed(idx, 'rate', i.rate) : money(i.rate || 0, 2), single ? ed(idx, 'discount_pct', i.discount_pct ?? 0, 'number', 60) : i.discount_pct || 0, single ? ed(idx, 'mrp', i.mrp) : money(i.mrp || 0, 2), i.gst_pct || 0, money(m.taxable, 2), money(m.tax, 2), money(m.net, 2), packs, money(i.qty ? m.net / i.qty : 0, 2), money(landing, 2), money(i.mrp || 0, 2), money((i.mrp || 0) / upp, 2), money(margin, 2), priceEx ? `${r2(margin / priceEx * 100)}%` : '—', money(costEx, 4)];
          return `<tr>${cells.map(c => `<td>${c && c.html !== undefined ? c.html : esc(c ?? '')}</td>`).join('')}${single ? `<td><button type="button" class="btn-ghost btn-xs" data-pv-remove="${idx}" title="Remove this item" aria-label="Remove this item"><span class="material-symbols-outlined text-[16px]">delete</span></button></td>` : ''}</tr>`;
        }).join('')}</tbody></table>` : '<p class="text-body-md text-on-surface-variant p-3">Fill the line above and press Add item. Added items list here, where you can still change quantity, rate, MRP, batch and expiry.</p>';
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
        const hospitalState = String(state.meta?.settings?.hospital_state || '').trim().toLowerCase();
        if (o?.dataset.state && hospitalState) form.gst_mode.value = o.dataset.state.trim().toLowerCase() === hospitalState ? 'intra' : 'inter';
        if (o?.dataset.credit && form.invoice_date.value && !form.due_date.value) {
          const d = new Date(`${form.invoice_date.value}T00:00:00`); d.setDate(d.getDate() + +o.dataset.credit);
          form.due_date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        totals();
      };
      function commitAndNew() {
        const cur = active();
        if (single && cur) {
          const bad = [...cur.querySelectorAll('input,select')].find((x) => !x.checkValidity());
          if (bad) { bad.reportValidity(); return; }
          cur.dataset.committed = '1'; cur.style.display = 'none';
        }
        const el = addLine(); el.querySelector('select').focus(); totals();
      }
      root.querySelector('[data-add]').onclick = commitAndNew;
      root.addEventListener('keydown', (e) => { if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); commitAndNew(); } });
      const preview = root.querySelector('[data-cost-preview]');
      preview.oninput = (e) => {
        const f = e.target.closest('[data-pv]'); if (!f) return;
        const row = host.children[+f.dataset.pv], box = row?.querySelector(`[data-key="${f.dataset.k}"]`); if (!box) return;
        box.value = f.value; const at = f.selectionStart; totals();
        const again = preview.querySelector(`[data-pv="${f.dataset.pv}"][data-k="${f.dataset.k}"]`); again?.focus(); try { again?.setSelectionRange(at, at); } catch { /* number / month inputs */ }
      };
      preview.onclick = (e) => { const b = e.target.closest('[data-pv-remove]'); if (!b) return; host.children[+b.dataset.pvRemove]?.remove(); if (!active()) addLine(); renumber(); totals(); };
      host.oninput = totals;
      host.onchange = totals;
      if (existing) {
        for (const key of ['supplier_id','invoice_no','invoice_date','invoice_amount','due_date','gst_mode','remarks']) form.elements.namedItem(key).value = existing[key] ?? '';
        form.received_date.value = String(existing.received_at).slice(0,10);
        form.round_off.checked = !!existing.round_off;
        footer.delivery = existing.delivery_charge || 0; footer.credit = existing.credit_note || 0;
        for (const item of existing.items) {
          const el = addLine(), pick = el.querySelector('[data-key="medicine_id"]'); pick.value = item.medicine_id; pick.onchange();
          const values = { ...item, units_per_pack: (item.pack_size || 1)*(item.units_per_pack || 1), expiry: item.expiry.slice(0,7),
            discount: r2(item.qty*item.rate*(1-(item.discount_pct||0)/100)-item.amount) };
          el.original = item;
          el.querySelectorAll('[data-key]').forEach(input => {
            const value = values[input.dataset.key];
            if (value !== null && value !== undefined) {
              if (input.tagName === 'SELECT' && ![...input.options].some(o=>o.value===String(value))) input.add(new Option(String(value),String(value)));
              input.value = value;
            }
          });
        }
        totals();
      } else {
        addLine();
        if (scanned) {
          const detected = scanned.items?.length ? scanned.items.map(item => {
            const matches = matchInvoiceMedicine(item.name,meds);
            return {...item, medicine_id:matches.length === 1 ? matches[0].id : null};
          }) : invoiceLines(scanned.text, meds);
          if (detected.length) {
            host.innerHTML = '';
            for (const item of detected) {
              const el = addLine(), pick = el.querySelector('[data-key="medicine_id"]');
              if (item.medicine_id) { pick.value = item.medicine_id; pick.onchange(); }
              for (const key of ['qty','rate','mrp','batch_no','expiry']) el.querySelector(`[data-key="${key}"]`).value = item[key] ?? '';
              if (item.units_per_pack) el.querySelector('[data-key="units_per_pack"]').value = item.units_per_pack;
              for (const key of ['free_qty','discount_pct','gst_pct']) {
                if (item[key] !== undefined) el.querySelector(`[data-key="${key}"]`).value = item[key];
              }
              el.scannedInvoice = true;
              if(item.medicine_id) pick.onchange();
              const source = document.createElement('p'); source.className = 'text-body-sm text-warning';
              source.textContent = `Invoice source: ${item.source}${item.quantity_unit ? ` · Quantity unit: ${item.quantity_unit} — verify pack conversion` : ''}. Check every field; blank values need review.`;
              if(item.warnings?.length) source.textContent+=' '+item.warnings.join(' · ');
              el.querySelector('.grn-info').prepend(source);
              if (!item.medicine_id) {
                pick.options[0].textContent = `${item.name} — NEW medicine (complete details below)`;
                const create = document.createElement('button'); create.type = 'button'; create.className = 'btn-secondary btn-sm';
                create.dataset.createScannedMedicine='';
                create.textContent = `New medicine: ${item.name} — review & create`;
                create.onclick = () => masterForm('medicine', (_kind, medicine) => {
                  meds.push(medicine);
                  host.querySelectorAll('[data-key="medicine_id"]').forEach(select => select.add(new Option(medicine.name, medicine.id)));
                  const retained = Object.fromEntries([...el.querySelectorAll('[data-key]')].filter(input => input.dataset.key !== 'medicine_id').map(input => [input.dataset.key,input.value]));
                  pick.value = medicine.id; pick.onchange();
                  for (const key of ['qty','rate','mrp','batch_no','expiry','free_qty','discount_pct','gst_pct']) el.querySelector(`[data-key="${key}"]`).value = retained[key];
                  if (item.units_per_pack) el.querySelector('[data-key="units_per_pack"]').value = item.units_per_pack;
                  create.remove(); totals();
                }, { name: item.name, ...(item.hsn ? {hsn:item.hsn} : {}), ...(item.gst_pct !== undefined ? {gst_pct:item.gst_pct} : {}), ...(item.units_per_pack ? {units_per_pack:item.units_per_pack} : {}) });
                el.querySelector('.grn-info').prepend(create);
              }
            }
          } else {
            const warning = document.createElement('p'); warning.className = 'text-warning p-3';
            warning.textContent = 'No exact medicine names or codes were recognized. The invoice needs column mapping or manual medicine selection; no similar product was substituted.';
            host.before(warning);
          }
          const invoice = scanned.text.match(/invoice\s*(?:no\.?|number)\s*[:#|\-]\s*([A-Za-z0-9/._-]+)/i);
          const amount = scanned.text.match(/(?:net\s+amount|grand\s+total)\s*[:=]\s*(?:Rs\.?|₹)?\s*([\d,]+\.\d{2})/i);
          if (invoice) form.invoice_no.value = invoice[1];
          if (amount) form.invoice_amount.value = amount[1].replaceAll(',', '');
          const gstins = scanned.text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/g) || [];
          const matches = suppliers.filter(s => s.gstin && gstins.includes(s.gstin.toUpperCase()));
          if (matches.length === 1) form.supplier_id.value = matches[0].id;
          else {
            const supplierLine = scanned.text.split(/\r?\n/).map(s=>s.trim()).find(s=>/\b(?:pvt\.?\s*ltd\.?|private\s+limited|medical(?:s)?|pharma(?:ceuticals)?|distributors?)\b/i.test(s) && !/terms|conditions|\bfor\b|product|invoice\s+type/i.test(s));
            const proposed = (supplierLine || '').replace(/^[^a-z]+/i,'').replace(/\s+\d+\s*$/,'').trim();
            if (proposed) {
              form.supplier_id.options[0].textContent = `${proposed} — NEW supplier`;
              const createSupplier = document.createElement('button'); createSupplier.type='button';createSupplier.className='btn-secondary mt-2';
              createSupplier.textContent=`Create supplier: ${proposed}`;
              createSupplier.onclick=()=>masterForm('supplier',(_kind,supplier)=>{
                form.supplier_id.add(new Option(supplier.name,supplier.id));form.supplier_id.value=supplier.id;createSupplier.remove();
              },{name:proposed,gstin:gstins[0] || ''});
              form.supplier_id.parentElement.parentElement.append(createSupplier);
            }
          }
          form.invoice_date.value = invoiceDate(scanned.text);
          totals();
        }
      }

      root.querySelectorAll('[data-master]').forEach((b) => (b.onclick = () => masterForm(b.dataset.master, (kind, row) => {
        if (kind === 'supplier') { form.supplier_id.add(new Option(row.name, row.id)); form.supplier_id.value = row.id; }
        else if (kind === 'medicine') { meds.push(row); host.querySelectorAll('[data-key="medicine_id"]').forEach((s) => s.add(new Option(row.name, row.id))); const last = host.lastElementChild?.querySelector('[data-key="medicine_id"]'); if (last) { last.value = row.id; last.onchange(); } }
        else { root.querySelector(`#dl-${kind}`).insertAdjacentHTML('beforeend', `<option value="${esc(row.name)}">`); const last = host.lastElementChild?.querySelector(`[data-key="${kind}"]`); if (last) last.value = row.name; }
      })));

      const save = async (e) => {
        const spare = active();
        if (single && spare && !spare.querySelector('[data-key="medicine_id"]').value && host.children.length > 1) { spare.remove(); renumber(); totals(); }
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
          const items = read().map((i,n) => {
            const original = host.children[n].original;
            return { ...i, pack_size: 1, purchase_unit: original?.purchase_unit || i.package_type || 'pack', selling_price: i.selling_price ?? i.mrp,
              ...(original && i.expiry === original.expiry.slice(0,7) ? {expiry:original.expiry} : {}) };
          });
          const fd = Object.fromEntries(new FormData(form));
          const r = await api.post(existing ? `/pharmacy/purchases/${existing.id}/correct` : '/pharmacy/purchases', {
            ...fd, supplier_id: +fd.supplier_id, round_off: !!form.round_off.checked, items,
            delivery_charge: footer.delivery, credit_note: footer.credit,
            invoice_amount: fd.invoice_amount === '' ? undefined : +fd.invoice_amount,
          });
          close(); toast(`${r.grn_no} received into Central — payable ${money(r.total, 2)}`, 'success'); after?.();
          if (btn.hasAttribute('data-save-next')) await newGRN(after);
        } catch (err) {
          const messages = {
            grn_has_payments_use_return_workflow: 'This GRN has supplier payments. Use the supplier return and new receipt workflow.',
            grn_stock_already_used_use_return_workflow: 'Stock from this GRN has been moved, used or combined with another receipt. Use the return workflow to correct it.',
            grn_already_corrected: 'This GRN has already been replaced. Open the replacement receipt.',
            inventory_approval_required: 'The store in-charge must make this correction.',
          };
          if (messages[err.message]) toast(messages[err.message], 'warning'); else apiError(err, 'GRN not saved');
          busy(btn, false);
        }
      };
      root.querySelector('[data-save]').onclick = save;
      if (root.querySelector('[data-save-next]')) root.querySelector('[data-save-next]').onclick = save;
    },
  });
}

/** Quick master creation inside the GRN. Duplicates are refused by the server. */
function masterForm(kind, done, defaults = {}) {
  const body = kind === 'supplier'
    ? `<div class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="field-label">Name</label><input class="field" data-f="name" required></div>
       <div><label class="field-label">GSTIN</label><input class="field" data-f="gstin"></div><div><label class="field-label">State</label><input class="field" data-f="state" value="${esc(state.meta?.settings?.hospital_state || '')}"></div>
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
      for (const [key, value] of Object.entries(defaults)) {
        const input = el.querySelector(`[data-f="${key}"]`); if (input) input.value = value;
      }
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
