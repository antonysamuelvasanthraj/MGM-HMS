import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({channel:'chrome',headless:true}); const c=await b.newContext({storageState:'E:/MGM HMS/qa-reports/2026-11-02/final-acceptance/.sur9-auth-state.json'}); const p=await c.newPage(); const rows=[];
await p.goto('http://127.0.0.1:4300/patients'); await p.waitForTimeout(250);const q=p.locator('input[placeholder="UHID, name, mobile or ABHA"]');
for(let n=11;n<=20;n++){const marker=`TEST-MGM-QA-${String(n).padStart(3,'0')}`;await q.fill(marker);await p.waitForTimeout(220);const r=await p.evaluate(m=>{const es=[...document.querySelectorAll('tr,[role=row],a,button')].filter(e=>e.innerText?.includes(m));return es.slice(0,4).map(e=>({tag:e.tagName,text:e.innerText.slice(0,500),href:e.getAttribute('href'),outer:e.outerHTML.slice(0,300)}));},marker);rows.push({marker,found:r});}
console.log(JSON.stringify(rows));
await p.goto('http://127.0.0.1:4300/patients'); await p.waitForTimeout(200); const allButtons=await p.locator('button').allTextContents(); console.log('NAV_BUTTONS',JSON.stringify(allButtons.slice(0,15).map(s=>s.trim())));
await b.close();
