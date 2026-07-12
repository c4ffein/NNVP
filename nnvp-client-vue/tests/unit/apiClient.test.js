import {
  describe, it, expect, beforeEach, mock,
} from 'bun:test';
import ApiClient, {
  ApiError, ERROR_CODES, STORAGE_KEYS, DEFAULT_BASE_URL,
} from '../../src/lib/Backend/apiClient';

// Minimal in-memory Storage stand-in so tests never touch a real localStorage.
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    _map: map,
  };
}

// Build a fetch stub returning a single canned response, and record the call.
function makeFetch(response) {
  const calls = [];
  const fetchImpl = mock(async (url, options) => {
    calls.push({ url, options });
    if (response instanceof Error) throw response;
    return response;
  });
  fetchImpl.calls = calls;
  return fetchImpl;
}

// A Response-like object good enough for the client (text() + status + ok).
function jsonResponse(status, body) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => raw,
  };
}

function rawResponse(status, raw) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => raw,
  };
}

const LOGGED_IN = { [STORAGE_KEYS.token]: 'token-123' };

describe('ApiClient configuration', () => {
  it('talks to the same-origin /api base by default', () => {
    const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
    expect(api.getBaseUrl()).toBe(DEFAULT_BASE_URL);
    expect(api.isLoggedIn()).toBe(false);
  });

  it('accepts a base-url override (contract tests) and trims trailing slashes', () => {
    const api = new ApiClient({
      storage: makeStorage(),
      fetch: makeFetch(jsonResponse(200, {})),
      baseUrl: 'http://localhost:8123/api/',
    });
    expect(api.getBaseUrl()).toBe('http://localhost:8123/api');
  });

  it('setToken / clearToken persist to storage', () => {
    const storage = makeStorage();
    const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(200, {})) });
    api.setToken('abc');
    expect(storage.getItem(STORAGE_KEYS.token)).toBe('abc');
    expect(api.isLoggedIn()).toBe(true);
    api.clearToken();
    expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(api.isLoggedIn()).toBe(false);
  });
});

