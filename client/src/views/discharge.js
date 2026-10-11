import { openAdmissionForms } from '../admission-forms.js';
/**
 * Discharge coordination.
 *
 * Clinical clearance and financial clearance are separate gates — the board
 * shows both, and the bed is only released when the last one closes.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, confirmDialog, renderRows, pill, money,
  fmtDate, fmtDateTime, kpi, emptyState, printDocument,
} from './_kit.js';
import { collectBill } from '../collect.js';
import { openDischargeSummary } from '../discharge-summary.js';
import {printStay} from '../patient-print.js';

let cache = [];
let past = { q: '', from: '', rows: [] };

export async function mount(ctx) {
  const root = mountPage(ctx, layout());

  async function load() {
    const d = await api.get('/ipd/discharge/board');
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'On the discharge board', value: d.counts.total, icon: 'logout', sub: 'Started or long stay' },
      { label: 'Cleared to leave', value: d.counts.ready, icon: 'task_alt', tone: 'success', sub: 'All gates closed' },
      { label: 'Money outstanding', value: money(d.rows.reduce((s, r) => s + (r.open_due || 0), 0)), icon: 'payments',
        tone: 'warning', sub: `${d.rows.filter((r) => r.open_due > 0.5).length} account(s) · ${money(d.rows.reduce((s, r) => s + (r.advance || 0), 0))} advance to adjust / return` },
      { label: 'Services still open', value: d.rows.reduce((s, r) => s + r.pending_orders, 0), icon: 'science',
        tone: 'info', sub: 'Lab or imaging in progress' },
    ].map(kpi).join('');
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'Nobody is waiting for discharge.' });
    $('[data-count]', root).textContent = `${d.rows.length} on the board`;
    await loadPast();
  }

  // patients already discharged — their summaries stay here to view, sign late, amend or reprint
  async function loadPast() {
    past.rows = await api.get(`/ipd/discharges${qs({ q: past.q, from: past.from })}`);
    $('[data-past]', root).innerHTML = past.rows.length ? past.rows.map((r) => `<tr data-adm="${r.id}">
      <td class="font-data-mono text-body-sm">${esc(r.ip_no)}</td>
      <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div><div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)}</div></td>
      <td class="text-body-md">${esc(r.diagnosis || '—')}</td>
      <td class="text-body-md">${esc(r.consultant_name || '—')}</td>
      <td class="text-body-sm">${fmtDate(r.admitted_at)} → ${fmtDateTime(r.discharged_at)}</td>
      <td>${r.summary_status === 'final' ? pill('verified', 'Signed') : r.has_summary ? pill('pending', 'Draft') : pill('rejected', 'Not written')}</td>
      <td class="text-right"><button class="btn-secondary btn-xs" data-feedback>Forms / feedback</button>${can('billing.view')?'<button class="btn-secondary btn-xs" data-past-print>Print complete stay</button>':''}${r.access?.clinical ? `<button class="btn-secondary btn-xs" data-past-summary>${r.summary_status === 'final' ? 'View / print' : 'Open summary'}</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="7" class="py-8 text-center text-on-surface-variant">No discharges in this period.</td></tr>';
    $('[data-past-count]', root).textContent = `${past.rows.length} discharged · ${past.rows.filter((r) => r.summary_status !== 'final').length} summary not signed`;
  }
  bind(root, 'click', '[data-feedback]', (e,b)=>openAdmissionForms(+b.closest('tr').dataset.adm));
  bind(root, 'click', '[data-past-summary]', (e, b) => openDischargeSummary(+b.closest('tr').dataset.adm, loadPast));
  bind(root, 'click', '[data-past-print]', (e,b)=>offerPrintPack(past.rows.find(r=>r.id===+b.closest('tr').dataset.adm)));
  bind(root, 'input', '[data-past-q]', (e, el) => { clearTimeout(el._t); el._t = setTimeout(() => { past.q = el.value; loadPast().catch(apiError); }, 300); });
  bind(root, 'change', '[data-past-from]', (e, el) => { past.from = el.value; loadPast().catch(apiError); });

  bind(root, 'click', '[data-act]', async (e, b) => {
    const id = +b.closest('tr').dataset.id;
    const row = cache.find((x) => x.id === id);
    if (b.dataset.act === 'collect') {
      const full = await api.get(`/ipd/admissions/${id}`);
      const open = stayBills(full).filter((x) => x.balance > 0.005 && x.status !== 'cancelled');
      // pharmacy bills are cleared at the pharmacy counter; reception collects the rest
      const pharm = open.filter((x) => x.bill_type === 'PHARM' && !can('pharmacy.view'));
      const due = open.filter((x) => !pharm.includes(x));
      if (pharm.length) toast(`${money(pharm.reduce((t, x) => t + x.balance, 0), 2)} on pharmacy bill ${pharm.map((x) => x.bill_no).join(', ')} — collected at the pharmacy counter`, 'info');
      if (!due.length) { if (!pharm.length) toast('Nothing outstanding', 'info'); return; }
      // one bill after another (IP, pharmacy, ER…) until the stay is settled
      const next = (i) => (i < due.length ? collectBill(due[i].id, () => { load(); next(i + 1); }) : null);
      next(0);
    }
    if (b.dataset.act === 'refund') refundExcess(row, load);
    if (b.dataset.act === 'adjust') {
      try { const r = await api.post(`/ipd/admissions/${id}/apply-advance`, {}); toast(`Advance adjusted: ${r.adjusted.map((x) => `${x.bill_no} ${money(x.amount)}`).join(', ')} · ${money(r.advance_left)} left to return`, 'success'); load(); }
      catch (err) { apiError(err, 'Could not adjust the advance'); }
    }
    if (b.dataset.act === 'summary') openDischargeSummary(id, load);
    if (b.dataset.act === 'print-stay') offerPrintPack(row);
    if (b.dataset.act === 'clear') { await api.patch(`/ipd/admissions/${id}`, { status: 'clinically_cleared' }); toast('Clinically cleared', 'success'); load(); }
    if (b.dataset.act === 'discharge') doDischarge(row, load);
  });

  return live({ topics: ['ipd', 'billing'], events: ['admission.updated', 'admission.discharged', 'payment.received', 'order.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Discharge desk', 'logout')} ${liveChip()}`,
    title: 'Discharge Coordination',
    subtitle: 'Clinical clearance, open services, discharge summary, financial clearance and insurance — each a separate gate, all visible at once.',
    body: `
      ${kpiRow([], 4)}
      ${tableCard({
        title: 'Discharge board', subtitle: 'A tick means that gate is closed',
        actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '62vh',
        columns: [{ label: 'IP number', width: '130px' }, { label: 'Patient' }, { label: 'Ward / bed' },
          { label: 'Stay' }, { label: 'Gates' }, { label: 'Bill', cls: 'text-right' },
          { label: 'Balance', cls: 'text-right' }, { label: 'Status' }, { label: '', width: '230px' }],
      })}
      ${card({ title: 'Discharged patients & summaries', subtitle: 'Last 30 days unless you pick a date — view, sign, amend or reprint any discharge summary', pad: false,
        actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-past-count></span>`,
        body: `<div class="flex flex-wrap gap-2 p-3 border-b border-outline-variant">
            <input class="field w-[260px]" data-past-q placeholder="Search name, UHID or IP number">
            <label class="flex items-center gap-2 text-body-sm">Discharged from <input type="date" class="field w-[160px]" data-past-from></label></div>
          <div class="overflow-auto" style="max-height:50vh"><table class="tbl"><thead><tr><th>IP number</th><th>Patient</th><th>Final diagnosis</th><th>Consultant</th><th>Stay</th><th>Summary</th><th></th></tr></thead>
          <tbody data-past></tbody></table></div>` })}`,
  });
}

const tick = (ok, label) => `<span class="inline-flex items-center gap-1 ${ok ? 'text-success' : 'text-on-surface-variant'}"
  title="${esc(label)}"><span class="material-symbols-outlined text-[15px]">${ok ? 'check_circle' : 'radio_button_unchecked'}</span></span>`;

function rowHTML(r) {
  const c = r.checks;
  return `
    <td class="font-data-mono text-body-sm">${esc(r.ip_no)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(r.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.uhid)} · ${r.age_years ?? '—'}y ${esc((r.gender || '')[0] || '')}</div></td>
    <td><div class="text-body-md">${esc(r.ward_name || '—')}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(r.bed_no || '')}</div></td>
    <td><div class="font-data-mono">${r.los_days}d</div>
      <div class="text-label-sm text-on-surface-variant">${fmtDate(r.admitted_at)}</div></td>
    <td><div class="flex items-center gap-1">
        ${tick(c.clinical, 'Clinically cleared')}${tick(c.orders_closed, `Services closed (${r.pending_orders} open)`)}
        ${tick(c.summary, 'Discharge summary written')}${tick(c.financial, 'Financially cleared')}
        ${tick(c.insurance, 'Insurance settled or self pay')}</div>
      <div class="text-label-sm text-on-surface-variant mt-0.5">${r.ready ? 'All gates closed' : `${Object.values(c).filter(Boolean).length}/5 closed`}</div></td>
    <td class="num">${money(r.total)}</td>
    <td class="num ${r.balance > 0 ? 'text-danger font-semibold' : 'text-success'}">${r.balance < -0.005 ? `Advance ${money(-r.balance)}` : money(r.balance)}</td>
    <td>${pill(r.status)}${r.claim_status ? ` ${pill(r.claim_status)}` : ''}</td>
    <td class="text-right whitespace-nowrap">
      ${can('billing.view') ? `<button class="btn-secondary btn-xs" data-act="print-stay">Print all charges${r.access?.clinical?' & diagnosis':''}</button>` : ''}
      ${r.access?.clinical ? `<button class="btn-secondary btn-xs" data-act="summary">${r.summary_status === 'final' ? 'Summary ✓' : c.summary ? 'Summary (draft)' : 'Write summary'}</button>` : ''}
      ${!c.clinical && can('ipd.order') ? `<button class="btn-secondary btn-xs" data-act="clear">Clear</button>` : ''}
      ${r.open_due > 0.5 && r.advance > 0.005 && can('payment.collect') ? `<button class="btn-primary btn-xs" data-act="adjust" title="Use the unused deposit to pay ${money(r.open_due)} on the other bills">Adjust advance to dues</button>` : ''}
      ${r.balance > 0 && can('payment.collect') && r.financial_category !== 'aarogyasri' ? `<button class="btn-primary btn-xs" data-act="collect">Collect ${money(r.balance)}</button>` : ''}
      ${r.financial_category === 'aarogyasri' && r.balance > 0 ? `<span class="pill-info" title="Billed to Aarogyasri — the Insurance desk claims it">Due from Aarogyasri</span>` : ''}
      ${r.balance < -0.005 && !(r.open_due > 0.5) && can('payment.collect') ? `<button class="btn-secondary btn-xs" data-act="refund">Return ${money(-r.balance)}</button>` : ''}
      ${can('ipd.discharge') ? `<button class="btn-primary btn-xs" data-act="discharge" ${r.ready ? '' : 'title="Some gates are still open"'}>Discharge</button>`
        : r.ready ? '<span class="text-body-sm text-on-surface-variant">Ready — a user with Discharge rights completes it</span>' : ''}
    </td>`;
}

/** Every bill of the stay: the IP encounter's bills and the ER bill it came in on (the server's discharge gate counts both). */
const stayBills = (full) => [...(full.bills || []), ...(full.er_bill && !full.bills?.some((b) => b.id === full.er_bill.id) ? [full.er_bill] : [])];

