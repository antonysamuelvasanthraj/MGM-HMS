# SUR-8 handoff — SUR-10 current results

SUR-10 created and UI-reopened all 10 assigned patients (021–030); generated UHIDs are recorded in `SUR-8-master-50-patient-ledger.json` and `SUR-10-results.json`. A synthetic paper CBC order for 021 was paid by local cash UI, collected, processed, and verified with 18 results. A synthetic paper X-ray order for 022 was paid by local cash UI and is awaiting imaging acquisition/reporting.

One confirmed UI bug was reported to SUR-7: Medical Superintendent Imaging showed a Scan room action that returned “forbidden” and left the order unchanged. After SUR-7's shared permission-gating change, the same role no longer saw Scan room, Schedule, or Report controls on the unchanged order; the UI retest passed. No account, role, permission, setting, or pre-existing business record was changed. No external payment, gateway, print, or messaging action was used.

Remaining SUR-10 coverage: imaging report/sign-off and print preview, doctor-facing result visibility, and lab/imaging orders for 023–030. Existing doctor/radiology role credentials were not verified. Detailed coverage, persisted IDs, order/bill references, and screenshots are in `SUR-10-lab-imaging-report.md` and `SUR-10-results.json`.
