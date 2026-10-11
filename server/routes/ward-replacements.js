import {Router} from 'express';
import {requireAuth,can} from '../auth.js';
import {h,fail,all,get,insert,update,tx,emit,money,nowIso,today} from '../lib.js';
import {dispense} from './pharmacy.js';
import {postVoucher,reverseSource} from '../accounting.js';
import {billNewToPayer} from '../payer-billing.js';
import {activeAssignment,applyPackage} from '../packages.js';
import {collectionPolicy} from '../collection-policy.js';

export const wardReplacements=Router();
const locations=['ER','ICU','OT'];
const mayRecord=u=>can(u,'nursing.write')||can(u,'emergency.treat')||can(u,'ipd.indent');
const mayView=u=>mayRecord(u)||can(u,'pharmacy.view')||can(u,'inventory.view');
const topics=['pharmacy','inventory','ipd','billing','dashboard'];
function view(id){
 const r=get(`SELECT r.*,p.name patient_name,p.uhid,e.encounter_no,a.ip_no FROM ward_replacements r JOIN patients p ON p.id=r.patient_id LEFT JOIN encounters e ON e.id=r.encounter_id LEFT JOIN admissions a ON a.id=r.admission_id WHERE r.id=?`,id)||fail(404,'replacement_not_found');
 r.usage=all(`SELECT u.*,b.medicine_id,b.batch_no,b.expiry,m.name medicine_name FROM ward_replacement_usage u JOIN medicine_batches b ON b.id=u.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE u.replacement_id=?`,id);
 r.supplies=all(`SELECT s.*,i.batch_id,b.batch_no,b.expiry,b.medicine_id,m.name medicine_name,bl.id bill_id,bl.bill_no,bl.total,bl.balance FROM ward_replacement_supply s JOIN bill_items i ON i.id=s.bill_item_id JOIN bills bl ON bl.id=i.bill_id JOIN medicine_batches b ON b.id=i.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE s.replacement_id=?`,id);
 r.items=[...new Set(r.usage.map(u=>u.medicine_id))].map(medicine_id=>({medicine_id,medicine_name:r.usage.find(u=>u.medicine_id===medicine_id).medicine_name,used:money(r.usage.filter(u=>u.medicine_id===medicine_id).reduce((s,u)=>s+u.qty,0)),supplied:money(r.supplies.filter(u=>u.medicine_id===medicine_id).reduce((s,u)=>s+u.qty,0)),received:money(r.supplies.filter(u=>u.medicine_id===medicine_id).reduce((s,u)=>s+u.received_qty,0))}));
 return r;
}
function refresh(id){const r=view(id),used=r.items.reduce((s,i)=>s+i.used,0),supplied=r.items.reduce((s,i)=>s+i.supplied,0),received=r.items.reduce((s,i)=>s+i.received,0);update('ward_replacements',id,{status:received>=used?'replaced':received>0?'partially_replaced':supplied>=used?'pharmacy_supplied':supplied>0?'partially_supplied':'awaiting_replacement'});return view(id);}
wardReplacements.post('/ward-replacements/:id/reverse',requireAuth,h(req=>tx(()=>{
 if(!mayRecord(req.user))fail(403,'forbidden');
 const r=view(+req.params.id),reason=String(req.body?.reason||'').trim();if(!reason)fail(400,'reason_required');if(r.status==='reversed'||r.supplies.length)fail(409,'replacement_already_supplied_or_reversed');
 for(const u of r.usage){const b=get('SELECT * FROM medicine_batches WHERE id=?',u.batch_id);update('medicine_batches',b.id,{qty:money(b.qty+u.qty)});insert('stock_moves',{medicine_id:b.medicine_id,batch_id:b.id,location:r.location,move_type:'ward_usage_reversal',qty:u.qty,balance_after:money(b.qty+u.qty),ref_type:'ward_replacement',ref_id:r.id,reason,created_by:req.user.id});}
 reverseSource('ward_usage',r.id,reason);update('ward_replacements',r.id,{status:'reversed'});emit(req,{topics,event:'indent.updated',action:'ward_replacement.reverse',entity:'ward_replacements',entityId:r.id,detail:{before:r,after:view(r.id),reason}});return view(r.id);
})));
wardReplacements.get('/ward-replacements',requireAuth,h(req=>{
 if(!mayView(req.user))fail(403,'forbidden');
 const w=[],a=[];for(const key of ['location','patient_id'])if(req.query[key]){w.push(key+'=?');a.push(req.query[key]);}if(req.query.status&&req.query.status!=='all'){w.push('status=?');a.push(req.query.status);}
 return all(`SELECT id FROM ward_replacements ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY id DESC LIMIT 200`,...a).map(r=>view(r.id));
}));
wardReplacements.get('/ward-replacements/ledger',requireAuth,h(req=>{
 if(!mayView(req.user))fail(403,'forbidden');
 const location=req.query.location||'ER';if(!locations.includes(location))fail(400,'location_invalid');
 return {location,batches:all(`SELECT b.*,m.name medicine_name FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.location=? ORDER BY b.expiry,m.name`,location),moves:all(`SELECT s.*,b.batch_no,b.expiry,m.name medicine_name,u.name staff_name FROM stock_moves s LEFT JOIN medicine_batches b ON b.id=s.batch_id JOIN medicines m ON m.id=s.medicine_id LEFT JOIN users u ON u.id=s.created_by WHERE s.location=? ORDER BY s.id DESC LIMIT 500`,location)};
}));
wardReplacements.post('/ward-replacements',requireAuth,h(req=>tx(()=>{
 if(!mayRecord(req.user))fail(403,'forbidden');
 const b=req.body||{},location=b.location;if(!locations.includes(location))fail(400,'location_invalid');
 const e=get("SELECT * FROM encounters WHERE id=? AND stage<>'cancelled'",+b.encounter_id)||fail(400,'patient_visit_required');
 const admission=get("SELECT * FROM admissions WHERE encounter_id=? AND status<>'discharged'",e.id);
 if(location==='ER'&&e.kind!=='EMG'&&!get("SELECT id FROM emergency_cases WHERE encounter_id=? AND status NOT IN ('discharged','referred','lama','expired')",e.id))fail(400,'patient_not_registered_in_er');
 if(location==='ICU'&&(!admission||!get("SELECT b.id FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id=? AND lower(w.kind)='icu'",admission.bed_id)))fail(400,'patient_not_admitted_in_icu');
 if(location==='OT'&&!get("SELECT id FROM ot_bookings WHERE patient_id=? AND status<>'cancelled' AND (admission_id=? OR (admission_id IS NULL AND ? IS NULL))",e.patient_id,admission?.id||null,admission?.id||null))fail(400,'patient_ot_case_required');
 const lines=b.lines;if(!Array.isArray(lines)||!lines.length)fail(400,'lines_required');
 if(new Set(lines.map(l=>+l.batch_id)).size!==lines.length)fail(400,'duplicate_batch');
 const batches=lines.map(l=>{const bt=get('SELECT * FROM medicine_batches WHERE id=?',+l.batch_id),qty=Number(l.qty);if(!bt||bt.location!==location||bt.expiry<=today()||!Number.isFinite(qty)||qty<=0||qty>bt.qty)fail(400,'invalid_consumed_batch_or_quantity');return {bt,qty};});
 const id=insert('ward_replacements',{replacement_no:'WR-'+Date.now().toString(36).toUpperCase(),patient_id:e.patient_id,encounter_id:e.id,admission_id:admission?.id||null,location,notes:b.notes||null,recorded_by:req.user.id});
 let cost=0;for(const {bt,qty} of batches){insert('ward_replacement_usage',{replacement_id:id,batch_id:bt.id,qty});update('medicine_batches',bt.id,{qty:money(bt.qty-qty)});insert('stock_moves',{medicine_id:bt.medicine_id,batch_id:bt.id,location,move_type:'ward_usage',qty:-qty,balance_after:money(bt.qty-qty),ref_type:'ward_replacement',ref_id:id,reason:'Patient emergency rack use',created_by:req.user.id});cost+=qty*bt.purchase_rate;}
 if(cost>0)postVoucher({type:'COGS',source:'ward_usage',sourceId:id,narration:'Emergency rack consumed '+view(id).replacement_no,lines:[{account:'cogs_consumables',debit:money(cost),segment:'PHARMACY'},{account:'inventory_pharmacy',credit:money(cost),segment:'PHARMACY'}]});
 const row=view(id);emit(req,{topics,event:'indent.created',action:'ward_replacement.record',entity:'ward_replacements',entityId:id,detail:{before:null,after:row,reason:b.notes||'Emergency rack consumption'}});return row;
})));
wardReplacements.post('/ward-replacements/:id/supply',requireAuth,h(req=>tx(()=>{
 if(!can(req.user,'pharmacy.dispense'))fail(403,'forbidden');
 const r=view(+req.params.id),items=req.body?.items;if(!Array.isArray(items)||!items.length)fail(400,'items_required');
 if(r.status==='reversed')fail(409,'replacement_reversed');
 if(new Set(items.map(i=>+i.medicine_id)).size!==items.length)fail(400,'duplicate_medicine');
 for(const it of items){const line=r.items.find(i=>i.medicine_id===+it.medicine_id);if(!line||!Number.isFinite(+it.qty)||+it.qty<=0||+it.qty>line.used-line.supplied)fail(400,'replacement_quantity_exceeds_usage');}
 // an inpatient's replacement joins the running IP bill (settled at discharge by reception), never a stray pharmacy bill
 const ipOpen=r.admission_id&&get("SELECT 1 FROM admissions WHERE id=? AND status<>'discharged'",r.admission_id);
 const sale=dispense(req,{patient_id:r.patient_id,encounter_id:r.encounter_id,admission_id:ipOpen?r.admission_id:undefined,location:'OP',items:items.map(i=>({medicine_id:+i.medicine_id,qty:+i.qty,batch_id:i.batch_id?+i.batch_id:undefined})),collect:false,notes:'Rack replacement '+r.replacement_no});
 const suppliedIds=[];
 for(const i of sale.bill.items)suppliedIds.push(insert('ward_replacement_supply',{replacement_id:r.id,bill_item_id:i.id,qty:i.qty}));
 billNewToPayer(req,[sale.bill.id]);applyPackage(req,activeAssignment({encounterId:r.encounter_id}));
 let row=refresh(r.id);
 if(req.body?.receive_now===true)row=receiveReplacement(req,r.id,row.supplies.filter(s=>suppliedIds.includes(s.id)).map(s=>({id:s.id,qty:s.qty})));
 const bill=get('SELECT * FROM bills WHERE id=?',sale.bill.id);emit(req,{topics,event:'indent.dispensed',action:'ward_replacement.supply',entity:'ward_replacements',entityId:r.id,detail:{before:r,after:row}});return {replacement:row,bill:{...bill,...collectionPolicy(bill)}};
})));
wardReplacements.post('/ward-replacements/:id/receive',requireAuth,h(req=>tx(()=>{
 if(!mayRecord(req.user))fail(403,'forbidden');
 return receiveReplacement(req,+req.params.id,req.body?.lines);
})));
function receiveReplacement(req,id,lines){
 const r=view(id);if(!Array.isArray(lines)||!lines.length)fail(400,'lines_required');
 if(new Set(lines.map(l=>+l.id)).size!==lines.length)fail(400,'duplicate_supply_line');
 let cost=0;for(const l of lines){const s=r.supplies.find(s=>s.id===+l.id),qty=+l.qty;if(!s||!Number.isFinite(qty)||qty<=0||qty>s.qty-s.received_qty)fail(400,'receipt_quantity_invalid');const source=get('SELECT * FROM medicine_batches WHERE id=?',s.batch_id);if(source.expiry<=today())fail(409,'replacement_expired');let dest=get('SELECT * FROM medicine_batches WHERE medicine_id=? AND batch_no=? AND expiry=? AND location=?',source.medicine_id,source.batch_no,source.expiry,r.location);if(!dest){const {id,qty,received_at,...fields}=source;dest=get('SELECT * FROM medicine_batches WHERE id=?',insert('medicine_batches',{...fields,location:r.location,qty:0}));}update('medicine_batches',dest.id,{qty:money(dest.qty+qty)});insert('stock_moves',{medicine_id:dest.medicine_id,batch_id:dest.id,location:r.location,move_type:'ward_replacement_received',qty,balance_after:money(dest.qty+qty),ref_type:'ward_replacement',ref_id:r.id,reason:'Physical replacement checked and received',created_by:req.user.id});update('ward_replacement_supply',s.id,{received_qty:money(s.received_qty+qty),received_by:req.user.id,received_at:nowIso()});cost+=qty*(get('SELECT unit_cost FROM bill_items WHERE id=?',s.bill_item_id).unit_cost||0);}
 const receipt=insert('ward_replacement_receipts',{replacement_id:r.id,created_by:req.user.id,detail:JSON.stringify(lines)});
 // Restore the replacement sale's inventory cost; original rack consumption remains the expense.
 if(cost>0)postVoucher({type:'JV',source:'ward_replacement_receipt',sourceId:receipt,narration:'Physical rack replacement '+r.replacement_no,lines:[{account:'inventory_pharmacy',debit:money(cost),segment:'PHARMACY'},{account:'cogs_pharmacy',credit:money(cost),segment:'PHARMACY'}]});
 const row=refresh(r.id);emit(req,{topics,event:'indent.updated',action:'ward_replacement.receive',entity:'ward_replacements',entityId:r.id,detail:{before:r,after:row}});return row;
}
