/**
 * The tfjs implementation of the TrainingEngine seam (see ./engine.ts).
 *
 * A pure extraction of the historical TrainingZone.vue startTraining() path:
 * same eval contract for the generated code, same compile and fit wiring, and
 * the same debug console.log lines — their "[TrainingZone]" prefix is
 * historical and their exact text is parsed by the training e2e suites, so
 * neither the text nor when they fire may change.
 *
 * tfjs itself is INJECTED (createTfjsEngine({ loadTf }), normally with
 * lib/tf/loadTf) rather than imported at the top level, so this module stays
 * cheap to import under bun and keeps tfjs out of the initial bundle.
 */
import { TrainingPrepareError } from './engine';

// tf.train factories take POSITIONAL arguments — handing them the params
// OBJECT (the historical code) silently made the object the learning rate,
// i.e. NaN: sgd/adam "trained" without moving a single weight. The tables
// map the UI's named params onto each factory's signature; a param the UI
// leaves empty stays undefined so the tfjs default applies.
const OPTIMIZER_SIGNATURES = {
  sgd: ['learningRate'],
  momentum: ['learningRate', 'momentum', 'useNesterov'],
  rmsprop: ['learningRate', 'decay', 'momentum', 'epsilon', 'centered'],
  adam: ['learningRate', 'beta1', 'beta2', 'epsilon'],
  adamax: ['learningRate', 'beta1', 'beta2', 'epsilon', 'decay'],
  adagrad: ['learningRate', 'initialAccumulatorValue'],
  adadelta: ['learningRate', 'rho', 'epsilon'],
};

/** Positional tf.train construction; sgd with momentum routes to tf.train.momentum. */
export function buildOptimizer(tf, optimizer, params) {
  let name = optimizer;
  if (name === 'sgd' && Number(params.momentum) > 0) name = 'momentum';
  const signature = OPTIMIZER_SIGNATURES[name];
  if (!signature) return tf.train[optimizer](params.learningRate);
  const args = signature.map(key => (params[key] !== undefined ? params[key] : undefined));
  if (name === 'momentum') {
    // tf.train.momentum REQUIRES lr and momentum (no defaults).
    args[0] = args[0] !== undefined ? args[0] : 0.01;
    args[1] = args[1] !== undefined ? args[1] : Number(params.momentum) || 0;
    args[2] = !!params.nesterov || !!params.useNesterov;
  }
  return tf.train[name](...args);
}

// Historical constants of the in-browser demo trainer: a fixed batch size and
// fixed train/test slice sizes per fit (unchanged in the extraction).
const BATCH_SIZE = 64;
const TRAIN_DATA_SIZE = 500;
const TEST_DATA_SIZE = 100;

const capabilities = Object.freeze({ dynamicBatch: true, liveLr: true });

