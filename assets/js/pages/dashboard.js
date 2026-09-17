import {
  $,
  db,
  money,
  sum,
  esc,
  posted,
  invoiceBalance,
  invoiceStatus,
  purchaseBalance,
  creditBalance,
} from "../app.js";
const invoices = db.invoices.filter(posted),
  purchases = db.purchases.filter(posted);
const sales =
  sum(invoices, (x) => x.subtotal - Number(x.discount || 0)) -
  sum(
    db.returns.filter((x) => !x.legacy),
    (r) => r.net,
  );
$("kpis").innerHTML = [
  ["Net Sales", money(sales), "Excludes HST, drafts and voids"],
  [
    "Receivables",
    money(sum(invoices, invoiceBalance)),
    "Unpaid invoice balances",
  ],
  ["Payables", money(sum(purchases, purchaseBalance)), "Unpaid vendor bills"],
  [
    "Customer Credits",
    money(sum(invoices, (i) => creditBalance(i))),
    "Available to allocate or refund",
  ],
]
  .map(
    (x) =>
      `<div class="card kpi"><span>${x[0]}</span><strong>${x[1]}</strong><em>${x[2]}</em></div>`,
  )
  .join("");
$("recent").innerHTML =
  db.invoices
    .slice(-6)
    .reverse()
    .map(
      (x) =>
        `<p><b>${esc(x.number)}</b> · ${esc(x.customerName)} <span>${money(x.total)} · ${esc(invoiceStatus(x))}</span></p>`,
    )
    .join("") || '<div class="empty">No invoices yet.</div>';
const lows = db.products.filter(
  (x) => Number(x.qty) <= Number(x.low ?? db.settings.lowStockDefault),
);
$("low").innerHTML =
  lows
    .map((x) => `<p>${esc(x.name)} · <b>${esc(x.qty)} remaining</b></p>`)
    .join("") || '<div class="empty">Stock levels look good.</div>';
$("receivables").innerHTML =
  invoices
    .filter((i) => invoiceBalance(i) > 0)
    .sort((a, b) => invoiceBalance(b) - invoiceBalance(a))
    .slice(0, 6)
    .map(
      (x) =>
        `<p>${esc(x.customerName)} · ${esc(x.number)} <b>${money(invoiceBalance(x))}</b></p>`,
    )
    .join("") || '<div class="empty">No outstanding balances.</div>';
$("snapshot").innerHTML = [
  ["Customers", db.customers.length],
  ["Vendors", db.vendors.length],
  ["Inventory SKUs", db.products.length],
  ["Draft invoices", db.invoices.filter((x) => x.state === "draft").length],
]
  .map(([k, v]) => `<p class="metric">${k} <b>${v}</b></p>`)
  .join("");
