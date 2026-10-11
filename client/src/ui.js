/** Shared UI toolkit: formatting, DOM helpers, toasts, modals, drawers, tables. */

/* ------------------------------------------------------------ formatting */

export const money = (n, dp = 0) => {
  const v = Number(n || 0);
  return `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};

export const moneyPlain = (n, dp = 2) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const compactMoney = (n) => {
  const v = Number(n || 0), a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return money(v);
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parse = (v) => (v instanceof Date ? v : new Date(String(v).replace(' ', 'T')));

export const fmtDate = (v) => { if (!v) return '—'; const d = parse(v); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDay = (v) => { if (!v) return '—'; const d = parse(v); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`; };
export const fmtTime = (v) => { if (!v) return '—'; const d = parse(v); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`; };
export const fmtDateTime = (v) => (v ? `${fmtDate(v)}, ${fmtTime(v)}` : '—');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const shiftDate = (iso, days) => { const d = new Date(iso); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function ago(v) {
  if (!v) return '—';
  const s = Math.max(0, (Date.now() - parse(v).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function mins(v) {
  if (v === null || v === undefined) return '—';
  const m = Math.max(0, Math.round(v));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const initials = (name) => (name || '?').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/**
 * Random id. `crypto.randomUUID` only exists on https or localhost; hospital
 * stations open the app over plain http on the LAN, so this uses
 * getRandomValues, which is available everywhere.
 */
export function uid(bytes = 16) {
  const a = new Uint8Array(bytes);
  (globalThis.crypto || window.msCrypto).getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ageSex = (p) =>
  `${p?.age_years ?? '—'}${p?.age_years !== null && p?.age_years !== undefined ? 'y' : ''} · ${(p?.gender || '—')[0]}`;

/* -------------------------------------------------------------- statuses */

const STATUS = {
  // encounter stage
  registered:        ['info', 'Registered', 'how_to_reg'],
  vitals_pending:    ['warning', 'Vitals pending', 'monitor_heart'],
  vitals_done:       ['info', 'Vitals done', 'check_circle'],
  ready:             ['info', 'Ready for doctor', 'hourglass_top'],
  in_consult:        ['brand', 'In consultation', 'stethoscope'],
  consulted:         ['success', 'Consulted', 'task_alt'],
  services_pending:  ['warning', 'Services pending', 'pending_actions'],
  closed:            ['neutral', 'Closed', 'done_all'],
  cancelled:         ['neutral', 'Cancelled', 'cancel'],
  // payment
  pending:           ['warning', 'Payment pending', 'schedule'],
  paid:              ['success', 'Paid', 'verified'],
  partial:           ['warning', 'Part paid', 'incomplete_circle'],
  free:              ['info', 'Approved free', 'volunteer_activism'],
  waived:            ['info', 'Waived', 'volunteer_activism'],
  unpaid:            ['danger', 'Unpaid', 'error'],
  refunded:          ['neutral', 'Refunded', 'undo'],
  draft:             ['neutral', 'Draft', 'edit_note'],
  // orders / lab / imaging
  ordered:           ['info', 'Ordered', 'assignment'],
  awaiting_payment:  ['warning', 'Awaiting payment', 'payments'],
  scheduled:         ['info', 'Scheduled', 'event'],
  collected:         ['info', 'Sample collected', 'science'],
  in_progress:       ['info', 'In progress', 'progress_activity'],
  reported:          ['warning', 'Reported — unverified', 'description'],
  verified:          ['success', 'Verified', 'verified'],
  dispensed:         ['success', 'Dispensed', 'medication'],
  final:             ['success', 'Final', 'verified'],
  amended:           ['warning', 'Amended', 'edit'],
  signed:            ['success', 'Signed', 'draw'],
  // ipd
  admitted:          ['success', 'Admitted', 'hotel'],
  discharge_initiated: ['warning', 'Discharge started', 'logout'],
  clinically_cleared: ['info', 'Clinically cleared', 'medical_information'],
  financially_cleared: ['info', 'Financially cleared', 'account_balance'],
  discharged:        ['neutral', 'Discharged', 'done_all'],
  occupied:          ['danger', 'Occupied', 'bed'],
  vacant:            ['success', 'Vacant', 'check'],
  reserved:          ['warning', 'Reserved', 'bookmark'],
  cleaning:          ['info', 'Cleaning', 'cleaning_services'],
  blocked:           ['neutral', 'Blocked', 'block'],
  // emergency / ot / maternity
  triage:            ['warning', 'Triage', 'emergency'],
  in_treatment:      ['info', 'In treatment', 'medical_services'],
  observation:       ['info', 'Observation', 'visibility'],
  awaiting_admission: ['warning', 'Awaiting admission', 'hotel'],
  referred:          ['neutral', 'Referred out', 'forward'],
  lama:              ['neutral', 'LAMA', 'exit_to_app'],
  death:             ['neutral', 'Death', 'sentiment_very_dissatisfied'],
  booked:            ['info', 'Booked', 'event'],
  pre_op:            ['warning', 'Pre-op', 'checklist'],
  in_theatre:        ['brand', 'In theatre', 'surgical'],
  recovery:          ['info', 'Recovery', 'airline_seat_flat'],
  completed:         ['success', 'Completed', 'task_alt'],
  antenatal:         ['info', 'Antenatal', 'pregnant_woman'],
  latent:            ['info', 'Latent phase', 'timelapse'],
  active_labour:     ['warning', 'Active labour', 'timer'],
  second_stage:      ['danger', 'Second stage', 'priority_high'],
  delivered:         ['success', 'Delivered', 'child_care'],
  postnatal:         ['success', 'Postnatal', 'child_friendly'],
  // claims / quality / sync / misc
  preauth_pending:   ['warning', 'Preauth pending', 'schedule'],
  preauth_approved:  ['info', 'Preauth approved', 'check_circle'],
  query:             ['danger', 'Query raised', 'help'],
  claim_submitted:   ['info', 'Claim submitted', 'send'],
  settled:           ['success', 'Settled', 'paid'],
  rejected:          ['danger', 'Rejected', 'cancel'],
  open:              ['warning', 'Open', 'radio_button_unchecked'],
  investigating:     ['info', 'Investigating', 'search'],
  capa:              ['info', 'CAPA', 'build'],
  queued:            ['warning', 'Queued', 'schedule'],
  sending:           ['info', 'Sending', 'sync'],
  synced:            ['success', 'Synced', 'cloud_done'],
  failed:            ['danger', 'Failed', 'cloud_off'],
  active:            ['info', 'Active', 'pending'],
  approved:          ['success', 'Approved', 'check'],
  received:          ['success', 'Received', 'inventory'],
  no_show:           ['neutral', 'No show', 'person_off'],
  confirmed:         ['info', 'Confirmed', 'event_available'],
  arrived:           ['warning', 'Arrived', 'login'],
  converted:         ['success', 'Registered', 'how_to_reg'],
};

export function statusInfo(key) {
  const s = STATUS[key] || ['neutral', titleCase(key), 'circle'];
  return { tone: s[0], label: s[1], icon: s[2] };
}

/** Colour is never the only signal — every pill carries its word. */
export function pill(key, overrideLabel) {
  const { tone, label } = statusInfo(key);
  return `<span class="pill-${tone} pill-dot">${esc(overrideLabel || label)}</span>`;
}

/* ------------------------------------------------------------ payer status */

export const PAYER_NAME = { insurance: 'Insurance', aarogyasri: 'Aarogyasri', scheme: 'Aarogyasri', corporate: 'Corporate', trust: 'Trust' };
export const CASE_TEXT = { preauth_pending: 'approval pending', preauth_approved: 'approved', query: 'query raised', admitted: 'in progress',
  claim_submitted: 'claim submitted', settled: 'settled', rejected: 'rejected' };
export const isPayer = (t) => !!PAYER_NAME[t];

/** "Insurance · approval pending" — payer bills show the payer and its case stage everywhere. */
export function payerPill(payerType, claimStatus, sub = '') {
  const tone = claimStatus === 'rejected' ? 'danger' : ['preauth_approved', 'claim_submitted', 'settled'].includes(claimStatus) ? 'success' : 'info';
  return `<span class="pill-${tone} pill-dot">${esc(PAYER_NAME[payerType] || payerType)}${claimStatus ? ` · ${esc(CASE_TEXT[claimStatus] || claimStatus)}` : ''}</span>${sub ? `<div class="text-label-sm text-on-surface-variant mt-0.5">${esc(sub)}</div>` : ''}`;
}

/** A bill's status: a payer bill still owed shows its payer case instead of a bare "Unpaid". */
export function billStatus(b) {
  if (!b) return '';
  if(b.financial_status==='patient_cleared_payer_pending')return '<span class="pill-info">Patient dues cleared</span><div class="text-label-sm">Payer settlement pending</div>';
  if(b.financial_status==='fully_settled'&&isPayer(b.payer_type))return '<span class="pill-success">Fully settled</span>';
  // credit: the patient pays later — an approved due, not a payer
  if (b.payer_type === 'credit' && !['cancelled', 'paid'].includes(b.status) && (b.balance ?? 1) > 0.005) {
    return `<span class="pill-warning pill-dot">Credit · pay later</span><div class="text-label-sm text-on-surface-variant mt-0.5">${b.status === 'partial' ? 'part paid · ' : ''}due from patient</div>`;
  }
  if (isPayer(b.payer_type) && !['cancelled', 'paid'].includes(b.status) && (b.balance ?? 1) > 0.005) {
    return payerPill(b.payer_type, b.claim_status, b.status === 'partial' ? 'part paid' : 'not yet received');
  }
  // a running IP bill with a deposit larger than today's charges is holding an advance, not "paid"
  if (b.bill_type === 'IP' && (b.balance ?? 0) < -0.005 && b.status !== 'cancelled') return `<span class="pill-info">Advance held</span><div class="text-label-sm text-on-surface-variant mt-0.5">${money(-b.balance)} unused</div>`;
  return pill(b.status);
}

/** Why a lab / imaging order may (or may not) proceed. Pass the row to show a payer patient's case. */
export function clearancePill(c, row = null) {
  const payer = row && isPayer(row.financial_category || row.bill_payer) ? (row.financial_category || row.bill_payer) : null;
  if (c === 'payer_approved') return payerPill(payer || 'insurance', row?.claim_status, 'approved — released to the lab');
  if (payer && ['unpaid', 'part_paid'].includes(c)) return payerPill(payer, row.claim_status, 'blocked until the case is approved or reception authorises');
  const m = { paid: ['success', 'Paid'], covered: ['info', 'Payer / free'], due_approved: ['info', 'Due approved'], emergency: ['info', 'Emergency'],
    ip_bill: ['neutral', 'On IP bill'], part_paid: ['warning', 'Part paid — blocked'], unpaid: ['danger', 'Not paid — blocked'] };
  const [tone, label] = m[c] || ['neutral', 'Not billed'];
  return `<span class="pill-${tone} pill-dot">${label}</span>`;
}

export function priorityPill(p) {
  if (p === 'stat') return `<span class="pill-danger pill-dot">STAT</span>`;
  if (p === 'urgent') return `<span class="pill-warning pill-dot">Urgent</span>`;
  if (p === 'emergency') return `<span class="pill-danger pill-dot">Emergency</span>`;
  return `<span class="pill-neutral">Routine</span>`;
}

export function triagePill(t) {
  const m = { 1: ['danger', 'P1 Resuscitation'], 2: ['danger', 'P2 Emergent'], 3: ['warning', 'P3 Urgent'], 4: ['info', 'P4 Less urgent'], 5: ['neutral', 'P5 Non-urgent'] };
  const [tone, label] = m[t] || ['neutral', `P${t}`];
  return `<span class="pill-${tone} pill-dot">${label}</span>`;
}

export function flagPill(flag) {
  if (!flag) return '';
  const m = { critical: ['danger', 'Critical'], high: ['warning', 'High'], low: ['info', 'Low'] };
  const [tone, label] = m[flag] || ['neutral', flag];
  return `<span class="pill-${tone} pill-dot">${label}</span>`;
}

/* ------------------------------------------------------------- DOM utils */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function setHTML(target, html) {
  const node = typeof target === 'string' ? $(target) : target;
  if (node) node.innerHTML = html;
  return node;
}

/** Delegated listener: `bind(root,'click','[data-act]',fn)`. */
export function bind(root, type, sel, fn) {
  const node = typeof root === 'string' ? $(root) : root;
  if (!node) return () => {};
  const handler = (ev) => {
    const hit = ev.target.closest(sel);
      if (hit && node.contains(hit)) {
        const report = (err) => {
          console.error('[action]', err);
          toast(err?.payload?.detail || err?.message || 'Please try again.', 'danger', { title: 'Action could not be completed' });
        };
        try { Promise.resolve(fn(ev, hit)).catch(report); } catch (err) { report(err); }
      }
  };
  node.addEventListener(type, handler);
  return () => node.removeEventListener(type, handler);
}

export function debounce(fn, ms = 250) {
  let t;
  const run = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  run.cancel = () => clearTimeout(t);
  return run;
}

/* ---------------------------------------------------------------- toasts */

export function toast(message, tone = 'info', { title = '', timeout = 4200, action } = {}) {
  const tones = {
    success: ['bg-success-bg border-success/30 text-success', 'check_circle'],
    warning: ['bg-warning-bg border-warning/30 text-warning', 'warning'],
    danger:  ['bg-danger-bg border-danger/30 text-danger', 'error'],
    info:    ['bg-white border-outline-variant text-on-surface', 'info'],
  };
  const [cls, icon] = tones[tone] || tones.info;
  const node = el(`
    <div class="pointer-events-auto flex items-start gap-2.5 max-w-sm p-3 rounded-lg border shadow-md fade-in ${cls}">
      <span class="material-symbols-outlined text-[18px] mt-px shrink-0">${icon}</span>
      <div class="min-w-0 flex-1">
        ${title ? `<div class="font-label-lg text-label-lg">${esc(title)}</div>` : ''}
        <div class="text-body-md ${title ? 'opacity-90 mt-0.5' : ''}">${esc(message)}</div>
        ${action ? `<button class="mt-1.5 font-label-md text-label-md underline underline-offset-2" data-toast-action>${esc(action.label)}</button>` : ''}
      </div>
      <button class="shrink-0 opacity-50 hover:opacity-100" data-toast-close aria-label="Dismiss">
        <span class="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>`);
  const close = () => { node.style.opacity = '0'; setTimeout(() => node.remove(), 160); };
  node.querySelector('[data-toast-close]').onclick = close;
  const act = node.querySelector('[data-toast-action]');
  if (act) act.onclick = () => { action.run(); close(); };
  $('#toasts').append(node);
  if (timeout) setTimeout(close, timeout);
  return close;
}

