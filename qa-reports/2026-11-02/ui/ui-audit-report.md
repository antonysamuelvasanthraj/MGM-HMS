# MGM HMS UI audit â€” 2026-11-02

## Result

**Partial hands-on browser coverage completed on 2026-11-02 after runner repair.** The earlier blocked attempts are retained below as history. The isolated app and Chrome/Playwright are now working. Admin and synthetic receptionist journeys were exercised; see “Resumed browser pass” and sanitized evidence. No confirmed UI defects were reproduced in completed checks. Clinical-role workflow coverage and the broader module matrix remain untested.

## Resumed browser pass — 2026-11-02

The runner repair was verified before resuming. Testing used the isolated MGM HMS server at `http://127.0.0.1:4388` with the separate `mgm-isolated-data` directory. Chrome ran headlessly through the provided Playwright installation. Only the disposable database was written. The live database and port 4300 were not accessed.

### Completed coverage

| Area | Role / viewport | Status | Result |
|---|---|---|---|
| Login | Admin, receptionist; desktop | Pass | Admin login succeeded; a synthetic receptionist account was created through Users & Roles and logged in successfully. |
| Users & Roles | Admin; desktop | Pass | Page loaded; synthetic staff account creation saved successfully. |
| Dashboard and navigation | Receptionist; desktop | Pass | Dashboard, Patients, Appointments, Reception Billing, and Admissions routes rendered without visible load-error text. |
| Patient registration | Receptionist; desktop | Pass | Required fields were validated. A malformed synthetic phone value received format feedback; corrected synthetic data created a record. Reload preserved it. The record screenshot was excluded from sanitized evidence. |
| Appointments | Receptionist; desktop and 400 px | Pass | Empty state rendered at both widths. |
| Patient list responsive check | Receptionist; 400 px | Pass with usability observation | Document width and scroll width were both 400 px; no horizontal page scroll. Empty-state screenshot shows some left-side content/navigation text visually clipped at this width. This is recorded as a usability observation, not a confirmed defect; menu state/layout needs a fuller responsive pass. |
| Route rendering sweep | Admin; desktop | Pass | 52 menu routes returned HTTP 200, rendered a page heading, and had no generic load-failure text. This does not verify module actions or role-specific access. |
| Browser console | Receptionist; tested routes | Pass | No page errors observed on the completed receptionist route sweep. |
| Logout, appointment CRUD, OPD, nursing, lab, imaging, pharmacy, IPD actions, payments, role restrictions, keyboard/focus/accessibility, tablet view | Applicable roles | Untested | Not covered in this bounded resumed pass. |

### Initial blocked-run findings (historical)

No confirmed UI defect was reproduced in the completed checks. The prior startup/browser tooling blocker is resolved for this runner; it is not an application defect. The mobile screenshot shows a potential layout/usability concern on the patient screen, but the exact interaction state and clipping cause were not established, so it is not filed as a defect.

### Sanitized evidence

- `browser-evidence-summary.txt` — summarized environment, interactions, and safety scope.
- `evidence-reception-patients-empty-400px.png` — empty patient search state at 400 px.
- `evidence-appointments-empty-desktop.png` — empty appointments state at 1280 px.
- `evidence-appointments-empty-400px.png` — empty appointments state at 400 px.

No credentials, session tokens, or patient record details are included in these artifacts.

## Follow-up role access check — 2026-11-02

The runner handoff explicitly restricted testing to the isolated port 4388 instance and prohibited any login-account changes. The server was restarted only against the already-existing assigned synthetic data directory, with `HMS_REQUIRE_EXISTING_DB=1`; no database initialization or seeding was run. I attempted sign-in using the existing entries in `DEMO-LOGINS.local.md` without recording their values. None of the 41 listed role entries authenticated. The login page then displayed its ten-minute lockout message. I stopped further sign-in attempts immediately and did not alter, reset, create, or delete any login account. The lockout response means all authenticated role workflows are blocked pending owner/admin direction; do not retry or bypass it during this audit.

| Area | Role / viewport | Status | Result |
|---|---|---|---|
| Existing demo account sign-in | 41 listed role entries; desktop | Blocked | None authenticated against isolated DB; login page displayed rate-limit/lockout feedback. Attempts stopped. |
| Login surface layout | Unauthenticated; 1280, 768, 400 px | Pass | Login page returned HTTP 200; visible inputs and submit control remained within viewport; document width equaled viewport at all sizes; no page errors. |
| Keyboard entry | Unauthenticated; desktop | Partial | Tab focused a password input; full focus order and screen reader behavior not assessed. |
| Staff workflows / role restrictions | All authenticated roles | Blocked | Existing demo logins did not work in assigned isolated instance; no account changes permitted. |

