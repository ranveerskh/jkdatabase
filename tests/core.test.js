import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
const memory = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    if (failWrites && k === "jkDatabaseV7") throw Error("Quota");
    memory.set(k, String(v));
  },
  removeItem: (k) => memory.delete(k),
};
Object.defineProperty(globalThis, "navigator", {
  value: { locks: { request: async (_name, fn) => fn() } },
  configurable: true,
});
const repo = await import("../assets/js/repositories/db.js");
const storage = await import("../assets/js/storage/local-storage.js");
const B = await import("../assets/js/services/business-service.js");
const F = await import("../assets/js/services/finance-service.js");
const R = await import("../assets/js/services/report-service.js");
let c, v, p;
const date = "2026-09-17";
const input = () => ({ date, dueDate: date, customerId: c, discount: 0 });
const line = (qty = 1) => [
  { productId: p, qty, price: 10, description: "Widget" },
];
const sale = async (qty = 1, post = true) =>
  B.saveInvoice(input(), line(qty), post);
const printService = await import("../assets/js/services/print-service.js");
function previewWindow() {
  let html = "", printHandler, prints = 0;
  return {
    document: {
      open: () => { html = ""; },
      write: (value) => { html += value; },
      close: () => {},
      getElementById: () => ({ addEventListener: (_event, callback) => { printHandler = callback; } }),
    },
    print: () => { prints++; },
    get html() { return html; },
    get prints() { return prints; },
    clickPrint: () => printHandler(),
  };
}
beforeEach(async () => {
  failWrites = false;
  await repo.replaceDB(storage.blankDB());
  c = await B.saveMaster("customers", {
    name: "Customer",
    email: "a@example.test",
  });
  v = await B.saveMaster("vendors", { name: "Vendor" });
  p = await B.saveMaster("products", {
    name: "Widget",
    sku: "W1",
    qty: 10,
    cost: 4,
    price: 10,
    low: 2,
  });
});
test("finalised sale has rounded tax, stock ledger and cost snapshot", async () => {
  const id = await sale(2);
  const i = repo.db.invoices.find((x) => x.id === id);
  assert.equal(i.total, 22.6);
  assert.equal(repo.db.products[0].qty, 8);
  assert.equal(i.items[0].unitCost, 4);
  assert.equal(repo.db.stockLedger[0].reference, i.number);
});
test("invoice preview renders stored tax, units and payment/return balance instead of stalling", async () => {
  const id = await B.saveInvoice({ ...input(), taxRate: 5, taxLabel: "GST" }, [{ ...line(2)[0], unit: "box" }], true);
  await B.savePayment("customer", { invoiceId: id, amount: 5, date, method: "Cash" });
  await B.saveReturn({ invoiceId: id, lineId: repo.db.invoices[0].items[0].lineId, qty: 1, date, restock: "yes", reason: "Return" });
  const window = previewWindow();
  assert.equal(printService.printInvoice(id, window), window);
  assert.match(window.html, /<h1>INVOICE<\/h1>/);
  assert.match(window.html, /GST \(5%\)/);
  assert.match(window.html, /2 box/);
  assert.match(window.html, /Amount Due<\/b><strong>\$5\.50/);
  assert.doesNotMatch(window.html, /Preparing document|Pay Online/);
  window.clickPrint();
  assert.equal(window.prints, 1);
});
test("invoice and quote units stay stored after a product unit changes and through backup", async () => {
  await B.saveMaster("products", { ...repo.db.products[0], unit: "kg" });
  const quote = await B.saveSaleDeal({ dealType: "quote", customerId: c, date, validUntil: date, taxRate: 0 }, line(2));
  await B.saveMaster("products", { ...repo.db.products[0], unit: "box" });
  const id = await B.convertQuoteToSale(quote.id);
  assert.equal(repo.db.invoices.find((i) => i.id === id).items[0].unit, "kg");
  assert.equal(repo.db.products[0].qty, 8);
  const restored = storage.normalize(JSON.parse(JSON.stringify(repo.db)));
  assert.equal(restored.invoices.find((i) => i.id === id).items[0].unit, "kg");
  assert.equal(restored.invoices.find((i) => i.id === id).total, 20);
});
test("cancel availability matches accounting safeguards for payments, returns and used purchase stock", async () => {
  const id = await sale(2);
  assert.equal(B.documentCancelBlockReason(repo.db, "invoices", id), "");
  await B.savePayment("customer", { invoiceId: id, amount: 1, date, method: "Cash" });
  assert.match(B.documentCancelBlockReason(repo.db, "invoices", id), /linked/);
  await assert.rejects(() => B.voidDocument("invoices", id), /Return \/ credit note/);
  const other = await sale(1);
  await B.saveReturn({ invoiceId: other, lineId: repo.db.invoices.find((i) => i.id === other).items[0].lineId, qty: 1, date, restock: "yes", reason: "Return" });
  assert.match(B.documentCancelBlockReason(repo.db, "invoices", other), /linked/);
  const purchase = await B.savePurchase({ vendorId: v, date, dueDate: date }, line(10));
  await sale(9);
  assert.match(B.documentCancelBlockReason(repo.db, "purchases", purchase), /stock has already been used/);
  await assert.rejects(() => B.voidDocument("purchases", purchase), /stock has already been used/);
});
test("invoice accepts zero and custom rates and keeps its tax after Settings changes", async () => {
  assert.equal(B.totals(repo.db, line(), 0, 0).tax, 0);
  assert.equal(B.totals(repo.db, line(), 0, 5).tax, 0.5);
  assert.equal(B.totals(repo.db, line(), 0, 15).tax, 1.5);
  assert.equal(B.totals(repo.db, line(), 0, 7.25).tax, 0.73);
  assert.equal(B.totals(repo.db, line(), 0, 5.123).taxRate, 5.123);
  await assert.rejects(() => B.saveInvoice({ ...input(), taxRate: -0.01 }, line(), true), /between 0 and 100/);
  await assert.rejects(() => B.saveInvoice({ ...input(), taxRate: 100.01 }, line(), true), /between 0 and 100/);
  const id = await B.saveInvoice({ ...input(), taxRate: "5.00", taxLabel: "TAX" }, line(2), true);
  const saved = repo.db.invoices.find((x) => x.id === id);
  assert.equal(saved.taxRate, 5);
  assert.equal(saved.taxLabel, "TAX");
  assert.equal(saved.tax, 1);
  assert.equal(saved.total, 21);
  await B.saveSettings({ ...repo.db.settings, hstRate: 15, taxLabel: "GST", currency: "CAD", allowNegativeStock: "false" });
  assert.equal(repo.db.invoices.find((x) => x.id === id).taxRate, 5);
  assert.equal(repo.db.invoices.find((x) => x.id === id).taxLabel, "TAX");
  assert.equal(repo.db.invoices.find((x) => x.id === id).total, 21);
  const preciseId = await B.saveInvoice({ ...input(), taxRate: "5.123", taxLabel: "Custom" }, line(), true);
  const precise = repo.db.invoices.find((x) => x.id === preciseId);
  assert.equal(precise.taxRate, 5.123);
  assert.equal(precise.tax, 0.51);
});
test("quote conversion preserves selected tax name and rate", async () => {
  const result = await B.saveSaleDeal({
    dealType: "quote", customerId: c, date, validUntil: date,
    discount: 0, taxRate: 5, taxLabel: "GST",
  }, line(2));
  const quote = repo.db.quotes.find((x) => x.id === result.id);
  assert.equal(quote.taxRate, 5);
  assert.equal(quote.taxLabel, "GST");
  await B.saveSettings({ ...repo.db.settings, hstRate: 15, taxLabel: "HST", currency: "CAD", allowNegativeStock: "false" });
  const id = await B.convertQuoteToSale(quote.id);
  const invoice = repo.db.invoices.find((x) => x.id === id);
  assert.equal(invoice.taxRate, 5);
  assert.equal(invoice.taxLabel, "GST");
  assert.equal(invoice.tax, 1);
  assert.equal(invoice.total, 21);
});
test("legacy quote form preserves custom tax when converted to a draft invoice", async () => {
  await B.saveQuote({
    customerId: c, date, validUntil: date, subtotal: 20, discount: 0,
    description: "Consulting", taxRate: 5, taxLabel: "GST",
  });
  const quote = repo.db.quotes[0];
  await B.saveSettings({ ...repo.db.settings, hstRate: 15, taxLabel: "HST", currency: "CAD", allowNegativeStock: "false" });
  await B.convertQuote(quote.id);
  const invoice = repo.db.invoices[0];
  assert.equal(invoice.state, "draft");
  assert.equal(invoice.taxRate, 5);
  assert.equal(invoice.taxLabel, "GST");
  assert.equal(invoice.tax, 1);
  assert.equal(invoice.total, 21);
});
test("return credit uses the original invoice line tax after Settings changes", async () => {
  const id = await B.saveInvoice({ ...input(), taxRate: 5, taxLabel: "GST" }, line(2), true);
  const invoice = repo.db.invoices.find((x) => x.id === id);
  await B.saveSettings({ ...repo.db.settings, hstRate: 15, taxLabel: "HST", currency: "CAD", allowNegativeStock: "false" });
  const returnId = await B.saveReturn({ invoiceId: id, lineId: invoice.items[0].lineId, qty: 1, date, reason: "Return" , restock: "yes" });
  const credit = repo.db.returns.find((x) => x.id === returnId);
  assert.equal(credit.tax, 0.5);
  assert.equal(credit.amount, 10.5);
  assert.equal(repo.db.invoices.find((x) => x.id === id).taxRate, 5);
  assert.equal(repo.db.products[0].qty, 9);
});
test("unlinked final invoice edit reverses and reposts stock with audit snapshots", async () => {
  const id = await B.saveInvoice({ ...input(), taxRate: 5, taxLabel: "GST" }, line(2), true);
  const original = structuredClone(repo.db.invoices.find((x) => x.id === id));
  assert.equal(B.invoiceEditBlockReason(repo.db, id), "");
  await B.saveInvoice({ ...input(), id, taxRate: 15, taxLabel: "HST" }, line(3), true);
  const edited = repo.db.invoices.find((x) => x.id === id);
  assert.equal(edited.number, original.number);
  assert.equal(edited.total, 34.5);
  assert.equal(edited.taxRate, 15);
  assert.equal(repo.db.products[0].qty, 7);
  assert.deepEqual(repo.db.stockLedger.filter((x) => x.reference === edited.number).map((x) => x.qty), [-3, 2, -2]);
  const revision = repo.db.audit.find((x) => x.action === "Invoice revised");
  assert.equal(revision.before.total, 21);
  assert.equal(revision.after.total, 34.5);
  await assert.rejects(() => B.deleteRecord("invoices", id), /retained/);
});
test("final invoice edit that exceeds available stock rolls back all effects", async () => {
  const id = await B.saveInvoice({ ...input(), taxRate: 5, taxLabel: "GST" }, line(2), true);
  await B.saveInvoice(input(), line(8), true);
  const before = JSON.stringify(repo.db);
  await assert.rejects(() => B.saveInvoice({ ...input(), id, taxRate: 5, taxLabel: "GST" }, line(5), true), /Not enough stock/);
  assert.equal(JSON.stringify(repo.db), before);
});
test("linked payments and returns block final invoice edits", async () => {
  const paidId = await B.saveInvoice({ ...input(), taxRate: 5, taxLabel: "GST" }, line(2), true);
  await B.savePayment("customer", { invoiceId: paidId, date, amount: 5 });
  await assert.rejects(
    () => B.saveInvoice({ ...input(), id: paidId, taxRate: 5, taxLabel: "GST" }, line(1), true),
    /linked payments, returns, credits/,
  );

  const returnedId = await B.saveInvoice({ ...input(), taxRate: 5, taxLabel: "GST" }, line(), true);
  const returnedInvoice = repo.db.invoices.find((x) => x.id === returnedId);
  await B.saveReturn({ invoiceId: returnedId, lineId: returnedInvoice.items[0].lineId, qty: 1, date, reason: "Return", restock: "no" });
  await assert.rejects(
    () => B.saveInvoice({ ...input(), id: returnedId, taxRate: 5, taxLabel: "GST" }, line(), true),
    /linked payments, returns, credits/,
  );
});
test("combined duplicate product quantities reject atomically", async () => {
  await assert.rejects(
    () => B.saveInvoice(input(), [...line(6), ...line(6)], true),
    /Not enough stock/,
  );
  assert.equal(repo.db.invoices.length, 0);
  assert.equal(repo.db.products[0].qty, 10);
  assert.equal(repo.db.settings.nextInvoice, 1);
});
test("draft, edit, finalise, and duplicate all have correct stock effects", async () => {
  const id = await sale(2, false);
  assert.equal(repo.db.products[0].qty, 10);
  await B.saveInvoice({ ...input(), id }, line(3), false);
  await B.finaliseInvoice(id);
  assert.equal(repo.db.products[0].qty, 7);
  await assert.rejects(() => B.finaliseInvoice(id), /already/);
  const dup = await B.duplicateInvoice(id);
  assert.equal(repo.db.products[0].qty, 7);
  assert.equal(repo.db.invoices.find((x) => x.id === dup).state, "draft");
  assert.equal(F.invoiceBalance(repo.db.invoices.find((x) => x.id === dup)), 0);
});
test("void unpaid invoice restores stock and removes receivable", async () => {
  const id = await sale(2);
  await B.voidDocument("invoices", id);
  assert.equal(repo.db.products[0].qty, 10);
  assert.equal(F.invoiceBalance(repo.db.invoices[0]), 0);
  assert.equal(R.report(date, date).netSales, 0);
});
test("linked payments prevent invoice void or delete", async () => {
  const id = await sale();
  await B.savePayment("customer", { invoiceId: id, date, amount: 5 });
  await assert.rejects(() => B.voidDocument("invoices", id), /linked/);
  await assert.rejects(() => B.deleteRecord("invoices", id), /retained/);
});
test("purchase void reverses stock; used stock prevents reversal", async () => {
  const id = await B.savePurchase(
    { date, dueDate: date, vendorId: v, vendorBillNo: "vendor-1" },
    line(3),
  );
  assert.equal(repo.db.products[0].qty, 13);
  await B.voidDocument("purchases", id);
  assert.equal(repo.db.products[0].qty, 10);
  const id2 = await B.savePurchase(
    { date, vendorId: v, vendorBillNo: "vendor-2" },
    line(3),
  );
  await sale(12);
  await assert.rejects(
    () => B.voidDocument("purchases", id2),
    /stock has already/,
  );
  assert.equal(repo.db.products[0].qty, 1);
});
test("purchase vendor bill number duplicate blocked", async () => {
  await B.savePurchase({ date, vendorId: v, vendorBillNo: "ABC" }, line());
  await assert.rejects(
    () => B.savePurchase({ date, vendorId: v, vendorBillNo: "abc" }, line()),
    /already exists/,
  );
});
test("returns credit balance, restock and reverse tax exactly", async () => {
  const id = await sale(2),
    i = repo.db.invoices[0];
  await B.saveReturn({
    invoiceId: id,
    lineId: i.items[0].lineId,
    qty: 1,
    date,
    restock: "yes",
    reason: "Returned",
  });
  assert.equal(F.invoiceBalance(repo.db.invoices[0]), 11.3);
  assert.equal(repo.db.products[0].qty, 9);
  assert.equal(R.report(date, date).salesTax, 1.3);
  assert.equal(R.report(date, date).cogs, 4);
  await assert.rejects(
    () =>
      B.saveReturn({
        invoiceId: id,
        lineId: i.items[0].lineId,
        qty: 2,
        date,
        restock: "yes",
        reason: "Again",
      }),
    /Return quantity/,
  );
});
test("paid invoice return creates credit and refund consumes it", async () => {
  const id = await sale(),
    i = repo.db.invoices[0];
  await B.savePayment("customer", { invoiceId: id, date, amount: 11.3 });
  await B.saveReturn({
    invoiceId: id,
    lineId: i.items[0].lineId,
    qty: 1,
    date,
    restock: "no",
    reason: "Damaged",
  });
  assert.equal(F.creditBalance(repo.db.invoices[0]), 11.3);
  await B.refundCredit("customer", id, 11.3, date);
  assert.equal(F.creditBalance(repo.db.invoices[0]), 0);
  assert.equal(repo.db.products[0].qty, 9);
  await assert.rejects(
    () => B.refundCredit("customer", id, 1, date),
    /Refund amount/,
  );
});
test("overpayment is visible credit and can be allocated", async () => {
  const a = await sale(),
    b = await sale();
  await B.savePayment("customer", { invoiceId: a, date, amount: 20 });
  assert.equal(F.creditBalance(repo.db.invoices[0]), 8.7);
  await B.transferCredit("customer", a, b, 8.7, date);
  assert.equal(F.invoiceBalance(repo.db.invoices[1]), 2.6);
  assert.equal(F.creditBalance(repo.db.invoices[0]), 0);
  await assert.rejects(
    () => B.deleteRecord("payments", repo.db.payments[0].id),
    /transferred/,
  );
});
test("vendor overpayment is advance with transfer/refund protection", async () => {
  const a = await B.savePurchase({ date, vendorId: v }, line()),
    b = await B.savePurchase({ date, vendorId: v }, line());
  await B.savePayment("vendor", { purchaseId: a, date, amount: 20 });
  await B.transferCredit("vendor", a, b, 5, date);
  assert.equal(F.creditBalance(repo.db.purchases[0], "vendor"), 3.7);
  await B.refundCredit("vendor", a, 3.7, date);
  assert.equal(F.purchaseBalance(repo.db.purchases[1]), 6.3);
});
test("different customer credits cannot be transferred", async () => {
  const a = await sale();
  const c2 = await B.saveMaster("customers", { name: "Other" });
  const b = await B.saveInvoice({ ...input(), customerId: c2 }, line(), true);
  await B.savePayment("customer", { invoiceId: a, date, amount: 20 });
  await assert.rejects(
    () => B.transferCredit("customer", a, b, 1, date),
    /same customer/,
  );
});
test("negative adjustment respects setting and edits create ledger", async () => {
  await assert.rejects(
    () => B.adjustStock({ productId: p, qty: -11, reason: "Count" }),
    /Not enough/,
  );
  await B.saveMaster("products", { ...repo.db.products[0], qty: 7 });
  assert.equal(repo.db.stockLedger[0].qty, -3);
  assert.equal(repo.db.stockLedger[0].balance, 7);
});
test("linked master records cannot be deleted", async () => {
  await sale();
  await assert.rejects(() => B.deleteRecord("customers", c), /linked/);
  await assert.rejects(() => B.deleteRecord("products", p), /history/);
});
test("customer and product edits remain available with guarded deletion", async () => {
  await B.saveMaster("customers", { id: c, name: "Renamed Customer", email: "a@example.test" });
  assert.equal(repo.db.customers.find((x) => x.id === c).name, "Renamed Customer");
  const unusedCustomer = await B.saveMaster("customers", { name: "Temporary Customer" });
  await B.deleteRecord("customers", unusedCustomer);
  assert.equal(repo.db.customers.some((x) => x.id === unusedCustomer), false);

  await B.saveMaster("products", { id: p, name: "Renamed Widget", sku: "W1", qty: 10, cost: 4, price: 12, low: 2 });
  assert.equal(repo.db.products.find((x) => x.id === p).price, 12);
  await assert.rejects(() => B.deleteRecord("products", p), /history/);
  const unusedProduct = await B.saveMaster("products", { name: "Temporary Item", sku: "TEMP-1", qty: 0, cost: 1, price: 2, low: 1 });
  await B.saveMaster("products", { id: unusedProduct, name: "Updated Temporary Item", sku: "TEMP-1", qty: 0, cost: 1, price: 3, low: 1 });
  assert.equal(repo.db.products.find((x) => x.id === unusedProduct).price, 3);
  await B.deleteRecord("products", unusedProduct);
  assert.equal(repo.db.products.some((x) => x.id === unusedProduct), false);
});
test("CSV imports are atomic, generate unique IDs and ledger", async () => {
  await assert.rejects(
    () =>
      B.importMasters("products", [
        ["name", "qty", "cost"],
        ["Good", "3", "1"],
        ["Bad", "not-a-number", "1"],
      ]),
    /No rows/,
  );
  assert.equal(repo.db.products.length, 1);
  await B.importMasters("products", [
    ["id", "name", "sku", "qty", "cost", "price"],
    ["fake", "New", "N1", "2", "1", "2"],
  ]);
  assert.notEqual(repo.db.products[1].id, "fake");
  assert.equal(repo.db.stockLedger[0].type, "Opening");
  const x = await B.importMasters("products", [
    ["name", "sku", "qty"],
    ["Duplicate", "N1", "9"],
  ]);
  assert.equal(x.skipped, 1);
});
test("number reuse prevented after counter changed", async () => {
  await sale();
  await repo.transaction((d) => (d.settings.nextInvoice = 1));
  await sale();
  assert.deepEqual(
    repo.db.invoices.map((i) => i.number),
    ["INV-0001", "INV-0002"],
  );
});
test("quotes convert once into drafts with discount counted once", async () => {
  await B.saveQuote({
    ...input(),
    validUntil: date,
    subtotal: 100,
    discount: 10,
    description: "Services",
  });
  const q = repo.db.quotes[0];
  await B.convertQuote(q.id);
  assert.equal(repo.db.invoices[0].total, 101.7);
  assert.equal(repo.db.invoices[0].items[0].price, 100);
  assert.equal(repo.db.invoices[0].state, "draft");
  await assert.rejects(() => B.convertQuote(q.id), /already/);
});
test("expense and date validations reject invalid entries", async () => {
  await assert.rejects(
    () =>
      B.saveExpense({
        date,
        amount: 10,
        tax: 11,
        payee: "Vendor",
        category: "Other",
      }),
    /Included HST/,
  );
  await assert.rejects(
    () => B.saveInvoice({ ...input(), date: "2026-02-30" }, line(), true),
    /date/,
  );
  await assert.rejects(
    () => B.saveInvoice({ ...input(), discount: 11 }, line(), true),
    /Discount/,
  );
});
test("statement opening and closing include credits refunds and payments", async () => {
  const id = await sale();
  await B.savePayment("customer", {
    invoiceId: id,
    date: "2026-09-18",
    amount: 20,
  });
  let s = R.statement("customer", c, "2026-09-18", "2026-09-18");
  assert.equal(s.opening, 11.3);
  assert.equal(s.closing, -8.7);
  assert.equal(s.current, -8.7);
});
test("reports exclude tax from operating expenses and use sold cost", async () => {
  await sale(2);
  await B.saveExpense({
    date,
    amount: 11.3,
    tax: 1.3,
    payee: "Phone",
    category: "Phone",
  });
  const r = R.report(date, date);
  assert.equal(r.netSales, 20);
  assert.equal(r.cogs, 8);
  assert.equal(r.netExpenses, 10);
  assert.equal(r.estimate, 2);
  assert.equal(r.netTax, 1.3);
});
test("penny allocation returns entire discounted amount exactly", async () => {
  const id = await B.saveInvoice(
      { ...input(), discount: 0.01 },
      [{ productId: p, qty: 3, price: 0.33 }],
      true,
    ),
    i = repo.db.invoices[0];
  for (let n = 0; n < 3; n++)
    await B.saveReturn({
      invoiceId: id,
      lineId: i.items[0].lineId,
      qty: 1,
      date,
      restock: "yes",
      reason: "Return",
    });
  assert.equal(
    Math.round(repo.db.returns.reduce((s, r) => s + r.amount, 0) * 100),
    Math.round(i.total * 100),
  );
  assert.equal(F.invoiceBalance(repo.db.invoices[0]), 0);
});
test("save failure rolls back all state", async () => {
  const prev = JSON.stringify(repo.db);
  failWrites = true;
  await assert.rejects(() => sale(), /Could not save/);
  assert.equal(JSON.stringify(repo.db), prev);
  failWrites = false;
});
test("stale tab save rejected without overwrite", async () => {
  const old = memory.get("jkDatabaseV7");
  memory.set("jkDatabaseV7", "changed");
  await assert.rejects(() => sale(), /another tab/);
  assert.equal(memory.get("jkDatabaseV7"), "changed");
  memory.set("jkDatabaseV7", old);
});
test("reset keeps empty V7 marker, preventing legacy resurrection", async () => {
  memory.set(
    "jkDatabaseV5",
    JSON.stringify({
      ...storage.blankDB(),
      version: 5,
      customers: [{ id: "old", name: "Old" }],
    }),
  );
  await repo.resetDB();
  assert.equal(storage.loadDB().customers.length, 0);
  assert.ok(memory.has("jkDatabaseV7"));
  memory.delete("jkDatabaseV5");
});
test("malformed backup rejected without changing active data", async () => {
  const previous = JSON.stringify(repo.db);
  await assert.rejects(
    () => repo.replaceDB({ ...storage.blankDB(), products: "invalid" }),
    /products/,
  );
  assert.equal(JSON.stringify(repo.db), previous);
  assert.throws(
    () =>
      storage.normalize({
        ...storage.blankDB(),
        payments: [{ id: "x", amount: "bad", date }],
      }),
    /amount/,
  );
});
test("valid backup roundtrip preserves records and references", async () => {
  await sale();
  const backup = JSON.parse(JSON.stringify(repo.db));
  await repo.resetDB();
  await repo.replaceDB(backup);
  assert.equal(repo.db.invoices.length, 1);
  assert.equal(repo.db.products[0].qty, 9);
});
test("legacy stock preserved with reconciliation marker and no fabricated profit", async () => {
  const old = {
    ...storage.blankDB(),
    version: 5,
    products: [{ id: "p", name: "Old product", qty: 5, cost: 4, price: 10 }],
    invoices: [
      {
        id: "old-i",
        number: "INV-1",
        date,
        total: 11.3,
        subtotal: 10,
        tax: 1.3,
        items: [{ productId: "p", qty: 1, price: 10, total: 10 }],
      },
    ],
  };
  const d = storage.normalize(old);
  assert.equal(d.products[0].qty, 5);
  assert.equal(d.stockLedger[0].type, "Migration reconciliation");
  assert.equal(R.report(date, date, d).estimate, null);
});


