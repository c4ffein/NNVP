/**
 * The tinygrad training engine (src/lib/Training/tinygradEngine) and its
 * runtime plumbing (src/lib/TinygradRuntime), driven without a browser: the
 * worker protocol against a FAKE worker, weight I/O against the fake WebGPU
 * device from experiments/pyodide-tinygrad/check_runner.js (real backing
 * memory, usage flags ENFORCED like a real device would), the fit() batching
 * math over raw dataset arrays, shape/classes inference from graph JSON, and
 * the deliberate unsupported-option errors. The real Pyodide trace and real
 * GPU execution stay browser-only.
 */
import { logicTest } from '../harness/define';
import { TrainingPrepareError } from '../../src/lib/Training/engine';
import type {
  BatchLogs, EpochLogs, TrainingDataset, TrainingPrepareOptions,
} from '../../src/lib/Training/engine';
import {
  createTinygradEngine, graphInputShape, graphNumClasses,
} from '../../src/lib/Training/tinygradEngine';
import { createTinygradRuntime } from '../../src/lib/TinygradRuntime/runtime';
import type { RunnerStep, RuntimeWorker, TraceHandle } from '../../src/lib/TinygradRuntime/runtime';
import type {
  TraceMeta, TraceRequest, TraceResult, WorkerRequest, WorkerResponse,
} from '../../src/lib/TinygradRuntime/protocol';
import { readWeightBuf, writeWeightBuf } from '../../src/lib/TinygradRuntime/weightIO';
import type { NnvpLayer, NnvpModel, ParameterValue } from '../../src/types/model';

// --- Fake WebGPU, ported (minimally) from check_runner.js -------------------
// Buffers have real backing memory; copies and writeBuffer enforce the
// COPY_SRC/COPY_DST/MAP_* usage flags — dropping a flag fails here the same
// way it would in the browser.

const USAGE = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
// The ambient GPUBufferUsage (Viz3D's renderer subset) declares fewer flags
// than this full map — the runtime shape is what weightIO actually reads.
globalThis.GPUBufferUsage = USAGE as unknown as typeof GPUBufferUsage;
globalThis.GPUMapMode = { READ: 1, WRITE: 2 } as unknown as typeof GPUMapMode;

class FakeBuffer {
  size: number;
  usage: number;
  backing: Uint8Array<ArrayBuffer>;
  mapped: boolean;

  constructor({ size, usage, mappedAtCreation }: { size: number; usage: number; mappedAtCreation?: boolean }) {
    this.size = size;
    this.usage = usage;
    this.backing = new Uint8Array(size);
    this.mapped = !!mappedAtCreation;
  }
  async mapAsync(mode: number): Promise<void> {
    const needed = mode === GPUMapMode.READ ? USAGE.MAP_READ : USAGE.MAP_WRITE;
    if (!(this.usage & needed)) throw new Error(`mapAsync(${mode}) on buffer without MAP usage`);
    this.mapped = true;
  }
  getMappedRange(): ArrayBuffer {
    if (!this.mapped) throw new Error('getMappedRange on unmapped buffer');
    return this.backing.buffer;
  }
  unmap(): void { this.mapped = false; }
  destroy(): void {}
}

function makeFakeDevice() {
  return {
    createBuffer: (desc: { size: number; usage: number; mappedAtCreation?: boolean }) => new FakeBuffer(desc),
    createCommandEncoder: () => ({
      copyBufferToBuffer(src: FakeBuffer, srcOffset: number, dst: FakeBuffer, dstOffset: number, size: number) {
        if (!(src.usage & USAGE.COPY_SRC)) throw new Error('copy source lacks COPY_SRC usage');
        if (!(dst.usage & USAGE.COPY_DST)) throw new Error('copy destination lacks COPY_DST usage');
        dst.backing.set(src.backing.subarray(srcOffset, srcOffset + size), dstOffset);
      },
      finish: () => ({}),
    }),
    queue: { submit() {} },
  };
}

type FakeDevice = ReturnType<typeof makeFakeDevice>;

// The fake device/buffers implement exactly the GPUDevice/GPUBuffer surface
// the engine and weightIO touch — the rest of the ambient interfaces
// (branding, labels, render state) is deliberately absent.
const asGpuDevice = (device: FakeDevice): GPUDevice => device as unknown as GPUDevice;
const asGpuBuffer = (buf: FakeBuffer): GPUBuffer => buf as unknown as GPUBuffer;

// --- Fakes for the engine seams ----------------------------------------------

