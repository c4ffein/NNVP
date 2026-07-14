/**
 * BoardInterface event bus + active-graph delegation. Migrated from
 * tests/unit/BoardInterface.test.js into the dual registry as logicTest. The
 * per-describe beforeEach (`iface = new BoardInterface()`) became a fresh
 * instance created at the top of each test.
 */
import { logicTest } from '../harness/define';
import BoardInterface from '../../src/lib/BoardInterface/BoardInterface';
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

// --- BoardInterface event bus ------------------------------------------------------

logicTest('BoardInterface: emit calls every registered listener with the payload', ({ expect }) => {
  const iface = new BoardInterface();
  const received = [];
  iface.on('ping', data => received.push(['a', data]));
  iface.on('ping', data => received.push(['b', data]));
  iface.emit('ping', 42);
  expect(received).toEqual([['a', 42], ['b', 42]]);
});

logicTest('BoardInterface: emit on an event with no listeners is a no-op', ({ expect }) => {
  const iface = new BoardInterface();
  expect(() => iface.emit('nobody-home', 1)).not.toThrow();
});

logicTest('BoardInterface: off removes a specific listener and leaves the others', ({ expect }) => {
  const iface = new BoardInterface();
  const received = [];
  const first = () => received.push('first');
  const second = () => received.push('second');
  iface.on('ev', first);
  iface.on('ev', second);
  iface.off('ev', first);
  iface.emit('ev');
  expect(received).toEqual(['second']);
});

logicTest('BoardInterface: off on an unknown event is a no-op', ({ expect }) => {
  const iface = new BoardInterface();
  expect(() => iface.off('unknown', () => {})).not.toThrow();
});

// --- BoardInterface active-graph delegation -------------------------------------------

logicTest('BoardInterface: getActiveElements returns null when there is no active graph', ({ expect }) => {
  const iface = new BoardInterface();
  expect(iface.activeGraph).toBe(null);
  expect(iface.getActiveElements()).toBe(null);
});

logicTest('BoardInterface: delegating methods are safe no-ops when there is no active graph', ({ expect }) => {
  const iface = new BoardInterface();
  expect(() => iface.undo()).not.toThrow();
  expect(() => iface.redo()).not.toThrow();
  expect(() => iface.addLayer(new KerasLayer('Dense', 'Core'))).not.toThrow();
  expect(() => iface.deleteSelectedElements()).not.toThrow();
  expect(iface.generateJavascriptNoSave({})).toBe(null);
});

logicTest('BoardInterface: addGraphEditor activates the first editor and exposes its selection', ({ expect }) => {
  const iface = new BoardInterface();
  const { editor } = makeEditor();
  iface.addGraphEditor(editor);
  expect(iface.graphEditors).toContain(editor);
  expect(iface.activeGraph).toBe(editor);
  expect(iface.getActiveElements()).toBe(editor.selectedNodes);
  expect(iface.getActiveElementsContainer().e).toBe(editor.selectedNodes);
  expect(iface.getUndoStackContainer().e).toBe(editor.undoStack);
  expect(iface.getRedoStackContainer().e).toBe(editor.redoStack);
});

logicTest('BoardInterface: addGraphEditor does not re-activate once an active graph exists', ({ expect }) => {
  const iface = new BoardInterface();
  const first = makeEditor().editor;
  const second = makeEditor().editor;
  iface.addGraphEditor(first);
  iface.addGraphEditor(second);
  expect(iface.activeGraph).toBe(first);
  expect(iface.graphEditors).toHaveLength(2);
});

logicTest('BoardInterface: wires editor selection/graph changes onto the event bus', ({ expect }) => {
  const iface = new BoardInterface();
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

logicTest('BoardInterface: setActiveGraphEditor emits the reactive refresh events', ({ expect }) => {
  const iface = new BoardInterface();
  const { editor } = makeEditor();
  const emitted = [];
  ['templates-changed', 'selection-changed', 'undo-stack-changed', 'redo-stack-changed']
    .forEach(name => iface.on(name, () => emitted.push(name)));
  iface.setActiveGraphEditor(editor);
  expect(emitted).toEqual([
    'templates-changed', 'selection-changed', 'undo-stack-changed', 'redo-stack-changed',
  ]);
});

logicTest('BoardInterface: findLayerById delegates to the active graph', ({ expect }) => {
  const iface = new BoardInterface();
  const { editor } = makeEditor();
  iface.addGraphEditor(editor);
  editor.addLayer(new KerasLayer('Dense', 'Core'));
  const layer = editor.model.d3Layers[0];
  expect(iface.findLayerById(layer.id)).toBe(layer);
  expect(iface.findLayerById(9999)).toBe(null);
});

logicTest('BoardInterface: addLayer / deleteSelectedElements / undo delegate to the active graph', ({ expect }) => {
  const iface = new BoardInterface();
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

// --- BoardInterface.debugGetBoardState -------------------------------------------------

logicTest('BoardInterface: debugGetBoardState returns empty counters when there is no active graph', ({ expect }) => {
  const iface = new BoardInterface();
  const state = iface.debugGetBoardState();
  expect(state).toEqual({
    layers: [], inputs: [], outputs: [], edges: [], undoStack: 0, redoStack: 0,
  });
});

// Regression: debugGetBoardState read model.layers / model.edges, but the
// model shim exposes those as d3Layers / d3Edges. With a populated graph the
// getter threw "Cannot read properties of undefined (reading 'map')".
logicTest('BoardInterface: debugGetBoardState reports the real board state for a populated graph', ({ expect }) => {
  const iface = new BoardInterface();
  const { editor } = makeEditor();
  iface.addGraphEditor(editor);
  editor.loadTemplate('2D Dense for MNIST');

  const state = iface.debugGetBoardState();
  expect(state.layers.map(l => l.id)).toEqual(editor.model.d3Layers.map(l => l.id));
  expect(state.edges).toBe(4);
  expect(state.inputs).toBe(editor.model.modelInputs);
  expect(state.outputs).toBe(editor.model.modelOutputs);
});
