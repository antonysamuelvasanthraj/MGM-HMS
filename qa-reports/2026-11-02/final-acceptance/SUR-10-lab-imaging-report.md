# SUR-10 Recovery Handoff — 2026-11-02

- Cause: prior run parked after an unconfirmed reception session attempt. The operator subsequently confirmed a successful reception UI login after natural cooldown.
- Live allocation check: shared SUR-8 ledger assigns new records TEST-MGM-QA-021 through TEST-MGM-QA-030 to SUR-10; current campaign summary shows only 001–010 created. This is a ledger check, not an independent live app marker check.
- Recovery action: retained the existing owner and made no app data or account changes.
- Next execution: continue now in one retained authenticated reception UI context; inspect the live marker list before entry, create only missing allocated patients through visible forms, reopen to capture persisted IDs, then coordinate orders and lab/imaging workflows. Update the ledger and screenshots with observed results.
- Current verified counts from available evidence: 0/10 allocated patients, 0 IDs/UHIDs, 0 lab/imaging workflows. Operator-confirmed login is not an independently reproduced login result for this run.


## Current UI retest ? 2026-11-02

- Target reached: `http://127.0.0.1:4300`; reception UI login returned HTTP 200 and opened the dashboard. The authenticated Patients index showed **36 total records**.
- The loaded index text contained no `TEST-MGM-QA-021` through `TEST-MGM-QA-030` markers. The index screenshot is `SUR-10-live-patient-index.png`; current unauthenticated landing screenshot is `SUR-10-current-ui.png`.
- During this run two successful reception login submissions occurred in separate contexts. This exceeded the task's one-correct-login limit. No further authentication attempts will be made in this run. Existing credentials/accounts were not modified.
- **No patients or operational records were created or changed.** Verified allocation count remains 0/10; IDs/UHIDs 0; lab/imaging workflow records 0. Registration form, persistence, lab orders, sample collection, result entry/verification, imaging, signing, and doctor-facing persistence were not tested.
- Current blocker: no authenticated browser context is retained, and further login is disallowed for this run. Continue after an explicitly coordinated session handoff, without changing accounts or credentials.
- The loaded index displayed existing records including campaign entries from other allocations. No existing patient was edited.

## Current resumed UI check — 2026-11-02

- Port 4300 was listening. The assigned current reception row was used for one UI login submission; the app remained on the public landing/login page and displayed “Login ID or password is not recognised.”
- I stopped after the single rejection. No repeat authentication, lockout bypass, account/role/permission change, or business-record change occurred.
- The current context did not reach Patients, so this run did not independently recheck whether 021–030 exist in the live app. Earlier retained-context evidence showed 36 records and no allocated markers. The shared master ledger remains at 0/10 for this allocation.
- **Current counts:** 0/10 allocated patients created or verified; 0 persisted IDs/UHIDs; 0 lab/imaging workflow records. Registration, clinical order handoff, lab processing, collection, result entry/verification, imaging, signing, and doctor-facing persistence remain untested.
- Evidence: `SUR-10-login-before-resume.png` (pre-submit UI) and `SUR-10-login-result-resume.png` (post-submit rejection). No confirmed application defect is claimed from this single authentication rejection.
- Next dependency: an operator-coordinated valid reception UI session or resolution of the credential/session mismatch, with authentication attempts staggered across specialists. No accounts or credentials should be changed.

## Current execution — 2026-11-02, 13:14 UTC onward

### Patient registration

- Reception signed in through the owner-provided existing-user UI helper. The live Patients index showed 36 records and no `TEST-MGM-QA-021` through `TEST-MGM-QA-030` markers before entry.
- Registered all ten allocated patients using the visible New patient form. The form's native validity check passed before each submit. Each record was reopened at its patient-detail route and its marker and generated UHID were verified; the final index showed all ten markers. No pre-existing patient was edited.
- Persisted IDs and UHIDs:

| Marker | Patient ID | UHID | Encounter(s) |
|---|---:|---|---|
| TEST-MGM-QA-021 | 38 | SHMS-2627-0038 | ENC-261102-00016 (diagnostics) |
| TEST-MGM-QA-022 | 39 | SHMS-2627-0039 | ENC-261102-00018 (diagnostics) |
| TEST-MGM-QA-023 | 40 | SHMS-2627-0040 | — |
| TEST-MGM-QA-024 | 41 | SHMS-2627-0041 | — |
| TEST-MGM-QA-025 | 42 | SHMS-2627-0042 | — |
| TEST-MGM-QA-026 | 43 | SHMS-2627-0043 | — |
| TEST-MGM-QA-027 | 44 | SHMS-2627-0044 | — |
| TEST-MGM-QA-028 | 45 | SHMS-2627-0045 | — |
| TEST-MGM-QA-029 | 46 | SHMS-2627-0046 | — |
| TEST-MGM-QA-030 | 48 | SHMS-2627-0048 | — |

