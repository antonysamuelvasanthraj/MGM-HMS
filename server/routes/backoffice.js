import { Router } from 'express';
import { collectionPolicy } from '../collection-policy.js';
import {
  h, fail, all, get, one, insert, update, run, nextNo, today, where, emit, num, money,
  setting, nowIso, dateAgo, tx,
} from '../lib.js';
import { syncClaimToBills, releaseApprovedOrders, isApprovedStage } from '../payer-cases.js';
import { billCaseToPayer, reversePayerBilling } from '../payer-billing.js';
import { ROLE_DEPARTMENTS, STAFF_TEAMS, requireAuth, requirePerm, hashPassword, publicUser, ROLE_PERMS, can, DEFAULT_ROLE_PERMS, ROLE_LABELS, PERMISSION_CATALOG, loadRolePermissions } from '../auth.js';
import { postExpenseAccrual, postExpensePayment, reverseSource } from '../accounting.js';

export const backoffice = Router();

// Recurring clinic sessions feed the appointment day's availability board.
backoffice.get('/admin/clinic-sessions', requirePerm('admin.view'), h(() => ({
  doctors: all("SELECT id,name FROM users WHERE role='doctor' AND active=1 ORDER BY name"),
  rows: all('SELECT s.*,u.name doctor_name FROM doctor_schedules s JOIN users u ON u.id=s.doctor_id ORDER BY s.weekday,s.start_time,u.name'),
})));
function saveClinicSession(req) {
  const b=req.body, id=req.params.id ? +req.params.id : null;
  const before=id ? get('SELECT * FROM doctor_schedules WHERE id=?',id) : null;
  if(id&&!before) fail(404,'clinic_session_not_found');
  const doctor=get("SELECT id FROM users WHERE id=? AND role='doctor' AND active=1",+b.doctor_id);
  const weekday=+b.weekday,slot=+b.slot_minutes,max=+b.max_tokens;
  const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
  if(!doctor||!Number.isInteger(weekday)||weekday<0||weekday>6||!validTime(b.start_time)||!validTime(b.end_time)||b.start_time>=b.end_time||!Number.isInteger(slot)||slot<5||slot>120||!Number.isInteger(max)||max<1||max>1000) fail(400,'valid_clinic_session_required');
  if(get('SELECT id FROM doctor_schedules WHERE doctor_id=? AND weekday=? AND start_time<? AND end_time>? AND id<>?',doctor.id,weekday,b.end_time,b.start_time,id||0)) fail(409,'clinic_session_overlap');
  const values={doctor_id:doctor.id,weekday,start_time:b.start_time,end_time:b.end_time,slot_minutes:slot,max_tokens:max,room:String(b.room||'').trim().slice(0,100)};
  const savedId=id ? (update('doctor_schedules',id,values),id) : insert('doctor_schedules',values);
  const row=get('SELECT * FROM doctor_schedules WHERE id=?',savedId);
  emit(req,{topics:['admin','appointments','queue'],event:'clinic.session.saved',action:'clinic.session.save',entity:'doctor_schedules',entityId:savedId,detail:{before,after:row}});
  return row;
}
backoffice.post('/admin/clinic-sessions',requirePerm('admin.view'),h(req=>tx(()=>saveClinicSession(req))));
backoffice.patch('/admin/clinic-sessions/:id',requirePerm('admin.view'),h(req=>tx(()=>saveClinicSession(req))));

const range = (req) => ({
  from: req.query.from || dateAgo(29),
  to: req.query.to || today(),
});

/* ----------------------------------------------------------------- finance */

/**
 * Compatibility view over the double-entry journal for older screens. The full
 * accounts API lives in routes/accounts.js; nothing here writes a ledger row.
 */
