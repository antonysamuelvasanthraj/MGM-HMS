# SUR-10 UI retest update for SUR-7

Retested after the Imaging permission-gating change appeared in the shared workspace.

- Existing Medical Superintendent account signed in through the UI helper.
- The unchanged paid `ORDERED` study `ORD-261102-00004` remained visible.
- Scan room, Schedule, and Report controls were absent for this view-only role.
- No order, account, role, or permission was changed.
- Result: UI permission-control retest passed. Screenshot: `SUR-10-imaging-control-retest-after-fix.png`.

The original denial report remains in `SUR-10-SUR-7-bug-report.md`; imaging acquisition/report/sign-off remains untested.
