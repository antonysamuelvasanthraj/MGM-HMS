# Self-pay admission followed by government / TPA approval

Retained synthetic patient: **QA IPD LATE APPROVAL 2026-11-01 TEST PATIENT**, **SHMS-2627-0002**, patient ID 2.

| Admission | Final payer | Final status | Claim |
| --- | --- | --- | --- |
| IP-2627-0002 | Aarogyasri | Discharged | CLM-2627-0001, settled |
| IP-2627-0003 | Insurance / TPA | Discharged | CLM-2627-0002, settled |

Both admissions started self-pay. The test paid a ₹50 deposit before conversion. Conversion without an explicit keep/refund decision was rejected; keeping the deposit preserved the receipt and paid amount. An earlier ₹300 OP bill remained self-pay and paid throughout both admissions.

The government case first rejected approval because its checklist was incomplete. The retained test supplied clearly fictional scheme-card, verified-eligibility, package and preauthorization references before approval. No real government authorization was represented.

Each case included a ₹100 synthetic pharmacy charge split ₹50 patient / ₹50 payer. Patient dues, inpatient financial clearance, discharge, housekeeping and payer bank receipts completed. Each IP bill was ₹1,500: patient deposit ₹50 and payer ₹1,450. All bills have zero balance. The government and TPA cases are settled. These are fictional financial QA entries, not real cash or actual medicine dispensing in these two cases.

The earlier retained patient SHMS-2627-0001 contains the OP, lab report, actual test-stock dispensing, seven accepted monetary payment values and cash/UPI split examples. See PATIENT-JOURNEY-RESULTS-2026-11-01.md.

## Implemented rule and UI

- Settings → Payer cases: **Aarogyasri only for inpatient admissions** is enabled.
- New OP scheme conversion / scheme case creation is blocked; late conversion of an admitted self-pay patient is allowed.
- Patient-level Aarogyasri classification no longer automatically makes an unrelated new OP episode a scheme episode.
- New case linking respects the admission requirement. Historical startup linking remains compatible with existing records.
- Existing receipt history is retained. Original bill numbers retain their issue series even when the bill's current payer category changes; the category and audit show the conversion.
- Paper mode has no separate OP-registration action on Reception Billing; direct OP-registration navigation redirects to Billing. New bill and IP admission remain available.

## Verification

- Isolated late-approval journey: 63 API checks passed.
- Retained live journey: 64 checks passed, including original checklist-setting restoration. IPD-only scheme policy remains enabled as requested.
- Paper billing browser check: separate OP action absent, New bill and IP admission present.
- Core regression: 1,319 smoke assertions and 279 integration checks passed. Generic test fixtures explicitly permit OP scheme maths so those older allocation scenarios remain covered; the dedicated late-approval test enables the production IPD-only rule and checks OP rejection.
- Live integrity: no foreign-key errors, negative stock, unbalanced vouchers, receipt mismatches or bill-balance mismatches.

Full department workflows and every possible payer policy are not inferred from one admission. Specialty paths and general monetary payment modes have separate test coverage.
