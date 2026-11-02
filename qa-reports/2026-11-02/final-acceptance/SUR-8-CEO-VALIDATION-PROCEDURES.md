# SUR-8 CEO Downstream Validation Procedures

**Campaign Status:** 20/50 patients verified, CEO ready for validation phases  
**Target Environment:** http://127.0.0.1:4300 (actual application)  
**Last Updated:** 2026-11-02T13:06:31Z

---

## Phase 1: Database Verification (Immediate)

**Before starting any workflow validation, verify all 50 patients are persisted.**

### Procedure
1. **Read-only database check** (no writes)
   ```
   - Query patients table for all TEST-MGM-QA-001 through 050 markers
   - Confirm patient IDs (expected: scattered set within ~1-50 range)
   - Confirm UHID values (expected: SHMS-2627-XXXX prefix)
   - Record actual IDs and UHIDs in verification ledger
   ```

2. **Expected Outcome**
   - 50 unique patient records with TEST-MGM-QA markers
   - All UHIDs following SHMS-2627- pattern
   - All records created within 2026-11-02 timeframe

3. **Blocker**
   - Fewer than 50 records → report which blocks incomplete
   - Missing or corrupted UHIDs → report specific records
   - Duplicate markers → stop and investigate

---

## Phase 2: Code Fix Validation (3 Hours)

**Validate SUR-7 fixes through real workflows on test records ONLY.**

### Fix 1: Scheme Payment Idempotency
**Fix:** Require exact match of item, user, amount, reason, authorization_ref on replay  
**Test Workflow:** Block 5 payment collection  
**Procedure:**
1. Login as accounts/billing role
2. Open bill from TEST-MGM-QA-001 patient (or any test patient with bill)
3. Create scheme payment allocation:
   - Item: Select a test drug/service
   - User: Select current user
   - Amount: Enter 500
   - Reason: "Test authorization"
   - Auth Ref: "TEST-AUTH-001"
   - **Submit**
4. **Retest Idempotency** (second request with exact same values)
   - Same item, same user, same amount, same reason, same ref
   - **Expected:** Accept (idempotent) or show "already allocated" error
5. **Test Change Detection** (second request with different amount)
   - Same item, same user, amount 600, same reason, same ref
   - **Expected:** Reject with error (non-matching amount)

**Regression Test:** 61 scheme-specific checks passed ✅

### Fix 2: Scheme Collection Reference Validation
**Fix:** Non-cash payments must have reference; validate mode and amount on replay  
**Test Workflow:** Block 5 payment collection  
**Procedure:**
1. Login as accounts/billing role
2. Open bill from test patient with unpaid balance
3. Test cash collection (should NOT require reference)
   - Mode: "Cash"
   - Amount: 100
   - Reference: [leave blank]
   - **Submit** → Should accept
4. Test non-cash collection (card/UPI/credit)
   - Mode: "Card" (or "UPI" or "Credit")
   - Amount: 100
   - Reference: [leave blank]
   - **Submit** → Should reject with error "Reference required"
5. Test non-cash with reference
   - Mode: "Card"
   - Amount: 100
   - Reference: "TEST-CARD-001"
   - **Submit** → Should accept

**Regression Test:** 61 checks passed ✅

