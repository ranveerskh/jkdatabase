// Isolated browser-test backend. Never included in the Netlify build.
export function firebaseFixture(entries, signedInUser = { uid: "test-admin", email: "admin@example.test" }) {
  const records = new Map(entries);
  const listeners = new Set();
  const metrics = { membershipReads: 0, commits: 0, failNextSave: false };
  window.__testCloud = { records, metrics };
  const snapshot = (path, source = records) => ({
    id: path.split("/").pop(),
    exists: () => source.has(path),
    data: () => structuredClone(source.get(path)),
  });
  const auth = {}, firestore = {};
  const firebaseAuth = {
    browserLocalPersistence: {},
    onAuthStateChanged: (_auth, callback) => {
      listeners.add(callback);
      queueMicrotask(() => { if (listeners.has(callback)) callback(signedInUser); });
      return () => listeners.delete(callback);
    },
    signOut: async () => { signedInUser = null; for (const callback of listeners) callback(null); },
    setPersistence: async () => {},
    signInWithEmailAndPassword: async () => { throw Error("Test fixture has no live sign-in."); },
    sendPasswordResetEmail: async () => {},
  };
  const firebaseStore = {
    doc: (_store, ...parts) => parts.join("/"),
    collection: (_store, ...parts) => parts.join("/"),
    getDoc: async (path) => {
      if (path.includes("/members/")) metrics.membershipReads++;
      return snapshot(path);
    },
    getDocs: async (path) => {
      const docs = [...records.keys()].filter((key) => key.startsWith(path + "/")).map((key) => snapshot(key));
      return { docs, size: docs.length };
    },
    runTransaction: async (_store, callback) => {
      if (metrics.failNextSave) { metrics.failNextSave = false; throw Error("Cloud data changed on another device. Reload before saving."); }
      const pending = new Map(records);
      await callback({
        get: async (path) => snapshot(path, pending),
        set: (path, value) => pending.set(path, structuredClone(value)),
        delete: (path) => pending.delete(path),
      });
      records.clear();
      for (const [key, value] of pending) records.set(key, value);
      metrics.commits++;
    },
  };
  return { auth, firestore, firebaseAuth, firebaseStore };
}
