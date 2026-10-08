import { $, db, esc, option, money } from "../app.js";
import { totals } from "../services/business-service.js";
export function lineEditor(purchase = false, { onTotals } = {}) {
  const rows = $("rows"),
    form = $("form");
  function values() {
    return [...rows.children].map((r) => ({
      productId: r.querySelector(".prod").value,
      qty: r.querySelector(".qty").value,
      price: r.querySelector(".price").value,
      description: r.querySelector(".desc").value,
    }));
  }
  function calculate() {
    try {
      const rateInput = form.elements.namedItem("taxRate"),
        rate = rateInput?.value || db.settings.hstRate,
        labelInput = form.elements.namedItem("taxLabel"),
        label = String(labelInput?.value || db.settings.taxLabel || "HST").trim() || "HST",
        rateLabel = String(Number(rate));
      const t = totals(
        db,
        values(),
        purchase ? 0 : form.elements.namedItem("discount").value || 0,
        rate,
      );
      $("sub").textContent = money(t.subtotal);
      if ($("disc")) $("disc").textContent = money(t.discount);
      $("tax").textContent = money(t.tax);
      if ($("taxTitle")) $("taxTitle").textContent = `${label.toUpperCase()} (${rateLabel}%)`;
      $("total").textContent = money(t.total);
      onTotals?.(t);
    } catch (e) {
      $("total").textContent = "Check items, discount or tax rate";
    }
  }
  function add(x = {}) {
    const r = document.createElement("div");
    r.className = "invoice-row";
    r.innerHTML = `<select class="prod" aria-label="Product">${option("", purchase ? "Custom expense item" : "Custom item")}${db.products.map((p) => option(p.id, p.name)).join("")}</select><input aria-label="Quantity" class="qty" type="number" required min=".01" max="1000000" step=".01" value="${esc(x.qty ?? 1)}"><input aria-label="Unit price" class="price" type="number" required min="0" step=".01" value="${esc(x.price ?? 0)}"><input aria-label="Description" class="desc" required placeholder="Description" value="${esc(x.description || "")}"><button type="button" class="btn danger" aria-label="Remove line">×</button>`;
    rows.append(r);
    r.querySelector(".prod").value = x.productId || "";
    r.querySelector(".prod").addEventListener("change", () => {
      const p = db.products.find(
        (x) => x.id === r.querySelector(".prod").value,
      );
      if (p) {
        r.querySelector(".price").value = purchase ? p.cost : p.price;
        r.querySelector(".desc").value = p.name;
      }
      calculate();
    });
    r.querySelectorAll("input").forEach((i) =>
      i.addEventListener("input", calculate),
    );
    r.querySelector("button").addEventListener("click", () => {
      r.remove();
      calculate();
    });
    calculate();
  }
  function set(items = [{}]) {
    rows.replaceChildren();
    items.forEach(add);
  }
  function refreshProducts() {
    rows.querySelectorAll(".prod").forEach((select) => {
      const value = select.value;
      select.innerHTML = option("", purchase ? "Custom expense item" : "Custom item") +
        db.products.map((p) => option(p.id, p.name)).join("");
      select.value = value;
    });
  }
  $("addRow").addEventListener("click", () => add());
  form.elements.namedItem("discount")?.addEventListener("input", calculate);
  form.elements.namedItem("taxRate")?.addEventListener("input", calculate);
  form.elements.namedItem("taxLabel")?.addEventListener("input", calculate);
  set();
  return { values, set, calculate, refreshProducts, add };
}