// driver.build meta for a tiny 2-weight state, with the aliasing the real
// safetensors carries (opt.params.N are the stored names).
function makeTraceResult({ batchSize = 32 }: { batchSize?: number } = {}): TraceResult {
  const stateShapes: Record<string, number[]> = {
    'opt.params.0': [3, 2], 'opt.params.1': [3], 'opt.b.0': [3, 2], 'opt.lr': [1],
  };
  return {
    runnerJs: 'export default { setupNet: () => {} } // fake runner',
    evalJs: 'export default { setupNet: () => {} } // fake eval runner',
    weights: new Uint8Array(8),
    meta: {
      batchSize,
      inputShape: [1, 28, 28],
      numClasses: 10,
      learningRate: 0.01,
      stateEntries: Object.keys(stateShapes),
      stateShapes,
      aliases: { 'opt.params.0': 'model.layer_3.weight', 'opt.params.1': 'model.layer_3.bias' },
      kernels: 4,
    },
  };
}

/** The fake runtime: the TinygradRuntime surface plus recorded calls. */
interface FakeRuntime {
  initCalls: number;
  traceRequests: TraceRequest[];
  init(): Promise<TraceResult | undefined>;
  trace(request: TraceRequest): TraceHandle;
}

function makeFakeRuntime(traceResult: TraceResult = makeTraceResult()): FakeRuntime {
  return {
    initCalls: 0,
    traceRequests: [],
    async init(): Promise<TraceResult | undefined> { this.initCalls += 1; return undefined; },
    trace(request) {
      this.traceRequests.push(request);
      return { promise: Promise.resolve(traceResult), cancel() {} };
    },
  };
}

interface FakeStepCall {
  x0: number | undefined;
  xLength: number;
  y: number[];
  readLoss: boolean;
}

/**
 * A stand-in for the emitted runner's step function (RunnerStep, but
 * returning null when the readback is skipped — the engine never reads the
 * output on those steps).
 */
interface FakeStep {
  (x: Float32Array, yInt: Int32Array, readLoss?: boolean): Promise<Float32Array[] | null>;
  calls: FakeStepCall[];
  weightBufs: Record<string, FakeBuffer>;
}

// A stand-in for the emitted runner's step function: weightBufs on the fake
// device (same usage flags driver.patch_runner_for_weight_readback sets),
// recorded calls, decreasing loss, null when the readback is skipped.
function makeFakeStep(
  device: FakeDevice, meta: TraceMeta, initialValues: Record<string, ArrayLike<number>> = {},
): FakeStep {
  const weightBufs: Record<string, FakeBuffer> = {};
  for (const [name, shape] of Object.entries(meta.stateShapes)) {
    const size = shape.reduce((a, b) => a * b, 1) * 4;
    const buf = device.createBuffer({
      size, usage: USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST, mappedAtCreation: true,
    });
    if (initialValues[name]) new Float32Array(buf.getMappedRange()).set(initialValues[name]!);
    buf.unmap();
    weightBufs[name] = buf;
  }
  const step = (async (x: Float32Array, yInt: Int32Array, readLoss = true) => {
    step.calls.push({ x0: x[0], xLength: x.length, y: Array.from(yInt), readLoss });
    if (!readLoss) return null;
    return [new Float32Array([2.5 - step.calls.length * 0.01])];
  }) as FakeStep;
  step.calls = [];
  step.weightBufs = weightBufs;
  return step;
}

// --- Graph fixtures (the flowToNnvp / getGraphJSON shape) --------------------

// Fixture leaves carry only what the engine's graph probes read — the other
// NnvpLayer fields (class/htmlID/coordinates/...) are deliberately absent.
function leaf(
  id: string, name: string, params: Record<string, ParameterValue> = {},
  inputLayers: string[] = [], outputLayers: string[] = [],
): NnvpLayer {
  return {
    id, name, inputLayers, outputLayers, children: null,
    kerasLayer: { name, parameterValues: params },
  } as unknown as NnvpLayer;
}

function mnistGraph(): NnvpModel {
  return {
    inputs: ['1'],
    // The REAL adapter semantics (flowToNnvp): outputs holds the id of the
    // layer FEEDING the Output node — here the final Dense — not the Output
    // node's own id. graphNumClasses must therefore check its starting node.
    outputs: ['4'],
    layers: [
      leaf('1', 'Input', { shape: [28, 28, 1] }, [], ['2']),
      leaf('2', 'Flatten', {}, ['1'], ['3']),
      leaf('3', 'Dense', { units: 128 }, ['2'], ['4']),
      leaf('4', 'Dense', { units: 10 }, ['3'], ['5']),
      leaf('5', 'Output', {}, ['4'], []),
    ],
  } as unknown as NnvpModel;
}

