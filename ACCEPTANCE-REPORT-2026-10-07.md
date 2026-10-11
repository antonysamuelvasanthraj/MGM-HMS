# MGM HMS acceptance report — 7 October 2026

Status: IN PROGRESS. This is a running evidence record, not a sign-off.

Latest status: ten source bugs fixed with required suites and manual retests. Core clinical/pharmacy flows for all15OP scenarios and all15visit closures completed; fourOPpayercases settled. ER/ICU/ward testing is partial. See ACCEPTANCE-BUG-LIST-2026-10-07.md for the consolidated fixed/open/setup/pending list and continuation prompt. Earlier entries below are chronological and can describe states superseded by later evidence.

## Authority and scope
The owner explicitly authorized AI-FULL-MANUAL-TEST-PROMPT.md, live cleanup and testing on port 4300, preservation of all logins/passwords and masters, and edits confined to E:\MGM HMS. This overrides the older protocol's copy-only rule. Cleanup backup destination was changed to E:\MGM HMS\acceptance-backups to respect the workspace boundary.

## 0. Preparation
- Read CLAUDE.md, README.md, HANDS-ON-TEST-PROTOCOL.md and AI-FULL-MANUAL-TEST-PROMPT.md.
- Initial SQLite snapshot: data/backups/before-acceptance-2026-10-07-1791317775286.db. Integrity OK; zero foreign-key errors; 24 users including 22 demo users.
- Browser: visible Codex in-app browser, localhost:4300. Phone viewport: 390 × 844.
- Two source fixes and their required suites are recorded below. Previous reports' passes are not counted as this run's evidence.

## 1. Clean baseline
- Stopped live process 27332 (4300) and test process 25172 (4388); checked no listeners remained on 4300, 4388, 4397 before applying cleanup.
- Ran the supplied cleanup tool with --apply-confirmed-test-data --server-stopped --preserve-logins --preserve-masters.
- Full cleanup backup: acceptance-backups/hms-2026-10-06T20-17-35-381Z-258f9b. Backup directory name is tool-generated UTC; this report uses local date.
- Preserved: accounts, beds, counters, departments, doctor_schedules, lab_params, package_items, packages, payers, role_permissions, sequences, service_rates, services, settings, templates, users, wards.
- Cleared 92 other tables. Patients, encounters, admissions, bills, payments, stock batches and transactions are zero; one maintenance audit entry created. Bed statuses reset to vacant and document sequences reset by the tool.
- Exact before counts and table lists: acceptance-evidence/2026-10-07/cleanup-preserve-masters-plan.json. Result: cleanup-result.json in the same directory.
- All 24 complete user records compared equal to the initial snapshot after cleanup. No login/password changed.
- Restarted through start-live.cmd. Health returned status=ok. Demo-account endpoint returned 22 accounts across six groups (4+4+3+4+3+4).
- Owner login: clicked Owner demo.owner, then Sign in. Dashboard showed zero revenue, collections, expenses, OP visits, admissions, outstanding, payer balances and stock-related transaction activity. Phone top-of-page screenshot inspected; remaining dashboard tabs/actions not yet tested.
- Patients, Bills and Stock UI empty-state checks passed at the clean baseline; subsequent synthetic test data is present.

## 2–9. Coverage tracker
| Section | Status |
|---|---|
| 2. Setup / masters / roles / print identity | Partial; settings, supplier, medicines, print identity checked; remainder pending |
| 3. GRN / transfers / returns / non-medical stores | GRN and five transfers checked; returns/stores and competing FEFO pending |
| 4. Full OP flows for all 15 payment/category scenarios | All15core clinical/pharmacy flows and closures checked; record/queue/dayreport/exports/otherOP coverage still partial |
| 5. ER / ICU / ward / discharge / payer stays | ER→ICU→General→Private→Special→ICU partly tested; discharge/remaining workflows pending |
| 6. OT / maternity / counselling | Not yet tested |
| 7. Money controls / accounts / insurance | OPpayments/refund/freeapproval/fourpayer settlements checked; remainder pending |
| 8. All 22 logins × dashboards × menus × allowed actions | Several staff roles used for workflows; full22login/menu/action sweep pending |
| 9. Two-screen realtime checks | Not yet tested |

## Findings and limitations
- Cleanup dry-run ignores --preserve-masters and prints only its default preservation list. A separate read-only inspection using the tool's exported inspect() and actual preservation set was saved before applying. No code fix made yet.
- Before cleanup, existing admin dashboard showed Received (all modes) ₹56,400, payer receipts ₹56,160 and Net collection ₹112,560. This may be misleading labeling; requires reproduction with controlled receipts before classifying as a confirmed defect.

## 10. Final status
Pending completion. No acceptance sign-off. Synthetic OPpatients, one activeIP/ERpatient and test transactions remain for continued testing. Latest restart healthy with22demoaccounts; required suites passed after ten fixes. Finalcleanup/fullscope remains pending. User interrupted testing for a bug status/list; no further UI mutations performed for that request.

