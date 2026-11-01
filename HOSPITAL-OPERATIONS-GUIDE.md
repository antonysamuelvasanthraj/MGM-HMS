# MGM HMS — operations handbook

For the administrator and desk in-charges who run the HMS every day. Installation on a
dedicated server is in [LOCAL-SERVER-GUIDE.md](LOCAL-SERVER-GUIDE.md); this handbook covers
what happens after that.

---

## 1. Where everything lives

| What | Where |
|---|---|
| The HMS server | One Windows computer, port **4300**. Desks open `http://<server-address>:4300` in Chrome or Edge. |
| Database | `data\surelyhms.db` — every patient, bill and report. Never copy it while the server is running; use a backup. |
| Uploaded files | `data\uploads` (reports, consent forms, attachments) |
| Automatic backups | `data\backups\auto-YYYY-MM-DD.db`, one a day, last 30 kept |
| Logs | `data\logs\live-server.log` (server) and `data\logs\tunnel.log` (public link) |
| Public link (demo only) | `data\public-url.txt` |

## 2. Starting, checking and stopping

| Double-click | Does |
|---|---|
| `start-demo.cmd` | Starts the HMS **and** the public HTTPS link, both in the background (no windows to close by accident). Both restart by themselves if they stop. |
| `start-live.cmd` | Starts only the HMS (for use inside the hospital network). |
| `status-demo.cmd` | Shows whether the HMS and the public link are running, and the link to share. |
| `stop-demo.cmd` | Stops both, on purpose. |

On a permanent hospital server use the Windows service from LOCAL-SERVER-GUIDE.md instead — it
starts with the computer.

