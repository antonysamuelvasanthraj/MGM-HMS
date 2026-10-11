# MGM HMS — Final integration test report

Verified 4 October 2026, approximately 8:40 pm IST. This report replaces the earlier readiness descriptions for the current code. The application is running locally at http://localhost:4300/dashboard.

## Result and boundaries

All executed automated suites passed. Live administrator navigation loaded all 64 visible menu links with content and without a displayed load/access failure. The full configuration contains 70 menu entries, 62 distinct menu controllers and seven internal routes. Every default role has a dashboard and its permitted menu APIs were exercised. This is verified functional coverage, not a guarantee that every possible input, device, clinical policy or continuous 24-hour operation has been tested.

Demo data and all 24 existing staff account records were preserved. Mutation tests used disposable databases, including a copy of the actual demo database for role testing. No demo transactions were entered, deleted or reset during this review.

## Test evidence

| Suite | Result | Coverage |
| --- | --- | --- |
| Main workflow suite, `npm test` | PASS — 1,191 API checks; 119 list endpoints | Linked clinical, stock, billing, payer, finance and new integration workflows |
| Role/profile audit | PASS — 1,832 API checks; 24 roles; 70 menu entries | Default/available dashboards, visible menu APIs, reports, denied access, task assignment scope and patient-profile privacy |
| Empty installation suite | PASS — 567 API checks | 94 empty tables, 119 list endpoints, 140 report endpoints and nine dashboard views |
| Local server suite | PASS | Startup, assets/login, missing database refusal, port conflict, crash recovery, graceful shutdown, backup integrity, checksums, attachment restore and retention |
| Realtime permission suite | PASS | Clinical payload filtering, role-targeted notifications and guest presence privacy |
| Payer invoice numbering | PASS | Independent self-pay, TPA, Aarogyasri and trust number sequences |
| Quality UI checks | PASS | Quality controller checks |
| Read-only live database/source audit | PASS | SQLite integrity; 160 JavaScript syntax checks; 375 relative imports |
| Live browser navigation | PASS for loaded administrator screens | 64 actual sidebar links; no financial actions submitted |

The live database has zero foreign-key violations, unbalanced journal vouchers, negative medicine batches, payment-total mismatches, bill-balance mismatches or orphan payment-to-bill links. There are 24 users, 23 roles currently represented by accounts and 37 departments.

An initial account-preservation audit used the historical 23-account baseline and failed that comparison. The subsequent audit explicitly used `data/local-integration-login-baseline.json`, containing 24 accounts, and passed. Comparison with `before-local-integration-completion-20261004.db` also found no added accounts or changes to existing user rows. The historical baseline was retained.

## Cross-section integrations tested

