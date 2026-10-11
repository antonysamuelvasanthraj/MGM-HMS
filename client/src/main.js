import { api, token, setToken } from './api.js';
import { state, loadSession, loadMeta, refreshBadges, signIn, signOut, can, setting } from './store.js';
import { $, $$, toast, esc, initials, debounce, fmtTime, modal } from './ui.js';
import { connect, on, onState as onWsState, subscribe } from './ws.js';
import { renderSidebar, initSidebarChrome } from './shell/sidebar.js';
import { startRouter, navigate, render } from './router.js';

boot();

async function boot() {
  if (!token()) return showSignIn();
  try {
    await loadSession();
  } catch {
    setToken('');
    return showSignIn();
  }
  await loadMeta();
  await refreshBadges();
  showShell();
}

/* --------------------------------------------------------------- sign in */

async function showSignIn() {
  const gate = $('#auth-gate');
  gate.classList.remove('hidden');
  $('#app-shell').classList.add('hidden');


  gate.innerHTML = `
    <div class="min-h-full grid lg:grid-cols-[1.15fr_1fr]">
      <!-- Left branding panel -->
      <div class="hidden lg:flex flex-col justify-between p-12 text-white/90 relative overflow-hidden"
           style="background:linear-gradient(145deg,#200A0F 0%,#3D1219 35%,#5C1B26 70%,#881D2C 100%)">
        <!-- pattern overlay -->
        <div class="absolute inset-0 opacity-[0.04]" style="background-image:radial-gradient(circle at 25% 55%, white 1px, transparent 1px),radial-gradient(circle at 75% 20%, white 1px, transparent 1px),radial-gradient(circle at 45% 85%, white 1px, transparent 1px),radial-gradient(circle at 85% 70%, white 1px, transparent 1px); background-size:70px 70px, 45px 45px, 55px 55px, 40px 40px;"></div>
        <!-- glow orbs -->
        <div class="absolute top-0 right-0 w-[480px] h-[480px] rounded-full opacity-[0.08]" style="background:radial-gradient(circle,#C3A256 0%,transparent 65%); transform:translate(35%,-35%);"></div>
        <div class="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-[0.06]" style="background:radial-gradient(circle,#C3A256 0%,transparent 65%); transform:translate(-35%,35%);"></div>
        <div class="absolute top-1/2 left-1/2 w-96 h-96 rounded-full opacity-[0.04]" style="background:radial-gradient(circle,#ffffff 0%,transparent 65%); transform:translate(-50%,-50%);"></div>

        <div class="relative">
          <div class="flex items-center gap-3">
            <div class="rounded-xl flex items-center justify-center" style="background:rgba(195,162,86,0.15); border:1px solid rgba(195,162,86,0.3);">
              <img src="/assets/mgm-hospital-logo.png" style="width:190px;height:auto;background:white;border-radius:8px;padding:4px" alt="MGM Superspeciality Hospitals">
            </div>
            <div>
              <div class="font-headline-lg text-headline-lg text-white tracking-tight">MGM HMS</div>
              <div class="font-label-sm text-label-sm uppercase tracking-widest" style="color:#C3A256; opacity:0.85">Srikalahasthi, Andhra Pradesh</div>
            </div>
          </div>
        </div>

        <div class="relative max-w-lg">
          <h1 class="text-[38px] leading-[1.1] font-bold text-white tracking-tight">100 beds.<br><span style="color:#E8C876">Care for every speciality.</span></h1>
          <p class="mt-4 text-body-lg text-white/60 leading-relaxed">Our mission is to bring healthcare of International standards within the reach of every individual. We are committed to excellence in education, research and healthcare for the benefit of humanity.</p>
          <div class="grid grid-cols-2 gap-3 mt-8">
            ${[
              ['groups', 'Live Patient Flow', 'Token queue synced to every desk'],
              ['payments', 'Unified Billing', 'One bill, multiple collection points'],
              ['science', 'Integrated Diagnostics', 'Lab & imaging from consultation'],
              ['dns', 'Runs on Your Server', 'No internet dependency required'],
            ].map(([i, t, s]) => `
              <div class="p-3.5 rounded-xl flex flex-col gap-1.5" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.07); backdrop-filter:blur(4px);">
                <span class="material-symbols-outlined text-[20px]" style="color:#C3A256">${i}</span>
                <div class="font-label-lg text-label-lg text-white">${t}</div>
                <div class="text-body-sm text-white/45">${s}</div>
              </div>`).join('')}
          </div>
        </div>

        <div class="relative flex items-center gap-3 font-label-sm text-label-sm text-white/25">
          <span class="w-1.5 h-1.5 rounded-full bg-white/25"></span>NABH-aligned
          <span class="w-1.5 h-1.5 rounded-full bg-white/25"></span>Data stays on the hospital server
          <span class="w-1.5 h-1.5 rounded-full bg-white/25"></span>v1.0
        </div>
      </div>

      <!-- Right sign-in panel -->
      <div class="grid place-items-center p-6 overflow-y-auto" style="background:linear-gradient(160deg,#FAFBFC 0%,#F2F4F7 100%)">
        <div class="w-full max-w-[380px]">
          <div class="lg:hidden flex items-center gap-2.5 mb-8">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:rgba(136,29,44,0.1);border:1px solid rgba(136,29,44,0.2)">
              <img src="/assets/mgm-hospital-logo.png" style="width:36px;height:26px;object-fit:contain;background:white" alt="MGM Hospitals">
            </div>
            <div>
              <div class="font-headline-md text-primary leading-none">MGM HMS</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant">Multi-Speciality Hospital</div>
            </div>
          </div>

          <div class="mb-7">
            <h2 class="font-headline-lg text-headline-lg text-on-surface">Staff sign in</h2>
            <p class="text-body-lg text-on-surface-variant mt-1">Use the credentials issued by your administrator.</p>
          </div>

          <form id="signin-form" class="space-y-4" autocomplete="on">
            <div>
              <label class="field-label" for="si-user">Login ID</label>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">person</span>
                <input id="si-user" name="username" class="field !pl-10" autocomplete="username" required placeholder="Your login ID">
              </div>
            </div>
            <div>
              <label class="field-label" for="si-pass">Password</label>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">lock</span>
                <input id="si-pass" name="password" type="password" class="field !pl-10 pr-10" autocomplete="current-password" required placeholder="••••••">
                <button type="button" id="si-eye" class="absolute right-1 top-1 btn-ghost !h-8 !w-8 !px-0" aria-label="Show password">
                  <span class="material-symbols-outlined text-[18px]">visibility</span>
                </button>
              </div>
            </div>
            <div>
              <label class="field-label" for="si-counter">Counter / desk <span class="normal-case tracking-normal text-on-surface-variant/70">(cash desks only)</span></label>
              <select id="si-counter" class="field"><option value="">Not at a cash counter</option></select>
            </div>

            <div id="si-error" class="hidden flex items-center gap-2 p-3 rounded-lg bg-danger-bg border border-danger/20 text-danger text-body-md">
              <span class="material-symbols-outlined text-[18px] shrink-0">error</span>
              <span id="si-error-text"></span>
            </div>

            <button class="btn-primary w-full mt-1" style="height:46px; font-size:14px; letter-spacing:0.01em;" id="si-submit">
              <span class="material-symbols-outlined text-[18px]">login</span> Sign in to MGM HMS
            </button>
          </form>

          <p class="mt-7 pt-6 border-t border-outline-variant text-body-sm text-on-surface-variant">Staff accounts are managed by the hospital administrator.</p>
        </div>
      </div>
    </div>`;


  // No credentials are ever listed on the sign-in page; demo logins are handed out separately.

  // Load counters
  fetch('/api/counters').then(r => r.ok ? r.json() : []).then(counters => {
    const sel = $('#si-counter');
    if (!sel || !counters.length) return;
    counters.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
  }).catch(() => {});

  // Password toggle
  const form = $('#signin-form');
  $('#si-eye').onclick = () => {
    const p = $('#si-pass');
    p.type = p.type === 'password' ? 'text' : 'password';
    $('#si-eye').firstElementChild.textContent = p.type === 'password' ? 'visibility' : 'visibility_off';
  };

  // Shared login flow
  const doLogin = async (user, pass, counter) => {
    const btn = $('#si-submit');
    btn.disabled = true;
    $('#si-error').classList.add('hidden');
    try {
      await signIn(user, pass, counter || null);
      await loadMeta(true);
      await refreshBadges();
      gate.classList.add('hidden');
      gate.innerHTML = '';
      showShell();
      if (location.pathname === '/login' || location.pathname === '/') navigate('/dashboard', { replace: true });
    } catch (err) {
      $('#si-error-text').textContent = err.status === 401 ? 'Login ID or password is not recognised.'
        : err.status === 429 ? 'Too many wrong attempts. Wait 10 minutes and try again, or ask the administrator.'
        : `Sign-in failed: ${err.message}`;
      $('#si-error').classList.remove('hidden');
    } finally { btn.disabled = false; }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    await doLogin($('#si-user').value.trim(), $('#si-pass').value, $('#si-counter').value);
  };
  $('#si-user').focus();
}

