# SUR-12 Billing / IP Acceptance — current run

Date: 2026-11-02
Target: actual local MGM HMS UI at `http://127.0.0.1:4300`
Assigned patient markers: `TEST-MGM-QA-041` through `TEST-MGM-QA-050`

## Outcome so far

- Browser: Chromium via the specified Playwright module; port 4300 returned the MGM HMS sign-in screen.
- Role: earlier operator-confirmed reception UI sign-in succeeded and loaded `/dashboard` and `/patients` with no page errors.
- Current-run auth check: one fresh-context UI login using the current private reception row returned HTTP 401. No further sign-in attempts were made. This conflicts with the operator-confirmed successful login and suggests a target/data-location or credential-row parsing discrepancy; no account/security change or lockout workaround was attempted.
- Patient marker verification: not completed. The fresh context was unauthenticated, so `/patients` redirected to sign-in. The earlier successful session's loading-state issue was later resolved by the operator; this run has not independently reached the authenticated patient index.
- Patient records added: 0 of 10. Admissions, bills, payments, refunds, operational/accounting records: 0.
- Pre-existing records/accounts/roles/permissions changed: none.
- Existing assigned-marker duplicate check: shared ledger lists 041–050 as pending and has no recorded assigned patient IDs. Actual-app UI marker search remains incomplete because this run did not authenticate. No patient was created without that check.

## Evidence

- `SUR-12-port4300-initial.png` — initial app login page.
- `SUR-12-reception-login.png` — successful reception dashboard session.
- `SUR-12-marker-search.png` — initial dashboard global search for marker 041; this did not provide a patient-index duplicate check.
- `SUR-12-patients-list.png` — Patients route showing the loading state.
- `SUR-12-patients-live.png` — fresh-context `/patients` redirect to sign-in after the single HTTP 401.


## Coverage

| Area | Result | Evidence / note |
|---|---|---|
| Port 4300 reachability | Pass | HTTP 200; login UI rendered |
| Reception sign-in | Operator-confirmed pass; current run blocked | Current row used once in a fresh context; HTTP 401. Previous operator session reached dashboard and `/patients`. |
| Patients index and assigned-marker search | Not independently verified this run | Shared ledger has no assigned patient IDs; fresh context redirected to sign-in. |
| Patient registration and persistence | Not tested | No usable form; 0 records written |
| IP admission, bed/ward, discharge | Not tested | Requires patient records/session |
| Billing/payment allocation/refund/accounts reconciliation | Not tested | 0 operational records written |
| Other roles and permissions | Not tested | No role switching or account changes |

## Handoff

The campaign lead should be notified that a single fresh-context login with the current private reception row returned HTTP 401, despite the operator's confirmed successful reception login after cooldown. No retries were made. Investigate URL/data-location or credential parsing through read-only evidence and coordinate one authorized retest if needed. Verify all ten markers in the app UI before creating any patient. No product defect or successful billing/IP workflow is claimed from this run.

