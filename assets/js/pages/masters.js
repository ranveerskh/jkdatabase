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
  confirmTypedDelete,
} from "../app.js";
import { saveMaster, deleteRecord } from "../services/business-service.js";
import { compressProductImage } from "../core/product-image.js";
import { refreshPage } from "../services/navigation.js";
export function masterPage(type) {
  const form = $("form");
  let productImage = "";
  const singular = {
    customers: "Customer",
    vendors: "Vendor",
    products: "Product",
  }[type];
  function open(x) {
    form.reset();
    productImage = x?.image || "";
    const preview = $("productImagePreview");
    if (preview) { preview.src = productImage; preview.hidden = !productImage; }
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
      ? ["SKU / Barcode", "Product", "Quantity / unit", "Cost per unit", "Price per unit", "Status", ""]
      : ["Name", "Contact", "Phone", "Email", ""];
  $("list").innerHTML = table(
    headers,
    db[type].map(
      (x) =>
        "<tr>" +
        (type === "products"
          ? `<td>${esc(x.sku)}<small>${esc(x.barcode || "")}</small></td><td>${esc(x.name)}</td><td>${esc(x.qty)} ${esc(x.unit || "pcs")}</td><td>${money(x.cost)}</td><td>${money(x.price)}</td><td>${Number(x.qty) <= Number(x.low ?? db.settings.lowStockDefault) ? "Low stock" : "In stock"}</td>`
          : `<td>${esc(x.name)}</td><td>${esc(x.contact)}</td><td>${esc(x.phone)}</td><td>${esc(x.email)}</td>`) +
        `<td>${button("Edit", "edit", x.id)} ${button("Delete", "delete", x.id, "danger")}</td></tr>`,
    ),
  );
  actions($("list"), {
    edit: (id) => open(db[type].find((x) => x.id === id)),
    delete: async (id) => {
      const record = db[type].find((x) => x.id === id);
      if (record && await confirmTypedDelete(`${singular} ${record.name}`, "Records linked to invoices, purchases or stock history are protected."))
        run(() => deleteRecord(type, id));
    },
  });
  if (type === "products") {
    $("form").addEventListener("change", async (e) => {
      if (e.target.name !== "imageFile" || !e.target.files[0]) return;
      try { productImage = await compressProductImage(e.target.files[0]); $("productImagePreview").src = productImage; $("productImagePreview").hidden = false; }
      catch (error) { e.target.value = ""; alert(error.message); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = e.submitter; if (btn) btn.disabled = true;
      try { const o = Object.fromEntries(new FormData(form)); o.image = productImage; await saveMaster(type, o); $("dlg").close(); await refreshPage(); }
      catch (error) { alert(error.message); }
      finally { if (btn) btn.disabled = false; }
    });
  } else submit(form, (o) => saveMaster(type, o));
}
