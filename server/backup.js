/**
 * Automatic daily backup: one consistent copy of the database per day in
 * data/backups/auto-YYYY-MM-DD.db, made with VACUUM INTO while the server
 * runs. The last 30 daily copies are kept; manual backups are never touched.
 * Copy the backups folder to another drive or cloud storage regularly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, localStamp } from './db.js';

const DIR = path.join(DATA_DIR, 'backups');
const KEEP = 30;

export function dailyBackup() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const day = localStamp().slice(0, 10);
    const file = path.join(DIR, `auto-${day}.db`);
    if (fs.existsSync(file)) return null;
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const autos = fs.readdirSync(DIR).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const f of autos.slice(0, Math.max(0, autos.length - KEEP))) fs.unlinkSync(path.join(DIR, f));
    return file;
  } catch (e) {
    console.error('  daily backup failed:', e.message);
    return null;
  }
}

export function backupStatus() {
  try {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.db')).map((f) => ({ name: f, ...fs.statSync(path.join(DIR, f)) }))
      .map((f) => ({ name: f.name, size: f.size, at: localStamp(f.mtime) })).sort((a, b) => (a.at < b.at ? 1 : -1));
    return { folder: DIR, count: files.length, latest: files[0] || null, auto_kept: KEEP, files: files.slice(0, 40) };
  } catch { return { folder: DIR, count: 0, latest: null, auto_kept: KEEP, files: [] }; }
}