Sanitized screenshot: `evidence-login-400px.png`. No credentials, usernames, tokens, or patient details are present in the artifact.
## Earlier blocked-run setup checks (historical; superseded)

- Read `HANDS-ON-TEST-PROTOCOL.md` and `LOCAL-SERVER-GUIDE.md`. The prescribed UI test approach uses a separate database and a server bound to loopback.
- No browser automation tools or local Playwright/Puppeteer packages were found; Chrome and Edge executables are installed.
- `node --version` succeeds (v24.16.0). Starting `server/index.js` with `SURELY_DATA` pointed at a newly created empty temp directory, `HMS_HOST=127.0.0.1`, and `PORT=4388` aborts during Node process initialization with `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`. The app never starts and port 4388 does not listen.
- No browser session reached the app. The isolated startup failed before application code could open or create its database. No live database was accessed.
- Did not inspect or use private login data because there was no safe, working isolated server to log into. No live database was reset, seeded, migrated, or modified.

## Initial blocked-run coverage matrix (historical)

| Area | Role / viewport | Status | Notes |
|---|---|---|---|
| Login, logout, navigation | Staff roles; desktop and phone | Blocked | Browser and safe server unavailable |
| Patient registration and appointments | Reception; desktop and phone | Blocked | No synthetic test session |
| OPD, consultation, nursing, IPD, discharge | Doctor, nurse; desktop and phone | Blocked | No synthetic test session |
| Laboratory, imaging, pharmacy, inventory | Lab, radiology, pharmacy, store; desktop and phone | Blocked | No synthetic test session |
| Billing, receipts, reports, administration | Cashier, accounts, admin; desktop and phone | Blocked | No synthetic test session |
| Forms, validation, search, CRUD, persistence | All applicable roles | Blocked | No UI interactions performed |
| Role restrictions, errors, loading and empty states | All applicable roles | Blocked | No UI interactions performed |
| Modal, dropdown, keyboard, focus and accessibility | All applicable roles | Blocked | No UI interactions performed |
| Responsive layout at desktop, tablet and ~400px | All applicable roles | Blocked | No browser viewport available |
| Console and network behavior | All applicable roles | Blocked | No browser session/server |

## Initial blocked-run findings (historical)

No confirmed UI defects. No screenshots, console captures, or patient data were collected. The setup blocker is reproducible by starting the isolated server: the Node executable reports its version but aborts during native initialization when asked to execute the app. Sanitized runtime evidence is in `runtime-blocker-evidence.txt`. No database was opened.

## Initial blocked-run usability notes (historical)

None: the UI was not exercised.

## Original unblock steps (historical; runner access has since been repaired)

Provide a Node runtime that can execute scripts and a browser automation interface (Chrome/Edge binaries are present, but no automation package/tool is available). Then create/use a disposable database populated only with synthetic data, start the application on an unused loopback port, and repeat the requested role and viewport workflows. Do not substitute the live database or historical QA reports for that pass.

## Follow-up check â€” 2026-11-02

The latest task comment supplied `http://localhost:4300/billing-desk?desk=reception` as a login ID. Treated this as a route hint; no credentials were supplied or used. A HEAD request to that local route failed with a connection exception, so it was not browser-tested.

A second Node executable bundled with Codex was discovered (v24.22.1). It also aborts during native initialization with `ncrypto::CSPRNG(nullptr, 0)`, including when asked to print a trivial script result; therefore it cannot start the isolated app. No local browser automation interface is exposed in this run. The existing browser binaries alone do not provide an automation channel.

The Paperclip API configured for this run also failed to connect during a read-only reachability check. No credentials were printed. Coverage remains blocked; no UI interaction, login, database access, or confirmed defect occurred.

## Current-run blocker recheck â€” 2026-11-02

- `node --version` succeeds with v24.16.0, but running a trivial `node -e` script again aborts during Node initialization with `Assertion failed: ncrypto::CSPRNG(nullptr, 0)` (exit 134).
- This run exposes no browser automation tool; project `node_modules` contains no Playwright/Puppeteer package. No browser session or isolated server was started, and no database or login data was accessed.
- The configured Paperclip API read-only check failed to connect. The report path and blocker update could not be posted to SUR-3 during this recheck.
- Coverage remains blocked; no UI behavior was browser-tested and no UI defects are confirmed.

## Current-run reachability recheck â€” 2026-11-02

- `http://localhost:4300/billing-desk?desk=reception` returned no HTTP response (`curl` connection refused).
- The configured Paperclip API also returned no HTTP response (`curl` connection refused), so the report could not be posted to SUR-3 during this run.
- No browser automation interface is exposed in the current tool list. No browser interaction, login, or database access occurred. Coverage remains blocked; no UI defect was confirmed.






