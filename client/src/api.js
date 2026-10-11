/** Thin fetch wrapper: session header, JSON in/out, typed errors. */

let TOKEN = localStorage.getItem('surely_token') || '';

export const token = () => TOKEN;
export function setToken(t) {
  TOKEN = t || '';
  if (t) localStorage.setItem('surely_token', t);
  else localStorage.removeItem('surely_token');
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error || `HTTP ${status}`);
    this.status = status;
    this.payload = payload || {};
  }
}

async function request(method, path, body, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { 'X-Session': TOKEN } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal,
  });
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('surely:unauthorised'));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (p, opts) => request('GET', p, undefined, opts),
  post: (p, b, opts) => request('POST', p, b ?? {}, opts),
  patch: (p, b, opts) => request('PATCH', p, b ?? {}, opts),
  put: (p, b, opts) => request('PUT', p, b ?? {}, opts),
  del: (p, opts) => request('DELETE', p, undefined, opts),
};

/** `qs({date:'2026-09-23', status:''})` → `?date=2026-09-23` */
export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '' || v === 'all') continue;
    u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}