/* ----------------------------------------------------------------- shell */

function showShell() {
  $('#auth-gate').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');

  $('#rail-campus').textContent = setting('campus', 'Multi-Speciality Hospital');
  $('#user-name').textContent = state.user.name;
  $('#user-role').textContent = state.user.designation || state.user.role;
  $('#user-initials').textContent = initials(state.user.name);
  { const badge = $('#env-badge'); const demo = state.meta?.environment === 'demo'; badge?.classList.toggle('hidden', !demo); badge?.classList.toggle('flex', demo); }

  renderSidebar();
  initSidebarChrome();
  initTopbar();
  connect();
  wireRealtime();
  startRouter();

  setInterval(() => { $('#clock').textContent = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }); }, 1000);
  setInterval(refreshBadgesAndRail, 45000);
}

function initTopbar() {
  /* --- user menu --- */
  $('#user-chip').onclick = () => {
    const u = state.user;
    modal({
      title: u.name, size: 'sm',
      subtitle: `${esc(u.designation || u.role)}${u.reg_no ? ` · Reg ${esc(u.reg_no)}` : ''}`,
      body: `<dl class="grid grid-cols-[120px_1fr] gap-y-2 text-body-lg">
          <dt class="text-on-surface-variant">Staff code</dt><dd class="font-data-mono">${esc(u.staff_code)}</dd>
          <dt class="text-on-surface-variant">Role</dt><dd>${esc(u.role)}</dd>
          ${u.qualification ? `<dt class="text-on-surface-variant">Qualification</dt><dd>${esc(u.qualification)}</dd>` : ''}
          ${u.counter ? `<dt class="text-on-surface-variant">Counter</dt><dd>${esc(u.counter.name)}</dd>` : ''}
        </dl>
        <div class="mt-4 pt-3 border-t border-outline-variant flex flex-wrap gap-2">
          <a href="/my-access" class="btn-secondary btn-sm" data-close>My access & diagnostics</a>
          <a href="/local-sync" class="btn-secondary btn-sm" data-close>Server & sync</a>
        </div>`,
      footer: `<button class="btn-secondary" data-close>Close</button>
               <button class="btn-danger" id="do-signout"><span class="material-symbols-outlined text-[16px]">logout</span> Sign out</button>`,
      onMount(root, close) { root.querySelector('#do-signout').onclick = () => { close(); signOut(); }; },
    });
  };

  /* --- notifications --- */
  $('#notif-btn').onclick = async () => {
    const list = await api.get('/notifications').catch(() => []);
    state.notifications = list;
    $('#notif-dot').classList.add('hidden');
    // opening the bell marks what it shows as read
    for (const n of list.filter((x) => !x.read_at)) api.post(`/notifications/${n.id}/read`).catch(() => {});
    const unread = list.filter(n => !n.read_at);
    const iconMap = { danger: ['error', 'danger-bg', 'danger'], warning: ['warning', 'warning-bg', 'warning'], info: ['info', 'info-bg', 'info'], success: ['check_circle', 'success-bg', 'success'] };
    modal({
      title: `Notifications${unread.length ? ` (${unread.length} new)` : ''}`, size: 'md',
      body: list.length ? `<ul class="divide-y divide-outline-variant -mx-5 -my-4">${list.map((n) => {
        const [ic, bg, fg] = iconMap[n.level] || iconMap.info;
        const dt = n.created_at ? new Date(n.created_at.replace(' ','T')) : null;
        const dtStr = dt ? dt.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:true }) : '';
        return `
        <li class="px-5 py-3 flex gap-3 ${!n.read_at ? 'bg-surface-container-low/50' : ''} hover:bg-surface-container-low transition-colors">
          <div class="w-8 h-8 rounded-lg bg-${bg} grid place-items-center shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-[16px] text-${fg}">${ic}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="font-label-lg text-label-lg">${esc(n.title)}</div>
              ${!n.read_at ? '<span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5"></span>' : ''}
            </div>
            ${n.body ? `<div class="text-body-md text-on-surface-variant mt-0.5">${esc(n.body)}</div>` : ''}
            <div class="font-data-mono text-label-sm text-on-surface-variant/60 mt-1">${dtStr}</div>
          </div>
          ${n.link ? `<a href="${esc(n.link)}" class="btn-secondary btn-xs shrink-0 self-center" data-close>Open</a>` : ''}
        </li>`;
      }).join('')}</ul>`
        : `<div class="grid place-items-center py-10 text-center">
            <div class="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center mb-2">
              <span class="material-symbols-outlined text-[24px] text-on-surface-variant/40">notifications_off</span>
            </div>
            <div class="font-title-md text-title-md">All clear</div>
            <div class="text-body-lg text-on-surface-variant mt-1">Nothing needs your attention right now.</div>
           </div>`,
      footer: `<button class="btn-secondary" data-close>Close</button>`,
    });
  };

  /* --- sync chip --- */
  $('#sync-chip').onclick = () => navigate('/local-sync');
  $('#conn-chip').onclick = () => toast(`Realtime: ${document.getElementById('conn-text').textContent}. ${state.badges ? '' : ''}`, 'info');

  /* --- global search --- */
  const input = $('#global-search');
  const panel = $('#search-results');
  const typeColors = { patient: 'bg-info-bg text-info', bill: 'bg-warning-bg text-warning', encounter: 'bg-primary-fixed text-primary', token: 'bg-success-bg text-success' };
  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { panel.classList.add('hidden'); return; }
    const { results } = await api.get(`/search?q=${encodeURIComponent(q)}`).catch(() => ({ results: [] }));
    if (!results.length) {
      panel.innerHTML = `<div class="p-5 text-center">
        <span class="material-symbols-outlined text-[24px] text-on-surface-variant/40">search_off</span>
        <div class="text-body-lg text-on-surface-variant mt-1">No match for &ldquo;${esc(q)}&rdquo;</div>
      </div>`;
    } else {
      panel.innerHTML = `<div class="px-3 pt-2.5 pb-1.5 font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/50">${results.length} result${results.length !== 1 ? 's' : ''}</div>` +
        results.map((r, i) => `
        <button class="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors ${i ? 'border-t border-outline-variant/50' : ''}"
                data-goto="${esc(r.route)}">
          <div class="w-8 h-8 rounded-lg bg-surface-container-low grid place-items-center shrink-0">
            <span class="material-symbols-outlined text-[17px] text-on-surface-variant">${r.icon}</span>
          </div>
          <span class="min-w-0 flex-1">
            <span class="block font-label-lg text-label-lg truncate">${esc(r.title)}</span>
            <span class="block text-body-sm text-on-surface-variant truncate">${esc(r.sub)}</span>
          </span>
          <span class="pill ${typeColors[r.type] || 'bg-neutral-bg text-neutral'}">${esc(r.type)}</span>
        </button>`).join('');
    }
    panel.classList.remove('hidden');
  }, 220);

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { panel.classList.add('hidden'); input.blur(); }
    if (e.key === 'Enter') { const f = panel.querySelector('[data-goto]'); if (f) f.click(); }
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    panel.classList.add('hidden');
    input.value = '';
    navigate(b.dataset.goto);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-search') && !e.target.closest('#search-results')) panel.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
  });
}

