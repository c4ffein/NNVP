<template>
  <div class="flow-composite-node" :class="{ selected }">
    <div class="flow-composite-label">{{ data.label }}</div>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});
</script>

<style>
.flow-composite-node {
  width: 100%;
  height: 100%;
  border: 1px dashed var(--node-stroke);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-regular);
  font-size: 12px;
}
.flow-composite-node.selected {
  border-color: var(--accent);
}
.flow-composite-label {
  padding: 4px 8px;
}
</style>
