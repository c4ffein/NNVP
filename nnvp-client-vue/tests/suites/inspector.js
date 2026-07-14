/**
 * Inspect mode (lib/Inspector): activation summaries/pixels are pure and
 * tested exactly, the probe's output -> nnvp-layer-id mapping is tested both
 * pure (fake layer objects) and end-to-end against REAL tfjs models built by
 * executing KerasGenerator's generated JavaScript the same way TrainingZone
 * does, and the facade event flow is tested over the fake store editor like
 * boardInterface.js does.
 */
import { logicTest } from '../harness/define';
import {
  summarizeActivation, activationToPixels, DENSE_CAP, CHANNEL_CAP, MAP_CAP,
} from '../../src/lib/Inspector/activationSummary';
import {
  orderedRealLayerIds, matchLayersToIds, buildProbe, inputEntries, runInspection,
} from '../../src/lib/Inspector/probe';
import { buildClassIndex, sampleAt } from '../../src/lib/Inspector/datasetSamples';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import BoardInterface from '../../src/lib/BoardInterface/BoardInterface';
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';

// --- Fixtures (same style as KerasGenerator.js: fresh per use, generator mutates) ---

function leaf(id, name, {
  params = {}, def = {}, inputLayers = [], outputLayers = [],
} = {}) {
  return {
    id,
    x: 0,
    y: 0,
    name,
    inputLayers,
    outputLayers,
    children: null,
    kerasLayer: {
      name, category: 'test', parameterValues: params, parameterDef: def,
    },
  };
}

// Linear chain (generates tf.sequential()). Like real app JSON, `outputs`
// holds the id of the layer FEEDING the Output node, not the Output node.
function denseChainJson() {
  return {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2'] }),
      leaf('2', 'Dense', { params: { units: 3, activation: 'relu' }, inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { params: { units: 2 }, inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'Output', { inputLayers: ['3'] }),
    ],
  };
}

// Branching graph (generates a functional tf.model()).
function branchingJson() {
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
  };
}

function convChainJson() {
  return {
    inputs: ['1'],
    outputs: ['2'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4, 4, 1] }, outputLayers: ['2'] }),
      leaf('2', 'Conv2D', { params: { filters: 2, kernel_size: [2, 2] }, inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Output', { inputLayers: ['2'] }),
    ],
  };
}

// --- activation summaries (pure) ---------------------------------------------------

logicTest('inspector: summarizeActivation passes small dense layers through unchanged', ({ expect }) => {
  const summary = summarizeActivation(new Float32Array([1, -2, 3]), [3]);
  expect(summary.kind).toBe('dense');
  expect(summary.units).toBe(3);
  expect(summary.overflow).toBe(false);
  expect(Array.from(summary.values)).toEqual([1, -2, 3]);
});

logicTest('inspector: summarizeActivation block-means large dense layers into the cap', ({ expect }) => {
  const units = DENSE_CAP * 2;
  const data = Float32Array.from({ length: units }, (_, i) => i);
  const summary = summarizeActivation(data, [units]);
  expect(summary.overflow).toBe(true);
  // The WHOLE vector survives as DENSE_CAP block means (bucket j = units
  // 2j..2j+1), keeping its structure — no truncate-plus-one-mean-cell.
  expect(summary.values.length).toBe(DENSE_CAP);
  expect(summary.values[0]).toBe(0.5);
  expect(summary.values[1]).toBe(2.5);
  expect(summary.values[DENSE_CAP - 1]).toBe(2 * (DENSE_CAP - 1) + 0.5);
});

logicTest('inspector: summarizeActivation reads conv maps channels-last and caps channels', ({ expect }) => {
  // [2, 2, 10]: channel c holds value (cell index) * 10 + c.
  const data = new Float32Array(2 * 2 * 10);
  for (let cell = 0; cell < 4; cell += 1) {
    for (let c = 0; c < 10; c += 1) data[cell * 10 + c] = cell * 10 + c;
  }
  const summary = summarizeActivation(data, [2, 2, 10]);
  expect(summary.kind).toBe('conv');
  expect(summary.channels).toBe(10);
  expect(summary.shownChannels).toBe(CHANNEL_CAP);
  expect(summary.maps.length).toBe(CHANNEL_CAP);
  expect(Array.from(summary.maps[0])).toEqual([0, 10, 20, 30]);
  expect(Array.from(summary.maps[7])).toEqual([7, 17, 27, 37]);
});