backoffice.get('/finance/ledger', requirePerm('finance.view'), h((req) => {
  const { from, to } = range(req);
  const extra = ['v.voucher_date BETWEEN ? AND ?'], args = [from, to];
  if (req.query.account && req.query.account !== 'all') { extra.push('a.name = ?'); args.push(req.query.account); }
  if (req.query.q) { extra.push('(v.narration LIKE ? OR v.voucher_no LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l); }
  const rows = all(`SELECT l.id, v.voucher_date entry_date, v.voucher_no, a.name account, l.segment cost_centre,
                           coalesce(l.memo, v.narration) narration, l.debit, l.credit, v.source, v.source_id
                      FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
                     WHERE ${extra.join(' AND ')} ORDER BY v.voucher_date DESC, l.id DESC LIMIT 500`, ...args);
  let bal = 0;
  const withBalance = rows.slice().reverse().map((r) => { bal += r.debit - r.credit; return { ...r, running: money(bal) }; }).reverse();
  const balanceOf = (key) => money(one(`SELECT coalesce(sum(l.debit-l.credit),0) FROM journal_lines l JOIN accounts a ON a.id=l.account_id
                                          WHERE a.system_key=?`, key) || 0);
  return {
    from, to, rows: withBalance,
    accounts: all(`SELECT a.name account, count(*) n, round(sum(l.debit),2) debit, round(sum(l.credit),2) credit
                     FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id
                    WHERE v.voucher_date BETWEEN ? AND ? GROUP BY a.id ORDER BY debit+credit DESC`, from, to),
    summary: {
      debit: money(rows.reduce((s, r) => s + r.debit, 0)),
      credit: money(rows.reduce((s, r) => s + r.credit, 0)),
      cash_in_hand: balanceOf('cash'),
      bank: balanceOf('bank'),
    },
  };
}));

backoffice.post('/finance/ledger', requirePerm('finance.write'), h(() => {
  fail(400, 'use_journal_voucher', { hint: 'Post a balanced journal at POST /api/accounts/journals' });
}));

const EXPENSE_MODES = ['cash', 'bank_transfer', 'upi', 'cheque', 'debit_card', 'credit_card', 'bank'];

backoffice.get('/finance/expense-accounts', requirePerm('expense.view'), h(() => all(
  `SELECT id, code, name FROM accounts WHERE type='expense' AND is_group=0 AND active=1
      AND coalesce(subtype,'') NOT IN ('cogs') ORDER BY code`)));

backoffice.get('/finance/expenses', requirePerm('expense.view'), h((req) => {
  const { from, to } = range(req);
  const extra = ['e.spent_on BETWEEN ? AND ?'], args = [from, to];
  if (req.query.status && req.query.status !== 'all') { extra.push('e.status = ?'); args.push(req.query.status); }
  if (req.query.head && req.query.head !== 'all') { extra.push('e.head = ?'); args.push(req.query.head); }
  if (req.query.department && req.query.department !== 'all') { extra.push('e.department = ?'); args.push(req.query.department); }
  if (req.query.q) { extra.push('(e.vendor LIKE ? OR e.head LIKE ? OR e.voucher_no LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l); }
  const rows = all(`SELECT e.*, u.name created_by_name, a.name approved_by_name, ac.name account_name FROM expenses e
                      LEFT JOIN users u ON u.id=e.created_by LEFT JOIN users a ON a.id=e.approved_by
                      LEFT JOIN accounts ac ON ac.id=e.account_id
                     WHERE ${extra.join(' AND ')} ORDER BY e.spent_on DESC, e.id DESC LIMIT 400`, ...args);
  const live = rows.filter((r) => r.status !== 'cancelled' && r.status !== 'rejected');
  return {
    from, to, rows,
    byHead: all(`SELECT head, count(*) n, round(sum(amount),2) total FROM expenses
                  WHERE spent_on BETWEEN ? AND ? AND status NOT IN ('cancelled','rejected') GROUP BY head ORDER BY total DESC`, from, to),
    summary: {
      total: money(live.reduce((s, r) => s + r.amount, 0)),
      paid: money(live.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0)),
      pending: money(live.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0)),
      approved: money(live.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amount, 0)),
      count: rows.length,
    },
  };
}));

backoffice.post('/finance/expenses', requirePerm('expense.write'), h((req) => {
  const b = req.body || {};
  const amount = money(num(b.amount));
  if (!(amount > 0)) fail(400, 'amount_invalid');
  if (!String(b.head || '').trim() && !b.account_id) fail(400, 'head_required');
  const account = b.account_id ? get("SELECT * FROM accounts WHERE id=? AND type IN ('expense','asset') AND is_group=0", num(b.account_id)) : null;
  if (b.account_id && !account) fail(400, 'expense_account_invalid');
  if (b.mode && !EXPENSE_MODES.includes(b.mode)) fail(400, 'payment_mode_invalid');
  const id = insert('expenses', {
    voucher_no: nextNo('voucher'), head: String(b.head || account?.name).trim(), vendor: b.vendor,
    account_id: account?.id || null, department: b.department || null, reference: b.reference || null,
    amount, mode: b.mode || 'cash', spent_on: b.spent_on || today(),
    status: 'pending', created_by: req.user.id, remarks: b.remarks,
  });
  const row = get('SELECT * FROM expenses WHERE id=?', id);
  emit(req, { topics: ['finance', 'dashboard'], event: 'expense.created', data: row,
    action: 'expense.create', entity: 'expenses', entityId: id, detail: { after: row } });
  return row;
}));

/**
 * pending → approved (books the expense against Accrued Expenses)
 *         → paid     (clears the accrual from cash/bank)
 * pending/approved → rejected | cancelled (reverses anything posted).
 */
backoffice.patch('/finance/expenses/:id', requirePerm('expense.write'), h((req) => tx(() => {
  const id = +req.params.id;
  const before = get('SELECT * FROM expenses WHERE id=?', id);
  if (!before) fail(404, 'expense_not_found');
  if (['paid', 'cancelled', 'rejected'].includes(before.status)) fail(409, `expense_already_${before.status}`);
  const patch = {};
  for (const k of ['amount', 'head', 'vendor', 'mode', 'remarks', 'spent_on', 'account_id', 'department', 'reference']) if (k in req.body) patch[k] = req.body[k];
  if (before.status !== 'pending' && Object.keys(patch).some((k) => ['amount', 'account_id', 'head', 'spent_on'].includes(k))) {
    fail(409, 'approved_expense_is_locked');
  }
  if ('amount' in patch) { patch.amount = money(num(patch.amount)); if (!(patch.amount > 0)) fail(400, 'amount_invalid'); }
  if (patch.mode && !EXPENSE_MODES.includes(patch.mode)) fail(400, 'payment_mode_invalid');
  const to = req.body.status;
  const reason = String(req.body.reason || '').trim();
  if (to && !['approved', 'paid', 'rejected', 'cancelled'].includes(to)) fail(400, 'status_invalid');
  if (to && to !== before.status) {
    if (['approved', 'paid'].includes(to) && !can(req.user, 'expense.approve') && !can(req.user, 'finance.write')) fail(403, 'forbidden', { need: 'expense.approve' });
    if (['rejected', 'cancelled'].includes(to) && !reason) fail(400, 'reason_required');
    patch.status = to;
    if (to === 'approved' || to === 'paid') patch.approved_by = before.approved_by || req.user.id;
  }
  update('expenses', id, patch);
  const row = get('SELECT * FROM expenses WHERE id=?', id);
  const accrued = get("SELECT id FROM journal_vouchers WHERE source='expense' AND source_id=? AND status='posted' AND reversal_of IS NULL", id);
  if ((row.status === 'approved' || row.status === 'paid') && !accrued) postExpenseAccrual(row);
  if (row.status === 'paid') postExpensePayment(row);
  if (['rejected', 'cancelled'].includes(row.status) && accrued) reverseSource('expense', id, reason);
  emit(req, { topics: ['finance', 'accounts', 'dashboard'], event: 'expense.updated', data: row,
    action: patch.status ? `expense.${patch.status}` : 'expense.update', entity: 'expenses', entityId: id,
    detail: { before: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), after: patch, reason } });
  return row;
})));

/* --------------------------------------------------------------- insurance */