## Running manual evidence — stock setup
- Owner: Patients, Bills and Stock opened using their menu links after cleanup. Each showed zero records/amounts. Phone screenshots inspected at 390 px (top viewport only, not full action coverage).
- Owner: Hospital Settings opened at desktop and phone widths. Name/address/telephone present; GSTIN, NABH number, LAN address and gateway blank. Existing capacity says 100 while 14 beds are configured: hospital must reconcile operational bed setup. All four OP switches enabled; corporate/trust auto-approval configured. No settings changed.
- Pharmacy Admin: signed in via demo tile; dashboard showed zero stock, sales, dues, GRNs and supplier outstanding. Full menu recorded in browser observations; this is not a completed menu sweep.
- Suppliers: Add supplier → TEST Acceptance Pharma / TEST-ACC-01 / 30 credit days → Save. Directory showed one active supplier, zero payable before GRN. Phone form inspected and saved.
- Medicine Master: created TEST-PARA-A and TEST-PARA-B, both Paracetamol 500 mg, tablet, HSN 3004, GST 12%, reorder 50, OTC. A deliberately remains without stock to test same-generic substitution later. Both appeared in the catalogue. Phone form inspected.
- GRN-2627-0001: TEST-INV-001, TEST Acceptance Pharma, received and invoice date 7 Oct 2026. TEST Paracetamol B, paid packs 10, free packs 2, pack quantity 10, DP 10, MRP 20, discount 10%, GST 12%, expiry 10/2027, batch TEST-B-001, delivery 5, credit note 5.80. Invoice amount 100. UI tallied: taxable 90; CGST 5.40 + SGST 5.40; line total 100.80; payable 100. Created on phone viewport. Saved view matched all entries, payable and tally.
- Stock: Central batch 120 tablets; expiry 31 Oct 2027; unit cost displayed 0.74, unit MRP 2.00, stock cost 89.20; purchase movement +120 by Demo Pharmacy In-charge. This matches net inventory cost 90+5-5.80 = 89.20, divided across 120 units. Supplier payable and GRN register both showed 100. Accounts voucher verification pending.
- Transfers: TRF-2627-00001 Central → OP 40, TRF-2627-00002 Central → IP 20 requested as Pharmacy Admin. Requester drawer explicitly states another approver is required and has no Approve button. Emergency issue is a separate exposed action, not exercised. Phone request form inspected. ER request submitted; subsequent status, approvals/issues/receipts, ICU and OT still pending.

## Running manual evidence — transfers and cash registration
- All five transfer requests completed: OP 40, IP 20, ER 20, ICU 20, OT 20. Pharmacy Admin requested, Owner independently approved, Pharmacy Staff issued and received. All rows showed Received and requested=issued=received. Central 0, OP 40, other four stores 20 each; Ward 0. One eligible batch only, so competing-batch earliest-expiry selection remains untested.
- Reception Counter login: New patient TEST Acceptance Cash (male, 42), UHID SHMS-2627-0001 → Dr. Demo Physician (fee 500) → register token 1 → cash collection preset to 500 → Save payment. UI showed Bill cleared and paid token slip; receipt RC-261007-00001 showed Cash 500, Reception Counter, Demo Receptionist. Reception receipt row offered print only, no cancel/refund actions.
- Cash patient is still in the live test workflow, awaiting vitals/consultation. Final cleanup pending.

## Bug 1 — OP Registration counter label missing immediately after login
- Role: Reception, selected Reception Counter on sign-in.
- Steps: sign in → OP Registration. Actual: Counter —. Expected: Counter Reception Counter. Receipt correctly recorded Reception Counter. Reopening the app restored the correct label, confirming response-shape mismatch.
- Fix: server/routes/core.js login response now includes selected counter details, matching /auth/me. Source modification time checked and original saved as acceptance-evidence/2026-10-07/core-before-counter-fix.js.
- Verification: build CSS passed; npm test passed (1264 API checks plus 144 integration checks); wiring check had no dead controls/listeners/unaudited mutations; standalone integration regression passed 144; admin-only passed 575; realtime permissions PASS; integration profile audit passed 1842 checks, 24 roles, no failures.
- Restart: stopped actual 4300 listener and launched start-live.cmd; health OK and demo endpoint 22. Re-test: sign out → Reception tile → select Reception Counter → sign in → OP Registration WITHOUT reload. Counter Reception Counter appeared immediately at desktop and 390px phone width.
- Result: FIXED and manually retested.
- Test-run containment note: the first npm test invocation used the scripts' default OS temporary location before this was noticed. It was interrupted; subsequent complete suites set TEMP/TMP and npm cache under acceptance-evidence/2026-10-07. No hospital login changes were made by these isolated test suites.

