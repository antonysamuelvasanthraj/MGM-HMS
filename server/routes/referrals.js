import { Router } from 'express';
import { requireAuth, can } from '../auth.js';
import { h, fail, all, get, insert, update, emit } from '../lib.js';

export const referrals = Router();
export function referralFields(body) {
  const row = {};
  for (const [field, kind] of [['referral_doctor_id','doctor'],['referral_hospital_id','hospital']]) if (field in body) {
    const id = Number(body[field]) || null;
    if (id && !get('SELECT id FROM referral_sources WHERE id=? AND kind=? AND active=1', id, kind)) fail(400, 'referral_source_invalid');
    row[field] = id;
  }
  for (const field of ['referral_reason','referral_remarks']) if (field in body) row[field] = String(body[field] || '').trim() || null;
  return row;
}
referrals.get('/referral-sources', requireAuth, h(req => {
  if (!can(req.user, 'patient.view') && !can(req.user, 'reports.reception')) fail(403, 'forbidden');
  return all(`SELECT * FROM referral_sources ${req.query.active ? 'WHERE active=1' : ''} ORDER BY kind,name`);
}));
function writeAccess(req) {
  if (!can(req.user, 'patient.edit') && !can(req.user, 'admin.write')) fail(403, 'forbidden');
}
function fields(body, partial = false) {
  const row = {};
  for (const k of ['kind','name','hospital','speciality','mobile','remarks']) if (k in body) row[k] = String(body[k] || '').trim() || null;
  if ((!partial || 'name' in row) && !row.name) fail(400, 'name_required');
  if ((!partial || 'kind' in row) && !['doctor','hospital'].includes(row.kind)) fail(400, 'referral_kind_invalid');
  if ('active' in body) row.active = body.active === false || body.active === 0 || body.active === '0' ? 0 : 1;
  return row;
}
referrals.post('/referral-sources', requireAuth, h(req => {
  writeAccess(req); const row = fields(req.body || {});
  const id = insert('referral_sources', { ...row, created_by: req.user.id });
  emit(req, { topics: ['patients'], event: 'referral.changed', action: 'referral.create', entity: 'referral_sources', entityId: id, detail: { after: row } });
  return get('SELECT * FROM referral_sources WHERE id=?', id);
}));
referrals.patch('/referral-sources/:id', requireAuth, h(req => {
  writeAccess(req); const before = get('SELECT * FROM referral_sources WHERE id=?', +req.params.id) || fail(404, 'referral_not_found');
  const row = fields(req.body || {}, true);
  if (row.kind && row.kind !== before.kind) fail(400, 'referral_kind_immutable');
  update('referral_sources', before.id, row);
  emit(req, { topics: ['patients'], event: 'referral.changed', action: 'referral.update', entity: 'referral_sources', entityId: before.id, detail: { before, after: row } });
  return get('SELECT * FROM referral_sources WHERE id=?', before.id);
}));
