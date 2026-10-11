/** Users, roles & access control. */
import { loadMeta } from '../store.js';
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, deptOptions, downloadCSV,
  $, $$, esc, bind, toast, modal, drawer, confirmDialog, renderRows, pill, money,
  fmtDate, fmtDateTime, ago, kpi, titleCase, emptyState,
} from './_kit.js';

let cache = [];
let roles = {};
let f = { role: '', q: '' };

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; paint(root); });

  async function load() {
    const [users, r] = await Promise.all([api.get('/admin/users'), api.get('/admin/roles')]);
    cache = users; roles = r;
    const roleFilter = root.querySelector('[data-f="role"]');
    if (roleFilter) { roleFilter.innerHTML = '<option value="">All roles</option>' + r.roles.map(x => `<option value="${esc(x.role)}">${esc(x.label)}</option>`).join(''); roleFilter.value = f.role; }
    $('[data-kpis]', root).innerHTML = [
      { label: 'Staff accounts', value: users.length, icon: 'manage_accounts', sub: `${users.filter((u) => u.active).length} active` },
      { label: 'Clinicians', value: users.filter((u) => ['doctor', 'radiology'].includes(u.role)).length, icon: 'stethoscope',
        tone: 'info', sub: 'With a consultation tariff' },
      { label: 'Signed in now', value: users.filter((u) => u.sessions > 0).length, icon: 'login', tone: 'success', sub: 'Open sessions' },
      { label: 'Roles configured', value: r.roles.length, icon: 'shield', sub: `${r.roles.filter((x) => x.changed || x.custom).length} customised` },
    ].map(kpi).join('');
    paint(root);
    paintRoles(root);
  }

  bind(root, 'click', '[data-act="edit"]', (e, b) => editUser(cache.find((u) => u.id === +b.closest('tr').dataset.id), load));
  bind(root, 'click', '[data-act="toggle"]', async (e, b) => {
    const u = cache.find((x) => x.id === +b.closest('tr').dataset.id);
    const r = await confirmDialog({ title: u.active ? `Disable ${u.name}?` : `Re-enable ${u.name}?`,
      message: u.active ? 'They will be signed out and cannot sign in again until re-enabled.' : 'They will be able to sign in again.',
      confirmLabel: u.active ? 'Disable' : 'Enable', tone: u.active ? 'danger' : 'primary' });
    if (!r) return;
    await api.patch(`/admin/users/${u.id}`, { active: u.active ? 0 : 1 });
    await loadMeta(true);
    toast('Account updated', 'success'); load();
  });
  bind(root, 'click', '[data-new]', () => editUser(null, load));
  bind(root, 'click', '[data-edit-role]', (e, b) => editRole(roles.roles.find((x) => x.role === b.dataset.editRole), load));
  bind(root, 'click', '[data-new-role]', () => newRole(load));
  bind(root, 'click', '[data-export]', () => downloadCSV('staff.csv', cache.map((u) => ({
    code: u.staff_code, username: u.username, name: u.name, role: u.role, designation: u.designation,
    department: u.dept_name, reg_no: u.reg_no, op_fee: u.op_fee, mobile: u.mobile, email: u.email, active: u.active,
  }))));

  return live({ topics: ['admin'], events: ['user.saved'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Administration', 'manage_accounts')} ${liveChip()}`,
    title: 'Users, Roles & Access Control',
    subtitle: 'Staff accounts and what each role may do. A doctor’s consultation tariff lives here — that is the figure OP registration charges.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${(can('admin.write') || can('staff.manage')) ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">person_add</span> Add staff</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Name, username or staff code' },
        { type: 'select', key: 'role', label: 'Role', value: f.role, options: [{ value: '', label: 'All roles' },
          ...['admin', 'owner', 'reception_admin', 'pharmacy_admin', 'lab_admin', 'reception', 'cashier', 'doctor', 'nurse', 'lab', 'radiology', 'pharmacy', 'store', 'accounts', 'insurance', 'quality']
            .map((r) => ({ value: r, label: titleCase(r) }))] },
      ])}
      ${tableCard({
        title: 'Staff directory', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '52vh',
        columns: [{ label: 'Code', width: '90px' }, { label: 'Name' }, { label: 'Role' },
          { label: 'Department' }, { label: 'OP fee', cls: 'text-right' }, { label: 'Contact' },
          { label: 'Last seen' }, { label: 'Status' }, { label: '', width: '140px' }],
      })}
      ${card({ title: 'Role permissions', subtitle: 'What each role can reach in the sidebar and the API — changed only by an administrator, every change audited',
        actions: state.user?.role === 'admin' ? '<button class="btn-secondary btn-sm" data-new-role><span class="material-symbols-outlined text-[16px]">add</span>New role</button>' : '',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-roles></div>` })}`,
  });
}

