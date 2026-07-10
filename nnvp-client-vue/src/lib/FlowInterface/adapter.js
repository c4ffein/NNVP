// NNVP graph JSON <-> Vue Flow nodes/edges.
//
// The NNVP side is exactly what D3Model.toJSON emits (and loadJSON accepts):
//   { layers: [...], edges: [{source, target, id, htmlID}], inputs: [ids], outputs: [ids] }
// with composite layers carrying their children recursively and children using
// ABSOLUTE board coordinates. Vue Flow children instead use coordinates
// relative to their parent node, so the converters translate positions both
// ways. Everything the flow side does not model (htmlID, original id types,
// the KerasLayer payload) rides along in node.data.nnvp so a load -> save
// round-trip is lossless.
//
// These are pure functions: the FlowBoard component owns state, this module
// owns the format. Keep it importable under bun (no Vue Flow imports here).

export const LAYER_NODE = 'layer';
export const COMPOSITE_NODE = 'composite';

const isComposite = (layer) => layer.class === 'D3LayerComposite';

// --- NNVP -> Vue Flow --------------------------------------------------------

function layerToNode(layer, parent) {
  const node = {
    id: String(layer.id),
    type: isComposite(layer) ? COMPOSITE_NODE : LAYER_NODE,
    position: parent === null
      ? { x: layer.x, y: layer.y }
      : { x: layer.x - parent.x, y: layer.y - parent.y },
    data: {
      label: layer.name,
      nnvp: {
        id: layer.id,
        htmlID: layer.htmlID,
        name: layer.name,
        width: layer.width,
        height: layer.height,
        kerasLayer: layer.kerasLayer,
      },
    },
  };
  if (parent !== null) {
    node.parentNode = String(parent.id);
    node.extent = 'parent';
  }
  if (isComposite(layer)) {
    // Parent nodes need explicit dimensions so they visually contain children.
    node.style = { width: `${layer.width}px`, height: `${layer.height}px` };
  }
  return node;
}

function walkLayers(layers, parent, nodes) {
  layers.forEach((layer) => {
    nodes.push(layerToNode(layer, parent));
    if (layer.children) walkLayers(layer.children, layer, nodes);
  });
}

/**
 * @param nnvp D3Model JSON (string or already-parsed object, no "NNVP" header)
 * @returns {{nodes: Array, edges: Array}} Vue Flow elements
 */
export function nnvpToFlow(nnvp) {
  const model = typeof nnvp === 'string' ? JSON.parse(nnvp) : nnvp;
  const nodes = [];
  walkLayers(model.layers || [], null, nodes);
  const edges = (model.edges || []).map(edge => ({
    id: String(edge.id),
    source: String(edge.source),
    target: String(edge.target),
    data: { nnvp: { id: edge.id, htmlID: edge.htmlID, source: edge.source, target: edge.target } },
  }));
  return { nodes, edges };
}

// --- Vue Flow -> NNVP --------------------------------------------------------

// Reconstruct one NNVP layer entry (recursing into composite children).
// `absolute` is the node's absolute board position, computed by the caller.
function nodeToLayer(node, absolute, childrenByParent, edgesBySource, edgesByTarget, parentId) {
  const nnvp = node.data.nnvp;
  const children = (childrenByParent.get(node.id) || []).map(child => nodeToLayer(
    child,
    { x: absolute.x + child.position.x, y: absolute.y + child.position.y },
    childrenByParent, edgesBySource, edgesByTarget,
    nnvp.id,
  ));
  return {
    class: children.length > 0 || node.type === COMPOSITE_NODE ? 'D3LayerComposite' : 'D3Layer',
    x: absolute.x,
    y: absolute.y,
    width: nnvp.width,
    height: nnvp.height,
    id: nnvp.id,
    htmlID: nnvp.htmlID,
    name: nnvp.name,
    // Wiring is recomputed from the flow edges (the source of truth after
    // editing), preserving edge order like the D3 editor does.
    inputLayers: (edgesByTarget.get(node.id) || []).map(e => e.sourceNnvpId),
    outputLayers: (edgesBySource.get(node.id) || []).map(e => e.targetNnvpId),
    children: children.length > 0 ? children : null,
    kerasLayer: nnvp.kerasLayer,
    parentID: parentId,
  };
}

/**
 * @param nodes Vue Flow nodes (as produced by nnvpToFlow / edited on the board)
 * @param edges Vue Flow edges
 * @returns {string} D3Model.loadJSON-compatible JSON string
 */
