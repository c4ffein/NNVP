/**
 * Label encoding strategies for neural network training.
 *
 * Educational note: Different loss functions require different label formats:
 * - Categorical Crossentropy → One-hot encoding
 * - Sparse Categorical Crossentropy → Integer encoding
 */

import { getTf } from '../tf/loadTf';

/** The encoding strategies `encode` dispatches on. */
export type LabelEncoding = 'one-hot-manual' | 'one-hot-tf' | 'integer';

export default class LabelEncoder {
  numClasses: number;

  constructor(numClasses: number) {
    this.numClasses = numClasses;
  }

  /**
   * Manual one-hot encoding - Educational implementation
   * Shows explicit logic: convert integer label to binary vector
   *
   * Example: label 2 with 5 classes → [0, 0, 1, 0, 0]
   *
   * @param labelValue - Integer class label (0 to numClasses-1)
   * @returns One-hot encoded vector
   */
  encodeOneHotManual(labelValue: number): Uint8Array {
    if (labelValue < 0 || labelValue >= this.numClasses) {
      throw new Error(`Label ${labelValue} out of range [0, ${this.numClasses})`);
    }
    const oneHot = new Uint8Array(this.numClasses);
    oneHot[labelValue] = 1;
    return oneHot;
  }

  /**
   * Batch encode labels to one-hot using manual implementation
   *
   * @param labelInts - Array of integer labels
   * @returns One-hot encoded labels [batchSize, numClasses] (tf.Tensor2D)
   */
  batchEncodeOneHotManual(labelInts: Int32Array) {
    const tf = getTf();
    const batchSize = labelInts.length;
    const oneHotArray = new Float32Array(batchSize * this.numClasses);

    for (let i = 0; i < batchSize; i++) {
      const oneHot = this.encodeOneHotManual(labelInts[i]!);
      oneHotArray.set(oneHot, i * this.numClasses);
    }

    return tf.tensor2d(oneHotArray, [batchSize, this.numClasses]);
  }

  /**
   * TensorFlow.js one-hot encoding - Optimized implementation
   * Uses built-in GPU-accelerated operation
   *
   * @param labelInts - Array of integer labels
   * @returns One-hot encoded labels [batchSize, numClasses] (tf.Tensor2D)
   */
  batchEncodeOneHotTF(labelInts: Int32Array) {
    const tf = getTf();
    const labelTensor = tf.tensor1d(labelInts, 'int32');
    return tf.oneHot(labelTensor, this.numClasses);
  }

  /**
   * Integer encoding - For sparse categorical crossentropy
   * Returns labels as-is (no transformation)
   *
   * @param labelInts - Array of integer labels
   * @returns Integer labels [batchSize] (tf.Tensor1D)
   */
  batchEncodeInteger(labelInts: Int32Array) {
    const tf = getTf();
    return tf.tensor1d(labelInts, 'int32');
  }

  /**
   * Main encoding dispatcher - routes to appropriate encoder
   *
   * @param labelInts - Array of integer labels
   * @param encoding - Encoding strategy: 'one-hot-manual', 'one-hot-tf', 'integer'
   * @returns Encoded labels (tf.Tensor)
   */
  encode(labelInts: Int32Array, encoding: LabelEncoding | string = 'one-hot-tf') {
    switch(encoding) {
      case 'one-hot-manual':
        return this.batchEncodeOneHotManual(labelInts);
      case 'one-hot-tf':
        return this.batchEncodeOneHotTF(labelInts);
      case 'integer':
        return this.batchEncodeInteger(labelInts);
      default:
        throw new Error(
          `Unknown encoding: ${encoding}. ` +
          `Use 'one-hot-manual', 'one-hot-tf', or 'integer'`
        );
    }
  }
}
