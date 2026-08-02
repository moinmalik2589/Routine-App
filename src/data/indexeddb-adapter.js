import { SCHEMA_VERSION, STORE_NAMES } from './models.js';

const storeDefinitions = [
  [STORE_NAMES.metadata, { keyPath: 'key' }],
  [STORE_NAMES.settings, { keyPath: 'id' }],
  [STORE_NAMES.activities, { keyPath: 'id' }],
  [STORE_NAMES.dailyRoutines, { keyPath: 'date' }],
  [STORE_NAMES.completions, { keyPath: 'id', indexes: [['date', 'date'], ['activityId', 'activityId']] }],
  [STORE_NAMES.alarmStates, { keyPath: 'date' }],
  [STORE_NAMES.fastingRanges, { keyPath: 'id' }],
  [STORE_NAMES.prayerTimings, { keyPath: 'date' }],
  [STORE_NAMES.profiles, { keyPath: 'id' }],
];

function requestResult(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

export class IndexedDbAdapter {
  constructor({ name = 'moin-routine', indexedDB = globalThis.indexedDB, version = SCHEMA_VERSION } = {}) {
    if (!indexedDB) throw new Error('IndexedDB is unavailable in this environment.');
    this.name = name; this.indexedDB = indexedDB; this.version = version; this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    const request = this.indexedDB.open(this.name, this.version);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, config] of storeDefinitions) {
        const store = db.objectStoreNames.contains(name) ? request.transaction.objectStore(name) : db.createObjectStore(name, { keyPath: config.keyPath });
        for (const [indexName, keyPath] of config.indexes || []) if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
      }
    };
    this.db = await requestResult(request);
    this.db.onversionchange = () => { this.db.close(); this.db = null; };
    return this.db;
  }

  async transaction(storeNames, mode, operation) {
    const db = await this.open(); const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    const completed = new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted')); });
    const result = await operation(stores);
    await completed;
    return result;
  }

  get(store, key) { return this.transaction([store], 'readonly', ({ [store]: objectStore }) => requestResult(objectStore.get(key))); }
  getAll(store) { return this.transaction([store], 'readonly', ({ [store]: objectStore }) => requestResult(objectStore.getAll())); }
  put(store, value) { return this.transaction([store], 'readwrite', ({ [store]: objectStore }) => requestResult(objectStore.put(structuredClone(value)))); }
  delete(store, key) { return this.transaction([store], 'readwrite', ({ [store]: objectStore }) => requestResult(objectStore.delete(key))); }
  close() { this.db?.close(); this.db = null; }
  async destroy() { this.close(); await requestResult(this.indexedDB.deleteDatabase(this.name)); }
}
