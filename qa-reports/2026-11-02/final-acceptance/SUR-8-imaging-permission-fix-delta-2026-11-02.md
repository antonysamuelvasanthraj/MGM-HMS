# SUR-8 imaging permission fix delta — 2026-11-02

This additive note records coordinator source triage of the SUR-10 finding. It does not replace a live UI retest or whole-database patient reconciliation.

## Confirmed finding and source change

SUR-10 reported that a Medical Superintendent could see **Scan room** for paid imaging order `ORD-261102-00004` while `ORDERED`; clicking it returned a forbidden error and left the row unchanged. The existing API check in `server/routes/clinical.js` requires `imaging.schedule` for imaging status changes. The action renderer in `client/src/views/imaging.js` previously showed **Scan room** based only on order status, unlike the neighboring Schedule and Report controls, which check permission.

Changed the renderer to show **Scan room** only when the order is `ordered` or `scheduled` **and** the current user has `imaging.schedule`. This prevents the known view-only role from being offered an action the server will reject. The API authorization remains the enforcement boundary.

- Finding evidence: `SUR-10-imaging-unauthorized-control.png`
- Detailed reproduction: `SUR-10-SUR-7-bug-report.md`
- Changed file: `client/src/views/imaging.js`
- Validation run: `node --check client/src/views/imaging.js` passed.
- Live UI retest: pending SUR-10's retained session; no concurrent imaging workflow was interrupted.
- Regression suite: not run in this delta.

## Campaign state and limits

SUR-10's current handoff reports 10/10 allocated patients 021–030 created through UI and reopened with IDs/UHIDs; CBC on 021 was collected, processed, and verified, and X-ray on 022 was paid. The Scan room denial is the confirmed defect. Imaging acquisition/report/sign-off and print preview, doctor-facing visibility, and downstream reconciliation remain open. No claim is made here about the whole campaign patient count or the current live database inventory; earlier conflicting counts still require reconciliation.

No application business records, existing patients, roles, permissions, or accounts were changed by this source-only fix. No deployment or push was performed.
