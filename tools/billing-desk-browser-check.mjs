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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {navigate}=await import('/src/router.js');const {renderSidebar}=await import('/src/shell/sidebar.js');renderSidebar();const receptionEntries=document.querySelectorAll('#nav a[href="/billing-desk?desk=reception"]').length;const oldEntries=['/op-fee-collection','/service-payments','/bills','/receipts'].filter(r=>document.querySelector('#nav a[href="'+r+'"]'));await navigate('/billing-desk?desk=reception');await new Promise(r=>setTimeout(r,500));const date=document.querySelector('[data-f=date]')?.value;const failures=[];for(const tab of ['op','tests','services','receipts','bills']){document.querySelector('[data-desk-tab="'+tab+'"]').click();await new Promise(r=>setTimeout(r,500));if(document.querySelector('[data-desk-content]').innerText.includes('Could not load'))failures.push(tab);}await navigate('/billing-desk?desk=pharmacy');await new Promise(r=>setTimeout(r,500));const patientFirst=!!document.querySelector('[data-picker]')&&document.querySelector('[data-picker]').compareDocumentPosition(document.querySelector('[data-msearch]'))===4;document.querySelector('[data-desk-tab=bills]').click();await new Promise(r=>setTimeout(r,500));const pharmacyType=document.querySelector('[data-f=type]')?.value;return {receptionEntries,oldEntries,date,failures,patientFirst,pharmacyType};})()`,awaitPromise:true,returnByValue:true});const v=result.result?.result?.value;console.log(v);ws.close();if(v?.receptionEntries!==1||v.oldEntries.length||!v.date||v.failures.length||!v.patientFirst||v.pharmacyType!=='PHARM')throw Error('Consolidated billing check failed');