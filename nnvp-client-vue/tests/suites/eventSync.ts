/**
 * Sync v2 against the fake backend's event endpoints: the harness router
 * (tests/harness/fakeBackend.ts) mirrors the real /api/events contract —
 * paginated uuid listing, 500-capped batch-get/batch-put (422 above),
 * per-item idempotent puts, purge-by-stream — and here the REAL ApiClient
 * talks to it through a fetch stub, up to a full syncEvents round trip.
 * This is the bun-side contract mirror; tests/contract pins the real server.
 */
import { logicTest } from '../harness/define';
import { createFakeBackend } from '../harness/fakeBackend';
import type { FakeBackend } from '../harness/fakeBackend';
import ApiClient, { eventFromWire, eventToWire } from '../../src/lib/Backend/apiClient';
import { syncEvents } from '../../src/lib/Backend/sync';
import { appendEvent, listAllEvents } from '../../src/lib/Events/store';
import { Emitter } from '../../src/lib/Events/emitter';
import type { EventMap } from '../../src/lib/Events/emitter';
import type { DomainEvent } from '../../src/lib/Events/domainEvent';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import type { StorageLike } from '../../src/lib/Backend/apiClient';

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

/** The real ApiClient wired straight into the fake router — no network. */
function clientOver(fake: FakeBackend): ApiClient {
  const storage: StorageLike = {
    getItem: key => (key === 'nnvp_backend_token' ? 'test-token' : null),
    setItem: () => {},
    removeItem: () => {},
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const answer = fake.handle(init?.method || 'GET', url,
      typeof init?.body === 'string' ? init.body : null);
    if (!answer) throw new TypeError(`fakeBackend disowned ${url}`);
    return new Response(answer.body, { status: answer.status });
  }) as typeof fetch;
  return new ApiClient({ storage, fetch: fetchImpl });
}

// --- the wire mapping round-trips ---------------------------------------------------

logicTest('eventWire: toWire/fromWire round-trip and created_at never leaks in', ({ expect }) => {
  const event = domainEvent({ uuid: 'e-1', dependsOn: ['e-0'], payload: { epoch: 2, acc: 0.9 } });
  const wire = eventToWire(event);
  expect(wire).toEqual({
    uuid: 'e-1',
    event_type: 'run.epoch',
    stream_id: 'run-1',
    device_id: 'device-a',
    instance_id: 'instance-1',
    seq: 1,
    depends_on: ['e-0'],
    wall_time: '2026-07-20T10:00:00.000Z',
    payload: { epoch: 2, acc: 0.9 },
  });
  expect(eventFromWire({ ...wire, created_at: '2026-07-21T00:00:00Z' })).toEqual(event);
});

// --- the router mirrored contract, endpoint by endpoint ------------------------------

logicTest('fakeBackend events: uuid listing paginates ascending with a null last cursor', async ({ expect }) => {
  const seeded = [1, 2, 3, 4, 5].map(n => domainEvent({ uuid: `e-${n}`, seq: n }));
  const api = clientOver(createFakeBackend({ events: seeded }));

  const first = await api.listEventUuids({ limit: 2 });
  expect(first.uuids).toEqual(['e-1', 'e-2']);
  expect(first.nextCursor).not.toBe(null);
  const second = await api.listEventUuids({ cursor: first.nextCursor!, limit: 2 });
  expect(second.uuids).toEqual(['e-3', 'e-4']);
  const last = await api.listEventUuids({ cursor: second.nextCursor!, limit: 2 });
  expect(last.uuids).toEqual(['e-5']);
  expect(last.nextCursor).toBe(null); // null = last page, the loop's exit
});

logicTest('fakeBackend events: stream_id narrows the uuid listing', async ({ expect }) => {
  const api = clientOver(createFakeBackend({
    events: [
      domainEvent({ uuid: 'e-a', streamId: 'run-a' }),
      domainEvent({ uuid: 'e-b', streamId: 'run-b' }),
    ],
  }));
  expect((await api.listEventUuids({ streamId: 'run-a' })).uuids).toEqual(['e-a']);
  expect((await api.listEventUuids({ streamId: 'run-none' })).uuids).toEqual([]);
});

