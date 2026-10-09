import { $, db, money, sum, esc, posted, invoiceBalance, purchaseBalance, creditBalance } from "../app.js";
import { report } from "../services/report-service.js";
import { setupDateFilter } from "../core/date-filter.js";

export function initPage() {
  function rows(items, empty) { return items.length ? items.join("") : `<div class="empty">${esc(empty)}</div>`; }
  function render() {
    const r = report($("from").value, $("to").value);
    const invoices = db.invoices.filter(posted), purchases = db.purchases.filter(posted);
    const ar = sum(invoices, invoiceBalance), ap = sum(purchases, purchaseBalance);
    const quotes = db.quotes.filter((q) => q.status !== "Converted").length;
    const cards = [
      ["Inventory invested", r.purchaseInvestment, "Purchase cost recorded"],
      ["Sales", r.netSales, "Before sales tax"],
      ["Gross profit", r.grossProfit, "Sales less sold item costs"],
      ["Expenses", r.netExpenses + r.customPurchases, "Business expenses"],
      ["Net profit estimate", r.netProfit, "Gross profit less expenses"],
      ["Tax charged", r.salesTax, "Less credits for returns"],
      ["Tax paid", r.purchaseTax + r.expenseTax, "On recorded purchases and expenses"],
      ["Estimated net tax", r.netTax, "Tax charged less recorded tax paid"],
      ["To receive", ar, "Current customer balances"],
      ["To pay", ap, "Current vendor balances"],
    ];
    $("kpis").innerHTML = cards.map(([k,v,n]) => `<a class="card kpi kpi-link" href="pages/reports.html"><span>${esc(k)}</span><strong>${v == null ? "Unavailable" : money(v)}</strong><em>${esc(n)}</em></a>`).join("");
    $("recentSales").innerHTML = rows(invoices.slice(-6).reverse().map((x) => `<p class="statline"><span><b>${esc(x.customerName)}</b><br><small class="muted">${esc(x.number)} · ${esc(x.date)}</small></span><b>${money(x.total)}</b></p>`), "No sales yet.");
    const due = [...invoices.filter((x) => invoiceBalance(x)>0).map((x)=>({name:x.customerName, side:"Customer", number:x.number, value:invoiceBalance(x),date:x.dueDate})), ...purchases.filter((x)=>purchaseBalance(x)>0).map((x)=>({name:x.vendorName||"Vendor not specified",side:"Vendor",number:x.number,value:purchaseBalance(x),date:x.dueDate}))].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,8);
    $("due").innerHTML = rows(due.map((x)=>`<p class="statline"><span><b>${esc(x.name)}</b><br><small class="muted">${esc(x.side)} · ${esc(x.number)} · due ${esc(x.date||"—")}</small></span><b>${money(x.value)}</b></p>`), "Nothing is due.");
    $("recentPurchases").innerHTML = rows(purchases.slice(-6).reverse().map((x)=>`<p class="statline"><span><b>${esc(x.vendorName||"Vendor not specified")}</b><br><small class="muted">${esc(x.number)} · ${esc(x.date)}</small></span><b>${money(x.total)}</b></p>`), "No investments recorded yet.");
    const perf = [...r.productPerformance.values()].sort((a,b)=>b.profit-a.profit).slice(0,8);
    $("productProfit").innerHTML = rows(perf.map((x)=>`<p class="statline"><span><b>${esc(x.name)}</b><br><small class="muted">${x.units} sold · cost ${money(x.cost)}</small></span><b>${money(x.profit)}</b></p>`), "No product sales in this period.");
    const customerCredit = sum(invoices,(i)=>creditBalance(i)), vendorAdv = sum(purchases,(i)=>creditBalance(i,"vendor"));
    $("snapshot").innerHTML = [["People",(db.people||[]).length],["Products",db.products.length],["Open quotes",quotes],["Customer credits",money(customerCredit)],["Vendor advances",money(vendorAdv)],["Expenses recorded",db.expenses.length]].map(([k,v])=>`<p class="metric">${esc(k)} <b>${esc(v)}</b></p>`).join("");
  }
  setupDateFilter($("period"), $("from"), $("to"), render);
}
