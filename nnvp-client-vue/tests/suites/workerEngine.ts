/**
 * The Web Worker training engine (src/lib/Training/workerEngine +
 * trainingWorkerHost + workerProtocol), driven without a browser: the typed
 * protocol's transferable declarations and version guard, the buildOptimizer
 * extraction regression, and the full prepare/fit/cancel/weights lifecycle
 * with the REAL worker host (real tfjs on the cpu backend) connected to the
 * engine through an in-process fake worker pair — exactly the tinygradEngine
 * suite's pattern. The real `new Worker(...)` boot, the in-worker backend
 * pick (webgl → cpu) and the settings-driven TrainingZone wiring stay
 * browser-only.
 */
import { logicTest } from '../harness/define';
import type { Expect } from '../harness/define';
import { TrainingPrepareError } from '../../src/lib/Training/engine';
import type {
  BatchLogs, EpochLogs, NamedWeights, TrainingDataset, TrainingPrepareOptions,
} from '../../src/lib/Training/engine';
import {
  PROTOCOL_VERSION, checkProtocolVersion, transferablesOf,
} from '../../src/lib/Training/workerProtocol';
import type { WorkerCommand, WorkerEvent } from '../../src/lib/Training/workerProtocol';
import { createTrainingWorkerHost } from '../../src/lib/Training/trainingWorkerHost';
import { createWorkerEngine } from '../../src/lib/Training/workerEngine';
import type { TrainingWorkerLike } from '../../src/lib/Training/workerEngine';
import {
  buildOptimizer, buildOptimizerConfig, filterOptimizerParams,
} from '../../src/lib/Training/optimizers';
import { buildOptimizer as buildOptimizerFromTfjsEngine } from '../../src/lib/Training/tfjsEngine';
import { SETTINGS_DEFAULTS } from '../../src/lib/Settings/settings';
import { loadTf } from '../../src/lib/tf/loadTf';
import Dataset from '../../src/lib/JSDatasets/google-data-loader';
import TextDataset from '../../src/lib/JSDatasets/text-data-loader';
import { encodeText } from '../../src/lib/JSDatasets/text-vocab';

type Tfjs = typeof import('@tensorflow/tfjs');

// Same lazy + muted tfjs setup as tests/suites/trainingEngine.ts (see the
// rationale there); null until the first test awaits setup().
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

// The same shrunk generateJavascriptNoSave output the tfjs-engine suite uses.
// Inside the worker host, `tf` enters through the eval wrapper's PARAMETER
// (there is no window in a worker) — this code must see it all the same.
const GENERATED_CODE = [
  'function createModel() {',
  '  const model = tf.sequential();',
  "  model.add(tf.layers.dense({ units: 8, activation: 'relu', inputShape: [4] }));",
  "  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));",
  '  return model;',
  '}',
].join('\n');

function makeOpts(overrides: Partial<TrainingPrepareOptions> = {}): TrainingPrepareOptions {
  return {
    generateCode: () => GENERATED_CODE,
    optimizer: 'adam',
    optimizerParams: {},
    loss: 'categoricalCrossentropy',
    epochs: 2,
    batchSize: 16,
    ...overrides,
  };
}

/**
 * An in-process worker pair: the engine's TrainingWorkerLike surface wired
 * straight to the REAL worker host. Commands are delivered on a microtask
 * (like a real postMessage); host events are delivered synchronously so a
 * mid-fit stop() lands before the next batch, deterministically.
 */
function makeWorkerPair({ loadTf = async () => tf as unknown }: { loadTf?: () => Promise<unknown> } = {}) {
  const worker = {
    posted: [] as WorkerCommand[],
    onmessage: null as TrainingWorkerLike['onmessage'],
    onerror: null as TrainingWorkerLike['onerror'],
    postMessage(command: WorkerCommand) {
      this.posted.push(command);
      queueMicrotask(() => { void host.handle(command); });
    },
  };
  const host = createTrainingWorkerHost({
    loadTf,
    post: (event: WorkerEvent) => { worker.onmessage?.({ data: event } as MessageEvent<WorkerEvent>); },
  });
  return worker;
}

