/** Patient record — encounter timeline, clinical history, money and documents. */
import {
  page, eyebrow, card, live, mountPage, patientBanner, apiError, busy,
  api, qs, state, can, navigate,
  $, $$, esc, bind, toast, modal, confirmDialog, pill, flagPill, money,
  fmtDate, fmtDateTime, fmtTime, ago, spinner, emptyState, kpi, renderRows, billStatus, payerFieldsHTML, wirePayerFields,
 modeLabel,
} from './_kit.js';
import {collectBill} from '../collect.js';
import { openDischargeSummary } from '../discharge-summary.js';
import {showBillingContext} from '../billing-context.js';
import { openPayerChange, canChangePayer } from '../payer-change.js';
import {printBill,newBill,canRaiseReceptionBill,openBill} from './bills.js';
import {printPatientPrescription,printStay} from '../patient-print.js';
import { referralHTML, wireReferrals } from '../referrals.js';
import { mountAttachments } from '../attachments.js';
import { printWristband, printFileSticker } from '../labels.js';
import { printsBarcodeLabels } from '../store.js';
import { openPaperForms } from '../paper-forms.js';

let tab = 'timeline';

export async function mount(ctx) {
  const id = ctx.params[0];
  if (!id) { mountPage(ctx, emptyState('folder_shared', 'No patient selected', 'Search for a patient to open their record.')); return; }
  const root = mountPage(ctx, `<div class="p-6">${spinner('Loading record')}</div>`);
  let data, lastSig = '';

  async function load() {
    if(root.querySelector('[data-inline-workflow]'))return;
    const fresh = await api.get(`/patients/${id}/timeline`);
    // the 30-second refresh finds the same record almost every time: leave the screen alone then, so it never jumps
    const sig = JSON.stringify(fresh);
    if (sig === lastSig && root.querySelector('[data-panel]')) return;
    lastSig = sig; data = fresh;
    document.getElementById('page-title').textContent = data.patient.name;
    root.innerHTML = view(data);
    if(data.access?.financial)await showBillingContext(root.querySelector('[data-billing-summary]'),id);
    paintTab(root, data);
    if (can('patient.clinical') || can('patient.edit')) await mountAttachments(root.querySelector('[data-outside-files]'), 'patient', id, {canEdit: true});
    if(data.ward_replacements?.length)root.insertAdjacentHTML('beforeend',card({title:'Emergency rack usage & replacements',body:T(data.ward_replacements,'<tr><th>Slip / store</th><th>Used batches</th><th>Replacement batches / bills</th><th>Status</th></tr>',r=>`<tr><td>${esc(r.replacement_no)} · ${esc(r.location)}</td><td>${esc(r.used||'')}</td><td>${esc(r.replacement||'Pending replacement')}</td><td>${esc(r.status.replaceAll('_',' '))}</td></tr>`,'No ward usage')}));
  }

  // Bills & receipts opens the patient's bills on a page of their own; each bill opens again from there
  bind(root, 'click', '[data-tab]', (e, b) => { if (b.dataset.tab === 'money' && data?.access?.financial) { navigate(`/patient-bills/${id}`); return; } tab = b.dataset.tab; paintTab(root, data);root.querySelector('[data-panel]')?.scrollIntoView({behavior:'smooth',block:'start'}); });
  bind(root,'click','[data-discharge-patient]',async()=>{
    const a=data.admissions.find(x=>x.status!=='discharged');if(!a)return;
    const {doDischarge}=await import('./discharge.js');
    try{await doDischarge({id:a.id,patient_name:data.patient.name,financial_category:a.financial_category,ip_no:a.ip_no,bed_no:a.bed_no},load);}
    catch(err){if(!err?.handled)apiError(err,'Could not discharge');}
  });
  bind(root,'click','[data-running-ip-bill]',(_event,button)=>openBill(+button.dataset.runningIpBill,load).catch(apiError));
  bind(root, 'click', '[data-open-visit]', (e, b) => navigate(`/visit/${b.dataset.openVisit}`));
  bind(root, 'click', '[data-add-allergy]', () => addAllergy(id, load));
  bind(root, 'click', '[data-wristband]', () => printWristband(id).catch(apiError));
  bind(root, 'click', '[data-sticker]', () => printFileSticker(id).catch(apiError));
  bind(root, 'click', '[data-paper-forms]', () => openPaperForms({ id, name: data?.patient?.name || '' }).catch(apiError));
  async function workflow(open) {
    const host=root.querySelector('[data-patient-workflow]');
    if(host.childElementCount){toast('Finish or cancel the current registration before starting another.','info');host.scrollIntoView({behavior:'smooth'});return;}
    host.innerHTML=spinner('Opening form');
    try{await open(host);}catch(error){host.replaceChildren();apiError(error);}
  }
  bind(root, 'click', '[data-new-visit]', () => workflow(async host=>{
    const {openPatientRegistration}=await import('./op-registration.js');await openPatientRegistration(host,data.patient,load);
  }));
  bind(root,'click','[data-new-patient-bill]',()=>workflow(host=>newBill(load,false,{patientId:+id,inlineHost:host})));
  bind(root,'click','[data-admit-patient]',async()=>{
    try { const {admitPatient}=await import('./admissions.js');await workflow(host=>admitPatient(load,null,{patientId:+id,inlineHost:host})); }
    catch(error){apiError(error);}
  });
  bind(root, 'click', '[data-edit]', () => editPatient(data.patient, load));
  bind(root, 'click', '[data-portal]', () => portalAccess(data.patient));
  bind(root, 'click', '[data-counsel]', async (e, b) => { const { openSession } = await import('./counselling.js'); openSession(+b.dataset.counsel, load); });
  bind(root, 'click', '[data-summary]', (e, b) => openDischargeSummary(+b.dataset.summary, load));
  bind(root,'click','[data-open-bill]',(_e,b)=>navigate(`/bill/${b.dataset.openBill}`));
  bind(root,'click','[data-patient-collect]',(_e,b)=>collectBill(+b.dataset.patientCollect,load));
  bind(root, 'click', '[data-print-bill]', (e,b)=>printBill(+b.dataset.printBill));
  bind(root, 'click', '[data-print-rx]', (e,b)=>printPatientPrescription(id,+b.dataset.printRx));
  bind(root, 'click', '[data-print-stay]', (e,b)=>printStay(+b.dataset.printStay,!!data.access?.clinical||(can('ipd.discharge')&&data.admissions.some(a=>a.id===+b.dataset.printStay&&a.summary_status==='final'))));

  return live({ topics: [`patient:${id}`, 'patients'], events: ['patient.updated', 'encounter.created', 'admission.created', 'admission.updated', 'admission.discharged', 'payment.received', 'consultation.saved', 'lab.verified'], load });
}

