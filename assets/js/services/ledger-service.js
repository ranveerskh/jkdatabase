import { uid, today, round, number, textValue } from "../core/utils.js";
export function audit(d, action, detail = "", entity = "") {
  d.audit.unshift({
    id: uid("log"),
    at: new Date().toISOString(),
    action,
    detail,
    entity,
  });
}
export function stockMove(
  d,
  productId,
  qty,
  type,
  reference = "",
  note = "",
  date = today(),
) {
  const p = d.products.find((x) => x.id === productId);
  if (!p) throw Error("Inventory item no longer exists.");
  qty = number(qty, "Stock change", -1e9);
  const balance = round(Number(p.qty || 0) + qty);
  if (balance < 0 && !d.settings.allowNegativeStock)
    throw Error(`Not enough stock for ${p.name}. Available: ${p.qty}.`);
  p.qty = balance;
  d.stockLedger.unshift({
    id: uid("stk"),
    at: new Date().toISOString(),
    date,
    productId,
    qty,
    type,
    reference,
    note,
    balance,
  });
  audit(d, "Stock movement", `${type}: ${qty} · ${reference}`, productId);
}
export function nextNumber(d, type) {
  const config = {
    invoices: ["invoicePrefix", "nextInvoice", "INV"],
    purchases: ["purchasePrefix", "nextPurchase", "PB"],
    quotes: ["quotePrefix", "nextQuote", "QT"],
    returns: ["returnPrefix", "nextReturn", "RT"],
  }[type];
  const [pk, nk, fallback] = config;
  const prefix = textValue(d.settings[pk] || fallback, "Prefix");
  let n = Math.max(1, Math.floor(Number(d.settings[nk]) || 1)),
    v;
  do {
    v = `${prefix}-${String(n++).padStart(4, "0")}`;
  } while (d[type].some((x) => x.number === v));
  d.settings[nk] = n;
  return v;
}
