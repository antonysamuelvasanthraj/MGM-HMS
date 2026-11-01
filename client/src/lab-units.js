import {api} from './api.js';
import {esc} from './ui.js';
const common=['%','g/dL','g/L','mg/dL','mg/L','mmol/L','µmol/L','mEq/L','U/L','IU/L','U/mL','IU/mL','mIU/L','mIU/mL','µIU/mL','ng/mL','ng/dL','pg/mL','µg/dL','µg/L','nmol/L','pmol/L','cells/µL','cells/cumm','/cumm','million/cumm','×10³/µL','×10⁶/µL','×10⁹/L','×10¹²/L','fL','pg','mm/hr','seconds','ratio','INR','titre','/hpf','/lpf','CFU/mL','copies/mL','Index','S/CO','OD'];
let units=common;
export async function loadLabUnits(){try{const existing=await api.get('/lab/units');units=[...new Set([...common,...existing])].sort((a,b)=>a.localeCompare(b));}catch{/* Common units and custom entry remain available offline. */}}
export function labUnitField(value='',attribute='data-k="unit"'){
  const choices=[...new Set([...units,...(value?[value]:[])])];
  return `<div data-unit-field><select class="field field-sm" aria-label="Unit" data-unit-select><option value="">No unit / qualitative</option>${choices.map(unit=>`<option value="${esc(unit)}" ${unit===value?'selected':''}>${esc(unit)}</option>`).join('')}<option value="__custom__">Other — type unit</option></select><input class="field field-sm mt-1" aria-label="Custom unit" maxlength="40" ${attribute} value="${esc(value)}" data-unit-value hidden></div>`;
}
export function wireLabUnits(root){if(root.labUnitsWired)return;root.labUnitsWired=true;root.addEventListener('change',event=>{
  const select=event.target.closest('[data-unit-select]');if(!select)return;
  const input=select.closest('[data-unit-field]').querySelector('[data-unit-value]');
  input.hidden=select.value!=='__custom__';
  if(input.hidden)input.value=select.value;
  else {input.value='';input.focus();}
});}
