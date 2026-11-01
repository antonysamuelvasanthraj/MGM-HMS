# MGM HMS — QA and Hospital-Workflow Acceptance Report

**Date:** 30 October 2026  
**Scope:** Sections 18–30 of the requested audit, relevant login/security checks, existing regression suites, desktop and phone-width role sweeps, and final data-integrity checks.  
**Environment:** Isolated database copy under `acceptance-backups/qa-20261027`, tested on `http://localhost:4398`; self-contained suites used their own disposable database copies. The live server on port 4300 and the public link were not used for testing.  
**Change policy:** No application source code, test code, or live settings were changed. QA records and temporary setting changes were made only on the disposable copy; the investigation-release setting was restored.

## Executive result

**Do not treat the system as fully accepted yet.** One high-severity clinical sign-off defect, two medium requirement/workflow gaps, and one low operational-readiness finding were reproduced.

- **1 High:** signed USG reports can be overwritten without a reason or before/after audit, including by a radiology technician.
- **2 Medium:** chat editing conflicts with the stated immutable-history requirement; preventive maintenance is only partially implemented.
- **1 Low:** the built-in go-live checklist is incomplete.
- **No Critical finding reproduced.**
- **No payment, receipt, payer-statement, stock, or double-entry integration mismatch reproduced.** Final reconciliation returned zero mismatches.
- All **41 listed logins** completed their visible-menu sweep at desktop and phone widths. After the current pharmacy desktop batch was refreshed, each size covered **970 screen visits** with no confirmed blank screen, JavaScript exception, failed API load, or unexpected access restriction.

---

## A. Coverage and findings summary

| Area | How far tested | Critical | High | Medium | Low |
|---|---|---:|---:|---:|---:|
| 18. Overview, chat/tasks, roster, stores, maintenance | Full for listed workflows; preventive-maintenance depth checked | 0 | 0 | 2 | 0 |
| 19. Reception extras, appointments, payments, tracking, queue | Full for listed workflows and realtime queue update | 0 | 0 | 0 | 0 |
| 20. Clinical, consultation, orders, templates, certificates, counselling | Full for listed workflows; physical capture not tested | 0 | 0 | 0 | 0 |
| 21. Emergency Desk | Full for listed workflows via regression and API checks | 0 | 0 | 0 | 0 |
| 22. IPD extras, nursing/eMAR, stock, ICU, cleaning, discharge | Full for listed workflows | 0 | 0 | 0 | 0 |
| 23. USG reporting, sign-off, print, amendment | Full for sign-off/amendment logic; physical printing not tested | 0 | 1 | 0 | 0 |
| 24. Pharmacy extras, emergency stock, returns, handover, alerts | Full for listed workflows | 0 | 0 | 0 | 0 |
| 25. OT, maternity and partograph | Full for listed workflows | 0 | 0 | 0 | 0 |
| 26. Billing, approvals, messages, packages, payers/TPAs | Full for listed workflows; real gateway delivery not tested | 0 | 0 | 0 | 0 |
| 27. Finance, receivables, expenses, visiting doctors, closing | Full for listed workflows and final reconciliation | 0 | 0 | 0 | 0 |
| 28. Administration, roles, tariffs, beds, audit, quality, sync, access | Full for listed workflows; real cloud sync not tested | 0 | 0 | 0 | 0 |
| 29. Portal, backups, go-live, demo mode, themes, login | Full for software behavior; physical/off-site operations partial | 0 | 0 | 0 | 1 |
| 30. Role sweep | Every visible menu route for all 41 logins at 1440 px and 375 px; representative visual checks and static dead-button scan. Not every modal/button was exercised at both sizes. | 0 | 0 | 0 | 0 |
| **Total reproduced findings** |  | **0** | **1** | **2** | **1** |

### Additional verified behavior

- Appointments rejected double booking with `409 slot_taken`; no-show and rebooking worked.
- The public queue display changed after vitals were recorded without a manual reload.
- Consultation amendment without a reason returned `409 amendment_reason_required`; reasoned amendment worked.
- eMAR required reasons for held/refused doses and rejected duplicate administration.
- Existing bills retained their old price after a tariff change.
- A blocked bed refused admission; restoration worked.
- Partograph displayed alert/action lines and a textual high-risk fetal-tachycardia warning.
- Daily reminders ran once per day; a forced repeat did not resend the same reminders.
- Both themes switched and restored correctly. Demo mode off/on worked on the copy.
- My Access showed the admin role's screens, permissions, realtime link and sessions; server-side session tokens are masked.

