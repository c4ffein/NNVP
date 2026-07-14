/**
 * Viz3D pure modules: mat4/orbit math against known values, NnvpModel →
 * scene-buffer building on the real board templates, edge-sampling caps with
 * honest omitted counts, activation buffer sizing, determinism — plus a
 * structural check of the renderer's WGSL strings and pipeline descriptors
 * (the GPU half itself can only run in a browser).
 */
import { logicTest } from '../harness/define';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import {
  mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt, mat4InvertRigid, mat4TransformPoint,
  createOrbitState, orbitEye, orbitViewMatrix, applyOrbitDrag, applyOrbitPan, applyOrbitZoom,
  ORBIT_PITCH_LIMIT, ORBIT_MIN_DISTANCE, ORBIT_MAX_DISTANCE,
} from '../../src/lib/Viz3D/math';
import {
  buildScene, buildActivations, pickLayer,
  NEURON_STRIDE, EDGE_STRIDE, NEURON_CAP, EDGE_SEGMENT_CAP, MAX_CHANNEL_SLICES,
  SAME_SHAPE_GAP, MIRROR_GAP,
} from '../../src/lib/Viz3D/sceneBuild';
import {
  NEURON_WGSL, EDGE_WGSL, UNIFORM_FLOATS, DEPTH_FORMAT,
  neuronPipelineDescriptor, edgePipelineDescriptor, webgpuAvailable,
} from '../../src/lib/Viz3D/renderer';
import { inspectionToViz3D } from '../../src/lib/Viz3D/inspectionBridge';

const templates = new BoardTemplates().templates;
const templateModel = name => JSON.parse(templates[name]);

const expectMat4CloseTo = (expect, actual, expected, digits = 6) => {
  expect(actual.length).toBe(16);
  for (let i = 0; i < 16; i += 1) expect(actual[i]).toBeCloseTo(expected[i], digits);
};

// A minimal NnvpModel with the given Dense layer sizes chained in order.
const denseChain = (...unitCounts) => ({
  layers: unitCounts.map((units, i) => ({
    class: 'D3Layer',
    id: i,
    htmlID: `d3-layer-${i}`,
    name: `Dense_${i}`,
    x: 0,
    y: 0,
    inputLayers: i > 0 ? [i - 1] : [],
    outputLayers: i < unitCounts.length - 1 ? [i + 1] : [],
    children: null,
    kerasLayer: {
      name: 'Dense',
      category: 'Core',
      searchTerms: ['Dense'],
      parameterDef: {},
      parameterValues: { units },
      customUserLayer: false,
    },
    parentID: null,
  })),
  edges: unitCounts.slice(1).map((_, i) => ({
    id: 100 + i, htmlID: `edge-${i}`, source: i, target: i + 1,
  })),
  inputs: [],
  outputs: [],
});

// --- mat4 --------------------------------------------------------------------------

logicTest('viz3d math: perspective matrix matches the WebGPU [0,1]-depth reference', ({ expect }) => {
  // fovY 90°, aspect 1, near 1, far 10: f = 1, m22 = far/(near-far) = -10/9,
  // m32 = near*far/(near-far) = -10/9 (column-major indices 10 and 14).
  const m = mat4Perspective(Math.PI / 2, 1, 1, 10);
  expect(m[0]).toBeCloseTo(1, 6);
  expect(m[5]).toBeCloseTo(1, 6);
  expect(m[10]).toBeCloseTo(-10 / 9, 6);
  expect(m[11]).toBe(-1);
  expect(m[14]).toBeCloseTo(-10 / 9, 6);
  expect(m[15]).toBe(0);
  // Near plane maps to depth 0, far plane to depth 1 (after the w-divide).
  expect(mat4TransformPoint(m, [0, 0, -1])[2]).toBeCloseTo(0, 6);
  expect(mat4TransformPoint(m, [0, 0, -10])[2]).toBeCloseTo(1, 6);
});

logicTest('viz3d math: lookAt from +z is a pure -z translation', ({ expect }) => {
  const view = mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  expectMat4CloseTo(expect, view, [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -5, 1,
  ]);
  // The target always lands straight ahead, -distance along the view z axis.
  const eye = [3, -2, 7];
  const target = [1, 1, 1];
  const seen = mat4TransformPoint(mat4LookAt(eye, target, [0, 1, 0]), target);
  expect(seen[0]).toBeCloseTo(0, 6);
  expect(seen[1]).toBeCloseTo(0, 6);
  expect(seen[2]).toBeCloseTo(-Math.hypot(2, 3, 6), 6);
});

