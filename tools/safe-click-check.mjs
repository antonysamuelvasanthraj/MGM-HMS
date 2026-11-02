/**
 * Browser click-through of the SAFE buttons on every screen, for each login.
 * Clicks only buttons whose label means view / open / filter / search / tab / print / export /
 * refresh / close / next / previous. Never clicks save, pay, post, approve, delete, issue, verify,
 * sign or any other action that changes data. Records JavaScript errors and failed API calls.
 *
 *   node tools/safe-click-check.mjs http://localhost:4300 <login>:<password> [...] --out <dir>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const base = argv[0];
const outIdx = argv.indexOf('--out');
const out = path.resolve(outIdx >= 0 ? argv[outIdx + 1] : path.join(os.tmpdir(), 'safe-click'));
const accounts = argv.slice(1).filter((a, i, all) => a !== '--out' && !(outIdx >= 0 && all[i - 1] === '--out')).map((a) => a.split(':'));
fs.mkdirSync(out, { recursive: true });

const SAFE = /^(view|open|details?|filter|search|find|apply|tab|print|preview|export|download|refresh|reload|close|cancel|next|previous|prev|back|show|more|expand|collapse|all|today|this week|this month|last \d+ days?|reset|clear)\b|^(view|open|filter|search|apply|print|export|refresh|close)/i;
const DANGER = /save|pay|post|approve|reject|delete|remove|issue|receive|verify|sign|confirm|submit|create|add |new |collect|dispense|reverse|cancel receipt|refund|send|publish|discharge|admit|transfer|book|register|generate|lock|unlock|restore|backup|rebuild|reset password|deactivate|activate|change|update|apply package|free|waive|raise/i;

const exe = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
const port = 9800 + Math.floor(Math.random() * 150);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-click-'));
const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

const report = [];
for (const [user, pw] of accounts) {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pw }) }).then((r) => r.json());
  if (!login.token) { report.push({ user, error: 'login failed' }); continue; }
  await send('Page.navigate', { url: `${base}/` }); await sleep(800);
  await evaluate(`localStorage.setItem('surely_token', ${JSON.stringify(login.token)}); true`);
  await send('Page.navigate', { url: `${base}/dashboard` }); await sleep(2500);
  const routes = await evaluate(`[...new Set([...document.querySelectorAll('aside a[href^="/"], nav a[href^="/"]')].map(a => a.getAttribute('href')))].filter(h => !h.startsWith('/display-queue'))`) || [];
  for (const route of routes) {
    events.length = 0;
    await send('Page.navigate', { url: base + route }); await sleep(2200);
    const labels = await evaluate(`[...document.querySelectorAll('main button')].map((b, i) => ({ i, t: (b.innerText || b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim(), d: b.disabled })).filter(x => x.t && !x.d)`) || [];
    const picked = labels.filter((x) => SAFE.test(x.t) && !DANGER.test(x.t)).slice(0, 12);
    for (const b of picked) {
      await evaluate(`(() => { const b = [...document.querySelectorAll('main button')][${b.i}]; if (b) b.click(); return true; })()`);
      await sleep(900);
      await evaluate(`document.querySelectorAll('[role=dialog] button[aria-label="Close"],[role=dialog] [data-close]').forEach(x => x.click()); true`);
    }
    const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description?.split('\n')[0] || e.params.exceptionDetails?.text)
      .concat(events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 500 && e.params.response.url.includes('/api/')).map((e) => `${e.params.response.status} ${e.params.response.url.replace(base, '')}`));
    report.push({ user, route, clicked: picked.map((p) => p.t.slice(0, 40)), skipped: labels.length - picked.length, errors: errs });
  }
}
fs.writeFileSync(path.join(out, 'click-report.json'), JSON.stringify(report, null, 1));
const problems = report.filter((r) => r.error || (r.errors && r.errors.length));
console.log(`screens ${report.length}, clicks ${report.reduce((s, r) => s + (r.clicked?.length || 0), 0)}, problems ${problems.length}`);
for (const p of problems.slice(0, 80)) console.log(p.user, p.route, p.error || '', JSON.stringify(p.errors || []));
ws.close(); br.kill();
setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* browser still closing */ } process.exit(0); }, 800);
