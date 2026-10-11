/**
 * Daily desk report and cash handover — one for reception, one for pharmacy.
 *
 * Reception sees every OP, IP, lab, imaging and ER bill that was raised or paid
 * that day, line by line (so "cardiac monitor × 3 days" is visible), plus the
 * receipts by mode and the running IP bills. Pharmacy sees what was sold — item,
 * batch, quantity — the receipts by mode, credit dues and every stock movement.
 * At the end of a shift each person declares what they hold by mode (cash, UPI,
 * card, bank, cheque) against what the system recorded, and hands over.
 */
import { Router } from 'express';
import { h, fail, all, get, one, insert, update, emit, nextNo, nowIso, today, money } from '../lib.js';
import { requireAuth, can } from '../auth.js';
import { accrueAll } from '../ipd-charges.js';

export const desk = Router();
const GROUP = { cash: 'cash', upi: 'upi', debit_card: 'card', credit_card: 'card', card: 'card', bank_transfer: 'bank', cheque: 'cheque' };
const GROUPS = ['cash', 'upi', 'card', 'bank', 'cheque'];
const r2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;

function deskFor(req) {
  const d = req.query.desk || req.body?.desk || (['pharmacy', 'store', 'pharmacy_admin'].includes(req.user.role) ? 'pharmacy' : 'reception');
  if (!['reception', 'pharmacy'].includes(d)) fail(400, 'desk_invalid');
  const all_ = can(req.user, 'finance.view') || can(req.user, 'admin.view');
  if (d === 'pharmacy' && !all_ && !can(req.user, 'pharmacy.view')) fail(403, 'forbidden');
  if (d === 'reception' && !all_ && (['pharmacy', 'store', 'pharmacy_admin'].includes(req.user.role) || !can(req.user, 'billing.view'))) fail(403, 'forbidden');
  return d;
}
const typeClause = (d) => (d === 'pharmacy' ? "b.bill_type='PHARM'" : "b.bill_type<>'PHARM'");
const byMode = (rows) => {
  const out = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const r of rows) out[GROUP[r.mode] || r.mode] = r2((out[GROUP[r.mode] || r.mode] || 0) + r.amount);
  return out;
};

function receipts(d, date, userId, throughDate = false) {
  return all(`SELECT p.id, p.receipt_no, p.created_at, p.amount, p.mode, p.reference, p.transaction_id, p.remarks,
      u.name collected_by, p.received_by, b.bill_no, b.bill_type, pt.name patient_name, pt.uhid
    FROM payments p JOIN bills b ON b.id=p.bill_id JOIN patients pt ON pt.id=p.patient_id LEFT JOIN users u ON u.id=p.received_by
    WHERE p.pay_date${throughDate ? '<=' : '='}? AND p.cancelled=0 AND ${typeClause(d)} ${userId ? 'AND p.received_by=?' : ''} ORDER BY p.id`, date, ...(userId ? [userId] : []));
}

/* ------------------------------------------------------------ reception */

