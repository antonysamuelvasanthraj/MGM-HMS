# SUR-11 Pharmacy Stock QA progress

Date: 2026-11-02
Target app: `http://127.0.0.1:4300`
Assignment: `TEST-MGM-QA-031` through `TEST-MGM-QA-040`

## Status

Blocked before UI access. The app served its staff sign-in page, but two separate existing pharmacy accounts from the private credential sheet were each rejected once with the app message “Login ID or password is not recognised.” No further attempts were made. No accounts, passwords, roles, permissions, or records were changed. No patients or operational records were created.

The campaign ledger checked before any write had no 031–040 allocation entries. The app-side marker check could not be completed without an authenticated UI session. Accordingly, no duplicate check or UI workflow can be claimed complete.

## Evidence

- `SUR-11-port4300-before.png`: port 4300 sign-in page loaded successfully.
- `SUR-11-pharmacy-login.png`: first existing pharmacy login rejected.
- `SUR-11-pharmacy-manager-login.png`: separate existing pharmacy manager login rejected.

## Coverage

- App availability / sign-in page: confirmed.
- Pharmacy role authentication: failed for both tested existing accounts.
- Patient marker search/duplicate check: blocked.
- Patients 031–040: 0 created.
- Prescription/dispensing/returns, procurement, supplier, purchase, GRN, stock movements/transfers, reconciliation: not tested.
- Role/control coverage: no controls beyond sign-in were tested.

## Blocker for SUR-7 / campaign owner

The authorized local app at port 4300 does not recognize the two tested existing pharmacy credentials from `DEMO-LOGINS.local.md`. This is a confirmed access blocker, not a workflow pass. Please coordinate a UI retest after the existing account state/credentials are made usable through the approved process; do not reset or change accounts as part of this QA run.

## Owner-directed retest (2026-11-02, current run)

**Target:** isolated campaign server `http://127.0.0.1:4388` (the SUR-8 campaign plan and status name this URL and its isolated data folder). Port 4300 also served an MGM HMS sign-in page, but the owner’s latest direction says to investigate URL/data-location mismatch if the verified credential is rejected. To honor SUR-8's isolated target and avoid writes to the other instance, this run used 4388.

**Authentication:** one UI login attempt using the current Pharmacy row (table column 4, line 54) from the private credential file succeeded and opened the Pharmacy dashboard. Screenshot: `SUR-11-pharmacy-4388-login.png`. No credential value is included here.

**Work performed:** No app-side marker search or writes were performed. The authenticated browser context was closed before its session could be retained. The owner authorized at most one correct UI login after lockout expiry; no second login or authentication bypass was attempted. The shared local ledger contains no 031–040 entries, but an app-side duplicate check is still required before creation.

**Counts:** patients created 0; operational records created 0; workflows tested 0; accounts/roles/permissions changed 0; existing records altered 0.

**Coverage:** Pharmacy authentication on isolated port 4388 confirmed. Prescription queue, dispense/return, procurement, supplier, purchase, GRN, stock movement/transfer, reconciliation, inventory controls and app-side duplicate search remain untested. No workflow controls are claimed passed.

**Next step:** retain an authenticated browser session for the remaining UI checks, after owner-coordinated retest authorization. Keep to the SUR-8 isolated target unless the campaign owner explicitly revises it. The earlier port-4300 rejected attempts are unchanged and were not repeated.

## Continuation update (2026-11-02)

**Target:** SUR-8 isolated application at `http://127.0.0.1:4388`.

**Session/access:** The prior successful Pharmacy UI login was in a browser context that has since been closed. A fresh read-only Chromium context reaches the staff sign-in screen. I made no login attempt in this continuation, consistent with the owner's temporary stop on additional attempts and at-most-one correct login. I have no authenticated browser session available to inspect or retain.

**Read-only UI preparation:** Current sign-in controls observed: `input[name="username"]`, `input[name="password"]`, optional cash-counter selector, and the “Sign in to MGM HMS” button. The visible form explains that credentials are issued by the administrator. Screenshot: `SUR-11-port4388-signin-current.png`. This is unauthenticated page evidence only; no app-side marker search was possible.

**Counts and status:** 0 patients and 0 operational records created by this assignment; 0 assigned workflows tested; 0 existing records/accounts/roles/permissions changed. Shared ledger artifact has no 031–040 entries. This does not establish that app-side duplicates are absent. Do not create any assigned record until an authenticated UI marker search is completed.

**Retest coordination needed:** Retain the authenticated context on the single approved post-cooldown Pharmacy login and hand off its availability/session ownership so this task can conduct the app-side duplicate search and UI tests without another authentication attempt. Do not repeat login attempts, change security/account state, or bypass the limiter. Port 4388 remains the target.