logicTest('viz3d math: multiply obeys identity and composes transforms in order', ({ expect }) => {
  const translate = mat4Identity();
  translate[12] = 2;
  translate[13] = 3;
  translate[14] = 4;
  const scale = mat4Identity();
  scale[0] = 2;
  scale[5] = 2;
  scale[10] = 2;
  expect(mat4Multiply(mat4Identity(), translate)).toEqual(translate);
  expect(mat4Multiply(translate, mat4Identity())).toEqual(translate);
  // T·S applies the scale FIRST: (1,1,1) → (2,2,2) → (4,5,6).
  expect(mat4TransformPoint(mat4Multiply(translate, scale), [1, 1, 1])).toEqual([4, 5, 6]);
  // S·T applies the translation first: (1,1,1) → (3,4,5) → (6,8,10).
  expect(mat4TransformPoint(mat4Multiply(scale, translate), [1, 1, 1])).toEqual([6, 8, 10]);
});

logicTest('viz3d math: invertRigid inverts an arbitrary orbit view matrix', ({ expect }) => {
  const view = orbitViewMatrix(createOrbitState({
    yaw: 1.1, pitch: -0.4, distance: 17, target: [3, -1, 2],
  }));
  expectMat4CloseTo(expect, mat4Multiply(view, mat4InvertRigid(view)), mat4Identity());
  expectMat4CloseTo(expect, mat4Multiply(mat4InvertRigid(view), view), mat4Identity());
});

// --- orbit camera ---------------------------------------------------------------------

logicTest('viz3d orbit: state maps to the expected eye and view matrix', ({ expect }) => {
  const state = createOrbitState({
    yaw: 0, pitch: 0, distance: 5, target: [0, 0, 0],
  });
  expect(orbitEye(state)).toEqual([0, 0, 5]);
  expectMat4CloseTo(expect, orbitViewMatrix(state), mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]));
  const quarter = orbitEye({ ...state, yaw: Math.PI / 2 });
  expect(quarter[0]).toBeCloseTo(5, 6);
  expect(quarter[1]).toBeCloseTo(0, 6);
  expect(quarter[2]).toBeCloseTo(0, 6);
  const above = orbitEye({ ...state, pitch: Math.PI / 4 });
  expect(above[1]).toBeCloseTo(5 * Math.SQRT1_2, 6);
});

logicTest('viz3d orbit: drag orbits and clamps pitch shy of the poles', ({ expect }) => {
  const state = createOrbitState({
    yaw: 0, pitch: 0, distance: 5, target: [0, 0, 0],
  });
  const dragged = applyOrbitDrag(state, 100, 50, 0.01);
  expect(dragged.yaw).toBeCloseTo(-1, 6);
  expect(dragged.pitch).toBeCloseTo(0.5, 6);
  expect(state.pitch).toBe(0); // pure: the input state is untouched
  expect(applyOrbitDrag(state, 0, 1e6).pitch).toBe(ORBIT_PITCH_LIMIT);
  expect(applyOrbitDrag(state, 0, -1e6).pitch).toBe(-ORBIT_PITCH_LIMIT);
});

logicTest('viz3d orbit: wheel zoom is multiplicative and clamped', ({ expect }) => {
  const state = createOrbitState({
    yaw: 0, pitch: 0, distance: 10, target: [0, 0, 0],
  });
  const inward = applyOrbitZoom(state, -200);
  const outward = applyOrbitZoom(state, 200);
  expect(inward.distance).toBeLessThan(10);
  expect(outward.distance).toBeGreaterThan(10);
  expect(inward.distance * outward.distance).toBeCloseTo(100, 6);
  expect(applyOrbitZoom(state, -1e9).distance).toBe(ORBIT_MIN_DISTANCE);
  expect(applyOrbitZoom(state, 1e9).distance).toBe(ORBIT_MAX_DISTANCE);
});

// --- scene building on real templates ------------------------------------------------

