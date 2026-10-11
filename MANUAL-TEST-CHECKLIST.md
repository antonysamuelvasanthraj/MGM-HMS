# MGM HMS — Manual Test Checklist

Tick each box as you go. Use the demo logins (tiles on the sign-in page). Use a
**test patient name** like `TEST Ravi` so test data is easy to spot later.
On every page also check: loads without error, no text cut off, works on a phone
(sideways table scroll is fine), live updates appear on a second PC without refresh.

---

## A. Patient journey — OP (Reception → Nurse → Doctor → Lab/Pharmacy)

**Reception login**
- [ ] Patients — search existing patient by name, phone, UHID
- [ ] OP Registration — new patient, pay **Cash** → receipt prints
- [ ] Repeat OP registration with **UPI** (enter reference), **Card**, **Cheque**
- [ ] OP with **Free** (needs approval) → Approvals shows it → approve as admin
- [ ] OP with **Credit patient** → shows "Collect later"; later collect in OP Fee Collection
- [ ] OP with **TPA / Aarogyasri / Corporate / Trust** payer → co-pay collected, rest due from payer
- [ ] OP Fee Collection — collect a pending fee
- [ ] OPD Procedures & Charges — add a procedure bill, collect it
- [ ] Appointments — book, reschedule, cancel, mark arrived
- [ ] Visit Tracking — patient moves through stages
- [ ] Queue Display — opens on TV screen, shows tokens

**Nurse login**
- [ ] Vitals Queue — record vitals (BP, pulse, temp, SpO₂, weight); abnormal values flagged
- [ ] Patient blocked for unpaid fee shows the reason; credit/approved shows as allowed

**Doctor login**
- [ ] Doctor Queue — patient appears after vitals, call next
- [ ] Consultation — complaints, diagnosis, insert a **template**, autosave works
- [ ] Prescribe medicines (Rx editor), order **lab** and **imaging** tests
- [ ] Sign consultation → print prescription
- [ ] Amend a signed consultation (reason asked, history kept)
- [ ] Book follow-up / appointment from consultation
- [ ] My Templates — create, edit, delete a template
- [ ] Certificates — issue medical / fitness certificate, print
- [ ] Consultation History — see past visits
- [ ] Clinical Orders — orders list and status
- [ ] Follow-up — due follow-ups list

**Lab login**
- [ ] Laboratory — collect sample, enter results, abnormal flag, verify, print report
- [ ] "Verified today" count matches

**Imaging / USG login**
- [ ] Imaging — mark done, report, verify
- [ ] USG Reporting — write USG report, print

**Doctor again**
- [ ] Re-consultation after results — results visible inside the consultation

**Pharmacy login**
- [ ] Sales & Dispensing — dispense the prescription, all pay modes (Cash/UPI/Card/credit/payer)
- [ ] Walk-in sale without prescription
- [ ] Return a sold item → refund
- [ ] Daily Sales & Handover — totals match

---

## B. Emergency → ICU → Ward → Discharge

- [ ] Emergency Desk — register ER patient (unknown name allowed), treatment **not blocked by money**
- [ ] ER orders, medicines from ER stock, ER bill
- [ ] Shift to **ICU** — ICU charting, vitals, nursing notes
- [ ] Admissions & Beds — admit to ward, bed allotted, take **IP advance**
- [ ] Transfer bed / ward
- [ ] Nursing — medication chart, given/missed, nursing notes, intake/output
- [ ] Ward Stock & Indents — nurse raises indent → pharmacy issues → ward receives
- [ ] Ward Requests & Replacements (pharmacy side)
- [ ] Add 3–4 bills during the stay (lab, procedure, pharmacy, room)
- [ ] Discharge — doctor does clinical clear (reception cannot)
- [ ] "Adjust advance to dues" → dues cleared, excess returned
- [ ] Discharge summary — write, sign, print
- [ ] Beds to clean — housekeeping marks bed clean → bed free again

---

## C. OT & Maternity

- [ ] OT Schedule — book surgery, team, start/end, notes, OT consumables charged
- [ ] Maternity — register mother, ANC visit, delivery record, baby record
- [ ] Partograph — enter readings, chart draws correctly

---

## D. Counselling

- [ ] Counselling — new session, record audio (works on localhost/HTTPS) or upload audio
- [ ] Transcription appears (local whisper)
- [ ] Reviewer approves/returns the note

---

## E. Pharmacy stores & stock

- [ ] Suppliers — add supplier
- [ ] Medicine Master — add medicine (units, MRP, GST, reorder level)
- [ ] Purchases / GRN — receive stock into Central; price-change alert appears if price differs
- [ ] Stock — batch, expiry, quantity shown correctly
- [ ] Stock Transfers — request Central → ER/ICU/OT; **requester cannot approve own**; in-charge approves
- [ ] ER / ICU / OT Stock report
- [ ] Returns — return to supplier
- [ ] Pharmacy Analytics / Pharmacy Reports

## F. General stores & QR

- [ ] Stores & Materials — add item, receive stock, print QR label
- [ ] Scan label with phone camera → item page opens → Request / Issue / Count
- [ ] Department request → store issues → stock reduces

---

## G. Billing, payers & money

- [ ] Bills — open, add item, discount (needs approval), print
- [ ] Service Payments — authorize a service
- [ ] Receipts & Refunds — **cancel a receipt** (reason required), **refund** cash and UPI
- [ ] Insurance & Payer Cases — pre-auth, approve, co-pay update, claim submit
- [ ] Record TPA settlement with **disallowance** → bill auto-settles
- [ ] Payers & TPAs — add corporate, trust, TPA payer
- [ ] Packages — create package, register patient on package, extra charges billed separately
- [ ] Patient Messages — message queued; mark sent / send by WhatsApp
- [ ] Daily Collection & Handover — counts by Cash / Bank match receipts
- [ ] Counter Reconciliation — close counter, variance 0

**Accounts login**
- [ ] Accounts — day book, trial balance balances
- [ ] Payer Receivables — dues per payer correct after settlements
- [ ] Expenses — add expense, approve
- [ ] Visiting Doctors — add doctor, share calculated, pay-out

---

## H. Staff & HR

- [ ] Roster & Attendance — make roster (HR), nurse view is read-only
- [ ] Punch in → punch out, hours correct; hand-marked day then punch
- [ ] Team Chat & Tasks — message, assign task, mark done
- [ ] Attendance Reports

---

## I. Admin

- [ ] Users & Roles — add user, change role, disable user (**do not touch the 22 demo logins**)
- [ ] Hospital Settings — clinic hours, LAN IP, messages gateway
- [ ] Fees & Tariffs — set the 4 procedures still at ₹0
- [ ] Wards & Beds — add ward/bed
- [ ] Audit Trail — every change above shows who/when/before/after
- [ ] Quality — incident report, review
- [ ] Local Setup & Sync — desks connected, queue counts
- [ ] Report Centre — open each report group, export
- [ ] Dashboard — numbers match the day's activity
- [ ] My Access — each role sees only its own pages

---

## J. Patient Portal

- [ ] Portal — patient logs in, sees visits, reports, bills, appointments
- [ ] Patient cannot see another patient's data

---

## K. Cross-checks at end of day

- [ ] Every receipt from today appears in Daily Collection and Accounts
- [ ] Stock count = GRN − dispensed − transferred out + transferred in
- [ ] No bill shows a negative balance except IP advance held
- [ ] Log in as each demo role once — no page shows "Could not load"

**If something fails:** note the page, login used, patient name, what you clicked,
and a screenshot.
