// Inspect mode, pure core: turn one layer's raw activations (a flat
// Float32Array + its shape, batch dimension already dropped) into a small,
// bounded summary, and that summary into normalized 0..1 pixel data a canvas
// overlay can draw. No tfjs here — everything is plain arrays, fully
// unit-testable under bun (see tests/suites/inspector.js).

// Caps keep the per-node payload tiny whatever the layer size:
export const DENSE_CAP = 64; // max units shown; one extra cell holds the mean of the rest
export const CHANNEL_CAP = 8; // max conv feature maps shown
// Max feature-map side after block-mean downsampling. 32 keeps the payload
// tiny but leaves MNIST-sized inputs (28×28) pixel-exact, so inspecting shows
// the actual digit on the Input layer.
export const MAP_CAP = 32;

// Block-mean downsample one channel of a [height, width, channels]
// channels-last activation map to [outHeight, outWidth].
function downsampleChannel(data, height, width, channels, channel, outHeight, outWidth) {
  const out = new Float32Array(outHeight * outWidth);
  for (let oy = 0; oy < outHeight; oy += 1) {
    const y0 = Math.floor((oy * height) / outHeight);
    const y1 = Math.floor(((oy + 1) * height) / outHeight);
    for (let ox = 0; ox < outWidth; ox += 1) {
      const x0 = Math.floor((ox * width) / outWidth);
      const x1 = Math.floor(((ox + 1) * width) / outWidth);
      let sum = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          sum += data[(y * width + x) * channels + channel];
        }
      }
      out[oy * outWidth + ox] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/**
 * Summarize one layer's activations.
 * @param {Float32Array|number[]} data flat activation values
 * @param {number[]} shape tensor shape WITHOUT the batch dimension
 * @param {{channelOffset?: number}} [opts] first conv channel to summarize
 *   (the 3D layer panel pages through channels; default 0)
 * @returns dense: { kind:'dense', units, overflow, values }
 *          conv: { kind:'conv', channels, channelOffset, shownChannels, mapHeight, mapWidth, maps }
 *          anything else: { kind:'mean', size, mean }
 */
export function summarizeActivation(data, shape, opts) {
  if (shape.length === 1) {
    const units = shape[0];
    const overflow = units > DENSE_CAP;
    if (!overflow) {
      const values = new Float32Array(units);
      for (let i = 0; i < units; i += 1) values[i] = data[i];
      return { kind: 'dense', units, overflow, values };
    }
    // Over the cap: block-mean the WHOLE vector into DENSE_CAP buckets, so
    // the summary keeps the vector's structure (a flattened image stays an
    // image, blurred) instead of showing the first 64 units and averaging
    // the other 90% into one cell that then dominates the normalization.
    const values = new Float32Array(DENSE_CAP);
    for (let bucket = 0; bucket < DENSE_CAP; bucket += 1) {
      const start = Math.floor((bucket * units) / DENSE_CAP);
      const end = Math.floor(((bucket + 1) * units) / DENSE_CAP);
      let sum = 0;
      for (let i = start; i < end; i += 1) sum += data[i];
      values[bucket] = sum / (end - start);
    }
    return { kind: 'dense', units, overflow, values };
  }
  // Rank 2 ([h, w]) renders as a single-channel map; rank 3 is channels-last.
  if (shape.length === 2 || shape.length === 3) {
    const [height, width] = shape;
    const channels = shape.length === 3 ? shape[2] : 1;
    const shownChannels = Math.min(channels, CHANNEL_CAP);
    const channelOffset = Math.max(0, Math.min((opts && opts.channelOffset) || 0, channels - shownChannels));
    const mapHeight = Math.min(height, MAP_CAP);
    const mapWidth = Math.min(width, MAP_CAP);
    const maps = [];
    for (let c = 0; c < shownChannels; c += 1) {
      maps.push(downsampleChannel(data, height, width, channels, channelOffset + c, mapHeight, mapWidth));
    }
    return {
      kind: 'conv', channels, channelOffset, shownChannels, mapHeight, mapWidth, maps,
    };
  }
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  return { kind: 'mean', size: data.length, mean: data.length ? sum / data.length : 0 };
}

// Normalize values into 0..1 over the given [min, max]; a flat range maps
// everything to 0.5 (uniformly active reads as mid-intensity, not dead).
function normalize(values, min, max) {
  const out = new Float32Array(values.length);
  const range = max - min;
  for (let i = 0; i < values.length; i += 1) {
    out[i] = range === 0 ? 0.5 : (values[i] - min) / range;
  }
  return out;
}

function minMax(arrays) {
  let min = Infinity;
  let max = -Infinity;
  arrays.forEach((values) => {
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
  });
  return [min, max];
}

/**
 * Map a summary to drawable data (all intensities normalized to 0..1).
 * @returns dense: { kind:'grid', width, height, pixels, count, overflow }
 *            (near-square grid; trailing padding cells are -1 = "not a unit")
 *          conv: { kind:'tiles', mapWidth, mapHeight, tiles, channels, shownChannels }
 *            (tiles share ONE min/max so relative channel strength survives)
 *          mean: { kind:'tint', mean, intensity }
 */
export function activationToPixels(summary) {
  if (summary.kind === 'dense') {
    const count = summary.values.length;
    const width = Math.ceil(Math.sqrt(count));
    const height = Math.ceil(count / width);
    const [min, max] = minMax([summary.values]);
    const normalized = normalize(summary.values, min, max);
    const pixels = new Float32Array(width * height).fill(-1);
    pixels.set(normalized);
    return {
      kind: 'grid', width, height, pixels, count, overflow: summary.overflow,
    };
  }
  if (summary.kind === 'conv') {
    const [min, max] = minMax(summary.maps);
    return {
      kind: 'tiles',
      mapWidth: summary.mapWidth,
      mapHeight: summary.mapHeight,
      tiles: summary.maps.map(map => normalize(map, min, max)),
      channels: summary.channels,
      shownChannels: summary.shownChannels,
    };
  }
  const { mean } = summary;
  // Squash the (unbounded) mean into 0..1; negative means read as inactive.
  const intensity = mean <= 0 ? 0 : mean / (1 + mean);
  return { kind: 'tint', mean, intensity };
}
