/**
 * Investigation queue — every lab and imaging order in one list, however it arrived (doctor
 * portal, paper prescription at reception, paper request at the department) and wherever it goes
 * (in-house or an outside lab / centre). Reception decides the money here; the clinical work, the
 * authorisation and the report each keep their own status beside it.
 */
import {
  page, eyebrow, liveChip, kpiRow, filterBar, wireFilters, live, mountPage, tableCard,
  api, qs, can, navigate, setting, esc, bind, toast, modal, confirmDialog, apiError, busy, priorityPill,
  money, fmtDateTime, kpi, printDocument, headCount, todayISO, shiftDate, doctors,
} from './_kit.js';
import { collectBill } from '../collect.js';
import { receptionBillsTests, openDiagnosticsBilling } from '../reception-diagnostics.js';

const MONEY = {
  unbilled: ['warning', 'Not billed'], unpaid: ['danger', 'Unpaid'], partial: ['warning', 'Part-paid'], paid: ['success', 'Paid'],
  due_credit: ['info', 'Due / credit'], payer_pending: ['info', 'Payer pending'], covered: ['success', 'Payer covered'], ip_ledger: ['info', 'On IP bill'],
  er_deferred: ['info', 'ER — bill later'], waived: ['neutral', 'Waived'], paid_outside: ['neutral', 'Paid at centre'], cancelled: ['neutral', 'Cancelled'], bill_cancelled: ['danger', 'Bill cancelled'],
};
const AUTH = { not_required: ['neutral', 'Not needed'], pending: ['warning', 'Pending'], approved: ['success', 'Approved'], rejected: ['danger', 'Rejected'], emergency_override: ['info', 'Emergency'] };
const RESULT = { pending: ['neutral', 'Pending'], draft: ['info', 'Draft'], under_verification: ['warning', 'To verify'], released: ['success', 'Released'], amended: ['info', 'Amended'] };
const WORK = { ordered: 'Ordered', awaiting_payment: 'Waiting for money', scheduled: 'Scheduled', collected: 'Sample taken', in_progress: 'In progress', reported: 'Reported', verified: 'Done', cancelled: 'Cancelled' };
const KIND = { OP: 'OP', IP: 'IP', EMG: 'ER' };
const tag = ([tone, label]) => `<span class="pill-${tone} pill-dot whitespace-nowrap">${esc(label)}</span>`;

let f = { q: '', category: '', kind: '', priority: '', source: '', dest: '', money: '', work: 'open', doctor_id: '', from: shiftDate(todayISO(), -6), to: todayISO() };

