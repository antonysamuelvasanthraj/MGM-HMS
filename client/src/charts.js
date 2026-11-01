/**
 * Charts. Plain SVG, no library — the hospital LAN has no CDN.
 *
 * Every chart measures its container and re-renders on resize, so axis labels
 * are thinned to fit instead of overlapping, long category names go on
 * horizontal bars, and every data point has a tooltip (mouse, touch and
 * keyboard: focus the chart and use ← →).
 */
import { esc, compactMoney, money } from './ui.js';

export const PALETTE = ['#881D2C', '#C3A256', '#2563EB', '#0F766E', '#7C3AED', '#EA580C', '#526176', '#16A34A', '#DB2777', '#0891B2'];
const CALM = ['#0B4C84', '#17A2B8', '#F59E0B', '#7C3AED', '#16A34A', '#EA580C', '#526176', '#DB2777', '#0891B2', '#881D2C'];
/** Series colours follow the theme: navy and teal first in Calm blue, maroon and gold in MGM maroon. */
const pal = () => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'maroon' ? PALETTE : CALM);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const shortLabel = (v) => (isDate(v) ? `${+v.slice(8, 10)} ${MON[+v.slice(5, 7) - 1]}` : String(v ?? ''));

let tip;
function tooltip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'status');
  Object.assign(tip.style, {
    position: 'fixed', zIndex: 80, pointerEvents: 'none', background: '#172B4D', color: '#fff', borderRadius: '8px',
    padding: '8px 10px', font: '12px/1.45 Inter, system-ui, sans-serif', boxShadow: '0 6px 18px rgba(23,43,77,.25)',
    display: 'none', maxWidth: '280px',
  });
  document.body.append(tip);
  return tip;
}
function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 14))}px`;
  t.style.top = `${Math.max(8, y - h - 12)}px`;
}
const hideTip = () => { if (tip) tip.style.display = 'none'; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const fmtFor = (spec) => spec.format || (spec.money === false ? (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : compactMoney);
const fullFmt = (spec) => spec.tooltipFormat || (spec.money === false ? (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : (v) => money(v));

/* ------------------------------------------------------------- entry point */

/**
 * `chart(host, spec)` — spec: { type: 'line'|'area'|'bar'|'combo'|'hbar'|'donut', data, x,
 * series: [{key,label,color,as:'line'|'bar',dashed}], stacked, height, money,
 * stats (total/average/peak strip), avg (dashed average line), peak (marks the highest point),
 * share (hbar % of total, on by default), smooth (default on) }. Returns a dispose fn.
 */
export function chart(host, spec) {
  if (!host) return () => {};
  spec = { series: [{ key: spec.value || 'value', label: spec.valueLabel || 'Value' }], x: 'label', ...spec };
  if (spec.type === 'donut') spec.data = (spec.data || []).filter((r) => +r[spec.series[0].key] > 0);
  const draw = () => {
    const width = Math.max(240, host.clientWidth || 600);
    const rows = spec.data || [];
    const hasData = rows.length && spec.series.some((s) => rows.some((r) => +r[s.key]));
    if (!hasData) { host.innerHTML = emptyChart(spec.empty); return; }
    host.innerHTML = ({ line: cartesian, area: cartesian, bar: cartesian, combo: cartesian, hbar: hbarChart, donut: donutChart })[spec.type || 'bar'](spec, width);
    wire(host, spec);
    spec._animate = false;   // grow in once; resizes redraw without replaying it
  };
  spec._animate = true;
  draw();
  let frame;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
  ro.observe(host);
  return () => { ro.disconnect(); hideTip(); };
}

function emptyChart(text = 'No data for this period') {
  return `<div class="chart-empty grid place-items-center text-center text-on-surface-variant py-10">
    <span class="material-symbols-outlined text-[32px] opacity-40">bar_chart</span>
    <div class="text-body-md mt-1">${esc(text)}</div></div>`;
}

function legend(series, spec = {}) {
  if (series.length < 2) return '';
  const asLine = (x) => spec.type === 'line' || spec.type === 'area' || (spec.type === 'combo' && x.as === 'line');
  return `<div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-body-sm text-on-surface-variant">${series.map((x, i) =>
    `<span class="inline-flex items-center gap-1.5"><span style="width:${asLine(x) ? 14 : 10}px;height:${asLine(x) ? 3 : 10}px;border-radius:2px;background:${x.color || pal()[i]}"></span>${esc(x.label)}</span>`).join('')}</div>`;
}

/* ---------------------------------------------------------- cartesian axes */

function frame(spec, width, max) {
  const height = spec.height || 220;
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const top = niceMax(max);
  const fmt = fmtFor(spec);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: top * f, y: pad.t + h - h * f }));
  const grid = ticks.map((t) => `<line x1="${pad.l}" x2="${pad.l + w}" y1="${t.y}" y2="${t.y}" stroke="#E6EBF2" ${t.v ? 'stroke-dasharray="3 3"' : ''}/>
    <text x="${pad.l - 8}" y="${t.y + 4}" text-anchor="end" font-size="11" fill="#6B778C">${esc(fmt(t.v))}</text>`).join('');
  return { height, pad, w, h, top, grid };
}

/** X labels thinned so they never collide: at most one per ~70px. */
function xLabels(rows, spec, f, xAt) {
  const n = rows.length;
  const room = Math.max(1, Math.floor(f.w / 70));
  const step = Math.max(1, Math.ceil(n / room));
  let out = '';
  for (let i = 0; i < n; i += step) {
    const lbl = shortLabel(rows[i][spec.x]);
    out += `<text x="${xAt(i)}" y="${f.pad.t + f.h + 18}" text-anchor="middle" font-size="11" fill="#6B778C">${esc(lbl.length > 12 ? `${lbl.slice(0, 11)}…` : lbl)}</text>`;
  }
  return out;
}

let gid = 0;

/** Smooth path through points (monotone cubic — never overshoots below zero or above a peak). */
function smooth(pts) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const n = pts.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  let out = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    out += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return out;
}
/** A bar with rounded top corners only. */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Total · average · peak for the first series, shown above a trend chart (spec.stats). */
function statsStrip(spec) {
  if (!spec.stats) return '';
  const s = spec.series[0], rows = spec.data, fmt = fmtFor(spec);
  const vals = rows.map((r) => (spec.stacked ? spec.series.reduce((t, x) => t + (+r[x.key] || 0), 0) : +r[s.key] || 0));
  const total = vals.reduce((a, b) => a + b, 0);
  const peakI = vals.indexOf(Math.max(...vals));
  const item = (label, value, sub = '') => `<div class="min-w-0"><div class="text-label-sm uppercase tracking-wide text-on-surface-variant">${esc(label)}</div>
    <div class="font-data-mono text-body-lg font-semibold text-on-surface">${esc(value)}${sub ? `<span class="text-body-sm font-normal text-on-surface-variant"> ${esc(sub)}</span>` : ''}</div></div>`;
  return `<div class="flex flex-wrap gap-x-8 gap-y-2 mb-3">${item(spec.stacked ? 'Total' : `${s.label || 'Total'} · total`, fmt(total))}${item(`Average per ${spec.per || 'day'}`, fmt(total / (vals.length || 1)))}
    ${item('Highest', fmt(vals[peakI] || 0), shortLabel(rows[peakI]?.[spec.x]))}</div>`;
}

/** Line, area, bar and combo (bars with line series on top, `as: 'line'`) share one frame. */
function cartesian(spec, width) {
  const rows = spec.data, series = spec.series, n = rows.length;
  const kind = (s) => (spec.type === 'combo' ? s.as || 'bar' : spec.type === 'bar' ? 'bar' : 'line');
  const barS = series.filter((s) => kind(s) === 'bar'), lineS = series.filter((s) => kind(s) === 'line');
  const barTop = rows.map((r) => (spec.stacked ? barS.reduce((a, s) => a + (+r[s.key] || 0), 0) : Math.max(0, ...barS.map((s) => +r[s.key] || 0))));
  const lineTop = rows.flatMap((r) => lineS.map((s) => +r[s.key] || 0));
  const f = frame(spec, width, Math.max(0, ...barTop, ...lineTop));
  const hasBars = barS.length > 0;
  const band = f.w / Math.max(1, n);
  const xAt = hasBars ? (i) => f.pad.l + band * i + band / 2 : (i) => f.pad.l + (n === 1 ? f.w / 2 : (i / (n - 1)) * f.w);
  const yAt = (v) => f.pad.t + f.h - ((+v || 0) / f.top) * f.h;
  const colorOf = (s) => s.color || pal()[series.indexOf(s)];
  const anim = spec._animate ? ' chart-anim' : '';

  let bars = '';
  if (hasBars) {
    const groupW = Math.min(band * 0.7, spec.stacked ? 44 : 22 * barS.length);
    rows.forEach((r, i) => {
      let base = f.pad.t + f.h;
      const last = spec.stacked ? barS.map((s) => +r[s.key] || 0).findLastIndex((v) => v > 0) : -1;
      barS.forEach((s, si) => {
        const hh = ((+r[s.key] || 0) / f.top) * f.h;
        if (spec.stacked) {
          bars += si === last ? `<path class="c-bar" d="${barPath(xAt(i) - groupW / 2, base - hh, groupW, hh)}" fill="${colorOf(s)}"/>`
            : hh > 0 ? `<rect class="c-bar" x="${xAt(i) - groupW / 2}" y="${base - hh}" width="${groupW}" height="${hh}" fill="${colorOf(s)}"/>` : '';
          base -= hh;
        } else {
          const bw = groupW / barS.length;
          bars += `<path class="c-bar" d="${barPath(xAt(i) - groupW / 2 + bw * si, f.pad.t + f.h - hh, Math.max(1, bw - 2), hh)}" fill="${colorOf(s)}"/>`;
        }
      });
    });
  }

  let defs = '', lines = '';
  lineS.forEach((s) => {
    const color = colorOf(s);
    const pts = rows.map((r, i) => [xAt(i), yAt(r[s.key])]);
    const d = spec.smooth === false ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') : smooth(pts);
    if (spec.type === 'area' || (lineS.length === 1 && !hasBars)) {
      const id = `cg${++gid}`;
      defs += `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`;
      lines += `<path class="c-area" d="${d} L${xAt(n - 1).toFixed(1)},${f.pad.t + f.h} L${xAt(0).toFixed(1)},${f.pad.t + f.h} Z" fill="url(#${id})"/>`;
    }
    lines += `<path class="c-line" pathLength="1" d="${d}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
    if (n <= 31 && !s.dashed) lines += pts.map(([x, y]) => `<circle class="c-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff" stroke="${color}" stroke-width="1.6"/>`).join('');
  });

  // reference marks: dashed average of the first series, and its peak
  let marks = '';
  const first = series[0];
  const vals = rows.map((r) => +r[first.key] || 0);
  if (spec.avg && n > 2) {
    const avg = vals.reduce((a, b) => a + b, 0) / n, y = yAt(avg);
    marks += `<line x1="${f.pad.l}" x2="${f.pad.l + f.w}" y1="${y}" y2="${y}" stroke="#6B778C" stroke-dasharray="4 4" stroke-opacity=".8"/>
      <text x="${f.pad.l + f.w - 4}" y="${y - 5}" text-anchor="end" font-size="10.5" fill="#526176">Avg ${esc(fmtFor(spec)(avg))}</text>`;
  }
  if (spec.peak && n > 2 && Math.max(...vals) > 0) {
    const i = vals.indexOf(Math.max(...vals)), x = xAt(i), y = yAt(vals[i]);
    const anchor = x > f.pad.l + f.w - 50 ? 'end' : x < f.pad.l + 50 ? 'start' : 'middle';
    marks += `<circle cx="${x}" cy="${y}" r="4.5" fill="${colorOf(first)}" stroke="#fff" stroke-width="2"/>
      <text x="${x}" y="${Math.max(f.pad.t + 10, y - 9)}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="#172B4D">${esc(fmtFor(spec)(vals[i]))}</text>`;
  }

  const hitW = hasBars ? band : n > 1 ? f.w / (n - 1) : f.w;
  const hits = rows.map((_, i) => `<rect data-i="${i}" x="${xAt(i) - hitW / 2}" y="${f.pad.t}" width="${hitW}" height="${f.h}" fill="transparent"/>`).join('');
  return `${statsStrip(spec)}<svg width="${width}" height="${f.height}" viewBox="0 0 ${width} ${f.height}" tabindex="0" role="img"
      aria-label="${esc(spec.label || 'Chart')}" class="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded${anim}">
    <defs>${defs}</defs>${f.grid}<line data-cursor x1="0" x2="0" y1="${f.pad.t}" y2="${f.pad.t + f.h}" stroke="#172B4D" stroke-opacity=".18" visibility="hidden"/>
    ${bars}${lines}${marks}${xLabels(rows, spec, f, xAt)}${hits}</svg>${legend(series, spec)}`;
}

