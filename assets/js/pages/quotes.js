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
} from "../app.js";
import {
  saveQuote,
  convertQuote,
  deleteRecord,
} from "../services/business-service.js";
$("customer").innerHTML =
  option("", "Walk-in / manual") +
  db.customers.map((c) => option(c.id, c.name)).join("");
$("date").value = $("validUntil").value = today();
$("form").elements.namedItem("taxLabel").value = db.settings.taxLabel || "HST";
$("form").elements.namedItem("taxRate").value = db.settings.hstRate;
$("count").textContent = `${db.quotes.length} quotes`;
$("list").innerHTML = table(
  ["Quote", "Date", "Valid until", "Customer", "Total", "Status", ""],
  db.quotes
    .slice()
    .reverse()
    .map(
      (q) =>
        `<tr><td>${esc(q.number)}</td><td>${esc(q.date)}</td><td>${esc(q.validUntil)}</td><td>${esc(q.customerName)}</td><td>${money(q.total)}</td><td>${esc(q.status)}</td><td>${q.status !== "Converted" ? button("Convert to draft", "convert", q.id) + " " + button("Delete", "delete", q.id, "danger") : ""}</td></tr>`,
    ),
);
actions($("list"), {
  convert: (id) => run(() => convertQuote(id)),
  delete: (id) => {
    if (confirm("Delete this unconverted quote?"))
      run(() => deleteRecord("quotes", id));
  },
});
submit($("form"), saveQuote);
