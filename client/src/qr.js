/**
 * QR code encoder (byte mode, error-correction level M, versions 1–10), no dependencies, so labels print offline.
 * Follows ISO/IEC 18004: Reed–Solomon over GF(256)/0x11D, block interleaving, the eight masks with the
 * standard penalty rules, BCH-coded format and version information.
 *
 *   qrMatrix('https://…') → boolean[][]   (true = dark)
 *   qrSVG('https://…', { size: 120 }) → '<svg …>'
 */

// [total codewords, EC codewords per block, [blocks, data codewords] …] for level M
const M = [null,
  [26, 10, [1, 16]], [44, 16, [1, 28]], [70, 26, [1, 44]], [100, 18, [2, 32]], [134, 24, [2, 43]],
  [172, 16, [4, 27]], [196, 18, [4, 31]], [242, 22, [2, 38], [2, 39]], [292, 22, [3, 36], [2, 37]], [346, 26, [4, 43], [1, 44]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
export function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
export function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}
export const formatBits = (mask) => { const d = (0 << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); return ((d << 10) | rem) ^ 0x5412; };
export const versionBits = (v) => { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); return (v << 12) | rem; };
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function codewords(bytes, ver) {
  const [total, ecLen, ...groups] = M[ver];
  const capacity = total - ecLen * groups.reduce((s, [n]) => s + n, 0);
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);
  const div = rsDivisor(ecLen), blocks = [];
  let k = 0;
  for (const [n, len] of groups) for (let b = 0; b < n; b++) { const d = data.slice(k, k += len); blocks.push({ d, e: rsRemainder(d, div) }); }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

export function qrMatrix(text, { mask: forceMask } = {}) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1;
  while (ver <= 10) { const [total, ecLen, ...g] = M[ver]; const cap = total - ecLen * g.reduce((s, [n]) => s + n, 0); if (bytes.length + (ver < 10 ? 2 : 3) <= cap) break; ver++; }
  if (ver > 10) throw new Error('qr_text_too_long');
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
    }
  }
  const al = ALIGN[ver];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const b = formatBits(mask);
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    const b = versionBits(ver);
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
  }

  const data = codewords(bytes, ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < data.length * 8) { mod[y][x] = bit(data[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0;
    const lines = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
        for (let b = 0; b + 10 < size; b++) {
          const s = Array.from({ length: 11 }, (_, k) => get(a, b + k)).map((v) => (v ? 1 : 0)).join('');
          if (s === '10111010000' || s === '00001011101') p += 40;
        }
      }
    };
    lines((r, c) => mod[r][c]); lines((c, r) => mod[r][c]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    const dark = mod.reduce((s, r) => s + r.filter(Boolean).length, 0);
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = forceMask ?? 0;
  if (forceMask === undefined) {
    let low = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const s = penalty(); if (s < low) { low = s; best = m; } applyMask(m); }
  }
  applyMask(best); drawFormat(best);
  return mod;
}

export function qrSVG(text, { size = 128, quiet = 4, dark = '#000', light = '#fff' } = {}) {
  const m = qrMatrix(text), n = m.length + quiet * 2;
  let path = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
