/**
 * tfjs training smoke tests. Migrated from tests/unit/tfjsTraining.test.js
 * into the dual registry as logicTest. The beforeAll became setup() awaited at
 * the top of each test (tf.ready() is idempotent).
 */
import { logicTest } from '../harness/define';

// Imported lazily inside setup(): a module-level import would print tfjs's
// "install tfjs-node" banner at load time, before any console muting can
// catch it. Every test awaits setup() first, so `tf` is always ready.
let tf = null;

// Synthetic-data training smoke tests for tfjs 4.x.
//
// Real MNIST training is exercised in the Playwright e2e suite (it needs a
// browser + a network fetch for the dataset). These unit tests instead drive
// the *same* tfjs train loop the app uses -- model.compile() + model.fit() --
// against small in-memory random tensors, so a v4 training regression would
// surface here with no network and no browser.
//
// Backend note: with happy-dom registered (bunfig preload) tfjs sees a DOM
// and would PROBE WebGL first — happy-dom cannot provide it, and the failed
// probe dumps stack traces into the test output before falling back. setup()
// therefore forces the plain-JS CPU backend (skipping the probe) and mutes
// the console for the one-time init, which also swallows tfjs's "install
// tfjs-node" banner. Tests then assert the backend really is 'cpu'.
//
// FUTURE (documented follow-up, intentionally not wired up here): the browser
// build could opt into the WebGPU backend via `@tensorflow/tfjs-backend-webgpu`
// (`await tf.setBackend('webgpu')`) for a large training speed-up. That backend
// only runs in a WebGPU-capable browser, so it cannot be verified in this
// Node/bun environment and the dependency is deliberately NOT added.

// Assert model.fit() actually ran and produced usable numbers: one finite loss
// per epoch.
function expectFiniteLossPerEpoch(expect, history, epochs) {
  expect(history).toBeTruthy();
  expect(Array.isArray(history.loss)).toBe(true);
  expect(history.loss).toHaveLength(epochs);
  for (const loss of history.loss) {
    expect(typeof loss).toBe('number');
    expect(Number.isFinite(loss)).toBe(true);
  }
}

const EPOCHS = 2;

// Former beforeAll: make the backend selection deterministic before any model
// is built (see the backend note above for why cpu is forced and the one-time
// init is muted).
async function setup(expect) {
  if (!tf) {
    const muted = ['log', 'warn', 'error'].map((level) => {
      const original = console[level];
      console[level] = () => {};
      return [level, original];
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
  expect(tf.version.tfjs.startsWith('4.')).toBe(true);
  expect(tf.getBackend()).toBe('cpu');
}

logicTest('tfjsTraining: trains a tf.sequential() of tf.layers.dense (what generateSequential() emits)', async ({ expect }) => {
  await setup(expect);
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 8, activation: 'relu', inputShape: [4] }));
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));

  model.compile({
    optimizer: tf.train.adam(),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  const xs = tf.randomNormal([32, 4]);
  const ys = tf.oneHot(tf.randomUniform([32], 0, 3, 'int32'), 3);

  const { history } = await model.fit(xs, ys, { epochs: EPOCHS, shuffle: true });
  expectFiniteLossPerEpoch(expect, history, EPOCHS);

  tf.dispose([xs, ys]);
  model.dispose();
});

logicTest('tfjsTraining: trains a functional tf.model({inputs, outputs}) built with .apply() (what generateFunctional() emits)', async ({ expect }) => {
  await setup(expect);
  // Mirrors generateFunctional(): layers are instantiated then wired with
  // .apply(), and the graph is closed with tf.model({ inputs, outputs }).
  const input = tf.input({ shape: [4] });
  const hidden = tf.layers.dense({ units: 8, activation: 'relu' }).apply(input);
  const output = tf.layers.dense({ units: 1, activation: 'sigmoid' }).apply(hidden);
  const model = tf.model({ inputs: input, outputs: output });

  model.compile({
    optimizer: tf.train.sgd(0.1),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  const xs = tf.randomNormal([48, 4]);
  const ys = tf.randomUniform([48, 1], 0, 2, 'int32').cast('float32');

  const { history } = await model.fit(xs, ys, { epochs: EPOCHS, shuffle: true });
  expectFiniteLossPerEpoch(expect, history, EPOCHS);

  tf.dispose([xs, ys]);
  model.dispose();
});

logicTest('tfjsTraining: trains the exact architecture generateSequential() produces (flatten -> dense -> dense)', async ({ expect }) => {
  await setup(expect);
  // KerasGeneratorJavascriptHelper.generateSequential() emits, for the
  // Input -> Flatten -> Dense -> Dense path, this shape:
  //
  //   const model = tf.sequential();
  //   model.add(tf.layers.flatten({inputShape:[100,100,]}));
  //   model.add(tf.layers.dense({...}));
  //   model.add(tf.layers.dense({...}));
  //
  // Reproduced here with the same layer calls (units/activations filled in so
  // it is trainable) to prove the *generated* architecture fits under v4.
  const model = tf.sequential();
  model.add(tf.layers.flatten({ inputShape: [8, 8] }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));

  model.compile({
    optimizer: tf.train.adam(),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  const xs = tf.randomNormal([24, 8, 8]);
  const ys = tf.oneHot(tf.randomUniform([24], 0, 10, 'int32'), 10);

  const { history } = await model.fit(xs, ys, { epochs: EPOCHS, shuffle: true });
  expectFiniteLossPerEpoch(expect, history, EPOCHS);
  // Each epoch must have reported a defined loss value.
  expect(history.loss.every(loss => loss !== undefined)).toBe(true);

  tf.dispose([xs, ys]);
  model.dispose();
});