function paint(root) {
  const rows = cache.filter((u) =>
    (!f.role || u.role === f.role) &&
    (!f.q || [u.name, u.username, u.staff_code].join(' ').toLowerCase().includes(f.q.toLowerCase())));
  renderRows($('[data-rows]', root), rows, rowHTML, { empty: 'No staff match this filter.' });
  $('[data-count]', root).textContent = `${rows.length} of ${cache.length}`;
}

function rowHTML(u) {
  return `
    <td class="font-data-mono text-body-sm">${esc(u.staff_code)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(u.name)}</div>
      <div class="text-label-sm text-on-surface-variant">${esc(u.designation || '')}${u.reg_no ? ` · Reg ${esc(u.reg_no)}` : ''}</div></td>
    <td><span class="pill-brand capitalize">${esc(roles.roles.find(r => r.role === u.role)?.label || titleCase(u.role))}</span>
      <div class="font-data-mono text-label-sm text-on-surface-variant mt-0.5">${esc(u.username)}</div></td>
    <td class="text-body-md">${esc(u.dept_name || '—')}</td>
    <td class="num">${u.op_fee ? money(u.op_fee) : '—'}${u.followup_fee ? `<div class="text-label-sm text-on-surface-variant">f/u ${money(u.followup_fee)}</div>` : ''}</td>
    <td><div class="text-body-sm">${esc(u.mobile || '—')}</div>
      <div class="text-label-sm text-on-surface-variant truncate max-w-[150px]">${esc(u.email || '')}</div></td>
    <td class="text-body-sm">${u.last_seen ? ago(u.last_seen) : 'never'}
      ${u.sessions ? `<div class="text-label-sm text-success">${u.sessions} session(s)</div>` : ''}</td>
    <td>${u.active ? '<span class="pill-success pill-dot">Active</span>' : '<span class="pill-neutral">Disabled</span>'}</td>
    <td class="text-right whitespace-nowrap">
      ${(can('admin.write') || (can('staff.manage') && u.id !== state.user.id)) ? `<button class="btn-secondary btn-xs" data-act="edit">Edit</button>
        <button class="btn-ghost btn-xs" data-act="toggle" title="${u.active ? 'Disable' : 'Enable'}">
          <span class="material-symbols-outlined text-[15px]">${u.active ? 'block' : 'check'}</span></button>` : ''}
    </td>`;
}

