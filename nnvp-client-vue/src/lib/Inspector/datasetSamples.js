// Inspect mode: pure helpers for browsing dataset samples by class.
// A google-data-loader Dataset stores test data as flat typed arrays:
// testLabels (one class index per element) and testImages (imageByteSize
// floats per element). These helpers never touch tf.

/**
 * Group sample positions by class.
 * @param {Uint8Array|number[]} labels one class index per sample
 * @param {number} numClasses
 * @returns {number[][]} indicesByClass[cls] = sample positions of that class
 */
export function buildClassIndex(labels, numClasses) {
  const byClass = Array.from({ length: numClasses }, () => []);
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] < numClasses) byClass[labels[i]].push(i);
  }
  return byClass;
}

/**
 * The flat pixel values of one sample.
 * @param {Float32Array} images flat images array
 * @param {number} imageSize floats per image
 * @param {number} index sample position
 */
export function sampleAt(images, imageSize, index) {
  return images.slice(index * imageSize, (index + 1) * imageSize);
}
