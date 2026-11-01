import {paintSchemeReviews} from '../scheme-patient-pay.js';
import { receiveForm } from './accounts.js';
/**
 * Insurance & payer desk. Every admission billed to a payer — insurance,
 * Aarogyasri, corporate, credit or trust — opens a case here automatically.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, can, navigate, downloadCSV, compactMoney, patientPicker,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, money, fmtDate, fmtDateTime, kpi, emptyState, headCount, printDocument,
} from './_kit.js';
import { payerRequestsPanel } from '../payer-change.js';

let f = { status: '', tpa: '', q: '', payer_type: '' };
const PAYERS = [['insurance', 'Insurance'], ['aarogyasri', 'Aarogyasri'], ['corporate', 'Corporate'], ['trust', 'Trust']];
const PAYER_NAME = Object.fromEntries(PAYERS);
const CLAIM_TYPES = [['cashless', 'Cashless'], ['reimbursement', 'Reimbursement'], ['scheme', 'Government scheme'], ['corporate', 'Corporate billing'], ['trust', 'Trust / charity']];
const claimTypeOptions = (cur) => CLAIM_TYPES.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
const payerOptions = (cur) => PAYERS.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
let cache = [];
let payerList = [], packageList = [];
/** Payer master + packages, for linking a case to its payer and agreed package. */
async function loadMasters() {
  [payerList, packageList] = await Promise.all([api.get('/payers').catch(() => []), api.get('/packages').catch(() => [])]);
}
const payerSelect = (cur) => `<option value="">— not in payer master —</option>${payerList.map((x) => `<option value="${x.id}" ${String(x.id) === String(cur) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
const packageOptions = (payerId, cur) => {
  const matching = packageList.filter(k => k.active && k.payer_id && String(k.payer_id) === String(payerId));
  const hospital = packageList.filter(k => k.active && !k.payer_id);
  return '<option value="">No package — itemised bill</option>' + hospital.map(k => {
    const agreement = matching.find(a => a.hospital_package_id === k.id);
    const effective = agreement || k;
    const retained = agreement && String(k.id) === String(cur) ? `<option value="${k.id}" selected>${esc(k.name)} — ${money(k.price)} (current hospital terms)</option>` : '';
    return retained + `<option value="${effective.id}" ${String(effective.id) === String(cur) ? 'selected' : ''}>${esc(k.name)} — ${money(effective.price)} (${agreement ? 'payer agreement' : 'hospital terms'})</option>`;
  }).join('') + matching.filter(k => !k.hospital_package_id).map(k => `<option value="${k.id}" ${String(k.id) === String(cur) ? 'selected' : ''}>${esc(k.name)} — ${money(k.price)} (payer package)</option>`).join('');
};

const STAGES = [['preauth_pending', 'Preauth pending'], ['preauth_approved', 'Preauth approved'],
  ['query', 'Query raised'], ['claim_submitted', 'Claim submitted'], ['settled', 'Settled'], ['rejected', 'Rejected']];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });
  const loadRequests = payerRequestsPanel($('[data-payer-requests]', root));

  async function load() {
    loadMasters();
    loadRequests();paintSchemeReviews(root.querySelector('[data-scheme-reviews]'));
    const d = await api.get(`/insurance/claims${qs(f)}`);
    cache = d.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Open cases', value: d.summary.open, icon: 'health_and_safety', tone: d.summary.open ? 'warning' : 'success',
        sub: (d.payers || []).filter((x) => x.open).map((x) => `${PAYER_NAME[x.payer_type] || x.payer_type} ${x.open}`).join(' · ') || `${d.rows.length} shown` },
      { label: 'Estimated value', value: compactMoney(d.summary.estimate), icon: 'request_quote', sub: 'Across shown claims' },
      { label: 'Settled', value: compactMoney(d.summary.settled), icon: 'paid', tone: 'success', sub: `Disallowed ${compactMoney(d.summary.disallowed)}` },
      { label: 'Rejected', value: d.summary.rejected, icon: 'cancel', tone: d.summary.rejected ? 'danger' : 'success', sub: 'Needs appeal or write-off' },
    ].map(kpi).join('');

    const sel = $('[data-f="tpa"]', root);
    if (sel && sel.options.length <= 1) {
      sel.innerHTML = `<option value="">All TPAs</option>` + d.tpas.map((t) => `<option>${esc(t.tpa)}</option>`).join('');
      sel.value = f.tpa;
    }
    $('[data-pipeline]', root).innerHTML = pipeline(d.rows);
    renderRows($('[data-rows]', root), d.rows, rowHTML, { empty: 'No claims match this filter.' });
    renderRows($('[data-tpas]', root), d.tpas, (t) => `
      <td class="text-body-md">${esc(t.tpa)}</td><td class="num">${t.n}</td>
      <td class="num">${money(t.estimate)}</td><td class="num text-success">${money(t.settled)}</td>`, { key: 'tpa', empty: 'No TPAs.' });
    $('[data-count]', root).textContent = `${d.rows.length} claim(s)`;
    headCount(root, `${d.summary.open} open cases`);
  }

  bind(root, 'click', '[data-act="open"]', (e, b) => openClaim(cache.find((x) => x.id === +b.closest('tr').dataset.id), load));
  bind(root, 'click', '[data-stage]', (e, b) => { f.status = f.status === b.dataset.stage ? '' : b.dataset.stage; $$('[data-f="status"]', root).forEach((s) => { s.value = f.status; }); load(); });
  bind(root, 'click', '[data-new]', () => newClaim(load));
  bind(root, 'click', '[data-payers]', () => navigate('/payers'));
  bind(root, 'click', '[data-packages]', () => navigate('/packages'));
  bind(root, 'click', '[data-export]', () => downloadCSV('insurance-claims.csv', cache.map((c) => ({
    claim: c.claim_no, uhid: c.uhid, patient: c.patient_name, tpa: c.tpa, policy: c.policy_no,
    type: c.claim_type, status: c.status, estimate: c.estimate, approved: c.approved,
    settled: c.settled, disallowed: c.disallowed, bill_total: c.bill_total, age_days: c.age_days,
  }))));

  return live({ topics: ['insurance', 'approvals'], events: ['claim.created', 'claim.updated', 'payer_request.created', 'payer_request.decided', 'encounter.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Payer desk', 'health_and_safety')} ${liveChip()}`,
    title: 'Insurance & Payer Cases',
    subtitle: 'Insurance, Aarogyasri, corporate and trust cases — approvals, claims and payments.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <button class="btn-secondary" data-payers><span class="material-symbols-outlined text-[18px]">handshake</span> Payers & TPAs</button>
      <button class="btn-secondary" data-packages><span class="material-symbols-outlined text-[18px]">inventory</span> Packages</button>
      ${can('insurance.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New case</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      <div data-scheme-reviews></div><div data-payer-requests></div>
      ${card({ title: 'Claim pipeline', body: `<div data-pipeline></div>` })}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Claim, patient, UHID or policy' },
        { type: 'select', key: 'status', label: 'Stage', value: f.status, options: [{ value: '', label: 'All stages' }, ...STAGES.map(([v, l]) => ({ value: v, label: l }))] },
        { type: 'select', key: 'payer_type', label: 'Payer type', value: f.payer_type, options: [{ value: '', label: 'All payers' }, ...PAYERS.map(([v, l]) => ({ value: v, label: l }))] },
        { type: 'select', key: 'tpa', label: 'Insurer / payer', value: f.tpa, options: [{ value: '', label: 'All' }] },
      ])}
      <div class="grid grid-cols-1 2xl:grid-cols-[1.7fr_1fr] gap-5 items-start">
        ${tableCard({
          title: 'Claims', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
          maxHeight: '56vh',
          columns: [{ label: 'Case', width: '140px' }, { label: 'Patient' }, { label: 'Payer / policy' },
            { label: 'Payer type' }, { label: 'Estimate', cls: 'text-right' }, { label: 'Approved', cls: 'text-right' },
            { label: 'Settled', cls: 'text-right' }, { label: 'Patient balance', cls: 'text-right' },
            { label: 'Age' }, { label: 'Stage' }, { label: '', width: '80px' }],
        })}
        ${card({ title: 'By TPA', pad: false,
          body: `<div class="overflow-auto" style="max-height:56vh"><table class="tbl">
            <thead><tr><th>TPA</th><th class="text-right">Claims</th><th class="text-right">Estimate</th><th class="text-right">Settled</th></tr></thead>
            <tbody data-tpas></tbody></table></div>` })}
      </div>`,
  });
}

