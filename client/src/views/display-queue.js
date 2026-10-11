/**
 * Public waiting-room token display.
 *
 * Runs unattended on a wall screen: no chrome, large type, patient names
 * abbreviated so the board does not broadcast identities.
 */
import { api } from '../api.js';
import { subscribe, on } from '../ws.js';
import { $, esc, fmtTime } from '../ui.js';

export async function mount(ctx) {
  // The board is full-screen: drop the shell chrome around it.
  document.getElementById('app-shell')?.classList.add('fullscreen');

  const root = ctx.host.querySelector('.view-root') || ctx.host;
  root.innerHTML = `<div class="min-h-screen bg-brand-dark text-white" data-board></div>`;

  let lastServing = new Map();

  async function load() {
    const d = await api.get('/queue/display');
    paint(root, d);
    // Flash a counter whose "now serving" token has just changed.
    for (const c of d.counters) {
      const prev = lastServing.get(c.doctor_id);
      if (c.serving && prev !== c.serving.token) {
        const el = root.querySelector(`[data-counter="${c.doctor_id}"]`);
        if (el && prev !== undefined) { el.classList.add('row-flash'); setTimeout(() => el.classList.remove('row-flash'), 1800); }
      }
      lastServing.set(c.doctor_id, c.serving?.token);
    }
  }

  const unsub = subscribe(['display', 'queue']);
  const off = on(['queue.called', 'encounter.stage', 'encounter.created', 'tick', 'realtime.connected'], load);
  const timer = setInterval(load, 15000);
  const clock = setInterval(() => {
    const el = root.querySelector('[data-clock]');
    if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }, 1000);
  load();

  return () => {
    unsub(); off(); clearInterval(timer); clearInterval(clock);
    document.getElementById('app-shell')?.classList.remove('fullscreen');
  };
}

function paint(root, d) {
  const board = root.querySelector('[data-board]');
  board.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <header class="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div class="flex items-center gap-4">
          <img src="/assets/logo.svg" class="h-12 w-12" alt="">
          <div>
            <div class="text-[26px] font-bold leading-tight">${esc(d.hospital || 'Hospital')}</div>
            <div class="text-white/50 text-[13px] uppercase tracking-widest">${esc(d.campus || '')}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[34px] font-bold tnum leading-none" data-clock>—</div>
          <div class="text-white/50 text-[13px] uppercase tracking-widest mt-1">
            ${new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
      </header>

      <main class="flex-1 p-8">
        ${d.counters.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          ${d.counters.map(counterCard).join('')}</div>`
          : `<div class="h-full grid place-items-center text-center">
              <div><span class="material-symbols-outlined text-[64px] text-white/30">event_available</span>
                <div class="text-[26px] font-semibold mt-3">No clinics in session</div>
                <div class="text-white/50 mt-1">Token numbers appear here once consultations begin.</div></div></div>`}
      </main>

      <footer class="px-8 py-4 border-t border-white/10 flex items-center justify-between text-white/60 text-[14px]">
        <span>Please wait for your token number to be called. Keep your registration slip ready.</span>
        <span class="flex items-center gap-2"><span class="live-dot"></span>Live from the hospital system</span>
      </footer>
    </div>`;
}

function counterCard(c) {
  return `<section class="rounded-2xl bg-white/5 border border-white/10 overflow-hidden" data-counter="${c.doctor_id}">
    <header class="px-5 py-3 bg-white/5 border-b border-white/10">
      <div class="text-[19px] font-semibold truncate">${esc(c.doctor)}</div>
      <div class="text-white/50 text-[13px] truncate">${esc(c.dept || '')}${c.room ? ` · Room ${esc(c.room)}` : ''}</div>
    </header>
    <div class="p-5">
      <div class="text-white/45 text-[12px] uppercase tracking-[0.18em]">Now serving</div>
      ${c.serving
        ? `<div class="flex items-baseline gap-3 mt-1">
            <span class="text-[72px] leading-none font-bold text-[#E7A7AE] tnum">${c.serving.token}</span>
            <span class="text-white/70 text-[17px] truncate">${esc(c.serving.name)}</span></div>`
        : `<div class="text-[40px] leading-tight text-white/25 font-bold mt-1">—</div>`}
      <div class="mt-4 pt-3 border-t border-white/10">
        <div class="text-white/45 text-[12px] uppercase tracking-[0.18em] mb-1.5">Next in line</div>
        ${c.next.length
          ? `<div class="flex flex-wrap gap-2">${c.next.map((n) => `
              <span class="px-3 py-1.5 rounded-lg bg-white/10 font-bold tnum text-[19px]">${n.token}</span>`).join('')}</div>`
          : `<div class="text-white/35 text-[15px]">Nobody waiting</div>`}
      </div>
      <div class="mt-3 flex items-center justify-between text-white/45 text-[13px]">
        <span>${c.waiting} waiting</span><span>${c.completed} seen today</span>
      </div>
    </div>
  </section>`;
}
