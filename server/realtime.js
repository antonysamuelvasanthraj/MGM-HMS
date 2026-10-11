import { WebSocketServer } from 'ws';
import { get, run, all } from './db.js';
import { can } from './auth.js';

/**
 * Topic-based realtime hub.
 *
 * A client sends  {type:'sub', topics:[...]}  and then receives
 * {type:'event', topic, event, data} for anything published on those topics.
 * Topics are coarse ("queue", "billing", "lab") plus entity-scoped
 * ("patient:12", "encounter:340") so a detail screen only wakes for its row.
 */

const clients = new Set();
let wss = null;

export function attachRealtime(server, sessionForToken) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('t');
    const session = token ? sessionForToken(token) : null;

    const client = {
      ws,
      topics: new Set(['system']),
      user: session ? { id: session.user_id, name: session.name, role: session.role } : null,
      station: url.searchParams.get('station') || 'unknown',
      alive: true,
      since: Date.now(),
    };
    clients.add(ws);
    ws.__c = client;

    ws.on('pong', () => { client.alive = true; });

    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'sub')   (m.topics || []).forEach((t) => client.topics.add(t));
      if (m.type === 'unsub') (m.topics || []).forEach((t) => client.topics.delete(t));
      if (m.type === 'ping')  send(ws, { type: 'pong', t: Date.now() });
      if (m.type === 'presence') { client.view = m.view; broadcastPresence(); }
    });

    ws.on('close', () => { clients.delete(ws); broadcastPresence(); });

    send(ws, {
      type: 'hello',
      user: client.user,
      serverTime: new Date().toISOString(),
      clients: clients.size,
    });
    broadcastPresence();
  });

  const iv = setInterval(() => {
    for (const ws of clients) {
      const c = ws.__c;
      if (!c.alive) { ws.terminate(); clients.delete(ws); continue; }
      c.alive = false;
      try { ws.ping(); } catch {}
    }
  }, 25000);
  wss.on('close', () => clearInterval(iv));

  return wss;
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

/** Publish a domain event to every client subscribed to any of `topics`. */
export function publish(topics, event, data) {
  const list = Array.isArray(topics) ? topics : [topics];
  for (const ws of clients) {
    const c = ws.__c;
    if (!list.some((t) => c.topics.has(t)) || ws.readyState !== 1) continue;
    if(event==='notify' && ((!c.user) || (data?.role && c.user.role!==data.role) || (data?.user_id && c.user.id!==data.user_id)))continue;
    // Domain events wake a view; the authorised API supplies its records. Do
    // not broadcast complete clinical notes, bills or settings to subscribers.
    let payload=data;
    if(!['tick','presence','notify'].includes(event)){
      payload={};
      for(const key of ['id','patient_id','encounter_id','admission_id','bill_id','order_id'])if(Number.isInteger(data?.[key]))payload[key]=data[key];
      if(event==='lab.critical'&&(can(c.user,'lab.view')||can(c.user,'patient.clinical')))payload={...payload,critical:data?.critical,order:{id:data?.order?.id,label:data?.order?.label}};
      if(event==='emergency.created'&&can(c.user,'emergency.view'))payload={...payload,triage:data?.triage,complaint:data?.complaint,bay:data?.bay};
    }
    if(event==='presence'&&!c.user)payload={count:data?.count};
    ws.send(JSON.stringify({type:'event',topics:list,event,data:payload,at:Date.now()}));
  }
}

/** Toast-style push to a role or everyone. */
export function notify(level, title, body, { role = null, user_id = null, link = null } = {}) {
  publish(['system'], 'notify', { level, title, body, role, user_id, link });
}

function broadcastPresence() {
  const stations = {};
  for (const ws of clients) {
    const c = ws.__c;
    const key = c.user ? `${c.user.name}` : 'Guest';
    stations[key] = { view: c.view || '-', role: c.user?.role || 'guest', since: c.since };
  }
  publish(['system', 'presence'], 'presence', { count: clients.size, stations });
}

export const clientCount = () => clients.size;
