/**
 * Pause/resume: the tfjs engine's fit-options contract (epochs/initialEpoch,
 * warm weights and optimizer across stop()+refit) and the RunController state
 * machine (running → paused ⇄ running → done, chart continuity across
 * segments, absolute epoch numbering, cancel from both states).
 */
import { logicTest } from '../harness/define';
import type { Expect } from '../harness/define';
import RunController from '../../src/lib/Training/runController';
import type {
  TrainingCallbacks, TrainingDataset, TrainingSession,
} from '../../src/lib/Training/engine';
import { createTfjsEngine } from '../../src/lib/Training/tfjsEngine';

type Tfjs = typeof import('@tensorflow/tfjs');

// Same lazy + muted tfjs setup as tests/suites/trainingEngine.ts.
let tf = null as unknown as Tfjs;

async function setup(expect: Expect): Promise<void> {
  if (!tf) {
    const muted = (['log', 'warn', 'error'] as const).map((level) => {
      const original = console[level];
      console[level] = () => {};
      return [level, original] as const;
    });
    try {
      tf = await import('@tensorflow/tfjs');
      await tf.setBackend('cpu');
      await tf.ready();
      tf.scalar(0).dispose();
    } finally {
      for (const [level, original] of muted) console[level] = original;
    }
  }
  expect(tf.getBackend()).toBe('cpu');
}

const GENERATED_CODE = [
  'function createModel() {',
  '  const model = tf.sequential();',
  "  model.add(tf.layers.dense({ units: 4, activation: 'softmax', inputShape: [3] }));",
  '  return model;',
  '}',
].join('\n');

function makeDataset(): TrainingDataset {
  return {
    shape: [3],
    trainSliceSize: 16,
    testSliceSize: 8,
    nextTrainBatch: (n: number) => ({
      xs: tf.zeros([n, 3]),
      labels: tf.oneHot(tf.zeros([n], 'int32'), 4),
    }),
    nextTestBatch: (n: number) => ({
      xs: tf.zeros([n, 3]),
      labels: tf.oneHot(tf.zeros([n], 'int32'), 4),
    }),
  };
}

async function prepareSession(epochs: number): Promise<TrainingSession> {
  (window as Window & { tf?: unknown }).tf = tf;
  const engine = createTfjsEngine({ loadTf: async () => tf });
  return engine.prepare(null, {
    generateCode: () => GENERATED_CODE,
    optimizer: 'adam',
    optimizerParams: {},
    loss: 'categoricalCrossentropy',
    epochs,
  });
}

logicTest('tfjsEngine pause contract: fit honors epochs/initialEpoch with absolute numbering', async ({ expect }) => {
  await setup(expect);
  const session = await prepareSession(5);
  const dataset = makeDataset();
  const seen: number[] = [];
  await session.fit(dataset, { onEpochEnd: (epoch) => { seen.push(epoch); } }, {
    epochs: 2, initialEpoch: 3,
  });
  expect(seen).toEqual([3, 4]);
});

logicTest('tfjsEngine pause contract: stop() then refit continues the SAME model warm', async ({ expect }) => {
  await setup(expect);
  const session = await prepareSession(4);
  const dataset = makeDataset();
  // Stop inside the first epoch: fit resolves early instead of rejecting.
  let stopped = false;
  await session.fit(dataset, {
    onBatchEnd: () => {
      if (!stopped) {
        stopped = true;
        session.stop();
      }
    },
  });
  const weightsAfterSegment1 = session.getWeights() as Record<string, Float32Array>;
  // Resume: model.stopTraining must be cleared, epochs numbered from 1.
  const seen: number[] = [];
  await session.fit(dataset, { onEpochEnd: (epoch) => { seen.push(epoch); } }, {
    epochs: 2, initialEpoch: 1,
  });
  expect(seen).toEqual([1, 2]);
  // Training continued: weights moved on from the paused snapshot.
  const weightsAfterSegment2 = session.getWeights() as Record<string, Float32Array>;
  const names = Object.keys(weightsAfterSegment1);
  expect(names.length).toBeGreaterThan(0);
  const moved = names.some(name => weightsAfterSegment1[name]!
    .some((value, i) => value !== weightsAfterSegment2[name]![i]));
  expect(moved).toBe(true);
});

// --- RunController against a scripted fake session --------------------------------

interface FakeFitCall {
  epochs: number | undefined;
  initialEpoch: number | undefined;
  dataset: string | undefined;
}

/**
 * A fake session whose fit() reports one batch + one epoch per epoch asked,
 * respecting stop() between epochs — enough to script pause scenarios without
 * tfjs. Each "epoch" reports loss = 1 / (absolute epoch + 1).
 */
