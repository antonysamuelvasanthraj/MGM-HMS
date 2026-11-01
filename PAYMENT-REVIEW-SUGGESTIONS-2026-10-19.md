# Payment Section Review — Findings & Suggestions

**Date:** 2026-10-19 · **Scope:** payment modes, TPA / insurance, Aarogyasri, corporate, trust, credit, and converting a visit between payment types (OP self-pay → payer, IP self-pay → payer). **No code was changed — review and suggestions only.**

---

## 1. How the payment system works today (what I verified in the code)

### 1.1 The engine is fundamentally solid
The settlement engine (`server/payments.js → settleBill`) has real safeguards, all enforced server-side:

- **A payer line (Insurance / Aarogyasri / Corporate / Trust) can never be taken at the desk on its own** — it requires an approved payer case (`payer_needs_approved_case`), unless the user is admin or the Insurance desk acting on an approved case.
- **Changing a bill's financial category to or from a payer requires the Insurance desk or admin** (`payer_allocation_requires_insurance`). Reception and cashiers get a 403 even though they hold `payment.authorize`.
- **Patient-share enforcement**: on a payer bill, the desk cannot collect more money than the patient share (`payer_charges_not_patient_due`).
- **Idempotency**: every settlement carries a request key — double-submits cannot double-collect.
- **Auto case creation**: the moment any bill becomes a payer bill, a payer case (claim) is opened automatically and linked (`linkBillCase`), and ER cases continue seamlessly into the admission case.
- Books stay balanced on every move (verified with 0 mismatches in the acceptance run).

So the core is well built. The problems are in **workflows and discoverability**, not in the ledger.

### 1.2 Payment types and who can do what

| Action | Reception | Cashier | Insurance desk (TPA) | Admin |
|---|---|---|---|---|
| Collect money (cash/UPI/card) | ✅ | ✅ | — | ✅ |
| Refund | ❌ | ✅ | — | ✅ |
| Authorize due / free request | ✅ | ✅ | — | ✅ |
| Change a bill's category to/from a payer | ❌ 403 | ❌ 403 | ✅ (per bill, in Collect dialog) | ✅ |
| IP admission "Change payer / cash / credit" button | ✅ (`ipd.manage`) | ❌ | ❌ | ✅ |
| Edit payer on the patient record | ✅ (`patient.edit`) | ❌ | ❌ | ✅ |
| Approve payer case (preauth → claim → settlement) | ❌ | ❌ | ✅ | ✅ |

---

## 2. The gaps (this is what feels "not built properly")

### G1 — There is no OP-level "Change payer" at all
The only conversion function in the system is for **IP admissions** (`PATCH /admissions/:id/payer`, the "Change payer / cash / credit" button on the admission). For an **OP visit registered as self-pay**, nothing on the visit page, queue, or registration screen lets you convert it. Today's only real paths:

1. Insurance desk opens **each bill** in the Collect dialog and changes the category dropdown — per bill, one at a time, and only they can see the enabled dropdown.
2. Editing the patient record's payer — but see G2.

The visit page (`/visit`) shows payer status as **read-only text only** — no action.

### G2 — Editing the patient's payer does not touch the current visit
`PATCH /patients/:id` updates only the patient row. An open OP visit and its bills keep the old payer_type silently. Result: reception updates the patient to "Star Health", the visit still bills as self-pay, everyone thinks it's converted. This is the single most dangerous silent inconsistency in the section.

### G3 — IP conversion ignores money already collected
The admission payer-conversion guard blocks only when **payer settlements** exist (`existing_settlements_need_review`). **Cash / UPI / deposits already collected do not block and are not handled**: after conversion the old payments stay as "paid" and only the remaining balance moves to the payer. If the intent was full conversion, the patient's money should come back — today that is an undocumented, manual refund that nobody is prompted to do. Double-money risk: patient paid ₹10,000 deposit, payer later billed the running balance, patient never refunded.

### G4 — No request → approve workflow for conversion
Free treatment already has the right pattern: desk **requests**, approver **approves** (`/approvals`). Payer conversion — a financially bigger decision — has no equivalent. Either the Insurance desk does it silently per bill, or reception does it on admissions with no second pair of eyes.

