import { transaction } from "../repositories/db.js";
import {
  uid,
  today,
  round,
  number,
  dateValue,
  textValue,
  sum,
} from "../core/utils.js";
import { audit, stockMove, nextNumber } from "./ledger-service.js";
import {
  posted,
  signedBalance,
  creditBalance,
  invoiceBalance,
} from "./finance-service.js";
const find = (d, type, id) => {
  const x = d[type].find((x) => x.id === id);
  if (!x) throw Error("Record no longer exists. Reload and try again.");
  return x;
};
const clean = (o) =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([k]) => !["__proto__", "constructor", "prototype"].includes(k),
    ),
  );
function dates(o) {
  dateValue(o.date);
  if (o.dueDate) {
    dateValue(o.dueDate);
    if (o.dueDate < o.date)
      throw Error("Due date cannot be before document date.");
  }
}
function percentage(v, label = "Tax rate") {
  const n = Number(v);
  if (v === "" || v == null || (typeof v === "string" && !v.trim()) || !Number.isFinite(n) || n < 0 || n > 100)
    throw Error(`${label} must be between 0 and 100.`);
  return n;
}
function selectedTax(d, o = {}) {
  const rawRate = String(o.taxRate ?? "").trim();
  const taxRate = percentage(rawRate ? rawRate : d.settings.hstRate);
  const taxLabel = String(o.taxLabel ?? d.settings.taxLabel ?? "HST").trim() || "HST";
  if (taxLabel.length > 50) throw Error("Tax name must be 50 characters or less.");
  return { taxRate, taxLabel };
}
export function totals(d, lines, discount = 0, taxRate = d.settings.hstRate) {
  if (!lines.length) throw Error("Add at least one line item.");
  let items = lines.map((x) => {
    const p = x.productId ? find(d, "products", x.productId) : null;
    const qty = number(x.qty, "Quantity", 0.01, 1e6),
      price = number(x.price, "Price");
    return {
      lineId: uid("line"),
      productId: p?.id || "",
      description: textValue(x.description || p?.name, "Description"),
      qty,
      unit: String(x.unit ?? p?.unit ?? "pcs").trim() || "pcs",
      price,
      total: number(round(qty * price), "Line amount"),
      unitCost: p ? number(p.cost || 0, "Cost") : 0,
    };
  });
  const subtotal = number(round(sum(items, (x) => x.total)), "Subtotal");
  discount = number(discount, "Discount", 0, subtotal);
  const taxable = round(subtotal - discount),
    rate = percentage(taxRate),
    tax = round((taxable * rate) / 100);
  // Allocate rounded cents cumulatively so every line adds exactly to the document totals.
  let base = 0,
    netUsed = 0,
    taxUsed = 0;
  items = items.map((x, n) => {
    base += x.total;
    const netTo =
        n === items.length - 1
          ? taxable
          : subtotal
            ? round((taxable * base) / subtotal)
            : 0,
      taxTo =
        n === items.length - 1
          ? tax
          : taxable
            ? round((tax * netTo) / taxable)
            : 0;
    const y = {
      ...x,
      net: round(netTo - netUsed),
      tax: round(taxTo - taxUsed),
    };
    netUsed = netTo;
    taxUsed = taxTo;
    return y;
  });
  return {
    items,
    subtotal,
    discount,
    taxable,
    tax,
    taxRate: rate,
    total: round(taxable + tax),
  };
}
function checkStock(d, items) {
  const grouped = new Map();
  for (const i of items)
    if (i.productId)
      grouped.set(i.productId, round((grouped.get(i.productId) || 0) + i.qty));
  for (const [id, q] of grouped) {
    const p = find(d, "products", id);
    if (!d.settings.allowNegativeStock && Number(p.qty) < q)
      throw Error(
        `Not enough stock for ${p.name}. Need ${q}; available ${p.qty}.`,
      );
  }
}
function captureBusinessProfile(d) {
  d.businessProfiles ||= [];
  const snapshot = structuredClone(d.settings);
  const signature = JSON.stringify(snapshot);
  let profile = d.businessProfiles.find((x) => x.signature === signature);
  if (!profile) {
    profile = { id: uid("bizsnap"), signature, settings: snapshot, createdAt: new Date().toISOString() };
    d.businessProfiles.push(profile);
  }
  return profile.id;
}
function postInvoice(d, i) {
  checkStock(d, i.items);
  for (const x of i.items) {
    x.unitCost = Number(x.unitCost || 0);
    if (x.productId) {
      x.unitCost = Number(find(d, "products", x.productId).cost || 0);
      stockMove(
        d,
        x.productId,
        -x.qty,
        "Sale",
        i.number,
        x.description,
        i.date,
      );
    }
  }
  i.state = "posted";
  i.voided = false;
  i.businessProfileId = captureBusinessProfile(d);
  i.businessSnapshot = { ...structuredClone(d.settings), logoDataUrl: "" };
  const customer = i.customerId ? d.customers.find((x) => x.id === i.customerId) : null;
  const person = customer?.personId ? d.people?.find((x) => x.id === customer.personId) : null;
  i.customerSnapshot = structuredClone(person || customer || {
    name: i.customerName || "Walk-in Customer", phone: "", email: "", address: ""
  });
  i.currency = d.settings.currency;
  i.postedAt = new Date().toISOString();
  audit(d, "Invoice finalised", i.number, i.id);
}
export const saveInvoice = (o, lines, finalise = false) =>
  transaction((d) => {
    dates(o);
    const c = o.customerId ? find(d, "customers", o.customerId) : null,
      tax = selectedTax(d, o),
      calc = totals(d, lines, o.discount || 0, tax.taxRate);
    let i, wasPosted = false, previous;
    if (o.id) {
      i = find(d, "invoices", o.id);
      if (i.state !== "draft") {
        const reason = invoiceEditBlockReason(d, i.id);
        if (reason) throw Error(reason);
        wasPosted = true;
        previous = structuredClone(i);
        reverseInvoiceStock(d, i, "Invoice edit reversal");
      }
    } else {
      i = { id: uid("i"), number: nextNumber(d, "invoices") };
      d.invoices.push(i);
    }
    Object.assign(i, calc, {
      taxLabel: tax.taxLabel,
      date: o.date,
      dueDate: o.dueDate || o.date,
      customerId: c?.id || "",
      customerName: c?.name || String(o.manualCustomer || "Walk-in Customer"),
      notes: String(o.notes || ""),
      state: wasPosted ? "posted" : "draft",
      voided: false,
      currency: d.settings.currency,
    });
    if (finalise || wasPosted) postInvoice(d, i);
    if (wasPosted) {
      audit(d, "Invoice revised", `${i.number}: ${previous.total} → ${i.total}`, i.id);
      d.audit[0].before = previous;
      d.audit[0].after = structuredClone(i);
    } else if (!finalise) audit(d, "Invoice draft saved", i.number, i.id);
    return i.id;
  });
