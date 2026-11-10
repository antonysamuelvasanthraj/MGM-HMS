# SUR-7 receipt authorization probe — 2 November 2026

## Result: passed

The operator independently completed the authorized read-only check in the actual local app at `http://127.0.0.1:4300` using the unchanged existing Manager account. Current effective permissions were verified as `billing.view=false`, `payment.view=false`, `payment.collect=false`, and `finance.view=false`. The single read-only request for verified synthetic campaign payment 4 returned **HTTP 403**.

This closes the negative receipt authorization probe for the existing Manager role. The receipt body was not retained. No account, role, permission, or business record was changed. This is operator-provided independent evidence; SUR-7 did not perform this live-app request.

## Remaining coverage

This result verifies denial for this role and campaign payment only. Positive receipt access for an authorized role and other receipt workflows remain unverified. Do not broaden this result to unrelated receipts or roles.

## Related UI retest

SUR-10 independently reports that after the Imaging permission gate fix, the unchanged Medical Superintendent role showed zero Scan room, Schedule, or Report controls for its unchanged paid `ORDERED` study. That closes the visibility-control retest; imaging acquisition, report, and sign-off remain untested.
