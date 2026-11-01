# MGM HMS vs ICTHospital — comparison report (26 Oct 2026)

**ICTHospital** — open-source HMS by ICT Vision, Laravel 12 / PHP, running locally at
`127.0.0.1:8082` from `E:\ICTHospital`. Reviewed by signing in with its documented demo login
(`admin` / `123456`), opening all 45 menu screens in a headless browser at 1440×900, and reading its
README, user guide and code. **No code was changed in either project.**

---

## 1. Verdict in one paragraph

ICTHospital *looks* calmer because each screen does less: one page heading bar, one plain table,
lots of white space. It is a well-built **core clinic system** — patients, appointments, beds,
prescriptions, lab, pharmacy, invoices — but it stops there, and its own README says so (no deposits,
no theatre billing, commission fields "applied to nothing", "not yet proven in production"). MGM HMS
does roughly ten times more of a real Indian hospital's work — payers and TPA, Aarogyasri, packages,
double-entry accounts, IP running bills, ER, OT, maternity, stores, realtime desks — and that is why it
is denser. The useful lessons from ICTHospital are about **presentation** (fewer items per screen,
calmer headings, shorter menus), not about features.

## 2. Size and scope

| | MGM HMS | ICTHospital |
|---|---|---|
| Stack | Node 24 + SQLite, single-page app, WebSocket | Laravel 12 (PHP), server-rendered Bootstrap pages |
| Screens | 73 screens, all hospital | 45 menu screens — ~20 hospital, ~23 left over from ICTSchool (attendance messages, fees messages, institute, branches, fee reminders) |
| Back-end | 386 API endpoints | 223 web routes, 1 API route |
| Database | 116 tables | ~50 tables (README) |
| Roles / permissions | 27 roles, 116 permissions | 4 roles (Admin, Doctor, Nurse, Accountant), 90 permissions; only Admin granted by default |
| Reports | 146 reports in 11 groups, Excel / PDF export | 4 reports (outstanding lab, drug usage, debtors, bed occupancy) |
| Automated tests | ~1,560 checks across 9 suites + headless screen sweep | 153 feature tests (README) |
| Live updates | Yes — every desk refreshes on its own (WebSocket) | No — reload the page |

## 3. Module by module

| Area | MGM HMS | ICTHospital |
|---|---|---|
| Registration | UHID, payer category, referral source, ABHA, duplicate search, token slip | Name-only walk-in, age from DOB |
| OP flow | Token → vitals → doctor queue → consultation, with fee and vitals gates (or manual / direct-to-doctor) | Appointments only — no queue, no vitals, no tokens |
| Appointments | Booking with slot clash check (refuses double-booking unless deliberately overbooked) | Day view by doctor, refuses double-booking |
| Doctor portal | Consultation, e-prescription, orders, templates, amendments, certificates | Prescriptions (drug rows) |
| Lab | Worklist, sample → results → verify, age/sex/pregnancy ranges, critical alerts, interpretation text, header on every page | Requests and per-test results, part-reporting |
| Imaging / USG | Worklist, structured reports, templates | Diagnostic reports count only |
| Pharmacy | FEFO batches, GRN with HSN/GST, transfers between stores, returns, ward replacements, held bills | Dispense with stock check, reverse a sale |
| IPD | Admissions, bed map, hourly/daily accrual, transfers, nursing, MAR, discharge gates, packages | Beds/wards board, admissions |
| Emergency / OT / maternity / ICU | All present | None |
| Billing | One bill per visit, split payments, discounts with approver, refunds, credit notes, advances | Invoices with part payment |
| Payers | Insurance / TPA / Aarogyasri / corporate / trust cases, pre-auth, co-pay, exclusions, receivables, request→approve payer change | None |
| Accounts | Double-entry ledger, day close, counter closing, expenses, supplier payables | Income / expense entry by "sector" |
| Stores, maintenance, HR roster | Yes | Staff lists only |
| Communication | SMS / WhatsApp gateway, report-ready notices, staff chat, patient portal | **SMS, voice and video via ICTCore**, message templates, two scheduled reminder jobs (payments due, appointments) |
| Other | Local Whisper transcription (counselling), QR labels, go-live checklist, backups, public link | Barcode generator, multi-branch records, payment-gateway settings (stored only, no charging) |

**What ICTHospital has that MGM HMS does not:** voice / video teleconsultation and telephony
(ICTCore), automatic scheduled SMS reminders for appointments and dues, multi-branch records.

