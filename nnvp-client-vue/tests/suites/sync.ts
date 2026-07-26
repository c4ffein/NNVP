/**
 * Local <-> cloud sync + the 3-way delete (PLAN.md Phase 6 + Phase C v2),
 * all logicTests: syncRecords against a fake per-kind api +
 * MemoryRecordStore; syncEvents' uuid set-difference over the paginated
 * event endpoints (pull pages to exhaustion, batch pull/push, localOnly
 * never pushes, legacy runs explode first); syncAll = events +
 * conversations (runs RECORDS deliberately no longer sync);
 * deleteEverywhere's local/cloud/both matrix, deleteChoicesFor,
 * installSyncOnAuth over an injected Emitter, and the run/conversation/event
 * ApiClient methods (same fetch-stub approach as tests/suites/apiClient.ts).
 */
import { logicTest } from '../harness/define';
import ApiClient, { ApiError, ERROR_CODES, STORAGE_KEYS } from '../../src/lib/Backend/apiClient';
import type { StorageLike } from '../../src/lib/Backend/apiClient';
import { Emitter } from '../../src/lib/Events/emitter';
import type { AppEvents } from '../../src/lib/Events/registry';
import {
  syncRecords, syncEvents, syncAll, deleteEverywhere, deleteChoicesFor, installSyncOnAuth,
  kindApiFrom, EVENT_BATCH_LIMIT,
} from '../../src/lib/Backend/sync';
import type {
  SyncableRecord, SyncAllSummary, KindApi, EventsApi,
} from '../../src/lib/Backend/sync';
import { appendEvent, listAllEvents } from '../../src/lib/Events/store';
import type { EventMap } from '../../src/lib/Events/emitter';
import type { DomainEvent } from '../../src/lib/Events/domainEvent';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import type { RecordStoreName } from '../../src/lib/LocalStore/recordStore';
import type { RunRecord } from '../../src/lib/Training/runJournal';
import { deterministicUuid } from '../../src/lib/Training/runEvents';

// --- fakes ---------------------------------------------------------------------

interface FakeApiCall {
  method: 'list' | 'get' | 'put' | 'delete';
  uuid?: string;
  payload?: unknown;
}

interface FakeKindApi extends KindApi {
  remote: Map<string, SyncableRecord>;
  calls: FakeApiCall[];
  /** The recorded calls of one method, in order. */
  callsOf(method: FakeApiCall['method']): FakeApiCall[];
}

/** One kind's four endpoints over an in-memory map, recording every call. */
function makeKindApi(initial: SyncableRecord[] = []): FakeKindApi {
  const remote = new Map<string, SyncableRecord>(
    initial.map(record => [record.uuid, JSON.parse(JSON.stringify(record))]),
  );
  const calls: FakeApiCall[] = [];
  return {
    remote,
    calls,
    callsOf: method => calls.filter(call => call.method === method),
    list: async () => {
      calls.push({ method: 'list' });
      return [...remote.values()].map(record => ({ uuid: record.uuid }));
    },
    get: async (uuid: string) => {
      calls.push({ method: 'get', uuid });
      const record = remote.get(uuid);
      return record ? JSON.parse(JSON.stringify(record)) : null;
    },
    put: async (uuid: string, payload: unknown) => {
      calls.push({ method: 'put', uuid, payload });
      remote.set(uuid, JSON.parse(JSON.stringify(payload)) as SyncableRecord);
      return null;
    },
    delete: async (uuid: string) => {
      calls.push({ method: 'delete', uuid });
      remote.delete(uuid);
      return null;
    },
  };
}

/** A store pre-seeded with records under one kind. */
async function makeStore(kind: RecordStoreName, records: SyncableRecord[] = []) {
  const store = new MemoryRecordStore();
  for (const record of records) await store.put(kind, record);
  return store;
}

/** A client-shaped domain event; tests override what they assert on. */
function domainEvent(overrides: Partial<DomainEvent> & { uuid: string }): DomainEvent {
  return {
    type: 'run.epoch',
    streamId: 'run-1',
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: 1,
    dependsOn: [],
    wallTime: '2026-07-20T10:00:00.000Z',
    payload: { epoch: 0 },
    ...overrides,
  };
}

interface FakeEventsApi extends EventsApi {
  remote: Map<string, DomainEvent>;
  calls: { method: string; size?: number; cursor?: number; streamId?: string }[];
}

/** The three event endpoints over an in-memory map. `pageSize` deliberately
 *  defaults tiny so uuid pagination is exercised by every multi-event test. */
