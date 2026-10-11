import { NAV } from './nav.js';
import { state, can, onState } from '../store.js';
import { $, $$, esc } from '../ui.js';
import { navigate } from '../router.js';

let mounted = false;

export function renderSidebar() {
  const nav = $('#nav');
  if (!nav) return;
  const seen = new Set();
  const html = NAV.map((group) => {
    // A screen appears once, under the first section the role can use.
    const allowed = (p) => !p || (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
    const items = group.items.filter((i) => allowed(i.perm) && !(i.hideIf && can(i.hideIf)) && !seen.has(i.route));
    items.forEach((i) => seen.add(i.route));
    if (!items.length) return '';
    return `<div class="nav-group">
      <div class="nav-section">${esc(group.section)}</div>
      ${items.map((i) => {
        const badge = i.badge ? (state.badges?.[i.badge] ?? null) : null;
        return `<a class="nav-item" data-route="${i.route}" ${i.external ? 'data-external="1"' : ''}
                   href="${i.route}" title="${esc(i.label)}">
          <span class="material-symbols-outlined text-[18px] shrink-0">${i.icon}</span>
          <span class="nav-label flex-1 truncate">${esc(i.label)}</span>
          ${badge ? `<span class="nav-badge font-data-mono text-label-sm px-1.5 py-0.5 rounded
            ${i.tone === 'danger' && badge > 0 ? 'bg-danger text-white' : 'bg-white/15 text-white'}"
            data-badge="${i.badge}">${badge}</span>` : ''}
        </a>`;
      }).join('')}
    </div>`;
  }).join('');
  nav.innerHTML = html;
  markActive(state.route);

  if (!mounted) {
    mounted = true;
    nav.addEventListener('click', (e) => {
      const a = e.target.closest('[data-route]');
      if (!a) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (a.dataset.external) { window.open(a.dataset.route, '_blank', 'noopener'); return; }
      navigate(a.dataset.route);
      document.getElementById('app-shell').classList.remove('mobile-open');
    });
  }
}

export function markActive(route) {
  $$('#nav .nav-item').forEach((a) => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === route || (route || '').startsWith(r + '/'));
  });
}

export function initSidebarChrome() {
  const shell = $('#app-shell');
  const collapsed = localStorage.getItem('surely_rail') === 'collapsed';
  if (collapsed) shell.classList.add('collapsed');
  syncCollapseIcon();

  $('#nav-collapse').onclick = () => {
    shell.classList.toggle('collapsed');
    localStorage.setItem('surely_rail', shell.classList.contains('collapsed') ? 'collapsed' : 'open');
    syncCollapseIcon();
  };
  $('#mobile-nav').onclick = () => shell.classList.toggle('mobile-open');

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#nav-collapse').click(); }
  });

  onState(() => {
    // Live badge counts without re-rendering the whole rail.
    $$('#nav [data-badge]').forEach((b) => {
      const v = state.badges?.[b.dataset.badge];
      if (v !== undefined && String(v) !== b.textContent) b.textContent = v;
    });
  });
}

function syncCollapseIcon() {
  const c = $('#app-shell').classList.contains('collapsed');
  $('#nav-collapse-icon').textContent = c ? 'left_panel_open' : 'left_panel_close';
}
