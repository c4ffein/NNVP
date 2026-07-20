/**
 * Backend API client (injected storage + fetch, no real network). Migrated
 * from tests/unit/apiClient.test.js into the dual registry as logicTest. The
 * bun:test `mock()` wrapper became a plain recording closure — the tests only
 * ever read the recorded calls.
 */
import { logicTest } from '../harness/define';
import ApiClient, {
  ApiError, ERROR_CODES, STORAGE_KEYS, DEFAULT_BASE_URL,
} from '../../src/lib/Backend/apiClient';
import type { StorageLike } from '../../src/lib/Backend/apiClient';

// Minimal in-memory Storage stand-in so tests never touch a real localStorage.
function makeStorage(initial: Record<string, string> = {}): StorageLike & { _map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    _map: map,
  };
}

// What the client actually passes to fetch (headers are a plain record, the
// body a JSON string) — typed so the tests can read the recorded calls.
interface RecordedOptions {
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

interface RecordedCall {
  url: RequestInfo | URL;
  options: RecordedOptions;
}

// A Response-like object good enough for the client (text() + status + ok).
interface FakeResponse {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}

// Build a fetch stub returning a single canned response, and record the call.
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
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => raw,
  };
}

function rawResponse(status: number, raw: string): FakeResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => raw,
  };
}

const LOGGED_IN = { [STORAGE_KEYS.token]: 'token-123' };

// --- ApiClient configuration -------------------------------------------------

logicTest('apiClient: talks to the same-origin /api base by default', ({ expect }) => {
  const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
  expect(api.getBaseUrl()).toBe(DEFAULT_BASE_URL);
  expect(api.isLoggedIn()).toBe(false);
});

logicTest('apiClient: accepts a base-url override (contract tests) and trims trailing slashes', ({ expect }) => {
  const api = new ApiClient({
    storage: makeStorage(),
    fetch: makeFetch(jsonResponse(200, {})),
    baseUrl: 'http://localhost:8123/api/',
  });
  expect(api.getBaseUrl()).toBe('http://localhost:8123/api');
});

logicTest('apiClient: setToken / clearToken persist to storage', ({ expect }) => {
  const storage = makeStorage();
  const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(200, {})) });
  api.setToken('abc');
  expect(storage.getItem(STORAGE_KEYS.token)).toBe('abc');
  expect(api.isLoggedIn()).toBe(true);
  api.clearToken();
  expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
  expect(api.isLoggedIn()).toBe(false);
});

// --- ApiClient auth (magic link) ----------------------------------------------

logicTest('apiClient: requestMagicLink stores the pending bearer and returns the match code', async ({ expect }) => {
  const storage = makeStorage();
  const fetchImpl = makeFetch(jsonResponse(200, { token: 't-pending', code: '7K3Q' }));
  const api = new ApiClient({ storage, fetch: fetchImpl });

  const data = await api.requestMagicLink('a@b.c');

  expect(data!.code).toBe('7K3Q');
  expect(storage.getItem(STORAGE_KEYS.token)).toBe('t-pending');
  const { url, options } = fetchImpl.calls[0]!;
  expect(url).toBe('/api/auth/magic/request');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body!)).toEqual({ email: 'a@b.c' });
  expect(options.headers['Content-Type']).toBe('application/json');
});

logicTest('apiClient: authStatus polls with the stored bearer', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(jsonResponse(200, { verified: false, code: '7K3Q' }));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const data = await api.authStatus() as { verified: boolean };
  expect(data.verified).toBe(false);
  expect(fetchImpl.calls[0]!.url).toBe('/api/auth/status');
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: magicInfo sends its own bearer when present (same-browser detection)', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(jsonResponse(200, {
    code: '7K3Q', requester: 'Firefox on Linux', requested_at: 't', same_browser: true,
  }));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const info = await api.magicInfo('raw-link-token') as { same_browser: boolean };
  expect(info.same_browser).toBe(true);
  const { url, options } = fetchImpl.calls[0]!;
  expect(url).toBe('/api/auth/magic/info');
  expect(options.headers.Authorization).toBe('Bearer token-123');
  expect(JSON.parse(options.body!)).toEqual({ token: 'raw-link-token' });
});

logicTest('apiClient: magicInfo works without a stored bearer (auth is optional)', async ({ expect }) => {
  const fetchImpl = makeFetch(jsonResponse(200, {
    code: '7K3Q', requester: 'Safari on iPhone', requested_at: 't', same_browser: false,
  }));
  const api = new ApiClient({ storage: makeStorage(), fetch: fetchImpl });
  const info = await api.magicInfo('raw-link-token') as { same_browser: boolean };
  expect(info.same_browser).toBe(false);
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBeUndefined();
});

