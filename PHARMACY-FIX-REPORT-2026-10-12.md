# MGM HMS — Pharmacy changes and verification

Date: 12 October 2026

Scope: the nine pharmacy requests from the handwritten note, with the user's clarification about old batches. Reception passwords are excluded. This report covers these pharmacy changes, not completion of the earlier hospital-wide acceptance test.

## Delivered behaviour

| No. | Request | Result and where to use it |
|---|---|---|
| 1 | Available batches and nil stock | Dispensing batch lists exclude exhausted and expired batches. Drug search quantities, next expiry and next price use usable stock in the selected OP/IP store. Batches are ordered by earliest expiry, then older batch ID. The existing Stock → Zero stock report and historical batch records remain available. |
| 2 | HSN and distributor information | Drug and Medicine Master search accept HSN as well as names and codes. Medicine Master displays HSN and provides a Distributor & invoice history link for staff with purchase-view access. The linked GRN list is filtered to the medicine; distributor search narrows it further. Open a receipt to see its item, batch and price details. |
| 3 | At least one year of purchase history | GRN defaults to the last year and supports received-date, invoice/GRN, distributor and medicine filters. Previous/Next pages expose older records without a fixed history cutoff. Clear the date fields to include records older than a year. Export retrieves all matching pages. The price-history API also supports pagination beyond its default 20-row page. |
| 4 | Central Store purchase accounts and totals | Existing purchase totals and supplier payables are retained. GRN totals now cover all matching records, rather than just the displayed page. Paid value is displayed. Replaced receipts are excluded from current purchase totals, supplier totals, payables, dashboards and reports to avoid counting them twice. |
| 5 | IP Pharmacy notes | Sales & Dispensing has a Pharmacy notes field. Notes from inpatient dispensing append to the running IP bill with staff name and local timestamp. Earlier notes remain intact. Reopen the bill under Bills to read them. Walk-in/OP notes are saved on the pharmacy bill. Notes clear when changing patient, loading a prescription, clearing the cart or completing the sale. |
| 6 | Old items and batches | Medicine Master → Open → Edit details includes Active/Archived status. Active, Archived and All catalogue filters are available. Archived drugs are excluded from active dispensing search and direct API dispensing. Historical receipts and batches remain intact. Exhausted/expired batches are hidden from dispensing; expiry stock removal uses an adjustment with a reason. |
| 7 | Central Store adjustments | The adjustment menu now matches supported actions: Adjustment, Expiry write-off, Damage, Disposal and Loss. A reason is mandatory. Returns and transfers continue through their dedicated workflows, rather than unsupported adjustment menu options. |
| 8 | GRN correction | GRN → View → Correct GRN opens the existing invoice values for correction. Staff require purchase-write and inventory-approval permissions and must enter a reason. An eligible correction reverses original inventory and purchase accounting, adjusts supplier outstanding, creates a replacement GRN and links both receipts in remarks and audit history. Original receipt lines, batch history and vouchers remain available. Obsolete price alerts are superseded. |
| 9 | Central, OP and IP stock totals | Existing GRN → Central → transfer → receiving-store → dispensing flow is retained and checked. Location cards now distinguish usable and expired quantities. Choosing a different batch updates the cart's displayed stock and selling price. Expired stock no longer inflates usable quantities in medicine search. |

## GRN correction rules

Corrections are deliberately restricted to unpaid receipts whose stock is untouched in Central Store and has not been combined with another receipt. Paid, transferred, consumed, adjusted, returned or otherwise used stock cannot be rewritten through this screen. Use the supplier-return and new-receipt workflow for those cases.

The replacement receives a new GRN number. The original is marked Corrected and is visible under **Replaced receipts (history)**. Corrections run in one database transaction: if any replacement validation fails, original stock, supplier balance, receipt status, alerts and accounting are restored. No historical receipt or login is deleted.

## Verification

| Check | Result |
|---|---|
| CSS build | Passed |
| Full npm test suite | Passed: realtime client checks, 1,267 API smoke checks, and the integration suite |
| Latest integration regression run | Passed: 183 checks, including 39 added pharmacy checks |
| Administrator/bootstrap suite | Passed: 578 API checks |
| Role-profile audit on disposable database copy | Passed: 2,038 API checks across 27 roles; no failures |
| Realtime permissions suite | Passed |
| Route/event/audit wiring | Passed: no dead buttons, dead listeners, missing badge computations or unaudited mutation routes |
| Git whitespace check | Passed |
| Live HMS health | Healthy after starting start-live.cmd |
| Database integrity | OK; zero foreign-key errors |
| Existing user records | All 65 current user rows identical before/after, verified by a full-row SHA-256 fingerprint. No login/password changes were made. |

The pharmacy regression checks cover expired/exhausted batch exclusion, local stock and price selection, HSN search, history exceeding 20 purchases, pagination and totals, archive/restore and direct API enforcement, damage adjustments, transfer conservation, persistent appended IP notes, correction authorisation and required reason, expiry correction preserving original history, rollback after invalid correction, duplicate correction rejection, supplier ledger reconciliation, obsolete alerts, and paid/used receipt restrictions.

Focused live browser inspection confirmed that the GRN filters/pagination render, a correction form loads its original invoice, pack quantities, tax, expiry and delivery charge correctly, and the pharmacy notes field is visible. The correction form was cancelled without saving. Transaction checks used disposable databases inside the HMS folder; no acceptance-test patient or purchase was created in the live database by this work. Opening the GRN page ran the application's existing automatic overdue-price-alert escalation.

This is not a full manual OP/IP acceptance sign-off. Your other AI should still exercise the changed flows in the browser, including staff permissions, phone layout, exports and actual user-entry sequences, using agreed test data.

## Backup and evidence

- Live database backup: `data/backups/before-pharmacy-fixes-1791814061802.db`
- Evidence folder: `acceptance-evidence/2026-10-12/`
- Login preservation and integrity evidence: `pharmacy-login-preservation.json`
- Logs: `pharmacy-build.log`, `pharmacy-tests.log`, `pharmacy-regressions.log`, `pharmacy-wiring.log`, `pharmacy-admin.log`, `pharmacy-realtime.log`, `pharmacy-profile.log`.
- Added regression cases: `tools/fixtures/pharmacy-regressions.mjs`, invoked by the standard integration regression suite.

All edits and generated evidence are inside `E:\MGM HMS`. Code changes are local and uncommitted; no Git commit or push was made.
