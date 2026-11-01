# MGM HMS — Full Manual Acceptance Report

**Date:** 2026-10-16 · **Environment:** local install, HMS_ENV=demo (instance mode), port 4300 · **Tester:** full manual walkthrough per `AI-FULL-MANUAL-TEST-PROMPT.md`
**Database:** `data/surelyhms.db` · Backups: `data/backups/before-manual-test-2026-10-15.db`, `E:\MGM HMS-backups\hms-2026-10-15T13-09-59-521Z-28425f`

## 1. Executive summary

**PASS.** Every section of the hospital was exercised end-to-end through the real UI, with every cross-check confirmed in the database and the accounts. All 42 staff logins work, every page in every role's menu renders (466 page loads, 0 failures), all demo data was deleted and replaced by manually entered data, books balance (trial-balance difference 0, 0 integration mismatches), and all automated suites pass.

- Logins: **42/42 pass** (41 staff accounts + bootstrap admin)
- UI render sweep: **466 role-menu pages across 21 roles — 0 errors** (plus 65 admin pages verified separately)
- Wiring check: **399 API routes, 499 client calls, 0 dead buttons/listeners/badges, 0 unaudited mutations**
- Automated suites: realtime ✅ · smoke ✅ · integration regression ✅ (278 checks) · admin-only ✅ · realtime-permissions ✅
- Accounts integrity: **balanced, 0 unbalanced vouchers, 0 orphans** after every posting including GRN, refund, free-treatment settlement, expense and day close

## 2. Demo data removal & master data retained

`tools/clear-demo-data.mjs --apply-confirmed-test-data --preserve-logins --preserve-masters --preserve-catalogs` (server stopped, backup taken first). All demo patients, visits, bills, stock movements and journals were removed. Retained as the working foundation:

- 65 user accounts (43 active; the 22 inactive are the `demo.*` accounts, intentionally disabled) — **42/42 active logins verified**
- Masters: 17 wards / 67 beds, 110 services (none priced ₹0), 124 lab parameters, 142 medicines, 127 packages, 11 payers (Star Health insurance, Aarogyasri, TCS corporate, MGM Lions trust, etc.), 98 templates, 4 suppliers, 95-account chart of accounts
- Hospital Settings verified; **GSTIN `37AABCM1234A1Z5`** entered through the UI and saved

Everything below was then **entered manually through the UI** — no seeds, no imports.

## 3. Section-by-section results

### 3.1 Logins & role menus — PASS
All 42 credentials from `DEMO-LOGINS.local.md` (+ admin) authenticate. Per-role menu composition matches the permission matrix exactly, and every menu page of every role was loaded in the browser: 466/466 clean. Server-side enforcement spot checks: reception → clinical consultations **403**, reception → accounts **403**, reception → audit **403**, cashier → approve-free **403**, nurse → user administration **403**, nurse → write consultation **403**, lab tech → accounts **403**. `GET /api/auth/demo-accounts` returns `{"enabled":false}` — correct, demo quick-login is off in this mode.

### 3.2 Pharmacy purchase, GRN & stock transfer — PASS
- **GRN-2627-0001** (admin): supplier invoice SVP/2026/1042, ₹4,116; Pyrexa 500 (50+2×15 @ ₹22.50, MRP 35, batch PX500-A12, exp 2028-03) and Amoxil-D 500 (30×10 @ ₹85, MRP 120, batch AMX500-B07, exp 2027-11). Journal `PUR-2627-00001` balanced; supplier outstanding ₹4,116; Input CGST split correct.
- **TRF-2627-00002** Central → OP Pharmacy (Pyrexa 200, Amoxil 100): requested by central.pharmacy; **self-approval correctly blocked (403 `cannot_approve_own_request`)**; approved by pharmacy.manager, issued, received by pharmacist. Final stock: Central 580/200, OP 200/100.

### 3.3 OPD complete loop — PASS
Patient **Ramesh Chandra, SHMS-2627-0001**: registration (penicillin allergy recorded — it surfaced in vitals and lab dialogs) → ₹500 cash fee (RC-261015-00001) → vitals BP 168/102 → doctor queue call-in → signed consultation → prescription (Amlopres-D 5 ×30 correctly shown **out of stock**; Pyrexa 650 ×10 auto-quantity) → orders CBC ₹350 / RFT ₹550 / ECG ₹250 paid UPI (RC-261015-00002) → lab results entered with HIGH flags and verified by lab manager → ECG reported & signed → pharmacy substituted Pyrexa 500 ×10 @ ₹2.33 (₹23.30, OP stock 200→190, prescription status `partial` — correct substitution behaviour).

### 3.4 Refunds — PASS
Pharmacy bill refunded in full: −₹23.30 (RC-261016-00005, refund ref RF-261016-0001) with mandatory reason, original-mode refund default respected. Cashier has refund rights; reception does not.