const TINYGRAD_SOURCE = [
  'from tinygrad import Tensor, nn',
  '',
  '',
  'class Model:',
  '  def __init__(self):',
  '    self.layer_3 = nn.Linear(784, 128)',
  '    self.layer_4 = nn.Linear(128, 10)',
  '',
  '  def __call__(self, x):',
  '    x = x.flatten(1)',
  '    x = self.layer_3(x)',
  '    x = self.layer_4(x)',
  '    return x.softmax()',
  '',
].join('\n');

function makeOpts(overrides: Partial<TrainingPrepareOptions> = {}): TrainingPrepareOptions {
  return {
    generateCode: () => TINYGRAD_SOURCE,
    optimizer: 'sgd',
    optimizerParams: {},
    loss: 'categoricalCrossentropy',
    epochs: 2,
    ...overrides,
  };
}

// A dataset the way google-data-loader exposes it raw: flat sample-major
// pixels (value = its global float index, so subarray offsets are checkable)
// and one class index per sample. Deliberately without the tensor-batch
// methods — the tinygrad engine never calls them.
function makeRawDataset({ samples = 320, pixels = 4 } = {}): TrainingDataset {
  const trainImages = new Float32Array(samples * pixels);
  for (let i = 0; i < trainImages.length; i += 1) trainImages[i] = i;
  const trainLabels = new Uint8Array(samples);
  for (let i = 0; i < samples; i += 1) trainLabels[i] = i % 10;
  return { shape: [pixels], imageByteSize: pixels, trainImages, trainLabels } as unknown as TrainingDataset;
}

function makeEngine({ traceResult = makeTraceResult(), initialValues }: {
  traceResult?: TraceResult;
  initialValues?: Record<string, ArrayLike<number>>;
} = {}) {
  const device = makeFakeDevice();
  const runtime = makeFakeRuntime(traceResult);
  const instantiated: Array<{ runnerJs: string; dev: GPUDevice; weights: Uint8Array }> = [];
  const step = makeFakeStep(device, traceResult.meta, initialValues);
  const engine = createTinygradEngine({
    runtime,
    requestDevice: async () => asGpuDevice(device),
    instantiate: async (runnerJs, dev, weights) => {
      instantiated.push({ runnerJs, dev, weights });
      return step as unknown as RunnerStep;
    },
  });
  return { engine, runtime, device, step, instantiated };
}

// The thrown value's shape IS what each assertion probes (message / stage /
// cause / generatedCode) — localized any at this seam.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rejection = async (promise: Promise<unknown> | unknown): Promise<any> => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected the promise to reject');
};

// Fake workers hand plain { data } objects to onmessage — the one MessageEvent
// field the runtime reads.
const messageEvent = (data: WorkerResponse) => ({ data } as MessageEvent<WorkerResponse>);

// --- Worker protocol (runtime <-> fake worker) --------------------------------

logicTest('tinygradRuntime: one worker, one init, traces answered by id', async ({ expect }) => {
  let created = 0;
  const worker = {
    posted: [] as WorkerRequest[],
    onmessage: null as RuntimeWorker['onmessage'],
    onerror: null as RuntimeWorker['onerror'],
    postMessage(message: WorkerRequest) {
      this.posted.push(message);
      if (message.type === 'init') {
        queueMicrotask(() => this.onmessage!(messageEvent({ id: message.id, ok: true })));
      }
      if (message.type === 'trace') {
        queueMicrotask(() => this.onmessage!(messageEvent({
          id: message.id,
          ok: true,
          result: { runnerJs: `runner-for-${message.modelSource}`, weights: new Uint8Array(0), meta: {} as TraceMeta } as TraceResult,
        })));
      }
    },
  };
  const runtime = createTinygradRuntime({ createWorker: () => { created += 1; return worker; } });
  const request: TraceRequest = {
    modelSource: 'A', inputShape: [1, 28, 28], numClasses: 10,
    learningRate: 0.01, momentum: 0, nesterov: false,
  };
  const [first, second] = await Promise.all([
    runtime.trace(request).promise,
    runtime.trace({ ...request, modelSource: 'B' }).promise,
  ]);
  expect(first.runnerJs).toBe('runner-for-A');
  expect(second.runnerJs).toBe('runner-for-B');
  // The worker is a singleton and Pyodide boots once, even for parallel traces.
  expect(created).toBe(1);
  expect(worker.posted.filter(message => message.type === 'init').length).toBe(1);
  // A later trace reuses the SAME worker (it survives across trainings).
  await runtime.trace({ ...request, modelSource: 'C' }).promise;
  expect(created).toBe(1);
  // Every posted trace carries the full request (what driver.build consumes).
  const posted = worker.posted.find(
    (message): message is Extract<WorkerRequest, { type: 'trace' }> => message.type === 'trace',
  );
  expect(posted!.inputShape).toEqual([1, 28, 28]);
  expect(posted!.numClasses).toBe(10);
  expect(posted!.learningRate).toBe(0.01);
});

