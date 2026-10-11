/**
 * Patient portal (/my-health) — what a patient sees on their own phone.
 * Signs in with UHID or mobile + the PIN reception gave them, or a one-time SMS code when the hospital has
 * an SMS gateway. The session token lives in sessionStorage only and is sent as X-Portal-Token; it can read
 * nothing but this patient's own final records.
 */
import { esc, money, fmtDate, fmtDateTime } from './ui.js';

const root = document.getElementById('portal-root');
const KEY = 'mgm_portal_token';
const tok = { get: () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } }, set: (v) => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* private mode */ } } };
const ERR = {
  sign_in_failed: 'Those details did not match. Check your UHID or mobile number and PIN.', pin_invalid: 'The PIN is 6 digits.',
  account_locked: 'Too many wrong attempts. Try again in 15 minutes, or ask reception.', too_many_attempts: 'Too many attempts from this device. Wait 15 minutes.',
  identifier_required: 'Enter your UHID or mobile number.', sms_not_configured: 'SMS codes are not available. Use the PIN from reception.',
};

async function call(path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(tok.get() ? { 'X-Portal-Token': tok.get() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.code = data.error; throw e; }
  return data;
}

const shell = (inner) => `<div class="max-w-2xl mx-auto px-4 py-6">
  <header class="flex items-center gap-3 mb-5"><img src="/assets/logo.svg" alt="" class="h-9 w-9 rounded-lg p-1.5" style="background:#39171D">
    <div><div class="text-title-md font-semibold text-on-surface" data-hosp>My Health</div><div class="text-body-sm text-on-surface-variant">Patient portal</div></div></header>${inner}</div>`;

async function signIn() {
  let cfg = { hospital: 'MGM HMS', otp: false };
  try { cfg = await call('/portal/config'); } catch { /* offline */ }
  let mode = 'pin';
  const paint = () => {
    root.innerHTML = shell(`<div class="card p-5">
      <h1 class="text-headline-md font-semibold mb-1">Sign in</h1>
      <p class="text-body-md text-on-surface-variant mb-4">See your reports, prescriptions, bills and discharge summaries from ${esc(cfg.hospital)}.</p>
      ${cfg.otp ? `<div class="flex gap-1 mb-4" role="tablist"><button class="btn-${mode === 'pin' ? 'primary' : 'secondary'} btn-sm" data-mode="pin">PIN</button><button class="btn-${mode === 'otp' ? 'primary' : 'secondary'} btn-sm" data-mode="otp">SMS code</button></div>` : ''}
      <form data-f class="space-y-3" autocomplete="off">
        <div><label class="field-label" for="pid">UHID${mode === 'pin' ? ' or registered mobile number' : ''}</label><input id="pid" class="field" name="identifier" required inputmode="${mode === 'pin' ? 'text' : 'text'}" autocapitalize="characters"></div>
        ${mode === 'pin' ? '<div><label class="field-label" for="ppin">6-digit portal PIN</label><input id="ppin" class="field font-data-mono tracking-widest" name="pin" required inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code"></div>'
          : `<div data-otp-step><button type="button" class="btn-secondary w-full" data-send>Send me a code</button></div>
             <div><label class="field-label" for="pcode">Code from the SMS</label><input id="pcode" class="field font-data-mono tracking-widest" name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code"></div>`}
        <div class="hidden rounded-lg bg-danger-bg text-danger text-body-md p-3" data-err role="alert"></div>
        <button class="btn-primary w-full" data-go>Sign in</button>
      </form>
      <p class="text-body-sm text-on-surface-variant mt-4">No PIN yet? Ask at reception — they will give you one. Never share your PIN or code with anyone, including hospital staff.</p></div>`);
    root.querySelector('[data-hosp]').textContent = cfg.hospital;
    const form = root.querySelector('[data-f]'), err = root.querySelector('[data-err]');
    const show = (e) => { err.textContent = ERR[e.code] || 'Could not sign in. Try again.'; err.classList.remove('hidden'); };
    root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; paint(); }));
    root.querySelector('[data-send]')?.addEventListener('click', async (ev) => {
      if (!form.identifier.value.trim()) { show({ code: 'identifier_required' }); return; }
      ev.currentTarget.disabled = true;
      try { const r = await call('/portal/otp', { identifier: form.identifier.value }); root.querySelector('[data-otp-step]').innerHTML = `<p class="text-body-md text-success">If this UHID has portal access, a code is on its way to the registered mobile. It is valid for ${r.minutes} minutes.</p>`; }
      catch (e) { show(e); ev.currentTarget.disabled = false; }
    });
    form.onsubmit = async (e) => {
      e.preventDefault(); err.classList.add('hidden');
      const go = root.querySelector('[data-go]'); go.disabled = true;
      try {
        const r = mode === 'pin' ? await call('/portal/login', { identifier: form.identifier.value, pin: form.pin.value })
          : await call('/portal/otp/verify', { identifier: form.identifier.value, code: form.code.value });
        tok.set(r.token); home();
      } catch (ex) { show(ex); go.disabled = false; }
    };
  };
  paint();
}

const section = (title, body, count) => `<section class="card p-4 mb-3"><h2 class="text-title-md font-semibold mb-2">${title}${count !== undefined ? ` <span class="text-on-surface-variant font-normal">(${count})</span>` : ''}</h2>${body}</section>`;
const none = (t) => `<p class="text-body-md text-on-surface-variant">${t}</p>`;

async function home() {
  let d;
  try { d = await call('/portal/me'); } catch (e) { tok.set(''); return signIn(); }
  const p = d.patient;
  root.innerHTML = shell(`
    <div class="card p-4 mb-3 flex items-start justify-between gap-3"><div><div class="text-headline-md font-semibold">${esc(p.name)}</div>
      <div class="text-body-md text-on-surface-variant">UHID <span class="font-data-mono">${esc(p.uhid)}</span>${p.age_years ? ` · ${p.age_years} y` : ''}${p.gender ? ` · ${esc(p.gender)}` : ''}${p.blood_group ? ` · ${esc(p.blood_group)}` : ''}</div></div>
      <button class="btn-secondary btn-sm" data-out>Sign out</button></div>
    ${d.appointments.length ? section('Upcoming appointments', d.appointments.map((a) => `<div class="flex justify-between border-b border-outline-variant/60 py-1.5 text-body-md"><span>${fmtDateTime(a.slot_start)} · ${esc(a.doctor || '')}</span><span class="font-data-mono text-body-sm">${esc(a.appt_no)}</span></div>`).join('')) : ''}
    ${section('Lab reports', d.lab.length ? d.lab.map((o) => `<details class="border-b border-outline-variant/60 py-2"><summary class="cursor-pointer text-body-md font-semibold">${esc(o.label)} <span class="font-normal text-on-surface-variant">· ${fmtDate(o.verified_at || o.ordered_at)}</span>${o.results.some((r) => r.flag) ? ' <span class="pill-warning">Flagged</span>' : ''}</summary>
        <table class="tbl mt-2"><thead><tr><th>Test</th><th class="text-right">Result</th><th>Reference</th></tr></thead><tbody>${o.results.map((r) => `<tr><td>${esc(r.name)}</td><td class="num ${r.flag ? 'text-danger font-semibold' : ''}">${esc(r.value ?? '')} ${esc(r.unit || '')}${r.flag ? ` (${esc(r.flag)})` : ''}</td><td class="text-body-sm">${esc(r.ref_range || '')}</td></tr>`).join('')}</tbody></table></details>`).join('') : none('No verified lab reports yet.'), d.lab.length)}
    ${section('Scan & imaging reports', d.imaging.length ? d.imaging.map((r) => `<details class="border-b border-outline-variant/60 py-2"><summary class="cursor-pointer text-body-md font-semibold">${esc(r.label)} <span class="font-normal text-on-surface-variant">· ${fmtDate(r.signed_at)}</span></summary>
        <div class="text-body-md mt-2 whitespace-pre-line">${r.findings ? `<b>Findings</b>\n${esc(r.findings)}\n` : ''}${r.impression ? `\n<b>Impression</b>\n${esc(r.impression)}` : ''}${r.advice ? `\n\n<b>Advice</b>\n${esc(r.advice)}` : ''}</div></details>`).join('') : none('No signed imaging reports yet.'), d.imaging.length)}
    ${section('Prescriptions', d.prescriptions.length ? d.prescriptions.map((r) => `<details class="border-b border-outline-variant/60 py-2"><summary class="cursor-pointer text-body-md font-semibold">${fmtDate(r.created_at)} · ${esc(r.doctor || '')}</summary>
        <ul class="mt-2 text-body-md list-disc pl-5">${r.items.map((i) => `<li><b>${esc(i.drug)}</b> ${esc([i.dose, i.route, i.frequency, i.duration_days ? `${i.duration_days} days` : ''].filter(Boolean).join(' · '))}${i.instructions ? ` — ${esc(i.instructions)}` : ''}</li>`).join('')}</ul></details>`).join('') : none('No prescriptions yet.'), d.prescriptions.length)}
    ${d.summaries.length ? section('Discharge summaries', d.summaries.map((a) => `<details class="border-b border-outline-variant/60 py-2"><summary class="cursor-pointer text-body-md font-semibold">${esc(a.ip_no)} · ${fmtDate(a.admitted_at)} – ${fmtDate(a.discharged_at)}</summary>
        <div class="text-body-md mt-2 space-y-2">${Object.entries(a.summary || {}).filter(([, v]) => v && typeof v !== 'object').map(([k, v]) => `<div><b>${esc(k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}</b><div class="whitespace-pre-line">${esc(v)}</div></div>`).join('')}</div></details>`).join(''), d.summaries.length) : ''}
    ${section('Bills', d.bills.length ? `<table class="tbl"><thead><tr><th>Bill</th><th class="text-right">Total</th><th class="text-right">Due</th></tr></thead><tbody>${d.bills.map((b) => `<tr><td class="text-body-sm"><span class="font-data-mono">${esc(b.bill_no)}</span><div class="text-on-surface-variant">${fmtDate(b.bill_date)}</div></td><td class="num">${money(b.total, 2)}</td><td class="num ${b.balance > 0.005 ? 'text-danger' : 'text-success'}">${b.balance > 0.005 ? money(b.balance, 2) : 'Paid'}</td></tr>`).join('')}</tbody></table>` : none('No bills.'), d.bills.length)}
    ${d.receipts.length ? section('Receipts', d.receipts.map((r) => `<div class="flex justify-between border-b border-outline-variant/60 py-1.5 text-body-md"><span><span class="font-data-mono">${esc(r.receipt_no)}</span> · ${fmtDate(r.received_at)}</span><span class="num ${r.amount < 0 ? 'text-danger' : ''}">${r.amount < 0 ? 'Refund ' : ''}${money(Math.abs(r.amount), 2)}</span></div>`).join(''), d.receipts.length) : ''}
    ${section('Visits', d.visits.length ? d.visits.map((v) => `<div class="flex justify-between border-b border-outline-variant/60 py-1.5 text-body-md"><span>${fmtDate(v.visit_date)} · ${esc(v.doctor || '')}</span><span class="text-on-surface-variant text-body-sm">${esc(v.department || v.kind)}</span></div>`).join('') : none('No visits yet.'), d.visits.length)}
    <p class="text-body-sm text-on-surface-variant mt-4 mb-8">For medical advice, speak to your doctor. Reports appear here once they are verified.</p>`);
  root.querySelector('[data-out]').onclick = async () => { await call('/portal/logout', {}).catch(() => {}); tok.set(''); signIn(); };
}

tok.get() ? home() : signIn();