logicTest('viz3d scene: MNIST dense template gets the right neuron count per layer', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  // Input [28,28,1] plane, Dense units as-is; Flatten's length comes from the
  // codegen dim inference (28*28*1 → a 64-wide ribbon); the Output sink
  // mirrors the 10-way softmax feeding it (not a lone marker).
  expect(scene.layers.map(l => [l.name, l.kind, l.neuronCount])).toEqual([
    ['Input', 'planes', 784],
    ['Flatten', 'grid', 784],
    ['Dense', 'grid', 42],
    ['Dense', 'grid', 10],
    ['Output', 'grid', 10],
  ]);
  expect([scene.layers[1].cols, scene.layers[1].rows]).toEqual([64, Math.ceil(784 / 64)]);
  expect(scene.layers[4].mirrors).toBe(String(scene.layers[3].layerId));
  expect(scene.neuronCount).toBe(1630);
  expect(scene.neurons.length).toBe(1630 * NEURON_STRIDE);
  expect(scene.activationSlots).toBe(1630);
  expect(scene.stats.omittedNeurons).toBe(0);
  expect(scene.layers.every(l => !l.overflow)).toBe(true);
});

logicTest('viz3d scene: CIFAR input stacks capped channel slices along z', ({ expect }) => {
  const scene = buildScene(templateModel('CIFAR-10 CNN'));
  const input = scene.layers[0];
  expect(input.kind).toBe('planes');
  expect(input.neuronCount).toBe(32 * 32 * Math.min(3, MAX_CHANNEL_SLICES));
  expect(input.totalUnits).toBe(32 * 32 * 3);
  expect(input.overflow).toBe(false);
  // The three channel slices occupy exactly three distinct z values.
  const zs = new Set();
  for (let i = 0; i < input.neuronCount; i += 1) {
    zs.add(scene.neurons[(input.firstNeuron + i) * NEURON_STRIDE + 2]);
  }
  expect(zs.size).toBe(3);
  // Conv layers get their exact computed shape: same-padding keeps 32×32,
  // channel slices capped at MAX_CHANNEL_SLICES of the 32 filters.
  expect(scene.layers[1].kind).toBe('planes');
  expect(scene.layers[1].name).toBe('Conv2D');
  expect(scene.layers[1].neuronCount).toBe(32 * 32 * MAX_CHANNEL_SLICES);
  expect(scene.layers[1].totalUnits).toBe(32 * 32 * 32);
});

logicTest('viz3d scene: z-layering follows the template topology', ({ expect }) => {
  for (const name of Object.keys(templates)) {
    const model = templateModel(name);
    const scene = buildScene(model);
    const byId = new Map(scene.layers.map(l => [String(l.layerId), l]));
    for (const edge of model.edges) {
      const source = byId.get(String(edge.source));
      const target = byId.get(String(edge.target));
      expect(target.depth).toBe(source.depth + 1); // templates are chains
      const zSource = scene.neurons[source.firstNeuron * NEURON_STRIDE + 2];
      const zTarget = scene.neurons[target.firstNeuron * NEURON_STRIDE + 2];
      expect(zTarget).toBeGreaterThan(zSource);
    }
  }
});

logicTest('viz3d scene: small layer pairs keep every connection, honestly counted', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  // Dense42→Dense10 (420) is under the cap and fully drawn; Dense10→Output is
  // a 1:1 mirror pass-through (10). The two Flatten pairs are 784×784 and
  // 784×42 — way over the cap, stratified down to 784 sources × fan-out 2.
  expect(scene.stats.pairs.map(p => p.sampled)).toEqual([1568, 1568, 420, 10]);
  expect(scene.stats.pairs[0].omitted).toBe(784 * 784 - 1568);
  expect(scene.stats.pairs[1].omitted).toBe(784 * 42 - 1568);
  const drawn = 1568 + 1568 + 420 + 10;
  expect(scene.edgeCount).toBe(drawn);
  expect(scene.edges.length).toBe(drawn * EDGE_STRIDE);
  expect(scene.stats.omittedEdges).toBe((784 * 784 - 1568) + (784 * 42 - 1568));
  expect(scene.stats.edgeSegmentCount).toBe(drawn);
});

logicTest('viz3d scene: dense pairs over the cap are sampled and the omissions reported', ({ expect }) => {
  const scene = buildScene(denseChain(100, 100));
  const pair = scene.stats.pairs[0];
  expect(pair.total).toBe(10000);
  expect(pair.sampled).toBe(EDGE_SEGMENT_CAP);
  expect(pair.omitted).toBe(10000 - EDGE_SEGMENT_CAP);
  expect(scene.stats.omittedEdges).toBe(pair.omitted);
  expect(scene.edgeCount).toBe(EDGE_SEGMENT_CAP);
});