function makeEventsApi(initial: DomainEvent[] = [], pageSize = 2): FakeEventsApi {
  const remote = new Map<string, DomainEvent>(
    initial.map(event => [event.uuid, JSON.parse(JSON.stringify(event))]),
  );
  const calls: FakeEventsApi['calls'] = [];
  return {
    remote,
    calls,
    listEventUuids: async ({ cursor = 0, streamId } = {}) => {
      calls.push({ method: 'listEventUuids', cursor, streamId });
      const all = [...remote.values()]
        .filter(event => streamId === undefined || event.streamId === streamId)
        .map(event => event.uuid);
      const page = all.slice(cursor, cursor + pageSize);
      return {
        uuids: page,
        nextCursor: cursor + pageSize < all.length ? cursor + pageSize : null,
      };
    },
    batchGetEvents: async (uuids) => {
      calls.push({ method: 'batchGetEvents', size: uuids.length });
      return uuids
        .map(uuid => remote.get(uuid))
        .filter((event): event is DomainEvent => !!event)
        .map(event => JSON.parse(JSON.stringify(event)) as DomainEvent);
    },
    batchPutEvents: async (events) => {
      calls.push({ method: 'batchPutEvents', size: events.length });
      return events.map((event) => {
        if (remote.has(event.uuid)) return { uuid: event.uuid, status: 'exists' };
        remote.set(event.uuid, JSON.parse(JSON.stringify(event)));
        return { uuid: event.uuid, status: 'created' };
      });
    },
  };
}

/** The conversations+events+isLoggedIn stand-in installSyncOnAuth/syncAll take. */
function makeSyncApiClient({
  runs = [], conversations = [], events = [], loggedIn = true,
}: {
  runs?: SyncableRecord[];
  conversations?: SyncableRecord[];
  events?: DomainEvent[];
  loggedIn?: boolean;
} = {}) {
  const runsApi = makeKindApi(runs);
  const conversationsApi = makeKindApi(conversations);
  const eventsApi = makeEventsApi(events);
  let logged = loggedIn;
  return {
    runsApi,
    conversationsApi,
    eventsApi,
    setLoggedIn(value: boolean) { logged = value; },
    isLoggedIn: () => logged,
    listRuns: runsApi.list,
    getRun: runsApi.get,
    putRun: runsApi.put,
    deleteRun: runsApi.delete,
    listConversations: conversationsApi.list,
    getConversation: conversationsApi.get,
    putConversation: conversationsApi.put,
    deleteConversation: conversationsApi.delete,
    listEventUuids: eventsApi.listEventUuids,
    batchGetEvents: eventsApi.batchGetEvents,
    batchPutEvents: eventsApi.batchPutEvents,
  };
}

/** A private bus for the trigger tests — installSyncOnAuth's injectable seam. */
function makeEvents() {
  return new Emitter<AppEvents>();
}

const run1: SyncableRecord = { uuid: 'r-1', outcome: 'completed' } as SyncableRecord;
const run2: SyncableRecord = { uuid: 'r-2', outcome: 'error' } as SyncableRecord;
const run3: SyncableRecord = { uuid: 'r-3', outcome: 'cancelled' } as SyncableRecord;

// --- syncRecords: set difference, both directions --------------------------------

logicTest('sync: pulls every server record the client lacks', async ({ expect }) => {
  const api = makeKindApi([run1, run2]);
  const store = await makeStore('runs');

  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 2, pushed: 0, updated: 0 });
  const local = await store.list<SyncableRecord>('runs');
  expect(local.map(record => record.uuid).sort()).toEqual(['r-1', 'r-2']);
  // Pulls fetch the FULL payload, not the projection.
  expect((await store.get<SyncableRecord & { outcome: string }>('runs', 'r-2'))!.outcome).toBe('error');
  expect(api.callsOf('put')).toHaveLength(0);
});

logicTest('sync: pushes every local record the server lacks', async ({ expect }) => {
  const api = makeKindApi();
  const store = await makeStore('runs', [run1, run2]);

  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 0, pushed: 2, updated: 0 });
  expect([...api.remote.keys()].sort()).toEqual(['r-1', 'r-2']);
  expect(api.remote.get('r-1')).toEqual(run1);
  expect(api.callsOf('get')).toHaveLength(0);
});

logicTest('sync: both directions at once — pure uuid set difference', async ({ expect }) => {
  const api = makeKindApi([run1, run2]); // server-only: r-2 (r-1 shared)
  const store = await makeStore('runs', [run1, run3]); // local-only: r-3

  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 1, pushed: 1, updated: 0 });
  expect([...api.remote.keys()].sort()).toEqual(['r-1', 'r-2', 'r-3']);
  const local = await store.list<SyncableRecord>('runs');
  expect(local.map(record => record.uuid).sort()).toEqual(['r-1', 'r-2', 'r-3']);
});

