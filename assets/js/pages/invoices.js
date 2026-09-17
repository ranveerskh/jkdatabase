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
  invoiceBalance,
  invoiceStatus,
  customerPaid,
  creditBalance,
} from "../app.js";
import {
  saveInvoice,
  finaliseInvoice,
  duplicateInvoice,
  voidDocument,
  deleteRecord,
} from "../services/business-service.js";
import { lineEditor } from "./line-editor.js";
import { printInvoice } from "../services/print-service.js";
const form = $("form");
$("customer").innerHTML =
  option("", "Walk-in / manual") +
  db.customers.map((c) => option(c.id, c.name)).join("");
const lines = lineEditor();
function open(i) {
  form.reset();
  form.elements.namedItem("id").value = i?.id || "";
  $("date").value = i?.date || today();
  $("dueDate").value = i?.dueDate || today();
  $("modalTitle").textContent = i
    ? "Edit draft " + i.number
    : "New Sales Invoice";
  if (i) {
    $("customer").value = i.customerId;
    form.elements.namedItem("manualCustomer").value = i.customerName;
    form.elements.namedItem("discount").value = i.discount;
    form.elements.namedItem("notes").value = i.notes || "";
  }
  lines.set(i?.items);
  $("dlg").showModal();
}
$("date").value = $("dueDate").value = today();
document
  .querySelector('[data-click="new-invoice"]')
  .addEventListener("click", () => open());
$("count").textContent = `${db.invoices.length} invoices`;
$("list").innerHTML = table(
  [
    "Invoice",
    "Date",
    "Customer",
    "Total",
    "Paid",
    "Balance",
    "Credit",
    "Status",
    "Actions",
  ],
  db.invoices
    .slice()
    .reverse()
    .map(
      (i) =>
        `<tr><td>${esc(i.number)}</td><td>${esc(i.date)}</td><td>${esc(i.customerName)}</td><td>${money(i.total)}</td><td>${money(customerPaid(i.id))}</td><td>${money(invoiceBalance(i))}</td><td>${money(creditBalance(i))}</td><td><span class="badge ${esc(invoiceStatus(i).toLowerCase().replaceAll(" ", ""))}">${esc(invoiceStatus(i))}</span></td><td>${button("Print", "print", i.id)} ${button("Duplicate draft", "duplicate", i.id)} ${i.state === "draft" ? button("Edit", "edit", i.id) + " " + button("Finalise", "finalise", i.id) + " " + button("Delete draft", "delete", i.id, "danger") : !i.voided ? button("Void", "void", i.id, "danger") : ""}</td></tr>`,
    ),
);
actions($("list"), {
  print: printInvoice,
  edit: (id) => open(db.invoices.find((x) => x.id === id)),
  duplicate: (id) => run(() => duplicateInvoice(id)),
  finalise: (id) => {
    if (confirm("Finalise this draft and reduce stock?"))
      run(() => finaliseInvoice(id));
  },
  void: (id) => {
    if (
      confirm(
        "Void this unpaid invoice and restore its stock? Linked payments/returns will block this action.",
      )
    )
      run(() => voidDocument("invoices", id));
  },
  delete: (id) => {
    if (confirm("Delete this draft?")) run(() => deleteRecord("invoices", id));
  },
});
submit(form, (o, b) => saveInvoice(o, lines.values(), b?.value === "finalise"));
