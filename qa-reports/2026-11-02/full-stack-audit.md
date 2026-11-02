# MGM HMS full-stack audit — 2 November 2026

## Status and scope

This report consolidates the code-audit pass and the SUR-3 UI Tester report. **SUR-2 remains incomplete** because hands-on UI testing was blocked before launch; the UI report supplies coverage status and an environment blocker, not a passing browser result. The local Paperclip API was unreachable (`127.0.0.1:3100`, connection refused); no issue update or report link could be posted in Paperclip from this heartbeat. The companion UI report is [ui-audit-report.md](/E:/MGM%20HMS/qa-reports/2026-11-02/ui/ui-audit-report.md).

The checkout contains concurrent uncommitted UI and billing changes. They were preserved and reviewed; see the [SUR-7 fix and retest log](SUR-7-fix-log.md) for findings and test evidence. No live database was inspected, no request was sent to port 4300, and no deployment or live-system write occurred.

## Executive summary

The repository contains broad OP, IPD, clinical, diagnostics, pharmacy, accounting, payer, staff, admin, and patient-portal workflows. The clearest confirmed product gap is that cloud sync delivery is deliberately unavailable: local mutations enter a queue, while `/sync/flush` returns HTTP 503 and the queue remains local. The backup checklist also explicitly cannot establish off-device recovery. These are deployment requirements to resolve or formally exclude, not newly discovered code regressions.

No new functional defect was reproducibly demonstrated in this static-only pass. Prior review documents report the active demo environment/default credentials and unvalidated numeric lab reference ranges as go-live blockers; their current live state was not rechecked here. No claim is made that all bugs have been found.

## Coverage matrix

| Area / roles | Code inspected | Coverage and result |
|---|---|---|
| App bootstrap, sessions, static delivery | `server/index.js`, `server/auth.js` (referenced) | Middleware order, API mount points, health route, static and SPA fallback inspected. No runtime auth/session test this run. |
| OP registration, patient records, consultation | `server/routes/opd.js`, `patients.js`, `clinical.js` (route inventory) | Route modules identified; prior `APPLICATION-REVIEW-2026-11-01.md` reports workflows passing. Fresh behavioral verification not run; UI Tester browser coverage blocked. |
| IPD, wards, nursing, ICU, maternity, OT, discharge | `server/routes/ipd.js`, `operations.js`, client screens | Modules/screen inventory confirmed. Historical IPD checks reviewed; fresh runtime verification not run. |
| Lab, imaging, outsourced diagnostics | `diagnostics.js`, `labops.js`, `outsourcing.js`, `routes/outsourcing.js` | Numeric-range policy and release/order code paths located. Current data quality not verified. |
| Pharmacy, inventory, stores, suppliers | `pharmacy.js`, `inventory.js`, `stores.js`, related client screens | Modules present; latest review says stock and permission regressions passed on isolated data. Not rerun. |
| Billing, payments, payer/scheme, accounting | `billing.js`, `scheme-payments.js`, `accounts.js`, `payments.js`, client billing screens | Modules present; historical reviews report balanced accounting and role gates. No fresh financial mutation or runtime tests. |
| Admin, settings, users, approvals, audit, quality, maintenance | `backoffice.js`, `core.js`, `approvals.js`, remaining route inventory | Admin workflows and role/menu tests reported historically. Not rerun. |
| Staff operations | `staff-work.js`, `visiting.js`, `referrals.js`, `messages.js` | Staff workspace, attendance/visiting, messaging and referrals screens/routes present. No fresh end-to-end checks. |
| Patient portal and attachments | `portal.js`, `attachments.js`, `casedocs.js` | PIN/OTP/session and attachment permission code inspected. No authenticated adversarial runtime check; see unverified risks. |
| Integrations, backup, sync | `messages.js`, `backup.js`, `/sync` routes in `backoffice.js` | SMS gateway is optional/configured; cloud delivery is explicitly unimplemented. Off-device restore remains unverified. |
| Hands-on UI, roles and viewports (SUR-3) | Login, OP/IPD, diagnostics, pharmacy, billing, admin and responsive workflows | **Blocked; no browser interactions occurred.** No confirmed UI defects or usability findings; see linked UI report for complete coverage matrix and setup evidence. |

Application contains 79 client view controllers and 32 server route modules (file counts at this checkout). These counts indicate breadth, not completeness.

## Prioritized register

### Confirmed gaps / operational blockers

#### SUR2-GAP-01 — No cloud sync receiver

