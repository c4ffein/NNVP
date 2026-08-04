// App-wide facade over the active graph editor: the components and the
// keyboard/assistant tools talk to the board exclusively through this class
// (installed as $boardInterface), which delegates to `activeGraph`. Reads of
// the derived model go through the getLayers/getEdges/getModelInputs/
// getModelOutputs getters below — nothing outside this class and
// FlowGraphEditor touches `activeGraph.model` directly.

import { migrateModel } from '../ModelFormat/migrations';
import { appendCheckpoint } from '../Training/checkpoints';
import { modelIdentityOf } from '../Training/modelIdentity';
import type { LayerVizParams } from '../Viz3D/sceneBuild';
import type FlowGraphEditor from '../FlowInterface/FlowGraphEditor';
import type {
  CodeGenerator, KerasLayerInstance, LayerWrapper,
} from '../FlowInterface/FlowGraphEditor';
import type { FlowEdge, NnvpLayerId, NnvpModel } from '../../types/model';

/** Listener on the framework-agnostic event bus (on/off/emit). */
type BoardListener = (data?: unknown) => void;

/**
 * Handed out to components ONCE and captured BY REFERENCE: the container's
 * identity never changes. Switching the active graph reassigns `.e` to that
 * graph's arrays, which are themselves only ever mutated in place — so a
 * component re-reading `container.e` always sees live data.
 */
export interface Container<T> { e: T[] }

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types.
type ImportMetaWithEnv = ImportMeta & { env?: { DEV?: boolean } };

// Dev-only debug handle, shared with main.js and TrainingZone.
type DebugWindow = Window & { nnvp?: { debug?: Record<string, unknown> } };

// Shared frozen fallbacks for the read getters when no graph is active yet.
const EMPTY_LAYERS: readonly LayerWrapper[] = Object.freeze([]);
const EMPTY_EDGES: readonly FlowEdge[] = Object.freeze([]);

export default class BoardInterface {
  graphEditors: FlowGraphEditor[];
  activeGraph: FlowGraphEditor | null;
  activeElementsContainer: Container<LayerWrapper>;
  undoStackContainer: Container<string>;
  redoStackContainer: Container<string>;
  templateIdsContainer: Container<string>;
  leftBarRemountCallback: () => unknown;
  listeners: Record<string, BoardListener[]>;
  /** Inspect mode: latest per-layer activation snapshot (null when cleared). */
  inspectionState: unknown;
  /** 3D view: per-layer display overrides (channel window, slice layout). */
  layerVizParams: Record<string, LayerVizParams>;
  /**
   * Lineage (Phase G2): the docHash of the state this editing session
   * evolved from — set by loads/checkpoints, null after New. Stamped as
   * `parent` into graph.checkpoint and run.started events (a recorded fact,
   * content-addressed so forks converge across devices).
   */
  lineageParent: string | null;
  /** Any graph change since the last checkpoint/load (the unload warning). */
  dirtySinceCheckpoint: boolean;

  constructor() {
    this.graphEditors = [];
    this.activeGraph = null;
    this.activeElementsContainer = { e: [] };
    this.undoStackContainer = { e: [] };
    this.redoStackContainer = { e: [] };
    this.templateIdsContainer = { e: [] };
    this.leftBarRemountCallback = () => false;
    // Event listeners for reactive updates
    this.listeners = {};
    // Inspect mode: latest per-layer activation snapshot (null when cleared).
    this.inspectionState = null;
    // 3D view: per-layer display overrides, set from the 3D layer panel.
    this.layerVizParams = {};
    this.lineageParent = null;
    this.dirtySinceCheckpoint = false;
    // Warn only when there are edits no checkpoint/load has pinned (Phase G2
    // — the real dirty state the old emptiness check stood in for).
    window.onbeforeunload = () => {
      if (this.dirtySinceCheckpoint && this.getLayers().length > 0) {
        return 'Warning : all unsaved data will be lost';
      }
      // Return undefined to allow navigation without warning
      return undefined;
    };
  }

  // Event system for framework-agnostic reactivity
  on(event: string, callback: BoardListener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string, callback: BoardListener) {
    const callbacks = this.listeners[event];
    if (!callbacks) return;
    this.listeners[event] = callbacks.filter(cb => cb !== callback);
  }

