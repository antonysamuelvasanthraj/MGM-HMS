/**
 * Hospital settings.
 *
 * Includes the two policy switches the brief singles out: whether ordinary OP
 * calling waits for payment and for vitals. Emergency care ignores both.
 */
import {
  page, eyebrow, card, live, mountPage, apiError, busy,
  api, state, can,
  $, $$, esc, bind, toast, kpi, emptyState, modal,
} from './_kit.js';
import { loadMeta } from '../store.js';

export async function mount(ctx) {
  const root = mountPage(ctx, `<div class="p-6"></div>`);
  let s = {};

  let dirty = false;
  root.addEventListener('input', () => { dirty = true; });
  root.addEventListener('change', () => { dirty = true; });
  async function load(context = {}) {
    if (context.live && dirty) return;
    s = await api.get('/settings');
    dirty = false;
    root.innerHTML = view(s);
    wire(root, load);
  }
  return live({ topics: ['system', 'admin'], events: ['settings.changed', 'user.saved'], load });
}

function view(s) {
  const text = (name, label, hint = '', type = 'text') => `
    <div><label class="field-label">${label}</label>
      <input class="field" type="${type}" name="${name}" value="${esc(s[name] ?? '')}">
      ${hint ? `<p class="text-body-sm text-on-surface-variant mt-1">${hint}</p>` : ''}</div>`;
  const toggle = (name, label, hint) => `
    <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant cursor-pointer hover:bg-surface-container-low">
      <input type="checkbox" name="${name}" ${s[name] === '1' ? 'checked' : ''} class="mt-0.5">
      <span><span class="block font-label-lg text-label-lg">${label}</span>
        <span class="block text-body-md text-on-surface-variant mt-0.5">${hint}</span></span></label>`;

  return page({
    eyebrow: eyebrow('Administration', 'settings'),
    title: 'Hospital Settings',
    subtitle: 'Identity, statutory details and the operating policies that shape how the outpatient desk behaves.',
    actions: can('admin.view') ? `<button class="btn-primary" data-save>
      <span class="material-symbols-outlined text-[18px]">save</span> Save settings</button>` : '',
    body: `<form data-sf class="space-y-5">
      ${card({ title: 'Hospital identity', body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${text('hospital_name', 'Hospital name')}${text('hospital_short', 'Short name / product label')}
        ${text('campus', 'Hospital location')}${text('phone', 'Telephone')}
        <div class="md:col-span-2">${text('address', 'Address')}</div>
        ${text('gstin', 'GSTIN')}${text('nabh_no', 'NABH accreditation number')}
        ${text('hospital_capacity', 'Bed capacity')}${text('hospital_mission', 'Mission')}${text('hospital_about', 'About the hospital')}${text('financial_year', 'Financial year')}${text('currency', 'Currency symbol')}
      </div>` })}

      ${card({
        title: 'Outpatient policy',
        subtitle: 'These switches govern ordinary OP flow only — emergency care is never gated',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${toggle('op_auto_bill', 'Raise the consultation bill at registration',
            'Reception opens the visit and the OP bill together. Turning this off means the charge must be raised by hand, which is how visits quietly become free.')}
          ${toggle('free_visit_requires_approval', 'A free visit needs administrator approval',
            'Replaces the old "skip billing" checkbox with an explicit, reasoned, approved decision that is recorded against the visit.')}
          ${toggle('gate_doctor_on_payment', 'Hold the doctor queue until the fee is settled',
            'A patient is not callable until the consultation fee is paid, waived or approved free.')}
          ${toggle('gate_doctor_on_vitals', 'Hold the doctor queue until vitals are recorded',
            'A patient is not callable until the nursing station has recorded observations.')}
        </div>
        <div class="mt-3 flex items-start gap-2 p-3 rounded-lg bg-info-bg text-info text-body-md">
          <span class="material-symbols-outlined text-[17px]">info</span>
          Emergency encounters bypass both gates. Triage and treatment never wait for money.</div>` })}

      ${card({ title: 'Payer cases', subtitle: 'Insurance, Aarogyasri, corporate, credit and trust',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${text('payer_auto_approve', 'Payer types approved automatically', 'Comma-separated. Their cases open approved: lab and imaging go ahead and the bill moves to the payer at once. Default: corporate,trust. Insurance and Aarogyasri wait for pre-authorisation. Credit is not a payer: it is the patient paying later, approved as a due automatically.')}
          <div class="p-3 rounded-lg bg-info-bg text-info text-body-md">When a case is approved, its lab / imaging work is released and open bills move to the payer as a receivable (capped at the approved amount). A running IP bill moves at discharge.</div>
        </div>` })}

      ${card({ title: 'Patient messages (SMS / WhatsApp)', subtitle: 'Report-ready notices and due reminders',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="md:col-span-2">${text('sms_gateway_url', 'Gateway URL', 'From your SMS / WhatsApp provider, with {mobile} and {message} where the number and text go, e.g. https://provider.example/send?to={mobile}&text={message}. Leave empty to send by WhatsApp by hand from Patient Messages.')}</div>
          <div><label class="field-label">Method</label><select class="field" name="sms_gateway_method">${['GET', 'POST'].map((m) => `<option ${String(s.sms_gateway_method || 'GET') === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
            <p class="text-body-sm text-on-surface-variant mt-1">POST sends JSON {mobile, message}.</p></div>
          ${text('sms_gateway_header', 'Extra header (optional)', 'e.g. Authorization: Bearer your-api-key. Visible to administrators only.')}
        </div>` })}

      ${card({ title: 'Demo logins', subtitle: 'One demo account for every department and in-charge — for demonstrations and staff training',
        body: `<div data-demo class="text-body-md text-on-surface-variant">Loading…</div>` })}

      ${card({ title: 'Backups', subtitle: 'A copy of the database is made automatically once a day and the last 30 are kept',
        body: `<div data-backups class="text-body-md text-on-surface-variant">Loading…</div>` })}

      ${card({ title: 'Doctor clinic hours', subtitle: 'Recurring sessions shown on the appointment board',
        actions: can('admin.view') ? '<button type="button" class="btn-secondary" data-new-clinic>Add clinic session</button>' : '',
        body: '<div data-clinics class="overflow-auto">Loading clinic sessions…</div>' })}

      ${card({ title: 'Local server & sync', body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${text('lan_ip', 'LAN address of this server', 'What other desks connect to.')}
        ${text('cloud_endpoint', 'Cloud sync endpoint', 'Where queued records are pushed when the link is up.')}
        ${text('timezone', 'Timezone')}${text('token_reset', 'Token numbering reset', 'daily or never')}
      </div>` })}
    </form>`,
  });
}

async function paintBackups(root) {
  const host = root.querySelector('[data-backups]');
  if (!host) return;
  try {
    const b = await api.get('/system/backups');
    host.innerHTML = `<div class="flex flex-wrap items-center gap-3"><span>${b.count} backup(s) in <span class="font-data-mono">${esc(b.folder)}</span>${b.latest ? ` · latest ${esc(b.latest.name)} (${esc(b.latest.at)})` : ''}</span>
      ${can('admin.write') ? '<button type="button" class="btn-secondary btn-sm" data-backup-now>Back up now</button>' : ''}</div>
      <p class="mt-2">Copy this folder to another drive or cloud storage regularly — a backup on the same computer does not survive a disk failure.</p>`;
    host.querySelector('[data-backup-now]')?.addEventListener('click', async (e) => {
      busy(e.currentTarget, true);
      try { const r = await api.post('/system/backups/now', {}); toast(r.made ? 'Backup written' : "Today's backup already exists", 'success'); paintBackups(root); }
      catch (err) { apiError(err); busy(e.currentTarget, false); }
    });
  } catch { host.textContent = 'Backup status is visible to administrators.'; }
}

async function paintDemo(root) {
  const host = root.querySelector('[data-demo]');
  if (!host) return;
  let d;
  try { d = await api.get('/admin/demo-mode'); } catch { host.textContent = 'Visible to administrators.'; return; }
  const active = d.accounts.filter((a) => a.active);
  host.innerHTML = `<div class="flex flex-wrap items-center gap-3">
      ${d.enabled ? '<span class="pill-warning pill-dot">Demo mode is ON</span>' : '<span class="pill-neutral pill-dot">Demo mode is off</span>'}
      <span>${d.enabled ? `${active.length} demo login(s) active and listed on the sign-in page` : 'No demo login can sign in; the sign-in page shows no demo accounts'}</span>
      ${can('admin.write') ? `<button type="button" class="${d.enabled ? 'btn-secondary' : 'btn-primary'} btn-sm" data-demo-toggle>${d.enabled ? 'Switch demo mode off' : 'Switch demo mode on'}</button>` : ''}</div>
    ${d.enabled && active.length ? `<div class="flex flex-wrap gap-1.5 mt-3">${active.map((a) => `<span class="pill-neutral" title="${esc(a.name)}">${esc(a.role_label)} · <span class="font-data-mono">${esc(a.username)}</span></span>`).join('')}</div>` : ''}
    <p class="mt-2">Switching on creates (or re-enables) the demo accounts and shows them, with their shared password, on the sign-in page. Switching off disables them and signs them out. Real staff accounts are never changed. Turn it off before the hospital uses the system for real patients.</p>`;
  host.querySelector('[data-demo-toggle]')?.addEventListener('click', async (e) => {
    const on = !d.enabled;
    if (on && !confirm('Demo logins will be listed on the sign-in page with their password, for anyone at a sign-in screen to use. Continue?')) return;
    busy(e.currentTarget, true);
    try { await api.post('/admin/demo-mode', { enabled: on }); toast(on ? 'Demo mode on — demo logins are on the sign-in page' : 'Demo mode off — demo logins disabled', 'success'); paintDemo(root); }
    catch (err) { apiError(err); busy(e.currentTarget, false); }
  });
}

function wire(root, reload) {
  paintBackups(root);
  paintDemo(root);
  paintClinics(root);
  root.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
    const actionButton = ev.currentTarget;
    busy(actionButton, true, 'Saving');
    try {
      const form = root.querySelector('[data-sf]');
      const body = Object.fromEntries(new FormData(form));
      ['op_auto_bill', 'free_visit_requires_approval', 'gate_doctor_on_payment', 'gate_doctor_on_vitals']
        .forEach((k) => { body[k] = form[k].checked ? '1' : '0'; });
      await api.patch('/settings', body);
      await loadMeta(true);
      toast('Settings saved — every desk picks these up immediately', 'success');
      reload();
    } catch (e) { apiError(e, 'Could not save the settings'); busy(actionButton, false); }
  });
}

