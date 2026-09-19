import { DB_KEY, RECOVERY_KEY } from "../core/config.js";
import { loadDB, blankDB, normalize } from "../storage/local-storage.js";
import { uid } from "../core/utils.js";
export let db,
  loadError = "";
try {
  db = loadDB();
} catch (e) {
  db = blankDB();
  loadError = `Saved data could not be loaded: ${e.message} Your stored data has not been replaced. Use Settings to export it or restore a valid backup.`;
}
let expected = null;
try {
  expected = localStorage.getItem(DB_KEY);
} catch {
  loadError =
    "Browser storage is blocked. Enable storage for this site before saving.";
}
export async function transaction(change, { recovery = false } = {}) {
  if (loadError && !recovery) throw Error(loadError);
  if (!globalThis.navigator?.locks)
    throw Error(
      "Saving needs a modern browser at HTTPS or localhost. Open with the included local server instructions.",
    );
  return navigator.locks.request("jk-database-v7-write", async () => {
    const raw = localStorage.getItem(DB_KEY);
    if (raw !== expected)
      throw Error(
        "Data changed in another tab. Reload this page before saving. Your changes were not saved.",
      );
    const next = structuredClone(db);
    const result = await change(next);
    next.version = 7;
    next._rev = uid("rev");
    const encoded = JSON.stringify(next);
    try {
      if (raw !== null) localStorage.setItem(RECOVERY_KEY, raw);
      localStorage.setItem(DB_KEY, encoded);
    } catch {
      throw Error(
        "Could not save: browser storage is full or unavailable. Download a backup and free space. No changes were committed.",
      );
    }
    db = next;
    expected = encoded;
    loadError = "";
    return result;
  });
}
export const replaceDB = (next) =>
  transaction(
    (d) => {
      const n = normalize(next);
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, n);
    },
    { recovery: true },
  );
export const resetDB = () =>
  transaction(
    (d) => {
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, blankDB());
    },
    { recovery: true },
  );
