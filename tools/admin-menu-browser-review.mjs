import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
let session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
db.close();
if(!session){const r=await fetch('http://localhost:4300/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.HMS_REVIEW_PASSWORD||'surely'})});if(!r.ok)throw Error('Administrator login required for browser review');session=await r.json();}
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

const result=await send('Runtime.evaluate',{expression:`(async()=>{const {NAV}=await import('/src/shell/nav.js');const {navigate}=await import('/src/router.js');const routes=[...new Set(NAV.flatMap(g=>g.items).map(i=>i.route))];const failures=[];for(const route of routes){try{await navigate(route);await new Promise(r=>setTimeout(r,200));const text=document.getElementById('view').innerText;if(/Could not load|No screen at|Access restricted/.test(text)||!text.trim())failures.push({route,error:text.slice(0,160)});}catch(e){failures.push({route,error:e.message});}}return {pages:routes.length,failures};})()`,awaitPromise:true,returnByValue:true});console.log(JSON.stringify(result.result?.result?.value));ws.close();