logicTest('sync: localOnly records are never pushed', async ({ expect }) => {
  const api = makeKindApi();
  const store = await makeStore('runs', [run1, { ...run2, localOnly: true }]);

  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 0, pushed: 1, updated: 0 });
  expect([...api.remote.keys()]).toEqual(['r-1']);
  // The flagged record still lives locally, untouched.
  expect((await store.get<SyncableRecord>('runs', 'r-2'))!.localOnly).toBe(true);
});

logicTest('sync: in-flight runs are never pushed — a running snapshot would freeze stale in the cloud', async ({ expect }) => {
  const inFlight: SyncableRecord = { uuid: 'r-live', outcome: 'running' } as SyncableRecord;
  const api = makeKindApi();
  const store = await makeStore('runs', [run1, inFlight]);

  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 0, pushed: 1, updated: 0 });
  expect([...api.remote.keys()]).toEqual(['r-1']);
  // The live run stays local; it becomes pushable once finish() stamps a terminal outcome.
  expect((await store.get<SyncableRecord>('runs', 'r-live'))).toBeTruthy();
});

logicTest('sync: runs on both sides are immutable — nothing fetched, nothing pushed', async ({ expect }) => {
  const api = makeKindApi([run1]);
  const store = await makeStore('runs', [run1]);

  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 0, pushed: 0, updated: 0 });
  expect(api.callsOf('get')).toHaveLength(0);
  expect(api.callsOf('put')).toHaveLength(0);
});

// --- syncRecords: conversation updatedAt conflicts --------------------------------

logicTest('sync: a newer remote conversation overwrites the local copy', async ({ expect }) => {
  const remote = { uuid: 'c-1', updatedAt: '2026-07-20T12:00:00Z', title: 'newer' };
  const api = makeKindApi([remote]);
  const store = await makeStore('conversations', [
    { uuid: 'c-1', updatedAt: '2026-07-19T12:00:00Z', title: 'older' } as SyncableRecord,
  ]);

  const summary = await syncRecords({ api, store, kind: 'conversations' });

  expect(summary).toEqual({ pulled: 0, pushed: 0, updated: 1 });
  const local = await store.get<SyncableRecord & { title: string }>('conversations', 'c-1');
  expect(local!.title).toBe('newer');
  expect(api.callsOf('put')).toHaveLength(0);
});

logicTest('sync: a newer local conversation is pushed over the remote copy', async ({ expect }) => {
  const api = makeKindApi([{ uuid: 'c-1', updatedAt: '2026-07-19T12:00:00Z', title: 'older' } as SyncableRecord]);
  const newerLocal = { uuid: 'c-1', updatedAt: '2026-07-20T12:00:00Z', title: 'newer' } as SyncableRecord;
  const store = await makeStore('conversations', [newerLocal]);

  const summary = await syncRecords({ api, store, kind: 'conversations' });

  expect(summary).toEqual({ pulled: 0, pushed: 0, updated: 1 });
  expect(api.remote.get('c-1')).toEqual(newerLocal);
  // The local copy stays as it was — it won.
  const local = await store.get<SyncableRecord & { title: string }>('conversations', 'c-1');
  expect(local!.title).toBe('newer');
});

logicTest('sync: identical conversation timestamps mean no transfer either way', async ({ expect }) => {
  const record = { uuid: 'c-1', updatedAt: '2026-07-20T12:00:00Z', title: 'same' } as SyncableRecord;
  const api = makeKindApi([record]);
  const store = await makeStore('conversations', [record]);

  const summary = await syncRecords({ api, store, kind: 'conversations' });

  expect(summary).toEqual({ pulled: 0, pushed: 0, updated: 0 });
  expect(api.callsOf('put')).toHaveLength(0);
});

// --- deleteEverywhere: the 3-way matrix -------------------------------------------

logicTest('delete local: the local copy goes, the cloud backup survives untouched', async ({ expect }) => {
  const api = makeKindApi([run1]);
  const store = await makeStore('runs', [run1]);

  await deleteEverywhere({ api, store, kind: 'runs', uuid: 'r-1', where: 'local' });

  expect(await store.get('runs', 'r-1')).toBeNull();
  expect(api.remote.has('r-1')).toBe(true);
  expect(api.callsOf('delete')).toHaveLength(0);
});

