import { describe, it, expect } from 'bun:test';
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

describe('D3Interface reference contracts', () => {
  it('keeps the exact array instances captured by setActiveGraphEditor', () => {
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

  it('exposes templates with a list()', () => {
    const { editor } = makeEditor();
    expect(editor.templates.list()).toContain(DENSE_MNIST);
  });
});

describe('model shim derivations', () => {
  it('mirrors D3Model: d3Layers, d3Edges, modelInputs, modelOutputs, inputLayers', () => {
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

  it('counts a composite as ONE top-level layer but still finds its children', () => {
    const { store, editor } = loadedEditor();
    store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
    editor.model.createComposite();
    expect(editor.model.d3Layers.length).toBe(4);
    const composite = editor.model.d3Layers.find(l => l.class === 'D3LayerComposite');
    expect(composite.id).toBe(5);
    expect(editor.findLayerById(1).name).toBe('Flatten');
  });

  it('findLayerById matches both string and number ids', () => {
    const { editor } = loadedEditor();
    expect(editor.findLayerById(2)).toBe(editor.findLayerById('2'));
    expect(editor.findLayerById(99)).toBeNull();
  });
});

describe('kerasLayer revival', () => {
  it('restores live KerasLayer instances so the panels can setParameterValue', () => {
    const { editor } = loadedEditor();
    const dense = editor.findLayerById(2);
    expect(typeof dense.kerasLayer.setParameterValue).toBe('function');
    dense.kerasLayer.setParameterValue('units', 99);
    expect(editor.toJSON()).toContain('"units":99');
  });

  it('keeps instances live across undo/redo', () => {
    const { editor } = loadedEditor();
    editor.findLayerById(2).kerasLayer.setParameterValue('units', 99);
    editor.saveState();
    editor.clearBoard(true);
    editor.undo();
    const revived = editor.findLayerById(2);
    expect(typeof revived.kerasLayer.setParameterValue).toBe('function');
    expect(revived.kerasLayer.parameterValues.units).toBe(99);
  });
});

describe('undo / redo', () => {
  it('loadTemplate is undoable back to the previous board', () => {
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

  it('commit() coalesces board events into one snapshot and skips no-ops', async () => {
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

  it('a new change after undo clears the redo stack', async () => {
    const { store, editor } = loadedEditor();
    store.state.nodes[1].position.x += 50;
    editor.commit();
    await microtasks();
    editor.undo();
    expect(editor.redoStack.length).toBe(1);
    editor.addLayer(kl('Dense'));
    expect(editor.redoStack.length).toBe(0);
  });
});

describe('editing through the facade', () => {
  it('addLayer appends a node with a fresh id (assistant-style before/after diff)', () => {
    const { editor } = loadedEditor();
    const beforeIds = new Set(editor.model.d3Layers.map(l => l.id));
    editor.addLayer(kl('Dense'));
    const created = editor.model.d3Layers.find(l => !beforeIds.has(l.id));
    expect(created.id).toBe(5);
    expect(created.kerasLayer.name).toBe('Dense');
    editor.undo();
    expect(editor.model.d3Layers.length).toBe(5);
  });

  it('deleteSelectedElements removes selected nodes with their edges, and composites with their children', () => {
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

  it('moveLayerTo repositions a node in board coordinates without touching undo', () => {
    const { store, editor } = loadedEditor();
    const depth = editor.undoStack.length;
    editor.moveLayerTo(2, 300, 220);
    expect(store.state.nodes.find(n => n.id === '2').position).toEqual({ x: 300, y: 220 });
    expect(editor.undoStack.length).toBe(depth);
    expect(editor.toJSON()).toContain('"x":300');
    editor.moveLayerTo(99, 0, 0); // unknown id is a no-op
  });

  it('deleteSelectedElements removes selected edges', () => {
    const { store, editor } = loadedEditor();
    store.state.selectedEdges = [store.state.edges[0]];
    editor.deleteSelectedElements();
    expect(editor.model.d3Edges.length).toBe(3);
    expect(editor.findLayerById(1).inputLayers).toEqual([]);
  });

  it('deleteSelectedElements with nothing selected does not touch the undo stack', () => {
    const { editor } = loadedEditor();
    const depth = editor.undoStack.length;
    editor.deleteSelectedElements();
    expect(editor.undoStack.length).toBe(depth);
  });

  it('createComposite clears the selection and is undoable', () => {
    const { store, editor } = loadedEditor();
    store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
    editor.syncSelection();
    expect(editor.selectedNodes.length).toBe(2);
    editor.model.createComposite();
    expect(editor.selectedNodes.length).toBe(0);
    editor.undo();
    expect(editor.model.d3Layers.length).toBe(5);
  });
});

describe('selection sync', () => {
  it('mirrors flow selection into stable layer-like wrappers and notifies', () => {
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

  it('skips composites (no kerasLayer to edit in the panel)', () => {
    const { store, editor } = loadedEditor();
    store.state.selectedNodes = [store.state.nodes[1], store.state.nodes[2]];
    editor.model.createComposite();
    const composite = store.state.nodes.find(n => n.type === 'composite');
    store.state.selectedNodes = [composite, store.state.nodes.find(n => n.id === '0')];
    editor.syncSelection();
    expect(editor.selectedNodes.map(l => l.id)).toEqual([0]);
  });
});

describe('cloud / D3Interface flows', () => {
  it('supports the loadGraphFromJSON sequence (saveState, clear, loadJSON, updateGraph)', () => {
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

  it('toJSON round-trips the loaded template structurally', () => {
    const { editor } = loadedEditor();
    expect(JSON.parse(editor.toJSON())).toEqual(JSON.parse(templates[DENSE_MNIST]));
  });
});
