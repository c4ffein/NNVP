import { describe, it, expect, beforeEach } from 'bun:test';
import * as d3 from 'd3';
import D3GraphEditor from '../../src/lib/D3Interface/D3GraphEditor';
import D3GraphValidation from '../../src/lib/D3Interface/D3GraphValidation';
import KerasLayer from '../../src/lib/KerasInterface/KerasLayer';

// d3-zoom reads the SVG's intrinsic width/height (via width.baseVal.value) when
// it computes its extent; happy-dom has no layout (sizes would be 0), so
// we define them on the node before handing the selection to the editor.
function makeEditor() {
  document.body.innerHTML = '<div id="svgWrapper"><svg id="svg"></svg></div>';
  const node = document.getElementById('svg');
  const dim = value => ({ baseVal: { value } });
  Object.defineProperty(node, 'width', { value: dim(960), configurable: true });
  Object.defineProperty(node, 'height', { value: dim(500), configurable: true });
  return new D3GraphEditor(d3.select(node));
}

describe('D3GraphEditor', () => {
  let editor;
  beforeEach(() => { editor = makeEditor(); });

  it('starts with empty stacks and no selection', () => {
    expect(editor.model.d3Layers).toHaveLength(0);
    expect(editor.undoStack).toHaveLength(0);
    expect(editor.redoStack).toHaveLength(0);
    expect(editor.selectedNodes).toHaveLength(0);
    expect(editor.selectedEdge).toBe(null);
  });

  it('addLayer draws a layer and snapshots the previous state for undo', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'), 100, 100);
    expect(editor.model.d3Layers).toHaveLength(1);
    expect(editor.undoStack).toHaveLength(1);
    expect(editor.redoStack).toHaveLength(0);
  });

  it('getNodeId hands out ids not already used by a layer', () => {
    expect(editor.getNodeId()).toBe(0);
    editor.addLayer(new KerasLayer('Dense', 'Core'));
    // Layer 0 now exists, so the next id must skip it.
    expect(editor.getNodeId()).toBe(1);
  });

  it('creates an edge between two layers and wires input/output bookkeeping', () => {
    editor.addLayer(new KerasLayer('Input', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    const [a, b] = editor.model.d3Layers;
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);

    expect(editor.model.d3Edges).toHaveLength(1);
    expect(editor.model.d3Edges[0].id).toBe(`s${a.id}_t${b.id}`);
    expect(a.outputLayers).toEqual([b.id]);
    expect(b.inputLayers).toEqual([a.id]);
  });

  it('does not duplicate an already-existing edge', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    const [a, b] = editor.model.d3Layers;
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);
    expect(editor.model.d3Edges).toHaveLength(1);
  });

  it('replaces a reversed edge when linking the opposite direction', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    const [a, b] = editor.model.d3Layers;
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);
    // Linking b -> a removes the existing a -> b edge.
    editor.layerMouseDown(b);
    editor.layerMouseUp(a);
    expect(editor.model.d3Edges).toHaveLength(1);
    expect(editor.model.d3Edges[0].id).toBe(`s${b.id}_t${a.id}`);
  });

  it('undo restores the previous graph and redo re-applies it', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'), 100, 100);
    expect(editor.model.d3Layers).toHaveLength(1);

    editor.undo();
    expect(editor.model.d3Layers).toHaveLength(0);
    expect(editor.undoStack).toHaveLength(0);
    expect(editor.redoStack).toHaveLength(1);

    editor.redo();
    expect(editor.model.d3Layers).toHaveLength(1);
    expect(editor.undoStack).toHaveLength(1);
    expect(editor.redoStack).toHaveLength(0);
  });

  it('undo/redo are no-ops on empty stacks', () => {
    expect(() => editor.undo()).not.toThrow();
    expect(() => editor.redo()).not.toThrow();
    expect(editor.model.d3Layers).toHaveLength(0);
    expect(editor.undoStack).toHaveLength(0);
    expect(editor.redoStack).toHaveLength(0);
  });

  it('saveState clears the redo stack (new action invalidates redo history)', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'));
    editor.undo();
    expect(editor.redoStack).toHaveLength(1);
    // A fresh action must drop the redo history.
    editor.addLayer(new KerasLayer('Dense', 'Core'));
    expect(editor.redoStack).toHaveLength(0);
  });

  it('deleteSelectedElements removes the node, its edges and its input registration', () => {
    editor.addLayer(new KerasLayer('Input', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    const [a, b] = editor.model.d3Layers;
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);
    expect(editor.model.modelInputs).toHaveLength(1);

    editor.singleSelection(a);
    editor.deleteSelectedElements();

    expect(editor.model.d3Layers).toEqual([b]);
    expect(editor.model.d3Edges).toHaveLength(0);
    expect(editor.model.modelInputs).toHaveLength(0);
    expect(b.inputLayers).toEqual([]);
    expect(editor.selectedNodes).toHaveLength(0);
  });

  it('deletes a selected edge without removing its endpoints', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    const [a, b] = editor.model.d3Layers;
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);

    editor.selectEdge(editor.model.d3Edges[0]);
    expect(editor.selectedEdge).not.toBe(null);
    editor.deleteSelectedElements();

    expect(editor.model.d3Edges).toHaveLength(0);
    expect(editor.model.d3Layers).toHaveLength(2);
    expect(editor.selectedEdge).toBe(null);
  });

  it('clearBoard(true) empties the model without prompting', () => {
    editor.addLayer(new KerasLayer('Dense', 'Core'));
    editor.clearBoard(true);
    expect(editor.model.d3Layers).toHaveLength(0);
    expect(editor.model.d3Edges).toHaveLength(0);
  });

  it('isKerasError refreshes the linkError class of a drawn edge', () => {
    editor.addLayer(new KerasLayer('Input', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    const [a, b] = editor.model.d3Layers;
    editor.layerMouseDown(a);
    editor.layerMouseUp(b);
    const edge = editor.model.d3Edges[0];
    // Used to throw "thisEdge is not defined".
    expect(() => D3GraphValidation.isKerasError(editor, edge)).not.toThrow();
    const path = document.querySelector(`#${edge.htmlID} path`);
    expect(path.classList.contains('linkError'))
      .toBe(!!D3GraphValidation.kerasError(editor, edge));
  });

  it('notifyGraphChanged / notifySelectionChanged fire the registered callbacks', () => {
    let graphChanges = 0;
    let selectionChanges = 0;
    editor.onGraphChanged(() => { graphChanges += 1; });
    editor.onSelectionChanged(() => { selectionChanges += 1; });

    editor.addLayer(new KerasLayer('Dense', 'Core'));
    expect(graphChanges).toBe(1);

    const node = editor.model.d3Layers[0];
    editor.singleSelection(node);
    expect(selectionChanges).toBeGreaterThan(0);
  });
});

