import { Router } from 'express';
import {
  h, fail, all, get, one, insert, update, run, nextNo, today, where, emit, num, money,
  recalcBill, tx, dateAgo, nowIso,
} from '../lib.js';
import { recordPriceAlerts } from './price-alerts.js';
import { billNewToPayer } from '../payer-billing.js';
import { activeAssignment, applyPackage, packageUsage } from '../packages.js';
import { collectionPolicy } from '../collection-policy.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { takePayment } from '../payments.js';
import { postPurchase, postCostOfSale, postStockAdjustment } from '../accounting.js';

export const pharmacy = Router();
const TOPICS = ['pharmacy', 'inventory', 'dashboard'];

pharmacy.get('/patient-package/:patientId', requireAuth, h(req => {
  if (!can(req.user,'pharmacy.view') && !can(req.user,'billing.view') && !can(req.user,'ipd.view')) fail(403,'forbidden');
  // a self-pay package on the open visit / admission: the live usage, including the medicine allowance
  const sp = activeAssignment({ patientId: +req.params.patientId });
  if (sp) {
    const u = packageUsage(sp);
    return { source: 'hospital', package_id: u.package.id, assignment_id: sp.id, claim_no: sp.assignment_no, status: sp.status, package_name: u.package.name, package_price: u.price,
      inclusions: u.package.inclusions, exclusions: u.package.exclusions, billed: money(u.lines.reduce((n, l) => n + l.amount, 0)),
      pharmacy_billed: money(u.lines.filter((l) => ['pharmacy', 'consumable', 'medicine'].includes(l.category)).reduce((n, l) => n + l.amount, 0)),
      patient_exclusions: u.excluded, usage: u.allowances.map((x) => ({ name: x.name, used: x.used, allowance: x.allowed, excess: Math.max(0, x.used - x.allowed) })),
      pharmacy_limit: u.pharmacy.limit, pharmacy_covered: u.pharmacy.used, covered: u.covered, excess: u.excess,
      coverage_note: u.rules.all_inclusive ? 'All-inclusive package: every charge is covered.'
        : `Medicines ${u.pharmacy.limit === null ? (u.rules.categories.includes('pharmacy') ? 'fully covered' : 'not covered — billed to the patient') : `covered up to ${money(u.pharmacy.limit)} (used ${money(u.pharmacy.used)})`}. Excess so far ${money(u.excess)}.` };
  }
  const c = get(`SELECT c.*,p.name package_name,p.price package_price,p.inclusions,p.exclusions,p.los_days
    FROM insurance_claims c JOIN packages p ON p.id=c.package_id LEFT JOIN admissions a ON a.id=c.admission_id
    WHERE c.patient_id=? AND c.status<>'rejected' AND (a.id IS NULL OR a.status<>'discharged') ORDER BY c.id DESC LIMIT 1`,+req.params.patientId);
  if (!c) {
    const common = get(`SELECT b.id,b.bill_no,b.encounter_id,b.patient_id,b.status,p.id package_id,p.name package_name,p.price package_price,p.inclusions,p.exclusions,p.los_days
      FROM bills b JOIN packages p ON p.id=b.package_id
      WHERE b.patient_id=? AND b.status<>'cancelled' AND p.payer_id IS NULL
        AND date(b.bill_date,'+'||coalesce(p.validity_days,30)||' days')>=date('now','localtime')
        AND NOT EXISTS(SELECT 1 FROM admissions a WHERE a.encounter_id=b.encounter_id AND a.status='discharged') ORDER BY b.id DESC LIMIT 1`,+req.params.patientId);
    if (!common) return null;
    const lines=all(`SELECT i.*,b.bill_no,b.bill_type FROM bill_items i JOIN bills b ON b.id=i.bill_id
      WHERE b.status<>'cancelled' AND (b.id=? OR (? IS NOT NULL AND b.encounter_id=?)) ORDER BY i.id`,common.id,common.encounter_id,common.encounter_id);
    const usage=all(`SELECT pi.service_id,s.name,pi.qty allowance FROM package_items pi JOIN services s ON s.id=pi.service_id WHERE pi.package_id=?`,common.package_id).map(x=>{
      const used=lines.filter(l=>l.service_id===x.service_id).reduce((n,l)=>n+l.qty,0);
      return {...x,used,remaining:Math.max(0,x.allowance-used),excess:Math.max(0,used-x.allowance)};
    });
    return {...common,claim_no:common.bill_no,source:'hospital',lines,usage,billed:money(lines.reduce((n,l)=>n+l.amount,0)),
      pharmacy_billed:money(lines.filter(l=>['pharmacy','consumable'].includes(l.category)).reduce((n,l)=>n+l.amount,0)),
      patient_exclusions:money(lines.filter(l=>l.patient_pays).reduce((n,l)=>n+l.amount,0)),coverage_note:'Common hospital package linked to this bill/visit. Usage is shown for review; this does not automatically waive separate charges.'};
  }
  const lines = all(`SELECT bi.*,b.bill_no,b.bill_type FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
    WHERE b.claim_id=? AND b.status<>'cancelled' ORDER BY bi.id`,c.id);
  const bills = get(`SELECT coalesce(sum(total),0) billed,coalesce(sum(paid),0) patient_received,
    coalesce(sum(covered_amount),0) allocated_to_payer FROM bills WHERE claim_id=? AND status<>'cancelled'`,c.id);
  return { ...c, ...bills, lines, pharmacy_billed:money(lines.filter(l=>l.category==='pharmacy'||l.category==='consumable').reduce((s,l)=>s+l.amount,0)),
    patient_exclusions:money(lines.filter(l=>l.patient_pays).reduce((s,l)=>s+(l.patient_pay_amount??l.amount),0)),
    remaining_package_budget:money(Math.max(0,c.package_price-bills.billed)) };
}));

/* -------------------------------------------------------------- catalogue */