logicTest('inspector: summarizeActivation block-means large maps down to MAP_CAP', ({ expect }) => {
  // 32x32 single channel, constant over each 2x2 block: block (by,bx) = by*16+bx.
  const side = MAP_CAP * 2;
  const data = new Float32Array(side * side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      data[y * side + x] = Math.floor(y / 2) * MAP_CAP + Math.floor(x / 2);
    }
  }
  const summary = summarizeActivation(data, [side, side, 1]);
  expect(summary.mapHeight).toBe(MAP_CAP);
  expect(summary.mapWidth).toBe(MAP_CAP);
  const map = summary.maps[0];
  expect(map.length).toBe(MAP_CAP * MAP_CAP);
  expect(map[0]).toBe(0);
  expect(map[1]).toBe(1);
  expect(map[MAP_CAP * MAP_CAP - 1]).toBe(MAP_CAP * MAP_CAP - 1);
});

logicTest('inspector: summarizeActivation falls back to a mean for other ranks', ({ expect }) => {
  const summary = summarizeActivation(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), [2, 2, 2, 1]);
  expect(summary.kind).toBe('mean');
  expect(summary.size).toBe(8);
  expect(summary.mean).toBe(4.5);
});

// --- activationToPixels (pure) ------------------------------------------------------

logicTest('inspector: activationToPixels lays dense values on a normalized near-square grid', ({ expect }) => {
  const pixels = activationToPixels(summarizeActivation(new Float32Array([0, 5, 10]), [3]));
  expect(pixels.kind).toBe('grid');
  expect(pixels.width).toBe(2);
  expect(pixels.height).toBe(2);
  expect(pixels.count).toBe(3);
  // min/max normalized to 0..1; the unused trailing cell is -1 (padding).
  expect(Array.from(pixels.pixels)).toEqual([0, 0.5, 1, -1]);
});

logicTest('inspector: activationToPixels maps a flat dense layer to mid-intensity', ({ expect }) => {
  const pixels = activationToPixels(summarizeActivation(new Float32Array([3, 3, 3]), [3]));
  expect(Array.from(pixels.pixels).slice(0, 3)).toEqual([0.5, 0.5, 0.5]);
});

logicTest('inspector: activationToPixels normalizes conv tiles over ONE shared range', ({ expect }) => {
  const summary = {
    kind: 'conv',
    channels: 2,
    shownChannels: 2,
    mapHeight: 1,
    mapWidth: 2,
    maps: [new Float32Array([0, 1]), new Float32Array([2, 4])],
  };
  const pixels = activationToPixels(summary);
  expect(pixels.kind).toBe('tiles');
  // Shared 0..4 range (values chosen to stay exact in float32).
  expect(Array.from(pixels.tiles[0])).toEqual([0, 0.25]);
  expect(Array.from(pixels.tiles[1])).toEqual([0.5, 1]);
});

logicTest('inspector: activationToPixels squashes the mean into a 0..1 tint', ({ expect }) => {
  expect(activationToPixels({ kind: 'mean', size: 1, mean: -2 }).intensity).toBe(0);
  expect(activationToPixels({ kind: 'mean', size: 1, mean: 1 }).intensity).toBe(0.5);
  expect(activationToPixels({ kind: 'mean', size: 1, mean: 3 }).intensity).toBe(0.75);
});

// --- probe mapping (pure) -----------------------------------------------------------

logicTest('inspector: orderedRealLayerIds lists generated layers in treatment order, without Input/Output', ({ expect }) => {
  expect(orderedRealLayerIds(denseChainJson())).toEqual(['2', '3']);
  expect(orderedRealLayerIds(JSON.stringify(branchingJson()))).toEqual(['2', '3', '4']);
});

