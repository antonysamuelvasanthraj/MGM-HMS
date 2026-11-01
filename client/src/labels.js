/**
 * Printed labels: sample tube (50 × 25 mm), patient wristband (one strip) and file sticker.
 * Each carries a Code 128 barcode a scanner reads back into the HMS.
 */
import { api } from './api.js';
import { setting } from './store.js';
import { esc, fmtDateTime, modal } from './ui.js';
import { barcodeSVG } from './barcode.js';

/** Preview in a frame, like every other printout, then print to the label printer. */
function printRaw(title, css, body) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000}${css}</style></head><body>${body}</body></html>`;
  modal({ title, subtitle: 'Choose the label printer and the label size in the print dialog.', size: 'md', stack: true,
    body: `<iframe title="${esc(title)}" data-label-frame style="width:100%;height:40vh;border:1px solid #ddd;background:white"></iframe>`,
    footer: '<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-print-label disabled>Print</button>',
    onMount(root) {
      const frame = root.querySelector('[data-label-frame]'), button = root.querySelector('[data-print-label]');
      frame.onload = () => { button.disabled = false; };
      button.onclick = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
      frame.srcdoc = html;
    } });
}

/** Tube label(s) for a lab order — `copies` for tests needing more than one tube. */
export async function printTubeLabel(orderId, copies = 1) {
  const o = await api.get(`/labels/order/${orderId}`);
  const code = o.sample_id || o.order_no;
  const one = `<div class="lbl"><div class="row"><b class="nm">${esc(o.name)}</b><span>${o.age_years ?? ''}${esc(String(o.gender || '').slice(0, 1))}</span></div>
    <div class="row sm"><span>${esc(o.uhid)}</span><span>${esc(o.ip_no || o.kind || '')}</span></div>
    <div class="bc">${barcodeSVG(code, { height: 30, module: 1.1, fontSize: 9 })}</div>
    <div class="row sm"><span class="t">${esc(o.label)}</span><span>${o.priority !== 'routine' ? `<b>${esc(o.priority.toUpperCase())}</b>` : ''}</span></div>
    <div class="row sm"><span>${esc(o.sample_type || '')}${o.container ? ` · ${esc(o.container)}` : ''}</span><span>${o.accession_no ? esc(o.accession_no) : ''}</span></div>
    <div class="row xs"><span>${o.collected_at ? esc(fmtDateTime(o.collected_at)) : 'Collected: ________'}</span></div></div>`;
  printRaw(`Tube label ${code}`, `@page{size:50mm 25mm;margin:0}.lbl{width:50mm;height:25mm;padding:1mm 1.5mm;page-break-after:always;overflow:hidden}
    .row{display:flex;justify-content:space-between;gap:2mm;line-height:1.15}.nm{font-size:9pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38mm}
    .sm{font-size:7pt}.xs{font-size:6pt}.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36mm}.bc svg{display:block;margin:0 auto;max-width:47mm;height:auto}`,
    Array.from({ length: Math.max(1, Math.min(6, copies)) }, () => one).join(''));
}

/** Wristband strip (about 250 × 25 mm) for an admitted / ER patient. */
export async function printWristband(patientId) {
  const p = await api.get(`/labels/patient/${patientId}`);
  printRaw(`Wristband ${p.uhid}`, `@page{size:250mm 25mm;margin:0}.wb{width:250mm;height:25mm;display:flex;align-items:center;gap:5mm;padding:0 6mm}
    .info{font-size:9pt;line-height:1.25}.nm{font-size:12pt;font-weight:bold}.al{color:#fff;background:#c00;padding:0 2mm;font-weight:bold;font-size:8pt}`,
    `<div class="wb"><div>${barcodeSVG(p.uhid, { height: 34, module: 1.3, fontSize: 9 })}</div>
      <div class="info"><div class="nm">${esc(p.name)}</div><div>${esc(p.uhid)} · ${p.age_years ?? ''} y ${esc(p.gender || '')}${p.blood_group ? ` · ${esc(p.blood_group)}` : ''}</div>
        <div>${p.admission ? `IP ${esc(p.admission.ip_no)} · ${esc(p.admission.ward || '')} ${esc(p.admission.bed_no || '')} · ${esc(p.admission.consultant || '')}` : esc(setting('hospital_name', ''))}</div></div>
      ${p.allergies.length ? `<div class="al">ALLERGY: ${esc(p.allergies.join(', '))}</div>` : ''}</div>`);
}

/** File / case-sheet sticker (70 × 35 mm). */
export async function printFileSticker(patientId, copies = 2) {
  const p = await api.get(`/labels/patient/${patientId}`);
  const one = `<div class="st"><b style="font-size:10pt">${esc(p.name)}</b><div style="font-size:8pt">${esc(p.uhid)} · ${p.age_years ?? ''} y ${esc(p.gender || '')}${p.mobile ? ` · ${esc(p.mobile)}` : ''}</div>
    ${p.admission ? `<div style="font-size:8pt">IP ${esc(p.admission.ip_no)} · ${esc(p.admission.consultant || '')}</div>` : ''}
    <div style="margin-top:1mm">${barcodeSVG(p.admission?.ip_no || p.uhid, { height: 30, module: 1.2, fontSize: 8 })}</div></div>`;
  printRaw(`Sticker ${p.uhid}`, `@page{size:70mm 35mm;margin:0}.st{width:70mm;height:35mm;padding:2mm 3mm;page-break-after:always;overflow:hidden}.st svg{max-width:64mm;height:auto}`,
    Array.from({ length: Math.max(1, Math.min(10, copies)) }, () => one).join(''));
}
