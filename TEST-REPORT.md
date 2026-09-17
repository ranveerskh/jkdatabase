# JK Database V6.0.0 — verification

## Passed

- 27 Node regression tests covering real business-service transactions: combined
  stock checks; drafts/finalisation/duplicates; invoice and purchase voids; linked
  deletion protection; returned quantities; prorated discount/HST and rounding;
  customer credits and vendor advances; transfer/refund limits; stock editing;
  atomic CSV imports; unique numbers; quotes; statements; report costs; save
  failures; stale-tab protection; resets; backup validation and legacy migration.
- All 17 page modules loaded with an empty database in jsdom.
- All 17 page modules loaded with populated sample data in jsdom.
- Ten form workflows submitted through DOM events: customer, vendor, inventory,
  invoice, customer payment, return, purchase, vendor payment, expense and quote.
- Customer/vendor statements generated after account selection.
- Navigation targets, JavaScript imports and CSS file paths resolved.
- No inline JavaScript or inline event handlers remain in the HTML pages.
- JavaScript syntax checks completed for application modules.

## Limits

jsdom is a DOM execution environment, not a graphical browser. A native browser
could not be started in the build environment: the Playwright download failed
and an alternative Chromium binary failed to launch. Visual layout, native
print dialogs, real download prompts and Safari/iPhone behaviour have therefore
not been visually verified. Web Locks were mocked in the service/DOM harness;
real multi-tab browser behaviour remains a manual acceptance check.

## Quick acceptance check on your device

1. Open at HTTPS or localhost and create a sample customer, vendor and product.
2. Save/edit a draft, finalise it, and check quantity and stock ledger.
3. Open Print and inspect Save PDF.
4. Record a payment larger than the balance; verify available credit.
5. Return a sold item; allocate or record refund of the available credit.
6. Download a backup, restore it, and compare balances.
7. Open two tabs. Save in one, then confirm a stale save in the other is rejected.
8. Check tables and dialogs at your phone/tablet width.

Do these checks with sample data before entering live records. Existing V5
history needs reconciliation because V6 cannot infer missing historical events.
