# SUR-8 MGM HMS Final Acceptance Campaign — Plan & Ledger

**Campaign Start:** 2026-11-02  
**Target:** 50 UI-entered synthetic patients (TEST-MGM-QA-001 through TEST-MGM-QA-050)  
**Isolated Server:** http://127.0.0.1:4388  
**Data Folder:** C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-isolated-data

---

## Role Specialist Assignments & Account Availability

### Account Status (unverified until successful UI login)

**Available Logins** (from simplified 2026-11-02 set in DEMO-LOGINS.local.md):
- `admin` / [credential omitted; consult private demo-login file] — Full system administration
- `reception` / [credential omitted; consult private demo-login file] — Registration, search, appointments, OP queue & collection, admission
- `pharmacy` / [credential omitted; consult private demo-login file] — Prescription queue, OP & IP dispensing, returns
- `lab` / [credential omitted; consult private demo-login file] — Test queue, sample collection, result entry
- `accounts` / [credential omitted; consult private demo-login file] — Collections, expenses, receivables, payables
- `hr` / [credential omitted; consult private demo-login file] — Staff, rosters, attendance
- `manager` / [credential omitted; consult private demo-login file] — General manager operations
- `msupdt` / [credential omitted; consult private demo-login file] — Medical superintendent (clinical activity, census, quality)

**Legacy Demo Accounts** (41 roles in DEMO-LOGINS.local.md, to be tested):
- Doctor logins (consultation, prescription, admission)
- Nurse logins (vitals, eMAR, nursing notes)
- Pharmacy logins (stock, GRN, transfers)
- Lab/Radiology (test processing, result verification)
- Billing roles (collections, settlements, refunds)
- All specialist doctors (surgery, paediatrics, ortho, cardio, radiology)
- HR, maintenance, store managers

### Role Specialist Agents (5 active agents max)

| Specialist | Role Focus | Patient Markers | Workflows |
|---|---|---|---|
| **UI Tester** (existing) | Registration, Reception, Appointments | TEST-MGM-QA-001 to 010 | Patient registration, OP queue, fee collection, appointment booking |
| **Consultation Lead** (reuse/create) | OPD, Doctor, Nursing, Vitals | TEST-MGM-QA-011 to 020 | Vitals queue, consultation, clinical orders, doctor notes |
| **Lab & Imaging** (reuse/create) | Lab, Radiology, Result Verification | TEST-MGM-QA-021 to 030 | Test ordering, sample collection, result entry, imaging reports, verification |
| **Pharmacy & Stock** (reuse/create) | Pharmacy, Store, GRN, Stock Transfers | TEST-MGM-QA-031 to 040 | Prescription dispensing, stock movements, GRN creation, pharmacy indents |
| **Billing & IP Admission** (reuse/create) | Billing, IP Admission, Nursing, Discharge | TEST-MGM-QA-041 to 050 | Billing workflows, IP admission/transfer/discharge, running bills, settlements, refunds |

---

## 50-Patient Allocation (Ledger)

All patients created with markers **TEST-MGM-QA-NNN** in patient name or MRN field.

### Block 1: Registration & Reception (TEST-MGM-QA-001 to 010)
- Owner: **UI Tester**
- Workflow: Patient registration → OP queue → fee collection → appointment booking
- Status: [ ] 001 [ ] 002 [ ] 003 [ ] 004 [ ] 005 [ ] 006 [ ] 007 [ ] 008 [ ] 009 [ ] 010

### Block 2: Consultation & Vitals (TEST-MGM-QA-011 to 020)
- Owner: **Consultation Lead**
- Workflow: Vitals entry → consultation → clinical orders (lab, imaging) → follow-up
- Status: [ ] 011 [ ] 012 [ ] 013 [ ] 014 [ ] 015 [ ] 016 [ ] 017 [ ] 018 [ ] 019 [ ] 020

### Block 3: Lab & Imaging Results (TEST-MGM-QA-021 to 030)
- Owner: **Lab & Imaging**
- Workflow: Test sample entry → result entry → verification/sign-off → report to doctor
- Status: [ ] 021 [ ] 022 [ ] 023 [ ] 024 [ ] 025 [ ] 026 [ ] 027 [ ] 028 [ ] 029 [ ] 030

### Block 4: Pharmacy & Stock (TEST-MGM-QA-031 to 040)
- Owner: **Pharmacy & Stock**
- Workflow: Prescription dispensing → stock movement → indent fulfillment → GRN receipt
- Status: [ ] 031 [ ] 032 [ ] 033 [ ] 034 [ ] 035 [ ] 036 [ ] 037 [ ] 038 [ ] 039 [ ] 040

