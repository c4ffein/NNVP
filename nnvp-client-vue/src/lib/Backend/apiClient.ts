/**
 * apiClient.ts
 *
 * Small wrapper around the NNVP cloud backend (a separate Django Ninja
 * service). This is a *progressive enhancement*: the SPA works fully without it.
 *
 * The backend lives at the same origin under `/api` — the user never
 * configures a server URL. In dev, vite proxies `/api` to the Django port
 * (see vite.config.js); in production a reverse proxy does the same.
 *
 * Auth is magic-link only, and it signs in the browser that REQUESTED the
 * login: requestMagicLink() immediately stores a PENDING bearer token and
 * returns a 4-char match code; the UI polls authStatus() until the emailed
 * link is clicked (approveMagicLink(), from any browser — the clicking
 * browser only approves, it never receives credentials). The bearer lives in
 * localStorage so the session survives reloads:
 *   - nnvp_backend_token : opaque bearer token. Empty => "not logged in" state.
 *
 * All network failures surface as a single ApiError with a machine-readable
 * `code` so the UI can react without string-matching messages.
 */

import { bus } from '../Events/bus';
import type { DomainEvent } from '../Events/domainEvent';

export const DEFAULT_BASE_URL = '/api';

// --- domain events: the wire mapping (snake_case) ---------------------------
// The backend speaks snake_case envelopes; everything client-side speaks the
// camelCase DomainEvent. THIS is the one boundary where the two shapes meet —
// exported so the fake backend can mirror the exact same wire format.

/** The server's event envelope (created_at is output-only). */
export interface WireEvent {
  uuid: string;
  event_type: string;
  stream_id: string | null;
  device_id: string;
  instance_id: string;
  seq: number;
  depends_on: string[];
  wall_time: string;
  payload: Record<string, unknown>;
  created_at?: string;
}

/** One batch-put result line: per-item, idempotent server-side. */
export interface EventPutResult {
  uuid: string;
  status: 'created' | 'exists' | 'invalid';
  error?: string | null;
}

/** DomainEvent -> wire envelope. localOnly (device-private) never leaves. */
export function eventToWire(event: DomainEvent): WireEvent {
  return {
    uuid: event.uuid,
    event_type: event.type,
    stream_id: event.streamId ?? null,
    device_id: event.deviceId,
    instance_id: event.instanceId,
    seq: event.seq,
    depends_on: event.dependsOn,
    wall_time: event.wallTime,
    payload: (event.payload && typeof event.payload === 'object'
      ? event.payload : {}) as Record<string, unknown>,
  };
}

/** Wire envelope -> DomainEvent (created_at, a server detail, is dropped). */
export function eventFromWire(wire: WireEvent): DomainEvent {
  return {
    uuid: wire.uuid,
    type: wire.event_type,
    streamId: wire.stream_id ?? null,
    deviceId: wire.device_id,
    instanceId: wire.instance_id,
    seq: wire.seq,
    dependsOn: Array.isArray(wire.depends_on) ? wire.depends_on : [],
    wallTime: typeof wire.wall_time === 'string' ? wire.wall_time : '',
    payload: (wire.payload && typeof wire.payload === 'object') ? wire.payload : {},
  };
}

export const STORAGE_KEYS = {
  token: 'nnvp_backend_token',
};

export const ERROR_CODES = {
  notLoggedIn: 'not-logged-in',
  network: 'network',
  malformed: 'malformed',
  http: 'http',
};

/**
 * The minimal Storage surface the client uses; the DOM's localStorage
 * satisfies it, and tests inject plain-object stand-ins.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Emitted on the app bus (lib/Events) whenever the stored token changes
 * (sign-in, sign-out, expiry cleanup) so header icons / the chat bubble can
 * re-read auth state without a store or polling.
 */
function notifyAuthChanged() {
  bus.emit('auth.changed');
}

/**
 * Server RecordOut → the client-shaped record: the payload verbatim with the
 * uuid re-stamped from the envelope (defensive — an uploaded record always
 * carries its own uuid, but the envelope is the authority).
 */