function pipeline(rows) {
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, rows.filter((r) => r.status === k).length]));
  const max = Math.max(1, ...Object.values(counts));
  return `<div class="grid grid-cols-2 md:grid-cols-6 gap-2">
    ${STAGES.map(([k, label]) => `
      <button class="text-left p-2.5 rounded-lg border border-outline-variant hover:border-primary/50 transition-colors" data-stage="${k}">
        <div class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant truncate">${label}</div>
        <div class="font-headline-lg text-headline-lg mt-0.5 tnum">${counts[k]}</div>
        <div class="h-1.5 rounded-full bg-surface-container mt-1.5 overflow-hidden">
          <div class="h-full ${k === 'rejected' ? 'bg-danger' : k === 'settled' ? 'bg-success' : 'bg-primary'}"
               style="width:${Math.round((counts[k] / max) * 100)}%"></div></div>
      </button>`).join('')}</div>`;
}

function rowHTML(c) {
  return `
    <td class="font-data-mono text-body-sm">${esc(c.claim_no)}</td>
    <td><div class="font-label-lg text-label-lg">${esc(c.patient_name)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.uhid)}${c.ip_no ? ` · ${esc(c.ip_no)}` : ''}</div></td>
    <td><div class="text-body-md">${esc(c.tpa)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.policy_no || '')}</div></td>
    <td><span class="pill-info">${esc(c.payer_type === 'aarogyasri' ? 'Aarogyasri · scheme' : PAYER_NAME[c.payer_type] || c.payer_type)}</span>
      ${c.checklist ? `<div class="mt-0.5">${c.checklist.complete ? '<span class="pill-success pill-dot">Checklist complete</span>' : `<span class="pill-warning pill-dot" title="Missing: ${esc(c.checklist.missing.join(', '))}">Checklist ${c.checklist.items.filter((i) => i.done).length}/4</span>`}</div>` : ''}
      ${c.package_name ? `<div class="text-label-sm text-on-surface-variant mt-0.5">${esc(c.package_name)} · ${money(c.package_price)}</div>` : ''}
      <div class="text-label-sm text-on-surface-variant mt-0.5">${esc((CLAIM_TYPES.find(([v]) => v === c.claim_type) || [0, c.claim_type])[1])}</div></td>
    <td class="num">${money(c.estimate)}</td>
    <td class="num">${c.approved ? money(c.approved) : '—'}</td>
    <td class="num text-success">${c.settled ? money(c.settled) : '—'}</td>
    <td class="num ${c.patient_due > 0 ? 'text-danger font-semibold' : 'text-on-surface-variant'}">${money(c.patient_due || 0)}<div class="text-label-sm text-on-surface-variant">Payer ${money(c.payer_outstanding || 0)}</div></td>
    <td class="font-data-mono text-body-sm ${c.age_days > 21 ? 'text-warning font-semibold' : ''}">${c.age_days}d</td>
    <td>${pill(c.status)}</td>
    <td class="text-right"><button class="btn-secondary btn-xs" data-act="open">Open</button></td>`;
}

