/**
 * The Web Worker implementation of the TrainingEngine seam (see ./engine.ts):
 * tfjs prepare/fit run inside ./trainingWorker.ts, so the generated code's
 * eval and the training math happen off the main thread — no DOM, no
 * localStorage, no auth token in scope, and no jank while training. This
 * side only draws raw dataset slices, speaks ./workerProtocol.ts, and maps
 * progress events back onto TrainingCallbacks.
 *
 * Deliberate contract differences from the tfjs engine, all visible through
 * capabilities or documented on the seam (the tinygradEngine discipline):
 *   - `session.model` is null — the tf model never leaves the worker.
 *     TrainingZone's hasTrainedModel stays false, so InspectPanel shows its
 *     "train a model first" hint and the phase-boundary text samples are
 *     skipped (both already handle null; the tinygrad engine proved it).
 *   - liveLr is false: there is no protocol message to touch the optimizer
 *     mid-fit yet (tinygrad gets it for free via its lr weight buffer).
 *   - getWeights/setWeights are async (a protocol round-trip).
 *   - fit needs the dataset's RAW draws (nextTrainBatchRaw/nextTestBatchRaw
 *     + numClasses) — both JSDatasets loaders provide them; the slices are
 *     freshly allocated per fit and their buffers are TRANSFERRED, not
 *     copied.
 *   - no window.nnvp.debug.trainingConfig/compiledModel exposure and no
 *     "[TrainingZone]" config logs (they live on the main-thread engine; the
 *     training e2e suites that parse them pin the DEFAULT engine).
 *
 * The default worker is a module singleton (the TinygradRuntime pattern): tf
 * loads once per page, each prepare() replaces the worker's model, and a new
 * prepare takes over the message channel — sessions from an earlier prepare
 * go stale, which the one-active-run rule already guarantees. Tests inject
 * `makeWorker` and drive the protocol against an in-process pair.
 */

import type {
  FitOptions, NamedWeights, TrainingCallbacks, TrainingDataset, TrainingEngine,
  TrainingPrepareOptions, TrainingSession,
} from './engine';
import { TrainingPrepareError } from './engine';
import { PROTOCOL_VERSION, transferablesOf } from './workerProtocol';
import type { WorkerCommand, WorkerEvent } from './workerProtocol';

/** The worker surface the engine drives: a real Worker, or a test fake. */
export interface TrainingWorkerLike {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerCommand, transfer?: Transferable[]): void;
}

// Historical demo-trainer constants, mirrored from tfjsEngine (same fixed
// slice sizes per fit, same default batch size — cross-engine parity).
const BATCH_SIZE = 64;
const TRAIN_DATA_SIZE = 500;
const TEST_DATA_SIZE = 100;

const capabilities = Object.freeze({ dynamicBatch: true, liveLr: false, canPause: true });

let sharedWorker: TrainingWorkerLike | null = null;

/** The app-wide training worker — ONE per page, surviving across trainings. */
function getSharedTrainingWorker(): TrainingWorkerLike {
  if (!sharedWorker) {
    sharedWorker = new Worker(
      new URL('./trainingWorker.ts', import.meta.url), { type: 'module' },
    ) as unknown as TrainingWorkerLike;
  }
  return sharedWorker;
}

interface PendingEntry {
  resolve: (event: WorkerEvent) => void;
  reject: (error: Error) => void;
}

/** The in-flight fit's callback routing state (one fit at a time). */
interface ActiveFit {
  id: number;
  callbacks: TrainingCallbacks;
  /** Set when a callback threw: suppress further callbacks, reject with it. */
  thrown?: { value: unknown };
}