export const finaliseInvoice = (id) =>
  transaction((d) => {
    const i = find(d, "invoices", id);
    if (i.state !== "draft") throw Error("This invoice is already finalised.");
    postInvoice(d, i);
  });
export const duplicateInvoice = (id) =>
  transaction((d) => {
    const old = find(d, "invoices", id);
    const i = {
      ...structuredClone(old),
      id: uid("i"),
      number: nextNumber(d, "invoices"),
      date: today(),
      dueDate: today(),
      state: "draft",
      voided: false,
      creditApplied: 0,
      legacy: false,
    };
    delete i.postedAt;
    delete i.voidDate;
    i.items = i.items.map((x) => ({ ...x, lineId: uid("line") }));
    d.invoices.push(i);
    audit(
      d,
      "Invoice duplicated as draft",
      `${old.number} → ${i.number}`,
      i.id,
    );
    return i.id;
  });
function financialLinks(d, id, side) {
  return (
    d[side === "customer" ? "payments" : "vendorPayments"].some(
      (p) => (p.invoiceId || p.purchaseId) === id,
    ) ||
    d.creditTransfers.some((t) => t.fromId === id || t.toId === id) ||
    d.refunds.some((r) => r.documentId === id) ||
    (side === "customer" && d.returns.some((r) => r.invoiceId === id))
  );
}
export function invoiceEditBlockReason(d, id) {
  const i = d.invoices.find((x) => x.id === id);
  if (!i) return "Invoice no longer exists. Reload and try again.";
  if (i.state === "draft") return "";
  if (i.voided || i.state === "void")
    return "Voided invoices are retained for history and cannot be edited.";
  if (!posted(i)) return "This invoice cannot be edited in its current state.";
  if (i.legacy)
    return "Imported invoices need reconciliation before they can be edited.";
  if (financialLinks(d, id, "customer") || Number(i.creditApplied))
    return "This invoice has linked payments, returns, credits, refunds or transfers. Use a credit note to correct it.";
  return "";
}
function reverseInvoiceStock(d, i, type) {
  for (const x of i.items || [])
    if (x.productId)
      stockMove(
        d,
        x.productId,
        x.qty,
        type,
        i.number,
        "Prior invoice stock movement reversed",
        i.date,
      );
}
export const voidDocument = (type, id) =>
  transaction((d) => {
    if (!["invoices", "purchases"].includes(type))
      throw Error("Invalid document type.");
    const i = find(d, type, id);
    const reason = documentCancelBlockReason(d, type, id);
    if (reason) throw Error(reason);
    for (const x of i.items || [])
      if (x.productId)
        stockMove(
          d,
          x.productId,
          type === "invoices" ? x.qty : -x.qty,
          type === "invoices" ? "Sale void" : "Purchase void",
          i.number,
          "Document voided",
        );
    i.state = "void";
    i.voided = true;
    i.voidDate = today();
    audit(d, "Document voided", i.number, id);
  });