function makeFakeSession(): { session: TrainingSession; fitCalls: FakeFitCall[] } {
  const fitCalls: FakeFitCall[] = [];
  let stopRequested = false;
  const session: TrainingSession = {
    model: {},
    graphJson: null,
    capabilities: { dynamicBatch: true, liveLr: true, canPause: true },
    async fit(dataset: TrainingDataset, callbacks: TrainingCallbacks, fitOptions?) {
      stopRequested = false;
      fitCalls.push({
        epochs: fitOptions?.epochs,
        initialEpoch: fitOptions?.initialEpoch,
        dataset: (dataset as { label?: string }).label,
      });
      const first = fitOptions?.initialEpoch ?? 0;
      const count = fitOptions?.epochs ?? 1;
      for (let epoch = first; epoch < first + count; epoch += 1) {
        // Macrotask yield, like a real async fit: lets the test's own
        // setTimeout(0) interleave between epochs (a bare microtask would
        // run the whole fit before any timer fires).
        await new Promise(resolve => setTimeout(resolve, 0));
        callbacks.onBatchEnd?.(0, { loss: 1 / (epoch + 1), acc: undefined });
        callbacks.onEpochEnd?.(epoch, {
          loss: 1 / (epoch + 1), acc: undefined, val_loss: undefined, val_acc: undefined,
        });
        if (stopRequested) return undefined;
      }
      return undefined;
    },
    getWeights: () => ({}),
    setWeights: () => {},
    stop() { stopRequested = true; },
  };
  return { session, fitCalls };
}

const makeCharts = () => ({
  chartData0: { labels: [] as number[], series: [] as { className: string; name: string; data: (number | undefined)[] }[] },
  chartData1: { labels: [] as number[], series: [] as { className: string; name: string; data: (number | undefined)[] }[] },
});

const namedDataset = (label: string) => ({
  label,
  shape: [1],
  nextTrainBatch: () => ({ xs: null, labels: null }),
  nextTestBatch: () => ({ xs: null, labels: null }),
} as unknown as TrainingDataset);

const fakeDataset = namedDataset('main');

logicTest('runController: pause splits the run, resume continues to completion with one epoch axis', async ({ expect }) => {
  const { session, fitCalls } = makeFakeSession();
  const { chartData0, chartData1 } = makeCharts();
  const states: string[] = [];
  const journal: number[] = [];
  const controller = new RunController({
    session,
    phases: [{ dataset: fakeDataset, epochs: 4, label: 'main' }],
    chartData0,
    chartData1,
    cancelRequested: () => false,
    stopError: 'cancelRequested',
    onEpoch: (m) => journal.push(m.epoch),
    onStateChange: (state) => states.push(state),
  });
  const done = controller.run();
  // Let the first epoch land, then pause.
  await new Promise(resolve => setTimeout(resolve, 0));
  const pausedState = await controller.pause();
  expect(pausedState).toBe('paused');
  expect(controller.state).toBe('paused');
  const epochsAtPause = controller.epochsCompleted;
  expect(epochsAtPause).toBeGreaterThan(0);
  expect(epochsAtPause).toBeLessThan(4);
  controller.resume();
  expect(await done).toBe('completed');
  expect(states).toEqual(['paused', 'running', 'done']);
  // Second segment resumed exactly where the first stopped.
  expect(fitCalls.length).toBe(2);
  expect(fitCalls[0]).toEqual({ epochs: 4, initialEpoch: 0, dataset: 'main' });
  expect(fitCalls[1]).toEqual({ epochs: 4 - epochsAtPause, initialEpoch: epochsAtPause, dataset: 'main' });
  // One absolute axis: journal is 0..3 with no repeats, charts accumulated all 4.
  expect(journal).toEqual([0, 1, 2, 3]);
  expect(chartData1.labels.length).toBe(4);
  const lossSeries = chartData1.series.find(series => series.name === 'loss')!;
  expect(lossSeries.data).toEqual([1, 1 / 2, 1 / 3, 1 / 4]);
});

logicTest('runController: cancel while paused ends the run as cancelled', async ({ expect }) => {
  const { session } = makeFakeSession();
  const { chartData0, chartData1 } = makeCharts();
  const controller = new RunController({
    session,
    phases: [{ dataset: fakeDataset, epochs: 4, label: 'main' }],
    chartData0,
    chartData1,
    cancelRequested: () => false,
    stopError: 'cancelRequested',
  });
  const done = controller.run();
  await new Promise(resolve => setTimeout(resolve, 0));
  await controller.pause();
  controller.cancel();
  expect(await done).toBe('cancelled');
  expect(controller.state).toBe('done');
});