### 3.5 Insurance / payer gate — PASS
**Sunita Sharma, SHMS-2627-0002** (Demo Star Health, policy STAR-99887766): ₹600 bill BL-261015-00001-TPA. Reception correctly sees *"Payer approval is pending… collects only the patient share"* and **cannot bill the payer**. Claim CLM-2627-0001 auto-opened; TPA desk approved ₹500 + ₹100 co-pay → stage *Preauth approved*. Co-pay ₹100 collected at reception (RC-261016-00006) → bill status `patient_cleared_payer_pending`, **₹500 open insurance receivable STL-2627-00001** visible in Accounts → Receivables and AR ageing.

### 3.6 Emergency → ICU → discharge → housekeeping — PASS
**ER-261016-0001** (unidentified male ~50 y, RTA, P2, MLC): no payment gate at the ER, auto UHID SHMS-2627-0003 → admitted ICU-01 (IP-2627-0001) → automatic day-1 charges ₹12,600 (bed 9,500 + monitor 800 + consultant 500 + critical-care nursing 1,500 + duty doctor 300) → nurse observations → doctor-signed discharge summary → reception `Start discharge` (doctor and cashier correctly **do not** get the button) → ₹12,600 cash collected (RC-261016-00004) → discharged → bed *cleaning* → housekeeping marked clean → **vacant**.

### 3.7 Operation theatre — PASS (1 UX finding)
**OT-261016-0001** (I&D abscess, OT-3, local anaesthesia): consent gate **blocked** Pre-op until the surgical safety checklist was signed; full lifecycle booked → pre_op → knife-to-skin → recovery → completed.
- **Finding F1:** fee rows typed at booking were silently dropped (`charges:"[]"`) because each amount needs its paired description label filled. Nothing warned the user. See §6.

### 3.8 Maternity & partograph — PASS
Sunita (G2P1L1A0, 38 wk, active labour): partograph observation cervix 5 cm, FHR 172 → system displays **"HIGH — fetal tachycardia"** in words. (Maternity write is nurse-side by design; doctors hold maternity.view.)

### 3.9 Counselling — PASS
**CNS-2627-00001**: consent recorded (`consent_given=1`) by the doctor. Whisper voice transcription not exercised (local binary in `whisper/`; optional feature).

### 3.10 Cash handover & counter reconciliation — PASS
Reception desk expected: cash ₹13,100 + UPI ₹1,150 across 3 receipts. Handover **HO-2627-00001** submitted by Ms. Kavya Sree (retained ₹100 change, declared cash ₹13,000 + UPI ₹1,150) → **accepted by Mrs. Lakshmi Prasanna, variance 0**; desk cash correctly drops to 0. Counter reconciliation: 0 bill mismatches, books balanced. (A further ₹100 co-pay collected after the handover sits as current drawer cash — normal.)

### 3.11 Free-treatment approvals — PASS
Walk-in **Venkat Rao, SHMS-2627-0004**: reception registered a visit and chose *Request free* (reason: Charity / BPL card) → bill BL-261016-00005-SELF (₹500) appeared in `/approvals` — reception's `can_approve` is **false** → approved by hospital admin → bill `covered`, balance 0, encounter `payment_status=free`, journal `STL-2627-00002` posted at full value (visible in reports, never counted as collection).

### 3.12 Accounts — PASS
- 19 journal vouchers / 48 lines covering GRN, charges, receipts, refund, COGS, payer transfer, free settlement, expense accrual + payment
- **Trial balance difference 0**; integration reconciliation 0 mismatches; integrity check ok after every step
- Position: cash ₹13,200 · UPI clearing ₹1,150 · insurance receivable ₹500 · supplier payable ₹4,116
- P&L (15–16 Oct): income ₹15,370.80 (OP consult 1,600 · IP 1,600 · ICU 9,500 · lab 900 · imaging 250 · pharmacy 20.80 …)
- **Expense VCH-2627-00001** (Medical Consumables, ₹2,500, oxygen refilling): created → approved → paid through the UI; appears in P&L under 6400
- **Day close 2026-10-16**: closed with variance 0 (summary: 2 bills, gross ₹13,100, free ₹500, net collection ₹12,676.70)

### 3.13 Reports Centre — PASS
146 reports catalogued. 26 key reports run for the period — all return correct data (revenue by department, collections by mode, doctor revenue, day book 48 rows, trial balance, P&L, balance sheet, AR/AP ageing, GST summary, stock/batch/valuation, purchases, supplier outstanding, transfers, free-treatment register, OP/IP registers…). Export endpoint verified for **csv, excel and pdf** (48 rows each, audited as `report.export`).

### 3.14 Patient portal — PASS
Portal PIN issued for SHMS-2627-0001 at reception → patient sign-in with UHID + PIN works → `/portal/me` shows only that patient's visits, verified lab results and masked mobile (`******2345`). Wrong PIN → `sign_in_failed`; bogus token → `portal_session_expired`; access is structurally scoped to the session's own patient.

### 3.15 Realtime & audit — PASS
Live chips/events drove dashboard, queue, pharmacy and handover updates during testing (websocket). 321 audit rows written during the manual run — every mutation (create/collect/refund/verify/approve/close) carries before/after, actor and reason. Realtime permission suite confirms payload redaction and role-targeted notifications.