export function documentCancelBlockReason(d, type, id) {
  if (!["invoices", "purchases"].includes(type)) return "Invalid document type.";
  const i = d[type].find((document) => document.id === id);
  if (!i) return "Document no longer exists. Reload and try again.";
  if (!posted(i)) return "Only finalised, active documents can be cancelled.";
  if (i.legacy) return "Imported documents require reconciliation before cancellation.";
  const side = type === "invoices" ? "customer" : "vendor";
  if (financialLinks(d, id, side) || Number(i.creditApplied))
    return type === "invoices"
      ? "Payments, credits or returns are linked. Use Return / credit note to correct this invoice."
      : "Payments, credits or refunds are linked. This purchase must be retained for payment history.";
  if (type === "purchases") {
    const grouped = new Map();
    for (const line of i.items || [])
      if (line.productId) grouped.set(line.productId, (grouped.get(line.productId) || 0) + Number(line.qty));
    for (const [productId, quantity] of grouped)
      if (Number(d.products.find((product) => product.id === productId)?.qty || 0) < quantity)
        return "Cannot cancel this purchase: some stock has already been used.";
  }
  return "";
}
export const savePurchase = (o, lines) =>
  transaction((d) => {
    dates(o);
    const v = o.vendorId ? find(d, "vendors", o.vendorId) : null;
    const vendorBillNo = String(o.vendorBillNo || "").trim();
    if (
      vendorBillNo &&
      d.purchases.some(
        (x) =>
          x.vendorId === (v?.id || "") &&
          x.vendorBillNo?.toLowerCase() === vendorBillNo.toLowerCase(),
      )
    )
      throw Error("This vendor bill number already exists.");
    const i = {
      id: uid("pb"),
      number: nextNumber(d, "purchases"),
      ...totals(d, lines, 0),
      taxLabel: d.settings.taxLabel || "HST",
      date: o.date,
      dueDate: o.dueDate || o.date,
      vendorId: v?.id || "",
      vendorName: v?.name || "Manual Vendor",
      vendorBillNo,
      notes: String(o.notes || ""),
      state: "posted",
      currency: d.settings.currency,
    };
    d.purchases.push(i);
    for (const x of i.items)
      if (x.productId)
        stockMove(
          d,
          x.productId,
          x.qty,
          "Purchase",
          i.number,
          x.description,
          i.date,
        );
    audit(d, "Purchase bill created", i.number, i.id);
    return i.id;
  });
function identityMatch(person, o) {
  const email = String(o.email || "").trim().toLowerCase();
  const phone = String(o.phone || "").replace(/\D/g, "");
  return (email && String(person.email || "").trim().toLowerCase() === email) ||
    (phone && String(person.phone || "").replace(/\D/g, "") === phone);
}
function syncPerson(person, o) {
  for (const key of ["name", "contact", "phone", "email", "address", "notes"])
    if (String(o[key] || "").trim()) person[key] = String(o[key]).trim();
  person.updatedAt = new Date().toISOString();
}
function linkMasterToPerson(d, type, master) {
  d.people ||= [];
  const role = type === "customers" ? "customer" : "vendor";
  let person = master.personId ? d.people.find((p) => p.id === master.personId) : null;
  if (!person) person = d.people.find((p) => identityMatch(p, master));
  if (!person) {
    person = {
      id: uid("person"), name: master.name, contact: master.contact || "", phone: master.phone || "",
      email: master.email || "", address: master.address || "", notes: master.notes || "",
      roles: [], createdAt: new Date().toISOString(),
    };
    d.people.push(person);
  }
  syncPerson(person, master);
  person.roles ||= [];
  if (!person.roles.includes(role)) person.roles.push(role);
  master.personId = person.id;
  return person;
}
function ensureRoleForPerson(d, person, role) {
  const type = role === "customer" ? "customers" : "vendors";
  let master = d[type].find((x) => x.personId === person.id);
  if (!master) {
    master = {
      id: uid(role === "customer" ? "c" : "v"), personId: person.id,
      name: person.name, contact: person.contact || "", phone: person.phone || "",
      email: person.email || "", address: person.address || "", notes: person.notes || "",
    };
    d[type].push(master);
  } else {
    Object.assign(master, {
      name: person.name, contact: person.contact || "", phone: person.phone || "",
      email: person.email || "", address: person.address || "", notes: person.notes || "",
    });
  }
  person.roles ||= [];
  if (!person.roles.includes(role)) person.roles.push(role);
  return master;
}
function resolveParty(d, role, o) {
  const type = role === "customer" ? "customers" : "vendors";
  const id = o[role === "customer" ? "customerId" : "vendorId"];
  if (id) {
    const master = find(d, type, id);
    const person = linkMasterToPerson(d, type, master);
    syncPerson(person, o);
    return ensureRoleForPerson(d, person, role);
  }
  const name = textValue(o.name || o.customerName || o.vendorName, role === "customer" ? "Customer name" : "Vendor name");
  d.people ||= [];
  let person = d.people.find((p) => identityMatch(p, o));
  if (!person) {
    person = { id: uid("person"), name, contact: "", phone: "", email: "", address: "", notes: "", roles: [], createdAt: new Date().toISOString() };
    d.people.push(person);
  }
  syncPerson(person, { ...o, name });
  return ensureRoleForPerson(d, person, role);
}
export const savePerson = (o) => transaction((d) => {
  d.people ||= [];
  const name = textValue(o.name, "Name");
  let person = o.id ? d.people.find((p) => p.id === o.id) : null;
  if (o.id && !person) throw Error("Person no longer exists. Reload and try again.");
  const duplicate = d.people.find((p) => p.id !== o.id && identityMatch(p, o));
  if (duplicate) throw Error("A person with this phone or email already exists.");
  if (!person) {
    person = { id: uid("person"), roles: [], createdAt: new Date().toISOString() };
    d.people.push(person);
  }
  syncPerson(person, { ...o, name });
  const requested = [o.customer === "true" || o.customer === "on" ? "customer" : "", o.vendor === "true" || o.vendor === "on" ? "vendor" : ""].filter(Boolean);
  if (!requested.length) throw Error("Choose Customer, Vendor, or both roles.");
  for (const role of requested) ensureRoleForPerson(d, person, role);
  for (const role of ["customer", "vendor"]) {
    if (requested.includes(role) || !person.roles?.includes(role)) continue;
    const type = role === "customer" ? "customers" : "vendors";
    const master = d[type].find((x) => x.personId === person.id);
    const linked = role === "customer"
      ? [...d.invoices, ...d.quotes].some((x) => x.customerId === master?.id)
      : d.purchases.some((x) => x.vendorId === master?.id);
    if (!linked && master) d[type] = d[type].filter((x) => x.id !== master.id);
    if (!linked) person.roles = person.roles.filter((x) => x !== role);
  }
  audit(d, o.id ? "Person updated" : "Person created", person.name, person.id);
  return person.id;
});

