Cause: authenticated UI coverage is blocked because the required isolated target at 127.0.0.1:4388 was unavailable at the latest check; only the isolated target is permitted for this tester.
What I did: confirmed SUR-3 was still in_progress and recorded the bounded blocker; no UI, login, account, database, or business-record activity occurred.
Hand-back: UI Tester should resume against 4388 after it is healthy, using unchanged working demo accounts; keep the task blocked until then. Existing sanitized evidence: E:/MGM HMS/qa-reports/2026-11-02/ui/wake-1252-isolated-blocker.md.
