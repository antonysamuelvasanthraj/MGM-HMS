import { matchInvoiceMedicine } from './invoice-review.js';
/** Conservative local rules: no fuzzy substitutions or positional price guessing. */
export function invoiceLines(text, medicines) {
  const norm = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const result = [];
  let productSection = false;
  for (const line of lines) {
    if (/product\s+details|description\s+of\s+goods|item\s+description/i.test(line)) { productSection = true; continue; }
    if (/sub\s*total|bank\s+details|terms\s+and\s+conditions|net\s+amount|grand\s+total/i.test(line)) productSection = false;
    const cells = line.split(/\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
    const candidates = medicines.filter(m => cells.some(c => norm(c) === norm(m.name) || (m.code && norm(c) === norm(m.code))) || norm(line) === norm(m.name));
    const numberedProduct = productSection && /^(?:\d{1,3}|[TIl])\s*(?:[|.)]|\s)/.test(line) && /[a-z]{3}/i.test(line);
    const productLike = /\b(?:tab(?:let)?s?|caps?(?:ule)?s?|syrup|injection|suspension|ointment|cream|drops|vial|ampoule|mg|mcg|ml)\b/i.test(line);
    if (!candidates.length && !(productSection && (productLike || numberedProduct))) continue;
    const parts = line.split('|').map(s=>s.trim()).filter(Boolean);
    let name = cells[0].replace(/^(?:\d+|[TIl])[.)]?\s*/, '');
    if (numberedProduct && parts.length > 2 && /^\d{4,8}$/.test(parts[1])) name = parts[2];
    const dateAt = name.search(/\b\d{2}[-/]20\d{2}\b/);
    if (dateAt >= 0) name = name.slice(0,dateAt).trim();
    const row = { source: line, name, medicine_id: candidates.length === 1 ? candidates[0].id : null };
    // Recover rows that retain table separators. An expiry anchor prevents
    // treating arbitrary footer numbers as purchase quantities or prices.
    const expIndex = parts.findIndex(p => /^(0?[1-9]|1[0-2])[-/](20\d{2})$/.test(p));
    if (numberedProduct && expIndex > 0) {
      const expiryParts = parts[expIndex].match(/^(\d{1,2})[-/](20\d{2})$/);
      row.expiry = `${expiryParts[2]}-${expiryParts[1].padStart(2,'0')}`;
      row.batch_no = parts[expIndex - 1].replace(/^[‘'"\s]+|[‘'"\s]+$/g, '');
      const quantity = parts[expIndex + 1];
      if (/^\d+(?:\.\d+)?$/.test(quantity || '')) row.qty = Number(quantity);
      const pack = (parts[expIndex + 2] || '').match(/^\(?\s*1\s*[xX×]\s*(\d+)\s*\)?$/);
      if (pack) row.units_per_pack = Number(pack[1]);
      const rate = parts[expIndex + 3];
      if (pack && /^\d+(?:\.\d+)?$/.test(rate || '')) row.rate = Number(rate);
      if (expIndex >= 2) {
        const productStart = /^\d{4,8}$/.test(parts[1] || '') ? 2 : 1;
        row.name = parts.slice(productStart, expIndex - 1).join(' ').trim() || row.name;
        const matches = matchInvoiceMedicine(row.name,medicines);
        row.medicine_id = matches.length === 1 ? matches[0].id : null;
      }
    }
    const fields = {qty:'(?:qty|quantity)', free_qty:'free', rate:'(?:rate|dp)', mrp:'mrp',gst_pct:'(?:gst|tax)',discount_pct:'(?:disc|discount)'};
    for (const [key,label] of Object.entries(fields)) {
      const match = line.match(new RegExp(`\\b${label}\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
      if (match) row[key] = Number(match[1]);
    }
    const batch = line.match(/\bbatch(?:\s*no\.?)?\s*[:=]\s*([a-z0-9/-]+)/i);
    if (batch) row.batch_no = batch[1];
    const expiry = line.match(/\bexp(?:iry)?\s*[:=]\s*(0?[1-9]|1[0-2])[/.-](20\d{2})\b/i);
    if (expiry) row.expiry = `${expiry[2]}-${expiry[1].padStart(2,'0')}`;
    const matched=matchInvoiceMedicine(row.name,medicines);
    if(matched.length===1) row.medicine_id=matched[0].id;
    result.push(row);
  }
  return result;
}
