import {
  $,
  db,
  esc,
  money,
  table,
  button,
  option,
  actions,
  submit,
  run,
  today,
  posted,
  signedBalance,
  creditsUI,
} from "../app.js";
import { savePayment, deleteRecord } from "../services/business-service.js";
export function paymentPage(side) {
  const customer = side === "customer",
    type = customer ? "payments" : "vendorPayments",
    docs = db[customer ? "invoices" : "purchases"],
    key = customer ? "invoiceId" : "purchaseId",
    select = $(customer ? "invoice" : "purchase");
  select.innerHTML =
    option("", "Choose a document") +
    docs
      .filter(posted)
      .map((i) =>
        option(
          i.id,
          `${i.number} · ${i.customerName || i.vendorName} · Balance ${money(Math.max(0, signedBalance(i, side)))}`,
        ),
      )
      .join("");
  $("date").value = today();
  if ($("count")) $("count").textContent = `${db[type].length} payments`;
  $("list").innerHTML = table(
    ["Date", "Document", "Account", "Method", "Reference", "Amount", ""],
    db[type]
      .slice()
      .reverse()
      .map((p) => {
        const i = docs.find((x) => x.id === p[key]);
        return `<tr><td>${esc(p.date)}</td><td>${esc(i?.number || "Imported missing document")}</td><td>${esc(i?.customerName || i?.vendorName || "—")}</td><td>${esc(p.method)}</td><td>${esc(p.reference)}</td><td>${money(p.amount)}</td><td>${button("Remove error", "delete", p.id, "danger")}</td></tr>`;
      }),
  );
  actions($("list"), {
    delete: (id) => {
      if (
        confirm(
          "Remove this mistaken payment entry? Linked credit use will block removal.",
        )
      )
        run(() => deleteRecord(type, id));
    },
  });
  submit($("form"), (o) => savePayment(side, o));
  const panel = document.createElement("div");
  panel.className = "card credit-panel";
  document.querySelector("main").append(panel);
  creditsUI(side, panel);
}
