# PROMPT FOR THE TESTING AI — MGM HMS full manual acceptance test

Copy everything below the line into the other AI.

---

You are the acceptance tester for **MGM HMS** (folder `E:\MGM HMS`, live server
`http://localhost:4300`, LAN `http://192.168.1.100:4300`). The hospital demo is
tomorrow. Your job is to **use the application like real hospital staff, screen by
screen, in a visible browser**, find everything that is broken, confusing, wrong in
money, or missing in setup, fix it (or list it precisely), and prove each fix by
repeating the step. **This is a manual test, not a code test.** Running test scripts
is not enough: every item below must be done by clicking and typing in the real UI,
as the named login, and the result must be checked on screen and in the related
screens (bill, receipts, accounts, stock, audit).

Do not be lazy. Do not sample. Do not mark anything "passed" that you did not do.
If a step cannot be done, say exactly why. Report with evidence (what you clicked,
what you saw, what you expected).

## 0. Ground rules (must follow)

1. Read `CLAUDE.md`, `README.md`, `HANDS-ON-TEST-PROTOCOL.md` first.
2. **Back up before anything destructive**:
   `node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('data/surelyhms.db').exec(\"VACUUM INTO 'data/backups/before-acceptance-YYYY-MM-DD.db'\")"`
3. Another AI (Codex) may edit the same files. Check file modification times before
   editing; never overwrite someone else's change blindly.
4. **Never delete or change the 22 demo logins or their passwords.** Do not print
   passwords in chat.
5. The server runs from `start-live.cmd` (a separate window). To restart:
   stop the process on port 4300, then run `explorer.exe "E:\MGM HMS\start-live.cmd"`.
   After every restart check `/api/health` and that `/api/auth/demo-accounts` lists 22.
6. After every code fix: `npm run build:css`, then run `HMS_TEST_PORT=4397 npm test`,
   `node tools/wiring-check.mjs`, `node tools/integration-regression-test.mjs`,
   `node tools/admin-only-test.mjs`, `node tools/realtime-permissions-test.mjs` —
   all must pass — then restart live and **repeat the manual step**.
7. Rules of the system (do not break them): four independent state axes; emergency is
   never gated on money; one consultation bill per visit; every change goes through
   `emit()` with before/after audit; money only through `payments.js` /
   `accounting.js`; stock enters only by GRN into Central and moves by transfers;
   colour is never the only signal; local wall-clock times.
8. Test at **desktop width and phone width (≈390 px)** for every screen you touch.

## 1. Start clean — remove all demo / test data, keep the logins

1. Back up (rule 0.2).
2. Stop the live server (port 4300). Close any test server.
3. Dry run first to see what will be cleared:
   `node tools/clear-demo-data.mjs data "E:\MGM HMS-backups"`
4. Apply, keeping logins (and masters if the hospital wants its tariff/payers/packages kept):
   `node tools/clear-demo-data.mjs data "E:\MGM HMS-backups" --apply-confirmed-test-data --server-stopped --preserve-logins`
   (add `--preserve-masters` to keep templates, payers, packages, rates, medicine
   brand/generic/manufacturer lists).
5. Start the server, confirm health and 22 demo logins, confirm Dashboard, Bills,
   Patients, Stock are empty and nothing shows an error.
6. Write down exactly what was kept and what was cleared.

## 2. Setup (as admin, then verify from other logins)

Do each in the UI and verify it is used later in the flows:
- Hospital Settings: name, address, phone, GSTIN, logo/letterhead appears on every print,
  clinic hours, LAN IP, message gateway, any toggles (vitals gate, etc.).
- Users & Roles: check every role's menu matches its job; assign "Schedule OT"
  (`ot.schedule`) to an OT in-charge; confirm Cashier has cancel/refund and Reception
  does not; confirm Insurance login controls payer cases.
- Departments, doctors (fees, follow-up days, registration no. printed on Rx).
- Fees & Tariffs: OP consult, follow-up, every procedure has a price (none ₹0),
  IP charges with unit (day / hour / once), **"Applies in" ward kinds** (ICU-only monitor,
  ventilator; separate charges for general / private / special), auto-add on admission.
