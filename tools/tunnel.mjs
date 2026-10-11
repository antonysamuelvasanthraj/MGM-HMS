/**
 * Public HTTPS address for the HMS running on this computer (Cloudflare Tunnel).
 *
 *   npm run tunnel                 quick tunnel: free https://<words>.trycloudflare.com address,
 *                                  no account needed, changes every time the tunnel restarts
 *   npm run tunnel -- --named NAME named tunnel on your own domain (after `cloudflared tunnel login`
 *                                  and a DNS route for demo.<your-domain>) — a fixed address
 *
 * Only an outbound connection is made; nothing is hosted in the cloud and no port is opened
 * on the router. The HMS, its database and files stay on this computer. Pages, API and the
 * live WebSocket all travel over the same address. Stop with Ctrl+C.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4300);
const dataDir = process.env.SURELY_DATA || path.join(root, 'data');
const named = process.argv.includes('--named') ? process.argv[process.argv.indexOf('--named') + 1] : null;

const candidates = [process.env.CLOUDFLARED, 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe', path.join(root, 'deployment', 'cloudflared.exe')].filter(Boolean);
const exe = candidates.find((p) => fs.existsSync(p)) || 'cloudflared';

const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch(() => null);
if (!health || health.status !== 'ok') {
  console.error(`The HMS is not answering on port ${port}. Start it first (npm run demo or start-demo.cmd), then run the tunnel.`);
  process.exit(1);
}

const args = named ? ['tunnel', '--no-autoupdate', 'run', '--url', `http://localhost:${port}`, named]
  : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
console.log(`Starting Cloudflare Tunnel → http://localhost:${port} …`);
const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let announced = false;
const scan = (buf) => {
  const text = String(buf);
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !announced) {
    announced = true;
    fs.writeFileSync(path.join(dataDir, 'public-url.txt'), `${m[0]}\n`);
    console.log(`\n  PUBLIC DEMO URL   ${m[0]}\n  health            ${m[0]}/api/health\n  (also saved in data/public-url.txt — keep this window open)\n`);
  }
  if (/ERR|error/i.test(text) && !/Thank you for trying Cloudflare/.test(text)) process.stderr.write(text);
  if (named && /Registered tunnel connection/.test(text) && !announced) { announced = true; console.log('  Named tunnel connected — open your demo subdomain.'); }
};
child.stdout.on('data', scan);
child.stderr.on('data', scan);
child.on('exit', (code) => { console.log(`Tunnel stopped (${code}).`); process.exit(code || 0); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