logicTest('delete cloud: the server copy goes and the survivor is flagged localOnly', async ({ expect }) => {
  const api = makeKindApi([run1]);
  const store = await makeStore('runs', [run1]);

  await deleteEverywhere({ api, store, kind: 'runs', uuid: 'r-1', where: 'cloud' });

  expect(api.remote.has('r-1')).toBe(false);
  expect(api.callsOf('delete')).toEqual([{ method: 'delete', uuid: 'r-1' }]);
  const survivor = await store.get<SyncableRecord>('runs', 'r-1');
  expect(survivor).not.toBeNull();
  expect(survivor!.localOnly).toBe(true);
});

logicTest('delete cloud then sync: the localOnly flag blocks the re-push', async ({ expect }) => {
  const api = makeKindApi([run1]);
  const store = await makeStore('runs', [run1]);

  await deleteEverywhere({ api, store, kind: 'runs', uuid: 'r-1', where: 'cloud' });
  const summary = await syncRecords({ api, store, kind: 'runs' });

  expect(summary).toEqual({ pulled: 0, pushed: 0, updated: 0 });
  expect(api.remote.has('r-1')).toBe(false); // stayed deleted
});

logicTest('delete both: no copy survives anywhere', async ({ expect }) => {
  const api = makeKindApi([run1]);
  const store = await makeStore('runs', [run1]);

  await deleteEverywhere({ api, store, kind: 'runs', uuid: 'r-1', where: 'both' });

  expect(api.remote.has('r-1')).toBe(false);
  expect(await store.get('runs', 'r-1')).toBeNull();
});

logicTest('deleteChoicesFor: offers exactly the locations that hold the record', ({ expect }) => {
  const cloudUuids = new Set(['r-1']);
  expect(deleteChoicesFor({ uuid: 'r-1' }, cloudUuids)).toEqual(['local', 'cloud', 'both']);
  expect(deleteChoicesFor({ uuid: 'r-9' }, cloudUuids)).toEqual(['local']);
  expect(deleteChoicesFor({ uuid: 'r-1' }, new Set())).toEqual(['local']);
});

// --- syncEvents: uuid set-difference over the paginated event endpoints -----------

logicTest('syncEvents: pulls every remote event across ALL uuid pages', async ({ expect }) => {
  // 5 remote events over a page size of 2 — three pages, cursor followed to
  // the null-cursor end. Missing a page would silently lose history.
  const remoteEvents = [1, 2, 3, 4, 5].map(n => domainEvent({
    uuid: `e-${n}`, seq: n, payload: { epoch: n },
  }));
  const api = makeEventsApi(remoteEvents);
  const store = new MemoryRecordStore();

  const summary = await syncEvents({ api, store });

  expect(summary).toEqual({ pulled: 5, pushed: 0 });
  expect((await listAllEvents(store)).map(event => event.uuid).sort())
    .toEqual(['e-1', 'e-2', 'e-3', 'e-4', 'e-5']);
  expect(api.calls.filter(call => call.method === 'listEventUuids').length).toBe(3);
});

logicTest('syncEvents: pulled events land through the store — persisted AND emitted', async ({ expect }) => {
  const api = makeEventsApi([domainEvent({ uuid: 'e-remote' })]);
  const store = new MemoryRecordStore();
  // The app bus is a singleton; the store-level suite covers injected
  // emitters — here we assert the pull went through appendEvent by its
  // dedupe contract: a second sync pulls nothing.
  await syncEvents({ api, store });
  const again = await syncEvents({ api, store });
  expect(again).toEqual({ pulled: 0, pushed: 0 });
  expect(await listAllEvents(store)).toHaveLength(1);
});

logicTest('syncEvents: pushes local events the server lacks — pure set difference', async ({ expect }) => {
  const shared = domainEvent({ uuid: 'e-shared' });
  const localOnly1 = domainEvent({ uuid: 'e-local-1', seq: 2 });
  const remoteOnly = domainEvent({ uuid: 'e-remote-1', seq: 3 });
  const api = makeEventsApi([shared, remoteOnly]);
  const store = new MemoryRecordStore();
  const quiet = new Emitter<EventMap>();
  await appendEvent(shared, { store, events: quiet });
  await appendEvent(localOnly1, { store, events: quiet });

  const summary = await syncEvents({ api, store });

  expect(summary).toEqual({ pulled: 1, pushed: 1 });
  expect([...api.remote.keys()].sort()).toEqual(['e-local-1', 'e-remote-1', 'e-shared']);
  expect((await listAllEvents(store)).map(event => event.uuid).sort())
    .toEqual(['e-local-1', 'e-remote-1', 'e-shared']);
});

