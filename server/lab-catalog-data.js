/**
 * Laboratory master list, organised like the hospital's LabSmart set-up: 10 report categories in
 * print order, single tests, panels (several tests on one report) and packages (several tests or
 * panels sold together).
 *
 * Parameter: [name, unit, low, high, refText, type, sexRanges, critical]
 *   type 't' = text result (qualitative / descriptive); sexRanges = { m: [lo, hi], f: [lo, hi] }.
 * Ranges are common adult reference intervals for orientation only. The laboratory must check and
 * replace them with its own validated, analyser-specific ranges (Laboratory → Templates) before
 * reports are released. Interpretation notes are written for this HMS and are editable per test.
 */

export const SECTION_ORDER = ['Haematology', 'Biochemistry', 'Serology & Immunology', 'Clinical Pathology', 'Cytology',
  'Microbiology', 'Endocrinology', 'Histopathology', 'Others', 'Miscellaneous'];
/** older section names in this database → the category they now print under */
export const SECTION_RENAMES = { Hormones: 'Endocrinology', Immunology: 'Serology & Immunology', Serology: 'Serology & Immunology', Other: 'Others' };

const HAE = 'Haematology', BIO = 'Biochemistry', SER = 'Serology & Immunology', CP = 'Clinical Pathology', CYT = 'Cytology',
  MIC = 'Microbiology', END = 'Endocrinology', MISC = 'Miscellaneous';
const EDTA = 'EDTA Whole Blood', SERUM = 'Serum', CIT = 'Citrated Plasma', FLU = 'Fluoride Plasma', URINE = 'Urine';

const p = (name, unit = '', low = null, high = null, text = null, type = 'n', sex = null, crit = null) => [name, unit, low, high, text, type, sex, crit];
const neg = (name, text = 'Negative') => p(name, '', null, null, text, 't');
const nonr = (name) => neg(name, 'Non-reactive');
const doc = (name = 'Report') => p(name, '', null, null, null, 't');

/* ------------------------------------------------------------ shared parameters */
const HB = p('Haemoglobin', 'g/dL', null, null, null, 'n', { m: [13, 17], f: [12, 15] }, [7, 20]);
const TLC = p('Total Leukocyte Count', 'cells/cumm', 4000, 11000, null, 'n', null, [2000, 30000]);
const DLC = [p('Neutrophils', '%', 40, 80), p('Lymphocytes', '%', 20, 40), p('Eosinophils', '%', 1, 6), p('Monocytes', '%', 2, 10), p('Basophils', '%', 0, 2)];
const ABS = [p('Absolute Neutrophil Count', 'cells/cumm', 2000, 7000), p('Absolute Lymphocyte Count', 'cells/cumm', 1000, 3000),
  p('Absolute Eosinophil Count', 'cells/cumm', 20, 500), p('Absolute Monocyte Count', 'cells/cumm', 200, 1000), p('Absolute Basophil Count', 'cells/cumm', 20, 100)];
const NLR = p('Neutrophil Lymphocyte Ratio', '', 0.78, 3.53);
const PLT = p('Platelet Count', 'lakhs/cumm', 1.5, 4.1, null, 'n', null, [0.2, 10]);
const RBC = p('Total RBC Count', 'million/cumm', null, null, null, 'n', { m: [4.5, 5.5], f: [3.8, 4.8] });
const HCT = p('Hematocrit (PCV)', '%', null, null, null, 'n', { m: [40, 50], f: [36, 46] });
const MCV = p('MCV', 'fL', 83, 101), MCH = p('MCH', 'pg', 27, 32), MCHC = p('MCHC', 'g/dL', 31.5, 34.5), MPV = p('MPV', 'fL', 7.5, 11.5);
const RDWCV = p('RDW-CV', '%', 11.6, 14), RDWSD = p('RDW-SD', 'fL', 39, 46), PLCR = p('P-LCR', '%', 13, 43), PDW = p('PDW', 'fL', 9, 17);
const ESRW = p('ESR (Wintrobe)', 'mm/hr', null, null, null, 'n', { m: [0, 9], f: [0, 20] });
const ESRG = p('ESR (Westergren)', 'mm/1st hr', null, null, null, 'n', { m: [0, 15], f: [0, 20] });
const BT = p('Bleeding Time', 'min', 1, 6), CT = p('Clotting Time', 'min', 4, 9);
const PT = [p('Prothrombin Time (Patient)', 'sec', 11, 13.5), p('Prothrombin Time (Control)', 'sec'), p('INR', '', 0.8, 1.2, null, 'n', null, [null, 5])];
const APTT = [p('APTT (Patient)', 'sec', 25, 35), p('APTT (Control)', 'sec')];

const FBS = p('Fasting Blood Sugar', 'mg/dL', 70, 100, null, 'n', null, [40, 450]);
const PPBS = p('Blood Sugar PP (2 hrs)', 'mg/dL', 70, 140, null, 'n', null, [40, 450]);
const RBS = p('Random Blood Sugar', 'mg/dL', 70, 140, null, 'n', null, [40, 450]);
const UREA = p('Serum Urea', 'mg/dL', 17, 43), BUN = p('BUN', 'mg/dL', 7, 20);
const CREAT = p('Serum Creatinine', 'mg/dL', null, null, null, 'n', { m: [0.7, 1.3], f: [0.6, 1.1] }, [null, 7]);
const EGFR = p('eGFR', 'mL/min/1.73m²', 90, null, '≥ 90'), EGFRCAT = p('eGFR Category', '', null, null, 'G1 (≥ 90 — normal)', 't');
const UA = p('Serum Uric Acid', 'mg/dL', null, null, null, 'n', { m: [3.5, 7.2], f: [2.6, 6.0] });
const CA = p('Serum Calcium', 'mg/dL', 8.5, 10.5, null, 'n', null, [6, 13]), TCA = p('Total Calcium', 'mg/dL', 8.5, 10.5);
const ICA = p('Ionised Calcium (iCa)', 'mmol/L', 1.12, 1.32), PHOS = p('Serum Phosphorus', 'mg/dL', 2.5, 4.5);
const NA = p('Serum Sodium', 'mmol/L', 135, 145, null, 'n', null, [120, 160]);
const K = p('Serum Potassium', 'mmol/L', 3.5, 5.1, null, 'n', null, [2.5, 6.5]);
const CL = p('Serum Chloride', 'mmol/L', 98, 107);
const UCR = p('Urea / Creatinine Ratio', '', 20, 40), BUNCR = p('BUN / Creatinine Ratio', '', 10, 20);
const TBIL = p('Serum Bilirubin (Total)', 'mg/dL', 0.3, 1.2, null, 'n', null, [null, 15]);
const DBIL = p('Serum Bilirubin (Direct)', 'mg/dL', 0, 0.3), IBIL = p('Serum Bilirubin (Indirect)', 'mg/dL', 0.2, 0.8);
const SGOT = p('SGOT (AST)', 'U/L', 0, 40), SGPT = p('SGPT (ALT)', 'U/L', 0, 41), RATIO_AST = p('SGOT / SGPT Ratio', '', null, null, 'Usually < 1');
const ALP = p('Serum Alkaline Phosphatase', 'U/L', 44, 147), TP = p('Serum Total Protein', 'g/dL', 6.4, 8.3);
const ALB = p('Serum Albumin', 'g/dL', 3.5, 5.2), GLOB = p('Globulin', 'g/dL', 2.3, 3.5), AG = p('A/G Ratio', '', 1.1, 2.2);
const CHOL = p('Total Cholesterol', 'mg/dL', null, 200, 'Desirable < 200'), TG = p('Triglycerides', 'mg/dL', null, 150, 'Normal < 150');
const HDL = p('HDL Cholesterol', 'mg/dL', null, null, 'Men > 40, Women > 50', 'n', { m: [40, null], f: [50, null] });
const LDL = p('LDL Cholesterol', 'mg/dL', null, 100, 'Optimal < 100'), VLDL = p('VLDL Cholesterol', 'mg/dL', 2, 30);
const LDLHDL = p('LDL / HDL Ratio', '', null, 3.5), CHOLHDL = p('Total Cholesterol / HDL Ratio', '', null, 5), TGHDL = p('TG / HDL Ratio', '', null, 2);
const NONHDL = p('Non-HDL Cholesterol', 'mg/dL', null, 130, 'Desirable < 130');
const IRON = p('Serum Iron', 'µg/dL', 60, 170), UIBC = p('UIBC', 'µg/dL', 111, 343), TIBC = p('TIBC', 'µg/dL', 250, 450), TSAT = p('Transferrin Saturation', '%', 20, 50);
const T3 = p('T3, Total', 'ng/mL', 0.8, 2.0), T4 = p('T4, Total', 'µg/dL', 5.1, 14.1), TSH = p('TSH', 'µIU/mL', 0.27, 4.2);
const FT3 = p('Free T3', 'pg/mL', 2.0, 4.4), FT4 = p('Free T4', 'ng/dL', 0.93, 1.7);
const CYCLE = 'Depends on cycle phase / menopause — see interpretation';

/* ------------------------------------------------------------ tests
 * [key, code, name, section, sample, price (always 0: the hospital prices tests in Fees & Tariffs), params, note] — code reuses this database's code where one exists. */
