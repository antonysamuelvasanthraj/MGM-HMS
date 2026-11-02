# SUR-9 Clinical QA Progress ? 2026-11-02

## Scope and outcome
- Assigned allocation: `TEST-MGM-QA-011` through `TEST-MGM-QA-020`.
- Parent task's latest CEO directive selects isolated `http://127.0.0.1:4388` and prohibits writes to live port 4300 and `E:\MGM HMS\data`. This supersedes the older port-4300 instruction in the child description.
- Isolated app at 4388 responds HTTP 200. Read-only inspection of its configured isolated database found **0 assigned marker patients**.
- Patients created: **0/10**. Operational records created: **0**. Persisted patient IDs: none. Campaign made no account, role, permission, or pre-existing record changes.
- Port 4300 was opened before the latest parent target restriction was reconciled. One owner-verified reception UI login was attempted after the stated wait interval; the app still displayed its existing ?Too many wrong attempts? lockout. No additional login attempts were made there and no records were created.

## Access and role/control coverage
- The isolated database currently lists active admin, reception-test, and nurse-test roles; no doctor account is present there. The approved credential table provides no matching credentials for the isolated test reception/nurse accounts, and the doctor credential remains unmatched. No guesses were tried and no accounts were created, disabled, reset, or modified.
- A credential consistency check for the live 4300 database had shown reception active; the UI lockout remains the safe access blocker. The isolated 4388 role inventory does not match that live inventory, indicating target/data-location divergence. This run does not attribute account changes to any agent or task.
- Patient registration, nurse vitals, consultation, prescriptions, clinical orders, follow-up, and clinical role permissions are **blocked/untested**. No untested control is marked as passed.

## Confirmed access blocker / retest request
- **Screen:** Staff sign-in at live port 4300.
- **Evidence:** The one authorized reception attempt using the owner-verified current entry resulted in the lockout message; screenshots: `SUR-9-reception-retest-before.png`, `SUR-9-reception-retest-result.png`.
- **Expected:** An authorized current staff login can sign in after the advertised wait interval, or the app clearly identifies an account-specific issue.
- **Observed:** The UI continued to show the lockout after the allowed single retest. No further attempt was made. The cause is not established; potential target/data-location divergence remains under investigation.
- **Retest:** Owner/admin should verify which target database is authoritative and confirm safe role access; coordinate one clean UI retest only after lockout state has expired. No password reset or role change was requested or performed.

## Artifacts
- `SUR-9-reception-retest-before.png`
- `SUR-9-reception-retest-result.png`
- `SUR-9-results.json`

## Latest owner direction and current access preparation (12:42 UTC)
- Owner clarified that once the natural shared login cooldown has expired, an existing authorized admin may exercise clinical screens that the admin account already permits. This is functional UI coverage only; doctor-role login/permission coverage remains separate and blocked. No account, role, or permission changes are allowed.
- For this current run, the assigned target is the explicitly authorized actual local app at `http://127.0.0.1:4300`. The earlier report's 4388 target note is stale relative to this run's assignment.
- Opened `/login` read-only in an independent browser context. HTTP 200; username/password controls rendered; no credentials were submitted. Screenshot: `SUR-9-port4300-login-no-submit.png`.
- The shared 10-minute limiter's last counted 401 time is still unknown, so natural expiry cannot be confirmed. No login was attempted; no patient or operational records were created. Await safe cooldown confirmation before the single authorized existing-admin UI login.
- Source inspection confirms New patient is exposed only with `patient.create`; its UI registration form captures name, gender, age, and mobile. This is preparation only; no clinical control is marked passed.
