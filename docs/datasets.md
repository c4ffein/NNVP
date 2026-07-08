# Datasets

NNVP lets you train models directly in the browser with TensorFlow.js. Three
datasets are wired into the app and can be loaded from the interface. Their
definitions live in
[`nnvp-client-vue/src/lib/JSDatasets/datasets-sources.js`](../nnvp-client-vue/src/lib/JSDatasets/datasets-sources.js),
where each entry lists the image sprites, checksums, input shape, example
counts and (where relevant) class names.

## MNIST

- **What it is:** A database of handwritten digits (0-9), the classic
  entry-level dataset for image classification.
- **Input shape:** `[28, 28, 1]` (grayscale).
- **Examples:** 70,000 total — 60,000 training, 10,000 test.
- **Classes:** 10 (digits `0`-`9`).
- **Links:** [LeCun MNIST](http://yann.lecun.com/exdb/mnist/) ·
  [TF Catalog](https://www.tensorflow.org/datasets/catalog/mnist)

## Fashion-MNIST

- **What it is:** A drop-in replacement for MNIST made of Zalando clothing
  images, harder than MNIST while keeping the same format.
- **Input shape:** `[28, 28, 1]` (grayscale).
- **Examples:** 70,000 total — 60,000 training, 10,000 test.
- **Classes:** 10 — T-shirt/top, Trouser, Pullover, Dress, Coat, Sandal,
  Shirt, Sneaker, Bag, Ankle boot.
- **Links:** [Kaggle](https://www.kaggle.com/zalando-research/fashionmnist) ·
  [PNG conversion](https://github.com/DeepLenin/fashion-mnist_png)

## CIFAR-10

- **What it is:** The CIFAR-10 dataset (Canadian Institute For Advanced
  Research), a collection of small color images commonly used to train
  machine-learning and computer-vision models. It is noticeably heavier to
  load in the browser than the MNIST-family datasets.
- **Input shape:** `[32, 32, 3]` (RGB).
- **Examples:** 60,000 total — 50,000 training, 10,000 test.
- **Classes:** 10 — airplane, automobile, bird, cat, deer, dog, frog, horse,
  ship, truck.
- **Links:**
  [Format conversion guide](https://stackoverflow.com/questions/57291964/how-to-convert-cifar-dataset-into-the-same-format-as-mnist)
  ·
  [Array to image](https://stackoverflow.com/questions/902761/saving-a-numpy-array-as-an-image)

## Candidate future datasets

These are documented as candidates but are **not yet wired into the app**.

- **K-MNIST (Kuzushiji-MNIST):** A drop-in MNIST replacement of cursive
  Japanese (Kuzushiji) characters, 10 classes of `28x28` grayscale images.
  [TF Catalog](https://www.tensorflow.org/datasets/catalog/kmnist)
- **Reuters:** A text dataset of newswires labeled over 46 topics, used for
  multiclass text classification rather than image tasks.
  [TF API docs](https://www.tensorflow.org/api_docs/python/tf/keras/datasets/reuters)

## See also

Utilities for loading and transforming datasets with TensorFlow.js:

- [tfjs-data](https://github.com/tensorflow/tfjs-data)
- [tfds.as_dataframe](https://www.tensorflow.org/datasets/api_docs/python/tfds/as_dataframe)
