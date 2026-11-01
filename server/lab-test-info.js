/** Editable informational text, not diagnostic rules or reference limits.
 * Sources: https://medlineplus.gov/lab-tests/ and its individual test pages;
 * ASO: https://medlineplus.gov/ency/article/003522.htm
 * Blood typing: https://medlineplus.gov/ency/article/003345.htm
 * Widal: https://www.cdc.gov/typhoid-fever/hcp/clinical-guidance/
 */
const entries = [
  [['LAB-CBC'], 'Haematology', 'Measures blood cell counts and haemoglobin to support assessment of anaemia, infection and other blood disorders.'],
  [['LAB-HB'], 'Haematology', 'Measures haemoglobin, the oxygen-carrying protein in red blood cells, to support assessment of anaemia.'],
  [['LAB-PLT'], 'Haematology', 'Measures the number of platelets, which help the blood form clots.'],
  [['LAB-PS'], 'Haematology', 'Examines blood cells under a microscope to assess their appearance and distribution.'],
  [['LAB-ESR'], 'Haematology', 'Measures how quickly red blood cells settle. ESR is a nonspecific marker of inflammation.'],
  [['LAB-COAG'], 'Haematology', 'Assesses blood clotting using the clotting tests included in this profile.'],
  [['LAB-BGRP', 'LAB-BGRH'], 'Haematology', 'Identifies the ABO blood group and Rh type. Blood grouping does not replace compatibility testing before transfusion.'],
  [['LAB-RBS'], 'Biochemistry', 'Measures blood glucose at the time of collection without a scheduled fasting interval.'],
  [['LAB-FBS'], 'Biochemistry', 'Measures blood glucose after fasting to support assessment of glucose regulation.'],
  [['LAB-PPBS'], 'Biochemistry', 'Measures blood glucose after a meal. Interpret with the recorded interval between the meal and sample collection.'],
  [['LAB-GTT'], 'Biochemistry', 'Measures the blood glucose response to an oral glucose load. Interpretation depends on the sampling schedule and clinical context.'],
  [['LAB-HBA1C'], 'Biochemistry', 'Reflects average blood glucose over approximately the previous two to three months.'],
  [['LAB-LFT'], 'Biochemistry', 'Measures the liver-related enzymes, proteins and bilirubin included in this profile to support assessment of liver health.'],
  [['LAB-RFT'], 'Biochemistry', 'Measures the kidney-related substances included in this profile to support assessment of kidney function.'],
  [['LAB-UREA'], 'Biochemistry', 'Measures urea, a waste product removed by the kidneys. Interpret with other kidney tests and the clinical context.'],
  [['LAB-CREAT'], 'Biochemistry', 'Measures creatinine, a waste product removed by the kidneys, to support assessment of kidney function.'],
  [['LAB-LIP', 'LAB-LIPID'], 'Biochemistry', 'Measures cholesterol fractions and triglycerides to support assessment of cardiovascular risk.'],
  [['LAB-ELEC'], 'Biochemistry', 'Measures the electrolytes included in this panel, which help regulate fluid balance and nerve and muscle function.'],
  [['LAB-CAL', 'LAB-CA'], 'Biochemistry', 'Measures calcium in the blood. Calcium contributes to bone health, nerve signalling and muscle function.'],
  [['LAB-MG'], 'Biochemistry', 'Measures magnesium in the blood, an electrolyte involved in nerve and muscle function.'],
  [['LAB-URIC'], 'Biochemistry', 'Measures uric acid, a product of purine breakdown, to support assessment of gout and other relevant conditions.'],
  [['LAB-TSH'], 'Hormones', 'Measures thyroid-stimulating hormone to support assessment of thyroid function.'],
  [['LAB-TFT'], 'Hormones', 'Measures the thyroid-related hormones included in this profile to support assessment of thyroid function.'],
  [['LAB-TROP'], 'Biochemistry', 'Measures troponin, a marker of heart muscle injury. Interpret with symptoms, ECG findings and the timing of collection.'],
  [['LAB-CRP'], 'Immunology', 'Measures C-reactive protein, a nonspecific marker of inflammation.'],
  [['LAB-ASO'], 'Immunology', 'Measures antibodies to streptolysin O to support assessment of a preceding group A streptococcal infection.'],
  [['LAB-RAF'], 'Immunology', 'Measures rheumatoid factor antibodies. Interpret alongside clinical findings and other tests for suspected autoimmune disease.'],
  [['LAB-URI', 'LAB-CUE'], 'Clinical Pathology', 'Examines urine for the physical, chemical and microscopic findings included in this test.'],
  [['LAB-UACR'], 'Biochemistry', 'Compares urine albumin with urine creatinine to assess albumin loss in urine and support evaluation of kidney damage.'],
  [['LAB-UPT'], 'Clinical Pathology', 'Detects human chorionic gonadotropin (hCG) in urine as a pregnancy screening test.'],
  [['LAB-BCS'], 'Microbiology', 'Cultures blood to look for microorganisms. Susceptibility testing, when applicable, assesses which antibiotics may be effective against an isolate.'],
  [['LAB-UCS'], 'Microbiology', 'Cultures urine to look for microorganisms. Susceptibility testing, when applicable, assesses which antibiotics may be effective against an isolate.'],
  [['LAB-PCS'], 'Microbiology', 'Cultures pus to look for microorganisms. Susceptibility testing, when applicable, assesses which antibiotics may be effective against an isolate.'],
  [['LAB-CULT'], 'Microbiology', 'Cultures the submitted specimen to look for microorganisms and, when applicable, assesses antibiotic susceptibility of an isolate.'],
  [['LAB-DENG', 'LAB-DENGUE'], 'Serology', 'Tests for dengue markers included in this panel. Detection depends on the marker tested and the timing of collection during the illness.'],
  [['LAB-MAL'], 'Microbiology', 'Screens for malaria using the laboratory method stated in the report.'],
  [['LAB-HBSAG'], 'Serology', 'Screens for hepatitis B surface antigen. Interpret with the clinical context and other hepatitis B tests when indicated.'],
  [['LAB-HCV'], 'Serology', 'Screens for antibodies to hepatitis C. A reactive antibody result requires further testing to determine whether infection is current.'],
  [['LAB-HIV'], 'Serology', 'Screens for HIV using the assay stated in the report. Reactive screening results require confirmation using the applicable testing algorithm.'],
  [['LAB-VDRL'], 'Serology', 'A nontreponemal screening test for syphilis. Interpret with clinical findings and confirmatory treponemal testing when indicated.'],
  [['LAB-WIDAL'], 'Serology', 'Measures agglutinating antibodies associated with enteric fever. Widal testing has limited diagnostic reliability and cannot establish typhoid fever on its own.'],
];
export const LAB_TEST_INFO = new Map(entries.flatMap(([codes, section, description]) => codes.map(code => [code, { description, lab_section: section }])));

export function preloadLabTestInfo(db) {
  const save = db.prepare('UPDATE services SET description=coalesce(description,?), lab_section=coalesce(lab_section,?) WHERE id=?');
  for (const service of db.prepare("SELECT id,code FROM services WHERE category='lab' AND (description IS NULL OR lab_section IS NULL)").all()) {
    const info = LAB_TEST_INFO.get(service.code);
    if (info) save.run(info.description, info.lab_section, service.id);
  }
  // Capture the initial wording for reports made before descriptions were supported.
  db.exec(`UPDATE orders SET lab_description=coalesce((SELECT description FROM services WHERE id=orders.service_id),'')
    WHERE category='lab' AND lab_description IS NULL AND EXISTS (SELECT 1 FROM lab_results WHERE order_id=orders.id);`);
}
