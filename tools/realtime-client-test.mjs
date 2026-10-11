import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual browser modules with controlled sockets and lifecycle events.
const sockets = [], timers = new Map();
let nextTimer = 0;
class Socket {
  constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen(); }
  close() { this.readyState = 3; this.onclose(); }
  message(event, topics) { this.onmessage({ data: JSON.stringify({ type: 'event', event, topics, data: {} }) }); }
}
const surface = () => {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    fire(name) { for (const fn of listeners.get(name) || []) fn(); },
  };
};
const document = surface(), window = surface();
const errors = [], contexts = [];
let resolveLoad, hold = false;
const sandbox = {
  console, WebSocket: Socket, location: { protocol: 'http:', host: 'localhost' },
  localStorage: { getItem: () => null }, token: () => 'test', document, window,
  setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
  clearTimeout: id => timers.delete(id),
  setInterval: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
  clearInterval: id => timers.delete(id),
  debounce: fn => { const f = (...a) => fn(...a); f.cancel = () => {}; return f; },
  apiError: e => errors.push(e),
  loadMeta: async () => {},
  load: async context => { contexts.push(context); if (hold) await new Promise(r => { resolveLoad = r; }); },
};
vm.createContext(sandbox);
const ws = fs.readFileSync('client/src/ws.js', 'utf8').replace(/import .*?;\r?\n/, '').replaceAll('export ', '');
const kit = fs.readFileSync('client/src/views/_kit.js', 'utf8');
const live = kit.slice(kit.indexOf('export function live('), kit.indexOf('/** Read the current view', kit.indexOf('export function live('))).replace('export ', '');
vm.runInContext(ws + '\n' + live, sandbox);
const evaluate = code => vm.runInContext(code, sandbox);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
evaluate('connect(); var a = subscribe(["pharmacy"]); var b = subscribe(["pharmacy"]);');
sockets[0].open();
evaluate('a(); a();');
assert.equal(sockets[0].sent.some(m => m.type === 'unsub' && m.topics.includes('pharmacy')), false);
evaluate('b();');
assert.equal(sockets[0].sent.filter(m => m.type === 'unsub' && m.topics.includes('pharmacy')).length, 1);
evaluate('var stale = subscribe(["pharmacy"]); resetTopics(); var fresh = subscribe(["pharmacy"]); stale();');
assert.equal(sockets[0].sent.at(-1).type, 'sub', 'stale disposal must not cancel new screen subscription');
evaluate('var stop = live({ topics: ["pharmacy"], events: ["prescription.saved"], load });');
const catchUp = [...timers.values()].at(-1);
await flush();
assert.equal(contexts.length, 1);
sockets[0].message('prescription.saved', ['pharmacy']); await flush();
assert.equal(contexts.length, 2, 'prescription updates the receiving screen');
sockets[0].message('new.pharmacy.event', ['pharmacy']); await flush();
assert.equal(contexts.length, 3, 'new relevant event names also update the screen');
sockets[0].message('unrelated.changed', ['quality']);
sockets[0].message('presence', ['pharmacy']); await flush();
assert.equal(contexts.length, 3);
sockets[0].close();
const reconnect = [...timers.values()].at(-1); reconnect(); sockets[1].open(); await flush();
assert.equal(contexts.length, 4, 'reconnect catches events missed offline');
assert.ok(sockets[1].sent.some(m => m.type === 'sub' && m.topics.includes('pharmacy')));
document.visibilityState = 'hidden'; document.fire('visibilitychange'); await flush();
assert.equal(contexts.length, 4);
document.visibilityState = 'visible'; document.fire('visibilitychange'); await flush();
window.fire('focus'); await flush();
assert.equal(contexts.length, 6, 'returning to workstation catches up');
hold = true; sockets[1].message('prescription.saved', ['pharmacy']);
await flush();
sockets[1].message('stock.changed', ['pharmacy']); sockets[1].message('bill.updated', ['pharmacy']);
assert.equal(contexts.length, 7, 'loads do not overlap');
hold = false; resolveLoad(); await flush();
assert.equal(contexts.length, 8, 'events during loading trigger one trailing refresh');
assert.equal(contexts.at(-1).live, true, 'clinical draft protection receives live context');
catchUp(); await flush();
assert.equal(contexts.length, 9, 'fallback refresh catches silently missed updates');
document.visibilityState = 'hidden'; catchUp(); await flush();
assert.equal(contexts.length, 9, 'hidden screens do not poll');
document.visibilityState = 'visible';
const count = contexts.length;
evaluate('stop();'); sockets[1].message('prescription.saved', ['pharmacy']); window.fire('focus'); document.fire('visibilitychange'); await flush();
assert.equal(contexts.length, count, 'disposed screens never refresh');
assert.equal(timers.size, 1, 'only simulated fired reconnect timer remains');
assert.equal(errors.length, 0);
// Every operational route must either use live(), delegate to a live controller,
// or provide its own subscription. Sign-in is the only static exception.
for (const file of fs.readdirSync('client/src/views')) {
  if (['_kit.js', 'login.js'].includes(file)) continue;
  const source = fs.readFileSync(`client/src/views/${file}`, 'utf8');
  assert.match(source, /\blive\(|subscribe\(|export \{ mount \}|navigate\('\/accounts/, `${file} lacks live wiring`);
}
const listeners = new Map();
let metaCalls = 0;
const metadataSandbox = {
  console, api: { get: async () => { metaCalls++; return { services: [{ price: metaCalls }] }; } },
  on: (events, fn) => { for (const event of events) listeners.set(event, fn); },
};
vm.createContext(metadataSandbox);
vm.runInContext(fs.readFileSync('client/src/store.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export \{.*\};/g, '').replaceAll('export ', ''), metadataSandbox);
await vm.runInContext('loadMeta()', metadataSandbox);
await vm.runInContext('loadMeta()', metadataSandbox);
assert.equal(metaCalls, 1, 'unchanged masters use cache');
listeners.get('service.updated')();
await vm.runInContext('Promise.all([loadMeta(), loadMeta()])', metadataSandbox);
assert.equal(metaCalls, 2, 'another desk tariff update invalidates and coalesces metadata fetches');
listeners.get('realtime.connected')();
await vm.runInContext('loadMeta()', metadataSandbox);
assert.equal(metaCalls, 3, 'reconnect also catches missed master changes');
console.log('PASS realtime client: subscriptions, event routing, reconnect, resume, serial refresh and disposal');
