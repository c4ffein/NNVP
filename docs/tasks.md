# Tasks

Not creating issues for those.
But if you read this and you want to get involved, you can actually create one from any item of this list.

## High Priority

### 1. Client improvements
- [x] Fix corrupted Roboto-Thin-webfont.woff font file => Actually switched for Inter
- [x] Make what is currently at about.nnvp.io part of this app
- [x] Use oxlint instead of eslint
- [ ] More modern / bold but still minimalistic theme
  - [x] v0 new theme
  - [x] Adapt existing tests
  - [ ] v0.1 new theme
    - [ ] Loading - list of blocks growing from bottom to top, starting when reached, smoother than current solution
    - [ ] Left menu - separate blocks scrolling separately, search always present
    - [ ] Bottom menu - redo everythin to be cleaner
  - [ ] Comprehensive manual testing to find potential regressions => add more tests + fix
  - [ ] List last small improvements

### 2. New tests for broken features
- [x] When deselecting a layer, we have to go back to the empty selection in the right panel

### 3. Deployment
- [ ] Migrate from Netlify to OVH for the SPA
- [ ] Destroy previous nnvp.io hosting
- [ ] Destroy previous about.nnvp.io hosting

### 4. Code cleaning
- [x] Remove all remaining TODOs
- [x] Code cleaning => removed the shut-down `legacy-backend/` (see [Datasets](datasets.md) / [History](history.md))

## Documentation & Datasets

See [docs/datasets.md](datasets.md) for the written documentation.

- [x] Document MNIST dataset
  - Links: [LeCun MNIST](http://yann.lecun.com/exdb/mnist/), [TF Catalog](https://www.tensorflow.org/datasets/catalog/mnist)
- [x] Document Fashion-MNIST dataset
  - Links: [Kaggle](https://www.kaggle.com/zalando-research/fashionmnist), [PNG conversion](https://github.com/DeepLenin/fashion-mnist_png)
- [x] Document CIFAR-10 dataset
  - [Format conversion guide](https://stackoverflow.com/questions/57291964/how-to-convert-cifar-dataset-into-the-same-format-as-mnist)
  - [Array to image](https://stackoverflow.com/questions/902761/saving-a-numpy-array-as-an-image)
- [x] Document K-MNIST dataset (candidate, not yet wired)
  - Link: [TF Catalog](https://www.tensorflow.org/datasets/catalog/kmnist)
- [x] Document Reuters dataset (candidate, not yet wired)
  - Link: [TF API docs](https://www.tensorflow.org/api_docs/python/tf/keras/datasets/reuters)
- [x] Link to TensorFlow.js data utilities
  - Link: [tfjs-data](https://github.com/tensorflow/tfjs-data)
  - Link: [tfds.as_dataframe](https://www.tensorflow.org/datasets/api_docs/python/tfds/as_dataframe)

## Future Features

### Tutorial mode
- [ ] Create a guided tutorial module for building models step-by-step
  - Reference: [Keras Sequential Model Guide](https://keras.io/guides/sequential_model/)

### Alternate backend support
- [ ] Add alternate PyTorch layers + code generation
- [ ] Add alternate Tinygrad layers + code generation
