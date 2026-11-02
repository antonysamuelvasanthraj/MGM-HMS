import { api } from './api.js';
import { state, can, loadMeta } from './store.js';
import { modal, esc, toast } from './ui.js';
import { apiError } from './views/_kit.js';
import { loadLabUnits, labUnitField, wireLabUnits } from './lab-units.js';

export const canEditLabTemplates = () => can('admin.write') || (can('staff.manage') && can('lab.verify'));
const canAddLabTest = () => can('admin.view') || (state.user?.role === 'lab_admin' && canEditLabTemplates());
export async function openLabTemplates() {
  await loadMeta();
  const services = (state.meta?.services || []).filter(s => s.category === 'lab');
  modal({ title: 'Laboratory templates and validated reference ranges', size: 'xl',
    body: `<label class="field-label">Test</label><select class="field" data-test>${services.map(s=>`<option value="${s.id}">${esc(s.name)} · ${esc(s.code)}</option>`).join('')}</select>
      <div class="mt-3 p-3 rounded border border-outline-variant" data-test-info></div><div data-parameters class="mt-3"></div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>${canAddLabTest() ? '<button class="btn-secondary" data-add-test>Add test</button>' : ''}<button class="btn-secondary" data-add-heading title="A sub-heading such as Differential Leucocyte Count, printed between parameters">Add heading</button><button class="btn-primary" data-add>Add parameter</button>`,
    async onMount(root) {
      let rows = [], loadVersion = 0;
      async function load() {
        const version=++loadVersion;
        const serviceId = +root.querySelector('[data-test]').value;
        const service = state.meta.services.find(s => s.id === serviceId);
        root.querySelector('[data-add]').disabled = !service; root.querySelector('[data-add-heading]').disabled = !service;
        const info = root.querySelector('[data-test-info]');
        info.innerHTML = service ? `<div class="flex items-center justify-between"><b>Test information · ${esc(service.lab_section || 'Laboratory')}</b><button class="btn-secondary btn-sm" data-edit-info>Edit report instructions</button></div><p class="mt-2 text-body-sm whitespace-pre-wrap" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(service.description || 'No description. Optional information can be added and printed below this test’s results.')}</p>` : 'Add your first laboratory test to begin.';
        if (service) info.insertAdjacentHTML('beforeend', `<p class="mt-2 text-body-sm"><b>${esc(service.report_comment_title || 'Interpretation')}:</b> ${service.report_comment ? esc(service.report_comment.slice(0, 220)) + (service.report_comment.length > 220 ? '…' : '') : '<span class="text-on-surface-variant">none yet — use Edit description</span>'}</p>`);
        info.querySelector('[data-edit-info]')?.addEventListener('click', () => editTestInfo(service, load));
        if (service) {
          const used = await api.get(`/lab/consumables/${serviceId}`).catch(() => []);
          if(version!==loadVersion||!root.isConnected)return;
          const live = used.filter((c) => c.active);
          info.insertAdjacentHTML('beforeend', `<div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-body-sm"><span><b>Consumables:</b> ${live.length ? live.map((c) => `${esc(c.name)} × ${c.qty} (${c.stage === 'collection' ? 'at collection' : 'at processing'})`).join(' · ') : 'none set — nothing is taken from the LAB store for this test'}</span>
            ${canEditLabTemplates() ? '<button class="btn-secondary btn-sm" data-edit-consumables>Set consumables</button>' : ''}</div>`);
          info.querySelector('[data-edit-consumables]')?.addEventListener('click', () => editConsumables(service, live, load));
        }
        const loaded = service ? await api.get(`/lab/params?service_id=${serviceId}`) : [];
        if(version!==loadVersion||!root.isConnected)return;
        rows=loaded;
        // drag a row (or use ↑ ↓) to set the order the parameters print on the report
        const canSort = canEditLabTemplates() && rows.length > 1;
        root.querySelector('[data-parameters]').innerHTML = `${canSort ? '<p class="text-body-sm text-on-surface-variant mb-1">Drag rows by ⇅ (or use ↑ ↓) to set the print order on the report.</p>' : ''}<table class="tbl"><thead><tr><th>Order</th><th>Parameter</th><th>Method / unit</th><th>Reference range</th><th>Status</th><th></th></tr></thead><tbody data-sort-body>${rows.map((p, i)=>`<tr data-row="${p.id}" ${canSort ? 'draggable="true"' : ''}><td class="whitespace-nowrap">${canSort ? `<span class="cursor-grab select-none text-on-surface-variant" title="Drag to reorder" aria-hidden="true">⇅</span> ` : ''}${i + 1}.${canSort ? ` <button type="button" class="btn-ghost btn-xs" data-move="-1" aria-label="Move ${esc(p.name)} up" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn-ghost btn-xs" data-move="1" aria-label="Move ${esc(p.name)} down" ${i < rows.length - 1 ? '' : 'disabled'}>↓</button>` : ''}</td>${p.result_type === 'heading' ? `<td colspan="3"><b class="uppercase">${esc(p.name)}</b> <span class="text-body-sm text-on-surface-variant">· sub-heading</span></td>` : `<td>${esc(p.name)}</td><td>${esc(p.method || '')} · ${esc(p.unit || '')}</td><td>${esc(p.ref_text || `${p.ref_low ?? ''} - ${p.ref_high ?? ''}`)}</td>`}<td>${p.active ? 'Active' : 'Archived'}</td><td><div class="flex gap-2"><button class="btn-secondary btn-xs" data-param="${p.id}">Edit</button>${canEditLabTemplates()?`<button type="button" class="btn-secondary btn-xs" data-param-toggle="${p.id}">${p.active?'Archive':'Reactivate'}</button>`:''}</div></td></tr>`).join('')}</tbody></table>`;
        if (canSort) wireReorder(root.querySelector('[data-sort-body]'), serviceId, load);
      }
      root.querySelector('[data-test]').onchange = load;
      root.querySelector('[data-add-test]')?.addEventListener('click', () => addLabTest(async service => {
        await loadMeta(true);
        root.querySelector('[data-test]').innerHTML = state.meta.services.filter(s => s.category === 'lab').map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.code)}</option>`).join('');
        root.querySelector('[data-test]').value = service.id;
        await load();
      }));
      root.querySelector('[data-add-heading]').onclick = () => editParameter({ service_id: +root.querySelector('[data-test]').value, result_type: 'heading' }, load);
      root.querySelector('[data-add]').onclick = () => editParameter({service_id:+root.querySelector('[data-test]').value}, load);
      root.querySelector('[data-parameters]').onclick = async e => {
        const toggle=e.target.closest('[data-param-toggle]');
        if(toggle){const parameter=rows.find(p=>p.id===Number(toggle.dataset.paramToggle));if(!parameter)return;
          if(!confirm(parameter.active?'Archive '+parameter.name+'? It will be hidden from new result entry. Saved reports are retained.':'Reactivate '+parameter.name+' for result entry?'))return;
          toggle.disabled=true;try{await api.patch('/lab/params/'+parameter.id,{active:!parameter.active,reason:parameter.active?'Archived from lab template':'Reactivated from lab template'});await load();toast(parameter.active?'Parameter archived':'Parameter reactivated','success');}catch(error){apiError(error);}finally{toggle.disabled=false;}return;}
        const id=e.target.closest('[data-param]')?.dataset.param;if(id)editParameter(rows.find(p=>p.id===+id),load);
      };
      try { await load(); } catch { toast('Could not load lab templates','warning'); }
    } });
}
/** Drag and drop (and ↑ ↓ buttons) to reorder a test's parameters; saved straight away. */
function wireReorder(body, serviceId, reload) {
  let dragged = null;
  const save = async () => {
    try { await api.post('/lab/params/reorder', { service_id: +serviceId, ids: [...body.querySelectorAll('[data-row]')].map((tr) => +tr.dataset.row) }); toast('Print order saved', 'success'); }
    catch (err) { apiError(err, 'Could not save the order'); }
    reload();
  };
  body.addEventListener('dragstart', (e) => { dragged = e.target.closest('[data-row]'); dragged?.classList.add('opacity-50'); e.dataTransfer.effectAllowed = 'move'; });
  body.addEventListener('dragend', () => { dragged?.classList.remove('opacity-50'); });
  body.addEventListener('dragover', (e) => {
    const over = e.target.closest('[data-row]');
    if (!dragged || !over || over === dragged) return;
    e.preventDefault();
    const after = e.clientY > over.getBoundingClientRect().top + over.offsetHeight / 2;
    over.parentNode.insertBefore(dragged, after ? over.nextSibling : over);
  });
  body.addEventListener('drop', (e) => { if (!dragged) return; e.preventDefault(); dragged = null; save(); });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-move]'); if (!b) return;
    const tr = b.closest('[data-row]'), to = +b.dataset.move < 0 ? tr.previousElementSibling : tr.nextElementSibling?.nextElementSibling;
    tr.parentNode.insertBefore(tr, to || null);
    save();
  });
}

/** Tubes, needles and reagents one test uses, taken from the LAB store as the work is done. */
async function editConsumables(service, current, after) {
  await loadMeta();
  const items = await api.get('/lab/store').then((d) => d.stock).catch(() => []);
  const lines = current.map((c) => ({ medicine_id: c.medicine_id, qty: c.qty, stage: c.stage }));
  modal({ title: `Consumables — ${service.name}`, size: 'lg', stack: true,
    body: `<p class="text-body-sm text-on-surface-variant">Collection items (tube, needle, container, swab) are used when the sample is taken — also for tests sent to an outside lab.
      Processing items (reagent, kit, slide) are used when results are first entered, only for tests done here. A recollection uses the collection items again.</p>
      <table class="tbl mt-2"><thead><tr><th>Item</th><th class="w-24">Qty / test</th><th class="w-40">When</th><th class="w-10"></th></tr></thead><tbody data-lines></tbody></table>
      <button type="button" class="btn-secondary btn-sm mt-2" data-add-line>Add item</button>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>',
    onMount(root, close) {
      const tbody = root.querySelector('[data-lines]');
      const paint = () => { tbody.innerHTML = lines.map((l, i) => `<tr data-i="${i}"><td><select class="field field-sm" data-k="medicine_id">${items.map((m) => `<option value="${m.id}" ${m.id === l.medicine_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></td>
        <td><input class="field field-sm" type="number" min="0.01" step="0.01" data-k="qty" value="${l.qty}"></td>
        <td><select class="field field-sm" data-k="stage"><option value="collection" ${l.stage === 'collection' ? 'selected' : ''}>At collection</option><option value="processing" ${l.stage === 'processing' ? 'selected' : ''}>At processing</option></select></td>
        <td><button type="button" class="btn-ghost btn-xs" data-rm="${i}" aria-label="Remove">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="text-center py-4 text-on-surface-variant">No item — add one.</td></tr>'; };
      paint();
      root.querySelector('[data-add-line]').onclick = () => { if (!items.length) { toast('No lab items in the medicine master yet', 'warning'); return; } lines.push({ medicine_id: items[0].id, qty: 1, stage: 'collection' }); paint(); };
      tbody.addEventListener('change', (e) => { const tr = e.target.closest('[data-i]'); if (!tr) return; const l = lines[+tr.dataset.i]; const k = e.target.dataset.k; l[k] = k === 'stage' ? e.target.value : +e.target.value; });
      tbody.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { lines.splice(+b.dataset.rm, 1); paint(); } });
      root.querySelector('[data-save]').onclick = async () => {
        try { await api.put(`/lab/consumables/${service.id}`, { lines }); close(); toast('Consumables saved', 'success'); after(); }
        catch (err) { toast(err.payload?.error === 'item_listed_twice' ? 'The same item is listed twice for the same step' : err.payload?.error || 'Could not save', 'warning'); }
      };
    } });
}

// report categories in print order (server/lab-catalog-data.js SECTION_ORDER)
const sectionOptions = ['Haematology', 'Biochemistry', 'Serology & Immunology', 'Clinical Pathology', 'Cytology', 'Microbiology', 'Endocrinology', 'Histopathology', 'Others', 'Miscellaneous'];
function editTestInfo(service, after) {
  modal({ title: `Test information — ${service.name}`, size: 'lg', stack: true,
    body: `<form data-info-form><label class="field-label">Section (optional)</label><input class="field" name="lab_section" maxlength="100" value="${esc(service.lab_section || '')}" list="lab-sections"><datalist id="lab-sections">${sectionOptions.map(s => `<option value="${s}">`).join('')}</datalist>
      <label class="field-label mt-3">Description / test information (optional)</label><textarea class="field" name="description" rows="6" maxlength="5000" placeholder="Information about this test to print below its results">${esc(service.description || '')}</textarea>
      <p class="text-body-sm mt-2">This text prints only on this test’s report. Leave it blank to omit it. Reports already saved retain their recorded description.</p>
      <div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 mt-4 pt-3 border-t border-outline-variant">
        <div><label class="field-label">Heading on the report</label><input class="field" name="report_comment_title" maxlength="80" list="lab-comment-titles" value="${esc(service.report_comment_title || 'Interpretation')}">
          <datalist id="lab-comment-titles">${['Result instructions', 'Interpretation', 'Comments', 'Test information', 'Note', 'Clinical significance'].map((t) => `<option value="${t}">`).join('')}</datalist></div>
        <div><label class="field-label">Result instructions / interpretation (prints under the results)</label><textarea class="field" name="report_comment" rows="9" maxlength="10000" placeholder="Paste or type the interpretation, reference tables (e.g. pregnancy trimesters, cycle phases) and notes for this test.">${esc(service.report_comment || '')}</textarea></div>
      </div>
      <p class="text-body-sm mt-2">Every report of this test prints the heading and text. A report keeps the wording that was current when it was resulted.</p></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-info>Save description</button>',
    onMount(root, close) {
      root.querySelector('[data-save-info]').onclick = async e => {
        const button = e.currentTarget; button.disabled = true;
        try {
          await api.patch(`/lab/tests/${service.id}`, Object.fromEntries(new FormData(root.querySelector('[data-info-form]'))));
          await loadMeta(true); close(); await after(); toast('Test description saved', 'success');
        } catch (error) { button.disabled = false; toast(error.payload?.error || 'Could not save description', 'warning'); }
      };
    },
  });
}
async function addLabTest(after) {
  await loadLabUnits();
  const departments = (state.meta?.departments || []).filter(d => d.code === 'LAB');
  modal({ title: 'Create laboratory test', size: 'xl', stack: true,
    body: `<form data-test-form class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="md:col-span-2"><label class="field-label">Test name *</label><input class="field" name="name" required></div>
      <div><label class="field-label">Unique test code *</label><input class="field" name="code" required placeholder="e.g. LAB-TSH"></div>
      <div><label class="field-label">Price (₹) *</label><input class="field" name="price" type="number" min="0" step="0.01" required></div>
      <div><label class="field-label">Section</label><select class="field" name="lab_section">${sectionOptions.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
      <div><label class="field-label">Laboratory department *</label><select class="field" name="department_id" required>${departments.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div><label class="field-label">Sample / specimen type *</label><input class="field" name="sample_type" required value="Serum" list="lab-specimens"><datalist id="lab-specimens">${['Serum','Blood','EDTA Whole Blood','Plasma','Urine','Stool','Sputum','Swab','Pus','CSF'].map(s => `<option value="${s}">`).join('')}</datalist></div>
      <div><label class="field-label">Turnaround time (minutes) *</label><input class="field" name="tat_minutes" type="number" min="0" step="1" value="60" required></div>
      <div><label class="field-label">GST (%)</label><input class="field" name="gst_pct" type="number" min="0" max="100" step="0.01" value="0"></div>
      <div><label class="field-label">Report comment heading</label><input class="field" name="report_comment_title" maxlength="80" value="Interpretation"></div>
      <div class="md:col-span-2"><label class="field-label">Result instructions / interpretation (optional)</label><textarea class="field" name="report_comment" rows="3" maxlength="10000" placeholder="Prints under the results on every report of this test"></textarea></div>
      <div class="md:col-span-3"><label class="field-label">Description / test information (optional)</label><textarea class="field" name="description" rows="3" maxlength="5000" placeholder="Type test-related information here. It prints below this test’s results."></textarea></div>
      <div class="md:col-span-3 border-t border-outline-variant pt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div><div class="font-semibold text-body-md">Result parameters</div>
            <p class="text-body-sm text-on-surface-variant">One row for a single test; one row per parameter for a profile (CBC, LFT, lipid profile…). A blank name on a single row uses the test name.</p></div>
          <div class="flex gap-2"><button type="button" class="btn-secondary btn-sm" data-paste-toggle><span class="material-symbols-outlined text-[16px]">content_paste</span> Paste a list</button>
            <button type="button" class="btn-secondary btn-sm" data-add-param><span class="material-symbols-outlined text-[16px]">add</span> Add parameter</button></div>
        </div>
        <div data-paste-box class="hidden mt-2">
          <textarea class="field font-data-mono text-body-sm" rows="5" data-paste aria-label="Paste parameters, one per line" placeholder="One parameter per line — name, unit, normal range (tab, comma or | between them):&#10;Haemoglobin | g/dL | 13 - 17&#10;Total WBC count | cells/cumm | 4000 - 11000&#10;HBsAg | | Non-reactive"></textarea>
          <div class="flex justify-end gap-2 mt-2"><button type="button" class="btn-primary btn-sm" data-paste-apply>Add these rows</button></div>
        </div>
        <div class="overflow-x-auto mt-2"><table class="tbl min-w-[900px]">
          <thead><tr><th class="w-8">#</th><th>Parameter name</th><th class="w-[120px]">Type</th><th class="w-[110px]">Unit</th><th class="w-[90px]">Normal low</th><th class="w-[90px]">Normal high</th><th>Reference text</th><th class="w-[90px]">Critical low</th><th class="w-[90px]">Critical high</th><th class="w-10"></th></tr></thead>
          <tbody data-params></tbody></table></div>
        <p class="text-body-sm text-on-surface-variant mt-1">Sex- and age-specific ranges, methods and per-parameter notes can be added on each parameter after saving.</p>
      </div>
    </form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save-test>Save test</button>',
    onMount(root, close) {
      const tbody = root.querySelector('[data-params]');
      wireLabUnits(root);
      const cell = (k, v = '', type = 'text') => `<td><input class="field field-sm" data-k="${k}" ${type === 'number' ? 'type="number" step="any"' : ''} value="${esc(v)}"></td>`;
      const renumber = () => tbody.querySelectorAll('tr').forEach((tr, i) => { tr.firstElementChild.textContent = i + 1; });
      const addRow = (r = {}) => {
        tbody.insertAdjacentHTML('beforeend', `<tr>
          <td class="text-on-surface-variant"></td>${cell('name', r.name)}
          <td><select class="field field-sm" data-k="result_type"><option value="numeric">Number</option><option value="text" ${r.result_type === 'text' ? 'selected' : ''}>Text</option></select></td>
          <td>${labUnitField(r.unit)}</td>${cell('ref_low', r.ref_low, 'number')}${cell('ref_high', r.ref_high, 'number')}${cell('ref_text', r.ref_text)}${cell('crit_low', '', 'number')}${cell('crit_high', '', 'number')}
          <td><button type="button" class="btn-ghost btn-xs" data-remove-param title="Remove this row" aria-label="Remove this row"><span class="material-symbols-outlined text-[18px]">close</span></button></td></tr>`);
        renumber();
      };
      addRow();
      root.querySelector('[data-add-param]').onclick = () => { addRow(); tbody.lastElementChild.querySelector('[data-k="name"]').focus(); };
      tbody.addEventListener('click', (e) => { if (e.target.closest('[data-remove-param]')) { e.target.closest('tr').remove(); renumber(); } });
      root.querySelector('[data-paste-toggle]').onclick = () => root.querySelector('[data-paste-box]').classList.toggle('hidden');
      root.querySelector('[data-paste-apply]').onclick = () => {
        const lines = root.querySelector('[data-paste]').value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return;
        // drop the empty starter row before adding pasted ones
        tbody.querySelectorAll('tr').forEach((tr) => { if (![...tr.querySelectorAll('input')].some((i) => i.value.trim())) tr.remove(); });
        for (const line of lines) {
          const [name, unit = '', rawRange = ''] = line.split(/\t|\||,(?=\s*[^\d])/).map((x) => x.trim());
          const range = rawRange.replace(/(\d),(\d)/g, '$1$2');
          const m = range.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)$/i);
          const lt = range.match(/^(?:<|upto|up to)\s*(-?\d+(?:\.\d+)?)$/i), gt = range.match(/^(?:>)\s*(-?\d+(?:\.\d+)?)$/i);
          addRow(m ? { name, unit, ref_low: m[1], ref_high: m[2] } : lt ? { name, unit, ref_high: lt[1] } : gt ? { name, unit, ref_low: gt[1] }
            : { name, unit, ref_text: range, result_type: range && !unit ? 'text' : 'numeric' });
        }
        root.querySelector('[data-paste]').value = '';
        root.querySelector('[data-paste-box]').classList.add('hidden');
        toast(`${lines.length} parameter row(s) added — check them before saving`, 'info');
      };
      root.querySelector('[data-save-test]').onclick = async e => {
        const form = root.querySelector('[data-test-form]');
        if (!form.reportValidity()) return;
        const button = e.currentTarget;
        button.disabled = true;
        try {
          const body = Object.fromEntries(new FormData(form));
          body.name = body.name.trim(); body.code = body.code.trim(); body.sample_type = body.sample_type.trim();
          const rows = [...tbody.querySelectorAll('tr')].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value.trim()])))
            .filter((r) => r.name || r.unit || r.ref_low || r.ref_high || r.ref_text);
          if (rows.length === 1 && !rows[0].name) rows[0].name = body.name;
          if (rows.some((r) => !r.name)) { toast('Every parameter row needs a name', 'warning'); button.disabled = false; return; }
          if (rows.length) body.parameters = rows;
          const service = await api.post('/services', { ...body, category: 'lab', billing_unit: 'once' });
          close(); await after(service); toast(body.parameters?.length > 1 ? `Lab test saved with ${body.parameters.length} parameters` : 'Lab test saved', 'success');
        } catch (error) {
          const why = { service_code_exists: 'That test code is already used — choose another', parameter_duplicate: 'Two parameters have the same name',
            range_invalid: 'A normal range is not valid (low must not be above high)', parameter_invalid: 'A parameter row is incomplete',
            too_many_parameters: 'At most 80 parameters per test', lab_incharge_required: 'Only the lab in-charge can create result fields' }[error.payload?.error];
          toast(why || error.payload?.error || 'Could not add lab test', 'warning'); button.disabled = false;
        }
      };
    },
  });
}
async function editParameter(p, after) {
  await loadLabUnits();
  const rules = JSON.parse(p.reference_rules || '[]');
  const textFields = [['name','Parameter name'],['unit','Unit'],['method','Test method'],['ref_text','General reference text'],['interpretation','Interpretation / report note']];
  const numericFields = [['seq','Display order'],['ref_low','General low'],['ref_high','General high'],['ref_low_m','Male low'],['ref_high_m','Male high'],['ref_low_f','Female low'],['ref_high_f','Female high'],['ref_low_child','Child low'],['ref_high_child','Child high'],['child_max_age','Child age limit'],['crit_low','Critical low'],['crit_high','Critical high']];
  if (p.result_type === 'heading') {
    modal({ title: p.id ? 'Edit sub-heading' : 'Add sub-heading', size: 'sm', stack: true,
      body: `<form data-form class="space-y-3"><div><label class="field-label">Heading text</label><input class="field" name="name" value="${esc(p.name || '')}" required maxlength="120" placeholder="e.g. Differential Leucocyte Count"></div>
        <label class="flex items-center gap-2"><input type="checkbox" name="active" ${p.active !== 0 ? 'checked' : ''}>Active</label>
        <p class="text-body-sm text-on-surface-variant">A heading has no result. It prints between parameters in the order set here; use ↑ ↓ or drag to place it.</p></form>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save heading</button>',
      onMount(root, close) {
        root.querySelector('[data-save]').onclick = async () => {
          const form = root.querySelector('form'); if (!form.reportValidity()) return;
          const body = { name: form.name.value.trim(), result_type: 'heading', active: form.active.checked };
          try { p.id ? await api.patch(`/lab/params/${p.id}`, body) : await api.post('/lab/params', { ...body, service_id: p.service_id }); close(); await after(); toast('Heading saved', 'success'); }
          catch (e) { toast(e.payload?.error || 'Could not save heading', 'warning'); }
        };
      } });
    return;
  }
  modal({title:p.id?'Edit lab parameter':'Add lab parameter',size:'lg',stack:true,
    body:`<form class="grid grid-cols-2 gap-3" data-form><div><label class="field-label">Result type</label><select class="field" name="result_type"><option value="numeric" ${p.result_type !== 'text' ? 'selected' : ''}>Number</option><option value="text" ${p.result_type === 'text' ? 'selected' : ''}>Text / qualitative</option></select></div>${[...textFields,...numericFields].map(([k,label])=>`<div><label class="field-label">${label}</label>${k==='unit'?labUnitField(p.unit,'name="unit"'):`<input class="field" name="${k}" value="${esc(p[k] ?? '')}" ${numericFields.some(([n])=>n===k)?'type="number" step="any"':''} ${k==='name'?'required':''}>`}</div>`).join('')}
      <div class="col-span-2"><label class="field-label">Age / sex / pregnancy ranges</label><div data-rules></div><button type="button" class="btn-secondary btn-sm mt-2" data-add-range>Add reference range</button><p class="text-body-sm">The first matching range applies. Enter only ranges validated by the lab in-charge. Age starts at the minimum and ends before the maximum.</p></div>
      <label class="flex items-center gap-2"><input type="checkbox" name="active" ${p.active!==0?'checked':''}>Active</label></form>`,
    footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save validated template</button>',
    onMount(root, close) {
      wireLabUnits(root);
      const paint=()=>{root.querySelector('[data-rules]').innerHTML=rules.map((r,i)=>`<fieldset class="grid grid-cols-2 gap-2 border border-outline-variant rounded p-2 mt-2" data-range="${i}"><legend>Range ${i+1}</legend>${[['label','Label','text'],['min_age','Minimum age','number'],['max_age','Maximum age','number'],['low','Low value','number'],['high','High value','number'],['text','Reference text','text']].map(([k,l,t])=>`<div><label class="field-label">${l}</label><input class="field field-sm" data-rkey="${k}" type="${t}" ${t==='number'?'step="any"':''} value="${esc(r[k]??'')}"></div>`).join('')}<div><label class="field-label">Sex</label><select class="field field-sm" data-rkey="sex">${['','Male','Female','Other'].map(s=>`<option value="${s}" ${s===(r.sex||'')?'selected':''}>${s||'Any'}</option>`).join('')}</select></div><div><label class="field-label">Pregnancy</label><select class="field field-sm" data-rkey="pregnant"><option value="" ${r.pregnant===undefined?'selected':''}>Any</option><option value="true" ${r.pregnant===true?'selected':''}>Pregnant</option><option value="false" ${r.pregnant===false?'selected':''}>Not pregnant</option></select></div><button type="button" class="btn-ghost btn-xs" data-remove-range="${i}">Remove range</button></fieldset>`).join('');};
      root.querySelector('[data-add-range]').onclick=()=>{rules.push({});paint();};
      root.querySelector('[data-rules]').addEventListener('change',e=>{const k=e.target.dataset.rkey;if(!k)return;const r=rules[+e.target.closest('[data-range]').dataset.range];if(e.target.value===''){delete r[k];return;}r[k]=k==='pregnant'?e.target.value==='true':e.target.type==='number'?Number(e.target.value):e.target.value;});
      root.querySelector('[data-rules]').addEventListener('click',e=>{const button=e.target.closest('[data-remove-range]');if(button){rules.splice(+button.dataset.removeRange,1);paint();}});paint();
      root.querySelector('[data-save]').onclick = async () => {
      const form=root.querySelector('form'); if(!form.reportValidity()) return;
      const body={...Object.fromEntries(new FormData(form)),active:form.active.checked,reference_rules:rules};
      try { p.id?await api.patch(`/lab/params/${p.id}`,body):await api.post('/lab/params',{...body,service_id:p.service_id}); close();await after();toast('Lab template saved','success'); }
      catch(e){toast(e.payload?.error||'Could not save template','warning');}
    }; } });
}