export const deletePerson = (id) => transaction((d) => {
  d.people ||= [];
  const person = d.people.find((entry) => entry.id === id);
  if (!person) throw Error("Contact no longer exists. Reload and try again.");
  const customer = d.customers.find((entry) => entry.personId === id);
  const vendor = d.vendors.find((entry) => entry.personId === id);
  const hasSales = customer && [...d.invoices, ...d.quotes].some((entry) => entry.customerId === customer.id);
  const hasPurchases = vendor && d.purchases.some((entry) => entry.vendorId === vendor.id);
  if (hasSales || hasPurchases)
    throw Error("This contact is linked to sales or purchases and cannot be deleted. Keep it to preserve history.");
  d.customers = d.customers.filter((entry) => entry.personId !== id);
  d.vendors = d.vendors.filter((entry) => entry.personId !== id);
  d.people = d.people.filter((entry) => entry.id !== id);
  audit(d, "Contact deleted", person.name, id);
});

export const saveMaster = (type, o) =>
  transaction((d) => saveMasterIn(d, type, o));
function saveMasterIn(d, type, input) {
  if (!["customers", "vendors", "products"].includes(type))
    throw Error("Invalid collection.");
  const o = clean(input),
    name = textValue(o.name),
    existing = o.id ? find(d, type, o.id) : null;
  const key = type === "products" ? "sku" : "email",
    keyValue = String(o[key] || "").trim();
  if (
    keyValue &&
    d[type].some(
      (x) =>
        x.id !== o.id &&
        String(x[key] || "").toLowerCase() === keyValue.toLowerCase(),
    )
  )
    throw Error(`Duplicate ${key}: ${keyValue}`);
  const barcode = String(o.barcode || "").trim();
  if (type === "products" && barcode && d.products.some((x) =>
    x.id !== o.id && String(x.barcode || "").trim().toLowerCase() === barcode.toLowerCase()))
    throw Error(`Duplicate barcode: ${barcode}`);
  const allowed =
    type === "products"
      ? ["sku", "unit", "barcode", "image"]
      : ["contact", "phone", "email", "address", "notes"];
  const x = { ...(existing || {}), id: existing?.id || uid(type[0]), name };
  for (const k of allowed) x[k] = String(o[k] || "").trim();
  if (type === "products") {
    x.cost = number(o.cost || 0, "Cost");
    x.price = number(o.price || 0, "Selling price");
    x.low = number(o.low || 0, "Low-stock threshold");
    const target = number(
      o.qty ?? 0,
      "Quantity",
      d.settings.allowNegativeStock ? -1e9 : 0,
    );
    x.qty = Number(existing?.qty || 0);
    if (existing) Object.assign(existing, x);
    else d.products.push(x);
    const delta = round(target - x.qty);
    if (delta)
      stockMove(
        d,
        x.id,
        delta,
        existing ? "Quantity edit" : "Opening",
        existing ? "Inventory edit" : "Opening balance",
        "Quantity entered in inventory form",
      );
  } else if (existing) Object.assign(existing, x);
  else d[type].push(x);
  if (type === "customers" || type === "vendors") linkMasterToPerson(d, type, x);
  audit(
    d,
    existing ? "Record updated" : "Record created",
    `${type}: ${name}`,
    x.id,
  );
  return x.id;
}
export const adjustStock = (o) =>
  transaction((d) => {
    dateValue(o.date || today());
    const q = number(o.qty, "Quantity change", -1e9);
    if (!q) throw Error("Enter a non-zero quantity change.");
    stockMove(
      d,
      o.productId,
      q,
      "Manual",
      "Adjustment",
      textValue(o.reason, "Reason"),
      o.date || today(),
    );
  });
