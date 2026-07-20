/**
 * REAL tinygrad-runtime pipeline verification: real Pyodide (CDN), the real
 * trace, the real emitted WebGPU runner on a real (SwiftShader) device — the
 * parts the bun suite can only fake. Opt-in because it needs network (Pyodide
 * + the tinygrad wheel) and the full Chromium build (channel: 'chromium', the
 * headless shell has no WebGPU):
 *
 *   make test-webgpu        (NNVP_WEBGPU_E2E=1, --project=webgpu)
 *
 * What it pins down (each was a real bug or a real suspicion):
 *   - dropout in the traced step is PER-STEP random, not a frozen mask: the
 *     RNG counter lives outside the restorable weight state, so identical
 *     weights + identical batch still produce different losses;
 *   - BatchNorm models trace at all (int64 num_batches_tracked once crashed
 *     build_safetensors), running_var initializes to ONE (a zero init would
 *     make the eval pass divide by sqrt(eps)), and the running mean/var
 *     UPDATE assigns are captured in the trace — frozen-at-init stats was
 *     the failure mode driver.py's explicit realize now prevents;
 *   - the eval runner accepts the live training weights through
 *     syncWeightBufs' alias mapping (running stats surface as opt.buffers.N)
 *     and produces finite logits.
 */
import { test, expect } from '@playwright/test';
import type { RunnerStep } from '../../src/lib/TinygradRuntime/runtime';

// node/bun provide process at runtime; typed locally to stay dependency-free
// (no @types/node), same policy as the harness's other ambient declarations.
declare const process: { env: Record<string, string | undefined> };

test.skip(!process.env.NNVP_WEBGPU_E2E, 'opt-in: needs network (Pyodide CDN) + full Chromium WebGPU — run via make test-webgpu');

const DROPOUT_MODEL = `from tinygrad import Tensor, nn


class Model:
  def __init__(self):
    self.layer_2 = nn.Linear(16, 32)
    self.layer_3 = nn.Linear(32, 4)

  def __call__(self, x):
    x = self.layer_2(x).relu()
    x = x.dropout(0.5)
    x = self.layer_3(x)
    return x.softmax()
`;

const BN_MODEL = `from tinygrad import Tensor, nn


class Model:
  def __init__(self):
    self.layer_2 = nn.Conv2d(1, 4, (3,3,))
    self.layer_3 = nn.BatchNorm2d(4)
    self.layer_5 = nn.Linear(144, 4)

  def __call__(self, x):
    x = self.layer_2(x)
    x = self.layer_3(x)
    x = x.flatten(1)
    x = self.layer_5(x)
    return x.softmax()
`;

