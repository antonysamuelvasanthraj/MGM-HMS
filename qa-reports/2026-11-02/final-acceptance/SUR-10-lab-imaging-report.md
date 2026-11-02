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