export const deleteRecord = (type, id) =>
  transaction((d) => {
    const x = find(d, type, id);
    if (type === "invoices") {
      if (x.state !== "draft")
        throw Error(
          "Finalised invoices are retained. Use Void or a credit note.",
        );
      if (financialLinks(d, id, "customer"))
        throw Error("This invoice has linked records.");
    } else if (type === "purchases" || type === "returns")
      throw Error("Posted documents are retained for history.");
    else if (
      type === "customers" &&
      [...d.invoices, ...d.quotes].some((i) => i.customerId === id)
    )
      throw Error("Customer has linked documents and cannot be deleted.");
    else if (type === "vendors" && d.purchases.some((i) => i.vendorId === id))
      throw Error("Vendor has linked bills and cannot be deleted.");
    else if (
      type === "products" &&
      ([...d.invoices, ...d.purchases].some((i) =>
        i.items?.some((it) => it.productId === id),
      ) ||
        d.stockLedger.some((s) => s.productId === id) ||
        d.returns.some((r) => r.productId === id))
    )
      throw Error(
        "Product has stock history or linked documents and cannot be deleted.",
      );
    else if (type === "quotes" && x.status === "Converted")
      throw Error("Converted quotes are retained for history.");
    else if (type === "payments" || type === "vendorPayments") {
      const side = type === "payments" ? "customer" : "vendor",
        docId = x.invoiceId || x.purchaseId;
      if (
        d.creditTransfers.some((t) => t.side === side && t.fromId === docId) ||
        d.refunds.some((r) => r.side === side && r.documentId === docId)
      )
        throw Error(
          "This payment supports a transferred or refunded credit and cannot be removed.",
        );
    } else if (
      ![
        "customers",
        "vendors",
        "products",
        "quotes",
        "expenses",
        "invoices",
      ].includes(type)
    )
      throw Error("This record cannot be deleted.");
    d[type] = d[type].filter((r) => r.id !== id);
    audit(d, "Record deleted", `${type}: ${x.number || x.name || id}`, id);
  });
export const savePayment = (side, o) =>
  transaction((d) => {
    const type = side === "customer" ? "invoices" : "purchases",
      id = side === "customer" ? o.invoiceId : o.purchaseId,
      i = find(d, type, id);
    if (!posted(i)) throw Error("Choose a finalised, non-void document.");
    dateValue(o.date);
    if (o.date < i.date)
      throw Error("Payment date cannot precede the document.");
    const amount = number(o.amount, "Payment", 0.01);
    d[side === "customer" ? "payments" : "vendorPayments"].push({
      id: uid("pay"),
      [side === "customer" ? "invoiceId" : "purchaseId"]: id,
      date: o.date,
      amount,
      method: String(o.method || "Other"),
      reference: String(o.reference || ""),
      notes: String(o.notes || ""),
    });
    audit(d, "Payment recorded", `${i.number}: ${amount}`, id);
  });
function creditAt(d, i, side, date) {
  const copy = { ...d };
  for (const k of [
    "payments",
    "vendorPayments",
    "returns",
    "creditTransfers",
    "refunds",
  ])
    copy[k] = d[k].filter((x) => x.date <= date);
  return creditBalance(i, side, copy);
}
export const transferCredit = (side, fromId, toId, amount, date = today()) =>
  transaction((d) => {
    const type = side === "customer" ? "invoices" : "purchases",
      key = side === "customer" ? "customerId" : "vendorId",
      a = find(d, type, fromId),
      b = find(d, type, toId);
    dateValue(date);
    if (date < a.date || date < b.date)
      throw Error("Credit date cannot precede either document.");
    if (
      a.id === b.id ||
      !posted(a) ||
      !posted(b) ||
      !a[key] ||
      a[key] !== b[key]
    )
      throw Error(
        "Choose different finalised documents for the same customer/vendor.",
      );
    amount = number(
      amount,
      "Credit amount",
      0.01,
      Math.min(
        creditBalance(a, side, d),
        creditAt(d, a, side, date),
        Math.max(0, signedBalance(b, side, d)),
      ),
    );
    d.creditTransfers.push({
      id: uid("credit"),
      side,
      fromId,
      toId,
      amount,
      date,
    });
    audit(d, "Credit allocated", `${a.number} → ${b.number}: ${amount}`, a.id);
  });
export const refundCredit = (side, id, amount, date = today()) =>
  transaction((d) => {
    const i = find(d, side === "customer" ? "invoices" : "purchases", id);
    dateValue(date);
    if (date < i.date) throw Error("Refund date cannot precede document.");
    amount = number(
      amount,
      "Refund amount",
      0.01,
      Math.min(creditBalance(i, side, d), creditAt(d, i, side, date)),
    );
    d.refunds.push({ id: uid("refund"), side, documentId: id, amount, date });
    audit(
      d,
      side === "customer" ? "Customer refund paid" : "Vendor refund received",
      `${i.number}: ${amount}`,
      id,
    );
  });
