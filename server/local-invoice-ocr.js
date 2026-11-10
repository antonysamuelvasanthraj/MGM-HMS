import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
export function invoiceOCRTools(platform = process.platform, env = process.env) {
  return {
    tesseract: env.TESSERACT_PATH || (platform === 'win32' ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : 'tesseract'),
    python: env.PYTHON_PATH || (platform === 'win32' ? 'python' : 'python3'),
    pdf: env.PDFTOPPM_PATH || 'pdftoppm',
  };
}
export async function invoiceOCR(body) {
  const tools = invoiceOCRTools();
  if (!['image/png','image/jpeg','application/pdf'].includes(body.type)) throw Object.assign(Error('PNG, JPEG or PDF required'), { status:400 });
  const data = Buffer.from(String(body.data || ''), 'base64');
  if (!data.length || data.length > 8 * 1024 * 1024) throw Object.assign(Error('Image must be under 8 MB'), {status:400});
  const png = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = data[0]===255 && data[1]===216 && data[2]===255;
  const pdf=data.subarray(0,5).toString()==='%PDF-';
  if (!(body.type==='application/pdf' ? pdf : body.type==='image/png' ? png : jpg)) throw Object.assign(Error('File signature does not match file type'),{status:400});
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'hms-ocr-'));
  try {
    if(pdf) {
      const input=path.join(dir,'invoice.pdf');await fs.writeFile(input,data);
      try {await exec(tools.pdf,[ '-r','150','-f','1','-l','6','-png',input,path.join(dir,'page')],{timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});}
      catch {throw Object.assign(Error('PDF could not be rendered. Check that it is readable and the local PDF renderer is installed.'),{status:400});}
      const pages=(await fs.readdir(dir)).filter(name=>/^page-\d+\.png$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      if(!pages.length || pages.length>5)throw Object.assign(Error('Use a readable PDF with at most 5 pages per scan.'),{status:400});
      const results=[];
      for(const page of pages) results.push(await invoiceOCR({type:'image/png',data:(await fs.readFile(path.join(dir,page))).toString('base64')}));
      return {text:results.map(r=>r.text).join('\n'),items:results.flatMap(r=>r.items),tableWarning:results.map(r=>r.tableWarning).filter(Boolean).join(' '),review_required:true,posted:false,pages:pages.length};
    }
    const file=path.join(dir,png?'invoice.png':'invoice.jpg'); await fs.writeFile(file,data);
    const {stdout:bodyText}=await exec(tools.tesseract,[file,'stdout','-l','eng','--psm','6'],{timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});
    let stdout=bodyText;
    try {
      const header=await exec(tools.tesseract,[file,'stdout','-l','eng','--psm','3'],{timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});
      const headerLines=header.stdout.split(/\r?\n/).filter(line=>/invoice\s*(?:date|no|number)|grand\s+total|net\s+amount/i.test(line));
      stdout=headerLines.join('\n')+'\n'+bodyText;
    } catch { /* Keep block OCR when automatic page segmentation fails. */ }
    let items = [], tableWarning = '';
    try {
      const parsed = await exec(tools.python, [fileURLToPath(new URL('../tools/invoice-table.py', import.meta.url)), file, dir, tools.tesseract], {timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});
      items = JSON.parse(parsed.stdout);
    } catch (error) { tableWarning = 'Table recognition unavailable. Review the text and enter missing fields.'; console.error('Invoice table OCR:', error.message); }
    if (!items.length) {
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^\s*\d+[.)]?\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(KG|G|ML|L|PCS?|UNITS?)?\s+Rs\.?\s*([\d,]+\.\d{2})\s+Rs\.?\s*[\d,.]+\s*\((\d+(?:\.\d+)?)%\)/i);
        if (match) items.push({name:match[1].trim(),source:line,qty:Number(match[2]),quantity_unit:match[3] || '',rate:Number(match[4].replaceAll(',','')),gst_pct:Number(match[5])});
        else {
          const partial = line.match(/^\s*\d+[.)]?\s+(.+?)\s+([A-Z]+)\s+Rs\.?\s*([\d,]+\.\d{2})\s+Rs\.?\s*[\d,.]+\s*\((\d+(?:\.\d+)?)%\)/i);
          if (partial) items.push({name:partial[1].trim(),source:line,rate:Number(partial[3].replaceAll(',','')),gst_pct:Number(partial[4])});
        }
      }
    }
    return {text:stdout,items,tableWarning,review_required:true,posted:false};
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
}
