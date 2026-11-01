import { NAV } from './nav.js';
import { state, can, onState, setting } from '../store.js';
import { $, $$, esc } from '../ui.js';
import { navigate } from '../router.js';

let mounted = false;

export function renderSidebar() {
  const nav = $('#nav');
  if (!nav) return;
  let openGroups={};try{openGroups=JSON.parse(localStorage.getItem('hms_pharmacy_groups_'+state.user?.id)||'{}');}catch{}
  nav.querySelectorAll('details[data-menu-group]').forEach(group=>{openGroups[group.dataset.menuGroup]=group.open;});
  const seen = new Set();
  // Long menus fold: with more than LONG items, sections other than Overview and the one you are
  // in start folded. Whatever the person folds or opens is remembered on this computer.
  const visible = (group) => group.items.filter((i) => allowedItem(i));
  const total = NAV.reduce((n, g) => n + visible(g).length, 0);
  const folds = readFolds();
  // besides Overview, the section holding most of this login's screens stays open (reception → Reception & OPD)
  const main = NAV.filter((g) => g.section !== 'Overview').reduce((best, g) => (visible(g).length > (best ? visible(best).length : 0) ? g : best), null)?.section;
  const html = NAV.map((group) => {
    // A screen appears once, under the first section the role can use.
    const allowed = (p) => !p || (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
    // `manual: [setting, value]` hides a portal screen while that department works on paper
    const items = group.items.filter((i) => !i.sidebarHidden && !i.excludeRoles?.includes(state.user?.role) && allowed(i.perm) && !(i.hideIf && can(i.hideIf)) && !(i.manual && setting(i.manual[0]) === i.manual[1]) && !seen.has(i.route));
    items.forEach((i) => seen.add(i.route));
    if (!items.length) return '';
    const here = items.some((i) => routeActive(i.route,state.route));
    const folded = here ? false : group.section in folds ? folds[group.section] : total > LONG && group.section !== 'Overview' && group.section !== main;
    return `<div class="nav-group${folded ? ' is-folded' : ''}" data-group="${esc(group.section)}">
      <button type="button" class="nav-section nav-fold" data-fold aria-expanded="${!folded}">${esc(group.section)}<span class="material-symbols-outlined nav-chevron">expand_more</span></button>
      <div class="nav-items"><div>
      ${items.map((i,index) => {
        const start=i.menuGroup&&items[index-1]?.menuGroup!==i.menuGroup?`<details class="pharmacy-menu-group" data-menu-group="${esc(i.menuGroup)}" ${openGroups[i.menuGroup]?'open':''}><summary class="nav-item" title="Expand or collapse ${esc(i.menuGroup)}"><span class="nav-label flex-1">${esc(i.menuGroup)}</span><span class="material-symbols-outlined menu-group-chevron" aria-hidden="true">expand_more</span></summary>`:'';
        const end=i.menuGroup&&items[index+1]?.menuGroup!==i.menuGroup?'</details>':'';
        const badge = i.badge ? (state.badges?.[i.badge] ?? null) : null;
        return `${start}<a class="nav-item" data-route="${i.route}" ${i.external ? 'data-external="1"' : ''}
                   href="${i.route}" title="${esc(i.label)}">
          <span class="material-symbols-outlined text-[18px] shrink-0">${i.icon}</span>
          <span class="nav-label flex-1 truncate">${esc(i.label)}</span>
          ${badge ? `<span class="nav-badge font-data-mono text-label-sm px-1.5 py-0.5 rounded
            ${i.tone === 'danger' && badge > 0 ? 'bg-danger text-white' : 'bg-white/15 text-white'}"
            data-badge="${i.badge}">${badge}</span>` : ''}
        </a>${end}`;
      }).join('')}
      </div></div>
    </div>`;
  }).join('');
  const signature=JSON.stringify([html,state.route]);
  if(nav.dataset.renderSignature===signature)return;
  nav.dataset.renderSignature=signature;
  const scroll=nav.scrollTop;
  nav.innerHTML = html;
  nav.scrollTop=scroll;
  markActive(state.route);

  if (!mounted) {
    mounted = true;
    nav.addEventListener('toggle',event=>{const group=event.target;if(!group.matches?.('details[data-menu-group]'))return;let saved={};const key='hms_pharmacy_groups_'+state.user?.id;try{saved=JSON.parse(localStorage.getItem(key)||'{}');saved[group.dataset.menuGroup]=group.open;localStorage.setItem(key,JSON.stringify(saved));}catch{}},true);
    nav.addEventListener('click', (e) => {
      const fold = e.target.closest('[data-fold]');
      if (fold) {
        const g = fold.closest('[data-group]');
        const now = !g.classList.contains('is-folded');
        g.classList.toggle('is-folded', now);
        fold.setAttribute('aria-expanded', String(!now));
        const f = readFolds(); f[g.dataset.group] = now; try { localStorage.setItem(FOLD_KEY(), JSON.stringify(f)); } catch { /* private window */ }
        return;
      }
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

const LONG = 22;
const FOLD_KEY = () => `hms_nav_folds_${state.user?.id || 'x'}`;
function readFolds() { try { return JSON.parse(localStorage.getItem(FOLD_KEY()) || '{}'); } catch { return {}; } }
function allowedItem(i) {
  const allowed = (p) => !p || (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
  return !i.sidebarHidden && !i.excludeRoles?.includes(state.user?.role) && allowed(i.perm) && !(i.hideIf && can(i.hideIf)) && !(i.manual && setting(i.manual[0]) === i.manual[1]);
}

function routeActive(item,route){
  if(!item)return false;
  if(item.includes('?')){const url=new URL(item,location.origin);const current=new URL(location.href);return url.pathname===route&&[...url.searchParams].every(([key,value])=>current.searchParams.get(key)===value);}
  return item===route||(route||'').startsWith(item+'/');
}

export function markActive(route) {
  $$('#nav .nav-item').forEach((a) => {
    const r = a.dataset.route;
    const on = routeActive(r,route);
    a.classList.toggle('active', on);
    if(on&&a.closest('details'))a.closest('details').open=true;
    // the section holding the open screen is never folded
    if (on) { const g = a.closest('.nav-group'); g?.classList.remove('is-folded'); g?.querySelector('[data-fold]')?.setAttribute('aria-expanded', 'true'); }
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