## 4. Data now in the system (all manually entered)

4 patients · 6 encounters · 1 signed consultation · 3 vitals sets · 8 bills (7 live, 1 cancelled test entry) · 7 receipts · 1 refund · 3 diagnostic orders (19 lab results + ECG) · 1 prescription (2 items) · 1 ER case · 1 ICU admission & discharge · 1 OT case · 1 maternity case + partograph entry · 2 counselling sessions · 1 insurance claim (preauth approved, ₹500 receivable) · 1 GRN · 2 stock transfers · 1 cash handover (accepted) · 1 expense voucher (paid) · 1 free-treatment approval · 1 follow-up visit (auto free within window) · 19+ journals · 1 day close · 1 portal account.

## 5. Environment / setup notes (by design, not defects)

- SMS gateway and cloud sync endpoint are not configured on a fresh local install — OTP-by-SMS and message sending stay queued until configured (portal PIN issue works without SMS; `sent_by_sms:false` reported honestly).
- `/api/auth/demo-accounts` disabled — demo one-click logins are off outside demo-data mode.
- Housekeeping logins: only inactive `demo.housekeeping*` accounts exist; bed cleaning is done by nursing/admin roles (`beds.clean` / `ipd.manage`). Create a real housekeeping user if the hospital wants a dedicated login.
- Whisper voice transcription for counselling is present but optional; not part of this run.

## 6. Findings — all resolved on 2026-10-17

| # | Severity | Where | What happened | Resolution |
|---|----------|-------|---------------|------------|
| F1 | Low (UX) | OT booking | Charge amounts typed without the paired description label were **silently dropped** (`charges:"[]"`); no validation message | **Fixed** (`client/src/views/ot.js`): booking now stops with a clear warning — "Each charge row needs both a description and an amount — N row(s) are half-filled and would be dropped". Verified in the UI: booking blocked, no case created. |
| F2 | Low | Collect payment dialog | A typed UPI/card reference was lost when the cashier changed the payment mode — the mode switch re-rendered the extra field cell and wiped typed values (root cause of the null reference on RC-261015-00002) | **Fixed** (`client/src/collect.js`): typed reference / payer / reason are stashed per line and restored across any sequence of mode changes. Verified in the UI: value survives cash→UPI detours, and a ₹300 UPI collection posted with reference `UTR123456789012` persisted on RC-261017-00007. |
| F3 | — | Insurance list | Reported as a covered "Open" button — on re-test the button is fully hittable and opens the claim drawer with a normal click; the original observation was the row being outside the viewport during a synthetic click | **Not a defect** — no change needed |
| F4 | Info (policy) | Lab | The `lab.*` wildcard let a **lab technician verify & release** results | **Fixed** (`server/auth.js`): the `lab` role now holds explicit `lab.view / lab.collect / lab.result`; `lab.verify` (verify & publish) belongs to `lab_admin` only. Verified: lab.tech → 403 on verify; lab.manager retains it; result entry still works for technicians. |

Post-fix regression: wiring-check clean, full `npm test` suite exit 0 (278 integration checks), accounts integrity balanced, 0 integration mismatches. Test artefacts from verification were reversed (unpaid test bill cancelled with reason; no money movement left behind). Note: the imaging report endpoint uses one `imaging.report` perm for both draft entry and final signing — if the hospital wants technician-draft / radiologist-sign separation there too, that needs a small server change (separate perms per status), which was out of scope here.

## 7. Regression / automated evidence

| Suite | Result |
|---|---|
| `node tools/wiring-check.mjs` | 399 routes, 499 client calls — 0 dead buttons/listeners/badges, 0 unaudited mutations (re-run after fixes: clean) |
| `npm test` (realtime + smoke + integration-regression) | exit 0 — 278 integration checks, all workflows pass (re-run after fixes) |
| `tools/admin-only-test.mjs` | exit 0 — 130 list endpoints, 146 reports, 9 dashboards |
| `tools/realtime-permissions-test.mjs` | PASS — redaction, clinical alerts, role-targeted notifications, guest privacy |
| `tools/manual-login-sweep.mjs` (added this run) | 42/42 logins, per-role menu composition verified |

## 8. Final state

- Server running on port 4300 with the F1/F2/F4 fixes live (restarted after the changes; all data intact — sqlite on disk).
- The database is left **with the manually entered data in place** (this is the hospital's working data now — do not re-run the demo-data clearer).
- Backups from before the cleanup remain at the paths in the header.
- Browser left signed in as `billing` on the Daily Collection & Handover page.
- New reusable tool: `tools/manual-login-sweep.mjs` re-verifies every login and role menu in one command.
- Code changed in this fix round: `client/src/views/ot.js` (charge-row validation), `client/src/collect.js` (reference preservation across mode switches), `server/auth.js` (lab.verify restricted to lab_admin).

**Verdict: the system is ready for live use.**
