import {all,get,insert,update,nextNo,setting,fail,emit} from './lib.js';
import {orderSourceFor} from './operating-mode.js';

/** Link diagnostic charges to real work orders; callers own the transaction. */
export function routeBillDiagnostics(req,billId) {
  const bill=get('SELECT * FROM bills WHERE id=?',billId);
  if(!bill || bill.status==='cancelled')fail(409,'bill_unavailable');
  const diagnosticLines=all("SELECT * FROM bill_items WHERE bill_id=? AND category IN ('lab','imaging') AND waiver_of IS NULL AND qty>0",billId);
  if(diagnosticLines.length && !bill.encounter_id) {
    const doctor=bill.doctor_id?get('SELECT * FROM users WHERE id=?',bill.doctor_id):null;
    const id=insert('encounters',{encounter_no:nextNo('encounter'),patient_id:bill.patient_id,kind:'OP',visit_type:'new',
      department_id:doctor?.department_id || get("SELECT id FROM departments WHERE code='LAB'")?.id || null,doctor_id:doctor?.id || null,
      stage:'services_pending',payment_status:['paid','covered'].includes(bill.status)?'paid':'pending',created_by:req.user.id,
      counter_id:req.user.counter_id || null,remarks:'Diagnostics only — billed at reception (no consultation)'});
    update('bills',billId,{encounter_id:id});bill.encounter_id=id;
    emit(req,{topics:['queue','opd','billing',`patient:${bill.patient_id}`],event:'encounter.created',action:'op.register.diagnostics',entity:'encounters',entityId:id,detail:{before:null,after:{bill_id:billId,encounter_id:id},reason:'Create diagnostic-only visit for billed tests; no consultation charge'}});
  }
  const encounter=bill.encounter_id ? get('SELECT * FROM encounters WHERE id=?',bill.encounter_id) : null;
  const routed=[];
  for(const line of diagnosticLines) {
    if(line.order_id) {
      const existing=get('SELECT * FROM orders WHERE id=?',line.order_id);
      if(!existing || existing.patient_id!==bill.patient_id || (line.service_id && existing.service_id!==line.service_id))fail(409,'diagnostic_order_bill_mismatch');
      if(get('SELECT id FROM bill_items WHERE order_id=? AND id<>? AND bill_id IN (SELECT id FROM bills WHERE status<>?)',existing.id,line.id,'cancelled'))fail(409,'diagnostic_order_already_billed');
      update('orders',existing.id,{billed:1,bill_item_id:line.id});continue;
    }
    const service=line.service_id ? get('SELECT * FROM services WHERE id=?',line.service_id) : null;
    const emergency=encounter?.kind==='EMG' || encounter?.priority==='emergency';
    const released=emergency || encounter?.kind==='IP' || ['paid','covered','free'].includes(bill.status) || bill.total===0 || setting('release_op_rule')==='immediate';
    const id=insert('orders',{
      order_no:nextNo('order'),patient_id:bill.patient_id,encounter_id:bill.encounter_id,
      service_id:line.service_id,category:line.category,label:service?.name || line.description,
      status:released?'ordered':'awaiting_payment',priority:'routine',ordered_by:req.user.id,
      order_source:orderSourceFor(req.user,'paper_prescription'),billed:1,bill_item_id:line.id,
      auth_status:emergency?'emergency_override':['insurance','aarogyasri','corporate','trust'].includes(bill.payer_type)?'pending':'not_required',
      provider_id:service?.provider_id || null,
      sample_id:line.category==='lab'?`S${Date.now()}${line.id}`:null,
      modality:line.category==='imaging'?(service?.name || '').match(/USG|CT|ECG|Echo/i)?.[0]?.toUpperCase() || 'XR':null,
    });
    update('bill_items',line.id,{order_id:id});routed.push(id);
  }
  if(routed.length)emit(req,{topics:['lab','imaging','billing','clinical','dashboard',`patient:${bill.patient_id}`],event:'orders.created',action:'bill.diagnostics.route',entity:'bills',entityId:billId,detail:{before:{unrouted_items:routed.length},after:{order_ids:routed},reason:'Route billed diagnostic services to department worklists'}});
  return {bill_id:billId,order_ids:routed};
}
