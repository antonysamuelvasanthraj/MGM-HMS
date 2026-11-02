SUR-11 triage update — 2026-11-02

The latest owner comment clears the authentication cooldown and authorizes one correct UI login per role on the actual target at http://127.0.0.1:4300. Operator independently confirmed a Reception login, dashboard redirect, and Patients page; no business records or account/security settings were changed by that operator. This supersedes the earlier isolated-port assumption for future work. I have not logged in as Pharmacy or performed app-side marker checks in this triage run.

The current wake still marks SUR-11 dependency-blocked by parent SUR-8 and limits this run to responding/triaging the comment. Therefore assignment work remains pending: patients TEST-MGM-QA-031–040 created 0; operational records created 0; workflows tested 0; existing records/accounts/roles/permissions altered 0. The local ledger has no 031–040 entries, but this is not an app-side duplicate check. Doctor credentials remain unverified as previously directed.

When the parent dependency is cleared, resume on port 4300 using one permitted Pharmacy UI login, retain its authenticated browser context, check app-side markers before creating anything, then continue the assigned UI-only workflows. Do not expose credentials.
