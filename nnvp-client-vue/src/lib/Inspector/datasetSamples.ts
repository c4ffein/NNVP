// Inspect mode: pure helpers for browsing dataset samples by class.
// A google-data-loader Dataset stores test data as flat typed arrays:
// testLabels (one class index per element) and testImages (imageByteSize
// floats per element). These helpers never touch tf.

/**
 * Group sample positions by class.
 * @param labels one class index per sample
 * @param numClasses
 * @returns indicesByClass[cls] = sample positions of that class
 */
export function buildClassIndex(labels: ArrayLike<number>, numClasses: number): number[][] {
  const byClass: number[][] = Array.from({ length: numClasses }, () => []);
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i]! < numClasses) byClass[labels[i]!]!.push(i);
  }
  return byClass;
}

/**
 * The flat pixel values of one sample.
 * @param images flat images array
 * @param imageSize floats per image
 * @param index sample position
 */
export function sampleAt(images: Float32Array, imageSize: number, index: number): Float32Array {
  return images.slice(index * imageSize, (index + 1) * imageSize);
}