logicTest('apiClient: approveMagicLink never stores a token (approval is not a login here)', async ({ expect }) => {
  const storage = makeStorage();
  const fetchImpl = makeFetch(jsonResponse(200, { id: 1, email: 'a@b.c' }));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const user = await api.approveMagicLink('raw-link-token') as { id: number; email: string };
  expect(user.email).toBe('a@b.c');
  expect(fetchImpl.calls[0]!.url).toBe('/api/auth/magic/approve');
  expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
});

logicTest('apiClient: authed calls send the stored token as a Bearer header', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const meFetch = makeFetch(jsonResponse(200, { id: 2, email: 'x@y.z' }));
  const api = new ApiClient({ storage, fetch: meFetch });
  const me = await api.me() as { id: number; email: string };
  expect(me.email).toBe('x@y.z');
  expect(meFetch.calls[0]!.url).toBe('/api/auth/me');
  expect(meFetch.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: logout revokes server-side then clears the token', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(rawResponse(204, ''));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  expect(api.isLoggedIn()).toBe(true);
  await api.logout();
  expect(api.isLoggedIn()).toBe(false);
  expect(fetchImpl.calls[0]!.url).toBe('/api/auth/logout');
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: logout clears the token even when the server call fails', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const api = new ApiClient({ storage, fetch: makeFetch(new TypeError('down')) });
  await api.logout();
  expect(api.isLoggedIn()).toBe(false);
});

// --- ApiClient projects CRUD ---------------------------------------------------

logicTest('apiClient: listProjects returns the array with a Bearer header', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(jsonResponse(200, [{ id: 1, name: 'P', updated_at: 't' }]));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const projects = await api.listProjects();
  expect(projects).toHaveLength(1);
  expect(fetchImpl.calls[0]!.url).toBe('/api/projects');
  expect(fetchImpl.calls[0]!.options.headers.Authorization).toBe('Bearer token-123');
});

logicTest('apiClient: createProject posts name + graph', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const graph = { layers: [], edges: [], inputs: [], outputs: [] };
  const fetchImpl = makeFetch(jsonResponse(201, { id: 5, name: 'N', graph, updated_at: 't' }));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const created = await api.createProject({ name: 'N', graph }) as { id: number };
  expect(created.id).toBe(5);
  const { url, options } = fetchImpl.calls[0]!;
  expect(url).toBe('/api/projects');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body!)).toEqual({ name: 'N', graph });
});

logicTest('apiClient: getProject fetches by id', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(jsonResponse(200, { id: 7, name: 'G', graph: {}, updated_at: 't' }));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const p = await api.getProject(7) as { id: number };
  expect(p.id).toBe(7);
  expect(fetchImpl.calls[0]!.url).toBe('/api/projects/7');
  expect(fetchImpl.calls[0]!.options.method).toBe('GET');
});

logicTest('apiClient: updateProject only sends provided fields', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(jsonResponse(200, { id: 7, name: 'R', updated_at: 't' }));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  await api.updateProject(7, { name: 'R' });
  const { url, options } = fetchImpl.calls[0]!;
  expect(url).toBe('/api/projects/7');
  expect(options.method).toBe('PUT');
  expect(JSON.parse(options.body!)).toEqual({ name: 'R' });
});

logicTest('apiClient: deleteProject handles a 204 No Content response', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const fetchImpl = makeFetch(rawResponse(204, ''));
  const api = new ApiClient({ storage, fetch: fetchImpl });
  const result = await api.deleteProject(9);
  expect(result).toBeNull();
  expect(fetchImpl.calls[0]!.options.method).toBe('DELETE');
});

// --- ApiClient error handling ---------------------------------------------------

logicTest('apiClient: throws not-logged-in for authed calls without a token', async ({ expect }) => {
  const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
  await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.notLoggedIn });
  await expect(api.me()).rejects.toBeInstanceOf(ApiError);
});

logicTest('apiClient: surfaces a 401 as an http error carrying the status and server message', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(401, { detail: 'Invalid token' })) });
  const err = await api.me().catch((e: unknown) => e) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(ERROR_CODES.http);
  expect(err.status).toBe(401);
  expect(err.message).toBe('Invalid token');
});

logicTest('apiClient: maps a thrown fetch (network failure) to a network error', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const api = new ApiClient({ storage, fetch: makeFetch(new TypeError('Failed to fetch')) });
  await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.network });
});

logicTest('apiClient: maps a malformed JSON body on a 200 to a malformed error', async ({ expect }) => {
  const storage = makeStorage(LOGGED_IN);
  const api = new ApiClient({ storage, fetch: makeFetch(rawResponse(200, '{not json')) });
  await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.malformed });
});
