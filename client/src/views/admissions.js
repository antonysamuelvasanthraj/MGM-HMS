import { openAdmissionForms } from '../admission-forms.js';
/** Inpatient admissions & bed management. */
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, navigate, patientPicker, doctorOptions, compactMoney,
  $, $$, esc, bind, toast, modal, drawer, confirmDialog, renderRows, pill, money,
  fmtDate, fmtDateTime, ago, kpi, emptyState, patientBanner,
} from './_kit.js';
import { openDischargeSummary } from '../discharge-summary.js';
import { packageBlock, openPackageUsage } from '../package-usage.js';
import { collectBill } from '../collect.js';

let f = { status: 'active', kind: '', q: '' };
let view = 'board';
let cache = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; load(); });

  async function load() {
    const [beds, adm] = await Promise.all([api.get('/ipd/beds'), api.get(`/ipd/admissions${qs(f)}`)]);
    cache = adm.rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Occupancy', value: `${beds.occupancy}%`, icon: 'hotel', tone: beds.occupancy > 85 ? 'warning' : 'success',
        sub: `${beds.totals.occupied} of ${beds.totals.total} beds` },
      { label: 'Vacant now', value: beds.totals.vacant, icon: 'check_circle', tone: beds.totals.vacant ? 'success' : 'danger',
        sub: `${beds.totals.cleaning} cleaning · ${beds.totals.reserved} reserved` },
      { label: 'Inpatients', value: adm.counts.total, icon: 'groups', sub: `${adm.counts.icu} in ICU` },
      { label: 'Average stay', value: `${adm.counts.avg_los} d`, icon: 'schedule', tone: 'info',
        sub: `${adm.counts.discharge_ready} ready to discharge` },
    ].map(kpi).join('');
    $('[data-board]', root).innerHTML = bedBoard(beds);
    renderRows($('[data-rows]', root), adm.rows, rowHTML, { empty: 'No admissions match this filter.' });
    $('[data-count]', root).textContent = `${adm.rows.length} inpatient(s)`;
  }

  bind(root, 'click', '[data-bed]', (e, b) => {
    const bed = JSON.parse(b.dataset.bed);
    if (bed.admission_id) openAdmission(bed.admission_id, load);
    else bedActions(bed, load);
  });
  bind(root, 'click', '[data-act="open"]', (e, b) => openAdmission(b.closest('tr').dataset.id, load));
  bind(root, 'click', '[data-act="collect"]', (e, b) => {
    const a = cache.find((x) => x.id === +b.closest('tr').dataset.id);
    if (a?.ip_bill_id) collectBill(a.ip_bill_id, load);
  });
  bind(root, 'click', '[data-admit]', () => admitPatient(load));

  return live({ topics: ['ipd', 'billing'], events: ['admission.created', 'admission.updated', 'admission.discharged', 'bed.updated', 'payment.received'], load });
}

