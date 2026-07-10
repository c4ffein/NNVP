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

<script setup>
import { computed } from 'vue';
import { BaseEdge, getBezierPath, useVueFlow } from '@vue-flow/core';
import { edgeInCycle } from '../../lib/FlowInterface/adapter';
import { getEdgeParams } from './floatingEdge';

const props = defineProps({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  sourceNode: { type: Object, required: true },
  targetNode: { type: Object, required: true },
  markerEnd: { type: String, default: undefined },
  style: { type: Object, default: undefined },
});

const { getEdges } = useVueFlow();

// Cyclic edges (only possible in graphs loaded from D3-made files) get the
// same error color as the D3 board's linkCycle marking.
const cyclic = computed(() => edgeInCycle(getEdges.value, { source: props.source, target: props.target }));

const path = computed(() => {
  // Nodes are measured after mount; skip the frame where dimensions are 0.
  if (!props.sourceNode.dimensions.width || !props.targetNode.dimensions.width) return null;
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(props.sourceNode, props.targetNode);
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
