import { IndexedDbAdapter } from './indexeddb-adapter.js';

/**
 * Storage factory for the web/PWA build.
 *
 * The Android SQLite path has been removed intentionally. IndexedDB gives the
 * installed PWA persistent browser storage without requiring Capacitor.
 */
export async function createStorageAdapter() {
  return new IndexedDbAdapter();
}