| Integration | Saved and linked flow checked | Result |
| --- | --- | --- |
| Patient registration | UHID/patient → appointment/encounter → queues, bills and patient timeline | PASS |
| Appointment conversion | Appointment → OP encounter/token; duplicate conversion protection | PASS |
| Consultation fees | Doctor tariff → registration bill → collection/receipt → queue/payment status | PASS |
| Vitals and doctor queue | Vitals entry → consultation readiness; role access | PASS |
| Consultation | Notes, diagnosis, orders and prescriptions → signed consultation; reasoned amendments | PASS |
| Diagnostics | Clinical order → service billing/payment gate → lab/imaging worklist → report verification → patient record | PASS |
| Clinical templates/certificates | Saved templates and certificates with permitted-role access | PASS |
| Emergency | ER encounter/charges → emergency bypass and admission/disposition links | PASS |
| Admissions and beds | Admission/payer → bed allocation, transfer, daily charges and deposits | PASS |
| Nursing | Notes, vitals and eMAR linked to admission | PASS |
| Discharge | Clearance checks, outstanding patient dues and package reconciliation → discharge; housekeeping workflow API | PASS |
| OT and maternity | OT booking/charges; maternity case and partograph linked to patient | PASS |
| Pharmacy dispensing | Batch stock → prescription/patient/admission → stock movement and bill; receipts only when collected | PASS |
| Procedure consumables | Procedure → issue from store of use → charge once on that procedure bill | PASS |
| GRN | Supplier invoice/multiple product lines → Central stock, batch/unit conversion, GST, supplier payable | PASS |
| GRN price alerts | Previous price comparison → price-change acknowledgement; large/stale increases escalate | PASS |
| Stock transfers | Source → destination, approval/short receipt and batch movements | PASS |
| Ward/emergency stock | Ward indent → pharmacy issue/IP billing; ER/ICU/OT batch-stock report API and live report screen | PASS |
| Returns and losses | Sales return/refund; purchase return; stock adjustment → inventory/accounting changes | PASS |
| Self-pay collections | Cash/UPI/card and split receipt → bill paid/balance, desk totals and accounting | PASS |
| Payer billing | Insurance/Aarogyasri/corporate/trust/credit → payer-covered versus patient-pay dues; settlement/disallowance | PASS |
| Payer conversion | Existing encounter bills → updated payer responsibility; patient contribution remains separate | PASS |
| Packages | Common hospital and payer agreement packages → utilisation, included/excluded/excess items and reconciliation | PASS |
| Free treatment | Saved free-visit request → approval → billing/accounting treatment | PASS |
| Desk handover | Desk collections/cash held → pending handover → receiver acceptance and shift workflow | PASS |
| Accounts | Payments, supplier payables, expenses and stock → journals/receivables → trial balance/balance sheet | PASS |
| Day close | Cash close/approval → post-close write lock | PASS |
| Doctor/department reports | Bill attribution → departmental/doctor reporting; allowed report catalogue execution | PASS |
| Visiting doctors | Outside surgeon fee attribution → share on actual collections → refund clawback → accrual/payout/TDS | PASS |
| Stores/materials | Supplier receipt → weighted cost → department request → partial/full issue/confirmation → return/transfer/count → valuation/books | PASS |
| Roster/attendance | Staff roster and attendance APIs and report access; live roster screen | PASS |
| Team chat/tasks | Authenticated chat and role scopes; task assignment restrictions and valid due dates | PASS |
| Patient portal | Reception-issued PIN → own records only; lockout, logout, rotation and revocation | PASS |
| Counselling | Patient/doctor session → recorded consent → audio upload/playback → transcript pathway → clinician summary → doctor sign/amend → patient timeline | PASS for exercised workflow; see limitations |
| Audit/realtime | Before/after/reason records and permission-filtered events | PASS |
| Local operation | Local database/server, backup and restore/recovery tests | PASS; continuous uptime not measured |

## Remaining limitations — do not present these as complete

1. Counselling supports audio recording/upload. Video recording is not implemented. The summary is drafted by a clinician and reviewed by the doctor; automatic AI summarisation is not implemented. The workflow suite tests transcription when the local engine is available; its current output does not separately record whether that conditional branch ran, so this report does not certify ASR accuracy. Physical microphone/camera and Telugu or other language accuracy need separate acceptance tests.
2. QR/store item lookup is implemented and stock workflows pass. Physical label printing, phone-camera scanning and all mobile devices were not tested in this review.
3. SMS/WhatsApp gateway delivery and permanent internet/domain access remain on hold at your request. A localhost address is not a remote client link.
4. Package and payer calculations follow configured coverage, exclusions, limits and agreements. Real insurer/government policy rules, copays and approved rates require hospital acceptance. Packages without coverage restrictions use the implementation's all-inclusive default; configure explicit exclusions where required.
5. Automated role/API tests cover all 24 default roles. Live browser navigation was performed as administrator; every role's complete visual journey and every field/button combination was not manually exercised. Browser review checked loaded content, not pixel-perfect layout at every resolution. One initial browser boot had a fetch error; reload recovered and the subsequent navigation checks passed.
6. Report APIs were exercised. Every exported Excel/PDF layout, attached scan, printer, barcode device and physical payment terminal was not independently verified.
7. Startup, recovery and backup tests passed; a 24-hour soak test, power-loss test and load/concurrency benchmark were not performed. No software test can promise uninterrupted operation without hardware/power/network monitoring.

