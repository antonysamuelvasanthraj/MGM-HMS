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
| Any authenticated user could request a payment receipt by ID. | `server/routes/billing.js` now requires one of billing, payment, or finance view/collect permissions before returning the receipt. | `npm test` and focused scheme test passed; the broad regression chain reports role permissions passed. A dedicated cross-role receipt probe was not separately captured. | Fix present; broad permission regression passed; dedicated receipt-specific negative case remains to capture. |

## Build and regression results

- `node tools/realtime-client-test.mjs`: passed (included in `npm test`).
- `node tools/smoke-test.mjs`: passed; 1,321 API checks, 147 list endpoints, and the listed synthetic workflows.
- `node tools/integration-regression-test.mjs`: passed; 279 checks, including payer, pharmacy, nursing, emergency, and billing workflows.
- `node tools/scheme-line-payment-test.mjs`: passed; 61 checks. It reports stock, sales totals, duplicate-bill, and live-data guards unchanged.
- `npm run build:css`: passed. Tailwind emitted only the existing outdated Browserslist database advisory.
- `C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser-smoke.mjs`: passed with Chrome and the isolated login route.

## Open and blocked items

- Cloud sync receiver remains explicitly unimplemented and returns 503. The report describes it as a scope decision (local-only versus receiver contract); no owner decision authorizes inventing delivery semantics.
- Off-device backup restore remains an operational task requiring an approved separate failure domain and restore drill; it is not a safe code-only fix.
- Demo credentials/data and missing lab reference ranges remain unverified in current data. Do not read or mutate the live database; lab ranges require clinical validation.
- SUR-3 role-based UI coverage beyond login/navigation remains pending the UI Tester run. Do not count blocked workflows as tested.
- Portal brute-force and attachment record-scope risks remain suspected and unproven.
- Build/test verification does not authorize deployment, push, or live-data changes.