function openClaim(c, after) {
  const canAllocate=can('insurance.write')&&!(Number(c.settled)>0)&&!['settled','rejected','cancelled'].includes(c.status);
  drawer({
    title: c.claim_no, subtitle: `${esc(c.patient_name)} · ${esc(c.tpa)} · policy ${esc(c.policy_no || '—')}`, width: 'max-w-2xl',
    body: `<div class="p-5 space-y-4">
      ${c.package_name ? `<div class="rounded-lg border border-info/40 bg-info-bg px-3 py-2 text-body-md">Package: <b>${esc(c.package_name)}</b> · ${money(c.package_price)}${c.package_los ? ` · ${c.package_los}-day stay` : ''}
        ${c.bill_total > c.package_price ? ` — <span class="text-warning">hospital bill is ${money(c.bill_total - c.package_price)} above the package</span>` : ''}</div>` : ''}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[{ label: 'Hospital bill', value: money(c.bill_total), icon: 'receipt_long' },
           { label: 'Estimate', value: money(c.estimate), icon: 'request_quote', tone: 'info' },
           { label: 'Approved', value: money(c.approved), icon: 'check_circle', tone: 'success' },
           { label: 'Patient amount to collect', value: money(c.patient_due || 0), icon: 'schedule', tone: c.patient_due > 0 ? 'danger' : 'success', sub: `Payer outstanding ${money(c.payer_outstanding || 0)}` }].map(kpi).join('')}
      </div>
      <details class="border border-outline-variant rounded-lg" data-lines-box>
        <summary class="cursor-pointer px-3 py-2 font-label-lg">Bill lines on this case — allocate patient contribution / non-covered amounts — reception and pharmacy collect their own bills</summary>
        <div data-lines class="p-3 text-body-md text-on-surface-variant">Loading…</div></details>
      <form data-cf class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Stage</label><select class="field" name="status">
            ${STAGES.map(([v, l]) => `<option value="${v}" ${v === c.status ? 'selected' : ''} ${v==='settled'&&c.status!=='settled'?'disabled':''}>${l}</option>`).join('')}</select></div>
          <div><label class="field-label">Payer type</label><select class="field" name="payer_type">${payerOptions(c.payer_type)}</select></div>
          <div><label class="field-label">Payer / TPA (master)</label><select class="field" name="payer_id" data-payer>${payerSelect(c.payer_id)}</select></div>
          <div><label class="field-label">Payer name as written</label><input class="field" name="tpa" value="${esc(c.tpa || '')}"></div>
          <div class="col-span-2"><label class="field-label">Package</label><select class="field" name="package_id" data-pkg>${packageOptions(c.payer_id, c.package_id)}</select>
            <p class="text-body-sm text-on-surface-variant mt-1">Choosing a package fills an empty estimate with its price.</p></div>
          <div><label class="field-label">Policy / card / approval no.</label><input class="field" name="policy_no" value="${esc(c.policy_no || '')}"></div>
          <div><label class="field-label">Claim type</label><select class="field" name="claim_type">${claimTypeOptions(c.claim_type)}</select></div>
          <div><label class="field-label">Estimate</label><input class="field" type="number" name="estimate" value="${c.estimate}"></div>
          <div><label class="field-label">Approved</label><input class="field" type="number" name="approved" value="${c.approved}"></div>
          <div><label class="field-label">Patient co-pay — total for this case</label><input class="field" type="number" min="0" step="0.01" name="copay_amount" value="${c.copay_amount || 0}"><p class="text-body-sm">Enter the agreed patient share in rupees. It remains collectible from the patient, in addition to exclusions; it is not payer coverage.</p></div>
          <div><label class="field-label">Settled</label><input class="field" type="number" name="settled" value="${c.settled}" readonly></div>
          <div><label class="field-label">Disallowed</label><input class="field" type="number" name="disallowed" value="${c.disallowed}" readonly></div>
        </div>
        ${['insurance', 'corporate'].includes(c.payer_type) ? `<fieldset class="rounded-lg border border-outline-variant p-3">
          <legend class="px-1 font-label-lg">Policy terms — what the patient pays beyond exclusions</legend>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="field-label">Deductible (₹)</label><input class="field" type="number" min="0" step="0.01" name="deductible_amount" value="${c.deductible_amount || 0}"></div>
            <div><label class="field-label">Co-pay (%)</label><input class="field" type="number" min="0" max="100" step="0.5" name="copay_pct" value="${c.copay_pct || 0}"></div>
            <div><label class="field-label">Room rent limit (₹ per day, 0 = none)</label><input class="field" type="number" min="0" step="1" name="room_rent_limit" value="${c.room_rent_limit || 0}"></div>
            <label class="flex items-center gap-2 mt-6 text-body-md"><input type="hidden" name="proportional_deduction" value="0"><input type="checkbox" name="proportional_deduction" value="1" ${c.proportional_deduction !== 0 ? 'checked' : ''}> Proportional deduction when the room is above the limit</label>
            <div class="sm:col-span-2"><label class="field-label">Sub-limits (category=₹, comma separated)</label><input class="field" name="sub_limits_text" placeholder="pharmacy=16000, lab=5000, imaging=8000" value="${esc(Object.entries((() => { try { return JSON.parse(c.sub_limits || '{}'); } catch { return {}; } })()).map(([k, v]) => `${k}=${v}`).join(', '))}">
              <p class="text-body-sm text-on-surface-variant mt-1">Categories: bed, consultation, ipd, procedure, lab, imaging, pharmacy, consumable, nursing. Room above the limit, the proportional cut on consultation / procedure / IP charges, sub-limit excess, the deductible and the co-pay % are the patient's; pharmacy, implants and diagnostics are never cut proportionally.</p></div>
          </div></fieldset>` : ''}
        ${c.payer_type === 'aarogyasri' ? `<fieldset class="rounded-lg border border-outline-variant p-3">
          <legend class="px-1 font-label-lg">Aarogyasri checklist — needed before the case is approved</legend>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="field-label">Scheme card no.</label><input class="field" name="scheme_card_no" value="${esc(c.scheme_card_no || c.policy_no || '')}"></div>
            <div><label class="field-label">Scheme pre-auth no.</label><input class="field" name="preauth_no" value="${esc(c.preauth_no || '')}"></div>
            <div><label class="field-label">Eligibility proof</label><select class="field" name="eligibility_proof">${['', 'White ration card', 'Aarogyasri health card', 'Aadhaar + income certificate', 'Other (see stage note)'].map((v) => `<option value="${esc(v)}" ${v === (c.eligibility_proof || '') ? 'selected' : ''}>${v || '— choose —'}</option>`).join('')}</select></div>
            <label class="flex items-center gap-2 mt-6 text-body-md"><input type="hidden" name="eligibility_verified" value="0"><input type="checkbox" name="eligibility_verified" value="1" ${c.eligibility_verified ? 'checked' : ''}> Proof seen and verified</label>
          </div>
          ${c.checklist ? `<ul class="mt-2 grid grid-cols-2 gap-1 text-body-sm">${c.checklist.items.map((i) => `<li class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] ${i.done ? 'text-success' : 'text-warning'}">${i.done ? 'check_circle' : 'radio_button_unchecked'}</span>${esc(i.label)}</li>`).join('')}</ul>` : ''}
          <p class="text-body-sm text-on-surface-variant mt-2">Scheme patients pay ₹0 by default. Any amount the patient pays must be allocated above, line by line, with a reason.</p>
        </fieldset>` : ''}
        <div><label class="field-label">Stage note</label><textarea class="field" rows="3" name="stage_note">${esc(c.stage_note || '')}</textarea></div>
      </form>
      ${card({ title: 'Supporting documents', body: (c.documents || []).length
        ? `<ul class="space-y-1.5">${c.documents.map((d) => `<li class="flex items-center gap-2 text-body-md">
            <span class="material-symbols-outlined text-[16px] text-success">description</span>${esc(d)}</li>`).join('')}</ul>`
        : `<p class="text-body-md text-on-surface-variant">No documents recorded against this claim.</p>` })}
      <p class="text-body-sm text-on-surface-variant">Admitted ${c.admitted_at ? fmtDateTime(c.admitted_at) : '—'}
        ${c.discharged_at ? ` · discharged ${fmtDateTime(c.discharged_at)}` : ''}
        ${c.submitted_at ? ` · submitted ${fmtDate(c.submitted_at)}` : ''}
        ${c.settled_at ? ` · settled ${fmtDate(c.settled_at)}` : ''}</p>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      ${canAllocate?'<button class="btn-secondary" data-patient-charge>Add excluded service charge</button>':''}
      <a class="btn-secondary" href="/patient/${c.patient_id}" data-close>Patient record</a>
      <button class="btn-secondary" data-statement>Claim & patient statements</button>
      ${can('insurance.write') ? `<button class="btn-primary" data-save>Save claim</button>` : ''}`,
    onMount(root, close) {
      root.querySelector('[data-patient-charge]')?.addEventListener('click',()=>excludedCharge(c,()=>{close();after();}));
      const linesHost = root.querySelector('[data-lines]');
      const summaryBox=document.createElement('div');summaryBox.className='p-3 text-body-sm border border-outline-variant rounded mb-3';linesHost.before(summaryBox);
      api.get(`/insurance/claims/${c.id}/collection-summary`).then(d=>{if(!root.isConnected)return;summaryBox.innerHTML=`<strong>Patient dues ${money(d.patient_due)} · Payer outstanding ${money(d.payer_outstanding)}</strong><table class="tbl mt-2"><thead><tr><th>Bill / collection desk</th><th>Patient due</th><th>Payer outstanding</th><th>Status</th></tr></thead><tbody>${d.bills.map(b=>`<tr><td>${esc(b.bill_no)} · ${esc(b.collection_desk)}</td><td>${money(b.patient_due)}</td><td>${money(b.payer_pending+b.payer_receivable)}</td><td>${esc(b.financial_status.replaceAll('_',' '))}</td></tr>`).join('')}</tbody></table>`;}).catch(()=>{summaryBox.textContent='Could not load consolidated billing totals.';});
      api.get(`/insurance/claims/${c.id}/lines`).then((lines) => {
        linesHost.innerHTML = lines.length ? `<p class="text-body-sm mb-2">Not claimed means the payer will not cover this charge. Tick for full patient payment, or enter a smaller patient share. A pending payer payment alone is not a patient due.</p><table class="tbl"><thead><tr><th>Not claimable / patient pays</th><th>Patient share (₹)</th><th>Bill</th><th>Line</th><th class="num">Amount</th></tr></thead><tbody>
          ${lines.map((l) => `<tr><td><label class="flex items-center gap-2"><input type="checkbox" data-notclaimable="${l.id}" data-total="${l.amount}" ${l.patient_pays?'checked':''} ${canAllocate?'':'disabled'}> Not claimed</label></td><td><input class="field field-sm" type="number" min="0" max="${l.amount}" step="0.01" data-excl="${l.id}" value="${l.patient_pays ? (l.patient_pay_amount ?? l.amount) : 0}" ${canAllocate ? '' : 'disabled'} aria-label="Patient amount for ${esc(l.description)}"></td>
            <td class="font-data-mono text-body-sm">${esc(l.bill_no)} <span class="text-on-surface-variant">${esc(l.bill_type)}</span></td><td>${esc(l.description)}<div class="text-body-sm">${l.bill_type==='PHARM'?'Collect at pharmacy':'Collect at reception'}</div></td><td class="num">${money(l.amount)}</td></tr>`).join('')}</tbody></table>
          ${canAllocate ? '<button type="button" class="btn-secondary btn-sm mt-2" data-save-excl>Save patient collection allocation</button>' : ''}
          <input class="field mt-2" data-allocation-reason placeholder="Required: coverage decision / rejection / sponsorship reference"><p class="text-body-sm mt-1">Enter only the non-covered portion. Case co-pay below is additional: do not enter the same amount twice. After payer money is received, record further rejection through the payer receipt adjustment.</p><div data-case-receipts class="mt-3"></div>`
          : 'No bills on this case yet.';
        api.get('/accounts/receivables'+qs({claim_id:c.id,status:'all'})).then(d=>{const host=linesHost.querySelector('[data-case-receipts]');if(!host)return;host.innerHTML='<strong>Payer receipts / settlement</strong>'+d.rows.map(r=>`<div class="flex justify-between items-center py-2"><span>${esc(r.bill_no)} · ${esc(r.status)} · Outstanding ${money(r.open)}</span>${r.open>0?`<button type="button" class="btn-secondary btn-sm" data-case-receive="${r.id}">Record payment / rejection</button>`:''}</div>`).join('');host.querySelectorAll('[data-case-receive]').forEach(b=>b.onclick=()=>receiveForm(d.rows.find(r=>r.id===+b.dataset.caseReceive),()=>{close();after();}));}).catch(()=>{});
        if(!canAllocate&&can('insurance.write'))linesHost.insertAdjacentHTML('afterbegin','<p class="text-body-sm mb-2">This case has payer receipts or is closed. Use Accounts to record a payer disallowance or adjustment; settled allocations cannot be rewritten.</p>');
        linesHost.querySelectorAll('[data-notclaimable]').forEach(box=>{const amount=linesHost.querySelector('[data-excl="'+box.dataset.notclaimable+'"]');const sync=()=>{box.checked=Number(amount.value)>0;box.indeterminate=Number(amount.value)>0&&Number(amount.value)<Number(box.dataset.total);};sync();box.onchange=()=>{amount.value=box.checked?box.dataset.total:'0';sync();};amount.addEventListener('input',sync);});
        linesHost.querySelector('[data-save-excl]')?.addEventListener('click', async (ev) => {
          const button=ev.currentTarget;busy(button, true);
          try { const r = await api.put(`/insurance/claims/${c.id}/exclusions`, { allocations: [...linesHost.querySelectorAll('[data-excl]')].map(x=>({item_id:+x.dataset.excl,patient_amount:+x.value})), reason:linesHost.querySelector('[data-allocation-reason]').value });
            toast(`${r.changed} line(s) updated — collect at the originating desk`, 'success'); close(); after(); }
          catch (err) { apiError(err); }finally{busy(button,false);}
        });
      }).catch(() => { linesHost.textContent = 'Could not load the bill lines.'; });
      root.querySelector('[data-statement]')?.addEventListener('click', () => printStatements(c.id).catch(apiError));
      root.querySelector('[data-payer]')?.addEventListener('change', (e) => {
        root.querySelector('[data-pkg]').innerHTML = packageOptions(e.target.value, '');
        const py = payerList.find((x) => String(x.id) === e.target.value); if (py) root.querySelector('[name="tpa"]').value = py.name;
      });
      root.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const fd = new FormData(root.querySelector('[data-cf]')); const body = Object.fromEntries(fd);
          if (fd.has('eligibility_verified')) body.eligibility_verified = fd.getAll('eligibility_verified').pop();
          if (fd.has('proportional_deduction')) body.proportional_deduction = fd.getAll('proportional_deduction').pop();
          if ('sub_limits_text' in body) {
            const pairs = body.sub_limits_text.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split('=').map((y) => y.trim()));
            if (pairs.some(([k, v]) => !k || v === undefined || !(+v >= 0))) { toast('Write sub-limits as category=amount, e.g. pharmacy=16000', 'warning'); busy(actionButton, false); return; }
            body.sub_limits = Object.fromEntries(pairs.map(([k, v]) => [k.toLowerCase(), +v]));
            delete body.sub_limits_text;
          }
          const r = await api.patch(`/insurance/claims/${c.id}`, body);
          const bits = [r.released_orders ? `${r.released_orders} lab / imaging order(s) released` : '', r.billed_to_payer ? `${money(r.billed_to_payer)} billed to the payer` : '',
            r.package_adjustment ? `${money(r.package_adjustment)} package adjustment` : '', r.reversed ? `${r.reversed} payer entr${r.reversed > 1 ? 'ies' : 'y'} reversed to the patient` : ''].filter(Boolean);
          close(); toast(bits.length ? `Case updated — ${bits.join(' · ')}` : 'Case updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      });
    },
  });
}

