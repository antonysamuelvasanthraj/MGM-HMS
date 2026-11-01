/**
 * Automatic daily backup: one consistent copy of the database per day in
 * data/backups, including database, uploaded documents and counselling audio.
 * The last 30 daily bundles are kept; manual backups are never touched.
 * Copy the backups folder to another drive or cloud storage regularly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, localStamp } from './db.js';
import { createBackup } from '../deployment/backup.mjs';

const DIR = path.join(DATA_DIR, 'backups');
const KEEP = 30;

let running = false;
export async function dailyBackup() {
  if (running) return null;
  running = true;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const day = localStamp().slice(0, 10);
    const marker = path.join(DIR, 'daily-complete.json');
    try {
      const previous = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (previous.day === day && /^hms-[\w-]+$/.test(previous.name) && fs.existsSync(path.join(DIR, previous.name, 'manifest.json'))) return null;
    } catch { /* First full backup, or missing marker: create a new verified bundle. */ }
    const file = await createBackup({ dataDir: DATA_DIR, backupDir: DIR, keepBackups: KEEP, kind: 'daily' });
    fs.writeFileSync(marker, JSON.stringify({ day, name: path.basename(file) }));
    return file;
  } catch (e) {
    console.error('  daily backup failed:', e.message);
    return null;
  } finally { running = false; }
}

export function backupStatus() {
  try {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.db') || (f.startsWith('hms-') && !f.endsWith('.partial') && fs.existsSync(path.join(DIR, f, 'manifest.json')))).map((f) => ({ name: f, ...fs.statSync(path.join(DIR, f)) }))
      .map((f) => ({ name: f.name, size: f.size, at: localStamp(f.mtime) })).sort((a, b) => (a.at < b.at ? 1 : -1));
    return { folder: DIR, count: files.length, latest: files[0] || null, auto_kept: KEEP, files: files.slice(0, 40) };
  } catch { return { folder: DIR, count: 0, latest: null, auto_kept: KEEP, files: [] }; }
}

/** An explicit backup always captures current data, including referenced uploads. */
export async function manualBackup() {
  return createBackup({ dataDir: DATA_DIR, backupDir: DIR, keepBackups: 1000 });
}
