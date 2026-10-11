/**
 * Team chat & tasks. Every login can message the whole hospital ("All staff"),
 * any colleague directly, or a group they create (members picked by name or a
 * whole department at once). Messages are retained: they cannot be deleted,
 * edits keep every earlier version, and management may review edit history.
 * Realtime events carry ids only; each screen reloads what its login may read.
 */
import { Router } from 'express';
import { requireAuth, can, STAFF_TEAMS } from '../auth.js';
import { h, fail, all, get, one, insert, update, run, tx, emit, nowIso } from '../lib.js';

export const staffWork = Router();
staffWork.use('/staff-work', requireAuth);   // only this router's own paths; it is mounted at /api with the public routes

const reviewer = (u) => ['admin', 'owner'].includes(u.role) || can(u, 'admin.view');
const assigner = (u) => reviewer(u) || can(u, 'staff.manage') || ['manager', 'medical_superintendent'].includes(u.role);
const mayAssign = (u, target) => {
  if (reviewer(u)) return true;
  if (!assigner(u)) return false;
  if (target.id === u.id) return true;
  if (!(STAFF_TEAMS[u.role] || []).includes(target.role)) return false;
  return ['manager', 'medical_superintendent', 'hr'].includes(u.role) || (u.department_id && u.department_id === target.department_id);
};
const staffEvent = (req, action, entity, id, before, after, reason) => emit(req, { topics: ['staff-work', 'notifications'], event: 'staff-work.changed', data: { id },
  action, entity, entityId: id, detail: { before, after, reason: reason || after?.progress_note || 'Staff coordination' } });
const bodyText = (v) => { const s = String(v ?? '').trim(); if (!s || s.length > 4000) fail(400, 'text_required_max_4000'); return s; };

/* ------------------------------------------------------------- threads */

const member = (threadId, userId) => get('SELECT * FROM chat_members WHERE thread_id=? AND user_id=?', threadId, userId);
/** The thread a request names, after checking this login belongs to it. `null` = the hospital-wide All staff channel. */
function threadFor(req, raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'all') return null;
  const t = get('SELECT * FROM chat_threads WHERE id=?', +raw);
  if (!t) fail(404, 'conversation_not_found');
  if (!member(t.id, req.user.id)) fail(403, 'not_in_this_conversation');
  return t;
}
const readKey = (t) => (t ? String(t.id) : 'all');
const lastRead = (userId, key) => one('SELECT last_read_id FROM chat_reads WHERE user_id=? AND thread_key=?', userId, key) || 0;
const unread = (userId, t) => one(`SELECT count(*) FROM staff_chat WHERE ${t ? 'thread_id=?' : 'thread_id IS NULL'} AND id>? AND user_id<>?`,
  ...(t ? [t.id] : []), lastRead(userId, readKey(t)), userId) || 0;

/** Unread messages across every conversation this login is in (the sidebar count). */
export function unreadTotal(userId) {
  const threads = all('SELECT t.* FROM chat_threads t JOIN chat_members m ON m.thread_id=t.id WHERE m.user_id=?', userId);
  return unread(userId, null) + threads.reduce((s, t) => s + unread(userId, t), 0);
}

/** Active users chosen by name and / or whole departments. */
function pickUsers(b) {
  const ids = new Set((b.member_ids || b.user_ids || []).map(Number).filter(Boolean));
  const depts = (b.department_ids || []).map(Number).filter(Boolean);
  if (depts.length) for (const u of all(`SELECT id FROM users WHERE active=1 AND department_id IN (${depts.map(() => '?').join(',')})`, ...depts)) ids.add(u.id);
  const ok = ids.size ? all(`SELECT id FROM users WHERE active=1 AND id IN (${[...ids].map(() => '?').join(',')})`, ...ids).map((u) => u.id) : [];
  return ok;
}

function threadView(req, t) {
  const members = all(`SELECT m.user_id id, m.is_admin, u.name, u.role, u.designation, d.name dept_name FROM chat_members m JOIN users u ON u.id=m.user_id
    LEFT JOIN departments d ON d.id=u.department_id WHERE m.thread_id=? ORDER BY m.is_admin DESC, u.name`, t.id);
  const other = t.kind === 'direct' ? members.find((m) => m.id !== req.user.id) : null;
  return { ...t, name: t.kind === 'direct' ? (other?.name || 'Direct message') : t.name, members, is_admin: !!members.find((m) => m.id === req.user.id && m.is_admin) };
}

