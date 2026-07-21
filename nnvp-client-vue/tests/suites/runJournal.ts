/**
 * The run journal (lib/Training/runJournal): lifecycle of a journaled
 * training run against an injected MemoryRecordStore — start persists a
 * 'running' record immediately, epochs append, finish stamps the outcome
 * exactly once, and the list/get/delete surface behaves.
 */
import { logicTest } from '../harness/define';
import {
  startRun, listRuns, getRun, deleteRunLocal,
} from '../../src/lib/Training/runJournal';
import type { RunRecord, TrainingConfigSnapshot } from '../../src/lib/Training/runJournal';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';

const config: TrainingConfigSnapshot = {
  dataset: 'MNIST',
  optimizer: 'rmsprop',
  optimizerParams: { learningRate: 0.01 },
  epochs: 3,
  loss: 'categoricalCrossentropy',
};

const init = { engineId: 'tfjs', config, graphJson: '{"layers":[]}' };

logicTest('runJournal: startRun persists a running record immediately', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  const record = await getRun(handle.uuid, store);
  expect(record).not.toBe(null);
  expect(record!.uuid).toBe(handle.uuid);
  expect(record!.outcome).toBe('running');
  expect(record!.engineId).toBe('tfjs');
  expect(record!.config).toEqual(config);
  expect(record!.graphJson).toBe('{"layers":[]}');
  expect(record!.epochMetrics).toEqual([]);
  // startedAt is a real ISO timestamp; nothing is stamped before finish.
  expect(new Date(record!.startedAt).toISOString()).toBe(record!.startedAt);
  expect(record!.finishedAt).toBe(undefined);
  expect(record!.durationMs).toBe(undefined);
});

logicTest('runJournal: epoch() appends and persists metrics in order', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  await handle.epoch({ epoch: 0, acc: 0.5, loss: 1.2, valAcc: 0.45, valLoss: 1.3 });
  await handle.epoch({ epoch: 1, acc: 0.7, loss: 0.8 });
  const record = await getRun(handle.uuid, store);
  expect(record!.epochMetrics).toEqual([
    { epoch: 0, acc: 0.5, loss: 1.2, valAcc: 0.45, valLoss: 1.3 },
    { epoch: 1, acc: 0.7, loss: 0.8 },
  ]);
  expect(record!.outcome).toBe('running');
});

logicTest('runJournal: finish(completed) stamps outcome, finishedAt and durationMs', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  await handle.epoch({ epoch: 0, acc: 0.9, loss: 0.3 });
  await handle.finish('completed');
  const record = await getRun(handle.uuid, store);
  expect(record!.outcome).toBe('completed');
  expect(record!.error).toBe(undefined);
  expect(new Date(record!.finishedAt!).toISOString()).toBe(record!.finishedAt);
  expect(typeof record!.durationMs).toBe('number');
  expect(record!.durationMs! >= 0).toBe(true);
  expect(record!.epochMetrics.length).toBe(1);
});

logicTest('runJournal: cancelled and error outcomes are journaled', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const cancelled = await startRun(init, store);
  await cancelled.finish('cancelled');
  const errored = await startRun(init, store);
  await errored.finish('error', 'tensor shape mismatch');
  const cancelledRecord = await getRun(cancelled.uuid, store);
  expect(cancelledRecord!.outcome).toBe('cancelled');
  expect(cancelledRecord!.error).toBe(undefined);
  const erroredRecord = await getRun(errored.uuid, store);
  expect(erroredRecord!.outcome).toBe('error');
  expect(erroredRecord!.error).toBe('tensor shape mismatch');
  expect(typeof erroredRecord!.durationMs).toBe('number');
});

logicTest('runJournal: a second finish is a no-op (idempotent)', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const handle = await startRun(init, store);
  await handle.finish('completed');
  const first = await getRun(handle.uuid, store);
  await handle.finish('error', 'late failure'); // cancel/error paths may double-fire
  const second = await getRun(handle.uuid, store);
  expect(second).toEqual(first);
  expect(second!.outcome).toBe('completed');
  expect(second!.error).toBe(undefined);
});

logicTest('runJournal: listRuns returns newest first by startedAt', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const a = await startRun(init, store);
  const b = await startRun(init, store);
  const c = await startRun(init, store);
  // startRun stamps "now" for all three — rewrite startedAt through the store
  // (put upserts) to make the ordering unambiguous.
  const stamp = async (uuid: string, startedAt: string) => {
    const record: RunRecord = { ...(await getRun(uuid, store))!, startedAt };
    await store.put('runs', record);
  };
  await stamp(a.uuid, '2026-07-20T10:00:00.000Z');
  await stamp(b.uuid, '2026-07-20T12:00:00.000Z');
  await stamp(c.uuid, '2026-07-20T11:00:00.000Z');
  const runs = await listRuns(store);
  expect(runs.map((run: RunRecord) => run.uuid)).toEqual([b.uuid, c.uuid, a.uuid]);
});

logicTest('runJournal: deleteRunLocal removes the record', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const keep = await startRun(init, store);
  const drop = await startRun(init, store);
  await deleteRunLocal(drop.uuid, store);
  expect(await getRun(drop.uuid, store)).toBe(null);
  expect(await getRun(keep.uuid, store)).not.toBe(null);
  expect((await listRuns(store)).length).toBe(1);
});
