/** Local server & hybrid cloud sync. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, live, mountPage, card,
  apiError, busy, api, qs, state, can, downloadCSV,
  $, $$, esc, bind, toast, confirmDialog, renderRows, pill, fmtDateTime, ago, kpi, mins, emptyState,
} from './_kit.js';
import { wsState } from '../ws.js';

let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());

  async function load() {
    const [d, health] = await Promise.all([api.get('/sync'), api.get('/system/health')]);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Queued for the cloud', value: d.counts.queued, icon: 'cloud_upload', tone: d.counts.queued ? 'warning' : 'success',
        sub: 'Waiting for the next push' },
      { label: 'Failed', value: d.counts.failed, icon: 'cloud_off', tone: d.counts.failed ? 'danger' : 'success', sub: 'Retry or investigate' },
      { label: 'Synced', value: d.counts.synced, icon: 'cloud_done', tone: 'success', sub: `${d.counts.today} queued today` },
      { label: 'Desks connected', value: health.stations_online, icon: 'dns', tone: 'info',
        sub: `Server up ${mins(health.uptime_s / 60)}` },
    ].map(kpi).join('');

    $('[data-node]', root).innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2.5">
          ${[['Hospital', d.node.hospital], ['Campus', d.node.campus],
             ['LAN address', d.node.lan_ip], ['Cloud endpoint', d.node.cloud_endpoint],
             ['Database', 'SQLite (write-ahead logging) on this machine'],
             ['Server uptime', mins(d.node.uptime_s / 60)]].map(([k, v]) => `
            <div class="flex items-start justify-between gap-3 text-body-lg">
              <span class="text-on-surface-variant">${k}</span>
              <span class="font-data-mono text-right">${esc(String(v ?? '—'))}</span></div>`).join('')}
        </div>
        <div class="space-y-3">
          <div class="p-3 rounded-lg border ${wsState.status === 'live' ? 'border-success/30 bg-success-bg' : 'border-danger/30 bg-danger-bg'}">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] ${wsState.status === 'live' ? 'text-success' : 'text-danger'}">
                ${wsState.status === 'live' ? 'lan' : 'wifi_off'}</span>
              <span class="font-title-md text-title-md ${wsState.status === 'live' ? 'text-success' : 'text-danger'}">
                Realtime link ${wsState.status}</span></div>
            <p class="text-body-md mt-1 ${wsState.status === 'live' ? 'text-success' : 'text-danger'}">
              ${wsState.status === 'live'
                ? `Every desk on the LAN is receiving live updates from this server (${wsState.clients} connected).`
                : 'This browser has lost the socket. Work is still possible; the page reconnects automatically.'}</p>
          </div>
          <div class="p-3 rounded-lg border border-outline-variant">
            <div class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">How this deployment works</div>
            <p class="text-body-md mt-1">Clinical work is written to the hospital's own server first, so the
              hospital keeps running when the internet does not. Changes are queued locally. A cloud receiver
              and delivery integration must be connected before remote backup is available.</p>
          </div>
        </div>
      </div>`;

    $('[data-entities]', root).innerHTML = d.byEntity.length ? `<table class="tbl">
      <thead><tr><th>Entity</th><th>Queued</th><th>Failed</th><th>Synced</th></tr></thead>
      <tbody>${[...new Set(d.byEntity.map((x) => x.entity))].map((ent) => {
        const g = (st) => d.byEntity.find((x) => x.entity === ent && x.status === st)?.n || 0;
        return `<tr><td class="font-label-lg text-label-lg">${esc(ent)}</td>
          <td class="num ${g('queued') ? 'text-warning font-semibold' : ''}">${g('queued')}</td>
          <td class="num ${g('failed') ? 'text-danger font-semibold' : ''}">${g('failed')}</td>
          <td class="num text-success">${g('synced')}</td></tr>`;
      }).join('')}</tbody></table>` : emptyState('cloud', 'Nothing queued', '');

    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'The sync queue is empty.' });
    $('[data-count]', root).textContent = `${d.rows.length} entries`;
  }

  bind(root, 'click', '[data-flush]', async (e, b) => {
    const r = await confirmDialog({ title: 'Push everything to the cloud?',
      message: 'All queued and failed records are sent to the configured endpoint.', confirmLabel: 'Push now' });
    if (!r) return;
    busy(b, true, 'Pushing');
    try { const res = await api.post('/sync/flush'); toast(`${res.synced} record(s) pushed`, 'success'); load(); }
    catch (err) { apiError(err); } finally { busy(b, false); }
  });
  bind(root, 'click', '[data-retry]', async (e, b) => {
    await api.post(`/sync/retry/${b.dataset.retry}`);
    toast('Record requeued for delivery', 'success'); load();
  });
  bind(root, 'click', '[data-export]', () => downloadCSV('sync-queue.csv', cache));

  return live({ topics: ['system'], events: ['sync.updated', 'presence', 'tick'], load, interval: 30000 });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Infrastructure', 'dns')} ${liveChip()}`,
    title: 'Local Server & Cloud Sync',
    subtitle: 'Local records are saved on this server. Cloud delivery is not connected in this working model; queued records have not been backed up remotely.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export queue</button>
      <span class="pill-warning">Cloud not connected</span>`,
    body: `
      ${kpiRow([], 4)}
      ${card({ title: 'This node', body: `<div data-node></div>` })}
      <div class="grid grid-cols-1 2xl:grid-cols-[1fr_1.4fr] gap-5 items-start">
        ${card({ title: 'By entity', pad: false, body: `<div data-entities></div>` })}
        ${tableCard({
          title: 'Sync queue', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '52vh',
          columns: [{ label: 'Entity' }, { label: 'Operation' }, { label: 'Queued' },
            { label: 'Attempts', cls: 'text-right' }, { label: 'Status' }, { label: 'Last error' }, { label: '', width: '80px' }],
        })}
      </div>`,
  });
}

function rowHTML(r) {
  return `
    <td><div class="font-label-lg text-label-lg">${esc(r.entity)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">#${r.entity_id ?? '—'}</div></td>
    <td><span class="pill-neutral capitalize">${esc(r.op)}</span></td>
    <td class="text-body-sm">${ago(r.queued_at)}</td>
    <td class="num ${r.attempts > 2 ? 'text-danger font-semibold' : ''}">${r.attempts}</td>
    <td>${pill(r.status)}</td>
    <td class="text-body-sm text-danger max-w-[220px] truncate" title="${esc(r.last_error || '')}">${esc(r.last_error || '—')}</td>
    <td class="text-right">${r.status !== 'synced' ? `<button class="btn-secondary btn-xs" data-retry="${r.id}">Retry</button>` : ''}</td>`;
}
