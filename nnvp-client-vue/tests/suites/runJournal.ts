/**
 * The run journal (lib/Training/runJournal), event-sourced: startRun appends
 * run.started immediately (a crash still leaves a trace), epochs append
 * run.epoch, finish appends run.finished exactly once, readers get folds
 * (never stored 'running' state), hideRun replaces local delete, and legacy
 * RunRecords explode deterministically — same input, same uuids, twice runs
 * add nothing, and the old records stay untouched.
 */
import { logicTest } from '../harness/define';
import {
  ensureLegacyRunsExploded, explodeLegacyRuns, getRun, hideRun, listRuns, startRun, unhideRun,
} from '../../src/lib/Training/runJournal';
import type { RunRecord, TrainingConfigSnapshot } from '../../src/lib/Training/runJournal';
import { listAllEvents, listEventsByStream } from '../../src/lib/Events/store';
import type { StoredDomainEvent } from '../../src/lib/Events/domainEvent';
import { deterministicUuid } from '../../src/lib/Training/runEvents';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';

const config: TrainingConfigSnapshot = {
  dataset: 'MNIST',
  optimizer: 'rmsprop',
  optimizerParams: { learningRate: 0.01 },
  epochs: 3,
  loss: 'categoricalCrossentropy',
};

const init = { engineId: 'tfjs', config, graphJson: '{"layers":[]}' };

logicTest('runJournal: startRun appends run.started immediately — the crash trace', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);

  const events = await listEventsByStream(handle.uuid, store);
  expect(events).toHaveLength(1);
  expect(events[0]!.type).toBe('run.started');
  expect(events[0]!.payload).toEqual({
    engineId: 'tfjs', config, graphJson: '{"layers":[]}',
  });

  const fold = await getRun(handle.uuid, store);
  expect(fold!.uuid).toBe(handle.uuid);
  expect(fold!.engineId).toBe('tfjs');
  expect(fold!.config).toEqual(config);
  // NO stored 'running' anywhere: an unfinished run just has no outcome yet.
  expect(fold!.outcome).toBe(null);
  expect(new Date(fold!.startedAt!).toISOString()).toBe(fold!.startedAt);
});

logicTest('runJournal: epoch() appends events and the fold lists them in order', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  await handle.epoch({ epoch: 0, acc: 0.5, loss: 1.2, valAcc: 0.45, valLoss: 1.3 });
  await handle.epoch({ epoch: 1, acc: 0.7, loss: 0.8 });

  const fold = await getRun(handle.uuid, store);
  expect(fold!.epochMetrics).toEqual([
    { epoch: 0, acc: 0.5, loss: 1.2, valAcc: 0.45, valLoss: 1.3 },
    { epoch: 1, acc: 0.7, loss: 0.8 },
  ]);
  expect(fold!.outcome).toBe(null);
  // The stream is a dependsOn chain: each event references its predecessor.
  const events = await listEventsByStream(handle.uuid, store);
  const started = events.find(event => event.type === 'run.started')!;
  const epochs = events.filter(event => event.type === 'run.epoch');
  expect(epochs.some(event => event.dependsOn.includes(started.uuid))).toBe(true);
});

logicTest('runJournal: finish(completed) stamps outcome, finishedAt and durationMs', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  await handle.epoch({ epoch: 0, acc: 0.9, loss: 0.3 });
  await handle.finish('completed');

  const fold = await getRun(handle.uuid, store);
  expect(fold!.outcome).toBe('completed');
  expect(fold!.error).toBe(undefined);
  expect(new Date(fold!.finishedAt!).toISOString()).toBe(fold!.finishedAt);
  expect(typeof fold!.durationMs).toBe('number');
  expect(fold!.durationMs! >= 0).toBe(true);
  expect(fold!.epochMetrics.length).toBe(1);
});

logicTest('runJournal: cancelled and error outcomes fold from their events', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const cancelled = await startRun(init, store);
  await cancelled.finish('cancelled');
  const errored = await startRun(init, store);
  await errored.finish('error', 'tensor shape mismatch');

  expect((await getRun(cancelled.uuid, store))!.outcome).toBe('cancelled');
  expect((await getRun(cancelled.uuid, store))!.error).toBe(undefined);
  const erroredFold = await getRun(errored.uuid, store);
  expect(erroredFold!.outcome).toBe('error');
  expect(erroredFold!.error).toBe('tensor shape mismatch');
  expect(typeof erroredFold!.durationMs).toBe('number');
});

logicTest('runJournal: a second finish appends nothing (idempotent)', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  await handle.finish('completed');
  const eventsAfterFirst = await listEventsByStream(handle.uuid, store);
  await handle.finish('error', 'late failure'); // cancel/error paths may double-fire
  expect(await listEventsByStream(handle.uuid, store)).toEqual(eventsAfterFirst);
  const fold = await getRun(handle.uuid, store);
  expect(fold!.outcome).toBe('completed');
  expect(fold!.error).toBe(undefined);
});

logicTest('runJournal: listRuns folds every stream, newest first', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const a = await startRun(init, store);
  const b = await startRun(init, store);
  const c = await startRun(init, store);
  // startRun stamps "now" for all three — rewrite the started events' display
  // stamps through the store to make the ordering unambiguous.
  const stamp = async (streamId: string, wallTime: string) => {
    const [started] = await listEventsByStream(streamId, store);
    const restamped: StoredDomainEvent = { ...started!, wallTime };
    await store.put('events', restamped);
  };
  await stamp(a.uuid, '2026-07-20T10:00:00.000Z');
  await stamp(b.uuid, '2026-07-20T12:00:00.000Z');
  await stamp(c.uuid, '2026-07-20T11:00:00.000Z');

  const runs = await listRuns(store);
  expect(runs.map(run => run.uuid)).toEqual([b.uuid, c.uuid, a.uuid]);
});