export async function mount(ctx) {
  f={q:'',category:'',kind:'',priority:'',source:'',dest:'',money:'',work:'open',doctor_id:'',from:todayISO(),to:todayISO()};
  if (ctx.query.money) f.money = ctx.query.money;
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });
  let data = null;

  async function load() {
    data = await api.get(`/reception/investigations${qs(f)}`);
    const s = data.summary;
    headCount(root, `${s.unbilled + s.unpaid} need money · ${s.total} open`);
    root.querySelector('[data-kpis]').innerHTML = [
      { label: 'Not billed', value: s.unbilled, icon: 'receipt', tone: s.unbilled ? 'warning' : 'neutral', sub: 'Orders without a bill' },
      { label: 'Waiting for payment', value: s.unpaid, icon: 'payments', tone: s.unpaid ? 'danger' : 'neutral', sub: 'Unpaid or part-paid' },
      { label: 'Due / credit', value: s.due_credit, icon: 'schedule', tone: 'info', sub: 'Released, pays later' },
      { label: 'Payer / pre-auth', value: s.payer_pending, icon: 'health_and_safety', tone: 'info', sub: 'Insurance, scheme, corporate' },
      { label: 'ER — bill later', value: s.er_deferred, icon: 'emergency', tone: 'info', sub: 'Never held for money' },
      { label: 'Sent outside', value: s.outsourced, icon: 'local_shipping', tone: 'neutral', sub: `${s.paper} from paper` },
    ].map(kpi).join('');
    const tbody = root.querySelector('[data-rows]');
    tbody.innerHTML = data.rows.length ? data.rows.map(row).join('')
      : '<tr><td colspan="8" class="text-center text-on-surface-variant py-8">Nothing in the queue for these filters.</td></tr>';
  }

  const find = (id) => data?.rows.find((r) => r.id === +id);
  // one menu open at a time, placed against the window so the scrolling table never clips it
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('[data-more]') || !d.open) return;
    root.querySelectorAll('[data-more][open]').forEach((x) => { if (x !== d) x.open = false; });
    const menu = d.querySelector('div'), at = d.querySelector('summary').getBoundingClientRect();
    const h = menu.offsetHeight || 280;
    Object.assign(menu.style, { position: 'fixed', right: `${Math.max(8, window.innerWidth - at.right)}px`,
      top: `${at.bottom + h + 8 > window.innerHeight ? Math.max(8, at.top - h - 4) : at.bottom + 4}px` });
  }, true);
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-more]')) root.querySelectorAll('[data-more][open]').forEach((d) => { d.open = false; }); });
  bind(root, 'click', '[data-act]', async (e, b) => {
    b.closest('[data-more]')?.removeAttribute('open');
    const r = find(b.dataset.id);
    if (!r) return;
    const act = b.dataset.act;
    try {
      if (act === 'collect') return collectBill(r.bill_id, load);
      if (act === 'due') return collectBill(r.bill_id, load, { mode: 'due' });
      if (act === 'credit') return collectBill(r.bill_id, load, { mode: 'credit' });
      if (act === 'bill') {
        const same = data.rows.filter((x) => x.encounter_id === r.encounter_id && x.money === 'unbilled').map((x) => x.id);
        busy(b, true);
        const out = await api.post('/reception/investigations/bill', { order_ids: same });
        toast(`Bill ${out.bill.bill_no} · ${money(out.bill.total)} for ${same.length} test(s)`, 'success');
        await load();
        if (out.bill.balance > 0 && can('payment.collect') && r.encounter_kind !== 'IP' && setting('release_op_rule', 'payment') !== 'immediate') collectBill(out.bill.id, load);
        return;
      }
      if (act === 'bill-open') return navigate(`/bills?bill=${r.bill_id}`);
      if (act === 'preauth') return navigate(`/insurance?q=${encodeURIComponent(r.uhid)}`);
      if (act === 'history') return navigate(`/patient/${r.patient_id}`);
      if (act === 'slip') return printSlip(r, data.rows.filter((x) => x.encounter_id === r.encounter_id && x.money !== 'cancelled'));
      if (act === 'dest') return changeDestination(r, load);
      if (act === 'cancel') {
        const ok = await confirmDialog({ title: `Cancel ${r.label}?`, message: `${esc(r.order_no)} for ${esc(r.patient_name)}. The test has not started. Any amount already billed is shown for refund or removal afterwards.`,
          confirmLabel: 'Cancel test', tone: 'danger', requireReason: true });
        if (!ok) return;
        const out = await api.post(`/reception/investigations/${r.id}/cancel`, { reason: ok.reason });
        toast(out.billing_review?.length ? `Cancelled. Review bill ${out.billing_review.map((x) => x.bill_no).join(', ')} — remove the line or refund` : 'Test cancelled', out.billing_review?.length ? 'warning' : 'success');
        return load();
      }
    } catch (err) { apiError(err); busy(b, false); }
  });
  bind(root, 'click', '[data-paper]', () => openDiagnosticsBilling(() => load()));
  return live({ topics: ['billing', 'lab', 'imaging', 'clinical'], events: ['orders.created', 'order.updated', 'payment.received', 'bill.created', 'bill.authorized', 'claim.updated'], load });
}

