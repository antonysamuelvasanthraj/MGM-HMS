# SUR-9 Clinical QA — Progress and Results

**Date:** 2026-11-02  
**Target:** `http://127.0.0.1:4300`  
**Assignment:** `TEST-MGM-QA-011` through `TEST-MGM-QA-020`

## Outcome

Created and verified all **10/10 assigned synthetic patients** through the visible Patients UI. Registered **10/10 OP encounters** and saved **10/10 vitals records** through the existing admin UI. Patient records were reopened or searched in the app and confirmed persisted. No assigned markers existed in the Patients UI search before creation.

All encounters registered as **approved free** because the selected Consultant Doctor — General Medicine has no OP fee configured. No bill, collection or gateway payment was created. No account, role, permission or pre-existing business record was changed by this work.

## Patient and encounter ledger

| Marker | Patient ID | UHID | Encounter | Visit stage |
|---|---:|---|---|---|
| TEST-MGM-QA-011 | 17 | SHMS-2627-0017 | ENC-261102-00005 | In consultation |
| TEST-MGM-QA-012 | 18 | SHMS-2627-0018 | ENC-261102-00006 | Ready for doctor |
| TEST-MGM-QA-013 | 19 | SHMS-2627-0019 | ENC-261102-00007 | Ready for doctor |
| TEST-MGM-QA-014 | 20 | SHMS-2627-0020 | ENC-261102-00008 | Ready for doctor |
| TEST-MGM-QA-015 | 21 | SHMS-2627-0021 | ENC-261102-00009 | Ready for doctor |
| TEST-MGM-QA-016 | 22 | SHMS-2627-0022 | ENC-261102-00010 | Ready for doctor |
| TEST-MGM-QA-017 | 23 | SHMS-2627-0023 | ENC-261102-00011 | Ready for doctor |
| TEST-MGM-QA-018 | 24 | SHMS-2627-0024 | ENC-261102-00012 | Ready for doctor |
| TEST-MGM-QA-019 | 25 | SHMS-2627-0025 | ENC-261102-00013 | Ready for doctor |
| TEST-MGM-QA-020 | 26 | SHMS-2627-0026 | ENC-261102-00014 | Ready for doctor |

## Role and control coverage

- **Reception:** one successful current-credential UI login (HTTP 200, dashboard); patient registration completed for all assigned records.
- **Admin:** one successful current-credential UI login (HTTP 200, dashboard); visit tracking, OP registration and vitals controls exercised within that account's current permissions.
- **Vitals:** all 10 records saved through UI. Vitals for 011 and 012 were reopened on their visit details; the other saved entries appeared in the queue as Ready for doctor.
- **Doctor role:** login/permission verification remains blocked because the approved doctor credential is unmatched. No guessed credential was attempted.
- **Nurse role:** untested; no approved current nurse credential was supplied. Admin-exercised vitals coverage does not count as nurse-role coverage.
- **Consultation notes, prescriptions, clinical orders and follow-up:** not completed. The admin visit detail displayed no consultation note and exposed no note editor for this encounter. No unsupported control is marked passed.

Encounter 011 was moved to **In consultation** using the visible Call in action; no doctor note was recorded. Encounters 012–020 remain **Ready for doctor**.

## Evidence

Evidence and per-record screenshots are stored in `E:/MGM HMS/qa-reports/2026-11-02/final-acceptance/`, including:

- `SUR-9-login-dashboard.png` and `SUR-9-admin-dashboard.png`
- `SUR-9-patient-NNN-form.png`, `-created.png`, and `-reopened.png` for each assigned patient
- `SUR-9-patient-NNN-op-form.png`, `-op-created.png`, `-vitals-form.png`, and `-vitals-saved.png` for the clinical workflow entries
- `SUR-9-visit-queue-final.png`, `SUR-9-patient-011-vitals-saved.png`, and `SUR-9-patient-012-vitals-persisted.png`
- Machine-readable record/control ledger: `SUR-9-results.json`

## Bugs and blockers

- **Confirmed software bugs:** none in the controls exercised; no bug was reported for retest.
- **Configuration observation:** selected doctor has no OP fee configured; the UI explicitly registered visits as approved free. This is recorded as observed behavior, not classified as a software bug.
- **Remaining role/workflow blocker:** doctor and nurse role coverage plus consultation documentation, prescriptions, clinical orders and follow-up remain untested. Continue only when an authorized matching role is available; do not alter accounts or permissions.

## Counts

- Patients created / persisted: **10 / 10**
- OP encounters created: **10**
- Vitals records saved: **10**
- Bills/payments created: **0**
- Account/role/permission changes: **0**
- Confirmed bugs: **0**
