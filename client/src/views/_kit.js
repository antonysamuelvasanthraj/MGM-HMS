/**
 * Page kit.
 *
 * Every screen is assembled from the same blocks so the 55 converted designs
 * stay visually consistent once they are driven by live data: page header →
 * one main action → summary → filters → working table → detail drawer
 * (section 5 of the operating brief).
 */
import { $, $$, esc, el, bind, debounce, toast, spinner, emptyState, renderRows, kpi, ageText } from '../ui.js';
import { api, qs } from '../api.js';
import { subscribe, on } from '../ws.js';
import { state, can, setting, doctors, departments, counters, services, doctorById, deptById, staffById, loadMeta } from '../store.js';
import { navigate } from '../router.js';

export * from '../ui.js';
export { api, qs, subscribe, on, state, can, navigate, setting, doctors, departments, counters, services, doctorById, deptById, staffById };

/* --------------------------------------------------------------- layout */

export function page({ eyebrow, title, subtitle, actions = '', meta = '', body = '', wide = false }) {
  return `
  <div class="p-6 space-y-5 ${wide ? '' : 'max-w-content'} mx-auto w-full">
    <div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
      <div class="min-w-0">
        ${eyebrow ? `<div class="flex items-center gap-2 flex-wrap">${eyebrow}</div>` : ''}
        <h1 class="font-headline-lg text-headline-lg text-on-surface mt-1">${esc(title)}</h1>
        ${subtitle ? `<p class="text-body-lg text-on-surface-variant mt-1 max-w-3xl">${subtitle}</p>` : ''}
      </div>
      ${actions ? `<div class="flex flex-wrap items-center gap-2 shrink-0">${actions}</div>` : ''}
    </div>
    ${meta ? `<div class="flex flex-wrap items-center gap-2">${meta}</div>` : ''}
    ${body}
  </div>`;
}

export const eyebrow = (text, icon = 'apartment') =>
  `<span class="inline-flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-widest
     text-primary bg-primary-fixed px-2 py-0.5 rounded">
     <span class="material-symbols-outlined text-[13px]">${icon}</span>${esc(text)}</span>`;

export const liveChip = () =>
  `<span class="inline-flex items-center gap-1.5 font-label-sm text-label-sm uppercase tracking-wider
     text-on-surface-variant"><span class="live-dot"></span>Live</span>`;

/** A clean installation has no clinician accounts until the administrator adds them. */
export function doctorSetupNotice() {
  if (doctors().length) return '';
  return `<div class="rounded-lg border border-outline-variant bg-surface-container-low p-4" role="status">
    <p class="font-label-lg text-label-lg">Add a doctor to begin</p>
    <p class="text-body-md text-on-surface-variant mt-1">Visits and appointments need an active doctor account with a department and consultation tariff.</p>
    ${can('admin.write') ? '<a href="/users" class="btn-secondary btn-sm mt-3">Open staff setup</a><p class="text-body-sm text-on-surface-variant mt-2">Choose Add staff, then select the Doctor role.</p>'
      : '<p class="text-body-sm text-on-surface-variant mt-2">Ask your administrator to add a doctor in Users &amp; Roles.</p>'}
  </div>`;
}

