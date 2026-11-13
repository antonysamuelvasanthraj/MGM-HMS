/**
 * Change payer — one dialog for an OP visit and an admission.
 *
 * Self-pay ⇄ patient credit ⇄ insurance / Aarogyasri / corporate / trust. The server
 * (payer-convert.js) guards money that has already moved; this dialog shows the
 * desk what that is before they save:
 *   - money received from the patient → keep it as the patient's share, or refund it;
 *   - payer entries not yet paid → reversed (confirm);
 *   - payer money already received / approved waivers → blocked, review on the payer desk.
 */
import { api } from './api.js';
import { modal, esc, money, toast } from './ui.js';
import { busy, apiError } from './views/_kit.js';
import { can, setting } from './store.js';
import { MODES } from './collect.js';

const CATS = [['self', 'Cash / self-pay'], ['credit', 'Patient credit — pay later'], ['insurance', 'Insurance / TPA'],
  ['aarogyasri', 'Aarogyasri'], ['corporate', 'Company / corporate credit'], ['trust', 'Trust sponsorship']];
const PAYER = ['insurance', 'aarogyasri', 'corporate', 'trust'];
const label = (c) => CATS.find(([v]) => v === c)?.[1] || c;

export const canChangePayer = (ip = false) => can('billing.payer_change') || can('insurance.write') || (ip && can('ipd.manage'));
export const canApprovePayer = () => can('insurance.write') || can('admin.write') || can('billing.payer_approve');
/** Setting on (default): a desk that cannot approve sends the change as a request to the Insurance desk. */
export const payerNeedsApproval = () => setting('payer_change_requires_approval', '1') !== '0' && !canApprovePayer()
  && !(can('billing.payer_change') && can('op.collect'));

