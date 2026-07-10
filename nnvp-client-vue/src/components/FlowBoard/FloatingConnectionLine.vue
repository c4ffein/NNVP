<template>
  <path :d="path" class="vue-flow__connection-path" />
</template>

<script setup>
import { computed } from 'vue';
import { getBezierPath } from '@vue-flow/core';
import { getEdgeParams } from './floatingEdge';

const props = defineProps({
  sourceNode: { type: Object, required: true },
  targetNode: { type: Object, default: null },
  targetX: { type: Number, required: true },
  targetY: { type: Number, required: true },
});

const path = computed(() => {
  // While dragging, float from the source node's border toward the cursor —
  // or toward the hovered node's border, matching the final edge. The cursor
  // is modeled as a zero-size node (getEdgeParams falls back to its center).
  const target = props.targetNode || {
    computedPosition: { x: props.targetX, y: props.targetY },
    dimensions: { width: 0, height: 0 },
  };
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(props.sourceNode, target);
  return getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  })[0];
});
</script>