/* ---------------------------------------------------------------- modals */

export function modal({ title, subtitle, body, footer, size = 'md', onMount, dismissable = true, stack = false }) {
  const root = $('#modal-root');
  const previous = stack ? [...root.childNodes] : [];
  const previousToken = root.dataset.modalToken;
  const token = uid(); root.dataset.modalToken = token;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-[92vw]' };
  root.innerHTML = `
    <div class="absolute inset-0 bg-[#172B4D]/45" data-close></div>
    <div class="absolute inset-0 grid grid-cols-[minmax(0,1fr)] place-items-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-labelledby="modal-title-${token}" class="pointer-events-auto w-full ${widths[size]} max-h-[92vh] flex flex-col bg-white rounded-xl border border-outline-variant shadow-lg fade-in">
        <div class="flex items-start justify-between gap-4 px-5 py-4 border-b border-outline-variant shrink-0">
          <div class="min-w-0">
              <h2 id="modal-title-${token}" class="font-headline-md text-headline-md text-on-surface">${esc(title || '')}</h2>
            ${subtitle ? `<p class="text-body-md text-on-surface-variant mt-0.5">${subtitle}</p>` : ''}
          </div>
          <button class="btn-ghost !h-8 !w-8 !px-0" data-close aria-label="Close">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-4" data-modal-body>${body || ''}</div>
        ${footer ? `<div class="shrink-0 flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-outline-variant bg-surface-container-low rounded-b-xl">${footer}</div>` : ''}
      </div>
    </div>`;
  root.classList.remove('hidden');
  const close = () => { if(root.dataset.modalToken !== token)return; root.replaceChildren(...previous); root.classList.toggle('hidden', !previous.length); root.dataset.modalToken = previousToken || ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable && root.dataset.modalToken === token) close(); };
  document.addEventListener('keydown', onKey);
  if (dismissable) $$('[data-close]', root).forEach((b) => (b.onclick = close));
  const first = root.querySelector('input:not([type=hidden]),select,textarea');
  if (first) setTimeout(() => first.focus(), 30);
  onMount?.(root, close);
  return close;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'primary', requireReason = false, reasonLabel = 'Reason' }) {
  return new Promise((resolve) => {
    // stacked: a confirmation asked from inside a window returns to that window, form and all
    const close = modal({
      title, size: 'sm', stack: true,
      body: `<p class="text-body-lg text-on-surface-variant">${message}</p>
        ${requireReason ? `<div class="mt-3"><label class="field-label">${esc(reasonLabel)} <span class="text-danger">*</span></label>
          <textarea class="field" rows="3" data-reason placeholder="This is recorded in the audit trail"></textarea></div>` : ''}`,
      footer: `<button class="btn-secondary" data-cancel>Cancel</button>
               <button class="${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount(root, done) {
        root.querySelector('[data-cancel]').onclick = () => { done(); resolve(null); };
        root.querySelector('[data-ok]').onclick = () => {
          const reason = root.querySelector('[data-reason]')?.value.trim() || '';
          if (requireReason && !reason) { toast('A reason is required', 'warning'); return; }
          done(); resolve({ ok: true, reason });
        };
      },
    });
    $('#modal-root').querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(null)));
  });
}

/* --------------------------------------------------------------- drawers */

export function drawer({ title, subtitle, body, footer, width = 'max-w-xl', onMount }) {
  const root = $('#drawer-root');
  root.innerHTML = `
    <div class="absolute inset-0 bg-[#172B4D]/35" data-close></div>
    <aside class="absolute right-0 top-0 bottom-0 w-full ${width} bg-white border-l border-outline-variant shadow-lg flex flex-col fade-in">
      <div class="flex items-start justify-between gap-3 px-5 py-4 border-b border-outline-variant shrink-0">
        <div class="min-w-0">
          <h2 class="font-headline-md text-headline-md truncate">${esc(title || '')}</h2>
          ${subtitle ? `<p class="text-body-md text-on-surface-variant mt-0.5">${subtitle}</p>` : ''}
        </div>
        <button class="btn-ghost !h-8 !w-8 !px-0" data-close aria-label="Close">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto" data-drawer-body>${body || ''}</div>
      ${footer ? `<div class="shrink-0 flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-outline-variant bg-surface-container-low">${footer}</div>` : ''}
    </aside>`;
  root.classList.remove('hidden');
  const close = () => { root.classList.add('hidden'); root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $$('[data-close]', root).forEach((b) => (b.onclick = close));
  onMount?.(root, close);
  return close;
}

/* ---------------------------------------------------------------- tables */

/**
 * Render rows into a <tbody>, preserving scroll and briefly flashing rows whose
 * content changed — that is what makes a realtime board readable.
 */
export function renderRows(tbody, rows, rowHTML, { key = 'id', empty = 'Nothing to show' } = {}) {
  const node = typeof tbody === 'string' ? $(tbody) : tbody;
  if (!node) return;
  if (!rows.length) {
    const cols = node.closest('table')?.querySelectorAll('thead th').length || 1;
    node.innerHTML = `<tr><td colspan="${cols}" class="px-3 py-10 text-center text-on-surface-variant text-body-lg">
      <span class="material-symbols-outlined text-[28px] opacity-40 block mb-1">inbox</span>${esc(empty)}</td></tr>`;
    return;
  }
  const prev = new Map([...node.children].map((tr) => [tr.dataset.k, tr.dataset.sig]));
  const html = rows.map((r) => {
    const k = String(r[key]);
    const inner = rowHTML(r);
    const sig = hash(inner);
    const changed = prev.has(k) && prev.get(k) !== sig;
    return `<tr data-k="${esc(k)}" data-sig="${sig}" data-id="${esc(k)}" class="${changed ? 'row-flash' : ''}">${inner}</tr>`;
  }).join('');
  node.innerHTML = html;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return String(h);
}

/* ------------------------------------------------------------------ misc */

/**
 * Out-of-range vital signs, as short labels ("SpO₂ 90%"). `critical` marks values that need the doctor now.
 * One rule for the vitals form, the doctor's queue and the ward.
 */
export function vitalAlerts(v) {
  if (!v) return [];
  const n = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
  const out = [];
  const add = (label, critical) => out.push({ label, critical: !!critical });
  const sys = n(v.bp_sys), dia = n(v.bp_dia), pulse = n(v.pulse), spo2 = n(v.spo2), temp = n(v.temp_f), grbs = n(v.grbs), rr = n(v.resp_rate), pain = n(v.pain_score);
  if (sys !== null && (sys >= 140 || sys < 90)) add(`BP ${sys}/${dia ?? '—'}`, sys >= 180 || sys < 80);
  else if (dia !== null && (dia >= 90 || dia < 60)) add(`BP ${sys ?? '—'}/${dia}`, dia >= 120);
  if (pulse !== null && (pulse > 100 || pulse < 50)) add(`Pulse ${pulse}`, pulse > 130 || pulse < 40);
  if (spo2 !== null && spo2 < 94) add(`SpO₂ ${spo2}%`, spo2 < 90);
  if (temp !== null && (temp > 100.4 || temp < 96)) add(`Temp ${temp}°F`, temp >= 104 || temp < 95);
  if (grbs !== null && (grbs > 180 || grbs < 70)) add(`GRBS ${grbs}`, grbs > 400 || grbs < 54);
  if (rr !== null && (rr > 22 || rr < 10)) add(`RR ${rr}/min`, rr > 30 || rr < 8);
  if (pain !== null && pain >= 7) add(`Pain ${pain}/10`, false);
  return out;
}

/** Payment mode for display: "debit_card" → "Debit card", "upi" → "UPI". */
const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', debit_card: 'Debit card', credit_card: 'Credit card', cheque: 'Cheque',
  bank_transfer: 'Bank transfer', neft: 'NEFT', rtgs: 'RTGS', advance: 'Advance', refund: 'Refund', free: 'Free', due: 'Due' };
export const modeLabel = (m) => MODE_LABEL[m] || String(m || '—').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Age for display: "52y", and months for infants ("1y 3m", "4m"). */
export function ageText(p) {
  if (!p) return '—';
  const y = p.age_years, m = p.age_months;
  if ((y === null || y === undefined) && !m) return '—';
  if ((y || 0) < 2 && m) return y ? `${y}y ${m}m` : `${m}m`;
  return `${y ?? 0}y`;
}

export function kpi({ label, value, sub, icon, tone = 'neutral', trend, onClick }) {
  const tones = { neutral: 'text-primary bg-primary-fixed', success: 'text-success bg-success-bg', warning: 'text-warning bg-warning-bg', danger: 'text-danger bg-danger-bg', info: 'text-info bg-info-bg' };
  const borderAccent = { neutral: '#881D2C', success: '#166534', warning: '#92400E', danger: '#B91C1C', info: '#1E40AF' };
  return `<div class="card ${onClick ? 'card-hover cursor-pointer' : ''} p-4 flex flex-col justify-between min-h-[104px]" style="border-left: 3px solid ${borderAccent[tone] || borderAccent.neutral}20" ${onClick ? `onclick="${onClick}"` : ''}>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">${esc(label)}</div>
        <div class="font-display-lg text-display-lg text-on-surface mt-1 tnum">${value}</div>
      </div>
      ${icon ? `<div class="w-9 h-9 rounded-lg grid place-items-center shrink-0 ${tones[tone]} shadow-sm">
        <span class="material-symbols-outlined text-[20px]">${icon}</span></div>` : ''}
    </div>
    ${sub || trend !== undefined ? `<div class="flex items-center justify-between mt-2.5 pt-2 border-t border-outline-variant/70">
      <span class="text-body-sm text-on-surface-variant">${sub || ''}</span>
      ${trend !== undefined ? `<span class="font-data-mono text-body-sm ${trend >= 0 ? 'text-success' : 'text-danger'}">
        ${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}%</span>` : ''}
    </div>` : ''}
  </div>`;
}

export function emptyState(icon, title, sub, actionHTML = '') {
  return `<div class="grid place-items-center py-16 text-center">
    <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mb-3">
      <span class="material-symbols-outlined text-[32px] text-on-surface-variant/50">${icon}</span>
    </div>
    <div class="font-title-md text-title-md">${esc(title)}</div>
    ${sub ? `<div class="text-body-lg text-on-surface-variant mt-1 max-w-md">${esc(sub)}</div>` : ''}
    ${actionHTML ? `<div class="mt-4">${actionHTML}</div>` : ''}
  </div>`;
}

export function spinner(label = 'Loading') {
  return `<div class="flex items-center justify-center gap-2.5 py-16 text-on-surface-variant">
    <span class="material-symbols-outlined animate-spin text-[22px] text-primary/60">progress_activity</span>
    <span class="text-body-lg">${esc(label)}…</span></div>`;
}

/** Simple inline sparkline / bar chart — no chart library on a hospital LAN. */
export function sparkline(values, { width = 160, height = 36, stroke = '#881D2C', fill = 'rgba(136,29,44,.10)' } = {}) {
  const v = values.filter((n) => typeof n === 'number' && !isNaN(n));
  if (v.length < 2) return `<svg width="${width}" height="${height}"></svg>`;
  const max = Math.max(...v), min = Math.min(...v);
  const span = max - min || 1;
  const pts = v.map((n, i) => [(i / (v.length - 1)) * width, height - 3 - ((n - min) / span) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="overflow-visible">
    <path d="${d} L${width},${height} L0,${height} Z" fill="${fill}" stroke="none"/>
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

export function barChart(rows, { labelKey = 'label', valueKey = 'value', height = 160, format = compactMoney } = {}) {
  if (!rows.length) return emptyState('bar_chart', 'No data for this period', '');
  const max = Math.max(...rows.map(r => +r[valueKey] || 0)) || 1;
  const plotHeight = Math.max(80, height - 50);
  return '<div style="overflow-x:auto;padding:8px 0" role="figure" aria-label="Bar chart"><div style="display:flex;align-items:flex-end;gap:8px;min-width:' + (rows.length*56) + 'px;height:' + height + 'px">' + rows.map(r=>{
    const v=+r[valueKey]||0;
    return '<div tabindex="0" style="flex:1;min-width:48px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%" title="'+esc(r[labelKey])+': '+esc(format(v))+'"><span style="font-size:10px;white-space:nowrap">'+esc(format(v))+'</span><div style="width:75%;max-width:56px;flex:none;background:#9c3b49;border-radius:4px 4px 0 0;height:'+Math.max(v?2:0,v/max*plotHeight)+'px"></div><span style="font-size:10px;line-height:14px;height:28px;text-align:center;overflow:hidden;max-width:68px;margin-top:5px">'+esc(r[labelKey])+'</span></div>';
  }).join('')+'</div></div>';
}

export function donut(segments, { size = 132, thickness = 16 } = {}) {
  const total = segments.reduce((s, x) => s + (+x.value || 0), 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s) => {
    const frac = (+s.value || 0) / total;
    const dash = `${(frac * c).toFixed(2)} ${(c - frac * c).toFixed(2)}`;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}"
      stroke-width="${thickness}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * c).toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)}: ${s.value}</title></circle>`;
    offset += frac;
    return el;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF2F7" stroke-width="${thickness}"/>
    ${arcs}</svg>`;
}

/** The hospital's letterhead banner on every printed document (old square logo headers are replaced by it). */
export const PRINT_BANNER = '/assets/mgm-estimation-logo.jpeg';

/** Open a clean print window for a receipt / report / certificate. */
export function printDocument(title, innerHTML, { width = 800 } = {}) {
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="stylesheet" href="/app.css">
    <style>body{background:#fff;padding:24px;font-size:13px}th,td{padding:5px;text-align:left;border-bottom:1px solid #ddd}@page{margin:12mm}</style>
    </head><body>${innerHTML.includes(PRINT_BANNER)?'':`<img src="${PRINT_BANNER}" alt="MGM Hospitals" style="width:100%;max-width:760px;height:auto;margin-bottom:10px">`}${innerHTML.replace(/<img[^>]*mgm-hospital-logo\.png[^>]*>/g,'')}</body></html>`;
  modal({title,subtitle:'Review the document, then print or choose Save as PDF in the print dialog.',size:width>900?'xl':'lg',stack:true,
    body:`<iframe title="${esc(title)}" data-print-preview style="width:100%;height:62vh;border:1px solid #ddd;background:white"></iframe>`,
    footer:'<button class="btn-secondary" data-close>Close preview</button><button class="btn-primary" data-print-document disabled>Print / Save PDF</button>',
    onMount(root){const frame=root.querySelector('[data-print-preview]'),button=root.querySelector('[data-print-document]');frame.onload=()=>{button.disabled=false;};button.onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};frame.srcdoc=html;}});
}

export function downloadCSV(filename, rows) {
  if (!rows.length) { toast('Nothing to export', 'warning'); return; }
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => {
    const v = r[c] ?? '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`${rows.length} rows exported`, 'success');
}
