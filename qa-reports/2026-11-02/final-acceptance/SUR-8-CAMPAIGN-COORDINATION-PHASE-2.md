# SUR-8 Campaign: Phase 2 Coordination (Blocks 2–5)

**Campaign Status:** In Progress  
**Last Updated:** 2026-11-02 12:57 UTC  
**Campaign Lead:** CEO (Claude Haiku 4.5)

---

## ✅ Phase 1: COMPLETE & VERIFIED

### Block 1 (001–010) Registration
- **Status:** ✅ Complete and independently verified
- **Verification Method:** Operator read-only database check on port 4300
- **Verified Count:** 10/10 patients
- **Verification Timestamp:** 2026-11-02 12:50:46 UTC

### Verified Patient IDs

| Marker | Patient ID | UHID |
|--------|-----------|------|
| TEST-MGM-QA-001 | 4 | SHMS-2627-0004 |
| TEST-MGM-QA-002 | 5 | SHMS-2627-0005 |
| TEST-MGM-QA-003 | 8 | SHMS-2627-0008 |
| TEST-MGM-QA-004 | 9 | SHMS-2627-0009 |
| TEST-MGM-QA-005 | 10 | SHMS-2627-0010 |
| TEST-MGM-QA-006 | 11 | SHMS-2627-0011 |
| TEST-MGM-QA-007 | 12 | SHMS-2627-0012 |
| TEST-MGM-QA-008 | 13 | SHMS-2627-0013 |
| TEST-MGM-QA-009 | 14 | SHMS-2627-0014 |
| TEST-MGM-QA-010 | 15 | SHMS-2627-0015 |

**File Reference:** `SUR-8-verified-patients-001-010.json`

---

## 🟡 Phase 2: BLOCKS 2–5 Ready for Launch

### Block 2: Clinical Workflows (SUR-9)
**Owner:** Clinical QA Specialist (SUR-9)  
**Patient Range:** TEST-MGM-QA-011 through TEST-MGM-QA-020  
**Reuse Base Patients:** 001–010 (use IDs 4–15 from Block 1)  
**Workflow:** Consultation → Vitals → Lab/Imaging Orders → Doctor Notes

**Acceptance Criteria:**
- [ ] 10 new patient records created (011–020) via UI registration
- [ ] OPD consultation created for each Block 1 patient (001–010)
- [ ] Vitals entry (temperature, BP, pulse, respiration) recorded
- [ ] At least 2 lab orders placed per patient (Block 1)
- [ ] At least 1 imaging order placed per patient (Block 1)
- [ ] Doctor notes/clinical findings documented
- [ ] Patient list visibility confirmed for all 20 markers
- [ ] Persistence verified after page reload

**Target Environment:** http://127.0.0.1:4300  
**Role:** Clinical/Doctor/Nurse  
**Status:** ⏳ Ready to begin

---

### Block 3: Lab & Imaging (SUR-10)
**Owner:** Lab & Imaging QA Specialist (SUR-10)  
**Patient Range:** TEST-MGM-QA-021 through TEST-MGM-QA-030  
**Reuse Base Patients:** 001–010 (use IDs 4–15 from Block 1)  
**Workflow:** Lab Sample Collection → Result Entry → Verification → Report Generation

**Acceptance Criteria:**
- [ ] 10 new patient records created (021–030) via UI registration
- [ ] Lab sample collection recorded for each Block 1 patient (001–010)
- [ ] Result entry completed for lab orders from Block 2
- [ ] Radiology report generated for imaging orders from Block 2
- [ ] Verification/sign-off completed by lab manager
- [ ] Patient list visibility confirmed for all 20 markers
- [ ] Report printable or exportable
- [ ] Persistence verified after page reload

**Target Environment:** http://127.0.0.1:4300  
**Role:** Lab/Radiology/Manager  
**Status:** ⏳ Ready to begin

---

### Block 4: Pharmacy & Stock (SUR-11)
**Owner:** Pharmacy & Stock QA Specialist (SUR-11)  
**Patient Range:** TEST-MGM-QA-031 through TEST-MGM-QA-040  
**Reuse Base Patients:** 001–010 (use IDs 4–15 from Block 1)  
**Workflow:** GRN → Stock In → Prescription Dispensing → Stock Reconciliation

**Acceptance Criteria:**
- [ ] 10 new patient records created (031–040) via UI registration
- [ ] GRN (Goods Receipt Note) created for test medicines
- [ ] Stock quantities updated for Central store
- [ ] Stock transfers to pharmacy completed for test items
- [ ] Prescription dispensing recorded for Block 1 patients (001–010)
- [ ] Dispensed quantity deducted from stock
- [ ] Return of unused medicines recorded
- [ ] Stock reconciliation report generated
- [ ] Patient list visibility confirmed for all 20 markers
- [ ] Persistence verified after page reload

