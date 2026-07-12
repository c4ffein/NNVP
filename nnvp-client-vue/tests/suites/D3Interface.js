/**
 * D3Interface event bus + active-graph delegation. Migrated from
 * tests/unit/D3Interface.test.js into the dual registry as logicTest. The
 * per-describe beforeEach (`iface = new D3Interface()`) became a fresh
 * instance created at the top of each test.
 */
import { logicTest } from '../harness/define';
import D3Interface from '../../src/lib/D3Interface/D3Interface';
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import KerasLayer from '../../src/lib/KerasInterface/KerasLayer';

// Real graph editor over the small store adapter FlowBoard injects (see
// flowGraphEditor.js) — no Vue needed.
function makeEditor() {
  const state = { nodes: [], edges: [], selectedNodes: [], selectedEdges: [] };
  const store = {
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
  return { store, editor: new FlowGraphEditor(store) };
}

// --- D3Interface event bus ------------------------------------------------------

logicTest('D3Interface: emit calls every registered listener with the payload', ({ expect }) => {
  const iface = new D3Interface();
  const received = [];
  iface.on('ping', data => received.push(['a', data]));
  iface.on('ping', data => received.push(['b', data]));
  iface.emit('ping', 42);
  expect(received).toEqual([['a', 42], ['b', 42]]);
});

logicTest('D3Interface: emit on an event with no listeners is a no-op', ({ expect }) => {
  const iface = new D3Interface();
  expect(() => iface.emit('nobody-home', 1)).not.toThrow();
});

logicTest('D3Interface: off removes a specific listener and leaves the others', ({ expect }) => {
  const iface = new D3Interface();
  const received = [];
  const first = () => received.push('first');
  const second = () => received.push('second');
  iface.on('ev', first);
  iface.on('ev', second);
  iface.off('ev', first);
  iface.emit('ev');
  expect(received).toEqual(['second']);
});

logicTest('D3Interface: off on an unknown event is a no-op', ({ expect }) => {
  const iface = new D3Interface();
  expect(() => iface.off('unknown', () => {})).not.toThrow();
});

// --- D3Interface active-graph delegation -------------------------------------------

logicTest('D3Interface: getActiveElements returns null when there is no active graph', ({ expect }) => {
  const iface = new D3Interface();
  expect(iface.activeGraph).toBe(null);
  expect(iface.getActiveElements()).toBe(null);
});

logicTest('D3Interface: delegating methods are safe no-ops when there is no active graph', ({ expect }) => {
  const iface = new D3Interface();
  expect(() => iface.undo()).not.toThrow();
  expect(() => iface.redo()).not.toThrow();
  expect(() => iface.addLayer(new KerasLayer('Dense', 'Core'))).not.toThrow();
  expect(() => iface.deleteSelectedElements()).not.toThrow();
  expect(iface.generateJavascriptNoSave({})).toBe(null);
});

logicTest('D3Interface: addGraphEditor activates the first editor and exposes its selection', ({ expect }) => {
  const iface = new D3Interface();
  const { editor } = makeEditor();
  iface.addGraphEditor(editor);
  expect(iface.graphEditors).toContain(editor);
  expect(iface.activeGraph).toBe(editor);
  expect(iface.getActiveElements()).toBe(editor.selectedNodes);
  expect(iface.getActiveElementsContainer().e).toBe(editor.selectedNodes);
  expect(iface.getUndoStackContainer().e).toBe(editor.undoStack);
  expect(iface.getRedoStackContainer().e).toBe(editor.redoStack);
});

logicTest('D3Interface: addGraphEditor does not re-activate once an active graph exists', ({ expect }) => {
  const iface = new D3Interface();
  const first = makeEditor().editor;
  const second = makeEditor().editor;
  iface.addGraphEditor(first);
  iface.addGraphEditor(second);
  expect(iface.activeGraph).toBe(first);
  expect(iface.graphEditors).toHaveLength(2);
});

logicTest('D3Interface: wires editor selection/graph changes onto the event bus', ({ expect }) => {
  const iface = new D3Interface();
  let selectionEvents = 0;
  let graphEvents = 0;
  iface.on('selection-changed', () => { selectionEvents += 1; });
  iface.on('graph-changed', () => { graphEvents += 1; });

  const { store, editor } = makeEditor();
  iface.addGraphEditor(editor);
  // setActiveGraphEditor emits one selection-changed during activation.
  const baseline = selectionEvents;

  editor.addLayer(new KerasLayer('Dense', 'Core'));
  expect(graphEvents).toBe(1);

  store.state.selectedNodes = [store.state.nodes[0]];
  editor.syncSelection();
  expect(selectionEvents).toBeGreaterThan(baseline);
});

logicTest('D3Interface: setActiveGraphEditor emits the reactive refresh events', ({ expect }) => {
  const iface = new D3Interface();
  const { editor } = makeEditor();
  const emitted = [];
  ['templates-changed', 'selection-changed', 'undo-stack-changed', 'redo-stack-changed']
    .forEach(name => iface.on(name, () => emitted.push(name)));
  iface.setActiveGraphEditor(editor);
  expect(emitted).toEqual([
    'templates-changed', 'selection-changed', 'undo-stack-changed', 'redo-stack-changed',
  ]);
});

logicTest('D3Interface: findLayerById delegates to the active graph', ({ expect }) => {
  const iface = new D3Interface();
  const { editor } = makeEditor();
  iface.addGraphEditor(editor);
  editor.addLayer(new KerasLayer('Dense', 'Core'));
  const layer = editor.model.d3Layers[0];
  expect(iface.findLayerById(layer.id)).toBe(layer);
  expect(iface.findLayerById(9999)).toBe(null);
});

logicTest('D3Interface: addLayer / deleteSelectedElements / undo delegate to the active graph', ({ expect }) => {
  const iface = new D3Interface();
  const { store, editor } = makeEditor();
  iface.addGraphEditor(editor);

  iface.addLayer(new KerasLayer('Dense', 'Core'));
  expect(editor.model.d3Layers).toHaveLength(1);

  store.state.selectedNodes = [store.state.nodes[0]];
  editor.syncSelection();
  iface.deleteSelectedElements();
  expect(editor.model.d3Layers).toHaveLength(0);

  iface.undo();
  expect(editor.model.d3Layers).toHaveLength(1);
});

// --- D3Interface.debugGetBoardState -------------------------------------------------

logicTest('D3Interface: debugGetBoardState returns empty counters when there is no active graph', ({ expect }) => {
  const iface = new D3Interface();
  const state = iface.debugGetBoardState();
  expect(state).toEqual({
    layers: [], inputs: [], outputs: [], edges: [], undoStack: 0, redoStack: 0,
  });
});

// Regression: debugGetBoardState read model.layers / model.edges, but the
// model shim exposes those as d3Layers / d3Edges. With a populated graph the
// getter threw "Cannot read properties of undefined (reading 'map')".
logicTest('D3Interface: debugGetBoardState reports the real board state for a populated graph', ({ expect }) => {
  const iface = new D3Interface();
  const { editor } = makeEditor();
  iface.addGraphEditor(editor);
  editor.loadTemplate('2D Dense for MNIST');

  const state = iface.debugGetBoardState();
  expect(state.layers.map(l => l.id)).toEqual(editor.model.d3Layers.map(l => l.id));
  expect(state.edges).toBe(4);
  expect(state.inputs).toBe(editor.model.modelInputs);
  expect(state.outputs).toBe(editor.model.modelOutputs);
});
