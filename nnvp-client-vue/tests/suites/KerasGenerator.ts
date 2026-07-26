/**
 * Keras code generation (pure functions over a graph JSON). Migrated from
 * tests/unit/KerasGenerator.test.js into the dual registry as logicTest.
 */
import { logicTest } from '../harness/define';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import type { GeneratorGraph } from '../../src/lib/KerasInterface/KerasGenerator';
import { orderGraph, CyclicGraphError } from '../../src/lib/KerasInterface/orderGraph';
import KerasGeneratorPythonHelper from '../../src/lib/KerasInterface/KerasGeneratorPythonHelper';
import KerasGeneratorJavascriptHelper from '../../src/lib/KerasInterface/KerasGeneratorJavascriptHelper';
import KerasGeneratorPyTorchHelper from '../../src/lib/KerasInterface/KerasGeneratorPyTorchHelper';
import KerasGeneratorTinygradHelper from '../../src/lib/KerasInterface/KerasGeneratorTinygradHelper';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import type {
  NnvpLayer, NnvpLayerId, NnvpModel, ParameterDef, ParameterValue,
} from '../../src/types/model';

// --- Fixture builders -------------------------------------------------------
// The generator mutates the layer objects it is given (addLayerToResult deletes
// `kerasLayer` off boardData), so every fixture MUST be produced fresh from a
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
// Historically the treatment list silently truncated this to ['1']; since
// Phase D the loop members surface as `excluded` and generation refuses.
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

// A back-edge cycle whose declared sources/targets are ASYMMETRIC: node 2
// targets node 1 again, but node 1 does not list 2 as a source. The old
// treatment list happily listed both; orderGraph must see the 2 -> 1 edge
// anyway (it symmetrizes declared wiring) and report the whole loop.
// (A real catalog name — membership is checked before the Python unroll
// planner runs, and this fixture must reach the planner's Input refusal.)
function backEdgeCycleJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      // Input has no sources so it always gets treated, then loops back:
      // the Dense's target is the Input again.
      leaf('1', 'Input', { outputLayers: ['2'] }),
      leaf('2', 'Dense', { params: { units: 4 }, inputLayers: ['1'], outputLayers: ['1'] }),
    ],
  } as unknown as NnvpModel;
}

