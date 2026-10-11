/**
 * Counselling — consent, recording, local transcript, summary, doctor's signature.
 * The signed summary appears on the patient's record (Patient → Counselling).
 */
import { page, eyebrow, liveChip, card, live, mountPage, api, can, esc, toast, apiError, busy, bind, kpiRow, kpi, emptyState,
  fmtDate, fmtDateTime, modal, confirmDialog, pill, $, $$, state, patientPicker, doctorOptions, printDocument, setting } from './_kit.js';
import { token } from '../api.js';
import { canRecord, startRecording } from '../recorder.js';

let META = null;
const STATUS = { consented: 'Consent taken', consent_refused: 'Recording refused', recorded: 'Recorded', transcribing: 'Transcribing', transcribed: 'Transcript ready', summary_draft: 'Awaiting review', reviewed: 'Signed' };
const FIELDS = [['explained', 'What was explained', 'Condition, proposed treatment / procedure, expected course'], ['risks', 'Risks & complications discussed', ''],
  ['alternatives', 'Alternatives discussed', ''], ['questions', 'Questions asked & answers', ''], ['decision', 'Patient / family decision', 'e.g. Agreed to surgery on …'],
  ['follow_up', 'Follow-up / instructions', ''], ['notes', 'Other notes', '']];
const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export async function mount(ctx) {
  META = await api.get('/counselling/meta');
  let filter = can('counsel.review') ? 'review' : 'open', rows = [];
  const root = mountPage(ctx, page({
    eyebrow: `${eyebrow('Clinical', 'record_voice_over')} ${liveChip()}`,
    title: 'Counselling',
    subtitle: 'Record a counselling conversation with consent, get a transcript on the hospital\'s own computer, and file a doctor-signed summary on the patient\'s record.',
    actions: can('counsel.write') || can('counsel.review') ? '<button class="btn-primary" data-new><span class="material-symbols-outlined text-[18px]">add</span>New session</button>' : '',
    body: `${META.engine ? '' : '<div class="card p-3 mb-4 text-body-md text-warning">The transcription engine is not installed on the server — recordings are kept, and can be transcribed once it is.</div>'}
      ${kpiRow([], 4)}
      <div class="flex gap-1 mb-3" role="tablist">${[['review', 'Awaiting review'], ['open', 'Open'], ['reviewed', 'Signed'], ['', 'All']]
        .map(([k, l]) => `<button class="btn-secondary btn-sm" role="tab" data-filter="${k}">${l}</button>`).join('')}</div>
      <div data-list></div>`,
  }));
  if (ctx.query?.patient) newSession({ id: +ctx.query.patient }, () => load());

  async function load() {
    const q = filter ? `?status=${filter}` : '';
    rows = await api.get('/counselling' + q);
    const all = filter ? await api.get('/counselling').catch(() => rows) : rows;
    $('[data-kpis]', root).innerHTML = [
      { label: 'Awaiting review', value: all.filter((r) => r.status === 'summary_draft').length, icon: 'rate_review', tone: 'warning', sub: 'Summaries for the doctor to sign' },
      { label: 'Transcripts ready', value: all.filter((r) => r.status === 'transcribed').length, icon: 'subject', tone: 'info', sub: 'Need a summary' },
      { label: 'Transcribing', value: all.filter((r) => r.status === 'transcribing').length + (META.queue ? 0 : 0), icon: 'graphic_eq', tone: 'neutral', sub: META.engine ? 'On this server, offline' : 'Engine not installed' },
      { label: 'Signed', value: all.filter((r) => r.status === 'reviewed').length, icon: 'verified', tone: 'success', sub: 'On patient records' },
    ].map(kpi).join('');
    $$('[data-filter]', root).forEach((b) => { b.className = `btn-${b.dataset.filter === filter ? 'primary' : 'secondary'} btn-sm`; });
    $('[data-list]', root).innerHTML = card({ pad: false, body: rows.length ? `<div class="overflow-auto max-h-[64vh]"><table class="tbl"><thead><tr><th>Session</th><th>Patient</th><th>Topic</th><th>Doctor</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${r.id}"><td class="font-data-mono">${esc(r.session_no)}<div class="text-label-sm text-on-surface-variant font-sans">${fmtDateTime(r.created_at)}</div></td>
        <td class="text-body-md">${esc(r.patient_name)}<div class="text-label-sm text-on-surface-variant">${esc(r.uhid)}</div></td>
        <td class="text-body-md">${esc(META.topics[r.topic] || r.topic)}${r.has_recording ? ` <span class="material-symbols-outlined text-[16px] align-middle text-on-surface-variant" title="Recorded">mic</span>${r.duration_sec ? `<span class="text-label-sm text-on-surface-variant"> ${mm(r.duration_sec)}</span>` : ''}` : ''}</td>
        <td class="text-body-md">${esc(r.doctor_name || '')}</td>
        <td>${pill(r.status, STATUS[r.status] || r.status)}${r.transcribe_error ? `<div class="text-label-sm text-danger">${esc(r.transcribe_error)}</div>` : ''}</td>
        <td class="text-right"><button class="btn-secondary btn-xs" data-open>Open</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="p-4">${emptyState('record_voice_over', 'Nothing here', 'Start a session from “New session”.')}</div>` });
  }
  bind(root, 'click', '[data-filter]', (e, b) => { filter = b.dataset.filter; load(); });
  bind(root, 'click', '[data-new]', () => newSession(null, load));
  bind(root, 'click', '[data-open]', (e, b) => openSession(+b.closest('tr').dataset.id, load));
  return live({ topics: ['counselling'], events: ['counselling.updated'], load, interval: 60000 });
}

