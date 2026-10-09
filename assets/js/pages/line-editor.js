import { $, db, esc, option, money } from "../app.js";
import { totals } from "../services/business-service.js";

export function lineEditor(purchase = false, { onTotals } = {}) {
  const rows = $("rows"), form = $("form");
  const productOptions = () => option("", "One-time invoice line (not in catalog)") + db.products.map((p) => option(p.id, p.name)).join("");
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
    if (product) {
      row.querySelector(".price").value = purchase ? product.cost : product.price;
      row.querySelector(".desc").value = product.name;
      row.querySelector(".unit").value = product.unit || "pcs";
      row.querySelector(".quantity-combined").value = `${row.querySelector(".qty").value} ${product.unit || "pcs"}`;
    }
    calculate();
  }
  function add(item = {}) {
    const product = db.products.find((p) => p.id === item.productId);
    const row = document.createElement("div");
    row.className = "invoice-row";
    row.innerHTML = `<label class="line-field product-field"><span>Product</span><select class="prod" aria-label="Product">${productOptions()}</select></label>
      <label class="line-field quantity-field"><span>Quantity</span><span class="quantity-control"><input aria-label="Quantity and unit" class="quantity-combined" type="text" inputmode="decimal" required value="${esc(`${item.qty ?? 1} ${item.unit || product?.unit || "pcs"}`)}"><input aria-label="Quantity" class="qty" type="hidden" value="${esc(item.qty ?? 1)}"><input aria-label="Unit" class="unit" type="hidden" value="${esc(item.unit || product?.unit || "pcs")}"></span></label>
      <label class="line-field price-field"><span>${purchase ? "Cost per unit" : "Price per unit"}</span><input aria-label="${purchase ? "Cost per unit" : "Price per unit"}" class="price" type="number" ${purchase ? "" : "required"} min="0" step=".01" value="${esc(item.price ?? 0)}"></label>
      <label class="line-field description-field"><span>Description</span><input aria-label="Description" class="desc" ${purchase ? "" : "required"} placeholder="Item description" value="${esc(item.description || "")}"></label>
      <button type="button" class="btn danger remove-line" aria-label="Remove line">×</button>`;
    rows.append(row);
    row.querySelector(".prod").value = item.productId || "";
    row.querySelector(".prod").addEventListener("change", () => selectProduct(row, row.querySelector(".prod").value));
    row.querySelector(".quantity-combined").addEventListener("input", () => {
      const match = row.querySelector(".quantity-combined").value.trim().match(/^((?:[0-9]+\.?[0-9]*|\.[0-9]+))\s*(.*)$/);
      row.querySelector(".qty").value = match?.[1] || "";
      if (match?.[2]) row.querySelector(".unit").value = match[2].trim();
      calculate();
    });
    row.querySelectorAll(".price, .desc").forEach((input) => input.addEventListener("input", calculate));
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
    row.querySelector(".quantity-combined").focus();
  }
  function addOrIncrementProduct(productId) {
    refreshProducts();
    let row = [...rows.children].find((item) => item.querySelector(".prod").value === productId);
    if (row) {
      const qty = row.querySelector(".qty"), combined = row.querySelector(".quantity-combined");
      qty.value = String((Number(qty.value) || 0) + 1);
      combined.value = `${qty.value} ${row.querySelector(".unit").value}`;
      calculate();
    } else {
      row = [...rows.children].find((item) => !item.querySelector(".prod").value && !item.querySelector(".desc").value) || add();
      selectProduct(row, productId);
    }
    return row;
  }
  $("addRow").addEventListener("click", () => { const row = add(); row.querySelector(".prod").focus(); });
  for (const name of ["discount", "taxRate", "taxLabel"]) form.elements.namedItem(name)?.addEventListener("input", calculate);
  set();
  return { values, set, calculate, refreshProducts, add, useProduct, addOrIncrementProduct };
}
