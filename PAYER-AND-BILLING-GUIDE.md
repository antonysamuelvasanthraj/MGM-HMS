# Billing and payer workflows — 3 October 2026

## Billing

Choose a patient visit for context and one billing doctor. A linked visit fills the doctor automatically; changing the billing doctor affects this bill's attribution, not the consultation. Visit choices now show the visit number/date instead of repeating the doctor names.

Laboratory bills list lab tests; Imaging lists imaging services. OPD Procedures & Basic Charges lists procedures/other charges for outpatient billing. Changing the bill type clears previous lines, so procedure charges cannot remain on a Lab bill. The server also rejects mismatched service categories.

## Convert an admitted cash patient

Admissions & Beds → open the admission → Change payer / cash / credit.

Choose Insurance/TPA, Aarogyasri, Corporate, Trust, patient Credit or self-pay; choose a matching active payer master, enter the policy/employee/scheme reference and a reason. Existing receipts stay recorded. Bills on that admission's inpatient encounter are linked to its payer case. This does not retrospectively move unrelated OP visits to that admission.

Existing settlement allocations block direct conversion: the accounts/insurance desk must review them first. Previously collected payer receipts cannot be silently changed to another payer.

## Approval and co-pay

Insurance & Payer Cases → open the case → choose the matching payer and package; enter approval and **Patient co-pay — total for this case**, in rupees. Mark excluded/non-payable lines as Patient pays.

Co-pay is an explicit case amount, not an automatically inferred percentage. If the agreement says 20%, calculate the agreed rupee share on the applicable contract amount and enter that value.

A ₹1,000 package with ₹200 co-pay and ₹800 approved becomes ₹800 payer coverage plus ₹200 patient due. Payer coverage is a receivable, not cash collected. Collect patient co-pay at the appropriate counter; record the payer's actual later payment under Accounts → Receivables.

If only ₹600 is approved, the approval shortfall remains patient due. It is not automatically waived as a package discount. Package adjustments apply only to eligible bill value above the contracted package price, excluding patient-pay lines.

Running inpatient bills keep accruing. Final inpatient coverage/package adjustments are applied during discharge, not by pretending that approval already collected cash. Existing approved non-inpatient services follow the case's coverage rules. Review co-pay and exclusions before discharge.

Changing unpaid case terms reverses and reapplies unpaid allocations. Changes to payer terms or exclusions are blocked after actual payer receipts have been collected; these need accounts review.

## Companies, trusts and credit

| Category | Who owes the money? | Where it appears |
|---|---|---|
| Insurance / TPA | Named insurer/TPA, within approval | Payer case and payer receivables; co-pay/exclusions remain patient dues |
| Aarogyasri | Named scheme, within its approved contract | Scheme case and receivables |
| Corporate / company credit | Named company covering its employees | Corporate payer master, case and receivables |
| Trust sponsorship | Named trust covering treatment | Trust payer master, case and receivables |
| Patient credit | The patient pays later | Patient dues; no fictitious payer case |
| Cash / self-pay | Patient | Counter collections and patient dues |

Maintain company/trust names, credit days, packages and agreed service rates in Payers & TPAs. An employee/reference number identifies the sponsored patient; it does not turn company credit into cash. Corporate/trust automatic approval follows Hospital Settings and should reflect the hospital's contracts.

## Verification and local availability

700 workflow API checks and 537 clean-setup/access checks passed, including category rejection, TPA-master normalization, receipt-preserving cash admission conversion, co-pay collection and approval-shortfall handling. Live test bills/approvals were not submitted.

The updated build runs at http://localhost:4302 with the existing local database. Windows denied stopping the older process on port 4300; restart that process from its administrator-owned terminal/service to apply the backend there. Keep one server active for the actual demo. The previous offline package predates these changes and must be rebuilt before distribution.
