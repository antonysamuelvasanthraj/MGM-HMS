import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const patient=db.prepare("SELECT p.id,p.name FROM patients p JOIN admissions a ON a.patient_id=p.id WHERE a.status<>'discharged' LIMIT 1").get();db.close();
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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {navigate}=await import('/src/router.js');await navigate('/billing-desk?desk=reception');await new Promise(r=>setTimeout(r,500));const oldScreen=document.getElementById('view').innerText.includes('Billing & Invoice Management')&&!document.querySelector('[data-counter-search]');document.querySelector('[data-new]').click();await new Promise(r=>setTimeout(r,500));const input=document.querySelector('#modal-root [data-pp-input]');input.value=${JSON.stringify(patient.name)};input.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,650));document.querySelector('#modal-root [data-pp-list] [data-id="${patient.id}"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await new Promise(r=>setTimeout(r,900));const form=document.querySelector('[data-nb]');return {oldScreen,newBillDialog:!!form.closest('[role=dialog]'),ipDetected:form.bill_type.value==='IP',ipEncounterLocked:form.encounter_id.disabled,overallDiscount:!!form.overall_discount};})()`,awaitPromise:true,returnByValue:true});const v=result.result?.result?.value;console.log(v);ws.close();if(!v||Object.values(v).some(x=>x!==true))throw Error('Old billing restoration failed');