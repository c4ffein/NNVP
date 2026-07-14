/**
 * The layered auto-layout: the pure function over plain {nodes, edges}
 * graphs, and FlowGraphEditor.autoLayout() applying it through the fake
 * store as one undoable step (Edit > Auto layout).
 */
import { logicTest } from '../harness/define';
import autoLayout from '../../src/lib/AutoLayout/autoLayout';
import { nnvpToFlow } from '../../src/lib/FlowInterface/adapter';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';

// Same fake store the flowGraphEditor suite drives the facade with.
function makeStore() {
  const state = { nodes: [], edges: [], selectedNodes: [], selectedEdges: [] };
  return {
    state,
    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    setGraph: (nodes, edges) => {
      state.nodes = nodes;
      state.edges = edges;
    },
    getSelectedNodes: () => state.selectedNodes,
    getSelectedEdges: () => state.selectedEdges,
  };
}

const templates = new BoardTemplates().templates;
const DENSE_MNIST = '2D Dense for MNIST';

function makeEditor() {
  const store = makeStore();
  return { store, editor: new FlowGraphEditor(store) };
}

const node = (id, extra) => ({ id, x: 0, y: 0, ...extra });
const edge = (source, target) => ({ source, target });

// A diamond with a tail: a -> (b, c) -> d -> e.
const diamond = () => ({
  nodes: ['a', 'b', 'c', 'd', 'e'].map(id => node(id)),
  edges: [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd'), edge('d', 'e')],
});

const rect = (graph, positions, id) => {
  const laid = graph.nodes.find(candidate => candidate.id === id);
  return {
    ...positions.get(id),
    width: laid.width ?? 120,
    height: laid.height ?? 40,
  };
};

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height;

function expectNoOverlap(graph, positions, expect) {
  const rects = graph.nodes.map(candidate => rect(graph, positions, candidate.id));
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => {
    expect(overlap(a, b)).toBe(false);
  }));
}

// --- the pure function ------------------------------------------------------

logicTest('autoLayout: every edge advances to a strictly greater x layer', ({ expect }) => {
  const graph = diamond();
  const positions = autoLayout(graph);
  graph.edges.forEach(({ source, target }) => {
    expect(positions.get(target).x).toBeGreaterThan(positions.get(source).x);
  });
  // b and c share a layer, vertically centered around it.
  expect(positions.get('b').x).toBe(positions.get('c').x);
});

logicTest('autoLayout: no two nodes overlap, even odd-sized ones', ({ expect }) => {
  const graph = diamond();
  // Blow up c like a composite block and give d an explicit size.
  graph.nodes.find(candidate => candidate.id === 'c').width = 300;
  graph.nodes.find(candidate => candidate.id === 'c').height = 220;
  graph.nodes.find(candidate => candidate.id === 'd').width = 90;
  graph.nodes.find(candidate => candidate.id === 'd').height = 40;
  const positions = autoLayout(graph);
  expectNoOverlap(graph, positions, expect);
});

logicTest('autoLayout: deterministic — input order does not matter', ({ expect }) => {
  const positions = autoLayout(diamond());
  const reversed = diamond();
  reversed.nodes.reverse();
  reversed.edges.reverse();
  expect(Object.fromEntries(autoLayout(reversed))).toEqual(Object.fromEntries(positions));
  expect(Object.fromEntries(autoLayout(diamond()))).toEqual(Object.fromEntries(positions));
});

