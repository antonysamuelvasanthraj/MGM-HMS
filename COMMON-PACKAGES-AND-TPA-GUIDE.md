# Common hospital packages and optional payer agreements

Active at http://localhost:4300/packages on 3 October 2026.

1. Create a common package: leave **Package scope / agreement with** as **Common hospital package (all patients)**. Set its hospital price, services, stay, inclusions and exclusions. This package is available for every patient.
2. If a TPA, insurer, Aarogyasri scheme, corporate or trust has different terms, create a package agreement: choose that payer, select the **Common hospital package for this agreement**, and enter the agreed price, payer code, stay and coverage. An agreement has its own terms; it does not overwrite the common master.
3. In Insurance & Payer Cases, select the patient, payer and package. The selector shows the matching agreement price when configured; otherwise it shows the common hospital price. The backend also resolves a submitted common package to the matching active agreement.
4. Co-pay and patient-pays exclusions are recorded on the payer case. Approval is still required for payer coverage. Choosing a package does not record money received or approve insurance automatically.

Example: a common delivery package costs ₹30,000. A linked Star Health agreement costs ₹25,000. A Star Health case uses the agreement; another payer with no agreement uses the hospital terms, subject to approval and co-pay.

Existing independent payer packages remain available. They can be linked to a common package through Edit when the hospital has configured the matching common package. Existing packages, cases and bills were not automatically converted. Adding a new agreement does not change an existing case; changing an existing case requires an explicit save and remains subject to the existing payment and approval safeguards.

One active linked agreement is allowed per payer and common package. Wrong-payer selection, invalid parent-package links and duplicate active agreements are rejected. Package assignment remains an explicit choice for the treatment; selecting a TPA alone does not guess which treatment the patient needs.

Validation: 730 workflow API checks and 537 empty-hospital API checks passed. New isolated tests verify agreement selection, hospital fallback, duplicate/wrong-payer rejection, editing, unchanged historical cases and the common cash package price. The live UI was checked in common-package mode, payer-agreement mode, and the patient payer-case package selector. No live package or case was created by those UI checks.

The migration adds only an optional hospital_package_id column. The pre-migration SQLite backup is data/backups/before-common-package-agreements-20261003.db. Existing business/master values and demo login records were preserved; the database integrity and login fingerprint audit passed.