logicTest('viz3d scene: sampling covers every source and keeps fan-in plausible', ({ expect }) => {
  const scene = buildScene(denseChain(100, 100));
  const source = scene.layers[0];
  const target = scene.layers[1];
  const positionOf = neuron => scene.neurons.slice(
    neuron * NEURON_STRIDE, neuron * NEURON_STRIDE + 3,
  ).join(',');
  const sourcePositions = new Map();
  const targetPositions = new Map();
  for (let i = 0; i < 100; i += 1) {
    sourcePositions.set(positionOf(source.firstNeuron + i), i);
    targetPositions.set(positionOf(target.firstNeuron + i), i);
  }
  const fanOut = Array.from({ length: 100 }, () => 0);
  const fanIn = Array.from({ length: 100 }, () => 0);
  for (let e = 0; e < scene.edgeCount; e += 1) {
    const base = e * EDGE_STRIDE;
    fanOut[sourcePositions.get(scene.edges.slice(base, base + 3).join(','))] += 1;
    fanIn[targetPositions.get(scene.edges.slice(base + 3, base + 6).join(','))] += 1;
  }
  // Stratified over sources: all 100 covered, 20 segments each (2000/100).
  expect(fanOut.every(count => count === 20)).toBe(true);
  // Hashed over targets: no aliasing onto a few — everything gets hit, and
  // nobody hogs more than ~2x the 20-segment average.
  expect(fanIn.filter(count => count > 0).length).toBe(100);
  expect(Math.max(...fanIn)).toBeLessThan(40);
});

logicTest('viz3d scene: layers over the neuron cap overflow loudly, never silently', ({ expect }) => {
  const scene = buildScene(denseChain(10000));
  const layer = scene.layers[0];
  expect(layer.neuronCount).toBe(NEURON_CAP);
  expect(layer.totalUnits).toBe(10000);
  expect(layer.overflow).toBe(true);
  expect(scene.stats.omittedNeurons).toBe(10000 - NEURON_CAP);
  expect(scene.neuronCount).toBe(NEURON_CAP);
});

logicTest('viz3d scene: a cyclic legacy graph still builds with finite depths', ({ expect }) => {
  const model = denseChain(4, 4, 4);
  model.edges.push({
    id: 999, htmlID: 'edge-back', source: 2, target: 1,
  });
  const scene = buildScene(model);
  expect(scene.layers.length).toBe(3);
  expect(scene.layers.every(l => Number.isFinite(l.depth) && l.depth >= 0)).toBe(true);
  expect(scene.neuronCount).toBe(12);
});

logicTest('viz3d scene: empty model builds an empty scene', ({ expect }) => {
  const scene = buildScene({
    layers: [], edges: [], inputs: [], outputs: [],
  });
  expect(scene.neuronCount).toBe(0);
  expect(scene.edgeCount).toBe(0);
  expect(scene.layers).toEqual([]);
  expect(scene.stats.omittedEdges).toBe(0);
});

logicTest('viz3d scene: building is deterministic — same model, identical buffers', ({ expect }) => {
  for (const name of ['2D Conv for MNIST', 'CIFAR-10 CNN']) {
    const first = buildScene(templateModel(name));
    const second = buildScene(templateModel(name));
    expect(Array.from(second.neurons)).toEqual(Array.from(first.neurons));
    expect(Array.from(second.edges)).toEqual(Array.from(first.edges));
    expect(second.stats).toEqual(first.stats);
  }
});

// --- activations -------------------------------------------------------------------

logicTest('viz3d activations: buffer is sized to the slots and deterministic', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  const activations = buildActivations(scene);
  expect(activations.length).toBe(scene.activationSlots);
  expect(Array.from(buildActivations(scene))).toEqual(Array.from(activations));
  // Placeholder gradient: 0 → 1 across each layer.
  const dense = scene.layers[3];
  expect(activations[dense.firstNeuron]).toBe(0);
  expect(activations[dense.firstNeuron + dense.neuronCount - 1]).toBe(1);
  const flatten = scene.layers[1];
  expect(activations[flatten.firstNeuron]).toBe(0);
  expect(activations[flatten.firstNeuron + flatten.neuronCount - 1]).toBe(1);
});