staffWork.get('/staff-work/people', h((req) => ({
  can_assign: assigner(req.user), can_review: reviewer(req.user),
  rows: all(`SELECT u.id, u.name, u.role, u.designation, u.department_id, d.name dept_name FROM users u
    LEFT JOIN departments d ON d.id=u.department_id WHERE u.active=1 ORDER BY u.name`).map(u => ({...u, can_assign: mayAssign(req.user,u)})),
  departments: all(`SELECT d.id, d.name, count(u.id) staff FROM departments d JOIN users u ON u.department_id=d.id AND u.active=1
    GROUP BY d.id ORDER BY d.name`),
})));

/** Every conversation of this login, newest activity first, with its unread count and last message. */
staffWork.get('/staff-work/threads', h((req) => {
  const last = (t) => get(`SELECT c.id, c.body, c.created_at, u.name sender FROM staff_chat c JOIN users u ON u.id=c.user_id
    WHERE ${t ? 'c.thread_id=?' : 'c.thread_id IS NULL'} ORDER BY c.id DESC LIMIT 1`, ...(t ? [t.id] : []));
  const mine = all(`SELECT t.* FROM chat_threads t JOIN chat_members m ON m.thread_id=t.id WHERE m.user_id=? AND t.archived=0`, req.user.id)
    .map((t) => { const v = threadView(req, t); return { id: t.id, kind: t.kind, name: v.name, members: v.members.length, is_admin: v.is_admin, unread: unread(req.user.id, t), last: last(t) }; });
  mine.sort((a, b) => (b.last?.id || 0) - (a.last?.id || 0) || b.id - a.id);
  return [{ id: null, key: 'all', kind: 'all', name: 'All staff', members: one('SELECT count(*) FROM users WHERE active=1'), unread: unread(req.user.id, null), last: last(null) }, ...mine];
}));

staffWork.get('/staff-work/threads/:id', h((req) => threadView(req, threadFor(req, req.params.id))));

/** A group: a name plus members chosen by name and / or whole departments. The creator manages it. */
staffWork.post('/staff-work/threads', h((req) => tx(() => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 80) fail(400, 'group_name_required');
  const ids = pickUsers(req.body || []).filter((id) => id !== req.user.id);
  if (!ids.length) fail(400, 'choose_group_members');
  const id = insert('chat_threads', { kind: 'group', name, created_by: req.user.id });
  insert('chat_members', { thread_id: id, user_id: req.user.id, is_admin: 1, added_by: req.user.id });
  for (const uid of ids) insert('chat_members', { thread_id: id, user_id: uid, is_admin: 0, added_by: req.user.id });
  for (const uid of ids) insert('notifications', { user_id: uid, title: `Added to the group "${name}"`, body: `by ${req.user.name}`, link: `/staff-workspace?thread=${id}` });
  const t = get('SELECT * FROM chat_threads WHERE id=?', id);
  staffEvent(req, 'chat.group.create', 'chat_threads', id, null, { name, members: ids.length + 1 }, 'Group created');
  return threadView(req, t);
})));

/** Direct conversation with one colleague — the same thread every time. */
staffWork.post('/staff-work/direct', h((req) => tx(() => {
  const other = get('SELECT id, name FROM users WHERE id=? AND active=1', +req.body?.user_id);
  if (!other) fail(400, 'active_colleague_required');
  if (other.id === req.user.id) fail(400, 'choose_someone_else');
  const key = [req.user.id, other.id].sort((a, b) => a - b).join('-');
  let t = get('SELECT * FROM chat_threads WHERE direct_key=?', key);
  if (!t) {
    const id = insert('chat_threads', { kind: 'direct', direct_key: key, created_by: req.user.id });
    insert('chat_members', { thread_id: id, user_id: req.user.id, is_admin: 0, added_by: req.user.id });
    insert('chat_members', { thread_id: id, user_id: other.id, is_admin: 0, added_by: req.user.id });
    t = get('SELECT * FROM chat_threads WHERE id=?', id);
    staffEvent(req, 'chat.direct.start', 'chat_threads', id, null, { with: other.id }, 'Direct conversation started');
  }
  return threadView(req, t);
})));

staffWork.patch('/staff-work/threads/:id', h((req) => tx(() => {
  const t = threadFor(req, req.params.id);
  if (t.kind !== 'group') fail(409, 'only_groups_can_be_renamed');
  if (!member(t.id, req.user.id).is_admin) fail(403, 'group_admin_only');
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 80) fail(400, 'group_name_required');
  update('chat_threads', t.id, { name });
  staffEvent(req, 'chat.group.rename', 'chat_threads', t.id, { name: t.name }, { name }, 'Group renamed');
  return threadView(req, get('SELECT * FROM chat_threads WHERE id=?', t.id));
})));

