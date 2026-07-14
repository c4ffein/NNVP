// D3GraphEditor-shaped facade over a Vue Flow canvas.
//
// The whole app talks to the canvas through BoardInterface, which mostly
// delegates to `activeGraph` (historically a D3GraphEditor). This class
// implements the exact same surface on top of Vue Flow state, so FlowBoard
// can register it via the EXISTING BoardInterface.addGraphEditor() and every
// panel / keyboard shortcut / assistant tool keeps working untouched.
//
// The Vue Flow store stays behind the small `store` object injected in the
// constructor (getNodes/getEdges/setGraph/getSelectedNodes/getSelectedEdges/
// screenToFlowCoordinate) so this class needs no Vue and is unit-testable
// under bun.
//
// ⚠️ Contract: BoardInterface.setActiveGraphEditor captures `selectedNodes`,
// `undoStack` and `redoStack` BY REFERENCE (containers keep `.e` pointing at
// the same array forever). Same for the `model` arrays read live by the
// panels. These arrays must only ever be mutated in place (push/pop/splice),
// never reassigned.

import { saveAs } from 'file-saver';
import BoardTemplates from '../BoardInterface/BoardTemplates';
import { importKerasArchive } from '../KerasImport/kerasImport';
import KerasLayerUntyped from '../KerasInterface/KerasLayer';
import autoLayout from '../AutoLayout/autoLayout';
import { FormatVersionError, migrateModel } from '../ModelFormat/migrations';
import type { KerasLayerJSON, NnvpLayerId, NnvpModel, FlowNode, FlowEdge } from '../../types/model';
import {
  nnvpToFlow, flowToNnvp, nextLayerId, newLayerNode, groupSelected, COMPOSITE_NODE,
  isInvalidConnection,
} from './adapter';

/**
 * A live KerasLayer instance: the serialized shape plus the methods this
 * facade calls. KerasLayer.js is untyped JS (owned elsewhere); this narrow
 * structural view keeps the module strict without importing its types.
 */
export type KerasLayerInstance = KerasLayerJSON & {
  clone(): KerasLayerInstance;
  load(json: KerasLayerJSON): KerasLayerInstance;
};

// KerasLayer.js's inferred constructor wants (layerName, categoryName); the
// reviving `new KerasLayer().load(json)` call passes none, exactly like
// D3Layer.loadJSON always did — retype rather than change behavior.
const KerasLayer = KerasLayerUntyped as unknown as new () => KerasLayerInstance;

/**
 * The narrow Vue Flow store surface FlowBoard injects (and the unit tests
 * fake). Deliberately structural — no @vue-flow/core imports — so lib/ stays
 * importable under bun without Vue (same rule as adapter.ts).
 */
export interface FlowStore {
  getNodes(): FlowNode[];
  getEdges(): FlowEdge[];
  /** Replaces both sets synchronously, nodes first. */
  setGraph(nodes: FlowNode[], edges: FlowEdge[]): void;
  getSelectedNodes(): FlowNode[];
  getSelectedEdges(): FlowEdge[];
  /** Viewport-dependent; the real board provides it, unit-test stores omit it. */
  screenToFlowCoordinate?(position: { x: number; y: number }): { x: number; y: number };
}

/**
 * Stable D3Layer-shaped view of one flow node, handed to the panels through
 * `model.d3Layers` / `selectedNodes`. One instance per node id, mutated in
 * place by syncDerived so components can hold references across graph changes.
 */
export interface LayerWrapper {
  id: NnvpLayerId;
  name: string;
  class: 'D3Layer' | 'D3LayerComposite';
  kerasLayer: KerasLayerJSON | null;
  /** nnvp ids of the layers feeding this one — spliced in place, never reassigned. */
  inputLayers: NnvpLayerId[];
  /** Never set here; BoardInterface.debugGetBoardState reads it (as undefined). */
  type?: string;
}

/**
 * D3Model-shaped shim read live by the panels. The four arrays are captured
 * by reference (see the contract above) — mutate in place only.
 */
export interface BoardModel {
  d3Layers: LayerWrapper[];
  d3Edges: FlowEdge[];
  modelInputs: LayerWrapper[];
  modelOutputs: LayerWrapper[];
  createComposite: () => void;
  loadJSON: (json: string | NnvpModel) => void;
}

/**
 * The KerasInterface codegen surface the menus pass in. Structural for the
 * same reason as FlowStore: no KerasInterface import needed for types.
 */
