/**
 * The typed message protocol between the worker training engine's main-thread
 * side (./workerEngine.ts) and the training Web Worker
 * (./trainingWorker.ts hosting ./trainingWorkerHost.ts). Pure types plus two
 * pure helpers — no Worker dependency, fully bun-testable.
 *
 * Shape of the conversation (the TinygradRuntime protocol's discipline):
 * every command carries a caller-chosen `id` and is answered by exactly ONE
 * terminal event with the same id ('prepared', 'fitDone', 'weights', 'ok',
 * 'logits' or 'error'); a running fit additionally streams non-terminal
 * 'batch'/'epoch' progress events under the fit command's id. 'stop' is its
 * own command with its own id/ack — it makes the in-flight fit RESOLVE
 * ('fitDone'), never reject; cancel-by-thrown-callback is the main-thread
 * side's business (it sends 'stop' and rejects locally).
 *
 * The generated tfjs code crosses as a STRING (the generateCode thunk runs on
 * the main thread; only its output crosses) and is eval'd worker-side — that
 * is the point: hostile generated code computes without DOM, localStorage or
 * the auth token. Dataset slices cross as raw typed arrays; see
 * `transferablesOf` for which buffers move ownership and which are copied.
 *
 * `v` versions the protocol (cheap insurance for a cached worker script
 * answering a newer page, or vice versa): the receiving side refuses
 * mismatches with a clear error instead of misreading fields.
 */

import type { BatchLogs, EpochLogs, NamedWeights } from './engine';

export const PROTOCOL_VERSION = 1;

/** Every message carries the protocol version and a correlation id. */
interface Envelope {
  v: typeof PROTOCOL_VERSION;
  id: number;
}

/**
 * Build + compile the model in the worker: eval `code`, run its
 * createModel(), compile with the optimizer/loss (same semantics as
 * tfjsEngine.prepare — shared via ./optimizers.ts). `code` is nullable like
 * generateCode's return: a null evals to a build error, exactly as it would
 * main-thread.
 */
export interface PrepareCommand extends Envelope {
  type: 'prepare';
  code: string | null;
  optimizer: string;
  /** Raw UI params; the worker drops empty/undefined entries itself. */
  optimizerParams: Record<string, unknown>;
  loss: string;
}

/**
 * One fit segment on freshly drawn raw slices (sample-major, exactly the
 * loaders' nextTrainBatchRaw/nextTestBatchRaw output). Labels are class
 * indices; the worker one-hots them to `numClasses` (the label-encoder
 * default the tensor path uses). `epochs`/`initialEpoch` follow the seam's
 * FitOptions semantics: train `epochs` MORE epochs numbered from
 * `initialEpoch` (the pause/resume axis).
 */
export interface FitCommand extends Envelope {
  type: 'fit';
  trainXs: Float32Array;
  trainLabels: Int32Array;
  testXs: Float32Array;
  testLabels: Int32Array;
  trainCount: number;
  testCount: number;
  /** Per-sample shape (the dataset's `shape`); xs reshape to [count, ...shape]. */
  shape: number[];
  numClasses: number;
  batchSize: number;
  epochs: number;
  initialEpoch: number;
}

export type WorkerCommand =
  | PrepareCommand
  | FitCommand
  /** Finish the batch in flight, then let fit resolve (tf's stopTraining). */
  | (Envelope & { type: 'stop' })
  | (Envelope & { type: 'getWeights' })
  | (Envelope & { type: 'setWeights'; weights: NamedWeights })
  | (Envelope & { type: 'evalLogits'; x: Float32Array });

export type WorkerEvent =
  | (Envelope & { type: 'prepared'; backend: string })
  | (Envelope & { type: 'batch'; batch: number; logs: BatchLogs })
  | (Envelope & { type: 'epoch'; epoch: number; logs: EpochLogs })
  | (Envelope & { type: 'fitDone' })
  | (Envelope & { type: 'weights'; weights: NamedWeights })
  | (Envelope & { type: 'ok' })
  | (Envelope & { type: 'logits'; x: Float32Array })
  /**
   * The failing command's answer. `stage` carries TrainingPrepareError's
   * tagging across the wire ('build'/'create'); null means untagged (loadTf,
   * compile, fit, protocol) — the main side rethrows those as plain Errors.
   */
  | (Envelope & { type: 'error'; stage: 'build' | 'create' | null; message: string });

/**
 * The buffers whose OWNERSHIP moves with the message (postMessage transfer
 * list). Only buffers minted for the message may appear here: fit slices are
 * freshly drawn per fit, and 'weights'/'logits' payloads are worker-minted
 * snapshots. Caller-owned arrays (setWeights values, the evalLogits input —
 * often subarray views into buffers the caller keeps, e.g. abBenchmark's
 * probe slices) are deliberately ABSENT: they cross by structured-clone copy.
 */
export function transferablesOf(message: WorkerCommand | WorkerEvent): Transferable[] {
  switch (message.type) {
    case 'fit':
      return dedupe([
        message.trainXs.buffer, message.trainLabels.buffer,
        message.testXs.buffer, message.testLabels.buffer,
      ]);
    case 'weights':
      return dedupe(Object.values(message.weights).map(values => values.buffer));
    case 'logits':
      return dedupe([message.x.buffer]);
    default:
      return [];
  }
}

/** Two views may share one buffer; a transfer list must name it once. */
function dedupe(buffers: ArrayBufferLike[]): Transferable[] {
  return Array.from(new Set(buffers)) as Transferable[];
}

/**
 * Version guard: null when the message speaks this protocol, else a
 * human-readable refusal naming the versions (posted back as an 'error').
 */
export function checkProtocolVersion(message: unknown): string | null {
  const v = message && typeof message === 'object' ? (message as { v?: unknown }).v : undefined;
  if (v === PROTOCOL_VERSION) return null;
  return `training worker protocol version mismatch: got ${String(v)}, this side speaks version ${PROTOCOL_VERSION}`;
}
