/**
 * FlowGraphEditor over the small store adapter FlowBoard injects (no Vue).
 * Migrated from tests/unit/flowGraphEditor.test.js into the dual registry as
 * logicTest.
 */
import { logicTest } from '../harness/define';
import D3Templates from '../../src/lib/D3Interface/D3Templates';
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';

// FlowGraphEditor sees Vue Flow only through the small store adapter FlowBoard
// injects, so the tests drive a plain fake instead of mounting Vue.
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

const templates = new D3Templates().templates;
const DENSE_MNIST = '2D Dense for MNIST';

function makeEditor() {
  const store = makeStore();
  return { store, editor: new FlowGraphEditor(store) };
}

function loadedEditor() {
  const made = makeEditor();
  made.editor.model.loadJSON(templates[DENSE_MNIST]);
  made.editor.updateGraph();
  return made;
}

const microtasks = () => new Promise(resolve => queueMicrotask(resolve));

const kl = name => ({
  name, category: 'test', parameterDef: {}, parameterValues: {}, customUserLayer: false,
  clone() { return { ...this, parameterValues: { ...this.parameterValues } }; },
});

// --- D3Interface reference contracts -------------------------------------------

logicTest('flowGraphEditor: keeps the exact array instances captured by setActiveGraphEditor', ({ expect }) => {
  const { store, editor } = makeEditor();
  const captured = {
    selectedNodes: editor.selectedNodes,
    undoStack: editor.undoStack,
    redoStack: editor.redoStack,
    d3Layers: editor.model.d3Layers,
    d3Edges: editor.model.d3Edges,
    modelInputs: editor.model.modelInputs,
    modelOutputs: editor.model.modelOutputs,
  };
  editor.loadTemplate(DENSE_MNIST);
  store.state.selectedNodes = [store.state.nodes[1]];
  editor.syncSelection();
  editor.deleteSelectedElements();
  editor.undo();
  editor.redo();
  editor.addLayer(kl('Dense'));
  editor.clearBoard(true);
  expect(editor.selectedNodes).toBe(captured.selectedNodes);
  expect(editor.undoStack).toBe(captured.undoStack);
  expect(editor.redoStack).toBe(captured.redoStack);
  expect(editor.model.d3Layers).toBe(captured.d3Layers);
  expect(editor.model.d3Edges).toBe(captured.d3Edges);
  expect(editor.model.modelInputs).toBe(captured.modelInputs);
  expect(editor.model.modelOutputs).toBe(captured.modelOutputs);
});

logicTest('flowGraphEditor: exposes templates with a list()', ({ expect }) => {
  const { editor } = makeEditor();
  expect(editor.templates.list()).toContain(DENSE_MNIST);
});

// --- model shim derivations ------------------------------------------------------

logicTest('flowGraphEditor: mirrors D3Model: d3Layers, d3Edges, modelInputs, modelOutputs, inputLayers', ({ expect }) => {
  const { editor } = loadedEditor();
  expect(editor.model.d3Layers.length).toBe(5);
  expect(editor.model.d3Edges.length).toBe(4);
  expect(editor.model.modelInputs.map(l => l.id)).toEqual([0]);
  // Outputs are the layers FEEDING an Output node, in edge order.
  expect(editor.model.modelOutputs.map(l => l.id)).toEqual([3]);
  const dense = editor.findLayerById(2);
  expect(dense.name).toBe('Dense');
  expect(dense.inputLayers).toEqual([1]);
  expect(dense.kerasLayer.parameterValues.units).toBe(42);
});

logicTest('flowGraphEditor: counts a composite as ONE top-level layer but still finds its children', ({ expect }) => {
  const { store, editor } = loadedEditor();
  store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
  editor.model.createComposite();
  expect(editor.model.d3Layers.length).toBe(4);
  const composite = editor.model.d3Layers.find(l => l.class === 'D3LayerComposite');
  expect(composite.id).toBe(5);
  expect(editor.findLayerById(1).name).toBe('Flatten');
});