logicTest('viz3d activations: a {layerId → Float32Array} feed overrides just its layer', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  const dense = scene.layers[2]; // Dense units 42, layer id 2
  const values = new Float32Array(dense.neuronCount).fill(0.25);
  const activations = buildActivations(scene, { [String(dense.layerId)]: values });
  expect(activations[dense.firstNeuron]).toBe(0.25);
  expect(activations[dense.firstNeuron + dense.neuronCount - 1]).toBe(0.25);
  // Neighbors keep the placeholder gradient; short feeds pad with 0.
  const flatten = scene.layers[1];
  expect(activations[flatten.firstNeuron + flatten.neuronCount - 1]).toBe(1);
  const short = buildActivations(scene, { [String(dense.layerId)]: new Float32Array(1) });
  expect(short[dense.firstNeuron + 1]).toBe(0);
});

// --- renderer (structure only: the GPU half needs a real browser) --------------------

logicTest('viz3d renderer: WGSL sources are non-empty and declare both entry points', ({ expect }) => {
  for (const source of [NEURON_WGSL, EDGE_WGSL]) {
    expect(source.length).toBeGreaterThan(100);
    expect(source).toContain('@vertex');
    expect(source).toContain('@fragment');
    expect(source).toContain('fn vs_main');
    expect(source).toContain('fn fs_main');
    expect(source).toContain('var<uniform> u : Uniforms');
  }
  expect(NEURON_WGSL).toContain('var<storage, read> activations');
  // The Uniforms block is 2 mat4 + 4 f32 — exactly UNIFORM_FLOATS floats.
  expect(UNIFORM_FLOATS).toBe(36);
});

logicTest('viz3d renderer: pipeline descriptors match the scene buffer encoding', ({ expect }) => {
  const module = { label: 'fake-module' };
  const neurons = neuronPipelineDescriptor(module, 'bgra8unorm');
  expect(neurons.vertex.module).toBe(module);
  expect(neurons.vertex.entryPoint).toBe('vs_main');
  expect(neurons.fragment.entryPoint).toBe('fs_main');
  expect(neurons.vertex.buffers[0].arrayStride).toBe(NEURON_STRIDE * 4);
  expect(neurons.vertex.buffers[0].stepMode).toBe('instance');
  expect(neurons.vertex.buffers[0].attributes.map(a => a.shaderLocation)).toEqual([0, 1, 2]);
  expect(neurons.fragment.targets[0].format).toBe('bgra8unorm');
  expect(neurons.primitive.topology).toBe('triangle-list');
  expect(neurons.depthStencil.format).toBe(DEPTH_FORMAT);
  expect(neurons.depthStencil.depthWriteEnabled).toBe(false);

  const edges = edgePipelineDescriptor(module, 'rgba8unorm');
  expect(edges.vertex.buffers[0].arrayStride).toBe(EDGE_STRIDE * 4);
  expect(edges.vertex.buffers[0].stepMode).toBe('instance');
  expect(edges.vertex.buffers[0].attributes.map(a => a.offset)).toEqual([0, 12, 24]);
  expect(edges.fragment.targets[0].format).toBe('rgba8unorm');
  expect(edges.primitive.topology).toBe('line-list');
  expect(edges.depthStencil.format).toBe(DEPTH_FORMAT);

  expect(typeof webgpuAvailable()).toBe('boolean');
});

// --- inspection bridge -------------------------------------------------------

logicTest('viz3d bridge: dense summary spreads its block-mean buckets over the grid', ({ expect }) => {
  const placement = {
    layerId: 7, kind: 'grid', neuronCount: 8, firstNeuron: 0, cols: 4, rows: 2, slices: 1,
  };
  const scene = { layers: [placement], activationSlots: 8 };
  const summary = {
    kind: 'dense', units: 8, overflow: true, values: Float32Array.from([0, 2, 4, 1]),
  };
  const perLayer = inspectionToViz3D(scene, { byLayerId: { 7: { summary } } });
  // Unit i reads bucket floor(i * 4 / 8), normalized over [0, 4].
  expect(Array.from(perLayer['7'])).toEqual([0, 0, 0.5, 0.5, 1, 1, 0.25, 0.25]);
});