function row(r) {
  const canCollect = can('payment.collect') && r.bill_id && r.bill_balance > 0.5 && !['ip_ledger', 'er_deferred'].includes(r.money) && r.money !== 'cancelled';
  // one main action on the row; everything else in "More"
  const main = r.money === 'unbilled' && can('billing.create') ? `<button class="btn-primary btn-xs" data-act="bill" data-id="${r.id}">Bill</button>`
    : canCollect ? `<button class="btn-primary btn-xs" data-act="collect" data-id="${r.id}" title="Full or part payment">Collect</button>` : '';
  const item = (act, label, cls = '') => `<button type="button" class="block w-full text-left px-3 py-1.5 hover:bg-surface-container-low ${cls}" data-act="${act}" data-id="${r.id}">${label}</button>`;
  const more = [
    canCollect && can('payment.authorize') && item('due', 'Mark due — patient pays later'),
    canCollect && can('payment.authorize') && item('credit', 'Approved credit'),
    r.auth_status === 'pending' && can('insurance.view') && item('preauth', 'Send for pre-authorisation'),
    r.bill_id && item('bill-open', `Open bill ${esc(r.bill_no)} — discount, receipt, print`),
    ['ordered', 'awaiting_payment', 'scheduled'].includes(r.status) && (can('billing.create') || can('lab.verify')) && item('dest', 'Send to … (in-house / outside centre)'),
    item('slip', 'Print investigation slip'),
    item('history', 'Patient record & billing history'),
    ['ordered', 'awaiting_payment', 'scheduled'].includes(r.status) && can('payment.authorize') && item('cancel', 'Cancel test', 'text-danger'),
  ].filter(Boolean).join('');
  const actions = `${main}<details class="relative inline-block" data-more><summary class="btn-ghost btn-xs list-none cursor-pointer" aria-label="More actions">More ▾</summary>
    <div class="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-outline-variant bg-white shadow-lg py-1 text-body-md">${more}</div></details>`;
  return `<tr>
    <td><div class="font-semibold text-on-surface">${esc(r.label)}</div>
      <div class="text-body-sm text-on-surface-variant font-data-mono">${esc(r.order_no)} · ${esc(fmtDateTime(r.ordered_at))}</div>
      <div class="mt-0.5">${priorityPill(r.priority)} <span class="text-body-sm">${r.category === 'imaging' ? 'Imaging' : 'Lab'}</span>${r.duplicate_of ? ' <span class="pill-warning">Repeat</span>' : ''}</div></td>
    <td><div class="font-semibold">${esc(r.patient_name)}</div><div class="text-body-sm font-data-mono">${esc(r.uhid)}</div>
      <div class="text-body-sm">${KIND[r.encounter_kind] || r.encounter_kind} · ${esc(r.encounter_no)}</div></td>
    <td><div>${esc(r.source_label)}</div><div class="text-body-sm text-on-surface-variant">${esc(r.doctor_name || r.referred_by || '—')}</div></td>
    <td>${r.order_dest === 'outsourced' ? `<span class="pill-info">Outside</span><div class="text-body-sm mt-0.5">${esc(r.provider_name || '')}</div>` : '<span class="text-body-md">In-house</span>'}</td>
    <td>${tag(MONEY[r.money] || ['neutral', r.money])}${r.bill_balance > 0.5 && !['ip_ledger'].includes(r.money) ? `<div class="text-body-sm font-data-mono mt-0.5">${money(r.bill_balance)} due</div>` : ''}</td>
    <td>${tag(AUTH[r.auth_status] || ['neutral', r.auth_status])}</td>
    <td><div class="text-body-md">${esc(WORK[r.status] || r.status)}</div><div class="mt-0.5">${tag(RESULT[r.result_stage] || ['neutral', r.result_stage])}</div></td>
    <td class="whitespace-nowrap text-right">${actions}</td></tr>`;
}

async function changeDestination(r, after) {
  const providers = (await api.get('/diagnostic-providers')).filter((p) => p.kind === r.category && p.active);
  modal({ title: `Where should ${r.label} be done?`, size: 'md', stack: true,
    body: `<div class="space-y-3"><div><label class="field-label">Destination</label><select class="field" data-dest>
        <option value="">In-house — our ${r.category === 'imaging' ? 'radiology' : 'laboratory'}</option>
        ${providers.map((p) => `<option value="${p.id}" ${p.id === r.provider_id ? 'selected' : ''}>${esc(p.name)} — ${p.billing === 'outside' ? 'patient pays the centre' : 'billed here'}</option>`).join('')}</select></div>
      <div><label class="field-label">Reason *</label><input class="field" data-reason placeholder="e.g. Analyser down; send to the tie-up lab"></div>
      <p class="text-body-sm text-on-surface-variant">Only before the sample is taken. A centre the patient pays directly cannot take a test already billed here.</p></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try {
          await api.post(`/orders/${r.id}/destination`, { provider_id: +root.querySelector('[data-dest]').value || null, reason: root.querySelector('[data-reason]').value.trim() });
          close(); toast('Destination changed', 'success'); after();
        } catch (err) { apiError(err); busy(ev.currentTarget, false); }
      };
    },
  });
}

function printSlip(r, rows) {
  const s = { hospital_name: setting('hospital_name', ''), address: setting('address', ''), phone: setting('phone', '') };
  printDocument(`Investigation slip ${r.encounter_no}`, `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px">
      <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(s.hospital_name)}</div><div style="font-size:11px">${esc(s.address)} ${s.phone ? `· ${esc(s.phone)}` : ''}</div></div>
      <div style="text-align:right"><div style="font-weight:700">INVESTIGATION SLIP</div><div style="font-size:11px">${esc(fmtDateTime(new Date().toISOString()))}</div></div></div>
    <table style="width:100%;margin-top:10px;font-size:12px"><tr><td><b>Patient</b> ${esc(r.patient_name)}</td><td><b>UHID</b> ${esc(r.uhid)}</td><td><b>Visit</b> ${esc(r.encounter_no)} (${KIND[r.encounter_kind] || r.encounter_kind})</td></tr>
      <tr><td colspan="3"><b>Requested by</b> ${esc(r.doctor_name || r.referred_by || '—')}</td></tr></table>
    <table style="width:100%;margin-top:10px;border-collapse:collapse"><thead><tr><th>#</th><th>Test</th><th>Order</th><th>Priority</th><th>Where</th><th>Money</th></tr></thead>
      <tbody>${rows.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.label)}</td><td>${esc(x.order_no)}</td><td>${esc(x.priority)}</td><td>${x.order_dest === 'outsourced' ? esc(x.provider_name || 'Outside') : 'In-house'}</td><td>${esc((MONEY[x.money] || ['', x.money])[1])}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:14px;font-size:11px">Take this slip to the sample collection / imaging desk. Tests marked Unpaid start once paid at reception.</p>`);
}

