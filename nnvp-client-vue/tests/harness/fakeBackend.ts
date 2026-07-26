/**
 * The fake same-origin /api both worlds serve for BackendDriver (see
 * define.ts): one pure request router, two transports — the bun world wraps
 * it in a globalThis.fetch stub, the browser world in a page.route handler.
 *
 * It implements exactly what sync/apiClient consume:
 *   - the per-kind record endpoints (list / get / put / delete for runs and
 *     conversations), with the server's RecordOut/RecordIn wrapping:
 *     GET /{uuid} answers { uuid, payload }, PUT expects { payload };
 *   - the four event endpoints of sync v2, mirroring the real contract:
 *     GET  /events/uuids?cursor&limit&stream_id -> { uuids, next_cursor }
 *          (ascending insertion order, limit<=1000 default 500, 422 above),
 *     POST /events/batch-get  { uuids<=500 }  -> { events } (unknown omitted),
 *     POST /events/batch-put  { events<=500 } -> { results } (per-item
 *          idempotent: created / exists / invalid; stored events untouched),
 *     DELETE /events/by-stream/{id} -> { deleted } (0 for empty/foreign).
 * Anything else is not ours — handle() returns null and the transport lets
 * the request fail like a missing backend would. (Auth headers are not
 * checked here; the auth boundary has its own suites.)
 */
import type { RecordStoreName, StoredRecord } from '../../src/lib/LocalStore/recordStore';
import { eventToWire } from '../../src/lib/Backend/apiClient';
import type { WireEvent } from '../../src/lib/Backend/apiClient';
import type { DomainEvent } from '../../src/lib/Events/domainEvent';
import type { BackendFakeData } from './define';

export interface FakeResponse {
  status: number;
  /** JSON text, or null for 204 No Content. */
  body: string | null;
}

export interface FakeBackend {
  state: Record<RecordStoreName, Map<string, StoredRecord>>;
  handle(method: string, url: string, requestBody?: string | null): FakeResponse | null;
}

const RECORD_KINDS = ['runs', 'conversations'] as const;

const EVENT_PAGE_DEFAULT = 500;
const EVENT_PAGE_MAX = 1000;
const EVENT_BATCH_MAX = 500;

/** A stored wire event plus the serial id the uuid pagination orders by. */
interface FakeStoredEvent extends StoredRecord {
  id: number;
  wire: WireEvent;
}

function json(status: number, body: unknown): FakeResponse {
  return { status, body: JSON.stringify(body) };
}

function invalidParams(detail: string): FakeResponse {
  return json(422, { detail });
}

/** The minimal wire-shape validation batch-put applies per item. */
function wireEventProblem(candidate: unknown): string | null {
  const wire = candidate as Partial<WireEvent> | null;
  if (!wire || typeof wire !== 'object') return 'not an object';
  if (typeof wire.uuid !== 'string' || !wire.uuid) return 'missing uuid';
  if (typeof wire.event_type !== 'string' || !wire.event_type) return 'missing event_type';
  if (wire.stream_id !== null && wire.stream_id !== undefined && typeof wire.stream_id !== 'string') return 'bad stream_id';
  if (typeof wire.device_id !== 'string' || !wire.device_id) return 'missing device_id';
  if (typeof wire.instance_id !== 'string' || !wire.instance_id) return 'missing instance_id';
  if (typeof wire.seq !== 'number') return 'missing seq';
  if (!Array.isArray(wire.depends_on)) return 'bad depends_on';
  if (typeof wire.wall_time !== 'string') return 'bad wall_time';
  if (!wire.payload || typeof wire.payload !== 'object' || Array.isArray(wire.payload)) return 'bad payload';
  return null;
}

