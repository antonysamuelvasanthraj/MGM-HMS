# MGM HMS — hybrid LIS / RIS and hospital-mode upgrade: what was built

27 Oct 2026. This started as a gap analysis of the two upgrade specs, written before building. All five phases are now
built and tested on a copy of the database. Each phase has its own automated test in `tools/`.

## Done

| # | Gap | Built | Test |
|---|---|---|---|
| G1 | Hospital operating mode | Settings → **Hospital operating mode** sets Paper, Paperless or Hybrid. Only the Hospital Admin (`hospital_mode.manage`) can change it, with a reason and confirmation; the history and audit trail keep before and after. The mode drives the department switches, and a non-admin cannot flip those directly. | `hospital-mode-test.mjs` |
| G2 | Order source and destination | `orders.order_source` (doctor portal / paper prescription / department entry / ward) and `orders.order_dest` (in-house / outsourced). Existing orders were backfilled. | same |
| G3 | Separate status axes | `orders.auth_status` (not needed / pending / approved / rejected / emergency) and `orders.result_stage` (pending / draft / to verify / released / amended), kept current by database triggers. Money status is still read from the bill. | same |
| G5 | Department entry (Method C) | **Paper request** on Laboratory and Imaging. It needs an open visit and the requesting doctor. The bill goes to reception; the department cannot collect. | same |
| G7 | Duplicate-order guard | A second open order for the same test on a visit asks first. The confirmed repeat is linked with `duplicate_of`. | same |
| G17 | MRI | Both MRI services are inactive (history kept and audited). MRI cannot be created, reactivated or given an outsourced rate. | same |
| G4 | Reception investigation queue | **Investigation Queue** (Reception & OPD). It has every lab and imaging order with money, approval and report status side by side. Filters: patient / UHID / mobile, money status, OPD / IPD / ICU / ER, department, priority, source, destination, doctor, dates. Actions: bill, collect, due, credit, pre-auth, open bill (discount / receipt), send to, slip, patient history, cancel. | `investigation-queue-test.mjs` |
| G6 | Release rules | Settings → **Investigation release**. OPD tests either wait for payment or approval, or start straight away. IPD and ICU work goes on the IP bill; emergency is always immediate. | same |
| G8–G12 | Outsourced lab and imaging | **Outsourcing** desk:<br>• centres, with their cost, code, TAT, transport and preferred centre;<br>• dispatch manifest with courier and temperature;<br>• the centre signs for the dispatch; their reference number and expected time are recorded;<br>• overdue list;<br>• imaging referral with appointment, study number and PACS link;<br>• the centre's report is kept by version, with their signatory;<br>• acceptance after patient / test / sample checks, corrected reports and rejection;<br>• centre bills matched to orders, posted as payable and then paid through `accounting.js`.<br>Reports: margin, turnaround, payables. | `outsourcing-test.mjs` |
| G13 | Barcodes | Code 128 tube label, wristband and file sticker. Accession number given at collection. A scanner in the top search box opens the sample, patient, admission or bill. | `lab-operations-test.mjs` |
| G14 | Critical-result call log | **Critical Results**: the lab records who was told, how, with read-back. The doctor acknowledges with the action taken. Minutes to call are measured, and a report is included. | same |
| G15 | Lab consumables per test | `LAB` stock location. Stock arrives by GRN into Central, then a transfer to LAB. Consumables are set per test (collection or processing) and used earliest-expiry first. Recollection uses the collection items again; outsourced tests use collection items only. A shortfall is recorded, never blocked. **Lab Store** screen and usage report. | same |
| G16 | TPA policy terms | On the insurance case:<br>• deductible;<br>• co-pay %;<br>• room-rent limit with proportional deduction (pharmacy and diagnostics exempt);<br>• category sub-limits.<br>These feed payer billing and the collection desk. **Claim & patient statements** print. Example tested: ₹50,000 → payer ₹40,000 / patient ₹10,000. | `payer-policy-test.mjs` |
| G18 | Paper clinical forms | **Paper forms** on the patient record. Blank vitals, MAR, I/O, ICU flow, ventilator, WHO checklist, anaesthesia, operation notes, consent, transfer and discharge forms print with the patient's details. The signed copy is then recorded with its scan. In Paperless mode this needs a downtime reason. | same |

## Not built, on purpose

- **Lab-raised indents to Central.** The pharmacy or store transfers to LAB using the existing stock-transfer flow, which already needs approval.
- **Automatic analyser interfaces and a DICOM viewer.** The HMS stores the PACS / DICOM link of an outside study; it does not display images itself.
- **Moving an existing OP bill line onto a later admission.** Orders placed after admission go on the IP bill automatically.
