# JK Database V7.2.2 Cloud — verification report

## Automated business-logic suite

`npm test` passes **51/51 tests**: 47 business/printing tests plus four cloud-sync tests.

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
- Owner-provided V7.2 screenshots confirm successful sign-in, membership setup and
  entry into the app. Automated UI tests use an isolated Firebase adapter; they do not
  perform production Firestore writes or verify deployed Rules in an emulator.

## Data compatibility

V7 keeps `jkDatabaseV7` as the browser recovery/migration source. The first cloud setup
can import normalized V7/V6 data without deleting the browser copy. Existing V6 data is
not silently replaced, and migration preserves historical document totals.

Build: `7.2.2-cloud`

## V7.2.2 browser and print verification

The V7.2.1 browser and print checks listed below passed previously in isolated Chromium 153. This sandbox cannot rerun them for V7.2.2: the UI runner is blocked while binding its local test server (`listen EPERM 127.0.0.1`). A new product search, tile-add and barcode-entry UI check is included in `tests/ui.test.js`; it still needs to run in an environment that permits localhost binding. Prior checks covered:
- Sale/quote visibility and English transaction text.
- Quantity, unit and 0%/5% tax previews and payment totals.
- Desktop (1440px), phone (390px) and tablet (768px) transaction rows.
- One-save invoice preview; complete formatting and four-column item table.
- Print button, Letter/A4 PDFs, and 80-line multipage invoices.
- All 21 app pages, back/forward and same-session navigation without another membership read.
- Two successive product creations automatically select the product and re-enable Save.
- New V7.2.2 kiosk UI test covers product search, repeat-tap quantity and barcode entry, pending an executable browser run.
- Purchase totals reset, invalid input clears stale totals, and stock/payment links persist.
- Paid invoice cancellation explains the safeguard; Return / credit note opens the form.
- Unpaid invoice cancellation restores stock while keeping history.
- Customer/product editing and protected linked-record deletion.
- Failed cloud save preserves the form, stock and all financial records.
- Signed-out users are redirected before cloud records load.

The Work browser blocked localhost. Browser QA therefore uses a separate headless
Chromium with local test fixtures; no production records are added or changed.
Phone/tablet checks verify responsive Chromium layouts, not a physical iPad Safari device.

Final PDF inspection from the prior V7.2.1 print checks: the short invoice fits one Letter page and one A4 page. The
80-line invoice uses five Letter pages/four A4 pages; extracted text stays inside
30-point edge bounds on every page, includes all 80 lines, and ends with Amount Due.
48 JavaScript files and all 22 HTML pages pass static checks in V7.2.2. `npm run build` succeeds and creates `dist/`.
