/**
 * The tinygrad implementation of the TrainingEngine seam (see ./engine.ts),
 * productizing the experiments/pyodide-tinygrad pipeline: the generated
 * tinygrad model source is traced to a WebGPU runner by Pyodide in a worker
 * (lib/TinygradRuntime), the runner is blob-imported on the main thread, and
 * fit() loops its pre-recorded step() on raw dataset batches.
 *
 * Deliberate contract differences from the tfjs engine, all visible to the UI
 * through capabilities or documented on the seam:
 *   - batch size is baked into the trace (dynamicBatch: false, meta.batchSize);
 *   - accuracy is not available (the only probe is the training step's loss),
 *     so batch/epoch logs carry `acc: undefined` — watchTraining/LineChart
 *     skip null-ish points;
 *   - the loss is read back only at batch 0, every LOSS_READBACK_EVERY-th
 *     step and the epoch's last step (a measured 4-30x win: the readback
 *     fence dominates on immature WebGPU stacks), so onBatchEnd fires only
 *     on readback steps — batch 0 included, so the first chart point (and a
 *     benchmark's "first loss") lands after ONE update, exactly like tfjs;
 *   - getWeights/setWeights are async (GPU readback), names are the
 *     safetensors state names (opt.params.* / opt.b.* / opt.lr);
 *   - anything the trace pipeline cannot faithfully train THROWS from
 *     prepare() — it never silently trains something else.
 */
import type {
  NamedWeights, TrainingCallbacks, TrainingDataset, TrainingEngine,
  TrainingPrepareOptions, TrainingSession,
} from './engine';
import { TrainingPrepareError } from './engine';
import {
  acquireWebGpuDevice, getSharedRuntime, instantiateRunner,
} from '../TinygradRuntime/runtime';
import type { RunnerStep } from '../TinygradRuntime/runtime';
import { snapshotWeightBufs, syncWeightBufs, writeWeightBuf } from '../TinygradRuntime/weightIO';
import type { TraceMeta, TraceResult } from '../TinygradRuntime/protocol';
import type { NnvpLayer, NnvpModel } from '../../types/model';

// Mirror the tfjs engine's historical demo-trainer slice: ~500 train samples
// per epoch (fit consumes floor(500 / meta.batchSize) batches per epoch),
// and — like tfjs re-fitting its one fixed slice — every epoch of a fit
// trains the SAME window, so cross-engine loss curves see the same data.
const TRAIN_DATA_SIZE = 500;
// Sync the loss every N-th step only; the other steps skip the readback fence.
const LOSS_READBACK_EVERY = 10;

const SUPPORTED_LOSSES = ['categoricalCrossentropy', 'sparseCategoricalCrossentropy'];
const SGD_PARAMS = ['learningRate', 'momentum', 'nesterov'];

// canPause: false — the traced pipeline COULD pause at a step boundary, but
// resume-with-fit-options is not wired; the pause UI hides itself.
const capabilities = Object.freeze({ dynamicBatch: false, liveLr: true, canPause: false });

const unsupported = (what: string): Error => new Error(`${what} is not supported by the tinygrad engine yet`);

// --- Graph probes (exported for the dual-mode tests) -------------------------

function collectLayers(layers: NnvpLayer[] | null | undefined, out: NnvpLayer[] = []): NnvpLayer[] {
  for (const layer of layers || []) {
    out.push(layer);
    if (Array.isArray(layer.children)) collectLayers(layer.children, out);
  }
  return out;
}

const layerName = (layer: NnvpLayer): string | null => (layer.kerasLayer ? layer.kerasLayer.name : null);

/**
 * The traced model's per-sample input shape, from the graph's Input layer —
 * channels-FIRST for rank 3 ([h,w,c] on the board -> [c,h,w] for tinygrad).
 */
export function graphInputShape(graph: NnvpModel): number[] {
  const inputs = collectLayers(graph.layers).filter(layer => layerName(layer) === 'Input');
  if (inputs.length !== 1) throw unsupported(`a graph with ${inputs.length} Input layers`);
  const shape = inputs[0]!.kerasLayer!.parameterValues && inputs[0]!.kerasLayer!.parameterValues.shape;
  if (!Array.isArray(shape) || shape.length === 0 || !shape.every(dim => typeof dim === 'number' && dim > 0)) {
    throw new Error('the Input layer needs a fully-specified shape to train with the tinygrad engine');
  }
  if (shape.length === 3) {
    const [h, w, c] = shape as [number, number, number];
    // The demo datasets feed flat HWC bytes straight into the NCHW runner —
    // only identical for c=1 (MNIST-likes); more channels would need a
    // transpose nobody performs yet.
    if (c !== 1) throw unsupported(`a ${c}-channel input (needs an HWC->CHW transpose)`);
    return [c, h, w];
  }
  return shape.slice();
}

