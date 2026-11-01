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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const store=await import('/src/store.js');await store.loadMeta(true);const old=store.state.meta.settings.workflow_doctor;const host=document.createElement('div');document.body.append(host);try{store.state.meta.settings.workflow_doctor='manual';const bills=await import('/src/views/bills.js');const stop=await bills.mount({host,root:host,query:{},params:[]});const result={noSeparateOPAction:!host.querySelector('[data-new-op]'),newBillAvailable:!!host.querySelector('[data-new]'),ipAdmissionAvailable:!!host.querySelector('[data-new-ip]')};stop?.();return result;}finally{store.state.meta.settings.workflow_doctor=old;host.remove();}})()`,awaitPromise:true,returnByValue:true});const value=result.result?.result?.value;console.log(value||result);ws.close();if(!value||Object.values(value).some(v=>v!==true))process.exitCode=1;