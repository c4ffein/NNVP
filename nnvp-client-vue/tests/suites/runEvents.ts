/**
 * Run-event folding (lib/Training/runEvents), all logicTests: foldRun's
 * causal ordering ((deviceId, instanceId, seq) chains + dependsOn), orphan
 * tolerance (events are NEVER rejected), duplicate-delivery dedupe by uuid,
 * hidden/unhidden, the no-'running'-by-construction liveness rule (isStale),
 * and the deterministic legacy explosion (uuidv5-style content-addressed
 * uuids so two devices migrating the same RunRecord converge).
 */
import { logicTest } from '../harness/define';
import {
  deterministicUuid, foldRun, isStale, legacyRunEvents, orderEvents, STALE_AFTER_MS,
} from '../../src/lib/Training/runEvents';
import type { LegacyRunRecordLike, TrainingConfigSnapshot } from '../../src/lib/Training/runEvents';
import type { DomainEvent } from '../../src/lib/Events/domainEvent';

const config: TrainingConfigSnapshot = {
  dataset: 'MNIST',
  optimizer: 'rmsprop',
  optimizerParams: { learningRate: 0.01 },
  epochs: 3,
  loss: 'categoricalCrossentropy',
};

/** A stream event with sensible defaults; tests override what they assert. */
function makeEvent(overrides: Partial<DomainEvent> & { uuid: string }): DomainEvent {
  return {
    type: 'run.epoch',
    streamId: 'run-1',
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: 1,
    dependsOn: [],
    wallTime: '2026-07-20T10:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

function fullStream(): DomainEvent[] {
  return [
    makeEvent({
      uuid: 'e-start',
      type: 'run.started',
      seq: 1,
      wallTime: '2026-07-20T10:00:00.000Z',
      payload: { engineId: 'tfjs', config, graphJson: '{"layers":[]}' },
    }),
    makeEvent({
      uuid: 'e-epoch-0', seq: 2, dependsOn: ['e-start'], wallTime: '2026-07-20T10:00:10.000Z',
      payload: { epoch: 0, acc: 0.5, loss: 1.2 },
    }),
    makeEvent({
      uuid: 'e-epoch-1', seq: 3, dependsOn: ['e-epoch-0'], wallTime: '2026-07-20T10:00:20.000Z',
      payload: { epoch: 1, acc: 0.7, loss: 0.8, valAcc: 0.65, valLoss: 0.9 },
    }),
    makeEvent({
      uuid: 'e-finish', type: 'run.finished', seq: 4, dependsOn: ['e-epoch-1'],
      wallTime: '2026-07-20T10:00:30.000Z',
      payload: { outcome: 'completed', durationMs: 30000 },
    }),
  ];
}

// --- foldRun: the happy path ----------------------------------------------------

logicTest('foldRun: a complete stream folds into the full run view', ({ expect }) => {
  const fold = foldRun(fullStream());
  expect(fold.uuid).toBe('run-1');
  expect(fold.startedAt).toBe('2026-07-20T10:00:00.000Z');
  expect(fold.engineId).toBe('tfjs');
  expect(fold.config).toEqual(config);
  expect(fold.graphJson).toBe('{"layers":[]}');
  expect(fold.epochMetrics).toEqual([
    { epoch: 0, acc: 0.5, loss: 1.2 },
    { epoch: 1, acc: 0.7, loss: 0.8, valAcc: 0.65, valLoss: 0.9 },
  ]);
  expect(fold.outcome).toBe('completed');
  expect(fold.durationMs).toBe(30000);
  expect(fold.finishedAt).toBe('2026-07-20T10:00:30.000Z');
  expect(fold.hidden).toBe(false);
  expect(fold.lastEventAt).toBe('2026-07-20T10:00:30.000Z');
  expect(fold.eventCount).toBe(4);
});

logicTest('foldRun: arrival order is irrelevant — seq chains order the fold', ({ expect }) => {
  const shuffled = fullStream().reverse();
  expect(foldRun(shuffled)).toEqual(foldRun(fullStream()));
  // And the epochs really did come out in causal, not arrival, order.
  expect(foldRun(shuffled).epochMetrics.map(m => m.epoch)).toEqual([0, 1]);
});

logicTest('foldRun: duplicate delivery dedupes by uuid', ({ expect }) => {
  const events = fullStream();
  const doubled = [...events, ...events.map(event => ({ ...event }))];
  const fold = foldRun(doubled);
  expect(fold.eventCount).toBe(4);
  expect(fold.epochMetrics).toHaveLength(2);
});

// --- foldRun: orphans are views, never errors ------------------------------------

logicTest('foldRun: epochs whose run.started never arrived fold into a partial view', ({ expect }) => {
  const fold = foldRun([
    makeEvent({ uuid: 'e-epoch-9', seq: 5, payload: { epoch: 9, acc: 0.9 } }),
    makeEvent({ uuid: 'e-epoch-8', seq: 4, payload: { epoch: 8, acc: 0.8 } }),
  ]);
  expect(fold.uuid).toBe('run-1');
  expect(fold.startedAt).toBe(null);
  expect(fold.config).toBe(null);
  expect(fold.graphJson).toBe(null);
  expect(fold.epochMetrics.map(m => m.epoch)).toEqual([8, 9]); // seq-ordered
  expect(fold.outcome).toBe(null);
});

logicTest('foldRun: dependsOn pointing at an absent event is tolerated, not fatal', ({ expect }) => {
  const fold = foldRun([
    makeEvent({
      uuid: 'e-epoch-2', seq: 7, dependsOn: ['never-arrived'], payload: { epoch: 2, acc: 0.75 },
    }),
  ]);
  expect(fold.epochMetrics).toEqual([{ epoch: 2, acc: 0.75 }]);
});

logicTest('foldRun: a dependsOn cycle (malformed input) still folds every event', ({ expect }) => {
  const fold = foldRun([
    makeEvent({
      uuid: 'e-a', seq: 1, instanceId: 'i-a', dependsOn: ['e-b'],
      payload: { epoch: 0 }, wallTime: '2026-07-20T10:00:00.000Z',
    }),
    makeEvent({
      uuid: 'e-b', seq: 1, instanceId: 'i-b', dependsOn: ['e-a'],
      payload: { epoch: 1 }, wallTime: '2026-07-20T10:00:01.000Z',
    }),
  ]);
  expect(fold.epochMetrics).toHaveLength(2);
});

// --- foldRun: cross-instance ordering via dependsOn -------------------------------

logicTest('orderEvents: dependsOn orders across instances where wall clocks lie', ({ expect }) => {
  // Device B resumed after device A finished epoch 0, but B's clock is BEHIND
  // A's. dependsOn must win; wallTime must not reorder causality.
  const fromA = makeEvent({
    uuid: 'e-a1', deviceId: 'device-a', instanceId: 'i-a', seq: 1,
    payload: { epoch: 0 }, wallTime: '2026-07-20T12:00:00.000Z',
  });
  const fromB = makeEvent({
    uuid: 'e-b1', deviceId: 'device-b', instanceId: 'i-b', seq: 1,
    dependsOn: ['e-a1'], payload: { epoch: 1 }, wallTime: '2026-07-20T09:00:00.000Z',
  });
  expect(orderEvents([fromB, fromA]).map(event => event.uuid)).toEqual(['e-a1', 'e-b1']);
});

logicTest('orderEvents: concurrent instances tie-break deterministically', ({ expect }) => {
  const one = makeEvent({
    uuid: 'e-one', instanceId: 'i-1', seq: 1, wallTime: '2026-07-20T10:00:05.000Z',
  });
  const two = makeEvent({
    uuid: 'e-two', instanceId: 'i-2', seq: 1, wallTime: '2026-07-20T10:00:01.000Z',
  });
  // No causal edge between them: earlier wallTime displays first — and the
  // order is the same whichever way they arrive.
  expect(orderEvents([one, two]).map(e => e.uuid)).toEqual(['e-two', 'e-one']);
  expect(orderEvents([two, one]).map(e => e.uuid)).toEqual(['e-two', 'e-one']);
});

// --- foldRun: hidden / unhidden ---------------------------------------------------

logicTest('foldRun: run.hidden hides, run.unhidden brings back — causal last wins', ({ expect }) => {
  const base = fullStream();
  const hidden = foldRun([...base, makeEvent({
    uuid: 'e-hide', type: 'run.hidden', seq: 5, dependsOn: ['e-finish'], payload: {},
  })]);
  expect(hidden.hidden).toBe(true);
  const unhidden = foldRun([...base,
    makeEvent({ uuid: 'e-hide', type: 'run.hidden', seq: 5, dependsOn: ['e-finish'], payload: {} }),
    makeEvent({ uuid: 'e-unhide', type: 'run.unhidden', seq: 6, dependsOn: ['e-hide'], payload: {} }),
  ]);
  expect(unhidden.hidden).toBe(false);
});

// --- liveness: no 'running' exists, staleness is a pure display rule --------------

logicTest('foldRun: without run.finished the outcome is null — never "running"', ({ expect }) => {
  const fold = foldRun(fullStream().slice(0, 3)); // started + 2 epochs, no finish
  expect(fold.outcome).toBe(null);
  expect(fold.finishedAt).toBe(null);
  expect(fold.lastEventAt).toBe('2026-07-20T10:00:20.000Z');
  expect(JSON.stringify(fold)).not.toContain('running');
});

logicTest('isStale: unfinished goes stale after the threshold, finished never does', ({ expect }) => {
  const lastEventAt = '2026-07-20T10:00:20.000Z';
  const at = (offsetMs: number) => Date.parse(lastEventAt) + offsetMs;
  const unfinished = { outcome: null, lastEventAt };
  expect(isStale(unfinished, at(1000))).toBe(false); // just spoke
  expect(isStale(unfinished, at(STALE_AFTER_MS - 1))).toBe(false);
  expect(isStale(unfinished, at(STALE_AFTER_MS))).toBe(true);
  // A finished run is done, not stale — no matter how old.
  expect(isStale({ outcome: 'completed' as const, lastEventAt }, at(STALE_AFTER_MS * 100))).toBe(false);
  // No datable last event: no evidence of liveness.
  expect(isStale({ outcome: null, lastEventAt: null }, at(0))).toBe(true);
  expect(isStale({ outcome: null, lastEventAt: 'not-a-date' }, at(0))).toBe(true);
});

// --- the deterministic legacy explosion --------------------------------------------

function legacyRecord(overrides: Partial<LegacyRunRecordLike> = {}): LegacyRunRecordLike {
  return {
    uuid: 'run-legacy-1',
    startedAt: '2026-07-01T08:00:00.000Z',
    finishedAt: '2026-07-01T08:05:00.000Z',
    outcome: 'completed',
    engineId: 'tfjs',
    config,
    graphJson: '{"layers":[]}',
    epochMetrics: [
      { epoch: 0, acc: 0.5, loss: 1.0 },
      { epoch: 1, acc: 0.8, loss: 0.4 },
    ],
    durationMs: 300000,
    ...overrides,
  };
}

logicTest('deterministicUuid: same name same uuid, different names different uuids', async ({ expect }) => {
  const first = await deterministicUuid('run-1:started');
  expect(await deterministicUuid('run-1:started')).toBe(first);
  expect(await deterministicUuid('run-1:epoch:0')).not.toBe(first);
  // Real uuid shape, version 5 bits stamped (name-based — NOT randomUUID).
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

logicTest('legacyRunEvents: two explosions of the same record are byte-identical', async ({ expect }) => {
  const first = await legacyRunEvents(legacyRecord());
  const second = await legacyRunEvents(legacyRecord());
  expect(second).toEqual(first); // uuids, identity fields, everything
  expect(first.map(event => event.type)).toEqual([
    'run.started', 'run.epoch', 'run.epoch', 'run.finished',
  ]);
  // Content-addressed uuids — the convergence contract two devices rely on.
  expect(first[0]!.uuid).toBe(await deterministicUuid('run-legacy-1:started'));
  expect(first[1]!.uuid).toBe(await deterministicUuid('run-legacy-1:epoch:0'));
  expect(first[3]!.uuid).toBe(await deterministicUuid('run-legacy-1:finished'));
});

logicTest('legacyRunEvents: the fold of the explosion mirrors the legacy record', async ({ expect }) => {
  const fold = foldRun(await legacyRunEvents(legacyRecord({ error: undefined })));
  expect(fold.uuid).toBe('run-legacy-1');
  expect(fold.startedAt).toBe('2026-07-01T08:00:00.000Z');
  expect(fold.engineId).toBe('tfjs');
  expect(fold.config).toEqual(config);
  expect(fold.epochMetrics.map(m => m.epoch)).toEqual([0, 1]);
  expect(fold.outcome).toBe('completed');
  expect(fold.durationMs).toBe(300000);
  expect(fold.finishedAt).toBe('2026-07-01T08:05:00.000Z');
});

logicTest('legacyRunEvents: a stale "running" record explodes WITHOUT a finish event', async ({ expect }) => {
  // The old bug: a crashed run frozen as outcome:'running' forever. Its
  // explosion has no run.finished, so the fold honestly says "no outcome,
  // last event long ago" — and isStale flags it.
  const events = await legacyRunEvents(legacyRecord({
    outcome: 'running', finishedAt: undefined, durationMs: undefined,
  }));
  expect(events.map(event => event.type)).toEqual(['run.started', 'run.epoch', 'run.epoch']);
  const fold = foldRun(events);
  expect(fold.outcome).toBe(null);
  expect(isStale(fold, Date.parse('2026-07-26T00:00:00Z'))).toBe(true);
});

logicTest('foldRun: carries the run.started hardware payload; absent means null', ({ expect }) => {
  const withHardware = fullStream();
  (withHardware[0]!.payload as Record<string, unknown>).hardware = { backend: 'webgl', cores: 8 };
  expect(foldRun(withHardware).hardware).toEqual({ backend: 'webgl', cores: 8 });
  expect(foldRun(fullStream()).hardware).toBeNull();
});

logicTest('foldRun: carries the run.started lineage parent; absent means null', ({ expect }) => {
  const withParent = fullStream();
  (withParent[0]!.payload as Record<string, unknown>).parent = 'parent-doc-hash';
  expect(foldRun(withParent).parent).toBe('parent-doc-hash');
  expect(foldRun(fullStream()).parent).toBeNull();
});