// Cycle 2 <-> 3 plus a healthy-looking node 4 fed by the cycle: 4 is not a
// cycle member but can never be ordered — it is "starved" by the cycle.
function starvedByCycleJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2'] }),
      leaf('2', 'A', { inputLayers: ['1', '3'], outputLayers: ['3', '4'] }),
      leaf('3', 'B', { inputLayers: ['2'], outputLayers: ['2'] }),
      leaf('4', 'C', { inputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
}

// A node feeding itself: the minimal (one-member) cycle.
function selfLoopJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2'] }),
      leaf('2', 'A', { inputLayers: ['1', '2'], outputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
}

// A stray, fully unconnected node: NOT a cycle. It stays silently omitted
// from the order (the shipped behavior for half-wired boards) and must NOT
// trip the cyclic-graph error.
function strayNodeJson(): NnvpModel {
  return {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { outputLayers: ['2'] }),
      leaf('2', 'Dense', { inputLayers: ['1'] }),
      leaf('9', 'Dense'),
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
  // keras_data is lifted off the layer, and boardData no longer carries it.
  expect(gen.graph['2']!.keras_data).toBeTruthy();
  expect(gen.graph['2']!.boardData!.kerasLayer).toBeUndefined();
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

// --- cyclic graphs (spec change, PLAN decision 9 / Phase D2) -----------------------
// Phase D replaced silent truncation with CyclicGraphError everywhere; Phase D2
// makes cycles MEANINGFUL for the Python target (Keras subclassing emission,
// unrolled k steps with shared weights) while JavaScript/PyTorch/tinygrad keep
// the typed refusal — per-target support is honest.

logicTest('kerasGenerator: JavaScript still refuses a cyclic graph with CyclicGraphError naming the excluded layers', ({ expect }) => {
  const gen = new KerasGenerator(cyclicJson(), false);
  // Construction still terminates; the acyclic prefix is still ordered.
  expect(gen.list).toEqual(['1']);
  expect(gen.excluded).toEqual(['2', '3']);
  let error: unknown;
  try {
    gen.generateJavascriptFromGraph();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(CyclicGraphError);
  const cyclic = error as CyclicGraphError;
  expect(cyclic.name).toBe('CyclicGraphError');
  expect(cyclic.excluded).toEqual(['2', '3']);
  expect(cyclic.cycles.map(group => [...group].sort())).toEqual([['2', '3']]);
  // The message is user-facing (menu downloads, training errors): it must
  // name the blocked layers legibly, ids included.
  expect(cyclic.message).toContain('cycle');
  expect(cyclic.message).toContain('A (id 2)');
  expect(cyclic.message).toContain('B (id 3)');
  expect(cyclic.message).toMatch(/not .*supported/);
});

logicTest('kerasGenerator: a back-edge cycle through the Input is refused by every target (feedback into an Input is meaningless)', ({ expect }) => {
  const gen = new KerasGenerator(backEdgeCycleJson(), false);
  // The 2 -> 1 back edge puts BOTH nodes in the loop: nothing is orderable.
  expect(gen.list).toEqual([]);
  expect(gen.excluded).toEqual(['1', '2']);
  let error: unknown;
  try {
    gen.generateJavascriptFromGraph();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(CyclicGraphError);
  expect((error as CyclicGraphError).excluded).toEqual(['1', '2']);
  // Python supports feedback loops now, but a loop whose feedback edge lands
  // on an Input layer cannot mean anything — refuse it, typed and legible.
  let pythonError: unknown;
  try {
    new KerasGenerator(backEdgeCycleJson(), false).generatePythonFromGraph();
  } catch (thrown) {
    pythonError = thrown;
  }
  expect(pythonError).toBeInstanceOf(CyclicGraphError);
  expect((pythonError as CyclicGraphError).message).toContain('Input');
});

logicTest('kerasGenerator: JavaScript, PyTorch and tinygrad refuse cyclic graphs; the message names Python as the target that supports them', ({ expect }) => {
  const targets = [
    ['generateJavascriptFromGraph', 'JavaScript'],
    ['generatePyTorchFromGraph', 'PyTorch'],
    ['generateTinygradFromGraph', 'tinygrad'],
  ] as const;
  targets.forEach(([method, label]) => {
    const gen = new KerasGenerator(cyclicJson(), false);
    let error: unknown;
    try {
      gen[method]();
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(CyclicGraphError);
    expect((error as CyclicGraphError).message).toContain(label);
    // Per-target honesty: the refusal tells the user which target CAN emit
    // feedback loops today.
    expect((error as CyclicGraphError).message).toContain('Python');
  });
});

logicTest('kerasGenerator: JavaScript refuses a graph with a cycle-starved downstream node (still excluded)', ({ expect }) => {
  const gen = new KerasGenerator(starvedByCycleJson(), false);
  expect(gen.list).toEqual(['1']);
  expect(gen.excluded).toEqual(['2', '3', '4']);
  // Only 2 and 3 form the loop; 4 is merely starved by it.
  expect(gen.cycles.map(group => [...group].sort())).toEqual([['2', '3']]);
  expect(() => gen.generateJavascriptFromGraph()).toThrow(/cycle/);
});

// --- orderGraph (the ONE shared topological ordering, codegen + import) -----------

// The exact algorithm createTreatmentList shipped with (all-sources-treated-
// then-recurse from the model inputs, diamond dedupe), replicated here as the
// parity reference for acyclic graphs.
function legacyTreatmentList(model: NnvpModel): NnvpLayerId[] {
  const graph: Record<NnvpLayerId, {
    sources: NnvpLayerId[]; targets: NnvpLayerId[]; treated: boolean;
  }> = {};
  const add = (layer: NnvpLayer): void => {
    if (layer.children === null || layer.children === undefined) {
      graph[layer.id] = { sources: layer.inputLayers, targets: layer.outputLayers, treated: false };
    } else {
      layer.children.forEach(add);
    }
  };
  model.layers.forEach(add);
  const list: NnvpLayerId[] = [];
  const visit = (node: NnvpLayerId): void => {
    if (graph[node]!.treated) return;
    if (graph[node]!.sources.some(source => !graph[source]!.treated)) return;
    list.push(node);
    graph[node]!.treated = true;
    graph[node]!.targets.forEach(visit);
  };
  model.inputs.forEach(visit);
  return list;
}

logicTest('orderGraph: matches the legacy treatment list byte-for-byte on every shipped template', ({ expect }) => {
  const templates = new BoardTemplates().templates;
  const names = Object.keys(templates);
  expect(names.length).toBeGreaterThan(0);
  names.forEach((name) => {
    const reference = legacyTreatmentList(JSON.parse(templates[name]!) as NnvpModel);
    const result = orderGraph(JSON.parse(templates[name]!) as NnvpModel);
    expect(result.order).toEqual(reference);
    if (name === 'Elman char-RNN') {
      // The one deliberately cyclic template (Phase D2 flagship): the
      // Concatenate<->Dense pair is the loop, the softmax head + Output are
      // starved by it — all of them route to imperative Python emission.
      expect(result.cycles.map(group => [...group].sort())).toEqual([[3, 4]]);
      expect([...result.excluded].sort()).toEqual([3, 4, 5, 6]);
    } else {
      expect(result.excluded).toEqual([]);
      expect(result.cycles).toEqual([]);
    }
    // ... and the generator's own list is that same order.
    expect(new KerasGenerator(JSON.parse(templates[name]!) as NnvpModel, false).list)
      .toEqual(reference);
  });
});

logicTest('orderGraph: keeps the acyclic semantics on the branching and diamond fixtures', ({ expect }) => {
  expect(orderGraph(functionalJson()).order).toEqual(legacyTreatmentList(functionalJson()));
  expect(orderGraph(multiInputJson()).order).toEqual(legacyTreatmentList(multiInputJson()));
  expect(orderGraph(sequentialJson())).toEqual({
    order: ['1', '2', '3', '4'], excluded: [], cycles: [],
  });
});

logicTest('orderGraph: reports cycle members, excluding them and everything they starve', ({ expect }) => {
  const result = orderGraph(starvedByCycleJson());
  expect(result.order).toEqual(['1']);
  expect(result.excluded).toEqual(['2', '3', '4']);
  expect(result.cycles.map(group => [...group].sort())).toEqual([['2', '3']]);
});

logicTest('orderGraph: a self-loop is a one-member cycle', ({ expect }) => {
  const result = orderGraph(selfLoopJson());
  expect(result.order).toEqual(['1']);
  expect(result.excluded).toEqual(['2']);
  expect(result.cycles).toEqual([['2']]);
});

logicTest('orderGraph: sees a back edge declared only on the target side (asymmetric wiring)', ({ expect }) => {
  const result = orderGraph(backEdgeCycleJson());
  expect(result.order).toEqual([]);
  expect(result.excluded).toEqual(['1', '2']);
  expect(result.cycles.map(group => [...group].sort())).toEqual([['1', '2']]);
});

logicTest('orderGraph: a stray unconnected node is omitted from the order but is NOT cycle-excluded', ({ expect }) => {
  // The shipped degrade for half-wired boards: nodes not reachable from the
  // model inputs are left out of codegen silently. Only CYCLES became loud.
  const result = orderGraph(strayNodeJson());
  expect(result.order).toEqual(['1', '2']);
  expect(result.excluded).toEqual([]);
  expect(result.cycles).toEqual([]);
});

logicTest('orderGraph: accepts a bare {sources,targets} graph, deriving roots from zero-source nodes', ({ expect }) => {
  const acyclic = orderGraph({
    a: { sources: [], targets: ['b', 'c'] },
    b: { sources: ['a'], targets: ['c'] },
    c: { sources: ['a', 'b'], targets: [] },
  });
  expect(acyclic).toEqual({ order: ['a', 'b', 'c'], excluded: [], cycles: [] });
  const cyclic = orderGraph({
    a: { sources: [], targets: ['b'] },
    b: { sources: ['a', 'c'], targets: ['c'] },
    c: { sources: ['b'], targets: ['b'] },
  });
  expect(cyclic.order).toEqual(['a']);
  expect(cyclic.excluded).toEqual(['b', 'c']);
  expect(cyclic.cycles.map(group => [...group].sort())).toEqual([['b', 'c']]);
});

logicTest('orderGraph: explicit roots override the zero-source default', ({ expect }) => {
  const graph = {
    a: { sources: [], targets: ['c'] },
    b: { sources: [], targets: ['c'] },
    c: { sources: ['a', 'b'], targets: [] },
  };
  // Only root from 'a': c stays starved (but not cycle-excluded — no cycle).
  const result = orderGraph(graph, ['a']);
  expect(result.order).toEqual(['a']);
  expect(result.excluded).toEqual([]);
  expect(result.cycles).toEqual([]);
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

// --- catalog membership (E-phase cheap hardening, built in D2) ----------------------
// The pattern check alone lets a crafted file name a layer `Dense_pwned` and
// have the generated code call keras.layers.Dense_pwned / tf.layers.densePwned
// — pattern-valid, catalog-unknown. Every generate* entry point now also
// checks layer names against the merged catalog (generated + NNVP text
// layers) and parameter names against the layer's catalog parameters.

function pwnedLayerJson(): NnvpModel {
  const json = sequentialJson();
  // Rename the Dense (index 2) to a pattern-valid but catalog-unknown name.
  json.layers[2]!.kerasLayer!.name = 'Dense_pwned';
  return json;
}

logicTest('kerasGenerator: a layer renamed to a valid-pattern-but-unknown identifier is refused by every target', ({ expect }) => {
  const methods = [
    'generatePythonFromGraph', 'generateJavascriptFromGraph',
    'generatePyTorchFromGraph', 'generateTinygradFromGraph',
  ] as const;
  methods.forEach((method) => {
    expect(() => new KerasGenerator(pwnedLayerJson(), false)[method]())
      .toThrow(/Unknown layer type name/);
  });
});

logicTest('kerasGenerator: a parameter name outside the layer catalog definition is refused even when pattern-valid', ({ expect }) => {
  const evil = () => {
    const json = sequentialJson();
    json.layers[2]!.kerasLayer!.parameterValues = { units: 3, evil_kwarg: 1 };
    return json;
  };
  expect(() => new KerasGenerator(evil(), false).generatePythonFromGraph())
    .toThrow(/Unknown parameter name/);
  expect(() => new KerasGenerator(evil(), true).generateJavascriptFromGraph())
    .toThrow(/Unknown parameter name/);
});

logicTest('kerasGenerator: NNVP text layers count as known layer names (merged catalog)', ({ expect }) => {
  const json = {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { params: { shape: [16, 32] }, outputLayers: ['2'] }),
      leaf('2', 'TransformerBlock', { params: { num_heads: 2, ff_dim: 8 }, inputLayers: ['1'], outputLayers: ['3'] }),
      leaf('3', 'Output', { inputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  const code = new KerasGenerator(json, false).generatePythonFromGraph();
  // (The linear chain takes the sequential path, which appends input_shape
  // to the first real layer — hence no closing paren in the assertion.)
  expect(code).toContain('NnvpTransformerBlock(num_heads=2,ff_dim=8');
  expect(code).toContain('class NnvpTransformerBlock(keras.layers.Layer):');
});

logicTest('kerasGenerator: the GeneratorParamDef escape hatches survive the membership check (code-defined, not file-defined)', ({ expect }) => {
  // skipInGeneration: the param never reaches the output, so its name is NOT
  // membership-checked ('name' is not a catalog parameter of Dense).
  const skipped = {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2'] }),
      leaf('2', 'Dense', {
        params: { units: 8, name: 'poetry' },
        def: { name: { skipInGeneration: true } } as unknown as Record<string, ParameterDef>,
        inputLayers: ['1'],
        outputLayers: ['3'],
      }),
      leaf('3', 'Output', { inputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  const python = new KerasGenerator(skipped, false).generatePythonFromGraph();
  expect(python).toContain('units=8');
  expect(python).not.toContain('poetry');
  // convertToNumber: pool_size IS a catalog parameter of MaxPooling2D — the
  // JS collapse to a quoted scalar still happens after the membership check.
  const converted = {
    inputs: ['1'],
    outputs: ['3'],
    layers: [
      leaf('1', 'Input', { params: { shape: [8, 8, 1] }, outputLayers: ['2'] }),
      leaf('2', 'MaxPooling2D', {
        params: { pool_size: [2] },
        def: { pool_size: { convertToNumber: true, value: [2] } } as unknown as Record<string, ParameterDef>,
        inputLayers: ['1'],
        outputLayers: ['3'],
      }),
      leaf('3', 'Output', { inputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  const js = new KerasGenerator(converted, true).generateJavascriptFromGraph();
  expect(js).toContain('poolSize:"2"');
});

// --- Python imperative (subclassing) emission for cyclic graphs (Phase D2) ----------
// A cycle edge means FEEDBACK: the loop is unrolled k steps (`unrollSteps` on
// the cycle-closing edge, default 3) with shared weights — every layer is
// instantiated once in __init__, call() runs the acyclic prefix normally and
// unrolls each loop, the feedback tensor starting as zeros.

// Input(1) -> Concatenate(2) <-> Dense(3) loop, Dense(4) softmax-ish head
// starved by the loop, Output(5). The feedback edge 3 -> 2 lives in `edges`.
function feedbackJson(unrollSteps?: number): NnvpModel {
  return {
    inputs: ['1'],
    outputs: ['4'],
    layers: [
      leaf('1', 'Input', { params: { shape: [8] }, outputLayers: ['2'] }),
      leaf('2', 'Concatenate', { inputLayers: ['1', '3'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { params: { units: 16, activation: 'tanh' }, inputLayers: ['2'], outputLayers: ['2', '4'] }),
      leaf('4', 'Dense', { params: { units: 8 }, inputLayers: ['3'], outputLayers: ['5'] }),
      leaf('5', 'Output', { inputLayers: ['4'] }),
    ],
    edges: [
      { source: '1', target: '2', id: 's1_t2', htmlID: 's1_t2' },
      { source: '2', target: '3', id: 's2_t3', htmlID: 's2_t3' },
      { source: '3', target: '4', id: 's3_t4', htmlID: 's3_t4' },
      { source: '4', target: '5', id: 's4_t5', htmlID: 's4_t5' },
      {
        source: '3', target: '2', id: 's3_t2', htmlID: 's3_t2',
        ...(unrollSteps === undefined ? {} : { unrollSteps }),
      },
    ],
  } as unknown as NnvpModel;
}

logicTest('kerasGenerator: Python emits the Keras subclassing form for a feedback loop (full string)', ({ expect }) => {
  const code = new KerasGenerator(feedbackJson(4), false).generatePythonFromGraph();
  expect(code).toBe(
    'import keras\n'
    + '\n'
    + '# NNVP: this graph contains feedback loops, so the model is emitted with the\n'
    + '# Keras subclassing API instead of the functional one: __init__ instantiates\n'
    + '# every layer exactly once (unrolled steps SHARE weights) and call() unrolls\n'
    + '# each feedback loop.\n'
    + 'class NnvpUnrolledModel(keras.Model):\n'
    + '    def __init__(self, **kwargs):\n'
    + '        super().__init__(**kwargs)\n'
    + '        self.layer_2 = keras.layers.Concatenate()\n'
    + '        self.layer_3 = keras.layers.Dense(units=16,activation="tanh")\n'
    + '        self.layer_4 = keras.layers.Dense(units=8)\n'
    + '\n'
    + '    def call(self, inputs):\n'
    + '        input_1 = inputs\n'
    + '        # Feedback loop unrolled 4 steps with shared weights: each feedback\n'
    + '        # tensor starts as zeros (the first step sees a zero state), sized\n'
    + '        # from its loop source layer.\n'
    + '        feedback_3 = keras.ops.zeros((keras.ops.shape(input_1)[0], 16))\n'
    + '        for _ in range(4):\n'
    + '            layer_2 = self.layer_2([input_1,feedback_3])\n'
    + '            layer_3 = self.layer_3(layer_2)\n'
    + '            feedback_3 = layer_3\n'
    + '        layer_4 = self.layer_4(layer_3)\n'
    + '        return layer_4\n'
    + '\n'
    + 'def build_model():\n'
    + '    return NnvpUnrolledModel()\n',
  );
});

logicTest('kerasGenerator: unrollSteps defaults to 3 when the cycle edge does not carry it', ({ expect }) => {
  const code = new KerasGenerator(feedbackJson(), false).generatePythonFromGraph();
  expect(code).toContain('for _ in range(3):');
});

logicTest('kerasGenerator: a Dense self-loop unrolls (the minimal feedback loop)', ({ expect }) => {
  const json = {
    inputs: ['1'],
    outputs: ['2'],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2'] }),
      leaf('2', 'Dense', { params: { units: 4 }, inputLayers: ['1', '2'], outputLayers: ['2', '3'] }),
      leaf('3', 'Output', { inputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  const code = new KerasGenerator(json, false).generatePythonFromGraph();
  expect(code).toContain('feedback_2 = keras.ops.zeros((keras.ops.shape(input_1)[0], 4))');
  expect(code).toContain('            layer_2 = self.layer_2([input_1,feedback_2])');
  expect(code).toContain('            feedback_2 = layer_2');
  expect(code).toContain('        return layer_2\n');
});

logicTest('kerasGenerator: hostile or invalid unrollSteps values are refused before interpolation', ({ expect }) => {
  const cases: unknown[] = ['4)); import os #', 0, -3, 2.5, 1e9, true];
  cases.forEach((value) => {
    expect(() => new KerasGenerator(feedbackJson(value as number), false).generatePythonFromGraph())
      .toThrow(/Unsafe unrollSteps/);
  });
});

logicTest('kerasGenerator: a loop whose feedback width cannot be inferred throws CyclicGraphError, not garbage code', ({ expect }) => {
  // Concatenate(2) <-> Flatten(3): the loop source is a Flatten — no feature
  // size to shape the zeros tensor from.
  const json = {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2'] }),
      leaf('2', 'Concatenate', { inputLayers: ['1', '3'], outputLayers: ['3'] }),
      leaf('3', 'Flatten', { inputLayers: ['2'], outputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  let error: unknown;
  try {
    new KerasGenerator(json, false).generatePythonFromGraph();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(CyclicGraphError);
  expect((error as CyclicGraphError).message).toContain('Flatten');
});

logicTest('kerasGenerator: an ambiguous loop (several entries, no marked feedback edge) throws CyclicGraphError', ({ expect }) => {
  // Input feeds BOTH loop members; no edge carries unrollSteps — NNVP cannot
  // know which edge is the feedback one.
  const json = {
    inputs: ['1'],
    outputs: [],
    layers: [
      leaf('1', 'Input', { params: { shape: [4] }, outputLayers: ['2', '3'] }),
      leaf('2', 'Dense', { params: { units: 4 }, inputLayers: ['1', '3'], outputLayers: ['3'] }),
      leaf('3', 'Dense', { params: { units: 4 }, inputLayers: ['1', '2'], outputLayers: ['2'] }),
    ],
  } as unknown as NnvpModel;
  let error: unknown;
  try {
    new KerasGenerator(json, false).generatePythonFromGraph();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(CyclicGraphError);
  expect((error as CyclicGraphError).message).toContain('feedback');
});

logicTest('kerasGenerator: a membership-unknown layer inside a loop is refused as unknown, not emitted', ({ expect }) => {
  const json = feedbackJson(3);
  json.layers[2]!.kerasLayer!.name = 'Dense_pwned';
  expect(() => new KerasGenerator(json, false).generatePythonFromGraph())
    .toThrow(/Unknown layer type name/);
});

// --- Phase D2 regression: acyclic emission is byte-identical through the routing ----

logicTest('kerasGenerator: every acyclic shipped template emits byte-identical code through the D2 entry points (four targets)', ({ expect }) => {
  const templates = new BoardTemplates().templates;
  Object.keys(templates).forEach((name) => {
    if (orderGraph(JSON.parse(templates[name]!) as NnvpModel).cycles.length > 0) return;
    const viaEntry = (method: 'generatePythonFromGraph' | 'generateJavascriptFromGraph' | 'generatePyTorchFromGraph' | 'generateTinygradFromGraph') =>
      new KerasGenerator(JSON.parse(templates[name]!) as NnvpModel, false)[method]();
    const direct = (Helper: typeof KerasGeneratorPythonHelper | typeof KerasGeneratorJavascriptHelper
      | typeof KerasGeneratorPyTorchHelper | typeof KerasGeneratorTinygradHelper) => {
      const gen = new KerasGenerator(JSON.parse(templates[name]!) as NnvpModel, false);
      return new Helper(gen.graph, gen.inputs, gen.outputs, gen.list, gen.sequential).generate();
    };
    expect(viaEntry('generatePythonFromGraph')).toBe(direct(KerasGeneratorPythonHelper));
    expect(viaEntry('generateJavascriptFromGraph')).toBe(direct(KerasGeneratorJavascriptHelper));
    expect(viaEntry('generatePyTorchFromGraph')).toBe(direct(KerasGeneratorPyTorchHelper));
    expect(viaEntry('generateTinygradFromGraph')).toBe(direct(KerasGeneratorTinygradHelper));
  });
});

// --- The Elman char-RNN flagship template (Phase D2) ---------------------------------

logicTest('kerasGenerator: the Elman char-RNN template generates the pinned Keras subclass Python', ({ expect }) => {
  const template = new BoardTemplates().get('Elman char-RNN')!;
  expect(template).toBeTruthy();
  const code = new KerasGenerator(JSON.parse(template) as NnvpModel, false).generatePythonFromGraph();
  expect(code).toBe(
    'import keras\n'
    + '\n'
    + '# NNVP: this graph contains feedback loops, so the model is emitted with the\n'
    + '# Keras subclassing API instead of the functional one: __init__ instantiates\n'
    + '# every layer exactly once (unrolled steps SHARE weights) and call() unrolls\n'
    + '# each feedback loop.\n'
    + 'class NnvpUnrolledModel(keras.Model):\n'
    + '    def __init__(self, **kwargs):\n'
    + '        super().__init__(**kwargs)\n'
    + '        self.layer_1 = keras.layers.Embedding(input_dim=96,output_dim=64)\n'
    + '        self.layer_2 = keras.layers.Flatten()\n'
    + '        self.layer_3 = keras.layers.Concatenate()\n'
    + '        self.layer_4 = keras.layers.Dense(units=128,activation="tanh")\n'
    + '        self.layer_5 = keras.layers.Dense(units=96,activation="softmax")\n'
    + '\n'
    + '    def call(self, inputs):\n'
    + '        input_0 = inputs\n'
    + '        layer_1 = self.layer_1(input_0)\n'
    + '        layer_2 = self.layer_2(layer_1)\n'
    + '        # Feedback loop unrolled 3 steps with shared weights: each feedback\n'
    + '        # tensor starts as zeros (the first step sees a zero state), sized\n'
    + '        # from its loop source layer.\n'
    + '        feedback_4 = keras.ops.zeros((keras.ops.shape(input_0)[0], 128))\n'
    + '        for _ in range(3):\n'
    + '            layer_3 = self.layer_3([layer_2,feedback_4])\n'
    + '            layer_4 = self.layer_4(layer_3)\n'
    + '            feedback_4 = layer_4\n'
    + '        layer_5 = self.layer_5(layer_4)\n'
    + '        return layer_5\n'
    + '\n'
    + 'def build_model():\n'
    + '    return NnvpUnrolledModel()\n',
  );
  // The load-bearing invariants, asserted structurally as well so a future
  // reformat of the pinned string cannot silently lose them:
  expect(code.match(/self\.layer_4 =/g)!.length).toBe(1); // single instantiation
  expect(code).toContain('for _ in range(3):'); // k-step unroll
  expect(code).toContain('keras.ops.zeros'); // zeros first-step state
  expect(code.match(/self\.layer_4\(/g)!.length).toBe(1); // shared reuse inside the loop only
});
