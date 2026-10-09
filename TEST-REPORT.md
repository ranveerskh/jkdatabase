# JK Database V7.3.2 Cloud — verification report

## Automated business-logic suite

`npm test` passes **54/54 tests**: 50 business/logic tests plus four cloud-sync tests.

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
- All 23 HTML pages (including the new login and Quick Sale pages) passed duplicate-ID and local-link checks.
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

Build: `7.3.2-cloud`

## V7.3.1 browser and print verification

The V7.2.1 browser and print checks listed below passed previously in isolated Chromium 153. This sandbox cannot rerun them for this update: the UI runner is blocked while binding its local test server (`listen EPERM 127.0.0.1`). New Quick Sale handoff and typed admin-reset UI checks are included in `tests/ui.test.js`; they still need to run in an environment that permits localhost binding. Prior checks covered:
- Sale/quote visibility and English transaction text.
- Quantity, unit and 0%/5% tax previews and payment totals.
- Desktop (1440px), phone (390px) and tablet (768px) transaction rows.
- One-save invoice preview; complete formatting and four-column item table.
- Print button, Letter/A4 PDFs, and 80-line multipage invoices.
- All 21 app pages, back/forward and same-session navigation without another membership read.
- Two successive product creations automatically select the product and re-enable Save.
- Existing Sales kiosk UI test covers product search, repeat-tap quantity and barcode entry, pending an executable browser run.
- New Quick Sale UI test covers catalog search, tap-to-add, scanner-input entry and cart handoff to checkout.
- New Settings UI test covers backup download, explicit typed confirmation, full data clearing and admin session retention.
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
50 JavaScript files and all 23 HTML pages pass static checks in this update. `npm run build` succeeds and creates `dist/`.

## V7.3.1 no-stock workflow verification

- New sales preserve vendor cost snapshots for gross-profit reporting without changing product quantity or stock ledger.
- Returns on these invoices use the original tax and cost snapshots and do not create stock movements.
- Quotes preserve custom tax and the no-stock setting when converted.
- Investment bills record inventory cost, shipping, tax name/rate/amount, vendor and payment without changing product quantities.
- Legacy stock and ledger tests still pass using stock-tracked fixtures; no migration rewrites historical records.
- Product entry is quantity-free in the catalog; sales use a combined quantity/unit field such as `2 pcs`.
- Quick Sale is available from the main menu and Sales page, with a visible product-tile catalog, search, barcode entry/camera scan, cart quantity controls, and a handoff to the existing customer/payment/invoice workflow.
- Settings reset is available only after the app's administrator gate, downloads a backup, uses a typed confirmation, preserves a recovery copy, and resets business records while keeping the admin login.
- `npm test`: 54/54 pass. `npm run check`: 50 JavaScript files and 23 HTML pages pass. `npm run build`: succeeds.
- `npm run test:ui` was attempted, but this environment blocks the test server with `listen EPERM 127.0.0.1`; desktop/phone/tablet screenshots could not be regenerated here.
