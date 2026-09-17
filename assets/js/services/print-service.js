import { db, money, esc, toast } from "../app.js";
import {
  invoiceStatus,
  customerPaid,
  invoiceBalance,
  creditBalance,
  returnTotal,
} from "./finance-service.js";
export function printInvoice(id) {
  const i = db.invoices.find((x) => x.id === id);
  const s = i.businessSnapshot || db.settings,
    currency = i.currency || db.settings.currency,
    m = (n) => money(n, currency),
    w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to open the printable invoice.");
  const css = new URL("../../css/print.css", import.meta.url).href;
  w.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(i.number)}</title><link rel="stylesheet" href="${css}"></head><body><button id="print">Print / Save PDF</button><header><div><h1>${esc(s.businessName)}</h1><p>${esc(s.legalName || "")}</p><p class="lines">${esc(s.address)}</p><p>${esc(s.phone)} ${esc(s.email)}</p><p>HST #: ${esc(s.hstNo)}</p></div><div><h2>${i.state === "draft" ? "DRAFT INVOICE" : !i.voided ? "INVOICE" : "VOID INVOICE"}</h2><p>${esc(i.number)}</p><p>Date: ${esc(i.date)}<br>Due: ${esc(i.dueDate)}</p><strong>Status: ${esc(invoiceStatus(i))}</strong></div></header><h3>Bill to</h3><p>${esc(i.customerName)}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${i.items.map((x) => `<tr><td>${esc(x.description)}</td><td>${esc(x.qty)}</td><td>${m(x.price)}</td><td>${m(x.total)}</td></tr>`).join("")}</tbody></table><section>${[
      ["Subtotal", i.subtotal],
      ["Discount", i.discount],
      ["HST", i.tax],
      ["Total", i.total],
      ["Payments", customerPaid(i.id)],
      ["Return credits", returnTotal(i.id)],
      ["Balance due", invoiceBalance(i)],
      ["Available credit", creditBalance(i)],
    ]
      .map(([label, v]) => `<p><span>${label}</span><b>${m(v)}</b></p>`)
      .join(
        "",
      )}</section><p class="lines">${esc(i.notes)}</p><p>Amounts in ${esc(currency)}. Credits allocated between invoices and refunds are reflected in the balance due.</p></body></html>`,
  );
  w.document.close();
  w.document.getElementById("print").addEventListener("click", () => w.print());
}