test("V7 one-save sale auto-creates person, customer, payment and stock movement", async () => {
  await repo.replaceDB(storage.blankDB());
  const prod = await B.saveMaster("products", { name: "V7 Widget", sku: "V7W", qty: 5, cost: 2, price: 10, low: 1 });
  const result = await B.saveSaleDeal({
    dealType: "sale", customerName: "Fresh Customer", phone: "519-555-1111", email: "fresh@example.test",
    date, dueDate: date, discount: 0, paymentPreset: "full", paymentMethod: "E-transfer", paymentDate: date,
  }, [{ productId: prod, qty: 2, price: 10, description: "V7 Widget" }]);
  assert.equal(result.kind, "invoice");
  assert.equal(repo.db.people.length, 1);
  assert.deepEqual(repo.db.people[0].roles, ["customer"]);
  assert.equal(repo.db.customers[0].personId, repo.db.people[0].id);
  assert.equal(repo.db.invoices[0].state, "posted");
  assert.equal(repo.db.payments[0].amount, 22.6);
  assert.equal(repo.db.products[0].qty, 3);
  assert.equal(F.invoiceBalance(repo.db.invoices[0]), 0);
});

test("V7 quote saves items without stock or payment and converts once to posted sale", async () => {
  await repo.replaceDB(storage.blankDB());
  const prod = await B.saveMaster("products", { name: "Quoted", sku: "Q1", qty: 3, cost: 1, price: 10, low: 1 });
  const q = await B.saveSaleDeal({ dealType: "quote", customerName: "Quote Person", date, validUntil: date, discount: 0 }, [{ productId: prod, qty: 2, price: 10, description: "Quoted" }]);
  assert.equal(q.kind, "quote");
  assert.equal(repo.db.products[0].qty, 3);
  assert.equal(repo.db.payments.length, 0);
  const invoiceId = await B.convertQuoteToSale(q.id);
  assert.equal(repo.db.products[0].qty, 1);
  assert.equal(repo.db.invoices.find((x)=>x.id===invoiceId).state, "posted");
  assert.equal(F.invoiceBalance(repo.db.invoices[0]), 22.6);
  await assert.rejects(() => B.convertQuoteToSale(q.id), /already/);
});