export const TESTS = [
  // Haematology
  ['HB', 'LAB-HB', 'Haemoglobin', HAE, EDTA, 0, [HB], 'Haemoglobin carries oxygen in red cells. A low value means anaemia, whose type is judged with the red-cell indices (MCV, MCH); a high value is seen with dehydration, smoking, lung disease and polycythaemia.'],
  ['TLC', 'LAB-TLC', 'Total Leukocyte Count', HAE, EDTA, 0, [TLC], 'The white-cell count rises with bacterial infection, inflammation, stress, steroids and leukaemia, and falls with viral infections, some drugs, marrow failure and severe sepsis.'],
  ['DLC', 'LAB-DLC', 'Differential Leucocyte Count', HAE, EDTA, 0, DLC, 'The percentage of each white-cell type. Neutrophils rise in bacterial infection, lymphocytes in viral infection, eosinophils in allergy and worm infestation. Read together with the total count.'],
  ['ABSDLC', 'LAB-ABSDLC', 'Differential Leukocyte Count (Absolute count)', HAE, EDTA, 0, ABS, 'Absolute counts (cells per cumm) are more reliable than percentages when the total count is abnormal; an absolute neutrophil count below 1000 is a significant risk for infection.'],
  ['ESRG', 'LAB-ESRG', 'ESR (Westergren)', HAE, EDTA, 0, [ESRG], 'ESR is a non-specific marker of inflammation. It rises with infection, autoimmune disease, anaemia, pregnancy, older age and myeloma; a normal ESR does not exclude disease.'],
  ['ESR', 'LAB-ESR', 'Erythrocyte Sedimentation Rate (Wintrobe)', HAE, EDTA, 0, [ESRW], 'ESR is a non-specific marker of inflammation, useful mainly for following a known condition over time. It is raised in infection, autoimmune disease, anaemia and pregnancy.'],
  ['PLT', 'LAB-PLT', 'Platelet Count', HAE, EDTA, 0, [PLT], 'Platelets help blood clot. A low count (dengue, viral infection, ITP, marrow disease, hypersplenism) raises bleeding risk; clumped samples give falsely low counts and should be checked on a smear. High counts follow infection, iron deficiency or bleeding.'],
  ['AEC', 'LAB-AEC', 'Absolute Eosinophil Count', HAE, EDTA, 0, [p('Absolute Eosinophil Count', 'cells/cumm', 20, 500)], 'Eosinophils rise in allergy, asthma, skin disease, worm infestation and some drug reactions; very high counts need evaluation for tropical eosinophilia or blood disorders.'],
  ['BGRH', 'LAB-BGRH', 'Blood Group & Rh', HAE, EDTA, 0, [p('ABO Group', '', null, null, null, 't'), p('Rh (D) Type', '', null, null, null, 't')], 'ABO group and Rh (D) type. Grouping does not replace cross-matching before transfusion. Rh-negative mothers need antibody screening and anti-D prophylaxis as advised.'],
  ['BT', 'LAB-BT', 'Bleeding Time', HAE, 'Capillary blood', 0, [BT], 'Bleeding time reflects platelet function and the blood vessel wall. It is prolonged with low or poorly functioning platelets, aspirin and other anti-platelet drugs.'],
  ['CT', 'LAB-CT', 'Clotting Time', HAE, 'Whole Blood', 0, [CT], 'Clotting time is a crude screen of the clotting factors; PT/INR and APTT are more sensitive and preferred before surgery.'],
  ['PBS', 'LAB-PS', 'Peripheral Blood Smear', HAE, EDTA, 0, [p('RBC Morphology', '', null, null, null, 't'), p('WBC Morphology', '', null, null, null, 't'), p('Platelets', '', null, null, null, 't'), p('Haemoparasites', '', null, null, 'Not seen', 't'), p('Impression', '', null, null, null, 't')], 'Microscopic review of red cells, white cells and platelets: confirms analyser counts and shows anaemia type, abnormal or immature cells and malaria parasites.'],
  ['MPCARD', 'LAB-MPCARD', 'Malaria Parasite (Card Test)', HAE, EDTA, 0, [neg('Plasmodium falciparum'), neg('Plasmodium vivax')], 'Rapid antigen test for P. falciparum and P. vivax. A negative card with ongoing fever should be followed by a repeat test and a blood smear.'],
  ['MPSMEAR', 'LAB-MPSMEAR', 'Malaria Parasite (Microscopic)', HAE, EDTA, 0, [p('Malaria Parasite', '', null, null, 'Not seen', 't')], 'Thick and thin smears are the reference method for detecting and identifying malaria parasites; parasites are best seen during or just after a fever spike.'],
  ['MF', 'LAB-MF', 'Filarial Parasite (Card Test)', HAE, 'Whole Blood', 0, [neg('Filarial Antigen')], 'Detects circulating filarial antigen; a positive result supports active infection.'],
  ['RETIC', 'LAB-RETIC', 'Reticulocyte Count', HAE, EDTA, 0, [p('Reticulocyte Count', '%', 0.5, 2.5)], 'Reticulocytes are young red cells and show how actively the marrow is producing blood. They rise after bleeding, haemolysis and treatment of deficiency anaemia, and are low when the marrow is under-producing.'],
  ['G6PD', 'LAB-G6PD', 'Glucose-6-Phosphate Dehydrogenase (G6PD)', HAE, EDTA, 0, [p('G6PD', '', null, null, 'Normal', 't')], 'G6PD deficiency is inherited and can cause red-cell breakdown after certain drugs (e.g. primaquine, dapsone), infections or fava beans. Testing during or right after a haemolytic episode can give a falsely normal result.'],
  ['PTINR', 'LAB-PT', 'Prothrombin Time (PT / INR)', HAE, CIT, 0, PT, 'PT/INR checks the extrinsic clotting pathway, liver function and warfarin effect. The usual INR target on warfarin is 2–3 (2.5–3.5 for mechanical valves).'],
  ['APTT', 'LAB-APTT', 'Activated Partial Thromboplastin Time (APTT)', HAE, CIT, 0, APTT, 'APTT checks the intrinsic clotting pathway and heparin effect. It is prolonged in haemophilia, liver disease, DIC and with lupus anticoagulant.'],
  ['WBC', 'LAB-WBC', 'WBC Count', HAE, EDTA, 0, [p('WBC Count', 'cells/cumm', 4000, 11000)], 'Total white blood cell count; see Total Leukocyte Count.'],
  ['LA', 'LAB-LA', 'Lupus Anticoagulant (DRVVT)', HAE, CIT, 0, [p('DRVVT Screen Ratio', '', null, 1.2), p('DRVVT Confirm Ratio', '', null, 1.2), p('Normalised Ratio', '', null, 1.2), p('Result', '', null, null, 'Not detected', 't')], 'Lupus anticoagulant is an antiphospholipid antibody linked to clots and pregnancy loss. Anticoagulant drugs interfere with the test; a positive result is confirmed after 12 weeks.'],
  ['TROPT', 'LAB-TROPT', 'Troponin T', HAE, SERUM, 0, [p('Troponin T', 'ng/L', null, 14, '< 14')], 'Troponin is released from damaged heart muscle. A rising value with chest pain supports a heart attack; kidney disease and other heart strain can also raise it, so serial values matter.'],
  ['HPLC', 'LAB-HPLC', 'Haemoglobin HPLC / Electrophoresis', HAE, EDTA, 0, [p('HbA', '%', 95, 98), p('HbA2', '%', 1.5, 3.5), p('HbF', '%', 0, 1), p('Variant / Abnormal Hb', '', null, null, 'Not detected', 't'), p('Interpretation', '', null, null, null, 't')], 'Separates haemoglobin types to detect thalassaemia trait (raised HbA2) and variants such as HbS and HbE. Iron deficiency can lower HbA2, so correct it before interpreting borderline results.'],
  ['LEUKDLC', 'LAB-LEUKDLC', 'Leukaemia DLC', HAE, EDTA, 0, [p('Blasts', '%', 0, 0), p('Promyelocytes', '%', 0, 0), p('Myelocytes', '%', 0, 0), p('Metamyelocytes', '%', 0, 0), p('Band Forms', '%', 0, 5), p('Segmented Neutrophils', '%', 40, 75), p('Lymphocytes', '%', 20, 40), p('Monocytes', '%', 2, 10), p('Eosinophils', '%', 1, 6), p('Basophils', '%', 0, 2)], 'An extended differential count that records immature cells. Blasts or a left shift need haematology review.'],
  ['RBCIND', 'LAB-RBCIND', 'RBC Indices', HAE, EDTA, 0, [RBC, HCT, MCV, MCH, MCHC, RDWCV], 'Red-cell indices classify anaemia: low MCV and MCH suggest iron deficiency or thalassaemia; high MCV suggests B12 / folate deficiency, liver disease or alcohol. A raised RDW means mixed cell sizes.'],
  ['PLTIND', 'LAB-PLTIND', 'Platelet Indices', HAE, EDTA, 0, [PLT, MPV, PDW, p('Plateletcrit (PCT)', '%', 0.17, 0.35), PLCR], 'Platelet size measures: large platelets (high MPV) suggest increased destruction with active production; small platelets suggest reduced production.'],
  ['MORPH', 'LAB-MORPH', 'Morphology', HAE, EDTA, 0, [p('RBC Morphology', '', null, null, null, 't'), p('WBC Morphology', '', null, null, null, 't'), p('Platelet Morphology', '', null, null, null, 't')], 'Description of cell appearance on the smear.'],
  ['DLC3', 'LAB-DLC3', 'DLC 3 Parts', HAE, EDTA, 0, [p('Granulocytes', '%', 50, 70), p('Lymphocytes', '%', 20, 40), p('Mid Cells', '%', 3, 15)], 'A three-part analyser differential; abnormal or flagged counts are confirmed on a smear.'],
  // Biochemistry
  ['PHOS', 'LAB-PHOS', 'Serum Phosphorus', BIO, SERUM, 0, [PHOS], 'Phosphorus works with calcium in bone. It is high in kidney failure and low parathyroid function, and low in malnutrition, vitamin D deficiency, high parathyroid function and refeeding.'],
  ['CREAT', 'LAB-CREAT', 'Serum Creatinine', BIO, SERUM, 0, [CREAT], 'Creatinine is cleared by the kidneys and is the main marker of kidney filtration. Muscle mass, meat intake and some drugs also affect it; eGFR adjusts it for age and sex.'],
  ['UREA', 'LAB-UREA', 'Serum Urea', BIO, SERUM, 0, [UREA], 'Urea rises with reduced kidney function, dehydration, high protein intake and gut bleeding, and falls with liver failure and overhydration.'],
  ['FBS', 'LAB-FBS', 'Fasting Blood Sugar', BIO, FLU, 0, [FBS], 'After at least 8 hours fasting (mg/dL): below 100 normal; 100–125 impaired fasting glucose; 126 or more on two occasions is consistent with diabetes.'],
  ['PPBS', 'LAB-PPBS', 'Blood Sugar PP', BIO, FLU, 0, [PPBS], 'Measured 2 hours after a meal: below 140 mg/dL is normal; 140–199 suggests impaired tolerance; 200 or more is consistent with diabetes.'],
  ['TBIL', 'LAB-TBIL', 'Serum Bilirubin (Total)', BIO, SERUM, 0, [TBIL], 'Bilirubin comes from the breakdown of red cells. A raised total value causes jaundice; the direct and indirect fractions show whether the cause lies in the liver or bile ducts, or in red-cell breakdown.'],
  ['DBIL', 'LAB-DBIL', 'Serum Bilirubin (Direct)', BIO, SERUM, 0, [DBIL], 'Direct (conjugated) bilirubin rises with liver-cell disease and blocked bile flow.'],
  ['IBIL', 'LAB-IBIL', 'Serum Bilirubin (Indirect)', BIO, SERUM, 0, [IBIL], 'Indirect (unconjugated) bilirubin rises with red-cell breakdown and Gilbert syndrome.'],
  ['UA', 'LAB-URIC', 'Serum Uric Acid', BIO, SERUM, 0, [UA], 'High uric acid is linked to gout and kidney stones and is seen with kidney disease, diuretics, alcohol and high-purine diets; many people with a high level never develop gout.'],
  ['SGPT', 'LAB-SGPT', 'SGPT (ALT)', BIO, SERUM, 0, [SGPT], 'ALT is concentrated in the liver; a raised value points to liver-cell injury (hepatitis, fatty liver, drugs, alcohol).'],
  ['SGOT', 'LAB-SGOT', 'SGOT (AST)', BIO, SERUM, 0, [SGOT], 'AST is found in liver, heart and muscle; a raised value reflects injury to any of these. An AST/ALT ratio above 2 suggests alcohol-related liver disease.'],
  ['TP', 'LAB-TP', 'Serum Total Protein', BIO, SERUM, 0, [TP], 'Total protein is albumin plus globulins; it falls with malnutrition, liver and kidney disease and rises with dehydration and chronic inflammation or myeloma.'],
  ['ALB', 'LAB-ALB', 'Serum Albumin', BIO, SERUM, 0, [ALB], 'Albumin is made by the liver; low values are seen with liver disease, nephrotic syndrome, malnutrition and severe illness.'],
  ['ALP', 'LAB-ALP', 'Serum Alkaline Phosphatase', BIO, SERUM, 0, [ALP], 'ALP comes from bile ducts and bone. It rises with blocked bile flow, bone growth and bone disease, and is normally higher in children and in pregnancy.'],
  ['CHOL', 'LAB-CHOL', 'Total Cholesterol', BIO, SERUM, 0, [CHOL], 'Total cholesterol below 200 mg/dL is desirable, 200–239 borderline high and 240 or more high. Heart risk is judged with LDL, HDL and other risk factors.'],
  ['TG', 'LAB-TG', 'Triglycerides', BIO, SERUM, 0, [TG], 'Triglycerides should be measured after a 10–12 hour fast; values above 150 mg/dL add to heart risk and above 500 mg/dL risk pancreatitis.'],
  ['HDL', 'LAB-HDL', 'HDL Cholesterol', BIO, SERUM, 0, [HDL], 'HDL is the protective cholesterol; higher values are better. Exercise and stopping smoking raise it.'],
  ['LDL', 'LAB-LDL', 'LDL Cholesterol', BIO, SERUM, 0, [LDL], 'LDL is the main cholesterol target for preventing heart disease. Treatment targets depend on the overall risk of the patient.'],
  ['NA', 'LAB-NA', 'Serum Sodium', BIO, SERUM, 0, [NA], 'Low sodium is seen with vomiting, diarrhoea, diuretics, heart, liver or kidney failure and inappropriate ADH secretion; high sodium usually means water loss or poor intake. Values below 120 or above 160 are critical.'],
  ['K', 'LAB-K', 'Serum Potassium', BIO, SERUM, 0, [K], 'Potassium affects heart rhythm. Haemolysed or delayed samples falsely raise it. Values below 2.5 or above 6.5 mmol/L are critical and must be reported at once.'],
  ['CL', 'LAB-CL', 'Serum Chloride', BIO, SERUM, 0, [CL], 'Chloride moves with sodium and helps assess acid–base disturbances.'],
  ['BUN', 'LAB-BUN', 'BUN', BIO, SERUM, 0, [BUN], 'Blood urea nitrogen is urea expressed as its nitrogen content (urea divided by 2.14).'],
  ['ICA', 'LAB-ICA', 'Ionised Calcium (iCalcium)', BIO, SERUM, 0, [ICA], 'Ionised calcium is the active form; it is the preferred measure when albumin is abnormal or in critical illness.'],
  ['CA', 'LAB-CA', 'Serum Calcium', BIO, SERUM, 0, [CA], 'Calcium is controlled by parathyroid hormone and vitamin D. Total calcium falls with low albumin, so correct for albumin or measure ionised calcium.'],
  ['GTT', 'LAB-GTT', 'Glucose Tolerance Test (GTT)', BIO, FLU, 0, [p('Fasting Glucose', 'mg/dL', 70, 100), p('Glucose 1 hr', 'mg/dL', null, 180), p('Glucose 2 hrs', 'mg/dL', null, 140)], 'Glucose measured fasting and after a 75 g glucose drink. A 2-hour value of 140–199 mg/dL suggests impaired tolerance; 200 or more is consistent with diabetes.'],
  ['RBS', 'LAB-RBS', 'Random Blood Sugar', BIO, FLU, 0, [RBS], 'A random value of 200 mg/dL or more with symptoms is consistent with diabetes; confirm with fasting glucose or HbA1c.'],
  ['AMY', 'LAB-AMY', 'Serum Amylase', BIO, SERUM, 0, [p('Serum Amylase', 'U/L', 28, 100)], 'Amylase rises in acute pancreatitis, usually to over three times normal, and also with blocked salivary glands, bowel obstruction and kidney failure. Lipase is more specific.'],
  ['HBA1C', 'LAB-HBA1C', 'HbA1c (Glycosylated Haemoglobin)', BIO, EDTA, 0, [p('HbA1c', '%', null, 5.7, 'Non-diabetic < 5.7'), p('Estimated Average Glucose', 'mg/dL')], 'HbA1c reflects average glucose over 2–3 months: below 5.7% normal; 5.7–6.4% prediabetes; 6.5% or more consistent with diabetes. Anaemia, blood loss, transfusion and haemoglobin variants can make it unreliable.'],
  ['LIPASE', 'LAB-LIPASE', 'Lipase', BIO, SERUM, 0, [p('Lipase', 'U/L', 13, 60)], 'Lipase is the preferred test for acute pancreatitis; a value over three times the upper limit with typical pain supports the diagnosis.'],
  ['FERR', 'LAB-FERR', 'Serum Ferritin', BIO, SERUM, 0, [p('Ferritin', 'ng/mL', null, null, null, 'n', { m: [24, 336], f: [11, 307] })], 'Ferritin reflects iron stores; a low value confirms iron deficiency. It also rises with inflammation, infection, liver disease and cancer, which can hide deficiency.'],
  ['MACR', 'LAB-MACR', 'Microalbumin Creatinine Ratio, Urine (Random)', BIO, URINE, 0, [p('Urine Microalbumin', 'mg/L'), p('Urine Creatinine', 'mg/dL'), p('Albumin / Creatinine Ratio', 'mg/g', null, 30, '< 30')], 'Detects early kidney damage in diabetes and high blood pressure: below 30 mg/g normal, 30–300 moderately increased, above 300 severely increased. Confirm with two of three samples over 3–6 months.'],
  ['CPKMB', 'LAB-CPKMB', 'CPK-MB', BIO, SERUM, 0, [p('CPK-MB', 'U/L', 0, 25)], 'CK-MB is concentrated in heart muscle and rises 4–6 hours after heart injury; troponin has largely replaced it.'],
  ['STOOLRS', 'LAB-STOOLRS', 'Stool Reducing Substances', BIO, 'Stool', 0, [neg('Reducing Substances', 'Absent')], 'Reducing substances in stool suggest carbohydrate (e.g. lactose) malabsorption, especially in infants with diarrhoea.'],
  ['VITD', 'LAB-VITD', '25-Hydroxy Vitamin D', BIO, SERUM, 0, [p('25-Hydroxy Vitamin D', 'ng/mL', 30, 100, 'Deficient < 20 · Insufficient 20–29 · Sufficient 30–100')], '25-hydroxy vitamin D is the best measure of vitamin D status. Deficiency causes weak bones and muscle pain; values above 100 ng/mL suggest excess supplementation.'],
  ['B12', 'LAB-B12', 'Vitamin B12', BIO, SERUM, 0, [p('Vitamin B12', 'pg/mL', 197, 771)], 'B12 deficiency causes large-cell anaemia and nerve damage; common causes are vegetarian diet, pernicious anaemia, metformin, acid-reducing drugs and gut disease. Borderline values can be clarified with homocysteine.'],
  ['GGT', 'LAB-GGT', 'Gamma Glutamyl Transferase (GGT)', BIO, SERUM, 0, [p('GGT', 'U/L', null, null, null, 'n', { m: [0, 55], f: [0, 38] })], 'GGT rises with bile-duct disease, alcohol use and several drugs; a raised GGT with raised ALP confirms the ALP is from the liver.'],
  ['IGE', 'LAB-IGE', 'Serum IgE (Total)', BIO, SERUM, 0, [p('Total IgE', 'IU/mL', 0, 100)], 'Total IgE is raised in allergic conditions, asthma, eczema and worm infestation; a normal value does not exclude a specific allergy.'],
  ['IGG', 'LAB-IGG', 'Serum IgG', BIO, SERUM, 0, [p('IgG', 'mg/dL', 700, 1600)], 'IgG is the main long-term antibody; it is low in some immune deficiencies and high in chronic infection, autoimmune disease and myeloma.'],
  ['IGM', 'LAB-IGM', 'Serum IgM', BIO, SERUM, 0, [p('IgM', 'mg/dL', 40, 230)], 'IgM is the first antibody made in an infection; abnormal levels are seen in immune deficiency, liver disease and some lymphomas.'],
  ['IGA', 'LAB-IGA', 'Serum IgA', BIO, SERUM, 0, [p('IgA', 'mg/dL', 70, 400)], 'IgA protects mucous membranes; IgA deficiency must be known before coeliac antibody tests are interpreted.'],
  ['HSV12G', 'LAB-HSV12G', 'HSV-1/2 IgG', BIO, SERUM, 0, [neg('HSV-1/2 IgG')], 'IgG shows past herpes simplex infection; it does not indicate current infection on its own.'],
  ['HSV12M', 'LAB-HSV12M', 'HSV-1/2 IgM', BIO, SERUM, 0, [neg('HSV-1/2 IgM')], 'IgM suggests recent or reactivated herpes simplex infection; false positives occur and results are read with the clinical picture.'],
  ['HSV2G', 'LAB-HSV2G', 'HSV-2 IgG', BIO, SERUM, 0, [neg('HSV-2 IgG')], 'Type-specific IgG indicating past HSV-2 infection.'],
  ['CMVG', 'LAB-CMVG', 'CMV IgG', BIO, SERUM, 0, [neg('CMV IgG')], 'CMV IgG shows past infection or immunity; most adults are positive.'],
  ['CMVM', 'LAB-CMVM', 'CMV IgM', BIO, SERUM, 0, [neg('CMV IgM')], 'CMV IgM suggests recent infection, important in pregnancy; confirm with IgG avidity.'],
  ['RUBG', 'LAB-RUBG', 'Rubella IgG', BIO, SERUM, 0, [neg('Rubella IgG')], 'A positive rubella IgG means immunity from vaccination or past infection.'],
  ['RUBM', 'LAB-RUBM', 'Rubella IgM', BIO, SERUM, 0, [neg('Rubella IgM')], 'Rubella IgM suggests recent infection; in pregnancy a positive result is confirmed before any decision.'],
  ['ATPO', 'LAB-ATPO', 'Anti TPO Antibody', BIO, SERUM, 0, [p('Anti-TPO', 'IU/mL', 0, 34)], 'Anti-TPO antibodies point to autoimmune thyroid disease (Hashimoto, Graves) and predict future hypothyroidism.'],
  ['TGLOB', 'LAB-TGLOB', 'Thyroglobulin (TG)', BIO, SERUM, 0, [p('Thyroglobulin', 'ng/mL', 3.5, 77)], 'Used mainly to follow differentiated thyroid cancer after treatment; read together with thyroglobulin antibody.'],
  ['TGAB', 'LAB-TGAB', 'Thyroglobulin Antibody (TgAb)', BIO, SERUM, 0, [p('Anti-Thyroglobulin', 'IU/mL', 0, 115)], 'Thyroglobulin antibodies are seen in autoimmune thyroid disease and can interfere with thyroglobulin measurement.'],
  ['TOXOG', 'LAB-TOXOG', 'Toxoplasma IgG', BIO, SERUM, 0, [neg('Toxoplasma IgG')], 'IgG shows past exposure or immunity to Toxoplasma.'],
  ['TOXOM', 'LAB-TOXOM', 'Toxoplasma IgM', BIO, SERUM, 0, [neg('Toxoplasma IgM')], 'IgM can indicate recent infection but may persist for months; confirm with IgG avidity in pregnancy.'],
  ['E2', 'LAB-E2', 'Estradiol (E2)', BIO, SERUM, 0, [p('Estradiol', 'pg/mL', null, null, CYCLE)], 'Estradiol varies through the menstrual cycle and falls after menopause; it is used in fertility work-up and monitoring of ovarian stimulation.'],
  ['DHEA', 'LAB-DHEA', 'DHEA-S', BIO, SERUM, 0, [p('DHEA-S', 'µg/dL', null, null, 'Age and sex dependent')], 'An adrenal androgen; raised levels in women with excess hair or acne suggest an adrenal source.'],
  ['TROPI', 'LAB-TROPI', 'Troponin I', BIO, SERUM, 0, [p('Troponin I', 'ng/mL', null, 0.04, '< 0.04')], 'Troponin I is specific to heart muscle; a rise and fall over serial samples supports a heart attack.'],
  ['CK', 'LAB-CK', 'Creatine Kinase (CPK Total)', BIO, SERUM, 0, [p('CPK Total', 'U/L', null, null, null, 'n', { m: [39, 308], f: [26, 192] })], 'CK rises with muscle injury, heavy exercise, intramuscular injections, statins and heart injury.'],
  ['CKMB', 'LAB-CKMB', 'CK-MB', BIO, SERUM, 0, [p('CK-MB', 'ng/mL', 0, 5)], 'CK-MB (mass) rises after heart-muscle injury; troponin is preferred.'],
  ['DDIMER', 'LAB-DDIMER', 'D-Dimer', BIO, CIT, 0, [p('D-Dimer', 'ng/mL FEU', null, 500, '< 500')], 'A normal D-dimer helps rule out a blood clot when clinical probability is low; it rises with clots, infection, surgery, pregnancy and older age.'],
  ['CALCIT', 'LAB-CALCIT', 'Calcitonin', BIO, SERUM, 0, [p('Calcitonin', 'pg/mL', null, null, 'Men < 10, Women < 5')], 'Calcitonin is the marker for medullary thyroid cancer.'],
  ['ICT', 'LAB-ICT', 'Indirect Coombs Test', BIO, SERUM, 0, [neg('Indirect Coombs Test')], 'Detects red-cell antibodies in plasma; used in antenatal screening (especially Rh-negative mothers) and before transfusion.'],
  ['DCT', 'LAB-DCT', 'Direct Coombs Test', BIO, EDTA, 0, [neg('Direct Coombs Test')], 'Detects antibodies on the red cells of the patient: autoimmune haemolysis, newborn haemolytic disease and transfusion reactions.'],
  ['CA125', 'LAB-CA125', 'CA 125', BIO, SERUM, 0, [p('CA 125', 'U/mL', null, 35, '< 35')], 'A marker used mainly to monitor ovarian cancer; it also rises with endometriosis, fibroids, menstruation, pregnancy and pelvic inflammation, so it is not a screening test.'],
  ['CA153', 'LAB-CA153', 'CA 15-3', BIO, SERUM, 0, [p('CA 15-3', 'U/mL', null, 30, '< 30')], 'Used to monitor breast cancer treatment and recurrence; not for screening.'],
  ['CA199', 'LAB-CA199', 'CA 19-9', BIO, SERUM, 0, [p('CA 19-9', 'U/mL', null, 37, '< 37')], 'Used to monitor pancreatic and biliary cancers; blocked bile flow and pancreatitis also raise it.'],
  ['CA50', 'LAB-CA50', 'CA 50', BIO, SERUM, 0, [p('CA 50', 'U/mL', null, 25, '< 25')], 'A tumour marker mainly for gastrointestinal and pancreatic cancers; used with other markers.'],
  ['CA242', 'LAB-CA242', 'CA 242', BIO, SERUM, 0, [p('CA 242', 'U/mL', null, 20, '< 20')], 'A tumour marker for pancreatic and colorectal cancers, used alongside CA 19-9 and CEA.'],
  ['CA724', 'LAB-CA724', 'CA 72-4', BIO, SERUM, 0, [p('CA 72-4', 'U/mL', null, 6.9, '< 6.9')], 'A tumour marker used mainly in gastric and ovarian cancer follow-up.'],
  ['HALB', 'LAB-HALB', 'H-ALB (Urine Albumin)', BIO, URINE, 0, [p('Urine Albumin', 'mg/L', null, 20)], 'Urine albumin screening for early kidney damage.'],
  ['CCP', 'LAB-CCP', 'Anti-CCP Antibody', BIO, SERUM, 0, [p('Anti-CCP', 'U/mL', null, 17, '< 17')], 'Anti-CCP is highly specific for rheumatoid arthritis and may appear years before symptoms.'],
  ['ABG', 'LAB-ABG', 'Arterial Blood Gas (ABG)', BIO, 'Arterial Blood', 0, [p('pH', '', 7.35, 7.45, null, 'n', null, [7.2, 7.6]), p('pCO2', 'mmHg', 35, 45), p('pO2', 'mmHg', 80, 100, null, 'n', null, [40, null]), p('HCO3', 'mmol/L', 22, 26), p('Base Excess', 'mmol/L', -2, 2), p('O2 Saturation', '%', 95, 100), p('Lactate', 'mmol/L', 0.5, 2)], 'Assesses oxygenation, ventilation and acid–base balance. Analyse within 15 minutes of an arterial sample kept free of air bubbles.'],
  ['IRON', 'LAB-SIRON', 'Serum Iron', BIO, SERUM, 0, [IRON], 'Serum iron varies through the day and with meals; it is read together with TIBC, transferrin saturation and ferritin.'],
  ['TIBC', 'LAB-TIBC', 'Total Iron Binding Capacity (TIBC)', BIO, SERUM, 0, [TIBC], 'TIBC rises in iron deficiency and pregnancy and falls with inflammation and protein loss.'],
  ['TSAT', 'LAB-TSAT', 'Transferrin Saturation', BIO, SERUM, 0, [TSAT], 'Below 16–20% supports iron deficiency; above 45% suggests iron overload.'],
  ['NONHDL', 'LAB-NONHDL', 'Non-HDL Cholesterol', BIO, SERUM, 0, [NONHDL], 'Total cholesterol minus HDL; a useful risk target when triglycerides are high.'],
  ['UIBC', 'LAB-UIBC', 'UIBC', BIO, SERUM, 0, [UIBC], 'The unused iron-binding capacity of transferrin; TIBC = serum iron + UIBC.'],
  ['EGFR', 'LAB-EGFR', 'Estimated Glomerular Filtration Rate (eGFR)', BIO, SERUM, 0, [CREAT, EGFR, EGFRCAT], 'eGFR estimates kidney filtration from creatinine, age and sex (CKD-EPI 2021): G1 90 or more, G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 below 15 mL/min/1.73m². Not valid in acute kidney injury, pregnancy or extremes of muscle mass.'],
  ['C3', 'LAB-C3', 'C3 Complement', BIO, SERUM, 0, [p('C3', 'mg/dL', 90, 180)], 'Low C3 suggests complement consumption, as in active lupus and some kidney diseases.'],
  ['HSCRP', 'LAB-HSCRP', 'High-Sensitivity CRP (hs-CRP)', BIO, SERUM, 0, [p('hs-CRP', 'mg/L', null, 1, 'Low risk < 1 · Average 1–3 · High > 3')], 'hs-CRP refines heart-disease risk in people without acute illness; values above 10 mg/L mean active inflammation and should be repeated later.'],
  ['AMH', 'LAB-AMH', 'Anti-Müllerian Hormone (AMH)', BIO, SERUM, 0, [p('AMH', 'ng/mL', null, null, 'Age dependent — see interpretation')], 'AMH reflects ovarian reserve and falls with age; high values are seen in polycystic ovaries. It does not predict natural fertility on its own.'],
  ['NH3', 'LAB-NH3', 'Ammonia', BIO, 'EDTA Plasma (on ice)', 0, [p('Ammonia', 'µmol/L', 16, 60)], 'Raised in liver failure and urea-cycle disorders. Send on ice and test within 30 minutes; delays falsely raise the value.'],
  ['MG', 'LAB-MG', 'Serum Magnesium', BIO, SERUM, 0, [p('Magnesium', 'mg/dL', 1.7, 2.4)], 'Low magnesium follows diarrhoea, diuretics, alcohol and acid-reducing drugs and can make low potassium and calcium hard to correct.'],
  ['GTTP', 'LAB-GTTP', 'Glucose Tolerance Test (Pregnancy, 75 g)', BIO, FLU, 0, [p('Fasting Glucose', 'mg/dL', null, 92, '< 92'), p('Glucose 1 hr', 'mg/dL', null, 180, '< 180'), p('Glucose 2 hrs', 'mg/dL', null, 153, '< 153')], 'Gestational diabetes is diagnosed if any value is reached or exceeded: fasting 92, 1 hour 180, 2 hours 153 mg/dL (IADPSG).'],
  ['ASTALT', 'LAB-ASTALT', 'SGOT / SGPT Ratio', BIO, SERUM, 0, [SGOT, SGPT, RATIO_AST], 'A ratio above 2 suggests alcohol-related liver disease; below 1 is typical of viral or fatty liver disease.'],
  ['BNP', 'LAB-BNP', 'NT-proBNP', BIO, SERUM, 0, [p('NT-proBNP', 'pg/mL', null, 125, '< 125 (under 75 yrs)')], 'Helps diagnose heart failure: a normal value makes heart failure unlikely. It rises with age and kidney disease.'],
  ['GCT', 'LAB-GCT', 'Glucose Challenge Test (Pregnancy, 75 g)', BIO, FLU, 0, [p('Glucose 2 hrs (75 g)', 'mg/dL', null, 140, '< 140')], 'Single-step test (DIPSI): a 2-hour value of 140 mg/dL or more after 75 g glucose indicates gestational diabetes.'],
  ['PCT', 'LAB-PCT', 'Serum Procalcitonin', BIO, SERUM, 0, [p('Procalcitonin', 'ng/mL', null, 0.5, '< 0.5')], 'Rises in bacterial infection and sepsis much more than in viral infection; falling values support stopping antibiotics.'],
  ['UPCR', 'LAB-UPCR', 'Urine Protein Creatinine Ratio (UPCR)', BIO, URINE, 0, [p('Urine Protein', 'mg/dL'), p('Urine Creatinine', 'mg/dL'), p('Protein / Creatinine Ratio', '', null, 0.2, '< 0.2')], 'A spot-urine estimate of daily protein loss: above 0.3 in pregnancy supports pre-eclampsia; above 3.5 indicates nephrotic-range proteinuria.'],
  ['CHE', 'LAB-CHE', 'Serum Cholinesterase', BIO, SERUM, 0, [p('Cholinesterase', 'U/L', 5320, 12920)], 'Low in organophosphate poisoning and liver disease; used to monitor pesticide exposure.'],
  ['ZN', 'LAB-ZN', 'Serum Zinc', BIO, SERUM, 0, [p('Zinc', 'µg/dL', 70, 120)], 'Low zinc affects growth, healing, taste and immunity; inflammation and low albumin also lower it.'],
  ['FINS', 'LAB-FINS', 'Fasting Insulin', BIO, SERUM, 0, [p('Fasting Insulin', 'µIU/mL', 2.6, 24.9)], 'With fasting glucose it estimates insulin resistance (HOMA-IR).'],
  ['BILEAC', 'LAB-BILEAC', 'Bile Acids (Total)', BIO, SERUM, 0, [p('Total Bile Acids', 'µmol/L', null, 10, '< 10 (fasting)')], 'Raised in cholestasis of pregnancy (above 10, severe above 40 µmol/L) and liver disease.'],
  ['HCY', 'LAB-HCY', 'Homocysteine', BIO, SERUM, 0, [p('Homocysteine', 'µmol/L', 5, 15)], 'Raised with B12, folate or B6 deficiency, kidney disease and some inherited conditions; linked to clotting and heart disease.'],
  ['LDH', 'LAB-LDH', 'Serum LDH', BIO, SERUM, 0, [p('LDH', 'U/L', 125, 220)], 'LDH rises with tissue damage: haemolysis, liver and muscle injury, lymphoma and some infections. Haemolysed samples are falsely high.'],
  ['OGCT', 'LAB-OGCT', 'Oral Glucose Challenge Test (50 g)', BIO, FLU, 0, [p('Glucose 1 hr (50 g)', 'mg/dL', null, 140, '< 140')], 'A screening test in pregnancy; a 1-hour value of 140 mg/dL or more needs a full 75 g glucose tolerance test.'],
  ['DMARK', 'LAB-DMARK', 'Double Marker (Maternal Screen)', BIO, SERUM, 0, [p('Free Beta hCG', 'MoM'), p('PAPP-A', 'MoM'), p('Risk — Trisomy 21', '', null, null, 'Low risk', 't'), p('Risk — Trisomy 18', '', null, null, 'Low risk', 't')], 'First-trimester screen (11 to 13+6 weeks) combining hormones with the nuchal scan; it estimates risk and does not diagnose. High risk needs counselling and confirmatory testing.'],
  ['ADA', 'LAB-ADA', 'Adenosine Deaminase (ADA)', BIO, 'Body Fluid', 0, [p('ADA', 'U/L', null, 40, '< 40')], 'High ADA in pleural, peritoneal or CSF fluid supports tuberculosis; lymphoma and empyema can also raise it.'],
  ['VLDL', 'LAB-VLDL', 'VLDL Cholesterol', BIO, SERUM, 0, [VLDL], 'Calculated from triglycerides (TG divided by 5); not valid when triglycerides exceed 400 mg/dL.'],
  // Serology & Immunology
  ['WIDALT', 'LAB-WIDALT', 'Widal (Tube Method)', SER, SERUM, 0, [p('S. Typhi O', '', null, null, '< 1:80', 't'), p('S. Typhi H', '', null, null, '< 1:160', 't'), p('S. Paratyphi AH', '', null, null, '< 1:80', 't'), p('S. Paratyphi BH', '', null, null, '< 1:80', 't'), p('Impression', '', null, null, null, 't')], 'Widal titres must be read with the local background level and the day of illness; a fourfold rise between two samples is more meaningful than a single titre. Blood culture is the definitive test for typhoid.'],
  ['WIDAL', 'LAB-WIDAL', 'Widal Test (Slide Method)', SER, SERUM, 0, [p('S. Typhi O', '', null, null, 'Non-reactive', 't'), p('S. Typhi H', '', null, null, 'Non-reactive', 't'), p('S. Paratyphi AH', '', null, null, 'Non-reactive', 't'), p('S. Paratyphi BH', '', null, null, 'Non-reactive', 't')], 'A screening slide test; reactive results are confirmed and titrated by the tube method.'],
  ['MALAG', 'LAB-MALAG', 'Malaria Antigen', SER, EDTA, 0, [neg('P. falciparum Antigen (HRP-2)'), neg('Pan-malarial Antigen (pLDH)')], 'Rapid antigen detection. HRP-2 can stay positive for weeks after treated falciparum infection; confirm with a smear.'],
  ['HIV', 'LAB-HIV', 'HIV I & II (Card Test)', SER, SERUM, 0, [nonr('HIV-1 Antibody'), nonr('HIV-2 Antibody')], 'A screening test; a reactive result must be confirmed by the national testing strategy before diagnosis. Very recent infection (window period) may test non-reactive. Pre- and post-test counselling applies.'],
  ['HCV', 'LAB-HCV', 'Hepatitis C Virus (HCV) Antibody', SER, SERUM, 0, [nonr('Anti-HCV')], 'A reactive antibody shows exposure to hepatitis C; HCV RNA testing tells whether the infection is active.'],
  ['VDRL', 'LAB-VDRL', 'VDRL', SER, SERUM, 0, [nonr('VDRL')], 'A screening test for syphilis; reactive results are titrated and confirmed with a treponemal test (TPHA). Pregnancy, autoimmune disease and some infections give false positives.'],
  ['HBSAG', 'LAB-HBSAG', 'HBsAg', SER, SERUM, 0, [nonr('HBsAg')], 'HBsAg means current hepatitis B infection; positive for more than 6 months means chronic infection. Newborns of positive mothers need vaccine and immunoglobulin at birth.'],
  ['FOB', 'LAB-FOB', 'Occult Blood, Stool', SER, 'Stool', 0, [neg('Occult Blood')], 'Detects hidden blood in stool from bleeding anywhere in the gut; a positive test needs further evaluation, especially after age 45.'],
  ['TYPHI', 'LAB-TYPHI', 'Typhidot Antibodies', SER, SERUM, 0, [neg('Salmonella Typhi IgM'), neg('Salmonella Typhi IgG')], 'IgM suggests recent typhoid; IgG alone may reflect past infection. Blood culture remains the confirmatory test.'],
  ['RUBELLA', 'LAB-RUBELLA', 'Rubella (IgG & IgM)', SER, SERUM, 0, [neg('Rubella IgG'), neg('Rubella IgM')], 'IgG shows immunity; IgM suggests recent infection. In pregnancy an IgM-positive result is confirmed before any decision.'],
  ['CHIK', 'LAB-CHIK', 'Chikungunya IgM', SER, SERUM, 0, [neg('Chikungunya IgM')], 'IgM appears from about day 5 of illness; an early negative test should be repeated if symptoms continue.'],
  ['ASO', 'LAB-ASO', 'Antistreptolysin O (ASO) Titre', SER, SERUM, 0, [p('ASO', 'IU/mL', null, 200, '< 200')], 'A raised ASO shows recent streptococcal infection and supports rheumatic fever or post-streptococcal kidney disease in the right clinical setting.'],
  ['RAQ', 'LAB-RAF', 'Rheumatoid Factor (RA) — Quantitative', SER, SERUM, 0, [p('Rheumatoid Factor', 'IU/mL', null, 14, '< 14')], 'RA factor is positive in most people with rheumatoid arthritis but also in other autoimmune diseases, chronic infections and healthy older people. Anti-CCP is more specific.'],
  ['RAL', 'LAB-RAL', 'Rheumatoid Factor (RA) — Qualitative', SER, SERUM, 0, [neg('Rheumatoid Factor')], 'A latex screen; positive samples are quantified.'],
  ['CRPQ', 'LAB-CRP', 'C-Reactive Protein (CRP) — Quantitative', SER, SERUM, 0, [p('CRP', 'mg/L', null, 6, '< 6')], 'CRP rises within hours of infection or inflammation and falls quickly with recovery, so it is good for following treatment. Very high values suggest bacterial infection.'],
  ['CRPL', 'LAB-CRPL', 'C-Reactive Protein (CRP) — Qualitative', SER, SERUM, 0, [neg('CRP')], 'A latex screen; positive samples are quantified.'],
  ['NS1', 'LAB-NS1', 'Dengue NS1 Antigen', SER, SERUM, 0, [neg('Dengue NS1 Antigen')], 'NS1 is detectable from day 1 to about day 5 of fever; after that IgM testing is more useful.'],
  ['DENGUE', 'LAB-DENGUE', 'Dengue (Card Method — NS1, IgM, IgG)', SER, SERUM, 0, [neg('Dengue NS1 Antigen'), neg('Dengue IgM'), neg('Dengue IgG')], 'NS1 suggests early infection, IgM recent infection, and IgG with IgM a secondary infection, which carries more risk of severe dengue. Follow platelet count and haematocrit daily.'],
  ['BHCG', 'LAB-BHCG', 'Beta hCG', SER, SERUM, 0, [p('Beta hCG', 'mIU/mL', null, 5, 'Non-pregnant < 5')], 'In early pregnancy beta hCG roughly doubles every 48–72 hours; a slow rise or fall suggests a non-viable or ectopic pregnancy and needs correlation with ultrasound.'],
  ['FPSA', 'LAB-FPSA', 'Free PSA', SER, SERUM, 0, [p('Free PSA', 'ng/mL'), p('Free / Total PSA Ratio', '%', 25, null, '> 25%')], 'When total PSA is 4–10 ng/mL, a low free-to-total ratio raises suspicion of prostate cancer.'],
  ['UIGA', 'LAB-UIGA', 'IgA (Urine)', SER, URINE, 0, [p('Urine IgA', 'mg/L')], 'Urine IgA is used in the work-up of IgA-related kidney disease.'],
  ['PSA', 'LAB-PSA', 'Total PSA', SER, SERUM, 0, [p('Total PSA', 'ng/mL', null, 4, '< 4')], 'PSA rises with prostate cancer, benign enlargement, infection and after catheterisation or rectal examination; it is interpreted with age and examination findings.'],
  ['AHBC', 'LAB-AHBC', 'Anti-HBc (Total)', SER, SERUM, 0, [nonr('Anti-HBc')], 'Shows past or current hepatitis B infection (not vaccination).'],
  ['AHBS', 'LAB-AHBS', 'Anti-HBs', SER, SERUM, 0, [p('Anti-HBs', 'mIU/mL', 10, null, '≥ 10 protective')], 'A level of 10 mIU/mL or more indicates immunity to hepatitis B from vaccination or recovery.'],
  ['AHBE', 'LAB-AHBE', 'Anti-HBe', SER, SERUM, 0, [nonr('Anti-HBe')], 'Usually means lower viral replication in hepatitis B; read with HBeAg and viral load.'],
  ['HBEAG', 'LAB-HBEAG', 'HBeAg', SER, SERUM, 0, [nonr('HBeAg')], 'A positive HBeAg indicates active hepatitis B replication and higher infectivity.'],
  ['AHAV', 'LAB-AHAV', 'Anti-HAV (Total)', SER, SERUM, 0, [nonr('Anti-HAV')], 'Total antibody to hepatitis A shows past infection or vaccination.'],
  ['HAVM', 'LAB-HAVM', 'HAV IgM', SER, SERUM, 0, [nonr('HAV IgM')], 'IgM confirms acute hepatitis A.'],
  ['ANA', 'LAB-ANA', 'Anti-Nuclear Antibody (ANA) by ELISA', SER, SERUM, 0, [p('ANA', 'Index', null, 1, '< 1.0 Negative')], 'A screen for autoimmune disease such as lupus. Low positives occur in healthy people, especially older women; positives are followed by specific antibody tests.'],
  ['INSR', 'LAB-INSR', 'Insulin (Random)', SER, SERUM, 0, [p('Insulin', 'µIU/mL')], 'Random insulin is read together with the glucose drawn at the same time.'],
  ['FTESTO', 'LAB-FTESTO', 'Testosterone, Free', SER, SERUM, 0, [p('Free Testosterone', 'pg/mL', null, null, 'Age and sex dependent')], 'The unbound, active fraction; useful when binding proteins are abnormal (obesity, ageing, liver disease).'],
  ['TESTO', 'LAB-TESTO', 'Testosterone, Total', SER, SERUM, 0, [p('Testosterone, Total', 'ng/dL', null, null, 'Men 249–836 · Women 8–60', 'n', { m: [249, 836], f: [8, 60] })], 'Testosterone is highest in the morning; repeat low morning values before diagnosing deficiency. In women, high values suggest polycystic ovaries or an adrenal/ovarian source.'],
  ['PROG', 'LAB-PROG', 'Progesterone', SER, SERUM, 0, [p('Progesterone', 'ng/mL', null, null, CYCLE)], 'A mid-luteal value (about day 21 of a 28-day cycle) above 10 ng/mL suggests ovulation.'],
  ['MYO', 'LAB-MYO', 'Myoglobin', SER, SERUM, 0, [p('Myoglobin', 'ng/mL', null, 72, '< 72')], 'Rises early after muscle or heart injury but is not specific; also used in rhabdomyolysis.'],
  ['B2GPG', 'LAB-B2GPG', 'Beta-2 Glycoprotein 1, IgG', SER, SERUM, 0, [p('Beta-2 GP1 IgG', 'U/mL', null, 20, '< 20')], 'An antiphospholipid antibody; persistent positivity (12 weeks apart) supports antiphospholipid syndrome.'],
  ['B2GPM', 'LAB-B2GPM', 'Beta-2 Glycoprotein 1, IgM', SER, SERUM, 0, [p('Beta-2 GP1 IgM', 'U/mL', null, 20, '< 20')], 'An antiphospholipid antibody; persistent positivity supports antiphospholipid syndrome.'],
  ['APLG', 'LAB-APLG', 'Anti-Phospholipid IgG', SER, SERUM, 0, [p('Anti-Phospholipid IgG', 'GPL U/mL', null, 12, '< 12')], 'Linked to clots and recurrent pregnancy loss when persistently positive.'],
  ['APLM', 'LAB-APLM', 'Anti-Phospholipid IgM', SER, SERUM, 0, [p('Anti-Phospholipid IgM', 'MPL U/mL', null, 12, '< 12')], 'Linked to clots and recurrent pregnancy loss when persistently positive.'],
  ['ACLG', 'LAB-ACLG', 'Anti-Cardiolipin IgG', SER, SERUM, 0, [p('Anti-Cardiolipin IgG', 'GPL U/mL', null, 12, '< 12')], 'A medium or high titre on two occasions 12 weeks apart supports antiphospholipid syndrome.'],
  ['ACLM', 'LAB-ACLM', 'Anti-Cardiolipin IgM', SER, SERUM, 0, [p('Anti-Cardiolipin IgM', 'MPL U/mL', null, 12, '< 12')], 'A medium or high titre on two occasions 12 weeks apart supports antiphospholipid syndrome.'],
  ['WEILF', 'LAB-WEILF', 'Weil-Felix Test', SER, SERUM, 0, [p('OX-19', '', null, null, '< 1:80', 't'), p('OX-2', '', null, null, '< 1:80', 't'), p('OX-K', '', null, null, '< 1:80', 't')], 'A screening test for rickettsial fevers (OX-K raised in scrub typhus); specific IgM tests are more reliable.'],
  ['DENGG', 'LAB-DENGG', 'Dengue IgG', SER, SERUM, 0, [neg('Dengue IgG')], 'IgG indicates past dengue, or a secondary infection when IgM is also positive.'],
  ['DENGM', 'LAB-DENGM', 'Dengue IgM', SER, SERUM, 0, [neg('Dengue IgM')], 'IgM becomes positive from about day 5 and indicates recent dengue.'],
  ['DENGGM', 'LAB-DENGGM', 'Dengue IgG & IgM', SER, SERUM, 0, [neg('Dengue IgG'), neg('Dengue IgM')], 'IgM alone suggests primary dengue; IgM with IgG suggests secondary infection.'],
  ['CORT', 'LAB-CORT', 'Serum Cortisol', SER, SERUM, 0, [p('Cortisol (Morning)', 'µg/dL', 6.2, 19.4)], 'Cortisol peaks in the early morning; low morning values suggest adrenal insufficiency, high late-night values suggest Cushing syndrome. Steroid medicines interfere.'],
  ['SCRUB', 'LAB-SCRUB', 'Scrub Typhus IgM', SER, SERUM, 0, [neg('Scrub Typhus IgM')], 'Supports scrub typhus in a patient with fever, especially with an eschar; doxycycline should not wait for the result.'],
  ['TBGOLD', 'LAB-TBGOLD', 'TB Gold (Interferon Gamma Release Assay)', SER, 'Whole Blood (IGRA tubes)', 0, [p('TB Antigen minus Nil', 'IU/mL'), p('Result', '', null, null, 'Negative', 't')], 'Shows TB infection (latent or active) but cannot tell them apart; a negative result does not exclude active TB.'],
  ['TPHA', 'LAB-TPHA', 'TPHA (Treponema pallidum Haemagglutination)', SER, SERUM, 0, [nonr('TPHA')], 'A treponemal test that confirms a reactive VDRL; it usually stays positive for life after infection.'],
  ['TROPIR', 'LAB-TROPIR', 'Troponin I (Rapid)', SER, 'Whole Blood', 0, [neg('Troponin I')], 'A rapid card test; a negative early result should be repeated after 3–6 hours if chest pain continues.'],
  ['HAVPAN', 'LAB-HAVPAN', 'Anti-HAV (IgM & IgG)', SER, SERUM, 0, [nonr('Anti-HAV IgM'), nonr('Anti-HAV IgG')], 'IgM indicates acute hepatitis A; IgG alone indicates past infection or vaccination.'],
  ['HAVMQ', 'LAB-HAVMQ', 'Anti-HAV IgM (Qualitative)', SER, SERUM, 0, [nonr('Anti-HAV IgM')], 'IgM confirms acute hepatitis A.'],
  ['HAVGQ', 'LAB-HAVGQ', 'Anti-HAV IgG (Qualitative)', SER, SERUM, 0, [nonr('Anti-HAV IgG')], 'IgG shows immunity from past infection or vaccination.'],
  ['RK39', 'LAB-RK39', 'Leishmania rK-39 Antibody (Kala-azar)', SER, SERUM, 0, [neg('rK-39 Antibody')], 'Supports visceral leishmaniasis in a patient with prolonged fever and an enlarged spleen; antibodies persist after cure.'],
  ['ASOQ', 'LAB-ASOQ', 'ASO (Qualitative)', SER, SERUM, 0, [neg('ASO')], 'A latex screen; positive samples are titrated.'],
  ['HIVE', 'LAB-HIVE', 'HIV I/II (ELISA)', SER, SERUM, 0, [nonr('HIV I/II Antibody')], 'A laboratory screening assay; reactive results are confirmed by the national testing strategy.'],
  ['HBSAGE', 'LAB-HBSAGE', 'HBsAg (ELISA)', SER, SERUM, 0, [nonr('HBsAg')], 'A laboratory assay for hepatitis B surface antigen; more sensitive than the card test.'],
  ['HCVRNA', 'LAB-HCVRNA', 'HCV RNA Quantitative', SER, 'EDTA Plasma', 0, [p('HCV RNA Viral Load', 'IU/mL', null, null, 'Not detected'), p('Log Value', 'log IU/mL')], 'Confirms active hepatitis C and monitors treatment; undetectable RNA 12 weeks after treatment means cure.'],
  ['ALLERGY', 'LAB-ALLERGY', 'Allergy Screening Test', SER, SERUM, 0, [doc()], 'Specific IgE screening against common allergens; results are read with the history and do not by themselves prove clinical allergy.'],
  ['HPYL', 'LAB-HPYL', 'Helicobacter pylori Detection', SER, SERUM, 0, [neg('H. pylori Antibody / Antigen')], 'Antibody tests stay positive after cure; stool antigen or breath tests are preferred to diagnose active infection and confirm eradication.'],
  // Clinical Pathology
  ['UCREAT', 'LAB-UCREAT', 'Urine Creatinine', CP, URINE, 0, [p('Urine Creatinine', 'mg/dL')], 'Used to correct other urine measurements for concentration.'],
  ['UPTE', 'LAB-UPTE', 'Urine Pregnancy (ELISA)', CP, URINE, 0, [neg('Urine hCG')], 'A laboratory urine hCG assay; very early pregnancy may test negative.'],
  ['UFUNG', 'LAB-UFUNG', 'Urine for Fungal Elements', CP, URINE, 0, [p('Fungal Elements', '', null, null, 'Not seen', 't')], 'Yeast in urine may be contamination; significance depends on catheterisation, diabetes and immune status.'],
  ['UKET', 'LAB-UKET', 'Urine Ketone', CP, URINE, 0, [neg('Ketone Bodies', 'Absent')], 'Ketones appear with uncontrolled diabetes, fasting, vomiting and low-carbohydrate diets.'],
  ['UMICRO', 'LAB-UMICRO', 'Urine Microalbumin', CP, URINE, 0, [p('Urine Microalbumin', 'mg/L', null, 20, '< 20')], 'Early marker of kidney damage in diabetes and hypertension.'],
  ['UPROT', 'LAB-UPROT', 'Urine Protein', CP, URINE, 0, [p('Urine Protein', 'mg/dL')], 'Quantifies protein in a urine sample; persistent protein loss needs evaluation.'],
  ['UPT', 'LAB-UPT', 'Urine Pregnancy Test', CP, URINE, 0, [neg('Urine Pregnancy Test')], 'Detects hCG from about the first missed period; a negative test in suspected pregnancy should be repeated after a few days or checked with serum beta hCG.'],
  ['UAFB', 'LAB-UAFB', 'Urine for AFB (24 hours)', CP, URINE, 0, [p('Acid-Fast Bacilli', '', null, null, 'Not seen', 't')], 'Early-morning or 24-hour samples on three days increase the chance of finding urinary tuberculosis.'],
  ['UCHYLE', 'LAB-UCHYLE', 'Urine for Chyle', CP, URINE, 0, [neg('Chyle', 'Absent')], 'Chyle in urine (milky urine) is mostly due to filarial lymphatic disease.'],
  ['SEMEN', 'LAB-SEMEN', 'Semen Examination', CP, 'Semen', 0, [p('Abstinence', 'days', 2, 7), p('Volume', 'mL', 1.4, null, '≥ 1.4'), p('Liquefaction Time', 'min', null, 60, '< 60'), p('pH', '', 7.2, 8.0), p('Sperm Concentration', 'million/mL', 16, null, '≥ 16'), p('Total Motility', '%', 42, null, '≥ 42'), p('Progressive Motility', '%', 30, null, '≥ 30'), p('Normal Forms', '%', 4, null, '≥ 4'), p('Vitality', '%', 54, null, '≥ 54'), p('Pus Cells', '/hpf', 0, 5), p('Impression', '', null, null, null, 't')], 'Reference limits are WHO 2021. Collect after 2–7 days abstinence and examine within an hour; one abnormal result should be repeated after 2–3 months.'],
  ['USUGF', 'LAB-USUGF', 'Urine Sugar (Fasting)', CP, URINE, 0, [neg('Urine Sugar', 'Nil')], 'Glucose in urine usually means blood glucose above about 180 mg/dL.'],
  ['STOOL', 'LAB-STOOL', 'Stool Routine Examination', CP, 'Stool', 0, [p('Colour', '', null, null, 'Brown', 't'), p('Consistency', '', null, null, 'Formed', 't'), p('Mucus', '', null, null, 'Absent', 't'), p('Blood', '', null, null, 'Absent', 't'), p('pH', '', null, null, null, 't'), p('Occult Blood', '', null, null, 'Negative', 't'), p('Pus Cells', '/hpf', 0, 5), p('RBCs', '/hpf', null, null, 'Nil', 't'), p('Ova', '', null, null, 'Not seen', 't'), p('Cysts', '', null, null, 'Not seen', 't'), p('Trophozoites', '', null, null, 'Not seen', 't'), p('Fat Globules', '', null, null, 'Absent', 't'), p('Undigested Food', '', null, null, 'Absent', 't')], 'A fresh sample examined within an hour gives the best chance of seeing parasites; three samples on different days improve detection.'],
  ['USUGPP', 'LAB-USUGPP', 'Urine Sugar (PP)', CP, URINE, 0, [neg('Urine Sugar', 'Nil')], 'Post-meal urine sugar; blood glucose testing is more reliable.'],
  ['USUGR', 'LAB-USUGR', 'Urine Sugar (Random)', CP, URINE, 0, [neg('Urine Sugar', 'Nil')], 'Random urine sugar; blood glucose testing is more reliable.'],
  ['URI', 'LAB-URI', 'Urine Routine Examination', CP, URINE, 0, [
    p('Colour', '', null, null, 'Pale yellow', 't'), p('Appearance', '', null, null, 'Clear', 't'), p('Specific Gravity', '', 1.005, 1.030), p('pH', '', 4.6, 8.0),
    p('Protein (Albumin)', '', null, null, 'Absent', 't'), p('Glucose (Sugar)', '', null, null, 'Absent', 't'), p('Ketone Bodies', '', null, null, 'Absent', 't'), p('Bilirubin', '', null, null, 'Absent', 't'),
    p('Urobilinogen', '', null, null, 'Normal', 't'), p('Blood', '', null, null, 'Absent', 't'), p('Nitrite', '', null, null, 'Negative', 't'), p('Leukocyte Esterase', '', null, null, 'Negative', 't'),
    p('Pus Cells', '/hpf', 0, 5), p('RBCs', '/hpf', null, null, 'Nil', 't'), p('Epithelial Cells', '/hpf', 0, 5), p('Casts', '', null, null, 'Nil', 't'),
    p('Crystals', '', null, null, 'Nil', 't'), p('Bacteria', '', null, null, 'Absent', 't'), p('Yeast Cells', '', null, null, 'Absent', 't')],
    'A mid-stream clean-catch sample examined within 2 hours. Pus cells with nitrite or leukocyte esterase suggest urinary infection (confirm with culture); protein, blood or casts suggest kidney disease; glucose and ketones suggest uncontrolled diabetes.'],
  ['FLUID', 'LAB-FLUID', 'Body Fluid Examination', CP, 'Body Fluid', 0, [p('Fluid Type', '', null, null, null, 't'), p('Volume', 'mL'), p('Colour', '', null, null, null, 't'), p('Appearance', '', null, null, null, 't'), p('Total Cell Count', 'cells/cumm'), p('Neutrophils', '%'), p('Lymphocytes', '%'), p('Protein', 'g/dL'), p('Glucose', 'mg/dL'), p('Impression', '', null, null, null, 't')], 'Cell count, protein and glucose help separate infection, tuberculosis, malignancy and transudates; read with serum values and the clinical picture.'],
  ['UCOT', 'LAB-UCOT', 'Urine Cotinine', CP, URINE, 0, [neg('Cotinine')], 'Cotinine, a nicotine breakdown product, shows tobacco use or heavy exposure over the past few days.'],
  ['UCORT', 'LAB-UCORT', 'Urine Cortisol (24 hours)', CP, URINE, 0, [p('Urine Free Cortisol', 'µg/24 hr', 4, 50)], 'A screening test for Cushing syndrome; incomplete collection gives falsely low results.'],
  ['MALB24', 'LAB-MALB24', 'Microalbumin, Urine 24 hours', CP, URINE, 0, [p('Urine Volume', 'mL/24 hr'), p('Microalbumin', 'mg/24 hr', null, 30, '< 30')], '30–300 mg per day indicates moderately increased albuminuria (early kidney damage).'],
  ['UBP', 'LAB-UBP', 'Urine Bile Pigments', CP, URINE, 0, [neg('Bile Pigments', 'Absent')], 'Bile pigments in urine indicate raised conjugated bilirubin (liver disease or blocked bile ducts).'],
  ['UBS', 'LAB-UBS', 'Urine Bile Salts', CP, URINE, 0, [neg('Bile Salts', 'Absent')], 'Bile salts in urine suggest blocked bile flow.'],
  ['UDS', 'LAB-UDS', 'Urine Drug Screen', CP, URINE, 0, [doc()], 'An immunoassay screen; positive results that matter legally or clinically are confirmed by a reference method. Some medicines cause false positives.'],
  // Cytology
  ['FNAC', 'LAB-FNAC', 'FNAC (Fine Needle Aspiration Cytology)', CYT, 'Aspirate', 0, [p('Site', '', null, null, null, 't'), p('Clinical Details', '', null, null, null, 't'), p('Gross', '', null, null, null, 't'), p('Microscopy', '', null, null, null, 't'), p('Impression', '', null, null, null, 't')], 'A cytological opinion on the aspirated cells; a negative or inadequate FNAC does not exclude disease when clinical suspicion remains, and biopsy may be needed.'],
  ['PAP', 'LAB-PAP', 'PAP Smear', CYT, 'Cervical Smear', 0, [p('Specimen Adequacy', '', null, null, null, 't'), p('Microscopy', '', null, null, null, 't'), p('Interpretation (Bethesda)', '', null, null, 'Negative for intraepithelial lesion or malignancy', 't')], 'Reported by the Bethesda system; abnormal results are followed by repeat testing, HPV testing or colposcopy as advised.'],
  ['LEPRA', 'LAB-LEPRA', 'Skin Smear for Leprosy', CYT, 'Skin Smear', 0, [p('Bacteriological Index', '', null, null, 'Negative', 't')], 'Slit-skin smear for leprosy bacilli; a negative smear does not exclude paucibacillary leprosy.'],
  ['BFCYT', 'LAB-BFCYT', 'Body Fluid Cytology', CYT, 'Body Fluid', 0, [p('Fluid Type', '', null, null, null, 't'), p('Microscopy', '', null, null, null, 't'), p('Impression', '', null, null, null, 't')], 'Examination of fluid cells for inflammation and malignant cells.'],
  // Microbiology
  ['GRAM', 'LAB-GRAM', 'Gram Stain', MIC, 'Specimen', 0, [p('Specimen', '', null, null, null, 't'), p('Pus Cells', '', null, null, null, 't'), p('Organisms', '', null, null, 'No organisms seen', 't')], 'A rapid guide to the likely organism; culture confirms the organism and its sensitivity.'],
  ['AFB', 'LAB-AFB', 'Acid-Fast Bacilli (AFB) Stain', MIC, 'Sputum', 0, [p('Specimen', '', null, null, null, 't'), p('AFB (Ziehl-Neelsen)', '', null, null, 'Not seen', 't')], 'Two sputum samples (one early-morning) improve detection; a negative smear does not exclude TB — molecular tests (CBNAAT) are more sensitive.'],
  ['SSAFB', 'LAB-SSAFB', 'Skin Smear for AFB', MIC, 'Skin Smear', 0, [p('AFB', '', null, null, 'Not seen', 't')], 'Smear for acid-fast bacilli from skin lesions.'],
  ['FUNG', 'LAB-FUNG', 'Fungal Scraping (KOH Mount)', MIC, 'Skin / Nail Scraping', 0, [p('Fungal Elements', '', null, null, 'Not seen', 't')], 'KOH mount shows fungal elements in skin, hair or nail; culture identifies the species.'],
  ['CS', 'LAB-CS', 'Culture and Sensitivity', MIC, 'Specimen', 0, [p('Specimen', '', null, null, null, 't'), p('Organism Isolated', '', null, null, 'No growth after 48 hours', 't'), p('Colony Count', '', null, null, null, 't'), p('Antibiotic Sensitivity', '', null, null, null, 't')], 'Collect before antibiotics where possible. Sensitivity results guide the choice of antibiotic; a mixed growth usually means contamination and needs a fresh sample.'],
  // Endocrinology
  ['T3', 'LAB-T3', 'Serum Triiodothyronine (T3)', END, SERUM, 0, [T3], 'T3 helps identify hyperthyroidism, especially T3 toxicosis; read with TSH.'],
  ['T4', 'LAB-T4', 'Serum Thyroxine (T4)', END, SERUM, 0, [T4], 'Total T4 is affected by pregnancy and oral contraceptives (raised binding protein); free T4 is preferred then.'],
  ['TSH', 'LAB-TSH', 'Thyroid-Stimulating Hormone (TSH)', END, SERUM, 0, [TSH], 'TSH is the best single test of thyroid function: high suggests an underactive thyroid, low an overactive one. It varies through the day and is lower in pregnancy (1st trimester about 0.1–2.5 µIU/mL).'],
  ['FT3', 'LAB-FT3', 'Free T3', END, SERUM, 0, [FT3], 'Free T3 is the active hormone; useful when TSH is low with a normal free T4.'],
  ['FT4', 'LAB-FT4', 'Free T4', END, SERUM, 0, [FT4], 'Free T4 with TSH classifies thyroid disease and monitors thyroxine dosing.'],
  ['AFP', 'LAB-AFP', 'Alpha-Fetoprotein (AFP)', END, SERUM, 0, [p('AFP', 'ng/mL', null, 8.1, '< 8.1 (non-pregnant adults)')], 'Raised in liver cancer and some testicular tumours; in pregnancy it is part of fetal screening.'],
  ['PRL', 'LAB-PRL', 'Prolactin', END, SERUM, 0, [p('Prolactin', 'ng/mL', null, null, null, 'n', { m: [4.0, 15.2], f: [4.8, 23.3] })], 'Prolactin rises with stress, sleep, pregnancy, breastfeeding, hypothyroidism and several medicines; a mildly raised value is repeated on a resting morning sample before investigating for a pituitary cause.'],
  ['LH', 'LAB-LH', 'Luteinising Hormone (LH)', END, SERUM, 0, [p('LH', 'mIU/mL', null, null, CYCLE)], 'LH surges mid-cycle to trigger ovulation. A high LH:FSH ratio is common in polycystic ovaries; high values after menopause or in primary ovarian/testicular failure.'],
  ['FSH', 'LAB-FSH', 'Follicle Stimulating Hormone (FSH)', END, SERUM, 0, [p('FSH', 'mIU/mL', null, null, CYCLE)], 'Measured on day 2–3 of the cycle for ovarian reserve; high values suggest reduced reserve or menopause, low values a pituitary cause.'],
  ['FOLATE', 'LAB-FOLATE', 'Folic Acid', END, SERUM, 0, [p('Folate', 'ng/mL', 3.9, 26.8)], 'Low folate causes large-cell anaemia and, in pregnancy, neural tube defects; a recent meal can mask deficiency.'],
  ['PTH', 'LAB-PTH', 'Parathyroid Hormone (PTH)', END, 'EDTA Plasma', 0, [p('Intact PTH', 'pg/mL', 15, 65)], 'Interpret with calcium: high PTH with high calcium suggests primary hyperparathyroidism; high PTH with low calcium suggests vitamin D deficiency or kidney disease.'],
  // Miscellaneous
  ['MEDEXAM', 'LAB-MEDEXAM', 'Medical Examination Report', MISC, 'Not applicable', 0, [doc('Findings'), doc('Remarks')], 'A free-text fitness / medical examination report.'],
  ['CEA', 'LAB-CEA', 'CEA (Carcinoembryonic Antigen)', MISC, SERUM, 0, [p('CEA', 'ng/mL', null, 5, '< 5 (smokers may be higher)')], 'Used to monitor colorectal and some other cancers after treatment; smoking and inflammation also raise it, so it is not a screening test.'],
  ['MANTOUX', 'LAB-MANTOUX', 'Mantoux Test', MISC, 'Intradermal', 0, [p('Induration at 48–72 hrs', 'mm'), p('Interpretation', '', null, null, null, 't')], 'Read at 48–72 hours as induration (not redness): 10 mm or more is generally positive; 5 mm or more in HIV, recent contacts and immunosuppressed patients. BCG and non-tuberculous mycobacteria can cause positives.'],
];