/** TPA claim statement and patient-payable statement for one case, from the same calculation the bills use. */
async function printStatements(id) {
  const d = await api.get(`/insurance/claims/${id}/statement`);
  const c = d.claim, s = d.share;
  const head = (t) => `<div style="display:flex;justify-content:space-between;border-bottom:2px solid #881D2C;padding-bottom:8px">
    <div><div style="font-size:18px;font-weight:700;color:#881D2C">${esc(d.hospital.name)}</div><div style="font-size:11px">${esc(d.hospital.address)} ${d.hospital.gstin ? `· GSTIN ${esc(d.hospital.gstin)}` : ''}</div></div>
    <div style="text-align:right"><div style="font-weight:700">${t}</div><div style="font-size:11px">${esc(c.claim_no)} · ${esc(c.tpa)}</div></div></div>
    <table style="width:100%;margin-top:8px;font-size:12px"><tr><td><b>Patient</b> ${esc(c.patient_name)} (${c.age_years ?? ''} y ${esc(c.gender || '')})</td><td><b>UHID</b> ${esc(c.uhid)}</td><td><b>IP no.</b> ${esc(c.ip_no || '—')}</td></tr>
      <tr><td><b>Policy</b> ${esc(c.policy_no || '—')}</td><td><b>Pre-auth</b> ${esc(c.preauth_no || '—')}</td><td><b>Approved</b> ${money(c.approved)}</td></tr></table>`;
  const row = (l, v, b = false) => `<tr><td>${b ? `<b>${l}</b>` : l}</td><td style="text-align:right">${b ? `<b>${money(v)}</b>` : money(v)}</td></tr>`;
  const payer = `${head('CLAIM STATEMENT')}
    <table style="width:100%;border-collapse:collapse;margin-top:10px"><thead><tr><th>Bill</th><th>Item</th><th>Category</th><th style="text-align:right">Billed</th><th style="text-align:right">Not payable</th><th style="text-align:right">Claimed</th><th>Reason</th></tr></thead>
      <tbody>${s.lines.map((l) => `<tr><td>${esc(l.bill_no)}</td><td>${esc(l.description)}</td><td>${esc(l.category)}</td><td style="text-align:right">${money(l.amount)}</td><td style="text-align:right">${l.patient ? money(l.patient) : ''}</td><td style="text-align:right">${money(l.claimed)}</td><td style="font-size:11px">${esc(l.reason)}</td></tr>`).join('')}</tbody></table>
    <table style="width:55%;margin:12px 0 0 auto">${row('Total billed', s.gross)}${row('Less: patient share (see patient statement)', s.patient_total)}${row('Claimed from payer', s.payer_total, true)}</table>`;
  const patient = `${head('PATIENT PAYABLE STATEMENT')}
    <table style="width:60%;margin-top:12px">${row('Total hospital bill', s.gross)}
      ${s.exclusions ? row('Items not covered by the policy (exclusions)', s.exclusions) : ''}
      ${s.room_excess ? row(`Room rent above the limit of ${money(c.room_rent_limit)} per day`, s.room_excess) : ''}
      ${s.proportional ? row(`Proportional deduction (${Math.round((1 - s.ratio) * 1000) / 10}% of associated charges)`, s.proportional) : ''}
      ${s.sublimits.map((x) => row(`Above the ${esc(x.category)} sub-limit of ${money(x.limit)}`, x.excess)).join('')}
      ${s.deductible ? row('Deductible', s.deductible) : ''}${s.copay_pct_amount ? row(`Co-pay ${c.copay_pct}%`, s.copay_pct_amount) : ''}
      ${s.copay_fixed ? row('Co-pay (fixed)', Math.min(s.copay_fixed, s.patient_total)) : ''}
      ${row('Patient share', s.patient_total, true)}${row('Paid by the patient so far', d.patient_paid)}${row('Balance to pay at reception / pharmacy', d.patient_balance, true)}
      ${row('Payer covers', s.payer_total)}</table>
    <p style="font-size:11px;margin-top:12px">Payer amounts are as per the approval and policy terms on record. Any amount the payer later disallows is shown on a revised statement.</p>`;
  printDocument(`Statements ${c.claim_no}`, `${payer}<div style="page-break-before:always"></div>${patient}`);
}

