import { $, db, money, sum, esc, today, posted, invoiceBalance, purchaseBalance, creditBalance } from "../app.js";
const invoices=db.invoices.filter(posted),purchases=db.purchases.filter(posted),now=today(),month=now.slice(0,7);
const netSales=(list)=>sum(list,(x)=>Number(x.subtotal||0)-Number(x.discount||0));
const todaySales=netSales(invoices.filter((x)=>x.date===now)),monthSales=netSales(invoices.filter((x)=>String(x.date).startsWith(month)));
const ar=sum(invoices,invoiceBalance),ap=sum(purchases,purchaseBalance),openQuotes=db.quotes.filter((q)=>q.status!=="Converted").length,lows=db.products.filter((x)=>Number(x.qty)<=Number(x.low??db.settings.lowStockDefault));
const cards=[
  ["Today's sales",money(todaySales),"Sales saved today","pages/sales.html"],
  ["This month",money(monthSales),"Net sales before HST","pages/reports.html"],
  ["To receive",money(ar),"Customer balances","pages/sales.html?filter=due"],
  ["To pay",money(ap),"Vendor balances","pages/purchases.html?filter=due"],
  ["Open quotes",String(openQuotes),"Waiting to convert","pages/sales.html?filter=quote"],
  ["Low stock",String(lows.length),"Products at/below threshold","pages/inventory.html"],
];
$("kpis").innerHTML=cards.map(([k,v,n,url])=>`<a class="card kpi kpi-link" href="${url}"><span>${esc(k)}</span><strong>${esc(v)}</strong><em>${esc(n)}</em></a>`).join("");
function rows(items,empty){return items.length?items.join(""):`<div class="empty">${esc(empty)}</div>`}
$("recentSales").innerHTML=rows(db.invoices.filter(posted).slice(-6).reverse().map((x)=>`<p class="statline"><span><b>${esc(x.customerName)}</b><br><small class="muted">${esc(x.number)} · ${esc(x.date)}</small></span><b>${money(x.total)}</b></p>`),"No sales yet.");
const due=[...invoices.filter((x)=>invoiceBalance(x)>0).map((x)=>({side:"Customer",name:x.customerName,number:x.number,value:invoiceBalance(x),date:x.dueDate})),...purchases.filter((x)=>purchaseBalance(x)>0).map((x)=>({side:"Vendor",name:x.vendorName,number:x.number,value:purchaseBalance(x),date:x.dueDate}))].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,8);
$("due").innerHTML=rows(due.map((x)=>`<p class="statline"><span><b>${esc(x.name)}</b><br><small class="muted">${esc(x.side)} · ${esc(x.number)} · due ${esc(x.date||"—")}</small></span><b>${money(x.value)}</b></p>`),"Nothing is due.");
$("low").innerHTML=rows(lows.slice(0,8).map((x)=>`<p class="statline"><span>${esc(x.name)}<br><small class="muted">${esc(x.sku||"")}</small></span><b>${esc(x.qty)} ${esc(x.unit||"")}</b></p>`),"Stock levels look good.");
$("recentPurchases").innerHTML=rows(purchases.slice(-6).reverse().map((x)=>`<p class="statline"><span><b>${esc(x.vendorName)}</b><br><small class="muted">${esc(x.number)} · ${esc(x.date)}</small></span><b>${money(x.total)}</b></p>`),"No purchases yet.");
const customerCredit=sum(invoices,(i)=>creditBalance(i)),vendorAdv=sum(purchases,(i)=>creditBalance(i,"vendor"));
$("snapshot").innerHTML=[['People',(db.people||[]).length],['Inventory SKUs',db.products.length],['Customer credits',money(customerCredit)],['Vendor advances',money(vendorAdv)],['Expenses',db.expenses.length],['Version','7 Local']].map(([k,v])=>`<p class="metric">${esc(k)} <b>${esc(v)}</b></p>`).join("");
