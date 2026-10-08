JK Database V7.2.3 Cloud Edition
==============================

What V7 is
----------
JK Database V7.2 is a Firebase-authenticated business app built around one rule:
enter the deal once, then let the app update the related customer/vendor, document,
payment, balance, stock ledger, audit history and dashboard automatically.

Start
-----
Open the Netlify site at /admin (or /login.html) and sign in with the user created in
Firebase Authentication. For local development, run START-WINDOWS.cmd and open
http://localhost:8000/admin. Login requires a network connection to Firebase.

First-time Firebase setup
-------------------------
1. Firebase Console > Authentication > Sign-in method: enable Email/Password. Create
   the administrator user there; this app does not expose public account creation.
   Authentication > Settings > Authorized domains: add the Netlify site's host name.
   Add localhost only if using the optional local-development server.
2. Firebase Console > Firestore > Rules: publish the rules in firestore.rules. The
   app denies data access until these rules and an administrator membership are active.
   With Firebase CLI, run: firebase deploy --only firestore:rules --project jkdatabase-35a49
3. Firebase Console > Firestore > Data: create the document
   businesses/jkdatabase-main/members/YOUR_AUTH_UID. Set fields role (string) = admin
   and active (boolean) = true. Copy YOUR_AUTH_UID from Authentication > Users. The
   user document is provisioned through the Firebase Console, not by client code.
4. Deploy the repository's main branch to Netlify. The included build copies the static
   app into dist, and netlify.toml routes /admin to the sign-in page.
5. Sign in. On the first visit, choose to import this browser's existing V7/V6 data or
   start a new cloud business. The browser database is retained as a recovery copy.

Each additional administrator must have their own Auth account and membership document.
This release grants the admin role only; Manager/Employee permissions are not enabled.

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

Invoices and tax
----------------
Invoices print with a clean commercial layout: seller and business details, a bordered
BILL TO section, invoice number/date, four-column item table, subtotal, named tax rate,
total and prominent Amount Due. The browser Print / Save PDF flow remains available.
Settings supplies the default tax name and rate; each sale or quote can override them.
The chosen rate and label are saved on the document, quotes retain them when converted,
and returns use the original invoice tax. Changing Settings does not rewrite past totals.

Invoice management
------------------
Draft invoices can be edited, duplicated, finalised or deleted. Finalised invoices can
be previewed, duplicated or cancelled when eligible. A final invoice with no linked payments, credits,
returns or transfers can be edited through a controlled workflow that reverses and
reposts stock and stores before/after values in audit history. Invoices with dependent
financial history are protected and the action menu explains why.

V6 upgrade
----------
V7 stores active data under jkDatabaseV7. If no V7 database exists, a valid V6 database
can be migrated once into V7. Customers and vendors are linked into unified People
profiles. The V6 browser key is left untouched as a fallback source; once a V7 marker
exists, older data is not silently resurrected.

Backups and safety
------------------
Settings > Data tools can download and restore backups. Restore validates data before
commit. Cloud transactions are atomic, duplicate/stale saves are guarded, invalid CSV imports
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

Cloud data and sync
-------------------
Each business is isolated below businesses/{businessId}. V7 records are stored as
individual Firestore documents, with Settings and the current revision in state/current.
Every save updates changed records and the revision in one Firestore transaction. If a
different device saves first, the stale page is blocked and must reload before saving.
After a change on another device, reload to read its latest data. Firestore writes are
limited to 498 changed records per save; large CSV imports or restores must be split.
The Firebase client config is public web-app configuration; Firestore Security Rules
require a signed-in UID with an active administrator membership for business data.

Netlify
-------
Connect the GitHub repository's main branch to Netlify. The included netlify.toml runs
`npm run build` and publishes `dist`. The /admin route opens administrator sign-in.

Not in this release
-------------------
Firebase Storage for uploaded files, Manager/Employee roles, real-time live update
listeners, server-backed audit history and subscription billing are not enabled yet.

Version: 7.2.3-cloud

V7.2.3 kiosk and form-submission hotfix
---------------------------------
Normal page navigation and successful saves keep the signed-in session and loaded
cloud database. Firebase Auth and membership are checked when opening the app;
Firestore Rules still enforce authorization on every cloud read/write. Reload after
another device changes data. Normal navigation does not repeat the full access screen.

Add line adds a transaction row. Create product creates an inventory product and
selects it in the transaction. Each line has quantity, unit of measure, and price/cost
per unit. Unit labels (pcs, kg, box, etc.) are stored with new documents and do not
multiply stock quantities. Existing historical documents and totals are not rewritten.
Quote expiry dates are shown only for quotes, not sales. Cancellation is offered only
when eligible; payments/returns require the Return / credit note workflow instead.

Developer verification
----------------------
npm test: 51 business, printing, migration and cloud helper tests.
npm run check: JavaScript syntax, HTML links and duplicate IDs.
npm run build: static Netlify output.
V7.2.3 adds a product kiosk to Sales: search by name/SKU/barcode, tap to add, or scan/type a barcode. Optional compressed product photos appear as sale tiles. Blank payment references default to the invoice number.
For browser tests: npx playwright install chromium, then npm run test:ui. These tests
use isolated Firebase fixtures; they never write records to the production project.
