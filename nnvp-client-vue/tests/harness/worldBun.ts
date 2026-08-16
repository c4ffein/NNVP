/**
 * The BUN world for dual-mode tests (see tests/harness/define.ts): the real
 * FlowGraphEditor over the same tiny store adapter FlowBoard injects (see
 * flowGraphEditor.test.js) plus the real KerasInterface catalog — no browser,
 * no vite. Where a test needs something the BOARD normally does (connecting
 * edges), the world replicates the board's exact contract
 * (FlowBoard.validConnection / onConnect). Component-backed helpers mount
 * real SFCs via tests/harness/vue-loader.ts when they land.
 */
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import { isInvalidConnection } from '../../src/lib/FlowInterface/adapter';
import KerasInterface from '../../src/lib/KerasInterface/KerasInterface';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import generatedKerasLayers from '../../src/lib/KerasInterface/generatedKerasLayers.json';
import { installAppServices } from '../../src/lib/appServices';
import {
  makeBackendDriver, makeChatDriver, makeCatalogDriver, makeHistoryDriver, makeModelsDriver,
  makeRecordsDriver, makeChartsDriver, makeTrainingDriver, makeWindowsDriver,
} from './worldComponents';
import type {
  FlowEdge, FlowNode, KerasLayerCatalog, NnvpLayerId, NnvpModel,
} from '../../src/types/model';
import type { Expect, World } from './define';

// Commits are coalesced per microtask (FlowGraphEditor.commit); every
// mutating driver method drains them so assertions observe committed state.
const flush = () => new Promise((resolve) => { queueMicrotask(() => queueMicrotask(() => resolve(undefined))); });

export function makeBoardDriver() {
  const state: {
    nodes: FlowNode[]; edges: FlowEdge[]; selectedNodes: FlowNode[]; selectedEdges: FlowEdge[];
  } = {
    nodes: [], edges: [], selectedNodes: [], selectedEdges: [],
  };
  const store = {
    state,
    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    setGraph: (nodes: FlowNode[], edges: FlowEdge[]) => {
      state.nodes = nodes;
      state.edges = edges;
    },
    getSelectedNodes: () => state.selectedNodes,
    getSelectedEdges: () => state.selectedEdges,
  };
  const editor = new FlowGraphEditor(store);
  const catalog = new KerasInterface(generatedKerasLayers as KerasLayerCatalog).getLayerList();

  return {
    editor,
    store,

    async addLayer(name: string) {
      if (!catalog[name]) throw new Error(`no such catalog layer: ${name}`);
      editor.addLayer(catalog[name].clone());
      await flush();
    },

    // The board's connection contract: validate, append, commit.
    async connect(sourceIndex: number, targetIndex: number) {
      const nodes = store.getNodes();
      const source = nodes[sourceIndex]!.id;
      const target = nodes[targetIndex]!.id;
      const edges = store.getEdges();
      if (isInvalidConnection(edges, source, target)) return; // refused, like the UI
      store.setGraph(nodes, [...edges, { id: `e${source}-${target}`, source, target }]);
      editor.commit();
      await flush();
    },

    async select(index: number) {
      state.selectedNodes = [state.nodes[index]!];
      state.selectedEdges = [];
      editor.syncSelection();
      await flush();
    },

    async deleteSelected() {
      editor.deleteSelectedElements();
      await flush();
    },

    async undo() {
      editor.undo();
      await flush();
    },

    async redo() {
      editor.redo();
      await flush();
    },

    async loadTemplate(name: string) {
      editor.loadTemplate(name);
      await flush();
    },

    async clearBoard() {
      editor.clearBoard(true);
      await flush();
    },

    async moveLayer(id: NnvpLayerId, x: number, y: number) {
      editor.moveLayerTo(String(id), x, y);
      await flush();
    },

    async layerCount() {
      return store.getNodes().filter(node => node.type !== 'composite').length;
    },

    async edgeCount() {
      return store.getEdges().length;
    },

    async layerLabels() {
      return store.getNodes().map(node => node.data.label);
    },

    async setComment(index: number, text: string) {
      editor.setLayerComment(state.nodes[index]!.data.nnvp.id, text);
      await flush();
    },

    async comment(index: number) {
      return state.nodes[index]!.data.nnvp.comment ?? '';
    },

    async graphJSON() {
      return editor.toJSON();
    },

    async loadJSON(json: string | NnvpModel) {
      editor.model.loadJSON(json);
      editor.updateGraph();
      await flush();
    },
  };
}

/** The world handed to appTest fns under bun. */
export function makeBunWorld(expect: Expect): World {
  const chat = makeChatDriver();
  const catalog = makeCatalogDriver();
  const windows = makeWindowsDriver();
  const charts = makeChartsDriver();
  const board = makeBoardDriver();
  // The Training window's Inspect tab (weights import) builds a fresh model
  // of THIS board's graph — the seam replicates BoardInterface's two verbs.
  const training = makeTrainingDriver({
    on() {},
    off() {},
    setInspection() {},
    getGraphJSON: () => board.editor.toJSON(),
    generateJavascriptNoSave: () => new KerasGenerator(JSON.parse(board.editor.toJSON()) as NnvpModel).generateJavascriptFromGraph(),
  });
  // A history Restore must land on the SAME board the suite asserts through —
  // the seam replicates worldBun's own loadJSON contract.
  const boardSeam = {
    loadGraphFromJSON(json: string) {
      board.editor.model.loadJSON(json);
      board.editor.updateGraph();
    },
  };
  const history = makeHistoryDriver(boardSeam);
  // The Models window restores through the same seam — one board to assert on.
  const models = makeModelsDriver(boardSeam);
  const records = makeRecordsDriver();
  const backend = makeBackendDriver();
  // The REAL app service wiring (main.ts calls the same function): sync-on-auth
  // over the world's store singleton and the backend driver's fetch shim. This
  // is what makes chat.setSignedIn(true) trigger an actual sync, like the app.
  const uninstallServices = installAppServices();
  return {
    expect,
    board,
    chat,
    catalog,
    windows,
    charts,
    training,
    history,
    models,
    records,
    backend,
    async dispose() {
      uninstallServices();
      await chat.teardown();
      await catalog.teardown();
      await windows.teardown();
      await charts.teardown();
      await training.teardown();
      await history.teardown();
      await models.teardown();
      await records.teardown();
      await backend.teardown();
    },
  };
}