## Running manual evidence — cash patient's clinical workflow
- Nurse: dashboard 0/14 admitted beds; one OP patient in Vitals Queue. Recorded BP 170/100, pulse 105, temperature 99 F, SpO2 93%, RR 22, weight 70 kg, height 170 cm, GRBS 132, pain 2. Phone form displayed Out of range in words. Save moved patient to Ready for doctor. Recent row displayed BP warning symbol, pulse 105 and SpO2 93 without visible HIGH/LOW words: clarity issue recorded below.
- Doctor: dashboard Ready to see 1; Doctor Queue showed Callable and Call in. Call in opened actual consultation. Fever assessment template correctly populated chief complaint, examination, diagnosis, plan and advice; placeholder content replaced with synthetic test text.
- Prescription: TEST Paracetamol A (out of stock), Oral 1-0-1 for 5 days, quantity automatically 10, After food. Placing CBC + X-Ray Chest PA orders preserved the drug and quantity. Sign & complete saved one prescription and moved to Services pending, independently of paid consultation state.
- Prescription print preview showed hospital logo/name/address/phone, doctor name and registration DEMO-REG-001, medicine x10 with frequency/days/instructions, investigations advised, and review 14 Oct 2026. Phone preview inspected. Physical print/PDF export not yet tested.
- Reception: Service Payments showed one bill 750 for CBC 350 + X-Ray 400. Collected UPI 750 with TEST-UPI-750-001 reference. Waiting queue cleared. UPI reference is labelled optional in current UI; missing-reference validation not tested.
- Lab: paid order visible; Collect → Start → Enter results. Hb 11.2, WBC 8000, platelets 250000, neutrophils 60, lymphocytes 30 → Save & verify. Worklist Verified, 1 abnormal, open workload zero. Published report shows 11.2 with downward arrow and reference 13–17. Doctor result dialog explicitly showed LOW and verifier/time.
- Imaging: paid X-ray order → Scan room → Report. Entered synthetic technique/findings/impression/advice → Sign & release. Signed today 1; open studies zero. Doctor result dialog reproduced entered content and signer/time.
- Doctor: dashboard Reports ready 2. Both report dialogs opened from reopened consultation. Updated plan after results → Save amendment → reason TEST post-results review → Record amendment. Status AMENDED; follow-up remained 14 Oct 2026.
- Certificate: Issue certificate from consultation preselected patient. Sickness/rest To changed to 9 Oct and automatic text updated. Replaced body with explicitly synthetic text → Sign & issue. CERT-2627-0001 showed Issued, 7–9 Oct, Dr. Demo Physician.
- Follow-up list: patient shown 14 Oct 2026, in 7 days, Scheduled. Phone layout inspected.

## Open findings requiring follow-up
- Recent-vitals table does not show HIGH/LOW words for pulse 105 or SpO2 93; BP shows a warning symbol. Doctor Queue exposes Out of range as a tooltip; consultation vitals show values without abnormal word flags. Form has written warning. Reproduce and align presentation across screens.
- CBC print report has a downward arrow for low Hb but no LOW text, while doctor result dialog does show LOW. Written abnormal indication should be consistent in printed output.
- Doctor order catalogue includes zero-price Bandage/dressing, POP cast application, Suture removal and Wound suturing. Hospital must supply tariffs; no invented prices applied.
- Nurse dashboard says No wards set up in the occupancy chart despite 14 beds and 5 preserved wards. Check whether empty occupancy chart incorrectly conflates zero occupancy and missing setup.
- Imaging dashboard tab labelled Laboratory and cards use Samples pending / Collected terminology for imaging studies. Worklist itself uses imaging-specific labels; clarity issue.


## Bug 2 — zero-stock prescription cannot offer alternatives
- Role: Pharmacy Staff, Pharmacy Counter. Steps: Sales & Dispensing → Load prescription for TEST Acceptance Cash with TEST Paracetamol A (zero OP stock), same-generic Brand B available.
- Actual: Action could not be completed / offerSubstitutes is not defined; cart remains empty. Expected: same-generic choices and pending option.
- Cause/fix: helper was nested inside wireCounter but called from mount. wireCounter now returns that closure and mount binds it. Original saved as pharmacy-before-substitution-fix.js; modification time checked before editing.
- Manual retest before restart: Load → Prescribed brand out of stock → Brand B (40 in stock, 2.00) → Add substitutes. Cart showed Brand B for Brand A, 10 tablets, batch TEST-B-001, expiry 31 Oct 2027, total20.
- Card chosen → Dispense & bill → collection dialog selected Debit card (DOM selected option verified), 20 → Save payment → Bill cleared. Phone collection layout inspected. Prescription queue became zero; sales1/revenue20.
- Bills drawer: BL-261007-00003-SELF, substitution explicitly recorded, quantity10/rate2/amount20, ex-tax17.86/tax2.14, received20/balance0; receipt RC-261007-00003 Debit card by Demo Pharmacist. Pharmacy role sees only pharmacy bills. Print receipt click did not expose a preview in this browser; investigate.
- Required build, npm test, wiring, standalone integration, admin-only, realtime-permissions and profile audit all passed; logs named *-substitution-fix.log. Restarted start-live.cmd; healthOK and demo count22. Post-restart reproduction with a new pending prescription remains to be done.
- Result: code fixed; manual substitution/collection passed before restart; post-restart retest pending.
- New clarity finding: after dispensing clears patient selection, the old billing-context status remains on screen. Do not confuse its stale received1250 with the new total1270. Needs cleanup when patient clears.

