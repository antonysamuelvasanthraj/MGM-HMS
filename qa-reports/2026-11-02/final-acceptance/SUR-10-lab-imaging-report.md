# SUR-10 Lab & Imaging QA — 2026-11-02

## Scope and safety
- Allocation: `TEST-MGM-QA-021` through `TEST-MGM-QA-030` only.
- Target used: actual local application at `http://127.0.0.1:4300`.
- No application records, accounts, roles, permissions, or settings were modified.
- No credentials are included in this report.

## Progress and evidence
- Existing lab role authenticated successfully on its first attempt. Dashboard and Patients route rendered.
- Patient index showed 3 records. None of the visible records carried an allocated `TEST-MGM-QA-021`–`030` marker. Existing records were left untouched.
- Lab role has no patient registration control. The owner subsequently confirmed that the reception UI login received HTTP 429 from `/api/auth/login`; this is rate limiting, not evidence of invalid credentials. No further login attempts were made.
- Consequently, no allocated patient can be safely registered using the available authenticated UI, and no clinician orders, samples, results, verification, imaging, or doctor-facing reports could be attached to the required IDs.
- Read-only source inspection found the login limiter uses a 10 minute rolling window and responds with `retry_after_minutes: 10`. It tracks both client IP and username, so other login attempts from the shared client IP may renew the cooldown. Retest only once after natural expiry and coordination with other specialists; no bypass, reset, or security setting changes.
- Registration form preparation: the patient creation dialog uses `form[data-np]`, with patient fields including `name`, `mobile`, `age_years`, `gender`, `dob`, and `allergy`; its save button is `[data-save]` (Create UHID). This is source-derived preparation only; the form was not opened or submitted in this blocked run.

## Coverage
| Area | Result | Evidence |
|---|---|---|
| Local app reachability/login UI | Pass | `SUR-10-login.png` |
| Existing lab role authentication | Pass | `SUR-10-lab-login.png` |
| Patient index visibility / marker check | Pass (3 records checked) | `SUR-10-patient-search.png` |
| Patient registration under lab role | Blocked (no control) | `SUR-10-patient-search.png` |
| Reception authentication | Blocked by HTTP 429 rate limit; no retry | Owner-observed response; limiter behavior confirmed in `server/routes/core.js` |
| Lab/imaging workflows on allocated patients | Not tested; blocked by registration/authentication | No allocated patients or IDs created |
| Persisted patient IDs | None | No writes made |

## Next dependency
Coordinate one reception UI retest after the natural shared/IP limiter expiry, with other specialists holding login attempts during the cooldown. Do not reset accounts or security settings. If registration becomes available, continue only within 021–030, enter records through browser UI, verify persistence, and share application IDs for downstream clinician ordering. Until then, no application records or accounts are to be changed.
