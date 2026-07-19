// A/B engine benchmark support (the flag-gated Bench tab): the shared metric
// probe, the pure result math, and a deterministic synthetic dataset used
// ONLY when the real selected dataset does not fit the board (the bench
// trains on the real dataset through the real loaders whenever it can). The
// runs themselves go through the REAL engines (createTfjsEngine /
// createTinygradEngine) via the normal prepare/fit seam — nothing here
// re-implements training.

// Both engines slice ~this many samples per epoch (their TRAIN_DATA_SIZE);
// the samples/sec math mirrors it: tfjs consumes the full 500-sample slice
// per epoch, the tinygrad engine floor(500 / its traced batch of 32) batches.
export const ENGINE_EPOCH_SLICE = 500;
export const TINYGRAD_TRACE_BATCH = 32;

/**
 * Deterministic synthetic dataset shaped like the current board model.
 * `shape` is the board's channels-last input shape; `tf` is required only for
 * the tfjs side (nextTrainBatch/nextTestBatch); the tinygrad engine reads the
 * raw arrays. Labels cycle the classes so every class appears.
 */
export function makeSyntheticDataset({ shape, numClasses, samples = 512, valSamples = 128, tf = null }) {
  const pixels = shape.reduce((total, dim) => total * dim, 1);
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // Learnable by construction: each class gets a fixed random pattern, and a
  // sample is its class pattern plus noise. Pure noise with arbitrary labels
  // (the naive choice) is unlearnable — both engines just descend to the
  // ln(numClasses) chance plateau and the loss row measures nothing.
  const patterns = new Float32Array(numClasses * pixels);
  for (let i = 0; i < patterns.length; i += 1) patterns[i] = rand();
  const trainLabels = new Int32Array(samples);
  for (let i = 0; i < samples; i += 1) trainLabels[i] = i % numClasses;
  const trainImages = new Float32Array(samples * pixels);
  for (let i = 0; i < samples; i += 1) {
    const pattern = trainLabels[i] * pixels;
    for (let j = 0; j < pixels; j += 1) {
      trainImages[i * pixels + j] = 0.7 * patterns[pattern + j] + 0.3 * rand();
    }
  }

  // A genuine held-out split: SAME class patterns, FRESH noise. Low val loss
  // therefore means "learned the patterns"; a val gap means "memorized the
  // training noise". (Serving train samples as validation — the naive
  // shortcut — would make the val row a lie.)
  const valImages = new Float32Array(valSamples * pixels);
  const valLabels = new Int32Array(valSamples);
  for (let i = 0; i < valSamples; i += 1) valLabels[i] = i % numClasses;
  for (let i = 0; i < valSamples; i += 1) {
    const pattern = valLabels[i] * pixels;
    for (let j = 0; j < pixels; j += 1) {
      valImages[i * pixels + j] = 0.7 * patterns[pattern + j] + 0.3 * rand();
    }
  }

  const tensorBatch = (images, labels, total) => (count) => {
    if (!tf) throw new Error('this dataset was built without tf — tfjs batches unavailable');
    const n = Math.min(count, total);
    return {
      xs: tf.tensor2d(images.subarray(0, n * pixels), [n, pixels]),
      labels: tf.oneHot(tf.tensor1d(labels.subarray(0, n), 'int32'), numClasses),
    };
  };

  return {
    shape,
    numClasses,
    imageByteSize: pixels,
    trainImages,
    trainLabels,
    valImages,
    valLabels,
    nextTrainBatch: tensorBatch(trainImages, trainLabels, samples),
    nextTestBatch: tensorBatch(valImages, valLabels, valSamples),
  };
}

/**
 * Accuracy + crossentropy over up to `maxBatches` batches, through a
 * session's evaluateLogits — the ONE metric probe both engines share, so the
 * table's acc/val rows are measured identically (same samples, same math,
 * dropout off in both eval paths). The scores are normalized through a
 * stable log-sum-exp, so logits (tinygrad) and log-probabilities (tfjs under
 * a softmax head) both yield the exact softmax crossentropy.
 */
