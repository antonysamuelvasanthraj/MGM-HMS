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
  let renderedSettings='';
  root.addEventListener('input', () => { dirty = true; });
  root.addEventListener('change', () => { dirty = true; });
  async function load(context = {}) {
    if (context.live && dirty) return;
    s = await api.get('/settings');
    const signature=JSON.stringify(s);
    if(context.live&&signature===renderedSettings)return;
    renderedSettings=signature;
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
    subtitle: 'Hospital details, desk policies and department workflow.',
    actions: can('admin.write') ? `<button class="btn-primary" data-save>
      <span class="material-symbols-outlined text-[18px]">save</span> Save settings</button>` : '',
    body: `${can('admin.view') ? '<div data-golive></div>' : ''}<form data-sf class="space-y-5">
      ${can('admin.write') ? card({title:'Product configuration',subtitle:'Open the existing master screens to configure the hospital.',body:`<div class="flex flex-wrap gap-2">${[['users','Users & roles'],['tariff','Services, prices & lab templates'],['wards','Wards & beds'],['medicines','Medicines & units'],['suppliers','Suppliers'],['packages','Packages'],['payers','Payers & TPAs'],['accounts','Accounts'],['templates','Clinical templates']].map(([route,label])=>`<a class="btn-secondary" href="/${route}">${label}</a>`).join('')}</div>`}) : ''}
      ${card({ title: 'Hospital identity', body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${text('hospital_name', 'Hospital name')}${text('hospital_short', 'Short name / product label')}
        ${text('campus', 'Hospital location')}${text('phone', 'Telephone')}
        ${text('hospital_city', 'Hospital city', 'Default city when registering a patient.')}${text('hospital_state', 'Hospital state', 'Default state for new patient and supplier forms; used to select same-state or other-state GST on a GRN.')}
        <div class="md:col-span-2">${text('address', 'Address')}</div>
        ${text('gstin', 'GSTIN')}${text('nabh_no', 'NABH accreditation number')}${text('drug_license','Pharmacy drug licence number','Printed on bills and reports when provided.')}
        <div><label class="field-label">Financial year (April–March)</label><p class="field">${esc(s.server_financial_year || 'Current financial year')}</p><p class="text-body-sm mt-1">Calculated from the server date. Historical bills keep their original dates.</p></div><div><label class="field-label">Currency</label><p class="field">Indian rupee (INR / ₹)</p><p class="text-body-sm mt-1">This installation uses INR for billing, stock valuation and accounts.</p></div>
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
          ${toggle('vitals_strict', 'Strict vitals: no doctor call without vitals (all modes)',
            'On (default): every OP patient is observed before the doctor, in paper, paperless and hybrid. The “Send directly to doctor” option is then not offered. Off: the desk may skip vitals.')}
          ${toggle('payer_change_requires_approval', 'Payer changes need Insurance desk approval',
            'Reception and billing send a request; the Insurance desk or an administrator approves it, then the bills move. Off: reception changes the payer directly (money received is still guarded).')}
          ${toggle('scheme_checklist_required', 'Aarogyasri cases need the full checklist before approval',
            'Scheme card no., verified eligibility proof, package and scheme pre-auth no. must be recorded before an Aarogyasri case can be approved.')}
          ${toggle('require_digital_reference', 'Require the transaction ID for UPI, card, bank transfer and cheque',
            'The cashier must enter the UPI transaction ID, card approval code, UTR or cheque number. Makes day-end matching with the bank and UPI statements possible.')}
          ${toggle('op_direct_doctor_option', 'Offer “Send directly to doctor” at OP fee collection',
            'Shows an optional checkbox in the fee dialog. Ticked, the visit skips the vitals queue and goes straight to the doctor; unticked, the normal vitals → doctor flow is kept.')}
        </div>
        <div class="mt-3 flex items-start gap-2 p-3 rounded-lg bg-info-bg text-info text-body-md">
          <span class="material-symbols-outlined text-[17px]">info</span>
          Emergency encounters bypass both gates. Triage and treatment never wait for money.</div>` })}

      ${card({ title: 'Laboratory sample labels', subtitle: 'Small container labels with the patient, tests and a tick box per test. Available in paper, paperless and hybrid.',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${toggle('lab_label_auto', 'Print the sample label automatically when a sample is collected',
            'Off (default): staff press Label on a collected sample when they want one. On: the label dialog opens at collection. The Label button is always available.')}
        </div>` })}

      ${card({ title: 'Pharmacy & stock', subtitle: 'How stock may be corrected and moved between stores.',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${toggle('manual_stock_adjust', 'Allow single-batch stock adjustment',
            'The Adjust stock action on a batch (damage, expiry, loss, count correction). Off: one-off corrections are blocked; the Excel bulk stock count still works and is always recorded with its reason.')}
          ${toggle('transfer_self_approve', 'The requester may approve their own stock transfer',
            'For a pharmacy run by one in-charge: the same person can request, approve, issue and receive. Every step stays in the audit trail. Off: another in-charge, the manager or the owner approves.')}
          ${toggle('schedule_h_requires_rx', 'Schedule H / H1 / X need a prescription at the counter',
            'The pharmacist must choose the prescribing doctor or write the paper prescription reference before a restricted medicine is sold.')}
        </div>` })}

      ${card({ title: 'Appearance', subtitle: 'The look every desk sees. Changing it does not touch any data.',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${[['calm', 'Calm blue', 'Navy and teal, white side menu, airy pages'], ['maroon', 'MGM maroon', 'The MGM brand colours, dark side menu']].map(([v, l, d]) => `
            <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant cursor-pointer hover:bg-surface-container-low">
              <input type="radio" name="ui_theme" value="${v}" class="mt-1" ${(s.ui_theme || 'calm') === v ? 'checked' : ''}>
              <span class="flex-1"><span class="block font-label-lg text-label-lg">${l}</span><span class="block text-body-md text-on-surface-variant mt-0.5">${d}</span></span>
              <span class="flex gap-1 mt-1" aria-hidden="true">${(v === 'calm' ? ['#062F5C', '#0B4C84', '#17A2B8', '#EEF3F8'] : ['#39171D', '#881D2C', '#C3A256', '#F5F7FA']).map((c) => `<span style="width:16px;height:16px;border-radius:4px;background:${c};border:1px solid #D8DFE8"></span>`).join('')}</span></label>`).join('')}
        </div>` })}

      ${card({ title: 'Reminder texts', subtitle: 'Sent once a day through the SMS / WhatsApp gateway set below.',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${toggle('reminders_enabled', 'Send daily reminders', 'Appointments booked for tomorrow, and patients with an open balance (at most once a week each).')}
          <div><label class="field-label">Send at (hour, 24-hour clock)</label><input class="field" type="number" min="7" max="21" name="reminder_hour" value="${esc(s.reminder_hour || '18')}"></div>
        </div>` })}

      ${card({
        title: 'Hospital operating mode',
        subtitle: 'Paper, paperless or both — one choice for the whole hospital. Only the Hospital Admin can change it.',
        body: '<div data-opmode class="text-body-md text-on-surface-variant">Loading…</div>' })}

      ${card({ title: 'Investigation release', subtitle: 'When an outpatient lab or imaging test may start',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${[['payment', 'After payment or approval', 'Paid, part-paid by approval, an approved due / credit, or payer approval. The usual OPD rule.'],
            ['immediate', 'Straight away', 'The test starts as soon as it is ordered; reception bills and collects afterwards.']].map(([v, l, t]) => `<label class="flex items-start gap-2 rounded-lg border border-outline-variant p-3 cursor-pointer">
            <input type="radio" name="release_op_rule" value="${v}" class="mt-1" ${(s.release_op_rule || 'payment') === v ? 'checked' : ''}><span><b>${l}</b><span class="block text-body-sm text-on-surface-variant">${t}</span></span></label>`).join('')}</div>
          <p class="mt-3 text-body-sm text-on-surface-variant">Inpatient and ICU tests always go on the running IP bill. Emergency tests always start at once and are billed later — this cannot be switched off.</p>` })}

      ${card({ title: 'Payer cases', subtitle: 'Insurance, Aarogyasri, corporate, credit and trust',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${toggle('aarogyasri_ipd_only','Aarogyasri only for inpatient admissions','Register and bill OP as self-pay. Admit first, then convert the admission after scheme approval.')}
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
        actions: can('admin.write') ? '<button type="button" class="btn-secondary" data-new-clinic disabled aria-busy="true">Add clinic session</button>' : '',
        body: '<div data-clinics class="overflow-auto">Loading clinic sessions…</div>' })}

      ${card({ title: 'Lab reports — QR & cloud', subtitle: 'Every printed lab report carries a QR. These settings decide where it points and how long it works.',
        body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${toggle('report_qr_download', 'Patients may open and download released reports through the QR',
            'Off: the QR still prints but only says the report must be collected from the laboratory. Only verified (released) results are ever shown.')}
          ${text('report_qr_retention_days', 'Keep the link working for (days)', 'Counted from the day the report is released. Default 90 days (3 months); after that the link shows "expired".')}
          ${toggle('cloud_enabled', 'Connect a cloud (optional)',
            'Off: the QR points at this server and works on the hospital network. On: it points at the cloud address below, so patients can open it from anywhere. Only reports and summary analysis are sent, never the whole HMS.')}
          ${text('cloud_base_url', 'Cloud address', 'For example https://reports.yourhospital.in — needed only when the cloud connection is on.')}
        </div>` })}

      ${card({ title: 'Local server & sync', body: `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${toggle('sync_queue_enabled', 'Queue changes for cloud sync',
          'Off (default): changes are not queued for any cloud. On: each change is queued in the sync queue for the cloud receiver. No receiver is set up here yet, so queued items wait.')}
        ${text('lan_ip', 'LAN address of this server', 'What other desks connect to.')}
        ${text('cloud_endpoint', 'Cloud receiver reference', 'Reference address only. This installation has no cloud delivery receiver; records remain queued. See Local Setup & Sync for queue export.')}
        <div><label class="field-label">Server timezone</label><p class="field">${esc(s.server_timezone || 'Server local time')}</p><p class="text-body-sm mt-1">Times follow the server’s local timezone. Configure the hospital server to Asia/Kolkata; changing a saved label does not change historical times.</p></div>
        <div><label class="field-label">Token numbering reset</label><select class="field" name="token_reset"><option value="daily" ${s.token_reset!=='never'?'selected':''}>Daily, for each doctor</option><option value="never" ${s.token_reset==='never'?'selected':''}>Continue numbering for each doctor</option></select></div>
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
      const button=e.currentTarget;busy(button, true);
      try { const r = await api.post('/system/backups/now', {}); toast(r.made ? 'Backup written' : "Today's backup already exists", 'success'); paintBackups(root); }
      catch (err) { apiError(err); } finally { busy(button, false); }
    });
  } catch { host.textContent = 'Backup status is visible to administrators.'; }
}

const MODE_TEXT = {
  paper: ['Paper', 'Doctors write prescriptions and test requests on paper. Reception enters the tests and bills them; pharmacy dispenses from the paper prescription. Doctor queue and consultation screens are hidden.'],
  paperless: ['Paperless', 'Doctors consult, prescribe and order tests in the HMS. Orders route to reception, the lab, imaging and the pharmacy queue by themselves.'],
  hybrid: ['Hybrid (both)', 'Both ways at once: the doctor portal stays on, and reception, the lab and radiology can also enter paper requests. A test already open on the visit asks before it is ordered twice.'],
};
const AREA = [['doctor', 'Doctor consultation & prescriptions'], ['lab', 'Lab & imaging requests'], ['pharmacy', 'Pharmacy dispensing']];
async function paintOpMode(root) {
  const host = root.querySelector('[data-opmode]');
  if (!host) return;
  let d;
  try { d = await api.get('/admin/operating-mode'); } catch (e) { host.textContent = 'Could not load the operating mode.'; return; }
  if (!root.isConnected) return;
  const ways = (x) => [x.digital && 'screens', x.paper && 'paper'].filter(Boolean).join(' + ') || '—';
  host.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-3">
      <div><div class="text-label-sm uppercase tracking-wide">Current mode</div>
        <div class="text-headline-sm font-semibold text-on-surface">${esc(MODE_TEXT[d.mode][0])}</div>
        <p class="max-w-2xl mt-1">${esc(MODE_TEXT[d.mode][1])}</p>
        ${d.since ? `<p class="text-body-sm mt-1">Since ${esc(d.since)}</p>` : ''}</div>
      ${d.can_change ? '<button type="button" class="btn-secondary" data-change-mode>Change mode</button>' : '<span class="text-body-sm">Only the Hospital Admin can change this.</span>'}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">${AREA.map(([k, l]) => `<div class="rounded-lg border border-outline-variant p-3">
      <div class="text-label-sm uppercase tracking-wide">${l}</div><div class="font-semibold text-on-surface mt-0.5">${ways(d.effective[k])}</div></div>`).join('')}</div>
    <p class="mt-3 text-body-sm">Registration, billing, collections, admissions, stock and accounts work the same in every mode. A change applies to new work; nothing already recorded is changed.
      ${d.mode !== 'paperless' ? ` Lab and radiology may record paper requests themselves: <b>${d.dept_entry ? 'on' : 'off'}</b>. Warning before ordering the same test twice: <b>${d.duplicate_guard ? 'on' : 'off'}</b>.` : ''}</p>
    ${d.history.length ? `<details class="mt-3"><summary class="cursor-pointer font-label-lg text-on-surface">Change history (${d.history.length})</summary>
      <table class="tbl mt-2"><thead><tr><th>When</th><th>From</th><th>To</th><th>By</th><th>Reason</th></tr></thead><tbody>${d.history.map((h) => `<tr>
        <td class="font-data-mono">${esc(h.changed_at)}</td><td>${esc(MODE_TEXT[h.from_mode]?.[0] || h.from_mode || '—')}</td><td>${esc(MODE_TEXT[h.to_mode]?.[0] || h.to_mode)}</td>
        <td>${esc(h.changed_by_name || '')}</td><td>${esc(h.reason)}</td></tr>`).join('')}</tbody></table></details>` : ''}`;
  host.querySelector('[data-change-mode]')?.addEventListener('click', () => changeMode(d, () => paintOpMode(root)));
}
function changeMode(d, after) {
  modal({ title: 'Change the hospital operating mode', size: 'md', stack: true,
    body: `<div class="space-y-2">${Object.entries(MODE_TEXT).map(([k, [l, t]]) => `<label class="flex items-start gap-2 rounded-lg border border-outline-variant p-3 cursor-pointer ${k === d.mode ? 'opacity-60' : ''}">
        <input type="radio" name="mode" value="${k}" class="mt-1" ${k === d.mode ? 'disabled' : ''}><span><b>${l}</b>${k === d.mode ? ' (current)' : ''}<span class="block text-body-sm text-on-surface-variant">${t}</span></span></label>`).join('')}
      <label class="field-label mt-2">Reason for the change (at least 5 characters) *</label><textarea class="field" rows="2" data-reason minlength="5" required placeholder="e.g. Doctors move to the portal from 1 November"></textarea><p class="text-danger text-body-sm mt-1" data-mode-error role="alert"></p>
      <label class="flex items-start gap-2 mt-2 text-body-md"><input type="checkbox" data-confirm class="mt-1"><span>I understand this changes how every department works from now on. Work already started can be finished.</span></label></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-apply>Change mode</button>',
    onMount(root, close) {
      root.querySelector('[data-apply]').onclick = async (ev) => {
        const button=ev.currentTarget,error=root.querySelector('[data-mode-error]');
        error.textContent='';
        const mode = root.querySelector('input[name=mode]:checked')?.value;
        if (!mode) { toast('Choose the new mode', 'warning'); return; }
        const reason=root.querySelector('[data-reason]').value.trim();
        if (reason.length<5) { error.textContent='Enter a reason with at least 5 characters.';root.querySelector('[data-reason]').focus();return; }
        if (!root.querySelector('[data-confirm]').checked) { toast('Confirm the department workflow change before applying', 'warning'); return; }
        busy(button, true, 'Changing');
        try {
          await api.post('/admin/operating-mode', { mode, reason, confirm: root.querySelector('[data-confirm]').checked });
          await loadMeta(true); close(); toast(`Hospital is now in ${MODE_TEXT[mode][0]} mode — every desk picks it up immediately`, 'success'); after();
        } catch (err) {
          apiError(err, 'Mode not changed');
          error.textContent=err.message==='reason_required'?'Enter a reason with at least 5 characters.':'Mode was not changed. Review the error and try again.';
        }
        finally { busy(button, false); }
      };
    },
  });
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
    const button=e.currentTarget;busy(button, true);
    try { await api.post('/admin/demo-mode', { enabled: on }); toast(on ? 'Demo mode on — demo logins are on the sign-in page' : 'Demo mode off — demo logins disabled', 'success'); paintDemo(root); }
    catch (err) { apiError(err); } finally { busy(button, false); }
  });
}

function wire(root, reload) {
  paintOpMode(root);
  paintGoLive(root);
  paintBackups(root);
  paintDemo(root);
  paintClinics(root);
  root.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
    const actionButton = ev.currentTarget;
    busy(actionButton, true, 'Saving');
    try {
      const form = root.querySelector('[data-sf]');
      if (!form.reportValidity()) { busy(actionButton, false); return; }
      const body = Object.fromEntries(new FormData(form));
      for (const checkbox of form.querySelectorAll('input[type=checkbox][name]')) body[checkbox.name] = checkbox.checked ? '1' : '0';
      await api.patch('/settings', body);
      await loadMeta(true);
      toast('Settings saved — every desk picks these up immediately', 'success');
      await reload();
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
    if(can('admin.write')){const add=root.querySelector('[data-new-clinic]');add.onclick=()=>clinicForm(data,null,()=>paintClinics(root));add.disabled=false;add.removeAttribute('aria-busy');}
    host.querySelectorAll('[data-edit-clinic]').forEach(button=>button.hidden=!can('admin.write'));
    host.querySelectorAll('[data-edit-clinic]').forEach(btn=>btn.onclick=()=>clinicForm(data,data.rows.find(s=>s.id===+btn.dataset.editClinic),()=>paintClinics(root)));
  } catch(e) { host.innerHTML='Could not load clinic hours. <button type="button" class="btn-secondary btn-sm" data-retry-clinics>Retry</button>';host.querySelector('[data-retry-clinics]').onclick=()=>paintClinics(root);apiError(e); }
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
      const form=root.querySelector('[data-clinic-form]');if(!form.reportValidity())return;const button=ev.currentTarget;busy(button,true);
      try {const body=Object.fromEntries(new FormData(form));await (session?api.patch(`/admin/clinic-sessions/${session.id}`,body):api.post('/admin/clinic-sessions',body));close();toast('Clinic hours saved — shown on Appointments','success');after();}catch(e){apiError(e);}finally{busy(button,false);}
    };}});
}

/** Before going live: what is still to be done, each with a link to fix it. Collapses once everything is green. */
async function paintGoLive(root) {
  const host = root.querySelector('[data-golive]');
  if (!host) return;
  let d;
  try { d = await api.get('/admin/go-live'); } catch { return; }
  if (!root.isConnected) return;
  const icon = (i) => i.ok ? '<span class="material-symbols-outlined text-[18px] text-success">check_circle</span>'
    : i.level === 'info' ? '<span class="material-symbols-outlined text-[18px] text-info">info</span>' : '<span class="material-symbols-outlined text-[18px] text-warning">error</span>';
  const open = d.items.filter((i) => !i.ok);
  host.innerHTML = `<details class="card mb-5" ${d.ready ? '' : 'open'}>
    <summary class="cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
      <span class="font-title-md">Before going live <span class="text-body-md text-on-surface-variant font-normal">· ${d.done} of ${d.total} done</span></span>
      ${d.ready ? '<span class="pill-success pill-dot">Ready</span>' : `<span class="pill-warning pill-dot">${open.filter((i) => i.level !== 'info').length} to do</span>`}</summary>
    <ul class="divide-y divide-outline-variant border-t border-outline-variant">${[...open, ...d.items.filter((i) => i.ok)].map((i) => `<li class="flex items-start gap-3 px-4 py-2.5">${icon(i)}
      <div class="flex-1 min-w-0"><div class="font-label-lg">${esc(i.title)}</div><div class="text-body-sm text-on-surface-variant">${esc(i.detail)}</div></div>
      ${!i.ok && i.href ? `<a class="btn-ghost btn-sm shrink-0" href="${esc(i.href)}">Fix</a>` : ''}</li>`).join('')}</ul></details>`;
}
