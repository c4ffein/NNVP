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
/** Bump when RECORD_STORE_NAMES grows so onupgradeneeded re-runs.
 *  v1: runs + conversations. v2: + events (the domain-event log). */
export const DB_VERSION = 2;

/** The structural slice of IDBDatabase the upgrade touches — so the upgrade
 *  logic is unit-testable under bun, where happy-dom has no IndexedDB. */
export interface UpgradableDb {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options?: { keyPath: string }): unknown;
}

/**
 * The whole migration ladder, additive by construction: create whatever
 * objectStores RECORD_STORE_NAMES declares and the database lacks. A fresh db
 * gets all of them; a v1 db (runs, conversations) gains exactly 'events' —
 * existing stores and their records are never touched. Returns what was
 * created (for tests/logging).
 */
export function createMissingRecordStores(db: UpgradableDb): string[] {
  const created: string[] = [];
  RECORD_STORE_NAMES.forEach((name) => {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, { keyPath: 'uuid' });
      created.push(name);
    }
  });
  return created;
}

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
          createMissingRecordStores(request.result);
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
