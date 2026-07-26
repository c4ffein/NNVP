// Temperature sampling over a probability vector — the pure core of the
// Inspect tab's text-generation loop. No tfjs: the model's softmax output
// arrives as a plain array, fully unit-testable under bun.

/** Below this, temperature sampling degenerates to argmax (and dividing by
 *  ~0 would overflow anyway). */
const GREEDY_TEMPERATURE = 0.01;

/**
 * Draw one class index from `probs` sharpened/flattened by `temperature`:
 * ~0 = greedy argmax, 1 = the distribution as-is, >1 = extra randomness.
 * `rng` is injectable for deterministic tests (defaults to Math.random).
 */
export function sampleFromProbs(
  probs: ArrayLike<number>,
  temperature: number,
  rng: () => number = Math.random,
): number {
  if (probs.length === 0) throw new Error('sampleFromProbs: empty distribution');
  if (temperature < GREEDY_TEMPERATURE) {
    let best = 0;
    for (let i = 1; i < probs.length; i += 1) {
      if (probs[i]! > probs[best]!) best = i;
    }
    return best;
  }
  // Rescale in log space, then softmax back. The max-shift keeps exp() in
  // range however sharp the rescaled logits get.
  const logits = new Float64Array(probs.length);
  let maxLogit = -Infinity;
  for (let i = 0; i < probs.length; i += 1) {
    logits[i] = Math.log(Math.max(probs[i]!, 1e-12)) / temperature;
    if (logits[i]! > maxLogit) maxLogit = logits[i]!;
  }
  let total = 0;
  for (let i = 0; i < logits.length; i += 1) {
    logits[i] = Math.exp(logits[i]! - maxLogit);
    total += logits[i]!;
  }
  let draw = rng() * total;
  for (let i = 0; i < logits.length; i += 1) {
    draw -= logits[i]!;
    if (draw <= 0) return i;
  }
  return logits.length - 1; // float dust: the draw fell off the end
}