function view(d) {
  const p = d.patient;
  const running=d.bills.find(bill=>bill.bill_type==='IP'&&bill.status!=='cancelled'&&d.admissions.some(admission=>admission.status!=='discharged'&&admission.encounter_id===bill.encounter_id));
  const permitted=k=>({counsel:d.access?.counselling,clinical:d.access?.clinical,orders:d.access?.orders,rx:d.access?.prescriptions,vitals:d.access?.vitals,money:d.access?.financial,ipd:d.access?.admissions,docs:d.access?.certificates||d.access?.claims}[k]??true);
  if(!permitted(tab))tab='timeline';
  return page({
    eyebrow: `${eyebrow('Patient record', 'folder_shared')}
      <span class="font-data-mono text-label-sm text-on-surface-variant">Registered ${fmtDate(p.created_at)}</span>`,
    title: p.name,
    subtitle: `${d.encounters.length} encounter(s) · ${d.admissions.length} admission(s) · ${d.orders.length} service order(s)`,
    actions: `${can('patient.edit') ? `<button class="btn-secondary" data-edit><span class="material-symbols-outlined text-[18px]">edit</span> Edit</button>` : ''}
      ${printsBarcodeLabels() ? '<button class="btn-ghost" data-wristband title="Print the patient wristband"><span class="material-symbols-outlined text-[18px]">badge</span> Wristband</button>' : ''}<button class="btn-ghost" data-sticker title="Print file stickers">Stickers</button><button class="btn-ghost" data-paper-forms title="Print blank nursing / ICU / OT / consent forms and record the signed copy"><span class="material-symbols-outlined text-[18px]">description</span> Paper forms</button>
      ${d.access?.financial&&d.bills.length?`<button class="btn-secondary" data-print-bill="${d.bills[0].id}">Print latest bill</button>`:''}
      ${d.access?.prescriptions&&d.prescriptions.length?`<button class="btn-secondary" data-print-rx="${d.prescriptions[0].id}">Print latest prescription</button>`:''}
      ${can('patient.edit') || can('op.register') ? `<button class="btn-secondary" data-portal><span class="material-symbols-outlined text-[18px]">phonelink_lock</span> Patient portal</button>` : ''}
      `,
    body: `
      ${patientBanner(p, { actions: can('patient.clinical') ? `<button class="btn-secondary btn-sm" data-add-allergy>
        <span class="material-symbols-outlined text-[15px]">add</span> Allergy</button>` : '' })}
      <section class="card p-4"><h2 class="panel-title">Registration & billing</h2><p class="text-body-sm mt-1">Complete this patient’s OP registration, IPD admission and billing here.</p><div class="flex flex-wrap gap-2 mt-3">
        ${can('op.register')?'<button class="btn-primary" data-new-visit>New OP visit / follow-up</button>':''}
        ${can('ipd.admit')&&!d.admissions.some(a=>a.status!=='discharged')?'<button class="btn-secondary" data-admit-patient>Admit to IPD</button>':''}
        ${d.access?.financial&&canRaiseReceptionBill()?'<button class="btn-secondary" data-new-patient-bill>Raise new bill</button>':''}
        ${d.access?.admissions&&d.admissions.some(a=>a.status!=='discharged')?'<button class="btn-secondary" data-tab="ipd">View current IPD admission</button>':''}
        ${d.access?.financial&&running?`<button class="btn-secondary" data-running-ip-bill="${running.id}">Current IPD bill / deposit</button>`:''}
        ${can('ipd.discharge')&&d.admissions.some(a=>a.status!=='discharged')?'<button class="btn-primary" data-discharge-patient title="Checks unpaid bills, then discharges, frees the bed and removes the patient from the running IP list">Discharge patient</button>':''}
        ${d.access?.financial?'<button class="btn-secondary" data-tab="money">Bills & pharmacy dues</button>':''}
      </div></section><div data-patient-workflow></div>
      ${d.access?.financial?'<div data-billing-summary></div>':''}
      ${(d.pharmacy_pending_bills || []).length?`<div class="card p-3"><button class="btn-secondary" data-tab="money">Pharmacy pending: ${money(d.pharmacy_pending_bills.reduce((sum,b)=>sum+(b.patient_due??b.balance),0))} · View bills</button><p class="text-body-sm mt-2">Read-only at reception. Pharmacy payments are collected at the pharmacy counter.</p></div>`:''}
      ${can('patient.clinical') || can('patient.edit') ? card({title:'Outside prescriptions, reports and discharge records',body:'<div data-outside-files></div>'}) : ''}
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        ${[{ label: 'Total visits', value: d.encounters.length, icon: 'timeline' },
           { label: 'Admissions', value: d.admissions.length, icon: 'hotel' },
           { label: 'Billed lifetime', value: money(d.bills.reduce((s, b) => s + (b.status === 'cancelled' ? 0 : b.total), 0)), icon: 'receipt_long' },
           { label: 'Paid', value: money(d.payments.filter((x) => !x.cancelled).reduce((s, b) => s + b.amount, 0)), icon: 'paid', tone: 'success' },
           { label: 'Outstanding', value: money(p.outstanding), icon: 'schedule', tone: p.outstanding > 0 ? 'danger' : 'success' }].filter((_,i)=>i<2||d.access?.financial!==false).map(kpi).join('')}
      </div>
      <div class="card">
        <nav class="flex items-center gap-1 px-2 border-b border-outline-variant overflow-x-auto" role="tablist">
          ${[['timeline', 'Encounter timeline', d.encounters.length], ['clinical', 'Clinical notes', d.consultations.length],
             ['orders', 'Investigations', d.orders.length], ['rx', 'Prescriptions', d.prescriptions.length],
             ['vitals', 'Vitals', d.vitals.length], ['money', 'Bills & receipts', d.bills.length],
             ['ipd', 'Admissions', d.admissions.length], ['counsel', 'Counselling', (d.counselling || []).length], ['docs', 'Certificates & claims', d.certificates.length + d.claims.length],
             ['profile', 'Demographics', null]]
            .filter(([k])=>permitted(k)).map(([k, label, n]) => `<button role="tab" data-tab="${k}"
              class="h-11 px-3 font-label-lg text-label-lg whitespace-nowrap border-b-2 transition-colors
                ${tab === k ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">
              ${esc(label)}${n !== null ? ` <span class="font-data-mono opacity-60">${n}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="p-4" data-panel></div>
      </div>`,
  });
}

function paintTab(root, d) {
  $$('[data-tab]', root).forEach((b) => {
    const on = b.dataset.tab === tab;
    b.className = b.className.replace(/border-primary text-primary|border-transparent text-on-surface-variant hover:text-on-surface/,
      on ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface');
  });
  const panel = $('[data-panel]', root);
  panel.innerHTML = { timeline, clinical, orders, rx, vitals, money: moneyTab, ipd, counsel, docs, profile }[tab](d);
}

const T = (rows, head, body, empty) => rows.length
  ? `<div class="overflow-auto max-h-[56vh]"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows.map(body).join('')}</tbody></table></div>`
  : emptyState('inbox', empty, '');

const timeline = (d) => d.encounters.length ? `<ol class="relative pl-6 space-y-4">
  <span class="absolute left-[7px] top-2 bottom-2 w-px bg-outline-variant"></span>
  ${d.encounters.map((e) => `<li class="relative">
    <span class="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white
      ${e.kind === 'EMG' ? 'bg-danger' : e.kind === 'IP' ? 'bg-info' : 'bg-primary'}"></span>
    <div class="card p-3 hover:border-primary/40 transition-colors cursor-pointer" data-open-visit="${e.id}">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="font-label-lg text-label-lg">${fmtDate(e.visit_date)}</span>
          <span class="pill-neutral">${esc(e.kind)}</span>
          ${e.visit_type === 'followup' ? '<span class="pill-info">Follow-up</span>' : ''}
          ${pill(e.stage)} ${pill(e.payment_status)}
        </div>
        <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(e.encounter_no)}${e.token_no ? ` · Tok ${e.token_no}` : ''}</span>
      </div>
      <div class="text-body-md mt-1">${esc(e.doctor_name || 'No doctor')} · ${esc(e.dept_name || '')}</div>
      ${e.diagnosis ? `<div class="text-body-md text-on-surface mt-1"><span class="text-on-surface-variant">Diagnosis:</span> ${esc(e.diagnosis)}</div>` : ''}
    </div></li>`).join('')}</ol>` : emptyState('timeline', 'No visits recorded', 'This patient has never been seen here.');

/** Counselling sessions; the doctor-signed summaries are part of the record. */
const COUNSEL_FIELDS = [['explained', 'Explained'], ['risks', 'Risks discussed'], ['alternatives', 'Alternatives'], ['questions', 'Questions'], ['decision', 'Decision'], ['follow_up', 'Follow-up'], ['notes', 'Notes']];
const counsel = (d) => `<div class="flex justify-end mb-3">${can('counsel.write') || can('counsel.review') ? `<a class="btn-secondary btn-sm" href="/counselling?patient=${d.patient.id}"><span class="material-symbols-outlined text-[16px]">add</span> New counselling session</a>` : ''}</div>
  ${(d.counselling || []).length ? `<div class="space-y-3">${d.counselling.map((c) => { const s = JSON.parse(c.summary_json || 'null') || {};
    return `<article class="card p-4"><div class="flex flex-wrap items-center justify-between gap-2">
      <div><span class="font-label-lg text-label-lg">${fmtDate(c.created_at)}</span> <span class="font-data-mono text-label-sm text-on-surface-variant">${esc(c.session_no)}</span>
        <span class="text-body-md text-on-surface-variant ml-2">${esc(c.doctor_name || '')}</span></div>
      <div class="flex items-center gap-2">${c.has_recording ? '<span class="material-symbols-outlined text-[16px] text-on-surface-variant" title="Recorded with consent">mic</span>' : ''}
        ${pill(c.status, c.status === 'reviewed' ? `Signed${c.amended ? ' · amended' : ''}` : c.status.replace('_', ' '))}<button class="btn-ghost btn-xs" data-counsel="${c.id}">Open</button></div></div>
      <div class="text-body-md mt-1">${esc(({ surgery: 'Surgery / procedure consent', diagnosis: 'Diagnosis & treatment plan', high_risk: 'High-risk / critical condition', discharge: 'Discharge & home care', financial: 'Cost estimate & payment', medication: 'Medication', other: 'Other' })[c.topic] || c.topic)}
        · ${c.consent_given ? `consent: ${esc(c.consent_by || '')} (${esc(c.consent_relation || '')})` : 'recording declined'}</div>
      ${c.status === 'reviewed' ? `<dl class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-body-md">${COUNSEL_FIELDS.filter(([k]) => s[k]).map(([k, l]) => `<div><dt class="text-on-surface-variant text-body-sm">${l}</dt><dd class="whitespace-pre-line">${esc(s[k])}</dd></div>`).join('')}</dl>
        <div class="text-body-sm text-on-surface-variant mt-2">Signed by ${esc(c.reviewed_by_name || '')} · ${fmtDateTime(c.reviewed_at)}</div>`
        : '<div class="text-body-sm text-on-surface-variant mt-1">Summary not signed yet.</div>'}</article>`; }).join('')}</div>`
    : emptyState('record_voice_over', 'No counselling recorded', '')}`;

const clinical = (d) => d.consultations.length ? `<div class="space-y-3">
  ${d.consultations.map((c) => `<article class="card p-4">
    <div class="flex items-center justify-between gap-2">
      <div><span class="font-label-lg text-label-lg">${fmtDate(c.created_at)}</span>
        <span class="text-body-md text-on-surface-variant ml-2">${esc(c.doctor_name || '')}</span></div>
      <div class="flex items-center gap-2">${pill(c.status)}</div>
    </div>
    ${c.chief_complaint ? `<div class="mt-2 text-body-lg"><span class="text-on-surface-variant">Complaint:</span> ${esc(c.chief_complaint)}</div>` : ''}
    ${c.examination ? `<div class="text-body-md text-on-surface-variant mt-1">${esc(c.examination)}</div>` : ''}
    ${c.diagnosis ? `<div class="mt-2 inline-block px-2.5 py-1 rounded bg-primary-fixed text-primary font-title-md text-title-md">${esc(c.diagnosis)}</div>` : ''}
    ${c.plan ? `<div class="mt-2 text-body-md"><span class="text-on-surface-variant">Plan:</span> ${esc(c.plan)}</div>` : ''}
    ${c.follow_up_date ? `<div class="text-body-sm text-on-surface-variant mt-1">Review ${fmtDate(c.follow_up_date)}</div>` : ''}
  </article>`).join('')}</div>` : emptyState('description', 'No consultation notes', '');

const orders = (d) => T(d.orders,
  `<th>Order</th><th>Category</th><th>Status</th><th>Ordered by</th><th>Date</th><th></th>`,
  (o) => `<tr><td><div class="font-label-lg text-label-lg">${esc(o.label)}</div>
      <div class="font-data-mono text-label-sm text-on-surface-variant">${esc(o.order_no)}</div></td>
    <td class="capitalize">${esc(o.category)}</td><td>${pill(o.status)}</td>
    <td class="text-body-md">${esc(o.ordered_by_name || '—')}</td>
    <td class="text-body-sm">${fmtDate(o.ordered_at)}</td>
    <td class="text-right">${o.status === 'verified' ? `<a class="btn-ghost btn-xs" href="${o.category === 'imaging' ? '/imaging' : '/laboratory'}">Report</a>` : ''}</td></tr>`,
  'No investigations ordered');

const rx = (d) => d.prescriptions.length ? `<div class="space-y-3">${d.prescriptions.map((r) => `
  <article class="card p-3">
    <div class="flex items-center justify-between">
      <span class="font-label-lg text-label-lg">${fmtDate(r.created_at)} · ${esc(r.doctor_name || '')}</span>
      <div class="flex items-center gap-2">${pill(r.status)}<span class="font-data-mono text-label-sm text-on-surface-variant">${r.item_count} item(s)</span><button class="btn-secondary btn-xs" data-print-rx="${r.id}">Print prescription</button></div>
    </div></article>`).join('')}</div>` : emptyState('prescriptions', 'No prescriptions', '');

const vitals = (d) => T(d.vitals,
  `<th>Recorded</th><th>BP</th><th>Pulse</th><th>Temp</th><th>SpO₂</th><th>Weight</th><th>BMI</th><th>GRBS</th>`,
  (v) => `<tr><td class="text-body-sm">${fmtDateTime(v.recorded_at)}</td>
    <td class="font-data-mono">${v.bp_sys ? `${v.bp_sys}/${v.bp_dia}` : '—'}</td>
    <td class="font-data-mono">${v.pulse ?? '—'}</td><td class="font-data-mono">${v.temp_f ?? '—'}</td>
    <td class="font-data-mono ${v.spo2 < 94 ? 'text-danger font-bold' : ''}">${v.spo2 ?? '—'}</td>
    <td class="font-data-mono">${v.weight_kg ?? '—'}</td><td class="font-data-mono">${v.bmi ?? '—'}</td>
    <td class="font-data-mono">${v.grbs ?? '—'}</td></tr>`,
  'No vitals recorded');

const moneyTab = (d) => `
  ${(() => { const live = d.bills.filter((b) => b.status !== 'cancelled'), due = (b) => Math.max(0, Number(b.patient_due ?? b.balance) || 0),
      hosp = live.filter((b) => b.bill_type !== 'PHARM').reduce((t, b) => t + due(b), 0), ph = live.filter((b) => b.bill_type === 'PHARM').reduce((t, b) => t + due(b), 0);
    return `<div class="rounded-lg px-4 py-2 text-body-lg font-semibold ${hosp + ph > 0.005 ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}">Hospital due: ${money(hosp, 2)} &nbsp;·&nbsp; Pharmacy due: ${money(ph, 2)} &nbsp;·&nbsp; Total: ${money(hosp + ph, 2)}</div>`; })()}
  <div class="grid grid-cols-1 gap-4">
    ${card({ title: 'Bills', actions:canRaiseReceptionBill()?'<button class="btn-primary btn-sm" data-new-patient-bill>Raise new bill</button>':'',pad: false, body: T(d.bills,
      `<th>Doctor</th><th>Visit / file ID</th><th>Invoice number</th><th>Bill date</th><th class="text-right">Discount</th><th class="text-right">Total</th><th class="text-right">Due</th><th>Categories</th><th>Bill status</th><th>Bill type</th><th>Action</th>`,
      (b) => `<tr><td>${esc(b.doctor_name || '—')}</td><td class="font-data-mono text-body-sm">${esc(b.encounter_no || '—')}</td>
        <td class="font-data-mono text-body-sm"><a class="text-primary underline" href="/bill/${b.id}">${esc(b.bill_no)}</a></td><td>${fmtDate(b.bill_date)}</td>
        <td class="num">${b.discount > 0 ? money(b.discount, 2) : '0.00'}</td><td class="num">${money(b.total, 2)}</td>
        <td class="num ${(b.patient_due ?? b.balance) > 0.005 ? 'text-danger font-semibold' : ''}">${money(b.patient_due??b.balance, 2)}</td>
        <td class="text-body-sm capitalize">${esc(String(b.categories || '').replaceAll(',', ', '))}</td><td>${billStatus(b)}</td>
        <td><span class="pill-neutral">${b.bill_type === 'IP' ? 'Inpatient' : b.bill_type === 'PHARM' ? 'Pharmacy' : b.bill_type === 'OP' ? 'Outpatient' : esc(b.bill_type)}</span></td>
        <td class="whitespace-nowrap">${can('payment.collect')&&(b.patient_due??b.balance)>0.005&&(b.bill_type!=='PHARM'||can('pharmacy.dispense'))?`<button class="btn-primary btn-xs" data-patient-collect="${b.id}">Collect</button> `:''}<a class="btn-secondary btn-xs" href="/bill/${b.id}">Bill details</a> <button class="btn-ghost btn-xs" data-print-bill="${b.id}" title="Print — each bill prints on its own and can be reprinted any time"><span class="material-symbols-outlined text-[15px]">print</span></button></td></tr>`,
      'No bills') })}
    ${card({ title: 'Receipts', pad: false, body: T(d.payments,
      `<th>Receipt</th><th>Mode</th><th class="text-right">Amount</th><th>Received by</th>`,
      (p) => `<tr><td><div class="font-data-mono text-body-sm">${esc(p.receipt_no)}</div>
          <div class="text-label-sm text-on-surface-variant">${fmtDateTime(p.created_at)}</div></td>
        <td>${esc(modeLabel(p.mode))}</td>
        <td class="num ${p.amount < 0 ? 'text-danger' : 'text-success'} font-semibold">${money(p.amount)}</td>
        <td class="text-body-md">${esc(p.received_by_name || '')}</td></tr>`,
      'No receipts') })}
  </div>`;

const ipd = (d) => T(d.admissions,
  `<th>IP number</th><th>Ward / bed</th><th>Consultant</th><th>Diagnosis</th><th>Admitted</th><th>Status</th><th>Discharge summary</th>`,
  (a) => `<tr><td class="font-data-mono text-body-sm">${esc(a.ip_no)}</td>
    <td>${esc(a.ward_name || '—')} · ${esc(a.bed_no || '')}</td>
    <td class="text-body-md">${esc(a.consultant || '—')}</td>
    <td class="text-body-md">${esc(a.diagnosis || '—')}</td>
    <td class="text-body-sm">${fmtDate(a.admitted_at)}${a.discharged_at ? ` → ${fmtDate(a.discharged_at)}` : ''}</td>
    <td>${pill(a.status)}</td>
    <td>${a.access?.clinical === false ? '<span class="text-body-sm text-on-surface-variant">Restricted</span>' : a.summary_status === 'final' || a.discharge_summary ? `<button class="btn-secondary btn-xs" data-summary="${a.id}">${a.summary_status === 'final' ? 'View / print' : 'Draft — open'}</button>`
      : a.status === 'discharged' ? `<button class="btn-ghost btn-xs" data-summary="${a.id}">Not written — open</button>` : '<span class="text-body-sm text-on-surface-variant">—</span>'}${d.access?.financial&&can('ipd.view')?` <button class="btn-secondary btn-xs" data-print-stay="${a.id}">Print complete stay</button>`:''}</td></tr>`,
  'Never admitted');

const docs = (d) => `
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    ${card({ title: 'Certificates', pad: false, body: T(d.certificates,
      `<th>Number</th><th>Type</th><th>Period</th><th>Status</th>`,
      (c) => `<tr><td class="font-data-mono text-body-sm">${esc(c.cert_no)}</td><td class="capitalize">${esc(c.kind)}</td>
        <td class="text-body-sm">${c.from_date ? `${fmtDate(c.from_date)} → ${fmtDate(c.to_date)}` : '—'}</td>
        <td>${pill(c.status)}</td></tr>`, 'No certificates issued') })}
    ${card({ title: 'Insurance claims', pad: false, body: T(d.claims,
      `<th>Claim</th><th>TPA</th><th class="text-right">Estimate</th><th class="text-right">Settled</th><th>Status</th>`,
      (c) => `<tr><td class="font-data-mono text-body-sm">${esc(c.claim_no)}</td><td>${esc(c.tpa)}</td>
        <td class="num">${money(c.estimate)}</td><td class="num">${money(c.settled)}</td>
        <td>${pill(c.status)}</td></tr>`, 'No claims') })}
  </div>`;

const profile = (d) => {
  const p = d.patient;
  const row = (k, v) => `<dt class="text-on-surface-variant py-1.5 border-b border-outline-variant/60">${k}</dt>
    <dd class="py-1.5 border-b border-outline-variant/60">${esc(v ?? '—')}</dd>`;
  return `<dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 text-body-lg">
    <div class="grid grid-cols-[150px_1fr]">
      ${row('UHID', p.uhid)}${row('Full name', `${p.title || ''} ${p.name}`)}${row('Gender', p.gender)}
      ${row('Age', p.age_years ? `${p.age_years} years` : null)}${row('Date of birth', p.dob ? fmtDate(p.dob) : null)}
      ${row('Blood group', p.blood_group)}${row('Marital status', p.marital)}${row('Occupation', p.occupation)}
      ${row('ABHA', p.abha)}
    </div>
    <div class="grid grid-cols-[150px_1fr]">
      ${row('Mobile', p.mobile)}${row('Alternate', p.alt_mobile)}${row('Email', p.email)}
      ${row('Address', [p.address, p.city, p.state, p.pincode].filter(Boolean).join(', '))}
      ${row('Next of kin', p.kin_name ? `${p.kin_name} (${p.kin_relation || '—'}) · ${p.kin_mobile || ''}` : null)}
      ${row('Payer', p.payer_type === 'self' ? 'Self pay' : `${p.payer_name || p.payer_type}${p.policy_no ? ` · ${p.policy_no}` : ''}`)}
      ${row('Registered', fmtDateTime(p.created_at))}
    </div></dl>
    ${(p.problems || []).length ? `<div class="mt-4">
      <h3 class="panel-title mb-2">Active problem list</h3>
      <div class="flex flex-wrap gap-2">${p.problems.map((x) => `<span class="pill-info pill-dot">${esc(x.label)}</span>`).join('')}</div>
    </div>` : ''}`;
};

/* ------------------------------------------------------------- actions */

/** Patient portal access: issue / re-issue a 6-digit PIN (shown once), or revoke it. */
async function portalAccess(p) {
  let a;
  try { a = await api.get(`/patients/${p.id}/portal-access`); } catch (e) { apiError(e); return; }
  const url = `${location.origin}/my-health`;
  modal({
    title: 'Patient portal', subtitle: `${esc(p.name)} · ${esc(p.uhid)}`, size: 'sm',
    body: `<div data-pbody class="space-y-3 text-body-md">
      <p>${a.active ? `Access is <b>active</b> — issued ${fmtDateTime(a.issued_at)}${a.issued_by_name ? ` by ${esc(a.issued_by_name)}` : ''}.${a.last_login_at ? ` Last sign-in ${fmtDateTime(a.last_login_at)}.` : ' Not used yet.'}${a.locked ? ' <span class="pill-danger">Locked after wrong attempts</span>' : ''}`
        : 'The patient has no portal access yet.'}</p>
      <p class="text-on-surface-variant text-body-sm">The patient signs in at <span class="font-data-mono">${esc(url)}</span> with their UHID or mobile number and the PIN. A new PIN signs out their other devices.</p>
      ${a.sms_available && p.mobile ? '<label class="flex items-center gap-2"><input type="checkbox" data-sms checked> Also send the PIN by SMS to the registered mobile</label>' : ''}</div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>${a.active ? '<button class="btn-danger" data-revoke>Revoke</button>' : ''}<button class="btn-primary" data-issue>${a.active ? 'Re-issue PIN' : 'Issue PIN'}</button>`,
    onMount(root, close) {
      root.querySelector('[data-issue]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try {
          const r = await api.post(`/patients/${p.id}/portal-access`, { send_sms: !!root.querySelector('[data-sms]')?.checked });
          root.querySelector('[data-pbody]').innerHTML = `<p>Give this PIN to the patient. It is shown only now and is not stored in readable form.</p>
            <div class="text-center font-data-mono text-[32px] tracking-[0.3em] font-bold py-3 border border-outline-variant rounded-lg">${esc(r.pin)}</div>
            <p class="text-body-sm">UHID <b class="font-data-mono">${esc(r.uhid)}</b> · ${esc(url)}${r.sent_by_sms ? ' · also sent by SMS' : ''}</p>`;
          ev.currentTarget.remove(); root.querySelector('[data-revoke]')?.remove();
        } catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
      root.querySelector('[data-revoke]')?.addEventListener('click', async () => {
        const c = await confirmDialog({ title: 'Revoke portal access?', message: 'The patient is signed out everywhere and the PIN stops working.', confirmLabel: 'Revoke', tone: 'danger', requireReason: true });
        if (!c) return;
        try { await api.post(`/patients/${p.id}/portal-access/revoke`, { reason: c.reason }); toast('Portal access revoked', 'success'); close(); } catch (e) { apiError(e); }
      });
    },
  });
}

function addAllergy(id, after) {
  modal({
    title: 'Record an allergy', size: 'sm',
    body: `<form data-af class="space-y-3">
      <div><label class="field-label">Substance *</label><input class="field" name="substance" required placeholder="e.g. Penicillin"></div>
      <div><label class="field-label">Reaction</label><input class="field" name="reaction" placeholder="e.g. Urticaria and angioedema"></div>
      <div><label class="field-label">Severity</label><select class="field" name="severity">
        <option value="mild">Mild</option><option value="moderate" selected>Moderate</option><option value="severe">Severe</option></select></div>
      <p class="text-body-sm text-on-surface-variant">Shown on every clinical screen for this patient from now on.</p>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record allergy</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-af]');
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.post(`/patients/${id}/allergies`, Object.fromEntries(new FormData(form)));
          close(); toast('Allergy recorded', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function editPatient(p, after) {
  modal({
    title: 'Edit patient', subtitle: esc(p.uhid), size: 'lg',
    body: `<form data-ef class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="md:col-span-2"><label class="field-label">Name</label><input class="field" name="name" value="${esc(p.name)}"></div>
      <div><label class="field-label">Age</label><input class="field" name="age_years" type="number" value="${p.age_years ?? ''}"></div>
      <div><label class="field-label">Mobile</label><input class="field" name="mobile" value="${esc(p.mobile || '')}" inputmode="tel" pattern="(\+?91[ \-]?|0)?[6-9][0-9]{4}[ \-]?[0-9]{5}" title="10-digit mobile number, e.g. 98765 43210"></div>
      <div><label class="field-label">Alternate mobile</label><input class="field" name="alt_mobile" value="${esc(p.alt_mobile || '')}"></div>
      <div><label class="field-label">Blood group</label><select class="field" name="blood_group">
        ${['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => `<option ${b === p.blood_group ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="md:col-span-2"><label class="field-label">Address</label><input class="field" name="address" value="${esc(p.address || '')}"></div>
      <div><label class="field-label">City</label><input class="field" name="city" value="${esc(p.city || '')}"></div>
      ${payerFieldsHTML(p)}
      ${referralHTML(p)}
      <div><label class="field-label">ABHA</label><input class="field" name="abha" value="${esc(p.abha || '')}"></div>
      <div><label class="field-label">Next of kin</label><input class="field" name="kin_name" value="${esc(p.kin_name || '')}"></div>
      <div><label class="field-label">Relationship</label><input class="field" name="kin_relation" value="${esc(p.kin_relation || '')}"></div>
      <div><label class="field-label">Kin mobile</label><input class="field" name="kin_mobile" value="${esc(p.kin_mobile || '')}"></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save changes</button>`,
    onMount(root, close) {
      wirePayerFields(root);
      wireReferrals(root);
      root.querySelector('[data-save]').onclick = async (ev) => {
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const form = root.querySelector('[data-ef]');
          if (!form.reportValidity()) { busy(actionButton, false); return; }
          const saved = await api.patch(`/patients/${p.id}`, {...Object.fromEntries(new FormData(form)), pregnant: form.pregnant.checked ? 1 : 0});
          close(); toast('Patient record updated', 'success'); after();
          const open = saved?.payer_open_visits || [];
          if (open.length) payerFollowUp(open, saved.payer_type, after);
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

/** The record's payer now applies to new visits; open visits keep theirs until changed here (money guarded). */
function payerFollowUp(open, category, after) {
  modal({
    title: 'Open visits still on the old payer', size: 'sm',
    body: `<p class="text-body-md">The new payer applies to <strong>new</strong> visits. ${open.length === 1 ? 'This open visit keeps' : 'These open visits keep'} the old payer until you change ${open.length === 1 ? 'it' : 'them'}:</p>
      <ul class="mt-2 space-y-1.5">${open.map((v) => `<li class="flex items-center justify-between gap-2 rounded border border-outline-variant p-2"><span><span class="font-data-mono">${esc(v.ip_no || v.encounter_no)}</span> · ${v.admission_id ? 'Admission' : esc(v.kind)} · ${esc(v.visit_date || '')}</span>
        ${canChangePayer(!!v.admission_id) ? `<button class="btn-secondary btn-xs" data-apply="${v.encounter_id}">Change payer</button>` : '<span class="text-body-sm text-on-surface-variant">Ask the billing desk</span>'}</li>`).join('')}</ul>`,
    footer: '<button class="btn-secondary" data-close>Later</button>',
    onMount(root, close) {
      root.querySelectorAll('[data-apply]').forEach((b) => { b.onclick = () => { close(); openPayerChange(+b.dataset.apply, after, { category }); }; });
    },
  });
}
