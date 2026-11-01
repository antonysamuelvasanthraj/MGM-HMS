import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
db.close();
const targets=await fetch('http://127.0.0.1:9559/json').then(r=>r.json());
const target=targets.find(t=>t.type==='page' && t.url.startsWith('http://localhost:4300'));
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map();
ws.addEventListener('message',event=>{const d=JSON.parse(event.data);if(pending.has(d.id)){pending.get(d.id)(d);pending.delete(d.id);}});
const send=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
await send('Runtime.evaluate',{expression:`localStorage.setItem('surely_token',${JSON.stringify(session.token)})`});
await send('Page.reload',{ignoreCache:true});
await new Promise(resolve=>setTimeout(resolve,1500));
const result=await send('Runtime.evaluate',{expression:`(async()=>{try{const api=await import('/src/api.js');api.setToken(localStorage.getItem('surely_token'));const {newGRN}=await import('/src/grn-form.js');await newGRN(()=>{},null,{text:'Sunrise Medical Distributors invoice No. | TEST-GRN-001',items:[{name:'Paracetamol 500 mg Tablets',source:'Paracetamol',qty:10,units_per_pack:10,rate:20,mrp:30,gst_pct:5,batch_no:'PCM001',expiry:'2028-12'}]});return {title:document.querySelector('[role=dialog] h2')?.textContent,rows:document.querySelectorAll('.grn-row').length};}catch(e){return {error:e.message,stack:e.stack};}})()`,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(result.result));
await send('Runtime.evaluate',{expression:`(async()=>{const {scanInvoice}=await import('/src/invoice-scan.js');scanInvoice();})()`,awaitPromise:true});
const dom=await send('DOM.getDocument');
const input=await send('DOM.querySelector',{nodeId:dom.result.root.nodeId,selector:'[data-image]'});
await send('DOM.setFileInputFiles',{nodeId:input.result.nodeId,files:['C:/Users/SAMUEL/.codex/generated_images/01a13a65-6352-76b0-98ad-6e23c036a456/exec-9f285ec4-f319-45e4-8956-4d2bd6220e8b.png']});
await send('Runtime.evaluate',{expression:`document.querySelector('[data-scan]').click()`});
let ready=false;
for(let i=0;i<60;i++){
  await new Promise(r=>setTimeout(r,500));
  const check=await send('Runtime.evaluate',{expression:`!document.querySelector('[data-scan]')?.disabled`,returnByValue:true});
  if(check.result.result.value){ready=true;break;}
}
if(!ready)throw Error('OCR timed out');
const transfer=await send('Runtime.evaluate',{expression:`(async()=>{document.querySelector('[data-transfer]').click();await new Promise(r=>setTimeout(r,1500));return {title:document.querySelector('[role=dialog] h2')?.textContent,status:document.querySelector('[data-transfer-status]')?.textContent,rows:document.querySelectorAll('.grn-row').length};})()`,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(transfer.result));
const packCheck=await send('Runtime.evaluate',{expression:`(async()=>{const {api}=await import('/src/api.js');const meds=(await api.get('/pharmacy/medicines?limit=1000')).rows;const medicine=meds.find(m=>(m.pack_size||1)*(m.units_per_pack||1)!==10);if(!medicine)throw Error('No differing pack fixture');const row=document.querySelector('.grn-row');const pick=row.querySelector('[data-key=medicine_id]');pick.value=medicine.id;pick.dispatchEvent(new Event('change',{bubbles:true}));return {pack:row.querySelector('[data-key=units_per_pack]').value,qty:row.querySelector('[data-key=qty]').value,rate:row.querySelector('[data-key=rate]').value,warning:row.querySelector('[data-pack-warning]')?.textContent};})()`,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(packCheck.result));
if(packCheck.result?.result?.value?.pack!=='10')throw Error('Scanned pack changed on selection');
ws.close();
