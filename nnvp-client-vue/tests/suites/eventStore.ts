/**
 * The domain event log (lib/Events/store): append persists into the 'events'
 * RecordStore then emits on the bus (one emitter, two retentions), dedupes by
 * uuid (duplicate delivery: no rewrite, no re-emit), refuses ephemeral types
 * at the call site, and carries the device-private localOnly flag. Plus the
 * registry's Phase C additions and the first real IndexedDB migration
 * (v1 -> v2 adds exactly the 'events' objectStore).
 */
import { logicTest } from '../harness/define';
import { Emitter } from '../../src/lib/Events/emitter';
import type { EventMap } from '../../src/lib/Events/emitter';
import { Identity } from '../../src/lib/Events/identity';
import { EVENT_RETENTION, retentionOf } from '../../src/lib/Events/registry';
import {
  appendEvent, listAllEvents, listEventsByStream, makeEvent, setStreamLocalOnly,
} from '../../src/lib/Events/store';
import type { DomainEvent, StoredDomainEvent } from '../../src/lib/Events/domainEvent';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import { RECORD_STORE_NAMES } from '../../src/lib/LocalStore/recordStore';
import { createMissingRecordStores, DB_VERSION } from '../../src/lib/LocalStore/indexedDbStore';
import type { UpgradableDb } from '../../src/lib/LocalStore/indexedDbStore';

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    uuid: crypto.randomUUID(),
    type: 'run.epoch',
    streamId: 'run-1',
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: 1,
    dependsOn: [],
    wallTime: '2026-07-20T10:00:00.000Z',
    payload: { epoch: 0, acc: 0.5 },
    ...overrides,
  };
}

// --- the registry additions -------------------------------------------------------

logicTest('registry: every run.* event type is declared stored', ({ expect }) => {
  const runTypes = ['run.started', 'run.epoch', 'run.finished', 'run.hidden', 'run.unhidden'] as const;
  for (const type of runTypes) expect(retentionOf(type)).toBe('stored');
  // The pre-existing ephemeral signals did not move.
  expect(EVENT_RETENTION['auth.changed']).toBe('ephemeral');
});

// --- appendEvent -------------------------------------------------------------------

logicTest('eventStore: append persists the event, then emits it on the bus', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const events = new Emitter<EventMap>();
  const delivered: unknown[] = [];
  events.on('run.epoch', payload => delivered.push(payload));
  const event = sampleEvent();

  const appended = await appendEvent(event, { store, events });

  expect(appended).toBe(true);
  expect(delivered).toEqual([event]); // the bus payload IS the envelope
  const stored = await store.list<StoredDomainEvent & { uuid: string }>('events');
  expect(stored).toEqual([event]);
});

logicTest('eventStore: appending a stored uuid is a silent no-op — no rewrite, no re-emit', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const events = new Emitter<EventMap>();
  let deliveries = 0;
  events.on('run.epoch', () => { deliveries += 1; });
  const event = sampleEvent();

  expect(await appendEvent(event, { store, events })).toBe(true);
  // Same uuid, even with different content: the stored event is immutable.
  const impostor = { ...event, payload: { epoch: 99 } };
  expect(await appendEvent(impostor, { store, events })).toBe(false);

  expect(deliveries).toBe(1);
  const stored = await store.list<StoredDomainEvent & { uuid: string }>('events');
  expect(stored).toHaveLength(1);
  expect((stored[0]!.payload as { epoch: number }).epoch).toBe(0);
});

logicTest('eventStore: appending an ephemeral-declared type throws (call-site bug)', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const events = new Emitter<EventMap>();
  const wrong = sampleEvent({ type: 'auth.changed' });
  await expect(appendEvent(wrong, { store, events })).rejects.toThrow(/ephemeral/);
  expect(await store.list('events')).toEqual([]);
});

logicTest('eventStore: localOnly appends store the flag but never emit it', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const events = new Emitter<EventMap>();
  const delivered: unknown[] = [];
  events.on('run.hidden', payload => delivered.push(payload));
  const event = sampleEvent({ type: 'run.hidden', payload: {} });

  await appendEvent(event, { store, events, localOnly: true });

  const stored = await store.list<StoredDomainEvent & { uuid: string }>('events');
  expect(stored[0]!.localOnly).toBe(true);
  // The bus payload is the event as minted — localOnly is store-private state.
  expect((delivered[0] as StoredDomainEvent).localOnly).toBe(undefined);
});

