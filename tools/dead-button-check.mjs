/**
 * Static check: every <button> marked with a data-… hook must have code that looks the hook up
 * ([data-x], dataset.x or a bound selector). Buttons with no hook, id or handler are listed too.
 *   node tools/dead-button-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } })(path.join(root, 'client/src'));
const sources = files.map((f) => [f, fs.readFileSync(f, 'utf8')]);
const all = sources.map(([, s]) => s).join('\n');
const skip = new Set(['close', 'id', 'i', 'tip', 'label', 'value']);   // generic helpers / payload attributes
const findings = [];
for (const [file, src] of sources) {
  for (const m of src.matchAll(/<button\b[^>]*>/g)) {
    const tag = m[0];
    if (/type="submit"|type="reset"|onclick=/.test(tag)) continue;
    if (!/\btype=/.test(tag) && !/data-[a-z]/.test(tag)) continue;   // a plain <button> submits its form
    if (/\$\{[^}]*\}=/.test(tag) || /data-\$\{/.test(tag)) continue;  // hook name built at runtime
    const hooks = [...tag.matchAll(/\bdata-([a-z][a-z0-9-]*)/g)].map((x) => x[1]).filter((a) => !skip.has(a));
    // chip / segmented buttons carry only data-v and are handled by their container
    if (hooks.length === 1 && hooks[0] === 'v') continue;
    if (!hooks.length) {
      if (!/\bid=|data-close|role="tab"/.test(tag)) findings.push(`${path.relative(root, file)}: no hook :: ${tag.slice(0, 110)}`);
      continue;
    }
    const rest = all.replace(tag, '');
    const used = hooks.some((a) => {
      const camel = a.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return rest.includes(`[data-${a}`) || rest.includes(`dataset.${camel}`) || rest.includes(`'data-${a}'`) || rest.includes(`"data-${a}"`);
    });
    if (!used) findings.push(`${path.relative(root, file)}: ${hooks.join(',')} :: ${tag.slice(0, 110)}`);
  }
}
console.log(findings.length ? findings.join('\n') : 'every button has a handler');
console.log(`\n${findings.length} finding(s) in ${files.length} files`);
