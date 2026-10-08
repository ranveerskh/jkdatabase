import { COLLECTIONS } from "../core/config.js";

export const CLOUD_COLLECTIONS = ["people", "businessProfiles", ...COLLECTIONS];
export const MAX_TRANSACTION_WRITES = 499;
export const MAX_RECORD_BYTES = 900_000;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

export function assertCloudDocumentSize(value, label = "Firestore document") {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
  if (bytes > MAX_RECORD_BYTES)
    throw Error(`${label} is too large for Firestore. Reduce its size or move attached files to cloud storage.`);
}

export function recordDocumentId(collection, id) {
  if (!CLOUD_COLLECTIONS.includes(collection))
    throw Error(`Unsupported cloud collection: ${collection}.`);
  const encoded = encodeURIComponent(String(id ?? ""));
  if (!encoded || new TextEncoder().encode(`${collection}__${encoded}`).length > 700)
    throw Error("A record ID is too long for cloud storage.");
  return `${collection}__${encoded}`;
}

export function cloudRecordData(collection, record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.id !== "string" || !record.id)
    throw Error(`Invalid record in ${collection}.`);
  recordDocumentId(collection, record.id);
  const value = JSON.parse(JSON.stringify(record));
  assertCloudDocumentSize(value, `A ${collection} record`);
  return { collection, id: record.id, value };
}

export function cloudRecords(database) {
  return CLOUD_COLLECTIONS.flatMap((collection) => {
    const records = database?.[collection] ?? [];
    if (!Array.isArray(records)) throw Error(`Invalid ${collection} cloud data.`);
    const ids = new Set();
    return records.map((record) => {
      if (ids.has(record?.id)) throw Error(`Duplicate ID in ${collection}.`);
      ids.add(record?.id);
      return cloudRecordData(collection, record);
    });
  });
}

export function cloudRecordChanges(before, after) {
  const changes = [];
  for (const collection of CLOUD_COLLECTIONS) {
    const oldRecords = before?.[collection] ?? [];
    const newRecords = after?.[collection] ?? [];
    if (!Array.isArray(oldRecords) || !Array.isArray(newRecords))
      throw Error(`Invalid ${collection} cloud data.`);
    const oldById = new Map(oldRecords.map((record) => [record.id, record]));
    const newById = new Map(newRecords.map((record) => [record.id, record]));
    if (oldById.size !== oldRecords.length || newById.size !== newRecords.length)
      throw Error(`Duplicate ID in ${collection}.`);
    for (const [id, oldRecord] of oldById) {
      if (!newById.has(id)) changes.push({ operation: "delete", collection, id });
      else if (stableStringify(oldRecord) !== stableStringify(newById.get(id)))
        changes.push({ operation: "set", ...cloudRecordData(collection, newById.get(id)) });
    }
    for (const [id, record] of newById)
      if (!oldById.has(id)) changes.push({ operation: "set", ...cloudRecordData(collection, record) });
  }
  if (changes.length + 1 > MAX_TRANSACTION_WRITES)
    throw Error(`This save changes ${changes.length} records, which exceeds Firestore's safe per-save limit. Split this import into smaller batches and retry.`);
  return changes;
}

export function databaseFromCloud(state, documents) {
  const database = {
    version: 7,
    _rev: state?.revision || "",
    settings: state?.settings || {},
    ...Object.fromEntries(CLOUD_COLLECTIONS.map((key) => [key, []])),
  };
  for (const document of documents) {
    const { collection, id, value } = document;
    if (!CLOUD_COLLECTIONS.includes(collection) || !value || value.id !== id)
      throw Error("Cloud data contains an invalid record. Restore from a verified backup or contact support.");
    database[collection].push(value);
  }
  return database;
}