logicTest('syncEvents: re-push is idempotent-safe — "exists" answers count as nothing new', async ({ expect }) => {
  // The server already holds e-1 but its uuid listing is fresh-eventual (a
  // racing device pushed it between our list and our put): the per-item
  // 'exists' status must be treated as success, not an error or a re-write.
  const event = domainEvent({ uuid: 'e-1' });
  const api = makeEventsApi([]);
  api.remote.set('e-1', event); // present remotely…
  api.listEventUuids = async () => ({ uuids: [], nextCursor: null }); // …but not listed
  const store = new MemoryRecordStore();
  await appendEvent(event, { store, events: new Emitter<EventMap>() });

  const summary = await syncEvents({ api, store });

  expect(summary).toEqual({ pulled: 0, pushed: 0 }); // 'exists' ≠ created
  expect(api.remote.size).toBe(1);
});

logicTest('syncEvents: localOnly events never push, and the flag never travels', async ({ expect }) => {
  const api = makeEventsApi([]);
  const store = new MemoryRecordStore();
  const quiet = new Emitter<EventMap>();
  await appendEvent(domainEvent({ uuid: 'e-push' }), { store, events: quiet });
  await appendEvent(domainEvent({ uuid: 'e-private', seq: 2 }), {
    store, events: quiet, localOnly: true,
  });

  const summary = await syncEvents({ api, store });

  expect(summary).toEqual({ pulled: 0, pushed: 1 });
  expect([...api.remote.keys()]).toEqual(['e-push']);
  // What went up carries no localOnly key — device-private state stays home.
  expect(Object.prototype.hasOwnProperty.call(api.remote.get('e-push'), 'localOnly')).toBe(false);
});

logicTest('syncEvents: batches respect the 500-event server cap', async ({ expect }) => {
  const api = makeEventsApi([], 2000); // one uuid page — batching is what we watch
  const store = new MemoryRecordStore();
  const quiet = new Emitter<EventMap>();
  for (let n = 0; n < EVENT_BATCH_LIMIT + 1; n += 1) {
    await appendEvent(domainEvent({ uuid: `e-${String(n).padStart(4, '0')}`, seq: n + 1 }), {
      store, events: quiet,
    });
  }

  const summary = await syncEvents({ api, store });

  expect(summary.pushed).toBe(EVENT_BATCH_LIMIT + 1);
  const puts = api.calls.filter(call => call.method === 'batchPutEvents');
  expect(puts.map(call => call.size)).toEqual([EVENT_BATCH_LIMIT, 1]);
});

logicTest('syncEvents: legacy RunRecords explode before the diff, so old runs reach the cloud', async ({ expect }) => {
  const record: RunRecord = {
    uuid: 'run-legacy-sync',
    startedAt: '2026-07-01T08:00:00.000Z',
    finishedAt: '2026-07-01T08:05:00.000Z',
    outcome: 'completed',
    engineId: 'tfjs',
    config: {
      dataset: 'MNIST', optimizer: 'rmsprop', optimizerParams: {}, epochs: 1,
      loss: 'categoricalCrossentropy',
    },
    graphJson: '{"layers":[]}',
    epochMetrics: [{ epoch: 0, acc: 0.5 }],
  };
  const api = makeEventsApi([]);
  const store = new MemoryRecordStore();
  await store.put('runs', record);

  const summary = await syncEvents({ api, store });

  expect(summary.pushed).toBe(3); // started + 1 epoch + finished
  expect(api.remote.has(await deterministicUuid('run-legacy-sync:started'))).toBe(true);
  // The legacy record itself did NOT sync — runs records are out of sync now.
  expect([...api.remote.values()].every(event => typeof event.type === 'string')).toBe(true);
});

// --- syncAll + the auth trigger ----------------------------------------------------

logicTest('syncAll: reconciles events and conversations — runs RECORDS no longer sync', async ({ expect }) => {
  // A local legacy run record: it must reach the cloud as EVENTS (via the
  // explosion), never through the record endpoints.
  const localRun: RunRecord = {
    uuid: 'r-local',
    startedAt: '2026-07-01T08:00:00.000Z',
    outcome: 'completed',
    engineId: 'tfjs',
    config: {
      dataset: 'MNIST', optimizer: 'rmsprop', optimizerParams: {}, epochs: 1,
      loss: 'categoricalCrossentropy',
    },
    graphJson: '{"layers":[]}',
    epochMetrics: [],
  };
  const apiClient = makeSyncApiClient({
    runs: [run1], // the server may still hold old run records: they stay there
    events: [domainEvent({ uuid: 'e-remote' })],
    conversations: [{ uuid: 'c-1', updatedAt: 't1' } as SyncableRecord],
  });
  const store = new MemoryRecordStore();
  await store.put('runs', localRun);

  const summary = await syncAll({ apiClient, store });

  expect(summary).toEqual({
    events: { pulled: 1, pushed: 2 }, // r-local exploded: started + finished
    conversations: { pulled: 1, pushed: 0, updated: 0 },
  });
  expect((await store.get('conversations', 'c-1'))).not.toBeNull();
  expect((await listAllEvents(store)).some(event => event.uuid === 'e-remote')).toBe(true);
  // The record endpoints for runs were never touched, either direction.
  expect(apiClient.runsApi.calls).toHaveLength(0);
  expect(await store.get('runs', 'r-1')).toBeNull(); // nothing pulled
  expect(apiClient.runsApi.remote.has('r-local')).toBe(false); // nothing pushed
  // What DID reach the cloud for r-local are its two synthetic events.
  expect(apiClient.eventsApi.remote.has(await deterministicUuid('r-local:started'))).toBe(true);
  expect(apiClient.eventsApi.remote.has(await deterministicUuid('r-local:finished'))).toBe(true);
});

