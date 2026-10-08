import { $, db, esc, table, option, submit } from "../app.js";
import { adjustStock } from "../services/business-service.js";

export function initPage({ signal } = {}) {
$("product").innerHTML =
  option("", "Choose product") +
  db.products.map((p) => option(p.id, `${p.name} · ${p.qty}`)).join("");
$("list").innerHTML = table(
  [
    "Date",
    "Product",
    "Type",
    "Change",
    "Balance after entry",
    "Reference",
    "Note",
  ],
  db.stockLedger.map(
    (x) =>
      `<tr><td>${esc(x.date)}</td><td>${esc(db.products.find((p) => p.id === x.productId)?.name || "Imported missing item")}</td><td>${esc(x.type)}</td><td>${esc(x.qty)}</td><td>${esc(x.balance)}</td><td>${esc(x.reference)}</td><td>${esc(x.note)}</td></tr>`,
  ),
);
submit($("form"), adjustStock);

}
