import { modal, api, esc, apiError, downloadCSV } from './views/_kit.js';

const columns = ['name','code','generic','strength','brand','form','schedule','manufacturer','hsn','gst_pct','rack','reorder_level'];
function parseCSV(text) {
  const rows = []; let row = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(value.trim()); value = ''; if (c === '\n') { rows.push(row); row = []; } }
    else if (c !== '\r' || quoted) value += c;
  }
  if (quoted) throw Error('Unclosed quoted cell in CSV.');
  if (value || row.length) { row.push(value.trim()); rows.push(row); }
  return rows.filter(r => r.some(Boolean));
}
export function bulkMedicines(after) {
  let rows = [];
  modal({ title: 'Bulk import medicines', size: 'lg',
    body: '<div class="p-5 space-y-4"><p>Download the CSV template, replace the example with your medicines, and upload. Name, unique code and generic are required. This creates master records only; receive stock through GRN.</p><button class="btn-secondary" data-template>Download medicine template (CSV)</button><input class="field" type="file" accept=".csv" data-file><p role="status" data-status></p><div class="overflow-auto" data-preview></div></div>',
    footer: '<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-import disabled>Import validated medicines</button>',
    onMount(root) {
      const status = root.querySelector('[data-status]'), button = root.querySelector('[data-import]');
      root.querySelector('[data-template]').onclick = () => downloadCSV('medicine-import-template.csv', [{ name:'EXAMPLE — replace this row',code:'EXAMPLE-001',generic:'Example generic',strength:'500 mg',brand:'',form:'tablet',schedule:'H',manufacturer:'',hsn:'3004',gst_pct:12,rack:'',reorder_level:20 }]);
      root.querySelector('[data-file]').onchange = async event => {
        rows = []; button.disabled = true;
        try {
          const file = event.target.files[0]; if (!file) return;
          if (file.size > 2 * 1024 * 1024) throw Error('Maximum file size: 2 MB.');
          const table = parseCSV(await file.text()), header = table.shift();
          if (!header || columns.some(c => !header.includes(c))) throw Error('Use all columns from the downloaded template.');
          if (!table.length || table.length > 500) throw Error('Upload between 1 and 500 medicines.');
          const names = new Set(), codes = new Set();
          rows = table.map((values, index) => {
            const data = Object.fromEntries(columns.map(c => [c, values[header.indexOf(c)] || ''])), errors = [];
            if (!data.name || !data.code || !data.generic || data.name.startsWith('EXAMPLE')) errors.push('Name, code and generic required; remove example');
            for (const [key,set] of [['name',names],['code',codes]]) { const v=data[key].toLowerCase(); if(set.has(v)) errors.push(`Duplicate ${key}`); set.add(v); }
            if (!['OTC','H','H1','X'].includes(data.schedule)) errors.push('Schedule must be OTC, H, H1 or X');
            for (const key of ['gst_pct','reorder_level']) { if(data[key] === '' || !Number.isFinite(Number(data[key])) || Number(data[key]) < 0 || (key === 'gst_pct' && Number(data[key]) > 100)) errors.push(`Invalid ${key}`); else data[key] = Number(data[key]); }
            return { data, errors, index:index+2, done:false };
          });
          root.querySelector('[data-preview]').innerHTML = `<table class="tbl"><thead><tr><th>Row</th><th>Medicine</th><th>Code</th><th>Validation</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.index}</td><td>${esc(r.data.name)}</td><td>${esc(r.data.code)}</td><td>${esc(r.errors.join('; ') || 'Ready — server checks duplicates on import')}</td></tr>`).join('')}</tbody></table>`;
          status.textContent = `${rows.length} rows; ${rows.filter(r=>r.errors.length).length} invalid.`;
          button.disabled = rows.some(r=>r.errors.length);
        } catch(err) { status.textContent = err.message || apiError(err); }
      };
      button.onclick = async () => {
        button.disabled = true; let count = 0;
        try {
          for (const row of rows.filter(r=>!r.done)) { await api.post('/pharmacy/medicines', row.data); row.done = true; count++; status.textContent = `Created ${count} of ${rows.length} medicines…`; }
          status.textContent = `Import complete. ${count} medicines created. No stock was added.`; await after();
        } catch(err) { status.textContent = `${count} created. Import stopped: ${apiError(err)}. Previously created rows remain saved. Correct remaining rows before uploading again.`; await after(); }
      };
    },
  });
}
