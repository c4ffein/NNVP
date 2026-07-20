/**
 * Unit tests for the training-engine seam (src/lib/Training): the tfjs
 * implementation is driven with real TensorFlow.js (same cpu-backend setup as
 * tfjsTraining.js) against a fake in-memory dataset, checking the exact
 * contract TrainingZone.vue relies on — prepare/eval, fit callback flow,
 * cancel-by-throw, named-weight round-trips, stop(), capabilities, and the
 * tagged prepare errors behind the two alert surfaces.
 */
import { logicTest } from '../harness/define';
import type { Expect } from '../harness/define';
import { TrainingPrepareError } from '../../src/lib/Training/engine';
import type { NamedWeights, TrainingPrepareOptions, TrainingSession } from '../../src/lib/Training/engine';
import { resolveBenchMode } from '../../src/lib/Training/benchMode';
import {
  datasetCompatible, describeGraph, makeSyntheticDataset, probeMetrics,
  samplesProcessed, summarizeRun,
} from '../../src/lib/Training/abBenchmark';
import { buildOptimizer, createTfjsEngine } from '../../src/lib/Training/tfjsEngine';

type Tfjs = typeof import('@tensorflow/tfjs');

// Imported lazily inside setup(): a module-level import would print tfjs's
// "install tfjs-node" banner at load time, before any console muting can
// catch it. Every test (except the loadTf-failure one) awaits setup() first.
// (Typed non-null through the cast for that reason; null until setup() runs.)
let tf = null as unknown as Tfjs;

// Same rationale as tests/suites/tfjsTraining.js: with happy-dom registered
// tfjs would probe WebGL and spam the output before falling back, so the
// plain-JS cpu backend is forced with the console muted for the one-time init.
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
      // The "install tfjs-node" banner prints on the backend's FIRST OP, not
      // at init — burn that first use here while the console is still muted.
      tf.scalar(0).dispose();
    } finally {
      for (const [level, original] of muted) console[level] = original;
    }
  }
  expect(tf.getBackend()).toBe('cpu');
}

// The debug/testing surface the tfjs engine writes on window, as these tests
// read it back (mirrors tfjsEngine.ts's DebugWindow).
type DebugWindow = Window & {
  tf?: unknown;
  nnvp?: {
    debug?: {
      trainingConfig?: unknown;
      compiledModel?: {
        optimizerConfig?: { learningRate?: unknown; beta1?: unknown };
        loss?: unknown;
      };
    };
  };
};

// What generateJavascriptNoSave() emits, shrunk: a `function createModel()`
// declaration that only reaches tf through the eval wrapper's
// `const tf = window.tf` — the exact eval contract prepare() must honor.
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
    ...overrides,
  };
}

// Mirrors lib/JSDatasets/google-data-loader's surface as fit() consumes it:
// shape + nextTrainBatch/nextTestBatch returning { xs, labels } tensors
// (xs flat per-sample, reshaped by the engine). Records the requested sizes.
function makeFakeDataset() {
  return {
    shape: [4],
    trainCalls: [] as number[],
    testCalls: [] as number[],
    nextTrainBatch(size: number) {
      this.trainCalls.push(size);
      return {
        xs: tf.randomNormal([size, 4]),
        labels: tf.oneHot(tf.randomUniform([size], 0, 3, 'int32'), 3),
      };
    },
    nextTestBatch(size: number) {
      this.testCalls.push(size);
      return {
        xs: tf.randomNormal([size, 4]),
        labels: tf.oneHot(tf.randomUniform([size], 0, 3, 'int32'), 3),
      };
    },
  };
}

logicTest('trainingEngine: capabilities are the tfjs record on engine and session', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  expect(engine.capabilities).toEqual({ dynamicBatch: true, liveLr: true });
  const session = await engine.prepare(null, makeOpts());
  expect(session.capabilities).toEqual({ dynamicBatch: true, liveLr: true });
});

