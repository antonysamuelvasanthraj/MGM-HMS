/**
 * Counselling — a recorded conversation with a patient (surgery / procedure consent, diagnosis, discharge,
 * financial) that ends as a doctor-reviewed summary on the patient's record.
 *
 *   session (patient, topic, doctor) → consent to record (who agreed, relation)  — refused: written notes only
 *   → recording (WAV from the browser, or an uploaded wav / mp3 / ogg / flac) stored under data/counselling,
 *     never served statically; every playback is audited
 *   → local transcription with whisper.cpp (nothing leaves the hospital), one job at a time
 *   → summary drafted by the counsellor → reviewed and signed by the doctor (then locked; amendments need a reason)
 */
import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireAuth, can, audit } from '../auth.js';
import { h, fail, all, get, insert, update, num, nowIso, emit, nextNo, publish } from '../lib.js';
import { DATA_DIR } from '../db.js';

export const counselling = Router();
const ROOT = path.join(DATA_DIR, 'counselling');
const WHISPER = process.env.WHISPER_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'whisper');
const CLI = path.join(WHISPER, 'bin', 'Release', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
const MODEL = path.join(WHISPER, 'models', 'ggml-small.bin');
const TYPES = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac' };
export const TOPICS = { surgery: 'Surgery / procedure consent', diagnosis: 'Diagnosis & treatment plan', high_risk: 'High-risk / critical condition', discharge: 'Discharge & home care', financial: 'Cost estimate & payment', medication: 'Medication', other: 'Other' };
export const LANGUAGES = { auto: 'Detect automatically', en: 'English', te: 'Telugu', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', ur: 'Urdu', bn: 'Bengali' };
const canView = (u) => can(u, 'counsel.view') || can(u, 'counsel.write') || can(u, 'counsel.review');
const canWrite = (u) => can(u, 'counsel.write') || can(u, 'counsel.review');
const canReview = (u) => can(u, 'counsel.review');
export const engineReady = () => fs.existsSync(CLI) && fs.existsSync(MODEL);
const view = (id) => get(`SELECT c.*, p.name patient_name, p.uhid, d.name doctor_name, u.name counsellor_name, r.name reviewed_by_name
  FROM counselling_sessions c JOIN patients p ON p.id=c.patient_id LEFT JOIN users d ON d.id=c.doctor_id LEFT JOIN users u ON u.id=c.counsellor_id
  LEFT JOIN users r ON r.id=c.reviewed_by WHERE c.id=?`, id);
const strip = (s, u) => { if (!s) return s; const { recording_path, ...rest } = s; return { ...rest, has_recording: !!recording_path, can_review: canReview(u) && (!s.doctor_id || s.doctor_id === u.id || can(u, 'admin.view')) }; };

/* ------------------------------------------------------- transcription queue */

let running = false;
const waiting = [];
export function queueTranscription(id) { if (!waiting.includes(id)) waiting.push(id); pump(); }
function pump() {
  if (running || !waiting.length) return;
  const id = waiting.shift();
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', id);
  if (!s?.recording_path || !engineReady()) { if (s) update('counselling_sessions', id, { status: 'recorded', transcribe_error: engineReady() ? 'No recording' : 'Transcription engine not installed' }); return pump(); }
  running = true;
  update('counselling_sessions', id, { status: 'transcribing', transcribe_error: null, transcribe_started_at: nowIso() });
  publish(['counselling'], 'counselling.updated', { id });
  const out = path.join(os.tmpdir(), `counsel-${id}-${Date.now()}`);
  const args = ['-m', MODEL, '-f', path.join(ROOT, s.recording_path), '-l', s.language || 'auto', '-t', String(Math.max(2, Math.min(8, os.cpus().length - 2))), '-np', '-oj', '-of', out];
  if (s.translate) args.push('-tr');
  const child = spawn(CLI, args, { windowsHide: true });
  let err = '';
  child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  child.stdout.on('data', () => {});
  const done = (ok, msg) => {
    running = false;
    try {
      if (ok) {
        const j = JSON.parse(fs.readFileSync(`${out}.json`, 'utf8'));
        const segments = (j.transcription || []).map((t) => ({ from: t.timestamps?.from, to: t.timestamps?.to, text: String(t.text || '').trim() }));
        update('counselling_sessions', id, { status: 'transcribed', transcript: segments.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim(),
          transcript_json: JSON.stringify(segments), detected_language: j.result?.language || null, transcribed_at: nowIso() });
        fs.rmSync(`${out}.json`, { force: true });
      } else update('counselling_sessions', id, { status: 'recorded', transcribe_error: String(msg || 'Transcription failed').slice(0, 300) });
    } catch (e) { update('counselling_sessions', id, { status: 'recorded', transcribe_error: String(e.message).slice(0, 300) }); }
    audit({ user: { id: null, name: 'Transcription engine' } }, ok ? 'counselling.transcribed' : 'counselling.transcribe_failed', 'counselling_sessions', id, { after: { ok } });
    publish(['counselling'], 'counselling.updated', { id });
    pump();
  };
  const timer = setTimeout(() => { child.kill(); }, 3 * 3600e3);
  child.on('error', (e) => { clearTimeout(timer); done(false, e.message); });
  child.on('close', (code) => { clearTimeout(timer); done(code === 0 && fs.existsSync(`${out}.json`), code === 0 ? 'No transcript produced' : `Engine exited ${code}: ${err.split('\n').filter(Boolean).pop() || ''}`); });
}
/** On start-up: anything interrupted mid-transcription is queued again. */
export function resumeTranscriptions() {
  try { for (const s of all("SELECT id FROM counselling_sessions WHERE status='transcribing' OR (status='recorded' AND auto_transcribe=1 AND transcript IS NULL AND transcribe_error IS NULL)")) queueTranscription(s.id); } catch { /* table appears with the schema */ }
}

/* ------------------------------------------------------------------ routes */

counselling.get('/counselling/meta', requireAuth, h((req) => {
  if (!canView(req.user)) fail(403, 'forbidden', { need: 'counsel.view' });
  return { topics: TOPICS, languages: LANGUAGES, engine: engineReady(), queue: waiting.length + (running ? 1 : 0),
    consent_text: 'I agree that this counselling conversation is audio-recorded. The recording is kept securely at the hospital, used only for my care and the hospital record, transcribed on the hospital\'s own computer, and not shared outside without my permission. I can ask for the recording to stop at any time.' };
}));

counselling.get('/counselling', requireAuth, h((req) => {
  if (!canView(req.user)) fail(403, 'forbidden', { need: 'counsel.view' });
  const where = [], args = [];
  if (req.query.patient_id) { where.push('c.patient_id=?'); args.push(num(req.query.patient_id)); }
  if (req.query.status === 'review') { where.push("c.status IN ('summary_draft')"); }
  else if (req.query.status === 'open') where.push("c.status NOT IN ('reviewed')");
  else if (req.query.status) { where.push('c.status=?'); args.push(req.query.status); }
  if (req.query.mine) { where.push('(c.counsellor_id=? OR c.doctor_id=?)'); args.push(req.user.id, req.user.id); }
  return all(`SELECT c.id FROM counselling_sessions c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT 300`, ...args).map((r) => strip(view(r.id), req.user));
}));

counselling.get('/counselling/:id', requireAuth, h((req) => {
  if (!canView(req.user)) fail(403, 'forbidden', { need: 'counsel.view' });
  const s = view(+req.params.id) || fail(404, 'session_not_found');
  return { ...strip(s, req.user), segments: JSON.parse(s.transcript_json || '[]'), queue_position: s.status === 'transcribing' ? 0 : waiting.indexOf(s.id) + 1 || null };
}));

/** Open a session. Consent decides whether it may be recorded at all. */
counselling.post('/counselling', requireAuth, h((req) => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'counsel.write' });
  const b = req.body || {};
  const p = get('SELECT * FROM patients WHERE id=?', num(b.patient_id)) || fail(400, 'patient_required');
  if (p.merged_into) fail(409, 'patient_merged', { patient_id: p.merged_into });
  const referenceId = (value, field) => {
    if (value === undefined || value === null || value === '') return null;
    if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(400, `${field}_invalid`);
    return Number(value);
  };
  const encounterId = referenceId(b.encounter_id, 'encounter_id');
  const admissionId = referenceId(b.admission_id, 'admission_id');
  const encounter = encounterId ? get('SELECT id, patient_id FROM encounters WHERE id=?', encounterId) || fail(400, 'encounter_not_found') : null;
  const admission = admissionId ? get('SELECT id, patient_id, encounter_id FROM admissions WHERE id=?', admissionId) || fail(400, 'admission_not_found') : null;
  if (encounter && encounter.patient_id !== p.id) fail(400, 'encounter_patient_mismatch');
  if (admission && admission.patient_id !== p.id) fail(400, 'admission_patient_mismatch');
  if (admission && encounter && admission.encounter_id !== encounter.id) fail(400, 'admission_encounter_mismatch');
  // An admission-only selection uses that stay's encounter, never an unrelated visit.
  const linkedEncounterId = encounterId || admission?.encounter_id || null;
  if (linkedEncounterId && get('SELECT patient_id FROM encounters WHERE id=?', linkedEncounterId)?.patient_id !== p.id) fail(400, 'encounter_patient_mismatch');
  if (!TOPICS[b.topic]) fail(400, 'topic_invalid');
  if (b.language && !LANGUAGES[b.language]) fail(400, 'language_invalid');
  const doctor = b.doctor_id ? get("SELECT id FROM users WHERE id=? AND active=1", num(b.doctor_id)) || fail(400, 'doctor_not_found') : null;
  const consent = b.consent === 'given' ? 1 : b.consent === 'refused' ? 0 : fail(400, 'consent_required');
  if (consent && !String(b.consent_by || '').trim()) fail(400, 'consent_by_required');
  const id = insert('counselling_sessions', {
    session_no: nextNo('counselling'), patient_id: p.id, encounter_id: linkedEncounterId, admission_id: admissionId,
    counsellor_id: req.user.id, doctor_id: doctor?.id || req.user.id, topic: b.topic, language: b.language || 'auto', translate: b.translate ? 1 : 0,
    attendees: b.attendees || null, consent_given: consent, consent_by: b.consent_by || null, consent_relation: b.consent_relation || 'self',
    consent_at: nowIso(), consent_text: consent ? (b.consent_text || null) : null, status: consent ? 'consented' : 'consent_refused', auto_transcribe: 1,
    created_at: nowIso(),
  });
  const s = view(id);
  emit(req, { topics: ['counselling', `patient:${p.id}`], event: 'counselling.updated', data: { id }, action: consent ? 'counselling.consent_given' : 'counselling.consent_refused', entity: 'counselling_sessions', entityId: id,
    detail: { before: null, after: { session_no: s.session_no, topic: s.topic, consent_by: s.consent_by, relation: s.consent_relation }, reason: consent ? 'Recording consented' : 'Recording refused — notes only' } });
  return strip(s, req.user);
}));

