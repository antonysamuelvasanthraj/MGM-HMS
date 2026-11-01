# Application review — 1 November 2026

## Follow-up production audit — 03:19 IST

Deployed and checked on localhost:4300. Existing credentials and hospital records were retained. Financial and settings mutations ran on temporary databases; browser checks did not submit live bills or stock changes.

New fixes:

- Automatic daily backups now use the same verified, restorable bundle as manual backups, instead of a database-only VACUUM file. The bundle includes uploaded documents and referenced private counselling recordings. A completion marker is written only after verification; overlapping calls are blocked and restarting does not duplicate the day's backup. Daily retention does not prune manual bundles.
- Both manual and deployment backups now include counselling recordings, which were previously omitted. Missing referenced files fail the backup rather than publishing an incomplete bundle.
- Pharmacy billing tab failures are retryable. Navigating away while an embedded page is loading now disposes its eventual subscription, avoiding orphan refreshes.
- The retained reception-counter controller refreshes patient lists and bill history without replacing its bill editor.
- The realtime test recognizes the billing desk's delegated controllers and checks that those controllers retain live wiring and cleanup. The normal npm test command passes again.

Fresh verification:

| Check | Result |
| --- | --- |
| Standard npm test | Realtime test, 1,312 workflow assertions and 279 integration checks passed |
| Role/menu/API audit on copied data | 2,171 checks, 27 roles, 77 menu entries, no failures |
| Running Admin browser navigation | 76 routes, no reported blank/missing/access-error screens |
| Settings / stock | 42 checks, 24 settings round trips, stock/accounting and stale-count rejection passed |
| IPD | Hourly usage, daily charges, repeated visits, package limits/exclusions, agreed prices and retry protection passed |
| Five front-office logins | Equal access; pharmacy bills read-only; pharmacy collection/mutation blocked |
| Restarted UI | Current IP bills visible, pharmacy bills read-only, receipt hospital header appears once |
| Local deployment and restore | Crash recovery, duplicate server protection, daily backup restart deduplication, document/audio restore to a NEW temporary destination, checksum rejection and shutdown passed |
| Live database audit | Integrity OK; zero foreign-key errors, unbalanced vouchers, negative batches, receipt or bill-balance mismatches |

Verified recovery backup before deployment: `data/backups/hms-2026-10-31T21-47-54-219Z-6d30fb`. A new automatic bundle was also completed after restart. The present live database has no referenced files, so document/audio restoration was additionally verified with explicit fixtures in the isolated restore test.

The actual go-live endpoint still reports **ready: false (5/8)**: demo environment, default Admin password, and 15 lab templates requiring range/result-type review. Same-machine restoration is now tested; off-machine recovery remains unverified. Cloud delivery still has no receiver. SMS/WhatsApp gateways remain excluded. No claim is made that every button was manually tested under all 41 logins or that the software is production-certified.

## Fixes applied

- Pharmacy stock: every displayed medicine/batch now has an Adjust stock action for users with inventory.write, including Admin. The correct batch is preselected.
- Manual adjustment retains a snapshot of the stock reviewed. Background refresh cannot silently change its expected quantity; subsequent dispensing causes a 409 conflict instead of overwriting stock.
- Excel stock-count imports honour SpreadsheetML column indices when Excel omits empty cells. Upload changes and live refresh cannot replace the review while posting is in progress. Partial failures remain explicitly reported.
- Settings changes refresh other sessions' metadata, appearance and navigation immediately without destroying open forms.
- Token reset daily/never now controls actual per-doctor registration numbering. Invalid modes are rejected.
- Settings displays the actual server timezone and April–March financial year. Currency is shown as INR, which is what billing and accounts support. These are no longer misleading editable labels.
- Cloud endpoint wording now explains that no delivery receiver is implemented. Queued records are not represented as delivered.
- Role integration audit includes the stock-adjustment page. Two old regression expectations were updated to preserve the newer pharmacy-desk and payer-collection restrictions; those protections were not relaxed.

## Evidence

Financial, stock and settings mutations were tested on disposable databases. Browser checks against local live data did not post bills, stock adjustments or settings changes.

| Check | Result |
| --- | --- |
| All application JavaScript syntax | 196 files, no syntax errors |
| Admin browser menu navigation | 75 routes, no blank screen, missing route or access error |
| Smoke workflows | 1,311 API assertions; 144 list endpoints |
| Integration regressions | 279 checks |
| Clean-install Admin workflows | 609 API checks; 156 reports; 9 dashboards |
| Role/menu/API integration | 2,174 checks across 27 roles and 76 menu entries |
| Extended workflows | 71 checks: chat privacy/immutability, tasks, handover, rosters, maternity, appointments |
| Admin settings and stock review | 40 requests; 24 general settings round-tripped; themes, policy switches, actual daily/continuous tokens, stock/accounting/audit and stale-count rejection |
| Hospital modes | 10 scenarios covering paper, paperless, hybrid, authorization, department entry and duplicate orders |
| Lab operations | 10 scenarios covering collection, reagents, reports and critical-result acknowledgement |
| Payer policy | 5 scenarios covering room limits, deductions, co-pay and paper documents |
| GRN removal approval | Request/approval separation, unauthorized approval, reversal verified |
| Pharmacy locations | Central/OP/IP visibility and movement totals verified |
| Five reception desk logins | Equal access, expenses, pharmacy read-only and collection restrictions verified |
| Stock UI | 162 displayed per-batch actions; correct preselection and validation; sparse Excel upload accepted |
| Realtime client | Subscription, reconnect, refresh and disposal checks pass |
| Live database read-only audit | SQLite integrity OK, no foreign-key errors, negative batches, unbalanced vouchers, receipt mismatches or bill-balance mismatches |

These counts are test assertions and browser navigation checks, not a claim that every button has been manually exercised under every login. Syntax checking is not a line-by-line correctness proof. Physical devices, external services and a spare-machine restore were not tested in this review.

## Unresolved production work

1. The current server remains a demo environment with the existing demo data. It was not silently converted to a production database.
2. The go-live checklist identifies Admin as still using a default password. Existing logins/passwords were preserved as requested.
3. Fifteen lab services have active numeric parameters without validated reference ranges according to the checklist. These require the laboratory's validated ranges or correction of result types; clinical values were not invented.
4. An off-computer backup and restore drill still needs verification. Local backup existence alone does not establish disaster recovery.
5. Cloud delivery has no receiver implementation or configured delivery contract. Local queue/export remains functional; entering an endpoint alone cannot provide sync.
6. SMS and WhatsApp gateway installation remains excluded from scope, as previously requested.
7. The old preservation baseline differs from current users/patient counts after earlier authorized demo-data changes. Integrity passes; the baseline was not overwritten to hide the drift.

The application should not be represented as fully production certified while these items remain open.
