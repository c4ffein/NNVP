/**
 * apiClient.js
 *
 * Small wrapper around the optional NNVP cloud backend (a separate Django Ninja
 * service). This is a *progressive enhancement*: the SPA works fully without it.
 *
 * Configuration lives in localStorage so it survives reloads and can be set from
 * the UI:
 *   - nnvp_backend_url   : base URL of the backend (e.g. http://localhost:8009).
 *                          Empty  => "no backend configured" state.
 *   - nnvp_backend_token : JWT bearer token. Empty => "not logged in" state.
 *
 * All network failures surface as a single ApiError with a machine-readable
 * `code` so the UI can react without string-matching messages.
 */

export const STORAGE_KEYS = {
  url: 'nnvp_backend_url',
  token: 'nnvp_backend_token',
};

export const ERROR_CODES = {
  noBackend: 'no-backend',
  notLoggedIn: 'not-logged-in',
  network: 'network',
  malformed: 'malformed',
  http: 'http',
};

export class ApiError extends Error {
  constructor(code, message, { status = null, body = null } = {}) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export default class ApiClient {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]   Injectable fetch (for tests / SSR).
   * @param {Storage}      [options.storage] Injectable storage (defaults to localStorage).
   */
  constructor({ fetch: fetchImpl, storage } = {}) {
    // Bind to preserve `this` when the global fetch is used.
    this._fetch = fetchImpl
      || (typeof globalThis !== 'undefined' && globalThis.fetch
        ? globalThis.fetch.bind(globalThis)
        : undefined);
    this._storage = storage
      || (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  // --- configuration ---------------------------------------------------------

  _get(key) {
    try {
      return (this._storage && this._storage.getItem(key)) || '';
    } catch {
      return '';
    }
  }

  _set(key, value) {
    try {
      if (!this._storage) return;
      if (value) this._storage.setItem(key, value);
      else this._storage.removeItem(key);
    } catch { /* storage unavailable (private mode) */ }
  }

  getBaseUrl() {
    // Trim a trailing slash so `${base}${path}` never double-slashes.
    return this._get(STORAGE_KEYS.url).replace(/\/+$/, '');
  }

  setBaseUrl(url) {
    this._set(STORAGE_KEYS.url, (url || '').trim());
  }

  getToken() {
    return this._get(STORAGE_KEYS.token);
  }

  setToken(token) {
    this._set(STORAGE_KEYS.token, token || '');
  }

  clearToken() {
    this._set(STORAGE_KEYS.token, '');
  }

  isConfigured() {
    return this.getBaseUrl().length > 0;
  }

  isLoggedIn() {
    return this.isConfigured() && this.getToken().length > 0;
  }

  // --- core request ----------------------------------------------------------

  /**
   * @param {string} path   e.g. "/api/projects"
   * @param {object} [opts]
   * @param {string} [opts.method]
   * @param {object} [opts.body]  serialized as JSON
   * @param {boolean} [opts.auth] attach the bearer token (and require login)
   */
  async request(path, { method = 'GET', body, auth = false } = {}) {
    const base = this.getBaseUrl();
    if (!base) {
      throw new ApiError(ERROR_CODES.noBackend, 'No backend URL configured');
    }
    if (auth && !this.getToken()) {
      throw new ApiError(ERROR_CODES.notLoggedIn, 'Not signed in');
    }
    if (!this._fetch) {
      throw new ApiError(ERROR_CODES.network, 'No fetch implementation available');
    }

    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = `Bearer ${this.getToken()}`;

    let response;
    try {
      response = await this._fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ApiError(ERROR_CODES.network, 'Network request failed', { body: String(cause) });
    }

    // 204 No Content (e.g. DELETE) — nothing to parse.
    if (response.status === 204) return null;

    let payload = null;
    const raw = await response.text();
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        if (response.ok) {
          throw new ApiError(ERROR_CODES.malformed, 'Malformed JSON response', {
            status: response.status,
          });
        }
        // Non-ok + non-JSON: fall through to the http error below with no body.
      }
    }

    if (!response.ok) {
      const message = (payload && (payload.detail || payload.message || payload.error))
        || `Request failed with status ${response.status}`;
      throw new ApiError(ERROR_CODES.http, message, { status: response.status, body: payload });
    }

    return payload;
  }

  // --- auth ------------------------------------------------------------------

  async register({ email, password }) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: { email, password },
    });
    if (data && data.token) this.setToken(data.token);
    return data;
  }

  async login({ email, password }) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (data && data.token) this.setToken(data.token);
    return data;
  }

  async me() {
    return this.request('/api/auth/me', { auth: true });
  }

  logout() {
    this.clearToken();
  }

  // --- projects --------------------------------------------------------------

  async listProjects() {
    return this.request('/api/projects', { auth: true });
  }

  async getProject(id) {
    return this.request(`/api/projects/${id}`, { auth: true });
  }

  async createProject({ name, graph }) {
    return this.request('/api/projects', {
      method: 'POST',
      auth: true,
      body: { name, graph },
    });
  }

  async updateProject(id, { name, graph } = {}) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (graph !== undefined) body.graph = graph;
    return this.request(`/api/projects/${id}`, { method: 'PUT', auth: true, body });
  }

  async deleteProject(id) {
    return this.request(`/api/projects/${id}`, { method: 'DELETE', auth: true });
  }
}
