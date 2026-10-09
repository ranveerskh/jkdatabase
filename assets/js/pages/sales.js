import { $, db, esc, money, actions, today, toast, invoiceBalance, invoiceStatus, customerPaid, creditBalance, refreshPage, navigateTo, confirmTypedDelete } from "../app.js";
import { saveSaleDeal, savePayment, voidDocument, saveMaster, convertQuoteToSale, finaliseInvoice, deleteRecord, duplicateInvoice, invoiceEditBlockReason, documentCancelBlockReason } from "../services/business-service.js";
import { printInvoice, openPrintWindow } from "../services/print-service.js";
import { lineEditor } from "./line-editor.js";
import { compressProductImage } from "../core/product-image.js";

export function initPage({ signal } = {}) {
const form = $("form"), dlg = $("dlg"), paymentForm = $("paymentForm");
let currentTotal = 0, activeFilter = "all", dueDateManuallySet = false;
const addDays = (iso, days) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + Number(days || 0)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const lines = lineEditor(false, { onTotals: (t) => { currentTotal = t?.total || 0; syncPayment(); } });
function renderCatalog() {
  const query = $("catalogSearch").value.trim().toLowerCase();
  const products = db.products.filter((p) => `${p.name} ${p.sku || ""} ${p.barcode || ""}`.toLowerCase().includes(query));
  $("productCatalog").innerHTML = products.length ? products.map((p) => {
    const unavailable = db.settings.stockTracking !== false && dealType() === "sale" && !db.settings.allowNegativeStock && Number(p.qty) <= 0;
    const thumb = /^data:image\/(png|jpeg|webp);base64,/i.test(p.image || "")
      ? `<img src="${p.image}" alt="" loading="lazy">` : esc((p.name || "?").slice(0, 1).toUpperCase());
    return `<button type="button" class="catalog-product" data-product-id="${esc(p.id)}" ${unavailable ? "disabled" : ""} aria-label="Add ${esc(p.name)} to sale"><span class="catalog-product-thumb">${thumb}</span><span class="catalog-product-info"><b>${esc(p.name)}</b><small>${esc(p.sku || p.barcode || "No SKU")}</small><small>${money(p.price)}</small></span></button>`;
  }).join("") : '<p class="empty">No matching products.</p>';
  $("catalogMessage").textContent = products.length ? "Tap a product to add it. Tap it again to increase the quantity." : "Add a product in Product Catalog or change your search.";
}
function addScannedCode(raw) {
  const code = String(raw || "").trim().toLowerCase();
  if (!code) return;
  const product = db.products.find((p) => String(p.barcode || "").trim().toLowerCase() === code) ||
    db.products.find((p) => String(p.sku || "").trim().toLowerCase() === code);
  if (!product) { toast(`No product found for “${String(raw).trim()}”. Check its SKU or barcode.`); return; }
  if (db.settings.stockTracking !== false && !db.settings.allowNegativeStock && Number(product.qty) <= 0) { toast(`${product.name} is out of stock.`); return; }
  lines.addOrIncrementProduct(product.id);
  toast(`${product.name} added to this sale.`, "ok");
}

function populateCustomers() {
  $("customerList").innerHTML = db.customers.map((c) => `<option value="${esc(c.name)}" label="${esc([c.phone,c.email].filter(Boolean).join(" · "))}"></option>`).join("");
}
function customerByInput() {
  const name = $("customerName").value.trim().toLowerCase();
  const candidates = db.customers.filter((c) => c.name.trim().toLowerCase() === name);
  const phone = $("customerPhone").value.replace(/\D/g, ""), email = $("customerEmail").value.trim().toLowerCase();
  return candidates.find((c) => (email && String(c.email||"").toLowerCase() === email) || (phone && String(c.phone||"").replace(/\D/g,"") === phone)) || (candidates.length === 1 ? candidates[0] : null);
}
function syncCustomer() {
  const c = customerByInput();
  $("customerId").value = c?.id || "";
  if (c) {
    $("customerPhone").value ||= c.phone || ""; $("customerEmail").value ||= c.email || ""; $("customerAddress").value ||= c.address || "";
    $("customerMessage").textContent = "Existing customer selected. Contact details will be linked to this transaction.";
  } else $("customerMessage").textContent = "New customer will be saved with this sale.";
}
function dealType() { return form.elements.namedItem("dealType").value; }
function syncDealType() {
  const quote = dealType() === "quote";
  $("paymentSection").hidden = quote; $("dueWrap").hidden = quote; $("validWrap").hidden = !quote;
  $("dueDate").disabled = quote;
  $("validUntil").disabled = !quote;
  $("validUntil").required = quote;
  $("paymentSection").querySelectorAll("input,select").forEach((input) => input.disabled = quote);
  $("dateLabel").textContent = quote ? "Quote date" : "Sale date";
  $("modalTitle").textContent = quote ? "New Quote" : "New Sale";
  form.querySelector('button[value="save"]').textContent = quote ? "Save Quote" : "Save Sale";
  form.querySelector('button[value="preview"]').hidden = quote;
}
function syncPayment() {
  const preset = form.elements.namedItem("paymentPreset")?.value || "full";
  const amountEl = $("paymentAmount");
  if (preset === "full") amountEl.value = currentTotal.toFixed(2);
  if (preset === "unpaid") amountEl.value = "0.00";
  amountEl.readOnly = preset !== "partial";
  const paid = Number(amountEl.value || 0), balance = Math.round((currentTotal - paid)*100)/100;
  $("payTotal").textContent = money(currentTotal); $("payNow").textContent = money(paid);
  $("payBalance").textContent = balance >= 0 ? money(balance) : `${money(-balance)} credit`;
}
function invoiceActions(x, due) {
  const draft = x.state === "draft",
    cancelReason = documentCancelBlockReason(db, "invoices", x.id),
    editReason = invoiceEditBlockReason(db, x.id),
    edit = editReason
      ? `<button type="button" class="btn small" disabled title="${esc(editReason)}">Edit</button><small class="record-menu-note">${esc(editReason)}</small>`
      : `<button type="button" class="btn small" data-action="edit" data-id="${esc(x.id)}">Edit</button>`,
    controls = [
      `<button type="button" class="btn small" data-action="preview" data-id="${esc(x.id)}">Preview / Print</button>`,
      draft ? edit : (due > 0 && !x.voided ? `<button type="button" class="btn small primary" data-action="pay" data-id="${esc(x.id)}">Receive Payment</button>` : ""),
      !draft && !x.voided ? `<button type="button" class="btn small" data-action="return" data-id="${esc(x.id)}">Return / credit note</button>` : "",
      `<button type="button" class="btn small" data-action="duplicate" data-id="${esc(x.id)}">Duplicate draft</button>`,
      draft
        ? `<button type="button" class="btn small primary" data-action="finalise" data-id="${esc(x.id)}">Finalise</button><button type="button" class="btn small danger" data-action="delete" data-id="${esc(x.id)}">Delete draft</button>`
        : (!x.voided ? (cancelReason ? `<button type="button" class="btn small danger" disabled>Cancel invoice</button><small class="record-menu-note">${esc(cancelReason)}</small>` : `<button type="button" class="btn small danger" data-action="void" data-id="${esc(x.id)}">Cancel invoice</button>`) : `<small class="record-menu-note">This invoice was cancelled and is retained for history.</small>`),
      !draft ? edit : "",
      !draft ? `<small class="record-menu-note">Finalised invoices are kept for accounting history and cannot be deleted.</small>` : "",
    ].filter(Boolean).join("");
  return `<details class="record-menu"><summary class="btn small" aria-label="Actions for ${esc(x.number)}">Actions <span aria-hidden="true">▾</span></summary><div class="record-menu-panel">${controls}</div></details>`;
}
function openDeal(kind="sale", source=null) {
  form.reset(); $("customerId").value = ""; $("date").value = today(); $("paymentDate").value = today();
  dueDateManuallySet = false;
  form.elements.namedItem("taxLabel").value = source?.taxLabel || db.settings.taxLabel || "HST";
  form.elements.namedItem("taxRate").value = source?.taxRate ?? db.settings.hstRate;
  $("dueDate").value = today(); $("validUntil").value = addDays(today(), db.settings.defaultQuoteDays || 30);
  form.querySelector(`input[name="dealType"][value="${kind}"]`).checked = true;
  form.querySelector('input[name="paymentPreset"][value="full"]').checked = true;
  if (source) {
    $("customerId").value = source.customerId || ""; $("customerName").value = source.customerName || "";
    const c = db.customers.find((x) => x.id === source.customerId), person = c?.personId ? db.people?.find((p) => p.id === c.personId) : null, profile = person || c;
    $("customerPhone").value = profile?.phone || ""; $("customerEmail").value = profile?.email || ""; $("customerAddress").value = profile?.address || "";
    form.elements.namedItem("discount").value = source.discount || 0; $("notes").value = source.notes || ""; lines.set(source.items || [{}]);
    form.querySelector('input[name="paymentPreset"][value="unpaid"]').checked = true;
  } else lines.set([{}]);
  syncCustomer(); syncDealType(); lines.calculate(); syncPayment(); dlg.showModal();
  setTimeout(() => $("customerName").focus(), 0);
}

populateCustomers();
$("newSale").addEventListener("click", () => openDeal("sale")); $("newQuote").addEventListener("click", () => openDeal("quote"));
$("dueDate").addEventListener("input", () => { dueDateManuallySet = true; });
$("date").addEventListener("input", () => {
  if (!dueDateManuallySet && dealType() === "sale") $("dueDate").value = $("date").value;
});
[$("customerName"), $("customerPhone"), $("customerEmail")].forEach((e) => e.addEventListener("change", syncCustomer));
form.querySelectorAll('input[name="dealType"]').forEach((e) => e.addEventListener("change", syncDealType));
form.querySelectorAll('input[name="dealType"]').forEach((e) => e.addEventListener("change", renderCatalog));
form.querySelectorAll('input[name="paymentPreset"]').forEach((e) => e.addEventListener("change", syncPayment));
$("paymentAmount").addEventListener("input", syncPayment);
$("productCatalog").addEventListener("click", (e) => { const b = e.target.closest("[data-product-id]"); if (b) lines.addOrIncrementProduct(b.dataset.productId); });
$("catalogSearch").addEventListener("input", renderCatalog);
$("scanCode").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addScannedCode(e.currentTarget.value); e.currentTarget.value = ""; e.currentTarget.focus(); } });
let scannerStream = null, scannerFrame = 0;
function closeScanner() {
  cancelAnimationFrame(scannerFrame); scannerFrame = 0;
  scannerStream?.getTracks().forEach((track) => track.stop()); scannerStream = null;
  $("scannerVideo").srcObject = null; $("scannerDlg").close();
}
$("scanProduct").addEventListener("click", async () => {
  if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
    $("scanCode").focus(); toast("Camera scanning is not supported in this browser. Use a USB/Bluetooth barcode scanner or type the SKU/barcode."); return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    const video = $("scannerVideo"); video.srcObject = scannerStream; await video.play();
    $("scannerDlg").showModal();
    const scan = async () => {
      if (!scannerStream) return;
      try { const found = await detector.detect(video); if (found.length) { const value = found[0].rawValue; closeScanner(); addScannedCode(value); return; } }
      catch { $("scannerMessage").textContent = "Keep the barcode centred and in focus."; }
      scannerFrame = requestAnimationFrame(scan);
    };
    scannerFrame = requestAnimationFrame(scan);
  } catch (error) {
    closeScanner(); toast(error.name === "NotAllowedError" ? "Allow camera access to scan a barcode, or use the scanner input." : "Could not start the camera. Use the scanner input instead.");
  }
});
$("scannerCancel").addEventListener("click", closeScanner);
$("scannerDlg").addEventListener("close", () => { cancelAnimationFrame(scannerFrame); scannerFrame = 0; scannerStream?.getTracks().forEach((track) => track.stop()); scannerStream = null; $("scannerVideo").srcObject = null; });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitter = e.submitter, buttons = [...form.querySelectorAll("button")]; buttons.forEach((b)=>b.disabled=true);
  const preview = submitter?.value === "preview" ? openPrintWindow() : null;
  let saved = false;
  try {
    syncCustomer();
    const o = Object.fromEntries(new FormData(form));
    const result = await saveSaleDeal(o, lines.values());
    saved = true;
    dlg.close(); populateCustomers(); render();
    toast(result.kind === "quote" ? "Quote saved successfully." : "Sale saved successfully.", "ok");
    if (submitter?.value === "preview" && result.kind === "invoice") {
      if (preview) printInvoice(result.id, preview);
      else toast("Sale saved. Allow pop-ups, then choose Preview / Print from its Actions menu.");
    }
  } catch (err) { preview?.close(); toast(saved ? `Sale saved. Preview could not open: ${err.message} Use Preview / Print from Actions; do not save again.` : err.message); }
  finally { buttons.forEach((b)=>b.disabled=false); }
});

