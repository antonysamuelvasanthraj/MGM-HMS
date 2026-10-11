/**
 * Payer master and packages.
 *
 * A payer is anyone other than the patient who pays: an insurer, a TPA, the
 * Aarogyasri scheme, a corporate, a trust or a credit account. Each payer can
 * have its own packages (fixed price per procedure, with inclusions,
 * exclusions and expected stay) and its own agreed rates for individual
 * services. Hospital packages are packages with no payer.
 */
import { Router } from 'express';
import { COVER_CATEGORIES } from '../packages.js';
import { h, fail, all, get, insert, update, run, emit, num, money, nowIso, tx } from '../lib.js';
import { requireAuth, can } from '../auth.js';

export const payers = Router();
const TOPICS = ['insurance', 'billing', 'admin'];
export const PAYER_KINDS = ['insurance', 'tpa', 'aarogyasri', 'corporate', 'trust'];
const canView = (u) => can(u, 'insurance.view') || can(u, 'admin.view') || can(u, 'billing.view');
const canEdit = (u) => can(u, 'insurance.write') || can(u, 'admin.write');
const need = (ok) => (req, res, next) => (ok(req.user) ? next() : res.status(403).json({ error: 'forbidden' }));
const FIELDS = ['code', 'name', 'payer_type', 'contact_person', 'phone', 'email', 'address', 'gstin', 'credit_days', 'discount_pct',
  'empanelled_from', 'empanelled_to', 'notes', 'active'];

function clean(b, partial = false) {
  const row = {};
  for (const k of FIELDS) if (k in b) row[k] = typeof b[k] === 'string' ? b[k].trim() || null : b[k];
  if (!partial || 'name' in row) { if (!row.name) fail(400, 'name_required'); }
  if ('payer_type' in row && !PAYER_KINDS.includes(row.payer_type)) fail(400, 'payer_type_invalid');
  if ('credit_days' in row) row.credit_days = Math.max(0, Math.round(num(row.credit_days, 30)));
  if ('discount_pct' in row) { row.discount_pct = num(row.discount_pct, 0); if (row.discount_pct < 0 || row.discount_pct > 100) fail(400, 'discount_invalid'); }
  if ('active' in row) row.active = row.active ? 1 : 0;
  return row;
}

/* ------------------------------------------------------------------ payers */

payers.get('/payers', requireAuth, need(canView), h((req) => all(
  `SELECT py.*,
      (SELECT count(*) FROM patients p WHERE p.payer_id=py.id) patients,
      (SELECT count(*) FROM insurance_claims c WHERE c.payer_id=py.id AND c.status NOT IN ('settled','rejected')) open_cases,
      (SELECT coalesce(sum(c.estimate - c.settled),0) FROM insurance_claims c WHERE c.payer_id=py.id AND c.status NOT IN ('settled','rejected')) open_value,
      (SELECT count(*) FROM packages k WHERE k.payer_id=py.id AND k.active=1) packages,
      (SELECT count(*) FROM service_rates r WHERE r.payer_id=py.id) rates
    FROM payers py ${req.query.all ? '' : 'WHERE py.active=1'} ORDER BY py.active DESC, py.name`)));

payers.get('/payers/:id', requireAuth, need(canView), h((req) => {
  const p = get('SELECT * FROM payers WHERE id=?', +req.params.id) || fail(404, 'payer_not_found');
  p.packages = all(`SELECT k.*, (SELECT count(*) FROM package_items i WHERE i.package_id=k.id) item_count FROM packages k WHERE k.payer_id=? ORDER BY k.active DESC, k.name`, p.id);
  p.rates = all(`SELECT r.id, r.service_id, r.price, s.code, s.name, s.category, s.price list_price FROM service_rates r JOIN services s ON s.id=r.service_id
    WHERE r.payer_id=? ORDER BY s.category, s.name`, p.id);
  p.cases = all(`SELECT c.id, c.claim_no, c.status, c.estimate, c.approved, c.settled, pt.name patient_name, pt.uhid FROM insurance_claims c
    JOIN patients pt ON pt.id=c.patient_id WHERE c.payer_id=? ORDER BY c.id DESC LIMIT 50`, p.id);
  return p;
}));

payers.post('/payers', requireAuth, need(canEdit), h((req) => {
  const row = clean(req.body || {});
  if (get('SELECT 1 FROM payers WHERE lower(name)=lower(?)', row.name)) fail(409, 'payer_exists');
  const id = insert('payers', row);
  const saved = get('SELECT * FROM payers WHERE id=?', id);
  emit(req, { topics: TOPICS, event: 'payer.saved', data: saved, action: 'payer.create', entity: 'payers', entityId: id, detail: { after: saved } });
  return saved;
}));

