# USG Sign-Off Defect — Developer Fix and Retest Checklist

**Related finding:** QA-01, High  
**Date:** 30 October 2026  
**Purpose:** Implementation guidance only; no application code has been changed by this document.

## 1. Defect to correct

`POST /api/imaging/orders/:id/report` currently allows a user with `imaging.report` permission to:

- sign a final report;
- overwrite an already signed report without a reason;
- replace the previous signer and clinical content;
- reuse the same report row without retaining a signed version;
- produce audit rows with `before:null`, `after:null`, and `reason:null`.

A radiology technician reproduced all of these behaviors against a radiologist-signed report with HTTP 200.

**Primary location:** `server/routes/diagnostics.js:312-343`  
**UI entry points:** `client/src/views/usg-reporting.js`, `client/src/views/imaging.js`  
**Reproduction evidence:** `acceptance-evidence/usg-signoff-defect-kimi-20261030.json`

## 2. Required behavior

### Permission and role rules

- Separate **draft/report entry** permission from **final sign/amend** permission.
- A technician may enter or update a draft only if hospital policy permits it.
- Only an authorized reporting clinician, such as a radiologist, may sign a final report.
- Server-side authorization must enforce this rule. Hiding a button is not sufficient.
- A technician submitting `status:"final"` must receive HTTP 403 and no data must change.

### Draft and final states

- Before first sign-off, an authorized user may revise the draft.
- Signing must store the signer, signed timestamp and complete signed content.
- Once signed, the report must be immutable.
- A signed report must never be overwritten by an ordinary save or final-sign request.

### Amendments

- Amending a final or amended report requires a non-empty reason.
- Missing or whitespace-only reasons must return HTTP 400 or 409 with a stable error such as `amendment_reason_required`.
- An amendment must create a new report version linked to the prior version.
- Preserve the previous report content, signer, signed timestamp and superseded timestamp.
- The new version must identify the amending clinician and amendment reason.
- Only the newest authorized version is current; earlier versions remain readable to authorized clinical/audit users.
- Printing and API responses must clearly identify an amended report and retain access to prior versions.

### Audit and transaction safety

Perform the version creation, supersession, order update, notification and audit in one transaction.

The amendment audit row must include:

- report ID and new version ID;
- order ID and order number;
- previous and new clinical content;
- previous and new signer;
- amendment reason;
- acting user and timestamp;
- previous and new report/order status.

A failed authorization, validation or audit write must roll back the entire operation.

## 3. Suggested implementation shape

### Data model

Prefer immutable signed versions. For example, add a report-version table or retain every signed report as a separate row with:

- `report_id` / version-group identifier;
- `order_id`;
- `version_no`;
- `supersedes_id`;
- `technique`, `findings`, `impression`, `advice`;
- `status` (`draft`, `final`, `amended`, `superseded`);
- `author_id`, `signed_by`, `signed_at`;
- `amendment_reason`;
- `created_at`, `updated_at`.

Add a uniqueness rule that prevents more than one current version per order/report group. Migrate existing reports without discarding their current signer or content.

### Endpoint flow

1. Load the order and current report inside the transaction.
2. Validate order type and clearance.
3. If no signed report exists:
   - draft saves use draft permission;
   - final saves require sign permission.
4. If a signed report exists:
   - reject ordinary overwrite attempts;
   - require sign/amend permission;
   - require an amendment reason;
   - insert a new version and supersede the old one.
5. Write before/after/reason audit data.
6. Update the order and publish notifications only after successful commit.

Avoid inferring amendment solely from whether the incoming status is `final`. Make the intended operation explicit and validate it against the current state.

### UI behavior

- Hide or disable **Final sign** and **Amend** for unauthorized roles, while retaining server checks.
- Opening a signed report should be read-only by default.
- **Amend report** should open a dialog requiring the reason before editing is allowed.
- Display signer, signed time, version number and amendment reason.
- Provide an authorized **Version history** view.
- Ensure print output shows the current version and amendment details.

## 4. Developer regression tests

Add automated tests for the following cases:

| # | Test | Expected result |
|---|---|---|
| 1 | Technician saves a permitted draft | 200; draft saved; no signer/final status |
| 2 | Technician submits final report | 403; report and order unchanged |
| 3 | Unrelated role submits report | 403; no data or audit change |
| 4 | Radiologist signs initial final report | 200; signer/time/content stored |
| 5 | Final report is requested again without reason | 400/409; no content change |
| 6 | Technician attempts amendment with reason | 403; original remains current |
| 7 | Radiologist amends with blank reason | 400/409; original remains current |
| 8 | Radiologist amends with valid reason | 200; new version created |
| 9 | Read previous version after amendment | Original content/signer intact |
| 10 | Audit amendment | Full before/after/reason present |
| 11 | Print current amended report | Current content plus version/reason shown |
| 12 | Print/view historical version | Clearly marked superseded; content intact |
| 13 | Concurrent amendments using same base version | One succeeds; the other receives conflict |
| 14 | Notification failure or database rollback | No partial report/order state |
| 15 | Ordinary draft save after final sign | Rejected; signed version unchanged |
| 16 | Existing pre-migration report | Migrated content and signer retained |
| 17 | Patient/portal report view | Only authorized published current version shown |
| 18 | Emergency/IP imaging report | Same sign/amend protections apply |
| 19 | Outsourced imaging report | Outside signatory/version rules remain intact |
| 20 | Accounts and bill linkage | Amendment does not change bill, payment or payer state |

## 5. Manual retest script

1. Create a throwaway patient and USG order on a disposable database.
2. As `radiology.tech`, attempt to sign a final report. Confirm HTTP 403 and no visible report change.
3. As `radiologist`, save a draft and then sign it.
4. Record the report content, signer, timestamp and version.
5. Attempt another final submission without a reason. Confirm rejection and unchanged content.
6. As the technician, attempt to alter findings and impression. Confirm rejection in both UI and direct API call.
7. As the radiologist, amend with a documented reason.
8. Confirm that:
   - the current report shows the amended content;
   - the original version remains unchanged;
   - the new signer and reason are visible;
   - order status is correct;
   - no bill or payment status changed.
9. Open Audit Trail and verify complete before/after clinical content and reason.
10. Print the current report and a superseded version; verify clear version labeling.
11. Repeat the direct API reproduction from QA-01 and confirm that the technician now receives HTTP 403.

## 6. Acceptance gate

QA-01 can be closed only when all of these are true:

- technician final-sign and amendment attempts are refused server-side;
- no-reason amendments are refused;
- signed content is immutable;
- every amendment retains prior content and signer;
- audit contains before/after/reason;
- current and historical print/API views are correct;
- the existing imaging, outsourcing, smoke and integration-regression suites still pass;
- financial and order-state integrity checks remain clean.