function editUser(u, after) {
  const ROLES = (roles.roles || []).map((r) => r.role).filter((r) => r !== 'admin' || state.user?.role === 'admin');
  modal({
    title: u ? `Edit ${u.name}` : 'Add a staff member', size: 'lg',
    body: `<form data-uf class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="md:col-span-2"><label class="field-label">Full name *</label><input class="field" name="name" required value="${esc(u?.name || '')}"></div>
      <div><label class="field-label">Staff code</label><input class="field" name="staff_code" value="${esc(u?.staff_code || '')}" ${u ? 'readonly' : ''}></div>
      <div><label class="field-label">Username *</label><input class="field" name="username" required value="${esc(u?.username || '')}" ${u ? 'readonly' : ''}></div>
      <div><label class="field-label">${u ? 'Reset password' : 'Password *'}</label>
        <input class="field" name="password" type="password" autocomplete="new-password" placeholder="${u ? 'Leave blank to keep' : 'Choose a password'}" ${u ? '' : 'required'}></div>
      <div><label class="field-label">Role *</label><select class="field" name="role" required>
        ${ROLES.map((r) => `<option value="${r}" ${r === (u?.role || (ROLES.includes('reception') ? 'reception' : ROLES[0])) ? 'selected' : ''}>${esc(roles.roles.find((x) => x.role === r)?.label || titleCase(r))}</option>`).join('')}</select></div>
      <div class="md:col-span-2"><label class="field-label">Designation</label><input class="field" name="designation" value="${esc(u?.designation || '')}"></div>
      <div><label class="field-label" data-dept-label>Department</label><select class="field" name="department_id">
        ${deptOptions(true).map((o) => `<option value="${o.value}" ${String(o.value) === String(u?.department_id) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
      <div class="md:col-span-2"><label class="field-label">Qualification</label><input class="field" name="qualification" value="${esc(u?.qualification || '')}"></div>
      <div><label class="field-label">Council registration</label><input class="field" name="reg_no" value="${esc(u?.reg_no || '')}"></div>
      <fieldset data-doctor-tariff class="md:col-span-3 border border-outline-variant rounded-lg p-3">
        <legend class="field-label px-1">Consultation tariff — used by OP registration</legend>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="field-label">OP fee</label><input class="field" type="number" name="op_fee" value="${u?.op_fee ?? 0}"></div>
          <div><label class="field-label">Follow-up fee</label><input class="field" type="number" name="followup_fee" value="${u?.followup_fee ?? 0}"></div>
          <div><label class="field-label">Free follow-up window (days)</label><input class="field" type="number" name="followup_days" value="${u?.followup_days ?? 7}"></div>
        </div>
        <p class="text-body-sm text-on-surface-variant mt-2">A follow-up inside the window is charged nothing; after it, the follow-up fee applies.</p>
      </fieldset>
      <div><label class="field-label">Mobile</label><input class="field" name="mobile" value="${esc(u?.mobile || '')}"></div>
      <div class="md:col-span-2"><label class="field-label">Email</label><input class="field" name="email" value="${esc(u?.email || '')}"></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      const form = root.querySelector('[data-uf]');
      const refreshRole = () => {
        const doctor = form.elements.role.value === 'doctor';
        const department = form.elements.department_id;
        const selected = department.value;
        root.querySelector('[data-dept-label]').textContent = doctor ? 'Doctor specialty / department *' : 'Department';
        const codes = roles.roles.find(r => r.role === form.elements.role.value)?.department_codes;
        department.required = doctor || !!codes;
        department.innerHTML = `<option value="">${doctor ? 'Choose doctor specialty' : 'Choose department'}</option>` + (state.meta?.departments || []).filter(d => doctor ? d.kind === 'clinical' : !codes || codes.includes(d.code)).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
        department.value = selected;
        if (!doctor && codes && !department.value && department.options.length === 2) department.value = department.options[1].value;
        root.querySelector('[data-doctor-tariff]').hidden = !doctor;
      };
      form.elements.role.onchange = refreshRole;
      refreshRole();
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-uf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const b = Object.fromEntries(new FormData(form));
          if (b.role === 'doctor' && !b.department_id) { toast('Choose the doctor’s specialty department', 'warning'); busy(actionButton, false); return; }
          if (!b.password) delete b.password;
          if (u) await api.patch(`/admin/users/${u.id}`, b);
          else await api.post('/admin/users', b);
          await loadMeta(true);
          close(); toast('Staff record saved', 'success'); after();
        } catch (e) { apiError(e, 'Could not save the staff record'); busy(actionButton, false); }
      };
    },
  });
}

/* ----------------------------------------------------------- role editor */

const labelOf = (catalog) => Object.fromEntries(catalog.flatMap(([, list]) => list));

function has(perms, key) {
  if (perms.includes('*') || perms.includes(key)) return true;
  return perms.includes(`${key.split('.')[0]}.*`);
}

function paintRoles(root) {
  const labels = labelOf(roles.catalog);
  const isAdmin = state.user?.role === 'admin';
  $('[data-roles]', root).innerHTML = roles.roles.map((r) => `
    <div class="p-3 rounded-lg border border-outline-variant flex flex-col">
      <div class="flex items-center justify-between gap-2">
        <span class="font-title-md text-title-md">${esc(r.label)}</span>
        <span class="font-data-mono text-label-sm text-on-surface-variant whitespace-nowrap">${r.users} user(s)</span></div>
      <div class="flex flex-wrap items-center gap-1 mt-1">
        ${r.locked ? '<span class="pill-brand">Full access · fixed</span>' : ''}${r.custom ? '<span class="pill-info">Custom role</span>' : ''}${r.changed ? '<span class="pill-warning">Changed from default</span>' : ''}</div>
      <div class="flex flex-wrap gap-1 mt-2 flex-1">${r.perms.map((p) => `<span class="pill-neutral" title="${esc(labels[p] || p)}">${esc(labels[p] || p)}</span>`).join('')}</div>
      ${isAdmin && !r.locked ? `<div class="mt-3"><button class="btn-secondary btn-sm" data-edit-role="${esc(r.role)}"><span class="material-symbols-outlined text-[16px]">edit</span>Edit access</button></div>` : ''}
    </div>`).join('');
}

