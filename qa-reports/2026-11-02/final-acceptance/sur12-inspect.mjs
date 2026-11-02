import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({channel:'chrome',headless:true});
const c=await b.newContext({acceptDownloads:false});const p=await c.newPage();p.on('console',m=>{if(m.type()==='error')console.log('console-error',m.text().slice(0,160))});
const res=await p.goto('http://127.0.0.1:4300',{waitUntil:'domcontentloaded',timeout:10000}).catch(e=>null);
console.log('status',res?.status(),'url',p.url(),'title',await p.title());
console.log((await p.locator('body').innerText().catch(e=>'')).slice(0,1200));
await p.screenshot({path:'qa-reports/2026-11-02/final-acceptance/SUR-12-port4300-initial.png',fullPage:true});
await b.close();
