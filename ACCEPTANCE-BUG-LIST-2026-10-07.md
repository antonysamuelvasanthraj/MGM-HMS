# MGM HMS — bugs and remaining work, 7 October 2026

This is an interim status, not acceptance sign-off. The detailed evidence is in ACCEPTANCE-REPORT-2026-10-07.md. Ten fixes have passed the required suites, live restart checks and individual manual retests. No login or password was changed.

## Fixed and manually retested

| # | Bug | Result |
|---|---|---|
| 1 | Selected reception counter missing immediately after login | Login response now includes counter details; immediate label verified. |
| 2 | Zero-stock prescribed brand fails instead of offering same-generic alternatives | Substitute helper scope corrected; alternative selection, stock use and bill notes verified. |
| 3 | Debit-card sale return defaults to Cash and omits card modes | Refund defaults to original receipt mode; debit-card return/refund verified. |
| 4 | Receipt Print opens no visible preview | Shared document preview used; readable payment mode and receipt details verified. Physical printing remains untested. |
| 5 | Old patient billing summary remains after pharmacy cart clears | Context removed when patient clears; verified after new sales. |
| 6 | Empty prescription editor row disappears during consultation refresh | Blank draft rows retained while editing; order placement and signing retested. |
| 7 | CBC print uses an arrow without LOW/HIGH wording and omits hospital phone | Written flags/contact added; all 15 CBC previews checked. |
| 8 | Imaging report print omits hospital address and phone | Contact details added; all 15 report previews checked. |
| 9 | Imaging Staff USG page links to inaccessible template management | Link follows existing template permission; unauthorized role retested. Authorized-role positive link check remains pending. |
| 10 | Pharmacy Staff cannot request free-treatment approval | Request-only Free option exposed to collection staff; mandatory reason, pharmacist request and owner approval verified without money collection. |

Required validation after each source fix: CSS build, npm test on 4397, wiring check, integration regression, admin-only and realtime permissions. Additional profile audit passed. Latest fix logs use free-request-fix suffix under acceptance-evidence/2026-10-07. Latest live restart returned health status ok and 22 demo accounts.

## Unresolved observed issues

1. **Abnormal vitals rely on colour/symbols in several views.** Recent vitals, consultation/visit and queue views lack consistent written HIGH/LOW flags. The entry form has Out of range wording; CBC print is fixed separately.
2. **Nurse dashboard occupancy says No wards set up** when five wards and 14 beds exist at zero occupancy. Distinguish empty occupancy from missing setup.
3. **Imaging dashboard uses Laboratory / Samples / Collected terminology.** Align the imaging dashboard with imaging work stages.
4. **Phone patient-return table is awkward:** narrow item text and return quantity beyond the visible table. Recheck at actual 390 CSS pixels and correct layout.
5. **Reception visit page says the doctor has not documented a signed visit.** Clinical notes are appropriately hidden from Reception; the message should explain restricted access rather than imply absent documentation.
6. **Financial wording is inconsistent:** approved payer visits can say Paid before money is received; credit visits can say Payment pending despite approved credit; some co-pay modal and shared-context payer figures differ. Preserve independent clinical, patient collection and payer settlement states.
7. **Owner Collections says No patient payment due for unpaid self/credit bills** when the role simply cannot collect. Separate role access from actual outstanding money.
8. **Pharmacy dashboard category summaries need reconciliation:** PHARM patient dues labelled OP; Aarogyasri value showed zero despite a new AAR pharmacy bill. Reproduce and compare with bills, settlements and receipts.
9. **Open admission drawer stays stale after consumable posting.** Closing/reopening showed the new ₹4 IP charge; the existing drawer retained previous totals.
10. **Emergency vitals help text refers to pending fees / vitals-done.** Verify ER-specific wording so it does not imply a payment gate.
11. **Cleanup dry-run does not reflect preserve-masters.** Actual preservation was independently checked before application; improve preview accuracy.

## Findings requiring investigation, not yet confirmed bugs

