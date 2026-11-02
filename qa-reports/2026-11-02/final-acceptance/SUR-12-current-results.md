# SUR-12 Billing / IP acceptance — current run

Date: 2026-11-02
Target: `http://127.0.0.1:4300`
Assigned markers: `TEST-MGM-QA-041` through `TEST-MGM-QA-050`

## Progress

- Used Chromium through the specified Playwright module and the current reception credential row once in a fresh UI context. Authentication returned HTTP 200 and redirected to `/dashboard`.
- Opened `/patients`; the authenticated patient index rendered with 36 patients shown / 36 total UHIDs. No browser page errors were observed.
- The visible list began with recent synthetic records from the earlier campaign block. The assigned marker search was not completed, so exact duplicate status for 041–050 remains unverified.
- No patient, admission, bill, payment, refund, or accounting records were created. Counts: **0/10 assigned patients; 0 operational records**.
- No pre-existing records, accounts, roles, permissions, or runtime settings were changed.

## Evidence

- `SUR-12-current-session.png` — authenticated dashboard after successful sign-in.
- `SUR-12-patients-current.png` — patient index with record count and visible recent patient rows.

## Coverage

| Area | Result |
|---|---|
| Port 4300 reachability | Reached |
| Reception authentication | Pass; HTTP 200 |
| Patients index | Pass; 36 records shown, no page errors |
| Assigned marker duplicate search | Not completed; exact markers unverified |
| Registration and reopen persistence | Not tested; 0 records |
| IP admission, ward/bed, discharge | Not tested; 0 records |
| Billing, collection, payment allocation, refund, reconciliation | Not tested; 0 records |
| Other role / permission coverage | Not tested |

## Next action

Continue with one authenticated UI context, search exact markers 041–050 in Patients, then register only absent assigned markers through the visible form. Capture generated UHIDs, reopen the first record, and continue the authorized workflow cases. No product defect is claimed from this run.
