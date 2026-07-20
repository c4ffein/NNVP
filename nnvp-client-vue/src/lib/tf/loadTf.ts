/**
 * Lazy loader for @tensorflow/tfjs.
 *
 * tfjs is large and only needed once the user opens the Training zone / starts
 * training or loading a dataset. To keep the graph editor's initial bundle
 * small, it is loaded through a dynamic import() (which Vite/Rollup splits into
 * its own chunk) instead of a static top-level import. The import is memoized so
 * tfjs is only fetched and initialized once.
 */

type TfModule = typeof import('@tensorflow/tfjs');

/** Playwright's CPU-forcing hook (set before the app boots). */
type ForceCpuWindow = Window & { __FORCE_CPU_BACKEND__?: boolean };

let tfPromise: Promise<TfModule> | null = null;
let tfModule: TfModule | null = null;

/**
 * Dynamically import (and, on first call, initialize) TensorFlow.js.
 *
 * The first call also applies the optional CPU-only backend override that used
 * to run eagerly in main.js. Because tfjs is no longer loaded at startup, doing
 * this here — before any tf op runs — keeps the "force CPU before WebGL is
 * touched" behaviour intact.
 *
 * @returns the tfjs namespace
 */
export function loadTf(): Promise<TfModule> {
  if (!tfPromise) {
    tfPromise = import('@tensorflow/tfjs').then(async (tf) => {
      const urlParams = new URLSearchParams(window.location.search);
      const forceCPU = urlParams.get('backend') === 'cpu' || (window as ForceCpuWindow).__FORCE_CPU_BACKEND__;

      if (forceCPU) {
        console.log('[NNVP] CPU-only mode enabled - forcing TensorFlow.js to use CPU backend');
        // Set CPU backend immediately, before any op can initialize WebGL.
        await tf.setBackend('cpu');
        await tf.ready();
        console.log('[NNVP] TensorFlow.js CPU backend initialized');
      }

      tfModule = tf;
      return tf;
    });
  }
  return tfPromise;
}

/**
 * Return the already-loaded tfjs namespace synchronously.
 *
 * Intended for synchronous code paths (e.g. dataset batching, label encoding)
 * that always run after loadTf() has resolved. Throws if tfjs has not finished
 * loading yet, which indicates a caller reached tf before awaiting loadTf().
 *
 * @returns the tfjs namespace
 */
export function getTf(): TfModule {
  if (!tfModule) {
    throw new Error('TensorFlow.js accessed before it finished loading; await loadTf() first.');
  }
  return tfModule;
}