  emit(event: string, data?: unknown) {
    const callbacks = this.listeners[event];
    if (!callbacks) return;
    callbacks.forEach(callback => callback(data));
  }

  // Inspect mode: publish (or clear, with null) the per-layer activation data
  // produced by lib/Inspector. Kept on the facade so LayerNodes mounted after
  // an inspection ran still pick it up, and cleared/updated through ONE event.
  setInspection(data: unknown) {
    this.inspectionState = data || null;
    this.emit('inspection-changed', this.inspectionState);
  }

  getInspection(): unknown {
    return this.inspectionState;
  }

  // 3D view: merge one layer's display overrides (channel window, slice
  // layout) and notify — the 3D window rebuilds its scene, the Inspect panel
  // re-probes with the new channel offsets. Kept on the facade so both sides
  // read the same state whichever one changed it.
  setLayerVizParams(layerId: string, params: LayerVizParams | null) {
    if (params === null) delete this.layerVizParams[layerId];
    else this.layerVizParams[layerId] = { ...this.layerVizParams[layerId], ...params };
    this.emit('viz-params-changed', this.layerVizParams);
  }

  getLayerVizParams(): Record<string, LayerVizParams> {
    return this.layerVizParams;
  }

  // Find the layer corresponding to the id on the active graph
  findLayerById(id: NnvpLayerId): LayerWrapper | null {
    return this.activeGraph!.findLayerById(id);
  }

  // --- Typed read views of the derived model ---------------------------------
  //
  // These return the active graph's LIVE arrays by reference (they are only
  // ever mutated in place — see the contract in FlowGraphEditor.ts), typed
  // readonly so callers can watch them but never mutate. When no graph is
  // active they return a frozen empty array: re-call the getter per read
  // rather than caching the result across graph activation.

  getLayers(): readonly LayerWrapper[] {
    return this.activeGraph === null ? EMPTY_LAYERS : this.activeGraph.model.layers;
  }

  getEdges(): readonly FlowEdge[] {
    return this.activeGraph === null ? EMPTY_EDGES : this.activeGraph.model.edges;
  }

  getModelInputs(): readonly LayerWrapper[] {
    return this.activeGraph === null ? EMPTY_LAYERS : this.activeGraph.model.modelInputs;
  }

  getModelOutputs(): readonly LayerWrapper[] {
    return this.activeGraph === null ? EMPTY_LAYERS : this.activeGraph.model.modelOutputs;
  }

  setActiveGraphEditor(graphEditor: FlowGraphEditor) {
    this.activeGraph = graphEditor;
    this.activeElementsContainer.e = this.activeGraph.selectedNodes;
    this.undoStackContainer.e = this.activeGraph.undoStack;
    this.redoStackContainer.e = this.activeGraph.redoStack;
    this.templateIdsContainer.e = this.activeGraph.templates.list();
    this.leftBarRemountCallback();
    // Emit events for reactive updates
    this.emit('templates-changed');
    this.emit('selection-changed');
    this.emit('undo-stack-changed');
    this.emit('redo-stack-changed');
    // Expose the active graph for the e2e tests and manual debugging — dev
    // builds only (import.meta.env is absent under bun/unit tests).
    if ((import.meta as ImportMetaWithEnv).env?.DEV) {
      const debugWindow = window as DebugWindow;
      debugWindow.nnvp = debugWindow.nnvp || {};
      debugWindow.nnvp.debug = debugWindow.nnvp.debug || {};
      debugWindow.nnvp.debug.graphEditor = this.activeGraph;
    }
  }

  getActiveElementsContainer(): Container<LayerWrapper> {
    return this.activeElementsContainer;
  }

  getUndoStackContainer(): Container<string> {
    return this.undoStackContainer;
  }

  getRedoStackContainer(): Container<string> {
    return this.redoStackContainer;
  }

  getActiveElements(): LayerWrapper[] | null {
    if (this.activeGraph !== null) {
      return this.activeGraph.selectedNodes;
    }
    return null;
  }

