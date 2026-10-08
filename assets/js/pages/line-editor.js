import { $, db, esc, option, money } from "../app.js";
import { totals } from "../services/business-service.js";

export function lineEditor(purchase = false, { onTotals } = {}) {
  const rows = $("rows"), form = $("form");
  const productOptions = () => option("", "Custom item (no inventory)") + db.products.map((p) => option(p.id, p.name)).join("");
  const error = document.createElement("p");
  error.className = "inline-error";
  error.setAttribute("role", "status");
  error.hidden = true;
  $("total").closest(".totals").after(error);

  function values() {
    return [...rows.children].map((row) => ({
      productId: row.querySelector(".prod").value,
      qty: row.querySelector(".qty").value,
      unit: row.querySelector(".unit").value,
      price: row.querySelector(".price").value,
      description: row.querySelector(".desc").value,
    }));
  }
  function calculate() {
    try {
      const rate = form.elements.namedItem("taxRate")?.value ?? db.settings.hstRate;
      const label = String(form.elements.namedItem("taxLabel")?.value || db.settings.taxLabel || "HST").trim();
      // Description is required on save; an unfinished description need not hide a valid price preview.
      const preview = values().map((line) => ({ ...line, description: line.description || "Item" }));
      const result = totals(db, preview, purchase ? 0 : form.elements.namedItem("discount")?.value || 0, rate);
      $("sub").textContent = money(result.subtotal);
      if ($("disc")) $("disc").textContent = money(result.discount);
      $("tax").textContent = money(result.tax);
      if ($("taxTitle")) $("taxTitle").textContent = `${label.toUpperCase()} (${Number(rate)}%)`;
      $("total").textContent = money(result.total);
      error.hidden = true;
      onTotals?.(result);
    } catch (cause) {
      for (const id of ["sub", "disc", "tax", "total"]) if ($(id)) $(id).textContent = "—";
      error.textContent = cause.message;
      error.hidden = false;
      onTotals?.(null);
    }
  }
  function selectProduct(row, productId) {
    row.querySelector(".prod").value = productId;
    const product = db.products.find((item) => item.id === productId);
    const unit = row.querySelector(".unit");
    unit.readOnly = !!product;
    if (product) {
      row.querySelector(".price").value = purchase ? product.cost : product.price;
      row.querySelector(".desc").value = product.name;
      unit.value = product.unit || "pcs";
    }
    calculate();
  }
  function add(item = {}) {
    const product = db.products.find((p) => p.id === item.productId);
    const row = document.createElement("div");
    row.className = "invoice-row";
    row.innerHTML = `<label class="line-field product-field"><span>Product</span><select class="prod" aria-label="Product">${productOptions()}</select></label>
      <label class="line-field"><span>Quantity</span><input aria-label="Quantity" class="qty" type="number" required min=".01" max="1000000" step=".01" value="${esc(item.qty ?? 1)}"></label>
      <label class="line-field"><span>Unit</span><input aria-label="Unit" class="unit" maxlength="50" placeholder="pcs, kg, box" value="${esc(item.unit || product?.unit || "pcs")}"></label>
      <label class="line-field"><span>${purchase ? "Cost per unit" : "Price per unit"}</span><input aria-label="${purchase ? "Cost per unit" : "Price per unit"}" class="price" type="number" required min="0" step=".01" value="${esc(item.price ?? 0)}"></label>
      <label class="line-field description-field"><span>Description</span><input aria-label="Description" class="desc" required placeholder="Item description" value="${esc(item.description || "")}"></label>
      <button type="button" class="btn danger remove-line" aria-label="Remove line">×</button>`;
    rows.append(row);
    row.querySelector(".prod").value = item.productId || "";
    row.querySelector(".unit").readOnly = !!product;
    row.querySelector(".prod").addEventListener("change", () => selectProduct(row, row.querySelector(".prod").value));
    row.querySelectorAll("input").forEach((input) => input.addEventListener("input", calculate));
    row.querySelector(".remove-line").addEventListener("click", () => { row.remove(); calculate(); });
    calculate();
    return row;
  }
  function set(items = [{}]) {
    rows.replaceChildren();
    items.forEach(add);
  }
  function refreshProducts() {
    rows.querySelectorAll(".prod").forEach((select) => {
      const selected = select.value;
      select.innerHTML = productOptions();
      select.value = selected;
    });
  }
  function useProduct(productId) {
    refreshProducts();
    const available = [...rows.children].find((row) => !row.querySelector(".prod").value && !row.querySelector(".desc").value);
    const row = available || add();
    selectProduct(row, productId);
    row.querySelector(".qty").focus();
  }
  $("addRow").addEventListener("click", () => { const row = add(); row.querySelector(".prod").focus(); });
  for (const name of ["discount", "taxRate", "taxLabel"]) form.elements.namedItem(name)?.addEventListener("input", calculate);
  set();
  return { values, set, calculate, refreshProducts, add, useProduct };
}
