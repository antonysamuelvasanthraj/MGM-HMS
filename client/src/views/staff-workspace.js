/**
 * Team chat & tasks. Conversations: the hospital-wide "All staff" channel, direct messages
 * to any colleague with a login, and groups (members picked by name or a whole department).
 * Messages are retained — they can be edited for 15 minutes and every earlier version stays
 * in the history management can review. Tasks are assigned by in-charges and reviewed by management.
 */
import { api, state, page, card, mountPage, live, esc, modal, toast, apiError, busy, fmtDateTime, titleCase } from './_kit.js';

export async function mount(ctx) {
  const root = mountPage(ctx, page({
    wide: true,
    title: 'Team chat & tasks',
    subtitle: 'Message the whole hospital, any colleague, or a group. Chats are retained: messages can be edited for 15 minutes and earlier versions stay on record.',
    body: `<div class="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_360px] gap-4 items-start">
      ${card({ title: 'Chats', pad: false,
        actions: '<button class="btn-secondary btn-xs" data-new-direct>New message</button><button class="btn-primary btn-xs" data-new-group>New group</button>',
        body: '<div data-threads class="max-h-[68vh] overflow-auto"></div>' })}
      <section class="card flex flex-col min-h-[60vh]">
        <header class="flex items-center justify-between gap-3 px-4 h-12 border-b border-outline-variant">
          <div class="min-w-0"><h2 class="panel-title truncate" data-thread-title>All staff</h2><p class="text-body-sm text-on-surface-variant truncate" data-thread-sub></p></div>
          <div class="flex items-center gap-2 shrink-0" data-thread-actions></div>
        </header>
        <div data-chat class="flex-1 overflow-auto p-4 space-y-3 max-h-[58vh]"></div>
        <form data-message class="p-3 border-t border-outline-variant flex gap-2">
          <textarea class="field flex-1" name="body" rows="1" maxlength="4000" required placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"></textarea>
          <button class="btn-primary">Send</button></form>
      </section>
      ${card({ title: 'Tasks & review', className: 'lg:col-span-2 2xl:col-span-1', body: '<button data-new-task class="btn-primary mb-3 hidden">Assign task</button><div data-tasks class="space-y-3 max-h-[64vh] overflow-auto"></div>' })}
    </div>`,
  }));
  const q = (s) => root.querySelector(s);
  let people = { rows: [], departments: [] }, threads = [], chat = [], before = null, tasks = [];
  let current = ctx?.query?.thread ? String(ctx.query.thread) : 'all';
  let thread = null;   // details of the open group / direct conversation

  const threadKey = (t) => (t.id === null ? 'all' : String(t.id));
  const preview = (t) => t.last ? `${esc(t.last.sender)}: ${esc(t.last.body.slice(0, 60))}` : '<span class="italic">No messages yet</span>';
  const icon = (k) => ({ all: 'campaign', group: 'groups', direct: 'person' })[k];

  function paintThreads() {
    q('[data-threads]').innerHTML = threads.map((t) => `<button type="button" data-thread="${threadKey(t)}"
        class="w-full text-left px-3 py-2.5 border-b border-outline-variant/60 flex gap-3 items-start hover:bg-surface-container-low ${threadKey(t) === current ? 'bg-surface-container-low' : ''}">
        <span class="material-symbols-outlined text-[20px] text-on-surface-variant mt-0.5">${icon(t.kind)}</span>
        <span class="min-w-0 flex-1"><span class="flex items-center justify-between gap-2"><span class="font-label-lg text-label-lg truncate">${esc(t.name)}</span>
          ${t.unread ? `<span class="pill-danger !px-1.5 !py-0 text-[11px]">${t.unread}</span>` : ''}</span>
          <span class="block text-body-sm text-on-surface-variant truncate">${preview(t)}</span>
          ${t.kind === 'group' ? `<span class="block text-label-sm text-on-surface-variant">${t.members} members${t.is_admin ? ' · you manage this group' : ''}</span>` : ''}</span></button>`).join('');
  }

  function paintChat(keepScroll) {
    const box = q('[data-chat]');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const t = threads.find((x) => threadKey(x) === current) || threads[0];
    q('[data-thread-title]').textContent = t?.name || 'All staff';
    q('[data-thread-sub]').textContent = current === 'all' ? `Everyone with a login (${t?.members || ''}) sees this channel`
      : thread?.kind === 'group' ? thread.members.map((m) => m.name).join(', ')
      : thread ? (thread.members.find((m) => m.id !== state.user.id)?.designation || '') : '';
    q('[data-thread-actions]').innerHTML = thread?.kind === 'group' ? '<button class="btn-secondary btn-xs" data-members>Members</button>' : '';
    box.innerHTML = `${chat.length === 100 ? '<div class="text-center"><button data-older class="btn-secondary btn-xs">Earlier messages</button></div>' : ''}
      ${before ? '<div class="text-center"><button data-latest class="btn-secondary btn-xs">Back to latest</button></div>' : ''}
      ${chat.map((m) => {
        const me = m.user_id === state.user.id;
        return `<div class="flex ${me ? 'justify-end' : 'justify-start'}"><div class="max-w-[78%] rounded-lg px-3 py-2 ${me ? 'bg-info-bg' : 'bg-surface-container-low'}">
          <div class="text-label-sm text-on-surface-variant">${me ? 'You' : `<b>${esc(m.sender)}</b> · ${esc(m.sender_designation || titleCase(m.sender_role || ''))}`} · ${fmtDateTime(m.created_at)}${m.edited_at ? ' · edited' : ''}</div>
          <p class="whitespace-pre-wrap my-1 text-body-md">${esc(m.body)}</p>
          ${me ? `<button class="btn-ghost btn-xs" data-edit="${m.id}">Edit</button>` : ''}${people.can_review && m.edited_at ? `<button class="btn-ghost btn-xs" data-history="${m.id}">Edit history</button>` : ''}
        </div></div>`;
      }).join('') || '<p class="text-center text-on-surface-variant py-10">No messages yet — say hello.</p>'}`;
    if (!keepScroll || atBottom) box.scrollTop = box.scrollHeight;
  }

  function paintTasks() {
    q('[data-new-task]').classList.toggle('hidden', !people.can_assign);
    q('[data-tasks]').innerHTML = tasks.map((t) => `<div class="rounded border border-outline-variant p-3"><strong>${esc(t.title)}</strong> · ${esc(titleCase(t.status))}
      <p class="text-body-sm">${esc(t.assigner)} → ${esc(t.assignee)} · due ${esc(t.due_at || 'not set')}</p><p class="whitespace-pre-wrap text-body-md">${esc(t.description || '')}</p>
      <p class="text-body-sm">${esc(t.progress_note || '')}</p>${t.reviewer ? `<p class="text-body-sm">Reviewed by ${esc(t.reviewer)} · ${esc(t.reviewed_at)}</p>` : ''}
      ${t.status !== 'reviewed' ? `<button class="btn-secondary btn-xs" data-task="${t.id}" data-status="${t.status === 'completed' && people.can_review ? 'reviewed' : t.status === 'open' ? 'in_progress' : 'completed'}">${t.status === 'completed' && people.can_review ? 'Review' : 'Update progress'}</button>` : ''}</div>`).join('') || '<p class="text-on-surface-variant">No tasks assigned.</p>';
  }

  async function openThread(key, { quiet = false } = {}) {
    current = key; before = quiet ? before : null;
    thread = key === 'all' ? null : await api.get(`/staff-work/threads/${key}`);
    chat = await api.get(`/staff-work/chat?thread=${key}${before ? `&before=${before}` : ''}`);
    paintThreads(); paintChat(quiet);
    const last = chat[chat.length - 1];
    if (last && !before) {
      await api.post(`/staff-work/threads/${key}/read`, { last_id: last.id }).catch(() => {});
      const t = threads.find((x) => threadKey(x) === key); if (t && t.unread) { t.unread = 0; paintThreads(); }
    }
  }

  async function load(context = {}) {
    [people, threads, tasks] = await Promise.all([api.get('/staff-work/people'), api.get('/staff-work/threads'), api.get('/staff-work/tasks')]);
    if (!threads.some((t) => threadKey(t) === current)) current = 'all';
    paintTasks();
    await openThread(current, { quiet: !!context.live });
  }

  /* --------------------------------------------------- people picker (direct, group, add members) */
  function picker({ title, multi, withName = false, exclude = [], confirm, onDone }) {
    const chosen = new Set(), depts = new Set();
    const list = (filter, dept) => people.rows.filter((p) => p.id !== state.user.id && !exclude.includes(p.id)
      && (!dept || String(p.department_id) === dept)
      && (!filter || `${p.name} ${p.designation || ''} ${p.role} ${p.dept_name || ''}`.toLowerCase().includes(filter.toLowerCase())));
    modal({
      title, size: 'lg',
      body: `${withName ? '<label class="field-label">Group name *</label><input class="field mb-3" data-name maxlength="80" placeholder="e.g. Night shift — ICU & pharmacy">' : ''}
        ${multi ? `<label class="field-label">Add whole departments</label><div class="flex flex-wrap gap-2 mb-3">${people.departments.map((d) => `<label class="inline-flex items-center gap-1.5 text-body-sm border border-outline-variant rounded px-2 py-1"><input type="checkbox" data-dept="${d.id}"> ${esc(d.name)} <span class="text-on-surface-variant">(${d.staff})</span></label>`).join('')}</div>` : ''}
        <div class="flex flex-wrap gap-2 mb-2"><input class="field flex-1 min-w-[200px]" data-filter placeholder="Search name, designation or department">
          <select class="field w-[220px]" data-dept-filter><option value="">Every department</option>${people.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
        <div data-list class="max-h-[42vh] overflow-auto border border-outline-variant rounded"></div>
        ${multi ? '<p class="text-body-sm text-on-surface-variant mt-2" data-count></p>' : ''}`,
      footer: `<button class="btn-secondary" data-close>Cancel</button>${multi ? `<button class="btn-primary" data-ok>${esc(confirm)}</button>` : ''}`,
      onMount(el, close) {
        const paint = () => {
          const rows = list(el.querySelector('[data-filter]').value, el.querySelector('[data-dept-filter]').value);
          el.querySelector('[data-list]').innerHTML = rows.map((p) => `<label class="flex items-center gap-3 px-3 py-2 border-b border-outline-variant/60 hover:bg-surface-container-low cursor-pointer" data-person="${p.id}">
            ${multi ? `<input type="checkbox" ${chosen.has(p.id) ? 'checked' : ''}>` : '<span class="material-symbols-outlined text-[18px] text-on-surface-variant">chat</span>'}
            <span class="flex-1"><span class="font-label-lg text-label-lg">${esc(p.name)}</span><span class="block text-label-sm text-on-surface-variant">${esc(p.designation || titleCase(p.role))}${p.dept_name ? ` · ${esc(p.dept_name)}` : ''}</span></span></label>`).join('')
            || '<p class="p-4 text-on-surface-variant">Nobody matches.</p>';
          const c = el.querySelector('[data-count]');
          if (c) c.textContent = `${chosen.size} people and ${depts.size} whole department(s) chosen`;
        };
        el.querySelector('[data-filter]').addEventListener('input', paint);
        el.querySelector('[data-dept-filter]').addEventListener('change', paint);
        el.querySelector('[data-list]').addEventListener('click', async (ev) => {
          const row = ev.target.closest('[data-person]'); if (!row) return;
          const id = +row.dataset.person;
          if (!multi) { ev.preventDefault(); close(); await onDone({ user_id: id }); return; }
          if (ev.target.tagName !== 'INPUT') return;
          ev.target.checked ? chosen.add(id) : chosen.delete(id); paint();
        });
        el.querySelectorAll('[data-dept]').forEach((cb) => cb.addEventListener('change', () => { cb.checked ? depts.add(+cb.dataset.dept) : depts.delete(+cb.dataset.dept); paint(); }));
        el.querySelector('[data-ok]')?.addEventListener('click', async (ev) => {
          const b = ev.currentTarget; busy(b, true);
          try { await onDone({ name: el.querySelector('[data-name]')?.value, member_ids: [...chosen], department_ids: [...depts] }); close(); }
          catch (e) { apiError(e); busy(b, false); }
        });
        paint();
      },
    });
  }

  q('[data-new-direct]').onclick = () => picker({ title: 'Message a colleague', multi: false,
    onDone: async ({ user_id }) => { try { const t = await api.post('/staff-work/direct', { user_id }); threads = await api.get('/staff-work/threads'); await openThread(String(t.id)); } catch (e) { apiError(e); } } });
  q('[data-new-group]').onclick = () => picker({ title: 'New group', multi: true, withName: true, confirm: 'Create group',
    onDone: async (b) => { const t = await api.post('/staff-work/threads', b); toast(`Group "${t.name}" created`, 'success'); threads = await api.get('/staff-work/threads'); await openThread(String(t.id)); } });

  function membersDialog() {
    if (!thread) return;
    const admin = thread.is_admin;
    modal({
      title: thread.name, subtitle: `${thread.members.length} members`, size: 'md',
      body: `${admin ? `<label class="field-label">Group name</label><div class="flex gap-2 mb-3"><input class="field flex-1" data-rename value="${esc(thread.name)}" maxlength="80"><button class="btn-secondary" data-save-name>Rename</button></div>` : ''}
        <div class="border border-outline-variant rounded max-h-[46vh] overflow-auto">${thread.members.map((m) => `<div class="flex items-center gap-3 px-3 py-2 border-b border-outline-variant/60">
          <span class="flex-1"><span class="font-label-lg text-label-lg">${esc(m.name)}${m.id === state.user.id ? ' (you)' : ''}</span>
            <span class="block text-label-sm text-on-surface-variant">${esc(m.designation || titleCase(m.role))}${m.dept_name ? ` · ${esc(m.dept_name)}` : ''}${m.is_admin ? ' · group admin' : ''}</span></span>
          ${admin && m.id !== state.user.id ? `<button class="btn-ghost btn-xs" data-remove="${m.id}">Remove</button>` : ''}</div>`).join('')}</div>`,
      footer: `<button class="btn-secondary" data-leave>Leave group</button>${admin ? '<button class="btn-primary" data-add>Add people</button>' : ''}`,
      onMount(el, close) {
        el.querySelector('[data-save-name]')?.addEventListener('click', async () => { try { await api.patch(`/staff-work/threads/${thread.id}`, { name: el.querySelector('[data-rename]').value }); close(); await load(); } catch (e) { apiError(e); } });
        el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => { try { await api.del(`/staff-work/threads/${thread.id}/members/${b.dataset.remove}`); close(); await load(); } catch (e) { apiError(e); } }));
        el.querySelector('[data-leave]').addEventListener('click', async () => { try { await api.del(`/staff-work/threads/${thread.id}/members/${state.user.id}`); close(); current = 'all'; await load(); toast('You left the group', 'info'); } catch (e) { apiError(e); } });
        el.querySelector('[data-add]')?.addEventListener('click', () => { close(); picker({ title: `Add people to ${thread.name}`, multi: true, confirm: 'Add to group', exclude: thread.members.map((m) => m.id),
          onDone: async (b) => { await api.post(`/staff-work/threads/${thread.id}/members`, b); toast('Members added', 'success'); await load(); } }); });
      },
    });
  }

  /* ------------------------------------------------------------------ events */
  const form = q('[data-message]');
  const send = async () => {
    const input = form.querySelector('[name="body"]'), btn = form.querySelector('button');
    if (!input.value.trim()) return;
    btn.disabled = true;
    try { await api.post('/staff-work/chat', { body: input.value, thread_id: current === 'all' ? null : +current }); input.value = ''; before = null; threads = await api.get('/staff-work/threads'); await openThread(current); }
    catch (e) { apiError(e); } finally { btn.disabled = false; input.focus(); }
  };
  form.onsubmit = (e) => { e.preventDefault(); send(); };
  form.querySelector('[name="body"]').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  q('[data-new-task]').onclick = () => modal({ title: 'Assign a staff task',
    body: `<label class="field-label">Title</label><input data-title class="field" maxlength="4000"><label class="field-label mt-3">Assign to</label><select data-person class="field">${people.rows.filter(p => p.can_assign).map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(p.designation || titleCase(p.role))}${p.dept_name ? ` · ${esc(p.dept_name)}` : ''}</option>`).join('')}</select><label class="field-label mt-3">Due</label><input data-due type="datetime-local" class="field"><label class="field-label mt-3">Instructions</label><textarea data-description class="field"></textarea>`,
    footer: '<button data-save class="btn-primary">Assign task</button>',
    onMount(r, close) { r.querySelector('[data-save]').onclick = async (e) => { e.currentTarget.disabled = true; try { await api.post('/staff-work/tasks', { title: r.querySelector('[data-title]').value, assigned_to: +r.querySelector('[data-person]').value, due_at: r.querySelector('[data-due]').value, description: r.querySelector('[data-description]').value }); close(); await load(); } catch (err) { apiError(err); r.querySelector('[data-save]').disabled = false; } }; } });

  root.addEventListener('click', async (e) => {
    const th = e.target.closest('[data-thread]');
    if (th) { try { await openThread(th.dataset.thread); } catch (err) { apiError(err); } return; }
    if (e.target.closest('[data-members]')) { membersDialog(); return; }
    if (e.target.closest('[data-older]') || e.target.closest('[data-latest]')) { before = e.target.closest('[data-older]') ? chat[0]?.id : null; try { await openThread(current, { quiet: true }); } catch (err) { apiError(err); } return; }
    const edit = e.target.closest('[data-edit]'), history = e.target.closest('[data-history]'), task = e.target.closest('[data-task]');
    if (history) { try { const rows = await api.get(`/staff-work/chat/${history.dataset.history}/history`); modal({ title: 'Retained chat history', body: rows.map((r) => `<p class="mb-3 whitespace-pre-wrap">Version ${r.version} · ${esc(r.created_at)}<br>${esc(r.body)}</p>`).join('') || 'No earlier edits.' }); } catch (err) { apiError(err); } return; }
    if (!edit && !task) return;
    const m = edit ? chat.find((x) => x.id === +edit.dataset.edit) : null;
    modal({ title: edit ? 'Edit your message — the earlier text is retained' : 'Record task progress / review',
      body: `<textarea data-note class="field" rows="4" maxlength="4000">${esc(m?.body || '')}</textarea>`, footer: '<button data-save class="btn-primary">Save</button>',
      onMount(r, close) { r.querySelector('[data-save]').onclick = async (ev) => { ev.currentTarget.disabled = true; try { await api.patch(edit ? `/staff-work/chat/${m.id}` : `/staff-work/tasks/${task.dataset.task}`, edit ? { body: r.querySelector('[data-note]').value, version: m.version } : { status: task.dataset.status, progress_note: r.querySelector('[data-note]').value }); close(); await load(); } catch (err) { apiError(err); r.querySelector('[data-save]').disabled = false; } }; } });
  });

  return live({ topics: ['staff-work'], events: ['staff-work.changed'], load });
}