logicTest('kindApiFrom: routes each kind to its own endpoint quartet', async ({ expect }) => {
  const apiClient = makeSyncApiClient({ runs: [run1], conversations: [] });
  const runsView = kindApiFrom(apiClient, 'runs');
  const conversationsView = kindApiFrom(apiClient, 'conversations');

  await runsView.list();
  await conversationsView.list();

  expect(apiClient.runsApi.callsOf('list')).toHaveLength(1);
  expect(apiClient.conversationsApi.callsOf('list')).toHaveLength(1);
});

logicTest('installSyncOnAuth: syncs on auth-change when logged in, not when logged out', async ({ expect }) => {
  const apiClient = makeSyncApiClient({
    events: [domainEvent({ uuid: 'e-cloud' })], loggedIn: false,
  });
  const store = new MemoryRecordStore();
  const events = makeEvents();
  let resolveSynced!: (result: SyncAllSummary) => void;
  const synced = new Promise<SyncAllSummary>((resolve) => { resolveSynced = resolve; });

  const uninstall = installSyncOnAuth({
    events, apiClient, store, immediate: false, onSynced: resolveSynced,
  });

  // Logged out: the event fires (e.g. sign-out) but nothing is synced.
  events.emit('auth.changed');
  expect(apiClient.eventsApi.calls).toHaveLength(0);
  expect(apiClient.conversationsApi.calls).toHaveLength(0);

  // Login: the same event now triggers a full sync — events included.
  apiClient.setLoggedIn(true);
  events.emit('auth.changed');
  const summary = await synced;
  expect(summary.events.pulled).toBe(1);
  expect((await listAllEvents(store)).map(event => event.uuid)).toEqual(['e-cloud']);

  uninstall();
  expect(events.listenerCount('auth.changed')).toBe(0);
});

logicTest('installSyncOnAuth: syncs immediately when a token is already present', async ({ expect }) => {
  const apiClient = makeSyncApiClient({
    events: [domainEvent({ uuid: 'e-cloud' })], loggedIn: true,
  });
  const store = new MemoryRecordStore();
  const events = makeEvents();
  const synced = new Promise<SyncAllSummary>((resolve) => {
    installSyncOnAuth({ events, apiClient, store, onSynced: resolve });
  });

  const summary = await synced;
  expect(summary.events.pulled).toBe(1);
});

logicTest('installSyncOnAuth: reports failures through onError instead of throwing', async ({ expect }) => {
  const apiClient = makeSyncApiClient({ loggedIn: true });
  apiClient.listEventUuids = async () => { throw new Error('backend down'); };
  const store = new MemoryRecordStore();
  const events = makeEvents();
  const failed = new Promise<unknown>((resolve) => {
    installSyncOnAuth({ events, apiClient, store, onError: resolve });
  });

  const error = await failed;
  expect((error as Error).message).toBe('backend down');
});

// --- ApiClient run/conversation methods (fetch-stub, as in suites/apiClient.ts) ----

function makeStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

interface RecordedOptions {
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

interface RecordedCall {
  url: RequestInfo | URL;
  options: RecordedOptions;
}

interface FakeResponse {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}

function makeFetch(response: FakeResponse | Error): typeof fetch & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    calls.push({ url, options: options as unknown as RecordedOptions });
    if (response instanceof Error) throw response;
    return response as unknown as Response;
  };
  return Object.assign(fetchImpl, { calls });
}

function jsonResponse(status: number, body?: unknown): FakeResponse {
  const raw = body === undefined ? '' : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => raw };
}

const SYNC_LOGGED_IN = { [STORAGE_KEYS.token]: 'token-123' };