export interface CodeGenerator {
  generatePython(modelJSON: string): string;
  generateJavascript(modelJSON: string): string;
  generatePyTorch(modelJSON: string): string;
  generateTinygrad(modelJSON: string): string;
}

/** Catalog drag sources stash their dragstart listener on the element so a re-render replaces it. */
type DragSourceElement = HTMLElement & { nnvpDragStart?: () => void };

// Default node footprint (see newLayerNode) — used to center drops on the cursor.
const NODE_WIDTH = 90;
const NODE_HEIGHT = 40;
// Footprint auto-layout reserves per layer node: rendered nodes are
// min-width 90px (LayerNode.vue) and grow with their label, ~120px in practice.
const LAYOUT_NODE_WIDTH = 120;
// Sub-layout padding inside a composite: room for the block's label at the
// top (see CompositeNode.vue) plus a margin on the other sides.
const GROUP_PAD = {
  left: 15, top: 30, right: 15, bottom: 10,
};

const warn = (message: string): void => {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
  else console.warn(message); // eslint-disable-line no-console
};

export default class FlowGraphEditor {
  store: FlowStore;
  templates: BoardTemplates;
  /** Captured by reference in BoardInterface containers — mutate in place only. */
  selectedNodes: LayerWrapper[];
  /** NNVP JSON snapshots; captured by reference like selectedNodes. */
  undoStack: string[];
  redoStack: string[];
  selectionChangedCallback: (() => void) | null;
  graphChangedCallback: (() => void) | null;
  /** One stable layer-like wrapper per flow node id (a string). */
  wrappers: Map<string, LayerWrapper>;
  model: BoardModel;
  /** Last committed NNVP JSON snapshot (see commit()). */
  committed: string;
  commitQueued: boolean;
  /** KerasLayer being dragged from the catalog, if any. */
  dragPayload: KerasLayerInstance | null;

  constructor(store: FlowStore) {
    this.store = store;
    this.templates = new BoardTemplates();
    this.selectedNodes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.selectionChangedCallback = null;
    this.graphChangedCallback = null;
    this.wrappers = new Map();
    this.model = {
      d3Layers: [],
      d3Edges: [],
      modelInputs: [],
      modelOutputs: [],
      createComposite: () => this.groupSelectedNodes(),
      loadJSON: (json) => this.restore(json),
    };
    // Undo/redo works on committed JSON snapshots: `committed` is the last
    // known state, and commit() pushes it once the board reports a change.
    this.committed = flowToNnvp([], []);
    this.commitQueued = false;
    this.dragPayload = null;
  }

  // --- BoardInterface registration contracts ------------------------------------

  onSelectionChanged(callback: () => void) { this.selectionChangedCallback = callback; }

  onGraphChanged(callback: () => void) { this.graphChangedCallback = callback; }

  notifySelectionChanged() {
    if (this.selectionChangedCallback) this.selectionChangedCallback();
  }

  notifyGraphChanged() {
    if (this.graphChangedCallback) this.graphChangedCallback();
  }

  // --- Serialization ----------------------------------------------------------

  toJSON(): string {
    return flowToNnvp(this.store.getNodes(), this.store.getEdges());
  }

  /**
   * Replace the board with the given NNVP JSON (string or object). KerasLayer
   * payloads are revived into live instances (same as D3Layer.loadJSON does)
   * so the parameter panels can keep calling setParameterValue on them.
   */
  restore(json: string | NnvpModel) {
    const flow = nnvpToFlow(json);
    flow.nodes.forEach((node) => {
      const layer = node.data.nnvp.kerasLayer;
      if (layer) node.data.nnvp.kerasLayer = new KerasLayer().load(layer);
    });
    this.store.setGraph(flow.nodes, flow.edges);
    this.committed = this.toJSON();
  }

  updateGraph() {
    this.syncDerived();
    this.notifyGraphChanged();
  }

  // --- Undo / redo -------------------------------------------------------------

  /** D3 semantics: push the CURRENT state before a programmatic change. */
  saveState() {
    this.redoStack.splice(0, this.redoStack.length);
    this.undoStack.push(this.toJSON());
  }

  /**
   * Record a change the board already applied (connect, drag-stop, delete).
   * Coalesced per microtask (one delete can emit both nodes-delete and
   * edges-delete) and skipped when nothing actually changed.
   */
  commit() {
    if (this.commitQueued) return;
    this.commitQueued = true;
    queueMicrotask(() => {
      this.commitQueued = false;
      const now = this.toJSON();
      if (now === this.committed) return;
      this.undoStack.push(this.committed);
      this.committed = now;
      this.redoStack.splice(0, this.redoStack.length);
      this.syncDerived();
      this.notifyGraphChanged();
    });
  }

