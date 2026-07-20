/**
 * Keras code generation (pure functions over a graph JSON). Migrated from
 * tests/unit/KerasGenerator.test.js into the dual registry as logicTest.
 */
import { logicTest } from '../harness/define';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import type { GeneratorGraph } from '../../src/lib/KerasInterface/KerasGenerator';
import KerasGeneratorPythonHelper from '../../src/lib/KerasInterface/KerasGeneratorPythonHelper';
import KerasGeneratorJavascriptHelper from '../../src/lib/KerasInterface/KerasGeneratorJavascriptHelper';
import type {
  NnvpLayer, NnvpLayerId, NnvpModel, ParameterDef, ParameterValue,
} from '../../src/types/model';

// --- Fixture builders -------------------------------------------------------
// The generator mutates the layer objects it is given (addLayerToResult deletes
// `kerasLayer` off d3_data), so every fixture MUST be produced fresh from a
// function and never shared between two KerasGenerator instances.

// The fixtures are intentionally MINIMAL: only the fields the generator reads
// (no class/htmlID/parentID, no searchTerms/customUserLayer on the kerasLayer,
// no edges on the model), hence the `as unknown as` casts up to the persisted
// types.

interface LeafOptions {
  params?: Record<string, ParameterValue>;
  def?: Record<string, ParameterDef>;
  inputLayers?: NnvpLayerId[];
  outputLayers?: NnvpLayerId[];
}

function leaf(id: NnvpLayerId, name: string, {
  params = {}, def = {}, inputLayers = [], outputLayers = [],
}: LeafOptions = {}): NnvpLayer {
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
  } as unknown as NnvpLayer;
}

// A composite (non-leaf) layer: `children` holds the real leaves and must be
// flattened away by addLayerToResult.
function composite(id: NnvpLayerId, children: NnvpLayer[]): NnvpLayer {
  return {
    id, x: 0, y: 0, name: 'Composite', inputLayers: [], outputLayers: [], children,
    kerasLayer: null,
  } as unknown as NnvpLayer;
}

// Linear model: Input(1) -> Flatten(2) -> Dense(3) -> Output(4)
function sequentialJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: ['4'],
    layers: [
      leaf('1', 'Input', { params: { shape: [100, 100] }, outputLayers: ['2'] }),
      leaf('2', 'Flatten', { inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'Output', { inputLayers: ['3'] }),
    ],
  } as unknown as NnvpModel;
}

// Branching functional model:
// Input(1) -> Dense(2) -\
//          -> Dense(3) --> Concatenate(4) -> Output(5)
function functionalJson(): NnvpModel {
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
  } as unknown as NnvpModel;
}

// Two inputs merged into one output (multi-input, used for bug #2).
function multiInputJson(): NnvpModel {
  return {
    inputs: ['a', 'b'],
    outputs: ['o'],
    layers: [
      leaf('a', 'Input', { params: { shape: [4] }, outputLayers: ['m'] }),
      leaf('b', 'Input', { params: { shape: [4] }, outputLayers: ['m'] }),
      leaf('m', 'Concatenate', { inputLayers: ['a', 'b'], outputLayers: ['o'] }),
      leaf('o', 'Output', { inputLayers: ['m'] }),
    ],
  } as unknown as NnvpModel;
}

// Cyclic graph: Input(1) -> A(2) -> B(3), and B loops back to A.
// Without a cycle guard, createTreatmentList recurses forever.
function cyclicJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2'] }),
      // node 2 lists node 1 AND node 3 as sources -> node 3 targets node 2 again
      leaf('2', 'A', { inputLayers: ['1', '3'], outputLayers: ['3'] }),
      leaf('3', 'B', { inputLayers: ['2'], outputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
}

// A self-referential cycle where the loop node IS reachable and gets treated,
// then its target points back at an already-treated ancestor. This is the
// classic infinite-recursion trigger.
function backEdgeCycleJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      // Input has no sources so it always gets treated, then loops A -> A's
      // target is Input again.
      leaf('1', 'Input', { outputLayers: ['2'] }),
      leaf('2', 'A', { inputLayers: ['1'], outputLayers: ['1'] }),
    ],
  } as unknown as NnvpModel;
}

// ---------------------------------------------------------------------------

// --- jsonToGraph / addLayerToResult ------------------------------------------