logicTest('trainingEngine: prepare evals the generated code, compiles, and keeps the Inspector contract', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const graphJson = '{"fake":"graph"}';
  const session = await engine.prepare(graphJson, makeOpts({
    optimizerParams: { learningRate: 0.002, beta1: 0.95, epsilon: '' }, // '' must be dropped
    loss: 'meanSquaredError',
    epochs: 3,
  }));
  const debugWindow = window as DebugWindow;
  // Inspector contract: the raw tf model and the graph JSON snapshot.
  expect(typeof (session.model as { predict?: unknown }).predict).toBe('function');
  expect(session.graphJson).toBe(graphJson);
  // The eval ran through `const tf = window.tf`.
  expect(debugWindow.tf).toBe(tf);
  // Debug/test exposure, exactly as the training e2e polls it.
  expect(debugWindow.nnvp!.debug!.trainingConfig).toEqual({
    optimizer: 'adam',
    optimizerParams: { learningRate: 0.002, beta1: 0.95 },
    loss: 'meanSquaredError',
    epochs: 3,
  });
  expect(debugWindow.nnvp!.debug!.compiledModel!.loss).toBe('meanSquaredError');
  // The scalars land where tfjs expects them (the old object-as-learningRate
  // construction — asserted here historically — was an effectively-NaN lr).
  expect(debugWindow.nnvp!.debug!.compiledModel!.optimizerConfig!.learningRate).toBe(0.002);
  expect(debugWindow.nnvp!.debug!.compiledModel!.optimizerConfig!.beta1).toBe(0.95);
});

logicTest('trainingEngine: prepare failures are tagged build/create; untagged errors propagate', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  // The thrown value's shape IS what the assertions below probe — localized
  // any at this seam rather than duplicating them in a type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rejection = async (promise: Promise<unknown>): Promise<any> => {
    try { await promise; } catch (error) { return error; }
    throw new Error('expected the prepare() to reject');
  };

  // Code generation itself throwing -> 'build', no generated code captured.
  const genError = await rejection(engine.prepare(null, makeOpts({
    generateCode: () => { throw new Error('gen boom'); },
  })));
  expect(genError instanceof TrainingPrepareError).toBe(true);
  expect(genError.stage).toBe('build');
  expect(genError.cause.message).toBe('gen boom');
  expect(genError.generatedCode).toBe(undefined);

  // Unparseable generated code -> 'build', carrying the code for the console.
  const evalError = await rejection(engine.prepare(null, makeOpts({
    generateCode: () => 'this is ((( not javascript',
  })));
  expect(evalError instanceof TrainingPrepareError).toBe(true);
  expect(evalError.stage).toBe('build');
  expect(evalError.generatedCode).toBe('this is ((( not javascript');

  // createModel() throwing (bad layer params) -> 'create' with the raw cause.
  const createError = await rejection(engine.prepare(null, makeOpts({
    generateCode: () => 'function createModel() { throw new Error("create boom"); }',
  })));
  expect(createError instanceof TrainingPrepareError).toBe(true);
  expect(createError.stage).toBe('create');
  expect(createError.cause.message).toBe('create boom');

  // Engine-external failures (tfjs load) stay untagged, as they always have.
  const brokenEngine = createTfjsEngine({ loadTf: async () => { throw new Error('no tf'); } });
  const loadError = await rejection(brokenEngine.prepare(null, makeOpts()));
  expect(loadError instanceof TrainingPrepareError).toBe(false);
  expect(loadError.message).toBe('no tf');
});

