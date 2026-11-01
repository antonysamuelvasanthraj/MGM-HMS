/**
 * Critical results — the lab records who in the clinical team it told, how, and that the value was
 * read back; the doctor then acknowledges and notes what was done. Every step is timed and audited.
 */
import {
  page, eyebrow, liveChip, kpiRow, live, mountPage, card,
  api, can, esc, bind, toast, modal, apiError, busy, fmtDateTime, kpi, headCount, doctors,
} from './_kit.js';

const STATE = { not_called: ['danger', 'Not yet told'], called: ['warning', 'Told — awaiting acknowledgement'], acknowledged: ['success', 'Acknowledged'], told_outside: ['success', 'Told & read back (outside the HMS)'] };

export async function mount(ctx) {
  let days = 7, data = null;
  const root = mountPage(ctx, page({
    eyebrow: `${eyebrow('Patient safety', 'crisis_alert')} ${liveChip()}`, title: 'Critical Results',
    subtitle: 'Every critical value: who was told, how fast, read-back, and the doctor\'s acknowledgement.',
    actions: `<select class="field field-sm !w-40" data-days>${[[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days']].map(([v, l]) => `<option value="${v}" ${v === days ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
    body: `${kpiRow([], 3)}<div data-list></div>`,
  }));

  async function load() {
    data = await api.get(`/lab/critical?days=${days}`);
    const ack = data.rows.filter((r) => ['acknowledged', 'told_outside'].includes(r.state)).length;
    headCount(root, `${data.summary.not_called} not yet told`);
    root.querySelector('[data-kpis]').innerHTML = [
      { label: 'Not yet told', value: data.summary.not_called, icon: 'call', tone: data.summary.not_called ? 'danger' : 'success', sub: 'Call the treating doctor now' },
      { label: 'Awaiting acknowledgement', value: data.summary.called, icon: 'hourglass_top', tone: data.summary.called ? 'warning' : 'neutral', sub: 'Doctor to confirm' },
      { label: 'Acknowledged', value: ack, icon: 'task_alt', tone: 'success', sub: `of ${data.rows.length} in the period` },
    ].map(kpi).join('');
    root.querySelector('[data-list]').innerHTML = card({ title: 'Critical values', pad: false, body: `<div class="overflow-auto"><table class="tbl">
      <thead><tr><th>Patient</th><th>Test & value</th><th>Resulted</th><th>Status</th><th>Calls</th><th></th></tr></thead><tbody>${data.rows.length ? data.rows.map((r) => `<tr>
        <td><b>${esc(r.patient_name)}</b><div class="text-body-sm font-data-mono">${esc(r.uhid)} · ${esc(r.encounter_no)}</div>${r.mobile ? `<div class="text-body-sm">${esc(r.mobile)}</div>` : ''}</td>
        <td><b>${esc(r.label)}</b><div class="text-danger font-semibold">${esc(r.results)}</div><div class="text-body-sm">Requested by ${esc(r.requested_by_name || r.ordered_by_name || '—')}</div></td>
        <td class="font-data-mono">${esc(fmtDateTime(r.resulted_at))}</td>
        <td><span class="pill-${STATE[r.state][0]} pill-dot">${STATE[r.state][1]}</span></td>
        <td class="text-body-sm">${r.calls.map((c) => `<div>${esc(fmtDateTime(c.called_at))} — ${esc(c.called_by_name)} told <b>${esc(c.informed_name)}</b> (${esc(c.mode.replace('_', ' '))}, read back${c.minutes_from_result != null ? `, ${c.minutes_from_result} min` : ''})
          ${c.acknowledged_at ? `<div class="text-success">✓ ${esc(c.acknowledged_by_name)} · ${esc(fmtDateTime(c.acknowledged_at))}: ${esc(c.action_taken)}</div>` : ''}</div>`).join('') || '—'}</td>
        <td><div class="flex flex-col gap-1 items-end">
          ${can('lab.result') ? `<button class="btn-${r.state === 'not_called' ? 'primary' : 'secondary'} btn-xs" data-call="${r.id}">Record call</button>` : ''}
          ${can('patient.clinical') && r.calls.some((c) => !c.acknowledged_at) ? `<button class="btn-primary btn-xs" data-ack="${r.calls.find((c) => !c.acknowledged_at).id}">Acknowledge</button>` : ''}</div></td></tr>`).join('')
        : '<tr><td colspan="6" class="text-center text-on-surface-variant py-8">No critical value in this period.</td></tr>'}</tbody></table></div>` });
  }

  bind(root, 'change', '[data-days]', (e, s) => { days = +s.value; load(); });
  bind(root, 'click', '[data-call]', (e, b) => {
    const r = data.rows.find((x) => x.id === +b.dataset.call);
    modal({ title: `Record the call — ${r.label}`, size: 'md', stack: true, subtitle: `${esc(r.patient_name)} · ${esc(r.results)}`,
      body: `<div class="space-y-3">
        <div><label class="field-label">Doctor told (in the HMS)</label><select class="field" data-user><option value="">— someone else (type the name) —</option>
          ${doctors().filter((d) => d.role === 'doctor').map((d) => `<option value="${d.id}" ${d.id === r.ordered_by ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
        <div><label class="field-label">Or name and role of the person told</label><input class="field" data-name value="${esc(r.requested_by_name && !doctors().some((d) => d.name === r.requested_by_name) ? r.requested_by_name : '')}" placeholder="e.g. Dr. Ravi (duty MO) / Sr. Mary (ward in-charge)"></div>
        <div><label class="field-label">How</label><select class="field" data-mode><option value="phone">Phone</option><option value="in_person">In person</option><option value="intercom">Intercom</option><option value="video">Video call</option></select></div>
        <label class="flex items-start gap-2"><input type="checkbox" data-rb class="mt-1"><span>They <b>read back</b> the patient's name and the value correctly</span></label>
        <div><label class="field-label">Notes</label><input class="field" data-notes></div></div>`,
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Save call</button>',
      onMount(m, close) { m.querySelector('[data-ok]').onclick = async (ev) => {
        const userId = +m.querySelector('[data-user]').value || null;
        const name = m.querySelector('[data-name]').value.trim() || doctors().find((d) => d.id === userId)?.name || '';
        if (!m.querySelector('[data-rb]').checked) { toast('A critical value is only communicated once it is read back', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { await api.post(`/lab/orders/${r.id}/critical-call`, { informed_user_id: userId, informed_name: name, mode: m.querySelector('[data-mode]').value, read_back: true, notes: m.querySelector('[data-notes]').value.trim() });
          close(); toast('Call recorded — the doctor is asked to acknowledge', 'success'); load(); }
        catch (err) { apiError(err); busy(ev.currentTarget, false); } }; } });
  });
  bind(root, 'click', '[data-ack]', (e, b) => {
    modal({ title: 'Acknowledge the critical result', size: 'sm', stack: true,
      body: '<label class="field-label">Action taken *</label><textarea class="field" rows="3" data-act placeholder="e.g. Potassium 6.8 — ECG done, calcium gluconate and insulin-dextrose given, repeat in 2 h"></textarea>',
      footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-ok>Acknowledge</button>',
      onMount(m, close) { m.querySelector('[data-ok]').onclick = async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.post(`/critical-calls/${b.dataset.ack}/ack`, { action_taken: m.querySelector('[data-act]').value.trim() }); close(); toast('Acknowledged', 'success'); load(); }
        catch (err) { apiError(err); busy(ev.currentTarget, false); } }; } });
  });
  return live({ topics: ['lab', 'clinical'], events: ['lab.critical', 'lab.critical.called', 'lab.reported', 'lab.verified'], load });
}