logicTest('autoLayout: cyclic legacy graphs terminate, back-edge ignored', ({ expect }) => {
  const graph = {
    nodes: ['a', 'b', 'c', 'd'].map(id => node(id)),
    // a -> b -> c -> a is a cycle (only loadable from old D3 files); d floats.
    edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a'), edge('d', 'd')],
  };
  const positions = autoLayout(graph);
  expect(positions.size).toBe(4);
  positions.forEach(({ x, y }) => {
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
  // DFS walks ids in order, so c -> a is the back-edge; the rest still layer.
  expect(positions.get('b').x).toBeGreaterThan(positions.get('a').x);
  expect(positions.get('c').x).toBeGreaterThan(positions.get('b').x);
});

logicTest('autoLayout: lays out a real template sanely', ({ expect }) => {
  const flow = nnvpToFlow(templates['2D Conv for MNIST']);
  const graph = {
    nodes: flow.nodes.map(flowNode => ({
      id: flowNode.id,
      ...flowNode.position,
      width: flowNode.data.nnvp.width,
      height: flowNode.data.nnvp.height,
    })),
    edges: flow.edges.map(({ source, target }) => ({ source, target })),
  };
  const positions = autoLayout(graph);
  expect(positions.size).toBe(9);
  graph.edges.forEach(({ source, target }) => {
    expect(positions.get(target).x).toBeGreaterThan(positions.get(source).x);
  });
  expectNoOverlap(graph, positions, expect);
});

// --- the facade -------------------------------------------------------------

logicTest('autoLayout: facade re-lays the board as ONE undoable step', ({ expect }) => {
  const { store, editor } = makeEditor();
  editor.loadTemplate(DENSE_MNIST);
  const before = editor.toJSON();
  const depth = editor.undoStack.length;
  editor.autoLayout();
  expect(editor.toJSON()).not.toBe(before);
  expect(editor.undoStack.length).toBe(depth + 1);
  const byId = new Map(store.state.nodes.map(candidate => [candidate.id, candidate]));
  store.state.edges.forEach(({ source, target }) => {
    expect(byId.get(target).position.x).toBeGreaterThan(byId.get(source).position.x);
  });
  editor.undo();
  expect(editor.toJSON()).toBe(before);
  expect(editor.redoStack.length).toBe(1);
});

logicTest('autoLayout: facade on an empty board is a no-op (no undo entry)', ({ expect }) => {
  const { editor } = makeEditor();
  editor.autoLayout();
  expect(editor.undoStack.length).toBe(0);
});

logicTest('autoLayout: composite counts as one block, children laid out inside it', ({ expect }) => {
  const { store, editor } = makeEditor();
  editor.loadTemplate(DENSE_MNIST);
  store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]]; // Flatten + Dense
  editor.model.createComposite();
  editor.autoLayout();
  const composite = store.state.nodes.find(candidate => candidate.type === 'composite');
  const children = store.state.nodes.filter(candidate => candidate.parentNode === composite.id);
  expect(children.length).toBe(2);
  // Children sit inside the (resized) block, below its label strip.
  children.forEach((child) => {
    expect(child.position.x).toBeGreaterThan(0);
    expect(child.position.y).toBeGreaterThan(20);
    expect(child.position.x + 120).toBeLessThan(composite.data.nnvp.width + 1);
    expect(child.position.y + 40).toBeLessThan(composite.data.nnvp.height + 1);
  });
  // Flatten (1) feeds Dense (2): still left to right inside the block.
  const inner = new Map(children.map(child => [child.id, child]));
  expect(inner.get('2').position.x).toBeGreaterThan(inner.get('1').position.x);
  // At the top level the block behaves like one node on the Input -> Output path.
  const byId = new Map(store.state.nodes.map(candidate => [candidate.id, candidate]));
  const input = byId.get('0');
  const dense = byId.get('3');
  expect(composite.position.x).toBeGreaterThan(input.position.x);
  expect(dense.position.x).toBeGreaterThan(composite.position.x);
});

logicTest('autoLayout: disconnected components stack apart, not glued', ({ expect }) => {
  // Two independent chains plus one unwired node: without component
  // separation the layered pass interleaves them in the same columns.
  const nodes = ['a1', 'a2', 'b1', 'b2', 'c1'].map(id => ({ id, x: 0, y: 0 }));
  const edges = [
    { source: 'a1', target: 'a2' },
    { source: 'b1', target: 'b2' },
  ];
  const positions = autoLayout({ nodes, edges });
  const spanOf = ids => ({
    top: Math.min(...ids.map(id => positions.get(id).y)),
    bottom: Math.max(...ids.map(id => positions.get(id).y + 40)),
  });
  const chainA = spanOf(['a1', 'a2']);
  const chainB = spanOf(['b1', 'b2']);
  const lone = spanOf(['c1']);
  // Components ordered by smallest id, each strictly below the previous one
  // with the component gap (120) between, larger than the sibling gap (50).
  expect(chainB.top - chainA.bottom).toBe(120);
  expect(lone.top - chainB.bottom).toBe(120);
  // Chains still lay out left to right internally.
  expect(positions.get('a2').x).toBeGreaterThan(positions.get('a1').x);
  expect(positions.get('b2').x).toBeGreaterThan(positions.get('b1').x);
});

logicTest('autoLayout: a single connected component keeps its centered coordinates', ({ expect }) => {
  const nodes = ['1', '2', '3'].map(id => ({ id, x: 999, y: 999 }));
  const edges = [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
  ];
  const positions = autoLayout({ nodes, edges });
  // One node per layer, each vertically centered on y = 0 — unchanged by the
  // component pass (the first component keeps its coordinates).
  ['1', '2', '3'].forEach((id) => {
    expect(positions.get(id).y).toBe(-20);
  });
});
