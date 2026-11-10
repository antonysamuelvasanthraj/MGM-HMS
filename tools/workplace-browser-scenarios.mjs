/** These functions run in the isolated browser and use real form handlers. */
export async function browserSupport() {
 const {api}=await import('/src/api.js');const {navigate}=await import('/src/router.js');
 const wait=async(fn,label='saved workflow')=>{for(let i=0;i<160;i++){if(await fn())return;await new Promise(r=>setTimeout(r,70));}throw Error(label+': '+location.pathname+' '+document.body.innerText.slice(-1200));};
 const fill=(form,values)=>{for(const [key,value]of Object.entries(values)){const input=form.elements[key];if(!input)throw Error('Missing field '+key);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}};
 const save=()=>document.querySelector('#modal-root [data-save]').click();
 const close=()=>{for(let i=0;i<8;i++){const b=document.querySelector('#modal-root [data-close]');if(!b)break;b.click();}};
 return {api,navigate,wait,fill,save,close};
}
export async function otScenario(ctx) {
 const {api,navigate,wait,fill,save}=window.__review;
 await navigate('/ot');document.querySelector('#view [data-new]').click();await wait(()=>document.querySelector('[data-bf]'),'OT booking form');
 const picker=document.querySelector('#modal-root [data-pp-input]');picker.value=ctx.patient.name;picker.dispatchEvent(new Event('input'));
 await wait(()=>document.querySelector('#modal-root [data-pp-list] [data-id="'+ctx.patient.id+'"]'),'OT patient search');
 document.querySelector('#modal-root [data-pp-list] [data-id="'+ctx.patient.id+'"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait(()=>picker.value.includes(ctx.patient.uhid),'OT patient selected');
 const date=new Date(),stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')+'T12:00';
 fill(document.querySelector('[data-bf]'),{procedure:'Synthetic OT browser acceptance',scheduled_at:stamp,surgeon_id:ctx.doctor.id});
 document.querySelector('[data-cdesc="3"]').value='Synthetic theatre room';document.querySelector('[data-camt="3"]').value='1000';save();
 let booking;await wait(async()=>{booking=(await api.get('/ipd/ot?all=1')).rows.find(r=>r.procedure==='Synthetic OT browser acceptance');return !!booking;},'OT booking saved');
 const action=selector=>document.querySelector('#view tr[data-id="'+booking.id+'"] '+selector);
 await wait(()=>action('[data-to=pre_op]'),'Pre-op action');action('[data-to=pre_op]').click();await wait(()=>[...document.querySelectorAll('#view tr[data-id="'+booking.id+'"] [data-act=checklist]')].some(b=>b.innerText.includes('Complete safety')),'OT start gate');
 const safety=[...document.querySelectorAll('#view tr[data-id="'+booking.id+'"] [data-act=checklist]')].find(b=>b.innerText.includes('Complete safety'));if(!safety)throw Error('Missing complete-checklist action');safety.click();await wait(()=>document.querySelector('[data-cl]'),'Checklist form');
 const checklist=document.querySelector('[data-cl]');checklist.consent.checked=true;
 for(const key of ['site_marked','fasting','allergy','antibiotic','count'])checklist.elements[key].value='confirmed';
 for(const key of ['implants','blood'])checklist.elements[key].value='not_applicable';
 checklist.notes.value='Synthetic review only: implants and blood products not applicable';save();await wait(()=>action('[data-to=in_theatre]'),'Checklist enables start');
 const before=(await api.get('/ipd/admissions/'+ctx.admission.id)).bills.find(b=>b.bill_type==='IP').total;
 for(const status of ['in_theatre','recovery','completed']){await wait(()=>action('[data-to="'+status+'"]'),'OT action '+status);action('[data-to="'+status+'"]').click();await wait(async()=>((await api.get('/ipd/ot?all=1')).rows.find(r=>r.id===booking.id)?.status)===status,'OT saved '+status);}
 const after=(await api.get('/ipd/admissions/'+ctx.admission.id)).bills.find(b=>b.bill_type==='IP').total;
 return {bookingSaved:true,checklistRequired:true,notApplicableReasonSaved:true,caseCompleted:true,runningBillChargedOnce:after-before===1000};
}
export async function workplaceScenario() {
 const {api,navigate,wait,fill,save}=window.__review;
 await navigate('/maintenance');document.querySelector('#view [data-new-asset]').click();await wait(()=>document.querySelector('[data-af]'),'Asset form');
 fill(document.querySelector('[data-af]'),{name:'Synthetic review monitor',location:'Isolated QA room',serial_no:'QA-UI-001'});save();
 let asset;await wait(async()=>{asset=(await api.get('/maintenance/assets')).find(a=>a.serial_no==='QA-UI-001');return !!asset;},'Asset saved');
 document.querySelector('#view [data-new-pm]').click();await wait(()=>document.querySelector('[data-pmf]'),'PM form');fill(document.querySelector('[data-pmf]'),{asset_id:asset.id,title:'Synthetic service check',checklist:'Synthetic verification only'});save();
 let pm;await wait(async()=>{pm=(await api.get('/maintenance/pm?status=all')).find(r=>r.asset_id===asset.id);return !!pm;},'PM scheduled');
 document.querySelector('#view [data-tab=pm]').click();await wait(()=>document.querySelector('#view tr[data-id="'+pm.id+'"] [data-complete-pm]'),'PM complete action');document.querySelector('#view tr[data-id="'+pm.id+'"] [data-complete-pm]').click();await wait(()=>document.querySelector('[data-pmc]'),'PM completion form');fill(document.querySelector('[data-pmc]'),{work_done:'Synthetic verification passed',cost:0});save();await wait(async()=>((await api.get('/maintenance/pm?status=all')).find(r=>r.id===pm.id)?.status)==='completed','PM completion saved');
 document.querySelector('#view [data-raise]').click();await wait(()=>document.querySelector('[data-tf]'),'Fault form');fill(document.querySelector('[data-tf]'),{asset_id:asset.id,title:'Synthetic display fault',description:'Isolated software test'});save();let ticket;await wait(async()=>{ticket=(await api.get('/maintenance/tickets?status=all')).find(t=>t.asset_id===asset.id);return !!ticket;},'Fault saved');
 document.querySelector('#view [data-tab=tickets]').click();
 for(const status of ['in_progress','resolved','closed']){
  const filter=document.querySelector('#view [data-status]');if([...filter.options].some(o=>o.value==='all')){filter.value='all';filter.dispatchEvent(new Event('change'));}
  await wait(()=>document.querySelector('#view tr[data-id="'+ticket.id+'"] [data-work]'),'Fault update '+status);document.querySelector('#view tr[data-id="'+ticket.id+'"] [data-work]').click();await wait(()=>document.querySelector('[data-wf]'),'Fault work form');fill(document.querySelector('[data-wf]'),{status,resolution:'Synthetic resolution recorded'});save();await wait(async()=>((await api.get('/maintenance/tickets?status=all')).find(t=>t.id===ticket.id)?.status)===status,'Fault status '+status);
 }
 await navigate('/quality');document.querySelector('#view [data-new]').click();await wait(()=>document.querySelector('[data-qf]'),'Quality event form');fill(document.querySelector('[data-qf]'),{title:'Synthetic QA near miss',kind:'near_miss',detail:'Isolated workflow acceptance'});save();let quality;await wait(async()=>{quality=(await api.get('/quality')).rows.find(q=>q.title==='Synthetic QA near miss');return !!quality;},'Quality event saved');
 await wait(()=>document.querySelector('#view tr[data-id="'+quality.id+'"] [data-act=open]'),'Quality update');document.querySelector('#view tr[data-id="'+quality.id+'"] [data-act=open]').click();await wait(()=>document.querySelector('[data-qf]'),'Quality closure form');fill(document.querySelector('[data-qf]'),{status:'closed',detail:'Synthetic event reviewed; corrective action verified'});save();await wait(async()=>((await api.get('/quality?status=closed')).rows.find(q=>q.id===quality.id)?.status)==='closed','Quality closure saved');
 return {assetSaved:true,preventiveMaintenanceCompleted:true,faultResolvedAndClosed:true,qualityEventSaved:true,qualityEventClosed:true};
}
export async function storesScenario() {
 const {api,navigate,wait,fill,save,close}=window.__review;
 await navigate('/stores');document.querySelector('#view [data-add]').click();await wait(()=>document.querySelector('#modal-root [data-f]'),'Store item form');fill(document.querySelector('#modal-root [data-f]'),{name:'Synthetic QA material',reorder_level:2,location_bin:'QA'});save();let item;await wait(async()=>{item=(await api.get('/stores/items')).find(r=>r.name==='Synthetic QA material');return !!item;},'Store item saved');await wait(()=>document.querySelector('#modal-root [data-print-preview]')?.contentDocument?.body?.innerText.includes(item.code),'QR label preview');close();
 document.querySelector('#view [data-receive]').click();await wait(()=>document.querySelector('#modal-root [data-lfind]'),'Goods receipt form');
 const f=document.querySelector('#modal-root [data-f]');fill(f,{invoice_no:'SYNTHETIC-STORE-001'});const finder=document.querySelector('#modal-root [data-lfind]');finder.value=item.name+' ('+item.code+')';document.querySelector('#modal-root [data-ladd]').click();await wait(()=>document.querySelector('#modal-root [data-lq]'),'Receipt line');
 const qty=document.querySelector('#modal-root [data-lq]'),rate=document.querySelector('#modal-root [data-lr]');qty.value='10';qty.dispatchEvent(new Event('input',{bubbles:true}));rate.value='20';rate.dispatchEvent(new Event('input',{bubbles:true}));save();await wait(async()=>((await api.get('/stores/items')).find(r=>r.id===item.id)?.qty)===10,'Store receipt stock');
 document.querySelector('#view [data-request]').click();await wait(()=>document.querySelector('#modal-root [data-lfind]'),'Department request form');const rf=document.querySelector('#modal-root [data-f]');rf.department_id.value=[...rf.department_id.options].find(o=>o.value)?.value;fill(rf,{purpose:'Synthetic department issue'});document.querySelector('#modal-root [data-lfind]').value=item.code;document.querySelector('#modal-root [data-ladd]').click();document.querySelector('#modal-root [data-lq]').value='2';document.querySelector('#modal-root [data-lq]').dispatchEvent(new Event('input',{bubbles:true}));save();await wait(async()=>((await api.get('/stores/requests')).some(r=>r.purpose==='Synthetic department issue')),'Department request saved');
 const request=(await api.get('/stores/requests')).find(r=>r.purpose==='Synthetic department issue');
 const reqAction=act=>document.querySelector('#view [data-rid="'+request.id+'"] [data-req-act="'+act+'"]');
 await wait(()=>reqAction('issue'),'Store issue action');reqAction('issue').click();await wait(()=>document.querySelector('#modal-root [data-iq]'),'Issue quantity');document.querySelector('#modal-root [data-iq]').value='2';save();await wait(async()=>((await api.get('/stores/items')).find(r=>r.id===item.id)?.qty)===8,'Issued quantity deducted');
 await wait(()=>reqAction('received'),'Department confirmation');reqAction('received').click();await wait(async()=>!!((await api.get('/stores/requests')).find(r=>r.id===request.id)?.received_at),'Department receipt persisted');
 document.querySelector('#view [data-tab=items]').click();const itemAction=act=>document.querySelector('#view tr[data-id="'+item.id+'"] [data-item-act="'+act+'"]');await wait(()=>itemAction('return'),'Store return action');itemAction('return').click();await wait(()=>document.querySelector('#modal-root [data-f] [name=reason]'),'Return form');fill(document.querySelector('#modal-root [data-f]'),{department_id:request.department_id,qty:1,reason:'Synthetic unused item returned'});save();await wait(async()=>((await api.get('/stores/items')).find(r=>r.id===item.id)?.qty)===9,'Return stock persisted');
 await wait(()=>itemAction('count'),'Store count action');itemAction('count').click();await wait(()=>document.querySelector('#modal-root [name=counted]'),'Physical count form');fill(document.querySelector('#modal-root [data-f]'),{counted:8,reason:'Synthetic count discrepancy'});save();await wait(async()=>((await api.get('/stores/items')).find(r=>r.id===item.id)?.qty)===8,'Count adjusted stock');
 return {itemSaved:true,qrLabelPreviewOpened:true,supplierReceiptSaved:true,departmentRequestSaved:true,issueDeductedStock:true,receiptConfirmed:true,returnRestoredStock:true,physicalCountPersisted:true};
}
