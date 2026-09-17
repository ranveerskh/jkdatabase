import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
const memory = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    if (failWrites && k === "jkDatabaseV6") throw Error("Quota");
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
  const old = memory.get("jkDatabaseV6");
  memory.set("jkDatabaseV6", "changed");
  await assert.rejects(() => sale(), /another tab/);
  assert.equal(memory.get("jkDatabaseV6"), "changed");
  memory.set("jkDatabaseV6", old);
});
test("reset keeps empty V6 marker, preventing legacy resurrection", async () => {
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
  assert.ok(memory.has("jkDatabaseV6"));
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
