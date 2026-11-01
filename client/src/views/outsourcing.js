/**
 * Outsourcing desk — tests and scans done by tie-up laboratories and imaging centres.
 * Send (dispatch manifest / referral) → track (expected date, overdue) → record the centre's report
 * → accept → match the centre's bill → pay. Patients are billed once, on the normal bill.
 */
import {
  page, eyebrow, liveChip, kpiRow, live, mountPage, card,
  api, can, setting, esc, bind, toast, modal, apiError, busy, priorityPill, money, fmtDateTime, kpi, printDocument, headCount, todayISO, services,
} from './_kit.js';
import { mountAttachments } from '../attachments.js';
import { recordReportDialog, acceptReportDialog } from '../outsource.js';

const TABS = [['send', 'To send'], ['sent', 'Sent — awaiting report'], ['accept', 'Reports to accept'], ['dispatches', 'Dispatches'], ['rates', 'Centres & rates'], ['bills', 'Centre bills']];
const canFinance = () => can('finance.view');
const canMaster = () => can('admin.view') || (can('staff.manage') && (can('lab.verify') || can('imaging.report')));

export async function mount(ctx) {
  let tab = ctx.query.tab || 'send';
  const root = mountPage(ctx, page({
    wide: true, eyebrow: `${eyebrow('Laboratory & imaging', 'local_shipping')} ${liveChip()}`, title: 'Outsourcing',
    subtitle: 'Tests and scans done by tie-up labs and imaging centres — dispatch, reports, acceptance and the centres\' bills.',
    body: `${kpiRow([], 4)}
      <div class="card p-1.5 flex flex-wrap gap-1" role="tablist" data-tabs></div>
      <div data-body class="space-y-5"></div>`,
  }));
  let w = null, pay = null, rates = null, providers = [];

  async function load() {
    w = await api.get('/outsource/worklist');
    const s = w.summary;
    headCount(root, `${s.to_send} to send · ${s.overdue} overdue`);
    root.querySelector('[data-kpis]').innerHTML = [
      { label: 'To send', value: s.to_send, icon: 'outbox', tone: s.to_send ? 'warning' : 'neutral', sub: 'Outside orders not yet dispatched' },
      { label: 'At the centre', value: s.sent, icon: 'local_shipping', tone: 'info', sub: 'Waiting for the report' },
      { label: 'Overdue', value: s.overdue, icon: 'schedule', tone: s.overdue ? 'danger' : 'success', sub: 'Past the expected time' },
      { label: 'Reports to accept', value: s.to_accept, icon: 'fact_check', tone: s.to_accept ? 'warning' : 'neutral', sub: 'Check and publish' },
    ].map(kpi).join('');
    if (tab === 'rates' || tab === 'send') { providers = await api.get('/diagnostic-providers'); rates = await api.get('/outsource/rates'); }
    if (tab === 'bills' && canFinance()) pay = await api.get('/outsource/payables');
    paint();
  }

  function paint() {
    const visible = TABS.filter(([k]) => k !== 'bills' || canFinance());
    root.querySelector('[data-tabs]').innerHTML = visible.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}"
      class="px-3 h-9 rounded font-label-lg ${k === tab ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}">${l}${
      k === 'send' ? ` <span class="font-data-mono opacity-80">${w.summary.to_send}</span>` : k === 'accept' ? ` <span class="font-data-mono opacity-80">${w.summary.to_accept}</span>` : ''}</button>`).join('');
    root.querySelector('[data-body]').innerHTML = ({ send: sendTab, sent: sentTab, accept: acceptTab, dispatches: dispatchTab, rates: ratesTab, bills: billsTab })[tab]();
  }

  /* ---------------------------------------------------------------- tabs */
  const table = (cols, rows, empty) => `<div class="overflow-auto"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${cols.length}" class="text-center text-on-surface-variant py-8">${empty}</td></tr>`}</tbody></table></div>`;

  function sendTab() {
    const byCentre = new Map();
    for (const r of w.to_send) { if (!byCentre.has(r.provider_id)) byCentre.set(r.provider_id, { name: r.provider_name, billing: r.billing, rows: [] }); byCentre.get(r.provider_id).rows.push(r); }
    if (!byCentre.size) return card({ title: 'Nothing to send', body: '<p class="text-body-md text-on-surface-variant">Orders sent to an outside centre appear here once ordered. Lab samples are listed as soon as they are taken.</p>' });
    return [...byCentre.entries()].map(([pid, c]) => card({
      title: c.name, subtitle: c.billing === 'outside' ? 'Patient pays the centre directly — referral only' : 'Billed here; the centre bills the hospital',
      actions: `<button class="btn-primary btn-sm" data-dispatch="${pid}">Dispatch selected</button>`, pad: false,
      body: table(['', 'Order', 'Patient', 'Their code', 'Sample', 'Transport', 'Status'], c.rows.map((r) => `<tr>
        <td><input type="checkbox" data-pick="${pid}" value="${r.id}" ${r.ready ? 'checked' : 'disabled title="Take the sample first"'}></td>
        <td><b>${esc(r.label)}</b><div class="text-body-sm font-data-mono">${esc(r.order_no)}</div>${priorityPill(r.priority)}</td>
        <td>${esc(r.patient_name)}<div class="text-body-sm font-data-mono">${esc(r.uhid)}</div></td>
        <td class="font-data-mono">${esc(r.provider_test_code || '—')}</td><td>${esc(r.sample_id || r.sample_type || '—')}</td><td>${esc(r.transport || '—')}</td>
        <td>${r.ready ? '<span class="pill-success">Ready</span>' : '<span class="pill-warning">Sample not taken</span>'}</td></tr>`), ''),
    })).join('');
  }

  function sentTab() {
    return card({ title: 'At the centre', subtitle: 'Overdue first. Attach the report when it comes back, then record it.', pad: false,
      body: table(['Order', 'Patient', 'Centre', 'Dispatch', 'Their ref', 'Expected', ''], w.sent.map((r) => `<tr>
        <td><b>${esc(r.label)}</b><div class="text-body-sm font-data-mono">${esc(r.order_no)}</div></td>
        <td>${esc(r.patient_name)}<div class="text-body-sm font-data-mono">${esc(r.uhid)}</div></td>
        <td>${esc(r.provider_name)}</td><td class="font-data-mono">${esc(r.dispatch_no)}<div class="text-body-sm">${esc(fmtDateTime(r.dispatched_at))}</div></td>
        <td class="font-data-mono">${esc(r.external_ref || r.study_no || '—')}</td>
        <td>${r.overdue ? '<span class="pill-danger">Overdue</span> ' : ''}${esc(fmtDateTime(r.expected_at))}${r.item_status === 'report_received' ? '<div><span class="pill-info">Report recorded</span></div>' : ''}</td>
        <td><div class="flex flex-wrap gap-1 justify-end">
          <button class="btn-primary btn-xs" data-report="${r.id}">Report came back</button>
          <button class="btn-ghost btn-xs" data-item="${r.item_id}" data-oid="${r.id}">Ref / date</button>
          <button class="btn-ghost btn-xs text-danger" data-recall="${r.item_id}">Recall</button></div></td></tr>`), 'Nothing is out at a centre.') });
  }

  function acceptTab() {
    return card({ title: 'Reports to accept', subtitle: 'Check each report belongs to the right patient, test and sample before it reaches the doctor.', pad: false,
      body: table(['Order', 'Patient', 'From', 'Signed by', 'Version', ''], w.to_accept.map((x) => `<tr>
        <td><b>${esc(x.label)}</b><div class="text-body-sm font-data-mono">${esc(x.order_no)}</div></td>
        <td>${esc(x.patient_name)}<div class="text-body-sm font-data-mono">${esc(x.uhid)}</div></td>
        <td>${esc(x.reporting_lab)}${x.external_report_no ? `<div class="text-body-sm font-data-mono">${esc(x.external_report_no)}</div>` : ''}</td>
        <td>${esc(x.signatory_name)}<div class="text-body-sm">${esc(x.signatory_reg_no || '')}</div></td>
        <td>v${x.version}${x.is_correction ? ' <span class="pill-warning">Correction</span>' : ''}</td>
        <td class="text-right"><button class="btn-primary btn-xs" data-accept="${x.id}">Check & accept</button></td></tr>`), 'No report is waiting.') });
  }

  function dispatchTab() {
    return card({ title: 'Dispatches', subtitle: 'Last 50. Print the manifest for the courier; record when the centre signs for it.', pad: false,
      body: table(['Dispatch', 'Centre', 'Sent', 'Courier', 'Items', 'Status', ''], w.dispatches.map((d) => `<tr>
        <td class="font-data-mono">${esc(d.dispatch_no)}</td><td>${esc(d.provider_name)}</td><td>${esc(fmtDateTime(d.dispatched_at))}</td>
        <td>${esc(d.courier_name || (d.kind === 'imaging' ? 'Patient referral' : '—'))}</td><td>${d.items}</td>
        <td>${d.status === 'acknowledged' ? `<span class="pill-success">Signed by ${esc(d.acknowledged_name)}</span>` : '<span class="pill-warning">Not yet signed</span>'}</td>
        <td><div class="flex gap-1 justify-end"><button class="btn-secondary btn-xs" data-manifest="${d.id}">Manifest</button>
          ${d.status === 'dispatched' ? `<button class="btn-ghost btn-xs" data-ack="${d.id}">Centre signed</button>` : ''}</div></td></tr>`), 'Nothing dispatched yet.') });
  }

  function ratesTab() {
    return `${card({ title: 'Centres', actions: canMaster() ? '<button class="btn-secondary btn-sm" data-new-centre>Add centre</button>' : '', pad: false,
      body: table(['Centre', 'Kind', 'Who pays', 'Contact', 'Usual TAT', 'Credit'], providers.map((p) => `<tr>
        <td><b>${esc(p.name)}</b>${p.active ? '' : ' <span class="pill-neutral">Inactive</span>'}</td><td>${p.kind === 'imaging' ? 'Imaging' : 'Laboratory'}</td>
        <td>${p.billing === 'outside' ? 'Patient pays them' : 'We bill; they bill us'}</td><td>${esc([p.contact_person, p.phone].filter(Boolean).join(' · ') || '—')}</td>
        <td>${p.default_tat_hours ? `${p.default_tat_hours} h` : '—'}</td><td>${p.credit_days ? `${p.credit_days} days` : '—'}</td></tr>`), 'No centre added.') })}
      ${card({ title: 'Outsourced test rates', subtitle: 'Our selling price is the tariff; their cost, code, TAT and transport are kept here. ★ = preferred centre for the test.',
        actions: canMaster() ? '<button class="btn-primary btn-sm" data-new-rate>Add / change rate</button>' : '', pad: false,
        body: table(['Test', 'Centre', 'Their code', 'Our price', 'Their cost', 'Margin', 'TAT', 'Transport'], rates.map((r) => `<tr>
          <td><b>${esc(r.service_name)}</b><div class="text-body-sm font-data-mono">${esc(r.service_code)}</div></td>
          <td>${r.preferred_provider_id === r.provider_id ? '★ ' : ''}${esc(r.provider_name)}${r.active ? '' : ' <span class="pill-neutral">Off</span>'}</td>
          <td class="font-data-mono">${esc(r.provider_test_code || '—')}</td><td class="num">${money(r.selling_price)}</td><td class="num">${money(r.cost_price)}</td>
          <td class="num ${r.margin < 0 ? 'text-danger' : ''}">${money(r.margin)}</td><td>${r.tat_hours ? `${r.tat_hours} h` : '—'}</td><td>${esc(r.transport || '—')}</td></tr>`), 'No rates yet.') })}`;
  }

  function billsTab() {
    if (!pay) return '';
    return `${card({ title: 'What we owe each centre', pad: false,
      body: table(['Centre', 'Billed to us', 'Paid', 'Outstanding', 'Done, not yet billed', ''], pay.providers.map((p) => `<tr>
        <td><b>${esc(p.name)}</b></td><td class="num">${money(p.billed)}</td><td class="num">${money(p.paid)}</td><td class="num font-semibold">${money(p.outstanding)}</td>
        <td>${p.uninvoiced} order(s) · about ${money(p.uninvoiced_cost)}</td>
        <td><div class="flex gap-1 justify-end">${can('finance.payables') ? `<button class="btn-primary btn-xs" data-new-bill="${p.id}">Enter their bill</button>
          ${p.outstanding > 0 ? `<button class="btn-secondary btn-xs" data-pay="${p.id}">Pay</button>` : ''}` : ''}</div></td></tr>`), 'No tie-up centre that bills the hospital.') })}
      ${card({ title: 'Centre bills', pad: false, body: table(['Our ref', 'Centre', 'Their bill', 'Date', 'Lines', 'Total', 'Paid', 'Status'], pay.invoices.map((i) => `<tr>
        <td class="font-data-mono">${esc(i.ref_no)}</td><td>${esc(i.provider_name)}</td><td class="font-data-mono">${esc(i.invoice_no)}</td><td>${esc(i.invoice_date)}</td>
        <td>${i.lines}</td><td class="num">${money(i.total)}</td><td class="num">${money(i.paid)}</td><td>${esc(i.status.replace('_', ' '))}</td></tr>`), 'No bill entered yet.') })}
      <p class="text-body-sm text-on-surface-variant">A centre's bill is the hospital's cost and payable only. It never adds to a patient bill. Reports: Outsourced tests — margin, turnaround and payables.</p>`;
  }

  /* ---------------------------------------------------------------- actions */
  bind(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; load().catch(apiError); });
  bind(root, 'click', '[data-dispatch]', (e, b) => {
    const pid = +b.dataset.dispatch;
    const ids = [...root.querySelectorAll(`[data-pick="${pid}"]:checked`)].map((c) => +c.value);
    if (!ids.length) { toast('Tick the orders going in this dispatch', 'warning'); return; }
    const rows = w.to_send.filter((r) => ids.includes(r.id));
    const kind = rows[0].category;
    modal({ title: `Dispatch to ${rows[0].provider_name}`, size: 'md', stack: true,
      body: `<form class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-f>
        ${kind === 'lab' ? `<div><label class="field-label">Courier / staff name *</label><input class="field" name="courier_name" required></div>
          <div><label class="field-label">Phone</label><input class="field" name="courier_phone"></div>
          <div><label class="field-label">Temperature</label><select class="field" name="temperature"><option>Room temperature</option><option>2–8 °C (cold box)</option><option>Frozen</option></select></div>
          <div><label class="field-label">Sample condition</label><select class="field" name="sample_condition"><option>Good</option><option>Haemolysed</option><option>Lipaemic</option><option>Low volume</option></select></div>`
          : '<div class="sm:col-span-2 text-body-md">Referral: the patient goes to the centre. Record each appointment below if known.</div>'}
        ${rows.map((r) => `<div class="sm:col-span-2 rounded border border-outline-variant p-2"><b>${esc(r.label)}</b> — ${esc(r.patient_name)} <span class="font-data-mono text-body-sm">${esc(r.order_no)}</span>
          ${kind === 'imaging' ? `<input class="field field-sm mt-1" type="datetime-local" data-appt="${r.id}" aria-label="Appointment">` : ''}</div>`).join('')}
        <div class="sm:col-span-2"><label class="field-label">Notes</label><input class="field" name="notes"></div></form>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-go>Dispatch & print manifest</button>',
      onMount(m, close) {
        m.querySelector('[data-go]').onclick = async (ev) => {
          const form = m.querySelector('[data-f]');
          if (!form.reportValidity()) return;
          busy(ev.currentTarget, true);
          try {
            const body = Object.fromEntries(new FormData(form));
            body.provider_id = pid;
            body.items = rows.map((r) => ({ order_id: r.id, appointment_at: m.querySelector(`[data-appt="${r.id}"]`)?.value?.replace('T', ' ') || undefined }));
            const d = await api.post('/outsource/dispatches', body);
            close(); toast(`${d.dispatch_no} — ${d.items} item(s) sent`, 'success');
            printManifest(d.id); load();
          } catch (err) { apiError(err, 'Not dispatched'); busy(ev.currentTarget, false); }
        };
      } });
  });
  bind(root, 'click', '[data-manifest]', (e, b) => printManifest(+b.dataset.manifest));
  bind(root, 'click', '[data-ack]', (e, b) => {
    modal({ title: 'Centre signed for the dispatch', size: 'sm', stack: true,
      body: '<label class="field-label">Received by (name at the centre) *</label><input class="field" data-who>',
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save</button>',
      onMount(m, close) { m.querySelector('[data-ok]').onclick = async () => {
        try { await api.post(`/outsource/dispatches/${b.dataset.ack}/acknowledge`, { received_by: m.querySelector('[data-who]').value.trim() }); close(); load(); }
        catch (err) { apiError(err); } }; } });
  });
  bind(root, 'click', '[data-report]', (e, b) => {
    const r = w.sent.find((x) => x.id === +b.dataset.report);
    modal({ title: `Attach the report — ${r.label}`, size: 'md', stack: true, body: '<div data-att></div><p class="text-body-sm text-on-surface-variant mt-2">Upload their PDF or photo, then record the report details.</p>',
      footer: '<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-next>Next — report details</button>',
      onMount(m, close) {
        mountAttachments(m.querySelector('[data-att]'), 'order', r.id, { canEdit: true });
        m.querySelector('[data-next]').onclick = () => { close(); recordReportDialog(r, () => load()); };
      } });
  });
  bind(root, 'click', '[data-accept]', (e, b) => acceptReportDialog(w.to_accept.find((x) => x.id === +b.dataset.accept), () => load()));
  bind(root, 'click', '[data-item]', (e, b) => {
    const r = w.sent.find((x) => x.item_id === +b.dataset.item);
    modal({ title: `Centre reference — ${r.label}`, size: 'sm', stack: true,
      body: `<div class="space-y-2"><div><label class="field-label">Their reference / sample no.</label><input class="field" data-k="external_ref" value="${esc(r.external_ref || '')}"></div>
        <div><label class="field-label">Expected report</label><input class="field" type="datetime-local" data-k="expected_at" value="${esc(String(r.expected_at || '').replace(' ', 'T').slice(0, 16))}"></div>
        ${r.category === 'imaging' ? `<div><label class="field-label">Study number</label><input class="field" data-k="study_no" value="${esc(r.study_no || '')}"></div>
          <div><label class="field-label">Images link (PACS / DICOM)</label><input class="field" data-k="image_link" value="${esc(r.image_link || '')}"></div>` : ''}</div>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save</button>',
      onMount(m, close) { m.querySelector('[data-ok]').onclick = async () => {
        const body = Object.fromEntries([...m.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.type === 'datetime-local' && i.value ? `${i.value.replace('T', ' ')}:00` : i.value]));
        try { await api.patch(`/outsource/items/${r.item_id}`, body); close(); load(); } catch (err) { apiError(err); } }; } });
  });
  bind(root, 'click', '[data-recall]', async (e, b) => {
    const reason = prompt('Why is this sample / referral recalled? (sample lost, rejected by the centre …)');
    if (!reason) return;
    try { await api.post(`/outsource/items/${b.dataset.recall}/recall`, { reason }); toast('Recalled — the order can be sent again', 'info'); load(); } catch (err) { apiError(err); }
  });
  bind(root, 'click', '[data-new-centre]', () => centreForm(load));
  bind(root, 'click', '[data-new-rate]', () => rateForm(providers, load));
  bind(root, 'click', '[data-new-bill]', (e, b) => billForm(+b.dataset.newBill, pay.providers.find((p) => p.id === +b.dataset.newBill), load));
  bind(root, 'click', '[data-pay]', (e, b) => payForm(pay.providers.find((p) => p.id === +b.dataset.pay), load));

  return live({ topics: ['outsourcing', 'lab', 'imaging'], events: ['outsource.dispatched', 'outsource.report', 'outsource.updated', 'outsource.acknowledged', 'outsource.invoice', 'outsource.paid', 'orders.created', 'order.updated', 'lab.verified'], load });
}

