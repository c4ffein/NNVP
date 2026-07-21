/**
 * The local record store (lib/LocalStore): the RecordStore contract every
 * implementation must honor, exercised against MemoryRecordStore everywhere
 * and against IndexedDbRecordStore ONLY in worlds whose runtime provides
 * indexedDB (happy-dom under bun does not). The gate builds the suite list
 * from what the world provides — absent-runtime tests are simply never
 * registered, NOT registered-and-skipped.
 */
import { logicTest } from '../harness/define';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import type { RecordStore, StoredRecord } from '../../src/lib/LocalStore/recordStore';
import { IndexedDbRecordStore } from '../../src/lib/LocalStore/indexedDbStore';
import { createRecordStore, getRecordStore, setRecordStoreForTests } from '../../src/lib/LocalStore/db';

/**
 * The interface contract, registered once per available implementation.
 * Bodies use fresh uuids and clean up after themselves so they also hold
 * against a persistent shared database (the browser's real 'nnvp' DB).
 */
function registerRecordStoreContract(label: string, makeStore: () => RecordStore): void {
  logicTest(`localStore ${label}: put/get round-trip returns deep copies`, async ({ expect }) => {
    const store = makeStore();
    const uuid = crypto.randomUUID();
    const original = { uuid, config: { epochs: 3, tags: ['a', 'b'] } };
    await store.put('runs', original);
    original.config.epochs = 99; // mutating the source after put must not reach the store
    const fetched = await store.get<typeof original>('runs', uuid);
    expect(fetched).toEqual({ uuid, config: { epochs: 3, tags: ['a', 'b'] } });
    fetched!.config.tags.push('c'); // nor must mutating a returned copy
    const refetched = await store.get<typeof original>('runs', uuid);
    expect(refetched!.config.tags).toEqual(['a', 'b']);
    await store.delete('runs', uuid);
  });

  logicTest(`localStore ${label}: put upserts under the same uuid`, async ({ expect }) => {
    const store = makeStore();
    const uuid = crypto.randomUUID();
    const first = { uuid, title: 'first', turns: 1 };
    const rewritten = { uuid, title: 'rewritten', turns: 2 };
    await store.put('conversations', first);
    await store.put('conversations', rewritten);
    const fetched = await store.get<StoredRecord & { title: string; turns: number }>('conversations', uuid);
    expect(fetched).toEqual({ uuid, title: 'rewritten', turns: 2 });
    const matches = (await store.list('conversations')).filter(record => record.uuid === uuid);
    expect(matches.length).toBe(1);
    await store.delete('conversations', uuid);
  });

  logicTest(`localStore ${label}: list returns every record, per store`, async ({ expect }) => {
    const store = makeStore();
    const runA = { uuid: crypto.randomUUID(), n: 1 };
    const runB = { uuid: crypto.randomUUID(), n: 2 };
    const conversation = { uuid: crypto.randomUUID(), title: 'hello' };
    await store.put('runs', runA);
    await store.put('runs', runB);
    await store.put('conversations', conversation);
    const runUuids = (await store.list('runs')).map(record => record.uuid);
    expect(runUuids).toContain(runA.uuid);
    expect(runUuids).toContain(runB.uuid);
    expect(runUuids).not.toContain(conversation.uuid); // stores are isolated
    const conversationUuids = (await store.list('conversations')).map(record => record.uuid);
    expect(conversationUuids).toContain(conversation.uuid);
    expect(conversationUuids).not.toContain(runA.uuid);
    await store.delete('runs', runA.uuid);
    await store.delete('runs', runB.uuid);
    await store.delete('conversations', conversation.uuid);
  });

  logicTest(`localStore ${label}: delete removes, missing uuid reads null`, async ({ expect }) => {
    const store = makeStore();
    const uuid = crypto.randomUUID();
    expect(await store.get('runs', uuid)).toBe(null); // never stored
    await store.put('runs', { uuid });
    expect((await store.get('runs', uuid))?.uuid).toBe(uuid);
    await store.delete('runs', uuid);
    expect(await store.get('runs', uuid)).toBe(null);
    expect((await store.list('runs')).some(record => record.uuid === uuid)).toBe(false);
    await store.delete('runs', uuid); // deleting again is a harmless no-op
  });

  logicTest(`localStore ${label}: records are normalized to their JSON form`, async ({ expect }) => {
    const store = makeStore();
    const uuid = crypto.randomUUID();
    // Out-of-contract values (Date, undefined) are flattened exactly as the
    // backend sync will see them, so both impls behave like JSON round-trips.
    const stamp = new Date('2026-07-20T12:00:00Z');
    const record = {
      uuid, stamp, missing: undefined, nested: { arr: [1, null, 'two'], flag: true },
    };
    await store.put('runs', record);
    const fetched = await store.get<StoredRecord & Record<string, unknown>>('runs', uuid);
    expect(fetched).toEqual(JSON.parse(JSON.stringify(record)));
    expect(fetched!.stamp).toBe(stamp.toISOString());
    expect(Object.prototype.hasOwnProperty.call(fetched, 'missing')).toBe(false);
    await store.delete('runs', uuid);
  });
}