export async function newSession(preset, after = () => {}) {
  META ||= await api.get('/counselling/meta');
  let picked = preset?.id ? await api.get(`/patients/${preset.id}`).then((p) => p.patient || p).catch(() => null) : null;
  modal({
    title: 'New counselling session', subtitle: 'Consent is recorded first. If the patient does not agree to recording, keep written notes only.', size: 'lg',
    body: `<form data-f class="space-y-3">
      <div><label class="field-label">Patient *</label>${picked ? `<div class="text-body-md font-semibold">${esc(picked.name)} · ${esc(picked.uhid)}</div>` : '<div data-picker></div>'}</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label class="field-label">Topic *</label><select class="field" name="topic">${Object.entries(META.topics).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
        <div><label class="field-label">Reviewing doctor *</label><select class="field" name="doctor_id">${doctorOptions(false).map((o) => `<option value="${o.value}" ${+o.value === state.user?.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
        <div><label class="field-label">Spoken language</label><select class="field" name="language">${Object.entries(META.languages).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
      </div>
      <label class="flex items-center gap-2 text-body-md"><input type="checkbox" name="translate"> Also translate the transcript to English</label>
      <div><label class="field-label">Present (names & relation)</label><input class="field" name="attendees" placeholder="e.g. Patient, wife (Lakshmi), son (Ravi)"></div>
      <fieldset class="rounded-lg border border-outline-variant p-3"><legend class="px-1 field-label !mb-0">Consent to record</legend>
        <p class="text-body-md bg-surface-container-low rounded p-2 mb-2" data-ctext>${esc(META.consent_text)}</p>
        <p class="text-body-sm text-on-surface-variant mb-2">Read this to the patient (in their language) before recording.</p>
        <div class="flex flex-wrap gap-4 mb-2"><label class="flex items-center gap-2"><input type="radio" name="consent" value="given" checked> Agreed to recording</label>
          <label class="flex items-center gap-2"><input type="radio" name="consent" value="refused"> Did not agree — notes only</label></div>
        <div class="grid grid-cols-2 gap-3" data-cby><div><label class="field-label">Consent given by *</label><input class="field" name="consent_by" placeholder="Name"></div>
          <div><label class="field-label">Relation</label><select class="field" name="consent_relation">${['self', 'spouse', 'parent', 'son', 'daughter', 'sibling', 'guardian', 'other'].map((r) => `<option>${r}</option>`).join('')}</select></div></div>
      </fieldset></form>`,
    footer: '<button class="btn-secondary" data-close>Cancel</button><button class="btn-primary" data-save>Start session</button>',
    onMount(root, close) {
      if (!picked) patientPicker(root.querySelector('[data-picker]'), (p) => { picked = p; root.querySelector('[name=consent_by]').value ||= p.name; }, { autofocus: true });
      else root.querySelector('[name=consent_by]').value = picked.name;
      root.querySelectorAll('[name=consent]').forEach((r) => (r.onchange = () => { root.querySelector('[data-cby]').classList.toggle('hidden', r.value === 'refused' && r.checked); }));
      root.querySelector('[data-save]').onclick = async (ev) => {
        if (!picked) { toast('Choose the patient', 'warning'); return; }
        const form = root.querySelector('[data-f]');
        const b = Object.fromEntries(new FormData(form));
        b.translate = form.translate.checked; b.patient_id = picked.id; b.consent_text = META.consent_text;
        if (b.consent === 'given' && !String(b.consent_by || '').trim()) { toast('Who gave consent?', 'warning'); return; }
        busy(ev.currentTarget, true);
        try { const s = await api.post('/counselling', b); close(); after(); openSession(s.id, after); }
        catch (e) { apiError(e); busy(ev.currentTarget, false); }
      };
    },
  });
}

export async function openSession(id, after = () => {}) {
  META ||= await api.get('/counselling/meta');
  let s;
  try { s = await api.get(`/counselling/${id}`); } catch (e) { apiError(e); return; }
  const sum = JSON.parse(s.summary_json || 'null') || {};
  const editable = s.status !== 'reviewed' && (can('counsel.write') || can('counsel.review'));
  const recordable = s.consent_given && !['summary_draft', 'reviewed', 'transcribing'].includes(s.status) && (can('counsel.write') || can('counsel.review'));
  let rec = null, timer = null;
  modal({
    title: `${s.session_no} — ${s.patient_name}`, subtitle: `${META.topics[s.topic] || s.topic} · ${s.uhid} · doctor ${s.doctor_name || '—'}`, size: 'xl',
    body: `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="space-y-3">
        <div class="rounded-lg border border-outline-variant p-3 text-body-md">${s.consent_given
          ? `<span class="material-symbols-outlined text-[16px] align-middle text-success">verified</span> Recording consented by <b>${esc(s.consent_by)}</b> (${esc(s.consent_relation)}) · ${fmtDateTime(s.consent_at)}`
          : '<span class="material-symbols-outlined text-[16px] align-middle text-warning">mic_off</span> The patient did not agree to recording — written notes only.'}
          ${s.attendees ? `<div class="text-body-sm text-on-surface-variant mt-1">Present: ${esc(s.attendees)}</div>` : ''}</div>
        ${s.consent_given ? `<div class="rounded-lg border border-outline-variant p-3" data-recbox>
          <div class="field-label">Recording</div>
          ${s.has_recording ? `<audio controls preload="none" class="w-full my-2" src="/api/counselling/${s.id}/audio?t=${encodeURIComponent(token())}"></audio>
            <div class="text-body-sm text-on-surface-variant">${s.duration_sec ? mm(s.duration_sec) + ' · ' : ''}${fmtDateTime(s.recorded_at)} · every playback is logged</div>` : '<p class="text-body-sm text-on-surface-variant">Not recorded yet.</p>'}
          ${recordable ? `<div class="flex flex-wrap items-center gap-2 mt-2">
            ${canRecord() ? `<button class="btn-primary btn-sm" data-rec><span class="material-symbols-outlined text-[16px]">mic</span>${s.has_recording ? 'Record again' : 'Start recording'}</button>
              <button class="btn-secondary btn-sm hidden" data-pause>Pause</button><button class="btn-danger btn-sm hidden" data-stop>Stop & save</button>
              <span class="font-data-mono text-body-md hidden" data-clock>0:00</span><span class="h-2 w-24 rounded bg-surface-container-high overflow-hidden hidden" data-meter><span class="block h-full bg-success" style="width:0%"></span></span>`
              : '<p class="text-body-sm text-warning w-full">Recording here needs this screen opened on the server computer or over HTTPS. You can upload a recording instead.</p>'}
            <label class="btn-secondary btn-sm cursor-pointer">Upload audio<input type="file" accept=".wav,.mp3,.ogg,.flac,audio/wav,audio/mpeg,audio/ogg,audio/flac" class="hidden" data-upload></label>
            <span class="text-label-sm text-on-surface-variant">WAV, MP3, OGG or FLAC</span></div>` : ''}
        </div>` : ''}
        ${s.consent_given ? `<div class="rounded-lg border border-outline-variant p-3">
          <div class="flex items-center justify-between gap-2"><div class="field-label !mb-0">Transcript ${s.detected_language ? `<span class="normal-case font-normal">(${esc(META.languages[s.detected_language] || s.detected_language)})</span>` : ''}</div>
            ${s.has_recording && !['transcribing', 'reviewed'].includes(s.status) && META.engine && editable ? '<button class="btn-ghost btn-xs" data-retx>Transcribe again</button>' : ''}</div>
          ${s.status === 'transcribing' || s.queue_position ? `<p class="text-body-md text-info mt-2"><span class="material-symbols-outlined text-[16px] align-middle animate-spin">progress_activity</span> Transcribing on the hospital server${s.queue_position ? ` (queue position ${s.queue_position})` : ''} — this page updates when it is done.</p>` : ''}
          ${s.transcribe_error ? `<p class="text-body-sm text-danger mt-1">${esc(s.transcribe_error)}</p>` : ''}
          ${s.segments?.length ? `<div class="max-h-[34vh] overflow-auto text-body-md mt-2 space-y-1">${s.segments.map((g) => `<p><span class="font-data-mono text-label-sm text-on-surface-variant">${esc((g.from || '').slice(3, 8))}</span> ${esc(g.text)}</p>`).join('')}</div>`
            : s.status === 'transcribed' ? '<p class="text-body-sm text-warning mt-1">No speech was detected in this recording. Check the microphone, then record again or upload another file.</p>'
            : s.status !== 'transcribing' ? '<p class="text-body-sm text-on-surface-variant mt-1">No transcript yet.</p>' : ''}
        </div>` : ''}
      </div>
      <div class="space-y-2">
        <div class="flex items-center justify-between"><div class="field-label !mb-0">Summary ${s.status === 'reviewed' ? `— signed by ${esc(s.reviewed_by_name || '')} ${fmtDateTime(s.reviewed_at)}${s.amended ? ` · amended ×${s.amended}` : ''}` : ''}</div>${pill(s.status, STATUS[s.status])}</div>
        <form data-sf class="space-y-2">${FIELDS.map(([k, l, ph]) => `<div><label class="field-label">${l}</label><textarea class="field" rows="${k === 'explained' ? 3 : 2}" name="${k}" placeholder="${esc(ph)}" ${editable ? '' : 'readonly'}>${esc(sum[k] || '')}</textarea></div>`).join('')}</form>
        ${s.segments?.length && editable && !sum.explained ? '<button class="btn-ghost btn-xs" data-fill>Start from the transcript</button>' : ''}
      </div></div>`,
    footer: `<button class="btn-secondary" data-close>Close</button>
      ${s.status === 'reviewed' ? '<button class="btn-secondary" data-print>Print</button>' : ''}
      ${editable ? '<button class="btn-secondary" data-save>Save draft</button>' : ''}
      ${editable && s.status !== 'summary_draft' && can('counsel.write') && !s.can_review ? '<button class="btn-primary" data-submit>Send to doctor for review</button>' : ''}
      ${s.status !== 'reviewed' && s.can_review ? '<button class="btn-primary" data-sign>Review & sign</button>' : ''}
      ${s.status === 'reviewed' && s.can_review ? '<button class="btn-secondary" data-amend>Amend</button>' : ''}`,
    onMount(root, close) {
      const summary = () => Object.fromEntries(new FormData(root.querySelector('[data-sf]')));
      const reopen = () => { close(); after(); openSession(id, after); };
      const upload = async (blob, type, seconds) => {
        const box = root.querySelector('[data-recbox]');
        box.insertAdjacentHTML('beforeend', '<p class="text-body-sm text-info mt-2" data-up>Saving the recording…</p>');
        const res = await fetch(`/api/counselling/${id}/recording${seconds ? `?duration=${Math.round(seconds)}` : ''}`, { method: 'POST', headers: { 'Content-Type': type, 'X-Session': token() }, body: blob });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { root.querySelector('[data-up]')?.remove(); apiError({ status: res.status, payload: j, message: j.error }); return; }
        toast(META.engine ? 'Recording saved — transcribing on the server' : 'Recording saved', 'success'); reopen();
      };
      root.querySelector('[data-rec]')?.addEventListener('click', async (ev) => {
        if (s.has_recording && !(await confirmDialog({ title: 'Record again?', message: 'The earlier recording and its transcript are replaced.', confirmLabel: 'Record again' }))) return;
        try {
          rec = await startRecording({ onLevel: (p) => { const m = root.querySelector('[data-meter] span'); if (m) m.style.width = `${Math.min(100, p * 140)}%`; } });
        } catch (e) { toast(`Microphone not available: ${e.message}`, 'danger'); return; }
        ev.currentTarget.classList.add('hidden');
        ['[data-pause]', '[data-stop]', '[data-clock]', '[data-meter]'].forEach((q) => root.querySelector(q).classList.remove('hidden'));
        timer = setInterval(() => { const c = root.querySelector('[data-clock]'); if (c && rec) c.textContent = mm(rec.seconds); }, 500);
      });
      root.querySelector('[data-pause]')?.addEventListener('click', (ev) => {
        if (!rec) return;
        const b = ev.currentTarget;
        if (b.textContent === 'Pause') { rec.pause(); b.textContent = 'Resume'; } else { rec.resume(); b.textContent = 'Pause'; }
      });
      root.querySelector('[data-stop]')?.addEventListener('click', async (ev) => {
        if (!rec) return;
        busy(ev.currentTarget, true); clearInterval(timer);
        const secs = rec.seconds, blob = await rec.stop(); rec = null;
        await upload(blob, 'audio/wav', secs);
      });
      root.querySelector('[data-upload]')?.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const type = f.type || ({ wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac' })[f.name.split('.').pop().toLowerCase()] || '';
        if (s.has_recording && !(await confirmDialog({ title: 'Replace the recording?', message: 'The earlier recording and its transcript are replaced.', confirmLabel: 'Replace' }))) return;
        await upload(f, type);
      });
      root.querySelector('[data-retx]')?.addEventListener('click', async () => {
        try { await api.post(`/counselling/${id}/transcribe`, {}); toast('Queued for transcription', 'success'); reopen(); } catch (e) { apiError(e); }
      });
      root.querySelector('[data-fill]')?.addEventListener('click', () => { root.querySelector('[name=explained]').value = s.segments.map((g) => g.text).join(' '); });
      root.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.patch(`/counselling/${id}/summary`, { summary: summary() }); toast('Draft saved', 'success'); busy(ev.currentTarget, false); after(); } catch (e) { apiError(e); busy(ev.currentTarget, false); }
      });
      root.querySelector('[data-submit]')?.addEventListener('click', async (ev) => {
        busy(ev.currentTarget, true);
        try { await api.patch(`/counselling/${id}/summary`, { summary: summary(), submit: true }); toast('Sent to the doctor for review', 'success'); reopen(); } catch (e) { apiError(e); busy(ev.currentTarget, false); }
      });
      root.querySelector('[data-sign]')?.addEventListener('click', async (ev) => {
        const text = summary();
        const ok = await confirmDialog({ title: 'Sign this summary?', message: 'It is filed on the patient\'s record and locked. Later changes need an amendment with a reason.', confirmLabel: 'Sign' });
        if (!ok) return;
        try { await api.post(`/counselling/${id}/review`, { summary: text }); toast('Signed and filed on the patient record', 'success'); reopen(); } catch (e) { apiError(e); }
      });
      root.querySelector('[data-amend]')?.addEventListener('click', () => {
        root.querySelectorAll('[data-sf] textarea').forEach((t) => t.removeAttribute('readonly'));
        const b = root.querySelector('[data-amend]'); b.textContent = 'Save amendment'; b.className = 'btn-primary';
        b.onclick = async () => {
          const text = summary();
          const c = await confirmDialog({ title: 'Amend the signed summary?', message: 'The previous text is kept in the audit trail.', confirmLabel: 'Amend', requireReason: true });
          if (!c) return;
          try { await api.post(`/counselling/${id}/amend`, { summary: text, reason: c.reason }); toast('Amended', 'success'); reopen(); } catch (e) { apiError(e); }
        };
      });
      root.querySelector('[data-print]')?.addEventListener('click', () => printSummary(s, sum));
      // a recording in progress must not be lost by closing the dialog
      root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { if (rec) { rec.cancel(); rec = null; toast('Recording discarded', 'warning'); } clearInterval(timer); }, { capture: true }));
      if (s.status === 'transcribing' || s.queue_position) {
        const poll = setInterval(async () => {
          if (!document.body.contains(root)) { clearInterval(poll); return; }
          const n = await api.get(`/counselling/${id}`).catch(() => null);
          if (n && n.status !== 'transcribing' && !n.queue_position) { clearInterval(poll); reopen(); }
        }, 5000);
      }
    },
  });
}

function printSummary(s, sum) {
  printDocument(`Counselling ${s.session_no}`, `<div style="font-size:18px;font-weight:700;color:#881D2C">${esc(setting('hospital_name', 'MGM HMS'))}</div>
    <h2 style="margin:8px 0">Counselling summary — ${esc(META.topics[s.topic] || s.topic)}</h2>
    <p>${esc(s.patient_name)} · ${esc(s.uhid)} · ${fmtDate(s.created_at)} · ${esc(s.session_no)}</p>
    <p>${s.consent_given ? `Recorded with the consent of ${esc(s.consent_by)} (${esc(s.consent_relation)}).` : 'Not recorded (consent declined).'}${s.attendees ? ` Present: ${esc(s.attendees)}.` : ''}</p>
    ${FIELDS.filter(([k]) => sum[k]).map(([k, l]) => `<h4 style="margin:12px 0 2px">${l}</h4><div style="white-space:pre-line">${esc(sum[k])}</div>`).join('')}
    <p style="margin-top:24px">Reviewed and signed by ${esc(s.reviewed_by_name || '')} on ${fmtDateTime(s.reviewed_at)}${s.amended ? ` (amended ×${s.amended})` : ''}.</p>`);
}