logicTest('trainingEngine: fit feeds 500/100 dataset slices and reports the watchTraining callback flow', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare(null, makeOpts({ epochs: 2 }));
  const dataset = makeFakeDataset();
  const batchEnds: Array<[number, { loss: number; acc: number | undefined }]> = [];
  const epochEnds: Array<[number, {
    loss: number; acc: number | undefined; val_loss: number | undefined; val_acc: number | undefined;
  }]> = [];
  const result = await session.fit(dataset, {
    onBatchEnd(batch, logs) { batchEnds.push([batch, logs]); },
    onEpochEnd(epoch, logs) { epochEnds.push([epoch, logs]); },
  });
  // Historical batching: one 500-sample train slice, one 100-sample test slice.
  expect(dataset.trainCalls).toEqual([500]);
  expect(dataset.testCalls).toEqual([100]);
  // 500 samples / batchSize 64 = 8 batches per epoch, 2 epochs.
  expect(batchEnds.length).toBe(16);
  for (const [, logs] of batchEnds) {
    expect(Number.isFinite(logs.loss)).toBe(true);
    expect(Number.isFinite(logs.acc)).toBe(true);
  }
  expect(epochEnds.length).toBe(2);
  expect(epochEnds.map(([epoch]) => epoch)).toEqual([0, 1]);
  for (const [, logs] of epochEnds) {
    expect(Number.isFinite(logs.loss)).toBe(true);
    expect(Number.isFinite(logs.acc)).toBe(true);
    expect(Number.isFinite(logs.val_loss)).toBe(true);
    expect(Number.isFinite(logs.val_acc)).toBe(true);
  }
  expect((result as { history: { loss: unknown[] } }).history.loss).toHaveLength(2);
});

logicTest('trainingEngine: a throwing callback cancels the fit (the stop-button contract)', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare(null, makeOpts({ epochs: 2 }));
  let rejected: unknown = null;
  try {
    await session.fit(makeFakeDataset(), {
      onBatchEnd() { throw 'cancelRequested'; }, // how watchTraining cancels
    });
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBe('cancelRequested');
});

logicTest('trainingEngine: getWeights/setWeights round-trip named Float32Array weights', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare(null, makeOpts());
  const weights = session.getWeights() as NamedWeights;
  const names = Object.keys(weights);
  expect(names.length).toBe(4); // two dense layers x (kernel + bias)
  for (const name of names) {
    expect(name.length > 0).toBe(true);
    expect(weights[name] instanceof Float32Array).toBe(true);
  }
  // Write distinct values back and read them again.
  const replacement = Object.fromEntries(
    names.map((name, i): [string, Float32Array] => [name, new Float32Array(weights[name]!.length).fill(0.125 * (i + 1))]),
  );
  session.setWeights(replacement);
  const roundTripped = session.getWeights() as NamedWeights;
  for (const name of names) {
    expect(Array.from(roundTripped[name]!)).toEqual(Array.from(replacement[name]!));
  }
  // Partial writes leave unnamed variables untouched.
  const firstName = names[0]!;
  session.setWeights({ [firstName]: new Float32Array(weights[firstName]!.length).fill(-1) });
  const afterPartial = session.getWeights() as NamedWeights;
  expect(afterPartial[firstName]!.every(value => value === -1)).toBe(true);
  expect(Array.from(afterPartial[names[1]!]!)).toEqual(Array.from(replacement[names[1]!]!));
});

logicTest('trainingEngine: stop() ends the fit early and lets it resolve', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare(null, makeOpts({ epochs: 5 }));
  const epochEnds: number[] = [];
  await session.fit(makeFakeDataset(), {
    onEpochEnd(epoch) {
      epochEnds.push(epoch);
      session.stop();
    },
  });
  expect(epochEnds.length).toBeGreaterThan(0);
  expect(epochEnds.length).toBeLessThan(5);
});


// --- Bench mode + A/B benchmark support --------------------------------------

logicTest('benchMode: the URL param decides and persists, else storage rules', ({ expect }) => {
  expect(resolveBenchMode('?bench=1', null)).toEqual({ enabled: true, store: '1' });
  expect(resolveBenchMode('?bench=0', '1')).toEqual({ enabled: false, store: '0' });
  expect(resolveBenchMode('', '1')).toEqual({ enabled: true, store: null });
  expect(resolveBenchMode('', '0')).toEqual({ enabled: false, store: null });
  expect(resolveBenchMode('?other=2', null)).toEqual({ enabled: false, store: null });
});

