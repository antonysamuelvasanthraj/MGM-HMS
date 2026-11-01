import { page, card, mountPage, api, esc, toast, apiError, live } from './_kit.js';
import { exportWorkbook } from '../excel.js';

export async function mount(ctx) {
  const root = mountPage(ctx, page({ title: 'Stock Adjustment', subtitle: 'Download current stock → enter physical counts → upload → review differences.',
    body: card({ title: 'Excel bulk stock adjustment', body: '<div class="space-y-4"><p>Download the Excel template, fill Physical Stock and Adjustment Reason, then upload the completed file. Keep the downloaded Excel XML (.xls) format. Do not change batch IDs or Current Stock.</p><button class="btn-primary" data-template>Download Stock Adjustment Template</button><label class="block">Upload completed template<input class="field" type="file" accept=".xls,.xml" data-upload></label><p data-status role="status"></p><div class="overflow-auto" data-preview></div><button class="btn-primary" data-post disabled>Confirm and post valid adjustments</button><a class="btn-secondary" href="/stock">Manual adjustment & history</a></div>' }) }));
  let proposed = [], posting = false;
  const status = root.querySelector('[data-status]'), post = root.querySelector('[data-post]');
  const columns = ['Batch ID', 'Medicine Name', 'Batch Number', 'Expiry Date', 'Location', 'Current Stock', 'Physical Stock', 'Purchase Rate', 'MRP', 'Adjustment Reason', 'Remarks'];
  root.querySelector('[data-template]').onclick = async () => {
    try {
      const { rows } = await api.get('/pharmacy/stock');
      exportWorkbook('stock-adjustment-template.xls', [
        { name: 'Instructions', columns: [{ key: 'instruction', label: 'Instructions' }], rows: [
          { instruction: 'Fill Physical Stock and Adjustment Reason. Blank physical quantities are skipped.' },
          { instruction: 'Reasons: Shortage, Excess, Damage, Expiry, Correction. Counts must be non-negative.' },
          { instruction: 'Save as Excel 2003 XML (.xls/.xml). Stock is checked again before each posting.' },
        ] },
        { name: 'Import Data', columns: columns.map(key => ({ key, label: key })), rows: rows.map(b => ({ 'Batch ID': b.id, 'Medicine Name': b.medicine_name, 'Batch Number': b.batch_no, 'Expiry Date': b.expiry, Location: b.location, 'Current Stock': b.qty, 'Physical Stock': '', 'Purchase Rate': b.purchase_rate, MRP: b.mrp, 'Adjustment Reason': '', Remarks: '' })) },
      ]);
    } catch (err) { status.textContent = apiError(err); }
  };
  root.querySelector('[data-upload]').onchange = async event => {
    proposed = []; post.disabled = true;
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw Error('Maximum template size is 5 MB.');
      const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
      if (xml.querySelector('parsererror')) throw Error('Upload the downloaded Excel XML template. XLSX and binary XLS are not supported yet.');
      const sheet = [...xml.getElementsByTagNameNS('*', 'Worksheet')].find(e => [...e.attributes].some(a => a.localName === 'Name' && a.value === 'Import Data'));
      if (!sheet) throw Error('Import Data worksheet is missing.');
      const rows = [...sheet.getElementsByTagNameNS('*', 'Row')].map(row => {
        const values = [];let column = 0;
        for(const cell of row.getElementsByTagNameNS('*','Cell')){
          const index=[...cell.attributes].find(attribute=>attribute.localName==='Index');
          if(index)column=Number(index.value)-1;
          if(!Number.isInteger(column)||column<0||column>100)throw Error('Invalid spreadsheet column index.');
          values[column++]=cell.getElementsByTagNameNS('*','Data')[0]?.textContent.trim() || '';
        }
        return Array.from({length:Math.max(values.length,columns.length)},(_,index)=>values[index] || '');
      });
      const header = rows.findIndex(row => row[0] === 'Batch ID');
      if (header < 0 || columns.some((c, i) => rows[header][i] !== c)) throw Error('Template columns have changed. Download a fresh template.');
      const live = (await api.get('/pharmacy/stock')).rows, seen = new Set();
      proposed = rows.slice(header + 1).filter(row => row[6] !== undefined && row[6] !== '').map(row => {
        const batch = live.find(b => b.id === Number(row[0])), qty = Number(row[6]), reason = row[9], errors = [];
        if (!batch || batch.batch_no !== row[2] || batch.location !== row[4]) errors.push('Batch/location mismatch');
        if (seen.has(row[0])) errors.push('Duplicate batch'); seen.add(row[0]);
        if (!Number.isFinite(qty) || qty < 0) errors.push('Invalid physical quantity');
        if (!batch || Number(row[5]) !== batch.qty) errors.push('Stock changed; download a fresh template');
        if (!['Shortage','Excess','Damage','Expiry','Correction'].includes(reason)) errors.push('Invalid reason');
        return { batch, qty, reason, remarks: row[10] || '', errors, label: row[1], posted: false };
      });
      root.querySelector('[data-preview]').innerHTML = `<table class="tbl"><thead><tr><th>Medicine</th><th>Current</th><th>Physical</th><th>Difference</th><th>Validation</th></tr></thead><tbody>${proposed.map(p => `<tr><td>${esc(p.label)}</td><td>${p.batch?.qty ?? '—'}</td><td>${esc(p.qty)}</td><td>${p.batch ? p.qty - p.batch.qty : '—'}</td><td>${esc(p.errors.join('; ') || 'Valid')}</td></tr>`).join('')}</tbody></table>`;
      status.textContent = `${proposed.length} counted rows. ${proposed.filter(p => p.errors.length).length} invalid rows. No stock has been posted.`;
      post.disabled = !proposed.length || proposed.some(p => p.errors.length);
    } catch (err) { status.textContent = err.message || apiError(err); }
  };
  post.onclick = async () => {
    if(posting)return;
    posting=true;post.disabled = true;root.querySelector('[data-upload]').disabled=true;let completed = 0;
    try {
      for (const p of proposed.filter(p => !p.posted && p.qty !== p.batch.qty)) {
        await api.post('/pharmacy/stock/adjust', { batch_id: p.batch.id, expected_qty: p.batch.qty, qty: p.qty - p.batch.qty, move_type: p.reason === 'Damage' ? 'damage' : p.reason === 'Expiry' ? 'expiry' : p.reason === 'Shortage' ? 'loss' : 'adjust', reason: `${p.reason}: ${p.remarks}`, source: 'bulk_count' });
        p.posted = true; completed++;
      }
      status.textContent = `${completed} adjustments posted to inventory and accounts.`; toast('Stock adjustments posted');
    } catch (err) { status.textContent = `${completed} rows posted before the error: ${apiError(err)}. Download fresh stock before uploading again.`; }
    finally { posting=false;root.querySelector('[data-upload]').disabled=false; }
  };
  return live({ topics: ['pharmacy'], events: ['stock.changed'], load: async ({ live: refreshed } = {}) => {
    if (posting || !refreshed || !proposed.some((p) => !p.posted)) return;
    proposed = []; post.disabled = true;
    root.querySelector('[data-preview]').innerHTML = '';
    status.textContent = 'Stock changed at another desk. Download a fresh template before posting your count.';
  } });
}