  undo() {
    if (this.undoStack.length <= 0) return;
    this.redoStack.push(this.toJSON());
    this.restore(this.undoStack.pop()!);
    this.updateGraph();
  }

  redo() {
    if (this.redoStack.length <= 0) return;
    this.undoStack.push(this.toJSON());
    this.restore(this.redoStack.pop()!);
    this.updateGraph();
  }

  // --- Editing -------------------------------------------------------------

  addLayer(kerasLayer: KerasLayerInstance, posX?: number, posY?: number) {
    this.saveState();
    const nodes = this.store.getNodes();
    const position = posX !== undefined && posY !== undefined
      ? { x: posX, y: posY }
      : this.defaultDropPosition(nodes.length);
    const node = newLayerNode(nextLayerId(nodes), kerasLayer, position);
    this.store.setGraph([...nodes, node], this.store.getEdges());
    this.committed = this.toJSON();
    this.updateGraph();
  }

  /**
   * Programmatic connect (the assistant's tool): same result and same rules
   * as dragging an edge on the board — self-loops, duplicates and cycles are
   * refused. Returns whether the edge was created.
   */
  connectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId): boolean {
    const source = String(sourceId);
    const target = String(targetId);
    const edges = this.store.getEdges();
    if (isInvalidConnection(edges, source, target)) return false;
    this.saveState();
    this.store.setGraph(this.store.getNodes(), [...edges, {
      id: `edge-${source}-${target}`,
      source,
      target,
    }]);
    this.committed = this.toJSON();
    this.updateGraph();
    return true;
  }

  /** Remove the source -> target edge. Returns whether one existed. */
  disconnectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId): boolean {
    const source = String(sourceId);
    const target = String(targetId);
    const edges = this.store.getEdges();
    const kept = edges.filter(edge => !(edge.source === source && edge.target === target));
    if (kept.length === edges.length) return false;
    this.saveState();
    this.store.setGraph(this.store.getNodes(), kept);
    this.committed = this.toJSON();
    this.updateGraph();
    return true;
  }

  /** Catalog click drop point: center of the viewport, slightly staggered. */
  defaultDropPosition(count: number): { x: number; y: number } {
    const stagger = (count % 5) * 15;
    if (this.store.screenToFlowCoordinate && typeof window !== 'undefined') {
      const center = this.store.screenToFlowCoordinate({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      return { x: center.x - NODE_WIDTH / 2 + stagger, y: center.y - NODE_HEIGHT / 2 + stagger };
    }
    return { x: 60 + stagger, y: 60 + stagger };
  }

  /**
   * Drag-from-catalog support. D3 implements this with d3.drag; here the
   * catalog entry becomes a native HTML5 drag source and FlowBoard's drop
   * handler calls dropAt(). LayerTemplate re-calls this on updated(), so the
   * previous listener is replaced rather than stacked.
   */
  addEventHandlerDragOnHtmlClass(layer: KerasLayerInstance, htmlElement: DragSourceElement) {
    if (htmlElement.nnvpDragStart) {
      htmlElement.removeEventListener('dragstart', htmlElement.nnvpDragStart);
    }
    const onDragStart = () => { this.dragPayload = layer; };
    htmlElement.nnvpDragStart = onDragStart; // eslint-disable-line no-param-reassign
    htmlElement.setAttribute('draggable', 'true');
    htmlElement.addEventListener('dragstart', onDragStart);
  }

  /** Called by FlowBoard on drop; screen coords → flow coords → addLayer. */
  dropAt(clientX: number, clientY: number) {
    if (!this.dragPayload) return;
    const layer = this.dragPayload.clone();
    this.dragPayload = null;
    const position = this.store.screenToFlowCoordinate
      ? this.store.screenToFlowCoordinate({ x: clientX, y: clientY })
      : { x: clientX, y: clientY };
    this.addLayer(layer, position.x - NODE_WIDTH / 2, position.y - NODE_HEIGHT / 2);
  }

  /**
   * Move a layer to absolute board coordinates. Mirrors D3Layer.transitionToXY
   * (used by the e2e suite and debug tooling to lay nodes out before
   * connecting them); like it, this does not push an undo snapshot.
   */
  moveLayerTo(id: NnvpLayerId, x: number, y: number) {
    const node = this.store.getNodes().find(candidate => candidate.id === String(id));
    if (!node) return;
    node.position = { x, y };
  }

  /**
   * Edit > Auto layout: re-lay the whole board with the layered layout
   * (lib/AutoLayout). A composite counts as ONE block at the top level and
   * its children are laid out inside it, resizing the block to fit. The
   * board stays anchored on its previous top-left corner, and the whole
   * relayout is one undoable step.
   */
  autoLayout() {
    const nodes = this.store.getNodes();
    if (nodes.length === 0) return;
    const edges = this.store.getEdges();
    this.saveState();
    const byId = new Map(nodes.map(node => [node.id, node]));
    // Auto-layout footprint: composites use their (already relaid) real size.
    const sizeOf = (node: FlowNode) => (node.type === COMPOSITE_NODE
      ? { width: node.data.nnvp.width!, height: node.data.nnvp.height! }
      : { width: LAYOUT_NODE_WIDTH, height: NODE_HEIGHT });
    // Edges join leaf nodes; lift an endpoint to the container's direct child
    // holding it (null when the endpoint lives outside the container).
    const liftTo = (containerId: string | undefined, id: string): string | null => {
      let node = byId.get(id);
      // Map.get(undefined) is undefined, same walk the JS version did.
      while (node !== undefined && node.parentNode !== containerId) node = byId.get(node.parentNode as string);
      return node === undefined ? null : node.id;
    };
    const layout = (containerId: string | undefined) => {
      const children = nodes.filter(node => node.parentNode === containerId);
      const positions = autoLayout({
        nodes: children.map(node => ({ id: node.id, ...node.position, ...sizeOf(node) })),
        edges: edges.map(edge => ({
          source: liftTo(containerId, edge.source),
          target: liftTo(containerId, edge.target),
        })).filter((edge): edge is { source: string; target: string } => (
          edge.source !== null && edge.target !== null)),
      });
      const xs = children.map(node => positions.get(node.id)!.x);
      const ys = children.map(node => positions.get(node.id)!.y);
      return {
        children,
        positions,
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        width: Math.max(...children.map(node => positions.get(node.id)!.x + sizeOf(node).width))
          - Math.min(...xs),
        height: Math.max(...children.map(node => positions.get(node.id)!.y + sizeOf(node).height))
          - Math.min(...ys),
      };
    };
    // Composites first, deepest first (legacy files may nest them), so the
    // top-level pass sees their final size.
    const depthOf = (node: FlowNode) => {
      let depth = 0;
      for (let cur = node; cur.parentNode !== undefined; cur = byId.get(cur.parentNode)!) depth += 1;
      return depth;
    };
    const composites = nodes
      .filter(node => node.type === COMPOSITE_NODE)
      .sort((a, b) => depthOf(b) - depthOf(a));
    composites.forEach((composite) => {
      const laid = layout(composite.id);
      if (laid.children.length === 0) return;
      laid.children.forEach((child) => {
        const position = laid.positions.get(child.id)!;
        child.position = { // eslint-disable-line no-param-reassign
          x: position.x - laid.minX + GROUP_PAD.left,
          y: position.y - laid.minY + GROUP_PAD.top,
        };
      });
      const width = laid.width + GROUP_PAD.left + GROUP_PAD.right;
      const height = laid.height + GROUP_PAD.top + GROUP_PAD.bottom;
      composite.data.nnvp.width = width;
      composite.data.nnvp.height = height;
      composite.style = { width: `${width}px`, height: `${height}px` }; // eslint-disable-line no-param-reassign
    });
    const top = layout(undefined);
    const offsetX = Math.min(...top.children.map(node => node.position.x)) - top.minX;
    const offsetY = Math.min(...top.children.map(node => node.position.y)) - top.minY;
    top.children.forEach((node) => {
      const position = top.positions.get(node.id)!;
      node.position = { x: position.x + offsetX, y: position.y + offsetY }; // eslint-disable-line no-param-reassign
    });
    this.committed = this.toJSON();
    this.updateGraph();
  }

  deleteSelectedElements() {
    const selected = this.store.getSelectedNodes();
    const selectedEdges = this.store.getSelectedEdges();
    if (selected.length === 0 && selectedEdges.length === 0) return;
    this.saveState();
    const nodes = this.store.getNodes();
    // Deleting a composite deletes everything inside it, like D3 does.
    const doomed = new Set(selected.map(node => node.id));
    let grew = true;
    while (grew) {
      grew = false;
      nodes.forEach((node) => {
        if (node.parentNode !== undefined && doomed.has(node.parentNode) && !doomed.has(node.id)) {
          doomed.add(node.id);
          grew = true;
        }
      });
    }
    const doomedEdges = new Set(selectedEdges.map(edge => edge.id));
    this.store.setGraph(
      nodes.filter(node => !doomed.has(node.id)),
      this.store.getEdges().filter(edge => !doomedEdges.has(edge.id)
        && !doomed.has(edge.source) && !doomed.has(edge.target)),
    );
    this.committed = this.toJSON();
    this.selectedNodes.splice(0, this.selectedNodes.length);
    this.syncDerived();
    this.notifySelectionChanged();
    this.notifyGraphChanged();
  }

  /** Edit > Group / ctrl+G, reached through model.createComposite(). */
  groupSelectedNodes() {
    const selected = this.store.getSelectedNodes();
    if (selected.length <= 0) return;
    const grouped = groupSelected(this.store.getNodes(), selected.map(node => node.id));
    if (grouped === null) {
      warn('Cannot group layer from an other group');
      return;
    }
    this.saveState();
    this.store.setGraph(grouped, this.store.getEdges());
    this.committed = this.toJSON();
    this.selectedNodes.splice(0, this.selectedNodes.length);
    this.notifySelectionChanged();
    this.updateGraph();
  }

  clearBoard(skipPrompt: boolean) {
    // Same semantics as D3GraphEditor.clearBoard: File > New prompts and is
    // NOT undoable; programmatic callers pass skipPrompt = true.
    if (!skipPrompt && !window.confirm('Press OK to delete this graph')) return;
    this.store.setGraph([], []);
    this.committed = this.toJSON();
    this.updateGraph();
  }

  // --- File / template / codegen -------------------------------------------

  saveBoard() {
    saveAs(new Blob([`NNVP\n${this.toJSON()}`]), 'myModel.nnvp');
  }

  uploadToBoard(uploadFileEvent: HTMLInputElement) {
    if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
      alert("Your browser won't let you open this graph -- try upgrading your browser to the latest version of Chrome or Firefox.");
      return;
    }
    const uploadFile = uploadFileEvent.files![0]!;
    if (uploadFile.name.toLowerCase().endsWith('.keras')) {
      this.uploadKerasToBoard(uploadFile);
      return;
    }
    const filereader = new window.FileReader();
    filereader.onload = () => {
      // Validate the file BEFORE touching the board, so a bad file never
      // leaves the user in front of a silently wiped canvas.
      const splited = (filereader.result as string).split(/\n(.+)/);
      if (splited[0] !== 'NNVP') {
        alert("This file doesn't seem to be an NNVP file.");
        return;
      }
      // A body-less file leaves this undefined at runtime; JSON.parse then
      // throws into the corrupted-file alert below, as it always did.
      const body = splited[1] as string;
      try {
        migrateModel(JSON.parse(body));
      } catch (error) {
        alert(error instanceof FormatVersionError
          ? error.message
          : "This NNVP file couldn't be read — it seems to be corrupted.");
        return;
      }
      this.saveState();
      try {
        this.restore(body);
        this.updateGraph();
      } catch (error) {
        console.error(error); // eslint-disable-line no-console
        this.undo();
        alert("This NNVP file couldn't be loaded — it seems to be corrupted.");
      }
    };
    filereader.readAsText(uploadFile);
  }

  /**
   * Import a Keras 3 `.keras` archive: architecture only (the weights inside
   * model.weights.h5 are ignored for now) — then load it through the exact
   * same restore path as a .nnvp file. Like the .nnvp branch, the file is
   * fully converted BEFORE touching the board, so a bad file never leaves the
   * user in front of a silently wiped canvas.
   */
  uploadKerasToBoard(uploadFile: File) {
    uploadFile.arrayBuffer()
      .then(buffer => importKerasArchive(new Uint8Array(buffer)))
      .then(({ model }) => {
        this.saveState();
        try {
          this.restore(JSON.stringify(model));
          this.updateGraph();
        } catch (error) {
          console.error(error); // eslint-disable-line no-console
          this.undo();
          alert("This Keras file couldn't be loaded — it seems to be corrupted.");
        }
      })
      .catch((error: unknown) => {
        console.error(error); // eslint-disable-line no-console
        alert(`This Keras file couldn't be imported: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  loadTemplate(name: string) {
    this.saveState();
    this.restore(this.templates.get(name)!);
    this.updateGraph();
  }

  generatePythonInBrowser(kerasInterface: CodeGenerator) {
    saveAs(new Blob([kerasInterface.generatePython(this.toJSON())]), 'myModel.py');
  }

  generateJavascriptInBrowser(kerasInterface: CodeGenerator) {
    saveAs(new Blob([kerasInterface.generateJavascript(this.toJSON())]), 'myModel.js');
  }

  generatePyTorchInBrowser(kerasInterface: CodeGenerator) {
    saveAs(new Blob([kerasInterface.generatePyTorch(this.toJSON())]), 'myModel.py');
  }

  generateTinygradInBrowser(kerasInterface: CodeGenerator) {
    saveAs(new Blob([kerasInterface.generateTinygrad(this.toJSON())]), 'myModel.py');
  }

  generateJavascriptNoSave(kerasInterface: CodeGenerator): string {
    return kerasInterface.generateJavascript(this.toJSON());
  }

  // --- Layer-like wrappers and the model shim --------------------------------

  findLayerById(id: NnvpLayerId): LayerWrapper | null {
    return this.wrappers.get(String(id)) || null;
  }

  /**
   * Rebuild the derived, D3Model-shaped views of the flow graph: the wrapper
   * per node, model.d3Layers (top-level only — composites count as one),
   * model.d3Edges, model.modelInputs (Input-typed nodes in node order) and
   * model.modelOutputs (sources of edges into Output nodes, in edge order —
   * mirroring D3LayerComponent.addInputLayer and adapter.flowToNnvp).
   * Wrapper instances are stable per node id and mutated in place.
   */
  syncDerived() {
    const nodes = this.store.getNodes();
    const edges = this.store.getEdges();
    const byId = new Map(nodes.map(node => [node.id, node]));
    const inputsByTarget = new Map<string, NnvpLayerId[]>();
    edges.forEach((edge) => {
      const source = byId.get(edge.source);
      if (!source) return;
      if (!inputsByTarget.has(edge.target)) inputsByTarget.set(edge.target, []);
      inputsByTarget.get(edge.target)!.push(source.data.nnvp.id);
    });
    const previous = this.wrappers;
    this.wrappers = new Map();
    nodes.forEach((node) => {
      const { nnvp } = node.data;
      // Fresh wrappers get placeholder fields; every field except inputLayers
      // (spliced below to keep the array instance) is overwritten right after.
      const wrapper: LayerWrapper = previous.get(node.id)
        || { id: nnvp.id, name: nnvp.name, class: 'D3Layer', kerasLayer: null, inputLayers: [] };
      wrapper.id = nnvp.id;
      wrapper.name = nnvp.name;
      wrapper.class = node.type === COMPOSITE_NODE ? 'D3LayerComposite' : 'D3Layer';
      wrapper.kerasLayer = nnvp.kerasLayer || null;
      const inputs = inputsByTarget.get(node.id) || [];
      wrapper.inputLayers.splice(0, wrapper.inputLayers.length, ...inputs);
      this.wrappers.set(node.id, wrapper);
    });
    const layerName = (node: FlowNode) => (node.data.nnvp.kerasLayer ? node.data.nnvp.kerasLayer.name : null);
    const topLevel = nodes
      .filter(node => node.parentNode === undefined)
      .map(node => this.wrappers.get(node.id)!);
    this.model.d3Layers.splice(0, this.model.d3Layers.length, ...topLevel);
    this.model.d3Edges.splice(0, this.model.d3Edges.length, ...edges);
    const inputs = nodes
      .filter(node => layerName(node) === 'Input')
      .map(node => this.wrappers.get(node.id)!);
    this.model.modelInputs.splice(0, this.model.modelInputs.length, ...inputs);
    const outputs = edges
      .filter(edge => byId.get(edge.target) && layerName(byId.get(edge.target)!) === 'Output')
      .map(edge => this.wrappers.get(edge.source))
      .filter((wrapper): wrapper is LayerWrapper => Boolean(wrapper));
    this.model.modelOutputs.splice(0, this.model.modelOutputs.length, ...outputs);
  }

  /**
   * Mirror the board's node selection into the stable selectedNodes array.
   * Composites are skipped (no kerasLayer to edit), matching how D3's
   * rectangle selection only picks plain layers.
   */
  syncSelection() {
    this.syncDerived();
    const wrappers = this.store.getSelectedNodes()
      .map(node => this.wrappers.get(node.id))
      .filter((wrapper): wrapper is LayerWrapper => Boolean(wrapper && wrapper.kerasLayer));
    this.selectedNodes.splice(0, this.selectedNodes.length, ...wrappers);
    this.notifySelectionChanged();
  }
}