logicTest('abBenchmark: the synthetic data is class-structured (learnable), not pure noise', ({ expect }) => {
  const ds = makeSyntheticDataset({ shape: [4], numClasses: 2, samples: 8 });
  // Same class -> same underlying pattern: samples 0 and 2 (both class 0)
  // correlate far more with each other than with sample 1 (class 1).
  const sample = (i: number) => ds.trainImages.subarray(i * 4, i * 4 + 4);
  const dist = (a: Float32Array, b: Float32Array) => a.reduce((total, v, j) => total + Math.abs(v - b[j]!), 0);
  expect(dist(sample(0), sample(2))).toBeLessThan(dist(sample(0), sample(1)));
  expect(dist(sample(1), sample(3))).toBeLessThan(dist(sample(1), sample(2)));
});

logicTest('abBenchmark: the synthetic dataset satisfies both engine contracts', ({ expect }) => {
  const calls: Array<[string, unknown]> = [];
  const fakeTf = {
    tensor2d: (data: Float32Array, shape: number[]) => { calls.push(['tensor2d', shape]); return { data, shape }; },
    tensor1d: (data: Int32Array) => ({ data }),
    oneHot: (t: unknown, classes: number) => { calls.push(['oneHot', classes]); return { classes }; },
  };
  const ds = makeSyntheticDataset({ shape: [28, 28, 1], numClasses: 10, samples: 64, tf: fakeTf });
  // The tinygrad side: raw arrays, deterministic bytes — and the class count
  // rides along (probes and compatibility checks read it off the dataset).
  expect(ds.numClasses).toBe(10);
  expect(ds.imageByteSize).toBe(784);
  expect(ds.trainImages.length).toBe(64 * 784);
  expect(ds.trainLabels[13]).toBe(3);
  const again = makeSyntheticDataset({ shape: [28, 28, 1], numClasses: 10, samples: 64 });
  expect(again.trainImages[5000]).toBe(ds.trainImages[5000]); // same seed, same bytes
  // The tfjs side: tensor batches through the injected tf.
  const batch = ds.nextTrainBatch(32);
  expect(batch.xs.shape).toEqual([32, 784]);
  expect(calls).toContainEqual(['oneHot', 10]);
  // Built without tf, tfjs batches must fail loudly, not mysteriously.
  expect(() => again.nextTrainBatch(8)).toThrow(/without tf/);
});

logicTest('abBenchmark: run summaries measure what each engine actually does', ({ expect }) => {
  // tfjs slices 500 samples/epoch; tinygrad floor(500/32) batches of 32.
  expect(samplesProcessed('tfjs', 2)).toBe(1000);
  expect(samplesProcessed('tinygrad', 2)).toBe(960);
  const row = summarizeRun({
    engineId: 'tinygrad', epochs: 2, bootMs: 8000, prepareMs: 20000, fitMs: 4800,
    epochMs: [3200, 1600], losses: [2.5, 1.2, 0.6],
  });
  expect(row.setupMs).toBe(28000);
  // Steady state = the LAST epoch only (the first pays warmup/compile):
  // 480 samples / 1.6s.
  expect(row.samplesPerSec).toBe(300);
  expect(row.lossFirst).toBe(2.5);
  expect(row.lossLast).toBe(0.6);
  expect(row.descended).toBe(true);
  expect(summarizeRun({
    engineId: 'tfjs', epochs: 1, prepareMs: 100, fitMs: 1000, losses: [2.3, 2.29],
  }).descended).toBe(false);
});

logicTest('tfjsEngine: optimizers are built with POSITIONAL args (the object form was a NaN lr)', ({ expect }) => {
  const calls: unknown[][] = [];
  const factory = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return { name }; };
  const tf = { train: {
    sgd: factory('sgd'), momentum: factory('momentum'), adam: factory('adam'), rmsprop: factory('rmsprop'),
  } };
  buildOptimizer(tf, 'adam', { learningRate: 0.002, beta1: 0.95 });
  expect(calls.pop()).toEqual(['adam', 0.002, 0.95, undefined, undefined]);
  buildOptimizer(tf, 'rmsprop', { learningRate: 0.001, momentum: 0.9 });
  expect(calls.pop()).toEqual(['rmsprop', 0.001, undefined, 0.9, undefined, undefined]);
  // Plain sgd stays sgd…
  buildOptimizer(tf, 'sgd', { learningRate: 0.05 });
  expect(calls.pop()).toEqual(['sgd', 0.05]);
  // …but sgd WITH momentum routes to tf.train.momentum (sgd has no momentum arg).
  buildOptimizer(tf, 'sgd', { learningRate: 0.01, momentum: 0.9 });
  expect(calls.pop()).toEqual(['momentum', 0.01, 0.9, false]);
});

