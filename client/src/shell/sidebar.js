import {openScreenFinder} from './screen-finder.js';
import { NAV, sectionFor } from './nav.js';
import { state, can, onState, setting } from '../store.js';
import { $, $$, esc } from '../ui.js';
import { navigate } from '../router.js';
import {paperScreenBlocked} from '../paper-mode.js';

let mounted = false;

/**
 * One row per area in the side menu; the screens of the area you are in show as tabs across the top of the page.
 * A screen appears once, under the first area the role can use.
 */
const AREA_ICON = { Overview: 'space_dashboard', Workplace: 'groups_2', 'Reception & OPD': 'concierge', Clinical: 'stethoscope', Emergency: 'e911_emergency', IPD: 'hotel',
  Diagnostics: 'science', Pharmacy: 'local_pharmacy', 'OT & Maternity': 'surgical', 'Billing & Insurance': 'receipt_long', Finance: 'account_balance', Reports: 'summarize', Administration: 'settings' };
const LAST_KEY = () => `hms_area_last_${state.user?.id || 'x'}`;
function readLast() { try { return JSON.parse(localStorage.getItem(LAST_KEY()) || '{}'); } catch { return {}; } }

function allowedItem(i) {
  if(paperScreenBlocked(i.route))return false;
  const allowed = (p) => !p || (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
  // `manual: [setting, value]` hides a portal screen while that department works on paper
  return !i.sidebarHidden && !i.excludeRoles?.includes(state.user?.role) && allowed(i.perm) && !(i.hideIf && can(i.hideIf)) && !(i.manual && setting(i.manual[0]) === i.manual[1]);
}
function areas() {
  const seen = new Set();
  return NAV.map((g) => {
    const items = g.items.filter((i) => allowedItem(i) && !seen.has(i.route));
    items.forEach((i) => seen.add(i.route));
    return { section: g.section, items };
  }).filter((a) => a.items.length);
}
function routeActive(item, route) {
  if (!item) return false;
  if (item.includes('?')) { const url = new URL(item, location.origin); const current = new URL(location.href); return url.pathname === route && [...url.searchParams].every(([key, value]) => current.searchParams.get(key) === value); }
  return item === route || (route || '').startsWith(item + '/');
}
/** The item of an area that the open screen belongs to: the most specific match wins (/reports?group=X before /reports). */
const PARENT_SCREEN={'/patient':'/patients','/visit':'/visit-tracking','/collections':'/billing-desk?desk=reception','/doctor-consultation':'/consultation'};
function activeItem(area, route) {
  if(PARENT_SCREEN[route])return area.items.find(i=>i.route===PARENT_SCREEN[route])||null;
  return area.items.filter((i) => routeActive(i.route, route)).sort((a, b) => b.route.length - a.route.length)[0] || null;
}
function areaOf(list, route) {
  return list.find((a) => activeItem(a, route)) || list.find((a) => a.section === sectionFor(route)) || null;
}
const badgeOf = (i) => (i.badge ? +(state.badges?.[i.badge] ?? 0) || 0 : 0);

const OPEN_KEY = () => `hms_nav_open_${state.user?.id || 'x'}`;
function readOpen() { try { return JSON.parse(localStorage.getItem(OPEN_KEY()) || '{}'); } catch { return {}; } }

export function renderSidebar() {
  const nav = $('#nav');
  if (!nav) return;
  const list = areas(), last = readLast(), opened = readOpen(), activeSection = areaOf(list, state.route)?.section;
  const html = `<button type="button" class="nav-item nav-screen-finder" data-find-screen title="Find a screen (Alt + M)" aria-label="Find a screen"><span class="material-symbols-outlined" aria-hidden="true">search</span><span class="nav-label">Find a screen</span></button>` + list.map((a) => {
    const one = a.items.length === 1 ? a.items[0] : null;
    const target = one?.route || (a.items.some((i) => i.route === last[a.section]) ? last[a.section] : a.items[0].route);
    const badge = a.items.reduce((n, i) => n + badgeOf(i), 0);
    const danger = a.items.some((i) => i.tone === 'danger' && badgeOf(i) > 0);
    const row = `<a class="nav-item" data-area="${esc(a.section)}" data-route="${esc(target)}" ${one?.external ? 'data-external="1"' : ''} href="${esc(target)}" title="${esc(one ? one.label : `${a.section} — ${a.items.map((i) => i.label).join(', ')}`)}">
      <span class="material-symbols-outlined text-[18px] shrink-0">${one ? one.icon : AREA_ICON[a.section] || 'folder'}</span>
      <span class="nav-label flex-1 truncate">${esc(one ? one.label : a.section)}</span>
      <span class="nav-badge font-data-mono text-label-sm px-1.5 py-0.5 rounded ${danger ? 'bg-danger text-white' : 'bg-white/15 text-white'} ${badge ? '' : 'hidden'}" data-area-badge="${esc(a.section)}">${badge || ''}</span>
      ${one ? '' : `<span class="material-symbols-outlined nav-chevron text-[18px] shrink-0" data-toggle-area="${esc(a.section)}" title="Show the screens in ${esc(a.section)}">expand_more</span>`}
    </a>`;
    if (one) return row;
    // a dropdown of the area's screens under its row; opens on its own for the area you are in
    const open = opened[a.section] ?? (a.section === activeSection);
    return `<div class="nav-area${open ? ' is-open' : ''}" data-area-wrap="${esc(a.section)}">${row}
      <div class="nav-sub">${a.items.map((i) => `<a class="nav-sub-item" data-route="${esc(i.route)}" ${i.external ? 'data-external="1"' : ''} href="${esc(i.route)}">
        <span class="material-symbols-outlined text-[16px] shrink-0">${i.icon}</span><span class="flex-1 truncate">${esc(i.label)}</span>
        ${badgeOf(i) ? `<span class="nav-badge font-data-mono text-label-sm px-1.5 rounded bg-white/15 text-white" data-badge="${i.badge || ''}">${badgeOf(i)}</span>` : ''}</a>`).join('')}</div></div>`;
  }).join('');
  const signature = JSON.stringify([html, state.route]);
  if (nav.dataset.renderSignature !== signature) {
    nav.dataset.renderSignature = signature;
    nav.innerHTML = html;
  }
  markActive(state.route);

  if (!mounted) {
    mounted = true;
    const go = (e) => {
      const toggle = e.target.closest('[data-toggle-area]');
      if (toggle) {
        e.preventDefault(); e.stopPropagation();
        const wrap = toggle.closest('.nav-area'); const now = !wrap.classList.contains('is-open');
        wrap.classList.toggle('is-open', now);
        const saved = readOpen(); saved[toggle.dataset.toggleArea] = now; try { localStorage.setItem(OPEN_KEY(), JSON.stringify(saved)); } catch { /* private window */ }
        return;
      }
      if(e.target.closest('[data-find-screen]')){e.preventDefault();openScreenFinder(areas());return;}
      const groupButton=e.target.closest('[data-screen-group]');if(groupButton){e.preventDefault();const group=groupButton.dataset.screenGroup;const list=areas().map(a=>({...a,items:a.items.filter(i=>i.menuGroup===group)})).filter(a=>a.items.length);openScreenFinder(list,group);return;}
      const a = e.target.closest('[data-route]');
      if (!a) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (a.dataset.external) { window.open(a.dataset.route, '_blank', 'noopener'); return; }
      navigate(a.dataset.route);
      document.getElementById('app-shell').classList.remove('mobile-open');
    };
    nav.addEventListener('click', go);
    document.addEventListener('keydown',e=>{if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyM'&&!document.querySelector('#modal-root [role=dialog]')){e.preventDefault();openScreenFinder(areas());}});
    tabStrip().addEventListener('click', go);
  }
}

/** The strip under the top bar that holds the tabs of the open area. */
function tabStrip() {
  let strip = document.getElementById('section-tabs');
  if (!strip) {
    strip = document.createElement('nav');
    strip.id = 'section-tabs'; strip.className = 'section-tabs hidden'; strip.setAttribute('aria-label', 'Screens in this area');
    $('#view').before(strip);
  }
  return strip;
}
function renderSectionTabs(route) {
  const strip = tabStrip(), area = areaOf(areas(), route);
  if (!area || area.items.length < 2) { strip.classList.add('hidden'); strip.innerHTML = ''; return; }
  const on = activeItem(area, route);
  const groups=new Set();
  strip.innerHTML=area.items.map(i=>{
    if(i.menuGroup){
      if(groups.has(i.menuGroup))return '';
      groups.add(i.menuGroup);
      const selected=on?.menuGroup===i.menuGroup;
      return `<button type="button" class="section-tab${selected?' active':''}" data-screen-group="${esc(i.menuGroup)}" aria-haspopup="dialog" title="${esc(i.menuGroup)}"><span class="material-symbols-outlined text-[16px]">${esc(i.icon)}</span>${esc(i.menuGroup)}<span class="material-symbols-outlined text-[16px]">expand_more</span></button>`;
    }
    const badge=badgeOf(i);
    return `<a class="section-tab${i===on?' active':''}" data-route="${esc(i.route)}" ${i.external?'data-external="1"':''} href="${esc(i.route)}" ${i===on?'aria-current="page"':''}><span class="material-symbols-outlined text-[16px]">${esc(i.icon)}</span>${esc(i.label)}<span class="section-tab-badge ${badge?'':'hidden'}" data-badge="${i.badge||''}">${badge||''}</span></a>`;
  }).join('');
  strip.classList.remove('hidden');
  strip.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function markActive(route) {
  const list = areas(), area = areaOf(list, route);
  $$('#nav .nav-item').forEach((a) => a.classList.toggle('active', !!area && a.dataset.area === area.section));
  const here = area && activeItem(area, route);
  $$('#nav .nav-sub-item').forEach((a) => a.classList.toggle('active', !!here && a.dataset.route === here.route));
  if (area) $(`#nav .nav-area[data-area-wrap="${CSS.escape(area.section)}"]`)?.classList.add('is-open');
  // the area row reopens the screen you last used there
  const item = area && activeItem(area, route);
  if (item && area.items.length > 1) {
    const last = readLast();
    if (last[area.section] !== item.route) { last[area.section] = item.route; try { localStorage.setItem(LAST_KEY(), JSON.stringify(last)); } catch { /* private window */ } }
    const row = $(`#nav .nav-item[data-area="${CSS.escape(area.section)}"]`);
    if (row) { row.dataset.route = item.route; row.setAttribute('href', item.route); }
  }
  renderSectionTabs(route);
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
    for (const a of areas()) {
      const b = $(`#nav [data-area-badge="${CSS.escape(a.section)}"]`); if (!b) continue;
      const n = a.items.reduce((t, i) => t + badgeOf(i), 0);
      if (String(n || '') !== b.textContent) { b.textContent = n || ''; b.classList.toggle('hidden', !n); }
    }
    $$('#section-tabs [data-badge]').forEach((b) => {
      const v = +(state.badges?.[b.dataset.badge] ?? 0) || 0;
      if (String(v || '') !== b.textContent) { b.textContent = v || ''; b.classList.toggle('hidden', !v); }
    });
  });
}

function syncCollapseIcon() {
  const c = $('#app-shell').classList.contains('collapsed');
  $('#nav-collapse-icon').textContent = c ? 'left_panel_open' : 'left_panel_close';
}