function reception(date, userId) {
  accrueAll();
  const rec = receipts('reception', date, userId);
  const bills = all(`SELECT b.*, p.name patient_name, p.uhid, p.mobile, e.encounter_no, e.kind encounter_kind, d.name doctor_name,
      (SELECT a.ip_no FROM admissions a WHERE a.encounter_id=b.encounter_id) ip_no
    FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN encounters e ON e.id=b.encounter_id LEFT JOIN users d ON d.id=coalesce(b.doctor_id,e.doctor_id)
    WHERE b.bill_type<>'PHARM' AND (b.bill_date=? OR b.id IN (SELECT bill_id FROM payments WHERE pay_date=? AND cancelled=0)
      OR b.id IN (SELECT bill_id FROM bill_settlements WHERE date(created_at)=?)
      OR b.id IN (SELECT bill_id FROM bill_items WHERE date(created_at)=?))
    ORDER BY b.bill_type, b.id`, date, date, date, date);
  for (const b of bills) {
    b.lines = all('SELECT description, category, qty, rate, amount, created_at FROM bill_items WHERE bill_id=? ORDER BY id', b.id);
    b.modes = all('SELECT mode, round(sum(amount),2) amount FROM payments WHERE bill_id=? AND cancelled=0 GROUP BY mode', b.id);
    b.settled_by = all("SELECT mode, round(sum(amount),2) amount FROM bill_settlements WHERE bill_id=? AND status<>'cancelled' GROUP BY mode", b.id);
  }
  // Items billed that day, with per-day inpatient charges folded into one line each ("Cardiac monitor / day × 3").
  const items = all(`SELECT coalesce(s.name, CASE WHEN instr(bi.description,' — day ')>0 THEN substr(bi.description,1,instr(bi.description,' — day ')-1) ELSE bi.description END) item,
      bi.category, b.bill_type, count(*) lines, round(sum(bi.qty),2) qty, round(sum(bi.amount),2) amount
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id LEFT JOIN services s ON s.id=bi.service_id
    WHERE b.bill_type<>'PHARM' AND b.status<>'cancelled' AND coalesce(date(bi.created_at), b.bill_date)=?
    GROUP BY item, bi.category, b.bill_type ORDER BY b.bill_type, amount DESC`, date);
  const inpatients = all(`SELECT a.id, a.ip_no, a.status, a.admitted_at, a.discharged_at, p.name patient_name, p.uhid, bd.bed_no, w.name ward,
      bl.id bill_id, bl.bill_no, bl.total, bl.paid, bl.covered_amount, bl.waived_amount, bl.balance
    FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id
    LEFT JOIN bills bl ON bl.id=(SELECT id FROM bills x WHERE x.encounter_id=a.encounter_id AND x.bill_type='IP' AND x.status<>'cancelled' ORDER BY id DESC LIMIT 1)
    WHERE a.status NOT IN ('requested') AND (a.status<>'discharged' OR date(a.discharged_at)=? OR coalesce(bl.balance,0) > 0.5)
    ORDER BY a.status='discharged', a.admitted_at`, date);
  for (const a of inpatients) {
    a.charges = all(`SELECT c.description, c.rate, c.unit, c.status,
        (SELECT count(*) FROM bill_items bi WHERE bi.admission_charge_id=c.id AND bi.charge_cycle IS NOT NULL) days,
        (SELECT coalesce(sum(bi.amount),0) FROM bill_items bi WHERE bi.admission_charge_id=c.id) amount
      FROM admission_charges c WHERE c.admission_id=? ORDER BY c.id`, a.id);
  }
  const settlements = all(`SELECT s.mode, count(*) n, round(sum(s.amount),2) amount FROM bill_settlements s JOIN bills b ON b.id=s.bill_id
    WHERE date(s.created_at)=? AND s.status<>'cancelled' AND b.bill_type<>'PHARM' GROUP BY s.mode`, date);
  const refunds = all(`SELECT r.refund_no, r.amount, r.mode, r.reason, r.created_at, b.bill_no, p.name patient_name, u.name by_name
    FROM refunds r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=r.patient_id LEFT JOIN users u ON u.id=r.created_by
    WHERE date(r.created_at)=? AND b.bill_type<>'PHARM'`, date);
  return { bills, items, inpatients, settlements, refunds, receipts: rec };
}

/* ------------------------------------------------------------- pharmacy */

