/**
 * Realtime link to the hospital server.
 *
 * Views declare the topics they care about; the socket re-subscribes on every
 * reconnect so a dropped LAN link heals without a page refresh.
 */
import { token } from './api.js';

let sock = null;
let retry = 0;
let reconnectTimer = null;
const persistentTopics = ['system', 'dashboard'];
const topics = new Set(persistentTopics);
const topicRefs = new Map();
let topicGeneration = 0;
const handlers = new Map();      // event -> Set<fn>
const stateListeners = new Set();

export const wsState = { status: 'connecting', clients: 0, lastEvent: null, since: Date.now() };

function setStatus(s) {
  wsState.status = s;
  stateListeners.forEach((f) => { try { f(wsState); } catch (e) { console.error(e); } });
}

export function connect() {
  if (sock && (sock.readyState === 0 || sock.readyState === 1)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const station = localStorage.getItem('surely_station') || 'desk';
  sock = new WebSocket(`${proto}://${location.host}/ws?t=${encodeURIComponent(token())}&station=${station}`);
  setStatus('connecting');

  sock.onopen = () => {
    retry = 0;
    setStatus('live');
    send({ type: 'sub', topics: [...topics] });
    // Events sent while the workstation was disconnected cannot be replayed.
    dispatch('realtime.connected', {}, { type: 'connected' });
  };

  sock.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'hello') { wsState.clients = m.clients; setStatus('live'); return; }
    if (m.type === 'event') {
      wsState.lastEvent = m.event;
      if (m.event === 'presence') wsState.clients = m.data?.count ?? wsState.clients;
      dispatch(m.event, m.data, m);
      dispatch('*', m.data, m);
    }
  };

  sock.onclose = () => {
    setStatus('offline');
    retry = Math.min(retry + 1, 8);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, Math.min(500 * 2 ** retry, 15000));
  };

  sock.onerror = () => { try { sock.close(); } catch {} };
}

function send(obj) {
  if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj));
}

function dispatch(event, data, raw) {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of [...set]) { try { fn(data, raw); } catch (e) { console.error('[ws handler]', event, e); } }
}

/** Subscribe to one or more server topics. Returns an unsubscribe function. */
export function subscribe(list) {
  const generation = topicGeneration;
  const owned = [...new Set([].concat(list))];
  const added = [];
  for (const t of owned) {
    topicRefs.set(t, (topicRefs.get(t) || 0) + 1);
    if (!topics.has(t)) { topics.add(t); added.push(t); }
  }
  if (added.length) send({ type: 'sub', topics: added });
  let disposed = false;
  return () => {
    if (disposed || generation !== topicGeneration) return;
    disposed = true;
    const removable = [];
    for (const t of owned) {
      const remaining = (topicRefs.get(t) || 1) - 1;
      if (remaining) topicRefs.set(t, remaining);
      else {
        topicRefs.delete(t);
        if (!persistentTopics.includes(t)) { topics.delete(t); removable.push(t); }
      }
    }
    send({ type: 'unsub', topics: removable });
  };
}

/** Listen for a domain event. Returns an unsubscribe function. */
export function on(event, fn) {
  for (const e of [].concat(event)) {
    if (!handlers.has(e)) handlers.set(e, new Set());
    handlers.get(e).add(fn);
  }
  return () => [].concat(event).forEach((e) => handlers.get(e)?.delete(fn));
}

export function onState(fn) { stateListeners.add(fn); fn(wsState); return () => stateListeners.delete(fn); }

export function announce(view) { send({ type: 'presence', view }); }

/** Drop every view-scoped subscription (called by the router on navigation). */
export function resetTopics(keep = persistentTopics) {
  topicGeneration++;
  topicRefs.clear();
  const drop = [...topics].filter((t) => !keep.includes(t));
  drop.forEach((t) => topics.delete(t));
  if (drop.length) send({ type: 'unsub', topics: drop });
}
