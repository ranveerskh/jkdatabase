import { BUSINESS_ID, firestore, firebaseStore } from "../firebase.js";
import { normalize } from "../storage/local-storage.js";
import {
  CLOUD_COLLECTIONS,
  MAX_TRANSACTION_WRITES,
  assertCloudDocumentSize,
  cloudRecordChanges,
  cloudRecords,
  databaseFromCloud,
  recordDocumentId,
  stableStringify,
} from "./cloud-sync.js";

const businessPath = ["businesses", BUSINESS_ID];
const stateRef = firebaseStore.doc(firestore, ...businessPath, "state", "current");
const setupRef = firebaseStore.doc(firestore, ...businessPath, "state", "setup");
const recordsRef = firebaseStore.collection(firestore, ...businessPath, "records");

export async function getAdminMembership(uid) {
  const ref = firebaseStore.doc(firestore, ...businessPath, "members", uid);
  const snapshot = await firebaseStore.getDoc(ref);
  if (!snapshot.exists()) return null;
  const member = snapshot.data();
  return member.active === true && member.role === "admin" ? member : null;
}

async function readConsistentCloudSnapshot() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await firebaseStore.getDoc(stateRef);
    const records = await firebaseStore.getDocs(recordsRef);
    const after = await firebaseStore.getDoc(stateRef);
    const beforeRevision = before.exists() ? `${before.data().status}:${before.data().revision || ""}` : "missing";
    const afterRevision = after.exists() ? `${after.data().status}:${after.data().revision || ""}` : "missing";
    if (beforeRevision !== afterRevision) continue;
    const state = after.exists() ? after.data() : null;
    if (state?.status !== "ready")
      return { initialized: false, partialRecords: records.size > 0 };
    const raw = databaseFromCloud(state, records.docs.map((item) => item.data()));
    return { initialized: true, database: normalize(raw), revision: state.revision };
  }
  throw Error("Cloud data changed while opening. Reload this page and try again.");
}

export async function loadCloudDatabase() {
  return readConsistentCloudSnapshot();
}

function recordRef(documentId) {
  return firebaseStore.doc(firestore, ...businessPath, "records", documentId);
}

export async function initializeCloudDatabase(input, uid) {
  const database = normalize(input);
  database._rev = `init-${crypto.randomUUID()}`;
  assertCloudDocumentSize(database.settings, "Business settings");
  const desired = cloudRecords(database);
  const wantedIds = new Set(desired.map((record) => recordDocumentId(record.collection, record.id)));

  await firebaseStore.runTransaction(firestore, async (transaction) => {
    const [state, lock] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(setupRef),
    ]);
    if (state.exists() && state.data().status === "ready")
      throw Error("This business was already initialized. Reload the page to use its current cloud data.");
    const existingLock = lock.exists() ? lock.data() : null;
    const lockIsFresh = existingLock && Date.now() - Number(existingLock.startedAt || 0) < 30 * 60 * 1000;
    if (lockIsFresh && existingLock.ownerUid !== uid)
      throw Error("Another administrator is setting up this business. Wait a moment, then reload.");
    transaction.set(setupRef, { ownerUid: uid, startedAt: Date.now() });
  });

  const existing = await firebaseStore.getDocs(recordsRef);
  const existingById = new Map(existing.docs.map((entry) => [entry.id, entry.data()]));
  const operations = [];
  for (const record of desired) {
    const id = recordDocumentId(record.collection, record.id);
    const previous = existingById.get(id);
    if (!previous || stableStringify(previous) !== stableStringify(record))
      operations.push({ operation: "set", id, value: record });
  }
  for (const entry of existing.docs)
    if (!wantedIds.has(entry.id)) operations.push({ operation: "delete", id: entry.id });

  const chunkSize = Math.min(450, MAX_TRANSACTION_WRITES - 1);
  for (let start = 0; start < operations.length; start += chunkSize) {
    const batch = firebaseStore.writeBatch(firestore);
    for (const operation of operations.slice(start, start + chunkSize)) {
      const ref = recordRef(operation.id);
      if (operation.operation === "set") batch.set(ref, operation.value);
      else batch.delete(ref);
    }
    await batch.commit();
  }

  await firebaseStore.runTransaction(firestore, async (transaction) => {
    const [state, lock] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(setupRef),
    ]);
    if (state.exists() && state.data().status === "ready")
      throw Error("Another administrator completed setup. Reload to use the cloud data.");
    if (!lock.exists() || lock.data().ownerUid !== uid)
      throw Error("Cloud setup ownership changed. Reload and retry the setup.");
    transaction.set(stateRef, {
      status: "ready",
      revision: database._rev,
      version: 7,
      settings: database.settings,
      updatedAt: new Date().toISOString(),
    });
    transaction.delete(setupRef);
  });
  return database;
}

export function createCloudCommitter(initialRevision) {
  let revision = initialRevision;
  return async function commitCloudTransaction(before, after) {
    assertCloudDocumentSize(after.settings, "Business settings");
    const changes = cloudRecordChanges(before, after);
    if (changes.length + 1 > MAX_TRANSACTION_WRITES)
      throw Error("This save exceeds Firestore's safe transaction limit. Split the import into smaller batches and retry.");
    const nextRevision = after._rev;
    await firebaseStore.runTransaction(firestore, async (transaction) => {
      const state = await transaction.get(stateRef);
      if (!state.exists() || state.data().status !== "ready")
        throw Error("The cloud business is not ready. Reload and contact the administrator.");
      if (state.data().revision !== revision)
        throw Error("Cloud data changed on another device. Reload this page before saving; your changes were not saved.");
      for (const change of changes) {
        const ref = recordRef(recordDocumentId(change.collection, change.id));
        if (change.operation === "delete") transaction.delete(ref);
        else transaction.set(ref, { collection: change.collection, id: change.id, value: change.value });
      }
      transaction.set(stateRef, {
        status: "ready",
        revision: nextRevision,
        version: 7,
        settings: after.settings,
        updatedAt: new Date().toISOString(),
      });
    });
    revision = nextRevision;
  };
}

export { CLOUD_COLLECTIONS };