logicTest('apiClient: listRuns hits /runs with a Bearer header', async ({ expect }) => {
  const fetchImpl = makeFetch(jsonResponse(200, [{ uuid: 'r-1' }]));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });
  const listed = await api.listRuns();
  expect(listed).toHaveLength(1);
  expect(fetchImpl.calls[0]!.url).toBe('/api/runs');
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: getRun unwraps the server RecordOut envelope', async ({ expect }) => {
  // The server answers { uuid, created_at, updated_at, payload } — consumers
  // must receive the payload itself, uuid re-stamped from the envelope.
  const fetchImpl = makeFetch(jsonResponse(200, {
    uuid: 'r-1', created_at: 't0', updated_at: 't1', payload: { uuid: 'r-1', outcome: 'completed' },
  }));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });
  const record = await api.getRun('r-1') as { uuid: string; outcome: string; created_at?: unknown };
  expect(record.outcome).toBe('completed');
  expect(record.uuid).toBe('r-1');
  expect(record.created_at).toBeUndefined();
  expect(fetchImpl.calls[0]!.url).toBe('/api/runs/r-1');
  expect(fetchImpl.calls[0]!.options.method).toBe('GET');
});

logicTest('apiClient: putRun wraps the record in the { payload } envelope', async ({ expect }) => {
  const fetchImpl = makeFetch(jsonResponse(200, { uuid: 'r-1' }));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });
  const payload = { uuid: 'r-1', outcome: 'completed' };
  await api.putRun('r-1', payload);
  const { url, options } = fetchImpl.calls[0]!;
  expect(url).toBe('/api/runs/r-1');
  expect(options.method).toBe('PUT');
  expect(JSON.parse(options.body!)).toEqual({ payload });
  expect(options.headers['Content-Type']).toBe('application/json');
  expect(options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: deleteRun handles the 204 No Content response', async ({ expect }) => {
  const fetchImpl = makeFetch({ status: 204, ok: true, text: async () => '' });
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });
  const result = await api.deleteRun('r-9');
  expect(result).toBeNull();
  expect(fetchImpl.calls[0]!.url).toBe('/api/runs/r-9');
  expect(fetchImpl.calls[0]!.options.method).toBe('DELETE');
});

logicTest('apiClient: conversation methods mirror the run quartet on /conversations', async ({ expect }) => {
  const listFetch = makeFetch(jsonResponse(200, [{ uuid: 'c-1' }]));
  await new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: listFetch }).listConversations();
  expect(listFetch.calls[0]!.url).toBe('/api/conversations');
  expect(listFetch.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');

  const getFetch = makeFetch(jsonResponse(200, {
    uuid: 'c-1', payload: { uuid: 'c-1', title: 'hi' },
  }));
  const conversation = await new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: getFetch })
    .getConversation('c-1') as { title: string };
  expect(conversation.title).toBe('hi');
  expect(getFetch.calls[0]!.url).toBe('/api/conversations/c-1');

  const putFetch = makeFetch(jsonResponse(200, { uuid: 'c-1' }));
  const payload = { uuid: 'c-1', updatedAt: 't', messages: [] };
  await new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: putFetch }).putConversation('c-1', payload);
  expect(putFetch.calls[0]!.url).toBe('/api/conversations/c-1');
  expect(putFetch.calls[0]!.options.method).toBe('PUT');
  expect(JSON.parse(putFetch.calls[0]!.options.body!)).toEqual({ payload });

  const deleteFetch = makeFetch({ status: 204, ok: true, text: async () => '' });
  const deleted = await new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: deleteFetch }).deleteConversation('c-1');
  expect(deleted).toBeNull();
  expect(deleteFetch.calls[0]!.url).toBe('/api/conversations/c-1');
  expect(deleteFetch.calls[0]!.options.method).toBe('DELETE');
});

logicTest('apiClient: run/conversation calls demand a token like the project ones', async ({ expect }) => {
  const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, [])) });
  await expect(api.listRuns()).rejects.toMatchObject({ code: ERROR_CODES.notLoggedIn });
  await expect(api.putConversation('c-1', { uuid: 'c-1' })).rejects.toBeInstanceOf(ApiError);
});

// --- ApiClient event endpoints: the camelCase <-> snake_case sync boundary ---------