## Bugs 3–5 — return mode, receipt preview and stale pharmacy context
- Return mode: Patient return on a debit-card bill defaulted Cash and omitted card modes. Changed returns.js to use shared money-mode labels/options and default to first uncancelled original money receipt; split receipts explicitly require mode review. Backup returns-before-refund-mode-fix.js. Post-restart phone retest selected Debit card automatically; returned2 tablets/reason TEST unopened synthetic return. SRN-2627-00001 credited4, refund4 Debit card. Bill total16/netreceived16/balance0, originalreceipt20 and refundreceipt-4. FIXED.
- Receipt preview: clicking Print from Bills produced no visible preview/tab in the in-app browser. printReceipt used window.open and native print; changed to shared printDocument preview, with modeLabel. Backup op-registration-before-receipt-preview-fix.js. After restart Print opened RC-261007-00003 iframe preview with logo/address/phone/counter/substitution and Received (Debit card). Desktop and phone screenshots inspected. Physical Print / Save PDF not exercised. FIXED visible-preview issue.
- Stale pharmacy billing summary: showPatient cleared package summary but returned before removing old billing context when patient=null. Removal now runs before that early return. Regression suites pass; new-sale manual retest pending.
- Required suites passed separately for refund-mode-fix and receipt-context-fix (build CSS, npm test, wiring,144integration,575admin, realtime permissions,1842profile audit). Both sets of logs under evidence. Restart after final set: healthOK/demo22.
- Before return, Stock showed OP30 and Sale-10; Daily Collection & Handover Pharmacy showed Card20, Cash0, Received20 and receipt mode Debit card. Post-return stock/day-report recheck pending.
- Phone patient-return form makes the item description very narrow and Return qty extends off the visible table. Quantity was reachable using its field locator; human usability needs follow-up.

## Running evidence — all OP categories registered, clinical completion pending
Reception Counter, Dr. Demo Physician, consultation500 each. New synthetic patients (UHID suffix/token equal number below):
|Number|Patient suffix|Registration / collection checked|
|---|---|---|
|1|Cash|Clinical cash flow described earlier|
|2|UPI|BL-00004-SELF paid500 UPI, reference TEST-UPI-OP-002|
|3|Debit|BL-00005-SELF paid500 Debit card, TEST-DEBIT-003|
|4|CreditCard|BL-00006-SELF paid500 Credit card, TEST-CREDITCARD-004; initial quick save left form unchanged, second click succeeded; no duplicate receipt observed yet|
|5|Cheque|BL-00007-SELF paid500 Cheque, TEST-CHQ-005 TESTBANK|
|6|Bank|BL-00008-SELF paid500 Bank transfer, TEST-UTR-006|
|7|Split|BL-00009-SELF paid500 with Cash200+UPI300 TEST-SPLIT-007|
|8|Later|BL-00010-SELF500; collection cancelled; Registered/Payment pending500|
|9|Free|BL-00011-SELF500; Reception Free+reason submitted approval request, zero money. Owner Approvals showed1; Approve free→Approve cleared queue. Downstream bill/queue recheck pending|
|10|Credit|BL-00001-CREDIT500; credit category, no collection dialog; token says Payment pending. Verify clinical gate correctly understands approved due|
|11|TPA|BL-00001-TPA500; Star Health TEST-TPA-011, pending with no money. Insurance login CLM-2627-0001 entered Approved400/Co-pay100, kept stage initially pending; Save automatically moved Preauth approved, patient100/payer400|
|12|Aarogyasri|BL-00001-AAR500; Health Care Trust TEST-AARO-012, pending no money. Insurance CLM-2627-0002 Approved500 entered, Save automatically moved approved, patient0/payer500; phone drawer inspected|
|13|Corporate|BL-00001-COR500; TCS TEST-CORP-013; existing settings auto-approved; token says PAID although payer500 remains owed and cash0|
|14|Trust|BL-00001-TRUST500; MGM Lions TEST-TRUST-014; existing settings auto-approved; token says PAID although payer500 remains owed and cash0|
|15|Package|BL-00012-SELF consult500 pending; Reception Packages sold Fever Diagnostic1200 without collecting, BL-00013-SELF standalone. Packages in use price1200/covered0/extras0/owes1200|
- All new UHIDs use SHMS-2627-xxxx, encounters ENC-261007-xxxxx. These15 are registered; only cash1 has completed consultation/results/certificate/pharmacy. Do not count registration as completed acceptance.
- Insurance dashboard independently showed4cases,2pending+2approved, payer receivable1000 before new approvals, receivedtoday0. Insurance menu includes Payer Receivables and case controls.
- Setup gap: Packages has26hospital/97payer packages, only2activehospital, total bundledservices0. Fever Diagnostic description says CBC/RBS/Urine/Consultation but no configured service lines; all97payer agreements mostly draft0. Existing visit was not offered in sell dialog (only Standalone package bill). Hospital must configure actual coverage; advertised inclusions are not verified.
- Clarity: corporate/trust token labels PAID conflate approved payer coverage with money; verify independent status on visit/queue/bill screens.