logicTest('flowGraphEditor: findLayerById matches both string and number ids', ({ expect }) => {
  const { editor } = loadedEditor();
  expect(editor.findLayerById(2)).toBe(editor.findLayerById('2'));
  expect(editor.findLayerById(99)).toBeNull();
});

// --- kerasLayer revival -----------------------------------------------------------

logicTest('flowGraphEditor: restores live KerasLayer instances so the panels can setParameterValue', ({ expect }) => {
  const { editor } = loadedEditor();
  const dense = editor.findLayerById(2);
  expect(typeof dense.kerasLayer.setParameterValue).toBe('function');
  dense.kerasLayer.setParameterValue('units', 99);
  expect(editor.toJSON()).toContain('"units":99');
});

logicTest('flowGraphEditor: keeps instances live across undo/redo', ({ expect }) => {
  const { editor } = loadedEditor();
  editor.findLayerById(2).kerasLayer.setParameterValue('units', 99);
  editor.saveState();
  editor.clearBoard(true);
  editor.undo();
  const revived = editor.findLayerById(2);
  expect(typeof revived.kerasLayer.setParameterValue).toBe('function');
  expect(revived.kerasLayer.parameterValues.units).toBe(99);
});

// --- undo / redo --------------------------------------------------------------------

logicTest('flowGraphEditor: loadTemplate is undoable back to the previous board', ({ expect }) => {
  const { editor } = makeEditor();
  editor.loadTemplate(DENSE_MNIST);
  expect(editor.undoStack.length).toBe(1);
  editor.undo();
  expect(editor.model.d3Layers.length).toBe(0);
  expect(editor.redoStack.length).toBe(1);
  editor.redo();
  expect(editor.model.d3Layers.length).toBe(5);
  expect(editor.redoStack.length).toBe(0);
});

logicTest('flowGraphEditor: commit() coalesces board events into one snapshot and skips no-ops', async ({ expect }) => {
  const { store, editor } = loadedEditor();
  const before = editor.toJSON();
  // Simulate a node drag Vue Flow already applied, emitting several events.
  store.state.nodes[1].position.x += 50;
  editor.commit();
  editor.commit();
  await microtasks();
  expect(editor.undoStack.length).toBe(1);
  // Nothing changed since — commit must not push a duplicate state.
  editor.commit();
  await microtasks();
  expect(editor.undoStack.length).toBe(1);
  editor.undo();
  expect(editor.toJSON()).toBe(before);
});

logicTest('flowGraphEditor: a new change after undo clears the redo stack', async ({ expect }) => {
  const { store, editor } = loadedEditor();
  store.state.nodes[1].position.x += 50;
  editor.commit();
  await microtasks();
  editor.undo();
  expect(editor.redoStack.length).toBe(1);
  editor.addLayer(kl('Dense'));
  expect(editor.redoStack.length).toBe(0);
});

// --- editing through the facade -------------------------------------------------------

logicTest('flowGraphEditor: addLayer appends a node with a fresh id (assistant-style before/after diff)', ({ expect }) => {
  const { editor } = loadedEditor();
  const beforeIds = new Set(editor.model.d3Layers.map(l => l.id));
  editor.addLayer(kl('Dense'));
  const created = editor.model.d3Layers.find(l => !beforeIds.has(l.id));
  expect(created.id).toBe(5);
  expect(created.kerasLayer.name).toBe('Dense');
  editor.undo();
  expect(editor.model.d3Layers.length).toBe(5);
});

logicTest('flowGraphEditor: deleteSelectedElements removes selected nodes with their edges, and composites with their children', ({ expect }) => {
  const { store, editor } = loadedEditor();
  store.state.selectedNodes = [store.state.nodes[1]]; // Flatten
  editor.deleteSelectedElements();
  expect(editor.model.d3Layers.length).toBe(4);
  expect(editor.model.d3Edges.length).toBe(2); // 0->1 and 1->2 are gone
  editor.undo();
  // Group Flatten + Dense, then delete the composite: children must go too.
  store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
  editor.model.createComposite();
  const composite = store.state.nodes.find(n => n.type === 'composite');
  store.state.selectedNodes = [composite];
  editor.deleteSelectedElements();
  expect(editor.model.d3Layers.map(l => l.id).sort()).toEqual([0, 3, 4]);
  expect(editor.findLayerById(1)).toBeNull();
  expect(editor.model.d3Edges.length).toBe(1); // only 3 -> 4 survives
});