- Pharmacy Revenue includes billed credit amounts; confirm intended accrual versus collection label. Bills register correctly separates billed, collected and due.
- Accounts Patient dues KPI rose when a payer claim was rejected, while collection policy still classified the amount as pending payer charges. Reconcile KPI definition before changing money logic.
- Returned pharmacy bill Gross/Total differed (₹14/₹16); inspect tax-exclusive versus net labels rather than assuming incorrect money.
- Rapid browser actions sometimes had no effect. Some were explained by an automatic admission-forms overlay; do not assume every case is a repaint defect.
- Add charge modal's first service option was observed with value day rather than a service ID. Submitting added ₹800; inspect service association and label. No fix or complete retest yet. A Nursing note modal is currently open and unsaved after the interruption; inspect current UI before continuing.
- Earlier responsive observations used requested dimensions affected by display scaling. Actual 390×844 and 1440×1000 CSS sizes are now verified; older screens require exact-size rechecks.

## Hospital setup gaps — do not invent values

- Four procedure tariffs are zero: Bandage/dressing, POP cast application, Suture removal, Wound suturing.
- Active Fever Diagnostic package has advertised inclusions but zero configured service items; visit association/coverage remains unverified. Many payer agreements remain draft/zero.
- GSTIN, NABH number, LAN and message gateway fields are blank. Capacity says 100 while only 14 beds are configured. Hospital must provide the intended setup.
- USG templates/orders were absent; complete USG reporting workflow remains untested.

## What is completed and what remains

Completed core OP flows for all 15 payment/category scenarios: registration, vitals, consultation, CBC, X-ray, result review, prescription/certificate previews, scheduled follow-up, pharmacy dispensing and visit closure. All 15 visits are closed; credit patient still has ₹1,254 approved due. Four OP payer cases settled; TPA reconciles ₹1,153 payer receipt + ₹1 write-off + ₹100 patient co-pay.

Stock GRN and Central→OP/IP/ER/ICU/OT transfers tested; patient return tested. One synthetic unidentified ER patient admitted to ICU with unpaid ER charges, ICU medicine use added to IP bill, transferred through General/Private/Special and back to ICU. Current admission is IP-2627-0001 in ICU-1-02. Daily transfer behaviour inspected; hourly charge and final discharge not complete. A further ₹800 charge was added during Add charge investigation and needs review.

Pending: remaining setup, supplier returns, competing-batch FEFO, rack replacement, non-medical stores/QR, full ER/ICU/nursing/discharge and payer IP stays, MLC/identification, OT, maternity, counselling, money controls/reconciliation/accounts, every menu/action for all 22 logins, patient portal, exports/physical printing, exact-width rechecks and two-window realtime evidence.

Synthetic test data is still present because testing is in progress. Backups exist. Final cleanup preserving logins and masters must happen after the run. Do not call the system fully accepted yet.

## Copyable continuation prompt

Continue MGM HMS acceptance testing in E:\MGM HMS using AI-FULL-MANUAL-TEST-PROMPT.md, ACCEPTANCE-REPORT-2026-10-07.md and this bug list. Read CLAUDE.md and applicable repository instructions first. The owner has authorized local acceptance tests and fixes; never change/delete logins or passwords and do not write outside E:\MGM HMS. Preserve existing test evidence and inspect current UI/data before retrying any operation.

Inspect the unsaved Nursing note modal and the latest ₹800 Add charge investigation first; do not blindly submit or duplicate a charge. Reproduce unresolved observations individually, distinguish setup gaps from defects, and fix confirmed defects without altering money/stock rules or broadening permissions. Do not invent hospital tariffs/package terms. After each fix run CSS build and all required suites on 4397, with TEMP/TMP/npm cache inside acceptance-evidence, restart the verified live listener through start-live.cmd, check health and 22 demo accounts, and repeat the manual step. Verify actual CSS widths 1440 and390. Do not treat automated suites as manual acceptance.

Finish all remaining workflows and 22-login/menu coverage from the acceptance prompt, with individual evidence and a clear pass/fixed/open/pending status. Keep the browser visible. Do not send real patient messages or perform external bank transfers; acceptance records are synthetic/local. Update the running report as work proceeds. Before final cleanup take a backup, stop the server and use the authorized clear-demo-data tool with preserve-logins and preserve-masters and a backup destination inside E:\MGM HMS. Restart and verify healthy,22logins unchanged and test transactions cleared. Only then write final acceptance status, explicitly listing remaining hospital decisions or unresolved defects.
