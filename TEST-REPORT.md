# JK Database V7.2.0 Cloud — verification report

## Automated business-logic suite

`npm test` passes **45/45 tests**: 41 existing business-flow tests plus four cloud-sync
tests.

Coverage includes:
- posted sale tax, stock ledger and cost snapshots
- combined stock validation and atomic rollback
- drafts, finalisation, duplication and void protection
- linked-payment safeguards
- purchase stock reversal and duplicate vendor-bill checks
- returns, proportional discount/tax credits and refunds
- customer overpayments/credits and vendor advances
- manual stock adjustments and deletion protection
- atomic CSV import, unique IDs and stock ledger creation
- invoice numbering safety and quote conversion
- statement/report calculations and penny allocation
- stale-tab write rejection
- backup validation/roundtrip and legacy reconciliation
- V7 one-save Sale flow: automatic People/customer/payment/stock
- V7 Quote flow: no stock/payment until conversion
- V7 one-save Purchase flow with partial payment
- V6 to V7 People migration without changing document totals
- same identity reused across customer/vendor roles
- unsafe CSV formula-prefix rejection with full import rollback
- custom and historical invoice tax snapshots; quote conversion and returns preserve tax
- controlled final invoice edits reverse/repost stock and retain audit snapshots
- final invoice edit protection when linked payments or returns exist
- customer/product edits and guarded linked-record deletion
- Firestore record roundtrip, cloud record diffs, document ID validation and size limits
- Firestore per-transaction write limit guard

## Static application and Netlify checks

- Every JavaScript source file passes `node --check`.
- All 22 HTML pages (including the new login page) passed duplicate-ID and local-link checks.
- `npm run build` creates the static Netlify site in `dist/`.
- `netlify.toml` routes `/admin` to the administrator sign-in page.
- `git diff --check` passes.

## Firebase setup state

- Email/password sign-in is implemented with Firebase Authentication.
- Firestore documents are scoped under `businesses/jkdatabase-main` and require an
  administrator membership document checked by Firestore Security Rules.
- `firestore.rules` denies client writes to membership documents; the owner provisions
  the first admin from the Firebase Console.
- Cloud saves write changed records plus the business revision in one transaction. A
  stale device is rejected and must reload before saving.
- Live sign-in and Firestore transactions require the owner's Auth account, membership
  document and deployed Firestore rules; those project-console steps were not run here.

## Data compatibility

V7 keeps `jkDatabaseV7` as the browser recovery/migration source. The first cloud setup
can import normalized V7/V6 data without deleting the browser copy. Existing V6 data is
not silently replaced, and migration preserves historical document totals.

Build: `7.2.0-cloud`
