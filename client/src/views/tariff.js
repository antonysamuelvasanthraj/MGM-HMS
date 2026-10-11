/** Doctor fees & service tariff master. */
import { loadMeta } from '../store.js';
import {
  page, eyebrow, liveChip, kpiRow, tableCard, filterBar, wireFilters, live, mountPage, card,
  apiError, busy, api, qs, state, can, deptOptions, downloadCSV, compactMoney,
  $, $$, esc, bind, toast, modal, renderRows, pill, money, fmtDate, kpi, titleCase, emptyState,
} from './_kit.js';

let tab = 'services';
let f = { category: '', q: '' };
let services = [];
let doctors = [];

export async function mount(ctx) {
  const root = mountPage(ctx, layout());
  wireFilters(root, (v) => { f = { ...f, ...v }; paint(root); });

  async function load() {
    [services, doctors] = await Promise.all([
      api.get('/services'),
      api.get('/admin/users').catch(() => []),
    ]);
    doctors = doctors.filter((u) => u.role === 'doctor' && u.active);
    $('[data-kpis]', root).innerHTML = [
      { label: 'Services on tariff', value: services.length, icon: 'price_change', sub: `${services.filter((s) => s.active).length} active` },
      { label: 'Consulting doctors', value: doctors.length, icon: 'stethoscope', tone: 'info', sub: 'Active doctors available for OP registration' },
      { label: 'Average OP fee', value: money(doctors.length ? doctors.reduce((s, d) => s + d.op_fee, 0) / doctors.length : 0),
        icon: 'payments', sub: 'Across consulting doctors' },
      // an active service at ₹0 is billed free every time it is ordered
      { label: 'Priced at ₹0', value: services.filter((s) => s.active && !(s.price > 0)).length, icon: 'money_off',
        tone: services.some((s) => s.active && !(s.price > 0)) ? 'danger' : 'success',
        sub: services.some((s) => s.active && !(s.price > 0)) ? `Billed free: ${services.filter((s) => s.active && !(s.price > 0)).slice(0, 3).map((s) => s.name).join(', ')}` : 'Every active service has a price' },
    ].map(kpi).join('');
    paint(root);
  }

  bind(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; paint(root); });
  bind(root, 'click', '[data-edit-svc]', (e, b) => editService(services.find((s) => s.id === +b.dataset.editSvc), load));
  bind(root, 'click', '[data-kit]', async (e, b) => { const { editProcedureKit } = await import('../consumables.js'); editProcedureKit(services.find((s) => s.id === +b.dataset.kit), load); });
  bind(root, 'click', '[data-edit-doc]', (e, b) => editDoctorFee(doctors.find((d) => d.id === +b.dataset.editDoc), load));
  bind(root, 'click', '[data-new-svc]', () => editService(null, load));
  bind(root, 'click', '[data-export]', () => downloadCSV('tariff.csv', tab === 'services'
    ? services.map((s) => ({ code: s.code, name: s.name, category: s.category, department: s.dept_name, price: s.price, billing_unit: s.billing_unit, ipd_default: s.ipd_default, gst: s.gst_pct, tat: s.tat_minutes, active: s.active }))
    : doctors.map((d) => ({ name: d.name, designation: d.designation, department: d.dept_name, op_fee: d.op_fee, followup_fee: d.followup_fee, followup_days: d.followup_days }))));

  return live({ topics: ['admin', 'billing'], events: ['service.updated', 'service.created', 'user.saved'], load });
}

