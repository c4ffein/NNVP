/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 * Modified by c4ffein to enable loading of other datasets than the original MNIST one.
 * Heavily modified again to allow multiple sprite paths and usage of fetch to verify checksums.
 */

import * as tf from '@tensorflow/tfjs';

const NUM_CLASSES = 10;
const NUM_DATASET_ELEMENTS = 65000;

const NUM_TRAIN_ELEMENTS = 55000;

/**
 * A class that fetches the sprited MNIST dataset and returns shuffled batches.
 *
 * NOTE: This will get much easier. For now, we do data fetching and
 * manipulation manually.
 */
export default class Dataset {
  constructor(
    imagesSpritePath,
    imagesSpriteChecksum = null,
    labelsPath,
    labelsSha256 = null,
    imageSize,
    numClasses = NUM_CLASSES,
    numDatasetElements = NUM_DATASET_ELEMENTS,
    numTrainElements = NUM_TRAIN_ELEMENTS,
    numTestElements,
  ) {
    this.imagesSpritePath = imagesSpritePath;
    this.checksum = imagesSpriteChecksum;
    this.labelsPath = labelsPath;
    this.labelsSha256 = labelsSha256;
    this.imageSize = imageSize;
    this.numClasses = numClasses;
    this.numDatasetElements = numDatasetElements;
    this.numTrainElements = numTrainElements;
    this.numTestElements = numTestElements || this.numDatasetElements - this.numTrainElements;
    this.shuffledTrainIndex = 0;
    this.shuffledTestIndex = 0;
  }

  async load() {
    const datasetBytesBuffer = new ArrayBuffer(this.numDatasetElements * this.imageSize * 4);
    let imgRequests = null;
    if(typeof(this.imagesSpritePath) === "string") imgRequests = this.buildImgRequest(
        this.imagesSpritePath, 0, this.numDatasetElements, this.checksum, datasetBytesBuffer
    );
    else if(Array.isArray(this.imagesSpritePath)){
      imgRequests = this.imagesSpritePath.map(
        ([offset, size, currentSpritePath], index) => this.buildImgRequest(
          currentSpritePath,
          offset,
          size,
          this.checksum ? this.checksum[index] : null,
          datasetBytesBuffer,
        )
      );
    }
    this.datasetImages = new Float32Array(datasetBytesBuffer);
    const labelsRequest = fetch(this.labelsPath, {integrity: this.labelsSha256}).then(
      async response => {this.datasetLabels = new Uint8Array(await response.arrayBuffer());}
    );
    await Promise.all([...imgRequests, labelsRequest]);

    // Create shuffled indices into the train/test set for when we select a
    // random dataset element for training / validation.
    this.trainIndices = tf.util.createShuffledIndices(this.numTrainElements);
    this.testIndices = tf.util.createShuffledIndices(this.numTestElements);

    // Slice the the images and labels into train and test sets.
    this.trainImages = this.datasetImages.slice(0, this.imageSize * this.numTrainElements);
    this.testImages = this.datasetImages.slice(this.imageSize * this.numTrainElements);
    this.trainLabels = this.datasetLabels.slice(0, this.numClasses * this.numTrainElements);
    this.testLabels = this.datasetLabels.slice(this.numClasses * this.numTrainElements);
  }

  buildImgRequest(imagesSpritePath, offset, size, imagesSpriteChecksum, datasetBytesBuffer) {
    return fetch(
      imagesSpritePath, imagesSpriteChecksum ? {integrity: imagesSpriteChecksum} : {}
    ).then(response => {
      if (!response.ok) throw "Failed GET of " + imagesSpritePath;
      return response.blob();
    }).then(async responseBlob => {
      const img = new Image();
      await (() => new Promise(resolve => {
        img.onload = () => resolve();
        img.src = URL.createObjectURL(responseBlob);
      }))();
      return img;
    }).then(img => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const chunkSize = 5000;
      canvas.width = img.width;
      canvas.height = chunkSize;

      for (let i = 0; i < size / chunkSize; i++) {
        const actualSize = i * chunkSize > size ? (1 - i) * chunkSize + size : chunkSize;
        const datasetBytesView = new Float32Array(
          datasetBytesBuffer,
          i * this.imageSize * chunkSize * 4 + offset * this.imageSize * 4,
          this.imageSize * chunkSize,
        );
        ctx.drawImage(
          img, 0, i * chunkSize, img.width, actualSize, 0, 0, img.width, actualSize
        );

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        for (let j = 0; j < imageData.data.length / 4; j++) {
          // All channels hold an equal value since the image is grayscale, so
          // just read the red channel.
          datasetBytesView[j] = imageData.data[j * 4] / 255;
        }
      }
    });
  }

  nextTrainBatch(batchSize) {
    return this.nextBatch(
      batchSize, [this.trainImages, this.trainLabels], () => {
        this.shuffledTrainIndex = (this.shuffledTrainIndex + 1) % this.trainIndices.length;
        return this.trainIndices[this.shuffledTrainIndex];
      },
    );
  }

  nextTestBatch(batchSize) {
    return this.nextBatch(batchSize, [this.testImages, this.testLabels], () => {
      this.shuffledTestIndex = (this.shuffledTestIndex + 1) % this.testIndices.length;
      return this.testIndices[this.shuffledTestIndex];
    });
  }

  nextBatch(batchSize, data, index) {
    const batchImagesArray = new Float32Array(batchSize * this.imageSize);
    const batchLabelsArray = new Uint8Array(batchSize * this.numClasses);

    for (let i = 0; i < batchSize; i++) {
      const idx = index();

      const image = data[0].slice(idx * this.imageSize, idx * this.imageSize + this.imageSize);
      batchImagesArray.set(image, i * this.imageSize);

      const label = data[1].slice(idx * this.numClasses, idx * this.numClasses + this.numClasses);
      batchLabelsArray.set(label, i * this.numClasses);
    }

    const xs = tf.tensor2d(batchImagesArray, [batchSize, this.imageSize]);
    const labels = tf.tensor2d(batchLabelsArray, [batchSize, this.numClasses]);

    return { xs, labels };
  }
}
