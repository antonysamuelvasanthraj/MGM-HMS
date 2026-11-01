import assert from 'node:assert/strict';
export async function checkSchemeUI(patientId){
 const origin='http://localhost:4492';let ws,target;
 try{
  const auth=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'surely'})}).then(r=>r.json());
  target=await fetch('http://localhost:9559/json/new?'+origin+'/billing',{method:'PUT'}).then(r=>r.json());ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map();ws.addEventListener('message',event=>{const d=JSON.parse(event.data);if(pending.has(d.id)){pending.get(d.id)(d);pending.delete(d.id);}});const send=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
  await send('Runtime.evaluate',{expression:`localStorage.setItem('surely_token',${JSON.stringify(auth.token)})`});await send('Page.reload',{ignoreCache:true});await new Promise(r=>setTimeout(r,1200));
  const result=await send('Runtime.evaluate',{expression:`(async()=>{
   const wait=async fn=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Scheme UI timeout');};
   const store=await import('/src/store.js');await store.loadSession();await store.loadMeta();await wait(()=>document.querySelector('#modal-root'));
   const m=await import('/src/scheme-patient-pay.js');await m.openSchemePatientPayment(${Number(patientId)});await wait(()=>document.querySelector('[data-permit]'));
   const listWorks=document.querySelector('#modal-root').innerText.includes('Collect at pharmacy');document.querySelector('[data-permit]').click();await wait(()=>document.querySelector('[data-scheme-permit]'));const f=document.querySelector('[data-scheme-permit]');const amountCap=Number(f.amount.max)>0;f.enabled.checked=false;f.enabled.dispatchEvent(new Event('change'));const disabled=f.amount.disabled;f.enabled.checked=true;f.enabled.dispatchEvent(new Event('change'));const enabled=!f.amount.disabled;const reasonRequired=f.reason.required&&f.reference.required;
   const host=document.createElement('div');document.body.append(host);await m.paintSchemeReviews(host);const reviews=host.innerText.includes('Scheme patient-payment reviews (5)');host.querySelector('[data-review]').click();await wait(()=>document.querySelector('[data-review-form]'));const reviewNote=document.querySelector('[data-review-form] [name="note"]').required;return {listWorks,amountCap,disabled,enabled,reasonRequired,reviews,reviewNote};
  })()`,awaitPromise:true,returnByValue:true});
  if(result.result?.exceptionDetails)throw Error(JSON.stringify(result.result.exceptionDetails));const values=result.result?.result?.value;assert.ok(values);for(const [key,value] of Object.entries(values))assert.equal(value,true,key);console.log(JSON.stringify({browserPassed:true,...values}));
 }finally{ws?.close();if(target?.id)await fetch('http://localhost:9559/json/close/'+target.id).catch(()=>{});}
}