/* ------------------------------------------------------------ panels: several tests on one report
 * [code, name, section, sample, price (always 0), params, note] — parameters print in this order. */
const CBC_CORE = [HB, TLC, ...DLC, PLT, RBC, HCT, MCV, MCH, MCHC, MPV];
const CBC_NOTE = 'Interpret with age, sex and clinical findings. Platelet clumping or a delayed sample can give falsely low platelets; abnormal or flagged counts are confirmed on a peripheral smear.';
export const PANELS = [
  ['LAB-CBC', 'Complete Blood Count (CBC)', HAE, EDTA, 0, [...CBC_CORE, RDWSD, RDWCV, PLCR, PDW], CBC_NOTE],
  ['LAB-CBCABS', 'CBC (with Absolute Counts)', HAE, EDTA, 0, [HB, TLC, ...DLC, ...ABS, NLR, PLT, RBC, HCT, MCV, MCH, MCHC, MPV, RDWCV, RDWSD], `${CBC_NOTE} Absolute counts are more reliable than percentages when the total count is abnormal.`],
  ['LAB-CBCESR', 'CBC with ESR', HAE, EDTA, 0, [...CBC_CORE, RDWSD, RDWCV, PLCR, PDW, ESRW], `${CBC_NOTE} ESR is a non-specific marker of inflammation.`],
  ['LAB-BTCT', 'BT & CT', HAE, 'Whole Blood', 0, [BT, CT], 'Bleeding time reflects platelet function; clotting time is a crude screen of clotting factors. PT/INR and APTT are preferred before surgery.'],
  ['LAB-COAG', 'Coagulation Profile', HAE, CIT, 0, [BT, CT, ...PT, ...APTT], 'PT/INR tests the extrinsic pathway and warfarin effect; APTT the intrinsic pathway and heparin effect. Prolonged values need correlation with liver function, medicines and bleeding history.'],
  ['LAB-BSFPP', 'Blood Sugar Fasting & PP', BIO, FLU, 0, [FBS, PPBS], 'Fasting: below 100 normal, 100–125 impaired, 126 or more diabetic. Two hours after a meal: below 140 normal, 140–199 impaired, 200 or more diabetic (mg/dL).'],
  ['LAB-LFT', 'Liver Function Test (LFT)', BIO, SERUM, 0, [TBIL, DBIL, IBIL, SGOT, SGPT, RATIO_AST, ALP, TP, ALB, GLOB, AG], 'SGOT and SGPT reflect liver-cell injury; alkaline phosphatase and direct bilirubin reflect bile flow; albumin reflects how well the liver makes protein. An SGOT/SGPT ratio above 2 suggests alcohol-related disease.'],
  ['LAB-BILI', 'Bilirubin Total, Direct & Indirect', BIO, SERUM, 0, [TBIL, DBIL, IBIL], 'Raised direct bilirubin suggests liver or bile-duct disease; raised indirect bilirubin suggests red-cell breakdown or Gilbert syndrome.'],
  ['LAB-RFT', 'Kidney Function Test (KFT)', BIO, SERUM, 0, [BUN, UREA, CREAT, EGFR, EGFRCAT, CA, K, NA, UA, UCR, BUNCR], 'Creatinine and eGFR measure kidney filtration (eGFR stages: G1 90 or more, G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 below 15). A high urea-to-creatinine ratio suggests dehydration or gut bleeding.'],
  ['LAB-KFTNE', 'KFT without eGFR', BIO, SERUM, 0, [BUN, UREA, CREAT, CA, K, NA, UA, UCR, BUNCR], 'Creatinine is the main marker of kidney filtration. A high urea-to-creatinine ratio suggests dehydration or gut bleeding.'],
  ['LAB-LIP', 'Lipid Profile', BIO, SERUM, 0, [CHOL, TG, HDL, LDL, VLDL, LDLHDL, CHOLHDL, TGHDL, NONHDL], 'Sample after a 10–12 hour fast. Desirable (mg/dL): total cholesterol below 200, triglycerides below 150, LDL below 100, HDL above 40 (men) / 50 (women), non-HDL below 130. Treatment targets depend on overall heart risk.'],
  ['LAB-ELEC', 'Electrolytes Panel', BIO, SERUM, 0, [NA, K, CL, CA, ICA], 'Sodium and potassium values below 120 / 2.5 or above 160 / 6.5 mmol/L are critical. Haemolysed samples falsely raise potassium.'],
  ['LAB-ARTH', 'Arthritis Profile', BIO, SERUM, 0, [UA, p('Rheumatoid Factor', 'IU/mL', null, 14, '< 14'), p('CRP', 'mg/L', null, 6, '< 6'), p('ASO', 'IU/mL', null, 200, '< 200'), ICA, TCA, PHOS], 'Uric acid for gout, RA factor for rheumatoid arthritis, CRP for inflammation and ASO for recent streptococcal infection; anti-CCP is more specific for rheumatoid arthritis.'],
  ['LAB-PROT', 'Protein Fraction', BIO, SERUM, 0, [TP, ALB, GLOB, AG], 'Low albumin suggests liver disease, kidney protein loss or malnutrition; high globulin suggests chronic inflammation or myeloma.'],
  ['LAB-TORCH', 'TORCH Profile', BIO, SERUM, 0, [neg('Toxoplasma IgG'), neg('Toxoplasma IgM'), neg('Rubella IgG'), neg('Rubella IgM'), neg('CMV IgG'), neg('CMV IgM'), neg('HSV-1/2 IgG'), neg('HSV-1/2 IgM'), neg('HSV-2 IgG')], 'IgG shows past infection or immunity; IgM suggests recent infection but can persist or be falsely positive. In pregnancy, positive IgM results are confirmed (e.g. IgG avidity) before any decision.'],
  ['LAB-IRON', 'Iron Studies', BIO, SERUM, 0, [IRON, UIBC, TIBC, TSAT], 'Iron deficiency: low iron, high TIBC, saturation below 16–20%. Anaemia of chronic disease: low iron with low or normal TIBC. Iron overload: saturation above 45%. Ferritin completes the picture.'],
  ['LAB-AMHP', 'AMH Panel', BIO, SERUM, 0, [p('AMH', 'ng/mL', null, null, 'Age dependent'), T4, TSH, p('Prolactin', 'ng/mL', null, null, null, 'n', { m: [4.0, 15.2], f: [4.8, 23.3] }), p('LH', 'mIU/mL', null, null, CYCLE), p('FSH', 'mIU/mL', null, null, CYCLE), p('Estradiol', 'pg/mL', null, null, CYCLE)], 'A fertility work-up: AMH for ovarian reserve, thyroid and prolactin for treatable causes, and day 2–3 FSH, LH and estradiol for ovarian function.'],
  ['LAB-VIRAL', 'Viral Marker', SER, SERUM, 0, [nonr('HIV I & II'), nonr('VDRL'), nonr('Anti-HCV'), nonr('HBsAg')], 'Screening tests; reactive results are confirmed before diagnosis, with counselling as required.'],
  ['LAB-THY', 'Thyroid Function Test (TFT)', END, SERUM, 0, [T3, T4, TSH], 'High TSH with low T4 suggests hypothyroidism; low TSH with high T4/T3 suggests hyperthyroidism. TSH varies through the day; pregnancy has its own trimester ranges.'],
  ['LAB-FTFT', 'Free Thyroid Function Test (FTFT)', END, SERUM, 0, [FT3, FT4, TSH], 'Free hormones are not affected by binding-protein changes (pregnancy, oral contraceptives) and are preferred in those settings.'],
  ['LAB-PCOD', 'PCOD Profile', END, SERUM, 0, [p('Progesterone', 'ng/mL', null, null, CYCLE), p('Prolactin', 'ng/mL', null, null, null, 'n', { m: [4.0, 15.2], f: [4.8, 23.3] }), p('LH', 'mIU/mL', null, null, CYCLE), p('FSH', 'mIU/mL', null, null, CYCLE), RBS, p('Estradiol', 'pg/mL', null, null, CYCLE)], 'Polycystic ovary work-up; a high LH:FSH ratio is common in PCOS, and glucose screens for insulin resistance. Sample on day 2–3 of the cycle unless advised otherwise.'],
  ['LAB-UPCRP', 'Urine Protein / Creatinine Ratio (UPCR)', BIO, URINE, 0, [p('Urine Creatinine', 'mg/dL'), p('Urine Protein', 'mg/dL'), p('Protein / Creatinine Ratio', '', null, 0.2, '< 0.2')], 'Above 0.3 in pregnancy supports pre-eclampsia; above 3.5 indicates nephrotic-range protein loss.'],
  ['LAB-EGFRP', 'Estimated Glomerular Filtration Rate (eGFR)', BIO, SERUM, 0, [CREAT, EGFR, EGFRCAT], 'CKD-EPI 2021 estimate from creatinine, age and sex; not valid in acute kidney injury or pregnancy.'],
  ['LAB-CBCMOR', 'CBC with Morphology', HAE, EDTA, 0, [...DLC, ...ABS, p('WBC Count', 'cells/cumm', 4000, 11000), RBC, HCT, MCV, MCH, MCHC, RDWCV, PLT, MPV, PDW, p('RBC Morphology', '', null, null, null, 't'), p('WBC Morphology', '', null, null, null, 't'), p('Platelet Morphology', '', null, null, null, 't')], CBC_NOTE],
];

