import {get,insert,run,tx,today} from './db.js';
import {postStockAdjustment} from './accounting.js';
export function disposeStock({batchId,qty,expectedQty,reason,userId,expiredOnly=false,refType,refId}){
 return tx(()=>{
  const fail=(http,message)=>{throw Object.assign(new Error(message),{http});};
  const batch=get('SELECT * FROM medicine_batches WHERE id=?',batchId);
  if(!batch)fail(404,'batch_not_found');
  if(!String(reason||'').trim())fail(400,'reason_required');
  if(!Number.isFinite(qty)||qty<=0||qty>batch.qty)fail(400,'return_qty_invalid');
  if(expectedQty!==undefined&&Number(expectedQty)!==batch.qty)fail(409,'stock_changed_since_review');
  if(expiredOnly&&batch.expiry>today())fail(400,'batch_not_expired');
  run('UPDATE medicine_batches SET qty=qty-? WHERE id=?',qty,batch.id);
  const moveId=insert('stock_moves',{medicine_id:batch.medicine_id,batch_id:batch.id,location:batch.location,move_type:expiredOnly?'expiry':'disposal',qty:-qty,balance_after:batch.qty-qty,reason,created_by:userId,ref_type:refType,ref_id:refId});
  postStockAdjustment({moveId,value:-Math.round(qty*batch.purchase_rate*100)/100,narration:`${expiredOnly?'Expired':'Unusable'} stock disposed: ${batch.batch_no} @ ${batch.location}: ${reason}`});
  return {move_id:moveId,batch_id:batch.id,qty:batch.qty-qty,disposed_qty:qty,location:batch.location};
 });
}
