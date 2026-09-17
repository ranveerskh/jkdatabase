import { $, db, esc, money, table, option, today, toast } from "../app.js";
import { statement } from "../services/report-service.js";
export function statementPage(side) {
  const customer = side === "customer",
    select = $(customer ? "customer" : "vendor");
  select.innerHTML =
    option("", "Choose account") +
    db[customer ? "customers" : "vendors"]
      .map((x) => option(x.id, x.name))
      .join("");
  $("from").value = today().slice(0, 4) + "-01-01";
  $("to").value = today();
  function render() {
    if (!select.value) {
      $("summary").innerHTML = "";
      $("list").innerHTML = '<div class="empty">Choose an account.</div>';
      return;
    }
    try {
      const s = statement(side, select.value, $("from").value, $("to").value);
      $("summary").innerHTML = [
        ["Opening balance", s.opening],
        ["Closing balance", s.closing],
        ["Current net balance", s.current],
      ]
        .map(
          ([k, v]) =>
            `<div class="card kpi"><span>${k}</span><strong>${money(v)}</strong><em>${v < 0 ? "Credit / advance available" : ""}</em></div>`,
        )
        .join("");
      $("list").innerHTML = table(
        ["Date", "Type", "Reference", "Debit", "Credit", "Running balance"],
        s.rows.map(
          (r) =>
            `<tr><td>${esc(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.ref)}</td><td>${r.value > 0 ? money(r.value) : ""}</td><td>${r.value < 0 ? money(-r.value) : ""}</td><td>${money(r.balance)}</td></tr>`,
        ),
      );
    } catch (e) {
      toast(e.message);
    }
  }
  [select, $("from"), $("to")].forEach((e) =>
    e.addEventListener("change", render),
  );
  render();
}