### Fix 3: Numeric Validation (Reject Empty Strings)
**Fix:** Strict finite-number guard for amounts  
**Test Workflow:** Any amount entry field  
**Procedure:**
1. Open any bill or payment screen
2. Amount entry field: Enter empty string (don't type anything)
3. **Expected:** Reject with validation error, form does NOT submit
4. Amount entry field: Enter "abc" (non-numeric)
5. **Expected:** Reject with validation error
6. Amount entry field: Enter valid number (100)
7. **Expected:** Accept and allow submission

**Regression Test:** 279 checks passed ✅

### Fix 4: Billing Permission Check
**Fix:** Payment receipt endpoint requires billing/payment/finance view permissions  
**Test Workflow:** Block 5 receipt access  
**Procedure:**
1. **Test as accounts role** (should have permission)
   - Create payment on test patient
   - View receipt → Should display receipt
2. **Test as pharmacy role** (should NOT have permission)
   - Navigate to payment receipt for same test patient
   - **Expected:** Access denied or "insufficient permissions" error
3. **Test as lab role** (should NOT have permission)
   - Same as pharmacy test

**Regression Test:** 279 checks passed ✅

---

## Phase 3: End-to-End Workflow Validation (6+ Hours)

**Validate that data flows correctly through all workflow tiers using test patients.**

### 3A: Lab Order & Results (Block 3 Data)

**Setup:** Use patient TEST-MGM-QA-001 (ID 4) as base  
**Workflow:** Doctor consultation → Lab order → Sample collection → Result entry → Report

**Procedure:**
1. **Create lab order** (as doctor/clinical)
   - Patient: TEST-MGM-QA-001
   - Test type: "Complete Blood Count" (or similar)
   - Status: Should show "ordered"
2. **Sample collection** (as lab role)
   - Open patient TEST-MGM-QA-001
   - Find the lab order
   - Collect sample, record collection timestamp
   - Status: Should update to "sample_collected"
3. **Result entry** (as lab role)
   - Enter test results (values)
   - Add lab technician name
   - Status: Should update to "results_entered"
4. **Verification & Signing** (as pathologist/lab manager)
   - Review results
   - Sign off on results
   - Status: Should update to "verified" or "signed"
5. **Verify persistence**
   - Reload patient page
   - Lab result should still be visible
   - Timeline should show complete lab order flow

**Evidence to Capture:**
- Screenshots of each state transition
- Order IDs and result IDs
- Timestamps of each step

---

### 3B: Pharmacy Workflow (Block 4 Data)

**Setup:** Use patient TEST-MGM-QA-001 with prescription  
**Workflow:** Prescription → Dispensing → Stock movement → Inventory reconciliation

**Procedure:**
1. **Create prescription** (if not already done in clinical workflow)
   - Patient: TEST-MGM-QA-001
   - Drug: Select test drug from pharmacy
   - Quantity: 10 tablets
   - Instructions: Standard dosing
2. **Dispense medication** (as pharmacist)
   - Open patient TEST-MGM-QA-001
   - Find prescription
   - Dispense: reduce qty by 10
   - Record dispensing timestamp
   - Update status to "dispensed"
3. **Verify stock movement**
   - Stock for test drug should decrease by 10
   - Check stock ledger/inventory
   - Quantity available should reduce
4. **Return workflow** (optional, if patient returns medication)
   - Record return qty
   - Stock should increase
   - Status should update to "returned"
5. **Inventory reconciliation**
   - Run stock reconciliation report
   - All test drugs should balance to actual dispensed qty
   - No stock variance should exist for test items

**Evidence to Capture:**
- Prescription ID and dispensing records
- Stock ledger entries before/after
- Reconciliation report showing balance

---

### 3C: Billing & Payments (Block 5 Data)

**Setup:** Use test patient with completed clinical/lab/pharmacy workflows  
**Workflow:** Bill creation → Payment collection → Settlement → Accounting reconciliation

**Procedure:**
1. **Verify bill was created** (should auto-generate from workflows)
   - Patient: TEST-MGM-QA-001
   - Bill should include:
     - Registration/OP fee
     - Lab test charges
     - Pharmacy drug charges
     - Any other services
2. **Collect payment - Cash**
   - Amount: 100 (partial)
   - Mode: Cash
   - Reference: [optional for cash]
   - **Submit**
   - Status: "Partial paid"
   - Outstanding balance should update
3. **Collect payment - Card**
   - Amount: 200 (remaining, example)
   - Mode: Card
   - Reference: "TEST-CARD-001" (required for non-cash)
   - **Submit**
   - Status: Should update to "Paid in full"
4. **Issue receipt**
   - Open receipt
   - Verify payment details are shown
   - Print/export receipt
5. **Verify settlement**
   - Bill status: Settled
   - Payment records persisted
   - No outstanding balance

**Evidence to Capture:**
- Bill ID and payment details
- Receipt screenshots
- Settlement confirmation

---

## Phase 4: Financial Reconciliation (2 Hours)

**Validate that accounting entries match business transactions.**

### Procedure
1. **Generate accounting report** for date 2026-11-02
   - Filter for TEST-MGM-QA-* transactions only
   - Report should show all debits and credits

2. **Verify double-entry principle**
   - Revenue: Sum of all bills created
   - Payments received: Sum of all cash + card collections
   - Outstanding: Sum of unpaid bills
   - Verify: Revenue = Payments + Outstanding

3. **Verify journal entries**
   - For each payment collected:
     - Debit: Cash/Card account
     - Credit: Bill/Revenue account
   - Entries should balance

4. **Sample Reconciliation**
   - Bill 001 for 500 rupees
   - Payment 1: Cash 100 → Journal entry OK?
   - Payment 2: Card 400 → Journal entry OK?
   - Total: 500 (matches bill)

**Blocker:** If any transaction lacks corresponding journal entry, report specific bill/payment ID

---

## Phase 5: Stock Reconciliation (1.5 Hours)

**Validate that inventory movements match actual stock changes.**

### Procedure
1. **Generate stock reconciliation** for test items only
2. **Verify movements match:**
   - GRN entries → Stock increase
   - Transfers → Source decrease, destination increase
   - Dispensing → Stock decrease
   - Returns → Stock increase
3. **Physical count check** (if applicable)
   - Expected qty = Opening + GRN - Dispensing + Returns
4. **Report any variance** with specific item and amount

---

## Phase 6: Admin Control Testing (3 Hours)

**Independent testing of admin/management/HR controls (can start while specialists work).**

### Controls to Test

**Admin Dashboard**
- [ ] View all users
- [ ] View system health/logs
- [ ] Access rate limiter status
- [ ] View database backups/exports

**Operating Mode**
- [ ] Current mode visible
- [ ] Mode can be changed (by authorized admin only)
- [ ] Workflow flags update based on mode

**User Management**
- [ ] View all accounts
- [ ] Disable user (if allowed)
- [ ] Verify permissions display
- [ ] Audit trail shows changes

**Settings**
- [ ] View app settings
- [ ] Cannot modify without permission
- [ ] Changes logged in audit trail

**Reports**
- [ ] Financial report accessible to accounts role
- [ ] Lab reports accessible to lab role
- [ ] Stock report accessible to pharmacy
- [ ] Audit report accessible to admin

### Evidence
- Screenshots of each control accessed
- Permission verification (show what role can/cannot access)
- Report samples

---

## Phase 7: Final Go/No-Go Assessment

**Compile results and deliver recommendation.**

### Checklist
- [ ] All 50 patients verified in database
- [ ] Code fixes validated through real workflows
- [ ] End-to-end workflows (lab → pharmacy → billing) complete
- [ ] Financial reconciliation balanced
- [ ] Stock reconciliation balanced
- [ ] Admin controls tested
- [ ] No critical defects blocking production
- [ ] All blockers documented

### Deliverable
**Final Report:** SUR-8-FINAL-ACCEPTANCE-REPORT.md
- Executive summary (pass/fail/conditional)
- Detailed findings by workflow
- Known issues and severity
- Recommendations
- Sign-off date

---

## Notes for CEO

1. **Test Data Only:** All 50 TEST-MGM-QA-* records are synthetic and clearly marked
2. **No Real Impact:** No real payments, emails, SMS, or external submissions occur
3. **Simulated Environment:** All transactions use local simulation
4. **Evidence Trail:** Capture screenshots and IDs for audit
5. **Retest Fixes:** Each SUR-7 fix must be validated through actual UI workflows
6. **Concurrent Work:** Specialists may still be working on blocks 3-5; coordinate via Paperclip

---

**Ready to execute once blocks 3-5 patient creation completes.**
