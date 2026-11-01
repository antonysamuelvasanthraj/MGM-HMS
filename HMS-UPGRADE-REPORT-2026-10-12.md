# MGM HMS upgrade and verification report

Date: 12 October 2026. Changes are applied to the existing local HMS and loaded on localhost:4300. Git changes are uncommitted; no commit or push was made.

## Delivered changes

| Area | Result |
|---|---|
| Reception billing | Existing service billing, split collections, advances, payer cases and receipts retained. Item and bill discounts now require permission/reason and exclude pharmacy components, including on consolidated IP bills. Waivers cannot bypass this protection. |
| Visiting doctors | Expanded master includes hospital, type, schedule, consultation/procedure/session/day fees and agreement references/terms. Clinical bill lines can identify the actual treating professional and role. |
| Professional fees | Fixed/percentage/session/day rules are saved against attributed bill lines, protecting past rules from later master edits. Accounts/admin approval governs statements, adjustments and payouts; existing TDS and payable accounting retained. Referral masters create no commission payments. |
| OT | Separate hospital and professional components, multiple clinicians and stock-based medicines consolidate into the IP bill. Repeated completion is protected against duplicate charges. |
| Referrals | Doctor/hospital masters, registration/edit checkbox and details, master maintenance and referral analytics. Patient outside records use protected existing attachment storage. |
| Laboratory | Incharge template editing, method/unit/interpretation, age/sex/pregnancy reference rules and explicit critical thresholds. Results retain the applicable range and method. Archiving preserves past results. Existing sample, verification, printing and billing workflows retained. |
| Pharmacy | Discounts and selling-price overrides are rejected by the server. New, hold/resume, complete, credit, completed bills and reprint workflows are connected. Held carts do not reserve stock and refresh batches/prices on resume. |
| Pharmacy reports | Patient/batch/tax/payment register with UHID, IP number, doctor, manufacturer, medicine, MRP/selling price, GST, collection, returns, credit and dues. Filters, KPIs and shared CSV/Excel/print exports. Consolidated-bill collection is allocated to lines rather than duplicated. |
| Central store / GRN | Prior batch availability, HSN, history, notes, adjustments, stock-location and protected GRN correction fixes retained. Expired/empty batches remain in history but are excluded from dispensing. Existing transfers remain inventory movements rather than sales. |
| Consolidated IP | Existing recurring charges, clinical services, pharmacy, advances, collections, authorization and discharge retained and regression checked. |
| Finance | Owner dashboard separates professional-fee earnings/payments/payables from revenue and collections. Dedicated clinical-work and doctor-payment reports added. Existing ledgers and financial statements retained. |
| Printing | Shared preview offers A4, A4 landscape, A5 and 80 mm. Wide reports default to landscape. Invoice details include pharmacy batch, expiry, MRP, selling price, generic and HSN where available. |
| Access and audit | Existing role permissions retained. New mutations and report-centre exports are audited. Lab template editing and doctor settlements are restricted; protected patient attachments remain permission checked. |
| Local preservation | Additive SQLite migrations only. No Firebase migration, rebuild, patient reset, login deletion or password change. |

## Database additions

Added referral_sources, pharmacy_held_bills and visiting_fee_adjustments. Added doctor master/agreement fields, bill-line fee snapshots, laboratory template/reference and result snapshot fields, patient pregnancy/referral fields. Existing attributed doctor rules are frozen by migration. Existing data remains in place.

Backup: `data/backups/before-integrated-upgrade-1791822722004.db`.

Preservation check: all 65 user records, including password fields, match the pre-upgrade digest exactly. Counts unchanged: 27 patients, 24 bills, 73 bill items, 18 payments, 2 refunds, 9 orders, 145 medicine batches, 219 stock movements, 3 purchases and 20 laboratory results. SQLite integrity is OK; foreign-key errors: 0. No synthetic financial/clinical transactions were inserted into the live database.

## Verification

- Final full test suite: passed; realtime-client checks, 1,275 smoke API checks and 233 integration regression checks.
- Final profile audit: passed; 2,056 API checks across 27 roles and 71 menu entries, zero failures.
- Earlier upgrade admin audit: passed; 584 API checks, 146 reports, 9 dashboards and empty-data handling.
- Earlier realtime permission checks: passed.
- Final wiring check: 392 routes and 495 client calls; no dead buttons, dead listeners or unaudited mutation routes detected.
- CSS build and Git whitespace checks: passed. Build reports an outdated Browserslist data warning only.
- Live restart health: healthy, API running, database connected and storage writable.
- Browser checks: pharmacy new/hold controls and no discount field, empty held-bill list, editable laboratory reference-rule form, pharmacy register data/filters, and shared landscape report print preview. Form previews were cancelled without creating live demo records.

The isolated surgery example passed: OT 25,000 + surgeon 30,000 + anaesthetist 10,000 + medicines 10,000 + other charges 5,000 = 80,000. Repeated completion did not duplicate charges; professional ledgers showed exactly 30,000 and 10,000 after collection. The fixture excludes additional bed charges; normal admissions continue to accrue their configured bed charges.

Evidence logs and preservation/health snapshots: `acceptance-evidence/2026-10-12/`.

## Remaining acceptance and setup

No failing check remains in the executed suites. This is not a claim that every screen/button was manually exercised. Staff should complete independent manual acceptance with their real tariffs, doctor agreements and approved lab reference ranges. Real laboratory values were not invented or medically validated by this upgrade.

Physical printer alignment on the hospital's A4/A5/thermal hardware and external SMS/WhatsApp delivery need onsite verification. Existing messaging integration settings were retained; no new external provider was configured or message sent.

Report-centre exports are audited; legacy standalone export controls outside the report centre were not comprehensively migrated to the new export audit endpoint. Excel export uses the existing compatible report export implementation, not a newly added native XLSX engine.
