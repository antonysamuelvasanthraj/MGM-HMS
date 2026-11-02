# SUR-12 current run — 2026-11-02

Target: `http://127.0.0.1:4300`  
Assigned markers: `TEST-MGM-QA-041` through `TEST-MGM-QA-050`

## Result

- Confirmed the shared campaign ledger allocates 041–050 to SUR-12; it contains no persisted application IDs for those markers. Ledger evidence is not a substitute for the required app-side duplicate check.
- Used Chromium through the specified Playwright module and submitted the current reception login once through the visible UI. The login request returned HTTP 401. No second attempt was made.
- Navigated to `/patients`; the browser remained at the sign-in screen. Exact marker search and registration were not reachable.
- Created **0/10** assigned patients and **0** operational records. No application records, accounts, roles, permissions, or runtime settings were changed.
- This does not establish an application defect: authentication did not reach the assigned workflows. The earlier successful login and Patients index observation in the previous run remain separate evidence and are not contradicted as historical observations.

## Evidence

- `SUR-12-patients-live.png` — screenshot from this run after the route attempt; sign-in page is visible and contains no entered credential values.
- `SUR-12-current-results.md` — previous run report, documenting an HTTP 200 reception login and Patients index count of 36; exact assigned marker search remained incomplete.
- Browser page errors observed this run: none.

## Coverage

| Area | Result |
|---|---|
| Port 4300 reachability | Reached |
| Reception sign-in | Blocked; one UI submission returned HTTP 401 |
| Patients index / duplicate search for 041–050 | Not reached in this run |
| Patient registration / persistence | Not tested; 0 records created |
| IP admission, ward/bed, discharge | Not tested; 0 records created |
| Bills, collection, payment allocation, refunds, reconciliation | Not tested; 0 records created |
| Other roles / permissions | Not tested |

## Handoff

Stop further login attempts for this run. Coordinate a single retest only after campaign owner resolves the discrepancy between the earlier successful reception session and this HTTP 401 using read-only target/data-location or credential-row parsing evidence. Continue other independent work through already authenticated sessions where available. No application bug is claimed.
