// Edge-of-board arrows for layers that sit outside the visible viewport.
//
// Pure viewport math (no Vue Flow imports) so the whole feature is
// unit-testable: given the nodes, the current viewport transform and the pane
// size, return indicators sitting where the ray FROM THE SCREEN CENTER toward
// the layer crosses the pane border (inset by `padding`), angled along that
// ray — so panning toward an arrow always leads to its layer.
//
// Off-screen layers in the same direction would land on the same border spot
// and stack into an unusable pile (a whole template column collapses onto one
// point), so indicators within the same CLUSTER_CELL-sized cell merge into a
// single arrow carrying a count; it targets the cluster's closest layer.

const FALLBACK_WIDTH = 150;
const FALLBACK_HEIGHT = 40;
const CLUSTER_CELL = 36;

// Where the ray from `origin` toward `target` crosses the rectangle
// [pad, width - pad] x [pad, height - pad] around `origin`.
function rayToBorder(origin, target, paneSize, padding) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const tx = dx > 0 ? (paneSize.width - padding - origin.x) / dx
    : dx < 0 ? (padding - origin.x) / dx : Infinity;
  const ty = dy > 0 ? (paneSize.height - padding - origin.y) / dy
    : dy < 0 ? (padding - origin.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: origin.x + dx * t, y: origin.y + dy * t, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

export default function offscreenIndicators(nodes, viewport, paneSize, padding = 28) {
  if (!paneSize || paneSize.width <= 0 || paneSize.height <= 0) return [];
  const { zoom } = viewport;
  const raw = [];
  for (const node of nodes) {
    if (node.hidden) continue;
    // computedPosition is absolute even for children of composite blocks;
    // plain position is relative to the parent there.
    const position = node.computedPosition || node.position;
    const width = ((node.dimensions && node.dimensions.width) || FALLBACK_WIDTH) * zoom;
    const height = ((node.dimensions && node.dimensions.height) || FALLBACK_HEIGHT) * zoom;
    const left = position.x * zoom + viewport.x;
    const top = position.y * zoom + viewport.y;
    const intersects = left < paneSize.width && left + width > 0
      && top < paneSize.height && top + height > 0;
    if (intersects) continue;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const screenCenter = { x: paneSize.width / 2, y: paneSize.height / 2 };
    const { x, y, angle } = rayToBorder(screenCenter, { x: centerX, y: centerY }, paneSize, padding);
    raw.push({
      id: node.id,
      label: (node.data && node.data.label) || node.id,
      x,
      y,
      angle,
      // How far off screen the layer is: the cluster pans to its closest one.
      distance: Math.hypot(centerX - x, centerY - y),
    });
  }

  const cells = new Map();
  for (const indicator of raw) {
    const key = `${Math.round(indicator.x / CLUSTER_CELL)},${Math.round(indicator.y / CLUSTER_CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(indicator);
  }

  const clustered = [];
  for (const members of cells.values()) {
    const closest = members.reduce((a, b) => (b.distance < a.distance ? b : a));
    const x = members.reduce((sum, m) => sum + m.x, 0) / members.length;
    const y = members.reduce((sum, m) => sum + m.y, 0) / members.length;
    clustered.push({
      id: closest.id,
      label: closest.label,
      x,
      y,
      angle: closest.angle,
      count: members.length,
    });
  }
  return clustered;
}
