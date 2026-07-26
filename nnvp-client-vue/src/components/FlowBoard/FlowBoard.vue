<template>
  <div id="FlowBoard" class="flow-board" @dragover.prevent @drop="onDrop">
    <!-- GeneralMenu's Load / ctrl+O go through BoardInterface.loadBoard(), which
         clicks this input by id. -->
    <input type="file" id="hidden-file-upload" accept=".nnvp,.keras" @change="onFileChosen" />
    <!-- Training indicator -->
    <div v-if="isTraining" class="training-indicator" data-testid="training-indicator">
      <div class="training-spinner"></div>
      <span>Training...</span>
    </div>
    <VueFlow
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :is-valid-connection="validConnection"
      :delete-key-code="null"
      :min-zoom="0.2"
      :max-zoom="4"
      :default-viewport="{ x: 244, y: 56, zoom: 1 }"
      @connect="onConnect"
      @node-drag-stop="commit"
      @nodes-delete="commit"
      @edges-delete="commit"
    >
      <template #connection-line="connectionLineProps">
        <FloatingConnectionLine v-bind="connectionLineProps" />
      </template>
      <!-- Border arrows pointing at layers outside the visible viewport;
           must live inside VueFlow to share its injected store. -->
      <OffscreenArrows />
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { markRaw, watch, getCurrentInstance, onMounted } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import type {
  Connection, Edge, EdgeComponent, EdgeTypesObject, Node, NodeComponent, NodeTypesObject,
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import {
  isInvalidConnection, LAYER_NODE, COMPOSITE_NODE,
} from '../../lib/FlowInterface/adapter';
import FlowGraphEditor from '../../lib/FlowInterface/FlowGraphEditor';
import type { FlowEdge, FlowNode } from '../../types/model';
import LayerNode from './LayerNode.vue';
import CompositeNode from './CompositeNode.vue';
import FloatingEdge from './FloatingEdge.vue';
import FloatingConnectionLine from './FloatingConnectionLine.vue';
import OffscreenArrows from './OffscreenArrows.vue';

defineProps({
  isTraining: { type: Boolean, default: false },
});

// The custom node/edge SFCs declare only the props they read, not Vue Flow's
// full NodeProps/EdgeProps surface — hence the casts.
const nodeTypes: NodeTypesObject = {
  [LAYER_NODE]: markRaw(LayerNode) as unknown as NodeComponent,
  [COMPOSITE_NODE]: markRaw(CompositeNode) as unknown as NodeComponent,
};

// Overriding the 'default' edge type makes every edge floating (they attach
// to the nearest border point instead of fixed handles) without the adapter
// or the model ever storing an edge type.
const edgeTypes: EdgeTypesObject = {
  default: markRaw(FloatingEdge) as unknown as EdgeComponent,
};

const {
  addEdges, setNodes, setEdges, getNodes, getEdges,
  getSelectedNodes, getSelectedEdges, screenToFlowCoordinate,
} = useVueFlow();

// The facade the rest of the app drives through $boardInterface. It only sees
// the Vue Flow store through this small adapter, keeping it unit-testable.
// Vue Flow's own store is the single source of truth — no v-model mirrors:
// with mirrored refs, wholesale edge replacement races edge validation
// against the not-yet-applied nodes (edges get dropped), and position
// mutations land on objects Vue Flow doesn't render. setNodes/setEdges
// update the internal store synchronously, in order.
// The facade speaks the structural FlowNode/FlowEdge slice of Vue Flow's
// graph types (types/model.ts keeps lib/ free of @vue-flow/core imports);
// the casts below bridge the two views of the same objects.
const editor = new FlowGraphEditor({
  getNodes: () => getNodes.value as unknown as FlowNode[],
  getEdges: () => getEdges.value as unknown as FlowEdge[],
  setGraph: (newNodes, newEdges) => {
    setNodes(newNodes as unknown as Node[]);
    setEdges(newEdges as unknown as Edge[]);
  },
  getSelectedNodes: () => getSelectedNodes.value as unknown as FlowNode[],
  getSelectedEdges: () => getSelectedEdges.value as unknown as FlowEdge[],
  screenToFlowCoordinate,
});

// This is the only board, so this editor registers first and becomes the
// active graph — no BoardInterface changes needed.
const boardInterface = getCurrentInstance()!.appContext.config.globalProperties.$boardInterface;
onMounted(() => boardInterface.addGraphEditor(editor));

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

// Re-validated edges carry an id on top of the Connection shape (see below).
function validConnection(connection: Connection & { id?: string }) {
  // Vue Flow ALSO runs this validator over every edge whenever the edge set
  // is replaced (setEdges re-validation). Those edges already carry an id and
  // must pass untouched — otherwise each existing edge is rejected as a
  // "duplicate" of itself. Only fresh interactive connections (no id yet)
  // are checked, and only for self-loops and duplicates: cycle-closing
  // connections are allowed (Phase D) — the loop renders red (edgeInCycle)
  // and codegen refuses the cyclic graph with a typed error instead.
  if (connection.id !== undefined) return true;
  return !isInvalidConnection(getEdges.value, connection.source, connection.target);
}

function onConnect(connection: Connection) {
  addEdges([{ ...connection }]);
  editor.commit();
}

function commit() {
  editor.commit();
}

function onDrop(event: DragEvent) {
  editor.dropAt(event.clientX, event.clientY);
}

function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files![0];
  if (file) editor.uploadToBoard(input);
  input.value = '';
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
/* Edges are drawn source -> target (see FloatingEdge.vue), so a forward
   dash-offset animation makes the dashes travel in the data-flow direction. */
.flow-board .vue-flow__edge-path {
  stroke: var(--edge-color);
  stroke-dasharray: 5 3;
  animation: flow-edge-dash 0.6s linear infinite;
}
@keyframes flow-edge-dash {
  from {
    stroke-dashoffset: 8;
  }
  to {
    stroke-dashoffset: 0;
  }
}
.flow-board .vue-flow__edge-path.flow-edge-cycle {
  stroke: var(--edge-error);
}
.flow-board .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: var(--edge-selected);
}
</style>