**The public link changes** every time it restarts (it is Cloudflare's free link). After a restart,
run `status-demo.cmd` and share the new link. A permanent address needs a domain name.

## 3. Before going live with real patients

Open **Settings → Before going live**. Every line must be green:

1. Hospital name, address, phone and GSTIN are correct — they print on every bill and report.
2. The HMS runs in **real mode**, not demo (no yellow DEMO badge).
3. **No login uses a default password** — the `admin` account especially.
4. Every test, scan and procedure has its real price (**Fees & Tariffs**).
5. Every doctor has an OP consultation fee (**Users & Roles**).
6. Every lab result has the laboratory's own validated reference range (**Laboratory → Templates**);
   qualitative tests need their normal text, e.g. "Non-reactive".
7. A backup exists from the last 24 hours.
8. No demonstration or test patients remain.

Also in Settings:
- **Appearance** — *Calm blue* (navy and teal, white side menu) or *MGM maroon*. Changes the look only.
- **Reminder texts** — switch on to text patients, once a day at the hour you choose, about
  tomorrow's appointments and about open balances (at most once a week each). Needs the SMS /
  WhatsApp gateway; without it the messages wait on **Patient Messages** to be sent by hand.

Choose the hospital's way of working in **Settings → Hospital operating mode**. Only the Hospital
Admin can change it, with a reason; every change is kept in its history.
- **Paper:** doctors write on paper, reception bills tests from the slip, pharmacy dispenses by hand.
- **Paperless:** doctor portal, e-prescription queue, doctor-ordered tests.
- **Hybrid:** both at once. The HMS asks before the same test is ordered twice on a visit.

**Settings → Investigation release** decides whether outpatient tests wait for payment or approval,
or start straight away. Inpatient, ICU and emergency work is never held for money.

## 3a. Laboratory, imaging and outside centres

| Screen | Who | What |
|---|---|---|
| **Investigation Queue** | Reception | Every lab / imaging order with its money, approval and report status. Bill, collect, due, credit, pre-auth, send to an outside centre, slip, cancel. |
| **Laboratory → Paper request** | Lab / radiology | A patient brought a paper request straight to the department. The bill goes to reception; the department never collects. |
| **Outsourcing** | Lab / imaging in-charge, Accounts | Rates per centre, dispatch manifest, the centre signs, overdue list, record the centre's report, check and accept it, the centre's bills and payments. |
| **Critical Results** | Lab, doctors | The lab records who it told and that they read back; the doctor acknowledges and writes what was done. |
| **Lab Store** | Lab in-charge | Tubes, needles and reagents in the lab. Stock arrives by GRN into Central, then a transfer to **LAB**. Set what each test uses in Lab templates → Consumables. |
| **Patient → Wristband / Stickers / Paper forms** | Wards, reception | File stickers; blank nursing, ICU, OT and consent forms with the patient's details, then record the signed copy with its scan. The barcoded wristband and the sample tube label print only in Paperless / Hybrid mode — in Paper mode they are written by hand (the lab shows the sample number on collection). |

A barcode scanner works in the top search box: scan a tube, wristband or bill to open it.
On an insurance case, enter the policy terms (deductible, co-pay %, room-rent limit, sub-limits).
**Claim & patient statements** then prints what the payer is claimed and what the patient pays.

## 4. Every day

| When | Who | What |
|---|---|---|
| Opening | Administrator | Run `status-demo.cmd` (or check the green **Live** chip at the top of any screen). |
| Each shift end | Every cashier | **Day Close & Handover** — count the cash, hand it over; a difference over ₹1 needs a reason. |
| Day end | Accounts | **Counter Closing** for every counter; **Accounts → Day close**. |
| Day end | Lab in-charge | No report left "reported" without verification. |
| Day end | Pharmacy in-charge | Approve pending stock transfers; check near-expiry. |

## 5. Every week and month

- **Weekly:** copy the `data\backups` folder to another drive or cloud storage. A backup kept only
  on the same computer is lost with that computer.
- **Weekly:** look at the **Audit Trail** for discounts, payer changes and cancelled receipts.
- **Monthly:** restore one backup on a spare computer and open it (see LOCAL-SERVER-GUIDE.md §7) —
  a backup that has never been restored is only a hope.
- **When someone leaves:** deactivate their login the same day (**Users & Roles**). Never share logins.
- **Every 90 days:** staff change their passwords.

## 6. Money rules everyone should know

- **One consultation bill per visit.** Collecting money is separate from raising the bill.
- **Discounts** need a reason and the approver's name; they are in the audit trail.
- **Changing a patient's payer** (self-pay ⇄ insurance / Aarogyasri / corporate / trust) goes through
  **Change payer** on the visit or admission. Money already taken is kept as the patient's share or
  refunded — never left silently.
- **Emergency care is never held for payment.**
- **Schedule H / H1 / X medicines** are sold only against a prescription. At the counter, choose the
  prescribing doctor or write the paper prescription's reference. Search results mark them "Sch H · Rx".
- **Discharge** needs the doctor's clinical clearance and a discharge summary, as well as a settled bill.
  In Paper mode the desk records "cleared on paper by Dr …" and the paper summary's reference.
  LAMA, death and absconding are recorded as they happen.
- **Mobile numbers** must be 10-digit Indian numbers. Reminders and the patient portal use them.
- Every UPI, card, bank transfer or cheque payment needs its **transaction ID / approval code / UTR /
  cheque number**. This is on; it can be switched off in Settings → Outpatient policy.

## 7. When something goes wrong

| Problem | What to do |
|---|---|
| The page will not open on a desk | Check the server computer is on; run `status-demo.cmd`. If the HMS shows NOT RUNNING, run `start-demo.cmd`. |
| The public link shows a Cloudflare error | Wait two minutes — the link repairs itself. Then run `status-demo.cmd`; the link may have changed. |
| The top bar shows **Offline** | The desk lost the network. Screens still show the last data; reconnect the network. |
| "Too many attempts" at login | Wait 10 minutes (8 wrong passwords lock that login and computer for 10 minutes). |
| A wrong bill / receipt | Do not delete anything. Cancel the receipt with a reason, or refund; the original stays on record. |
| Data looks wrong after a crash | Stop the HMS, then restore yesterday's `auto-…db` with `deployment\Restore-Backup.ps1` (LOCAL-SERVER-GUIDE.md §7). |

Any outage leaves a line in `data\logs\` — send that file with the time it happened.

## 8. Changing the software

- Test every change on a **copy** of the database, never on the live one.
- Run the checks before putting a change live:
  ```
  set HMS_TEST_PORT=4398
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
  ```
- Take a backup, then restart the server. Changes to screens need `npm run build:css` first.
