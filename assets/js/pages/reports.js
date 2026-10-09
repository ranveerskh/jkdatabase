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
import { setupDateFilter } from "../core/date-filter.js";
import { report } from "../services/report-service.js";

export function initPage({ signal } = {}) {
const stat = (k, v) =>
  `<div class="statline"><span>${esc(k)}</span><b>${v == null ? "Cost unavailable" : money(v)}</b></div>`;
const paymentAge = (bucket) => bucket === "Current" ? "Not overdue" : `${bucket} days overdue`;
const grouped = (m) =>
  [...m]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => stat(k, v))
    .join("") || '<div class="empty">No data</div>';
function render() {
  try {
    const r = report($("from").value, $("to").value);
    const invoices=db.invoices.filter(posted), purchases=db.purchases.filter(posted);
    $("cards").innerHTML = [
      ["Sales", r.netSales],
      ["Inventory invested", r.purchaseInvestment],
      ["Shipping paid", r.shipping],
      ["Gross profit", r.grossProfit],
      ["Expenses", r.netExpenses + r.customPurchases],
      ["Net profit estimate", r.netProfit],
      ["Tax charged", r.salesTax],
      ["To Receive", sum(invoices, invoiceBalance)],
      ["To Pay", sum(purchases, purchaseBalance)],
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
        .map(([k, v]) => stat(paymentAge(k), v))
        .join("") +
      '<p class="note">Current balances, not a historical snapshot.</p>';
    $("ap").innerHTML =
      Object.entries(apAging())
        .map(([k, v]) => stat(paymentAge(k), v))
        .join("") +
      '<p class="note">Current balances; vendor advances shown in Vendor Payments.</p>';
    $("inventory").innerHTML = stat("Inventory cost recorded in period", r.purchaseInvestment) + stat("Shipping recorded in period", r.shipping) + '<p class="note">This is money invested over the selected dates. The catalog does not track on-hand quantities.</p>';
    $("byProduct").innerHTML = [...r.productPerformance.values()].sort((a,b)=>b.profit-a.profit).map((x)=>`<p class="statline"><span><b>${esc(x.name)}</b><br><small class="muted">${x.units} sold · cost ${money(x.cost)}</small></span><b>${money(x.profit)}</b></p>`).join("") || '<div class="empty">No product sales in this period.</div>';
    $("byCustomer").innerHTML = grouped(r.customers);
    $("byExpense").innerHTML = grouped(r.categories);
  } catch (e) {
    toast(e.message);
  }
}
setupDateFilter($("period"), $("from"), $("to"), render);

}