async function printManifest(id) {
  try {
    const d = await api.get(`/outsource/dispatches/${id}`);
    printDocument(`Dispatch ${d.dispatch_no}`, `
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px">
        <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(setting('hospital_name', ''))}</div><div style="font-size:11px">${esc(setting('address', ''))}</div></div>
        <div style="text-align:right"><div style="font-weight:700">${d.kind === 'imaging' ? 'REFERRAL LIST' : 'SAMPLE DISPATCH MANIFEST'}</div><div style="font-family:monospace">${esc(d.dispatch_no)}</div><div style="font-size:11px">${esc(fmtDateTime(d.dispatched_at))}</div></div></div>
      <p style="margin-top:8px"><b>To</b> ${esc(d.provider_name)} ${d.provider_phone ? `· ${esc(d.provider_phone)}` : ''}<br>${d.courier_name ? `<b>Courier</b> ${esc(d.courier_name)} ${esc(d.courier_phone || '')} · ` : ''}${d.temperature ? `<b>Temperature</b> ${esc(d.temperature)} · ` : ''}<b>Sent by</b> ${esc(d.dispatched_by_name || '')}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr><th>#</th><th>Patient</th><th>Age/Sex</th><th>Test</th><th>Their code</th><th>Sample / ID</th><th>Specimen</th><th>Condition</th><th>Expected</th></tr></thead>
        <tbody>${d.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.patient_name)}<br><span style="font-size:10px">${esc(i.uhid)}</span></td><td>${i.age_years ?? ''} ${esc(i.gender || '')}</td>
          <td>${esc(i.label)}</td><td>${esc(i.provider_test_code || '')}</td><td style="font-family:monospace">${esc(i.sample_id || i.order_no)}</td><td>${esc(i.specimen || '')}</td><td>${esc(i.condition || '')}</td><td>${esc(fmtDateTime(i.expected_at))}</td></tr>`).join('')}</tbody></table>
      <table style="width:100%;margin-top:40px"><tr><td>Handed over by: ____________________</td><td>Received at centre by: ____________________</td><td>Date / time: ______________</td></tr></table>`);
  } catch (err) { apiError(err); }
}

function centreForm(after) {
  modal({ title: 'Add a tie-up centre', size: 'md', stack: true,
    body: `<form class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-f>
      <div class="sm:col-span-2"><label class="field-label">Name *</label><input class="field" name="name" required></div>
      <div><label class="field-label">Kind</label><select class="field" name="kind"><option value="lab">Laboratory</option><option value="imaging">Imaging centre</option></select></div>
      <div><label class="field-label">Who pays</label><select class="field" name="billing"><option value="hospital">We bill the patient; the centre bills us</option><option value="outside">Patient pays the centre directly</option></select></div>
      <div><label class="field-label">Contact person</label><input class="field" name="contact_person"></div><div><label class="field-label">Phone</label><input class="field" name="phone"></div>
      <div><label class="field-label">Email</label><input class="field" name="email"></div><div><label class="field-label">GSTIN</label><input class="field" name="gstin"></div>
      <div><label class="field-label">Usual report time (hours)</label><input class="field" type="number" min="1" name="default_tat_hours" value="48"></div>
      <div><label class="field-label">Credit days</label><input class="field" type="number" min="0" name="credit_days" value="30"></div>
      <div class="sm:col-span-2"><label class="field-label">Address</label><input class="field" name="address"></div></form>
      <p class="text-body-sm text-on-surface-variant mt-2">Who pays is fixed once saved — it decides whether the hospital charges for this centre's work. MRI is not offered.</p>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save centre</button>',
    onMount(m, close) { m.querySelector('[data-ok]').onclick = async (ev) => {
      const f = m.querySelector('[data-f]'); if (!f.reportValidity()) return; busy(ev.currentTarget, true);
      try { await api.post('/diagnostic-providers', Object.fromEntries(new FormData(f))); close(); toast('Centre added', 'success'); after(); } catch (err) { apiError(err); busy(ev.currentTarget, false); } }; } });
}

