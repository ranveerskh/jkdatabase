import {
  $,
  db,
  esc,
  money,
  table,
  button,
  actions,
  submit,
  run,
  today,
  confirmTypedDelete,
} from "../app.js";
import { saveExpense, deleteRecord } from "../services/business-service.js";

export function initPage({ signal } = {}) {
$("date").value = today();
$("form").elements.namedItem("taxLabel").value = db.settings.taxLabel || "HST";
$("form").elements.namedItem("taxRate").value = db.settings.hstRate ?? 13;
function updateTaxPreview() {
  const amount = Number($("form").elements.namedItem("amount").value || 0);
  const rate = Number($("form").elements.namedItem("taxRate").value || 0);
  const included = Number.isFinite(amount) && Number.isFinite(rate) && rate >= 0 && rate <= 100
    ? amount * rate / (100 + rate)
    : 0;
  $("expenseTaxAmount").textContent = money(included);
}
$("form").elements.namedItem("amount").addEventListener("input", updateTaxPreview);
$("form").elements.namedItem("taxRate").addEventListener("input", updateTaxPreview);
updateTaxPreview();
$("count").textContent = `${db.expenses.length} expenses`;
$("list").innerHTML = table(
  [
    "Date",
    "Category",
    "Payee",
    "Method",
    "Description",
    "Total",
    db.settings.taxLabel || "HST",
    "Tax rate",
    "",
  ],
  db.expenses
    .slice()
    .reverse()
    .map(
      (x) =>
        `<tr><td>${esc(x.date)}</td><td>${esc(x.category)}</td><td>${esc(x.payee)}</td><td>${esc(x.method)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td><td>${money(x.tax)}</td><td>${x.taxRate == null ? "—" : Number(x.taxRate) + "%"}</td><td>${button("Delete", "delete", x.id, "danger")}</td></tr>`,
    ),
);
actions($("list"), {
  delete: async (id) => {
    if (await confirmTypedDelete("expense", "This entry will be removed from expense totals and reports."))
      run(() => deleteRecord("expenses", id));
  },
});
submit($("form"), saveExpense);
if (new URLSearchParams(location.search).get("new") === "1") $("dlg").showModal();

}
