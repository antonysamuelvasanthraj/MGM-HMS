import { api } from './api.js';
import { esc, modal, toast } from './ui.js';

export const referralHTML = (p = {}) => `<fieldset class="md:col-span-3 rounded-lg border border-outline-variant p-3 space-y-2" data-referrals>
  <legend class="field-label">Outside referral (separate from the treating doctor)</legend>
  ${[['doctor','Referring doctor'],['hospital','Referring hospital']].map(([kind,label]) => `<label class="flex items-center gap-2"><input type="checkbox" data-ref-toggle="${kind}" ${p['referral_'+kind+'_id'] ? 'checked' : ''}>${label}</label>
    <div data-ref-section="${kind}" ${p['referral_'+kind+'_id'] ? '' : 'hidden'} class="flex gap-2"><select class="field" name="referral_${kind}_id" data-selected="${p['referral_'+kind+'_id'] || ''}"><option value="">Select…</option></select><button type="button" class="btn-secondary btn-sm" data-ref-add="${kind}">Add</button></div>`).join('')}
  <label class="field-label">Referral reason</label><input class="field" name="referral_reason" value="${esc(p.referral_reason || '')}">
  <label class="field-label">Remarks</label><input class="field" name="referral_remarks" value="${esc(p.referral_remarks || '')}">
  <label class="flex items-center gap-2"><input type="checkbox" name="pregnant" value="1" ${p.pregnant ? 'checked' : ''}>Pregnant (used for configured lab ranges)</label>
</fieldset>`;
export async function wireReferrals(root) {
  const host = root.querySelector('[data-referrals]');
  if (!host) return;
  async function load() {
    const rows = await api.get('/referral-sources?active=1');
    for (const kind of ['doctor','hospital']) {
      const select = host.querySelector(`[name="referral_${kind}_id"]`), current = select.value || select.dataset.selected;
      select.innerHTML = '<option value="">Select…</option>' + rows.filter(r => r.kind === kind).map(r => `<option value="${r.id}" ${String(r.id) === current ? 'selected' : ''}>${esc(r.name)}${r.hospital ? ' · '+esc(r.hospital) : ''}</option>`).join('');
      select.required = host.querySelector(`[data-ref-toggle="${kind}"]`).checked;
    }
  }
  host.addEventListener('change', e => {
    const kind = e.target.dataset.refToggle;
    if (!kind) return;
    host.querySelector(`[data-ref-section="${kind}"]`).hidden = !e.target.checked;
    const select = host.querySelector(`[name="referral_${kind}_id"]`);
    select.required = e.target.checked;
    if (!e.target.checked) { select.value = ''; select.dataset.selected = ''; }
  });
  host.addEventListener('click', e => {
    const kind = e.target.closest('[data-ref-add]')?.dataset.refAdd;
    if (!kind) return;
    modal({ title: `Add referring ${kind}`, stack: true, body: `<form data-ref-form class="space-y-2">${['name','hospital','speciality','mobile','remarks'].map(k => `<div><label class="field-label">${k}</label><input class="field" name="${k}" ${k === 'name' ? 'required' : ''}></div>`).join('')}</form>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save</button>', onMount(dialog, close) {
        dialog.querySelector('[data-save]').onclick = async () => {
          const form = dialog.querySelector('form'); if (!form.reportValidity()) return;
          try { const row = await api.post('/referral-sources', {kind,...Object.fromEntries(new FormData(form))});
            const select = host.querySelector(`[name="referral_${kind}_id"]`); select.dataset.selected = String(row.id); select.value = ''; await load(); close();
          } catch { toast('Could not save referral source', 'warning'); }
        };
      } });
  });
  try { await load(); } catch { toast('Could not load referral sources', 'warning'); }
}

export async function openReferralMasters() {
  const rows=await api.get('/referral-sources');
  modal({title:'Referring doctors and outside hospitals',size:'lg',body:`<table class="tbl"><thead><tr><th>Source</th><th>Hospital / speciality</th><th>Mobile</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}<div>${esc(r.kind)}</div></td><td>${esc([r.hospital,r.speciality].filter(Boolean).join(' · '))}</td><td>${esc(r.mobile||'')}</td><td>${r.active?'Active':'Inactive'}</td><td><button class="btn-secondary btn-xs" data-edit-source="${r.id}">Edit</button></td></tr>`).join('')}</tbody></table>`,footer:'<button class="btn-secondary" data-close>Close</button><button class="btn-secondary" data-source-kind="doctor">Add doctor</button><button class="btn-secondary" data-source-kind="hospital">Add hospital</button>',onMount(root,close){root.addEventListener('click',e=>{
    const id=e.target.closest('[data-edit-source]')?.dataset.editSource,kind=e.target.closest('[data-source-kind]')?.dataset.sourceKind;
    if(!id&&!kind)return;
    const r=rows.find(row=>row.id===+id)||{kind,active:1};
    modal({title:`${r.id?'Edit':'Add'} referring ${r.kind}`,stack:true,body:`<form class="space-y-2">${['name','hospital','speciality','mobile','remarks'].map(k=>`<div><label class="field-label">${k}</label><input class="field" name="${k}" value="${esc(r[k]||'')}" ${k==='name'?'required':''}></div>`).join('')}<label class="flex gap-2"><input type="checkbox" name="active" ${r.active?'checked':''}>Active</label></form>`,footer:'<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Save source</button>',onMount(dialog,done){dialog.querySelector('[data-save]').onclick=async()=>{const form=dialog.querySelector('form');if(!form.reportValidity())return;const body={...Object.fromEntries(new FormData(form)),active:form.active.checked,kind:r.kind};try{r.id?await api.patch(`/referral-sources/${r.id}`,body):await api.post('/referral-sources',body);done();close();await openReferralMasters();}catch{toast('Could not save referral source','warning');}};}});
  });}});
}
