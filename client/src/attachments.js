/**
 * Attach images and documents to a record (imaging studies, outside reports,
 * scanned notes). Files are read in the browser and uploaded to the hospital
 * server; thumbnails open full size in a new tab.
 */
import { api, token } from './api.js';
import { esc, toast, confirmDialog } from './ui.js';

export const fileUrl = (id) => `/api/attachments/file/${id}?t=${encodeURIComponent(token())}`;

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, type: file.type, data: String(r.result) });
  r.onerror = () => reject(new Error(`Could not read ${file.name}`));
  r.readAsDataURL(file);
});

function tiles(list, canEdit) {
  if (!list.length) return '<p class="text-body-sm text-on-surface-variant">No images or documents attached.</p>';
  return `<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">${list.map((a) => `
    <figure class="relative rounded-lg border border-outline-variant overflow-hidden bg-surface-container-low group">
      <a href="${fileUrl(a.id)}" target="_blank" rel="noopener" title="${esc(a.file_name)}" class="block aspect-square">
        ${a.mime.startsWith('image/') ? `<img src="${fileUrl(a.id)}" alt="${esc(a.file_name)}" class="w-full h-full object-cover" loading="lazy">`
          : `<div class="w-full h-full grid place-items-center text-on-surface-variant"><span class="material-symbols-outlined text-[32px]">picture_as_pdf</span></div>`}
      </a>
      <figcaption class="px-1.5 py-1 text-label-sm truncate" title="${esc(a.note || a.file_name)}">${esc(a.note || a.file_name)}</figcaption>
      ${canEdit ? `<button type="button" data-rm-file="${a.id}" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Remove ${esc(a.file_name)}">
        <span class="material-symbols-outlined text-[15px]">close</span></button>` : ''}
    </figure>`).join('')}</div>`;
}

/**
 * Mount the attachment block into `host` for a record. Returns a refresh
 * function. `canEdit` controls upload and remove.
 */
export async function mountAttachments(host, entity, id, { canEdit = false } = {}) {
  host.innerHTML = `<div class="flex items-center justify-between gap-2 mb-2">
      <label class="field-label !mb-0">Images & documents</label>
      ${canEdit ? `<label class="btn-secondary btn-sm cursor-pointer"><span class="material-symbols-outlined text-[16px]">add_photo_alternate</span>Add images / PDF
        <input type="file" accept="image/*,application/pdf" multiple class="sr-only" data-files></label>` : ''}
    </div>
    ${canEdit ? '<input class="field field-sm mb-2" data-file-note placeholder="Caption for the next upload (optional) — e.g. Outside CT, 12 Sep">' : ''}
    <div data-tiles><p class="text-body-sm text-on-surface-variant">Loading…</p></div>`;
  const paint = (list) => { host.querySelector('[data-tiles]').innerHTML = tiles(list, canEdit); };
  const refresh = async () => { try { paint(await api.get(`/attachments/${entity}/${id}`)); } catch { paint([]); } };
  host.querySelector('[data-files]')?.addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const big = files.find((f) => f.size > 15 * 1024 * 1024);
    if (big) { toast(`${big.name} is larger than 15 MB`, 'warning'); return; }
    host.querySelector('[data-tiles]').insertAdjacentHTML('afterbegin', `<p class="text-body-sm text-on-surface-variant mb-2" data-uploading>Uploading ${files.length} file(s)…</p>`);
    try {
      const payload = await Promise.all(files.map(readFile));
      const list = await api.post(`/attachments/${entity}/${id}`, { files: payload, note: host.querySelector('[data-file-note]')?.value.trim() || undefined });
      host.querySelector('[data-file-note]').value = '';
      paint(list);
      toast(`${files.length} file(s) attached`, 'success');
    } catch (err) {
      host.querySelector('[data-uploading]')?.remove();
      toast(err?.payload?.error === 'file_type_not_allowed' ? 'Only images (JPG, PNG, WEBP, GIF, BMP) and PDF can be attached' : 'Upload failed', 'warning');
    }
  });
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm-file]');
    if (!b) return;
    const c = await confirmDialog({ title: 'Remove this file?', message: 'It is hidden from the record; the removal is kept in the audit trail.', tone: 'danger', confirmLabel: 'Remove' });
    if (!c) return;
    try { paint(await api.post(`/attachments/file/${b.dataset.rmFile}/remove`, {})); } catch { toast('Could not remove — the report may already be signed', 'warning'); }
  });
  await refresh();
  return refresh;
}

/** Image list for printed reports. */
export async function printableImages(entity, id) {
  try {
    const list = (await api.get(`/attachments/${entity}/${id}`)).filter((a) => a.mime.startsWith('image/'));
    if (!list.length) return '';
    return `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#526176">Images</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:6px">${list.map((a) => `<figure style="margin:0">
        <img src="${location.origin}${fileUrl(a.id)}" style="width:100%;border:1px solid #D8DFE8;border-radius:6px">
        <figcaption style="font-size:10px;color:#526176">${esc(a.note || a.file_name)}</figcaption></figure>`).join('')}</div></div>`;
  } catch { return ''; }
}
