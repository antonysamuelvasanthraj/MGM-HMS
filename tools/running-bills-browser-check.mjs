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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {navigate}=await import('/src/router.js');await navigate('/billing-desk?desk=reception');await new Promise(r=>setTimeout(r,400));const newIp=!!document.querySelector('[data-new-ip]');document.querySelector('[data-bill-view=ip]').click();await new Promise(r=>setTimeout(r,500));const ipRows=document.querySelectorAll('[data-rows] tr[data-id]').length;const ignoresDate=document.querySelector('[data-f=date]').value==='';document.querySelector('[data-bill-view=pharmacy]').click();await new Promise(r=>setTimeout(r,500));const pharmacyRows=document.querySelectorAll('[data-rows] tr[data-id]').length;const readonly=!document.querySelector('[data-rows] [data-act=collect]')&&!document.querySelector('[data-rows] [data-act=open]');const groups=document.querySelectorAll('#nav details.pharmacy-menu-group').length;return {newIp,ipRows,ignoresDate,pharmacyRows,readonly,groups};})()`,awaitPromise:true,returnByValue:true});const v=result.result?.result?.value;console.log(v);ws.close();if(!v?.newIp||v.ipRows<1||!v.ignoresDate||v.pharmacyRows<1||!v.readonly||v.groups<2)throw Error('Running bill access failed');