// --- reads + the localOnly stream flag ----------------------------------------------

logicTest('eventStore: listEventsByStream filters, listAllEvents does not', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const events = new Emitter<EventMap>();
  const mine = sampleEvent({ streamId: 'run-a' });
  const other = sampleEvent({ streamId: 'run-b' });
  await appendEvent(mine, { store, events });
  await appendEvent(other, { store, events });

  expect((await listEventsByStream('run-a', store)).map(e => e.uuid)).toEqual([mine.uuid]);
  expect((await listAllEvents(store)).map(e => e.uuid).sort())
    .toEqual([mine.uuid, other.uuid].sort());
});

logicTest('eventStore: setStreamLocalOnly flags every event of that stream only', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const events = new Emitter<EventMap>();
  const first = sampleEvent({ streamId: 'run-a', seq: 1 });
  const second = sampleEvent({ streamId: 'run-a', seq: 2 });
  const other = sampleEvent({ streamId: 'run-b' });
  for (const event of [first, second, other]) await appendEvent(event, { store, events });

  await setStreamLocalOnly('run-a', store);

  const flagged = await listEventsByStream('run-a', store);
  expect(flagged.every(event => event.localOnly === true)).toBe(true);
  const untouched = await listEventsByStream('run-b', store);
  expect(untouched[0]!.localOnly).toBe(undefined);
});

// --- makeEvent (identity wiring) -----------------------------------------------------

logicTest('eventStore: makeEvent mints identity fields and monotonic seqs', ({ expect }) => {
  const storage = new Map<string, string>();
  const identity = new Identity({
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
    removeItem: (key) => { storage.delete(key); },
  });
  const first = makeEvent('run.started', { streamId: 'run-1', payload: { engineId: 'tfjs' } }, identity);
  const second = makeEvent('run.epoch', {
    streamId: 'run-1', payload: { epoch: 0 }, dependsOn: [first.uuid],
  }, identity);

  expect(first.deviceId).toBe(identity.deviceId());
  expect(first.instanceId).toBe(identity.instanceId);
  expect(second.seq).toBe(first.seq + 1);
  expect(second.dependsOn).toEqual([first.uuid]);
  expect(first.uuid).not.toBe(second.uuid);
  expect(new Date(first.wallTime).toISOString()).toBe(first.wallTime);
});

// --- the first real IndexedDB migration (v1 -> v2) -----------------------------------

/** A structural IDBDatabase stand-in: happy-dom has no IndexedDB under bun,
 *  and the upgrade logic is pure over this slice anyway. */
function fakeDb(existing: string[]): UpgradableDb & { stores: string[] } {
  const stores = [...existing];
  return {
    stores,
    objectStoreNames: { contains: (name: string) => stores.includes(name) },
    createObjectStore(name: string) { stores.push(name); return {}; },
  };
}

logicTest('localStore migration: the schema is at v2 and declares the events store', ({ expect }) => {
  expect(DB_VERSION).toBe(2);
  expect(RECORD_STORE_NAMES).toEqual(['runs', 'conversations', 'events']);
});

logicTest('localStore migration: a v1 database gains exactly the events store', ({ expect }) => {
  const db = fakeDb(['runs', 'conversations']); // what DB_VERSION 1 created
  const created = createMissingRecordStores(db);
  expect(created).toEqual(['events']); // runs/conversations NOT recreated
  expect(db.stores).toEqual(['runs', 'conversations', 'events']);
});

logicTest('localStore migration: a fresh database gets every store at once', ({ expect }) => {
  const db = fakeDb([]);
  expect(createMissingRecordStores(db)).toEqual(['runs', 'conversations', 'events']);
});

logicTest('localStore migration: an already-v2 database is left alone', ({ expect }) => {
  const db = fakeDb(['runs', 'conversations', 'events']);
  expect(createMissingRecordStores(db)).toEqual([]);
  expect(db.stores).toEqual(['runs', 'conversations', 'events']);
});
