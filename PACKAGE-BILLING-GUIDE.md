# Hospital and TPA package billing

Updated 3 October 2026.

## Reception: hospital packages

1. Open Bills → New bill.
2. Choose the patient and the appropriate OP visit for doctor attribution.
3. Set Bill type to Package.
4. Choose Hospital packages, then the package name.
5. Review the fixed price and inclusions. Create the bill and collect now or later.

The service tariff is hidden for Package bills. The server reads the selected hospital package's current master price; a client-supplied rate cannot replace it. Inactive or missing packages are rejected. The package identifier is included in the bill creation audit.

## TPA, insurance and scheme packages

The same selector has a separate TPA / insurance / scheme category. It displays active packages with their payer name and agreed price, but cannot create an ordinary cash bill for that contract.

The insurance desk assigns the package to the patient's matching payer case in Insurance & Payer Cases. Approval, package limits, patient-pay exclusions and payer receivables use that workflow. Users with access see an Open Insurance & Payer Cases button; reception can ask the insurance desk to complete the case.

Hospital packages are maintained under Packages. Payer packages are maintained there against a specific payer, or under Payers & TPAs. Package inclusions do not automatically create or complete clinical orders; the clinician places the required orders separately.

## Verification

- Live hospital package choices and TPA/payer-labelled choices displayed.
- Selected hospital price updates the total; ordinary service billing restores when switching back to Outpatient.
- TPA cash-bill creation blocked in the UI and backend.
- Regression suite: 671 API checks passed, including authoritative package price, wrong bill type, unavailable package and payer-package rejection.
- Existing demo logins and package records preserved. No live test bill was created.

The offline package built earlier is a snapshot before this selector fix. The current local application source contains the update; rebuild the offline package before moving this update to another server.
