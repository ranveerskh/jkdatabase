import { $, db, esc, table } from "../app.js";

export function initPage({ signal } = {}) {
const invoiceRevision = (invoice) => {
  if (!invoice) return "No snapshot";
  const lines = (invoice.items || []).map((item) => `${item.description || "Item"} · ${item.qty} × ${item.price}`).join("\n") || "No line items";
  return `<div class="revision-snapshot"><strong>${esc(invoice.number || "Invoice")}</strong><br>${esc(invoice.customerName || "Walk-in Customer")} · ${esc(invoice.date || "")}<br>Subtotal ${esc(invoice.subtotal)} · ${esc(invoice.taxLabel || "HST")} (${esc(invoice.taxRate ?? 0)}%) ${esc(invoice.tax)}<br><strong>Total ${esc(invoice.total)}</strong><pre>${esc(lines)}</pre></div>`;
};

$("list").innerHTML = table(
  ["Time", "Action", "Detail"],
  db.audit.map((x) => {
    const revision = x.action === "Invoice revised" && x.before && x.after
      ? `<details class="audit-revision"><summary>Compare saved versions</summary><div class="revision-compare"><section><h3>Before</h3>${invoiceRevision(x.before)}</section><section><h3>After</h3>${invoiceRevision(x.after)}</section></div></details>`
      : "";
    return `<tr><td>${esc(new Date(x.at).toLocaleString())}</td><td>${esc(x.action)}</td><td>${esc(x.detail)}${revision}</td></tr>`;
  }),
);

}
