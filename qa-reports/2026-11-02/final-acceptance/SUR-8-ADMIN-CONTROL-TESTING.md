# SUR-8 Admin Control Testing Guide

**Phase 6 (Independent):** Admin/Manager/HR controls that can be tested while specialists work on blocks 3-5  
**Target Environment:** http://127.0.0.1:4300  
**Role:** Admin/Manager  
**Last Updated:** 2026-11-02T13:08Z

---

## Test Scenario Setup

These tests can run independently using the verified Block 1 patients (TEST-MGM-QA-001 through 010) as test subjects.

---

## Control 1: Admin Dashboard Access & Visibility

**Objective:** Verify admin can access dashboard and see expected controls

**Procedure:**
1. Login as `admin` role
2. Navigate to admin dashboard (URL: typically `/admin` or `/dashboard`)
3. Verify visible controls:
   - [ ] User management section
   - [ ] System settings
   - [ ] Reports/analytics
   - [ ] Audit logs (if available)
   - [ ] Database status (if available)

**Evidence:**
- Screenshot of admin dashboard
- List of visible sections
- Any "Access Denied" errors

**Pass Criteria:**
- Admin dashboard loads without JS errors
- All expected sections visible
- No "permission denied" messages

---

## Control 2: Operating Mode Management

**Objective:** Verify admin can view and change hospital operating mode

**Procedure:**
1. Login as `admin` role
2. Navigate to operating mode settings (URL: typically `/admin/operating-mode`)
3. Verify current mode is visible (e.g., "normal", "emergency", "maintenance")
4. Try to change mode:
   - Click "Change Mode" (or similar button)
   - Select different mode from dropdown
   - Click "Save"
5. Verify mode changed:
   - Mode indicator should update
   - Workflow flags should reflect new mode (e.g., if "emergency" mode, emergency workflows active)
6. Revert to original mode

**Evidence:**
- Screenshot of operating mode selector
- Before/after mode values
- Confirmation message when mode changed

**Pass Criteria:**
- Mode can be viewed
- Mode can be changed
- Change persists on reload
- Only admin role can change (verify by trying as another role)

---

## Control 3: User Management

**Objective:** Verify admin can view and manage user accounts

**Procedure:**
1. Login as `admin` role
2. Navigate to user management section (URL: typically `/admin/users` or `/settings/users`)
3. Verify user list loads:
   - [ ] All existing users visible (admin, reception, pharmacy, lab, accounts, hr, manager, msupdt, doctor)
   - [ ] User names, roles, status visible
   - [ ] Search/filter functionality works
4. Select one test user (e.g., `reception`)
5. View user details:
   - [ ] Role visible
   - [ ] Status (active/inactive)
   - [ ] Permissions listed
   - [ ] Last login timestamp
6. Test edit capability (if available):
   - [ ] Try to disable user (if allowed)
   - [ ] **Do NOT actually disable** — revert immediately
   - [ ] Verify audit log shows the attempt

**Evidence:**
- Screenshot of user list
- User detail view for one user
- Permissions displayed
- Audit trail showing admin actions

**Pass Criteria:**
- User list displays correctly
- User details accessible
- Permissions are shown
- Edit actions logged in audit
- Only admin can modify users

---

## Control 4: Role-Based Access Control (RBAC)

**Objective:** Verify different roles have appropriate access levels

**Procedure:**

### Test 4A: Accounts Role Permissions
1. Login as `accounts` role
2. Try to access:
   - [ ] Bills (should have access)
   - [ ] Payments (should have access)
   - [ ] Reports (should have access)
   - [ ] Lab module (should NOT have access)
   - [ ] Pharmacy module (should NOT have access)
3. For each:
   - Record: Accessible / Restricted / Error
   - Take screenshot if restricted

### Test 4B: Pharmacy Role Permissions
1. Login as `pharmacy` role
2. Try to access:
   - [ ] Pharmacy module (should have access)
   - [ ] Stock management (should have access)
   - [ ] Prescriptions (should have access)
   - [ ] Billing (should NOT have access)
   - [ ] Lab module (should NOT have access)

