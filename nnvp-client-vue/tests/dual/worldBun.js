/**
 * The BUN world for dual-mode tests (see tests/dual/define.js): the real
 * FlowGraphEditor over the same tiny store adapter FlowBoard injects (see
 * flowGraphEditor.test.js) plus the real KerasInterface catalog — no browser,
 * no vite. Where a test needs something the BOARD normally does (connecting
 * edges), the world replicates the board's exact contract
 * (FlowBoard.validConnection / onConnect). Component-backed helpers mount
 * real SFCs via tests/vue-loader.js when they land.
 */
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import { isInvalidConnection } from '../../src/lib/FlowInterface/adapter';
import KerasInterface from '../../src/lib/KerasInterface/KerasInterface';
import generatedKerasLayers from '../../src/lib/KerasInterface/generatedKerasLayers.json';
import { makeChatDriver } from './worldComponents';

// Commits are coalesced per microtask (FlowGraphEditor.commit); every
// mutating driver method drains them so assertions observe committed state.
const flush = () => new Promise((resolve) => { queueMicrotask(() => queueMicrotask(resolve)); });

export function makeBoardDriver() {
  const state = {
    nodes: [], edges: [], selectedNodes: [], selectedEdges: [],
  };
  const store = {
    state,
    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    setGraph: (nodes, edges) => {
      state.nodes = nodes;
      state.edges = edges;
    },
    getSelectedNodes: () => state.selectedNodes,
    getSelectedEdges: () => state.selectedEdges,
  };
  const editor = new FlowGraphEditor(store);
  const catalog = new KerasInterface(generatedKerasLayers).getLayerList();

  return {
    editor,
    store,

    async addLayer(name) {
      if (!catalog[name]) throw new Error(`no such catalog layer: ${name}`);
      editor.addLayer(catalog[name].clone());
      await flush();
    },

    // The board's connection contract: validate, append, commit.
    async connect(sourceIndex, targetIndex) {
      const nodes = store.getNodes();
      const source = nodes[sourceIndex].id;
      const target = nodes[targetIndex].id;
      const edges = store.getEdges();
      if (isInvalidConnection(edges, source, target)) return; // refused, like the UI
      store.setGraph(nodes, [...edges, { id: `e${source}-${target}`, source, target }]);
      editor.commit();
      await flush();
    },

    async select(index) {
      state.selectedNodes = [state.nodes[index]];
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

    async loadTemplate(name) {
      editor.loadTemplate(name);
      await flush();
    },

    async clearBoard() {
      editor.clearBoard(true);
      await flush();
    },

    async moveLayer(id, x, y) {
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

    async graphJSON() {
      return editor.toJSON();
    },

    async loadJSON(json) {
      editor.model.loadJSON(json);
      editor.updateGraph();
      await flush();
    },
  };
}

/** The world handed to appTest fns under bun. */
export function makeBunWorld(expect) {
  const chat = makeChatDriver();
  return {
    expect,
    board: makeBoardDriver(),
    chat,
    async dispose() {
      await chat.teardown();
    },
  };
}
