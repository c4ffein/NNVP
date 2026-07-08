// class KerasTinygradGenerator {
// Mirrors KerasGeneratorPyTorchHelper (composition pattern).
// Produces a tinygrad `Model` class from the layer graph.
//
// Unlike PyTorch, tinygrad has NO lazy layers: nn.Linear / nn.Conv2d / nn.BatchNorm2d
// all need their input dimension (in_features / in_channels / num_features) up front.
// That dimension is inferred from the graph (see KerasGeneratorDimInference): each
// predecessor's feature dim / channel count is walked down from the Input shape. When
// the graph does not make it derivable, we fall back to the out-dim (units / filters,
// or 1 for BatchNorm which has no out-dim to reuse) with a loud TODO comment on the
// line, so the emitted code stays valid and importable and the guess cannot be missed.
//
// tinygrad activations are Tensor METHODS (x.relu(), x.sigmoid(), ...), not modules,
// and Flatten is a method too (x.flatten(1)), so those nodes emit no __init__ line.

/* eslint-disable no-param-reassign */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "renderValue",
                                                                "activationMethod"] }] */

import inferFeatureDims from './KerasGeneratorDimInference';

export default class KerasGeneratorTinygradHelper {
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

  // Returns the name given to the node in the generated tinygrad code.
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
  // to the matching tinygrad Tensor method suffix, or null when unsupported.
  activationMethod(activation) {
    switch ((activation || '').toLowerCase()) {
      case 'relu': return '.relu()';
      case 'leakyrelu':
      case 'leaky_relu': return '.leakyrelu()';
      case 'sigmoid': return '.sigmoid()';
      case 'tanh': return '.tanh()';
      case 'softmax': return '.softmax()';
      case 'elu': return '.elu()';
      case 'selu': return '.selu()';
      case 'gelu': return '.gelu()';
      default: return null;
    }
  }

  // Return the tinygrad nn module constructor string for a node, or null if the node
  // has no dedicated module (Input/Output/method node) or is unsupported.
  moduleConstructor(node) {
    const { name, parameterValues: params } = this.graph[node].keras_data;
    const p = params || {};
    switch (name) {
      case 'Dense': {
        // No lazy Linear in tinygrad: in_features is inferred from the predecessor's
        // feature dim, falling back to units with a loud TODO when not derivable.
        const units = p.units !== undefined ? this.renderValue(p.units) : '1';
        const inferred = this.inferredInputFeatures(node);
        const inFeatures = inferred !== null ? this.renderValue(inferred) : units;
        const todo = inferred !== null ? '' : '  # TODO: set in_features (could not infer from graph)';
        return `nn.Linear(${inFeatures}, ${units})${todo}`;
      }
      case 'Conv2D': {
        // in_channels is inferred from the predecessor's channel count, falling back
        // to filters with a loud TODO when not derivable; kernel_size passed through.
        const filters = p.filters !== undefined ? this.renderValue(p.filters) : '1';
        const kernel = p.kernel_size !== undefined ? this.renderValue(p.kernel_size) : '3';
        const inferred = this.inferredInputFeatures(node);
        const inChannels = inferred !== null ? this.renderValue(inferred) : filters;
        const todo = inferred !== null ? '' : '  # TODO: set in_channels (could not infer from graph)';
        return `nn.Conv2d(${inChannels}, ${filters}, ${kernel})${todo}`;
      }
      case 'BatchNormalization': {
        // BatchNorm2d needs num_features = the input channel count, inferred from the
        // predecessor; the fallback placeholder (1) keeps the code importable and the
        // loud TODO makes the guess impossible to miss.
        const inferred = this.inferredInputFeatures(node);
        if (inferred !== null) return `nn.BatchNorm2d(${this.renderValue(inferred)})`;
        return 'nn.BatchNorm2d(1)  # TODO: set num_features (could not infer from graph)';
      }
      default:
        return null;
    }
  }

  // Return the tinygrad Tensor method suffix for a node (Flatten / activation), or null.
  methodCall(node) {
    const { name, parameterValues: params } = this.graph[node].keras_data;
    const p = params || {};
    switch (name) {
      case 'Flatten':
        return '.flatten(1)';
      case 'Activation':
        return this.activationMethod(p.activation);
      case 'ReLU':
      case 'LeakyReLU':
      case 'Sigmoid':
      case 'Tanh':
      case 'Softmax':
      case 'ELU':
      case 'SELU':
      case 'GELU':
        return this.activationMethod(name);
      default:
        return null;
    }
  }

