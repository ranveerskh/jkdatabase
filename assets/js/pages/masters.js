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
} from "../app.js";
import { saveMaster, deleteRecord } from "../services/business-service.js";
export function masterPage(type) {
  const form = $("form");
  const singular = {
    customers: "Customer",
    vendors: "Vendor",
    products: "Item",
  }[type];
  function open(x) {
    form.reset();
    form.elements.namedItem("id").value = "";
    if (x)
      for (const [k, v] of Object.entries(x)) {
        const el = form.elements.namedItem(k);
        if (el) el.value = v ?? "";
      }
    $("modalTitle").textContent = (x ? "Edit " : "Add ") + singular;
    $("dlg").showModal();
  }
  document
    .querySelector('[data-click="add"]')
    .addEventListener("click", () => open());
  $("count").textContent = `${db[type].length} records`;
  const headers =
    type === "products"
      ? ["SKU", "Item", "On hand", "Standard cost", "Sell", "Status", ""]
      : ["Name", "Contact", "Phone", "Email", ""];
  $("list").innerHTML = table(
    headers,
    db[type].map(
      (x) =>
        "<tr>" +
        (type === "products"
          ? `<td>${esc(x.sku)}</td><td>${esc(x.name)}</td><td>${esc(x.qty)}</td><td>${money(x.cost)}</td><td>${money(x.price)}</td><td>${Number(x.qty) <= Number(x.low ?? db.settings.lowStockDefault) ? "Low stock" : "In stock"}</td>`
          : `<td>${esc(x.name)}</td><td>${esc(x.contact)}</td><td>${esc(x.phone)}</td><td>${esc(x.email)}</td>`) +
        `<td>${button("Edit", "edit", x.id)} ${button("Delete", "delete", x.id, "danger")}</td></tr>`,
    ),
  );
  actions($("list"), {
    edit: (id) => open(db[type].find((x) => x.id === id)),
    delete: (id) => {
      if (confirm("Delete this record? Linked records are protected."))
        run(() => deleteRecord(type, id));
    },
  });
  submit(form, (o) => saveMaster(type, o));
}
