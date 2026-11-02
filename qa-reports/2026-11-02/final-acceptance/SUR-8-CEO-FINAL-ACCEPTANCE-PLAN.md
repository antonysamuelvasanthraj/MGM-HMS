# SUR-8: CEO Final Acceptance Plan
**Date:** 2026-11-02  
**Campaign Status:** 40% Complete (20/50 patients verified)  
**Target:** Full 50-patient UI-entered acceptance test with financial reconciliation and control coverage

---

## Phase 1: Patient Registration (In Progress)
**Status:** 🟡 Blocks 3-5 resuming

### Expected Completion (Blocks 3-5)
- **SUR-10 (Lab, 021-030):** 10 new patient records via UI registration
- **SUR-11 (Pharmacy, 031-040):** 10 new patient records via UI registration
- **SUR-12 (Billing, 041-050):** 10 new patient records via IP admission forms

**Verified Patient Base:** 001-010 (IDs: 4,5,8-15) reused across all downstream workflows

---

## Phase 2: Downstream Workflow Validation (After Blocks 1-2 Complete)
**Participants:** SUR-10, SUR-11, SUR-12  
**Dependencies:** All patient IDs from Blocks 1-2

### Block 3 (Lab & Imaging): TEST-MGM-QA-021 to 030
**Workflow:** Patient Registration → Lab Orders → Sample Collection → Result Entry → Verification → Report

**Expected Data Flow:**
- Lab orders placed on Block 1 patients (001-010, IDs 4,5,8-15) from SUR-9 clinical workflow
- New radiology imaging records for patients 021-030
- Sample collection tracking
- Result entry and sign-off
- Report generation and persistence

**Validation Checklist:**
- [ ] 10 new patients created with assigned markers
- [ ] Lab orders from Block 2 appear in patient records
- [ ] Sample collection workflow executes end-to-end
- [ ] Result entry saved and persisted
- [ ] Radiology reports generated
- [ ] Permissions verified (lab role, manager role)
- [ ] Reports printable/exportable

---

### Block 4 (Pharmacy & Stock): TEST-MGM-QA-031 to 040
**Workflow:** GRN → Stock Transfer → Prescription Dispensing → Reconciliation

**Expected Data Flow:**
- Stock movements via GRN (Goods Receipt Note)
- Stock transfers to pharmacy from central store
- Prescription dispensing for Block 1 patients (001-010)
- Stock quantity reconciliation
- Returns and adjustments

**Validation Checklist:**
- [ ] 10 new patients created with assigned markers
- [ ] GRN created and stock quantities updated
- [ ] Stock transfers executed to pharmacy
- [ ] Prescriptions from Block 2 dispensed
- [ ] Stock quantities reduced in dispensary
- [ ] Stock reconciliation report generated
- [ ] Return workflows tested
- [ ] Permissions verified (pharmacist, store, manager)

**Code Fix Validation:**
- Numeric field validation for quantity entry
- Stock balance calculations

---

### Block 5 (Billing & Accounts): TEST-MGM-QA-041 to 050
**Workflow:** IP Admission → Running Bills → Discharge → Settlement → Payment Collection

**Expected Data Flow:**
- IP (Inpatient) admission for subset of Block 1 patients (001-005)
- Bed allocation and nursing care documentation
- Running bill calculation with daily charges
- Discharge summary
- Final bill settlement
- Payment collection (multiple modes: cash, card, UPI, credit/advance)
- Receipt generation
- Accounting entries

**Validation Checklist:**
- [ ] 10 new patients created with assigned markers
- [ ] IP admission completed for 5 Block 1 patients
- [ ] Bed allocation and transfer workflows tested
- [ ] Running bills updated correctly
- [ ] Discharge procedures completed
- [ ] Final bill calculation correct
- [ ] Payment collection across multiple modes
- [ ] Receipts generated and retrievable
- [ ] Accounting entries recorded
- [ ] Permissions verified (billing, nursing, accounts, manager)

**Code Fix Validation:**
- Scheme payment idempotency (replay validation)
- Scheme collection reference validation
- Numeric amount validation
- Billing permission checks on receipt endpoint

---

## Phase 3: Cross-Workflow Reconciliation (After All Blocks Complete)
**CEO Responsibility:** Financial and stock reconciliation

### Financial Reconciliation
**Scope:** All payments, bills, settlements, and accounting entries for test patients

**Validation Tasks:**
- [ ] Count all test bills created (should correlate with patients and workflows)
- [ ] Verify bill amounts (OPD charges vs. IP running bills)
- [ ] Reconcile payment collections against billing
- [ ] Track refunds and adjustments
- [ ] Verify accounting journal entries match financial flows
- [ ] Check payer/free/due allocations are correct
- [ ] Validate settlement balances

**Expected Result:** Zero discrepancies between bill, payment, and accounting records

### Stock Reconciliation
**Scope:** GRN, stock transfers, dispensing, and inventory

**Validation Tasks:**
- [ ] Count GRNs created for test items
- [ ] Verify stock-in quantities
- [ ] Track stock transfers to pharmacy
- [ ] Count dispensing transactions
- [ ] Verify stock-out quantities
- [ ] Calculate final inventory balances
- [ ] Validate reconciliation reports

**Expected Result:** Stock balances match ledger; all movements accounted for