const PAYER_CATS = ['insurance', 'aarogyasri', 'corporate', 'trust'];
const APPROVED = ['preauth_approved', 'claim_submitted', 'settled'];

async function doDischarge(row, after) {
  const full = await api.get(`/ipd/admissions/${row.id}`);
  // payer stays: the approved case pays at discharge (the server bills it); only an unapproved case holds the patient
  if (PAYER_CATS.includes(row.financial_category)) {
    if (!APPROVED.includes(full.claim?.status)) {
      toast(`${full.claim ? `Case ${full.claim.claim_no} is “${String(full.claim.status).replace(/_/g, ' ')}”` : 'No payer case yet'} — the Insurance desk must approve it (Insurance & Payer Cases) before discharge.`, 'warning', { title: 'Payer approval pending', timeout: 9000 });
      return;
    }
    const ok = await confirmDialog({ title: `Discharge ${row.patient_name}?`, message: `The stay is billed to ${esc(full.claim.tpa || 'the payer')} on case ${esc(full.claim.claim_no)} and claimed later. Anything the payer does not cover stays with the patient. Bed ${esc(row.bed_no || '')} is released for cleaning.`, confirmLabel: 'Discharge' });
    if (!ok) return;
    try { await api.post(`/ipd/admissions/${row.id}/discharge`, { discharge_type: 'routine' }); toast(`${row.patient_name} discharged · billed to ${full.claim.tpa || 'payer'}`, 'success'); after(); }
    catch (e) { apiError(e, 'Could not complete the discharge'); }
    return;
  }
  const due = stayBills(full).filter((x) => x.status !== 'cancelled' && x.balance > 0.5 && x.authorization_status !== 'approved');
  const balance = due.reduce((s, x) => s + x.balance, 0);
  if (balance > 0.5) {
    // Money first: collect, bill to a payer, or approve as due — all from the payment dialog.
    const isAdmin = can('admin.write');
    const r = await confirmDialog({
      title: `${row.patient_name} has ${money(balance)} due`,
      message: `The final bill must be settled before discharge: collect it, bill it to the insurer / scheme, or approve it as due.${isAdmin ? '<br><br>As an administrator you may discharge anyway — give the reason.' : ''}`,
      confirmLabel: isAdmin ? 'Discharge without settling' : 'Settle the bill now',
      tone: isAdmin ? 'danger' : 'primary', requireReason: isAdmin, reasonLabel: 'Reason for discharging with dues',
    });
    if (!r) return;
    if (!isAdmin) { collectBill(due[0].id, after); return; }
    try { await api.post(`/ipd/admissions/${row.id}/discharge`, { force: true, reason: r.reason, discharge_type: 'routine' }); toast(`${row.patient_name} discharged with dues recorded`, 'warning'); after(); offerPrintPack(row); }
    catch (e) { apiError(e, 'Could not complete the discharge'); }
    return;
  }
  const excess = -full.balance;
  const r = await confirmDialog({
    title: `Discharge ${row.patient_name}?`,
    message: `Bill settled.${excess > 0.5 ? ` <strong>${money(excess)}</strong> advance is unused — return it before or after discharge.` : ''} Bed ${esc(row.bed_no || '')} will be released for cleaning and daily charges stop now.`,
    confirmLabel: 'Discharge',
  });
  if (!r) return;
  try {
    await api.post(`/ipd/admissions/${row.id}/discharge`, { discharge_type: 'routine' });
    toast(`${row.patient_name} discharged · bed released`, 'success');
    after();
    offerPrintPack(row);
  } catch (e) { apiError(e, 'Could not complete the discharge'); }
}

