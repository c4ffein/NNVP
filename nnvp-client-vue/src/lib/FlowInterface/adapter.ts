// NNVP graph JSON <-> Vue Flow nodes/edges.
//
// The NNVP side is the format-v2 spelling of what D3Model.toJSON emitted
// historically (v1 files are renamed by migrateModel on load) — see
// src/types/model.ts:
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

import type {
  NnvpModel, NnvpLayer, NnvpLayerId, KerasLayerJSON, FlowNode, FlowEdge,
} from '../../types/model';
import { CURRENT_FORMAT_VERSION, migrateModel } from '../ModelFormat/migrations';

export const LAYER_NODE = 'layer';
export const COMPOSITE_NODE = 'composite';

const isComposite = (layer: NnvpLayer) => layer.class === 'Group';

// --- NNVP -> Vue Flow --------------------------------------------------------

function layerToNode(layer: NnvpLayer, parent: NnvpLayer | null): FlowNode {
  const node: FlowNode = {
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
        // Comment (Phase F) — additive, kept only when present so files
        // without it round-trip byte-identically (like edges' unrollSteps).
        ...(layer.comment === undefined ? {} : { comment: layer.comment }),
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

function walkLayers(layers: NnvpLayer[], parent: NnvpLayer | null, nodes: FlowNode[]): void {
  layers.forEach((layer) => {
    nodes.push(layerToNode(layer, parent));
    if (layer.children) walkLayers(layer.children, layer, nodes);
  });
}

/**
 * @param nnvp NNVP model JSON (string or already-parsed object, no "NNVP" header);
 *   migrated to the current format first — throws FormatVersionError on files
 *   from a newer NNVP.
 * @returns Vue Flow elements
 */
export function nnvpToFlow(nnvp: string | NnvpModel): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const model: NnvpModel = migrateModel(nnvp);
  const nodes: FlowNode[] = [];
  walkLayers(model.layers || [], null, nodes);
  const edges = (model.edges || []).map((edge): FlowEdge => ({
    id: String(edge.id),
    source: String(edge.source),
    target: String(edge.target),
    data: {
      nnvp: {
        id: edge.id,
        htmlID: edge.htmlID,
        source: edge.source,
        target: edge.target,
        // Feedback unroll count (Phase D2) — additive, kept only when present
        // so files without it round-trip byte-identically.
        ...(edge.unrollSteps === undefined ? {} : { unrollSteps: edge.unrollSteps }),
      },
    },
  }));
  return { nodes, edges };
}

// --- Vue Flow -> NNVP --------------------------------------------------------

type AnnotatedEdge = FlowEdge & { sourceNnvpId: NnvpLayerId; targetNnvpId: NnvpLayerId };
type EdgesByNode = Map<string, AnnotatedEdge[]>;

// Reconstruct one NNVP layer entry (recursing into composite children).
// `absolute` is the node's absolute board position, computed by the caller.
function nodeToLayer(
  node: FlowNode,
  absolute: { x: number; y: number },
  childrenByParent: Map<string, FlowNode[]>,
  edgesBySource: EdgesByNode,
  edgesByTarget: EdgesByNode,
  parentId: NnvpLayerId | null,
): NnvpLayer {
  const nnvp = node.data.nnvp;
  const children = (childrenByParent.get(node.id) || []).map(child => nodeToLayer(
    child,
    { x: absolute.x + child.position.x, y: absolute.y + child.position.y },
    childrenByParent, edgesBySource, edgesByTarget,
    nnvp.id,
  ));
  return {
    class: children.length > 0 || node.type === COMPOSITE_NODE ? 'Group' : 'Layer',
    x: absolute.x,
    y: absolute.y,
    width: nnvp.width,
    height: nnvp.height,
    id: nnvp.id,
    htmlID: nnvp.htmlID,
    name: nnvp.name,
    ...(nnvp.comment === undefined ? {} : { comment: nnvp.comment }),
    // Wiring is recomputed from the flow edges (the source of truth after
    // editing), preserving edge order like the D3 editor did.
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
 * @returns NNVP-model JSON string (the .nnvp file body)
 */
export function flowToNnvp(nodes: FlowNode[], edges: FlowEdge[]): string {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const childrenByParent = new Map<string, FlowNode[]>();
  nodes.forEach((node) => {
    if (node.parentNode !== undefined) {
      if (!childrenByParent.has(node.parentNode)) childrenByParent.set(node.parentNode, []);
      childrenByParent.get(node.parentNode)!.push(node);
    }
  });

  // Edges annotated with the ORIGINAL (typically numeric) endpoint ids.
  const nnvpId = (id: string) => byId.get(id)!.data.nnvp.id;
  const annotated = edges.map((edge): AnnotatedEdge => ({
    ...edge,
    sourceNnvpId: nnvpId(edge.source),
    targetNnvpId: nnvpId(edge.target),
  }));
  const edgesBySource: EdgesByNode = new Map();
  const edgesByTarget: EdgesByNode = new Map();
  annotated.forEach((edge) => {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(edge);
    if (!edgesByTarget.has(edge.target)) edgesByTarget.set(edge.target, []);
    edgesByTarget.get(edge.target)!.push(edge);
  });

  const layers = nodes
    .filter(node => node.parentNode === undefined)
    .map(node => nodeToLayer(
      node, node.position, childrenByParent, edgesBySource, edgesByTarget, null,
    ));

  // Model inputs: Input-typed leaves in node order (the editor registers them
  // in creation order). Model outputs mirror D3LayerComponent.addInputLayer's
  // historical behavior: NOT the Output nodes themselves, but the source of
  // every edge that lands on an Output node, in edge order.
  const layerName = (node: FlowNode) => (node.data.nnvp.kerasLayer ? node.data.nnvp.kerasLayer.name : null);
  const inputs = nodes
    .filter(node => layerName(node) === 'Input')
    .map(node => node.data.nnvp.id);
  const outputs = annotated
    .filter(edge => layerName(byId.get(edge.target)!) === 'Output')
    .map(edge => edge.sourceNnvpId);

  return JSON.stringify({
    formatVersion: CURRENT_FORMAT_VERSION,
    layers,
    edges: annotated.map(edge => ({
      source: edge.sourceNnvpId,
      target: edge.targetNnvpId,
      id: edge.data && edge.data.nnvp ? edge.data.nnvp.id : `s${edge.sourceNnvpId}_t${edge.targetNnvpId}`,
      htmlID: edge.data && edge.data.nnvp ? edge.data.nnvp.htmlID : `s${edge.sourceNnvpId}_t${edge.targetNnvpId}`,
      // unrollSteps (Phase D2) rides through like everything the board does
      // not model — emitted only when present, keeping old saves byte-stable.
      ...(edge.data && edge.data.nnvp && edge.data.nnvp.unrollSteps !== undefined
        ? { unrollSteps: edge.data.nnvp.unrollSteps } : {}),
    })),
    inputs,
    outputs,
  });
}

// --- Editing helpers ---------------------------------------------------------

type EdgeEnds = Pick<FlowEdge, 'source' | 'target'>;

/** True if `to` is reachable from `from` by following edges forward. */
function reaches(edges: EdgeEnds[], from: string, to: string): boolean {
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
  });
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (seen.has(current)) continue; // eslint-disable-line no-continue
    seen.add(current);
    (outgoing.get(current) || []).forEach(next => stack.push(next));
  }
  return false;
}

