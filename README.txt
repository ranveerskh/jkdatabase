JK DATABASE — V6.0.0 LOCAL EDITION
================================
A repaired, modular local business manager. Firebase is intentionally disabled.
No build step, application npm dependencies, or online JavaScript libraries.

OPEN THE APP
------------
Option 1: Upload the extracted folder to a static HTTPS host (for example,
your existing Netlify site). index.html must be at the site root.

Option 2: With Python 3 installed, open a terminal inside this folder and run:
    python -m http.server 8000 --bind 127.0.0.1
Open http://localhost:8000 in a current Chrome, Edge, Firefox or Safari.
Windows users with Python installed can use START-WINDOWS.cmd.

Do not double-click index.html. ES modules and safe writes need an HTTP server.
Safe writes use Web Locks; HTTPS and localhost are supported. A browser that
cannot provide Web Locks can display data but cannot save changes.

UPGRADE FROM V5
---------------
1. Download a full JSON backup from the OLD app before replacing files.
2. Keep the same browser, profile and site address where possible.
3. V6 reads a V5/V4/V3 database if there is no active V6 database yet.
4. If using a new address/device, restore your old JSON backup in Settings.
5. Check physical inventory and outstanding balances against your real records.
6. Export a new V6 backup after confirming the migration.

The original older browser keys remain untouched. V6 saves under jkDatabaseV6.
Reset writes an EMPTY V6 database instead of deleting its key, so older data
cannot unexpectedly reappear. Reset is not a privacy erasure: older-version
keys and the previous-save recovery copy remain in browser storage. A fresh
site/profile starts empty unless you restore a backup.

Legacy amounts are preserved, not silently rewritten. Older voids, unlinked
payments, old returns and missing cost history may require reconciliation.
Imported documents are labelled by a migration notice. Imported purchase
voiding is blocked because stock movement history may be incomplete. Imported
invoices can receive V6 credit notes only if they have no unreconciled legacy
returns. Older returns remain visible but are not silently applied again to
invoice balances or tax. Missing historical costs make profit unavailable.

DAILY WORKFLOW
--------------
- Set your business profile and HST rate first.
- Add customers/vendors and inventory with opening quantities and standard cost.
- Purchase Bills record stock-in and the amount owed to vendors.
- Save invoice drafts freely. Finalise a draft to post the sale and reduce stock.
- Finalised invoices are locked. Correct an unpaid invoice by voiding it, then
  duplicating it as a draft. For paid invoices use Returns & Credit Notes.
- Duplicate creates a DRAFT, clears credits and does not change stock.
- Void restores invoice stock (or reverses purchase stock) exactly once.
  Payments, returns, refunds and credit allocations protect linked documents.
- Record real customer/vendor payments. Overpayments appear as available
  customer credit or vendor advance on the corresponding Payments page.
- Allocate credit to another outstanding document for the SAME named account.
  Manual/walk-in accounts cannot transfer credits to unrelated people.
- A return selects an ORIGINAL INVOICE LINE. Quantity, discount and HST are
  prorated from that line. It creates a credit note, not an automatic cash refund.
- After money is actually refunded, record the refund in Payments. Credits
  cannot be refunded or allocated twice. Refund/transfer actions are dated today.
- Damaged returns can be credited without restocking; their stock cost remains.
- Inventory quantity edits and CSV opening quantities create ledger movements.
- Do not enter the same cost both as a purchase bill and as an expense.
- Product standard cost is maintained manually. Purchasing does not silently
  replace that cost; finalised sales snapshot the current standard cost.

REPORTS
-------
Net revenue excludes HST and return credits. HST subtracts the tax on V6 credit
notes. Inventory purchases do not immediately become an operating expense;
standard cost of sold goods is used instead. Non-inventory purchase lines and
net operating expenses are deducted. Custom/service invoice lines carry zero
inventory cost; enter their other costs as expenses.

Operating Estimate is a STANDARD-COST bookkeeping estimate, not FIFO,
weighted-average accounting, a formal financial statement, or a tax return.
Tax credit eligibility is not assessed. Voided documents are excluded from
live reports; past periods are not locked. Aging and inventory valuation are
CURRENT snapshots even when the sales report uses an earlier date range.
Statements include opening and running balances, credit notes, allocations,
payments and refunds. Negative net balances mean credit/advance available.

BACKUPS AND DATA SAFETY
----------------------
- Settings > Download Full Backup saves all records as JSON.
- Download Previous Save exports the previous successful V6 database snapshot.
- Restore/reset starts a backup download before changing the active data.
- Keep independent backups; clearing browser data removes local records.
- Restore validates structure, IDs, money, dates and new document references.
- A failed save does not publish partially changed invoice/stock state.
- If another tab saved after this page opened, reload before retrying your form.
- No cloud sync, authenticated users, roles, receipt attachments or immutable
  audit log are claimed. Browser storage is editable by the device owner.
- A corrupted database is preserved and blocked from accidental overwrite.
  Settings offers raw export and restore to recover it.

CSV IMPORT
----------
Contacts: name,email,phone,address,contact,notes
Products: name,sku,qty,cost,price,low,unit
Name is required. IDs are generated; imported IDs are never trusted.
Duplicate email/SKU rows are skipped. Invalid rows reject the entire import.
CSV exports neutralise spreadsheet formula prefixes for safer opening.

PROJECT STRUCTURE
-----------------
index.html / pages/          Page markup only
assets/css/                 Screen and invoice print styling
assets/js/pages/            Separate page controllers and shared form helpers
assets/js/services/         Transactions, calculations, ledger, reports, printing
assets/js/repositories/     Atomic commit and stale-tab conflict checks
assets/js/storage/          Validation, migration and database loading
assets/js/core/             Constants and shared utilities
assets/js/firebase.js       Disabled cloud placeholder

TESTS
-----
With Node 20+ installed, run: node --test tests/core.test.js
Optional DOM tests: install jsdom for development, then run:
    node --experimental-vm-modules tests/dom-smoke.cjs
Neither Node nor jsdom is needed to use the hosted application.
See TEST-REPORT.md for the checks performed and remaining visual QA limits.