/** Horizontal bars: category names sit on the left and are never squeezed. */
function hbarChart(spec, width) {
  const rows = spec.data, s = spec.series[0];
  const fmt = fmtFor(spec);
  const max = Math.max(...rows.map((r) => +r[s.key] || 0), 0) || 1;
  const labelW = Math.min(170, Math.max(90, width * 0.32));
  const total = rows.reduce((a, r) => a + (+r[s.key] || 0), 0) || 1;
  const share = spec.share !== false && rows.length > 1;
  const valueW = share ? 104 : 64;
  const barW = Math.max(40, width - labelW - valueW - 12);
  const rowH = 30;
  const height = rows.length * rowH + 4;
  const body = rows.map((r, i) => {
    const v = +r[s.key] || 0;
    const lbl = String(r[spec.x] ?? '');
    const maxChars = Math.floor(labelW / 6.6);
    const color = s.color || pal()[0];
    return `<g data-i="${i}">
      <rect x="0" y="${i * rowH}" width="${width}" height="${rowH}" fill="transparent"/>
      <text x="${labelW - 8}" y="${i * rowH + 19}" text-anchor="end" font-size="12" fill="#172B4D">${esc(lbl.length > maxChars ? `${lbl.slice(0, maxChars - 1)}…` : lbl)}</text>
      <rect x="${labelW}" y="${i * rowH + 7}" width="${barW}" height="16" fill="#EEF2F7" rx="3"/>
      <rect class="c-hbar" x="${labelW}" y="${i * rowH + 7}" width="${Math.max(v ? 3 : 0, (v / max) * barW)}" height="16" fill="${color}" rx="4"/>
      <text x="${labelW + barW + 8}" y="${i * rowH + 19}" font-size="12" fill="#172B4D" font-family="JetBrains Mono, monospace">${esc(fmt(v))}${share ? `<tspan fill="#6B778C" font-size="11"> ${Math.round((v / total) * 100)}%</tspan>` : ''}</text>
    </g>`;
  }).join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" tabindex="0" role="img"
    aria-label="${esc(spec.label || 'Bar chart')}" class="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded${spec._animate ? ' chart-anim' : ''}">${body}</svg>`;
}

function donutChart(spec, width) {
  const rows = spec.data;
  const key = spec.series[0].key;
  const total = rows.reduce((s, r) => s + (+r[key] || 0), 0) || 1;
  const size = Math.min(170, Math.max(120, width * 0.4));
  const th = 22, r = (size - th) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const arcs = rows.map((row, i) => {
    const frac = (+row[key] || 0) / total;
    const color = row.color || pal()[i % pal().length];
    const el = `<circle data-i="${i}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${th}"
      stroke-dasharray="${(frac * c).toFixed(2)} ${(c - frac * c).toFixed(2)}" stroke-dashoffset="${(-off * c).toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="cursor:pointer"/>`;
    off += frac;
    return el;
  }).join('');
  const fmt = fmtFor(spec);
  const stacked = width < 380;
  return `<div class="flex ${stacked ? 'flex-col' : 'items-center'} gap-4">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" tabindex="0" role="img" aria-label="${esc(spec.label || 'Share chart')}"
      class="${spec._animate ? 'chart-anim ' : ''}shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF2F7" stroke-width="${th}"/>${arcs}
      <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="15" font-weight="600" fill="#172B4D">${esc(fmt(total))}</text>
      <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" font-size="10" fill="#6B778C">TOTAL</text>
    </svg>
    <ul class="flex-1 min-w-0 space-y-1.5 text-body-md">${rows.map((row, i) => `<li data-i="${i}" class="flex items-center gap-2 min-w-0">
      <span class="shrink-0" style="width:10px;height:10px;border-radius:2px;background:${row.color || pal()[i % pal().length]}"></span>
      <span class="truncate flex-1">${esc(row[spec.x])}</span>
      <span class="font-data-mono tnum">${esc(fmt(+row[key]))}</span>
      <span class="font-data-mono text-on-surface-variant w-11 text-right">${Math.round((+row[key] / total) * 100)}%</span></li>`).join('')}</ul>
  </div>`;
}

