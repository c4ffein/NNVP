# Tasks

Not creating issues for those.
But if you read this and you want to get involved, you can actually create one from any item of this list.

## High Priority

### 1. Client improvements
- [x] Fix corrupted Roboto-Thin-webfont.woff font file => Actually switched for Inter
- [x] Make what is currently at about.nnvp.io part of this app
- [ ] Use oxlint instead of eslint
- [ ] More modern / bold but still minimalistic theme

### 2. Deployment
- [ ] Migrate from Netlify to OVH for the SPA
- [ ] Destroy previous nnvp.io hosting
- [ ] Destroy previous about.nnvp.io hosting

### 3. Code cleaning
- [ ] Remove all remaining TODOs

## Documentation & Datasets

### Dataset documentation
- [ ] Document MNIST dataset
  - Links: [LeCun MNIST](http://yann.lecun.com/exdb/mnist/), [TF Catalog](https://www.tensorflow.org/datasets/catalog/mnist)
- [ ] Document Fashion-MNIST dataset
  - Links: [Kaggle](https://www.kaggle.com/zalando-research/fashionmnist), [PNG conversion](https://github.com/DeepLenin/fashion-mnist_png)
- [ ] Document CIFAR-10 dataset
  - [Format conversion guide](https://stackoverflow.com/questions/57291964/how-to-convert-cifar-dataset-into-the-same-format-as-mnist)
  - [Array to image](https://stackoverflow.com/questions/902761/saving-a-numpy-array-as-an-image)
- [ ] Document K-MNIST dataset
  - Link: [TF Catalog](https://www.tensorflow.org/datasets/catalog/kmnist)
- [ ] Document Reuters dataset
  - Link: [TF API docs](https://www.tensorflow.org/api_docs/python/tf/keras/datasets/reuters)
- [ ] Link to TensorFlow.js data utilities
  - Link: [tfjs-data](https://github.com/tensorflow/tfjs-data)
  - Link: [tfds.as_dataframe](https://www.tensorflow.org/datasets/api_docs/python/tfds/as_dataframe)

## Future Features

### Tutorial mode
- [ ] Create a guided tutorial module for building models step-by-step
  - Reference: [Keras Sequential Model Guide](https://keras.io/guides/sequential_model/)

### Alternate backend support
- [ ] Add alternate PyTorch layers + code generation
- [ ] Add alternate Tinygrad layers + code generation