logicTest('apiClient: listEventUuids builds the query and maps next_cursor', async ({ expect }) => {
  const fetchImpl = makeFetch(jsonResponse(200, { uuids: ['e-1', 'e-2'], next_cursor: 42 }));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });

  const page = await api.listEventUuids({ cursor: 7, limit: 2, streamId: 'run-1' });

  expect(page).toEqual({ uuids: ['e-1', 'e-2'], nextCursor: 42 });
  expect(fetchImpl.calls[0]!.url).toBe('/api/events/uuids?cursor=7&limit=2&stream_id=run-1');
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');

  // No params: bare path; null next_cursor maps to a null nextCursor.
  const lastFetch = makeFetch(jsonResponse(200, { uuids: [], next_cursor: null }));
  const lastPage = await new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: lastFetch })
    .listEventUuids();
  expect(lastPage).toEqual({ uuids: [], nextCursor: null });
  expect(lastFetch.calls[0]!.url).toBe('/api/events/uuids');
});

logicTest('apiClient: batchGetEvents maps wire envelopes to client DomainEvents', async ({ expect }) => {
  const wire = {
    uuid: 'e-1',
    event_type: 'run.epoch',
    stream_id: 'run-1',
    device_id: 'device-a',
    instance_id: 'instance-1',
    seq: 3,
    depends_on: ['e-0'],
    wall_time: '2026-07-20T10:00:00.000Z',
    payload: { epoch: 0, acc: 0.5 },
    created_at: '2026-07-21T00:00:00.000Z', // server detail: must not leak
  };
  const fetchImpl = makeFetch(jsonResponse(200, { events: [wire] }));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });

  const events = await api.batchGetEvents(['e-1', 'e-unknown']);

  expect(events).toEqual([{
    uuid: 'e-1',
    type: 'run.epoch',
    streamId: 'run-1',
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: 3,
    dependsOn: ['e-0'],
    wallTime: '2026-07-20T10:00:00.000Z',
    payload: { epoch: 0, acc: 0.5 },
  }]);
  expect(fetchImpl.calls[0]!.url).toBe('/api/events/batch-get');
  expect(fetchImpl.calls[0]!.options.method).toBe('POST');
  expect(JSON.parse(fetchImpl.calls[0]!.options.body!)).toEqual({ uuids: ['e-1', 'e-unknown'] });
});

logicTest('apiClient: batchPutEvents sends snake_case envelopes and returns the results', async ({ expect }) => {
  const fetchImpl = makeFetch(jsonResponse(200, {
    results: [{ uuid: 'e-1', status: 'created', error: null }],
  }));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });

  const results = await api.batchPutEvents([domainEvent({ uuid: 'e-1', dependsOn: ['e-0'] })]);

  expect(results).toEqual([{ uuid: 'e-1', status: 'created', error: null }]);
  const body = JSON.parse(fetchImpl.calls[0]!.options.body!) as { events: unknown[] };
  expect(body.events).toEqual([{
    uuid: 'e-1',
    event_type: 'run.epoch',
    stream_id: 'run-1',
    device_id: 'device-a',
    instance_id: 'instance-1',
    seq: 1,
    depends_on: ['e-0'],
    wall_time: '2026-07-20T10:00:00.000Z',
    payload: { epoch: 0 },
  }]);
  expect(fetchImpl.calls[0]!.url).toBe('/api/events/batch-put');
});

logicTest('apiClient: purgeEventStream DELETEs by stream and returns the count', async ({ expect }) => {
  const fetchImpl = makeFetch(jsonResponse(200, { deleted: 4 }));
  const api = new ApiClient({ storage: makeStorage(SYNC_LOGGED_IN), fetch: fetchImpl });
  expect(await api.purgeEventStream('run-1')).toBe(4);
  expect(fetchImpl.calls[0]!.url).toBe('/api/events/by-stream/run-1');
  expect(fetchImpl.calls[0]!.options.method).toBe('DELETE');
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: event endpoints demand a token like every synced surface', async ({ expect }) => {
  const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
  await expect(api.listEventUuids()).rejects.toMatchObject({ code: ERROR_CODES.notLoggedIn });
  await expect(api.batchPutEvents([])).rejects.toBeInstanceOf(ApiError);
});

logicTest('apiClient: run endpoints map HTTP and network failures like the rest', async ({ expect }) => {
  const httpApi = new ApiClient({
    storage: makeStorage(SYNC_LOGGED_IN),
    fetch: makeFetch(jsonResponse(404, { detail: 'Not found' })),
  });
  const err = await httpApi.getRun('r-404').catch((e: unknown) => e) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(ERROR_CODES.http);
  expect(err.status).toBe(404);
  expect(err.message).toBe('Not found');

  const downApi = new ApiClient({
    storage: makeStorage(SYNC_LOGGED_IN),
    fetch: makeFetch(new TypeError('Failed to fetch')),
  });
  await expect(downApi.listConversations()).rejects.toMatchObject({ code: ERROR_CODES.network });
});
