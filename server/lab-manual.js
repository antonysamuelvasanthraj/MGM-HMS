import fs from 'node:fs';
export const labManual=JSON.parse(fs.readFileSync(new URL('./lab-manual-data.json',import.meta.url),'utf8'));
// the manual writes these names differently from the HMS catalogue
export const LAB_MANUAL_ALIAS={prothrombintimeptinr:'LAB-PT',activatedpartialthromboplastintimeaptt:'LAB-APTT'};
export const labNameKey=name=>String(name).toLowerCase().replace(/haem/g,'hem').replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/g,'');
