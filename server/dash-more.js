/**
 * Dashboards for the insurance / payer desk and for quality. Same rule as the
 * other boards: real figures only, and only what that desk acts on.
 */
import { all, get, one } from './db.js';
import * as M from './metrics.js';

const n = (sql, ...p) => one(sql, ...p) || 0;
const r2 = M.r2;
const STAGES = ['preauth_pending', 'query', 'preauth_approved', 'claim_submitted', 'settled', 'rejected'];
const PAYER_LABEL = { insurance: 'Insurance', aarogyasri: 'Aarogyasri', corporate: 'Corporate', trust: 'Trust' };

/* ------------------------------------------------------- insurance / payer desk */

export function insuranceDash(q) {
  const d = q.to;
  const NOT_CREDIT = "coalesce(c.payer_type,'insurance')<>'credit'";
  const cases = all(`SELECT c.id, c.claim_no, c.status, c.payer_type, c.tpa, c.policy_no, c.estimate, c.approved, c.settled, c.created_at,
      p.name patient_name, p.uhid, a.ip_no, a.status adm_status, pk.name package_name,
      cast(julianday('now','localtime') - julianday(c.created_at) AS int) age_days,
      (SELECT coalesce(sum(b.total),0) FROM bills b WHERE b.claim_id=c.id AND b.status<>'cancelled') bill_total,
      (SELECT coalesce(sum(s.amount - s.settled_amount - s.written_off - s.transferred_to_patient),0) FROM bill_settlements s
        WHERE s.claim_id=c.id AND s.status IN ('open','partially_settled')) payer_owes
    FROM insurance_claims c JOIN patients p ON p.id=c.patient_id LEFT JOIN admissions a ON a.id=c.admission_id
    LEFT JOIN packages pk ON pk.id=c.package_id
    WHERE ${NOT_CREDIT} AND (c.status NOT IN ('settled','rejected') OR date(c.updated_at)=? OR date(c.created_at)=?)
    ORDER BY c.id DESC LIMIT 300`, d, d);
  const open = cases.filter((c) => !['settled', 'rejected'].includes(c.status));
  const rec = M.receivables(d);
  const payerRec = rec.types.filter((t) => PAYER_LABEL[t.key]);
  const received = get(`SELECT coalesce(sum(r.amount),0) v, coalesce(sum(r.disallowed),0) dis FROM settlement_receipts r
    WHERE r.received_on=?`, d);
  const inpatients = all(`SELECT a.id, a.ip_no, a.admitted_at, a.financial_category, p.name patient_name, p.uhid, p.payer_name,
      bd.bed_no, w.name ward, c.claim_no, c.status claim_status,
      cast(julianday('now','localtime') - julianday(a.admitted_at) AS int) + 1 days,
      (SELECT coalesce(sum(b.total),0) FROM bills b WHERE b.encounter_id=a.encounter_id AND b.status<>'cancelled') running
    FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
    LEFT JOIN insurance_claims c ON c.id=(SELECT id FROM insurance_claims x WHERE x.admission_id=a.id ORDER BY id DESC LIMIT 1)
    WHERE a.status NOT IN ('discharged','requested') AND a.financial_category IN ('insurance','aarogyasri','scheme','corporate','trust')
    ORDER BY a.admitted_at`);
  return {
    kpis: {
      open: open.length,
      pending: open.filter((c) => c.status === 'preauth_pending').length,
      query: open.filter((c) => c.status === 'query').length,
      approved: open.filter((c) => c.status === 'preauth_approved').length,
      submitted: open.filter((c) => c.status === 'claim_submitted').length,
      waiting_over_3d: open.filter((c) => ['preauth_pending', 'query'].includes(c.status) && c.age_days >= 3).length,
      inpatients: inpatients.length,
      payer_receivable: r2(payerRec.reduce((s, t) => s + t.outstanding, 0)),
      received_today: r2(received?.v || 0), disallowed_today: r2(received?.dis || 0),
    },
    stages: STAGES.map((s) => ({ key: s, value: cases.filter((c) => c.status === s).length })),
    by_payer: Object.keys(PAYER_LABEL).map((k) => ({ label: PAYER_LABEL[k], value: open.filter((c) => c.payer_type === k).length })),
    worklist: open.filter((c) => ['preauth_pending', 'query'].includes(c.status)).sort((a, b) => b.age_days - a.age_days),
    approved: open.filter((c) => ['preauth_approved', 'claim_submitted'].includes(c.status)),
    inpatients,
    receivables: { types: payerRec, buckets: M.AGE_BUCKETS.map(([k, l]) => ({ key: k, label: l })) },
  };
}

/* ------------------------------------------------------------------ quality */

export function qualityDash(q) {
  const d = q.to;
  const incidents = all(`SELECT i.*, u.name owner_name, r.name reported_by_name,
      cast(julianday('now','localtime') - julianday(i.reported_at) AS int) age_days
    FROM quality_incidents i LEFT JOIN users u ON u.id=i.owner_id LEFT JOIN users r ON r.id=i.reported_by
    ORDER BY i.status='closed', i.reported_at DESC LIMIT 200`);
  const open = incidents.filter((i) => i.status !== 'closed');
  const overdue = open.filter((i) => i.due_date && i.due_date < d);
  return {
    kpis: {
      open: open.length, overdue: overdue.length,
      major: open.filter((i) => ['major', 'severe', 'critical', 'sentinel'].includes(String(i.severity).toLowerCase())).length,
      reported_today: incidents.filter((i) => String(i.reported_at).slice(0, 10) === d).length,
      closed_30d: n("SELECT count(*) FROM quality_incidents WHERE status='closed' AND date(closed_at) >= date(?, '-30 day')", d),
      changes_today: n('SELECT count(*) FROM audit_log WHERE date(at)=?', d),
      post_close_edits_30d: n(`SELECT count(*) FROM audit_log WHERE detail LIKE '%"post_close_edit":true%' AND date(at) >= date(?, '-30 day')`, d),
      overrides_30d: n(`SELECT count(*) FROM audit_log WHERE (detail LIKE '%"forced":true%' OR action IN ('day.reopen','bill.cancel','payment.cancel')) AND date(at) >= date(?, '-30 day')`, d),
    },
    by_status: ['open', 'investigating', 'capa', 'closed'].map((s) => ({ label: s, value: incidents.filter((i) => i.status === s).length })),
    by_kind: ['incident', 'near_miss', 'complaint', 'audit_finding'].map((k) => ({ label: k.replace('_', ' '), value: open.filter((i) => i.kind === k).length })),
    open: open.slice(0, 60), overdue,
    sensitive: all(`SELECT at, action, entity, entity_id, user_name, reason FROM audit_log
      WHERE (detail LIKE '%"post_close_edit":true%' OR action IN ('day.reopen','bill.cancel','payment.cancel','refund.create','bill.discount','bill.item.waive'))
        AND date(at) >= date(?, '-7 day') ORDER BY id DESC LIMIT 40`, d),
  };
}
