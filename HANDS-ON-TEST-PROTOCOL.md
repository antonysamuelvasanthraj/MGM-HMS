# MGM HMS — Hands-on Test Protocol (for a tester or another AI)

This describes exactly how the 5 Oct 2026 hands-on test was run, every test case
performed, what was expected, and what was found. Repeat these cases, then extend
with the "Not yet covered" list at the end.

---

## 1. Ground rules

1. **Never test on the live database** (`data/surelyhms.db`, port 4300). Work on a copy.
2. Never reset/reseed live, never delete live data, never change the 22 demo logins.
3. Use patient names starting with **TEST** so test data is easy to find.
4. Test at **phone width (≈400 px)** as well as desktop — many bugs only show on a phone.
5. Act like the real person: sign in as the right role, click the real buttons, type in
   the real fields. Use API calls only to *check* results, not to skip the UI.
6. After every fix: re-run the same case, then the automated suites (section 6).

## 2. Setting up the test copy

```bash
# copy live DB into a scratch folder (read-only on live)
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('data/surelyhms.db').exec(\"VACUUM INTO '<scratch>/uitest/surelyhms.db'\")"
# start a test server on the copy
SURELY_DATA=<scratch>/uitest PORT=4388 HMS_HOST=127.0.0.1 node server/index.js
```
Open `http://127.0.0.1:4388/login`. Restart the test server after any change in `server/`;
a browser reload is enough for changes in `client/`. Run `npm run build:css` if classes change.

**Admin on the copy only:** set a throw-away admin password in the *copy* DB using
`hashPassword()` from `server/auth.js` (never on live).

## 3. Logins and how to switch role

Demo tiles on the login page (password shown on the page):
`demo.owner, demo.accounts, demo.quality, demo.ms, demo.reception, demo.receptionhead,
demo.cashier, demo.insurance, demo.doctor, demo.nurse, demo.nursehead, demo.lab,
demo.labhead, demo.radiology, demo.imaginghead, demo.pharmacy, demo.pharmacyhead,
demo.store, demo.hr, demo.hrstaff, demo.housekeeping, demo.housekeepinghead`

Switch role: logout (`POST /api/auth/logout` with header `X-Session: <token>`, remove
`localStorage.surely_token`), go to `/login`, click the tile, click **Sign in to MGM HMS**.
API checks use header **`X-Session`** (not `Authorization`).

Role facts discovered (by design, not bugs):
- ER arrivals are registered by **Nurse** (triage); Reception has no Emergency Desk.
- Receipt **cancel / refund** = **Cashier** only.
- **OT booking** = administrator only by default (assign "Schedule OT" to someone).
- Reception cannot see pharmacy bills; pharmacy bills are collected by Pharmacy.
- Doctor queue shows only the logged-in doctor's patients.

## 4. Generic checks on every screen

| Check | How |
|---|---|
| Page loads, no "Could not load"/"undefined"/"NaN" | read page text |
| No sideways page scroll at 400 px | compare `scrollWidth` vs `clientWidth` |
| Buttons not hidden behind notices / off-screen | screenshot at phone width |
| Colour is never the only signal (words/arrows too) | look at abnormal values |
| Labels say the real unit / real amount | read button & field labels |
| Same rule gives same result on every screen | e.g. vital limits OPD vs ICU |
| Live update: second login sees change without refresh | two roles / tabs |
| Every money action leaves a receipt / audit row | Receipts page, Audit Trail |

---

## 5. Test cases performed

Format: **ID · Role · Steps → Expected** (Result / bug number from the report).