### Test 4C: Lab Role Permissions
1. Login as `lab` role
2. Try to access:
   - [ ] Lab module (should have access)
   - [ ] Order list (should have access)
   - [ ] Results entry (should have access)
   - [ ] Pharmacy (should NOT have access)
   - [ ] Billing (should NOT have access)

**Evidence:**
- Matrix showing role vs. module access
- Screenshots of "Access Denied" pages (if applicable)

**Pass Criteria:**
- Each role can only access assigned modules
- Unauthorized access is blocked
- Clear error messages for restricted areas

---

## Control 5: Permission Verification on Key Endpoints

**Objective:** Verify permission checks work on critical endpoints

**Procedure:**

### Test 5A: Payment Receipt Access
1. Create test scenario:
   - Login as `accounts` role
   - Navigate to a bill payment
   - View/print receipt
   - **Should succeed**
2. Try as different role:
   - Login as `pharmacy` role
   - Try to view same receipt via direct URL or navigation
   - **Should fail with "Access Denied"**
3. Try as different role:
   - Login as `lab` role
   - Try to view same receipt
   - **Should fail with "Access Denied"**

### Test 5B: Stock Management Access
1. Login as `pharmacy` role
2. Navigate to stock module
3. Try to:
   - [ ] View stock levels (should succeed)
   - [ ] Create GRN (should succeed)
   - [ ] Modify stock directly (may be restricted)
4. Login as `reception` role
5. Try to access stock module
6. **Should fail or show read-only view**

### Test 5C: Billing Module Access
1. Login as `accounts` role
2. Access billing (should succeed)
3. Login as `reception` role
4. Try to access billing module
5. **Should fail or show restricted view**

**Evidence:**
- Screenshots of permission checks
- Success messages for authorized roles
- "Access Denied" messages for unauthorized roles

**Pass Criteria:**
- Permissions enforced correctly
- No data leakage to unauthorized roles
- Clear error messages

---

## Control 6: Audit Trail / Activity Logging

**Objective:** Verify admin actions are logged

**Procedure:**
1. Login as `admin` role
2. Navigate to audit log section (URL: typically `/admin/audit` or `/admin/logs`)
3. Verify audit log displays:
   - [ ] Timestamp of each action
   - [ ] User who performed action
   - [ ] Action type (create, update, delete, view)
   - [ ] Record affected (patient, bill, payment, etc.)
   - [ ] Old value / new value (for modifications)
4. Take action:
   - Modify a test patient name (use TEST-MGM-QA-001)
   - Save change
5. Check audit log:
   - [ ] New entry should appear
   - [ ] Should show: admin user, "update patient", patient ID, before/after values
6. Verify only privileged users can access audit:
   - Login as `reception` role
   - Try to access audit log
   - **Should fail**

**Evidence:**
- Screenshot of audit log section
- Log entry for test modification
- Before/after values shown

**Pass Criteria:**
- Audit log displays all admin actions
- Timestamps are accurate
- Only admin/authorized roles can view audit
- Log entries include context (who, what, when, before/after)

---

## Control 7: System Health / Database Status

**Objective:** Verify admin can view system health indicators

**Procedure:**
1. Login as `admin` role
2. Look for system health dashboard or status section
3. Verify visible indicators:
   - [ ] Database connection status (online/offline)
   - [ ] API response times (if available)
   - [ ] Error rate (if available)
   - [ ] Last backup status (if available)
   - [ ] Disk space / storage (if available)
4. Trigger a test error:
   - Try to create an invalid record (e.g., patient with missing required field)
   - Should show error in application
5. Check if error logged:
   - Navigate to system logs
   - **Should show the error attempt**

**Evidence:**
- Screenshot of system health dashboard
- List of visible health indicators
- Error log entry from test

**Pass Criteria:**
- System health indicators visible
- Status shows actual system state
- Errors are logged

---

## Control 8: Settings / Configuration

**Objective:** Verify admin can manage application settings