export async function probeMetrics(session, {
  images, labels, pixels, numClasses, batchSize = 32, maxBatches = 4,
}) {
  const batches = Math.min(maxBatches, Math.floor(labels.length / batchSize));
  let correct = 0;
  let lossSum = 0;
  let count = 0;
  for (let b = 0; b < batches; b += 1) {
    const x = images.subarray(b * batchSize * pixels, (b + 1) * batchSize * pixels);
    const scores = await session.evaluateLogits(x); // eslint-disable-line no-await-in-loop
    for (let i = 0; i < batchSize; i += 1) {
      const row = scores.subarray(i * numClasses, (i + 1) * numClasses);
      let best = 0;
      let max = row[0];
      for (let c = 1; c < numClasses; c += 1) if (row[c] > max) { max = row[c]; best = c; }
      let sumExp = 0;
      for (let c = 0; c < numClasses; c += 1) sumExp += Math.exp(row[c] - max);
      const label = labels[b * batchSize + i];
      lossSum += -(row[label] - max - Math.log(sumExp));
      if (best === label) correct += 1;
      count += 1;
    }
  }
  return { acc: correct / count, loss: lossSum / count };
}

/**
 * Can the board model train on this dataset? Shapes must match exactly, and
 * the graph's class count (its final Dense) must match the dataset's labels
 * — a 5-class head over 10-class labels errors on tfjs and would index
 * nonexistent classes on tinygrad.
 */
export function datasetCompatible(boardShape, datasetShape, boardClasses, datasetClasses) {
  return Array.isArray(boardShape) && Array.isArray(datasetShape)
    && boardShape.length === datasetShape.length
    && boardShape.every((dim, i) => dim === datasetShape[i])
    && (boardClasses === undefined || boardClasses === datasetClasses);
}

/** Samples each engine actually processes for a given number of epochs. */
export function samplesProcessed(engineId, epochs) {
  if (engineId === 'tinygrad') {
    return Math.floor(ENGINE_EPOCH_SLICE / TINYGRAD_TRACE_BATCH) * TINYGRAD_TRACE_BATCH * epochs;
  }
  return ENGINE_EPOCH_SLICE * epochs;
}

/**
 * Turn one engine run's raw measurements into the table row. `epochMs` are
 * per-epoch durations: steady-state throughput comes from the LAST epoch
 * only, because tfjs pays its shader compilation inside the first fit batch
 * (its prepare() is misleadingly cheap) — the last epoch is warm for both.
 */
export function summarizeRun({
  engineId, epochs, bootMs = 0, prepareMs, fitMs, epochMs = [], losses, finalLogs = {},
}) {
  const perEpoch = samplesProcessed(engineId, 1);
  const steadyEpochMs = epochMs.length ? epochMs[epochMs.length - 1] : fitMs / Math.max(1, epochs);
  const first = losses.length ? losses[0] : NaN;
  const last = losses.length ? losses[losses.length - 1] : NaN;
  return {
    engineId,
    bootMs,
    prepareMs,
    fitMs,
    setupMs: bootMs + prepareMs,
    samplesPerSec: steadyEpochMs > 0 ? (perEpoch / steadyEpochMs) * 1000 : 0,
    lossFirst: first,
    lossLast: last,
    descended: Number.isFinite(last) && Number.isFinite(first) && last < first * 0.9,
    acc: finalLogs.acc,
    valLoss: finalLogs.valLoss,
    valAcc: finalLogs.valAcc,
  };
}

/**
 * Human-readable chain of the graph being benched, so two screenshots are
 * comparable at a glance — plus the one red flag the engines treat
 * differently: a final Dense WITHOUT softmax breaks tfjs'
 * categoricalCrossentropy (it expects probabilities), while the tinygrad
 * runtime always trains on logits and stays correct.
 */
export function describeGraph(graphJson) {
  const graph = JSON.parse(graphJson);
  const layers = (graph.layers || []).filter(l => l.kerasLayer);
  const parts = layers.map((l) => {
    const { name, parameterValues: p = {} } = l.kerasLayer;
    if (name === 'Input') return `Input[${(p.shape || []).join(',')}]`;
    const bits = [];
    if (p.units !== undefined) bits.push(p.units);
    if (p.filters !== undefined) bits.push(`${p.filters}f`);
    if (p.activation && p.activation !== 'linear') bits.push(p.activation);
    return bits.length ? `${name}(${bits.join(', ')})` : name;
  });
  const denses = layers.filter(l => l.kerasLayer.name === 'Dense');
  const last = denses[denses.length - 1];
  const lastActivation = last && last.kerasLayer.parameterValues
    && last.kerasLayer.parameterValues.activation;
  return {
    summary: parts.join(' → '),
    finalSoftmax: lastActivation === 'softmax',
  };
}
