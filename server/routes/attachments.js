/**
 * Files attached to clinical records — imaging pictures, outside reports,
 * scanned notes. Stored on the hospital server under data/uploads, never in
 * the database; the table keeps who added what and when.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { h, fail, all, get, insert, update, emit, nowIso } from '../lib.js';
import { DATA_DIR } from '../db.js';
import { requireAuth, can } from '../auth.js';

export const attachments = Router();
const ROOT = path.join(DATA_DIR, 'uploads');
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'image/bmp': 'bmp' };
const MAX = 15 * 1024 * 1024;

/** Which records accept files, and who may read / add them. */
const ENTITIES = {
  order: { view: (u) => can(u, 'imaging.view') || can(u, 'lab.view') || can(u, 'patient.clinical'),
    write: (u) => can(u, 'imaging.report') || can(u, 'lab.result'), exists: (id) => get('SELECT id, category, status FROM orders WHERE id=?', id) },
};

const list = (entity, id) => all(`SELECT a.id, a.file_name, a.mime, a.size, a.note, a.created_at, u.name uploaded_by_name
  FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.entity=? AND a.entity_id=? AND a.deleted_at IS NULL ORDER BY a.id`, entity, id);

/** Stream a file. `?t=<session>` works too, so <img src> can show it. */
attachments.get('/attachments/file/:aid', requireAuth, (req, res) => {
  const a = get('SELECT * FROM attachments WHERE id=? AND deleted_at IS NULL', +req.params.aid);
  const e = a && ENTITIES[a.entity];
  if (!a || !e) return res.status(404).json({ error: 'file_not_found' });
  if (!e.view(req.user)) return res.status(403).json({ error: 'forbidden' });
  const full = path.join(ROOT, a.path);
  if (!full.startsWith(ROOT) || !fs.existsSync(full)) return res.status(404).json({ error: 'file_missing' });
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Disposition', `inline; filename="${a.file_name.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(full).pipe(res);
});

attachments.get('/attachments/:entity/:id', requireAuth, h((req) => {
  const e = ENTITIES[req.params.entity];
  if (!e) fail(404, 'unknown_record_type');
  if (!e.view(req.user)) fail(403, 'forbidden');
  return list(req.params.entity, +req.params.id);
}));

/** Upload one or more files as base64 JSON: { files: [{ name, type, data }], note }. */
attachments.post('/attachments/:entity/:id', requireAuth, h((req) => {
  const e = ENTITIES[req.params.entity];
  const id = +req.params.id;
  if (!e) fail(404, 'unknown_record_type');
  if (!e.write(req.user)) fail(403, 'forbidden');
  if (!e.exists(id)) fail(404, 'record_not_found');
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!files.length || files.length > 20) fail(400, 'files_required');
  const dir = path.join(ROOT, req.params.entity, String(id));
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const f of files) {
    const ext = TYPES[f.type];
    if (!ext) fail(400, 'file_type_not_allowed', { name: f.name, allowed: 'JPG, PNG, WEBP, GIF, BMP, PDF' });
    const buf = Buffer.from(String(f.data || '').replace(/^data:[^,]+,/, ''), 'base64');
    if (!buf.length || buf.length > MAX) fail(400, 'file_too_large', { name: f.name, max_mb: 15 });
    const stored = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, stored), buf);
    const aid = insert('attachments', { entity: req.params.entity, entity_id: id, file_name: String(f.name || stored).slice(0, 180),
      mime: f.type, size: buf.length, path: path.join(req.params.entity, String(id), stored), note: req.body.note || null, uploaded_by: req.user.id });
    saved.push(aid);
  }
  emit(req, { topics: ['imaging', 'lab', 'clinical'], event: 'attachments.changed', data: { entity: req.params.entity, id },
    action: 'attachment.add', entity: req.params.entity === 'order' ? 'orders' : req.params.entity, entityId: id,
    detail: { after: { files: files.map((f) => f.name), note: req.body.note } } });
  return list(req.params.entity, id);
}));

/** Remove a file (kept on disk; hidden from the record) — only before the report is signed. */
attachments.post('/attachments/file/:aid/remove', requireAuth, h((req) => {
  const a = get('SELECT * FROM attachments WHERE id=? AND deleted_at IS NULL', +req.params.aid);
  const e = a && ENTITIES[a.entity];
  if (!a || !e) fail(404, 'file_not_found');
  if (!e.write(req.user)) fail(403, 'forbidden');
  if (a.entity === 'order' && get("SELECT 1 FROM orders WHERE id=? AND status='verified'", a.entity_id)) fail(409, 'report_already_signed');
  const reason = String(req.body?.reason || '').trim() || 'Removed by uploader';
  update('attachments', a.id, { deleted_at: nowIso() });
  emit(req, { topics: ['imaging', 'lab'], event: 'attachments.changed', data: { entity: a.entity, id: a.entity_id },
    action: 'attachment.remove', entity: 'orders', entityId: a.entity_id, detail: { before: { file: a.file_name }, reason } });
  return list(a.entity, a.entity_id);
}));
