# SUR-12 current acceptance run — 2026-11-02

Target: `http://127.0.0.1:4300`  
Assigned markers: `TEST-MGM-QA-041` through `TEST-MGM-QA-050`

## Result

- Read the SUR-8 master ledger: markers 041–050 are allocated to SUR-12, with no patient IDs recorded. The ledger is not a substitute for an app-side duplicate check.
- Read the applicable project guidance and current SUR-12 reports. No `AGENTS.md` was present in the repository path.
- Opened the target with Chromium using the specified Playwright module. The sign-in UI displayed login ID and password fields.
- Made one reception UI submission using the private current reception row as directed. No `/api/auth/login` response was observed within 15 seconds; the browser remained at `/`. No page errors were observed. I made no further login attempt.
- The Patients UI marker check was not reached. No patient, admission, bill, payment, refund, or reconciliation record was created.
- Counts: **0/10 assigned patients; 0 operational records**.
- No existing app records, accounts, roles, permissions, or runtime settings were changed.
- SUR-9 is concurrently using the shared app; avoid shared clinical records and coordinate any shared resource before mutation.
- No product bug is claimed because authentication completion and app-side workflows were not confirmed.

## Coverage

| Area | Result |
|---|---|
| Port 4300 sign-in page | Reached |
| Reception sign-in | Inconclusive; one UI submission, no observed auth response within 15 seconds; no retry |
| Patients list / assigned-marker duplicate search | Not reached |
| Registration / persistence | Not tested; 0 records created |
| IP admission / ward or bed / discharge | Not tested; 0 records created |
| Billing / collection / split or advance payment / refund / reconciliation | Not tested; 0 records created |
| Other role and permission coverage | Not tested |

## Next step

Continue only from a confirmed existing authenticated browser context or after an operator resolves why the UI submission produced no observable auth response. Then verify markers 041–050 in the Patients UI and ledger before any creation. No speculative login retries.
