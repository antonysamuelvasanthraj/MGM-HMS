# Four-payer workflow — 5 October 2026

This version is running locally at http://localhost:4300. It supersedes the older deployment and all-or-nothing exclusion instructions in PAYER-AND-BILLING-GUIDE.md.

## Responsibility

The insurance/payer team manages Insurance/TPA, Aarogyasri, Corporate and Trust cases. Use the correct payer master and agreement for each category. Patient credit remains patient debt; self-pay remains counter collection.

Reception collects patient responsibility on reception bills. Pharmacy collects patient responsibility on PHARM bills. Insurance records actual payer receipts and rejection adjustments against the linked receivables. Payer approval does not count as received money.

## Demo flow

1. Open Insurance & Payer Cases and select the patient's case.
2. Review the payer, agreement/package and approval. Enter the patient amount on each original bill line and give a reason. For a bed charge of ₹5,000 with coverage of ₹3,500, enter ₹1,500 as the patient amount. For a rejected ₹300 pharmacy item, enter ₹300.
3. Save the allocation. The case summary identifies each bill's collection desk, patient due and payer outstanding.
4. Reception collects its patient portion; pharmacy collects its PHARM portion. Their receipts remain linked to the original bills and patient.
5. In the case's receivables, use Record payment / rejection to record money actually received. Partial payer payments leave the remaining payer amount outstanding.
6. For a rejection after payer payments have started, record the rejection adjustment and transfer the amount to the patient where appropriate. The original bill's counter collects that new patient due.
7. When the recorded receipts clear patient and payer balances, linked bills show Fully settled and the paid case settles automatically. Clearing only the patient amount shows Patient dues cleared / Payer settlement pending.

Case co-pay is additional to explicit line allocations. Do not enter the same patient responsibility twice. After actual payer receipts, previous coverage terms are protected; use the receipt/rejection adjustment rather than overwriting them. Running IP medication charges belonging to an IP bill follow that bill's reception collection desk; PHARM bills follow pharmacy.

## Backend links

- GET /api/insurance/claims/:id/lines: original lines and partial patient allocations.
- PUT /api/insurance/claims/:id/exclusions: saves allocations with a required reason and audit trail.
- GET /api/insurance/claims/:id/collection-summary: consolidated linked bill balances and desks.
- GET /api/accounts/receivables?claim_id=:id&status=all: linked payer receivables used by the common receipt workflow.

Patient allocation is stored in bill_items.patient_pay_amount. Collection policy and payer billing use the same value. Actual settlement receipts drive case settlement; manually marking an unpaid case settled is rejected. Regular counter users cannot change payer allocations.

## Verification

- Full suite: 1,195 API checks and 78 regression checks passed.
- Four-payer regressions covered partial line allocation, correct counter collection, partial payer payment, later rejection transferred to the patient and automatic final settlement.
- Wiring check passed: 356 routes and 444 client calls.
- CSS build and insurance controller syntax check passed.
- Live health check passed; database integrity and foreign-key checks passed.
- All 24 staff login records matched the predeployment backup. No test patients or transactions were inserted into the live database.

Backup: backups/before-four-payer-workflow-20261005/hms-2026-10-04T20-06-30-801Z-4de221.

These checks verify the changed payer workflow; they are not a claim that every unrelated HMS feature has been retested in this update.