### Block 5: IP Admission & Discharge (TEST-MGM-QA-041 to 050)
- Owner: **Billing & IP Admission**
- Workflow: IP admission → bed assignment → nursing care → running bills → discharge settlement
- Status: [ ] 041 [ ] 042 [ ] 043 [ ] 044 [ ] 045 [ ] 046 [ ] 047 [ ] 048 [ ] 049 [ ] 050

---

## Coverage Matrix (Role/Module/Control Checklist)

To be populated as testing progresses. Each row = workflow element; columns = Pass/Fail/Blocked/N/A.

### Sidebar & Navigation
- [ ] Admin menu access (admin role)
- [ ] Medical superintendent view
- [ ] Role-based sidebar filtering
- [ ] Collapsible rail (Ctrl+B)
- [ ] Tab persistence across roles

### Authentication & Session
- [ ] Login with all 8+ roles (admin, reception, pharmacy, lab, accounts, hr, manager, msupdt)
- [ ] Logout and session clear
- [ ] Session timeout
- [ ] Cross-role permission enforcement
- [ ] Role-specific dashboard on login

### Patient Registration
- [ ] Search existing patient (no duplicate)
- [ ] Create new patient with UHID
- [ ] Edit patient demographics
- [ ] Validate required fields
- [ ] Empty/error state handling
- [ ] Mobile layout responsive check
- [ ] Print patient card

### OP Registration & Queue
- [ ] Open visit / create encounter
- [ ] Assign token and queue position
- [ ] Display on waiting-room board
- [ ] Consultation bill created (exactly one)
- [ ] Free visit with approval (if policy enabled)
- [ ] Collect now / collect later / free choice workflow
- [ ] Queue view on receptionist screen
- [ ] Doctor sees queue update realtime

### Billing & Payments
- [ ] Bill creation (OP fee, service charges)
- [ ] Multiple payment modes: cash, card, UPI, credit
- [ ] Split payment entry
- [ ] Partial payment with outstanding balance
- [ ] Receipt generation and print
- [ ] Refund workflow
- [ ] Cancellation workflow
- [ ] Insurance/TPA cases (pre-auth, claims)
- [ ] Corporate payer discount
- [ ] Bill search and filter
- [ ] Day closing / counter handover
- [ ] Outstanding receivables report

### Vitals & Consultation
- [ ] Vitals queue display
- [ ] Nursing enters vitals (BP, HR, O2, temp, etc.)
- [ ] Consultation form (history, findings, diagnosis)
- [ ] Prescription entry
- [ ] Clinical orders (lab, imaging, procedure)
- [ ] Follow-up scheduling
- [ ] Consultation bill vs. service bills (never duplicate consult charge)
- [ ] My Practice view for doctor

### Lab Orders & Results
- [ ] Order creation by doctor
- [ ] Lab worklist display
- [ ] Sample collection entry
- [ ] Result entry by technician
- [ ] Verification/sign-off by manager
- [ ] Report visible to ordering doctor
- [ ] Lab report print
- [ ] Turnaround time tracking

### Radiology/Imaging Orders & Reports
- [ ] Imaging order by doctor
- [ ] Imaging worklist
- [ ] Report entry by radiographer
- [ ] Sign-off by consultant radiologist
- [ ] Imaging visible to doctor
- [ ] Imaging print
- [ ] USG / X-ray / CT report types

### Pharmacy
- [ ] Prescription visible in pharmacy queue
- [ ] Dispense drug with batch/expiry
- [ ] OP vs. IP dispensing workflow
- [ ] Stock decrement on dispense
- [ ] Return/rejection workflow
- [ ] Indent fulfillment (ward to central store)
- [ ] Pharmacy print (label, receipt)

### Inventory & Stock
- [ ] GRN creation (receipt from supplier)
- [ ] Stock entry with batch and expiry
- [ ] Stock transfer between locations
- [ ] Stock movement report
- [ ] Expiry tracking and alerts
- [ ] Min/max stock levels
- [ ] Physical count / inventory reconciliation
- [ ] QR label generation

### IP Admission & Inpatient Care
- [ ] Admission from OP or emergency
- [ ] Bed allocation (ward and bed selection)
- [ ] Admission document
- [ ] Nursing charting (eMAR, vitals, notes)
- [ ] Bed transfer workflow
- [ ] Running bill accumulation
- [ ] Discharge workflow
- [ ] Final settlement and receipt

### Nursing & Ward Management
- [ ] Assigned patients list
- [ ] Vitals charting (eMAR)
- [ ] Nursing notes entry
- [ ] Intake / output recording
- [ ] Handover notes (shift change)
- [ ] Nursing supervisor review
- [ ] Ward stock indents
- [ ] ICU/NICU/PICU special charting

### Emergency & Casualty
- [ ] Triage workflow
- [ ] Emergency priority override (never gated on payment)
- [ ] ER vitals and observations
- [ ] ER admission workflow
- [ ] ER stock management
- [ ] Casualty register

