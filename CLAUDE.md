# SurelyHMS — working notes

Real-time hospital information system built from the Stitch design export in
`design-source/`. Read `README.md` first; this file is the short version for
anyone (or anything) editing the code.

## Layout
- `server/` — Express + `node:sqlite` + `ws`. No native modules, no build step.
- `client/views/*.html` — **generated** by `npm run convert`. Do not hand-edit;
  change `tools/convert.mjs` or the design source instead.
- `client/src/views/*.js` — one controller per screen. These own all data.
- `client/src/views/_kit.js` — the page kit. New screens should be assembled
  from `page()`, `card()`, `tableCard()`, `filterBar()`, `kpiRow()`, `live()`.

## Rules that matter
- **Four independent state axes.** `encounters.stage`, `encounters.payment_status`,
  `orders.status` and `sync_queue.status` never infer one another.
- **Emergency is never gated on money.** `callGate()` in `server/lib.js`.
- **One consultation bill per visit.** Collection is a separate act from billing.
- **Every mutation goes through `emit()`** in `server/lib.js` so the audit row,
  the sync queue entry and the realtime publish happen together.
- **Colour is never the only signal.** Use `pill()` from `ui.js`.
- **Double-entry books.** Money only moves through `server/payments.js` (collect,
  settle, refund) and posting rules in `server/accounting.js`. Never insert
  `journal_lines` directly; `recalcBill()` re-syncs a bill's revenue postings.
  Money received lives in `payments`; payer / free / due live in `bill_settlements`.
- **Stock enters only through a GRN into Central**, and reaches other locations
  only by `stock_transfers`. Quantities are in dispensing units.
- **Audit with before/after.** Pass `detail: { before, after, reason }` to `emit()`.
- **Counselling transcription is local.** whisper.cpp lives in `whisper/` (or `WHISPER_DIR`):
  `bin/Release/whisper-cli.exe` + `models/ggml-small.bin`. Audio stays in `data/counselling`, never static.
- Times are local wall-clock everywhere: `localStamp()` in JS,
  `datetime('now','localtime')` in SQL. Never mix in a UTC timestamp.

## After editing
```bash
npm run build:css     # required whenever markup or classes change
npm start
```
