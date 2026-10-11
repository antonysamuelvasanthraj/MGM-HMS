import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { readConfig } from './config.mjs';

const hash = file => new Promise((resolve,reject) => {
  const h=crypto.createHash('sha256'), stream=fs.createReadStream(file);
  stream.on('error',reject); stream.on('data',chunk=>h.update(chunk)); stream.on('end',()=>resolve(h.digest('hex')));
});
function inside(root, relative) {
  const full=path.resolve(root, relative);
  if (full===root || !full.startsWith(root+path.sep)) throw new Error('Unsafe attachment path');
  return full;
}
export async function verifyBackup(directory) {
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if (manifest.format!==1 || !manifest.files?.some(f=>f.path==='surelyhms.db')) throw new Error('Invalid backup manifest');
  for (const f of manifest.files) if (await hash(inside(path.resolve(directory),f.path))!==f.sha256) throw new Error(`Backup checksum mismatch: ${f.path}`);
  const check=new DatabaseSync(path.join(directory,'surelyhms.db'),{readOnly:true});
  try {
    if (check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('Backup database integrity check failed');
    if (check.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup contains broken database references');
  } finally { check.close(); }
  return manifest;
}
export async function createBackup(c) {
  const dbFile=path.join(c.dataDir,'surelyhms.db');
  if (!fs.existsSync(dbFile)) throw new Error('Database missing; backup not created');
  fs.mkdirSync(c.backupDir,{recursive:true});
  const name='hms-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
  const pending=path.join(c.backupDir,name+'.partial'),destination=path.join(c.backupDir,name);
  fs.mkdirSync(pending);
  const source=new DatabaseSync(dbFile,{readOnly:true});
  try { await backup(source,path.join(pending,'surelyhms.db')); } finally { source.close(); }
  const snapshot=new DatabaseSync(path.join(pending,'surelyhms.db'),{readOnly:true});
  let attachments;
  try { attachments=snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='attachments'").get() ? snapshot.prepare('SELECT DISTINCT path FROM attachments').all() : []; }
  finally { snapshot.close(); }
  const files=['surelyhms.db'];
  // Upload filenames are immutable; copy exactly the files referenced by the DB snapshot,
  // including soft-deleted attachments retained for the audit history.
  for (const a of attachments) {
    const relative=path.join('uploads',a.path), from=inside(c.dataDir,relative), to=inside(pending,relative);
    if (!fs.existsSync(from) || fs.lstatSync(from).isSymbolicLink()) throw new Error(`Referenced upload missing or linked: ${a.path}`);
    fs.mkdirSync(path.dirname(to),{recursive:true}); fs.copyFileSync(from,to); files.push(relative);
  }
  const manifest={format:1,createdAt:new Date().toISOString(),node:process.version,files:[]};
  for (const relative of files) manifest.files.push({path:relative,sha256:await hash(path.join(pending,relative))});
  fs.writeFileSync(path.join(pending,'manifest.json'),JSON.stringify(manifest,null,2));
  await verifyBackup(pending);
  fs.renameSync(pending,destination);
  // Only this tool's completed, manifest-bearing backup folders are retained/pruned.
  const names=fs.readdirSync(c.backupDir).filter(n=>/^hms-\d{4}-[\dTZ-]+-[a-f0-9]{6}$/.test(n) && fs.existsSync(path.join(c.backupDir,n,'manifest.json'))).sort().reverse();
  for (const old of names.slice(c.keepBackups)) fs.rmSync(inside(c.backupDir,old),{recursive:true});
  return destination;
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2]==='verify') { await verifyBackup(path.resolve(process.argv[3])); console.log('Backup verified'); }
    else console.log(await createBackup(readConfig(process.argv[2])));
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
