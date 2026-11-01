import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const bill=db.prepare("SELECT b.id FROM bills b JOIN bill_items i ON i.bill_id=b.id WHERE b.bill_type='IP' AND b.status<>'cancelled' GROUP BY b.id ORDER BY count(*) DESC LIMIT 1").get();db.close();
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

await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
const result=await send('Runtime.evaluate',{expression:`(async()=>{const {api}=await import('/src/api.js');const data=await api.get('/bills/${bill.id}');const {openBill}=await import('/src/views/bills.js');await openBill(${bill.id},()=>{});const panel=document.querySelector('.bill-detail-panel');const details=panel.querySelector('.bill-line-details');const summaryRows=panel.querySelectorAll('.bill-summary tbody tr');const displayed=[...summaryRows].reduce((sum,row)=>sum+Number(row.lastElementChild.innerText.replace(/[^0-9.-]/g,'').replace('−','-')),0);const expected=data.items.reduce((sum,item)=>sum+Number(item.amount),0);const totalsMatch=Math.abs(displayed-expected)<0.01;const width=panel.getBoundingClientRect().width;const grouped=summaryRows.length<data.items.length;const ledgerClosed=!details.open;details.open=true;const actionsRetained=!!panel.querySelector('[data-print]')&&!!panel.querySelector('[data-ip-plan]');details.open=false;return {width,grouped,ledgerClosed,totalsMatch,actionsRetained,summaryRows:summaryRows.length,ledgerRows:data.items.length};})()`,awaitPromise:true,returnByValue:true});const v=result.result?.result?.value;console.log(v);await new Promise(r=>setTimeout(r,600));const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('data/logs/ipd-bill-layout.png',Buffer.from(shot.result.data,'base64'));ws.close();if(!v?.grouped||!v.ledgerClosed||!v.totalsMatch||!v.actionsRetained||v.width<1100)throw Error('Bill layout check failed');
