/**
 * Static wiring check between the screens and the server:
 *   - every API call a screen makes has a server route (a missing one is a dead button),
 *   - every realtime event a screen waits for is published by the server,
 *   - every sidebar badge is computed by the server,
 *   - every data-changing route writes an audit / sync entry.
 * Exits 1 when a screen calls an endpoint that does not exist.  Run: node tools/wiring-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const serverFiles = walk(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'));
const clientFiles = walk(path.join(ROOT, 'client', 'src')).filter((f) => f.endsWith('.js'));

// routers mounted under a prefix in server/index.js; every other router is mounted at /api
const index = read(path.join(ROOT, 'server', 'index.js'));
const PREFIX = Object.fromEntries([...index.matchAll(/app\.use\('\/api(\/[a-z-]+)',\s*([a-zA-Z]+)\)/g)].map((m) => [m[2], m[1]]));

const routes = [];
for (const f of serverFiles.filter((x) => x.includes(`${path.sep}routes${path.sep}`))) {
  for (const m of read(f).matchAll(/\b([a-zA-Z]+)\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
    const full = ((PREFIX[m[1]] || '') + m[3]).replace(/(.)\/$/, '$1');
    const re = new RegExp('^' + full.replace(/:[a-zA-Z_]+(\([^)]*\))?/g, '[^/]+') + '/?$');
    routes.push({ method: m[2].toUpperCase(), path: full, re });
  }
}

const missing = [];
let calls = 0;
for (const f of clientFiles) {
  const s = read(f);
  for (const m of s.matchAll(/api\.(get|post|patch|put|del|delete)\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
    calls++;
    let p = m[2].slice(1, -1).split('?')[0];
    p = p.split('${qs')[0].split('${show')[0].replace(/\$\{[^}]*\}/g, 'X');
    if (/^X/.test(p)) continue;                                   // fully dynamic path
    const method = { del: 'DELETE', delete: 'DELETE' }[m[1]] || m[1].toUpperCase();
    const probe = p.replace(/X/g, 'approve');                     // an id or an action word
    const probe2 = p.replace(/X/g, '1');
    if (!routes.some((r) => r.method === method && (r.re.test(probe) || r.re.test(probe2)))) {
      missing.push(`${method} ${m[2].slice(0, 90)}  @ ${rel(f)}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
}

const emitted = new Set();
for (const f of serverFiles) {
  const s = read(f);
  for (const m of s.matchAll(/['`]([a-z_]+\.[a-z_.]+)['`]/g)) emitted.add(m[1]);
}
const dead = [];
for (const f of clientFiles) {
  for (const m of read(f).matchAll(/events:\s*\[([^\]]*)\]/g)) {
    for (const e of m[1].matchAll(/'([a-z_.]+)'/g)) if (!emitted.has(e[1]) && !['presence', 'tick'].includes(e[1])) dead.push(`${e[1]} ← ${rel(f)}`);
  }
}

const core = read(path.join(ROOT, 'server', 'routes', 'core.js'));
const badges = [...read(path.join(ROOT, 'client', 'src', 'shell', 'nav.js')).matchAll(/badge:\s*'([^']+)'/g)].map((m) => m[1]);
const badgeMissing = badges.filter((b) => !core.includes(`'${b}'`) && !core.includes(`"${b}"`));

const unaudited = [];
const AUDITED = /emit\(|audit\(|takePayment|settleBill|addSettlement|refund\(|receiveSettlement|cancelPayment|cancelSettlement|billCaseToPayer|reversePayerBilling|dispense\(|staffEvent\(|saveClinicSession\(|fail\(400, 'use_/;
for (const f of serverFiles.filter((x) => x.includes(`${path.sep}routes${path.sep}`))) {
  const s = read(f);
  const all = [...s.matchAll(/\b[a-zA-Z]+\.(post|patch|put|delete)\(\s*'([^']+)'/g)];
  all.forEach((m, i) => {
    if (/auth\/(login|logout)|\/read$|\/use$|staff-work\/chat|sync\/flush/.test(m[2])) return;   // reads, counters and chat are not audited
    const body = s.slice(m.index, i + 1 < all.length ? all[i + 1].index : s.length);
    if (!AUDITED.test(body)) unaudited.push(`${m[1].toUpperCase()} ${m[2]}  (${rel(f)})`);
  });
}

const report = { routes: routes.length, clientCalls: calls, deadButtons: missing, deadListeners: dead, badgesNotComputed: badgeMissing, unauditedMutations: unaudited };
console.log(JSON.stringify(report, null, 1));
process.exit(missing.length ? 1 : 0);
