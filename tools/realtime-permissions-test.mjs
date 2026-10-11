import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hms-realtime-check-'));
process.env.SURELY_DATA=dir;
const {attachRealtime,publish,notify}=await import('../server/realtime.js');
const {db}=await import('../server/db.js');
const server=http.createServer();
const hub=attachRealtime(server,t=>t==='admin'?{user_id:1,name:'Test admin',role:'admin'}:t==='hr'?{user_id:2,name:'Test HR',role:'hr'}:null);
server.listen(0,'127.0.0.1');await once(server,'listening');
const sockets=[];
try {
 const clients=[];
 for(const token of ['admin','hr','']){
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?t=${token}`);sockets.push(ws);
  const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));
  await once(ws,'open');ws.send(JSON.stringify({type:'sub',topics:['patients','lab','emergency']}));
  ws.send(JSON.stringify({type:'ping'}));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Subscription timeout')),3000);const handler=raw=>{if(JSON.parse(raw).type==='pong'){clearTimeout(timer);ws.off('message',handler);resolve();}};ws.on('message',handler);});
  clients.push({token,messages});
 }
 publish(['patients'],'patient.updated',{id:42,name:'Private name',clinical_notes:'Private clinical notes'});
 publish(['lab'],'lab.critical',{id:4,critical:2,order:{id:4,label:'Private lab label'}});
 notify('warning','Admin only','Private alert',{role:'admin'});
 // A ping round trip follows the ordered event frames, without a timing sleep.
 for(const ws of sockets){ws.send(JSON.stringify({type:'ping'}));await new Promise(resolve=>{const handler=raw=>{if(JSON.parse(raw).type==='pong'){ws.off('message',handler);resolve();}};ws.on('message',handler);});}
 for(const c of clients){
  const update=c.messages.find(m=>m.event==='patient.updated');assert.deepEqual(update.data,{id:42});
  const critical=c.messages.find(m=>m.event==='lab.critical');
  assert.equal(Boolean(critical.data.order),c.token==='admin');
  assert.equal(c.messages.some(m=>m.event==='notify'),c.token==='admin');
  if(!c.token)assert.ok(c.messages.filter(m=>m.event==='presence').every(m=>!m.data.stations));
 }
 console.log('PASS: realtime payload redaction, clinical alert permissions, role-targeted notifications and guest presence privacy');
}finally{
 sockets.forEach(ws=>ws.terminate());await new Promise(resolve=>hub.close(resolve));await new Promise(resolve=>server.close(resolve));db.close();
 const actual=fs.realpathSync(dir);if(path.dirname(actual)===fs.realpathSync(os.tmpdir())&&path.basename(actual).startsWith('hms-realtime-check-'))fs.rmSync(actual,{recursive:true,force:true});
}