logicTest('abBenchmark: describeGraph summarizes the chain and flags a missing final softmax', ({ expect }) => {
  const graph = (layers: unknown[]) => JSON.stringify({ layers });
  const dense = (units: number, activation: string | undefined) => ({ kerasLayer: { name: 'Dense', parameterValues: { units, activation } } });
  const withSoftmax = describeGraph(graph([
    { kerasLayer: { name: 'Input', parameterValues: { shape: [28, 28, 1] } } },
    { kerasLayer: { name: 'Flatten', parameterValues: {} } },
    dense(42, 'relu'),
    dense(10, 'softmax'),
  ]));
  expect(withSoftmax.summary).toBe('Input[28,28,1] → Flatten → Dense(42, relu) → Dense(10, softmax)');
  expect(withSoftmax.finalSoftmax).toBe(true);
  const withoutSoftmax = describeGraph(graph([
    { kerasLayer: { name: 'Input', parameterValues: { shape: [4] } } },
    dense(10, 'relu'),
    dense(3, undefined),
  ]));
  expect(withoutSoftmax.summary).toBe('Input[4] → Dense(10, relu) → Dense(3)');
  expect(withoutSoftmax.finalSoftmax).toBe(false);
});

logicTest('tfjsEngine: fit honors the seam batchSize (default stays the historical 64)', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const countBatches = async (opts: Partial<TrainingPrepareOptions>) => {
    const session = await engine.prepare('{}', makeOpts({ epochs: 1, ...opts }));
    let batches = 0;
    await session.fit(makeFakeDataset(), { onBatchEnd: () => { batches += 1; } });
    return batches;
  };
  // 500 train samples: batch 100 -> 5 updates; default 64 -> ceil(500/64) = 8.
  expect(await countBatches({ batchSize: 100 })).toBe(5);
  expect(await countBatches({})).toBe(8);
});

logicTest('abBenchmark: validation is a genuine hold-out — same patterns, different noise', ({ expect }) => {
  const ds = makeSyntheticDataset({ shape: [4], numClasses: 2, samples: 8, valSamples: 4 });
  expect(ds.valImages.length).toBe(4 * 4);
  expect(Array.from(ds.valLabels)).toEqual([0, 1, 0, 1]);
  const train0 = ds.trainImages.subarray(0, 4);
  const val0 = ds.valImages.subarray(0, 4);
  const val1 = ds.valImages.subarray(4, 8);
  const dist = (a: Float32Array, b: Float32Array) => a.reduce((total, v, j) => total + Math.abs(v - b[j]!), 0);
  // Not the same bytes as any train sample (fresh noise)…
  expect(dist(train0, val0)).toBeGreaterThan(0);
  // …but closer to its own class's train sample than to the other class's.
  expect(dist(val0, train0)).toBeLessThan(dist(val0, val1));
});

logicTest('abBenchmark: summarizeRun carries the final metric logs through', ({ expect }) => {
  const row = summarizeRun({
    engineId: 'tfjs', epochs: 1, prepareMs: 10, fitMs: 100, losses: [2, 1],
    finalLogs: { acc: 0.93, valLoss: 0.4, valAcc: 0.88 },
  });
  expect(row.acc).toBe(0.93);
  expect(row.valLoss).toBe(0.4);
  expect(row.valAcc).toBe(0.88);
  // Absent metrics stay undefined (rendered as an em dash, never a fake 0).
  expect(summarizeRun({ engineId: 'tinygrad', epochs: 1, prepareMs: 1, fitMs: 1, losses: [1] }).acc)
    .toBe(undefined);
});

