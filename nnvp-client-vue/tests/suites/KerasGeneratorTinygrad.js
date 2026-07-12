/**
 * Tinygrad code generation. Migrated from tests/unit/KerasGeneratorTinygrad.test.js
 * into the dual registry as logicTest.
 */
import { logicTest } from '../harness/define';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import KerasGeneratorTinygradHelper from '../../src/lib/KerasInterface/KerasGeneratorTinygradHelper';

// --- Fixture builders (mirror KerasGeneratorPyTorch.js) -----------------
// KerasGenerator mutates the layer objects it is given, so every fixture MUST be
// produced fresh from a function and never shared between two instances.

function leaf(id, name, {
  params = {}, def = {}, inputLayers = [], outputLayers = [],
} = {}) {
  return {
    id,
    x: 0,
    y: 0,
    name,
    inputLayers,
    outputLayers,
    children: null,
    kerasLayer: {
      name, category: 'test', parameterValues: params, parameterDef: def,
    },
  };
}

// Sequential: Input(1) -> Flatten(2) -> Dense(3,128) -> Dense(4,10) -> Output(5)
function sequentialJson() {
  return {
    inputs: ['1'],
    outputs: ['5'],
    layers: [
      leaf('1', 'Input', { params: { shape: [28, 28] }, outputLayers: ['2'] }),
      leaf('2', 'Flatten', { inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { params: { units: 128 }, inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'Dense', { params: { units: 10 }, inputLayers: ['3'], outputLayers: ['5'] }),
      leaf('5', 'Output', { inputLayers: ['4'] }),
    ],
  };
}

// Sequential CNN mixing module nodes (Conv2D, BatchNormalization, Dense) and Tensor
// method nodes (ReLU, Flatten):
// Input(1) -> Conv2D(2) -> BatchNormalization(3) -> ReLU(4) -> Flatten(5) -> Dense(6) -> Output(7)
function cnnJson() {
  return {
    inputs: ['1'],
    outputs: ['7'],
    layers: [
      leaf('1', 'Input', { params: { shape: [28, 28, 1] }, outputLayers: ['2'] }),
      leaf('2', 'Conv2D', { params: { filters: 16, kernel_size: [3, 3] }, inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'BatchNormalization', { inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'ReLU', { inputLayers: ['3'], outputLayers: ['5'] }),
      leaf('5', 'Flatten', { inputLayers: ['4'], outputLayers: ['6'] }),
      leaf('6', 'Dense', { params: { units: 10 }, inputLayers: ['5'], outputLayers: ['7'] }),
      leaf('7', 'Output', { inputLayers: ['6'] }),
    ],
  };
}

// Branching functional:
// Input(1) -> Dense(2,4) -\
//          -> Dense(3,4) --> Concatenate(4) -> Output(5)
// tinygrad only maps the listed layers, so the merge falls to a TODO placeholder.
function functionalJson() {
  return {
    inputs: ['1'],
    outputs: ['5'],
    layers: [
      leaf('1', 'Input', { params: { shape: [10] }, outputLayers: ['2', '3'] }),
      leaf('2', 'Dense', { params: { units: 4 }, inputLayers: ['1'], outputLayers: ['4'] }),
      leaf('3', 'Dense', { params: { units: 4 }, inputLayers: ['1'], outputLayers: ['4'] }),
      leaf('4', 'Concatenate', { inputLayers: ['2', '3'], outputLayers: ['5'] }),
      leaf('5', 'Output', { inputLayers: ['4'] }),
    ],
  };
}

// MNIST-style MLP with a 3D input: Input(1, [28,28,1]) -> Flatten(2) -> Dense(3,128)
// -> Dense(4,10) -> Output(5). The full Input shape is known, so Flatten's product
// (784) and the chained Dense in_features (128) must both be inferred.
function mnistMlpJson() {
  return {
    inputs: ['1'],
    outputs: ['5'],
    layers: [
      leaf('1', 'Input', { params: { shape: [28, 28, 1] }, outputLayers: ['2'] }),
      leaf('2', 'Flatten', { inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { params: { units: 128 }, inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'Dense', { params: { units: 10 }, inputLayers: ['3'], outputLayers: ['5'] }),
      leaf('5', 'Output', { inputLayers: ['4'] }),
    ],
  };
}

// A layer NNVP does not know how to map to tinygrad -> TODO placeholder.
// Input(1) -> GaussianNoise(2) -> Output(3) (still a linear chain -> sequential path).
function unsupportedJson() {
  return {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { params: { shape: [10] }, outputLayers: ['2'] }),
      leaf('2', 'GaussianNoise', { params: { stddev: 0.1 }, inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Output', { inputLayers: ['2'] }),
    ],
  };
}

// ---------------------------------------------------------------------------

// --- Tinygrad: full generation --------------------------------------------------

logicTest('kerasGeneratorTinygrad: generates a Model class for a sequential chain', ({ expect }) => {
  const code = new KerasGenerator(sequentialJson()).generateTinygradFromGraph();
  expect(code).toBe(
    'from tinygrad import Tensor, nn\n'
    + '\n'
    + '\n'
    + 'class Model:\n'
    + '  def __init__(self):\n'
    + '    self.layer_3 = nn.Linear(784, 128)\n'
    + '    self.layer_4 = nn.Linear(128, 10)\n'
    + '\n'
    + '  def __call__(self, x):\n'
    + '    x = x.flatten(1)\n'
    + '    x = self.layer_3(x)\n'
    + '    x = self.layer_4(x)\n'
    + '    return x\n',
  );
});

logicTest('kerasGeneratorTinygrad: mixes module layers and Tensor-method layers in one sequential CNN', ({ expect }) => {
  const code = new KerasGenerator(cnnJson()).generateTinygradFromGraph();
  expect(code).toBe(
    'from tinygrad import Tensor, nn\n'
    + '\n'
    + '\n'
    + 'class Model:\n'
    + '  def __init__(self):\n'
    + '    self.layer_2 = nn.Conv2d(1, 16, (3,3,))\n'
    + '    self.layer_3 = nn.BatchNorm2d(16)\n'
    // Flatten after a Conv2D: spatial arithmetic is not attempted, so the Dense
    // in_features is not inferable -> out-dim fallback with a loud TODO.
    + '    self.layer_6 = nn.Linear(10, 10)  # TODO: set in_features (could not infer from graph)\n'
    + '\n'
    + '  def __call__(self, x):\n'
    + '    x = self.layer_2(x)\n'
    + '    x = self.layer_3(x)\n'
    + '    x = x.relu()\n'
    + '    x = x.flatten(1)\n'
    + '    x = self.layer_6(x)\n'
    + '    return x\n',
  );
});

logicTest('kerasGeneratorTinygrad: wires a branching functional graph through __call__ dataflow', ({ expect }) => {
  const code = new KerasGenerator(functionalJson()).generateTinygradFromGraph();
  expect(code).toBe(
    'from tinygrad import Tensor, nn\n'
    + '\n'
    + '\n'
    + 'class Model:\n'
    + '  def __init__(self):\n'
    + '    self.layer_2 = nn.Linear(10, 4)\n'
    + '    self.layer_3 = nn.Linear(10, 4)\n'
    + '    # TODO: unsupported layer "Concatenate"\n'
    + '\n'
    + '  def __call__(self, x):\n'
    + '    input_1 = x\n'
    + '    layer_2 = self.layer_2(input_1)\n'
    + '    layer_3 = self.layer_3(input_1)\n'
    + '    layer_4 = layer_2  # TODO: unsupported layer "Concatenate"\n'
    + '    return layer_4\n',
  );
});

logicTest('kerasGeneratorTinygrad: emits a clearly-marked TODO placeholder for an unsupported layer', ({ expect }) => {
  const code = new KerasGenerator(unsupportedJson()).generateTinygradFromGraph();
  expect(code).toBe(
    'from tinygrad import Tensor, nn\n'
    + '\n'
    + '\n'
    + 'class Model:\n'
    + '  def __init__(self):\n'
    + '    # TODO: unsupported layer "GaussianNoise"\n'
    + '    pass\n'
    + '\n'
    + '  def __call__(self, x):\n'
    + '    x = x  # TODO: unsupported layer "GaussianNoise"\n'
    + '    return x\n',
  );
  // The placeholder must not silently emit wrong tinygrad code.
  expect(code).not.toContain('nn.GaussianNoise');
});

logicTest('kerasGeneratorTinygrad: infers Flatten product and chained Dense in_features from the Input shape', ({ expect }) => {
  const code = new KerasGenerator(mnistMlpJson()).generateTinygradFromGraph();
  expect(code).toBe(
    'from tinygrad import Tensor, nn\n'
    + '\n'
    + '\n'
    + 'class Model:\n'
    + '  def __init__(self):\n'
    + '    self.layer_3 = nn.Linear(784, 128)\n'
    + '    self.layer_4 = nn.Linear(128, 10)\n'
    + '\n'
    + '  def __call__(self, x):\n'
    + '    x = x.flatten(1)\n'
    + '    x = self.layer_3(x)\n'
    + '    x = self.layer_4(x)\n'
    + '    return x\n',
  );
  // Fully inferred dims must not leave any TODO marker behind.
  expect(code).not.toContain('TODO');
});

// --- Tinygrad: layer -> tinygrad mapping -----------------------------------------

const helper = () => new KerasGeneratorTinygradHelper({}, [], [], [], false);
const ctor = (name, params = {}) => {
  const graph = { n: { keras_data: { name, parameterValues: params } } };
  return new KerasGeneratorTinygradHelper(graph, [], [], [], false).moduleConstructor('n');
};
const method = (name, params = {}) => {
  const graph = { n: { keras_data: { name, parameterValues: params } } };
  return new KerasGeneratorTinygradHelper(graph, [], [], [], false).methodCall('n');
};

logicTest('kerasGeneratorTinygrad: maps module layers, falling back to the out-dim + loud TODO without a graph', ({ expect }) => {
  // Bare nodes (no graph context) have no inferable in-dim -> loud TODO fallback.
  expect(ctor('Dense', { units: 32 })).toBe(
    'nn.Linear(32, 32)  # TODO: set in_features (could not infer from graph)',
  );
  expect(ctor('Conv2D', { filters: 16, kernel_size: [3, 3] })).toBe(
    'nn.Conv2d(16, 16, (3,3,))  # TODO: set in_channels (could not infer from graph)',
  );
  expect(ctor('BatchNormalization')).toBe(
    'nn.BatchNorm2d(1)  # TODO: set num_features (could not infer from graph)',
  );
});

logicTest('kerasGeneratorTinygrad: maps Flatten and activations to Tensor methods', ({ expect }) => {
  expect(method('Flatten')).toBe('.flatten(1)');
  expect(method('Activation', { activation: 'relu' })).toBe('.relu()');
  expect(method('Activation', { activation: 'softmax' })).toBe('.softmax()');
  expect(method('Sigmoid')).toBe('.sigmoid()');
  expect(method('Tanh')).toBe('.tanh()');
});

logicTest('kerasGeneratorTinygrad: maps an activation name directly to its Tensor method suffix', ({ expect }) => {
  expect(helper().activationMethod('gelu')).toBe('.gelu()');
  expect(helper().activationMethod('leaky_relu')).toBe('.leakyrelu()');
});

logicTest('kerasGeneratorTinygrad: returns null (-> TODO) for an unmapped layer or unknown activation', ({ expect }) => {
  expect(ctor('GaussianNoise', { stddev: 0.1 })).toBeNull();
  expect(method('GaussianNoise', { stddev: 0.1 })).toBeNull();
  expect(method('Activation', { activation: 'mish' })).toBeNull();
});