- Wards & Beds: every ward kind, bed tariffs, classes.
- Payers & TPAs: one each of TPA/insurance, Aarogyasri, corporate, trust; agreed rates.
- Packages: OP and IP packages with inclusions/exclusions and price.
- Suppliers, Medicine Master (brands with **same generic** to test alternatives,
  HSN and GST from the master), reorder levels, schedules (H, H1, X, narcotic).
- Lab parameters & reference ranges; imaging studies; report templates.
- Doctor templates (consultation templates with headings), certificate types.
- Stores items (non-medical) with QR labels.
- Visiting doctors with share %.
- Counters (reception, pharmacy) for cash desks.

## 3. Stock before patients

As pharmacy head / store:
1. **GRN** exactly like a supplier bill: received date, invoice date, supplier, invoice no.,
   invoice amount; lines with received packs, free packs, pack qty, DP, MRP, disc %,
   tax %, expiry MM/YYYY, batch; delivery charge, credit note; tally against invoice
   amount; HSN comes from master. Check stock units, cost/unit, MRP/unit, the GRN view,
   price-change alerts, supplier payable and the accounts voucher.
2. Transfers Central → OP, IP, ER, ICU, OT: request, approval by someone else (requester
   must not approve own), issue (first expiry), receive; check every store's stock.
3. Returns to supplier, expired / near-expiry views, stock by location.
4. Stores (non-medical): receive, QR label, scan on a phone, request, issue, count.

## 4. OPD — every payment mode (Reception, Nurse, Doctor, Lab, Imaging, Pharmacy)

Register **new patients** and run each visit to the end:
- Cash · UPI (with reference) · Debit card · Credit card · Cheque · Bank transfer ·
  split payment (two modes) · Collect later · Free (needs approval) · Credit patient ·
  TPA with co-pay · Aarogyasri · Corporate · Trust · Package patient.
For each: token, vitals (abnormal values flagged in words), doctor queue (doctor can
call in), consultation with template, prescription (drug survives placing orders),
lab + imaging orders, collection of service charges, lab sample → results → verify
(abnormal flags), imaging report, doctor re-consults with results, follow-up date,
certificate, prescription print (medicines + investigations), pharmacy dispensing
(chosen pay mode carries into the payment window; price shown = price charged;
out-of-stock brand offers **same-generic alternatives**; substitute recorded on bill).
Check: receipts (mode names readable), bills, patient record, visit tracking, follow-up
list, queue display, day report. Payer visits: **reception must never be able to bill a
payer; only an approved case moves the amount** (admins excepted).

## 5. Emergency → ICU → Ward → Discharge

- ER registration by triage (unknown patient, description visible, MLC number added later),
  treatment never blocked by money, ER charges, ER rack medicines (usage → pharmacy
  replacement → receipt into rack; for an admitted patient it joins the **IP bill**).
- Admit to ICU and to wards: charges ticked per ward kind; transfer ICU ↔ ward ↔ private
  ↔ special: preview shows what stops / starts; daily charges by 24 h from admission;
  **hourly charges** bill hours used; stop/waive with reasons.
- Nursing: vitals, notes, eMAR, intake/output, ICU alerts consistent with OPD limits.
- Advance, deposits, "Collect on IP bill" amount matches, adjust advance to ER/other bills,
  return unused advance.
- Discharge: doctor clears (reception cannot), summary written & signed, all bills
  (IP, ER, pharmacy) counted, pharmacy bills collected by pharmacy, discharge documents
  print with **the new letterhead and consolidated bill**, bed → housekeeping → clean.
- Payer stays (TPA, Aarogyasri, corporate, trust): self-pay converted later via
  **Change payer** → case pending → Insurance approves (entering approved amount moves
  the stage) → gates open → discharge bills the payer → receivable in Accounts → payer
  receipt with disallowance → settlement. Aarogyasri: no collect button anywhere, "Due
  from Aarogyasri".

## 6. OT, Maternity, Counselling

- OT booking (role with ot.schedule), checklist/consent, pre-op → knife to skin →
  recovery → complete, charges/consumables billed, OT stock, board shows the booked day.
- Maternity: ANC case, partograph readings (FHR alarms in words), delivery, baby record
  (note gaps: baby UHID, G/P/L update).
