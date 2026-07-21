/**
 * The IndexedDB implementation of RecordStore (see recordStore.ts). Hand
 * rolled, zero dependencies: one database 'nnvp', one objectStore per
 * RECORD_STORE_NAMES entry keyed on 'uuid'. The database opens lazily on the
 * first call and the open promise is memoized, so concurrent first calls
 * share one upgrade/open cycle.
 *
 * The IDBFactory is constructor-injectable (same param-injection style as
 * Settings/currentProject take a StorageLike); the app default is the real
 * globalThis.indexedDB, tests may hand in a fake or a private factory.
 */

import { RECORD_STORE_NAMES } from './recordStore';
import type { RecordStore, RecordStoreName, StoredRecord } from './recordStore';

const DB_NAME = 'nnvp';
/** Bump when RECORD_STORE_NAMES grows so onupgradeneeded re-runs. */
const DB_VERSION = 1;

/** Promise-wrap a single IDBRequest (get/getAll style reads). */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Resolve when the whole transaction has durably completed (writes). */
function promisifyTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbRecordStore implements RecordStore {
  private factory: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(factory: IDBFactory = globalThis.indexedDB) {
    this.factory = factory;
  }

  /** Lazy-open the database; the promise is memoized across calls. */
  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          RECORD_STORE_NAMES.forEach((name) => {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: 'uuid' });
            }
          });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error(`IndexedDB open of '${DB_NAME}' failed`));
        request.onblocked = () => reject(new Error(`IndexedDB open of '${DB_NAME}' blocked by another connection`));
      });
      // A failed open must not poison every later call: drop the memo so the
      // next call retries (e.g. a transient private-mode denial).
      this.dbPromise.catch(() => { this.dbPromise = null; });
    }
    return this.dbPromise;
  }

  async put(store: RecordStoreName, record: StoredRecord): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(store, 'readwrite');
    // Copy through JSON like MemoryRecordStore: IndexedDB's structured clone
    // would tolerate Dates/Maps that the backend sync later cannot, so both
    // implementations enforce the same JSON-safe contract.
    transaction.objectStore(store).put(JSON.parse(JSON.stringify(record)));
    await promisifyTransaction(transaction);
  }

  async get<T extends StoredRecord>(store: RecordStoreName, uuid: string): Promise<T | null> {
    const db = await this.open();
    const result = await promisifyRequest(
      db.transaction(store, 'readonly').objectStore(store).get(uuid),
    );
    return (result as T | undefined) ?? null;
  }

  async list<T extends StoredRecord>(store: RecordStoreName): Promise<T[]> {
    const db = await this.open();
    return promisifyRequest(
      db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>,
    );
  }

  async delete(store: RecordStoreName, uuid: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(uuid);
    await promisifyTransaction(transaction);
  }
}
