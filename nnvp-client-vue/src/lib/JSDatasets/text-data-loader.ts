/**
 * Character-level text dataset for next-char language modeling (the poetry
 * templates). Serves the SAME duck-type surface the training path consumes
 * from google-data-loader's image Dataset — load(progress), shape,
 * numClasses, nextTrainBatch/nextTestBatch returning { xs, labels } — so
 * TrainingZone/the engines never care which kind they hold.
 *
 * One sample is a seqLen-character window of the corpus (xs, encoded through
 * the fixed text-vocab) and the single character that follows it (label,
 * one-hot over VOCAB_SIZE). The corpus is split contiguously into train/test
 * regions and windows are drawn through pre-shuffled index tables, mirroring
 * the image loader's batching discipline.
 */

import { loadTf, getTf } from '../tf/loadTf';
import LabelEncoder from './label-encoder';
import {
  VOCAB_SIZE, SPACE_INDEX, encodeText, decodeIndices,
} from './text-vocab';

/** Train-region share of the corpus (the remainder is the test region). */
const TRAIN_FRACTION = 0.9;

// Per-fit slice sizes advertised to engines (TrainingDataset seam): a char-LM
// sees one tiny fact per window, so the historical 500-sample image slice
// would starve it — these ask for as much as the corpus can serve, capped so
// the demo trainer stays interactive in a browser tab.
const TRAIN_SLICE_CAP = 20000;
const TEST_SLICE_CAP = 2000;

export default class TextDataset {
  readonly kind = 'text';
  textPath: string;
  textChecksum: string | null;
  seqLen: number;
  shape: number[];
  numClasses: number;
  labelEncoder: LabelEncoder;
  shuffledTrainIndex: number;
  shuffledTestIndex: number;

  // Populated by load(); `declare` keeps them type-only so no own property
  // exists before load() assigns them (the google-data-loader pattern).
  declare corpus: Uint8Array;
  declare trainStart: number;
  declare testStart: number;
  declare trainIndices: Uint32Array;
  declare testIndices: Uint32Array;
  declare trainSliceSize: number;
  declare testSliceSize: number;

  constructor(textPath: string, textChecksum: string | null, seqLen: number) {
    this.textPath = textPath;
    this.textChecksum = textChecksum;
    this.seqLen = seqLen;
    this.shape = [seqLen];
    this.numClasses = VOCAB_SIZE;
    this.labelEncoder = new LabelEncoder(VOCAB_SIZE);
    this.shuffledTrainIndex = 0;
    this.shuffledTestIndex = 0;
  }

  async load(progressionCallback?: ((fraction: number) => void) | null) {
    const tf = await loadTf();
    const response = await fetch(
      this.textPath, this.textChecksum ? { integrity: this.textChecksum } : {},
    );
    if (!response.ok) throw `Failed GET of ${this.textPath}`;
    const text = await response.text();
    if (progressionCallback) progressionCallback(0.5);
    this.corpus = encodeText(text);

    // Contiguous split; each region must hold at least one full window + label.
    this.trainStart = 0;
    this.testStart = Math.floor(this.corpus.length * TRAIN_FRACTION);
    const trainWindows = this.testStart - this.seqLen;
    const testWindows = this.corpus.length - this.testStart - this.seqLen;
    if (trainWindows < 1 || testWindows < 1) {
      throw `Corpus at ${this.textPath} is too short for seqLen ${this.seqLen}`;
    }
    this.trainIndices = tf.util.createShuffledIndices(trainWindows);
    this.testIndices = tf.util.createShuffledIndices(testWindows);
    this.trainSliceSize = Math.min(TRAIN_SLICE_CAP, trainWindows);
    this.testSliceSize = Math.min(TEST_SLICE_CAP, testWindows);
    if (progressionCallback) progressionCallback(1);
  }

  // The shuffled-cursor advance shared by the tensor and raw draw paths —
  // both walk the SAME cursor, so mixing them never replays a window.
  private nextTrainIndex(): number {
    this.shuffledTrainIndex = (this.shuffledTrainIndex + 1) % this.trainIndices.length;
    return this.trainIndices[this.shuffledTrainIndex]!;
  }

  private nextTestIndex(): number {
    this.shuffledTestIndex = (this.shuffledTestIndex + 1) % this.testIndices.length;
    return this.testIndices[this.shuffledTestIndex]!;
  }

  nextTrainBatch(batchSize: number, encoding = 'one-hot-tf') {
    return this.nextBatch(batchSize, this.trainStart, () => this.nextTrainIndex(), encoding);
  }

  nextTestBatch(batchSize: number, encoding = 'one-hot-tf') {
    return this.nextBatch(batchSize, this.testStart, () => this.nextTestIndex(), encoding);
  }

  /**
   * Tensor-less draws for the worker training engine (TrainingDataset seam):
   * the exact nextBatch windowing, returning freshly allocated raw arrays
   * (safe to transfer) — xs as encoded char windows, labels the next char.
   */
  nextTrainBatchRaw(batchSize: number): { xs: Float32Array; labels: Int32Array } {
    return this.nextBatchRaw(batchSize, this.trainStart, () => this.nextTrainIndex());
  }

  nextTestBatchRaw(batchSize: number): { xs: Float32Array; labels: Int32Array } {
    return this.nextBatchRaw(batchSize, this.testStart, () => this.nextTestIndex());
  }

  nextBatchRaw(
    batchSize: number,
    regionStart: number,
    index: () => number,
  ): { xs: Float32Array; labels: Int32Array } {
    const batchXs = new Float32Array(batchSize * this.seqLen);
    const batchLabels = new Int32Array(batchSize);
    for (let i = 0; i < batchSize; i += 1) {
      const start = regionStart + index();
      for (let j = 0; j < this.seqLen; j += 1) {
        batchXs[i * this.seqLen + j] = this.corpus[start + j]!;
      }
      batchLabels[i] = this.corpus[start + this.seqLen]!;
    }
    return { xs: batchXs, labels: batchLabels };
  }

  nextBatch(
    batchSize: number,
    regionStart: number,
    index: () => number,
    encoding = 'one-hot-tf',
  ) {
    const tf = getTf();
    const { xs: batchXs, labels: batchLabels } = this.nextBatchRaw(batchSize, regionStart, index);
    const xs = tf.tensor2d(batchXs, [batchSize, this.seqLen]);
    const labels = this.labelEncoder.encode(batchLabels, encoding);
    return { xs, labels };
  }

  /** Whether load() has completed (the image loader's testLabels-truthiness idiom, named). */
  isLoaded(): boolean {
    return this.corpus !== undefined;
  }

  /** A decoded slice of the test region, for the Dataset tab's preview. */
  excerpt(length: number): string {
    const end = Math.min(this.testStart + length, this.corpus.length);
    return decodeIndices(this.corpus.subarray(this.testStart, end));
  }

  /**
   * Encode free text into one model input window: the LAST seqLen characters,
   * left-padded with spaces when the text is shorter — the Inspect tab's
   * generation loop feeds these to the trained model.
   */
  encodeContext(text: string): Float32Array {
    const window = new Float32Array(this.seqLen).fill(SPACE_INDEX);
    const encoded = encodeText(text.slice(-this.seqLen));
    window.set(encoded, this.seqLen - encoded.length);
    return window;
  }
}
