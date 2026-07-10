<template>
  <div class="flow-layer-node" :class="{ selected }">
    <Handle id="t-left" type="target" :position="Position.Left" />
    <span class="flow-layer-label">{{ data.label }}</span>
    <Handle id="s-right" type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core';

defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});
</script>

<style>
.flow-layer-node {
  min-width: 90px;
  padding: 10px 14px;
  background: var(--node-fill);
  border: 1px solid var(--node-stroke);
  border-radius: 6px;
  color: var(--node-text);
  font-family: var(--font-regular);
  font-size: 14px;
  text-align: center;
}
.flow-layer-node.selected {
  background: var(--node-selected-fill);
}
.flow-layer-node .vue-flow__handle {
  width: 8px;
  height: 8px;
  background: var(--node-stroke);
  border: none;
  /* Edges float to the nearest border point (see FloatingEdge.vue), so the
     dots are connection grips, not anchors: show them on hover only, and keep
     them click-transparent otherwise or they swallow clicks on short edges
     between adjacent nodes. Dragging a connection still starts from a dot
     (the node is hovered then), and drops snap by connectionRadius, which
     uses Vue Flow's handle bounds, not DOM hit-testing. */
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.vue-flow__node:hover .flow-layer-node .vue-flow__handle,
.vue-flow__node.selected .flow-layer-node .vue-flow__handle {
  opacity: 1;
  pointer-events: all;
}
/* Sit the dots fully INSIDE the border (Vue Flow centers them on it): a dot
   straddling the border has its center outside the node, so grabbing it
   would not count as hovering the node and the hover rule above would never
   re-enable its pointer events. */
.flow-layer-node .vue-flow__handle-left {
  left: 3px;
  transform: translate(0, -50%);
}
.flow-layer-node .vue-flow__handle-right {
  right: 3px;
  transform: translate(0, -50%);
}
</style>
