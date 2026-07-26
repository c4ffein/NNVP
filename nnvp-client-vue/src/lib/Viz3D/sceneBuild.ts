// NnvpModel → GPU-ready scene buffers for the experimental 3D view. Pure and
// deterministic: same model in, byte-identical Float32Arrays out. No DOM, no
// WebGPU — fully testable under bun. renderer.ts consumes the output as-is.
//
// Encoding (float32, tightly packed):
//   neurons: [x, y, z, size, layerIndex] per instance  (NEURON_STRIDE = 5)
//   edges:   [ax, ay, az, bx, by, bz, weightSlot]      (EDGE_STRIDE = 7)
// layerIndex points into Scene3D.layers; weightSlot is the global segment
// index, reserved for a future per-connection weight buffer.

import type { NnvpLayer, NnvpLayerId, NnvpModel } from '../../types/model';
import KerasGenerator from '../KerasInterface/KerasGenerator';
import walkShapes from './shapeWalk';
import type { OrbitState } from './math';
import { orbitEye } from './math';

export const NEURON_STRIDE = 5;
export const EDGE_STRIDE = 7;

/** Max neurons actually placed per layer; the rest is reported, not drawn. */
export const NEURON_CAP = 4096;
/** Input [h,w,c]: only the first channel-slices are stacked along z. */
export const MAX_CHANNEL_SLICES = 4;
/** Max sampled segments per connected layer pair (dense n×m is quadratic). */
export const EDGE_SEGMENT_CAP = 2000;

const NEURON_SPACING = 1;
const NEURON_SIZE = 0.35;
const MARKER_SIZE = 2;
const SLICE_GAP = 1.5;
const ROW_GAP_X = 6;
/** Depth-gap factor across shape-preserving links (Dropout, BatchNorm…). */
export const SAME_SHAPE_GAP = 0.4;
/** Tighter still for Output mirrors: the same tensor shown again, not a step. */
export const MIRROR_GAP = 0.2;

export type LayerKind = 'grid' | 'planes' | 'marker';

export interface LayerPlacement {
  layerId: NnvpLayerId;
  name: string;
  /** Longest-path topological depth (z = depth * layerGap). */
  depth: number;
  kind: LayerKind;
  /** Neurons actually placed (≤ NEURON_CAP). */
  neuronCount: number;
  /** Neurons the layer really has (units / h*w*c); 1 for markers. */
  totalUnits: number;
  /** True when totalUnits > neuronCount (capped, never silent). */
  overflow: boolean;
  /** Index of this layer's first instance in the neuron buffer. */
  firstNeuron: number;
  /** Neuron grid the layer was placed on (slice-major, then row-major). */
  cols: number;
  rows: number;
  slices: number;
  /**
   * Set on Output nodes: id of the layer feeding them. Outputs are pure sinks
   * with no shape of their own, so they display their source's geometry and
   * (in the inspection bridge) its activations.
   */
  mirrors?: string;
  /** First displayed channel (planes layers paging through channels). */
  channelOffset: number;
  /** Channel slices laid side by side along x instead of stacked in z. */
  sideBySide: boolean;
  /** World-space center of the layer's neuron block (camera targeting). */
  center: [number, number, number];
}

export interface EdgePairStats {
  sourceId: NnvpLayerId;
  targetId: NnvpLayerId;
  /** Full dense connection count between the PLACED neurons. */
  total: number;
  sampled: number;
  omitted: number;
}

export interface SceneStats {
  neuronCount: number;
  /** Neurons dropped by NEURON_CAP, summed over layers. */
  omittedNeurons: number;
  edgeSegmentCount: number;
  /** Connections dropped by EDGE_SEGMENT_CAP, summed over pairs. */
  omittedEdges: number;
  pairs: EdgePairStats[];
}

export interface Scene3D {
  neurons: Float32Array;
  edges: Float32Array;
  neuronCount: number;
  edgeCount: number;
  layers: LayerPlacement[];
  stats: SceneStats;
  /** Length of the per-neuron f32 activation array renderer.ts expects. */
  activationSlots: number;
  bounds: { center: [number, number, number]; radius: number };
}

