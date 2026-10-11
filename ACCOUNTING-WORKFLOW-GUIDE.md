# Integrated accounts and hospital workflow — 3 October 2026

## Reception and outpatient procedures

Use Reception & OPD → OPD Procedures & Charges for POP, bandages, dressings, suturing, injections and other outpatient services. Select the patient and the correct OP visit to attribute revenue to its doctor. An inpatient admission is not needed. This creates a service bill without duplicating the consultation fee. Collect at reception using the existing collection engine; unpaid, partially paid, payer-covered and approved-free states remain separate.

Set hospital prices in Fees & Tariffs. POP, bandage, wound suturing and suture-removal names were added without inventing prices or overwriting existing prices. New entries start at zero; the OPD procedure form requires a positive charge. For free treatment, raise the normal charge and request approval rather than pricing the service at zero.

## Doctors, reports and rosters

Assign the specialty department in Users & Roles when creating or editing a doctor. Report Centre → Doctor-wise revenue now includes the department and uses accounting revenue, not collections. Bills with no linked visit are shown as Unassigned. Attendance now displays active staff even before shifts exist: filter a department, click a date cell and set a shift and unit. Actual hospital departments and wards are available as units.

## Collections and payer accounts

Cash, UPI, debit/credit cards, bank transfer and cheque payments all go through the same posting engine. Accounts → Reconciliation compares receipt records with the ledger, including money received from insurance and Aarogyasri. Cards share a clearing account and its balance is displayed once. Payer approvals create receivables; they are not cash collections. Accounts → Receivables is where payer receipts and disallowances are recorded. Free OP approvals display doctor and department and preserve the audit trail.

## Purchasing and clinical stores

Record one GRN for each supplier invoice, with multiple product lines, generics, brands and batches. The smaller invoice form puts pack conversion and product metadata in an expandable panel. Receive & next supplier invoice opens another invoice after saving the current one. Every receipt lands in Central. Stock Transfers moves stock to OP, IP, ER, ICU, OT or Ward, with approval, issue and receipt records. Ward indents identify the clinical store and admitted patient; dispensing adds the medicines to the running IP bill. Ward indents require an active admission; a non-admitted ER patient uses the ER billing/dispensing workflow.

## Reception and pharmacy handover

Daily Collection & Handover has separate reception and pharmacy desks. Each collector submits remaining cash and electronic mode totals to an active Admin or Owner. Either authorised receiver can accept or dispute another staff member's handover. Submitted or accepted amounts are excluded from later submissions. Differences in any mode require an explanation, even when the overall total happens to match. Handover tracks custody and verification; it does not create a second income receipt.

## Validation and deployment

The expanded workflow suite passed 532 API checks, including linked OP procedure bills, doctor department reporting, payer/payment reconciliation, balanced journal vouchers, duplicate handover prevention, Owner acceptance of pharmacy handovers, and Central transfer and ward issue workflows for ER, ICU and OT. The clean-installation suite passed 374 checks including all 127 report endpoints and role dashboards. Browser checks covered the new OPD charge form, GRN layout and departmental roster without captured console errors.

The local server was backed up before applying the changes. The live database currently has no collection receipts to reconcile; its existing journal vouchers balance. Test transactions were created only in isolated temporary databases. Bank/UPI/card statement reconciliation and physical cash counting still require the actual statements and shift counts.
