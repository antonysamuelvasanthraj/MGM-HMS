# Completed patient journey — 1 November 2026

User authorized a retained synthetic patient, old dues, a few medicines, payment testing and complete discharge.

## Retained record

- Patient: **QA COMPLETE 2026-11-01 46aa TEST PATIENT**, UHID **SHMS-2627-0001**, patient ID 1.
- Admission: **IP-2627-0001**, discharged; bed cleaning completed.
- 13 bills: total **₹5,350**, receipts **₹5,350**, balance **₹0**.
- Old dues: a clearly labelled fictional ₹1,000 balance brought forward from 2024, entered today. First paid ₹400, later paid ₹600. This is not a backdated 2024 receipt or invoice.
- Three clearly labelled QA medicines/consumables and one fictional supplier/verified GRN retained. Stock received 300 units, dispensed 5; remaining Central 180, IP 57, OP 58.
- Monetary mode values exercised: cash, UPI, debit card, credit card, legacy card alias, bank transfer, cheque. Cash/UPI split also settled. Card alias normalizes to a canonical card mode.
- OP registration/fee, vitals, signed consultation, prescription, pharmacy dispensing/payment, lab collection/results/verification/report, IP admission/nursing/medicines, signed discharge summary, final financial clearance, discharge and housekeeping completed.
- Theme and token-reset settings changed on live, read back and restored. The retained patient is synthetic; the receipts and supplier liability are fictional test postings, not real money.

## Wider validation

Mutating tests below ran on isolated databases, not on real patient records.

- Core smoke: 1,320 API assertions; includes ER, OT, maternity, eMAR, returns, expenses, insurance, receivables, day close, reports and accounting.
- Integration: 279 checks passed.
- Clean installation: 611 API checks, 146 list endpoints, 156 reports, nine dashboards passed.
- Settings: 77 checks, 20 text/toggle setting round trips, 11 non-gateway policy switches exercised in both states and restored per switch, themes and actual token numbering passed.
- IPD: hourly/daily charging, stop behavior, repeat visits, package limits/exclusions and 15 charge-plan API checks passed.
- Payer policy: five scenarios covering room limits, pharmacy limits, co-pay/deductible, payer revisions and clinical paper documents passed.
- Admin browser navigation: 76 pages loaded without detected blank/missing/access-error screens.
- Live read-only audit: integrity OK; no foreign-key errors, unbalanced vouchers, negative batches, receipt mismatches or bill-balance mismatches.

## Changes made during this pass

- Settings saving now serializes every named checkbox automatically; new switches no longer depend on updating a separate list.
- Database audit output now uses data/logs and creates its output directory, fixing its failure after the requested old-report cleanup.
- Payer regression tests now create their own isolated users/fixtures instead of depending on deleted demo staff credentials.
- Added a reproducible complete-patient journey and isolated rehearsal runner. Re-running the live journey deliberately creates another labelled patient, so do not rerun it unintentionally.

## Limits

The retained live journey covers the OP → lab/pharmacy → IP → discharge spine. It does not put a single patient through incompatible specialty scenarios such as maternity and all payer categories. Those workflows were checked separately on isolated fixtures. API tests and browser navigation are not a claim that every button was manually exercised under every login. SMS/WhatsApp gateways remain excluded; cloud delivery receiver, physical printers/devices and off-computer recovery remain outside this verification. No new application financial bug was confirmed by these checks.

Machine-readable record: data/complete-patient-journey.json.