export function createFakeBackend(data: BackendFakeData): FakeBackend {
  let nextEventId = 1;
  const events = new Map<string, FakeStoredEvent>();
  const storeWire = (wire: WireEvent): void => {
    const id = nextEventId;
    nextEventId += 1;
    events.set(wire.uuid, {
      uuid: wire.uuid,
      id,
      wire: { ...wire, created_at: wire.created_at ?? new Date(2026, 0, id).toISOString() },
    });
  };
  for (const event of data.events || []) storeWire(eventToWire(event as DomainEvent));

  const state: Record<RecordStoreName, Map<string, StoredRecord>> = {
    runs: new Map((data.runs || []).map(record => [record.uuid, record])),
    conversations: new Map((data.conversations || []).map(record => [record.uuid, record])),
    events,
  };

  /** GET /events/uuids — cursor pagination in ascending storage order. */
  const listUuids = (query: URLSearchParams): FakeResponse => {
    const rawCursor = query.get('cursor');
    const rawLimit = query.get('limit');
    const cursor = rawCursor === null ? 0 : Number(rawCursor);
    const limit = rawLimit === null ? EVENT_PAGE_DEFAULT : Number(rawLimit);
    if (!Number.isInteger(cursor) || cursor < 0) return invalidParams('bad cursor');
    if (!Number.isInteger(limit) || limit < 1 || limit > EVENT_PAGE_MAX) return invalidParams('bad limit');
    const streamId = query.get('stream_id');
    const ascending = [...events.values()]
      .filter(stored => (streamId === null ? true : stored.wire.stream_id === streamId))
      .sort((a, b) => a.id - b.id)
      .filter(stored => stored.id > cursor);
    const page = ascending.slice(0, limit);
    return json(200, {
      uuids: page.map(stored => stored.uuid),
      next_cursor: ascending.length > limit ? page[page.length - 1]!.id : null,
    });
  };

  const batchGet = (requestBody: string | null | undefined): FakeResponse => {
    const parsed = requestBody ? JSON.parse(requestBody) as { uuids?: unknown } : {};
    if (!Array.isArray(parsed.uuids)) return invalidParams('uuids required');
    if (parsed.uuids.length > EVENT_BATCH_MAX) return invalidParams('too many uuids');
    const found: WireEvent[] = [];
    for (const uuid of parsed.uuids) {
      const stored = typeof uuid === 'string' ? events.get(uuid) : undefined;
      if (stored) found.push(stored.wire); // unknown/foreign uuids silently omitted
    }
    return json(200, { events: found });
  };

  const batchPut = (requestBody: string | null | undefined): FakeResponse => {
    const parsed = requestBody ? JSON.parse(requestBody) as { events?: unknown } : {};
    if (!Array.isArray(parsed.events)) return invalidParams('events required');
    if (parsed.events.length > EVENT_BATCH_MAX) return invalidParams('too many events');
    const results = parsed.events.map((candidate) => {
      const problem = wireEventProblem(candidate);
      if (problem) {
        const uuid = (candidate as { uuid?: unknown } | null)?.uuid;
        return { uuid: typeof uuid === 'string' ? uuid : '', status: 'invalid', error: problem };
      }
      const wire = candidate as WireEvent;
      if (events.has(wire.uuid)) {
        // Idempotent: the stored event is NEVER touched by a re-put.
        return { uuid: wire.uuid, status: 'exists', error: null };
      }
      storeWire({ ...wire, created_at: undefined });
      return { uuid: wire.uuid, status: 'created', error: null };
    });
    return json(200, { results });
  };

  const purgeStream = (streamId: string): FakeResponse => {
    let deleted = 0;
    // Deleting during Map iteration is safe per spec.
    for (const [uuid, stored] of events.entries()) {
      if (stored.wire.stream_id === streamId) {
        events.delete(uuid);
        deleted += 1;
      }
    }
    return json(200, { deleted });
  };

  return {
    state,
    handle(method, url, requestBody) {
      // The path after the /api base; tolerates absolute browser URLs.
      const apiIndex = url.indexOf('/api/');
      if (apiIndex === -1) return null;
      const [path = '', rawQuery = ''] = url.slice(apiIndex + '/api'.length).split('?');
      const verb = method.toUpperCase();

      // --- the event endpoints -------------------------------------------------
      if (path === '/events/uuids') {
        if (verb !== 'GET') return json(405, { detail: 'method not allowed' });
        return listUuids(new URLSearchParams(rawQuery));
      }
      if (path === '/events/batch-get') {
        if (verb !== 'POST') return json(405, { detail: 'method not allowed' });
        return batchGet(requestBody);
      }
      if (path === '/events/batch-put') {
        if (verb !== 'POST') return json(405, { detail: 'method not allowed' });
        return batchPut(requestBody);
      }
      const purgeMatch = path.match(/^\/events\/by-stream\/([^/]+)$/);
      if (purgeMatch) {
        if (verb !== 'DELETE') return json(405, { detail: 'method not allowed' });
        return purgeStream(purgeMatch[1]!);
      }
      if (path.startsWith('/events')) return null; // not part of the contract

      // --- the record endpoints ------------------------------------------------
      const [, kindSegment, uuid, extra] = path.split('/');
      const kind = RECORD_KINDS.find(name => name === kindSegment);
      if (!kind || extra !== undefined) return null;
      const records = state[kind];

      if (uuid === undefined) {
        // The collection: uuid projections only, like the real server.
        if (verb !== 'GET') return json(405, { detail: 'method not allowed' });
        return json(200, [...records.keys()].map(id => ({ uuid: id })));
      }
      if (verb === 'GET') {
        const record = records.get(uuid);
        if (!record) return json(404, { detail: 'not found' });
        return json(200, { uuid, payload: record });
      }
      if (verb === 'PUT') {
        const parsed = requestBody ? JSON.parse(requestBody) as { payload?: StoredRecord } : {};
        if (parsed.payload) records.set(uuid, parsed.payload);
        return json(200, {});
      }
      if (verb === 'DELETE') {
        records.delete(uuid);
        return { status: 204, body: null };
      }
      return json(405, { detail: 'method not allowed' });
    },
  };
}
