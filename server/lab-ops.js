/**
 * Laboratory operations shared by the lab routes:
 *   - accession numbers given when a sample is taken (one per order, per day series);
 *   - test-wise consumables taken from the LAB store, earliest expiry first. Collection items
 *     (tubes, needles, swabs) go when the sample is taken; processing items (reagents, kits) when
 *     results are first entered — never for a test the outside lab performs.
 * Clinical work is never held for a missing tube: a shortfall is recorded and shown, not refused.
 */
import { all, get, insert, update, nextNo, nowIso, one, run } from './lib.js';
import { postLabConsumption } from './accounting.js';

const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;
export const LAB_STORE = 'LAB';

export function ensureAccession(order) {
  if (order.accession_no) return order.accession_no;
  const no = nextNo('accession');
  update('orders', order.id, { accession_no: no });
  return no;
}

/** Use up the consumables set for this test at this stage. Returns { cost, short: [{name, qty}] }. */
export function consumeForOrder(req, order, stage, { recollection = false } = {}) {
  if (stage === 'processing' && order.order_dest === 'outsourced') return { cost: 0, short: [] };
  if (!recollection && one('SELECT count(*) FROM lab_consumption WHERE order_id=? AND stage=? AND recollection=0', order.id, stage)) return { cost: 0, short: [] };
  const lines = all(`SELECT c.*, m.name FROM lab_test_consumables c JOIN medicines m ON m.id=c.medicine_id
    WHERE c.service_id=? AND c.stage=? AND c.active=1`, order.service_id, stage);
  let cost = 0;
  const short = [];
  for (const l of lines) {
    let need = +l.qty;
    const batches = all(`SELECT * FROM medicine_batches WHERE medicine_id=? AND location=? AND qty>0 AND expiry >= date('now','localtime') ORDER BY expiry, id`, l.medicine_id, LAB_STORE);
    for (const bt of batches) {
      if (need <= 0) break;
      const take = Math.min(need, bt.qty);
      update('medicine_batches', bt.id, { qty: r2(bt.qty - take) });
      insert('stock_moves', { medicine_id: l.medicine_id, batch_id: bt.id, move_type: 'lab_use', qty: -take, location: LAB_STORE, balance_after: r2(bt.qty - take),
        ref_type: 'order', ref_id: order.id, reason: `${order.label} · ${stage}${recollection ? ' (recollection)' : ''}`, created_by: req.user.id });
      const c = r2(take * (bt.purchase_rate || 0));
      insert('lab_consumption', { order_id: order.id, service_id: order.service_id, medicine_id: l.medicine_id, batch_id: bt.id, qty: take, stage,
        recollection: recollection ? 1 : 0, cost: c, status: 'used', created_by: req.user.id, created_at: nowIso() });
      cost += c; need = r2(need - take);
    }
    if (need > 0) {
      insert('lab_consumption', { order_id: order.id, service_id: order.service_id, medicine_id: l.medicine_id, batch_id: null, qty: need, stage,
        recollection: recollection ? 1 : 0, cost: 0, status: 'short', created_by: req.user.id, created_at: nowIso() });
      short.push({ name: l.name, qty: need });
    }
  }
  if (cost > 0) postLabConsumption({ orderId: order.id, cost: r2(cost), narration: `Lab consumables · ${order.order_no} ${order.label} · ${stage}` });
  return { cost: r2(cost), short };
}

/** Lab consumables below their reorder level or expiring within 60 days, at the LAB store. */
export function labStockAlerts() {
  const low = all(`SELECT * FROM (SELECT m.id, m.name, m.reorder_level,
      (SELECT coalesce(sum(b.qty),0) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.location=? AND b.qty>0 AND b.expiry >= date('now','localtime')) stock_qty
    FROM medicines m WHERE EXISTS (SELECT 1 FROM lab_test_consumables c WHERE c.medicine_id=m.id AND c.active=1))
    WHERE stock_qty <= reorder_level ORDER BY stock_qty`, LAB_STORE).map((r) => ({ ...r, qty: r.stock_qty }));
  const expiring = all(`SELECT m.name, b.batch_no, b.expiry, b.qty FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
    WHERE b.location=? AND b.qty>0 AND b.expiry < date('now','localtime','+60 days') ORDER BY b.expiry`, LAB_STORE);
  return { low, expiring };
}

/** The usual collection items and lab disposables, offered once from Lab Store (master items only, no stock). */
const STANDARD_LAB_ITEMS = [
      ['LC-EDTA3', 'EDTA vacutainer 3 mL (lavender)', 'tube'], ['LC-PLAIN5', 'Plain / clot activator vacutainer 5 mL (red)', 'tube'],
      ['LC-SST5', 'Gel separator vacutainer 5 mL (yellow)', 'tube'], ['LC-FLUO2', 'Fluoride vacutainer 2 mL (grey)', 'tube'],
      ['LC-CIT27', 'Sodium citrate vacutainer 2.7 mL (blue)', 'tube'], ['LC-NEEDLE21', 'Vacutainer needle 21G', 'piece'],
      ['LC-HOLDER', 'Vacutainer holder (single use)', 'piece'], ['LC-URINE30', 'Urine container 30 mL (sterile)', 'piece'],
      ['LC-STOOL', 'Stool container with spoon', 'piece'], ['LC-SWAB', 'Sterile swab stick with transport tube', 'piece'],
      ['LC-BCBOT', 'Blood culture bottle (aerobic)', 'bottle'], ['LC-SLIDE', 'Glass microscope slide', 'piece'],
      ['LC-TIPS', 'Pipette tips 200 µL', 'piece'], ['LC-SPIRIT', 'Alcohol swab', 'piece'], ['LC-TOURNI', 'Tourniquet (disposable)', 'piece'],
    ];
export function addStandardLabItems() {
  const added = [];
  for (const [code, name, unit] of STANDARD_LAB_ITEMS) {
    if (get('SELECT 1 FROM medicines WHERE code=?', code)) continue;
    run("INSERT INTO medicines (code, name, generic, form, manufacturer, schedule, hsn, gst_pct, reorder_level, active, kind, purchase_unit, dispensing_unit, package_type, pack_size, units_per_pack) VALUES (?, ?, ?, 'consumable', 'Laboratory supplies', 'OTC', '9018', 12, 50, 1, 'consumable', 'box', ?, 'box', 1, 100)", code, name, name, unit);
    added.push(code);
  }
  return added;
}

export const consumablesFor = (serviceId) => all(`SELECT c.*, m.name, m.code, m.dispensing_unit unit FROM lab_test_consumables c
  JOIN medicines m ON m.id=c.medicine_id WHERE c.service_id=? ORDER BY c.stage, m.name`, serviceId);
export { get };