- Counselling: consent, record/upload, local transcription, summary, doctor sign,
  amendment.

## 7. Money control (Reception, Pharmacy, Cashier, Accounts, Insurance)

- Cancel receipt (cashier, reason), refunds (default to original mode), credit notes,
  waivers/discounts with approval, free approvals queue, due approvals.
- Daily Collection & Handover per desk (reception vs pharmacy), cash vs bank totals,
  Counter Reconciliation (variance 0, explanations), day close / reopen.
- Accounts: day book, trial balance balanced, P&L, payer receivables, supplier payables
  & payments, expenses, visiting doctor payouts (TDS), books integrity check.
- Insurance & Payer Cases: every stage, documents, co-pay, exclusions, packages,
  query/rejection reversal, settlement with disallowance.

## 8. Every login, every dashboard, every menu item

For **each of the 22 demo logins**: sign in, open the dashboard (numbers must match the
day's real activity), open **every menu item**, confirm nothing errors, nothing is shown
that the role must not see (e.g. reception sees no clinical notes), and every allowed
action works. Also: Team Chat & Tasks, Roster & Attendance (punch in/out, HR roster,
nurse read-only), Patient Messages, Quality, Audit Trail (before/after for every change
you made), Reports Centre (every report opens and exports), Local Setup & Sync,
My Access, Patient Portal (patient sees only own data).

## 9. Live / multi-screen checks

Two PCs or two browser windows with different logins: an action on one appears on the
other without refresh (queue, vitals, orders, results, bills, discharge board).

## 10. Final deliverable

A report file `ACCEPTANCE-REPORT-<date>.md` with, for every section above:
- what was tested (login, screen, data),
- result (works / fixed / still broken / design decision for the hospital),
- every bug: steps, expected, actual, fix, re-test result,
- setup still missing that the hospital must enter,
- final state: backups taken, suites green, live healthy, 22 logins present.
Do **not** leave test patients in the live system unless the hospital asks — clear them
again with the tool in section 1 after the run, keeping logins.

## Section and workflow list (must all be covered)

Overview: Dashboard · Team Chat & Tasks · Roster & Attendance · Stores & Materials
Reception & OPD: Patients · Appointments · OP Registration · OP Fee Collection · OPD
Procedures & Charges · Service Payments · Visit Tracking · Vitals Queue · Doctor Queue ·
Follow-up · Queue Display
Clinical: Consultation · Consultation History · Counselling · Clinical Orders · My
Templates · Certificates
Emergency: Emergency Desk
IPD: Admissions & Beds · Nursing · Ward Stock & Indents · ICU · Discharge · Beds to clean
Diagnostics: Laboratory · Imaging · USG Reporting
Pharmacy: Sales & Dispensing · Ward Requests & Replacements · ER/ICU/OT Stock · Stock ·
Stock Transfers · Purchases/GRN · Returns · Medicine Master · Suppliers · Daily Sales &
Handover · Pharmacy Analytics · Pharmacy Reports
OT & Maternity: OT Schedule · Maternity · Partograph
Billing & Insurance: Approvals · Daily Collection & Handover · Reception Reports · Bills ·
Receipts & Refunds · Insurance & Payer Cases · Payers & TPAs · Patient Messages · Packages
Finance: Accounts · Payer Receivables · Expenses · Visiting Doctors · Counter Reconciliation
Reports: Report Centre
Administration: Users & Roles · Hospital Settings · Fees & Tariffs · Wards & Beds ·
Attendance Reports · Audit Trail · Quality · Local Setup & Sync · My Access
Patient side: Patient Portal · Patient record · Visit page · Waiting-room display

Workflows: new patient → OP visit (all pay modes) → vitals → doctor → orders → lab/imaging
→ results → re-consult → pharmacy → follow-up · free / due / credit approvals · TPA,
Aarogyasri, corporate, trust, package (OP and IP) · self-pay converted to payer ·
ER → ICU → ward → discharge with advance and multiple bills · bed transfers with ward
charges · hourly charges · OT case · maternity & partograph · counselling · certificates ·
GRN → transfer → dispense → returns · rack replacement · stores & QR · receipt cancel &
refund · day close & reconciliation · accounts & payer receivables · HR roster &
attendance · every login & dashboard.