function layout() {
  const opt = (pairs) => pairs.map(([value, label]) => ({ value, label }));
  return page({
    wide: true,
    eyebrow: `${eyebrow('Reception', 'biotech')} ${liveChip()}`,
    title: 'Investigation Queue',
    subtitle: 'Every lab and imaging order — doctor portal, paper slip or department entry — with its money, approval and report status.',
    actions: `${receptionBillsTests() ? '<button class="btn-primary" data-paper><span class="material-symbols-outlined text-[18px]">note_add</span> Tests from a paper slip</button>' : ''}
      <a class="btn-secondary" href="/service-payments">Service payments</a>`,
    body: `
      ${kpiRow([], 6)}
      ${filterBar([
        { type: 'search', key: 'q', placeholder: 'Patient, UHID, mobile, order or visit no.', value: f.q },
        { key: 'money', label: 'Money', value: f.money, options: opt([['', 'All'], ['unbilled', 'Not billed'], ['unpaid,partial', 'Unpaid / part-paid'], ['due_credit', 'Due / credit'], ['payer_pending', 'Payer pending'], ['ip_ledger', 'On IP bill'], ['er_deferred', 'ER — bill later'], ['paid,covered', 'Paid / covered']]) },
        { key: 'kind', label: 'Patient', value: f.kind, options: opt([['', 'All'], ['OP', 'OPD'], ['IP', 'IPD'], ['ICU', 'ICU'], ['EMG', 'Emergency']]) },
        { key: 'category', label: 'Department', value: f.category, options: opt([['', 'All'], ['lab', 'Laboratory'], ['imaging', 'Imaging']]) },
        { key: 'priority', label: 'Priority', value: f.priority, options: opt([['', 'All'], ['stat', 'STAT'], ['urgent', 'Urgent'], ['routine', 'Routine']]) },
        { key: 'source', label: 'Came from', value: f.source, options: opt([['', 'All'], ['doctor_portal', 'Doctor portal'], ['paper_prescription', 'Paper prescription'], ['department_entry', 'Department entry'], ['ward', 'Ward / nursing']]) },
        { key: 'dest', label: 'Done at', value: f.dest, options: opt([['', 'All'], ['internal', 'In-house'], ['outsourced', 'Outside']]) },
        { key: 'doctor_id', label: 'Doctor', value: f.doctor_id, options: [{ value: '', label: 'All' }, ...doctors().filter((d) => d.role === 'doctor').map((d) => ({ value: d.id, label: d.name }))] },
        { key: 'work', label: 'Show', value: f.work, options: opt([['open', 'Open work'], ['all', 'Everything']]) },
        { type: 'date', key: 'from', label: 'From', value: f.from, width: 'w-[150px]' },
        { type: 'date', key: 'to', label: 'To', value: f.to, width: 'w-[150px]' },
      ])}
      ${tableCard({ title: 'Orders', maxHeight: '70vh', columns: ['Test', 'Patient', 'Came from', 'Done at', 'Money', 'Approval', 'Work / report', ''].map((label) => ({ label })) })}`,
  });
}
