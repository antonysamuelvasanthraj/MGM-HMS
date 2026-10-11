/**
 * Approval requests. The desk records the request and carries on (the visit is
 * registered, the bill exists); someone with approval rights decides later.
 * Today this covers free visits / free treatment; the approver's decision and
 * reason go to the audit trail, and the request never blocks registration.
 */
import { Router } from 'express';
import { h, fail, all, get, update, emit, nowIso, tx, money, recalcBill, syncEncounterPayment } from '../lib.js';
import { requireAuth, requirePerm, can } from '../auth.js';
import { addSettlement } from '../payments.js';

export const approvals = Router();
const TOPICS = ['billing', 'queue', 'dashboard', 'approvals'];

export function requestFree(req, billId, reason) {
  const bill = get('SELECT * FROM bills WHERE id=?', billId);
  if (!bill || bill.status === 'cancelled') fail(409, 'bill_unavailable');
  if (bill.balance <= 0.005) fail(409, 'nothing_outstanding');
  if (!String(reason || '').trim()) fail(400, 'reason_required');
  update('bills', bill.id, { approval_request: 'free', authorization_reason: String(reason).trim(),
    approval_requested_by: req.user.id, approval_requested_at: nowIso() });
  if (bill.encounter_id) update('encounters', bill.encounter_id, { free_reason: String(reason).trim() });
  return get('SELECT * FROM bills WHERE id=?', bill.id);
}

const pending = () => all(`SELECT b.id, b.bill_no, b.bill_type, b.total, b.paid, b.balance, b.authorization_reason reason,
    b.approval_request kind, b.approval_requested_at requested_at, u.name requested_by_name,
    p.id patient_id, p.name patient_name, p.uhid, p.mobile, p.payer_type,
    e.id encounter_id, e.encounter_no, e.token_no, e.stage, d.name doctor_name, dept.name department_name,
    (SELECT group_concat(description, ', ') FROM bill_items bi WHERE bi.bill_id=b.id) items
  FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN users u ON u.id=b.approval_requested_by
  LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN users d ON d.id=e.doctor_id LEFT JOIN departments dept ON dept.id=e.department_id
  WHERE b.approval_request IS NOT NULL AND b.status<>'cancelled' ORDER BY b.approval_requested_at`);

approvals.get('/approvals', requireAuth, h((req) => {
  if (!can(req.user, 'payment.approve_free') && !can(req.user, 'payment.authorize')) fail(403, 'forbidden');
  return { rows: pending(), can_approve: can(req.user, 'payment.approve_free') };
}));

/** Ask for a bill (or its remaining balance) to be approved as free. */
approvals.post('/approvals/request', requirePerm('payment.collect'), h((req) => {
  const b = req.body || {};
  const bill = requestFree(req, +b.bill_id, b.reason);
  emit(req, { topics: TOPICS, event: 'approval.requested', data: { bill_id: bill.id },
    action: 'approval.request', entity: 'bills', entityId: bill.id,
    detail: { after: { request: 'free', amount: bill.balance }, reason: b.reason } });
  return bill;
}));

approvals.post('/approvals/:billId/approve', requirePerm('payment.approve_free'), h((req) => tx(() => {
  const bill = get('SELECT * FROM bills WHERE id=?', +req.params.billId);
  if (!bill || !bill.approval_request) fail(404, 'no_pending_request');
  const note = String(req.body?.note || '').trim();
  const reason = [bill.authorization_reason, note && `approved: ${note}`].filter(Boolean).join(' — ');
  if (bill.balance > 0.005) addSettlement(req, { bill_id: bill.id, mode: 'free', amount: money(bill.balance), reason });
  update('bills', bill.id, { approval_request: null, authorized_by: req.user.id, authorized_at: nowIso() });
  if (bill.encounter_id) {
    const e = get('SELECT * FROM encounters WHERE id=?', bill.encounter_id);
    if (e.kind !== 'IP' && get("SELECT 1 FROM bills WHERE id=? AND bill_type='OP'", bill.id)) {
      update('encounters', e.id, { payment_status: 'free', free_approved_by: req.user.id, free_reason: bill.authorization_reason,
        stage: e.stage === 'vitals_done' ? 'ready' : e.stage });
    } else syncEncounterPayment(e.id);
  }
  const after = recalcBill(bill.id);
  emit(req, { topics: [...TOPICS, `encounter:${bill.encounter_id}`], event: 'approval.decided', data: { bill_id: bill.id, approved: true },
    action: 'approval.approve', entity: 'bills', entityId: bill.id,
    detail: { before: { balance: bill.balance, request: 'free' }, after: { balance: after.balance, status: after.status }, reason } });
  return { bill: after, rows: pending() };
})));

approvals.post('/approvals/:billId/reject', requirePerm('payment.approve_free'), h((req) => {
  const bill = get('SELECT * FROM bills WHERE id=?', +req.params.billId);
  if (!bill || !bill.approval_request) fail(404, 'no_pending_request');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail(400, 'reason_required');
  update('bills', bill.id, { approval_request: null, authorization_reason: `Free request declined: ${reason}` });
  emit(req, { topics: [...TOPICS, `encounter:${bill.encounter_id}`], event: 'approval.decided', data: { bill_id: bill.id, approved: false },
    action: 'approval.reject', entity: 'bills', entityId: bill.id,
    detail: { before: { request: 'free', reason: bill.authorization_reason }, after: { request: null }, reason } });
  return { rows: pending() };
}));