### Operation Theatre (OT)
- [ ] OT schedule / case list
- [ ] Surgical team assignment
- [ ] OT checklist (swabs, instruments, etc.)
- [ ] Consumables consumption
- [ ] Recovery room charting
- [ ] OT stock indents

### Maternity & Gynaecology
- [ ] Antenatal registration
- [ ] Labour/delivery admission
- [ ] Partograph charting
- [ ] Delivery record
- [ ] NICU admission (if applicable)
- [ ] Postnatal follow-up

### Accounts & Finance
- [ ] Collections report
- [ ] Expenses entry and approval
- [ ] Receivables aging
- [ ] Payables report
- [ ] Day closing ledger
- [ ] Bank reconciliation (if applicable)
- [ ] Financial reports (income, expenditure)

### Insurance & TPA Desk
- [ ] TPA case registration
- [ ] Pre-auth request and approval
- [ ] Claim submission
- [ ] Claim approval and settlement
- [ ] Insurance customer ledger

### Admin Settings & Configuration
- [ ] Hospital operating mode (paper/digital/hybrid)
- [ ] Hospital settings (free visit approval requirement, call gate rules)
- [ ] Staff roster and schedule
- [ ] Department configuration
- [ ] Supplier master
- [ ] Drug master and stock settings
- [ ] Bill template and charge master

### Audit & Compliance
- [ ] Audit trail (before/after entries)
- [ ] User activity log
- [ ] Change history for key records
- [ ] No direct database edits visible (all via emit())

### Realtime & Sync
- [ ] Realtime update across users (e.g., new patient registration updates queue)
- [ ] WebSocket reconnect on network drop
- [ ] Sync queue status
- [ ] Offline vs. online indicator

### Print & Export
- [ ] Patient card print
- [ ] Receipt print
- [ ] Lab report print
- [ ] Imaging report print
- [ ] Discharge summary print
- [ ] Admission document print
- [ ] Pharmacy label print
- [ ] Prescription print

### Keyboard & Accessibility
- [ ] Ctrl+B rail toggle
- [ ] Tab navigation
- [ ] Enter key submit
- [ ] Escape key close modals
- [ ] Focus indicators

### Error States & Validation
- [ ] Required field validation
- [ ] Date format validation
- [ ] Duplicate patient warning
- [ ] Insufficient stock warning
- [ ] Budget/permission denial
- [ ] Network error handling
- [ ] Console errors (none expected)

### Mobile Responsiveness
- [ ] Login screen (mobile)
- [ ] Patient search (mobile)
- [ ] OP queue (mobile)
- [ ] Consultation (mobile)
- [ ] Billing (mobile)
- [ ] Pharmacy (mobile)
- [ ] Nursing (mobile)
- [ ] Print view (desktop only)

---

## Financial & Stock Reconciliation Checklist

For each test patient block, verify:
- [ ] Total bills created = expected charges (OP fee + services)
- [ ] Total payments received = bill amount (or partial with clear outstanding)
- [ ] Refunds applied = expected net
- [ ] Stock decrements = dispensed quantities
- [ ] Stock transfers logged = GRN + receipt
- [ ] Ledger postings (journal_lines) match payments and refunds
- [ ] Bill settlements (payer/free/due) reconcile with ledger
- [ ] No direct journal_line inserts (all via recalcBill/emit)
- [ ] Accounting reports (income, receivables) match test records

---

## Bug Register Template

| Bug ID | Role | Screen | Severity | Status | Reproduction | Expected | Actual | Root File | Fix Applied | Regression Tested |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | Critical/High/Medium/Low | Blocked/Fixed/Verified | Steps | Behavior | Behavior | Path:line | Commit | Pass/Fail |

---

## Deliverables Checklist

- [ ] This campaign plan posted to Paperclip with role assignments
- [ ] Role specialists assigned and runners verified
- [ ] 50-patient ledger (TEST-MGM-QA-001 to 050) populated as created
- [ ] Coverage matrix completed (all screens/controls tested or blocked)
- [ ] Bug register with all identified issues and fixes
- [ ] Financial/stock reconciliation report
- [ ] Consolidated board report (summary of findings)
- [ ] Go/No-Go recommendation
- [ ] Sanitized artifacts saved to E:/MGM HMS/qa-reports/2026-11-02/final-acceptance/

---

## Next Steps

1. **Post this plan** to Paperclip with human acknowledgment
2. **Verify role specialist runners** (server/browser/task API from each)
3. **Start Block 1** (UI Tester: Registration) with first 10 patients
4. **Coordinate mutations** via shared ledger and Paperclip comments
5. **Report blockers** immediately (missing accounts, workflow breaks, server issues)

