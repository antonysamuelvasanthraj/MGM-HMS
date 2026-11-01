# Full reset and validation — 1 November 2026

The user explicitly selected a full reset including masters and settings, retaining only the existing Admin login.

## Live result

- Admin username and password hash preserved; other logins and old sessions removed.
- Previous settings and masters removed; fresh installation defaults installed. Built-in service/lab/ward/account structures may therefore remain as defaults and require local configuration.
- Patients, encounters, bills, payments, orders, admissions, medicine batches, medicines, suppliers, saved templates and journal lines: zero.
- Old backup bundles and the old test database directory removed.
- Production environment active; server healthy. SQLite integrity OK, zero foreign-key errors.
- All 76 Admin routes loaded without detected blank/missing/access-error pages.

## Fixes

- General settings changes now require admin.write rather than admin.view.
- Clinic session creation and editing likewise require admin.write. Read-only viewers cannot use edit controls.
- Backup, demo-mode and clinic-save buttons recover after asynchronous failures using captured button references.
- Hospital Settings now provides a Product configuration section linking to existing users/roles, tariffs/lab templates, wards, medicines, suppliers, packages, payers, accounts and clinical-template screens.

## Validation on isolated data

- Core smoke workflows: 1,313 API checks, including accounts and financial reports.
- Integration regressions: 279 checks; rerun after settings permission change passed.
- Clean installation: 610 API checks, 145 list endpoints, 156 reports and nine dashboards. Rerun after fixes passed.
- Admin settings and stock: 47 checks, 24 setting round trips; owner read-only enforcement verified, along with stock/accounting, stale-count rejection, discounts and token modes.
- IPD daily/hourly usage, stopped charges, repeat visits, package limits/exclusions and agreed prices passed; 15 charge-plan API checks passed.
- Five payer-policy and ten paper/paperless/hybrid scenarios passed.
- Realtime wiring/disposal tests passed.
- Full-reset rehearsal on a disposable copy passed before the live reset.

No live test patients or financial transactions were created after the reset. Browser page loading is not exhaustive manual testing of every button. These results do not certify every possible clinical or financial scenario.

## Configuration still required

Admin must create staff and configure hospital identity, actual tariffs, beds, medicines, suppliers, payer/package rules and clinically validated lab parameters before operations. The preserved Admin password is still a known default and should be changed. Cloud delivery has no receiver implementation; SMS/WhatsApp gateway setup remains excluded. Physical printer/device checks and off-computer recovery remain unverified. Accounting invariants and derived server values are intentionally not arbitrary editable settings.