logicTest('kerasGenerator: jsonToGraph builds a graph keyed by node id with sources/targets/keras_data', ({ expect }) => {
  const gen = new KerasGenerator(sequentialJson(), false);
  expect(Object.keys(gen.graph).sort()).toEqual(['1', '2', '3', '4']);
  expect(gen.graph['1']!.sources).toEqual([]);
  expect(gen.graph['1']!.targets).toEqual(['2']);
  expect(gen.graph['1']!.keras_data!.name).toBe('Input');
  expect(gen.graph['2']!.sources).toEqual(['1']);
  expect(gen.graph['2']!.targets).toEqual(['3']);
  // keras_data is lifted off the layer, and d3_data no longer carries it.
  expect(gen.graph['2']!.keras_data).toBeTruthy();
  expect(gen.graph['2']!.d3_data!.kerasLayer).toBeUndefined();
  expect(gen.graph['2']!.treated).toBe(true);
});

logicTest('kerasGenerator: jsonToGraph flattens nested children (composite layers) into individual nodes', ({ expect }) => {
  const json = {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2'] }),
      composite('comp', [
        leaf('2', 'Dense', { inputLayers: ['1'], outputLayers: ['3'] }),
        leaf('3', 'Output', { inputLayers: ['2'] }),
      ]),
    ],
  } as unknown as NnvpModel;
  const gen = new KerasGenerator(json, false);
  // The composite id must NOT appear; only its leaves do.
  expect(Object.keys(gen.graph).sort()).toEqual(['1', '2', '3']);
  expect(gen.graph.comp).toBeUndefined();
  expect(gen.graph['2']!.keras_data!.name).toBe('Dense');
});

// --- findInputs / findOutputs -------------------------------------------------

logicTest('kerasGenerator: findInputs/findOutputs read inputs and outputs straight from the json', ({ expect }) => {
  const gen = new KerasGenerator(multiInputJson(), false);
  expect(gen.inputs).toEqual(['a', 'b']);
  expect(gen.outputs).toEqual(['o']);
});

// --- createTreatmentList (topological order) -----------------------------------

logicTest('kerasGenerator: createTreatmentList orders a linear chain from input to output', ({ expect }) => {
  const gen = new KerasGenerator(sequentialJson(), false);
  expect(gen.list).toEqual(['1', '2', '3', '4']);
});

logicTest('kerasGenerator: createTreatmentList adds a node only after every source has been added (branching graph)', ({ expect }) => {
  const gen = new KerasGenerator(functionalJson(), false);
  const idx = (id: NnvpLayerId): number => gen.list.indexOf(id);
  // The merge node (4) must come after both of its sources (2 and 3).
  expect(idx('4')).toBeGreaterThan(idx('2'));
  expect(idx('4')).toBeGreaterThan(idx('3'));
  // Output after the merge.
  expect(idx('5')).toBeGreaterThan(idx('4'));
  // No node is listed twice.
  expect(new Set(gen.list).size).toBe(gen.list.length);
  expect(gen.list.sort()).toEqual(['1', '2', '3', '4', '5']);
});

logicTest('kerasGenerator: createTreatmentList does not duplicate a node reachable through several paths', ({ expect }) => {
  // Input -> B, Input -> C(sources B & Input) : C is a target of Input AND B.
  const json = {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2', '3'] }),
      leaf('2', 'Dense', { inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { inputLayers: ['1', '2'] }),
    ],
  } as unknown as NnvpModel;
  const gen = new KerasGenerator(json, false);
  expect(gen.list.filter(id => id === '3').length).toBe(1);
  expect(gen.list).toEqual(['1', '2', '3']);
});

logicTest('kerasGenerator: createTreatmentList terminates on a cyclic graph instead of recursing forever (bug #1)', ({ expect }) => {
  // If this hangs / stack-overflows the test run fails; the guard makes it
  // finish. The unreachable-through-a-cycle node simply is not listed.
  const gen = new KerasGenerator(cyclicJson(), false);
  expect(gen.list).toEqual(['1']);
});

