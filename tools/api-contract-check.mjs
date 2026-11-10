/**
 * Every API path a screen calls must exist on the server.
 * Reads the client source for api.get/post/patch/put/del calls and matches each against the Express routes
 * (with the prefix each router is mounted under in server/index.js).
 *   node tools/api-contract-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])).filter((f) => f.endsWith('.js'));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VAR = '\u0001';   // stands for a ${…} value in a client path
const routeRe = (p) => new RegExp('^' + p.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : escape(seg))).join('/') + '/?$');

/** Replace every ${ … } (braces may nest) with one marker. */
function stripTemplates(s) {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') { let depth = 1; i += 2; while (i < s.length && depth) { if (s[i] === '{') depth++; else if (s[i] === '}') depth--; i++; } out += VAR; } else out += s[i++];
  }
  return out;
}

// router variable → mount prefix
const index = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const mounts = {};
for (const m of index.matchAll(/app\.use\('(\/api[^']*)',\s*(\w+)\)/g)) (mounts[m[2]] ||= []).push(m[1].replace(/^\/api/, ''));

const routes = [];
for (const f of walk(path.join(root, 'server'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\b(\w+)\.(get|post|patch|put|delete)\(\s*['`](\/[^'`]*)['`]/g)) {
    const prefixes = m[1] === 'app' ? [''] : (mounts[m[1]] || ['']);
    for (const pre of prefixes) { const full = ((pre + m[3]).replace(/^\/api/, '').replace(/\/$/, '')) || '/'; routes.push({ method: m[2].toUpperCase(), re: routeRe(full), sample: full.replace(/:\w+/g, 'x') }); }
  }
}

const misses = new Set();
let checked = 0;
for (const f of walk(path.join(root, 'client', 'src'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bapi\.(get|post|patch|put|del|delete)\(\s*(`(?:[^`\\]|\\.)*`|'[^']*'|"[^"]*")/g)) {
    let p = stripTemplates(m[2].slice(1, -1));
    if (!p.startsWith('/')) continue;
    p = p.split('?')[0];
    // a trailing value glued to the path is a query string helper (…/list${qs(…)}), not a segment
    p = p.replace(new RegExp(`([^/])${VAR}$`), '$1');
    const method = m[1] === 'del' ? 'DELETE' : m[1].toUpperCase();
    checked++;
    const open = p.endsWith('/');   // '/thing/' + id + '/more' — only the start of the path is known
    if (open) p += VAR;
    const probe = p.split(VAR).join('x');
    // a ${…} segment may also be a fixed word chosen at run time (…/${id}/${action})
    const clientRe = new RegExp('^' + p.split(VAR).map(escape).join('[^/]+') + (open ? '(/.*)?$' : '$'));
    if (!routes.some((r) => r.method === method && (r.re.test(probe) || clientRe.test(r.sample)))) misses.add(`${method} ${p.split(VAR).join('{…}')}   ${path.relative(root, f)}`);
  }
}
console.log(JSON.stringify({ clientCallsChecked: checked, serverRoutes: routes.length, unmatched: misses.size }));
if (misses.size) { console.log([...misses].sort().join('\n')); process.exitCode = 1; }
