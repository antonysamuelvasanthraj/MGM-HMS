/** My access & system diagnostics — what this account can do, and why. */
import {
  page, eyebrow, liveChip, kpiRow, live, mountPage, card,
  api, state, can, navigate,
  $, $$, esc, bind, toast, renderRows, pill, fmtDateTime, ago, kpi, titleCase, emptyState, mins,
} from './_kit.js';
import { NAV } from '../shell/nav.js';
import { wsState } from '../ws.js';
import { summary as auditSummary } from './audit.js';

/** An audit row's detail in plain words, never raw JSON. */
function plainDetail(d) {
  let x = d;
  if (typeof d === 'string') { try { x = JSON.parse(d); } catch { return d; } }
  if (!x || typeof x !== 'object') return String(x ?? '');
  return auditSummary({ before: x.before, after: x.after, detail: x }) || '';
}

export async function mount(ctx) {
  const root = mountPage(ctx, `<div class="p-6"></div>`);

  async function load() {
    const [acc, health] = await Promise.all([api.get('/admin/access/me'), api.get('/system/health')]);
    root.innerHTML = view(acc, health);
    bind(root, 'click', '[data-go]', (e, b) => navigate(b.dataset.go));
  }

  return live({ topics: ['system'], events: ['user.saved', 'presence'], load, interval: 60000 });
}

function view(acc, health) {
  const u = acc.user;
  const reachable = NAV.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section })))
    .map((i) => ({ ...i, allowed: !i.perm || can(i.perm) }));
  const allowedCount = reachable.filter((i) => i.allowed).length;

  return page({
    eyebrow: `${eyebrow('Diagnostics', 'key')} ${liveChip()}`,
    title: 'My Access & Diagnostics',
    subtitle: 'Exactly what this account can reach, the permissions behind it, and whether this workstation is healthy.',
    body: `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[{ label: 'Role', value: titleCase(u.role), icon: 'shield' },
           { label: 'Screens available', value: `${allowedCount} of ${reachable.length}`, icon: 'apps', tone: 'info' },
           { label: 'Permissions held', value: acc.perms.includes('*') ? 'All' : acc.perms.length, icon: 'key', tone: 'success' },
           { label: 'Realtime link', value: wsState.status, icon: wsState.status === 'live' ? 'lan' : 'wifi_off',
             tone: wsState.status === 'live' ? 'success' : 'danger', sub: `${health.stations_online} desks online` }].map(kpi).join('')}
      </div>

      ${card({ title: 'Who you are signed in as', body: `
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 text-body-lg">
          ${[['Name', u.name], ['Staff code', u.staff_code], ['Role', titleCase(u.role)],
             ['Designation', u.designation || '—'], ['Qualification', u.qualification || '—'],
             ['Council registration', u.reg_no || '—'], ['Counter', u.counter_id ? `#${u.counter_id}` : 'Not at a cash desk'],
             ['Consultation fee', u.op_fee ? `₹${u.op_fee}` : 'Not a consulting doctor']]
            .map(([k, v]) => `<div class="grid grid-cols-[170px_1fr] py-1.5 border-b border-outline-variant/60">
              <dt class="text-on-surface-variant">${k}</dt><dd>${esc(String(v))}</dd></div>`).join('')}
        </dl>` })}

      ${card({ title: 'What you can reach', subtitle: 'Greyed rows are hidden from your sidebar', body: `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${NAV.map((g) => {
            const items = g.items.map((i) => ({ ...i, allowed: !i.perm || can(i.perm) }));
            return `<div>
              <div class="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant mb-1.5">${esc(g.section)}</div>
              <ul class="space-y-1">${items.map((i) => `
                <li class="flex items-center gap-2 text-body-md ${i.allowed ? '' : 'opacity-45'}">
                  <span class="material-symbols-outlined text-[15px] ${i.allowed ? 'text-success' : 'text-on-surface-variant'}">
                    ${i.allowed ? 'check_circle' : 'lock'}</span>
                  ${i.allowed ? `<button class="hover:underline text-left" data-go="${i.route}">${esc(i.label)}</button>`
                    : `<span>${esc(i.label)}</span>`}
                  ${i.perm ? `<span class="font-data-mono text-label-sm text-on-surface-variant ml-auto min-w-0 break-all text-right">${esc(String(i.perm).replace(/,/g, ", "))}</span>` : ''}
                </li>`).join('')}</ul></div>`;
          }).join('')}
        </div>` })}

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        ${card({ title: 'Permissions on your role', body: acc.perms.includes('*')
          ? `<p class="text-body-lg">This role is unrestricted — every permission is granted.</p>`
          : `<div class="flex flex-wrap gap-1.5">${acc.perms.map((p) => `<span class="pill-neutral">${esc(p)}</span>`).join('')}</div>` })}
        ${card({ title: 'This workstation', body: `
          <dl class="space-y-2 text-body-lg">
            ${[['Server', health.db], ['LAN address', health.lan_ip], ['Cloud endpoint', health.cloud_endpoint],
               ['Server uptime', mins(health.uptime_s / 60)], ['Queued for sync', health.sync_queued],
               ['Failed sync', health.sync_failed], ['Browser', navigator.userAgent.split(') ')[0] + ')'],
               ['Screen', `${window.screen.width} × ${window.screen.height}`]]
              .map(([k, v]) => `<div class="flex items-start justify-between gap-3">
                <span class="text-on-surface-variant">${k}</span>
                <span class="font-data-mono text-right max-w-[60%] truncate" title="${esc(String(v))}">${esc(String(v))}</span></div>`).join('')}
          </dl>` })}
      </div>

      ${card({ title: 'Your recent activity', subtitle: 'Everything you do is recorded against your account', pad: false,
        body: acc.recent.length ? `<div class="overflow-auto max-h-[40vh]"><table class="tbl">
          <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>${acc.recent.map((a) => `<tr>
            <td class="text-body-sm">${fmtDateTime(a.at)}</td>
            <td><span class="pill-neutral">${esc(a.action)}</span></td>
            <td class="text-body-md">${esc(a.entity || '—')}${a.entity_id ? ` #${a.entity_id}` : ''}</td>
            <td class="text-body-sm text-on-surface-variant truncate max-w-[320px]">${esc(plainDetail(a.detail))}</td></tr>`).join('')}
          </tbody></table></div>` : `<div class="p-4">${emptyState('history', 'No activity yet', '')}</div>` })}

      ${card({ title: 'Active sessions', pad: false, body: acc.sessions.length ? `<table class="tbl">
        <thead><tr><th>Token</th><th>Signed in</th><th>Last seen</th><th>Address</th><th>Agent</th></tr></thead>
        <tbody>${acc.sessions.map((s) => `<tr>
          <td class="font-data-mono text-body-sm">${esc(s.token)}</td>
          <td class="text-body-sm">${fmtDateTime(s.created_at)}</td>
          <td class="text-body-sm">${ago(s.last_seen)}</td>
          <td class="font-data-mono text-body-sm">${esc(s.ip || '—')}</td>
          <td class="text-body-sm text-on-surface-variant truncate max-w-[280px]">${esc(s.agent || '')}</td></tr>`).join('')}
        </tbody></table>` : `<p class="p-4 text-body-md text-on-surface-variant">No other sessions.</p>` })}`,
  });
}