### G5 — Aarogyasri has no dedicated workflow
Aarogyasri works through the generic payer machinery (category `scheme`/`aarogyasri`, case, package price). It works, but nothing guides its specifics: scheme-card / Aadhaar verification at registration, package selection, zero patient share by default, and the NTR Vaidya Seva preauth checklist. It looks and behaves identical to private TPA, which is how desk errors happen.

### G6 — Discoverability
The only hint that conversion exists is one line of small text inside the Collect dialog ("use Change payer on the admission or ask the Insurance desk"). A cashier facing a self-pay OP patient who just produced a TPA card has no on-screen path.

---

## 3. Suggestions (no code written — for your decision)

### S1 — Add "Convert payment type" as a first-class action on the OP visit (highest priority)
Mirror the IP admission feature at the **encounter level**:
- A "Convert payer" button on `/visit`, `/doctor-queue`, and the OP bill row, visible to reception.
- It should: pick target category + payer + policy no. → apply to **all open bills of the visit** in one transaction → auto-open/link the payer case (the engine already does this via `linkBillCase`) → set the visit to "awaiting payer approval" → route the case to the Insurance desk queue.
- Reuse the existing IP endpoint's validation (payer–category match, reason mandatory, audit) so behaviour is identical for OP and IP.

### S2 — Make it request → approve, like free treatment
- Reception / cashier: "Request conversion" (with payer details and reason).
- Insurance desk: approve / reject from a queue (extend the existing `/approvals` page or the Insurance page).
- On approval the server performs S1's transaction. This closes the "single person silently moves money between payer types" hole and matches the pattern staff already know.

### S3 — Handle money already collected, explicitly
On any conversion where payments or deposits exist:
- Block with a clear message listing what was collected, **or** offer a guided choice: "Refund ₹X to the patient" (issues a standard refund in the same flow) vs "Keep ₹X as the patient's co-pay/share".
- Never leave old cash silently credited against a payer-converted bill.
- Extend the IP guard to consider `payments` and deposits, not just settlements.

### S4 — Propagate or warn on patient-record payer edits
When someone edits the patient's payer while an open visit exists: either update the open visit/bills (with audit), or show a hard warning — "Patient has an open self-pay visit ENC-…; editing here does not convert it. Use Convert payer on the visit." Silent divergence (G2) must go.

### S5 — Aarogyasri-specific checklist
- At registration, category "Aarogyasri / scheme" should prompt: scheme card no., Aadhaar, package/procedure selection (tariff is package-based).
- Default patient share to ₹0; any patient-pay line should need an explicit reason (the engine already supports `patient_pays` exclusions — surface them).
- Aarogyasri cases should appear in the Insurance desk queue labelled as scheme cases with their package price and preauth status.

### S6 — Small UX fixes that remove most desk confusion
- Visit page: show the financial category as a badge with a "Convert" action (subject to S2 permissions) instead of read-only text.
- Bills list: a filter "self-pay with payer details on file" to catch missed conversions before discharge.
- Discharge: if the patient has payer details on the record but the bill is still self-pay, warn before final settlement.
- Rename/clarify: cashiers holding `payment.authorize` but getting `payer_allocation_requires_insurance` is confusing — either scope the perm name or show the message as "Only the Insurance desk can allocate to a payer".

### S7 — What does **not** need changing
The money engine itself — split lines, request-key idempotency, payer-approved-case enforcement, patient-share caps, receivables, audit trail, ER→IP case continuity, package adjustment at discharge. These tested clean. Build the conversion UX **on top of** `settleBill` / `linkBillCase` / the IP payer endpoint rather than replacing them.

---

## 4. Suggested priority

| Priority | Item | Why |
|---|---|---|
| 1 | S3 money-on-conversion guard | Real financial risk (double money / un-refunded deposits) |
| 2 | S1 OP visit-level conversion | The missing feature the desk hits daily |
| 3 | S4 patient-edit propagation/warning | Silent data divergence today |
| 4 | S2 request→approve | Control & audit; pattern already exists |
| 5 | S5 Aarogyasri checklist | Scheme compliance and desk speed |
| 6 | S6 UX polish | Reduces training burden |
