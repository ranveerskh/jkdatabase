# JK Database V7.3.3 Cloud — verification report

Build: `7.3.3-cloud`

## Automated checks

- `npm test`: **54/54 pass** (50 business/storage/printing tests, four cloud-sync tests).
- `npm run check`: 50 JavaScript files pass syntax checks; 23 HTML pages pass local-link and duplicate-ID checks.
- `npm run build`: static Netlify output builds successfully in `dist/`.
- `git diff --check`: passes.

Business coverage includes per-document tax, quote conversion, cost snapshots, returns/refunds, customer credits and vendor advances, atomic saves and rollback, stale-save rejection, guarded edit/delete/cancel behavior, legacy stock ledgers, no-stock sales and investment bills, CSV imports, backup validation/restore, reset markers and V6 → V7 migration without rewriting historical totals.

## Actual browser checks

**23/23 browser checks pass** in isolated Chromium 153 using the Firebase test adapter. The browser executable can be selected with `JK_TEST_CHROMIUM_PATH`. Standard Playwright browser downloads failed in this environment; a separately installed temporary Chromium was used without adding dependencies to the application.

Verified at 320px, 390px, 768px, 1024px and 1440px:

- Phone summaries use two columns; tablets use three or four. At least six dashboard summary cards fit on the tested phone screens.
- Home, Reports and Quick Sale have no horizontal page overflow; screenshots were generated for all five sizes.
- The mobile drawer closes fully; direct Home and Quick Sale links remain available.
- Product catalog search, repeated tile clicks, SKU/barcode input and cart handoff work. A 14-product fixture verifies a populated grid.
- Mobile checkout stays inside the viewport; expandable cart quantity controls work.
- Customer Payments Due and Vendor Payments Due headings and clear overdue-day labels appear correctly.
- Sale and quote fields toggle correctly; due date follows sale date until changed manually.
- Custom tax and combined quantity/unit fields update totals and payment amounts.
- Customer/product edit/delete controls, linked-record protections and failed-save rollback work.
- Investment entry records shipping, tax and partial payment without stock changes.
- Paid-invoice return credits, unpaid-invoice cancellation and expense tax work.
- Admin reset opens typed confirmation, downloads a backup, clears records/settings and retains the signed-in admin session.
- Normal navigation reuses one authenticated session; signed-out users are redirected before reading business records.

Invoice preview, Print / Save PDF, short Letter/A4 invoices and 80-line multipage invoices were generated successfully. Existing print CSS is unchanged by this release.

Screenshots and PDFs are generated under `.test-output/` and are not included in the deployed site. Checks use isolated fixture records and never modify production business data. Phone/tablet checks use responsive Chromium, not physical iPhone/iPad Safari hardware. Camera hardware barcode capture was not tested; SKU/barcode input and browser fallback were tested.

## Cloud and data compatibility

Firestore data remains business-scoped under `businesses/jkdatabase-main`; Security Rules require an active admin membership. Client writes cannot grant membership. Revision-checked transactions enforce stale-device and write-limit protection. The local `jkDatabaseV7` recovery cache, backups and migration behavior remain intact. This release changes UI density, navigation and labels without altering business calculations or historical records.
