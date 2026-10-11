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

const fmtFor = (spec) => spec.format || (spec.money === false ? (v) => Number(v).toLocaleString('en-IN') : compactMoney);
const fullFmt = (spec) => spec.tooltipFormat || (spec.money === false ? (v) => Number(v).toLocaleString('en-IN') : (v) => money(v));

/* ------------------------------------------------------------- entry point */

/**
 * `chart(host, spec)` — spec: { type: 'line'|'area'|'bar'|'hbar'|'donut', data, x,
 * series: [{key,label,color}], stacked, height, money }. Returns a dispose fn.
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
    host.innerHTML = ({ line: lineChart, area: lineChart, bar: barChart, hbar: hbarChart, donut: donutChart })[spec.type || 'bar'](spec, width);
    wire(host, spec);
  };
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

function legend(series) {
  if (series.length < 2) return '';
  return `<div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-body-sm text-on-surface-variant">${series.map((s, i) =>
    `<span class="inline-flex items-center gap-1.5"><span style="width:10px;height:10px;border-radius:2px;background:${s.color || PALETTE[i]}"></span>${esc(s.label)}</span>`).join('')}</div>`;
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

function lineChart(spec, width) {
  const rows = spec.data, series = spec.series;
  const max = Math.max(...rows.flatMap((r) => series.map((s) => +r[s.key] || 0)), 0);
  const f = frame(spec, width, max);
  const n = rows.length;
  const xAt = (i) => f.pad.l + (n === 1 ? f.w / 2 : (i / (n - 1)) * f.w);
  const yAt = (v) => f.pad.t + f.h - ((+v || 0) / f.top) * f.h;
  const paths = series.map((s, si) => {
    const color = s.color || PALETTE[si];
    const d = rows.map((r, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(r[s.key]).toFixed(1)}`).join(' ');
    const area = spec.type === 'area' || series.length === 1
      ? `<path d="${d} L${xAt(n - 1)},${f.pad.t + f.h} L${xAt(0)},${f.pad.t + f.h} Z" fill="${color}" opacity=".08"/>` : '';
    const dots = n <= 45 ? rows.map((r, i) => `<circle cx="${xAt(i)}" cy="${yAt(r[s.key])}" r="2.6" fill="${color}"/>`).join('') : '';
    return `${area}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const band = f.w / Math.max(1, n);
  const hits = rows.map((_, i) => `<rect data-i="${i}" x="${xAt(i) - band / 2}" y="${f.pad.t}" width="${band}" height="${f.h}" fill="transparent"/>`).join('');
  return `<svg width="${width}" height="${f.height}" viewBox="0 0 ${width} ${f.height}" tabindex="0" role="img"
      aria-label="${esc(spec.label || 'Line chart')}" class="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
    ${f.grid}${paths}<line data-cursor x1="0" x2="0" y1="${f.pad.t}" y2="${f.pad.t + f.h}" stroke="#172B4D" stroke-opacity=".25" visibility="hidden"/>
    ${xLabels(rows, spec, f, xAt)}${hits}</svg>${legend(series)}`;
}

function barChart(spec, width) {
  const rows = spec.data, series = spec.series;
  const totals = rows.map((r) => (spec.stacked ? series.reduce((s, x) => s + (+r[x.key] || 0), 0) : Math.max(...series.map((x) => +r[x.key] || 0))));
  const f = frame(spec, width, Math.max(...totals, 0));
  const n = rows.length;
  const band = f.w / n;
  const groupW = Math.min(band * 0.72, spec.stacked ? 56 : 28 * series.length);
  const xAt = (i) => f.pad.l + band * i + band / 2;
  const hAt = (v) => ((+v || 0) / f.top) * f.h;
  let bars = '';
  rows.forEach((r, i) => {
    let base = f.pad.t + f.h;
    series.forEach((s, si) => {
      const color = s.color || PALETTE[si];
      const hh = hAt(r[s.key]);
      if (spec.stacked) {
        bars += `<rect x="${xAt(i) - groupW / 2}" y="${base - hh}" width="${groupW}" height="${hh}" fill="${color}" rx="2"/>`;
        base -= hh;
      } else {
        const bw = groupW / series.length;
        bars += `<rect x="${xAt(i) - groupW / 2 + bw * si}" y="${f.pad.t + f.h - hh}" width="${Math.max(1, bw - 2)}" height="${hh}" fill="${color}" rx="2"/>`;
      }
    });
  });
  const hits = rows.map((_, i) => `<rect data-i="${i}" x="${f.pad.l + band * i}" y="${f.pad.t}" width="${band}" height="${f.h}" fill="transparent"/>`).join('');
  return `<svg width="${width}" height="${f.height}" viewBox="0 0 ${width} ${f.height}" tabindex="0" role="img"
      aria-label="${esc(spec.label || 'Bar chart')}" class="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
    ${f.grid}${bars}${xLabels(rows, spec, f, xAt)}${hits}</svg>${legend(series)}`;
}

/** Horizontal bars: category names sit on the left and are never squeezed. */
function hbarChart(spec, width) {
  const rows = spec.data, s = spec.series[0];
  const fmt = fmtFor(spec);
  const max = Math.max(...rows.map((r) => +r[s.key] || 0), 0) || 1;
  const labelW = Math.min(170, Math.max(90, width * 0.32));
  const valueW = 64;
  const barW = Math.max(40, width - labelW - valueW - 12);
  const rowH = 30;
  const height = rows.length * rowH + 4;
  const body = rows.map((r, i) => {
    const v = +r[s.key] || 0;
    const lbl = String(r[spec.x] ?? '');
    const maxChars = Math.floor(labelW / 6.6);
    const color = s.color || PALETTE[0];
    return `<g data-i="${i}">
      <rect x="0" y="${i * rowH}" width="${width}" height="${rowH}" fill="transparent"/>
      <text x="${labelW - 8}" y="${i * rowH + 19}" text-anchor="end" font-size="12" fill="#172B4D">${esc(lbl.length > maxChars ? `${lbl.slice(0, maxChars - 1)}…` : lbl)}</text>
      <rect x="${labelW}" y="${i * rowH + 7}" width="${barW}" height="16" fill="#EEF2F7" rx="3"/>
      <rect x="${labelW}" y="${i * rowH + 7}" width="${Math.max(v ? 2 : 0, (v / max) * barW)}" height="16" fill="${color}" rx="3"/>
      <text x="${labelW + barW + 8}" y="${i * rowH + 19}" font-size="12" fill="#172B4D" font-family="JetBrains Mono, monospace">${esc(fmt(v))}</text>
    </g>`;
  }).join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" tabindex="0" role="img"
    aria-label="${esc(spec.label || 'Bar chart')}" class="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">${body}</svg>`;
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
    const color = row.color || PALETTE[i % PALETTE.length];
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
      class="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF2F7" stroke-width="${th}"/>${arcs}
      <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="15" font-weight="600" fill="#172B4D">${esc(fmt(total))}</text>
      <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" font-size="10" fill="#6B778C">TOTAL</text>
    </svg>
    <ul class="flex-1 min-w-0 space-y-1.5 text-body-md">${rows.map((row, i) => `<li data-i="${i}" class="flex items-center gap-2 min-w-0">
      <span class="shrink-0" style="width:10px;height:10px;border-radius:2px;background:${row.color || PALETTE[i % PALETTE.length]}"></span>
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
    <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${s.color || PALETTE[si]}"></span>${esc(s.label || s.key)}</span>
    <b style="font-family:JetBrains Mono,monospace">${esc(full(+r[s.key] || 0))}</b></div>`).join('');
  const extra = spec.type === 'donut' ? (() => {
    const total = spec.data.reduce((a, x) => a + (+x[spec.series[0].key] || 0), 0) || 1;
    return `<div style="opacity:.75;margin-top:2px">${Math.round((+r[spec.series[0].key] / total) * 100)}% of total</div>`;
  })() : '';
  return `<div style="font-weight:600;margin-bottom:4px">${esc(title)}</div>${rowsHTML}${extra}`;
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
