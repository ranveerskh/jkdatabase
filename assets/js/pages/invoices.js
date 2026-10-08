import {
  $, db, esc, money, button, option, actions, submit, run, today,
  invoiceBalance, invoiceStatus, customerPaid, creditBalance, toast,
} from "../app.js";
import {
  saveInvoice, finaliseInvoice, duplicateInvoice, voidDocument,
  deleteRecord, invoiceEditBlockReason,
} from "../services/business-service.js";
import { lineEditor } from "./line-editor.js";
import { printInvoice } from "../services/print-service.js";

const form = $("form"), list = $("list"), dlg = $("dlg");
$("customer").innerHTML =
  option("", "Walk-in / manual") +
  db.customers.map((c) => option(c.id, c.name)).join("");
const lines = lineEditor();

function actionMenu(i) {
  const draft = i.state === "draft";
  const editReason = invoiceEditBlockReason(db, i.id);
  const edit = editReason
    ? `<button type="button" class="btn small" disabled title="${esc(editReason)}">Edit</button><small class="record-menu-note">${esc(editReason)}</small>`
    : button("Edit", "edit", i.id);
  const deleteAction = draft
    ? button("Delete draft", "delete", i.id, "danger")
    : `<small class="record-menu-note">Delete is unavailable for finalised invoices because stock, balances and reports must retain their history. Use Void or a credit note.</small>`;
  const controls = [
    button("Preview / Print", "print", i.id),
    button("Duplicate draft", "duplicate", i.id),
    edit,
    draft
      ? button("Finalise", "finalise", i.id, "primary")
      : i.voided
        ? `<small class="record-menu-note">This invoice is voided and retained for history.</small>`
        : button("Void", "void", i.id, "danger"),
    deleteAction,
  ].join("");
  return `<details class="record-menu"><summary class="btn small" aria-label="Actions for ${esc(i.number)}">Actions <span aria-hidden="true">▾</span></summary><div class="record-menu-panel">${controls}</div></details>`;
}

function render() {
  const query = $("search").value.trim().toLowerCase();
  const records = db.invoices
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.number).localeCompare(String(a.number)));
  const visible = records.filter((i) =>
    `${i.number} ${i.customerName} ${i.date} ${invoiceStatus(i)}`.toLowerCase().includes(query),
  );
  $("count").textContent = `${visible.length} of ${records.length} invoices`;
  list.innerHTML = visible.length
    ? visible.map((i) => `
      <article class="record-card invoice-record">
        <div class="record-main"><b>${esc(i.number)}</b><small>${esc(i.customerName)} · ${esc(i.date)}</small></div>
        <div class="record-stat"><small>Total</small><b>${money(i.total)}</b></div>
        <div class="record-stat optional-stat"><small>Paid</small><b>${money(customerPaid(i.id))}</b></div>
        <div class="record-stat"><small>Balance</small><b>${money(invoiceBalance(i))}</b></div>
        <div class="record-stat optional-stat"><small>Status</small><b><span class="badge ${esc(invoiceStatus(i).toLowerCase().replaceAll(" ", ""))}">${esc(invoiceStatus(i))}</span>${creditBalance(i) ? ` · ${money(creditBalance(i))} credit` : ""}</b></div>
        <div class="record-actions">${actionMenu(i)}</div>
      </article>`).join("")
    : '<div class="empty card">No matching invoices.</div>';
}

function open(i) {
  form.reset();
  form.elements.namedItem("id").value = i?.id || "";
  $("date").value = i?.date || today();
  $("dueDate").value = i?.dueDate || today();
  form.elements.namedItem("taxLabel").value = i?.taxLabel || i?.businessSnapshot?.taxLabel || db.settings.taxLabel || "HST";
  form.elements.namedItem("taxRate").value = i?.taxRate ?? i?.businessSnapshot?.hstRate ?? db.settings.hstRate;
  if (i) {
    $("customer").value = i.customerId || "";
    form.elements.namedItem("manualCustomer").value = i.customerName || "";
    form.elements.namedItem("discount").value = i.discount || 0;
    form.elements.namedItem("notes").value = i.notes || "";
  }
  const finalEdit = !!i && i.state !== "draft";
  $("modalTitle").textContent = i ? `Edit ${i.number}` : "New Sales Invoice";
  $("formHint").textContent = finalEdit
    ? "This invoice has no linked payments, returns, credits or transfers. Saving will reverse and repost its stock movements and retain the old version in audit history."
    : "Drafts do not change stock. Finalising records the invoice and stock movement.";
  form.querySelector('button[value="draft"]').hidden = finalEdit;
  form.querySelector('button[value="finalise"]').textContent = finalEdit ? "Save Changes" : "Finalise Invoice";
  lines.set(i?.items);
  dlg.showModal();
}

$("date").value = $("dueDate").value = today();
document.querySelector('[data-click="new-invoice"]').addEventListener("click", () => open());
$("search").addEventListener("input", render);
render();

actions(list, {
  print: printInvoice,
  edit: (id) => {
    const reason = invoiceEditBlockReason(db, id);
    if (reason) return toast(reason);
    open(db.invoices.find((x) => x.id === id));
  },
  duplicate: (id) => run(() => duplicateInvoice(id)),
  finalise: (id) => {
    if (confirm("Finalise this draft and reduce stock?"))
      run(() => finaliseInvoice(id));
  },
  void: (id) => {
    if (confirm("Void this unpaid invoice and restore its stock? Linked payments, credits, returns, refunds or transfers block voiding."))
      run(() => voidDocument("invoices", id));
  },
  delete: (id) => {
    if (confirm("Delete this draft invoice? Finalised invoices are retained for accounting history."))
      run(() => deleteRecord("invoices", id));
  },
});

submit(form, (o, b) => saveInvoice(o, lines.values(), b?.value === "finalise"));

const editId = new URLSearchParams(location.search).get("edit");
if (editId) {
  const reason = invoiceEditBlockReason(db, editId);
  if (reason) toast(reason);
  else open(db.invoices.find((x) => x.id === editId));
}
