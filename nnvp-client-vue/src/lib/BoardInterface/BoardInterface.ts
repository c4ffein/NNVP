// App-wide facade over the active graph editor: the components and the
// keyboard/assistant tools talk to the board exclusively through this class
// (installed as $boardInterface), which delegates to `activeGraph`.

import { migrateModel } from '../ModelFormat/migrations';
import type { LayerVizParams } from '../Viz3D/sceneBuild';
import type FlowGraphEditor from '../FlowInterface/FlowGraphEditor';
import type {
  CodeGenerator, KerasLayerInstance, LayerWrapper,
} from '../FlowInterface/FlowGraphEditor';
import type { NnvpLayerId, NnvpModel } from '../../types/model';

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
    // Only warn about unsaved data if graph is not empty
    // Future improvement: track dirty state (modified but not saved) instead of just checking emptiness
    window.onbeforeunload = () => {
      if (this.activeGraph && this.activeGraph.model.d3Layers.length > 0) {
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
    graphEditor.onGraphChanged(() => { this.emit('graph-changed'); });
    if (this.graphEditors.length === 1) this.setActiveGraphEditor(graphEditor);
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
    }
  }

  // Cloud save/load reuse the exact serialization the File > Save / Load uses:
  // `activeGraph.toJSON()` (i.e. model.toJSON) produces the string, and
  // `model.loadJSON` reads it back — the same pair `saveBoard`/`uploadToBoard` rely on.
  getGraphJSON(): string | null {
    if (this.activeGraph === null) return null;
    return this.activeGraph.toJSON();
  }

  loadGraphFromJSON(graphJSON: string | NnvpModel) {
    if (this.activeGraph === null) return;
    // Migrate BEFORE touching the board, so a model from a newer NNVP throws
    // the clear FormatVersionError (surfaced by the cloud panels' handleError)
    // instead of leaving the user in front of a wiped canvas.
    const migrated = migrateModel(graphJSON);
    this.activeGraph.saveState();
    this.activeGraph.clearBoard(true);
    this.activeGraph.model.loadJSON(migrated);
    this.activeGraph.updateGraph();
  }

  // Templates functions
  loadTemplate(name: string) {
    if (this.activeGraph !== null) {
      this.activeGraph.loadTemplate(name);
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
      layers: this.activeGraph.model.d3Layers.map(l => ({ id: l.id, type: l.type })),
      inputs: this.activeGraph.model.modelInputs,
      outputs: this.activeGraph.model.modelOutputs,
      edges: this.activeGraph.model.d3Edges.length,
      undoStack: this.undoStackContainer.e.length,
      redoStack: this.redoStackContainer.e.length,
    };
  }
}