logicTest('viz3d bridge: conv summary upsamples each map cell onto the plane', ({ expect }) => {
  const placement = {
    layerId: 3, kind: 'planes', neuronCount: 8, firstNeuron: 0, cols: 2, rows: 2, slices: 2,
  };
  const scene = { layers: [placement], activationSlots: 8 };
  const summary = {
    kind: 'conv',
    channels: 2,
    shownChannels: 2,
    mapHeight: 1,
    mapWidth: 1,
    maps: [Float32Array.from([1]), Float32Array.from([3])],
  };
  const perLayer = inspectionToViz3D(scene, { byLayerId: { 3: { summary } } });
  // Every neuron of a slice reads its (single-cell) map, normalized over both maps.
  expect(Array.from(perLayer['3'])).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
});

logicTest('viz3d bridge: slices past the channel cap read as mid, mean fills, null passes through', ({ expect }) => {
  const capped = {
    layerId: 1, kind: 'planes', neuronCount: 2, firstNeuron: 0, cols: 1, rows: 1, slices: 2,
  };
  const meanOnly = {
    layerId: 2, kind: 'marker', neuronCount: 1, firstNeuron: 2, cols: 1, rows: 1, slices: 1,
  };
  const scene = { layers: [capped, meanOnly], activationSlots: 3 };
  const perLayer = inspectionToViz3D(scene, {
    byLayerId: {
      1: {
        summary: {
          kind: 'conv', channels: 9, shownChannels: 1, mapHeight: 1, mapWidth: 1, maps: [Float32Array.from([2])],
        },
      },
      2: { summary: { kind: 'mean', size: 10, mean: 1 } },
    },
  });
  expect(Array.from(perLayer['1'])).toEqual([0.5, 0.5]); // flat map -> mid; capped slice -> mid
  expect(Array.from(perLayer['2'])).toEqual([0.5]); // mean 1 squashes to 1/(1+1)
  // No snapshot -> undefined -> buildActivations falls back to the placeholder.
  expect(inspectionToViz3D(scene, null)).toBe(undefined);
  const activations = buildActivations(scene, inspectionToViz3D(scene, null));
  expect(activations.length).toBe(3);
});

logicTest('viz3d bridge: an Output placement reads its mirrored source activations', ({ expect }) => {
  const dense = {
    layerId: 4, kind: 'grid', neuronCount: 2, firstNeuron: 0, cols: 2, rows: 1, slices: 1,
  };
  const output = {
    layerId: 5, kind: 'grid', neuronCount: 2, firstNeuron: 2, cols: 2, rows: 1, slices: 1, mirrors: '4',
  };
  const scene = { layers: [dense, output], activationSlots: 4 };
  const snapshot = {
    byLayerId: {
      4: { summary: { kind: 'dense', units: 2, overflow: false, values: Float32Array.from([1, 3]) } },
    },
  };
  const perLayer = inspectionToViz3D(scene, snapshot);
  // No summary of its own, so the Output lights up exactly like its source.
  expect(Array.from(perLayer['5'])).toEqual([0, 1]);
  expect(Array.from(perLayer['4'])).toEqual([0, 1]);
});

logicTest('viz3d orbit: pan slides the target in the camera plane, distance-scaled', ({ expect }) => {
  // yaw 0, pitch 0: camera right = +x, camera up = +y.
  const state = createOrbitState({
    yaw: 0, pitch: 0, distance: 100, target: [0, 0, 0],
  });
  const panned = applyOrbitPan(state, 100, 50, 0.01);
  // Grab-the-world: drag right moves the target left, drag down moves it up.
  expect(panned.target[0]).toBeCloseTo(-100, 6);
  expect(panned.target[1]).toBeCloseTo(50, 6);
  expect(panned.target[2]).toBeCloseTo(0, 6);
  expect(state.target).toEqual([0, 0, 0]); // pure
  // Same drag at half the distance covers half the world-space span.
  const closer = applyOrbitPan({ ...state, distance: 50 }, 100, 0, 0.01);
  expect(closer.target[0]).toBeCloseTo(-50, 6);
  // Yaw a quarter turn: camera right becomes -z.
  const turned = applyOrbitPan({ ...state, yaw: Math.PI / 2 }, 100, 0, 0.01);
  expect(turned.target[0]).toBeCloseTo(0, 6);
  expect(turned.target[2]).toBeCloseTo(100, 6);
});

logicTest('viz3d scene: every placement carries its block center for camera targeting', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  scene.layers.forEach((placement) => {
    // The center is the bounding-box midpoint of the layer's placed neurons
    // (a partial last grid row shifts the mean, never the box).
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < placement.neuronCount; i += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = scene.neurons[(placement.firstNeuron + i) * NEURON_STRIDE + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
    for (let axis = 0; axis < 3; axis += 1) {
      expect(placement.center[axis]).toBeCloseTo((min[axis] + max[axis]) / 2, 4);
    }
  });
});

