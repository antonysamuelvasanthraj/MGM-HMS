/**
 * Pharmacy registers laid out the way the hospital's paper stock books are kept:
 * batch-wise stock, product master, company summary, sales with GST and profit,
 * and GRN line costing. Quantities in the database are dispensing units; packs are
 * derived from units_per_pack. Batch purchase_rate is the cost per unit before GST.
 */
import { all } from './db.js';

const r2 = (v) => Math.round((+v || 0) * 100) / 100;
const r1 = (v) => Math.round((+v || 0) * 10) / 10;
const col = (key, label, type = 'text') => ({ key, label, type });
const money = (k, l) => col(k, l, 'money');
const num = (k, l) => col(k, l, 'number');
const date = (k, l) => col(k, l, 'date');
const kpi = (label, value, type = 'money') => ({ label, value, type });
const sum = (rows, k) => r2(rows.reduce((s, r) => s + (+r[k] || 0), 0));
const P = 'reports.pharmacy';
const pct = (part, whole) => (whole ? r1((part / whole) * 100) : 0);
const daysTo = (d) => (d ? Math.round((new Date(`${d}T00:00:00`) - new Date(new Date().toDateString())) / 86400000) : null);
const expiryStatus = (days) => (days === null ? '—' : days < 0 ? 'Expired' : days <= 30 ? 'Expires ≤ 30 days' : days <= 90 ? 'Expires ≤ 90 days' : 'OK');
const like = (v) => `%${v}%`;

function medFilter(q, clauses, args) {
  if (q.medicine) { clauses.push('(m.name LIKE ? OR m.generic LIKE ? OR m.code LIKE ?)'); args.push(like(q.medicine), like(q.medicine), like(q.medicine)); }
  if (q.manufacturer) { clauses.push('m.manufacturer LIKE ?'); args.push(like(q.manufacturer)); }
}

/** One row per in-stock batch, with the pack/unit, price, cost, margin and value columns. */
function batchRows(q) {
  const clauses = ['b.qty > 0', 'm.active = 1'], args = [];
  medFilter(q, clauses, args);
  return all(`SELECT b.id, b.batch_no, b.expiry, b.qty, b.mrp, b.selling_price, b.purchase_rate, b.received_at, b.location,
      m.id medicine_id, m.code, m.name, m.generic, m.schedule, m.manufacturer, m.hsn m_hsn, m.gst_pct m_gst, coalesce(nullif(m.units_per_pack,0),1) upp,
      pi.hsn grn_hsn, pi.gst_pct grn_gst, s.name supplier, pu.invoice_no, pu.invoice_date, pu.received_at grn_date
    FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
    LEFT JOIN purchase_items pi ON pi.id = (SELECT max(x.id) FROM purchase_items x WHERE x.batch_id=b.id)
    LEFT JOIN purchases pu ON pu.id = coalesce(b.purchase_id, pi.purchase_id)
    LEFT JOIN suppliers s ON s.id = coalesce(b.supplier_id, pu.supplier_id)
    WHERE ${clauses.join(' AND ')} ORDER BY m.name, b.expiry`, ...args).map((r) => {
    const upp = r.upp, gst = +(r.m_gst ?? r.grn_gst ?? 0);
    const hsn = r.m_hsn || r.grn_hsn || '';
    const mrpPack = r2(r.mrp * upp);
    const sellPack = r2((r.selling_price || r.mrp) * upp);
    const sellExcl = r2(sellPack / (1 + gst / 100));
    const costExcl = r2(r.purchase_rate * upp);
    const costIncl = r2(costExcl * (1 + gst / 100));
    const days = daysTo(r.expiry);
    const sellValue = r2((r.selling_price || r.mrp) * r.qty);
    const costValue = r2(r.purchase_rate * (1 + gst / 100) * r.qty);
    const remarks = [days !== null && days < 0 ? 'Remove from sale' : '', !hsn ? 'HSN missing' : '', sellExcl < costExcl ? 'Selling below cost' : ''].filter(Boolean).join('; ');
    return {
      ...r, hsn, gst, upp, mrp_pack: mrpPack, rate_unit: r2(r.selling_price || r.mrp), disc_pct: mrpPack ? r1(((mrpPack - sellPack) / mrpPack) * 100) : 0,
      sell_pack: sellPack, sell_excl: sellExcl, cost_incl: costIncl, cost_excl: costExcl, cost_unit: r2(r.purchase_rate * (1 + gst / 100)),
      margin_pack: r2(sellExcl - costExcl), margin_pct: pct(sellExcl - costExcl, sellExcl),
      packs: r2(r.qty / upp), days, expiry_status: expiryStatus(days),
      sell_value: sellValue, gst_in_sell: r2(sellValue - sellValue / (1 + gst / 100)), cost_value: costValue,
      profit: r2(sellValue / (1 + gst / 100) - r.purchase_rate * r.qty),
      hsn_source: r.m_hsn ? 'Product master' : r.grn_hsn ? 'GRN' : 'Missing', remarks,
      purchase_date: (r.grn_date || r.received_at || '').slice(0, 10),
    };
  });
}