---

## B. Reproduced findings

### QA-01 — Signed USG reports can be overwritten without reason, version history, or proper sign-off authority

**Severity:** High  
**Roles:** Radiologist; Radiology Technician  
**Screen/API:** USG Reporting / `POST /api/imaging/orders/:id/report`; audit at `/api/audit?entity=reports&entity_id=2`

**Steps reproduced on 30 October 2026:**

1. As the radiologist, posted a final report for imaging order 13 without an amendment reason.
2. The server returned HTTP 200 and saved report 2 as `amended`, signed by the radiologist.
3. As the radiology technician, posted different findings and impression with `status:"final"` for the same order, again without a reason.
4. The server returned HTTP 200, changed the order to `verified`, and replaced the report content and signer with the technician.
5. Read the audit rows for report 2.

**Expected:**

- Only an authorized reporting clinician should sign or amend a final diagnostic report.
- Amending a signed report should require a reason and create a retained version.
- The audit should preserve the previous and replacement clinical content, signer, timestamp and reason.

**Actual:**

- The technician overwrote the radiologist's signed findings and impression.
- The same report row was reused; previous clinical content was not retained as a report version.
- Audit rows contained `reason:null`, `before:null`, and `after:null`; detail contained only the order number.
- A no-reason final submission was accepted with HTTP 200.

**Impact:** Incorrect or unauthorized diagnostic content can appear as the current verified report. The hospital cannot reliably prove who changed the clinical interpretation or what the earlier signed report said. This is a patient-safety and medico-legal records risk.

**Evidence:** `acceptance-evidence/usg-signoff-defect-kimi-20261030.json`  
The evidence includes both HTTP 200 responses, report ID 2, the changed signer/content, and audit rows with null before/after/reason.

**Likely code location:** `server/routes/diagnostics.js:312-343`, imaging report POST handler. The handler checks `imaging.report` permission but does not enforce a separate final-sign/amend permission, amendment reason, or immutable report versions. UI entry points: `client/src/views/usg-reporting.js` and `client/src/views/imaging.js`.

---

### QA-02 — Team Chat permits editing despite the acceptance requirement that messages cannot be edited

**Severity:** Medium  
**Role:** Message author; management reviewer for history  
**Screen/API:** Team Chat & Tasks; `PATCH /api/staff-work/chat/:id`

**Steps:**

1. Send a chat message.
2. Select **Edit**, change the text and save.
3. Open **Edit history** as a permitted reviewer.

**Expected:** The stated acceptance rule says messages cannot be deleted or edited and history is kept.

**Actual:** Authors can edit their own messages for 900 seconds. Earlier text is retained in revisions, stale-version edits are rejected, and management can review revisions. No delete action was found.

**Impact:** This is a requirement mismatch rather than lost history. If chat is used for clinical handover or medico-legal instructions, the hospital must decide whether editable messages are acceptable and document that policy.

**Evidence:** `acceptance-evidence/extended-workflow-kimi-20261027.log`, item 1; manually reproduced in the browser on the isolated copy.

**Likely code location:** `server/routes/staff-work.js:194-209`; `client/src/views/staff-workspace.js:63-67,192-198`.

---

### QA-03 — Preventive maintenance is limited to date fields; no complete PM work-order/history workflow was established

**Severity:** Medium  
**Role:** Maintenance; Hospital Admin  
**Screen:** Maintenance & Assets

**Steps:**

1. Create an asset and set last-service and next-service dates; the due indicator displays.
2. Create a repair ticket and move it through open → assigned/in progress → resolved.
3. Inspect the asset form and available maintenance actions for preventive-maintenance scheduling, completion and service history.

**Expected:** Equipment register, repair tickets and preventive maintenance should support a repeatable PM schedule and verifiable service history.

**Actual:** Asset registration and repair tickets work. Preventive maintenance is represented by `last_service` and `next_service` fields and a due warning, but no separate PM plan/work-order completion history was established.

**Impact:** Staff can record dates but cannot demonstrate a complete preventive-maintenance cycle and audit history from the established workflow.

**Evidence:** Manually created asset `AST-0024` and ticket `MT-261027-001` on the isolated copy; `client/src/views/maintenance.js:73-80,131-139` shows the date fields and repair-ticket actions.

**Likely code location:** `client/src/views/maintenance.js` and the maintenance handlers in `server/routes/backoffice.js`.

---

