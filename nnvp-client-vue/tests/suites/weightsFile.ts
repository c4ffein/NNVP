/**
 * Unit tests for the nnvp weights file (src/lib/Training/weightsFile.ts):
 * real tfjs sessions built EXACTLY like TrainingZone (KerasGenerator's
 * JavaScript, eval'd by the tfjs engine) from graph fixtures — canonical
 * naming that survives tfjs's per-page name uniquification, deterministic
 * bytes, the identity/names/shape verifier, and all-or-nothing import.
 */
import { appTest, logicTest } from '../harness/define';
import type { Expect } from '../harness/define';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import { createTfjsEngine } from '../../src/lib/Training/tfjsEngine';
import { modelIdentityOf } from '../../src/lib/Training/modelIdentity';
import { decodeSafetensors, encodeSafetensors } from '../../src/lib/Training/safetensors';
import {
  WEIGHTS_FILE_FORMAT, WEIGHTS_META, WeightsFileError, canonicalWeights, describeWeightsFile,
  exportWeights, importWeights, weightsFileName,
} from '../../src/lib/Training/weightsFile';
import type { WeightsModel } from '../../src/lib/Training/weightsFile';
import type { NamedWeights, TrainingSession } from '../../src/lib/Training/engine';
import type { NnvpLayer, NnvpModel, ParameterDef, ParameterValue } from '../../src/types/model';

type Tfjs = typeof import('@tensorflow/tfjs');

let tf = null as unknown as Tfjs;

// Same setup as trainingEngine.ts: cpu backend, banner burned while muted.
async function setup(expect: Expect): Promise<void> {
  if (!tf) {
    const muted = (['log', 'warn', 'error'] as const).map((level) => {
      const original = console[level];
      console[level] = () => {};
      return [level, original] as const;
    });
    try {
      tf = await import('@tensorflow/tfjs');
      await tf.setBackend('cpu');
      await tf.ready();
      tf.scalar(0).dispose();
    } finally {
      for (const [level, original] of muted) console[level] = original;
    }
  }
  expect(tf.getBackend()).toBe('cpu');
}

// --- Fixtures (inspector.ts style: fresh per use, the generator mutates) ---

function leaf(id: string, name: string, {
  params = {}, def = {}, inputLayers = [], outputLayers = [],
}: {
  params?: Record<string, ParameterValue>;
  def?: Record<string, ParameterDef>;
  inputLayers?: string[];
  outputLayers?: string[];
} = {}): NnvpLayer {
  return {
    id, x: 0, y: 0, name, inputLayers, outputLayers, children: null, class: 'Layer',
    kerasLayer: { name, category: 'test', parameterValues: params, parameterDef: def },
  } as unknown as NnvpLayer;
}

function denseChainJson(units = 3): NnvpModel {
  return {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2'] }),
      leaf('2', 'Dense', { params: { units, activation: 'relu' }, inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { params: { units: 2 }, inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'Output', { inputLayers: ['3'] }),
    ],
  } as unknown as NnvpModel;
}

// Functional form (tf.model) with a branch: two Dense layers share an input.
function branchingJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: ['4'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2', '3'] }),
      leaf('2', 'Dense', { params: { units: 3 }, inputLayers: ['1'], outputLayers: ['4'] }),
      leaf('3', 'Dense', { params: { units: 3 }, inputLayers: ['1'], outputLayers: ['4'] }),
      leaf('4', 'Concatenate', { inputLayers: ['2', '3'], outputLayers: ['5'] }),
      leaf('5', 'Output', { inputLayers: ['4'] }),
    ],
  } as unknown as NnvpModel;
}

// A session built exactly like TrainingZone: generated JS, eval'd by the engine.
async function sessionFor(json: NnvpModel | string): Promise<{ session: TrainingSession; graphJson: string }> {
  const graphJson = typeof json === 'string' ? json : JSON.stringify(json);
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare(graphJson, {
    generateCode: () => new KerasGenerator(JSON.parse(graphJson), true).generateJavascriptFromGraph(),
    optimizer: 'sgd',
    optimizerParams: {},
    loss: 'meanSquaredError',
    epochs: 1,
  });
  return { session, graphJson };
}

function fillWeights(session: TrainingSession, seed: number): NamedWeights {
  const current = session.getWeights() as NamedWeights;
  const named: NamedWeights = {};
  Object.keys(current).forEach((name, n) => {
    named[name] = Float32Array.from({ length: current[name]!.length }, (_, i) => seed + n * 10 + i * 0.25);
  });
  session.setWeights(named);
  return named;
}

async function rejection(promise: Promise<unknown>): Promise<WeightsFileError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WeightsFileError) return error;
    throw error;
  }
  throw new Error('expected a WeightsFileError');
}