/* -------------------------------------------------------------- realtime */

function wireRealtime() {
  onWsState((s) => {
    const dot = $('#conn-dot'), text = $('#conn-text');
    if (!dot) return;
    const map = { live: ['#16A34A', `live · ${s.clients}`], connecting: ['#D97706', 'linking'], offline: ['#B91C1C', 'offline'] };
    const [colour, label] = map[s.status] || map.offline;
    dot.style.background = colour;
    dot.style.animation = s.status === 'live' ? '' : 'none';
    text.textContent = label;
  });

  subscribe(['dashboard', 'system']);

  on('notify', (d) => {
    if (d.role && d.role !== state.user.role) return;
    toast(d.body || '', d.level || 'info', { title: d.title });
  });

  on(['encounter.created', 'encounter.stage', 'encounter.updated', 'queue.changed', 'payment.received', 'payment.cancelled', 'lab.critical', 'lab.verified',
      'bill.created', 'bill.updated', 'bill.authorized', 'orders.created', 'order.updated', 'admission.created', 'admission.updated', 'admission.discharged',
      'emergency.created', 'emergency.updated', 'indent.created', 'indent.dispensed', 'indent.updated', 'transfer.updated', 'stock.changed',
      'prescription.saved', 'pharmacy.dispensed', 'appointment.created', 'appointment.updated', 'approval.requested', 'approval.decided',
      'claim.created', 'claim.updated', 'staff-work.changed', 'quality.created', 'quality.updated', 'ot.created', 'ot.updated', 'maternity.updated', 'sync.updated'],
    throttle(refreshBadgesAndRail, 3000));

  on('lab.critical', (d) => {
    if (!d?.critical) return;
    toast(`${d.order?.label || 'Lab result'} — ${d.critical} critical value(s)`, 'danger',
      { title: 'Critical result', timeout: 12000, action: { label: 'Open laboratory', run: () => navigate('/laboratory') } });
  });

  on('emergency.created', (d) => {
    if (['1', '2'].includes(d?.triage)) {
      toast(`${d.complaint || 'New emergency'} · ${d.bay || ''}`, 'danger',
        { title: `Emergency P${d.triage} arrival`, timeout: 10000, action: { label: 'Emergency desk', run: () => navigate('/emergency') } });
    }
  });

  window.addEventListener('surely:unauthorised', () => {
    setToken('');
    location.href = '/login';
  });
}

async function refreshBadgesAndRail() {
  await refreshBadges();
  renderSidebar();
  try {
    const h = await api.get('/system/health');
    const n = (h.sync_queued || 0) + (h.sync_failed || 0);
    $('#sync-text').textContent = n;
    $('#sync-chip').classList.toggle('border-warning', n > 0);
  } catch {}
}

function throttle(fn, ms) {
  let last = 0, pending = null;
  return (...a) => {
    const now = Date.now();
    if (now - last > ms) { last = now; fn(...a); }
    else { clearTimeout(pending); pending = setTimeout(() => { last = Date.now(); fn(...a); }, ms); }
  };
}

// expose a couple of helpers for the converted design scripts
window.MGMHMS = window.SurelyHMS = { navigate, toast, state };
