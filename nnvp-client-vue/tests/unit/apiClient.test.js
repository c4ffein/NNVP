import {
  describe, it, expect, beforeEach, mock,
} from 'bun:test';
import ApiClient, { ApiError, ERROR_CODES, STORAGE_KEYS } from '../../src/lib/Backend/apiClient';

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

const CONFIGURED = { [STORAGE_KEYS.url]: 'http://localhost:8009' };
const LOGGED_IN = { [STORAGE_KEYS.url]: 'http://localhost:8009', [STORAGE_KEYS.token]: 'jwt-123' };

describe('ApiClient configuration', () => {
  it('reports not-configured with no backend url', () => {
    const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
    expect(api.isConfigured()).toBe(false);
    expect(api.isLoggedIn()).toBe(false);
    expect(api.getBaseUrl()).toBe('');
  });

  it('trims a trailing slash from the base url', () => {
    const storage = makeStorage({ [STORAGE_KEYS.url]: 'http://localhost:8009/' });
    const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(200, {})) });
    expect(api.getBaseUrl()).toBe('http://localhost:8009');
    expect(api.isConfigured()).toBe(true);
  });

  it('setBaseUrl / setToken / clearToken persist to storage', () => {
    const storage = makeStorage();
    const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(200, {})) });
    api.setBaseUrl('  http://host:1/  ');
    expect(storage.getItem(STORAGE_KEYS.url)).toBe('http://host:1/');
    api.setToken('abc');
    expect(storage.getItem(STORAGE_KEYS.token)).toBe('abc');
    expect(api.isLoggedIn()).toBe(true);
    api.clearToken();
    expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(api.isLoggedIn()).toBe(false);
  });
});

describe('ApiClient auth', () => {
  it('register posts credentials and stores the returned token', async () => {
    const storage = makeStorage(CONFIGURED);
    const fetchImpl = makeFetch(jsonResponse(201, { token: 't-reg', user: { id: 1, email: 'a@b.c' } }));
    const api = new ApiClient({ storage, fetch: fetchImpl });

    const data = await api.register({ email: 'a@b.c', password: 'pw' });

    expect(data.user.email).toBe('a@b.c');
    expect(storage.getItem(STORAGE_KEYS.token)).toBe('t-reg');
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('http://localhost:8009/api/auth/register');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.c', password: 'pw' });
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('login stores the token and later requests send it as a Bearer header', async () => {
    const storage = makeStorage(CONFIGURED);
    const loginFetch = makeFetch(jsonResponse(200, { token: 't-login', user: { id: 2, email: 'x@y.z' } }));
    const api = new ApiClient({ storage, fetch: loginFetch });
    await api.login({ email: 'x@y.z', password: 'pw' });
    expect(storage.getItem(STORAGE_KEYS.token)).toBe('t-login');

    // Swap the fetch for the authed call and assert the header plumbing.
    const meFetch = makeFetch(jsonResponse(200, { id: 2, email: 'x@y.z' }));
    api._fetch = meFetch;
    const me = await api.me();
    expect(me.email).toBe('x@y.z');
    expect(meFetch.calls[0].options.headers.Authorization).toBe('Bearer t-login');
  });

  it('logout clears the token', () => {
    const storage = makeStorage(LOGGED_IN);
    const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(200, {})) });
    expect(api.isLoggedIn()).toBe(true);
    api.logout();
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
    expect(fetchImpl.calls[0].url).toBe('http://localhost:8009/api/projects');
    expect(fetchImpl.calls[0].options.headers.Authorization).toBe('Bearer jwt-123');
  });

  it('createProject posts name + graph', async () => {
    const graph = { layers: [], edges: [], inputs: [], outputs: [] };
    const fetchImpl = makeFetch(jsonResponse(201, { id: 5, name: 'N', graph, updated_at: 't' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const created = await api.createProject({ name: 'N', graph });
    expect(created.id).toBe(5);
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('http://localhost:8009/api/projects');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ name: 'N', graph });
  });

  it('getProject fetches by id', async () => {
    const fetchImpl = makeFetch(jsonResponse(200, { id: 7, name: 'G', graph: {}, updated_at: 't' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    const p = await api.getProject(7);
    expect(p.id).toBe(7);
    expect(fetchImpl.calls[0].url).toBe('http://localhost:8009/api/projects/7');
    expect(fetchImpl.calls[0].options.method).toBe('GET');
  });

  it('updateProject only sends provided fields', async () => {
    const fetchImpl = makeFetch(jsonResponse(200, { id: 7, name: 'R', updated_at: 't' }));
    const api = new ApiClient({ storage, fetch: fetchImpl });
    await api.updateProject(7, { name: 'R' });
    const { url, options } = fetchImpl.calls[0];
    expect(url).toBe('http://localhost:8009/api/projects/7');
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
  it('throws no-backend when the url is not set', async () => {
    const api = new ApiClient({ storage: makeStorage(), fetch: makeFetch(jsonResponse(200, {})) });
    await expect(api.listProjects()).rejects.toMatchObject({ code: ERROR_CODES.noBackend });
  });

  it('throws not-logged-in for authed calls without a token', async () => {
    const api = new ApiClient({ storage: makeStorage(CONFIGURED), fetch: makeFetch(jsonResponse(200, {})) });
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

  it('does not store a token when login fails', async () => {
    const storage = makeStorage(CONFIGURED);
    const api = new ApiClient({ storage, fetch: makeFetch(jsonResponse(400, { detail: 'bad creds' })) });
    await expect(api.login({ email: 'a', password: 'b' })).rejects.toMatchObject({ status: 400 });
    expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
  });
});