logicTest('kerasGenerator: createTreatmentList terminates on a back-edge cycle to an already-treated ancestor (bug #1)', ({ expect }) => {
  const gen = new KerasGenerator(backEdgeCycleJson(), false);
  // 1 has no sources -> treated; 2's only source (1) is treated -> treated;
  // 2's target loops to 1 which is already treated -> guard stops recursion.
  expect(gen.list).toEqual(['1', '2']);
  expect(new Set(gen.list).size).toBe(gen.list.length);
});

// --- isSequential ----------------------------------------------------------------

logicTest('kerasGenerator: isSequential is true for a single linear Input->...->Output chain', ({ expect }) => {
  const gen = new KerasGenerator(sequentialJson(), false);
  expect(gen.sequential).toBe(true);
});

logicTest('kerasGenerator: isSequential is false for a branching (functional) graph', ({ expect }) => {
  const gen = new KerasGenerator(functionalJson(), false);
  expect(gen.sequential).toBe(false);
});

logicTest('kerasGenerator: isSequential is false for a multi-input graph', ({ expect }) => {
  const gen = new KerasGenerator(multiInputJson(), false);
  expect(gen.sequential).toBe(false);
});

// --- Python: generateParams -------------------------------------------------------

const pythonHelper = () => new KerasGeneratorPythonHelper({}, [], [], [], false);

logicTest('kerasGenerator: Python generateParams quotes strings, maps booleans to True/False, arrays to tuples', ({ expect }) => {
  const params: Record<string, ParameterValue> = {
    activation: 'relu', use_bias: true, trainable: false, units: 32, kernel_size: [3, 3],
  };
  expect(pythonHelper().generateParams(params, {})).toBe(
    'activation="relu",use_bias=True,trainable=False,units=32,kernel_size=(3,3,),',
  );
});

logicTest('kerasGenerator: Python generateParams nests tuples for nested arrays', ({ expect }) => {
  // Nested arrays are beyond the declared ParameterValue union but the
  // generator handles them recursively — that recursion is what's under test.
  const params = { strides: [[1, 2], [3, 4]] } as unknown as Record<string, ParameterValue>;
  expect(pythonHelper().generateParams(params, {})).toBe(
    'strides=((1,2,),(3,4,),),',
  );
});

logicTest('kerasGenerator: Python generateParams skips parameters flagged skipInGeneration', ({ expect }) => {
  const params: Record<string, ParameterValue> = { units: 8, name: 'ignored' };
  // GeneratorParamDef escape hatch without a `type` — intentionally partial.
  const def = { name: { skipInGeneration: true } } as unknown as Record<string, ParameterDef>;
  expect(pythonHelper().generateParams(params, def)).toBe('units=8,');
});

// --- Python: full generation --------------------------------------------------------

logicTest('kerasGenerator: Python generates a Sequential model for a linear chain', ({ expect }) => {
  const code = new KerasGenerator(sequentialJson(), false).generatePythonFromGraph();
  expect(code).toBe(
    'import keras\n'
    + '\n'
    + 'def build_model():\n'
    + '    model = keras.models.Sequential()\n'
    + '    model.add(keras.layers.Flatten(input_shape = (100,100,)))\n'
    + '    model.add(keras.layers.Dense())\n'
    + '    return model\n',
  );
});

logicTest('kerasGenerator: Python generates a functional model for a branching graph', ({ expect }) => {
  const code = new KerasGenerator(functionalJson(), false).generatePythonFromGraph();
  expect(code).toBe(
    'import keras\n'
    + '\n'
    + 'def build_model():\n'
    + '    input_1 = keras.layers.Input(shape=(10,))\n'
    + '    layer_2 = keras.layers.Dense(units=4)(input_1)\n'
    + '    layer_3 = keras.layers.Dense(units=4)(input_1)\n'
    + '    layer_4 = keras.layers.Concatenate()([layer_2,layer_3])\n'
    + '    model = keras.models.Model(inputs=input_1, outputs=output_5)\n'
    + '    return model\n',
  );
});

// --- Python: generateModelFunction multi-input (bug #2) --------------------------------

