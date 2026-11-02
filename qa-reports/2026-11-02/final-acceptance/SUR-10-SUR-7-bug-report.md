# SUR-10 finding for SUR-7

## Medical Superintendent imaging control is visible but denied

- App: `http://127.0.0.1:4300`, existing Medical Superintendent account
- Worklist record: `ORD-261102-00004`, TEST-MGM-QA-022, X-Ray Chest PA
- Preconditions: imaging worklist showed the paid order at stage `ORDERED`.
- Reproduction: open Imaging as Medical Superintendent and click the visible **Scan room** button on this row.
- Observed: the app shows “Action could not be completed — forbidden”; the row remains `ORDERED`.
- Impact: the view-only role is offered an action that cannot complete. No role, permission, patient, order, or account setting was changed.
- Evidence: `SUR-10-imaging-unauthorized-control.png` in the final-acceptance evidence folder. The main QA details are in `SUR-10-lab-imaging-report.md`.
- Retest request: hide or disable this action for roles without the required order-update permission, then verify the Medical Superintendent view and an authorized imaging workflow in UI. The raw response status was not captured in this run; the app's visible denial and unchanged state were observed.