logicTest('viz3d scene: gap tiers — full for transforms, close for same shape, closest for Output', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  const zOf = index => scene.layers[index].center[2];
  // Input→Flatten, Flatten→Dense42, Dense42→Dense10 all change the shape:
  // full, equal gaps. Dense10→Output is a mirror: the same tensor shown
  // again, tightest gap of all.
  const fullGap = zOf(1) - zOf(0);
  expect(fullGap).toBeGreaterThan(0);
  expect(zOf(2) - zOf(1)).toBeCloseTo(fullGap, 6);
  expect(zOf(3) - zOf(2)).toBeCloseTo(fullGap, 6);
  expect(zOf(4) - zOf(3)).toBeCloseTo(fullGap * MIRROR_GAP, 6);

  // Same-shape but not a mirror (Dense(4) after Input[4]): the middle tier.
  const layer = (id, name, values, inputLayers, outputLayers) => ({
    class: 'D3Layer',
    id,
    htmlID: `d3-layer-${id}`,
    name,
    x: 0,
    y: 0,
    inputLayers,
    outputLayers,
    children: null,
    kerasLayer: {
      name, category: 'Core', searchTerms: [name], parameterDef: {}, parameterValues: values, customUserLayer: false,
    },
    parentID: null,
  });
  // NB: KerasGenerator only builds its treatment list for graphs that reach
  // an Output node, so the synthetic model needs one — which conveniently
  // also exercises all three tiers at once.
  const model = {
    layers: [
      layer(0, 'Input', { shape: [4] }, [], [1]),
      layer(1, 'Dense', { units: 4 }, [0], [2]),
      layer(2, 'Dense', { units: 2 }, [1], [3]),
      layer(3, 'Output', {}, [2], []),
    ],
    edges: [
      { id: 100, htmlID: 'e0', source: 0, target: 1 },
      { id: 101, htmlID: 'e1', source: 1, target: 2 },
      { id: 102, htmlID: 'e2', source: 2, target: 3 },
    ],
    inputs: [0],
    outputs: [2],
  };
  const tiered = buildScene(model);
  const zt = index => tiered.layers[index].center[2];
  const full = zt(2) - zt(1); // Dense(4)→Dense(2) transforms: full gap
  expect((zt(1) - zt(0)) / full).toBeCloseTo(SAME_SHAPE_GAP, 6); // same shape
  expect((zt(3) - zt(2)) / full).toBeCloseTo(MIRROR_GAP, 6); // Output mirror
});

logicTest('viz3d shapes: the conv template resolves exactly, end to end', ({ expect }) => {
  const scene = buildScene(templateModel('2D Conv for MNIST'));
  // Input [28,28,1] → Conv2D 3×3 valid [26,26,32] → MaxPool 2×2 [13,13,32]
  // → Dropout (shape-preserving) → Flatten [13*13*32 = 5408] → Dense 128
  // → Dropout → Dense 10 → Output (mirror).
  expect(scene.layers.map(l => [l.name, l.kind, l.totalUnits])).toEqual([
    ['Input', 'planes', 28 * 28 * 1],
    ['Conv2D', 'planes', 26 * 26 * 32],
    ['MaxPooling2D', 'planes', 13 * 13 * 32],
    ['Dropout', 'planes', 13 * 13 * 32],
    ['Flatten', 'grid', 5408],
    ['Dense', 'grid', 128],
    ['Dropout', 'grid', 128],
    ['Dense', 'grid', 10],
    ['Output', 'grid', 10],
  ]);
  // Placed neurons cap channel slices (4 of 32 filters) and the huge Flatten.
  expect(scene.layers[1].neuronCount).toBe(26 * 26 * MAX_CHANNEL_SLICES);
  expect(scene.layers[4].neuronCount).toBe(NEURON_CAP);
  expect(scene.layers[4].overflow).toBe(true);
  // Gap tiers along the chain: Pool→Dropout and Dense→Dropout compress,
  // Dense10→Output hugs, everything else keeps the full gap.
  const zOf = index => scene.layers[index].center[2];
  const fullGap = zOf(1) - zOf(0);
  expect((zOf(3) - zOf(2)) / fullGap).toBeCloseTo(SAME_SHAPE_GAP, 6);
  expect((zOf(6) - zOf(5)) / fullGap).toBeCloseTo(SAME_SHAPE_GAP, 6);
  expect((zOf(8) - zOf(7)) / fullGap).toBeCloseTo(MIRROR_GAP, 6);
  expect((zOf(2) - zOf(1)) / fullGap).toBeCloseTo(1, 6);
});