function editRole(r, after) {
  const perms = [...r.perms];
  modal({
    title: `Access for ${r.label}`, size: 'xl',
    subtitle: `${r.users} active user(s) have this role. Changes apply immediately, on every screen and on the server.`,
    body: `<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div><label class="field-label">Role name shown</label><input class="field" data-label value="${esc(r.label)}"></div>
        <div class="md:col-span-2"><label class="field-label">Reason for the change (audit trail)</label><input class="field" data-reason placeholder="e.g. reception now records vitals"></div></div>
      <div class="flex flex-wrap gap-2 mb-3"><input class="field field-sm !w-64" data-filter placeholder="Find a permission…">
        <button type="button" class="btn-ghost btn-sm" data-all>Select all shown</button><button type="button" class="btn-ghost btn-sm" data-none>Clear all shown</button></div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-groups>${roles.catalog.map(([group, list]) => `
        <fieldset class="rounded-lg border border-outline-variant p-3" data-group>
          <legend class="px-1 font-label-lg">${esc(group)}</legend>
          ${list.map(([key, label]) => `<label class="flex items-start gap-2 py-1 cursor-pointer" data-perm-row="${esc(`${key} ${label}`.toLowerCase())}">
            <input type="checkbox" class="mt-0.5" value="${esc(key)}" ${has(perms, key) ? 'checked' : ''}>
            <span class="text-body-md">${esc(label)}<span class="block font-data-mono text-label-sm text-on-surface-variant">${esc(key)}</span></span></label>`).join('')}
        </fieldset>`).join('')}</div>`,
    footer: `${r.changed ? '<button class="btn-ghost mr-auto" data-reset>Reset to default</button>' : ''}${r.custom && !r.users ? '<button class="btn-ghost mr-auto text-danger" data-delete>Delete role</button>' : ''}
      <button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save access</button>`,
    onMount(el, close) {
      const boxes = () => [...el.querySelectorAll('[data-groups] input[type=checkbox]')];
      el.querySelector('[data-filter]').oninput = (e) => {
        const q = e.target.value.trim().toLowerCase();
        el.querySelectorAll('[data-perm-row]').forEach((row) => { row.style.display = !q || row.dataset.permRow.includes(q) ? '' : 'none'; });
      };
      const visible = () => boxes().filter((b) => b.closest('[data-perm-row]').style.display !== 'none');
      el.querySelector('[data-all]').onclick = () => visible().forEach((b) => { b.checked = true; });
      el.querySelector('[data-none]').onclick = () => visible().forEach((b) => { b.checked = false; });
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          const chosen = boxes().filter((b) => b.checked).map((b) => b.value);
          // keep any wildcard the role already had whose members are all still ticked
          const keep = perms.filter((p) => p.endsWith('.*') && boxes().filter((b) => b.value.startsWith(p.slice(0, -1))).every((b) => b.checked));
          const final = [...new Set([...keep, ...chosen.filter((c) => !keep.some((k) => c.startsWith(k.slice(0, -1))))])];
          roles = await api.put(`/admin/roles/${r.role}`, { perms: final, label: el.querySelector('[data-label]').value.trim(), reason: el.querySelector('[data-reason]').value.trim() });
          close(); toast(`${r.label} access saved`, 'success'); after();
        } catch (err) { apiError(err, 'Access not saved'); busy(btn, false); }
      };
      el.querySelector('[data-reset]')?.addEventListener('click', async () => {
        const c = await confirmDialog({ title: `Reset ${r.label}?`, message: 'The role goes back to its built-in permissions.', confirmLabel: 'Reset' });
        if (!c) return;
        try { roles = await api.post(`/admin/roles/${r.role}/reset`, {}); close(); toast('Role reset to default', 'success'); after(); } catch (err) { apiError(err); }
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const c = await confirmDialog({ title: `Delete ${r.label}?`, message: 'No user has this role.', tone: 'danger', confirmLabel: 'Delete' });
        if (!c) return;
        try { roles = await api.del(`/admin/roles/${r.role}`); close(); toast('Role deleted', 'success'); after(); } catch (err) { apiError(err); }
      });
    },
  });
}

function newRole(after) {
  modal({
    title: 'New role', size: 'sm',
    body: `<label class="field-label">Name</label><input class="field" data-name placeholder="e.g. Pharmacy in-charge">
      <label class="field-label mt-3">Start from the access of</label><select class="field" data-copy>
        ${roles.roles.filter((x) => !x.locked).map((x) => `<option value="${esc(x.role)}">${esc(x.label)}</option>`).join('')}</select>
      <p class="text-body-sm text-on-surface-variant mt-2">You can change every permission on the next screen.</p>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Create role</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async (e) => {
        const name = el.querySelector('[data-name]').value.trim();
        if (!name) { toast('Give the role a name', 'warning'); return; }
        busy(e.currentTarget, true);
        try {
          roles = await api.post('/admin/roles', { role: name, label: name, copy_from: el.querySelector('[data-copy]').value });
          close(); after();
          const created = roles.roles.find((x) => x.label === name);
          if (created) editRole(created, after);
        } catch (err) { apiError(err, 'Role not created'); busy(e.currentTarget, false); }
      };
    },
  });
}