## Running evidence — co-pay collection, all vitals and more consultations
- Reception OP Fee Collection: TPA100 patient share was the only collectible TPA amount; mode list included money/free/due but no payer billing modes. Collected Cash100. Aarogyasri had no pending collection row. Modal top said Payer pending0 while shared context correctly said Payer due400: inconsistent summary wording; follow up.
- Package patient consult500 collected Cash; standalone package1200 collected UPI TEST-PKG-015. Package inclusions remain unconfigured, so total1700 collected; not a verified package-covered consultation.
- Nurse manually recorded abnormal observations for each remaining14patients (BP170/100,pulse105,temp99,SpO293,RR22,weight70,height170,GRBS132,pain2). Each form showed written Out of range. Phone Trust form inspected. Final queue Awaiting0/Vitalsrecorded15; recent rows showed all15. Quick sequential actions sometimes left form unsaved and required a second inspected Save; do not assume a click saved data.
- Nurse stage Later8 and Credit10 Vitals done; all cleared others Ready for doctor. Doctor Queue showed13callable/1held; Credit10 correctly Callable, Later8 Fee pending/noCallin. Nurse-stage label inconsistency only, not credit-care blockage. Waiting card subtitle says14ready although one is held, while KPI says13ready.
- Doctor called UPI2, Debit3, CreditCard4 and Cheque5 individually. For each: Fever assessment template; synthetic fields; review14Oct; linked zero-stock TEST Paracetamol A,1-0-1x1day,qty2,Afterfood; CBC350+Xray400; after placing orders drug and qty2 visibly retained; Sign & complete -> Signed,Servicespending,consultPaid. Each has2neworders/servicebill750. Clinical result completion still pending for these four.
- Bank6 called and documented/template inserted but unsaved blank drug row disappeared during refresh. Consultation remains in progress; no orders/sign yet.

## Bug 6 — blank prescription draft row disappears during refresh
- Role Doctor. Steps: call Bank patient → insert Fever template → fill note fields → Add drug. Actual blank drug editor removed before drug entry. Expected editor remains while doctor types.
- keepTyping used readRx(), which filters empty drug rows and also misaligns form metadata if an earlier blank row exists. Added preserveBlank option used only by keepTyping; default saves/prints continue to filter empty drug rows. Backups rx-editor-before-blank-draft-fix.js and consultation-before-blank-draft-fix.js, mtimes checked. Suites/restart/manual retest pending.

## Running evidence — continued OP clinical and financial checks
- Bug 6 required suites all passed (CSS build, npm test, wiring, integration regression, admin-only, realtime permissions, plus profile audit). Logs use blank-draft-fix suffix. Live restart and health/demo22 passed. Manual Bank retest: an empty drug row remained after placing CBC/X-ray orders; completed drug entry and signed. Some rapid subsequent clicks still left screens unchanged; this fix does not claim to resolve all refresh/click races.
- All 15 patients now have signed consultations. Each remaining patient has synthetic documentation, review14Oct, TEST Paracetamol A 1-0-1 for1day/qty2/Afterfood and CBC350+X-ray400. Cash retains its earlier qty10 prescription and completed reports.
- Later consultation fee500 collected Cash; Doctor Queue showed1callable/0held, token8 callable. Called and signed, service bill BL-261007-00022-SELF750 collected Cash. Final Service Payments Waiting0.
- Services750 collected individually: UPI TEST-UPI-SVC-002; Debit card TEST-DEBIT-SVC-003; Credit card TEST-CREDIT-SVC-004; Cheque TEST-CHQ-SVC-005 / TEST BANK; Bank transfer TEST-UTR-SVC-006; Split Cash250+UPI500 TEST-SPLIT-SVC-007; Package Cash750. Rows visibly removed from waiting after save.
- Free services request750 required a reason; Save disabled without reason. Reception submitted TEST synthetic service free approval. Owner saw1pending, approved through confirmation; pending0 and no money collected.
- Insurance login extended TPA estimate1250/approved1150/co-pay100, already paid; Aarogyasri estimate/approved1250/co-pay0. Both rows showed Patient balance0 and payer outstanding1150/1250 respectively. Corporate/Trust each payer1250, no receipts from payers.
- Laboratory initially showed14ordered/0awaitingpayment. Credit correctly Due approved; free and four payer categories Payer/free; other categories Paid. Each is clinically visible and collectible.
- Additional CBC workflows completed and verified: UPI2, Debit3, CreditCard4, Cheque5, Bank6, Split7 and Free9, each Collect → Start/In progress → Enter results → Save & verify. Values Hb11.2 (LOW), WBC8000, platelets250000, neutrophils60, lymphocytes30. Verified total8 including Cash1; remaining7 CBC orders still pending. Quick actions occasionally left rows unchanged; every completed step was separately confirmed and retries inspected.
- Phone390px laboratory KPI/workflow view inspected; stacked cards and stages fit. Worklist/result phone details remain to inspect for this run. No new source edits in this continuation.

## Laboratory completion and Bug 7 — report labels/contact
- Remaining Credit10, TPA11, Aarogyasri12, Corporate13, Trust14, Package15 and Later8 each completed Collect → Start (confirmed In progress) → Enter results → Save & verify. Same synthetic values as above. Final All open worklist0, Ordered0, Collected0, Processing0, Reported0, Verified15. No category was sampled instead of tested.
- Bug7: printed CBC preview showed Hb11.2 only with a down arrow and omitted configured hospital phone; blank NABH printed as a dangling label. laboratory.js now prints HIGH/LOW/CRITICAL words beside symbols, configured phone, and NABH only when configured. Source backup laboratory-before-report-label-fix.js.
- Required CSS build, npm test (1264API checks plus integration), wiring,144integration,575admin, realtime permissions passed; additional1842profile checks passed. Logs have lab-report-fix suffix. Restarted verified live PID25796 using start-live.cmd; healthOK and22demoaccounts.
- Manually opened all15report previews after restart: correct patient, Hb11.2 LOW and hospital phone verified individually. UPI desktop and Later phone390px screenshots visually inspected. Phone preview stays in its scrollable document frame; actions visible. Physical print/SavePDF still untested.
- Report remains IN PROGRESS: imaging14, full doctor result review/prints/certificates/follow-up for remaining14, pharmacy completion, IP/ER/OT and remaining role/menu coverage plus final cleanup still outstanding. All22login records/passwords remain unchanged by this work.

