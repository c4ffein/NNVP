<template>
  <path :d="path" class="vue-flow__connection-path" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { getBezierPath } from '@vue-flow/core';
import type { Position } from '@vue-flow/core';
import { getEdgeParams } from './floatingEdge';
import type { FloatingNode } from './floatingEdge';

const props = defineProps({
  sourceNode: { type: Object as PropType<FloatingNode>, required: true },
  targetNode: { type: Object as PropType<FloatingNode | null>, default: null },
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
    // floatingEdge.ts is a pure module: its side names are the same string
    // literals as Vue Flow's Position enum values, hence the casts.
    sourcePosition: sourcePos as Position,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos as Position,
  })[0];
});
</script>