pharmacy.get('/medicines', requireAuth, h((req) => {
  const extra = [], args = [];
  if (req.query.q) {
    // starts-with matches rank first, so typing one letter lists the right drugs on top
    extra.push('(m.name LIKE ? OR m.generic LIKE ? OR m.brand LIKE ? OR m.code LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l, l);
  }
  if (req.query.active === '1') extra.push('m.active = 1');
  if (req.query.form && req.query.form !== 'all') { extra.push('m.form = ?'); args.push(req.query.form); }
  if (req.query.schedule && req.query.schedule !== 'all') { extra.push('m.schedule = ?'); args.push(req.query.schedule); }
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  const rows = all(
    `SELECT m.*,
            coalesce((SELECT sum(qty) FROM medicine_batches b WHERE b.medicine_id=m.id),0) stock,
            coalesce((SELECT sum(qty) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.location='Central'),0) central_stock,
            coalesce((SELECT sum(qty) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.location=?),0) location_stock,
            (SELECT min(expiry) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.qty>0) next_expiry,
            (SELECT max(mrp) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.qty>0) mrp,
            (SELECT coalesce(b.selling_price, b.mrp) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.qty>0 AND b.location=?
              ORDER BY b.expiry LIMIT 1) next_price,
            (SELECT count(*) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.qty>0) batch_count
       FROM medicines m ${w} ORDER BY ${req.query.q ? '(m.name LIKE ? OR m.brand LIKE ? OR m.generic LIKE ?) DESC, ' : ''}m.name LIMIT ?`,
    req.query.location || 'OP', req.query.location || 'OP', ...args, ...(req.query.q ? [`${req.query.q}%`, `${req.query.q}%`, `${req.query.q}%`] : []), Math.min(num(req.query.limit, 300), 1000));
  for (const r of rows) r.low = r.stock <= r.reorder_level;
  if (req.query.low === '1') return { rows: rows.filter((r) => r.low) };
  return { rows };
}));

/** Same ingredients, same strengths, same form — a brand that can stand in for another. */
export function equivalenceKey(m) {
  if (!m) return '';
  let parts = [];
  try { parts = JSON.parse(m.composition || '[]'); } catch { parts = []; }
  if (!parts.length && m.generic) parts = [{ generic: m.generic, strength: m.strength || '' }];
  const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, '').replace(/milligrams?|mgs/g, 'mg');
  const comp = parts.map((p) => `${norm(p.generic)}@${norm(p.strength)}`).filter((x) => !x.startsWith('@')).sort().join('+');
  return comp ? `${comp}|${norm(m.form)}` : '';
}

/** In-stock brands with the same composition and form, for when the asked brand is out at this store. */
pharmacy.get('/medicines/:id/alternatives', requireAuth, h((req) => {
  const m = get('SELECT * FROM medicines WHERE id=?', +req.params.id) || fail(404, 'medicine_not_found');
  const key = equivalenceKey(m);
  if (!key) return { key: null, rows: [] };
  const location = req.query.location || 'OP';
  const rows = all(`SELECT m.*,
      coalesce((SELECT sum(qty) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.location=? AND b.qty>0 AND b.expiry > date('now','localtime')),0) location_stock,
      (SELECT coalesce(b.selling_price, b.mrp) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.location=? AND b.qty>0 AND b.expiry > date('now','localtime') ORDER BY b.expiry LIMIT 1) next_price
    FROM medicines m WHERE m.active=1 AND m.id<>?`, location, location, m.id)
    .filter((x) => x.location_stock > 0 && equivalenceKey(x) === key)
    .sort((a, b) => (a.next_price ?? 0) - (b.next_price ?? 0));
  return { key, rows };
}));

pharmacy.get('/medicines/:id', requireAuth, h((req) => {
  const m = get('SELECT * FROM medicines WHERE id=?', +req.params.id);
  if (!m) fail(404, 'medicine_not_found');
  m.batches = all('SELECT b.*, s.name supplier_name FROM medicine_batches b LEFT JOIN suppliers s ON s.id=b.supplier_id WHERE b.medicine_id=? ORDER BY b.expiry', m.id);
  m.stock = m.batches.reduce((s, b) => s + b.qty, 0);
  m.moves = all(`SELECT sm.*, u.name by_name FROM stock_moves sm LEFT JOIN users u ON u.id=sm.created_by
                  WHERE sm.medicine_id=? ORDER BY sm.id DESC LIMIT 60`, m.id);
  return m;
}));

/**
 * A medicine's composition: one or more ingredients, each with its strength
 * (e.g. Amoxicillin 500 mg + Clavulanic acid 125 mg). generic / strength keep
 * the joined text so search, labels and older screens keep working.
 */
function composition(b, current = {}) {
  let list = Array.isArray(b.composition) ? b.composition : null;
  if (!list && (b.generic !== undefined || b.strength !== undefined)) {
    const g = String(b.generic ?? current.generic ?? '').split('+').map((x) => x.trim());
    const st = String(b.strength ?? current.strength ?? '').split('+').map((x) => x.trim());
    list = g.map((generic, i) => ({ generic, strength: st[i] || '' }));
  }
  if (!list) return {};
  list = list.map((x) => ({ generic: String(x.generic || '').trim(), strength: String(x.strength || '').trim() })).filter((x) => x.generic);
  if (new Set(list.map((x) => x.generic.toLowerCase())).size !== list.length) fail(400, 'ingredient_repeated');
  return { composition: list.length ? JSON.stringify(list) : null, generic: list.map((x) => x.generic).join(' + ') || null,
    strength: list.map((x) => x.strength).filter(Boolean).join(' + ') || null };
}
function sameComposition(c, brand, form, exceptId = 0) {
  if (!c.generic) return null;
  return get(`SELECT id, name FROM medicines WHERE active=1 AND id<>? AND lower(coalesce(generic,''))=lower(?) AND lower(coalesce(strength,''))=lower(?)
               AND lower(coalesce(brand,''))=lower(?) AND lower(coalesce(form,''))=lower(?)`, exceptId, c.generic, c.strength || '', brand || '', form || '');
}

pharmacy.post('/medicines', requirePerm('inventory.write'), h((req) => {
  const b = req.body;
  if(!String(b.name||'').trim())fail(400,'name_required');
  if(get('SELECT id FROM medicines WHERE lower(trim(name))=lower(trim(?))',b.name))fail(409,'medicine_exists');
  const comp = composition(b);
  if (!comp.generic && !String(b.generic || '').trim() && (b.kind || 'medicine') === 'medicine') fail(400, 'generic_required');
  const dup = sameComposition(comp, b.brand, b.form);
  if (dup) fail(409, 'same_composition_exists', { existing: dup.name });
  const id = insert('medicines', {
    brand:b.brand,purchase_unit:b.purchase_unit,dispensing_unit:b.dispensing_unit,pack_size:num(b.pack_size,1),units_per_pack:num(b.units_per_pack,1),
    package_type:b.package_type||'strip',kind:b.kind==='consumable'?'consumable':'medicine',
    code: b.code || `MED${Date.now().toString().slice(-6)}`, name: b.name, generic: comp.generic ?? b.generic, composition: comp.composition ?? null,
    form: b.form, strength: comp.strength ?? b.strength, manufacturer: b.manufacturer, schedule: b.schedule || 'H',
    hsn: b.hsn || '3004', gst_pct: num(b.gst_pct, 12), rack: b.rack,
    reorder_level: num(b.reorder_level, 20), narcotic: b.narcotic ? 1 : 0,
  });
  const row = get('SELECT * FROM medicines WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'medicine.saved', data: row,
    action: 'medicine.create', entity: 'medicines', entityId: id, detail: b });
  return row;
}));

