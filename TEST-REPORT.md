# JK Database V7.0.1 Local — verification report

## Automated business-logic suite

`npm test` passes **41/41** tests.

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
- 0%, custom and historical invoice tax snapshots; both quote conversion flows and returns preserve original tax
- controlled final invoice edits reverse/repost stock, retain audit snapshots, and roll back if stock is insufficient
- final invoice editing is blocked when linked payments or returns exist
- customer and product edits remain available while linked-record deletion stays guarded

## Static application checks

- Every JavaScript source file passes `node --check`.
- 21 HTML pages were parsed for duplicate IDs and broken local script/style/page links: **PASS**.
- Main daily navigation is limited to Home, Sales, Purchases, People, Products / Inventory,
  Expenses, Reports and Settings; legacy/technical pages remain available for advanced/backward workflows.

## Browser and print visual note

Work Browser policy blocks local `file:` navigation, and this sandbox does not allow binding a
local HTTP server. Desktop/mobile browser screenshots and rendered Print / Save PDF comparison
could not be completed in this environment. The invoice markup and print CSS were reviewed against
the supplied reference, and the automated business-logic and static page/link checks passed.

## Data compatibility

V7 uses `jkDatabaseV7` and retains V6 as a migration source. Existing V6 data is not overwritten by
the package. Migration creates unified People links while preserving historical document totals.

Build: `7.0.1-local`
