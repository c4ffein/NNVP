<template>
  <BaseEdge
    v-if="path"
    :id="id"
    :path="path"
    :class="{ 'flow-edge-cycle': cyclic }"
    :marker-end="markerEnd"
    :style="style"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties, PropType } from 'vue';
import { BaseEdge, getBezierPath, useVueFlow } from '@vue-flow/core';
import type { Position } from '@vue-flow/core';
import { edgeInCycle } from '../../lib/FlowInterface/adapter';
import { getEdgeParams } from './floatingEdge';
import type { FloatingNode } from './floatingEdge';

const props = defineProps({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  sourceNode: { type: Object as PropType<FloatingNode>, required: true },
  targetNode: { type: Object as PropType<FloatingNode>, required: true },
  markerEnd: { type: String, default: undefined },
  style: { type: Object as PropType<CSSProperties>, default: undefined },
});

const { getEdges } = useVueFlow();

// Cyclic edges (freshly drawn loops — allowed since Phase D — or graphs
// loaded from D3-made files) get the same error color as the D3 board's
// linkCycle marking. Live derived query, recomputed per render.
const cyclic = computed(() => edgeInCycle(getEdges.value, { source: props.source, target: props.target }));

const path = computed(() => {
  // Nodes are measured after mount; skip the frame where dimensions are 0.
  if (!props.sourceNode.dimensions.width || !props.targetNode.dimensions.width) return null;
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(props.sourceNode, props.targetNode);
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
