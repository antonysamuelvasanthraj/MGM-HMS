# SUR-7 fix and retest log — 2 November 2026

## Runtime recovery

The current operator environment passes the previously blocked execution checks: Node v24.16.0 runs scripts; the assigned read-only browser diagnostic reports Paperclip health 200, Chrome navigation to the isolated MGM HMS login page 200, and the expected title/form; authenticated Paperclip task GET returns 200. The isolated data path and app port are `C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-isolated-data` and `http://127.0.0.1:4388`. No live port 4300 or repository `data/` database was used.

## Confirmed fixes present in the shared checkout

These source changes were already present in the concurrently held SUR-3 checkout when SUR-7 resumed. They were preserved, reviewed, and exercised here; attribution/commit ownership remains with that shared work until coordinated.

| Finding | Root cause and fix | Reproduction / retest | Status |
|---|---|---|---|
| Scheme permission idempotency accepted a changed payload under an already-used request key. | `server/routes/scheme-payments.js` now requires a replay to match item, user, amount, reason, and authorization reference. | `node tools/scheme-line-payment-test.mjs`: 61 checks passed, including duplicate protection and stale-write blocking. `npm test`: integration regression run passed 279 checks, including payer allocation/collection workflows. | Fixed and retested on isolated synthetic data. |
| Scheme collection idempotency accepted changed payment details; non-cash collection could omit its reference. | Same route now matches amount, normalized mode, and reference on replay, and requires a reference for non-cash payments. | Same focused 61-check test passed, including receipt/counter attribution, collection, and account balance assertions. | Fixed and retested on isolated synthetic data. |
| Numeric scheme amounts treated empty strings as numeric zero; allocation concurrency did not reject blank expected values. | Same route uses a nonblank finite-number guard for amount and expected amount. | Focused suite passed its invalid/stale allocation and full/partial/clear cases. | Fixed and retested on isolated synthetic data. |
| Any authenticated user could request a payment receipt by ID. | `server/routes/billing.js` now requires one of billing, payment, or finance view/collect permissions before returning the receipt. | Operator's independent actual-app UI retest verified the existing Manager had `billing.view=false`, `payment.view=false`, `payment.collect=false`, `finance.view=false`; one read-only request for campaign payment 4 returned HTTP 403. No receipt body was retained. | Fix and dedicated negative permission probe passed. Positive authorized receipt behavior and other receipt workflows remain unverified. |

## Build and regression results

- `node tools/realtime-client-test.mjs`: passed (included in `npm test`).
- `node tools/smoke-test.mjs`: passed; 1,321 API checks, 147 list endpoints, and the listed synthetic workflows.
- `node tools/integration-regression-test.mjs`: passed; 279 checks, including payer, pharmacy, nursing, emergency, and billing workflows.
- `node tools/scheme-line-payment-test.mjs`: passed; 61 checks. It reports stock, sales totals, duplicate-bill, and live-data guards unchanged.
- `npm run build:css`: passed. Tailwind emitted only the existing outdated Browserslist database advisory.
- `C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser-smoke.mjs`: passed with Chrome and the isolated login route.

### Fresh continuation rerun — 2026-11-02

- `npm test`: passed; realtime-client checks passed, smoke suite passed with 1,320 API checks across 147 list endpoints, and integration regression passed 279 checks.
- `node tools/scheme-line-payment-test.mjs`: passed 61 checks; stock and sales totals unchanged, no duplicate bill, live-data guard unchanged, and accounting balanced.
- `npm run build:css`: completed successfully; only the existing outdated Browserslist database advisory was emitted.
- No live port 4300 or `data/` database was accessed. CSS output `client/app.css` is ignored/generated and was not added.

### SUR-10 imaging action permission mismatch — 2026-11-02

- **Finding / reproduction:** SUR-10 reported Medical Superintendent could see **Scan room** on paid campaign order `ORD-261102-00004` (`TEST-MGM-QA-022`), click it, receive a visible forbidden error, and observe the order remain `ORDERED`. This was reproduced in the authorized port 4300 UI by SUR-10; SUR-7 did not repeat the live action.
- **Root cause:** `client/src/views/imaging.js` rendered Scan room without a permission check. The action handler calls `PATCH /orders/:id`, whose route in `server/routes/clinical.js` requires `order.update`. `imaging.schedule` separately guards the Schedule action and `/imaging/orders/:id/schedule`.
- **Fix:** Scan room now renders only when `can('order.update')`; Schedule remains gated by `can('imaging.schedule')`.
- **Verification:** `npm run build:css` passed (existing outdated Browserslist advisory). `npm test` stopped after realtime-client passed because its smoke server could not bind port 4399 (`EADDRINUSE`), likely due to concurrent local activity; the API and integration suites did not run. No repeated attempt was made. SUR-10 independently retested the actual UI: the unchanged Medical Superintendent role saw zero Scan room, Schedule, and Report controls on the unchanged paid `ORDERED` study. The UI visibility retest passed; authorized acquisition/report/sign-off workflow remains untested.
- **Safety:** no port 4300 access, account/role/permission changes, or business-record changes were made by SUR-7.

