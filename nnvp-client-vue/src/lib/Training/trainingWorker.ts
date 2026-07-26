/**
 * The training Web Worker: the last inch of plumbing around
 * ./trainingWorkerHost.ts (which holds ALL the logic and is bun-tested with
 * real tfjs). Booted by ./workerEngine.ts via the house vite pattern
 * (`new Worker(new URL('./trainingWorker.ts', import.meta.url),
 * { type: 'module' })`, same as lib/TinygradRuntime). Everything here is
 * browser-only by nature — the real Worker boot and the backend pick below
 * are exercised by the e2e half, never under bun.
 *
 * tf backend in a worker (no DOM): 'webgl' when the browser gives workers an
 * OffscreenCanvas (Chromium does — tfjs's webgl backend runs on it
 * natively), else the pure-JS 'cpu' backend. The wasm backend would be the
 * better universal fallback but lives in a separate package
 * (@tensorflow/tfjs-backend-wasm) this app doesn't ship today — documented
 * trade-off, not an oversight.
 */

import { createTrainingWorkerHost } from './trainingWorkerHost';
import type { WorkerCommand, WorkerEvent } from './workerProtocol';

// The same memoized lazy-load discipline as lib/tf/loadTf.ts, adapted for a
// worker scope: no window, no URL params, backend picked by capability.
let tfPromise: Promise<unknown> | null = null;

function loadTfInWorker(): Promise<unknown> {
  if (!tfPromise) {
    tfPromise = import('@tensorflow/tfjs').then(async (tf) => {
      let gpuReady = false;
      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          gpuReady = await tf.setBackend('webgl');
        } catch {
          gpuReady = false; // context creation can throw; cpu below
        }
      }
      if (!gpuReady) await tf.setBackend('cpu');
      await tf.ready();
      return tf;
    });
    // A failed load must be retryable (transient CDN/chunk errors).
    tfPromise.catch(() => { tfPromise = null; });
  }
  return tfPromise;
}

// lib.dom types `self` as a Window; retype it as this worker's scope (the
// project compiles with the DOM lib only, no WebWorker lib alongside) — the
// TinygradRuntime worker's exact pattern.
const scope = globalThis.self as unknown as {
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
  postMessage(message: WorkerEvent, transfer?: Transferable[]): void;
};

const host = createTrainingWorkerHost({
  loadTf: loadTfInWorker,
  post: (event, transfer) => scope.postMessage(event, transfer),
});

scope.onmessage = (event) => { void host.handle(event.data); };
