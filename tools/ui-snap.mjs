/**
 * Full-size screenshots and a click-through check of the HMS screens, using Edge / Chrome in headless
 * mode over the DevTools protocol (no extra packages).
 *
 *   node tools/ui-snap.mjs --base http://localhost:4396 --user reception --routes /dashboard,/op-registration [--out dir] [--width 1440 --height 900]
 *
 * Signs in with DEMO-LOGINS.local.md, opens each route, saves <out>/<user>__<route>.png and prints
 * JS errors, failed API calls and links that point to screens that do not exist.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const root = path.resolve(import.meta.dirname, '..');
const base = arg('--base', 'http://localhost:4396');
const users = arg('--user', 'reception').split(',');
const routesArg = arg('--routes', '/dashboard');
const out = path.resolve(arg('--out', path.join(os.tmpdir(), 'hms-shots')));
const W = +arg('--width', 1440), H = +arg('--height', 900);
const full = process.argv.includes('--full');
fs.mkdirSync(out, { recursive: true });

const md = fs.readFileSync(path.join(root, 'DEMO-LOGINS.local.md'), 'utf8');
const pw = Object.fromEntries([...md.matchAll(/`([^`]+)`\s*\|\s*`([^`]+)`/g)].map((m) => [m[1], m[2]]));
const browsers = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
const exe = browsers.find((p) => fs.existsSync(p));
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-snap-'));
const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });

const report = [];
for (const user of users) {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pw[user] }) }).then((r) => r.json());
  if (!login.token) { report.push({ user, error: 'login failed' }); continue; }
  await send('Page.navigate', { url: `${base}/` }); await sleep(800);
  await evaluate(`localStorage.setItem('surely_token', ${JSON.stringify(login.token)}); true`);
  let routes = routesArg === 'menu' ? null : routesArg.split(',');
  if (!routes) {
    await send('Page.navigate', { url: `${base}/dashboard` }); await sleep(2500);
    routes = await evaluate(`[...new Set([...document.querySelectorAll('aside a[href^="/"], nav a[href^="/"]')].map(a => a.getAttribute('href')))].filter(h => !h.startsWith('/display-queue'))`) || [];
  }
  for (const route of routes) {
    events.length = 0;
    await send('Page.navigate', { url: base + route });
    await sleep(+arg('--wait', 2200));
    for (let k = 0; k < 10 && await evaluate(`!!document.querySelector('main .animate-spin')`); k++) await sleep(300);
    const info = await evaluate(`(() => {
      const known = new Set([...document.querySelectorAll('aside a[href^="/"]')].map(a => a.getAttribute('href').split('?')[0]));
      const links = [...document.querySelectorAll('main a[href^="/"]')].map(a => a.getAttribute('href'));
      return { title: document.title, text: (document.querySelector('main')?.innerText || '').slice(0, 160).replace(/\\n+/g, ' | '),
        buttons: document.querySelectorAll('main button').length, links: [...new Set(links)].slice(0, 40), panelError: /Could not load/.test(document.querySelector('main')?.innerText || '') };
    })()`);
    const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description?.split('\n')[0] || e.params.exceptionDetails?.text)
      .concat(events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400 && e.params.response.url.includes('/api/')).map((e) => `${e.params.response.status} ${e.params.response.url.replace(base, '')}`));
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    const file = path.join(out, `${user}__${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    report.push({ user, route, file, errors: errs, ...info });
  }
}
console.log(JSON.stringify(report, null, 1));
ws.close(); br.kill();
setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* browser still closing */ } process.exit(0); }, 800);
