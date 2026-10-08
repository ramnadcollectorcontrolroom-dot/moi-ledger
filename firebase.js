import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "10.14.1";
const configured = firebaseConfig.apiKey !== "YOUR_API_KEY"
  && firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  && firebaseConfig.appId !== "YOUR_APP_ID";

let firebase;
let initialization;

async function loadFirebase() {
  if (!configured) throw new Error("Firebase is not configured. Add your Firebase Web app settings to firebase-config.js.");
  if (!initialization) {
    initialization = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]).then(([appSdk, authSdk, firestoreSdk]) => {
      const app = appSdk.initializeApp(firebaseConfig);
      const auth = authSdk.initializeAuth(app, { persistence: authSdk.indexedDBLocalPersistence });
      const db = firestoreSdk.getFirestore(app);
      firebase = { appSdk, authSdk, firestoreSdk, app, auth, db };
      return firebase;
    }).catch(error => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

export function isFirebaseConfigured() {
  return configured;
}

export async function observeAuth(callback, onError) {
  const sdk = await loadFirebase();
  return sdk.authSdk.onAuthStateChanged(sdk.auth, callback, onError);
}

export async function createAccount(email, password) {
  const sdk = await loadFirebase();
  return sdk.authSdk.createUserWithEmailAndPassword(sdk.auth, email, password);
}

export async function signIn(email, password) {
  const sdk = await loadFirebase();
  return sdk.authSdk.signInWithEmailAndPassword(sdk.auth, email, password);
}

export async function sendPasswordReset(email) {
  const sdk = await loadFirebase();
  return sdk.authSdk.sendPasswordResetEmail(sdk.auth, email);
}

export async function signOut() {
  const sdk = await loadFirebase();
  return sdk.authSdk.signOut(sdk.auth);
}

function syncDocumentData(storeName, row, eventIds) {
  const data = { ...row, updatedAt: row._syncUpdatedAt || new Date().toISOString() };
  delete data.id;
  delete data._syncUpdatedAt;
  delete data._syncId;
  if (storeName === "received") {
    data.eventSyncId = eventIds.get(row.eventId) || null;
    delete data.eventId;
  }
  return data;
}

async function mergeStore(firebaseSdk, bridge, uid, storeName, localRows, eventIds) {
  const { collection, doc, getDocs, runTransaction } = firebaseSdk.firestoreSdk;
  const collectionRef = collection(firebaseSdk.db, "users", uid, storeName);
  const cloudDocs = await getDocs(collectionRef);
  const remoteById = new Map(cloudDocs.docs.map(snapshot => [snapshot.id, { ...snapshot.data(), _syncId: snapshot.id }]));
  const localById = new Map();

  for (const source of localRows) {
    const row = { ...source };
    if (storeName === "settings" && ["pin", "cloudOwnerUid"].includes(row.key)) continue;
    const syncId = storeName === "settings" ? row.key : (row._syncId || crypto.randomUUID());
    if (storeName !== "settings" && !row._syncId) {
      row._syncId = syncId;
      row._syncUpdatedAt = row._syncUpdatedAt || new Date(0).toISOString();
      await bridge.localPut(storeName, row, { synced: true });
    }
    localById.set(syncId, row);
  }

  for (const deletion of await bridge.getDeletes(storeName)) {
    localById.set(deletion.syncId, { ...deletion, _deleted: true, _syncId: deletion.syncId, _syncUpdatedAt: deletion.updatedAt });
  }

  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);
  const resolvedEvents = new Map(eventIds);
  for (const syncId of allIds) {
    const local = localById.get(syncId);
    let remote = remoteById.get(syncId);
    const localTime = Date.parse(local?._syncUpdatedAt || local?.updatedAt || 0) || 0;
    const remoteTime = Date.parse(remote?.updatedAt || 0) || 0;
    let localWins = Boolean(local) && (!remote || localTime > remoteTime);

    if (localWins) {
      const reference = doc(collectionRef, syncId);
      const localDocument = local._deleted
        ? { _deleted: true, updatedAt: local._syncUpdatedAt }
        : syncDocumentData(storeName, local, resolvedEvents);
      remote = await runTransaction(firebaseSdk.db, async transaction => {
        const latest = await transaction.get(reference);
        const latestData = latest.exists() ? latest.data() : null;
        const latestTime = Date.parse(latestData?.updatedAt || 0) || 0;
        if (latestData && latestTime >= localTime) return { ...latestData, _syncId: syncId };
        transaction.set(reference, localDocument);
        return null;
      });
      if (remote) localWins = false;
      else {
        await bridge.clearDelete(storeName, syncId);
        continue;
      }
    }

    if (remote) {
      if (remote._deleted) {
        const existing = localById.get(syncId);
        if (existing && !existing._deleted) await bridge.localRemove(storeName, storeName === "settings" ? existing.key : existing.id, { synced: true });
        await bridge.clearDelete(storeName, syncId);
      } else {
        const synced = { ...remote, _syncId: syncId, _syncUpdatedAt: remote.updatedAt };
        delete synced.updatedAt;
        delete synced._deleted;
        if (storeName === "settings") {
          synced.key = syncId;
          await bridge.localPut(storeName, synced, { synced: true });
        } else {
          if (storeName === "received") synced.eventId = resolvedEvents.get(remote.eventSyncId);
          const existing = localById.get(syncId);
          if (existing?.id !== undefined) synced.id = existing.id;
          if (storeName !== "received" || synced.eventId !== undefined) await bridge.localPut(storeName, synced, { synced: true });
        }
        await bridge.clearDelete(storeName, syncId);
      }
    }
  }

  if (storeName === "events") {
    const refreshedEvents = await sdk.localGetAll("events");
    for (const event of refreshedEvents) if (event._syncId) resolvedEvents.set(event._syncId, event.id);
  }
  return resolvedEvents;
}

export async function syncAccount(uid, localDatabase) {
  const firebaseSdk = await loadFirebase();
  const bridge = {
    localGetAll: localDatabase.getAll,
    localPut: localDatabase.put,
    localRemove: localDatabase.remove,
    getDeletes: localDatabase.getDeletes,
    clearDelete: localDatabase.clearDelete
  };
  let eventIds = new Map();
  for (const storeName of ["events", "received", "given", "routes", "settings"]) {
    eventIds = await mergeStore(firebaseSdk, bridge, uid, storeName, await bridge.localGetAll(storeName), eventIds);
  }
}
