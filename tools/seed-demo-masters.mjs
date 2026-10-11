/**
 * Demo master data for the hospital demonstration — wards & beds, IP recurring charges, lab tests with
 * sex/age/critical ranges, imaging studies & report templates, a broad pharmacy & consumables catalogue,
 * suppliers, insurers / TPAs, packages, doctor and nursing templates.
 *
 *   node tools/seed-demo-masters.mjs
 *
 * Safe to repeat: every record is matched by its code (or name for templates) and updated in place;
 * nothing is duplicated and nothing outside these masters is touched. No patients, stock or money here —
 * stock enters through GRNs in the demo workflow seed, as it does in real use.
 * All names are fictional or generic; brand names are demo labels, not product endorsements.
 */
import { db, get, insert, update, run, tx } from '../server/db.js';

const n = { wards: 0, beds: 0, services: 0, labParams: 0, medicines: 0, templates: 0, payers: 0, suppliers: 0, packages: 0 };
const dept = (code) => get('SELECT id FROM departments WHERE code=?', code)?.id || null;
function upsert(table, key, keyVal, fields, counter) {
  const row = get(`SELECT id FROM ${table} WHERE ${key}=?`, keyVal);
  if (row) { update(table, row.id, fields); return row.id; }
  n[counter]++; return insert(table, { [key]: keyVal, ...fields });
}
const svc = (code, f) => upsert('services', 'code', code, { active: 1, ...f }, 'services');
function template(kind, name, body) {
  const row = get('SELECT id FROM templates WHERE kind=? AND name=?', kind, name);
  if (row) update('templates', row.id, { body, scope: 'hospital' });
  else { n.templates++; insert('templates', { kind, name, body, scope: 'hospital' }); }
}

