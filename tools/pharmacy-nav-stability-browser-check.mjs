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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {navigate}=await import('/src/router.js');const store=await import('/src/store.js');const sidebar=await import('/src/shell/sidebar.js');await navigate('/billing-desk?desk=pharmacy');await new Promise(r=>setTimeout(r,400));sidebar.renderSidebar();const billingHighlighted=!!document.querySelector('#nav a[data-route="/billing-desk?desk=pharmacy"].active');let group=document.querySelector('[data-menu-group="Stock & transfers"]');group.open=false;group.querySelector('summary').click();const expanded=group.open;store.state.badges['pharmacy-sales']=(store.state.badges['pharmacy-sales']||0)+1;sidebar.renderSidebar();group=document.querySelector('[data-menu-group="Stock & transfers"]');const staysOpen=group.open;group.querySelector('a[href="/stock-transfers"]').click();await new Promise(r=>setTimeout(r,700));return {billingHighlighted,expanded,staysOpen,transferPage:document.querySelector('#view').innerText.includes('Stock transfers')&&!!document.querySelector('#view [data-new]')};})()`,awaitPromise:true,returnByValue:true});const value=result.result?.result?.value;console.log(value||result);ws.close();if(!value||Object.values(value).some(v=>v!==true))process.exitCode=1;