export function flowToNnvp(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    if (node.parentNode !== undefined) {
      if (!childrenByParent.has(node.parentNode)) childrenByParent.set(node.parentNode, []);
      childrenByParent.get(node.parentNode).push(node);
    }
  });

  // Edges annotated with the ORIGINAL (typically numeric) endpoint ids.
  const nnvpId = id => byId.get(id).data.nnvp.id;
  const annotated = edges.map(edge => ({
    ...edge,
    sourceNnvpId: nnvpId(edge.source),
    targetNnvpId: nnvpId(edge.target),
  }));
  const edgesBySource = new Map();
  const edgesByTarget = new Map();
  annotated.forEach((edge) => {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source).push(edge);
    if (!edgesByTarget.has(edge.target)) edgesByTarget.set(edge.target, []);
    edgesByTarget.get(edge.target).push(edge);
  });

  const layers = nodes
    .filter(node => node.parentNode === undefined)
    .map(node => nodeToLayer(
      node, node.position, childrenByParent, edgesBySource, edgesByTarget, null,
    ));

  // Model inputs: Input-typed leaves in node order (D3Model registers them in
  // creation order). Model outputs mirror D3LayerComponent.addInputLayer: NOT
  // the Output nodes themselves, but the source of every edge that lands on an
  // Output node, in edge order.
  const layerName = node => (node.data.nnvp.kerasLayer ? node.data.nnvp.kerasLayer.name : null);
  const inputs = nodes
    .filter(node => layerName(node) === 'Input')
    .map(node => node.data.nnvp.id);
  const outputs = annotated
    .filter(edge => layerName(byId.get(edge.target)) === 'Output')
    .map(edge => edge.sourceNnvpId);

  return JSON.stringify({
    layers,
    edges: annotated.map(edge => ({
      source: edge.sourceNnvpId,
      target: edge.targetNnvpId,
      id: edge.data && edge.data.nnvp ? edge.data.nnvp.id : `s${edge.sourceNnvpId}_t${edge.targetNnvpId}`,
      htmlID: edge.data && edge.data.nnvp ? edge.data.nnvp.htmlID : `s${edge.sourceNnvpId}_t${edge.targetNnvpId}`,
    })),
    inputs,
    outputs,
  });
}

// --- Editing helpers ---------------------------------------------------------

/**
 * True if adding source -> target would close a directed cycle (i.e. source is
 * already reachable FROM target), or if it duplicates an existing edge, or
 * connects a node to itself. Used by the board's isValidConnection.
 */
export function isInvalidConnection(edges, source, target) {
  if (source === target) return true;
  if (edges.some(edge => edge.source === source && edge.target === target)) return true;
  const outgoing = new Map();
  edges.forEach((edge) => {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  });
  const stack = [target];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === source) return true;
    if (seen.has(current)) continue; // eslint-disable-line no-continue
    seen.add(current);
    (outgoing.get(current) || []).forEach(next => stack.push(next));
  }
  return false;
}

/** Next free numeric layer id, so board-created nodes never collide. */
export function nextLayerId(nodes) {
  const numeric = nodes
    .map(node => Number(node.data.nnvp.id))
    .filter(id => Number.isFinite(id));
  return numeric.length > 0 ? Math.max(...numeric) + 1 : 0;
}

/**
 * Group the selected top-level nodes into a new composite node, mirroring
 * D3Model.createComposite: the composite's top-left is the min x/y of the
 * selection, children keep their board position (stored relative to the
 * composite), and edges are untouched. Returns the new nodes array, or null
 * when the selection includes a node that is already inside a composite
 * (D3 refuses that with "Cannot group layer from an other group").
 */
export function groupSelected(nodes, selectedIds) {
  const ids = new Set(selectedIds.map(String));
  const selected = nodes.filter(node => ids.has(node.id));
  if (selected.length === 0) return null;
  if (selected.some(node => node.parentNode !== undefined)) return null;
  const x = Math.min(...selected.map(node => node.position.x));
  const y = Math.min(...selected.map(node => node.position.y));
  // Same padding D3LayerComposite uses when it wraps its children.
  const width = Math.max(...selected.map(node => node.position.x + node.data.nnvp.width)) + 20 - x;
  const height = Math.max(...selected.map(node => node.position.y + node.data.nnvp.height)) + 10 - y;
  const id = nextLayerId(nodes);
  const composite = {
    id: String(id),
    type: COMPOSITE_NODE,
    position: { x, y },
    style: { width: `${width}px`, height: `${height}px` },
    data: {
      label: `Block_${id}`,
      nnvp: {
        id, htmlID: `Composite_${id}`, name: `Block_${id}`, width, height, kerasLayer: null,
      },
    },
  };
  const children = selected.map(node => ({
    ...node,
    position: { x: node.position.x - x, y: node.position.y - y },
    parentNode: composite.id,
    extent: 'parent',
    selected: false,
  }));
  const rest = nodes.filter(node => !ids.has(node.id));
  // Vue Flow expects parents to appear before their children.
  return sortParentFirst([...rest, composite, ...children]);
}

function sortParentFirst(nodes) {
  const childrenByParent = new Map();
  const roots = [];
  nodes.forEach((node) => {
    if (node.parentNode === undefined) {
      roots.push(node);
      return;
    }
    if (!childrenByParent.has(node.parentNode)) childrenByParent.set(node.parentNode, []);
    childrenByParent.get(node.parentNode).push(node);
  });
  const sorted = [];
  const visit = (node) => {
    sorted.push(node);
    (childrenByParent.get(node.id) || []).forEach(visit);
  };
  roots.forEach(visit);
  return sorted;
}

/** Build a fresh Vue Flow node for a newly added layer. */
export function newLayerNode(id, kerasLayer, position) {
  return {
    id: String(id),
    type: LAYER_NODE,
    position,
    data: {
      label: kerasLayer.name,
      nnvp: {
        id,
        htmlID: `d3-layer-${id}`,
        name: kerasLayer.name,
        width: 90,
        height: 40,
        kerasLayer,
      },
    },
  };
}
