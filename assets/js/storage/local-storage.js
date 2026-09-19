import {
  DB_KEY,
  DB_VERSION,
  LEGACY_KEYS,
  COLLECTIONS,
  DEFAULT_SETTINGS,
} from "../core/config.js";
import { uid, today, round, dateValue } from "../core/utils.js";
export function blankDB() {
  return {
    version: DB_VERSION,
    _rev: "",
    settings: { ...DEFAULT_SETTINGS },
    people: [],
    businessProfiles: [],
    ...Object.fromEntries(COLLECTIONS.map((k) => [k, []])),
  };
}
export function validateBackup(data) {
  function inspect(value, depth = 0) {
    if (depth > 30) throw Error("Backup nesting is too deep.");
    if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw Error("Unsafe backup field.");
        inspect(v, depth + 1);
      }
    } else if (typeof value === "number" && !Number.isFinite(value))
      throw Error("Invalid backup number.");
  }
  inspect(data);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Array.isArray(data.customers) ||
    !data.settings ||
    typeof data.settings !== "object" ||
    Array.isArray(data.settings)
  )
    throw Error("Not a JK Database backup.");
  if (Number(data.version || 3) > DB_VERSION)
    throw Error("This backup needs a newer JK Database version.");
  for (const key of COLLECTIONS) {
    if (data[key] === undefined) {
      if (Number(data.version) >= 6) throw Error(`Backup is missing ${key}.`);
      continue;
    }
    if (!Array.isArray(data[key])) throw Error(`Invalid ${key} collection.`);
    const seen = new Set();
    for (const r of data[key]) {
      if (
        !r ||
        typeof r !== "object" ||
        Array.isArray(r) ||
        typeof r.id !== "string" ||
        !r.id ||
        seen.has(r.id)
      )
        throw Error(`Invalid or duplicate ID in ${key}.`);
      seen.add(r.id);
      for (const f of [
        "qty",
        "cost",
        "price",
        "amount",
        "tax",
        "total",
        "subtotal",
        "discount",
        "creditApplied",
        "balance",
        "net",
        "taxable",
      ]) {
        if (
          r[f] !== undefined &&
          (!Number.isFinite(Number(r[f])) || Math.abs(Number(r[f])) > 1e12)
        )
          throw Error(`Invalid ${f} in ${key}.`);
      }
      if (
        r.items !== undefined &&
        (!Array.isArray(r.items) ||
          r.items.some(
            (i) =>
              !i ||
              typeof i !== "object" ||
              !Number.isFinite(Number(i.qty)) ||
              !Number.isFinite(Number(i.price)),
          ))
      )
        throw Error(`Invalid line items in ${key}.`);
    }
  }
  if (data.people !== undefined) {
    if (!Array.isArray(data.people)) throw Error("Invalid people collection.");
    const seenPeople = new Set();
    for (const r of data.people) {
      if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id || seenPeople.has(r.id))
        throw Error("Invalid or duplicate ID in people.");
      if (typeof r.name !== "string" || !r.name.trim()) throw Error("Missing name in people.");
      seenPeople.add(r.id);
    }
  }
  for (const key of ["customers", "vendors", "products"])
    for (const r of data[key] || [])
      if (typeof r.name !== "string" || !r.name.trim())
        throw Error(`Missing name in ${key}.`);
  for (const key of [
    "invoices",
    "purchases",
    "expenses",
    "payments",
    "vendorPayments",
    "quotes",
    "returns",
    "creditTransfers",
    "refunds",
  ])
    for (const r of data[key] || []) {
      dateValue(r.date);
      if (r.dueDate) dateValue(r.dueDate);
      for (const field of ["amount", "tax", "total", "subtotal", "discount"])
        if (r[field] !== undefined && Number(r[field]) < 0)
          throw Error(`Negative ${field} in ${key}.`);
      if (["invoices", "purchases", "quotes"].includes(key)) {
        if (!Number.isFinite(Number(r.total)))
          throw Error(`Missing total in ${key}.`);
        if (Number(data.version) >= 6 && !Array.isArray(r.items) && !r.legacy)
          throw Error(`Missing items in ${key}.`);
      }
      if (
        [
          "expenses",
          "payments",
          "vendorPayments",
          "returns",
          "creditTransfers",
          "refunds",
        ].includes(key) &&
        !Number.isFinite(Number(r.amount))
      )
        throw Error(`Missing amount in ${key}.`);
    }
  for (const p of data.products || [])
    for (const k of ["qty", "cost", "price"])
      if (!Number.isFinite(Number(p[k])) || (k !== "qty" && Number(p[k]) < 0))
        throw Error(`Invalid product ${k}.`);
  for (const key of ["nextInvoice", "nextQuote", "nextReturn", "nextPurchase"])
    if (
      data.settings[key] !== undefined &&
      (!Number.isInteger(Number(data.settings[key])) ||
        Number(data.settings[key]) < 1)
    )
      throw Error("Invalid numbering counter.");
  if (Number(data.version) >= 6) {
    const has = (type, id) =>
      !id || (data[type] || []).some((x) => x.id === id);
    for (const type of ["invoices", "purchases", "quotes"]) {
      const seen = new Set();
      for (const r of data[type] || []) {
        if (r.legacy) continue;
        if (!r.number || seen.has(r.number))
          throw Error(`Duplicate or missing number in ${type}.`);
        seen.add(r.number);
        if (!has("customers", r.customerId) || !has("vendors", r.vendorId))
          throw Error(`Missing account in ${type}.`);
        for (const i of r.items || []) {
          if (
            !has("products", i.productId) ||
            Number(i.qty) <= 0 ||
            Number(i.price) < 0 ||
            !Number.isFinite(Number(i.total))
          )
            throw Error(`Invalid line in ${type}.`);
        }
        if (
          ["invoices", "purchases"].includes(type) &&
          !["draft", "posted", "void"].includes(r.state)
        )
          throw Error("Invalid document state.");
      }
    }
    for (const [type, ref, target] of [
      ["payments", "invoiceId", "invoices"],
      ["vendorPayments", "purchaseId", "purchases"],
      ["returns", "invoiceId", "invoices"],
    ])
      for (const r of data[type] || [])
        if (!r.legacy && (!r[ref] || !has(target, r[ref])))
          throw Error(`Missing linked document in ${type}.`);
    for (const type of ["creditTransfers", "refunds"])
      for (const r of data[type] || []) {
        if (!["customer", "vendor"].includes(r.side) || Number(r.amount) <= 0)
          throw Error("Invalid credit/refund.");
        const target = r.side === "customer" ? "invoices" : "purchases";
        for (const k of type === "refunds"
          ? ["documentId"]
          : ["fromId", "toId"])
          if (!r[k] || !has(target, r[k]))
            throw Error("Missing credit/refund document.");
      }
  }
  if (!["CAD", "USD", "INR"].includes(data.settings.currency || "CAD"))
    throw Error("Unsupported currency in backup.");
  const rate = Number(data.settings.hstRate ?? 13);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    throw Error("Invalid HST rate.");
  return data;
}
export function normalize(data) {
  validateBackup(data);
  const d = {
    ...blankDB(),
    ...structuredClone(data),
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    version: 7,
  };
  d.settings.allowNegativeStock =
    d.settings.allowNegativeStock === true ||
    d.settings.allowNegativeStock === "true";
  for (const k of COLLECTIONS) d[k] ??= [];
  d.people ??= [];
  d.businessProfiles ??= [];
  if (Number(data.version || 3) < 6) {
    for (const k of COLLECTIONS) for (const r of d[k]) r.legacy = true;
    d.migrationNotice =
      "Imported older data. Existing stock is preserved. Check historical voids, refunds, balances and missing costs against your records; V6 cannot reconstruct missing old transactions.";
    for (const p of d.products) {
      const latest = d.stockLedger.find((x) => x.productId === p.id);
      if (!latest || Math.abs(Number(latest.balance) - Number(p.qty)) > 0.005)
        d.stockLedger.unshift({
          id: uid("stk"),
          date: today(),
          at: new Date().toISOString(),
          productId: p.id,
          qty: round(Number(p.qty) - (Number(latest?.balance) || 0)),
          type: "Migration reconciliation",
          reference: "V6 opening",
          note: "Preserved imported quantity; verify against physical stock.",
          balance: Number(p.qty),
        });
    }
    for (const i of d.invoices) {
      i.state = i.voided ? "void" : "posted";
      i.legacy = true;
      i.items = (i.items || []).map((x, n) => ({
        ...x,
        lineId: x.lineId || `${i.id}-${n}`,
      }));
    }
    for (const p of d.purchases) {
      p.state = p.voided ? "void" : "posted";
      p.legacy = true;
    }
    for (const r of d.returns) r.legacy = true;
  }
  if (Number(data.version || 3) < 7) {
    const norm = (v) => String(v || "").trim().toLowerCase();
    const digits = (v) => String(v || "").replace(/\D/g, "");
    const findPerson = (r) => {
      const em = norm(r.email), ph = digits(r.phone);
      return d.people.find((p) => (em && norm(p.email) === em) || (ph && digits(p.phone) === ph));
    };
    const makePerson = (r, role) => {
      let p = findPerson(r);
      if (!p) {
        p = {
          id: uid("person"), name: r.name || "Unnamed", contact: r.contact || "",
          phone: r.phone || "", email: r.email || "", address: r.address || "", notes: r.notes || "",
          roles: [], createdAt: new Date().toISOString(),
        };
        d.people.push(p);
      }
      p.roles ||= [];
      if (!p.roles.includes(role)) p.roles.push(role);
      return p;
    };
    for (const c of d.customers) c.personId = c.personId || makePerson(c, "customer").id;
    for (const v of d.vendors) v.personId = v.personId || makePerson(v, "vendor").id;
    d.migrationNotice = d.migrationNotice || "V6 data was upgraded to V7. Customers and vendors are now linked through unified People profiles; your original documents and stock history were preserved.";
  }
  for (const p of d.people) {
    p.roles = Array.isArray(p.roles) ? [...new Set(p.roles.filter((r) => r === "customer" || r === "vendor"))] : [];
  }
  d.version = 7;
  return d;
}
export function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw !== null) return normalize(JSON.parse(raw));
  for (const k of LEGACY_KEYS) {
    const old = localStorage.getItem(k);
    if (old !== null) return normalize(JSON.parse(old));
  }
  return blankDB();
}
