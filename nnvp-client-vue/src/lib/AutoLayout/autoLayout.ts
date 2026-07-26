// Sugiyama-lite layered layout for the board's graphs.
//
// Pure function, no dependencies: FlowGraphEditor.autoLayout() feeds it plain
// {nodes, edges} (top level first, then one sub-layout per composite) and
// applies the returned positions itself. Graphs may contain cycles (drawable
// on the board since Phase D, and present in legacy D3-era files) —
// back-edges found by DFS are ignored so layering always terminates.
//
// Deterministic: nodes are processed in id order and every tie breaks by id,
// so the same graph lays out identically regardless of input array order.

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutGraph {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export interface LayoutOptions {
  /** Horizontal gap between a layer's widest node and the next layer. */
  hGap?: number;
  /** Vertical gap between two nodes of the same layer. */
  vGap?: number;
  /** Footprint used when a node carries no width/height. */
  defaultWidth?: number;
  defaultHeight?: number;
  /** Vertical gap between two disconnected components of the graph. */
  componentGap?: number;
}

// Defaults sized for the board's ~90-120px x 40px layer nodes: successive
// layers land ~200px apart and siblings ~90px apart; disconnected components
// get a clearly-bigger gap than siblings so "not wired yet" stays readable.
const DEFAULTS: Required<LayoutOptions> = {
  hGap: 80, vGap: 50, defaultWidth: 120, defaultHeight: 40, componentGap: 120,
};

/** Numeric-aware, total and deterministic id order (layer ids are numbers). */
function compareIds(a: string, b: string): number {
  const numericA = Number(a);
  const numericB = Number(b);
  if (Number.isFinite(numericA) && Number.isFinite(numericB) && numericA !== numericB) {
    return numericA - numericB;
  }
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Indices (into `edges`) of the back-edges of an iterative DFS started from
 * every node in id order. Removing them leaves an acyclic graph; on a real
 * DAG the set is empty. Self-loops always count as back-edges.
 */
function findBackEdgeIndices(ids: string[], edges: LayoutEdge[]): Set<number> {
  const outgoing = new Map<string, Array<{ target: string; index: number }>>();
  ids.forEach(id => outgoing.set(id, []));
  const back = new Set<number>();
  edges.forEach((edge, index) => {
    if (edge.source === edge.target) back.add(index);
    else outgoing.get(edge.source)!.push({ target: edge.target, index });
  });
  const UNSEEN = 0;
  const OPEN = 1; // on the current DFS path
  const DONE = 2;
  const state = new Map<string, number>();
  ids.forEach((root) => {
    if (state.get(root)) return;
    state.set(root, OPEN);
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const out = outgoing.get(frame.id)!;
      if (frame.next >= out.length) {
        state.set(frame.id, DONE);
        stack.pop();
        continue; // eslint-disable-line no-continue
      }
      const { target, index } = out[frame.next]!;
      frame.next += 1;
      const targetState = state.get(target) ?? UNSEEN;
      if (targetState === OPEN) back.add(index);
      else if (targetState === UNSEEN) {
        state.set(target, OPEN);
        stack.push({ id: target, next: 0 });
      }
    }
  });
  return back;
}

/** Longest path from the sources, over the acyclic forward edges. */
function assignLayers(ids: string[], edges: LayoutEdge[]): Map<string, number> {
  const layer = new Map<string, number>();
  const indegree = new Map<string, number>();
  ids.forEach((id) => { layer.set(id, 0); indegree.set(id, 0); });
  edges.forEach(edge => indegree.set(edge.target, indegree.get(edge.target)! + 1));
  const queue = ids.filter(id => indegree.get(id) === 0);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    edges.forEach((edge) => {
      if (edge.source !== current) return;
      layer.set(edge.target, Math.max(layer.get(edge.target)!, layer.get(current)! + 1));
      indegree.set(edge.target, indegree.get(edge.target)! - 1);
      if (indegree.get(edge.target) === 0) queue.push(edge.target);
    });
  }
  return layer;
}

/**
 * A few median/barycenter sweeps to order each layer by its neighbors in the
 * adjacent layer, cutting crossings. Nodes without neighbors keep their spot;
 * ties break by id.
 */
function orderLayers(
  layers: string[][],
  layerOf: Map<string, number>,
  edges: LayoutEdge[],
): void {
  const neighborsBelow = new Map<string, string[]>(); // predecessors (previous layer side)
  const neighborsAbove = new Map<string, string[]>(); // successors (next layer side)
  edges.forEach((edge) => {
    if (!neighborsBelow.has(edge.target)) neighborsBelow.set(edge.target, []);
    neighborsBelow.get(edge.target)!.push(edge.source);
    if (!neighborsAbove.has(edge.source)) neighborsAbove.set(edge.source, []);
    neighborsAbove.get(edge.source)!.push(edge.target);
  });
  const sortByNeighbors = (index: number, neighbors: Map<string, string[]>, reference: number) => {
    const referencePosition = new Map(layers[reference]!.map((id, at) => [id, at]));
    const currentPosition = new Map(layers[index]!.map((id, at) => [id, at]));
    const barycenter = (id: string): number => {
      const positions = (neighbors.get(id) || [])
        .filter(other => layerOf.get(other) === reference)
        .map(other => referencePosition.get(other)!);
      if (positions.length === 0) return currentPosition.get(id)!;
      return positions.reduce((sum, position) => sum + position, 0) / positions.length;
    };
    const keyed = layers[index]!.map(id => ({ id, key: barycenter(id) }));
    keyed.sort((a, b) => (a.key - b.key) || compareIds(a.id, b.id));
    layers[index] = keyed.map(entry => entry.id); // eslint-disable-line no-param-reassign
  };
  const SWEEPS = 4;
  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    for (let index = 1; index < layers.length; index += 1) {
      sortByNeighbors(index, neighborsBelow, index - 1);
    }
    for (let index = layers.length - 2; index >= 0; index -= 1) {
      sortByNeighbors(index, neighborsAbove, index + 1);
    }
  }
}

