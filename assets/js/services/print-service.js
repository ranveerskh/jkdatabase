import { db, money, esc, toast } from "../app.js";
import { invoiceStatus, purchaseStatus, customerPaid, vendorPaid, invoiceBalance, purchaseBalance, creditBalance, returnTotal } from "./finance-service.js";

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
  return docShell({ title:i.number, label:i.state==="draft"?"DRAFT INVOICE":i.voided?"VOID INVOICE":"INVOICE", number:i.number, date:i.date, dueLabel:"Due date", due:i.dueDate, status:invoiceStatus(i), business:s, partyTitle:"Bill to", party:{...c,name:c.name||i.customerName}, items:i.items||[], currency, notes:i.notes, printWindow, totals:[["Subtotal",i.subtotal],["Discount",i.discount],["HST",i.tax],["Total",i.total,"grand"],["Paid",customerPaid(i.id)],["Return credits",returnTotal(i.id)],["Balance due",invoiceBalance(i),"balance"],["Available credit",creditBalance(i)]] });
}

export function printPurchase(id, printWindow) {
  const i=db.purchases.find((x)=>x.id===id); if(!i) return toast("Purchase no longer exists.");
  const s=db.businessProfiles?.find((x)=>x.id===i.businessProfileId)?.settings || i.businessSnapshot || db.settings, v=i.vendorSnapshot || (i.vendorId ? db.vendors.find((x)=>x.id===i.vendorId) : null) || {name:i.vendorName};
  const currency=i.currency||db.settings.currency;
  return docShell({ title:i.number, label:i.voided?"VOID PURCHASE":"PURCHASE BILL", number:i.number, date:i.date, dueLabel:"Due date", due:i.dueDate, status:purchaseStatus(i), business:s, partyTitle:"Vendor", party:{...v,name:v.name||i.vendorName}, items:i.items||[], currency, notes:[i.vendorBillNo?`Vendor bill #: ${i.vendorBillNo}`:"",i.notes||""].filter(Boolean).join("\n"), printWindow, totals:[["Subtotal",i.subtotal],["HST",i.tax],["Total",i.total,"grand"],["Paid",vendorPaid(i.id)],["Balance due",purchaseBalance(i),"balance"],["Vendor advance",creditBalance(i,"vendor")]] });
}
