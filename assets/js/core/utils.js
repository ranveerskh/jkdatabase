export const uid = (prefix = "x") => `${prefix}-${crypto.randomUUID()}`;
export const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => localDate(new Date());
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
export const sum = (a, f = (x) => x) =>
  a.reduce((s, x) => s + Number(f(x) || 0), 0);
export const round = (n) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function number(v, label = "Number", min = 0, max = 1e9) {
  const n = Number(v);
  if (v === "" || v == null || !Number.isFinite(n) || n < min || n > max)
    throw Error(`${label} must be between ${min} and ${max}.`);
  return round(n);
}
export function dateValue(v) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v || "") ||
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v
  )
    throw Error("Enter a valid date.");
  return v;
}
export const dayNumber = (v) =>
  Date.parse(dateValue(v) + "T00:00:00Z") / 86400000;
export function textValue(v, label = "Name") {
  const s = String(v ?? "").trim();
  if (!s) throw Error(`${label} is required.`);
  if (s.length > 5000) throw Error(`${label} is too long.`);
  return s;
}
export function download(name, text, type = "text/plain") {
  const u = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function csvParse(text) {
  const rows = [];
  let row = [],
    cur = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      n = text[i + 1];
    if (c === '"' && quote && n === '"') {
      cur += '"';
      i++;
    } else if (c === '"') quote = !quote;
    else if (c === "," && !quote) {
      row.push(cur);
      cur = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && n === "\n") i++;
      row.push(cur);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (quote) throw Error("CSV contains an unclosed quote.");
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
