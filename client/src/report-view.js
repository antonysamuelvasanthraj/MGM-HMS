/**
 * Public lab report page, opened from the QR printed on a report (route /r/<token>).
 * Read-only: it shows RELEASED results only, needs no login, and stops working when the link expires.
 */
const root = document.getElementById('root');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SECTION_ORDER = ['Haematology', 'Biochemistry', 'Serology & Immunology', 'Clinical Pathology', 'Cytology', 'Microbiology', 'Endocrinology', 'Histopathology', 'Others', 'Miscellaneous'];
const rank = (s) => { const i = SECTION_ORDER.indexOf(s || ''); return i < 0 ? SECTION_ORDER.length : i; };
const fmt = (stamp) => { if (!stamp) return ''; const d = new Date(String(stamp).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? String(stamp) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const fmtDay = (stamp) => { const d = new Date(`${stamp}T00:00:00`); return Number.isNaN(d.getTime()) ? stamp : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
// the unit has its own column: drop a trailing unit from the reference text
const refOnly = (x) => { const ref = String(x.ref_range || '').trim(), u = String(x.unit || '').trim(); return u && ref.endsWith(u) ? ref.slice(0, -u.length).trim() : ref; };
const message = (title, text) => { root.innerHTML = `<div class="msg"><h1>${esc(title)}</h1><p>${esc(text)}</p></div>`; };

const token = location.pathname.split('/').filter(Boolean).pop();
let res, data;
try { res = await fetch(`/api/public/report/${encodeURIComponent(token)}`); data = await res.json().catch(() => ({})); }
catch { message('Cannot reach the laboratory', 'Check your connection. If you are outside the hospital network, ask the laboratory for a printed copy.'); throw new Error('offline'); }

if (res.status === 410) message('This report link has expired', `Reports are kept online for a limited time${data.expired_on ? ` (until ${fmtDay(data.expired_on)})` : ''}. Please contact the laboratory for a copy.`);
else if (res.status === 403) message('Online reports are switched off', 'Please collect your report from the laboratory.');
else if (res.status === 429) message('Too many requests', 'Please wait a minute and try again.');
else if (!res.ok) message('Report not found', 'The link is not valid. Please check the QR code or ask the laboratory.');
else if (data.state === 'not_ready') message('Report not released yet', data.message);
else {
  const reports = [...data.reports].sort((a, b) => rank(a.lab_section) - rank(b.lab_section));
  const first = reports[0], s = first.settings || {};
  const flagText = (f) => (f === 'high' ? '↑ HIGH' : f === 'low' ? '↓ LOW' : f === 'critical' ? '‼ CRITICAL' : '');
  let last = null;
  const blocks = reports.map((r) => {
    const band = r.lab_section !== last ? `<div class="cat">${esc(r.lab_section || 'Others')}</div>` : '';
    last = r.lab_section;
    const comment = r.test_comment ? `<div class="note"><b>${esc(r.test_comment_title || 'Interpretation')}</b>\n${esc(r.test_comment)}</div>` : '';
    return `${band}<h2>${esc(r.service_name)}</h2>
      <table><thead><tr><th>Test</th><th style="text-align:right">Result</th><th>Flag</th><th>Unit</th><th>Reference</th></tr></thead><tbody>
      ${r.results.map((x) => x.heading ? `<tr><td colspan="5" style="font-weight:700;padding-top:10px">${esc(x.name)}</td></tr>` : `<tr><td>${esc(x.name)}${x.method ? `<div style="font-size:11px;color:var(--muted)">Method: ${esc(x.method)}</div>` : ''}</td>
        <td class="num ${x.flag === 'critical' ? 'crit' : ''}">${esc(x.value)}</td><td class="flag ${x.flag === 'critical' ? 'crit' : ''}">${flagText(x.flag)}</td>
        <td>${esc(x.unit)}</td><td>${esc(refOnly(x))}</td></tr>`).join('')}
      </tbody></table>${r.lab_remarks ? `<div class="note"><b>Remarks</b>\n${esc(r.lab_remarks)}</div>` : ''}${comment}`;
  }).join('');
  const signer = first.verified_by_name ? `<div class="sign"><b>${esc(first.verified_by_name)}</b><br>${esc(first.verified_by_qual || '')}${first.verified_by_reg ? ` · Reg ${esc(first.verified_by_reg)}` : ''}</div>` : '';
  document.title = `Laboratory report — ${first.patient_name}`;
  root.innerHTML = `<div class="bar"><b>${esc(s.hospital_name || 'Laboratory report')}</b><button class="btn" id="print">Print / Save as PDF</button></div>
    <div class="keep">${data.expires_at ? `This report stays available online until ${esc(fmtDay(data.expires_at))}. Save a copy for your records.` : ''}</div>
    <div class="sheet">
      <div class="head"><h1>${esc(s.hospital_name || '')}</h1><p>${esc(s.address || '')}${s.phone ? ` · Phone ${esc(s.phone)}` : ''}</p><p><b>LABORATORY REPORT</b></p></div>
      <div class="strip">
        <div><span>Patient</span> <b>${esc(first.patient_name)}</b></div><div><span>UHID</span> ${esc(first.uhid)}</div>
        <div><span>Age / sex</span> ${esc(first.age_years ?? '—')} / ${esc(first.gender || '')}</div><div><span>Reported</span> ${esc(fmt(first.verified_at))}</div>
        <div><span>Referred by</span> ${esc(first.referred_by_name || '—')}</div><div><span>Sample</span> ${esc(first.sample_type || '—')}</div>
      </div>
      ${blocks}${signer}
      <div class="foot">${esc(s.lab_report_disclaimer || 'Results relate only to the sample tested. Please correlate clinically. Not valid for medico-legal purposes.')}</div>
    </div>`;
  document.getElementById('print').onclick = () => window.print();
}