export function returnPreview(d, invoiceId, lineId, qty) {
  const i = find(d, "invoices", invoiceId);
  if (!posted(i)) throw Error("Only finalised invoices can be returned.");
  if (d.returns.some((r) => r.invoiceId === invoiceId && r.legacy))
    throw Error(
      "This invoice has an older return needing manual reconciliation before another return.",
    );
  const line = i.items.find((x) => x.lineId === lineId);
  if (!line) throw Error("Choose a line from this invoice.");
  const prior = d.returns.filter(
      (r) => r.invoiceId === invoiceId && r.lineId === lineId && !r.legacy,
    ),
    used = round(sum(prior, (r) => r.qty)),
    remaining = round(line.qty - used);
  qty = number(qty, "Return quantity", 0.01, remaining);
  let net = line.net,
    tax = line.tax;
  if (net == null) {
    const full = round(i.subtotal - Number(i.discount || 0));
    let base = 0,
      prevNet = 0,
      prevTax = 0;
    for (let n = 0; n < i.items.length; n++) {
      const l = i.items[n];
      base += Number(l.total || l.qty * l.price);
      const nt =
          n === i.items.length - 1
            ? full
            : round((full * base) / (i.subtotal || 1)),
        tt =
          n === i.items.length - 1
            ? Number(i.tax)
            : round((Number(i.tax) * nt) / (full || 1));
      if (l.lineId === lineId) {
        net = round(nt - prevNet);
        tax = round(tt - prevTax);
        break;
      }
      prevNet = nt;
      prevTax = tt;
    }
  }
  const n =
      round((Number(net) * (used + qty)) / line.qty) - sum(prior, (r) => r.net),
    t =
      round((Number(tax) * (used + qty)) / line.qty) - sum(prior, (r) => r.tax);
  return {
    line,
    qty,
    remaining,
    net: round(n),
    tax: round(t),
    amount: round(n + t),
  };
}
export const saveReturn = (o) =>
  transaction((d) => {
    dateValue(o.date);
    const i = find(d, "invoices", o.invoiceId);
    if (o.date < i.date) throw Error("Return date cannot precede invoice.");
    const p = returnPreview(d, o.invoiceId, o.lineId, o.qty),
      reason = textValue(o.reason, "Return reason");
    const r = {
      id: uid("r"),
      number: nextNumber(d, "returns"),
      invoiceId: i.id,
      lineId: o.lineId,
      productId: p.line.productId,
      description: p.line.description,
      qty: p.qty,
      net: p.net,
      tax: p.tax,
      amount: p.amount,
      date: o.date,
      restock: o.restock === "yes" && !!p.line.productId ? "yes" : "no",
      reason,
      unitCost: p.line.unitCost ?? null,
    };
    d.returns.push(r);
    if (r.restock === "yes")
      stockMove(d, r.productId, r.qty, "Return", r.number, reason, r.date);
    audit(d, "Credit note created", `${r.number}: ${r.amount}`, i.id);
    return r.id;
  });
export const saveExpense = (o) =>
  transaction((d) => {
    dateValue(o.date);
    const amount = number(o.amount, "Total expense", 0.01);
    const taxRate = o.taxRate == null || String(o.taxRate).trim() === ""
      ? null
      : percentage(o.taxRate, "Tax rate");
    const tax = taxRate == null
      ? number(o.tax || 0, "Included tax", 0, amount)
      : number(round(amount * taxRate / (100 + taxRate)), "Included tax", 0, amount);
    d.expenses.push({
      id: uid("e"),
      date: o.date,
      amount,
      tax,
      ...(taxRate == null ? {} : { taxRate, taxLabel: String(o.taxLabel || d.settings.taxLabel || "HST").trim() || "HST" }),
      category: textValue(o.category, "Category"),
      payee: textValue(o.payee, "Payee"),
      method: String(o.method || ""),
      description: String(o.description || ""),
    });
    audit(d, "Expense recorded", `${o.payee}: ${amount}`);
  });
export const saveQuote = (o) =>
  transaction((d) => {
    dateValue(o.date);
    dateValue(o.validUntil);
    if (o.validUntil < o.date)
      throw Error("Valid-until date cannot precede quote date.");
    const c = o.customerId ? find(d, "customers", o.customerId) : null;
    const tax = selectedTax(d, o);
    const calc = totals(
      d,
      [
        {
          description: textValue(o.description, "Scope"),
          qty: 1,
          price: o.subtotal,
        },
      ],
      o.discount || 0,
      tax.taxRate,
    );
    const q = {
      id: uid("q"),
      number: nextNumber(d, "quotes"),
      ...calc,
      taxLabel: tax.taxLabel,
      customerId: c?.id || "",
      customerName: c?.name || o.manualCustomer || "Walk-in Customer",
      date: o.date,
      validUntil: o.validUntil,
      description: o.description,
      status: "Open",
    };
    d.quotes.push(q);
    audit(d, "Quote created", q.number, q.id);
  });
export const convertQuote = (id) =>
  transaction((d) => {
    const q = find(d, "quotes", id);
    if (q.status === "Converted") throw Error("Quote already converted.");
    const calc = q.items
      ? {
          items: structuredClone(q.items),
          subtotal: q.subtotal,
          discount: q.discount,
          tax: q.tax,
          taxable: q.taxable,
          total: q.total,
          taxRate: q.taxRate,
          taxLabel: q.taxLabel || "HST",
        }
      : totals(
          d,
          [
            {
              description: q.description || q.number,
              qty: 1,
              price: q.subtotal,
            },
          ],
          q.discount || 0,
          q.taxRate ?? d.settings.hstRate,
        );
    const i = {
      ...calc,
      id: uid("i"),
      number: nextNumber(d, "invoices"),
      taxLabel: q.taxLabel || "HST",
      customerId: q.customerId,
      customerName: q.customerName,
      date: today(),
      dueDate: today(),
      state: "draft",
      notes: `Converted from ${q.number}`,
      currency: d.settings.currency,
    };
    i.items = i.items.map((x) => ({ ...x, lineId: uid("line") }));
    d.invoices.push(i);
    q.status = "Converted";
    q.invoiceId = i.id;
    audit(d, "Quote converted to draft", `${q.number} → ${i.number}`, id);
  });
