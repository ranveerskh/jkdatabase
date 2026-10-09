import { BUSINESS_ID, auth, firebaseAuth } from "./firebase.js";
import { getAdminMembership, loadCloudDatabase, initializeCloudDatabase, createCloudCommitter } from "./services/firebase-repository.js";
import { configureCloudDatabase } from "./repositories/db.js";
import { blankDB, loadDB } from "./storage/local-storage.js";
import { CLOUD_COLLECTIONS } from "./services/cloud-sync.js";
import { download, today } from "./core/utils.js";

const loginUrl = new URL("../../login.html", import.meta.url);
const entryName = new URL(import.meta.url).searchParams.get("entry");
const allowedEntry = /^(app\.js|pages\/[a-z0-9-]+\.js)$/;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const style = document.createElement("link");
style.rel = "stylesheet";
style.href = new URL("../css/auth.css", import.meta.url).href;
document.head.append(style);

const gate = document.createElement("section");
gate.className = "auth-gate";
gate.setAttribute("aria-live", "polite");
document.body.append(gate);

function gateCard(title, body, buttons = [], extra = "") {
  gate.innerHTML = `<main class="auth-gate-card"><div class="auth-brand"><b>JK</b><span>JK Database<small>Version 7.3.0 · Cloud edition</small></span></div><h1>${esc(title)}</h1>${body}${extra}<div class="auth-gate-actions">${buttons.map((item) => `<button class="btn ${item.primary ? "primary" : ""}" type="button" data-gate-action="${esc(item.action)}">${esc(item.label)}</button>`).join("")}</div></main>`;
  gate.querySelectorAll("[data-gate-action]").forEach((button) =>
    button.addEventListener("click", () => gateActions[button.dataset.gateAction]?.()),
  );
}

const gateActions = {};
function loading(message = "Checking your administrator access…") {
  gateCard("Opening your business", `<p>${esc(message)}</p>`);
}
function localCandidate() {
  try {
    return loadDB();
  } catch {
    return null;
  }
}
function candidateSummary(candidate) {
  if (!candidate) return "The saved browser database could not be read. You can still start a new cloud database, then restore a verified backup in Settings.";
  const count = CLOUD_COLLECTIONS.reduce((total, key) => total + (candidate[key]?.length || 0), 0);
  const customizedSettings = JSON.stringify(candidate.settings) !== JSON.stringify(blankDB().settings);
  return count || customizedSettings
    ? `This browser has ${count} saved records and ${customizedSettings ? "business settings" : "default settings"}. Importing copies them to Firestore and keeps this browser's existing V7 data as a recovery copy.`
    : "No existing business records were found in this browser. You can start with an empty cloud database.";
}

async function setupCloud(user, cloudState) {
  const candidate = localCandidate();
  const hasLocal = !!candidate && (CLOUD_COLLECTIONS.some((key) => (candidate[key] || []).length > 0) || JSON.stringify(candidate.settings) !== JSON.stringify(blankDB().settings));
  const partial = cloudState.partialRecords;
  const details = candidateSummary(candidate) + (partial ? " An earlier setup attempt left temporary cloud records; setup will safely reconcile them before marking the business ready." : "");
  const choices = [];
  if (candidate && hasLocal) choices.push({ action: "import", label: "Import this browser's data", primary: true });
  choices.push({ action: "empty", label: hasLocal ? "Start with an empty cloud database" : "Initialize cloud database", primary: !hasLocal });
  gateCard("Set up your cloud business", `<p>${esc(details)}</p><p><b>Business ID:</b> <code>${esc(BUSINESS_ID)}</code></p><p>Choose once. Existing browser data will not be deleted.</p>`, choices, hasLocal ? '<button class="auth-link" type="button" id="downloadLocalBackup">Download a browser backup first</button>' : "");
  document.getElementById("downloadLocalBackup")?.addEventListener("click", () => download(`jk-database-v7-before-cloud-${today()}.json`, JSON.stringify(candidate, null, 2), "application/json"));
  async function start(source) {
    for (const button of gate.querySelectorAll("button")) button.disabled = true;
    loading("Preparing Firestore records. Keep this page open until setup finishes…");
    try {
      const initialized = await initializeCloudDatabase(source, user.uid);
      configureCloudDatabase(initialized, createCloudCommitter(initialized._rev));
      location.reload();
    } catch (error) {
      gateCard("Cloud setup did not finish", `<p>${esc(error.message || "Could not initialize Firestore.")}</p><p>You can return to this step and safely retry; data in this browser has not been deleted.</p>`, [
        { action: "retry-setup", label: "Reload setup", primary: true },
        { action: "logout", label: "Sign out" },
      ]);
    }
  }
  gateActions.import = () => start(candidate);
  gateActions.empty = () => {
    if (hasLocal && !confirm("Start the cloud database empty? Your current browser data will be kept in its recovery copy.")) return;
    start(blankDB());
  };
  gateActions["retry-setup"] = () => location.reload();
}