function pharmacy(date, userId) {
  const rec = receipts('pharmacy', date, userId);
  const sales = all(`SELECT b.bill_no, b.bill_type, b.status bill_status, bi.created_at, p.name patient_name, p.uhid,
      coalesce(m.name, bi.description) item, m.code, mb.batch_no, mb.expiry, mb.location, bi.qty, bi.rate, bi.amount, bi.category,
      (SELECT group_concat(DISTINCT mode) FROM payments x WHERE x.bill_id=b.id AND x.cancelled=0) modes, b.balance
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN patients p ON p.id=b.patient_id
    LEFT JOIN medicine_batches mb ON mb.id=bi.batch_id LEFT JOIN medicines m ON m.id=mb.medicine_id
    WHERE bi.batch_id IS NOT NULL AND b.status<>'cancelled' AND coalesce(date(bi.created_at), b.bill_date)=?
    ORDER BY bi.id`, date);
  const itemMap = new Map(), batchMap = new Map();
  for (const s of sales) {
    const ik = s.item;
    const it = itemMap.get(ik) || { item: s.item, code: s.code, qty: 0, amount: 0, batches: new Set(), op_qty: 0, ip_qty: 0 };
    it.qty = r2(it.qty + s.qty); it.amount = r2(it.amount + s.amount); if (s.batch_no) it.batches.add(s.batch_no);
    if (s.bill_type === 'IP') it.ip_qty = r2(it.ip_qty + s.qty); else it.op_qty = r2(it.op_qty + s.qty);
    itemMap.set(ik, it);
    const bk = `${s.item}|${s.batch_no}|${s.location}`;
    const bt = batchMap.get(bk) || { item: s.item, batch_no: s.batch_no, expiry: s.expiry, location: s.location, qty: 0, amount: 0 };
    bt.qty = r2(bt.qty + s.qty); bt.amount = r2(bt.amount + s.amount);
    batchMap.set(bk, bt);
  }
  const moves = all(`SELECT sm.created_at, sm.move_type, sm.qty, sm.location, sm.balance_after, sm.ref_type, sm.ref_id, sm.reason,
      m.name item, b.batch_no, b.expiry, u.name by_name
    FROM stock_moves sm JOIN medicines m ON m.id=sm.medicine_id LEFT JOIN medicine_batches b ON b.id=sm.batch_id LEFT JOIN users u ON u.id=sm.created_by
    WHERE date(sm.created_at)=? ORDER BY sm.id`, date);
  const transfers = all(`SELECT t.transfer_no, t.source, t.destination, t.status, t.emergency, t.ratified_by, t.requested_at, u.name requested_by_name
    FROM stock_transfers t LEFT JOIN users u ON u.id=t.requested_by
    WHERE date(t.requested_at)=? OR date(t.issued_at)=? OR date(t.received_at)=? ORDER BY t.id`, date, date, date);
  const dues = all(`SELECT b.id, b.bill_no, b.bill_date, b.total, b.paid, b.balance, p.name patient_name, p.uhid, p.mobile
    FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.bill_type='PHARM' AND b.status<>'cancelled' AND b.balance > 0.005 ORDER BY b.bill_date`);
  const returns = all(`SELECT r.return_no, r.qty, r.amount, r.refund_mode, r.reason, r.created_at, b.bill_no, bi.description item
    FROM sales_returns r JOIN bills b ON b.id=r.bill_id JOIN bill_items bi ON bi.id=r.bill_item_id WHERE date(r.created_at)=?`, date);
  const bills = all(`SELECT b.id, b.bill_no, b.bill_type, b.created_at, b.total, b.paid, b.balance, b.status, p.name patient_name, p.uhid
    FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.bill_type='PHARM' AND b.bill_date=? ORDER BY b.id`, date);
  return {
    sales, bills, receipts: rec, dues, returns, moves, transfers,
    items: [...itemMap.values()].map((i) => ({ ...i, batches: [...i.batches].join(', ') })).sort((a, b) => b.amount - a.amount),
    batches: [...batchMap.values()].sort((a, b) => a.item.localeCompare(b.item)),
  };
}

function cashPosition(d, date, userId) {
  const cash = one(`SELECT coalesce(sum(p.amount),0) FROM payments p JOIN bills b ON b.id=p.bill_id WHERE p.pay_date<=? AND p.cancelled=0 AND p.mode='cash' AND ${typeClause(d)} ${userId ? 'AND p.received_by=?' : ''}`,date,...(userId?[userId]:[])) || 0;
  const handovers = all(`SELECT declared,status FROM cash_handovers WHERE desk=? AND handover_date<=? ${userId?'AND user_id=?':''} AND status IN ('submitted','accepted')`,d,date,...(userId?[userId]:[]));
  const accepted = r2(handovers.filter(h=>h.status==='accepted').reduce((s,h)=>s+(JSON.parse(h.declared).cash || 0),0));
  const pending = r2(handovers.filter(h=>h.status==='submitted').reduce((s,h)=>s+(JSON.parse(h.declared).cash || 0),0));
  const moved=userId?one("SELECT coalesce(sum(CASE WHEN to_user=? THEN cash_count ELSE 0 END),0)-coalesce(sum(CASE WHEN from_user=? THEN cash_count ELSE 0 END),0) FROM shift_handovers WHERE desk=? AND shift_date<=? AND status='accepted'",userId,userId,d,date)||0:0;
  return {cash_in_hand:r2(cash+moved-accepted), cash_handed_over:accepted, cash_pending_acceptance:pending};
}