logicTest('runJournal: hideRun filters the run out; unhideRun brings it back', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const keep = await startRun(init, store);
  const hide = await startRun(init, store);
  await keep.finish('completed');
  await hide.finish('completed');

  await hideRun(hide.uuid, store);
  expect((await listRuns(store)).map(run => run.uuid)).toEqual([keep.uuid]);
  // Hidden, not deleted: the events are all still there…
  expect((await listEventsByStream(hide.uuid, store)).length).toBeGreaterThan(0);
  // …the fold knows, and includeHidden surfaces it.
  const all = await listRuns(store, { includeHidden: true });
  expect(all.find(run => run.uuid === hide.uuid)!.hidden).toBe(true);

  await unhideRun(hide.uuid, store);
  expect((await listRuns(store)).length).toBe(2);
});

// --- the legacy explosion -----------------------------------------------------------

function legacyRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    uuid: 'run-legacy-1',
    startedAt: '2026-07-01T08:00:00.000Z',
    finishedAt: '2026-07-01T08:05:00.000Z',
    outcome: 'completed',
    engineId: 'tfjs',
    config,
    graphJson: '{"layers":[]}',
    epochMetrics: [{ epoch: 0, acc: 0.5, loss: 1.0 }, { epoch: 1, acc: 0.8, loss: 0.4 }],
    durationMs: 300000,
    ...overrides,
  };
}

logicTest('legacy explosion: RunRecords become deterministic events; the records survive untouched', async ({ expect }) => {
  const store = new MemoryRecordStore();
  await store.put('runs', legacyRecord());

  await explodeLegacyRuns(store);

  const events = await listEventsByStream('run-legacy-1', store);
  expect(events.map(event => event.type).sort()).toEqual(
    ['run.epoch', 'run.epoch', 'run.finished', 'run.started'],
  );
  const uuids = events.map(event => event.uuid).sort();
  expect(uuids).toEqual([
    await deterministicUuid('run-legacy-1:started'),
    await deterministicUuid('run-legacy-1:epoch:0'),
    await deterministicUuid('run-legacy-1:epoch:1'),
    await deterministicUuid('run-legacy-1:finished'),
  ].sort());
  // The legacy store is READ-ONLY from now on: the record is exactly as it was.
  expect(await store.list<RunRecord>('runs')).toEqual([legacyRecord()]);
});

logicTest('legacy explosion: running it twice appends nothing new', async ({ expect }) => {
  const store = new MemoryRecordStore();
  await store.put('runs', legacyRecord());
  await explodeLegacyRuns(store);
  const first = await listAllEvents(store);
  await explodeLegacyRuns(store);
  expect(await listAllEvents(store)).toEqual(first);
});

logicTest('legacy explosion: two devices exploding the same record mint identical events', async ({ expect }) => {
  // Two devices = two independent stores over the same legacy record. Their
  // synthetic events must be byte-identical, so sync's uuid set-difference
  // sees ONE run, not two.
  const deviceA = new MemoryRecordStore();
  const deviceB = new MemoryRecordStore();
  await deviceA.put('runs', legacyRecord());
  await deviceB.put('runs', legacyRecord());
  await explodeLegacyRuns(deviceA);
  await explodeLegacyRuns(deviceB);
  const sortByUuid = (events: { uuid: string }[]) => [...events].sort(
    (a, b) => (a.uuid < b.uuid ? -1 : 1),
  );
  expect(sortByUuid(await listAllEvents(deviceB))).toEqual(sortByUuid(await listAllEvents(deviceA)));
});

logicTest('legacy explosion: localOnly records explode into localOnly events', async ({ expect }) => {
  // A cloud-deleted (detached) legacy record must not sneak back into the
  // cloud through its synthetic events.
  const store = new MemoryRecordStore();
  await store.put('runs', legacyRecord({ localOnly: true }));
  await explodeLegacyRuns(store);
  const events = await listEventsByStream('run-legacy-1', store);
  expect(events.length).toBeGreaterThan(0);
  expect(events.every(event => event.localOnly === true)).toBe(true);
});

logicTest('legacy explosion: listRuns folds legacy records in with event-native runs', async ({ expect }) => {
  const store = new MemoryRecordStore();
  await store.put('runs', legacyRecord()); // started 2026-07-01
  const native = await startRun(init, store); // started now (2026-07-26+)
  await native.finish('completed');

  const runs = await listRuns(store);
  expect(runs.map(run => run.uuid)).toEqual([native.uuid, 'run-legacy-1']);
  const legacy = runs[1]!;
  expect(legacy.outcome).toBe('completed');
  expect(legacy.epochMetrics).toHaveLength(2);
  expect(legacy.config).toEqual(config);
});

logicTest('legacy explosion: ensureLegacyRunsExploded memoizes per store', async ({ expect }) => {
  const store = new MemoryRecordStore();
  await store.put('runs', legacyRecord());
  const first = ensureLegacyRunsExploded(store);
  const second = ensureLegacyRunsExploded(store);
  expect(second).toBe(first); // one in-flight explosion, not two
  await first;
  expect((await listEventsByStream('run-legacy-1', store)).length).toBe(4);
});
