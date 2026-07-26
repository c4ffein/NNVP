/**
 * The typed event core (PLAN.md Phase A), all logicTests: the emitter
 * (on/off/emit, one-level prefix wildcard, unknown-type hook), the retention
 * registry (the ONE auditable table), and identity (stable deviceId over an
 * injected storage, per-instance instanceId, monotonic seq).
 */
import { logicTest } from '../harness/define';
import { Emitter } from '../../src/lib/Events/emitter';
import {
  EVENT_RETENTION, isKnownEventType, retentionOf,
} from '../../src/lib/Events/registry';
import { DEVICE_ID_STORAGE_KEY, Identity, identity, nextSeq } from '../../src/lib/Events/identity';
import type { StorageLike } from '../../src/lib/Backend/apiClient';

// --- emitter: on / off / emit -------------------------------------------------

logicTest('emitter: emit delivers the payload to every subscriber of the type', ({ expect }) => {
  const emitter = new Emitter();
  const seen: unknown[] = [];
  emitter.on('training.epoch', payload => seen.push(payload));
  emitter.on('training.epoch', payload => seen.push(payload));

  emitter.emit('training.epoch', { epoch: 3 });

  expect(seen).toEqual([{ epoch: 3 }, { epoch: 3 }]);
});

logicTest('emitter: handlers receive the concrete event type as second argument', ({ expect }) => {
  const emitter = new Emitter();
  const types: string[] = [];
  emitter.on('training.epoch', (_payload, type) => types.push(type));

  emitter.emit('training.epoch', null);

  expect(types).toEqual(['training.epoch']);
});

logicTest('emitter: other types and unsubscribed handlers are not called', ({ expect }) => {
  const emitter = new Emitter();
  let calls = 0;
  const handler = () => { calls += 1; };
  emitter.on('training.epoch', handler);

  emitter.emit('training.finished', null); // different type: not delivered
  expect(calls).toBe(0);

  emitter.emit('training.epoch', null);
  expect(calls).toBe(1);

  emitter.off('training.epoch', handler);
  emitter.emit('training.epoch', null);
  expect(calls).toBe(1); // removed: no further deliveries
});

logicTest('emitter: on() returns an unsubscribe function', ({ expect }) => {
  const emitter = new Emitter();
  let calls = 0;
  const off = emitter.on('ui.ping', () => { calls += 1; });

  emitter.emit('ui.ping', null);
  off();
  emitter.emit('ui.ping', null);

  expect(calls).toBe(1);
  expect(emitter.listenerCount('ui.ping')).toBe(0);
});

logicTest('emitter: listenerCount reflects subscribe and unsubscribe', ({ expect }) => {
  const emitter = new Emitter();
  const handler = () => {};
  expect(emitter.listenerCount('a.b')).toBe(0);
  emitter.on('a.b', handler);
  emitter.on('a.b', () => {});
  expect(emitter.listenerCount('a.b')).toBe(2);
  emitter.off('a.b', handler);
  expect(emitter.listenerCount('a.b')).toBe(1);
});

logicTest('emitter: a throwing handler never blocks the other subscribers', ({ expect }) => {
  const emitter = new Emitter();
  const seen: string[] = [];
  emitter.on('a.b', () => { throw new Error('bad subscriber'); });
  emitter.on('a.b', () => seen.push('second'));

  expect(() => emitter.emit('a.b', null)).not.toThrow();
  expect(seen).toEqual(['second']);
});

// --- emitter: one-level prefix wildcard ----------------------------------------

logicTest('emitter: a prefix wildcard receives every event of its namespace', ({ expect }) => {
  const emitter = new Emitter();
  const seen: [string, unknown][] = [];
  emitter.on('training.*', (payload, type) => seen.push([type, payload]));

  emitter.emit('training.epoch', { epoch: 1 });
  emitter.emit('training.batch', { batch: 7 });
  emitter.emit('ui.open-training', null); // other namespace: not delivered

  expect(seen).toEqual([
    ['training.epoch', { epoch: 1 }],
    ['training.batch', { batch: 7 }],
  ]);
});

logicTest('emitter: exact and wildcard subscribers both fire, exact first', ({ expect }) => {
  const emitter = new Emitter();
  const order: string[] = [];
  emitter.on('training.*', () => order.push('wildcard'));
  emitter.on('training.epoch', () => order.push('exact'));

  emitter.emit('training.epoch', null);

  expect(order).toEqual(['exact', 'wildcard']);
});

logicTest('emitter: wildcard unsubscribe works like any other handler', ({ expect }) => {
  const emitter = new Emitter();
  let calls = 0;
  const off = emitter.on('training.*', () => { calls += 1; });
  emitter.emit('training.epoch', null);
  off();
  emitter.emit('training.epoch', null);
  expect(calls).toBe(1);
});

