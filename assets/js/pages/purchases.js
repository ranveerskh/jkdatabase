import {
  $,
  db,
  esc,
  money,
  table,
  button,
  option,
  actions,
  submit,
  run,
  today,
  purchaseBalance,
  purchaseStatus,
  creditBalance,
} from "../app.js";
import { savePurchase, voidDocument } from "../services/business-service.js";
import { lineEditor } from "./line-editor.js";
$("vendor").innerHTML =
  option("", "Manual / no vendor") +
  db.vendors.map((v) => option(v.id, v.name)).join("");
$("date").value = $("dueDate").value = today();
const lines = lineEditor(true);
$("count").textContent = `${db.purchases.length} bills`;
$("list").innerHTML = table(
  [
    "Bill",
    "Vendor #",
    "Date",
    "Vendor",
    "Total",
    "Balance",
    "Advance",
    "Status",
    "",
  ],
  db.purchases
    .slice()
    .reverse()
    .map(
      (i) =>
        `<tr><td>${esc(i.number)}</td><td>${esc(i.vendorBillNo)}</td><td>${esc(i.date)}</td><td>${esc(i.vendorName)}</td><td>${money(i.total)}</td><td>${money(purchaseBalance(i))}</td><td>${money(creditBalance(i, "vendor"))}</td><td>${esc(purchaseStatus(i))}</td><td>${!i.voided ? button("Void", "void", i.id, "danger") : ""}</td></tr>`,
    ),
);
actions($("list"), {
  void: (id) => {
    if (
      confirm(
        "Void this unpaid purchase and reverse stock-in? This is blocked if stock has been used.",
      )
    )
      run(() => voidDocument("purchases", id));
  },
});
submit($("form"), (o) => savePurchase(o, lines.values()));