desk.get('/desk/day', requireAuth, h((req) => {
  const d = deskFor(req);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today();
  const userId = req.query.user_id ? +req.query.user_id : null;
  const data = d === 'pharmacy' ? pharmacy(date, userId) : reception(date, userId);
  const modes = byMode(data.receipts);
  const received = r2(data.receipts.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0));
  const refunded = r2(-data.receipts.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0));
  const collectors = all(`SELECT DISTINCT u.id, u.name FROM payments p JOIN bills b ON b.id=p.bill_id JOIN users u ON u.id=p.received_by
    WHERE p.pay_date=? AND p.cancelled=0 AND ${typeClause(d)} ORDER BY u.name`, date);
  const sales_today = one(`SELECT coalesce(sum(b.total),0) FROM bills b WHERE b.bill_date=? AND b.status<>'cancelled' AND ${typeClause(d)}`,date) || 0;
  return { desk: d, date, user_id: userId, sales_today, ...cashPosition(d,date,userId), collectors, modes, received, refunded, net: r2(received - refunded), ...data };
}));

/* -------------------------------------------------------------- handover */
desk.get('/desk/range', requireAuth, h(req => {
  const tomorrow=new Date(`${today()}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const d=deskFor(req), from=String(req.query.from??`${today()} 00:00`).replace('T',' '), to=String(req.query.to??`${tomorrow.toISOString().slice(0,10)} 00:00`).replace('T',' ');
  const valid=v=>{if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v))return false;const n=v.match(/\d+/g).map(Number),d=new Date(n[0],n[1]-1,n[2],n[3],n[4],n[5]||0);return d.getFullYear()===n[0]&&d.getMonth()===n[1]-1&&d.getDate()===n[2]&&d.getHours()===n[3]&&d.getMinutes()===n[4]&&d.getSeconds()===(n[5]||0);};
  if(!valid(from)||!valid(to)||from>=to)fail(400,'valid_time_range_required');
  const uid=req.query.user_id?+req.query.user_id:null;
  const rec=all(`SELECT p.*,u.name collected_by,b.bill_no,pt.name patient_name,pt.uhid FROM payments p JOIN bills b ON b.id=p.bill_id JOIN patients pt ON pt.id=p.patient_id LEFT JOIN users u ON u.id=p.received_by WHERE p.cancelled=0 AND p.created_at>=? AND p.created_at<? AND ${typeClause(d)} ${uid?'AND p.received_by=?':''} ORDER BY p.created_at,p.id`,from,to,...(uid?[uid]:[]));
  const bills=all(`SELECT b.*,p.name patient_name,p.uhid FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.status<>'cancelled' AND b.created_at>=? AND b.created_at<? AND ${typeClause(d)} ORDER BY b.created_at,b.id`,from,to);
  const sales=all(`SELECT i.id,i.created_at,i.description,i.category,i.qty,i.rate,i.amount,b.bill_no,p.name patient_name,mb.batch_no,mb.expiry FROM bill_items i JOIN bills b ON b.id=i.bill_id JOIN patients p ON p.id=b.patient_id LEFT JOIN medicine_batches mb ON mb.id=i.batch_id WHERE b.status<>'cancelled' AND i.created_at>=? AND i.created_at<? AND ${typeClause(d)} ORDER BY i.created_at,i.id`,from,to);
  return {desk:d,from,to,receipts:rec,bills,sales,modes:byMode(rec),net:r2(rec.reduce((s,r)=>s+r.amount,0)),billed:r2(sales.reduce((s,r)=>s+r.amount,0))};
}));

function expectedFor(d, date, userId) {
  const rows = receipts(d, date, userId, true);
  const modes = byMode(rows);
  const prior = all("SELECT expected, retained_cash FROM cash_handovers WHERE desk=? AND handover_date<=? AND user_id=? AND status IN ('submitted','accepted')", d, date, userId);
  for (const row of prior) {
    const expected = JSON.parse(row.expected);
    for (const group of GROUPS) modes[group] = r2((modes[group] || 0) - (expected[group] || 0) + (group === 'cash' ? row.retained_cash || 0 : 0));
  }
  modes.cash=r2((modes.cash||0)+(one("SELECT coalesce(sum(CASE WHEN to_user=? THEN cash_count ELSE 0 END),0)-coalesce(sum(CASE WHEN from_user=? THEN cash_count ELSE 0 END),0) FROM shift_handovers WHERE desk=? AND shift_date<=? AND status='accepted'",userId,userId,d,date)||0));
  modes.cash=r2(modes.cash-(one("SELECT coalesce(sum(cash_count),0) FROM shift_handovers WHERE desk=? AND from_user=? AND shift_date<=? AND status='submitted'",d,userId,date)||0));
  return { modes, receipts: rows.length, total: r2(GROUPS.reduce((sum, group) => sum + modes[group], 0)) };
}

desk.get('/desk/handover', requireAuth, h((req) => {
  const d = deskFor(req);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today();
  const mine = expectedFor(d, date, req.user.id);
  const list = all(`SELECT h.*, u.name user_name, t.name handed_to_name, v.name verified_by_name FROM cash_handovers h
      JOIN users u ON u.id=h.user_id LEFT JOIN users t ON t.id=h.handed_to LEFT JOIN users v ON v.id=h.verified_by
     WHERE (h.desk=? AND h.handover_date=?) OR (h.status='submitted' AND (h.handed_to=? OR ?=1)) ORDER BY h.id DESC`, d, date, req.user.id, can(req.user,'finance.view') ? 1 : 0);
  for (const x of list) { x.expected = JSON.parse(x.expected); x.declared = JSON.parse(x.declared); }
  const receivers = all("SELECT id, name, role FROM users WHERE active=1 AND role IN ('admin','owner') AND id<>? ORDER BY name", req.user.id);
  return { desk: d, date, ...cashPosition(d,date,req.user.id), expected: mine, handovers: list, receivers, pending_count: list.filter(x=>x.status==='submitted').length, can_verify: can(req.user, 'finance.counter') || can(req.user, 'finance.view') };
}));

desk.post('/desk/handover', requireAuth, h((req) => {
  const d = deskFor(req);
  const b = req.body || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today();
  const exp = expectedFor(d, date, req.user.id);
  if (!get("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('admin','owner')", +b.handed_to) || +b.handed_to === req.user.id) fail(400, 'admin_or_owner_receiver_required');
  if (GROUPS.every(group => Math.abs(exp.modes[group] || 0) < 0.005)) fail(409, 'no_unhanded_collection');
  const declared = Object.fromEntries(GROUPS.map((g) => [g, r2(+b.declared?.[g] || 0)]));
  const retained = r2(Number(b.retained_cash || 0));
  if (!Number.isFinite(retained) || retained < 0 || retained > Math.max(0, exp.modes.cash || 0)) fail(400, 'retained_cash_invalid');
  const variance = r2(GROUPS.reduce((s, g) => s + (declared[g] + (g === 'cash' ? retained : 0) - (exp.modes[g] || 0)), 0));
  if (GROUPS.some(g => !Number.isFinite(Number(b.declared?.[g] ?? 0)))) fail(400, 'declared_amount_invalid');
  if(GROUPS.some(g=>declared[g]<0))fail(400,'declared_amount_invalid');
  if (GROUPS.some(g => Math.abs(declared[g] + (g === 'cash' ? retained : 0) - (exp.modes[g] || 0)) >= 0.01) && !String(b.notes || '').trim()) fail(400, 'variance_needs_explanation', { variance });
  const id = insert('cash_handovers', { handover_no: nextNo('handover'), desk: d, user_id: req.user.id, handover_date: date,
    expected: JSON.stringify(exp.modes), declared: JSON.stringify(declared), retained_cash: retained, variance, receipts: exp.receipts,
    handed_to: b.handed_to ? +b.handed_to : null, notes: b.notes || null });
  const row = get('SELECT * FROM cash_handovers WHERE id=?', id);
  emit(req, { topics: ['accounts', 'billing', 'pharmacy'], event: 'handover.submitted', data: row, action: 'handover.submit', entity: 'cash_handovers', entityId: id,
    detail: { before: { expected: exp.modes }, after: { declared, retained_cash:retained, variance }, reason: b.notes, variance } });
  return row;
}));

desk.post('/desk/handover/:id/verify', requireAuth, h((req) => {
  const x = get('SELECT * FROM cash_handovers WHERE id=?', +req.params.id);
  if (!x) fail(404, 'handover_not_found');
  if (x.status !== 'submitted') fail(409, 'already_verified');
  const may = x.handed_to === req.user.id || can(req.user, 'finance.counter') || can(req.user, 'finance.view');
  if (!may || x.user_id === req.user.id) fail(403, 'forbidden');
  const status = req.body?.status === 'disputed' ? 'disputed' : 'accepted';
  if (status === 'disputed' && !String(req.body?.note || '').trim()) fail(400, 'reason_required');
  if(status==='accepted'&&Math.abs(x.variance)>.005&&!String(req.body?.note||'').trim())fail(400,'variance_acceptance_reason_required');
  update('cash_handovers', x.id, { status, verified_by: req.user.id, verified_at: nowIso(), verify_note: req.body?.note || null });
  emit(req, { topics: ['accounts', 'billing', 'pharmacy'], event: 'handover.verified', data: { id: x.id, status }, action: `handover.${status}`,
    entity: 'cash_handovers', entityId: x.id, detail: { before: { status: x.status }, after: { status }, reason: req.body?.note } });
  return { ok: true };
}));

desk.get('/desk/shifts', requireAuth, h(req => {
 const d=deskFor(req);
 const roles=d==='pharmacy'?['pharmacy','pharmacy_admin','store']:['reception','reception_admin','cashier'];
 const receivers=all('SELECT id,name,role FROM users WHERE active=1 AND id<>?',req.user.id).filter(u=>roles.includes(u.role)||['admin','owner'].includes(u.role));
 const list=all(`SELECT s.*,f.name from_name,t.name to_name FROM shift_handovers s JOIN users f ON f.id=s.from_user JOIN users t ON t.id=s.to_user WHERE s.desk=? AND (s.from_user=? OR s.to_user=? OR ?=1) ORDER BY s.id DESC LIMIT 100`,d,req.user.id,req.user.id,can(req.user,'finance.view')?1:0);
 return {receivers,list, ...cashPosition(d,today(),req.user.id), expected:expectedFor(d,today(),req.user.id)};
}));
desk.post('/desk/shifts', requireAuth, h(req => {
 const d=deskFor(req),b=req.body;
 const roles=d==='pharmacy'?['pharmacy','pharmacy_admin','store','admin','owner']:['reception','reception_admin','cashier','admin','owner'];
 const receiver=get('SELECT * FROM users WHERE id=? AND active=1',+b.to_user);
 if (!receiver || receiver.id===req.user.id || !roles.includes(receiver.role)) fail(400,'shift_receiver_required');
 if (!['morning','evening','night'].includes(b.from_shift)||!['morning','evening','night'].includes(b.to_shift)||!String(b.notes||'').trim()) fail(400,'shift_and_notes_required');
 if (!Number.isFinite(+b.cash_count)||+b.cash_count<0) fail(400,'cash_count_invalid');
 const position=cashPosition(d,today(),req.user.id),available=r2(position.cash_in_hand-position.cash_pending_acceptance);
 if(+b.cash_count>Math.max(0,available)+0.005)fail(400,'shift_cash_exceeds_available_drawer',{available});
 if (get("SELECT id FROM shift_handovers WHERE desk=? AND from_user=? AND status='submitted'",d,req.user.id)) fail(409,'shift_handover_pending');
 const id=insert('shift_handovers',{desk:d,shift_date:today(),from_user:req.user.id,to_user:receiver.id,from_shift:b.from_shift,to_shift:b.to_shift,cash_count:+b.cash_count,notes:b.notes.trim()});
 emit(req,{topics:['accounts'],event:'shift.submitted',action:'shift.submit',entity:'shift_handovers',entityId:id,detail:{after:get('SELECT * FROM shift_handovers WHERE id=?',id)}});
 return get('SELECT * FROM shift_handovers WHERE id=?',id);
}));
desk.post('/desk/shifts/:id/accept', requireAuth, h(req => {
 const row=get('SELECT * FROM shift_handovers WHERE id=?',+req.params.id);
 if (!row) fail(404,'shift_not_found');
 if (row.to_user!==req.user.id) fail(403,'only_incoming_staff_can_accept');
 if (row.status!=='submitted') fail(409,'already_accepted');
 const position=cashPosition(row.desk,today(),row.from_user);
 if(row.cash_count>position.cash_in_hand-position.cash_pending_acceptance+0.005)fail(409,'shift_cash_no_longer_available');
 update('shift_handovers',row.id,{status:'accepted',accepted_at:nowIso()});
 emit(req,{topics:['accounts'],event:'shift.accepted',action:'shift.accept',entity:'shift_handovers',entityId:row.id,detail:{before:row,after:get('SELECT * FROM shift_handovers WHERE id=?',row.id)}});
 return {ok:true};
}));

export { money, one };
