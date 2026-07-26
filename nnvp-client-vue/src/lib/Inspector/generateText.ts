// Headless text sampling from a trained char-LM: the fixed-seed "phase
// boundary" samples of curriculum runs (and anything else that wants a
// generation without the Inspect tab's board light-up). Pure loop over
// predict + sampleFromProbs — tfjs and the model arrive as arguments, so
// this stays testable under bun with fakes.

import { sampleFromProbs } from './textSampler';
import { indexToChar } from '../JSDatasets/text-vocab';

/** What the sampler needs from tfjs. */
export interface GenerateTf {
  tensor(values: Float32Array, shape: number[]): { dispose(): void };
}

/** What the sampler needs from the trained model. */
export interface GenerateModel {
  predict(x: unknown): { data(): Promise<Float32Array>; dispose(): void };
}

/** What the sampler needs from a loaded TextDataset. */
export interface GenerateDataset {
  readonly seqLen: number;
  encodeContext(text: string): Float32Array;
}

export interface GenerateTextOptions {
  tf: GenerateTf;
  model: GenerateModel;
  dataset: GenerateDataset;
  seed: string;
  count: number;
  temperature: number;
  /** Injectable for deterministic tests (defaults to Math.random). */
  rng?: () => number;
}

/** Returns ONLY the generated continuation (without the seed). */
export default async function generateText(options: GenerateTextOptions): Promise<string> {
  const {
    tf, model, dataset, seed, count, temperature, rng,
  } = options;
  let generated = '';
  for (let i = 0; i < count; i += 1) {
    const window = dataset.encodeContext(seed + generated);
    const input = tf.tensor(window, [1, dataset.seqLen]);
    let probs: Float32Array;
    try {
      const scores = model.predict(input);
      try {
        probs = await scores.data(); // eslint-disable-line no-await-in-loop
      } finally {
        scores.dispose();
      }
    } finally {
      input.dispose();
    }
    generated += indexToChar(sampleFromProbs(probs, temperature, rng));
  }
  return generated;
}
