/**
 * Flow adapter converters (pure functions). Migrated from
 * tests/unit/flowAdapter.test.js into the dual registry as logicTest: no app
 * world needed, still executed by BOTH runners.
 */
import { logicTest } from '../harness/define';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import { orderGraph, CyclicGraphError } from '../../src/lib/KerasInterface/orderGraph';
import {
  nnvpToFlow, flowToNnvp, isInvalidConnection, edgeInCycle, nextLayerId, newLayerNode,
  groupSelected, LAYER_NODE, COMPOSITE_NODE,
} from '../../src/lib/FlowInterface/adapter';
import { CURRENT_FORMAT_VERSION } from '../../src/lib/ModelFormat/migrations';
import type { KerasLayerJSON, NnvpModel } from '../../src/types/model';

// KerasGenerator mutates the graph it is given, so always feed it a fresh parse.
const pythonOf = (json: string): string => new KerasGenerator(JSON.parse(json)).generatePythonFromGraph();
const javascriptOf = (json: string): string => new KerasGenerator(JSON.parse(json)).generateJavascriptFromGraph();

const templates = new BoardTemplates().templates;

// A graph with a composite (grouped) layer, in the persisted v2 shape (the
// same shape D3Model.toJSON emitted, honest names): children carry ABSOLUTE
// coordinates and a parentID pointing at the composite.
// (Intentionally minimal kerasLayer — no searchTerms — hence the cast.)
const kl = (name: string): KerasLayerJSON => ({
  name, category: 'test', parameterDef: {}, parameterValues: {}, customUserLayer: false,
} as unknown as KerasLayerJSON);
const compositeFixture = () => JSON.stringify({
  layers: [
    {
      class: 'Layer', x: 20, y: 20, width: 90, height: 40, id: 0, htmlID: 'layer-0',
      name: 'Input', inputLayers: [], outputLayers: [1], children: null,
      kerasLayer: { ...kl('Input'), parameterValues: { shape: [8] } }, parentID: null,
    },
    {
      class: 'Group', x: 150, y: 40, width: 300, height: 150, id: 10,
      htmlID: 'layer-10', name: 'Group', inputLayers: [], outputLayers: [], children: [
        {
          class: 'Layer', x: 170, y: 60, width: 90, height: 40, id: 1, htmlID: 'layer-1',
          name: 'Dense', inputLayers: [0], outputLayers: [2], children: null,
          kerasLayer: { ...kl('Dense'), parameterValues: { units: 4 } }, parentID: 10,
        },
        {
          class: 'Layer', x: 300, y: 60, width: 90, height: 40, id: 2, htmlID: 'layer-2',
          name: 'Dense', inputLayers: [1], outputLayers: [3], children: null,
          kerasLayer: { ...kl('Dense'), parameterValues: { units: 2 } }, parentID: 10,
        },
      ],
      kerasLayer: null, parentID: null,
    },
    {
      class: 'Layer', x: 520, y: 20, width: 90, height: 40, id: 3, htmlID: 'layer-3',
      name: 'Output', inputLayers: [2], outputLayers: [], children: null,
      kerasLayer: kl('Output'), parentID: null,
    },
  ],
  edges: [
    { source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' },
    { source: 1, target: 2, id: 's1_t2', htmlID: 's1_t2' },
    { source: 2, target: 3, id: 's2_t3', htmlID: 's2_t3' },
  ],
  // NB: NNVP's `outputs` are the layers FEEDING an Output node (here the
  // second Dense), not the Output node itself — see D3LayerComponent.addInputLayer.
  inputs: [0],
  outputs: [2],
});

logicTest('flowAdapter: nnvpToFlow maps flat layers to nodes with positions, labels and string ids', ({ expect }) => {
  const { nodes, edges } = nnvpToFlow(templates['2D Dense for MNIST']!);
  expect(nodes.length).toBe(5);
  expect(edges.length).toBe(4);
  const input = nodes[0]!;
  expect(input.id).toBe('0');
  expect(input.type).toBe(LAYER_NODE);
  expect(input.position).toEqual({ x: 84, y: 60 });
  expect(input.data.label).toBe('Input');
  expect(input.data.nnvp.kerasLayer!.name).toBe('Input');
  expect(input.parentNode).toBeUndefined();
  expect(edges[0]).toMatchObject({ id: 's0_t1', source: '0', target: '1' });
});

logicTest('flowAdapter: nnvpToFlow maps composite children to nested nodes with parent-relative positions', ({ expect }) => {
  const { nodes } = nnvpToFlow(compositeFixture());
  const composite = nodes.find(n => n.id === '10')!;
  const child = nodes.find(n => n.id === '1')!;
  expect(composite.type).toBe(COMPOSITE_NODE);
  expect(composite.style).toEqual({ width: '300px', height: '150px' });
  expect(child.parentNode).toBe('10');
  expect(child.extent).toBe('parent');
  // Absolute (170, 60) inside a parent at (150, 40) -> relative (20, 20).
  expect(child.position).toEqual({ x: 20, y: 20 });
});

logicTest('flowAdapter: round-trip is lossless for a flat template (structure)', ({ expect }) => {
  const original = templates['2D Dense for MNIST']!;
  const { nodes, edges } = nnvpToFlow(original);
  expect(JSON.parse(flowToNnvp(nodes, edges)))
    .toEqual({ ...JSON.parse(original), formatVersion: CURRENT_FORMAT_VERSION });
});

logicTest('flowAdapter: round-trip is lossless for the composite fixture (structure, absolute coords, parentID)', ({ expect }) => {
  const original = compositeFixture();
  const { nodes, edges } = nnvpToFlow(original);
  expect(JSON.parse(flowToNnvp(nodes, edges)))
    .toEqual({ ...JSON.parse(original), formatVersion: CURRENT_FORMAT_VERSION });
});

logicTest('flowAdapter: round-trip preserves generated Python and JavaScript for every shipped template', ({ expect }) => {
  Object.values(templates).forEach((original) => {
    const { nodes, edges } = nnvpToFlow(original);
    const roundTripped = flowToNnvp(nodes, edges);
    // Python generates for every template — the cyclic Elman one takes the
    // imperative (subclassing) route, and the round-trip must preserve it
    // (which pins that unrollSteps rides through the converters).
    expect(pythonOf(roundTripped)).toBe(pythonOf(original));
    if (orderGraph(JSON.parse(original) as NnvpModel).cycles.length > 0) {
      // JavaScript keeps the typed refusal for cycles — on both sides.
      expect(() => javascriptOf(original)).toThrow(CyclicGraphError);
      expect(() => javascriptOf(roundTripped)).toThrow(CyclicGraphError);
    } else {
      expect(javascriptOf(roundTripped)).toBe(javascriptOf(original));
    }
  });
});

// --- unrollSteps passthrough (Phase D2: k lives on the cycle-closing edge) ----------

// Input(0) -> Dense(1) -> Dense(2) with the feedback edge 2 -> 1 carrying
// unrollSteps. Additive field, so NO format version bump: files without it
// read as before, and the converters keep it lossless like everything else.
const feedbackFixture = () => JSON.stringify({
  layers: [
    {
      class: 'Layer', x: 20, y: 20, width: 90, height: 40, id: 0, htmlID: 'layer-0',
      name: 'Input', inputLayers: [], outputLayers: [1], children: null,
      kerasLayer: { ...kl('Input'), parameterValues: { shape: [8] } }, parentID: null,
    },
    {
      class: 'Layer', x: 150, y: 20, width: 90, height: 40, id: 1, htmlID: 'layer-1',
      name: 'Dense', inputLayers: [0, 2], outputLayers: [2], children: null,
      kerasLayer: { ...kl('Dense'), parameterValues: { units: 4 } }, parentID: null,
    },
    {
      class: 'Layer', x: 280, y: 20, width: 90, height: 40, id: 2, htmlID: 'layer-2',
      name: 'Dense', inputLayers: [1], outputLayers: [1], children: null,
      kerasLayer: { ...kl('Dense'), parameterValues: { units: 4 } }, parentID: null,
    },
  ],
  edges: [
    { source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' },
    { source: 1, target: 2, id: 's1_t2', htmlID: 's1_t2' },
    { source: 2, target: 1, id: 's2_t1', htmlID: 's2_t1', unrollSteps: 5 },
  ],
  inputs: [0],
  outputs: [],
});

logicTest('flowAdapter: unrollSteps on a cycle edge rides through the converters losslessly (additive, no version bump)', ({ expect }) => {
  const original = feedbackFixture();
  const { nodes, edges } = nnvpToFlow(original);
  // The field survives into the flow edge's nnvp stash...
  expect(edges.find(e => e.id === 's2_t1')!.data!.nnvp.unrollSteps).toBe(5);
  // ...and comes back out byte-losslessly, still stamped the CURRENT version
  // (adding the field bumped nothing).
  const roundTripped: NnvpModel = JSON.parse(flowToNnvp(nodes, edges));
  expect(roundTripped).toEqual({ ...JSON.parse(original), formatVersion: CURRENT_FORMAT_VERSION });
  // Edges without the field stay clean: no `unrollSteps: undefined` noise.
  expect('unrollSteps' in (roundTripped.edges[0] as object)).toBe(false);
  expect(roundTripped.edges[2]!.unrollSteps).toBe(5);
});

logicTest('flowAdapter: the Elman template loads with exactly its feedback loop cycle-marked and unrollSteps intact', ({ expect }) => {
  const { nodes, edges } = nnvpToFlow(templates['Elman char-RNN']!);
  expect(nodes.length).toBe(7);
  expect(edges.length).toBe(7);
  const ends = edges.map(e => ({ source: e.source, target: e.target }));
  // Only the Concatenate(3) <-> Dense(4) loop renders in the error color.
  const marked = edges.filter(e => edgeInCycle(ends, e)).map(e => String(e.id)).sort();
  expect(marked).toEqual(['s3_t4', 's4_t3']);
  expect(edges.find(e => String(e.id) === 's4_t3')!.data!.nnvp.unrollSteps).toBe(3);
});

logicTest('flowAdapter: round-trip preserves generated code for the composite fixture', ({ expect }) => {
  const original = compositeFixture();
  const { nodes, edges } = nnvpToFlow(original);
  const roundTripped = flowToNnvp(nodes, edges);
  expect(pythonOf(roundTripped)).toBe(pythonOf(original));
  expect(pythonOf(roundTripped)).toContain('units=4');
});

logicTest('flowAdapter: flowToNnvp recomputes wiring from edges after an edit (source of truth)', ({ expect }) => {
  const { nodes, edges } = nnvpToFlow(templates['2D Dense for MNIST']!);
  // Cut the last connection (to the Output layer) on the board.
  const cut = edges.slice(0, -1);
  const model: NnvpModel = JSON.parse(flowToNnvp(nodes, cut));
  const flatten = model.layers.find(l => l.id === 3)!;
  expect(model.edges.length).toBe(3);
  expect(flatten.outputLayers).toEqual([]);
});

// Shared fixture for the isInvalidConnection tests.
const connectionEdges = [
  { source: '0', target: '1' },
  { source: '1', target: '2' },
];

logicTest('flowAdapter: isInvalidConnection rejects self-connections and duplicates', ({ expect }) => {
  const edges = connectionEdges;
  expect(isInvalidConnection(edges, '1', '1')).toBe(true);
  expect(isInvalidConnection(edges, '0', '1')).toBe(true);
});

logicTest('flowAdapter: isInvalidConnection accepts a new forward or branching connection', ({ expect }) => {
  const edges = connectionEdges;
  expect(isInvalidConnection(edges, '0', '2')).toBe(false);
  expect(isInvalidConnection(edges, '2', '3')).toBe(false);
});

logicTest('flowAdapter: isInvalidConnection allows a cycle-closing connection (cycles are drawable since Phase D)', ({ expect }) => {
  // Closing 0 -> 1 -> 2 -> 0 is a legitimate edit now: the loop gets the red
  // edgeInCycle marking and codegen refuses it explicitly (CyclicGraphError)
  // until imperative emission ships — but the BOARD no longer refuses it.
  const edges = connectionEdges;
  expect(isInvalidConnection(edges, '2', '0')).toBe(false);
});

logicTest('flowAdapter: edgeInCycle marks a freshly drawn cycle edge and the loop it closes', ({ expect }) => {
  // The same wiring a user can now draw live: 0 -> 1 -> 2 plus the new 2 -> 0.
  const edges = [
    ...connectionEdges,
    { source: '2', target: '0' },
    { source: '1', target: '3' }, // a branch off the loop stays unmarked
  ];
  expect(edgeInCycle(edges, edges[0]!)).toBe(true);
  expect(edgeInCycle(edges, edges[1]!)).toBe(true);
  expect(edgeInCycle(edges, edges[2]!)).toBe(true);
  expect(edgeInCycle(edges, edges[3]!)).toBe(false);
});

logicTest('flowAdapter: edgeInCycle flags every edge of a loaded cycle, but not branches off it', ({ expect }) => {
  // 0 -> 1 -> 2 -> 0 (cycle, as a D3-made file could contain), 2 -> 3 (branch)
  const edges = [
    { source: '0', target: '1' },
    { source: '1', target: '2' },
    { source: '2', target: '0' },
    { source: '2', target: '3' },
  ];
  expect(edgeInCycle(edges, edges[0]!)).toBe(true);
  expect(edgeInCycle(edges, edges[1]!)).toBe(true);
  expect(edgeInCycle(edges, edges[2]!)).toBe(true);
  expect(edgeInCycle(edges, edges[3]!)).toBe(false);
});

logicTest('flowAdapter: edgeInCycle flags nothing in a DAG', ({ expect }) => {
  const edges = [
    { source: '0', target: '1' },
    { source: '0', target: '2' },
    { source: '1', target: '2' },
  ];
  edges.forEach(edge => expect(edgeInCycle(edges, edge)).toBe(false));
});

logicTest('flowAdapter: groupSelected wraps the selection in a composite at the selection bbox, children relative', ({ expect }) => {
  const { nodes } = nnvpToFlow(templates['2D Dense for MNIST']!);
  // Group Flatten (id 1, x 262) and the first Dense (id 2, x 459, w 80).
  const grouped = groupSelected(nodes, ['1', '2'])!;
  const composite = grouped.find(n => n.type === COMPOSITE_NODE)!;
  expect(composite.id).toBe('5'); // next free numeric id
  expect(composite.position).toEqual({ x: 262, y: 60 });
  // Right edge 459 + 80 + 20 padding - 262, bottom 60 + 40 + 10 - 60.
  expect(composite.data.nnvp.width).toBe(297);
  expect(composite.data.nnvp.height).toBe(50);
  const flatten = grouped.find(n => n.id === '1')!;
  expect(flatten.parentNode).toBe('5');
  expect(flatten.extent).toBe('parent');
  expect(flatten.position).toEqual({ x: 0, y: 0 });
  expect(flatten.selected).toBe(false);
  // Parents must precede their children for Vue Flow.
  expect(grouped.indexOf(composite)).toBeLessThan(grouped.indexOf(flatten));
  expect(grouped.length).toBe(nodes.length + 1);
});

logicTest('flowAdapter: groupSelected round-trips through the converters as a Group with absolute coords', ({ expect }) => {
  const { nodes, edges } = nnvpToFlow(templates['2D Dense for MNIST']!);
  const grouped = groupSelected(nodes, ['1', '2'])!;
  const model: NnvpModel = JSON.parse(flowToNnvp(grouped, edges));
  const composite = model.layers.find(l => l.id === 5)!;
  expect(composite.class).toBe('Group');
  expect(composite.children!.map(c => c.id).sort()).toEqual([1, 2]);
  expect(composite.children!.find(c => c.id === 1)).toMatchObject({ x: 262, y: 60, parentID: 5 });
  // Wiring through the group is untouched.
  expect(model.edges.length).toBe(4);
  // Top level shrank: 5 layers - 2 grouped + 1 composite.
  expect(model.layers.length).toBe(4);
});

logicTest('flowAdapter: groupSelected refuses to group a node that is already inside a composite', ({ expect }) => {
  const { nodes } = nnvpToFlow(compositeFixture());
  expect(groupSelected(nodes, ['1'])).toBeNull();
  expect(groupSelected(nodes, [])).toBeNull();
});

logicTest('flowAdapter: groupSelected can group an existing composite with a plain layer (nesting)', ({ expect }) => {
  const { nodes, edges } = nnvpToFlow(compositeFixture());
  const grouped = groupSelected(nodes, ['0', '10'])!;
  const model: NnvpModel = JSON.parse(flowToNnvp(grouped, edges));
  const outer = model.layers.find(l => l.id === 11)!;
  expect(outer.class).toBe('Group');
  const inner = outer.children!.find(c => c.id === 10)!;
  expect(inner.class).toBe('Group');
  // Grandchildren keep their absolute positions.
  expect(inner.children!.find(c => c.id === 1)).toMatchObject({ x: 170, y: 60 });
});

logicTest('flowAdapter: nextLayerId skips past every existing numeric id', ({ expect }) => {
  const { nodes } = nnvpToFlow(compositeFixture());
  expect(nextLayerId(nodes)).toBe(11);
  expect(nextLayerId([])).toBe(0);
});

logicTest('flowAdapter: newLayerNode builds a node the converters can round-trip', ({ expect }) => {
  const node = newLayerNode(7, { ...kl('Dense'), parameterValues: { units: 3 } }, { x: 5, y: 6 });
  const model: NnvpModel = JSON.parse(flowToNnvp([node], []));
  expect(model.layers[0]).toMatchObject({
    class: 'Layer', id: 7, htmlID: 'layer-7', name: 'Dense', x: 5, y: 6, parentID: null,
  });
  expect(model.layers[0]!.kerasLayer!.parameterValues).toEqual({ units: 3 });
});

// --- Layer comments (additive v2 field) --------------------------------------

logicTest('flowAdapter: a layer comment rides through load -> save; absent comments stay absent', ({ expect }) => {
  const withComment: NnvpModel = JSON.parse(compositeFixture());
  withComment.layers[0]!.comment = 'the input — 8 features';
  const { nodes, edges } = nnvpToFlow(withComment);
  expect(nodes[0]!.data.nnvp.comment).toBe('the input — 8 features');
  const saved: NnvpModel = JSON.parse(flowToNnvp(nodes, edges));
  expect(saved.layers[0]!.comment).toBe('the input — 8 features');
  // Layers that never had a comment must not gain the key on save (the same
  // byte-stability contract unrollSteps follows).
  expect('comment' in saved.layers[1]!).toBe(false);
  expect('comment' in saved.layers[2]!).toBe(false);
});

logicTest('flowAdapter: a comment on a composite child survives the round-trip', ({ expect }) => {
  const model: NnvpModel = JSON.parse(compositeFixture());
  model.layers[1]!.children![0]!.comment = 'hidden bottleneck';
  const { nodes, edges } = nnvpToFlow(model);
  const saved: NnvpModel = JSON.parse(flowToNnvp(nodes, edges));
  const group = saved.layers.find(l => l.id === 10)!;
  expect(group.children!.find(c => c.id === 1)!.comment).toBe('hidden bottleneck');
});