staffWork.post('/staff-work/threads/:id/members', h((req) => tx(() => {
  const t = threadFor(req, req.params.id);
  if (t.kind !== 'group') fail(409, 'only_groups_take_members');
  if (!member(t.id, req.user.id).is_admin) fail(403, 'group_admin_only');
  const ids = pickUsers(req.body || {}).filter((id) => !member(t.id, id));
  if (!ids.length) fail(400, 'choose_new_members');
  for (const uid of ids) {
    insert('chat_members', { thread_id: t.id, user_id: uid, is_admin: 0, added_by: req.user.id });
    insert('notifications', { user_id: uid, title: `Added to the group "${t.name}"`, body: `by ${req.user.name}`, link: `/staff-workspace?thread=${t.id}` });
  }
  staffEvent(req, 'chat.group.add', 'chat_threads', t.id, null, { added: ids }, 'Members added');
  return threadView(req, t);
})));

/** A group admin removes a member, or a member leaves. The group always keeps an admin. */
staffWork.delete('/staff-work/threads/:id/members/:userId', h((req) => tx(() => {
  const t = threadFor(req, req.params.id);
  if (t.kind !== 'group') fail(409, 'only_groups_have_members');
  const uid = +req.params.userId;
  if (uid !== req.user.id && !member(t.id, req.user.id).is_admin) fail(403, 'group_admin_only');
  if (!member(t.id, uid)) fail(404, 'not_a_member');
  run('DELETE FROM chat_members WHERE thread_id=? AND user_id=?', t.id, uid);
  if (!one('SELECT count(*) FROM chat_members WHERE thread_id=? AND is_admin=1', t.id)) {
    const next = get('SELECT user_id FROM chat_members WHERE thread_id=? ORDER BY added_at, user_id LIMIT 1', t.id);
    if (next) run('UPDATE chat_members SET is_admin=1 WHERE thread_id=? AND user_id=?', t.id, next.user_id);
  }
  staffEvent(req, uid === req.user.id ? 'chat.group.leave' : 'chat.group.remove', 'chat_threads', t.id, { member: uid }, null, uid === req.user.id ? 'Left the group' : 'Member removed');
  return { ok: true };
})));

/** Mark a conversation read up to a message. */
staffWork.post('/staff-work/threads/:id/read', h((req) => {
  const t = threadFor(req, req.params.id);
  const key = readKey(t);
  const upTo = Math.max(+req.body?.last_id || 0, 0);
  const ex = get('SELECT * FROM chat_reads WHERE user_id=? AND thread_key=?', req.user.id, key);
  if (!ex) insert('chat_reads', { user_id: req.user.id, thread_key: key, last_read_id: upTo });
  else if (upTo > ex.last_read_id) run('UPDATE chat_reads SET last_read_id=? WHERE user_id=? AND thread_key=?', upTo, req.user.id, key);
  return { ok: true };
}));

/* ------------------------------------------------------------ messages */

staffWork.get('/staff-work/chat', h((req) => {
  const t = threadFor(req, req.query.thread);
  const before = req.query.before ? +req.query.before : null;
  if (before !== null && (!Number.isSafeInteger(before) || before < 1)) fail(400, 'chat_cursor_invalid');
  const where = [t ? 'c.thread_id=?' : 'c.thread_id IS NULL'], args = t ? [t.id] : [];
  if (before !== null) { where.push('c.id<?'); args.push(before); }
  return all(`SELECT c.*, u.name sender, u.role sender_role, u.designation sender_designation FROM staff_chat c JOIN users u ON u.id=c.user_id
    WHERE ${where.join(' AND ')} ORDER BY c.id DESC LIMIT 100`, ...args).reverse();
}));

staffWork.post('/staff-work/chat', h((req) => tx(() => {
  const t = threadFor(req, req.body?.thread_id);
  const id = insert('staff_chat', { user_id: req.user.id, body: bodyText(req.body.body), thread_id: t ? t.id : null });
  const row = get('SELECT * FROM staff_chat WHERE id=?', id);
  // your own message is read by you
  const key = readKey(t);
  if (get('SELECT 1 FROM chat_reads WHERE user_id=? AND thread_key=?', req.user.id, key)) run('UPDATE chat_reads SET last_read_id=? WHERE user_id=? AND thread_key=?', id, req.user.id, key);
  else insert('chat_reads', { user_id: req.user.id, thread_key: key, last_read_id: id });
  staffEvent(req, 'chat.send', 'staff_chat', id, null, { thread: key, length: row.body.length }, 'Message sent');
  return row;
})));