/* ---------------------------------------------------------------- tooltips */

function tipHTML(spec, i) {
  const r = spec.data[i];
  const full = fullFmt(spec);
  const title = spec.type === 'donut' || spec.type === 'hbar' ? String(r[spec.x]) : (isDate(r[spec.x]) ? `${shortLabel(r[spec.x])} ${r[spec.x].slice(0, 4)}` : String(r[spec.x]));
  const rowsHTML = spec.series.map((s, si) => `<div style="display:flex;gap:10px;justify-content:space-between">
    <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${s.color || pal()[si]}"></span>${esc(s.label || s.key)}</span>
    <b style="font-family:JetBrains Mono,monospace">${esc(full(+r[s.key] || 0))}</b></div>`).join('');
  const extra = spec.type === 'donut' ? (() => {
    const total = spec.data.reduce((a, x) => a + (+x[spec.series[0].key] || 0), 0) || 1;
    return `<div style="opacity:.75;margin-top:2px">${Math.round((+r[spec.series[0].key] / total) * 100)}% of total</div>`;
  })() : '';
  const prev = i > 0 && ['line', 'area', 'bar', 'combo'].includes(spec.type || 'bar') && spec.x !== 'label' ? spec.data[i - 1] : null;
  const k0 = spec.series[0].key;
  const delta = prev && +prev[k0] ? (() => {
    const pctChange = Math.round(((+r[k0] - +prev[k0]) / Math.abs(+prev[k0])) * 100);
    return `<div style="opacity:.8;margin-top:3px">${pctChange >= 0 ? '▲' : '▼'} ${Math.abs(pctChange)}% vs previous</div>`;
  })() : '';
  return `<div style="font-weight:600;margin-bottom:4px">${esc(title)}</div>${rowsHTML}${extra}${delta}`;
}

