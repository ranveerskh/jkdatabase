import {
  $,
  db,
  loadError,
  download,
  today,
  csvParse,
  submit,
  run,
  toast,
} from "../app.js";
import { DB_KEY, RECOVERY_KEY, LEGACY_KEYS } from "../core/config.js";
import { replaceDB, resetDB } from "../repositories/db.js";
import { normalize } from "../storage/local-storage.js";
import { saveSettings, importMasters } from "../services/business-service.js";
const form = $("form");
for (const [k, v] of Object.entries(db.settings)) {
  const f = form.elements.namedItem(k);
  if (f) f.value = String(v ?? "");
}
submit(form, saveSettings);
function backupBefore() {
  download(
    `jk-database-before-change-${today()}.json`,
    localStorage.getItem(DB_KEY) || JSON.stringify(db, null, 2),
    "application/json",
  );
}
$("backup").addEventListener("click", () => {
  if (loadError) {
    const raw =
      localStorage.getItem(DB_KEY) ||
      LEGACY_KEYS.map((k) => localStorage.getItem(k)).find((x) => x !== null) ||
      "";
    download(
      `jk-database-raw-recovery-${today()}.json`,
      raw,
      "application/json",
    );
  } else
    download(
      `jk-database-v6-backup-${today()}.json`,
      JSON.stringify(db, null, 2),
      "application/json",
    );
});
$("restore").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const x = normalize(JSON.parse(await f.text()));
    if (
      confirm(
        `Restore ${x.customers.length} customers, ${x.invoices.length} invoices and ${x.products.length} products? Current data will be replaced. A backup download will start first.`,
      )
    ) {
      backupBefore();
      await run(() => replaceDB(x));
    }
  } catch (e) {
    toast("Restore rejected: " + e.message);
  } finally {
    $("restore").value = "";
  }
});
$("reset").addEventListener("click", () => {
  if (
    prompt(
      "Type DELETE to clear the active database. A backup is downloaded first; the previous saved copy remains recoverable.",
    ) === "DELETE"
  ) {
    backupBefore();
    run(resetDB);
  }
});
for (const [id, type] of [
  ["importCustomers", "customers"],
  ["importVendors", "vendors"],
  ["importProducts", "products"],
])
  $(id).addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const result = await run(
      async () => {
        const rows = csvParse(await f.text());
        const result = await importMasters(type, rows);
        alert(
          `${result.added} imported; ${result.skipped} duplicate records skipped.`,
        );
      },
      { reload: true },
    );
    e.target.value = "";
  });
$("recovery").addEventListener("click", () => {
  const raw = localStorage.getItem(RECOVERY_KEY);
  if (!raw) return toast("No prior V6 save is available.");
  download(
    `jk-database-previous-save-${today()}.json`,
    raw,
    "application/json",
  );
});
