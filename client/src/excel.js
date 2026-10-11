/**
 * Excel export without a library: SpreadsheetML (.xls) opens in Excel and
 * LibreOffice with one worksheet per section, real numbers and a header row.
 */
import { toast } from './ui.js';

const x = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const isNum = (c) => c.type === 'money' || c.type === 'number';

function sheet({ name, title, subtitle, columns, rows, totals }) {
  const head = columns.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${x(c.label)}</Data></Cell>`).join('');
  const row = (r, bold) => `<Row>${columns.map((c) => {
    const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
    const style = isNum(c) ? (bold ? ' ss:StyleID="nb"' : ' ss:StyleID="n"') : bold ? ' ss:StyleID="b"' : '';
    if (isNum(c) && v !== '' && v !== null && v !== undefined && !Number.isNaN(+v)) return `<Cell${style}><Data ss:Type="Number">${+v}</Data></Cell>`;
    return `<Cell${style}><Data ss:Type="String">${x(v)}</Data></Cell>`;
  }).join('')}</Row>`;
  const totalRow = totals ? row(Object.fromEntries(columns.map((c, i) => [c.key, i === 0 ? 'Total' : totals[c.key] ?? ''])), true) : '';
  return `<Worksheet ss:Name="${x(String(name).slice(0, 30))}"><Table>
    ${title ? `<Row><Cell ss:StyleID="t"><Data ss:Type="String">${x(title)}</Data></Cell></Row>` : ''}
    ${subtitle ? `<Row><Cell><Data ss:Type="String">${x(subtitle)}</Data></Cell></Row>` : ''}<Row/>
    <Row>${head}</Row>${rows.map((r) => row(r, false)).join('')}${totalRow}</Table></Worksheet>`;
}

/** `sheets`: [{ name, title, subtitle, columns: [{key,label,type,value?}], rows, totals? }] */
export function exportWorkbook(filename, sheets) {
  const doc = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#F1C6CC" ss:Pattern="Solid"/></Style><Style ss:ID="b"><Font ss:Bold="1"/></Style>
<Style ss:ID="n"><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="nb"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="t"><Font ss:Bold="1" ss:Size="13"/></Style></Styles>
${sheets.map(sheet).join('\n')}</Workbook>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([doc], { type: 'application/vnd.ms-excel' }));
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Excel file downloaded', 'success');
}

export const sum = (rows, key) => Math.round(rows.reduce((s, r) => s + (+r[key] || 0), 0) * 100) / 100;
