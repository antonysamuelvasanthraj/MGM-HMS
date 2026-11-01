/**
 * Report interpretation / comments for lab tests, and tests the hospital asked to add
 * (iron studies, hormones, vitamins, tumour marker, thyroid profile).
 *
 * All text is editable in Laboratory → Templates → Edit description; this only fills
 * blanks. Numeric reference ranges are given only where the hospital supplied them —
 * every other range is left for the laboratory to enter its own validated, assay-specific
 * range. New tests are added once (setting lab_catalog_2026_10), so a test the hospital
 * later deletes is not re-created.
 */
const TSH_NOTE = 'TSH follows a daily rhythm — highest in the early morning, lowest in the evening — and can vary by about 50%, so the time of sampling affects the result. Suggested TSH ranges in pregnancy (µIU/mL): 1st trimester 0.3–4.5, 2nd trimester 0.5–4.6, 3rd trimester 0.8–5.2. TSH values below 0.03 µIU/mL need clinical correlation (a rare TSH variant exists in some people).';

export const REPORT_COMMENTS = {
  'LAB-TSH': ['Interpretation', `TSH is the most sensitive single test of thyroid function: a high TSH suggests an underactive thyroid and a low TSH an overactive thyroid. ${TSH_NOTE}`],
  'LAB-TFT': ['Interpretation', `T3, T4 and TSH together assess thyroid function. High TSH with low T4 suggests hypothyroidism; low TSH with high T4 / T3 suggests hyperthyroidism. ${TSH_NOTE}`],
  'LAB-HBA1C': ['Interpretation', 'HbA1c reflects average blood glucose over the previous 2–3 months. Guide (%): below 5.7 non-diabetic; 5.7–6.4 increased risk (prediabetes); 6.5 or above is consistent with diabetes (American Diabetes Association). In known diabetes a target near 7% is common and above 8% suggests poor control.\nFalsely low values occur when red cells survive for a shorter time (haemolysis, blood loss, pregnancy) or after large doses of vitamin C or E; falsely high values occur with iron-deficiency anaemia, chronic kidney disease and alcohol. Haemoglobin variants can affect the result. Clinical correlation is suggested.'],
  'LAB-LFT': ['Interpretation', 'SGOT (AST) and SGPT (ALT) reflect liver-cell injury; alkaline phosphatase and bilirubin reflect bile flow; albumin and total protein reflect the liver\'s production of proteins.\nTotal bilirubin in adults is usually up to about 1.0–1.2 mg/dL. In newborns bilirubin must be judged against the baby\'s age in hours and whether the baby was term or premature, using a neonatal chart — not the adult range.'],
  'LAB-LIP': ['Interpretation', 'Lipid targets (mg/dL, National Lipid Association 2014):\n• Total cholesterol — desirable below 200; borderline high 200–239; high 240 or above.\n• Triglycerides — normal below 150; borderline high 150–199; high 200–499.\n• LDL cholesterol — optimal below 100; above optimal 100–129; borderline high 130–159; high 160–189.\n• Non-HDL cholesterol — optimal below 130.\nA 9–12 hour fasting sample is preferred when triglycerides are raised. Treatment targets depend on the person\'s overall cardiovascular risk.'],
  'LAB-CBC': ['Comments', 'Interpret the blood count with the patient\'s age, sex and clinical findings. Platelet clumping or a delayed sample can give a falsely low platelet count; such counts should be confirmed on a smear or a fresh sample. Comments on red-cell, white-cell and platelet appearance, when made, are printed in the remarks above.'],
  'LAB-IRON': ['Comments', 'Serum iron measures the iron carried in the blood; TIBC (total iron-binding capacity) reflects transferrin, the protein that carries iron from the gut to the bone marrow and stores; transferrin saturation is the percentage of transferrin carrying iron.\nIn iron-deficiency anaemia serum iron and saturation fall while TIBC rises. In iron overload (haemochromatosis, repeated transfusions) saturation is high. Serum iron varies through the day and after iron-containing medicines; interpret with ferritin and the blood count.'],
  'LAB-FERR': ['Comments', 'Ferritin is a good guide to the body\'s iron stores, and a low value indicates iron deficiency. Ferritin also rises as an acute-phase protein in infection, inflammation, liver disease and some cancers, so in these conditions a normal ferritin does not exclude iron deficiency; interpret with iron studies and CRP. In inflammation, a low ferritin still suggests the patient will respond to iron.'],
  'LAB-PRL': ['Comments', '1. Prolactin is released in pulses and rises with stress, sleep, exercise, pregnancy and several medicines. A mildly raised value should be repeated on a resting morning sample, or as samples taken 20–30 minutes apart and pooled.\n2. Some people carry macroprolactin, a large inactive form that raises the measured level without causing symptoms.\n3. Macroprolactin testing is advised when prolactin is raised but there are no symptoms of excess prolactin or pituitary imaging is normal.'],
  'LAB-FSH': ['Interpretation', 'FSH and LH are pituitary hormones that control the ovaries and testes. In women the expected values depend on the phase of the cycle (follicular, mid-cycle peak, luteal) and on menopause, so record the cycle day.\nRaised levels suggest primary failure of the ovaries or testes, including menopause; low levels suggest a pituitary or hypothalamic cause. Useful in evaluating irregular periods, infertility, ovulation, early or delayed puberty and suspected hypogonadism.'],
  'LAB-LH': ['Interpretation', 'LH and FSH are pituitary hormones that control the ovaries and testes. In women the expected values depend on the phase of the cycle (follicular, mid-cycle peak, luteal) and on menopause, so record the cycle day.\nLH is usually raised in primary ovarian or testicular failure, menopause and precocious puberty, and is low when the pituitary or hypothalamus fails. Useful in predicting ovulation and evaluating infertility, irregular periods and suspected hypogonadism.'],
  'LAB-TESTO': ['Comments', 'Testosterone is measured to evaluate: suspected low testosterone in men; delayed or early puberty in boys; excess hair growth, virilisation or scanty periods in women; suspected testosterone deficiency in women; infants with ambiguous genitalia; and to monitor testosterone replacement or anti-androgen treatment. Levels are highest in the morning — for men a sample before 10 a.m. is preferred, and an abnormal result should be repeated.'],
  'LAB-VITD': ['Test information', 'Vitamin D regulates calcium and phosphorus and is needed for bone mineralisation. 25-hydroxy vitamin D is the best measure of vitamin D status.\nCategories (ng/mL): deficiency below 10 · insufficiency 10–29 · sufficiency 30–100 · possible toxicity above 100.\nHigh levels usually reflect excess supplements (rarely excessive sun exposure). Low levels occur with little sun exposure, poor diet, malabsorption (coeliac disease, inflammatory bowel disease, bowel surgery, pancreatic insufficiency), liver or kidney disease and some anticonvulsant medicines. Used to diagnose deficiency or excess, investigate rickets and osteomalacia and monitor replacement.'],
  'LAB-B12': ['Comments', '1. Interpret the result with the clinical findings.\n2. Results from different vitamin B12 assay methods are not interchangeable.\n3. Vitamin B12 deficiency causes macrocytic anaemia and nerve damage. Causes include pernicious anaemia (lack of intrinsic factor), low dietary intake (strict vegetarian diet), stomach or small-bowel surgery or disease, malabsorption and some medicines such as metformin. Borderline values may need further tests.'],
  'LAB-CA125': ['Interpretation', '• CA-125 is a glycoprotein raised in many epithelial ovarian cancers (serous, endometrioid, clear-cell) and is used mainly to monitor treatment and detect recurrence after surgery.\n• It is also raised in other cancers (pancreas, lung, breast, bowel), endometriosis, pelvic inflammation, pregnancy, menstruation and liver disease.\n• It is not a screening test for women without symptoms, because of its low sensitivity and specificity. A single value should not be used for diagnosis.'],
};
REPORT_COMMENTS['LAB-LIPID'] = REPORT_COMMENTS['LAB-LIP'];
REPORT_COMMENTS['LAB-THY'] = REPORT_COMMENTS['LAB-TFT'];