## 4. Visual design and UX, side by side

| Aspect | MGM HMS | ICTHospital |
|---|---|---|
| First impression | Rich, dense, maroon brand; dashboards full of figures | Calm, airy, blue; few numbers per screen |
| Page heading | Eyebrow chip + title + one-line description + action buttons | One bar: icon, title, a live count ("4 free of 5", "10,000.00 outstanding"), buttons on the right — very clean |
| Dashboard | Role-specific (9 views), 12–18 tiles, period filters, charts, work queues | 10 count tiles, occupancy bar, income vs expense, two "recent" tables; no charts |
| Sidebar | Grouped, up to 62 items for admin, badges with live counts | Grouped, ~45 items for admin of which half are school leftovers |
| Tables | Compact, status pills, money and codes aligned | Large, roomy Bootstrap tables; red **Delete** button on every patient / bed row |
| Money and dates | "₹35,200", "26 Oct 2026" | "15,000.00" with no ₹, dates as "2026-10-09" |
| Forms | Dialogs with validation, keyboard shortcuts (Ctrl+Enter, Alt+A) | Full-page forms |
| Wording | Plain, Indian hospital vocabulary | Mostly plain; some school-era text ("Expence", "Whoops! There are no income sector created yet!") |
| Login screen | Branded | Dated; broken logo image and a horizontal scrollbar |
| Errors found in the tour | 0 across 459 screens / 21 roles | 2 missing images on the SMS log screen |

### Transitions and motion

| | MGM HMS | ICTHospital |
|---|---|---|
| Approach | Five purposeful animations: dialog fade / scale-in, drawer slide-in, a pulse on the "Live" dot, a brief flash on a table row that just changed in real time; colour transitions on hover | Bootstrap and animate.css defaults: ~360 elements per page carry generic `transition: all 0.2–0.5s` (hover fades); no animation tied to meaning |
| Feels like | Quick, mostly still; motion tells you something changed | Soft hover fades everywhere |
| Reduced-motion setting respected | **No** (gap) | No |

## 5. What MGM HMS should take from ICTHospital (presentation only)

1. **One-line page header with a live count.** "Beds · 4 free of 5" in the heading bar removes the need
   for a separate tile. Our headers could carry the key count and drop the second line.
2. **Shorter menus per role.** Collapse rarely used admin items (sequences, backups, local sync,
   referrers…) under a single "Administration" group, so a desk sees 10–15 items, not 30–60.
3. **Fewer tiles, bigger numbers.** Their dashboard tile has just the figure and the label. Our tiles carry a
   subline on almost every tile; keeping sublines only where they add meaning would calm the dashboards.
4. **Room around tables.** Slightly taller rows and more padding on the main list screens (patients,
   bills, worklists) would read calmer.
5. **Respect "reduce motion".** Add a `prefers-reduced-motion` rule that turns our five animations off.
6. **Scheduled reminder jobs** (appointment tomorrow, dues outstanding) are the one functional idea
   worth adopting; teleconsultation is a larger decision.

## 6. What MGM HMS should *not* copy

- The per-row red **Delete** buttons — a hospital record should be cancelled with a reason, not deleted.
- Money without the currency symbol and ISO dates in tables.
- Generic "transition: all" on every element.
- A permission model where every non-admin role starts empty.

## 7. Integrations and pipelines

| | MGM HMS | ICTHospital |
|---|---|---|
| Outside access | Cloudflare Tunnel with self-restarting watchdog, status / stop scripts | None built in |
| Messaging | SMS / WhatsApp gateway (configurable), manual WhatsApp fallback | ICTCore SMS + voice + video, templates, SMS log, cron reminders |
| Payments | Cash / UPI / card / bank / cheque recorded; no online gateway | Gateway credentials stored, not used |
| Speech | Local Whisper transcription | None |
| Data out | Excel / PDF on reports and dashboards | Print views |
| Backups | Automatic daily + manual, restore script, go-live check | Not covered in the app |
| Tests in the pipeline | npm test + 8 suites + screen sweep + dead-button check | PHPUnit (153 tests) in CI |

---

*Method:* screenshots of all 45 ICTHospital menu screens and all 459 MGM HMS screens (21 roles)
were taken with Edge in headless mode at 1440×900; counts of routes, tables and roles were read from
each code base. No data or code was changed in either system.
