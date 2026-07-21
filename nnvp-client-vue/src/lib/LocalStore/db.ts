/**
 * The app-wide RecordStore: IndexedDB when the runtime provides it, memory
 * fallback otherwise (private mode / storage denied — the app then behaves
 * like today, nothing survives the reload).
 *
 * Consumers call getRecordStore() and depend on the interface only. Tests
 * that exercise store behavior construct their own instance (param
 * injection, the house style — see Settings); tests that exercise CONSUMERS
 * of the singleton swap it with setRecordStoreForTests and restore with
 * setRecordStoreForTests(null).
 */

import { MemoryRecordStore } from './recordStore';
import type { RecordStore } from './recordStore';
import { IndexedDbRecordStore } from './indexedDbStore';

/** Pure factory: pick the implementation for a given (possibly absent) IDBFactory. */
export function createRecordStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): RecordStore {
  return factory ? new IndexedDbRecordStore(factory) : new MemoryRecordStore();
}

let instance: RecordStore | null = null;

/** The memoized app singleton. */
export function getRecordStore(): RecordStore {
  if (!instance) instance = createRecordStore();
  return instance;
}

/** TEST-ONLY: override the singleton (pass null to reset to the real one). */
export function setRecordStoreForTests(store: RecordStore | null): void {
  instance = store;
}
