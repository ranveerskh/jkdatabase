import { localDate } from "./utils.js";

const today = () => localDate(new Date());
const subtractDays = (n) => { const d = new Date(`${today()}T12:00:00`); d.setDate(d.getDate() - n); return localDate(d); };
export function setupDateFilter(select, from, to, onChange, initial = "30d") {
  const y = new Date().getFullYear(), years = Array.from({ length: 10 }, (_, n) => y - n);
  select.innerHTML = [
    '<option value="30d">1 month</option>', '<option value="90d">3 months</option>',
    '<option value="180d">6 months</option>', '<option value="1y">1 year</option>',
    ...years.map((n) => `<option value="${n}">${n}</option>`),
    '<option value="10y">10 years</option>', '<option value="all">Lifetime</option>', '<option value="custom">Custom dates</option>',
  ].join("");
  select.value = initial;
  const apply = () => {
    const value = select.value, end = today();
    const custom = value === "custom";
    from.closest(".field").hidden = !custom; to.closest(".field").hidden = !custom;
    if (custom) { if (!from.value) from.value = subtractDays(30); if (!to.value) to.value = end; }
    else if (value === "all") { from.value = "2000-01-01"; to.value = end; }
    else if (value === "10y") { from.value = `${new Date().getFullYear() - 10}-01-01`; to.value = end; }
    else if (/^\d{4}$/.test(value)) { from.value = `${value}-01-01`; to.value = `${value}-12-31`; }
    else { const days = value === "1y" ? 365 : Number(value.slice(0, -1)); from.value = subtractDays(days); to.value = end; }
    onChange();
  };
  select.addEventListener("change", apply);
  from.addEventListener("change", () => { if (select.value === "custom") onChange(); });
  to.addEventListener("change", () => { if (select.value === "custom") onChange(); });
  apply();
}
