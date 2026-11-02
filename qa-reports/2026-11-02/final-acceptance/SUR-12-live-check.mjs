import fs from 'node:fs';
import { chromium } from 'C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
const lines=fs.readFileSync('DEMO-LOGINS.local.md','utf8').split(/\r?\n/);
const row=lines[52];
const cols=row.split('|').map(x=>x.trim()).filter(Boolean);
const username=cols[0], password=cols[3];
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,180)));
try {
 await page.goto('http://127.0.0.1:4300',{waitUntil:'domcontentloaded',timeout:20000});
 const initial=await page.title();
 const loginFields=await page.locator('input').evaluateAll(es=>es.map(e=>({type:e.type,ph:e.placeholder,name:e.name})).slice(0,8));
 const inputs=page.locator('input');
 await inputs.nth(0).fill(username);
 await inputs.nth(1).fill(password);
 const buttons=await page.getByRole('button').allTextContents();
 await page.getByRole('button').first().click();
 await page.waitForTimeout(1800);
 const url=page.url();
 const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,1800);
 await page.screenshot({path:'qa-reports/2026-11-02/final-acceptance/SUR-12-live-login.png',fullPage:true});
 let patientBody=''; let searchInputs=[];
 if(url.includes('/dashboard') || url.includes('/patients')) {
   await page.goto('http://127.0.0.1:4300/patients',{waitUntil:'domcontentloaded',timeout:15000});
   await page.waitForTimeout(1500);
   patientBody=(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000);
   searchInputs=await page.locator('input').evaluateAll(es=>es.map(e=>({type:e.type,ph:e.placeholder,name:e.name,aria:e.getAttribute('aria-label')})));
   await page.screenshot({path:'qa-reports/2026-11-02/final-acceptance/SUR-12-live-patients.png',fullPage:true});
 }
 console.log(JSON.stringify({title:initial,loginFields,buttons,url,body,patientBody,searchInputs,errs},null,2));
} catch(e) { console.log(JSON.stringify({error:String(e),url:page.url(),errs},null,2)); }
await browser.close();