payers.patch('/payers/:id', requireAuth, need(canEdit), h((req) => {
  const before = get('SELECT * FROM payers WHERE id=?', +req.params.id) || fail(404, 'payer_not_found');
  const row = clean(req.body || {}, true);
  if (row.name && get('SELECT 1 FROM payers WHERE lower(name)=lower(?) AND id<>?', row.name, before.id)) fail(409, 'payer_exists');
  update('payers', before.id, { ...row, updated_at: nowIso() });
  if (row.name && row.name !== before.name) {
    run('UPDATE patients SET payer_name=? WHERE payer_id=?', row.name, before.id);
    run("UPDATE insurance_claims SET tpa=? WHERE payer_id=? AND status NOT IN ('settled','rejected')", row.name, before.id);
  }
  const saved = get('SELECT * FROM payers WHERE id=?', before.id);
  emit(req, { topics: TOPICS, event: 'payer.saved', data: saved, action: 'payer.update', entity: 'payers', entityId: before.id,
    detail: { before: Object.fromEntries(Object.keys(row).map((k) => [k, before[k]])), after: row, reason: req.body?.reason } });
  return saved;
}));

/** Agreed service rates for a payer: [{service_id, price}] — price empty removes the override. */
payers.put('/payers/:id/rates', requireAuth, need(canEdit), h((req) => {
  const p = get('SELECT * FROM payers WHERE id=?', +req.params.id) || fail(404, 'payer_not_found');
  const lines = Array.isArray(req.body?.rates) ? req.body.rates : [];
  const changed = [];
  tx(() => {
    for (const l of lines) {
      const sid = num(l.service_id);
      if (!get('SELECT 1 FROM services WHERE id=?', sid)) fail(400, 'service_not_found', { service_id: sid });
      const old = get('SELECT * FROM service_rates WHERE payer_id=? AND service_id=?', p.id, sid);
      if (l.price === '' || l.price === null || l.price === undefined) {
        if (old) { run('DELETE FROM service_rates WHERE id=?', old.id); changed.push({ service_id: sid, before: old.price, after: null }); }
        continue;
      }
      const price = money(num(l.price));
      if (price < 0) fail(400, 'price_invalid');
      if (old) { if (old.price !== price) { update('service_rates', old.id, { price }); changed.push({ service_id: sid, before: old.price, after: price }); } }
      else { insert('service_rates', { service_id: sid, payer: p.name, payer_id: p.id, price }); changed.push({ service_id: sid, before: null, after: price }); }
    }
  });
  emit(req, { topics: TOPICS, event: 'payer.saved', data: { id: p.id }, action: 'payer.rates', entity: 'payers', entityId: p.id, detail: { after: changed } });
  return all(`SELECT r.id, r.service_id, r.price, s.code, s.name, s.category, s.price list_price FROM service_rates r JOIN services s ON s.id=r.service_id
    WHERE r.payer_id=? ORDER BY s.category, s.name`, p.id);
}));

/** Agreed rates that apply to one patient (their payer), for order screens. */
payers.get('/payer-rates/patient/:id', requireAuth, h((req) => {
  const p = get('SELECT payer_id, payer_type, payer_name FROM patients WHERE id=?', +req.params.id) || fail(404, 'patient_not_found');
  if (!p.payer_id || p.payer_type === 'self') return { payer_name: null, rates: {} };
  return { payer_name: p.payer_name, rates: Object.fromEntries(all('SELECT service_id, price FROM service_rates WHERE payer_id=?', p.payer_id).map((r) => [r.service_id, r.price])) };
}));

/* ---------------------------------------------------------------- packages */