/**
 * True if the source -> target connection duplicates an existing edge or
 * connects a node to itself. Used by the board's isValidConnection.
 * Cycle-closing edges are NOT invalid (since Phase D): drawing a feedback
 * loop is a legitimate edit — the loop renders in the error color
 * (edgeInCycle) and code generation refuses the cyclic graph with a typed
 * CyclicGraphError until imperative emission supports it.
 */
export function isInvalidConnection(edges: EdgeEnds[], source: string, target: string): boolean {
  if (source === target) return true;
  return edges.some(edge => edge.source === source && edge.target === target);
}

/**
 * True if an EXISTING edge lies on a directed cycle: its target reaches back
 * to its source (that path plus the edge itself closes the loop). Covers
 * both freshly drawn loops (cycle-closing connections are allowed) and
 * cyclic graphs saved on the old D3 board — the board marks such edges with
 * the error color (see FloatingEdge.vue).
 */
export function edgeInCycle(edges: EdgeEnds[], edge: EdgeEnds): boolean {
  return reaches(edges, edge.target, edge.source);
}

/** Next free numeric layer id, so board-created nodes never collide. */
export function nextLayerId(nodes: FlowNode[]): number {
  const numeric = nodes
    .map(node => Number(node.data.nnvp.id))
    .filter(id => Number.isFinite(id));
  return numeric.length > 0 ? Math.max(...numeric) + 1 : 0;
}

/**
 * Group the selected top-level nodes into a new composite node, mirroring
 * the old D3Model.createComposite: the composite's top-left is the min x/y of
 * the selection, children keep their board position (stored relative to the
 * composite), and edges are untouched. Returns the new nodes array, or null
 * when the selection includes a node that is already inside a composite
 * (D3 refused that with "Cannot group layer from an other group").
 */
export function groupSelected(nodes: FlowNode[], selectedIds: Array<string | number>): FlowNode[] | null {
  const ids = new Set(selectedIds.map(String));
  const selected = nodes.filter(node => ids.has(node.id));
  if (selected.length === 0) return null;
  if (selected.some(node => node.parentNode !== undefined)) return null;
  const x = Math.min(...selected.map(node => node.position.x));
  const y = Math.min(...selected.map(node => node.position.y));
  // Same padding D3LayerComposite used when it wrapped its children. Board
  // nodes always carry width/height (newLayerNode/nnvpToFlow set them).
  const width = Math.max(...selected.map(node => node.position.x + (node.data.nnvp.width ?? 0))) + 20 - x;
  const height = Math.max(...selected.map(node => node.position.y + (node.data.nnvp.height ?? 0))) + 10 - y;
  const id = nextLayerId(nodes);
  const composite: FlowNode = {
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
  const children = selected.map((node): FlowNode => ({
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

function sortParentFirst(nodes: FlowNode[]): FlowNode[] {
  const childrenByParent = new Map<string, FlowNode[]>();
  const roots: FlowNode[] = [];
  nodes.forEach((node) => {
    if (node.parentNode === undefined) {
      roots.push(node);
      return;
    }
    if (!childrenByParent.has(node.parentNode)) childrenByParent.set(node.parentNode, []);
    childrenByParent.get(node.parentNode)!.push(node);
  });
  const sorted: FlowNode[] = [];
  const visit = (node: FlowNode) => {
    sorted.push(node);
    (childrenByParent.get(node.id) || []).forEach(visit);
  };
  roots.forEach(visit);
  return sorted;
}

/** Build a fresh Vue Flow node for a newly added layer. */
export function newLayerNode(
  id: number,
  kerasLayer: KerasLayerJSON,
  position: { x: number; y: number },
): FlowNode {
  return {
    id: String(id),
    type: LAYER_NODE,
    position,
    data: {
      label: kerasLayer.name,
      nnvp: {
        id,
        htmlID: `layer-${id}`,
        name: kerasLayer.name,
        width: 90,
        height: 40,
        kerasLayer,
      },
    },
  };
}