/**
 * A dataset exposing ONLY the raw per-fit draws the worker engine consumes
 * (the tensor-batch methods trap — the worker path must never touch tf on
 * the main thread). xs values are deterministic, labels cycle the classes.
 */
function makeRawSliceDataset({
  pixels = 4, numClasses = 3, trainSliceSize = 64, testSliceSize = 16,
} = {}) {
  const draws: Array<[string, number]> = [];
  const draw = (kind: string) => (size: number) => {
    draws.push([kind, size]);
    const xs = new Float32Array(size * pixels);
    for (let i = 0; i < xs.length; i += 1) xs[i] = (i % 23) / 23;
    const labels = new Int32Array(size);
    for (let i = 0; i < size; i += 1) labels[i] = i % numClasses;
    return { xs, labels };
  };
  const dataset = {
    shape: [pixels],
    numClasses,
    trainSliceSize,
    testSliceSize,
    nextTrainBatchRaw: draw('train'),
    nextTestBatchRaw: draw('test'),
    nextTrainBatch() { throw new Error('the worker engine must not use the tensor batch path'); },
    nextTestBatch() { throw new Error('the worker engine must not use the tensor batch path'); },
  } as unknown as TrainingDataset;
  return { dataset, draws };
}

// The thrown value's shape IS what each assertion probes (message / stage /
// cause / generatedCode) — localized any at this seam.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rejection = async (promise: Promise<unknown> | unknown): Promise<any> => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected the promise to reject');
};