staffWork.patch('/staff-work/chat/:id', h((req) => tx(() => {
  const row = get('SELECT * FROM staff_chat WHERE id=?', +req.params.id) || fail(404, 'message_not_found');
  if (row.user_id !== req.user.id) fail(403, 'only_author_can_edit');
  if (get("SELECT (julianday('now','localtime')-julianday(created_at))*86400 age FROM staff_chat WHERE id=?", row.id).age > 900) fail(409, 'message_edit_window_closed');
  if (+req.body.version !== row.version) fail(409, 'message_changed_refresh');
  const body = bodyText(req.body.body);
  insert('staff_chat_revisions', { message_id: row.id, body: row.body, version: row.version, edited_by: req.user.id });
  update('staff_chat', row.id, { body, edited_at: nowIso(), version: row.version + 1 });
  const after = get('SELECT * FROM staff_chat WHERE id=?', row.id);
  staffEvent(req, 'chat.edit', 'staff_chat', row.id, { version: row.version }, { version: after.version }, 'Message edited');
  return after;
})));

staffWork.get('/staff-work/chat/:id/history', h((req) => {
  if (!reviewer(req.user) && !['manager', 'medical_superintendent'].includes(req.user.role)) fail(403, 'management_review_only');
  return all('SELECT * FROM staff_chat_revisions WHERE message_id=? ORDER BY id', +req.params.id);
}));

/* --------------------------------------------------------------- tasks */

staffWork.get('/staff-work/tasks', h((req) => all(`SELECT t.*, u.name assignee, a.name assigner, r.name reviewer
  FROM staff_tasks t JOIN users u ON u.id=t.assigned_to JOIN users a ON a.id=t.assigned_by LEFT JOIN users r ON r.id=t.reviewed_by
  ${reviewer(req.user) ? '' : 'WHERE t.assigned_to=? OR t.assigned_by=?'} ORDER BY t.id DESC`, ...(reviewer(req.user) ? [] : [req.user.id, req.user.id]))));

staffWork.post('/staff-work/tasks', h((req) => tx(() => {
  if (!assigner(req.user)) fail(403, 'task_assignment_not_allowed');
  const to = get('SELECT id, role, department_id FROM users WHERE id=? AND active=1', +req.body.assigned_to) || fail(400, 'active_assignee_required');
  if (!mayAssign(req.user,to)) fail(403, 'task_outside_department');
  if (req.body.due_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(req.body.due_at)) fail(400, 'due_date_invalid');
  if (req.body.due_at) {
    const s = req.body.due_at, d = new Date(s);
    const pad = n => String(n).padStart(2,'0');
    const actual = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (!Number.isFinite(d.getTime()) || actual !== s) fail(400,'due_date_invalid');
  }
  const id = insert('staff_tasks', { title: bodyText(req.body.title), description: String(req.body.description || '').slice(0, 4000), assigned_to: to.id, assigned_by: req.user.id, due_at: req.body.due_at || null });
  const row = get('SELECT * FROM staff_tasks WHERE id=?', id);
  insert('notifications', { user_id: to.id, title: 'New task assigned', body: row.title, link: '/staff-workspace' });
  staffEvent(req, 'task.assign', 'staff_tasks', id, null, row);
  return row;
})));

staffWork.patch('/staff-work/tasks/:id', h((req) => tx(() => {
  const before = get('SELECT * FROM staff_tasks WHERE id=?', +req.params.id) || fail(404, 'task_not_found');
  const status = req.body.status;
  if (!['open', 'in_progress', 'completed', 'reviewed'].includes(status)) fail(400, 'task_status_invalid');
  if (status === 'reviewed' && !reviewer(req.user)) fail(403, 'owner_admin_review_only');
  if (status === 'reviewed' && before.status !== 'completed') fail(409, 'complete_before_review');
  if (!reviewer(req.user) && before.assigned_to !== req.user.id && before.assigned_by !== req.user.id) fail(403, 'task_access_denied');
  if (before.status === 'reviewed') fail(409, 'reviewed_task_locked');
  update('staff_tasks', before.id, { status, progress_note: bodyText(req.body.progress_note), updated_at: nowIso(), ...(status === 'reviewed' ? { reviewed_by: req.user.id, reviewed_at: nowIso() } : {}) });
  const after = get('SELECT * FROM staff_tasks WHERE id=?', before.id);
  staffEvent(req, 'task.update', 'staff_tasks', before.id, before, after);
  return after;
})));