pharmacy.patch('/medicines/:id', requirePerm('inventory.write'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['name', 'generic', 'brand', 'form', 'strength', 'manufacturer', 'schedule', 'hsn', 'gst_pct', 'rack',
    'reorder_level', 'active', 'narcotic', 'purchase_unit', 'dispensing_unit', 'package_type', 'pack_size', 'units_per_pack', 'kind']) if (k in req.body) patch[k] = req.body[k];
  if (patch.name && get('SELECT id FROM medicines WHERE lower(trim(name))=lower(trim(?)) AND id<>?', patch.name, id)) fail(409, 'medicine_exists');
  const before = get('SELECT * FROM medicines WHERE id=?', id);
  if (!before) fail(404, 'medicine_not_found');
  if ('composition' in req.body || 'generic' in req.body || 'strength' in req.body) {
    const comp = composition(req.body, before);
    Object.assign(patch, comp);
    const dup = sameComposition(comp, patch.brand ?? before.brand, patch.form ?? before.form, id);
    if (dup) fail(409, 'same_composition_exists', { existing: dup.name });
  }
  update('medicines', id, patch);
  const row = get('SELECT * FROM medicines WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'medicine.saved', data: row,
    action: 'medicine.update', entity: 'medicines', entityId: id,
    detail: { before: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), after: patch } });
  return row;
}));

/* ------------------------------------------------------------------ stock */

