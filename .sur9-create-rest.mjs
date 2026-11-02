import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
const out='E:/MGM HMS/qa-reports/2026-11-02/final-acceptance';
const browser=await chromium.launch({channel:'chrome',headless:true}); const context=await browser.newContext({storageState:`${out}/.sur9-auth-state.json`,viewport:{width:1440,height:1000}}); const page=await context.newPage();
page.on('pageerror',e=>console.log('PAGEERROR '+e.message)); const records=[];
await page.goto('http://127.0.0.1:4300/patient/17'); await page.waitForTimeout(300);
const firstBody=await page.locator('body').innerText(); records.push({marker:'TEST-MGM-QA-011',id:17,persisted:firstBody.includes('TEST-MGM-QA-011'),uhid:(firstBody.match(/SHMS-\d{4}-\d{4}/)||[])[0]||null});
await page.screenshot({path:`${out}/SUR-9-patient-011-reopened.png`,fullPage:true});
for(let n=12;n<=20;n++){
 const marker=`TEST-MGM-QA-${String(n).padStart(3,'0')}`; await page.goto('http://127.0.0.1:4300/patients'); await page.waitForTimeout(180);
 await page.getByRole('button',{name:/New patient/}).click(); await page.waitForTimeout(120);
 await page.locator('input[name="name"]').fill(`${marker} - Test Patient ${n}`);
 await page.locator('input[name="age_years"]').fill(String(30+n));
 await page.locator('select[name="gender"]').selectOption(n%2?'Male':'Female');
 await page.locator('input[name="mobile"]').fill(`98765430${String(n).padStart(2,'0')}`);
 const check=await page.locator('form').last().evaluate(f=>({valid:f.checkValidity(),vals:Object.fromEntries(new FormData(f).entries())}));
 if(!check.valid||check.vals.name!==`${marker} - Test Patient ${n}`||check.vals.mobile!==`98765430${String(n).padStart(2,'0')}`) throw new Error(`Form validation mismatch ${marker}`);
 await page.screenshot({path:`${out}/SUR-9-patient-${String(n).padStart(3,'0')}-form.png`,fullPage:true});
 await page.getByRole('button',{name:/Create UHID/}).click(); await page.waitForTimeout(550);
 const url=page.url(); const id=Number(url.match(/\/patient\/(\d+)/)?.[1]);
 const createdBody=await page.locator('body').innerText(); if(!id||!createdBody.includes(marker)) throw new Error(`Creation not confirmed for ${marker}; url=${url}`);
 const uhid=(createdBody.match(/SHMS-\d{4}-\d{4}/)||[])[0]||null;
 await page.screenshot({path:`${out}/SUR-9-patient-${String(n).padStart(3,'0')}-created.png`,fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(280); const reopened=await page.locator('body').innerText();
 const persisted=reopened.includes(marker); if(!persisted) throw new Error(`Reload persistence failed ${marker}`);
 await page.screenshot({path:`${out}/SUR-9-patient-${String(n).padStart(3,'0')}-reopened.png`,fullPage:true});
 records.push({marker,id,uhid,persisted,gender:check.vals.gender,age:check.vals.age_years,mobileSuffix:check.vals.mobile.slice(-4)});
 console.log('SAVED',JSON.stringify(records.at(-1)));
}
console.log('RESULTS',JSON.stringify(records)); await browser.close();
