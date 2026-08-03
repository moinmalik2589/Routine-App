import { APPLICATION_SCHEMA_VERSION, STORE_NAMES } from './models.js';

export const DATABASE_NAME = 'moin-routine';
export const INDEXEDDB_PHYSICAL_VERSION = 3;
export const REQUIRED_STORE_NAMES = Object.freeze(Object.values(STORE_NAMES));

const storeDefinitions = [
  [STORE_NAMES.metadata, { keyPath: 'key' }], [STORE_NAMES.settings, { keyPath: 'id' }], [STORE_NAMES.profiles, { keyPath: 'id' }],
  [STORE_NAMES.activities, { keyPath: 'id' }], [STORE_NAMES.dailyRoutines, { keyPath: 'date' }],
  [STORE_NAMES.completions, { keyPath: 'id', indexes: [['date', 'date'], ['activityId', 'activityId']] }],
  [STORE_NAMES.alarmStates, { keyPath: 'date' }], [STORE_NAMES.fastingRanges, { keyPath: 'id' }], [STORE_NAMES.prayerTimings, { keyPath: 'date' }],
];

function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('IndexedDB request failed.')); }); }
function transactionDone(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error || new DOMException('IndexedDB transaction aborted.', 'AbortError')); transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.')); }); }
function retryable(error) { return ['InvalidStateError', 'NotFoundError', 'TransactionInactiveError'].includes(error?.name); }

export function validateSchemaIntegrity(db) {
  const existingStores = [...db.objectStoreNames]; const missingStores = REQUIRED_STORE_NAMES.filter((name) => !db.objectStoreNames.contains(name));
  return { valid: missingStores.length === 0, missingStores, existingStores, physicalVersion: db.version, applicationSchemaVersion: APPLICATION_SCHEMA_VERSION };
}

export class IndexedDbAdapter {
  constructor({ name = DATABASE_NAME, indexedDB = globalThis.indexedDB, physicalVersion = INDEXEDDB_PHYSICAL_VERSION } = {}) {
    if (!indexedDB) throw new Error('IndexedDB is unavailable in this environment.');
    this.name = name; this.indexedDB = indexedDB; this.minimumPhysicalVersion = physicalVersion; this.db = null; this.openPromise = null; this.connectionState = 'closed'; this.repairRequired = false; this.repairPerformed = false; this.activeTransactions = 0;
  }

  createStoresDuringUpgrade(request) {
    const db = request.result, upgradeTransaction = request.transaction;
    for (const [name, config] of storeDefinitions) {
      const store = db.objectStoreNames.contains(name) ? upgradeTransaction.objectStore(name) : db.createObjectStore(name, { keyPath: config.keyPath });
      for (const [indexName, keyPath] of config.indexes || []) if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
    }
  }

  openRequest(version) {
    return new Promise((resolve, reject) => {
      const request = version == null ? this.indexedDB.open(this.name) : this.indexedDB.open(this.name, version); let blockedTimer, blockedRejected = false;
      request.onupgradeneeded = () => this.createStoresDuringUpgrade(request);
      request.onblocked = () => { blockedTimer = setTimeout(() => { blockedRejected = true; reject(new Error(`IndexedDB upgrade to physical version ${version} is blocked by another open connection.`)); }, 3000); };
      request.onerror = () => { clearTimeout(blockedTimer); reject(request.error || new Error('Unable to open IndexedDB.')); };
      request.onsuccess = () => { clearTimeout(blockedTimer); if (blockedRejected) { request.result.close(); return; } resolve(request.result); };
    });
  }

  bindConnection(db) {
    this.db = db; this.connectionState = 'open';
    db.onversionchange = () => { this.connectionState = 'versionchange'; db.close(); this.invalidateConnection(db); };
    db.onclose = () => this.invalidateConnection(db);
    return db;
  }

  invalidateConnection(db = this.db) { if (!db || this.db === db) { this.db = null; this.openPromise = null; if (this.connectionState !== 'repairing') this.connectionState = 'closed'; } }

