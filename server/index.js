import express from 'express';
import { backfillPayerCases, syncClaimToBills, releaseApprovedOrders } from './payer-cases.js';
import { billCaseToPayer } from './payer-billing.js';
import { audit } from './auth.js';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { db, all, get, DATA_DIR } from './db.js';
import { seed, isSeeded, ensureHospitalDepartments, ensureOPDServices } from './seed.js';
import { authMiddleware, sessionForToken } from './auth.js';
import { attachRealtime, publish } from './realtime.js';

import { core } from './routes/core.js';
import { staffWork } from './routes/staff-work.js';
import { patients } from './routes/patients.js';
import { opd } from './routes/opd.js';
import { billing } from './routes/billing.js';
import { clinical } from './routes/clinical.js';
import { diagnostics } from './routes/diagnostics.js';
import { pharmacy } from './routes/pharmacy.js';
import { ipd } from './routes/ipd.js';
import { backoffice } from './routes/backoffice.js';
import { inventory } from './routes/inventory.js';
import { wardReplacements } from './routes/ward-replacements.js';
import { accounts } from './routes/accounts.js';
import { attachments } from './routes/attachments.js';
import { approvals } from './routes/approvals.js';
import { desk } from './routes/desk.js';
import { payers } from './routes/payers.js';
import { messages } from './routes/messages.js';
import { demo, addMissingDemoAccounts } from './routes/demo.js';
import { consumption } from './routes/consumption.js';
import { visiting } from './routes/visiting.js';
import { maintenance } from './routes/maintenance.js';
import { stores } from './routes/stores.js';
import { priceAlerts, escalatePriceAlerts } from './routes/price-alerts.js';
import { portal } from './routes/portal.js';
import { counselling, resumeTranscriptions } from './routes/counselling.js';
import { usePackageEngine, useVisitingLedger } from './report-defs.js';
import { doctorLedger } from './routes/visiting.js';
import { packageUsage } from './packages.js';
usePackageEngine(packageUsage);
useVisitingLedger(doctorLedger);
import { sendQueued } from './messages.js';
import { dailyBackup } from './backup.js';
import { accrueAll } from './ipd-charges.js';
import { ensureChart } from './accounting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(__dirname, '..', 'client');
const PORT = Number(process.env.PORT || 4300);
const HOST = process.env.HMS_HOST || '0.0.0.0';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid server port');

ensureChart();
if (!isSeeded()) {
  process.stdout.write('  setting up hospital master data … ');
  const t = Date.now();
  seed();
  console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

ensureHospitalDepartments();
ensureOPDServices();

// every admission billed to a payer has a case on the Insurance & Payer desk
{
  const n = backfillPayerCases();
  const approved = backfillPayerCases.approved || [];
  if (n) console.log(`  opened ${n} payer case(s) for existing admissions`);
  // cases approved by rule at start-up: release their held work and bill the payer, as an approval at the desk would
  const system = { user: { id: null, name: 'system', role: 'system' }, ip: '' };
  const billed = [];
  for (const no of approved) {
    const c = db.prepare('SELECT id FROM insurance_claims WHERE claim_no=?').get(no);
    if (!c) continue;
    syncClaimToBills(c.id);
    releaseApprovedOrders(c.id);
    try { billed.push(...billCaseToPayer(system, c.id)); } catch (e) { console.error('  payer billing at start-up:', e.message); }
  }
  if (n || approved.length) audit(null, 'payer_case.startup', 'insurance_claims', null,
    { after: { opened: n, approved_automatically: approved, billed_to_payer: billed }, reason: 'Start-up: every payer bill on a case; credit / corporate / trust approved by rule' });
}

{ const added = addMissingDemoAccounts(); if (added.length) { console.log(`  demo logins added: ${added.join(', ')}`); audit(null, 'demo.accounts_added', 'users', null, { after: { added }, reason: 'New demo roles while demo mode is on' }); } }

// daily database copy (kept 30 days) and the patient message sender
{ const f = dailyBackup(); if (f) console.log(`  daily backup written: ${f}`); }
setInterval(dailyBackup, 60 * 60 * 1000).unref();
setInterval(() => { try { escalatePriceAlerts(); } catch (e) { console.error('[price-alerts]', e); } }, 60 * 60 * 1000).unref();
setInterval(() => { sendQueued().catch(() => {}); }, 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.HMS_TRUST_PROXY === '1' ? 'loopback' : false);
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version;
/**
 * Health for uptime monitors and the demo tunnel. Says which part failed — application, database or
 * file storage — without paths, URLs or secrets. 200 when healthy, 503 otherwise.
 */
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let database = 'connected', storage = 'writable';
  try { db.prepare('SELECT 1').get(); } catch { database = 'connection_failed'; }
  try { const probe = path.join(DATA_DIR, '.health-probe'); fs.writeFileSync(probe, String(Date.now())); fs.unlinkSync(probe); } catch { storage = 'unavailable'; }
  const healthy = database === 'connected' && storage === 'writable';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unavailable',   // kept as before for the installer / supervisor scripts
    health: healthy ? 'healthy' : database !== 'connected' ? 'database_failure' : 'file_storage_failure',
    api: 'running', database, storage,
    service: 'mgm-hms', version: APP_VERSION, environment: process.env.HMS_ENV || 'local',
    instance: process.env.HMS_INSTANCE || null, serverTime: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()),
  });
});
// Image uploads are larger than ordinary API bodies; they get their own limit.
app.use('/api/attachments', express.json({ limit: '60mb' }));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use('/api', core);
app.use('/api', staffWork);
app.use('/api/patients', patients);
app.use('/api', opd);
app.use('/api', billing);
app.use('/api', clinical);
app.use('/api', diagnostics);
app.use('/api/pharmacy', pharmacy);
app.use('/api/pharmacy', inventory);
app.use('/api/pharmacy', wardReplacements);
app.use('/api/ipd', ipd);
app.use('/api', backoffice);
app.use('/api', accounts);
app.use('/api', attachments);
app.use('/api', approvals);
app.use('/api', desk);
app.use('/api', payers);
app.use('/api', messages);
app.use('/api', demo);
app.use('/api', consumption);
app.use('/api', visiting);
app.use('/api', maintenance);
app.use('/api', stores);
app.use('/api', priceAlerts);
app.use('/api', portal);
app.use('/api', counselling);
resumeTranscriptions();