/* ------------------------------------------------------------ packages: tests and panels sold together
 * [code, name, codes] — created unpriced; the hospital sets the package price before it can be used. */
export const PACKAGES = [
  ['PKG-LAB-ANEMIA', 'Anaemia Package', ['LAB-CRP', 'LAB-FOLATE', 'LAB-B12', 'LAB-TSAT', 'LAB-TIBC', 'LAB-RETIC', 'LAB-SIRON', 'LAB-FERR', 'LAB-CBCESR']],
  ['PKG-LAB-ANC', 'Antenatal Package', ['LAB-URI', 'LAB-TSH', 'LAB-RBS', 'LAB-PRL', 'LAB-BGRH', 'LAB-VIRAL', 'LAB-CBCABS']],
  ['PKG-LAB-ARTH', 'Arthritis Package', ['LAB-CRP', 'LAB-C3', 'LAB-ANA', 'LAB-URI', 'LAB-TIBC', 'LAB-TSH', 'LAB-URIC', 'LAB-RAF', 'LAB-ASO', 'LAB-CCP', 'LAB-VITD', 'LAB-CBCESR']],
  ['PKG-LAB-BOH', 'Bad Obstetric History (BOH) Package', ['LAB-TSH', 'LAB-LA', 'LAB-B2GPM', 'LAB-B2GPG', 'LAB-APLM', 'LAB-APLG', 'LAB-ANA', 'LAB-ACLM', 'LAB-ACLG', 'LAB-TORCH']],
  ['PKG-LAB-CBCGBP', 'CBC with GBP', ['LAB-PS', 'LAB-CBC']],
  ['PKG-LAB-CARDIAC', 'Cardiac Package', ['LAB-CKMB', 'LAB-MYO', 'LAB-HSCRP', 'LAB-CK', 'LAB-HBA1C', 'LAB-LIP', 'LAB-CBCABS']],
  ['PKG-LAB-DIAB', 'Diabetic Package', ['LAB-URI', 'LAB-URIC', 'LAB-UREA', 'LAB-CREAT', 'LAB-HBA1C', 'LAB-LIP', 'LAB-BSFPP']],
  ['PKG-LAB-DIAL', 'Dialysis Package', ['LAB-URI', 'LAB-UREA', 'LAB-NA', 'LAB-K', 'LAB-CREAT', 'LAB-CL', 'LAB-RBS', 'LAB-ICA', 'LAB-BUN', 'LAB-CBCABS']],
  ['PKG-LAB-FEVER', 'Fever Package', ['LAB-URI', 'LAB-TYPHI', 'LAB-MALAG', 'LAB-DENGUE', 'LAB-CBCESR']],
  ['PKG-LAB-FIT', 'Fitness Package', ['LAB-B12', 'LAB-URI', 'LAB-RBS', 'LAB-HBA1C', 'LAB-VITD', 'LAB-THY', 'LAB-LFT', 'LAB-LIP', 'LAB-RFT', 'LAB-IRON', 'LAB-CBCABS']],
  ['PKG-LAB-FBCF', 'Full Body Check-up (Female)', ['LAB-CRP', 'LAB-TESTO', 'LAB-FOLATE', 'LAB-B12', 'LAB-URI', 'LAB-RAF', 'LAB-HBA1C', 'LAB-FBS', 'LAB-CA153', 'LAB-CA125', 'LAB-VITD', 'LAB-THY', 'LAB-LFT', 'LAB-LIP', 'LAB-RFT', 'LAB-CBCABS']],
  ['PKG-LAB-FBCM', 'Full Body Check-up (Male)', ['LAB-CRP', 'LAB-TESTO', 'LAB-FOLATE', 'LAB-B12', 'LAB-URI', 'LAB-PSA', 'LAB-RAF', 'LAB-HBA1C', 'LAB-FBS', 'LAB-CA199', 'LAB-VITD', 'LAB-THY', 'LAB-LFT', 'LAB-LIP', 'LAB-RFT', 'LAB-CBCABS']],
  ['PKG-LAB-HTD', 'Hb, TLC, DLC', ['LAB-DLC', 'LAB-TLC', 'LAB-HB']],
  ['PKG-LAB-HTDE', 'Hb, TLC, DLC, ESR', ['LAB-ESR', 'LAB-DLC', 'LAB-TLC', 'LAB-HB']],
  ['PKG-LAB-PREG', 'Pregnancy Profile', ['LAB-RBS', 'LAB-URI', 'LAB-BGRH', 'LAB-HBSAG', 'LAB-VDRL', 'LAB-HIV', 'LAB-HB']],
  ['PKG-LAB-PREOP', 'Pre-operative Package', ['LAB-CALCIT', 'LAB-URI', 'LAB-TSH', 'LAB-SGPT', 'LAB-SGOT', 'LAB-NA', 'LAB-K', 'LAB-CL', 'LAB-PT', 'LAB-ICA', 'LAB-RBS', 'LAB-BT', 'LAB-BGRH', 'LAB-HBSAG', 'LAB-HCV', 'LAB-HIV', 'LAB-UREA', 'LAB-CREAT', 'LAB-CBCABS']],
  ['PKG-LAB-ELEC', 'Serum Electrolytes (Na, K)', ['LAB-K', 'LAB-NA']],
  ['PKG-LAB-NAK', 'Serum Sodium & Potassium', ['LAB-K', 'LAB-NA']],
  ['PKG-LAB-TDE', 'TLC, DLC, ESR', ['LAB-ESR', 'LAB-DLC', 'LAB-TLC']],
  ['PKG-LAB-THY', 'Thyroid Package', ['LAB-FT3', 'LAB-FT4', 'LAB-THY', 'LAB-CBCABS']],
];