async function openForAdmin(user) {
  let member;
  try {
    member = await getAdminMembership(user.uid);
  } catch (error) {
    gateCard("Firestore access is not ready", `<p>The login succeeded, but Firestore rejected the membership check. Publish the <code>firestore.rules</code> from this project, then retry. (${esc(error.code || "permission error")})</p><p>Your Firebase user ID is:</p><code>${esc(user.uid)}</code>`, [
      { action: "recheck", label: "Check access again", primary: true },
      { action: "copy-uid", label: "Copy my Firebase UID" },
      { action: "logout", label: "Sign out" },
    ]);
    gateActions.recheck = () => openForAdmin(user);
    gateActions["copy-uid"] = async () => {
      try { await navigator.clipboard.writeText(user.uid); } catch { /* UID remains visible to copy manually. */ }
    };
    gateActions.logout = () => firebaseAuth.signOut(auth);
    return;
  }
  if (!member) {
    gateCard("Admin access needs one setup step", `<p>This Firebase login is valid, but the account does not yet have the administrator membership record.</p><p>In Firestore, create <code>businesses / ${esc(BUSINESS_ID)} / members / ${esc(user.uid)}</code> with:</p><code>role: "admin"<br>active: true</code><p>Then return here and check access again. The UID above is the document ID.</p>`, [
      { action: "recheck", label: "Check access again", primary: true },
      { action: "copy-uid", label: "Copy my Firebase UID" },
      { action: "logout", label: "Sign out" },
    ]);
    gateActions.recheck = () => openForAdmin(user);
    gateActions["copy-uid"] = async () => {
      try { await navigator.clipboard.writeText(user.uid); } catch { /* UID remains visible to copy manually. */ }
    };
    gateActions.logout = () => firebaseAuth.signOut(auth);
    return;
  }

  try {
    const cloudState = await loadCloudDatabase();
    if (!cloudState.initialized) {
      await setupCloud(user, cloudState);
      return;
    }
    const localCacheReady = configureCloudDatabase(cloudState.database, createCloudCommitter(cloudState.revision));
    const showCacheWarning = () => {
      const notice = document.createElement("div");
      notice.className = "notice";
      notice.textContent = "Cloud save is active, but this browser could not update its local recovery cache. Download a backup from Settings.";
      document.querySelector("main")?.prepend(notice);
    };
    window.addEventListener("jk-cloud-cache-error", showCacheWarning);
    const { startPages } = await import("./services/page-router.js");
    await startPages({ entryName, user, loginUrl, showCacheWarning, localCacheReady });
    gate.remove();
    firebaseAuth.onAuthStateChanged(auth, (current) => {
      if (!current || current.uid !== user.uid)
        location.replace(loginUrl.href + `?next=${encodeURIComponent(location.pathname + location.search)}`);
    });
  } catch (error) {
    gateCard("Could not open cloud data", `<p>${esc(error.message || "The Firestore data could not be loaded.")}</p><p>Check the Firestore rules, network connection, and business membership, then reload.</p>`, [
      { action: "reload", label: "Reload", primary: true },
      { action: "logout", label: "Sign out" },
    ]);
    gateActions.reload = () => location.reload();
    gateActions.logout = () => firebaseAuth.signOut(auth);
  }
}

async function currentUser() {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = firebaseAuth.onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

try {
  loading();
  if (!allowedEntry.test(entryName || "")) throw Error("This page is not available in the cloud app.");
  const user = await currentUser();
  if (!user) {
    const destination = location.pathname + location.search + location.hash;
    location.replace(`${loginUrl.href}?next=${encodeURIComponent(destination)}`);
  } else await openForAdmin(user);
} catch (error) {
  gateCard("Firebase could not start", `<p>${esc(error.message || "Check your connection and reload.")}</p>`, [{ action: "reload", label: "Reload", primary: true }]);
  gateActions.reload = () => location.reload();
}