### A. OP visit — cash patient (TEST Ravi)
- **A1 · Reception** · OP Registration → New patient (name, Mr., Male, age 42, mobile) → Create UHID → UHID created and pre-selected.
- **A2 · Reception** · Choose doctor, Collect now, Cash → Register → payment window pre-set to Cash ₹500 → Save → "Bill cleared", token slip. *(Bug 1: notice covered window buttons on phone → fixed.)*
- **A3 · Nurse** · Vitals Queue → Record vitals with BP 170/100 → patient moves to doctor; "Recently recorded" shows the reading, high BP flagged. *(Bug 2 → fixed.)*
- **A4 · Doctor** · Doctor Queue → patient "Callable" → **Call in** opens consultation. *(Bug 3: no button for doctors → fixed.)*
- **A5 · Doctor** · Templates → insert template → text goes into Complaints / Examination / Diagnosis / Plan; "Draft saved". *(Bug 4 → fixed.)*
- **A6 · Doctor** · Add drug (search "par", pick, 1-0-1 × 5 days → qty auto 10) → Order investigations (CBC, X-Ray) → Place orders → **drug still present and saved**. Also: while a nurse saves vitals elsewhere, unsaved drug lines must survive. *(Bug 5 → fixed.)*
- **A7 · Doctor** · Sign & complete → Print prescription contains the medicine and "Investigations advised".
- **A8 · Reception** · Service Payments → collect ₹750 by UPI with reference; second bill split Cash 100 + UPI 20; window must not scroll sideways on phone. *(Bug 6 → fixed.)*
- **A9 · Lab** · Laboratory → Collect sample → Enter results (Hb 11.2 low) → Save & verify; second test FBS 132 high. Flags LOW/HIGH shown.
- **A10 · Radiology** · Imaging → Scan room → Report (technique/findings/impression) → Sign & release.
- **A11 · Doctor** · Re-open consultation → results "View report"; abnormal values red + LOW tag; orders list shows "1 abnormal". *(Bug 7 → fixed.)*
- **A12 · Doctor** · Set review date +7 days, edit plan → Save amendment (reason required) → status "amended"; Follow-up page lists patient "in 7 days". *(Bug 8 → fixed.)*

### B. Pharmacy & stock
- **B1 · Pharmacy head** · GRN: supplier, invoice, Paracetamol, box of 10 strips × 15 tabs, qty 2, rate/box, MRP/box → summary shows 300 tablets, cost & MRP **per tablet** correct. *(Bug 9 → fixed.)*
- **B2 · Pharmacy head** · Stock page → each batch shows its **Location**; filter by location. *(Bug 10 → fixed.)*
- **B3 · Pharmacy head** · Stock Transfer Central → OP 100 → requester sees **no Approve**. Form usable on phone. *(Bug 11 → fixed.)*
- **B4 · Owner** · Open transfer (click row) → Approve. **B5 · Pharmacist** · Issue (earliest expiry batch) → Receive → OP stock +100.
- **B6 · Pharmacist** · Sales & Dispensing → Load TEST Ravi prescription → choose **Card** → Dispense → payment window must open on **Debit card**. *(Bug 12 → fixed.)*
- **B7 · Pharmacist** · Search medicine → listed price must equal the price charged (first-expiry batch). *(Bug 13 → fixed.)*

### C. Emergency → ICU → ward → discharge (unidentified RTA patient)
- **C1 · Nurse** · Emergency Desk → Register arrival: no known patient, description, P2, ambulance, vitals 90/60, 120, 92%, GCS 13, **MLC ticked without number** → registers; board shows description and "MLC no. pending"; click it → enter number. *(Bug 14 → fixed.)*
- **C2 · Doctor** · ER Charges → add 6 charges (₹3,300) → treatment never blocked by money.
- **C3 · Doctor** · Admit → ICU bed, consultant, diagnosis, daily charges (+monitor, oxygen) → admitted IP number; ER case closed.
- **C4 · Doctor** · ICU board → "Patients under alert" counts the patient; pulse/SpO₂/RR flagged. *(Bug 15 → fixed.)*
- **C5 · Nurse** · Nursing → Observations; Ward Stock → ICU → Record rack usage (2 × Ceftriaxone) → **Pharmacist** Supply & bill → **Nurse** Confirm receipt → "replaced"; charge lands on the **IP bill**. *(Bug 18 → fixed.)*
- **C6 · Nurse** · Admissions → Transfer bed ICU → ward; Stop monitor & oxygen (reason required); ward bed starts next day.
- **C7 · Reception** · Admission → button says "Collect on IP bill (₹x)" → take ₹5,000 advance. *(Bug 16 → fixed.)*
- **C8 · Reception** · Start discharge → board; Discharge before clearance → refused with correct total incl. **ER bill**. *(Bug 17 → fixed.)*
- **C9 · Reception** · try Clear → not allowed. **Doctor** · Clear + Discharge summary (pre-filled; complete; Sign & finalise) → 4/5 gates.
- **C10 · Reception** · Collect → IP bill, then ER bill open one after another; pharmacy bill gives "collected at pharmacy counter" notice. **Pharmacy** collects its bill. **Reception** · Discharge → all gates closed, bed released.
- **C11 · Housekeeping** · Beds to clean → Mark clean → bed free.