registerRecordStoreContract('memory', () => new MemoryRecordStore());

logicTest('localStore memory: a fresh store starts empty', async ({ expect }) => {
  const store = new MemoryRecordStore();
  expect(await store.list('runs')).toEqual([]);
  expect(await store.list('conversations')).toEqual([]);
});

logicTest('localStore db: createRecordStore picks the implementation by factory presence', ({ expect }) => {
  expect(createRecordStore(undefined) instanceof MemoryRecordStore).toBe(true);
  // Selection only looks at presence; the factory is untouched until first use.
  const fakeFactory = {} as IDBFactory;
  expect(createRecordStore(fakeFactory) instanceof IndexedDbRecordStore).toBe(true);
});

logicTest('localStore db: getRecordStore memoizes and the test override swaps it', ({ expect }) => {
  setRecordStoreForTests(null); // start from a clean singleton
  const first = getRecordStore();
  expect(getRecordStore()).toBe(first); // memoized
  const injected = new MemoryRecordStore();
  setRecordStoreForTests(injected);
  expect(getRecordStore()).toBe(injected);
  setRecordStoreForTests(null);
  expect(getRecordStore()).not.toBe(injected); // back to a real store
  setRecordStoreForTests(null); // leave no injected state behind
});

// --- IndexedDB-backed half: registered ONLY where the runtime provides it. --
// happy-dom under bun exposes no indexedDB, so in that world these tests do
// not exist (building the list from the world beats skipping — see rules).
if (typeof indexedDB !== 'undefined') {
  registerRecordStoreContract('indexeddb', () => new IndexedDbRecordStore(indexedDB));

  logicTest('localStore db: getRecordStore uses IndexedDB when the runtime has it', ({ expect }) => {
    setRecordStoreForTests(null);
    expect(getRecordStore() instanceof IndexedDbRecordStore).toBe(true);
    setRecordStoreForTests(null);
  });

  logicTest('localStore indexeddb: records survive across store instances', async ({ expect }) => {
    // Two independent instances over the same factory see the same database —
    // the persistence MemoryRecordStore cannot give (its data dies with it).
    const writer = new IndexedDbRecordStore(indexedDB);
    const uuid = crypto.randomUUID();
    const record = { uuid, marker: 'persisted' };
    await writer.put('runs', record);
    const reader = new IndexedDbRecordStore(indexedDB);
    const fetched = await reader.get<StoredRecord & { marker: string }>('runs', uuid);
    expect(fetched).toEqual({ uuid, marker: 'persisted' });
    await reader.delete('runs', uuid);
    expect(await writer.get('runs', uuid)).toBe(null);
  });
}