describe('D3GraphEditor selection bookkeeping', () => {
  let editor;
  beforeEach(() => {
    editor = makeEditor();
    editor.addLayer(new KerasLayer('Dense', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 200, 0);
  });

  it('singleSelection selects exactly one node, replacing any previous selection', () => {
    const [a, b] = editor.model.d3Layers;
    editor.singleSelection(a);
    expect(editor.selectedNodes).toEqual([a]);
    editor.singleSelection(b);
    expect(editor.selectedNodes).toEqual([b]);
  });

  it('selectOnNode accumulates nodes into the multi-selection', () => {
    const [a, b] = editor.model.d3Layers;
    editor.selectOnNode(a);
    editor.selectOnNode(b);
    expect(editor.selectedNodes).toEqual([a, b]);
  });

  it('selectOnNode is idempotent: re-selecting keeps one entry in place', () => {
    // Re-selecting an already-selected node must neither duplicate it nor
    // move it to the end of the selection.
    const [a, b] = editor.model.d3Layers;
    editor.selectOnNode(a);
    editor.selectOnNode(b);
    editor.selectOnNode(a);
    expect(editor.selectedNodes).toEqual([a, b]);
  });

  it('toggleNodeSelection adds an unselected node to the selection', () => {
    const [a, b] = editor.model.d3Layers;
    editor.toggleNodeSelection(a);
    editor.toggleNodeSelection(b);
    expect(editor.selectedNodes).toEqual([a, b]);
  });

  it('toggleNodeSelection deselects an already-selected node', () => {
    const [a, b] = editor.model.d3Layers;
    editor.selectOnNode(a);
    editor.selectOnNode(b);
    editor.toggleNodeSelection(a);
    expect(editor.selectedNodes).toEqual([b]);
  });

  it('undoSelection clears the current selection', () => {
    const [a, b] = editor.model.d3Layers;
    editor.selectOnNode(a);
    editor.selectOnNode(b);
    editor.undoSelection();
    expect(editor.selectedNodes).toHaveLength(0);
  });

  it('removeObserver ignores an object that is not an observer', () => {
    // splice(indexOf(o), 1) with indexOf === -1 used to remove the LAST
    // observer instead of doing nothing.
    editor.layerMouseDown(editor.model.d3Layers[0]);
    editor.layerMouseUp(editor.model.d3Layers[1]);
    const [a] = editor.model.d3Layers;
    const edge = editor.model.d3Edges[0];
    expect(a.observers).toEqual([edge]);
    a.removeObserver({ not: 'an observer' });
    expect(a.observers).toEqual([edge]);
    a.removeObserver(edge);
    expect(a.observers).toEqual([]);
  });

  it('clone returns a fresh layer with copied wiring and a new id', () => {
    editor.layerMouseDown(editor.model.d3Layers[0]);
    editor.layerMouseUp(editor.model.d3Layers[1]);
    const [a, b] = editor.model.d3Layers;
    const copy = b.clone();
    expect(copy).toBeDefined();
    expect(copy).not.toBe(b);
    expect(copy.kerasLayer.name).toBe(b.kerasLayer.name);
    expect(copy.inputLayers).toEqual([a.id]);
    expect(copy.id).not.toBe(a.id);
    expect(copy.id).not.toBe(b.id);
  });

  it('selectEdge clears node selection and unselects a previously selected edge', () => {
    editor.layerMouseDown(editor.model.d3Layers[0]);
    editor.layerMouseUp(editor.model.d3Layers[1]);
    const edge = editor.model.d3Edges[0];

    editor.singleSelection(editor.model.d3Layers[0]);
    editor.selectEdge(edge);
    expect(editor.selectedNodes).toHaveLength(0);
    expect(editor.selectedEdge).toBe(edge);

    editor.undoSelection();
    expect(editor.selectedEdge).toBe(null);
  });
});