const PKG_FIELDS = ['code', 'name', 'category', 'price', 'mrp', 'validity_days', 'description', 'payer_id', 'hospital_package_id', 'payer_code', 'los_days', 'inclusions', 'exclusions', 'active', 'cover_categories', 'pharmacy_limit'];
function cleanPackage(b, partial = false) {
  const row = {};
  for (const k of PKG_FIELDS) if (k in b) row[k] = typeof b[k] === 'string' ? b[k].trim() || null : b[k];
  if (!partial || 'name' in row) if (!row.name) fail(400, 'name_required');
  if (!partial || 'code' in row) if (!row.code) fail(400, 'code_required');
  if (!partial || 'price' in row) { row.price = money(num(row.price)); if (!(row.price >= 0)) fail(400, 'price_invalid'); }
  if ('mrp' in row) row.mrp = row.mrp === null ? null : money(num(row.mrp));
  for (const k of ['validity_days', 'los_days']) if (k in row) row[k] = row[k] === null ? null : Math.max(0, Math.round(num(row[k])));
  if ('payer_id' in row) { row.payer_id = row.payer_id ? num(row.payer_id) : null; if (row.payer_id && !get('SELECT 1 FROM payers WHERE id=?', row.payer_id)) fail(400, 'payer_not_found'); }
  if ('hospital_package_id' in row) row.hospital_package_id = row.hospital_package_id ? num(row.hospital_package_id) : null;
  if ('active' in row) row.active = row.active ? 1 : 0;
  // coverage rules: which charge categories the package pays for (none chosen = all-inclusive), and a medicine limit
  if ('cover_categories' in row) {
    const list = Array.isArray(row.cover_categories) ? row.cover_categories : row.cover_categories ? String(row.cover_categories).split(',') : null;
    const ok = COVER_CATEGORIES.map(([k]) => k);
    row.cover_categories = list && list.length ? JSON.stringify([...new Set(list.map((x) => String(x).trim()).filter((x) => ok.includes(x)))]) : null;
  }
  if ('pharmacy_limit' in row) row.pharmacy_limit = row.pharmacy_limit === null || row.pharmacy_limit === '' ? null : money(Math.max(0, num(row.pharmacy_limit)));
  return row;
}
function validatePackageAgreement(row, id = null) {
  if (!row.hospital_package_id) return;
  row.hospital_package_id = num(row.hospital_package_id);
  const base = get('SELECT * FROM packages WHERE id=? AND active=1 AND payer_id IS NULL', row.hospital_package_id);
  if (!row.payer_id || !base || base.id === id) fail(400, 'hospital_package_invalid');
  if (row.active !== 0 && get('SELECT id FROM packages WHERE hospital_package_id=? AND payer_id=? AND active=1 AND id<>?', base.id, row.payer_id, id || 0)) fail(409, 'package_agreement_exists');
}
function saveItems(pkgId, items) {
  if (!Array.isArray(items)) return;
  run('DELETE FROM package_items WHERE package_id=?', pkgId);
  for (const it of items) {
    const sid = num(it.service_id);
    if (!get('SELECT 1 FROM services WHERE id=?', sid)) fail(400, 'service_not_found', { service_id: sid });
    insert('package_items', { package_id: pkgId, service_id: sid, qty: Math.max(1, Math.round(num(it.qty, 1))) });
  }
}
const packageView = (id) => {
  const p = get(`SELECT k.*, (SELECT name FROM packages WHERE id=k.hospital_package_id) hospital_package_name, py.name payer_name, py.payer_type FROM packages k LEFT JOIN payers py ON py.id=k.payer_id WHERE k.id=?`, id);
  if (p) p.items = all('SELECT i.*, s.name, s.code, s.price, s.category FROM package_items i JOIN services s ON s.id=i.service_id WHERE i.package_id=?', id);
  return p;
};

payers.post('/payer-packages', requireAuth, need((u) => canEdit(u) || can(u, 'admin.view')), h((req) => tx(() => {
  const row = cleanPackage(req.body || {});
  if (get('SELECT 1 FROM packages WHERE code=?', row.code)) fail(409, 'package_code_exists');
  validatePackageAgreement(row);
  const id = insert('packages', row);
  saveItems(id, req.body?.items || []);
  const p = packageView(id);
  emit(req, { topics: TOPICS, event: 'package.created', data: { id }, action: 'package.create', entity: 'packages', entityId: id, detail: { after: p } });
  return p;
})));

payers.patch('/payer-packages/:id', requireAuth, need((u) => canEdit(u) || can(u, 'admin.view')), h((req) => tx(() => {
  const before = packageView(+req.params.id) || fail(404, 'package_not_found');
  const row = cleanPackage(req.body || {}, true);
  if (row.code && get('SELECT 1 FROM packages WHERE code=? AND id<>?', row.code, before.id)) fail(409, 'package_code_exists');
  validatePackageAgreement({ ...before, ...row }, before.id);
  if (row.payer_id && !before.payer_id && get('SELECT id FROM packages WHERE hospital_package_id=?', before.id)) fail(409, 'hospital_package_has_agreements');
  if (Object.keys(row).length) update('packages', before.id, row);
  saveItems(before.id, req.body?.items);
  const p = packageView(before.id);
  emit(req, { topics: TOPICS, event: 'package.created', data: { id: p.id }, action: 'package.update', entity: 'packages', entityId: p.id,
    detail: { before: { price: before.price, payer_id: before.payer_id, items: before.items.length }, after: { price: p.price, payer_id: p.payer_id, items: p.items.length }, reason: req.body?.reason } });
  return p;
})));

payers.get('/payer-packages/:id', requireAuth, h((req) => packageView(+req.params.id) || fail(404, 'package_not_found')));