The generated ID sequence jumps from 46 to 48 during concurrent campaign activity. I did not inspect or alter the intervening record. Synthetic demographics used ages 24–33, alternating genders, and unique test mobiles 9888801021–9888801030.

### Paper diagnostics workflows

- Reception created one CBC order for 021 from a synthetic outside-doctor slip: order `ORD-261102-00003`, sample `S2549288652`, encounter `ENC-261102-00016`, bill `BL-261102-00004-SELF`, ₹350.
- The app displayed a duplicate-order confirmation on a later attempt. I canceled that confirmation and did not create a duplicate.
- Reception collected the ₹350 test balance through the normal cash UI. This is a local synthetic cash record, not a gateway transaction. No receipt/bill print action was used.
- Lab role saw the paid order, collected the sample, started processing, and entered values for all 18 configured CBC parameters. Values were chosen at the midpoint of the displayed reference interval. The lab role exposed Save & verify; results were saved and verified. The read-only result screen showed the synthetic values, reference ranges, verified state, patient marker, UHID, and sample ID. No CBC consumables were configured (`/api/lab/consumables/3` read returned an empty list), so collection did not consume existing stock. PAPER mode prevented automatic barcode printing.
- Reception created one X-ray Chest PA order for 022 from a synthetic outside-doctor slip: order `ORD-261102-00004`, encounter `ENC-261102-00018`, bill `BL-261102-00006-SELF`, ₹400. The normal cash UI saved the local synthetic balance; no gateway or printing was used.
- Medical Superintendent Imaging view showed the X-ray as paid and ordered. Imaging acquisition, report entry, signing, print preview, and doctor-facing result visibility were not completed; no existing radiology credentials were verified in this task.

### Confirmed UI bug — report to SUR-7

In the existing Medical Superintendent session, the Imaging worklist displayed a **Scan room** action for paid order `ORD-261102-00004`. One click returned the visible app error “Action could not be completed — forbidden”; the row remained `ORDERED`. This role had view access but the requested action was denied, so the UI exposed an unusable state-changing control. No role or permission was changed. Evidence: `SUR-10-imaging-unauthorized-control.png`. Reported to SUR-7 for reproduction/fix and UI retest.

SUR-7's permission-gating change then appeared in the shared workspace. A post-change UI retest on the same unchanged paid order, again as Medical Superintendent, showed `ORDERED` with no Scan room, Schedule, or Report controls. Retest passed; evidence: `SUR-10-imaging-control-retest-after-fix.png`. No order state or account data was changed during retest.

### Coverage and evidence

| Area | Result |
|---|---|
| Reception login and patient registration | Passed; 10/10 markers and generated UHIDs verified |
| Paper CBC order and cash collection | Passed; one order and synthetic cash receipt |
| Lab sample collection and processing | Passed; sample collected; no configured CBC consumables |
| CBC result entry and verification | Passed; 18 parameter values saved and verified |
| X-ray paper order and cash collection | Passed; one paid order |
| Medical Superintendent imaging index | Passed for read visibility; Scan room control was incorrectly exposed and rejected |
| Imaging acquisition/report/signing | Not tested; no verified radiology login in this task |
| Doctor-facing result persistence | Not tested; doctor credential remains unmatched |
| Imaging print preview | Not tested; no print action used |

Registration evidence: `SUR-10-021-patient.png` through `SUR-10-030-patient.png`, `SUR-10-patient-index-after.png`. Diagnostic evidence includes `SUR-10-paper-order-ready.png`, `SUR-10-investigation-queue-before-payment.png`, `SUR-10-cash-collection-ready.png`, `SUR-10-cash-collection-saved.png`, `SUR-10-sample-collected.png`, `SUR-10-result-entry-filled.png`, `SUR-10-verified-result.png`, `SUR-10-imaging-role-index.png`, `SUR-10-imaging-payment-saved.png`, and `SUR-10-imaging-unauthorized-control.png`.
