// Floating-edge geometry: instead of fixed handles, an edge attaches where
// the line between the two node centers crosses each node's border, so links
// re-anchor to the best sides as nodes are dragged around.
// Rectangle-intersection math adapted from the Vue Flow floating-edges example.
//
// Side names are Vue Flow's Position enum values, inlined as strings so this
// stays a pure module (unit-testable under bun without loading Vue).
const Position = {
  Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom',
};

// Point where the segment [center(node) -> center(otherNode)] crosses the
// border of `node`. Nodes are Vue Flow GraphNodes: `computedPosition` is
// absolute (composite children included) and `dimensions` the rendered size.
function getNodeIntersection(node, otherNode) {
  const { width, height } = node.dimensions;
  const w = width / 2;
  const h = height / 2;
  const x2 = node.computedPosition.x + w;
  const y2 = node.computedPosition.y + h;
  const x1 = otherNode.computedPosition.x + otherNode.dimensions.width / 2;
  const y1 = otherNode.computedPosition.y + otherNode.dimensions.height / 2;

  // Degenerate cases: unmeasured/point-sized node, or concentric nodes —
  // fall back to the center instead of producing NaN coordinates.
  if (!w || !h) return { x: x2, y: y2 };
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1));
  if (!Number.isFinite(a)) return { x: x2, y: y2 };
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

// Which side of the node the intersection point sits on (drives the bezier
// control-point direction).
function getEdgePosition(node, point) {
  const nx = Math.round(node.computedPosition.x);
  const ny = Math.round(node.computedPosition.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  if (px <= nx + 1) return Position.Left;
  if (px >= nx + node.dimensions.width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + node.dimensions.height - 1) return Position.Bottom;
  return Position.Top;
}

// Everything getBezierPath needs to draw a floating edge between two nodes.
export function getEdgeParams(source, target) {
  const sourceIntersection = getNodeIntersection(source, target);
  const targetIntersection = getNodeIntersection(target, source);
  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePos: getEdgePosition(source, sourceIntersection),
    targetPos: getEdgePosition(target, targetIntersection),
  };
}