describe('ApiClient auth (magic link)', () => {
  it('requestMagicLink stores the pending bearer and returns the match code', async () => {
    const storage = makeStorage();
    const fetchImpl = makeFetch(jsonResponse(200, { token: 't-pending', code: '7K3Q' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });

    const data = await api.requestMagicLink('a@b.c');

    expect(data.code).toBe('7K3Q');
    expect(storage.getItem(STORAGE_KEYS.token)).toBe('t-pending');
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('/api/auth/magic/request');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.c' });
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('authStatus polls with the stored bearer', async () => {
    const storage = makeStorage(LOGGED_IN);
    const fetchImpl = makeFetch(jsonResponse(200, { verified: false, code: '7K3Q' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const data = await api.authStatus();
    expect(data.verified).toBe(false);
    expect(fetchImpl.calls[0].url).toBe('/api/auth/status');
    expect(fetchImpl.calls[0].options.headers.Authorization).toBe('Bearer token-123');
  });

  it('magicInfo sends its own bearer when present (same-browser detection)', async () => {
    const storage = makeStorage(LOGGED_IN);
    const fetchImpl = makeFetch(jsonResponse(200, {
      code: '7K3Q', requester: 'Firefox on Linux', requested_at: 't', same_browser: true,
    }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const info = await api.magicInfo('raw-link-token');
    expect(info.same_browser).toBe(true);
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('/api/auth/magic/info');
    expect(options.headers.Authorization).toBe('Bearer token-123');
    expect(JSON.parse(options.body)).toEqual({ token: 'raw-link-token' });
  });

  it('magicInfo works without a stored bearer (auth is optional)', async () => {
    const fetchImpl = makeFetch(jsonResponse(200, {
      code: '7K3Q', requester: 'Safari on iPhone', requested_at: 't', same_browser: false,
    }));
    const api = new ApiClient({ storage: makeStorage(), fetch: fetchImpl });
    const info = await api.magicInfo('raw-link-token');
    expect(info.same_browser).toBe(false);
    expect(fetchImpl.calls[0].options.headers.Authorization).toBeUndefined();
  });

  it('approveMagicLink never stores a token (approval is not a login here)', async () => {
    const storage = makeStorage();
    const fetchImpl = makeFetch(jsonResponse(200, { id: 1, email: 'a@b.c' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const user = await api.approveMagicLink('raw-link-token');
    expect(user.email).toBe('a@b.c');
    expect(fetchImpl.calls[0].url).toBe('/api/auth/magic/approve');
    expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  it('authed calls send the stored token as a Bearer header', async () => {
    const storage = makeStorage(LOGGED_IN);
    const meFetch = makeFetch(jsonResponse(200, { id: 2, email: 'x@y.z' }));
    const api = new ApiClient({ storage, fetch: meFetch });
    const me = await api.me();
    expect(me.email).toBe('x@y.z');
    expect(meFetch.calls[0].url).toBe('/api/auth/me');
    expect(meFetch.calls[0].options.headers.Authorization).toBe('Bearer token-123');
  });

  it('logout revokes server-side then clears the token', async () => {
    const storage = makeStorage(LOGGED_IN);
    const fetchImpl = makeFetch(rawResponse(204, ''));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    expect(api.isLoggedIn()).toBe(true);
    await api.logout();
    expect(api.isLoggedIn()).toBe(false);
    expect(fetchImpl.calls[0].url).toBe('/api/auth/logout');
    expect(fetchImpl.calls[0].options.headers.Authorization).toBe('Bearer token-123');
  });

  it('logout clears the token even when the server call fails', async () => {
    const storage = makeStorage(LOGGED_IN);
    const api = new ApiClient({ storage, fetch: makeFetch(new TypeError('down')) });
    await api.logout();
    expect(api.isLoggedIn()).toBe(false);
  });
});

describe('ApiClient projects CRUD', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(LOGGED_IN); });

  it('listProjects returns the array with a Bearer header', async () => {
    const fetchImpl = makeFetch(jsonResponse(200, [{ id: 1, name: 'P', updated_at: 't' }]));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const projects = await api.listProjects();
    expect(projects).toHaveLength(1);
    expect(fetchImpl.calls[0].url).toBe('/api/projects');
    expect(fetchImpl.calls[0].options.headers.Authorization).toBe('Bearer token-123');
  });

  it('createProject posts name + graph', async () => {
    const graph = { layers: [], edges: [], inputs: [], outputs: [] };
    const fetchImpl = makeFetch(jsonResponse(201, { id: 5, name: 'N', graph, updated_at: 't' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const created = await api.createProject({ name: 'N', graph });
    expect(created.id).toBe(5);
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('/api/projects');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ name: 'N', graph });
  });

  it('getProject fetches by id', async () => {
    const fetchImpl = makeFetch(jsonResponse(200, { id: 7, name: 'G', graph: {}, updated_at: 't' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const p = await api.getProject(7);
    expect(p.id).toBe(7);
    expect(fetchImpl.calls[0].url).toBe('/api/projects/7');
    expect(fetchImpl.calls[0].options.method).toBe('GET');
  });

  it('updateProject only sends provided fields', async () => {
    const fetchImpl = makeFetch(jsonResponse(200, { id: 7, name: 'R', updated_at: 't' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    await api.updateProject(7, { name: 'R' });
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('/api/projects/7');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ name: 'R' });
  });

  it('deleteProject handles a 204 No Content response', async () => {
    const fetchImpl = makeFetch(rawResponse(204, ''));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const result = await api.deleteProject(9);
    expect(result).toBeNull();
    expect(fetchImpl.calls[0].options.method).toBe('DELETE');
  });
});

describe('ApiClient error handling', () => {
  it('throws not-logged-in for authed calls without a token', async () => {
    const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
    await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.notLoggedIn });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces a 401 as an http error carrying the status and server message', async () => {
    const storage = makeStorage(LOGGED_IN);
    const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(401, { detail: 'Invalid token' })) });
    const err = await api.me().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(ERROR_CODES.http);
    expect(err.status).toBe(401);
    expect(err.message).toBe('Invalid token');
  });

  it('maps a thrown fetch (network failure) to a network error', async () => {
    const storage = makeStorage(LOGGED_IN);
    const api = new ApiClient({ storage, fetch: makeFetch(new TypeError('Failed to fetch')) });
    await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.network });
  });

  it('maps a malformed JSON body on a 200 to a malformed error', async () => {
    const storage = makeStorage(LOGGED_IN);
    const api = new ApiClient({ storage, fetch: makeFetch(rawResponse(200, '{not json')) });
    await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.malformed });
  });
});
