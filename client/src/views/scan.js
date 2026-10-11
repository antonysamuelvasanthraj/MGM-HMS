/**
 * Scan — what a store QR label opens on a phone (/scan?c=MNT-00012).
 * The label carries this page's address, so any phone camera app works, even on plain http on the LAN.
 * Where the browser offers a camera barcode reader (Android Chrome on https / localhost) the page can scan too;
 * otherwise the code can be typed. Shows the item, its stock, and the actions the user's role allows.
 */
import { page, eyebrow, card, live, mountPage, api, esc, toast, apiError, bind, emptyState, money, fmtDateTime, pill, $, navigate } from './_kit.js';
import { requestMaterials, directIssue, countItem, printLabels } from './stores.js';

const cameraReady = () => 'BarcodeDetector' in window && window.isSecureContext && navigator.mediaDevices?.getUserMedia;

export async function mount(ctx) {
  const code = (ctx.query?.c || '').trim();
  document.title = 'Scan a store label · MGM HMS';
  let stream = null;
  const root = mountPage(ctx, page({
    eyebrow: eyebrow('Stores', 'qr_code_scanner'),
    title: 'Scan a store label',
    subtitle: 'Point the phone camera at a label — it opens this page with the item. Or type the code.',
    body: `<div class="max-w-xl mx-auto space-y-4">
      ${card({ body: `<form data-find class="flex gap-2"><input class="field flex-1 font-data-mono uppercase" name="c" value="${esc(code)}" placeholder="MNT-00001" autocomplete="off" aria-label="Item code">
          <button class="btn-primary">Open</button></form>
        ${cameraReady() ? '<button class="btn-secondary w-full mt-3" data-cam><span class="material-symbols-outlined text-[18px]">photo_camera</span>Scan with this device</button><video data-video class="hidden w-full mt-3 rounded-lg bg-black" playsinline muted></video>'
          : '<p class="text-body-sm text-on-surface-variant mt-3">Tip: open the phone\'s own camera app and point it at the label — the link opens this page.</p>'}` })}
      <div data-item></div></div>`,
  }));

  const open = (c) => navigate(`/scan?c=${encodeURIComponent(c.trim().toUpperCase())}`);
  $('[data-find]', root).onsubmit = (e) => { e.preventDefault(); const c = e.target.c.value.trim(); if (c) open(c); };

  $('[data-cam]', root)?.addEventListener('click', async () => {
    const video = $('[data-video]', root);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream; video.classList.remove('hidden'); await video.play();
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!stream) return;
        const found = await detector.detect(video).catch(() => []);
        const raw = found[0]?.rawValue;
        if (raw) {
          stop();
          const c = (() => { try { return new URL(raw).searchParams.get('c'); } catch { return raw; } })();
          if (c) open(c); else toast('That is not a store label', 'warning');
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { toast(`Camera not available: ${e.message}`, 'warning'); stop(); }
  });
  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; $('[data-video]', root)?.classList.add('hidden'); };

  async function load() {
    const box = $('[data-item]', root);
    if (!code) { box.innerHTML = ''; return; }
    let it;
    try { it = await api.get(`/stores/items/by-code/${encodeURIComponent(code)}`); }
    catch (e) { box.innerHTML = card({ body: emptyState('qr_code', 'No item with that code', e.payload?.error === 'item_not_found' ? `Nothing in the store master is labelled ${esc(code)}.` : 'Could not look it up.') }); return; }
    box.innerHTML = card({ title: it.name, subtitle: `${it.code} · ${it.category_name}${it.unit ? ` · per ${it.unit}` : ''}`,
      body: `${it.can_view ? `<div class="grid grid-cols-2 gap-2 mb-3">
          <div class="rounded-lg border border-outline-variant p-2"><div class="text-label-sm text-on-surface-variant">In stock</div><div class="font-data-mono text-title-md font-semibold">${+(+it.qty).toFixed(3)} ${esc(it.unit)}</div>${it.low ? '<span class="pill-danger">Low — reorder</span>' : ''}</div>
          <div class="rounded-lg border border-outline-variant p-2"><div class="text-label-sm text-on-surface-variant">Value (avg cost ${money(it.avg_cost, 2)})</div><div class="font-data-mono text-title-md font-semibold">${money(it.value, 2)}</div></div></div>
        <div class="text-body-md mb-3">${it.stock.map((s) => `<div class="flex justify-between border-b border-outline-variant/60 py-1"><span>${esc(s.store_name)}</span><span class="font-data-mono">${+(+s.qty).toFixed(3)}</span></div>`).join('') || '<span class="text-on-surface-variant">Not in any store yet.</span>'}</div>
        ${it.spec || it.location_bin ? `<p class="text-body-sm text-on-surface-variant mb-3">${esc([it.spec, it.location_bin && `Bin ${it.location_bin}`].filter(Boolean).join(' · '))}</p>` : ''}`
        : `<p class="text-body-md mb-3">${it.in_stock ? 'Available in the store.' : 'Currently out of stock — you can still request it.'}</p>`}
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-primary" data-act="request"><span class="material-symbols-outlined text-[18px]">add_shopping_cart</span>Request</button>
          ${it.can_write ? `<button class="btn-secondary" data-act="issue">Issue now</button><button class="btn-secondary" data-act="count">Count</button>
            <button class="btn-secondary" data-act="label">Reprint label</button>` : ''}
        </div>
        ${it.moves?.length ? `<div class="field-label mt-4">Recent movements</div>${it.moves.map((m) => `<div class="flex justify-between gap-2 text-body-sm border-b border-outline-variant/60 py-1">
          <span>${fmtDateTime(m.created_at)} · ${pill(m.move_type, m.move_type.replace('_', ' '))} ${esc(m.store)}</span><span class="font-data-mono ${m.qty < 0 ? 'text-danger' : 'text-success'}">${m.qty > 0 ? '+' : ''}${+m.qty}</span></div>`).join('')}` : ''}` });
    bind(box, 'click', '[data-act]', (e, b) => {
      const act = b.dataset.act;
      if (act === 'request') requestMaterials(it, load);
      if (act === 'issue') directIssue(it, load);
      if (act === 'count') countItem(it, load);
      if (act === 'label') printLabels([it]);
    });
  }
  const dispose = live({ topics: ['stores'], load });
  return () => { dispose(); stop(); };
}