function unwrapRecord(response: unknown): Record<string, unknown> | null {
  const envelope = response as { uuid?: unknown; payload?: unknown } | null;
  if (!envelope || typeof envelope !== 'object') return null;
  const payload = (envelope.payload && typeof envelope.payload === 'object')
    ? envelope.payload as Record<string, unknown> : {};
  return typeof envelope.uuid === 'string' ? { ...payload, uuid: envelope.uuid } : { ...payload };
}

export class ApiError extends Error {
  code: string;
  status: number | null;
  body: unknown;

  constructor(
    code: string,
    message?: string,
    { status = null, body = null }: { status?: number | null; body?: unknown } = {},
  ) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export interface ApiClientOptions {
  /** Injectable fetch (for tests / SSR). */
  fetch?: typeof fetch;
  /** Injectable storage (defaults to localStorage). */
  storage?: StorageLike;
  /**
   * API base; defaults to same-origin "/api". Overridden by the contract
   * tests to hit a real backend by URL.
   */
  baseUrl?: string;
}

export default class ApiClient {
  _fetch: typeof fetch | undefined;
  _storage: StorageLike | null;
  _baseUrl: string;

  constructor({ fetch: fetchImpl, storage, baseUrl }: ApiClientOptions = {}) {
    // Bind to preserve `this` when the global fetch is used.
    this._fetch = fetchImpl
      || (typeof globalThis !== 'undefined' && globalThis.fetch
        ? globalThis.fetch.bind(globalThis)
        : undefined);
    this._storage = storage
      || (typeof localStorage !== 'undefined' ? localStorage : null);
    // Trim a trailing slash so `${base}${path}` never double-slashes.
    this._baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  // --- configuration ---------------------------------------------------------

  _get(key: string): string {
    try {
      return (this._storage && this._storage.getItem(key)) || '';
    } catch {
      return '';
    }
  }

  _set(key: string, value: string) {
    try {
      if (!this._storage) return;
      if (value) this._storage.setItem(key, value);
      else this._storage.removeItem(key);
    } catch { /* storage unavailable (private mode) */ }
  }

  getBaseUrl() {
    return this._baseUrl;
  }

  getToken() {
    return this._get(STORAGE_KEYS.token);
  }

  setToken(token: string | null | undefined) {
    this._set(STORAGE_KEYS.token, token || '');
    notifyAuthChanged();
  }

  clearToken() {
    this._set(STORAGE_KEYS.token, '');
    notifyAuthChanged();
  }

  isLoggedIn() {
    return this.getToken().length > 0;
  }

  // --- core request ----------------------------------------------------------

  /**
   * @param path   e.g. "/projects" (relative to the "/api" base)
   * @param opts.body  serialized as JSON
   * @param opts.auth  attach the bearer token; `true` also requires one to be
   *   present, `'optional'` attaches it when it exists
   */
  async request(path: string, { method = 'GET', body, auth = false }: {
    method?: string;
    body?: unknown;
    auth?: boolean | 'optional';
  } = {}): Promise<unknown> {
    if (auth === true && !this.getToken()) {
      throw new ApiError(ERROR_CODES.notLoggedIn, 'Not signed in');
    }
    if (!this._fetch) {
      throw new ApiError(ERROR_CODES.network, 'No fetch implementation available');
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.getToken()) headers.Authorization = `Bearer ${this.getToken()}`;

    let response: Response;
    try {
      response = await this._fetch(`${this._baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ApiError(ERROR_CODES.network, 'Network request failed', { body: String(cause) });
    }

    // 204 No Content (e.g. DELETE, magic/request) — nothing to parse.
    if (response.status === 204) return null;

    let payload: unknown = null;
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
      const errorBody = payload as { detail?: string; message?: string; error?: string } | null;
      const message = (errorBody && (errorBody.detail || errorBody.message || errorBody.error))
        || `Request failed with status ${response.status}`;
      throw new ApiError(ERROR_CODES.http, message, { status: response.status, body: payload });
    }

    return payload;
  }

  // --- auth (magic-link only: no passwords, account created on first login) ---

  /**
   * Start a login: the backend emails a single-use approval link and hands
   * THIS browser a pending bearer (stored immediately) plus the 4-char match
   * code to display. Poll authStatus() until the link is clicked.
   */
  async requestMagicLink(email: string) {
    const data = await this.request('/auth/magic/request', {
      method: 'POST',
      body: { email },
    }) as { token?: string; code?: string } | null;
    if (data && data.token) this.setToken(data.token);
    return data; // { token, code }
  }

  /**
   * Login-status poll for this browser's (possibly pending) bearer:
   * { verified, user?, code? }. 401 means the pending token expired.
   */
  async authStatus() {
    return this.request('/auth/status', { auth: true });
  }

  /**
   * What the approval page shows before the deliberate click:
   * { code, requester, requested_at, same_browser }. Sends this browser's own
   * bearer (when present) so the backend can detect the same-browser case.
   */
  async magicInfo(token: string) {
    return this.request('/auth/magic/info', {
      method: 'POST',
      auth: 'optional',
      body: { token },
    });
  }

  /**
   * The deliberate click: approves the browser that REQUESTED the login.
   * Returns the signed-in user — never credentials for this browser.
   */
  async approveMagicLink(token: string) {
    return this.request('/auth/magic/approve', {
      method: 'POST',
      body: { token },
    });
  }

  async me() {
    return this.request('/auth/me', { auth: true });
  }

  /**
   * Sign out this browser: best-effort server-side revocation (also cancels a
   * pending magic login — the emailed link dies with the token), then drop
   * the local token regardless.
   */
  async logout() {
    try {
      if (this.getToken()) {
        await this.request('/auth/logout', { method: 'POST', auth: 'optional' });
      }
    } catch { /* revoking is best-effort; the local sign-out must not fail */ }
    this.clearToken();
  }

  // --- projects --------------------------------------------------------------

  async getAssistantUsage(days = 30) {
    return this.request(`/assistant/usage?days=${days}`, { auth: true });
  }

  async listProjects() {
    return this.request('/projects', { auth: true });
  }

  async getProject(id: number | string) {
    return this.request(`/projects/${id}`, { auth: true });
  }

  async createProject({
    name, graph, tags, parent,
  }: {
    name: string;
    graph: unknown;
    tags?: string[];
    parent?: number | null;
  }) {
    const body: Record<string, unknown> = { name, graph };
    if (tags !== undefined) body.tags = tags;
    if (parent !== undefined && parent !== null) body.parent = parent;
    return this.request('/projects', {
      method: 'POST',
      auth: true,
      body,
    });
  }

  /**
   * The localized save graph around one project: ancestors + descendants,
   * capped at 2 levels each way ({ focus, nodes, edges }).
   */
  async projectLineage(id: number | string) {
    return this.request(`/projects/${id}/lineage`, { auth: true });
  }

  async updateProject(id: number | string, { name, graph }: { name?: string; graph?: unknown } = {}) {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (graph !== undefined) body.graph = graph;
    return this.request(`/projects/${id}`, { method: 'PUT', auth: true, body });
  }

  async deleteProject(id: number | string) {
    return this.request(`/projects/${id}`, { method: 'DELETE', auth: true });
  }

  // --- runs (immutable journal records, client-generated uuids) ---------------
  // The server wraps record payloads (django-ninja RecordOut/RecordIn house
  // style): GET /{uuid} answers { uuid, created_at, updated_at, payload } and
  // PUT expects { payload: <record> }. Wrapping/unwrapping happens HERE so
  // sync.ts and every other consumer only ever sees the client-shaped record.

  /** Uuid+summary projections of the owner's runs (never the full payloads). */
  async listRuns() {
    return this.request('/runs', { auth: true });
  }

  /** The full run record as it was uploaded (unwrapped from the server's RecordOut). */
  async getRun(uuid: string) {
    return unwrapRecord(await this.request(`/runs/${uuid}`, { auth: true }));
  }

  /**
   * Upsert by client uuid. Runs are immutable: an already-known uuid is a
   * server-side no-op (dedupe), so re-pushing is always safe.
   */
  async putRun(uuid: string, payload: unknown) {
    return this.request(`/runs/${uuid}`, { method: 'PUT', auth: true, body: { payload } });
  }

  async deleteRun(uuid: string) {
    return this.request(`/runs/${uuid}`, { method: 'DELETE', auth: true });
  }

  // --- events (append-only domain events, uuid set-difference sync) -----------
  // Server contract: paginated uuid listing (ascending (created_at, id)),
  // batch-get/batch-put capped at 500 per call (422 above), per-item
  // idempotent puts (stored events are never touched), and purge-by-stream as
  // the one destructive primitive. All snake_case on the wire — mapped to the
  // client DomainEvent shape HERE and nowhere else.

  /**
   * One page of the owner's event uuids: { uuids, nextCursor } — nextCursor
   * null means last page. Optional streamId narrows to one stream (the
   * cloud-presence probe for the purge choices).
   */
  async listEventUuids({ cursor, limit, streamId }: {
    cursor?: number;
    limit?: number;
    streamId?: string;
  } = {}): Promise<{ uuids: string[]; nextCursor: number | null }> {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set('cursor', String(cursor));
    if (limit !== undefined) params.set('limit', String(limit));
    if (streamId !== undefined) params.set('stream_id', streamId);
    const query = params.toString();
    const data = await this.request(`/events/uuids${query ? `?${query}` : ''}`, { auth: true }) as
      { uuids?: unknown; next_cursor?: unknown } | null;
    const uuids = Array.isArray(data?.uuids)
      ? data!.uuids.filter((uuid): uuid is string => typeof uuid === 'string' && !!uuid)
      : [];
    return { uuids, nextCursor: typeof data?.next_cursor === 'number' ? data.next_cursor : null };
  }

  /** The full events for a uuid batch (≤500); unknown/foreign uuids are
   *  silently omitted by the server — the caller just gets fewer events. */
  async batchGetEvents(uuids: string[]): Promise<DomainEvent[]> {
    const data = await this.request('/events/batch-get', {
      method: 'POST', auth: true, body: { uuids },
    }) as { events?: unknown } | null;
    if (!Array.isArray(data?.events)) return [];
    return data!.events
      .filter((wire): wire is WireEvent => !!wire && typeof wire === 'object'
        && typeof (wire as WireEvent).uuid === 'string')
      .map(eventFromWire);
  }

  /** Idempotent batch upload (≤500): per-item results, 'exists' is success. */
  async batchPutEvents(events: DomainEvent[]): Promise<EventPutResult[]> {
    const data = await this.request('/events/batch-put', {
      method: 'POST', auth: true, body: { events: events.map(eventToWire) },
    }) as { results?: unknown } | null;
    return Array.isArray(data?.results) ? data!.results as EventPutResult[] : [];
  }

  /** Purge one stream's events from the cloud (privacy-grade destruction —
   *  deliberately NOT an event). Returns how many were deleted (0 for
   *  empty/foreign streams). */
  async purgeEventStream(streamId: string): Promise<number> {
    const data = await this.request(`/events/by-stream/${streamId}`, {
      method: 'DELETE', auth: true,
    }) as { deleted?: unknown } | null;
    return typeof data?.deleted === 'number' ? data.deleted : 0;
  }

  // --- conversations (mutable records, upsert on updatedAt) -------------------

  /** Uuid+summary projections of the owner's conversations. */
  async listConversations() {
    return this.request('/conversations', { auth: true });
  }

  /** The full conversation record as it was uploaded (unwrapped from RecordOut). */
  async getConversation(uuid: string) {
    return unwrapRecord(await this.request(`/conversations/${uuid}`, { auth: true }));
  }

  /**
   * Upsert by client uuid. Unlike runs, conversations mutate: an existing
   * uuid is OVERWRITTEN (sync decides who wins by comparing updatedAt).
   */
  async putConversation(uuid: string, payload: unknown) {
    return this.request(`/conversations/${uuid}`, { method: 'PUT', auth: true, body: { payload } });
  }

  async deleteConversation(uuid: string) {
    return this.request(`/conversations/${uuid}`, { method: 'DELETE', auth: true });
  }
}
