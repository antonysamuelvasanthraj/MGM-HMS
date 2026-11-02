# SUR-9 limiter and UI preparation update — 2026-11-02

## Progress and scope

- Assigned markers: `TEST-MGM-QA-011` through `TEST-MGM-QA-020`.
- Created patients: **0/10**. Operational records: **0**. Persisted IDs: none.
- No login was attempted in this update. No accounts, roles, permissions, or application records were changed.
- The approved isolated target `http://127.0.0.1:4388` responds HTTP 200. A browser opened `/login` and captured `SUR-9-login-page-no-submit.png`; the page exposes `#si-user`, `#si-pass`, and `#si-submit`. No form was submitted.

## Limiter inspection

- `server/routes/core.js` keeps wrong-password timestamps in an in-memory map, keyed by both client IP and normalized username.
- The rolling window is 10 minutes and the threshold is 8 counted failures. The response is HTTP 429 with JSON `retry_after_minutes: 10`; the server does not set a `Retry-After` header.
- The 429 check occurs before the current request can add a failure timestamp. Therefore the 429 itself does not restart the window. The cooldown runs from the most recent counted 401 for the shared IP or account bucket. The latest counted 401 timestamp is not present in this handoff, and another agent/operator could have added failures; the expiry time is **unconfirmed**.
- Retest remains paused until the coordinator supplies the last counted failure time and confirms at least 10 minutes elapsed with no intervening failures. Then coordinate one single UI login retest, with no parallel login attempts. No account reset or limiter change is needed or authorized.

## UI preparation (source inspection only)

- Sign-in controls: `#si-user`, `#si-pass`, optional `#si-counter`, `#si-submit`; visible error text: `#si-error-text`.
- Patient list New patient action: `[data-new]` (visible only with `patient.create`). Registration form: `form[data-np]`; fields `input[name="name"]`, `select[name="gender"]`, `input[name="age_years"]`, and `input[name="mobile"]`. Required-field behavior is native form validation. This is code-derived preparation, not acceptance coverage.
- No authenticated patient, nurse, or doctor workflow has been exercised. All such controls remain blocked/untested.

## Evidence

- `SUR-9-login-page-no-submit.png` — isolated 4388 login page, captured without submission.
- Source inspected: `server/routes/core.js`, `client/src/main.js`, `client/src/views/patients.js`, `client/src/views/op-registration.js`.
- No live limiter state or last-401 timestamp was exposed by the configured source. The code defines a process-local in-memory limiter, so source inspection cannot establish current expiry.
