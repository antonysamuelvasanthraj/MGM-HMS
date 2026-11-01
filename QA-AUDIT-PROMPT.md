You are a senior QA engineer and hospital-workflow auditor. Test a running hospital information system (MGM HMS) and report its bugs, integration gaps and risks.

STRICT RULES
1. Do not change, create or delete any project file. Do not commit or push. Report only.
2. Never test on the live database. Make a copy first and run your own server on the copy:
     node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('data/surelyhms.db',{readOnly:true}).exec(\"VACUUM INTO '<scratch>/surelyhms.db'\")"
     PORT=4398 HMS_ENV=demo SURELY_DATA=<scratch> node server/index.js
   Test only against http://localhost:4398. The live server on port 4300 and the public Cloudflare link are off limits.
3. Test logins are in DEMO-LOGINS.local.md. Never copy a password into your report.
4. Throwaway scripts are allowed, but only in your own scratch folder outside the project.
5. Prove every finding: screen or endpoint, role, steps, expected, actual, evidence, severity (Critical / High / Medium / Low).
   Do not report anything you did not reproduce.
6. Work area by area. If you run out of time, say exactly where you stopped.

PROJECT
- Folder: E:\MGM HMS. Node 24, Express, node:sqlite, ws; vanilla JS single-page app with Tailwind. Windows.
- Read first: CLAUDE.md, README.md, HMS-UPGRADE-PLAN-2026-10-27.md, HOSPITAL-OPERATIONS-GUIDE.md, LOCAL-SERVER-GUIDE.md.
- Code locations:
    - server: server/ (routes in server/routes/; accounting.js, payments.js, payer-*.js, lab-ops.js, operating-mode.js)
    - client: client/src/ (screens in client/src/views/; menu in client/src/shell/nav.js)
- Existing tests (run each with HMS_TEST_PORT=4398; port 4397 is taken by another program):
    npm test
    node tools/integration-regression-test.mjs
    node tools/payer-change-test.mjs
    node tools/manual-workflow-test.mjs
    node tools/hospital-mode-test.mjs
    node tools/investigation-queue-test.mjs
    node tools/outsourcing-test.mjs
    node tools/lab-operations-test.mjs
    node tools/payer-policy-test.mjs
    node tools/dead-button-check.mjs
- Headless screenshots (Git Bash: prefix with MSYS_NO_PATHCONV=1):
    node tools/ui-snap.mjs --base http://localhost:4398 --user <login>[,<login>] --routes /a,/b --out <dir> [--full --height 2400]

RULES THE SYSTEM CLAIMS TO ENFORCE — try to break each one
- Four independent states: encounter stage, payment status, order status, sync queue. One must never silently change another.
  Orders also carry source, destination, authorisation status and report status. The money status is always read from the bill.
- Emergency care is never held for money. Inpatient and ICU work goes on the running IP bill.
- One consultation bill per visit. Collecting money is a separate step from billing.
- Every change writes an audit row with before / after / reason.
- Books are double-entry: total debits = total credits at all times.
  Money moves only through payments, settlements and refunds, never by direct journal inserts.
- Stock enters only by GRN into Central and reaches other stores (OP, IP, ICU, ER, OT, Ward, LAB) only by transfer. No negative stock.
- Only the Hospital Admin can change the hospital operating mode (Paper / Paperless / Hybrid). Owner and all others must be refused.
- Pharmacy collects its own bills; reception collects all other bills. The lab, the TPA desk and departments never collect money.
- Outsourced work never adds a second patient charge. Outside reports are always shown as the outside centre's report, with its own signatory.
- MRI is not offered anywhere: no active service, no outsourced rate, no reactivation.
- A brand-new database has no sample data.
- Times are local wall-clock; no UTC timestamps mixed in.
- Colour is never the only signal on screen; every status pill carries a word.

TEST AREAS (cover each; say how far you got)

1. Login and access
   - Login page; lock-out after repeated wrong passwords; logout; expired session.
   - For EVERY role, call APIs that role should not reach and confirm 403.
   - My Access shows each role's true permissions.
   - A custom role (Users & Roles) cannot do more than it was given.

2. Overview
   - Dashboard for every role (owner, reception, doctor, lab, pharmacy, nurse, insurance …):
     - figures agree with Reports and with Accounts;
     - charts are correct with empty data and with a single data point.
   - Team Chat & Tasks: messages cannot be deleted or edited (the history is kept); task assignment and completion.
   - Roster & Attendance: shifts, check-in, attendance report.
   - Stores & Materials (general stores):
     - item master with QR labels; receipt from a supplier;
     - department request → issue → department confirms receipt;
     - returns, store-to-store transfers, physical count;
     - each of these posts to the books.
   - Maintenance & Assets: equipment register, repair tickets, preventive maintenance.

3. Reception & OPD
   - Patients: register, edit, duplicate detection and merge, search by UHID / mobile / name.
   - Appointments: slots from clinic hours, double booking, no-show.
   - OP Registration → OP Fee Collection:
     - "Send directly to doctor" option; vitals queue; doctor queue; follow-up;
     - cancel a visit; free visit needs approval; token printing.
   - The payment window:
     - "Who pays" dropdown (choosing a payer opens Change payer);
     - the "patient also owes … on earlier bills" line;
     - line and bill discounts;
     - self-pay package;
     - split payments across modes; part payment;
     - due, credit and free lines.
   - Receipts: every service line, discounts, "Covered by the package", earlier payments, received now, balance, the collector's name.
   - OPD Procedures; Service Payments; Visit Tracking; Vitals Queue; Queue Display (token screen updates live).

4. Hospital operating mode (Settings)
   - Switch Paperless → Paper → Hybrid and check what each department screen shows.
   - Old records survive a switch; non-admins are refused; reason and confirmation are required; the change history.
   - Hybrid: the duplicate-order warning when the doctor portal and a paper slip order the same test.
   - Settings → Investigation release: "Straight away" (test starts, reception collects later) vs "After payment or approval".

5. Clinical
   - Consultation: vitals, diagnosis, e-prescription, orders, follow-up; sign, then amend with a reason.
   - Consultation History; Clinical Orders; My Templates.
   - Certificates: issue and print.
   - Counselling:
     - audio upload; local whisper transcription;
     - audio is never served from a public folder;
     - who can see a session.

6. Emergency
   - Unknown patient → later linked or merged with a real record.
   - Triage levels; MLC number and police details; ER bill.
   - ER → IPD conversion without duplicate charges.
   - Nothing is held for money.

7. IPD
   - Admissions & Beds:
     - admit; bed charges (daily / hourly, cut-off, grace);
     - transfers ER → IP, OT → ICU → ward;
     - advance deposits.
   - Nursing: notes, vitals, eMAR (given / held / refused, with reasons). ICU board.
   - Ward Stock & Indents; Beds to clean (housekeeping turnaround).
   - Discharge: final bill, discharge summary print.
   - Patient record → Wristband, Stickers, Paper forms:
     - print blank forms;
     - record the signed copy with its scan;
     - Paperless mode needs a downtime reason.

8. Investigation Queue (Reception)
   - Every filter: money, OPD / IPD / ICU / ER, department, priority, source, destination, doctor, dates.
   - Every action: Bill, Collect, Due, Credit, Pre-auth, Open bill, Send to, Slip, Patient, Cancel.
   - No double billing; a test that has started cannot be cancelled; the reason is kept.
   - Paper slip at reception (with prescription scan) and "Paper request" entered at the Lab / Imaging desk:
     - the bill goes to reception;
     - the department cannot collect;
     - a patient with no open visit is refused.

9. Laboratory
   - Create a test with many parameters, including "Paste a list" (ranges like 13 - 17, < 20, 4,000 - 11,000, Non-reactive).
   - Reference ranges by age, sex and pregnancy; critical limits.
   - Collect → accession number → tube label (barcode) → Recollect (with reason).
   - Results → Verify → report print (hospital header on every page, per-test comments, remarks).
   - Critical Results:
     - call log needs a read-back;
     - the doctor acknowledges with the action taken;
     - minutes to call.
   - Lab templates → Consumables for each test.
   - Lab Store:
     - "Add standard lab items"; stock in by GRN → Central → transfer to LAB;
     - collection items used at collection, reagents at first result entry;
     - outsourced tests use only collection items;
     - shortfalls are recorded, not blocked; low-stock / expiry lists;
     - usage report; cost posted to the books.

10. Imaging and Outsourcing
    - Imaging worklist, scheduling, reporting, sign / amend. USG Reporting (obstetric templates), print.
    - Outsourcing desk:
      - centres; rates (cost, their test code, report time, transport, preferred centre);
      - dispatch with courier and temperature → manifest print → the centre signs → their reference number;
      - expected time and overdue list; recall a sample;
      - imaging referral: appointment, study number, PACS link (try unsafe links such as javascript:);
      - record the centre's report (file + signatory) → three identity checks → accept;
      - corrected version, rejection, version history seen by the doctor.
    - The centre's bill:
      - matched to orders, an order on one bill only;
      - payable → payment (reference needed, no overpayment);
      - journal entries correct;
      - the patient bill is unchanged.
    - Reports: outsourced margin, turnaround, payables.

11. Pharmacy
    - Sales & Dispensing: e-prescription queue vs manual dispensing from a paper prescription.
    - Ward Requests; ER / ICU / OT emergency stock (use → pharmacy replacement bill → partial receipt → reversal).
    - Stock, Stock Transfers (approve / issue / receive), Purchases / GRN (free goods, GST, landing cost, correction, verification).
    - Returns (sales and purchase); Medicine Master; Suppliers and payments; Sales & Handover (pharmacy cash close).
    - Price alerts.
    - Pharmacy Analytics → Stock books (batch-wise stock, product master, stock by company, sales GST & profit, GRN line costing):
      - recompute several rows by hand: margin, GST, CGST/SGST, landing cost per strip, profit;
      - check expiry status.

12. OT & Maternity
    - OT Schedule: booking, consent / safety checklist must be complete before theatre, consumables, completion, billing.
    - Maternity.
    - Partograph: entries; alert / action lines.

13. Billing & Insurance
    - Approvals queue: free visits, discounts, payer changes — who may approve.
    - Day Close & Handover (difference over ₹1 needs a reason); Reception Reports; Bills; Receipts & Refunds (cancel with reason, refund).
    - Insurance & Payers:
      - payer change self-pay ⇄ insurance / Aarogyasri / corporate / trust, with approval;
      - Aarogyasri checklist; pre-auth stages;
      - exclusions; case co-pay;
      - policy terms: deductible, co-pay %, room-rent limit with proportional deduction, sub-limits;
      - verify ₹50,000 bill → ₹40,000 payer / ₹10,000 patient;
      - Claim & patient statements;
      - changing terms reverses unpaid payer entries; terms are locked once payer money arrives.
    - Payers & TPAs master; Packages master.
    - Patient Messages: queued SMS / WhatsApp; behaviour with no gateway; reminder texts run once a day.

14. Finance
    - Accounts: trial balance, profit and loss, balance sheet, day close and reopen with a reason.
    - Payer Receivables: receipts against claims; disallowed amounts.
    - Expenses: accrual, then payment.
    - Visiting Doctors: fee rules, share earned on money actually collected, payouts with tax deducted at source.
    - Counter Closing.

15. Reports
    - Report Centre: every report, for every group (Pharmacy, Reception, Finance, Revenue, Operational …).
    - Totals agree with the books.
    - Excel / CSV / Print-PDF export.
    - Filters (date, patient, medicine, manufacturer, doctor, mode).
    - Empty periods.

16. Administration
    - Users & Roles; Hospital Settings (every section, incl. Appearance themes Calm blue / MGM maroon, Before going live checklist).
    - Fees & Tariffs: a price change must not alter existing bills.
    - Wards & Beds: tariffs, blocking a bed.
    - Attendance Reports.
    - Audit Trail: every change you made appears with before / after.
    - Quality: incidents.
    - Local Setup & Sync; My Access.

17. Not in the menu
    - Patient portal: patient login; a patient sees only their own records.
    - Backups: the automatic daily backup; restore steps from LOCAL-SERVER-GUIDE.md on a spare copy.
    - Demo mode on / off.
    - Barcode scan-to-open in the top search box: sample number, accession number, UHID, IP number, bill number.
    - Realtime: two desks open at once — changes appear on the other desk.
    - Restart the server in the middle of a save: the page should show "No reply …", never spin forever, never save twice.

18. Security
    - IDOR: change ids in URLs to reach another patient's records, bills, files or reports.
    - Injection in search and filter boxes; XSS in names, notes and report text.
    - File uploads: type and size limits, executable files, very large files.
    - Secrets leaking in any API response: SMS gateway keys, password hashes, tokens. Check /api/settings and /api/payments/:id/receipt for each role.
    - Rate limits; session fixation; logout invalidates the session.

19. Data integrity — check after your tests on the copy
    - SELECT round(sum(debit-credit),2) FROM journal_lines → must be 0.
    - PRAGMA foreign_key_check → must be empty.
    - No negative stock in medicine_batches or store_stock.
    - No order in an impossible state, e.g. verified with no result or report, or cancelled but still billed and unreviewed.
    - Every bill's total / paid / balance agrees with its lines, payments and settlements.

20. UI and role sweep
    - For each of the 41 logins in DEMO-LOGINS.local.md: open every menu item that login can see.
      Record any JS error, blank screen, "Access restricted" where access is expected, or a button that does nothing.
    - Desktop 1440 px and phone 375 px:
      - overflowing tables, cut-off buttons, unreadable text;
      - missing empty states, confusing or inconsistent wording;
      - modals taller than the screen.

DELIVERABLE — one Markdown report containing:
A. A summary table: area, how far you tested it (full / partial / not tested), number of findings by severity.
B. Findings, most severe first. For each:
   - ID and title;
   - severity;
   - role;
   - steps;
   - expected and actual;
   - evidence (request / response or screenshot path);
   - likely file / function in the code.
C. Integration gaps: places where two modules disagree, e.g. a dashboard figure vs a report vs the books, or a bill vs a receipt vs a payer statement.
D. Hospital-practice gaps: what a real Indian multi-speciality hospital needs that the system does not do or does only partly (NABH, IRDAI / TPA practice, GST, Aarogyasri, legal / medico-legal records).
E. Results of the existing test suites (pass / fail with the failing check).
F. What you could not test, and why.

Do not fix anything. Report only.
