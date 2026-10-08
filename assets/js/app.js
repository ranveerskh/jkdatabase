import { db, loadError } from "./repositories/db.js";
import { DB_KEY, LEGACY_KEYS } from "./core/config.js";
import { esc, today, download, csvParse, sum } from "./core/utils.js";
import { refreshPage } from "./services/navigation.js";
export { refreshPage, navigateTo } from "./services/navigation.js";
export { db, loadError, esc, today, download, csvParse, sum };
export * from "./services/finance-service.js";
export const $ = (id) => document.getElementById(id);
export const money = (n, currency = db.settings.currency) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
    Number(n || 0),
  );
export const table = (headers, rows) =>
  rows.length
    ? `<div class="tablewrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
    : '<div class="empty">No records found.</div>';
export const option = (id, label) =>
  `<option value="${esc(id)}">${esc(label)}</option>`;
export const button = (label, action, id = "", cls = "") =>
  `<button type="button" class="btn small ${cls}" data-action="${esc(action)}" data-id="${esc(id)}">${esc(label)}</button>`;
export function toast(msg, type = "err") {
  let e = $("toast");
  if (!e) {
    e = document.createElement("div");
    e.id = "toast";
    e.setAttribute("role", "alert");
    document.body.append(e);
  }
  e.className = `toast ${type} show`;
  e.textContent = msg;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => e.classList.remove("show"), 9000);
}
export async function run(fn, { reload = true } = {}) {
  try {
    const result = await fn();
    if (reload) await refreshPage();
    return result;
  } catch (e) {
    toast(e.message);
    return false;
  }
}
export function submit(form, fn) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const buttons = [
      ...form.querySelectorAll('button[type="submit"],button:not([type])'),
    ];
    buttons.forEach((b) => (b.disabled = true));
    try {
      await run(() => fn(Object.fromEntries(new FormData(form)), e.submitter));
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  });
}
export function actions(container, handlers) {
  container.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (b && handlers[b.dataset.action])
      handlers[b.dataset.action](b.dataset.id, b);
  });
}
export function searchTable() {
  if ($("search"))
    $("search").addEventListener("input", () => {
      const q = $("search").value.toLowerCase();
      $("list")
        .querySelectorAll("tbody tr")
        .forEach((r) => (r.hidden = !r.textContent.toLowerCase().includes(q)));
    });
}
export function exportCSV(type) {
  const records = db[type];
  if (!records?.length) return toast("No records to export.");
  const heads = [...new Set(records.flatMap(Object.keys))];
  const cell = (v) => {
    let s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  download(
    `${type}-${today()}.csv`,
    [heads, ...records.map((r) => heads.map((k) => r[k]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n"),
    "text/csv",
  );
}
export function creditsUI(side, container) {
  import("./services/business-service.js").then(
    ({ transferCredit, refundCredit }) => {
      const type = side === "customer" ? "invoices" : "purchases",
        key = side === "customer" ? "customerId" : "vendorId";
      import("./services/finance-service.js").then(
        ({ creditBalance, signedBalance, posted }) => {
          const entries = db[type].filter((i) => creditBalance(i, side) > 0);
          container.innerHTML =
            "<h3>" +
            (side === "customer"
              ? "Available customer credits"
              : "Available vendor advances") +
            '</h3><p class="note">Overpayments and returns remain as credit. Allocate credit to another bill for the same named account, or record money actually refunded.</p>' +
            table(
              ["Document", "Account", "Credit", ""],
              entries.map(
                (i) =>
                  `<tr><td>${esc(i.number)}</td><td>${esc(i.customerName || i.vendorName)}</td><td>${money(creditBalance(i, side))}</td><td>${button("Allocate", "allocate", i.id)} ${button(side === "customer" ? "Record refund paid" : "Record refund received", "refund", i.id)}</td></tr>`,
              ),
            );
          actions(container, {
            allocate: (id) => {
              const a = db[type].find((i) => i.id === id),
                targets = db[type].filter(
                  (i) =>
                    i.id !== id &&
                    posted(i) &&
                    a[key] &&
                    i[key] === a[key] &&
                    signedBalance(i, side) > 0,
                );
              if (!targets.length)
                return toast(
                  "No outstanding document for this same customer/vendor.",
                );
              const answer = prompt(
                "Enter target document number:\n" +
                  targets
                    .map((i) => `${i.number}: ${money(signedBalance(i, side))}`)
                    .join("\n"),
              );
              if (answer === null) return;
              const b = targets.find((i) => i.number === answer.trim());
              if (!b)
                return toast("Choose one of the listed document numbers.");
              const amount = prompt(
                "Credit amount",
                String(
                  Math.min(creditBalance(a, side), signedBalance(b, side)),
                ),
              );
              if (amount === null) return;
              run(() => transferCredit(side, id, b.id, amount));
            },
            refund: (id) => {
              const i = db[type].find((i) => i.id === id),
                amount = prompt(
                  "Amount actually refunded (record only after money has moved)",
                  String(creditBalance(i, side)),
                );
              if (
                amount !== null &&
                confirm("Confirm this refund has actually been paid/received?")
              )
                run(() => refundCredit(side, id, amount));
            },
          });
        },
      );
    },
  );
}
let shellReady = false;
export function boot() {
  const root = new URL("../../", import.meta.url),
    page = location.pathname.split("/").pop() || "index.html";
  const groups = [
    ["MAIN", [["Home", "index.html"], ["Sales", "sales.html"], ["Purchases", "purchases.html"], ["People", "people.html"], ["Products / Inventory", "inventory.html"], ["Expenses", "expenses.html"], ["Reports", "reports.html"], ["Settings", "settings.html"]]],
  ];
  document.querySelector(".sidebar").innerHTML =
    '<div class="brand"><b>JK</b>JK Database<small>Version 7.2.1 · Cloud edition</small></div><nav class="nav">' +
    groups
      .map(
        ([label, links]) =>
          `<div class="group">${label}</div>` +
          links
            .map(
              ([name, file]) =>
                `<a class="${page === file ? "active" : ""}" href="${new URL(file === "index.html" ? file : "pages/" + file, root)}">${name}</a>`,
            )
            .join(""),
      )
      .join("") +
    "</nav>";
  if (!shellReady) {
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "mobile-menu-btn";
  menuButton.setAttribute("aria-label", "Open menu");
  menuButton.innerHTML = "☰ <span>Menu</span>";
  const shade = document.createElement("div");
  shade.className = "menu-shade";
  document.body.append(menuButton, shade);
  const sidebar = document.querySelector(".sidebar");
  const closeMenu = () => document.body.classList.remove("menu-open");
  menuButton.addEventListener("click", () => document.body.classList.toggle("menu-open"));
  shade.addEventListener("click", closeMenu);
  sidebar.addEventListener("click", (event) => { if (event.target.closest("a")) closeMenu(); });
  window.addEventListener("storage", (event) => {
    if (event.key === DB_KEY || event.key === null) {
      const notice = document.createElement("div");
      notice.className = "notice";
      notice.textContent = "Data changed in another tab. Reload before saving. Unsaved form entries are still on this page.";
      document.querySelector("main.content")?.prepend(notice);
    }
  });
  shellReady = true;
  }
  const banner = (msg) => {
    const e = document.createElement("div");
    e.className = "notice";
    e.setAttribute("role", "status");
    e.textContent = msg;
    document.querySelector("main").prepend(e);
  };
  if (loadError) banner(loadError);
  else if (db.migrationNotice) banner(db.migrationNotice);
  if (!navigator.locks)
    banner(
      "Saving is unavailable here. Open this app at HTTPS or http://localhost using a modern browser.",
    );
  document.querySelectorAll("[data-click]").forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.click;
      if (a === "open") $("dlg").showModal();
      if (a === "close") $("dlg").close();
      if (a === "print") window.print();
    });
  });
  document
    .querySelectorAll("[data-export]")
    .forEach((b) =>
      b.addEventListener("click", () => exportCSV(b.dataset.export)),
    );
  document.querySelectorAll(".field").forEach((f, n) => {
    const input = f.querySelector("input,select,textarea"),
      label = f.querySelector("label");
    if (input && label) {
      input.id ||= `field-${n}`;
      label.htmlFor = input.id;
    }
  });
  document
    .querySelectorAll(
      'input[name="name"],input[type="date"][name],input[name="amount"],input[name="reason"]',
    )
    .forEach((e) => (e.required = true));
  document.querySelectorAll('input[type="number"]').forEach((e) => {
    if (e.min === "" && e.name !== "qty") e.min = "0";
  });
  searchTable();
}
