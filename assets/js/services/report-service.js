import { db } from "../repositories/db.js";
import { posted, signedBalance, returnTotal } from "./finance-service.js";
import { sum, round, dateValue } from "../core/utils.js";
export function report(from, to, d = db) {
  dateValue(from);
  dateValue(to);
  if (from > to) throw Error("From date must not follow To date.");
  const within = (x) => x.date >= from && x.date <= to,
    inv = d.invoices.filter((x) => posted(x) && within(x)),
    pur = d.purchases.filter((x) => posted(x) && within(x)),
    exp = d.expenses.filter(within),
    ret = d.returns.filter((x) => !x.legacy && within(x)),
    netSales = round(
      sum(inv, (x) => x.subtotal - Number(x.discount || 0)) -
        sum(ret, (x) => x.net),
    ),
    salesTax = round(sum(inv, (x) => x.tax) - sum(ret, (x) => x.tax)),
    purchaseTax = round(sum(pur, (x) => x.tax)),
    expenseTax = round(sum(exp, (x) => x.tax));
  const missingCost =
      inv.some((i) => i.items.some((x) => x.unitCost == null)) ||
      ret.some((r) => r.restock === "yes" && r.unitCost == null),
    cogs = missingCost
      ? null
      : round(
          sum(inv, (i) =>
            sum(i.items, (x) => Number(x.qty) * Number(x.unitCost)),
          ) -
            sum(
              ret.filter((r) => r.restock === "yes"),
              (r) => r.qty * r.unitCost,
            ),
        ),
    customPurchases = round(
      sum(pur, (p) =>
        sum(
          (p.items || []).filter((x) => !x.productId),
          (x) => x.net ?? x.total,
        ),
      ),
    ),
    netExpenses = round(sum(exp, (x) => x.amount - Number(x.tax || 0))),
    estimate =
      cogs == null
        ? null
        : round(netSales - cogs - netExpenses - customPurchases);
  const products = new Map(),
    customers = new Map(),
    categories = new Map();
  const add = (m, k, v) => m.set(k, round((m.get(k) || 0) + Number(v || 0)));
  for (const i of inv) {
    add(customers, i.customerName, i.subtotal - Number(i.discount || 0));
    for (const x of i.items)
      add(
        products,
        x.description,
        x.net ??
          (x.total * (i.subtotal - Number(i.discount || 0))) /
            (i.subtotal || 1),
      );
  }
  for (const r of ret) {
    const i = d.invoices.find((i) => i.id === r.invoiceId);
    add(customers, i?.customerName || "Unknown customer", -r.net);
    add(products, r.description || "Legacy item", -r.net);
  }
  for (const x of exp)
    add(categories, x.category, x.amount - Number(x.tax || 0));
  return {
    inv,
    pur,
    ret,
    exp,
    netSales,
    salesTax,
    purchaseTax,
    expenseTax,
    netTax: round(salesTax - purchaseTax - expenseTax),
    cogs,
    customPurchases,
    netExpenses,
    estimate,
    purchases: round(sum(pur, (p) => p.subtotal)),
    products,
    customers,
    categories,
    legacyReturns: d.returns.filter((r) => r.legacy && within(r)).length,
  };
}
export function statement(side, accountId, from, to, d = db) {
  dateValue(from);
  dateValue(to);
  if (from > to) throw Error("Invalid date range.");
  const customer = side === "customer",
    docs = d[customer ? "invoices" : "purchases"].filter(
      (i) => posted(i) && (customer ? i.customerId : i.vendorId) === accountId,
    ),
    ids = new Set(docs.map((i) => i.id)),
    events = [];
  const add = (date, kind, ref, value) =>
    events.push({ date, kind, ref, value: round(value) });
  for (const i of docs) {
    add(i.date, customer ? "Invoice" : "Purchase", i.number, i.total);
    if (customer && i.creditApplied)
      add(i.date, "Imported applied credit", i.number, -i.creditApplied);
  }
  for (const p of d[customer ? "payments" : "vendorPayments"])
    if (ids.has(customer ? p.invoiceId : p.purchaseId))
      add(p.date, "Payment", p.reference || p.method, -p.amount);
  if (customer)
    for (const r of d.returns)
      if (ids.has(r.invoiceId) && !r.legacy)
        add(r.date, "Credit note", r.number, -r.amount);
  for (const t of d.creditTransfers.filter((x) => x.side === side)) {
    if (ids.has(t.fromId))
      add(
        t.date,
        "Credit allocated out",
        docs.find((i) => i.id === t.fromId).number,
        t.amount,
      );
    if (ids.has(t.toId))
      add(
        t.date,
        "Credit allocated in",
        docs.find((i) => i.id === t.toId).number,
        -t.amount,
      );
  }
  for (const r of d.refunds)
    if (r.side === side && ids.has(r.documentId))
      add(
        r.date,
        customer ? "Refund paid" : "Refund received",
        docs.find((i) => i.id === r.documentId).number,
        r.amount,
      );
  events.sort((a, b) => a.date.localeCompare(b.date));
  const opening = round(
    sum(
      events.filter((x) => x.date < from),
      (x) => x.value,
    ),
  );
  let balance = opening;
  const rows = events
    .filter((x) => x.date >= from && x.date <= to)
    .map((x) => ({ ...x, balance: (balance = round(balance + x.value)) }));
  return {
    opening,
    closing: balance,
    rows,
    current: round(sum(docs, (i) => signedBalance(i, side, d))),
  };
}
