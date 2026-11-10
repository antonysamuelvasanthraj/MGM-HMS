import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {invoiceOCR,invoiceOCRTools} from '../server/local-invoice-ocr.js';
assert.equal(invoiceOCRTools('linux',{}).tesseract,'tesseract');assert.equal(invoiceOCRTools('linux',{}).python,'python3');assert.equal(invoiceOCRTools('win32',{}).python,'python');
const directory=process.argv[2];assert.ok(directory,'Synthetic fixture directory required');const evidence=[];
for(const filename of ['standard.png','tilted.png','reordered.png','invoice.pdf']){
 const result=await invoiceOCR({type:filename.endsWith('.pdf')?'application/pdf':'image/png',data:fs.readFileSync(path.join(directory,filename)).toString('base64')});
 const row={filename,rows:result.items.length,reviewRequired:result.review_required,stockPosted:result.posted,items:result.items.map(i=>({name:i.name,qty:i.qty,rate:i.rate,mrp:i.mrp,expiry:i.expiry,units_per_pack:i.units_per_pack,warnings:i.warnings})),warning:result.tableWarning};evidence.push(row);console.log(JSON.stringify(row));
 assert.equal(result.posted,false);assert.equal(result.review_required,true);assert.equal(result.items.length,2,filename+' item rows');
 for(const [word,qty,rate,mrp] of [['Alpha',2,20,30],['Beta',5,80,120]]){const item=result.items.find(i=>i.name.includes(word));assert.ok(item,filename+' '+word);assert.equal(item.qty,qty,filename+' quantity');assert.equal(item.rate,rate,filename+' rate');assert.equal(item.mrp,mrp,filename+' MRP');assert.equal(item.units_per_pack,10,filename+' pack');assert.equal(item.expiry,'2028-03',filename+' expiry');}
}
console.log(JSON.stringify({passed:true,syntheticOnly:true,evidence}));