// --- graph shape -----------------------------------------------------------------

/** Composites are unwrapped: only concrete layers get geometry. */
function flattenLayers(layers: NnvpLayer[], out: NnvpLayer[] = []): NnvpLayer[] {
  for (const layer of layers) {
    if (layer.class === 'Group') flattenLayers(layer.children || [], out);
    else out.push(layer);
  }
  return out;
}

/**
 * Directed adjacency between concrete layers, deduplicated, from BOTH
 * model.edges and the per-layer inputLayers/outputLayers (legacy files may
 * populate either). Edges touching a composite id are dropped — the
 * composite's children carry the real connections.
 */
function buildAdjacency(model: NnvpModel, layers: NnvpLayer[]): Map<string, string[]> {
  const known = new Set(layers.map(layer => String(layer.id)));
  const seen = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const add = (source: NnvpLayerId, target: NnvpLayerId) => {
    const a = String(source);
    const b = String(target);
    if (!known.has(a) || !known.has(b) || a === b) return;
    const key = `${a}->${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)?.push(b);
  };
  for (const edge of model.edges || []) add(edge.source, edge.target);
  for (const layer of layers) {
    for (const target of layer.outputLayers || []) add(layer.id, target);
    for (const source of layer.inputLayers || []) add(source, layer.id);
  }
  return adjacency;
}

/**
 * Longest-path layering, cycle-safe: Kahn's algorithm assigns
 * depth = max(preds) + 1; nodes trapped in a cycle (never dequeued) fall back
 * to max over their already-layered predecessors, in declaration order —
 * deterministic and total on any legacy file.
 */
function computeDepths(layers: NnvpLayer[], adjacency: Map<string, string[]>): Map<string, number> {
  const ids = layers.map(layer => String(layer.id));
  const indegree = new Map<string, number>(ids.map(id => [id, 0]));
  for (const targets of adjacency.values()) {
    for (const target of targets) indegree.set(target, (indegree.get(target) || 0) + 1);
  }
  const depths = new Map<string, number>();
  const queue = ids.filter(id => (indegree.get(id) || 0) === 0);
  for (const id of queue) depths.set(id, 0);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    if (id === undefined) break;
    const depth = depths.get(id) || 0;
    for (const target of adjacency.get(id) || []) {
      depths.set(target, Math.max(depths.get(target) || 0, depth + 1));
      const remaining = (indegree.get(target) || 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  // Cycle leftovers: depth from whichever predecessors already got one.
  const predecessors = new Map<string, string[]>();
  for (const [source, targets] of adjacency) {
    for (const target of targets) {
      if (!predecessors.has(target)) predecessors.set(target, []);
      predecessors.get(target)?.push(source);
    }
  }
  for (const id of ids) {
    if (depths.has(id)) continue;
    let depth = 0;
    for (const pred of predecessors.get(id) || []) {
      const predDepth = depths.get(pred);
      if (predDepth !== undefined) depth = Math.max(depth, predDepth + 1);
    }
    depths.set(id, depth);
  }
  return depths;
}

// --- per-layer geometry ---------------------------------------------------------

interface LayerGeometry {
  kind: LayerKind;
  /** Grid shape of one slice; markers are 1×1. */
  cols: number;
  rows: number;
  slices: number;
  /** Neurons to place (already capped). */
  count: number;
  totalUnits: number;
  /** First displayed channel (planes paging through their channels). */
  channelOffset?: number;
  /** Slices along x instead of stacked in z. */
  sideBySide?: boolean;
}

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

/** 1-D layers (Flatten and friends) wrap into a ribbon this many wide — a
 * true 784-long line would dwarf every plane; a Dense-like square would hide
 * that it IS a vector. */
const RIBBON_COLS = 64;

/** Per-layer display overrides, set from the 3D window's layer panel. */
export interface LayerVizParams {
  /** First channel to display (planes layers page through their channels). */
  channelOffset?: number;
  /** How many channel slices to show (1..MAX_SLICES_OVERRIDE). */
  slices?: number;
  /** Lay the channel slices side by side along x instead of stacked in z. */
  sideBySide?: boolean;
}

export interface SceneOptions {
  perLayer?: Record<string, LayerVizParams>;
}

/** Hard ceiling for a slices override (matches the Inspector's CHANNEL_CAP). */
export const MAX_SLICES_OVERRIDE = 8;

function squareGrid(units: number): LayerGeometry {
  const count = Math.min(units, NEURON_CAP);
  const cols = Math.ceil(Math.sqrt(count));
  return {
    kind: 'grid', cols, rows: Math.ceil(count / cols), slices: 1, count, totalUnits: units,
  };
}

function planesFromDims(dims: number[], params?: LayerVizParams): LayerGeometry {
  const rows = dims[0] ?? 1;
  const cols = dims[1] ?? 1;
  const channels = dims.length >= 3 ? dims.slice(2).reduce((a, b) => a * b, 1) : 1;
  const requested = params?.slices ?? MAX_CHANNEL_SLICES;
  const slices = Math.max(1, Math.min(requested, MAX_SLICES_OVERRIDE, channels));
  const channelOffset = Math.max(0, Math.min(params?.channelOffset ?? 0, channels - slices));
  const count = Math.min(rows * cols * slices, NEURON_CAP);
  return {
    kind: 'planes',
    cols,
    rows,
    slices,
    count,
    totalUnits: rows * cols * channels,
    channelOffset,
    sideBySide: params?.sideBySide === true && slices > 1,
  };
}

/**
 * Infers displayable geometry: from the kerasLayer definition where the model
 * stores it (Input knows its shape, Dense its units), else from the codegen
 * dim inference (KerasGeneratorDimInference) when it derived a FULL shape —
 * that is how Flatten gets its true length. Anything still unknown (Conv and
 * friends: spatial dims are deliberately not guessed) is a marker cube.
 */
function layerGeometry(
  layer: NnvpLayer, inferredShape?: number[], params?: LayerVizParams,
): LayerGeometry {
  const marker: LayerGeometry = {
    kind: 'marker', cols: 1, rows: 1, slices: 1, count: 1, totalUnits: 1,
  };
  const keras = layer.kerasLayer;
  if (!keras) return marker;
  const values = keras.parameterValues || {};
  if (keras.name === 'Dense') {
    const units = asPositiveInt(values.units);
    return units === null ? marker : squareGrid(units);
  }
  if (keras.name === 'Input') {
    const shape = Array.isArray(values.shape) ? values.shape.map(asPositiveInt) : null;
    if (!shape || shape.length === 0 || shape.some(dim => dim === null)) return marker;
    const dims = shape as number[];
    if (dims.length === 1) return squareGrid(dims[0] ?? 1);
    return planesFromDims(dims, params);
  }
  // Output nodes mirror their source instead (see buildScene).
  if (keras.name !== 'Output' && inferredShape && inferredShape.length > 0
      && inferredShape.every(dim => Number.isFinite(dim) && dim >= 1)) {
    if (inferredShape.length === 1) {
      const units = inferredShape[0]!;
      const count = Math.min(units, NEURON_CAP);
      const cols = Math.min(count, RIBBON_COLS);
      return {
        kind: 'grid', cols, rows: Math.ceil(count / cols), slices: 1, count, totalUnits: units,
      };
    }
    return planesFromDims(inferredShape, params);
  }
  return marker;
}

/**
 * Full output shapes from the view's own shape walk (lib/Viz3D/shapeWalk —
 * exact conv/pooling arithmetic included, unlike the codegen inference). The
 * generator can throw on degenerate graphs — the 3D view then simply falls
 * back to markers, never breaks.
 */
function inferredShapes(model: NnvpModel): Map<string, number[]> {
  const shapes = new Map<string, number[]>();
  try {
    const generator = new KerasGenerator(JSON.parse(JSON.stringify(model)), true);
    Object.entries(walkShapes(generator.graph, generator.list)).forEach(([id, shape]) => {
      if (shape) shapes.set(String(id), shape);
    });
  } catch {
    // No inference — layers without their own stored shape become markers.
  }
  return shapes;
}

// --- edge sampling ----------------------------------------------------------------

/**
 * Deterministic pseudo-random spread (Knuth multiplicative hash) used to pick
 * target neurons when a pair overflows EDGE_SEGMENT_CAP. A plain stride would
 * alias (every source hitting the SAME few targets when the stride divides
 * the target count); hashing keeps per-neuron fan-in plausible.
 */
function spread(index: number, modulo: number): number {
  return (Math.imul(index, 2654435761) >>> 0) % modulo;
}

// --- scene assembly ----------------------------------------------------------------

export function buildScene(model: NnvpModel, options?: SceneOptions): Scene3D {
  const concreteLayers = flattenLayers(model.layers || []);
  const adjacency = buildAdjacency(model, concreteLayers);
  const depths = computeDepths(concreteLayers, adjacency);
  const shapes = inferredShapes(model);
  const geometries = concreteLayers.map(
    layer => layerGeometry(
      layer, shapes.get(String(layer.id)), options?.perLayer?.[String(layer.id)],
    ),
  );

  // Output nodes are sinks with no shape of their own: show the geometry of
  // the layer feeding them (a 10-way softmax reads as 10 neurons, not one
  // marker cube), and remember the source for the inspection bridge.
  const mirrorSourceByIndex = new Map<number, string>();
  concreteLayers.forEach((layer, index) => {
    if (layer.kerasLayer?.name !== 'Output') return;
    const id = String(layer.id);
    const sourceIndex = concreteLayers.findIndex(
      candidate => (adjacency.get(String(candidate.id)) || []).includes(id),
    );
    const sourceGeometry = sourceIndex === -1 ? undefined : geometries[sourceIndex];
    if (!sourceGeometry || sourceGeometry.kind === 'marker') return;
    geometries[index] = { ...sourceGeometry };
    mirrorSourceByIndex.set(index, String(concreteLayers[sourceIndex]!.id));
  });

  // Effective x footprint of a layer block (side-by-side slices widen it).
  const planeWidth = (geometry: LayerGeometry): number => {
    const base = (geometry.cols - 1) * NEURON_SPACING;
    return geometry.sideBySide
      ? geometry.slices * base + (geometry.slices - 1) * ROW_GAP_X
      : base;
  };

  // Layer gap scales with the largest plane so big inputs don't overlap.
  let maxExtent = 1;
  for (const geometry of geometries) {
    maxExtent = Math.max(
      maxExtent,
      planeWidth(geometry),
      (geometry.rows - 1) * NEURON_SPACING,
    );
  }
  const layerGap = Math.max(12, maxExtent * 0.8);

  // Layers sharing a depth sit side by side along x, row centered on 0.
  const byDepth = new Map<number, number[]>();
  concreteLayers.forEach((layer, index) => {
    const depth = depths.get(String(layer.id)) || 0;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)?.push(index);
  });

  // Semantic z-gaps, three tiers: an Output mirror is the same tensor shown
  // again (tightest); a shape-preserving link (Dropout/BatchNorm/Activation)
  // pulls close; a transforming link (Flatten, Dense resize, Conv) keeps the
  // full gap. A boundary compresses only when EVERY consecutive-depth link
  // across it qualifies; unknown shapes stay at the full gap (honest default
  // — Conv chains never pretend).
  const maxDepth = Math.max(0, ...byDepth.keys());
  const shapeKey = (id: string): string | null => {
    const shape = shapes.get(id);
    return shape ? JSON.stringify(shape) : null;
  };
  const mirrorOf = new Map<string, string>(); // target id -> mirrored source id
  mirrorSourceByIndex.forEach((sourceId, index) => {
    mirrorOf.set(String(concreteLayers[index]!.id), sourceId);
  });
  const boundaries: Array<{ allSame: boolean; allMirror: boolean } | undefined> = Array.from({ length: maxDepth }, () => undefined);
  for (const layer of concreteLayers) {
    const sourceId = String(layer.id);
    const sourceDepth = depths.get(sourceId) || 0;
    for (const targetId of adjacency.get(sourceId) || []) {
      if ((depths.get(targetId) || 0) !== sourceDepth + 1) continue; // eslint-disable-line no-continue
      const sourceShape = shapeKey(sourceId);
      const state = boundaries[sourceDepth] ?? { allSame: true, allMirror: true };
      state.allSame = state.allSame && sourceShape !== null && sourceShape === shapeKey(targetId);
      state.allMirror = state.allMirror && mirrorOf.get(targetId) === sourceId;
      boundaries[sourceDepth] = state;
    }
  }
  const zByDepth = [0];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const state = boundaries[depth];
    let factor = 1;
    if (state?.allMirror) factor = MIRROR_GAP;
    else if (state?.allSame) factor = SAME_SHAPE_GAP;
    zByDepth.push(zByDepth[depth]! + layerGap * factor);
  }
  const centerX = Array.from({ length: concreteLayers.length }, () => 0);
  for (const indices of byDepth.values()) {
    const widths = indices.map(
      index => (geometries[index] ? planeWidth(geometries[index]!) : 0),
    );
    const rowWidth = widths.reduce((a, b) => a + b, 0) + ROW_GAP_X * (indices.length - 1);
    let cursor = -rowWidth / 2;
    indices.forEach((layerIndex, i) => {
      const width = widths[i] ?? 0;
      centerX[layerIndex] = cursor + width / 2;
      cursor += width + ROW_GAP_X;
    });
  }

  // Neuron instances.
  const placements: LayerPlacement[] = [];
  const totalNeurons = geometries.reduce((sum, geometry) => sum + geometry.count, 0);
  const neurons = new Float32Array(totalNeurons * NEURON_STRIDE);
  let omittedNeurons = 0;
  let neuronCursor = 0;
  concreteLayers.forEach((layer, layerIndex) => {
    const geometry = geometries[layerIndex];
    if (!geometry) return;
    const depth = depths.get(String(layer.id)) || 0;
    const z = zByDepth[depth] ?? 0;
    const x0 = centerX[layerIndex] ?? 0;
    placements.push({
      layerId: layer.id,
      name: layer.name,
      depth,
      kind: geometry.kind,
      neuronCount: geometry.count,
      totalUnits: geometry.totalUnits,
      overflow: geometry.totalUnits > geometry.count,
      firstNeuron: neuronCursor,
      cols: geometry.cols,
      rows: geometry.rows,
      slices: geometry.slices,
      mirrors: mirrorSourceByIndex.get(layerIndex),
      channelOffset: geometry.channelOffset ?? 0,
      sideBySide: geometry.sideBySide === true,
      // Rows and slices are centered on 0 and z respectively (see the
      // placement loop below), so the block's center is simply (x0, 0, z).
      center: [x0, 0, z],
    });
    omittedNeurons += geometry.totalUnits - geometry.count;
    const perSlice = geometry.cols * geometry.rows;
    for (let i = 0; i < geometry.count; i += 1) {
      const slice = Math.floor(i / perSlice);
      const inSlice = i % perSlice;
      const row = Math.floor(inSlice / geometry.cols);
      const col = inSlice % geometry.cols;
      const base = neuronCursor * NEURON_STRIDE;
      const sliceShift = slice - (geometry.slices - 1) / 2;
      const sliceStep = (geometry.cols - 1) * NEURON_SPACING + ROW_GAP_X;
      neurons[base] = x0 + (col - (geometry.cols - 1) / 2) * NEURON_SPACING
        + (geometry.sideBySide ? sliceShift * sliceStep : 0);
      neurons[base + 1] = ((geometry.rows - 1) / 2 - row) * NEURON_SPACING;
      neurons[base + 2] = z + (geometry.sideBySide ? 0 : sliceShift * SLICE_GAP);
      neurons[base + 3] = geometry.kind === 'marker' ? MARKER_SIZE : NEURON_SIZE;
      neurons[base + 4] = placements.length - 1;
      neuronCursor += 1;
    }
  });
  const placementByLayerId = new Map(placements.map(p => [String(p.layerId), p]));

  // Edge segments: dense n×m per connected pair, capped and reported.
  const pairs: EdgePairStats[] = [];
  const segments: number[] = [];
  let omittedEdges = 0;
  let weightSlot = 0;
  const neuronAt = (index: number): [number, number, number] => [
    neurons[index * NEURON_STRIDE] ?? 0,
    neurons[index * NEURON_STRIDE + 1] ?? 0,
    neurons[index * NEURON_STRIDE + 2] ?? 0,
  ];
  for (const layer of concreteLayers) {
    const source = placementByLayerId.get(String(layer.id));
    if (!source) continue;
    for (const targetId of adjacency.get(String(layer.id)) || []) {
      const target = placementByLayerId.get(targetId);
      if (!target) continue;
      // A mirroring Output is a pass-through of its source, not a dense
      // connection: draw neuron-to-neuron parallels, not an n×m mesh.
      const mirrored = target.mirrors === String(source.layerId);
      const total = mirrored
        ? Math.min(source.neuronCount, target.neuronCount)
        : source.neuronCount * target.neuronCount;
      let sampled = 0;
      const pushSegment = (sourceNeuron: number, targetNeuron: number) => {
        segments.push(
          ...neuronAt(source.firstNeuron + sourceNeuron),
          ...neuronAt(target.firstNeuron + targetNeuron),
          weightSlot,
        );
        weightSlot += 1;
        sampled += 1;
      };
      if (mirrored) {
        for (let i = 0; i < Math.min(total, EDGE_SEGMENT_CAP); i += 1) pushSegment(i, i);
      } else if (total <= EDGE_SEGMENT_CAP) {
        for (let a = 0; a < source.neuronCount; a += 1) {
          for (let b = 0; b < target.neuronCount; b += 1) pushSegment(a, b);
        }
      } else {
        // Stratified: every placed source neuron is covered (or an even
        // subsample of them), each with a hashed fan-out of targets.
        const sourceSamples = Math.min(source.neuronCount, EDGE_SEGMENT_CAP);
        const fanOut = Math.max(1, Math.floor(EDGE_SEGMENT_CAP / sourceSamples));
        for (let s = 0; s < sourceSamples; s += 1) {
          const a = Math.floor((s * source.neuronCount) / sourceSamples);
          for (let f = 0; f < fanOut; f += 1) {
            pushSegment(a, spread(s * fanOut + f, target.neuronCount));
          }
        }
      }
      omittedEdges += total - sampled;
      pairs.push({
        sourceId: source.layerId, targetId: target.layerId, total, sampled, omitted: total - sampled,
      });
    }
  }

  // Bounds for the initial camera: enclose every placed neuron.
  const center: [number, number, number] = [0, 0, 0];
  let radius = 1;
  if (totalNeurons > 0) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < totalNeurons; i += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = neurons[i * NEURON_STRIDE + axis] ?? 0;
        min[axis] = Math.min(min[axis] ?? Infinity, value);
        max[axis] = Math.max(max[axis] ?? -Infinity, value);
      }
    }
    for (let axis = 0; axis < 3; axis += 1) {
      center[axis] = ((min[axis] ?? 0) + (max[axis] ?? 0)) / 2;
      radius = Math.max(radius, ((max[axis] ?? 0) - (min[axis] ?? 0)) / 2);
    }
  }

  return {
    neurons,
    edges: new Float32Array(segments),
    neuronCount: totalNeurons,
    edgeCount: segments.length / EDGE_STRIDE,
    layers: placements,
    stats: {
      neuronCount: totalNeurons,
      omittedNeurons,
      edgeSegmentCount: segments.length / EDGE_STRIDE,
      omittedEdges,
      pairs,
    },
    activationSlots: totalNeurons,
    bounds: { center, radius },
  };
}

// --- activations --------------------------------------------------------------------

/**
 * Per-neuron f32 activations in scene order, sized activationSlots. The input
 * format is deliberately dumb — {layerId → Float32Array} in neuron-placement
 * order — so a future inspector can feed real values. Layers with no entry
 * get the deterministic placeholder gradient the demo renders.
 */
export function buildActivations(
  scene: Scene3D, perLayer?: Record<string, Float32Array>,
): Float32Array {
  const out = new Float32Array(scene.activationSlots);
  for (const placement of scene.layers) {
    const provided = perLayer?.[String(placement.layerId)];
    for (let i = 0; i < placement.neuronCount; i += 1) {
      out[placement.firstNeuron + i] = provided
        ? (provided[i] ?? 0)
        : (placement.neuronCount > 1 ? i / (placement.neuronCount - 1) : 1);
    }
  }
  return out;
}

// --- picking --------------------------------------------------------------------

/**
 * Layer under a click: cast a ray from the orbit camera through normalized
 * device coordinates (ndcX/ndcY in -1..1, y UP) and slab-test each layer's
 * bounding box. Returns the nearest hit placement, or null. Pure — the same
 * fov/aspect the renderer uses must be passed in.
 */
export function pickLayer(
  scene: Scene3D, orbit: OrbitState, ndcX: number, ndcY: number, aspect: number, fovY: number,
): LayerPlacement | null {
  const eye = orbitEye(orbit);
  const fwd = [
    orbit.target[0] - eye[0], orbit.target[1] - eye[1], orbit.target[2] - eye[2],
  ];
  const norm = (v: number[]): number[] => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return [v[0]! / l, v[1]! / l, v[2]! / l];
  };
  const f = norm(fwd);
  const right = norm([f[2]!, 0, -f[0]!]); // cross(f, worldUp) for y-up
  const up = [
    right[1]! * f[2]! - right[2]! * f[1]!,
    right[2]! * f[0]! - right[0]! * f[2]!,
    right[0]! * f[1]! - right[1]! * f[0]!,
  ];
  const tan = Math.tan(fovY / 2);
  const dir = norm([
    f[0]! + right[0]! * ndcX * tan * aspect + up[0]! * ndcY * tan,
    f[1]! + right[1]! * ndcX * tan * aspect + up[1]! * ndcY * tan,
    f[2]! + right[2]! * ndcX * tan * aspect + up[2]! * ndcY * tan,
  ]);
  const PAD = 1;
  let best: LayerPlacement | null = null;
  let bestT = Infinity;
  for (const placement of scene.layers) {
    const planeHalf = ((placement.cols - 1) * NEURON_SPACING) / 2;
    const half = [
      (placement.sideBySide
        ? ((placement.slices - 1) / 2) * ((placement.cols - 1) * NEURON_SPACING + ROW_GAP_X)
          + planeHalf
        : planeHalf) + PAD,
      ((placement.rows - 1) * NEURON_SPACING) / 2 + PAD,
      (placement.sideBySide ? 0 : ((placement.slices - 1) * SLICE_GAP) / 2) + PAD,
    ];
    let tMin = 0;
    let tMax = Infinity;
    let hit = true;
    for (let axis = 0; axis < 3; axis += 1) {
      const origin = eye[axis]!;
      const d = dir[axis]!;
      const lo = placement.center[axis]! - half[axis]!;
      const hi = placement.center[axis]! + half[axis]!;
      if (Math.abs(d) < 1e-9) {
        if (origin < lo || origin > hi) { hit = false; break; }
      } else {
        const t1 = (lo - origin) / d;
        const t2 = (hi - origin) / d;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
        if (tMin > tMax) { hit = false; break; }
      }
    }
    if (hit && tMin < bestT) {
      bestT = tMin;
      best = placement;
    }
  }
  return best;
}
