/**
 * Manual-test helper: log in with every account from DEMO-LOGINS.local.md,
 * compute the sidebar menu each role should see (same rules as client/src/store.js `can`
 * plus nav.js hideIf), and print a per-user summary. Read-only.
 *
 *   node tools/manual-login-sweep.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import { NAV } from '../client/src/shell/nav.js';

const BASE = process.argv.find((a) => /^https?:/.test(a)) || 'http://localhost:4300';

const md = readFileSync(new URL('../DEMO-LOGINS.local.md', import.meta.url), 'utf8');
const creds = [];
for (const line of md.split('\n')) {
  const m = line.match(/\|[^\|]*\|[^\|]*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
  if (m && !/login\s*id/i.test(m[1])) creds.push({ username: m[1], password: m[2] });
}
creds.push({ username: 'admin', password: 'surely' }); // bootstrap owner/admin account

const can = (perms, perm) => {
  if (Array.isArray(perm)) return perm.some((p) => can(perms, p));
  if (!perm) return true;
  return perms.includes('*') || perms.includes(perm) || perms.includes(`${perm.split('.')[0]}.*`);
};

const menuFor = (perms) => {
  const out = [];
  for (const g of NAV) for (const i of g.items) {
    if (i.perm && !can(perms, i.perm)) continue;
    if (i.hideIf && can(perms, i.hideIf)) continue;
    out.push(i.route);
  }
  return out;
};

const results = [];
let failed = 0;
for (const c of creds) {
  try {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c), signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    if (!j.token) { results.push({ ...c, ok: false, error: j.error || r.status }); failed++; continue; }
    const menu = menuFor(j.user.perms);
    results.push({ ...c, ok: true, role: j.user.role, name: j.user.name, perms: j.user.perms.length, menu });
  } catch (e) { results.push({ ...c, ok: false, error: String(e.message || e) }); failed++; }
}

console.log(`LOGINS: ${results.filter((r) => r.ok).length}/${creds.length} ok, ${failed} failed\n`);
for (const r of results) {
  if (!r.ok) { console.log(`FAIL  ${r.username}  ${r.error}`); continue; }
  console.log(`${r.username.padEnd(20)} ${String(r.role).padEnd(18)} menu=${String(r.menu.length).padStart(2)}  ${r.name}`);
}
if (process.argv.includes('--json')) {
  console.log('\nJSON:' + JSON.stringify(results.map(({ password, ...r }) => r)));
}
process.exit(failed ? 1 : 0);
