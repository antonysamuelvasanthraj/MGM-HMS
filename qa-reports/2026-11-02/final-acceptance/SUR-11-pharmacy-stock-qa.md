# SUR-11 Pharmacy Stock QA

Date: 2026-11-02  
Target: `http://127.0.0.1:4300`  
Assigned patient markers: `TEST-MGM-QA-031` through `TEST-MGM-QA-040`

## Progress

- Signed in once as Reception with the provided verified UI helper; reached `/dashboard`, then opened `/patients`. This context remains open. The list showed 39 patients at that time, including markers 021, 022, and 041. No patient data was changed in this context. Evidence: `SUR-11-reception-marker-check.png`.
- Signed in once as Pharmacy in an independent context with the same helper; reached `/dashboard`, then searched each assigned marker on `/patients`. Each query showed `0 shown`; no marker was present in the search results. The list showed 48 patients at that time, reflecting concurrent campaign activity. No patient or operational record was changed. Evidence: `SUR-11-pharmacy-marker-check.png`.
- Pharmacy navigation exposed Patients, Pharmacy Billing, Stores & Materials, and other visible role navigation. Only Patients was opened in this session. Visibility alone does not establish workflow permission or successful control behavior.

## Counts and coverage

- Assigned patients created: **0/10**. Patient IDs/UHIDs: **none**.
- Operational records created: **0**.
- Workflows completed: **0**.
- Marker duplicate check: **031â€“040 absent from Pharmacy patient search results**.
- Authentication: Pharmacy UI login and dashboard redirect **passed** (one attempt, HTTP 200). Reception UI login and dashboard redirect **passed** (one attempt, HTTP 200).
- Prescription queue/dispensing/returns, supplier and test-item setup, procurement/GRN, stock movement/transfer, inventory reconciliation, and accounting handoff: **not tested**.
- Digital prescriptions are unavailable in configured Paper mode per the owner direction and SUR-9 handoff. This is not recorded as a defect; unrelated manual-sale and procurement cases remain untested.
- Existing records, accounts, passwords, roles, permissions, settings, and stock altered: **0**.
- Confirmed bugs: **none**. No workflow controls were exercised deeply enough to confirm a defect.

## Evidence and next action

- `SUR-11-reception-marker-check.png`
- `SUR-11-pharmacy-marker-check.png`

The prior run reported an authenticated Pharmacy context, but no retained browser context is available to this run. No patient or operational record forms were submitted in this continuation. The required marker check was reported complete in the prior run; assigned creation and pharmacy workflows remain pending. Continue after a live authenticated context is handed off or the owner-coordinated role login is made available; all record entry must remain UI-only.