app.use('/api', (req, res) => res.status(404).json({ error: 'unknown_endpoint', path: req.originalUrl }));
// body that is not valid JSON (or too large): answer in JSON without exposing the stack or file paths
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' });
  console.error('[unhandled]', err);
  return res.status(err.status || 500).json({ error: 'server_error' });
});

// static client
const NO_CACHE = process.env.NODE_ENV !== 'production';
app.use(express.static(CLIENT, {
  extensions: ['html'],
  etag: true,
  setHeaders(res, file) {
    if (/\.(html|js|css|json)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', NO_CACHE ? 'no-store' : 'public, max-age=604800');
  },
}));
if (process.env.NODE_ENV !== 'production' && !['demo', 'staging'].includes(process.env.HMS_ENV)) app.use('/design-source', express.static(path.join(__dirname, '..', 'design-source')));

// SPA fallback — every non-API route renders the shell. Asset folders must 404
// instead, so a missing view controller is a clean 404 and not an HTML payload
// handed to <script type="module">.
const ASSET_PREFIX = /^\/(src|views|assets)\//;
// the patient portal is its own page — patients never load the staff application
app.get(['/my-health', '/my-health/*'], (req, res) => res.sendFile(path.join(CLIENT, 'my-health.html')));
app.get('*', (req, res) => {
  if (ASSET_PREFIX.test(req.path) || path.extname(req.path)) return res.status(404).type('text/plain').send('not found');
  res.sendFile(path.join(CLIENT, 'index.html'));
});

const server = http.createServer(app);
const sockets = attachRealtime(server, sessionForToken);

server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  MGM HMS  ·  ${get('SELECT value FROM settings WHERE key=?', 'hospital_name')?.value || ''}`);
  console.log(`  local      http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  LAN        http://${ip}:${PORT}`));
  console.log('  sign in    using your hospital staff account');
});

// A heartbeat so dashboards and boards stay live even with no user activity.
const heartbeat = setInterval(() => publish(['system'], 'tick', { at: Date.now() }), 30000);
// Inpatient daily charges roll over every hour even if nobody opens the bill.
const accrual = setInterval(() => { try { if (accrueAll()) publish(['ipd', 'billing', 'dashboard'], 'admission.charges', {}); } catch (e) { console.error('[accrual]', e); } }, 3600000);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat); clearInterval(accrual);
  for (const client of sockets.clients) client.terminate();
  sockets.close();
  server.close(() => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch {} process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('message', message => { if (message === 'shutdown') shutdown(); });
// A lost supervisor must not leave an unmonitored child using the database.
if (process.connected) process.on('disconnect', shutdown);
