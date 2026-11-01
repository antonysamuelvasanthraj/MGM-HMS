/**
 * Outside-centre dialogs shared by the Outsourcing desk and the lab / imaging screens:
 * record the report a centre sent, and accept it after checking patient, test and sample.
 */
import { api } from './api.js';
import { can } from './store.js';
import { modal, esc, toast, fmtDateTime } from './ui.js';
import { apiError, busy } from './views/_kit.js';
import { fileUrl } from './attachments.js';

/** Record the centre's report for an order whose file is already attached. */
export function recordReportDialog(order, after) {
  modal({ title: `Outside report — ${order.label}`, size: 'md', stack: true,
    subtitle: `${esc(order.patient_name || '')} · ${esc(order.order_no || '')} · ${esc(order.provider_name || '')}`,
    body: `<form class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-f>
      <div><label class="field-label">Centre's report number</label><input class="field" name="external_report_no"></div>
      <div><label class="field-label">Reporting laboratory / centre *</label><input class="field" name="reporting_lab" value="${esc(order.provider_name || '')}" required></div>
      <div><label class="field-label">Signed by (their pathologist / radiologist) *</label><input class="field" name="signatory_name" required placeholder="As printed on their report"></div>
      <div><label class="field-label">Registration no.</label><input class="field" name="signatory_reg_no" placeholder="e.g. APMC 12345"></div>
      <div><label class="field-label">Reported on</label><input class="field" type="datetime-local" name="reported_at"></div>
      ${order.category === 'imaging' ? '<div><label class="field-label">Images (PACS / DICOM link)</label><input class="field" name="image_link" placeholder="https://…"></div>' : '<div></div>'}
      <p class="sm:col-span-2 text-body-sm text-on-surface-variant">Attach their PDF to the order first. The report is kept exactly as they sent it and is always shown as their report, with their signatory — never as ours. It reaches the doctor once a signatory here accepts it.</p></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Record report</button>',
    onMount(root, close) {
      root.querySelector('[data-save]').onclick = async (ev) => {
        const form = root.querySelector('[data-f]');
        if (!form.reportValidity()) return;
        busy(ev.currentTarget, true);
        try {
          const body = Object.fromEntries(new FormData(form));
          if (body.reported_at) body.reported_at = body.reported_at.replace('T', ' ') + ':00';
          const r = await api.post(`/outsource/orders/${order.id}/report`, body);
          close(); toast(`Report v${r.version} recorded — waiting for acceptance`, 'success'); after?.(r);
        } catch (err) { apiError(err, 'Report not recorded'); busy(ev.currentTarget, false); }
      };
    },
  });
}

/** Accept (or reject) a recorded outside report after the three identity checks. */
export function acceptReportDialog(x, after) {
  const signer = x.category === 'imaging' ? can('imaging.report') : can('lab.verify');
  modal({ title: `Accept outside report — ${x.label}`, size: 'md', stack: true,
    subtitle: `${esc(x.patient_name)} · ${esc(x.uhid)} · ${esc(x.order_no)}`,
    body: `<div class="space-y-3">
      <div class="rounded-lg border border-outline-variant p-3 text-body-md">
        <div><b>${esc(x.reporting_lab)}</b>${x.external_report_no ? ` · report ${esc(x.external_report_no)}` : ''} · version ${x.version}${x.is_correction ? ' <span class="pill-warning">Corrected report</span>' : ''}</div>
        <div class="text-body-sm text-on-surface-variant">Signed by ${esc(x.signatory_name)}${x.signatory_reg_no ? ` (${esc(x.signatory_reg_no)})` : ''}${x.reported_at ? ` · ${esc(fmtDateTime(x.reported_at))}` : ''}</div>
        <div class="mt-2"><a class="btn-ghost btn-xs" target="_blank" href="#" data-files>Open the attached file(s)</a></div></div>
      ${['patient', 'test', 'sample'].map((k) => `<label class="flex items-start gap-2"><input type="checkbox" data-check="${k}" class="mt-1"><span>${({
        patient: `The report is for <b>${esc(x.patient_name)}</b> (${esc(x.gender || '')} ${x.age_years ?? ''}y) — name and age / sex match`,
        test: `It reports <b>${esc(x.label)}</b>, the test we sent`,
        sample: x.category === 'imaging' ? 'The study date and centre match our referral' : `It refers to our sample <b>${esc(x.sample_id || '—')}</b> or our reference number`,
      })[k]}</span></label>`).join('')}
      <div><label class="field-label">Reason (only to reject)</label><input class="field" data-reason placeholder="e.g. Wrong patient name on the report — asked the centre to correct"></div></div>`,
    footer: signer ? '<button class="btn-secondary" data-close>Close</button><button class="btn-danger" data-reject>Reject</button><button class="btn-primary" data-accept>Accept & publish</button>'
      : '<button class="btn-secondary" data-close>Close</button><span class="text-body-sm">A lab / imaging signatory accepts outside reports.</span>',
    onMount(root, close) {
      root.querySelector('[data-files]').onclick = async (e) => {
        e.preventDefault();
        try {
          const files = await api.get(`/attachments/order/${x.order_id}`);
          const ids = JSON.parse(x.attachment_ids || '[]');
          for (const f of files.filter((f) => ids.includes(f.id))) window.open(fileUrl(f.id), '_blank');
        } catch (err) { apiError(err); }
      };
      root.querySelector('[data-accept]')?.addEventListener('click', async (ev) => {
        const checks = Object.fromEntries([...root.querySelectorAll('[data-check]')].map((c) => [c.dataset.check, c.checked]));
        if (!checks.patient || !checks.test || !checks.sample) { toast('Tick all three checks before accepting', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { const r = await api.post(`/outsource/reports/${x.id}/accept`, { checks }); close(); toast(r.corrected ? 'Corrected report published — the doctor is told' : 'Report published to the doctor', 'success'); after?.(); }
        catch (err) { apiError(err); busy(ev.currentTarget, false); }
      });
      root.querySelector('[data-reject]')?.addEventListener('click', async (ev) => {
        const reason = root.querySelector('[data-reason]').value.trim();
        if (!reason) { toast('Give the reason for rejecting', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { await api.post(`/outsource/reports/${x.id}/reject`, { reason }); close(); toast('Report rejected — ask the centre for a corrected one', 'info'); after?.(); }
        catch (err) { apiError(err); busy(ev.currentTarget, false); }
      });
    },
  });
}
