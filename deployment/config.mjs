import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function readConfig(file) {
  if (!file) throw new Error('Pass the absolute path to server-config.json');
  const c = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  for (const key of ['appDir','dataDir','backupDir','logDir']) {
    if (!path.isAbsolute(c[key] || '') || c[key].startsWith('\\\\')) throw new Error(`${key} must be an absolute local-drive path`);
    c[key] = path.resolve(c[key]);
  }
  const within = (a,b) => a === b || a.startsWith(b + path.sep);
  if (within(c.backupDir,c.dataDir) || within(c.dataDir,c.backupDir)) throw new Error('Backup and data directories must be separate');
  c.port = Number(c.port ?? 4300);
  if (!Number.isInteger(c.port) || c.port < 1024 || c.port > 65535) throw new Error('Port must be 1024–65535');
  c.host = c.host || '0.0.0.0';
  if (!['0.0.0.0','127.0.0.1'].includes(c.host)) throw new Error('Host must be 0.0.0.0 (LAN) or 127.0.0.1 (local only)');
  c.backupHours = Number(c.backupHours ?? 6);
  c.keepBackups = Number(c.keepBackups ?? 28);
  if (!Number.isFinite(c.backupHours) || c.backupHours < 1 || c.backupHours > 168 || !Number.isInteger(c.keepBackups) || c.keepBackups < 2 || c.keepBackups > 1000) throw new Error('Invalid backup schedule or retention');
  return c;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  readConfig(process.argv[2]); console.log('Configuration valid');
}