  deleteSelectedElements() {
    if (this.activeGraph !== null) {
      this.activeGraph.deleteSelectedElements();
    }
  }

  addGraphEditor(graphEditor: FlowGraphEditor) {
    this.graphEditors.push(graphEditor);
    graphEditor.onSelectionChanged(() => { this.emit('selection-changed'); });
    graphEditor.onGraphChanged(() => {
      this.dirtySinceCheckpoint = true;
      this.emit('graph-changed');
    });
    if (this.graphEditors.length === 1) this.setActiveGraphEditor(graphEditor);
  }

  // --- Checkpoints and lineage (Phase G2) ------------------------------------

  getLineageParent(): string | null {
    return this.lineageParent;
  }

  isDirty(): boolean {
    return this.dirtySinceCheckpoint;
  }

  /**
   * Pin the current board as a graph.checkpoint event, parented on the state
   * this session evolved from. Deduped by identity: when the board's docHash
   * equals the lineage parent nothing changed, so nothing is appended.
   * Returns null when there is no board (or an unusable snapshot).
   */
  async checkpoint(): Promise<{ appended: boolean; docHash: string } | null> {
    // An empty board is not a state worth pinning ("unnamed model" nodes).
    if (this.getLayers().length === 0) return null;
    const graphJson = this.getGraphJSON();
    if (graphJson === null) return null;
    const identity = await modelIdentityOf(graphJson);
    if (identity === null) return null;
    if (identity.docHash === this.lineageParent) {
      this.dirtySinceCheckpoint = false; // verified: nothing changed
      return { appended: false, docHash: identity.docHash };
    }
    await appendCheckpoint(graphJson, this.lineageParent);
    this.lineageParent = identity.docHash;
    this.dirtySinceCheckpoint = false;
    return { appended: true, docHash: identity.docHash };
  }

  /** Loads re-enter the lineage tree: parent = the loaded state's identity. */
  private async refreshLineageFromBoard(): Promise<void> {
    const graphJson = this.getGraphJSON();
    const identity = graphJson === null ? null : await modelIdentityOf(graphJson);
    this.lineageParent = identity === null ? null : identity.docHash;
    this.dirtySinceCheckpoint = false;
  }

  addLayer(kerasLayer: KerasLayerInstance) {
    if (this.activeGraph !== null) {
      this.activeGraph.addLayer(kerasLayer);
    }
  }

  connectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId): boolean {
    if (this.activeGraph === null) return false;
    return this.activeGraph.connectLayers(sourceId, targetId);
  }

  disconnectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId): boolean {
    if (this.activeGraph === null) return false;
    return this.activeGraph.disconnectLayers(sourceId, targetId);
  }

  /** Set (blank text: clear) a layer's free-text comment; one undoable step. */
  setLayerComment(id: NnvpLayerId, comment: string): boolean {
    if (this.activeGraph === null) return false;
    return this.activeGraph.setLayerComment(id, comment);
  }

  setLeftBarRemountCallback(func: () => unknown) {
    this.leftBarRemountCallback = func;
  }

  addEventHandlerDragOnHtmlClass(layer: KerasLayerInstance, element: HTMLElement) {
    if (this.activeGraph !== null) {
      this.activeGraph.addEventHandlerDragOnHtmlClass(layer, element);
    }
  }

  // Undo and Redo
  undo() {
    if (this.activeGraph !== null) {
      this.activeGraph.undo();
    }
  }

  redo() {
    if (this.activeGraph !== null) {
      this.activeGraph.redo();
    }
  }

  // Group layers
  createGroup() {
    if (this.activeGraph !== null) {
      this.activeGraph.model.createComposite();
    }
  }

  // Re-lay the whole board with the layered auto-layout
  autoLayout() {
    if (this.activeGraph !== null) {
      this.activeGraph.autoLayout();
    }
  }

  // Menu functions
  saveBoard() {
    if (this.activeGraph !== null) {
      this.activeGraph.saveBoard();
    }
  }

  generatePython(kerasInterface: CodeGenerator) { // Will act accordingly to setup on later versions
    if (this.activeGraph !== null) {
      this.activeGraph.generatePythonInBrowser(kerasInterface);
    }
  }

  generatePythonInBrowser(kerasInterface: CodeGenerator) {
    if (this.activeGraph !== null) {
      this.activeGraph.generatePythonInBrowser(kerasInterface);
    }
  }

  generateJavascriptInBrowser(kerasInterface: CodeGenerator) {
    if (this.activeGraph !== null) {
      this.activeGraph.generateJavascriptInBrowser(kerasInterface);
    }
  }

  generatePyTorchInBrowser(kerasInterface: CodeGenerator) {
    if (this.activeGraph !== null) {
      this.activeGraph.generatePyTorchInBrowser(kerasInterface);
    }
  }

  generateTinygradInBrowser(kerasInterface: CodeGenerator) {
    if (this.activeGraph !== null) {
      this.activeGraph.generateTinygradInBrowser(kerasInterface);
    }
  }

  generateJavascriptNoSave(kerasInterface: CodeGenerator): string | null {
    if (this.activeGraph !== null) {
      return this.activeGraph.generateJavascriptNoSave(kerasInterface);
    }
    return null;
  }

  generateTinygradNoSave(kerasInterface: CodeGenerator): string | null {
    if (this.activeGraph !== null) {
      return this.activeGraph.generateTinygradNoSave(kerasInterface);
    }
    return null;
  }

  loadBoard() {
    if (this.activeGraph !== null) {
      document.getElementById('hidden-file-upload')!.click();
    }
  }

  // d3.select("#hidden-file-upload").on("change", function (d) {
  //  let uploadFileEvent = this;
  //  whiteboard.activeGraph.uploadToBoard(uploadFileEvent);
  // });
  clearBoard() {
    if (this.activeGraph !== null) {
      this.activeGraph.clearBoard(false);
      // File > New starts a fresh lineage root (whether or not the user
      // confirmed, an empty board carries nothing worth warning about).
      if (this.getLayers().length === 0) {
        this.lineageParent = null;
        this.dirtySinceCheckpoint = false;
      }
    }
  }

  // Cloud save/load reuse the exact serialization the File > Save / Load uses:
  // `activeGraph.toJSON()` (i.e. model.toJSON) produces the string, and
  // `model.loadJSON` reads it back — the same pair `saveBoard`/`uploadToBoard` rely on.
  getGraphJSON(): string | null {
    if (this.activeGraph === null) return null;
    return this.activeGraph.toJSON();
  }

  async loadGraphFromJSON(graphJSON: string | NnvpModel): Promise<void> {
    if (this.activeGraph === null) return;
    // Migrate BEFORE touching the board, so a model from a newer NNVP throws
    // the clear FormatVersionError (surfaced by the cloud panels' handleError)
    // instead of leaving the user in front of a wiped canvas.
    const migrated = migrateModel(graphJSON);
    this.activeGraph.saveState();
    this.activeGraph.clearBoard(true);
    this.activeGraph.model.loadJSON(migrated);
    this.activeGraph.updateGraph();
    // A loaded state re-enters the lineage tree (Phase G2). Callers that
    // don't care may ignore the promise — the board itself is already live.
    await this.refreshLineageFromBoard();
  }

  // Templates functions
  loadTemplate(name: string) {
    if (this.activeGraph !== null) {
      this.activeGraph.loadTemplate(name);
      // Templates are known states too — their lineage converges by content.
      void this.refreshLineageFromBoard();
    }
  }

  getTemplatesContainer(): Container<string> {
    return this.templateIdsContainer;
  }

  // Debug function to get current board state
  debugGetBoardState() {
    if (!this.activeGraph || !this.activeGraph.model) {
      return {
        layers: [],
        inputs: [],
        outputs: [],
        edges: [],
        undoStack: this.undoStackContainer.e.length,
        redoStack: this.redoStackContainer.e.length,
      };
    }
    return {
      layers: this.activeGraph.model.layers.map(l => ({ id: l.id, type: l.type })),
      inputs: this.activeGraph.model.modelInputs,
      outputs: this.activeGraph.model.modelOutputs,
      edges: this.activeGraph.model.edges.length,
      undoStack: this.undoStackContainer.e.length,
      redoStack: this.redoStackContainer.e.length,
    };
  }
}