logicTest('inspector: orderedRealLayerIds does not mutate a caller-owned graph object', ({ expect }) => {
  const json = denseChainJson();
  orderedRealLayerIds(json);
  expect(json.layers[1].kerasLayer).toBeDefined();
});

logicTest('inspector: matchLayersToIds pairs non-input layers with ids by creation order', ({ expect }) => {
  const layer = (className, id) => ({ getClassName: () => className, id });
  const layers = [
    layer('Dense', 8), layer('InputLayer', 6), layer('Concatenate', 9), layer('Dense', 7),
  ];
  const matched = matchLayersToIds(layers, ['2', '3', '4']);
  expect(matched.map(m => [m.id, m.layer.id])).toEqual([['2', 7], ['3', 8], ['4', 9]]);
});

logicTest('inspector: matchLayersToIds throws when the board no longer matches the model', ({ expect }) => {
  const layers = [{ getClassName: () => 'Dense', id: 1 }];
  expect(() => matchLayersToIds(layers, ['2', '3'])).toThrow();
});

// --- dataset sample browsing (pure) ---------------------------------------------------

logicTest('inspector: buildClassIndex groups sample positions by class', ({ expect }) => {
  const index = buildClassIndex(Uint8Array.from([0, 1, 0, 2, 1, 9]), 3);
  expect(index).toEqual([[0, 2], [1, 4], [3]]);
});

logicTest('inspector: sampleAt slices one flat sample out of the images array', ({ expect }) => {
  const images = Float32Array.from([0, 1, 2, 3, 4, 5]);
  expect(Array.from(sampleAt(images, 2, 1))).toEqual([2, 3]);
});

// --- facade event flow (fake store, like boardInterface.js) ---------------------------

logicTest('inspector: setInspection publishes to listeners and getInspection, null clears', ({ expect }) => {
  const iface = new BoardInterface();
  const state = { nodes: [], edges: [], selectedNodes: [], selectedEdges: [] };
  iface.addGraphEditor(new FlowGraphEditor({
    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    setGraph: (nodes, edges) => { state.nodes = nodes; state.edges = edges; },
    getSelectedNodes: () => state.selectedNodes,
    getSelectedEdges: () => state.selectedEdges,
  }));
  const received = [];
  iface.on('inspection-changed', data => received.push(data));
  const payload = { byLayerId: { 2: { shape: [3] } }, sample: { class: 7, number: 0 } };
  iface.setInspection(payload);
  expect(received).toEqual([payload]);
  expect(iface.getInspection()).toBe(payload);
  iface.setInspection(null);
  expect(received).toEqual([payload, null]);
  expect(iface.getInspection()).toBe(null);
});

// --- end-to-end micro tests against REAL tfjs (runs under bun, cpu backend) ----------

// Same lazy-import + console-muting setup as tests/suites/tfjsTraining.js.
let tf = null;