### QA-04 — Built-in go-live checklist remains incomplete

**Severity:** Low for the tested copy; operational readiness blocker before production use  
**Role:** Hospital Admin  
**Screen:** Settings → Before going live

**Observed result:** **4 of 8 done**, with four items outstanding:

1. One administrator login still uses a default password.
2. Fifteen laboratory tests have results without reference ranges.
3. Two demonstration/test patient records remain.
4. Backups still need to be copied off the computer; this item is informational but remains operationally necessary.

**Expected:** All mandatory go-live controls should be resolved before real patient use.

**Actual:** The application correctly detects and reports these gaps. This is not classified as a software defect, but it is a reproduced readiness finding.

**Evidence:** Settings page on the isolated copy; `acceptance-evidence/role-sweep-kimi-mobile-20261027/batch-1/hosp.admin__settings.png` shows the Settings screen, while the expanded checklist was inspected through the accessibility tree.

**Likely code location:** `server/go-live.js`; `client/src/views/settings.js:275-292`.

---

## C. Integration gaps

**No cross-module financial or inventory mismatch was reproduced in the final checks.**

Final results on the copied database:

- `/api/accounts/integrity`: HTTP 200, `ok:true`; no unbalanced vouchers, no orphan vouchers, trial-balance difference `0`.
- `/api/accounts/integration-reconciliation?from=2000-01-01&to=2100-12-31`: HTTP 200; **0 mismatches** across bills, receipts and payer settlement/balance calculations.
- `SELECT round(sum(debit-credit),2) FROM journal_lines`: `0`.
- `PRAGMA integrity_check`: `ok`.
- `PRAGMA foreign_key_check`: empty.
- Negative quantities in `medicine_batches`: none.
- Negative quantities in `store_stock`: none.
- Verified lab orders without results: none.
- Verified imaging orders without reports: none.
- Cancelled orders still attached to active bills: none.
- Tax-inclusive bill-line/gross and bill-total consistency mismatches: none.

**Evidence:** `acceptance-evidence/final-api-integrity-kimi-20261030.json` and `acceptance-evidence/final-db-integrity-kimi-20261030.json`.

The USG issue in QA-01 is nevertheless a **clinical-to-audit integration gap**: the diagnostic report changes, but the audit trail does not retain the corresponding clinical before/after state.

---

## D. Hospital-practice gaps

1. **Medico-legal diagnostic record control — High:** QA-01 prevents reliable USG sign-off, amendment and provenance. Final reports need role-appropriate signing, mandatory amendment reasons and immutable versions.
2. **Clinical handover policy — Medium:** QA-02 requires an explicit hospital decision on whether editable chat is acceptable for handover or other clinical communication.
3. **Biomedical/NABH-style maintenance evidence — Medium:** QA-03 provides dates and repair tickets but not a complete preventive-maintenance work-order and service-history trail.
4. **Go-live controls — Low/operational:** QA-04 must be cleared, especially shared/default credentials, missing lab reference ranges and off-computer backups.
5. **External operational controls not proven:** Physical printing, microphone/camera capture, real SMS/WhatsApp delivery, cloud-sync behavior across a real network, UPS behavior and LAN failover were not established by this software audit; see Section F.

No additional NABH, IRDAI/TPA, GST or Aarogyasri defect is claimed without reproduction. The tested payer-policy example correctly split a ₹50,000 bill into ₹40,000 payer and ₹10,000 patient responsibility, and the Aarogyasri checklist/payer-conversion suites passed.

---

## E. Existing test-suite results

| Suite | Final result | Coverage/result |
|---|---|---|
| `npm test` | Pass | Realtime client pass; smoke: 1,300 API checks and 140 list endpoints; integration regression: 278 checks |
| `tools/payer-change-test.mjs` | Pass | OP/IP payer conversion, refunds, approvals, Aarogyasri checklist, books/audit |
| `tools/manual-workflow-test.mjs` | Pass | Walk-ins, discounts, packages, pharmacy paper Rx, lab reporting, IP ledger |
| `tools/hospital-mode-test.mjs` | Pass | 10 checks; clean self-contained run on 30 October |
| `tools/investigation-queue-test.mjs` | Pass | 10 checks; clean self-contained run on 30 October |
| `tools/outsourcing-test.mjs` | Pass | 10 checks, including versions, outside signatory, payables and no duplicate patient charge |
| `tools/lab-operations-test.mjs` | Pass | 10 checks, including stock, accession, critical read-back and consumable posting |
| `tools/payer-policy-test.mjs` | Pass | 5 checks, including limits, deductible/co-pay and books |
| `tools/extended-workflow-test.mjs` | Pass | 70 checks across chat/tasks, roster, maternity/partograph, clinic/appointments and counselling-engine availability |
| `tools/dead-button-check.mjs` | Pass | 0 findings in 111 client files; static handler check, not a substitute for clicking every button |
| `tools/local-server-test.mjs` | Pass | Startup, missing-DB protection, crash recovery, backup/restore, retention, corruption rejection and shutdown |