function render() {
  const q = $("search").value.trim().toLowerCase();
  const records = [
    ...db.invoices.map((x) => ({...x, kind:"sale"})),
    ...db.quotes.map((x) => ({...x, kind:"quote"})),
  ].sort((a,b) => (b.date||"").localeCompare(a.date||"") || String(b.number).localeCompare(String(a.number)));
  const filtered = records.filter((x) => {
    const text = `${x.number} ${x.customerName} ${x.date} ${x.kind === "sale" ? invoiceStatus(x) : x.status}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (activeFilter === "sale" || activeFilter === "quote") return x.kind === activeFilter;
    if (x.kind === "quote") return activeFilter === "all";
    const status = invoiceStatus(x).toLowerCase();
    if (activeFilter === "due") return invoiceBalance(x) > 0;
    if (activeFilter === "paid") return status === "paid" || status === "credit";
    if (activeFilter === "unpaid") return status === "unpaid" || status === "overdue" || status === "partially paid";
    return true;
  });
  $("count").textContent = `${filtered.length} of ${records.length} records`;
  $("list").innerHTML = filtered.length ? filtered.map((x) => {
    if (x.kind === "quote") return `<article class="record-card" data-search="${esc((x.customerName+' '+x.number).toLowerCase())}"><div class="record-main"><b>${esc(x.customerName)}</b><small>${esc(x.number)} · Quote · ${esc(x.date)}</small></div><div class="record-stat"><small>Total</small><b>${money(x.total)}</b></div><div class="record-stat"><small>Valid until</small><b>${esc(x.validUntil||'—')}</b></div><div class="record-stat optional-stat"><small>Status</small><b>${esc(x.status)}</b></div><div class="record-stat optional-stat"><small>Type</small><b>Quote only</b></div><div class="record-actions">${x.status !== "Converted" ? `<button class="btn small primary" data-action="convert" data-id="${esc(x.id)}">Convert to Sale</button>` : `<span class="badge paid">Converted</span>`}</div></article>`;
    const status = invoiceStatus(x), due = invoiceBalance(x), credit = creditBalance(x);
    return `<article class="record-card"><div class="record-main"><b>${esc(x.customerName)}</b><small>${esc(x.number)} · ${esc(x.date)}</small></div><div class="record-stat"><small>Total</small><b>${money(x.total)}</b></div><div class="record-stat"><small>Paid</small><b>${money(customerPaid(x.id))}</b></div><div class="record-stat optional-stat"><small>Due</small><b>${money(due)}</b></div><div class="record-stat optional-stat"><small>Status</small><b><span class="badge ${esc(status.toLowerCase().replaceAll(' ',''))}">${esc(status)}</span>${credit ? ` · ${money(credit)} credit` : ''}</b></div><div class="record-actions">${invoiceActions(x,due)}</div></article>`;
  }).join("") : '<div class="empty card">No matching sales or quotes.</div>';
}
$("search").addEventListener("input", render);
$("filters").addEventListener("click", (e) => { const b=e.target.closest("[data-filter]"); if(!b)return; activeFilter=b.dataset.filter; $("filters").querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b)); render(); });

$("list").addEventListener("click", async (e) => {
  const b=e.target.closest("[data-action]"); if(!b)return; const id=b.dataset.id, action=b.dataset.action;
  try {
    if(action==="preview") printInvoice(id);
    if(action==="duplicate") { const duplicateId=await duplicateInvoice(id); await navigateTo(`invoices.html?edit=${encodeURIComponent(duplicateId)}`); }
    if(action==="edit") await navigateTo(`invoices.html?edit=${encodeURIComponent(id)}`);
    if(action==="return") await navigateTo(`returns.html?invoice=${encodeURIComponent(id)}`);
    if(action==="finalise" && confirm("Finalise this invoice and record it in your reports?")){ await finaliseInvoice(id); await refreshPage(); }
    if(action==="delete" && await confirmTypedDelete("draft invoice", "Only drafts can be deleted. Finalised invoices are retained for accounting history.")){ await deleteRecord("invoices",id); await refreshPage(); }
    if(action==="convert") { if(confirm("Convert this quote to an invoice? It will start unpaid.")){ const preview = openPrintWindow(); try { const invoiceId=await convertQuoteToSale(id); printInvoice(invoiceId, preview); await refreshPage(); } catch (error) { preview?.close(); throw error; } } }
    if(action==="void" && confirm("Cancel this unpaid invoice? The outstanding balance will be removed. The invoice will remain in history.")){ await voidDocument("invoices",id); await refreshPage(); }
    if(action==="pay") {
      const i=db.invoices.find((x)=>x.id===id); paymentForm.reset(); paymentForm.elements.invoiceId.value=id; paymentForm.elements.amount.value=invoiceBalance(i).toFixed(2); paymentForm.elements.date.value=today(); $("paymentDoc").textContent=`${i.number} · ${i.customerName} · Remaining ${money(invoiceBalance(i))}`; $("paymentDlg").showModal();
    }
  } catch(err){ toast(err.message); }
});

paymentForm.addEventListener("submit", async(e)=>{ e.preventDefault(); const btn=e.submitter; btn.disabled=true; try{ await savePayment("customer",Object.fromEntries(new FormData(paymentForm))); toast("Payment recorded.","ok"); await refreshPage(); }catch(err){toast(err.message);btn.disabled=false;} });
$("paymentCancel").addEventListener("click",()=>$("paymentDlg").close());

$("quickProduct").addEventListener("click",()=>{ $("productForm").reset(); delete $("productForm").elements.imageFile.dataset.compressed; $("quickProductImagePreview").hidden = true; $("productDlg").showModal(); });
$("productCancel").addEventListener("click",()=>$("productDlg").close());
$("productForm").elements.imageFile.addEventListener("change", async (e) => { if (!e.target.files[0]) return; try { const image = await compressProductImage(e.target.files[0]); $("quickProductImagePreview").src = image; $("quickProductImagePreview").hidden = false; e.target.dataset.compressed = image; } catch (error) { e.target.value = ""; toast(error.message); } });
$("productForm").addEventListener("submit",async(e)=>{e.preventDefault(); const btn=e.submitter;btn.disabled=true;try{const o=Object.fromEntries(new FormData($("productForm")));o.image=$("productForm").elements.imageFile.dataset.compressed||"";const id=await saveMaster("products",o);$("productDlg").close();renderCatalog();lines.useProduct(id);toast("Product created and selected.","ok");}catch(err){toast(err.message);}finally{btn.disabled=false;}});

document.addEventListener("keydown",(e)=>{ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="n"&&!dlg.open){e.preventDefault();openDeal("sale");} }, { signal });
render(); renderCatalog();
const pageParams = new URLSearchParams(location.search);
if (pageParams.get("new") === "sale" || pageParams.get("new") === "quote")
  openDeal(pageParams.get("new"));

}