// One test, one Pyodide boot: the traces are the expensive part and share it.
test('traced runners: per-step dropout, live BatchNorm stats, eval weight sync', async ({ page }) => {
  test.setTimeout(600000); // cold Pyodide boot + three traces, SwiftShader math

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async ({ dropoutModel, bnModel }) => {
    // The specifiers are vite dev-server URLs the BROWSER resolves; TS cannot
    // (rooted paths never match ambient module declarations), so the casts
    // reconnect them to the real modules' types.
    const { getSharedRuntime, acquireWebGpuDevice, instantiateRunner } = await import('/src/lib/TinygradRuntime/runtime.ts' as string) as typeof import('../../src/lib/TinygradRuntime/runtime');
    const { snapshotWeightBufs, writeWeightBuf, syncWeightBufs } = await import('/src/lib/TinygradRuntime/weightIO.ts' as string) as typeof import('../../src/lib/TinygradRuntime/weightIO');
    const runtime = getSharedRuntime();
    await runtime.init();
    const device = await acquireWebGpuDevice();

    const trace = async (modelSource: string, inputShape: number[], numClasses: number) => {
      const traced = await runtime.trace({
        modelSource, inputShape, numClasses, learningRate: 0.05, momentum: 0.9, nesterov: false,
      }).promise;
      const step = await instantiateRunner(traced.runnerJs, device, traced.weights);
      return { traced, step };
    };
    const restore = async (step: RunnerStep, snapshot: Record<string, Float32Array>) => {
      for (const name of Object.keys(snapshot)) {
        await writeWeightBuf(device, step.weightBufs[name]!, snapshot[name]!);
      }
    };

    const x = new Float32Array(32 * 16);
    for (let i = 0; i < x.length; i += 1) x[i] = ((i * 37) % 101) / 101;
    const y = new Int32Array(32);
    for (let i = 0; i < 32; i += 1) y[i] = i % 4;

    // --- dropout: same weights, same batch, three losses ------------------
    const drop = await trace(dropoutModel, [16], 4);
    const snapshot = await snapshotWeightBufs(device, drop.step.weightBufs);
    const restoredLosses = [];
    for (let i = 0; i < 3; i += 1) {
      await restore(drop.step, snapshot);
      restoredLosses.push((await drop.step(x, y, true))[0]![0]!);
    }

    // --- BatchNorm: init values, live stats, eval sync --------------------
    const bn = await trace(bnModel, [1, 8, 8], 4);
    const aliases = bn.traced.meta.aliases || {};
    const bufFor = (canonical: string) => {
      if (bn.step.weightBufs[canonical]) return canonical;
      return Object.keys(aliases).find(a => aliases[a] === canonical && bn.step.weightBufs[a]) || null;
    };
    const statNames = bn.traced.meta.stateEntries
      .filter(n => n.endsWith('.running_mean') || n.endsWith('.running_var'));
    const readStats = async () => {
      const out: Record<string, number[] | null> = {};
      for (const name of statNames) {
        const buf = bufFor(name);
        if (!buf) { out[name] = null; continue; }
        const snap = await snapshotWeightBufs(device, { [buf]: bn.step.weightBufs[buf]! });
        out[name] = Array.from(snap[buf]!);
      }
      return out;
    };
    const before = await readStats();
    const bx = new Float32Array(32 * 64);
    for (let i = 0; i < bx.length; i += 1) bx[i] = ((i * 13) % 89) / 89 + 0.5;
    const bnLosses = [];
    for (let i = 0; i < 5; i += 1) bnLosses.push((await bn.step(bx, y, true))[0]![0]!);
    const after = await readStats();

    const evalStep = await instantiateRunner(bn.traced.evalJs, device, bn.traced.weights);
    syncWeightBufs(device, bn.step.weightBufs, evalStep.weightBufs, aliases);
    const [logits] = await evalStep(bx);

    return {
      restoredLosses,
      statNames,
      before,
      after,
      bnLosses,
      logitsSample: Array.from(logits!.slice(0, 8)),
    };
  }, { dropoutModel: DROPOUT_MODEL, bnModel: BN_MODEL });

  // Dropout: fresh mask per step — identical weights and batch must NOT
  // reproduce the loss (a frozen mask or no-op dropout makes these equal).
  const [l0, l1, l2] = result.restoredLosses;
  for (const loss of result.restoredLosses) {
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThan(0);
  }
  expect(l0).not.toBe(l1);
  expect(l1).not.toBe(l2);

  // BatchNorm: both stats exposed (directly or via alias), correct init.
  expect(result.statNames).toHaveLength(2);
  const meanName = result.statNames.find(n => n.endsWith('.running_mean'))!;
  const varName = result.statNames.find(n => n.endsWith('.running_var'))!;
  expect(result.before[meanName]).toEqual([0, 0, 0, 0]);
  expect(result.before[varName]).toEqual([1, 1, 1, 1]);
  // The update assigns are IN the trace: stats moved after five steps.
  expect(result.after[meanName]).not.toEqual(result.before[meanName]);
  expect(result.after[varName]).not.toEqual(result.before[varName]);
  for (const value of [...result.after[meanName]!, ...result.after[varName]!]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  // Training descends from the ~ln(4) start.
  expect(result.bnLosses[0]).toBeGreaterThan(2);
  expect(result.bnLosses[4]).toBeLessThan(result.bnLosses[0]!);
  // Eval runner: alias-synced weights, finite logits.
  for (const logit of result.logitsSample) expect(Number.isFinite(logit)).toBe(true);
});