backoffice.get('/insurance/claims', requirePerm('insurance.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.status && req.query.status !== 'all') { extra.push('c.status = ?'); args.push(req.query.status); }
  if (req.query.tpa && req.query.tpa !== 'all') { extra.push('c.tpa = ?'); args.push(req.query.tpa); }
  if (req.query.payer_type && req.query.payer_type !== 'all') { extra.push('c.payer_type = ?'); args.push(req.query.payer_type); }
  if (req.query.q) { extra.push('(c.claim_no LIKE ? OR p.name LIKE ? OR p.uhid LIKE ? OR c.policy_no LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l, l); }
  extra.push("coalesce(c.payer_type,'insurance')<>'credit'");
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  const rows = all(
    `SELECT c.*, p.uhid, p.name patient_name, p.mobile, a.ip_no, a.admitted_at, a.discharged_at, pk.name package_name, pk.price package_price, pk.los_days package_los,
            (SELECT coalesce(sum(total),0) FROM bills b WHERE b.status<>'cancelled' AND (b.claim_id=c.id OR b.encounter_id IN (c.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)))) bill_total,
            (SELECT coalesce(sum(balance),0) FROM bills b WHERE b.status<>'cancelled' AND (b.claim_id=c.id OR b.encounter_id IN (c.encounter_id, (SELECT ec.encounter_id FROM emergency_cases ec WHERE ec.id=a.emergency_id)))) balance,
            (SELECT group_concat(DISTINCT b.bill_type) FROM bills b WHERE b.claim_id=c.id AND b.status<>'cancelled') departments,
            cast(julianday('now','localtime') - julianday(c.created_at) AS int) age_days
       FROM insurance_claims c JOIN patients p ON p.id=c.patient_id
       LEFT JOIN admissions a ON a.id=c.admission_id LEFT JOIN packages pk ON pk.id=c.package_id ${w} ORDER BY c.id DESC LIMIT 300`, ...args);
  for (const r of rows) {
    try { r.documents = JSON.parse(r.documents || '[]'); } catch { r.documents = []; }
    const policies = all("SELECT * FROM bills WHERE claim_id=? AND status<>'cancelled'", r.id).map(collectionPolicy);
    r.patient_due = money(policies.reduce((n, b) => n + b.patient_due, 0));
    r.payer_outstanding = money(policies.reduce((n, b) => n + b.payer_pending + b.payer_receivable, 0));
  }
  return {
    rows,
    tpas: all('SELECT tpa, count(*) n, round(sum(estimate),2) estimate, round(sum(settled),2) settled FROM insurance_claims GROUP BY tpa ORDER BY n DESC'),
    payers: all('SELECT payer_type, count(*) n, sum(status NOT IN (\'settled\',\'rejected\')) open FROM insurance_claims GROUP BY payer_type'),
    summary: {
      open: rows.filter((r) => !['settled', 'rejected'].includes(r.status)).length,
      estimate: money(rows.reduce((s, r) => s + r.estimate, 0)),
      approved: money(rows.reduce((s, r) => s + r.approved, 0)),
      settled: money(rows.reduce((s, r) => s + r.settled, 0)),
      disallowed: money(rows.reduce((s, r) => s + r.disallowed, 0)),
      rejected: rows.filter((r) => r.status === 'rejected').length,
    },
  };
}));

function resolveCasePackage(packageId, payerId) {
  if (!packageId || !payerId) return packageId;
  const pkg = get('SELECT * FROM packages WHERE id=? AND active=1', num(packageId));
  if (!pkg || pkg.payer_id) return packageId;
  const agreement = get('SELECT id FROM packages WHERE hospital_package_id=? AND payer_id=? AND active=1 ORDER BY id LIMIT 1', pkg.id, num(payerId));
  return agreement?.id || packageId;
}

backoffice.post('/insurance/claims', requirePerm('insurance.write'), h((req) => {
  const b = req.body;
  if(b.status==='settled')fail(409,'settlement_requires_recorded_payments');
  if(!get('SELECT id FROM patients WHERE id=?',num(b.patient_id)))fail(400,'patient_required');
  if(b.payer_id){const payer=get('SELECT * FROM payers WHERE id=? AND active=1',num(b.payer_id));if(!payer)fail(400,'payer_invalid');b.payer_type=payer.payer_type==='tpa'?'insurance':payer.payer_type;b.tpa=payer.name;}
  if (b.package_id) b.package_id = resolveCasePackage(b.package_id, b.payer_id);
  if(b.package_id){const pkg=get('SELECT * FROM packages WHERE id=? AND active=1',num(b.package_id));if(!pkg || (pkg.payer_id && pkg.payer_id!==num(b.payer_id)))fail(400,'package_payer_mismatch');}
  if (b.payer_id) { const py = get('SELECT name FROM payers WHERE id=?', num(b.payer_id)); if (py) b.tpa = py.name; }
  if (b.package_id && !(num(b.estimate, 0) > 0)) { const pk = get('SELECT price FROM packages WHERE id=?', num(b.package_id)); if (pk) b.estimate = pk.price; }
  if (!String(b.tpa || '').trim()) fail(400, 'payer_required');
  const id = insert('insurance_claims', {
    claim_no: nextNo('claim'), patient_id: num(b.patient_id), encounter_id: b.encounter_id || null,
    admission_id: b.admission_id || null, tpa: b.tpa, policy_no: b.policy_no, payer_type: b.payer_type || 'insurance',
    payer_id: b.payer_id ? num(b.payer_id) : null, package_id: b.package_id ? num(b.package_id) : null,
    claim_type: b.claim_type || 'cashless', estimate: money(num(b.estimate, 0)),
    status: b.status || 'preauth_pending', stage_note: b.stage_note,
    documents: JSON.stringify(b.documents || []),
  });
  const row = get('SELECT * FROM insurance_claims WHERE id=?', id);
  emit(req, { topics: ['insurance', 'dashboard'], event: 'claim.created', data: row,
    action: 'claim.create', entity: 'insurance_claims', entityId: id, detail: b });
  return row;
}));

/** Every bill line on a case, with whether the patient pays it (exclusion). */
backoffice.get('/insurance/claims/:id/collection-summary', requirePerm('insurance.view'), h(req=>{
 const c=get('SELECT * FROM insurance_claims WHERE id=?',+req.params.id)||fail(404,'claim_not_found');
 const bills=all("SELECT * FROM bills WHERE claim_id=? AND status<>'cancelled' ORDER BY id",c.id).map(b=>({...b,...collectionPolicy(b),collection_desk:b.bill_type==='PHARM'?'pharmacy':'reception'}));
 return {claim:c,bills,patient_due:money(bills.reduce((n,b)=>n+b.patient_due,0)),payer_outstanding:money(bills.reduce((n,b)=>n+b.payer_pending+b.payer_receivable,0))};
}));

backoffice.get('/insurance/claims/:id/lines', requirePerm('insurance.view'), h((req) => {
  const c = get('SELECT * FROM insurance_claims WHERE id=?', +req.params.id) || fail(404, 'claim_not_found');
  return all(`SELECT bi.id, bi.description, bi.category, bi.qty, bi.rate, bi.amount, bi.patient_pays, bi.patient_pay_amount, b.bill_no, b.bill_type, b.balance bill_balance
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE b.claim_id=? AND b.status<>'cancelled' AND bi.amount>0 ORDER BY b.id, bi.id`, c.id);
}));

/** Mark which lines the patient pays (package exclusions, items the payer does not cover). Applies to amounts not yet moved to the payer. */
backoffice.put('/insurance/claims/:id/exclusions', requirePerm('insurance.write'), h((req) => tx(() => {
  const c = get('SELECT * FROM insurance_claims WHERE id=?', +req.params.id) || fail(404, 'claim_not_found');
  const ids = new Set((req.body?.item_ids || []).map(Number));
  const lines = all("SELECT bi.id, bi.patient_pays, bi.patient_pay_amount,bi.amount,bi.description FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE b.claim_id=? AND b.status<>'cancelled' AND bi.amount>0", c.id);
  const allocations=req.body?.allocations;
  if(allocations&&!Array.isArray(allocations))fail(400,'allocations_invalid');
  if(allocations&&!String(req.body.reason||'').trim())fail(400,'reason_required');
  const selected=new Map();
  for(const allocation of allocations||[]){const line=lines.find(l=>l.id===+allocation.item_id),amount=Number(allocation.patient_amount);if(!line||selected.has(line.id)||!Number.isFinite(amount)||amount<0||amount>line.amount)fail(400,'allocation_invalid');selected.set(line.id,money(amount));}
  if([...ids].some(id=>!lines.some(l=>l.id===id)))fail(400,'allocation_invalid');
  const changed = [];
  if(get("SELECT 1 FROM bill_settlements WHERE claim_id=? AND status<>'cancelled' AND settled_amount>0.005",c.id))fail(409,'payer_terms_already_collected');
  reversePayerBilling(req,c.id,'Patient-pay exclusions updated');
  for (const l of lines) {
    const amount=allocations?(selected.has(l.id)?selected.get(l.id):null):null;
    const want=allocations?(amount>0?1:0):(ids.has(l.id)?1:0);
    if(want!==l.patient_pays||amount!==l.patient_pay_amount){update('bill_items',l.id,{patient_pays:want,patient_pay_amount:amount});changed.push({item:l.description,before:{patient_pays:l.patient_pays,patient_amount:l.patient_pay_amount},after:{patient_pays:want,patient_amount:amount}});}
  }
  emit(req, { topics: ['insurance', 'billing'], event: 'claim.updated', data: { id: c.id }, action: 'claim.exclusions', entity: 'insurance_claims', entityId: c.id,
    detail: { after: changed, reason: req.body?.reason } });
  billCaseToPayer(req,c.id);
  return { changed: changed.length };
})));

backoffice.patch('/insurance/claims/:id', requirePerm('insurance.write'), h((req) => tx(() => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['status', 'estimate', 'approved', 'settled', 'disallowed', 'stage_note', 'tpa', 'policy_no', 'claim_type', 'payer_type', 'payer_id', 'package_id', 'copay_amount']) if (k in req.body) patch[k] = req.body[k];
  if ('copay_amount' in patch) { if (!Number.isFinite(+patch.copay_amount) || +patch.copay_amount<0) fail(400,'copay_invalid'); patch.copay_amount=money(+patch.copay_amount); }
  for (const k of ['payer_id', 'package_id']) if (k in patch) patch[k] = patch[k] ? num(patch[k]) : null;
  // choosing a payer from the master sets the payer name; choosing its package fills an empty estimate
  if (patch.payer_id) { const py = get('SELECT name, payer_type FROM payers WHERE id=?', patch.payer_id); if (py) patch.tpa = py.name; }
  if (patch.package_id && !(num(patch.estimate, 0) > 0)) { const pk = get('SELECT price FROM packages WHERE id=?', patch.package_id); if (pk) patch.estimate = pk.price; }
  if (req.body.documents) patch.documents = JSON.stringify(req.body.documents);
  if (patch.status === 'claim_submitted') patch.submitted_at = nowIso();
  if (patch.status === 'settled') patch.settled_at = nowIso();
  patch.updated_at = nowIso();
  const before = get('SELECT * FROM insurance_claims WHERE id=?', id) || fail(404, 'claim_not_found');
  // an approved amount entered on a case still "pending" is the approval: move the stage so bills, gates and discharge follow
  if (num(patch.approved, 0) > 0 && ['draft', 'preauth_pending'].includes(patch.status ?? before.status)) {
    patch.status = 'preauth_approved';
    patch.stage_note = patch.stage_note || `Approved amount ₹${money(num(patch.approved))} entered — stage moved to pre-auth approved`;
  }
  if(('settled' in patch&&money(num(patch.settled))!==money(before.settled))||('disallowed' in patch&&money(num(patch.disallowed))!==money(before.disallowed)))fail(409,'record_actual_payer_receipt');
  if(patch.status==='settled'&&before.status!=='settled')fail(409,'settlement_requires_recorded_payments');
  if (patch.payer_id) {
    const payer=get('SELECT * FROM payers WHERE id=? AND active=1',patch.payer_id);
    if (!payer) fail(400,'payer_invalid');
    patch.payer_type=payer.payer_type==='tpa'?'insurance':payer.payer_type;
    patch.tpa=payer.name;
  }
  if (patch.package_id) patch.package_id = resolveCasePackage(patch.package_id, 'payer_id' in patch ? patch.payer_id : before.payer_id);
  if (patch.package_id && !(num(req.body.estimate, 0) > 0)) patch.estimate = get('SELECT price FROM packages WHERE id=?', patch.package_id)?.price ?? patch.estimate;
  const pkgId='package_id' in patch?patch.package_id:before.package_id;
  if(pkgId){const pkg=get('SELECT * FROM packages WHERE id=? AND active=1',pkgId);if(!pkg|| (pkg.payer_id && pkg.payer_id!==(+patch.payer_id || before.payer_id)))fail(400,'package_payer_mismatch'); if((patch.copay_amount ?? before.copay_amount)>pkg.price)fail(400,'copay_exceeds_package');}
  const changedTerms=['payer_id','package_id','approved','copay_amount'].some(k=>k in patch && String(patch[k] ?? '')!==String(before[k] ?? ''));
  if(changedTerms){
    if(get("SELECT 1 FROM bill_settlements WHERE claim_id=? AND status<>'cancelled' AND settled_amount>0.005",id))fail(409,'payer_terms_already_collected');
    reversePayerBilling(req,id,'Payer terms updated');
  }
  update('insurance_claims', id, patch);
  if(patch.payer_id){
    run("UPDATE bills SET payer_type=? WHERE claim_id=? AND status<>'cancelled'",patch.payer_type,id);
    if(before.admission_id)update('admissions',before.admission_id,{financial_category:patch.payer_type});
    update('patients',before.patient_id,{payer_id:patch.payer_id,payer_name:patch.tpa,payer_type:patch.payer_type});
  }
  syncClaimToBills(id);
  const released = releaseApprovedOrders(id);
  const moved = billCaseToPayer(req, id);
  // back from approved to query / rejected: entries the payer has not paid return to the patient's balance
  const reversed = isApprovedStage(before.status) && !isApprovedStage(get('SELECT status FROM insurance_claims WHERE id=?', id).status)
    ? reversePayerBilling(req, id, `Case ${before.claim_no} moved back to ${patch.status}${patch.stage_note ? `: ${patch.stage_note}` : ''}`) : [];
  const row = get('SELECT * FROM insurance_claims WHERE id=?', id);
  emit(req, { topics: ['insurance', 'billing', 'dashboard'], event: 'claim.updated', data: row,
    action: 'claim.update', entity: 'insurance_claims', entityId: id,
    detail: { before: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), after: patch, released_orders: released.length || undefined,
      billed_to_payer: moved.length ? moved : undefined, reversed: reversed.length ? reversed : undefined, reason: patch.stage_note } });
  if (released.length) {
    emit(req, { topics: ['lab', 'imaging', 'queue', 'billing', 'dashboard'], event: 'order.updated', data: { ids: released, claim_id: id },
      action: 'order.release', entity: 'insurance_claims', entityId: id,
      detail: { before: { status: 'awaiting_payment' }, after: { status: 'ordered' }, orders: released, reason: `Released by approved payer case ${row.claim_no}` } });
  }
  return { ...row, released_orders: released.length, billed_to_payer: moved.filter((m) => m.kind === 'payer').reduce((s, m) => s + m.amount, 0),
    package_adjustment: moved.filter((m) => m.kind === 'package_adjustment').reduce((s, m) => s + m.amount, 0),
    bills_moved: moved.length, reversed: reversed.length };
})));

