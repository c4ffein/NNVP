/**
 * The training worker's brain: answers ./workerProtocol.ts commands over an
 * injected `post`, with tf injected through `loadTf`. This module is the
 * whole worker except the last inch of Worker plumbing (./trainingWorker.ts
 * wires it to self.onmessage) — kept separate so bun tests drive the REAL
 * prepare/fit/weights logic with real tfjs on the cpu backend, no Worker or
 * DOM required (the tinygrad worker keeps its logic browser-only because it
 * needs Pyodide; this one doesn't).
 *
 * SECURITY: this is where the generated tfjs code is eval'd. Inside a real
 * Worker that eval sees no DOM, no localStorage and no auth token — the
 * whole point of the worker engine. The eval contract mirrors tfjsEngine's,
 * except `tf` enters through a wrapper-function PARAMETER instead of
 * window.tf (there is no window in a worker).
 *
 * One host holds ONE model at a time: a new 'prepare' replaces the previous
 * model (and disposes it) — the single-active-run rule, worker edition.
 */

import type { NamedWeights } from './engine';
import { buildOptimizerConfig } from './optimizers';
import { PROTOCOL_VERSION, checkProtocolVersion, transferablesOf } from './workerProtocol';
import type { FitCommand, PrepareCommand, WorkerCommand, WorkerEvent } from './workerProtocol';

// The tfjs runtime surface stays loose, same rationale as tfjsEngine.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tf = any;

export interface TrainingWorkerContext {
  /** The worker-side tf loader (backend already picked); memoized by caller. */
  loadTf(): Promise<unknown>;
  /** Ship one event back to the main thread (transfer already computed). */
  post(event: WorkerEvent, transfer?: Transferable[]): void;
}

export interface TrainingWorkerHost {
  /** Answer one command; never throws — failures post 'error' events. */
  handle(command: WorkerCommand): Promise<void>;
}