export const PHARMACY_REGISTERS = [
  { id: 'pharmacy_stock_batches', group: 'Pharmacy', title: 'Pharmacy stock — batch-wise with price, cost and margin', perm: P, filters: ['medicine', 'manufacturer'],
    run: (q) => {
      const rows = batchRows(q).map((r, i) => ({ ...r, sl: i + 1 }));
      return {
        subtitle: 'Every batch with stock, across all stores. Stock value at selling price includes GST; expected profit is selling value before GST less cost before GST.',
        kpis: [kpi('Batches', rows.length, 'number'), kpi('Stock @ selling price', sum(rows, 'sell_value')), kpi('Stock @ cost', sum(rows, 'cost_value')),
          kpi('Expected profit', sum(rows, 'profit')), kpi('Expired @ cost', sum(rows.filter((r) => r.days < 0), 'cost_value'))],
        columns: [num('sl', 'SL No'), col('code', 'Product code'), col('hsn', 'HSN code'), col('name', 'Product name'), col('schedule', 'Schedule'), col('manufacturer', 'Mfg / Company'),
          num('upp', 'Pack (units per pack)'), col('batch_no', 'Batch no'), date('expiry', 'Expiry date'), col('expiry_status', 'Expiry status'), col('location', 'Store'),
          num('qty', 'Stock qty (units)'), num('packs', 'Stock qty (packs)'), money('mrp_pack', 'MRP / pack (patient price)'), money('rate_unit', 'Rate / unit (patient)'),
          num('disc_pct', 'Discount %'), money('sell_pack', 'Selling price / pack (after disc.)'), num('gst', 'GST %'), money('sell_excl', 'Selling price / pack (excl. GST)'),
          money('cost_incl', 'Cost price / pack (incl. GST)'), money('cost_excl', 'Cost price / pack (excl. GST)'), money('cost_unit', 'Cost / unit'),
          money('margin_pack', 'Margin / pack'), num('margin_pct', 'Margin %'), money('sell_value', 'Amount (stock value @ selling price)'), money('gst_in_sell', 'GST amount (in selling value)'),
          money('cost_value', 'Stock value @ cost'), money('profit', 'Expected profit'), col('supplier', 'Supplier (last purchase)'), col('invoice_no', 'Purchase inv no'),
          date('purchase_date', 'Purchase date'), col('hsn_source', 'HSN source'), col('remarks', 'Remarks')],
        rows, total: ['qty', 'packs', 'sell_value', 'gst_in_sell', 'cost_value', 'profit'],
      };
    } },

  { id: 'pharmacy_product_master', group: 'Pharmacy', title: 'Pharmacy product master — stock, value, margin and nearest expiry', perm: P, filters: ['medicine', 'manufacturer'],
    run: (q) => {
      const clauses = ['m.active = 1'], args = [];
      medFilter(q, clauses, args);
      const meds = all(`SELECT m.id, m.code, m.name, m.schedule, m.manufacturer, m.hsn, m.gst_pct, m.reorder_level, coalesce(nullif(m.units_per_pack,0),1) upp,
          (SELECT pi.hsn FROM purchase_items pi WHERE pi.medicine_id=m.id AND coalesce(pi.hsn,'')<>'' ORDER BY pi.id DESC LIMIT 1) grn_hsn
        FROM medicines m WHERE ${clauses.join(' AND ')} ORDER BY m.name`, ...args);
      const byMed = new Map();
      for (const b of batchRows(q)) { if (!byMed.has(b.medicine_id)) byMed.set(b.medicine_id, []); byMed.get(b.medicine_id).push(b); }
      const rows = meds.map((m, i) => {
        const bs = byMed.get(m.id) || [];
        const live = bs.filter((b) => b.days === null || b.days >= 0);
        const qty = bs.reduce((s, b) => s + b.qty, 0);
        const latest = bs.slice().sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))[0];
        const gst = +(m.gst_pct || 0);
        const mrpPack = latest ? latest.mrp_pack : 0;
        const costIncl = latest ? latest.cost_incl : 0;
        const costExcl = latest ? latest.cost_excl : 0;
        const sellExcl = latest ? latest.sell_excl : 0;
        const nearest = live.map((b) => b.expiry).filter(Boolean).sort()[0] || '';
        const oldest = bs.map((b) => b.received_at).filter(Boolean).sort()[0];
        const status = !qty ? 'Out of stock' : bs.every((b) => b.days !== null && b.days < 0) ? 'Expired only' : m.reorder_level && qty <= m.reorder_level ? 'Low — reorder' : 'In stock';
        return {
          sl: i + 1, code: m.code, hsn: m.hsn || m.grn_hsn || '', name: m.name, schedule: m.schedule, manufacturer: m.manufacturer, upp: m.upp,
          batches: bs.length, qty, packs: r2(qty / m.upp), mrp_pack: mrpPack, rate_unit: latest ? latest.rate_unit : 0, cost_incl: costIncl, gst, cost_excl: costExcl,
          margin_pack: r2(sellExcl - costExcl), margin_pct: pct(sellExcl - costExcl, sellExcl),
          sell_value: sum(bs, 'sell_value'), cost_value: sum(bs, 'cost_value'), profit: sum(bs, 'profit'), nearest_expiry: nearest, status,
          suppliers: [...new Set(bs.map((b) => b.supplier).filter(Boolean))].join(', '),
          age: oldest ? Math.max(0, -daysTo(String(oldest).slice(0, 10))) : null,
          hsn_source: m.hsn ? 'Product master' : m.grn_hsn ? 'GRN' : 'Missing',
        };
      });
      return {
        subtitle: 'Prices and cost are from the most recently received batch; values add up every batch in stock.',
        kpis: [kpi('Products', rows.length, 'number'), kpi('In stock', rows.filter((r) => r.qty > 0).length, 'number'), kpi('Stock @ cost', sum(rows, 'cost_value')),
          kpi('Stock @ selling price', sum(rows, 'sell_value')), kpi('Expected profit', sum(rows, 'profit'))],
        columns: [num('sl', 'SL No'), col('code', 'Product code'), col('hsn', 'HSN code'), col('name', 'Product name'), col('schedule', 'Schedule'), col('manufacturer', 'Mfg / Company'),
          num('upp', 'Pack (units per pack)'), num('batches', 'No. of batches'), num('qty', 'Stock qty (units)'), num('packs', 'Stock qty (packs)'),
          money('mrp_pack', 'MRP / pack (patient price)'), money('rate_unit', 'Rate / unit (patient)'), money('cost_incl', 'Cost price / pack (incl. GST)'), num('gst', 'GST %'),
          money('cost_excl', 'Cost price / pack (excl. GST)'), money('margin_pack', 'Margin / pack'), num('margin_pct', 'Margin %'),
          money('sell_value', 'Stock value @ selling price'), money('cost_value', 'Stock value @ cost'), money('profit', 'Expected profit'),
          date('nearest_expiry', 'Nearest expiry (in-stock batch)'), col('status', 'Stock status'), col('suppliers', 'Suppliers'), num('age', 'Stock age (days)'), col('hsn_source', 'HSN source')],
        rows, total: ['batches', 'qty', 'sell_value', 'cost_value', 'profit'],
      };
    } },

  { id: 'pharmacy_company_summary', group: 'Pharmacy', title: 'Pharmacy stock by company — value, profit and expired stock', perm: P, filters: ['manufacturer'],
    run: (q) => {
      const clauses = ['m.active = 1'], args = [];
      medFilter({ manufacturer: q.manufacturer }, clauses, args);
      const counts = new Map(all(`SELECT coalesce(nullif(m.manufacturer,''),'—') k, count(*) n FROM medicines m WHERE ${clauses.join(' AND ')} GROUP BY k`, ...args).map((r) => [r.k, r.n]));
      const g = new Map();
      for (const b of batchRows({ manufacturer: q.manufacturer })) {
        const k = b.manufacturer || '—';
        if (!g.has(k)) g.set(k, { meds: new Set(), batches: 0, cost: 0, sell: 0, profit: 0, sellEx: 0, expired: 0 });
        const x = g.get(k);
        x.meds.add(b.medicine_id); x.batches++; x.cost += b.cost_value; x.sell += b.sell_value; x.profit += b.profit;
        x.sellEx += b.sell_value - b.gst_in_sell; if (b.days !== null && b.days < 0) x.expired += b.cost_value;
      }
      const rows = [...counts.keys()].map((k) => {
        const x = g.get(k) || { meds: new Set(), batches: 0, cost: 0, sell: 0, profit: 0, sellEx: 0, expired: 0 };
        return { manufacturer: k, products: counts.get(k), in_stock: x.meds.size, batches: x.batches, cost_value: r2(x.cost), sell_value: r2(x.sell),
          profit: r2(x.profit), margin_pct: pct(x.profit, x.sellEx), expired: r2(x.expired) };
      }).sort((a, b) => b.cost_value - a.cost_value).map((r, i) => ({ sl: i + 1, ...r }));
      return {
        kpis: [kpi('Companies', rows.length, 'number'), kpi('Stock @ cost', sum(rows, 'cost_value')), kpi('Stock @ selling price', sum(rows, 'sell_value')),
          kpi('Expected profit', sum(rows, 'profit')), kpi('Expired @ cost', sum(rows, 'expired'))],
        columns: [num('sl', 'SL No'), col('manufacturer', 'Mfg / Company'), num('products', 'No. of products'), num('in_stock', 'Products in stock'), num('batches', 'No. of batches'),
          money('cost_value', 'Stock value @ cost'), money('sell_value', 'Stock value @ selling price'), money('profit', 'Expected profit'), num('margin_pct', 'Margin %'),
          money('expired', 'Expired stock @ cost')],
        rows, total: ['products', 'in_stock', 'batches', 'cost_value', 'sell_value', 'profit', 'expired'],
        chart: { type: 'hbar', x: 'manufacturer', series: [{ key: 'cost_value', label: 'Stock @ cost' }], top: 12 },
      };
    } },

  { id: 'pharmacy_sales_gst_profit', group: 'Pharmacy', title: 'Pharmacy sales — HSN, CGST/SGST, cost and profit per line', perm: P, filters: ['range', 'patient', 'medicine', 'manufacturer'],
    run: (q) => {
      const clauses = ["i.revenue_head='PHARMACY'", "b.status<>'cancelled'", 'date(coalesce(i.created_at,b.created_at)) BETWEEN ? AND ?'], args = [q.from, q.to];
      if (q.bill_id) { clauses.push('b.id=?'); args.push(Number(q.bill_id)); }
      if (q.patient) { clauses.push('(p.name LIKE ? OR p.uhid LIKE ?)'); args.push(like(q.patient), like(q.patient)); }
      medFilter(q, clauses, args);
      const rows = all(`SELECT date(coalesce(i.created_at,b.created_at)) d, b.bill_no, p.uhid, p.name patient, coalesce(m.hsn, (SELECT pi.hsn FROM purchase_items pi WHERE pi.batch_id=bt.id LIMIT 1)) hsn,
          i.description item, m.schedule, m.manufacturer, m.code, bt.batch_no, bt.expiry, bt.purchase_rate, i.qty, i.rate, i.amount, i.gst_pct, i.unit_cost
        FROM bill_items i JOIN bills b ON b.id=i.bill_id JOIN patients p ON p.id=b.patient_id
        LEFT JOIN medicine_batches bt ON bt.id=i.batch_id LEFT JOIN medicines m ON m.id=bt.medicine_id
        WHERE ${clauses.join(' AND ')} ORDER BY i.id`, ...args).map((r, n) => {
        const gst = +(r.gst_pct || 0);
        const taxable = r2(r.amount / (1 + gst / 100));
        const tax = r2(r.amount - taxable);
        const unitCost = r2((r.unit_cost ?? r.purchase_rate ?? 0) * (1 + gst / 100));
        const costAmount = r2(unitCost * r.qty);
        const profit = r2(taxable - costAmount / (1 + gst / 100));
        return { sl: n + 1, ...r, gst_pct: gst, taxable, cgst: r2(tax / 2), sgst: r2(tax - r2(tax / 2)), unit_cost: unitCost, cost_amount: costAmount, profit, profit_pct: pct(profit, taxable) };
      });
      return {
        subtitle: 'Sales returns show as negative lines. Profit is taxable value less cost before GST.',
        kpis: [kpi('Lines', rows.length, 'number'), kpi('Sales', sum(rows, 'amount')), kpi('Taxable value', sum(rows, 'taxable')), kpi('GST', r2(sum(rows, 'cgst') + sum(rows, 'sgst'))), kpi('Profit', sum(rows, 'profit'))],
        columns: [num('sl', 'SL No'), date('d', 'Date'), col('bill_no', 'Bill'), col('patient', 'Patient'), col('uhid', 'UHID'), col('hsn', 'HSN code'), col('item', 'Product name (as on bill)'),
          col('schedule', 'Sch'), col('manufacturer', 'Mfg / Company'), col('batch_no', 'Batch no'), date('expiry', 'Expiry'), num('qty', 'Qty'), money('rate', 'Rate (₹ / unit)'),
          money('amount', 'Amount'), num('gst_pct', 'GST %'), money('taxable', 'Taxable value'), money('cgst', 'CGST'), money('sgst', 'SGST'), col('code', 'Product code'),
          money('unit_cost', 'Cost / unit (actual, incl. GST)'), money('cost_amount', 'Cost amount'), money('profit', 'Profit'), num('profit_pct', 'Profit %')],
        rows, total: ['qty', 'amount', 'taxable', 'cgst', 'sgst', 'cost_amount', 'profit'],
      };
    } },

  { id: 'grn_line_costing', group: 'Pharmacy', title: 'GRN line register — free goods, landing cost and margin', perm: P, filters: ['range', 'medicine', 'manufacturer'],
    run: (q) => {
      const clauses = ['date(pu.received_at) BETWEEN ? AND ?'], args = [q.from, q.to];
      medFilter(q, clauses, args);
      const rows = all(`SELECT pu.grn_no, pu.invoice_no, date(pu.received_at) d, s.name supplier, coalesce(pi.brand, m.name) item, pi.package_type, pi.purchase_unit,
          coalesce(nullif(pi.units_per_pack,0), nullif(m.units_per_pack,0), 1) upp, coalesce(pi.hsn, m.hsn) hsn, coalesce(pi.manufacturer, m.manufacturer) manufacturer,
          pi.batch_no, pi.expiry, pi.qty, coalesce(pi.free_qty,0) free_qty, pi.rate, coalesce(pi.discount_pct,0) discount_pct, pi.mrp, pi.gst_pct,
          pi.taxable_value, pi.amount, pi.net_value, pi.cgst_amount, pi.sgst_amount, pi.igst_amount, b.purchase_rate
        FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id JOIN medicines m ON m.id=pi.medicine_id
        LEFT JOIN suppliers s ON s.id=pu.supplier_id LEFT JOIN medicine_batches b ON b.id=pi.batch_id
        WHERE ${clauses.join(' AND ')} ORDER BY pu.id, pi.id`, ...args).map((r, n) => {
        const gst = +(r.gst_pct || 0);
        const taxable = r2(r.taxable_value ?? r.qty * r.rate * (1 - r.discount_pct / 100));
        const tax = r2((r.cgst_amount || 0) + (r.sgst_amount || 0) + (r.igst_amount || 0)) || r2(taxable * gst / 100);
        const total = r2(r.net_value ?? taxable + tax);
        const packs = (+r.qty || 0) + (+r.free_qty || 0);
        const costPack = r.qty ? r2(total / r.qty) : 0;
        const landing = packs ? r2(total / packs) : 0;
        const mrpExcl = r2((r.mrp || 0) / (1 + gst / 100));
        const marginPack = r2(mrpExcl - landing / (1 + gst / 100));
        return { sl: n + 1, ...r, pack: `${r.package_type || r.purchase_unit || 'pack'} of ${r.upp}`, taxable, tax, total, packs,
          cost_pack: costPack, landing, per_unit: r2((r.mrp || 0) / r.upp), margin_pack: marginPack, margin_pct: pct(marginPack, mrpExcl),
          acp: r2((r.purchase_rate || 0) * r.upp * (1 + gst / 100)) };
      });
      return {
        subtitle: 'Quantities are in purchase packs (strips). Landing cost spreads the invoice value over paid + free packs; the stock register carries that cost.',
        kpis: [kpi('Lines', rows.length, 'number'), kpi('Taxable', sum(rows, 'taxable')), kpi('GST', sum(rows, 'tax')), kpi('Invoice value', sum(rows, 'total')), kpi('Free packs', sum(rows, 'free_qty'), 'number')],
        columns: [num('sl', 'SL No'), col('grn_no', 'GRN'), date('d', 'Received'), col('supplier', 'Supplier'), col('invoice_no', 'Invoice'), col('item', 'Item name'), col('pack', 'Pack'),
          col('hsn', 'HSN code'), col('manufacturer', 'Mfg'), col('batch_no', 'Batch no'), date('expiry', 'Expiry'), num('qty', 'Qty (strips)'), num('free_qty', 'Free (strips)'),
          money('rate', 'Rate / strip (excl. GST)'), num('discount_pct', 'Disc %'), money('mrp', 'MRP / strip'), num('gst_pct', 'GST %'), money('taxable', 'Amount (taxable)'),
          money('tax', 'GST amount'), money('total', 'Total (incl. GST)'), num('packs', 'Total strips received'), money('cost_pack', 'Cost / strip (incl. GST, no free)'),
          money('landing', 'Landing cost / strip (incl. GST & free)'), money('mrp', 'Patient price / strip (MRP)'), money('per_unit', 'Patient price / tablet'),
          money('margin_pack', 'Margin / strip'), num('margin_pct', 'Margin %'), money('acp', 'Cost in stock register (ACP / strip)')],
        rows, total: ['qty', 'free_qty', 'taxable', 'tax', 'total', 'packs'],
      };
    } },
];