logicTest('kerasGenerator: Python emits the bracketed multi-input line AND does not mutate this.inputs', ({ expect }) => {
  const graph = {
    a: { keras_data: { name: 'Input' } },
    b: { keras_data: { name: 'Input' } },
    o: { keras_data: { name: 'Output' } },
  } as unknown as GeneratorGraph;
  const inputs: NnvpLayerId[] = ['a', 'b'];
  const helper = new KerasGeneratorPythonHelper(graph, inputs, ['o'], [], false);
  const line = helper.generateModelFunction();
  expect(line).toBe('model = keras.models.Model(inputs=[input_a, input_b], outputs=output_o)\n');
  // The destructive splice bug would have shortened inputs to ['a'].
  expect(helper.inputs).toEqual(['a', 'b']);
  expect(inputs).toEqual(['a', 'b']);
  // Idempotent: calling again yields the same line.
  expect(helper.generateModelFunction()).toBe(line);
});

// --- JavaScript: name conversion -----------------------------------------------------

const jsHelper = () => new KerasGeneratorJavascriptHelper({}, [], [], [], false);

logicTest('kerasGenerator: pythonToJsLayerName lowercases the head and the trailing dimension', ({ expect }) => {
  const h = jsHelper();
  expect(h.pythonToJsLayerName('Dense')).toBe('dense');
  expect(h.pythonToJsLayerName('Conv2D')).toBe('conv2d');
  expect(h.pythonToJsLayerName('MaxPooling2D')).toBe('maxPooling2d');
  expect(h.pythonToJsLayerName('Input')).toBe('input');
});

logicTest('kerasGenerator: pythonToJsParamName converts snake_case to camelCase', ({ expect }) => {
  const h = jsHelper();
  expect(h.pythonToJsParamName('kernel_size')).toBe('kernelSize');
  expect(h.pythonToJsParamName('use_bias')).toBe('useBias');
  expect(h.pythonToJsParamName('units')).toBe('units');
});

// --- JavaScript: generateParams -------------------------------------------------------

logicTest('kerasGenerator: JS generateParams quotes strings, maps booleans, arrays to JS arrays with camelCase keys', ({ expect }) => {
  const params: Record<string, ParameterValue> = { use_bias: true, units: 32, kernel_size: [3, 3] };
  expect(jsHelper().generateParams(params, {})).toBe('{useBias:true,units:32,kernelSize:[3,3,],}');
});

logicTest('kerasGenerator: JS generateParams collapses a single-element convertToNumber array to a quoted scalar', ({ expect }) => {
  const params: Record<string, ParameterValue> = { pool_size: [2] };
  // GeneratorParamDef escape hatches without a `type` — intentionally partial.
  const def = { pool_size: { convertToNumber: true, value: [2] } } as
    unknown as Record<string, ParameterDef>;
  expect(jsHelper().generateParams(params, def)).toBe('{poolSize:"2",}');
});

logicTest('kerasGenerator: JS generateParams keeps a multi-element convertToNumber array as an array', ({ expect }) => {
  const params: Record<string, ParameterValue> = { pool_size: [2, 2] };
  const def = { pool_size: { convertToNumber: true, value: [2, 2] } } as
    unknown as Record<string, ParameterDef>;
  expect(jsHelper().generateParams(params, def)).toBe('{poolSize:[2,2,],}');
});

// --- JavaScript: full generation -------------------------------------------------------

logicTest('kerasGenerator: JS generates a tf.sequential() model for a linear chain', ({ expect }) => {
  const code = new KerasGenerator(sequentialJson(), true).generateJavascriptFromGraph();
  expect(code).toBe(
    'function createModel() {\n'
    + '    const model = tf.sequential();\n'
    + '    model.add(tf.layers.flatten({inputShape:[100,100,],}));\n'
    + '    model.add(tf.layers.dense({}));\n'
    + '    return model;\n'
    + '}\n',
  );
});

logicTest('kerasGenerator: JS wires functional graphs with .apply(...) in topological order', ({ expect }) => {
  const code = new KerasGenerator(functionalJson(), true).generateJavascriptFromGraph();
  expect(code).toBe(
    'function createModel() {\n'
    + '    const input_1 = tf.layers.input({shape:[10,],})\n'
    + '    const layer_2 = tf.layers.dense({units:4,}).apply(input_1);\n'
    + '    const layer_3 = tf.layers.dense({units:4,}).apply(input_1);\n'
    + '    const layer_4 = tf.layers.concatenate({}).apply([layer_2,layer_3]);\n'
    + '    const model = tf.model({inputs:input_1, outputs:output_5});\n'
    + '    return model;\n'
    + '}\n',
  );
});

