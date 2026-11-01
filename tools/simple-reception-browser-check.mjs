import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const patient=db.prepare("SELECT p.id,p.name FROM patients p WHERE NOT EXISTS(SELECT 1 FROM admissions a WHERE a.patient_id=p.id AND a.status<>'discharged') LIMIT 1").get();db.close();
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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {navigate}=await import('/src/router.js');await navigate('/billing-desk?desk=reception');const search=document.querySelector('[data-counter-search]');search.value=${JSON.stringify(patient.name)};search.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,500));document.querySelector('[data-counter-patient="${patient.id}"]').click();await new Promise(r=>setTimeout(r,800));const form=document.querySelector('[data-nb]');const identity=!!document.querySelector('.counter-identity');const advancedCollapsed=[...form.querySelectorAll('details.counter-options')].every(d=>!d.open);const searchService=!!form.querySelector('[data-counter-service-search]');const oldPickersHidden=!form.querySelector('[data-picker]');const paymentOptions=[...form.querySelectorAll('input[name=pay_type]')].every(input=>input.closest('details'));const saveLabel=document.querySelector('[data-save]').innerText.includes('Save bill');return {identity,advancedCollapsed,searchService,oldPickersHidden,paymentOptions,saveLabel};})()`,awaitPromise:true,returnByValue:true});const v=result.result?.result?.value;console.log(v);ws.close();if(!v||Object.values(v).some(x=>x!==true))throw Error('Simplified counter check failed');