/** [code, name, section, sample, price, tat, description, params[[name, unit, low, high, refText, resultType]]] */
const NEW_TESTS = [
  ['LAB-IRON', 'Iron Studies (Iron, TIBC, Transferrin Saturation)', 'Biochemistry', 'Serum', 900, 240, 'Measures serum iron, iron-binding capacity and transferrin saturation to assess iron deficiency and iron overload.',
    [['Serum Iron', 'µg/dL'], ['TIBC', 'µg/dL'], ['Transferrin Saturation', '%']]],
  ['LAB-FERR', 'Serum Ferritin', 'Biochemistry', 'Serum', 700, 240, 'Measures ferritin, a marker of the body\'s iron stores.', [['Ferritin', 'ng/mL']]],
  ['LAB-PRL', 'Prolactin', 'Hormones', 'Serum', 600, 240, 'Measures prolactin, a pituitary hormone.', [['Prolactin', 'ng/mL']]],
  ['LAB-FSH', 'FSH (Follicle Stimulating Hormone)', 'Hormones', 'Serum', 550, 240, 'Measures FSH, a pituitary hormone that controls the ovaries and testes.', [['FSH', 'mIU/mL']]],
  ['LAB-LH', 'LH (Luteinising Hormone)', 'Hormones', 'Serum', 550, 240, 'Measures LH, a pituitary hormone that controls the ovaries and testes.', [['LH', 'mIU/mL']]],
  ['LAB-TESTO', 'Testosterone, Total', 'Hormones', 'Serum', 700, 240, 'Measures total testosterone.', [['Testosterone, Total', 'ng/mL']]],
  ['LAB-VITD', 'Vitamin D (25-Hydroxy)', 'Biochemistry', 'Serum', 1500, 480, 'Measures 25-hydroxy vitamin D, the best indicator of vitamin D status.',
    [['25-Hydroxy Vitamin D', 'ng/mL', 30, 100, 'Deficiency <10 · Insufficiency 10–29 · Sufficiency 30–100 · Toxicity >100']]],
  ['LAB-B12', 'Vitamin B12', 'Biochemistry', 'Serum', 900, 480, 'Measures vitamin B12 (cobalamin).', [['Vitamin B12', 'pg/mL', 192, 827]]],
  ['LAB-CA125', 'CA-125 (Ovarian Tumour Marker)', 'Immunology', 'Serum', 1200, 480, 'Measures CA-125, a tumour marker used mainly to monitor ovarian cancer.', [['CA-125', 'U/mL', 0, 35, '< 35 U/mL']]],
  ['LAB-THY', 'Thyroid Profile (Total T3, T4, TSH)', 'Hormones', 'Serum', 600, 240, 'Measures T3, T4 and TSH to assess thyroid function.',
    [['T3, Total', 'ng/mL', 0.75, 2.10], ['T4, Total', 'µg/dL', 5.0, 13.0], ['TSH', 'µIU/mL', 0.35, 5.5]]],
];