logicTest('tinygradRuntime: worker errors reject the matching trace only', async ({ expect }) => {
  const worker = {
    onmessage: null as RuntimeWorker['onmessage'],
    onerror: null as RuntimeWorker['onerror'],
    postMessage(message: WorkerRequest) {
      if (message.type === 'init') {
        queueMicrotask(() => this.onmessage!(messageEvent({ id: message.id, ok: true })));
      }
      if (message.type === 'trace') {
        queueMicrotask(() => this.onmessage!(messageEvent(
          message.modelSource === 'bad'
            ? { id: message.id, ok: false, error: 'Python says no' }
            : { id: message.id, ok: true, result: { runnerJs: 'ok', weights: new Uint8Array(0), meta: {} as TraceMeta } as TraceResult },
        )));
      }
    },
  };
  const runtime = createTinygradRuntime({ createWorker: () => worker });
  const base = {
    inputShape: [4], numClasses: 10, learningRate: 0.01, momentum: 0, nesterov: false,
  };
  const bad = runtime.trace({ ...base, modelSource: 'bad' }).promise;
  const good = runtime.trace({ ...base, modelSource: 'good' }).promise;
  const error = await rejection(bad);
  expect(error.message).toBe('Python says no');
  expect((await good).runnerJs).toBe('ok');
});

logicTest('tinygradRuntime: cancel rejects the pending trace and tells the worker', async ({ expect }) => {
  const replies = new Map<number, () => void>(); // id -> deliver()
  const worker = {
    posted: [] as WorkerRequest[],
    onmessage: null as RuntimeWorker['onmessage'],
    onerror: null as RuntimeWorker['onerror'],
    postMessage(message: WorkerRequest) {
      this.posted.push(message);
      if (message.type === 'init') {
        queueMicrotask(() => this.onmessage!(messageEvent({ id: message.id, ok: true })));
      }
      if (message.type === 'trace') {
        replies.set(message.id, () => this.onmessage!(messageEvent({
          id: message.id, ok: true, result: { runnerJs: 'late', weights: new Uint8Array(0), meta: {} as TraceMeta } as TraceResult,
        })));
      }
    },
  };
  const runtime = createTinygradRuntime({ createWorker: () => worker });
  const handle = runtime.trace({
    modelSource: 'slow', inputShape: [4], numClasses: 10,
    learningRate: 0.01, momentum: 0, nesterov: false,
  });
  const failed = rejection(handle.promise);
  // Let init resolve and the trace get posted before cancelling.
  await new Promise(resolve => setTimeout(resolve, 0));
  handle.cancel();
  expect((await failed).message).toBe('trace cancelled');
  const traceId = worker.posted.find(message => message.type === 'trace')!.id;
  const cancelMessage = worker.posted.find(
    (message): message is Extract<WorkerRequest, { type: 'cancel' }> => message.type === 'cancel',
  );
  expect(cancelMessage!.targetId).toBe(traceId);
  // The late result arriving after the cancel is dropped without effect.
  replies.get(traceId)!();
});

// --- Graph probes -------------------------------------------------------------