  // True when the node emits a real nn module in __init__ / a self.layer_N call.
  isModuleNode(node) {
    const { name } = this.graph[node].keras_data;
    if (name === 'Input' || name === 'Output') return false;
    return this.moduleConstructor(node) !== null;
  }

  // True when the node emits a Tensor method (no __init__ line, applied inline).
  isMethodNode(node) {
    const { name } = this.graph[node].keras_data;
    if (name === 'Input' || name === 'Output') return false;
    return this.methodCall(node) !== null;
  }

  // True when a node maps to nothing we know how to emit -> TODO placeholder.
  isUnsupportedNode(node) {
    const { name } = this.graph[node].keras_data;
    if (name === 'Input' || name === 'Output') return false;
    return this.moduleConstructor(node) === null && this.methodCall(node) === null;
  }

  // __init__ body: declare a self.layer_N module per module node, a TODO comment per
  // unsupported node, and nothing for Input/Output/method nodes. A trailing `pass`
  // keeps the body a valid statement block when no module is declared.
  generateInit() {
    let body = '';
    let hasStatement = false;
    this.list.forEach((node) => {
      if (this.isModuleNode(node)) {
        body += `    self.${this.nodeName(node)} = ${this.moduleConstructor(node)}\n`;
        hasStatement = true;
      } else if (this.isUnsupportedNode(node)) {
        body += `    # TODO: unsupported layer ${this.graph[node].keras_data.name}\n`;
      }
    });
    if (!hasStatement) body += '    pass\n';
    return `  def __init__(self):\n${body}`;
  }

  // Sequential __call__(): a single running tensor `x` chained through each node.
  generateSequentialForward() {
    let rs = '  def __call__(self, x):\n';
    this.list.forEach((node) => {
      const { name } = this.graph[node].keras_data;
      if (name === 'Input' || name === 'Output') return;
      if (this.isModuleNode(node)) {
        rs += `    x = self.${this.nodeName(node)}(x)\n`;
      } else if (this.isMethodNode(node)) {
        rs += `    x = x${this.methodCall(node)}\n`;
      } else if (this.isUnsupportedNode(node)) {
        rs += `    x = x  # TODO: unsupported layer ${name}\n`;
      }
    });
    rs += '    return x\n';
    return rs;
  }

  // Return the __call__ expression that produces a node's output from its source vars.
  forwardExpression(node) {
    const { name } = this.graph[node].keras_data;
    const sources = this.graph[node].sources.map(s => this.nodeName(s));
    if (this.isModuleNode(node)) {
      return `self.${this.nodeName(node)}(${sources.join(', ')})`;
    }
    if (this.isMethodNode(node)) {
      return `${sources[0]}${this.methodCall(node)}`;
    }
    // Unsupported: pass the (first) input through unchanged with a TODO marker.
    return `${sources[0]}  # TODO: unsupported layer ${name}`;
  }

  // Functional __call__(): one named variable per node, wired by dataflow.
  // Single input model -> __call__(self, x); multi-input -> __call__(self, input_a, ...).
  generateFunctionalForward() {
    const single = this.inputs.length <= 1;
    const args = single ? 'x' : this.inputs.map(i => this.nodeName(i)).join(', ');
    let rs = `  def __call__(self, ${args}):\n`;
    if (single && this.inputs.length === 1) {
      rs += `    ${this.nodeName(this.inputs[0])} = x\n`;
    }
    this.list.forEach((node) => {
      const { name } = this.graph[node].keras_data;
      if (name === 'Input' || name === 'Output') return;
      rs += `    ${this.nodeName(node)} = ${this.forwardExpression(node)}\n`;
    });
    const returned = this.outputs.map(o => this.nodeName(this.graph[o].sources[0]));
    rs += `    return ${returned.length === 1 ? returned[0] : `(${returned.join(', ')})`}\n`;
    return rs;
  }

  generateSequential() {
    let rs = 'from tinygrad import Tensor, nn\n';
    rs += '\n\n';
    rs += 'class Model:\n';
    rs += this.generateInit();
    rs += '\n';
    rs += this.generateSequentialForward();
    return rs;
  }

  generateFunctional() {
    let rs = 'from tinygrad import Tensor, nn\n';
    rs += '\n\n';
    rs += 'class Model:\n';
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
