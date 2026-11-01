# GRN invoice scanner — test report, 30 Oct 2026

**Purchases / GRN → Scan invoice**: the supplier bill is photographed or uploaded, its text is read
on the hospital server (Tesseract OCR + `tools/invoice-table.py`), and the result opens as a GRN to
review.

All tests ran on a **copy** of the live database (port 4384), as the Purchase Manager. Test invoices
were generated with known values: 4 lines (Pyrexa 500, Amoxil-D 500, Calmol 650, Pantop 40), with
batch, expiry, pack, qty, MRP, rate and GST. Nothing was posted to live.

## Short answer — why it "does not work properly"

1. **Phone photos are almost never read.** The table reader needs the bill perfectly straight. Within
   0.3° of straight, all 4 lines were read. At 0.5° or more it read **0 lines**, and a handheld photo
   is always more tilted than that. The user then gets a page of text and has to type every line.
2. **Lines are not matched to your medicines.** A name must match the master *exactly*. "Pyrexa 500
   **Tablet**" on the bill ≠ "Pyrexa 500" in the HMS, so every line is offered as a **NEW medicine**
   — 4 of 4 in the test, including Amoxil-D 500 and Calmol 650, which exist. Saving them would create
   duplicate medicines.
3. **Picking the right medicine silently changes the pack size.** The bill said 1×10. Choosing
   "Pyrexa 500" replaced it with the master's 15, so 50 packs would enter stock as 750 tablets
   instead of 500. Stock would be overstated by 250 and the unit cost understated.
4. **The invoice date is always left blank** on purpose (`grn-form.js:307`), even when printed. The GRN
   cannot be saved until someone types it.

The parts that work are listed in the results table below. The design is safe — nothing is posted
without review — but for a real bill photo the user ends up typing almost everything.

## Test results

| Test | Result |
|---|---|
| Clean scan, 1600 px, perfectly straight | 4 / 4 lines, 3.5 s. Two misreads: batch "PX261 1" (should be PX2611), MRP 29 (should be 25). |
| Phone-size image, 4000 px, straight | 4 lines, 10–13 s, many fields wrong or missing: Pantop MRP read as **1959** (should be 155), qty 25→29, rate 18.50→18.95, GST and two expiries missing. |
| Tilted 0.3° | 4 lines |
| Tilted 0.5°, 0.8°, 1°, 1.5°, 2° | **0 lines** |
| Header: supplier name, invoice number, amount, GST mode | Read correctly. |
| Invoice date | Never filled (deliberately cleared). |
| Medicine matching | 0 / 4 matched — all proposed as NEW. |
| Values placed into the GRN lines | Into the right boxes (batch, expiry, pack, qty, rate, MRP, GST). |
| Choosing the existing medicine for a line | Pack size overwritten from the master (10 → 15) without a warning. |
| Save with unmatched lines | Correctly blocked (supplier, invoice date and each medicine must be chosen). |
| PDF invoice | Refused — "PNG or JPEG required". Many distributors send PDF e-invoices. |
| Two desks scanning at once | The second gets "ocr_busy_try_again" and must retry. |
| Expiry printed as MM/YY (03/28) or MAR-28 | Not understood — only MM/YYYY. Common on Indian pharma bills. |
| Server set-up | Tesseract 5.4 (English), Python 3.11 + Pillow 12.3, scanner route live — all present. |

## Other things found

- The scanner files are **new today (04:12–04:28)** and are not committed to git. They were written
  outside this session, most likely by the other AI agent. It may still be working on them, so edits
  should be coordinated.
- The browser loads the GRN form twice as two separate copies (`grn-form.js` and
  `grn-form.js?v=20261030-transfer-2`). It was a workaround for stale files. The server already makes
  browsers re-check JS on every load, so the workaround is not needed.
- A debug label "Scanner revision 3" shows at the bottom of the scan window.
- The full-page text shown for checking has garbage where the table rules are, e.g.
  "sefrome infer [re [oo …". The table lines confuse the plain text pass.
- The column mapper works only for text pasted from Excel / a PDF (tab, | or wide spaces), not for a
  photo.

## Recommended fixes, in order

1. **Keep the bill's pack size** when the user picks a medicine on a scanned line, and show
   "Bill 1×10 · master 15 — check". *(Stock-accuracy bug; small change.)*
2. **Suggest the matching medicine.** Ignore form words (Tablet / Tab / Capsule / Cap / Syrup / Inj /
   strip / 's), then match. Where more than one fits, show the closest as a suggestion for the user to
   confirm — never substitute silently. Keep "NEW medicine" only when nothing is close.
3. **Straighten and resize the photo first.** Deskew, bring it to ~2000 px wide, and find columns from
   word positions when the bill has no ruled lines. This is what makes phone photos work.
4. **Read the invoice date**, and expiry written as MM/YY or MON-YY.
5. **Flag doubtful numbers** (low OCR confidence, MRP below rate, MRP far from the last GRN) in
   amber instead of filling them silently.
6. **Accept PDF invoices.** Use the PDF's own text when it has one; otherwise convert the page to an
   image.
7. Let the second desk **wait its turn** instead of "busy, try again"; remove the debug label and
   the `?v=` imports.

Until fixed, the reliable way to use it: a flat, straight, well-lit scan (or the supplier's
PDF/Excel rows pasted into "Map columns"). Pick each medicine by hand and **re-check the pack size**
on every line before saving.