logicTest('tinygradEngine: infers channels-first input shape and final-Dense classes from graph JSON', ({ expect }) => {
  // Rank 3 goes channels-first: the board's [h,w,c] becomes tinygrad's [c,h,w].
  expect(graphInputShape(mnistGraph())).toEqual([1, 28, 28]);
  // Rank 1 passes through.
  const flat = mnistGraph();
  flat.layers[0]!.kerasLayer!.parameterValues.shape = [784];
  expect(graphInputShape(flat)).toEqual([784]);
  // num_classes = the units of the last Dense before Output. REGRESSION: the
  // adapter's outputs entry IS that Dense (id '4' here) — the walk once
  // hopped past it before checking and returned the 128 of the Dense behind
  // it, one-hotting bench labels to [*, 128] against a 10-unit head.
  expect(graphNumClasses(mnistGraph())).toBe(10);
  // The feeder being the graph's ONLY Dense (the minimal classifier) — the
  // skip-the-start bug made this throw "not fed by a Dense".
  const minimal = {
    inputs: ['1'],
    outputs: ['2'],
    layers: [
      leaf('1', 'Input', { shape: [784] }, [], ['2']),
      leaf('2', 'Dense', { units: 3 }, ['1'], ['3']),
      leaf('3', 'Output', {}, ['2'], []),
    ],
  } as unknown as NnvpModel;
  expect(graphNumClasses(minimal)).toBe(3);
  // …walking past non-Dense tail layers (a Dropout before the Output) — and
  // this one starts from an Output-NODE id (the legacy/handcrafted encoding),
  // which just costs the walk one extra hop.
  const withDropout = {
    inputs: ['1'],
    outputs: ['9'],
    layers: [
      leaf('1', 'Input', { shape: [784] }, [], ['4']),
      leaf('4', 'Dense', { units: 7 }, ['1'], ['8']),
      leaf('8', 'Dropout', { rate: 0.5 }, ['4'], ['9']),
      leaf('9', 'Output', {}, ['8'], []),
    ],
  } as unknown as NnvpModel;
  expect(graphNumClasses(withDropout)).toBe(7);
});

logicTest('tinygradEngine: graph probes refuse shapes/topologies the pipeline cannot train', ({ expect }) => {
  // Multi-channel rank-3 input: flat HWC bytes are NOT valid NCHW input.
  const cifar = mnistGraph();
  cifar.layers[0]!.kerasLayer!.parameterValues.shape = [32, 32, 3];
  expect(() => graphInputShape(cifar)).toThrow(/not supported by the tinygrad engine yet/);
  // Two Input layers.
  const twoInputs = mnistGraph();
  twoInputs.layers.push(leaf('6', 'Input', { shape: [4] }, [], []));
  expect(() => graphInputShape(twoInputs)).toThrow(/not supported by the tinygrad engine yet/);
  // An Input without a usable shape.
  const shapeless = mnistGraph();
  shapeless.layers[0]!.kerasLayer!.parameterValues.shape = null;
  expect(() => graphInputShape(shapeless)).toThrow(/fully-specified shape/);
  // No final Dense on the way to the Output.
  const noDense = {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { shape: [784] }, [], ['2']),
      leaf('2', 'Flatten', {}, ['1'], ['3']),
      leaf('3', 'Output', {}, ['2'], []),
    ],
  } as unknown as NnvpModel;
  expect(() => graphNumClasses(noDense)).toThrow(/not supported by the tinygrad engine yet/);
});

// --- prepare(): option gating and stage tagging --------------------------------

logicTest('tinygradEngine: unsupported options throw clear errors before any trace', async ({ expect }) => {
  const graphJson = JSON.stringify(mnistGraph());
  const cases = [
    makeOpts({ optimizer: 'adam' }),
    makeOpts({ optimizer: 'rmsprop' }),
    makeOpts({ loss: 'meanSquaredError' }),
    makeOpts({ loss: 'binaryCrossentropy' }),
    makeOpts({ optimizerParams: { rho: 0.9 } }), // not an sgd knob
    makeOpts({ generateCode: () => 'class Model:\n  pass  # TODO: unsupported layer "GaussianNoise"\n' }),
  ];
  for (const opts of cases) {
    const { engine, runtime } = makeEngine();
    const error = await rejection(engine.prepare(graphJson, opts));
    expect(error instanceof TrainingPrepareError).toBe(false); // deliberate, untagged
    expect(error.message).toMatch(/not supported by the tinygrad engine yet/);
    expect(runtime.traceRequests.length).toBe(0); // refused BEFORE the expensive part
  }
  // The refusals name the offending option.
  const { engine } = makeEngine();
  const named = await rejection(engine.prepare(graphJson, makeOpts({ optimizer: 'adam' })));
  expect(named.message).toContain('adam');
  // nesterov without momentum would trip tinygrad's own assert much later.
  const { engine: engine2, runtime: runtime2 } = makeEngine();
  const nesterov = await rejection(engine2.prepare(graphJson, makeOpts({
    optimizerParams: { nesterov: true },
  })));
  expect(nesterov.message).toMatch(/nesterov requires momentum/);
  expect(runtime2.traceRequests.length).toBe(0);
});