function newClaim(after) {
  let picked = null;
  modal({
    title: 'Open a payer case', size: 'lg',
    body: `<form data-nf class="space-y-3">
      <div><label class="field-label">Patient *</label><div data-picker></div></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Payer / TPA (master)</label><select class="field" name="payer_id" data-payer>${payerSelect('')}</select></div>
        <div><label class="field-label">Package</label><select class="field" name="package_id" data-pkg>${packageOptions('', '')}</select></div>
        <div><label class="field-label">Payer name *</label><input class="field" name="tpa" required list="tpa-list">
          <datalist id="tpa-list">${['Star Health', 'HDFC Ergo', 'Niva Bupa', 'ICICI Lombard', 'Care Health',
            'MediAssist TPA', 'Paramount TPA', 'New India Assurance', 'Aarogyasri', 'CGHS', 'ESIC']
            .map((t) => `<option value="${t}">`).join('')}</datalist></div>
        <div><label class="field-label">Policy number</label><input class="field" name="policy_no"></div>
        <div><label class="field-label">Payer type</label><select class="field" name="payer_type">${payerOptions('insurance')}</select></div>
        <div><label class="field-label">Claim type</label><select class="field" name="claim_type">${claimTypeOptions('cashless')}</select></div>
        <div><label class="field-label">Estimate</label><input class="field" type="number" name="estimate" value="0"></div>
      </div>
      <div><label class="field-label">Note</label><textarea class="field" rows="2" name="stage_note"></textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Raise claim</button>`,
    onMount(root, close) {
      patientPicker(root.querySelector('[data-picker]'), (p) => {
        picked = p;
        const f = root.querySelector('[data-nf]');
        if (p.payer_id) { f.payer_id.value = p.payer_id; f.package_id.innerHTML = packageOptions(p.payer_id, ''); }
        if (p.payer_name) f.tpa.value = p.payer_name;
        if (p.policy_no) f.policy_no.value = p.policy_no;
      }, { autofocus: true });
      root.querySelector('[data-payer]').addEventListener('change', (e) => {
        const f = root.querySelector('[data-nf]');
        f.package_id.innerHTML = packageOptions(e.target.value, '');
        const py = payerList.find((x) => String(x.id) === e.target.value); if (py) { f.tpa.value = py.name; f.payer_type.value = ['tpa', 'insurance'].includes(py.payer_type) ? 'insurance' : py.payer_type; }
      });
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        const form = root.querySelector('[data-nf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const c = await api.post('/insurance/claims', { patient_id: picked.id, ...Object.fromEntries(new FormData(form)) });
          close(); toast(`${c.claim_no} raised`, 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

async function excludedCharge(claim,after){
 try{
  const services=(await api.get('/services')).filter(s=>s.active&&s.price>0&&['consultation','procedure','other'].includes(s.category));
  const key=crypto.randomUUID();
  modal({title:'New patient-pay service charge',stack:true,size:'md',body:`<p class="text-body-sm mb-3">Use this only for a new service excluded from this case. Collect it at Reception. For medicines, lab and imaging already billed, set the patient-pay amount on the existing line; do not bill it again. Confirm the exclusion is allowed by the payer or scheme.</p><form data-extra-charge><label class="field-label">Service</label><select class="field" name="service_id" required>${services.map(s=>`<option value="${s.id}">${esc(s.name)} · ${money(s.price)}</option>`).join('')}</select><label class="field-label mt-3">Quantity</label><input class="field" type="number" min="0.01" step="0.01" name="qty" value="1" required><label class="field-label mt-3">Exclusion reason / authorization reference</label><textarea class="field" name="reason" minlength="5" required></textarea></form>`,footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-raise>Raise patient-pay bill</button>',onMount(root,close){root.querySelector('[data-raise]').onclick=async event=>{const form=root.querySelector('[data-extra-charge]');if(!form.reportValidity())return;const button=event.currentTarget;busy(button,true);try{await api.post('/insurance/claims/'+claim.id+'/patient-charges',{...Object.fromEntries(new FormData(form)),request_key:key});toast('Patient-pay bill raised; collect at Reception','success');close();after();}catch(error){apiError(error);}finally{busy(button,false);}};}});
 }catch(error){apiError(error);}
}
