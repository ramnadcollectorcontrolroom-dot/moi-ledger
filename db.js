const DB_NAME = "moi-ledger";
const DB_VERSION = 1;
const STORES = ["events", "received", "given", "routes", "settings"];

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
      received.createIndex("eventId", "eventId", { unique: false });
      received.createIndex("personVillage", ["personKey", "villageKey"], { unique: false });
      const given = request.transaction.objectStore("given");
      given.createIndex("personVillage", ["personKey", "villageKey"], { unique: false });
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

export async function put(storeName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function remove(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function replaceAll(data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    for (const name of STORES) {
      const store = tx.objectStore(name);
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
    for (const value of values) tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not import records"));
  });
}
