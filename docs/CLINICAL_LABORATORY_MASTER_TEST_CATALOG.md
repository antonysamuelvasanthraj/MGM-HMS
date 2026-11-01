# Hospital Clinical Laboratory — Master Test & Diagnostic Specification Catalog
**Archived Reference Document — MGM Hospital Information Management System**  
*Source: Clinical Laboratory Master Specification Database | Exported: 01/11/2026 | Scope: Complete Preservation (Read-Only)*

---

## 1. Executive Summary & Architecture Overview
This document contains the complete structural and clinical data extracted directly from Laboratory Information System across all 5 primary diagnostic domains:
1. **Test Database (253 Tests):** Complete analytical methodologies, instruments, units, adult & pediatric reference ranges, and clinical interpretations.
2. **Test Panels (24 Panels):** Exact sequencing of tests, reporting rules (hiding individual test interpretations, displaying methodologies), and category grouping.
3. **Test Packages (20 Bundles):** Comprehensive preventive checkup packages, gender eligibility, fee structures, and composite tests/panels.
4. **Test Categories (10 Core Departments):** Haematology, Biochemistry, Serology & Immunology, Clinical Pathology, Cytology, Microbiology, Endocrinology, Histopathology, Others, Miscellaneous.
5. **Clinical Interpretations Library (116 Test + 13 Panel Interpretations):** Pathological guidance, diagnostic tables, differential diagnoses, physiological bases, and clinical commentary.
6. **Specimen Preservation & Tube Color Matrix:** Pre-analytical tube protocols (EDTA, Serum, Fluoride, Citrate, Heparin, Sterile containers).
7. **Report Layout, Calibration & Printing Rules:** A4 physical geometry (21.0 × 29.7 cm), scaled image layout (1000 × 1414 px), dynamic margins, pathologist digital signature blocks, and QR code verification.

---

## 2. Specimen Collection & Preservation Protocol

| Department | Tube / Container | Cap Color | Additive / Preservation | Primary Tests |
| :--- | :--- | :--- | :--- | :--- |
| **Haematology** | Vacutainer K2/K3 EDTA | Lavender / Purple | Dipotassium EDTA (Anticoagulant) | CBC, Hb, TLC, DLC, ESR, Platelets, Blood Group, Reticulocyte |
| **Biochemistry** | Plain / SST (Gel Separator) | Red / Yellow Gold | Clot Activator / Polymer Gel | LFT, KFT/RFT, Lipid Profile, Electrolytes, Calcium, Uric Acid |
| **Biochemistry (Glycaemia)** | Sodium Fluoride Vacutainer | Grey | NaF + Potassium Oxalate (Inhibits glycolysis) | Fasting Blood Sugar (FBS), Postprandial (PPBS), RBS, OGTT |
| **Coagulation** | Sodium Citrate 3.2% | Light Blue | Buffered Sodium Citrate (1:9 ratio) | PT/INR, APTT, D-Dimer, Fibrinogen |
| **Special Immuno / Endocrinology** | Plain / SST Serum | Red / Gold | Clot Activator | Thyroid (T3, T4, TSH), Hormones (FSH, LH, Prolactin), Ferritin, Vitamin D/B12 |
| **Clinical Pathology (Urinalysis)** | Sterile Urine Cup | Yellow / White Cap | Untreated sterile plastic container | Urine Routine & Microscopy, Urine Protein, 24hr Urine Chemistry |
| **Microbiology (Culture & Sensitivity)**| Sterile Container / Amies Swab | Sterile Wrapped | Sterile Amies / Stuart transport medium | Pus culture, Throat swab, Sputum AFB, Blood culture bottles |

---

## 3. Report Printing, Letterhead & Calibration Standards
- **Standard Sheet Size:** A4 paper (21.0 cm × 29.7 cm).
- **Header & Footer Height Calibration:** Measured in centimeters using physical rule on printed letterhead.
  - Header Top Margin: `setting[lab_report_paper_margin_top]` (cm).
  - Footer Bottom Margin: `setting[lab_report_paper_margin_bottom]` (cm).
  - Side Margins: Left `setting[letterhead_margin_left]` (cm), Right `setting[letterhead_margin_right]` (cm).
- **Letterhead Graphic Specifications:** Resized to 1000px × 1414px (max 400 KB JPG/PNG).
- **Digital Signatures:** Pathologist and Biochemist authorized digital signatures rendered in footer alongside designation, MCI/SMC registration numbers.
- **Dynamic Online Verification:** Unique SHA-256 / URL QR code generated per finalized patient report for mobile camera verification.

---

## 4. Test Categories
| Order | Category Name | Department Focus |
| :---: | :--- | :--- |
| 1 | **Haematology** | Diagnostic Division |
| 2 | **Biochemistry** | Diagnostic Division |
| 3 | **Serology &amp; Immunology** | Diagnostic Division |
| 4 | **Clinical Pathology** | Diagnostic Division |
| 5 | **Cytology** | Diagnostic Division |
| 6 | **Microbiology** | Diagnostic Division |
| 7 | **Endocrinology** | Diagnostic Division |
| 8 | **Histopathology** | Diagnostic Division |
| 9 | **Others** | Diagnostic Division |
| 10 | **Miscellaneous** | Diagnostic Division |

---

## 5. Test Panels & Reporting Sequencing
### Panel #1: CBC (with absolute counts)
- **Category:** Haematology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Antenatal Package, Cardiac package, CBC (with absolute counts), Dialysis package, Fitness Package, Full body checkup (Female), Full body checkup (Male), Preoperative, Thyroid package
- **Sequenced Test Order:**
  1. CBC (with absolute counts)
  2. Antenatal Package
  3. Cardiac package
  4. Dialysis package
  5. Fitness Package
  6. Full body checkup (Female)
  7. Full body checkup (Male)
  8. Preoperative
  9. Thyroid package

### Panel #2: CBC with ESR
- **Category:** Haematology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Anemia package, Arthritis Package, CBC with ESR , Fever package
- **Sequenced Test Order:**
  1. CBC with ESR
  2. Anemia package
  3. Arthritis Package
  4. Fever package

### Panel #3: Complete Blood Count (CBC)
- **Category:** Haematology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** CBC with GBP, Complete Blood Count (CBC)
- **Sequenced Test Order:**
  1. Complete Blood Count (CBC)
  2. CBC with GBP

### Panel #4: BT &amp; CT
- **Category:** Haematology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** BT &amp; CT
- **Sequenced Test Order:**
  1. BT &amp; CT

### Panel #5: Coagulation Profile
- **Category:** Haematology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Coagulation Profile
- **Sequenced Test Order:**
  1. Coagulation Profile

### Panel #6: Blood Sugar Fasting &amp; PP
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Blood Sugar Fasting &amp; PP, Diabetic package
- **Sequenced Test Order:**
  1. Blood Sugar Fasting &amp; PP
  2. Diabetic package

### Panel #7: Liver Function Test (LFT)
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Fitness Package, Full body checkup (Female), Full body checkup (Male), Liver Function Test (LFT)
- **Sequenced Test Order:**
  1. Liver Function Test (LFT)
  2. Fitness Package
  3. Full body checkup (Female)
  4. Full body checkup (Male)

### Panel #8: Bilirubin Total, Direct &amp; Indirect
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Bilirubin Total, Direct &amp; Indirect
- **Sequenced Test Order:**
  1. Bilirubin Total, Direct &amp; Indirect

### Panel #9: Kidney Function Test (KFT)
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Fitness Package, Full body checkup (Female), Full body checkup (Male), Kidney Function Test (KFT)
- **Sequenced Test Order:**
  1. Kidney Function Test (KFT)
  2. Fitness Package
  3. Full body checkup (Female)
  4. Full body checkup (Male)

### Panel #10: KFT without eGFR
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** KFT without eGFR
- **Sequenced Test Order:**
  1. KFT without eGFR

### Panel #11: Lipid Profile
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Cardiac package, Diabetic package, Fitness Package, Full body checkup (Female), Full body checkup (Male), Lipid Profile
- **Sequenced Test Order:**
  1. Lipid Profile
  2. Cardiac package
  3. Diabetic package
  4. Fitness Package
  5. Full body checkup (Female)
  6. Full body checkup (Male)

### Panel #12: Electrolytes Panel
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Electrolytes Panel
- **Sequenced Test Order:**
  1. Electrolytes Panel

### Panel #13: Arthritis Profile
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Arthritis Profile
- **Sequenced Test Order:**
  1. Arthritis Profile

### Panel #14: Protein Fraction
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Protein Fraction
- **Sequenced Test Order:**
  1. Protein Fraction

### Panel #15: Torch Profile
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Bad Obstetric History (BOH) Package, Torch Profile
- **Sequenced Test Order:**
  1. Torch Profile
  2. Bad Obstetric History (BOH) Package

### Panel #16: Iron Studies
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Fitness Package, Iron Studies
- **Sequenced Test Order:**
  1. Iron Studies
  2. Fitness Package

### Panel #17: AMH Panel
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** AMH Panel
- **Sequenced Test Order:**
  1. AMH Panel

### Panel #18: Viral Marker
- **Category:** Serology &amp; Immunology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Antenatal Package, Viral Marker
- **Sequenced Test Order:**
  1. Viral Marker
  2. Antenatal Package

### Panel #19: Thyroid Function Test (TFT)
- **Category:** Endocrinology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Fitness Package, Full body checkup (Female), Full body checkup (Male), Thyroid Function Test (TFT), Thyroid package
- **Sequenced Test Order:**
  1. Thyroid Function Test (TFT)
  2. Fitness Package
  3. Full body checkup (Female)
  4. Full body checkup (Male)
  5. Thyroid package

### Panel #20: Free Thyroid Function Test (FTFT)
- **Category:** Endocrinology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Free Thyroid Function Test (FTFT)
- **Sequenced Test Order:**
  1. Free Thyroid Function Test (FTFT)

### Panel #21: Pcod
- **Category:** Endocrinology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Pcod
- **Sequenced Test Order:**
  1. Pcod

### Panel #22: Urine Protein/Creatinine Ratio (UPCR)
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Urine Protein/Creatinine Ratio (UPCR)
- **Sequenced Test Order:**
  1. Urine Protein/Creatinine Ratio (UPCR)

### Panel #23: Estimated Glomerular Filtration Rate (eGFR)
- **Category:** Biochemistry
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** Estimated Glomerular Filtration Rate (eGFR)
- **Sequenced Test Order:**
  1. Estimated Glomerular Filtration Rate (eGFR)

### Panel #24: CBC with Morphology
- **Category:** Haematology
- **Reporting Method:** Individual test interpretations hidden, Test methodology & instrument shown
- **Associated Ratelists:** CBC with Morphology
- **Sequenced Test Order:**
  1. CBC with Morphology


---

## 6. Test Packages (Bundled Profiles)
| S.No | Package Name | Fee (INR) | Gender | Included Panels | Included Individual Tests |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | **Anemia package** | ₹100 | Both | None |  |
| 2 | **Antenatal Package** | ₹100 | Both | None |  |
| 3 | **Arthritis Package** | ₹100 | Both | None |  |
| 4 | **Bad Obstetric History (BOH) Package** | ₹100 | Both | None |  |
| 5 | **CBC with GBP** | ₹100 | Both | None |  |
| 6 | **Cardiac package** | ₹100 | Both | None |  |
| 7 | **Diabetic package** | ₹100 | Both | None |  |
| 8 | **Dialysis package** | ₹100 | Both | None |  |
| 9 | **Fever package** | ₹100 | Both | None |  |
| 10 | **Fitness Package** | ₹100 | Both | None |  |
| 11 | **Full body checkup (Female)** | ₹100 | Both | None |  |
| 12 | **Full body checkup (Male)** | ₹100 | Both | None |  |
| 13 | **HB, TLC, DLC** | ₹100 | Both | None |  |
| 14 | **HB, TLC, DLC, ESR** | ₹100 | Both | None |  |
| 15 | **Pregnancy Profile** | ₹100 | Both | None |  |
| 16 | **Preoperative** | ₹100 | Both | None |  |
| 17 | **Serum Electrolyte** | ₹100 | Both | None |  |
| 18 | **Serum Sodium &amp; Potassium** | ₹100 | Both | None |  |
| 19 | **TLC DLC ESR** | ₹100 | Both | None |  |
| 20 | **Thyroid package** | ₹100 | Both | None |  |

---

## 7. Complete Test Database (All 253 Tests)

### Test #1: Hemoglobin (Hb)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210470`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Hemoglobin | - | Any (Min: 0d, Max: Adultd) | **17 - 23** | - to - |
| Hemoglobin | - | Any (Min: 0d, Max: Adultd) | **11.2 - 16.5** | - to - |
| Hemoglobin | - | Male (Min: 0d, Max: Adultd) | **13 - 17** | - to - |
| Hemoglobin | - | Female (Min: 0d, Max: Adultd) | **12 - 15** | - to - |

**Clinical Interpretation & Significance:**
> Hemoglobin is the major protein of erythrocytes that transports oxygen from the lungs to peripheral tissues. It is measured by spectrophotometry on automated instruments after lysis of red cells and conversion of all hemoglobin to cyanmethemoglobin. Increased in: Decreased in: 1. Hemoconcentration (as in dehydration, Burns, vomiting) 2. Polycythemia (erythrocytosis) 3. Extreme physical exercise. 1. Macrocytic anemia (liver disease, hypothyroidism, vitamin B 12 deficiency, folate deficiency, myelodysplasia) 2. Normocytic anemia (early iron deficiency, anemia of chronic disease, hemolytic anemia, acute hemorrhage, bone marrow infiltration), 3. Microcytic anemia (iron deficiency, thalassemia) Hemodilution Comments : The cyanmethemoglobin technique is the method of choice selected by the Inter...

- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>Hb (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC, ESR (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100)

---

### Test #2: Total Leukocyte Count (TLC)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210471`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total Leukocyte Count | - | Any (Min: 0d, Max: Adultd) | **9,000 - 30,000** | - to - |
| Total Leukocyte Count | - | Any (Min: 0d, Max: Adultd) | **5,000 - 21,000** | - to - |
| Total Leukocyte Count | - | Any (Min: 0d, Max: Adultd) | **5,000 - 19,000** | - to - |
| Total Leukocyte Count | - | Any (Min: 0d, Max: Adultd) | **4,800 - 10,800** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis The WBC count and differential determine the total number of white blood cells as well as the percentage and absolute number of each type of white cell in a blood sample. It is typically generated by an automated laboratory hematology analyzer as part of the CBC panel. Interpretation Increased in: Acute infections, inflammatory disorders, acute and chronic leukemias, myeloproliferative disorders, solid tumor (paraneoplastic reaction), circulating lymphoma, tissue injury/necrosis, G-CSF stimulation, various drugs, corticosteroids, allergies, hypersensitivity reactions, stress, smoking. Decreased in: Infections, constitutional and acquired myeloid hypoplasia, myelosuppression (eg, chemotherapy, radiation, various drugs), myelodysplasia, collagen vascular diseases, hypersp...

- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>TLC (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC, ESR (₹class='px-4 py-2'>100), class='px-4 py-2'>TLC DLC ESR (₹class='px-4 py-2'>100)

---

### Test #3: Differential Leucocyte Count (DLC)
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210472`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Neutrophils | - | Any (Min: 0d, Max: Adultd) | **40 - 80** | - to - |
| Lymphocyte | - | Any (Min: 0d, Max: Adultd) | **20 - 40** | - to - |
| Eosinophils | - | Any (Min: 0d, Max: Adultd) | **1 - 6** | - to - |
| Monocytes | - | Any (Min: 0d, Max: Adultd) | **2 - 10** | - to - |
| Basophils | - | Any (Min: 0d, Max: Adultd) | **&lt; 2** | - to - |

**Clinical Interpretation & Significance:**
> CELLS INCREASED IN DECREASED IN Neutrophils Infection (bacterial or early viral), acute stress, acute and chronic inflammation, tumors, drugs (eg, G-CSF), diabetic ketoacidosis, leukemia (rare). Aplastic anemia, drug-induced neutropenia, chemotherapy, folate or B12 deficiency, myelodysplasia, marrow infiltration, cyclic neutropenia, autoimmune or isoimmune neutropenia, Felty syndrome, hypersplenism, sepsis, viral marrow suppression, bone marrow failure syndromes. Lymphocytes Viral infection (especially infectious mononucleosis, pertussis), thyrotoxicosis, adrenal insufficiency, lymphoid leukemia/lymphoma, chronic infection, drug and allergic reactions, autoimmune diseases Immune deficiency syndromes (eg, HIV), idiopathic drugs. Monocytes Inflammation, infection, malignancy, tuberculosis, m...

- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with Morphology, class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>DLC (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC, ESR (₹class='px-4 py-2'>100), class='px-4 py-2'>TLC DLC ESR (₹class='px-4 py-2'>100)

---

### Test #4: Differential Leukocyte Count (Absolute count) 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210473`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Neutrophils | - | Any (Min: 0d, Max: Adultd) | **2 - 7** | - to - |
| Lymphocytes | - | Any (Min: 0d, Max: Adultd) | **1 - 3** | - to - |
| Eosinophils | - | Any (Min: 0d, Max: Adultd) | **0.02 - 0.5** | - to - |
| Monocytes | - | Any (Min: 0d, Max: Adultd) | **0.1 - 1** | - to - |
| Basophils | - | Any (Min: 0d, Max: Adultd) | **0.02 - 0.1** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with Morphology

---

### Test #5: Erythrocyte sedimentation rate (Westergren) (ESR (Westergren))
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210474`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Erythrocyte sedimentation rate (Westergren) | - | Any (Min: 0d, Max: Adultd) | **0 - 10** | - to - |

**Clinical Interpretation & Significance:**
> Raised ESR can be found in Low ESR is found in: 1. Connective tissue disorders 2. Infections e.g., TB, acute hepatitis, bacterial 3. Hematological disease e.g., multiple myeloma, anemia of acute or chronic disease, alone or combined with iron deficiency anemia 4. Malignancy e.g., lymphoma, breast or colon cancer 5. Pregnancy 6. Oral contraceptive pill users 7. Obesity can cause a moderately raised ESR 1. Heart failure 2. Cachexia 3. PRV or secondary Conditions featuring abnormal blood cells e.g., sickle cell anemia, hereditary spherocytosis, acanthocytosis 4. Microcytosis 5. Hypofibrinogenemia e.g. DIC, 6. Massive hepatic necrosis 7. High white cell count 8. Treatment with steroids NB: Very high (&gt;100) ESR is found in autoimmune disease, malignancy, acute post-trauma, and serious infect...

- **Available in Ratelist As:** class='px-4 py-2'>ESR (Westergren) (₹class='px-4 py-2'>100)

---

### Test #6: Erythrocyte Sedimentation Rate (Wintrobe) (ESR (Wintrobe))
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210475`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Erythrocyte Sedimentation Rate (Wintrobe) | - | Female (Min: 0d, Max: Adultd) | **0 - 20** | - to - |
| Erythrocyte Sedimentation Rate (Wintrobe) | - | Male (Min: 0d, Max: Adultd) | **0 - 9** | - to - |

**Clinical Interpretation & Significance:**
> Raised ESR can be found in Low ESR is found in: 1. Connective tissue disorders 2. Infections e.g., TB, acute hepatitis, bacterial 3. Hematological disease e.g., multiple myeloma, anemia of acute or chronic disease, alone or combined with iron deficiency anemia 4. Malignancy e.g., lymphoma, breast or colon cancer 5. Pregnancy 6. Oral contraceptive pill users 7. Obesity can cause a moderately raised ESR 1. Heart failure 2. Cachexia 3. PRV or secondary Conditions featuring abnormal blood cells e.g., sickle cell anemia, hereditary spherocytosis, acanthocytosis 4. Microcytosis 5. Hypofibrinogenemia e.g. DIC, 6. Massive hepatic necrosis 7. High white cell count 8. Treatment with steroids NB: Very high (&gt;100) ESR is found in autoimmune disease, malignancy, acute post-trauma, and serious infect...

- **Utilized in Panels:** class='px-4 py-2'> CBC with ESR
- **Available in Ratelist As:** class='px-4 py-2'>ESR (Wintrobe) (₹class='px-4 py-2'>100), class='px-4 py-2'>HB, TLC, DLC, ESR (₹class='px-4 py-2'>100), class='px-4 py-2'>TLC DLC ESR (₹class='px-4 py-2'>100)

---

### Test #7: Platelet Count 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210479`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Platelet Count | - | Any (Min: 0d, Max: Adultd) | **1.5 - 4.1** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Platelets are released from megakaryocytes in bone marrow and are important for normal hemostasis. An estimated platelet count may be obtained from blood smear by multiplying the number of platelets per 100 &times; oil immersion field by 10,000. Increased in: Decreased in: Myeloproliferative disorders (polycythemia vera, chronic myeloid leukemia, essential thrombocythemia, myelofibrosis), some myelodysplastic disorders, acute blood loss, postsplenectomy, pre-eclampsia, reactive thrombocytosis secondary to inflammatory disorders, infection, tissue injury, iron deficiency, malignancies. Bone marrow suppression or replacement/infiltration, myelodysplasia, chemotherapy, drugs, alcohol, infection (eg, HIV), congenital marrow failure (eg, Fanconi anemia), Increased destructio...

- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>Platelet Count (₹class='px-4 py-2'>100)

---

### Test #8: Absolute Eosinophil Count (AEC)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210480`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Absolute Eosinophil Count | - | Any (Min: 0d, Max: Adultd) | **0 - 440** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis The Absolute Eosinophil Count (AEC) is a measure of the number of eosinophils, a type of white blood cell, in a given volume of blood. The Absolute Eosinophil Count (AEC) is calculated by multiplying the percentage of eosinophils in the total white blood cell count by the total white blood cell count. Interpretation Elevated AEC Low AEC Allergic Reactions Parasitic Infections Autoimmune Diseases Eosinophilia Acute Infections Adrenal Insufficiency Comments The AEC is typically assessed as part of a complete blood count (CBC) with a differential. If your AEC is outside the normal range, it's important to consult with a healthcare provider to determine the underlying cause and appropriate treatment.

- **Available in Ratelist As:** class='px-4 py-2'>AEC (₹class='px-4 py-2'>100)

---

### Test #9: Blood Group &amp; Rh. 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210481`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| ABO | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Rh (ANTI -D) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis The ABO antigen and antibodies remain the most significant for transfusion practice. The 4 blood groups A, B, O, and AB are determined by the presence of antigens A and B or their absence (O) on a patient&rsquo;s red blood cells. Individuals possess antibodies directed toward the A or B antigen absent from their own red cells. Interpretation Type O patients can receive type O red cells and type A, B, O, or AB plasma. Type A patients can receive type A or O red cells and type A or AB plasma. Type B patients can receive type B or O red cells and type B or AB plasma. Type AB patients can receive type AB, A, B, or O red cells but only type AB plasma.In an emergency situation, type O red cells and type AB plasma may be given to patients with any ABO blood types. Comments For b...

- **Available in Ratelist As:** class='px-4 py-2'>Blood Group &amp; Rh. (₹class='px-4 py-2'>100), class='px-4 py-2'>Antenatal Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #10: Bleeding Time (BT)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210482`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Bleeding Time | - | Any (Min: 0d, Max: Adultd) | **2 - 7** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Coagulation Profile, class='px-4 py-2'> BT &amp; CT
- **Available in Ratelist As:** class='px-4 py-2'>BT (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #11: Clotting Time (CT)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210483`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Clotting Time | - | Any (Min: 0d, Max: Adultd) | **4 - 9** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Coagulation Profile, class='px-4 py-2'> BT &amp; CT
- **Available in Ratelist As:** class='px-4 py-2'>CT (₹class='px-4 py-2'>100)

---

### Test #12: Peripheral Blood Smear (PBS / GBP)
- **Category:** Haematology | **Type:** Document | **ID:** `7210484`
- **Available in Ratelist As:** class='px-4 py-2'>PBS / GBP (₹class='px-4 py-2'>100), class='px-4 py-2'>CBC with GBP (₹class='px-4 py-2'>100)

---

### Test #13: Malaria Parasite (Card Test) (MP (Card Test))
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210485`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Plasmodium falciparum &quot;Pf&quot; | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Plasmodium vivax &quot;Pv&quot; | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Malaria antigen detection-whole blood Four species of the plasmodium parasites are responsible for human malaria infections: P. falciparum, P. vivax, P. ovale and P. malariae. Early detection and differentiation of malaria is of paramount importance due to incidence of cerebral malaria and drug resistance associated with P. falciparum malaria causing most of the morbidity and mortality worldwide. Test Utility The current test is a qualitative test for detection of the P. falciparum specific histidine rich protein-2 (Pf. HRP-2) and P. vivax specific lactate dehydrogenase (pLDH) in whole blood samples. The assay is able to detect and distinguish P. vivax and P. falciparum infections and also identify mixed infections. Notes &amp; Limitations The test detects P. falciparum specific HRP-2 and ...

- **Available in Ratelist As:** class='px-4 py-2'>MP (Card Test) (₹class='px-4 py-2'>100)

---

### Test #14: Malaria Parasite (Microscopic) (MP (Microscopic))
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210486`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Malaria Parasite (Microscopic) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>MP (Microscopic) (₹class='px-4 py-2'>100)

---

### Test #15: Filarial Parasite (Card Test) (MF)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210487`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Filarial Parasite (Card Test) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Result Remarks Detected Indicates the presence of circulating Wuchereria bancrofti antigen. Not Detected Indicates absence of circulating Wuchereria bancrofti antigen Note: - Positive results are seen in parasitic disease of the human lymph system caused by Wuchereria bancrofti (W. bancrofti) leading to conditions like lymphedema, hydrocele and disfiguring disease of elephantiasis. - Results should be correlated with clinical conditions and tests like thick smear microscopy and membrane filtration test. - False positive results may be due to cross-reactivity with Loa loa spp or other nematode infection. - False negative reactions may be due to the processing of samples collected early in the course of disease or low threshold of antigen. The test should be repeated on a new specimen obtain...

- **Available in Ratelist As:** class='px-4 py-2'>MF (₹class='px-4 py-2'>100)

---

### Test #16: Total RBC Count 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210488`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total RBC Count | - | Male (Min: 0d, Max: Adultd) | **4.5 - 5.5** | - to - |
| Total RBC Count | - | Female (Min: 0d, Max: Adultd) | **3.9 - 4.8** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>Total RBC Count (₹class='px-4 py-2'>100)

---

### Test #17: Hematocrit Value, Hct (Hct)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210489`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Hematocrit Value, Hct | - | Male (Min: 0d, Max: Adultd) | **40 - 50** | - to - |
| Hematocrit Value, Hct | - | Female (Min: 0d, Max: Adultd) | **36 - 46** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>Hct (₹class='px-4 py-2'>100)

---

### Test #18: Mean Corpuscular Volume, MCV (MCV)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210490`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Mean Corpuscular Volume, MCV | - | Any (Min: 0d, Max: Adultd) | **83 - 101** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>MCV (₹class='px-4 py-2'>100)

---

### Test #19: Mean Cell Haemoglobin, MCH (MCH)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210491`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Mean Cell Haemoglobin, MCH | - | Any (Min: 0d, Max: Adultd) | **27 - 32** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>MCH (₹class='px-4 py-2'>100)

---

### Test #20: Mean Cell Haemoglobin CON, MCHC (MCHC)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210476`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Mean Cell Haemoglobin CON, MCHC | - | Any (Min: 0d, Max: Adultd) | **31.5 - 34.5** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>MCHC (₹class='px-4 py-2'>100)

---

### Test #21: Mean Platelet Volume, MPV (MPV)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210477`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Mean Platelet Volume, MPV | - | Any (Min: 0d, Max: Adultd) | **6.5 - 12** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)
- **Available in Ratelist As:** class='px-4 py-2'>MPV (₹class='px-4 py-2'>100)

---

### Test #22: Reticulocyte Count 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210492`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Reticulocyte Count | - | Any (Min: 0d, Max: Adultd) | **2 - 6** | - to - |
| Reticulocyte Count | - | Any (Min: 0d, Max: Adultd) | **0.5 - 2.5** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis: Reticulocytes are young red blood cells that contain cytoplasmic RNA. A reticulocyte count measures how rapidly reticulocytes are produced by the bone marrow and then released into the bloodstream. Reticulocyte count reflects the erythropoietic activity of the bone marrow and is thus useful in both the diagnosis of anemias and in monitoring bone marrow response to therapy. Interpretation Increased in : Hemolytic anemia, blood loss (before development of iron deficiency), recovery from iron, B12 or folate deficiency, or from drug-induced anemia. Decreased in : Iron deficiency anemia, aplastic anemia, anemia of chronic disease, megaloblastic anemia, sideroblastic anemia, pure red cell aplasia, renal disease, bone marrow suppression or infiltration, myelodysplastic syndrome...

- **Available in Ratelist As:** class='px-4 py-2'>Reticulocyte Count (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100)

---

### Test #23: Glucose-6-phosphate dehydrogenase (G6PD)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210493`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Glucose-6-phosphate dehydrogenase | - | Any (Min: 0d, Max: Adultd) | **5.5 - 20.5** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis G6PD is an enzyme in the hexose monophosphate shunt that is essential in generating reduced glutathione and NADPH, which protect hemoglobin from oxidative denaturation. Inherited G6PD deficiency causes neonatal hyperbilirubinemia and chronic hemolytic anemia and exposure to oxidative stressors such as certain drugs or infection, can elicit significant acute hemolysis. Interpretation Increased in: Young erythrocytes (reticulocytosis) Decreased in: G6PD deficiency Causes of hemolysis in glucose-6- phosphate dehydrogenase deficiency 1. Bacterial and viral infections 2. Drugs: &bull; Antimalarials: Primaquine, pamaquine &bull; Antibacterials: Sulfonamides, nalidixic acid, nitrofurantoin, dapsone &bull; Antipyretics and analgesics 3. Chemicals: Naphthalene balls Comments In de...

- **Available in Ratelist As:** class='px-4 py-2'>G6PD (₹class='px-4 py-2'>100)

---

### Test #24: Prothrombin time, PT/INR (PT/INR)
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210494`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Patient Value | - | Any (Min: 0d, Max: Adultd) | **10 - 16** | - to - |
| Control Value | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| ISI (International sensitivity index) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| INR Value | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis PT evaluates the extrinsic and common coagulation pathways.The time required for fibrin clot formation is determined. It is most sensitive to deficiencies in the vitamin K-dependent clotting factors II, VII, and X. It is also sensitive to deficiency of factor V. It is less sensitive to fibrinogen deficiency and heparin. PT/INR tests are increasingly being used for monitoring warfarin therapy. Interpretation Increased in : Warfarin, liver disease, DIC, vitamin K deficiency, hereditary deficiency in factors VII, X, V and II, fibrinogen abnormality (eg, hypofibrinogenemia, afibrinogenemia, dysfibrinogenemia), circulating anticoagulant affecting the PT system (rarely lupus anticoagulant), massive transfusion. Decreased in : Recombinant factor F VII treatment Comments Warfarin...

- **Utilized in Panels:** class='px-4 py-2'> Coagulation Profile
- **Available in Ratelist As:** class='px-4 py-2'>PT/INR (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #25: Activated partial thromboplastin time, APTT (APTT)
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210495`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Patient Value | - | Any (Min: 0d, Max: Adultd) | **22 - 39** | - to - |
| Control Value | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis APTT evaluates the intrinsic and common coagulation pathways and adequacy of all coagulation factors except XIII and VII. APTT is commonly used to monitor unfractionated heparin therapy. Interpretation Increased in: Deficiency of any individual coagulation factor except Factors XIII and VII, presence of nonspecific inhibitor (eg, lupus anticoagulant), specific factor inhibitor, von Willebrand disease (PTT may also be normal), hemophilia A and B, DIC. Drugs: heparin, direct thrombin inhibitor (eg, hirudin, argatroban), warfarin. Decreased in: Hypercoagulable states (eg, increased factor VIII levels). Comments APTT cannot be used to monitor very high doses of heparin (eg, cardiac bypass surgery) because the clotting time is beyond the analytical measurement range of APTT....

- **Utilized in Panels:** class='px-4 py-2'> Coagulation Profile
- **Available in Ratelist As:** class='px-4 py-2'>APTT (₹class='px-4 py-2'>100)

---

### Test #26: WBC Count 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210496`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **9,400 - 34,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **5,000 - 21,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **5,000 - 20,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **5,000 - 15,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **6,000 - 11,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **5,000 - 12,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **4,000 - 12,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **3,400 - 10,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **3,500 - 9,000** | - to - |
| WBC Count | - | Any (Min: 0d, Max: Adultd) | **3,500 - 10,500** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC with Morphology
- **Available in Ratelist As:** class='px-4 py-2'>WBC Count (₹class='px-4 py-2'>100)

---

### Test #27: P-LCR 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210497`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| P-LCR | - | Any (Min: 0d, Max: Adultd) | **19.7 - 42.4** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)

---

### Test #28: R.D.W. - CV 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210498`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| R.D.W. - CV | - | Any (Min: 0d, Max: Adultd) | **11.6 - 14** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)

---

### Test #29: P.D.W. 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210499`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| P.D.W. | - | Any (Min: 0d, Max: Adultd) | **9.6 - 15.2** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)

---

### Test #30: R.D.W. - SD 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210500`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| R.D.W. - SD | - | Any (Min: 0d, Max: Adultd) | **39 - 46** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts), class='px-4 py-2'> CBC with ESR, class='px-4 py-2'> Complete Blood Count (CBC)

---

### Test #31: Neutrophil Lymphocyte Ratio (NLR)
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210501`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Neutrophil Lymphocyte Ratio | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> The Neutrophil to Lymphocyte Ratio (NLR ) is a clinical metric calculated from a Complete Blood Count (CBC) that compares the number of neutrophils to the number of lymphocytes in the blood. It can provide valuable insights into a person&rsquo;s immune status and inflammation levels. Clinical Significance of NLR: Elevated NLR: An increased ratio can be a marker of systemic inflammation or stress and is associated with various conditions such as: - Chronic Inflammatory Diseases: Like rheumatoid arthritis or inflammatory bowel disease. - Infections: Particularly bacterial infections. - Certain Cancers: Elevated NLR is often seen in cancers such as colorectal cancer and lung cancer. - Acute Stress Responses: Including severe illness or trauma. Low NLR: A lower ratio is generally less concerni...

- **Utilized in Panels:** class='px-4 py-2'> CBC (with absolute counts)

---

### Test #32: Lupus Anticoagulant (DRVVT) 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210502`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Patient Value | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Control Value | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Screen Ratio | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| DRVVT Screening | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation Follow ISTH guidelines by using at least two different clot-based assays, such as PTT-LA and dRVVT. Always consider test results along with the patient&rsquo;s medical history, clinical presentation, and other findings. A positive lupus anticoagulant (LA) test can occur in healthy individuals or with certain infections. Follow-Up: Repeat LA testing more than 12 weeks after the initial positive result. Anticoagulant Effects: Anticoagulants like Warfarin, Heparin, and direct thrombin or factor Xa inhibitors can cause false positives. Repeat testing after stopping anticoagulants for over a week is recommended. Heparin Interference: DRVVT results can be affected by heparin, despite the presence of a heparin inhibitor. Interpret DRVVT results from heparinized plasma with caution....

- **Available in Ratelist As:** class='px-4 py-2'>Lupus Anticoagulant (DRVVT) (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #33: Troponin T 
- **Category:** Haematology | **Type:** Single parameter | **ID:** `7210708`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Troponin T | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Troponin T (₹class='px-4 py-2'>100)

---

### Test #34: HEMOGLOBIN HPLC/ELECTROPHORESIS (HPLC)
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210667`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Hb F | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Peak 2 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Hb Adult | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Hb A2 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Hemoglobin | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| RBC Count | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Packed Cell Volume (PCV) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| MCV | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| MCH | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| RDW | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>HPLC (₹class='px-4 py-2'>100)

---

### Test #35: Leukemia DLC 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210537`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Metamyelocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Myelocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Promyelocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Blast Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| BAND Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Leukemia DLC (₹class='px-4 py-2'>100)

---

### Test #36: RBC Indices 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210576`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Hemoglobin | - | Any (Min: 0d, Max: Adultd) | **17 - 21** | - to - |
| Hemoglobin | - | Male (Min: 0d, Max: Adultd) | **13 - 17** | - to - |
| Hemoglobin | - | Female (Min: 0d, Max: Adultd) | **12 - 15** | - to - |
| RBC | - | Any (Min: 0d, Max: Adultd) | **3.5 - 5.5** | - to - |
| HCT/PCV | - | Any (Min: 0d, Max: Adultd) | **37 - 47** | - to - |
| MCV | - | Any (Min: 0d, Max: Adultd) | **78 - 96** | - to - |
| MCH | - | Any (Min: 0d, Max: Adultd) | **27 - 32** | - to - |
| MCHC | - | Any (Min: 0d, Max: Adultd) | **30 - 36** | - to - |
| RDW-CV | - | Any (Min: 0d, Max: Adultd) | **11 - 15** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC with Morphology
- **Available in Ratelist As:** class='px-4 py-2'>RBC Indices (₹class='px-4 py-2'>100)

---

### Test #37: Platelet Indices 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210603`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Platelet Count | - | Any (Min: 0d, Max: Adultd) | **1.5 - 4.5** | - to - |
| MPV | - | Any (Min: 0d, Max: Adultd) | **6 - 9.5** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC with Morphology
- **Available in Ratelist As:** class='px-4 py-2'>platelet Indices (₹class='px-4 py-2'>100)

---

### Test #38: Morphology 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210611`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| RBC Morphology | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| WBC Morphology | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Platelet Morphology | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> CBC with Morphology
- **Available in Ratelist As:** class='px-4 py-2'>Morphology (₹class='px-4 py-2'>100)

---

### Test #39: DLC 3 Parts 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210636`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Gran # | - | Any (Min: 0d, Max: Adultd) | **2 - 7** | - to - |
| Lym # | - | Any (Min: 0d, Max: Adultd) | **1 - 3** | - to - |
| Mid # | - | Any (Min: 0d, Max: Adultd) | **0.2 - 1.2** | - to - |
| Gran % | - | Any (Min: 0d, Max: Adultd) | **40 - 75** | - to - |
| Lym % | - | Any (Min: 0d, Max: Adultd) | **20 - 40** | - to - |
| Mid % | - | Any (Min: 0d, Max: Adultd) | **2 - 10** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>DLC 3 Parts (₹class='px-4 py-2'>100)

---

### Test #40: DLC Leukemia 
- **Category:** Haematology | **Type:** Multi parameter | **ID:** `7210669`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Immature | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Promyelocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Myelocyelocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Blast Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Meta Myelocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>DLC Leukemia (₹class='px-4 py-2'>100)

---

### Test #41: Serum Phosphorus 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210503`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Phosphorus | - | Any (Min: 0d, Max: Adultd) | **4 - 7** | - to - |
| Serum Phosphorus | - | Any (Min: 0d, Max: Adultd) | **2.5 - 4.5** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis The plasma concentration of inorganic phosphate is determined by parathyroid gland function, action of vitamin D, intestinal absorption, renal function, bone metabolism, and nutrition. Serum phosphorus concentrations have a circadian rhythm (highest level in late morning, lowest in evening) and are subject to rapid change secondary to environmental factors such as diet (carbohydrate), phosphate binding antacids, and fluctuations in GH, insulin, and renal function. Interpretation Increased in Decreased in Renal failure, Massive blood transfusion, hypoparathyroidism, neoplasms, adrenal insufficiency, hypervitaminosis D, osteolytic metastases to bone, leukemia, Pseudohypoparathyroidism, Cirrhosis, lactic acidosis. Drugs: phosphate infusions or enemas, anabolic steroids, ergo...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile
- **Available in Ratelist As:** class='px-4 py-2'>Serum Phosphorus (₹class='px-4 py-2'>100)

---

### Test #42: Serum Creatinine 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210504`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Creatinine | - | Male (Min: 0d, Max: Adultd) | **0.72 - 1.18** | - to - |
| Serum Creatinine | - | Female (Min: 0d, Max: Adultd) | **0.55 - 1.02** | - to - |

**Clinical Interpretation & Significance:**
> Creatinine is a waste product produced by muscles from the breakdown of a compound called creatine. It is removed from the body by the kidneys, which filter almost all of it from the blood and release it into the urine. Creatine is part of the cycle that produces energy needed to contract muscles. Both creatine and creatinine are produced by the body at a relatively constant rate. Since almost all creatinine is filtered from the blood by the kidneys and released into the urine, blood levels are usually a good indicator of how well the kidneys are working. Higher than normal level may be due to: - Blockage in the urinary tract - Kidney problems, such as kidney damage or failure, infection, or reduced blood flow - Loss of body fluid (dehydration) - Muscle problems, such as breakdown of muscl...

- **Utilized in Panels:** class='px-4 py-2'> Estimated Glomerular Filtration Rate (eGFR), class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Creatinine (₹class='px-4 py-2'>100), class='px-4 py-2'>Diabetic package (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #43: Serum Urea 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210505`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Urea | - | Any (Min: 0d, Max: Adultd) | **11 - 36** | - to - |
| Serum Urea | - | Any (Min: 0d, Max: Adultd) | **15 - 36** | - to - |
| Serum Urea | - | Any (Min: 0d, Max: Adultd) | **18 - 45** | - to - |
| Serum Urea | - | Female (Min: 0d, Max: Adultd) | **13 - 40** | - to - |
| Serum Urea | - | Male (Min: 0d, Max: Adultd) | **19 - 45** | - to - |
| Serum Urea | - | Male (Min: 0d, Max: Adultd) | **18 - 55** | - to - |
| Serum Urea | - | Female (Min: 0d, Max: Adultd) | **21 - 43** | - to - |

**Clinical Interpretation & Significance:**
> Urea is derived in the liver from amino acids and therefore from protein, whether originating from the diet or from tissues. The normal kidney can excrete large amounts of urea. If the rate of production exceeds the rate of clearance, plasma concentrations rise. The rate of production is accelerated by: - a high-protein diet - absorption of amino acids and peptides from digested blood after hemorrhage into the gastrointestinal lumen or soft tissues - increased catabolism due to starvation, tissue damage, sepsis or steroid treatment. - increased catabolism due to starvation, tissue damage, sepsis or steroid treatment. In catabolic states, glomerular function is often impaired due to circulatory factors and this contributes more to the uraemia than does increased production. Conversely, the ...

- **Utilized in Panels:** class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Urea (₹class='px-4 py-2'>100), class='px-4 py-2'>Diabetic package (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #44: Fasting Blood Sugar 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210506`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Fasting Blood Sugar | - | Any (Min: 0d, Max: Adultd) | **40 - 60** | - to - |
| Fasting Blood Sugar | - | Any (Min: 0d, Max: Adultd) | **50 - 80** | - to - |
| Fasting Blood Sugar | - | Any (Min: 0d, Max: Adultd) | **60 - 100** | - to - |
| Fasting Blood Sugar | - | Any (Min: 0d, Max: Adultd) | **70 - 100** | - to - |

**Clinical Interpretation & Significance:**
> Clinical Notes Elevated glucose levels (hyperglycemia) are most often encountered clinically in the setting of diabetes mellitus, but they may also occur with pancreatic neoplasms, hyperthyroidism, and adrenocortical dysfunction. Decreased glucose levels (hypoglycemia) may result from endogenous or exogenous insulin excess, prolonged starvation, or liver disease. Fasting Glucose 2 hours PP Glucose Diagnosis &lt;100 &lt;140 Normal 100 to 125 140 to 199 Pre Diabetes &gt;126 &gt;200 Diabetes A level of 126 mg/dL or above, confirmed by repeating the test on another day, means a person has diabetes. IGT (2 hrs Post meal), means a person has an increased risk of developing type 2 diabetes but does not have it yet. A 2-hour glucose level of 200 mg/dL or above, confirmed by repeating the test on a...

- **Utilized in Panels:** class='px-4 py-2'> Blood Sugar Fasting &amp; PP
- **Available in Ratelist As:** class='px-4 py-2'>Fasting Blood Sugar (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #45: Blood Sugar PP 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210509`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Blood Sugar PP | - | Any (Min: 0d, Max: Adultd) | **&lt; 180 mg/dl** | - to - |

**Clinical Interpretation & Significance:**
> Clinical Notes Elevated glucose levels (hyperglycemia) are most often encountered clinically in the setting of diabetes mellitus, but they may also occur with pancreatic neoplasms, hyperthyroidism, and adrenocortical dysfunction. Decreased glucose levels (hypoglycemia) may result from endogenous or exogenous insulin excess, prolonged starvation, or liver disease. Fasting Glucose 2 hours PP Glucose Diagnosis &lt;100 &lt;140 Normal 100 to 125 140 to 199 Pre Diabetes &gt;126 &gt;200 Diabetes A level of 126 mg/dL or above, confirmed by repeating the test on another day, means a person has diabetes. IGT (2 hrs Post meal), means a person has an increased risk of developing type 2 diabetes but does not have it yet. A 2-hour glucose level of 200 mg/dL or above, confirmed by repeating the test on a...

- **Utilized in Panels:** class='px-4 py-2'> Blood Sugar Fasting &amp; PP
- **Available in Ratelist As:** class='px-4 py-2'>Blood Sugar PP (₹class='px-4 py-2'>100)

---

### Test #46: Serum Bilirubin (Total) 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210510`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Bilirubin (Total) | - | Any (Min: 0d, Max: Adultd) | **up to 12** | - to - |
| Serum Bilirubin (Total) | - | Any (Min: 0d, Max: Adultd) | **0.2 - 1.2** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Bilirubin is the orange-yellow pigment derived from the breakdown of hemoglobin (heme). The majority of bilirubin comes from senescent red cells. It is biotransformed in the liver and excreted in bile and urine. Some conjugated bilirubin is bound to serum albumin, so-called D (delta) bilirubin. Interpretation Increased in : Acute or chronic hepatitis, cirrhosis, biliary tract obstruction, toxic hepatitis, neonatal jaundice (neonatal hyperbilirubinemia), congenital liver enzyme abnormalities (Dubin-Johnson, Rotor, Gilbert, Crigler-Najjar syndromes), fasting, hemolytic disorders. Hepatotoxic drugs. Comments Assay of total bilirubin includes conjugated (direct) and unconjugated (indirect) bilirubin. Only conjugated bilirubin appears in the urine, and it is indicative of li...

- **Utilized in Panels:** class='px-4 py-2'> Bilirubin Total, Direct &amp; Indirect, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Bilirubin (Total) (₹class='px-4 py-2'>100)

---

### Test #47: Serum Bilirubin (Direct) 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210511`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Bilirubin (Direct) | - | Any (Min: 0d, Max: Adultd) | **0 - 0.3** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Bilirubin is the orange-yellow pigment derived from the breakdown of hemoglobin (heme). The majority of bilirubin comes from senescent red cells. It is biotransformed in the liver and excreted in bile and urine. Some conjugated bilirubin is bound to serum albumin, so-called D (delta) bilirubin. Interpretation Increased in : Acute or chronic hepatitis, cirrhosis, biliary tract obstruction, toxic hepatitis, neonatal jaundice (neonatal hyperbilirubinemia), congenital liver enzyme abnormalities (Dubin-Johnson, Rotor, Gilbert, Crigler-Najjar syndromes), fasting, hemolytic disorders. Hepatotoxic drugs. Comments Assay of total bilirubin includes conjugated (direct) and unconjugated (indirect) bilirubin. Only conjugated bilirubin appears in the urine, and it is indicative of li...

- **Utilized in Panels:** class='px-4 py-2'> Bilirubin Total, Direct &amp; Indirect, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Bilirubin (Direct) (₹class='px-4 py-2'>100)

---

### Test #48: Serum Bilirubin (Indirect) 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210512`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Bilirubin (Indirect) | - | Any (Min: 0d, Max: Adultd) | **0.2 - 1** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Bilirubin is the orange-yellow pigment derived from the breakdown of hemoglobin (heme). The majority of bilirubin comes from senescent red cells. It is biotransformed in the liver and excreted in bile and urine. Some conjugated bilirubin is bound to serum albumin, so-called D (delta) bilirubin. Interpretation Increased in : Acute or chronic hepatitis, cirrhosis, biliary tract obstruction, toxic hepatitis, neonatal jaundice (neonatal hyperbilirubinemia), congenital liver enzyme abnormalities (Dubin-Johnson, Rotor, Gilbert, Crigler-Najjar syndromes), fasting, hemolytic disorders. Hepatotoxic drugs. Comments Assay of total bilirubin includes conjugated (direct) and unconjugated (indirect) bilirubin. Only conjugated bilirubin appears in the urine, and it is indicative of li...

- **Utilized in Panels:** class='px-4 py-2'> Bilirubin Total, Direct &amp; Indirect, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Bilirubin (Indirect) (₹class='px-4 py-2'>100)

---

### Test #49: Serum Uric Acid (Uric Acid)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210513`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Uric Acid | - | Male (Min: 0d, Max: Adultd) | **3.5 - 7.2** | - to - |
| Serum Uric Acid | - | Female (Min: 0d, Max: Adultd) | **2.6 - 6** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Uric acid is an end product of nucleoprotein metabolism and is excreted by the kidney. An increase in serum uric acid concentration occurs with increased nucleoprotein synthesis or catabolism (blood dyscrasias, therapy of leukemia) or decreased renal uric acid excretion (eg, thiazide diuretic therapy or renal failure). Interpretation Increased in : Renal failure, gout, myeloproliferative disorders (leukemia, lymphoma, myeloma, polycythemia vera), psoriasis, glycogen storage disease (type I), Lesch-Nyhan syndrome, lead nephropathy, hypertensive diseases of pregnancy (preeclampsia and eclampsia), menopause, syndrome X (obesity, insulin resistance, hypertension, hyperuricemia, dyslipidemia). Drugs: Antime- tabolite and chemotherapeutic agents, diuretics, ethanol, nicotinic...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile, class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Uric Acid (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Diabetic package (₹class='px-4 py-2'>100)

---

### Test #50: SGPT (ALT) (SGPT)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210518`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| SGPT (ALT) | - | Male (Min: 0d, Max: Adultd) | **13 - 40** | - to - |
| SGPT (ALT) | - | Female (Min: 0d, Max: Adultd) | **10 - 28** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Intracellular enzyme involved in amino acid metabolism. Present in large concentrations in liver, kidney; in smaller amounts, in skeletal muscle and heart. Released with tissue damage, particularly liver injury. Interpretation Increased in : Acute viral hepatitis (ALT &gt; AST), biliary tract obstruction (cholangitis, choledocholithiasis), alcoholic hepatitis and cirrhosis (AST &gt; ALT), liver abscess, metastatic or primary liver cancer; nonalcoholic steatohepatitis; right heart failure, ischemia or hypoxia, injury to liver (&ldquo;shock liver&rdquo;), extensive trauma; drugs that cause cholestasis or hepatotoxicity. Decreased in : Pyridoxine (vitamin B6) deficiency. Comments ALT is the preferred enzyme for evaluation of liver injury.

- **Utilized in Panels:** class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>SGPT (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #51: SGOT (AST) (SGOT)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210519`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| SGOT (AST) | - | Female (Min: 0d, Max: Adultd) | **0 - 31** | - to - |
| SGOT (AST) | - | Male (Min: 0d, Max: Adultd) | **0 - 37** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis: Intracellular enzyme involved in amino acid metabolism. Present in large concentrations in liver, skeletal muscle, brain, red cells, and heart. Released into the bloodstream when tissue is damaged, especially in liver injury. Interpretation Increased in : Acute viral hepatitis (ALT &gt; AST), biliary tract obstruction (cholangitis, choledocholithiasis), alcoholic hepatitis and cirrhosis (AST &gt; ALT), liver abscess, metastatic or primary liver cancer; right heart failure, ischemic or hypoxic injury to liver (&ldquo;shock liver&rdquo;), extensive trauma. Drugs that cause cholestasis or hepatotoxicity. Decreased in : Pyridoxine (vitamin B6) deficiency Comments Test is not indicated for diagnosis of myocardial infarction. AST/ALT ratio &gt;1 suggests cirrhosis in patient...

- **Utilized in Panels:** class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>SGOT (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #52: Serum Protein 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210520`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Protein | - | Any (Min: 0d, Max: Adultd) | **5.1 - 7.3** | - to - |
| Serum Protein | - | Any (Min: 0d, Max: Adultd) | **5.6 - 7.5** | - to - |
| Serum Protein | - | Any (Min: 0d, Max: Adultd) | **6 - 8** | - to - |
| Serum Protein | - | Any (Min: 0d, Max: Adultd) | **6.4 - 8.3** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Plasma protein concentration is determined by nutritional state, hepatic function, renal function, hydration, and various disease states. Plasma protein concentration determines the colloidal osmotic pressure. Interpretation Increased in : Polyclonal or monoclonal gammopathies, marked dehydration. Drugs: anabolic steroids, androgens, corticosteroids, epinephrine. Decreased in : Protein-losing enteropathies, acute burns, nephrotic syndrome, severe dietary protein deficiency, chronic liver disease, malabsorption syndrome, agammaglobulinemia, cancer cachexia. Comments Serum total protein consists primarily of albumin and globulin. Serum globulin level is calculated as total protein minus albumin. Hypoproteinemia usually indicates hypoalbuminemia, because albumin is the maj...

- **Utilized in Panels:** class='px-4 py-2'> Protein Fraction, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Protein (₹class='px-4 py-2'>100)

---

### Test #53: Serum Albumin 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210521`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Albumin | - | Any (Min: 0d, Max: Adultd) | **2.8 - 4.4** | - to - |
| Serum Albumin | - | Any (Min: 0d, Max: Adultd) | **3.8 - 5.4** | - to - |
| Serum Albumin | - | Any (Min: 0d, Max: Adultd) | **3.2 - 4.5** | - to - |
| Serum Albumin | - | Any (Min: 0d, Max: Adultd) | **3.5 - 5.2** | - to - |
| Serum Albumin | - | Any (Min: 0d, Max: Adultd) | **3.5 - 4.6** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Major components of plasma proteins are influenced by nutritional state, hepatic function, renal function, and various diseases. It is a major binding protein, although there are more than 50 different genetic variants (alloalbumins), only occasionally does a mutation cause abnormal binding (eg, in familial dysalbuminemic hyperthyroxinemia). Interpretation Increased in : Dehydration, shock, hemoconcentration. Decreased in: Decreased hepatic synthesis (chronic liver disease, malnutrition, malabsorption, malignancy, congenital analbuminemia [rare]). Increased losses (nephrotic syndrome, burns, trauma, hemorrhage with fluid replacement, fistulas, enteropathy, acute or chronic glomerulonephritis). Hemodilution (pregnancy, CHF). Drugs: estrogens. Comments Serum albumin indicat...

- **Utilized in Panels:** class='px-4 py-2'> Protein Fraction, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Albumin (₹class='px-4 py-2'>100)

---

### Test #54: Serum Alkaline Phosphatase 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210522`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Alkaline Phosphatase | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis: Alkaline phosphatases are primarily found in liver, bone, intestines, kidney, and placenta. Test is used to detect liver disease and bone disorders. Interpretation: Increased in : Obstructive hepatobiliary disease, bone disease (physiologic bone growth, Paget disease, osteomalacia, osteogenic sarcoma, bone metastases), hyperparathyroidism, rickets, benign familial hyperphosphatasemia, pregnancy (third trimester), GI disease (perforated ulcer or bowel infarct), hepatotoxic drugs. Decreased in : Hypophosphatasia. Comment: Alkaline phosphatase performs well in measuring the extent of bone metastases in prostate cancer. Alkaline phosphatase isoenzyme separation by electrophoresis or differential heat inactivation is unreliable. Use &gamma;-glutamyl transpeptidase, which incr...

- **Utilized in Panels:** class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Alkaline Phosphatase (₹class='px-4 py-2'>100)

---

### Test #55: Total Cholesterol 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210523`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total Cholesterol | - | Any (Min: 0d, Max: Adultd) | **125 - 200** | - to - |

**Clinical Interpretation & Significance:**
> Desirable: &lt;200 mg/dL [&lt;5.2 mmol/L] Borderline: 200&ndash;239 mg/ dL [5.2&ndash;6.1 mmol/L] High risk: &gt;240 mg/dL [&gt;6.2 mmol/L] Physiological basis Cholesterol level is determined by lipid metabolism, which is in turn influenced by heredity, diet, and liver, kidney, thyroid, and other endocrine organ functions. Interpretation Increased in : Primary disorders: polygenic hypercholesterolemia, familial hypercholesterolemia (deficiency of LDL receptors), familial combined hyperlipidemia, familial dysbetalipoproteinemia. Secondary disorders: hypothyroidism, uncontrolled diabetes mellitus, nephrotic syndrome, biliary obstruction, anorexia nervosa, hepatocellular carcinoma, Cushing syndrome, acute intermittent porphyria. Drugs: corticosteroids. Decreased in : Severe liver disease (acu...

- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>Total Cholesterol (₹class='px-4 py-2'>100)

---

### Test #56: Triglycerides 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210524`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Triglycerides | - | Any (Min: 0d, Max: Adultd) | **25 - 200** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Dietary fat is hydrolyzed in the small intestine, absorbed and resynthesized by mucosal cells, and secreted into lacteals as chylomicrons. Triglycerides in the chylomicrons are cleared from the blood by tissue lipoprotein lipase. Endogenous triglyceride production occurs in the liver. These triglycerides are transported in association with &beta;-lipoproteins in very low-density lipoproteins (VLDL). Interpretation Increased in : Hypothyroidism, diabetes mellitus, nephrotic syndrome, chronic alcoholism (fatty liver), biliary tract obstruction, stress, familial lipoprotein lipase deficiency, familial dysbetalipoproteinemia, familial combined hyperlipidemia, obesity, metabolic syndrome, viral hepatitis, cirrhosis, pancreatitis, chronic renal failure, gout, pregnancy, glyco...

- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>Triglycerides (₹class='px-4 py-2'>100)

---

### Test #57: HDL Cholesterol (HDL Cholesterol)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210525`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HDL Cholesterol | - | Any (Min: 0d, Max: Adultd) | **35 - 80** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>HDL Cholesterol (₹class='px-4 py-2'>100)

---

### Test #58: LDL Cholesterol (LDL Cholesterol)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210526`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| LDL Cholesterol | - | Any (Min: 0d, Max: Adultd) | **85 - 130** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>LDL Cholesterol (₹class='px-4 py-2'>100)

---

### Test #59: VLDL Cholesterol (VLDL Cholesterol)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210527`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| VLDL Cholesterol | - | Any (Min: 0d, Max: Adultd) | **5 - 40** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>VLDL Cholesterol (₹class='px-4 py-2'>100)

---

### Test #60: LDL / HDL 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210528`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| LDL / HDL | - | Any (Min: 0d, Max: Adultd) | **1.5 - 3.5** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>LDL / HDL (₹class='px-4 py-2'>100)

---

### Test #61: Total Cholesterol / HDL 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210529`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total Cholesterol / HDL | - | Any (Min: 0d, Max: Adultd) | **3.5 - 5** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile

---

### Test #62: TG / HDL 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210530`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| TG / HDL | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>TG / HDL (₹class='px-4 py-2'>100)

---

### Test #63: Total Lipid 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210531`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total Lipid | - | Any (Min: 0d, Max: Adultd) | **&lt; 600 mg%** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Total Lipid (₹class='px-4 py-2'>100)

---

### Test #64: Serum Sodium 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210532`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Sodium | - | Any (Min: 0d, Max: Adultd) | **136 - 146** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Sodium is the predominant extracellular cation. The serum sodium level is primarily determined by the volume status of the individual. Hyponatremia can be divided into hypovolemia, euvolemia, and hypervolemia categories. Interpretation Increased in : Dehydration (excessive sweating, severe vomiting, or diarrhea), polyuria (diabetes mellitus, diabetes insipidus), hyperaldosteronism, inadequate water intake (coma, hypothalamic disease). Drugs: steroids, licorice, oral contraceptives. Decreased in : CHF, cirrhosis, vomiting, diarrhea, exercise, excessive sweating (with replacement of water but not salt, eg, marathon running), salt-losing nephropathy, adrenal insufficiency, nephrotic syndrome, water intoxication, syndrome of inappropriate antidiuretic hormone (SIADH), AIDS. D...

- **Utilized in Panels:** class='px-4 py-2'> Electrolytes Panel, class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Sodium (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100), class='px-4 py-2'>Serum Electrolyte (₹class='px-4 py-2'>100), class='px-4 py-2'>Serum Sodium &amp; Potassium (₹class='px-4 py-2'>100)

---

### Test #65: BUN 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210533`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| BUN | - | Any (Min: 0d, Max: Adultd) | **7.9 - 20** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Urea is the end product of protein metabolism, which is excreted by the kidney. BUN is directly related to protein intake and nitrogen metabolism and inversely related to the rate of excretion of urea. Urea concentration in glomerular filtrate is the same as in plasma, but its tubular reabsorption is inversely related to the rate of urine formation. Thus, BUN is a less useful measure of glomerular filtration rate than the serum/ plasma creatinine (Cr). Clinic Use The BUN (Blood Urea Nitrogen) test measures the level of urea nitrogen in the blood to assess kidney function and overall health. It is a commonly performed test that helps diagnose and monitor conditions related to kidney health. High Levels causes : Low Levels causes: Kidney dysfunction - Acute kidney injury,...

- **Utilized in Panels:** class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>BUN (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100)

---

### Test #66: BUN / Creatinine Ratio 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210534`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| BUN / Creatinine Ratio | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>BUN / Creatinine Ratio (₹class='px-4 py-2'>100)

---

### Test #67: Urea / Creatinine Ratio 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210535`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urea / Creatinine Ratio | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Urea / Creatinine Ratio (₹class='px-4 py-2'>100)

---

### Test #68: Serum Potassium 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210536`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Potassium | - | Any (Min: 0d, Max: Adultd) | **3.5 - 5.1** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Potassium is predominantly an intracellular cation whose plasma level is regulated by renal excretion. Elevated or depressed potassium concentrations interfere with muscle contraction. Interpretation Increased in : Massive hemolysis, severe tissue damage, rhabdomyolysis, acidosis, dehydration, acute or chronic renal failure, Addison disease, renal tubular acidosis type IV (hyporeninemic) hypoaldosteronism, (hyperkalemic) familial periodic paralysis, exercise (transient). Drugs: potassium salts, potassium-sparing diuretics (eg, spironolactone, triamterene, eplerenone), nonsteroidal anti-inflammatory drugs, &beta;-blockers, ACE inhibitors, ACE-receptor blockers, high-dose trimethoprim-sulfamethoxazole. Decreased in : Low potassium intake, prolonged vomiting or diarrhea, ren...

- **Utilized in Panels:** class='px-4 py-2'> Electrolytes Panel, class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Potassium (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100), class='px-4 py-2'>Serum Electrolyte (₹class='px-4 py-2'>100), class='px-4 py-2'>Serum Sodium &amp; Potassium (₹class='px-4 py-2'>100)

---

### Test #69: iCalcium 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210538`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| iCalcium | - | Any (Min: 0d, Max: Adultd) | **1.13 - 1.33** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Calcium circulates in three forms: as free Ca2+ (50&ndash;55%), protein bound to albumin and globulins (40&ndash;45%), and as calcium-ligand complexes (5&ndash;10%) (with citrate, bicarbonate, lactate, phosphate, and sulfate). Protein binding is highly pH-dependent, and acidosis results in an increased free calcium fraction. Ionized Ca2+ is the form that is physiologically active. Ionized calcium is a more accurate reflection of physiologic status than total calcium in patients with altered serum proteins (renal failure, nephrotic syndrome, multiple myeloma, etc), altered concentrations of calcium-binding ligands, and acid-base disturbances. Measurement of ionized calcium is by ion-selective electrodes. Ionized calcium levels vary inversely with pH, about 0.2 mg/dL per ...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile, class='px-4 py-2'> Electrolytes Panel
- **Available in Ratelist As:** class='px-4 py-2'>iCalcium (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #70: Serum Calcium 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210539`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Calcium | - | Any (Min: 0d, Max: Adultd) | **8.8 - 10.6** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Serum calcium is the sum of ionized calcium plus complex calcium and calcium bound to proteins (mostly albumin). Level of ionized calcium is regulated by parathyroid hormone and vitamin D. Interpretation Common causes of Hypocalcemia Causes of Hypercalcemia 1. Chronic renal failure 2. Hypomagnesemia 3. Hypoalbuminemia 1. Increased intestinal absorption (vitamin d intoxication) 2. Increased skeletal resorption 3. Primary hyperparathyroidism Primary hyperparathyroidism and malignancy account for 90-95% of cases of hypercalcemia. Comments Need to know serum albumin to interpret calcium level. For every decrease in albumin by 1mg/dL, calcium should be corrected upward by 0.8 mg/dL. In 10% of patients with malignancies, hypercalcemia is attributable to coexistent hyperparath...

- **Utilized in Panels:** class='px-4 py-2'> Electrolytes Panel, class='px-4 py-2'> KFT without eGFR, class='px-4 py-2'> Kidney Function Test (KFT)
- **Available in Ratelist As:** class='px-4 py-2'>Serum Calcium (₹class='px-4 py-2'>100)

---

### Test #71: Total Calcium 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210540`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total Calcium | - | Any (Min: 0d, Max: Adultd) | **9 - 10.5** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Serum calcium is the sum of ionized calcium plus complex calcium and calcium bound to proteins (mostly albumin). Level of ionized calcium is regulated by parathyroid hormone and vitamin D. Interpretation Common causes of Hypocalcemia Causes of Hypercalcemia 1. Chronic renal failure 2. Hypomagnesemia 3. Hypoalbuminemia 1. Increased intestinal absorption (vitamin d intoxication) 2. Increased skeletal resorption 3. Primary hyperparathyroidism Primary hyperparathyroidism and malignancy account for 90-95% of cases of hypercalcemia. Comments Need to know serum albumin to interpret calcium level. For every decrease in albumin by 1mg/dL, calcium should be corrected upward by 0.8 mg/dL. In 10% of patients with malignancies, hypercalcemia is attributable to coexistent hyperparath...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile
- **Available in Ratelist As:** class='px-4 py-2'>Total Calcium (₹class='px-4 py-2'>100)

---

### Test #72: Glucose Tolerance Test, GTT (GTT)
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210541`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Fasting | - | Any (Min: 0d, Max: Adultd) | **&lt; 100** | - to - |
| 1 Hour | - | Any (Min: 0d, Max: Adultd) | **&lt; 190** | - to - |
| 2 Hour | - | Any (Min: 0d, Max: Adultd) | **&lt; 165** | - to - |
| 3 Hour | - | Any (Min: 0d, Max: Adultd) | **&lt; 145** | - to - |

**Clinical Interpretation & Significance:**
> STATUS Fasting Plasma Glucose in mg/dl Post 75g Glucose load mg/dl Normal 70-100 70-140 Impaired Fasting Glucose 101-125 70-140 Impaired Glucose tolerance 70-100 141-199 Pre-Diabetes 101-125 141-199 Diabetes Mellitus &gt;126 &gt;200 The diagnosis of Diabetes requires a fasting plasma glucose of &gt; or = 126 mg/dL or a random / 2 hr post glucose value of &gt; or = 200 mg/dL on at least 2 occasions.

- **Available in Ratelist As:** class='px-4 py-2'>GTT (₹class='px-4 py-2'>100)

---

### Test #73: Random Blood Sugar 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210542`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Random Blood Sugar | - | Any (Min: 0d, Max: Adultd) | **70 - 140** | - to - |

**Clinical Interpretation & Significance:**
> According to ADA guidelines Status Random Blood Glucose (mg/dl) Random Blood Glucose (mmol/L) Normal 70-140 4.4-7.8 Pre-Diabetes 140-200 7.8-11.1 Diabetes &gt;200 &gt;11.1 The reference values for a Normal Random Glucose test in an average adult are 70-140 mg/dL (4.4-7.8 mmol/i). between 140-200 mg/L (78-11.1 mmol/l) is considered pre-diabetes, and &rsaquo; 200 mg/dL is considered diabetes according to ADA guidelines (you should visit your doctor or a clinic for additional tests)

- **Utilized in Panels:** class='px-4 py-2'> Pcod
- **Available in Ratelist As:** class='px-4 py-2'>Random Blood Sugar (₹class='px-4 py-2'>100), class='px-4 py-2'>Antenatal Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Fitness Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #74: Serum Chloride 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210543`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Chloride | - | Any (Min: 0d, Max: Adultd) | **98 - 113** | - to - |
| Serum Chloride | - | Any (Min: 0d, Max: Adultd) | **98 - 107** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Chloride, the principal inorganic anion of extracellular fluid, is important in maintaining proper body water distribution, osmotic pressure, and normal acid&ndash;base balance. If chloride is lost (as HCl or NH4Cl), alkalosis ensues; if chloride is ingested or retained, acidosis ensues. Interpretation Increased in: Renal failure, nephrotic syndrome, renal tubular acidosis, dehydration, overtreatment with saline, hyperparathyroidism, diabetes insipidus, metabolic acidosis from diarrhea (loss of HCO3&ndash;), respiratory alkalosis, hyperadrenocorticism. Drugs: acetazolamide (hyperchloremic acidosis), androgens, hydrochlorothiazide, salicylates (intoxication). Decreased in: Vomiting, diarrhea, gastrointestinal suction, renal failure combined with salt deprivation, over-tr...

- **Utilized in Panels:** class='px-4 py-2'> Electrolytes Panel
- **Available in Ratelist As:** class='px-4 py-2'>Serum Chloride (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #75: Serum Amylase 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210544`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Amylase | - | Any (Min: 0d, Max: Adultd) | **0 - 120** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Amylase hydrolyzes complex carbohydrates. Serum amylase is derived primarily from pancreas and salivary glands and is increased with inflammation or obstruction of these glands. Other tissues have some amylase activity, including ovaries, small and large intestine, and skeletal muscle. Interpretation Increased in: Acute pancreatitis (70&ndash;95%), pancreatic pseudocyst, pancreatic duct obstruction (cholecystitis, choledocholithiasis, pancreatic carcinoma, stone, stricture, duct sphincter spasm), bowel obstruction and infarction, mumps, parotitis, diabetic keto- acidosis, penetrating peptic ulcer, peritonitis, ruptured ectopic pregnancy, macroamylasemia. Drugs: azathioprine, hydrochlorothiazide. Decreased in: Pancreatic insufficiency, cystic fibrosis. Usually normal or ...

- **Available in Ratelist As:** class='px-4 py-2'>Serum Amylase (₹class='px-4 py-2'>100)

---

### Test #76: HbA1c (Glycosylated Hemoglobin) 
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210545`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HbA1c | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Estimated average glucose | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation as per American Diabetes Association (ADA) Guidelines Reference Group Non-Diabetic adults &gt;= 18 years At Risk (Prediabetes) Diagnosing Diabetes Therapeutic goals for glycemic control HbA1c in% 4.0-5.6 5.7-6.4 &gt;= 6.5 &lt;7.0 Clinical significance: Hemoglobin A1c (HbA1c) level reflects the mean glucose concentration over the previous period (approximately 8-12 weeks). The following ranges may be used for interpretation of results. However, factors such as duration of diabetes, adherence to therapy and the age of the patient should also be considered in assessing the degree of blood glucose control. Haemoglobin A1c (%) NSGP mmol/mol/IFCC Unit eAG (mg/dl) Degree of Glucose Control Unit &gt;8 &gt;63.9 &gt;183 Action Suggested* 7-8 53.0 - 63.9 154-183 Fair Control &lt;7 &lt;...

- **Available in Ratelist As:** class='px-4 py-2'>HbA1c (Glycosylated Hemoglobin) (₹class='px-4 py-2'>100), class='px-4 py-2'>Cardiac package (₹class='px-4 py-2'>100), class='px-4 py-2'>Diabetic package (₹class='px-4 py-2'>100), class='px-4 py-2'>Fitness Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #77: A/G Ratio 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210546`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| A/G Ratio | - | Any (Min: 0d, Max: Adultd) | **1.1 - 2.1** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Protein Fraction, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>A/G Ratio (₹class='px-4 py-2'>100)

---

### Test #78: Globulin 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210547`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Globulin | - | Any (Min: 0d, Max: Adultd) | **1.8 - 3.6** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Protein Fraction, class='px-4 py-2'> Liver Function Test (LFT)
- **Available in Ratelist As:** class='px-4 py-2'>Globulin (₹class='px-4 py-2'>100)

---

### Test #79: Lipase 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210548`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Lipase | - | Any (Min: 0d, Max: Adultd) | **0 - 8** | - to - |
| Lipase | - | Any (Min: 0d, Max: Adultd) | **5 - 31** | - to - |
| Lipase | - | Any (Min: 0d, Max: Adultd) | **7 - 39** | - to - |
| Lipase | - | Any (Min: 0d, Max: Adultd) | **0 - 67** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Lipases are responsible for hydrolysis of glycerol esters of long-chain fatty acids to produce fatty acids and glycerol. Interpretation Increased in: Acute, recurrent, or chronic pancreatitis, pancreatic pseudocyst, pancreatic malignancy, peritonitis, biliary disease, hepatic disease, diabetes mellitus (especially diabetic ketoacidosis), intestinal disease, gastric malignancy or perforation, cystic fibrosis, inflammatory bowel disease (Crohn disease and ulcerative colitis). Comments Serum lipase may be a more reliable test than serum amylase for the initial diagnosis of acute pancreatitis, because of its increased sensitivity in acute alcoholic pancreatitis and because lipase remains elevated longer than amylase.

- **Available in Ratelist As:** class='px-4 py-2'>Lipase (₹class='px-4 py-2'>100)

---

### Test #80: Ferritin 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210549`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Ferritin | - | Any (Min: 0d, Max: Adultd) | **25 - 200** | - to - |
| Ferritin | - | Any (Min: 0d, Max: Adultd) | **200 - 600** | - to - |
| Ferritin | - | Any (Min: 0d, Max: Adultd) | **7 - 140** | - to - |
| Ferritin | - | Male (Min: 0d, Max: Adultd) | **22 - 332** | - to - |
| Ferritin | - | Female (Min: 0d, Max: Adultd) | **10 - 291** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation : Ferritin is iron storage protein. Determination of ferritin is necessary in Iron deficiency anemia, monitoring iron therapy, and in differential diagnosis of Anaemia. Elevation levels- Hemochromatosis, Porphyria, Rheumatoid arthritis, Leukaemia, Hodgkin's lymphoma, Liver disease, Multiple blood transfusion, Acute phase reactant, Increased in all inflammatory condition. Decreased level- Iron deficiency anemia.

- **Available in Ratelist As:** class='px-4 py-2'>Ferritin (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100)

---

### Test #81: Microalbumin Creatinine Ratio, Urine Random 
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210550`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Microalbuminuria | - | Any (Min: 0d, Max: Adultd) | **0 - 25** | - to - |
| Urinary creatinine  | - | Any (Min: 0d, Max: Adultd) | **28 - 217** | - to - |
| Urinary Albumin Creatinine Ratio (UACR) | - | Any (Min: 0d, Max: Adultd) | **&lt;30** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis The normal urinary albumin excretion is less than 30 mg/24 hr. On random spot urine collection, the albumin-to-creatinine ratio (ACR, mcg/mg) should be less than 30. Category Spot collection ACR (mg/g) Normal &lt; 30 Microalbuminuria 30-300 Clinical albuminuria &gt; 300 Interpretation Increased in: Diabetes mellitus, diabetic nephropathy. Comments Microalbuminuria is a useful indicator of early nephropathy in diabetic patients. Urine albumin measurement requires a sensitive immunochemical assay. Urine dipstick analysis is often insensitive to microalbuminuria. Screening for microalbuminuria is often performed by measurement of the ACR in a random spot collection (preferred method).

- **Available in Ratelist As:** class='px-4 py-2'>Microalbumin Creatinine Ratio, Urine Random (₹class='px-4 py-2'>100)

---

### Test #82: CPK-MB 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210551`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CPK-MB | - | Any (Min: 0d, Max: Adultd) | **&lt; 5 ng/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis CK consists of three isoenzymes, made up of 2 subunits, M and B. The fraction with the greatest electrophoretic mobility is CK1 (BB), CK2 (MB) is intermediate, and CK3 (MM) moves slowest toward the anode. Skeletal muscle is characterized by isoenzyme MM and brain by isoenzyme BB. Myocardium has approximately 40% MB isoenzyme. Assay techniques include isoenzyme separation by electrophoresis (isoenzyme activity units) or by immunoassay using antibodies specific for MB fraction (mass units). Interpretation Increased in: Myocardial infarction, cardiac trauma, certain muscular dystrophies, and polymyositis. Slight persistent elevation reported in a few patients on hemodialysis. Comments CK-MB is a relatively specific test for MI. It appears in serum approximately 4 hours aft...

- **Available in Ratelist As:** class='px-4 py-2'>CPK-MB (₹class='px-4 py-2'>100)

---

### Test #83: Stool reducing substances 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210552`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Stool reducing substances | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Stool reducing substances (₹class='px-4 py-2'>100)

---

### Test #84: 25 Hydroxy (OH) Vitamin D (Vitamin D3)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210553`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| 25 Hydroxy (OH) Vitamin D | - | Any (Min: 0d, Max: Adultd) | **30 - 100** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis: The vitamin D system functions to maintain serum calcium levels. Vitamin D is a fat-soluble steroid hormone. Two molecular forms exist: D3 (cholecalciferol), synthesized in the epidermis, and D2 (ergocalciferol), derived from plant sources. To become active, both need to be further metabolized. Two sequential hydroxylations occur: in the liver to 25(OH)D and then, in the kidney, to 1,25[OH] 2 D. Besides consequences for bone health, vitamin D deficiency reportedly is associated with a number of conditions such as cardiovascular disease, autoimmunity and cancer; however, evidence-based cause-and-effect relationships have not been established. Interpretation Increased in : Heavy milk drinkers (up to 64 ng/mL), vitamin D intoxication, sun exposure. Decreased in : Dietary ...

- **Available in Ratelist As:** class='px-4 py-2'>Vitamin D3 (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Fitness Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #85: Vitamin B12 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210554`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Vitamin B12 | - | Any (Min: 0d, Max: Adultd) | **211 - 911** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Vitamin B12 is a necessary cofactor for three important biochemical processes: conversion of methylmalonyl-CoA to succinyl-CoA and methylation of homocysteine to methionine and demethylation of methyltetrahydrofolate to tetra-hydrofolate (THF). All vitamin B12 comes from ingestion of foods of animal origin. Vitamin B12 in serum is protein bound, 70% to transcobalamin I (TC I) and 30% to transcobalamin II (TC II). The B12 bound to TC II is physiologically active; that bound to TC I is not. Interpretation Increased in : Leukemia (acute myelocytic, chronic myelocytic, chronic lymphocytic, monocytic), marked leukocytosis, polycythemia vera. Decreased in : Pernicious anemia, gastrectomy, gastric carcinoma, malabsorption, pregnancy, dietary deficiency, HIV infection, chronic hi...

- **Available in Ratelist As:** class='px-4 py-2'>Vitamin B12 (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100), class='px-4 py-2'>Fitness Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #86: Gamma Glutamyl Transferase, GGT (GGT)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210555`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Gamma Glutamyl Transferase, GGT | - | Any (Min: 0d, Max: Adultd) | **9 - 52** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation Synthesis of GGT is stimulated by many drugs e.g., phenytoin, phenobarbitone, primidone, alcohol and possibly some antidepressants. GGT is a sensitive test for excess alcohol intake but is not specific. Abnormal test results 1. Raised GGT and raised mean corpuscular volume (MCV) suggest alcohol abuse. 2. Raised GGT, history of excessive alcohol intake, raised ALT and raised MCV suggest liver cell damage. 3. Very high GGT (10 times normal upper limit) occurs in biliary obstruction and hepatic malignancies. 4. Raised GGT and raised ALP (more than three times upper limit of normal) suggest cholestasis. 5. Raised GGT may be due to non-specific causes e.g., MI, cerebrovascular accident, diabetes mellitus, pancreatic disease, renal failure and chronic lung disease. 6. LFTs (transa...

- **Available in Ratelist As:** class='px-4 py-2'>GGT (₹class='px-4 py-2'>100)

---

### Test #87: Serum IgE 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210556`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum IgE | - | Any (Min: 0d, Max: Adultd) | **1 - 190** | - to - |

**Clinical Interpretation & Significance:**
> Notes Normal IgE levels don't rule out the possibility of IgE-dependent allergies. This is because the accuracy of the test can be influenced by factors such as the time between exposure to an allergen and testing, the patient's age, and the specific organs affected. Additionally, the severity of an allergic reaction is not strongly related to the amount of IgE in the blood. Comments Immunoglobulin E (IgE) plays a key role in triggering allergic reactions. Its levels are low in the first year of life but increase as a child grows, reaching adult levels by around age 10. Measuring IgE levels can help differentiate between atopic diseases (like allergic asthma, allergic rhinitis, and atopic dermatitis) and non-atopic conditions. Increased Levels - Atopic/Non-atopic allergy, Hyper IgE syndrom...

- **Available in Ratelist As:** class='px-4 py-2'>Serum IgE (₹class='px-4 py-2'>100)

---

### Test #88: Serum IgG 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210557`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum IgG | - | Any (Min: 0d, Max: Adultd) | **5 - 17** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum IgG (₹class='px-4 py-2'>100)

---

### Test #89: Serum IgM 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210558`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum IgM | - | Any (Min: 0d, Max: Adultd) | **400 - 2,500** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum IgM (₹class='px-4 py-2'>100)

---

### Test #90: Serum IgA 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210559`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum IgA | - | Any (Min: 0d, Max: Adultd) | **200 - 3,000** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum IgA (₹class='px-4 py-2'>100)

---

### Test #91: HSV-1/2 IgG 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210560`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HSV-1/2 IgG | - | Any (Min: 0d, Max: Adultd) | **&lt; 2.0 AU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>HSV-1/2 IgG (₹class='px-4 py-2'>100)

---

### Test #92: HSV-1/2 IgM 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210561`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HSV-1/2 IgM | - | Any (Min: 0d, Max: Adultd) | **Neg. &lt; 2 AU/mL
Grey Zone 2 - 4 AU/mL
Pos. &gt;= 4 AU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>HSV-1/2 IgM (₹class='px-4 py-2'>100)

---

### Test #93: HSV-2 IgG 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210562`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HSV-2 IgG | - | Any (Min: 0d, Max: Adultd) | **&lt; 2.0 AU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>HSV-2 IgG (₹class='px-4 py-2'>100)

---

### Test #94: CMV IgG 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210563`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CMV IgG | - | Any (Min: 0d, Max: Adultd) | **&lt; 2 AU/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Detects the presence of antibodies to CMV, either IgG or IgM. CMV infection is usually acquired during childhood or early adulthood. By age 20&ndash;40 years, 40&ndash;90% of the population has CMV antibodies. Interpretation Increased in: Previous or active CMV infection. False-positive CMV IgM tests occur when rheumatoid factor or infectious mononucleosis is present. Comments Serial specimens exhibiting a greater than fourfold titer rise suggest a recent infection. Active CMV infection must be documented by viral isolation. Useful for screening of potential organ donors and recipients. Universal prophylaxis reduces infection in transplant recipients. Detection of CMV IgM antibody in the serum of a newborn usually indicates congenital infection. Detection of CMV IgG ant...

- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>CMV IgG (₹class='px-4 py-2'>100)

---

### Test #95: CMV IgM 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210564`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CMV IgM | - | Any (Min: 0d, Max: Adultd) | **Neg. &lt; 2.0 AU/mL
Grey Zone 2 - 4.2 AU/mL
Pos. &gt; 4.2 AU/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Detects the presence of antibodies to CMV, either IgG or IgM. CMV infection is usually acquired during childhood or early adulthood. By age 20&ndash;40 years, 40&ndash;90% of the population has CMV antibodies. Interpretation Increased in: Previous or active CMV infection. False-positive CMV IgM tests occur when rheumatoid factor or infectious mononucleosis is present. Comments Serial specimens exhibiting a greater than fourfold titer rise suggest a recent infection. Active CMV infection must be documented by viral isolation. Useful for screening of potential organ donors and recipients. Universal prophylaxis reduces infection in transplant recipients. Detection of CMV IgM antibody in the serum of a newborn usually indicates congenital infection. Detection of CMV IgG ant...

- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>CMV IgM (₹class='px-4 py-2'>100)

---

### Test #96: Rubella IgG 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210565`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Rubella IgG | - | Any (Min: 0d, Max: Adultd) | **&lt; 2 IU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>Rubella IgG (₹class='px-4 py-2'>100)

---

### Test #97: Rubella IgM 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210566`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Rubella IgM | - | Any (Min: 0d, Max: Adultd) | **Neg. &lt; 2 AU/mL
Grey Zone 2-3 AU/mL
Pos. &gt; 3 AU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>Rubella IgM (₹class='px-4 py-2'>100)

---

### Test #98: Anti TPO 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210567`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti TPO | - | Any (Min: 0d, Max: Adultd) | **&lt; 30 IU/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis TPO is a membrane-bound glycoprotein. This enzyme mediates the oxidation of iodide ions and incorporation of iodine into tyrosine residues of thyroglobulin. Its synthesis is stimulated by thyroid-stimulating hormone (TSH). TPO is the major antigen involved in thyroid antibody-dependent cell-mediated cytotoxicity. TPO Ab can be measured by enzyme-linked immunosorbent assay (ELISA) or automated immunoassay. Interpretation Increased in : Hashimoto thyroiditis (&gt; 99%), Idiopathic myxedema (&gt; 99%), Graves disease (75&ndash;85%), Addison disease (50%), and Riedel thyroiditis. Low titers are present in approximately 10% of normal individuals and patients with non-immune thyroid disease. Comments TPO antibody is an antibody to the main autoantigenic component of microsome...

- **Available in Ratelist As:** class='px-4 py-2'>Anti TPO (₹class='px-4 py-2'>100)

---

### Test #99: Thyroglobulin (TG) 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210568`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Thyroglobulin (TG) | - | Any (Min: 0d, Max: Adultd) | **&lt; 55 ng/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Tg is a large protein specific to the thyroid gland from which thyroxine is synthesized and cleaved. Highly sensitive immunometric assays for Tg are available. Tg autoantibodies can interfere with the measurement of Tg. Interpretation Increased in : Hyperthyroidism, subacute thyroiditis, untreated thyroid carcinomas (except medullary carcinoma): follicular cancer (sensitivity 72%, specificity 81%), Hürthle cell cancer (sensitivity 56%, specificity 84%). Decreased in : Factitious hyperthyroidism, presence of thyroglobulin autoantibodies, after (&gt; 25 days) total thyroidectomy. Comments Follow-up of patients with differentiated thyroid cancers who are apparently disease-free after surgery and radioiodine therapy involves periodic measurement of serum Tg. Patients with de...

- **Available in Ratelist As:** class='px-4 py-2'>Thyroglobulin (TG) (₹class='px-4 py-2'>100)

---

### Test #100: Thyroglobulin Antibody (TgAb) 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210569`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Thyroglobulin Antibody (TgAb) | - | Any (Min: 0d, Max: Adultd) | **&lt; 95 IU/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Antibodies against thyroglobulin are produced in autoimmune diseases of the thyroid and other organs. Of the normal population, 10% have slightly elevated titers (especially women and the elderly). Interpretation Increased in : Hashimoto thyroiditis (&gt; 90%), thyroid carcinoma (45%), thyrotoxicosis, pernicious anemia (50%), SLE (20%), subacute thyroiditis, Graves disease. Not increased in : Multinodular goiter, thyroid adenomas, and some carcinomas. The thyroid peroxidase antibody test is more sensitive than the thyroglobulin antibody test in autoimmune thyroid disease. There is limited use for this test, ie, monitoring of patients with thyroid carcinoma after treatment.

- **Available in Ratelist As:** class='px-4 py-2'>Thyroglobulin Antibody (TgAb) (₹class='px-4 py-2'>100)

---

### Test #101: Toxo IgG 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210570`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Toxo IgG | - | Any (Min: 0d, Max: Adultd) | **&lt; 2 IU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>Toxo IgG (₹class='px-4 py-2'>100)

---

### Test #102: Toxo IgM 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210571`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Toxo IgM | - | Any (Min: 0d, Max: Adultd) | **Neg. &lt; 2 AU/mL
Grey Zone 2 - 2.6 AU/mL
Pos. &gt; 2.6 AU/mL** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Torch Profile
- **Available in Ratelist As:** class='px-4 py-2'>Toxo IgM (₹class='px-4 py-2'>100)

---

### Test #103: Estradiol 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210572`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Estradiol | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Pcod, class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>Estradiol (₹class='px-4 py-2'>100)

---

### Test #104: DHEA 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210573`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| DHEA | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis DHEA is a 19-carbon endogenous steroid hormone secreted by the adrenal glands. It is converted to DHEA-S in the adrenals, liver, and small intestine. DHEA-S is albumin-bound in the circulation, and there is no diurnal variation in DHEA-S levels. Levels of DHEA-S are about 300 &times; higher than DHEA and more stable. It serves as the precursor of androgens and estrogens. Interpretation Increased in: Adrenal hyperplasia, adrenal cancer, congenital adrenal hyperplasia, polycystic ovarian syndrome. Decreased in: Adrenal insufficiency, hypopituitarism, rheumatoid arthritis (females), insulin, and corticosteroids. Comments DHEA measurement is typically used along with other steroid and peptide hormones to evaluate adrenal function, to help diagnose adrenal cortex tumors, and p...

- **Available in Ratelist As:** class='px-4 py-2'>DHEA (₹class='px-4 py-2'>100)

---

### Test #105: Troponin I 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210574`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Troponin I  | - | Any (Min: 0d, Max: Adultd) | **&lt; 0.1 ng/mL** | - to - |

**Clinical Interpretation & Significance:**
> Initial Result In pg/ml Remarks &lt;26.2 The upper reference limit (99th percentile) for high sensitive Troponin I (hsTnI) &lt; 26.2 &amp; pain &lt; 6 hours Repeat Sampling after 3 hrs, a 50% change from initial value is diagnostic of Myocardial Infarction (MI) &gt;26.2-262 Repeat Sampling after 3 hrs, 50% change from initial value is diagnostic of Myocardial Infarction (MI) &gt;262 Ml may be ruled in as appropriate with 98% specificity Note After Ml, troponin rises within 4-8 hours, peaks at 12-24 hours, and remains elevated for upto 14 days. Increased levels cTnl is highly cardio specific , though it may be elevated in nonischemic forms of cardiac injury including cardiac contusion, myocarditis, CHF, cardiomyopathy, Interventional therapy like cardiac surgery, and drug-induced cardiotoxi...

- **Available in Ratelist As:** class='px-4 py-2'>Troponin I (₹class='px-4 py-2'>100)

---

### Test #106: Creatine Kinase (CPK-Total)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210575`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Creatine Kinase | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CPK-Total (₹class='px-4 py-2'>100), class='px-4 py-2'>Cardiac package (₹class='px-4 py-2'>100)

---

### Test #107: CK-MB 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210577`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CK-MB  | - | Any (Min: 0d, Max: Adultd) | **&lt; 5.0 ng/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis CK consists of three isoenzymes, made up of 2 subunits, M and B. The fraction with the greatest electrophoretic mobility is CK1 (BB), CK2 (MB) is intermediate, and CK3 (MM) moves slowest toward the anode. Skeletal muscle is characterized by isoenzyme MM and brain by isoenzyme BB. Myocardium has approximately 40% MB isoenzyme. Assay techniques include isoenzyme separation by electrophoresis (isoenzyme activity units) or by immunoassay using antibodies specific for MB fraction (mass units). Interpretation Increased in: Myocardial infarction, cardiac trauma, certain muscular dystrophies, and polymyositis. Slight persistent elevation reported in a few patients on hemodialysis. Comments CK-MB is a relatively specific test for MI. It appears in serum approximately 4 hours aft...

- **Available in Ratelist As:** class='px-4 py-2'>CK-MB (₹class='px-4 py-2'>100), class='px-4 py-2'>Cardiac package (₹class='px-4 py-2'>100)

---

### Test #108: D-Dimer 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210578`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| D-Dimer | - | Any (Min: 0d, Max: Adultd) | **&lt; 0.5 μg FEU/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis D-dimer is one of the terminal fibrin degradation products. The presence of D-dimers indicates that a fibrin clot was formed and subsequently degraded by plasmin. Essentially, D-dimer is elevated whenever the coagulation system has been activated, followed by fibrinolysis. Interpretation Increased in : Deep vein thrombosis (DVT), venous thrombo-embolism (VTE), pulmonary embolism (PE), disseminated intravascular coagulation (DIC), arterial thromboembolism, pregnancy (especially postpartum period), malignancy, surgery, thrombolytic therapy. Comments D-dimer assay is a very sensitive test for DIC, DVT and VTE or PE. The D-dimer can be measured by a variety of methods; for example, semiquantitative latex agglutination and quantitative high-sensitivity immunoassay (eg, ELISA...

- **Available in Ratelist As:** class='px-4 py-2'>D-Dimer (₹class='px-4 py-2'>100)

---

### Test #109: Calcitonin 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210579`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Calcitonin | - | Any (Min: 0d, Max: Adultd) | **&lt; 18 pg/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Calcitonin is a 32-amino-acid polypeptide hormone secreted by the parafollicular C cells of the thyroid. It decreases osteoclastic bone resorption and lowers serum calcium levels. Interpretation Increased in : Medullary thyroid carcinoma, Zollinger-Ellison syndrome, pernicious anemia, pregnancy (at term), newborns, carcinoma (breast, lung, pancreas), leukemia, myeloproliferative disorders, chronic renal failure. Comments Test is useful to diagnose and monitor medullary thyroid carcinoma, although stimulation tests may be necessary (eg, pentagastrin test). Genetic testing (eg, RET mutation test) is now available for the diagnosis of multiple endocrine neoplasia type II.

- **Available in Ratelist As:** class='px-4 py-2'>Calcitonin (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #110: Indirect Coomb&#39;s Test 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210580`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Indirect Coomb&#39;s Test  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Indirect antiglobulin test is used to demonstrate the presence in the patient&rsquo;s serum/plasma of unexpected antibody to ABO and Rh-compatible reagent red blood cells. Patient serum or plasma is incubated in vitro with reagent red cells, which are then washed to remove unbound globulins. Agglutination that occurs when antihuman globulin (AHG, Coombs) reagent is added indicates that antibody has bound to a specific antigen present on the red cells. Interpretation Positive in: Presence of alloantibody or autoantibody. Drugs: methyldopa. Comments The technique is used in antibody detection and identification, and in the AHG crossmatch prior to transfusion.

- **Available in Ratelist As:** class='px-4 py-2'>Indirect Coomb&#39;s Test (₹class='px-4 py-2'>100)

---

### Test #111: Direct Coomb&#39;s Test 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210581`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Direct Coomb&#39;s Test  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Direct Coomb&#39;s Test (₹class='px-4 py-2'>100)

---

### Test #112: CA 125 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210582`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CA 125 | - | Any (Min: 0d, Max: Adultd) | **&lt; 35 U/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CA 125 (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100)

---

### Test #113: CA 15-3 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210583`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CA 15-3  | - | Any (Min: 0d, Max: Adultd) | **&lt; 25 U/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CA 15-3 (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100)

---

### Test #114: CA 19-9 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210584`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CA 19-9 | - | Any (Min: 0d, Max: Adultd) | **&lt; 37 U/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CA 19-9 (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #115: CA 50 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210585`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CA 50 | - | Any (Min: 0d, Max: Adultd) | **&lt; 25 U/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CA 50 (₹class='px-4 py-2'>100)

---

### Test #116: CA 242 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210586`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CA 242 | - | Any (Min: 0d, Max: Adultd) | **&lt; 20 U/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CA 242 (₹class='px-4 py-2'>100)

---

### Test #117: CA 72-4 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210587`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CA 72-4 | - | Any (Min: 0d, Max: Adultd) | **&lt; 6 U/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CA 72-4 (₹class='px-4 py-2'>100)

---

### Test #118: H-ALB 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210588`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| H-ALB | - | Any (Min: 0d, Max: Adultd) | **&lt; 10 μg/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>H-ALB (₹class='px-4 py-2'>100)

---

### Test #119: Anti cyclic-citrullinated-peptide (CCP)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210589`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti cyclic-citrullinated-peptide | - | Any (Min: 0d, Max: Adultd) | **&lt; 5 U/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Post-translational deamination of arginine residues by peptidyl arginine deaminase (citrullination) during inflammation results in production of antigenic epitope. Antibodies to citrullinated proteins (particularly filaggrin) are frequently elevated in rheumatoid arthritis (RA). Interpretation: Increased in- RA (sensitivity 70&ndash;80%). Comments: Specificity of anti-CCP (90&ndash;95%) for RA is higher than that of rheumatoid factor.

- **Available in Ratelist As:** class='px-4 py-2'>CCP (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100)

---

### Test #120: Arterial Blood Gas (ABG)
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210590`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| pH  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| PCO2  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Bicarbonate (HCO3 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Total CO2 Contents (TCO2) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Standard Bicarbonate (SBC) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Base Excess  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| PO2 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Oxygen saturation capacity | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Base Excess - Extracellular fluid | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Hemoglobin | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>ABG (₹class='px-4 py-2'>100)

---

### Test #121: Iron 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210591`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Iron | - | Any (Min: 0d, Max: Adultd) | **100 - 250** | - to - |
| Iron | - | Any (Min: 0d, Max: Adultd) | **40 - 100** | - to - |
| Iron | - | Any (Min: 0d, Max: Adultd) | **50 - 120** | - to - |
| Iron | - | Female (Min: 0d, Max: Adultd) | **50 - 170** | - to - |
| Iron | - | Male (Min: 0d, Max: Adultd) | **65 - 175** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Plasma iron concentration is determined by absorption from the intestine; storage in the intestine, liver, spleen, bone marrow; rate of breakdown or loss of hemoglobin; and rate of synthesis of new hemoglobin. The key regulator of iron homeostasis is hepcidin. Hepcidin excess or deficiency contributes to the dysregulation of iron homeostasis in hereditary and acquired iron disorders. Interpretation Increased in : Hemosiderosis (eg, multiple transfusions, excess iron administration), acute Fe poisoning (children), hemolytic anemia, pernicious anemia, aplastic or hypoplastic anemia, viral hepatitis, lead poisoning, thalassemia, hemochromatosis. Drugs: estrogens, ethanol, oral contraceptives. Decreased in : Iron deficiency, nephrotic syndrome, chronic renal failure, many i...

- **Utilized in Panels:** class='px-4 py-2'> Iron Studies
- **Available in Ratelist As:** class='px-4 py-2'>Iron (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100)

---

### Test #122: Total Iron Binding Capacity (TIBC) 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210592`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total Iron Binding Capacity (TIBC) | - | Any (Min: 0d, Max: Adultd) | **240 - 450** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Iron is transported in plasma complexed to transferrin, which is synthesized in the liver. Total iron-binding capacity is calculated from transferrin levels measured immunologically. Each molecule of transferrin has two iron-binding sites; so its iron- binding capacity is 1.47 mg/g. Normally, transferrin carries an amount of iron representing about 16&ndash;60% of its capacity to bind iron (eg, % saturation of iron-binding capacity is 16&ndash;60%). Interpretation Increased in: Decreased in: Iron deficiency anemia, late pregnancy, infancy, acute hepatitis. Drugs: oral contraceptives Hypoproteinemic states (eg, nephrotic syndrome, starvation, malnutrition, cancer), hemochromatosis, thalassemia, hyperthyroidism, chronic infections, chronic inflammatory disorders, chronic li...

- **Utilized in Panels:** class='px-4 py-2'> Iron Studies
- **Available in Ratelist As:** class='px-4 py-2'>Total Iron Binding Capacity (TIBC) (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100)

---

### Test #123: Transferrin Saturation 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210593`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Transferrin Saturation | - | Any (Min: 0d, Max: Adultd) | **20 - 55** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Iron Studies
- **Available in Ratelist As:** class='px-4 py-2'>Transferrin Saturation (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100)

---

### Test #124: Non-HDL cholesterol 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210594`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Non-HDL cholesterol | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Lipid Profile
- **Available in Ratelist As:** class='px-4 py-2'>Non-HDL cholesterol (₹class='px-4 py-2'>100)

---

### Test #125: UIBC 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210595`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| UIBC | - | Any (Min: 0d, Max: Adultd) | **155 - 355** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Iron Studies

---

### Test #126: eGFR 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210596`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| eGFR | - | Any (Min: 0d, Max: Adultd) | **&gt; 90** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Estimated Glomerular Filtration Rate (eGFR), class='px-4 py-2'> Kidney Function Test (KFT)

---

### Test #127: eGFR Category 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210597`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| eGFR Category | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Estimated Glomerular Filtration Rate (eGFR), class='px-4 py-2'> Kidney Function Test (KFT)

---

### Test #128: C3 Complement (C3)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210598`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| C3 Complement | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis The classic and alternative complement pathways converge at the C3 step in the complement cascade. Low levels indicate activation by one or both pathways. Most diseases with immune complexes show decreased C3 levels. Test is usually performed as an immunoassay (by radial immunodiffusion or nephelometry). Interpretation Increased Levels Decreased Levels Many inflammatory conditions as an acute-phase reactant, active phase of rheumatic diseases (eg, rheumatoid arthritis, SLE), acute viral hepatitis, myocardial infarction, cancer, diabetes mellitus, pregnancy, sarcoidosis, amyloidosis, thyroiditis. Decreased synthesis (protein malnutrition, congenital deficiency, severe liver disease), increased catabolism (immune complex disease, membranoproliferative glomerulonephritis [...

- **Available in Ratelist As:** class='px-4 py-2'>C3 (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100)

---

### Test #129: High-Sensitivity C-Reactive Protein (HsCRP)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210599`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| High-Sensitivity C-Reactive Protein | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis CRP is an acute-phase reactant protein. Hepatic secretion is stimulated in response to inflammatory cytokines. Unlike other acute-phase proteins, CRP is not affected by hormones. CRP activates the complement system, binds to Fc receptors, and serves as an opsonin for some microorganisms. Rapid, marked increases in CRP occur with inflammation, infection, trauma and tissue necrosis, malignancies, and autoimmune disorders. CRP levels are also valuable in assessing vascular inflammation and cardiovascular risk stratification. CRP level has been shown to be an independent risk factor for atherosclerotic disease. Elevated CRP levels are associated with increased cardiovascular morbidity and mortality in patients with coronary artery disease. Interpretation Increased in: Inflamm...

- **Available in Ratelist As:** class='px-4 py-2'>HsCRP (₹class='px-4 py-2'>100), class='px-4 py-2'>Cardiac package (₹class='px-4 py-2'>100)

---

### Test #130: ANTI MULLERIAN HORMONE (AMH)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210600`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| ANTI MULLERIAN HORMONE | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Notes Anti-M&uuml;llerian Hormone (AMH) starts to drop several years before Follicle-Stimulating Hormone (FSH) levels increase. Because of this, AMH is a more sensitive indicator of ovarian reserve. Sometimes, AMH levels and Antral Follicle Count (AFC) can give different results. AMH reflects the overall number of early-stage follicles that aren't visible yet, while AFC counts only the follicles that can be seen on an ultrasound. Interpretation AMH LEVEL IN ng/mL Remarks &lt;0.50 Predictive of poor response 0.50 - &lt;1.0 Suggestive of limited ovarian reserve 1.00 - 3.50 Predictive of optimal response &gt;3.50 Predictive of Ovarian hyperstimulation syndrome / PCOS Comment Antim&uuml;llerian Hormone (AMH) is produced by Sertoli cells in males and granulosa cells in females. In males, AMH le...

- **Utilized in Panels:** class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>AMH (₹class='px-4 py-2'>100)

---

### Test #131: Ammonia 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210601`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Ammonia | - | Any (Min: 0d, Max: Adultd) | **11 - 32** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Ammonia (₹class='px-4 py-2'>100)

---

### Test #132: Magnesium 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210602`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Magnesium | - | Any (Min: 0d, Max: Adultd) | **1.8 - 2.6** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Magnesium (₹class='px-4 py-2'>100)

---

### Test #133: Glucose Tolerance Test, GTT (Pregnancy) 
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210604`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Fasting | - | Any (Min: 0d, Max: Adultd) | **65 - 92** | - to - |
| 1 hour | - | Any (Min: 0d, Max: Adultd) | **100 - 180** | - to - |
| 2 hour | - | Any (Min: 0d, Max: Adultd) | **65 - 153** | - to - |
| 3 hour | - | Any (Min: 0d, Max: Adultd) | **70 - 125** | - to - |

**Clinical Interpretation & Significance:**
> According to American Diabetic Association (ADA) Guidelines 2024 For Screening and Diagnosis of Gestational Diabetes Mellitus One-Step Strategy is followed. Method One-step strategy Perform a 75-g OGTT, with plasma glucose measurement when an individual is fasting and at 1 and 2 h, at 24-28 weeks of gestation in individuals not previously diagnosed with diabetes. The OGTT should be performed in the morning after an overnight fast of at least 8 hours. The diagnosis of GDM is made when any of the following plasma glucose values are met or exceeded: Sample collection time Normal values Fasting &lt; 92 mg/dL (5.1 mmol/L) At 1 hour &lt; 180 mg/dL (10.0 mmol/L) At 2 hour &lt; 153 mg/dL (8.5 mmol/L)

- **Available in Ratelist As:** class='px-4 py-2'>Glucose Tolerance Test, GTT (Pregnancy) (₹class='px-4 py-2'>100)

---

### Test #134: SGOT/SGPT 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210605`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| SGOT/SGPT | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Liver Function Test (LFT)

---

### Test #135: NT- ProBNP (N-TERMINAL PRO B TYPE NATRIURETIC PEPTIDE) (NT- ProBNP)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210703`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| NT- ProBNP (N-TERMINAL PRO B TYPE NATRIURETIC PEPTIDE) | - | Any (Min: 0d, Max: Adultd) | **0 - 115** | - to - |

**Clinical Interpretation & Significance:**
> Chronic Heart failure AGE OF PATIENTS TITER Result &lt;75 Year &lt;125 Pg/ml Chronic heart failure unlikely Year &lt;450 Pg/ml Chronic heart failure unlikely ACUTE HEART FAILURE AGE OF PATIENTS TITER Result &lt;50 YEAR &lt;450 Pg/ml Acute heart failure unlikely 50-75 YEAR &lt;900 Pg/ml Acute heart failure unlikely YEARS &lt;1800 Pg/ml Acute heart failure unlikely

- **Available in Ratelist As:** class='px-4 py-2'>NT- ProBNP (₹class='px-4 py-2'>100)

---

### Test #136: Glucose Challenge Test (GCT); Pregnancy , 75g Glucose (GCT)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210705`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| GLUCOSE CHALLENGE TEST (GCT); PREGNANCY, 75g GLUCOSE | - | Any (Min: 0d, Max: Adultd) | **70 - 140** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>GCT (₹class='px-4 py-2'>100)

---

### Test #137: Serum Procalcitonin (PCT)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210704`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Procalcitonin | - | Any (Min: 0d, Max: Adultd) | **&lt;0.5** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>PCT (₹class='px-4 py-2'>100)

---

### Test #138: Urine Protein Creatinine Ratio (UPCR)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210698`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Protein Creatinine Ratio | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Urine Protein/Creatinine Ratio (UPCR)
- **Available in Ratelist As:** class='px-4 py-2'>UPCR (₹class='px-4 py-2'>100)

---

### Test #139: Serum Cholinesterase 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210714`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Cholinesterase | - | Any (Min: 0d, Max: Adultd) | **5,300 - 12,900** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum Cholinesterase (₹class='px-4 py-2'>100)

---

### Test #140: Serum Zinc 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210716`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Zinc | - | Any (Min: 0d, Max: Adultd) | **70 - 120** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum Zinc (₹class='px-4 py-2'>100)

---

### Test #141: Fasting Insulin 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210717`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Fasting Insulin | - | Any (Min: 0d, Max: Adultd) | **2 - 25** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Fasting Insulin (₹class='px-4 py-2'>100)

---

### Test #142: Bile Acid 
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210718`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Result | - | Any (Min: 0d, Max: Adultd) | **0 - 10** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Bile Acid (₹class='px-4 py-2'>100)

---

### Test #143: Homocysteine 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210721`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Homocysteine | - | Any (Min: 0d, Max: Adultd) | **5 - 15** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation 5 &ndash; 15 &micro;mol/L &rarr; Normal 15 &ndash; 30 &micro;mol/L &rarr; Mild elevation 30 &ndash; 100 &micro;mol/L &rarr; Moderate elevation &gt; 100 &micro;mol/L &rarr; Severe elevation

- **Available in Ratelist As:** class='px-4 py-2'>Homocysteine (₹class='px-4 py-2'>100)

---

### Test #144: Serum LDH 
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210722`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum LDH | - | Any (Min: 0d, Max: Adultd) | **140 - 280** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum LDH (₹class='px-4 py-2'>100)

---

### Test #145: Oral Glucose Challenge Test (OGCT)
- **Category:** Biochemistry | **Type:** Single parameter | **ID:** `7210688`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Oral Glucose Challenge Test | - | Any (Min: 0d, Max: Adultd) | **70 - 140** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>OGCT (₹class='px-4 py-2'>100)

---

### Test #146: DOUBLE MARKER, MATERNAL SCREEN-2 TESTS 
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210507`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| PAPPA Level | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| HCG Level | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>DOUBLE MARKER, MATERNAL SCREEN-2 TESTS (₹class='px-4 py-2'>100)

---

### Test #147: Adenosine Deaminase (ADA)
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210668`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Result | - | Any (Min: 0d, Max: Adultd) | **0 - 40** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>ADA (₹class='px-4 py-2'>100)

---

### Test #148: Estimated glomerular filtration rate ((eGFR))
- **Category:** Biochemistry | **Type:** Multi parameter | **ID:** `7210697`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Creatinine | - | Any (Min: 0d, Max: Adultd) | **&gt;90** | - to - |
| eGFR | - | Any (Min: 0d, Max: Adultd) | **0.55 - 1.02** | - to - |
| eGFR Category | - | Any (Min: 0d, Max: Adultd) | **0 - 0** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>(eGFR) (₹class='px-4 py-2'>100)

---

### Test #149: Widal (Tube Method) 
- **Category:** Serology &amp; Immunology | **Type:** Document | **ID:** `7210606`
- **Available in Ratelist As:** class='px-4 py-2'>Widal (Tube Method) (₹class='px-4 py-2'>100)

---

### Test #150: Widal (Slide Method) 
- **Category:** Serology &amp; Immunology | **Type:** Document | **ID:** `7210607`
- **Available in Ratelist As:** class='px-4 py-2'>Widal (Slide Method) (₹class='px-4 py-2'>100)

---

### Test #151: Widal Test (Slide Method) 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210701`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Salmonella Typhi &#39;O&#39; | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Salmonella Typhi &#39;H&#39; | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Salmonella Typhi &#39;AH&#39; | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Salmonella Typhi &#39;BH&#39; | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Result | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Note: 1. Titres &ge;1:80 of &ldquo;O&rdquo; antigen &amp; &ge;1:160 of &ldquo;H&rdquo; antigen for Salmonella typhi and titres &ge;1:80 of &ldquo;H&rdquo; antigen for Salmonella paratyphi A &amp; B are significant. 2. Reactive results indicate ongoing or recent infection by Salmonella species and it will vary with stage of the disease with appearance in 1st week to increase in titres till end of 4th week post which it starts decreasing. 3. False positive - Past enteric infection during unrelated fevers like Malaria, Influenzae etc. in the form of transient rise in H antibody in Widal test. 4. False negative - Sample collected early in the course of disease (1st week) and immunosuppression. Uses of widal test 1. To diagnose infection due to Salmonella species (Enteric fever). 2. To monitor ...

- **Available in Ratelist As:** class='px-4 py-2'>Widal Test (Slide Method) (₹class='px-4 py-2'>100)

---

### Test #152: Malaria Antigen 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210608`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Malaria antigen detection-whole blood Four species of the plasmodium parasites are responsible for human malaria infections: P. falciparum, P. vivax, P. ovale and P. malariae. Early detection and differentiation of malaria is of paramount importance due to incidence of cerebral malaria and drug resistance associated with P. falciparum malaria causing most of the morbidity and mortality worldwide. Test Utility The current test is a qualitative test for detection of the P. falciparum specific histidine rich protein-2 (Pf. HRP-2) and P. vivax specific lactate dehydrogenase (pLDH) in whole blood samples. The assay is able to detect and distinguish P. vivax and P. falciparum infections and also identify mixed infections. Notes &amp; Limitations The test detects P. falciparum specific HRP-2 and ...

- **Available in Ratelist As:** class='px-4 py-2'>Malaria Antigen (₹class='px-4 py-2'>100), class='px-4 py-2'>Fever package (₹class='px-4 py-2'>100)

---

### Test #153: HIV (Card Test) 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210609`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HIV - 1 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| HIV - 2 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Rapid card tests are screening tests, false positive and false negative results may occur due to various factors which may influence test results. Advise: Kindly confirm by ELISA or Western blot method. 1. A negative result implies that no Anti HIV &ndash; 1 &amp; HIV - 2 antibodies have been detected in the sample by this method. This means that either the patient has not been exposed to HIV-1 or HIV-2 infection or the sample has been tested during the &ldquo;WINDOW PHASE&rdquo; (before the development of detectable levels of antibodies). 2. A positive result suggests the possibilities of HIV-I and/or HIV-II infection. However, these results must be verified by a confirmatory test (IFA / WESTERN BLOT I-II) before pronouncing the patient positive for HIV-1 and/or HIV-2 infection. ALL react...

- **Utilized in Panels:** class='px-4 py-2'> Viral Marker
- **Available in Ratelist As:** class='px-4 py-2'>HIV (Card Test) (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #154: Hepatitis C Virus, HCV (HCV)
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210610`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Hepatitis C Virus, HCV | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Comment Interpretation Non-reactive Absence of antibodies to the Hepatitis C virus Reactive Presence of antibodies to Hepatitis C virus 1. Reactive test result indicates the presence of Hepatitis C virus infection. Active infection to be confirmed by HCV RNA PCR test. It cannot differentiate between the stages of Hepatitis C viral infection nor used to monitor the efficacy of treatment. 2. Non-Reactive test result indicates Hepatitis C virus infection is unlikely. 3. False positive results may be observed in patients receiving mouse monoclonal antibodies, on heparin therapy, on biotin supplements for diagnosis or therapy or presence of heterophilic antibodies in serum. 4. False negative reaction may be due to processing of sample collected early in the course of disease, Prozone phenomenon...

- **Utilized in Panels:** class='px-4 py-2'> Viral Marker
- **Available in Ratelist As:** class='px-4 py-2'>HCV (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #155: VDRL 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210612`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| VDRL | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Result Remarks Reactive Indicates the presence of IgM &amp; IgG antibodies against non-treponemal antigens Non-Reactive Indicates absence of IgM &amp; IgG antibodies against non-treponemal antigens Note : 1. Titers of &ge;1: 8 and rising titres are significant. 2. Positive result indicates ongoing or recent infection and the diagnosis should be confirmed by specific Treponemal tests such as TPHA &amp; FTA- AbS. 3. The reactivity will vary with the Primary (60-86%), Secondary (99%) and Tertiary (98%) stage of Syphilis. 4. False positive results may be observed in patients of Malaria, Hepatitis, Mumps, Leprosy, Infectious Mononucleosis, Rheumatoid Arthritis and Collagen disease. 5. False negative reaction may be due to processing of sample collected early in the course of disease, immunosupp...

- **Utilized in Panels:** class='px-4 py-2'> Viral Marker
- **Available in Ratelist As:** class='px-4 py-2'>VDRL (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100)

---

### Test #156: HBsAg 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210613`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HBsAg | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Comment Interpretation Non- Reactive Hepatitis B surface antigen absent Reactive Hepatitis B surface antigen present Presence of Hepatitis B antigen indicates reactive result which monitors HBAg levels during the disease but cannot predict the stages of disease. Rapid card tests are screening tests, false positive and false negative results may occur due to various factors which may influence test results. Test Utility: HbsAg is the first serologic marker appearing in the serum 6-16 weeks following hepatitis B viral infection. In a typical HBV infection, HBsAg will be detected 2-4 weeks before the liver enzyme levels (ALT) become abnormal and 3-5 weeks before the patient develops jaundice. In acute cases, HbsAg usually disappears 1-2 months after the onset of symptoms. Persistence of HBsAg...

- **Utilized in Panels:** class='px-4 py-2'> Viral Marker
- **Available in Ratelist As:** class='px-4 py-2'>HBsAg (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #157: Occult Blood, Stool 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210614`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Occult Blood, Stool | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Positive in: 1. Upper GI disease (peptic ulcer, gastritis, variceal bleeding, esophageal and gastric cancer) 2. Lower GI disease (diverticulosis, colonic polyps, colorectal cancer, inflammatory bowel disease, vascular ectasias, hemorrhoids). Comments Although fecal occult blood testing is an accepted screening test for colorectal cancer, the sensitivity and specificity of an individual test are low. The usefulness of fecal occult blood testing after digital rectal examination is low. Quantitative fecal immunochemical test (FIT) is superior to gFOBT because there are no dietary and drug restrictions and it is more amenable to standardization and quality control. Note To avoid false negatives, patients should avoid taking vitamin C.

- **Available in Ratelist As:** class='px-4 py-2'>Occult Blood, Stool (₹class='px-4 py-2'>100)

---

### Test #158: Typhidot Antibodies 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210615`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> TYPHIDOT is a Dot EIA assay designed for the qualitative detection of specific IgM and IgG antibodies against a specific outer membrane antigen of Salmonella typhi1 in human serum. It is intended to be used as an in vitro diagnostic of typhoid fever. The results obtained should not be the sole determinant for clinical decisions. RESULTS CLINICAL INTERPRETATION IgM positive; IgG negative Acute Typhoid Fever IgM and IgG positive Acute Typhoid Fever ( in the middle stage of infection) IgM negative; IgG positive Implications for the presence of IgG antibodies may be due to 1. Current Infection 2. Previous Infection 3. Relapse or reinfection IgM and IgG negative Probably not typhoid

- **Available in Ratelist As:** class='px-4 py-2'>Typhidot Antibodies (₹class='px-4 py-2'>100), class='px-4 py-2'>Fever package (₹class='px-4 py-2'>100)

---

### Test #159: Rubella 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210617`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| IgG | - | Any (Min: 0d, Max: Adultd) | **&lt; 8.00** | - to - |
| IgM | - | Any (Min: 0d, Max: Adultd) | **&lt; 8.00** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Rubella (German measles) is a viral infection that causes fever, malaise, coryza, lymphadenopathy, fine maculopapular rash, and congenital birth defects when infection occurs in utero. Antibodies to rubella can be detected by hemagglutination inhibition, complement fixation, indirect hemagglutination, enzyme-linked immunosorbent assay (ELISA), or latex agglutination. Tests can detect IgG and IgM antibodies. Titers usually appear as rash fades(1 week) and peak at 10&ndash;14 days for hemagglutination inhibition and 2&ndash;3 weeks for other techniques. Baseline titers may remain elevated for life. Serologic tests are used to determine the immune status of the individual, to diagnose postnatal rubella, and occasionally to support the diagnosis of rubella. IgM antibody disap...

- **Available in Ratelist As:** class='px-4 py-2'>Rubella (₹class='px-4 py-2'>100)

---

### Test #160: Chikungunya 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210618`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Chikungunya | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Positive Indicates the presence of IgM antibodies against the Chikungunya virus. Negative Indicates absence of IgM antibodies against Chikungunya virus. Note: 1. Positive results in serum indicate ongoing or recent infection by Chikungunya virus causing rash, fever, and severe joint pain (arthralgia). The test cannot be used to differentiate between primary and secondary infection. 2. Negative results are seen in the absence of Chikungunya virus infection. However, it does not rule out the disease. 3. False positive results may be seen due to cross-reactivity with other mosquito-borne diseases like Dengue and Zika Virus infections, in patients with high levels of heterophile antibodies and Rheumatoid factor. 4. False-negative results may be due to processing of samples collected early in t...

- **Available in Ratelist As:** class='px-4 py-2'>Chikungunya (₹class='px-4 py-2'>100)

---

### Test #161: Antistreptolysin O, ASO Titer (ASO Titer)
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210619`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Antistreptolysin O, ASO Titer  | - | Any (Min: 0d, Max: Adultd) | **&lt; 150** | - to - |
| Antistreptolysin O, ASO Titer  | - | Any (Min: 0d, Max: Adultd) | **&lt; 200** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis Detects the presence of antibody to the antigen streptolysin O produced by group A streptococci. Streptococcal antibodies appear about 2 weeks after infection. Titer rises to a peak at 4&ndash;6 weeks and may remain elevated for 6 months to 1 year. Test is based on the neutralization of hemolytic activity of streptolysin O toxin by antistreptolysin O antibodies in serum. Interpretation Increased in: Recent infection with group A &beta;-hemolytic streptococci: scarlet fever, erysipelas, streptococcal pharyngitis/tonsillitis (40&ndash;50%), rheumatic fever (80&ndash;85%), poststreptococcal glomerulonephritis. Some collagen vascular diseases, certain serum lipoproteins, bacterial growth products, or oxidized streptolysin O may result in inhibition of hemolysis and thus cau...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile
- **Available in Ratelist As:** class='px-4 py-2'>ASO Titer (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100)

---

### Test #162: Rheumatoid Factor, RA (Quantitative) (RA (Quantitative))
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210620`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Rheumatoid Factor, RA (Quantitative) | - | Any (Min: 0d, Max: Adultd) | **0 - 20** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis Rheumatoid factor (RF) consists of heterogeneous autoantibodies usually of the IgM class that react against the Fc region of human IgG. Most methods detect only IgM-class RF. Interpretation Positive in: Rheumatoid arthritis (75&ndash;90%), Sjögren syndrome (80&ndash;90%), scleroderma, dermatomyositis, SLE (30%), sarcoidosis, Waldenström macroglobulinemia, chronic infection. Drugs: methyldopa, others. Low-titers of RF (eg, &le;1:80) are questionable and can be found in healthy older patients (20%), in 1&ndash;4% of normal individuals, and in a variety of acute immune responses (eg, viral infections, including infectious mononucleosis and viral hepatitis), chronic bacterial infections (tuberculosis, leprosy, subacute infective endocarditis), and chronic active hepatitis. ...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile
- **Available in Ratelist As:** class='px-4 py-2'>RA (Quantitative) (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #163: Rheumatoid Factor, RA (Qualitative) (RA (Qualitative))
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210621`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Rheumatoid Factor, RA (Qualitative) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>RA (Qualitative) (₹class='px-4 py-2'>100)

---

### Test #164: C-Reactive Protein, CRP (Quantitative) (CRP (Quantitative))
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210622`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| C-Reactive Protein, CRP (Quantitative) | - | Any (Min: 0d, Max: Adultd) | **&lt; 6 mg/L** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation - Produced in the liver and migrates in Y region, where it can produce a small pseudo paraprotein. - A marker of systemic inflammation - High Sensitivity CRP (hs CRP) assay may indicate cardiovascular risk - Seasonal variations with highest levels in winter. Note: 1. CRP is an acute phase reactant which is used in inflammatory disorders for monitoring course and effect of therapy. 2. It is most useful as an indicator of activity in Rheumatoid arthritis, Rheumatic fever, tissue injury or necrosis and infections 3. As compared to ESR, CRP shows an earlier rise in inflammatory disorders which begins in 4-6 hrs, the intensity of the rise being higher than ESR and the recovery being earlier than ESR. 4. Unlike ESR, CRP levels are not influenced by hematologic conditions like Anem...

- **Utilized in Panels:** class='px-4 py-2'> Arthritis Profile
- **Available in Ratelist As:** class='px-4 py-2'>CRP (Quantitative) (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #165: C-Reactive Protein, CRP (Qualitative) (CRP (Qualitative))
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210616`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| C-Reactive Protein, CRP (Qualitative) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation - Produced in the liver and migrates in Y region, where it can produce a small pseudo paraprotein. - A marker of systemic inflammation - High Sensitivity CRP (hs CRP) assay may indicate cardiovascular risk - Seasonal variations with highest levels in winter. Note: 1. CRP is an acute phase reactant which is used in inflammatory disorders for monitoring course and effect of therapy. 2. It is most useful as an indicator of activity in Rheumatoid arthritis, Rheumatic fever, tissue injury or necrosis and infections 3. As compared to ESR, CRP shows an earlier rise in inflammatory disorders which begins in 4-6 hrs, the intensity of the rise being higher than ESR and the recovery being earlier than ESR. 4. Unlike ESR, CRP levels are not influenced by hematologic conditions like Anem...

- **Available in Ratelist As:** class='px-4 py-2'>CRP (Qualitative) (₹class='px-4 py-2'>100)

---

### Test #166: Dengue NS1 Antigen 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210623`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Dengue NS1 Antigen | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Dengue virus, transmitted by Aedes mosquitoes, belongs to the Flavivirus genus and has four serotypes: DEN-1, DEN-2, DEN-3, and DEN-4. Immunity from one serotype is lifelong but does not protect against the others. Dengue infection ranges from mild fever to severe, potentially fatal hemorrhagic disease. The WHO classifies dengue infections as primary or secondary. Secondary infections with different serotypes carry a higher risk of complications such as Dengue Hemorrhagic Fever (DHF) and Dengue Shock Syndrome (DSS). Test Utility Dengue NS1 antigen can be detected in serum from day 1 to day 9 after symptoms begin. Dengue-specific IgM antibodies appear as early as 5 days after fever starts and usually last 30-90 days, though they can occasionally be detectable for up to 8 months. IgM is also...

- **Available in Ratelist As:** class='px-4 py-2'>Dengue NS1 Antigen (₹class='px-4 py-2'>100)

---

### Test #167: Dengue (Card Method) 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210624`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| NS1 Antigen | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Dengue (Card Method) (₹class='px-4 py-2'>100), class='px-4 py-2'>Fever package (₹class='px-4 py-2'>100)

---

### Test #168: Beta Human Chorionic Gonodotropin (HCG) (Beta hCG)
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210625`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Beta Human Chorionic Gonodotropin (HCG) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis: Human chorionic gonadotropin (hCG) is a glycoprotein made up of two subunits (&alpha; and &beta;). Serum hCG can be detected as early as 24 hours after implantation at a concentration of 5 mIU/mL. During normal pregnancy, serum levels double every 2&ndash;3 days and are 50&ndash;100 mIU/mL at the time of the first missed menstrual period. Peak levels are reached 60&ndash;80 days after the last menstrual period (LMP) (30,000&ndash;100,000 mIU/mL), and levels then decrease to a plateau of 5,000&ndash;10,000 mIU/mL at about 120 days after LMP and persist until delivery. Interpretation: Increased in : Pregnancy (including ectopic pregnancy), hyperemesis gravidarum, trophoblastic tumors (hydatidiform mole, choriocarcinoma), some germ cell tumors (teratomas, seminoma), ectop...

- **Available in Ratelist As:** class='px-4 py-2'>Beta hCG (₹class='px-4 py-2'>100)

---

### Test #169: Free PSA 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210626`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Free PSA | - | Male (Min: 0d, Max: Adultd) | **&lt; 1.5 ng/mL** | - to - |
| Free PSA | - | Female (Min: 0d, Max: Adultd) | **&lt; 0.1 ng/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Free PSA (₹class='px-4 py-2'>100)

---

### Test #170: IgA (Urine) 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210627`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| IgA (Urine) | - | Any (Min: 0d, Max: Adultd) | **&lt; 6.0 μg/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>IgA (Urine) (₹class='px-4 py-2'>100)

---

### Test #171: Total PSA 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210628`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Total PSA | - | Male (Min: 0d, Max: Adultd) | **&lt; 4 ng/mL** | - to - |
| Total PSA | - | Female (Min: 0d, Max: Adultd) | **&lt; 0.5 ng/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis PSA is a glycoprotein produced by cells of the prostatic ductal epithelium and is present in the serum of all men. It is absent from the serum of women. Interpretation Increased in: Prostate carcinoma (sensitivity ~20%; specificity ~60&ndash;70% at a 4.0 ng/mL cutoff), biochemical recurrence after localized treatment, benign prostatic hypertrophy (BPH), prostatitis. Decreased in: Metastatic prostate carcinoma treated with antiandrogen therapy, postprostatectomy, 5&alpha;-reductase inhibitor therapy. Comments PSA is used both for the early detection of prostate cancer and as a tumor marker to assess response and monitor recurrence of treated prostate cancer. There is still no consensus on whether PSA measurement should be used as a screening test for early detection of p...

- **Available in Ratelist As:** class='px-4 py-2'>Total PSA (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #172: Anti-HBc 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210629`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HBc  | - | Any (Min: 0d, Max: Adultd) | **&lt; 100 index/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HBc (₹class='px-4 py-2'>100)

---

### Test #173: Anti-HBs 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210630`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HBs | - | Any (Min: 0d, Max: Adultd) | **&lt; 10 mIU/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HBs (₹class='px-4 py-2'>100)

---

### Test #174: Anti-HBe 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210631`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HBe | - | Any (Min: 0d, Max: Adultd) | **&lt; 100 index/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HBe (₹class='px-4 py-2'>100)

---

### Test #175: HBeAg 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210632`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HBeAg | - | Any (Min: 0d, Max: Adultd) | **&lt; 15 index/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis HBeAg is a soluble protein secreted by HBV, related to HBcAg, indicating viral replication and infectivity. Two distinct serologic types of hepatitis B have been described, one with a positive HbeAg, and the other with a negative HBeAg and a positive anti-HBe antibody. Interpretation Increased (positive) in: HBV (acute, chronic) hepatitis. Comments The assumption has been that loss of HBeAg and accumulation of HBeAb are associated with decreased infectivity. Testing has proved unreliable, and tests are not routinely needed as indicators of infectivity. All patients positive for HBeAg must be considered infectious.

- **Available in Ratelist As:** class='px-4 py-2'>HBeAg (₹class='px-4 py-2'>100)

---

### Test #176: Anti-HAV 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210633`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HAV  | - | Any (Min: 0d, Max: Adultd) | **&lt; 20 mIU/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HAV (₹class='px-4 py-2'>100)

---

### Test #177: HAV IgM 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210634`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HAV IgM | - | Any (Min: 0d, Max: Adultd) | **&lt; 2 AU/mL** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>HAV IgM (₹class='px-4 py-2'>100)

---

### Test #178: Anti Nuclear Antibody (ANA) by ELISA 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210637`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti Nuclear Antibody (ANA) by ELISA | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Heterogeneous antibodies to nuclear antigens (DNA and RNA, histone, and nonhistone proteins). Nuclear antibody is measured in serum by layering the patient&rsquo;s serum over human epithelial cells and detecting the antibody with fluorescein conjugated polyvalent antihuman immunoglobulin. Enzyme-linked immunosorbent assay (ELISA) is also available for ANA detection, but has lower sensitivity for systemic lupus erythematosus (SLE) compared with immunofluorescence assay(IFA). Interpretation Elevated in: Patients over age 65 (35&ndash;75%, usually in low titers), SLE (98%), drug- induced lupus (100%), Sjögren syndrome (80%), rheumatoid arthritis (30&ndash;50%), scleroderma (60%), mixed connective tissue disease (100%), Felty syndrome, mononucleosis, hepatic or biliary cir...

- **Available in Ratelist As:** class='px-4 py-2'>Anti Nuclear Antibody (ANA) by ELISA (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #179: Insulin Random 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210638`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Insulin Random | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Note 1. A single random blood sample for insulin may not be sufficient because insulin levels and blood glucose can vary widely over time. 2. Insulin secretion can be stimulated by various factors, including high blood glucose, glucagon, amino acids, growth hormone, and catecholamines. 3. Insulin assay results can be affected by insulin antibodies that develop in patients receiving bovine or porcine insulin treatments. Clinical Utility &middot; Evaluation of fasting hypoglycemia &middot; Evaluation of Polycystic Ovary syndrome &middot; Classification of Diabetes mellitus &middot; Predict Diabetes mellitus &middot; Assessment of Beta cell activity &middot; Select optimal therapy for Diabetes &middot; Investigation of insulin resistance &middot; Predict the development of Coronary Artery Dis...

- **Available in Ratelist As:** class='px-4 py-2'>Insulin Random (₹class='px-4 py-2'>100)

---

### Test #180: Testosterone Free 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210639`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Testosterone Free | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Clinical Use 1. As a secondary test to investigate alterations in physiologically active testosterone levels. 2. To evaluate androgen status in cases with suspected or established abnormalities in sex hormone-binding globulin (SHBG). 3. To assess functional serum testosterone levels in early pubertal males and older adult men. 4. To measure functional circulating testosterone in females presenting with symptoms or signs of hyperandrogenism despite having normal total testosterone concentrations. Comments Testosterone circulates in the blood bound to three proteins: sex hormone-binding globulin (SHBG) (60-80%), albumin, and cortisol-binding globulin. Approximately 1-2% of circulating testosterone remains unbound or free. Measuring free testosterone provides an estimate of the biologically a...

- **Available in Ratelist As:** class='px-4 py-2'>Testosterone Free (₹class='px-4 py-2'>100)

---

### Test #181: Testosterone Total 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210640`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Testosterone Total | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis Testosterone is the principal male sex hormone, produced by the Leydig cells of the testes. Dehydroepiandrosterone (DHEA) is produced in the adrenal cortex, testes, and ovaries and is the main precursor for serum testosterone in women. In normal males after puberty, the testosterone level is twice as high as all androgens in females. In serum, it is largely bound to albumin (38%) and to a specific steroid hormone-binding globulin (SHBG) (60%), but it is the free hormone (2%) that is physiologically active. The total testosterone level measures both bound and free testosterone in the serum (by immunoassay). Free or bioavailable testosterone may be calculated or measured. Interpretation Increased in : Idiopathic sexual precocity (in boys, levels may be in adult range), ad...

- **Available in Ratelist As:** class='px-4 py-2'>Testosterone Total (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #182: Progesterone 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210641`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Progesterone | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Menstrual Cycle Phase: 1. Follicular Phase (Early): Serum progesterone levels are typically low (&lt;1 ng/mL), as progesterone is produced in significant amounts only after ovulation. 2. Luteal Phase (Mid to Late): Progesterone levels rise significantly, usually ranging from 5 to 20 ng/mL. This increase is due to the secretion of progesterone by the corpus luteum, which supports the uterine lining for potential implantation. 3. Postmenopausal Women: Progesterone levels are generally low (&lt;1 ng/mL) due to the cessation of ovarian function. Pregnancy: First Trimester: Progesterone levels increase substantially, often ranging from 11 to 44 ng/mL, to support the early stages of pregnancy and maintain the uterine lining. Second and Third Trimester: Progesterone levels continue to rise, often...

- **Utilized in Panels:** class='px-4 py-2'> Pcod
- **Available in Ratelist As:** class='px-4 py-2'>Progesterone (₹class='px-4 py-2'>100)

---

### Test #183: Myoglobin 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210635`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Myoglobin | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Comments Myoglobin is a protein found in heart and skeletal muscle. It leaks into the blood when muscle cells are damaged. It&rsquo;s useful for detecting heart attacks, early re-infarctions, and successful treatment. Myoglobin levels rise about 2 hours after a heart attack, peak in 4-12 hours, and return to normal within 24 hours. Since myoglobin is cleared by the kidneys, any changes in kidney function can affect its levels. Clinical Use To rule out a heart attack, if myoglobin levels don&rsquo;t change in several samples taken 2-6 hours after chest pain starts, it almost certainly means there&rsquo;s no heart muscle damage.

- **Available in Ratelist As:** class='px-4 py-2'>Myoglobin (₹class='px-4 py-2'>100), class='px-4 py-2'>Cardiac package (₹class='px-4 py-2'>100)

---

### Test #184: Beta 2 Glycoprotein 1, IgG 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210642`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Beta 2 Glycoprotein 1, IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> 2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments This test checks for IgG antibodies to Beta-2 glycoprotein. Finding these antibodies can indicate a risk of blood clots in arteries and veins, as well as a higher chance of repeated miscarriages. The new International classification criteria for APS include Beta-2 glycoprotein for 2 key reasons namely: 1. Be...

- **Available in Ratelist As:** class='px-4 py-2'>Beta 2 Glycoprotein 1, IgG (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #185: Beta 2 Glycoprotein 1, IgM 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210643`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Beta 2 Glycoprotein 1, IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> 2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments This test checks for IgG antibodies to Beta-2 glycoprotein. Finding these antibodies can indicate a risk of blood clots in arteries and veins, as well as a higher chance of repeated miscarriages. The new International classification criteria for APS include Beta-2 glycoprotein for 2 key reasons namely: 1. Be...

- **Available in Ratelist As:** class='px-4 py-2'>Beta 2 Glycoprotein 1, IgM (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #186: Anti Phospholipid IgG 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210644`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti Phospholipid IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> 2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments A phospholipid antibody test measures the levels of autoantibodies against cardiolipin, phosphatidylserine, phosphatidylinositol, and phosphatidic acid. It helps diagnose an increased risk of blood clots in patients with systemic lupus erythematosus (20-35% of cases) and other similar disorders. This test is...

- **Available in Ratelist As:** class='px-4 py-2'>Anti Phospholipid IgG (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #187: Anti Phospholipid IgM 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210645`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti Phospholipid IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> 2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments A phospholipid antibody test measures the levels of autoantibodies against cardiolipin, phosphatidylserine, phosphatidylinositol, and phosphatidic acid. It helps diagnose an increased risk of blood clots in patients with systemic lupus erythematosus (20-35% of cases) and other similar disorders. This test is...

- **Available in Ratelist As:** class='px-4 py-2'>Anti Phospholipid IgM (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #188: Anti Cardiolipin IgG 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210646`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti Cardiolipin IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> RESULT IN GPL REMARKS &lt;15 Negative 15-20 Equivocal 20-80 Low Positive &gt;80 High Positive Comments ACA is a type of antiphospholipid antibody. Diagnostic Importance: ACA are significant in diagnosing - 1. Venous or arterial thrombosis 2. Thrombocytopenia 3. Livedo Reticularis 4. Recurrent miscarriages 5. Neurological symptoms Other Associations : Elevated ACA levels can also be linked to cardiovascular insufficiency and myocardial infarction.

- **Available in Ratelist As:** class='px-4 py-2'>Anti Cardiolipin IgG (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #189: Anti Cardiolipin IgM 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210647`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti Cardiolipin IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> RESULT IN GPL REMARKS &lt;15 Negative 15-20 Equivocal 20-80 Low Positive &gt;80 High Positive Comments ACA is a type of antiphospholipid antibody. Diagnostic Importance: ACA are significant in diagnosing - 1. Venous or arterial thrombosis 2. Thrombocytopenia 3. Livedo Reticularis 4. Recurrent miscarriages 5. Neurological symptoms Other Associations : Elevated ACA levels can also be linked to cardiovascular insufficiency and myocardial infarction.

- **Available in Ratelist As:** class='px-4 py-2'>Anti Cardiolipin IgM (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100)

---

### Test #190: WEIL FELIX TEST, SERUM 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210648`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Proteus Antigen OX 19 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Proteus Antigen OX 2 | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Proteus Antigen OX K | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>WEIL FELIX TEST, SERUM (₹class='px-4 py-2'>100)

---

### Test #191: Dengue IgG 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210649`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Dengue IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Dengue IgG (₹class='px-4 py-2'>100)

---

### Test #192: Dengue IgM 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210650`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Dengue IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Dengue IgM (₹class='px-4 py-2'>100)

---

### Test #193: Dengue IgG &amp; IgM 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210651`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Dengue IgG &amp; IgM (₹class='px-4 py-2'>100)

---

### Test #194: Serum Cortisol 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210706`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Cortisol | - | Any (Min: 0d, Max: Adultd) | **5.27 - 22.45** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Serum Cortisol (₹class='px-4 py-2'>100)

---

### Test #195: Scrub Typhus 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210707`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Scrub Typhus (₹class='px-4 py-2'>100)

---

### Test #196: TB GOLD, Interferon Gamma Release Assay 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210709`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Gamma Interferon, Antigen tube | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Gamma Interferon, Nil tube | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Final Result | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Main Result (TB Antigen Response) Interferon-Gamma Value (IU/mL) Result Interpretation &lt; 0.20 Negative Clearly normal; TB infection unlikely 0.20 &ndash; 0.34 Borderline Negative Usually considered negative; may repeat if high risk &ge; 0.35 Positive Suggests TB infection (latent or active) &ge; 1.00 Strong Positive Higher immune response; TB infection likely Control Tube Values (Quality Checks) Tube Expected / Normal Value What It Means Nil (baseline) Low (usually &lt; 8.0 IU/mL) High value may invalidate the test Mitogen (positive control) &ge; 0.5 IU/mL Confirms immune system response TB Antigen &ndash; Nil Used for final result Determines positive vs negative Overall Test Interpretation Final Result Meaning Negative TB infection unlikely Positive TB infection present (latent or acti...

- **Available in Ratelist As:** class='px-4 py-2'>TB GOLD, Interferon Gamma Release Assay (₹class='px-4 py-2'>100)

---

### Test #197: Treponema Pallidum Hemagglutination Assay (TPHA)
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210702`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Treponema Pallidum Hemagglutination Assay | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>TPHA (₹class='px-4 py-2'>100)

---

### Test #198: Troponin I Rapid 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210699`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Troponin I Rapid | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Troponin I Rapid (₹class='px-4 py-2'>100)

---

### Test #199: Anti-HAV (Hepatitis A Virus Antibody) 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210700`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HAV IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Anti-HAV IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HAV (Hepatitis A Virus Antibody) (₹class='px-4 py-2'>100)

---

### Test #200: Anti-HAV IgM Qualitative 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210712`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HAV IgM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HAV IgM (₹class='px-4 py-2'>100)

---

### Test #201: Anti-HAV IgG Qualitative 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210711`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Anti-HAV IgG | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Anti-HAV IgG (₹class='px-4 py-2'>100)

---

### Test #202: LEISHMANIA rK-39 ANTIBODY, SERUM (KALA AZAR)
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210713`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| LEISHMANIA rK-39 ANTIBODY, SERUM | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation Positive &rarr; Suggestive of Visceral Leishmaniasis (Kala-azar) Negative &rarr; No serological evidence of Kala-azar Clinical correlation required

- **Available in Ratelist As:** class='px-4 py-2'>KALA AZAR (₹class='px-4 py-2'>100)

---

### Test #203: ASO (Anti-Streptolysin O) Qualitative 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210710`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| ASO (Anti-Streptolysin O) Qualitative | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation Positive &rarr; Suggests recent streptococcal infection Negative &rarr; No significant ASO antibodies detected

- **Available in Ratelist As:** class='px-4 py-2'>ASO (Anti-Streptolysin O) Qualitative (₹class='px-4 py-2'>100)

---

### Test #204: HIV ELISA I/II 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210666`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HIV ELISA I/II | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>HIV ELISA I/II (₹class='px-4 py-2'>100)

---

### Test #205: HBsAg ELISA 
- **Category:** Serology &amp; Immunology | **Type:** Single parameter | **ID:** `7210696`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| HBsAg ELISA | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>HBsAg ELISA (₹class='px-4 py-2'>100)

---

### Test #206: HCV RNA Quantitative 
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210478`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| HCV RNA | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>HCV RNA Quantitative (₹class='px-4 py-2'>100)

---

### Test #207: ALLERGY SCREENING TEST 
- **Category:** Serology &amp; Immunology | **Type:** Document | **ID:** `7210514`
- **Available in Ratelist As:** class='px-4 py-2'>ALLERGY SCREENING TEST (₹class='px-4 py-2'>100)

---

### Test #208: Helicobacter pylori Detection (H. Pylori)
- **Category:** Serology &amp; Immunology | **Type:** Multi parameter | **ID:** `7210515`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Results | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>H. Pylori (₹class='px-4 py-2'>100)

---

### Test #209: Urine for creatinine 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210652`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for creatinine | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Urine Protein/Creatinine Ratio (UPCR)
- **Available in Ratelist As:** class='px-4 py-2'>Urine for creatinine (₹class='px-4 py-2'>100)

---

### Test #210: Urine for ELISA (Pregnancy) 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210653`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for ELISA (Pregnency) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine for ELISA (Pregnancy) (₹class='px-4 py-2'>100)

---

### Test #211: Urine for Fungal 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210654`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for Fungal | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine for Fungal (₹class='px-4 py-2'>100)

---

### Test #212: Urine for Ketone 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210655`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for Ketone | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine for Ketone (₹class='px-4 py-2'>100)

---

### Test #213: Urine for Microalbumin 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210656`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for Microalbumin | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis: The normal urinary albumin excretion is less than 30 mg/24 hr. On random spot urine collection, the albumin-to-creatinine ratio (ACR, mcg/mg) should be less than 30. The term microalbuminuria is defined as a subtle increase in the urinary excretion of albumin that cannot be detected by conventional urinalysis. Specifically, the excretion of 30&ndash;300 mg albumin per 24 hours or an ACR of 30&ndash;300 (mcg/mg) is considered microalbuminuria (urine albumin is high). 300 mg or more of albumin excretion per day or an ACR of 300 or higher indicates gross albuminuria (urine albumin very high or nephrotic) range. Interpretation: Increased in: Diabetes mellitus, diabetic nephropathy. Comments: Microalbuminuria is a useful indicator of early nephropathy in diabetic patients. ...

- **Available in Ratelist As:** class='px-4 py-2'>Urine for Microalbumin (₹class='px-4 py-2'>100)

---

### Test #214: Urine for Protein 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210657`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for Protein | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Urine Protein/Creatinine Ratio (UPCR)
- **Available in Ratelist As:** class='px-4 py-2'>Urine for Protein (₹class='px-4 py-2'>100)

---

### Test #215: Urine Pregnancy Test (UPT)
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210658`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Pregnancy Test | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Interpretation 1. If the pregnancy test is taken too early one may get a false negative result very dilute urine specimen may not contain a representative level of HCG, resulting in a negative test too. 2. If pregnancy is still suspected, first morning specimen should be collected 48 hours later and tested. 3. A test result that is weakly positive should be confirmed by retesting with a first-morning urine specimen collected 48 hours later. 4. A number of conditions other than pregnancy, including trophoblastic disease and non-trophoblastic neoplasm cause elevated levels of HCG resulting in a false positive test. 5. The result should be correlated with clinical and ultrasound findings.

- **Available in Ratelist As:** class='px-4 py-2'>UPT (₹class='px-4 py-2'>100)

---

### Test #216: Urine for AFB 24 hours 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210659`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for AFB 24 hours | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine for AFB 24 hours (₹class='px-4 py-2'>100)

---

### Test #217: Urine for Chyle 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210660`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine for Chyle | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine for Chyle (₹class='px-4 py-2'>100)

---

### Test #218: Semen Examination 
- **Category:** Clinical Pathology | **Type:** Multi parameter nested | **ID:** `7210661`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Quantity | - | Any (Min: 0d, Max: Adultd) | **2 - 3** | - to - |
| Colour | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Ph | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Collection At | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Liquefaction Time | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Semen Fructose | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Total Sperm Count | - | Any (Min: 0d, Max: Adultd) | **60 - 200** | - to - |
| Rapid Progressive | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Sluggish Progressive | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Non Progressive | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Immotile | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Abnormal Forms | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Epithelial Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| R.B.C. | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Pus cell | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Method: Semen is collected in a urine container after masturbation following 3 days of abstinence from ejaculation. Specimen must be examined promptly. Physiologic Basis: Conventional semen analysis includes the determination of sperm count, semen volume, sperm motility (qualitative and quantitative), and sperm morphology. In addition to sperm count, sperm morphology and motility may have the most predictive utility. Infertility can be associated with low counts or with sperm of abnormal morphology or decreased motility. Interpretation: Decreased in- Primary or secondary testicular failure, cryptorchidism, following vasectomy, drugs. Comments: A low sperm count should be confirmed by sending two other appropriately collected semen specimens for evaluation. The usefulness of conventional se...

- **Available in Ratelist As:** class='px-4 py-2'>Semen Examination (₹class='px-4 py-2'>100)

---

### Test #219: Urine Sugar Fasting 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210662`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Sugar Fasting | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine Sugar Fasting (₹class='px-4 py-2'>100)

---

### Test #220: Stool Routine Examination 
- **Category:** Clinical Pathology | **Type:** Multi parameter nested | **ID:** `7210663`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Colour | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Consistency | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Mucus | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Blood | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Occult Blood | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Parasites | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Undigested Food Particles | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| OVA | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Cysts | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Pus Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Red Blood Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Macrophages | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Stool Routine Examination (₹class='px-4 py-2'>100)

---

### Test #221: Urine Sugar PP 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210664`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Sugar PP | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine Sugar PP (₹class='px-4 py-2'>100)

---

### Test #222: Urine Sugar Random 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210665`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Sugar Random | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine Sugar Random (₹class='px-4 py-2'>100)

---

### Test #223: Urine Routine Examination 
- **Category:** Clinical Pathology | **Type:** Multi parameter nested | **ID:** `7210670`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Quantity | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Colour | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Transparency | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Specific Gravity | - | Any (Min: 0d, Max: Adultd) | **1.005 - 1.03** | - to - |
| pH | - | Any (Min: 0d, Max: Adultd) | **5 - 7** | - to - |
| Leukocytes | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Blood  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Protein / Albumin | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Sugar / Glucose | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Ketone Bodies | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Bilirubin | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Nitrite | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| R.B.C. | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Pus Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Epithilial Cells | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Casts | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Crystals | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Bacteria | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Others | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Protein : Elevated urinary protein levels can signal early kidney disease but may also rise due to strenuous exercise, orthostatic proteinuria, dehydration, urinary tract infections, or acute illness with fever. Glucose and Ketones : Uncontrolled diabetes mellitus can lead to the presence of glucose in urine. Other causes include pregnancy, hormonal disturbances, liver disease and certain medications. Uncontrolled diabetes mellitus can lead to the presence of ketones in urine. Ketones can also be seen in starvation, frequent vomiting, pregnancy, and strenuous exercise. Blood and Leukocytes : Occult blood can occur in urine as intact erythrocytes or hemoglobin, which can occur in various urological, nephrological, and bleeding disorders. An increase in leukocytes is an indication of inflamm...

- **Available in Ratelist As:** class='px-4 py-2'>Urine Routine Examination (₹class='px-4 py-2'>100), class='px-4 py-2'>Antenatal Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Diabetic package (₹class='px-4 py-2'>100), class='px-4 py-2'>Dialysis package (₹class='px-4 py-2'>100), class='px-4 py-2'>Fever package (₹class='px-4 py-2'>100), class='px-4 py-2'>Fitness Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100), class='px-4 py-2'>Pregnancy Profile (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #224: Fluid Examination 
- **Category:** Clinical Pathology | **Type:** Multi parameter nested | **ID:** `7210671`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type  | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Coagulum | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Volume | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Appearance | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Colour | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| pH (Reaction) | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Protein | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Glucose | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Total Leukocyte Count | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Neutrophils | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Lymphocyte | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| RBCs | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Others | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Fluid Examination (₹class='px-4 py-2'>100), class='px-4 py-2'>Ascitic Fluid Examination (₹class='px-4 py-2'>100), class='px-4 py-2'>CSF Fluid Examination (₹class='px-4 py-2'>100), class='px-4 py-2'>Pleural Fluid Examination (₹class='px-4 py-2'>100)

---

### Test #225: Urine Cotinine (UCT)
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210672`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Cotinine | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>UCT (₹class='px-4 py-2'>100)

---

### Test #226: Urine Cortisol 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210673`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Cortisol | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological Basis: Urinary free cortisol measurement is useful in the initial evaluation of suspected Cushing syndrome. Interpretation Increased in: Cushing syndrome, acute illness, stress. Not increased in: Obesity. Comments Urinary free cortisol is the initial diagnostic test of choice for Cushing syndrome. Not useful for the diagnosis of adrenal insuffi ciency. A shorter (12-hour) overnight collection and measurement of the ratio of urine-free cortisol to urine creatinine appears to perform nearly as well as a 24-hour collection for urine-free cortisol.

- **Available in Ratelist As:** class='px-4 py-2'>Urine Cortisol (₹class='px-4 py-2'>100)

---

### Test #227: Microalbumin, Urine 24 hours 
- **Category:** Clinical Pathology | **Type:** Multi parameter | **ID:** `7210674`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Albumin/Microalbumin in Urine | - | Any (Min: 0d, Max: Adultd) | **&lt;= 30** | - to - |
| Urine volume, Total | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Albumin/Microalbumin by Immunoturbidimetry | - | Any (Min: 0d, Max: Adultd) | **Normal: &lt;30
Microalbuminuria: 30-299
Clinical albuminuria: &gt;300** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Microalbumin, Urine 24 hours (₹class='px-4 py-2'>100)

---

### Test #228: Urine Bile Pigment 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210719`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Bile Pigment | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine Bile Pigment (₹class='px-4 py-2'>100)

---

### Test #229: Urine Bile Salt 
- **Category:** Clinical Pathology | **Type:** Single parameter | **ID:** `7210720`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Urine Bile Salt | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Urine Bile Salt (₹class='px-4 py-2'>100)

---

### Test #230: Urine for Drugs (UDS)
- **Category:** Clinical Pathology | **Type:** Document | **ID:** `7210508`
- **Available in Ratelist As:** class='px-4 py-2'>UDS (₹class='px-4 py-2'>100)

---

### Test #231: FNAC (Fine Needle Aspiration) 
- **Category:** Cytology | **Type:** Document | **ID:** `7210675`
- **Available in Ratelist As:** class='px-4 py-2'>FNAC (Fine Needle Aspiration) (₹class='px-4 py-2'>100)

---

### Test #232: PAP Smear 
- **Category:** Cytology | **Type:** Document | **ID:** `7210676`
- **Available in Ratelist As:** class='px-4 py-2'>PAP Smear (₹class='px-4 py-2'>100)

---

### Test #233: Skin test for Leprosy 
- **Category:** Cytology | **Type:** Single parameter | **ID:** `7210677`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Skin test for Leprosy | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Skin test for Leprosy (₹class='px-4 py-2'>100)

---

### Test #234: Body Fluid 
- **Category:** Cytology | **Type:** Document | **ID:** `7210689`
- **Available in Ratelist As:** class='px-4 py-2'>Body Fluid (₹class='px-4 py-2'>100)

---

### Test #235: Gram&#39;s Stain 
- **Category:** Microbiology | **Type:** Multi parameter | **ID:** `7210678`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Result | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Gram&#39;s Stain (₹class='px-4 py-2'>100)

---

### Test #236: Acid - Fast Bacilli (AFB)
- **Category:** Microbiology | **Type:** Multi parameter | **ID:** `7210679`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Sample Type | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
| Result | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Note: A positive Acid-Fast Bacillus (AFB) smear result provides an initial indication of a Mycobacterial infection. The positivity and grade of the smear suggest the relative bacterial burden and correlate with the clinical presentation of the disease. Conversely, a negative AFB smear may indicate the absence of Mycobacterial infection or that the Mycobacteria are present in insufficient numbers to be detected under the microscope. It does not, however, differentiate between viable and non-viable organisms, nor does it distinguish between different Mycobacterial species. Usage: This test is employed to detect acid-fast bacteria, primarily Mycobacterium tuberculosis, for the purposes of diagnosing and monitoring tuberculosis.

- **Available in Ratelist As:** class='px-4 py-2'>AFB (₹class='px-4 py-2'>100)

---

### Test #237: Skin smear for AFB 
- **Category:** Microbiology | **Type:** Single parameter | **ID:** `7210680`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Skin smear for AFB | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Skin smear for AFB (₹class='px-4 py-2'>100)

---

### Test #238: Fungal scraping smear 
- **Category:** Microbiology | **Type:** Single parameter | **ID:** `7210681`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Fungal scraping smear | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Fungal scraping smear (₹class='px-4 py-2'>100)

---

### Test #239: Culture and Sensitivity 
- **Category:** Microbiology | **Type:** Document | **ID:** `7210682`
- **Available in Ratelist As:** class='px-4 py-2'>Culture and Sensitivity (₹class='px-4 py-2'>100), class='px-4 py-2'>Blood C/S (₹class='px-4 py-2'>100), class='px-4 py-2'>Fluid C/S (₹class='px-4 py-2'>100), class='px-4 py-2'>Stool C/S (₹class='px-4 py-2'>100), class='px-4 py-2'>Swab C/S (₹class='px-4 py-2'>100), class='px-4 py-2'>Throat C/S (₹class='px-4 py-2'>100), class='px-4 py-2'>Urine C/S (₹class='px-4 py-2'>100)

---

### Test #240: Serum Triiodothyronine, T3 (T3)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210683`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum Triiodothyronine, T3 | - | Any (Min: 0d, Max: Adultd) | **0.69 - 2.15** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis T3 is the primary active thyroid hormone. Approximately 80% of T3 is produced by extrathyroidal deiodination of T4 and the rest by thyroid gland. Total T3 is influenced by levels of thyroxine binding proteins. Interpretation Increased in : Hyperthyroidism (some) Increased thyroid binding globulin. Decreased in : Hypothyroidism, nonthyroidal illness, decreased thyroid binding globulin. Drugs: Amiodarone. Comments T3 may be increased in approximately 5% of hyperthyroid patients in whom free T4 is normal (T3 toxicosis). Therefore, the test is indicated when hyperthyroidism is suspected and free T4 value is normal. Test is of no value in the diagnosis and treatment of primary hypothyroidism.

- **Utilized in Panels:** class='px-4 py-2'> Thyroid Function Test (TFT)
- **Available in Ratelist As:** class='px-4 py-2'>T3 (₹class='px-4 py-2'>100)

---

### Test #241: Serum thyroxine, T4 (T4)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210684`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Serum thyroxine, T4 | - | Any (Min: 0d, Max: Adultd) | **52 - 127** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Thyroid Function Test (TFT), class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>T4 (₹class='px-4 py-2'>100)

---

### Test #242: Thyroid-Stimulating Hormone, TSH (TSH)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210685`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Thyroid-Stimulating Hormone, TSH | - | Any (Min: 0d, Max: Adultd) | **0.3 - 4.5** | - to - |

**Clinical Interpretation & Significance:**
> Physiologic Basis TSH is an anterior pituitary hormone that stimulates the thyroid gland to produce thyroid hormones. Secretion is stimulated by thyrotropin releasing hormone from the hypothalamus. There is negative feedback on TSH secretion by circulating thyroid hormone. Interpretation Increased in : Hypothyroidism, mild increases in recovery phase of acute illness, subclinical hypothyroidism. Decreased in : Hyperthyroidism, subclinical hyperthyroidism, acute medical or surgical illness (euthyroid sick syndrome), pituitary hypothyroidism. Drugs: dopamine, high-dose corticosteroids. Comments TSH assays are used for screening thyroid function, aiding the diagnosis of hyperthyroidism and hypothyroidism, and monitoring thyroid replacement therapy. The currently used TSH immunoassays are very...

- **Utilized in Panels:** class='px-4 py-2'> Free Thyroid Function Test (FTFT), class='px-4 py-2'> Thyroid Function Test (TFT), class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>TSH (₹class='px-4 py-2'>100), class='px-4 py-2'>Antenatal Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Arthritis Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Bad Obstetric History (BOH) Package (₹class='px-4 py-2'>100), class='px-4 py-2'>Preoperative (₹class='px-4 py-2'>100)

---

### Test #243: Free Triiodothyronine l, FT3 (FT3)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210686`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Free Triiodothyronine l, FT3 | - | Any (Min: 0d, Max: Adultd) | **2 - 4.2** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Free Thyroid Function Test (FTFT)
- **Available in Ratelist As:** class='px-4 py-2'>FT3 (₹class='px-4 py-2'>100), class='px-4 py-2'>Thyroid package (₹class='px-4 py-2'>100)

---

### Test #244: Free Thyroxine, FT4 (FT4)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210687`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Free Thyroxine, FT4 | - | Any (Min: 0d, Max: Adultd) | **8.9 - 17.2** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Free Thyroid Function Test (FTFT)
- **Available in Ratelist As:** class='px-4 py-2'>FT4 (₹class='px-4 py-2'>100), class='px-4 py-2'>Thyroid package (₹class='px-4 py-2'>100)

---

### Test #245: Alfa Fetoprotein, AFP (AFP)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210690`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Alfa Fetoprotein, AFP | - | Any (Min: 0d, Max: Adultd) | **&lt; 10** | - to - |

**Clinical Interpretation & Significance:**
> Alpha-fetoprotein (AFP) is a crucial protein found in fetal serum, serving a physiological role akin to that of albumin. It is primarily produced in the yolk sac, the fetal liver, and the fetal gastrointestinal tract. However, shortly after birth, AFP levels drop precipitously, becoming virtually undetectable. In healthy adults, AFP levels are typically below 5.4 ng/mL. While elevated AFP levels can occur in various benign conditions, a level exceeding 500 ng/mL is rarely associated with non-malignant issues. During a normal pregnancy, AFP levels may rise but generally do not exceed 100 ng/mL. Elevated AFP levels are also observed in chronic liver diseases such as cirrhosis and hepatitis. AFP plays a pivotal role in the detection of hepatocellular carcinoma and yolk sac tumors. Additionall...

- **Available in Ratelist As:** class='px-4 py-2'>AFP (₹class='px-4 py-2'>100)

---

### Test #246: Prolactin (PRL)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210691`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Prolactin | - | Female (Min: 0d, Max: Adultd) | **34 - 386** | - to - |
| Prolactin | - | Male (Min: 0d, Max: Adultd) | **&lt; 15 ng/mL** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis: Prolactin is a polypeptide hormone secreted by the anterior pituitary. It functions in the initiation and maintenance of lactation in the postpartum period. PRL secretion is inhibited by hypothalamic secretion of dopamine. Clinical Use : 1.Diagnosis &amp; management of pituitary adenomas 2.Differential diagnosis of male &amp; female hypogonadism. Interpretation Increased in: 1. Physiologic : Sleep, stress, postprandially, pain, coitus 2. Systemic disorders : Chest wall or thoracic spinal cord lesions, Primary / Secondary hypothyroidism, Adrenal insufficiency, Chronic renal failure, Cirrhosis 3. Medications : - Psychiatric medications like Phenothiazine, Haloperidol, Risperidone, Domperidone, Fluoxetine, Amitriptyline, MAO inhibitors etc., - Antihypertensives: Alpha Met...

- **Utilized in Panels:** class='px-4 py-2'> Pcod, class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>PRL (₹class='px-4 py-2'>100), class='px-4 py-2'>Antenatal Package (₹class='px-4 py-2'>100)

---

### Test #247: Luteinising Hormone, LH (LH)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210692`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Luteinising Hormone, LH | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Physiological basis : LH is stimulated by the hypothalamic hormone gonadotropin- releasing hormone (GnRH). It is secreted from the anterior pituitary and acts on the gonads. LH is the principal regulator of steroid biosynthesis in the ovary and testis. Interpretation : Increased in : Primary hypogonadism, polycystic ovary syndrome, postmenopause, endometriosis, after depot leuprolide injection; immunoassay result may be falsely elevated in pregnancy. Decreased in : Pituitary or hypothalamic failure, anorexia nervosa, bulimia, advanced prostate cancer, severe stress, malnutrition, Kallman syndrome (gonadotropin deficiency associated with anosmia). Drugs: digoxin, oral contraceptives, phenothiazines. Comments In male hypogonadism, serum LH and FSH levels can distinguish between primary (hype...

- **Utilized in Panels:** class='px-4 py-2'> Pcod, class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>LH (₹class='px-4 py-2'>100)

---

### Test #248: Follicle Stimulating Hormone, FSH (FSH)
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210693`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
|  Follicle Stimulating Hormone, FSH | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Utilized in Panels:** class='px-4 py-2'> Pcod, class='px-4 py-2'> AMH Panel
- **Available in Ratelist As:** class='px-4 py-2'>FSH (₹class='px-4 py-2'>100)

---

### Test #249: Folic Acid 
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210694`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Folic Acid | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |

**Clinical Interpretation & Significance:**
> Note 1. Drugs like Methotrexate and Leucovorin can affect folate test results. 2. To tell apart vitamin B12 deficiency from folate deficiency, check levels of Methyl malonic acid in urine and Homocysteine in blood. 3. Folic acid has a low risk of toxicity because it's a water-soluble vitamin that&rsquo;s usually excreted in urine. Comments Folate is crucial for making DNA components and for red blood cell maturation. It comes mainly from plants and some organ meats, but cooking can destroy over half of it. Folate deficiency is common in people with alcoholic liver disease, pregnant women, and the elderly. It can result from poor absorption, inadequate diet, high demand (like in pregnancy or cancer), or certain drugs such as Methotrexate and anticonvulsants Interpretation Decreased Levels: ...

- **Available in Ratelist As:** class='px-4 py-2'>Folic Acid (₹class='px-4 py-2'>100), class='px-4 py-2'>Anemia package (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Female) (₹class='px-4 py-2'>100), class='px-4 py-2'>Full body checkup (Male) (₹class='px-4 py-2'>100)

---

### Test #250: Parathyroid Hormone (PTH) 
- **Category:** Endocrinology | **Type:** Single parameter | **ID:** `7210715`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| Parathyroid Hormone (PTH) | - | Any (Min: 0d, Max: Adultd) | **15 - 65** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>Parathyroid Hormone (PTH) (₹class='px-4 py-2'>100)

---

### Test #251: MEDICAL EXAMINATION REPORT 
- **Category:** Miscellaneous | **Type:** Document | **ID:** `7210516`
- **Available in Ratelist As:** class='px-4 py-2'>MEDICAL EXAMINATION REPORT (₹class='px-4 py-2'>100)

---

### Test #252: CEA 
- **Category:** Miscellaneous | **Type:** Single parameter | **ID:** `7210517`

**Parameters & Reference Ranges:**

| Parameter Name | Unit | Gender / Target Group | Normal Reference Range | Lower - Upper |
| :--- | :---: | :---: | :---: | :---: |
| CEA | - | Any (Min: 0d, Max: Adultd) | **-** | - to - |
- **Available in Ratelist As:** class='px-4 py-2'>CEA (₹class='px-4 py-2'>100)

---

### Test #253: Mantoux test 
- **Category:** Miscellaneous | **Type:** Document | **ID:** `7210695`
- **Available in Ratelist As:** class='px-4 py-2'>Mantoux test (₹class='px-4 py-2'>100)

---


## 8. Clinical Interpretations Library (Master Diagnostic Knowledgebase)

#### 1. 25 Hydroxy (OH) Vitamin D
Physiological Basis: The vitamin D system functions to maintain serum calcium levels. Vitamin D is a fat-soluble steroid hormone. Two molecular forms exist: D3 (cholecalciferol), synthesized in the epidermis, and D2 (ergocalciferol), derived from plant sources. To become active, both need to be further metabolized. Two sequential hydroxylations occur: in the liver to 25(OH)D and then, in the kidney, to 1,25[OH] 2 D. Besides consequences for bone health, vitamin D deficiency reportedly is associated with a number of conditions such as cardiovascular disease, autoimmunity and cancer; however, evidence-based cause-and-effect relationships have not been established.&nbsp; Interpretation Increased in : &nbsp; Heavy milk drinkers (up to 64 ng/mL), vitamin D intoxication, sun exposure. Decreased in : &nbsp; Dietary deficiency, malabsorption, rickets, osteomalacia, biliary and portal cirrhosis, nephrotic syndrome, renal failure, inadequate sun exposure, advanced age (&gt; 70), primary hyperparathyroidism. Drugs : Phenytoin, phenobarbital.&nbsp; Comments: Serum or plasma total 25(OH)D is an integrated marker of vitamin D status, incorporating endogenous synthesis from solar exposure, dietary intake, fortified products and/or supplements. There is no universal or strong evidence-based consensus on the appropriate level of 25(OH)D level. However, according to a 2011 US Institute of Medicine Report, a 25(OH)D level of 20–30 ng/mL is all that is needed for bone and general health, and nearly everyone (97.5%) in the general population is in that range. A 25(OH)D level above 30 ng/mL has not been consistently associated with increased health benefits, and, in fact, risks have been identified for outcomes at levels above 50 ng/mL. Routine screening for vitamin D deficiency is not necessary. Patients with the following conditions should be considered for testing: osteoporosis, osteomalacia, malabsorption, liver disease, pancreatic insufficiency, chronic kidney disease, COPD, bariatric surgery, cancer, bedridden or home-bound, obesity, taking anticonvulsants or long-term glucocorticoids, atraumatic fractures, elderly (&gt; 70 years old), and chronic inflammatory conditions. View all

#### 2. Absolute Eosinophil Count
Physiological basis The Absolute Eosinophil Count (AEC) is a measure of the number of eosinophils, a type of white blood cell, in a given volume of blood. The Absolute Eosinophil Count (AEC) is calculated by multiplying the percentage of eosinophils in the total white blood cell count by the total white blood cell count. Interpretation Elevated AEC Low AEC Allergic Reactions Parasitic Infections Autoimmune Diseases Eosinophilia Acute Infections Adrenal Insufficiency Comments The AEC is typically assessed as part of a complete blood count (CBC) with a differential. If your AEC is outside the normal range, it's important to consult with a healthcare provider to determine the underlying cause and appropriate treatment. View all

#### 3. Acid - Fast Bacilli
Note: A positive Acid-Fast Bacillus (AFB) smear result provides an initial indication of a Mycobacterial infection. The positivity and grade of the smear suggest the relative bacterial burden and correlate with the clinical presentation of the disease. Conversely, a negative AFB smear may indicate the absence of Mycobacterial infection or that the Mycobacteria are present in insufficient numbers to be detected under the microscope. It does not, however, differentiate between viable and non-viable organisms, nor does it distinguish between different Mycobacterial species. Usage: This test is employed to detect acid-fast bacteria, primarily Mycobacterium tuberculosis, for the purposes of diagnosing and monitoring tuberculosis. View all

#### 4. Activated partial thromboplastin time, APTT
Physiological basis APTT evaluates the intrinsic and common coagulation pathways and adequacy of all coagulation factors except XIII and VII. APTT is commonly used to monitor unfractionated heparin therapy. Interpretation&nbsp; Increased in: Deficiency of any individual coagulation factor except Factors XIII and VII, presence of nonspecific inhibitor (eg, lupus anticoagulant), specific factor inhibitor, von Willebrand disease (PTT may also be normal), hemophilia A and B, DIC. Drugs: heparin, direct thrombin inhibitor (eg, hirudin, argatroban), warfarin. Decreased in: Hypercoagulable states (eg, increased factor VIII levels). Comments &nbsp; APTT cannot be used to monitor very high doses of heparin (eg, cardiac bypass surgery) because the clotting time is beyond the analytical measurement range of APTT. Heparin contamination is a very common cause of an unexplained prolonged APTT. Heparin neutralization with heparinase may be needed to rule out this possibility. View all

#### 5. Alfa Fetoprotein, AFP
Alpha-fetoprotein (AFP) is a crucial protein found in fetal serum, serving a physiological role akin to that of albumin. It is primarily produced in the yolk sac, the fetal liver, and the fetal gastrointestinal tract. However, shortly after birth, AFP levels drop precipitously, becoming virtually undetectable. In healthy adults, AFP levels are typically below 5.4 ng/mL. While elevated AFP levels can occur in various benign conditions, a level exceeding 500 ng/mL is rarely associated with non-malignant issues. During a normal pregnancy, AFP levels may rise but generally do not exceed 100 ng/mL. Elevated AFP levels are also observed in chronic liver diseases such as cirrhosis and hepatitis. AFP plays a pivotal role in the detection of hepatocellular carcinoma and yolk sac tumors. Additionally, it may be sporadically elevated in other malignancies, including certain hepatoid variants of gastric carcinoma. In the case of yolk sac tumors, the AFP level is closely linked to prognosis, with levels surpassing 10,000 ng/mL indicating a poor outcome. For hepatocellular carcinoma, AFP elevation is reported in approximately 70% of patients, underscoring its significance as a biomarker in the diagnosis and management of liver cancer. View all

#### 6. Anti Cardiolipin IgG
RESULT IN GPL REMARKS &lt;15 Negative 15-20 Equivocal 20-80 Low Positive &gt;80 High Positive Comments ACA is a type of antiphospholipid antibody. Diagnostic Importance: ACA are significant in diagnosing - 1. Venous or arterial thrombosis 2. Thrombocytopenia 3. Livedo Reticularis 4. Recurrent miscarriages 5. Neurological symptoms Other Associations : Elevated ACA levels can also be linked to cardiovascular insufficiency and myocardial infarction. View all

#### 7. Anti Cardiolipin IgM
RESULT IN GPL REMARKS &lt;15 Negative 15-20 Equivocal 20-80 Low Positive &gt;80 High Positive Comments ACA is a type of antiphospholipid antibody. Diagnostic Importance: ACA are significant in diagnosing - 1. Venous or arterial thrombosis 2. Thrombocytopenia 3. Livedo Reticularis 4. Recurrent miscarriages 5. Neurological symptoms Other Associations : Elevated ACA levels can also be linked to cardiovascular insufficiency and myocardial infarction. View all

#### 8. Anti cyclic-citrullinated-peptide
Physiological Basis Post-translational deamination of arginine residues by peptidyl arginine deaminase (citrullination) during inflammation results in production of antigenic epitope. Antibodies to citrullinated proteins (particularly filaggrin) are frequently elevated in rheumatoid arthritis (RA). Interpretation: Increased in- RA (sensitivity 70–80%). Comments: Specificity of anti-CCP (90–95%) for RA is higher than that of rheumatoid factor. View all

#### 9. ANTI MULLERIAN HORMONE
Notes Anti-Müllerian Hormone (AMH) starts to drop several years before Follicle-Stimulating Hormone (FSH) levels increase. Because of this, AMH is a more sensitive indicator of ovarian reserve. Sometimes, AMH levels and Antral Follicle Count (AFC) can give different results. AMH reflects the overall number of early-stage follicles that aren't visible yet, while AFC counts only the follicles that can be seen on an ultrasound. Interpretation AMH LEVEL IN ng/mL Remarks &nbsp;&lt;0.50 &nbsp;Predictive of poor response &nbsp;0.50 - &lt;1.0 &nbsp;Suggestive of limited ovarian reserve &nbsp;1.00 - 3.50 Predictive of optimal response &nbsp;&gt;3.50 Predictive of Ovarian hyperstimulation syndrome / PCOS Comment Antimüllerian Hormone (AMH) is produced by Sertoli cells in males and granulosa cells in females. In males, AMH levels are high in infancy, drop before puberty, and decrease sharply during puberty. In females, AMH is made by small follicles from around 36 weeks of pregnancy until menopause, when levels become very low. AMH is a valuable marker for assessing gender, fertility, and gonadal tumors. It provides a steady measure of ovarian reserve throughout the menstrual cycle. Women with higher AMH levels generally respond better to fertility treatments and produce more eggs. Elevated AMH can also indicate risks such as ovarian hyperstimulation syndrome or conditions like Polycystic Ovary Syndrome (PCOS). Additionally, high AMH levels can be seen in some ovarian tumors. Clinical Applications of AMH: 1. Assess Ovarian Health 2. Check Menopausal Status 3. Evaluate PCOS 4. Examine Infants with Ambiguous Genitalia 5. Testicular Function in Children 6. Diagnose and Monitor Tumors View all

#### 10. Anti Nuclear Antibody (ANA) by ELISA
Physiological basis Heterogeneous antibodies to nuclear antigens (DNA and RNA, histone, and nonhistone proteins). Nuclear antibody is measured in serum by layering the patient’s serum over human epithelial cells and detecting the antibody with fluorescein conjugated polyvalent antihuman immunoglobulin. Enzyme-linked immunosorbent assay (ELISA) is also available for ANA detection, but has lower sensitivity for systemic lupus erythematosus (SLE) compared with immunofluorescence assay(IFA). Interpretation Elevated in: Patients over age 65 (35–75%, usually in low titers), SLE (98%), drug- induced lupus (100%), Sjögren syndrome (80%), rheumatoid arthritis (30–50%), scleroderma (60%), mixed connective tissue disease (100%), Felty syndrome, mononucleosis, hepatic or biliary cirrhosis, hepatitis, leukemia, myasthenia gravis, dermatomyositis, polymyositis, chronic renal failure. Comments A negative ANA test does not completely rule out SLE, but alternative diagnoses should be considered. The pattern of ANA staining may give some clues to diagnosis, but because the pattern also changes with serum dilution, it is not routinely reported. Only the rim (peripheral) pattern is highly specific (for SLE). Not useful as a screening test. Should be used only when there is clinical evidence of a connective tissue disease. View all

#### 11. Anti Phospholipid IgG
2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments A phospholipid antibody test measures the levels of autoantibodies against cardiolipin, phosphatidylserine, phosphatidylinositol, and phosphatidic acid. It helps diagnose an increased risk of blood clots in patients with systemic lupus erythematosus (20-35% of cases) and other similar disorders. This test is also used to diagnose Antiphospholipid syndrome (APS) in patients with recent miscarriage (11-22% in all trimesters), Pulmonary hypertension, Non-vegetative endocarditis, Livedo Reticularis, Stroke at young age and Deep vein thrombosis. View all

#### 12. Anti Phospholipid IgM
2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments A phospholipid antibody test measures the levels of autoantibodies against cardiolipin, phosphatidylserine, phosphatidylinositol, and phosphatidic acid. It helps diagnose an increased risk of blood clots in patients with systemic lupus erythematosus (20-35% of cases) and other similar disorders. This test is also used to diagnose Antiphospholipid syndrome (APS) in patients with recent miscarriage (11-22% in all trimesters), Pulmonary hypertension, Non-vegetative endocarditis, Livedo Reticularis, Stroke at young age and Deep vein thrombosis. View all

#### 13. Antistreptolysin O, ASO Titer
Physiological Basis Detects the presence of antibody to the antigen streptolysin O produced by group A streptococci. Streptococcal antibodies appear about 2 weeks after infection. Titer rises to a peak at 4–6 weeks and may remain elevated for 6 months to 1 year. Test is based on the neutralization of hemolytic activity of streptolysin O toxin by antistreptolysin O antibodies in serum. Interpretation Increased in: Recent infection with group A β-hemolytic streptococci: scarlet fever, erysipelas, streptococcal pharyngitis/tonsillitis (40–50%), rheumatic fever (80–85%), poststreptococcal glomerulonephritis. Some collagen vascular diseases, certain serum lipoproteins, bacterial growth products, or oxidized streptolysin O may result in inhibition of hemolysis and thus cause false-positive results. Comments In patients with rheumatic fever, the test may be a more reliable indicator of recent streptococcal infection than throat culture. An increasing titer is more suggestive of acute streptococcal infection than a single elevated level. Even with severe infection, ASO titers rise in only 70–80% of patients. ASO and anti-DNase-B together increase test sensitivity. The normal range increases with age. View all

#### 14. Anti TPO
Physiological basis TPO is a membrane-bound glycoprotein. This enzyme mediates the oxidation of iodide ions and incorporation of iodine into tyrosine residues of thyroglobulin. Its synthesis is stimulated by thyroid-stimulating hormone (TSH). TPO is the major antigen involved in thyroid antibody-dependent cell-mediated cytotoxicity. TPO Ab can be measured by enzyme-linked immunosorbent assay (ELISA) or automated immunoassay. Interpretation Increased in : Hashimoto thyroiditis (&gt; 99%), Idiopathic myxedema (&gt; 99%), Graves disease (75–85%), Addison disease (50%), and Riedel thyroiditis. Low titers are present in approximately 10% of normal individuals and patients with non-immune thyroid disease. Comments TPO antibody is an antibody to the main autoantigenic component of microsomes and is a more sensitive and specific test than hemagglutination assays for microsomal antibodies in the diagnosis of autoimmune thyroid disease. TPO antibody testing alone is often sufficient to detect autoimmune thyroid disease. TPO antibody titers correlate with TSH levels; their presence may herald impending thyroid failure. View all

#### 15. ASO (Anti-Streptolysin O) Qualitative
Interpretation Positive → Suggests recent streptococcal infection Negative → No significant ASO antibodies detected View all

#### 16. Beta 2 Glycoprotein 1, IgG
2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments This test checks for IgG antibodies to Beta-2 glycoprotein. Finding these antibodies can indicate a risk of blood clots in arteries and veins, as well as a higher chance of repeated miscarriages. The new International classification criteria for APS include Beta-2 glycoprotein for 2 key reasons namely: 1. Beta-2 Glycoprotein antibodies maybe the only antibody present in 10% patients of Antiphospholipid syndrome (APS) 2. Beta-2 Glycoprotein antibodies are highly specific for APS unlike Anticardiolipin antibodies which may be positive in certain infectious diseases Indications · Clinical history suggestive of Arterial or venous thrombosis · History of Recurrent fetal loss /Intrauterine growth restriction/ Premature birth View all

#### 17. Beta 2 Glycoprotein 1, IgM
2006 International Consensus statement on Classification of definite APS CLINICAL CRITERIA LABORATORY CRITERIA Arterial/Venous thrombosis Cardiolipin antibodies (aCL) Fetal Loss Beta 2 Glycoprotein 1 antibodies Premature birth Lupus Anticoagulant (LA) Note: APS is diagnosed if at least one laboratory criterion and one clinical criterion are met. For the laboratory criteria, they need to be observed on two or more separate occasions, with each test done at least 12 weeks apart. Comments This test checks for IgG antibodies to Beta-2 glycoprotein. Finding these antibodies can indicate a risk of blood clots in arteries and veins, as well as a higher chance of repeated miscarriages. The new International classification criteria for APS include Beta-2 glycoprotein for 2 key reasons namely: 1. Beta-2 Glycoprotein antibodies maybe the only antibody present in 10% patients of Antiphospholipid syndrome (APS) 2. Beta-2 Glycoprotein antibodies are highly specific for APS unlike Anticardiolipin antibodies which may be positive in certain infectious diseases Indications · Clinical history suggestive of Arterial or venous thrombosis · History of Recurrent fetal loss /Intrauterine growth restriction/ Premature birth View all

#### 18. Beta Human Chorionic Gonodotropin (HCG)
Physiological Basis: Human chorionic gonadotropin (hCG) is a glycoprotein made up of two subunits (α and β). Serum hCG can be detected as early as 24 hours after implantation at a concentration of 5 mIU/mL. During normal pregnancy, serum levels double every 2–3 days and are 50–100 mIU/mL at the time of the first missed menstrual period. Peak levels are reached 60–80 days after the last menstrual period (LMP) (30,000–100,000 mIU/mL), and levels then decrease to a plateau of 5,000–10,000 mIU/mL at about 120 days after LMP and persist until delivery. Interpretation: Increased in : Pregnancy (including ectopic pregnancy), hyperemesis gravidarum, trophoblastic tumors (hydatidiform mole, choriocarcinoma), some germ cell tumors (teratomas, seminoma), ectopic hCG production by other malignancies. Decreasing Over time : Threatened abortion Comments: Test is positive (&gt;50 mIU/mL) in most pregnant women at the time of or shortly after the first missed menstrual period. Quantitative hCG test detects hCG levels as low as 1.0 mIU/mL. It is preferred for the evaluation of suspected ectopic pregnancy and threatened abortion. In both situations, hCG levels fail to demonstrate the normal early pregnancy increase. Test is also indicated for following the course of trophoblastic and germ cell tumors. &nbsp; View all

#### 19. Blood Group &amp; Rh.
Physiologic Basis The ABO antigen and antibodies remain the most significant for transfusion practice. The 4 blood groups A, B, O, and AB are determined by the presence of antigens A and B or their absence (O) on a patient’s red blood cells. Individuals possess antibodies directed toward the A or B antigen absent from their own red cells. Interpretation Type O patients can receive type O red cells and type A, B, O, or AB plasma. Type A patients can receive type A or O red cells and type A or AB plasma. Type B patients can receive type B or O red cells and type B or AB plasma. Type AB patients can receive type AB, A, B, or O red cells but only type AB plasma.In an emergency situation, type O red cells and type AB plasma may be given to patients with any ABO blood types. Comments For both blood donors and recipients, routine ABO typing includes both red cell and serum testing, as checks on each other. Tube testing is as follows: patient’s red cells are tested with anti-A and anti-B for the presence or absence of agglutination (forward or cell type), and patient’s serum or plasma is tested against known A and B cells (reverse or serum/plasma type). View all

#### 20. Blood Sugar PP
Clinical Notes Elevated glucose levels (hyperglycemia) are most often encountered clinically in the setting of diabetes mellitus, but they may also occur with pancreatic neoplasms, hyperthyroidism, and adrenocortical dysfunction. Decreased glucose levels (hypoglycemia) may result from endogenous or exogenous insulin excess, prolonged starvation, or liver disease. Fasting Glucose 2 hours PP Glucose Diagnosis &lt;100 &lt;140 Normal 100 to 125 140 to 199 Pre Diabetes &gt;126 &gt;200 Diabetes A level of 126 mg/dL or above, confirmed by repeating the test on another day, means a person has diabetes. IGT (2 hrs Post meal), means a person has an increased risk of developing type 2 diabetes but does not have it yet. A 2-hour glucose level of 200 mg/dL or above, confirmed by repeating the test on another day, means a person has diabetes. View all

#### 21. BUN
Physiological basis&nbsp; Urea is the end product of protein metabolism, which is excreted by the kidney. BUN is directly related to protein intake and nitrogen metabolism and inversely related to the rate of excretion of urea. Urea concentration in glomerular filtrate is the same as in plasma, but its tubular reabsorption is inversely related to the rate of urine formation. Thus, BUN is a less useful measure of glomerular filtration rate than the serum/ plasma creatinine (Cr). Clinic Use The BUN (Blood Urea Nitrogen) test measures the level of urea nitrogen in the blood to assess kidney function and overall health. It is a commonly performed test that helps diagnose and monitor conditions related to kidney health. High Levels causes : Low Levels causes: Kidney dysfunction - Acute kidney injury, chronic kidney disease, kidney failure - Dehydration - Urinary tract obstruction - High protein intake - Medications: Certain medications, such as diuretics or corticosteroids. Liver disease - Malnutrition - Overhydration - Pregnancy - Certain medications: Antibiotics, Diuretics View all

#### 22. C3 Complement
Physiological basis The classic and alternative complement pathways converge at the C3 step in the complement cascade. Low levels indicate activation by one or both pathways. Most diseases with immune complexes show decreased C3 levels. Test is usually performed as an immunoassay (by radial immunodiffusion or nephelometry). Interpretation Increased Levels Decreased Levels Many inflammatory conditions as an acute-phase reactant, active phase of rheumatic diseases (eg, rheumatoid arthritis, SLE), acute viral hepatitis, myocardial infarction, cancer, diabetes mellitus, pregnancy, sarcoidosis, amyloidosis, thyroiditis. Decreased synthesis (protein malnutrition, congenital deficiency, severe liver disease), increased catabolism (immune complex disease, membranoproliferative glomerulonephritis [75%], SLE, Sjögren syndrome, rheumatoid arthritis, DIC, paroxysmal nocturnal hemoglobinuria, autoimmune hemolytic anemia, gram-negative bacteremia), increased loss (burns, gastroenteropathy) Comment Complement C3 levels may be useful in following the activity of immune complex diseases. View all

#### 23. Calcitonin
Physiological Basis Calcitonin is a 32-amino-acid polypeptide hormone secreted by the parafollicular C cells of the thyroid. It decreases osteoclastic bone resorption and lowers serum calcium levels. Interpretation Increased in : Medullary thyroid carcinoma, Zollinger-Ellison syndrome, pernicious anemia, pregnancy (at term), newborns, carcinoma (breast, lung, pancreas), leukemia, myeloproliferative disorders, chronic renal failure. Comments Test is useful to diagnose and monitor medullary thyroid carcinoma, although stimulation tests may be necessary (eg, pentagastrin test). Genetic testing (eg, RET mutation test) is now available for the diagnosis of multiple endocrine neoplasia type II. View all

#### 24. Chikungunya
Positive&nbsp; &nbsp; Indicates the presence of IgM antibodies against the Chikungunya virus. Negative Indicates absence of IgM antibodies against Chikungunya virus. Note: 1. Positive results in serum indicate ongoing or recent infection by Chikungunya virus causing rash, fever, and severe joint pain (arthralgia). The test cannot be used to differentiate between primary and secondary infection. 2. Negative results are seen in the absence of Chikungunya virus infection. However, it does not rule out the disease. 3. False positive results may be seen due to cross-reactivity with other mosquito-borne diseases like Dengue and Zika Virus infections, in patients with high levels of heterophile antibodies and Rheumatoid factor. 4. False-negative results may be due to processing of samples collected early in the course of disease and immunosuppression. Use : To diagnose an acute stage of infection caused by Chikungunya virus. View all

#### 25. CK-MB
Physiological basis CK consists of three isoenzymes, made up of 2 subunits, M and B. The fraction with the greatest electrophoretic mobility is CK1 (BB), CK2 (MB) is intermediate, and CK3 (MM) moves slowest toward the anode. Skeletal muscle is characterized by isoenzyme MM and brain by isoenzyme BB. Myocardium has approximately 40% MB isoenzyme. Assay techniques include isoenzyme separation by electrophoresis (isoenzyme activity units) or by immunoassay using antibodies specific for MB fraction (mass units). Interpretation Increased in: Myocardial infarction, cardiac trauma, certain muscular dystrophies, and polymyositis. Slight persistent elevation reported in a few patients on hemodialysis. Comments CK-MB is a relatively specific test for MI. It appears in serum approximately 4 hours after infarction, peaks at 12–24 hours, and declines over 48–72 hours. CK-MB mass concentration is a sensitive marker of MI within 4–12 hours after infarction. Because cardiac troponins are now the markers of choice for the diagnosis of acute MI, high sensitivity cardiac troponin I test has largely replaced the conventional CK-MB assay. Measurement of CK-MB remains useful in evaluating patients who are already troponin positive and have recurrent chest pain and in follow-up of patients who are status post interventional procedures. View all

#### 26. CMV IgG
Physiological Basis Detects the presence of antibodies to CMV, either IgG or IgM. CMV infection is usually acquired during childhood or early adulthood. By age 20–40 years, 40–90% of the population has CMV antibodies. Interpretation Increased in: Previous or active CMV infection. False-positive CMV IgM tests occur when rheumatoid factor or infectious mononucleosis is present. Comments Serial specimens exhibiting a greater than fourfold titer rise suggest a recent infection. Active CMV infection must be documented by viral isolation. Useful for screening of potential organ donors and recipients. Universal prophylaxis reduces infection in transplant recipients. Detection of CMV IgM antibody in the serum of a newborn usually indicates congenital infection. Detection of CMV IgG antibody is not diagnostic, because maternal CMV IgG antibody passed via the placenta can persist in newborn’s serum for 6 months. CMV seronegative blood components are more efficacious than leukocyte-reduced blood components in preventing transfusion-acquired CMV infection. View all

#### 27. CMV IgM
Physiological Basis Detects the presence of antibodies to CMV, either IgG or IgM. CMV infection is usually acquired during childhood or early adulthood. By age 20–40 years, 40–90% of the population has CMV antibodies. Interpretation Increased in: Previous or active CMV infection. False-positive CMV IgM tests occur when rheumatoid factor or infectious mononucleosis is present. Comments Serial specimens exhibiting a greater than fourfold titer rise suggest a recent infection. Active CMV infection must be documented by viral isolation. Useful for screening of potential organ donors and recipients. Universal prophylaxis reduces infection in transplant recipients. Detection of CMV IgM antibody in the serum of a newborn usually indicates congenital infection. Detection of CMV IgG antibody is not diagnostic, because maternal CMV IgG antibody passed via the placenta can persist in newborn’s serum for 6 months. CMV seronegative blood components are more efficacious than leukocyte-reduced blood components in preventing transfusion-acquired CMV infection. View all

#### 28. CPK-MB
Physiological basis CK consists of three isoenzymes, made up of 2 subunits, M and B. The fraction with the greatest electrophoretic mobility is CK1 (BB), CK2 (MB) is intermediate, and CK3 (MM) moves slowest toward the anode. Skeletal muscle is characterized by isoenzyme MM and brain by isoenzyme BB. Myocardium has approximately 40% MB isoenzyme. Assay techniques include isoenzyme separation by electrophoresis (isoenzyme activity units) or by immunoassay using antibodies specific for MB fraction (mass units). Interpretation Increased in: Myocardial infarction, cardiac trauma, certain muscular dystrophies, and polymyositis. Slight persistent elevation reported in a few patients on hemodialysis. Comments CK-MB is a relatively specific test for MI. It appears in serum approximately 4 hours after infarction, peaks at 12–24 hours, and declines over 48–72 hours. CK-MB mass concentration is a sensitive marker of MI within 4–12 hours after infarction. Because cardiac troponins are now the markers of choice for the diagnosis of acute MI, high sensitivity cardiac troponin I test has largely replaced the conventional CK-MB assay. Measurement of CK-MB remains useful in evaluating patients who are already troponin positive and have recurrent chest pain and in follow-up of patients who are status post interventional procedures. View all

#### 29. C-Reactive Protein, CRP (Qualitative)
Interpretation - Produced in the liver and migrates in Y region, where it can produce a small pseudo paraprotein. - A marker of systemic inflammation - High Sensitivity CRP (hs CRP) assay may indicate cardiovascular risk - Seasonal variations with highest levels in winter. Note: 1. CRP is an acute phase reactant which is used in inflammatory disorders for monitoring course and effect of therapy.&nbsp; 2. It is most useful as an indicator of activity in Rheumatoid arthritis, Rheumatic fever, tissue injury or necrosis and infections 3. As compared to ESR, CRP shows an earlier rise in inflammatory disorders which begins in 4-6 hrs, the intensity of the rise being&nbsp; higher than ESR and the recovery being earlier than ESR.&nbsp; 4. Unlike ESR, CRP levels are not influenced by hematologic conditions like Anemia, Polycythemia etc. View all

#### 30. C-Reactive Protein, CRP (Quantitative)
Interpretation - Produced in the liver and migrates in Y region, where it can produce a small pseudo paraprotein. - A marker of systemic inflammation - High Sensitivity CRP (hs CRP) assay may indicate cardiovascular risk - Seasonal variations with highest levels in winter. Note: 1. CRP is an acute phase reactant which is used in inflammatory disorders for monitoring course and effect of therapy.&nbsp; 2. It is most useful as an indicator of activity in Rheumatoid arthritis, Rheumatic fever, tissue injury or necrosis and infections 3. As compared to ESR, CRP shows an earlier rise in inflammatory disorders which begins in 4-6 hrs, the intensity of the rise being&nbsp; higher than ESR and the recovery being earlier than ESR.&nbsp; 4. Unlike ESR, CRP levels are not influenced by hematologic conditions like Anemia, Polycythemia etc. View all

#### 31. D-Dimer
Physiological basis D-dimer is one of the terminal fibrin degradation products. The presence of D-dimers indicates that a fibrin clot was formed and subsequently degraded by plasmin. Essentially, D-dimer is elevated whenever the coagulation system has been activated, followed by fibrinolysis. Interpretation Increased in : Deep vein thrombosis (DVT), venous thrombo-embolism (VTE), pulmonary embolism (PE), disseminated intravascular coagulation (DIC), arterial thromboembolism, pregnancy (especially postpartum period), malignancy, surgery, thrombolytic therapy. Comments D-dimer assay is a very sensitive test for DIC, DVT and VTE or PE. The D-dimer can be measured by a variety of methods; for example, semiquantitative latex agglutination and quantitative high-sensitivity immunoassay (eg, ELISA). The newly developed highly sensitive automated D-dimer tests may be used to exclude PE and DVT: a negative test essentially rules out thrombosis, but a positive test does not confirm the diagnosis, and further testing (eg, ultrasound, CT angiography) is recommended. View all

#### 32. Dengue NS1 Antigen
Dengue virus, transmitted by Aedes mosquitoes, belongs to the Flavivirus genus and has four serotypes: DEN-1, DEN-2, DEN-3, and DEN-4. Immunity from one serotype is lifelong but does not protect against the others. Dengue infection ranges from mild fever to severe, potentially fatal hemorrhagic disease. The WHO classifies dengue infections as primary or secondary. Secondary infections with different serotypes carry a higher risk of complications such as Dengue Hemorrhagic Fever (DHF) and Dengue Shock Syndrome (DSS). Test Utility Dengue NS1 antigen can be detected in serum from day 1 to day 9 after symptoms begin. Dengue-specific IgM antibodies appear as early as 5 days after fever starts and usually last 30-90 days, though they can occasionally be detectable for up to 8 months. IgM is also present in secondary and tertiary dengue infections, but often at lower and more transient levels. Dengue IgG levels typically rise by the end of the first week of a primary infection and can persist for months or even a lifetime. In primary dengue, patients are usually IgM positive and IgG negative with high IgM levels. In secondary infections, patients are often positive for both IgG and IgM, with higher IgG concentrations. Confirmed diagnosis of Dengue fever can be established in a suspected case with at least one of the following tests: 1) Demonstration of NS1 antigen by ELISA 2) Demonstration of IgM antibody titre by ELISA in single serum sample, 3) IgG seroconversion in paired sera after 2 weeks with 4 fold rise in titre 4) Demonstration of viral nucleic acid by PCR Limitations • Cross-reactivity due to other flavivirus infections (Tick-borne encephalitis, Japanese encephalitis etc) can give false positive dengue test. • Differential diagnoses during the acute phase of illness should include measles, rubella, influenza, typhoid, leptospirosis, malaria, other viral hemorrhagic fevers, and any other disease that may present as a nonspecific viral syndrome. View all

#### 33. DHEA
Physiologic Basis DHEA is a 19-carbon endogenous steroid hormone secreted by the adrenal glands. It is converted to DHEA-S in the adrenals, liver, and small intestine. DHEA-S is albumin-bound in the circulation, and there is no diurnal variation in DHEA-S levels. Levels of DHEA-S are about 300 × higher than DHEA and more stable. It serves as the precursor of androgens and estrogens. Interpretation Increased in: Adrenal hyperplasia, adrenal cancer, congenital adrenal hyperplasia, polycystic ovarian syndrome. Decreased in: Adrenal insufficiency, hypopituitarism, rheumatoid arthritis (females), insulin, and corticosteroids. Comments DHEA measurement is typically used along with other steroid and peptide hormones to evaluate adrenal function, to help diagnose adrenal cortex tumors, and polycystic ovarian syndrome (in females). Orally ingested DHEA is converted to DHEA-S when passing through intestines and liver. People taking DHEA supplements have elevated blood levels of DHEA-S. Use by athletes is prohibited by the World Anti-doping Agency. View all

#### 34. Differential Leucocyte Count
CELLS INCREASED IN DECREASED IN Neutrophils Infection (bacterial or early viral), acute stress, acute and chronic inflammation, tumors, drugs (eg, G-CSF), diabetic ketoacidosis, leukemia (rare). Aplastic anemia, drug-induced neutropenia, chemotherapy, folate or B12 deficiency, myelodysplasia, marrow infiltration, cyclic neutropenia, autoimmune or isoimmune neutropenia, Felty syndrome, hypersplenism, sepsis, viral marrow suppression, bone marrow failure syndromes. Lymphocytes Viral infection (especially infectious mononucleosis, pertussis), thyrotoxicosis, adrenal insufficiency, lymphoid leukemia/lymphoma, chronic infection, drug and allergic reactions, autoimmune diseases Immune deficiency syndromes (eg, HIV), idiopathic drugs. Monocytes Inflammation, infection, malignancy, tuberculosis, myeloproliferative disorders (eg, CMML) Depleted in overwhelming bacterial infection, hairy cell leukemia. Eosinophils Allergic states, asthma, drug sensitivity reactions, skin disorders, parasitic and certain fungal infections, Churg- Strauss syndrome, polyarteritis nodosa, response to malignancy (eg, Hodgkin disease, T-cell lymphoma, adenocarcinoma), eosinophilic pneumonia, hyper-eosinophilic syndrome, leukemia (eg, chronic eosinophilic leukemia), myeloid or lymphoid neoplasm with abnormalities of PDGF receptor (alpha or beta) or FGF receptor, mastocytosis Depleted in overwhelming bacterial infection, hairy cell leukemia Basophils Hypersensitivity reactions, drugs, myeloproliferative disorders (eg, CML), basophilic or mast cell variant of acute or chronic leukemia, inflammatory reaction, certain infections, hypothyroidism Not applicable. View all

#### 35. Erythrocyte sedimentation rate (Westergren)
Raised ESR can be found in Low ESR is found in: 1. Connective tissue disorders 2. Infections e.g., TB, acute hepatitis, bacterial 3. Hematological disease e.g., multiple myeloma, anemia of acute or chronic disease, alone or combined with iron deficiency anemia 4. Malignancy e.g., lymphoma, breast or colon cancer 5. Pregnancy 6. Oral contraceptive pill users 7. Obesity can cause a moderately raised ESR 1. Heart failure 2. Cachexia 3. PRV or secondary Conditions featuring abnormal blood cells e.g., sickle cell anemia, hereditary spherocytosis, acanthocytosis 4. Microcytosis 5. Hypofibrinogenemia e.g. DIC, 6. Massive hepatic necrosis 7. High white cell count 8. Treatment with steroids NB: Very high (&gt;100) ESR is found in autoimmune disease, malignancy, acute post-trauma, and serious infection. A false high ESR can occur if the ambient temperature is unusually high. View all

#### 36. Erythrocyte Sedimentation Rate (Wintrobe)
Raised ESR can be found in Low ESR is found in: 1. Connective tissue disorders 2. Infections e.g., TB, acute hepatitis, bacterial 3. Hematological disease e.g., multiple myeloma, anemia of acute or chronic disease, alone or combined with iron deficiency anemia 4. Malignancy e.g., lymphoma, breast or colon cancer 5. Pregnancy 6. Oral contraceptive pill users 7. Obesity can cause a moderately raised ESR 1. Heart failure 2. Cachexia 3. PRV or secondary Conditions featuring abnormal blood cells e.g., sickle cell anemia, hereditary spherocytosis, acanthocytosis 4. Microcytosis 5. Hypofibrinogenemia e.g. DIC, 6. Massive hepatic necrosis 7. High white cell count 8. Treatment with steroids NB: Very high (&gt;100) ESR is found in autoimmune disease, malignancy, acute post-trauma, and serious infection. A false high ESR can occur if the ambient temperature is unusually high. View all

#### 37. Fasting Blood Sugar
Clinical Notes Elevated glucose levels (hyperglycemia) are most often encountered clinically in the setting of diabetes mellitus, but they may also occur with pancreatic neoplasms, hyperthyroidism, and adrenocortical dysfunction. Decreased glucose levels (hypoglycemia) may result from endogenous or exogenous insulin excess, prolonged starvation, or liver disease. Fasting Glucose 2 hours PP Glucose Diagnosis &lt;100 &lt;140 Normal 100 to 125 140 to 199 Pre Diabetes &gt;126 &gt;200 Diabetes A level of 126 mg/dL or above, confirmed by repeating the test on another day, means a person has diabetes. IGT (2 hrs Post meal), means a person has an increased risk of developing type 2 diabetes but does not have it yet. A 2-hour glucose level of 200 mg/dL or above, confirmed by repeating the test on another day, means a person has diabetes. View all

#### 38. Ferritin
Interpretation : Ferritin is iron storage protein. Determination of ferritin is necessary in Iron deficiency anemia, monitoring iron therapy, and in differential diagnosis of Anaemia.&nbsp; Elevation levels- Hemochromatosis, Porphyria, Rheumatoid arthritis, Leukaemia, Hodgkin's lymphoma, Liver disease, Multiple blood transfusion, Acute phase reactant, Increased in all inflammatory condition. Decreased level- Iron deficiency anemia. View all

#### 39. Filarial Parasite (Card Test)
Result Remarks Detected Indicates the presence of circulating Wuchereria bancrofti antigen. Not Detected Indicates absence of circulating Wuchereria bancrofti antigen Note: &nbsp; - Positive results are seen in parasitic disease of the human lymph system caused by Wuchereria bancrofti (W. bancrofti) leading to conditions like lymphedema, hydrocele and disfiguring disease of elephantiasis. - Results should be correlated with clinical conditions and tests like thick smear microscopy and membrane filtration test.&nbsp; - False positive results may be due to cross-reactivity with Loa loa spp or other nematode infection.&nbsp; - False negative reactions may be due to the processing of samples collected early in the course of disease or low threshold of antigen. The test should be repeated on a new specimen obtained after two weeks. Uses - To diagnose lymphatic and non-lymphatic filariasis.&nbsp; - For mapping the endemicity of lymphatic filariasis.&nbsp; - For monitoring and transmission assessment surveys (TAS) of Wuchereria bancrofti. View all

#### 40. Folic Acid
Note 1. Drugs like Methotrexate and Leucovorin can affect folate test results. 2. To tell apart vitamin B12 deficiency from folate deficiency, check levels of Methyl malonic acid in urine and Homocysteine in blood. 3. Folic acid has a low risk of toxicity because it's a water-soluble vitamin that’s usually excreted in urine. Comments Folate is crucial for making DNA components and for red blood cell maturation. It comes mainly from plants and some organ meats, but cooking can destroy over half of it. Folate deficiency is common in people with alcoholic liver disease, pregnant women, and the elderly. It can result from poor absorption, inadequate diet, high demand (like in pregnancy or cancer), or certain drugs such as Methotrexate and anticonvulsants Interpretation Decreased Levels: Megaloblastic anemia, Infantile hyperthyroidism, Alcoholism, Malnutrition, Scurvy, Liver disease, B12 deficiency, dietary amino acid excess, adult Celiac disease, Tropical Sprue, Crohn’s disease, Hemolytic anemias, Carcinomas, Myelofibrosis, vitamin B6 deficiency, pregnancy, Whipple’s disease, extensive intestinal resection and severe exfoliative dermatitis. View all

#### 41. Gamma Glutamyl Transferase, GGT
Interpretation Synthesis of GGT is stimulated by many drugs e.g., phenytoin, phenobarbitone, primidone, alcohol and possibly some antidepressants. GGT is a sensitive test for excess alcohol intake but is not specific. Abnormal test results 1. Raised GGT and raised mean corpuscular volume (MCV) suggest alcohol abuse. 2. Raised GGT, history of excessive alcohol intake, raised ALT and raised MCV suggest liver cell damage. 3. Very high GGT (10 times normal upper limit) occurs in biliary obstruction and hepatic malignancies. 4. Raised GGT and raised ALP (more than three times upper limit of normal) suggest cholestasis. 5. Raised GGT may be due to non-specific causes e.g., MI, cerebrovascular accident, diabetes mellitus, pancreatic disease, renal failure and chronic lung disease. 6. LFTs (transaminase and GGT) are also affected by lack of exercise, obesity and smoking, as well as excess alcohol intake. Elevated results may, therefore, occur if several of these factors coexist, even if alcohol intake is not excessive. 7. The effect of alcohol on GGT is complex. About 50% of people who drink alcohol to excess on a regular basis will have biochemical abnormalities, while the other 50% will not. View all

#### 42. Glucose-6-phosphate dehydrogenase
Physiologic Basis G6PD is an enzyme in the hexose monophosphate shunt that is essential in generating reduced glutathione and NADPH, which protect hemoglobin from oxidative denaturation. Inherited G6PD deficiency causes neonatal hyperbilirubinemia and chronic hemolytic anemia and exposure to oxidative stressors such as certain drugs or infection, can elicit significant acute hemolysis. Interpretation Increased in: Young erythrocytes (reticulocytosis) Decreased in: G6PD deficiency Causes of hemolysis in glucose-6- phosphate dehydrogenase deficiency 1. Bacterial and viral infections 2. Drugs: &nbsp; &nbsp;• Antimalarials: Primaquine, pamaquine &nbsp; &nbsp;• Antibacterials: Sulfonamides, nalidixic acid, nitrofurantoin, dapsone &nbsp; &nbsp;• Antipyretics and analgesics 3. Chemicals: Naphthalene balls Comments In deficient patients, hemolytic anemia can be triggered by oxidant agents: antimalarial drugs (eg, chloroquine), nalidixic acid, nitrofurantoin, dapsone, phenacetin, vitamin C, and some sulfonamides. Patients from high-risk groups (eg, African American and people from the Mediterranean region) should be screened for G6PD deficiency before taking an oxidant drug. Hemolytic episodes can also occur in deficient patients who eat fava beans (favism), in patients with diabetic acidosis, and in infections. G6PD deficiency may be the cause of hemolytic disease of newborns in Asians and Mediterraneans. G6PD activity levels may be measured as normal during an acute episode, because only non-hemolyzed young red cells are assessed. If deficiency is still suspected, assay should be repeated in 2–3 months when cells of all ages are present. View all

#### 43. Glucose Tolerance Test, GTT
STATUS Fasting Plasma Glucose in mg/dl Post 75g Glucose load mg/dl Normal 70-100 70-140 Impaired Fasting Glucose 101-125 70-140 Impaired Glucose tolerance 70-100 141-199 Pre-Diabetes 101-125 141-199 Diabetes Mellitus&nbsp; &gt;126 &gt;200 The diagnosis of Diabetes requires a fasting plasma glucose of &gt; or = 126 mg/dL or a random / 2 hr post glucose value of &gt; or = 200 mg/dL on at least 2 occasions. View all

#### 44. Glucose Tolerance Test, GTT (Pregnancy)
According to American Diabetic Association (ADA) Guidelines 2024 For Screening and Diagnosis of Gestational Diabetes Mellitus One-Step Strategy is followed. Method One-step strategy Perform a 75-g OGTT, with plasma glucose measurement when an individual is fasting and at 1 and 2 h, at 24-28 weeks of gestation in individuals not previously diagnosed with diabetes. The OGTT should be performed in the morning after an overnight fast of at least 8 hours. The diagnosis of GDM is made when any of the following plasma glucose values are met or exceeded: Sample collection time Normal values Fasting&nbsp; &lt; 92 mg/dL (5.1 mmol/L) At 1 hour &lt; 180 mg/dL (10.0 mmol/L) At 2 hour &lt; 153 mg/dL (8.5 mmol/L) View all

#### 45. HbA1c (Glycosylated Hemoglobin)
Interpretation as per American Diabetes Association (ADA) Guidelines Reference Group Non-Diabetic adults &gt;= 18 years At Risk (Prediabetes) Diagnosing Diabetes Therapeutic goals for glycemic control HbA1c in% 4.0-5.6 5.7-6.4 &gt;= 6.5 &lt;7.0 Clinical significance: Hemoglobin A1c (HbA1c) level reflects the mean glucose concentration over the previous period (approximately 8-12 weeks). The following ranges may be used for interpretation of results. However, factors such as duration of diabetes, adherence to therapy and the age of the patient should also be considered in assessing the degree of blood glucose control. Haemoglobin A1c (%) NSGP mmol/mol/IFCC Unit eAG (mg/dl) Degree of Glucose Control Unit &gt;8 &gt;63.9 &gt;183 Action Suggested* 7-8 53.0 - 63.9 154-183 Fair Control &lt;7 &lt;63.9 &lt;154 Goal** 6-7 42.1 - 63.9 126-154 Near-normal glycemia &lt;6 &lt;42.1 &lt;126 Non-Diabetic level *High risk of developing long term complications such as Retinopathy, Nephropathy, Neuropathy etc. **Some danger of hypoglycemic reaction in Type 1 diabetics. Some glucose intolerant individuals and "subclinical" diabetics may demonstrate HbA1c levels in this area. View all

#### 46. HBeAg
Physiological Basis HBeAg is a soluble protein secreted by HBV, related to HBcAg, indicating viral replication and infectivity. Two distinct serologic types of hepatitis B have been described, one with a positive HbeAg, and the other with a negative HBeAg and a positive anti-HBe antibody. Interpretation Increased (positive) in: HBV (acute, chronic) hepatitis. Comments The assumption has been that loss of HBeAg and accumulation of HBeAb are associated with decreased infectivity. Testing has proved unreliable, and tests are not routinely needed as indicators of infectivity. All patients positive for HBeAg must be considered infectious. View all

#### 47. HBsAg
Comment &nbsp; &nbsp; &nbsp; Interpretation Non- Reactive Hepatitis B surface antigen absent Reactive Hepatitis B surface antigen present Presence of Hepatitis B antigen indicates reactive result which monitors HBAg levels during the disease but cannot predict the stages of disease. Rapid card tests are screening tests, false positive and false negative results may occur due to various factors which may influence test results. Test Utility: HbsAg is the first serologic marker appearing in the serum 6-16 weeks following hepatitis B viral infection. In a typical HBV infection, HBsAg will be detected 2-4 weeks before the liver enzyme levels (ALT) become abnormal and 3-5 weeks before the patient develops jaundice. In acute cases, HbsAg usually disappears 1-2 months after the onset of symptoms. Persistence of HBsAg for more than 6 months indicates the development of either a chronic carrier state or chronic liver disease. The presence of HBsAg is frequently associated with infectivity. HbsAg when accompanied by Hepatitis Be antigen and/or hepatitis B viral DNA almost always indicates infectivity. View all

#### 48. Hemoglobin
Hemoglobin is the major protein of erythrocytes that transports oxygen from the lungs to peripheral tissues. It is measured by spectrophotometry on automated instruments after lysis of red cells and conversion of all hemoglobin to cyanmethemoglobin.&nbsp; Increased in: Decreased in: 1. Hemoconcentration (as in dehydration, Burns, vomiting) 2. Polycythemia (erythrocytosis) 3. Extreme physical exercise. 1. Macrocytic anemia (liver disease, hypothyroidism, vitamin B 12 &nbsp;deficiency, folate deficiency, myelodysplasia) 2. Normocytic anemia (early iron deficiency, anemia of chronic disease, hemolytic anemia, acute hemorrhage, bone marrow infiltration), 3. Microcytic anemia (iron deficiency, thalassemia) Hemodilution Comments : The cyanmethemoglobin technique is the method of choice selected by the International Committee for Standardization in Hematology. The method measures all hemoglobin derivatives except sulfhemoglobin by hemolyzing the specimen and adding a reducing agent. As such, this method does not distinguish between intracellular versus extracellular hemoglobin (hemolysis). Hypertriglyceridemia and very high white blood cell counts can cause false elevations of Hb. View all

#### 49. Hepatitis C Virus, HCV
Comment &nbsp;&nbsp; Interpretation Non-reactive Absence of antibodies to the Hepatitis C virus Reactive Presence of antibodies to Hepatitis C virus 1. Reactive test result indicates the presence of Hepatitis C virus infection. Active infection to be confirmed by HCV RNA PCR test. It cannot differentiate between the stages of Hepatitis C viral infection nor used to monitor the efficacy of treatment. 2. Non-Reactive test result indicates Hepatitis C virus infection is unlikely. 3. False positive results may be observed in patients receiving mouse monoclonal antibodies, on heparin therapy, on biotin supplements for diagnosis or therapy or presence of heterophilic antibodies in serum. 4. False negative reaction may be due to processing of sample collected early in the course of disease, Prozone phenomenon, Immunosuppression &amp; Immuno-incompetence. Uses I. To diagnose suspected HCV infection in the risk group. II. Prenatal Screening of pregnant women and pre-surgical/interventional procedures work up. View all

#### 50. High-Sensitivity C-Reactive Protein
Physiologic Basis CRP is an acute-phase reactant protein. Hepatic secretion is stimulated in response to inflammatory cytokines. Unlike other acute-phase proteins, CRP is not affected by hormones. CRP activates the complement system, binds to Fc receptors, and serves as an opsonin for some microorganisms. Rapid, marked increases in CRP occur with inflammation, infection, trauma and tissue necrosis, malignancies, and autoimmune disorders. CRP levels are also valuable in assessing vascular inflammation and cardiovascular risk stratification. CRP level has been shown to be an independent risk factor for atherosclerotic disease. Elevated CRP levels are associated with increased cardiovascular morbidity and mortality in patients with coronary artery disease. Interpretation Increased in: Inflammatory states, including arteriosclerotic disorders. Comments CRP is a very sensitive but nonspecific marker of inflammation. A variety of conditions other than arteriosclerosis may cause dramatic increases in CRP levels. CRP levels increase within 2 hours of acute insult (eg, surgery, infection) and should peak and begin decreasing within 48 hours if no other inflammatory event occurs. In patients with rheumatoid arthritis, persistently elevated CRP concentrations are present when the disease is active and usually fall to normal during periods of complete remission. Patients with high hs-CRP concentrations are more likely to develop stroke, myocardial infarction, and severe peripheral vascular disease. View all

#### 51. HIV (Card Test)
Rapid card tests are screening tests, false positive and false negative results may occur due to various factors which may influence test results. Advise: Kindly confirm by ELISA or Western blot method. 1. &nbsp;A negative result implies that no Anti HIV – 1 &amp; HIV - 2 antibodies have been detected in the sample by this method. This means that either the patient has not been exposed to HIV-1 or HIV-2 infection or the sample has been tested during the “WINDOW PHASE” (before the development of detectable levels of antibodies). 2. &nbsp;A positive result suggests the possibilities of HIV-I and/or HIV-II infection. However, these results must be verified by a confirmatory test (IFA / WESTERN BLOT I-II) before pronouncing the patient positive for HIV-1 and/or HIV-2 infection. ALL reactive samples should be confirmed by using HIV Western Blot/PCR. View all

#### 52. Homocysteine
Interpretation 5 – 15 µmol/L → Normal 15 – 30 µmol/L → Mild elevation 30 – 100 µmol/L → Moderate elevation &gt; 100 µmol/L → Severe elevation View all

#### 53. iCalcium
Physiological Basis Calcium circulates in three forms: as free Ca2+ (50–55%), protein bound to albumin and globulins (40–45%), and as calcium-ligand complexes (5–10%) (with citrate, bicarbonate, lactate, phosphate, and sulfate). Protein binding is highly pH-dependent, and acidosis results in an increased free calcium fraction. Ionized Ca2+ is the form that is physiologically active. Ionized calcium is a more accurate reflection of physiologic status than total calcium in patients with altered serum proteins (renal failure, nephrotic syndrome, multiple myeloma, etc), altered concentrations of calcium-binding ligands, and acid-base disturbances. Measurement of ionized calcium is by ion-selective electrodes. Ionized calcium levels vary inversely with pH, about 0.2 mg/dL per 0.1 pH unit change. Interpretation Increased in: ↓ Blood pH. Decreased in: ↑ Blood pH, citrate, EDTA. Comments Ionized calcium measurements may be needed in special circumstances, eg, massive blood transfusion, transfusion of whole blood in neonates, liver transplantation, neonatal hypocalcemia, cardiac bypass surgery, and possibly monitoring of patients with secondary hyperparathyroidism from renal failure. View all

#### 54. Indirect Coomb&#39;s Test
Physiologic Basis Indirect antiglobulin test is used to demonstrate the presence in the patient’s serum/plasma of unexpected antibody to ABO and Rh-compatible reagent red blood cells. Patient serum or plasma is incubated in vitro with reagent red cells, which are then washed to remove unbound globulins. Agglutination that occurs when antihuman globulin (AHG, Coombs) reagent is added indicates that antibody has bound to a specific antigen present on the red cells. Interpretation Positive in: Presence of alloantibody or autoantibody. Drugs: methyldopa. Comments The technique is used in antibody detection and identification, and in the AHG crossmatch prior to transfusion. View all

#### 55. Insulin Random
Note 1. A single random blood sample for insulin may not be sufficient because insulin levels and blood glucose can vary widely over time. 2. Insulin secretion can be stimulated by various factors, including high blood glucose, glucagon, amino acids, growth hormone, and catecholamines. 3. Insulin assay results can be affected by insulin antibodies that develop in patients receiving bovine or porcine insulin treatments. Clinical Utility · Evaluation of fasting hypoglycemia · Evaluation of Polycystic Ovary syndrome · Classification of Diabetes mellitus · Predict Diabetes mellitus · Assessment of Beta cell activity · Select optimal therapy for Diabetes · Investigation of insulin resistance · Predict the development of Coronary Artery Disease Interpretation Increased levels - Insulinoma, Some Type II diabetic patients, Infantile hypoglycemia, Hyperinsulinism, Obesity, Cushing's syndrome, Oral contraceptives, Acromegaly, Hyperthyroidism Decreased levels - Untreated Type I Diabetes mellitus View all

#### 56. Iron
Physiological basis Plasma iron concentration is determined by absorption from the intestine; storage in the intestine, liver, spleen, bone marrow; rate of breakdown or loss of hemoglobin; and rate of synthesis of new hemoglobin. The key regulator of iron homeostasis is hepcidin. Hepcidin excess or deficiency contributes to the dysregulation of iron homeostasis in hereditary and acquired iron disorders. Interpretation Increased in : Hemosiderosis (eg, multiple transfusions, excess iron administration), acute Fe poisoning (children), hemolytic anemia, pernicious anemia, aplastic or hypoplastic anemia, viral hepatitis, lead poisoning, thalassemia, hemochromatosis. Drugs: estrogens, ethanol, oral contraceptives. Decreased in : Iron deficiency, nephrotic syndrome, chronic renal failure, many infections, active hematopoiesis, remission of pernicious anemia, hypothyroidism, malignancy (carcinoma), postoperative state, kwashiorkor. Comments Absence of stainable iron on bone marrow aspirate differentiates iron deficiency from other causes of microcytic anemia (eg, thalassemia, sideroblastic anemia, some chronic disease anemias), but the procedure is invasive and expensive. Serum iron, iron-binding capacity, transferrin saturation, serum ferritin or soluble transferrin receptor may obviate the need for bone marrow examination. Serum iron, transferrin saturation and ferritin are useful in screening family members for hereditary hemochromatosis. View all

#### 57. LEISHMANIA rK-39 ANTIBODY, SERUM
Interpretation Positive → Suggestive of Visceral Leishmaniasis (Kala-azar) Negative → No serological evidence of Kala-azar Clinical correlation required View all

#### 58. Lipase
Physiologic Basis Lipases are responsible for hydrolysis of glycerol esters of long-chain fatty acids to produce fatty acids and glycerol. Interpretation&nbsp; Increased in: Acute, recurrent, or chronic pancreatitis, pancreatic pseudocyst, pancreatic malignancy, peritonitis, biliary disease, hepatic disease, diabetes mellitus (especially diabetic ketoacidosis), intestinal disease, gastric malignancy or perforation, cystic fibrosis, inflammatory bowel disease (Crohn disease and ulcerative colitis). Comments&nbsp; Serum lipase may be a more reliable test than serum amylase for the initial diagnosis of acute pancreatitis, because of its increased sensitivity in acute alcoholic pancreatitis and because lipase remains elevated longer than amylase. View all

#### 59. Lupus Anticoagulant (DRVVT)
Interpretation Follow ISTH guidelines by using at least two different clot-based assays, such as PTT-LA and dRVVT. Always consider test results along with the patient’s medical history, clinical presentation, and other findings. A positive lupus anticoagulant (LA) test can occur in healthy individuals or with certain infections. Follow-Up: Repeat LA testing more than 12 weeks after the initial positive result. Anticoagulant Effects: Anticoagulants like Warfarin, Heparin, and direct thrombin or factor Xa inhibitors can cause false positives. Repeat testing after stopping anticoagulants for over a week is recommended. Heparin Interference: DRVVT results can be affected by heparin, despite the presence of a heparin inhibitor. Interpret DRVVT results from heparinized plasma with caution. Comments Lupus anticoagulants are diverse IgG or IgM autoantibodies that interfere with phospholipid-dependent coagulation tests, particularly the activated partial thromboplastin time (APTT). These antibodies are linked to various conditions, including arterial and venous thrombosis, recurrent miscarriages, and neurological or neuropsychiatric disorders. Testing for lupus anticoagulants can be done using methods such as PTT-LA, activated kaolin clotting time, and dilute Russell’s viper venom time (DrVVT). Among these, the DrVVT assay is the most robust and specific because it is not affected by deficiencies in the intrinsic pathway or by antibodies to factors VIII, IX, or XI. View all

#### 60. Luteinising Hormone, LH
Physiological basis : LH is stimulated by the hypothalamic hormone gonadotropin- releasing hormone (GnRH). It is secreted from the anterior pituitary and acts on the gonads. LH is the principal regulator of steroid biosynthesis in the ovary and testis. Interpretation : Increased in : Primary hypogonadism, polycystic ovary syndrome, postmenopause, endometriosis, after depot leuprolide injection; immunoassay result may be falsely elevated in pregnancy. Decreased in : Pituitary or hypothalamic failure, anorexia nervosa, bulimia, advanced prostate cancer, severe stress, malnutrition, Kallman syndrome (gonadotropin deficiency associated with anosmia). Drugs: digoxin, oral contraceptives, phenothiazines. Comments&nbsp; In male hypogonadism, serum LH and FSH levels can distinguish between primary (hypergonadotropic) and secondary (hypogonadotropic) hypogonadism. Hypogonadism associated with aging (andropause) may present a mixed picture, with low testosterone levels and low to low-normal gonadotropin levels. Repeated measurement may be required to diagnose gonadotropin deficiencies. Elevated serum LH levels are a common feature in polycystic ovary syndrome, but measurement of total testosterone is the test of choice to diagnose polycystic ovary syndrome. View all

#### 61. Malaria Antigen
Malaria antigen detection-whole blood Four species of the plasmodium parasites are responsible for human malaria infections: P. falciparum, P. vivax, P. ovale and P. malariae. Early detection and differentiation of malaria is of paramount importance due to incidence of cerebral malaria and drug resistance associated with P. falciparum malaria causing most of the morbidity and mortality worldwide. Test Utility The current test is a qualitative test for detection of the P. falciparum specific histidine rich protein-2 (Pf. HRP-2) and P. vivax specific lactate dehydrogenase (pLDH) in whole blood samples. The assay is able to detect and distinguish P. vivax and P. falciparum infections and also identify mixed infections. Notes &amp; Limitations The test detects P. falciparum specific HRP-2 and P. vivax specific LDH, a negative test result does not rule out infection with P. ovale and P. malariae. Constant exposure to the malarial parasites, as seen in areas of high endemicity, may result in positive results with doubtful clinical significance. Hence, the results must always be correlated with clinical history and relevant epidemiological and therapeutic context. View all

#### 62. Malaria Parasite (Card Test)
Malaria antigen detection-whole blood Four species of the plasmodium parasites are responsible for human malaria infections: P. falciparum, P. vivax, P. ovale and P. malariae. Early detection and differentiation of malaria is of paramount importance due to incidence of cerebral malaria and drug resistance associated with P. falciparum malaria causing most of the morbidity and mortality worldwide. Test Utility The current test is a qualitative test for detection of the P. falciparum specific histidine rich protein-2 (Pf. HRP-2) and P. vivax specific lactate dehydrogenase (pLDH) in whole blood samples. The assay is able to detect and distinguish P. vivax and P. falciparum infections and also identify mixed infections. Notes &amp; Limitations The test detects P. falciparum specific HRP-2 and P. vivax specific LDH, a negative test result does not rule out infection with P. ovale and P. malariae. Constant exposure to the malarial parasites, as seen in areas of high endemicity, may result in positive results with doubtful clinical significance. Hence, the results must always be correlated with clinical history and relevant epidemiological and therapeutic context. View all

#### 63. Microalbumin Creatinine Ratio, Urine Random
Physiological Basis The normal urinary albumin excretion is less than 30 mg/24 hr. On random spot urine collection, the albumin-to-creatinine ratio (ACR, mcg/mg) should be less than 30. Category&nbsp; &nbsp; &nbsp;&nbsp; Spot collection ACR (mg/g) Normal &lt; 30 Microalbuminuria 30-300 Clinical albuminuria &nbsp;&gt; 300 Interpretation Increased in: Diabetes mellitus, diabetic nephropathy. Comments Microalbuminuria is a useful indicator of early nephropathy in diabetic patients. Urine albumin measurement requires a sensitive immunochemical assay. Urine dipstick analysis is often insensitive to microalbuminuria. Screening for microalbuminuria is often performed by measurement of the ACR in a random spot collection (preferred method). View all

#### 64. Myoglobin
Comments Myoglobin is a protein found in heart and skeletal muscle. It leaks into the blood when muscle cells are damaged. It’s useful for detecting heart attacks, early re-infarctions, and successful treatment. Myoglobin levels rise about 2 hours after a heart attack, peak in 4-12 hours, and return to normal within 24 hours. Since myoglobin is cleared by the kidneys, any changes in kidney function can affect its levels. Clinical Use To rule out a heart attack, if myoglobin levels don’t change in several samples taken 2-6 hours after chest pain starts, it almost certainly means there’s no heart muscle damage. View all

#### 65. Neutrophil Lymphocyte Ratio
The Neutrophil to Lymphocyte Ratio (NLR ) is a clinical metric calculated from a Complete Blood Count (CBC) that compares the number of neutrophils to the number of lymphocytes in the blood. It can provide valuable insights into a person’s immune status and inflammation levels. Clinical Significance of NLR: Elevated NLR: An increased ratio can be a marker of systemic inflammation or stress and is associated with various conditions such as: - Chronic Inflammatory Diseases: Like rheumatoid arthritis or inflammatory bowel disease. - Infections: Particularly bacterial infections. - Certain Cancers: Elevated NLR is often seen in cancers such as colorectal cancer and lung cancer. - Acute Stress Responses: Including severe illness or trauma. Low NLR: A lower ratio is generally less concerning but may be seen in conditions where lymphocyte levels are elevated or neutrophil levels are low. Clinical Use: NLR is often used as a simple, cost-effective marker to assess inflammation and immune response in clinical practice. It can help in the assessment of disease severity, prognosis, and response to treatment. However, it’s important to interpret NLR in the context of the overall clinical picture and other diagnostic findings. View all

#### 66. NT- ProBNP (N-TERMINAL PRO B TYPE NATRIURETIC PEPTIDE)
Chronic Heart failure&nbsp; AGE OF PATIENTS &nbsp;TITER Result &lt;75 Year &lt;125 Pg/ml Chronic heart failure unlikely Year &lt;450 Pg/ml Chronic heart failure unlikely ACUTE HEART FAILURE&nbsp; AGE OF PATIENTS &nbsp;TITER Result &lt;50 YEAR &lt;450 Pg/ml Acute heart failure unlikely 50-75 YEAR &lt;900 Pg/ml Acute heart failure unlikely YEARS &lt;1800 Pg/ml Acute heart failure unlikely View all

#### 67. Occult Blood, Stool
Positive in: 1. Upper GI disease (peptic ulcer, gastritis, variceal bleeding, esophageal and gastric cancer) 2. Lower GI disease (diverticulosis, colonic polyps, colorectal cancer, inflammatory bowel disease, vascular ectasias, hemorrhoids). Comments Although fecal occult blood testing is an accepted screening test for colorectal cancer, the sensitivity and specificity of an individual test are low. The usefulness of fecal occult blood testing after digital rectal examination is low. Quantitative fecal immunochemical test (FIT) is superior to gFOBT because there are no dietary and drug restrictions and it is more amenable to standardization and quality control. Note To avoid false negatives, patients should avoid taking vitamin C. View all

#### 68. Platelet Count
Physiological basis&nbsp; Platelets are released from megakaryocytes in bone marrow and are important for normal hemostasis. An estimated platelet count may be obtained from blood smear by multiplying the number of platelets per 100 × oil immersion field by 10,000. Increased in:&nbsp; Decreased in: Myeloproliferative disorders (polycythemia vera, chronic myeloid leukemia, essential thrombocythemia, myelofibrosis), some myelodysplastic disorders, acute blood loss, postsplenectomy, pre-eclampsia, reactive thrombocytosis secondary to inflammatory disorders, infection, tissue injury, iron deficiency, malignancies. Bone marrow suppression or replacement/infiltration, myelodysplasia, chemotherapy, drugs, alcohol, infection (eg, HIV), congenital marrow failure (eg, Fanconi anemia), Increased destruction or excessive pooling: hypersplenism, DIC, TTP, platelet antibodies (ITP), drugs (eg, quinidine, cephalosporins, clopidogrel) Comments&nbsp; Platelet counts are determined in patients with suspected bleeding disorders, purpura or petechiae, leukemia/lymphoma, or DIC, and in patients on chemotherapy, and to determine the response to platelet transfusions. There is little tendency to bleed until the platelet count falls below 0.2Lakhs/cumm. Bleeding due to low platelet counts typically presents as petechiae, epistaxis, and gingival bleeding. For invasive procedures, platelet counts &gt; 0.5 Lakhs/cumm are desirable. View all

#### 69. Progesterone
Menstrual Cycle Phase: 1. Follicular Phase (Early): Serum progesterone levels are typically low (&lt;1 ng/mL), as progesterone is produced in significant amounts only after ovulation. 2. Luteal Phase (Mid to Late): Progesterone levels rise significantly, usually ranging from 5 to 20 ng/mL. This increase is due to the secretion of progesterone by the corpus luteum, which supports the uterine lining for potential implantation. 3. Postmenopausal Women: Progesterone levels are generally low (&lt;1 ng/mL) due to the cessation of ovarian function. Pregnancy: First Trimester: Progesterone levels increase substantially, often ranging from 11 to 44 ng/mL, to support the early stages of pregnancy and maintain the uterine lining. Second and Third Trimester: Progesterone levels continue to rise, often exceeding 100 ng/mL, to sustain pregnancy and prepare the body for labor. Ovulation Assessment: Ovulation Detection: Progesterone levels are assessed around day 21 of a 28-day cycle. A level above 5 ng/mL typically indicates that ovulation has occurred. Hormonal Imbalances: Low Progesterone Levels: May indicate conditions such as luteal phase defect, where the corpus luteum fails to produce adequate progesterone, potentially leading to infertility or recurrent miscarriage. Elevated Progesterone Levels: Can be seen in conditions such as ovarian cysts or tumors, or if there is ongoing pregnancy. Supplemental Progesterone: During Treatment: If a patient is on progesterone supplements, levels should be monitored to ensure therapeutic levels are achieved and to adjust dosages as needed. Progesterone in Endocrine Disorders: Polycystic Ovary Syndrome (PCOS): Progesterone levels may be lower due to anovulation. Adrenal Disorders: Elevated levels may be seen in conditions involving adrenal hyperplasia or tumors. Note: Interpretation of serum progesterone levels should always be correlated with clinical findings, menstrual history, and other relevant laboratory tests for accurate diagnosis and treatment planning. View all

#### 70. Prolactin
Physiological basis: Prolactin is a polypeptide hormone secreted by the anterior pituitary. It functions in the initiation and maintenance of lactation in the postpartum period. PRL secretion is inhibited by hypothalamic secretion of dopamine. Clinical Use : 1.Diagnosis &amp; management of pituitary adenomas 2.Differential diagnosis of male &amp; female hypogonadism. Interpretation Increased in: 1. Physiologic : Sleep, stress, postprandially, pain, coitus 2. Systemic disorders : Chest wall or thoracic spinal cord lesions, Primary / Secondary hypothyroidism, Adrenal insufficiency, Chronic renal failure, Cirrhosis 3. Medications : - Psychiatric medications like Phenothiazine, Haloperidol, Risperidone, &nbsp; Domperidone, Fluoxetine, Amitriptyline, MAO inhibitors etc., - Antihypertensives: Alpha Methyldopa, Reserpine, Verapamil - Opiates: Heroin, Methadone, Morphine, Apomorphine - Cimetidine / Ranitidine - Prolactin secreting pituitary tumors: Prolactinoma, Acromegaly 4. Miscellaneous : Epileptic seizures, Ectopic secretion of prolactin by non-pituitary tumors, pressure / transaction of pituitary stalk, macroprolactinemia 5. Idiopathic Decreased in : Pituitary deficiency: Pituitary necrosis / infarction , Pseudohypoparathyroidism, Bromocriptine administration, Drugs: Levodopa Comments : Serum PRL is used primarily in work-up of suspected pituitary tumors. Clinical presentation is usually amenorrhea and galactorrhea in women and impotence in men. In macroadenoma - PRL is frequently &gt; 500 ng/mL and In microadenoma &nbsp;- PRL is usually &gt; 150 ng/mL View all

#### 71. Prothrombin time, PT/INR
Physiologic Basis PT evaluates the extrinsic and common coagulation pathways.The time required for fibrin clot formation is determined. It is most sensitive to deficiencies in the vitamin K-dependent clotting factors II, VII, and X. It is also sensitive to deficiency of factor V. It is less sensitive to fibrinogen deficiency and heparin. PT/INR tests are increasingly being used for monitoring warfarin therapy. Interpretation Increased in : Warfarin, liver disease, DIC, vitamin K deficiency, hereditary deficiency in factors VII, X, V and II, fibrinogen abnormality (eg, hypofibrinogenemia, afibrinogenemia, dysfibrinogenemia), circulating anticoagulant affecting the PT system (rarely lupus anticoagulant), massive transfusion. Decreased in : Recombinant factor F VII treatment Comments Warfarin therapeutic range is INR 2.0 - 3.0. Bleeding has been reported to be 3 × more common in patients with INRs of 3.0–4.5 than in patients with INRs of 2.0–3.0. View all

#### 72. Random Blood Sugar
According to ADA guidelines&nbsp; Status&nbsp; &nbsp;&nbsp; Random Blood Glucose (mg/dl) Random Blood Glucose (mmol/L) Normal 70-140 4.4-7.8 Pre-Diabetes 140-200 7.8-11.1 Diabetes &gt;200 &gt;11.1 The reference values for a Normal Random Glucose test in an average adult are 70-140 mg/dL (4.4-7.8 mmol/i). between 140-200 mg/L (78-11.1 mmol/l) is considered pre-diabetes, and › 200 mg/dL is considered diabetes according to ADA guidelines (you should visit your doctor or a clinic for additional tests) View all

#### 73. Reticulocyte Count
Physiologic Basis: Reticulocytes are young red blood cells that contain cytoplasmic RNA. A reticulocyte count measures how rapidly reticulocytes are produced by the bone marrow and then released into the bloodstream. Reticulocyte count reflects the erythropoietic activity of the bone marrow and is thus useful in both the diagnosis of anemias and in monitoring bone marrow response to therapy. Interpretation Increased in : Hemolytic anemia, blood loss (before development of iron deficiency), recovery from iron, B12 or folate deficiency, or from drug-induced anemia. Decreased in : Iron deficiency anemia, aplastic anemia, anemia of chronic disease, megaloblastic anemia, sideroblastic anemia, pure red cell aplasia, renal disease, bone marrow suppression or infiltration, myelodysplastic syndrome. Comments This test is indicated for the evaluation of anemia to distinguish hypoproliferative from hemolytic anemia or blood loss. The old method of measuring reticulocytes (manual staining and counting) has poor reproducibility. It has been replaced by automated methods (eg, flow cytometry-based), which are more precise and provide absolute reticulocyte counts. View all

#### 74. Rheumatoid Factor, RA (Quantitative)
Physiologic Basis Rheumatoid factor (RF) consists of heterogeneous autoantibodies usually of the IgM class that react against the Fc region of human IgG. Most methods detect only IgM-class RF. Interpretation Positive in: Rheumatoid arthritis (75–90%), Sjögren syndrome (80–90%), scleroderma, dermatomyositis, SLE (30%), sarcoidosis, Waldenström macroglobulinemia, chronic infection. Drugs: methyldopa, others. Low-titers of RF (eg, ≤1:80) are questionable and can be found in healthy older patients (20%), in 1–4% of normal individuals, and in a variety of acute immune responses (eg, viral infections, including infectious mononucleosis and viral hepatitis), chronic bacterial infections (tuberculosis, leprosy, subacute infective endocarditis), and chronic active hepatitis. Comments Rheumatoid factor can be useful in differentiating rheumatoid arthritis from other chronic inflammatory arthritides. However, a positive RF test is only one of several criteria needed to make the diagnosis of rheumatoid arthritis. RF must be ordered selectively because its predictive value is low (34%) if it is used as a screening test. The test has poor positive predictive value because of its lack of specificity. The subset of patients with seronegative rheumatic disease limits its sensitivity and negative predictive value. View all

#### 75. Rubella
Physiologic Basis Rubella (German measles) is a viral infection that causes fever, malaise, coryza, lymphadenopathy, fine maculopapular rash, and congenital birth defects when infection occurs in utero. Antibodies to rubella can be detected by hemagglutination inhibition, complement fixation, indirect hemagglutination, enzyme-linked immunosorbent assay (ELISA), or latex agglutination. Tests can detect IgG and IgM antibodies. Titers usually appear as rash fades(1 week) and peak at 10–14 days for hemagglutination inhibition and 2–3 weeks for other techniques. Baseline titers may remain elevated for life. Serologic tests are used to determine the immune status of the individual, to diagnose postnatal rubella, and occasionally to support the diagnosis of rubella. IgM antibody disappears within 4–5 weeks; IgG antibody remains for life. Interpretation Increased in: Recent rubella infection, congenital rubella infection, previous rubella infection, or vaccination (immunity). Spuriously increased IgM antibody occurs in the presence of rheumatoid factor or cross - reacting antibodies to other viral infections or autoimmune illnesses. Comments Rubella titers of ≤1:8 indicate susceptibility and need for immunization to prevent infection during pregnancy. Titers of &gt; 1:32 indicate immunity from prior infection or vaccination. Demonstration of a 4-fold rise in titer between acute and convalescent sera may be indicative of a recent infection. Single titers, even &gt; 1:256, cannot be interpreted as evidence of recent infection, since they are more likely to indicate immune status. The recent resurgence of congenital rubella can largely be prevented with improved rubella testing and vaccination programs. View all

#### 76. Semen Examination
Method: Semen is collected in a urine container after masturbation following 3 days of abstinence from ejaculation. Specimen must be examined promptly. Physiologic Basis: Conventional semen analysis includes the determination of sperm count, semen volume, sperm motility (qualitative and quantitative), and sperm morphology. In addition to sperm count, sperm morphology and motility may have the most predictive utility. Infertility can be associated with low counts or with sperm of abnormal morphology or decreased motility. Interpretation: Decreased in- Primary or secondary testicular failure, cryptorchidism, following vasectomy, drugs. Comments: A low sperm count should be confirmed by sending two other appropriately collected semen specimens for evaluation. The usefulness of conventional semen analysis parameters as predictors of fertility is somewhat limited. Therefore, alternative tests based on more functional aspects (sperm penetration, capacitation, acrosome reaction) have been developed. View all

#### 77. Serum Albumin
Physiologic Basis Major components of plasma proteins are influenced by nutritional state, hepatic function, renal function, and various diseases. It is a major binding protein, although there are more than 50 different genetic variants (alloalbumins), only occasionally does a mutation cause abnormal binding (eg, in familial dysalbuminemic hyperthyroxinemia). Interpretation Increased in : Dehydration, shock, hemoconcentration. Decreased in: Decreased hepatic synthesis (chronic liver disease, malnutrition, malabsorption, malignancy, congenital analbuminemia [rare]). Increased losses (nephrotic syndrome, burns, trauma, hemorrhage with fluid replacement, fistulas, enteropathy, acute or chronic glomerulonephritis). Hemodilution (pregnancy, CHF). Drugs: estrogens. Comments Serum albumin indicates severity in chronic liver disease. Useful in nutritional assessment if there is no impairment in production or increased loss of albumin. Independent risk factor for all-cause mortality in the elderly (age &gt;70) and for complications in hospitalized and post-surgical patients. There is a 10% reduction in serum albumin level in late pregnancy (related to hemodilution). View all

#### 78. Serum Alkaline Phosphatase
Physiologic Basis: Alkaline phosphatases are primarily found in liver, bone, intestines, kidney, and placenta. Test is used to detect liver disease and bone disorders. Interpretation: Increased in : Obstructive hepatobiliary disease, bone disease (physiologic bone growth, Paget disease, osteomalacia, osteogenic sarcoma, bone metastases), hyperparathyroidism, rickets, benign familial hyperphosphatasemia, pregnancy (third trimester), GI disease (perforated ulcer or bowel infarct), hepatotoxic drugs. Decreased in : Hypophosphatasia. Comment: Alkaline phosphatase performs well in measuring the extent of bone metastases in prostate cancer. Alkaline phosphatase isoenzyme separation by electrophoresis or differential heat inactivation is unreliable. Use γ-glutamyl transpeptidase, which increases in hepatobiliary disease but not in bone disease, to infer the origin of increased alkaline phosphatase. &nbsp; View all

#### 79. Serum Amylase
Physiological basis Amylase hydrolyzes complex carbohydrates. Serum amylase is derived primarily from pancreas and salivary glands and is increased with inflammation or obstruction of these glands. Other tissues have some amylase activity, including ovaries, small and large intestine, and skeletal muscle. Interpretation Increased in: Acute pancreatitis (70–95%), pancreatic pseudocyst, pancreatic duct obstruction (cholecystitis, choledocholithiasis, pancreatic carcinoma, stone, stricture, duct sphincter spasm), bowel obstruction and infarction, mumps, parotitis, diabetic keto- acidosis, penetrating peptic ulcer, peritonitis, ruptured ectopic pregnancy, macroamylasemia. Drugs: azathioprine, hydrochlorothiazide. Decreased in: Pancreatic insufficiency, cystic fibrosis. Usually normal or low in chronic pancreatitis. Comments Macroamylasemia is indicated by high serum but low urine amylase. Serum or plasma lipase is an alternative test for acute pancreatitis. It has clinical sensitivity equivalent to that of amylase but with better specificity. View all

#### 80. Serum Bilirubin (Direct)
Physiological basis Bilirubin is the orange-yellow pigment derived from the breakdown of hemoglobin (heme). The majority of bilirubin comes from senescent red cells. It is biotransformed in the liver and excreted in bile and urine. Some conjugated bilirubin is bound to serum albumin, so-called D (delta) bilirubin. Interpretation Increased in : Acute or chronic hepatitis, cirrhosis, biliary tract obstruction, toxic hepatitis, neonatal jaundice (neonatal hyperbilirubinemia), congenital liver enzyme abnormalities (Dubin-Johnson, Rotor, Gilbert, Crigler-Najjar syndromes), fasting, hemolytic disorders. Hepatotoxic drugs. Comments Assay of total bilirubin includes conjugated (direct) and unconjugated (indirect) bilirubin. Only conjugated bilirubin appears in the urine, and it is indicative of liver disease and biliary tract obstruction. Hemolysis is associated with increased unconjugated bilirubin. Unbound (free) serum or plasma bilirubin level correlates better than total bilirubin with CNS bilirubin concentrations and bilirubin encephalopathy (kernicterus) in newborn jaundice. View all

#### 81. Serum Bilirubin (Indirect)
Physiological basis Bilirubin is the orange-yellow pigment derived from the breakdown of hemoglobin (heme). The majority of bilirubin comes from senescent red cells. It is biotransformed in the liver and excreted in bile and urine. Some conjugated bilirubin is bound to serum albumin, so-called D (delta) bilirubin. Interpretation Increased in : Acute or chronic hepatitis, cirrhosis, biliary tract obstruction, toxic hepatitis, neonatal jaundice (neonatal hyperbilirubinemia), congenital liver enzyme abnormalities (Dubin-Johnson, Rotor, Gilbert, Crigler-Najjar syndromes), fasting, hemolytic disorders. Hepatotoxic drugs. Comments Assay of total bilirubin includes conjugated (direct) and unconjugated (indirect) bilirubin. Only conjugated bilirubin appears in the urine, and it is indicative of liver disease and biliary tract obstruction. Hemolysis is associated with increased unconjugated bilirubin. Unbound (free) serum or plasma bilirubin level correlates better than total bilirubin with CNS bilirubin concentrations and bilirubin encephalopathy (kernicterus) in newborn jaundice. View all

#### 82. Serum Bilirubin (Total)
Physiological basis Bilirubin is the orange-yellow pigment derived from the breakdown of hemoglobin (heme). The majority of bilirubin comes from senescent red cells. It is biotransformed in the liver and excreted in bile and urine. Some conjugated bilirubin is bound to serum albumin, so-called D (delta) bilirubin. Interpretation Increased in : Acute or chronic hepatitis, cirrhosis, biliary tract obstruction, toxic hepatitis, neonatal jaundice (neonatal hyperbilirubinemia), congenital liver enzyme abnormalities (Dubin-Johnson, Rotor, Gilbert, Crigler-Najjar syndromes), fasting, hemolytic disorders. Hepatotoxic drugs. Comments Assay of total bilirubin includes conjugated (direct) and unconjugated (indirect) bilirubin. Only conjugated bilirubin appears in the urine, and it is indicative of liver disease and biliary tract obstruction. Hemolysis is associated with increased unconjugated bilirubin. Unbound (free) serum or plasma bilirubin level correlates better than total bilirubin with CNS bilirubin concentrations and bilirubin encephalopathy (kernicterus) in newborn jaundice. View all

#### 83. Serum Calcium
Physiological basis Serum calcium is the sum of ionized calcium plus complex calcium and calcium bound to proteins (mostly albumin). Level of ionized calcium is regulated by parathyroid hormone and vitamin D. Interpretation Common causes of Hypocalcemia Causes of Hypercalcemia 1. Chronic renal failure 2. Hypomagnesemia 3. Hypoalbuminemia 1. Increased intestinal absorption (vitamin d intoxication) 2. Increased skeletal resorption 3. Primary hyperparathyroidism Primary hyperparathyroidism and malignancy account for 90-95% of cases of hypercalcemia. Comments Need to know serum albumin to interpret calcium level. For every decrease in albumin by 1mg/dL, calcium should be corrected upward by 0.8 mg/dL. In 10% of patients with malignancies, hypercalcemia is attributable to coexistent hyperparathyroidism, suggesting that serum PTH levels should be measured at the initial presentation of all hypercalcemic patients. &nbsp; View all

#### 84. Serum Chloride
Physiological Basis Chloride, the principal inorganic anion of extracellular fluid, is important in maintaining proper body water distribution, osmotic pressure, and normal acid–base balance. If chloride is lost (as HCl or NH4Cl), alkalosis ensues; if chloride is ingested or retained, acidosis ensues. Interpretation Increased in: Renal failure, nephrotic syndrome, renal tubular acidosis, dehydration, overtreatment with saline, hyperparathyroidism, diabetes insipidus, metabolic acidosis from diarrhea (loss of HCO3–), respiratory alkalosis, hyperadrenocorticism. Drugs: acetazolamide (hyperchloremic acidosis), androgens, hydrochlorothiazide, salicylates (intoxication). Decreased in: Vomiting, diarrhea, gastrointestinal suction, renal failure combined with salt deprivation, over-treatment with diuretics, chronic respiratory acidosis, diabetic ketoacidosis, excessive sweating, SIADH, salt-losing nephropathy, acute intermittent porphyria, water intoxication, expansion of extracellular fluid volume, adrenal insufficiency, hyperaldosteronism, metabolic alkalosis. Drugs: chronic laxative or bicarbonate ingestion, corticosteroids, diuretics. Comments Test is helpful in assessing normal and increased anion gap metabolic acidosis. It is somewhat helpful in distinguishing hypercalcemia due to primary hyperparathyroidism (high serum chloride) from that due to malignancy (normal serum chloride). View all

#### 85. Serum Creatinine
Creatinine is a waste product produced by muscles from the breakdown of a compound called creatine. It is removed from the body by the kidneys, which filter almost all of it from the blood and release it into the urine. Creatine is part of the cycle that produces energy needed to contract muscles. Both creatine and creatinine are produced by the body at a relatively constant rate. Since almost all creatinine is filtered from the blood by the kidneys and released into the urine, blood levels are usually a good indicator of how well the kidneys are working. Higher than normal level may be due to: - Blockage in the urinary tract - Kidney problems, such as kidney damage or failure, infection, or reduced blood flow - Loss of body fluid (dehydration) - Muscle problems, such as breakdown of muscle fibers - Problems during pregnancy, such as seizures (eclampsia)), or high blood pressure caused by pregnancy (preeclampsia) Lower than normal level may be due to: - Myasthenia Gravis - Muscular dystrophy. Low serum creatinine values are rare. They almost always reflect low muscle mass. View all

#### 86. Serum IgE
Notes Normal IgE levels don't rule out the possibility of IgE-dependent allergies. This is because the accuracy of the test can be influenced by factors such as the time between exposure to an allergen and testing, the patient's age, and the specific organs affected. Additionally, the severity of an allergic reaction is not strongly related to the amount of IgE in the blood. Comments Immunoglobulin E (IgE) plays a key role in triggering allergic reactions. Its levels are low in the first year of life but increase as a child grows, reaching adult levels by around age 10. Measuring IgE levels can help differentiate between atopic diseases (like allergic asthma, allergic rhinitis, and atopic dermatitis) and non-atopic conditions. Increased Levels - Atopic/Non-atopic allergy, Hyper IgE syndrome, Parasitic infections, IgE Myeloma, Pulmonary Aspergillosis, Immunodeficiency states &amp; Autoimmune diseases. Uses 1. Evaluate children with a family history of allergies and early symptoms. 2. Assess individuals for allergic respiratory issues and identify allergens. 3. Confirm food allergies in patients with severe reactions or skin issues. 4. Test for insect venom allergies if skin tests are unclear. 5. Check for IgE antibodies to specific workplace allergens. View all

#### 87. Serum Phosphorus
Physiologic Basis The plasma concentration of inorganic phosphate is determined by parathyroid gland function, action of vitamin D, intestinal absorption, renal function, bone metabolism, and nutrition. Serum phosphorus concentrations have a circadian rhythm (highest level in late morning, lowest in evening) and are subject to rapid change secondary to environmental factors such as diet (carbohydrate), phosphate binding antacids, and fluctuations in GH, insulin, and renal function. Interpretation&nbsp; Increased in Decreased in Renal failure, Massive blood transfusion, hypoparathyroidism, neoplasms, adrenal insufficiency, hypervitaminosis D, osteolytic metastases to bone, leukemia, Pseudohypoparathyroidism, Cirrhosis, lactic acidosis. Drugs: phosphate infusions or enemas, anabolic steroids, ergocalciferol, furosemide, hydrochlorothiazide, clonidine, verapamil, potassium supplements Hyperparathyroidism, hypovitaminosis D, starvation or cachexia, refeeding syndrome, bone marrow transplantation, GH deficiency, chronic alcoholism, Severe diarrhea, acute pancreatitis, severe hypercalcemia, acid-base disturbances, hypokalemia, hemodialysis. Drugs: acetazolamide, phosphate-binding antacids, anticonvulsants, β-adrenergic agonists, catecholamines, estrogens, isoniazid, oral contraceptives, prolonged use of thiazides, glucose infusion, insulin therapy, salicylates (toxicity). Comments Shift of phosphorus from extracellular to intracellular compartments, decreased gastrointestinal absorption, and increased urinary losses, are the primary mechanisms of hypophosphatemia. Hypophosphatemia has been implicated as a cause of rhabdomyolysis, respiratory failure, hemolysis, and left ventricular dysfunction. View all

#### 88. Serum Potassium
Physiologic Basis Potassium is predominantly an intracellular cation whose plasma level is regulated by renal excretion. Elevated or depressed potassium concentrations interfere with muscle contraction. Interpretation Increased in : Massive hemolysis, severe tissue damage, rhabdomyolysis, acidosis, dehydration, acute or chronic renal failure, Addison disease, renal tubular acidosis type IV (hyporeninemic) hypoaldosteronism, (hyperkalemic) familial periodic paralysis, exercise (transient). Drugs: potassium salts, potassium-sparing diuretics (eg, spironolactone, triamterene, eplerenone), nonsteroidal anti-inflammatory drugs, β-blockers, ACE inhibitors, ACE-receptor blockers, high-dose trimethoprim-sulfamethoxazole. Decreased in : Low potassium intake, prolonged vomiting or diarrhea, renal tubular acidosis types I and II, hyperaldosteronism, Cushing syndrome, osmotic diuresis (eg, hyperglycemia), alkalosis, (hypokalemic) familial periodic paralysis, trauma (transient), subarachnoid hemorrhage, genetic hypokalemic salt-losing tubulopathies such as Gitelman syndrome (familial hypokalemia- hypocalcemia-hypomagnesemia). Drugs: adrenergic agents (isoproterenol), diuretics. Comments Spurious hyperkalemia can occur with hemolysis of a sample, delayed separation of serum from erythrocytes, prolonged fist clenching during blood drawing, and prolonged tourniquet placement. Very high white blood cell or platelet counts may cause spurious elevation of serum potassium, but plasma potassium levels are normal. View all

#### 89. Serum Protein
Physiological basis Plasma protein concentration is determined by nutritional state, hepatic function, renal function, hydration, and various disease states. Plasma protein concentration determines the colloidal osmotic pressure. Interpretation Increased in : Polyclonal or monoclonal gammopathies, marked dehydration. Drugs: anabolic steroids, androgens, corticosteroids, epinephrine. Decreased in : Protein-losing enteropathies, acute burns, nephrotic syndrome, severe dietary protein deficiency, chronic liver disease, malabsorption syndrome, agammaglobulinemia, cancer cachexia. Comments Serum total protein consists primarily of albumin and globulin. Serum globulin level is calculated as total protein minus albumin. Hypoproteinemia usually indicates hypoalbuminemia, because albumin is the major serum protein View all

#### 90. Serum Sodium
Physiologic Basis Sodium is the predominant extracellular cation. The serum sodium level is primarily determined by the volume status of the individual. Hyponatremia can be divided into hypovolemia, euvolemia, and hypervolemia categories. Interpretation Increased in : Dehydration (excessive sweating, severe vomiting, or diarrhea), polyuria (diabetes mellitus, diabetes insipidus), hyperaldosteronism, inadequate water intake (coma, hypothalamic disease). Drugs: steroids, licorice, oral contraceptives. Decreased in : CHF, cirrhosis, vomiting, diarrhea, exercise, excessive sweating (with replacement of water but not salt, eg, marathon running), salt-losing nephropathy, adrenal insufficiency, nephrotic syndrome, water intoxication, syndrome of inappropriate antidiuretic hormone (SIADH), AIDS. Drugs: thiazides, diuretics, ACE inhibitors, chlorpropamide, carbamazepine, antidepressants (SSRI), antipsychotics. Comments Hyponatremia in a normovolemic patient with urine osmolality higher than serum (or plasma) osmolality suggests the possibility of SIADH, myxedema, hypopituitarism, or reset osmostat. Treatment of disorders of sodium balance relies on clinical assessment of the patient’s extracellular fluid volume rather than the serum sodium. View all

#### 91. Serum Triiodothyronine, T3
Physiologic Basis T3 is the primary active thyroid hormone. Approximately 80% of T3 is produced by extrathyroidal deiodination of T4 and the rest by thyroid gland. Total T3 is influenced by levels of thyroxine binding proteins. Interpretation Increased in : Hyperthyroidism (some) Increased thyroid binding globulin. Decreased in : Hypothyroidism, nonthyroidal illness, decreased thyroid binding globulin. Drugs: Amiodarone. Comments T3 may be increased in approximately 5% of hyperthyroid patients in whom free T4 is normal (T3 toxicosis). Therefore, the test is indicated when hyperthyroidism is suspected and free T4 value is normal. Test is of no value in the diagnosis and treatment of primary hypothyroidism. View all

#### 92. Serum Urea
Urea is derived in the liver from amino acids and therefore from protein, whether originating from the diet or from tissues. The normal kidney can excrete large amounts of urea. If the rate of production exceeds the rate of clearance, plasma concentrations rise. The rate of production is accelerated by: - a high-protein diet - absorption of amino acids and peptides from digested blood after hemorrhage into the gastrointestinal lumen or soft tissues - increased catabolism due to starvation, tissue damage, sepsis or steroid treatment. - increased catabolism due to starvation, tissue damage, sepsis or steroid treatment. In catabolic states, glomerular function is often impaired due to circulatory factors and this contributes more to the uraemia than does increased production. Conversely, the plasma urea concentration may be lower than 1.0 mmol/L, the causes of which include the following: Due to increased GFR or haemodilution Due to decreased synthesis Pregnancy Use of amino acids for protein anabolism during growth, especially in children Overenthusiastic intravenous infusion Low protein intake, very severe liver disease ‘Inappropriate’ ADH secretion (SIADH) Inborn errors of the urea cycle are rare and usually only occur in infants. &nbsp; View all

#### 93. Serum Uric Acid
Physiological basis&nbsp; Uric acid is an end product of nucleoprotein metabolism and is excreted by the kidney. An increase in serum uric acid concentration occurs with increased nucleoprotein synthesis or catabolism (blood dyscrasias, therapy of leukemia) or decreased renal uric acid excretion (eg, thiazide diuretic therapy or renal failure). Interpretation&nbsp; Increased in : Renal failure, gout, myeloproliferative disorders (leukemia, lymphoma, myeloma, polycythemia vera), psoriasis, glycogen storage disease (type I), Lesch-Nyhan syndrome, lead nephropathy, hypertensive diseases of pregnancy (preeclampsia and eclampsia), menopause, syndrome X (obesity, insulin resistance, hypertension, hyperuricemia, dyslipidemia). Drugs: Antime- tabolite and chemotherapeutic agents, diuretics, ethanol, nicotinic acid, salicylates (low-dose), theophylline. Decreased in : SIADH, Xanthine oxidase deficiency, Low-purine diet, Fanconi syndrome, Neoplastic disease (various, causing Increased renal excretion), Liver disease. Drugs: Salicylates (high- dose), allopurinol or febuxostat (xanthine oxidase inhibitors) or uricase. &nbsp; View all

#### 94. SGOT (AST)
Physiological basis: Intracellular enzyme involved in amino acid metabolism. Present in large concentrations in liver, skeletal muscle, brain, red cells, and heart. Released into the bloodstream when tissue is damaged, especially in liver injury. Interpretation&nbsp; Increased in : Acute viral hepatitis (ALT &gt; AST), biliary tract obstruction (cholangitis, choledocholithiasis), alcoholic hepatitis and cirrhosis (AST &gt; ALT), liver abscess, metastatic or primary liver cancer; right heart failure, ischemic or hypoxic injury to liver (“shock liver”), extensive trauma. Drugs that cause cholestasis or hepatotoxicity. Decreased in : Pyridoxine (vitamin B6) deficiency Comments&nbsp; Test is not indicated for diagnosis of myocardial infarction. AST/ALT ratio &gt;1 suggests cirrhosis in patients with hepatitis C View all

#### 95. SGPT (ALT)
Physiological basis Intracellular enzyme involved in amino acid metabolism. Present in large concentrations in liver, kidney; in smaller amounts, in skeletal muscle and heart. Released with tissue damage, particularly liver injury. Interpretation &nbsp; Increased in : Acute viral hepatitis (ALT &gt; AST), biliary tract obstruction (cholangitis, choledocholithiasis), alcoholic hepatitis and cirrhosis (AST &gt; ALT), liver abscess, metastatic or primary liver cancer; nonalcoholic steatohepatitis; right heart failure, ischemia or hypoxia, injury to liver (“shock liver”), extensive trauma; drugs that cause cholestasis or hepatotoxicity. Decreased in : Pyridoxine (vitamin B6) deficiency. Comments&nbsp; ALT is the preferred enzyme for evaluation of liver injury. View all

#### 96. TB GOLD, Interferon Gamma Release Assay
Main Result (TB Antigen Response) Interferon-Gamma Value (IU/mL) Result Interpretation &lt; 0.20 Negative Clearly normal; TB infection unlikely 0.20 – 0.34 Borderline Negative Usually considered negative; may repeat if high risk ≥ 0.35 Positive Suggests TB infection (latent or active) ≥ 1.00 Strong Positive Higher immune response; TB infection likely Control Tube Values (Quality Checks) Tube Expected / Normal Value What It Means Nil (baseline) Low (usually &lt; 8.0 IU/mL) High value may invalidate the test Mitogen (positive control) ≥ 0.5 IU/mL Confirms immune system response TB Antigen – Nil Used for final result Determines positive vs negative Overall Test Interpretation Final Result Meaning Negative TB infection unlikely Positive TB infection present (latent or active) Indeterminate Test unreliable; repeat testing needed &nbsp; View all

#### 97. Testosterone Free
Clinical Use 1. As a secondary test to investigate alterations in physiologically active testosterone levels. 2. To evaluate androgen status in cases with suspected or established abnormalities in sex hormone-binding globulin (SHBG). 3. To assess functional serum testosterone levels in early pubertal males and older adult men. 4. To measure functional circulating testosterone in females presenting with symptoms or signs of hyperandrogenism despite having normal total testosterone concentrations. Comments Testosterone circulates in the blood bound to three proteins: sex hormone-binding globulin (SHBG) (60-80%), albumin, and cortisol-binding globulin. Approximately 1-2% of circulating testosterone remains unbound or free. Measuring free testosterone provides an estimate of the biologically active hormone. This is particularly useful to account for variations in transport proteins that can affect total testosterone levels. Elevated SHBG levels, which can occur with conditions like obesity or advanced age, might obscure a true testosterone deficiency. In conditions such as Polycystic Ovary Syndrome (PCOS), where insulin resistance is prevalent and SHBG levels are often reduced, free or bioavailable testosterone levels may be significantly elevated. View all

#### 98. Testosterone Total
Physiological basis Testosterone is the principal male sex hormone, produced by the Leydig cells of the testes. Dehydroepiandrosterone (DHEA) is produced in the adrenal cortex, testes, and ovaries and is the main precursor for serum testosterone in women. In normal males after puberty, the testosterone level is twice as high as all androgens in females. In serum, it is largely bound to albumin (38%) and to a specific steroid hormone-binding globulin (SHBG) (60%), but it is the free hormone (2%) that is physiologically active. The total testosterone level measures both bound and free testosterone in the serum (by immunoassay). Free or bioavailable testosterone may be calculated or measured. Interpretation Increased in : Idiopathic sexual precocity (in boys, levels may be in adult range), adrenal hyperplasia (boys), adrenocortical tumors, trophoblastic disease during pregnancy, idiopathic hirsutism, virilizing ovarian tumors, arrhenoblastoma, virilizing luteoma, testicular feminization (normal or moderately elevated), cirrhosis (through increased SHBG), hyperthyroidism. Drugs: anticonvulsants, barbiturates, estrogens, oral contraceptives (through increased SHBG). Decreased in : Hypogonadism (primary and secondary, orchidectomy, Klinefelter syndrome, uremia, hemodialysis, hepatic insufficiency, ethanol [men]). Drugs: digoxin, spironolactone, acarbose. Comments The diagnosis of male hypogonadism is based on clinical symptoms and signs plus laboratory confirmation of low AM total serum testosterone levels on two different occasions. Levels &lt;3.0 ng/mL should be treated. Free testosterone should be measured in symptomatic patients with normal total testosterone levels. Obtain serum luteinizing hormone and FSH levels to distinguish between primary (hypergonadotropic) and secondary (hypogonadotropic) hypogonadism. Hypogonadism associated with aging (andropause) may present a mixed picture, with low testosterone levels and low to low-normal gonadotropin levels. In men, there is a diurnal variation in serum testosterone with a 20% elevation in levels in the evenings. View all

#### 99. Thyroglobulin Antibody (TgAb)
Physiological basis Antibodies against thyroglobulin are produced in autoimmune diseases of the thyroid and other organs. Of the normal population, 10% have slightly elevated titers (especially women and the elderly). Interpretation Increased in : Hashimoto thyroiditis (&gt; 90%), thyroid carcinoma (45%), thyrotoxicosis, pernicious anemia (50%), SLE (20%), subacute thyroiditis, Graves disease. Not increased in : Multinodular goiter, thyroid adenomas, and some carcinomas. The thyroid peroxidase antibody test is more sensitive than the thyroglobulin antibody test in autoimmune thyroid disease. There is limited use for this test, ie, monitoring of patients with thyroid carcinoma after treatment. View all

#### 100. Thyroglobulin (TG)
Physiologic Basis Tg is a large protein specific to the thyroid gland from which thyroxine is synthesized and cleaved. Highly sensitive immunometric assays for Tg are available. Tg autoantibodies can interfere with the measurement of Tg. Interpretation Increased in : Hyperthyroidism, subacute thyroiditis, untreated thyroid carcinomas (except medullary carcinoma): follicular cancer (sensitivity 72%, specificity 81%), Hürthle cell cancer (sensitivity 56%, specificity 84%). Decreased in : Factitious hyperthyroidism, presence of thyroglobulin autoantibodies, after (&gt; 25 days) total thyroidectomy. Comments Follow-up of patients with differentiated thyroid cancers who are apparently disease-free after surgery and radioiodine therapy involves periodic measurement of serum Tg. Patients with detectable serum Tg during thyroid-stimulating hormone (TSH) suppression by thyroxine therapy or Tg that rises higher than 2 ng/mL after TSH stimulation are highly likely to harbor residual tumors. Undetectable serum Tg during TSH suppressive therapy does not exclude persistent disease. Therefore, serum Tg should be measured after TSH stimulation achieved either by thyroxine withdrawal or by administration of recombinant human TSH (rhTSH). Results are equivalent in detecting recurrent thyroid cancer, but use of rhTSH helps to prevent symptomatic hypothyroidism. Follow-up based on serial measurements of basal (ie, unstimulated) Tg may be superior to the single Tg measurement after TSH stimulation. Tg is typically measured together with Tg antibody. In patients with positive Tg Ab, the Tg level should be interpreted with caution. View all

#### 101. Thyroid-Stimulating Hormone, TSH
Physiologic Basis TSH is an anterior pituitary hormone that stimulates the thyroid gland to produce thyroid hormones. Secretion is stimulated by thyrotropin releasing hormone from the hypothalamus. There is negative feedback on TSH secretion by circulating thyroid hormone. Interpretation&nbsp; Increased in : Hypothyroidism, mild increases in recovery phase of acute illness, subclinical hypothyroidism. Decreased in : Hyperthyroidism, subclinical hyperthyroidism, acute medical or surgical illness (euthyroid sick syndrome), pituitary hypothyroidism. Drugs: dopamine, high-dose corticosteroids. Comments TSH assays are used for screening thyroid function, aiding the diagnosis of hyperthyroidism and hypothyroidism, and monitoring thyroid replacement therapy. The currently used TSH immunoassays are very sensitive, typically with functional sensitivity of ≤0.02 mIU/L. Measurement of serum TSH is the best initial laboratory test of thyroid function. It should be followed by measurement of free thyroxine (FT4) if the TSH value is low and by measurement of anti-thyroperoxidase antibody (TPO Ab) if the TSH value is high. Most experts recommend against routine screening of asymptomatic patients, but screening is recommended for high-risk populations. View all

#### 102. Total Calcium
Physiological basis Serum calcium is the sum of ionized calcium plus complex calcium and calcium bound to proteins (mostly albumin). Level of ionized calcium is regulated by parathyroid hormone and vitamin D. Interpretation Common causes of Hypocalcemia Causes of Hypercalcemia 1. Chronic renal failure 2. Hypomagnesemia 3. Hypoalbuminemia 1. Increased intestinal absorption (vitamin d intoxication) 2. Increased skeletal resorption 3. Primary hyperparathyroidism Primary hyperparathyroidism and malignancy account for 90-95% of cases of hypercalcemia. Comments Need to know serum albumin to interpret calcium level. For every decrease in albumin by 1mg/dL, calcium should be corrected upward by 0.8 mg/dL. In 10% of patients with malignancies, hypercalcemia is attributable to coexistent hyperparathyroidism, suggesting that serum PTH levels should be measured at the initial presentation of all hypercalcemic patients. &nbsp; View all

#### 103. Total Cholesterol
Desirable: &lt;200 mg/dL [&lt;5.2 mmol/L] Borderline: 200–239 mg/ dL [5.2–6.1 mmol/L] High risk: &gt;240 mg/dL [&gt;6.2 mmol/L] Physiological basis&nbsp; Cholesterol level is determined by lipid metabolism, which is in turn influenced by heredity, diet, and liver, kidney, thyroid, and other endocrine organ functions. Interpretation&nbsp; Increased in : Primary disorders: polygenic hypercholesterolemia, familial hypercholesterolemia (deficiency of LDL receptors), familial combined hyperlipidemia, familial dysbetalipoproteinemia. Secondary disorders: hypothyroidism, uncontrolled diabetes mellitus, nephrotic syndrome, biliary obstruction, anorexia nervosa, hepatocellular carcinoma, Cushing syndrome, acute intermittent porphyria. Drugs: corticosteroids. Decreased in : Severe liver disease (acute hepatitis, cirrhosis, malignancy), hyperthyroidism, severe acute or chronic illness, malnutrition, malabsorption (eg, HIV), extensive burns, familial (Gaucher disease, Tangier disease), abetalipoproteinemia, intestinal lymphangiectasia. Comments&nbsp; Coronary heart disease (CHD) risk depends on the ratio of total cholesterol to HDL cholesterol. The ratio of LDL to HDL cholesterol has similar predictive ability. Treatment decisions should be based on absolute CHD risk. The risk reduction is proportional to the reduction in LDL cholesterol achieved with treatment. &nbsp; View all

#### 104. Total Iron Binding Capacity (TIBC)
Physiologic Basis Iron is transported in plasma complexed to transferrin, which is synthesized in the liver. Total iron-binding capacity is calculated from transferrin levels measured immunologically. Each molecule of transferrin has two iron-binding sites; so its iron- binding capacity is 1.47 mg/g. Normally, transferrin carries an amount of iron representing about 16–60% of its capacity to bind iron (eg, % saturation of iron-binding capacity is 16–60%). Interpretation Increased in:&nbsp; &nbsp; Decreased in: Iron deficiency anemia, late pregnancy, infancy, acute hepatitis. Drugs: oral contraceptives Hypoproteinemic states (eg, nephrotic syndrome, starvation, malnutrition, cancer), hemochromatosis, thalassemia, hyperthyroidism, chronic infections, chronic inflammatory disorders, chronic liver disease, other chronic diseases. Comments TIBC correlates with serum transferrin, but the relationship is not linear over a wide range of transferrin values and is disrupted in diseases affecting transferrin-binding capacity or other iron-binding proteins. Increased % transferrin saturation with iron is seen in iron overload (iron poisoning, hemolytic anemia, sideroblastic anemia, thalassemia, hemochromatosis, pyridoxine deficiency, aplastic anemia, RBC transfusions). Decreased % transferrin saturation with iron is seen in iron deficiency (usually saturation &lt;16%). Transferrin levels can also be used to assess nutritional status. View all

#### 105. Total Leukocyte Count
Physiological basis The WBC count and differential determine the total number of white blood cells as well as the percentage and absolute number of each type of white cell in a blood sample. It is typically generated by an automated laboratory hematology analyzer as part of the CBC panel. Interpretation Increased in: Acute infections, inflammatory disorders, acute and chronic leukemias, myeloproliferative disorders, solid tumor (paraneoplastic reaction), circulating lymphoma, tissue injury/necrosis, G-CSF stimulation, various drugs, corticosteroids, allergies, hypersensitivity reactions, stress, smoking. Decreased in: Infections, constitutional and acquired myeloid hypoplasia, myelosuppression (eg, chemotherapy, radiation, various drugs), myelodysplasia, collagen vascular diseases, hypersplenism, cyclic neutropenia, autoimmune neutropenia, alcoholism. Comments There are five types of white cells, each with different functions: neutrophils, lymphocytes, monocytes, eosinophils, and basophils. Absolute counts for individual cell populations can be calculated from a combination of the WBC count and the percentage of each cell type from the differential. View all

#### 106. Total PSA
Physiological basis PSA is a glycoprotein produced by cells of the prostatic ductal epithelium and is present in the serum of all men. It is absent from the serum of women. Interpretation Increased in: Prostate carcinoma (sensitivity ~20%; specificity ~60–70% at a 4.0 ng/mL cutoff), biochemical recurrence after localized treatment, benign prostatic hypertrophy (BPH), prostatitis. Decreased in: Metastatic prostate carcinoma treated with antiandrogen therapy, postprostatectomy, 5α-reductase inhibitor therapy. Comments PSA is used both for the early detection of prostate cancer and as a tumor marker to assess response and monitor recurrence of treated prostate cancer. There is still no consensus on whether PSA measurement should be used as a screening test for early detection of prostate cancer. A decrease in mortality rates resulting from use for cancer screening is unproven, and the risks of early therapy are significant. As a result, the United States Preventive Services Task Force discourages use of the test for healthy men in all age groups. The PSA nadir (the lowest PSA level achieved after therapeutic intervention) appears to correlate with the likelihood of remaining disease free. Three consecutive PSA rises are interpreted as an indicator of treatment (biochemical) failure. PSA is often increased in BPH, and the positive predictive value in healthy older men is low. Use of the free/total PSA ratio or the complex PSA test and prostate volume can improve the diagnostic accuracy for prostate cancer. View all

#### 107. Triglycerides
Physiological basis&nbsp; Dietary fat is hydrolyzed in the small intestine, absorbed and resynthesized by mucosal cells, and secreted into lacteals as chylomicrons. Triglycerides in the chylomicrons are cleared from the blood by tissue lipoprotein lipase. Endogenous triglyceride production occurs in the liver. These triglycerides are transported in association with β-lipoproteins in very low-density lipoproteins (VLDL). Interpretation&nbsp; Increased in : Hypothyroidism, diabetes mellitus, nephrotic syndrome, chronic alcoholism (fatty liver), biliary tract obstruction, stress, familial lipoprotein lipase deficiency, familial dysbetalipoproteinemia, familial combined hyperlipidemia, obesity, metabolic syndrome, viral hepatitis, cirrhosis, pancreatitis, chronic renal failure, gout, pregnancy, glycogen storage diseases types I, III, and VI, anorexia nervosa, dietary excess. Drugs: β-blockers, cholestyramine, corticosteroids, diazepam, diuretics, estrogens, oral contraceptives. Decreased in : Tangier disease (α-lipoprotein deficiency), hypo- and abetalipoproteinemia, malnutrition, malabsorption, parenchymal liver disease, hyperthyroidism, intestinal lymphangiectasia. Drugs: ascorbic acid, clofibrate, nicotinic acid, gemfibrozil. Comments&nbsp; If the serum is clear, the serum triglyceride level is generally &lt;350 mg/dL. Elevated triglycerides are now considered an independent risk factor for coronary artery disease and a major risk factor for acute pancreatitis, particularly when serum triglyceride levels are &gt; 1000 mg/dL and can be seen when a primary lipid disorder that is exacerbated by alcohol or fat intake or by corticosteroid or estrogen therapy. View all

#### 108. Troponin I
Initial Result In pg/ml&nbsp; Remarks &lt;26.2 The upper reference limit (99th percentile) for high sensitive Troponin I (hsTnI) &lt; 26.2&nbsp; &amp;&nbsp; pain &lt; 6 hours Repeat Sampling after 3 hrs, a 50% change from initial value is diagnostic of Myocardial Infarction (MI) &gt;26.2-262 Repeat Sampling after 3 hrs, 50% change from initial value is diagnostic of Myocardial Infarction (MI) &gt;262 Ml may be ruled in as appropriate with 98% specificity Note After Ml, troponin rises within 4-8 hours, peaks at 12-24 hours, and remains elevated for upto 14 days. Increased levels cTnl is highly cardio specific , though it may be elevated in nonischemic forms of cardiac injury including cardiac contusion, myocarditis, CHF, cardiomyopathy, Interventional therapy like cardiac surgery, and drug-induced cardiotoxicity.&nbsp; Normal troponin is defined as values upto the 99th percentile of healthy adults. “False positive” troponin may be seen in pulmonary embolism, myocarditis, pericarditis, heart failure, intracranial insults, rhabdomyolysis, sepsis, shock, and renal insufficiency. View all

#### 109. Typhidot Antibodies
TYPHIDOT is a Dot EIA assay designed for the qualitative detection of specific IgM and IgG antibodies against a specific outer membrane antigen of Salmonella typhi1 in human serum. It is intended to be used as an in vitro diagnostic of typhoid fever. The results obtained should not be the sole determinant for clinical decisions. RESULTS CLINICAL INTERPRETATION IgM positive; IgG negative Acute Typhoid Fever IgM and IgG positive &nbsp;Acute Typhoid Fever ( in the middle stage of infection) IgM negative; IgG positive Implications for the presence of IgG antibodies may be due to&nbsp; 1. Current Infection 2. Previous Infection&nbsp; 3. Relapse or reinfection IgM and IgG negative Probably not typhoid View all

#### 110. Urine Cortisol
Physiological Basis: Urinary free cortisol measurement is useful in the initial evaluation of suspected Cushing syndrome.&nbsp; Interpretation &nbsp; Increased in: &nbsp; Cushing syndrome, acute illness, stress.&nbsp; Not increased in: Obesity.&nbsp; Comments &nbsp; Urinary free cortisol is the initial diagnostic test of choice for Cushing syndrome. Not useful for the diagnosis of adrenal insuffi ciency. A shorter (12-hour) overnight collection and measurement of the ratio of urine-free cortisol to urine creatinine appears to perform nearly as well as a 24-hour collection for urine-free cortisol. View all

#### 111. Urine for Microalbumin
Physiological Basis: The normal urinary albumin excretion is less than 30 mg/24 hr. On random spot urine collection, the albumin-to-creatinine ratio (ACR, mcg/mg) should be less than 30. The term microalbuminuria is defined as a subtle increase in the urinary excretion of albumin that cannot be detected by conventional urinalysis. Specifically, the excretion of 30–300 mg albumin per 24 hours or an ACR of 30–300 (mcg/mg) is considered microalbuminuria (urine albumin is high). 300 mg or more of albumin excretion per day or an ACR of 300 or higher indicates gross albuminuria (urine albumin very high or nephrotic) range.&nbsp; Interpretation: Increased in: Diabetes mellitus, diabetic nephropathy.&nbsp; Comments: Microalbuminuria is a useful indicator of early nephropathy in diabetic patients. Urine albumin measurement requires a sensitive immunochemical assay. Urine dipstick analysis is often insensitive to microalbuminuria. Screening for microalbuminuria is often performed by measurement of the ACR in a random spot collection (preferred method). Twenty-four-hour or timed urine collections are more burdensome. View all

#### 112. Urine Pregnancy Test
Interpretation 1. If the pregnancy test is taken too early one may get a false negative result very dilute urine specimen may not contain a representative level of HCG, resulting in a negative test too. 2. If pregnancy is still suspected, first morning specimen should be collected 48 hours later and tested. 3. A test result that is weakly positive should be confirmed by retesting with a first-morning urine specimen collected 48 hours later. 4. A number of conditions other than pregnancy, including trophoblastic disease and non-trophoblastic neoplasm cause elevated levels of HCG resulting in a false positive test. 5. The result should be correlated with clinical and ultrasound findings. View all

#### 113. Urine Routine Examination
Protein : Elevated urinary protein levels can signal early kidney disease but may also rise due to strenuous exercise, orthostatic proteinuria, dehydration, urinary tract infections, or acute illness with fever. Glucose and Ketones : Uncontrolled diabetes mellitus can lead to the presence of glucose in urine. Other causes include pregnancy, hormonal disturbances, liver disease and certain medications. Uncontrolled diabetes mellitus can lead to the presence of ketones in urine. Ketones can also be seen in starvation, frequent vomiting, pregnancy, and strenuous exercise. Blood and Leukocytes : Occult blood can occur in urine as intact erythrocytes or hemoglobin, which can occur in various urological, nephrological, and bleeding disorders. An increase in leukocytes is an indication of inflammation or infection in the urinary tract or kidneys. pH and Specific gravity : The kidneys maintain the body's acid-base balance, and factors like acidosis, alkalosis, or certain foods can affect urine pH. Specific gravity - Increased - dehydration, glycosuria, or proteinuria. Decreased - excessive fluid intake, renal failure, or diabetes insipidus. View all

#### 114. VDRL
Result Remarks Reactive Indicates the presence of IgM &amp; IgG antibodies against non-treponemal antigens Non-Reactive Indicates absence of IgM &amp; IgG antibodies against non-treponemal antigens Note : 1. Titers of ≥1: 8 and rising titres are significant. 2. Positive result indicates ongoing or recent infection and the diagnosis should be confirmed by specific Treponemal tests such as TPHA &amp; FTA- AbS. 3. The reactivity will vary with the Primary (60-86%), Secondary (99%) and Tertiary (98%) stage of Syphilis. 4. False positive results may be observed in patients of Malaria, Hepatitis, Mumps, Leprosy, Infectious Mononucleosis, Rheumatoid Arthritis and Collagen disease. 5. False negative reaction may be due to processing of sample collected early in the course of disease, immunosuppression and due to prozone effect. Uses : - To screen for presence and monitor the progression of Syphilis infection. - To assess the response to therapy (decreasing titres) in patients being treated for Syphilis. View all

#### 115. Vitamin B12
Physiologic Basis Vitamin B12 is a necessary cofactor for three important biochemical processes: conversion of methylmalonyl-CoA to succinyl-CoA and methylation of homocysteine to methionine and demethylation of methyltetrahydrofolate to tetra-hydrofolate (THF). All vitamin B12 comes from ingestion of foods of animal origin. Vitamin B12 in serum is protein bound, 70% to transcobalamin I (TC I) and 30% to transcobalamin II (TC II). The B12 bound to TC II is physiologically active; that bound to TC I is not. Interpretation&nbsp; Increased in : Leukemia (acute myelocytic, chronic myelocytic, chronic lymphocytic, monocytic), marked leukocytosis, polycythemia vera. Decreased in : Pernicious anemia, gastrectomy, gastric carcinoma, malabsorption, pregnancy, dietary deficiency, HIV infection, chronic high-flux hemodialysis, Alzheimer disease, drugs (eg, omeprazole, metformin, carbamazepine). Comments Low serum B12 levels warrant treatment; intermediate levels should be followed by repeated serum tests or by urine methylmalonic acid tests, as well as by serum homocysteine levels. Neurologic disorders caused by low serum B12 level can occur in the absence of macrocytic anemia or pancytopenia. View all

#### 116. Widal Test (Slide Method)
Note: 1. Titres ≥1:80 of “O” antigen &amp; ≥1:160 of “H” antigen for Salmonella typhi and titres ≥1:80 of “H” antigen for Salmonella paratyphi A &amp; B are significant. 2. Reactive results indicate ongoing or recent infection by Salmonella species and it will vary with stage of the disease with appearance in 1st week to increase in titres till end of 4th week post which it starts decreasing. 3. False positive - Past enteric infection during unrelated fevers like Malaria, Influenzae etc. in the form of transient rise in H antibody in Widal test. 4. False negative - Sample collected early in the course of disease (1st week) and immunosuppression. Uses of widal test 1. To diagnose infection due to Salmonella species (Enteric fever). 2. To monitor the progression of disease. 3. To assess the response to therapy (decreasing titres) in patients being treated for Enteric fever. View all

