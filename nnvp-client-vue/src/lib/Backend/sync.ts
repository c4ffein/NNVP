/**
 * sync.ts — local <-> cloud reconciliation for uuid-keyed records (runs,
 * conversations), PLAN.md Phase 6.
 *
 * The model is deliberately merge-free:
 *   - Pull what the server has and the client lacks (uuid set difference).
 *   - Push what the client has and the server lacks — unless the record is
 *     flagged `localOnly` (the ONE mutable flag: set by a cloud-delete so the
 *     surviving local copy is never re-uploaded behind the user's back).
 *   - Runs are immutable: a uuid on both sides means nothing to do.
 *   - Conversations mutate: a uuid on both sides is resolved by `updatedAt`
 *     (ISO strings — lexicographic order IS chronological order) and the
 *     newer side is copied over the older one, whole-record, no merging.
 *
 * Everything is injectable: `api` is a minimal structural interface over the
 * four per-kind endpoints, `store` is the RecordStore seam. The app wires the
 * real ApiClient (which satisfies SyncApiClient structurally) through
 * syncAll() / installSyncOnAuth(); tests inject fakes.
 *
 * Delete semantics (decided, exact — see PLAN.md Phase 6):
 *   - 'local'  deletes the local copy only; the cloud copy survives — that is
 *              the backup working as designed, and a later sync will pull it
 *              back only because the user kept it there.
 *   - 'cloud'  deletes the server copy AND flags the surviving local record
 *              `localOnly: true`, so sync never re-pushes it (no tombstones).
 *   - 'both'   does both deletions; no flag needed, nothing survives.
 * The UI must offer only the locations that actually hold the record —
 * deleteChoicesFor() is that pure helper.
 */

import { AUTH_CHANGED_EVENT } from './apiClient';
import type { RecordStore, RecordStoreName, StoredRecord } from '../LocalStore/recordStore';

/** The two synced record kinds; identical to the local store names on purpose. */
export type SyncKind = RecordStoreName;

/** A stored record as sync sees it: the uuid plus the two fields it reads. */
export interface SyncableRecord extends StoredRecord {
  /** Set by a cloud-delete: this record must never be pushed again. */
  localOnly?: boolean;
  /** ISO timestamp; conversations only — decides who wins a both-sides conflict. */
  updatedAt?: string;
}

/**
 * The four endpoints of ONE kind, as sync consumes them. ASSUMED CONTRACT
 * (backend built in parallel — reconciled at integration):
 *   - list() returns an array of projections each carrying at least `uuid`;
 *   - get(uuid) returns the full record payload as it was uploaded;
 *   - put(uuid, payload) upserts with the record itself as the body;
 *   - delete(uuid) resolves on 204.
 */
export interface KindApi {
  list(): Promise<unknown>;
  get(uuid: string): Promise<unknown>;
  put(uuid: string, payload: unknown): Promise<unknown>;
  delete(uuid: string): Promise<unknown>;
}

/** The slice of ApiClient that syncAll needs — satisfied structurally. */
export interface SyncApiClient {
  listRuns(): Promise<unknown>;
  getRun(uuid: string): Promise<unknown>;
  putRun(uuid: string, payload: unknown): Promise<unknown>;
  deleteRun(uuid: string): Promise<unknown>;
  listConversations(): Promise<unknown>;
  getConversation(uuid: string): Promise<unknown>;
  putConversation(uuid: string, payload: unknown): Promise<unknown>;
  deleteConversation(uuid: string): Promise<unknown>;
}

/** What installSyncOnAuth additionally needs: the auth boundary. */
export interface AuthedSyncApiClient extends SyncApiClient {
  isLoggedIn(): boolean;
}

/** Per-kind sync outcome, for logging / a future UI toast. */
export interface SyncSummary {
  /** Records the server had and the client lacked (now stored locally). */
  pulled: number;
  /** Records the client had (and not localOnly) and the server lacked. */
  pushed: number;
  /** Conversations on both sides where the newer copy replaced the older. */
  updated: number;
}

export interface SyncAllSummary {
  runs: SyncSummary;
  conversations: SyncSummary;
}

export type DeleteWhere = 'local' | 'cloud' | 'both';

/** Adapt the flat ApiClient method pairs into one kind's KindApi view. */
export function kindApiFrom(apiClient: SyncApiClient, kind: SyncKind): KindApi {
  if (kind === 'runs') {
    return {
      list: () => apiClient.listRuns(),
      get: uuid => apiClient.getRun(uuid),
      put: (uuid, payload) => apiClient.putRun(uuid, payload),
      delete: uuid => apiClient.deleteRun(uuid),
    };
  }
  return {
    list: () => apiClient.listConversations(),
    get: uuid => apiClient.getConversation(uuid),
    put: (uuid, payload) => apiClient.putConversation(uuid, payload),
    delete: uuid => apiClient.deleteConversation(uuid),
  };
}

/** The uuids present in a list() response, tolerating junk entries. */
function uuidsOf(listed: unknown): string[] {
  if (!Array.isArray(listed)) return [];
  const uuids: string[] = [];
  for (const entry of listed) {
    const uuid = (entry as { uuid?: unknown } | null)?.uuid;
    if (typeof uuid === 'string' && uuid) uuids.push(uuid);
  }
  return uuids;
}

/** A get() response as a storable record — or null when it is not an object. */
function asRecord(fetched: unknown, uuid: string): SyncableRecord | null {
  if (!fetched || typeof fetched !== 'object' || Array.isArray(fetched)) return null;
  // Re-stamp the uuid so a payload the server returns without one (or with a
  // diverging one) can never land in the store under the wrong key.
  return { ...(fetched as Record<string, unknown>), uuid } as SyncableRecord;
}