function wire(host, spec) {
  const svg = host.querySelector('svg');
  if (!svg) return;
  const cursor = svg.querySelector('[data-cursor]');
  let focusIdx = -1;
  const point = (i, x, y) => {
    showTip(tipHTML(spec, i), x, y);
    if (cursor) {
      const hit = svg.querySelector(`[data-i="${i}"]`);
      const bx = +hit.getAttribute('x') + +hit.getAttribute('width') / 2;
      cursor.setAttribute('x1', bx); cursor.setAttribute('x2', bx); cursor.setAttribute('visibility', 'visible');
    }
  };
  const leave = () => { hideTip(); cursor?.setAttribute('visibility', 'hidden'); };
  host.onmousemove = (e) => {
    const t = e.target.closest('[data-i]');
    if (!t || !host.contains(t)) { leave(); return; }
    point(+t.dataset.i, e.clientX, e.clientY);
  };
  host.onmouseleave = leave;
  host.ontouchstart = (e) => {
    const t = e.target.closest('[data-i]');
    if (t) { const p = e.touches[0]; point(+t.dataset.i, p.clientX, p.clientY); }
  };
  svg.onkeydown = (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    const n = spec.data.length;
    focusIdx = (focusIdx + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    const b = svg.getBoundingClientRect();
    point(focusIdx, b.left + b.width / 2, b.top + 20);
  };
  svg.onblur = leave;
}

/* ---------------------------------------------------------------- helpers */

/** Mount several charts at once: `mountCharts(root, {selector: spec})`. */
export function mountCharts(root, specs) {
  const disposers = Object.entries(specs).map(([sel, spec]) => chart(root.querySelector(sel), spec));
  return () => disposers.forEach((d) => d());
}
