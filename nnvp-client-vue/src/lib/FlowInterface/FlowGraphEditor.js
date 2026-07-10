// D3GraphEditor-shaped facade over a Vue Flow canvas.
//
// The whole app talks to the canvas through D3Interface, which mostly
// delegates to `activeGraph` (historically a D3GraphEditor). This class
// implements the exact same surface on top of Vue Flow state, so FlowBoard
// can register it via the EXISTING D3Interface.addGraphEditor() and every
// panel / keyboard shortcut / assistant tool keeps working untouched.
//
// The Vue Flow store stays behind the small `store` object injected in the
// constructor (getNodes/getEdges/setGraph/getSelectedNodes/getSelectedEdges/
// screenToFlowCoordinate) so this class is pure JS and unit-testable under
// bun without mounting Vue.
//
// ⚠️ Contract: D3Interface.setActiveGraphEditor captures `selectedNodes`,
// `undoStack` and `redoStack` BY REFERENCE (containers keep `.e` pointing at
// the same array forever). Same for the `model` arrays read live by the
// panels. These arrays must only ever be mutated in place (push/pop/splice),
// never reassigned.

import { saveAs } from 'file-saver';
import D3Templates from '../D3Interface/D3Templates';
import KerasLayer from '../KerasInterface/KerasLayer';
import {
  nnvpToFlow, flowToNnvp, nextLayerId, newLayerNode, groupSelected, COMPOSITE_NODE,
} from './adapter';

// Default node footprint (see newLayerNode) — used to center drops on the cursor.
const NODE_WIDTH = 90;
const NODE_HEIGHT = 40;

const warn = (message) => {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
  else console.warn(message); // eslint-disable-line no-console
};

export default class FlowGraphEditor {
  constructor(store) {
    this.store = store;
    this.templates = new D3Templates();
    // Captured by reference in D3Interface containers — mutate in place only.
    this.selectedNodes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.selectionChangedCallback = null;
    this.graphChangedCallback = null;
    // One stable layer-like wrapper per node id, so the panels can hold on to
    // the objects across graph changes. Keyed by the flow node id (a string).
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
    // KerasLayer being dragged from the catalog, if any.
    this.dragPayload = null;
  }

  // --- D3Interface registration contracts ------------------------------------

  onSelectionChanged(callback) { this.selectionChangedCallback = callback; }

  onGraphChanged(callback) { this.graphChangedCallback = callback; }

  notifySelectionChanged() {
    if (this.selectionChangedCallback) this.selectionChangedCallback();
  }

  notifyGraphChanged() {
    if (this.graphChangedCallback) this.graphChangedCallback();
  }

  // --- Serialization ----------------------------------------------------------

  toJSON() {
    return flowToNnvp(this.store.getNodes(), this.store.getEdges());
  }

  /**
   * Replace the board with the given NNVP JSON (string or object). KerasLayer
   * payloads are revived into live instances (same as D3Layer.loadJSON does)
   * so the parameter panels can keep calling setParameterValue on them.
   */
  restore(json) {
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
    this.restore(this.undoStack.pop());
    this.updateGraph();
  }

  redo() {
    if (this.redoStack.length <= 0) return;
    this.undoStack.push(this.toJSON());
    this.restore(this.redoStack.pop());
    this.updateGraph();
  }

  // --- Editing -------------------------------------------------------------