logicTest('emitter: an undotted type only reaches its exact subscribers', ({ expect }) => {
  const emitter = new Emitter();
  const seen: string[] = [];
  emitter.on('training.*', (_payload, type) => seen.push(type));
  emitter.on('training', (_payload, type) => seen.push(type));

  emitter.emit('training', null); // no '.' — no namespace to wildcard on

  expect(seen).toEqual(['training']);
});

// --- emitter: unknown types warn (via the hook) but still deliver ---------------

logicTest('emitter: an unknown type triggers the hook and is still delivered', ({ expect }) => {
  const warned: string[] = [];
  const emitter = new Emitter({
    isKnownType: type => type === 'known.type',
    onUnknownType: type => warned.push(type),
  });
  const seen: unknown[] = [];
  emitter.on('mystery.event', payload => seen.push(payload));

  emitter.emit('mystery.event', { still: 'delivered' });
  emitter.emit('known.type', null);

  expect(warned).toEqual(['mystery.event']); // known types never warn
  expect(seen).toEqual([{ still: 'delivered' }]); // delivery is never blocked
});

// --- registry: the one auditable retention table --------------------------------

logicTest('registry: the four migrated window events are registered as ephemeral', ({ expect }) => {
  expect(retentionOf('auth.changed')).toBe('ephemeral');
  expect(retentionOf('ui.start-tutorial')).toBe('ephemeral');
  expect(retentionOf('ui.open-training')).toBe('ephemeral');
  expect(retentionOf('ui.ask-assistant')).toBe('ephemeral');
});

logicTest('registry: isKnownEventType matches the table exactly', ({ expect }) => {
  for (const type of Object.keys(EVENT_RETENTION)) {
    expect(isKnownEventType(type)).toBe(true);
  }
  expect(isKnownEventType('nnvp:auth-changed')).toBe(false); // the old window names are gone
  expect(isKnownEventType('no-such.event')).toBe(false);
  expect(isKnownEventType('')).toBe(false);
});

logicTest('registry: every type is namespaced "a.b" with a valid retention', ({ expect }) => {
  const entries = Object.entries(EVENT_RETENTION);
  expect(entries.length).toBeGreaterThanOrEqual(4);
  for (const [type, retention] of entries) {
    expect(type).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
    expect(['ephemeral', 'stored']).toContain(retention);
  }
});

// --- identity: deviceId / instanceId / seq ---------------------------------------

function makeStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

logicTest('identity: deviceId is minted lazily and persisted under nnvp_device_id', ({ expect }) => {
  const storage = makeStorage();
  const id = new Identity(storage);
  expect(storage.map.has(DEVICE_ID_STORAGE_KEY)).toBe(false); // not minted yet

  const deviceId = id.deviceId();

  expect(deviceId).toMatch(UUID_SHAPE);
  expect(storage.map.get(DEVICE_ID_STORAGE_KEY)).toBe(deviceId);
  expect(id.deviceId()).toBe(deviceId); // stable within the instance
});

logicTest('identity: deviceId is stable across instances sharing a storage', ({ expect }) => {
  const storage = makeStorage();
  const first = new Identity(storage).deviceId();
  const second = new Identity(storage).deviceId(); // "another page load"
  expect(second).toBe(first);
});

logicTest('identity: a stored deviceId is reused, never re-minted', ({ expect }) => {
  const storage = makeStorage({ [DEVICE_ID_STORAGE_KEY]: 'existing-device-id' });
  expect(new Identity(storage).deviceId()).toBe('existing-device-id');
  expect(storage.map.get(DEVICE_ID_STORAGE_KEY)).toBe('existing-device-id');
});

logicTest('identity: a broken storage still yields one stable session deviceId', ({ expect }) => {
  const broken: StorageLike = {
    getItem: () => { throw new Error('private mode'); },
    setItem: () => { throw new Error('private mode'); },
    removeItem: () => { throw new Error('private mode'); },
  };
  const id = new Identity(broken);
  const deviceId = id.deviceId();
  expect(deviceId).toMatch(UUID_SHAPE);
  expect(id.deviceId()).toBe(deviceId); // cached for the session
});

logicTest('identity: instanceId is fresh per instance, deviceId is not', ({ expect }) => {
  const storage = makeStorage();
  const a = new Identity(storage);
  const b = new Identity(storage);
  expect(a.instanceId).toMatch(UUID_SHAPE);
  expect(b.instanceId).toMatch(UUID_SHAPE);
  expect(a.instanceId).not.toBe(b.instanceId);
  expect(a.deviceId()).toBe(b.deviceId());
});

logicTest('identity: nextSeq is monotonic and counted per instance', ({ expect }) => {
  const a = new Identity(makeStorage());
  const b = new Identity(makeStorage());
  expect([a.nextSeq(), a.nextSeq(), a.nextSeq()]).toEqual([1, 2, 3]);
  expect(b.nextSeq()).toBe(1); // instances never share a counter
});

logicTest('identity: the module singleton serves ids and sequence numbers', ({ expect }) => {
  expect(identity.instanceId).toMatch(UUID_SHAPE);
  const first = nextSeq();
  expect(nextSeq()).toBe(first + 1);
});
