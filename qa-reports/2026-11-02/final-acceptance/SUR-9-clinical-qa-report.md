# SUR-9 Clinical QA â€” Progress and Results

**Date:** 2026-11-02  
**Target:** `http://127.0.0.1:4300`  
**Assignment:** `TEST-MGM-QA-011` through `TEST-MGM-QA-020`

## Outcome

Created and verified all **10/10 assigned synthetic patients** through the visible Patients UI. Registered **10/10 OP encounters** and saved **10/10 vitals records** through the existing admin UI. Patient records were reopened or searched in the app and confirmed persisted. No assigned markers existed in the Patients UI search before creation.

All encounters registered as **approved free** because the selected Consultant Doctor â€” General Medicine has no OP fee configured. No bill, collection or gateway payment was created. No account, role, permission or pre-existing business record was changed by this work.

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

Encounter 011 was moved to **In consultation** using the visible Call in action; no doctor note was recorded. Encounters 012â€“020 remain **Ready for doctor**.

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

## Follow-up admin UI pass — 2026-11-02 18:37 local

The reopened-scope pass used the existing admin account once in an isolated Chrome context. Login succeeded through the visible form (`POST /api/auth/login` HTTP 200; dashboard). No JavaScript page errors occurred. The UI navigation and read-only clinical screens were then checked in that same authenticated context:

- `/consultation` loaded but displayed **Paper mode** and: “This digital queue is turned off in Paper mode. Register visits and manage billing from the patient record.” There was no consultation queue, encounter selector, note editor, or prescribe control in this screen.
- `/follow-up` displayed the same Paper mode queue-off message; no follow-up queue/control was available.
- `/orders` loaded successfully and displayed **0 orders**, with no order creation action. No clinical order or prescription was created, so there are no order IDs to hand to downstream teams.
- `/consultation-history` loaded successfully and showed 3 draft notes, all for other records (UHIDs ending 0006, 0007, and 0016); none belonged to assigned patients 011–020. This is a read-only history view, not a note-entry control.
- `/nursing` loaded successfully and showed 0 ward patients and “No patients assigned.” No nursing note or observation entry was available for the assigned OP encounters.
- `/visit-tracking` loaded successfully and showed 15 visits for the day; existing assigned encounter 011 remains in consultation and 012–020 remain ready for doctor as previously recorded.

The UI returned HTTP 200 for `/api/queue`, `/api/orders`, `/api/consultations`, and `/api/ipd/nursing/board`; these were read-only page loads. No permission-denial response was observed in this pass. This establishes the current operating-mode limitation, not a confirmed software bug. No consultation, prescription, lab/imaging order, follow-up visit, admission, nursing note, bill or payment was created or changed. No account, role or permission was modified.

**Downstream encounter handoff:** assigned persisted patient IDs/UHIDs and encounter IDs remain those in the ledger above: 011 `17 / SHMS-2627-0017 / ENC-261102-00005`; 012 `18 / SHMS-2627-0018 / ENC-261102-00006`; 013 `19 / SHMS-2627-0019 / ENC-261102-00007`; 014 `20 / SHMS-2627-0020 / ENC-261102-00008`; 015 `21 / SHMS-2627-0021 / ENC-261102-00009`; 016 `22 / SHMS-2627-0022 / ENC-261102-00010`; 017 `23 / SHMS-2627-0023 / ENC-261102-00011`; 018 `24 / SHMS-2627-0024 / ENC-261102-00012`; 019 `25 / SHMS-2627-0025 / ENC-261102-00013`; 020 `26 / SHMS-2627-0026 / ENC-261102-00014`. There are currently **no linked clinical order or prescription IDs** to hand off. SUR-10/11/12 can use these existing synthetic patient/encounter IDs for their separately authorized downstream screens, but no clinician-authored orders or prescriptions exist to verify/dispense/bill.

Evidence from this pass: `SUR-9-current-admin-clinical-pass.png`, `SUR-9-admin_consultation.png`, `SUR-9-admin_visit-tracking.png`, `SUR-9-admin_orders.png`, `SUR-9-admin_follow-up.png`, `SUR-9-admin_consultation-history.png`, `SUR-9-admin_nursing.png`.

Updated status: 10/10 patient registrations, 10/10 OP encounters, and 10/10 vitals remain verified; clinical screen discovery is complete for the admin-visible pass. Consultation note, prescription, lab/imaging order, follow-up, doctor/nurse-role authorization and nurse workflow remain **not tested / unavailable** under the current Paper mode and assigned OP encounter state. These limitations keep the original SUR-9 assigned scope **in progress**, not complete.