function createSession({ tf, model, graphJson, epochs, batchSize }) {
  return {
    model,
    graphJson,
    capabilities,
    // The historical train() body from TrainingZone.vue: fixed-size train and
    // test slices from the dataset, then model.fit with the caller's
    // callbacks (watchTraining's onBatchEnd/onEpochEnd feed the charts, and
    // throw from inside a callback to cancel).
    async fit(dataset, fitCallbacks) {
      const shape = dataset.shape;
      const [trainXs, trainYs] = tf.tidy(() => {
        const d = dataset.nextTrainBatch(TRAIN_DATA_SIZE);
        return [d.xs.reshape([TRAIN_DATA_SIZE, ...shape]), d.labels];
      });
      const [testXs, testYs] = tf.tidy(() => {
        const d = dataset.nextTestBatch(TEST_DATA_SIZE);
        return [d.xs.reshape([TEST_DATA_SIZE, ...shape]), d.labels];
      });

      // Debug: Log actual TensorFlow.js training configuration
      const debugEnabled = window.nnvp?.debug?.enableTraining;
      if (debugEnabled) {
        const optimizerConfig = model.optimizer.getConfig();
        console.log('[TrainingZone] Starting training with TensorFlow.js configuration:');
        console.log('[TrainingZone]   Optimizer:', model.optimizer.getClassName());
        console.log('[TrainingZone]   Learning Rate:', optimizerConfig.learningRate?.learningRate || optimizerConfig.learningRate);
        console.log('[TrainingZone]   Loss:', model.loss);
        console.log('[TrainingZone]   Epochs:', epochs);
        console.log('[TrainingZone]   Batch Size:', batchSize);
      }

      return model.fit(trainXs, trainYs, {
        batchSize,
        validationData: [testXs, testYs],
        epochs: epochs,
        shuffle: true,
        callbacks: fitCallbacks,
      });
    },
    // Named-weight access, v1: a thin map over the model's variables in model
    // order (tfjs variable names are unique per model).
    getWeights() {
      const named = {};
      for (const weight of model.weights) {
        named[weight.name] = new Float32Array(weight.read().dataSync());
      }
      return named;
    },
    // Writes back the names present in `named`; other variables are left
    // untouched (LayersVariable.write copies, so the temp tensor is disposed).
    setWeights(named) {
      for (const weight of model.weights) {
        const values = named[weight.name];
        if (values === undefined) continue;
        const tensor = tf.tensor(values, weight.shape);
        try {
          weight.write(tensor);
        } finally {
          tensor.dispose();
        }
      }
    },
    // tfjs-native stop: finish the batch in flight, then fit resolves.
    // (TrainingZone still cancels through its historical watchTraining throw;
    // this is the seam-level API.)
    stop() {
      model.stopTraining = true;
    },
    // Forward-only scores on one flat batch, dropout inactive (predict runs
    // in inference mode) — the same probe surface the tinygrad eval runner
    // exposes. A softmax head emits probabilities: log(p) is returned, which
    // behaves exactly like logits for both argmax and log-sum-exp
    // crossentropy (log-sum-exp(log p) = log Σp = 0). A softmax-less head
    // already emits logits: passed through untouched.
    async evaluateLogits(x) {
      const dims = model.inputs[0].shape.slice(1);
      const pixels = dims.reduce((total, dim) => total * dim, 1);
      const n = Math.floor(x.length / pixels);
      const head = model.layers[model.layers.length - 1].getConfig();
      const out = tf.tidy(() => {
        const scores = model.predict(tf.tensor(x, [n, ...dims]), { batchSize: n });
        return head.activation === 'softmax' ? tf.log(tf.maximum(scores, 1e-30)) : scores;
      });
      try {
        return new Float32Array(await out.data());
      } finally {
        out.dispose();
      }
    },
  };
}

export function createTfjsEngine({ loadTf }) {
  return {
    capabilities,
    async prepare(graphJson, opts) {
      // tfjs is loaded lazily so it stays out of the initial bundle; make sure
      // it is ready (and CPU backend applied if requested) before training.
      const tf = await loadTf();
      window.tf = tf;
      const { optimizer, loss, epochs } = opts;
      let createModel;
      let generatedCode;
      try {
        // NOTE: Using eval here to execute the generated JavaScript code from the visual graph editor.
        // The graph is converted to TensorFlow.js code (as a string), then eval'd to get a runnable
        // function. The generator escapes every graph-provided string/identifier (see
        // lib/KerasInterface/codegenSafety.js), so a crafted .nnvp file cannot inject code here;
        // this could still be replaced with direct model building from the graph JSON to avoid
        // eval entirely.
        generatedCode = opts.generateCode();
        if (window.nnvp?.debug?.enableTraining) {
          console.log('[TrainingZone] Generated JavaScript code:\n', generatedCode);
        }
        // eslint-disable-next-line no-eval
        createModel = eval(
          `(function() { const tf = window.tf; ${generatedCode} return createModel; })()`
        );
      }
      catch (error) {
        throw new TrainingPrepareError('build', error, generatedCode);
      }
      let model;
      try {
        model = createModel();
      }
      catch (error) {
        // Param errors
        throw new TrainingPrepareError('create', error);
      }
      // Build optimizer config with parameters
      let optimizerConfig = optimizer;
      const filteredParams = Object.fromEntries(
        Object.entries(opts.optimizerParams).filter(([, v]) => v !== undefined && v !== null && v !== '')
      );
      if (Object.keys(filteredParams).length > 0) {
        optimizerConfig = buildOptimizer(tf, optimizer, filteredParams);
      }
      if (window.nnvp?.debug?.enableTraining) {
        console.log('[TrainingZone] Compiling model with optimizer:', optimizer, 'params:', opts.optimizerParams);
      }

      // Expose compilation config for testing/debugging
      window.nnvp = window.nnvp || {};
      window.nnvp.debug = window.nnvp.debug || {};
      window.nnvp.debug.trainingConfig = {
        optimizer,
        optimizerParams: filteredParams,
        loss,
        epochs,
      };

      model.compile({
        optimizer: optimizerConfig,
        loss,
        metrics: ['accuracy'],
      });

      // Expose compiled model configuration for testing
      window.nnvp.debug.compiledModel = {
        optimizerConfig: model.optimizer.getConfig(),
        loss: model.loss,
      };

      return createSession({
        tf, model, graphJson, epochs,
        batchSize: opts.batchSize !== undefined ? opts.batchSize : BATCH_SIZE,
      });
    },
  };
}
