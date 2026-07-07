import { describe, it, expect } from 'bun:test';
import D3Edge from '../../src/lib/D3Interface/D3Edge';

// A minimal stand-in for a layer: enough surface for D3Edge's constructor
// (id + observer registration) and the geometry helpers (x/y/width/height).
function makeLayer(id, box = {}) {
  return {
    id,
    x: box.x || 0,
    y: box.y || 0,
    width: box.width || 90,
    height: box.height || 40,
    observers: [],
    addObserver(o) { this.observers.push(o); },
    removeObserver(o) { this.observers.splice(this.observers.indexOf(o), 1); },
  };
}

describe('D3Edge', () => {
  it('derives id/htmlID from the endpoints and registers itself as observer', () => {
    const source = makeLayer(3);
    const target = makeLayer(7);
    const edge = new D3Edge(source, target);
    expect(edge.source).toBe(source);
    expect(edge.target).toBe(target);
    expect(edge.id).toBe('s3_t7');
    expect(edge.htmlID).toBe('s3_t7');
    expect(edge.class).toBe('D3Edge');
    expect(edge.d3node).toBe(null);
    // The edge observes both endpoints so it repaints when they move.
    expect(source.observers).toContain(edge);
    expect(target.observers).toContain(edge);
  });

  it('toJSON captures the endpoint ids and html id', () => {
    const edge = new D3Edge(makeLayer(1), makeLayer(2));
    expect(edge.toJSON()).toEqual({
      source: 1,
      target: 2,
      id: 's1_t2',
      htmlID: 's1_t2',
    });
  });

  it('pathFromPoints builds an SVG path from points and [x,y] pairs', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 50 };
    expect(D3Edge.pathFromPoints(a, [10, 20], b)).toBe('M0,0L10,20L100,50');
  });

  it('pathFromPoints supports a single starting point', () => {
    expect(D3Edge.pathFromPoints({ x: 5, y: 6 })).toBe('M5,6');
  });

  it('pathAttrD returns a valid path string for a horizontal layout', () => {
    const edge = {
      source: makeLayer(0, { x: 0, y: 0 }),
      target: makeLayer(1, { x: 300, y: 0 }),
    };
    const d = D3Edge.pathAttrD(edge);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('L');
    // Deterministic: same geometry yields the same path.
    expect(D3Edge.pathAttrD(edge)).toBe(d);
  });

  it('pathAttrD returns a valid path string for a vertical layout', () => {
    const edge = {
      source: makeLayer(0, { x: 0, y: 0 }),
      target: makeLayer(1, { x: 0, y: 300 }),
    };
    const d = D3Edge.pathAttrD(edge);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('L');
  });
});