export function createTrainingWorkerHost(ctx: TrainingWorkerContext): TrainingWorkerHost {
  let tf: Tf = null;
  let model: Tf = null;

  const send = (event: WorkerEvent) => ctx.post(event, transferablesOf(event));
  const fail = (id: number, stage: 'build' | 'create' | null, error: unknown) => {
    const err = error as { message?: unknown } | null | undefined;
    send({
      v: PROTOCOL_VERSION, id, type: 'error', stage,
      message: String(err && err.message !== undefined ? err.message : err),
    });
  };

  async function prepare(command: PrepareCommand): Promise<void> {
    // tf load failures stay untagged (stage null), like tfjsEngine's loadTf.
    tf = await ctx.loadTf();
    let createModel: () => Tf;
    try {
      // The tfjsEngine eval contract, worker edition: same wrapper shape, but
      // tf is a parameter (no window here — that's the feature). The
      // generator escapes every graph-provided value (codegenSafety), and
      // whatever slips through computes in this box.
      // eslint-disable-next-line no-eval
      createModel = eval(
        `(function(tf) { ${command.code}\nreturn createModel; })`
      )(tf);
    }
    catch (error) {
      fail(command.id, 'build', error);
      return;
    }
    let built: Tf;
    try {
      built = createModel();
    }
    catch (error) {
      // Param errors
      fail(command.id, 'create', error);
      return;
    }
    built.compile({
      optimizer: buildOptimizerConfig(tf, command.optimizer, command.optimizerParams),
      loss: command.loss,
      metrics: ['accuracy'],
    });
    if (model) model.dispose();
    model = built;
    send({ v: PROTOCOL_VERSION, id: command.id, type: 'prepared', backend: tf.getBackend() });
  }

  async function fit(command: FitCommand): Promise<void> {
    if (!model) throw new Error('fit before prepare: the worker holds no model');
    const { id, shape, numClasses } = command;
    // Rebuild tensors from the transferred raw slices; labels are class
    // indices one-hotted to the label-encoder default the tensor path uses.
    const toTensors = (xs: Float32Array, labels: Int32Array, count: number) => ({
      xs: tf.tensor(xs, [count, ...shape]),
      ys: tf.tidy(() => tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses)),
    });
    const train = toTensors(command.trainXs, command.trainLabels, command.trainCount);
    const test = toTensors(command.testXs, command.testLabels, command.testCount);
    try {
      // A fresh segment clears tf's own stop flag (the resume contract).
      model.stopTraining = false;
      await model.fit(train.xs, train.ys, {
        batchSize: command.batchSize,
        validationData: [test.xs, test.ys],
        // tfjs semantics, same as tfjsEngine: train until initialEpoch+epochs,
        // numbering from initialEpoch (one absolute axis across pauses).
        epochs: command.initialEpoch + command.epochs,
        initialEpoch: command.initialEpoch,
        shuffle: true,
        callbacks: {
          // Explicit fields only: progress must stay structured-clone-safe.
          onBatchEnd: (batch: number, logs: Record<string, number> | undefined) => {
            send({
              v: PROTOCOL_VERSION, id, type: 'batch', batch,
              logs: { loss: Number(logs?.loss), acc: logs?.acc === undefined ? undefined : Number(logs.acc) },
            });
          },
          onEpochEnd: (epoch: number, logs: Record<string, number> | undefined) => {
            const pick = (key: string) => (logs?.[key] === undefined ? undefined : Number(logs[key]));
            send({
              v: PROTOCOL_VERSION, id, type: 'epoch', epoch,
              logs: {
                loss: Number(logs?.loss), acc: pick('acc'),
                val_loss: pick('val_loss'), val_acc: pick('val_acc'),
              },
            });
          },
        },
      });
      send({ v: PROTOCOL_VERSION, id, type: 'fitDone' });
    }
    finally {
      train.xs.dispose();
      train.ys.dispose();
      test.xs.dispose();
      test.ys.dispose();
    }
  }

  // Named-weight access, mirroring tfjsEngine's session verbatim.
  function getWeights(id: number): void {
    const named: NamedWeights = {};
    for (const weight of model.weights) {
      named[weight.name] = new Float32Array(weight.read().dataSync());
    }
    send({ v: PROTOCOL_VERSION, id, type: 'weights', weights: named });
  }

  function setWeights(id: number, named: NamedWeights): void {
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
    send({ v: PROTOCOL_VERSION, id, type: 'ok' });
  }

  // Forward-only scores, mirroring tfjsEngine.evaluateLogits (softmax head ->
  // log-probabilities; softmax-less head -> raw logits).
  async function evalLogits(id: number, x: Float32Array): Promise<void> {
    const dims: number[] = model.inputs[0].shape.slice(1);
    const pixels = dims.reduce((total: number, dim: number) => total * dim, 1);
    const n = Math.floor(x.length / pixels);
    const head = model.layers[model.layers.length - 1].getConfig();
    const out = tf.tidy(() => {
      const scores = model.predict(tf.tensor(x, [n, ...dims]), { batchSize: n });
      return head.activation === 'softmax' ? tf.log(tf.maximum(scores, 1e-30)) : scores;
    });
    try {
      send({ v: PROTOCOL_VERSION, id, type: 'logits', x: new Float32Array(await out.data()) });
    } finally {
      out.dispose();
    }
  }

  return {
    async handle(command: WorkerCommand): Promise<void> {
      const id = (command && typeof command === 'object' && typeof command.id === 'number') ? command.id : -1;
      try {
        const versionError = checkProtocolVersion(command);
        if (versionError) throw new Error(versionError);
        switch (command.type) {
          case 'prepare':
            await prepare(command);
            return;
          case 'fit':
            await fit(command);
            return;
          case 'stop':
            // Finish the batch in flight, then the running fit RESOLVES.
            if (model) model.stopTraining = true;
            send({ v: PROTOCOL_VERSION, id, type: 'ok' });
            return;
          case 'getWeights':
            if (!model) throw new Error('getWeights before prepare: the worker holds no model');
            getWeights(id);
            return;
          case 'setWeights':
            if (!model) throw new Error('setWeights before prepare: the worker holds no model');
            setWeights(id, command.weights);
            return;
          case 'evalLogits':
            if (!model) throw new Error('evalLogits before prepare: the worker holds no model');
            await evalLogits(id, command.x);
            return;
          default:
            throw new Error(`unknown training worker command "${(command as { type?: unknown }).type}"`);
        }
      } catch (error) {
        fail(id, null, error);
      }
    },
  };
}