/** ISO-or-absent updatedAt as a comparable string (absent sorts oldest). */
function stampOf(record: { updatedAt?: unknown } | null): string {
  return record && typeof record.updatedAt === 'string' ? record.updatedAt : '';
}

/**
 * Reconcile one record kind between the local store and the cloud.
 * Both-sides conversations cost one extra get() each — the summary
 * projection is not trusted to carry updatedAt.
 */
export async function syncRecords({ api, store, kind }: {
  api: KindApi;
  store: RecordStore;
  kind: SyncKind;
}): Promise<SyncSummary> {
  const summary: SyncSummary = { pulled: 0, pushed: 0, updated: 0 };

  const remoteUuids = uuidsOf(await api.list());
  const remoteSet = new Set(remoteUuids);
  const locals = await store.list<SyncableRecord>(kind);
  const localByUuid = new Map(locals.map(record => [record.uuid, record]));

  // Pull what the server has and we lack; resolve conversation conflicts.
  for (const uuid of remoteUuids) {
    const local = localByUuid.get(uuid);
    if (!local) {
      const fetched = asRecord(await api.get(uuid), uuid);
      if (fetched) {
        await store.put(kind, fetched);
        summary.pulled += 1;
      }
    } else if (kind === 'conversations' && !local.localOnly) {
      // Both sides hold it: the newer updatedAt wins, whole-record.
      // (localOnly records sat out: they are detached from the cloud copy.)
      const remote = asRecord(await api.get(uuid), uuid);
      const remoteStamp = stampOf(remote);
      const localStamp = stampOf(local);
      if (remote && remoteStamp > localStamp) {
        await store.put(kind, remote);
        summary.updated += 1;
      } else if (localStamp > remoteStamp) {
        await api.put(uuid, local);
        summary.updated += 1;
      }
      // Equal stamps (incl. runs-style identical copies): nothing to do.
    }
    // kind === 'runs' with a local copy: immutable, both-sides = no-op.
  }

  // Push what we have and the server lacks — never localOnly records.
  for (const record of locals) {
    if (!remoteSet.has(record.uuid) && !record.localOnly) {
      await api.put(record.uuid, record);
      summary.pushed += 1;
    }
  }

  return summary;
}

/** Run both kinds; the real ApiClient satisfies SyncApiClient structurally. */
export async function syncAll({ apiClient, store }: {
  apiClient: SyncApiClient;
  store: RecordStore;
}): Promise<SyncAllSummary> {
  const runs = await syncRecords({ api: kindApiFrom(apiClient, 'runs'), store, kind: 'runs' });
  const conversations = await syncRecords({
    api: kindApiFrom(apiClient, 'conversations'), store, kind: 'conversations',
  });
  return { runs, conversations };
}

/**
 * Delete one record from the places the user picked (PLAN.md Phase 6):
 * 'local' leaves the cloud copy untouched (the backup surviving by design);
 * 'cloud' also flags the surviving local record localOnly so sync never
 * re-pushes it; 'both' removes every copy.
 */
export async function deleteEverywhere({ api, store, kind, uuid, where }: {
  api: KindApi;
  store: RecordStore;
  kind: SyncKind;
  uuid: string;
  where: DeleteWhere;
}): Promise<void> {
  if (where === 'cloud' || where === 'both') await api.delete(uuid);
  if (where === 'local' || where === 'both') {
    await store.delete(kind, uuid);
    return;
  }
  if (where === 'cloud') {
    // The local copy survives — re-fetch, flag, rewrite so it is never pushed.
    const survivor = await store.get<SyncableRecord>(kind, uuid);
    if (survivor) {
      const flagged: SyncableRecord = { ...survivor, localOnly: true };
      await store.put(kind, flagged);
    }
  }
}

/**
 * The pure UI helper: which locations actually hold this (local) record —
 * exactly the delete choices the panel may offer. `cloudUuids` is the uuid
 * set from the matching list endpoint.
 */
export function deleteChoicesFor(
  record: { uuid: string },
  cloudUuids: Set<string>,
): DeleteWhere[] {
  return cloudUuids.has(record.uuid) ? ['local', 'cloud', 'both'] : ['local'];
}

/** The addEventListener surface installSyncOnAuth needs (window-ish, injectable). */
export interface AuthEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Wire "sync when signed in" to the auth boundary: listens for
 * AUTH_CHANGED_EVENT on `target` (the app passes window; main.ts calls this
 * once at startup) and runs syncAll whenever the client is logged in — which
 * covers login. Sign-out fires the same event but is a no-op here. By default
 * it also syncs immediately when already logged in at install time (a stored
 * token fires no event on page load). Overlapping triggers are coalesced:
 * a sync already in flight is not doubled. Returns the uninstaller.
 */
export function installSyncOnAuth({
  target, apiClient, store, immediate = true, onSynced, onError,
}: {
  target: AuthEventTarget;
  apiClient: AuthedSyncApiClient;
  store: RecordStore;
  /** Also sync right away when a token is already present (default true). */
  immediate?: boolean;
  onSynced?: (result: SyncAllSummary) => void;
  onError?: (error: unknown) => void;
}): () => void {
  let syncing = false;

  const run = async () => {
    if (syncing || !apiClient.isLoggedIn()) return;
    syncing = true;
    try {
      const result = await syncAll({ apiClient, store });
      if (onSynced) onSynced(result);
    } catch (error) {
      // Sync is a progressive enhancement: failures must never break the app.
      if (onError) onError(error);
      else console.warn('nnvp sync failed:', error);
    } finally {
      syncing = false;
    }
  };

  const listener = () => { void run(); };
  target.addEventListener(AUTH_CHANGED_EVENT, listener);
  if (immediate) void run();
  return () => target.removeEventListener(AUTH_CHANGED_EVENT, listener);
}