logicTest('fakeBackend events: 422 on cap violations, like the real server', async ({ expect }) => {
  const fake = createFakeBackend({});
  const api = clientOver(fake);
  // limit above 1000
  await expect(api.listEventUuids({ limit: 1001 })).rejects.toMatchObject({ status: 422 });
  // batch-get/put above 500
  const tooMany = Array.from({ length: 501 }, (_, n) => `e-${n}`);
  await expect(api.batchGetEvents(tooMany)).rejects.toMatchObject({ status: 422 });
  const tooManyEvents = tooMany.map(uuid => domainEvent({ uuid }));
  await expect(api.batchPutEvents(tooManyEvents)).rejects.toMatchObject({ status: 422 });
});

logicTest('fakeBackend events: batch-get omits unknown uuids silently', async ({ expect }) => {
  const api = clientOver(createFakeBackend({ events: [domainEvent({ uuid: 'e-known' })] }));
  const events = await api.batchGetEvents(['e-known', 'e-foreign']);
  expect(events.map(event => event.uuid)).toEqual(['e-known']);
});

logicTest('fakeBackend events: batch-put answers created/exists/invalid per item, stored events untouched', async ({ expect }) => {
  const original = domainEvent({ uuid: 'e-1', payload: { epoch: 0 } });
  const api = clientOver(createFakeBackend({ events: [original] }));

  const impostor = domainEvent({ uuid: 'e-1', payload: { epoch: 99 } });
  const fresh = domainEvent({ uuid: 'e-2', seq: 2 });
  const broken = { ...domainEvent({ uuid: 'e-3' }), deviceId: '' } as DomainEvent;
  const results = await api.batchPutEvents([impostor, fresh, broken]);

  expect(results.map(result => result.status)).toEqual(['exists', 'created', 'invalid']);
  // The impostor changed nothing: the stored event keeps its original payload.
  const [stored] = await api.batchGetEvents(['e-1']);
  expect(stored!.payload).toEqual({ epoch: 0 });
});

logicTest('fakeBackend events: purge deletes exactly one stream and reports the count', async ({ expect }) => {
  const fake = createFakeBackend({
    events: [
      domainEvent({ uuid: 'e-a1', streamId: 'run-a' }),
      domainEvent({ uuid: 'e-a2', streamId: 'run-a', seq: 2 }),
      domainEvent({ uuid: 'e-b1', streamId: 'run-b' }),
    ],
  });
  const api = clientOver(fake);
  expect(await api.purgeEventStream('run-a')).toBe(2);
  expect(await api.purgeEventStream('run-a')).toBe(0); // empty/foreign: 0, no error
  expect((await api.listEventUuids()).uuids).toEqual(['e-b1']);
  expect([...fake.state.events.keys()]).toEqual(['e-b1']); // the driver's uuids() view
});

// --- the full chain: real ApiClient + fake router + the real event store -------------

logicTest('sync v2 end-to-end: set-difference through ApiClient against the fake /api', async ({ expect }) => {
  const shared = domainEvent({ uuid: 'e-shared' });
  const cloudOnly = domainEvent({ uuid: 'e-cloud', seq: 2 });
  const fake = createFakeBackend({ events: [shared, cloudOnly] });
  const api = clientOver(fake);
  const store = new MemoryRecordStore();
  const quiet = new Emitter<EventMap>();
  await appendEvent(shared, { store, events: quiet });
  await appendEvent(domainEvent({ uuid: 'e-local', seq: 3 }), { store, events: quiet });

  const summary = await syncEvents({ api, store });

  expect(summary).toEqual({ pulled: 1, pushed: 1 });
  expect((await listAllEvents(store)).map(event => event.uuid).sort())
    .toEqual(['e-cloud', 'e-local', 'e-shared']);
  expect([...fake.state.events.keys()].sort()).toEqual(['e-cloud', 'e-local', 'e-shared']);

  // Immediately syncing again is a full no-op — immutability makes both-sides free.
  expect(await syncEvents({ api, store })).toEqual({ pulled: 0, pushed: 0 });
});

logicTest('sync v2 end-to-end: pulled wire events fold back byte-equal', async ({ expect }) => {
  const rich = domainEvent({
    uuid: 'e-rich', dependsOn: ['e-parent'], payload: { epoch: 7, acc: 0.97, valLoss: 0.12 },
  });
  const api = clientOver(createFakeBackend({ events: [rich] }));
  const store = new MemoryRecordStore();

  await syncEvents({ api, store });

  const [pulled] = await listAllEvents(store);
  expect(pulled).toEqual(rich); // snake_case wire trip left no trace
});
