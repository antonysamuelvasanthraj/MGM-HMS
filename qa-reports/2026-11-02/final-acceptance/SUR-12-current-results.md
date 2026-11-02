# SUR-12 Billing / IP Acceptance — current run

Date: 2026-11-02
Target: actual local MGM HMS UI at `http://127.0.0.1:4300`
Assigned patient markers: `TEST-MGM-QA-041` through `TEST-MGM-QA-050`

## Outcome so far

- Browser: Chromium via the specified Playwright module; port 4300 returned the MGM HMS sign-in screen.
- Role: reception sign-in succeeded once and showed the reception dashboard and navigation to Patients and Admissions.
- Patient marker verification: not completed. In that authenticated session, opening `/patients` left the page at “Loading your workspace…”; no registration form became available.
- Authentication follow-up: a later request returned HTTP 429 from `/api/auth/login`. All further sign-in attempts stopped. This followed repeated observations during this test run; it is not evidence of an invalid stored credential. No lockout workaround was attempted.
- Patient records added: 0 of 10. Admissions, bills, payments, refunds, operational/accounting records: 0.
- Pre-existing records/accounts/roles/permissions changed: none.
- Existing assigned-marker duplicate check: ledger has no recorded SUR-12 entries, but actual-app UI marker search could not be completed because the patient index did not load. No patient was created without that check.

## Evidence

- `SUR-12-port4300-initial.png` — initial app login page.
- `SUR-12-reception-login.png` — successful reception dashboard session.
- `SUR-12-marker-search.png` — initial dashboard global search for marker 041; this did not provide a patient-index duplicate check.
- `SUR-12-patients-list.png` — Patients route showing the loading state.


## Coverage

| Area | Result | Evidence / note |
|---|---|---|
| Port 4300 reachability | Pass | HTTP 200; login UI rendered |
| Reception sign-in | Pass once | Reception dashboard screenshot |
| Patients index and assigned-marker search | Blocked | Workspace loading state; then auth endpoint returned 429 |
| Patient registration and persistence | Not tested | No usable form; 0 records written |
| IP admission, bed/ward, discharge | Not tested | Requires patient records/session |
| Billing/payment allocation/refund/accounts reconciliation | Not tested | 0 operational records written |
| Other roles and permissions | Not tested | No role switching or account changes |

## Handoff

The campaign lead has been notified that UI work is blocked at the Patients route and subsequent authentication received 429. Resume only after the app's normal rate limit clears and the Patients route can be opened in an ordinary authenticated session. Then verify all ten markers in the UI before creating any patient. No product defect or successful workflow is claimed from this run.

