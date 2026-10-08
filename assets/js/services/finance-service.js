import { db } from "../repositories/db.js";
import { sum, round, today, dayNumber } from "../core/utils.js";
export const posted = (i) =>
  i && i.state !== "draft" && i.state !== "void" && !i.voided;
export const customerPaid = (id, d = db) =>
  round(
    sum(
      d.payments.filter((p) => p.invoiceId === id),
      (p) => p.amount,
    ),
  );
export const vendorPaid = (id, d = db) =>
  round(
    sum(
      d.vendorPayments.filter((p) => p.purchaseId === id),
      (p) => p.amount,
    ),
  );
export const returnTotal = (id, d = db) =>
  round(
    sum(
      d.returns.filter((r) => r.invoiceId === id && !r.legacy),
      (r) => r.amount,
    ),
  );
export function signedBalance(i, side = "customer", d = db) {
  if (!posted(i)) return 0;
  const incoming = sum(
      d.creditTransfers.filter((t) => t.side === side && t.toId === i.id),
      (t) => t.amount,
    ),
    outgoing = sum(
      d.creditTransfers.filter((t) => t.side === side && t.fromId === i.id),
      (t) => t.amount,
    ),
    refunds = sum(
      d.refunds.filter((r) => r.side === side && r.documentId === i.id),
      (r) => r.amount,
    );
  return round(
    i.total -
      (side === "customer"
        ? customerPaid(i.id, d) +
          returnTotal(i.id, d) +
          Number(i.creditApplied || 0)
        : vendorPaid(i.id, d)) -
      incoming +
      outgoing +
      refunds,
  );
}
export const invoiceBalance = (i, d = db) =>
  Math.max(0, signedBalance(i, "customer", d));
export const purchaseBalance = (i, d = db) =>
  Math.max(0, signedBalance(i, "vendor", d));
export const creditBalance = (i, side = "customer", d = db) =>
  Math.max(0, -signedBalance(i, side, d));
export function status(i, side = "customer", d = db) {
  if (i.state === "draft") return "Draft";
  if (!posted(i)) return "Cancelled";
  const b = signedBalance(i, side, d);
  if (b < 0) return "Credit";
  if (b === 0) return "Paid";
  if (i.dueDate && i.dueDate < today()) return "Overdue";
  return (side === "customer" ? customerPaid(i.id, d) : vendorPaid(i.id, d)) > 0
    ? "Partially Paid"
    : "Unpaid";
}
export const invoiceStatus = (i, d = db) => status(i, "customer", d),
  purchaseStatus = (i, d = db) => status(i, "vendor", d);
export function aging(side, d = db) {
  const buckets = { Current: 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  for (const i of d[side === "customer" ? "invoices" : "purchases"]) {
    const b = Math.max(0, signedBalance(i, side, d));
    if (!b) continue;
    const days = dayNumber(today()) - dayNumber(i.dueDate || i.date),
      key =
        days <= 0
          ? "Current"
          : days <= 30
            ? "1–30"
            : days <= 60
              ? "31–60"
              : days <= 90
                ? "61–90"
                : "90+";
    buckets[key] = round(buckets[key] + b);
  }
  return buckets;
}
export const arAging = () => aging("customer"),
  apAging = () => aging("vendor");
