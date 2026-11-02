import {can,esc,mountPage,apiError} from './_kit.js';
export async function mount(ctx){
  const pharmacy=ctx.query.desk==='pharmacy';
  if(!pharmacy){const {mount}=await import('./bills.js');return mount({...ctx,query:{...ctx.query}});}
  const tabs=pharmacy?[
    ['counter','New sale','pharmacy','pharmacy.view'],['bills','Bills & payments','bills','billing.view']
  ]:[
    ['bills','Bills & payments','bills','billing.view'],['op','OP consultation fees','op-fee-collection','op.collect'],
    ['tests','Lab / scan billing','investigations','billing.create'],['services','Payment queue','service-payments','payment.authorize'],
    ['receipts','Receipts & refunds','receipts','payment.view']
  ];
  const allowed=tabs.filter(tab=>can(tab[3]));
  const root=mountPage(ctx,`<div class="billing-workspace p-4 space-y-3"><header><h1 class="text-headline-md">${pharmacy?'Pharmacy Billing':'Reception Billing'}</h1><p class="text-body-sm">Today’s work by default. Use date filters or patient records for older activity.</p></header><nav class="flex flex-wrap gap-2" data-desk-tabs>${allowed.map(([key,label])=>`<button class="btn-secondary" data-desk-tab="${key}">${esc(label)}</button>`).join('')}</nav><div data-desk-content></div></div>`);
  let dispose=null,active=null,disposed=false,busy=false;
  const host=root.querySelector('[data-desk-content]');
  async function select(key){
    if(disposed||busy||active===key)return;
    if(host.dataset.dirty==='1'&&!window.confirm('Leave this billing form? Unsaved entries will be lost.'))return;
    const tab=allowed.find(t=>t[0]===key);if(!tab)return;
    busy=true;dispose?.();dispose=null;active=key;host.dataset.dirty='';
    root.querySelectorAll('[data-desk-tab]').forEach(button=>{button.classList.toggle('btn-primary',button.dataset.deskTab===key);button.setAttribute('aria-pressed',String(button.dataset.deskTab===key));});
    history.replaceState({},'',`/billing-desk?desk=${pharmacy?'pharmacy':'reception'}&tab=${key}`);
    try{const view=await import(`./${tab[2]}.js`);if(disposed)return;host.innerHTML='<div class="view-root"></div>';const cleanup=await view.mount({...ctx,host,root:host.firstElementChild,query:pharmacy&&key==='bills'?{type:'PHARM'}:{}});if(disposed)cleanup?.();else {dispose=cleanup;if(cleanup?.ready)await cleanup.ready;}}
    catch(error){active=null;if(!disposed){host.textContent='Could not load this billing section. Select the tab to retry.';apiError(error);}}
    finally{busy=false;}
  }
  host.addEventListener('input',()=>{if(host.querySelector('[data-msearch],[data-nb],[data-reg-form]'))host.dataset.dirty='1';});
  root.querySelector('[data-desk-tabs]').onclick=event=>{const button=event.target.closest('[data-desk-tab]');if(button)select(button.dataset.deskTab);};
  await select(allowed.some(t=>t[0]===ctx.query.tab)?ctx.query.tab:allowed[0]?.[0]);
  return()=>{disposed=true;dispose?.();};
}
