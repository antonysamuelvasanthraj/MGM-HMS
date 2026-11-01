const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const formPattern = /\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|ointment|cream|drops)\s*$/i;
const formOf = value => {
  const form=normalize(value).match(formPattern)?.[1];
  if (/^tab/.test(form || '')) return 'tablet';
  if (/^cap/.test(form || '')) return 'capsule';
  return form || '';
};
export function matchInvoiceMedicine(name, medicines) {
  const key=normalize(name);
  const exact=medicines.filter(m=>normalize(m.name)===key);
  if(exact.length) return exact;
  const base=key.replace(formPattern,'').trim(), form=formOf(key);
  return medicines.filter(m=>{
    const masterForm=formOf(m.name) || formOf(m.form);
    return normalize(m.name).replace(formPattern,'').trim()===base && !(form && masterForm && form!==masterForm);
  });
}
export function invoiceDate(text) {
  const match=String(text).match(/invoice\s*date\s*[:|\-]?\s*(\d{1,2})[\s/.-]+([a-z]+|\d{1,2})[\s/.,-]+(20\d{2})/i);
  if(!match)return '';
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const month=/^\d+$/.test(match[2]) ? +match[2] : months.indexOf(match[2].slice(0,3).toLowerCase())+1;
  const day=+match[1],year=+match[3];
  const check=new Date(year,month-1,day);
  return month>0 && month<=12 && check.getFullYear()===year && check.getMonth()===month-1 && check.getDate()===day ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : '';
}
export function scannedSelectionValues(element) {
  if (!element.scannedInvoice) return {};
  return Object.fromEntries(['qty','free_qty','units_per_pack','rate','mrp','batch_no','expiry','gst_pct','discount_pct'].map(key=>[key,element.querySelector(`[data-key="${key}"]`)?.value]).filter(([,value])=>value!==undefined && value!==''));
}
export function invoiceExpiry(value) {
  const match=String(value).trim().match(/^(\d{1,2}|[a-z]{3,9})[-/. ](\d{2}|\d{4})$/i);
  if(!match)return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value) ? value : '';
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const month=/^\d+$/.test(match[1]) ? +match[1] : months.indexOf(match[1].slice(0,3).toLowerCase())+1;
  return month>0 && month<=12 ? `${match[2].length===2?'20':''}${match[2]}-${String(month).padStart(2,'0')}` : '';
}