## Open and blocked items

### Downstream acceptance blocker — existing staff authentication (SUR-9 / SUR-11)

SUR-9 reported that the existing doctor and reception logins were rejected once each on the authorized local application at port 4300; a separate registration attempt then showed the app-wide ten-minute lockout. SUR-11 independently reported rejection of two existing pharmacy accounts. Both testers stopped immediately after the lockout/rejections. No credentials, accounts, roles, permissions, or records were changed. Evidence is in `final-acceptance/SUR-9-clinical-qa-report.md` and `final-acceptance/SUR-11-pharmacy-stock-qa.md`.

This establishes an authentication/access blocker for those acceptance runs; it does not yet establish a code defect or prove all nine accounts fail. No further login attempts are authorized until the existing account owner verifies account state and coordinates a clean retest. Clinical and pharmacy workflows and the 50-record campaign remain untested; no patient records were created by those runs. Continue independent code work without touching port 4300 or credentials.

**Operator clarification (2026-11-02):** the current HTTP 429 is the shared/IP wrong-password limiter in `server/routes/core.js` (`WINDOW=10min`, `LIMIT=8`), not evidence that the verified current passwords are wrong. The operator privately verified the current credential rows without network attempts or account changes. Keep account/security settings unchanged and allow natural expiry. Once coordinated, make one reception retest first, then stagger other logins; do not repeat attempts during cooldown, use legacy/demo-prefixed entries, reset credentials, or weaken the limiter. Latest independent regression results are recorded by the operator as passing: realtime-client, smoke (1,321 API checks / 147 list endpoints), and integration (279 checks). These results cover source suites only, not UI acceptance. The latest SUR-12 run independently recorded one HTTP 401 and stopped; it did not prove a credential mismatch. No UI campaign rows are to be counted from API fixtures.

- **SUR-8 campaign (owner authorization, 2026-11-02):** port 4300 has nine existing application accounts; port 4388 has three unrelated test accounts. The owner authorized SUR-8 to enter exactly 50 clearly marked synthetic patients and test GRNs, bills, and simulated payments through the UI at port 4300. SUR-8 owns the campaign; this SUR-7 run made no campaign entries and did not touch port 4300. Preserve all existing records and accounts; campaign actions must remain local and simulated. UI-created business data belongs only on port 4300; fixtures may be used only in disposable regression databases and never counted among the 50.
- Cloud sync receiver remains explicitly unimplemented and returns 503. The report describes it as a scope decision (local-only versus receiver contract); no owner decision authorizes inventing delivery semantics.
- Off-device backup restore remains an operational task requiring an approved separate failure domain and restore drill; it is not a safe code-only fix.
- Demo credentials/data and missing lab reference ranges remain unverified in current data. Do not read or mutate the live database; lab ranges require clinical validation.
- SUR-3 completed partial UI coverage: admin setup, synthetic receptionist navigation, synthetic patient form validation/persistence, appointment empty states, and a limited mobile check. Clinical, diagnostic, pharmacy, billing actions, role restrictions, accessibility, and most viewport checks remain untested; see the UI report. A possible clipped-content observation at 400 px needs follow-up.
- The UI report records a synthetic receptionist account created before the latest owner requirement. No account or role changes are authorized for further testing; only existing working isolated-instance logins may be used.
- Portal brute-force and attachment record-scope risks remain suspected and unproven.
- Build/test verification does not authorize deployment, push, or live-data changes.

### SUR-8/SUR-9 acceptance evidence update — 2026-11-02

The current SUR-9 result artifact records successful reception/admin sign-ins after the natural cooldown (one reception attempt and three admin attempts; zero failed attempts), UI-created/persisted patient records through marker 020, and 10/10 OP registration plus vitals persistence checks for markers 011–020. This is downstream team evidence, not work performed by SUR-7. Clinical consultation notes, prescriptions, orders, follow-up, nurse coverage, and billing/payment remain explicitly untested or unavailable in the current Paper-mode screens. The SUR-8 ledger remains `in_progress`; its other workflow blocks are staged as ready, not passed. Do not count API fixtures toward the UI campaign.

The receipt endpoint guard is a source-level restriction to `billing.view`, `payment.view`, `payment.collect`, or `finance.view`; the default doctor role has none of these, while admin has `*`. The operator's independent Manager probe returned HTTP 403 after verifying all four effective permissions were false, closing the negative probe for that role and synthetic campaign payment 4. Positive authorized receipt access remains unverified. No account or role changes were made. No new independent confirmed code defect was reproduced in this continuation.
