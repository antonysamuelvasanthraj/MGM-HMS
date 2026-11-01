/**
 * Code 128 (set B) barcodes as inline SVG — what every lab and ward barcode scanner reads.
 * No library: the hospital LAN has no CDN. A scanner types the code followed by Enter, which the
 * top search box turns into "open that sample / patient / bill".
 */
const P = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
const START_B = 104, STOP = 106;

/** Bar / space widths for `text` (printable ASCII only), start and checksum included. */
export function code128Widths(text) {
  const vals = [...String(text)].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error('Code 128B: printable characters only');
    return c - 32;
  });
  const check = (START_B + vals.reduce((s, v, i) => s + v * (i + 1), 0)) % 103;
  return [START_B, ...vals, check, STOP].map((v) => P[v]).join('');
}

/** `<svg>` barcode. opts: { height (px), module (px per narrow bar), text (show the code under it) }. */
export function barcodeSVG(text, { height = 40, module = 1.4, showText = true, fontSize = 10 } = {}) {
  const widths = code128Widths(text);
  const quiet = 10 * module;
  let x = quiet, bars = '';
  [...widths].forEach((w, i) => {
    const wpx = +w * module;
    if (i % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${wpx.toFixed(2)}" height="${height}"/>`;
    x += wpx;
  });
  const width = x + quiet;
  const h = height + (showText ? fontSize + 3 : 0);
  const label = showText ? `<text x="${(width / 2).toFixed(1)}" y="${height + fontSize + 1}" text-anchor="middle" font-family="monospace" font-size="${fontSize}">${String(text).replace(/[<&]/g, '')}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(1)}" height="${h}" viewBox="0 0 ${width.toFixed(1)} ${h}" fill="#000" role="img" aria-label="Barcode ${String(text).replace(/["<&]/g, '')}">${bars}${label}</svg>`;
}