- **Severity:** High if multi-site/cloud delivery is a go-live requirement; otherwise informational scope limitation.
- **Location:** [server/routes/backoffice.js](/E:/MGM%20HMS/server/routes/backoffice.js:819), `/sync/flush`.
- **Expected:** A configured sync receiver authenticates, transmits queued changes, and only marks records delivered after receiver acknowledgement.
- **Actual:** The route intentionally returns `503 cloud_sync_unavailable`; its detail says records remain queued. No receiver is bundled. Local-sync UI and queue do not constitute cloud delivery.
- **Reproduction:** Read the route; when a server is safely available, an authorized admin `POST /api/sync/flush` should return 503 by design. This audit did not call the route.
- **Impact:** Cloud backup/multi-location replication cannot be relied upon. Treating queued or locally retried records as delivered risks data divergence.
- **Recommended fix:** Decide whether cloud delivery is a requirement. If yes, implement an authenticated receiver contract, retry/backoff, idempotency, acknowledgements, and reconciliation tests. If no, label the feature local-only in requirements and operations material.

#### SUR2-GAP-02 — Off-device backup recovery is not verified

- **Severity:** High operational risk before go-live.
- **Location:** [server/go-live.js](/E:/MGM%20HMS/server/go-live.js:59); `server/backup.js`.
- **Expected:** At least one current backup copy is restorable from a separate failure domain, with a documented drill.
- **Actual:** The checklist always reports `offsite` as false and instructs copying the local backup folder elsewhere. The latest review says same-machine restore was exercised, but off-machine restoration was not.
- **Evidence:** Source code and `APPLICATION-REVIEW-2026-11-01.md`; no live filesystem/database was examined in this pass.
- **Impact:** A local disk/server failure can remove both primary data and its backups.
- **Recommended fix:** Establish managed off-device copies and complete a restore drill to a separate machine or isolated VM; record recovery time and data-point achieved.

### Previously reported, not reverified in this pass

#### SUR2-OPEN-01 — Demo/default credentials and demo records may remain

- **Severity:** Critical if default credentials are active in a production-reachable environment; otherwise go-live blocker.
- **Location:** [server/go-live.js](/E:/MGM%20HMS/server/go-live.js:26), `:36`, `:62`; public demo credentials are also documented in README.
- **Expected:** Production deployment uses a non-demo environment, unique credentials, and no synthetic patient records.
- **Actual:** `goLiveCheck()` detects demo mode, checks active accounts against `surely` and `admin123`, and detects certain demo patient naming patterns. The 1 Nov review reported demo mode and default Admin password still active. This run did not inspect current environment, hashes, or patient rows; current exposure is therefore **unverified**.
- **Impact:** Known demo credentials create broad unauthorized access if still active; demo records can contaminate care and reporting.
- **Recommended fix:** Before production exposure, rotate all demo credentials, remove test records through an approved data process, and independently verify the go-live checklist. Do not run reset/seed commands on live data.

#### SUR2-OPEN-02 — Numeric lab services may lack validated reference ranges

- **Severity:** High clinical safety/readiness concern where numeric results are used.
- **Location:** [server/go-live.js](/E:/MGM%20HMS/server/go-live.js:44); `server/routes/diagnostics.js` range selection around lines 155–165.
- **Expected:** Every numeric analyte has an age/sex-appropriate validated range, text interpretation, or approved rules.
- **Actual:** Go-live checklist flags numeric parameters with none of these. The 1 Nov review reported 15 affected services. Current service data and clinical validation were not inspected in this run; count/state is **unverified**.
- **Impact:** Abnormal values may not be flagged and reports may lack interpretive context.
- **Recommended fix:** Have the laboratory validate ranges against its method and population, then verify flags with controlled synthetic fixtures. Do not invent clinical ranges.

### Suspected risks requiring targeted runtime review

#### SUR2-RISK-01 — Patient portal brute-force/rate-limit behavior

- **Severity:** Medium, unconfirmed.
- **Location:** `server/routes/portal.js` login, OTP and verification handlers; implementation around lines 95–170.
- **Evidence:** Handlers call `ipGuard`, increment failures and use account lockout for known portal accounts. The portal login may evaluate multiple identifier candidates; correctness and rate-limit behavior across shared/mobile identifiers require adversarial tests.
- **Expected:** PIN/OTP guesses are bounded consistently by account and source without account enumeration.
- **Actual:** Static inspection shows both IP and account controls exist; no bypass was proven. Marked **suspected/unverified**, not a confirmed vulnerability.
- **Recommended verification:** In a disposable database, test unknown identifiers, shared mobile numbers, repeated OTP verification, lockout expiry, and proxy/IP behavior. Do not perform this against live accounts.

