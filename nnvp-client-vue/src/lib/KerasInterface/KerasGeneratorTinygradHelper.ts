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

import inferFeatureDims from './KerasGeneratorDimInference';
import type { InferredDims } from './KerasGeneratorDimInference';
import { quoteString, assertSafeIdSuffix } from './codegenSafety';
import type { GeneratorGraph } from './KerasGenerator';
import type { NnvpLayerId, ParameterValue } from '../../types/model';

export default class KerasGeneratorTinygradHelper {
  graph: GeneratorGraph;
  inputs: NnvpLayerId[];
  outputs: NnvpLayerId[];
  list: NnvpLayerId[];
  sequential: boolean;
  dims: Record<NnvpLayerId, InferredDims>;

  constructor(
    graph: GeneratorGraph,
    inputs: NnvpLayerId[],
    outputs: NnvpLayerId[],
    list: NnvpLayerId[],
    sequential?: boolean,
  ) {
    this.graph = graph;
    this.inputs = inputs;
    this.outputs = outputs;
    this.list = list;
    this.sequential = sequential || false;
    this.dims = inferFeatureDims(graph, list);
  }

  // Feature dim (last-axis size / channel count) of the node's first predecessor,
  // as inferred from the graph, or null when it could not be derived.
  inferredInputFeatures(node: NnvpLayerId): number | null {
    const sources = this.graph[node]!.sources || [];
    const source = this.dims[sources[0] as NnvpLayerId];
    return source && source.features !== null ? source.features : null;
  }

  // Returns the name given to the node in the generated tinygrad code.
  nodeName(node: NnvpLayerId): string {
    assertSafeIdSuffix(node);
    if (this.graph[node]!.keras_data!.name === 'Input') {
      return `input_${node}`;
    }
    if (this.graph[node]!.keras_data!.name === 'Output') {
      return `output_${node}`;
    }
    return `layer_${node}`;
  }

