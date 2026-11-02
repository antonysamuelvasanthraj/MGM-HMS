# SUR-8: Downstream Workflow Quick Reference
**For CEO Rapid Validation After Blocks 3-5 Patient Creation**

---

## Pre-Validation Checklist (When Blocks 3-5 Report Completion)

**Prerequisite Data:**
- [ ] Block 1 patients (001-010): IDs 4,5,8-15 confirmed in database
- [ ] Block 2 patients (011-020): IDs 17-26 confirmed in database
- [ ] Block 3 patients (021-030): IDs and UHIDs captured by SUR-10
- [ ] Block 4 patients (031-040): IDs and UHIDs captured by SUR-11
- [ ] Block 5 patients (041-050): IDs and UHIDs captured by SUR-12

**Environment Verification:**
- [ ] Port 4300 accessible and responsive
- [ ] All specialist UI sessions confirmed working
- [ ] Rate limiter cleared (last login was >10 minutes ago)

---

## Block 3: Lab Workflow Validation (SUR-10)

### Quick Check: Lab Orders from Block 2 Flow Through
```
1. Login as lab role
2. Search for patient ID 4 (TEST-MGM-QA-001)
3. Verify lab orders appear in patient record
4. Verify sample collection workflow exists
5. Create sample collection entry
6. Navigate to result entry
7. Enter test result
8. Verify persistence after page reload
```

### Data Points to Verify:
- Lab orders from Block 2 are visible
- Sample collection workflow is accessible
- Result entry saves and persists
- New lab records for patients 021-030 exist

### Success Criteria:
- [ ] Lab orders from Block 2 patients visible
- [ ] Sample collection executed
- [ ] Results entered and persisted
- [ ] New patient records (021-030) verified

---

## Block 4: Pharmacy Workflow Validation (SUR-11)

### Quick Check: Stock and Prescription Flow
```
1. Login as pharmacist role
2. Verify GRN created and stock quantities updated
3. Check stock transfers from central store
4. Search for patient ID 4 (TEST-MGM-QA-001)
5. Verify prescription from Block 2 appears
6. Record prescription dispensing
7. Verify stock quantity reduced
8. Check inventory reconciliation report
```

### Data Points to Verify:
- GRN created with correct stock quantities
- Stock transfers executed
- Prescriptions from Block 2 visible
- Stock quantities reduced on dispensing
- New patient records (031-040) exist

### Success Criteria:
- [ ] GRN and stock transfers verified
- [ ] Prescriptions dispensed
- [ ] Stock balances correct
- [ ] New patient records (031-040) verified

---

## Block 5: Billing Workflow Validation (SUR-12)

### Quick Check: Bills and Payments Flow
```
1. Login as billing role
2. Search for patient ID 4 (TEST-MGM-QA-001)
3. Verify OP bill from Block 2 appears
4. Create IP admission for patient ID 4
5. Add bed allocation
6. Record running bill charges
7. Execute discharge
8. Finalize bill settlement
9. Collect payment (test each mode: cash, card, UPI, credit)
10. Generate and verify receipt
```

### Data Points to Verify:
- OP bills from Block 2 visible
- IP admission workflow accessible
- Running bills calculate correctly
- Discharge executes
- Payments recorded in multiple modes
- Receipts generated
- New patient records (041-050) exist

### Success Criteria:
- [ ] Bills and payments flow correctly
- [ ] Running bills calculate accurately
- [ ] Discharge workflow complete
- [ ] Multiple payment modes work
- [ ] New patient records (041-050) verified

---

## Financial Reconciliation Quick Check

### Ledger Integrity
```bash
# Run these after all workflows complete:
1. Count total bills created: SELECT COUNT(*) FROM bills WHERE (details->>'marker') LIKE 'TEST-MGM-QA-%'
2. Sum total bill amounts: SELECT SUM(amount) FROM bills WHERE ...
3. Count payments: SELECT COUNT(*) FROM payments WHERE ...
4. Verify receipts generated: SELECT COUNT(*) FROM receipt_headers WHERE ...
```

### Data Reconciliation
- [ ] Total bills match number of patients + workflows
- [ ] Bill amounts logical (OPD < IP)
- [ ] Payments total matches bill settlements
- [ ] Receipts generated for all payments
- [ ] No orphaned records
- [ ] Accounting entries match financial flows

---

## Stock Reconciliation Quick Check

### Inventory Verification
```
1. View central store inventory
2. Verify stock-in from GRN matches received quantities
3. Check pharmacy stock reflects transfers
4. Verify dispensing reduced quantities
5. Run inventory reconciliation report
6. Verify no negative balances
```

### Data Points
- [ ] GRN stock-in recorded
- [ ] Stock transfers to pharmacy executed
- [ ] Pharmacy stock balances correct
- [ ] Dispensing reduced stock
- [ ] Reconciliation report generated
- [ ] No negative balances or discrepancies

---

## Code Fix Validation During Workflows

### Scheme Payment Idempotency
**During Block 5 billing workflow:**
- Create scheme payment with specific parameters
- Note: item_id, user_id, amount, reason, authorization_ref
- Attempt same payment again → Should reject as duplicate
- **Result:** ✅ or ❌

### Numeric Field Validation
**During any amount entry:**
- Try to enter empty string → Should reject
- Try to enter non-numeric → Should reject
- Enter valid number → Should accept
- **Result:** ✅ or ❌

### Billing Permission Check
**During receipt access:**
- Access as billing role → Should work (200)
- Access as payment role → Should work (200)
- Access as unauthorized role → Should fail (403)
- **Result:** ✅ or ❌

---

## Admin Control Quick Check (Independent)

### Operating Mode Management
```
1. Login as admin
2. Navigate to /admin/operating-mode
3. View current mode (emergency/normal/etc)
4. Change mode (if permitted)
5. Verify mode-dependent workflows respond
```

### Role-Specific Controls
```
1. Test manager approval workflows
2. Test medical superintendent operations
3. Test HR staff operations
4. Verify permission denials for unauthorized roles
```

---

## Go/No-Go Indicators

### GREEN (Ready for Production)
- ✅ All 50 patients created and verified
- ✅ Downstream workflows complete end-to-end
- ✅ Financial reconciliation shows zero discrepancies
- ✅ Stock reconciliation shows zero discrepancies
- ✅ Code fixes validated through real usage
- ✅ Admin controls accessible and working
- ✅ No data corruption or loss

### RED (Blocker - Requires Fixes)
- ❌ Any patient missing or unverified
- ❌ Workflow step fails or blocks
- ❌ Financial/stock discrepancies found
- ❌ Code fixes fail in real usage
- ❌ Admin controls inaccessible
- ❌ Pre-existing data corrupted

---

## Rapid Execution Notes

**Time-Saving Tips:**
- Use patient IDs directly in search (faster than markers)
- Reuse one browser session across workflows
- Screenshot key success points for evidence
- Document metrics (count of records, amounts, times)
- Flag any anomalies immediately for investigation

**If Blocker Found:**
- Stop workflow at failure point
- Capture screenshot
- Note exact error message
- Post to Paperclip immediately
- Document what worked before failure

---

## Success Evidence to Collect

Minimum evidence per block:
- [ ] Patient list showing all assigned markers
- [ ] At least one complete workflow screenshot per major step
- [ ] Summary of counts (created, processed, validated)
- [ ] Any error messages or blockers
- [ ] Reconciliation report summary

---

**This guide enables rapid downstream validation once all 50 patients are created.**
**Time estimate: 30-45 minutes per major workflow phase**