logicTest('kerasGenerator: JS emits a bracketed multi-input tf.model({inputs:[...]}) line', ({ expect }) => {
  const graph = {
    a: { keras_data: { name: 'Input' } },
    b: { keras_data: { name: 'Input' } },
    o: { keras_data: { name: 'Output' } },
  } as unknown as GeneratorGraph;
  const inputs: NnvpLayerId[] = ['a', 'b'];
  const helper = new KerasGeneratorJavascriptHelper(graph, inputs, ['o'], [], false);
  expect(helper.generateModelFunction()).toBe(
    'const model = tf.model({inputs:[input_a, input_b], outputs:output_o});\n',
  );
  expect(helper.inputs).toEqual(['a', 'b']);
});

// --- codegen safety (crafted .nnvp files must not inject code) ---------------------------

// A value that breaks out of a naive '...' string literal in both JS and Python.
const payload = "'});\nglobalThis.__pwned = true;(({q:'";

logicTest('kerasGenerator: JS: a malicious string parameter value stays an inert string literal through eval', ({ expect }) => {
  const json = {
    inputs: ['1'],
    outputs: ['4'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2'] }),
      leaf('2', 'Dense', { params: { activation: payload }, inputLayers: ['1'], outputLayers: ['4'] }),
      leaf('4', 'Output', { inputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  const code = new KerasGenerator(json, false).generateJavascriptFromGraph();
  // Execute the generated code the same way TrainingZone does (Function ~ eval),
  // against a stub tf that records the params each layer factory receives.
  const captured: Record<string, unknown>[] = [];
  const layerFactory = () => (params: Record<string, unknown>) => {
    captured.push(params);
    const out: { apply: () => unknown } = { apply: () => out };
    return out;
  };
  const tf = {
    sequential: () => ({ add: () => {} }),
    model: () => ({}),
    layers: new Proxy({}, { get: layerFactory }),
  };
  delete (globalThis as Record<string, unknown>).__pwned;
  const createModel = new Function('tf', `${code}\nreturn createModel;`)(tf) as () => void;
  createModel();
  expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  // The payload must come through as plain data, not as executed code.
  expect(captured.some(p => p && p.activation === payload)).toBe(true);
});

logicTest('kerasGenerator: Python: a malicious string parameter value is emitted as an escaped literal', ({ expect }) => {
  const generated = new KerasGeneratorPythonHelper({}, [], [], [], false)
    .generateParams({ activation: payload }, {});
  expect(generated).toBe(`activation=${JSON.stringify(payload)},`);
  // No raw newline may survive: it would end the Python expression mid-string.
  expect(generated).not.toContain('\n');
});

logicTest('kerasGenerator: rejects parameter names that are not plain identifiers', ({ expect }) => {
  expect(() => new KerasGeneratorPythonHelper({}, [], [], [], false)
    .generateParams({ 'x=1); import os #': 1 }, {})).toThrow(/Unsafe parameter name/);
  expect(() => new KerasGeneratorJavascriptHelper({}, [], [], [], false)
    .generateParams({ 'a-b': 1 }, {})).toThrow(/Unsafe parameter name/);
});

logicTest('kerasGenerator: rejects node ids that are not safe variable-name suffixes', ({ expect }) => {
  const graph = { 'a b': { keras_data: { name: 'Dense' } } } as unknown as GeneratorGraph;
  expect(() => new KerasGeneratorJavascriptHelper(graph, [], [], [], false)
    .nodeName('a b')).toThrow(/Unsafe node id/);
  expect(() => new KerasGeneratorPythonHelper(graph, [], [], [], false)
    .nodeName('a b')).toThrow(/Unsafe node id/);
});

logicTest('kerasGenerator: rejects layer type names that are not plain identifiers', ({ expect }) => {
  const graph = {
    1: { keras_data: { name: 'Dense()); evil((', parameterValues: {}, parameterDef: {} }, sources: [] },
  } as unknown as GeneratorGraph;
  expect(() => new KerasGeneratorJavascriptHelper(graph, [], [], [], false)
    .generateJavascriptFromNode('1')).toThrow(/Unsafe layer type name/);
  expect(() => new KerasGeneratorPythonHelper(graph, [], [], [], false)
    .generatePythonFromNode('1')).toThrow(/Unsafe layer type name/);
});