export const saveSaleDeal = (o, lines) => transaction((d) => {
  const dealType = o.dealType === "quote" ? "quote" : "sale";
  dateValue(o.date);
  const customer = resolveParty(d, "customer", {
    customerId: o.customerId, name: o.customerName, phone: o.phone, email: o.email, address: o.address,
  });
  const tax = selectedTax(d, o),
    calc = totals(d, lines, o.discount || 0, tax.taxRate);
  if (dealType === "quote") {
    dateValue(o.validUntil);
    if (o.validUntil < o.date) throw Error("Valid-until date cannot precede quote date.");
    const q = {
      id: uid("q"), number: nextNumber(d, "quotes"), ...calc,
      taxLabel: tax.taxLabel,
      customerId: customer.id, customerName: customer.name, personId: customer.personId,
      customerSnapshot: structuredClone(d.people.find((p) => p.id === customer.personId) || customer),
      date: o.date, validUntil: o.validUntil, notes: String(o.notes || ""), status: "Open",
      currency: d.settings.currency,
    };
    d.quotes.push(q);
    audit(d, "Quote created", q.number, q.id);
    return { kind: "quote", id: q.id };
  }
  const dueDate = o.dueDate || o.date;
  dates({ date: o.date, dueDate });
  const i = {
    id: uid("i"), number: nextNumber(d, "invoices"), ...calc,
    taxLabel: tax.taxLabel,
    date: o.date, dueDate, customerId: customer.id, customerName: customer.name,
    personId: customer.personId, notes: String(o.notes || ""), state: "draft", voided: false,
    currency: d.settings.currency,
  };
  d.invoices.push(i);
  postInvoice(d, i);
  const preset = o.paymentPreset || "full";
  let amount = preset === "unpaid" ? 0 : preset === "partial" ? number(o.paymentAmount || 0, "Payment", 0) : i.total;
  if (amount > 0) {
    d.payments.push({ id: uid("pay"), invoiceId: i.id, date: o.paymentDate || o.date, amount: round(amount), method: String(o.paymentMethod || "Cash"), reference: String(o.paymentReference || i.number), notes: "Recorded with sale" });
    audit(d, "Payment recorded", `${i.number}: ${round(amount)}`, i.id);
  }
  audit(d, "Sale saved", `${i.number} · ${customer.name}`, i.id);
  return { kind: "invoice", id: i.id };
});

export const savePurchaseDeal = (o, lines) => transaction((d) => {
  dates(o);
  const vendor = resolveParty(d, "vendor", {
    vendorId: o.vendorId, name: o.vendorName, phone: o.phone, email: o.email, address: o.address,
  });
  const vendorBillNo = String(o.vendorBillNo || "").trim();
  if (vendorBillNo && d.purchases.some((x) => x.vendorId === vendor.id && String(x.vendorBillNo || "").toLowerCase() === vendorBillNo.toLowerCase()))
    throw Error("This vendor bill number already exists for this vendor.");
  const i = {
    id: uid("pb"), number: nextNumber(d, "purchases"), ...totals(d, lines, 0),
    taxLabel: d.settings.taxLabel || "HST",
    date: o.date, dueDate: o.dueDate || o.date, vendorId: vendor.id, vendorName: vendor.name,
    personId: vendor.personId, vendorBillNo, notes: String(o.notes || ""), state: "posted",
    currency: d.settings.currency, businessProfileId: captureBusinessProfile(d), businessSnapshot: { ...structuredClone(d.settings), logoDataUrl: "" },
    vendorSnapshot: structuredClone(d.people.find((p) => p.id === vendor.personId) || vendor),
    postedAt: new Date().toISOString(),
  };
  d.purchases.push(i);
  for (const x of i.items) if (x.productId) stockMove(d, x.productId, x.qty, "Purchase", i.number, x.description, i.date);
  const preset = o.paymentPreset || "full";
  let amount = preset === "unpaid" ? 0 : preset === "partial" ? number(o.paymentAmount || 0, "Payment", 0) : i.total;
  if (amount > 0) {
    d.vendorPayments.push({ id: uid("pay"), purchaseId: i.id, date: o.paymentDate || o.date, amount: round(amount), method: String(o.paymentMethod || "Cash"), reference: String(o.paymentReference || ""), notes: "Recorded with purchase" });
    audit(d, "Vendor payment recorded", `${i.number}: ${round(amount)}`, i.id);
  }
  audit(d, "Purchase saved", `${i.number} · ${vendor.name}`, i.id);
  return i.id;
});