tx(() => {
  /* ------------------------------------------------------------ wards & beds */
  // [ward code, name, kind, floor, building, [bed prefix, count, class, tariff, gender]]
  const WARDS = [
    ['GW-M', 'General Ward — Male', 'general', 'Ground floor', 'Main Block', ['GWM', 8, 'general', 1500, 'Male']],
    ['GW-F', 'General Ward — Female', 'general', 'Ground floor', 'Main Block', ['GWF', 8, 'general', 1500, 'Female']],
    ['SPVT', 'Semi Private Rooms', 'semi_private', 'First floor', 'Main Block', ['SPV', 4, 'semi_private', 3000, null]],
    ['PVT', 'Private Rooms', 'private', 'First floor', 'Main Block', ['PVT', 4, 'private', 4500, null]],
    ['DLX', 'Deluxe Suites', 'deluxe', 'Second floor', 'Main Block', ['DLX', 2, 'deluxe', 7500, null]],
    ['ICU', 'ICU', 'icu', 'First floor', 'Critical Care Block', ['ICU', 6, 'icu', 9500, null]],
    ['NICU', 'NICU', 'nicu', 'Second floor', 'Mother & Child Block', ['NICU', 4, 'nicu', 6000, null]],
    ['PICU', 'PICU', 'picu', 'Second floor', 'Mother & Child Block', ['PICU', 3, 'picu', 7000, null]],
    ['HDU', 'High Dependency Unit', 'hdu', 'First floor', 'Critical Care Block', ['HDU', 3, 'hdu', 5000, null]],
    ['LR', 'Labour Room', 'labour', 'Second floor', 'Mother & Child Block', ['LR', 3, 'labour', 3500, 'Female']],
    ['POW', 'Post-operative Ward', 'postop', 'First floor', 'Surgical Block', ['POW', 4, 'postop', 3500, null]],
    ['ERO', 'ER Observation', 'er_obs', 'Ground floor', 'Emergency Block', ['ERO', 4, 'er_obs', 1200, null]],
  ];
  for (const [code, name, kind, floor, building, [prefix, count, cls, tariff, gender]] of WARDS) {
    const wid = upsert('wards', 'code', code, { name, kind, floor }, 'wards');
    for (let i = 1; i <= count; i++) {
      const bed_no = `${prefix}-${String(i).padStart(2, '0')}`;
      const room = `${prefix}-${Math.ceil(i / (['general', 'labour', 'er_obs', 'postop'].includes(kind) ? 4 : 1))}`;
      const row = get('SELECT id, status FROM beds WHERE bed_no=?', bed_no);
      const f = { ward_id: wid, class: cls, tariff, building, room, gender };
      if (row) update('beds', row.id, f); else { n.beds++; insert('beds', { bed_no, status: 'vacant', ...f }); }
    }
  }

  /* ---------------------------------------------- inpatient recurring charges */
  const ALL = 'general,semi_private,private,special,deluxe,postop,labour,er_obs';
  const CRIT = 'icu,nicu,picu,hdu';
  const IPC = [
    ['IPC-VIS', 'Consultant visit / day', 'consultation', 500, 'day', 1, null],
    ['IPC-NUR', 'Nursing care / day', 'ipd', 400, 'day', 1, ALL],
    ['IPC-NUR-CC', 'Critical care nursing / day', 'ipd', 1500, 'day', 1, CRIT],
    ['IPC-RMO', 'Duty doctor (RMO) / day', 'ipd', 300, 'day', 1, null],
    ['IPC-MON', 'Cardiac monitor / day', 'ipd', 800, 'day', 1, CRIT],
    ['IPC-O2', 'Oxygen (per hour)', 'ipd', 100, 'hour', 0, null],
    ['IPC-VENT', 'Ventilator / day', 'ipd', 4500, 'day', 0, 'icu,nicu,picu'],
    ['IPC-DIET', 'Diet / day', 'ipd', 300, 'day', 0, ALL],
    ['IPC-PUMP', 'Infusion / syringe pump / day', 'ipd', 400, 'day', 0, null],
    ['IPC-WARM', 'Radiant warmer / phototherapy / day', 'ipd', 900, 'day', 0, 'nicu'],
    ['IPC-LR', 'Labour room charges', 'ipd', 3500, 'once', 0, 'labour'],
    ['IPC-OBS', 'ER observation (per hour)', 'emergency', 150, 'hour', 0, 'er_obs'],
  ];
  for (const [code, name, category, price, unit, auto, kinds] of IPC) svc(code, { name, category, price, billing_unit: unit, ipd_default: auto, ward_kinds: kinds });

  /* ---------------------------------------------------- procedures & OT prices */
  const PROC = [['PROC-DRS', 'Dressing (minor)', 300], ['PROC-SUT', 'Suturing (up to 5 cm)', 600], ['PROC-NEB', 'Nebulisation', 200], ['PROC-INJ', 'Injection administration', 100],
    ['PROC-CATH', 'Urinary catheterisation', 500], ['PROC-RT', 'Ryles tube insertion', 400], ['PROC-ECG', 'ECG (bedside)', 250], ['PROC-POP', 'POP slab application', 900],
    ['OT-MINOR', 'OT charges — minor', 5000], ['OT-MAJOR', 'OT charges — major', 15000], ['OT-LSCS', 'LSCS package OT charges', 25000], ['OT-NVD', 'Normal delivery charges', 8000]];
  for (const [code, name, price] of PROC) svc(code, { name, category: 'procedure', price, billing_unit: 'once', department_id: dept('OT') });
  run("UPDATE services SET price=500 WHERE category='procedure' AND active=1 AND (price IS NULL OR price=0)");

  /* ------------------------------------------------------------------- lab */
  // [code, name, section, sample, container, price, tat min, [param...]]   param: [name, unit, low, high, {m:[l,h], f:[l,h], c:[l,h], crit:[l,h], type, options, text}]
  const LAB = [
    ['CBC', 'Complete Blood Count (CBC)', 'Haematology', 'EDTA whole blood', 'Lavender top (EDTA)', 350, 45, [
      ['Haemoglobin', 'g/dL', 12, 16, { m: [13, 17], f: [12, 15], c: [11, 14], crit: [7, 20] }], ['Total WBC count', '/cumm', 4000, 11000, { crit: [2000, 30000] }],
      ['RBC count', 'million/cumm', 4.0, 5.5, { m: [4.5, 5.9], f: [4.0, 5.2] }], ['Platelet count', '/cumm', 150000, 450000, { crit: [50000, 1000000] }],
      ['Haematocrit (PCV)', '%', 36, 50, { m: [40, 50], f: [36, 46] }], ['MCV', 'fL', 80, 100], ['MCH', 'pg', 27, 33], ['MCHC', 'g/dL', 32, 36],
      ['Neutrophils', '%', 40, 75], ['Lymphocytes', '%', 20, 45], ['Monocytes', '%', 2, 10], ['Eosinophils', '%', 1, 6], ['Basophils', '%', 0, 1]]],
    ['HB', 'Haemoglobin', 'Haematology', 'EDTA whole blood', 'Lavender top (EDTA)', 120, 30, [['Haemoglobin', 'g/dL', 12, 16, { m: [13, 17], f: [12, 15], c: [11, 14], crit: [7, 20] }]]],
    ['ESR', 'ESR', 'Haematology', 'EDTA / citrate blood', 'Black top (citrate)', 120, 60, [['ESR (1 hour)', 'mm/hr', 0, 20, { m: [0, 15], f: [0, 20] }]]],
    ['PLT', 'Platelet count', 'Haematology', 'EDTA whole blood', 'Lavender top (EDTA)', 150, 30, [['Platelet count', '/cumm', 150000, 450000, { crit: [50000, 1000000] }]]],
    ['PS', 'Peripheral smear', 'Haematology', 'EDTA whole blood', 'Lavender top (EDTA)', 250, 120, [['RBC morphology', '', null, null, { type: 'text' }], ['WBC morphology', '', null, null, { type: 'text' }], ['Platelets on smear', '', null, null, { type: 'text' }], ['Haemoparasites', '', null, null, { type: 'option', options: 'Not seen|Seen' }]]],
    ['RBS', 'Random Blood Sugar', 'Biochemistry', 'Fluoride plasma', 'Grey top (fluoride)', 80, 20, [['Glucose (random)', 'mg/dL', 70, 140, { crit: [40, 450] }]]],
    ['FBS', 'Fasting Blood Sugar', 'Biochemistry', 'Fluoride plasma', 'Grey top (fluoride)', 80, 20, [['Glucose (fasting)', 'mg/dL', 70, 100, { crit: [40, 450] }]]],
    ['PPBS', 'Post-prandial Blood Sugar', 'Biochemistry', 'Fluoride plasma', 'Grey top (fluoride)', 80, 20, [['Glucose (2 h post-meal)', 'mg/dL', 70, 140, { crit: [40, 450] }]]],
    ['HBA1C', 'HbA1c', 'Biochemistry', 'EDTA whole blood', 'Lavender top (EDTA)', 450, 120, [['HbA1c', '%', 4, 5.6]]],
    ['LFT', 'Liver Function Test', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 600, 120, [['Total bilirubin', 'mg/dL', 0.2, 1.2, { crit: [null, 15] }], ['Direct bilirubin', 'mg/dL', 0, 0.3], ['SGOT (AST)', 'U/L', 5, 40], ['SGPT (ALT)', 'U/L', 7, 45], ['Alkaline phosphatase', 'U/L', 44, 147], ['Total protein', 'g/dL', 6, 8.3], ['Albumin', 'g/dL', 3.5, 5.0], ['Globulin', 'g/dL', 2.0, 3.5]]],
    ['RFT', 'Renal Function Test', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 550, 120, [['Blood urea', 'mg/dL', 15, 40, { crit: [null, 200] }], ['Serum creatinine', 'mg/dL', 0.6, 1.2, { m: [0.7, 1.3], f: [0.6, 1.1], crit: [null, 7] }], ['Uric acid', 'mg/dL', 3.5, 7.2, { f: [2.6, 6.0] }], ['Sodium', 'mmol/L', 135, 145, { crit: [120, 160] }], ['Potassium', 'mmol/L', 3.5, 5.1, { crit: [2.8, 6.2] }], ['Chloride', 'mmol/L', 98, 107]]],
    ['CREAT', 'Serum Creatinine', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 150, 60, [['Serum creatinine', 'mg/dL', 0.6, 1.2, { m: [0.7, 1.3], f: [0.6, 1.1], crit: [null, 7] }]]],
    ['UREA', 'Blood Urea', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 150, 60, [['Blood urea', 'mg/dL', 15, 40, { crit: [null, 200] }]]],
    ['URIC', 'Serum Uric Acid', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 200, 60, [['Uric acid', 'mg/dL', 3.5, 7.2, { f: [2.6, 6.0] }]]],
    ['LIPID', 'Lipid Profile', 'Biochemistry', 'Serum (fasting)', 'Red / yellow top (SST)', 600, 120, [['Total cholesterol', 'mg/dL', 0, 200], ['Triglycerides', 'mg/dL', 0, 150], ['HDL cholesterol', 'mg/dL', 40, 60], ['LDL cholesterol', 'mg/dL', 0, 100], ['VLDL cholesterol', 'mg/dL', 5, 40]]],
    ['ELEC', 'Serum Electrolytes', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 450, 60, [['Sodium', 'mmol/L', 135, 145, { crit: [120, 160] }], ['Potassium', 'mmol/L', 3.5, 5.1, { crit: [2.8, 6.2] }], ['Chloride', 'mmol/L', 98, 107]]],
    ['CA', 'Serum Calcium', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 200, 60, [['Calcium (total)', 'mg/dL', 8.5, 10.5, { crit: [6.5, 13] }]]],
    ['MG', 'Serum Magnesium', 'Biochemistry', 'Serum', 'Red / yellow top (SST)', 250, 60, [['Magnesium', 'mg/dL', 1.7, 2.2, { crit: [1, 4.5] }]]],
    ['CRP', 'C-Reactive Protein', 'Serology', 'Serum', 'Red / yellow top (SST)', 400, 60, [['CRP (quantitative)', 'mg/L', 0, 6]]],
    ['RAF', 'RA Factor', 'Serology', 'Serum', 'Red / yellow top (SST)', 350, 60, [['RA factor', 'IU/mL', 0, 14]]],
    ['ASO', 'ASO Titre', 'Serology', 'Serum', 'Red / yellow top (SST)', 400, 60, [['ASO titre', 'IU/mL', 0, 200]]],
    ['HIV', 'HIV I & II (rapid)', 'Serology', 'Serum', 'Red / yellow top (SST)', 300, 45, [['HIV I & II antibodies', '', null, null, { type: 'option', options: 'Non-reactive|Reactive' }]]],
    ['HBSAG', 'HBsAg (rapid)', 'Serology', 'Serum', 'Red / yellow top (SST)', 300, 45, [['HBsAg', '', null, null, { type: 'option', options: 'Non-reactive|Reactive' }]]],
    ['HCV', 'Anti-HCV (rapid)', 'Serology', 'Serum', 'Red / yellow top (SST)', 350, 45, [['Anti-HCV', '', null, null, { type: 'option', options: 'Non-reactive|Reactive' }]]],
    ['DENGUE', 'Dengue NS1 / IgM / IgG', 'Serology', 'Serum', 'Red / yellow top (SST)', 900, 60, [['NS1 antigen', '', null, null, { type: 'option', options: 'Negative|Positive' }], ['IgM antibody', '', null, null, { type: 'option', options: 'Negative|Positive' }], ['IgG antibody', '', null, null, { type: 'option', options: 'Negative|Positive' }]]],
    ['WIDAL', 'Widal Test', 'Serology', 'Serum', 'Red / yellow top (SST)', 250, 60, [['S. Typhi O', 'titre', null, null, { type: 'text', text: '< 1:80' }], ['S. Typhi H', 'titre', null, null, { type: 'text', text: '< 1:160' }], ['S. Paratyphi AH', 'titre', null, null, { type: 'text', text: '< 1:160' }], ['S. Paratyphi BH', 'titre', null, null, { type: 'text', text: '< 1:160' }]]],
    ['CUE', 'Complete Urine Examination', 'Urine', 'Urine (mid-stream)', 'Sterile urine container', 150, 45, [['Colour', '', null, null, { type: 'text', text: 'Pale yellow' }], ['Appearance', '', null, null, { type: 'text', text: 'Clear' }], ['Specific gravity', '', 1.005, 1.030], ['pH', '', 4.5, 8], ['Protein', '', null, null, { type: 'option', options: 'Nil|Trace|+|++|+++' }], ['Sugar', '', null, null, { type: 'option', options: 'Nil|Trace|+|++|+++' }], ['Pus cells', '/hpf', 0, 5], ['RBCs', '/hpf', 0, 2], ['Epithelial cells', '/hpf', 0, 5], ['Casts / crystals', '', null, null, { type: 'text', text: 'Nil' }]]],
    ['UPT', 'Urine Pregnancy Test', 'Urine', 'Urine (early morning)', 'Sterile urine container', 150, 20, [['Urine hCG', '', null, null, { type: 'option', options: 'Negative|Positive' }]]],
    ['BGRH', 'Blood Group & Rh Typing', 'Maternity', 'EDTA whole blood', 'Lavender top (EDTA)', 150, 30, [['ABO group', '', null, null, { type: 'option', options: 'A|B|AB|O' }], ['Rh (D) type', '', null, null, { type: 'option', options: 'Positive|Negative' }]]],
    ['VDRL', 'VDRL', 'Maternity', 'Serum', 'Red / yellow top (SST)', 200, 60, [['VDRL', '', null, null, { type: 'option', options: 'Non-reactive|Reactive' }]]],
    ['TSH', 'TSH', 'Maternity', 'Serum', 'Red / yellow top (SST)', 350, 240, [['TSH', 'µIU/mL', 0.4, 4.5]]],
    ['GTT', 'Glucose Tolerance Test (75 g)', 'Maternity', 'Fluoride plasma', 'Grey top (fluoride)', 350, 180, [['Fasting glucose', 'mg/dL', 70, 92], ['1 hour glucose', 'mg/dL', 0, 180], ['2 hour glucose', 'mg/dL', 0, 153]]],
    ['UCS', 'Urine Culture & Sensitivity', 'Microbiology', 'Urine (mid-stream, sterile)', 'Sterile urine container', 700, 2880, [['Organism isolated', '', null, null, { type: 'text', text: 'No growth after 48 h' }], ['Colony count', 'CFU/mL', null, null, { type: 'text' }], ['Sensitivity', '', null, null, { type: 'text' }]]],
    ['BCS', 'Blood Culture & Sensitivity', 'Microbiology', 'Blood (aseptic)', 'Blood culture bottle', 1200, 4320, [['Organism isolated', '', null, null, { type: 'text', text: 'No growth after 5 days' }], ['Sensitivity', '', null, null, { type: 'text' }]]],
    ['PCS', 'Pus Culture & Sensitivity', 'Microbiology', 'Pus swab', 'Sterile swab', 800, 2880, [['Gram stain', '', null, null, { type: 'text' }], ['Organism isolated', '', null, null, { type: 'text' }], ['Sensitivity', '', null, null, { type: 'text' }]]],
  ];
  const labDept = dept('LAB');
  for (const [code, name, section, sample, container, price, tat, params] of LAB) {
    const sid = svc(`LAB-${code}`, { name, category: 'lab', department_id: labDept, price, tat_minutes: tat, sample_type: sample, container, report_format: `${section} — tabular (parameter · result · unit · reference · flag)`, billing_unit: 'once' });
    params.forEach(([pname, unit, low, high, x = {}], seq) => {
      const f = { unit: unit || null, ref_low: low, ref_high: high, seq, ref_text: x.text || (low !== null || high !== null ? `${low ?? ''} - ${high ?? ''}${unit ? ' ' + unit : ''}` : null),
        ref_low_m: x.m?.[0] ?? null, ref_high_m: x.m?.[1] ?? null, ref_low_f: x.f?.[0] ?? null, ref_high_f: x.f?.[1] ?? null,
        ref_low_child: x.c?.[0] ?? null, ref_high_child: x.c?.[1] ?? null, child_max_age: x.c ? 12 : null,
        crit_low: x.crit?.[0] ?? null, crit_high: x.crit?.[1] ?? null, result_type: x.type || 'numeric', options: x.options || null };
      const row = get('SELECT id FROM lab_params WHERE service_id=? AND lower(name)=lower(?)', sid, pname);
      if (row) update('lab_params', row.id, f); else { n.labParams++; insert('lab_params', { service_id: sid, name: pname, ...f }); }
    });
  }

  /* --------------------------------------------------------------- imaging */
  const IMG = [['XR-CHEST', 'X-Ray Chest PA', 400, 30], ['XR-ABD', 'X-Ray Abdomen (erect)', 450, 30], ['XR-SPINE', 'X-Ray Spine (LS AP/Lat)', 600, 30], ['XR-LIMB', 'X-Ray Limb (two views)', 450, 30],
    ['USG-ABD', 'Ultrasound Abdomen', 1200, 60], ['USG-PEL', 'Ultrasound Pelvis', 1000, 60], ['USG-OBS', 'Obstetric Scan', 1200, 60], ['USG-NT', 'NT Scan (11–14 weeks)', 1800, 60],
    ['USG-ANOM', 'Anomaly Scan (18–22 weeks)', 2500, 90], ['USG-GROW', 'Growth Scan', 1500, 60], ['USG-DOP', 'Doppler Study', 2000, 60],
    ['CT-BRAIN', 'CT Brain (plain)', 2500, 120], ['CT-CHEST', 'CT Chest (HRCT)', 4000, 120], ['CT-ABD', 'CT Abdomen (contrast)', 6000, 180],
    ['MRI-BRAIN', 'MRI Brain', 7000, 240], ['MRI-SPINE', 'MRI Spine (LS)', 7500, 240], ['ECG', 'ECG 12 Lead', 250, 15], ['ECHO', '2D Echocardiography', 2000, 60]];
  for (const [code, name, price, tat] of IMG) svc(`IMG-${code}`, { name, category: 'imaging', department_id: dept(code === 'ECG' || code === 'ECHO' ? 'CARD' : 'RAD'), price, tat_minutes: tat, billing_unit: 'once', report_format: 'Technique · Findings · Impression · Advice' });
  const IMG_TPL = {
    'X-Ray Chest PA': 'Technique: PA erect view, adequate inspiration.\nFindings:\n- Trachea central. Mediastinum normal.\n- Both lung fields clear. No consolidation / effusion.\n- Cardiac size within normal limits (CTR < 0.5).\n- Costophrenic angles clear. Bony thorax normal.\nImpression: No significant abnormality detected.',
    'X-Ray Abdomen': 'Technique: Erect AP view.\nFindings:\n- No air-fluid levels. No free gas under diaphragm.\n- Bowel gas pattern normal. No radio-opaque calculus.\nImpression: Normal study.',
    'X-Ray Spine': 'Technique: AP and lateral views.\nFindings:\n- Alignment maintained. Vertebral heights preserved.\n- Disc spaces: [describe]. Osteophytes: [describe].\nImpression: [ ]',
    'X-Ray Limb': 'Technique: AP and lateral views of [region].\nFindings:\n- No fracture / dislocation. Joint spaces preserved. Soft tissues normal.\nImpression: No bony injury.',
    'Ultrasound Abdomen': 'Liver: Normal size and echotexture. No focal lesion.\nGall bladder: Distended, no calculus. Wall normal.\nCBD / portal vein: Normal calibre.\nPancreas / spleen: Normal.\nKidneys: Right __ cm, Left __ cm, normal corticomedullary differentiation, no calculus / hydronephrosis.\nUrinary bladder: Normal.\nImpression: Normal ultrasound abdomen.',
    'Ultrasound Pelvis': 'Uterus: Anteverted, __ x __ x __ cm, normal myometrium. Endometrium __ mm.\nOvaries: Right __ cc, Left __ cc, normal.\nPouch of Douglas: No free fluid.\nImpression: Normal pelvic ultrasound.',
    'Obstetric Scan': 'Single live intrauterine gestation.\nFetal heart rate: __ bpm, regular.\nBiometry: BPD __ mm, HC __ mm, AC __ mm, FL __ mm — corresponding to __ weeks __ days.\nPlacenta: __, grade __. Liquor: adequate (AFI __ cm).\nEFW: __ g.\nImpression: Single live intrauterine fetus of __ weeks.',
    'NT Scan': 'Single live fetus. CRL __ mm (__ weeks __ days).\nNuchal translucency: __ mm. Nasal bone: present.\nFHR: __ bpm. Ductus venosus: normal flow.\nImpression: NT within normal limits for gestation.',
    'Anomaly Scan': 'Single live fetus, __ weeks.\nHead / brain, face, spine, heart (4 chamber, outflow tracts), abdomen, kidneys, bladder, limbs: [normal / findings].\nPlacenta: __. Liquor: adequate.\nImpression: No structural anomaly detected on this scan.',
    'Growth Scan': 'Biometry: BPD __, HC __, AC __, FL __ mm — __ weeks. EFW __ g (__ centile).\nLiquor: AFI __ cm. Placenta: __.\nImpression: Fetal growth appropriate for gestation.',
    'Doppler Study': 'Umbilical artery PI __, RI __, S/D __.\nMiddle cerebral artery PI __. CPR __.\nUterine arteries: mean PI __.\nImpression: Normal fetoplacental circulation.',
    'CT Brain': 'Technique: Non-contrast axial sections.\nFindings:\n- No intra / extra-axial haemorrhage. No infarct.\n- Ventricles and sulci normal for age. Midline structures central.\n- Calvarium intact.\nImpression: Normal non-contrast CT brain.',
    'CT Chest': 'Technique: HRCT thin sections.\nFindings: Lung parenchyma: [ ]. Airways: [ ]. Mediastinum: [ ]. Pleura: [ ].\nCT severity score (if applicable): __ / 25.\nImpression: [ ]',
    'CT Abdomen': 'Technique: Contrast-enhanced axial sections.\nFindings: Liver, GB, pancreas, spleen, kidneys, bowel, peritoneum: [ ].\nImpression: [ ]',
    'MRI Brain': 'Sequences: T1, T2, FLAIR, DWI, GRE.\nFindings: Brain parenchyma [ ]. No restricted diffusion. Ventricles [ ].\nImpression: [ ]',
    'MRI Spine': 'Sequences: T1, T2 sagittal & axial.\nFindings: Alignment [ ]. Discs L1–S1: [ ]. Cord / conus: [ ]. Neural foramina: [ ].\nImpression: [ ]',
    'ECG 12 Lead': 'Rate: __ /min. Rhythm: sinus.\nAxis: normal. PR __ ms, QRS __ ms, QTc __ ms.\nST-T: no acute changes.\nImpression: Normal ECG.',
    '2D Echocardiography': 'Chambers: normal dimensions. LV function: normal, LVEF __ %.\nValves: no significant regurgitation / stenosis.\nNo RWMA. No pericardial effusion. IVC normal.\nImpression: Normal 2D echo study.',
  };
  for (const [name, body] of Object.entries(IMG_TPL)) template('imaging', name, body);

  /* ----------------------------------------------------- suppliers & payers */
  const SUP = [['SUP-APL', 'Sri Venkateswara Pharma Distributors', 'Andhra Pradesh', '37AAAFS1234D1Z5', 30], ['SUP-MED', 'Medline Surgicals & Consumables', 'Andhra Pradesh', '37AABCM5678E1Z9', 30],
    ['SUP-LIF', 'Lifeline Healthcare Agencies', 'Telangana', '36AACFL9012F1Z3', 45], ['SUP-GEN', 'Generic Medicines Wholesale (demo)', 'Andhra Pradesh', '37AADCG3456G1Z1', 21]];
  for (const [code, name, state, gstin, credit_days] of SUP) {
    upsert('suppliers', 'code', code, { name, state, gstin, credit_days, active: 1, contact: 'Sales desk (demo)', mobile: `9000${String(1000 + code.length * 137).slice(0, 6)}` }, 'suppliers');
  }
  const PAY = [['DEMO-STAR', 'Demo Star Health Insurance', 'insurance'], ['DEMO-NIA', 'Demo National Insurance', 'insurance'], ['DEMO-MDI', 'Demo MD India TPA', 'tpa'], ['DEMO-VID', 'Demo Vidal Health TPA', 'tpa'],
    ['DEMO-ARG', 'Dr. YSR Aarogyasri Health Care Trust (demo)', 'aarogyasri'], ['DEMO-CORP', 'Demo Infotech Pvt Ltd (corporate)', 'corporate'], ['DEMO-TRUST', 'Demo Sri Sai Charitable Trust', 'trust']];
  for (const [code, name, payer_type] of PAY) upsert('payers', 'code', code, { name, payer_type, credit_days: payer_type === 'aarogyasri' ? 45 : 30, active: 1, contact_person: 'Claims desk (demo)', phone: '1800000000', email: `${code.toLowerCase()}@claims.demo` }, 'payers');

  /* -------------------------------------------------------------- pharmacy */
  // [code, brand name, generic, strength, form, manufacturer, gst, schedule, units/pack, pack, rack, reorder, kind]
  const M = (code, name, generic, strength, form, mfr, gst = 12, schedule = 'H', upp = 10, pack = 'strip', rack = 'A1', reorder = 50, kind = 'medicine') => ({ code, name, generic, strength, form, mfr, gst, schedule, upp, pack, rack, reorder, kind });
  const MEDS = [
    // tablets & capsules
    M('PCM500', 'Pyrexa 500', 'Paracetamol', '500 mg', 'tablet', 'Demo Pharma Ltd', 12, 'OTC', 10), M('PCM650', 'Pyrexa 650', 'Paracetamol', '650 mg', 'tablet', 'Demo Pharma Ltd', 12, 'OTC', 15),
    M('PCM650B', 'Calmol 650', 'Paracetamol', '650 mg', 'tablet', 'Sunrise Generics', 12, 'OTC', 15), M('IBU400', 'Ibufen 400', 'Ibuprofen', '400 mg', 'tablet', 'Demo Pharma Ltd'),
    M('DICLO50', 'Diclomax 50', 'Diclofenac sodium', '50 mg', 'tablet', 'Sunrise Generics'), M('ACEC', 'Aceclo-P', 'Aceclofenac + Paracetamol', '100 mg + 325 mg', 'tablet', 'Demo Pharma Ltd'),
    M('AMOX500', 'Amoxil-D 500', 'Amoxicillin', '500 mg', 'capsule', 'Demo Pharma Ltd'), M('AUG625', 'Clavam-D 625', 'Amoxicillin + Clavulanic acid', '500 mg + 125 mg', 'tablet', 'Sunrise Generics', 12, 'H', 6),
    M('AZI500', 'Azimax 500', 'Azithromycin', '500 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 3), M('CEF200', 'Cefix 200', 'Cefixime', '200 mg', 'tablet', 'Sunrise Generics'),
    M('CIP500', 'Ciprolet-D 500', 'Ciprofloxacin', '500 mg', 'tablet', 'Demo Pharma Ltd'), M('OFL200', 'Oflox-D 200', 'Ofloxacin', '200 mg', 'tablet', 'Sunrise Generics'),
    M('METRO400', 'Metrogyl-D 400', 'Metronidazole', '400 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15), M('DOXY100', 'Doxy-D 100', 'Doxycycline', '100 mg', 'capsule', 'Sunrise Generics'),
    M('PAN40', 'Pantop-D 40', 'Pantoprazole', '40 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15), M('PAN40B', 'Pantasafe 40', 'Pantoprazole', '40 mg', 'tablet', 'Sunrise Generics', 12, 'H', 15),
    M('OME20', 'Omez-D 20', 'Omeprazole', '20 mg', 'capsule', 'Demo Pharma Ltd', 12, 'H', 15), M('RANI150', 'Ranitid 150', 'Famotidine', '20 mg', 'tablet', 'Sunrise Generics'),
    M('ONDA4', 'Emeset-D 4', 'Ondansetron', '4 mg', 'tablet', 'Demo Pharma Ltd'), M('DOM10', 'Domstal-D 10', 'Domperidone', '10 mg', 'tablet', 'Sunrise Generics'),
    M('CET10', 'Cetzine-D 10', 'Cetirizine', '10 mg', 'tablet', 'Demo Pharma Ltd', 12, 'OTC'), M('LEVO5', 'Levocet-D 5', 'Levocetirizine', '5 mg', 'tablet', 'Sunrise Generics', 12, 'OTC'),
    M('MONT10', 'Montair-D LC', 'Montelukast + Levocetirizine', '10 mg + 5 mg', 'tablet', 'Demo Pharma Ltd'), M('MET500', 'Glyco-D 500', 'Metformin', '500 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15),
    M('GLIM1', 'Glimy-D 1', 'Glimepiride', '1 mg', 'tablet', 'Sunrise Generics', 12, 'H', 15), M('AMLO5', 'Amlopres-D 5', 'Amlodipine', '5 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15),
    M('TEL40', 'Telma-D 40', 'Telmisartan', '40 mg', 'tablet', 'Sunrise Generics', 12, 'H', 15), M('ATOR10', 'Atorva-D 10', 'Atorvastatin', '10 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15),
    M('ASP75', 'Ecosprin-D 75', 'Aspirin', '75 mg', 'tablet', 'Sunrise Generics', 12, 'H', 14), M('CLOP75', 'Clopilet-D 75', 'Clopidogrel', '75 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15),
    M('METO25', 'Metolar-D 25', 'Metoprolol succinate', '25 mg', 'tablet', 'Sunrise Generics', 12, 'H', 15), M('FURO40', 'Lasix-D 40', 'Furosemide', '40 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 15),
    M('THY50', 'Thyrox-D 50', 'Levothyroxine', '50 mcg', 'tablet', 'Sunrise Generics', 12, 'H', 100, 'bottle'), M('FOL5', 'Folvite-D', 'Folic acid', '5 mg', 'tablet', 'Demo Pharma Ltd', 12, 'OTC', 30),
    M('FE100', 'Ferro-D XT', 'Ferrous ascorbate + Folic acid', '100 mg + 1.5 mg', 'tablet', 'Sunrise Generics', 12, 'OTC', 10), M('CALD', 'Calci-D3', 'Calcium carbonate + Vitamin D3', '500 mg + 250 IU', 'tablet', 'Demo Pharma Ltd', 12, 'OTC', 15),
    M('BCOM', 'Becosule-D', 'Vitamin B complex', '—', 'capsule', 'Sunrise Generics', 12, 'OTC', 20), M('ALP05', 'Alprax-D 0.5', 'Alprazolam', '0.5 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H1', 10),
    M('TRAM50', 'Tramadol-D 50', 'Tramadol', '50 mg', 'capsule', 'Sunrise Generics', 12, 'H1', 10), M('PRED10', 'Wysolone-D 10', 'Prednisolone', '10 mg', 'tablet', 'Demo Pharma Ltd'),
    M('DEXA05', 'Dexona-D', 'Dexamethasone', '0.5 mg', 'tablet', 'Sunrise Generics', 12, 'H', 30), M('ALB4', 'Asthalin-D 4', 'Salbutamol', '4 mg', 'tablet', 'Demo Pharma Ltd'),
    M('MISO200', 'Misoprost-D 200', 'Misoprostol', '200 mcg', 'tablet', 'Sunrise Generics', 12, 'H', 4), M('LABET100', 'Labetol-D 100', 'Labetalol', '100 mg', 'tablet', 'Demo Pharma Ltd', 12, 'H', 10),
    // syrups, suspensions, drops
    M('PCMSYR', 'Pyrexa Syrup', 'Paracetamol', '120 mg/5 mL', 'syrup', 'Demo Pharma Ltd', 12, 'OTC', 1, 'bottle', 'B1', 20), M('PCMDRP', 'Pyrexa Drops', 'Paracetamol', '100 mg/mL', 'drops', 'Demo Pharma Ltd', 12, 'OTC', 1, 'bottle', 'B1', 20),
    M('AMOXSUS', 'Amoxil-D Suspension', 'Amoxicillin', '125 mg/5 mL', 'suspension', 'Sunrise Generics', 12, 'H', 1, 'bottle', 'B1', 15), M('AZISUS', 'Azimax Suspension', 'Azithromycin', '200 mg/5 mL', 'suspension', 'Demo Pharma Ltd', 12, 'H', 1, 'bottle', 'B1', 15),
    M('CETSYR', 'Cetzine-D Syrup', 'Cetirizine', '5 mg/5 mL', 'syrup', 'Demo Pharma Ltd', 12, 'OTC', 1, 'bottle', 'B1', 15), M('COUGH', 'Coldex-D Syrup', 'Chlorpheniramine + Phenylephrine', '2 mg + 5 mg / 5 mL', 'syrup', 'Sunrise Generics', 12, 'OTC', 1, 'bottle', 'B1', 15),
    M('ONDSYR', 'Emeset-D Syrup', 'Ondansetron', '2 mg/5 mL', 'syrup', 'Demo Pharma Ltd', 12, 'H', 1, 'bottle', 'B1', 10), M('LACT', 'Lactulose-D', 'Lactulose', '10 g/15 mL', 'syrup', 'Sunrise Generics', 12, 'OTC', 1, 'bottle', 'B2', 10),
    M('ZINC', 'Zinco-D Syrup', 'Zinc sulphate', '20 mg/5 mL', 'syrup', 'Demo Pharma Ltd', 12, 'OTC', 1, 'bottle', 'B2', 15),
    // injections, vials, ampoules
    M('CEFTRI1', 'Ceftri-D 1 g', 'Ceftriaxone', '1 g', 'injection', 'Demo Pharma Ltd', 12, 'H', 1, 'vial', 'C1', 30), M('PIPTAZ', 'Piptaz-D 4.5 g', 'Piperacillin + Tazobactam', '4 g + 0.5 g', 'injection', 'Sunrise Generics', 12, 'H', 1, 'vial', 'C1', 15),
    M('MERO1', 'Meropen-D 1 g', 'Meropenem', '1 g', 'injection', 'Demo Pharma Ltd', 12, 'H', 1, 'vial', 'C1', 10), M('AMIK500', 'Amikin-D 500', 'Amikacin', '500 mg/2 mL', 'injection', 'Sunrise Generics', 12, 'H', 1, 'vial', 'C1', 15),
    M('PANINJ', 'Pantop-D IV', 'Pantoprazole', '40 mg', 'injection', 'Demo Pharma Ltd', 12, 'H', 1, 'vial', 'C1', 30), M('ONDINJ', 'Emeset-D Injection', 'Ondansetron', '2 mg/mL (2 mL)', 'injection', 'Demo Pharma Ltd', 12, 'H', 5, 'ampoule', 'C2', 30),
    M('PCMINJ', 'Pyrexa IV 1 g', 'Paracetamol', '1 g/100 mL', 'injection', 'Demo Pharma Ltd', 12, 'H', 1, 'bottle', 'C2', 20), M('DICINJ', 'Diclomax-D Injection', 'Diclofenac sodium', '75 mg/3 mL', 'injection', 'Sunrise Generics', 12, 'H', 5, 'ampoule', 'C2', 20),
    M('TRAMINJ', 'Tramadol-D Injection', 'Tramadol', '50 mg/mL (2 mL)', 'injection', 'Sunrise Generics', 12, 'H1', 5, 'ampoule', 'C2', 10), M('DEXINJ', 'Dexona-D Injection', 'Dexamethasone', '4 mg/mL (2 mL)', 'injection', 'Sunrise Generics', 12, 'H', 5, 'ampoule', 'C2', 20),
    M('HYDINJ', 'Hydrocort-D 100', 'Hydrocortisone', '100 mg', 'injection', 'Demo Pharma Ltd', 12, 'H', 1, 'vial', 'C2', 10), M('ADR', 'Adrenaline-D', 'Adrenaline', '1 mg/mL', 'injection', 'Demo Pharma Ltd', 12, 'H', 10, 'ampoule', 'C3', 20),
    M('ATRO', 'Atropine-D', 'Atropine sulphate', '0.6 mg/mL', 'injection', 'Sunrise Generics', 12, 'H', 10, 'ampoule', 'C3', 20), M('FURINJ', 'Lasix-D Injection', 'Furosemide', '10 mg/mL (2 mL)', 'injection', 'Demo Pharma Ltd', 12, 'H', 10, 'ampoule', 'C3', 15),
    M('HEP5K', 'Heparin-D 5000', 'Heparin sodium', '5000 IU/mL', 'injection', 'Sunrise Generics', 12, 'H', 1, 'vial', 'C3', 10), M('ENOX40', 'Enoxa-D 40', 'Enoxaparin', '40 mg/0.4 mL', 'injection', 'Demo Pharma Ltd', 12, 'H', 1, 'prefilled syringe', 'C3', 10),
    M('INSR', 'Insulin-D Regular', 'Human insulin (regular)', '40 IU/mL', 'injection', 'Sunrise Generics', 5, 'H', 1, 'vial', 'FRIDGE', 10), M('OXY', 'Oxytocin-D', 'Oxytocin', '5 IU/mL', 'injection', 'Demo Pharma Ltd', 12, 'H', 10, 'ampoule', 'FRIDGE', 20),
    M('MGSO4', 'Magsulf-D 50%', 'Magnesium sulphate', '500 mg/mL (2 mL)', 'injection', 'Sunrise Generics', 12, 'H', 10, 'ampoule', 'C3', 20), M('TT', 'Tetanus Toxoid-D', 'Tetanus toxoid', '0.5 mL', 'injection', 'Demo Pharma Ltd', 5, 'H', 1, 'vial', 'FRIDGE', 20),
    M('VITK', 'Vitamin K-D', 'Phytomenadione', '1 mg/0.5 mL', 'injection', 'Sunrise Generics', 12, 'H', 5, 'ampoule', 'FRIDGE', 10), M('MIDA', 'Midazo-D', 'Midazolam', '1 mg/mL (5 mL)', 'injection', 'Demo Pharma Ltd', 12, 'X', 5, 'vial', 'NARC', 5),
    M('MORPH', 'Morphine-D', 'Morphine sulphate', '10 mg/mL', 'injection', 'Demo Pharma Ltd', 12, 'X', 10, 'ampoule', 'NARC', 5),
    // IV fluids
    M('NS500', 'Normal Saline 500 mL', 'Sodium chloride', '0.9% w/v', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F1', 100), M('NS100', 'Normal Saline 100 mL', 'Sodium chloride', '0.9% w/v (100 mL)', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F1', 100),
    M('RL500', 'Ringer Lactate 500 mL', 'Compound sodium lactate', '500 mL', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F1', 100), M('DNS500', 'DNS 500 mL', 'Dextrose 5% + Sodium chloride 0.9%', '500 mL', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F1', 80),
    M('D5', 'Dextrose 5% 500 mL', 'Dextrose', '5% w/v', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F1', 80), M('D10', 'Dextrose 10% 500 mL', 'Dextrose', '10% w/v', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F2', 40),
    M('ISOP', 'Isolyte-P 500 mL (paediatric)', 'Multiple electrolytes + Dextrose (paediatric)', '500 mL', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F2', 30), M('N2DNS', 'N/2 DNS 500 mL (paediatric)', 'Dextrose 5% + Sodium chloride 0.45%', '500 mL', 'iv fluid', 'Demo Parenterals', 12, 'OTC', 1, 'bottle', 'F2', 30),
    M('MANN', 'Mannitol 20% 100 mL', 'Mannitol', '20% w/v', 'iv fluid', 'Demo Parenterals', 12, 'H', 1, 'bottle', 'F2', 10),
    // topical, drops, inhalation, others
    M('MUP', 'Mupi-D Ointment', 'Mupirocin', '2% w/w (5 g)', 'ointment', 'Sunrise Generics', 12, 'H', 1, 'tube', 'D1', 15), M('SSD', 'Silverex-D Cream', 'Silver sulfadiazine', '1% w/w (50 g)', 'cream', 'Demo Pharma Ltd', 12, 'H', 1, 'tube', 'D1', 10),
    M('CLOT', 'Candid-D Cream', 'Clotrimazole', '1% w/w (15 g)', 'cream', 'Sunrise Generics', 12, 'OTC', 1, 'tube', 'D1', 15), M('DICLGEL', 'Diclomax Gel', 'Diclofenac diethylamine', '1.16% w/w (30 g)', 'gel', 'Demo Pharma Ltd', 12, 'OTC', 1, 'tube', 'D1', 15),
    M('CALAM', 'Calamine-D Lotion', 'Calamine', '8% (100 mL)', 'lotion', 'Sunrise Generics', 12, 'OTC', 1, 'bottle', 'D1', 10), M('NEOSP', 'Neosporin-D Powder', 'Neomycin + Bacitracin + Polymyxin B', '10 g', 'powder', 'Demo Pharma Ltd', 12, 'OTC', 1, 'bottle', 'D2', 10),
    M('ORS', 'Electral-D ORS', 'Oral rehydration salts (WHO)', '21.8 g sachet', 'sachet', 'Demo Pharma Ltd', 12, 'OTC', 1, 'sachet', 'D2', 100), M('CIPEYE', 'Ciplox-D Eye Drops', 'Ciprofloxacin', '0.3% (5 mL)', 'eye drops', 'Sunrise Generics', 12, 'H', 1, 'bottle', 'D2', 15),
    M('MOXEYE', 'Moxicip-D Eye Drops', 'Moxifloxacin', '0.5% (5 mL)', 'eye drops', 'Demo Pharma Ltd', 12, 'H', 1, 'bottle', 'D2', 10), M('WAXOL', 'Waxsolv-D Ear Drops', 'Paradichlorobenzene + Benzocaine', '10 mL', 'ear drops', 'Sunrise Generics', 12, 'OTC', 1, 'bottle', 'D2', 10),
    M('OTRIV', 'Nasoclear-D Nasal Drops', 'Xylometazoline', '0.05% (10 mL)', 'nasal drops', 'Demo Pharma Ltd', 12, 'OTC', 1, 'bottle', 'D2', 10), M('SALINH', 'Asthalin-D Inhaler', 'Salbutamol', '100 mcg/dose', 'inhaler', 'Sunrise Generics', 12, 'H', 1, 'inhaler', 'D3', 10),
    M('BUDINH', 'Budecort-D Inhaler', 'Budesonide', '200 mcg/dose', 'inhaler', 'Demo Pharma Ltd', 12, 'H', 1, 'inhaler', 'D3', 10), M('SALNEB', 'Asthalin-D Respules', 'Salbutamol', '2.5 mg/2.5 mL', 'nebulisation', 'Sunrise Generics', 12, 'H', 5, 'respule', 'D3', 30),
    M('BUDNEB', 'Budecort-D Respules', 'Budesonide', '0.5 mg/2 mL', 'nebulisation', 'Demo Pharma Ltd', 12, 'H', 5, 'respule', 'D3', 30), M('IPRNEB', 'Duolin-D Respules', 'Ipratropium + Levosalbutamol', '500 mcg + 1.25 mg', 'nebulisation', 'Sunrise Generics', 12, 'H', 5, 'respule', 'D3', 30),
    M('PCMSUP', 'Pyrexa Suppository 170', 'Paracetamol', '170 mg', 'suppository', 'Demo Pharma Ltd', 12, 'OTC', 5, 'strip', 'D3', 10), M('DULCO', 'Bisacodyl-D Suppository', 'Bisacodyl', '10 mg', 'suppository', 'Sunrise Generics', 12, 'OTC', 5, 'strip', 'D3', 10),
    M('POVI', 'Povidone-D Iodine 5%', 'Povidone iodine', '5% (500 mL)', 'antiseptic', 'Demo Parenterals', 18, 'OTC', 1, 'bottle', 'E1', 10), M('CHLX', 'Chlorhexi-D Scrub', 'Chlorhexidine gluconate', '4% (500 mL)', 'antiseptic', 'Demo Parenterals', 18, 'OTC', 1, 'bottle', 'E1', 10),
    M('SPIRIT', 'Surgical Spirit 500 mL', 'Isopropyl alcohol', '70% (500 mL)', 'antiseptic', 'Demo Parenterals', 18, 'OTC', 1, 'bottle', 'E1', 10), M('H2O2', 'Hydrogen Peroxide 6%', 'Hydrogen peroxide', '6% (500 mL)', 'antiseptic', 'Demo Parenterals', 18, 'OTC', 1, 'bottle', 'E1', 10),
    // consumables
    ...[['SYR2', 'Syringe 2 mL with needle'], ['SYR5', 'Syringe 5 mL with needle'], ['SYR10', 'Syringe 10 mL with needle'], ['SYR50', 'Syringe 50 mL (pump)'], ['NDL22', 'Hypodermic needle 22G'],
      ['GLVEX', 'Examination gloves (pair)'], ['GLVST', 'Sterile surgical gloves 7.0 (pair)'], ['MASK3', 'Surgical mask 3-ply'], ['N95', 'N95 respirator'], ['IVSET', 'IV infusion set'],
      ['MICRO', 'Micro drip set (paediatric)'], ['CAN18', 'IV cannula 18G'], ['CAN20', 'IV cannula 20G'], ['CAN22', 'IV cannula 22G'], ['CAN24', 'IV cannula 24G (paediatric)'],
      ['FOL14', 'Foley catheter 14 Fr'], ['FOL16', 'Foley catheter 16 Fr'], ['UBAG', 'Urine collection bag 2 L'], ['RT16', 'Ryles / feeding tube 16 Fr'], ['FEED8', 'Infant feeding tube 8 Fr'],
      ['GAUZE', 'Gauze swab 10 x 10 cm (pack)'], ['COTTON', 'Absorbent cotton roll 500 g'], ['DRESS', 'Adhesive wound dressing 10 x 10 cm'], ['CREPE', 'Crepe bandage 10 cm'], ['MICROP', 'Micropore tape 1 inch'],
      ['SUT2', 'Suture silk 2-0 (cutting)'], ['SUTV', 'Suture absorbable 1-0 (round body)'], ['BLD11', 'Surgical blade No. 11'], ['BLD22', 'Surgical blade No. 22'], ['DRAPE', 'Sterile OT drape sheet'],
      ['GOWN', 'Sterile surgical gown'], ['CAPS', 'OT cap (disposable)'], ['SPONGE', 'Laparotomy sponge (pack of 5)'], ['ECGEL', 'ECG electrode (pack of 10)'], ['O2MASK', 'Oxygen mask (adult)']]
      .map(([code, name]) => M(`CON-${code}`, name, name, '', 'consumable', 'Medline Surgicals (demo)', 12, 'OTC', 1, 'piece', 'G1', 50, 'consumable')),
  ];
  for (const m of MEDS) {
    const generic = m.generic, strength = m.strength || null;
    const composition = m.kind === 'consumable' ? '[]' : JSON.stringify(generic.split(' + ').map((g, i) => ({ generic: g.trim(), strength: (strength || '').split(' + ')[i]?.trim() || strength || '' })));
    const fields = { name: m.name, generic, strength, form: m.form, manufacturer: m.mfr, brand: m.name.split(' ')[0], schedule: m.schedule === 'OTC' ? 'OTC' : m.schedule,
      narcotic: m.schedule === 'X' ? 1 : 0, hsn: m.kind === 'consumable' ? '9018' : '3004', gst_pct: m.gst, default_cgst_pct: m.gst / 2, default_sgst_pct: m.gst / 2, rack: m.rack,
      reorder_level: m.reorder, active: 1, kind: m.kind, purchase_unit: m.pack, package_type: m.pack, pack_size: 1, units_per_pack: m.upp,
      dispensing_unit: ['tablet', 'capsule'].includes(m.form) ? m.form : m.kind === 'consumable' ? 'piece' : m.pack, composition };
    upsert('medicines', 'code', `DM-${m.code}`, fields, 'medicines');
  }

  /* ---------------------------------------------------------- doctor templates */
  const T = (complaints, hopi, exam, diagnosis, investigations, plan, advice, followUp, extra = '') => [
    `Chief Complaints:\n${complaints}`, `History of Present Illness:\n${hopi}`,
    'Past History:\n- [Diabetes / Hypertension / Asthma / TB / Thyroid / Epilepsy — nil known]',
    'Surgical History:\n- [nil / details]', 'Drug History:\n- [current medicines]', 'Allergy:\n- [No known drug allergy / specify]',
    'Family History:\n- [nil significant]', 'Vitals:\n- BP __/__ mmHg, Pulse __/min, Temp __ °F, SpO2 __ %, RR __/min, Weight __ kg',
    `Examination:\n${exam}`, `Diagnosis:\n${diagnosis}`, `Investigations:\n${investigations}`, `Plan:\n${plan}`, `Advice:\n${advice}`,
    'Diet:\n- [as advised]', `Follow-up:\n${followUp}`, 'Admission recommendation:\n- [Not required / Admit to __ for __]', 'Referral:\n- [nil / refer to __]', extra ? `Clinical Notes:\n${extra}` : 'Clinical Notes:\n- ',
  ].join('\n\n');
  const DOC = {
    'General Medicine — OP': T('- Fever / body pains / cough for __ days', '- Onset, duration, progression, associated symptoms', '- General: conscious, oriented, no pallor / icterus / cyanosis / oedema\n- CVS: S1 S2 heard, no murmur\n- RS: NVBS, no added sounds\n- P/A: soft, non-tender', '- [Provisional diagnosis]', '- CBC, RBS, CUE [as indicated]', '- Medicines as prescribed', '- Rest, plenty of oral fluids', '- Review after __ days with reports'),
    'Pediatrics — OP': T('- Fever / cough / loose stools for __ days', '- Feeding, activity, urine output, immunisation status', '- Weight __ kg, Height __ cm, Head circumference __ cm\n- Hydration: [ ]\n- CVS / RS / P/A / CNS: [ ]', '- [ ]', '- CBC, CRP [as indicated]', '- Weight-based dosing as prescribed', '- Breast-feed / ORS, watch danger signs (lethargy, poor feeding, breathlessness)', '- Review after __ days', 'Immunisation status: up to date / due __'),
    'OBGYN — Gynaecology OP': T('- [Menstrual / pelvic pain / white discharge] for __', '- LMP __, cycles __ days, flow __', '- Per abdomen: [ ]\n- Per speculum / per vaginum (with chaperone): [ ]', '- [ ]', '- CBC, TSH, USG pelvis [as indicated]', '- [ ]', '- [ ]', '- Review after __'),
    'Maternity — Admission for delivery': T('- Pain abdomen / leaking / bleeding P/V since __', '- G_P_L_A_, __ weeks by LMP / dating scan, ANC visits __', '- BP __, PR __\n- P/A: uterus __ weeks, presentation __, FHR __ bpm\n- P/V: cervix __ cm, effacement __ %, station __, membranes __', '- G_P_L_A_ at __ weeks in [latent / active] labour', '- CBC, blood group & Rh, HIV, HBsAg, VDRL, CUE', '- Admit to labour room, partograph, CTG', '- [ ]', '- Postnatal review'),
    'Orthopedics — OP': T('- Pain / swelling of [joint / limb] for __', '- Mechanism of injury, onset, aggravating factors', '- Inspection / palpation / range of movement / distal neurovascular status', '- [ ]', '- X-ray [region] two views', '- Analgesics, immobilisation / physiotherapy', '- Limb elevation, ice packs, avoid weight bearing [as advised]', '- Review after __ days'),
    'General Surgery — OP / pre-op': T('- Swelling / pain [site] for __', '- Onset, progression, associated symptoms', '- Local examination: site, size, consistency, tenderness, reducibility', '- [ ]', '- CBC, RBS, RFT, HIV, HBsAg, ECG, X-ray chest (pre-anaesthetic)', '- Planned for [procedure] under [anaesthesia]', '- Nil by mouth from __; consent explained', '- Review after surgery'),
    'ENT — OP': T('- Ear pain / discharge / sore throat / nasal block for __', '- [ ]', '- Ear: [ ]\n- Nose: [ ]\n- Throat: [ ]', '- [ ]', '- [as indicated]', '- [ ]', '- Avoid water in ear, steam inhalation [as advised]', '- Review after __'),
    'Dermatology — OP': T('- Itchy rash / skin lesion over __ for __', '- Spread, triggers, treatments tried', '- Lesion morphology: type, distribution, configuration, secondary changes', '- [ ]', '- [as indicated]', '- Topical / oral therapy as prescribed', '- Skin care, avoid irritants', '- Review after __'),
    'Cardiology — OP': T('- Chest pain / breathlessness / palpitations for __', '- Character, radiation, exertional, NYHA class __', '- JVP, peripheral pulses, CVS: [ ], RS: [ ]', '- [ ]', '- ECG, 2D echo, lipid profile, troponin [as indicated]', '- [ ]', '- Low-salt diet, regular medicines, report chest pain immediately', '- Review after __'),
    'Emergency — casualty assessment': T('- [presenting complaint] since __', '- Mode of arrival, events, time of onset', '- Airway / Breathing / Circulation / Disability (GCS __) / Exposure\n- Primary and secondary survey', '- [ ]', '- RBS, ECG, CBC, RFT, ABG, imaging [as indicated]', '- Resuscitation, IV access, monitoring, analgesia', '- [ ]', '- Admit / observe / discharge with advice', 'Triage category: P__. MLC: yes / no.'),
    'ICU — daily progress note': T('- Day __ of ICU stay', '- Overnight events', '- GCS __, BP __, HR __, SpO2 __ on __, urine output __ mL/24 h\n- Ventilator: mode __, FiO2 __, PEEP __\n- Lines / drains: [ ]', '- [ ]', '- ABG, CBC, RFT, electrolytes, cultures [as indicated]', '- Vasopressors / antibiotics / sedation as charted', '- Nutrition: [ ]', '- Reassess in __ h; plan step-down when stable', 'DVT prophylaxis / stress ulcer prophylaxis / glycaemic control reviewed.'),
    'Follow-up visit': T('- Follow-up for __', '- Symptoms since last visit, medicine compliance', '- [focused examination]', '- [ ]', '- Review of reports: [ ]', '- Continue / modify medicines', '- [ ]', '- Next review after __'),
    'Antenatal visit': T('- Routine antenatal visit, __ weeks', '- Fetal movements, bleeding / leaking / headache / visual symptoms', '- Weight __ kg, BP __, oedema __\n- Fundal height __ cm, presentation __, FHR __ bpm', '- G_P_L_A_ at __ weeks — [normal / risk factors]', '- Hb, blood group, HIV, HBsAg, VDRL, TSH, GTT, USG [as per schedule]', '- Iron, folic acid, calcium; TT as scheduled', '- Diet, rest, danger signs explained', '- Next ANC visit after __ weeks'),
    'Postnatal visit': T('- Postnatal day __ after [NVD / LSCS]', '- Pain, bleeding, breast-feeding, urination', '- BP __, PR __, Temp __\n- Breasts: [ ]\n- Uterus: involuting, __ cm\n- Lochia: [ ]\n- Episiotomy / wound: [ ]', '- Normal puerperium / [ ]', '- Hb [as indicated]', '- Iron, calcium continued', '- Breast-feeding, perineal hygiene, family planning counselling', '- Review at 6 weeks', 'Baby: weight __ g, feeding well, vaccines BCG / OPV / Hep B given.'),
  };
  for (const [name, body] of Object.entries(DOC)) template('consultation', name, body);

  /* --------------------------------------------------------- nursing templates */
  const NUR = (unit, extra) => `${unit} — nursing chart (shift: Morning / Evening / Night)

Vitals: Temp __ °F | Pulse __/min | RR __/min | BP __/__ mmHg | SpO2 __ % | GRBS __ mg/dL | Pain score __/10${extra.gcs ? ' | GCS E_V_M_ = __' : ''}
Intake: Oral __ mL | IV fluids __ (type / rate) __ mL | Feeds __ mL
Output: Urine __ mL (urine output __ mL/kg/h) | Drains __ mL | Vomitus / stool __
Oxygen: __ L/min via __${extra.vent ? ' | Ventilator: mode __, FiO2 __, PEEP __' : ''}
Medications given: [as per eMAR — time / drug / dose / route / nurse]
Injections / nebulisation: [ ]
Diet: [ ]
Doctor orders carried out: [ ]
Fall risk (Morse): __ | Pressure sore (Braden): __ | Position change every 2 h: yes / no
${extra.more || ''}Patient condition: Stable / Improving / Deteriorating — [ ]
Escalation: Informed Dr. __ at __ for __ / none
Shift handover: Given to __ at __. Pending: [ ]`;
  const NURSING = {
    'General ward — nursing chart': NUR('General ward', {}),
    'ICU — nursing chart': NUR('ICU', { gcs: 1, vent: 1, more: 'Lines: central __ / arterial __ / IV __ (sites checked) | Sedation score __ | Vasopressors __\n' }),
    'NICU — nursing chart': NUR('NICU', { vent: 1, more: 'Weight __ g | Temperature (axillary) __ °C | Warmer / phototherapy __ | Feeds: EBM / formula __ mL every __ h | Jaundice __\n' }),
    'PICU — nursing chart': NUR('PICU', { gcs: 1, vent: 1, more: 'Weight __ kg | Fluids per kg __ | Parent informed: yes / no\n' }),
    'Emergency — nursing chart': NUR('Emergency', { gcs: 1, more: 'Triage category P__ | Time of arrival __ | MLC: yes / no\n' }),
    'OT — intra-operative nursing': NUR('OT', { more: 'WHO surgical safety checklist: sign-in / time-out / sign-out done | Instrument & swab count correct: yes / no | Specimen sent: __\n' }),
    'Post-operative — nursing chart': NUR('Post-operative', { gcs: 1, more: 'Surgery __ on __ | Wound / dressing __ | Drain __ mL | Aldrete score __ | Ambulation __\n' }),
    'Maternity (postnatal) — nursing chart': NUR('Maternity', { more: 'Uterus: firm / boggy, fundal height __ | Lochia __ | Breast-feeding __ | Perineum / suture line __ | Baby with mother: yes / no\n' }),
    'Labour room — monitoring chart': NUR('Labour room', { more: 'FHR __ bpm (every 30 min in active labour) | Contractions __ in 10 min, lasting __ s | Cervix __ cm | Liquor __ | Partograph updated: yes / no\n' }),
  };
  for (const [name, body] of Object.entries(NURSING)) template('nursing', name, body);

  /* ------------------------------------------------------ maintenance & assets */
  const D = (days) => { const d = new Date(Date.now() + days * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // [code, name, type, dept, location, make, purchased (days ago), warranty (days from now), amc (days), vendor, last service (days ago), next (days), status]
  const ASSETS = [
    ['AST-0001', 'Multipara monitor ICU-01', 'Monitor', 'ICU', 'Critical Care Block · ICU bed 01', 'Demo Medical Systems MX-500', 900, 200, 365, 'Demo Biomed Services', 40, 50, 'active'],
    ['AST-0002', 'Multipara monitor ICU-02', 'Monitor', 'ICU', 'Critical Care Block · ICU bed 02', 'Demo Medical Systems MX-500', 900, 200, 365, 'Demo Biomed Services', 100, 5, 'active'],
    ['AST-0003', 'ICU ventilator V1', 'Ventilator', 'ICU', 'Critical Care Block · ICU', 'Demo Respira VT-300', 700, 400, 365, 'Demo Respiratory Care', 30, 60, 'active'],
    ['AST-0004', 'ICU ventilator V2', 'Ventilator', 'ICU', 'Critical Care Block · ICU', 'Demo Respira VT-300', 700, 400, 365, 'Demo Respiratory Care', 200, -10, 'out_of_service'],
    ['AST-0005', 'NICU radiant warmer 1', 'Medical device', 'PED', 'Mother & Child Block · NICU', 'Demo Neo RW-2', 500, 300, 365, 'Demo Neonatal Equipments', 60, 30, 'active'],
    ['AST-0006', 'Phototherapy unit', 'Medical device', 'PED', 'Mother & Child Block · NICU', 'Demo Neo PT-LED', 450, 300, 365, 'Demo Neonatal Equipments', 90, 3, 'active'],
    ['AST-0007', 'Fowler bed ICU-03', 'Bed', 'ICU', 'Critical Care Block · ICU bed 03', 'Demo Furnishing Motorised', 1200, -100, 0, 'Demo Hospital Furniture', 300, 65, 'active'],
    ['AST-0008', 'Defibrillator (ER)', 'Medical device', 'EMER', 'Emergency Block · Resus bay', 'Demo Cardiac D-200', 600, 500, 365, 'Demo Biomed Services', 20, 70, 'active'],
    ['AST-0009', 'OT table (major OT)', 'OT equipment', 'OT', 'Surgical Block · OT-1', 'Demo Surgicals OT-H', 1000, 100, 365, 'Demo OT Solutions', 50, 40, 'active'],
    ['AST-0010', 'Anaesthesia workstation', 'OT equipment', 'OT', 'Surgical Block · OT-1', 'Demo Anaes AW-5', 800, 300, 365, 'Demo OT Solutions', 45, 45, 'active'],
    ['AST-0011', 'Autoclave (CSSD)', 'OT equipment', 'OT', 'Surgical Block · CSSD', 'Demo Steri AC-120', 1500, -400, 200, 'Demo Sterilisation', 15, 75, 'active'],
    ['AST-0012', 'Haematology analyser', 'Lab equipment', 'LAB', 'Laboratory · Haematology', 'Demo Diagnostics H-5', 650, 400, 365, 'Demo Lab Instruments', 35, 55, 'active'],
    ['AST-0013', 'Biochemistry analyser', 'Lab equipment', 'LAB', 'Laboratory · Biochemistry', 'Demo Diagnostics B-300', 650, 400, 365, 'Demo Lab Instruments', 80, 10, 'active'],
    ['AST-0014', 'Lab refrigerator (reagents)', 'Refrigerator', 'LAB', 'Laboratory', 'Demo Cool LR-300', 900, 100, 0, 'Demo Cooling Services', 120, 30, 'active'],
    ['AST-0015', 'Pharmacy vaccine refrigerator', 'Refrigerator', 'PHAR', 'Central Pharmacy', 'Demo Cool VR-150', 400, 600, 365, 'Demo Cooling Services', 30, 60, 'active'],
    ['AST-0016', 'Split AC — General Ward Male', 'AC', 'NURS', 'Main Block · Ground floor · GW Male', 'Demo Air 1.5T', 1100, -300, 365, 'Demo Cooling Services', 160, -5, 'active'],
    ['AST-0017', 'Reception computer 1', 'Computer', 'RECP', 'Main Block · Reception', 'Demo PC i5', 500, 600, 0, 'Demo IT Services', 90, 90, 'active'],
    ['AST-0018', 'Billing printer', 'Printer', 'RECP', 'Main Block · Billing counter', 'Demo Laser P-2', 500, 200, 0, 'Demo IT Services', 60, 120, 'active'],
    ['AST-0019', 'Online UPS 10 kVA', 'UPS', 'ADMIN', 'Main Block · Server room', 'Demo Power UPS-10', 800, 300, 365, 'Demo Power Systems', 70, 20, 'active'],
    ['AST-0020', 'DG set 125 kVA', 'Generator', 'ADMIN', 'Service yard', 'Demo Gen 125', 2000, -1000, 365, 'Demo Power Systems', 25, 35, 'active'],
    ['AST-0021', 'X-ray machine 500 mA', 'Medical device', 'RAD', 'Radiology · X-ray room', 'Demo Imaging XR-500', 1300, -200, 365, 'Demo Imaging Service', 55, 35, 'active'],
    ['AST-0022', 'Ultrasound scanner', 'Medical device', 'RAD', 'Radiology · USG room', 'Demo Imaging US-7', 600, 500, 365, 'Demo Imaging Service', 40, 50, 'active'],
    ['AST-0023', 'Wheelchair set (6)', 'Furniture', 'RECP', 'Main Block · Entrance', 'Demo Mobility', 700, -300, 0, 'Demo Hospital Furniture', 180, 180, 'active'],
  ];
  for (const [code, name, type, dcode, location, make, bought, warranty, amc, vendor, last, next, status] of ASSETS) {
    const f = { name, asset_type: type, department_id: dept(dcode), location, make_model: make, purchase_date: D(-bought), warranty_until: D(warranty),
      amc_until: amc ? D(amc - 200) : null, vendor, vendor_contact: '90000 11111 (demo)', last_service: D(-last), next_service: D(next), status };
    const row = get('SELECT id FROM assets WHERE asset_code=?', code);
    if (row) update('assets', row.id, f); else { n.assets = (n.assets || 0) + 1; insert('assets', { asset_code: code, created_at: D(-bought), ...f }); }
  }

  /* ------------------------------------------------------------------ packages */
  const PKG = [['DEMO-PKG-NVD', 'Normal delivery package (2 days)', 15000], ['DEMO-PKG-LSCS', 'LSCS package (4 days)', 45000], ['DEMO-PKG-HERN', 'Hernia repair package (3 days)', 35000], ['DEMO-PKG-MHC', 'Master health check-up', 3500]];
  for (const [code, name, price] of PKG) {
    const row = get('SELECT id FROM packages WHERE code=?', code);
    if (row) update('packages', row.id, { name, price, active: 1 }); else { n.packages++; insert('packages', { code, name, price, active: 1 }); }
  }
});
console.log(JSON.stringify(n, null, 2));
db.close();