/** The audio itself (raw body). Only with consent, once; a re-record replaces it before review. */
counselling.post('/counselling/:id/recording', requireAuth, express.raw({ type: () => true, limit: '400mb' }), h((req) => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'counsel.write' });
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', +req.params.id) || fail(404, 'session_not_found');
  if (!s.consent_given) fail(409, 'no_consent_to_record');
  if (['reviewed', 'summary_draft'].includes(s.status)) fail(409, 'session_closed');
  if (s.status === 'transcribing') fail(409, 'transcription_running');
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type] || fail(415, 'audio_type_not_supported', { supported: 'wav, mp3, ogg, flac' });
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 2000) fail(400, 'recording_empty');
  const dir = path.join(ROOT, s.created_at.slice(0, 7));
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join(s.created_at.slice(0, 7), `${s.session_no}-${Date.now()}.${ext}`);
  fs.writeFileSync(path.join(ROOT, rel), buf);
  if (s.recording_path) fs.rmSync(path.join(ROOT, s.recording_path), { force: true });
  const duration = ext === 'wav' && buf.length > 44 ? Math.round((buf.length - 44) / (buf.readUInt32LE(28) || 32000)) : num(req.query.duration, null);
  update('counselling_sessions', s.id, { recording_path: rel, recording_mime: type, recording_size: buf.length, recording_sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    duration_sec: duration, recorded_at: nowIso(), recorded_by: req.user.id, status: 'recorded', transcript: null, transcript_json: null, transcribe_error: null });
  emit(req, { topics: ['counselling'], event: 'counselling.updated', data: { id: s.id }, action: s.recording_path ? 'counselling.re_recorded' : 'counselling.recorded', entity: 'counselling_sessions', entityId: s.id,
    detail: { before: { recording: !!s.recording_path }, after: { bytes: buf.length, seconds: duration, type } } });
  if (s.auto_transcribe && engineReady()) queueTranscription(s.id);
  return strip(view(s.id), req.user);
}));

