import {
  $,
  db,
  esc,
  money,
  sum,
  today,
  arAging,
  apAging,
  toast,
  posted,
  invoiceBalance,
  purchaseBalance,
  creditBalance,
} from "../app.js";
import { localDate } from "../core/utils.js";
import { report } from "../services/report-service.js";
const stat = (k, v) =>
  `<div class="statline"><span>${esc(k)}</span><b>${v == null ? "Cost unavailable" : money(v)}</b></div>`;
const grouped = (m) =>
  [...m]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => stat(k, v))
    .join("") || '<div class="empty">No data</div>';
$("from").value = localDate(
  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
);
$("to").value = today();
function render() {
  try {
    const r = report($("from").value, $("to").value);
    const invoices=db.invoices.filter(posted), purchases=db.purchases.filter(posted);
    $("cards").innerHTML = [
      ["Sales", r.netSales],
      ["Purchases", r.purchases],
      ["Expenses", r.netExpenses + r.customPurchases],
      ["Operating Estimate", r.estimate],
      ["Amount to receive", sum(invoices, invoiceBalance)],
      ["Amount to pay", sum(purchases, purchaseBalance)],
      ["Customer credits", sum(invoices, (i)=>creditBalance(i))],
      ["Vendor advances", sum(purchases, (i)=>creditBalance(i,"vendor"))],
    ]
      .map(
        ([k, v]) =>
          `<div class="card kpi"><span>${k}</span><strong>${v == null ? "Unavailable" : money(v)}</strong></div>`,
      )
      .join("");
    $("hst").innerHTML =
      stat("Sales HST less return credits", r.salesTax) +
      stat("Purchase HST", r.purchaseTax) +
      stat("Expense HST", r.expenseTax) +
      stat("Estimated net HST", r.netTax) +
      '<p class="note">Bookkeeping estimate; tax eligibility is not assessed. ' +
      (r.legacyReturns
        ? "Older returns in this period need manual tax reconciliation."
        : "") +
      "</p>";
    $("ar").innerHTML =
      Object.entries(arAging())
        .map(([k, v]) => stat(k, v))
        .join("") +
      '<p class="note">Current balances, not a historical snapshot.</p>';
    $("ap").innerHTML =
      Object.entries(apAging())
        .map(([k, v]) => stat(k, v))
        .join("") +
      '<p class="note">Current balances; vendor advances shown in Vendor Payments.</p>';
    $("inventory").innerHTML =
      stat(
        "Current standard-cost value",
        sum(db.products, (x) => x.qty * x.cost),
      ) +
      stat(
        "Current retail value",
        sum(db.products, (x) => x.qty * x.price),
      ) +
      '<p class="note">Standard cost is maintained in Inventory and saved on each finalised sale. This is not FIFO or weighted-average accounting. Custom/service items carry zero stock cost; record related costs as expenses. Imported sales without costs make profit unavailable.</p>';
    $("byProduct").innerHTML = grouped(r.products);
    $("byCustomer").innerHTML = grouped(r.customers);
    $("byExpense").innerHTML = grouped(r.categories);
  } catch (e) {
    toast(e.message);
  }
}
$("from").addEventListener("change", render);
$("to").addEventListener("change", render);
document.querySelectorAll("[data-days]").forEach((b) =>
  b.addEventListener("click", () => {
    const d = new Date();
    d.setDate(d.getDate() - Number(b.dataset.days));
    $("from").value = localDate(d);
    $("to").value = today();
    render();
  }),
);
render();
