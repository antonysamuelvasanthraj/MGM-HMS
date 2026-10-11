/**
 * One command for the hospital demo:  npm run demo
 * Starts the HMS on this computer in demo mode (DEMO ENVIRONMENT badge, proxy-aware for the tunnel),
 * waits until it is healthy, then opens the Cloudflare tunnel and prints the public HTTPS address.
 * If the HMS is already running (e.g. from start-live.cmd) only the tunnel is started.
 * Ctrl+C stops both.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4300);
const env = { ...process.env, HMS_ENV: process.env.HMS_ENV || 'demo', HMS_TRUST_PROXY: '1', PORT: String(port) };
const healthy = () => fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })
  .then((r) => r.json()).then((j) => j.status === 'ok').catch(() => false);

const children = [];
if (!(await healthy())) {
  console.log(`Starting the HMS on port ${port} (demo mode)…`);
  const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: 'inherit' });
  children.push(server);
  server.on('exit', (c) => { console.log(`HMS stopped (${c}).`); process.exit(c || 0); });
  for (let i = 0; i < 60 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await healthy())) { console.error('The HMS did not become healthy; see the messages above.'); process.exit(1); }
} else console.log(`The HMS is already running on port ${port}; starting the tunnel only.`);

console.log(`\n  local             http://localhost:${port}\n  local health      http://localhost:${port}/api/health\n`);
const tunnel = spawn(process.execPath, ['tools/tunnel.mjs'], { cwd: root, env, stdio: 'inherit' });
children.push(tunnel);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of children) c.kill(); process.exit(0); });
