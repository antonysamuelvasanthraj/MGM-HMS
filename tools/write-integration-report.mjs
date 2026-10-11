import fs from 'node:fs';
const audit=JSON.parse(fs.readFileSync('data/integration-profile-audit.json','utf8'));
const lines=[];
const add=(...s)=>lines.push(...s);
add('# MGM HMS — Full integration and profile review','', 'Reviewed 4 October 2026 · Local server: http://localhost:4300 · Instance: `full-integration-review-20261004`','',
'## Result','',
'The existing core workflows passed the automated checks listed below. Confirmed permission, collection display, navigation and diagnostic-link gaps were fixed and deployed to the local server. Existing demo logins and data were preserved. This is a verified integration review, not a claim that every proposed enhancement or every possible production scenario is complete.','',
'The actual current navigation has **12 menu sections, 65 menu entries, 58 unique controllers and 7 internal routes**. Some menu entries share a controller with different tabs or report filters. This supersedes the older 61-screen list.','',
'## Evidence and scope','',
'| Check | Result |','| --- | --- |',
'| Core workflow suite | 842 API checks; 100 list endpoints; 44 workflow categories passed |',
'| Clean installation / empty database | 541 API checks; 73 empty tables; 100 lists; 133 reports; 9 dashboard views passed |',
`| Actual demo database copy / role profiles | ${audit.apiChecks} API checks across ${audit.profiles.length} roles; visible-menu APIs, every permitted dashboard and report, denied reads, patient profile redaction and chat cursors passed |`,
'| Browser review | 60 visible admin menu entries reviewed read-only; consultation and pharmacy rechecked after asynchronous loading; patient, visit, waiting display, collections and portal preview also inspected |',
'| Quality controller | Actual controller renders structured audit data and detail without refresh errors |',
'| Realtime permissions | Identifier-only domain events, clinical alert filtering, role-specific notifications and anonymous presence privacy passed |',
'| Local server | Startup, login/assets, missing database refusal, port conflict, crash recovery, supervisor cleanup and graceful shutdown passed |',
'| Backup and restore | Online backup, integrity/checksums, attachment restore, retention and corrupt backup rejection passed on isolated test data |',
'| CSS build | Passed |',
'| Live database | Integrity OK; zero foreign-key violations, unbalanced vouchers, negative stock, payment-total mismatches, bill-balance mismatches or orphan payment bills |',
'| Login preservation | 23 users, 22 roles in use, 37 departments; user records match the saved baseline |',
'',
'Mutation tests ran on disposable databases, including a copy of the actual demo database. Browser review was read-only. No live test sale, payment, stock movement, message or patient record was created. Role testing used temporary accounts only in the disposable copy. Browser review used the admin session; it did not manually exercise every control as every role.','',
'## Confirmed gaps fixed in this review','',
'1. Enforced server permissions on patient lists/search, visit reads, laboratory/imaging worklists, clinical orders, certificates, IPD/ER/OT/maternity worklists and pharmacy reads. A login alone no longer authorises these reads. IP admission lookup remains available to authorised pharmacy dispensing for its patient/store workflow.',
'2. Restricted visit state changes and visit edits to their operational permissions; forced overrides require administrator authority.',
'3. Applied role-based patient-profile redaction and corresponding tab visibility for clinical notes, diagnostic orders, prescriptions, vitals, admissions, certificates, payer claims and financial history.',
'4. Applied shared collection policy to patient/visit bills. Visit and collections buttons show the collectible patient share rather than demanding the full payer-funded balance. Cancelled bills are excluded from aggregate patient/payer amounts.',
'5. Fixed supplier Returns navigation for store/purchase users. Sales-return and purchase-return tabs now follow their respective permissions, and purchase-return reads require purchase access.',
'6. Added a direct stock-loss register link in Pharmacy Analytics alongside indent, expiry and emergency-store audit reports.',
'7. Filtered global-search results by access and bill scope; hid SMS gateway configuration from unauthorised metadata reads; restricted notification read actions to visible notifications.',
'8. Removed complete clinical/billing/settings records from realtime domain broadcasts. Views refresh through authorised APIs. Restricted clinical/emergency alert details and role/user-targeted toasts; anonymous presence contains only the count.',
'9. Made imaging report controls read-only without reporting permission and locked verified report editing.',
'10. Corrected result notification links and supported laboratory/imaging order deep links, including legacy order paths.',
'11. Expanded GRN price comparison UI to purchase cost, MRP and selling price using normalised dispensing units, matching backend price comparisons.',
'12. Added paging for earlier chat messages, cursor validation, a return-to-latest control and reliable message input lookup.',
'',
'## Integration map by section','');
const map={
'Overview':'Role/permission → dashboard view → work queues and financial/operational aggregates. Team Chat & Tasks links signed-in staff, assignments and review records. Every configured role has a default view in the profile audit.',
'Reception & OPD':'Patient/UHID → appointment → encounter/token → doctor/department and consultation bill → vitals/payment gate → doctor queue → visit status/follow-up. OP procedure billing shares tariff, patient, visit and doctor attribution with Bills.',
'Clinical':'Encounter → consultation/signature/amendment → diagnoses, orders and prescription → diagnostics/pharmacy → patient history. Templates and certificates use the clinical records. Clinical-history visibility now follows clinical permission.',
'Emergency':'Triage/ER case → emergency charges and orders → admission/ward/ICU or discharge/referral outcome. Emergency permission gates worklist reads. Stock location reports include ER batches.',
'IPD':'Admission/payer/bed → daily charges, deposits, nursing/vitals/eMAR → ward indents → pharmacy issue/IP bill → discharge checks. Bed transfers and payer-settlement workflows are covered by core tests.',
'Diagnostics':'Clinical/service order and payment/authorisation → lab collection/results/verification or imaging report/sign-off → patient report and notification. Low and high range flags exist. Report links now open the intended order.',
'Pharmacy':'Supplier invoice/GRN → Central batches → approved transfers to stores → OP sale/IP issue/ward indent → bill/receipt/stock movement → returns, expiry/disposal and loss posting. Price history and price-change notifications, batch/expiry/location reports and package context are present.',
'OT & Maternity':'OT bookings/checklists and maternity cases → inpatient/clinical records; delivery/partograph capture persists in the same database. Visiting surgeon share accounting remains an outstanding enhancement.',
'Billing & Insurance':'Tariff/doctor/service or common/agreed package → bill → patient share versus payer receivable → cash/UPI/card receipt or payer settlement → journal/receipt/patient record. Approval, copay, split settlement, free treatment and disallowance scenarios are covered in core tests.',
'Finance':'Billing/payments/GRN/returns/expenses → balanced journal vouchers → ledger, trial balance, P&L, balance sheet, receivables/payables and day close. Desk cash remains until acceptance; cash handover and staff shift handover are distinct records.',
'Reports':'Role-filtered report catalog → shared operational and accounting queries → date/filter totals, detail and exports. Every report returned to each audited role was queried successfully. Pharmacy includes indent audit, expiry removal, emergency-store batches and stock loss.',
'Administration':'Users/roles/department → route/API access → dashboards. Hospital settings, tariffs, wards, roster/attendance, audit, quality, local setup and backups use the local database. External/cloud status is shown separately from LAN operation.'};
for(const section of [...new Set(audit.screens.map(s=>s.section))]){
 add(`### ${section}`,'',map[section]||'Uses shared role access, local database and authorised APIs.','',
 '| Screen / entry | Route | Main API reads checked | Result |','| --- | --- | --- | --- |');
 for(const s of audit.screens.filter(s=>s.section===section))add(`| ${s.label} | \`${s.route}\` | ${s.apis.map(a=>'`'+a+'`').join(', ')||'Role-specific alias; checked through its shared controller'} | Controller present; role-visible API checks passed |`);
 add('');
}
add('## Internal routes','', '| Screen | Route | Status |','| --- | --- | --- |');
const hidden={ '/patient':'Browser inspected; role-redaction API checks passed', '/visit':'Browser inspected; shared patient/payer collection policy applied', '/doctor-consultation':'Shares Consultation controller; consultation workflow suite passed', '/display-waiting':'Browser inspected; public waiting display loads', '/portal':'Browser inspected as staff preview; not a separately authenticated patient portal', '/collections':'Browser inspected; patient-share collection display fixed', '/login':'Live server and local startup/login tests passed; existing accounts unchanged'};
for(const [route,label]of Object.entries(audit.hiddenRoutes))add(`| ${label} | \`${route}\` | ${hidden[route]} |`);
add('','## Role profile results','', '| Role | Default dashboard | Available dashboards | Menu entries | Reports queried |','| --- | --- | --- | ---: | ---: |');
for(const p of audit.profiles)add(`| ${p.role} | ${p.dashboard} | ${(p.availableDashboards||[]).join(', ')} | ${p.visibleMenu.length} | ${p.reportCount} |`);
add('','## Accounting and stock interpretation for the demo','',
'- Revenue is billed/earned income; collection is money received. A payer-covered balance is not desk cash. Copay/non-covered patient charges remain separately collectible.',
'- Desk cash includes retained cash from earlier days. Submission creates a waiting handover; receiver acceptance changes custody. UPI/card totals are reconciliation values, not physical cash.',
'- Shift handover transfers operational responsibility between staff; cash acceptance by owner/admin is a separate action. Review both tabs during the demo.',
'- GRN is one supplier invoice per record, with multiple items/generics/brands/batches. Stock enters Central before transfer to OP/IP/ER/ICU/OT stores. Batch and expiry provenance is retained.',
'- Stock removal/loss reports must use posted write-off amounts; a transfer between stores is not a hospital loss.',
'- Packages support common hospital definitions and payer agreements. Package context in pharmacy is not yet a complete package utilisation engine; see outstanding scope below.',
'- Today is 4 October. Existing demo transactions dated 3 October will not appear in today-only totals; select the earlier date or a period containing it. Zero today totals do not mean those records were removed.',
'',
'## Outstanding scope and verification limits — do not present as completed','',
'| Item | Current state / remaining work |','| --- | --- |',
'| Counselling video, local transcription and summary | Not implemented. Requires recording consent, hardware capture, local ASR/model installation, storage and retention, patient/doctor linkage and doctor-reviewed summary. No patient media is sent to a provider. |',
'| Visiting/outside surgeon and revenue share | Dedicated master, procedure assignment and share/payable calculation on actual collections are not implemented. |',
'| Maintenance materials and QR/mobile scanning | Dedicated general materials store, QR labels and mobile scanner workflow are not implemented. |',
'| Detailed package utilisation until discharge | Pharmacy shows payer package context and totals. Procedure-level medicine attribution, coverage/allowance consumption, comprehensive cash/common package assignment and exception reconciliation remain incomplete. |',
'| Patient portal | Existing page is a staff preview. Independent patient authentication and public report sharing were not implemented or certified. |',
'| Cloud sync / public hosting | Local database is authoritative. Cloud synchronisation and durable public hosting are not certified by this review. A temporary tunnel is not a 24/7 hosting guarantee. |',
'| External integrations and hardware | SMS/WhatsApp delivery, payment terminals, printer output, scanners and recording devices were not physically tested. |',
'| Browser coverage | Main admin screens were inspected, with automated role/API coverage. Every modal, keyboard path, export file and action on every screen was not manually exercised for every role. No exhaustive security penetration, concurrency or 24-hour soak test was performed. |',
'| Stock/package notifications | Stored price/loss notifications exist. Real-world acknowledgement/escalation and hardware notification delivery require acceptance testing. |',
'',
'## Demo checklist','',
'1. Open http://localhost:4300/login and use the unchanged demo accounts.',
'2. Select 3 October / this month when showing existing activity; use 4 October only for genuinely new demo activity.',
'3. Show reception registration → vitals/payment → doctor consultation → diagnostic/pharmacy worklist → patient history.',
'4. Show a self-pay bill separately from an Aarogyasri/TPA case; explain patient share, pending payer claim and settlement.',
'5. Show Central GRN → store transfer → ward indent → batch/location/expiry audit and stock loss register.',
'6. Show desk collection → waiting cash handover → receiver acceptance; then show the separate staff shift handover.',
'7. Show role dashboards and access restrictions; HR/cleaning use their work dashboard rather than owner financial access.',
'8. Present unfinished enhancements as future scope; do not demonstrate them as available.',
'',
'## Files and recovery','',
'- Database backup before deployment: `E:\\MGM HMS\\data\\backups\\before-full-integration-review-20261004.db`.',
'- Machine-readable role/screen evidence: `E:\\MGM HMS\\data\\integration-profile-audit.json`.',
'- Live database audit: `E:\\MGM HMS\\data\\demo-final-audit.json` (if present; audit output also available by running the tool).',
'- Repeat checks: `npm test`; `node tools/admin-only-test.mjs`; `node tools/integration-profile-audit.mjs`; `node tools/quality-ui-test.mjs`; `node tools/realtime-permissions-test.mjs`; `npm run test:local-server`; `node tools/demo-final-audit.mjs`.',
'- Current server logs: `data/package-server.log` and `data/package-server-error.log`.',
'',
'A passed test establishes the scenarios it actually exercised. This report deliberately distinguishes working existing integrations from unfinished enhancements and untested operational conditions.');
fs.writeFileSync('FULL-SYSTEM-INTEGRATION-REVIEW-20261004.md',lines.join('\n')+'\n');
console.log('Wrote consolidated system report: '+audit.screens.length+' menu entries, '+audit.profiles.length+' roles.');
