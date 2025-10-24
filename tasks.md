# Tasks

Not creating issues for those.
But if you read this and you want to get involved, you can actually create one from any item of this list.

## High Priority

### 1. Replace D3.js with modern graph visualization library
- [ ] Replace Chartist, or make it work with Vue3
- [ ] Research and evaluate D3.js alternatives for neural network visualization
  - Consider: Cytoscape.js, vis.js, Sigma.js, or modern Canvas/WebGL libraries
  - Requirements: Better event handling (click-click connections), performance, touch support
  - Evaluate: API simplicity, bundle size, maintenance status, TypeScript support
- [ ] Implement click-click connection mechanism using chosen library
  - First click on anchor: show temporary connection line following cursor
  - Second click on different anchor: create permanent connection
  - Click same layer: cancel connection
  - Should work alongside existing drag-and-drop connections

### 2. Client improvements
- [ ] Destroy the about.nnvp.io, make it part of this app
- [ ] Fix corrupted Roboto-Thin-webfont.woff font file
- [ ] Use oxlint instead of eslint

### 3. Deployment
- [ ] Migrate from Netlify to GH pages for the SPA

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
