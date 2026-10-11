import { receiveForm } from './accounts.js';
/**
 * Insurance & payer desk. Every admission billed to a payer — insurance,
 * Aarogyasri, corporate, credit or trust — opens a case here automatically.
 */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, can, navigate, downloadCSV, compactMoney, patientPicker,
  $, $$, esc, bind, toast, modal, drawer, renderRows, pill, money, fmtDate, fmtDateTime, kpi, emptyState,
} from './_kit.js';

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

  async function load() {
    loadMasters();
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

  return live({ topics: ['insurance'], events: ['claim.created', 'claim.updated'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Payer desk', 'health_and_safety')} ${liveChip()}`,
    title: 'Insurance & Payer Cases',
    subtitle: 'Insurance, Aarogyasri, corporate and trust patients (credit is the patient paying later — it shows as a patient due, not here). A case opens automatically when a patient is admitted (directly or from ER) under that category: approval → documents → claim / bill → settlement.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      <button class="btn-secondary" data-payers><span class="material-symbols-outlined text-[18px]">handshake</span> Payers & TPAs</button>
      <button class="btn-secondary" data-packages><span class="material-symbols-outlined text-[18px]">inventory</span> Packages</button>
      ${can('insurance.write') ? `<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span> New case</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
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
    <td><span class="pill-info">${esc(PAYER_NAME[c.payer_type] || c.payer_type)}</span>
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
      <a class="btn-secondary" href="/patient/${c.patient_id}" data-close>Patient record</a>
      ${can('insurance.write') ? `<button class="btn-primary" data-save>Save claim</button>` : ''}`,
    onMount(root, close) {
      const linesHost = root.querySelector('[data-lines]');
      const summaryBox=document.createElement('div');summaryBox.className='p-3 text-body-sm border border-outline-variant rounded mb-3';linesHost.before(summaryBox);
      api.get(`/insurance/claims/${c.id}/collection-summary`).then(d=>{if(!root.isConnected)return;summaryBox.innerHTML=`<strong>Patient dues ${money(d.patient_due)} · Payer outstanding ${money(d.payer_outstanding)}</strong><table class="tbl mt-2"><thead><tr><th>Bill / collection desk</th><th>Patient due</th><th>Payer outstanding</th><th>Status</th></tr></thead><tbody>${d.bills.map(b=>`<tr><td>${esc(b.bill_no)} · ${esc(b.collection_desk)}</td><td>${money(b.patient_due)}</td><td>${money(b.payer_pending+b.payer_receivable)}</td><td>${esc(b.financial_status.replaceAll('_',' '))}</td></tr>`).join('')}</tbody></table>`;}).catch(()=>{summaryBox.textContent='Could not load consolidated billing totals.';});
      api.get(`/insurance/claims/${c.id}/lines`).then((lines) => {
        linesHost.innerHTML = lines.length ? `<table class="tbl"><thead><tr><th>Patient amount to collect</th><th>Bill</th><th>Line</th><th class="num">Amount</th></tr></thead><tbody>
          ${lines.map((l) => `<tr><td><input class="field field-sm" type="number" min="0" max="${l.amount}" step="0.01" data-excl="${l.id}" value="${l.patient_pays ? (l.patient_pay_amount ?? l.amount) : 0}" ${can('insurance.write') ? '' : 'disabled'} aria-label="Patient amount for ${esc(l.description)}"></td>
            <td class="font-data-mono text-body-sm">${esc(l.bill_no)} <span class="text-on-surface-variant">${esc(l.bill_type)}</span></td><td>${esc(l.description)}<div class="text-body-sm">${l.bill_type==='PHARM'?'Collect at pharmacy':'Collect at reception'}</div></td><td class="num">${money(l.amount)}</td></tr>`).join('')}</tbody></table>
          ${can('insurance.write') ? '<button type="button" class="btn-secondary btn-sm mt-2" data-save-excl>Save patient collection allocation</button>' : ''}
          <input class="field mt-2" data-allocation-reason placeholder="Required: coverage decision / rejection / sponsorship reference"><p class="text-body-sm mt-1">Enter only the non-covered portion. Case co-pay below is additional: do not enter the same amount twice. After payer money is received, record further rejection through the payer receipt adjustment.</p><div data-case-receipts class="mt-3"></div>`
          : 'No bills on this case yet.';
        api.get('/accounts/receivables'+qs({claim_id:c.id,status:'all'})).then(d=>{const host=linesHost.querySelector('[data-case-receipts]');if(!host)return;host.innerHTML='<strong>Payer receipts / settlement</strong>'+d.rows.map(r=>`<div class="flex justify-between items-center py-2"><span>${esc(r.bill_no)} · ${esc(r.status)} · Outstanding ${money(r.open)}</span>${r.open>0?`<button type="button" class="btn-secondary btn-sm" data-case-receive="${r.id}">Record payment / rejection</button>`:''}</div>`).join('');host.querySelectorAll('[data-case-receive]').forEach(b=>b.onclick=()=>receiveForm(d.rows.find(r=>r.id===+b.dataset.caseReceive),()=>{close();after();}));}).catch(()=>{});
        linesHost.querySelector('[data-save-excl]')?.addEventListener('click', async (ev) => {
          busy(ev.currentTarget, true);
          try { const r = await api.put(`/insurance/claims/${c.id}/exclusions`, { allocations: [...linesHost.querySelectorAll('[data-excl]')].map(x=>({item_id:+x.dataset.excl,patient_amount:+x.value})), reason:linesHost.querySelector('[data-allocation-reason]').value });
            toast(`${r.changed} line(s) updated — collect at the originating desk`, 'success'); close(); after(); }
          catch (err) { apiError(err); busy(ev.currentTarget, false); }
        });
      }).catch(() => { linesHost.textContent = 'Could not load the bill lines.'; });
      root.querySelector('[data-payer]')?.addEventListener('change', (e) => {
        root.querySelector('[data-pkg]').innerHTML = packageOptions(e.target.value, '');
        const py = payerList.find((x) => String(x.id) === e.target.value); if (py) root.querySelector('[name="tpa"]').value = py.name;
      });
      root.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const r = await api.patch(`/insurance/claims/${c.id}`, Object.fromEntries(new FormData(root.querySelector('[data-cf]'))));
          const bits = [r.released_orders ? `${r.released_orders} lab / imaging order(s) released` : '', r.billed_to_payer ? `${money(r.billed_to_payer)} billed to the payer` : '',
            r.package_adjustment ? `${money(r.package_adjustment)} package adjustment` : '', r.reversed ? `${r.reversed} payer entr${r.reversed > 1 ? 'ies' : 'y'} reversed to the patient` : ''].filter(Boolean);
          close(); toast(bits.length ? `Case updated — ${bits.join(' · ')}` : 'Case updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      });
    },
  });
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
