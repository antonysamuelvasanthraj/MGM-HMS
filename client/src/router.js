/**
 * View router.
 *
 * Each route loads its live controller from client/src/views. Converted design
 * exports remain available as references and are never executed at runtime.
 */
import { $, esc, spinner } from './ui.js';
import { state, loadMeta, can } from './store.js';
import { NAV, titleFor, sectionFor } from './shell/nav.js';
import { markActive } from './shell/sidebar.js';
import { resetTopics, announce } from './ws.js';

let started = false;
let current = null;          // { route, dispose }
let navToken = 0;

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return render(path);
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  return render(path);
}

export function startRouter() {
  if (started) return render(location.pathname + location.search);
  started = true;
  window.addEventListener('popstate', () => render(location.pathname + location.search));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (e.defaultPrevented || e.button !== 0 || e.shiftKey || e.altKey || !a || a.target === '_blank' || a.hasAttribute('data-stub') || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
  return render(location.pathname + location.search);
}

function parse(path) {
  const [pathname, search] = path.split('?');
  const parts = pathname.split('/').filter(Boolean);
  const name = parts[0] || 'dashboard';
  return { name, params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(search || '')), route: `/${name}`, path };
}

export async function render(path) {
  const ctx = parse(path);
  const my = ++navToken;

  // tear down the previous view
  try { current?.dispose?.(); } catch (e) { console.error('[dispose]', e); }
  current = null;
  resetTopics();

  state.route = ctx.route;
  markActive(ctx.route);
  const title = titleFor(ctx.route);
  $('#page-title').textContent = title;
  $('#breadcrumb').innerHTML = `<span>${sectionFor(ctx.route) || 'MGM HMS'}</span>
    <span class="material-symbols-outlined text-[13px] opacity-50">chevron_right</span>
    <span class="text-on-surface">${title}</span>`;
  document.title = `${title} · MGM HMS`;

  const host = $('#view');
  const entries = NAV.flatMap(group => group.items).filter(item => item.route.split('?')[0] === ctx.route);
  if (entries.length && !entries.some(item => !item.perm || (Array.isArray(item.perm) ? item.perm.some(can) : can(item.perm)))) {
    host.innerHTML = `<div class="card p-6"><h2 class="text-headline-md">Access restricted</h2><p class="mt-2 text-on-surface-variant">Your role does not have access to this screen.</p><a href="/dashboard" class="btn-primary mt-4">Go to my dashboard</a></div>`;
    return;
  }
  host.innerHTML = spinner();

  // Only live controllers run; exported design scripts are reference material.
  let mod;
  try {
    if (!/^[a-z][a-z0-9-]*$/.test(ctx.name)) throw new Error('Unknown screen');
    mod = await import(`./views/${ctx.name}.js`);
  } catch (e) {
    if (my !== navToken) return;
    console.error(`[view ${ctx.name}]`, e);
    host.innerHTML = notFound(ctx.name);
    return;
  }
  if (my !== navToken) return;
  host.innerHTML = '<div class="view-root"></div>';
  host.scrollTop = 0;
  window.scrollTo(0, 0);
  announce(ctx.route);
  if (mod?.mount) {
    try {
      // Staff and tariffs may have changed on another desk since sign-in.
      await loadMeta(true);
      if (my !== navToken) return;
      const dispose = await mod.mount({ ...ctx, host, root: host.querySelector('.view-root') || host });
      if (my !== navToken) { if (typeof dispose === 'function') dispose(); return; }
      current = { route: ctx.route, dispose: typeof dispose === 'function' ? dispose : null };
    } catch (e) {
      if (my !== navToken) return;
      console.error(`[mount ${ctx.name}]`, e);
      host.innerHTML = `<div class="p-6"><h2 class="text-headline-md">Could not load ${esc(title)}</h2>
        <p class="mt-2 text-on-surface-variant">${esc(e.message)}</p><button class="btn-primary mt-4" data-retry>Try again</button></div>`;
      host.querySelector('[data-retry]').onclick = () => render(path);
    }
  } else {
    host.innerHTML = notFound(ctx.name);
  }
}

function notFound(name) {
  return `<div class="grid place-items-center py-24 text-center">
    <span class="material-symbols-outlined text-[44px] text-on-surface-variant/40">explore_off</span>
    <div class="font-headline-md text-headline-md mt-2">No screen at /${esc(name)}</div>
    <p class="text-body-lg text-on-surface-variant mt-1">Pick a module from the sidebar.</p>
    <a href="/dashboard" class="btn-primary mt-4">Go to my dashboard</a>
  </div>`;
}

export const currentRoute = () => state.route;
