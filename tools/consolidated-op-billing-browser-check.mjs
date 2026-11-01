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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {navigate}=await import('/src/router.js');await navigate('/billing-desk?desk=reception');await new Promise(r=>setTimeout(r,400));const registrationHidden=!document.querySelector('#nav a[href="/op-registration"]');const button=document.querySelector('[data-new-op]');button.click();await new Promise(r=>setTimeout(r,600));return {registrationHidden,opAction:!!button,form:!!document.querySelector('#modal-root [data-reg-form]'),patientSearch:!!document.querySelector('#modal-root [data-pp-input]'),doctor:!!document.querySelector('#modal-root [name=doctor_id]'),payment:!!document.querySelector('#modal-root [data-pay-mode]')};})()`,awaitPromise:true,returnByValue:true});const value=result.result?.result?.value;console.log(value||result);ws.close();if(!value||Object.values(value).some(v=>v!==true))process.exitCode=1;