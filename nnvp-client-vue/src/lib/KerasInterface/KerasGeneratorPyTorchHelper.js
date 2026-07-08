// class KerasPyTorchGenerator {
// Mirrors KerasGeneratorPythonHelper / KerasGeneratorJavascriptHelper (composition pattern).
// Produces a torch.nn.Module subclass from the layer graph.
//
// Keras layers are lazily-shaped (input size is often unknown at design time), so we
// prefer PyTorch's lazy modules (LazyLinear, LazyConv2d, LazyBatchNorm*, ...) whose
// input dimension is inferred on the first forward pass. torch has no lazy recurrent
// module, so the recurrent input_size is inferred from the graph instead (see
// KerasGeneratorDimInference); when that fails, the fallback is a loud TODO comment.

/* eslint-disable no-param-reassign */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "renderValue",
                                                                "activationModule",
                                                                "recurrentModule",
                                                                "isMerge"] }] */

import inferFeatureDims from './KerasGeneratorDimInference';

export default class KerasGeneratorPyTorchHelper {
  constructor(graph, inputs, outputs, list, sequential) {
    this.graph = graph;
    this.inputs = inputs;
    this.outputs = outputs;
    this.list = list;
    this.sequential = sequential || false;
    this.dims = inferFeatureDims(graph, list);
  }

  // Feature dim (last-axis size / channel count) of the node's first predecessor,
  // as inferred from the graph, or null when it could not be derived.
  inferredInputFeatures(node) {
    const sources = this.graph[node].sources || [];
    const source = this.dims[sources[0]];
    return source && source.features !== null ? source.features : null;
  }

  // Returns the name given to the node in the generated PyTorch code.
  nodeName(node) {
    if (this.graph[node].keras_data.name === 'Input') {
      return `input_${node}`;
    }
    if (this.graph[node].keras_data.name === 'Output') {
      return `output_${node}`;
    }
    return `layer_${node}`;
  }

  // Render a Python tuple, matching the Python helper's format.
  generateTuple(param) {
    let tupleString = '(';
    for (let i = 0; i < param.length; i += 1) {
      const value = param[i];
      if (typeof (value) === 'string') {
        tupleString += `'${value}',`;
      } else if (Array.isArray(value)) {
        tupleString += `${this.generateTuple(value)},`;
      } else {
        tupleString += `${value},`;
      }
    }
    tupleString += ')';
    return tupleString;
  }

  // Render a single scalar/array parameter value as Python source.
  renderValue(value) {
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (Array.isArray(value)) return this.generateTuple(value);
    return `${value}`;
  }

  // Map a Keras activation name (from an Activation layer or a bare activation layer)
  // to the matching torch.nn module constructor, or null when unsupported.
  activationModule(activation) {
    switch ((activation || '').toLowerCase()) {
      case 'relu': return 'nn.ReLU()';
      case 'leakyrelu':
      case 'leaky_relu': return 'nn.LeakyReLU()';
      case 'sigmoid': return 'nn.Sigmoid()';
      case 'tanh': return 'nn.Tanh()';
      case 'softmax': return 'nn.Softmax(dim=1)';
      case 'elu': return 'nn.ELU()';
      case 'selu': return 'nn.SELU()';
      case 'gelu': return 'nn.GELU()';
      default: return null;
    }
  }

  // Map a Keras recurrent layer name to its torch.nn module class, or null when the
  // layer is not a (supported) recurrent layer. These modules are special-cased in
  // forward() because they return a (output, hidden) tuple rather than a plain tensor.
  recurrentModule(name) {
    switch (name) {
      case 'LSTM': return 'nn.LSTM';
      case 'GRU': return 'nn.GRU';
      case 'SimpleRNN':
      case 'RNN': return 'nn.RNN';
      default: return null;
    }
  }

  // Merge layers have no learnable module: they are wired directly in forward().
  isMerge(name) {
    return name === 'Concatenate' || name === 'Add';
  }