/* Reports live in routes/accounts.js (report centre) and dashboards.js. */




/* ------------------------------------------------------------- admin users */

function staffAccess(req, write = false, target = null, role = null) {
  if (can(req.user, write ? 'admin.write' : 'admin.view')) return;
  const team = STAFF_TEAMS[req.user.role];
  if (!can(req.user, 'staff.manage') || !team) fail(403, 'forbidden');
  if (write && ((target && !team.includes(target.role)) || (role && !team.includes(role)))) fail(403, 'staff_outside_department');
}
function validateStaffDepartment(role, department) {
  if (role === 'doctor') {
    if (!get("SELECT id FROM departments WHERE id=? AND active=1 AND kind='clinical'", department || 0)) fail(400,'doctor_specialty_required');
    return department;
  }
  const codes = ROLE_DEPARTMENTS[role];
  if (!codes) return department || null;
  const allowed = all('SELECT id,code FROM departments WHERE active=1').filter(d => codes.includes(d.code));
  if (department && !allowed.some(d => d.id === +department)) fail(400,'department_does_not_match_role');
  return department || allowed[0]?.id || null;
}
backoffice.get('/admin/users', requireAuth, h((req) => {
  staffAccess(req);
  const rows = all(
  `SELECT u.id, u.staff_code, u.username, u.name, u.role, u.designation, u.qualification,
          u.department_id, u.reg_no, u.op_fee, u.followup_fee, u.followup_days, u.mobile, u.email, u.active,
          d.name dept_name,
          (SELECT count(*) FROM sessions s WHERE s.user_id=u.id) sessions,
          (SELECT max(last_seen) FROM sessions s WHERE s.user_id=u.id) last_seen
     FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.role, u.name`);
  return can(req.user, 'admin.view') ? rows : rows.filter(u => STAFF_TEAMS[req.user.role].includes(u.role) || u.id === req.user.id);
}));