/** Wait until the microtask/macrotask relay between engine and host settles. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// --- The protocol itself -------------------------------------------------------

logicTest('workerProtocol: each message declares exactly the buffers whose ownership moves', ({ expect }) => {
  const fit: WorkerCommand = {
    v: PROTOCOL_VERSION,
    id: 1,
    type: 'fit',
    trainXs: new Float32Array(8),
    trainLabels: new Int32Array(2),
    testXs: new Float32Array(4),
    testLabels: new Int32Array(1),
    trainCount: 2,
    testCount: 1,
    shape: [4],
    numClasses: 3,
    batchSize: 2,
    epochs: 1,
    initialEpoch: 0,
  };
  // The fit slices are freshly drawn per fit — transferred, never copied.
  expect(transferablesOf(fit)).toEqual([
    fit.trainXs.buffer, fit.trainLabels.buffer, fit.testXs.buffer, fit.testLabels.buffer,
  ]);
  // Worker-minted payloads (weights snapshot, logits) transfer out too; the
  // shared buffer of two views is declared once.
  const shared = new Float32Array(8);
  const weights: WorkerEvent = {
    v: PROTOCOL_VERSION,
    id: 2,
    type: 'weights',
    weights: { a: shared.subarray(0, 4) as Float32Array, b: shared.subarray(4) as Float32Array },
  };
  expect(transferablesOf(weights)).toEqual([shared.buffer]);
  const logits: WorkerEvent = { v: PROTOCOL_VERSION, id: 3, type: 'logits', x: new Float32Array(6) };
  expect(transferablesOf(logits)).toEqual([logits.x.buffer]);
  // Caller-owned arrays must NOT be transferred: setWeights values and the
  // evaluateLogits input may be views into buffers the caller keeps using
  // (abBenchmark feeds subarrays) — those cross by copy, deliberately.
  const setWeights: WorkerCommand = {
    v: PROTOCOL_VERSION, id: 4, type: 'setWeights', weights: { a: new Float32Array(4) },
  };
  expect(transferablesOf(setWeights)).toEqual([]);
  const evalLogits: WorkerCommand = { v: PROTOCOL_VERSION, id: 5, type: 'evalLogits', x: new Float32Array(4) };
  expect(transferablesOf(evalLogits)).toEqual([]);
  // Control messages carry no buffers at all.
  expect(transferablesOf({ v: PROTOCOL_VERSION, id: 6, type: 'stop' })).toEqual([]);
  expect(transferablesOf({ v: PROTOCOL_VERSION, id: 7, type: 'fitDone' })).toEqual([]);
});

logicTest('workerProtocol: a fit command survives its structured-clone transfer', ({ expect }) => {
  const trainXs = Float32Array.from([1, 2, 3, 4]);
  const fit: WorkerCommand = {
    v: PROTOCOL_VERSION,
    id: 1,
    type: 'fit',
    trainXs,
    trainLabels: Int32Array.from([2]),
    testXs: Float32Array.from([5, 6, 7, 8]),
    testLabels: Int32Array.from([0]),
    trainCount: 1,
    testCount: 1,
    shape: [4],
    numClasses: 3,
    batchSize: 1,
    epochs: 2,
    initialEpoch: 1,
  };
  const clone = structuredClone(fit, { transfer: transferablesOf(fit) as ArrayBuffer[] });
  expect(Array.from(clone.trainXs)).toEqual([1, 2, 3, 4]);
  expect(Array.from(clone.trainLabels)).toEqual([2]);
  expect(clone.initialEpoch).toBe(1);
  expect(clone.v).toBe(PROTOCOL_VERSION);
  // Ownership actually moved: the sender's view is detached, not copied.
  expect(trainXs.length).toBe(0);
});

logicTest('workerProtocol: the version guard accepts v1 and names anything else', ({ expect }) => {
  expect(checkProtocolVersion({ v: PROTOCOL_VERSION, id: 1, type: 'stop' })).toBe(null);
  expect(checkProtocolVersion({ v: 2, id: 1, type: 'stop' })).toContain('2');
  expect(checkProtocolVersion({ id: 1, type: 'stop' })).toContain('version');
  expect(checkProtocolVersion(null)).toContain('version');
});

// --- The buildOptimizer extraction (regression) ---------------------------------

logicTest('optimizers: the extracted buildOptimizer is the one tfjsEngine still exports', ({ expect }) => {
  // The extraction must not fork the logic: one function, two import paths.
  expect(buildOptimizerFromTfjsEngine).toBe(buildOptimizer);
});

logicTest('optimizers: buildOptimizerConfig keeps the string passthrough and the positional args', ({ expect }) => {
  const calls: unknown[][] = [];
  const factory = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return { name }; };
  const fakeTf = { train: { sgd: factory('sgd'), momentum: factory('momentum'), adam: factory('adam') } };
  // No usable params -> the optimizer NAME passes through (tfjs defaults apply).
  expect(buildOptimizerConfig(fakeTf, 'adam', {})).toBe('adam');
  expect(buildOptimizerConfig(fakeTf, 'adam', { learningRate: '', epsilon: undefined })).toBe('adam');
  expect(calls.length).toBe(0);
  // Params -> positional construction (the object form was a NaN lr).
  const built = buildOptimizerConfig(fakeTf, 'adam', { learningRate: 0.002, beta1: 0.95, epsilon: '' });
  expect(built).toEqual({ name: 'adam' });
  expect(calls.pop()).toEqual(['adam', 0.002, 0.95, undefined, undefined]);
  // sgd WITH momentum still routes to tf.train.momentum.
  buildOptimizerConfig(fakeTf, 'sgd', { learningRate: 0.01, momentum: 0.9 });
  expect(calls.pop()).toEqual(['momentum', 0.01, 0.9, false]);
  // The filter is shared with the engines' debug exposure.
  expect(filterOptimizerParams({ learningRate: 0.1, beta1: '', rho: undefined, x: null }))
    .toEqual({ learningRate: 0.1 });
});

// --- workerEngine lifecycle over the real host ----------------------------------

logicTest('workerEngine: capabilities are honest (no live-lr channel) and the model stays in the worker', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  // dynamicBatch/canPause mirror tfjs (both really hold through the protocol);
  // liveLr is FALSE: there is no message to touch the optimizer mid-fit yet.
  expect(engine.capabilities).toEqual({ dynamicBatch: true, liveLr: false, canPause: true });
  const graphJson = '{"fake":"graph"}';
  const session = await engine.prepare(graphJson, makeOpts());
  expect(session.capabilities).toEqual({ dynamicBatch: true, liveLr: false, canPause: true });
  // tinygradEngine precedent: no tf model on the main thread — TrainingZone's
  // hasTrainedModel stays false and InspectPanel shows its train-first hint.
  expect(session.model).toBe(null);
  expect(session.graphJson).toBe(graphJson);
});

logicTest('workerEngine: prepare sends the generated code (not the thunk) across the wire', async ({ expect }) => {
  await setup(expect);
  const worker = makeWorkerPair();
  const engine = createWorkerEngine({ makeWorker: () => worker });
  let generated = 0;
  await engine.prepare(null, makeOpts({
    generateCode: () => { generated += 1; return GENERATED_CODE; },
    optimizerParams: { learningRate: 0.002 },
  }));
  // The thunk ran exactly once, on the main thread; only its output crossed.
  expect(generated).toBe(1);
  const prepare = worker.posted.find(
    (command): command is Extract<WorkerCommand, { type: 'prepare' }> => command.type === 'prepare',
  );
  expect(prepare!.code).toBe(GENERATED_CODE);
  expect(prepare!.optimizer).toBe('adam');
  expect(prepare!.optimizerParams).toEqual({ learningRate: 0.002 });
  expect(prepare!.loss).toBe('categoricalCrossentropy');
  expect(prepare!.v).toBe(PROTOCOL_VERSION);
});

logicTest('workerEngine: fit ships one raw train/test slice and relays the tfjs callback flow', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const session = await engine.prepare(null, makeOpts({ epochs: 2, batchSize: 16 }));
  const { dataset, draws } = makeRawSliceDataset({ trainSliceSize: 64, testSliceSize: 16 });
  const batchEnds: Array<[number, BatchLogs]> = [];
  const epochEnds: Array<[number, EpochLogs]> = [];
  await session.fit(dataset, {
    onBatchEnd(batch, logs) { batchEnds.push([batch, logs]); },
    onEpochEnd(epoch, logs) { epochEnds.push([epoch, logs]); },
  });
  // One raw draw per side, sized by the dataset's advertised slice sizes.
  expect(draws).toEqual([['train', 64], ['test', 16]]);
  // 64 samples / batch 16 = 4 batches per epoch, 2 epochs.
  expect(batchEnds.length).toBe(8);
  for (const [, logs] of batchEnds) {
    expect(Number.isFinite(logs.loss)).toBe(true);
    expect(Number.isFinite(logs.acc)).toBe(true);
  }
  // Epoch logs carry validation metrics from the transferred test slice.
  expect(epochEnds.map(([epoch]) => epoch)).toEqual([0, 1]);
  for (const [, logs] of epochEnds) {
    expect(Number.isFinite(logs.loss)).toBe(true);
    expect(Number.isFinite(logs.val_loss)).toBe(true);
    expect(Number.isFinite(logs.val_acc)).toBe(true);
  }
});

logicTest('workerEngine: fit honors resume fit-options (absolute epoch numbering)', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const session = await engine.prepare(null, makeOpts({ epochs: 5 }));
  const { dataset } = makeRawSliceDataset();
  const epochs: number[] = [];
  // A resume segment: 2 MORE epochs, numbered from 3 (the runController axis).
  await session.fit(dataset, {
    onEpochEnd(epoch) { epochs.push(epoch); },
  }, { epochs: 2, initialEpoch: 3 });
  expect(epochs).toEqual([3, 4]);
});

logicTest('workerEngine: a throwing callback cancels the fit through the protocol', async ({ expect }) => {
  await setup(expect);
  const worker = makeWorkerPair();
  const engine = createWorkerEngine({ makeWorker: () => worker });
  const session = await engine.prepare(null, makeOpts({ epochs: 5 }));
  const { dataset } = makeRawSliceDataset();
  let batchCalls = 0;
  let rejected: unknown = null;
  try {
    await session.fit(dataset, {
      onBatchEnd() { batchCalls += 1; throw 'cancelRequested'; }, // how watchTraining cancels
    });
  } catch (error) {
    rejected = error;
  }
  // The fit rejects with the EXACT thrown value (runController compares by
  // identity), a stop crossed the wire, and no callback fired after the throw.
  expect(rejected).toBe('cancelRequested');
  expect(worker.posted.some(command => command.type === 'stop')).toBe(true);
  expect(batchCalls).toBe(1);
  await settle();
  // The worker session survives a cancel (weights still reachable).
  const weights = await session.getWeights();
  expect(Object.keys(weights).length).toBe(4);
});

logicTest('workerEngine: stop() ends the fit early and lets it resolve (the pause contract)', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const session = await engine.prepare(null, makeOpts({ epochs: 25 }));
  const { dataset } = makeRawSliceDataset();
  const epochEnds: number[] = [];
  await session.fit(dataset, {
    onEpochEnd(epoch) {
      epochEnds.push(epoch);
      session.stop();
    },
  });
  expect(epochEnds.length).toBeGreaterThan(0);
  expect(epochEnds.length).toBeLessThan(25);
});

logicTest('workerEngine: getWeights/setWeights round-trip named weights across the wire', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const session = await engine.prepare(null, makeOpts());
  const weights = await session.getWeights();
  const names = Object.keys(weights);
  expect(names.length).toBe(4); // two dense layers x (kernel + bias)
  for (const name of names) expect(weights[name] instanceof Float32Array).toBe(true);
  // Write distinct values back and read them again.
  const replacement: NamedWeights = Object.fromEntries(
    names.map((name, i): [string, Float32Array] => [
      name, new Float32Array(weights[name]!.length).fill(0.25 * (i + 1)),
    ]),
  );
  await session.setWeights(replacement);
  const roundTripped = await session.getWeights();
  for (const name of names) {
    expect(Array.from(roundTripped[name]!)).toEqual(Array.from(replacement[name]!));
  }
  // Partial writes leave unnamed variables untouched — and the caller's
  // arrays survive (setWeights copies; it never transfers caller buffers).
  const firstName = names[0]!;
  const partial = { [firstName]: new Float32Array(weights[firstName]!.length).fill(-1) };
  await session.setWeights(partial);
  expect(partial[firstName]!.length).toBe(weights[firstName]!.length); // not detached
  const afterPartial = await session.getWeights();
  expect(afterPartial[firstName]!.every(value => value === -1)).toBe(true);
  expect(Array.from(afterPartial[names[1]!]!)).toEqual(Array.from(replacement[names[1]!]!));
});

logicTest('workerEngine: evaluateLogits probes the in-worker model, leaving the input buffer alive', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const session = await engine.prepare(null, makeOpts());
  const x = Float32Array.from({ length: 2 * 4 }, (_, i) => (i % 7) / 7);
  const scores = await session.evaluateLogits!(x);
  expect(scores.length).toBe(2 * 3);
  // Softmax head -> log-probabilities (each row's exp() sums to 1), exactly
  // like the tfjs engine's probe.
  for (let row = 0; row < 2; row += 1) {
    const sum = [0, 1, 2].reduce((total, c) => total + Math.exp(scores[row * 3 + c]!), 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
  }
  // Deterministic (dropout inactive), and the caller's buffer is NOT detached.
  expect(Array.from(await session.evaluateLogits!(x))).toEqual(Array.from(scores));
  expect(x.length).toBe(8);
});

logicTest('workerEngine: prepare failures map back to tagged errors; cyclic-graph text passes through', async ({ expect }) => {
  await setup(expect);
  // The generateCode thunk runs on the MAIN thread: its errors keep their
  // identity (a CyclicGraphError's user-legible text reaches the alert
  // exactly as it does with the tfjs engine today).
  class FakeCyclicGraphError extends Error {}
  const cyclic = new FakeCyclicGraphError('The graph contains a cycle: dense_1 → add_1 → dense_1');
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const genError = await rejection(engine.prepare(null, makeOpts({
    generateCode: () => { throw cyclic; },
  })));
  expect(genError instanceof TrainingPrepareError).toBe(true);
  expect(genError.stage).toBe('build');
  expect(genError.cause).toBe(cyclic); // identity preserved — never crossed a wire
  expect(genError.generatedCode).toBe(undefined);

  // Unparseable generated code fails the WORKER-side eval -> 'build', with
  // the code attached for the console (the message crossed as a string).
  const engine2 = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const evalError = await rejection(engine2.prepare(null, makeOpts({
    generateCode: () => 'this is ((( not javascript',
  })));
  expect(evalError instanceof TrainingPrepareError).toBe(true);
  expect(evalError.stage).toBe('build');
  expect(evalError.generatedCode).toBe('this is ((( not javascript');

  // createModel() throwing (bad layer params) -> 'create' with the message.
  const engine3 = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const createError = await rejection(engine3.prepare(null, makeOpts({
    generateCode: () => 'function createModel() { throw new Error("create boom"); }',
  })));
  expect(createError instanceof TrainingPrepareError).toBe(true);
  expect(createError.stage).toBe('create');
  expect(createError.message).toContain('create boom');

  // A tf load failure in the worker stays untagged, like tfjsEngine's loadTf.
  const engine4 = createWorkerEngine({
    makeWorker: () => makeWorkerPair({ loadTf: async () => { throw new Error('no tf in worker'); } }),
  });
  const loadError = await rejection(engine4.prepare(null, makeOpts()));
  expect(loadError instanceof TrainingPrepareError).toBe(false);
  expect(loadError.message).toContain('no tf in worker');
});

logicTest('workerEngine: a dataset without raw draws is refused loudly', async ({ expect }) => {
  await setup(expect);
  const engine = createWorkerEngine({ makeWorker: () => makeWorkerPair() });
  const session = await engine.prepare(null, makeOpts());
  const tensorOnly = { shape: [4], nextTrainBatch() {}, nextTestBatch() {} } as unknown as TrainingDataset;
  const error = await rejection(session.fit(tensorOnly, {}));
  expect(error.message).toMatch(/raw batch draws/);
});

logicTest('workerEngine: a crashed worker rejects everything in flight', async ({ expect }) => {
  // A dead-silent worker: nothing answers, then onerror fires.
  const worker: TrainingWorkerLike = { onmessage: null, onerror: null, postMessage() {} };
  const engine = createWorkerEngine({ makeWorker: () => worker });
  const pending = rejection(engine.prepare(null, makeOpts()));
  await settle();
  worker.onerror?.({ message: 'worker exploded' } as ErrorEvent);
  expect((await pending).message).toContain('worker exploded');
});

// --- The host's own guardrails ---------------------------------------------------

logicTest('trainingWorkerHost: refuses unknown commands and versions from the future', async ({ expect }) => {
  const events: WorkerEvent[] = [];
  const host = createTrainingWorkerHost({
    loadTf: async () => { throw new Error('must not load tf for a refused message'); },
    post: (event) => { events.push(event); },
  });
  await host.handle({ v: 99, id: 7, type: 'stop' } as unknown as WorkerCommand);
  expect(events[0]!.type).toBe('error');
  expect((events[0] as { message: string }).message).toContain('99');
  await host.handle({ v: PROTOCOL_VERSION, id: 8, type: 'summon' } as unknown as WorkerCommand);
  expect(events[1]!.type).toBe('error');
  expect(events[1]!.id).toBe(8);
  // fit before prepare: a clear error, never a crash.
  await host.handle({
    v: PROTOCOL_VERSION,
    id: 9,
    type: 'fit',
    trainXs: new Float32Array(4),
    trainLabels: new Int32Array(1),
    testXs: new Float32Array(4),
    testLabels: new Int32Array(1),
    trainCount: 1,
    testCount: 1,
    shape: [4],
    numClasses: 3,
    batchSize: 1,
    epochs: 1,
    initialEpoch: 0,
  });
  expect(events[2]!.type).toBe('error');
  expect((events[2] as { message: string }).message).toMatch(/prepare/i);
});

// --- Settings + dataset raw draws -------------------------------------------------

logicTest('workerEngine: the engine choice defaults to the main-thread tfjs engine', ({ expect }) => {
  // The worker engine is opt-in: a fresh device trains exactly as before.
  expect(SETTINGS_DEFAULTS.trainingEngine).toBe('tfjs');
});

logicTest('googleDataLoader: raw draws share the tensor path\'s shuffled index walk', async ({ expect }) => {
  await setup(expect);
  // The tensor path reads tf through the app's own loader memo (getTf) —
  // prime it; setup() already initialized the module on the cpu backend.
  await loadTf();
  const dataset = new Dataset('sprite.png', null, [2, 2, 1], 'labels.bin', null, 3, 6, 4);
  // Hand-loaded fixture (load() needs Image/canvas): 4 train samples whose
  // pixels encode their own sample index, deterministic identity indices.
  dataset.trainImages = Float32Array.from({ length: 4 * 4 }, (_, i) => Math.floor(i / 4));
  dataset.trainLabels = Uint8Array.from([0, 1, 2, 0]);
  dataset.testImages = Float32Array.from({ length: 2 * 4 }, (_, i) => 10 + Math.floor(i / 4));
  dataset.testLabels = Uint8Array.from([1, 2]);
  dataset.trainIndices = Uint32Array.from([0, 1, 2, 3]);
  dataset.testIndices = Uint32Array.from([0, 1]);
  // The index cursor advances BEFORE each read (the historical discipline):
  // the first draw starts at trainIndices[1].
  const raw = dataset.nextTrainBatchRaw(2);
  expect(raw.xs instanceof Float32Array).toBe(true);
  expect(raw.labels instanceof Int32Array).toBe(true);
  expect(Array.from(raw.xs)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
  expect(Array.from(raw.labels)).toEqual([1, 2]);
  // Raw and tensor draws advance the SAME cursor — the tensor batch that
  // follows continues where the raw draw stopped (samples 3, then wrap to 0).
  const tensorBatch = dataset.nextTrainBatch(2, 'integer');
  expect(Array.from((tensorBatch.xs as { dataSync(): Float32Array }).dataSync()))
    .toEqual([3, 3, 3, 3, 0, 0, 0, 0]);
  // Test-side raw draws read the test regions.
  const rawTest = dataset.nextTestBatchRaw(2);
  expect(Array.from(rawTest.xs)).toEqual([11, 11, 11, 11, 10, 10, 10, 10]);
  expect(Array.from(rawTest.labels)).toEqual([2, 1]);
});

logicTest('textDataset: raw draws serve encoded windows and their next-char labels', ({ expect }) => {
  const seqLen = 4;
  const dataset = new TextDataset('poems.txt', null, seqLen);
  const text = 'abcdefghijklmnopqrst';
  dataset.corpus = encodeText(text);
  dataset.trainStart = 0;
  dataset.testStart = 10;
  dataset.trainIndices = Uint32Array.from([0, 1, 2, 3, 4, 5]);
  dataset.testIndices = Uint32Array.from([0, 1]);
  const raw = dataset.nextTrainBatchRaw(2);
  expect(raw.xs instanceof Float32Array).toBe(true);
  expect(raw.labels instanceof Int32Array).toBe(true);
  // Cursor advances before reading: first window starts at trainIndices[1]=1
  // ("bcde" -> label "f"), second at 2 ("cdef" -> "g").
  expect(Array.from(raw.xs)).toEqual(Array.from(encodeText('bcdecdef')));
  expect(Array.from(raw.labels)).toEqual([encodeText('f')[0]!, encodeText('g')[0]!]);
  // Test windows are offset by the region start (testStart 10 = "k...").
  const rawTest = dataset.nextTestBatchRaw(1);
  expect(Array.from(rawTest.xs)).toEqual(Array.from(encodeText('lmno')));
  expect(Array.from(rawTest.labels)).toEqual([encodeText('p')[0]!]);
});
