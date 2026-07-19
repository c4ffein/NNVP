/**
 * The tinygrad runtime's Web Worker: hosts Pyodide + tinygrad and answers the
 * ./protocol.ts messages. Python never touches the GPU — tinygrad traces on
 * the GPU-less NULL:WGSL device and emits a self-contained WebGPU JS runner;
 * the main thread (./runtime.js) imports and loops on it.
 *
 * The worker is kept alive across trainings by runtime.js's singleton: the
 * Pyodide boot + wheel install (~seconds, CDN-cached) is paid once per page
 * load, and each graph edit only re-pays the ~4-6s trace.
 *
 * This is a vite-only module (`?raw` Python imports, CDN dynamic import);
 * tests exercise the protocol against a fake worker instead of loading it.
 */
import DRIVER_PY from './py/driver.py?raw';
import EXPORT_MODEL_PY from './py/export_model.py?raw';

// export_model.py is vendored from THIS tinygrad tag — bump them together
// (see ./py/README.md for the re-vendoring drill).
const TINYGRAD_VERSION = '0.13.0';
const PYODIDE_VERSION = '0.28.3';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise = null;

function ensurePyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
      const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
      // sqlite3 is unvendored from Pyodide's stdlib; tinygrad.helpers imports
      // it for the compile cache.
      await pyodide.loadPackage(['micropip', 'sqlite3']);
      await pyodide.runPythonAsync(
        `import micropip; await micropip.install("tinygrad==${TINYGRAD_VERSION}")`,
      );
      pyodide.FS.writeFile('export_model.py', EXPORT_MODEL_PY);
      pyodide.FS.writeFile('driver.py', DRIVER_PY);
      // os.environ must be set BEFORE tinygrad is imported (driver.py asserts).
      await pyodide.runPythonAsync([
        'import os, sys',
        'os.environ["DEV"] = "NULL:WGSL"',
        'os.environ["NULL_ALLOW_COPYOUT"] = "1"',
        'sys.path.insert(0, ".")',
        'import driver',
      ].join('\n'));
      return pyodide;
    })();
    // A failed boot must be retryable (transient CDN errors).
    pyodidePromise.catch(() => { pyodidePromise = null; });
  }
  return pyodidePromise;
}

async function trace(message) {
  const pyodide = await ensurePyodide();
  pyodide.globals.set('model_source', message.modelSource);
  pyodide.globals.set('input_shape_json', JSON.stringify(message.inputShape));
  pyodide.globals.set('num_classes', message.numClasses);
  pyodide.globals.set('learning_rate', message.learningRate);
  pyodide.globals.set('momentum', message.momentum);
  pyodide.globals.set('nesterov', message.nesterov);
  // build_both post-processes ONE trace into both runner variants; only the
  // optimized one (writeBuffer uploads + skippable loss readback) ships back.
  const result = await pyodide.runPythonAsync([
    'import json',
    '_js, _js_opt, _weights, _meta, _eval_js = driver.build_both(',
    '    model_source=model_source,',
    '    input_shape=json.loads(input_shape_json),',
    '    num_classes=num_classes,',
    '    lr=learning_rate,',
    '    momentum=momentum,',
    '    nesterov=nesterov,',
    ')',
    '{"js": _js_opt, "evalJs": _eval_js, "weights": _weights, "meta": json.dumps(_meta)}',
  ].join('\n'));
  const runnerJs = result.get('js');
  const evalJs = result.get('evalJs');
  const weights = result.get('weights').toJs(); // Uint8Array
  const meta = JSON.parse(result.get('meta'));
  result.destroy();
  return { runnerJs, evalJs, weights, meta };
}

// Trace ids cancelled while their Python was running: the result is dropped
// instead of posted (Python itself cannot be interrupted mid-exec).
const cancelled = new Set();

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'cancel') {
    cancelled.add(message.targetId);
    return;
  }
  try {
    if (message.type === 'init') {
      await ensurePyodide();
      self.postMessage({ id: message.id, ok: true });
      return;
    }
    if (message.type === 'trace') {
      const result = await trace(message);
      if (cancelled.delete(message.id)) return;
      self.postMessage({ id: message.id, ok: true, result }, [result.weights.buffer]);
      return;
    }
    throw new Error(`unknown message type "${message.type}"`);
  } catch (error) {
    if (cancelled.delete(message.id)) return;
    self.postMessage({
      id: message.id, ok: false, error: String(error && error.message ? error.message : error),
    });
  }
};
