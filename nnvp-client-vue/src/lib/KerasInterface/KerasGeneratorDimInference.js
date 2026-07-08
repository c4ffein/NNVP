// Feature-dimension inference shared by the PyTorch and tinygrad helpers.
//
// Walks the treatment list (already in topological order, so every node's sources
// are resolved before the node itself) and derives, where the graph makes it
// possible, each node's output dimensions in the Keras (channels-last) convention:
//   - `features`: the last-axis size (Dense in_features, recurrent input_size) which
//     is also the channel count consumed by Conv / BatchNorm on the next node;
//   - `shape`: the FULL output shape (without batch), kept only while every axis is
//     still known - it is what makes Flatten's in-features computable.
// Conv and pooling layers keep their channel count but drop the full shape: spatial
// arithmetic (stride / padding / dilation) is deliberately NOT attempted, so a
// Flatten downstream of a Conv is treated as unknown rather than guessed.
//
// Anything not derivable is null; the generators fall back to their documented
// defaults with a loud TODO comment so the user cannot miss the guess.

export default function inferFeatureDims(graph, list) {
  const dims = {};
  // Dim record of an already-treated node, with nulls for anything unknown.
  const dimsOf = node => dims[node] || { shape: null, features: null };
  list.forEach((node) => {
    const { name, parameterValues } = graph[node].keras_data;
    const p = parameterValues || {};
    const sources = graph[node].sources || [];
    const source = dimsOf(sources[0]);
    let shape = null;
    let features = null;
    switch (name) {
      case 'Input':
        // The user-declared shape is the one fully-known starting point.
        if (Array.isArray(p.shape) && p.shape.length > 0
            && p.shape.every(d => typeof d === 'number')) {
          shape = p.shape.slice();
          features = shape[shape.length - 1];
        }
        break;
      case 'Dense':
        // Dense maps the last axis to `units`, leaving the other axes untouched.
        if (p.units !== undefined) {
          features = p.units;
          if (source.shape) shape = [...source.shape.slice(0, -1), p.units];
        }
        break;
      case 'LSTM':
      case 'GRU':
      case 'SimpleRNN':
      case 'RNN':
        // Recurrent output features = units (with or without return_sequences);
        // the timestep axis is not tracked, so only `features` survives.
        if (p.units !== undefined) features = p.units;
        break;
      case 'Embedding':
        // Embedding appends an `output_dim`-sized axis to its (integer) input.
        if (p.output_dim !== undefined) {
          features = p.output_dim;
          if (source.shape) shape = [...source.shape, p.output_dim];
        }
        break;
      case 'Conv1D':
      case 'Conv2D':
      case 'Conv3D':
        // Channels become `filters`; spatial axes change in ways we do not compute.
        if (p.filters !== undefined) features = p.filters;
        break;
      case 'MaxPooling1D':
      case 'MaxPooling2D':
      case 'MaxPooling3D':
      case 'AveragePooling1D':
      case 'AveragePooling2D':
      case 'AveragePooling3D':
        // Pooling keeps the channel count but shrinks spatial axes we do not compute.
        features = source.features;
        break;
      case 'BatchNormalization':
      case 'Dropout':
      case 'Activation':
      case 'ReLU':
      case 'LeakyReLU':
      case 'Sigmoid':
      case 'Tanh':
      case 'Softmax':
      case 'ELU':
      case 'SELU':
      case 'GELU':
      case 'Output':
        // Shape-preserving: everything passes through unchanged.
        shape = source.shape ? source.shape.slice() : null;
        features = source.features;
        break;
      case 'Flatten':
        // Only computable when the full predecessor shape is known.
        if (source.shape) {
          features = source.shape.reduce((acc, d) => acc * d, 1);
          shape = [features];
        }
        break;
      case 'Concatenate': {
        // Keras Concatenate defaults to axis=-1: features add up when all are known.
        const sourceDims = sources.map(dimsOf);
        if (sourceDims.length > 0 && sourceDims.every(d => d.features !== null)) {
          features = sourceDims.reduce((acc, d) => acc + d.features, 0);
        }
        break;
      }
      case 'Add': {
        // Element-wise merge: features pass through when every source agrees.
        const sourceDims = sources.map(dimsOf);
        if (sourceDims.length > 0 && sourceDims.every(d => d.features !== null
            && d.features === sourceDims[0].features)) {
          features = sourceDims[0].features;
        }
        break;
      }
      default:
        // Unknown/unsupported layer: its output dims cannot be trusted.
        break;
    }
    dims[node] = { shape, features };
  });
  return dims;
}