logicTest('tinygradEngine: prepare traces with the graph shape and the configured sgd knobs', async ({ expect }) => {
  const { engine, runtime, step, instantiated } = makeEngine();
  const graphJson = JSON.stringify(mnistGraph());
  const session = await engine.prepare(graphJson, makeOpts({
    optimizerParams: { learningRate: 0.05, momentum: 0.9, nesterov: true, extra: '' }, // '' dropped
  }));
  expect(runtime.initCalls).toBe(1);
  expect(runtime.traceRequests).toEqual([{
    modelSource: TINYGRAD_SOURCE,
    inputShape: [1, 28, 28],
    numClasses: 10,
    learningRate: 0.05,
    momentum: 0.9,
    nesterov: true,
  }]);
  // The traced runner (not the generated Python) is what gets instantiated.
  expect(instantiated.length).toBe(1);
  expect(instantiated[0]!.runnerJs).toContain('fake runner');
  // Session contract: no tf model (Inspect shows its hint), graph snapshot kept.
  expect(session.model).toBe(null);
  expect(session.graphJson).toBe(graphJson);
  expect(engine.capabilities).toEqual({ dynamicBatch: false, liveLr: true, canPause: false });
  expect(session.capabilities).toEqual({ dynamicBatch: false, liveLr: true, canPause: false });
  expect(step.calls.length).toBe(0); // prepare never trains
  // Defaults when no params are set: lr 0.01, plain sgd.
  const { engine: engine2, runtime: runtime2 } = makeEngine();
  await engine2.prepare(graphJson, makeOpts());
  expect(runtime2.traceRequests[0]!.learningRate).toBe(0.01);
  expect(runtime2.traceRequests[0]!.momentum).toBe(0);
  expect(runtime2.traceRequests[0]!.nesterov).toBe(false);
});

logicTest('tinygradEngine: prepare tags generation/trace failures as build errors', async ({ expect }) => {
  const graphJson = JSON.stringify(mnistGraph());
  // The generator thunk throwing.
  const { engine } = makeEngine();
  const genError = await rejection(engine.prepare(graphJson, makeOpts({
    generateCode: () => { throw new Error('gen boom'); },
  })));
  expect(genError instanceof TrainingPrepareError).toBe(true);
  expect(genError.stage).toBe('build');
  expect(genError.cause.message).toBe('gen boom');
  // No active graph.
  const { engine: engine2 } = makeEngine();
  const nullError = await rejection(engine2.prepare(graphJson, makeOpts({ generateCode: () => null })));
  expect(nullError.stage).toBe('build');
  // Unparseable graph JSON.
  const { engine: engine3 } = makeEngine();
  const jsonError = await rejection(engine3.prepare('{oops', makeOpts()));
  expect(jsonError instanceof TrainingPrepareError).toBe(true);
  expect(jsonError.stage).toBe('build');
  // The Python trace failing (bad model source reaches exec).
  const device = makeFakeDevice();
  const failingRuntime = {
    async init(): Promise<undefined> {},
    trace: (): TraceHandle => ({ promise: Promise.reject(new Error('trace boom')), cancel() {} }),
  };
  const engine4 = createTinygradEngine({
    runtime: failingRuntime,
    requestDevice: async () => asGpuDevice(device),
    instantiate: async () => { throw new Error('unreachable'); },
  });
  const traceError = await rejection(engine4.prepare(graphJson, makeOpts()));
  expect(traceError instanceof TrainingPrepareError).toBe(true);
  expect(traceError.stage).toBe('build');
  expect(traceError.cause.message).toBe('trace boom');
  expect(traceError.generatedCode).toBe(TINYGRAD_SOURCE);
});

// --- fit(): batching math, loss readback cadence, stop and cancel --------------

