import { describe, it, expect, beforeEach } from 'bun:test';
import * as d3 from 'd3';
import D3Interface from '../../src/lib/D3Interface/D3Interface';
import D3GraphEditor from '../../src/lib/D3Interface/D3GraphEditor';
import KerasLayer from '../../src/lib/KerasInterface/KerasLayer';

// Real graph editor, with the SVG geometry shim d3-zoom needs under happy-dom.
function makeEditor() {
  document.body.innerHTML = '<div id="svgWrapper"><svg id="svg"></svg></div>';
  const node = document.getElementById('svg');
  const dim = value => ({ baseVal: { value } });
  Object.defineProperty(node, 'width', { value: dim(960), configurable: true });
  Object.defineProperty(node, 'height', { value: dim(500), configurable: true });
  return new D3GraphEditor(d3.select(node));
}

describe('D3Interface event bus', () => {
  let iface;
  beforeEach(() => { iface = new D3Interface(); });

  it('emit calls every registered listener with the payload', () => {
    const received = [];
    iface.on('ping', data => received.push(['a', data]));
    iface.on('ping', data => received.push(['b', data]));
    iface.emit('ping', 42);
    expect(received).toEqual([['a', 42], ['b', 42]]);
  });

  it('emit on an event with no listeners is a no-op', () => {
    expect(() => iface.emit('nobody-home', 1)).not.toThrow();
  });

  it('off removes a specific listener and leaves the others', () => {
    const received = [];
    const first = () => received.push('first');
    const second = () => received.push('second');
    iface.on('ev', first);
    iface.on('ev', second);
    iface.off('ev', first);
    iface.emit('ev');
    expect(received).toEqual(['second']);
  });

  it('off on an unknown event is a no-op', () => {
    expect(() => iface.off('unknown', () => {})).not.toThrow();
  });
});

describe('D3Interface active-graph delegation', () => {
  let iface;
  beforeEach(() => { iface = new D3Interface(); });

  it('getActiveElements returns null when there is no active graph', () => {
    expect(iface.activeGraph).toBe(null);
    expect(iface.getActiveElements()).toBe(null);
  });

  it('delegating methods are safe no-ops when there is no active graph', () => {
    expect(() => iface.undo()).not.toThrow();
    expect(() => iface.redo()).not.toThrow();
    expect(() => iface.addLayer(new KerasLayer('Dense', 'Core'))).not.toThrow();
    expect(() => iface.deleteSelectedElements()).not.toThrow();
    expect(iface.generateJavascriptNoSave({})).toBe(null);
  });

  it('addGraphEditor activates the first editor and exposes its selection', () => {
    const editor = makeEditor();
    iface.addGraphEditor(editor);
    expect(iface.graphEditors).toContain(editor);
    expect(iface.activeGraph).toBe(editor);
    expect(iface.getActiveElements()).toBe(editor.selectedNodes);
    expect(iface.getActiveElementsContainer().e).toBe(editor.selectedNodes);
    expect(iface.getUndoStackContainer().e).toBe(editor.undoStack);
    expect(iface.getRedoStackContainer().e).toBe(editor.redoStack);
  });

  it('addGraphEditor does not re-activate once an active graph exists', () => {
    const first = makeEditor();
    const second = makeEditor();
    iface.addGraphEditor(first);
    iface.addGraphEditor(second);
    expect(iface.activeGraph).toBe(first);
    expect(iface.graphEditors).toHaveLength(2);
  });

  it('wires editor selection/graph changes onto the event bus', () => {
    let selectionEvents = 0;
    let graphEvents = 0;
    iface.on('selection-changed', () => { selectionEvents += 1; });
    iface.on('graph-changed', () => { graphEvents += 1; });

    const editor = makeEditor();
    iface.addGraphEditor(editor);
    // setActiveGraphEditor emits one selection-changed during activation.
    const baseline = selectionEvents;

    editor.addLayer(new KerasLayer('Dense', 'Core'));
    expect(graphEvents).toBe(1);

    editor.singleSelection(editor.model.d3Layers[0]);
    expect(selectionEvents).toBeGreaterThan(baseline);
  });

  it('setActiveGraphEditor emits the reactive refresh events', () => {
    const editor = makeEditor();
    const emitted = [];
    ['templates-changed', 'selection-changed', 'undo-stack-changed', 'redo-stack-changed']
      .forEach(name => iface.on(name, () => emitted.push(name)));
    iface.setActiveGraphEditor(editor);
    expect(emitted).toEqual([
      'templates-changed', 'selection-changed', 'undo-stack-changed', 'redo-stack-changed',
    ]);
  });

  it('findLayerById delegates to the active graph', () => {
    const editor = makeEditor();
    iface.addGraphEditor(editor);
    editor.addLayer(new KerasLayer('Dense', 'Core'));
    const layer = editor.model.d3Layers[0];
    expect(iface.findLayerById(layer.id)).toBe(layer);
    expect(iface.findLayerById(9999)).toBe(null);
  });

  it('addLayer / deleteSelectedElements / undo delegate to the active graph', () => {
    const editor = makeEditor();
    iface.addGraphEditor(editor);

    iface.addLayer(new KerasLayer('Dense', 'Core'));
    expect(editor.model.d3Layers).toHaveLength(1);

    editor.singleSelection(editor.model.d3Layers[0]);
    iface.deleteSelectedElements();
    expect(editor.model.d3Layers).toHaveLength(0);

    iface.undo();
    expect(editor.model.d3Layers).toHaveLength(1);
  });
});

describe('D3Interface.debugGetBoardState', () => {
  it('returns empty counters when there is no active graph', () => {
    const iface = new D3Interface();
    const state = iface.debugGetBoardState();
    expect(state).toEqual({
      layers: [], inputs: [], outputs: [], edges: [], undoStack: 0, redoStack: 0,
    });
  });

  // Regression: debugGetBoardState read model.layers / model.edges, but D3Model
  // exposes those as d3Layers / d3Edges. With a populated graph the getter threw
  // "Cannot read properties of undefined (reading 'map')". It must report state.
  it('reports the real board state for a populated graph', () => {
    const iface = new D3Interface();
    const editor = makeEditor();
    iface.addGraphEditor(editor);
    editor.addLayer(new KerasLayer('Input', 'Core'), 0, 0);
    editor.addLayer(new KerasLayer('Dense', 'Core'), 300, 0);
    editor.layerMouseDown(editor.model.d3Layers[0]);
    editor.layerMouseUp(editor.model.d3Layers[1]);

    const state = iface.debugGetBoardState();
    expect(state.layers.map(l => l.id)).toEqual(editor.model.d3Layers.map(l => l.id));
    expect(state.edges).toBe(1);
    expect(state.inputs).toBe(editor.model.modelInputs);
    expect(state.outputs).toBe(editor.model.modelOutputs);
  });
});
