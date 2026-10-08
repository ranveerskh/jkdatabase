import test from "node:test";
import assert from "node:assert/strict";
import { blankDB, normalize } from "../assets/js/storage/local-storage.js";
import {
  MAX_RECORD_BYTES,
  MAX_TRANSACTION_WRITES,
  cloudRecordChanges,
  cloudRecords,
  databaseFromCloud,
  recordDocumentId,
} from "../assets/js/services/cloud-sync.js";

test("Firestore record documents hydrate a normalized V7 database", () => {
  const source = blankDB();
  source.settings.taxLabel = "GST";
  source.settings.hstRate = 5;
  source.customers.push({ id: "cus-1", name: "Customer" });
  source.invoices.push({
    id: "inv-1", number: "INV-0001", state: "posted", customerId: "cus-1",
    date: "2026-09-17", items: [], subtotal: 20, tax: 1, taxRate: 5,
    taxLabel: "GST", total: 21,
  });
  source.payments.push({ id: "pay-1", invoiceId: "inv-1", date: "2026-09-17", amount: 10 });
  source.returns.push({ id: "ret-1", invoiceId: "inv-1", date: "2026-09-17", amount: 5 });
  source.people.push({ id: "person-1", name: "Customer", roles: ["customer"] });
  source.audit.push({ id: "audit-1", action: "created" });
  const restored = normalize(
    databaseFromCloud(
      { revision: "revision-1", settings: source.settings },
      cloudRecords(source),
    ),
  );
  assert.equal(restored._rev, "revision-1");
  assert.equal(restored.settings.hstRate, 5);
  assert.equal(restored.customers[0].name, "Customer");
  assert.equal(restored.invoices[0].taxRate, 5);
  assert.equal(restored.invoices[0].taxLabel, "GST");
  assert.equal(restored.payments[0].invoiceId, restored.invoices[0].id);
  assert.equal(restored.returns[0].invoiceId, restored.invoices[0].id);
  assert.equal(restored.audit[0].action, "created");
  assert.deepEqual(restored.people[0].roles, ["customer"]);
});

test("cloud diff contains added, changed, and deleted financial records", () => {
  const before = blankDB();
  before.invoices = [
    { id: "inv-keep", number: "INV-1", total: 10 },
    { id: "inv-delete", number: "INV-2", total: 12 },
  ];
  const after = structuredClone(before);
  after.invoices = [
    { id: "inv-keep", number: "INV-1", total: 11 },
    { id: "inv-new", number: "INV-3", total: 14 },
  ];
  const changes = cloudRecordChanges(before, after);
  assert.deepEqual(
    changes.map(({ operation, id }) => [operation, id]),
    [
      ["set", "inv-keep"],
      ["delete", "inv-delete"],
      ["set", "inv-new"],
    ],
  );
  assert.equal(changes[0].value.total, 11);
});

test("Firestore document IDs encode separators and reject oversized records", () => {
  assert.equal(recordDocumentId("customers", "a/b"), "customers__a%2Fb");
  assert.throws(
    () => cloudRecords({ ...blankDB(), products: [{ id: "product-1", note: "x".repeat(MAX_RECORD_BYTES) }] }),
    /too large for Firestore/,
  );
});

test("cloud transaction diff enforces Firestore's atomic write ceiling", () => {
  const before = blankDB();
  before.customers = Array.from({ length: MAX_TRANSACTION_WRITES }, (_, n) => ({
    id: `customer-${n}`,
    name: `Customer ${n}`,
  }));
  const after = structuredClone(before);
  after.customers = [];
  assert.throws(() => cloudRecordChanges(before, after), /safe per-save limit/);

  before.customers.pop();
  assert.equal(cloudRecordChanges(before, after).length, MAX_TRANSACTION_WRITES - 1);
});
