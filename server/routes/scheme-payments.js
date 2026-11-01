import {takePayment} from '../payments.js';
import {Router} from 'express';
import {requireAuth,can} from '../auth.js';
import {h,fail,all,get,insert,update,tx,money,nowIso,emit,today} from '../lib.js';
import {itemMoney,isClosed} from '../accounting.js';
import {patientLineAmount} from '../payer-lines.js';
import {reversePayerBilling,billCaseToPayer} from '../payer-billing.js';
import {collectionPolicy} from '../collection-policy.js';
export const schemePayments=Router();
const drug=(i,b)=>b.bill_type==='PHARM'||!!i.batch_id||i.revenue_head==='PHARMACY'||['pharmacy','medicine','drug','consumable'].includes(i.category);
const allowed=(u,i,b)=>can(u,'scheme.patient_pay')&&(can(u,'admin.write')||can(u,'insurance.write')||(drug(i,b)?can(u,'pharmacy.dispense'):can(u,'op.collect')));
schemePayments.get('/scheme/patients/:id/lines',requireAuth,h(req=>{
 if(!can(req.user,'scheme.patient_pay')||!can(req.user,'patient.view'))fail(403,'forbidden');
 const lines=[];
 for(const b of all("SELECT * FROM bills WHERE patient_id=? AND payer_type='aarogyasri' AND claim_id IS NOT NULL AND status<>'cancelled' ORDER BY id DESC",+req.params.id)){
  const c=get('SELECT * FROM insurance_claims WHERE id=?',b.claim_id);if(!c?.admission_id)continue;
  for(const i of all('SELECT * FROM bill_items WHERE bill_id=? AND amount>0 AND waiver_of IS NULL AND NOT EXISTS(SELECT 1 FROM bill_items w WHERE w.waiver_of=bill_items.id)',b.id))if(allowed(req.user,i,b))lines.push({id:i.id,bill_id:b.id,bill_no:b.bill_no,description:i.description,total:itemMoney(i).total,patient_amount:patientLineAmount(i),claim_status:c.status,collection_desk:drug(i,b)?'pharmacy':'reception',collectable:Math.max(0,Math.min(patientLineAmount(i)-Number(get('SELECT coalesce(sum(x.amount),0) n FROM scheme_line_collections x JOIN payments p ON p.id=x.payment_id WHERE x.item_id=? AND p.cancelled=0',i.id).n),collectionPolicy(b).patient_due)),...collectionPolicy(b)});
 }
 return {lines};
}));
schemePayments.post('/scheme/items/:id/patient-payment',requireAuth,h(req=>tx(()=>{
 const i=get('SELECT * FROM bill_items WHERE id=?',+req.params.id)||fail(404,'item_not_found'),b=get('SELECT * FROM bills WHERE id=?',i.bill_id);
 if(!allowed(req.user,i,b))fail(403,'forbidden',{need:'scheme.patient_pay'});
 if(b.payer_type!=='aarogyasri'||!b.claim_id)fail(400,'aarogyasri_only');
 const c=get('SELECT * FROM insurance_claims WHERE id=?',b.claim_id);if(!c?.admission_id||['settled','rejected','cancelled'].includes(c.status)||b.status==='cancelled')fail(409,'scheme_case_closed');
 if(isClosed(today())||isClosed(b.bill_date))fail(409,'books_closed');
 const body=req.body||{},key=String(body.request_key||'');if(!/^[\w-]{16,100}$/.test(key))fail(400,'request_key_required');
 const previous=get('SELECT * FROM scheme_patient_permissions WHERE request_key=?',key);if(previous){if(previous.item_id!==i.id||previous.requested_by!==req.user.id)fail(409,'request_key_conflict');return previous;}
 const amount=Number(body.patient_amount),reason=String(body.reason||'').trim(),reference=String(body.authorization_ref||'').trim(),before=patientLineAmount(i);
 if(!Number.isFinite(amount)||amount<0||amount>itemMoney(i).total)fail(400,'patient_amount_invalid');
 if(reason.length<5||reference.length<3)fail(400,'reason_and_authorization_required');
 if(i.amount<=0||i.waiver_of||get('SELECT id FROM bill_items WHERE waiver_of=?',i.id))fail(409,'item_waived');
 if(body.expected_amount===undefined||!Number.isFinite(Number(body.expected_amount))||money(Number(body.expected_amount))!==before)fail(409,'allocation_changed_refresh');
 if(b.paid>0.005&&amount<before)fail(409,'refund_review_required');
 if(get("SELECT id FROM bill_settlements WHERE claim_id=? AND status<>'cancelled' AND settled_amount>0.005",c.id))fail(409,'payer_receipts_require_adjustment');
 reversePayerBilling(req,c.id,'Authorized Aarogyasri patient-pay allocation');update('bill_items',i.id,{patient_pays:amount>0?1:0,patient_pay_amount:money(amount)});
 const id=insert('scheme_patient_permissions',{bill_id:b.id,item_id:i.id,claim_id:c.id,request_key:key,patient_amount:money(amount),previous_amount:before,reason,authorization_ref:reference,requested_by:req.user.id,requested_at:nowIso(),review_status:'pending'});
 billCaseToPayer(req,c.id);
 emit(req,{topics:['insurance','billing','patients','pharmacy'],event:'claim.updated',data:{id:c.id,patient_id:b.patient_id},action:'scheme.patient_payment_permitted',entity:'bill_items',entityId:i.id,detail:{before:{patient_amount:before},after:{patient_amount:money(amount),review_id:id},reason,authorization_ref:reference}});
 return get('SELECT * FROM scheme_patient_permissions WHERE id=?',id);
})));
schemePayments.get('/scheme/payment-reviews',requireAuth,h(req=>{
 if(!can(req.user,'insurance.view'))fail(403,'forbidden');
 return {rows:all(`SELECT r.*,b.bill_no,p.name patient_name,p.uhid,i.description,u.name employee FROM scheme_patient_permissions r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id JOIN bill_items i ON i.id=r.item_id LEFT JOIN users u ON u.id=r.requested_by WHERE r.review_status<>'confirmed' ORDER BY r.id DESC`)};
}));
schemePayments.post('/scheme/payment-reviews/:id/review',requireAuth,h(req=>tx(()=>{
 if(!can(req.user,'insurance.write'))fail(403,'forbidden');const r=get('SELECT * FROM scheme_patient_permissions WHERE id=?',+req.params.id)||fail(404,'review_not_found');if(r.review_status==='confirmed')fail(409,'already_reviewed');
 const status=req.body?.status,note=String(req.body?.note||'').trim();if(!['confirmed','needs_adjustment'].includes(status)||note.length<5)fail(400,'review_note_required');
 update('scheme_patient_permissions',r.id,{review_status:status,reviewed_by:req.user.id,reviewed_at:nowIso(),review_note:note});emit(req,{topics:['insurance','billing'],event:'claim.updated',data:{id:r.claim_id},action:'scheme.patient_payment_reviewed',entity:'scheme_patient_permissions',entityId:r.id,detail:{before:r,after:{status,note},reason:note}});return {ok:true};
})));

