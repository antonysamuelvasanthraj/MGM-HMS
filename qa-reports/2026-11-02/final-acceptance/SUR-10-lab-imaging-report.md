# SUR-10 Lab & Imaging QA — 2026-11-02

## Scope and safety
- Allocation: `TEST-MGM-QA-021` through `TEST-MGM-QA-030` only.
- Target used: actual local application at `http://127.0.0.1:4300`.
- No application records, accounts, roles, permissions, or settings were modified.
- No credentials are included in this report.

## Progress and evidence
- Existing lab role authenticated successfully on its first attempt. Dashboard and Patients route rendered.
- Patient index showed 3 records. None of the visible records carried an allocated `TEST-MGM-QA-021`–`030` marker. Existing records were left untouched.
- Lab role has no patient registration control. The existing reception role login was attempted once from the private credential sheet and remained on the login page. No repeat attempt was made.
- Consequently, no allocated patient can be safely registered using the available authenticated UI, and no clinician orders, samples, results, verification, imaging, or doctor-facing reports could be attached to the required IDs.

## Coverage
| Area | Result | Evidence |
|---|---|---|
| Local app reachability/login UI | Pass | `SUR-10-login.png` |
| Existing lab role authentication | Pass | `SUR-10-lab-login.png` |
| Patient index visibility / marker check | Pass (3 records checked) | `SUR-10-patient-search.png` |
| Patient registration under lab role | Blocked (no control) | `SUR-10-patient-search.png` |
| Reception authentication | Blocked after one unsuccessful attempt | `SUR-10-registration-before.png` |
| Lab/imaging workflows on allocated patients | Not tested; blocked by registration/authentication | No allocated patients or IDs created |
| Persisted patient IDs | None | No writes made |

## Next dependency
Provide an existing working reception/registration credential for the actual app, or have the authorized owner register the allocated patients through the UI and share their application IDs. No account changes or credential retries were made. Once available, continue only within 021–030 and use browser UI for all writes.
