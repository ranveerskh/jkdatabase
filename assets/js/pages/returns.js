import {
  $,
  db,
  esc,
  money,
  table,
  option,
  submit,
  today,
  posted,
} from "../app.js";
import { saveReturn, returnPreview } from "../services/business-service.js";

export function initPage({ signal } = {}) {
$("date").value = today();
$("invoice").innerHTML =
  option("", "Choose invoice") +
  db.invoices
    .filter(posted)
    .map((i) => option(i.id, `${i.number} · ${i.customerName}`))
    .join("");
const form = $("form");
function preview() {
  try {
    const p = returnPreview(
      db,
      $("invoice").value,
      $("product").value,
      form.elements.namedItem("qty").value,
    );
    form.elements.namedItem("amount").value = money(p.amount);
    $("returnHint").textContent =
      `Includes tax ${money(p.tax)}. Remaining returnable quantity: ${p.remaining}.`;
  } catch (e) {
    form.elements.namedItem("amount").value = "";
    $("returnHint").textContent = e.message;
  }
}
$("invoice").addEventListener("change", () => {
  const i = db.invoices.find((i) => i.id === $("invoice").value);
  $("product").innerHTML = (i?.items || [])
    .map((x) => option(x.lineId, `${x.description} · originally ${x.qty}`))
    .join("");
  preview();
});
$("product").addEventListener("change", preview);
form.elements.namedItem("qty").addEventListener("input", preview);
submit(form, saveReturn);
$("list").innerHTML = table(
  [
    "Credit note",
    "Date",
    "Invoice",
    "Item",
    "Qty",
    "Credit",
    "Tax",
    "Restocked",
    "Reason",
  ],
  db.returns
    .slice()
    .reverse()
    .map(
      (r) =>
        `<tr><td>${esc(r.number)}${r.legacy ? " (legacy review)" : ""}</td><td>${esc(r.date)}</td><td>${esc(db.invoices.find((i) => i.id === r.invoiceId)?.number || "—")}</td><td>${esc(r.description || "—")}</td><td>${esc(r.qty)}</td><td>${money(r.amount)}</td><td>${r.legacy ? "Review" : money(r.tax)}</td><td>${r.restock === "yes" ? "Yes" : "No"}</td><td>${esc(r.reason)}</td></tr>`,
    ),
);

const presetInvoice = new URLSearchParams(location.search).get("invoice");
if (presetInvoice && db.invoices.some((i)=>i.id===presetInvoice && posted(i))) {
  $("invoice").value=presetInvoice;
  $("invoice").dispatchEvent(new Event("change"));
  $("dlg").showModal();
}

}