schemePayments.post('/scheme/items/:id/collect',requireAuth,h(req=>tx(()=>{
 const i=get('SELECT * FROM bill_items WHERE id=?',+req.params.id)||fail(404,'item_not_found'),b=get('SELECT * FROM bills WHERE id=?',i.bill_id);
 if(!allowed(req.user,i,b)||!can(req.user,'payment.collect'))fail(403,'forbidden');
 if(b.payer_type!=='aarogyasri'||!b.claim_id||b.status==='cancelled')fail(400,'aarogyasri_only');
 if(!get('SELECT admission_id FROM insurance_claims WHERE id=?',b.claim_id)?.admission_id)fail(400,'ipd_required');
 if(i.amount<=0||i.waiver_of||get('SELECT id FROM bill_items WHERE waiver_of=?',i.id))fail(409,'item_waived');
 const key=String(req.body?.request_key||'');if(!/^[\w-]{16,100}$/.test(key))fail(400,'request_key_required');
 const prior=get('SELECT * FROM scheme_line_collections WHERE request_key=?',key);if(prior){if(prior.item_id!==i.id||prior.collected_by!==req.user.id)fail(409,'request_key_conflict');return get('SELECT * FROM payments WHERE id=?',prior.payment_id);}
 const collected=Number(get('SELECT coalesce(sum(x.amount),0) n FROM scheme_line_collections x JOIN payments p ON p.id=x.payment_id WHERE x.item_id=? AND p.cancelled=0',i.id).n);
 const available=money(Math.max(0,Math.min(patientLineAmount(i)-collected,collectionPolicy(b).patient_due,b.balance)));
 const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<=0||money(amount)>available)fail(400,'amount_exceeds_permitted_share',{available});
 const counter=get('SELECT id FROM counters WHERE code=? AND active=1',drug(i,b)?'PHAR':'OPC1')||fail(400,'collection_counter_not_configured');
 const payment=takePayment({...req,user:{...req.user,counter_id:counter.id}},{bill_id:b.id,amount:money(amount),mode:req.body.mode,reference:req.body.reference,transaction_id:key,remarks:'Authorized Aarogyasri line '+i.id,collection_group:key}).payment;
 insert('scheme_line_collections',{item_id:i.id,payment_id:payment.id,collection_desk:drug(i,b)?'pharmacy':'reception',request_key:key,amount:payment.amount,collected_by:req.user.id,created_at:nowIso()});
 emit(req,{topics:['insurance','billing','patients','pharmacy','accounts'],event:'payment.received',data:{id:payment.id,bill_id:b.id,patient_id:b.patient_id},action:'scheme.line_payment_collected',entity:'payments',entityId:payment.id,detail:{after:payment,item_id:i.id,reason:'Collection limited to authorized scheme line patient share'}});
 return payment;
})));