async function setup(expect) {
  if (!tf) {
    const muted = ['log', 'warn', 'error'].map((level) => {
      const original = console[level];
      console[level] = () => {};
      return [level, original];
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

// Build the model EXACTLY like TrainingZone: generate JavaScript from the
// graph JSON and execute it (Function ~ eval) against the real tf.
function modelFromGraph(json) {
  const code = new KerasGenerator(json, true).generateJavascriptFromGraph();
  const createModel = new Function('tf', `${code}\nreturn createModel;`)(tf);
  return createModel();
}

logicTest('inspector: probes a generated sequential model — right ids, shapes, and exact values', async ({ expect }) => {
  await setup(expect);
  const model = modelFromGraph(denseChainJson());
  // Known weights: every unit of layer 2 sums the input (relu), layer 3 sums layer 2.
  model.layers[0].setWeights([tf.ones([4, 3]), tf.zeros([3])]);
  model.layers[1].setWeights([tf.ones([3, 2]), tf.zeros([2])]);
  const { probe, layerIds } = buildProbe(model, denseChainJson(), tf);
  expect(layerIds).toEqual(['2', '3']);
  const input = tf.tensor2d([[1, 2, 3, 4]]);

  const result = await runInspection(probe, layerIds, input);
  expect(Object.keys(result).sort()).toEqual(['2', '3']);
  expect(result['2'].shape).toEqual([3]);
  expect(result['3'].shape).toEqual([2]);
  expect(Array.from(result['2'].summary.values)).toEqual([10, 10, 10]);
  expect(Array.from(result['3'].summary.values)).toEqual([30, 30]);
  expect(result['2'].pixels.kind).toBe('grid');

  // Leak check: a second run must not grow tfjs' tensor count.
  const before = tf.memory().numTensors;
  await runInspection(probe, layerIds, input);
  expect(tf.memory().numTensors).toBe(before);

  input.dispose();
  model.dispose();
});

logicTest('inspector: probes a generated functional model — branch ids are not swapped', async ({ expect }) => {
  await setup(expect);
  const model = modelFromGraph(branchingJson());
  const { probe, layerIds } = buildProbe(model, branchingJson(), tf);
  expect(layerIds).toEqual(['2', '3', '4']);
  // Give each branch distinct weights THROUGH the mapping, then verify the
  // graph's own ordering: Concatenate applies [layer_2, layer_3], so node 4
  // must start with node 2's activations. If the two Dense layers were
  // cross-mapped, this comes out reversed.
  const byId = {};
  matchLayersToIds(model.layers, layerIds).forEach(({ id, layer }) => { byId[id] = layer; });
  byId['2'].setWeights([tf.ones([4, 3]), tf.zeros([3])]);
  byId['3'].setWeights([tf.mul(tf.ones([4, 3]), 0.5), tf.zeros([3])]);
  const input = tf.tensor2d([[1, 2, 3, 4]]);

  const result = await runInspection(probe, layerIds, input);
  expect(Array.from(result['2'].summary.values)).toEqual([10, 10, 10]);
  expect(Array.from(result['3'].summary.values)).toEqual([5, 5, 5]);
  expect(Array.from(result['4'].summary.values)).toEqual([10, 10, 10, 5, 5, 5]);

  input.dispose();
  model.dispose();
});

logicTest('inspector: probes a generated conv model — channels-last maps with the right dims', async ({ expect }) => {
  await setup(expect);
  const model = modelFromGraph(convChainJson());
  const { probe, layerIds } = buildProbe(model, convChainJson(), tf);
  expect(layerIds).toEqual(['2']);
  const input = tf.ones([1, 4, 4, 1]);

  const result = await runInspection(probe, layerIds, input);
  expect(result['2'].shape).toEqual([3, 3, 2]);
  expect(result['2'].summary.kind).toBe('conv');
  expect(result['2'].summary.shownChannels).toBe(2);
  expect(result['2'].summary.mapHeight).toBe(3);
  expect(result['2'].summary.mapWidth).toBe(3);
  expect(result['2'].pixels.kind).toBe('tiles');
  expect(result['2'].pixels.tiles.length).toBe(2);

  input.dispose();
  model.dispose();
});

logicTest('inspector: inputEntries publishes the sample itself on the Input node(s)', ({ expect }) => {
  const graphJson = new BoardTemplates().get('2D Dense for MNIST');
  const inputId = JSON.parse(graphJson).layers
    .find(layer => layer.kerasLayer.name === 'Input').id;
  const sample = new Float32Array(28 * 28);
  sample[0] = 1; // one lit pixel, everything else 0
  const entries = inputEntries(graphJson, sample, [28, 28, 1]);
  expect(Object.keys(entries)).toEqual([String(inputId)]);
  const entry = entries[inputId];
  expect(entry.shape).toEqual([28, 28, 1]);
  // 28 <= MAP_CAP: the digit survives pixel-exact into the conv summary.
  expect(entry.summary.kind).toBe('conv');
  expect(entry.summary.mapHeight).toBe(28);
  expect(entry.summary.maps[0][0]).toBe(1);
  expect(entry.summary.maps[0][1]).toBe(0);
  expect(entry.pixels.kind).toBe('tiles');
});