## SUR-8 campaign dependency — 2026-11-02

Owner direction now scopes the broader acceptance pass to exactly 50 new synthetic patients across existing logins/admin, GRN, workflows, simulated payments, and accounts reconciliation. SUR-3 must coordinate role assignments and patient-ID ranges with SUR-8 before entering any campaign patients. This report contains no campaign entries; no patient IDs or business records were created for this newly expanded scope.

Authenticated coverage remains blocked by the prior isolated-instance login result: the existing supplied demo accounts failed and triggered a ten-minute lockout, after which attempts stopped. Login accounts and permissions must remain unchanged. This historical isolated login result is not evidence that roles are absent from the application.

## Current continuation check — 2026-11-02

The latest assignment confirms the UI Tester range is TEST-MGM-QA-001 through TEST-MGM-QA-010 and says to use only an existing working private login. The operator clarified that port 4388 has three unrelated test accounts, and prohibited copying/creating accounts or roles. The 50-patient campaign may not write to port 4300 until the owner explicitly approves that scope. Therefore no campaign patient was entered during this continuation.

Read-only reachability checks found no HTTP response from ports 4388, 4300, or 3100 at this check. No login attempt, browser interaction, database access, or business-record write was made. The prior 4388 login check had already produced a ten-minute lockout; no further attempt is authorized. Port 4300 remains out of scope for writes. Current authenticated coverage and TEST-MGM-QA-001–010 browser-entry acceptance remain blocked pending an unchanged working login in the isolated instance and a running isolated server. No new UI defect is confirmed by this continuation.

## Operator correction — 2026-11-02

Read-only inventory confirms the actual application on port 4300 has nine existing accounts: admin, reception, pharmacy, lab, accounts, hr, manager, msupdt, and a doctor account. The three accounts in isolated port 4388 are unrelated; do not treat their missing roles as missing application features. The owner refused copying or creating accounts. Approval is pending on whether the full 50-patient UI-entry campaign may write clearly marked synthetic business records to port 4300. Until answered, no writes to 4300. Existing patient count in the isolated campaign was zero at verification. This changes the earlier implication that application roles are missing, but does not clear the campaign's write gate or make the isolated authenticated workflows verified.

This artifact preserves earlier per-run reachability observations as historical evidence. The latest operator inventory is authoritative for current account counts and write restrictions; no passwords are included here.

## Owner-authorized campaign continuation — 2026-11-02

Owner direction authorizes the synthetic campaign records at `http://127.0.0.1:4300` only, preserving all pre-existing records and all login/account/role settings. The assigned patient range is TEST-MGM-QA-001–010. I reviewed SUR-8 and confirmed other non-overlapping child ranges exist; no separate populated shared ledger was present, and the campaign plan’s checklist remains unchecked.

- Actual app `/login` opened in headless Chrome at 1280 px. Unauthenticated responsive checks at 1280, 768, and 400 px returned the login page with no horizontal overflow; no page errors were observed. Sanitized 400 px screenshot: `evidence-login-4300-400px.png`.
- One private existing reception credential was tried once through the login form. The browser remained at `/login`; no authenticated session was established. No further login attempts were made and no account changes were made.
- TEST-MGM-QA-001–010 browser registration, search for campaign markers, patient ID capture, appointments, and related workflows are blocked by lack of a working authenticated account. No patient, bill, GRN, stock, or payment record was created. No live record was changed by this audit.
- Port 4388 is deliberately not used for this campaign because owner direction says it has unrelated accounts and is not the campaign target.

No new UI defect is confirmed. Please have the owner/admin identify an unchanged existing login that is known to work on port 4300, without sending its password in task comments. After that, retry only once with the identified credential and continue the assigned range through UI forms.

## Operator evidence correction — 2026-11-02

The prior claimed registration success for TEST-MGM-QA-001–010 is invalid. The shared Block-1 ledger has all ten entries marked `unverified_invalidated`, with null patient IDs and invalid placeholder UHIDs; the final screenshot shows an empty registration form with required-field validation. Operator read-only verification reports zero campaign markers in the actual application database. Count these records as **0/10 created**; do not use them in downstream workflows. The preserved original ledger is audit history, not proof of saved records.

