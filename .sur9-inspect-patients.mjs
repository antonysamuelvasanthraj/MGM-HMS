import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}); const context=await browser.newContext({storageState:'E:/MGM HMS/qa-reports/2026-11-02/final-acceptance/.sur9-auth-state.json',viewport:{width:1440,height:1000}}); const page=await context.newPage();
page.on('pageerror',e=>console.log('PAGEERROR '+e.message));
await page.goto('http://127.0.0.1:4300/patients',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900);
console.log('URL',page.url(),'BODY',(await page.locator('body').innerText()).slice(0,1400).replace(/\s+/g,' '));
console.log('BUTTONS',JSON.stringify((await page.locator('button').allTextContents()).map(s=>s.trim()).filter(Boolean)));
console.log('INPUTS',JSON.stringify(await page.locator('input').evaluateAll(es=>es.map(e=>({ph:e.placeholder,name:e.name,type:e.type,value:e.value})))));
const search=page.locator('input[placeholder="UHID, name, mobile or ABHA"]'); const found=[];
for(let n=11;n<=20;n++){const marker=`TEST-MGM-QA-${String(n).padStart(3,'0')}`; await search.fill(marker); await page.waitForTimeout(130); const text=await page.locator('body').innerText(); found.push({marker,visible:text.includes(marker),matches:(text.match(new RegExp(marker,'g'))||[]).length});}
console.log('MARKER_SEARCH',JSON.stringify(found)); await search.fill('');
await page.getByRole('button',{name:/New patient/}).click(); await page.waitForTimeout(250);
console.log('MODAL_BODY',(await page.locator('body').innerText()).slice(-1800).replace(/\s+/g,' '));
console.log('MODAL_INPUTS',JSON.stringify(await page.locator('input').evaluateAll(es=>es.map((e,i)=>({i,ph:e.placeholder,type:e.type,name:e.name,value:e.value,required:e.required})))));
console.log('SELECTS',JSON.stringify(await page.locator('select').evaluateAll(es=>es.map((e,i)=>({i,value:e.value,options:[...e.options].map(o=>({text:o.text,value:o.value}))})))));
await page.screenshot({path:'E:/MGM HMS/qa-reports/2026-11-02/final-acceptance/SUR-9-patients-before.png',fullPage:true});
await browser.close();