## Changes made during this review

Only audit tooling was changed: the role audit now includes stores, counselling, visiting doctors and housekeeping, and fails when a visible menu has no API mapping. The account audit accepts an explicitly selected login baseline. Application workflows and live demo account/data records were not modified during this final test.

Machine-readable evidence: `data/integration-profile-audit.json` and `data/demo-final-audit.json`. Reproduce the preservation audit with `node tools/demo-final-audit.mjs --login-baseline=data/local-integration-login-baseline.json`.

## Complete configured menu and role mapping

The following tables are generated from the current navigation and successful isolated profile audit, not from an earlier screen list.

| Section | Screen | Route | Permission |
| --- | --- | --- | --- |
| Overview | Dashboard | /dashboard | authenticated |
| Overview | Team Chat & Tasks | /staff-workspace | authenticated |
| Overview | Roster & Attendance | /attendance | authenticated |
| Overview | Stores & Materials | /stores | authenticated |
| Reception & OPD | Patients | /patients | patient.view |
| Reception & OPD | Appointments | /appointments | appt.view |
| Reception & OPD | OP Registration | /op-registration | op.register |
| Reception & OPD | OP Fee Collection | /op-fee-collection | op.collect |
| Reception & OPD | OPD Procedures & Charges | /bills?new=op | op.collect |
| Reception & OPD | Service Payments | /service-payments | payment.authorize |
| Reception & OPD | Visit Tracking | /visit-tracking | queue.view |
| Reception & OPD | Vitals Queue | /vitals-queue | vitals.record or vitals.view or patient.clinical |
| Reception & OPD | Doctor Queue | /doctor-queue | consult.write or queue.manage |
| Reception & OPD | Follow-up | /follow-up | queue.view |
| Reception & OPD | Queue Display | /display-queue | queue.manage |
| Clinical | Consultation | /consultation | consult.write |
| Clinical | Consultation History | /consultation-history | patient.clinical |
| Clinical | Counselling | /counselling | counsel.view or counsel.write or counsel.review |
| Clinical | Clinical Orders | /orders | order.view |
| Clinical | My Templates | /templates | template.write |
| Clinical | Certificates | /certificates | certificate.view |
| Emergency | Emergency Desk | /emergency | emergency.view |
| IPD | Admissions & Beds | /admissions | ipd.view |
| IPD | Nursing | /nursing | nursing.view or patient.clinical |
| IPD | Ward Indents | /indents | ipd.indent |
| IPD | ICU | /icu | nursing.view or patient.clinical |
| IPD | Discharge | /discharge | ipd.view |
| IPD | Beds to clean | /housekeeping | beds.clean or ipd.manage |
| Diagnostics | Laboratory | /laboratory | lab.view |
| Diagnostics | Imaging | /imaging | imaging.view |
| Diagnostics | USG Reporting | /usg-reporting | imaging.report |
| Pharmacy | Sales & Dispensing | /pharmacy | pharmacy.view |
| Pharmacy | IP Requests | /indents | pharmacy.dispense |
| Pharmacy | ER / ICU / OT Stock | /reports?report=emergency_store_batches | reports.pharmacy |
| Pharmacy | Stock | /stock | inventory.view |
| Pharmacy | Stock Transfers | /stock-transfers | inventory.view |
| Pharmacy | Purchases / GRN | /grn | purchase.view |
| Pharmacy | Returns | /returns | pharmacy.view or purchase.view |
| Pharmacy | Medicine Master | /medicines | inventory.view |
| Pharmacy | Suppliers | /suppliers | supplier.view |
| Pharmacy | Daily Sales & Handover | /day-report?desk=pharmacy | pharmacy.view |
| Pharmacy | Pharmacy Analytics | /pharmacy-reports | pharmacy.view |
| Pharmacy | Pharmacy Reports | /reports?group=Pharmacy | reports.pharmacy |
| OT & Maternity | OT Schedule | /ot | ot.view |
| OT & Maternity | Maternity | /maternity | maternity.view |
| OT & Maternity | Partograph | /partograph | maternity.view |
| Billing & Insurance | Approvals | /approvals | payment.approve_free |
| Billing & Insurance | Daily Collection & Handover | /day-report | reports.collection |
| Billing & Insurance | Reception Reports | /reports?group=Reception | reports.reception |
| Billing & Insurance | Bills | /bills | payment.view or payment.collect or finance.view or insurance.view |
| Billing & Insurance | Receipts & Refunds | /receipts | payment.view |
| Billing & Insurance | Insurance & Payer Cases | /insurance | insurance.view |
| Billing & Insurance | Payers & TPAs | /payers | insurance.view |
| Billing & Insurance | Patient Messages | /messages | payment.collect or finance.view or admin.view |
| Billing & Insurance | Packages | /packages | op.register or insurance.view or admin.view |
| Finance | Accounts | /accounts | finance.view |
| Finance | Payer Receivables | /accounts?tab=receivables | finance.receivables |
| Finance | Expenses | /expenses | expense.view |
| Finance | Visiting Doctors | /visiting-doctors | finance.view or admin.view |
| Finance | Counter Reconciliation | /counter-reconciliation | finance.counter |
| Reports | Report Centre | /reports | reports.view |
| Administration | Users & Roles | /users | admin.view or staff.manage |
| Administration | Hospital Settings | /settings | admin.view |
| Administration | Fees & Tariffs | /tariff | admin.view |
| Administration | Wards & Beds | /wards | admin.view |
| Administration | Attendance Reports | /reports?group=Staff%20%26%20HR | reports.attendance |
| Administration | Audit Trail | /audit | audit.view |
| Administration | Quality | /quality | quality.view |
| Administration | Local Setup & Sync | /local-sync | admin.view |
| Administration | My Access | /my-access | authenticated |