### D. Money corrections
- **D1 · Cashier** · Receipts → Cancel a receipt (reason) → bill reopens; with "Include cancelled" it stays listed, struck through, "Cancelled · who · when". Mode names readable ("Debit card", "UPI"). *(Bug 19 → fixed.)*
- **D2 · Cashier** · Refund ₹20 on a UPI receipt → refund mode defaults to UPI (card → card reversal); negative receipt posted. *(Bug 20 → fixed.)*

### E. OT, maternity, counselling, certificates
- **E1 · Admin** · OT → Book case (TEST Ravi, OT-3, tomorrow, surgeon/anaesthetist fees, minor dressing) → board jumps to that date; Checklist (consent etc.) → Pre-op → Knife to skin → Recovery → Complete; bill ₹5,800 raised.
- **E2 · Nurse** · Maternity → New case (G2 P1 L1 A0, 39 wks, active labour) → Partograph: 3 readings, last FHR 100 → shows "LOW — fetal bradycardia" in words. *(Bug 21 → fixed.)* → Update: delivered, baby details.
- **E3 · Nurse** · Counselling → New session (consent given) → upload a WAV (made with Windows text-to-speech) → local Whisper transcript appears → Start from transcript → Send to doctor. **Doctor** · Review & sign → signed. *(Bug 22 → fixed; root cause: confirmation dialog destroyed the window behind it.)*
- **E4 · Doctor** · Certificates → Sickness certificate, From/To dates fill the text → Sign & issue. *(Bug 23 → fixed.)*

---

## 6. Automated suites (run after every round of fixes)

```bash
HMS_TEST_PORT=4397 npm test                 # API smoke, 1243 checks
node tools/wiring-check.mjs                 # every mutation audited
node tools/integration-regression-test.mjs
node tools/integration-profile-audit.mjs
node tools/admin-only-test.mjs
node tools/realtime-permissions-test.mjs
```
All must report `"passed": true` / `PASS`.

---

## 7. Not yet covered by hands-on test — do these next

1. **Payers:** TPA / Aarogyasri / Corporate / Trust registration, co-pay, Insurance status updates, settlement with disallowance, Payer Receivables.
2. **Free and credit flows:** Approvals queue, credit patient collected later in OP Fee Collection.
3. **Packages:** create, assign to patient, extra items billed separately, package closed at discharge.
4. **Visiting doctors:** share calculation, payout with TDS.
5. **Accounts:** day book, trial balance, Counter Reconciliation (variance 0), Daily Collection & Handover totals by Cash/Bank.
6. **Stores & QR:** item, receive, print label, scan on a phone, request/issue/count.
7. **HR:** roster (nurse read-only), punch in/out, hand-marked day then punch, Attendance reports.
8. **Patient portal:** patient login sees only own data.
9. **Quality, Reports centre, Audit trail, Patient messages, Local sync, Users & Roles, Settings, Tariffs, Wards & Beds.**
10. **Appointments:** book, reschedule, cancel, arrived; Queue display on a TV.
11. **Two-screen live tests:** one role acts, another role's screen updates without refresh.
12. **Every role × every menu item** sign-in sweep (no "Could not load"; role sees only its pages).
13. Negative tests: wrong role tries each action (expect "not allowed"); double-click Save (no duplicate bills); closed day; expired batch; zero stock.

## 8. Reporting format

For each bug: **number · screen · role · steps · expected · actual · fix · re-test result.**
Keep a running list; say clearly what was fixed, what is a design decision for the
hospital, and what was not tested.
