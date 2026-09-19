JK Database V7 Local
====================

What V7 is
----------
JK Database V7 is an offline/local browser business app built around one rule:
enter the deal once, then let the app update the related customer/vendor, document,
payment, balance, stock ledger, audit history and dashboard automatically.

Start
-----
Windows: run START-WINDOWS.cmd, or serve this folder with any simple local web server
and open index.html through that server.

Daily menu
----------
Home
Sales
Purchases
People
Products / Inventory
Expenses
Reports
Settings

Daily flow
----------
Sale: Sales > New Sale > customer > items > payment > Save Sale.
Quote: Sales > New Quote > save; stock/payment are untouched until Convert to Sale.
Purchase: Purchases > New Purchase > vendor > items > payment > Save Purchase.
New customers/vendors are automatically created and linked to one unified People profile.

Payments
--------
Full, Partial and Unpaid are available inside the Sale/Purchase form. Full defaults to
the deal total. Later payments default to the remaining balance. Overpayments become
customer credit/vendor advance and can be allocated or refunded through the supported
credit tools.

Inventory
---------
Posted sales reduce stock, posted purchases increase stock, returns can restock, voids
reverse eligible stock movements, and manual adjustments are recorded in the stock
ledger. Negative stock is blocked by default unless enabled in Settings.

Invoices
--------
V7 uses a professional print layout with business logo/details, customer information,
items, totals, paid/credit/balance information and terms. Final documents keep a
business-profile snapshot/reference so later Settings changes do not rewrite historical
invoice identity.

V6 upgrade
----------
V7 stores active data under jkDatabaseV7. If no V7 database exists, a valid V6 database
can be migrated once into V7. Customers and vendors are linked into unified People
profiles. The V6 browser key is left untouched as a fallback source; once a V7 marker
exists, older data is not silently resurrected.

Backups and safety
------------------
Settings > Data tools can download and restore backups. Restore validates data before
commit. Transactions are atomic, duplicate/stale saves are guarded, invalid CSV imports
roll back fully, formula-style CSV values are rejected, posted financial history is
protected, and linked products/documents cannot be casually deleted.

Reports
-------
Reports include sales, purchases, expenses, operating estimate, HST summary,
receivables/payables, credits/advances, inventory valuation, sales by product/customer,
and expenses by category. Operating Estimate is a standard-cost business estimate, not
a formal tax return or accounting statement.

iPad
----
The V7 UI includes a drawer menu, touch-size controls, responsive deal forms, sticky
actions, card-based records and print/PDF-friendly document preview for iPad Safari.

Advanced tools
--------------
Stock Ledger, Customer/Vendor Statements, Audit Log, CSV tools and recovery functions
are kept under Settings/advanced workflows instead of crowding the main daily menu.

Future cloud path
-----------------
The local app is structured so the business flow can later be backed by Firebase Auth,
Firestore, Storage, multi-user roles, multi-device sync, cloud backup and subscriptions
without redesigning the daily Sale/Purchase forms.

Version: 7.0.0-local