test("V7 purchase auto-creates vendor and records partial payment atomically", async () => {
  await repo.replaceDB(storage.blankDB());
  const prod = await B.saveMaster("products", { name: "Bought", sku: "B1", qty: 1, cost: 5, price: 10, low: 1 });
  const id = await B.savePurchaseDeal({ vendorName: "New Vendor", phone: "2265553333", date, dueDate: date, paymentPreset: "partial", paymentAmount: 5, paymentDate: date, paymentMethod: "Cash" }, [{ productId: prod, qty: 2, price: 5, description: "Bought" }]);
  assert.ok(id);
  assert.equal(repo.db.people[0].roles[0], "vendor");
  assert.equal(repo.db.products[0].qty, 3);
  assert.equal(repo.db.vendorPayments[0].amount, 5);
  assert.equal(F.purchaseBalance(repo.db.purchases[0]), 6.3);
});

test("V6 backup migrates to V7 people links without changing document totals", () => {
  const old = storage.blankDB();
  old.version = 6;
  old.people = undefined;
  old.customers = [{ id:"c-old", name:"Same Co", phone:"5195550000", email:"same@example.test" }];
  old.vendors = [{ id:"v-old", name:"Same Co", phone:"5195550000", email:"same@example.test" }];
  const d = storage.normalize(old);
  assert.equal(d.version, 7);
  assert.equal(d.people.length, 1);
  assert.deepEqual(new Set(d.people[0].roles), new Set(["customer","vendor"]));
  assert.equal(d.customers[0].personId, d.vendors[0].personId);
});

