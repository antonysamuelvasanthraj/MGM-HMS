import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('client/src/views/quality.js','utf8');
const mount=source.slice(source.indexOf('export async function mount'),source.indexOf('\nfunction layout()')).replace('export async function','async function');
// the real plain-words formatter the screen uses (Quality's plainDetail over the Audit Trail's summary)
const auditSource=fs.readFileSync('client/src/views/audit.js','utf8');
const grab=(src,start,end)=>{const a=src.indexOf(start);assert.ok(a>=0,'missing '+start);return src.slice(a,src.indexOf(end,a));};
const helpers=grab(auditSource,'export function summary(r)','\n/** A value in plain words').replace('export function','function')
  +grab(auditSource,'const fmt = (v) =>','\nfunction table(')
  +'const auditSummary = summary;\n'+grab(source,'function plainDetail(d)','\nexport async function mount');
const nodes=new Map();const root={};const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:''});return nodes.get(selector);};
const quality={rows:[],counts:{open:0,major:0,overdue:0,closed30:0},byArea:[],byClause:[]};
let auditRequested=false;
const context={f:{},cache:[],layout:()=>'',mountPage:()=>root,wireFilters:()=>{},bind:()=>{},qs:()=>'',can:()=>true,api:{get:async url=>{if(url.startsWith('/quality'))return quality;auditRequested=true;return {rows:[{at:'2026-10-03 01:00:00',action:'bill.create',detail:{before:null,after:{total:100}}}]};}},$,kpi:()=>'',emptyState:()=>'',renderRows:(node,rows,render)=>{node.innerHTML=rows.map(render).join('');},rowHTML:()=>'',fmtDateTime:String,esc:String,titleCase:(x)=>String(x).replace(/_/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase()),live:({load})=>load()};
await vm.runInNewContext(helpers+mount+'; mount({})',context);
assert.ok(auditRequested);
assert.match($('[data-audit]').innerHTML,/bill.create/);
assert.match($('[data-audit]').innerHTML,/Total 100/);
assert.doesNotMatch($('[data-audit]').innerHTML,/\{"/,'no raw JSON in the activity detail');
assert.doesNotMatch($('[data-audit]').innerHTML,/\[object Object\]/);
console.log('PASS: actual Quality controller renders structured audit response and readable detail without refresh errors');
