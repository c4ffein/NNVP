import { describe, it, expect } from 'bun:test';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import KerasGeneratorPythonHelper from '../../src/lib/KerasInterface/KerasGeneratorPythonHelper';
import KerasGeneratorJavascriptHelper from '../../src/lib/KerasInterface/KerasGeneratorJavascriptHelper';

// --- Fixture builders -------------------------------------------------------
// The generator mutates the layer objects it is given (addLayerToResult deletes
// `kerasLayer` off d3_data), so every fixture MUST be produced fresh from a
// function and never shared between two KerasGenerator instances.

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

// A composite (non-leaf) layer: `children` holds the real leaves and must be
// flattened away by addLayerToResult.
function composite(id, children) {
  return {
    id, x: 0, y: 0, name: 'Composite', inputLayers: [], outputLayers: [], children,
    kerasLayer: null,
  };
}

// Linear model: Input(1) -> Flatten(2) -> Dense(3) -> Output(4)
function sequentialJson() {
  return {
    inputs: ['1'],
    outputs: ['4'],
    layers: [
      leaf('1', 'Input', { params: { shape: [100, 100] }, outputLayers: ['2'] }),
      leaf('2', 'Flatten', { inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { inputLayers: ['2'], outputLayers: ['4'] }),
      leaf('4', 'Output', { inputLayers: ['3'] }),
    ],
  };
}

// Branching functional model:
// Input(1) -> Dense(2) -\
//          -> Dense(3) --> Concatenate(4) -> Output(5)
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

// Two inputs merged into one output (multi-input, used for bug #2).
function multiInputJson() {
  return {
    inputs: ['a', 'b'],
    outputs: ['o'],
    layers: [
      leaf('a', 'Input', { params: { shape: [4] }, outputLayers: ['m'] }),
      leaf('b', 'Input', { params: { shape: [4] }, outputLayers: ['m'] }),
      leaf('m', 'Concatenate', { inputLayers: ['a', 'b'], outputLayers: ['o'] }),
      leaf('o', 'Output', { inputLayers: ['m'] }),
    ],
  };
}

// Cyclic graph: Input(1) -> A(2) -> B(3), and B loops back to A.
// Without a cycle guard, createTreatmentList recurses forever.
function cyclicJson() {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2'] }),
      // node 2 lists node 1 AND node 3 as sources -> node 3 targets node 2 again
      leaf('2', 'A', { inputLayers: ['1', '3'], outputLayers: ['3'] }),
      leaf('3', 'B', { inputLayers: ['2'], outputLayers: ['2'] }),
    ],
  };
}

// A self-referential cycle where the loop node IS reachable and gets treated,
// then its target points back at an already-treated ancestor. This is the
// classic infinite-recursion trigger.
function backEdgeCycleJson() {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      // Input has no sources so it always gets treated, then loops A -> A's
      // target is Input again.
      leaf('1', 'Input', { outputLayers: ['2'] }),
      leaf('2', 'A', { inputLayers: ['1'], outputLayers: ['1'] }),
    ],
  };
}

// ---------------------------------------------------------------------------

describe('jsonToGraph / addLayerToResult', () => {
  it('builds a graph keyed by node id with sources/targets/keras_data', () => {
    const gen = new KerasGenerator(sequentialJson(), false);
    expect(Object.keys(gen.graph).sort()).toEqual(['1', '2', '3', '4']);
    expect(gen.graph['1'].sources).toEqual([]);
    expect(gen.graph['1'].targets).toEqual(['2']);
    expect(gen.graph['1'].keras_data.name).toBe('Input');
    expect(gen.graph['2'].sources).toEqual(['1']);
    expect(gen.graph['2'].targets).toEqual(['3']);
    // keras_data is lifted off the layer, and d3_data no longer carries it.
    expect(gen.graph['2'].keras_data).toBeTruthy();
    expect(gen.graph['2'].d3_data.kerasLayer).toBeUndefined();
    expect(gen.graph['2'].treated).toBe(true);
  });

  it('flattens nested children (composite layers) into individual nodes', () => {
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
    };
    const gen = new KerasGenerator(json, false);
    // The composite id must NOT appear; only its leaves do.
    expect(Object.keys(gen.graph).sort()).toEqual(['1', '2', '3']);
    expect(gen.graph.comp).toBeUndefined();
    expect(gen.graph['2'].keras_data.name).toBe('Dense');
  });
});