## Imaging completion and Bugs 8–9
- Imaging Staff worklist14pending/0paymentholds; each remaining14study scheduled in XR-1/XR-2, acquired (confirmed In progress), synthetic technique/findings/impression/advice entered and Sign & release. Final All open0, Awaiting report0, Draft0, Signed today15 including original Cash.
- UPI/Debit/CreditCard/Cheque booked03:00; Bank/Split03:05; Free/Credit03:10; TPA/Aarogyasri03:15; Corporate/Trust03:20; Package/Later03:25 on07Oct2026. Cheque additionally Save draft → Reported/unverified draft → Edit/sign; all four fields retained → Sign/release.
- Later populated reporting form at390px: all fields fit, footer Close/Save draft/Sign release visible. Signed on phone and confirmed15signed. Images/PDF upload remains untested.
- Bug8: UPI imaging print preview omitted configured hospital address and phone. Added both to printImagingReport; existing logo/name/report/patient/UHID/signer retained. Backup imaging-before-report-contact-fix.js. Required suites and additional profile audit passed (logs imaging-contact-fix); restart/manual updated-preview checks pending.
- Imaging Staff USG Reporting empty view inspected desktop/phone: noUSGorders/noUSGtemplates; empty view is not a workflow pass. Manage templates linked to /templates but returned Access restricted under this role.
- Bug9: USG template link now requires existing template.write permission, matching sidebar/route access. Unauthorized role's empty-state text asks staff with template access instead of directing them to inaccessible My Templates. No permissions/login changed. Backup usg-before-template-access-fix.js; required suites running (usg-access-fix suffix).
- Bug9 required suites and profile audit passed (usg-access-fix logs). Live restart: healthOK/demo22. Imaging Staff USG page manually rechecked: Manage templates link count0, appropriate staff-access instruction displayed. Authorized role link retest pending.
- Bug8 manual recheck after final restart: opened all15imaging previews individually; correct patient, address, phone and Demo Radiographer signer present. Later corrected report phone390px screenshot inspected. Physical print/PDF not tested.
- Read-only live database verification: all24userrecords byte-for-byte JSON identical to initial snapshot,22demo; integrityOK/FKerrors0. Evidence login-preservation-after-diagnostics.json. This check does not substitute for manual login/menu coverage.

## Doctor result review, certificates and follow-up
- Reopened each of the remaining14consultations using patient picker. Individually viewed CBC (Hb11.2 LOW, all five values, Demo Lab Technician verification/time) and imaging (all four saved fields, Demo Radiographer sign/time). Cash already reviewed earlier. The helper's printed low:false was a case-sensitive text comparison against Low; actual visible output was uppercase LOW for every row, not a missing clinical flag.
- Individually opened all14new prescription previews: correct patient, TEST Paracetamol A qty2, Oral1-0-1x1day/Afterfood, investigations, review14Oct, doctor registration DEMO-REG-001 and hospital header. Physical prints remain untested.
- Issued synthetic Sickness/rest certificates7–9Oct for each remaining14patient, explicitly marked acceptance-only/not clinical or employment use. Register total15issued, with sequentialCERT0001Cash,0002UPI,0003Debit,0004CreditCard,0005Cheque,0006Bank,0007Split,0008Free,0009Credit,0010TPA,0011Aarogyasri,0012Corporate,0013Trust,0014Package,0015Later. All14new certificate previews inspected for correct body/patient/period/doctor; Cash previously issued.
- Follow-up page showed15scheduled reviews, each patient's row individually checked:14Oct2026, matchingUHID/mobile/diagnosis, Scheduled. Phone KPI view inspected. Registering return visit/teleconsult remains untested; these are scheduled reviews, not completed follow-up visits.
- Doctor Queue showed15consulted, all serviceordersdone, no waiting/held; Credit patient1250approveddue remains visible. Pharmacy14prescriptions and visit closure are still outstanding.

## Pharmacy continuation — individual payment outcomes
- UPI, Debit, CreditCard, Cheque, Bank, Split and Later prescriptions individually substituted zero-stock TEST Paracetamol A with same-generic B, qty2 at2/unit, batch TEST-B-001 expiry31Oct2027. Bill notes retained the replaced brand. Stock available before successive additions32,30,28,26,24,22,20; each dispense consumed2.
- Bills SELF00023UPI (TEST-UPI-RX002),00024Debit(TEST-DEBIT-RX003),00025CreditCard(TEST-CREDIT-RX004),00026Cheque(TEST-CHQ-RX005/TEST BANK),00027Bank(TEST-UTR-RX006),00028Split(Cash2+UPI2 TEST-SPLIT-RX007),00029Later(Cash4) each cleared4 and patient removed from pharmacy waiting. Some immediate Save attempts left the dialog unchanged; fresh inspection then separate Save succeeded, without dispensing twice.
- Credit patient dispensed qty2 on bill BL-261007-00003-CREDIT. No collection modal; Bills register independently showed CREDIT/PAY LATER, total4, paid0, patient balance4. Pharmacy9sales billed48; Bills correctly separated collected44/outstanding4. Pharmacy KPI Revenue today48 includes the credit charge, so that label needs review against collected-income expectations.
- Bug2 manual substitute retest succeeded (UPI). Bug5 cleared cart now showed No patient selected and no stale billing status after collection. Six prescriptions remain (Free, TPA, Aarogyasri, Corporate, Trust, Package); visit closure and other acceptance scope remain incomplete.
- Viewport qualification: earlier phone390/desktop1440 descriptions were requested viewport dimensions, not independently verified CSS dimensions. Display scaling can yield smaller CSS widths (about273/1007). Current viewport was adjusted and DOM-verified at actual1440CSS width. Exact390CSS rechecks remain required; earlier constrained-phone observations are not claimed as exact390px acceptance.