function validateStaffFees(values) {
  for (const k of ['op_fee', 'followup_fee', 'followup_days']) if (k in values) {
    const value = Number(values[k]);
    if (values[k] === '' || !Number.isFinite(value) || value < 0 || (k === 'followup_days' && !Number.isInteger(value))) fail(400, k + '_invalid');
    values[k] = k === 'followup_days' ? value : money(value);
  }
}

backoffice.post('/admin/users', requireAuth, h((req) => {
  const b = req.body;
  staffAccess(req, true, null, b.role || 'reception');
  validateStaffFees(b);
  b.department_id = validateStaffDepartment(b.role || 'reception', b.department_id);
  if (!b.username || !b.name) fail(400, 'username_and_name_required');
  if (get('SELECT 1 FROM users WHERE lower(username)=lower(?)', b.username)) fail(409, 'username_taken');
  if (b.role && !ROLE_PERMS[b.role]) fail(400, 'role_unknown');
  if (b.role === 'admin' && req.user.role !== 'admin') fail(403, 'only_admin_can_create_admin');
  const id = insert('users', {
    staff_code: b.staff_code || `STF${Date.now().toString().slice(-5)}`,
    username: b.username, password_hash: hashPassword(b.password || 'surely'),
    name: b.name, role: b.role || 'reception', designation: b.designation,
    qualification: b.qualification, department_id: b.department_id || null, reg_no: b.reg_no,
    op_fee: money(num(b.op_fee, 0)), followup_fee: money(num(b.followup_fee, 0)),
    followup_days: num(b.followup_days, 7), mobile: b.mobile, email: b.email,
  });
  const row = get('SELECT * FROM users WHERE id=?', id);
  emit(req, { topics: ['admin'], event: 'user.saved', data: publicUser(row),
    action: 'user.create', entity: 'users', entityId: id, detail: { username: b.username, role: b.role } });
  return publicUser(row);
}));

backoffice.patch('/admin/users/:id', requireAuth, h((req) => {
  const id = +req.params.id;
  const existing = get('SELECT * FROM users WHERE id=?', id);
  if (!existing) fail(404, 'user_not_found');
  staffAccess(req, true, existing, req.body.role || existing.role);
  if ('role' in req.body || 'department_id' in req.body) req.body.department_id = validateStaffDepartment(req.body.role || existing.role, req.body.department_id ?? (req.body.role && req.body.role !== existing.role ? null : existing.department_id));
  const patch = {};
  for (const k of ['name', 'role', 'designation', 'qualification', 'department_id', 'reg_no',
    'op_fee', 'followup_fee', 'followup_days', 'mobile', 'email', 'active']) if (k in req.body) patch[k] = req.body[k];
  validateStaffFees(patch);
  if (req.body.password) patch.password_hash = hashPassword(req.body.password);
  if (patch.role && !ROLE_PERMS[patch.role]) fail(400, 'role_unknown');
  if (patch.role === 'admin' && req.user.role !== 'admin') fail(403, 'only_admin_can_create_admin');
  if (id === req.user.id && ('role' in patch || patch.active === 0 || patch.active === false)) fail(409, 'cannot_change_own_role_or_disable_self');
  update('users', id, patch);
  const row = get('SELECT * FROM users WHERE id=?', id);
  emit(req, { topics: ['admin', 'system'], event: 'user.saved', data: publicUser(row),
    action: 'user.update', entity: 'users', entityId: id,
    detail: Object.keys(patch).reduce((o, k) => (k === 'password_hash' ? { ...o, password: '***' } : { ...o, [k]: patch[k] }), {}) });
  return publicUser(row);
}));

/* ------------------------------------------------------ roles & permissions */