### Earlier investigation-suite failures — resolved as configuration/precondition issues

On the manually configured QA copy, both `hospital-mode-test` and `investigation-queue-test` initially stopped because they expected `awaiting_payment` but the copy was configured for **Straight away** release and returned `ordered`. This was not reported as a product defect.

Both suites passed 10/10 on clean self-contained runs, and the investigation suite explicitly passed its **Straight away** release-rule check. An intermediate rerun attempted while another QA server occupied port 4398 was discarded as invalid; it was not used as evidence.

**Evidence:**

- Initial configuration-dependent failure: `acceptance-evidence/workflow-suites-kimi-20261027.log`
- Final hospital-mode pass: `acceptance-evidence/hospital-mode-final-kimi-20261030.log`
- Final investigation-queue pass: `acceptance-evidence/investigation-queue-final-kimi-20261030.log`
- Other suite logs: `acceptance-evidence/npm-test-kimi-20261027.log`, `diagnostics-suites-kimi-20261027.log`, `extended-workflow-kimi-20261027.log`, `dead-button-kimi-20261027.log`, and `local-server-backup-kimi-20261027.log`

---

## F. Not tested or only partly tested

- **Physical printing:** no hospital printer, token printer, label printer or printed output was physically verified.
- **Physical audio/video:** local counselling transcription engine availability passed, but a real microphone, camera and transcription accuracy were not tested.
- **Real SMS/WhatsApp gateway:** queuing, no-gateway behavior and once-daily reminder logic were tested; no real external message delivery or provider credentials were used.
- **Real cloud sync:** sync status and queue behavior were tested locally; no real remote endpoint, WAN interruption or multi-site synchronization was tested.
- **UPS, power loss and LAN behavior:** application crash recovery passed, but no physical power/UPS test, network partition or multi-desk LAN failover was performed.
- **Off-site backup operations:** backup/restore and integrity checks passed on a spare copy; an actual off-computer backup rotation and disaster-recovery drill were not performed.
- **Exhaustive phone visual/modal inspection:** every visible menu route was loaded for all 41 logins at 375 px and representative screens were visually checked. Not every table state, modal, validation message and button was manually exercised at both desktop and phone widths.
- **External device integration:** no laboratory analyzer, PACS/DICOM device, barcode/QR hardware, payment terminal or biometric attendance device was connected.
- **Production security assessment:** role/API checks and session behavior were exercised, but this was not a penetration test or a review of production network/firewall configuration.

### Role-sweep evidence

- Desktop raw results: `acceptance-evidence/role-sweep-kimi-batch-1.json` through `batch-8.json`, with the current pharmacy batch in `role-sweep-kimi-batch-6-current.json`.
- Desktop summary: `acceptance-evidence/final-desktop-role-sweep-summary-kimi-20261030.json` — 41 users, 970 screen visits, no reported issues.
- Phone raw results: `acceptance-evidence/role-sweep-kimi-mobile-batch-1.json` through `batch-8.json` — 41 users, 970 screen visits.
- One pharmacist `/indents` phone capture caught a transient unstyled loading state during parallel execution. It was immediately rerun in isolation and loaded correctly with no errors; it is not reported as a defect. Recheck: `acceptance-evidence/mobile-indents-recheck.json` and `acceptance-evidence/mobile-recheck/pharmacist__indents.png`.
- Login authentication evidence: `acceptance-evidence/login-sweep-kimi-20261027.txt` — all 41 listed accounts plus the bootstrap administrator authenticated successfully at that checkpoint.

---

## Acceptance recommendation

**Hold full clinical acceptance until QA-01 is fixed and retested.** Then confirm the chat-editing policy, decide the required preventive-maintenance depth, and clear the go-live checklist. Payment, billing, payer conversion, stock, core clinical workflows, backups and role/menu loading otherwise showed strong regression results in the tested scope.

---

## G. Remediation and verification — 30 October 2026