## Pharmacy completion and Bug 10 — free request access
- Remaining Corporate, Trust, TPA and Aarogyasri each independently loaded A→B substitute qty2 at4total. Available OP B before additions16/14/12/10; each dispensed and waiting row removed without a patient receipt. Register bills COR00003/TRUST00003 total4 paid0 with patient dues cleared/payer settlement pending; TPA00003/AAR00003 total4 paid0 balance4 Payer pending (approval extension remains required).
- Package loaded B available8, bill SELF00030 separate4Cash collected; visit context still Package None, consistent with earlier package setup/association gap. Free loaded B available6, dispensed SELF00031total4 but Pharmacy Staff had no free request option. Final15sales/0prescriptions waiting; remaining OP B expected4 (stock screen verification pending).
- Owner/Cashier/Reception role scope checked for this specific bill: Owner sees all bills but cannot collect; Reception/Cashier registers exclude PHARM. Pharmacy Staff can collect own PHARM but lacked payment.authorize, so shared modeOptions hid Free although server allows a payment.collect user to submit an approval request.
- Bug10 collect.js now offers Request free approval for payment.collect staff. Due authorization/payer allocation remain restricted; no permission, role or user changed. Without payment.approve_free existing save logic only submits /approvals/request. Backup collect-before-free-request-fix.js.
- All required suites passed: CSSbuild, npmtest1265API plus144integration, wiring(no dead buttons/listeners/unaudited mutations),144integration regression,575admin, realtime permissions. Additional1842profile audit passed. Logs free-request-fix suffix. Restart start-live.cmd, healthstatusOK/demo22.
- Manual retest: Pharmacy Staff dashboard Collect patient share → Request free approval now visible; Due/payer modes absent. Save disabled with blank reason, enabled with synthetic reason. Submitted4request, no receipt and bill still due. Owner Approvals showed requested-by Demo Pharmacist, exact reason/bill/medicine/amount. Owner Approve free→confirmation→Approve cleared pending1to0.
- Actual CSS sizes verified via DOM:390x844phone and1440x1000desktop. Free request modal visually inspected both; reason/payment controls reachable by internal scrolling, footer remains visible. Owner approval executed at390CSS. Earlier exact-size qualification still applies to other screens.
- Collection register before free approval:33receipt rows net12598; pharmacy48 net (original20 minus4return plus eight4payments). Actual saved references include hyphens in UPI/Debit/CreditCard/Cheque references; earlier compact notes abbreviated them. Split printed two separate2receipts. No payer or credit receipt was created.
- New findings needing review: Pharmacy dashboard labels PHARM patient dues as OP; Aarogyasri value0 despite4AAR bill; Collections Owner shows No patient payment due on unpaid self/credit bills because role cannot collect (misleading wording). Cash-return bill Gross14/Total16 needs tax-vs-net label review. These are recorded observations, not fixed/passed yet.

## OP payer approval and first settlement
- Insurance coordinator extended TPA estimate1254/approved1154/copay100; Aarogyasri estimate/approved1254/copay0. Saved and reopened/list confirmed; each patient balance0. Receivables contained three bill settlements per case (OP/service/pharmacy), no patient receipt for covered charges.
- TPA Query raised saved and reopened persisted query/note. Changed Rejected, saved and list confirmed Rejected. Open receivables had0TPArows/Insurance0: reversal removed active settlements. Patient due in case stayed0 under pending-payer collection policy; Accounts Patient dues KPI rose to2.4k, which may wrongly label unapproved payer balance as patient dues and requires review.
- Restored TPA Preauth approved1154, confirmed list, then Claim submitted, confirmed persisted stage. Recreated STL00022OP400,00023LAB750,00024PHARM4.
- Received STL00024 Bank transfer3, write-off disallowed1, referenceTEST-TPA-SETTLE-PHARM003; phone390CSS form inspected, recorded and row disappeared from Open. Received STL00023Bank750 referenceTEST-TPA-SETTLE-LAB750, then00022Bank400 TEST-TPA-SETTLE-OP400; each open row disappeared separately. These are synthetic local records; no external bank transfer occurred.
- Claim list subsequently showed TPA SETTLED, estimate1254approved1154settled1153patient0payer0. Thus1write-off plus1153payer money plus100patient copay reconciles1254. Other three payer cases still open; documents/exclusions/packages/transfer-to-patient disallowance and IP payer stays not yet tested.
- Remaining payer settlements recorded individually with Bank transfer/no disallowance: Aarogyasri STL21pharm4(TEST-AAR-PHARM004),20LAB750(TEST-AAR-LAB750),19OP500(TEST-AAR-OP500); Corporate STL13pharm4(TEST-COR-PHARM004),6LAB750(TEST-COR-LAB750),1OP500(TEST-COR-OP500); Trust STL14pharm4(TEST-TRUST-PHARM004),7LAB750(TEST-TRUST-LAB750),2OP500(TEST-TRUST-OP500). Each saved receipt was checked by disappearance from Open list before another receipt.
- Final Receivables Open: Nothing outstanding; Insurance/Aarogyasri/Corporate/Trust KPIs0. Case list individually showed SETTLED for all four, patient0/payer0; three settled1254, TPA1153(+1disallowed and100patientcopay). No source changes after Bug10. Final cleanup not yet performed because acceptance is still in progress.