  addLayer(kerasLayer, posX, posY) {
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

  /** Catalog click drop point: center of the viewport, slightly staggered. */
  defaultDropPosition(count) {
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
  addEventHandlerDragOnHtmlClass(layer, htmlElement) {
    if (htmlElement.nnvpDragStart) {
      htmlElement.removeEventListener('dragstart', htmlElement.nnvpDragStart);
    }
    const onDragStart = () => { this.dragPayload = layer; };
    htmlElement.nnvpDragStart = onDragStart; // eslint-disable-line no-param-reassign
    htmlElement.setAttribute('draggable', 'true');
    htmlElement.addEventListener('dragstart', onDragStart);
  }

  /** Called by FlowBoard on drop; screen coords → flow coords → addLayer. */
  dropAt(clientX, clientY) {
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
  moveLayerTo(id, x, y) {
    const node = this.store.getNodes().find(candidate => candidate.id === String(id));
    if (!node) return;
    node.position = { x, y };
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

  clearBoard(skipPrompt) {
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

  uploadToBoard(uploadFileEvent) {
    if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
      alert("Your browser won't let you open this graph -- try upgrading your browser to the latest version of Chrome or Firefox.");
      return;
    }
    const uploadFile = uploadFileEvent.files[0];
    const filereader = new window.FileReader();
    filereader.onload = () => {
      // Validate the file BEFORE touching the board, so a bad file never
      // leaves the user in front of a silently wiped canvas.
      const splited = filereader.result.split(/\n(.+)/);
      if (splited[0] !== 'NNVP') {
        alert("This file doesn't seem to be an NNVP file.");
        return;
      }
      try {
        JSON.parse(splited[1]);
      } catch {
        alert("This NNVP file couldn't be read — it seems to be corrupted.");
        return;
      }
      this.saveState();
      try {
        this.restore(splited[1]);
        this.updateGraph();
      } catch (error) {
        console.error(error); // eslint-disable-line no-console
        this.undo();
        alert("This NNVP file couldn't be loaded — it seems to be corrupted.");
      }
    };
    filereader.readAsText(uploadFile);
  }

  loadTemplate(name) {
    this.saveState();
    this.restore(this.templates.get(name));
    this.updateGraph();
  }

  generatePythonInBrowser(kerasInterface) {
    saveAs(new Blob([kerasInterface.generatePython(this.toJSON())]), 'myModel.py');
  }

  generateJavascriptInBrowser(kerasInterface) {
    saveAs(new Blob([kerasInterface.generateJavascript(this.toJSON())]), 'myModel.js');
  }

  generatePyTorchInBrowser(kerasInterface) {
    saveAs(new Blob([kerasInterface.generatePyTorch(this.toJSON())]), 'myModel.py');
  }

  generateTinygradInBrowser(kerasInterface) {
    saveAs(new Blob([kerasInterface.generateTinygrad(this.toJSON())]), 'myModel.py');
  }

  generateJavascriptNoSave(kerasInterface) {
    return kerasInterface.generateJavascript(this.toJSON());
  }

  // --- Layer-like wrappers and the model shim --------------------------------

  findLayerById(id) {
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
    const inputsByTarget = new Map();
    edges.forEach((edge) => {
      const source = byId.get(edge.source);
      if (!source) return;
      if (!inputsByTarget.has(edge.target)) inputsByTarget.set(edge.target, []);
      inputsByTarget.get(edge.target).push(source.data.nnvp.id);
    });
    const previous = this.wrappers;
    this.wrappers = new Map();
    nodes.forEach((node) => {
      const { nnvp } = node.data;
      const wrapper = previous.get(node.id) || { inputLayers: [] };
      wrapper.id = nnvp.id;
      wrapper.name = nnvp.name;
      wrapper.class = node.type === COMPOSITE_NODE ? 'D3LayerComposite' : 'D3Layer';
      wrapper.kerasLayer = nnvp.kerasLayer || null;
      const inputs = inputsByTarget.get(node.id) || [];
      wrapper.inputLayers.splice(0, wrapper.inputLayers.length, ...inputs);
      this.wrappers.set(node.id, wrapper);
    });
    const layerName = node => (node.data.nnvp.kerasLayer ? node.data.nnvp.kerasLayer.name : null);
    const topLevel = nodes
      .filter(node => node.parentNode === undefined)
      .map(node => this.wrappers.get(node.id));
    this.model.d3Layers.splice(0, this.model.d3Layers.length, ...topLevel);
    this.model.d3Edges.splice(0, this.model.d3Edges.length, ...edges);
    const inputs = nodes
      .filter(node => layerName(node) === 'Input')
      .map(node => this.wrappers.get(node.id));
    this.model.modelInputs.splice(0, this.model.modelInputs.length, ...inputs);
    const outputs = edges
      .filter(edge => byId.get(edge.target) && layerName(byId.get(edge.target)) === 'Output')
      .map(edge => this.wrappers.get(edge.source))
      .filter(Boolean);
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
      .filter(wrapper => wrapper && wrapper.kerasLayer);
    this.selectedNodes.splice(0, this.selectedNodes.length, ...wrappers);
    this.notifySelectionChanged();
  }
}
