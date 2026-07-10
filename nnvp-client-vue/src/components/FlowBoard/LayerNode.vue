<template>
  <div class="flow-layer-node" :class="{ selected }">
    <Handle id="t-top" type="target" :position="Position.Top" />
    <Handle id="t-left" type="target" :position="Position.Left" />
    <span class="flow-layer-label">{{ data.label }}</span>
    <Handle id="s-right" type="source" :position="Position.Right" />
    <Handle id="s-bottom" type="source" :position="Position.Bottom" />
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
}
</style>
