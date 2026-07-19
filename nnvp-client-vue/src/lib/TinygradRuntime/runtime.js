/**
 * Main-thread side of the tinygrad runtime: owns the Pyodide worker (see
 * ./worker.js and the ./protocol.ts message shapes), the WebGPU device, and
 * the blob-import of the emitted runner module.
 *
 * The worker and the device live in module-level singletons ON PURPOSE: the
 * Pyodide boot is paid once per page load and each retrace ~4-6s, so both
 * must survive across trainings. Tests build their own runtime with an
 * injected worker factory (createTinygradRuntime({ createWorker })).
 */

export function createTinygradRuntime({ createWorker } = {}) {
  let worker = null;
  let nextId = 1;
  let initPromise = null;
  const pending = new Map(); // id -> { resolve, reject }

  const makeWorker = createWorker
    || (() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));

  const fail = (error) => {
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

  const post = (request) => new Promise((resolve, reject) => {
    pending.set(request.id, { resolve, reject });
    ensureWorker().postMessage(request);
  });

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
    trace(request) {
      const id = nextId++;
      let cancelledBeforePost = false;
      const promise = (async () => {
        await this.init();
        if (cancelledBeforePost) throw new Error('trace cancelled');
        return post({ id, type: 'trace', ...request });
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

let sharedRuntime = null;

/** The app-wide runtime — ONE worker surviving across trainings. */
export function getSharedRuntime() {
  if (!sharedRuntime) sharedRuntime = createTinygradRuntime();
  return sharedRuntime;
}

let devicePromise = null;

/**
 * Acquire the app-wide WebGPU device, falling back to the software adapter
 * (SwiftShader — slow but correct) when no hardware GPU exists. Cached: the
 * emitted runners' pipelines belong to one device, which must survive across
 * trainings for the browser's shader cache to help.
 */
export function acquireWebGpuDevice() {
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
 * Import the emitted runner ES module (a string of JS) and set up the net on
 * the device: resolves to the step function, with step.weightBufs exposing
 * {stateName: GPUBuffer} (driver.patch_runner_for_weight_readback).
 */
export async function instantiateRunner(runnerJs, device, weights) {
  const url = URL.createObjectURL(new Blob([runnerJs], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    return await mod.default.setupNet(device, weights);
  } finally {
    URL.revokeObjectURL(url);
  }
}