function layout() {
  return page({
    wide: true,
    eyebrow: `${eyebrow('Inpatient', 'hotel')} ${liveChip()}`,
    title: 'Admissions & Bed Management',
    subtitle: 'Live bed state by ward, with each inpatient’s running bill, deposit and clinical owner.',
    actions: `<a href="/discharge" class="btn-secondary"><span class="material-symbols-outlined text-[18px]">logout</span> Discharge board</a>
      ${can('ipd.admit') ? `<button class="btn-primary" data-admit><span class="material-symbols-outlined text-[18px]">add</span> Admit a patient</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      ${card({ title: 'Bed board', subtitle: 'Click a bed to open the patient or change its state', body: `<div data-board></div>` })}
      ${filterBar([
        { type: 'search', key: 'q', label: 'Find', placeholder: 'Patient, UHID or IP number' },
        { type: 'select', key: 'status', label: 'Status', value: f.status, options: [
          { value: 'active', label: 'Currently admitted' }, { value: 'all', label: 'All' },
          { value: 'discharge_initiated', label: 'Discharge started' }, { value: 'discharged', label: 'Discharged' }] },
        { type: 'select', key: 'kind', label: 'Ward type', value: f.kind, options: [
          { value: '', label: 'All wards' }, { value: 'general', label: 'General' }, { value: 'private', label: 'Private' },
          { value: 'icu', label: 'ICU' }, { value: 'maternity', label: 'Maternity' }, { value: 'nicu', label: 'NICU' }] },
      ])}
      ${tableCard({
        title: 'Inpatients', actions: `<span class="font-data-mono text-body-sm text-on-surface-variant" data-count></span>`,
        maxHeight: '54vh',
        columns: [{ label: 'IP number', width: '130px' }, { label: 'Patient' }, { label: 'Ward / bed' },
          { label: 'Consultant' }, { label: 'Diagnosis' }, { label: 'Stay' }, { label: 'Payer' },
          { label: 'Running bill', cls: 'text-right' }, { label: 'Balance', cls: 'text-right' },
          { label: 'Status' }, { label: '', width: '130px' }],
      })}`,
  });
}

const BED_TONE = {
  occupied: 'bg-primary-fixed border-primary/30 text-primary',
  vacant: 'bg-success-bg border-success/30 text-success',
  reserved: 'bg-warning-bg border-warning/30 text-warning',
  cleaning: 'bg-info-bg border-info/30 text-info',
  blocked: 'bg-neutral-bg border-outline-variant text-neutral',
};

function bedBoard(d) {
  return `<div class="space-y-4">
    <div class="flex flex-wrap gap-3 text-body-sm">
      ${Object.entries({ occupied: 'Occupied', vacant: 'Vacant', reserved: 'Reserved', cleaning: 'Cleaning', blocked: 'Blocked' })
        .map(([k, l]) => `<span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded border ${BED_TONE[k]}"></span>${l}</span>`).join('')}
    </div>
    ${d.wards.map((w) => `
      <div>
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-title-md text-title-md">${esc(w.name)}
            <span class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant ml-1">${esc(w.floor || '')} · ${esc(w.kind)}</span></h3>
          <span class="font-data-mono text-body-sm text-on-surface-variant">${w.occupied}/${w.total} occupied</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 2xl:grid-cols-10 gap-2">
          ${w.beds.map((b) => `
            <button class="p-2 rounded-lg border text-left transition-colors hover:shadow-sm ${BED_TONE[b.status]}"
                    data-bed='${esc(JSON.stringify({ id: b.id, bed_no: b.bed_no, status: b.status, admission_id: b.admission_id }))}'>
              <div class="flex items-center justify-between">
                <span class="font-data-mono text-label-sm font-bold">${esc(b.bed_no.split('-').pop())}</span>
                <span class="material-symbols-outlined text-[14px]">${b.status === 'occupied' ? 'person' : b.status === 'cleaning' ? 'cleaning_services' : b.status === 'reserved' ? 'bookmark' : 'bed'}</span>
              </div>
              <div class="text-label-sm truncate mt-0.5 font-medium">${esc(b.patient_name || b.status)}</div>
              ${b.los_days !== null && b.patient_name ? `<div class="text-label-sm opacity-70">${b.los_days}d · ${esc(b.financial_category || '')}</div>` : ''}
            </button>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function rowHTML(a) {
  return `
    <td class="font-data-mono text-body-sm">${esc(a.ip_no)}</td>
    <td><div class="font-label-lg text-label-lg flex items-center gap-1.5">${esc(a.patient_name)}
        ${a.allergy_count ? '<span class="material-symbols-outlined text-[14px] text-danger" title="Allergies">warning</span>' : ''}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(a.uhid)} · ${a.age_years ?? '—'}y ${esc((a.gender || '')[0] || '')}${a.blood_group ? ` · ${esc(a.blood_group)}` : ''}</div></td>
    <td><div class="text-body-md">${esc(a.ward_name || '—')}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(a.bed_no || '')} · ${esc(a.bed_class || '')}</div></td>
    <td class="text-body-md">${esc(a.consultant_name || '—')}</td>
    <td class="text-body-md max-w-[200px] truncate" title="${esc(a.diagnosis || '')}">${esc(a.diagnosis || '—')}</td>
    <td><div class="font-data-mono text-body-md">${a.los_days}d</div>
      <div class="text-label-sm text-on-surface-variant">${fmtDate(a.admitted_at)}</div></td>
    <td>${a.financial_category === 'self' ? '<span class="pill-neutral">Self pay</span>' : `<span class="pill-info">${esc(a.financial_category)}</span>`}</td>
    <td class="num">${money(a.bill_total)}</td>
    <td class="num ${SCHEMES.includes(a.financial_category) ? 'text-info' : a.balance > 0 ? 'text-danger font-semibold' : 'text-success'}">${a.balance < 0 ? `Advance ${money(-a.balance)}` : money(a.balance)}
      <div class="text-label-sm text-on-surface-variant">${SCHEMES.includes(a.financial_category) ? 'due from scheme' : `paid ${money(a.bill_paid)}`}</div></td>
    <td>${pill(a.status)}${a.meds_due ? `<span class="pill-warning pill-dot">${a.meds_due} meds due</span>` : ''}</td>
    <td class="text-right whitespace-nowrap">
      ${a.ip_bill_id && can('payment.collect') && !SCHEMES.includes(a.financial_category) ? `<button class="btn-secondary btn-xs" data-act="collect">${PAYER_LABEL[a.financial_category] ? 'Deposit / co-pay' : a.balance > 0 ? 'Collect' : 'Deposit'}</button>` : ''}
      <button class="btn-primary btn-xs" data-act="open">Open</button></td>`;
}

/* --------------------------------------------------------------- drawers */

/** Choose a self-pay hospital package for this stay; its price goes on the running IP bill. */
async function assignAdmissionPackage(a, after) {
  const list = (await api.get('/packages')).filter((p) => !p.payer_id && p.active);
  if (!list.length) { toast('No common hospital packages yet — create one in Packages', 'info'); return; }
  modal({
    title: 'Add a package to this stay', subtitle: `${esc(a.patient_name)} · ${esc(a.ip_no)}`, size: 'sm',
    body: `<label class="field-label">Package</label><select class="field" data-pk>${list.map((p) => `<option value="${p.id}">${esc(p.name)} · ${money(p.price)}${p.los_days ? ` · ${p.los_days} day(s)` : ''}</option>`).join('')}</select>
      <p class="text-body-sm text-on-surface-variant mt-2">The package price is added to the running bill. Charges it covers are offset at discharge; anything outside it is billed as an extra.</p>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Add package</button>',
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.post(`/ipd/admissions/${a.id}/package`, { package_id: +root.querySelector('[data-pk]').value }); close(); toast('Package added to the stay', 'success'); after(); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

/** Aarogyasri (government scheme) pays the whole bill: reception never collects on it. */
const SCHEMES = ['aarogyasri'];
const PAYER_LABEL = { aarogyasri: 'Aarogyasri', insurance: 'Insurance / TPA', corporate: 'Corporate', trust: 'Trust' };
const payerLabel = (a) => a.claim?.tpa || PAYER_LABEL[a.financial_category] || 'payer';
const CLAIM_STATUS = { preauth_pending: 'Pre-auth pending', preauth_approved: 'Pre-auth approved', query: 'Query raised', rejected: 'Rejected',
  claim_submitted: 'Claim submitted', settled: 'Settled', approved: 'Approved', draft: 'Draft' };

function payerCard(a) {
  if (!PAYER_LABEL[a.financial_category]) return '';
  const c = a.claim;
  const status = c ? (CLAIM_STATUS[c.status] || String(c.status).replace(/_/g, ' ')) : 'No payer case yet';
  const tone = !c ? 'pill-warning' : /rejected|query/.test(c.status) ? 'pill-danger' : /approved|submitted|settled/.test(c.status) ? 'pill-success' : 'pill-warning';
  return `<div class="card p-4 flex flex-wrap items-start justify-between gap-3 border-info/30">
    <div class="min-w-0">
      <div class="font-title-md text-title-md">${esc(payerLabel(a))}</div>
      <div class="text-body-md text-on-surface-variant">${c ? `Case ${esc(c.claim_no)}${c.approved ? ` · approved ${money(c.approved)}` : ''}${c.copay_amount ? ` · co-pay ${money(c.copay_amount)}` : ''}` : 'Ask the Insurance desk to open the case'}</div>
      <div class="text-body-sm text-on-surface-variant mt-1">${SCHEMES.includes(a.financial_category)
        ? 'Government scheme: every bill of this stay is due from the scheme and claimed later. Reception does not collect.'
        : 'The payer pays the approved amount; reception collects only the co-pay or items the payer does not cover.'}
        Claim status is managed by the Insurance desk.</div>
    </div>
    <span class="${tone} pill-dot">${esc(status)}</span></div>`;
}

async function openAdmission(id, after) {
  const a = await api.get(`/ipd/admissions/${id}`);
  const scheme = SCHEMES.includes(a.financial_category);
  drawer({
    title: `${a.patient_name} — ${a.ip_no}`,
    subtitle: `${esc(a.ward_name || '')} ${esc(a.bed_no || '')} · ${esc(a.consultant_name || '')} · day ${Math.max(1, Math.ceil((Date.now() - new Date(a.admitted_at.replace(' ', 'T'))) / 864e5))}`,
    width: 'max-w-4xl',
    body: `<div class="p-5 space-y-4">
      ${patientBanner(scheme ? { ...a.patient, outstanding: 0 } : a.patient, { clinicalRestricted: a.access?.clinical === false })}
      ${payerCard(a)}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[{ label: 'Charges so far', value: money(a.bills.reduce((s, b) => s + b.total, 0)), icon: 'receipt_long' },
           { label: 'Paid / deposit', value: money(a.bills.reduce((s, b) => s + b.paid, 0)), icon: 'savings', tone: 'success' },
           scheme ? { label: `Due from ${payerLabel(a)}`, value: money(Math.max(0, a.balance)), icon: 'account_balance', tone: 'info', sub: 'Billed to the scheme — not collected from the patient' }
             : { label: a.balance < 0 ? 'Advance held' : 'Balance due', value: money(Math.abs(a.balance)), icon: 'schedule', tone: a.balance > 0 ? 'danger' : 'success' },
           { label: 'Open orders', value: a.orders.filter((o) => !['verified', 'dispensed', 'cancelled'].includes(o.status)).length, icon: 'science', tone: 'info' }].map(kpi).join('')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${card({ title: 'Medication administration', pad: false, body: a.access?.clinical === false ? '<p class="p-4 text-body-md text-on-surface-variant">Clinical access is restricted for your role.</p>' : a.mar.length ? `
          <div class="max-h-64 overflow-y-auto"><table class="tbl">
            <thead><tr><th>Drug</th><th>Route</th><th>Due</th><th>State</th><th></th></tr></thead>
            <tbody>${a.mar.map((m) => `<tr>
              <td><div class="font-label-lg text-label-lg">${esc(m.drug)}</div>
                <div class="text-label-sm text-on-surface-variant">${esc(m.dose || '')}</div></td>
              <td>${esc(m.route || '')}</td><td class="font-data-mono text-body-sm">${fmtDateTime(m.due_at)}</td>
              <td>${pill(m.status)}</td>
              <td class="text-right">${m.status === 'due' && can('emar.write')
                ? `<button class="btn-primary btn-xs" data-give="${m.id}">Give</button>` : ''}</td></tr>`).join('')}
            </tbody></table></div>` : `<p class="p-4 text-body-md text-on-surface-variant">No medication scheduled.</p>` })}
        ${card({ title: 'Nursing notes', pad: false, body: a.access?.clinical === false ? '<p class="p-4 text-body-md text-on-surface-variant">Clinical access is restricted for your role.</p>' : a.notes.length ? `
          <div class="max-h-64 overflow-y-auto divide-y divide-outline-variant">
            ${a.notes.map((n) => `<div class="p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="pill-neutral capitalize">${esc(n.kind)}</span>
                <span class="text-label-sm text-on-surface-variant">${fmtDateTime(n.recorded_at)} · ${esc(n.by_name || '')}</span></div>
              <div class="text-body-md mt-1">${esc(n.body || n.value || '')}</div></div>`).join('')}
          </div>` : `<p class="p-4 text-body-md text-on-surface-variant">No nursing notes yet.</p>` })}
      </div>
      ${a.package_usage ? packageBlock(a.package_usage) : ''}
      ${chargesCard(a)}
      ${billCard(a)}
    </div>`,
    footer: `<button class="btn-secondary" data-close>Close</button><button class="btn-secondary" data-admission-forms>Admission forms</button>
      ${can('consult.write') && a.status !== 'discharged' ? '<button class="btn-secondary" data-round>Ward round / prescribe</button>' : ''}
      ${can('order.create') && a.status !== 'discharged' ? '<button class="btn-secondary" data-ip-order>Order investigations</button>' : ''}
      ${!a.package_usage && a.status !== 'discharged' && !a.claim?.package_id && (can('ipd.manage') || can('payment.authorize')) ? '<button class="btn-secondary" data-pkg-assign>Add a package</button>' : ''}
      ${a.status !== 'discharged' && (can('nursing.write') || can('ipd.manage')) ? '<button class="btn-secondary" data-cons>Consumables used</button>' : ''}
      ${a.access?.clinical ? `<button class="btn-secondary" data-summary>Discharge summary${a.summary_status === 'final' ? ' ✓' : a.discharge_summary ? ' (draft)' : ''}</button>` : ''}
      ${can('nursing.write') ? `<button class="btn-secondary" data-note>Add nursing note</button>` : ''}
      ${can('ipd.manage') ? `<button class="btn-secondary" data-transfer>Transfer bed</button><button class="btn-secondary" data-convert-payer>Change payer / cash / credit</button>` : ''}
      ${a.ip_bill_id && can('payment.collect') && !scheme ? (() => {
        // this button collects on the IP bill only; ER / pharmacy bills are separate and settle at discharge
        const ipDue = +(a.bills || []).find((b) => b.id === a.ip_bill_id)?.balance || 0;
        if (PAYER_LABEL[a.financial_category]) return `<button class="btn-primary" data-pay title="Deposit, co-pay or items the payer does not cover">Collect deposit / co-pay</button>`;
        return `<button class="btn-primary" data-pay title="Deposit or dues on the IP bill">${ipDue > 0 ? `Collect on IP bill (${money(ipDue)})` : 'Take deposit'}</button>`;
      })() : ''}
      ${can('ipd.discharge') ? `<button class="btn-primary" data-discharge>Start discharge</button>` : ''}`,
    onMount(root, close) {
      root.addEventListener('click', async (e) => {
        const give = e.target.closest('[data-give]');
        if (give) {
          await api.post(`/ipd/nursing/mar/${give.dataset.give}`, { status: 'given' });
          toast('Dose recorded', 'success'); close(); openAdmission(id, after); return;
        }
      });
      root.querySelector('[data-admission-forms]')?.addEventListener('click',()=>openAdmissionForms(id));
      root.querySelector('[data-note]')?.addEventListener('click', () => { close(); addNote(a, () => openAdmission(id, after)); });
      root.querySelector('[data-pay]')?.addEventListener('click', () => { close(); collectBill(a.ip_bill_id, () => { after(); openAdmission(id, after); }); });
      const reopen = () => { close(); openAdmission(id, after); after(); };
      root.querySelector('[data-add-charge]')?.addEventListener('click', () => addChargeForm(a, reopen));
      root.addEventListener('click', async (e) => {
        const stop = e.target.closest('[data-stop-charge]');
        if (stop) {
          const r = await confirmDialog({ title: 'Stop this charge?', message: 'Days already started stay on the bill; waive them separately if they should not be charged.', requireReason: true, tone: 'danger', confirmLabel: 'Stop charge' });
          if (!r) return;
          try { await api.post(`/ipd/admissions/${a.id}/charges/${stop.dataset.stopCharge}/stop`, { reason: r.reason }); toast('Charge stopped', 'success'); reopen(); } catch (err) { apiError(err); }
        }
        const waive = e.target.closest('[data-waive]');
        if (waive) {
          const r = await confirmDialog({ title: 'Waive this line?', message: `${esc(waive.dataset.desc)} — ${money(+waive.dataset.amt, 2)} comes off the bill. The approval and reason are recorded.`, requireReason: true, tone: 'danger', confirmLabel: 'Waive' });
          if (!r) return;
          try { await api.post(`/bills/${waive.dataset.bill}/items/${waive.dataset.waive}/waive`, { reason: r.reason }); toast('Line waived', 'success'); reopen(); } catch (err) { apiError(err); }
        }
      });
      root.querySelector('[data-transfer]')?.addEventListener('click', () => { close(); transferBed(a, after); });
      root.querySelector('[data-summary]')?.addEventListener('click', () => openDischargeSummary(a.id, after));
      root.querySelector('[data-pkg-view]')?.addEventListener('click', () => openPackageUsage({ admission_id: a.id }, after));
      root.querySelector('[data-cons]')?.addEventListener('click', async () => { const { openConsumables } = await import('../consumables.js');
        openConsumables({ source_type: 'admission', source_id: a.id, title: `${a.patient_name} · ${a.ip_no}`, location: ['icu','nicu','picu','hdu'].includes(a.ward_kind) ? 'ICU' : 'IP' }, after); });
      root.querySelector('[data-pkg-assign]')?.addEventListener('click', () => assignAdmissionPackage(a, () => { close(); after(); }));
      root.querySelector('[data-round]')?.addEventListener('click', () => { close(); navigate(`/consultation?encounter=${a.encounter_id}`); });
      root.querySelector('[data-ip-order]')?.addEventListener('click', async () => {
        try { const enc = await api.get(`/encounters/${a.encounter_id}`); const { openOrderDialog } = await import('./consultation.js'); openOrderDialog(enc, after); } catch (err) { apiError(err); }
      });
      root.querySelector('[data-convert-payer]')?.addEventListener('click', async () => {
        try {
          const payers=await api.get('/payers'); close();
          modal({title:'Change admission payer',subtitle:'Existing receipts stay recorded. Running bills link to the payer case; approval, co-pay and exclusions are completed by the insurance desk. Patient credit stays a patient due.',body:`<label class="field-label">Billing category</label><select class="field" data-category>${[['self','Cash / self-pay'],['insurance','Insurance / TPA'],['aarogyasri','Aarogyasri'],['corporate','Company / corporate credit'],['trust','Trust sponsorship'],['credit','Patient credit — pay later']].map(([v,l])=>`<option value="${v}" ${a.financial_category===v?'selected':''}>${l}</option>`).join('')}</select><label class="field-label mt-3">Payer master</label><select class="field" data-payer-master></select><label class="field-label mt-3">Policy / employee / scheme reference</label><input class="field" data-policy><label class="field-label mt-3">Reason *</label><input class="field" data-convert-reason>`,footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-payer>Update payer</button>',onMount(dialog,done){const category=dialog.querySelector('[data-category]'),payer=dialog.querySelector('[data-payer-master]');const fill=()=>{payer.disabled=['self','credit'].includes(category.value);payer.innerHTML='<option value="">Choose payer</option>'+payers.filter(p=>(p.payer_type==='tpa'?'insurance':p.payer_type)===category.value).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');};category.onchange=fill;fill();dialog.querySelector('[data-save-payer]').onclick=async e=>{const button=e.currentTarget;busy(button,true);try{const result=await api.patch(`/ipd/admissions/${id}/payer`,{financial_category:category.value,payer_id:payer.disabled?null:+payer.value,policy_no:dialog.querySelector('[data-policy]').value,reason:dialog.querySelector('[data-convert-reason]').value});done();toast(result.claim_id?'Payer linked — complete approval and co-pay in Insurance & Payer Cases':'Billing category updated','success');after();}catch(err){apiError(err);busy(button,false);}};}});
        }catch(err){apiError(err);}
      });
      root.querySelector('[data-discharge]')?.addEventListener('click', async () => {
        await api.patch(`/ipd/admissions/${a.id}`, { status: 'discharge_initiated' });
        close(); toast('Discharge started — see the discharge board', 'success'); navigate('/discharge');
      });
    },
  });
}

/* ---------------------------------------------------- charges and bill */

const perLabel = (c) => (c.unit === 'day' ? `${money(c.rate)}/day` : c.unit === 'hour' ? `${money(c.rate)}/hour` : money(c.rate));

function chargesCard(a) {
  const plan = a.charges || [];
  const mayEdit = can('billing.create') || can('ipd.manage');
  return card({
    title: 'Running charges', subtitle: 'Daily charges bill every started 24 hours from when they began; hourly charges bill the hours used each day', pad: false,
    actions: mayEdit && a.status !== 'discharged' ? '<button class="btn-secondary btn-sm" data-add-charge><span class="material-symbols-outlined text-[15px]">add</span>Add charge</button>' : '',
    body: plan.length ? `<table class="tbl"><thead><tr><th>Charge</th><th class="num">Rate</th><th>From</th><th class="num">Billed</th><th class="num">Amount</th><th>State</th><th></th></tr></thead><tbody>
      ${plan.map((c) => `<tr><td>${esc(c.description)}${c.stop_reason ? `<div class="text-body-sm text-on-surface-variant">${esc(c.stop_reason)}</div>` : ''}</td>
        <td class="num">${perLabel(c)}</td><td class="text-body-sm">${fmtDateTime(c.started_at)}</td><td class="num">${c.unit === 'hour' ? `${c.qty_billed} h` : c.unit === 'once' ? 'once' : `${c.days_billed} d`}</td>
        <td class="num">${money(c.amount, 2)}</td>
        <td>${c.status === 'active' ? pill('active', 'Running') : pill(c.status === 'ended' ? 'closed' : 'cancelled', c.status === 'ended' ? 'Ended' : 'Stopped')}</td>
        <td class="text-right">${mayEdit && c.status === 'active' && c.kind !== 'bed' ? `<button class="btn-ghost btn-xs" data-stop-charge="${c.id}">Stop</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p class="p-4 text-body-md text-on-surface-variant">No recurring charges on this admission.</p>',
  });
}

function billCard(a) {
  const mayWaive = can('payment.authorize') || can('billing.discount');
  const bills = a.bills.filter((b) => b.status !== 'cancelled');
  if (!bills.length) return '';
  const waived = new Set(bills.flatMap((b) => b.items).filter((i) => i.waiver_of).map((i) => i.waiver_of));
  return card({
    title: 'Bill for this stay', subtitle: bills.map((b) => `${esc(b.bill_no)} (${esc(b.bill_type)})`).join(' · '), pad: false,
    body: `<div class="max-h-80 overflow-y-auto"><table class="tbl"><thead><tr><th>Particulars</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${bills.flatMap((b) => b.items.map((i) => ({ ...i, bill_id: b.id, bill_status: b.status }))).map((i) => `<tr class="${waived.has(i.id) ? 'opacity-50 line-through' : ''}">
        <td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${money(i.rate, 2)}</td><td class="num ${i.amount < 0 ? 'text-success' : ''}">${money(i.amount, 2)}</td>
        <td class="text-right">${mayWaive && i.amount > 0 && !i.waiver_of && !waived.has(i.id) ? `<button class="btn-ghost btn-xs" data-waive="${i.id}" data-bill="${i.bill_id}" data-desc="${esc(i.description)}" data-amt="${i.amount}">Waive</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 border-t border-outline-variant text-body-md">
        <div>Charges <b class="font-data-mono">${money(bills.reduce((s, b) => s + b.total, 0), 2)}</b></div>
        <div>Paid <b class="font-data-mono">${money(bills.reduce((s, b) => s + b.paid, 0), 2)}</b></div>
        <div>Payer / free <b class="font-data-mono">${money(bills.reduce((s, b) => s + (b.covered_amount || 0) + (b.waived_amount || 0), 0), 2)}</b></div>
        <div class="${a.balance > 0 ? 'text-danger' : 'text-success'}">${a.balance < 0 ? 'Advance held' : 'Balance due'} <b class="font-data-mono">${money(Math.abs(a.balance), 2)}</b></div>
      </div>`,
  });
}

async function addChargeForm(a, after) {
  const catalog = await api.get('/ipd/charge-catalog');
  modal({
    title: 'Add charge', subtitle: `${esc(a.patient_name)} · ${esc(a.ip_no)}`, size: 'sm',
    body: `<label class="field-label">Charge</label><select class="field" data-svc>${catalog.map((c) => `<option value="${c.id}" data-price="${c.price}" data-unit="${c.billing_unit}">${esc(c.name)} — ${money(c.price)}${c.billing_unit === 'day' ? '/day' : c.billing_unit === 'hour' ? '/hour' : ''}</option>`).join('')}</select>
      <div class="grid grid-cols-2 gap-3 mt-3"><div><label class="field-label">Rate</label><input class="field text-right" type="number" min="0" step="1" data-rate></div>
      <div><label class="field-label">Billed</label><select class="field" data-unit><option value="day">Per day (24 h)</option><option value="hour">Per hour used</option><option value="once">Once</option></select></div></div>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Add to bill</button>',
    onMount(el, close) {
      const sync = () => { const o = el.querySelector('[data-svc]').selectedOptions[0]; el.querySelector('[data-rate]').value = o?.dataset.price || 0; el.querySelector('[data-unit]').value = o?.dataset.unit || 'day'; };
      el.querySelector('[data-svc]').onchange = sync; sync();
      el.querySelector('[data-save]').onclick = async (e) => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          await api.post(`/ipd/admissions/${a.id}/charges`, { service_id: +el.querySelector('[data-svc]').value, rate: +el.querySelector('[data-rate]').value, unit: el.querySelector('[data-unit]').value });
          close(); toast('Charge added to the IP bill', 'success'); after();
        } catch (err) { apiError(err); busy(btn, false); }
      };
    },
  });
}

function addNote(a, after) {
  modal({
    title: 'Nursing note', subtitle: `${esc(a.patient_name)} · ${esc(a.ip_no)}`, size: 'sm',
    body: `<form data-nf class="space-y-3">
      <div><label class="field-label">Kind</label><select class="field" name="kind">
        <option value="note">General note</option><option value="observation">Observation</option>
        <option value="intake">Intake</option><option value="output">Output</option>
        <option value="medication">Medication</option></select></div>
      <div><label class="field-label">Shift</label><select class="field" name="shift">
        <option value="morning">Morning</option><option value="evening">Evening</option><option value="night">Night</option></select></div>
      <div><label class="field-label">Note</label><textarea class="field" rows="4" name="body" required></textarea></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save note</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-nf]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post('/ipd/nursing/notes', { admission_id: a.id, ...Object.fromEntries(new FormData(form)) });
          close(); toast('Note recorded', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

async function transferBed(a, after) {
  const beds = await api.get('/ipd/beds');
  const free = beds.beds.filter((b) => b.status === 'vacant');
  const unit = (x) => (x.billing_unit || x.unit) === 'hour' ? '/hour' : '/day';
  modal({
    title: 'Transfer bed', subtitle: `${esc(a.patient_name)} currently in ${esc(a.bed_no || '')}`, size: 'md',
    body: `<label class="field-label">Move to</label>
      <select class="field" data-bed>${free.map((b) => `<option value="${b.id}">${esc(b.ward_name)} · ${esc(b.bed_no)} (${esc(b.class)}) — ${money(b.tariff)}/day</option>`).join('')}</select>
      <p class="text-body-sm text-on-surface-variant mt-2">The current bed is released for cleaning. The day already started is billed at the old rate; the new bed and its ward's daily charges start from the next 24-hour cycle. Hourly charges stop at once.</p>
      <div data-plan class="mt-3 text-body-md"></div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Transfer</button>`,
    onMount(root, close) {
      const show = async () => {
        const host = root.querySelector('[data-plan]');
        host.innerHTML = '<p class="text-on-surface-variant">Checking the new ward charges…</p>';
        try {
          const p = await api.get(`/ipd/admissions/${a.id}/transfer-plan?bed_id=${root.querySelector('[data-bed]').value}`);
          const row = (name, value, label, checked, extra = '') => `<label class="flex items-center gap-2 py-1"><input type="checkbox" ${name} value="${value}" ${checked ? 'checked' : ''}><span class="flex-1">${label}</span>${extra}</label>`;
          host.innerHTML = `<div class="font-label-lg mb-1">Charges in the ${esc(p.ward_kind)} ward</div>
            ${p.stop.length ? `<div class="rounded-lg border border-outline-variant p-2 mb-2"><div class="text-label-sm uppercase text-on-surface-variant">Stop (belongs to the old ward)</div>
              ${p.stop.map((c) => row('data-stop', c.id, esc(c.description), true, `<span class="font-data-mono text-body-sm">${money(c.rate)}${unit(c)}</span>`)).join('')}</div>` : ''}
            ${p.start.length ? `<div class="rounded-lg border border-outline-variant p-2 mb-2"><div class="text-label-sm uppercase text-on-surface-variant">Start (this ward's charges)</div>
              ${p.start.map((c) => row('data-start', c.id, esc(c.name), true, `<span class="font-data-mono text-body-sm">${money(c.price)}${unit(c)}</span>`)).join('')}</div>` : ''}
            ${p.keep.length ? `<div class="text-body-sm text-on-surface-variant">Continues: ${p.keep.map((c) => esc(c.description)).join(', ')}</div>` : ''}
            ${!p.stop.length && !p.start.length ? '<p class="text-body-sm text-on-surface-variant">No ward-specific charges change. Set them in Fees & Tariffs → “Applies in”.</p>' : ''}`;
        } catch (e) { host.innerHTML = ''; apiError(e); }
      };
      root.querySelector('[data-bed]').onchange = show;
      if (free.length) show();
      root.querySelector('[data-ok]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.patch(`/ipd/admissions/${a.id}`, { bed_id: +root.querySelector('[data-bed]').value,
            stop_charge_ids: [...root.querySelectorAll('[data-stop]:checked')].map((x) => +x.value),
            start_service_ids: [...root.querySelectorAll('[data-start]:checked')].map((x) => +x.value) });
          close(); toast('Patient transferred — ward charges updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function bedActions(bed, after) {
  modal({
    title: `Bed ${bed.bed_no}`, subtitle: `Currently ${bed.status}`, size: 'sm',
    body: `<label class="field-label">Change state to</label>
      <select class="field" data-s>${['vacant', 'cleaning', 'reserved', 'blocked'].map((s) => `<option value="${s}" ${s === bed.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button>
      ${can('ipd.admit') && bed.status === 'vacant' ? `<button class="btn-secondary" data-admit>Admit here</button>` : ''}
      <button class="btn-primary" data-ok>Update</button>`,
    onMount(root, close) {
      root.querySelector('[data-ok]').onclick = async () => {
        await api.patch(`/ipd/beds/${bed.id}`, { status: root.querySelector('[data-s]').value });
        close(); toast('Bed updated', 'success'); after();
      };
      root.querySelector('[data-admit]')?.addEventListener('click', () => { close(); admitPatient(after, bed.id); });
    },
  });
}

export async function admitPatient(after, presetBedId = null, { patientId = null, emergencyId = null, er = null } = {}) {
  const [beds, catalog, preset] = await Promise.all([api.get('/ipd/beds'), api.get('/ipd/charge-catalog'),
    patientId ? api.get(`/patients/${patientId}`) : Promise.resolve(null)]);
  const free = beds.beds.filter((b) => b.status === 'vacant' || b.id === presetBedId);
  const daily = catalog.filter((c) => ['day', 'hour'].includes(c.billing_unit));
  const kindOf = (bedId) => beds.beds.find((b) => b.id === +bedId)?.ward_kind || 'general';
  const appliesIn = (c, kind) => !c.ward_kinds || String(c.ward_kinds).split(',').includes(kind);
  let picked = preset;
  modal({
    title: 'Admit a patient', subtitle: 'Opens the IP encounter, allots the bed and starts the running IP bill', size: 'lg',
    body: `<form data-af class="space-y-3">
      <div><label class="field-label">Patient *</label>${preset ? `<div class="field flex items-center">${esc(preset.name)} · ${esc(preset.uhid)}</div>` : '<div data-picker></div>'}</div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Bed *</label><select class="field" name="bed_id" required>
          ${free.map((b) => `<option value="${b.id}" ${b.id === presetBedId ? 'selected' : ''}>${esc(b.ward_name)} · ${esc(b.bed_no)} — ${esc(b.class)} (${money(b.tariff)}/day)</option>`).join('')}
        </select></div>
        <div><label class="field-label">Consultant *</label><select class="field" name="consultant_id" required>
          ${doctorOptions(false).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Provisional diagnosis</label><input class="field" name="diagnosis"></div>
        <div><label class="field-label">Admission type</label><select class="field" name="admission_type">
          ${[['planned', 'Planned / elective'], ['emergency', 'Emergency'], ['daycare', 'Day care'], ['transfer_in', 'Transferred in from another hospital']]
            .map(([v, l]) => `<option value="${v}" ${(emergencyId ? 'emergency' : 'planned') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-label">Attendant / bystander</label><input class="field" name="attendant_name" placeholder="filled from the patient record" value="${esc(preset?.kin_name || '')}"></div>
        <div class="grid grid-cols-2 gap-2"><div><label class="field-label">Relation</label><input class="field" name="attendant_relation" value="${esc(preset?.kin_relation || '')}"></div>
          <div><label class="field-label">Attendant mobile</label><input class="field" name="attendant_mobile" value="${esc(preset?.kin_mobile || '')}"></div></div>
        <label class="flex items-center gap-2 text-body-md"><input type="checkbox" name="mlc" ${er?.mlc ? 'checked' : ''}> Medico-legal case (MLC)</label>
        <div><label class="field-label">MLC number</label><input class="field" name="mlc_no" placeholder="if MLC — carried from the ER case" value="${esc(er?.mlc_no || '')}"></div>
        <div><label class="field-label">Financial category</label><select class="field" name="financial_category">
          ${[['self', 'Normal / self pay'], ['credit', 'Credit — pays at discharge / later'], ['insurance', 'Insurance'], ['aarogyasri', 'Aarogyasri'], ['corporate', 'Corporate'], ['trust', 'Trust']]
            .map(([v, l]) => `<option value="${v}" ${(preset?.payer_type || 'self') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="grid grid-cols-2 gap-3 ${['self', 'credit'].includes(preset?.payer_type || 'self') ? 'hidden' : ''}" data-adm-payer>
        <div><label class="field-label">Payer / TPA</label><select class="field" name="payer_id"><option value="">— choose —</option></select>
          <p class="text-body-sm text-on-surface-variant mt-1">Sets the patient's payer: agreed rates apply and the case shows this payer.</p></div>
        <div><label class="field-label">Policy / card / employee no.</label><input class="field" name="policy_no" value="${esc(preset?.policy_no || '')}"></div>
      </div>
      <fieldset><legend class="field-label">Daily charges for this patient</legend>
        <p class="text-body-sm text-on-surface-variant mb-2">The bed is charged at its tariff automatically. Ticked charges follow the chosen bed's ward; daily ones bill every 24 hours from admission, hourly ones the hours used. Stop or waive later.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">${daily.map((c) => `<label class="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 cursor-pointer hover:bg-surface-container-low" data-ward-kinds="${esc(c.ward_kinds || '')}" data-auto="${c.ipd_default ? 1 : 0}">
          <input type="checkbox" name="charges" value="${c.id}">
          <span class="flex-1 text-body-md">${esc(c.name)}${c.ward_kinds ? ` <span class="text-label-sm text-on-surface-variant">(${esc(c.ward_kinds.replace(/,/g, ', '))})</span>` : ''}</span><span class="font-data-mono text-body-sm">${money(c.price)}/${c.billing_unit === 'hour' ? 'hour' : 'day'}</span></label>`).join('')}</div>
      </fieldset>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Admit</button>`,
    onMount(root, close) {
      const form0 = root.querySelector('[data-af]');
      // tick the chosen ward's automatic charges; untick charges that belong to other wards
      const tickForBed = () => {
        const kind = kindOf(form0.bed_id.value);
        root.querySelectorAll('[data-auto]').forEach((l) => {
          const c = { ward_kinds: l.dataset.wardKinds };
          l.querySelector('input').checked = l.dataset.auto === '1' && appliesIn(c, kind);
          l.classList.toggle('opacity-50', !appliesIn(c, kind));
        });
      };
      form0.bed_id.addEventListener('change', tickForBed);
      tickForBed();
      let payerList = [];
      const CAT = { insurance: 'insurance', tpa: 'insurance', aarogyasri: 'aarogyasri', corporate: 'corporate', trust: 'trust' };
      const fillPayers = (cur) => {
        const c = form0.financial_category.value;
        root.querySelector('[data-adm-payer]').classList.toggle('hidden', c === 'self' || c === 'credit');
        form0.payer_id.innerHTML = `<option value="">— choose —</option>${payerList.filter((x) => CAT[x.payer_type] === c)
          .map((x) => `<option value="${x.id}" ${String(x.id) === String(cur ?? '') ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
      };
      api.get('/payers').then((l) => { payerList = l; fillPayers(picked?.payer_id); }).catch(() => {});
      form0.financial_category.addEventListener('change', () => fillPayers(''));
      if (!preset) patientPicker(root.querySelector('[data-picker]'), (p) => {
        picked = p;
        if (p.payer_type && p.payer_type !== 'self') form0.financial_category.value = p.payer_type === 'scheme' ? 'aarogyasri' : p.payer_type;
        form0.policy_no.value = p.policy_no || '';
        form0.attendant_name.value = p.kin_name || ''; form0.attendant_relation.value = p.kin_relation || ''; form0.attendant_mobile.value = p.kin_mobile || '';
        fillPayers(p.payer_id);
      }, { autofocus: true });
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        const form = root.querySelector('[data-af]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true, 'Admitting');
        try {
          const fd = new FormData(form);
          const a = await api.post('/ipd/admissions', { patient_id: picked.id, bed_id: +fd.get('bed_id'), consultant_id: +fd.get('consultant_id'),
            diagnosis: fd.get('diagnosis'), financial_category: fd.get('financial_category'), charges: fd.getAll('charges').map(Number), emergency_id: emergencyId || undefined,
            payer_id: fd.get('payer_id') || undefined, policy_no: fd.get('policy_no') || undefined,
            admission_type: fd.get('admission_type'), attendant_name: fd.get('attendant_name') || undefined, attendant_relation: fd.get('attendant_relation') || undefined,
            attendant_mobile: fd.get('attendant_mobile') || undefined, mlc: fd.get('mlc') ? 1 : 0, mlc_no: fd.get('mlc_no') || undefined });
          close(); after(); openAdmissionForms(a.id);
          toast(`${picked.name} admitted as ${a.ip_no}`, 'success', { action: can('payment.collect') && a.ip_bill_id ? { label: 'Collect deposit', run: () => collectBill(a.ip_bill_id, after) } : undefined });
        } catch (e) { apiError(e, 'Could not admit'); busy(actionButton, false); }
      };
    },
  });
}