/**
 * num_classes = the units of the last Dense on the way to the Output node.
 * NOTE the adapter's semantics (flowToNnvp): `graph.outputs` holds the id of
 * the layer FEEDING each Output node, not the Output node itself — so the
 * walk must check the node it STARTS on (usually the final Dense) before
 * hopping to its inputs. Both encodings walk correctly here (an Output node
 * id just costs one extra hop).
 */
export function graphNumClasses(graph: NnvpModel): number {
  if (!Array.isArray(graph.outputs) || graph.outputs.length !== 1) {
    throw unsupported(`a graph with ${(graph.outputs || []).length} Output layers`);
  }
  const all = collectLayers(graph.layers);
  const byId = new Map(all.map((layer): [string, NnvpLayer] => [String(layer.id), layer]));
  let current = byId.get(String(graph.outputs[0]));
  for (let hops = 0; current && hops <= all.length; hops += 1) {
    if (layerName(current) === 'Dense') {
      const units = current.kerasLayer!.parameterValues && current.kerasLayer!.parameterValues.units;
      if (typeof units === 'number' && units > 0) return units;
      break;
    }
    const sources = current.inputLayers || [];
    if (sources.length !== 1) break; // merges/dead-ends: no single final Dense
    current = byId.get(String(sources[0]));
  }
  throw unsupported('a graph whose Output is not fed by a Dense layer (num_classes)');
}

// --- Session -----------------------------------------------------------------

interface TinygradSessionInit {
  device: GPUDevice;
  step: RunnerStep;
  meta: TraceMeta;
  graphJson: string | null;
  epochs: number;
  makeEvalStep: (() => Promise<RunnerStep>) | null;
}

function createSession({ device, step, meta, graphJson, epochs, makeEvalStep }: TinygradSessionInit): TrainingSession {
  let stopRequested = false;
  let evalStepPromise: Promise<RunnerStep> | null = null;
  return {
    // tfjs-specific (the Inspect tab probes tf models): null keeps
    // hasTrainedModel false so InspectPanel shows its "train a model first"
    // hint instead of breaking on a non-tf value.
    model: null,
    graphJson,
    capabilities,
    // Batches of meta.batchSize straight off the dataset's raw arrays
    // (Float32Array pixel subarrays + Int32Array class labels) — no tf
    // tensors anywhere near this engine.
    async fit(dataset: TrainingDataset, fitCallbacks: TrainingCallbacks) {
      const { batchSize } = meta;
      const pixels = dataset.imageByteSize;
      const { trainImages, trainLabels } = dataset;
      if (!trainImages || !trainLabels || !pixels) {
        throw new Error('the tinygrad engine needs a dataset with raw trainImages/trainLabels arrays');
      }
      const totalBatches = Math.floor(trainImages.length / pixels / batchSize);
      if (totalBatches < 1) throw new Error('the dataset is smaller than one training batch');
      const perEpoch = Math.min(Math.max(1, Math.floor(TRAIN_DATA_SIZE / batchSize)), totalBatches);
      let lastLoss = NaN;
      const yInt = new Int32Array(batchSize);
      for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (let batch = 0; batch < perEpoch; batch += 1) {
          if (stopRequested) return;
          const at = batch; // same fixed window every epoch (mirrors tfjs's slice)
          const x = trainImages.subarray(at * batchSize * pixels, (at + 1) * batchSize * pixels);
          for (let i = 0; i < batchSize; i += 1) yInt[i] = trainLabels[at * batchSize + i]!;
          const readLoss = batch === 0
            || batch % LOSS_READBACK_EVERY === LOSS_READBACK_EVERY - 1
            || batch === perEpoch - 1;
          const out = await step(x, yInt, readLoss); // eslint-disable-line no-await-in-loop
          if (readLoss) {
            lastLoss = out[0]![0]!;
            // Callbacks may throw to cancel (watchTraining's stop path) —
            // let it propagate and reject the fit.
            if (fitCallbacks.onBatchEnd) fitCallbacks.onBatchEnd(batch, { loss: lastLoss, acc: undefined });
          }
        }
        if (stopRequested) return;
        if (fitCallbacks.onEpochEnd) {
          fitCallbacks.onEpochEnd(epoch, {
            loss: lastLoss, acc: undefined, val_loss: undefined, val_acc: undefined,
          });
        }
      }
    },
    // Named-weight access over the runner's GPU buffers; names are the
    // safetensors state names, values include the full optimizer state.
    getWeights(): Promise<NamedWeights> {
      // Cast: weightIO.js is untyped, but snapshotWeightBufs resolves to
      // {stateName: Float32Array} by construction.
      return snapshotWeightBufs(device, step.weightBufs) as Promise<NamedWeights>;
    },
    // Writes back the names present in `named`; others are left untouched.
    // Training continues from whatever was written.
    async setWeights(named: NamedWeights) {
      for (const name of Object.keys(step.weightBufs)) {
        const values = named[name];
        if (values === undefined) continue; // eslint-disable-line no-continue
        if (values.length * 4 !== step.weightBufs[name]!.size) {
          throw new Error(`${name}: got ${values.length} floats, buffer holds ${step.weightBufs[name]!.size / 4}`);
        }
        await writeWeightBuf(device, step.weightBufs[name]!, values); // eslint-disable-line no-await-in-loop
      }
    },
    // Abort between steps: the loop checks before every step and after each
    // epoch, so the step in flight completes and fit() resolves.
    stop() {
      stopRequested = true;
    },
    // Forward-only logits on one batch (meta.batchSize), dropout inactive:
    // the eval runner is instantiated lazily on first use, and the CURRENT
    // training weights are GPU-copied into it before every evaluation.
    async evaluateLogits(x: Float32Array): Promise<Float32Array> {
      if (!makeEvalStep) throw new Error('this trace has no eval runner');
      if (!evalStepPromise) evalStepPromise = makeEvalStep();
      const evalStep = await evalStepPromise;
      syncWeightBufs(device, step.weightBufs, evalStep.weightBufs, meta.aliases || {});
      const [logits] = await evalStep(x);
      return logits!;
    },
  };
}