counselling.post('/counselling/:id/transcribe', requireAuth, h((req) => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'counsel.write' });
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', +req.params.id) || fail(404, 'session_not_found');
  if (!s.recording_path) fail(409, 'no_recording');
  if (!engineReady()) fail(409, 'engine_not_installed');
  if (s.status === 'transcribing' || waiting.includes(s.id)) fail(409, 'transcription_running');
  if (['reviewed'].includes(s.status)) fail(409, 'session_closed');
  if (req.body?.language && LANGUAGES[req.body.language]) update('counselling_sessions', s.id, { language: req.body.language, translate: req.body.translate ? 1 : 0 });
  queueTranscription(s.id);
  audit(req, 'counselling.transcribe_requested', 'counselling_sessions', s.id, { after: { language: req.body?.language || s.language } });
  return { queued: true, position: waiting.length };
}));

/** Stream the audio — every play is audited. Session token by header or ?t= so <audio src> works. */
counselling.get('/counselling/:id/audio', requireAuth, (req, res) => {
  if (!canView(req.user)) return res.status(403).json({ error: 'forbidden' });
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', +req.params.id);
  if (!s?.recording_path) return res.status(404).json({ error: 'no_recording' });
  const full = path.join(ROOT, s.recording_path);
  if (!full.startsWith(ROOT) || !fs.existsSync(full)) return res.status(404).json({ error: 'file_missing' });
  if (!req.headers.range || /^bytes=0-/.test(req.headers.range)) audit(req, 'counselling.played', 'counselling_sessions', s.id, { after: { session_no: s.session_no } });
  res.setHeader('Content-Type', s.recording_mime || 'audio/wav');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(full, { acceptRanges: true });
});

