/**
 * The fake same-origin /api both worlds serve for BackendDriver (see
 * define.ts): one pure request router, two transports — the bun world wraps
 * it in a globalThis.fetch stub, the browser world in a page.route handler.
 *
 * It implements exactly the per-kind record endpoints sync.ts/apiClient.ts
 * consume (list / get / put / delete for runs and conversations), with the
 * server's RecordOut/RecordIn wrapping: GET /{uuid} answers
 * { uuid, payload }, PUT expects { payload }. Anything else is not ours —
 * handle() returns null and the transport lets the request fail like a
 * missing backend would.
 */
import type { RecordStoreName, StoredRecord } from '../../src/lib/LocalStore/recordStore';
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

const KINDS: RecordStoreName[] = ['runs', 'conversations'];

export function createFakeBackend(data: BackendFakeData): FakeBackend {
  const state: Record<RecordStoreName, Map<string, StoredRecord>> = {
    runs: new Map((data.runs || []).map(record => [record.uuid, record])),
    conversations: new Map((data.conversations || []).map(record => [record.uuid, record])),
  };
  return {
    state,
    handle(method, url, requestBody) {
      // The path after the /api base; tolerates absolute browser URLs.
      const apiIndex = url.indexOf('/api/');
      if (apiIndex === -1) return null;
      const path = url.slice(apiIndex + '/api'.length).split('?')[0]!;
      const [, kindSegment, uuid, extra] = path.split('/');
      const kind = KINDS.find(name => name === kindSegment);
      if (!kind || extra !== undefined) return null;
      const records = state[kind];
      const verb = method.toUpperCase();

      if (uuid === undefined) {
        // The collection: uuid projections only, like the real server.
        if (verb !== 'GET') return { status: 405, body: '{"detail": "method not allowed"}' };
        return {
          status: 200,
          body: JSON.stringify([...records.keys()].map(id => ({ uuid: id }))),
        };
      }
      if (verb === 'GET') {
        const record = records.get(uuid);
        if (!record) return { status: 404, body: '{"detail": "not found"}' };
        return { status: 200, body: JSON.stringify({ uuid, payload: record }) };
      }
      if (verb === 'PUT') {
        const parsed = requestBody ? JSON.parse(requestBody) as { payload?: StoredRecord } : {};
        if (parsed.payload) records.set(uuid, parsed.payload);
        return { status: 200, body: '{}' };
      }
      if (verb === 'DELETE') {
        records.delete(uuid);
        return { status: 204, body: null };
      }
      return { status: 405, body: '{"detail": "method not allowed"}' };
    },
  };
}