export const convertQuoteToSale = (id) => transaction((d) => {
  const q = find(d, "quotes", id);
  if (q.status === "Converted") throw Error("Quote already converted.");
  const dueDate = today();
  const i = {
    id: uid("i"), number: nextNumber(d, "invoices"),
    items: structuredClone(q.items || []).map((x) => ({ ...x, lineId: uid("line") })),
    subtotal: q.subtotal, discount: q.discount, taxable: q.taxable, tax: q.tax, taxRate: q.taxRate, total: q.total,
    taxLabel: q.taxLabel || "HST",
    customerId: q.customerId, customerName: q.customerName, personId: q.personId || "",
    date: today(), dueDate, state: "draft", voided: false, notes: `Converted from ${q.number}${q.notes ? " · " + q.notes : ""}`, currency: q.currency || d.settings.currency,
  };
  d.invoices.push(i);
  postInvoice(d, i);
  q.status = "Converted"; q.invoiceId = i.id; q.convertedAt = new Date().toISOString();
  audit(d, "Quote converted to sale", `${q.number} → ${i.number}`, q.id);
  return i.id;
});

export const saveSettings = (o) =>
  transaction((d) => {
    const s = { ...d.settings };
    for (const k of [
      "businessName", "legalName", "hstNo", "taxLabel", "address", "phone", "email", "invoicePrefix",
      "quotePrefix", "returnPrefix", "purchasePrefix", "paymentInstructions", "invoiceTerms", "thankYouMessage",
    ]) s[k] = String(o[k] ?? s[k] ?? "").trim();
    textValue(s.businessName, "Business name");
    textValue(s.invoicePrefix, "Invoice prefix");
    textValue(s.taxLabel, "Tax name");
    if (s.taxLabel.length > 50) throw Error("Tax name must be 50 characters or less.");
    s.hstRate = percentage(o.hstRate);
    s.lowStockDefault = number(o.lowStockDefault, "Low-stock level", 0);
    s.nextInvoice = number(o.nextInvoice, "Next invoice number", 1, 1e9);
    s.defaultDueDays = number(o.defaultDueDays ?? s.defaultDueDays, "Default due days", 0, 3650);
    s.defaultQuoteDays = number(o.defaultQuoteDays ?? s.defaultQuoteDays, "Default quote days", 0, 3650);
    if (!Number.isInteger(s.nextInvoice) || !Number.isInteger(s.defaultDueDays) || !Number.isInteger(s.defaultQuoteDays))
      throw Error("Numbering and default-day values must be whole numbers.");
    if (!["CAD", "USD", "INR"].includes(o.currency)) throw Error("Invalid currency.");
    if (o.currency !== s.currency && ["invoices", "purchases", "expenses", "quotes"].some((k) => d[k].length))
      throw Error("Currency cannot change after financial records exist.");
    s.currency = o.currency;
    s.allowNegativeStock = o.allowNegativeStock === "true";
    if (o.accentColor && !/^#[0-9a-f]{6}$/i.test(o.accentColor)) throw Error("Accent colour must be a 6-digit hex colour.");
    s.accentColor = o.accentColor || s.accentColor || "#155eef";
    if (o.logoDataUrl !== undefined) {
      if (o.logoDataUrl && !/^data:image\/(png|jpeg|webp);base64,/i.test(o.logoDataUrl)) throw Error("Logo must be a PNG, JPG or WebP image.");
      if (String(o.logoDataUrl || "").length > 120000) throw Error("Logo is too large. Use a small optimized image under about 80 KB.");
      s.logoDataUrl = String(o.logoDataUrl || "");
    }
    d.settings = s;
    audit(d, "Settings updated", "Business profile and document design");
  });
export const importMasters = (type, rows) =>
  transaction((d) => {
    if (!["customers", "vendors", "products"].includes(type))
      throw Error("Invalid import type.");
    if (rows.length < 2) throw Error("CSV has no records.");
    const h = rows[0].map((x) => x.trim());
    if (!h.includes("name") || new Set(h).size !== h.length)
      throw Error("CSV needs a unique name heading.");
    if (h.some((x) => ["__proto__", "constructor", "prototype"].includes(x)))
      throw Error("Invalid CSV heading.");
    let added = 0,
      skipped = 0;
    const key = type === "products" ? "sku" : "email";
    for (let n = 1; n < rows.length; n++) {
      const o = Object.fromEntries(h.map((k, j) => [k, rows[n][j] || ""]));
      delete o.id;
      for (const [field, value] of Object.entries(o)) {
        if (/^[=+@\t\r]/.test(String(value || ""))) {
          throw Error(`CSV row ${n + 1}: unsafe spreadsheet formula prefix in ${field}. No rows were saved.`);
        }
      }
      if (
        o[key] &&
        d[type].some(
          (x) =>
            String(x[key] || "")
              .trim()
              .toLowerCase() === o[key].trim().toLowerCase(),
        )
      ) {
        skipped++;
        continue;
      }
      try {
        saveMasterIn(d, type, o);
        added++;
      } catch (e) {
        throw Error(`CSV row ${n + 1}: ${e.message} No rows were saved.`);
      }
    }
    audit(d, "CSV imported", `${type}: ${added} added, ${skipped} skipped`);
    return { added, skipped };
  });
