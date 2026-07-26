/**
 * sync.ts — local <-> cloud reconciliation, PLAN.md Phase 6 + Phase C v2.
 *
 * Two sync surfaces now live here:
 *   - EVENTS (sync v2, Phase C): the domain event log syncs by pure uuid
 *     set-difference — paginate the remote uuid listing fully, batch-get
 *     what the client lacks (appended through the event store, so folds and
 *     live subscribers update), batch-put what the server lacks. Events are
 *     immutable and puts are per-item idempotent, so both-sides is always a
 *     no-op and re-push is always safe; LWW does not exist here. `localOnly`
 *     events (post-purge survivors, exploded copies of detached legacy
 *     records) never push.
 *   - RECORDS (Phase 6): conversations only, as before — pull the missing,
 *     push the non-localOnly missing, resolve both-sides by `updatedAt`
 *     whole-record LWW. RUNS RECORDS NO LONGER SYNC: run history rides the
 *     event log now; the legacy 'runs' store is read-only local data. The
 *     syncRecords guard against pushing outcome:'running' snapshots stays,
 *     pinned, for the generic record path's integrity.
 *
 * Everything is injectable: `api` is a minimal structural interface over the
 * endpoints, `store` is the RecordStore seam. The app wires the real
 * ApiClient (which satisfies the interfaces structurally) through
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

import { bus } from '../Events/bus';
import type { RecordStore, StoredRecord } from '../LocalStore/recordStore';
import type { DomainEvent } from '../Events/domainEvent';
import { appendEvent, listAllEvents } from '../Events/store';
import { ensureLegacyRunsExploded } from '../Training/runJournal';

/** The record kinds syncRecords understands. Only 'conversations' still
 *  syncs as records ('runs' moved to the event log); the 'runs' path stays
 *  supported and pinned so the generic mechanism keeps its contract. */
export type SyncKind = 'runs' | 'conversations';

/** A stored record as sync sees it: the uuid plus the three fields it reads. */
export interface SyncableRecord extends StoredRecord {
  /** Set by a cloud-delete: this record must never be pushed again. */
  localOnly?: boolean;
  /** ISO timestamp; conversations only — decides who wins a both-sides conflict. */
  updatedAt?: string;
  /** Runs only: 'running' means in-flight — pushing it would freeze a stale
   * snapshot in the cloud forever, since runs are immutable on both sides. */
  outcome?: string;
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

/** The record-kind slice of ApiClient — satisfied structurally. The run
 *  quartet remains for kindApiFrom completeness even though syncAll no
 *  longer syncs runs records. */
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

/** The three event endpoints sync v2 consumes (ApiClient satisfies it). */
export interface EventsApi {
  listEventUuids(params?: { cursor?: number; limit?: number; streamId?: string }):
    Promise<{ uuids: string[]; nextCursor: number | null }>;
  batchGetEvents(uuids: string[]): Promise<DomainEvent[]>;
  batchPutEvents(events: DomainEvent[]):
    Promise<{ uuid: string; status: string; error?: string | null }[]>;
}

/** Everything syncAll drives: conversations records + the event log. */
export interface SyncV2ApiClient extends SyncApiClient, EventsApi {}

/** What installSyncOnAuth additionally needs: the auth boundary. */
export interface AuthedSyncApiClient extends SyncV2ApiClient {
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

/** The event half's outcome: pure set-difference, so no 'updated' exists. */
export interface EventSyncSummary {
  pulled: number;
  pushed: number;
}

export interface SyncAllSummary {
  events: EventSyncSummary;
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

  // Push what we have and the server lacks — never localOnly records, and
  // never in-flight runs (immutable remotely: an early push could never be
  // corrected once the run finishes).
  for (const record of locals) {
    if (!remoteSet.has(record.uuid) && !record.localOnly && record.outcome !== 'running') {
      await api.put(record.uuid, record);
      summary.pushed += 1;
    }
  }

