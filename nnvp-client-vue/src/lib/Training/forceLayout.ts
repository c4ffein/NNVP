/**
 * forceLayout.ts — the physics behind the Obsidian-style Map (Phase H).
 *
 * Classic force-directed simulation: pairwise repulsion, springs along the
 * lineage edges, a light pull toward the origin, velocity damping. Fully
 * DETERMINISTIC — initial positions come from a golden-angle spiral (no
 * randomness anywhere), so the same history settles into the same map on
 * every device and in every test. Pure module: the component owns when to
 * tick (settle synchronously on build, animate only during interactions).
 */

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pinned (being dragged / user-fixed): forces skip it entirely. */
  fixed?: boolean;
}

export interface ForceEdge {
  source: string;
  target: string;
}

export interface ForceParams {
  /** Coulomb-style pair repulsion strength. */
  repulsion: number;
  /** Spring stiffness along edges. */
  spring: number;
  /** Edge rest length — the "comfortable" link distance. */
  restLength: number;
  /** Pull toward the centroid, keeps disconnected pieces from drifting off. */
  gravity: number;
  /** Velocity kept per tick (0..1). */
  damping: number;
}

// restLength deliberately sits BELOW the repulsion/gravity equilibrium
// spacing (~200 for small graphs, wider for large): that's what makes a
// link VISIBLY bind two nodes tighter than the unlinked field.
export const DEFAULT_FORCE_PARAMS: ForceParams = {
  repulsion: 70000,
  spring: 0.06,
  restLength: 180,
  gravity: 0.012,
  damping: 0.82,
};

/** Deterministic starting layout: a golden-angle spiral, ids in sorted order. */
export function seedPositions(ids: string[], spacing = 60): ForceNode[] {
  return [...ids].sort().map((id, index) => {
    const angle = index * 2.399963; // the golden angle — no two collinear
    const radius = spacing * Math.sqrt(index + 0.5);
    return {
      id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0,
    };
  });
}

/**
 * One simulation step (mutates). Returns the total movement this tick — a
 * settling signal: callers stop (or keep animating) on its decay.
 */
export function tick(
  nodes: ForceNode[],
  edges: ForceEdge[],
  params: ForceParams = DEFAULT_FORCE_PARAMS,
): number {
  const byId = new Map(nodes.map(node => [node.id, node]));
  // Repulsion: every pair pushes apart, 1/d² with a floor against blowups.
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const squared = Math.max(400, dx * dx + dy * dy);
      const distance = Math.sqrt(squared);
      const force = params.repulsion / squared;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }
  // Springs along edges, toward the rest length.
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue; // eslint-disable-line no-continue
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const stretch = (distance - params.restLength) * params.spring;
    const fx = (dx / distance) * stretch;
    const fy = (dy / distance) * stretch;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }
  // Light gravity toward the centroid + integrate.
  const cx = nodes.reduce((sum, node) => sum + node.x, 0) / (nodes.length || 1);
  const cy = nodes.reduce((sum, node) => sum + node.y, 0) / (nodes.length || 1);
  let movement = 0;
  for (const node of nodes) {
    if (node.fixed) { node.vx = 0; node.vy = 0; continue; } // eslint-disable-line no-continue
    node.vx = (node.vx + (cx - node.x) * params.gravity) * params.damping;
    node.vy = (node.vy + (cy - node.y) * params.gravity) * params.damping;
    node.x += node.vx;
    node.y += node.vy;
    movement += Math.hypot(node.vx, node.vy);
  }
  return movement;
}

/** Run up to `ticks` steps, stopping early once movement is negligible. */
export function simulate(
  nodes: ForceNode[],
  edges: ForceEdge[],
  ticks: number,
  params: ForceParams = DEFAULT_FORCE_PARAMS,
): void {
  for (let step = 0; step < ticks; step += 1) {
    if (tick(nodes, edges, params) < 0.5) return;
  }
}