  // Render a Python tuple, matching the Python helper's format.
  generateTuple(param: ArrayLike<unknown>): string {
    let tupleString = '(';
    for (let i = 0; i < param.length; i += 1) {
      const value = param[i];
      if (typeof (value) === 'string') {
        tupleString += `${quoteString(value)},`;
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
  renderValue(value: ParameterValue | undefined): string {
    if (typeof value === 'string') return quoteString(value);
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (Array.isArray(value)) return this.generateTuple(value);
    return `${value}`;
  }

  // Map a Keras activation name (from an Activation layer or a bare activation layer)
  // to the matching tinygrad Tensor method suffix, or null when unsupported.
  activationMethod(activation: ParameterValue | undefined): string | null {
    switch (((activation || '') as string).toLowerCase()) {
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
  moduleConstructor(node: NnvpLayerId): string | null {
    const { name, parameterValues: params } = this.graph[node]!.keras_data!;
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
        let todo = inferred !== null ? '' : '  # TODO: set in_channels (could not infer from graph)';
        let extra = '';
        const explicitStride = p.strides !== undefined && p.strides !== null;
        if (explicitStride) extra += `, stride=${this.renderValue(p.strides)}`;
        if (p.padding === 'same') {
          // Keras 'same' at stride 1 pads a total of k-1 per axis, end-heavy
          // for even kernels — expressible exactly as tinygrad's 4-tuple
          // (left, right, top, bottom). At stride > 1 the padding depends on
          // the input size, so it cannot be emitted statically: loud TODO.
          const kv = p.kernel_size;
          const pair: [number, number] | null = typeof kv === 'number' ? [kv, kv]
            : (Array.isArray(kv) && kv.length === 2 && kv.every(k => typeof k === 'number')
              ? [kv[0]!, kv[1]!] : null);
          if (!explicitStride && pair) {
            const [kh, kw] = pair;
            if (kh % 2 === 1 && kw % 2 === 1) {
              extra += `, padding=${this.generateTuple([(kh - 1) / 2, (kw - 1) / 2])}`;
            } else {
              const bh = Math.floor((kh - 1) / 2);
              const bw = Math.floor((kw - 1) / 2);
              extra += `, padding=${this.generateTuple([bw, kw - 1 - bw, bh, kh - 1 - bh])}`;
            }
          } else {
            todo += '  # TODO: padding="same" with stride>1 depends on the input size — set padding manually';
          }
        }
        return `nn.Conv2d(${inChannels}, ${filters}, ${kernel}${extra})${todo}`;
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
  methodCall(node: NnvpLayerId): string | null {
    const { name, parameterValues: params } = this.graph[node]!.keras_data!;
    const p = params || {};
    switch (name) {
      case 'Flatten':
        return '.flatten(1)';
      case 'MaxPooling2D':
      case 'AveragePooling2D': {
        // tinygrad's stride defaults to kernel_size, exactly like Keras' strides
        // default to pool_size — so it is only emitted when explicitly set.
        const method = name === 'MaxPooling2D' ? 'max_pool2d' : 'avg_pool2d';
        const pool = p.pool_size !== undefined ? this.renderValue(p.pool_size) : '(2,2,)';
        const stride = p.strides !== undefined && p.strides !== null
          ? `, stride=${this.renderValue(p.strides)}` : '';
        return `.${method}(kernel_size=${pool}${stride})`;
      }
      case 'Dropout': {
        // Active only under Tensor.training, like Keras' training=True — a
        // no-op at inference either way.
        const rate = p.rate !== undefined ? this.renderValue(p.rate) : '0.5';
        return `.dropout(${rate})`;
      }
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

  // Keras folds activations into Dense/Conv2D as a parameter; tinygrad chains
  // them as Tensor methods after the module call. Unknown activations get a
  // loud trailing TODO instead of silently vanishing.
  moduleActivationSuffix(node: NnvpLayerId): string {
    const { name, parameterValues: params } = this.graph[node]!.keras_data!;
    if (name !== 'Dense' && name !== 'Conv2D') return '';
    const activation = (params || {}).activation;
    if (!activation || activation === 'linear') return '';
    const method = this.activationMethod(activation);
    return method !== null ? method : `  # TODO: unsupported activation ${quoteString(activation)}`;
  }

  // True when the node emits a real nn module in __init__ / a self.layer_N call.
  isModuleNode(node: NnvpLayerId): boolean {
    const { name } = this.graph[node]!.keras_data!;
    if (name === 'Input' || name === 'Output') return false;
    return this.moduleConstructor(node) !== null;
  }

  // True when the node emits a Tensor method (no __init__ line, applied inline).
  isMethodNode(node: NnvpLayerId): boolean {
    const { name } = this.graph[node]!.keras_data!;
    if (name === 'Input' || name === 'Output') return false;
    return this.methodCall(node) !== null;
  }

  // True when a node maps to nothing we know how to emit -> TODO placeholder.
  isUnsupportedNode(node: NnvpLayerId): boolean {
    const { name } = this.graph[node]!.keras_data!;
    if (name === 'Input' || name === 'Output') return false;
    return this.moduleConstructor(node) === null && this.methodCall(node) === null;
  }

  // __init__ body: declare a self.layer_N module per module node, a TODO comment per
  // unsupported node, and nothing for Input/Output/method nodes. A trailing `pass`
  // keeps the body a valid statement block when no module is declared.
  generateInit(): string {
    let body = '';
    let hasStatement = false;
    this.list.forEach((node) => {
      if (this.isModuleNode(node)) {
        body += `    self.${this.nodeName(node)} = ${this.moduleConstructor(node)}\n`;
        hasStatement = true;
      } else if (this.isUnsupportedNode(node)) {
        body += `    # TODO: unsupported layer ${quoteString(this.graph[node]!.keras_data!.name)}\n`;
      }
    });
    if (!hasStatement) body += '    pass\n';
    return `  def __init__(self):\n${body}`;
  }

  // Sequential __call__(): a single running tensor `x` chained through each node.
  generateSequentialForward(): string {
    let rs = '  def __call__(self, x):\n';
    this.list.forEach((node) => {
      const { name } = this.graph[node]!.keras_data!;
      if (name === 'Input' || name === 'Output') return;
      if (this.isModuleNode(node)) {
        rs += `    x = self.${this.nodeName(node)}(x)${this.moduleActivationSuffix(node)}\n`;
      } else if (this.isMethodNode(node)) {
        rs += `    x = x${this.methodCall(node)}\n`;
      } else if (this.isUnsupportedNode(node)) {
        rs += `    x = x  # TODO: unsupported layer ${quoteString(name)}\n`;
      }
    });
    rs += '    return x\n';
    return rs;
  }

  // Return the __call__ expression that produces a node's output from its source vars.
  forwardExpression(node: NnvpLayerId): string {
    const { name } = this.graph[node]!.keras_data!;
    const sources = this.graph[node]!.sources.map(s => this.nodeName(s));
    if (this.isModuleNode(node)) {
      return `self.${this.nodeName(node)}(${sources.join(', ')})${this.moduleActivationSuffix(node)}`;
    }
    if (this.isMethodNode(node)) {
      return `${sources[0]}${this.methodCall(node)}`;
    }
    // Unsupported: pass the (first) input through unchanged with a TODO marker.
    return `${sources[0]}  # TODO: unsupported layer ${quoteString(name)}`;
  }

  // Functional __call__(): one named variable per node, wired by dataflow.
  // Single input model -> __call__(self, x); multi-input -> __call__(self, input_a, ...).
  generateFunctionalForward(): string {
    const single = this.inputs.length <= 1;
    const args = single ? 'x' : this.inputs.map(i => this.nodeName(i)).join(', ');
    let rs = `  def __call__(self, ${args}):\n`;
    if (single && this.inputs.length === 1) {
      rs += `    ${this.nodeName(this.inputs[0]!)} = x\n`;
    }
    this.list.forEach((node) => {
      const { name } = this.graph[node]!.keras_data!;
      if (name === 'Input' || name === 'Output') return;
      rs += `    ${this.nodeName(node)} = ${this.forwardExpression(node)}\n`;
    });
    const returned = this.outputs.map(o => this.nodeName(this.graph[o]!.sources[0]!));
    rs += `    return ${returned.length === 1 ? returned[0] : `(${returned.join(', ')})`}\n`;
    return rs;
  }

  generateSequential(): string {
    let rs = 'from tinygrad import Tensor, nn\n';
    rs += '\n\n';
    rs += 'class Model:\n';
    rs += this.generateInit();
    rs += '\n';
    rs += this.generateSequentialForward();
    return rs;
  }

  generateFunctional(): string {
    let rs = 'from tinygrad import Tensor, nn\n';
    rs += '\n\n';
    rs += 'class Model:\n';
    rs += this.generateInit();
    rs += '\n';
    rs += this.generateFunctionalForward();
    return rs;
  }

  generate(sequential?: boolean): string {
    sequential = sequential === undefined ? this.sequential : sequential;
    return sequential ? this.generateSequential() : this.generateFunctional();
  }
}