export function kpiRow(cards, cols = 4) {
  return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-${cols} gap-4" data-kpis>
    ${cards.map(kpi).join('')}</div>`;
}

export function card({ title, subtitle, actions = '', body, pad = true, className = '' }) {
  return `<section class="card ${className}">
    ${title ? `<header class="flex items-center justify-between gap-3 px-4 h-12 border-b border-outline-variant">
      <div class="min-w-0">
        <h2 class="panel-title truncate">${esc(title)}</h2>
        ${subtitle ? `<p class="text-body-sm text-on-surface-variant truncate">${subtitle}</p>` : ''}
      </div>
      ${actions ? `<div class="flex items-center gap-2 shrink-0">${actions}</div>` : ''}
    </header>` : ''}
    <div class="${pad ? 'p-4' : ''}">${body}</div>
  </section>`;
}

export function tableCard({ title, subtitle, actions = '', columns, id = 'tbl', footer = '', maxHeight = '62vh' }) {
  return card({
    title, subtitle, actions, pad: false,
    body: `<div class="overflow-auto" style="max-height:${maxHeight}">
      <table class="tbl" id="${id}">
        <thead><tr>${columns.map((c) => `<th class="${c.cls || ''}" ${c.width ? `style="width:${c.width}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody data-rows>${`<tr><td colspan="${columns.length}">${spinner('Loading')}</td></tr>`}</tbody>
      </table></div>${footer}`,
  });
}

/* --------------------------------------------------------------- filters */

/**
 * Filter bar. Each control declares `{type,key,label,options|placeholder}` and
 * the returned `read()` collects them into a plain object.
 */
export function filterBar(controls, { right = '' } = {}) {
  return `<div class="card p-3 flex flex-wrap items-end gap-2.5" data-filters>
    ${controls.map((c) => control(c)).join('')}
    <div class="flex-1"></div>
    ${right}
  </div>`;
}

function control(c) {
  const w = c.width || (c.type === 'search' ? 'min-w-[260px] flex-1 max-w-md' : 'min-w-[150px]');
  if (c.type === 'search') {
    return `<div class="${w}">
      ${c.label ? `<label class="field-label">${esc(c.label)}</label>` : ''}
      <div class="relative">
        <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-on-surface-variant pointer-events-none">search</span>
        <input class="field !pl-9" data-f="${c.key}" placeholder="${esc(c.placeholder || 'Search…')}" value="${esc(c.value || '')}" autocomplete="off">
      </div></div>`;
  }
  if (c.type === 'date') {
    return `<div class="${w}">
      ${c.label ? `<label class="field-label">${esc(c.label)}</label>` : ''}
      <input type="date" class="field" data-f="${c.key}" value="${esc(c.value || '')}"></div>`;
  }
  if (c.type === 'segment') {
    return `<div class="${c.width || ''}">
      ${c.label ? `<label class="field-label">${esc(c.label)}</label>` : ''}
      <div class="inline-flex p-0.5 rounded bg-surface-container" data-seg="${c.key}">
        ${c.options.map((o) => `<button type="button" data-v="${esc(o.value)}"
          class="px-2.5 h-8 rounded font-label-md text-label-md transition-colors
            ${o.value === c.value ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}">
          ${esc(o.label)}${o.count !== undefined ? ` <span class="font-data-mono opacity-70">${o.count}</span>` : ''}</button>`).join('')}
      </div></div>`;
  }
  // select
  return `<div class="${w}">
    ${c.label ? `<label class="field-label">${esc(c.label)}</label>` : ''}
    <select class="field" data-f="${c.key}">
      ${(c.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(c.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select></div>`;
}

/** Wire a filter bar: returns `{read, onChange}`. */
export function wireFilters(root, onChange) {
  const bar = root.querySelector('[data-filters]');
  if (!bar) return { read: () => ({}) };
  const read = () => {
    const out = {};
    $$('[data-f]', bar).forEach((i) => { out[i.dataset.f] = i.value; });
    $$('[data-seg]', bar).forEach((s) => {
      const active = s.querySelector('.bg-white');
      out[s.dataset.seg] = active?.dataset.v ?? '';
    });
    return out;
  };
  const fire = () => onChange(read());
  $$('[data-f]', bar).forEach((i) => {
    if (i.tagName === 'INPUT' && i.type === 'text') i.addEventListener('input', debounce(fire, 280));
    else i.addEventListener('change', fire);
  });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button');
    if (!b) return;
    const seg = b.closest('[data-seg]');
    $$('button', seg).forEach((x) => x.className = x.className
      .replace('bg-white text-on-surface shadow-sm', 'text-on-surface-variant hover:text-on-surface'));
    b.className = b.className.replace('text-on-surface-variant hover:text-on-surface', 'bg-white text-on-surface shadow-sm');
    fire();
  });
  return { read, fire };
}

/* -------------------------------------------------------- patient banner */

/** High-context clinical header: identity, allergies, payer, dues. */
export function patientBanner(p, { extra = '', actions = '', clinicalRestricted = false } = {}) {
  if (!p) return '';
  const allergies = p.allergies || [];
  return `<div class="card p-4">
    <div class="flex flex-wrap items-start gap-4">
      <div class="w-12 h-12 rounded-full bg-primary text-white grid place-items-center font-headline-md shrink-0">
        ${esc((p.name || '?').slice(0, 1).toUpperCase())}</div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-headline-md text-headline-md">${esc(p.title ? p.title + ' ' : '')}${esc(p.name)}</span>
          ${p.vip ? `<span class="pill-brand">VIP</span>` : ''}
          ${p.temporary === 1 ? `<span class="pill-warning" title="Created at the Emergency desk before the patient was identified">Temporary ER record — identify from the Emergency desk</span>` : ''}
          ${p.blood_group ? `<span class="pill-danger">${esc(p.blood_group)}</span>` : ''}
          ${p.payer_type && p.payer_type !== 'self' ? `<span class="pill-info">${esc(p.payer_name || p.payer_type)}</span>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-body-md text-on-surface-variant">
          <span class="font-data-mono text-on-surface">${esc(p.uhid)}</span>
          <span>${ageText(p)} · ${esc(p.gender || '')}</span>
          ${p.mobile ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">call</span>${esc(p.mobile)}</span>` : ''}
          ${p.visits !== undefined ? `<span>${p.visits} visit(s)</span>` : ''}
          ${p.outstanding > 0 ? `<span class="text-danger font-medium">Outstanding ₹${Number(p.outstanding).toLocaleString('en-IN')}</span>` : ''}
        </div>
      </div>
      ${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ''}
    </div>
    ${clinicalRestricted ? `<p class="mt-3 text-body-md text-on-surface-variant">Clinical details are restricted for your role.</p>` : allergies.length ? `<div class="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-danger-bg border border-danger/25">
      <span class="material-symbols-outlined text-[18px] text-danger">warning</span>
      <div class="text-body-md text-danger"><strong class="uppercase tracking-wide">Allergies</strong> —
        ${allergies.map((a) => `${esc(a.substance)}${a.reaction ? ` (${esc(a.reaction)})` : ''} · ${esc(a.severity)}`).join(' · ')}</div>
    </div>` : `<div class="mt-3 flex items-center gap-2 text-body-md text-on-surface-variant">
      <span class="material-symbols-outlined text-[16px] text-success">check_circle</span>No known allergies recorded</div>`}
    ${extra}
  </div>`;
}

/* ------------------------------------------------------------- selectors */

/* ------------------------------------------------------------ due reminders */

/** Queue a due reminder for a bill; without a gateway, offer WhatsApp with the text ready. */
export async function remindBill(billId) {
  try {
    const m = await api.post(`/bills/${billId}/remind`, {});
    if (m.gateway) { toast('Reminder queued — the SMS gateway sends it within a minute', 'success'); return; }
    const url = `https://wa.me/${encodeURIComponent(m.wa_number || '')}?text=${encodeURIComponent(m.body)}`;
    toast('Reminder ready. No SMS gateway is set, so send it through WhatsApp.', 'info', { title: 'Due reminder', timeout: 12000,
      action: { label: 'Open WhatsApp', run: () => { window.open(url, '_blank', 'noopener'); api.post(`/messages/${m.id}/sent`, { via: 'whatsapp' }).catch(() => {}); } } });
  } catch (e) {
    const code = e?.payload?.error;
    toast(code === 'patient_has_no_mobile' ? 'Add a mobile number to the patient first' : code === 'nothing_outstanding' ? 'Nothing is due on this bill' : 'Reminder not sent', 'warning');
  }
}

/* ------------------------------------------------------ patient payer fields */

const PAYER_CATS = [['self', 'Self pay'], ['credit', 'Credit — pays later'], ['insurance', 'Insurance / TPA'], ['aarogyasri', 'Aarogyasri / govt scheme'], ['corporate', 'Corporate'], ['trust', 'Trust']];
const CAT_OF = { insurance: 'insurance', tpa: 'insurance', aarogyasri: 'aarogyasri', corporate: 'corporate', trust: 'trust' };

/** Payer category, payer from the master, policy / card number. Call wirePayerFields(root) after mounting. */
export function payerFieldsHTML(p = {}) {
  const cat = p.payer_type === 'scheme' ? 'aarogyasri' : p.payer_type || 'self';
  return `<div><label class="field-label">Payer</label><select class="field" name="payer_type" data-payer-cat>
      ${PAYER_CATS.map(([v, l]) => `<option value="${v}" ${v === cat ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div data-payer-extra class="${['self', 'credit'].includes(cat) ? 'hidden' : ''}"><label class="field-label">Payer / TPA</label><select class="field" name="payer_id" data-payer-id data-current="${p.payer_id || ''}">
      <option value="">${esc(p.payer_name || '— choose —')}</option></select></div>
    <div data-payer-extra class="${['self', 'credit'].includes(cat) ? 'hidden' : ''}"><label class="field-label">Policy / card / employee no.</label><input class="field" name="policy_no" value="${esc(p.policy_no || '')}"></div>
    <input type="hidden" name="payer_name" value="${esc(p.payer_name || '')}">`;
}

export async function wirePayerFields(root) {
  const cat = root.querySelector('[data-payer-cat]'), sel = root.querySelector('[data-payer-id]');
  if (!cat || !sel) return;
  let list = state.meta?.payers || [];
  try { list = await api.get('/payers'); } catch { /* role without payer access: use the list loaded at sign-in */ }
  const cur = sel.dataset.current;
  const fill = () => {
    const c = cat.value;
    sel.innerHTML = `<option value="">— choose —</option>${list.filter((x) => c === 'self' || CAT_OF[x.payer_type] === c)
      .map((x) => `<option value="${x.id}" ${String(x.id) === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
    root.querySelectorAll('[data-payer-extra]').forEach((el) => el.classList.toggle('hidden', c === 'self' || c === 'credit'));
  };
  fill();
  cat.addEventListener('change', fill);
  sel.addEventListener('change', () => {
    const x = list.find((y) => String(y.id) === sel.value);
    const nameInput = root.querySelector('input[name="payer_name"]');
    if (nameInput) nameInput.value = x?.name || '';
  });
}

export function doctorOptions(includeAll = true, label = 'All doctors') {
  const list = (state.meta?.doctors || []).filter((d) => d.role === 'doctor');
  return (includeAll ? [{ value: '', label }] : []).concat(
    list.map((d) => ({ value: d.id, label: `${d.name} — ${d.dept_name || ''}` })));
}

export function deptOptions(includeAll = true, { clinical = false } = {}) {
  return (includeAll ? [{ value: '', label: 'All departments' }] : []).concat(
    (state.meta?.departments || []).filter((d) => !clinical || d.kind === 'clinical').map((d) => ({ value: d.id, label: d.name })));
}

export function counterOptions(includeAll = true) {
  return (includeAll ? [{ value: '', label: 'All counters' }] : []).concat(
    (state.meta?.counters || []).map((c) => ({ value: c.id, label: c.name })));
}

export const optionList = (arr) => arr.map((v) => (typeof v === 'string' ? { value: v, label: v } : v));

/** Type-ahead patient picker. Calls `onPick(patient)`. */
export function patientPicker(container, onPick, { placeholder = 'Search UHID, name or mobile…', autofocus = false } = {}) {
  const node = typeof container === 'string' ? $(container) : container;
  node.innerHTML = `
    <div class="relative">
      <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-on-surface-variant pointer-events-none">person_search</span>
      <input class="field !pl-9" data-pp-input placeholder="${esc(placeholder)}" autocomplete="off">
      <div class="hidden absolute left-0 right-0 top-11 z-30 card shadow-md max-h-72 overflow-y-auto" data-pp-list></div>
    </div>`;
  const input = node.querySelector('[data-pp-input]');
  const list = node.querySelector('[data-pp-list]');
  const search = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { list.classList.add('hidden'); return; }
    const { rows } = await api.get(`/patients${qs({ q, limit: 10 })}`);
    list.innerHTML = rows.length ? rows.map((p) => `
      <button type="button" class="w-full text-left px-3 py-2 hover:bg-surface-container-low border-b border-outline-variant/60 last:border-0" data-id="${p.id}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-label-lg text-label-lg truncate">${esc(p.name)}</span>
          <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(p.uhid)}</span>
        </div>
        <div class="text-body-sm text-on-surface-variant">${p.age_years ?? '—'}y · ${esc(p.gender)} · ${esc(p.mobile || 'no mobile')}
          ${p.outstanding > 0 ? ` · <span class="text-danger">due ₹${p.outstanding}</span>` : ''}</div>
      </button>`).join('')
      : `<div class="px-3 py-3 text-body-md text-on-surface-variant">No patient matches “${esc(q)}”.</div>`;
    list.classList.remove('hidden');
  }, 240);
  input.addEventListener('input', search);
  input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 180));
  input.addEventListener('focus', () => { if (list.innerHTML) list.classList.remove('hidden'); });
  list.addEventListener('mousedown', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const p = await api.get(`/patients/${b.dataset.id}`);
    input.value = `${p.name} — ${p.uhid}`;
    list.classList.add('hidden');
    onPick(p);
  });
  if (autofocus) setTimeout(() => input.focus(), 40);
  return { input, clear: () => { input.value = ''; list.innerHTML = ''; } };
}

/* -------------------------------------------------------------- plumbing */

/**
 * Wire a view: subscribe to topics, load once, and reload (debounced) whenever
 * one of `events` arrives. Returns the dispose function the router expects.
 */
export function live({ topics = [], events = [], load, interval = 0 }) {
  const unsubs = [];
  let disposed = false;
  let loading = false;
  let pending = null;
  const refresh = async (context) => {
    if (disposed) return;
    if (loading) { pending = context; return; }
    loading = true;
    try { await loadMeta(); if (!disposed) await load(context); }
    catch (e) { if (!disposed) apiError(e, 'Could not refresh this screen'); }
    finally {
      loading = false;
      if (pending && !disposed) { const next = pending; pending = null; refresh(next); }
    }
  };
  // Every audited mutation can affect another section's totals or linked status.
  const watchedTopics = [...new Set([...topics, 'audit', 'admin', 'system'])];
  unsubs.push(subscribe(watchedTopics));
  const reload = debounce(() => { refresh({ live: true }); }, 350);
  unsubs.push(on('*', (_data, message) => {
    if (['tick', 'presence', 'notify'].includes(message?.event) && !events.includes(message?.event)) return;
    if (events.includes(message?.event) || message?.topics?.some(topic => watchedTopics.includes(topic))) reload();
  }));
  unsubs.push(on('realtime.connected', reload));
  // Catch missed events and suspended browser tabs without replacing clinical drafts.
  const resume = () => { if (document.visibilityState !== 'hidden') reload(); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  unsubs.push(() => document.removeEventListener('visibilitychange', resume), () => window.removeEventListener('focus', resume));
  const t = setInterval(() => {
    if (document.visibilityState !== 'hidden') refresh({ live: true, tick: true });
  }, Math.min(interval || 30000, 30000));
  unsubs.push(() => clearInterval(t));
  refresh({ first: true });
  return () => { disposed = true; reload.cancel(); unsubs.forEach((u) => { try { u(); } catch {} }); };
}

/** Read the current view's query string as an object. */
export const queryOf = (ctx) => ctx?.query || {};

/** Replace the view root with freshly rendered HTML. */
export function mountPage(ctx, html) {
  const root = ctx.host.querySelector('.view-root') || ctx.host;
  root.innerHTML = html;
  root.classList.add('fade-in');
  return root;
}

/** Numeric input value or fallback. */
export const val = (root, sel, d = '') => root.querySelector(sel)?.value ?? d;

export function busy(btn, on = true, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>${label ? ` ${esc(label)}` : ''}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/** Standard error → toast translation with the field hints the API returns. */
export function apiError(e, fallback = 'Could not complete that') {
  const map = {
    call_blocked: 'Cannot call this patient in yet',
    payment_pending: 'Payment has not been collected for this order',
    financial_clearance_pending: 'Financial clearance is pending',
    amendment_reason_required: 'A signed note needs an amendment reason',
    free_visit_needs_approval: 'A free visit needs administrator approval',
    insufficient_stock: 'Not enough stock for that quantity',
    bed_occupied: 'That bed is already occupied',
    forbidden: 'Your role does not allow that action',
    day_closed: 'That day is closed — only an administrator can change it, with a reason',
    consent_required: 'Informed consent is not signed — open the checklist and record it before the patient goes into theatre',
    books_closed_today: "Today's books are already closed — ask Accounts to reopen the day before collecting or refunding",
    variance_needs_explanation: 'Explain the difference in the remark',
    closer_cannot_approve_own_variance: 'Another person must approve your own close',
    reason_required: 'A reason is required',
    unit_outside_department: "Choose a unit from this person's own department",
    past_or_today_only: 'Attendance can be marked for today or earlier days only',
    has_punches_cannot_clear: 'This day has punch times — change the status instead of clearing it',
    punch_own_attendance_only: 'You can punch only your own attendance',
    staff_outside_department: 'That staff member is not in your team',
    admit_through_admission: 'Use Admit to choose a ward or ICU bed',
    register_patient_first: 'Link the patient to a UHID first',
    bill_has_collections_use_credit_note: 'Money is already paid on this bill — reception must waive or refund instead',
    case_already_closed: 'This case is already closed',
  };
  const key = e?.payload?.error || e?.message;
  const detail = e?.payload?.reasons?.join(' · ') || e?.payload?.balance !== undefined
    ? (e.payload.reasons ? e.payload.reasons.join(' · ') : `Balance ₹${e.payload.balance}`)
    : (e?.payload?.fields ? e.payload.fields.join(', ') : '');
  const need = e?.payload?.need ? `Needs permission: ${e.payload.need}` : '';
  toast(detail || (e?.payload?.detail ?? '') || need, 'warning', { title: map[key] || plainError(key) || fallback });
}

const ABBR = { ip: 'IP', op: 'OP', er: 'ER', icu: 'ICU', ot: 'OT', uhid: 'UHID', grn: 'GRN', upi: 'UPI', gst: 'GST', id: 'ID', tpa: 'TPA', usg: 'USG', mar: 'MAR' };
/** A server code the map does not cover, as a sentence ("amount_exceeds_balance" → "Amount exceeds balance"). */
function plainError(key) {
  if (!key || !/^[a-z][a-z0-9_]*$/.test(key)) return '';
  const words = key.split('_').map((w) => ABBR[w] || w);
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