logicTest('flowGraphEditor: moveLayerTo repositions a node in board coordinates without touching undo', ({ expect }) => {
  const { store, editor } = loadedEditor();
  const depth = editor.undoStack.length;
  editor.moveLayerTo(2, 300, 220);
  expect(store.state.nodes.find(n => n.id === '2').position).toEqual({ x: 300, y: 220 });
  expect(editor.undoStack.length).toBe(depth);
  expect(editor.toJSON()).toContain('"x":300');
  editor.moveLayerTo(99, 0, 0); // unknown id is a no-op
});

logicTest('flowGraphEditor: deleteSelectedElements removes selected edges', ({ expect }) => {
  const { store, editor } = loadedEditor();
  store.state.selectedEdges = [store.state.edges[0]];
  editor.deleteSelectedElements();
  expect(editor.model.d3Edges.length).toBe(3);
  expect(editor.findLayerById(1).inputLayers).toEqual([]);
});

logicTest('flowGraphEditor: deleteSelectedElements with nothing selected does not touch the undo stack', ({ expect }) => {
  const { editor } = loadedEditor();
  const depth = editor.undoStack.length;
  editor.deleteSelectedElements();
  expect(editor.undoStack.length).toBe(depth);
});

logicTest('flowGraphEditor: createComposite clears the selection and is undoable', ({ expect }) => {
  const { store, editor } = loadedEditor();
  store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
  editor.syncSelection();
  expect(editor.selectedNodes.length).toBe(2);
  editor.model.createComposite();
  expect(editor.selectedNodes.length).toBe(0);
  editor.undo();
  expect(editor.model.d3Layers.length).toBe(5);
});

// --- selection sync ---------------------------------------------------------------------

logicTest('flowGraphEditor: mirrors flow selection into stable layer-like wrappers and notifies', ({ expect }) => {
  const { store, editor } = loadedEditor();
  let notified = 0;
  editor.onSelectionChanged(() => { notified += 1; });
  store.state.selectedNodes = [store.state.nodes[2]];
  editor.syncSelection();
  expect(notified).toBe(1);
  expect(editor.selectedNodes.length).toBe(1);
  expect(editor.selectedNodes[0].id).toBe(2);
  // Same live KerasLayer instance as the node data (in-place edits flow to codegen).
  expect(editor.selectedNodes[0].kerasLayer).toBe(store.state.nodes[2].data.nnvp.kerasLayer);
});

logicTest('flowGraphEditor: skips composites (no kerasLayer to edit in the panel)', ({ expect }) => {
  const { store, editor } = loadedEditor();
  store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
  editor.model.createComposite();
  const composite = store.state.nodes.find(n => n.type === 'composite');
  store.state.selectedNodes = [composite, store.state.nodes.find(n => n.id === '0')];
  editor.syncSelection();
  expect(editor.selectedNodes.map(l => l.id)).toEqual([0]);
});

// --- cloud / D3Interface flows ------------------------------------------------------------

logicTest('flowGraphEditor: supports the loadGraphFromJSON sequence (saveState, clear, loadJSON, updateGraph)', ({ expect }) => {
  const { editor } = loadedEditor();
  const original = editor.toJSON();
  let graphChanges = 0;
  editor.onGraphChanged(() => { graphChanges += 1; });
  editor.saveState();
  editor.clearBoard(true);
  editor.model.loadJSON(templates['2D Conv for MNIST']);
  editor.updateGraph();
  expect(editor.model.d3Layers.length).toBe(9);
  expect(graphChanges).toBeGreaterThan(0);
  editor.undo();
  expect(editor.toJSON()).toBe(original);
});

logicTest('flowGraphEditor: toJSON round-trips the loaded template structurally', ({ expect }) => {
  const { editor } = loadedEditor();
  expect(JSON.parse(editor.toJSON())).toEqual(JSON.parse(templates[DENSE_MNIST]));
});