#### SUR2-RISK-02 — Attachment reads rely on entity-level permission checks

- **Severity:** Medium, unconfirmed privacy risk.
- **Location:** `server/routes/attachments.js` entity permission map and file-read route.
- **Evidence:** Reads require authentication and entity-specific capability checks; patient entity access is based on broad clinical/edit permissions. This pass did not establish whether record-level scope is enforced consistently with each role’s assigned patient scope.
- **Expected:** Every download is authorized for the specific patient/case and audited without exposing files through static paths.
- **Actual:** No unauthorized read was demonstrated; record-scope behavior remains unverified.
- **Recommended verification:** Use synthetic records and least-privileged roles to test cross-patient and cross-case attachment IDs, direct file URLs, removed files, and merged patients.

## Incomplete implementation / requirements inventory

| Item | Status | Evidence / owner action |
|---|---|---|
| Cloud sync delivery | Not implemented in this bundled local model | `backoffice.js` deliberately returns 503; decide scope or build receiver. |
| Off-device backup and recovery | Not verified | Go-live checklist hard-codes offsite as informational false; conduct separate-system restore. |
| SMS/WhatsApp gateway | Optional external integration | `messages.js` sends only when an SMS gateway URL is configured; external gateway behavior/configuration is outside this audit. |
| Production readiness data | Previously reported incomplete | 1 Nov review notes demo mode/default Admin password, 15 lab range gaps, and demo records; current data not read. |
| Whole-application role/UI coverage | Partial; SUR-3 resumed a bounded pass | Historical role/menu audits are automated checks; the browser pass covered admin setup and synthetic receptionist navigation, patient registration, and appointment empty states only. |
| Physical devices/external integrations | Untested | No analyzer, printer/scanner, SMS provider, PACS/DICOM, or off-site cloud receiver was exercised. |

## UI testing results integrated from SUR-3

### Later acceptance-run authentication blocker (SUR-9 / SUR-11)

Subsequent authorized local-app runs on port 4300 rejected existing doctor and reception credentials, then showed an app-wide lockout after a separate registration login attempt (SUR-9). A separate SUR-11 run also had two existing pharmacy logins rejected. Testers stopped at the lockout/rejections; no credentials, accounts, roles, permissions, or records were changed. See [SUR-9 clinical QA](final-acceptance/SUR-9-clinical-qa-report.md) and [SUR-11 pharmacy QA](final-acceptance/SUR-11-pharmacy-stock-qa.md). This is a confirmed acceptance access blocker and a bug candidate; it is not yet a reproduced code-level cause and does not show every account fails. No further login attempt should be made until the existing account owner verifies account state and coordinates a clean retest. The associated clinical/pharmacy workflows and campaign entries remain untested.

The operator subsequently clarified that the current HTTP 429 is the shared/IP 10-minute wrong-password limiter (`WINDOW=10min`, `LIMIT=8`), and privately verified the current credential rows without network attempts. This is not proof the verified passwords are wrong. SUR-12 later recorded a single HTTP 401 and stopped; that result also does not by itself establish a credential mismatch. Keep account/security settings unchanged, wait for natural cooldown expiry, and coordinate one reception retest first before staggering other roles. The operator separately confirmed the source regression suites pass (realtime-client; smoke 1,321 API checks / 147 list endpoints; integration 279 checks); these do not establish UI acceptance or count as campaign patients. See the [SUR-7 fix log](SUR-7-fix-log.md).

