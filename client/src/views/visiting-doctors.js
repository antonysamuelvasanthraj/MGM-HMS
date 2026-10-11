/**
 * Visiting doctors — outside surgeons, anaesthetists and consultants paid a share of what their work collects.
 * Their fee lines come from OT cases (visiting surgeon / anaesthetist) or are assigned on a bill. The share is
 * earned only on money actually received (patient receipts + payer settlements, less refunds); a statement
 * accrues it to Visiting Doctors Payable, and a payout clears it with TDS withheld.
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, toast, apiError, busy, bind, kpiRow, kpi, emptyState,
  money, fmtDate, fmtDateTime, modal, confirmDialog, pill, $, state, modeLabel,
} from './_kit.js';

const canEdit = () => can('admin.view') || can('finance.write');
const canPay = () => can('finance.write') || can('admin.write');
const rule = (d) => (d.share_type === 'fixed' ? `${money(d.share_value)} per case` : `${d.share_value}%`);

export async function mount(ctx) {
  let rows = [];
  const root = mountPage(ctx, page({
    eyebrow: `${eyebrow('Finance', 'stethoscope')} ${liveChip()}`,
    title: 'Visiting doctors',
    subtitle: 'Outside doctors earn their share only on what their cases actually collect. Post a statement to accrue it, then pay with TDS withheld.',
    actions: canEdit() ? '<button class="btn-primary" data-add><span class="material-symbols-outlined text-[18px]">person_add</span>Add visiting doctor</button>' : '',
    body: `${kpiRow([], 4)}${card({ title: 'Doctors and what they are owed', subtitle: 'Earned = share of the attributed lines × the part of each bill collected', pad: false, body: '<div data-list></div>' })}`,
  }));

  async function load() {
    rows = await api.get('/visiting-doctors');
    const sumOf = (k) => rows.reduce((s, r) => s + (+r[k] || 0), 0);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Visiting doctors', value: rows.filter((r) => r.active).length, icon: 'stethoscope', tone: 'info', sub: `${rows.length - rows.filter((r) => r.active).length} inactive` },
      { label: 'Share earned', value: money(sumOf('earned')), icon: 'payments', tone: 'neutral', sub: 'On collections to date' },
      { label: 'Not yet accrued', value: money(sumOf('not_yet_accrued')), icon: 'pending_actions', tone: Math.abs(sumOf('not_yet_accrued')) > 0.5 ? 'warning' : 'success', sub: 'Post a statement to book it' },
      { label: 'Payable now', value: money(sumOf('payable')), icon: 'account_balance_wallet', tone: sumOf('payable') > 0.5 ? 'warning' : 'success', sub: 'Accrued less paid' },
    ].map(kpi).join('');
    $('[data-list]', root).innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Doctor</th><th>Share</th><th class="text-right">Lines</th><th class="text-right">Earned</th>
      <th class="text-right">Accrued</th><th class="text-right">Paid</th><th class="text-right">Payable</th><th></th></tr></thead><tbody>
      ${rows.map((d) => `<tr data-id="${d.id}">
        <td><div class="text-body-md font-semibold">${esc(d.name)} ${d.active ? '' : pill('inactive', 'Inactive')}</div>
          <div class="text-label-sm text-on-surface-variant">${esc([d.speciality, d.qualification, d.mobile].filter(Boolean).join(' · '))}</div></td>
        <td class="text-body-md">${rule(d)}${d.rates?.length ? `<div class="text-label-sm text-on-surface-variant">${d.rates.length} procedure rate${d.rates.length > 1 ? 's' : ''}</div>` : ''}
          <div class="text-label-sm text-on-surface-variant">TDS ${d.tds_pct}%</div></td>
        <td class="num">${d.cases ?? '—'}</td><td class="num">${d.earned !== undefined ? money(d.earned, 2) : '—'}</td>
        <td class="num">${d.accrued !== undefined ? money(d.accrued, 2) : '—'}</td><td class="num">${d.paid !== undefined ? money(d.paid, 2) : '—'}</td>
        <td class="num font-semibold ${d.payable > 0.005 ? 'text-warning' : ''}">${d.payable !== undefined ? money(d.payable, 2) : '—'}</td>
        <td class="text-right whitespace-nowrap">${d.earned !== undefined ? '<button class="btn-secondary btn-xs" data-ledger>Ledger</button>' : ''}
          ${canEdit() ? '<button class="btn-ghost btn-xs" data-edit>Edit</button>' : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="p-4">${emptyState('stethoscope', 'No visiting doctors yet', 'Add the outside surgeons, anaesthetists and consultants who work here, with their share.')}</div>`;
  }

  bind(root, 'click', '[data-add]', () => editDoctor(null, load));
  bind(root, 'click', '[data-edit]', (e, b) => editDoctor(rows.find((r) => r.id === +b.closest('tr').dataset.id), load));
  bind(root, 'click', '[data-ledger]', (e, b) => openLedger(+b.closest('tr').dataset.id, load));

  return live({ topics: ['finance', 'admin', 'billing'], events: ['master.created', 'journal.posted', 'bill.updated', 'bill.created', 'payment.received', 'payment.cancelled'], load, interval: 120000 });
}

function editDoctor(d, after) {
  d = d || { share_type: 'percent', share_value: 0, tds_pct: 10, active: 1, rates: [] };
  const procs = (state.meta?.services || []).filter((s) => ['procedure', 'ot', 'surgery', 'anaesthesia', 'consultation'].includes(s.category));
  const rates = (d.rates || []).map((r) => ({ service_id: r.service_id, share_type: r.share_type, share_value: r.share_value }));
  const f = (name, label, type = 'text', extra = '') => `<div><label class="field-label">${label}</label><input class="field" name="${name}" type="${type}" value="${esc(d[name] ?? '')}" ${extra}></div>`;
  const paintRates = (root) => {
    root.querySelector('[data-rates]').innerHTML = rates.map((r, i) => `<tr><td><select class="field field-sm" data-rs="${i}">${procs.map((s) => `<option value="${s.id}" ${s.id === r.service_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></td>
      <td><select class="field field-sm" data-rt="${i}"><option value="percent" ${r.share_type === 'percent' ? 'selected' : ''}>%</option><option value="fixed" ${r.share_type === 'fixed' ? 'selected' : ''}>₹ per case</option></select></td>
      <td><input class="field field-sm !w-24 text-right" type="number" min="0" step="any" value="${r.share_value}" data-rv="${i}"></td>
      <td class="text-right"><button type="button" class="btn-ghost btn-xs" data-rrm="${i}">Remove</button></td></tr>`).join('')
      || '<tr><td colspan="4" class="text-body-sm text-on-surface-variant py-2">The general share applies to every procedure.</td></tr>';
  };
  modal({
    title: d.id ? `Edit — ${d.name}` : 'Add a visiting doctor', size: 'lg',
    body: `<form data-f class="space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${f('name', 'Name *', 'text', 'required')}${f('speciality', 'Speciality')}${f('qualification', 'Qualification')}
        ${f('reg_no', 'Registration no.')}${f('mobile', 'Mobile', 'tel')}${f('email', 'Email', 'email')}
        ${f('pan', 'PAN (for TDS)')}<div class="md:col-span-2">${f('bank_details', 'Bank / UPI for payouts')}</div>
      </div>
      <fieldset class="rounded-lg border border-outline-variant p-3"><legend class="px-1 field-label !mb-0">Share of the work they do</legend>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label class="field-label">General share</label><select class="field" name="share_type"><option value="percent" ${d.share_type === 'percent' ? 'selected' : ''}>Percent of the fee</option><option value="fixed" ${d.share_type === 'fixed' ? 'selected' : ''}>Fixed ₹ per case</option></select></div>
          ${f('share_value', 'Value', 'number', 'min="0" step="any"')}${f('tds_pct', 'TDS % withheld on payout', 'number', 'min="0" max="30" step="any"')}
        </div>
        <div class="field-label mt-3">Procedure-specific rates (optional)</div>
        <table class="tbl"><tbody data-rates></tbody></table>
        ${procs.length ? '<button type="button" class="btn-secondary btn-xs mt-2" data-radd>Add a procedure rate</button>' : ''}
      </fieldset>
      <label class="flex items-center gap-2 text-body-md"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> Active (can be chosen on OT cases and bills)</label>
      ${f('notes', 'Notes')}
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(root, close) {
      paintRates(root);
      root.querySelector('[data-radd]')?.addEventListener('click', () => { rates.push({ service_id: procs[0].id, share_type: 'percent', share_value: 0 }); paintRates(root); });
      root.addEventListener('click', (e) => { const rm = e.target.closest('[data-rrm]'); if (rm) { rates.splice(+rm.dataset.rrm, 1); paintRates(root); } });
      root.addEventListener('change', (e) => {
        const t = e.target;
        if (t.matches('[data-rs]')) rates[+t.dataset.rs].service_id = +t.value;
        if (t.matches('[data-rt]')) rates[+t.dataset.rt].share_type = t.value;
        if (t.matches('[data-rv]')) rates[+t.dataset.rv].share_value = Number(t.value) || 0;
      });
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        const b = Object.fromEntries(new FormData(form));
        b.active = form.active.checked; b.rates = rates;
        busy(ev.currentTarget, true);
        try { d.id ? await api.patch(`/visiting-doctors/${d.id}`, b) : await api.post('/visiting-doctors', b); close(); toast('Saved', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

async function openLedger(id, after) {
  let l;
  try { l = await api.get(`/visiting-doctors/${id}/ledger`); } catch (e) { apiError(e); return; }
  const d = l.doctor;
  modal({
    title: `${d.name} — share ledger`, subtitle: `${rule(d)} · TDS ${d.tds_pct}%${d.pan ? ` · PAN ${esc(d.pan)}` : ''}`, size: 'xl',
    body: `<div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        ${[['Earned on collections', l.earned], ['Accrued', l.accrued], ['Not yet accrued', l.not_yet_accrued], ['Paid (gross)', l.paid], ['Payable', l.payable]]
          .map(([k, v]) => `<div class="rounded-lg border border-outline-variant p-2"><div class="text-label-sm text-on-surface-variant">${k}</div><div class="font-data-mono font-semibold">${money(v, 2)}</div></div>`).join('')}</div>
      <p class="text-body-sm mb-3 ${l.reconciled ? 'text-success' : 'text-danger'}">${l.reconciled
        ? `Reconciled: Visiting Doctors Payable in the books (${money(l.books_payable_all, 2)}) matches the statements less payouts for all visiting doctors.`
        : `Not reconciled: the books show ${money(l.books_payable_all, 2)} payable, the ledger ${money(l.ledger_payable_all, 2)}. Check Accounts for manual entries to account 2700.`}</p>
      <div class="field-label">Attributed work</div>
      ${l.lines.length ? `<div class="max-h-[40vh] overflow-auto"><table class="tbl"><thead><tr><th>Bill</th><th>Patient</th><th>Line</th><th class="text-right">Fee</th><th>Share</th><th class="text-right">Collected</th><th class="text-right">Earned</th></tr></thead><tbody>
        ${l.lines.map((x) => `<tr><td class="font-data-mono">${esc(x.bill_no)}<div class="text-label-sm text-on-surface-variant">${fmtDate(x.bill_date)}</div></td>
          <td class="text-body-md">${esc(x.patient)}<div class="text-label-sm text-on-surface-variant">${esc(x.uhid)}</div></td>
          <td class="text-body-md">${esc(x.description)}${x.visiting_role ? `<div class="text-label-sm text-on-surface-variant">${esc(x.visiting_role)}</div>` : ''}</td>
          <td class="num">${money(x.base, 2)}</td><td class="text-body-sm">${esc(x.rule)} = ${money(x.share_full, 2)}</td>
          <td class="num">${x.collected_pct}%</td><td class="num font-semibold">${money(x.earned, 2)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="text-body-sm text-on-surface-variant">No work attributed yet. Choose the visiting surgeon / anaesthetist on an OT case, or assign a bill line.</p>'}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div><div class="field-label">Statements (accruals)</div>${l.statements.length ? `<table class="tbl"><tbody>${l.statements.map((s) => `<tr><td class="font-data-mono">${esc(s.statement_no)}</td><td>${fmtDate(s.as_of)}</td><td class="num">${money(s.accrual, 2)}</td><td class="text-body-sm">${esc(s.by_name || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="text-body-sm text-on-surface-variant">None yet.</p>'}</div>
        <div><div class="field-label">Payouts</div>${l.payouts.length ? `<table class="tbl"><tbody>${l.payouts.map((p) => `<tr><td class="font-data-mono">${esc(p.payout_no)}</td><td>${fmtDateTime(p.paid_at)}</td><td class="num">${money(p.gross, 2)}</td><td class="text-body-sm">TDS ${money(p.tds, 2)} · net ${money(p.net, 2)} · ${esc(modeLabel(p.mode))}</td></tr>`).join('')}</tbody></table>` : '<p class="text-body-sm text-on-surface-variant">None yet.</p>'}</div>
      </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      ${canPay() && Math.abs(l.not_yet_accrued) >= 0.01 ? `<button class="btn-secondary" data-stmt>Post statement (${money(l.not_yet_accrued, 2)})</button>` : ''}
      ${canPay() && l.payable >= 0.01 ? '<button class="btn-primary" data-pay>Pay</button>' : ''}`,
    onMount(root, close) {
      root.querySelector('[data-stmt]')?.addEventListener('click', async (ev) => {
        const ok = await confirmDialog({ title: 'Post this statement?', message: `${money(l.not_yet_accrued, 2)} is booked to Doctor Professional Fees and Visiting Doctors Payable.${l.not_yet_accrued < 0 ? ' It is negative because refunds reduced what was collected.' : ''}`, confirmLabel: 'Post statement' });
        if (!ok) return;
        busy(ev.currentTarget, true);
        try { const s = await api.post(`/visiting-doctors/${id}/statements`, {}); toast(`${s.statement_no} posted`, 'success'); close(); after(); openLedger(id, after); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      });
      root.querySelector('[data-pay]')?.addEventListener('click', () => payDoctor(l, () => { close(); after(); openLedger(id, after); }));
    },
  });
}

function payDoctor(l, after) {
  const d = l.doctor;
  modal({
    title: `Pay ${d.name}`, subtitle: `Payable ${money(l.payable, 2)} · TDS ${d.tds_pct}% is withheld and booked to TDS payable`, size: 'md', stack: true,
    body: `<form data-f class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Gross amount *</label><input class="field" name="amount" type="number" min="0.01" step="0.01" max="${l.payable}" value="${l.payable}" required></div>
      <div><label class="field-label">Paid by *</label><select class="field" name="mode"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option></select></div>
      <div class="col-span-2"><label class="field-label">Reference (UTR / cheque no.)</label><input class="field" name="reference"></div>
      <div class="col-span-2 text-body-md" data-net></div>
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record payout</button>',
    onMount(root, close) {
      const form = root.querySelector('[data-f]');
      const net = () => { const g = Number(form.amount.value) || 0; const t = Math.round(g * d.tds_pct) / 100; root.querySelector('[data-net]').textContent = `TDS ${money(t, 2)} · net paid ${money(g - t, 2)}`; };
      form.amount.addEventListener('input', net); net();
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!form.reportValidity()) return;
        busy(ev.currentTarget, true);
        try { const p = await api.post(`/visiting-doctors/${d.id}/payouts`, Object.fromEntries(new FormData(form))); toast(`${p.payout_no} — ${money(p.net, 2)} paid, TDS ${money(p.tds, 2)}`, 'success'); close(); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}
