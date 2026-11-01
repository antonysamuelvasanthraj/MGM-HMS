import {DatabaseSync} from 'node:sqlite';import {LAB_REPORT_NOTES} from '../server/lab-report-notes.js';
const base=process.env.HMS_NOTES_URL || 'http://127.0.0.1:4300/api';
const db=new DatabaseSync(process.env.HMS_NOTES_DB || 'data/surelyhms.db',{readOnly:true});
const session=db.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role='admin' ORDER BY s.last_seen DESC LIMIT 1").get();
const services=db.prepare("SELECT id,code,name,report_comment FROM services WHERE category='lab' AND active=1").all();
const missing=services.filter(service=>!String(service.report_comment || '').trim());
for(const service of missing)if(!LAB_REPORT_NOTES.has(service.code))throw Error('No reviewed instructions for '+service.name);
let filled=0;
for(const service of missing){const note=LAB_REPORT_NOTES.get(service.code);const response=await fetch(`${base}/lab/tests/${service.id}`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Session':session.token},body:JSON.stringify({report_comment:note.text,report_comment_title:note.title})});if(!response.ok)throw Error(await response.text());filled++;}
const remaining=db.prepare("SELECT count(*) n FROM services WHERE category='lab' AND active=1 AND trim(coalesce(report_comment,''))=''").get().n;
if(remaining)throw Error('Some active tests still lack instructions');console.log(JSON.stringify({active_tests:services.length,filled,preserved:services.length-filled,without_instructions:remaining}));db.close();