- **Outcome:** SUR-3 completed a bounded browser pass on the isolated instance. This is partial coverage, not a clean whole-application UI pass.
- **Setup evidence:** In this SUR-7 run, Node v24.16.0 script execution succeeded; the prescribed diagnostic reported Paperclip health 200, isolated app navigation 200, and the expected MGM HMS login page. The previously reported Node initialization failure is no longer reproduced in this runner.
- **Coverage:** Admin sign-in and Users & Roles, synthetic receptionist sign-in/navigation, synthetic patient registration and validation, desktop/mobile appointment empty states, and a small responsive patient-list check were completed. OPD/IPD/clinical workflows, diagnostics, pharmacy, billing actions, role restrictions, accessibility, and most viewports remain untested. Full notes and sanitized evidence are in [the SUR-3 UI report](/E:/MGM%20HMS/qa-reports/2026-11-02/ui/ui-audit-report.md).
- **UI findings:** No confirmed defect in completed checks. The 400 px patient view has a possible clipped-content usability concern that needs a fuller responsive pass. No real patient data was used.
- **Account safety / SUR-8 dependency:** The UI report records creation of a synthetic receptionist account before the latest owner requirement. Current operator read-only inventory confirms nine existing roles/accounts on the actual app at port 4300; the three accounts on isolated port 4388 are unrelated test accounts and do not indicate missing application roles. No account changes are authorized; do not copy/create/reset users, roles, permissions, or authentication settings. The owner has authorized SUR-8 to enter exactly 50 clearly marked synthetic patients plus test GRNs, bills, and simulated payments through the port 4300 UI. SUR-8 owns those writes; SUR-7 made no campaign entries or port 4300 writes. This campaign authorization does not permit changes to pre-existing records/accounts, real gateway actions, or external submissions.

## Tests and evidence

- **Historical blocker:** An earlier heartbeat's `npm test` failed before assertions because Node aborted with `ncrypto::CSPRNG(nullptr, 0)`. That result remains valid for that run only; current checks below pass.
- **Current SUR-7 run:** Fresh `npm test` passed the realtime-client test, smoke suite (1,320 API checks, 147 list endpoints, synthetic workflows), and integration regressions (279 checks). `node tools/scheme-line-payment-test.mjs` passed 61 focused synthetic checks. `npm run build:css` completed successfully with an outdated Browserslist database advisory only. No live database/port 4300 was used.
- **Current browser/runtime checks:** The assigned `mgm-browser-smoke.mjs` passed: Node v24.16.0, Paperclip API health 200, Chrome, isolated app status 200, MGM HMS title, and three login form inputs. This proves login-page navigation only, not role or workflow coverage.
- **Isolation:** The test suites use synthetic fixtures and report live-data guards unchanged. No live database was inspected or changed; no request was sent to live port 4300.
- **Historical evidence reviewed:** `APPLICATION-REVIEW-2026-11-01.md` reports isolated test passes, role/menu checks, browser route checks, and same-machine backup/restore. `OPERATIONS-REVIEW-2026-11-02.md` summarizes operational tests but includes statements that require current-state verification.
- **Runtime checks blocked/not performed:** Current go-live checklist/database inspection; live API route behavior; portal and attachment access-control tests; deployment configuration; external integrations; remaining SUR-3 browser workflows; off-device recovery. Do not repeat user-management setup to expand UI testing.
- **Privacy:** No credentials, tokens, patient rows, or screenshots are included.

## Ordered remediation backlog

1. Verify and remove production demo credentials/data before any production exposure; confirm the environment is not demo.
2. Laboratory validates missing numeric reference ranges; verify synthetic abnormal/normal flag behavior.
3. Set up off-device backups and document a successful isolated restore drill.
4. Decide cloud sync scope; either implement receiver with delivery guarantees or formally document local-only operation.
5. Complete synthetic, least-privilege portal and attachment authorization tests.
6. Continue SUR-3 role, workflow, and viewport checks using only already-existing isolated-instance logins; stop authenticated checks if none work. Add confirmed or suspected findings with deduplication. Do not count unrun workflows as tested.

## Consolidation note

The SUR-3 evidence is integrated; its remaining UI checks are incomplete. Keep unverified items labeled as such; no statement here means every bug has been found.

### SUR-8/SUR-9 evidence update — 2026-11-02

The downstream SUR-9 result artifact records successful reception/admin sign-ins after natural cooldown (one reception attempt and three admin attempts; no failures), UI-created/persisted campaign records through marker 020, and 10/10 OP registrations and vitals persistence for markers 011–020. These are SUR-9 results, not SUR-7 activity. Doctor consultation notes, prescriptions, clinical orders, follow-up, nurse workflows, and billing/payment remain untested or unavailable in the current Paper-mode screens. The SUR-8 campaign ledger remains `in_progress`; staged blocks are not acceptance passes. The UI campaign remains distinct from source regression fixtures.

The receipt route source guard allows `billing.view`, `payment.view`, `payment.collect`, or `finance.view`; the default doctor role has none and admin has unrestricted `*`. The dedicated cross-role receipt endpoint denial probe is still not captured. Do not alter accounts or roles to manufacture a test identity. No new independently reproduced code defect is recorded in this SUR-7 continuation.
