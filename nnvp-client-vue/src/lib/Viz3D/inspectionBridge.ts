// Bridge from Inspect mode to the 3D view: resample the bounded per-layer
// summaries the Inspector publishes on the facade (lib/Inspector — dense
// values capped at 64 + overflow mean, conv maps ≤8 channels of ≤16×16,
// otherwise a single mean) onto the exact neuron grid the 3D scene placed
// (lib/Viz3D/sceneBuild — up to 4096 neurons per layer, slice-major). Pure,
// bun-tested; the resulting {layerId → Float32Array} feeds buildActivations.

import type { LayerPlacement, Scene3D } from './sceneBuild';

interface DenseSummary {
  kind: 'dense';
  units: number;
  overflow: boolean;
  values: ArrayLike<number>;
}

interface ConvSummary {
  kind: 'conv';
  channels: number;
  /** First channel the maps cover (channel paging; may be absent = 0). */
  channelOffset?: number;
  shownChannels: number;
  mapHeight: number;
  mapWidth: number;
  maps: Array<ArrayLike<number>>;
}

interface MeanSummary {
  kind: 'mean';
  size: number;
  mean: number;
}

export type ActivationSummary = DenseSummary | ConvSummary | MeanSummary;

/**
 * What InspectPanel publishes through boardInterface.setInspection: per layer
 * id, the probe result { shape, summary, pixels } (see Inspector/probe.js) —
 * the bridge only consumes the summary.
 */
export interface InspectionSnapshot {
  byLayerId: Record<string, { summary: ActivationSummary }>;
}

// Same convention as activationSummary.normalize: a flat range reads as
// mid-intensity (uniformly active is not dead), matching the 2D overlays.
function normalized(value: number, min: number, max: number): number {
  return max === min ? 0.5 : (value - min) / (max - min);
}

function rangeOf(arrays: Array<ArrayLike<number>>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  arrays.forEach((values) => {
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i]!;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  });
  return [min, max];
}

function denseToNeurons(placement: LayerPlacement, summary: DenseSummary): Float32Array {
  const out = new Float32Array(placement.neuronCount);
  const values = summary.values;
  const [min, max] = rangeOf([values]);
  for (let i = 0; i < placement.neuronCount; i += 1) {
    // Under the cap the buckets are the units themselves; over it, unit i
    // reads its block-mean bucket (see activationSummary) — structure kept.
    const bucket = summary.overflow ? Math.floor((i * values.length) / summary.units) : i;
    out[i] = normalized(values[bucket]!, min, max);
  }
  return out;
}

function convToNeurons(placement: LayerPlacement, summary: ConvSummary): Float32Array {
  const out = new Float32Array(placement.neuronCount);
  const [min, max] = rangeOf(summary.maps);
  const perSlice = placement.cols * placement.rows;
  for (let i = 0; i < placement.neuronCount; i += 1) {
    const slice = Math.floor(i / perSlice);
    // Align the placement's channel window with the summary's: slice s shows
    // absolute channel placement.channelOffset + s.
    const map = summary.maps[(placement.channelOffset ?? 0) + slice - (summary.channelOffset ?? 0)];
    if (!map) {
      // A slice past the summary's channel cap: no data, read as mid.
      out[i] = 0.5;
      continue; // eslint-disable-line no-continue
    }
    const inSlice = i % perSlice;
    const row = Math.floor(inSlice / placement.cols);
    const col = inSlice % placement.cols;
    const mapRow = Math.floor((row * summary.mapHeight) / placement.rows);
    const mapCol = Math.floor((col * summary.mapWidth) / placement.cols);
    out[i] = normalized(map[mapRow * summary.mapWidth + mapCol]!, min, max);
  }
  return out;
}

function meanToNeurons(placement: LayerPlacement, summary: MeanSummary): Float32Array {
  // Same squash as activationToPixels: negative means read as inactive.
  const intensity = summary.mean <= 0 ? 0 : summary.mean / (1 + summary.mean);
  return new Float32Array(placement.neuronCount).fill(intensity);
}

/**
 * Per-neuron 0..1 activations for every scene layer the snapshot covers, in
 * the {layerId → Float32Array} format buildActivations consumes. Returns
 * undefined when there is no inspection (→ placeholder gradient).
 */
export function inspectionToViz3D(
  scene: Scene3D,
  snapshot: InspectionSnapshot | null | undefined,
): Record<string, Float32Array> | undefined {
  if (!snapshot || !snapshot.byLayerId) return undefined;
  const out: Record<string, Float32Array> = {};
  for (const placement of scene.layers) {
    // Output nodes carry no activations of their own — read their source's.
    const entry = snapshot.byLayerId[String(placement.layerId)]
      ?? (placement.mirrors !== undefined ? snapshot.byLayerId[placement.mirrors] : undefined);
    const summary = entry?.summary;
    if (!summary) continue; // eslint-disable-line no-continue
    if (summary.kind === 'dense') out[String(placement.layerId)] = denseToNeurons(placement, summary);
    else if (summary.kind === 'conv') out[String(placement.layerId)] = convToNeurons(placement, summary);
    else out[String(placement.layerId)] = meanToNeurons(placement, summary);
  }
  return out;
}
