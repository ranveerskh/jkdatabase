# JK Database V7.0.0 Local — verification report

## Automated business-logic suite

`npm test` passes **33/33** tests.

Coverage includes:
- posted sale tax, stock ledger and cost snapshots
- combined stock validation and atomic rollback
- drafts/finalisation/duplication/void protection
- linked-payment safeguards
- purchase stock reversal and duplicate vendor bill checks
- returns, proportional discount/HST credits and refunds
- customer overpayments/credits and vendor advances
- manual stock adjustments and deletion protection
- atomic CSV import, unique IDs and stock ledger creation
- invoice numbering safety and quote conversion
- statement/report calculations and penny allocation
- stale-tab write rejection
- backup validation/roundtrip and legacy reconciliation
- V7 one-save Sale flow: auto People/customer/payment/stock
- V7 Quote flow: no stock/payment until conversion
- V7 one-save Purchase flow with partial payment
- V6 to V7 People migration without changing document totals
- same identity reused across customer/vendor roles
- unsafe CSV formula-prefix rejection with full import rollback

## Static application checks

- Every JavaScript source file passes `node --check`.
- 21 HTML pages were parsed for duplicate IDs and broken local script/style/page links: **PASS**.
- Main daily navigation is limited to Home, Sales, Purchases, People, Products / Inventory,
  Expenses, Reports and Settings; legacy/technical pages remain available for advanced/backward workflows.

## Browser smoke-test note

A Chromium binary is present in the build environment, but this sandbox blocks local/file page
navigation (`ERR_BLOCKED_BY_ADMINISTRATOR`). Because of that environment restriction, automated
visual browser navigation could not be completed here. Core logic and static page/link validation
were run successfully instead.

## Data compatibility

V7 uses `jkDatabaseV7` and retains V6 as a migration source. Existing V6 data is not overwritten by
the package. Migration creates unified People links while preserving historical document totals.

Build: `7.0.0-local`
