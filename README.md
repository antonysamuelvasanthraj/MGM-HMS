# SurelyHMS

For an offline hospital installation with automatic Windows startup, recovery,
verified backups and restore instructions, follow [LOCAL-SERVER-GUIDE.md](LOCAL-SERVER-GUIDE.md).
Use the packaged Node 24 runtime and `deployment/Install-LocalServer.ps1` on the
hospital server; a development `npm start` terminal is not the 24/7 installation.

A working, real-time hospital information system built from the Stitch
**“SurelyHMS — Hospital Information System”** design export and the operating
brief dated 23 September 2026.

Every one of the 55 exported designs is now a live screen in a single
application: one shell, one database, one realtime feed. Registering a patient
at reception changes the doctor's queue, the waiting-room board and the
cashier's totals within a second, on every workstation.

```bash
npm install
npm start
# → http://localhost:4300  (and on the LAN address the server prints)
```

The first `npm start` prepares the design references, builds the stylesheet and seeds a
full demo hospital; after that it just starts. There is no bundler and no
native module — Node 22.5+ and two pure-JS dependencies.

Sign in with **`admin` / `surely`**. Other demo accounts: `reception`,
`cashier`, `anand` (doctor), `lakshmi` (nurse), `lab`, `pathology`, `radtech`,
`pharmacy`, `store`, `accounts`, `insurance`, `quality`, `owner` — all with the
password `surely`. Each one gets a different sidebar and a different dashboard.

---

## What it actually does

### The outpatient spine (sections 1–2 of the brief)

The flow the brief describes, implemented end to end and enforced by the server:

| Step | Screen | What the system does |
|---|---|---|
| Identify the patient | **Patient Search & Registration** | Warns when a similar record exists so a returning patient keeps one UHID for life |
| Open the visit | **OP Registration** | Allots the token, creates the encounter and raises exactly one consultation bill |
| Show the tariff | **Doctor Fees & Tariffs** | The fee comes from the doctor record — follow-ups inside the free window cost nothing |
| Receive the payment | **OP Fee Collection** | The same collection engine as every other desk; a receipt is issued and the ledger posted |
| Record vitals | **Vitals Queue** | Observations are taken whether or not the fee is settled |
| Consult | **Consultation** | Identity and allergies first, then history, vitals, findings, diagnosis |
| Place orders | **Clinical Orders** | Lab, imaging, procedure — each a separate charge, never a second consultation fee |
| Complete services | **Laboratory / Imaging / Pharmacy** | Collection → processing → result → authorised verification → report |
| Review results | **My Practice** | Verified reports come back to the ordering doctor |
| Finish the visit | **Visit Tracking** | Anything still open stays visible rather than disappearing |

**Four independent state axes**, exactly as the brief insists. A visit carries
`stage`, `payment_status`, per-order work state and sync state separately.
"Consulted" never implies "reports ready" or "bills paid" — the visit sheet
shows a consulted patient with ₹350 still outstanding, because that is the truth.

### The two things the brief asked to be fixed

1. **"OP Fee Collection" now exists by that name** in the sidebar, at
   `/op-fee-collection`. It is a reception/cashier projection of the same
   payments engine — not a second payments store.
2. **The ambiguous "skip billing" checkbox is gone.** Registration offers an
   explicit three-way choice: *collect now*, *collect later*, or
   *approved free visit* — and a free visit needs a reason, records who
   approved it, and cancels the bill rather than quietly never creating one.
   The approval requirement is a policy switch in Hospital Settings.

### Emergency is never gated

Ordinary OP calling waits for the fee and for vitals (both switchable in
Hospital Settings). `callGate()` in `server/lib.js` returns `ok` immediately for
any encounter whose kind is `EMG` or whose priority is `emergency`. Triage and
treatment happen first; billing is reconciled afterwards.

---

## Architecture

```
server/           Node 24 + Express + node:sqlite + ws   (no native modules)
  schema.sql      the whole hospital: 56 tables
  db.js           statement cache, transactions, document numbering
  auth.js         scrypt passwords, sessions, role → permission map
  realtime.js     WebSocket hub with topic subscriptions
  lib.js          bill maths, the call gate, the audit+realtime emitter
  routes/         core, patients, opd, billing, clinical, diagnostics,
                  pharmacy, ipd, backoffice
client/
  index.html      the single shell: 240px rail, 64px top bar
  views/*.html    55 converted Stitch designs (generated — do not hand-edit)
  src/
    router.js     loads a live controller and disposes the previous screen
    ws.js         reconnecting socket, per-view topic subscriptions
    ui.js         formatting, status pills, tables, modals, charts, printing
    views/_kit.js the page kit every screen is assembled from
    views/*.js    one controller per screen
tools/convert.mjs  Stitch export → view partials
```

### Realtime

Views declare the topics they care about:

```js
return live({
  topics: ['queue', 'billing'],
  events: ['encounter.created', 'payment.received'],
  load,
});
```

Every mutation on the server calls `emit()`, which writes the audit row, queues
the record for cloud sync and publishes to subscribed clients in one place. The
socket re-subscribes on reconnect, so a dropped LAN link heals without a reload.
Rows whose content changed flash amber; nothing else re-renders.

### Offline-first by design