  // Return the torch.nn module constructor string for a node, or null if the node has
  // no dedicated module (Input/Output/merge) or is unsupported (handled by the caller).
  moduleConstructor(node) {
    const { name, parameterValues: params } = this.graph[node].keras_data;
    const p = params || {};
    switch (name) {
      case 'Dense':
        return p.units !== undefined
          ? `nn.LazyLinear(${this.renderValue(p.units)})`
          : 'nn.LazyLinear()';
      case 'Conv1D':
      case 'Conv2D':
      case 'Conv3D': {
        const dim = name.charAt(4);
        const args = [];
        if (p.filters !== undefined) args.push(this.renderValue(p.filters));
        if (p.kernel_size !== undefined) args.push(this.renderValue(p.kernel_size));
        return `nn.LazyConv${dim}d(${args.join(', ')})`;
      }
      case 'MaxPooling1D':
      case 'MaxPooling2D':
      case 'MaxPooling3D': {
        const dim = name.charAt(10);
        return `nn.MaxPool${dim}d(${p.pool_size !== undefined ? this.renderValue(p.pool_size) : '2'})`;
      }
      case 'AveragePooling1D':
      case 'AveragePooling2D':
      case 'AveragePooling3D': {
        const dim = name.charAt(14);
        return `nn.AvgPool${dim}d(${p.pool_size !== undefined ? this.renderValue(p.pool_size) : '2'})`;
      }
      case 'Flatten':
        return 'nn.Flatten()';
      case 'Dropout':
        return `nn.Dropout(${p.rate !== undefined ? this.renderValue(p.rate) : '0.5'})`;
      case 'BatchNormalization':
        // Lazy variant infers num_features; 1d is the dimension-agnostic default.
        return 'nn.LazyBatchNorm1d()';
      case 'Embedding': {
        const args = [];
        if (p.input_dim !== undefined) args.push(this.renderValue(p.input_dim));
        if (p.output_dim !== undefined) args.push(this.renderValue(p.output_dim));
        return `nn.Embedding(${args.join(', ')})`;
      }
      case 'LSTM':
      case 'GRU':
      case 'SimpleRNN':
      case 'RNN': {
        // torch has no Lazy recurrent module, so input_size is required. Keras `units`
        // maps to hidden_size; input_size is inferred from the predecessor's feature
        // dim, falling back to `units` with a loud TODO when the graph does not make
        // it derivable. batch_first=True matches Keras' (batch, timesteps, features)
        // layout. The tuple return is unpacked in forward().
        const units = p.units !== undefined ? this.renderValue(p.units) : '1';
        const inferred = this.inferredInputFeatures(node);
        const inputSize = inferred !== null ? this.renderValue(inferred) : units;
        const todo = inferred !== null ? '' : '  # TODO: set input_size (could not infer from graph)';
        return `${this.recurrentModule(name)}(${inputSize}, ${units}, batch_first=True)${todo}`;
      }
      case 'Activation':
        return this.activationModule(p.activation);
      case 'ReLU':
      case 'LeakyReLU':
      case 'Sigmoid':
      case 'Tanh':
      case 'Softmax':
      case 'ELU':
      case 'SELU':
      case 'GELU':
        return this.activationModule(name);
      default:
        return null;
    }
  }

  // True when the node emits a real nn module in __init__ / a self.layer_N call in forward.
  isModuleNode(node) {
    const { name } = this.graph[node].keras_data;
    if (name === 'Input' || name === 'Output' || this.isMerge(name)) return false;
    return this.moduleConstructor(node) !== null;
  }

  // True when a node is a recurrent module (LSTM/GRU/RNN). Such nodes are real module
  // nodes but need special forward() handling for their (output, hidden) tuple return.
  isRecurrentNode(node) {
    return this.recurrentModule(this.graph[node].keras_data.name) !== null;
  }

  // Keras recurrent layers return only the last timestep unless return_sequences is set.
  returnSequences(node) {
    const { parameterValues: params } = this.graph[node].keras_data;
    return !!(params && params.return_sequences);
  }

  // True when a node maps to nothing we know how to emit -> TODO placeholder.
  isUnsupportedNode(node) {
    const { name } = this.graph[node].keras_data;
    if (name === 'Input' || name === 'Output' || this.isMerge(name)) return false;
    return this.moduleConstructor(node) === null;
  }