  async openAndRepairIfNeeded() {
    this.connectionState = 'opening'; let db; try { db = await this.openRequest(this.minimumPhysicalVersion); } catch (error) { if (error?.name !== 'VersionError') throw error; db = await this.openRequest(); } let integrity = validateSchemaIntegrity(db);
    if (!integrity.valid) {
      this.repairRequired = true; this.connectionState = 'repairing'; const repairVersion = db.version + 1; db.close();
      db = await this.openRequest(repairVersion); integrity = validateSchemaIntegrity(db); this.repairPerformed = true;
    }
    if (!integrity.valid) { db.close(); this.connectionState = 'failed'; throw new Error(`IndexedDB schema repair failed. Missing stores: ${integrity.missingStores.join(', ')}.`); }
    return this.bindConnection(db);
  }

  open() {
    if (this.db && this.connectionState === 'open') return Promise.resolve(this.db);
    if (this.openPromise) return this.openPromise;
    this.openPromise = this.openAndRepairIfNeeded().catch((error) => { this.connectionState = 'failed'; this.openPromise = null; this.db = null; throw error; });
    return this.openPromise;
  }

  async repairSchema() {
    const current = this.db || await this.open(); const repairVersion = current.version + 1; this.repairRequired = true; this.connectionState = 'repairing'; current.close(); this.db = null; this.openPromise = null;
    const repaired = await this.openRequest(repairVersion); const integrity = validateSchemaIntegrity(repaired); if (!integrity.valid) { repaired.close(); throw new Error(`IndexedDB schema repair failed. Missing stores: ${integrity.missingStores.join(', ')}.`); }
    this.repairPerformed = true; return this.bindConnection(repaired);
  }

  async transaction(storeNames, mode, operation, attempt = 0) {
    let db;
    try {
      db = await this.open(); const integrity = validateSchemaIntegrity(db); if (!integrity.valid) { if (attempt > 0) throw new DOMException(`Missing stores: ${integrity.missingStores.join(', ')}`, 'NotFoundError'); await this.repairSchema(); return this.transaction(storeNames, mode, operation, 1); }
      const transaction = db.transaction(storeNames, mode), completion = transactionDone(transaction); this.activeTransactions++;
      try { const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)])); const result = await operation(stores); await completion; return result; } finally { this.activeTransactions--; }
    } catch (error) {
      if (attempt === 0 && retryable(error)) { try { db?.close(); } catch {} this.invalidateConnection(db); return this.transaction(storeNames, mode, operation, 1); }
      throw error;
    }
  }

  get(store, key) { return this.transaction([store], 'readonly', ({ [store]: objectStore }) => requestResult(objectStore.get(key))); }
  getAll(store) { return this.transaction([store], 'readonly', ({ [store]: objectStore }) => requestResult(objectStore.getAll())); }
  put(store, value) { return this.transaction([store], 'readwrite', ({ [store]: objectStore }) => requestResult(objectStore.put(structuredClone(value)))); }
  delete(store, key) { return this.transaction([store], 'readwrite', ({ [store]: objectStore }) => requestResult(objectStore.delete(key))); }
  replaceAll(data) { const names = Object.values(STORE_NAMES); return this.transaction(names, 'readwrite', async (stores) => { for (const name of names) { await requestResult(stores[name].clear()); for (const value of data[name] || []) await requestResult(stores[name].put(structuredClone(value))); } }); }
  close() { if (this.activeTransactions) throw new Error('Cannot close IndexedDB while transactions are active.'); this.connectionState = 'closing'; this.db?.close(); this.invalidateConnection(); }
  async destroy() { this.close(); await requestResult(this.indexedDB.deleteDatabase(this.name)); }
  async diagnostics() { const db = await this.open(), metadata = await this.get(STORE_NAMES.metadata, 'schemaVersion'); return { databaseName: this.name, physicalVersion: db.version, applicationSchemaVersion: metadata?.value || null, objectStores: [...db.objectStoreNames], connectionState: this.connectionState, repairRequired: this.repairRequired, repairPerformed: this.repairPerformed, activeTransactions: this.activeTransactions }; }
}
