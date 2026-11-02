# SUR-12 live acceptance check — 2026-11-02

Target: `http://127.0.0.1:4300`
Assigned markers: `TEST-MGM-QA-041` through `TEST-MGM-QA-050`

## Result

- Reached the MGM HMS sign-in page in Chromium using the specified Playwright module.
- Made one UI sign-in submission using the current reception row from the private login file. The application rejected it with “Login ID or password is not recognised.” Subsequent inspection found the local Markdown table delimiters were included in the submitted username by my parser, so this rejection does not establish a credential or application defect. I made no further attempt.
- `/patients` and the app-side marker duplicate check were not reached.
- Patients created: **0/10**. Admissions, bills, collections, settlements, refunds, and reconciliation records created: **0**.
- Existing data, accounts, roles, and permissions changed: **none**.
- Shared ledger check: block 5 allocates 041–050 to this task and contains no assigned patient IDs. App duplicate verification remains unconfirmed.
- No product defect is claimed from this result; authentication did not reach the acceptance workflow.

## Evidence

- `SUR-12-live-login.png` is a sanitized view of the sign-in screen with fields cleared. The rejection message was observed immediately after the single submission; no credential values are retained in evidence.
- Browser console page errors: none observed.

## Coverage

| Area | Result |
|---|---|
| Port 4300 sign-in screen | Reached |
| Reception authentication | Blocked; one submission rejected |
| Patient index / marker search | Not reached |
| Registration / persistence | Not tested; 0 records |
| IP admission, bed/ward, discharge | Not tested; 0 records |
| Billing, payment allocation, refunds, reconciliation | Not tested; 0 records |
| Other roles / permissions | Not tested |

## Next action

I need a correctly parsed credential value before any future UI login; given the failed submission, I stopped as instructed. No application-side blocker is confirmed. The app duplicate check and acceptance cases remain outstanding. Continue other independent acceptance cases where their owners have valid sessions.