### Audit Trail Verification
**Scope:** All mutations logged with before/after values

**Validation Tasks:**
- [ ] Every test patient creation recorded
- [ ] Every bill created/modified logged
- [ ] Every payment recorded with payer/mode/amount
- [ ] Every stock movement logged
- [ ] All user actions (role, timestamp, change details) present
- [ ] No gaps or missing entries

**Expected Result:** Complete audit trail for full acceptance

---

## Phase 4: Admin & Control Coverage Testing (Independent)
**CEO Responsibility:** Administrative control verification

### Operating Mode Management
**Endpoint:** `/admin/operating-mode`  
**Tests:**
- [ ] View current operating mode
- [ ] Change operating mode (requires hospital_mode.manage permission)
- [ ] Verify mode history
- [ ] Check mode-dependent workflows (paper vs. digital)

### Staff & Role Operations
**Scope:** Admin, Manager, Medical Superintendent, HR controls

**Tests:**
- [ ] Staff operational records accessible per role
- [ ] Manager approval workflows for free visits
- [ ] Roster management
- [ ] Medical superintendent controls accessible
- [ ] HR operational data
- [ ] Permission matrix verified

### Accounting & Financial Reports
**Tests:**
- [ ] Accounting reports generated from test data
- [ ] Financial summaries accessible
- [ ] Scheme payment tracking
- [ ] Outstanding balances reporting

### System Settings & Maintenance
**Tests:**
- [ ] Configuration accessible per role
- [ ] Demo/test data functions working
- [ ] Maintenance operations available

---

## Phase 5: Code Fix Validation Through Workflows
**Status:** Ready for validation with real workflows

### Fix 1: Scheme Payment Idempotency
**Expected Behavior:** Replay of identical scheme payment validates exact match (item, user, amount, reason, ref)

**Validation Approach:**
- Create scheme payment in Block 5 workflow
- Attempt replay with same parameters
- Verify acceptance and idempotency
- Attempt replay with different amount → should fail
- Document result

### Fix 2: Scheme Collection Reference Validation
**Expected Behavior:** Non-cash payments require reference; validate mode and amount on replay

**Validation Approach:**
- Record scheme collection with reference (card/UPI payment)
- Verify reference captured
- Attempt replay → validate mode/amount match
- Test missing reference for non-cash payment → should fail
- Document result

### Fix 3: Numeric Field Validation
**Expected Behavior:** Strict finite-number guard rejects empty strings; only accepts valid numbers

**Validation Approach:**
- Attempt to enter empty string in amount field → should reject
- Enter valid number → should accept
- Test across all amount-entry fields
- Document acceptance criteria

### Fix 4: Billing Permission Check
**Expected Behavior:** Payment receipt endpoint requires billing/payment/finance view permissions

**Validation Approach:**
- Access receipt endpoint with billing role → should work
- Access with payment role → should work
- Access with finance role → should work
- Access with unauthorized role → should fail with 403
- Document permission matrix

---

## Phase 6: Final Assessment & Sign-Off
**Owner:** CEO (SUR-8)  
**Prerequisites:** All phases 1-5 complete with evidence

### Go/No-Go Criteria
**GO Conditions:**
- [ ] All 50 patients successfully created via UI
- [ ] Patient IDs and UHIDs persisted correctly
- [ ] Downstream workflows executed end-to-end
- [ ] Financial reconciliation complete with zero discrepancies
- [ ] Stock reconciliation complete with zero discrepancies
- [ ] Code fixes validated through real workflows
- [ ] Admin controls tested and accessible per role
- [ ] No pre-existing data corrupted or lost

**NO-GO Conditions (would block sign-off):**
- Duplicate patient registrations or missing records
- Financial/stock reconciliation discrepancies
- Code fixes failing in real workflows
- Admin controls inaccessible or broken
- Pre-existing data modified or lost
- Rate limiting or authentication persistent issues

### Deliverables
- [ ] Complete 50-patient ledger with all verified IDs
- [ ] Role/module/control coverage matrix (pass/fail/blocked/not-tested)
- [ ] End-to-end scenario results with evidence
- [ ] Financial reconciliation report
- [ ] Stock reconciliation report
- [ ] Confirmed bug register (if any)
- [ ] Code fix validation results
- [ ] Unfinished sections documented
- [ ] Build/regression test results
- [ ] Comprehensive acceptance report
- [ ] Honest go/no-go recommendation

---

## Timeline
- **Phase 1 (Registration):** In progress, blocks 3-5 resuming
- **Phase 2 (Workflows):** Dependent on block completion
- **Phase 3 (Reconciliation):** After blocks 3-5 complete
- **Phase 4 (Admin Controls):** Can start independently
- **Phase 5 (Code Fixes):** After block 5 (billing) completes
- **Phase 6 (Sign-Off):** After all phases complete

---

## Success Criteria
- 50 synthetic test patients created and UI-verified
- All patient records persist in actual database
- Downstream workflows complete end-to-end
- Financial and stock data reconcile with zero discrepancies
- Code fixes validated through real usage
- All roles tested with appropriate permissions
- Pre-existing data preserved and untouched
- Comprehensive evidence collected for audit

**This assessment is the foundation for production readiness decision.**

No production deployment authorized until this plan is complete and sign-off delivered.
