/**
 * Manual workflow — reception bills lab / imaging tests from a paper prescription or an
 * outside doctor's slip (Settings → Department workflow → Laboratory: billed at reception).
 * The tests go to the lab / imaging worklist exactly like a doctor's order; reception then
 * collects the bill in the usual payment window.
 */
import { api } from './api.js';
import { modal, esc, money, toast } from './ui.js';
import { busy, apiError, patientPicker, withDuplicateCheck } from './views/_kit.js';
import { state, can, setting, loadMeta } from './store.js';
import { collectBill } from './collect.js';

const paperLab = () => ['reception', 'both'].includes(setting('workflow_lab', 'doctor'));
export const receptionBillsTests = () => paperLab() && (can('billing.create') || can('op.register'));
/** Lab / radiology staff may record a paper request brought to the department (Settings → operating mode). */
export const departmentEntersTests = () => paperLab() && setting('dept_entry_enabled', '1') !== '0' && (can('lab.collect') || can('imaging.schedule'));

const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
/** Attach the scanned paper prescription to the visit (kept with the patient record). */
async function attachScan(input, encounterId) {
  const files = [...(input?.files || [])];
  if (!files.length || !encounterId) return;
  try {
    await api.post(`/attachments/encounter/${encounterId}`, { note: 'Paper prescription / request', files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await readFile(f) }))) });
  } catch (err) { apiError(err, 'Tests saved, but the scan was not attached'); }
}

