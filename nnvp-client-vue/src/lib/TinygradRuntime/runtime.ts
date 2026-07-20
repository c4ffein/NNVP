/**
 * Main-thread side of the tinygrad runtime: owns the Pyodide worker (see
 * ./worker.ts and the ./protocol.ts message shapes), the WebGPU device, and
 * the blob-import of the emitted runner module.
 *
 * The worker and the device live in module-level singletons ON PURPOSE: the
 * Pyodide boot is paid once per page load and each retrace ~4-6s, so both
 * must survive across trainings. Tests build their own runtime with an
 * injected worker factory (createTinygradRuntime({ createWorker })).
 */

import type { TraceRequest, TraceResult, WorkerRequest, WorkerResponse } from './protocol';

/** The worker surface the runtime drives: the real Worker, or a test fake. */
export interface RuntimeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
}

interface PendingEntry {
  resolve: (result: TraceResult | undefined) => void;
  reject: (error: Error) => void;
}

export interface TraceHandle {
  promise: Promise<TraceResult>;
  cancel: () => void;
}

export function createTinygradRuntime(
  { createWorker }: { createWorker?: () => RuntimeWorker } = {},
) {
  let worker: RuntimeWorker | null = null;
  let nextId = 1;
  let initPromise: Promise<TraceResult | undefined> | null = null;
  const pending = new Map<number, PendingEntry>(); // id -> { resolve, reject }

  const makeWorker = createWorker
    || (() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));

  const fail = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
    initPromise = null;
    worker = null; // next call boots a fresh worker
  };

  const ensureWorker = () => {
    if (!worker) {
      worker = makeWorker();
      worker.onmessage = (event) => {
        const response = event.data;
        const entry = pending.get(response.id);
        if (!entry) return; // cancelled (or unknown) — drop it
        pending.delete(response.id);
        if (response.ok) entry.resolve(response.result);
        else entry.reject(new Error(response.error));
      };
      worker.onerror = (event) => {
        fail(new Error(`tinygrad worker crashed: ${event && event.message ? event.message : event}`));
      };
    }
    return worker;
  };

  const post = (request: WorkerRequest) => new Promise<TraceResult | undefined>(
    (resolve, reject) => {
      pending.set(request.id, { resolve, reject });
      ensureWorker().postMessage(request);
    },
  );

  return {
    /** Boot Pyodide + install tinygrad; idempotent, retryable after failure. */
    init() {
      if (!initPromise) {
        initPromise = post({ id: nextId++, type: 'init' });
        initPromise.catch(() => { initPromise = null; });
      }
      return initPromise;
    },
    /**
     * Trace the model in the worker. Returns { promise, cancel }: cancel()
     * rejects the promise here and tells the worker to drop the result when
     * its (uninterruptible) Python finishes.
     */
    trace(request: TraceRequest): TraceHandle {
      const id = nextId++;
      let cancelledBeforePost = false;
      const promise = (async () => {
        await this.init();
        if (cancelledBeforePost) throw new Error('trace cancelled');
        return post({ id, type: 'trace', ...request }) as Promise<TraceResult>;
      })();
      return {
        promise,
        cancel: () => {
          const entry = pending.get(id);
          if (!entry) {
            cancelledBeforePost = true; // still waiting on init
            return;
          }
          pending.delete(id);
          if (worker) worker.postMessage({ id: nextId++, type: 'cancel', targetId: id });
          entry.reject(new Error('trace cancelled'));
        },
      };
    },
  };
}

export type TinygradRuntime = ReturnType<typeof createTinygradRuntime>;

let sharedRuntime: TinygradRuntime | null = null;

/** The app-wide runtime — ONE worker surviving across trainings. */
export function getSharedRuntime(): TinygradRuntime {
  if (!sharedRuntime) sharedRuntime = createTinygradRuntime();
  return sharedRuntime;
}

let devicePromise: Promise<GPUDevice> | null = null;

/**
 * Acquire the app-wide WebGPU device, falling back to the software adapter
 * (SwiftShader — slow but correct) when no hardware GPU exists. Cached: the
 * emitted runners' pipelines belong to one device, which must survive across
 * trainings for the browser's shader cache to help.
 */
export function acquireWebGpuDevice(): Promise<GPUDevice> {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (typeof navigator === 'undefined' || !navigator.gpu) {
        throw new Error('WebGPU is not available in this browser');
      }
      const adapter = await navigator.gpu.requestAdapter()
        || await navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
      if (!adapter) throw new Error('No WebGPU adapter (hardware or software fallback)');
      return adapter.requestDevice();
    })();
    devicePromise.catch(() => { devicePromise = null; });
  }
  return devicePromise;
}

/**
 * The emitted runner's step function (mod.default.setupNet's resolution):
 * the training runner takes (x, y, readLoss?) and the eval runner just (x),
 * both resolving to the output arrays, with `weightBufs` patched on
 * (driver.patch_runner_for_weight_readback).
 */
export interface RunnerStep {
  (x: Float32Array, y?: Int32Array, readLoss?: boolean): Promise<Float32Array[]>;
  weightBufs: Record<string, GPUBuffer>;
}

/**
 * Import the emitted runner ES module (a string of JS) and set up the net on
 * the device: resolves to the step function, with step.weightBufs exposing
 * {stateName: GPUBuffer} (driver.patch_runner_for_weight_readback).
 */
export async function instantiateRunner(
  runnerJs: string, device: GPUDevice, weights: Uint8Array,
): Promise<RunnerStep> {
  const url = URL.createObjectURL(new Blob([runnerJs], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    return await mod.default.setupNet(device, weights);
  } finally {
    URL.revokeObjectURL(url);
  }
}
