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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {mount}=await import('/src/views/settings.js');await mount({host:document.getElementById('view'),params:[],query:{}});await new Promise(r=>setTimeout(r,700));document.querySelector('[data-change-mode]').click();const root=document.getElementById('modal-root'),button=root.querySelector('[data-apply]');root.querySelector('input[name=mode]:not(:disabled)').checked=true;root.querySelector('[data-confirm]').checked=true;const original=window.fetch;let requests=0;window.fetch=async(...args)=>{if(String(args[0])==='/api/admin/operating-mode'&&args[1]?.method==='POST'){requests++;return new Response(JSON.stringify({error:'reason_required'}),{status:400,headers:{'Content-Type':'application/json'}});}return original(...args);};try{root.querySelector('[data-reason]').value='na';button.click();const shortReasonBlocked=requests===0&&!button.disabled&&root.querySelector('[data-mode-error]').innerText.includes('5');root.querySelector('[data-reason]').value='Switch to digital workflow';button.click();await new Promise(r=>setTimeout(r,400));const recovered=!button.disabled&&!button.innerText.includes('Changing');const errorShown=!!root.querySelector('[data-mode-error]').innerText;return {shortReasonBlocked,recovered,errorShown,requests,liveModeUnchanged:true};}finally{window.fetch=original;root.querySelector('[data-close]').click();}})()`,awaitPromise:true,returnByValue:true});const v=result.result?.result?.value;console.log(v);ws.close();if(!v?.shortReasonBlocked||!v.recovered||!v.errorShown||v.requests!==1)throw Error('Mode dialog recovery failed');