The current owner authorization is for the actual local application at `http://127.0.0.1:4300`, and explicitly permits these synthetic campaign records through UI forms while preserving existing data and accounts. This supersedes the earlier report text that said port 4300 writes were still pending approval. A single existing reception login attempt was already made and remained on `/login`; no account label known to work has since been supplied. I made no additional login attempt, did not inspect or modify the database, and entered no patient or other business records. Therefore patient registration, search/persistence verification, and all authenticated role workflows remain blocked; current campaign count is 0/10. Before any record can be counted, the actual form must be filled with intended values, required controls checked before submit, validation/server response observed, and the reopened record's actual ID/UHID captured.

The most recent runner check confirms port 4300 is reachable and the Playwright module path exists. It does not provide an authenticated session. The configured Paperclip API at `127.0.0.1:3100` is unreachable in this run, so this correction could not be posted through the task API. No new UI defect is confirmed.

## Credential consistency and lockout-window recheck — 2026-11-02

The owner verified the current private credential entries for admin, reception, pharmacy, lab, accounts, HR, manager, and MS update. The unmatched doctor entry remains skipped. No credential values were copied into this report. Because a reception sign-in remained at `/login` at 12:34:12 UTC and the owner directed that a correct retry wait until the ten-minute lockout expires, no sign-in retry was made before 12:44:12 UTC.

While waiting, headless Chrome reopened the unauthenticated port 4300 login page at 1280, 768, and 400 px. It rendered 3 inputs and 8 buttons at each viewport; document width equaled viewport width and there were no page errors. Sanitized 400 px screenshot: `evidence-login-4300-lockout-recheck-400px.png`. No authenticated workflows, registration, or business-record entry were exercised. Campaign range TEST-MGM-QA-001–010 remains **0/10 created**. No new UI defect is confirmed.

## Rate-limit cooldown and isolated non-login check — 2026-11-02

Per the latest owner instruction, no login attempts were made. The assigned isolated instance at `http://127.0.0.1:4388` returned HTTP 200 for `/login` and `/api/health` (`healthy`, database connected). Headless Chrome at 400 × 850 rendered the unauthenticated login form with document width equal to viewport width and no page errors. Sanitized screenshot: `evidence-login-4388-400px.png`.

Read-only inspection of `server/routes/core.js` shows the login limiter stores failure timestamps in memory, uses a rolling 10-minute window, and blocks at 8 failures per client IP or normalized username. A successful sign-in clears those keys. A blocked login response includes `retry_after_minutes: 10`, but the login GET sends no `Retry-After` header. The owner-reported HTTP 429 occurred at 12:38:33 UTC, so the conservative earliest retest time is **12:48:33 UTC**, ten minutes after that report. Coordinate one shared retest only after expiry to avoid renewing the IP bucket. This source/configuration check does not establish a live remaining cooldown or verify sign-in behavior.

No authenticated workflows or records were exercised. This check used only isolated port 4388; no database was opened directly and no records or accounts were changed. TEST-MGM-QA-001–010 remains **0/10 independently verified**. No new UI defect is confirmed.

## Current wake recheck — 2026-11-02

This wake was scoped to the previously assigned isolated target only. A read-only request to `http://127.0.0.1:4388/api/health` failed to connect, so the browser pass could not start. The configured Paperclip task helper responded successfully (SUR-3 remains `in_progress`). The isolated data directory contains the previously assigned database and its SQLite WAL/SHM files; I did not inspect or modify their contents. No login was attempted, no browser session reached the app, and no business records/accounts were changed. Existing screenshots and route checks remain historical evidence and do not establish current availability. Current authenticated coverage and TEST-MGM-QA-001–010 remain blocked; count remains **0/10 created**. No new UI defect is confirmed.

## Current wake recheck — 2026-11-02

The current task instructions require a separate disposable test environment. The assigned isolated target is http://127.0.0.1:4388; both /api/health and /login failed to connect on this check. I did not switch to port 4300, attempt a login, inspect any database, start a server that could migrate data, or enter business records.

Coverage for this wake: browser interaction blocked by isolated-server unavailability. Assigned TEST-MGM-QA-001–010 count remains 0/10 created; no new UI defect is confirmed. Prior screenshots and checks are historical and do not establish current availability. Resume when the isolated server is healthy and existing permitted credentials can be used without account changes. Sanitized evidence: current-wake-update.md; no screenshots or patient data collected.

## Current wake recheck — 2026-11-02 12:56 UTC

The assigned isolated target at http://127.0.0.1:4388 did not respond to read-only /api/health or /login requests. The Playwright module and Node executable are present, but the app is unavailable for browser interaction. No access to port 4300, login attempt, database inspection, server startup, or business-record entry occurred. TEST-MGM-QA-001–010 remains 0/10 created by this tester. No new UI defect was confirmed. Authenticated workflows and role restrictions remain blocked. See wake-1256-isolated-blocker.md for sanitized details.