  return summary;
}

// --- sync v2: the event log (uuid set-difference, immutable both ways) -----------

/** The server's batch cap — chunk size for batch-get and batch-put alike. */
export const EVENT_BATCH_LIMIT = 500;

function* chunksOf<T>(items: T[], size: number): Generator<T[]> {
  for (let start = 0; start < items.length; start += size) {
    yield items.slice(start, start + size);
  }
}

/**
 * Reconcile the local event log with the cloud:
 *   1. legacy RunRecords explode first (deterministic uuids — see runJournal),
 *      so pre-event history takes part in the very first sync;
 *   2. the remote uuid listing is paginated to exhaustion (nextCursor null);
 *   3. events the server has and we lack are batch-fetched and APPENDED
 *      through the event store — persisted, deduped, emitted on the bus;
 *   4. events we have (and not localOnly) that the server lacks are
 *      batch-put — per-item idempotent, so racing devices cannot conflict.
 * Nothing is ever updated or merged: events are immutable, the diff is the
 * whole algorithm.
 */
export async function syncEvents({ api, store }: {
  api: EventsApi;
  store: RecordStore;
}): Promise<EventSyncSummary> {
  await ensureLegacyRunsExploded(store);

  const remote = new Set<string>();
  let cursor: number | undefined;
  do {
    const page = await api.listEventUuids(cursor === undefined ? {} : { cursor });
    for (const uuid of page.uuids) remote.add(uuid);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  const locals = await listAllEvents(store);
  const localUuids = new Set(locals.map(event => event.uuid));

  let pulled = 0;
  const missingLocally = [...remote].filter(uuid => !localUuids.has(uuid));
  for (const batch of chunksOf(missingLocally, EVENT_BATCH_LIMIT)) {
    for (const event of await api.batchGetEvents(batch)) {
      if (await appendEvent(event, { store })) pulled += 1;
    }
  }

  let pushed = 0;
  const missingRemotely = locals
    .filter(event => !remote.has(event.uuid) && !event.localOnly)
    // The localOnly flag is device-private state, not part of the event.
    .map(({ localOnly: _localOnly, ...event }) => event as DomainEvent);
  for (const batch of chunksOf(missingRemotely, EVENT_BATCH_LIMIT)) {
    const results = await api.batchPutEvents(batch);
    // 'exists' is also success (someone raced us there) — count real writes.
    pushed += results.filter(result => result.status === 'created').length;
  }

  return { pulled, pushed };
}

/** Run the event log + conversations; ApiClient satisfies this structurally.
 *  Runs RECORDS deliberately absent — run history is the event log now. */
export async function syncAll({ apiClient, store }: {
  apiClient: SyncV2ApiClient;
  store: RecordStore;
}): Promise<SyncAllSummary> {
  const events = await syncEvents({ api: apiClient, store });
  const conversations = await syncRecords({
    api: kindApiFrom(apiClient, 'conversations'), store, kind: 'conversations',
  });
  return { events, conversations };
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

/** The subscription surface installSyncOnAuth needs: 'auth.changed' on an
 *  emitter (the app bus by default; tests inject their own Emitter). */
export interface AuthEventSource {
  on(type: 'auth.changed', handler: () => void): () => void;
}

/**
 * Wire "sync when signed in" to the auth boundary: subscribes to the bus's
 * 'auth.changed' (emitted by ApiClient on every token change; main.ts calls
 * this once at startup) and runs syncAll — events AND conversations, one
 * coalesced pass — whenever the client is logged in —
 * which covers login. Sign-out fires the same event but is a no-op here. By
 * default it also syncs immediately when already logged in at install time
 * (a stored token fires no event on page load). Overlapping triggers are
 * coalesced: a sync already in flight is not doubled. Returns the uninstaller.
 */
export function installSyncOnAuth({
  events = bus, apiClient, store, immediate = true, onSynced, onError,
}: {
  /** The bus to listen on; defaults to the app-wide one. Tests inject theirs. */
  events?: AuthEventSource;
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

  const off = events.on('auth.changed', () => { void run(); });
  if (immediate) void run();
  return off;
}