### Role dashboards and menu access

| Role | Default dashboard | Available dashboards | Menu entries | Reports |
| --- | --- | --- | --- | --- |
| admin | owner | reception, doctor, pharmacy, lab, nurse, owner, insurance, quality, work | 65 | 140 |
| owner | owner | owner, insurance, quality | 34 | 140 |
| reception | reception | reception, work | 29 | 25 |
| cashier | reception | reception, work | 17 | 25 |
| doctor | doctor | doctor | 26 | 0 |
| nurse | nurse | nurse, work | 24 | 0 |
| lab | lab | lab, work | 8 | 0 |
| radiology | lab | lab, work | 9 | 0 |
| pharmacy | pharmacy | pharmacy, work | 20 | 42 |
| store | pharmacy | pharmacy, work | 13 | 42 |
| accounts | owner | owner, insurance, work | 25 | 140 |
| insurance | insurance | insurance, work | 13 | 0 |
| quality | quality | quality, work | 7 | 0 |
| reception_admin | reception | reception, work | 31 | 29 |
| pharmacy_admin | pharmacy | pharmacy, work | 22 | 46 |
| lab_admin | lab | lab, work | 10 | 4 |
| imaging_admin | lab | lab, work | 11 | 4 |
| nursing_incharge | nurse | nurse, work | 26 | 4 |
| cleaning | work | work | 6 | 0 |
| cleaning_incharge | work | work | 8 | 4 |
| hr_staff | work | work | 5 | 0 |
| hr | work | work | 7 | 4 |
| medical_superintendent | nurse | nurse, quality, work | 27 | 4 |
| manager | quality | quality, work | 14 | 4 |

### Internal routes

| Route | Screen |
| --- | --- |
| /patient | Patient Record |
| /visit | Visit |
| /doctor-consultation | Doctor OPD Consultation |
| /display-waiting | Waiting Room Display |
| /portal | Patient Portal |
| /collections | Collections |
| /login | Sign in |

Internal patient/visit/doctor workflows and portal APIs are covered by the workflow suites; every internal route was not separately navigated in the live browser.
