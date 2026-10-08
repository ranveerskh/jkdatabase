import { db, money, esc, toast } from "../app.js";
import { purchaseStatus, vendorPaid, purchaseBalance, creditBalance } from "./finance-service.js";

function openPrintWindow(title) {
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to open the printable document."); return null; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><p>Preparing document…</p></body></html>`);
  w.document.close();
  return w;
}
function docShell({ title, label, number, date, dueLabel, due, status, business, partyTitle, party, items, totals, notes, currency, printWindow }) {
  const w = printWindow || openPrintWindow(number); if (!w) return;
  const css = new URL("../../css/print.css", import.meta.url).href;
  const s = business || db.settings, accent = /^#[0-9a-f]{6}$/i.test(s.accentColor || "") ? s.accentColor : "#163a70";
  const logo = s.logoDataUrl ? `<img class="doc-logo" src="${esc(s.logoDataUrl)}" alt="Business logo">` : "";
  const p = party || {};
  w.document.open();
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${css}"><style>:root{--doc-accent:${accent}}</style></head><body>
  <button class="print-button" id="print">Print / Save PDF</button>
  <main class="document">
    <header class="doc-header"><div class="identity">${logo}<div><h1>${esc(s.businessName || "JK Database")}</h1>${s.legalName ? `<p>${esc(s.legalName)}</p>` : ""}<p class="pre">${esc(s.address || "")}</p><p>${esc(s.phone || "")}${s.phone && s.email ? " · " : ""}${esc(s.email || "")}</p>${s.hstNo ? `<p>HST #: ${esc(s.hstNo)}</p>` : ""}</div></div><div class="doc-meta"><h2>${esc(label)}</h2><strong>${esc(number)}</strong><dl><dt>Date</dt><dd>${esc(date)}</dd><dt>${esc(dueLabel)}</dt><dd>${esc(due || "—")}</dd><dt>Status</dt><dd><span class="doc-status">${esc(status)}</span></dd></dl></div></header>
    <section class="billto"><span>${esc(partyTitle)}</span><h3>${esc(p.name || "")}</h3>${p.contact ? `<p>${esc(p.contact)}</p>` : ""}<p>${esc(p.phone || "")}${p.phone && p.email ? " · " : ""}${esc(p.email || "")}</p><p class="pre">${esc(p.address || "")}</p></section>
    <table class="doc-table"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>${items.map((x)=>`<tr><td>${esc(x.description)}</td><td class="num">${esc(x.qty)}</td><td class="num">${money(x.price,currency)}</td><td class="num">${money(x.total,currency)}</td></tr>`).join("")}</tbody></table>
    <div class="totals-wrap"><section class="doc-totals">${totals.map(([k,v,cls=""])=>`<p class="${cls}"><span>${esc(k)}</span><b>${money(v,currency)}</b></p>`).join("")}</section></div>
    ${notes ? `<section class="doc-notes"><h4>Notes</h4><p class="pre">${esc(notes)}</p></section>` : ""}
    <footer class="doc-footer">${s.paymentInstructions ? `<div><b>Payment instructions</b><p class="pre">${esc(s.paymentInstructions)}</p></div>` : ""}${s.invoiceTerms ? `<div><b>Terms</b><p class="pre">${esc(s.invoiceTerms)}</p></div>` : ""}<p class="thankyou">${esc(s.thankYouMessage || "Thank you for your business.")}</p><p class="currency">Amounts in ${esc(currency)} · <span class="page-no">Page</span></p></footer>
  </main></body></html>`);
  w.document.close();
  w.document.getElementById("print")?.addEventListener("click",()=>w.print());
  return w;
}

export function printInvoice(id, printWindow) {
  const i=db.invoices.find((x)=>x.id===id); if(!i) return toast("Invoice no longer exists.");
  const s=db.businessProfiles?.find((x)=>x.id===i.businessProfileId)?.settings || i.businessSnapshot || db.settings, c=i.customerSnapshot || (i.customerId ? db.customers.find((x)=>x.id===i.customerId) : null) || {name:i.customerName};
  const currency=i.currency||db.settings.currency;
  const w = printWindow || openPrintWindow(i.number); if (!w) return;
  const css = new URL("../../css/invoice-print.css", import.meta.url).href;
  const businessName = s.businessName || s.legalName || "JK Database",
    sellerName = s.legalName || s.businessName || businessName,
    storedRate = i.taxRate !== undefined && i.taxRate !== null && i.taxRate !== "" ? Number(i.taxRate) : NaN,
    snapshotRate = s.hstRate !== undefined && s.hstRate !== null && s.hstRate !== "" ? Number(s.hstRate) : NaN,
    derivedRate = Number(i.taxable) > 0 ? Math.round((Number(i.tax) / Number(i.taxable)) * 10000) / 100 : NaN,
    rate = Number.isFinite(storedRate) ? storedRate : Number.isFinite(snapshotRate) ? snapshotRate : Number.isFinite(derivedRate) ? derivedRate : Number(db.settings.hstRate || 0),
    rateText = String(rate),
    taxLabel = String(i.taxLabel || s.taxLabel || "HST").trim().toUpperCase(),
    amountDue = i.voided ? 0 : Math.max(0, invoiceBalance(i)),
    status = i.voided ? "VOID" : i.state === "draft" ? "DRAFT" : "",
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const invoiceDate = (v) => {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}` : String(v || "—");
  };
  const logo = s.logoDataUrl ? `<img class="invoice-logo" src="${esc(s.logoDataUrl)}" alt="Business logo">` : "";
  const billTo = c || {};
  const contact = [billTo.phone, billTo.email].filter(Boolean).map(esc).join(" · ");
  const itemRows = (i.items || []).map((x) => `<tr><td>${esc(x.description)}</td><td class="invoice-num">${money(x.price, currency)}</td><td class="invoice-num">${esc(x.qty)}</td><td class="invoice-num">${money(x.total ?? Number(x.qty || 0) * Number(x.price || 0), currency)}</td></tr>`).join("");
  const discountRow = Number(i.discount) > 0 ? `<div class="invoice-total-row"><span>Discount</span><b>−${money(i.discount, currency)}</b></div>` : "";
  const notes = i.notes ? `<section class="invoice-extra"><b>Notes</b><p>${esc(i.notes)}</p></section>` : "";
  const instructions = s.paymentInstructions ? `<section class="invoice-extra"><b>Payment instructions</b><p>${esc(s.paymentInstructions)}</p></section>` : "";
  const terms = s.invoiceTerms ? `<section class="invoice-extra"><b>Terms</b><p>${esc(s.invoiceTerms)}</p></section>` : "";
  w.document.open();
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(i.number)} · Invoice</title><link rel="stylesheet" href="${css}"></head><body>
    <button class="invoice-print-button" id="print">Print / Save PDF</button>
    <main class="invoice-document">
      <header class="invoice-header">
        <div class="invoice-seller"><h1>INVOICE</h1><div class="invoice-seller-details">${logo}<div><h2>${esc(sellerName)}</h2>${s.address ? `<p class="invoice-pre">${esc(s.address)}</p>` : ""}${s.phone ? `<p>${esc(s.phone)}</p>` : ""}${s.email ? `<p>${esc(s.email)}</p>` : ""}${s.hstNo ? `<p>Tax Reg No. : ${esc(s.hstNo)}</p>` : ""}</div></div></div>
        <div class="invoice-business-name">${esc(businessName)}${status ? `<span class="invoice-status">${esc(status)}</span>` : ""}</div>
      </header>
      <section class="invoice-billto">
        <div class="invoice-customer"><span>BILL TO</span><h3>${esc(billTo.name || i.customerName || "Walk-in Customer")}</h3>${billTo.contact ? `<p>${esc(billTo.contact)}</p>` : ""}${contact ? `<p>${contact}</p>` : ""}${billTo.address ? `<p class="invoice-pre">${esc(billTo.address)}</p>` : ""}</div>
        <dl class="invoice-meta"><div><dt>INVOICE #</dt><dd>${esc(i.number)}</dd></div><div><dt>ISSUED</dt><dd>${esc(invoiceDate(i.date))}</dd></div></dl>
      </section>
      <table class="invoice-table"><thead><tr><th>Item</th><th class="invoice-num">Price</th><th class="invoice-num">Quantity</th><th class="invoice-num">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
      <section class="invoice-total-group"><div class="invoice-totals">
        <div class="invoice-total-row"><span>Subtotal</span><b>${money(i.subtotal, currency)}</b></div>
        ${discountRow}
        <div class="invoice-total-row"><span>${esc(taxLabel)} (${esc(rateText)}%)</span><b>${money(i.tax, currency)}</b></div>
        <div class="invoice-total-row invoice-total-final"><span>Total</span><b>${money(i.total, currency)}</b></div>
      </div><div class="invoice-amount-due"><b>Amount Due</b><strong>${money(amountDue, currency)}</strong></div></section>
      ${notes}${instructions}${terms}
    </main></body></html>`);
  w.document.close();
  w.document.getElementById("print")?.addEventListener("click", () => w.print());
  return w;
}

export function printPurchase(id, printWindow) {
  const i=db.purchases.find((x)=>x.id===id); if(!i) return toast("Purchase no longer exists.");
  const s=db.businessProfiles?.find((x)=>x.id===i.businessProfileId)?.settings || i.businessSnapshot || db.settings, v=i.vendorSnapshot || (i.vendorId ? db.vendors.find((x)=>x.id===i.vendorId) : null) || {name:i.vendorName};
  const currency=i.currency||db.settings.currency;
  const rate = Number(i.taxRate ?? s.hstRate ?? 0), rateText = rate.toFixed(2).replace(/\.?0+$/, ""), taxLabel = String(i.taxLabel || s.taxLabel || "HST").toUpperCase();
  return docShell({ title:i.number, label:i.voided?"VOID PURCHASE":"PURCHASE BILL", number:i.number, date:i.date, dueLabel:"Due date", due:i.dueDate, status:purchaseStatus(i), business:s, partyTitle:"Vendor", party:{...v,name:v.name||i.vendorName}, items:i.items||[], currency, notes:[i.vendorBillNo?`Vendor bill #: ${i.vendorBillNo}`:"",i.notes||""].filter(Boolean).join("\n"), printWindow, totals:[["Subtotal",i.subtotal],[`${taxLabel} (${rateText}%)`,i.tax],["Total",i.total,"grand"],["Paid",vendorPaid(i.id)],["Balance due",purchaseBalance(i),"balance"],["Vendor advance",creditBalance(i,"vendor")]] });
}