logicTest('tinygradEngine: fit slices raw batches, reading the loss at batch 0, every 10th step and the epoch\'s last', async ({ expect }) => {
  const { engine, step } = makeEngine();
  const session = await engine.prepare(JSON.stringify(mnistGraph()), makeOpts({ epochs: 2 }));
  const dataset = makeRawDataset({ samples: 320, pixels: 4 }); // 10 batches of 32
  const batchEnds: Array<[number, BatchLogs]> = [];
  const epochEnds: Array<[number, EpochLogs]> = [];
  await session.fit(dataset, {
    onBatchEnd(batch, logs) { batchEnds.push([batch, logs]); },
    onEpochEnd(epoch, logs) { epochEnds.push([epoch, logs]); },
  });
  // 320 samples / batch 32 = 10 batches per epoch (< the 500-sample slice), 2 epochs.
  expect(step.calls.length).toBe(20);
  // Readback cadence: batch 0 (the FIRST chart/benchmark loss, after one
  // update — same index tfjs reports first) plus every 10th step and the
  // epoch's last; here cadence and epoch-end coincide at in-epoch index 9.
  step.calls.forEach((call, i) => expect(call.readLoss).toBe(i % 10 === 0 || i % 10 === 9));
  // Batch data: 32 samples x 4 pixels, values are global float indices.
  expect(step.calls[0]!.x0).toBe(0);
  expect(step.calls[0]!.xLength).toBe(32 * 4);
  expect(step.calls[1]!.x0).toBe(32 * 4);
  // Labels are Int32 class indices straight off trainLabels.
  expect(step.calls[0]!.y.slice(0, 12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);
  // Epoch 2 trains the SAME fixed window (mirrors tfjs re-fitting its slice).
  expect(step.calls[10]!.x0).toBe(0);
  // onBatchEnd fired ONLY on readback steps, with a real loss and no acc.
  expect(batchEnds.map(([batch]) => batch)).toEqual([0, 9, 0, 9]);
  for (const [, logs] of batchEnds) {
    expect(Number.isFinite(logs.loss)).toBe(true);
    expect(logs.acc).toBe(undefined);
  }
  // onEpochEnd carries the last read loss (its epoch's batch-9 readback).
  expect(epochEnds.map(([epoch]) => epoch)).toEqual([0, 1]);
  expect(epochEnds[0]![1].loss).toBe(batchEnds[1]![1].loss);
  expect(epochEnds[1]![1].loss).toBe(batchEnds[3]![1].loss);
  expect(epochEnds[0]![1].val_loss).toBe(undefined);
});

logicTest('tinygradEngine: fit caps an epoch at the historical 500-sample slice', async ({ expect }) => {
  const { engine, step } = makeEngine();
  const session = await engine.prepare(JSON.stringify(mnistGraph()), makeOpts({ epochs: 1 }));
  // Plenty of data: an epoch still consumes floor(500/32) = 15 batches.
  await session.fit(makeRawDataset({ samples: 3200, pixels: 4 }), {});
  expect(step.calls.length).toBe(15);
  // Readbacks at in-epoch steps 0 (first loss), 9 (cadence) and 14 (epoch end).
  expect(step.calls.map(call => call.readLoss).filter(Boolean).length).toBe(3);
  expect(step.calls[0]!.readLoss).toBe(true);
  expect(step.calls[9]!.readLoss).toBe(true);
  expect(step.calls[14]!.readLoss).toBe(true);
});

logicTest('tinygradEngine: stop() aborts between steps; a throwing callback cancels', async ({ expect }) => {
  const { engine, step } = makeEngine();
  const session = await engine.prepare(JSON.stringify(mnistGraph()), makeOpts({ epochs: 5 }));
  const dataset = makeRawDataset({ samples: 320, pixels: 4 });
  const epochEnds: number[] = [];
  await session.fit(dataset, {
    onBatchEnd() { session.stop(); }, // first readback (epoch 0, batch 0)
    onEpochEnd(epoch) { epochEnds.push(epoch); },
  });
  // The step in flight completed, nothing after it ran — not even onEpochEnd.
  expect(step.calls.length).toBe(1);
  expect(epochEnds).toEqual([]);
  // watchTraining's cancel path: a throwing callback rejects the fit.
  const { engine: engine2 } = makeEngine();
  const session2 = await engine2.prepare(JSON.stringify(mnistGraph()), makeOpts({ epochs: 5 }));
  let rejected: unknown = null;
  try {
    await session2.fit(dataset, { onBatchEnd() { throw 'cancelRequested'; } });
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBe('cancelRequested');
  // A dataset without the raw arrays is refused loudly.
  const { engine: engine3 } = makeEngine();
  const session3 = await engine3.prepare(JSON.stringify(mnistGraph()), makeOpts());
  const noRaw = await rejection(session3.fit({ shape: [4] } as TrainingDataset, {}));
  expect(noRaw.message).toMatch(/raw trainImages/);
});

// --- Weight I/O over the (fake) GPU buffers -------------------------------------

logicTest('tinygradEngine: getWeights/setWeights round-trip the safetensors state names', async ({ expect }) => {
  const traceResult = makeTraceResult();
  const initialValues = {
    'opt.params.0': Float32Array.from({ length: 6 }, (_, i) => i + 0.5),
    'opt.params.1': Float32Array.from([7, 8, 9]),
    'opt.b.0': new Float32Array(6), // momentum starts zero
    'opt.lr': Float32Array.from([0.05]),
  };
  const { engine } = makeEngine({ traceResult, initialValues });
  const session = await engine.prepare(JSON.stringify(mnistGraph()), makeOpts());
  // Names are the safetensors state names, values the exact buffer bytes.
  const weights = await session.getWeights();
  expect(Object.keys(weights).sort()).toEqual(traceResult.meta.stateEntries.slice().sort());
  expect(Array.from(weights['opt.params.0']!)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
  expect(Array.from(weights['opt.lr']!)).toEqual([Math.fround(0.05)]);
  // Write back through the seam and read it again (full round-trip).
  await session.setWeights({ 'opt.params.0': Float32Array.from([9, 8, 7, 6, 5, 4]) });
  const after = await session.getWeights();
  expect(Array.from(after['opt.params.0']!)).toEqual([9, 8, 7, 6, 5, 4]);
  // Unnamed entries stay untouched.
  expect(Array.from(after['opt.params.1']!)).toEqual([7, 8, 9]);
  // A size mismatch is refused (would corrupt the buffer silently).
  const sizeError = await rejection(session.setWeights({ 'opt.params.1': new Float32Array(2) }));
  expect(sizeError.message).toContain('opt.params.1');
});

logicTest('tinygradEngine: weight I/O enforces the COPY_SRC/COPY_DST usage flags', async ({ expect }) => {
  // The staging sequences only work because the runner patch adds
  // COPY_SRC | COPY_DST to the weight buffers — a buffer without them fails
  // here exactly like it would on a real device.
  const device = makeFakeDevice();
  const storageOnly = device.createBuffer({ size: 16, usage: USAGE.STORAGE });
  const readError = await rejection(readWeightBuf(asGpuDevice(device), asGpuBuffer(storageOnly)));
  expect(readError.message).toContain('COPY_SRC');
  const writeError = await rejection(writeWeightBuf(asGpuDevice(device), asGpuBuffer(storageOnly), new Float32Array(4)));
  expect(writeError.message).toContain('COPY_DST');
  // With the patched flags both directions round-trip byte-exact.
  const patched = device.createBuffer({
    size: 16, usage: USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST,
  });
  await writeWeightBuf(asGpuDevice(device), asGpuBuffer(patched), Float32Array.from([1, 2, 3, 4]));
  expect(Array.from(await readWeightBuf(asGpuDevice(device), asGpuBuffer(patched)))).toEqual([1, 2, 3, 4]);
});

logicTest('tinygradEngine: evaluateLogits boots the eval runner lazily and syncs live weights into it', async ({ expect }) => {
  const traceResult = makeTraceResult();
  traceResult.meta.aliases = { 'opt.params.0': 'model.layer.weight' };
  const device = makeFakeDevice();
  const runtime = makeFakeRuntime(traceResult);
  const step = makeFakeStep(device, traceResult.meta, { 'opt.params.0': [1, 2, 3, 4, 5, 6] });
  // Fake eval runner: one weight buffer keyed by the MODEL alias name, and a
  // callable returning flat logits.
  const evalBuf = device.createBuffer({
    size: 24, usage: USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST, mappedAtCreation: true,
  });
  evalBuf.unmap();
  interface FakeEvalStep {
    (x: Float32Array): Promise<Float32Array[]>;
    calls: number[];
    weightBufs: Record<string, FakeBuffer>;
  }
  const evalStep = (async (x: Float32Array) => { evalStep.calls.push(x.length); return [new Float32Array([9, 1, 0, 0])]; }) as FakeEvalStep;
  evalStep.calls = [];
  evalStep.weightBufs = { 'model.layer.weight': evalBuf };
  const instantiated: string[] = [];
  const engine = createTinygradEngine({
    runtime,
    requestDevice: async () => asGpuDevice(device),
    instantiate: async (runnerJs) => {
      instantiated.push(runnerJs);
      return (runnerJs.includes('eval') ? evalStep : step) as unknown as RunnerStep;
    },
  });
  const session = await engine.prepare(JSON.stringify(mnistGraph()), makeOpts());
  expect(instantiated).toHaveLength(1); // eval runner NOT built until needed
  const logits = await session.evaluateLogits!(new Float32Array(4));
  expect(instantiated).toHaveLength(2);
  expect(instantiated[1]).toContain('eval');
  expect(Array.from(logits)).toEqual([9, 1, 0, 0]);
  expect(evalStep.calls).toEqual([4]);
  // The training weights were GPU-copied into the eval buffer via the alias.
  expect(Array.from(new Float32Array(evalBuf.backing.buffer, evalBuf.backing.byteOffset, 6)))
    .toEqual([1, 2, 3, 4, 5, 6]);
  // Second call reuses the instantiated runner.
  await session.evaluateLogits!(new Float32Array(4));
  expect(instantiated).toHaveLength(2);
});