  // __init__ body: declare a self.layer_N module per module node, a TODO comment per
  // unsupported node, and nothing for Input/Output/merge nodes.
  generateInit() {
    let rs = '  def __init__(self):\n';
    rs += '    super().__init__()\n';
    this.list.forEach((node) => {
      if (this.isModuleNode(node)) {
        rs += `    self.${this.nodeName(node)} = ${this.moduleConstructor(node)}\n`;
      } else if (this.isUnsupportedNode(node)) {
        rs += `    # TODO: unsupported layer ${this.graph[node].keras_data.name}\n`;
      }
    });
    return rs;
  }

  // Sequential forward(): a single running tensor `x` chained through each module.
  generateSequentialForward() {
    let rs = '  def forward(self, x):\n';
    this.list.forEach((node) => {
      const { name } = this.graph[node].keras_data;
      if (name === 'Input' || name === 'Output') return;
      if (this.isRecurrentNode(node)) {
        // Recurrent modules return (output, hidden); keep only the output tensor.
        rs += `    x, _ = self.${this.nodeName(node)}(x)\n`;
        if (!this.returnSequences(node)) {
          rs += '    x = x[:, -1, :]\n';
        }
      } else if (this.isModuleNode(node)) {
        rs += `    x = self.${this.nodeName(node)}(x)\n`;
      } else if (this.isUnsupportedNode(node)) {
        rs += `    x = x  # TODO: unsupported layer ${name}\n`;
      }
    });
    rs += '    return x\n';
    return rs;
  }

  // Return the forward expression that produces a node's output from its source vars.
  forwardExpression(node) {
    const { name } = this.graph[node].keras_data;
    const sources = this.graph[node].sources.map(s => this.nodeName(s));
    if (name === 'Concatenate') {
      return `torch.cat([${sources.join(', ')}], dim=1)`;
    }
    if (name === 'Add') {
      return sources.join(' + ');
    }
    if (this.isModuleNode(node)) {
      return `self.${this.nodeName(node)}(${sources.join(', ')})`;
    }
    // Unsupported: pass the (first) input through unchanged with a TODO marker.
    return `${sources[0]}  # TODO: unsupported layer ${name}`;
  }

  // Functional forward(): one named variable per node, wired by dataflow.
  // Single input model -> forward(self, x); multi-input -> forward(self, input_a, ...).
  generateFunctionalForward() {
    const single = this.inputs.length <= 1;
    const args = single ? 'x' : this.inputs.map(i => this.nodeName(i)).join(', ');
    let rs = `  def forward(self, ${args}):\n`;
    if (single && this.inputs.length === 1) {
      rs += `    ${this.nodeName(this.inputs[0])} = x\n`;
    }
    this.list.forEach((node) => {
      const { name } = this.graph[node].keras_data;
      if (name === 'Input' || name === 'Output') return;
      if (this.isRecurrentNode(node)) {
        // Recurrent modules return (output, hidden); unpack and keep the output tensor.
        const v = this.nodeName(node);
        const sources = this.graph[node].sources.map(s => this.nodeName(s));
        rs += `    ${v}, _ = self.${v}(${sources.join(', ')})\n`;
        if (!this.returnSequences(node)) {
          rs += `    ${v} = ${v}[:, -1, :]\n`;
        }
      } else {
        rs += `    ${this.nodeName(node)} = ${this.forwardExpression(node)}\n`;
      }
    });
    const returned = this.outputs.map(o => this.nodeName(this.graph[o].sources[0]));
    rs += `    return ${returned.length === 1 ? returned[0] : `(${returned.join(', ')})`}\n`;
    return rs;
  }

  generateSequential() {
    let rs = 'import torch\n';
    rs += 'import torch.nn as nn\n';
    rs += '\n\n';
    rs += 'class Model(nn.Module):\n';
    rs += this.generateInit();
    rs += '\n';
    rs += this.generateSequentialForward();
    return rs;
  }

  generateFunctional() {
    let rs = 'import torch\n';
    rs += 'import torch.nn as nn\n';
    rs += '\n\n';
    rs += 'class Model(nn.Module):\n';
    rs += this.generateInit();
    rs += '\n';
    rs += this.generateFunctionalForward();
    return rs;
  }

  generate(sequential) {
    sequential = sequential === undefined ? this.sequential : sequential;
    return sequential ? this.generateSequential() : this.generateFunctional();
  }
}