This appendix supersedes the open software-defect status of QA-01 through QA-03 above. The original findings and reproduction evidence are retained unchanged for traceability. QA-04 remains open because it requires hospital operational action rather than source-code changes.

### QA-01 — Remediated and retested

- Final imaging/USG signing is restricted to the `imaging_admin` radiologist role. A technician final submission returns `403 radiologist_sign_required`.
- A signed report cannot be overwritten by a draft (`409 signed_report_immutable`). A radiologist amendment requires a reason (`400 amendment_reason_required` when omitted).
- Each amendment snapshots the previous signed content in `report_versions`, increments `version_no`, records the amendment reason, and writes full before/after/reason audit details.
- Both imaging screens expose the appropriate draft/sign/amend actions and version history. Focused desktop and phone captures confirmed that the technician has no sign/amend action while the radiologist does.

### QA-02 — Remediated and retested

- Chat messages can no longer be edited by the author, recipient or administrator. Existing-message PATCH requests return `409 chat_immutable`, and the original body remains unchanged.
- The Edit action is removed. Legacy revisions remain available only to authorised management reviewers as **Earlier versions**. Task assignment, progress and review behavior is unchanged.

### QA-03 — Remediated and retested

- Added preventive-maintenance scheduling, asset/assignee selection, due date, optional recurrence interval and checklist.
- Added completion evidence, work-performed text, service/vendor reference, cost, calculated or explicit next-service date, cancellation with a required reason, and permanent service history.
- Completion updates the asset's last/next service dates. Scheduling, completion and cancellation are audited with before/after/reason details.

### Additional fixes made during regression verification

- The existing bulk stock-adjustment screen now invalidates an uploaded, unposted count when another desk changes stock, requiring a fresh template instead of risking stale quantities.
- `deployment/Restore-Backup.ps1` now accepts `node.exe`, `node.cmd` or `node` when no bundled runtime is present; the complete backup/restore test subsequently passed.
- Test fixtures were aligned with the intended radiologist-only sign-off and immutable-chat policies. The payer test can use `HMS_TEST_DATA` so it runs against a disposable QA copy rather than depending on live patient fixtures.

### Observed verification results

| Check | Result |
|---|---|
| `tools/qa-fix-regression-test.mjs` | **Pass — 32 focused API checks** covering the original USG overwrite scenario, chat immutability and the full PM lifecycle |
| `npm test` | **Pass** — realtime client; **1,310 smoke API checks / 143 list endpoints**; **278 integration-regression checks** |
| Payer-change suite | **Pass** — OP/IP conversion, refund/keep/reversal, approvals, Aarogyasri checklist, audit and balanced books on a disposable QA copy |
| Manual workflow, hospital mode and investigation queue | **Pass** — all reported workflow checks |
| Outsourcing, lab operations and payer policy | **Pass** — 10, 10 and 5 scenario groups respectively |
| Extended workflow | **Pass — 71 API checks**, including immutable chat and unchanged task/privacy rules |
| Dead-button scan | **Pass — 0 findings in 118 client files** |
| Local server | **Pass** — startup, missing-DB protection, port conflict, crash recovery, online backup, checksum/attachment restore, retention, corruption rejection and graceful shutdown |
| Focused browser checks | **Pass — 12 screen loads** across desktop (1440×900) and phone (390×844), with no JavaScript exception, failed API load or panel error; representative screenshots visually reviewed |
| Final syntax checks | **Pass** for all changed application modules |

Focused evidence: `reports/qa-fix-regression-results-20261030.json`, `acceptance-evidence/qa-fix-desktop/`, and `acceptance-evidence/qa-fix-phone/`. All remediation tests used disposable databases. The live database/server on port 4300 was not changed, and the isolated UI test server was stopped.

The earlier 41-login / 970-visits-per-layout role sweep remains valid as the original audit checkpoint, but it was **not** rerun as a full 41-login sweep after these fixes. The post-fix browser verification was deliberately focused on the changed screens.

### QA-04 — Still open: hospital go-live actions

The following items were **not** changed or marked complete by this remediation:

1. Replace the remaining default administrator password through the hospital's credential-management process.
2. Clinically review and enter the 15 missing laboratory reference ranges; no ranges were invented.
3. Review and remove the two remaining demonstration/test patient records using the hospital's approved live-data process.
4. Copy backups off the computer and perform the hospital's off-site rotation/disaster-recovery drill.

Full production acceptance therefore still depends on clearing these operational controls and completing the external checks listed in Section F.