logicTest('viz3d params: channel paging and side-by-side reshape a planes layer', ({ expect }) => {
  const model = templateModel('2D Conv for MNIST');
  const plain = buildScene(model);
  const conv = plain.layers[1];
  expect([conv.channelOffset, conv.sideBySide]).toEqual([0, false]);
  // Page to channels 8..11 and lay the 4 slices side by side.
  const paged = buildScene(model, {
    perLayer: { [String(conv.layerId)]: { channelOffset: 8, sideBySide: true } },
  });
  const pagedConv = paged.layers[1];
  expect(pagedConv.channelOffset).toBe(8);
  expect(pagedConv.sideBySide).toBe(true);
  expect(pagedConv.slices).toBe(conv.slices);
  // Side by side: all slices share one z, spread over distinct x ranges.
  const zs = new Set();
  const xs = new Set();
  for (let i = 0; i < pagedConv.neuronCount; i += 1) {
    zs.add(paged.neurons[(pagedConv.firstNeuron + i) * NEURON_STRIDE + 2]);
    xs.add(paged.neurons[(pagedConv.firstNeuron + i) * NEURON_STRIDE]);
  }
  expect(zs.size).toBe(1);
  expect(xs.size).toBe(26 * pagedConv.slices); // 26 columns per slice, no overlap
  // Offsets clamp to the channel count; slices override respects the cap.
  const clamped = buildScene(model, {
    perLayer: { [String(conv.layerId)]: { channelOffset: 999, slices: 999 } },
  });
  expect(clamped.layers[1].slices).toBe(8); // MAX_SLICES_OVERRIDE
  expect(clamped.layers[1].channelOffset).toBe(32 - 8);
});

logicTest('viz3d bridge: conv slices align their channel window with the summary', ({ expect }) => {
  const placement = {
    layerId: 3, kind: 'planes', neuronCount: 2, firstNeuron: 0, cols: 1, rows: 1, slices: 2, channelOffset: 8, sideBySide: false,
  };
  const scene = { layers: [placement], activationSlots: 2 };
  const summary = {
    kind: 'conv',
    channels: 32,
    channelOffset: 8,
    shownChannels: 2,
    mapHeight: 1,
    mapWidth: 1,
    maps: [Float32Array.from([1]), Float32Array.from([3])],
  };
  // Placement shows channels 8 and 9; the summary covers exactly those.
  const perLayer = inspectionToViz3D(scene, { byLayerId: { 3: { summary } } });
  expect(Array.from(perLayer['3'])).toEqual([0, 1]);
  // A misaligned summary (still on channels 0..1) gives no data: mid gray.
  const stale = { ...summary, channelOffset: 0 };
  const misaligned = inspectionToViz3D(scene, { byLayerId: { 3: { summary: stale } } });
  expect(Array.from(misaligned['3'])).toEqual([0.5, 0.5]);
});

logicTest('viz3d picking: a ray through a layer selects it, empty space selects none', ({ expect }) => {
  const scene = buildScene(templateModel('2D Dense for MNIST'));
  const input = scene.layers[0];
  const output = scene.layers[4];
  // Camera BEHIND the input (yaw π puts the eye at z < 0, layers stack in
  // +z): the nearest box along a center ray is the input.
  const orbit = createOrbitState({
    yaw: Math.PI, pitch: 0, distance: 200, target: input.center,
  });
  expect(pickLayer(scene, orbit, 0, 0, 1, Math.PI / 4).layerId).toBe(input.layerId);
  // Aim at the output instead: nearest hit along that ray is the output.
  const atOutput = createOrbitState({
    yaw: 0, pitch: 0, distance: 50, target: output.center,
  });
  expect(pickLayer(scene, atOutput, 0, 0, 1, Math.PI / 4).layerId).toBe(output.layerId);
  // A ray far off to the side hits nothing.
  expect(pickLayer(scene, orbit, 0.99, 0.99, 1, Math.PI / 4)).toBe(null);
});
