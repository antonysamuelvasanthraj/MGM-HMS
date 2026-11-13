import {all,get,insert,run,tx} from './db.js';
import {postVoucher} from './accounting.js';

/** Restore only the unreturned quantity, once per original line, to its source batch. */
export function restoreCancelledBillStock(billId,userId,reason){
 return tx(()=>{
  const bill=get('SELECT * FROM bills WHERE id=?',billId);
  if(!bill||bill.status!=='cancelled')throw Error('Bill must be cancelled before restoring stock');
  const restored=[];
  let cost=0;
  for(const item of all("SELECT * FROM bill_items WHERE bill_id=? AND batch_id IS NOT NULL AND qty>0 AND category IN ('pharmacy','consumable')",billId)){
   if(get("SELECT id FROM stock_moves WHERE ref_type='cancel_bill_item' AND ref_id=?",item.id))continue;
   const qty=Math.max(0,item.qty-(item.returned_qty||0));
   if(!qty)continue;
   const batch=get('SELECT * FROM medicine_batches WHERE id=?',item.batch_id);
   if(!batch)throw Error('Original stock batch missing');
   run('UPDATE medicine_batches SET qty=qty+? WHERE id=?',qty,batch.id);
   const after=get('SELECT qty FROM medicine_batches WHERE id=?',batch.id).qty;
   insert('stock_moves',{medicine_id:batch.medicine_id,batch_id:batch.id,move_type:'return',qty,location:batch.location,balance_after:after,ref_type:'cancel_bill_item',ref_id:item.id,created_by:userId,reason});
   cost+=qty*(item.unit_cost??batch.purchase_rate);
   restored.push({item_id:item.id,batch_id:batch.id,location:batch.location,qty});
  }
  cost=Math.round(cost*100)/100;
  if(cost>0)postVoucher({type:'COGS',source:'bill_cancel_stock',sourceId:billId,narration:`Stock restored on cancellation of ${bill.bill_no}: ${reason}`,lines:[{account:'inventory_pharmacy',debit:cost,segment:'PHARMACY'},{account:'cogs_pharmacy',credit:cost,segment:'PHARMACY'}]});
  return restored;
 });
}
