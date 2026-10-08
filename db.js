const DB_NAME = "moi-ledger";
const DB_VERSION = 2;
const STORES = ["events", "received", "given", "routes", "settings", "_syncDeletes"];

let database;

function openDatabase() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === "settings" ? "key" : "id", autoIncrement: name !== "settings" });
        }
      }
      const received = request.transaction.objectStore("received");
      if (!received.indexNames.contains("eventId")) received.createIndex("eventId", "eventId", { unique: false });
      if (!received.indexNames.contains("personVillage")) received.createIndex("personVillage", ["personKey", "villageKey"], { unique: false });
      const given = request.transaction.objectStore("given");
      if (!given.indexNames.contains("personVillage")) given.createIndex("personVillage", ["personKey", "villageKey"], { unique: false });
    };
    request.onsuccess = () => {
      database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("IndexedDB could not be opened"));
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value, options = {}) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const record = { ...value };
    if (!options.synced && storeName !== "settings" && storeName !== "_syncDeletes") {
      record._syncId ||= crypto.randomUUID();
      record._syncUpdatedAt = new Date().toISOString();
    } else if (!options.synced && storeName === "settings" && !["pin", "cloudOwnerUid"].includes(record.key)) {
      record._syncUpdatedAt = new Date().toISOString();
    }
    const request = tx.objectStore(storeName).put(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function remove(storeName, key, options = {}) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName === "_syncDeletes" ? [storeName] : [storeName, "_syncDeletes"], "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => {
      const row = request.result;
      if (row && !options.synced && storeName !== "_syncDeletes") {
        const syncId = storeName === "settings" ? row.key : (row._syncId || crypto.randomUUID());
        if (!(storeName === "settings" && ["pin", "cloudOwnerUid"].includes(row.key))) {
          const tombstone = { id: `${storeName}:${syncId}`, storeName, syncId, updatedAt: new Date().toISOString() };
          tx.objectStore("_syncDeletes").put(tombstone);
        }
      }
      store.delete(key);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not delete record"));
  });
}

export async function replaceAll(data) {
  const db = await openDatabase();
  const previous = Object.fromEntries(await Promise.all(["events", "received", "given", "routes", "settings", "_syncDeletes"]
    .map(async name => [name, await getAll(name)])));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    for (const name of STORES) {
      const store = tx.objectStore(name);
      if (name === "_syncDeletes") {
        for (const row of data[name] || []) store.put(row);
        continue;
      }
      const newKeys = new Set((data[name] || []).map(row => name === "settings" ? row.key : row.id).filter(key => key !== undefined));
      if (name !== "settings") for (const oldRow of previous[name]) {
        if (!newKeys.has(oldRow.id) && oldRow._syncId) {
          tx.objectStore("_syncDeletes").put({
            id: `${name}:${oldRow._syncId}`,
            storeName: name,
            syncId: oldRow._syncId,
            updatedAt: new Date().toISOString()
          });
        }
      }
      store.clear();
      for (const row of data[name] || []) store.put(row);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Backup restore failed"));
    tx.onabort = () => reject(tx.error || new Error("Backup restore was cancelled"));
  });
}

export async function bulkPut(storeName, values) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    for (const value of values) {
      const row = { ...value, _syncId: value._syncId || crypto.randomUUID(), _syncUpdatedAt: new Date().toISOString() };
      tx.objectStore(storeName).put(row);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not import records"));
  });
}

export async function getDeletes(storeName) {
  return (await getAll("_syncDeletes")).filter(row => row.storeName === storeName);
}

export async function clearDelete(storeName, syncId) {
  await remove("_syncDeletes", `${storeName}:${syncId}`, { synced: true });
}