logicTest('runController: cancel-by-flag while running keeps the historical cancelled outcome', async ({ expect }) => {
  const { session } = makeFakeSession();
  const { chartData0, chartData1 } = makeCharts();
  let cancelRequested = false;
  const controller = new RunController({
    session,
    phases: [{ dataset: fakeDataset, epochs: 100, label: 'main' }],
    chartData0,
    chartData1,
    cancelRequested: () => cancelRequested,
    stopError: 'cancelRequested',
  });
  const done = controller.run();
  await new Promise(resolve => setTimeout(resolve, 0));
  cancelRequested = true;
  expect(await done).toBe('cancelled');
});

logicTest('runController: pause after the last epoch resolves as completed, not paused', async ({ expect }) => {
  const { session } = makeFakeSession();
  const { chartData0, chartData1 } = makeCharts();
  const controller = new RunController({
    session,
    phases: [{ dataset: fakeDataset, epochs: 1, label: 'main' }],
    chartData0,
    chartData1,
    cancelRequested: () => false,
    stopError: 'cancelRequested',
  });
  const done = controller.run();
  // Pause lands after the only epoch already finished the run.
  const state = await controller.pause();
  expect(state).toBe('done');
  expect(await done).toBe('completed');
});

logicTest('runController: curriculum phases switch datasets on one epoch axis and report boundaries', async ({ expect }) => {
  const { session, fitCalls } = makeFakeSession();
  const { chartData0, chartData1 } = makeCharts();
  const boundaries: { index: number; label: string; epochsDone: number }[] = [];
  const journal: number[] = [];
  const controller = new RunController({
    session,
    phases: [
      { dataset: namedDataset('poetry'), epochs: 3, label: 'poetry' },
      { dataset: namedDataset('sonnets'), epochs: 2, label: 'sonnets' },
    ],
    chartData0,
    chartData1,
    cancelRequested: () => false,
    stopError: 'cancelRequested',
    onEpoch: (m) => journal.push(m.epoch),
    onPhaseEnd: (index, phase, epochsDone) => {
      boundaries.push({ index, label: phase.label, epochsDone });
    },
  });
  expect(controller.epochsTotal).toBe(5);
  expect(await controller.run()).toBe('completed');
  // One fit per phase, absolute initialEpoch across the switch.
  expect(fitCalls).toEqual([
    { epochs: 3, initialEpoch: 0, dataset: 'poetry' },
    { epochs: 2, initialEpoch: 3, dataset: 'sonnets' },
  ]);
  // Both phase ends reported (the last one included — final sample hook).
  expect(boundaries).toEqual([
    { index: 0, label: 'poetry', epochsDone: 3 },
    { index: 1, label: 'sonnets', epochsDone: 5 },
  ]);
  // Charts and journal never reset across the phase switch.
  expect(journal).toEqual([0, 1, 2, 3, 4]);
  expect(chartData1.labels.length).toBe(5);
});

logicTest('runController: pause works across a phase boundary', async ({ expect }) => {
  const { session, fitCalls } = makeFakeSession();
  const { chartData0, chartData1 } = makeCharts();
  // Deterministic pause point: request it from INSIDE the first epoch's
  // callback (a timer-based pause races the fake's own epoch timers).
  let pausePromise: Promise<unknown> | null = null;
  // eslint-disable-next-line prefer-const
  let controller: RunController;
  controller = new RunController({
    session,
    phases: [
      { dataset: namedDataset('poetry'), epochs: 2, label: 'poetry' },
      { dataset: namedDataset('sonnets'), epochs: 2, label: 'sonnets' },
    ],
    chartData0,
    chartData1,
    cancelRequested: () => false,
    stopError: 'cancelRequested',
    onEpoch: (m) => {
      if (m.epoch === 0) pausePromise = controller.pause();
    },
  });
  const done = controller.run();
  while (controller.state !== 'paused') {
    await new Promise(resolve => setTimeout(resolve, 0)); // eslint-disable-line no-await-in-loop
  }
  expect(await pausePromise!).toBe('paused');
  expect(controller.epochsCompleted).toBe(1);
  controller.resume();
  expect(await done).toBe('completed');
  // Segments: phase-1 (paused after epoch 1), phase-1 remainder, phase 2.
  expect(fitCalls.map(call => call.dataset)).toEqual(['poetry', 'poetry', 'sonnets']);
  expect(fitCalls[1]).toEqual({ epochs: 1, initialEpoch: 1, dataset: 'poetry' });
  expect(fitCalls[2]).toEqual({ epochs: 2, initialEpoch: 2, dataset: 'sonnets' });
});
