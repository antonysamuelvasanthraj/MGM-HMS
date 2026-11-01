// Kept independent of application state so mapping can be checked offline.
import { invoiceExpiry } from './invoice-review.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const invoiceFields = [
  ['name','Product name'],['qty','Quantity'],['quantity_unit','Quantity unit'],['units_per_pack','Units per pack'],
  ['free_qty','Free packs'],['rate','Purchase rate'],['mrp','MRP'],['batch_no','Batch'],['expiry','Expiry'],
  ['gst_pct','GST %'],['discount_pct','Discount %'],['hsn','HSN'],
];
const aliases = {name:/^(?:product(?: name| details.*)?|items?|description.*|particulars|medicine.*)$/i,
  qty:/^(?:qty|quantity|rec\.? qty.*)$/i,quantity_unit:/^uom$/i,units_per_pack:/^(?:pack|pack qty|units per pack)$/i,
  free_qty:/^free.*$/i,rate:/^(?:rate.*|price\s*\/\s*unit|dp|purchase rate)$/i,mrp:/^mrp.*$/i,
  batch_no:/^batch.*$/i,expiry:/^exp.*$/i,gst_pct:/^(?:gst.*|tax\s*%|tax\s*\/\s*unit)$/i,discount_pct:/^disc.*$/i,hsn:/^hsn.*$/i};

// Delimited review data remains editable; no fuzzy product substitution.
export function splitInvoiceRows(text, delimiter='tab') {
  const separator = delimiter==='pipe' ? /\|/ : delimiter==='spaces' ? /\s{2,}/ : /\t/;
  return text.split(/\r?\n/).filter(line=>line.trim()).map(line=>line.split(separator).map(cell=>cell.trim()));
}
export function guessInvoiceMapping(header) {
  return header.map(label=>Object.keys(aliases).find(key=>aliases[key].test(label.trim())) || '');
}
export function mapInvoiceRows(rows, mapping) {
  const errors=[], items=[];
  if (mapping.filter(key=>key==='name').length!==1) return {items,errors:['Map exactly one Product name column.']};
  const used=mapping.filter(Boolean);
  if (new Set(used).size!==used.length) return {items,errors:['Each GRN field can be mapped only once.']};
  rows.forEach((cells,index)=>{
    const row={source:cells.join(' | ')};
    mapping.forEach((key,col)=>{
      if (!key) return;
      const value=String(cells[col] ?? '').trim();
      if (!value) return;
      if (['name','batch_no','hsn','quantity_unit'].includes(key)) {row[key]=value;return;}
      if (key==='expiry') {
        const parsed=invoiceExpiry(value);
        if(parsed) row[key]=parsed;
        else errors.push(`Row ${index+1}: expiry needs MM/YYYY or YYYY-MM.`);
        return;
      }
      let numeric=value.replace(/^(?:Rs\.?|INR|₹)\s*/i,'').replaceAll(',','').replace(/%$/,'').trim();
      if (key==='qty') {
        const match=numeric.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
        if (match) {numeric=match[1];row.quantity_unit=match[2];}
      }
      if (/^\d+(?:\.\d+)?$/.test(numeric)) row[key]=Number(numeric);
      else errors.push(`Row ${index+1}: ${invoiceFields.find(f=>f[0]===key)[1]} is unreadable. Correct it or clear the cell.`);
    });
    if (row.name) items.push(row);
    else errors.push(`Row ${index+1}: product name is missing.`);
  });
  return {items,errors};
}

