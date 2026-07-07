import { describe, it, expect } from 'bun:test';
import D3Model from '../../src/lib/D3Interface/D3Model';
import D3Edge from '../../src/lib/D3Interface/D3Edge';
import KerasLayer from '../../src/lib/KerasInterface/KerasLayer';

// D3Model holds the pure graph state (layers, edges, model inputs/outputs) and
// the serialization used by save / undo / redo. None of these paths need an SVG,
// so we exercise the real model in isolation (happy-dom only for window.JSON).

describe('D3Model', () => {
  it('constructs empty by default', () => {
    const model = new D3Model();
    expect(model.d3Layers).toEqual([]);
    expect(model.d3Edges).toEqual([]);
    expect(model.modelInputs).toEqual([]);
    expect(model.modelOutputs).toEqual([]);
  });

  it('keeps the layers/edges/editor passed to the constructor', () => {
    const layers = [{ id: 1 }];
    const edges = [{ id: 's1_t2' }];
    const editor = { name: 'editor' };
    const model = new D3Model(layers, edges, editor);
    expect(model.d3Layers).toBe(layers);
    expect(model.d3Edges).toBe(edges);
    expect(model.editor).toBe(editor);
  });

  it('addLayer appends and returns the created layer', () => {
    const model = new D3Model();
    const layer = model.addLayer(0, new KerasLayer('Dense', 'Core'), 10, 20);
    expect(model.d3Layers).toEqual([layer]);
    expect(layer.id).toBe(0);
    expect(layer.x).toBe(10);
    expect(layer.y).toBe(20);
    expect(layer.class).toBe('D3Layer');
  });

  it('registers an Input layer in modelInputs on creation', () => {
    const model = new D3Model();
    const input = model.addLayer(0, new KerasLayer('Input', 'Core'), 0, 0);
    const dense = model.addLayer(1, new KerasLayer('Dense', 'Core'), 0, 0);
    expect(model.modelInputs).toEqual([input]);
    expect(model.modelInputs).not.toContain(dense);
  });

  it('findLayerById returns the matching layer or null', () => {
    const model = new D3Model();
    const a = model.addLayer(0, new KerasLayer('Dense', 'Core'), 0, 0);
    const b = model.addLayer(5, new KerasLayer('Dense', 'Core'), 0, 0);
    expect(model.findLayerById(0)).toBe(a);
    expect(model.findLayerById(5)).toBe(b);
    expect(model.findLayerById(999)).toBe(null);
  });

  it('primeAncestorOfId returns the top-level layer owning an id', () => {
    const model = new D3Model();
    const a = model.addLayer(0, new KerasLayer('Dense', 'Core'), 0, 0);
    expect(model.primeAncestorOfId(0)).toBe(a);
    expect(model.primeAncestorOfId(42)).toBe(null);
  });

  it('clear resets every collection', () => {
    const model = new D3Model();
    model.addLayer(0, new KerasLayer('Input', 'Core'), 0, 0);
    model.modelOutputs.push({ id: 0 });
    model.d3Edges.push({ id: 'x' });
    model.clear();
    expect(model.d3Layers).toEqual([]);
    expect(model.d3Edges).toEqual([]);
    expect(model.modelInputs).toEqual([]);
    expect(model.modelOutputs).toEqual([]);
  });

  it('toJSON serializes layers, edges, inputs and outputs by id', () => {
    const model = new D3Model();
    const input = model.addLayer(0, new KerasLayer('Input', 'Core'), 0, 0);
    const dense = model.addLayer(1, new KerasLayer('Dense', 'Core'), 100, 0);
    const edge = new D3Edge(input, dense);
    model.d3Edges.push(edge);
    model.modelOutputs.push(dense);

    const parsed = JSON.parse(model.toJSON());
    expect(parsed.layers.map(l => l.id)).toEqual([0, 1]);
    expect(parsed.edges).toEqual([{ source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' }]);
    expect(parsed.inputs).toEqual([0]);
    expect(parsed.outputs).toEqual([1]);
  });

  it('loadState reconstructs layers, edges and inputs/outputs from JSON', () => {
    const source = new D3Model();
    const input = source.addLayer(0, new KerasLayer('Input', 'Core'), 0, 0);
    const dense = source.addLayer(1, new KerasLayer('Dense', 'Core'), 100, 0);
    source.d3Edges.push(new D3Edge(input, dense));
    source.modelOutputs.push(dense);
    const json = source.toJSON();

    const target = new D3Model();
    target.loadState(json);

    expect(target.d3Layers.map(l => l.id)).toEqual([0, 1]);
    expect(target.d3Edges).toHaveLength(1);
    expect(target.d3Edges[0].source.id).toBe(0);
    expect(target.d3Edges[0].target.id).toBe(1);
    expect(target.modelInputs.map(l => l.id)).toEqual([0]);
    expect(target.modelOutputs.map(l => l.id)).toEqual([1]);
  });

  it('loadState replaces any previous state', () => {
    const model = new D3Model();
    model.addLayer(7, new KerasLayer('Dense', 'Core'), 0, 0);
    model.loadState(JSON.stringify({ layers: [], edges: [], inputs: [], outputs: [] }));
    expect(model.d3Layers).toEqual([]);
    expect(model.d3Edges).toEqual([]);
    expect(model.modelInputs).toEqual([]);
    expect(model.modelOutputs).toEqual([]);
  });
});