/** Open the dialog for a visit (encounter id). `after(result)` runs once saved. */
export async function openPayerChange(encounterId, after, { category: preset = null, stack = false } = {}) {
  let chk, payers, pending;
  try { [chk, payers, pending] = await Promise.all([api.get(`/encounters/${encounterId}/payer-check`), api.get('/payers').catch(() => []),
    api.get(`/payer-requests?status=pending&encounter_id=${encounterId}`).then((d) => d.rows[0]).catch(() => null)]); }
  catch (err) { apiError(err, 'Could not open payer change'); return; }
  if (pending) { pendingNotice(pending, after,stack); return; }
  const viaRequest = payerNeedsApproval();
  payers = (payers.rows || payers).filter((p) => p.active !== 0);
  const ip = !!chk.admission_id;
  const cur = chk.current.category;
  const receivedHTML = chk.receipts.length ? `<ul class="mt-1 text-body-sm">${chk.receipts.map((r) => `<li class="flex justify-between"><span class="font-data-mono">${esc(r.receipt_no)} · ${esc(r.bill_no)}</span><span>${esc(MODES[r.mode]?.label || r.mode)} ${money(r.amount, 2)}</span></li>`).join('')}</ul>` : '';
  modal({
    stack,
    title: ip ? `Change payer — admission ${esc(chk.ip_no || '')}` : `Change payer — visit ${esc(chk.encounter_no)}`,
    subtitle: `Now: ${esc(label(cur))}${chk.current.payer_name ? ` · ${esc(chk.current.payer_name)}` : ''}. Open bills of this ${ip ? 'admission' : 'visit'} move to the new payer; the visit stage does not change.`,
    body: `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="field-label">New billing category *</label><select class="field" data-cat>${CATS.filter(([v])=>v!=='aarogyasri'||chk.admission_id).map(([v, l]) => `<option value="${v}" ${(preset || cur) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-label">Payer *</label><select class="field" data-payer></select></div>
        <div><label class="field-label">Policy / card / employee / scheme no.</label><input class="field" data-policy value="${esc(chk.current.policy_no || '')}"></div>
        <div><label class="field-label">Reason *</label><input class="field" data-reason placeholder="e.g. Aarogyasri card produced at the desk"></div>
      </div>
      ${chk.blocking.length ? `<div class="mt-3 rounded-lg bg-danger-bg text-danger p-3 text-body-md" role="alert"><strong>Cannot change yet.</strong> These entries need review on Insurance &amp; Payer Cases first:
        <ul class="mt-1 text-body-sm">${chk.blocking.map((s) => `<li>${esc(s.bill_no)} · ${esc(MODES[s.mode]?.label || s.mode)} ${money(s.amount, 2)} — ${esc(s.why)}</li>`).join('')}</ul></div>` : ''}
      ${chk.reversible.length ? `<label class="mt-3 flex items-start gap-2 rounded-lg border border-warning p-3 text-body-md"><input type="checkbox" data-reverse class="mt-0.5">
        <span><strong>Reverse ${chk.reversible.length} unpaid payer entr${chk.reversible.length > 1 ? 'ies' : 'y'}</strong> of the current arrangement, so the amount is open for the new payer:
        <span class="block text-body-sm">${chk.reversible.map((s) => `${esc(s.bill_no)} · ${esc(s.payer_name || MODES[s.mode]?.label || s.mode)} ${money(s.amount, 2)}`).join(' · ')}</span></span></label>` : ''}
      <div data-money class="mt-3 hidden rounded-lg border border-outline-variant p-3 text-body-md">
        <strong>${money(chk.received, 2)} already received from the patient</strong>${receivedHTML}
        <label class="mt-2 flex items-start gap-2"><input type="radio" name="money_action" value="keep" class="mt-1">
          <span><strong>Keep it as the patient's share</strong> — counts toward co-pay / exclusions; the payer is billed only what is still open.</span></label>
        <label class="mt-1.5 flex items-start gap-2"><input type="radio" name="money_action" value="refund" class="mt-1" ${can('payment.collect') || can('payment.refund') ? '' : 'disabled'}>
          <span><strong>Refund it to the patient</strong> — the charges stay on the bill and the payer is billed for them.
          <select class="field field-sm mt-1 w-44" data-refund-mode>${Object.entries(MODES).filter(([, m]) => m.group === 'money').map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}</select>
          ${can('payment.collect') || can('payment.refund') ? '' : '<span class="block text-body-sm text-on-surface-variant">Refund needs a collection desk login.</span>'}</span></label>
      </div>
      <p class="mt-3 text-body-sm text-on-surface-variant" data-hint></p>`,
    footer: `${viaRequest ? '<span class="mr-auto text-body-sm text-on-surface-variant">The Insurance desk approves payer changes.</span>' : ''}<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save ${chk.blocking.length ? 'disabled' : ''}>${viaRequest ? 'Send for approval' : 'Change payer'}</button>`,
    onMount(root, close) {
      const q = (s) => root.querySelector(s);
      const fill = () => {
        const c = q('[data-cat]').value, isPayer = PAYER.includes(c);
        const list = payers.filter((p) => (p.payer_type === 'tpa' ? 'insurance' : p.payer_type) === c);
        q('[data-payer]').disabled = !isPayer;
        q('[data-payer]').innerHTML = isPayer ? `<option value="">Choose ${esc(label(c))}</option>${list.map((p) => `<option value="${p.id}" ${p.id === chk.current.payer_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`
          : '<option value="">— patient pays —</option>';
        q('[data-money]').classList.toggle('hidden', !(isPayer && chk.received > 0.005));
        q('[data-hint]').textContent = isPayer
          ? (['insurance', 'aarogyasri'].includes(c) ? 'A new case opens as pre-auth pending on Insurance & Payer Cases. Lab / imaging stay held until it is approved.' : 'Corporate / trust cases open approved by default; open balances move to the payer at once.')
          : c === 'credit' ? 'The balance becomes an approved patient due — services go ahead, the patient pays later.' : 'The patient pays the open balance at the counter.';
        if (isPayer && !list.length) q('[data-hint]').textContent = `No ${label(c)} payer in the payer master yet — add it on Payers first.`;
      };
      q('[data-cat]').onchange = fill; fill();
      q('[data-save]').onclick = async (ev) => {
        const btn = ev.currentTarget, c = q('[data-cat]').value, isPayer = PAYER.includes(c);
        const body = { category: c, payer_id: isPayer ? +q('[data-payer]').value || null : null, policy_no: q('[data-policy]').value.trim() || null,
          reason: q('[data-reason]').value.trim(), reverse_payer_entries: !!q('[data-reverse]')?.checked,
          money_action: root.querySelector('input[name=money_action]:checked')?.value, refund_mode: q('[data-refund-mode]')?.value };
        if (isPayer && !body.payer_id) { toast(`Choose the ${label(c)} payer`, 'warning'); return; }
        if (!body.reason) { toast('A reason is required', 'warning'); return; }
        if (chk.reversible.length && !body.reverse_payer_entries) { toast('Tick to reverse the unpaid payer entries first', 'warning'); return; }
        if (isPayer && chk.received > 0.005 && !body.money_action) { toast('Choose what happens to the money already received', 'warning'); return; }
        busy(btn, true, 'Saving');
        if (viaRequest) {
          try {
            const q2 = await api.post(`/encounters/${encounterId}/payer-request`, body);
            close(); toast(`Request ${q2.request_no} sent — the Insurance desk approves it, then the bills move`, 'success', { title: 'Payer change requested' });
            after?.(q2);
          } catch (err) { apiError(err, 'Request not sent'); busy(btn, false); }
          return;
        }
        try {
          const r = ip ? await api.patch(`/ipd/admissions/${chk.admission_id}/payer`, body) : await api.post(`/encounters/${encounterId}/payer`, body);
          const conv = r.conversion || {};
          close();
          toast(`${label(c)}${conv.payer_name ? ` · ${conv.payer_name}` : ''}${conv.claim ? ` — case ${conv.claim.claim_no} (${String(conv.claim.status).replace(/_/g, ' ')})` : ''}`, 'success', {
            title: 'Payer changed',
          });
          if (conv.refunds?.length) toast(`Refunded ${money(conv.refunds.reduce((s, x) => s + x.amount, 0), 2)} — ${conv.refunds.map((x) => x.refund_no).join(', ')}`, 'info', { timeout: 9000 });
          after?.(r);
        } catch (err) { apiError(err, 'Payer not changed'); busy(btn, false); }
      };
    },
  });
}

const CAT_LABEL = (c) => label(c);
const actionText = (b) => [b.money_action === 'keep' ? 'keep money as patient share' : b.money_action === 'refund' ? `refund (${MODES[b.refund_mode]?.label || b.refund_mode || 'cash'})` : '',
  b.reverse_payer_entries ? 'reverse unpaid payer entries' : ''].filter(Boolean).join(' · ');

/** A request is already waiting: show it, let the requester withdraw it. */
function pendingNotice(r, after, stack=false) {
  modal({
    stack,
    title: `Payer change ${esc(r.request_no)} is waiting`, size: 'sm',
    body: `<p class="text-body-md">${esc(CAT_LABEL(r.from_category))} → <strong>${esc(CAT_LABEL(r.to_category))}</strong>${r.payer_name ? ` · ${esc(r.payer_name)}` : ''}</p>
      <p class="text-body-sm text-on-surface-variant mt-1">Asked by ${esc(r.requested_by_name || '')} · ${esc(r.requested_at)} — ${esc(r.reason)}</p>
      ${actionText(r.body) ? `<p class="text-body-sm mt-1">${esc(actionText(r.body))}</p>` : ''}
      <p class="text-body-md mt-3">The Insurance desk approves or declines it. Nothing changes on the bills until then.</p>`,
    footer: `<button class="btn-secondary" data-close>Close</button><button class="btn-ghost" data-withdraw>Withdraw request</button>`,
    onMount(root, close) {
      root.querySelector('[data-withdraw]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.post(`/payer-requests/${r.id}/cancel`, { reason: 'Withdrawn by the desk' }); close(); toast('Request withdrawn', 'success'); after?.(); }
        catch (err) { apiError(err); busy(ev.currentTarget, false); }
      };
    },
  });
}

/** Queue of payer-change requests, for the Insurance desk and Approvals. Renders into `host`; returns a loader. */
export function payerRequestsPanel(host) {
  const load = async () => {
    let d;
    try { d = await api.get('/payer-requests?status=pending'); } catch { host.innerHTML = ''; return; }
    if (!host.isConnected) return;
    host.innerHTML = `<div class="card mb-5"><div class="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
        <div><h2 class="panel-title">Payer change requests</h2><p class="text-body-sm text-on-surface-variant">Self-pay ⇄ credit ⇄ insurance / Aarogyasri / corporate / trust, asked by the desks. Approving moves the bills; money already received is handled as the desk chose.</p></div>
        <span class="${d.rows.length ? 'pill-warning' : 'pill-success'} pill-dot">${d.rows.length} waiting</span></div>
      ${d.rows.length ? `<div class="overflow-auto"><table class="tbl"><thead><tr><th>Request</th><th>Patient / visit</th><th>Change</th><th>Money</th><th>Reason</th><th>Asked by</th><th></th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr><td class="font-data-mono text-body-sm">${esc(r.request_no)}</td>
          <td><div class="font-label-lg">${esc(r.patient_name)}</div><div class="text-body-sm text-on-surface-variant font-data-mono">${esc(r.uhid)} · ${esc(r.ip_no || r.encounter_no)}</div></td>
          <td>${esc(CAT_LABEL(r.from_category))} → <strong>${esc(CAT_LABEL(r.to_category))}</strong>${r.payer_name ? `<div class="text-body-sm">${esc(r.payer_name)}${r.body.policy_no ? ` · ${esc(r.body.policy_no)}` : ''}</div>` : ''}</td>
          <td class="text-body-sm">${esc(actionText(r.body) || '—')}</td>
          <td class="text-body-md max-w-[240px]">${esc(r.reason)}</td>
          <td class="text-body-sm">${esc(r.requested_by_name || '')}<div class="text-on-surface-variant">${esc(r.requested_at)}</div></td>
          <td class="text-right whitespace-nowrap">${d.can_approve ? `<button class="btn-ghost btn-sm" data-pcr-reject="${r.id}">Decline</button> <button class="btn-primary btn-sm" data-pcr-approve="${r.id}">Approve</button>` : '<span class="pill-warning pill-dot">Waiting</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="px-4 py-5 text-body-md text-on-surface-variant">No payer changes waiting.</p>'}</div>`;
    host.querySelectorAll('[data-pcr-approve]').forEach((b) => { b.onclick = async () => {
      busy(b, true);
      try { const r = await api.post(`/payer-requests/${b.dataset.pcrApprove}/approve`, {});
        toast(`${r.request_no} approved — bills moved to ${CAT_LABEL(r.to_category)}${r.result?.claim ? ` · case ${r.result.claim.claim_no}` : ''}`, 'success');
        if (r.result?.refunds?.length) toast(`Refund to hand over: ${money(r.result.refunds.reduce((s, x) => s + x.amount, 0), 2)} (${r.result.refunds.map((x) => x.refund_no).join(', ')})`, 'info', { timeout: 9000 });
        load(); }
      catch (err) { apiError(err, 'Could not approve'); busy(b, false); }
    }; });
    host.querySelectorAll('[data-pcr-reject]').forEach((b) => { b.onclick = () => {
      modal({ title: 'Decline payer change?', size: 'sm', stack: true,
        body: '<label class="field-label">Reason *</label><textarea class="field" rows="3" data-why placeholder="Recorded in the audit trail"></textarea>',
        footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-danger" data-ok>Decline</button>',
        onMount(root, close) { root.querySelector('[data-ok]').onclick = async (ev) => {
          const reason = root.querySelector('[data-why]').value.trim(); if (!reason) { toast('A reason is required', 'warning'); return; }
          busy(ev.currentTarget, true);
          try { await api.post(`/payer-requests/${b.dataset.pcrReject}/reject`, { reason }); close(); toast('Request declined', 'success'); load(); }
          catch (err) { apiError(err); busy(ev.currentTarget, false); }
        }; } });
    }; });
  };
  load();
  return load;
}