// --- Engine --------------------------------------------------------------------

export function createTinygradEngine({
  runtime = getSharedRuntime(),
  requestDevice = acquireWebGpuDevice,
  instantiate = instantiateRunner,
} = {}): TrainingEngine {
  return {
    capabilities,
    async prepare(graphJson: string | null, opts: TrainingPrepareOptions): Promise<TrainingSession> {
      const { optimizer, loss, epochs } = opts;
      // Refuse anything the trace pipeline would not faithfully train.
      if (optimizer !== 'sgd') throw unsupported(`the "${optimizer}" optimizer (only sgd)`);
      if (!SUPPORTED_LOSSES.includes(loss)) throw unsupported(`the "${loss}" loss`);
      const params = Object.fromEntries(
        Object.entries(opts.optimizerParams).filter(([, v]) => v !== undefined && v !== null && v !== '')
      );
      for (const name of Object.keys(params)) {
        if (!SGD_PARAMS.includes(name)) throw unsupported(`the "${name}" optimizer parameter`);
      }
      const learningRate = params.learningRate !== undefined ? Number(params.learningRate) : 0.01;
      const momentum = params.momentum !== undefined ? Number(params.momentum) : 0;
      const nesterov = !!params.nesterov;
      if (nesterov && !(momentum > 0)) {
        throw new Error('nesterov requires momentum > 0 (tinygrad engine)');
      }

      // Same stage tagging as the tfjs engine: generation/trace problems are
      // graph problems ('build'); everything else stays untagged.
      let generatedCode: string | null | undefined;
      let inputShape: number[];
      let numClasses: number;
      try {
        generatedCode = opts.generateCode();
        if (generatedCode === null) throw new Error('no active graph');
        if ((window as Window & { nnvp?: { debug?: { enableTraining?: boolean } } }).nnvp?.debug?.enableTraining) {
          console.log('[TrainingZone] Generated tinygrad code:\n', generatedCode);
        }
      }
      catch (error) {
        throw new TrainingPrepareError('build', error, generatedCode);
      }
      // The generator marks everything it cannot map with a loud TODO comment
      // — tracing that would train a silently different architecture.
      const todo = generatedCode.split('\n').find(line => line.includes('# TODO'));
      if (todo) throw unsupported(`this graph (generator: "${todo.trim().replace(/^#\s*TODO:\s*/, '')}")`);
      let graph: NnvpModel;
      try {
        graph = JSON.parse(graphJson!);
      }
      catch (error) {
        throw new TrainingPrepareError('build', error, generatedCode);
      }
      inputShape = graphInputShape(graph); // unsupported/incomplete graphs throw their clear errors
      numClasses = graphNumClasses(graph);

      // Backend boot (Pyodide + wheel): untagged, like the tfjs loadTf stage.
      await runtime.init();
      let traced: TraceResult;
      try {
        traced = await runtime.trace({
          modelSource: generatedCode, inputShape, numClasses, learningRate, momentum, nesterov,
        }).promise;
      }
      catch (error) {
        throw new TrainingPrepareError('build', error, generatedCode);
      }
      const device = await requestDevice();
      const step: RunnerStep = await instantiate(traced.runnerJs, device, traced.weights);
      // The eval runner shares the safetensors blob (it loads the model.*
      // alias entries) and is only instantiated when evaluateLogits is used.
      const makeEvalStep = traced.evalJs
        ? (): Promise<RunnerStep> => instantiate(traced.evalJs, device, traced.weights)
        : null;
      return createSession({
        device, step, meta: traced.meta, graphJson, epochs, makeEvalStep,
      });
    },
  };
}