test("V7 same phone/email reuses one People profile across customer and vendor roles", async () => {
  await repo.replaceDB(storage.blankDB());
  const prod = await B.saveMaster("products", { name: "Shared", sku: "S1", qty: 5, cost: 2, price: 5, low: 1 });
  await B.saveSaleDeal({ dealType:"sale", customerName:"Dual Co", email:"dual@example.test", date, dueDate:date, paymentPreset:"unpaid" }, [{productId:prod,qty:1,price:5,description:"Shared"}]);
  await B.savePurchaseDeal({ vendorName:"Dual Co", email:"dual@example.test", date, dueDate:date, paymentPreset:"unpaid" }, [{productId:prod,qty:1,price:2,description:"Shared"}]);
  assert.equal(repo.db.people.length, 1);
  assert.deepEqual(new Set(repo.db.people[0].roles), new Set(["customer","vendor"]));
  assert.equal(repo.db.customers[0].personId, repo.db.vendors[0].personId);
});

test("V7 unsafe CSV formula prefixes reject the entire import", async () => {
  const before = repo.db.products.length;
  await assert.rejects(() => B.importMasters("products", [
    ["name","sku","qty","cost","price"],
    ["Safe","SAFE2","1","1","2"],
    ["=HYPERLINK(bad)","BAD2","1","1","2"],
  ]), /unsafe spreadsheet formula prefix/);
  assert.equal(repo.db.products.length, before);
});