pharmacy.get('/stock', requireAuth, h((req) => {
  const extra = [], args = [];
  if (req.query.location) { extra.push('b.location=?'); args.push(req.query.location); }
  if (req.query.q) { extra.push('(m.name LIKE ? OR b.batch_no LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l); }
  if (req.query.filter === 'expiring') extra.push(`b.expiry <= date('now','localtime','+90 day') AND b.qty > 0`);
  if (req.query.filter === 'expired') extra.push(`b.expiry < date('now','localtime') AND b.qty > 0`);
  if (req.query.filter === 'zero') extra.push('b.qty <= 0');
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  const rows = all(
    `SELECT b.*, m.name medicine_name, m.code medicine_code, m.form, m.rack, m.reorder_level,
            s.name supplier_name,
            cast(julianday(b.expiry) - julianday('now','localtime') AS int) days_to_expiry,
            round(b.qty * b.purchase_rate, 2) stock_value
       FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
       LEFT JOIN suppliers s ON s.id=b.supplier_id ${w}
      ORDER BY b.expiry LIMIT 600`, ...args);
  return {
    rows,
    summary: {
      batches: one('SELECT count(*) FROM medicine_batches WHERE qty>0') || 0,
      value: money(one('SELECT coalesce(sum(qty*purchase_rate),0) FROM medicine_batches WHERE qty>0') || 0),
      mrp_value: money(one('SELECT coalesce(sum(qty*mrp),0) FROM medicine_batches WHERE qty>0') || 0),
      expiring_90: one(`SELECT count(*) FROM medicine_batches WHERE qty>0 AND expiry <= date('now','localtime','+90 day') AND expiry >= date('now','localtime')`) || 0,
      expired: one(`SELECT count(*) FROM medicine_batches WHERE qty>0 AND expiry < date('now','localtime')`) || 0,
      expiry_value: money(one(`SELECT coalesce(sum(qty*purchase_rate),0) FROM medicine_batches WHERE qty>0 AND expiry <= date('now','localtime','+90 day')`) || 0),
      low_stock: one(`SELECT count(*) FROM (SELECT m.id FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.id
                        GROUP BY m.id HAVING coalesce(sum(b.qty),0) <= m.reorder_level)`) || 0,
    },
  };
}));

pharmacy.get('/stock/moves', requirePerm('inventory.view'), h((req) => all(
  `SELECT sm.*, m.name medicine_name, b.batch_no, u.name by_name
     FROM stock_moves sm JOIN medicines m ON m.id=sm.medicine_id
     LEFT JOIN medicine_batches b ON b.id=sm.batch_id LEFT JOIN users u ON u.id=sm.created_by
    ${req.query.medicine_id ? 'WHERE sm.medicine_id=?' : ''}
    ORDER BY sm.id DESC LIMIT 300`, ...(req.query.medicine_id ? [+req.query.medicine_id] : []))));

pharmacy.post('/stock/adjust', requirePerm('inventory.write'), h((req) => {
  const b = req.body;
  const batch = get('SELECT * FROM medicine_batches WHERE id=?', num(b.batch_id));
  if (!batch) fail(404, 'batch_not_found');
  const delta = Number(b.qty);
  if (!Number.isFinite(delta)||!String(b.reason||'').trim()) fail(400,'quantity_and_reason_required');
  if (!['adjust','expiry','damage','disposal','loss'].includes(b.move_type || 'adjust') || (delta>0 && (b.move_type || 'adjust')!=='adjust')) fail(400,'stock_adjustment_type_invalid');
  const after = batch.qty + delta;
  if (after < 0) fail(400, 'insufficient_stock');
  tx(() => {
    update('medicine_batches', batch.id, { qty: after });
    const moveId = insert('stock_moves', {
      medicine_id: batch.medicine_id, batch_id: batch.id, location: batch.location,
      move_type: b.move_type || 'adjust', qty: delta, balance_after: after,
      reason: b.reason, created_by: req.user.id,
    });
    postStockAdjustment({ moveId, value: money(delta * batch.purchase_rate),
      narration: `Stock ${delta > 0 ? 'gain' : 'loss'} ${batch.batch_no} @ ${batch.location}: ${b.reason}` });
    if (delta < 0) for (const u of all('SELECT * FROM users WHERE active=1')) {
      if (!['admin','owner','manager','medical_superintendent','pharmacy_admin'].includes(u.role) && !can(u,'inventory.approve')) continue;
      insert('notifications',{user_id:u.id,level:'warning',title:'Pharmacy stock loss recorded',
        body:`${batch.batch_no} @ ${batch.location}: ${-delta} units, loss ${money(-delta*batch.purchase_rate)}. ${b.reason}`,
        link:'/reports?report=pharmacy_stock_losses'});
    }
  });
  emit(req, { topics: [...TOPICS, 'accounts'], event: 'stock.changed', data: { batch_id: batch.id, qty: after },
    action: 'stock.adjust', entity: 'medicine_batches', entityId: batch.id,
    detail: { before: { qty: batch.qty }, after: { qty: after }, reason: b.reason, location: batch.location } });
  return get('SELECT * FROM medicine_batches WHERE id=?', batch.id);
}));

/* ------------------------------------------------------- dispensing / POS */

pharmacy.get('/dispense/queue', requirePerm('pharmacy.view'), h((req) => {
  // Older prescriptions typed as free text: link any that now match the master.
  run(`UPDATE prescription_items SET medicine_id=(SELECT m.id FROM medicines m WHERE lower(trim(m.name))=lower(trim(prescription_items.drug)) AND m.active=1 LIMIT 1)
        WHERE medicine_id IS NULL AND prescription_id IN (SELECT id FROM prescriptions WHERE status IN ('active','partial'))`);
  const rows = all(
    `SELECT r.*, p.uhid, p.name patient_name, p.gender, p.age_years, p.mobile,
            u.name doctor_name, p.payer_type, e.token_no, e.encounter_no, e.kind encounter_kind,
            (SELECT a.id FROM admissions a WHERE a.patient_id=r.patient_id AND a.status<>'discharged' ORDER BY a.id DESC LIMIT 1) admission_id,
            (SELECT a.ip_no FROM admissions a WHERE a.patient_id=r.patient_id AND a.status<>'discharged' ORDER BY a.id DESC LIMIT 1) ip_no,
            (SELECT count(*) FROM prescription_items i WHERE i.prescription_id=r.id) item_count,
            (SELECT count(*) FROM prescription_items i WHERE i.prescription_id=r.id AND i.dispensed_qty >= i.qty) done_count
       FROM prescriptions r JOIN patients p ON p.id=r.patient_id
       LEFT JOIN users u ON u.id=r.doctor_id LEFT JOIN encounters e ON e.id=r.encounter_id
      WHERE r.status IN ('active','partial','dispensing','hold') ORDER BY r.id DESC LIMIT 120`);
  for (const r of rows) {
    // An inpatient's medicines come from the IP store and go on the IP bill; everyone else from OP.
    r.location = r.admission_id ? 'IP' : 'OP';
    r.items = all(
      `SELECT i.*, m.name medicine_name, m.form, m.strength, m.schedule, m.narcotic,
              coalesce((SELECT sum(qty) FROM medicine_batches b WHERE b.medicine_id=i.medicine_id AND b.location=? AND b.qty>0
                         AND b.expiry > date('now','localtime')),0) stock
         FROM prescription_items i LEFT JOIN medicines m ON m.id=i.medicine_id
        WHERE i.prescription_id=?`, r.location, r.id);
  }
  return {
    rows,
    stats: {
      pending: rows.length,
      sales_today: one(`SELECT count(*) FROM bills WHERE bill_type='PHARM' AND bill_date=?`, today()) || 0,
      revenue_today: money(one(`SELECT coalesce(sum(total),0) FROM bills WHERE bill_type='PHARM' AND bill_date=? AND status<>'cancelled'`, today()) || 0),
    },
  };
}));

pharmacy.get('/batches', requireAuth, h((req) => all(
  `SELECT b.*, m.name medicine_name, m.gst_pct,
          cast(julianday(b.expiry) - julianday('now','localtime') AS int) days_to_expiry
     FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
    WHERE b.medicine_id = ? AND b.qty > 0 AND b.location=? ORDER BY b.expiry`, num(req.query.medicine_id), req.query.location || 'OP')));

/**
 * Pharmacy sale. FEFO batch pick unless a batch is named. Creates the bill,
 * moves stock and (optionally) takes payment in one transaction.
 */
export function dispense(req, b = {}) {
  const items = b.items || [];
  if (!items.length) fail(400, 'items_required');
  if (items.some(it => !Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0)) fail(400, 'positive_quantity_required');
  const patientId = num(b.patient_id, null);
  if (!patientId) fail(400, 'patient_required');

  return tx(() => {
    // Admitted patients are charged to their running IP bill; everyone else gets a pharmacy bill.
    const ipBill = b.admission_id ? get(
      `SELECT bl.* FROM bills bl JOIN admissions a ON a.encounter_id=bl.encounter_id
        WHERE a.id=? AND a.status<>'discharged' AND bl.bill_type='IP' AND bl.status<>'cancelled' ORDER BY bl.id DESC LIMIT 1`,
      num(b.admission_id)) : null;
    if (b.admission_id && !ipBill) fail(409, 'ip_bill_not_found');
    const rxEnc = b.prescription_id ? get('SELECT encounter_id FROM prescriptions WHERE id=?', num(b.prescription_id))?.encounter_id : null;
    const bid = ipBill ? ipBill.id : insert('bills', {
      bill_no: nextNo('bill'), patient_id: patientId, encounter_id: b.encounter_id || rxEnc || null,
      source: b.prescription_id ? 'prescription' : null, source_id: b.prescription_id ? num(b.prescription_id) : null,
      bill_type: 'PHARM', status: 'unpaid', payer_type: get('SELECT payer_type FROM patients WHERE id=?', patientId)?.payer_type || 'self',
      counter_id: req.user.counter_id || null, created_by: req.user.id,
      discount: money(num(b.discount, 0)), notes: b.notes,
    });
    let cost = 0;
    const location = b.location || (ipBill ? 'IP' : 'OP');
    if (!['OP','IP','ICU','ER','OT','Ward'].includes(location)) fail(400,'dispensing_location_invalid');
    for (const it of items) {
      let qty = num(it.qty);
      if (qty <= 0) continue;
      const med = get('SELECT * FROM medicines WHERE id=?', num(it.medicine_id));
      if (!med) fail(400, `unknown_medicine_${it.medicine_id}`);
      // a different brand against a prescription line must be a true equivalent (same composition and form)
      const rxLine = it.prescription_item_id ? get('SELECT * FROM prescription_items WHERE id=?', num(it.prescription_item_id)) : null;
      const prescribed = rxLine?.medicine_id && rxLine.medicine_id !== med.id ? get('SELECT * FROM medicines WHERE id=?', rxLine.medicine_id) : null;
      if (prescribed && (!equivalenceKey(med) || equivalenceKey(med) !== equivalenceKey(prescribed))) fail(409, 'not_an_equivalent_brand', { prescribed: prescribed.name, given: med.name });
      const batches = it.batch_id
        ? [get('SELECT * FROM medicine_batches WHERE id=?', num(it.batch_id))]
        : all(`SELECT * FROM medicine_batches WHERE medicine_id=? AND location=? AND qty>0 AND expiry > date('now','localtime')
                ORDER BY expiry`, med.id, location);
      if (it.batch_id && (!batches[0] || batches[0].medicine_id !== med.id || batches[0].location !== location || batches[0].expiry <= today())) fail(400, 'invalid_or_expired_batch');
      let remaining = qty;
      for (const batch of batches) {
        if (remaining <= 0 || !batch) break;
        const take = Math.min(remaining, batch.qty);
        if (take <= 0) continue;
        update('medicine_batches', batch.id, { qty: batch.qty - take });
        insert('stock_moves', {
          medicine_id: med.id, batch_id: batch.id, move_type: 'sale', qty: -take, location,
          balance_after: batch.qty - take, ref_type: 'bill', ref_id: bid, created_by: req.user.id,
        });
        const rate = money(it.rate !== undefined ? num(it.rate) : (batch.selling_price || batch.mrp));
        if (rate > batch.mrp + 0.005 && batch.mrp > 0) fail(400, 'rate_above_mrp', { medicine: med.name, mrp: batch.mrp });
        cost += take * batch.purchase_rate;
        insert('bill_items', {
          bill_id: bid, batch_id: batch.id,
          description: `${med.name} (B:${batch.batch_no} Exp:${batch.expiry.slice(0, 7)})${prescribed ? ` — substitute for ${prescribed.name}` : ''}`,
          category: med.kind === 'consumable' ? 'consumable' : 'pharmacy', qty: take, rate, gst_pct: med.gst_pct,
          discount: 0, amount: money(take * rate), tax_inclusive: 1, unit_cost: batch.purchase_rate,
          revenue_head: 'PHARMACY', created_by: req.user.id, created_at: nowIso(),
        });
        remaining -= take;
      }
      if (remaining > 0) fail(409, 'insufficient_stock', { medicine: med.name, short: remaining });
      if (it.prescription_item_id) {
        const pi = get('SELECT * FROM prescription_items WHERE id=?', num(it.prescription_item_id));
        if (pi) update('prescription_items', pi.id, { dispensed_qty: (pi.dispensed_qty || 0) + qty });
      }
    }
    const bill = recalcBill(bid);
    postCostOfSale({ billId: bid, cost: money(cost), narration: `Cost of medicines · bill ${bill.bill_no} @ ${location}` });
    if (b.prescription_id) {
      const pend = one(
        `SELECT count(*) FROM prescription_items WHERE prescription_id=? AND dispensed_qty < qty`, num(b.prescription_id));
      update('prescriptions', num(b.prescription_id), { status: pend ? 'partial' : 'dispensed' });
    }
    let payment = null;
    if (!ipBill && bill.payer_type === 'self' && b.collect !== false && b.mode) {
      const r = takePayment(req, { bill_id: bid, amount: b.amount ?? bill.total, mode: b.mode, reference: b.reference });
      payment = r.payment;
    }
    const view = get('SELECT * FROM bills WHERE id=?', bid);
    view.items = all('SELECT * FROM bill_items WHERE bill_id=?', bid);
    emit(req, {
      topics: [...TOPICS, 'billing', 'accounts', `patient:${patientId}`], event: 'pharmacy.dispensed',
      data: { bill: view, payment },
      action: 'pharmacy.dispense', entity: 'bills', entityId: bid,
      detail: { bill_no: view.bill_no, total: view.total, lines: items.length },
    });
    return { bill: view, payment };
  });
}
pharmacy.post('/dispense', requirePerm('pharmacy.dispense'), h((req) => {
  const r = dispense(req, req.body || {});
  // a sale on an approved payer case is billed to the payer at once
  if (r?.bill?.id && billNewToPayer(req, [r.bill.id]).length) r.bill = Object.assign({}, r.bill, get('SELECT * FROM bills WHERE id=?', r.bill.id));
  if (r?.bill?.encounter_id && applyPackage(req, activeAssignment({ encounterId: r.bill.encounter_id }))) r.bill = Object.assign({}, r.bill, get('SELECT * FROM bills WHERE id=?', r.bill.id));
  if (r?.bill) Object.assign(r.bill, collectionPolicy(r.bill));
  return r;
}));

/* ------------------------------------------------ prescription status */

/**
 * Queue states the pharmacy sets by hand: dispensing (being prepared), hold
 * (waiting for stock / the patient / a doctor query), back to waiting, or
 * cancelled. Partial and completed follow from what was actually dispensed.
 */
pharmacy.post('/prescriptions/:id/status', requirePerm('pharmacy.dispense'), h((req) => {
  const rx = get('SELECT * FROM prescriptions WHERE id=?', +req.params.id);
  if (!rx) fail(404, 'prescription_not_found');
  const to = req.body?.status;
  if (!['dispensing', 'hold', 'active', 'cancelled'].includes(to)) fail(400, 'status_invalid');
  if (['dispensed', 'cancelled'].includes(rx.status)) fail(409, 'prescription_closed');
  const note = String(req.body?.reason || '').trim();
  if (['hold', 'cancelled'].includes(to) && !note) fail(400, 'reason_required');
  const done = one('SELECT count(*) FROM prescription_items WHERE prescription_id=? AND dispensed_qty > 0', rx.id);
  const status = to === 'active' && done ? 'partial' : to;
  update('prescriptions', rx.id, { status, status_note: note || null, status_by: req.user.id, status_at: nowIso() });
  emit(req, { topics: [...TOPICS, 'clinical'], event: 'prescription.saved', data: { id: rx.id, status },
    action: `prescription.${to}`, entity: 'prescriptions', entityId: rx.id, detail: { before: { status: rx.status }, after: { status }, reason: note } });
  return get('SELECT * FROM prescriptions WHERE id=?', rx.id);
}));

/* --------------------------------------------------- purchase requests */

pharmacy.get('/purchase-requests', requirePerm('purchase.view'), h(() => all(
  `SELECT r.*, s.name supplier_name, u.name requested_by_name FROM purchase_requests r LEFT JOIN suppliers s ON s.id=r.supplier_id
    LEFT JOIN users u ON u.id=r.requested_by ORDER BY r.id DESC LIMIT 200`).map((r) => ({ ...r, lines: JSON.parse(r.lines || '[]') }))));

pharmacy.post('/purchase-requests', requirePerm('inventory.write'), h((req) => {
  const b = req.body || {};
  const lines = (b.lines || []).map((l) => {
    const m = get('SELECT id, name, purchase_unit, dispensing_unit FROM medicines WHERE id=?', num(l.medicine_id));
    if (!m || !(Number(l.qty) > 0)) fail(400, 'request_line_invalid');
    return { medicine_id: m.id, name: m.name, qty: Number(l.qty), unit: l.unit || m.dispensing_unit, rate: l.rate ? Number(l.rate) : null };
  });
  if (!lines.length) fail(400, 'lines_required');
  const id = insert('purchase_requests', { pr_no: nextNo('purchase_request'), supplier_id: b.supplier_id ? num(b.supplier_id) : null,
    notes: b.notes || null, lines: JSON.stringify(lines), requested_by: req.user.id });
  const row = get('SELECT * FROM purchase_requests WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'purchase_request.created', data: row, action: 'purchase_request.create', entity: 'purchase_requests', entityId: id, detail: { after: { lines } } });
  return { ...row, lines };
}));

pharmacy.post('/purchase-requests/:id/status', requirePerm('purchase.write'), h((req) => {
  const r = get('SELECT * FROM purchase_requests WHERE id=?', +req.params.id);
  if (!r) fail(404, 'request_not_found');
  const to = req.body?.status;
  if (!['ordered', 'received', 'cancelled'].includes(to)) fail(400, 'status_invalid');
  update('purchase_requests', r.id, { status: to, closed_by: ['received', 'cancelled'].includes(to) ? req.user.id : null, closed_at: ['received', 'cancelled'].includes(to) ? nowIso() : null });
  emit(req, { topics: TOPICS, event: 'purchase_request.updated', data: { id: r.id, status: to }, action: `purchase_request.${to}`, entity: 'purchase_requests', entityId: r.id,
    detail: { before: { status: r.status }, after: { status: to }, reason: req.body?.reason } });
  return { ok: true };
}));

/* -------------------------------------------------------------- suppliers */

pharmacy.get('/suppliers', requirePerm('purchase.view'), h((req) => all(
  `SELECT s.*, (SELECT count(*) FROM purchases p WHERE p.supplier_id=s.id) grn_count,
          (SELECT coalesce(sum(total),0) FROM purchases p WHERE p.supplier_id=s.id) purchase_value,
          (SELECT max(received_at) FROM purchases p WHERE p.supplier_id=s.id) last_supply
     FROM suppliers s ${req.query.q ? 'WHERE s.name LIKE ? OR s.code LIKE ?' : ''}
    ORDER BY s.name`, ...(req.query.q ? [`%${req.query.q}%`, `%${req.query.q}%`] : []))));

pharmacy.post('/suppliers', requirePerm('supplier.write'), h((req) => {
  const b = req.body;
  if(!String(b.name||'').trim())fail(400,'name_required');
  if(get('SELECT id FROM suppliers WHERE lower(trim(name))=lower(trim(?)) AND id<>?',b.name,b.id||0))fail(409,'supplier_exists');
  const fields = { name: String(b.name).trim(), contact: b.contact, mobile: b.mobile, email: b.email, gstin: b.gstin ? String(b.gstin).trim().toUpperCase() : null,
    dl_no: b.dl_no, address: b.address, state: b.state, pan: b.pan, credit_days: num(b.credit_days, 30) };
  if (fields.gstin && get('SELECT id FROM suppliers WHERE upper(gstin)=? AND id<>?', fields.gstin, b.id || 0)) fail(409, 'supplier_gstin_exists');
  const before = b.id ? get('SELECT * FROM suppliers WHERE id=?', num(b.id)) : null;
  if (b.id && !before) fail(404, 'supplier_not_found');
  const id = b.id ? (update('suppliers', before.id, fields), before.id) : insert('suppliers', {
    code: b.code || `SUP${Date.now().toString().slice(-5)}`, ...fields,
  });
  const row = get('SELECT * FROM suppliers WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'supplier.saved', data: row,
    action: 'supplier.save', entity: 'suppliers', entityId: id, detail: { before, after: fields } });
  return row;
}));

/* ------------------------------------------------------------ GRN / purchases */

pharmacy.get('/purchases', requirePerm('purchase.view'), h((req) => {
  const rows = all(
    `SELECT p.*, s.name supplier_name, u.name received_by_name,
            (SELECT count(*) FROM purchase_items i WHERE i.purchase_id=p.id) line_count
       FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
       LEFT JOIN users u ON u.id=p.received_by
      ${req.query.status && req.query.status !== 'all' ? 'WHERE p.status=?' : ''}
      ORDER BY p.id DESC LIMIT 200`, ...(req.query.status && req.query.status !== 'all' ? [req.query.status] : []));
  return {
    rows,
    summary: {
      count: rows.length,
      value: money(rows.reduce((s, r) => s + r.total, 0)),
      unpaid: money(rows.filter((r) => r.status !== 'paid').reduce((s, r) => s + (r.total - r.paid), 0)),
      payable: money(one('SELECT coalesce(sum(outstanding),0) FROM suppliers') || 0),
    },
  };
}));

pharmacy.get('/purchases/:id', requireAuth, h((req) => {
  const p = get(`SELECT p.*, s.name supplier_name, s.gstin, s.address FROM purchases p
                   JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?`, +req.params.id);
  if (!p) fail(404, 'grn_not_found');
  p.items = all(`SELECT i.*, m.name medicine_name, m.code medicine_code FROM purchase_items i
                   JOIN medicines m ON m.id=i.medicine_id WHERE i.purchase_id=?`, p.id);
  return p;
}));

/** Receive goods: creates/updates batches and posts stock-in moves. */
pharmacy.get('/price-history/:medicineId', requirePerm('purchase.view'), h(req => all(
  `SELECT pi.*, p.grn_no, p.received_at, s.name supplier_name
   FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id JOIN suppliers s ON s.id=p.supplier_id
   WHERE pi.medicine_id=? ORDER BY p.id DESC,pi.id DESC LIMIT 20`, +req.params.medicineId)));

pharmacy.post('/purchases', requirePerm('purchase.write'), h((req) => {
  const b = req.body || {};
  if (!get('SELECT id FROM suppliers WHERE id=? AND active=1', num(b.supplier_id))) fail(400, 'supplier_required');
  if (b.invoice_no && get('SELECT id FROM purchases WHERE supplier_id=? AND invoice_no=?',num(b.supplier_id),String(b.invoice_no).trim())) fail(409,'supplier_invoice_exists');
  const items = b.items || [];
  if (!items.length) fail(400, 'items_required');
  // expiry may come as the printed MM/YYYY ("2028-06"): a month means its last day
  for (const it of items) if (/^\d{4}-\d{2}$/.test(it.expiry || '')) {
    const [y, m] = it.expiry.split('-').map(Number);
    it.expiry = `${it.expiry}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  }
  const delivery = money(num(b.delivery_charge, 0)), creditNote = money(num(b.credit_note, 0));
  if (![delivery, creditNote].every(Number.isFinite) || delivery < 0 || creditNote < 0) fail(400, 'purchase_values_invalid');
  if (b.received_date && (!/^\d{4}-\d{2}-\d{2}$/.test(b.received_date) || b.received_date > today())) fail(400, 'received_date_invalid');
  // freight in and the supplier's credit note change what the goods cost: spread over the lines by value
  const baseValue = items.reduce((t, it) => t + Math.max(0, num(it.qty) * num(it.rate) * (1 - Number(it.discount_pct || 0) / 100) - num(it.discount, 0)), 0);
  if (creditNote > baseValue + 0.005) fail(400, 'credit_note_exceeds_invoice');
  const adjust = delivery - creditNote;
  return tx(() => {
    const gstMode = b.gst_mode === 'inter' ? 'inter' : 'intra';
    const supplier = get('SELECT * FROM suppliers WHERE id=?', num(b.supplier_id));
    const pid = insert('purchases', {
      grn_no: nextNo('grn'), supplier_id: supplier.id, invoice_no: b.invoice_no ? String(b.invoice_no).trim() : null,
      invoice_date: b.invoice_date, status: 'received', received_by: req.user.id, gst_mode: gstMode,
      due_date: b.due_date || null, remarks: b.remarks,
      ...(b.received_date ? { received_at: `${b.received_date} ${nowIso().slice(11) || '00:00:00'}` } : {}),
      delivery_charge: delivery, credit_note: creditNote,
      invoice_amount: b.invoice_amount === undefined || b.invoice_amount === '' ? null : money(num(b.invoice_amount)),
    });
    let gross = 0, tax = 0, cg = 0, sg = 0, ig = 0;
    const priceChanges = [];
    for (const it of items) {
      const med = get('SELECT * FROM medicines WHERE id=?', num(it.medicine_id));
      if (!med) fail(400, 'unknown_medicine');
      const qty = num(it.qty), free = num(it.free_qty, 0), rate = money(num(it.rate));
      const pack_size=Number(it.pack_size ?? med.pack_size ?? 1), units_per_pack=Number(it.units_per_pack ?? med.units_per_pack ?? 1);
      const rateGst = num(it.gst_pct, med.gst_pct);
      const discount_pct=Number(it.discount_pct || 0);
      const cgst_pct = gstMode === 'inter' ? 0 : Number(it.cgst_pct ?? rateGst / 2);
      const sgst_pct = gstMode === 'inter' ? 0 : Number(it.sgst_pct ?? rateGst / 2);
      const igst_pct = gstMode === 'inter' ? Number(it.igst_pct ?? rateGst) : 0;
      if (![qty,free,rate,pack_size,units_per_pack,discount_pct,cgst_pct,sgst_pct,igst_pct].every(Number.isFinite) || qty<=0 || free<0 || rate<0 || pack_size<=0 || units_per_pack<=0 || discount_pct<0 || discount_pct>100 || [cgst_pct,sgst_pct,igst_pct].some(v=>v<0||v>100) || (igst_pct>0&&(cgst_pct>0||sgst_pct>0))) fail(400,'purchase_values_invalid');
      if (!it.batch_no || !/^\d{4}-\d{2}-\d{2}$/.test(it.expiry||'') || it.expiry<=today() || (it.manufacturing_date && it.manufacturing_date>=it.expiry)) fail(400,'batch_dates_invalid');
      const amount=money(qty*rate*(1-discount_pct/100)-num(it.discount,0));
      if(amount<0)fail(400,'discount_exceeds_value');
      const cgst_amount=money(amount*cgst_pct/100),sgst_amount=money(amount*sgst_pct/100),igst_amount=money(amount*igst_pct/100);
      const gst_pct=cgst_pct+sgst_pct+igst_pct,net_value=money(amount+cgst_amount+sgst_amount+igst_amount);
      gross += amount; tax += cgst_amount+sgst_amount+igst_amount;
      cg += cgst_amount; sg += sgst_amount; ig += igst_amount;
      const unitsReceived = (qty + free) * pack_size * units_per_pack;
      // Free goods carry no cost: the paid value is spread across every unit received.
      const share = baseValue > 0 ? adjust * amount / baseValue : 0;
      const unitCost = unitsReceived ? Math.max(0, amount + share) / unitsReceived : 0;
      const previous = get(`SELECT pi.*,p.grn_no,s.name supplier_name FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id
        JOIN suppliers s ON s.id=p.supplier_id WHERE pi.medicine_id=? AND pi.purchase_id<>? ORDER BY p.id DESC,pi.id DESC LIMIT 1`,med.id,pid);
      if (previous) for (const [price_type, oldPrice, newPrice] of [
        ['Net purchase cost',previous.unit_cost,unitCost],
        ['MRP',previous.mrp/(previous.pack_size*previous.units_per_pack),num(it.mrp)/(pack_size*units_per_pack)],
        ['Selling price',(previous.selling_price ?? previous.mrp)/(previous.pack_size*previous.units_per_pack),num(it.selling_price,it.mrp)/(pack_size*units_per_pack)],
      ]) if (Math.abs(newPrice-oldPrice)>0.0001) priceChanges.push({
        medicine_id:med.id,medicine:med.name,price_type,previous_grn:previous.grn_no,previous_supplier:previous.supplier_name,
        previous_cost:oldPrice,new_cost:newPrice,direction:newPrice>oldPrice?'increase':'decrease',
        percent:oldPrice>0?money((newPrice-oldPrice)/oldPrice*100):null,
      });
      insert('purchase_items', {
        purchase_id: pid, medicine_id: med.id, batch_no: it.batch_no, expiry: it.expiry,
        qty, free_qty: free, rate, mrp: money(num(it.mrp)), gst_pct, amount,
        pack_size,units_per_pack,discount_pct,cgst_pct,sgst_pct,igst_pct,cgst_amount,sgst_amount,igst_amount,taxable_value:amount,net_value,
        brand:it.brand||med.brand,generic:it.generic||med.generic,manufacturer:it.manufacturer||med.manufacturer,hsn:med.hsn,
        manufacturing_date:it.manufacturing_date,purchase_unit:it.purchase_unit||med.purchase_unit,dispensing_unit:it.dispensing_unit||med.dispensing_unit,
        selling_price:num(it.selling_price,it.mrp),rack:it.rack||med.rack,
        package_type:it.package_type||med.package_type,units_received:unitsReceived,unit_cost:unitCost,
      });
      const piId = one('SELECT max(id) FROM purchase_items WHERE purchase_id=?', pid);
      let batch = get("SELECT * FROM medicine_batches WHERE medicine_id=? AND batch_no=? AND location='Central'", med.id, it.batch_no);
      const total = unitsReceived;
      const perUnit = (v) => Math.round(num(v) / (pack_size * units_per_pack) * 10000) / 10000; // qty, rate and MRP are all per purchase unit
      if(batch && batch.expiry!==it.expiry)fail(409,'batch_expiry_mismatch');
      if (batch) {
        // weighted average cost when the same batch arrives twice
        const avg = (batch.qty * batch.purchase_rate + total * unitCost) / (batch.qty + total);
        update('medicine_batches', batch.id, { qty: batch.qty + total, mrp: perUnit(it.mrp),
          selling_price: perUnit(it.selling_price ?? it.mrp), purchase_rate: Math.round(avg * 10000) / 10000 });
      } else {
        batch = { id: insert('medicine_batches', {
          medicine_id: med.id, batch_no: it.batch_no, expiry: it.expiry, mfg_date: it.manufacturing_date || null,
          mrp: perUnit(it.mrp), selling_price: perUnit(it.selling_price ?? it.mrp),
          purchase_rate: Math.round(unitCost * 10000) / 10000, location: 'Central', qty: total,
          supplier_id: supplier.id, rack: it.rack || med.rack, purchase_id: pid,
        }) };
      }
      update('purchase_items', piId, { batch_id: batch.id });
      // Keep the master's package definition current so the next GRN pre-fills correctly.
      update('medicines', med.id, { pack_size, units_per_pack, purchase_unit: it.purchase_unit || med.purchase_unit,
        dispensing_unit: it.dispensing_unit || med.dispensing_unit, package_type: it.package_type || med.package_type,
        gst_pct: cgst_pct + sgst_pct + igst_pct || med.gst_pct }); // HSN belongs to the medicine master, not the GRN
      const after = get('SELECT qty FROM medicine_batches WHERE id=?', batch.id).qty;
      insert('stock_moves', {
        medicine_id: med.id, batch_id: batch.id, move_type: 'purchase', qty: total, location: 'Central',
        balance_after: after, ref_type: 'grn', ref_id: pid, created_by: req.user.id,
      });
    }
    const exact = gross + tax + adjust;
    const roundOff = b.round_off ? money(Math.round(exact) - exact) : 0;
    update('purchases', pid, { gross: money(gross), tax: money(tax), cgst: money(cg), sgst: money(sg), igst: money(ig),
      round_off: roundOff, total: money(exact + roundOff) });
    const row = get('SELECT * FROM purchases WHERE id=?', pid);
    row.price_changes = priceChanges;
    // each change waits for the in-charge's acknowledgement; big increases go to management at once
    recordPriceAlerts(row, priceChanges);
    postPurchase(row);
    run('UPDATE suppliers SET outstanding = outstanding + ? WHERE id=?', row.total, row.supplier_id);
    emit(req, {
      topics: [...TOPICS, 'accounts', 'notifications'], event: 'purchase.received', data: row,
      action: 'grn.create', entity: 'purchases', entityId: pid,
      detail: { after: { grn_no: row.grn_no, supplier: supplier.name, invoice_no: row.invoice_no, total: row.total,
        cgst: row.cgst, sgst: row.sgst, igst: row.igst }, lines: items.length, price_changes:priceChanges },
    });
    return row;
  });
}));

/** GRN verification by the store in-charge: goods, batches and invoice checked against the bill. */
pharmacy.post('/purchases/:id/verify', requirePerm('inventory.approve'), h((req) => {
  const p = get('SELECT * FROM purchases WHERE id=?', +req.params.id);
  if (!p) fail(404, 'grn_not_found');
  if (p.verified_at) fail(409, 'already_verified');
  update('purchases', p.id, { verified_by: req.user.id, verified_at: nowIso(), status: p.status === 'received' ? 'verified' : p.status });
  emit(req, { topics: TOPICS, event: 'purchase.verified', data: { id: p.id }, action: 'grn.verify', entity: 'purchases', entityId: p.id,
    detail: { before: { status: p.status }, after: { status: 'verified' }, reason: req.body?.note } });
  return get('SELECT * FROM purchases WHERE id=?', p.id);
}));

/* -------------------------------------------------------------- analytics */

pharmacy.get('/analytics', requirePerm('pharmacy.view'), h((req) => {
  const from = req.query.from || dateAgo(30);
  const to = req.query.to || today();
  return {
    from, to,
    sales: get(`SELECT count(*) bills, coalesce(sum(total),0) revenue FROM bills
                 WHERE bill_type='PHARM' AND bill_date BETWEEN ? AND ? AND status<>'cancelled'`, from, to),
    cogs: money(one(`SELECT coalesce(sum(abs(sm.qty) * b.purchase_rate),0) FROM stock_moves sm
                      JOIN medicine_batches b ON b.id=sm.batch_id
                     WHERE sm.move_type='sale' AND date(sm.created_at) BETWEEN ? AND ?`, from, to) || 0),
    stock_value: money(one('SELECT coalesce(sum(qty*purchase_rate),0) FROM medicine_batches WHERE qty>0') || 0),
    top_sellers: all(
      `SELECT bi.description, count(*) lines, sum(bi.qty) qty, round(sum(bi.amount),2) value
         FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
        WHERE bi.category='pharmacy' AND b.bill_date BETWEEN ? AND ?
        GROUP BY bi.description ORDER BY value DESC LIMIT 15`, from, to),
    daily: all(
      `SELECT bill_date d, coalesce(sum(total),0) revenue, count(*) bills FROM bills
        WHERE bill_type='PHARM' AND bill_date BETWEEN ? AND ? AND status<>'cancelled'
        GROUP BY bill_date ORDER BY bill_date`, from, to),
    expiry_risk: all(
      `SELECT m.name, b.batch_no, b.expiry, b.qty, round(b.qty*b.purchase_rate,2) value,
              cast(julianday(b.expiry)-julianday('now','localtime') AS int) days
         FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
        WHERE b.qty>0 AND b.expiry <= date('now','localtime','+120 day') ORDER BY b.expiry LIMIT 30`),
    supplier_spend: all(
      `SELECT s.name, count(p.id) grns, round(coalesce(sum(p.total),0),2) value
         FROM suppliers s LEFT JOIN purchases p ON p.supplier_id=s.id AND date(p.received_at) BETWEEN ? AND ?
        GROUP BY s.id ORDER BY value DESC`, from, to),
  };
}));
