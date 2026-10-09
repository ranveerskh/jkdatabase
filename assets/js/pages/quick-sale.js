import { $, db, esc, money, toast, navigateTo } from "../app.js";

export function initPage({ signal } = {}) {
  const cart = new Map();
  function canSell(product) {
    return db.settings.stockTracking === false || db.settings.allowNegativeStock || Number(product.qty) > 0;
  }
  function findProduct(code) {
    const value = String(code || "").trim().toLowerCase();
    return db.products.find((p) => String(p.barcode || "").trim().toLowerCase() === value) ||
      db.products.find((p) => String(p.sku || "").trim().toLowerCase() === value);
  }
  function renderCatalog() {
    const query = $("kioskSearch").value.trim().toLowerCase();
    const products = db.products.filter((p) => `${p.name} ${p.sku || ""} ${p.barcode || ""}`.toLowerCase().includes(query));
    $("kioskCatalog").innerHTML = products.length ? products.map((p) => {
      const image = /^data:image\/(png|jpeg|webp);base64,/i.test(p.image || "")
        ? `<img src="${esc(p.image)}" alt="" loading="lazy">`
        : `<span aria-hidden="true">${esc((p.name || "?").slice(0, 1).toUpperCase())}</span>`;
      const count = cart.get(p.id)?.qty || 0;
      return `<button type="button" class="quick-sale-product" data-kiosk-product="${esc(p.id)}" ${canSell(p) ? "" : "disabled"} aria-label="Add ${esc(p.name)} to sale"><span class="quick-sale-image">${image}</span><b>${esc(p.name)}</b><small>${esc(p.sku || p.barcode || "")}</small><strong>${money(p.price)}</strong>${count ? `<i>${count}</i>` : ""}</button>`;
    }).join("") : '<p class="empty">No products found. Try another search or add products to the catalog first.</p>';
    $("kioskHint").textContent = db.products.length ? `${products.length} product${products.length === 1 ? "" : "s"} · Tap a tile to add it to the sale.` : "Your product catalog is empty. Add your products in Product Catalog to start selling.";
  }
  function renderCart() {
    const items = [...cart.values()];
    const qty = items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = items.reduce((sum, item) => sum + item.qty * Number(item.product.price || 0), 0);
    $("kioskCount").textContent = String(qty);
    $("kioskSubtotal").textContent = money(subtotal);
    $("kioskCheckout").disabled = !items.length;
    $("kioskClear").disabled = !items.length;
    $("kioskCart").innerHTML = items.length ? items.map(({ product, qty: count }) => `<div class="quick-sale-cart-item"><div><b>${esc(product.name)}</b><small>${money(product.price)} each</small></div><div class="quick-sale-qty"><button type="button" data-kiosk-qty="-1" data-id="${esc(product.id)}" aria-label="Remove one ${esc(product.name)}">−</button><span>${count}</span><button type="button" data-kiosk-qty="1" data-id="${esc(product.id)}" aria-label="Add one ${esc(product.name)}">+</button></div><b>${money(Number(product.price || 0) * count)}</b></div>`).join("") : '<p class="empty">Tap a product to add it here.</p>';
  }
  function addProduct(product) {
    if (!product) return toast("No product matched that SKU or barcode.");
    if (!canSell(product)) return toast(`${product.name} is out of stock.`);
    const item = cart.get(product.id) || { product, qty: 0 };
    item.qty += 1;
    cart.set(product.id, item);
    renderCart(); renderCatalog();
  }
  function addScannedCode(code) {
    const value = String(code || "").trim();
    if (!value) return;
    addProduct(findProduct(value));
    $("kioskScanCode").value = "";
    $("kioskScanCode").focus();
  }
  $("kioskSearch").addEventListener("input", renderCatalog, { signal });
  $("kioskCatalog").addEventListener("click", (event) => {
    const button = event.target.closest("[data-kiosk-product]");
    if (button) addProduct(db.products.find((p) => p.id === button.dataset.kioskProduct));
  }, { signal });
  $("kioskScanCode").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); addScannedCode(event.currentTarget.value); }
  }, { signal });
  $("kioskCart").addEventListener("click", (event) => {
    const button = event.target.closest("[data-kiosk-qty]");
    if (!button) return;
    const item = cart.get(button.dataset.id);
    if (!item) return;
    item.qty += Number(button.dataset.kioskQty);
    if (item.qty <= 0) cart.delete(button.dataset.id);
    renderCart(); renderCatalog();
  }, { signal });
  $("kioskClear").addEventListener("click", () => { cart.clear(); renderCart(); renderCatalog(); }, { signal });
  $("kioskCheckout").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const lines = [...cart.values()].map(({ product, qty }) => ({
      productId: product.id, qty, unit: product.unit || "pcs", price: Number(product.price || 0), description: product.name,
    }));
    if (!lines.length) return;
    button.disabled = true;
    try {
      sessionStorage.setItem("jkDatabaseKioskCart", JSON.stringify(lines));
      await navigateTo("sales.html?new=sale&kiosk=1");
    } catch (error) { button.disabled = false; toast(`Could not open checkout: ${error.message}`); }
  }, { signal });

  let stream = null, frame = 0;
  function stopScanner() {
    cancelAnimationFrame(frame); frame = 0;
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
    $("kioskVideo").srcObject = null;
    if ($("kioskScanner").open) $("kioskScanner").close();
  }
  $("kioskScan").addEventListener("click", async () => {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      $("kioskScanCode").focus();
      toast("Camera scanning is not supported here. Use a USB/Bluetooth scanner or type the code and press Enter.");
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      const video = $("kioskVideo"); video.srcObject = stream; await video.play(); $("kioskScanner").showModal();
      const scan = async () => {
        if (!stream) return;
        try { const found = await detector.detect(video); if (found.length) { const value = found[0].rawValue; stopScanner(); addScannedCode(value); return; } }
        catch { $("kioskScannerHint").textContent = "Keep the barcode centred and in focus."; }
        frame = requestAnimationFrame(scan);
      };
      frame = requestAnimationFrame(scan);
    } catch (error) {
      stopScanner(); toast(error.name === "NotAllowedError" ? "Allow camera access to scan, or use the scanner input." : "Could not start the camera. Use the scanner input instead.");
    }
  }, { signal });
  $("kioskScannerCancel").addEventListener("click", stopScanner, { signal });
  $("kioskScanner").addEventListener("close", stopScanner, { signal });
  signal?.addEventListener("abort", stopScanner, { once: true });
  renderCatalog(); renderCart();
}
