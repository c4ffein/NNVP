import { describe, it, expect } from 'bun:test';
import { getEdgeParams } from '../../src/components/FlowBoard/floatingEdge';

// Minimal GraphNode stand-in: floating geometry only reads computedPosition
// (absolute) and dimensions.
const node = (x, y, width = 100, height = 40) => ({
  computedPosition: { x, y },
  dimensions: { width, height },
});

describe('getEdgeParams', () => {
  it('anchors on facing vertical borders when nodes are side by side', () => {
    const source = node(0, 0);
    const target = node(300, 0);
    const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(source, target);
    expect(sourcePos).toBe('right');
    expect(targetPos).toBe('left');
    expect(sx).toBe(100); // source's right border
    expect(tx).toBe(300); // target's left border
    expect(sy).toBe(20); // vertical centers
    expect(ty).toBe(20);
  });

  it('anchors on facing horizontal borders when nodes are stacked', () => {
    const source = node(0, 0);
    const target = node(0, 200);
    const { sy, ty, sourcePos, targetPos } = getEdgeParams(source, target);
    expect(sourcePos).toBe('bottom');
    expect(targetPos).toBe('top');
    expect(sy).toBe(40); // source's bottom border
    expect(ty).toBe(200); // target's top border
  });

  it('re-anchors when the target moves to the other side', () => {
    const source = node(0, 0);
    const right = getEdgeParams(source, node(300, 0));
    const left = getEdgeParams(source, node(-300, 0));
    expect(right.sourcePos).toBe('right');
    expect(left.sourcePos).toBe('left');
    expect(left.sx).toBe(0); // source's left border
  });

  it('keeps anchor points on the node borders for diagonal placements', () => {
    const source = node(0, 0);
    const target = node(250, 400);
    const { sx, sy, tx, ty } = getEdgeParams(source, target);
    // Each anchor sits ON its node's border rectangle.
    const onBorder = ({ computedPosition: p, dimensions: d }, x, y) => (
      (x === p.x || x === p.x + d.width) && y >= p.y && y <= p.y + d.height)
      || ((y === p.y || y === p.y + d.height) && x >= p.x && x <= p.x + d.width);
    expect(onBorder(source, sx, sy)).toBe(true);
    expect(onBorder(target, tx, ty)).toBe(true);
  });

  it('falls back to centers instead of NaN for unmeasured or concentric nodes', () => {
    const unmeasured = { computedPosition: { x: 50, y: 60 }, dimensions: { width: 0, height: 0 } };
    const a = getEdgeParams(unmeasured, node(300, 0));
    expect(a.sx).toBe(50);
    expect(a.sy).toBe(60);
    const concentric = getEdgeParams(node(0, 0), node(0, 0));
    for (const v of [concentric.sx, concentric.sy, concentric.tx, concentric.ty]) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });
});