export function mountInvoiceMapping(container) {
  let mapping=[], header=[], rows=[], metadata=[];
  container.innerHTML=`<details><summary>Optional: map columns for another invoice format</summary><div class="space-y-3 p-3">
    <p>Paste only the item table below, with one item per line. Separate columns with tabs, pipes, or two spaces. Include the column headings. You can correct every cell after loading.</p>
    <label>Column separator<select class="field" data-separator><option value="tab">Tabs (Excel)</option><option value="pipe">Pipe |</option><option value="spaces">Two or more spaces</option></select></label>
    <textarea class="field" rows="7" data-table placeholder="Product name&#9;Quantity&#9;Purchase rate&#9;Batch&#9;Expiry"></textarea>
    <button type="button" class="btn-secondary" data-load>Load editable table</button>
    <label>Supplier layout name (saved on this browser)<input class="field" data-layout maxlength="100"></label>
    <div class="flex gap-2"><button type="button" class="btn-secondary" data-save>Save column mapping</button><button type="button" class="btn-secondary" data-restore>Load saved mapping</button></div>
    </div></details><div class="space-y-3"><p>Detected rows are ready for review and transfer. Saving a column mapping is optional.</p><div data-grid style="overflow:auto;max-height:400px"></div>
    <button type="button" class="btn-secondary" data-add>Add item row</button>
    <p role="status" data-map-status></p></div>`;
  const status=container.querySelector('[data-map-status]');
  const render=()=>{
    container.querySelector('[data-grid]').innerHTML=header.length ? `<table class="w-full"><thead><tr>${header.map((label,col)=>`<th>${esc(label)}<select class="field" data-column="${col}"><option value="">Ignore</option>${invoiceFields.map(([key,title])=>`<option value="${key}" ${mapping[col]===key?'selected':''}>${title}</option>`).join('')}</select></th>`).join('')}<th>Remove</th></tr></thead><tbody>${rows.map((row,index)=>`<tr>${header.map((_,col)=>`<td><input class="field" style="min-width:120px" aria-label="Row ${index+1} ${esc(header[col])}" data-row="${index}" data-col="${col}" value="${esc(row[col] || '')}"></td>`).join('')}<td><button type="button" class="btn-secondary" data-remove="${index}" aria-label="Remove row ${index+1}">×</button></td></tr>`).join('')}</tbody></table>` : '';
    container.querySelectorAll('[data-column]').forEach(select=>select.onchange=()=>{mapping[+select.dataset.column]=select.value;});
    container.querySelectorAll('[data-row]').forEach(input=>input.oninput=()=>{rows[+input.dataset.row][+input.dataset.col]=input.value;});
    container.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{rows.splice(+button.dataset.remove,1);metadata.splice(+button.dataset.remove,1);render();});
  };
  container.querySelector('[data-load]').onclick=()=>{
    const parsed=splitInvoiceRows(container.querySelector('[data-table]').value,container.querySelector('[data-separator]').value);
    if (!parsed.length || parsed[0].length<2) {status.textContent='Add headings and at least two separated columns.';return;}
    header=parsed.shift();rows=parsed;metadata=[];mapping=guessInvoiceMapping(header);render();status.textContent='Choose the GRN field above each column and review the rows.';
  };
  container.querySelector('[data-add]').onclick=()=>{if(!header.length) {header=invoiceFields.map(f=>f[1]);mapping=invoiceFields.map(f=>f[0]);}rows.push(header.map(()=>''));render();};
  const layoutKey=()=>`hms.invoice.mapping.v1.${container.querySelector('[data-layout]').value.trim().toLowerCase()}`;
  container.querySelector('[data-save]').onclick=()=>{
    if (!container.querySelector('[data-layout]').value.trim() || !header.length) {status.textContent='Enter a supplier layout name and load a table first.';return;}
    try {localStorage.setItem(layoutKey(),JSON.stringify({header,mapping,separator:container.querySelector('[data-separator]').value}));status.textContent='Column mapping saved on this browser.';}catch {status.textContent='This browser could not save the mapping.';}
  };
  container.querySelector('[data-restore]').onclick=()=>{
    try {
      const saved=JSON.parse(localStorage.getItem(layoutKey()));
      if (!saved || !Array.isArray(saved.header) || !Array.isArray(saved.mapping)) throw Error();
      if (header.length && (header.length!==saved.header.length || header.some((name,i)=>name.toLowerCase()!==saved.header[i].toLowerCase()))) {status.textContent='These headings differ from the saved layout. Map and save this layout separately.';return;}
      header=saved.header;mapping=saved.mapping;container.querySelector('[data-separator]').value=saved.separator;render();status.textContent='Saved mapping loaded. Review every column before transfer.';
    } catch {status.textContent='No saved mapping found for this layout name.';}
  };
  return {
    reset() {header=[];mapping=[];rows=[];metadata=[];container.querySelector('[data-table]').value='';status.textContent='';render();},
    setItems(items) {metadata=items.map(item=>({warnings:item.warnings || []}));header=invoiceFields.map(f=>f[1]);mapping=invoiceFields.map(f=>f[0]);rows=items.map(item=>mapping.map(key=>String(item[key] ?? '')));render();status.textContent=items.flatMap((item,index)=>(item.warnings || []).map(warning=>`Row ${index+1}: ${warning}`)).join(' · ');},
    read() {
      if (!header.length) return null;
      const result=mapInvoiceRows(rows,mapping);
      status.textContent=result.errors.join(' ');
      if(result.errors.length) {container.querySelector('details').open=true;throw Error('Correct the highlighted mapping issues before transfer: '+result.errors[0]);}
      return result.items.map((item,index)=>({...item,warnings:metadata[index]?.warnings || []}));
    },
  };
}
