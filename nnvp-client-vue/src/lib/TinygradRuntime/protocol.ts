/**
 * The typed message protocol between the tinygrad runtime's main-thread side
 * (./runtime.js) and its Pyodide worker (./worker.js). Kept tiny on purpose:
 * the Python↔JS boundary is crossed once per (re)trace with a string of JS
 * and a safetensors blob — everything else lives on one side or the other.
 *
 * Requests carry a caller-chosen id; every request is answered by exactly one
 * response with the same id ('cancel' excepted — it answers as the trace it
 * cancels). A cancelled trace cannot interrupt Python mid-exec; the worker
 * just drops its result instead of posting it.
 */

/** What a trace needs: the generated tinygrad model source plus the knobs
 *  that are baked into the trace (batch size and loss are fixed by driver.py;
 *  lr lands in the `opt.lr` weight buffer so it stays editable live). */
export interface TraceRequest {
  /** KerasGenerator.generateTinygradFromGraph output (driver strips the final .softmax()). */
  modelSource: string;
  /** Per-sample shape, channels-FIRST for rank 3 (tinygrad convention). */
  inputShape: number[];
  numClasses: number;
  learningRate: number;
  momentum: number;
  nesterov: boolean;
}

/** driver.build's meta dict, as JSON-parsed by the worker. */
export interface TraceMeta {
  batchSize: number;
  inputShape: number[];
  numClasses: number;
  learningRate: number;
  /** Safetensors entry names — the weightBufs keys (opt.params.* / opt.b.* / opt.lr). */
  stateEntries: string[];
  stateShapes: Record<string, number[]>;
  /** Alias name (opt.params.N) -> canonical model.* name for the same tensor. */
  aliases: Record<string, string>;
  kernels: number;
}

export interface TraceResult {
  /** The OPTIMIZED runner ES module source (writeBuffer uploads + _readLoss flag). */
  runnerJs: string;
  /** Forward-only runner (logits out, dropout inactive) for evaluation. */
  evalJs: string;
  /** Safetensors blob with the real initial state (Glorot weights, zero momentum, lr). */
  weights: Uint8Array;
  meta: TraceMeta;
}

export type WorkerRequest =
  | { id: number; type: 'init' }
  | ({ id: number; type: 'trace' } & TraceRequest)
  | { id: number; type: 'cancel'; targetId: number };

export type WorkerResponse =
  | { id: number; ok: true; result?: TraceResult }
  | { id: number; ok: false; error: string };
