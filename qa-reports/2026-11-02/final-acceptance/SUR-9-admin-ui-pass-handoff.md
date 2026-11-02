# SUR-9 downstream clinical handoff

Admin-visible clinical UI pass completed on `http://127.0.0.1:4300` in the existing admin role. `POST /api/auth/login` succeeded (HTTP 200); no JS page errors. The UI reports Paper mode on `/consultation` and `/follow-up`, with digital queues turned off. `/orders` is read-only and shows 0 orders; no order-creation action is exposed. Consultation history has no notes for 011–020. Nursing shows 0 ward patients/no patients assigned. No role, setting, or account was changed.

The 011–020 patients, OP encounters, and vitals remain saved and verified. Reuse these exact existing IDs for any downstream patient/encounter workflow that is available:

| Marker | Patient ID | UHID | Encounter |
|---|---:|---|---|
| TEST-MGM-QA-011 | 17 | SHMS-2627-0017 | ENC-261102-00005 |
| TEST-MGM-QA-012 | 18 | SHMS-2627-0018 | ENC-261102-00006 |
| TEST-MGM-QA-013 | 19 | SHMS-2627-0019 | ENC-261102-00007 |
| TEST-MGM-QA-014 | 20 | SHMS-2627-0020 | ENC-261102-00008 |
| TEST-MGM-QA-015 | 21 | SHMS-2627-0021 | ENC-261102-00009 |
| TEST-MGM-QA-016 | 22 | SHMS-2627-0022 | ENC-261102-00010 |
| TEST-MGM-QA-017 | 23 | SHMS-2627-0023 | ENC-261102-00011 |
| TEST-MGM-QA-018 | 24 | SHMS-2627-0024 | ENC-261102-00012 |
| TEST-MGM-QA-019 | 25 | SHMS-2627-0025 | ENC-261102-00013 |
| TEST-MGM-QA-020 | 26 | SHMS-2627-0026 | ENC-261102-00014 |

**Clinical order IDs: none. Prescription IDs: none.** Therefore there are no lab/imaging orders to collect/result (SUR-10), prescriptions to dispense (SUR-11), or new clinical order billables to reconcile (SUR-12). These saved patient/encounter IDs are shared for downstream UI checks where the receiving task permits them. Do not treat unavailable clinician-authored source orders or prescriptions as present.

Detailed UI evidence and exact route observations are in `SUR-9-clinical-qa-report.md` and `SUR-9-results.json` in this folder. The scope remains in progress: consultation note, prescriptions, lab/imaging orders, follow-up, doctor/nurse role coverage and nurse workflows are untested/unavailable under current Paper mode.
