# SUR-8 supplemental evidence delta — 2026-11-02

This adds observations from the shared workspace after the prior SUR-8 evidence delta. SUR-10 is actively mutating the same workspace; this file is additive and does not edit its artifacts. It is not a whole-database reconciliation or acceptance report.

## Newly inspected UI evidence

- **Paper-mode imaging payment:** `SUR-10-imaging-payment-saved.png` shows the Investigation Queue confirmation “Payment saved — bill cleared” for `TEST-MGM-QA-022`, X-Ray Chest PA. It displays order `ORD-261102-00004`, encounter `ENC-261102-00018`, receipt `BL-261102-00006-SELF`, and ₹400 received. The order row shows paid. This verifies one UI collection; accounting-period reconciliation and report/export persistence remain unverified.
- **Patient 021 result context:** `SUR-10-released-result-patient-record.png` shows patient 021, UHID `SHMS-2627-0038`, one encounter, one service order, one investigation, and a payment-pending encounter. This screenshot alone does not show the result-release state; the earlier checkpoint's separate verified-result screenshot remains the evidence for that step.
- **Patient 041 partial collection:** `SUR-12-collection-041-partial.png` shows the Billing & Invoice UI with a success notice stating ₹1,000 received and ₹1,400 still due on a ₹2,400 IP bill for patient 041. This confirms a partial UI collection on the campaign admission. It does not establish full settlement, discharge, receipt/accounting reconciliation, or day-close effects.

## Reconciliation limits

The operator checkpoint still reports 36 uniquely saved markers, while the shared `SUR-12-live-progress.md` reports UI registrations and generated UHIDs for 041–050, without application patient IDs; the newest patient-index screenshot reports 56 total patients. SUR-10 has UI evidence for 021–030. These sources are not yet reconciled to one current marker-to-ID inventory. Do not recreate markers based on the operator count alone; refresh the whole-database read-only inventory and reconcile against the UI ledger first.

## Acceptance status

The inspected artifacts add one paid imaging order and one partial IP collection to the evidence. Patient-ledger reconciliation, the 031–040 block, full IPD settlement/discharge, financial and stock reconciliation, remaining role/control coverage, and UI retests of source fixes are still outstanding. Recommendation remains **no-go** pending those items and human final approval.