logicTest('weightsFile: canonical names are <layer id>/<weight> in generation order, stable across rebuilds', async ({ expect }) => {
  await setup(expect);
  const first = await sessionFor(denseChainJson());
  const second = await sessionFor(denseChainJson());
  const firstNames = canonicalWeights(first.session.model as WeightsModel, first.graphJson);
  const secondNames = canonicalWeights(second.session.model as WeightsModel, second.graphJson);
  expect(firstNames.map(w => w.canonical)).toEqual(['2/kernel', '2/bias', '3/kernel', '3/bias']);
  expect(firstNames.map(w => w.shape)).toEqual([[4, 3], [3], [3, 2], [2]]);
  // tfjs uniquified the SECOND model's variable names, the canonical ones did not move.
  expect(secondNames.map(w => w.canonical)).toEqual(firstNames.map(w => w.canonical));
  expect(secondNames.map(w => w.tfName)).not.toEqual(firstNames.map(w => w.tfName));
  // The functional form maps too (Concatenate has no weights; ids 2 and 3 do).
  const branching = await sessionFor(branchingJson());
  expect(canonicalWeights(branching.session.model as WeightsModel, branching.graphJson).map(w => w.canonical))
    .toEqual(['2/kernel', '2/bias', '3/kernel', '3/bias']);
});

logicTest('weightsFile: canonical naming strips tfjs uid tails from nested scopes and refuses collisions', ({ expect }) => {
  const layer = (id: number, name: string, weights: Array<[string, string, number[]]>) => ({
    id, name, getClassName: () => 'Dense', weights: weights.map(([n, o, shape]) => ({ name: n, originalName: o, shape })),
  });
  const graph = denseChainJson();
  const graphJson = JSON.stringify(graph);
  // Wrapper-style nested names: the intermediate segment carries a per-page uid.
  const nested = canonicalWeights({
    layers: [
      layer(1, 'l1', [['l1/forward_lstm_LSTM7/kernel_3', 'l1/forward_lstm_LSTM7/kernel', [2, 2]]]),
      layer(2, 'l2', [['l2/bias', 'l2/bias', [2]]]),
    ],
  }, graphJson);
  expect(nested.map(w => w.canonical)).toEqual(['2/forward_lstm/kernel', '3/bias']);
  // Two variables collapsing onto one canonical name would mis-save: refused.
  expect(() => canonicalWeights({
    layers: [
      layer(1, 'l1', [['l1/kernel', 'l1/kernel', [1]], ['l1/kernel_1', 'l1/kernel', [1]]]),
      layer(2, 'l2', []),
    ],
  }, graphJson)).toThrow(WeightsFileError);
  // Model/graph mismatch is the Inspector's own refusal, typed 'graph'.
  let code: string | null = null;
  try {
    canonicalWeights({ layers: [layer(1, 'l1', [])] }, graphJson);
  } catch (error) {
    code = (error as WeightsFileError).code;
  }
  expect(code).toBe('graph');
});

logicTest('weightsFile: export writes nnvp metadata + canonical tensors and is byte-deterministic', async ({ expect }) => {
  await setup(expect);
  const { session, graphJson } = await sessionFor(denseChainJson());
  fillWeights(session, 1);
  const exported = await exportWeights(session, graphJson);
  const identity = (await modelIdentityOf(graphJson))!;
  expect(exported.workHash).toBe(identity.workHash);
  expect(exported.tensorCount).toBe(4);
  expect(exported.fileName).toBe(weightsFileName(identity.workHash));
  expect(exported.fileName.endsWith('.safetensors')).toBe(true);
  const file = decodeSafetensors(exported.bytes);
  expect(file.metadata[WEIGHTS_META.format]).toBe(WEIGHTS_FILE_FORMAT);
  expect(file.metadata[WEIGHTS_META.workHash]).toBe(identity.workHash);
  expect(file.metadata[WEIGHTS_META.summary]).toBe(identity.summary);
  expect(file.entries.map(entry => entry.name)).toEqual(['2/kernel', '2/bias', '3/kernel', '3/bias']);
  expect(Array.from(file.entries[1]!.data)).toEqual([11, 11.25, 11.5]);
  // Same weights, same network → same bytes (no timestamps: content addressing later hashes these).
  const again = await exportWeights(session, graphJson);
  expect(Array.from(again.bytes)).toEqual(Array.from(exported.bytes));
  expect(describeWeightsFile(exported.bytes)).toEqual({ workHash: identity.workHash, summary: identity.summary, tensorCount: 4 });
});

logicTest('weightsFile: import restores exported weights into a FRESH session of the same network', async ({ expect }) => {
  await setup(expect);
  const source = await sessionFor(denseChainJson());
  const expected = fillWeights(source.session, 7);
  const { bytes } = await exportWeights(source.session, source.graphJson);
  // A new session: different tf variable names, freshly initialized weights.
  const target = await sessionFor(denseChainJson());
  const before = target.session.getWeights() as NamedWeights;
  const result = await importWeights(target.session, target.graphJson, bytes);
  expect(result.applied).toBe(4);
  const after = target.session.getWeights() as NamedWeights;
  const sourceValues = Object.keys(expected).map(name => Array.from(expected[name]!));
  const targetValues = Object.keys(after).map(name => Array.from(after[name]!));
  expect(targetValues).toEqual(sourceValues);
  expect(Object.keys(after)).toEqual(Object.keys(before)); // same variables, new values
  // An ArrayBuffer (what a File gives) works the same as a Uint8Array.
  const copy = bytes.slice().buffer;
  expect((await importWeights(target.session, target.graphJson, copy)).applied).toBe(4);
});