function rateForm(providers, after) {
  const tests = services().filter((s) => ['lab', 'imaging'].includes(s.category) && s.active !== 0 && !/\bMRI\b/i.test(s.name));
  modal({ title: 'Outsourced test rate', size: 'md', stack: true,
    body: `<form class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-f>
      <div class="sm:col-span-2"><label class="field-label">Test *</label><select class="field" name="service_id" required>${tests.map((s) => `<option value="${s.id}">${esc(s.name)} — ${esc(s.code)} · ${money(s.price)}</option>`).join('')}</select></div>
      <div class="sm:col-span-2"><label class="field-label">Centre *</label><select class="field" name="provider_id" required>${providers.filter((p) => p.active).map((p) => `<option value="${p.id}">${esc(p.name)} (${p.kind})</option>`).join('')}</select></div>
      <div><label class="field-label">Their test code</label><input class="field" name="provider_test_code"></div>
      <div><label class="field-label">Their charge to us (₹) *</label><input class="field" type="number" min="0" step="0.01" name="cost_price" required></div>
      <div><label class="field-label">Report time (hours)</label><input class="field" type="number" min="1" name="tat_hours"></div>
      <div><label class="field-label">Transport</label><select class="field" name="transport"><option>Room temperature</option><option>2–8 °C (cold box)</option><option>Frozen</option><option>Patient goes to centre</option></select></div>
      <div class="sm:col-span-2"><label class="field-label">Collection notes</label><input class="field" name="collection_notes" placeholder="e.g. Fasting 10 h; 2 ml serum in plain tube"></div>
      <label class="sm:col-span-2 flex items-center gap-2"><input type="checkbox" name="preferred"> Preferred centre for this test (new orders go here by default)</label></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save rate</button>',
    onMount(m, close) { m.querySelector('[data-ok]').onclick = async (ev) => {
      const f = m.querySelector('[data-f]'); if (!f.reportValidity()) return; busy(ev.currentTarget, true);
      const body = Object.fromEntries(new FormData(f)); body.preferred = f.preferred.checked;
      try { await api.post('/outsource/rates', body); close(); toast('Rate saved', 'success'); after(); } catch (err) { apiError(err); busy(ev.currentTarget, false); } }; } });
}

async function billForm(providerId, p, after) {
  const rows = await api.get(`/outsource/providers/${providerId}/uninvoiced`);
  modal({ title: `Enter ${p.name}'s bill`, size: 'lg', stack: true,
    body: `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label class="field-label">Their bill number *</label><input class="field" data-no></div>
      <div><label class="field-label">Bill date</label><input class="field" type="date" data-date value="${todayISO()}"></div></div>
      <p class="text-body-sm text-on-surface-variant mt-2">Tick the orders on their bill and enter what they charged. An order can be on one bill only.</p>
      <div class="overflow-auto max-h-[45vh] mt-2"><table class="tbl"><thead><tr><th></th><th>Order</th><th>Patient</th><th class="text-right">We charged</th><th class="text-right">Agreed rate</th><th>Their charge</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr><td><input type="checkbox" data-o="${r.id}" checked></td><td>${esc(r.label)}<div class="text-body-sm font-data-mono">${esc(r.order_no)}</div></td>
        <td>${esc(r.patient_name)}</td><td class="num">${money(r.patient_charge)}</td><td class="num">${r.expected_cost == null ? '—' : money(r.expected_cost)}</td>
        <td><input class="field field-sm w-28" type="number" min="0" step="0.01" data-c="${r.id}" value="${r.expected_cost ?? ''}"></td></tr>`).join('')
        : '<tr><td colspan="6" class="text-center py-6 text-on-surface-variant">No completed order waiting to be billed by this centre.</td></tr>'}</tbody></table></div>
      <div class="text-right font-label-lg mt-2">Total <span class="font-data-mono" data-total>₹0</span></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save bill (payable)</button>',
    onMount(m, close) {
      const items = () => [...m.querySelectorAll('[data-o]:checked')].map((c) => ({ order_id: +c.dataset.o, cost: +(m.querySelector(`[data-c="${c.dataset.o}"]`).value || 0) }));
      const total = () => { m.querySelector('[data-total]').textContent = money(items().reduce((s, i) => s + i.cost, 0)); };
      m.addEventListener('input', total); m.addEventListener('change', total); total();
      m.querySelector('[data-ok]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try { const inv = await api.post('/outsource/invoices', { provider_id: providerId, invoice_no: m.querySelector('[data-no]').value.trim(), invoice_date: m.querySelector('[data-date]').value, items: items() });
          close(); toast(`${inv.ref_no} saved — ${money(inv.total)} payable`, 'success'); after(); }
        catch (err) { apiError(err, 'Bill not saved'); busy(ev.currentTarget, false); }
      };
    } });
}

function payForm(p, after) {
  modal({ title: `Pay ${p.name}`, size: 'sm', stack: true,
    body: `<div class="space-y-2"><p class="text-body-md">Outstanding ${money(p.outstanding)}</p>
      <div><label class="field-label">Amount *</label><input class="field" type="number" min="0" step="0.01" data-amt value="${p.outstanding}"></div>
      <div><label class="field-label">Mode</label><select class="field" data-mode><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option></select></div>
      <div><label class="field-label">Reference (UTR / cheque no.)</label><input class="field" data-ref></div></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Record payment</button>',
    onMount(m, close) { m.querySelector('[data-ok]').onclick = async (ev) => {
      busy(ev.currentTarget, true);
      try { await api.post('/outsource/payments', { provider_id: p.id, amount: +m.querySelector('[data-amt]').value, mode: m.querySelector('[data-mode]').value, reference: m.querySelector('[data-ref]').value.trim() });
        close(); toast('Payment recorded', 'success'); after(); } catch (err) { apiError(err); busy(ev.currentTarget, false); } }; } });
}
