// Recorded-name/ingredient matching only; not a cross-reactivity knowledge base.
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function medicineAllergyConflicts(allergies,medicines){
  const conflicts=[];
  for(const medicine of medicines){
    let composition=[];
    try{composition=typeof medicine.composition==='string'?JSON.parse(medicine.composition):medicine.composition||[];}catch{/* generic and name remain available */}
    const names=[medicine.name,medicine.generic,...(Array.isArray(composition)?composition.map(c=>c.generic):[])].map(normalize);
    for(const allergy of allergies){
      const substance=normalize(allergy.substance);
      if(substance.length<3)continue;
      if(names.some(name=>` ${name} `.includes(` ${substance} `)))conflicts.push({medicine_id:medicine.id,medicine:medicine.name,allergy:allergy.substance,severity:allergy.severity});
    }
  }
  return conflicts;
}
