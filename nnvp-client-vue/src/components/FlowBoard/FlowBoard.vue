<template>
  <div id="FlowBoard" class="flow-board" @dragover.prevent @drop="onDrop">
    <!-- GeneralMenu's Load / ctrl+O go through D3Interface.loadBoard(), which
         clicks this input by id (same contract as WhiteBoard). -->
    <input type="file" id="hidden-file-upload" accept=".nnvp" @change="onFileChosen" />
    <!-- Training indicator (same markup/testid as WhiteBoard's) -->
    <div v-if="isTraining" class="training-indicator" data-testid="training-indicator">
      <div class="training-spinner"></div>
      <span>Training...</span>
    </div>
    <VueFlow
      :node-types="nodeTypes"
      :is-valid-connection="validConnection"
      :delete-key-code="null"
      :min-zoom="0.2"
      :max-zoom="4"
      :default-viewport="{ x: 244, y: 56, zoom: 1 }"
      @connect="onConnect"
      @node-drag-stop="commit"
      @nodes-delete="commit"
      @edges-delete="commit"
    />
  </div>
</template>

<script setup>
import { markRaw, watch, getCurrentInstance, onMounted } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import {
  isInvalidConnection, LAYER_NODE, COMPOSITE_NODE,
} from '../../lib/FlowInterface/adapter';
import FlowGraphEditor from '../../lib/FlowInterface/FlowGraphEditor';
import LayerNode from './LayerNode.vue';
import CompositeNode from './CompositeNode.vue';

defineProps({
  isTraining: { type: Boolean, default: false },
});

const nodeTypes = {
  [LAYER_NODE]: markRaw(LayerNode),
  [COMPOSITE_NODE]: markRaw(CompositeNode),
};

const {
  addEdges, setNodes, setEdges, getNodes, getEdges,
  getSelectedNodes, getSelectedEdges, screenToFlowCoordinate,
} = useVueFlow();

// The facade the rest of the app drives through $d3Interface. It only sees
// the Vue Flow store through this small adapter, keeping it unit-testable.
// Vue Flow's own store is the single source of truth — no v-model mirrors:
// with mirrored refs, wholesale edge replacement races edge validation
// against the not-yet-applied nodes (edges get dropped), and position
// mutations land on objects Vue Flow doesn't render. setNodes/setEdges
// update the internal store synchronously, in order.
const editor = new FlowGraphEditor({
  getNodes: () => getNodes.value,
  getEdges: () => getEdges.value,
  setGraph: (newNodes, newEdges) => {
    setNodes(newNodes);
    setEdges(newEdges);
  },
  getSelectedNodes: () => getSelectedNodes.value,
  getSelectedEdges: () => getSelectedEdges.value,
  screenToFlowCoordinate,
});

// WhiteBoard doesn't mount in flow mode, so this editor registers first and
// becomes the active graph — no D3Interface changes needed.
const d3Interface = getCurrentInstance().appContext.config.globalProperties.$d3Interface;
onMounted(() => d3Interface.addGraphEditor(editor));

watch(getSelectedNodes, () => editor.syncSelection());

// Keyboard (delete/undo/redo/...) is handled by the global KeyboardListener
// through the facade, so Vue Flow's own delete handling is disabled above —
// it would bypass the facade's undo snapshot and composite-children cleanup.
//
// The default viewport mirrors the D3 board's initial transform (LayerCatalog
// width + margins, GeneralMenu height + margins) so board coordinate (0,0) —
// where templates and saved graphs place their first nodes — starts visible,
// clear of the floating panels. fitViewOnInit would instead zoom onto the
// first nodes added to the empty board and skew every coordinate after that.

function validConnection(connection) {
  // Vue Flow ALSO runs this validator over every edge whenever the edge set
  // is replaced (setEdges re-validation). Those edges already carry an id and
  // must pass untouched — otherwise each existing edge is rejected as a
  // "duplicate" of itself, and reloaded graphs keep D3 parity (a cyclic saved
  // graph loads instead of silently losing edges). Only fresh interactive
  // connections (no id yet) are checked.
  if (connection.id !== undefined) return true;
  return !isInvalidConnection(getEdges.value, connection.source, connection.target);
}

function onConnect(connection) {
  addEdges([{ ...connection }]);
  editor.commit();
}

function commit() {
  editor.commit();
}

function onDrop(event) {
  editor.dropAt(event.clientX, event.clientY);
}

function onFileChosen(event) {
  const file = event.target.files[0];
  if (file) editor.uploadToBoard(event.target);
  event.target.value = '';
}
</script>

<style>
.flow-board {
  width: 100%;
  height: 100%;
  background: var(--canvas-board);
}
.flow-board #hidden-file-upload {
  display: none;
}
.flow-board .training-indicator {
  position: absolute;
  top: 60px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(76, 175, 80, 0.95);
  color: white;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 50;
}
.training-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: flow-spin 0.8s linear infinite;
}
@keyframes flow-spin {
  to {
    transform: rotate(360deg);
  }
}
.flow-board .vue-flow__edge-path {
  stroke: var(--edge-color);
}
.flow-board .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: var(--edge-selected);
}
</style>
