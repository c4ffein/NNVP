/**
 * The training-engine seam.
 *
 * A TrainingEngine turns the current board graph plus the Training zone's
 * compile options into a TrainingSession the UI can fit, stop and inspect
 * without knowing which backend does the math. Implementations today:
 * createTfjsEngine (./tfjsEngine.js), a pure extraction of the historical
 * TrainingZone.vue training path, and createTinygradEngine
 * (./tinygradEngine.js), the Pyodide-traced WebGPU pipeline behind the
 * experimental settings flag.
 *
 * Backend values (tensors, models) cross the seam as `unknown` on purpose:
 * this module must stay importable (and type-checked) without pulling
 * @tensorflow/tfjs types in.
 */

/** What an engine can (not) do; the UI adapts instead of feature-detecting. */
export interface TrainingCapabilities {
  /** fit() honors a per-run batch size (not a fixed compile-time one). */
  readonly dynamicBatch: boolean;
  /** The learning rate can be adjusted while a fit is in flight. */
  readonly liveLr: boolean;
  /**
   * stop() mid-fit keeps the session warm (weights AND optimizer state), and
   * a follow-up fit(..., { epochs, initialEpoch }) continues training — the
   * pause/resume contract lib/Training/runController builds on. Engines
   * without it (the traced tinygrad pipeline, for now) get no pause UI.
   */
  readonly canPause: boolean;
}

/**
 * Per-fit overrides for resuming a paused run: train `epochs` MORE epochs,
 * reporting epoch numbers starting at `initialEpoch` (so charts and the run
 * journal stay on one absolute epoch axis across pause boundaries).
 */
export interface FitOptions {
  readonly epochs?: number;
  readonly initialEpoch?: number;
}

/**
 * Per-batch metrics, as watchTraining's onBatchEnd consumes them. Metrics an
 * engine cannot measure are `undefined` (the tinygrad engine has no accuracy
 * probe) — watchTraining pushes them through and LineChart skips null-ish
 * points, so a missing metric shows as a gap, never a crash.
 */
export interface BatchLogs {
  readonly loss: number;
  readonly acc: number | undefined;
}

/** Per-epoch metrics, as watchTraining's onEpochEnd consumes them. */
export interface EpochLogs {
  readonly loss: number;
  readonly acc: number | undefined;
  readonly val_loss: number | undefined;
  readonly val_acc: number | undefined;
}

/**
 * The callbacks a fit() reports through — exactly the subset of tfjs fit
 * callbacks that lib/ModelTrainer/watchTraining.js wires to the charts.
 * Throwing from a callback cancels the fit (that IS the stop-button path).
 */
export interface TrainingCallbacks {
  onBatchEnd?(batch: number, logs: BatchLogs): void;
  onEpochEnd?(epoch: number, logs: EpochLogs): void;
}

/**
 * What fit() needs from a dataset — the shape of
 * lib/JSDatasets/google-data-loader. xs/labels are backend tensors.
 * The raw fields are the loader's flat arrays; the tinygrad engine slices its
 * batches straight off them (no tensors cross that seam).
 */
export interface TrainingDataset {
  readonly shape: number[];
  nextTrainBatch(batchSize: number): { xs: unknown; labels: unknown };
  nextTestBatch(batchSize: number): { xs: unknown; labels: unknown };
  /**
   * How many train/validation samples ONE fit should draw, when the dataset
   * knows better than the engine's historical demo constants (500/100).
   * Char-level text datasets set these: one window teaches a single next-char
   * fact, so 500 windows would starve the model.
   */
  readonly trainSliceSize?: number;
  readonly testSliceSize?: number;
  /** Flat normalized pixels, sample-major (google-data-loader.trainImages). */
  readonly trainImages?: Float32Array;
  /** One class index per sample (google-data-loader.trainLabels). */
  readonly trainLabels?: Uint8Array | Int32Array;
  /** Floats per sample (= product of shape). */
  readonly imageByteSize?: number;
}

/** Weights by variable name, flattened to raw values. */
export type NamedWeights = Record<string, Float32Array>;

export interface TrainingPrepareOptions {
  /**
   * Emits the runnable model-building code for the current graph
   * (BoardInterface.generateJavascriptNoSave for the tfjs engine). A thunk so
   * the engine's prepare() controls when generation runs — and so generation
   * errors surface through TrainingPrepareError like build errors always have.
   */
  generateCode(): string | null;
  optimizer: string;
  /** Raw UI params; engines drop empty/undefined entries themselves. */
  optimizerParams: Record<string, unknown>;
  loss: string;
  epochs: number;
  /**
   * Fit batch size, for engines with dynamicBatch. The tfjs engine defaults
   * to its historical demo constant (64); the tinygrad engine ignores this
   * (its batch is baked into the trace).
   */
  batchSize?: number;
}

export interface TrainingSession {
  /**
   * The underlying model (a tf.LayersModel for the tfjs engine). The Inspect
   * tab probes it — TrainingZone keeps it OFF reactive state (never proxied).
   */
  readonly model: unknown;
  /** The graph JSON snapshot this session's model was generated from. */
  readonly graphJson: string | null;
  readonly capabilities: TrainingCapabilities;
  /**
   * Resolves when training completes; rejects if a callback throws (cancel).
   * `fitOptions` is the pause/resume hook (see FitOptions) — engines without
   * canPause ignore it.
   */
  fit(dataset: TrainingDataset, callbacks: TrainingCallbacks, fitOptions?: FitOptions): Promise<unknown>;
  /** Sync for tfjs; a Promise for engines whose weights live on the GPU. */
  getWeights(): NamedWeights | Promise<NamedWeights>;
  /** Writes the provided names back; names absent from `weights` are left as-is. */
  setWeights(weights: NamedWeights): void | Promise<void>;
  /** Engine-native stop (finish the batch in flight, then resolve fit). */
  stop(): void;
  /**
   * Forward-only pass on one batch, returning flat scores
   * ([sampleCount * numClasses]) with dropout INACTIVE — for accuracy /
   * validation probes (abBenchmark.probeMetrics normalizes them through
   * log-sum-exp, so logits and log-probabilities are equally valid). Both
   * engines implement it today (tinygrad: the traced eval runner's logits;
   * tfjs: predict(), log-probabilities under a softmax head); it stays
   * optional on the seam for engines without an eval path.
   */
  evaluateLogits?(x: Float32Array): Promise<Float32Array>;
}

export interface TrainingEngine {
  readonly capabilities: TrainingCapabilities;
  prepare(graphJson: string | null, opts: TrainingPrepareOptions): Promise<TrainingSession>;
}

/** Which prepare() step failed — the UI shows a different error surface per stage. */
export type TrainingPrepareStage = 'build' | 'create';

/**
 * Tagged error for prepare() failures the UI is expected to handle:
 *   'build'  — code generation or its evaluation failed (bad/incomplete graph);
 *   'create' — the generated createModel() threw (bad layer params).
 * Anything else an engine throws (backend load, compile) stays untagged and
 * propagates, as it always has.
 */
export class TrainingPrepareError extends Error {
  readonly stage: TrainingPrepareStage;

  /** The original thrown value (not necessarily an Error). */
  override cause: unknown;

  /** For 'build': the generated code that failed to evaluate, if any. */
  readonly generatedCode: string | null | undefined;

  constructor(stage: TrainingPrepareStage, cause: unknown, generatedCode?: string | null) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'TrainingPrepareError';
    this.stage = stage;
    this.cause = cause;
    this.generatedCode = generatedCode;
  }
}