describe('findInputs / findOutputs', () => {
  it('reads inputs and outputs straight from the json', () => {
    const gen = new KerasGenerator(multiInputJson(), false);
    expect(gen.inputs).toEqual(['a', 'b']);
    expect(gen.outputs).toEqual(['o']);
  });
});

describe('createTreatmentList (topological order)', () => {
  it('orders a linear chain from input to output', () => {
    const gen = new KerasGenerator(sequentialJson(), false);
    expect(gen.list).toEqual(['1', '2', '3', '4']);
  });

  it('adds a node only after every source has been added (branching graph)', () => {
    const gen = new KerasGenerator(functionalJson(), false);
    const idx = id => gen.list.indexOf(id);
    // The merge node (4) must come after both of its sources (2 and 3).
    expect(idx('4')).toBeGreaterThan(idx('2'));
    expect(idx('4')).toBeGreaterThan(idx('3'));
    // Output after the merge.
    expect(idx('5')).toBeGreaterThan(idx('4'));
    // No node is listed twice.
    expect(new Set(gen.list).size).toBe(gen.list.length);
    expect(gen.list.sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('does not duplicate a node reachable through several paths', () => {
    // Input -> B, Input -> C(sources B & Input) : C is a target of Input AND B.
    const json = {
      inputs: ['1'],
      outputs: ['3'],
      layers: [
        leaf('1', 'Input', { outputLayers: ['2', '3'] }),
        leaf('2', 'Dense', { inputLayers: ['1'], outputLayers: ['3'] }),
        leaf('3', 'Dense', { inputLayers: ['1', '2'] }),
      ],
    };
    const gen = new KerasGenerator(json, false);
    expect(gen.list.filter(id => id === '3').length).toBe(1);
    expect(gen.list).toEqual(['1', '2', '3']);
  });

  it('terminates on a cyclic graph instead of recursing forever (bug #1)', () => {
    // If this hangs / stack-overflows the test run fails; the guard makes it
    // finish. The unreachable-through-a-cycle node simply is not listed.
    const gen = new KerasGenerator(cyclicJson(), false);
    expect(gen.list).toEqual(['1']);
  });

  it('terminates on a back-edge cycle to an already-treated ancestor (bug #1)', () => {
    const gen = new KerasGenerator(backEdgeCycleJson(), false);
    // 1 has no sources -> treated; 2's only source (1) is treated -> treated;
    // 2's target loops to 1 which is already treated -> guard stops recursion.
    expect(gen.list).toEqual(['1', '2']);
    expect(new Set(gen.list).size).toBe(gen.list.length);
  });
});

describe('isSequential', () => {
  it('is true for a single linear Input->...->Output chain', () => {
    const gen = new KerasGenerator(sequentialJson(), false);
    expect(gen.sequential).toBe(true);
  });

  it('is false for a branching (functional) graph', () => {
    const gen = new KerasGenerator(functionalJson(), false);
    expect(gen.sequential).toBe(false);
  });

  it('is false for a multi-input graph', () => {
    const gen = new KerasGenerator(multiInputJson(), false);
    expect(gen.sequential).toBe(false);
  });
});

describe('Python: generateParams', () => {
  const helper = () => new KerasGeneratorPythonHelper({}, [], [], [], false);

  it('quotes strings, maps booleans to True/False, arrays to tuples', () => {
    const params = {
      activation: 'relu', use_bias: true, trainable: false, units: 32, kernel_size: [3, 3],
    };
    expect(helper().generateParams(params, {})).toBe(
      "activation='relu',use_bias=True,trainable=False,units=32,kernel_size=(3,3,),",
    );
  });

  it('nests tuples for nested arrays', () => {
    expect(helper().generateParams({ strides: [[1, 2], [3, 4]] }, {})).toBe(
      'strides=((1,2,),(3,4,),),',
    );
  });

  it('skips parameters flagged skipInGeneration', () => {
    const params = { units: 8, name: 'ignored' };
    const def = { name: { skipInGeneration: true } };
    expect(helper().generateParams(params, def)).toBe('units=8,');
  });
});

describe('Python: full generation', () => {
  it('generates a Sequential model for a linear chain', () => {
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

  it('generates a functional model for a branching graph', () => {
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
});

describe('Python: generateModelFunction multi-input (bug #2)', () => {
  it('emits the bracketed multi-input line AND does not mutate this.inputs', () => {
    const graph = {
      a: { keras_data: { name: 'Input' } },
      b: { keras_data: { name: 'Input' } },
      o: { keras_data: { name: 'Output' } },
    };
    const inputs = ['a', 'b'];
    const helper = new KerasGeneratorPythonHelper(graph, inputs, ['o'], [], false);
    const line = helper.generateModelFunction();
    expect(line).toBe('model = keras.models.Model(inputs=[input_a, input_b], outputs=output_o)\n');
    // The destructive splice bug would have shortened inputs to ['a'].
    expect(helper.inputs).toEqual(['a', 'b']);
    expect(inputs).toEqual(['a', 'b']);
    // Idempotent: calling again yields the same line.
    expect(helper.generateModelFunction()).toBe(line);
  });
});

describe('JavaScript: name conversion', () => {
  const helper = () => new KerasGeneratorJavascriptHelper({}, [], [], [], false);

  it('pythonToJsLayerName lowercases the head and the trailing dimension', () => {
    const h = helper();
    expect(h.pythonToJsLayerName('Dense')).toBe('dense');
    expect(h.pythonToJsLayerName('Conv2D')).toBe('conv2d');
    expect(h.pythonToJsLayerName('MaxPooling2D')).toBe('maxPooling2d');
    expect(h.pythonToJsLayerName('Input')).toBe('input');
  });

  it('pythonToJsParamName converts snake_case to camelCase', () => {
    const h = helper();
    expect(h.pythonToJsParamName('kernel_size')).toBe('kernelSize');
    expect(h.pythonToJsParamName('use_bias')).toBe('useBias');
    expect(h.pythonToJsParamName('units')).toBe('units');
  });
});

describe('JavaScript: generateParams', () => {
  const helper = () => new KerasGeneratorJavascriptHelper({}, [], [], [], false);

  it('quotes strings, maps booleans, arrays to JS arrays with camelCase keys', () => {
    const params = { use_bias: true, units: 32, kernel_size: [3, 3] };
    expect(helper().generateParams(params, {})).toBe('{useBias:true,units:32,kernelSize:[3,3,],}');
  });

  it('collapses a single-element convertToNumber array to a quoted scalar', () => {
    const params = { pool_size: [2] };
    const def = { pool_size: { convertToNumber: true, value: [2] } };
    expect(helper().generateParams(params, def)).toBe("{poolSize:'2',}");
  });

  it('keeps a multi-element convertToNumber array as an array', () => {
    const params = { pool_size: [2, 2] };
    const def = { pool_size: { convertToNumber: true, value: [2, 2] } };
    expect(helper().generateParams(params, def)).toBe('{poolSize:[2,2,],}');
  });
});

describe('JavaScript: full generation', () => {
  it('generates a tf.sequential() model for a linear chain', () => {
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

  it('wires functional graphs with .apply(...) in topological order', () => {
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

  it('emits a bracketed multi-input tf.model({inputs:[...]}) line', () => {
    const graph = {
      a: { keras_data: { name: 'Input' } },
      b: { keras_data: { name: 'Input' } },
      o: { keras_data: { name: 'Output' } },
    };
    const inputs = ['a', 'b'];
    const helper = new KerasGeneratorJavascriptHelper(graph, inputs, ['o'], [], false);
    expect(helper.generateModelFunction()).toBe(
      'const model = tf.model({inputs:[input_a, input_b], outputs:output_o});\n',
    );
    expect(helper.inputs).toEqual(['a', 'b']);
  });
});