export function preloadLabCatalog(db) {
  const flag = db.prepare("SELECT value FROM settings WHERE key='lab_catalog_2026_10'").get();
  if (!flag) {
    const lab = db.prepare("SELECT id FROM departments WHERE code='LAB'").get();
    if (lab) {
      const exists = db.prepare('SELECT 1 FROM services WHERE code=?');
      const addSvc = db.prepare(`INSERT INTO services (code,name,category,department_id,price,gst_pct,tat_minutes,sample_type,active,billing_unit,lab_section,description)
        VALUES (?,?,'lab',?,?,0,?,?,1,'once',?,?)`);
      const addParam = db.prepare(`INSERT INTO lab_params (service_id,name,unit,ref_low,ref_high,ref_text,seq,result_type,active) VALUES (?,?,?,?,?,?,?,'numeric',1)`);
      for (const [code, name, section, sample, price, tat, description, params] of NEW_TESTS) {
        if (exists.get(code)) continue;
        const sid = Number(addSvc.run(code, name, lab.id, price, tat, sample, section, description).lastInsertRowid);
        params.forEach(([pn, unit, low = null, high = null, text = null], i) =>
          addParam.run(sid, pn, unit, low, high, text ?? (low != null && high != null ? `${low} - ${high} ${unit}` : null), i + 1));
      }
    }
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('lab_catalog_2026_10','1')").run();
  }
  // interpretation text fills blanks only; edited or deliberately cleared ('') text is kept
  const fill = db.prepare("UPDATE services SET report_comment=?, report_comment_title=coalesce(report_comment_title,?) WHERE code=? AND category='lab' AND report_comment IS NULL");
  for (const [code, [title, text]] of Object.entries(REPORT_COMMENTS)) fill.run(text, title, code);
}