## OP visit closure
- Reception Visit Tracking after settlements:15consulted,0open diagnostics, credit patient1254due, other14financially paid/free. Opened each of15visit details separately and Close visit; confirmed stageClosed and timestamp on each. Tracker then15completed/0in building/0servicesopen,15Closedrows. Credit remained Payment pending1254 whileClosed, proving independent clinical/financial axes.
- Verified390CSS phone tracker KPI/layout and closed Trust visit progress. Trust name/payer/UHID/timeline fit; vitals cards continue colour-only abnormal indication (noHIGH/LOWword). Cash desktop visit receipts modes readable, negative4return shown, serviceorders2verified, bill totals16netpharmacy.
- Reception appropriately did not see clinical note text, but Visit page said The doctor has not documented this visit yet despite signed notes confirmed under Doctor. This is a misleading permission-state message requiring a fix/listing; no clinical notes exposed.
- Closure does not claim fullOPacceptance: patient record/queue display/dayreport/export/physicalprints/appointments/follow-up return visits and some responsive checks remain untested. All15clinical core flows completed, pharmacy15dispensed, fourpayercases settled; credit dues retained for later money-control tests.

## Emergency / ICU / ward — started, not complete
- Nursing Staff Emergency Desk empty baseline. Registered unidentified P1Resuscitation synthetic male45 via108, RESUS-1, DrDemoPhysician, description TEST Unknown male approx45; synthetic acceptance arrival by108, synthetic trauma complaint. BP170/100pulse105SpO293RR22GCS14. Created ER-261007-0001 and temporary patientSHMS26270016; description visibly retained. No payment gate. MLC not selected in this arrival; later-number workflow remains untested and needs another/appropriate MLC case.
- Nursing Vitals modal retained triage values and displayed written Out of range BP/Pulse/SpO2. Addedtemp99weight70height170GRBS132pain2/syntheticnote; saved without payment. Modal footer still says fee pending / moves vitalsdone despite ER pathway; wording needs review.
- Nursing ER Charges added registration300,traumacare1500,observation1hour200; each added line confirmed. ER billSELF00032total2000paid0due2000. Phone390charge drawer inspected; internal scroll required.
- Nursing Admit from ER: ICU-1-01,DrDemoPhysician,Emergency,selfpay,syntheticdiagnosis/attendant9000000099. ICU bed selection automatically checked ICUmonitor800day in addition consultant500day/nursing400day; otheroptionalchargesnotselected. Desktop/390phoneform inspected. AdmissionIP26270001 created with no money collected. Automatic Reception forms prompt opened after admission; dismissed for now, forms/consent not yet tested.
- ER Include closed showed ERcaseADMITTED IP26270001 ICU-1-01 and2000unpaid. Admission occupancy1/14,1ICU,13vacant. IPchargebreakdown11200=9500bed+800monitor+500consultant+400nursing. Combined balance13200 includes separateER2000; no duplicateERbill.
- Nursing admission Consumables used: ICUstoreTESTParacetamolBqty2, syntheticnote. Recorded and reopened drawer: line2x2=4 on existingIPbillSELF00033; IP11204combined13204. Currentdrawer totals did not refresh untilclosed/reopened (recorded UI staleness). ICUstockexpected18butstockscreenverification/rackreplacement stillpending.
- Transfer ICU→GeneralGW-A-01 preview stated dailyoldratecontinuesforstarted24h/newbednextcycle; ICUmonitorStopchecked, consultant/nursingcontinue. Desktop/390phonepreviewinspected. Transferred; rowGeneralGW-A-01,1generaloccupied/0ICU,ICU-1-01Cleaning,12vacant1cleaning; total13204unchanged. Further transfers/hourlystopwaive/nursingICUalerts/advance/discharge/identification/payerstays stillpending.
- Further bed transfers confirmed individually: GeneralGW-A-01→PrivatePVT-1-01→SpecialSPL-01→ICU-1-02. Transfer previews General/Private/Special continued consultant/nursing with no ward-specific change; back-to-ICU preview checked START monitor800day. Combined13204 remained unchanged before further charge. FourvacatedbedsCleaning. Generalbedchargefuture08Oct3:47AM0days; firstICUbed/monitorendedwith1day, preservingstartedcycle.
- Latest Add charge investigation: first Cardiac monitor option DOMvalue was day rather than serviceID; submitting default800 succeeded and admissioncombinedbalancebecame14004. Serviceassociation/charge label not yet rechecked. No newfixmade. An unsaved Nursing note modal was observed after nextaction; do not blindlysave/retry. User interrupted for status/list at this point.
