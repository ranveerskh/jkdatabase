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
} from "../app.js";
import { saveExpense, deleteRecord } from "../services/business-service.js";
$("date").value = today();
$("count").textContent = `${db.expenses.length} expenses`;
$("list").innerHTML = table(
  [
    "Date",
    "Category",
    "Payee",
    "Method",
    "Description",
    "Total",
    "Included HST",
    "",
  ],
  db.expenses
    .slice()
    .reverse()
    .map(
      (x) =>
        `<tr><td>${esc(x.date)}</td><td>${esc(x.category)}</td><td>${esc(x.payee)}</td><td>${esc(x.method)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td><td>${money(x.tax)}</td><td>${button("Delete error", "delete", x.id, "danger")}</td></tr>`,
    ),
);
actions($("list"), {
  delete: (id) => {
    if (confirm("Delete this mistaken expense entry?"))
      run(() => deleteRecord("expenses", id));
  },
});
submit($("form"), saveExpense);
if (new URLSearchParams(location.search).get("new") === "1") $("dlg").showModal();
