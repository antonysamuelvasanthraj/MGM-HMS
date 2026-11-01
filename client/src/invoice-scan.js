import { modal, api, apiError } from './views/_kit.js';
import { newGRN } from './grn-form.js';
import { mountInvoiceMapping } from './invoice-mapping.js';
/**
 * Phone photos are large (and HEIC on iPhones): bring them to at most 2000 px as JPEG before sending.
 * Smaller, cleaner images read better and stay well under the 8 MB upload limit. PDFs go as they are.
 */
async function prepareImage(file) {
  if (file.type === 'application/pdf') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw Error('This image format cannot be read here — take the photo again as JPG, or upload a PDF.');
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && ['image/jpeg', 'image/png'].includes(file.type) && file.size < 4 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
  return new File([blob], 'invoice.jpg', { type: 'image/jpeg' });
}

export function scanInvoice() {
  modal({title:'Scan supplier invoice — local OCR',size:'full',
    body:'<div class="p-5 space-y-4"><p>Upload a clear JPG/PNG image or a PDF invoice (up to 5 pages) or use your device camera. Recognition runs on this hospital server. Review the extracted rows or map the columns for a different layout.</p><label class="block">Invoice image<input class="field" type="file" accept="image/*,application/pdf" capture="environment" data-image></label><img data-original alt="Original supplier invoice" class="max-w-full" style="max-height:300px;object-fit:contain" hidden><iframe data-pdf title="Original PDF invoice" style="width:100%;height:350px" hidden></iframe><button class="btn-primary" data-scan>Extract invoice text</button><p role="status" data-status></p><div data-mapping></div><details><summary>Recognized text — verify against the original</summary><label class="block"><textarea class="field" rows="8" data-text></textarea></label></details><p>Review quantities, pack sizes, rates, tax, batch and expiry before creating the GRN.</p></div>',
    footer:'<p role="status" data-transfer-status class="text-body-sm" style="flex-basis:100%;white-space:pre-wrap"></p><button class="btn-secondary" data-close>Close</button><button type="button" class="btn-primary" data-transfer>Transfer to GRN review</button>',
    onMount(root, close) {
      let extracted = null;
      const mapper=mountInvoiceMapping(root.querySelector('[data-mapping]'));
      const transferButton=root.querySelector('[data-transfer]');
      const transferStatus=root.querySelector('[data-transfer-status]');
      transferButton.onclick = async event => {
        event?.preventDefault();
        event?.stopPropagation();
        let stage='Reading item rows';
        transferButton.disabled=true;
        transferStatus.textContent=stage+'…';
        try {
          const text = root.querySelector('[data-text]').value.trim();
          const image = root.querySelector('[data-original]').getAttribute('src');
          const items=mapper.read() ?? (extracted?.text===text ? extracted.items : null);
          if (!items?.length && !text) throw Error('Extract the invoice or enter item rows in the column mapper.');
          if (items && !items.length) throw Error('Add at least one product row before transfer.');
          stage='Opening GRN review';transferStatus.textContent=stage+'…';
          await newGRN(() => {}, null, { text, image, items });
        }
        catch (err) {
          transferStatus.textContent=`${stage} failed: ${err.message || err.payload?.error || 'Unknown error'}`;
          const status=root.querySelector('[data-status]');
          if(status) {status.textContent=err.message || 'Could not transfer invoice rows.';status.scrollIntoView({block:'center'});}
          console.error('Invoice transfer failed',err);
          apiError(err, err.message || 'Could not transfer invoice rows.');
        }
        finally {transferButton.disabled=false;}
      };
      let file;
      root.querySelector('[data-image]').onchange=async event=>{
        file=event.target.files[0]; extracted=null; mapper.reset(); root.querySelector('[data-text]').value=''; if(!file) return;
        try { file = await prepareImage(file); } catch (err) { root.querySelector('[data-status]').textContent = err.message; file = null; return; }
        const image=root.querySelector('[data-original]');
        image.src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});image.hidden=file.type==='application/pdf'; const pdf=root.querySelector('[data-pdf]');pdf.hidden=file.type!=='application/pdf';if(!pdf.hidden){pdf.src=image.src;image.removeAttribute('src');}else pdf.removeAttribute('src');
      };
      root.querySelector('[data-scan]').onclick=async event=>{
        const status=root.querySelector('[data-status]'), button=event.currentTarget;
        if(!file || file.size>8*1024*1024){status.textContent='Choose or take a photo of the invoice (or a PDF under 8 MB).';return;}
        button.disabled=true;status.textContent='Recognizing locally…';
        try {
          const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
          const result=await api.post('/pharmacy/invoice-ocr',{type:file.type,data},{timeout:600000});
          if (!result || typeof result.text !== 'string') throw Error('OCR returned no text response. Restart the server and retry.');
          extracted = {...result, text:result.text.trim()};
          mapper.reset();
          if(result.items?.length) mapper.setItems(result.items);
          root.querySelector('[data-text]').value=result.text;status.textContent=result.text.trim()?'Text extracted. Review every field. No stock posted.':'No readable text. Retake a clearer image.';
          if (result.items?.length) status.textContent = `${result.items.length} item rows extracted. Transfer to GRN to review populated fields. No stock posted.`;
          if (result.tableWarning) status.textContent = result.tableWarning;
        } catch(err){extracted=null;root.querySelector('[data-text]').value='';status.textContent=err.message || 'OCR failed. Retake a clear image and retry.';apiError(err);}finally{button.disabled=false;}
      };
    },
  });
}