export function createWorkerEngine(
  { makeWorker }: { makeWorker?: () => TrainingWorkerLike } = {},
): TrainingEngine {
  let worker: TrainingWorkerLike | null = null;
  let nextId = 1;
  const pending = new Map<number, PendingEntry>();
  let activeFit: ActiveFit | null = null;

  const failAll = (error: Error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    // Next prepare boots/claims a fresh channel — the shared slot included,
    // or every later run would keep talking to a dead Worker.
    if (worker === sharedWorker) sharedWorker = null;
    worker = null;
  };

  const routeProgress = (event: Extract<WorkerEvent, { type: 'batch' | 'epoch' }>) => {
    const fit = activeFit;
    if (!fit || fit.id !== event.id || fit.thrown) return;
    try {
      if (event.type === 'batch') fit.callbacks.onBatchEnd?.(event.batch, event.logs);
      else fit.callbacks.onEpochEnd?.(event.epoch, event.logs);
    } catch (value) {
      // The seam's cancel contract: a throwing callback cancels the fit.
      // Remember the exact thrown value (runController compares by identity),
      // stop forwarding, and ask the worker to stop; the fit promise rejects
      // with the value once the worker winds down.
      fit.thrown = { value };
      post({ v: PROTOCOL_VERSION, id: nextId++, type: 'stop' }).catch(() => {});
    }
  };

  const ensureWorker = (): TrainingWorkerLike => {
    if (!worker) {
      worker = makeWorker ? makeWorker() : getSharedTrainingWorker();
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'batch' || message.type === 'epoch') {
          routeProgress(message);
          return;
        }
        const entry = pending.get(message.id);
        if (!entry) return; // stale (a previous engine's traffic) — drop it
        pending.delete(message.id);
        if (message.type === 'error') {
          const error = new Error(message.message);
          // Smuggle the wire stage to the requester (prepare re-tags it).
          (error as Error & { stage?: 'build' | 'create' | null }).stage = message.stage;
          entry.reject(error);
        } else {
          entry.resolve(message);
        }
      };
      worker.onerror = (event) => {
        failAll(new Error(
          `training worker crashed: ${event && event.message ? event.message : String(event)}`,
        ));
      };
    }
    return worker;
  };

  const post = (command: WorkerCommand): Promise<WorkerEvent> => new Promise(
    (resolve, reject) => {
      pending.set(command.id, { resolve, reject });
      ensureWorker().postMessage(command, transferablesOf(command));
    },
  );

  return {
    capabilities,
    async prepare(graphJson: string | null, opts: TrainingPrepareOptions): Promise<TrainingSession> {
      // The generateCode thunk runs HERE, on the main thread — its errors
      // (CyclicGraphError included) keep their identity and their tagging,
      // exactly as with the tfjs engine; only the output STRING crosses.
      let generatedCode: string | null | undefined;
      try {
        generatedCode = opts.generateCode();
      }
      catch (error) {
        throw new TrainingPrepareError('build', error, generatedCode);
      }
      try {
        await post({
          v: PROTOCOL_VERSION,
          id: nextId++,
          type: 'prepare',
          code: generatedCode,
          optimizer: opts.optimizer,
          optimizerParams: opts.optimizerParams,
          loss: opts.loss,
        });
      }
      catch (error) {
        // Worker-side eval/createModel failures come back stage-tagged; the
        // rest (tf load, compile, protocol) stays untagged, as it always has.
        const stage = (error as Error & { stage?: 'build' | 'create' | null }).stage;
        if (stage === 'build') throw new TrainingPrepareError('build', error, generatedCode);
        if (stage === 'create') throw new TrainingPrepareError('create', error);
        throw error;
      }
      const { epochs } = opts;
      const batchSize = opts.batchSize !== undefined ? opts.batchSize : BATCH_SIZE;
      return {
        // The model lives in the worker: null here (tinygradEngine precedent
        // — InspectPanel shows its train-first hint on a null model).
        model: null,
        graphJson,
        capabilities,
        async fit(dataset: TrainingDataset, fitCallbacks: TrainingCallbacks, fitOptions?: FitOptions) {
          if (!dataset.nextTrainBatchRaw || !dataset.nextTestBatchRaw
            || typeof dataset.numClasses !== 'number') {
            throw new Error(
              'the worker engine needs a dataset with raw batch draws '
              + '(nextTrainBatchRaw/nextTestBatchRaw + numClasses)',
            );
          }
          // One raw train/test slice per fit segment, freshly drawn (their
          // buffers are transferred to the worker) — the tfjsEngine slice
          // discipline, minus the tensors.
          const trainCount = dataset.trainSliceSize !== undefined ? dataset.trainSliceSize : TRAIN_DATA_SIZE;
          const testCount = dataset.testSliceSize !== undefined ? dataset.testSliceSize : TEST_DATA_SIZE;
          const train = dataset.nextTrainBatchRaw(trainCount);
          const test = dataset.nextTestBatchRaw(testCount);
          const id = nextId++;
          const fitState: ActiveFit = { id, callbacks: fitCallbacks };
          activeFit = fitState;
          try {
            await post({
              v: PROTOCOL_VERSION,
              id,
              type: 'fit',
              trainXs: train.xs,
              trainLabels: train.labels,
              testXs: test.xs,
              testLabels: test.labels,
              trainCount,
              testCount,
              shape: dataset.shape.slice(),
              numClasses: dataset.numClasses,
              batchSize,
              epochs: fitOptions?.epochs !== undefined ? fitOptions.epochs : epochs,
              initialEpoch: fitOptions?.initialEpoch !== undefined ? fitOptions.initialEpoch : 0,
            });
          }
          catch (error) {
            // A callback threw mid-fit: the seam promises rejection with the
            // THROWN VALUE, whatever the worker's wind-down reported.
            if (fitState.thrown) throw fitState.thrown.value;
            throw error;
          }
          finally {
            if (activeFit === fitState) activeFit = null;
          }
          if (fitState.thrown) throw fitState.thrown.value;
          return undefined;
        },
        async getWeights(): Promise<NamedWeights> {
          const event = await post({ v: PROTOCOL_VERSION, id: nextId++, type: 'getWeights' });
          return (event as Extract<WorkerEvent, { type: 'weights' }>).weights;
        },
        // Values cross by copy (never transferred): callers keep their arrays.
        async setWeights(named: NamedWeights): Promise<void> {
          await post({ v: PROTOCOL_VERSION, id: nextId++, type: 'setWeights', weights: named });
        },
        // Engine-native stop: the worker finishes the batch in flight, then
        // the running fit RESOLVES (the pause path).
        stop() {
          post({ v: PROTOCOL_VERSION, id: nextId++, type: 'stop' }).catch(() => {});
        },
        // Forward-only probe in the worker; the input crosses by copy (it is
        // often a view into a buffer the caller keeps slicing).
        async evaluateLogits(x: Float32Array): Promise<Float32Array> {
          const event = await post({ v: PROTOCOL_VERSION, id: nextId++, type: 'evalLogits', x });
          return (event as Extract<WorkerEvent, { type: 'logits' }>).x;
        },
      };
    },
  };
}