/** Counsellor's draft summary (structured). */
counselling.patch('/counselling/:id/summary', requireAuth, h((req) => {
  if (!canWrite(req.user)) fail(403, 'forbidden', { need: 'counsel.write' });
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', +req.params.id) || fail(404, 'session_not_found');
  if (s.status === 'reviewed') fail(409, 'already_reviewed', { hint: 'amend' });
  const summary = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : fail(400, 'summary_required');
  const clean = Object.fromEntries(['explained', 'risks', 'alternatives', 'questions', 'decision', 'follow_up', 'notes'].map((k) => [k, String(summary[k] || '').trim()]));
  if (!clean.explained && !clean.notes) fail(400, 'summary_required');
  if (s.status === 'transcribing') fail(409, 'transcription_running');
  const submit = !!req.body?.submit;
  update('counselling_sessions', s.id, { summary_json: JSON.stringify(clean), summary_by: req.user.id, summary_at: nowIso(), ...(submit ? { status: 'summary_draft' } : {}) });
  emit(req, { topics: ['counselling'], event: 'counselling.updated', data: { id: s.id }, action: submit ? 'counselling.summary_submitted' : 'counselling.summary_saved', entity: 'counselling_sessions', entityId: s.id,
    detail: { before: { status: s.status }, after: { status: submit ? 'summary_draft' : s.status } } });
  return strip(view(s.id), req.user);
}));

/** The doctor reviews and signs: the summary becomes part of the patient's record and is locked. */
counselling.post('/counselling/:id/review', requireAuth, h((req) => {
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', +req.params.id) || fail(404, 'session_not_found');
  if (!canReview(req.user)) fail(403, 'forbidden', { need: 'counsel.review' });
  if (s.doctor_id && s.doctor_id !== req.user.id && !can(req.user, 'admin.view')) fail(403, 'not_the_reviewing_doctor');
  if (s.status === 'reviewed') fail(409, 'already_reviewed');
  const summary = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : JSON.parse(s.summary_json || 'null') || fail(400, 'summary_required');
  const clean = Object.fromEntries(['explained', 'risks', 'alternatives', 'questions', 'decision', 'follow_up', 'notes'].map((k) => [k, String(summary[k] || '').trim()]));
  if (!clean.explained && !clean.notes) fail(400, 'summary_required');
  const before = JSON.parse(s.summary_json || 'null');
  update('counselling_sessions', s.id, { summary_json: JSON.stringify(clean), status: 'reviewed', reviewed_by: req.user.id, reviewed_at: nowIso(), review_note: req.body?.note || null });
  emit(req, { topics: ['counselling', `patient:${s.patient_id}`], event: 'counselling.updated', data: { id: s.id }, action: 'counselling.reviewed', entity: 'counselling_sessions', entityId: s.id,
    detail: { before: { status: s.status, summary: before }, after: { status: 'reviewed', summary: clean }, reason: req.body?.note || 'Doctor reviewed and signed' } });
  return strip(view(s.id), req.user);
}));

/** A signed summary is changed only by amendment with a reason (the old text stays in the audit trail). */
counselling.post('/counselling/:id/amend', requireAuth, h((req) => {
  const s = get('SELECT * FROM counselling_sessions WHERE id=?', +req.params.id) || fail(404, 'session_not_found');
  if (!canReview(req.user)) fail(403, 'forbidden', { need: 'counsel.review' });
  if (s.status !== 'reviewed') fail(409, 'not_reviewed_yet');
  const reason = String(req.body?.reason || '').trim() || fail(400, 'reason_required');
  const summary = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : fail(400, 'summary_required');
  const clean = Object.fromEntries(['explained', 'risks', 'alternatives', 'questions', 'decision', 'follow_up', 'notes'].map((k) => [k, String(summary[k] || '').trim()]));
  update('counselling_sessions', s.id, { summary_json: JSON.stringify(clean), reviewed_by: req.user.id, reviewed_at: nowIso(), amended: (s.amended || 0) + 1 });
  emit(req, { topics: ['counselling', `patient:${s.patient_id}`], event: 'counselling.updated', data: { id: s.id }, action: 'counselling.amended', entity: 'counselling_sessions', entityId: s.id,
    detail: { before: { summary: JSON.parse(s.summary_json || 'null') }, after: { summary: clean }, reason } });
  return strip(view(s.id), req.user);
}));