logicTest('abBenchmark: dataset/board compatibility is exact shape AND class-count equality', ({ expect }) => {
  expect(datasetCompatible([28, 28, 1], [28, 28, 1])).toBe(true);
  expect(datasetCompatible([28, 28], [28, 28, 1])).toBe(false); // same pixels, different rank
  expect(datasetCompatible([32, 32, 3], [28, 28, 1])).toBe(false);
  expect(datasetCompatible(null, [28, 28, 1])).toBe(false);
  // Class counts: a 5-class head over 10-class labels is refused; matching
  // counts pass; omitted counts keep the shape-only behavior.
  expect(datasetCompatible([28, 28, 1], [28, 28, 1], 10, 10)).toBe(true);
  expect(datasetCompatible([28, 28, 1], [28, 28, 1], 5, 10)).toBe(false);
});

logicTest('abBenchmark: probeMetrics measures acc + crossentropy through the seam probe', async ({ expect }) => {
  // A fake session whose scores put class 0 first and class 1 second in every
  // batch; labels agree in batch 1 and disagree in batch 2 -> acc 0.5, and
  // the crossentropy is the exact softmax CE of the [3, 0] logit gap.
  const calls: number[][] = [];
  // Deliberately partial TrainingSession: probeMetrics only touches
  // evaluateLogits.
  const session = {
    async evaluateLogits(x: Float32Array): Promise<Float32Array> {
      calls.push(Array.from(x));
      return Float32Array.from([3, 0, 0, 3]);
    },
  } as unknown as TrainingSession;
  const images = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
  const labels = Int32Array.from([0, 1, 1, 0]);
  const metrics = await probeMetrics(session, {
    images, labels, pixels: 2, numClasses: 2, batchSize: 2,
  });
  // Each batch got its own 2-sample x 2-pixel slice.
  expect(calls).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
  expect(metrics.acc).toBe(0.5);
  // Per sample: correct -> log(1 + e^-3), wrong -> 3 + log(1 + e^-3).
  const expected = (2 * Math.log(1 + Math.exp(-3)) + 2 * (3 + Math.log(1 + Math.exp(-3)))) / 4;
  expect(Math.abs(metrics.loss - expected)).toBeLessThan(1e-9);
});

logicTest('tfjsEngine: evaluateLogits emits dropout-off scores the shared probe can normalize', async ({ expect }) => {
  await setup(expect);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare('{}', makeOpts({ epochs: 1 }));
  const x = Float32Array.from({ length: 2 * 4 }, (_, i) => (i % 7) / 7);
  const scores = await session.evaluateLogits!(x);
  expect(scores.length).toBe(2 * 3);
  // Softmax head -> log-probabilities: each row's exp() sums to 1, so the
  // probe's log-sum-exp crossentropy is the exact softmax CE (and argmax is
  // unchanged).
  for (let row = 0; row < 2; row += 1) {
    const sum = [0, 1, 2].reduce((total, c) => total + Math.exp(scores[row * 3 + c]!), 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
  }
  // Deterministic: predict runs in inference mode, so a second call agrees.
  expect(Array.from(await session.evaluateLogits!(x))).toEqual(Array.from(scores));
  // A softmax-less head already emits logits: passed through untouched.
  const rawCode = GENERATED_CODE.replace("activation: 'softmax'", "activation: 'linear'");
  const rawSession = await engine.prepare('{}', makeOpts({ generateCode: () => rawCode }));
  const raw = await rawSession.evaluateLogits!(x);
  // The session's model is `unknown` on the seam; this is the raw tf
  // LayersModel, viewed structurally for the direct-predict comparison.
  const rawModel = rawSession.model as {
    predict(input: unknown): { data(): Promise<Float32Array>; dispose(): void };
  };
  const direct = rawModel.predict(tf.tensor(x, [2, 4]));
  expect(Array.from(raw)).toEqual(Array.from(new Float32Array(await direct.data())));
  direct.dispose();
});