**Procedure:**
1. Login as `admin` role
2. Navigate to settings section (URL: typically `/admin/settings`)
3. Verify settings categories visible:
   - [ ] Hospital information (name, address, license number)
   - [ ] Payment gateway settings (if applicable)
   - [ ] Email/SMS settings (if applicable)
   - [ ] Rate limiter settings
   - [ ] Time zone / locale
4. Try to view a setting:
   - Click on "Hospital Settings" or similar
   - Should show current values
5. Try to modify a non-critical setting:
   - Change a text field (e.g., description)
   - Click "Save"
   - **Should update without breaking the system**
   - Revert the change
6. Try to modify as non-admin:
   - Login as `reception` role
   - Try to access settings
   - **Should show "Access Denied"**

**Evidence:**
- Screenshot of settings page
- List of available settings categories
- Successful save confirmation

**Pass Criteria:**
- Settings page accessible to admin
- Settings can be viewed
- Settings can be modified (for permitted fields)
- Changes persist
- Only admin can access settings

---

## Control 9: Reports / Data Export

**Objective:** Verify admin can generate and export reports

**Procedure:**
1. Login as `admin` role
2. Navigate to reports section (URL: typically `/admin/reports` or `/reports`)
3. Verify available reports:
   - [ ] Patient report
   - [ ] Financial report
   - [ ] Lab report
   - [ ] Pharmacy inventory report
   - [ ] Staff attendance (if applicable)
4. Select one report:
   - Choose date range
   - Select filters (if available)
   - Click "Generate"
5. Verify report displays:
   - [ ] Correct data
   - [ ] Date range matches filter
   - [ ] Formatting is readable
6. Try export:
   - Click "Export" or "Download"
   - Format options: PDF, Excel, CSV (if available)
   - Verify file downloads

**Evidence:**
- Screenshot of reports list
- Generated report sample
- Downloaded file (filename and size)

**Pass Criteria:**
- Reports can be generated
- Data is accurate
- Export formats work
- Only authorized roles can generate reports

---

## Control 10: Rate Limiter Status (Admin View)

**Objective:** Verify admin can see rate limiter status

**Procedure:**
1. Login as `admin` role
2. Try to find rate limiter status in:
   - Admin dashboard
   - System health section
   - Settings / Configuration
   - Logs / Monitoring
3. Verify visible information:
   - [ ] Current rate limiter status (active/cleared)
   - [ ] Failed login attempts (current count)
   - [ ] Lockout window (if active)
   - [ ] Reset time (when lockout clears)
4. Try to clear rate limiter:
   - If a "Reset" or "Clear" button exists, click it
   - Verify lockout is cleared
   - **Do NOT clear if a production test user is locked out**

**Evidence:**
- Screenshot of rate limiter status
- Current counts shown
- Any reset confirmations

**Pass Criteria:**
- Rate limiter status visible
- Admin can view lockout details
- Admin can reset if needed (without compromising security)

---

## Summary Checklist

- [ ] Admin dashboard accessible
- [ ] Operating mode can be changed (admin only)
- [ ] User management accessible
- [ ] All users visible with roles/status
- [ ] RBAC enforced (each role restricted to modules)
- [ ] Permission checks work (accounts can't access pharmacy, etc.)
- [ ] Audit log captures all admin actions
- [ ] Audit log shows before/after values
- [ ] System health indicators visible
- [ ] Settings accessible to admin only
- [ ] Reports can be generated
- [ ] Reports can be exported (multiple formats)
- [ ] Rate limiter status visible
- [ ] No permission bypass found
- [ ] No data leakage between roles

---

## Known Limitations / Blockers

- **Doctor role:** Unverified — credential not yet tested
- **Email/SMS settings:** Cannot be fully tested without external services
- **Payment gateway:** Using local simulation only
- **Backup/restore:** May not be available in this environment

---

## Next Steps

1. Execute all 10 control tests
2. Record pass/fail for each
3. Capture evidence screenshots
4. Document any permission bypasses or missing controls
5. Include summary in final CEO acceptance report

**Estimated Time:** 2-3 hours  
**Can run independently:** Yes (does not require blocks 3-5 to complete)
