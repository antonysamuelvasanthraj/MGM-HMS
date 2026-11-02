/** Application state shared by the shell and every view. */
import { api, setToken } from './api.js';
import { on } from './ws.js';
let metaDirty = true;
let metaRequest = null;
let metaVersion = 0;
on(['realtime.connected', 'settings.changed', 'user.saved', 'roles.changed', 'service.created', 'service.updated', 'payer.saved', 'package.created', 'bed.updated', 'master.created'], () => { metaDirty = true; metaVersion++; });

export const state = {
  user: null,
  meta: null,          // departments, doctors, services, counters, wards, settings
  badges: {},
  notifications: [],
  route: null,
};

const listeners = new Set();
export function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => { try { f(state); } catch (e) { console.error(e); } }); }

export function can(perm) {
  if (Array.isArray(perm)) return perm.some(can);
  const p = state.user?.perms || [];
  if (p.includes('*')) return true;
  if (p.includes(perm)) return true;
  return p.includes(`${perm.split('.')[0]}.*`);
}

export async function loadSession() {
  const r = await api.get('/auth/me');
  state.user = r.user;
  emit();
  return r.user;
}

export async function loadMeta(force = false) {
  if (state.meta && !force && !metaDirty) return state.meta;
  // A save may finish while an older metadata read is still in flight.
  // Forced refresh must fetch after that read rather than reuse stale settings.
  if (metaRequest) {
    if (!force) return metaRequest;
    await metaRequest;
    return loadMeta(true);
  }
  const version = metaVersion;
  metaRequest = api.get('/meta').then(meta => {
    state.meta = meta;
    // the hospital's chosen look (Settings → Appearance), remembered for the next start
    const theme = meta?.settings?.ui_theme === 'maroon' ? 'maroon' : 'calm';
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('hms_theme', theme); } catch { /* private window, or not a browser */ }
    metaDirty = metaVersion !== version;
    emit();
    return meta;
  }).finally(() => { metaRequest = null; });
  return metaRequest;
}

export async function refreshBadges() {
  try { state.badges = await api.get('/dashboard/badges'); emit(); } catch {}
  return state.badges;
}

export async function signIn(username, password, counter_id) {
  const r = await api.post('/auth/login', { username, password, counter_id });
  setToken(r.token);
  state.user = r.user;
  emit();
  return r.user;
}

export async function signOut() {
  try { await api.post('/auth/logout'); } catch {}
  setToken('');
  state.user = null;
  location.href = '/login';
}

/* --------------------------------------------------------- lookups */

export const doctors = () => state.meta?.doctors || [];
export const departments = () => state.meta?.departments || [];
export const counters = () => state.meta?.counters || [];
export const services = (cat) => (state.meta?.services || []).filter((s) => !cat || s.category === cat);
export const setting = (k, d = '') => state.meta?.settings?.[k] ?? d;
/** Barcode wristbands and sample tube labels belong to Paperless / Hybrid working; Paper mode writes them by hand. */
/** Sample labels are optional in every mode (paper, paperless, hybrid): printed on demand, or automatically at collection when Settings says so. */
export const autoPrintsSampleLabels = () => setting('lab_label_auto', '0') === '1';
export const printsBarcodeLabels = () => setting('hospital_mode', 'paperless') !== 'paper';
export const doctorById = (id) => doctors().find((d) => d.id === +id);
export const deptById = (id) => departments().find((d) => d.id === +id);
export const staffById = (id) => (state.meta?.staff || []).find((s) => s.id === +id);

export { emit as notifyState };