function layout() {
  return page({
    eyebrow: `${eyebrow('Masters', 'price_change')} ${liveChip()}`,
    title: 'Doctor Fees & Service Tariff',
    subtitle: 'Doctor fees price OP registration. Service prices apply to new orders and bills; payer agreements may override them. Existing bills and admission charge plans retain their recorded rates.',
    actions: `<button class="btn-secondary" data-export><span class="material-symbols-outlined text-[18px]">download</span> Export</button>
      ${can('admin.view') ? `<button class="btn-primary" data-new-svc><span class="material-symbols-outlined text-[18px]">add</span> Add a service</button>` : ''}`,
    body: `
      ${kpiRow([], 4)}
      <div class="card p-3 mb-4 text-body-sm text-on-surface-variant">OP consultation: use the Doctor consultation fees tab. Bed charges: the bed rate in Wards &amp; Beds takes priority over the bed service tariff. Daily IP charges: added to the admission charge plan. Hospital packages: configure in Packages; TPA and scheme packages and agreed service rates: configure in Payers &amp; TPAs.</div>
      <div class="card">
        <nav class="flex items-center gap-1 px-2 border-b border-outline-variant">
          ${[['services', 'Service tariff'], ['doctors', 'Doctor consultation fees']].map(([k, l]) => `
            <button data-tab="${k}" class="h-11 px-3 font-label-lg text-label-lg border-b-2
              ${tab === k ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">${l}</button>`).join('')}
        </nav>
        <div class="p-3 border-b border-outline-variant" data-filters-host>
          ${filterBar([
            { type: 'search', key: 'q', label: '', placeholder: 'Search by name or code' },
            { type: 'select', key: 'category', label: '', value: f.category, options: [
              { value: '', label: 'All categories' },
              { value: 'consultation', label: 'Doctor Consultation' },
              { value: 'lab', label: 'Laboratory & Pathology' },
              { value: 'imaging', label: 'Radiology & Imaging' },
              { value: 'procedure', label: 'Procedures & Surgeries' },
              { value: 'emergency', label: 'Emergency & Casualty' },
              { value: 'ipd', label: 'Inpatient Daily Charges' },
              { value: 'bed', label: 'Bed & Room Charges' },
              { value: 'package', label: 'Legacy package service rows' },
              { value: 'other', label: 'Consumables & Other Services' }] },
          ]).replace('card p-3 ', '')}
        </div>
        <div class="overflow-auto" style="max-height:60vh" data-panel></div>
      </div>`,
  });
}

function paint(root) {
  $$('[data-tab]', root).forEach((b) => {
    const on = b.dataset.tab === tab;
    b.className = b.className.replace(/border-primary text-primary|border-transparent text-on-surface-variant hover:text-on-surface/,
      on ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface');
  });
  const categoryFilter = $('[data-f="category"]', root);
  if (categoryFilter) categoryFilter.hidden = tab !== 'services';
  const panel = $('[data-panel]', root);
  const q = (f.q || '').toLowerCase();

  if (tab === 'services') {
    const rows = services.filter((s) => (!f.category || s.category === f.category) && (!q || `${s.name} ${s.code}`.toLowerCase().includes(q)));
    panel.innerHTML = `<table class="tbl"><thead><tr>
      <th style="width:100px">Code</th><th>Service</th><th>Category</th><th>Department</th>
      <th class="text-right">Price</th><th class="text-right">GST</th><th class="text-right">TAT</th>
      <th>Status</th><th style="width:80px"></th></tr></thead>
      <tbody>${rows.map((s) => `<tr>
        <td class="font-data-mono text-body-sm">${esc(s.code)}</td>
        <td class="font-label-lg text-label-lg">${esc(s.name)}
          ${s.sample_type ? `<div class="text-label-sm text-on-surface-variant">${esc(s.sample_type)}</div>` : ''}</td>
        <td><span class="pill-neutral capitalize">${esc(s.category)}</span></td>
        <td class="text-body-md">${esc(s.dept_name || '—')}</td>
        <td class="num font-semibold ${s.active && !(s.price > 0) ? 'text-danger' : ''}">${money(s.price)}${s.active && !(s.price > 0) ? ' <span class="pill-danger !py-0 text-[10px]">No price</span>' : ''}<div class="text-label-sm text-on-surface-variant">${s.billing_unit === 'day' ? 'Per 24-hour cycle' : s.billing_unit === 'hour' ? 'Per hour used' : 'Per item / service'}${s.ipd_default ? ' · IP default' : ''}${s.ward_kinds ? ` · ${esc(s.ward_kinds.replace(/,/g, ', '))}` : ''}</div></td>
        <td class="num">${s.gst_pct ? `${s.gst_pct}%` : '—'}</td>
        <td class="num">${s.tat_minutes ? `${s.tat_minutes}m` : '—'}</td>
        <td>${s.active ? '<span class="pill-success pill-dot">Active</span>' : '<span class="pill-neutral">Inactive</span>'}</td>
        <td class="text-right whitespace-nowrap">${can('admin.view') && ['procedure', 'emergency'].includes(s.category) ? `<button class="btn-ghost btn-xs" data-kit="${s.id}" title="Standard consumables">Kit${s.consumables_included ? ' ✓' : ''}</button>` : ''}
          ${can('admin.view') ? `<button class="btn-secondary btn-xs" data-edit-svc="${s.id}">Edit</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="9" class="py-10 text-center text-on-surface-variant">No services match.</td></tr>`}
      </tbody></table>`;
  } else {
    const rows = doctors.filter((d) => !q || d.name.toLowerCase().includes(q));
    panel.innerHTML = `<table class="tbl"><thead><tr>
      <th>Doctor</th><th>Department</th><th>Registration</th>
      <th class="text-right">New consultation</th><th class="text-right">Follow-up</th>
      <th class="text-right">Free window</th><th style="width:80px"></th></tr></thead>
      <tbody>${rows.map((d) => `<tr>
        <td><div class="font-label-lg text-label-lg">${esc(d.name)}</div>
          <div class="text-label-sm text-on-surface-variant">${esc(d.designation || '')}</div></td>
        <td class="text-body-md">${esc(d.dept_name || '—')}</td>
        <td class="font-data-mono text-body-sm">${esc(d.reg_no || '—')}</td>
        <td class="num font-semibold ${d.op_fee ? '' : 'text-danger'}">${money(d.op_fee)}</td>
        <td class="num">${money(d.followup_fee)}</td>
        <td class="num">${d.followup_days} days</td>
        <td class="text-right">${can('admin.write') ? `<button class="btn-secondary btn-xs" data-edit-doc="${d.id}">Edit</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="7" class="py-10 text-center text-on-surface-variant">No doctors match.</td></tr>`}
      </tbody></table>
      <div class="p-3 text-body-sm text-on-surface-variant border-t border-outline-variant">
        ₹0 is an explicit zero fee. Free follow-ups apply inside the configured window; after it the saved follow-up fee applies. Individual free-treatment requests follow the approval workflow.</div>`;
  }
}

const CATEGORY_DEFINITIONS = [
  { value: 'consultation', label: 'Doctor Consultation', desc: 'OP & Specialist Consultation', primaryDept: 'GEN' },
  { value: 'lab', label: 'Laboratory & Pathology', desc: 'Blood, Urine, Biochem & Micro Tests', primaryDept: 'LAB' },
  { value: 'imaging', label: 'Radiology & Imaging', desc: 'X-Ray, Ultrasound, CT, MRI, ECG', primaryDept: 'RAD' },
  { value: 'procedure', label: 'Procedures & Surgeries', desc: 'Minor OPD Procedures & Major OT Surgeries', primaryDept: 'OT' },
  { value: 'emergency', label: 'Emergency & Casualty', desc: 'ER Triage & Trauma Procedures', primaryDept: 'EMER' },
  { value: 'ipd', label: 'Inpatient Daily Charges', desc: 'Nursing Care & Daily Doctor Rounds', primaryDept: 'NURS' },
  { value: 'bed', label: 'Bed & Room Charges', desc: 'General Ward, ICU, Private Rooms', primaryDept: 'NURS' },
  { value: 'package', label: 'Packages & Health Bundles', desc: 'Bundled Health Checkups & Schemes', primaryDept: 'ADMIN' },
  { value: 'other', label: 'Consumables & Other Services', desc: 'Medical Supplies & Miscellaneous Services', primaryDept: null },
];

function getCategoryDepts(category) {
  const allDepts = state.meta.departments || [];
  const codeMap = {
    lab: ['LAB', 'PATH', 'BIO', 'MICRO', 'HEM'],
    imaging: ['RAD', 'CARD', 'GAST'],
    procedure: ['OT', 'SURG', 'ORTHO', 'OBG', 'DENT', 'OPH', 'ENT', 'PLAS', 'URO', 'ANES'],
    consultation: ['GEN', 'PED', 'OBG', 'SURG', 'ORTHO', 'CARD', 'NEUR', 'DERM', 'ENT', 'OPH', 'PUL', 'ENDO', 'ONC', 'NEPH', 'URO', 'PSY', 'RHEUM', 'PT'],
    emergency: ['EMER'],
    bed: ['NURS', 'ICU'],
    ipd: ['NURS', 'ICU'],
    package: ['ADMIN', 'GEN', 'LAB', 'RAD'],
    other: [],
  };

  const nameKeywordMap = {
    lab: ['lab', 'patholog', 'biochem', 'microbio', 'hematolog'],
    imaging: ['radiolog', 'imaging', 'x-ray', 'ultrasound', 'scan', 'usg'],
    procedure: ['operation', 'theatre', 'surgery', 'surgical', 'dental', 'ophthalmology', 'orthopaedic', 'ent', 'urology', 'anaesthesiology'],
    consultation: ['medicine', 'pediatric', 'paediatric', 'cardiology', 'neurology', 'dermatology', 'gynaecology', 'psychiatry', 'pulmonology', 'nephrology', 'oncology', 'physiotherapy'],
    emergency: ['emergency', 'casualty', 'trauma'],
    bed: ['nursing', 'intensive', 'icu', 'ward'],
    ipd: ['nursing', 'intensive', 'icu', 'ward'],
    package: ['admin', 'preventive', 'wellness'],
    other: [],
  };

  const codes = codeMap[category] || [];
  const kw = nameKeywordMap[category] || [];

  const recommended = allDepts.filter(d => codes.includes(d.code) || kw.some(k => (d.name || '').toLowerCase().includes(k)));
  const others = allDepts.filter(d => !recommended.some(r => r.id === d.id));
  return { recommended, others };
}

function editService(s, after) {
  const defaultCategory = s?.category || 'consultation';
  let labParams = [];

  modal({
    title: s ? `Edit ${s.name}` : 'Add a service to tariff',
    subtitle: 'Services are immediately available across Reception, OPD, Diagnostics, and Billing.',
    size: 'lg',
    body: `<form data-sf class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="md:col-span-2">
          <label class="field-label">Service Name *</label>
          <input class="field font-semibold" name="name" required value="${esc(s?.name || '')}" placeholder="e.g. Complete Blood Count (CBC) or Knee Replacement">
        </div>
        <div>
          <label class="field-label">Service Code *</label>
          <input class="field font-data-mono" name="code" required value="${esc(s?.code || '')}" ${s ? 'readonly' : ''} placeholder="e.g. LAB-CBC or SURG-KNEE">
          <p class="text-body-sm text-on-surface-variant mt-0.5">Unique billing and tariff code</p>
        </div>
        <div>
          <label class="field-label font-bold text-primary">Category *</label>
          <select class="field font-medium border-primary" name="category" data-cat-select>
            ${CATEGORY_DEFINITIONS.filter(c => c.value !== 'package' || s?.category === 'package').map(c => `
              <option value="${c.value}" ${c.value === defaultCategory ? 'selected' : ''}>
                ${c.label} (${c.desc})
              </option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label font-bold">Department *</label>
          <select class="field" name="department_id" data-dept-select></select>
          <p class="text-body-sm text-on-surface-variant mt-0.5" data-dept-hint>Department filtered based on selected category</p>
        </div>
        <div>
          <label class="field-label">Standard Price (₹) *</label>
          <input class="field font-data-mono font-bold text-title-md" type="number" min="0" step="0.01" name="price" required value="${s?.price ?? 0}">
        </div>
        <div>
          <label class="field-label">GST Tax %</label>
          <select class="field" name="gst_pct">
            ${[0, 5, 12, 18, 28].map(g => `<option value="${g}" ${(s?.gst_pct ?? 0) === g ? 'selected' : ''}>${g}% ${g === 0 ? '(Exempted / Healthcare default)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-center">
          ${s ? `<label class="flex items-center gap-2 text-body-md font-medium cursor-pointer">
            <input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Active on the hospital tariff</label>` : ''}
        </div>
      </div>

      <!-- Dynamic Category Settings Panel -->
      <div class="rounded-xl border border-primary/20 bg-surface-container-low p-4 space-y-3" data-category-settings></div>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save service</button>`,
    onMount(root, close) {
      const form = root.querySelector('[data-sf]');
      const catSelect = root.querySelector('[data-cat-select]');
      const deptSelect = root.querySelector('[data-dept-select]');
      const settingsHost = root.querySelector('[data-category-settings]');

      // 1. Populate Department options according to Category
      const refreshDepts = (cat, selectedId) => {
        const { recommended, others } = getCategoryDepts(cat);
        const def = CATEGORY_DEFINITIONS.find(c => c.value === cat);
        let html = '';

        if (recommended.length) {
          html += `<optgroup label="Recommended for ${def ? def.label : cat}">`;
          html += recommended.map(d => `<option value="${d.id}" ${String(d.id) === String(selectedId) ? 'selected' : ''}>${esc(d.name)} (${esc(d.code)})</option>`).join('');
          html += `</optgroup>`;
        }
        if (others.length) {
          html += `<optgroup label="Other Hospital Departments">`;
          html += others.map(d => `<option value="${d.id}" ${String(d.id) === String(selectedId) ? 'selected' : ''}>${esc(d.name)} (${esc(d.code)})</option>`).join('');
          html += `</optgroup>`;
        }

        deptSelect.innerHTML = html;
        if (!selectedId && recommended.length) {
          deptSelect.value = recommended[0].id;
        }
      };

      // 2. Render Category-specific tailored settings
      const renderSettings = async (cat) => {
        if (cat === 'lab') {
          settingsHost.innerHTML = `
            <div class="flex items-center justify-between border-b border-outline-variant pb-2">
              <div class="font-label-lg text-label-lg font-bold text-primary flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px]">biotech</span> Laboratory & Pathology Configuration
              </div>
              <span class="pill-info">Diagnostic Master</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="field-label">Sample / Specimen Type</label>
                <input class="field" name="sample_type" value="${esc(s?.sample_type || 'Blood')}" placeholder="e.g. Blood, Urine, Serum" data-sample-input>
                <div class="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span class="text-body-sm text-on-surface-variant text-xs">Quick:</span>
                  ${['Blood', 'Serum', 'Plasma', 'Urine', 'Stool', 'Sputum', 'CSF', 'Swab', 'Biopsy'].map(t => `
                    <button type="button" class="btn-ghost btn-xs text-xs !py-0.5 !px-1.5" data-chip-sample="${t}">${t}</button>
                  `).join('')}
                </div>
              </div>
              <div>
                <label class="field-label">Turnaround Time (minutes)</label>
                <input class="field" type="number" name="tat_minutes" value="${s?.tat_minutes ?? 60}" data-tat-input>
                <div class="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span class="text-body-sm text-on-surface-variant text-xs">Quick:</span>
                  <button type="button" class="btn-ghost btn-xs text-xs !py-0.5 !px-1.5" data-chip-tat="30">30m (Stat)</button>
                  <button type="button" class="btn-ghost btn-xs text-xs !py-0.5 !px-1.5" data-chip-tat="60">60m (Routine)</button>
                  <button type="button" class="btn-ghost btn-xs text-xs !py-0.5 !px-1.5" data-chip-tat="120">2 hours</button>
                  <button type="button" class="btn-ghost btn-xs text-xs !py-0.5 !px-1.5" data-chip-tat="1440">24 hours</button>
                </div>
              </div>
            </div>

            <!-- Lab Result Parameters Template -->
            <div class="pt-2 border-t border-outline-variant space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-label-md text-label-md font-semibold text-on-surface">Test Result Parameters & Reference Ranges</span>
                  <p class="text-body-sm text-on-surface-variant text-xs">Phlebotomists and lab technicians enter findings against these parameters.</p>
                </div>
              </div>
              <div class="border border-outline-variant rounded-lg overflow-hidden bg-surface" data-params-table-host>
                <div class="p-3 text-center text-body-sm text-on-surface-variant">Loading lab test parameters…</div>
              </div>
              <div class="p-2.5 rounded-lg bg-surface border border-outline-variant grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                <input class="field field-sm" data-new-param-name placeholder="Parameter name (e.g. Haemoglobin)">
                <input class="field field-sm" data-new-param-unit placeholder="Unit (e.g. g/dL)">
                <input class="field field-sm" type="number" step="0.01" data-new-param-low placeholder="Ref Min (e.g. 13)">
                <input class="field field-sm" type="number" step="0.01" data-new-param-high placeholder="Ref Max (e.g. 17)">
                <button type="button" class="btn-secondary btn-sm" data-add-param-btn>
                  <span class="material-symbols-outlined text-[15px]">add</span> Add Parameter
                </button>
              </div>
            </div>
          `;

          // Wire Lab chips
          settingsHost.querySelectorAll('[data-chip-sample]').forEach(b => {
            b.onclick = () => { settingsHost.querySelector('[data-sample-input]').value = b.dataset.chipSample; };
          });
          settingsHost.querySelectorAll('[data-chip-tat]').forEach(b => {
            b.onclick = () => { settingsHost.querySelector('[data-tat-input]').value = b.dataset.chipTat; };
          });

          // Load & Render Lab Parameters
          const paramsHost = settingsHost.querySelector('[data-params-table-host]');
          const loadParams = async () => {
            if (!s?.id) {
              paramsHost.innerHTML = `<div class="p-3 text-center text-body-sm text-on-surface-variant">Save this new lab test first; you can then add parameters and reference ranges here.</div>`;
              return;
            }
            try {
              labParams = await api.get(`/lab/params?service_id=${s.id}`);
              if (!labParams.length) {
                paramsHost.innerHTML = `<div class="p-3 text-center text-body-sm text-on-surface-variant">No test parameters defined yet. Add the first parameter below (e.g. Result value, Haemoglobin, WBC).</div>`;
                return;
              }
              paramsHost.innerHTML = `
                <table class="tbl tbl-sm">
                  <thead><tr>
                    <th>Parameter</th><th>Unit</th><th>Normal Range</th><th>Display Reference</th><th style="width:40px"></th>
                  </tr></thead>
                  <tbody>${labParams.map(p => `
                    <tr>
                      <td class="font-medium">${esc(p.name)}</td>
                      <td class="font-data-mono">${esc(p.unit || '—')}</td>
                      <td class="font-data-mono">${p.ref_low !== null && p.ref_high !== null ? `${p.ref_low} – ${p.ref_high}` : '—'}</td>
                      <td class="text-body-sm text-on-surface-variant">${esc(p.ref_text || '—')}</td>
                      <td class="text-right">
                        <button type="button" class="btn-ghost btn-xs text-danger" data-del-param="${p.id}"><span class="material-symbols-outlined text-[15px]">close</span></button>
                      </td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              `;
            } catch (err) {
              paramsHost.innerHTML = `<div class="p-3 text-danger text-body-sm">Could not load parameters: ${esc(err.message)}</div>`;
            }
          };

          settingsHost.querySelector('[data-add-param-btn]').onclick = async () => {
            if (!s?.id) { toast('Save the service first to configure test parameters', 'info'); return; }
            const pName = settingsHost.querySelector('[data-new-param-name]').value.trim();
            if (!pName) { toast('Parameter name is required', 'warning'); return; }
            const pUnit = settingsHost.querySelector('[data-new-param-unit]').value.trim();
            const pLow = settingsHost.querySelector('[data-new-param-low]').value;
            const pHigh = settingsHost.querySelector('[data-new-param-high]').value;
            try {
              await api.post('/lab/params', {
                service_id: s.id,
                name: pName,
                unit: pUnit || null,
                ref_low: pLow ? +pLow : null,
                ref_high: pHigh ? +pHigh : null,
              });
              settingsHost.querySelector('[data-new-param-name]').value = '';
              settingsHost.querySelector('[data-new-param-unit]').value = '';
              settingsHost.querySelector('[data-new-param-low]').value = '';
              settingsHost.querySelector('[data-new-param-high]').value = '';
              toast(`Parameter ${pName} added`, 'success');
              loadParams();
            } catch (err) { apiError(err); }
          };

          paramsHost.onclick = async (e) => {
            const del = e.target.closest('[data-del-param]');
            if (!del) return;
            try {
              await api.del(`/lab/params/${del.dataset.delParam}`);
              toast('Parameter removed', 'success');
              loadParams();
            } catch (err) { apiError(err); }
          };

          loadParams();

        } else if (cat === 'imaging') {
          settingsHost.innerHTML = '<label class="field-label">Turnaround time (minutes)</label><input class="field" type="number" min="0" step="1" name="tat_minutes" value="' + (s?.tat_minutes ?? 45) + '"><p class="text-body-sm">Name the scan and modality in the service name. Reports and clinical templates are managed in their clinical screens.</p>';
        } else if (cat === 'bed') {
          settingsHost.innerHTML = '<input type="hidden" name="billing_unit" value="day"><p class="text-body-sm">Fallback daily bed tariff. Set the actual bed rate and room class in Wards &amp; Beds. Each started 24-hour cycle is billed; existing admissions retain their charge plan rate.</p>';
        } else if (cat === 'ipd') {
          settingsHost.innerHTML = `
            <div class="flex items-center justify-between border-b border-outline-variant pb-2">
              <div class="font-label-lg text-label-lg font-bold text-primary flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px]">local_hospital</span> Inpatient Recurring Services Configuration
              </div>
              <span class="pill-info">Inpatient Master</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="field-label">Billing Unit *</label>
                <select class="field" name="billing_unit">
                  <option value="day" ${!['once', 'hour'].includes(s?.billing_unit) ? 'selected' : ''}>Day (every started 24 hours from admission)</option>
                  <option value="hour" ${s?.billing_unit === 'hour' ? 'selected' : ''}>Hour (hours actually used, e.g. monitor, oxygen, ventilator)</option>
                  <option value="once" ${s?.billing_unit === 'once' ? 'selected' : ''}>Once (one-time charge)</option>
                </select>
              </div>
              <div class="flex items-center pt-5">
                <label class="flex items-center gap-2 text-body-md font-medium cursor-pointer">
                  <input type="checkbox" name="ipd_default" ${s?.ipd_default ? 'checked' : ''}>
                  Add automatically on admission / transfer
                </label>
              </div>
              <div class="md:col-span-2">
                <label class="field-label">Applies in</label>
                <div class="flex flex-wrap gap-x-4 gap-y-1" data-ward-kinds>${[['general', 'General ward'], ['semi_private', 'Semi-private'], ['private', 'Private'], ['special', 'Special'], ['deluxe', 'Deluxe'], ['icu', 'ICU'], ['nicu', 'NICU'], ['picu', 'PICU'], ['hdu', 'HDU'], ['labour', 'Labour room'], ['postop', 'Post-operative'], ['er_obs', 'ER observation'], ['ot', 'OT / recovery']]
                  .map(([k, l]) => `<label class="flex items-center gap-1.5 text-body-md"><input type="checkbox" value="${k}" ${String(s?.ward_kinds || '').split(',').includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
                <p class="text-body-sm text-on-surface-variant mt-1">Leave all unticked for every ward. On a bed transfer, charges that do not apply in the new ward stop and the new ward's charges start.</p>
              </div>
            </div>
          `;

        } else if (cat === 'consultation') {
          settingsHost.innerHTML = `
            <div class="p-3 rounded-lg bg-info-bg border border-info/20 text-body-sm text-info flex items-start gap-2">
              <span class="material-symbols-outlined text-[18px] text-info">info</span>
              <div>
                <strong>Doctor OP Fees & Follow-up Rules:</strong> Individual doctors set their own specific consultation and follow-up tariffs under the <strong>Doctor consultation fees</strong> tab. This tariff row provides the hospital-level baseline service.
              </div>
            </div>
          `;

        } else {
          settingsHost.innerHTML = `
            <p class="text-body-sm text-on-surface-variant">General service configuration. Applicable across OPD and billing desks.</p>
          `;
        }
      };

      // Initial department population & category settings
      refreshDepts(defaultCategory, s?.department_id);
      renderSettings(defaultCategory);

      // On Category change:
      catSelect.onchange = () => {
        const cat = catSelect.value;
        refreshDepts(cat, null);
        renderSettings(cat);
      };

      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!form.reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          const b = Object.fromEntries(new FormData(form));
          if (s) b.active = form.active?.checked ? 1 : 0;
          if (form.billing_unit) b.billing_unit = form.billing_unit.value;
          else if (['bed', 'ipd'].includes(b.category)) b.billing_unit = 'day';
          if (form.ipd_default) b.ipd_default = form.ipd_default.checked ? 1 : 0;
          const wk = form.querySelector('[data-ward-kinds]');
          if (wk) b.ward_kinds = [...wk.querySelectorAll('input:checked')].map((x) => x.value).join(',');
          if (form.sample_type) b.sample_type = form.sample_type.value.trim() || null;
          if (form.tat_minutes) b.tat_minutes = form.tat_minutes.value ? +form.tat_minutes.value : null;

          if (s) await api.patch(`/services/${s.id}`, b);
          else await api.post('/services', b);

          await loadMeta(true);
          close();
          toast('Tariff & category settings updated', 'success');
          after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}

function editDoctorFee(d, after) {
  modal({
    title: `Consultation tariff — ${d.name}`, subtitle: esc(d.designation || ''), size: 'sm',
    body: `<form data-df class="space-y-3">
      <div><label class="field-label">New consultation fee</label><input class="field" type="number" required min="0" step="0.01" name="op_fee" value="${d.op_fee}"></div>
      <div><label class="field-label">Follow-up fee</label><input class="field" type="number" required min="0" step="0.01" name="followup_fee" value="${d.followup_fee}"></div>
      <div><label class="field-label">Free follow-up window (days)</label><input class="field" type="number" required min="0" step="1" name="followup_days" value="${d.followup_days}"></div>
      <p class="text-body-sm text-on-surface-variant">Registration charges the new-consultation fee by default. A follow-up
        inside the window costs nothing; after it, the follow-up fee applies.</p>
    </form>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save tariff</button>`,
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!root.querySelector('[data-df]').reportValidity()) return;
        const actionButton = ev.currentTarget;
        busy(actionButton, true);
        try {
          await api.patch(`/admin/users/${d.id}`, Object.fromEntries(new FormData(root.querySelector('[data-df]'))));
          await loadMeta(true);
          close(); toast('Doctor tariff updated', 'success'); after();
        } catch (e) { apiError(e); busy(actionButton, false); }
      };
    },
  });
}
