/**
 * Patient messages: report-ready notices and due reminders. With an SMS /
 * WhatsApp gateway configured (Hospital Settings) they go out automatically;
 * without one, press WhatsApp to open the chat with the text filled in, send
 * it, then mark it sent.
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, qs, esc, bind, toast, modal, fmtDateTime, pill, apiError, busy, patientPicker, kpi } from './_kit.js';

let f = { status: '' };
export const waLink = (number, text) => `https://wa.me/${encodeURIComponent(number || '')}?text=${encodeURIComponent(text || '')}`;

export async function mount(ctx) {
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Communication', 'sms')} ${liveChip()}`, title: 'Patient Messages',
    subtitle: 'Report-ready notices and due reminders. They send automatically when an SMS / WhatsApp gateway is set in Hospital Settings; otherwise send each one through WhatsApp and mark it sent.',
    actions: '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New message</button>',
    body: '<div data-kpis class="grid grid-cols-2 md:grid-cols-4 gap-3"></div><div data-list></div>',
  }));
  let d;
  async function load() {
    d = await api.get(`/messages${qs(f)}`);
    const c = d.counts || {};
    root.querySelector('[data-kpis]').innerHTML = [
      { label: 'Waiting to send', value: c.queued || 0, icon: 'schedule_send', tone: c.queued ? 'warning' : 'success', sub: d.gateway ? 'Gateway sends every minute' : 'No gateway — send by WhatsApp' },
      { label: 'Sent', value: c.sent || 0, icon: 'mark_chat_read', tone: 'success' },
      { label: 'Failed', value: c.failed || 0, icon: 'sms_failed', tone: c.failed ? 'danger' : 'neutral', sub: 'Retry or send by WhatsApp' },
      { label: 'Gateway', value: d.gateway ? 'On' : 'Off', icon: 'router', tone: d.gateway ? 'success' : 'neutral', sub: 'Hospital Settings → Messages' },
    ].map(kpi).join('');
    root.querySelector('[data-list]').innerHTML = card({ title: 'Messages', pad: false,
      actions: `<div class="inline-flex p-0.5 rounded bg-surface-container">${[['', 'All'], ['queued', 'Waiting'], ['sent', 'Sent'], ['failed', 'Failed']].map(([k, l]) => `<button type="button" data-f="${k}"
        class="px-3 h-8 rounded font-label-md text-label-md ${k === f.status ? 'bg-white shadow-sm' : 'text-on-surface-variant'}">${l}</button>`).join('')}</div>`,
      body: `<div class="overflow-auto max-h-[64vh]"><table class="tbl"><thead><tr><th>When</th><th>Patient</th><th>Mobile</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
        ${d.rows.map((m) => `<tr><td class="text-body-sm whitespace-nowrap">${fmtDateTime(m.created_at)}</td>
          <td>${esc(m.patient_name)}<div class="font-data-mono text-label-sm text-on-surface-variant">${esc(m.uhid)}</div></td>
          <td class="font-data-mono text-body-sm">${esc(m.mobile || '—')}</td><td class="text-body-md max-w-[420px]">${esc(m.body)}</td>
          <td>${pill(m.status === 'queued' ? 'pending' : m.status === 'sent' ? 'verified' : 'rejected', m.status === 'queued' ? 'Waiting' : m.status === 'sent' ? `Sent${m.sent_via ? ` · ${m.sent_via}` : ''}` : 'Failed')}
            ${m.error ? `<div class="text-label-sm text-danger max-w-[200px] truncate" title="${esc(m.error)}">${esc(m.error)}</div>` : ''}</td>
          <td class="text-right whitespace-nowrap">${m.status !== 'sent' && m.wa_number ? `<a class="btn-secondary btn-xs" target="_blank" rel="noopener" href="${waLink(m.wa_number, m.body)}" data-wa="${m.id}">WhatsApp</a>
            <button class="btn-ghost btn-xs" data-sent="${m.id}">Mark sent</button>` : ''}${m.status === 'failed' && d.gateway ? `<button class="btn-ghost btn-xs" data-retry="${m.id}">Retry</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="6" class="text-center py-10 text-on-surface-variant">No messages.</td></tr>'}</tbody></table></div>` });
  }
  bind(root, 'click', '[data-f]', (e, b) => { f.status = b.dataset.f; load(); });
  bind(root, 'click', '[data-sent]', async (e, b) => { try { await api.post(`/messages/${b.dataset.sent}/sent`, { via: 'whatsapp' }); load(); } catch (err) { apiError(err); } });
  bind(root, 'click', '[data-retry]', async (e, b) => { try { await api.post(`/messages/${b.dataset.retry}/retry`, {}); toast('Queued again', 'success'); load(); } catch (err) { apiError(err); } });
  bind(root, 'click', '[data-new]', () => newMessage(load));
  await load();
  return live({ topics: ['messages'], events: ['message.queued', 'message.sent'], load, interval: 60000 });
}

function newMessage(after) {
  let picked = null;
  modal({
    title: 'New patient message', size: 'md',
    body: `<div class="space-y-3"><div><label class="field-label">Patient *</label><div data-picker></div></div>
      <div><label class="field-label">Message *</label><textarea class="field" rows="4" data-body maxlength="900" placeholder="e.g. Your follow-up with Dr. … is due on …"></textarea></div></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Queue message</button>',
    onMount(root, close) {
      patientPicker(root.querySelector('[data-picker]'), (p) => { picked = p; }, { autofocus: true });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const body = root.querySelector('[data-body]').value.trim();
        if (!picked || !body) { toast('Choose the patient and write the message', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { await api.post('/messages', { patient_id: picked.id, body }); close(); toast('Message queued', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}