**Target Environment:** http://127.0.0.1:4300  
**Role:** Pharmacist/Store/Manager  
**Status:** ⏳ Ready to begin

---

### Block 5: Billing & IP Admission (SUR-12)
**Owner:** Billing & Accounts QA Specialist (SUR-12)  
**Patient Range:** TEST-MGM-QA-041 through TEST-MGM-QA-050  
**Reuse Base Patients:** 001–010 (use IDs 4–15 from Block 1)  
**Workflow:** IP Admission → Running Bill → Discharge → Final Settlement

**Acceptance Criteria:**
- [ ] 10 new patient records created (041–050) via IP admission forms
- [ ] IP admission completed for 5 Block 1 patients (e.g., 001–005)
- [ ] Bed allocation recorded
- [ ] Running bill updated with daily charges
- [ ] Nursing care documented
- [ ] Discharge summary created
- [ ] Final bill reconciliation completed
- [ ] Payment collected via multiple modes (cash, card, UPI, credit)
- [ ] Receipt generated and verifiable
- [ ] Accounting entries recorded correctly
- [ ] Patient list visibility confirmed for all 50 markers
- [ ] Persistence verified after page reload

**Target Environment:** http://127.0.0.1:4300  
**Role:** Billing/Accounts/Nursing/Manager  
**Status:** ⏳ Ready to begin

---

## 📋 Campaign Coordination Rules

### For All Specialists

1. **Use Verified Patient IDs Only**
   - Reference `SUR-8-verified-patients-001-010.json` for Block 1 patient mapping
   - Use saved patient IDs (4–15) for all workflows
   - Do NOT attempt to recreate 001–010

2. **Target Environment**
   - Use actual application: http://127.0.0.1:4300
   - Not the isolated instance at 127.0.0.1:4388
   - All business records must persist in the live database

3. **Patient Tracking**
   - Maintain a ledger for your new patient ranges (011–020, 021–030, etc.)
   - Record application-generated patient IDs for all new registrations
   - Cross-reference with Block 1 patients for workflow continuity

4. **UI-Only Data Entry**
   - All business records via forms and buttons only
   - No direct SQL, API insertion, imports, or seeding
   - Browser automation (Playwright) is allowed for UI interaction
   - Read-only verification (screenshots, database queries) is allowed

5. **No Credential Changes**
   - Use existing private credentials from DEMO-LOGINS.local.md
   - Do not create, delete, or reset accounts
   - Report authentication blockers with evidence

6. **Rate Limiter Awareness**
   - Login rate limiter: 8 failures per 10-minute window per IP/username
   - HTTP 429 response with Retry-After header
   - Stagger login attempts across specialists (2+ minutes apart)
   - Do NOT retry failed logins; wait for natural cooldown

### For CEO Coordination

- [ ] Monitor all specialist progress through Paperclip comments
- [ ] Track patient ID handoffs between blocks
- [ ] Identify blockers and escalate immediately
- [ ] Reconcile bills, payments, stock, and accounting entries
- [ ] Validate code fixes through real workflows
- [ ] Prepare final go/no-go assessment

---

## 📊 Campaign Metrics

| Phase | Patients | Status | Owner | ETA |
|-------|----------|--------|-------|-----|
| Block 1 (001–010) | 10 | ✅ Complete | UI Tester (SUR-3) | 2026-11-02 |
| Block 2 (011–020) | 10 | ⏳ Ready | Clinical (SUR-9) | 2026-11-02 |
| Block 3 (021–030) | 10 | ⏳ Ready | Lab (SUR-10) | 2026-11-02 |
| Block 4 (031–040) | 10 | ⏳ Ready | Pharmacy (SUR-11) | 2026-11-02 |
| Block 5 (041–050) | 10 | ⏳ Ready | Billing (SUR-12) | 2026-11-02 |
| **TOTAL** | **50** | **Partial** | Multiple | Depends |

---

## 🚀 Next Steps

1. **Notify all specialists** of verified Block 1 completion
2. **Share verified patient IDs** (SUR-8-verified-patients-001-010.json)
3. **Coordinate staggered login attempts** to avoid rate limiter
4. **Track progress** through Paperclip comments
5. **Report blockers immediately** with evidence
6. **Reconcile data** across all workflows
7. **Prepare final assessment** once all 50 patients completed

---

## 📝 Evidence & Artifacts

- `SUR-8-verified-patients-001-010.json` — Verified patient ledger (Block 1)
- Screenshots and UI evidence for all claimed records
- Ledgers for Blocks 2–5 (to be created by specialists)
- Final reconciliation report (due after all blocks complete)

---

**Campaign Status: PROCEEDING → Phase 2 Launch Ready**

All specialists are cleared to begin their blocks using the verified patient IDs. 
CEO standing by for coordination and issue escalation.