function offerPrintPack(row){if(!can('billing.view'))return;const clinical=row.access?.clinical||(row.summary_status==='final'&&can('ipd.discharge'));modal({title:'Discharge documents — '+row.patient_name,body:`<p>Print the complete stay bill, including pharmacy, laboratory and all added charges. The original bill numbers and receipts are retained.</p>${clinical?'<label class="flex gap-2 mt-3"><input type="checkbox" checked data-include-clinical>Include diagnosis, released diagnostic reports and clinical discharge record</label>':'<p class="mt-3">Reception can include the clinical record after the doctor signs the final discharge summary. Draft clinical notes stay restricted.</p>'}`,footer:'<button class="btn-secondary" data-close>Close</button><button class="btn-primary" data-print-pack>Print discharge documents</button>',onMount(root){root.querySelector('[data-print-pack]').onclick=()=>printStay(row.id,!!root.querySelector('[data-include-clinical]')?.checked);}});}

async function refundExcess(row, after) {
  const full = await api.get(`/ipd/admissions/${row.id}`);
  const bill = full.bills.find((x) => x.bill_type === 'IP' && x.balance < -0.005);
  if (!bill) { toast('No unused advance', 'info'); return; }
  modal({
    title: 'Return unused advance', subtitle: `${esc(row.patient_name)} · ${esc(bill.bill_no)}`, size: 'sm',
    body: `<p class="text-body-lg">Return <b>${money(Math.min(-bill.balance, -row.balance), 2)}</b> to the patient.</p>
      <label class="field-label mt-3">Mode</label><select class="field" data-mode><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option></select>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Return money</button>',
    onMount(el, close) {
      el.querySelector('[data-ok]').onclick = async (e) => {
        busy(e.currentTarget, true);
        try { await api.post('/refunds', { bill_id: bill.id, amount: Math.min(-bill.balance, -row.balance), mode: el.querySelector('[data-mode]').value, excess: true }); close(); toast('Advance returned', 'success'); after(); }
        catch (err) { apiError(err); busy(e.currentTarget, false); }
      };
    },
  });
}
