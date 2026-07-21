/**
 * Local <-> cloud sync + the 3-way delete (PLAN.md Phase 6), all logicTests:
 * syncRecords/syncAll against a fake per-kind api + MemoryRecordStore,
 * deleteEverywhere's local/cloud/both matrix (incl. the localOnly flag that
 * blocks re-push), deleteChoicesFor, installSyncOnAuth over a fake event
 * target, and the new run/conversation ApiClient methods (same fetch-stub
 * approach as tests/suites/apiClient.ts).
 */
import { logicTest } from '../harness/define';
import ApiClient, { ApiError, ERROR_CODES, STORAGE_KEYS, AUTH_CHANGED_EVENT } from '../../src/lib/Backend/apiClient';
import type { StorageLike } from '../../src/lib/Backend/apiClient';
import {
  syncRecords, syncAll, deleteEverywhere, deleteChoicesFor, installSyncOnAuth, kindApiFrom,
} from '../../src/lib/Backend/sync';
import type { SyncableRecord, SyncAllSummary, KindApi } from '../../src/lib/Backend/sync';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import type { RecordStoreName } from '../../src/lib/LocalStore/recordStore';

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

/** The 8-method + isLoggedIn ApiClient stand-in installSyncOnAuth/syncAll take. */
function makeSyncApiClient({ runs = [], conversations = [], loggedIn = true }: {
  runs?: SyncableRecord[];
  conversations?: SyncableRecord[];
  loggedIn?: boolean;
} = {}) {
  const runsApi = makeKindApi(runs);
  const conversationsApi = makeKindApi(conversations);
  let logged = loggedIn;
  return {
    runsApi,
    conversationsApi,
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
  };
}

/** A window-ish event target with a synchronous dispatch, for the trigger tests. */
function makeEventTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      [...(listeners.get(type) ?? [])].forEach(listener => listener());
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
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

// --- syncAll + the auth trigger ----------------------------------------------------

logicTest('syncAll: reconciles runs and conversations in one call', async ({ expect }) => {
  const apiClient = makeSyncApiClient({
    runs: [run1],
    conversations: [{ uuid: 'c-1', updatedAt: 't1' } as SyncableRecord],
  });
  const store = new MemoryRecordStore();
  await store.put('runs', run2);

  const summary = await syncAll({ apiClient, store });

  expect(summary).toEqual({
    runs: { pulled: 1, pushed: 1, updated: 0 },
    conversations: { pulled: 1, pushed: 0, updated: 0 },
  });
  expect([...apiClient.runsApi.remote.keys()].sort()).toEqual(['r-1', 'r-2']);
  expect((await store.get('conversations', 'c-1'))).not.toBeNull();
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
  const apiClient = makeSyncApiClient({ runs: [run1], loggedIn: false });
  const store = new MemoryRecordStore();
  const target = makeEventTarget();
  let resolveSynced!: (result: SyncAllSummary) => void;
  const synced = new Promise<SyncAllSummary>((resolve) => { resolveSynced = resolve; });

  const uninstall = installSyncOnAuth({
    target, apiClient, store, immediate: false, onSynced: resolveSynced,
  });

  // Logged out: the event fires (e.g. sign-out) but nothing is synced.
  target.dispatch(AUTH_CHANGED_EVENT);
  expect(apiClient.runsApi.calls).toHaveLength(0);

  // Login: the same event now triggers a full sync.
  apiClient.setLoggedIn(true);
  target.dispatch(AUTH_CHANGED_EVENT);
  const summary = await synced;
  expect(summary.runs.pulled).toBe(1);
  expect(await store.get('runs', 'r-1')).not.toBeNull();

  uninstall();
  expect(target.count(AUTH_CHANGED_EVENT)).toBe(0);
});

logicTest('installSyncOnAuth: syncs immediately when a token is already present', async ({ expect }) => {
  const apiClient = makeSyncApiClient({ runs: [run1], loggedIn: true });
  const store = new MemoryRecordStore();
  const target = makeEventTarget();
  const synced = new Promise<SyncAllSummary>((resolve) => {
    installSyncOnAuth({ target, apiClient, store, onSynced: resolve });
  });

  const summary = await synced;
  expect(summary.runs.pulled).toBe(1);
});

logicTest('installSyncOnAuth: reports failures through onError instead of throwing', async ({ expect }) => {
  const apiClient = makeSyncApiClient({ loggedIn: true });
  apiClient.listRuns = async () => { throw new Error('backend down'); };
  const store = new MemoryRecordStore();
  const target = makeEventTarget();
  const failed = new Promise<unknown>((resolve) => {
    installSyncOnAuth({ target, apiClient, store, onError: resolve });
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