The hospital's own machine is the source of truth. SQLite with write-ahead
logging, fonts and icons self-hosted (no CDN), and a local sync queue. Cloud
delivery is not implemented in this working model: flushing returns a clear
unavailable response and never marks undelivered records as synced. The
preseeded sync history is demonstration data. Back up `data/surelyhms.db` and you have
backed up the hospital.

---

## The design system

The Stitch export used Material-style token names. Those names are kept so the
converted markup renders unchanged, but every value is re-pointed at the palette
in section 5 of the brief — see `tailwind.config.cjs`:

| Token | Hex | Used for |
|---|---|---|
| Brand primary | `#881D2C` | Primary actions, selected navigation |
| Brand dark | `#39171D` | The rail and the wall display |
| Brand accent | `#C3A256` | Focus rings and small brand marks only |
| Canvas | `#F5F7FA` | Application background |
| Surface | `#FFFFFF` | Cards, tables, forms |
| Primary text | `#172B4D` | Headings and body |
| Secondary text | `#526176` | Labels and metadata |
| Border | `#D8DFE8` | Dividers and input boundaries |

Success `#166534`/`#DCFCE7`, warning `#92400E`/`#FEF3C7`, information
`#1E40AF`/`#DBEAFE`, danger `#B91C1C`/`#FEE2E2`, neutral `#475569`/`#F1F5F9`.

Changing a hex there restyles the whole application. **Colour is never the only
signal** — every status pill carries its word, and most carry a dot as well.

Layout follows the brief: 240px collapsible rail (Ctrl+B), 64px top bar, 24px
page margins, an 8px spacing grid, 40px controls, 48px table rows, sticky table
headings, Inter with tabular figures and a slashed zero, restrained shadows and
no gradients. Print styles drop the navigation.

---

## Regenerating the views

`client/views/*.html` is generated. To re-run the conversion after changing the
Stitch export:

```bash
npm run convert     # design-source → client/views
npm run build:css   # rebuild Tailwind against the new markup
```

The converter keeps each design's `<main>`, drops the duplicated header and
sidebar, rewrites remote demo images to local assets, neutralises dead `href="#"`
links and preserves each page's inline demo scripts so local UI toggles still work.

### How much of the original markup survives

Be clear about this. The **design system** is carried over faithfully — palette,
typography, spacing grid, component vocabulary, status language and the
information architecture of every screen all come from the Stitch export and the
brief. The **static mock markup does not survive at runtime**: each controller
calls `mountPage()`, which replaces the converted HTML with the same layout
rendered from live records, because a hardcoded table of invented patients
cannot be made to show real ones.

The converted files are still the skeleton. A route whose controller is missing
or fails renders the original design and is labelled a design preview, so a
half-finished screen can never pass mock numbers off as the hospital's. Every
route currently has a working controller, so that banner should never appear.

---

## Demo data

The database seeds itself on first run with a synthetic hospital: 260 patients,
~1,500 encounters across 45 days, a live outpatient session, 50 inpatients,
an emergency register, a theatre list, labour records, stock with real expiry
exposure, 90 expense vouchers and a full ledger.

**None of it describes a real person.** `/demo-data` says so on screen and
explains how to clear it:

```bash
npm run reset   # deletes data/surelyhms.db; the next start reseeds
```

---

## Known limits

- Authentication is session-token based over plain HTTP, which is appropriate
  for a trusted hospital LAN. Put it behind TLS before exposing it further.
- The cloud sync endpoint is not contacted; "push to cloud" marks the queue
  synced locally so the workflow and its failure states are demonstrable.
- Reports are computed live from SQLite. At a few hundred thousand encounters
  the heavier aggregates in `/api/reports/*` will want materialising.
- Permissions are enforced twice. The sidebar hides what a role does not use;
  the server independently refuses every **write**, and refuses **reads of
  individual clinical records** (consultation notes, lab and imaging results,
  patient files, admission detail) without the matching permission. Operational
  aggregates — queue counts, bed availability, worklist totals — are readable by
  any signed-in member of staff, because reception genuinely does need to answer
  "is a bed free?" and "is the report back yet?". If your policy is stricter
  than that, tighten the `requireAuth` handlers in `server/routes/`.

## Verification and maintenance (23 September 2026)

Run `npm test` to launch an isolated test server against a temporary demo
hospital. It checks 62 list endpoints and saved workflows for registration,
appointment conversion, billing, vitals, consultations and amendments, laboratory,
imaging, pharmacy stock, purchasing, emergency, admission/discharge, nursing,
OT, maternity/partograph, insurance, expenses, certificates, quality, counter
reconciliation, templates and attendance. It removes only its own temporary
database after the server stops. It does not reset or alter `data/surelyhms.db`.

The UI keeps the existing palette, cards, forms and module structure. Old
exported demo scripts no longer execute alongside live controllers. Help lives
at the bottom of the sidebar; the demo statistics utility remains available at
`/demo-data`. New maternity cases can be created from the maternity register.
Appointment registration carries the patient/doctor into the visit and prevents
a second conversion. Global bill search opens the actual bill drawer.

All main sidebar screens were opened with the administrator demo account.
This is a local working model; external cloud delivery and connected device/PACS
integrations are not validated by these tests.