logicTest('weightsFile: the verifier refuses foreign files, other networks, tensor mismatches — and writes nothing', async ({ expect }) => {
  await setup(expect);
  const { session, graphJson } = await sessionFor(denseChainJson());
  const untouched = Object.values(fillWeights(session, 3)).map(values => Array.from(values));
  const unchanged = () => expect(Object.values(session.getWeights() as NamedWeights).map(v => Array.from(v))).toEqual(untouched);

  // Not safetensors at all.
  expect((await rejection(importWeights(session, graphJson, new Uint8Array([1, 2, 3])))).code).toBe('file');
  // Safetensors, but not from nnvp (no metadata) — a tinygrad/HF file.
  const foreign = encodeSafetensors([{ name: '2/kernel', dtype: 'F32', shape: [4, 3], data: new Float32Array(12) }]);
  expect((await rejection(importWeights(session, graphJson, foreign))).code).toBe('format');
  expect(() => describeWeightsFile(foreign)).toThrow(WeightsFileError);
  // A different network (units 5 ≠ 3 → different workHash).
  const other = await sessionFor(denseChainJson(5));
  const otherBytes = (await exportWeights(other.session, other.graphJson)).bytes;
  const identityError = await rejection(importWeights(session, graphJson, otherBytes));
  expect(identityError.code).toBe('identity');
  expect(identityError.message).toContain('different network');
  // Same workHash claimed, but the tensor set is off (missing one, one extra).
  const good = decodeSafetensors((await exportWeights(session, graphJson)).bytes);
  const tampered = encodeSafetensors(
    [...good.entries.slice(0, 3), { ...good.entries[3]!, name: '9/bias' }],
    good.metadata,
  );
  const namesError = await rejection(importWeights(session, graphJson, tampered));
  expect(namesError.code).toBe('names');
  expect(namesError.message).toContain('3/bias');
  expect(namesError.message).toContain('9/bias');
  // Same names, wrong shape.
  const reshaped = encodeSafetensors(
    good.entries.map(entry => (entry.name === '3/bias' ? { ...entry, shape: [1, 2] } : entry)),
    good.metadata,
  );
  expect((await rejection(importWeights(session, graphJson, reshaped))).code).toBe('shape');
  unchanged();

  // Engines without a main-thread model can't export/import (typed, not a crash).
  const modelless = { ...session, model: null };
  expect((await rejection(exportWeights(modelless, graphJson))).code).toBe('no-model');
  expect((await rejection(importWeights(modelless, graphJson, otherBytes))).code).toBe('no-model');
  // A graph that is not a model at all, and one that doesn't describe this model.
  expect((await rejection(exportWeights(session, 'not json'))).code).toBe('graph');
  expect((await rejection(exportWeights(session, '{"nope":true}'))).code).toBe('graph');
});

// --- The Inspect tab's weights row (both worlds) --------------------------------

appTest('weights: the Inspect tab restores a weights file saved from this network and refuses any other', async ({ board, training, expect }) => {
  await setup(expect);
  // The board's network, exactly as the app serializes it — the file's
  // identity must match THAT (workHash), so the fixture bytes come from a
  // session over the same JSON, the way TrainingZone builds one.
  await board.loadTemplate('2D Dense for MNIST');
  const graphJson = await board.graphJSON();
  const source = await sessionFor(graphJson);
  fillWeights(source.session, 5);
  const exported = await exportWeights(source.session, graphJson);
  const other = await sessionFor(denseChainJson());
  const foreign = await exportWeights(other.session, other.graphJson);

  await training.openInspect();
  let row = await training.weightsRow();
  expect(row.downloadEnabled).toBe(false); // nothing trained yet
  expect(row.loadEnabled).toBe(true);
  expect(row.status).toBeNull();
  expect(row.hint).toContain('load a weights file');

  // Not a safetensors file at all → refused, nothing built, hint stays.
  await training.loadWeightsFile('junk.safetensors', new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9]));
  row = await training.weightsRow();
  expect(row.statusIsError).toBe(true);
  expect(row.status).toContain('not a readable safetensors file');
  expect(row.hint).not.toBeNull();
  expect(row.downloadEnabled).toBe(false);

  // A real nnvp weights file, for a DIFFERENT network → refused by identity.
  await training.loadWeightsFile(foreign.fileName, foreign.bytes);
  row = await training.weightsRow();
  expect(row.statusIsError).toBe(true);
  expect(row.status).toContain('different network');
  expect(row.hint).not.toBeNull();

  // The file saved from this network → a fresh model carries its weights;
  // Inspect has a model now and Download is offered.
  await training.loadWeightsFile(exported.fileName, exported.bytes);
  row = await training.weightsRow();
  expect(row.statusIsError).toBe(false);
  expect(row.status).toContain(`Loaded ${exported.tensorCount} tensors`);
  expect(row.status).toContain(exported.fileName);
  expect(row.hint).toBeNull();
  expect(row.downloadEnabled).toBe(true);
});