/** opts: { patient, encounterId } — either may be omitted (walk-in). after(result) runs once billed. */
export async function openDiagnosticsBilling(after, { patient = null, encounterId = null, doctorId = null, department = null } = {}) {
  await loadMeta();
  // department entry: only the tests this person's department performs
  const deptCats = department ? [can('lab.collect') && 'lab', can('imaging.schedule') && 'imaging'].filter(Boolean) : ['lab', 'imaging'];
  const tests = (state.meta?.services || []).filter((s) => deptCats.includes(s.category) && s.active !== 0);
  const doctors = (state.meta?.doctors || []).filter((d) => d.role === 'doctor');
  let picked = patient;
  const chosen = new Map();
  // lab packages (several tests at one price) — applied to the bill as a self-pay package
  const usePackages = !department && (can('payment.authorize') || can('billing.discount'));
  let packages = [], pkg = null;
  const fromPkg = new Set();
  if (usePackages) api.get('/packages').then((list) => { packages = list.filter((x) => x.category === 'Lab package' && x.active && !x.payer_id && x.price > 0); }).catch(() => {});   // unpriced packages wait for Fees & Tariffs
  modal({
    title: department ? 'Record a paper request' : 'Bill lab / scan tests', size: 'lg',
    subtitle: department ? `The patient brought the request straight here. Reception gets the bill and collects; ${setting('release_op_rule', 'payment') === 'immediate' ? 'the test can start now.' : 'routine OP tests start once it is paid or approved.'}`
      : 'From the doctor\'s paper prescription or an outside doctor\'s slip. The tests go straight to the lab / imaging worklist.',
    body: `<div class="space-y-3">
      <div><label class="field-label">Patient *</label><div data-dx-patient>${picked ? `<div class="rounded border border-outline-variant px-3 py-2"><b>${esc(picked.name)}</b> · <span class="font-data-mono">${esc(picked.uhid)}</span></div>` : ''}</div></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="field-label">Prescribed by (hospital doctor)</label><select class="field" data-dx-doctor><option value="">— outside doctor / self —</option>
          ${doctors.map((d) => `<option value="${d.id}" ${String(d.id) === String(doctorId || '') ? 'selected' : ''}>${esc(d.name)}${d.dept_name ? ` — ${esc(d.dept_name)}` : ''}</option>`).join('')}</select></div>
        <div><label class="field-label">Or outside doctor / referral</label><input class="field" data-dx-ref placeholder="e.g. Dr. K. Rao, City Clinic"></div>
      </div>
      <div><label class="field-label">Find test *</label><input class="field" data-dx-q placeholder="Type test or scan name / code" autocomplete="off">
        <div class="mt-1 max-h-48 overflow-y-auto rounded border border-outline-variant hidden" data-dx-list></div></div>
      <div data-dx-chosen class="space-y-1"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="field-label">Priority</label><select class="field" data-dx-pri><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select></div>
        <div><label class="field-label">Clinical note (optional)</label><input class="field" data-dx-note placeholder="e.g. fever 3 days"></div>
      </div>
      <div><label class="field-label">Scan / photo of the prescription (optional)</label><input class="field" type="file" accept="image/*,application/pdf" multiple data-dx-scan>
        <p class="text-body-sm text-on-surface-variant mt-1">Kept with the visit, so the original paper can be checked later.</p></div>
      <div class="flex justify-between rounded-lg bg-surface-container-low px-3 py-2 font-label-lg"><span>Total</span><span class="font-data-mono" data-dx-total>₹0</span></div>
    </div>`,
    footer: `<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-dx-save>${department ? 'Send tests &amp; bill to reception' : 'Create bill &amp; collect'}</button>`,
    onMount(root, close) {
      const q = (s) => root.querySelector(s);
      if (!picked) patientPicker(q('[data-dx-patient]'), (p) => { picked = p; }, { autofocus: true });
      const paint = () => {
        q('[data-dx-chosen]').innerHTML = (pkg ? `<div class="flex items-center justify-between rounded border border-primary/40 bg-primary/5 px-3 py-1.5">
          <span><b>${esc(pkg.name)}</b> <span class="text-body-sm text-on-surface-variant">Package · ${fromPkg.size} tests at the package price</span></span>
          <span class="flex items-center gap-2"><span class="font-data-mono">${money(pkg.price)}</span><button type="button" class="btn-ghost btn-xs" data-dx-delpkg aria-label="Remove the package">✕</button></span></div>` : '')
          + [...chosen.values()].map((s) => `<div class="flex items-center justify-between rounded border border-outline-variant px-3 py-1.5${fromPkg.has(s.id) ? ' ml-4 opacity-80' : ''}">
          <span>${esc(s.name)} <span class="text-body-sm text-on-surface-variant">${s.category === 'imaging' ? 'Imaging' : 'Lab'} · ${esc(s.code)}</span></span>
          <span class="flex items-center gap-2">${fromPkg.has(s.id) ? '<span class="text-body-sm text-on-surface-variant">in package</span>' : `<span class="font-data-mono">${money(s.price)}</span><button type="button" class="btn-ghost btn-xs" data-dx-del="${s.id}" aria-label="Remove ${esc(s.name)}">✕</button>`}</span></div>`).join('')
          || '<p class="text-body-sm text-on-surface-variant">No tests added yet.</p>';
        q('[data-dx-total]').textContent = money((pkg ? +pkg.price : 0) + [...chosen.values()].filter((s) => !fromPkg.has(s.id)).reduce((t, s) => t + (+s.price || 0), 0));
      };
      paint();
      const list = q('[data-dx-list]');
      q('[data-dx-q]').addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        const hits = term.length < 2 ? [] : tests.filter((s) => `${s.name} ${s.code}`.toLowerCase().includes(term) && !chosen.has(s.id)).slice(0, 12);
        const pkgHits = term.length < 2 || pkg ? [] : packages.filter((x) => `${x.name} ${x.code} package`.toLowerCase().includes(term)).slice(0, 5);
        list.classList.toggle('hidden', !hits.length && !pkgHits.length);
        list.innerHTML = pkgHits.map((x) => `<button type="button" class="w-full text-left px-3 py-1.5 hover:bg-surface-container flex justify-between" data-dx-pkg="${x.id}"><span><b>${esc(x.name)}</b> <span class="text-body-sm text-on-surface-variant">Package · ${x.item_count} tests</span></span><span class="font-data-mono">${money(x.price)}</span></button>`).join('') + hits.map((s) => `<button type="button" class="w-full text-left px-3 py-1.5 hover:bg-surface-container flex justify-between" data-dx-add="${s.id}"><span>${esc(s.name)} <span class="text-body-sm text-on-surface-variant">${esc(s.code)}</span></span><span class="font-data-mono">${money(s.price)}</span></button>`).join('');
      });
      list.addEventListener('click', async (e) => {
        const pb = e.target.closest('[data-dx-pkg]');
        if (pb) {
          try {
            const full = await api.get(`/packages/${pb.dataset.dxPkg}`);
            pkg = full;
            for (const it of full.items) { const s = tests.find((x) => x.id === it.service_id); if (s) { chosen.set(s.id, s); fromPkg.add(s.id); } }
          } catch (err) { apiError(err, 'Could not open the package'); }
          q('[data-dx-q]').value = ''; list.classList.add('hidden'); paint(); q('[data-dx-q]').focus();
          return;
        }
        const b = e.target.closest('[data-dx-add]'); if (!b) return;
        const s = tests.find((x) => x.id === +b.dataset.dxAdd); if (s) chosen.set(s.id, s);
        q('[data-dx-q]').value = ''; list.classList.add('hidden'); paint(); q('[data-dx-q]').focus();
      });
      q('[data-dx-chosen]').addEventListener('click', (e) => {
        if (e.target.closest('[data-dx-delpkg]')) { for (const id of fromPkg) chosen.delete(id); fromPkg.clear(); pkg = null; paint(); return; }
        const b = e.target.closest('[data-dx-del]'); if (b) { chosen.delete(+b.dataset.dxDel); paint(); }
      });
      q('[data-dx-save]').onclick = async (ev) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        if (!chosen.size) { toast('Add at least one test', 'warning'); return; }
        const body = { patient_id: picked.id, encounter_id: encounterId || undefined, doctor_id: +q('[data-dx-doctor]').value || undefined,
          referred_by: q('[data-dx-ref]').value.trim() || undefined, clinical_note: q('[data-dx-note]').value.trim() || undefined,
          items: [...chosen.keys()].map((id) => ({ service_id: id, priority: q('[data-dx-pri]').value })) };
        if (!body.doctor_id && !body.referred_by) { toast('Choose the prescribing doctor or type the outside doctor', 'warning'); return; }
        busy(ev.currentTarget, true, 'Billing');
        try {
          const r = await withDuplicateCheck((extra) => api.post(department ? '/department/diagnostics' : '/reception/diagnostics', { ...body, ...extra }));
          if (!r) { busy(ev.currentTarget, false); return; }
          await attachScan(q('[data-dx-scan]'), r.encounter?.id);
          // the package price replaces the list prices of the tests it covers
          if (pkg && r.bill) {
            try { const applied = await api.post(`/bills/${r.bill.id}/package`, { package_id: pkg.id, notes: 'Lab package chosen at billing' }); r.bill = applied.bill || r.bill; }
            catch (err) { apiError(err, 'Tests billed at list price — the package could not be applied'); }
          }
          close();
          if (department) { toast(`${r.orders.length} test(s) on the worklist${r.bill ? ` · bill ${r.bill.bill_no} sent to reception` : ''}`, 'success'); after?.(r); return; }
          toast(`${r.orders.length} test(s) sent to the worklist${r.created_visit ? ` · diagnostics visit ${r.encounter.encounter_no}` : ''}`, 'success', { title: r.bill ? `Bill ${r.bill.bill_no} · ${money(r.bill.total)}` : 'Tests ordered' });
          if (r.bill?.balance > 0 && setting('release_op_rule', 'payment') !== 'immediate') collectBill(r.bill.id, () => after?.(r));
          else { if (r.bill?.balance > 0) toast(`Tests are with the lab — ${money(r.bill.balance)} to collect on ${r.bill.bill_no} when the patient pays`, 'info'); after?.(r); }
        } catch (err) { apiError(err, 'Tests not billed'); busy(ev.currentTarget, false); }
      };
    },
  });
}
