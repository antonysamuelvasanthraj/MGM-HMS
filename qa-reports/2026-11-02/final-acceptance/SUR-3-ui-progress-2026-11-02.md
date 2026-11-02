# SUR-3 UI acceptance progress — 2026-11-02

## Scope and safety

Tested the authorized local application at `http://127.0.0.1:4300` using browser UI interactions and existing private demo access. No credentials, tokens, names, contact details, or other patient demographics are included here. No existing patient was recreated, no account or permission was changed, and no payment was submitted.

## Confirmed browser results

| Scenario | Result | Evidence |
|---|---|---|
| Reception login | Pass | UI login returned HTTP 200 and reached the dashboard. |
| Assigned patient 001 detail | Pass | Patient record ID `4`, marker `TEST-MGM-QA-001`, and UHID `SHMS-2627-0004` appeared in the UI. |
| OP visit form | Pass | The form selected the assigned patient, required the attending doctor, and passed `checkValidity()` after selecting the available doctor. |
| OP visit save | Pass | UI save produced encounter `ENC-261102-00015`; the patient detail showed one encounter. Reopening the patient preserved that encounter and timeline count. No page errors were observed. |
| Appointment page | Partial | Admin UI opened the scheduling page; it rendered zero bookings, filters, export and “Book an appointment”. The form exposed patient search, doctor, slot, channel, visit type, and notes. A test patient search result was observed and a valid doctor/slot could be selected. |
| Appointment save | Not tested | A later attempt did not resolve to exactly one patient suggestion. No appointment was submitted; duplicate risk was avoided. |
| Visit fee collection / receipt | Not tested | No payment or fee collection was submitted. No gateway was used. |
| Other workflows / roles / responsive checks | Not tested in this continuation | This pass focused on the assigned range’s OP path and appointment entry. |

## Defects

No reproducible application defect was confirmed. The appointment selection mismatch was a test interaction issue with no booking submitted; further browser observation is needed before classifying it.

## Handoff

Use patient marker `TEST-MGM-QA-001` (record ID `4`, UHID `SHMS-2627-0004`) and encounter `ENC-261102-00015` for downstream role work. Patient 001 is an existing campaign record; it was not created in this pass. Appointment 002, fee collection, receipt persistence, and other assigned workflows remain pending. Evidence here is sanitized textual browser output; screenshots containing patient demographics were discarded and are not linked.
