/**
 * The local persistence seam for uuid-keyed records (training runs, chat
 * conversations). Consumers depend on this interface only; the app wires the
 * IndexedDB implementation (see db.ts) and tests inject MemoryRecordStore —
 * the same injection style as StorageLike, but async and sized for records
 * that would blow through localStorage (per-epoch series, graph snapshots).
 *
 * Records are immutable-by-convention JSON-safe objects identified by a
 * client-generated uuid; put() upserts, so the few legitimately mutable
 * records (conversations) just rewrite themselves under the same uuid.
 */

export type RecordStoreName = 'runs' | 'conversations' | 'events';

/** Every objectStore the database holds; bump DB_VERSION in indexedDbStore when this grows.
 *  'events' (v2) is the append-only domain-event log (lib/Events/store.ts);
 *  'runs' is read-only legacy since the run journal became event-sourced —
 *  existing records stay untouched and explode into synthetic events on first
 *  use (lib/Training/runJournal.ts). */
export const RECORD_STORE_NAMES: RecordStoreName[] = ['runs', 'conversations', 'events'];

export interface StoredRecord {
  uuid: string;
}

export interface RecordStore {
  put(store: RecordStoreName, record: StoredRecord): Promise<void>;
  get<T extends StoredRecord>(store: RecordStoreName, uuid: string): Promise<T | null>;
  list<T extends StoredRecord>(store: RecordStoreName): Promise<T[]>;
  delete(store: RecordStoreName, uuid: string): Promise<void>;
}

/**
 * In-memory implementation: the test double, and the runtime fallback when
 * IndexedDB is unavailable (private mode, storage denied) — the app then
 * simply behaves like today, nothing survives the reload.
 */
export class MemoryRecordStore implements RecordStore {
  private stores = new Map<RecordStoreName, Map<string, StoredRecord>>();

  private mapFor(store: RecordStoreName): Map<string, StoredRecord> {
    let map = this.stores.get(store);
    if (!map) {
      map = new Map();
      this.stores.set(store, map);
    }
    return map;
  }

  async put(store: RecordStoreName, record: StoredRecord): Promise<void> {
    // Deep-copy through JSON: enforces JSON-safety (what IndexedDB would
    // tolerate but the backend sync will not) and kills shared references.
    this.mapFor(store).set(record.uuid, JSON.parse(JSON.stringify(record)));
  }

  async get<T extends StoredRecord>(store: RecordStoreName, uuid: string): Promise<T | null> {
    const record = this.mapFor(store).get(uuid);
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }

  async list<T extends StoredRecord>(store: RecordStoreName): Promise<T[]> {
    return [...this.mapFor(store).values()].map(record => JSON.parse(JSON.stringify(record)));
  }

  async delete(store: RecordStoreName, uuid: string): Promise<void> {
    this.mapFor(store).delete(uuid);
  }
}
