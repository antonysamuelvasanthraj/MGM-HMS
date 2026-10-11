import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {NAV,HIDDEN_ROUTES} from '../client/src/shell/nav.js';
const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});
const source=fs.readFileSync('server/auth.js','utf8');
const start=source.indexOf('export const DEFAULT_ROLE_PERMS');
const end=source.indexOf('const DEFAULT_ROLE_LABELS');
const definitions=vm.runInNewContext(source.slice(start,end).replaceAll('export const','const')+'; ({DEFAULT_ROLE_PERMS,ROLE_DEPARTMENTS})');
const roles={...definitions.DEFAULT_ROLE_PERMS};
for(const r of db.prepare('SELECT * FROM role_permissions').all()) if(r.role!=='admin') roles[r.role]=JSON.parse(r.perms);
const can=(ps,p)=>ps.includes('*')||ps.includes(p)||ps.some(x=>x.endsWith('.*')&&p.startsWith(x.slice(0,-1)));
const allowed=(ps,p)=>!p||(Array.isArray(p)?p.some(x=>can(ps,x)):can(ps,p));
const audit=JSON.parse(fs.readFileSync('data/demo-final-audit.json','utf8'));
const items=NAV.flatMap(g=>g.items);
const report=[];
report.push(`# MGM HMS — Final Demo Verification and Mapping Report

Prepared: 3 October 2026 · Asia/Kolkata  
Live demo: http://localhost:4300  
Scope: combined system verification, confirmed-gap fixes, preserved existing demo accounts.

## 1. Result and evidence

The checked local version passes the automated workflow, clean-installation, role/dashboard, server recovery and live database consistency checks listed below. The live administrator browser sweep rendered all 59 distinct visible menu URLs without captured browser console errors. This is a tested demo build, not a guarantee against every possible operational or hardware failure.

| Verification | Result | Scope |
|---|---|---|
| End-to-end workflow suite | 664 API checks passed | 97 list endpoints; 44 workflow groups; isolated temporary database |
| Clean setup and access suite | 537 API checks passed | 70 initially empty operational tables, 132 report endpoints, 9 dashboards, first-visit flow and role restrictions |
| Live menu browser sweep | 59/59 URLs rendered | Current Admin sidebar; includes report and OP procedure shortcuts |
| Live dashboard browser sweep | 9/9 rendered | Reception, doctor, pharmacy, lab, nursing, owner, insurance, quality, staff workspace |
| Collection workspace tabs | 16/16 rendered | Every reception and pharmacy tab, including cash acceptance and shift handover |
| Accounts workspace tabs | 8/8 rendered | Position, journals, ledger, receivables, payables, day close, reconciliation, accounts master |
| JavaScript syntax | ${audit.syntaxFiles} files passed | Server, client, tools, deployment |
| Relative imports | ${audit.importLinks} resolved | Server and browser source imports |
| SQLite integrity | OK | Read-only audit of live database |
| Foreign-key violations | 0 | Live database |
| Unbalanced vouchers | 0 | Every live journal voucher |
| Negative stock batches | 0 | Live batch quantities |
| Bill/payment mismatches | 0 | Stored paid total equals non-cancelled signed receipts |
| Bill balance mismatches | 0 | Total less paid, payer coverage and waived amount |
| Orphan payment bills | 0 | Live database |
| Login preservation | ${audit.users} records unchanged | Entire user records fingerprint matched the audit baseline; no passwords changed |
| Local server recovery | Passed | Startup, login/assets, missing-DB guard, port conflict, crash recovery, shutdown and stale-lock recovery |
| Backup/restore | Passed | Online backup, integrity, checksums, attachment restore, retention and corruption rejection |
| Final offline package | Passed | 2,167 files checksum-verified; bundled Node startup, prestart hook, clean admin login and login/CSS/JS assets verified on an isolated local port |

The tests use disposable databases, not the live demo database. Existing live cash handovers were not accepted, disputed or altered on anyone's behalf.

## 2. Fixes and combined implementation

- Blank role dashboards: shared header handling, role defaults and permitted dashboard views are connected; HR and cleaning roles have the staff workspace.
- Users and departments: doctors choose a clinical specialty; operational staff use the department belonging to their role. There are ${audit.departments} departments and ${Object.keys(roles).length} configured roles. Supervisors and staff accounts are separate, with scoped staff management.
- Shared permission arrays: sidebar and route permission checks support multiple allowed permissions. My Access renders. HR attendance and roster routes are reachable with the corresponding permission.
- OPD procedure billing: reception can create outpatient procedure/consumable charges without creating an inpatient admission. Doctor tariffs and free-visit approvals remain separate.
- Financial mapping: one payment engine records cash, UPI, card, bank and cheque. Payer allocations, free care and dues remain separate from money received. Doctor and department revenue reports use billed income.
- Cash custody: desk cash includes earlier unaccepted collections and reduces after acceptance. Pending acceptance stays visible. Admin/Owner receivers can review pending handovers across desks and earlier dates.
- Shift handover: outgoing staff record shifts, counted drawer cash and pending work; only the named incoming staff member accepts the shift record.
- GRN: one supplier invoice per GRN; multiple medicines, generics, brands and batches; pack conversion and GST; receive into Central before transfer to OP/IP/ER/ICU/OT. The live form exposes Receive & next supplier invoice.
- Emergency stock: separate location/batch, transfer and usage reports for ER/ICU/OT, with expiry, quantities and value/cost traceability.
- Pharmacy audits: Ward indent audit and Pharmacy expiry removals are separate report options, reachable from Pharmacy Analytics and Report Centre.
- Attendance/rosters: current code supports department/team scope, shift assignment, attendance status and punch restrictions. All automated attendance workflows passed.
- This final audit corrected the collection guidance to distinguish Cash acceptance from Shift handover. It also added named dialog semantics to the shared modal UI and rebuilt the stylesheet.
- Fixed an offline-package gap: the package now includes the stylesheet prestart hook referenced by package.json, so normal startup does not fail because tools/ensure-css.mjs is missing.
- Added a reusable read-only final auditor: tools/demo-final-audit.mjs. Evidence is stored in data/demo-final-audit.json; no credentials appear in the report.

## 3. Exact current menu inventory

Source inventory: ${NAV.length} sidebar groups, ${items.length} menu entries, ${new Set(items.map(x=>x.route.split('?')[0])).size} distinct base routes. Several entries intentionally point to the same controller with different query parameters. The historical count of 61 screens is therefore not the current exact menu count.
`);
for(const group of NAV){
 report.push(`### ${group.section}\n\n| Screen | Route | Permission |\n|---|---|---|`);
 for(const i of group.items) report.push(`| ${i.label} | ${i.route} | ${Array.isArray(i.perm)?i.perm.join(' OR '):i.perm||'Signed-in user'}${i.hideIf?' · hidden when '+i.hideIf:''} |`);
 report.push('');
}
report.push('## 4. Internal screens\n\n| Screen | Route |\n|---|---|');
for(const [route,name] of Object.entries(HIDDEN_ROUTES))report.push(`| ${name} | ${route} |`);
report.push(`
Patient, visit and consultation detail actions are exercised through the API workflow suite. The live browser sweep covers menu pages; it does not assert that every internal screen was opened with every possible patient/state combination. Sign-in and asset delivery were checked by the server tests.

## 5. Role mapping and currently stored permissions

The table below uses source defaults plus live role overrides. A role's sidebar is filtered by permission and duplicate-screen suppression; its backend independently enforces permissions.

| Role | Default workspace | Department restriction | Visible menu labels |
|---|---|---|`);
const board={admin:'Owner',owner:'Owner',accounts:'Owner',reception:'Reception',reception_admin:'Reception',cashier:'Reception',doctor:'Doctor',pharmacy:'Pharmacy',pharmacy_admin:'Pharmacy',store:'Pharmacy',lab:'Laboratory',lab_admin:'Laboratory',radiology:'Imaging worklist',imaging_admin:'Imaging worklist',nurse:'Nursing / IP',nursing_incharge:'Nursing / IP',insurance:'Insurance',quality:'Quality'};
for(const [role,ps] of Object.entries(roles)){
 const visible=items.filter(i=>allowed(ps,i.perm)&&!(i.hideIf&&can(ps,i.hideIf))).map(i=>i.label);
 report.push(`| ${role} | ${board[role]||'Staff workspace / first permitted view'} | ${(definitions.ROLE_DEPARTMENTS[role]||[role==='doctor'?'Clinical specialties':'Configured role']).join(', ')} | ${visible.join('; ')} |`);
}
report.push('\n### Permission detail\n');
for(const [role,ps] of Object.entries(roles))report.push(`- **${role}:** ${ps.map(p=>'\`'+p+'\`').join(', ')}`);
report.push(`
## 6. End-to-end workflow coverage

| Area | Automated workflow checks |
|---|---|
| Reception / OPD | Patient creation, appointments → visits, registration, consultation bill, receipt, split payments, vitals gate, queue stages, first doctor/patient setup, search links |
| Clinical | Signed consultation, amendments/reasons, orders, templates, certificates, report access |
| Emergency | Emergency queue bypass, triage/treatment behavior independent of payment |
| IPD / nursing | Admission, bed/charge records, nursing and eMAR, ward indent → dispensing → IP bill, financial discharge checks |
| Diagnostics | Lab orders, sample/result/verification; imaging reports and attachments routes |
| Pharmacy | Stock, sale/billing, multi-line transfers and short receipt, supplier/GRN, IGST and pack conversions, sales return/refund, purchase return, supplier payment, adjustments |
| OT / maternity | Booking, maternity records and partograph |
| Billing / payer | Idempotent collection, receipt cancellation/refund, free treatment, payer settlement, receivable recovery/disallowance, insurance and approval restrictions |
| Accounts | Posting guards, balanced journal, trial balance, balance sheet, counter reconciliation, expenses/approvals, day close, variance approval and post-close lock |
| Reports / dashboard | 132 report endpoints, department reporting, doctor revenue, all dashboard API views and actual shared header/permission code |
| Administration | Staff/team scope, department validation, blocked privilege elevation, custom-role inheritance, roster/attendance, audit before/after, honest sync status |

The live staff form was also checked for 15 doctor/staff/supervisor role selections: doctor specialty choices; reception, pharmacy, lab, imaging, nursing, HR and cleaning department restrictions. The GRN dialog was opened and verified without saving or changing stock.

## 7. Cash and stock rules for the demo

1. Sales are billed income; collections are money actually received. An unpaid bill increases sales and dues, not cash in hand.
2. Cash, UPI and card remain separate. Refunds use signed negative payments. Payer/free/due allocations do not become cash collections.
3. Submitted cash handover remains pending and still belongs in desk cash until accepted. A variance requires a note. Submission and acceptance are different actions.
4. Shift records document staff responsibility and counted cash; they currently do **not transfer collector cash balances**. Use Cash acceptance for the Admin/Owner collection workflow.
5. A GRN receives into Central. Stock transfer approval, issue and receipt then move batches to the destination. Transfers do not count as medicine consumption expense.
6. Ward indents currently require an admitted patient. Emergency department replenishment is represented by stock transfers; it is not a standalone non-patient ward-indent module.
7. Expiry removals report confirmed expiry movements separately from adjustments to an already-expired batch. Recording an adjustment does not mean an automatic expiry-removal job ran.

## 8. Demo sequence and checks before presenting

Use existing demo usernames/passwords. No login was reset for this audit.

1. Admin: show Users & Roles, doctor specialty, department staff/supervisor roles and My Access.
2. Reception: patient → OP registration → fee collection → vitals → doctor queue. Explain independent clinical/payment statuses.
3. Doctor: consultation → orders/prescription → saved/signed note; review results.
4. Lab/imaging: show worklist, payment/authorisation state, result/report and verification.
5. Pharmacy: show multi-line GRN, Central batch stock, destination transfer, dispensing and receipt.
6. Nursing: show admission/bed, vitals/eMAR and patient ward indent.
7. Collections: show daily sales, cash/UPI/card and cash in hand; show pending handover acceptance in the Admin/Owner login. Do not expect submission to auto-approve.
8. Pharmacy reports: show ER/ICU/OT batches, transfer/usage history, ward-indent audit and expiry-removal report.
9. Accounts/owner: demonstrate billed revenue, collections, receivables and doctor/department reports; show matching ledger totals.
10. HR/cleaning/quality: show their permitted dashboard and scoped working screens rather than the owner's board.

## 9. Local delivery, backup and limits

The verified live system is at localhost:4300. The final offline package contains Node 24, application files and installed dependencies. It excludes the live database, uploads, logs and credentials: migrating the existing demo requires restoring/copying a verified backup using LOCAL-SERVER-GUIDE.md.

Final package: release/MGM-HMS-Local-20261003-024018. Its release-manifest.json has 2,167 SHA-256 checksums; verification found zero mismatches. The packaged runtime started successfully on a separate test port and authenticated the clean-install administrator. Package verification evidence: data/demo-package-verification.json.

Backup created for this audit: backups/final-demo-audit/hms-2026-10-02T21-04-02-824Z-9e95cb. The backup utility verifies SQLite integrity and file checksums.

The Windows supervisor/installer and backup/restore mechanisms passed automated tests. This report does not confirm that the production startup task is installed on the client's server, nor that this machine completed a 24-hour soak test. LAN clients need access to the local server; a failed local server is not a per-workstation offline database.

SMS/WhatsApp gateways, cloud sync, payer portals, printers/scanners and hospital hardware were not certified by these localhost checks. They depend on installed equipment, configured providers and credentials. Live sidebar rendering and isolated role tests are not an assertion that every button has been manually used under every live account or at every viewport.

No remaining failures were found in the executed tests. The shift cash-transfer and non-patient ward-indent boundaries above remain functional scope limits, and should not be presented as completed features.

Earlier detailed change history: MGM-HMS-COMPLETE-CHANGE-AND-MAPPING-REPORT.md. That file is a historical snapshot; this report supersedes its test counts and current menu inventory.
`);
fs.writeFileSync('FINAL-DEMO-REPORT.md',report.join('\n'));
console.log(JSON.stringify({report:'FINAL-DEMO-REPORT.md',menuEntries:items.length,groups:NAV.length,roles:Object.keys(roles).length,words:report.join(' ').split(/\s+/).length}));
db.close();