const roleView = () => Object.keys(ROLE_PERMS).map((role) => ({
  role, department_codes: ROLE_DEPARTMENTS[role] || null, label: ROLE_LABELS[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  perms: ROLE_PERMS[role], defaults: DEFAULT_ROLE_PERMS[role] || null,
  custom: !DEFAULT_ROLE_PERMS[role], locked: role === 'admin',
  changed: !!DEFAULT_ROLE_PERMS[role] && JSON.stringify([...ROLE_PERMS[role]].sort()) !== JSON.stringify([...DEFAULT_ROLE_PERMS[role]].sort()),
  users: one('SELECT count(*) FROM users WHERE role=? AND active=1', role) || 0,
}));

backoffice.get('/admin/roles', requireAuth, h(req => { staffAccess(req); return { roles: can(req.user, 'admin.view') ? roleView() : roleView().filter(r => STAFF_TEAMS[req.user.role].includes(r.role)), catalog: can(req.user, 'admin.view') ? PERMISSION_CATALOG : [] }; }));

const validPerms = new Set(PERMISSION_CATALOG.flatMap(([, list]) => list.map(([k]) => k)));
function cleanPerms(list) {
  const out = [...new Set((Array.isArray(list) ? list : []).map(String))];
  const bad = out.filter((p) => !validPerms.has(p) && !/^[a-z_]+\.(\*|[a-z_]+)$/.test(p));
  if (bad.length) fail(400, 'unknown_permission', { permissions: bad });
  if (out.includes('*')) fail(400, 'full_access_is_admin_only');
  return out;
}

/** Only an administrator changes what a role may do. The admin role itself never changes. */
backoffice.put('/admin/roles/:role', requirePerm('admin.write'), h((req) => {
  if (req.user.role !== 'admin') fail(403, 'only_admin_edits_roles');
  const role = req.params.role;
  if (role === 'admin') fail(409, 'admin_role_is_fixed');
  if (!ROLE_PERMS[role]) fail(404, 'role_unknown');
  const perms = cleanPerms(req.body?.perms);
  const before = ROLE_PERMS[role];
  const label = req.body?.label ? String(req.body.label).trim().slice(0, 40) : (ROLE_LABELS[role] || null);
  run(`INSERT INTO role_permissions (role, label, perms, custom, updated_by, updated_at) VALUES (?,?,?,?,?,datetime('now','localtime'))
       ON CONFLICT(role) DO UPDATE SET label=excluded.label, perms=excluded.perms, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    role, label, JSON.stringify(perms), DEFAULT_ROLE_PERMS[role] ? 0 : 1, req.user.id);
  loadRolePermissions();
  emit(req, { topics: ['admin', 'system'], event: 'roles.changed', data: { role },
    action: 'role.update', entity: 'role_permissions', entityId: null,
    detail: { before: { role, perms: before }, after: { role, perms, label }, reason: req.body?.reason,
      added: perms.filter((p) => !before.includes(p)), removed: before.filter((p) => !perms.includes(p)) } });
  return { roles: roleView(), catalog: PERMISSION_CATALOG };
}));

backoffice.post('/admin/roles', requirePerm('admin.write'), h((req) => {
  if (req.user.role !== 'admin') fail(403, 'only_admin_edits_roles');
  const role = String(req.body?.role || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(role)) fail(400, 'role_name_invalid');
  if (ROLE_PERMS[role]) fail(409, 'role_exists');
  const perms = req.body?.copy_from && ROLE_PERMS[req.body.copy_from] && req.body.copy_from !== 'admin' ? [...ROLE_PERMS[req.body.copy_from]] : cleanPerms(req.body?.perms || ['dash.work']);
  run(`INSERT INTO role_permissions (role, label, perms, custom, updated_by) VALUES (?,?,?,1,?)`, role, String(req.body?.label || role).slice(0, 40), JSON.stringify(perms), req.user.id);
  loadRolePermissions();
  emit(req, { topics: ['admin'], event: 'roles.changed', data: { role }, action: 'role.create', entity: 'role_permissions', entityId: null,
    detail: { after: { role, perms, copy_from: req.body?.copy_from } } });
  return { roles: roleView(), catalog: PERMISSION_CATALOG };
}));

backoffice.post('/admin/roles/:role/reset', requirePerm('admin.write'), h((req) => {
  if (req.user.role !== 'admin') fail(403, 'only_admin_edits_roles');
  const role = req.params.role;
  if (!DEFAULT_ROLE_PERMS[role] || role === 'admin') fail(409, 'nothing_to_reset');
  const before = ROLE_PERMS[role];
  run('DELETE FROM role_permissions WHERE role=?', role);
  loadRolePermissions();
  emit(req, { topics: ['admin', 'system'], event: 'roles.changed', data: { role }, action: 'role.reset', entity: 'role_permissions', entityId: null,
    detail: { before: { role, perms: before }, after: { role, perms: ROLE_PERMS[role] } } });
  return { roles: roleView(), catalog: PERMISSION_CATALOG };
}));

backoffice.delete('/admin/roles/:role', requirePerm('admin.write'), h((req) => {
  if (req.user.role !== 'admin') fail(403, 'only_admin_edits_roles');
  const role = req.params.role;
  if (DEFAULT_ROLE_PERMS[role]) fail(409, 'built_in_role');
  if (one('SELECT count(*) FROM users WHERE role=?', role)) fail(409, 'role_has_users');
  run('DELETE FROM role_permissions WHERE role=?', role);
  loadRolePermissions();
  emit(req, { topics: ['admin'], event: 'roles.changed', data: { role }, action: 'role.delete', entity: 'role_permissions', entityId: null, detail: { before: { role } } });
  return { roles: roleView(), catalog: PERMISSION_CATALOG };
}));

backoffice.get('/admin/access/me', requireAuth, h((req) => ({
  user: req.user,
  perms: ROLE_PERMS[req.user.role] || [],
  allRoles: ROLE_PERMS,
  sessions: all('SELECT token, created_at, last_seen, agent, ip FROM sessions WHERE user_id=?', req.user.id)
    .map((s) => ({ ...s, token: s.token.slice(0, 8) + '…' })),
  recent: all('SELECT * FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 40', req.user.id),
})));

/* ------------------------------------------------------- roster/attendance */

/**
 * Whose roster and attendance a login works with:
 *   all  — administrators, HR (roster.write) and management (owner / accounts, read-only for payroll)
 *   team — an in-charge (staff.manage): their own team (STAFF_TEAMS) and themselves
 *   self — everyone else: only their own roster and attendance
 * Editing: administrators and HR for anyone; an in-charge for their team; staff never edit rosters.
 */
function attendanceScope(user) {
  const editAll = can(user, 'admin.write') || can(user, 'roster.write');
  if (can(user, 'admin.view') || can(user, 'roster.write') || can(user, 'dash.owner')) return { level: 'all', ids: null, editAll, team: null };
  const team = can(user, 'staff.manage') ? (STAFF_TEAMS[user.role] || []) : [];
  if (team.length) {
    const ids = all(`SELECT id FROM users WHERE role IN (${team.map(() => '?').join(',')}) OR id=?`, ...team, user.id).map((r) => r.id);
    return { level: 'team', ids, editAll: false, team };
  }
  return { level: 'self', ids: [user.id], editAll: false, team: null };
}
const canEditRoster = (sc, userId) => sc.editAll || (sc.level === 'team' && sc.ids.includes(userId));
/** Duty units for one staff member: their own department's units (a pharmacist gets pharmacy units, a nurse nursing units and wards …). */
const ROLE_UNITS = {
  nurse: ['OPD', 'ER', 'ICU', 'OT', '@wards'], nursing_incharge: ['OPD', 'ER', 'ICU', 'OT', '@wards'],
  reception: ['OPD', 'ER'], cashier: ['OPD', 'ER'], reception_admin: ['OPD', 'ER'],
  pharmacy: ['Central store', 'OP pharmacy', 'IP pharmacy'], store: ['Central store', 'OP pharmacy', 'IP pharmacy'], pharmacy_admin: ['Central store', 'OP pharmacy', 'IP pharmacy'],
  lab: ['Sample collection'], lab_admin: ['Sample collection'], radiology: [], imaging_admin: [],
  cleaning: ['OPD', 'ER', 'ICU', 'OT', '@wards'], cleaning_incharge: ['OPD', 'ER', 'ICU', 'OT', '@wards'],
  doctor: ['OPD', 'ER', 'ICU', 'OT', '@wards'],
};
function unitsForUser(u) {
  if (!u) return [];
  const wards = () => all('SELECT name FROM wards ORDER BY name').map((w) => w.name);
  const codes = ROLE_DEPARTMENTS[u.role] || [];
  const depts = codes.length ? all(`SELECT name FROM departments WHERE active=1 AND code IN (${codes.map(() => '?').join(',')}) ORDER BY name`, ...codes).map((d) => d.name) : [];
  const own = u.department_id ? get('SELECT name FROM departments WHERE id=?', u.department_id)?.name : null;
  const extra = (ROLE_UNITS[u.role] || []).flatMap((x) => (x === '@wards' ? wards() : [x]));
  const out = [...new Set([...(own ? [own] : []), ...depts, ...extra])];
  return out.length ? out : ['Administration'];
}
/** Every unit the login could assign (used for the old single list). */
function rosterUnits(sc) {
  const users = sc.ids ? all(`SELECT id, role, department_id FROM users WHERE id IN (${sc.ids.map(() => '?').join(',')})`, ...sc.ids) : all('SELECT id, role, department_id FROM users WHERE active=1');
  return [...new Set(users.flatMap(unitsForUser))];
}
const SHIFT_KINDS = ['morning', 'evening', 'night', 'general', 'off', 'leave', 'od'];
const DAY_STATUS = ['present', 'half', 'late', 'absent', 'leave', 'od'];

/**
 * Roster & attendance. Every login sees every department (read-only) so desks can coordinate —
 * who is on duty, where, and who has not come in. Editing stays with the person's in-charge,
 * HR and the Medical Superintendent (attendanceScope). Remarks are shown only to those who
 * may edit that person, and to the person themself.
 */
backoffice.get('/admin/roster', requireAuth, h((req) => {
  const from = req.query.from || today();
  const to = req.query.to || dateAgo(-6);
  const sc = attendanceScope(req.user);
  const d = today();
  const dept = req.query.department_id ? num(req.query.department_id) : null;
  const everyone = all(`SELECT u.id, u.name, u.role, u.designation, u.department_id, dp.name dept_name FROM users u
    LEFT JOIN departments dp ON dp.id=u.department_id WHERE u.active=1 ORDER BY dp.name, u.name`);
  const staff = dept ? everyone.filter((u) => u.department_id === dept) : everyone;
  const ids = staff.map((u) => u.id);
  const only = (col) => (ids.length ? `AND ${col} IN (${ids.map(() => '?').join(',')})` : 'AND 0');
  const seesNote = (uid) => uid === req.user.id || canEditRoster(sc, uid);
  const editable = staff.filter((u) => canEditRoster(sc, u.id)).map((u) => u.id);
  const attendance = all(`SELECT a.*, u.name, u.role, dp.name dept_name FROM attendance a JOIN users u ON u.id=a.user_id
      LEFT JOIN departments dp ON dp.id=u.department_id
     WHERE a.duty_date BETWEEN ? AND ? ${only('a.user_id')} ORDER BY a.duty_date DESC, u.name`, from, to, ...ids)
    .map((r) => (seesNote(r.user_id) ? r : Object.assign({}, r, { note: null })));
  const rosterToday = new Map(all(`SELECT * FROM roster WHERE duty_date=? ${only('user_id')}`, d, ...ids).map((r) => [r.user_id, r]));
  const dayToday = new Map(all(`SELECT * FROM attendance WHERE duty_date=? ${only('user_id')}`, d, ...ids).map((r) => [r.user_id, r]));
  return {
    from, to, scope: sc.level, view: 'all',
    editable_ids: editable,
    my_team_ids: sc.level === 'team' ? sc.ids : [],
    units_by_user: Object.fromEntries(staff.filter((u) => canEditRoster(sc, u.id)).map((u) => [u.id, unitsForUser(u)])),
    can_mark_others: sc.editAll,
    units: rosterUnits(sc),
    departments: [...new Map(everyone.filter((u) => u.department_id).map((u) => [u.department_id, { id: u.department_id, name: u.dept_name }])).values()],
    staff,
    rows: all(`SELECT r.*, u.name, u.role, u.designation, dp.name dept_name FROM roster r
                 JOIN users u ON u.id=r.user_id LEFT JOIN departments dp ON dp.id=u.department_id
                WHERE r.duty_date BETWEEN ? AND ? ${only('r.user_id')} ORDER BY u.name, r.duty_date`, from, to, ...ids),
    attendance,
    // today's on-duty board for every department
    today: staff.map((u) => {
      const r = rosterToday.get(u.id), a = dayToday.get(u.id);
      return { id: u.id, name: u.name, role: u.role, designation: u.designation, dept_name: u.dept_name || 'Other',
        shift: r?.shift || null, unit: r?.unit || null, status: a?.status || null, in_at: a?.in_at || null, out_at: a?.out_at || null,
        note: a && seesNote(u.id) ? a.note : null };
    }),
    summary: {
      staff: staff.length,
      on_duty: one(`SELECT count(*) FROM roster WHERE duty_date=? AND shift NOT IN ('off','leave') ${only('user_id')}`, d, ...ids) || 0,
      present: one(`SELECT count(*) FROM attendance WHERE duty_date=? AND status IN ('present','late','half','od') ${only('user_id')}`, d, ...ids) || 0,
      in_now: one(`SELECT count(*) FROM attendance WHERE duty_date=? AND in_at IS NOT NULL AND out_at IS NULL ${only('user_id')}`, d, ...ids) || 0,
      absent: one(`SELECT count(*) FROM attendance WHERE duty_date=? AND status='absent' ${only('user_id')}`, d, ...ids) || 0,
      leave: one(`SELECT count(*) FROM attendance WHERE duty_date=? AND status='leave' ${only('user_id')}`, d, ...ids) || 0,
      late: one(`SELECT count(*) FROM attendance WHERE duty_date=? AND status='late' ${only('user_id')}`, d, ...ids) || 0,
    },
  };
}));

backoffice.post('/admin/roster', requireAuth, h((req) => {
  const b = req.body;
  const sc = attendanceScope(req.user);
  if (!canEditRoster(sc, num(b.user_id))) fail(403, sc.level === 'team' ? 'staff_outside_department' : 'forbidden');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.duty_date || '') || !SHIFT_KINDS.includes(b.shift)) fail(400, 'valid_date_and_shift_required');
  const target = get('SELECT id, role, department_id FROM users WHERE id=? AND active=1', num(b.user_id));
  if (!target) fail(400, 'active_staff_required');
  // a unit must belong to that staff member's own department (a pharmacist is rostered to pharmacy units only)
  if (b.unit && !['off', 'leave'].includes(b.shift) && !unitsForUser(target).includes(b.unit)) fail(400, 'unit_outside_department');
  const ex = get('SELECT * FROM roster WHERE user_id=? AND duty_date=?', num(b.user_id), b.duty_date);
  const id = ex ? (update('roster', ex.id, { shift: b.shift, unit: b.unit }), ex.id)
    : insert('roster', { user_id: num(b.user_id), duty_date: b.duty_date, shift: b.shift, unit: b.unit });
  emit(req, { topics: ['admin'], event: 'roster.saved', data: get('SELECT * FROM roster WHERE id=?', id),
    action: 'roster.save', entity: 'roster', entityId: id,
    detail: { before: ex ? { shift: ex.shift, unit: ex.unit } : null, after: { user_id: num(b.user_id), duty_date: b.duty_date, shift: b.shift, unit: b.unit } } });
  return get('SELECT * FROM roster WHERE id=?', id);
}));

/**
 * HR / administrators (anyone) and in-charges (their own team) mark a day by hand: present (full day), half day, late, absent, leave, or on outside duty
 * (hospital work elsewhere — a camp, training, court for an MLC …), with a remark. Punch times are kept.
 */
backoffice.post('/admin/attendance/mark', requireAuth, h((req) => {
  const b = req.body || {};
  const uid = num(b.user_id);
  // HR / administrators for anyone; an in-charge for their own team
  if (!canEditRoster(attendanceScope(req.user), uid)) fail(403, 'staff_outside_department');
  if (!get('SELECT id FROM users WHERE id=?', uid)) fail(400, 'staff_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.duty_date || '') || b.duty_date > today()) fail(400, 'past_or_today_only');
  const status = String(b.status || '');
  const note = String(b.note || '').trim() || null;
  const ex = get('SELECT * FROM attendance WHERE user_id=? AND duty_date=?', uid, b.duty_date);
  if (status === 'clear') {
    if (!ex) return { ok: true };
    if (ex.in_at) fail(409, 'has_punches_cannot_clear');
    run('DELETE FROM attendance WHERE id=?', ex.id);
    emit(req, { topics: ['admin'], event: 'attendance.punch', data: { id: ex.id }, action: 'attendance.clear', entity: 'attendance', entityId: ex.id, detail: { before: ex, after: null, reason: note } });
    return { ok: true };
  }
  if (!DAY_STATUS.includes(status)) fail(400, 'status_invalid');
  if (['absent', 'leave', 'od', 'half'].includes(status) && !note && status !== 'absent') fail(400, 'reason_required');
  const hours = ex?.hours ?? ({ present: 8, late: 8, half: 4, od: 8 }[status] || 0);
  const fields = { status, note, hours, marked_by: req.user.id, marked_at: nowIso() };
  const id = ex ? (update('attendance', ex.id, fields), ex.id) : insert('attendance', { user_id: uid, duty_date: b.duty_date, ...fields });
  const row = get('SELECT * FROM attendance WHERE id=?', id);
  emit(req, { topics: ['admin'], event: 'attendance.punch', data: row, action: 'attendance.mark', entity: 'attendance', entityId: id,
    detail: { before: ex ? { status: ex.status, note: ex.note } : null, after: { status, note }, reason: note } });
  return row;
}));

/** Punch in / out: your own attendance. Only administrators and HR may record it for someone else. */
backoffice.post('/admin/attendance/punch', requireAuth, h((req) => {
  const uid = num(req.body?.user_id, req.user.id);
  if (uid !== req.user.id && !attendanceScope(req.user).editAll) fail(403, 'punch_own_attendance_only');
  const d = today();
  const ex = get('SELECT * FROM attendance WHERE user_id=? AND duty_date=?', uid, d);
  const stamp = nowIso();
  let id;
  if (!ex) id = insert('attendance', { user_id: uid, duty_date: d, in_at: stamp, status: 'present' });
  // a day already marked by hand (no punch-in yet): the first punch is the arrival, not a departure
  else if (!ex.in_at) { update('attendance', ex.id, { in_at: stamp, out_at: null, hours: null }); id = ex.id; }
  else { update('attendance', ex.id, { out_at: stamp, hours: Math.max(0, +((new Date(stamp.replace(' ', 'T')) - new Date(ex.in_at.replace(' ', 'T'))) / 36e5).toFixed(2)) }); id = ex.id; }
  const row = get('SELECT * FROM attendance WHERE id=?', id);
  emit(req, { topics: ['admin'], event: 'attendance.punch', data: row,
    action: 'attendance.punch', entity: 'attendance', entityId: id, detail: { before: ex ? { in_at: ex.in_at, out_at: ex.out_at } : null, after: row, for_user: uid !== req.user.id ? uid : undefined } });
  return row;
}));

/* ---------------------------------------------------------------- quality */

backoffice.get('/quality', requirePerm('quality.view'), h((req) => {
  const extra = [], args = [];
  if (req.query.status && req.query.status !== 'all') { extra.push('q.status = ?'); args.push(req.query.status); }
  if (req.query.kind && req.query.kind !== 'all') { extra.push('q.kind = ?'); args.push(req.query.kind); }
  const w = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
  const rows = all(`SELECT q.*, o.name owner_name, r.name reported_by_name FROM quality_incidents q
                      LEFT JOIN users o ON o.id=q.owner_id LEFT JOIN users r ON r.id=q.reported_by
                      ${w} ORDER BY q.id DESC LIMIT 300`, ...args);
  return {
    rows,
    counts: {
      open: rows.filter((r) => r.status !== 'closed').length,
      major: rows.filter((r) => r.severity === 'major').length,
      overdue: rows.filter((r) => r.status !== 'closed' && r.due_date && r.due_date < today()).length,
      closed30: one(`SELECT count(*) FROM quality_incidents WHERE status='closed' AND date(closed_at)>=date('now','localtime','-30 day')`) || 0,
    },
    byArea: all('SELECT area, count(*) n FROM quality_incidents GROUP BY area ORDER BY n DESC'),
    byClause: all('SELECT nabh_clause, count(*) n FROM quality_incidents GROUP BY nabh_clause ORDER BY n DESC'),
  };
}));

backoffice.post('/quality', requirePerm('quality.write'), h((req) => {
  const b = req.body;
  const id = insert('quality_incidents', {
    ref_no: nextNo('incident'), kind: b.kind || 'incident', severity: b.severity || 'minor',
    area: b.area, title: b.title, detail: b.detail, nabh_clause: b.nabh_clause,
    owner_id: b.owner_id || req.user.id, reported_by: req.user.id, due_date: b.due_date,
  });
  const row = get('SELECT * FROM quality_incidents WHERE id=?', id);
  emit(req, { topics: ['quality', 'dashboard'], event: 'quality.created', data: row,
    action: 'quality.create', entity: 'quality_incidents', entityId: id, detail: b });
  return row;
}));

backoffice.patch('/quality/:id', requirePerm('quality.write'), h((req) => {
  const id = +req.params.id;
  const patch = {};
  for (const k of ['status', 'severity', 'detail', 'owner_id', 'due_date', 'nabh_clause', 'title', 'area']) if (k in req.body) patch[k] = req.body[k];
  if (patch.status === 'closed') patch.closed_at = nowIso();
  update('quality_incidents', id, patch);
  const row = get('SELECT * FROM quality_incidents WHERE id=?', id);
  emit(req, { topics: ['quality'], event: 'quality.updated', data: row,
    action: 'quality.update', entity: 'quality_incidents', entityId: id, detail: patch });
  return row;
}));

/* -------------------------------------------------------------- local sync */

backoffice.get('/sync', requireAuth, h((req) => ({
  rows: all(`SELECT * FROM sync_queue ORDER BY id DESC LIMIT 200`),
  counts: {
    queued: one("SELECT count(*) FROM sync_queue WHERE status='queued'") || 0,
    failed: one("SELECT count(*) FROM sync_queue WHERE status='failed'") || 0,
    synced: one("SELECT count(*) FROM sync_queue WHERE status='synced'") || 0,
    today: one(`SELECT count(*) FROM sync_queue WHERE date(queued_at)=date('now','localtime')`) || 0,
  },
  node: {
    lan_ip: setting('lan_ip'), cloud_endpoint: setting('cloud_endpoint'),
    hospital: setting('hospital_name'), campus: setting('campus'),
    uptime_s: Math.round(process.uptime()),
    db_size_kb: 0,
  },
  byEntity: all('SELECT entity, status, count(*) n FROM sync_queue GROUP BY entity, status'),
})));

/** A cloud receiver is not bundled. Never claim local records were delivered. */
backoffice.post('/sync/flush', requirePerm('admin.view'), h(() => {
  fail(503, 'cloud_sync_unavailable', { detail: 'Cloud delivery is not configured in this local model. Records remain queued; export the queue for review.' });
}));

backoffice.post('/sync/retry/:id', requirePerm('admin.view'), h((req) => {
  const id = +req.params.id;
  const existing = get('SELECT * FROM sync_queue WHERE id=?', id);
  if (!existing) fail(404, 'sync_record_not_found');
  if (existing.status === 'synced') fail(409, 'already_synced');
  update('sync_queue', id, { status: 'queued', last_error: null });
  const row = get('SELECT * FROM sync_queue WHERE id=?', id);
  emit(req, { topics: ['system'], event: 'sync.updated', data: row,
    action: 'sync.retry', entity: 'sync_queue', entityId: id });
  return row;
}));

/* ------------------------------------------------------------- demo utils */