/**
 * Ids grouped into weakly-connected components (edge direction ignored),
 * each sorted by id, components ordered by their smallest id.
 */
function connectedComponents(ids: string[], edges: LayoutEdge[]): string[][] {
  const neighbors = new Map<string, string[]>(ids.map(id => [id, []]));
  edges.forEach((edge) => {
    neighbors.get(edge.source)!.push(edge.target);
    neighbors.get(edge.target)!.push(edge.source);
  });
  const seen = new Set<string>();
  const components: string[][] = [];
  ids.forEach((root) => {
    if (seen.has(root)) return;
    const component: string[] = [];
    const stack = [root];
    seen.add(root);
    while (stack.length > 0) {
      const id = stack.pop()!;
      component.push(id);
      neighbors.get(id)!.forEach((next) => {
        if (seen.has(next)) return;
        seen.add(next);
        stack.push(next);
      });
    }
    components.push(component.sort(compareIds));
  });
  return components;
}

/**
 * Lay out the graph left to right: x grows with the layer (longest path from
 * the sources), nodes of a layer stack vertically, each layer vertically
 * centered on y = 0. Disconnected components are laid out independently and
 * stacked top to bottom, componentGap apart, so unwired nodes never read as
 * part of a chain. Coordinates are the nodes' top-left corners, like the
 * board's. Unknown edge endpoints are ignored.
 *
 * @returns node id -> new position
 */
export default function autoLayout(
  graph: LayoutGraph,
  options?: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const settings = { ...DEFAULTS, ...options };
  const allNodes = [...graph.nodes].sort((a, b) => compareIds(a.id, b.id));
  const known = new Set(allNodes.map(node => node.id));
  const allEdges = graph.edges.filter(edge => known.has(edge.source) && known.has(edge.target));
  const nodeById = new Map(allNodes.map(node => [node.id, node]));
  const positions = new Map<string, { x: number; y: number }>();
  // The first component keeps its y-centered-on-0 coordinates (identical to
  // the single-component output); each next one shifts below the previous.
  let nextTop: number | null = null;
  connectedComponents(allNodes.map(node => node.id), allEdges).forEach((componentIds) => {
    const inComponent = new Set(componentIds);
    const component = layoutComponent(
      componentIds.map(id => nodeById.get(id)!),
      allEdges.filter(edge => inComponent.has(edge.source) && inComponent.has(edge.target)),
      settings,
    );
    let minY = Infinity;
    let maxY = -Infinity;
    component.forEach(({ y }, id) => {
      const height = nodeById.get(id)!.height ?? settings.defaultHeight;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
    });
    const offsetY = nextTop === null ? 0 : nextTop - minY;
    component.forEach(({ x, y }, id) => positions.set(id, { x, y: y + offsetY }));
    nextTop = maxY + offsetY + settings.componentGap;
  });
  return positions;
}

/** One weakly-connected component through the full layered pipeline. */
function layoutComponent(
  sortedNodes: LayoutNode[],
  edges: LayoutEdge[],
  options: Required<LayoutOptions>,
): Map<string, { x: number; y: number }> {
  const {
    hGap, vGap, defaultWidth, defaultHeight,
  } = options;
  const nodes = sortedNodes;
  const ids = nodes.map(node => node.id);
  const backEdges = findBackEdgeIndices(ids, edges);
  const forward = edges.filter((edge, index) => !backEdges.has(index));
  const layerOf = assignLayers(ids, forward);
  const layers: string[][] = [];
  ids.forEach((id) => {
    const at = layerOf.get(id)!;
    while (layers.length <= at) layers.push([]);
    layers[at]!.push(id);
  });
  orderLayers(layers, layerOf, forward);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const positions = new Map<string, { x: number; y: number }>();
  let x = 0;
  layers.forEach((layerIds) => {
    const width = (id: string) => byId.get(id)!.width ?? defaultWidth;
    const height = (id: string) => byId.get(id)!.height ?? defaultHeight;
    const totalHeight = layerIds.reduce((sum, id) => sum + height(id), 0)
      + vGap * (layerIds.length - 1);
    let y = -totalHeight / 2;
    layerIds.forEach((id) => {
      positions.set(id, { x, y });
      y += height(id) + vGap;
    });
    x += Math.max(...layerIds.map(width)) + hGap;
  });
  return positions;
}
