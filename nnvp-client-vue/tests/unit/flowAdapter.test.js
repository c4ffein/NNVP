import { describe, it, expect } from 'bun:test';
import D3Templates from '../../src/lib/D3Interface/D3Templates';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import {
  nnvpToFlow, flowToNnvp, isInvalidConnection, edgeInCycle, nextLayerId, newLayerNode,
  groupSelected, LAYER_NODE, COMPOSITE_NODE,
} from '../../src/lib/FlowInterface/adapter';

// KerasGenerator mutates the graph it is given, so always feed it a fresh parse.
const pythonOf = json => new KerasGenerator(JSON.parse(json)).generatePythonFromGraph();
const javascriptOf = json => new KerasGenerator(JSON.parse(json)).generateJavascriptFromGraph();

const templates = new D3Templates().templates;

// A graph with a composite (grouped) layer, in D3Model.toJSON shape: children
// carry ABSOLUTE coordinates and a parentID pointing at the composite.
const kl = name => ({
  name, category: 'test', parameterDef: {}, parameterValues: {}, customUserLayer: false,
});
const compositeFixture = () => JSON.stringify({
  layers: [
    {
      class: 'D3Layer', x: 20, y: 20, width: 90, height: 40, id: 0, htmlID: 'd3-layer-0',
      name: 'Input', inputLayers: [], outputLayers: [1], children: null,
      kerasLayer: { ...kl('Input'), parameterValues: { shape: [8] } }, parentID: null,
    },
    {
      class: 'D3LayerComposite', x: 150, y: 40, width: 300, height: 150, id: 10,
      htmlID: 'd3-layer-10', name: 'Group', inputLayers: [], outputLayers: [], children: [
        {
          class: 'D3Layer', x: 170, y: 60, width: 90, height: 40, id: 1, htmlID: 'd3-layer-1',
          name: 'Dense', inputLayers: [0], outputLayers: [2], children: null,
          kerasLayer: { ...kl('Dense'), parameterValues: { units: 4 } }, parentID: 10,
        },
        {
          class: 'D3Layer', x: 300, y: 60, width: 90, height: 40, id: 2, htmlID: 'd3-layer-2',
          name: 'Dense', inputLayers: [1], outputLayers: [3], children: null,
          kerasLayer: { ...kl('Dense'), parameterValues: { units: 2 } }, parentID: 10,
        },
      ],
      kerasLayer: null, parentID: null,
    },
    {
      class: 'D3Layer', x: 520, y: 20, width: 90, height: 40, id: 3, htmlID: 'd3-layer-3',
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

describe('nnvpToFlow', () => {
  it('maps flat layers to nodes with positions, labels and string ids', () => {
    const { nodes, edges } = nnvpToFlow(templates['2D Dense for MNIST']);
    expect(nodes.length).toBe(5);
    expect(edges.length).toBe(4);
    const input = nodes[0];
    expect(input.id).toBe('0');
    expect(input.type).toBe(LAYER_NODE);
    expect(input.position).toEqual({ x: 84, y: 60 });
    expect(input.data.label).toBe('Input');
    expect(input.data.nnvp.kerasLayer.name).toBe('Input');
    expect(input.parentNode).toBeUndefined();
    expect(edges[0]).toMatchObject({ id: 's0_t1', source: '0', target: '1' });
  });

  it('maps composite children to nested nodes with parent-relative positions', () => {
    const { nodes } = nnvpToFlow(compositeFixture());
    const composite = nodes.find(n => n.id === '10');
    const child = nodes.find(n => n.id === '1');
    expect(composite.type).toBe(COMPOSITE_NODE);
    expect(composite.style).toEqual({ width: '300px', height: '150px' });
    expect(child.parentNode).toBe('10');
    expect(child.extent).toBe('parent');
    // Absolute (170, 60) inside a parent at (150, 40) -> relative (20, 20).
    expect(child.position).toEqual({ x: 20, y: 20 });
  });
});

describe('flowToNnvp round-trip', () => {
  it('is lossless for a flat template (structure)', () => {
    const original = templates['2D Dense for MNIST'];
    const { nodes, edges } = nnvpToFlow(original);
    expect(JSON.parse(flowToNnvp(nodes, edges))).toEqual(JSON.parse(original));
  });

  it('is lossless for the composite fixture (structure, absolute coords, parentID)', () => {
    const original = compositeFixture();
    const { nodes, edges } = nnvpToFlow(original);
    expect(JSON.parse(flowToNnvp(nodes, edges))).toEqual(JSON.parse(original));
  });

  it('preserves generated Python and JavaScript for every shipped template', () => {
    Object.values(templates).forEach((original) => {
      const { nodes, edges } = nnvpToFlow(original);
      const roundTripped = flowToNnvp(nodes, edges);
      expect(pythonOf(roundTripped)).toBe(pythonOf(original));
      expect(javascriptOf(roundTripped)).toBe(javascriptOf(original));
    });
  });

  it('preserves generated code for the composite fixture', () => {
    const original = compositeFixture();
    const { nodes, edges } = nnvpToFlow(original);
    const roundTripped = flowToNnvp(nodes, edges);
    expect(pythonOf(roundTripped)).toBe(pythonOf(original));
    expect(pythonOf(roundTripped)).toContain('units=4');
  });

  it('recomputes wiring from edges after an edit (source of truth)', () => {
    const { nodes, edges } = nnvpToFlow(templates['2D Dense for MNIST']);
    // Cut the last connection (to the Output layer) on the board.
    const cut = edges.slice(0, -1);
    const model = JSON.parse(flowToNnvp(nodes, cut));
    const flatten = model.layers.find(l => l.id === 3);
    expect(model.edges.length).toBe(3);
    expect(flatten.outputLayers).toEqual([]);
  });
});

describe('isInvalidConnection', () => {
  const edges = [
    { source: '0', target: '1' },
    { source: '1', target: '2' },
  ];

  it('rejects self-connections, duplicates and cycles', () => {
    expect(isInvalidConnection(edges, '1', '1')).toBe(true);
    expect(isInvalidConnection(edges, '0', '1')).toBe(true);
    expect(isInvalidConnection(edges, '2', '0')).toBe(true); // would close 0->1->2->0
  });

  it('accepts a new forward or branching connection', () => {
    expect(isInvalidConnection(edges, '0', '2')).toBe(false);
    expect(isInvalidConnection(edges, '2', '3')).toBe(false);
  });
});

describe('edgeInCycle', () => {
  it('flags every edge of a loaded cycle, but not branches off it', () => {
    // 0 -> 1 -> 2 -> 0 (cycle, as a D3-made file could contain), 2 -> 3 (branch)
    const edges = [
      { source: '0', target: '1' },
      { source: '1', target: '2' },
      { source: '2', target: '0' },
      { source: '2', target: '3' },
    ];
    expect(edgeInCycle(edges, edges[0])).toBe(true);
    expect(edgeInCycle(edges, edges[1])).toBe(true);
    expect(edgeInCycle(edges, edges[2])).toBe(true);
    expect(edgeInCycle(edges, edges[3])).toBe(false);
  });

  it('flags nothing in a DAG', () => {
    const edges = [
      { source: '0', target: '1' },
      { source: '0', target: '2' },
      { source: '1', target: '2' },
    ];
    edges.forEach(edge => expect(edgeInCycle(edges, edge)).toBe(false));
  });
});

describe('groupSelected', () => {
  it('wraps the selection in a composite at the selection bbox, children relative', () => {
    const { nodes } = nnvpToFlow(templates['2D Dense for MNIST']);
    // Group Flatten (id 1, x 262) and the first Dense (id 2, x 459, w 80).
    const grouped = groupSelected(nodes, ['1', '2']);
    const composite = grouped.find(n => n.type === COMPOSITE_NODE);
    expect(composite.id).toBe('5'); // next free numeric id
    expect(composite.position).toEqual({ x: 262, y: 60 });
    // Right edge 459 + 80 + 20 padding - 262, bottom 60 + 40 + 10 - 60.
    expect(composite.data.nnvp.width).toBe(297);
    expect(composite.data.nnvp.height).toBe(50);
    const flatten = grouped.find(n => n.id === '1');
    expect(flatten.parentNode).toBe('5');
    expect(flatten.extent).toBe('parent');
    expect(flatten.position).toEqual({ x: 0, y: 0 });
    expect(flatten.selected).toBe(false);
    // Parents must precede their children for Vue Flow.
    expect(grouped.indexOf(composite)).toBeLessThan(grouped.indexOf(flatten));
    expect(grouped.length).toBe(nodes.length + 1);
  });

  it('round-trips through the converters as a D3LayerComposite with absolute coords', () => {
    const { nodes, edges } = nnvpToFlow(templates['2D Dense for MNIST']);
    const grouped = groupSelected(nodes, ['1', '2']);
    const model = JSON.parse(flowToNnvp(grouped, edges));
    const composite = model.layers.find(l => l.id === 5);
    expect(composite.class).toBe('D3LayerComposite');
    expect(composite.children.map(c => c.id).sort()).toEqual([1, 2]);
    expect(composite.children.find(c => c.id === 1)).toMatchObject({ x: 262, y: 60, parentID: 5 });
    // Wiring through the group is untouched.
    expect(model.edges.length).toBe(4);
    // Top level shrank: 5 layers - 2 grouped + 1 composite.
    expect(model.layers.length).toBe(4);
  });

  it('refuses to group a node that is already inside a composite', () => {
    const { nodes } = nnvpToFlow(compositeFixture());
    expect(groupSelected(nodes, ['1'])).toBeNull();
    expect(groupSelected(nodes, [])).toBeNull();
  });

  it('can group an existing composite with a plain layer (nesting)', () => {
    const { nodes, edges } = nnvpToFlow(compositeFixture());
    const grouped = groupSelected(nodes, ['0', '10']);
    const model = JSON.parse(flowToNnvp(grouped, edges));
    const outer = model.layers.find(l => l.id === 11);
    expect(outer.class).toBe('D3LayerComposite');
    const inner = outer.children.find(c => c.id === 10);
    expect(inner.class).toBe('D3LayerComposite');
    // Grandchildren keep their absolute positions.
    expect(inner.children.find(c => c.id === 1)).toMatchObject({ x: 170, y: 60 });
  });
});

describe('board node creation', () => {
  it('nextLayerId skips past every existing numeric id', () => {
    const { nodes } = nnvpToFlow(compositeFixture());
    expect(nextLayerId(nodes)).toBe(11);
    expect(nextLayerId([])).toBe(0);
  });

  it('newLayerNode builds a node the converters can round-trip', () => {
    const node = newLayerNode(7, { ...kl('Dense'), parameterValues: { units: 3 } }, { x: 5, y: 6 });
    const model = JSON.parse(flowToNnvp([node], []));
    expect(model.layers[0]).toMatchObject({
      class: 'D3Layer', id: 7, htmlID: 'd3-layer-7', name: 'Dense', x: 5, y: 6, parentID: null,
    });
    expect(model.layers[0].kerasLayer.parameterValues).toEqual({ units: 3 });
  });
});