const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
async function paintClinics(root) {
  const host=root.querySelector('[data-clinics]');
  if(!host||!can('admin.view')) { if(host)host.textContent='Clinic hours are maintained by the administrator.';return; }
  try {
    const data=await api.get('/admin/clinic-sessions');if(!root.isConnected)return;
    host.innerHTML=data.rows.length ? `<table class="tbl"><thead><tr><th>Doctor</th><th>Day</th><th>Hours / room</th><th>Slot</th><th></th></tr></thead><tbody>${data.rows.map(s=>`<tr><td>${esc(s.doctor_name)}</td><td>${WEEKDAYS[s.weekday]}</td><td>${esc(s.start_time)}–${esc(s.end_time)} · ${esc(s.room||'—')}</td><td>${s.slot_minutes} min</td><td><button type="button" class="btn-secondary btn-xs" data-edit-clinic="${s.id}">Edit</button></td></tr>`).join('')}</tbody></table>` : 'No clinic sessions configured. Add a session to show hours on Appointments.';
    root.querySelector('[data-new-clinic]').onclick=()=>clinicForm(data,null,()=>paintClinics(root));
    host.querySelectorAll('[data-edit-clinic]').forEach(btn=>btn.onclick=()=>clinicForm(data,data.rows.find(s=>s.id===+btn.dataset.editClinic),()=>paintClinics(root)));
  } catch(e) { host.textContent='Could not load clinic hours.';apiError(e); }
}
function clinicForm(data,session,after) {
  const s=session||{weekday:1,start_time:'09:00',end_time:'13:00',slot_minutes:15,max_tokens:40,room:''};
  modal({title:session?'Edit clinic session':'Add clinic session',size:'md',body:`<form data-clinic-form class="space-y-3">
    <div><label class="field-label">Doctor</label><select class="field" name="doctor_id" required>${data.doctors.map(d=>`<option value="${d.id}" ${s.doctor_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>
    <div><label class="field-label">Weekday</label><select class="field" name="weekday">${WEEKDAYS.map((d,i)=>`<option value="${i}" ${s.weekday===i?'selected':''}>${d}</option>`).join('')}</select></div>
    <div class="grid grid-cols-2 gap-3"><div><label class="field-label">Starts</label><input class="field" type="time" name="start_time" value="${esc(s.start_time)}" required></div><div><label class="field-label">Ends</label><input class="field" type="time" name="end_time" value="${esc(s.end_time)}" required></div></div>
    <div><label class="field-label">Room</label><input class="field" name="room" value="${esc(s.room)}" maxlength="100"></div>
    <div class="grid grid-cols-2 gap-3"><div><label class="field-label">Slot minutes</label><input class="field" type="number" name="slot_minutes" value="${s.slot_minutes}" min="5" max="120" required></div><div><label class="field-label">Maximum tokens</label><input class="field" type="number" name="max_tokens" value="${s.max_tokens}" min="1" max="1000" required></div></div>
    </form>`,footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-clinic>Save clinic session</button>',onMount(root,close){root.querySelector('[data-save-clinic]').onclick=async ev=>{
      const form=root.querySelector('[data-clinic-form]');if(!form.reportValidity())return;busy(ev.currentTarget,true);
      try {const body=Object.fromEntries(new FormData(form));await (session?api.patch(`/admin/clinic-sessions/${session.id}`,body):api.post('/admin/clinic-sessions',body));close();toast('Clinic hours saved — shown on Appointments','success');after();}catch(e){apiError(e);busy(ev.currentTarget,false);}
    };}});
}
